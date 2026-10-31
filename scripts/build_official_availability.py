#!/usr/bin/env python3
"""Point-in-time NBA official roster and injury evidence builder.

Fetches NBA.com TEAM roster pages (official NBA player IDs) and the latest
NBA official injury PDF issued no later than the requested cutoff. Fail closed.
Neither this script nor this feed changes the production winner forecast.
"""
import argparse
from datetime import datetime, timezone, timedelta
import hashlib
from html import unescape
from html.parser import HTMLParser
import io
import json
import os
from pathlib import Path
import re
import sys
import unicodedata
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/"data"/"availability-current.json"
NBA_REPORT_PAGE="https://official.nba.com/nba-injury-report-2026-27-season/"
NBA_REPORT_HOST="https://ak-static.cms.nba.com/referee/injury/"
TEAM_IDS={
 "ATL":1610612737,"BOS":1610612738,"BKN":1610612751,"CHA":1610612766,
 "CHI":1610612741,"CLE":1610612739,"DAL":1610612742,"DEN":1610612743,
 "DET":1610612765,"GSW":1610612744,"HOU":1610612745,"IND":1610612754,
 "LAC":1610612746,"LAL":1610612747,"MEM":1610612763,"MIA":1610612748,
 "MIL":1610612749,"MIN":1610612750,"NOP":1610612740,"NYK":1610612752,
 "OKC":1610612760,"ORL":1610612753,"PHI":1610612755,"PHX":1610612756,
 "POR":1610612757,"SAC":1610612758,"SAS":1610612759,"TOR":1610612761,
 "UTA":1610612762,"WAS":1610612764
}
ALIASES={"GS":"GSW","WSH":"WAS","NY":"NYK","SA":"SAS","NO":"NOP","PHO":"PHX","BRK":"BKN","CHO":"CHA"}
STATUS={"OUT","DOUBTFUL","QUESTIONABLE","PROBABLE","AVAILABLE"}
PDF_REGEX=re.compile(r"Injury-Report_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})(AM|PM)\.pdf",re.I)
MATCHUP_REGEX=re.compile(r"\b([A-Z]{2,3})@([A-Z]{2,3})\b")

def canonical(value):
    upper=str(value).strip().upper()
    return ALIASES.get(upper,upper)

def namekey(name):
    name=unicodedata.normalize("NFKD",unescape(str(name)))
    return re.sub(r"[^a-z0-9]","",name.encode("ascii","ignore").decode().lower())

def reversed_nba_name(value):
    text=str(value).strip()
    if "," not in text: return text
    last,first=text.split(",",1)
    return f"{first.strip()} {last.strip()}"

def get(url):
    # Do not allow HTTP redirects to silently change the external provider.
    if not url.startswith(("https://www.nba.com/","https://official.nba.com/",
                           NBA_REPORT_HOST)):
        raise ValueError("Unsupported external data provider")
    request=Request(url,headers={"User-Agent":"Mozilla/5.0 (NBA Twin Lab; point-in-time public-source audit)","Accept":"text/html,application/pdf"})
    with urlopen(request,timeout=30) as response:
        if not response.geturl().startswith(("https://www.nba.com/","https://official.nba.com/",NBA_REPORT_HOST)):
            raise ValueError("Provider redirected outside approved domain")
        if response.status!=200: raise ValueError(f"Provider HTTP {response.status}")
        data=response.read(5_000_001)
        if len(data)>5_000_000: raise ValueError("Provider response larger than 5 MB")
        return data

def source_time(pdf_url):
    m=PDF_REGEX.search(pdf_url)
    if not m:return None
    date,hour,minute,ampm=m.groups()
    h=int(hour)%12+(12 if ampm.upper()=="PM" else 0)
    local=datetime.strptime(date,"%Y-%m-%d").replace(hour=h,minute=int(minute),tzinfo=ZoneInfo("America/New_York"))
    return local.astimezone(timezone.utc)

