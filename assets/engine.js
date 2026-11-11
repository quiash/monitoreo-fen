
'use strict';
// Solo hay un motor activo. Fondo y capas comparten su camara y sus controles.
window.TerritoryMap=class {
 constructor(id,onSelect){
  this.id=id;this.onSelect=onSelect;this.engine=null;this.kind=null;
  this.state={data:{events:[],ana:[],barriers:[]},selected:null,visible:{events:true,ana:true,barriers:true},snapshot:'current'};
  this.layers=null;this.nativeMarkers=[];this.lastCenter=[-10,-75.7];this.lastZoom=5;
  this.changeMode('raster');
 }
 supportsVector(){
  try{const c=document.createElement('canvas').getContext('webgl2');if(!c)return false;c.getExtension('WEBGL_lose_context')?.loseContext();return true;}catch{return false;}
 }
 changeMode(kind){
  if(this.engine&&this.kind===kind)return;
  if(kind==='vector'&&!this.supportsVector())throw Error('webgl');
  if(this.engine){
   const center=this.kind==='vector'?this.engine.getCenter():this.engine.getCenter();
   this.lastCenter=[center.lat,center.lng];this.lastZoom=this.engine.getZoom();
   this.nativeMarkers.forEach(m=>m.remove());this.nativeMarkers=[];this.engine.remove();
  }
  document.getElementById(this.id).replaceChildren();this.kind=kind;this.background=null;this.styleReady=false;
  if(kind==='vector'){
   this.engine=new maplibregl.Map({container:this.id,center:[this.lastCenter[1],this.lastCenter[0]],zoom:this.lastZoom,minZoom:2,maxZoom:20,dragRotate:false,touchPitch:false,style:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#edf0f3'}}]},attributionControl:true});
   this.engine.touchZoomRotate.disableRotation();
   this.engine.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-right');
   this.engine.on('style.load',()=>{this.styleReady=true;this.drawState();});
   this.engine.on('click',e=>{
    const ids=['territorio-events','territorio-lines'].filter(id=>this.engine.getLayer(id));
    if(!ids.length)return;
    const hit=this.engine.queryRenderedFeatures([[e.point.x-5,e.point.y-5],[e.point.x+5,e.point.y+5]],{layers:ids})[0];
    if(hit)this.onSelect(hit.properties.recordType,String(hit.properties.recordId));
   });
   this.engine.on('mousemove',e=>{
    const ids=['territorio-events','territorio-lines'].filter(id=>this.engine.getLayer(id));
    const hit=ids.length?this.engine.queryRenderedFeatures(e.point,{layers:ids})[0]:null;
    this.engine.getCanvas().style.cursor=hit?'pointer':'';
   });
  }else{
   this.engine=L.map(this.id,{zoomControl:false,preferCanvas:true,minZoom:2,maxZoom:20}).setView(this.lastCenter,this.lastZoom);
   L.control.zoom({position:'bottomright'}).addTo(this.engine);
   this.layers={ana:L.featureGroup().addTo(this.engine),events:L.featureGroup().addTo(this.engine),barriers:L.featureGroup().addTo(this.engine)};
  }
  this.drawState();
 }
 draw(data,selected,visible,snapshot){this.state={data,selected,visible,snapshot};this.drawState();}
 drawState(){
  const {data,selected,visible,snapshot}=this.state;
  const color=a=>a.ESTADO==='Ejecutado'?'#348778':a.ESTADO==='En Ejecución'?'#164f78':'#8b98a4';
  this.nativeMarkers.forEach(m=>m.remove());this.nativeMarkers=[];
  if(this.kind==='raster'){
   Object.values(this.layers).forEach(g=>g.clearLayers());
   if(visible.ana)data.ana.forEach(r=>{const chosen=selected?.type==='ana'&&selected.id===r.id;L.polyline(r.paths,{color:chosen?'#c3a365':(window.anaMapColor?window.anaMapColor(r,snapshot):color(r[snapshot])),weight:chosen?6:3,opacity:.8}).addTo(this.layers.ana).on('click',()=>this.onSelect('ana',r.id));});
   return;
  }
  const m=this.engine;if(!this.styleReady)return;
  const features=visible.ana?data.ana.map(r=>({type:'Feature',properties:{recordType:'ana',recordId:r.id,color:selected?.type==='ana'&&selected.id===r.id?'#c3a365':(window.anaMapColor?window.anaMapColor(r,snapshot):color(r[snapshot])),width:selected?.type==='ana'&&selected.id===r.id?6:3},geometry:{type:'MultiLineString',coordinates:r.paths.map(p=>p.map(c=>[c[1],c[0]]))}})):[];
  const collection={type:'FeatureCollection',features};
  if(m.getSource('territorio-lines'))m.getSource('territorio-lines').setData(collection);else m.addSource('territorio-lines',{type:'geojson',data:collection});
  if(!m.getLayer('territorio-lines'))m.addLayer({id:'territorio-lines',source:'territorio-lines',type:'line',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':['get','width'],'line-opacity':.8}});
 }
 setBackground(style,mode,rasterUrl,attribution,onReady,onError){
  this.changeMode(mode);
  if(mode==='vector'){
   this.engine.once('idle',onReady);
   if(this.errorListener)this.engine.off('error',this.errorListener);
   this.errorListener=onError;this.engine.on('error',onError);
   this.styleReady=false;this.engine.setStyle(style,{diff:false});
  }else{
   if(this.background)this.engine.removeLayer(this.background);
   this.background=L.tileLayer(rasterUrl,{maxZoom:20,maxNativeZoom:rasterUrl.includes('tile.openstreetmap.org')?19:20,updateWhenIdle:true,keepBuffer:1,attribution}).addTo(this.engine);
   this.background.on('tileload',onReady);this.background.on('tileerror',()=>onError({error:{status:0}}));
   this.drawState();
  }
 }
 clearBackground(){
  if(this.kind==='vector'){this.styleReady=false;this.engine.setStyle({version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#edf0f3'}}]},{diff:false});}
  else if(this.background){this.engine.removeLayer(this.background);this.background=null;}
 }
 fitCoords(coords,maxZoom=13){
  if(!coords.length)return this.setView([-10,-75.7],5);
  if(this.kind==='vector'){
   const b=new maplibregl.LngLatBounds();coords.forEach(p=>b.extend([p[1],p[0]]));this.engine.fitBounds(b,{padding:{top:100,bottom:50,left:40,right:40},maxZoom,duration:450});
  }else this.engine.fitBounds(L.latLngBounds(coords),{padding:[45,70],maxZoom});
 }
 setView(coords,zoom){if(this.kind==='vector')this.engine.easeTo({center:[coords[1],coords[0]],zoom,duration:450});else this.engine.setView(coords,zoom);}
 getZoom(){return this.engine.getZoom();}
 invalidateSize(){if(this.kind==='vector')this.engine.resize();else this.engine.invalidateSize();}
};

