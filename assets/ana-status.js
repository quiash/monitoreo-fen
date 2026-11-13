'use strict';
function anaOfficialState(value){
 const text=String(typeof value==='object'?value?.ESTADO||'':value||'').trim();
 const normalized=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');
 if(/^(EJECUTAD[OA]|CULMINAD[OA]|CONCLUID[OA]|FINALIZAD[OA])$/.test(normalized))return {key:'completed',completed:true,color:'#2f7352',label:text};
 if(normalized==='EN EJECUCION')return {key:'executing',completed:false,color:'#164f78',label:text};
 if(['POR EJECUTAR','PROGRAMADO','PROGRAMADA'].includes(normalized))return {key:'pending',completed:false,color:'#8b98a4',label:text};
 return {key:normalized,completed:false,color:'#8b98a4',label:text||'Sin estado publicado'};
}
function anaProgressState(value){
 const official=anaOfficialState(value);
 if(value&&typeof value==='object'){
  const numeric=x=>x===null||x===undefined||String(x).trim()===''?null:Number(String(x).replace(',','.'));
  const target=numeric(value.META),done=numeric(value.AVANCEKM);
  if(Number.isFinite(target)&&target>0&&Number.isFinite(done)&&done>=target)return {...official,key:'completed',completed:true,color:'#2f7352',label:official.completed?official.label:'En ejecución al 100 % o más'};
 }
 return official;
}
function anaStatusMatches(value,filter){return !filter||anaProgressState(value).key===(['completed','executing','pending'].includes(filter)?filter:anaOfficialState(filter).key);}
