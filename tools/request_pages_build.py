"""Request publication for the existing branch-based Pages configuration.
GITHUB_TOKEN commits do not automatically start Pages builds.
"""
import json, os, time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
base = 'https://api.github.com/repos/'+os.environ['GH_REPO']+'/pages/builds'
headers = {'Authorization':'Bearer '+os.environ['GH_TOKEN'], 'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'MonitoreoFEN-Actions'}
for attempt in range(12):
    try:
        with urlopen(Request(base, data=b'{}', headers=headers), timeout=30) as r:
            print('Publicación solicitada:', json.load(r)['status'])
        break
    except HTTPError as exc:
        if exc.code not in (409,429) or attempt == 11: raise
        time.sleep(15)
else: raise RuntimeError('No se pudo solicitar publicación')
