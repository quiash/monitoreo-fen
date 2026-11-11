"""Build the static website from the self-contained FEN HTML. Python stdlib only."""
from pathlib import Path
import argparse,re,json,hashlib,base64,gzip

def build(source,destination):
    root=Path(destination);root.mkdir(parents=True,exist_ok=True)
    html=Path(source).read_text(encoding='utf-8')
    def write(name,text):
        p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text,encoding='utf-8')
    match=re.search(r'<script id="embeddedData"[^>]*>([\s\S]*?)</script>',html)
    if not match:raise ValueError('No hay base integrada en el HTML.')
    payload=json.loads(match[1]);data=payload.get('data')
    if payload.get('encoding')!='gzip-base64' or not data:raise ValueError('Base integrada incompleta.')
    metadata=json.loads(gzip.decompress(base64.b64decode(data)))['meta']
    reference=re.search(r'<script id="rainClimateReference"[^>]*>([\s\S]*?)</script>',html)
    json.loads(reference[1])
    parts=[]
    for i,start in enumerate(range(0,len(data),1500000)):
        name=f'data/base-{i:03}.txt';write(name,data[start:start+1500000]);parts.append(name)
    write('data/reference.json',reference[1])
    html=html[:match.start(1)]+json.dumps({'encoding':'gzip-base64','data':''},separators=(',',':'))+html[match.end(1):]
    html=re.sub(r'(<script id="rainClimateReference"[^>]*>)[\s\S]*?(</script>)',r'\1null\2',html,count=1)
    styles=[]
    def style(m):styles.append(m[1]);return ''
    html=re.sub(r'<style[^>]*>([\s\S]*?)</style>',style,html)
    write('assets/site.css','\n'.join(styles));html=html.replace('</head>','<link rel="stylesheet" href="assets/site.css"></head>',1)
    assets=['assets/site.css','assets/web-loader.js']
    def script(m):
        attrs,body=m[1],m[2]
        if 'application/json' in attrs:return m[0]
        module=re.search(r'data-module="([^"]+)"',attrs)
        if not module:raise ValueError('Script sin nombre de módulo.')
        name=module[1]
        if name=='web-loader':return ''
        if name=='app':
            body=body.replace('await prepareWebData();','').replace('await createPortableSiteTemplate();','')
            body=body.replace('DATA=readEmbeddedData();','await prepareWebData();await createPortableSiteTemplate();DATA=readEmbeddedData();',1)
        path=f'assets/{name}.js';write(path,body);assets.append(path)
        tag=f'<script data-module="{name}" src="{path}"></script>'
        return ('<script data-module="web-loader" src="assets/web-loader.js"></script>'+tag) if name=='app' else tag
    html=re.sub(r'<script([^>]*)>([\s\S]*?)</script>',script,html)
    write('index.html',html);write('.nojekyll','')
    manifest={'schema':'fen-site/v1','snapshotDate':metadata.get('coenDate'),'payloadCharacters':len(data),'payloadSha256':hashlib.sha256(data.encode()).hexdigest(),'parts':parts,'reference':'data/reference.json','assets':assets}
    write('data/manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'snapshot':manifest['snapshotDate'],'files':len(parts)+len(assets)+4,'payloadCharacters':len(data)}))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('html');parser.add_argument('--output',default='.')
    args=parser.parse_args();build(args.html,args.output)
