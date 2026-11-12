"""Validate that the published payload is complete and matches the manifest."""
from pathlib import Path
import json,hashlib,base64,gzip,re
root=Path(__file__).resolve().parents[1]
m=json.loads((root/'data/manifest.json').read_text())
assert m['schema']=='fen-site/v1'
payload=''.join((root/p).read_text() for p in m['parts'])
assert len(payload)==m['payloadCharacters'],'Incomplete payload'
assert hashlib.sha256(payload.encode()).hexdigest()==m['payloadSha256'],'Payload checksum mismatch'
d=json.loads(gzip.decompress(base64.b64decode(payload)))
assert d['meta']['coenDate']==m['snapshotDate']
reference=json.loads((root/m['reference']).read_text())
if reference and reference.get('encoding')=='gzip-base64-parts':
    reference=json.loads(gzip.decompress(base64.b64decode(''.join((root/p).read_text() for p in reference['parts']))))
assert reference is None or reference['schema']=='fen-rain-reference/v1'
html=(root/'index.html').read_text()
for url in re.findall(r'<script[^>]*src="([^"]+)"',html)+re.findall(r'<link[^>]*href="([^"]+)"',html):
    assert (root/url.split('?',1)[0]).is_file(),url
for asset in m['assets']:assert (root/asset).is_file(),asset
print('OK: base íntegra, referencias y archivos completos. Corte:',m['snapshotDate'])
