
'use strict';
window.localMapControls=(()=>{
 const el=id=>document.getElementById(id),storage='territorio-maptiler-html-v2';
 let view,key='',mode='vector',base='map',controller=null,revision=0,resourceFailed=false;
 const attribution='<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">© MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';
 function message(text,kind='info'){
  el('configStatus').textContent=text;el('configStatus').dataset.kind=kind;
  el('mapConnection').textContent=kind==='error'?'Error de conexión':kind==='ok'?'Conectado':key?'Conectando…':'Sin configurar';el('mapConnection').dataset.kind=kind;
 }
 function warn(text){el('tileWarning').textContent=text;el('tileWarning').hidden=false;}
 function show(){el('originValue').textContent=location.protocol==='file:'?'Archivo local':location.origin;el('originHelp').textContent=location.protocol==='file:'?'HTML local: use una clave exclusiva de prueba sin restricción de dominio. La regla 127.0.0.1 no aplica.':'Autorice este dominio en Allowed HTTP origins de MapTiler.';el('mapKey').value=key;el('renderMode').value=mode;el('mapConfig').showModal();}
 function hide(){el('mapConfig').close();el('mapKey').value='';}
 function failure(status){
  if(status===401)return '401: clave no válida.';
  if(status===403)return '403: acceso denegado. Revise clave, origen y permisos en MapTiler.';
  if(status===404)return 'Estilo no encontrado (404). Comprueba el identificador en Opciones avanzadas.';
  if(status===429)return 'Limite de solicitudes (429). Revisa la cuota de MapTiler.';
  return status?'MapTiler: HTTP '+status+'.':'No se pudo cargar el fondo. Revise conexión y permisos.';
 }
 function setOpenStreetMap(){
  if(controller)controller.abort();const version=++revision;base='map';
  el('tileWarning').hidden=true;
  view.setBackground(null,'raster','https://tile.openstreetmap.org/{z}/{x}/{y}.png','© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
   ()=>{if(version===revision){message('OpenStreetMap · sin clave.','ok');el('mapConnection').textContent='OpenStreetMap';el('tileWarning').hidden=true;}},
   ()=>{if(version===revision){message('Fondo temporalmente no disponible.','error');warn('No se pudo cargar OpenStreetMap. Los registros siguen disponibles.');}});
  el('baseMap').classList.add('active');el('baseSatellite').classList.remove('active');
  message('Cargando OpenStreetMap…');
  return true;
 }
 async function setBase(wanted){
  if(wanted==='map')return setOpenStreetMap();
  if(!key){show();return false;}
  const styleId=(wanted==='satellite'?el('satelliteStyle').value:el('streetStyle').value).trim();
  if(!/^[A-Za-z0-9_-]+$/.test(styleId)){message('Introduce el identificador del estilo, sin URL.','error');return false;}
  if(mode==='vector'&&!view.supportsVector()){message('WebGL 2 no disponible. Pruebe otro navegador o modo raster, según plan.','error');return false;}
  if(controller)controller.abort();controller=new AbortController();const local=controller,version=++revision;let timedOut=false;
  const timeout=setTimeout(()=>{timedOut=true;local.abort();},20000);
  message('Comprobando acceso al fondo…');
  try{
   const response=await fetch('https://api.maptiler.com/maps/'+encodeURIComponent(styleId)+'/style.json?key='+encodeURIComponent(key),{signal:local.signal,credentials:'omit'});
   if(!response.ok){
    let text=failure(response.status);
    if(response.status===403){
     const detail=(await response.text()).slice(0,4096).toLowerCase();
     if(/origin|referer|referrer|domain/.test(detail))text='403: restricción de origen o dominio en la clave.';
     else if(/subscription|payment|paid plan|pricing plan|upgrade/.test(detail))text='403: el plan no habilita este recurso.';
    }
    message(text,'error');warn(text);return false;
   }
   const style=await response.json();if(version!==revision)return false;
   if(style.version!==8||!style.sources||!Array.isArray(style.layers)){message('La respuesta no es un estilo cartografico reconocido.','error');return false;}
   resourceFailed=false;el('tileWarning').hidden=true;
   view.setBackground(style,mode,'https://api.maptiler.com/maps/'+encodeURIComponent(styleId)+'/256/{z}/{x}/{y}.png?key='+encodeURIComponent(key),attribution,
    ()=>{if(version===revision&&!resourceFailed){message('Conexión establecida.','ok');el('tileWarning').hidden=true;}},
    event=>{if(version!==revision)return;resourceFailed=true;const text=failure(Number(event?.error?.status)||0);message(text,'error');warn(text);});
   base=wanted;el('baseMap').classList.toggle('active',base==='map');el('baseSatellite').classList.toggle('active',base==='satellite');
   message('Estilo aceptado. Cargando el fondo…');return true;
  }catch(error){
   if(error.name==='AbortError'&&!timedOut)return false;
   const text=timedOut?'MapTiler no respondio en 20 segundos. Comprueba la red.':error.message==='webgl'?'WebGL 2 no esta disponible. Prueba otro navegador.':failure(0);
   message(text,'error');warn(text);return false;
  }finally{clearTimeout(timeout);}
 }
 function forget(){++revision;if(controller)controller.abort();key='';el('mapKey').value='';el('rememberKey').checked=false;try{localStorage.removeItem(storage);}catch{}setOpenStreetMap();}
 function makeConfiguredDocument(template,settings){
  if(!/^[A-Za-z0-9_-]{8,256}$/.test(settings.key||''))throw Error('Clave no válida.');
  const pattern=/(<script\b[^>]*\bid=["']startupConfig["'][^>]*>)[\s\S]*?(<\/script\s*>)/i;
  if(!pattern.test(template))throw Error('No se encontró la configuración del HTML.');
  const payload=JSON.stringify(settings).replace(/</g,'\\u003c');
  return template.replace(pattern,(_,open,close)=>open+payload+close);
 }
 function saveConfigured(){
  const value=el('mapKey').value.trim()||key;
  try{
   const html=makeConfiguredDocument(window.__TERRITORIO_TEMPLATE__,{key:value,mode:el('renderMode').value,street:el('streetStyle').value.trim(),satellite:el('satelliteStyle').value.trim(),autoConnect:true});
   const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
   const a=document.createElement('a');a.href=url;a.download='Monitor_Territorial_COEN_ANA_Config.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   message('Copia configurada descargada. La clave se cargará automáticamente.');
  }catch(error){message(error.message,'error');}
 }
 function init(mapView){
  view=mapView;mode=view.kind;
  el('keyBtn').onclick=show;el('closeConfig').onclick=hide;el('noBackground').onclick=hide;el('forgetKey').onclick=forget;
  el('saveConfigured').onclick=saveConfigured;
  el('baseMap').onclick=()=>setBase('map');el('baseSatellite').onclick=()=>setBase('satellite');
  el('showKey').onclick=()=>{el('mapKey').type=el('mapKey').type==='password'?'text':'password';el('showKey').textContent=el('mapKey').type==='password'?'Mostrar':'Ocultar';};
  el('mapKeyForm').onsubmit=async event=>{
   event.preventDefault();const value=el('mapKey').value.trim();if(!/^[A-Za-z0-9_-]{8,256}$/.test(value)){message('Pega solo la clave, sin URL, espacios ni comillas.','error');return;}
   key=value;mode=el('renderMode').value;el('applyKey').disabled=true;
   try{
    if(await setBase('satellite')){
     try{if(el('rememberKey').checked)localStorage.setItem(storage,JSON.stringify({key,mode,street:el('streetStyle').value,satellite:el('satelliteStyle').value}));else localStorage.removeItem(storage);}catch{}
     hide();
    }
   }finally{el('applyKey').disabled=false;}
  };
  let saved=null;
  try{const configured=JSON.parse(document.getElementById('startupConfig')?.textContent||'{}');if(configured.key)saved=configured;}catch{}
  if(!saved)try{saved=JSON.parse(localStorage.getItem(storage)||'null');}catch{}
  if(saved?.key){key=saved.key;mode=saved.mode==='raster'?'raster':'vector';el('streetStyle').value=saved.street||'streets-v4';el('satelliteStyle').value=saved.satellite||'hybrid-v4';el('rememberKey').checked=!saved.autoConnect;}
  setOpenStreetMap();
 }
 return {init,makeConfiguredDocument};
})();

