'use strict';
function anaOfficialState(value){
 const text=String(typeof value==='object'?value?.ESTADO||'':value||'').trim();
 const normalized=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');
 if(/^(EJECUTAD[OA]|CULMINAD[OA]|CONCLUID[OA]|FINALIZAD[OA])$/.test(normalized))return {key:'completed',completed:true,color:'#2f7352',label:text};
 if(normalized==='EN EJECUCION')return {key:'executing',completed:false,color:'#164f78',label:text};
 if(['POR EJECUTAR','PROGRAMADO','PROGRAMADA'].includes(normalized))return {key:'pending',completed:false,color:'#8b98a4',label:text};
 return {key:normalized,completed:false,color:'#8b98a4',label:text||'Sin estado publicado'};
}
function anaStatusMatches(value,filter){return !filter||anaOfficialState(value).key===(['completed','executing','pending'].includes(filter)?filter:anaOfficialState(filter).key);}
