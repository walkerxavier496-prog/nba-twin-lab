#!/usr/bin/env python3
"""NBA Twin Lab V3: multi-source, fail-closed NBA player-season ETL.

Builds compact, auditable player-season data from published Basketball Reference
mirrors, historical cross-checks, and optional NBA official current stats.
Missing values remain null; no synthetic player statistics are ever created.
"""
import argparse
import csv
from datetime import datetime, timezone
import io
import json
import math
import os
from pathlib import Path
import re
import time
import unicodedata

import requests

ROOT = Path(__file__).resolve().parent
PRIMARY = 'https://raw.githubusercontent.com/sumitrodatta/bball-reference-datasets/master/Data/'
HIST = 'https://raw.githubusercontent.com/SpecCRA/nba_data_scrapers/master/player_data_1981-2017.csv'
HEIGHTS = 'https://raw.githubusercontent.com/simonwarchol/NBA-Height-Weight/master/CSVs/total.csv'
SOURCE_API = 'https://api.github.com/repos/sumitrodatta/bball-reference-datasets/commits?path=Data%2FAdvanced.csv&per_page=1'
METRICS = ['pts100','ts','usg','ftr','threepar','ast','tov','trb','blk','height','stl','dbpm','obpm','orb','drb','threepct','twopct','ftpct']
HEADERS = {'User-Agent': 'NBATwinLab/3.0 (research; github.com/walkerxavier496-prog/nba-twin-lab)', 'Accept': 'text/csv,application/json,*/*'}

def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', str(text or '').replace('*','')) if not unicodedata.combining(c)).strip().casefold()

def key(text):
    return re.sub('[^a-z0-9]', '', normalized(text))

def field(row, *aliases):
    lookup = {key(k): v for k,v in row.items() if k is not None}
    for alias in aliases:
        v = lookup.get(key(alias))
        if v is not None and str(v).strip() not in ('','NA','nan','None'):
            return v
    return None

def num(value):
    try:
        v = float(str(value).replace(',',''))
        return v if math.isfinite(v) else None
    except (ValueError, TypeError):
        return None

def percent(value):
    v = num(value)
    return None if v is None else round(v*100 if 0 <= v <= 1 else v, 5)

def ratio(value):
    v = num(value)
    return None if v is None else round(v/100 if v > 1 else v, 6)

def fetch(url, session=requests, retries=3):
    last = None
    for attempt in range(retries):
        try:
            r = session.get(url, headers=HEADERS, timeout=45)
            r.raise_for_status()
            if len(r.content) < 50: raise ValueError('Short response')
            return r.text
        except (requests.RequestException, ValueError) as e:
            last = e
            if attempt < retries-1: time.sleep(2**attempt)
    raise RuntimeError(f'Cannot retrieve {url}: {last}')

def load_csv(url, session=requests):
    rows = list(csv.DictReader(io.StringIO(fetch(url,session), newline='')))
    if len(rows) < 50: raise ValueError(f'Insufficient rows from {url}: {len(rows)}')
    return rows

def year_of(row):
    value = field(row,'season','year')
    if value is None: return None
    match = re.search(r'\d{4}', str(value))
    if not match: return None
    first = int(match.group())
    if re.fullmatch(r'\d{4}',str(value).strip()): return first
    second = re.search(r'(\d{2,4})\s*$',str(value))
    if not second: return first
    suffix = second.group(1)
    if len(suffix)==4: return int(suffix)
    end = first//100*100+int(suffix)
    return end+100 if end<=first else end

def player_id(row):
    slug = field(row,'player_id','playerid','slug')
    if slug: return 'br:'+str(slug).strip()
    return 'name:'+normalized(field(row,'player','name','PLAYER_NAME'))

def choose(rows):
    """One aggregate row per player-season; no double counting traded players."""
    best = {}
    for row in rows:
        year = year_of(row)
        name = field(row,'player','name','PLAYER_NAME')
        if year is None or year < 1981 or not name: continue
        ident = player_id(row)
        tm = str(field(row,'team','tm','team_abbreviation') or '')
        mins = num(field(row,'mp','minutes','min','MP_tot')) or 0
        is_total = tm == 'TOT' or bool(re.fullmatch(r'\d+TM',tm))
        rank = (1 if is_total else 0, mins)
        pair = (year,ident)
        if pair not in best or rank > best[pair][0]: best[pair] = (rank,row)
    return {k:v[1] for k,v in best.items()}

