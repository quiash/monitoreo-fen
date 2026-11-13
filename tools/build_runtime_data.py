"""Publish the viewer snapshot and daily rain surfaces without changing source data."""
from pathlib import Path
import copy, hashlib, json
from refresh_data import ROOT, load_base, load_live, hydrate, pack, dumps, atomic_json


def build(root=ROOT):
    manifest=json.loads((root/'data/manifest.json').read_text())
    status=json.loads((root/'data/status.json').read_text())
    data=hydrate(load_base(root),load_live(root))
    surfaces=[]
    for day,entry in data.get('rainHistory',{}).items():
        payload=entry.pop('geojsonGzip',None)
        if payload:
            digest=hashlib.sha256(payload.encode()).hexdigest()[:16]
            name=f'data/rain-surface-{day}-{digest}.json'
            if not (root/name).exists():atomic_json(root/name,{'encoding':'gzip-base64','data':payload})
            entry['geometryFile']=name;surfaces.append(name)
    # Original responses remain in the source payload used by full exports.
    for key in ('rawDailyGzip','previousHourlyGzip','snapshots'):
        data.get('hydroHistory',{}).pop(key,None)
    view={'schema':'fen-view/v1','baseSha256':manifest['payloadSha256'],
          'checkedAt':status.get('checkedAt'),'encoding':'gzip-base64','data':pack(data)}
    atomic_json(root/'data/view.json',view)
    return {'bytes':(root/'data/view.json').stat().st_size,'surfaces':len(surfaces)}

if __name__=='__main__':print(json.dumps(build()))
