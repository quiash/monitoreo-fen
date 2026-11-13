import copy,importlib.util,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import build_runtime_data as m
from refresh_data import unpack

class RuntimeTests(unittest.TestCase):
 def test_lazy_surfaces_keep_history_and_source_archives(self):
  source={'ana':[],'events':[{'id':'1','date':'2026-11-12'}],'meta':{},'rainHistory':{'2026-11-12':{'geojsonGzip':'unchanged-geometry','stations':[{'value':0.1}],'gridFile':'data/rain-grid-2026-11-12.json'}},'hydroHistory':{'byStation':{'1':{'caudal':{'days':{'2026-11-11':{'value':0}}}}},'rawDailyGzip':'raw-original','snapshots':{'earlier':'original'}}}
  original=copy.deepcopy(source)
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'data').mkdir()
   (root/'data/manifest.json').write_text(json.dumps({'payloadSha256':'hash'}))
   (root/'data/status.json').write_text(json.dumps({'checkedAt':'2026-11-12T15:00:00-05:00'}))
   with patch.object(m,'load_base',return_value=source),patch.object(m,'load_live',return_value={}):m.build(root)
   view=json.loads((root/'data/view.json').read_text());data=unpack(view['data'])
   self.assertEqual(view['checkedAt'],'2026-11-12T15:00:00-05:00')
   self.assertEqual(data['hydroHistory']['byStation'],source['hydroHistory']['byStation'])
   self.assertEqual(data['events'],source['events'])
   rain=data['rainHistory']['2026-11-12']
   self.assertNotIn('geojsonGzip',rain)
   self.assertEqual(json.loads((root/rain['geometryFile']).read_text())['data'],'unchanged-geometry')
   self.assertEqual(rain['stations'],source['rainHistory']['2026-11-12']['stations'])
   self.assertEqual(source,original)
   self.assertNotIn('rawDailyGzip',data['hydroHistory'])