def height_inches(value):
    if value is None: return None
    s = str(value).strip()
    match = re.fullmatch(r'(\d)\s*[-′\']\s*(\d{1,2})',s)
    if match: return int(match[1])*12+int(match[2])
    v = num(s)
    return v if v and 55<=v<=95 else None

def height_maps(bio_rows, external_rows):
    by_id,by_name = {},{}
    for row in external_rows:
        name = field(row,'Name')
        h = height_inches(field(row,'Height (Inches)',' Height (Inches)','height_inches'))
        if name and h: by_name[normalized(name)] = h
    for row in bio_rows:
        name = field(row,'player','name')
        h = height_inches(field(row,'ht_in_in','height_inches','height','ht'))
        if not h: continue
        by_id[player_id(row)] = h
        if name: by_name[normalized(name)] = h
    return by_id,by_name

def extract(adv, per, totals, height):
    def a(*names): return num(field(adv,*names))
    def p(*names): return num(field(per or {},*names))
    def t(*names): return num(field(totals or {},*names))
    values = {
        'pts100':p('pts_per_100_poss','pts_per_100','pts_per_poss','pts'),
        'ts':percent(field(adv,'ts_percent','ts_pct','TS%','ts_perc')),
        'usg':num(field(adv,'usg_percent','usg_pct','USG%','usg_perc')),
        'ftr':ratio(field(adv,'ftr','ft_r','FTr')),
        'threepar':ratio(field(adv,'x3p_ar','fg3a_per_fga_pct','3PAr','threepar')),
        'ast':num(field(adv,'ast_percent','ast_pct','AST%','ast_perc')),
        'tov':num(field(adv,'tov_percent','tov_pct','TOV%','tov_perc')),
        'trb':num(field(adv,'trb_percent','trb_pct','TRB%','trb_perc')),
        'blk':num(field(adv,'blk_percent','blk_pct','BLK%','blk_perc')),
        'height':height,
        'stl':num(field(adv,'stl_percent','stl_pct','STL%','stl_perc')),
        'dbpm':a('dbpm'), 'obpm':a('obpm'),
        'orb':num(field(adv,'orb_percent','orb_pct','ORB%','orb_perc')),
        'drb':num(field(adv,'drb_percent','drb_pct','DRB%','drb_perc')),
        'threepct':percent(field(per or {},'x3p_percent','fg3_percent','3P%','three_pct') or field(totals or {},'x3p_percent','fg3_percent','3P%')),
        'twopct':percent(field(per or {},'x2p_percent','fg2_percent','2P%','two_pct') or field(totals or {},'x2p_percent','fg2_percent','2P%')),
        'ftpct':percent(field(per or {},'ft_percent','FT%','ft_pct') or field(totals or {},'ft_percent','FT%','ft_pct')),
    }
    return values

def historical_fallback(rows):
    """Cross-reference independent historical scrape; only fill missing fields."""
    lookup={}
    mapping={'pts100':'PTS_per_100p','ts':'TS_perc','usg':'USG_perc','ftr':'FTr','threepar':'3PAr',
             'ast':'AST_perc','tov':'TOV_perc','trb':'TRB_perc','blk':'BLK_perc',
             'stl':'STL_perc','dbpm':'DBPM','obpm':'OBPM','orb':'ORB_perc','drb':'DRB_perc',
             'threepct':'3P_perc','twopct':'2P_perc','ftpct':'FT_perc'}
    for (year,_),row in choose(rows).items():
        name = field(row,'Player')
        if not name:continue
        values={}
        for metric, col in mapping.items():
            raw=field(row,col)
            values[metric]=(percent(raw) if metric in {'ts','threepct','twopct','ftpct'} else ratio(raw) if metric in {'ftr','threepar'} else num(raw))
        lookup[(year,normalized(name))]=values
    return lookup

