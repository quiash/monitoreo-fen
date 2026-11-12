'use strict';
// Presentation and panel state; data filtering, readings and source dates remain in app.js.
const editorialUI={pane:'filters',filtersOpen:window.innerWidth>850,recordsOpen:false,recordsPinned:false,expanded:false,homes:null,restoreFilters:false};
const editorialLayerIds=['layerEvents','layerAna','layerBarriers','layer_additional','layer_hydro','layer_rain'];
const editorialViews={general:[1,1,1,1,1,1],emergencies:[1,0,0,0,0,0],interventions:[0,1,1,1,0,0],weather:[0,0,0,0,1,1]};
function editorialResize(){if(!map)return;requestAnimationFrame(()=>{map.invalidateSize();});}
function setEditorialSidebar(pane,open=true){
 editorialUI.pane=pane;editorialUI.filtersOpen=open;
 const sidebar=$('sidebar'),expanded=document.querySelector('.map-area').classList.contains('is-expanded');
 sidebar.hidden=!open;document.body.classList.toggle('filters-open',open);
 $('filterPane').hidden=pane!=='filters';$('layerPane').hidden=pane!=='layers';$('sidebarHeading').textContent=pane==='layers'?'Capas del mapa':'Filtros';
 $('filterToggle').setAttribute('aria-expanded',String(open&&pane==='filters'));$('layersToggle').setAttribute('aria-expanded',String(open&&pane==='layers'));
 $('presentationFilters').hidden=!(expanded&&open);document.querySelector('.map-area').classList.toggle('expanded-filters-open',expanded&&open);
 editorialResize();
}
function setEditorialRecords(open,pin=false){
 editorialUI.recordsOpen=open;if(pin)editorialUI.recordsPinned=open;
 const expanded=document.querySelector('.map-area').classList.contains('is-expanded');
 $('recordsPanel').hidden=expanded?false:!open;document.body.classList.toggle('records-open',open&&!expanded);
 $('recordsToggle').setAttribute('aria-expanded',String(open));
 if(expanded)setExpandedInfo(open);
 editorialResize();
}
function syncEditorial(){
 if(!$('presentationDate'))return;
 const day=$('dateEnd').value;$('presentationDate').textContent=day?fullDate(day):'';
 document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(editorialViews[button.dataset.view].every((v,i)=>Boolean(v)===$(editorialLayerIds[i]).checked))));
 document.querySelectorAll('[data-layer-options]').forEach(el=>{el.hidden=!$('layer_'+el.dataset.layerOptions).checked;});
 $('previousDay').disabled=dates.indexOf(day)<=0;$('nextDay').disabled=dates.indexOf(day)>=dates.length-1;
 document.querySelectorAll('.map-legend [data-symbol]').forEach(icon=>{const kind=icon.dataset.symbol,id={coen:'layerEvents',fire:'layerEvents',imminent:'layerEvents',ana:'layerAna',additional:'layer_additional',barrier:'layerBarriers',hydro:'layer_hydro'}[kind];if(id)icon.parentElement.hidden=!$(id).checked;});
 const counts=new Map();for(const r of DATA.events)if(eventBase(r))counts.set(r.date,(counts.get(r.date)||0)+1);
 const describe=day=>day>DATA.meta.coenDate?fullDate(day)+' · sin actualización COEN':fullDate(day)+' · '+(counts.get(day)||0).toLocaleString('es-PE')+' reportes COEN';
 $('chartReadout').textContent=describe(day);
 $('histogram').querySelectorAll('[data-day]').forEach(button=>{button.onmouseenter=()=>{$('chartReadout').textContent=describe(button.dataset.day);};button.onmouseleave=()=>{$('chartReadout').textContent=describe($('dateEnd').value);};button.onfocus=button.onmouseenter;button.onblur=button.onmouseleave;});
}
function setupEditorial(){
 $('filterToggle').onclick=()=>setEditorialSidebar('filters',!(editorialUI.filtersOpen&&editorialUI.pane==='filters'));
 $('layersToggle').onclick=()=>setEditorialSidebar('layers',!(editorialUI.filtersOpen&&editorialUI.pane==='layers'));
 $('closeFilters').onclick=()=>setEditorialSidebar(editorialUI.pane,false);
 $('recordsToggle').onclick=()=>{const expanded=document.querySelector('.map-area').classList.contains('is-expanded'),open=expanded?!$('expandedInfoHost').hidden:editorialUI.recordsOpen;setEditorialRecords(!open,true);};
 $('closeRecords').onclick=()=>setEditorialRecords(false,true);
 $('viewerToolsBtn').onclick=()=>{$('viewerTools').showModal();};$('closeViewerTools').onclick=()=>{$('viewerTools').close();};
 $('viewerTools').onclick=e=>{if(e.target===$('viewerTools'))$('viewerTools').close();};
 const key=$('keyBtn').onclick;$('keyBtn').onclick=e=>{$('viewerTools').close();if(key)key(e);};
 document.querySelectorAll('[data-view]').forEach(button=>{button.onclick=()=>{
  const values=editorialViews[button.dataset.view];stop();editorialLayerIds.forEach((id,i)=>{$(id).checked=Boolean(values[i]);});
  if(button.dataset.view==='weather'){$('rainStations').checked=false;}
  tab=({general:'events',emergencies:'events',interventions:'ana',weather:'hydro'})[button.dataset.view];limit=15;document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));
  editorialUI.recordsPinned=false;clearSelection(false);render();
 };});
 $('previousDay').onclick=()=>{const i=dates.indexOf($('dateEnd').value);if(i>0){stop();setEnd(dates[i-1]);}};
 $('nextDay').onclick=()=>{const i=dates.indexOf($('dateEnd').value);if(i>=0&&i<dates.length-1){stop();setEnd(dates[i+1]);}};
 $('timelineResize').onclick=()=>{const area=document.querySelector('.map-area'),large=area.classList.toggle('timeline-expanded');$('timelineResize').textContent=large?'Reducir gráfica':'Ampliar gráfica';$('timelineResize').setAttribute('aria-expanded',String(large));editorialResize();};
 $('presentationToggle').onclick=()=>setMapExpanded(!document.querySelector('.map-area').classList.contains('is-expanded'));
 new MutationObserver(()=>{$('play').setAttribute('data-playing',String(Boolean(timer)));}).observe($('play'),{childList:true});$('play').setAttribute('data-playing',String(Boolean(timer)));
 setEditorialSidebar('filters',editorialUI.filtersOpen);setEditorialRecords(false);
}
const setupBeforeEditorial=setupControls;
setupControls=function(){setupBeforeEditorial();setupEditorial();};
const renderBeforeEditorial=render;
render=function(){renderBeforeEditorial();syncEditorial();};
const selectBeforeEditorial=selectRecord;
selectRecord=function(type,id,zoom){selectBeforeEditorial(type,id,zoom);setEditorialRecords(true);if(window.innerWidth<=850)setEditorialSidebar(editorialUI.pane,false);};
const clearBeforeEditorial=clearSelection;
clearSelection=function(redraw=true){clearBeforeEditorial(redraw);if(!editorialUI.recordsPinned)setEditorialRecords(false);};
const expandedInfoBeforeEditorial=setExpandedInfo;
setExpandedInfo=function(open){expandedInfoBeforeEditorial(open);$('recordsToggle').setAttribute('aria-expanded',String(open));};
const expandedBeforeEditorial=setMapExpanded;
setMapExpanded=function(expanded){
 const area=document.querySelector('.map-area'),toolbar=$('viewerToolbar'),sidebar=$('sidebar');
 if(expanded){
  editorialUI.restoreFilters=editorialUI.filtersOpen;
  editorialUI.homes={toolbarParent:toolbar.parentNode,toolbarNext:toolbar.nextSibling,sidebarParent:sidebar.parentNode,sidebarNext:sidebar.nextSibling};
  area.appendChild(toolbar);$('presentationFilters').appendChild(sidebar);$('recordsPanel').hidden=false;
 }
 expandedBeforeEditorial(expanded);editorialUI.expanded=expanded;
 if(expanded){setEditorialSidebar(editorialUI.pane,false);editorialUI.recordsOpen=Boolean(selected);setEditorialRecords(Boolean(selected));}
 else{
  const h=editorialUI.homes;if(h){h.toolbarParent.insertBefore(toolbar,h.toolbarNext?.parentNode===h.toolbarParent?h.toolbarNext:null);h.sidebarParent.insertBefore(sidebar,h.sidebarNext?.parentNode===h.sidebarParent?h.sidebarNext:null);editorialUI.homes=null;}
  setEditorialSidebar(editorialUI.pane,editorialUI.restoreFilters);setEditorialRecords(editorialUI.recordsOpen);
 }
 $('presentationToggle').textContent=expanded?'Salir de proyección':'Proyectar';$('presentationToggle').setAttribute('aria-pressed',String(expanded));syncEditorial();editorialResize();
};

const temporalChartBeforeEditorial=temporalChart;
temporalChart=function(...args){return temporalChartBeforeEditorial(...args).replaceAll('#207fa4','#9a8161').replaceAll('#bf9743','#6b4e20').replaceAll('#dbe2e9','#ded7ce');};
