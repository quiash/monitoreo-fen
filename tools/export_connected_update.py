"""Prepare lossless, bounded chunks for publishing data through a connected Git API.

Run after refresh_data.py and validate_live.py. Output contains only public FEN
observations/status, never credentials. The Git blob hash verifies exact upload.
"""
from pathlib import Path
import argparse, hashlib, json
ROOT=Path(__file__).resolve().parents[1]

def export(directory, root=ROOT):
    directory.mkdir(parents=True,exist_ok=True)
    result=[]
    for name in ['live.json','status.json']:
        raw=(root/'data'/name).read_bytes()
        json.loads(raw) # Fail before publishing malformed JSON.
        content=raw.decode('utf-8')
        parts=[]
        for index,start in enumerate(range(0,len(content),150000)):
            filename=f'{name}.part-{index:03}.txt'
            (directory/filename).write_text(content[start:start+150000],encoding='utf-8')
            parts.append(filename)
        digest=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
        result.append({'path':'data/'+name,'characters':len(content),'bytes':len(raw),'gitBlobSha':digest,'parts':parts})
    manifest={'schema':'fen-connected-export/v1','files':result}
    (directory/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    return manifest

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True)
    print(json.dumps(export(parser.parse_args().output),ensure_ascii=False))