def current_nba_rows(season, heights_by_name, session=requests):
    """Official NBA supplemental source; never invent BPM or incompatible TOV%."""
    endpoint='https://stats.nba.com/stats/leaguedashplayerstats'
    params={k:'' for k in ('College','Conference','Country','DateFrom','DateTo','Division','DraftPick','DraftYear','GameScope','GameSegment','Height','Location','Outcome','PlayerExperience','PlayerPosition','SeasonSegment','ShotClockRange','StarterBench','VsConference','VsDivision','Weight')}
    params.update({'LastNGames':'0','LeagueID':'00','Month':'0','OpponentTeamID':'0','PORound':'0','PaceAdjust':'N','PerMode':'Per100Possessions','Period':'0','PlusMinus':'N','Rank':'N','Season':f'{season-1}-{str(season)[-2:]}','SeasonType':'Regular Season','TeamID':'0'})
    headers={'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36','Referer':'https://www.nba.com/','Origin':'https://www.nba.com','Accept':'application/json, text/plain, */*'}
    def table(measure):
        params['MeasureType']=measure
        response=session.get(endpoint,params=params,headers=headers,timeout=24)
        response.raise_for_status()
        data=response.json()['resultSets'][0]
        return {str(dict(zip(data['headers'],r))['PLAYER_ID']):dict(zip(data['headers'],r)) for r in data['rowSet']}
    base=table('Base')
    params['PerMode']='Totals'
    adv=table('Advanced')
    output=[]
    for pid,a in adv.items():
        b=base.get(pid)
        if not b:continue
        mins=num(a.get('MIN')) or 0
        if mins<60:continue
        name=a.get('PLAYER_NAME') or b.get('PLAYER_NAME')
        def rate(k):return percent(a.get(k))
        fga=num(b.get('FGA'));fga3=num(b.get('FG3A'));fta=num(b.get('FTA'))
        fg3=num(b.get('FG3_PCT'));ft=num(b.get('FT_PCT'));fg=num(b.get('FG_PCT'))
        fg2=(num(b.get('FGM')) or 0)-(num(b.get('FG3M')) or 0)
        fga2=(fga or 0)-(fga3 or 0)
        values={'pts100':num(b.get('PTS')),'ts':rate('TS_PCT'),'usg':rate('USG_PCT'),
                'ftr':(fta/fga if fga and fta is not None else None),
                'threepar':(fga3/fga if fga and fga3 is not None else None),
                'ast':rate('AST_PCT'),'tov':None,'trb':rate('REB_PCT'),'blk':rate('BLK_PCT'),
                'height':heights_by_name.get(normalized(name)),'stl':rate('STL_PCT'),
                'dbpm':None,'obpm':None,'orb':rate('OREB_PCT'),'drb':rate('DREB_PCT'),
                'threepct':percent(fg3),'twopct':(100*fg2/fga2 if fga2>0 else None),
                'ftpct':percent(ft)}
        output.append({'id':'nba:'+pid,'name':name,'season':season,'minutes':mins,'team':a.get('TEAM_ABBREVIATION',''),
                       'stats':values,'source':'nba_official','provisional':True})
    if len(output)<30:raise ValueError(f'NBA official returned only {len(output)} eligible player records')
    return output

def source_modified(session=requests):
    try:
        raw=json.loads(fetch(SOURCE_API,session))
        return raw[0]['commit']['committer']['date'][:10]
    except (KeyError,IndexError,ValueError,TypeError,RuntimeError):return None

