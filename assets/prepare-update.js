'use strict';
async function prepareSiteUpdate(source,loader){
 const files=new Map(),put=(name,text)=>files.set(name,text),capture=(id,html)=>html.match(new RegExp('<script id="'+id+'"[^>]*>([\\s\\S]*?)<\\/script>'));
 const base=capture('embeddedData',source);if(!base)throw Error('El HTML no contiene la base del mapa.');const packed=JSON.parse(base[1]);if(packed.encoding!=='gzip-base64'||!packed.data)throw Error('Selecciona una copia portable con la base integrada.');
 const metadata=JSON.parse(pako.ungzip(Uint8Array.from(atob(packed.data),c=>c.charCodeAt(0)),{to:'string'})).meta;
 const ref=capture('rainClimateReference',source);if(!ref)throw Error('No se encontró la referencia histórica.');JSON.parse(ref[1]);put('data/reference.json',ref[1]);
 const parts=[];for(let start=0,i=0;start<packed.data.length;start+=1500000,i++){const name='data/base-'+String(i).padStart(3,'0')+'.txt';put(name,packed.data.slice(start,start+1500000));parts.push(name);}
 let html=source.replace(base[1],JSON.stringify({encoding:'gzip-base64',data:''}));html=html.replace(/(<script id="rainClimateReference"[^>]*>)[\s\S]*?(<\/script>)/,(_,a,b)=>a+'null'+b);
 const styles=[];html=html.replace(/<style[^>]*>([\s\S]*?)<\/style>/g,(_,css)=>{styles.push(css);return '';});put('assets/site.css',styles.join('\n'));html=html.replace('</head>','<link rel="stylesheet" href="assets/site.css"></head>');
 put('assets/web-loader.js',loader);const assets=['assets/site.css','assets/web-loader.js'];
 html=html.replace(/<script([^>]*)>([\s\S]*?)<\/script>/g,(tag,attrs,body)=>{if(attrs.includes('application/json'))return tag;const module=attrs.match(/data-module="([^"]+)"/);if(!module)throw Error('Script sin nombre de módulo.');const name=module[1];if(name==='web-loader')return '';
  if(name==='app')body=body.replaceAll('await prepareWebData();','').replaceAll('await createPortableSiteTemplate();','').replace('DATA=readEmbeddedData();','await prepareWebData();await createPortableSiteTemplate();DATA=readEmbeddedData();');
  const path='assets/'+name+'.js';put(path,body);assets.push(path);const script='<script data-module="'+name+'" src="'+path+'"><'+ '/script>';return (name==='app'?'<script data-module="web-loader" src="assets/web-loader.js"><'+ '/script>':'')+script;
 });
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(packed.data))),hash=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
 put('index.html',html);put('.nojekyll','');put('data/manifest.json',JSON.stringify({schema:'fen-site/v1',snapshotDate:metadata.coenDate,payloadCharacters:packed.data.length,payloadSha256:hash,parts,reference:'data/reference.json',assets},null,2)+'\n');return files;
}
function zipSiteFiles(files){
 const encoder=new TextEncoder(),table=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;}),crc=bytes=>{let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
 const local=[],central=[];let offset=0,centralSize=0;for(const [path,text] of files){const name=encoder.encode(path),data=encoder.encode(text),checksum=crc(data),header=new Uint8Array(30+name.length),h=new DataView(header.buffer);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint32(14,checksum,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);header.set(name,30);local.push(header,data);
  const entry=new Uint8Array(46+name.length),v=new DataView(entry.buffer);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint32(16,checksum,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);v.setUint16(28,name.length,true);v.setUint32(42,offset,true);entry.set(name,46);central.push(entry);centralSize+=entry.length;offset+=header.length+data.length;
 }
 const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.size,true);e.setUint16(10,files.size,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);return new Blob([...local,...central,end],{type:'application/zip'});
}
