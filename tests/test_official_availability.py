"""Offline regression fixtures for official NBA V18 data ingestion."""
import importlib.util
import sys
import types
import unittest
from datetime import datetime,timezone
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("official",ROOT/"scripts"/"build_official_availability.py")
o=importlib.util.module_from_spec(spec)
spec.loader.exec_module(o)

class OfficialAvailabilityTests(unittest.TestCase):
    def test_filename_uses_eastern_timezone_and_cutoff(self):
        url=o.NBA_REPORT_HOST+"Injury-Report_2026-10-30_05_15PM.pdf"
        self.assertEqual(o.source_time(url).isoformat(),"2026-10-30T21:15:00+00:00")
        page='<a href="'+url+'">5:15</a><a href="'+o.NBA_REPORT_HOST+'Injury-Report_2026-10-30_06_00PM.pdf">6:00</a>'
        chosen=o.select_report(page,datetime(2026,10,30,21,45,tzinfo=timezone.utc),
                               datetime(2026,10,30,23,tzinfo=timezone.utc))
        self.assertEqual(chosen[1],url)
        with self.assertRaises(ValueError):
            o.select_report(page,datetime(2026,10,30,20,20,tzinfo=timezone.utc),
                            datetime(2026,10,30,23,tzinfo=timezone.utc))
    def test_official_roster_html_ids_are_not_espn_ids(self):
        table="<table><tbody>"+ "".join(
          f'<tr><td><a href="/player/{1600000+i}/player-{i}">Name {i}</a></td><td>G</td></tr>'
          for i in range(16))+"</tbody></table>"
        ids=o.extract_roster(table,"CHA")
        self.assertEqual(ids[0],"1600000")
        self.assertEqual(len(ids),16)
        with self.assertRaises(ValueError):
            o.extract_roster("<table><tr><td>No players</td></tr></table>","CHA")
    def test_strict_injury_identity_and_unknown_names(self):
        p={"CHA":{"ids":["101","102","103","104","105"],"name_ids":{"konknueppel":["101"],"cobywhite":["102"]},
                  "source_url":"https://www.nba.com/team/1610612766/roster"},
           "WAS":{"ids":["201","202","203","204","205"],"name_ids":{"anthonydavis":["201"]},
                  "source_url":"https://www.nba.com/team/1610612764/roster"}}
        parsed={"CHA@WAS":{"teams":{
          "CHA":{"submitted":True,"injuries":[{"name":"Kon Knueppel","status":"OUT"}]},
          "WAS":{"submitted":True,"injuries":[{"name":"Anthony Davis","status":"PROBABLE"}]}
        }}}
        game={"id":"401909277","away":{"abbr":"CHA"},"home":{"abbr":"WSH"}}
        g=o.report_for_game(game,parsed,p)
        self.assertTrue(g["injury_report_verified"])
        self.assertEqual(g["teams"]["CHA"]["injuries"][0]["player_id"],"101")
        bad={"CHA@WAS":{"teams":{**parsed["CHA@WAS"]["teams"],"CHA":{"submitted":True,"injuries":[{"name":"Other Player","status":"OUT"}]}}}}
        with self.assertRaises(ValueError):
            o.report_for_game(game,bad,p)
        parsed["CHA@WAS"]["teams"]["WAS"]["submitted"]=False
        self.assertIsNone(o.report_for_game(game,parsed,p))
    def test_pdf_column_parser_preserves_away_and_home_across_rows(self):
        def line(top,entries):
            return [dict(top=top,x0=x,text=value) for x,value in entries]
        words=(line(144,[(250,"CHA@WAS"),(335,"Charlotte"),(399,"Hornets"),(525,"Knueppel,"),
                    (605,"Kon"),(710,"Out")])+
               line(166,[(335,"Washington"),(404,"Wizards"),(525,"Davis,"),
                    (596,"Anthony"),(710,"Probable")]))
        page=types.SimpleNamespace(height=600,width=1000,extract_words=lambda **_kw:words)
        fake=types.SimpleNamespace(open=lambda _stream:types.SimpleNamespace(pages=[page]))
        with patch.dict(sys.modules,{"pdfplumber":fake}):
            rows=o.injury_rows(b"%PDF synthetic fixture")
        self.assertEqual(rows["CHA@WAS"]["teams"]["CHA"]["injuries"][0]["name"],"Kon Knueppel")
        self.assertEqual(rows["CHA@WAS"]["teams"]["WAS"]["injuries"][0]["status"],"PROBABLE")
    def test_empty_or_partial_sources_publish_unavailable_not_fabricated_status(self):
        r=o.unavailable("Bad PDF")
        self.assertEqual(r["status"],"unavailable")
        self.assertEqual(r["games"],[])
        self.assertEqual(r["published_at_utc"],None)
        self.assertTrue(r["strict_no_future_data"])

if __name__=="__main__":unittest.main()
