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
        with patch.object(m,'fetch',return_value=__import__('json').dumps(raw).encode()):m.update_coen(data,'2026-11-11')
        self.assertEqual(data['events'][0]['metrics'],[])
        self.assertEqual(data['events'][0]['state'],'propuesta_revisar')
        self.assertEqual(data['eventRevisions']['1'][0]['record']['metrics'],old['metrics'])

    def test_empty_source_rejected(self):
        data={'events':[{'id':'1'}]}
        with patch.object(m,'fetch',return_value=b'{"type":"FeatureCollection","features":[]}'):
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

    def test_ana_keeps_previous_cuts_for_missing_points(self):
        import json
        data={'meta':{'anaDate':'2026-11-06','anaPreviousDate':'2026-11-05','anaCuts':['2026-11-06','2026-11-05','2026-10-27']},'ana':[],'anaDiary':{}}
        rows=[];general=[]
        for i in range(300):
            code=f'{i:04}-2026-ANA-AAA.JZ-ALA.CH'
            cur={'CODIGO':code,'DECRETO':'D.S N° 164-2026-EF','ESTADO':'En Ejecución'}
            data['ana'].append({'id':str(i),'current':cur,'previous':{**cur,'ESTADO':'Por Ejecutar'},'history':{'2026-10-27':cur},'diary':[]})
            rows.append({'CODIGO_INTERVENCION':code,'FECHA_INTERVENCION':'2026-11-10','PERIODO':2,'DECRETO_URGENCIA':'D.S N° 164-2026-EF','AVANCE_KM':.1})
            general.append({'CODIGO_INTERVENCION':code,'DECRETO_URGENCIA':'D.S N° 164-2026-EF','ESTADO_INTERVENCION':'Ejecutado'})
        data['ana'].append({'id':'missing','current':{'CODIGO':'9999-2026-ANA-AAA.JZ-ALA.CH','DECRETO':'D.S N° 164-2026-EF','ESTADO':'En Ejecución'},'previous':{'ESTADO':'Por Ejecutar'},'history':{'2026-10-27':{'ESTADO':'Por Ejecutar'}},'diary':[]})
        def response(rows):return {'success':True,'timestamp':'2026-11-11T12:00:00Z','data':[{'filas':rows,'totalFilas':len(rows)}]}
        with patch.object(m,'get_json',side_effect=[response(rows),response(general)]):m.update_ana(data,'2026-11-11')
        missing=data['ana'][-1]
        for point in data['ana']:
            self.assertTrue(set(data['meta']['anaCuts']) <= set(point['history']))
        self.assertEqual(missing['previous']['ESTADO'],'En Ejecución')
        self.assertEqual(missing['history']['2026-11-05']['ESTADO'],'Por Ejecutar')
        self.assertEqual(missing['currentSourceDate'],'2026-11-06')

    def test_completed_source_survives_interruption(self):
        import tempfile, json
        base={'ana':[],'meta':{'anaDate':'2026-11-06','anaPreviousDate':'2026-11-05','coenDate':'2026-11-09','barrierDate':'2026-10-02','rainLatestEndDate':'2026-11-09'},'hydroHistory':{'sourceDate':'2026-11-09'}}
        def coen(data,today):
            data['meta']['coenDate']=today
            return {'cut':today,'records':1}
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'data').mkdir()
            with patch.object(m,'load_base',return_value=base),patch.object(m,'load_live',return_value={}),patch.object(m,'update_coen',side_effect=coen),patch.object(m,'update_ana',side_effect=KeyboardInterrupt):
                with self.assertRaises(KeyboardInterrupt):m.refresh(root,only=['coen','ana'])
            status=json.loads((root/'data/status.json').read_text())
            live=m.unpack(json.loads((root/'data/live.json').read_text())['data'])
            self.assertEqual(status['sources']['coen']['state'],'ok')
            self.assertEqual(status['sources']['ana']['state'],'error')
            self.assertGreater(live['meta']['coenDate'],base['meta']['coenDate'])

    def test_numeric_missing_is_not_zero(self):
        self.assertIsNone(m.number(None));self.assertIsNone(m.number('NaN'));self.assertEqual(m.number(0),0)

if __name__=='__main__':unittest.main()