def select_report(page_html,now,first_tip):
    urls=set(re.findall(r"(?:https://ak-static\.cms\.nba\.com/referee/injury/|/referee/injury/)Injury-Report_\d{4}-\d{2}-\d{2}_\d{2}_\d{2}(?:AM|PM)\.pdf",
        unescape(page_html).replace(r"\/","/"),re.I))
    eligible=[]
    for u in urls:
        url=u if u.startswith("https://") else NBA_REPORT_HOST+u.rsplit("/",1)[-1]
        stamp=source_time(url)
        if stamp and stamp<=now and stamp<first_tip and now-stamp<timedelta(hours=24):
            eligible.append((stamp,url))
    if not eligible:raise ValueError("No timely official NBA injury PDF found")
    return max(eligible,key=lambda row:row[0])

class NbaRosterParser(HTMLParser):
    """Extract only <tr> player links from an NBA.com team roster page."""
    def __init__(self):
        super().__init__()
        self.in_row=False
        self.player_ids=[]
        self.names=[]
        self.player=None
        self.text=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=="tr":
            self.in_row=True
            self.player=None
            self.text=[]
        if tag=="a" and self.in_row:
            match=re.search(r"/player/(\d+)(?:/|$)",attrs.get("href",""))
            if match:
                if self.player is not None and self.player!=match.group(1):
                    raise ValueError("Ambiguous NBA roster row with multiple player IDs")
                self.player=match.group(1)
    def handle_data(self,data):
        if self.in_row:self.text.append(data)
    def handle_endtag(self,tag):
        if tag=="tr" and self.in_row:
            if self.player:
                self.player_ids.append(self.player)
                self.names.append(" ".join(" ".join(self.text).split()))
            self.in_row=False

def extract_roster(html,team):
    parser=NbaRosterParser()
    parser.feed(html)
    ids=parser.player_ids
    if not 10<=len(ids)<=25 or len(ids)!=len(set(ids)):
        raise ValueError(f"Official {team} roster incomplete or ambiguous: {len(ids)} rows")
    return ids

def words_to_row(line,width):
    # NBA injury PDF is a wide table. Use column positions, not regex parsing
    # arbitrary extracted prose (reasons frequently wrap over multiple lines).
    groups=[[] for _ in range(7)]
    cuts=[.15,.23,.31,.50,.695,.79]
    for word in sorted(line,key=lambda w:w["x0"]):
        x=float(word["x0"])/width
        idx=next((i for i,cut in enumerate(cuts) if x<cut),6)
        groups[idx].append(word["text"])
    return [" ".join(part).strip() for part in groups]

def injury_rows(pdf_bytes):
    try:
        import pdfplumber
    except ImportError as error:
        raise RuntimeError("pdfplumber is required to parse official NBA injury PDFs") from error
    parsed={}
    current_matchup=None
    current_team=None
    for page in pdfplumber.open(io.BytesIO(pdf_bytes)).pages:
        words=sorted(page.extract_words(use_text_flow=False),key=lambda w:(round(w["top"]/2)*2,w["x0"]))
        lines=[]
        for word in words:
            if word["top"]<page.height*.16 or word["top"]>page.height*.94:continue
            if not lines or abs(lines[-1][0]["top"]-word["top"])>3:
                lines.append([word])
            else:lines[-1].append(word)
        for line in lines:
            cols=words_to_row(line,page.width)
            text=" ".join(cols)
            match=MATCHUP_REGEX.search(text)
            if match:
                current_matchup=f"{canonical(match.group(1))}@{canonical(match.group(2))}"
                parsed.setdefault(current_matchup,{"teams":{},"seen":[]})
                current_team=None
            if not current_matchup:continue
            game=parsed[current_matchup]
            team=cols[3]
            if team and not any(w in team.lower() for w in ("injury report","game time","matchup")):
                # NBA PDF prints away club then home club. Both are explicitly
                # part of the matchup; third distinct team means parsing failure.
                away,home=current_matchup.split("@")
                if team not in game["seen"]:
                    if len(game["seen"])>=2:raise ValueError("Unexpected third team in official injury PDF")
                    game["seen"].append(team)
                side=game["seen"].index(team)
                current_team=(away,home)[side]
                game["teams"].setdefault(current_team,{"injuries":[],"submitted":True})
            if not current_team:continue
            if "NOT YET SUBMITTED" in text.upper():
                game["teams"][current_team]["submitted"]=False
            name,status=cols[4].strip(),cols[5].strip().upper()
            if "," in name and status in STATUS:
                game["teams"][current_team]["injuries"].append({"name":reversed_nba_name(name),"status":status})
    return parsed

