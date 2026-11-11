'use strict';
async function prepareWebData(){
 const embedded=document.getElementById('embeddedData');
 try{if(JSON.parse(embedded.textContent||'null')?.data)return;}catch{}
 const get=async path=>{const response=await fetch(path,{cache:'no-cache'});if(!response.ok)throw Error('No se pudo cargar '+path+' ('+response.status+').');return response.text();};
 const manifest=JSON.parse(await get('data/manifest.json'));
 if(manifest.schema!=='fen-site/v1'||!Array.isArray(manifest.parts)||!manifest.parts.length)throw Error('Manifiesto de datos no válido.');
 const text=new Array(manifest.parts.length);let cursor=0;
 await Promise.all(Array.from({length:Math.min(4,manifest.parts.length)},async()=>{while(cursor<manifest.parts.length){const i=cursor++;text[i]=await get(manifest.parts[i]);}}));
 const payload=text.join('');if(payload.length!==manifest.payloadCharacters)throw Error('La base descargada está incompleta.');
 embedded.textContent=JSON.stringify({encoding:'gzip-base64',data:payload});
 document.getElementById('rainClimateReference').textContent=await get(manifest.reference);
 window.__siteAssets=manifest.assets;
 window.__siteSnapshot=manifest.snapshotDate;
}
async function createPortableSiteTemplate(){
 if(!window.__siteAssets)return;
 const values=new Map();await Promise.all(window.__siteAssets.map(async path=>{const response=await fetch(path);if(!response.ok)throw Error('No se pudo preparar la copia portable.');values.set(path,await response.text());}));
 let html=window.__TERRITORIO_TEMPLATE__;
 html=html.replace(/<script([^>]*?)\s+src="([^"]+)"([^>]*)>\s*<\/script>/g,(tag,before,path,after)=>values.has(path)?'<script'+before+after+'>'+values.get(path).replace(/<\/script/gi,'<\\/script')+'<'+ '/script>':tag);
 html=html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?\s*>/g,(tag,path)=>values.has(path)?'<style>'+values.get(path)+'</style>':tag);
 for(const id of ['embeddedData','rainClimateReference']){const payload=document.getElementById(id).textContent.replace(/</g,'\\u003c');html=html.replace(new RegExp('(<script\\b[^>]*id="'+id+'"[^>]*>)[\\s\\S]*?(<\\/script\\s*>)'),(_,open,close)=>open+payload+close);}
 window.__TERRITORIO_TEMPLATE__=html;
}
