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
 for(const [path,id] of [['data/live.json','liveData'],['data/status.json','sourceStatusData']]){
  try{document.getElementById(id).textContent=await get(path);}catch(error){console.warn(error.message);window.__siteUpdateWarning='No se pudo cargar la actualización; se muestra la base disponible.';}
 }
}
function applySitePatch(target,patch){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))return patch;
 const result=target&&typeof target==='object'&&!Array.isArray(target)?target:{};
 for(const [key,value] of Object.entries(patch)){if(['__proto__','constructor','prototype'].includes(key))continue;result[key]=applySitePatch(result[key],value);}
 return result;
}
function applySiteUpdates(data){
 const originalCut=data.meta.anaDate;
 const history=new Map(data.ana.map(r=>[r.id,{...r.history,[data.meta.anaDate]:r.current,[data.meta.anaPreviousDate]:r.previous}]));
 try{const live=JSON.parse(document.getElementById('liveData')?.textContent||'null');if(live){if(live.schema!=='fen-live/v1'||live.encoding!=='gzip-base64')throw Error('Formato de actualización no reconocido.');const patch=JSON.parse(pako.ungzip(Uint8Array.from(atob(live.data),c=>c.charCodeAt(0)),{to:'string'}));data=applySitePatch(data,patch);}}catch(error){window.__siteUpdateWarning='Actualización no disponible: '+error.message;}
 for(const point of data.ana){point.currentSourceDate||=Object.prototype.hasOwnProperty.call(point.history||{},data.meta.anaDate)?data.meta.anaDate:originalCut;point.history={...history.get(point.id),...point.history};}
 return data;
}
function renderSourceStatus(data){
 const el=id=>document.getElementById(id),format=day=>day?new Date(day.slice(0,10)+'T12:00:00').toLocaleDateString('es-PE'):'Sin consulta válida';
 el('updateLabel').textContent='Datos al '+format(data.meta.updatedAt);
 if(el('mapPeriodNote'))el('mapPeriodNote').textContent='Periodo: '+format(data.meta.defaultStartDate)+'–'+format(data.meta.mapEndDate||data.meta.coenDate)+' · Cortes independientes por fuente.';
 if(el('rainAvailableNote'))el('rainAvailableNote').textContent='Lluvia disponible hasta '+format(data.meta.rainLatestEndDate)+'.';
 let status=null;try{status=JSON.parse(el('sourceStatusData').textContent||'null');}catch{}
 const names={coen:'COEN / INDECI',ana:'ANA · 536 puntos críticos',rain:'SENAMHI · lluvia',hydro:'SENAMHI · ríos',barriers:'Barreras dinámicas',additional:'94 adicionales ANA'};
 const fallback={coen:data.meta.coenDate,ana:data.meta.anaDate,rain:data.meta.rainLatestEndDate,hydro:data.hydroHistory?.sourceDate};
 const host=el('sourceUpdates');host.replaceChildren();
 const head=document.createElement('h3');head.textContent='Estado de actualización';host.appendChild(head);
 for(const [key,name] of Object.entries(names)){
  const value=status?.sources?.[key]||{},p=document.createElement('p');
  const state=value.state==='error'?'Último intento fallido; versión anterior conservada':(value.state==='partial'||key==='ana'&&Number.isFinite(value.updatedStates)&&value.updatedStates<data.ana.length)?'Actualización parcial; se conservan registros sin respuesta':value.state==='manual'?'Catálogo de referencia':'Consulta automática';
  p.textContent=name+' · '+format(value.cut||fallback[key])+' · '+state+'.';host.appendChild(p);
 }
 if(status?.checkedAt){const p=document.createElement('p');p.textContent='Última comprobación: '+new Date(status.checkedAt).toLocaleString('es-PE',{timeZone:'America/Lima'})+' · hora Perú.';host.appendChild(p);}
 if(window.__siteUpdateWarning){const p=document.createElement('p');p.textContent=window.__siteUpdateWarning;host.appendChild(p);}
 const cards=el('method').querySelectorAll('.source-card');
 if(cards[5]){const p=cards[5].querySelector('p');if(p)p.textContent='SENAMHI · '+Object.keys(data.rainHistory).length+' acumulados diarios conservados. Último periodo: '+format(data.rainSurface.periodStart)+' 07:00–'+format(data.rainSurface.periodEnd)+' 07:00, hora Perú. Superficie derivada de la grilla oficial; estaciones con valores observados. Las fechas sin capa se indican sin sustituir datos.';}
 if(cards[0]){cards[0].replaceChildren();const p=document.createElement('p');p.textContent='COEN / INDECI · '+data.events.length.toLocaleString('es-PE')+' registros conservados. Corte de consulta '+format(data.meta.coenDate)+'. Las cifras verificadas se conservan mientras no cambie el PDF. Reportes nuevos o con documento modificado pendientes de revisión. Las emergencias no se atribuyen automáticamente al FEN.';cards[0].appendChild(p);}
 if(cards[1]){cards[1].replaceChildren();const p=document.createElement('p');p.textContent='ANA · inventario de 536 puntos. Atributos consultados al '+format(data.meta.anaDate)+'. Diario: '+data.anaDiary.sourceRowCount.toLocaleString('es-PE')+' filas; '+data.anaDiary.matchedPoints+' puntos vinculados por ficha. Normas y periodos separados. Se excluyen fechas futuras de los cálculos. La suma diaria puede diferir del acumulado oficial. Trazados conservados del inventario original.';cards[1].appendChild(p);}
}
async function createPortableSiteTemplate(){
 if(!window.__siteAssets)return;
 const values=new Map();await Promise.all(window.__siteAssets.map(async path=>{const response=await fetch(path);if(!response.ok)throw Error('No se pudo preparar la copia portable.');values.set(path,await response.text());}));
 let html=window.__TERRITORIO_TEMPLATE__;
 html=html.replace(/<script([^>]*?)\s+src="([^"]+)"([^>]*)>\s*<\/script>/g,(tag,before,path,after)=>values.has(path)?'<script'+before+after+'>'+values.get(path).replace(/<\/script/gi,'<\\/script')+'<'+ '/script>':tag);
 html=html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?\s*>/g,(tag,path)=>values.has(path)?'<style>'+values.get(path)+'</style>':tag);
 for(const id of ['embeddedData','rainClimateReference','liveData','sourceStatusData']){const payload=document.getElementById(id).textContent.replace(/</g,'\\u003c');html=html.replace(new RegExp('(<script\\b[^>]*id="'+id+'"[^>]*>)[\\s\\S]*?(<\\/script\\s*>)'),(_,open,close)=>open+payload+close);}
 window.__TERRITORIO_TEMPLATE__=html;
}