def report_for_game(row,parsed,rosters):
    away=canonical(row["away"]["abbr"])
    home=canonical(row["home"]["abbr"])
    matchup=f"{away}@{home}"
    report=parsed.get(matchup)
    if not report or set(report["teams"])!={away,home}:return None
    teams={}
    for code in (away,home):
        source=report["teams"][code]
        if not source["submitted"]:return None
        roster=rosters[code]
        id_by_name=roster["name_ids"]
        injuries=[]
        seen=set()
        for item in source["injuries"]:
            key=namekey(item["name"])
            ids=id_by_name.get(key,[])
            if len(ids)!=1:raise ValueError(f"Ambiguous NBA official injury name {item['name']} on {code}")
            id=ids[0]
            if id in seen:raise ValueError(f"Duplicate official injury entry on {code} for {id}")
            seen.add(id)
            injuries.append({"player_id":id,"status":item["status"]})
        teams[code]={"roster_verified":True,"roster_player_ids":roster["ids"],"injuries":injuries,
                     "roster_source_url":roster["source_url"]}
    return {"game_id":str(row["id"]),"injury_report_verified":True,"teams":teams}

def unavailable(reason):
    return {"schema":"nba-twin-lab-availability-v18","status":"unavailable",
      "strict_no_future_data":True,"published_at_utc":None,"source":None,"games":[],
      "note":f"Official roster/injury ingestion did not pass strict validation: {reason}"[:320]}

