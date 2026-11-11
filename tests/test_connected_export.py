import importlib.util,json,hashlib,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('connected',Path(__file__).resolve().parents[1]/'tools/export_connected_update.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class ConnectedExportTests(unittest.TestCase):
 def test_chunks_reconstruct_utf8_and_exact_git_blob(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);(root/'data').mkdir();original=json.dumps({'dato':'lluvia Perú ñ'*30000},ensure_ascii=False)+'\n'
   for name in ['live.json','status.json']:(root/'data'/name).write_text(original,encoding='utf-8')
   out=root/'out';manifest=m.export(out,root)
   for entry in manifest['files']:
    chunks=[(out/p).read_text(encoding='utf-8') for p in entry['parts']];self.assertTrue(all(len(c)<=150000 for c in chunks));self.assertEqual(''.join(chunks),original)
    raw=original.encode();self.assertEqual(entry['gitBlobSha'],hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest())
 def test_rejects_invalid_payload(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);(root/'data').mkdir();(root/'data/live.json').write_text('{broken')
   with self.assertRaises(json.JSONDecodeError):m.export(root/'out',root)