def build(session=requests, include_current=True, today=None):
    today=today or datetime.now(timezone.utc)
    advanced=load_csv(PRIMARY+'Advanced.csv',session)
    per100=load_csv(PRIMARY+'Per%20100%20Poss.csv',session)
    totals=load_csv(PRIMARY+'Player%20Totals.csv',session)
    bios=load_csv(PRIMARY+'Player%20Career%20Info.csv',session)
    errors=[]
    try: external=load_csv(HEIGHTS,session)
    except Exception as exc: external=[];errors.append('height supplement unavailable: '+str(exc))
    try: history=historical_fallback(load_csv(HIST,session))
    except Exception as exc: history={};errors.append('historical cross-check unavailable: '+str(exc))
    by_id,by_name=height_maps(bios,external)
    a=choose(advanced);p=choose(per100);t=choose(totals)
    by_name_per={(yr,normalized(field(row,'player'))):row for (yr,_),row in p.items()}
    by_name_tot={(yr,normalized(field(row,'player'))):row for (yr,_),row in t.items()}
    source_date=source_modified(session)
    rows=[];checked=0;filled=0;disagree=0
    for (year,ident),adv in sorted(a.items()):
        if year>today.year+1:continue
        name=field(adv,'player')
        mins=num(field(adv,'mp','minutes')) or 0
        if mins<200:continue
        nk=normalized(name)
        pr=p.get((year,ident)) or by_name_per.get((year,nk))
        tr=t.get((year,ident)) or by_name_tot.get((year,nk))
        height=by_id.get(ident) or by_name.get(nk)
        values=extract(adv,pr,tr,height)
        supplement=history.get((year,nk),{})
        for metric,v in supplement.items():
            if v is None:continue
            if values.get(metric) is None: values[metric]=v;filled+=1
            elif metric in {'pts100','ts','usg','ast','tov','trb','stl','blk','dbpm','obpm'}:
                checked+=1
                if abs(values[metric]-v)> (2 if metric not in {'dbpm','obpm'} else 1):disagree+=1
        # Keep only credible data; nulls remain null and are surfaced by the model.
        valid=sum(v is not None and math.isfinite(v) for v in values.values())
        if valid<12:continue
        provisional=(year>=today.year+1) or (year==2026 and (not source_date or source_date<'2026-07-01'))
        rows.append({'id':ident,'name':name,'season':year,'minutes':mins,'team':field(adv,'team','tm') or '',
                     'stats':values,'source':'basketball_reference_mirror','provisional':provisional})
    if len(rows)<3000:raise RuntimeError(f'Primary source yielded only {len(rows)} usable player-seasons; refusing to publish')
    years={}
    for r in rows:years[r['season']]=years.get(r['season'],0)+1
    if min(years)>1981 or max(years)<2025:raise RuntimeError('Historical season coverage insufficient')
    current_season=today.year+1 if today.month>=10 else today.year
    if include_current and current_season>max(years):
        try:
            latest=current_nba_rows(current_season,by_name,session)
            rows.extend(latest);years[current_season]=len(latest)
        except Exception as exc:errors.append('Current NBA official stats unavailable: '+str(exc))
    # Flag gaps and incomplete data honestly. Never assert latest season is complete from year alone.
    years_out=[]
    for year in sorted(years):
        group=[r for r in rows if r['season']==year]
        years_out.append({'season':year,'players':len(group),'provisional':any(r['provisional'] for r in group),
                          'sources':sorted(set(r['source'] for r in group))})
    latest_complete=max((x['season'] for x in years_out if not x['provisional']),default=None)
    if latest_complete is None:raise RuntimeError('No verified completed season')
    payload={'schema':3,'built_at_utc':today.isoformat(),'latest_complete_season':latest_complete,
             'latest_available_season':max(years),'metrics':METRICS,'seasons':years_out,
             'sources':{'basketball_reference_mirror':{'url':'https://github.com/sumitrodatta/bball-reference-datasets','advanced_last_commit':source_date},
                        'historical_crosscheck':{'url':'https://github.com/SpecCRA/nba_data_scrapers','crosschecked_values':checked,'large_disagreements':disagree,'filled_missing':filled},
                        'listed_heights':{'url':'https://github.com/simonwarchol/NBA-Height-Weight'},
                        'nba_official':{'url':'https://www.nba.com/stats','season_attempted':current_season}},
             'warnings':errors,'rows':rows}
    return payload

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--no-current',action='store_true',help='Skip official NBA current-season endpoint')
    parser.add_argument('--output',type=Path,default=ROOT/'data'/'seasons.json')
    args=parser.parse_args()
    payload=build(include_current=not args.no_current)
    # Avoid a new multi-megabyte Git commit when only the build timestamp changes.
    if args.output.exists():
        try:
            previous=json.loads(args.output.read_text(encoding='utf-8'))
            stable_keys=('schema','latest_complete_season','latest_available_season','metrics','seasons','sources','rows')
            if all(previous.get(k)==payload.get(k) for k in stable_keys):
                print(f"No statistical changes across {len(payload['rows'])} player-seasons; keeping existing dataset")
                return
        except (OSError,ValueError):
            pass
    args.output.parent.mkdir(parents=True,exist_ok=True)
    tmp=args.output.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(payload,separators=(',',':'),ensure_ascii=False,allow_nan=False),encoding='utf-8')
    tmp.replace(args.output)
    print(f"Validated {len(payload['rows'])} player-seasons; latest complete {payload['latest_complete_season']}; latest available {payload['latest_available_season']}")
    for warning in payload['warnings']:print('WARNING:',warning)

if __name__=='__main__':main()