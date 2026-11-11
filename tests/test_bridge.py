import importlib.util,os,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('bridge_refresh',Path(__file__).resolve().parents[1]/'tools/refresh_data.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class BridgeTests(unittest.TestCase):
 def test_credential_only_goes_to_fixed_private_bridge(self):
  with patch.dict(os.environ,{'SENAMHI_BRIDGE_TOKEN':'test-secret'}):
   req=m.bridge_request(m.RAIN_PAGE);self.assertTrue(req.full_url.startswith(m.BRIDGE_ORIGIN+'/'));self.assertEqual(req.get_header('Oai-sites-authorization'),'Bearer test-secret');self.assertIsNone(m.bridge_request(m.ANA));self.assertIsNone(m.bridge_request(m.COEN));self.assertIsNone(m.bridge_request('https://example.com/'))
 def test_rank_and_daily_form_are_preserved(self):
  with patch.dict(os.environ,{'SENAMHI_BRIDGE_TOKEN':'test-secret'}):
   req=m.bridge_request(m.WCS+'?coverageId=monitoreo_meteorologico__prec_3');self.assertTrue(req.full_url.endswith('/v1/rain/surface?rank=3'))
   req=m.bridge_request(m.HYDRO,{'id':'105136','variable_opcion':'N'});self.assertIn(b'id=105136',req.data);self.assertEqual(req.get_method(),'POST')
 def test_unknown_senamhi_route_fails_closed(self):
  with patch.dict(os.environ,{'SENAMHI_BRIDGE_TOKEN':'test-secret'}):
   with self.assertRaises(ValueError):m.bridge_request(m.WCS+'?coverageId=unexpected')
 def test_missing_secret_uses_original_direct_source(self):
  with patch.dict(os.environ,{'SENAMHI_BRIDGE_TOKEN':''}):self.assertIsNone(m.bridge_request(m.RAIN_PAGE))
 def test_redirect_cannot_forward_credential(self):
  self.assertIsNone(m.NoBridgeRedirect().redirect_request(None,None,302,'Found',{},'https://example.com'))
