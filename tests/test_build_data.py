import csv
import io
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import build_data as etl


def test_year_and_traded_season():
    assert etl.year_of({'Season':'1980-81'})==1981
    assert etl.year_of({'season':'2026'})==2026
    assert etl.year_of({'season':'2025-26'})==2026
    rows=[{'season':'2025','player':'A','player_id':'a','team':'LAL','mp':'1000'},
          {'season':'2025','player':'A','player_id':'a','team':'2TM','mp':'1500'},
          {'season':'2025','player':'A','player_id':'a','team':'BOS','mp':'500'}]
    assert etl.choose(rows)[(2025,'br:a')]['team']=='2TM'


def test_percent_scales_and_missing_are_not_fabricated():
    a={'ts_percent':'0.598','usg_percent':'29.5','ast_percent':'0.8',
       'tov_percent':'12.0','trb_percent':'5.6','blk_percent':'0.4',
       'stl_percent':'1.1','orb_percent':'0.5','drb_percent':'9.1',
       'x3p_ar':'0.42','ft_r':'0.28','obpm':'4.8','dbpm':'0.5'}
    b={'pts_per_100_poss':'37.8','x3p_percent':'0.405','x2p_percent':'0.58','ft_percent':'0.89'}
    v=etl.extract(a,b,{},79)
    assert v['ts']==59.8 and v['usg']==29.5 and v['ast']==0.8
    assert v['threepct']==40.5 and v['pts100']==37.8 and v['height']==79
    assert v['ftr']==.28 and v['threepar']==.42
    assert v['tov']==12.0
    assert etl.extract({},None,None,None)['obpm'] is None


def csvtext(rows):
    out=io.StringIO()
    w=csv.DictWriter(out,fieldnames=list(rows[0]))
    w.writeheader();w.writerows(rows)
    return out.getvalue()


class Response:
    def __init__(self,body):self.text=body;self.content=body.encode()
    def raise_for_status(self):pass


class FakeSession:
    def __init__(self,mapping):self.mapping=mapping
    def get(self,url,**kwargs):
        if url not in self.mapping:raise RuntimeError('Unmocked URL '+url)
        return Response(self.mapping[url])


def test_complete_pipeline_crossreferences_and_marks_provisional():
    advanced=[];per=[];totals=[];bio=[];historical=[];height=[]
    for p in range(100):
        name=f'Player {p}';pid=f'player{p:04}'
        bio.append({'player':name,'player_id':pid,'ht_in_in':75+p%9})
        height.append({'Name':name,'Height (Inches)':75+p%9})
        for yr in range(1981,2027):
            common={'season':yr,'player':name,'player_id':pid,'team':'TOT','mp':1500+p}
            advanced.append({**common,'ts_percent':'.57','usg_percent':20+p/100,'ftr':'.27','x3p_ar':'.35',
              'ast_percent':12.0,'tov_percent':10.0,'trb_percent':9.0,'blk_percent':1.0,'stl_percent':1.5,
              'orb_percent':3.0,'drb_percent':15.0,'dbpm':0.2,'obpm':2.1})
            per.append({**common,'pts_per_100_poss':25+p/100,'x3p_percent':'.37','x2p_percent':'.54','ft_percent':'.8'})
            totals.append({**common,'x3p_percent':'.37','x2p_percent':'.54','ft_percent':'.8'})
        historical.append({'Season':'1980-81','Player':name,'Tm':'TOT','MP_tot':1600,'PTS_per_100p':25+p/100,'TS_perc':.57,'USG_perc':20+p/100})
    mapping={etl.PRIMARY+'Advanced.csv':csvtext(advanced),etl.PRIMARY+'Per%20100%20Poss.csv':csvtext(per),
             etl.PRIMARY+'Player%20Totals.csv':csvtext(totals),etl.PRIMARY+'Player%20Career%20Info.csv':csvtext(bio),
             etl.HEIGHTS:csvtext(height),etl.HIST:csvtext(historical),
             etl.SOURCE_API:json.dumps([{'commit':{'committer':{'date':'2026-04-13T00:00:00Z'}}}])}
    out=etl.build(session=FakeSession(mapping),include_current=False,today=datetime(2026,10,31,tzinfo=timezone.utc))
    assert len(out['rows'])==4600
    assert out['latest_complete_season']==2025
    assert out['latest_available_season']==2026
    assert out['seasons'][-1]['provisional'] is True
    assert out['rows'][0]['stats']['height'] is not None
    assert out['sources']['historical_crosscheck']['crosschecked_values']>0
    assert out['sources']['historical_crosscheck']['large_disagreements']==0