import copy, importlib.util, json, unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('catalog_refresh',Path(__file__).resolve().parents[1]/'tools/refresh_data.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class CatalogTests(unittest.TestCase):
    def fixture(self):
        data={'meta':{'anaDate':'2026-11-10','anaPreviousDate':'2026-11-09','anaCuts':['2026-11-10','2026-11-09']},'ana':[]}
        rows=[]
        for i in range(536):
            a={'IDE_INTERVENCION':i,'IDPC':10000+i,'CODIGO':f'{i:04}-2026-ANA-AAA','DECRETO':'DS 164','nombdep':'Lima','nombprov':'Lima','nombdistri':'Lima','AVANCEKM':1,'FEC_AVANCE':'10/11/2026','COSTO_DE_LA_ACTIVIDAD':100}
            data['ana'].append({'id':str(i),'current':a,'previous':copy.deepcopy(a),'history':{'2026-11-09':copy.deepcopy(a)}})
            rows.append({'attributes':{**a,'AVANCEKM':0,'FEC_AVANCE':'11/11/2026','COSTO_DE_LA_ACTIVIDAD':None,'AVANCE_ACUMULADO_KM':99,'HABITANTES_ATENDIDOS':900}})
        return data,{'features':rows}

    def test_updates_all_points_preserves_null_budget_and_does_not_sum_repeated_totals(self):
        data,raw=self.fixture()
        with patch.object(m,'fetch_ana_catalog',return_value=raw):result=m.update_ana_catalog(data,'2026-11-12')
        self.assertEqual(result['updatedStates'],536)
        self.assertEqual(result['latestObservation'],'2026-11-11')
        self.assertEqual(sum(p['current']['AVANCEKM'] for p in data['ana']),0)
        for p in data['ana']:
            self.assertEqual(p['current']['COSTO_DE_LA_ACTIVIDAD'],100)
            self.assertNotIn('AVANCE_ACUMULADO_KM',p['current'])
            self.assertEqual(p['previous']['AVANCEKM'],1)
            self.assertEqual(p['current']['FEC_AVANCE'],'11/11/2026')

    def test_incomplete_duplicate_future_and_identity_changes_reject_before_mutation(self):
        for kind in ['short','truncated','duplicate','identity','future']:
            data,raw=self.fixture();before=copy.deepcopy(data)
            if kind=='short':raw['features'].pop()
            elif kind=='truncated':raw['exceededTransferLimit']=True
            elif kind=='duplicate':raw['features'][-1]=raw['features'][0]
            elif kind=='identity':raw['features'][-1]['attributes']['IDPC']=0
            elif kind=='future':raw['features'][-1]['attributes']['FEC_AVANCE']='13/11/2026'
            with patch.object(m,'fetch_ana_catalog',return_value=raw),self.assertRaises(ValueError):m.update_ana_catalog(data,'2026-11-12')
            self.assertEqual(data,before)

    def test_downloads_reduced_field_batches_and_reorders_by_inventory(self):
        from urllib.parse import urlparse, parse_qs
        calls = []
        def fetch(url, **kwargs):
            q = parse_qs(urlparse(url).query);calls.append((q, kwargs))
            if 'returnIdsOnly' in q:return json.dumps({'objectIdFieldName':'OBJECTID','objectIds':list(reversed(range(536)))}).encode()
            ids = list(map(int, q['objectIds'][0].split(',')))
            return json.dumps({'features':[{'attributes':{'OBJECTID':i}} for i in reversed(ids)]}).encode()
        with patch.object(m,'fetch',side_effect=fetch):raw=m.fetch_ana_catalog()
        self.assertEqual(len(raw['features']),536)
        self.assertEqual(raw['batchCount'],6)
        self.assertEqual(len(calls),7)
        self.assertEqual({f['attributes']['OBJECTID'] for f in raw['features']},set(range(536)))
        for q, kwargs in calls:
            self.assertEqual(kwargs,{'timeout':30,'retries':2})
            if 'objectIds' in q:
                self.assertLessEqual(len(q['objectIds'][0].split(',')),96)
                self.assertEqual(q['returnGeometry'],['false'])
                self.assertNotIn('*',q['outFields'][0])
                self.assertIn('FEC_AVANCE',q['outFields'][0])

    def test_rejects_bad_inventory_and_corrupted_batch(self):
        from urllib.parse import urlparse, parse_qs
        for bad in ['short_ids','duplicate_ids','invalid_field','short_page','duplicate_page','wrong_page','truncated','error']:
            def fetch(url, **kwargs):
                q=parse_qs(urlparse(url).query)
                if 'returnIdsOnly' in q:
                    ids=list(range(536))
                    if bad=='short_ids':ids.pop()
                    if bad=='duplicate_ids':ids[-1]=0
                    return json.dumps({'objectIdFieldName':'invalid.field' if bad=='invalid_field' else 'OBJECTID','objectIds':ids}).encode()
                ids=list(map(int,q['objectIds'][0].split(',')))
                features=[{'attributes':{'OBJECTID':i}} for i in ids]
                if bad=='short_page':features.pop()
                if bad=='duplicate_page':features[-1]=features[0]
                if bad=='wrong_page':features[-1]={'attributes':{'OBJECTID':9999}}
                return json.dumps({'features':features,'exceededTransferLimit':bad=='truncated',**({'error':{'code':503}} if bad=='error' else {})}).encode()
            with self.subTest(bad=bad),patch.object(m,'fetch',side_effect=fetch),self.assertRaises(ValueError):m.fetch_ana_catalog()

    def test_timeout_retry_succeeds_and_failed_block_keeps_existing_catalog(self):
        from urllib.parse import urlparse, parse_qs
        attempts=[]
        class Response:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self,limit):return b'{"objectIdFieldName":"OBJECTID","objectIds":[]}'
        def open_request(req,timeout):
            attempts.append(timeout)
            if len(attempts)==1:raise TimeoutError('temporary delay')
            return Response()
        with patch.object(m,'urlopen',side_effect=open_request),patch.object(m.time,'sleep'):
            # Retry occurs in the shared fetch; the empty inventory is then rejected.
            with self.assertRaises(ValueError):m.fetch_ana_catalog()
        self.assertEqual(attempts,[30,30])
        data,_=self.fixture();before=copy.deepcopy(data)
        def fetch(url,**kwargs):
            q=parse_qs(urlparse(url).query)
            if 'returnIdsOnly' in q:return json.dumps({'objectIdFieldName':'OBJECTID','objectIds':list(range(536))}).encode()
            raise TimeoutError('block unavailable')
        with patch.object(m,'fetch',side_effect=fetch),self.assertRaises(TimeoutError):m.update_ana_catalog(data,'2026-11-12')
        self.assertEqual(data,before)

    def test_report_failure_does_not_block_catalog(self):
        data,raw=self.fixture()
        with patch.object(m,'update_ana_reports',side_effect=ValueError('daily offline')),patch.object(m,'fetch_ana_catalog',return_value=raw):r=m.update_ana(data,'2026-11-12')
        self.assertEqual(r['catalog']['state'],'ok');self.assertEqual(r['reports']['state'],'error');self.assertTrue(r['partial'])
        self.assertEqual(len(data['ana']),536)

    def test_catalog_failure_keeps_completed_report_update(self):
        data,_=self.fixture()
        def reports(d,t):d['anaDiary']={'kept':True};return {'records':8000,'updatedStates':0,'latestObservation':'2026-11-11'}
        with patch.object(m,'update_ana_reports',side_effect=reports),patch.object(m,'update_ana_catalog',side_effect=ValueError('catalog offline')):r=m.update_ana(data,'2026-11-12')
        self.assertEqual(data['anaDiary'],{'kept':True});self.assertEqual(r['catalog']['state'],'error');self.assertTrue(r['partial'])

if __name__=='__main__':unittest.main()
