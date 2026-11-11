import copy, importlib.util, unittest
from unittest.mock import patch
from pathlib import Path
spec=importlib.util.spec_from_file_location('refresh',Path(__file__).resolve().parents[1]/'tools/refresh_data.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class RefreshTests(unittest.TestCase):
    def test_delta_preserves_history_and_nulls(self):
        base={'history':{'2026-11-09':[1]},'current':{'value':12,'threshold':3}}
        updated=copy.deepcopy(base);updated['history']['2026-11-11']=[2];updated['current']['threshold']=None
        self.assertEqual(m.merge_patch(base,m.difference(base,updated)),updated)
        self.assertEqual(base['current']['threshold'],3)

    def test_ficha_prefix_matching(self):
        self.assertEqual(m.code('FTR-MC-PREV N° 0034-2026-ANA-AAA.JZ-ALA.CH'),m.code('0034-2026-ANA-AAA.JZ-ALA.CH'))

    def test_source_date_not_execution_date(self):
        self.assertEqual(m.rain_dates('<a data-corrltv="1">2026-11-10</a>')[1],'2026-11-10')
        with self.assertRaises(ValueError):m.rain_dates('Sin fecha publicada')

    def test_changed_pdf_invalidates_old_metrics(self):
        old={'id':'1','url':'https://example.org/old.pdf','dateSource':'PDF','date':'2026-11-01','metrics':[{'valor_propuesto':10}],'exposure':[], 'state':'contrastado_muestra'}
        data={'events':[old], 'meta':{'coenDate':'2026-11-09'},'coenSnapshots':{}}
        raw={'type':'FeatureCollection','features':[{'properties':{'id':1,'Fecha de ocurrencia':'2026-11-10T10:00:00Z','document':'https://example.org/new.pdf'},'geometry':None}]}
        with patch.object(m,'get_json',return_value=raw):m.update_coen(data,'2026-11-11')
        self.assertEqual(data['events'][0]['metrics'],[])
        self.assertEqual(data['events'][0]['state'],'propuesta_revisar')
        self.assertEqual(data['eventRevisions']['1'][0]['record']['metrics'],old['metrics'])

    def test_empty_source_rejected(self):
        data={'events':[{'id':'1'}]}
        with patch.object(m,'get_json',return_value={'type':'FeatureCollection','features':[]}):
            with self.assertRaises(ValueError):m.update_coen(data,'2026-11-11')
        self.assertEqual(data,{'events':[{'id':'1'}]})

    def test_daily_hydro_pairs_and_future_dates(self):
        import json
        raw={'codEstacion':'1','variable':'CAUDAL','unidad':'m3/s','fechaHora':[1794268800000,1794355200000,1794441600000], 'datoActual':[[1794268800000,3.5],[1794355200000,None],[1794441600000,9]],'amarillo':[[1794268800000,10],[1794355200000,10],[1794441600000,10]]}
        data={'meta':{'defaultStartDate':'2026-10-24'},'hydroHistory':{'byStation':{'1':{'caudal':{'unit':'m3/s','days':{}}}}}}
        with patch.object(m,'fetch',return_value=('var data = '+json.dumps(raw)+';').encode()):
            result=m.update_hydro(data,'2026-11-10')
        series=data['hydroHistory']['byStation']['1']['caudal']['days']
        self.assertEqual(result['records'],1)
        self.assertEqual(series['2026-11-10']['value'],3.5)
        self.assertEqual(series['2026-11-10']['thresholds']['amarillo'],10)
        self.assertEqual(len(series),1)

    def test_numeric_missing_is_not_zero(self):
        self.assertIsNone(m.number(None));self.assertIsNone(m.number('NaN'));self.assertEqual(m.number(0),0)

if __name__=='__main__':unittest.main()