def build(now):
    schedule=json.loads((ROOT/"data"/"games.json").read_text())
    games=[g for g in schedule.get("games",[]) if g.get("status")=="scheduled" and
           0< (datetime.fromisoformat(g["date"].replace("Z","+00:00"))-now).total_seconds()<24*3600]
    if not games:raise ValueError("No scheduled games in next 24 hours")
    first_tip=min(datetime.fromisoformat(g["date"].replace("Z","+00:00")) for g in games)
    if not (timedelta(minutes=35)<=first_tip-now<=timedelta(hours=4)):
        raise ValueError("Outside pretip official roster/injury evidence window")
    # Explicit overrides are useful if the official index page is intermittently
    # unavailable. Only exact official host/filename and pretip timestamps pass.
    override=os.environ.get("NBA_INJURY_REPORT_URL")
    if override:
        stamp=source_time(override)
        if (not override.startswith(NBA_REPORT_HOST) or stamp is None or
            stamp>now or stamp>=first_tip or now-stamp>timedelta(hours=24)):
            raise ValueError("Official report override violates source or cutoff policy")
        pdf_url=override
        pdf=get(pdf_url)
    else:
        try:
            stamp,pdf_url=select_report(get(NBA_REPORT_PAGE).decode("utf-8","replace"),now,first_tip)
            pdf=get(pdf_url)
        except Exception:
            # Official page can be temporarily inaccessible. Probe the genuine
            # official CDN's deterministic 15-minute report filenames, newest
            # first. Never invent status or bypass provider identity.
            pdf=None
            for i in range(12):
                est=(now-timedelta(minutes=i*15)).astimezone(ZoneInfo("America/New_York"))
                candidate=NBA_REPORT_HOST+"Injury-Report_"+est.strftime("%Y-%m-%d_%I_%M%p")+".pdf"
                sample_time=source_time(candidate)
                if sample_time is None or sample_time>=first_tip or sample_time>now:continue
                try:
                    pdf=get(candidate)
                    stamp,pdf_url=sample_time,candidate
                    break
                except Exception:
                    continue
            if pdf is None:raise ValueError("Official injury index unavailable and no verified CDN PDF found")
    if not pdf.startswith(b"%PDF"):raise ValueError("Official report was not a PDF")
    parsed=injury_rows(pdf)
    teams={canonical(g[side]["abbr"]) for g in games for side in ("home","away")}
    rosters={}
    for code in sorted(teams):
        uri=f"https://www.nba.com/team/{TEAM_IDS[code]}/roster"
        html=get(uri).decode("utf-8","replace")
        ids=extract_roster(html,code)
        # Names are derived exclusively from exact NBA.com player-id links in
        # the official roster table, not ESPN IDs or old rotation IDs.
        p=NbaRosterParser();p.feed(html)
        names={}
        for id,full in zip(p.player_ids,p.names):
            # HTML roster row includes position/number. Extract name from
            # player hyperlink using a narrow ID-specific anchor.
            found=re.search(r"<a\b[^>]*href=['\"][^'\"]*/player/"+re.escape(id)+
                r"(?:/[^'\"]*)?['\"][^>]*>(.*?)</a>",html,re.I|re.S)
            if not found:raise ValueError(f"Cannot resolve official NBA player name for {id}")
            player_name=" ".join(unescape(re.sub(r"<[^>]*>"," ",found.group(1))).split())
            if not player_name or len(player_name)>70:raise ValueError("Invalid official player name")
            names.setdefault(namekey(player_name),[]).append(id)
        if len(names)<10:raise ValueError(f"Unreliable NBA.com roster names for {code}")
        rosters[code]={"ids":ids,"name_ids":names,"source_url":uri}
    matched=[]
    for g in games:
        item=report_for_game(g,parsed,rosters)
        if item:matched.append(item)
    if not matched:raise ValueError("Official report has no complete game injury entries")
    doc={"schema":"nba-twin-lab-availability-v18","status":"verified",
         "strict_no_future_data":True,"published_at_utc":stamp.isoformat().replace("+00:00","Z"),
         "built_at_utc":now.isoformat().replace("+00:00","Z"),
         "source":{"type":"official","url":pdf_url,"league_roster":"https://www.nba.com/team/{team-id}/roster",
                   "sha256":hashlib.sha256(pdf).hexdigest(),
                   "team_rosters":[rosters[c]["source_url"] for c in sorted(rosters)]},
         "games":matched,"note":"NBA.com active roster and NBA official PDF at recorded cutoff; unlisted not assumed healthy"}
    return doc

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--as-of",help="UTC ISO timestamp; defaults to current UTC")
    ap.add_argument("--strict",action="store_true",help="Nonzero exit on unavailable official data")
    args=ap.parse_args()
    now=datetime.fromisoformat(args.as_of.replace("Z","+00:00")) if args.as_of else datetime.now(timezone.utc)
    if now.tzinfo is None:raise ValueError("--as-of must include timezone")
    try:
        doc=build(now.astimezone(timezone.utc))
    except Exception as exc:
        message=str(exc)
        if (not args.strict and
            (message.startswith("Outside pretip official roster/injury evidence window") or
             message.startswith("No scheduled games in next 24 hours"))):
            print("No eligible pretip refresh; preserving last timestamped feed")
            return
        print("Official data unavailable, failing closed:",message,file=sys.stderr)
        doc=unavailable(message)
        if args.strict:raise
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    temp=OUTPUT.with_suffix(".json.tmp")
    temp.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+"\n")
    os.replace(temp,OUTPUT)
    print("V18 availability:",doc["status"],"games:",len(doc["games"]))
if __name__=="__main__":main()
