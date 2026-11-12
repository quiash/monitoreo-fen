
'use strict';
const $=id=>document.getElementById(id), esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(x,d=1)=>x===null||x===undefined||x===''?'Sin dato':new Intl.NumberFormat('es-PE',{maximumFractionDigits:d}).format(Number(x));
const norm=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[-–]/g,' ').replace(/\s+/g,' ').trim().replace('LURIGANCHO CHOSICA','LURIGANCHO');
const title=x=>String(x??'').toLocaleLowerCase('es').replace(/(^|\s)\S/g,c=>c.toLocaleUpperCase('es')).replace(/(\s)(De|Del|La|El|Los|Las|Y|Por)(?=\s)/g,(_,space,word)=>space+word.toLowerCase());
const shortDate=x=>x?new Date(x.slice(0,10)+'T12:00:00').toLocaleDateString('es-PE',{day:'2-digit',month:'short'}):'Sin fecha';
const fullDate=x=>x?new Date(x.slice(0,10)+'T12:00:00').toLocaleDateString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric'}):'Sin fecha';
const msDate=x=>typeof x==='number'?new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(x)):'Sin fecha';
const link=(url,label)=>/^https:\/\//.test(url||'')?`<a class="source-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';
const metricName=x=>{const t=x.replace(/_propuesta$/,'').replace(/_/g,' ').toLocaleLowerCase('es');return t.charAt(0).toLocaleUpperCase('es')+t.slice(1);};
const hydroCodes=new Set(['3200','3300','2400','3600','3E00','2210','2220','3110','2300','3A00','3C00','5510','2100','3150']);
let DATA,map,filtered={events:[],ana:[],barriers:[]},groups={},selected=null,tab='events',limit=15,timer=null,dates=[],selectedMapLayer=null;
const colors={ana:'#003b70',pending:'#87919b',event:'#b69a58',fire:'#9c4d4a',exposure:'#827395'};
const initialDetail=$('detail').innerHTML;
function labelState(s){return ({contrastado_muestra:'Contrastado con PDF',propuesta_revisar:'Pendiente de validación',sin_tabla_cuantificada:'Sin tabla cuantificada',peligro_inminente:'Exposición · peligro inminente',sin_danos_reportados:'Sin daños reportados'})[s]||s;}
function territory(type,r){if(type==='events')return [r.department,r.province,r.district];if(type==='ana'){const a=r[$('snapshot').value];return [a.nombdep,a.nombprov,a.nombdistri];}const a=r.attributes;return [a.nombdep||a.DEPARTAMENTO,a.nombprov||a.PROVINCIA,a.nombdist||a.DISTRITO];}
function allTerritories(){return ['events','ana','barriers'].flatMap(t=>DATA[t].map(r=>territory(t,r)));}
function options(id,rows,placeholder){const el=$(id),previous=el.value;const m=new Map;rows.filter(Boolean).flatMap(x=>String(x).split(',')).forEach(x=>m.set(norm(x),title(x.trim())));el.innerHTML=`<option value="">${placeholder}</option>`+[...m].sort((a,b)=>a[1].localeCompare(b[1],'es')).map(([k,v])=>`<option value="${esc(k)}">${esc(v)}</option>`).join('');if(m.has(previous))el.value=previous;}
function populateTerritories(){const rows=allTerritories();options('department',rows.map(x=>x[0]),'Todo el Perú');const dept=$('department').value;options('province',rows.filter(x=>!dept||String(x[0]).split(',').some(v=>norm(v)===dept)).map(x=>x[1]),'Todas las provincias');const prov=$('province').value;options('district',rows.filter(x=>(!dept||String(x[0]).split(',').some(v=>norm(v)===dept))&&(!prov||String(x[1]).split(',').some(v=>norm(v)===prov))).map(x=>x[2]),'Todos los distritos');}
function inGroup(r){const code=r.hazard.slice(0,4),g=$('hazardGroup').value;return g==='all'||(g==='hydro'&&hydroCodes.has(code))||(g==='fire'&&['4100','4200','4300'].includes(code));}
function populateHazards(){const previous=$('hazard').value,vals=[...new Set(DATA.events.filter(inGroup).map(x=>x.hazard))].sort();$('hazard').innerHTML='<option value="">Todos los del grupo</option>'+vals.map(v=>`<option value="${esc(v)}">${esc(title(v.slice(5)))}</option>`).join('');if(vals.includes(previous))$('hazard').value=previous;}
function matchesTerritory(type,r){const ts=territory(type,r);return ['department','province','district'].every((key,i)=>!$(key).value||String(ts[i]).split(',').some(v=>norm(v)===$(key).value));}
function matchesSearch(type,r){const q=norm($('search').value);if(!q)return true;const extras=type==='events'?[r.id,r.hazard,r.sinpad,r.report]:type==='ana'?[r.id,r.current.IDPC,r.current.SECTOR,r.current.NOMBRE,r.current.CUENCA]:[r.id,r.attributes.QUEBRADA,r.attributes.SECTOR];return norm([...territory(type,r),...extras].join(' ')).includes(q);}
function eventBase(r){return matchesTerritory('events',r)&&matchesSearch('events',r)&&inGroup(r)&&(!$('hazard').value||r.hazard===$('hazard').value)&&(!$('validation').value||r.state===$('validation').value);}
function filteredData(){const start=$('dateStart').value,end=$('dateEnd').value,status=$('status').value,snap=$('snapshot').value;return {events:DATA.events.filter(r=>eventBase(r)&&($('coenMode').value==='day'?r.date===end:r.date>=start&&r.date<=end)),ana:DATA.ana.filter(r=>matchesTerritory('ana',r)&&matchesSearch('ana',r)&&(!status||r[snap].ESTADO===status)&&(!$('onlyChanges').checked||r[snap].ESTADO!==anaCompare(r).ESTADO)),barriers:DATA.barriers.filter(r=>matchesTerritory('barriers',r)&&matchesSearch('barriers',r)&&(!status||r.attributes.ESTADO===status))};}
function setupMap(){map=new window.TerritoryMap('map',(type,id)=>selectRecord(type,id,false));window.localMapControls.init(map);}
function mapLayers(){map.draw(filtered,selected,{events:$('layerEvents').checked,ana:$('layerAna').checked,barriers:$('layerBarriers').checked},$('snapshot').value);}
function fit(){const coords=[];if($('layerAna').checked)filtered.ana.forEach(r=>coords.push(...r.paths.flat()));if($('layerEvents').checked)filtered.events.forEach(r=>{if(r.coords)coords.push(r.coords);});if($('layerBarriers').checked)filtered.barriers.forEach(r=>coords.push(r.coords));map.fitCoords(coords,13);}

function updateChart(){const base=DATA.events.filter(eventBase),counts=dates.map(d=>base.filter(r=>r.date===d).length),max=Math.max(1,...counts);$('histogram').innerHTML=dates.map((d,i)=>`<button style="height:${Math.max(6,counts[i]/max*100)}%" class="${d>=$('dateStart').value&&d<=$('dateEnd').value?'in-range ':''}${d===$('dateEnd').value?'current':''}" title="${esc(fullDate(d))}: ${counts[i]} reportes" aria-label="Hasta ${esc(fullDate(d))}, ${counts[i]} reportes" data-day="${d}"></button>`).join('');$('histogram').querySelectorAll('button').forEach(b=>b.onclick=()=>setEnd(b.dataset.day));$('sliderLabel').textContent=shortDate($('dateEnd').value)+' 2026';$('timeSlider').value=Math.max(0,dates.indexOf($('dateEnd').value));}
function render(){filtered=filteredData();$('countEvents').textContent=num(filtered.events.length,0);$('countAna').textContent=num(filtered.ana.length,0);$('countBarriers').textContent=num(filtered.barriers.length,0);const missing=filtered.events.filter(r=>!r.coords).length;$('eventSubtitle').textContent=`${shortDate($('dateStart').value)} – ${shortDate($('dateEnd').value)}${missing?' · '+missing+' sin ubicación':''}`;$('anaSubtitle').textContent='Corte '+fullDate(activeAnaDate());$('layerEventsCount').textContent=filtered.events.length-missing;$('layerAnaCount').textContent=filtered.ana.length;$('layerBarriersCount').textContent=filtered.barriers.length;$('layerEventsNote').textContent=missing?`${missing} sin coordenadas, disponible en lista`:'Según periodo seleccionado';$('territoryName').textContent=title($('district').value||$('province').value||$('department').value)||'Perú';$('mapCaption').textContent=`COEN: ${$('layerEvents').checked?(filtered.events.length-missing)+' puntos':'oculto'} · ANA: ${$('layerAna').checked?shortAnaDate(activeAnaDate()):'oculta'} · Barreras: ${$('layerBarriers').checked?'02/10':'ocultas'}`;
if(selected&&!filtered[selected.type].some(r=>r.id===selected.id))clearSelection(false);mapLayers();updateChart();renderList();if(selected)renderDetail();}
function renderList(){const rows=[...filtered[tab]];if(tab==='events')rows.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));$('resultCount').textContent=num(rows.length,0);$('resultsList').innerHTML=rows.slice(0,limit).map(r=>{let name,sub,meta;if(tab==='events'){name=title(r.district);sub=title(r.hazard.slice(5));meta=`${shortDate(r.date)}${r.dateSource!=='PDF'?' (API)':''} · #${r.id}${!r.coords?' · sin coordenadas':''}${r.duplicateCandidate?' · posible duplicado':''}`;}else if(tab==='ana'){const a=r[$('snapshot').value];name=title(a.SECTOR);sub=`${title(a.nombdistri)} · ${title(a.NOMBRE)}`;meta=`${a.ESTADO} · ${num(a.AVANCEKMPOR)} % longitud`;}else{const a=r.attributes;name=a.QUEBRADA;sub=`${title(a.nombdist)} · ${a.SECTOR}`;meta=`${a.ESTADO} · corte 02/10`;}return `<button class="record" data-id="${esc(r.id)}"><strong>${esc(name)}</strong><span>${esc(sub)}</span><span class="record-meta">${esc(meta)}</span></button>`;}).join('')||'<p class="empty">Sin registros para la selección.</p>';$('resultsList').querySelectorAll('button').forEach(b=>b.onclick=()=>selectRecord(tab,b.dataset.id,true));$('showMore').hidden=rows.length<=limit;}
function detailHeader(tag,name,sub,badge,badgeClass=''){return `<div class="detail-head"><span class="eyebrow">${esc(tag)}</span><button id="closeDetail" class="close-button" aria-label="Cerrar ficha">×</button></div><h2>${esc(name)}</h2><p class="detail-sub">${esc(sub)}</p><span class="badge ${badgeClass}">${esc(badge)}</span>`;}
function progress(label,percent,detail){return `<div class="progress-item"><div><span>${esc(label)}</span><b>${num(percent)} %</b></div><div class="track"><i style="width:${Math.min(100,Math.max(0,Number(percent)||0))}%"></i></div><small>${esc(detail)}</small></div>`;}
function renderDetail(){const r=DATA[selected.type].find(x=>x.id===selected.id);let html='';if(selected.type==='events'){
html=detailHeader('REPORTE COEN · #'+r.id,title(r.district),`${title(r.department)} / ${title(r.province)} · ${title(r.hazard.slice(5))}`,labelState(r.state),r.state==='propuesta_revisar'?'amber':r.type==='peligro_inminente'?'purple':'');
html+=`<dl><dt>${r.type==='peligro_inminente'?'Fecha de referencia API (no ocurrencia de daño)':r.dateSource==='PDF'?'Ocurrencia · hora local del PDF':'Fecha API · pendiente de verificar'}</dt><dd>${esc(fullDate(r.date))} ${esc(r.occurred.slice(11))}</dd><dt>Reporte COEN / SINPAD identificado</dt><dd>N.º ${esc(r.report||'sin número')} / ${esc(r.sinpad||'sin código identificado')}</dd></dl>`;
if(r.type==='peligro_inminente')html+='<p class="detail-note">Exposición ante peligro inminente.</p>';
const metrics=r.type==='peligro_inminente'?r.exposure:r.metrics;html+=`<h3>${r.type==='peligro_inminente'?'Elementos expuestos':'Indicadores del reporte'}</h3>`;
if(metrics.length){html+='<div class="metric-grid">'+metrics.map(m=>`<div class="metric"><b>${num(m.valor_propuesto)}</b><span>${esc(metricName(m.indicador))}<br>${esc(m.unidad)}${m.distrito_tabla_pdf&&norm(m.distrito_tabla_pdf)!==norm(r.district)?' · '+esc(title(m.distrito_tabla_pdf)):''}</span></div>`).join('')+'</div>';const update=metrics[0].fecha_danos_pdf_hora_local||metrics[0].fecha_exposicion_pdf_hora_local;html+=`<p class="detail-sub">Actualización de la tabla: ${esc(update||'no identificada')} · página ${esc(metrics[0].pagina_pdf)}</p>`;}else html+='<p class="muted">Sin cifras tabuladas.</p>';
html+=`<p class="detail-note">${r.coords?'Localización aproximada.':'Sin coordenadas.'}</p>`;
if(r.dateSource!=='PDF')html+='<p class="detail-note">Fecha de referencia API pendiente de verificación.</p>';
if(r.dateSource==='PDF'&&r.originalDate.slice(0,10)!==r.date)html+=`<p class="detail-note">Fecha API original: ${esc(r.originalDate)}. Se utiliza la ocurrencia del PDF: ${esc(r.occurred)}.</p>`;
if(r.duplicateCandidate)html+='<p class="detail-note">Posible duplicado: reportes 23354 y 23362.</p>';
if(r.district.includes(','))html+='<p class="detail-note">Reporte multidistrital. Cifras desagregadas por distrito.</p>';
if(r.note)html+=`<p class="detail-note">${esc(r.note)}</p>`;
html+=link(r.url,'Abrir PDF oficial');
const nearby=filtered.ana.filter(a=>{const t=territory('ana',a);return norm(t[0])===norm(r.department)&&norm(t[1])===norm(r.province)&&norm(t[2])===norm(r.district);});html+=`<h3>En el mismo distrito</h3><p class="muted">${nearby.length} intervenciones ANA en la selección. </p>`;
}else if(selected.type==='ana'){
html=anaDetail(r);
}else{
const a=r.attributes,p=r.prioritized;html=detailHeader('BARRERA DINÁMICA · REGISTRO '+r.id,a.QUEBRADA,`${a.nombdep} / ${a.nombprov} / ${a.nombdist}`,a.ESTADO);html+='<p class="detail-note">Estado al 02/10/2026.</p>';html+=`<p class="muted">${esc(a.DESCRIPC)}</p><dl><dt>Sector / cuenca</dt><dd>${esc(a.SECTOR)} / ${esc(a.CUENCA)}</dd><dt>Inicio programado</dt><dd>${msDate(a.FEC_INI)}</dd><dt>Fin programado</dt><dd>${msDate(a.FEC_FIN)}</dd><dt>Plazo informado</dt><dd>${num(a.PLAZO_DIAS,0)} días</dd><dt>Presupuesto programado</dt><dd>S/ ${num(a.PRESUP_SOL,2)}</dd></dl>`;html+=progress('Instalación de barrera',a.AVANCEM2POR,`${num(a.AVANCEM2,2)} de ${num(a.INST_BD_M2,2)} m²`)+progress('Movimiento de tierras',a.AVANCEM3POR,`${num(a.AVANCEM3,2)} de ${num(a.MOV_TIE_M3,2)} m³`);html+=`<h3>Población y bienes consignados</h3><div class="metric-grid"><div class="metric"><b>${num(a.HABITANTES,0)}</b><span>Habitantes</span></div><div class="metric"><b>${num(a.VIVIENDAS,0)}</b><span>Viviendas</span></div></div><p class="detail-note">UTM 18 sur; supuesto WGS84. Datum por confirmar.</p>`+link(a.FICHA,'Ficha técnica');
}
$('detail').innerHTML=html;$('closeDetail').onclick=()=>clearSelection();document.querySelector('.right-panel').classList.add('has-selection');}
function selectRecord(type,id,zoom){selected={type,id};renderDetail();mapLayers();if(zoom){const r=DATA[type].find(x=>x.id===id);if(type==='ana')map.fitCoords(r.paths.flat(),15);else if(r.coords)map.setView(r.coords,Math.max(map.getZoom(),12));}document.querySelector('.right-panel').scrollTop=0;$('sidebar').classList.remove('open');}
function clearSelection(redraw=true){selected=null;$('detail').innerHTML=initialDetail;document.querySelector('.right-panel').classList.remove('has-selection');if(redraw)mapLayers();}
function stop(){if(timer)clearInterval(timer);timer=null;$('play').textContent='▶';$('play').setAttribute('aria-label','Reproducir evolución');}
function setEnd(day){day=day<dates[0]?dates[0]:day>dates.at(-1)?dates.at(-1):day;$('dateEnd').value=day;if($('dateStart').value>day)$('dateStart').value=dates[0];render();}
function exportCSV(){const rows=[];for(const type of ['events','ana','barriers'])for(const r of filtered[type]){const t=territory(type,r);if(type==='events')rows.push({capa:'COEN',id:r.id,departamento:t[0],provincia:t[1],distrito:t[2],corte:DATA.meta.coenDate,fecha_ocurrencia:r.occurred,peligro:r.hazard,estado_validacion:r.state,fecha_referencia:r.date,fuente_fecha:r.dateSource,url:r.url});if(type==='ana'){const a=r[$('snapshot').value];rows.push({capa:'ANA',id:r.id,departamento:t[0],provincia:t[1],distrito:t[2],corte:activeAnaDate(),sector:a.SECTOR,estado_oficial:a.ESTADO,fecha_avance:a.FEC_AVANCE,avance_km:a.AVANCEKM,meta_km:a.META,avance_m3:a.AVANCEDESCOLMA,meta_m3:a.VOLUMEN_M3,url:a.RUTA});}if(type==='barriers'){const a=r.attributes;rows.push({capa:'BARRERAS',id:r.id,departamento:t[0],provincia:t[1],distrito:t[2],corte:'2026-10-02',quebrada:a.QUEBRADA,estado_oficial:a.ESTADO,inicio_programado:msDate(a.FEC_INI),fin_programado:msDate(a.FEC_FIN),url:a.FICHA});}}const keys=[...new Set(rows.flatMap(Object.keys))];const quote=x=>{let s=String(x??'');if(/^[=+@\-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};const csv='\ufeff'+[keys.map(quote).join(';'),...rows.map(r=>keys.map(k=>quote(r[k])).join(';'))].join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Territorio_seleccion.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
function setupControls(){dates=[...new Set(DATA.events.map(r=>r.date).filter(Boolean))].sort();$('dateStart').min=$('dateEnd').min=dates[0];$('dateStart').max=$('dateEnd').max=dates.at(-1);$('dateStart').value=dates[0];$('dateEnd').value=dates.at(-1);$('minDate').textContent=shortDate(dates[0]);$('timeSlider').max=dates.length-1;$('timeSlider').value=dates.length-1;populateTerritories();populateHazards();
['department','province','district'].forEach(id=>$(id).onchange=()=>{if(id==='department'){$('province').value='';$('district').value='';}if(id==='province')$('district').value='';populateTerritories();limit=15;render();fit();});
['hazardGroup','hazard','validation','snapshot','status','onlyChanges','layerEvents','layerAna','layerBarriers'].forEach(id=>$(id).onchange=()=>{if(id==='hazardGroup')populateHazards();if(id==='snapshot')populateTerritories();limit=15;render();});
let searchTimer;$('search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{limit=15;render();},180);};
$('dateStart').onchange=()=>{stop();if(!$('dateStart').value)$('dateStart').value=dates[0];if($('dateStart').value>$('dateEnd').value)$('dateEnd').value=$('dateStart').value;render();};$('dateEnd').onchange=()=>{stop();if(!$('dateEnd').value)$('dateEnd').value=dates.at(-1);setEnd($('dateEnd').value);};$('timeSlider').oninput=()=>{stop();setEnd(dates[Number($('timeSlider').value)]);};$('play').onclick=()=>{if(timer){stop();return;}let index=dates.findIndex(d=>d>=$('dateStart').value);setEnd(dates[index]);$('play').textContent='Ⅱ';$('play').setAttribute('aria-label','Pausar evolución');timer=setInterval(()=>{if(++index>=dates.length){stop();return;}setEnd(dates[index]);},850);};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;limit=15;document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));renderList();});$('showMore').onclick=()=>{limit+=20;renderList();};$('fit').onclick=fit;$('export').onclick=exportCSV;$('methodBtn').onclick=()=>$('method').showModal();$('closeMethod').onclick=()=>$('method').close();$('method').onclick=e=>{if(e.target===$('method'))$('method').close();};$('mobileFilters').onclick=()=>$('sidebar').classList.toggle('open');
$('reset').onclick=()=>{stop();['department','province','district','search','hazard','validation','status'].forEach(k=>$(k).value='');$('hazardGroup').value='hydro';$('snapshot').value='current';$('onlyChanges').checked=false;['layerEvents','layerAna','layerBarriers'].forEach(k=>$(k).checked=true);$('dateStart').value=dates[0];$('dateEnd').value=dates.at(-1);populateTerritories();populateHazards();clearSelection(false);limit=15;render();map.setView([-10,-75.7],5);};}
// Capas complementarias con el mismo filtro territorial y la misma cámara.
const extraTypes=['additional','hydro','rain'];
const extraLabels={additional:'94 adicionales',hydro:'Ríos y alertas',rain:'Lluvia observada'};
const hydroColors=['#688594','#e0b627','#e47727','#be3f38'];
const decimal=x=>x===null||x===undefined?'Sin dato':new Intl.NumberFormat('es-ES',{maximumFractionDigits:4}).format(x);
const clock=x=>x?`${x.slice(8,10)}/${x.slice(5,7)}/${x.slice(0,4)}${x.length>10?' · '+x.slice(11,16)+' h':' · promedio diario'}`:'Hora no publicada';
const waterText=r=>r.primary?`${decimal(r.primary.value)} ${r.primary.unit}`:'Sin lectura publicada';
const readingWhen=m=>m?(m.timeBasis.includes('Corte')?'Reporte diario · ':'')+clock(m.dateTime):'Sin fecha';
const baseTerritory=territory;
territory=function(type,r){return extraTypes.includes(type)?[r.department,r.province,r.district]:baseTerritory(type,r);};
allTerritories=function(){return ['events','ana','barriers',...extraTypes].flatMap(t=>DATA[t].map(r=>territory(t,r)));};
const baseFilteredData=filteredData;
filteredData=function(){const out=baseFilteredData();for(const t of extraTypes)out[t]=DATA[t].filter(r=>matchesTerritory(t,r)&&(!norm($('search').value)||norm(JSON.stringify(r)).includes(norm($('search').value)))&&(t!=='hydro'||!$('onlyAlerts').checked||r.alert>0));return out;};

function riverLabelVisibility(view){$('map').classList.toggle('river-values-visible',Boolean($('riverLabels')?.checked&&view.getZoom()>=10));}
function symbolSVG(kind,color){
 const white='#fff';let body='';
 if(kind==='coen')body=`<rect x="6" y="3" width="21" height="27" rx="2" fill="white" stroke="${color}" stroke-width="2"/><path d="M7 5h19v7H7z" fill="${color}"/><path d="M11 17h11M11 21h11M11 25h7" stroke="${color}" stroke-width="2"/>`;
 else if(kind==='fire')body=`<path d="M18 1c3 9-5 11-3 16 2-2 4-3 5-6 2 5 8 7 8 13a12 12 0 0 1-24 0C4 15 15 13 18 1z" fill="#c43d30" stroke="white" stroke-width="1.5" stroke-linejoin="round"/><path d="M17 18c-2 5-7 5-6 9 1 5 10 4 10-1 0-3-3-4-4-8" fill="#ffc15a"/>`;
 else if(kind==='imminent')body=`<path d="M16 3 30 28H2z" fill="${color}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/><path d="M16 11v8" stroke="white" stroke-width="2.7" stroke-linecap="round"/><circle cx="16" cy="23" r="1.5" fill="white"/>`;
 else if(kind==='ana')body=`<path d="M16 2 29 7v10c0 7-9 12-13 14C12 29 3 24 3 17V7z" fill="${color}" stroke="white" stroke-width="1.8"/><path d="M16 9v10" stroke="white" stroke-width="3" stroke-linecap="round"/><circle cx="16" cy="24" r="1.8" fill="white"/>`;
 else if(kind==='additional')body=`<path d="m16 2 12 7v14l-12 7-12-7V9z" fill="white" stroke="${color}" stroke-width="2.5"/><path d="M16 9v14M9 16h14" stroke="${color}" stroke-width="3"/>`;
 else if(kind==='barrier')body=`<path d="m16 2 14 14-14 14L2 16z" fill="${color}" stroke="white" stroke-width="1.5"/><path d="M10 10h12v12H10zM14 10v12M18 10v12M10 14h12M10 18h12" fill="none" stroke="white" stroke-width="1.2"/>`;
 else if(kind==='hydro')body=`<circle cx="16" cy="16" r="12" fill="${color}" stroke="white" stroke-width="1.7"/><path d="M8 12c3-4 5 4 8 0s5 4 8 0M8 18c3-4 5 4 8 0s5 4 8 0M10 23h12" fill="none" stroke="white" stroke-width="1.7" stroke-linecap="round"/>`;
 else body=`<circle cx="16" cy="16" r="10" fill="white" stroke="${color}" stroke-width="2"/><path d="M16 8c-3 5-6 7-6 11a6 6 0 0 0 12 0c0-4-3-6-6-11" fill="${color}"/>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true">${body}</svg>`;
}
function mapSymbolCandidates(data,visible,snapshot){
 const rows=[],put=(type,r,kind,color,coords,tip)=>{if(coords&&coords.every(Number.isFinite))rows.push({type,id:r.id,kind,color,coords,tip,record:r});};
 if(visible.events)for(const r of data.events){const kind=r.type==='peligro_inminente'?'imminent':r.hazard.includes('INCENDIO')?'fire':'coen';put('events',r,kind,kind==='fire'?'#b54f46':kind==='imminent'?'#80719b':'#ad9049',r.coords,`${title(r.district)} · ${title(r.hazard.slice(5))}`);}
 if(visible.ana)for(const r of data.ana){const a=r[snapshot],has=a.LAT!==null&&a.LAT!==undefined&&a.LON!==null&&a.LON!==undefined;let c=has?[Number(a.LAT),Number(a.LON)]:null;if(!c||!c.every(Number.isFinite)||c.every(v=>v===0)){const path=r.paths.flat();c=path[Math.floor(path.length/2)];}put('ana',r,'ana',a.ESTADO==='Ejecutado'?'#348778':a.ESTADO==='En Ejecución'?'#164f78':'#8b98a4',c,`${title(a.SECTOR)} · ${a.ESTADO}`);}
 if(visible.barriers)for(const r of data.barriers)put('barriers',r,'barrier','#253f58',r.coords,r.attributes.QUEBRADA);
 for(const t of extraTypes){if(!$('layer_'+t)?.checked||(t==='rain'&&!$('rainStations')?.checked))continue;for(const r of data[t]||[]){const color=t==='additional'?'#387d75':t==='rain'?'#3282a8':hydroColors[r.alert];const tip=t==='hydro'?`${title(r.name)} · ${title(r.station)}\n${waterText(r)} · ${r.alertLabel}\n${r.primary?readingWhen(r.primary):''}`:t==='rain'?`${title(r.name)} · ${decimal(r.value)} mm / 24 h`:r.name;put(t,r,t,color,r.coords,tip);}}
 return rows;
}
function symbolSeverity(r){
 if(r.type==='hydro')return Math.max(Number(r.record?.alert)||0,({'#e0b627':1,'#e47727':2,'#be3f38':3})[r.color]||0);
 if(r.type==='rain'){const code=r.rainClimate?.code;return code!==undefined?(code>=1&&code<=4?code:0):Math.min(4,(Number(r.record?.value)||0)/20);}
 if(r.kind==='imminent')return 3;if(r.kind==='fire')return 2;
 if(r.type==='ana')return r.anaDayValue?2:r.diaryClass==='progress'?2:0;return 0;
}
function symbolFamily(r){return r.type==='events'?'events:'+r.kind:r.type;}
function clusterGlyph(r){
 const count=r.members.length,types=[...new Set(r.members.map(m=>symbolFamily(m)))],dots=types.slice(0,3).map(t=>r.members.find(m=>symbolFamily(m)===t).color);
 const icon=types.length>1?'<span class="cluster-mix">'+dots.map(c=>'<i style="background:'+c+'"></i>').join('')+'</span>':'<span class="cluster-mini">'+symbolSVG(r.kind,r.color)+'</span>';
 return '<span class="compact-cluster" style="--cluster-color:'+r.color+'">'+icon+'<b>'+count+'</b></span>';
}
function mergeOverviewGroups(groups,project){
 const merged=[];for(const r of groups){const point=project(r),match=merged.find(g=>Math.hypot(g._point.x-point.x,g._point.y-point.y)<10);
  if(!match){merged.push({...r,_point:point});continue;}
  match.members.push(...r.members);const members=match.members;match.coords=[members.reduce((s,m)=>s+m.coords[0],0)/members.length,members.reduce((s,m)=>s+m.coords[1],0)/members.length];match._point=project(match);
  if(new Set(members.map(symbolFamily)).size>1){match.kind='mixed';match.type='mixed';const alert=Math.max(0,...members.filter(m=>m.type==='hydro').map(symbolSeverity));match.color=alert?hydroColors[Math.min(3,alert)]:'#416978';}
 }
 return merged;
}
function symbolGroupLabel(r){if(r.kind==='mixed'){const counts=new Map();for(const m of r.members){const name=m.kind==='fire'?'incendios':m.kind==='imminent'?'peligros':({events:'COEN',ana:'ANA',additional:'adicionales',barriers:'barreras',hydro:'ríos',rain:'lluvia'})[m.type]||m.type;counts.set(name,(counts.get(name)||0)+1);}const alert=Math.max(0,...r.members.filter(m=>m.type==='hydro').map(symbolSeverity));return r.members.length+' registros · '+[...counts].map(([name,n])=>n+' '+name).join(' · ')+(alert?' · alerta máxima: '+['','amarillo','naranja','rojo'][Math.min(3,alert)]:'');}const names={ana:'puntos ANA',additional:'puntos adicionales',barriers:'barreras',hydro:'estaciones de río',rain:'estaciones de lluvia'},name=r.kind==='fire'?'incendios':r.kind==='imminent'?'peligros inminentes':r.type==='events'?'reportes COEN':names[r.type]||'registros';return r.members.length+' '+name+(r.type==='hydro'?' · alerta máxima: '+(['sin alerta identificada','amarillo','naranja','rojo'][Math.min(3,symbolSeverity(r))]):'');}
function groupSymbols(rows,view,selected){
 const zoom=view.getZoom(),radius=zoom<5?55:zoom<6?44:zoom<8?34:zoom<10?26:zoom<12?20:zoom<14?16:10;
 const project=r=>view.kind==='vector'?view.engine.project([r.coords[1],r.coords[0]]):view.engine.latLngToContainerPoint(r.coords),ordered=[...rows].sort((a,b)=>symbolSeverity(b)-symbolSeverity(a)||String(a.type+':'+a.id).localeCompare(String(b.type+':'+b.id))),clusters=[],singles=[];
 for(const r of ordered){const p=project(r);if(selected?.type===r.type&&selected.id===r.id){singles.push({...r,members:[r],_point:p});continue;}let best=null,distance=radius*radius;const family=symbolFamily(r);
  for(const g of clusters){if(g.family!==family)continue;const d=(p.x-g.x)**2+(p.y-g.y)**2;if(d<distance){best=g;distance=d;}}
  if(best){best.members.push(r);best.x+=(p.x-best.x)/best.members.length;best.y+=(p.y-best.y)/best.members.length;}
  else clusters.push({family,members:[r],x:p.x,y:p.y});
 }
 let grouped=clusters.map(g=>{const m=g.members,representative=m[0],coords=m.length===1?representative.coords:[m.reduce((s,r)=>s+r.coords[0],0)/m.length,m.reduce((s,r)=>s+r.coords[1],0)/m.length];return {...representative,members:m,coords,_point:project({coords})};});if(zoom<6)grouped=mergeOverviewGroups(grouped,project);grouped=grouped.concat(singles);
 // Separate markers from different layers while keeping their geographic anchors.
 grouped.sort((a,b)=>Number(selected?.type===b.type&&selected.id===b.id)-Number(selected?.type===a.type&&selected.id===a.id)||symbolSeverity(b)-symbolSeverity(a)||b.members.length-a.members.length||String(a.type+':'+a.id).localeCompare(String(b.type+':'+b.id)));
 const placed=[];for(const r of grouped){const chosen=selected?.type===r.type&&selected.id===r.id,size=r.members.length>1?32:r.kind==='fire'?28:24,options=[[0,0]];
  if(!chosen&&zoom>=7)for(const ring of [24,38])for(let k=0;k<12;k++){const a=k*Math.PI/6;options.push([Math.cos(a)*ring,Math.sin(a)*ring]);}
  let offset=options.at(-1);for(const o of options){const p={x:r._point.x+o[0],y:r._point.y+o[1]};if(!placed.some(q=>(p.x-q.x)**2+(p.y-q.y)**2<((size+q.size)/2+5)**2)){offset=o;break;}}
  r.displayOffset=offset;placed.push({x:r._point.x+offset[0],y:r._point.y+offset[1],size});delete r._point;
 }
 return grouped;
}
function symbolLeader(r){const [x,y]=r.displayOffset||[0,0],length=Math.hypot(x,y);return length>10?'<span class="cluster-leader" style="width:'+length+'px;transform:rotate('+Math.atan2(-y,-x)+'rad)"></span>':'';}
function openSymbolGroup(r,view){
 const coords=r.members.map(m=>m.coords),spread=Math.max(...coords.map(c=>Math.abs(c[0]-coords[0][0])+Math.abs(c[1]-coords[0][1])));
 if(view.getZoom()<13&&spread>.00001){view.fitCoords(coords,Math.min(17,view.getZoom()+2));return;}
 if($('expandMap').getAttribute('aria-expanded')==='true')setExpandedInfo(true);$('detail').innerHTML='<div class="detail-head"><span class="eyebrow">GRUPO DE REGISTROS</span><button id="closeCluster" class="close-button" aria-label="Cerrar">×</button></div><h2>'+esc(symbolGroupLabel(r))+'</h2><p class="detail-sub">Selecciona un registro para abrir su ficha.</p>'+r.members.map((m,i)=>'<button class="record" data-cluster-member="'+i+'"><strong>'+esc(title(m.record?.name||m.record?.district||m.record?.current?.SECTOR||m.tip.split('\n')[0]))+'</strong><span>'+esc(m.tip)+'</span></button>').join('');$('closeCluster').onclick=()=>{$('detail').innerHTML=initialDetail;};$('detail').querySelectorAll('[data-cluster-member]').forEach(b=>b.onclick=()=>{const m=r.members[Number(b.dataset.clusterMember)];view.onSelect(m.type,m.id);});
}

const baseDrawState=window.TerritoryMap.prototype.drawState;
window.TerritoryMap.prototype.drawState=function(){
 baseDrawState.call(this);const {data,selected,visible,snapshot}=this.state;if(this.kind==='vector'&&!this.styleReady)return;rainSurface(this);
 if(this.kind==='raster'){if(this.extraEngine!==this.engine){this.extraGroup=L.featureGroup().addTo(this.engine);this.extraEngine=this.engine;}this.extraGroup.clearLayers();}
 if(this.labelsEngine!==this.engine){this.labelsEngine=this.engine;this.engine.on('zoomend',()=>this.drawState());}
 riverLabelVisibility(this);
 for(const r of groupSymbols(mapSymbolCandidates(data,visible,snapshot),this,selected)){
  const count=r.members.length,chosen=selected?.type===r.type&&selected.id===r.id;
  const html=(count>1?clusterGlyph(r):symbolLeader(r)+symbolSVG(r.kind,r.color))+(count===1&&r.type==='hydro'&&r.record.primary?`<span class="river-label">${esc(waterText(r.record))} · prom.</span>`:'')+(count===1&&r.type==='ana'&&r.anaDayValue?`<span class="river-label ana-value">${esc(r.anaDayValue)}</span>`:'');
  const compact=this.getZoom()<7,size=count>1?(compact?30:34):({fire:compact?23:36,coen:compact?22:32,imminent:compact?23:35,hydro:compact?21:27}[r.kind]|| (compact?22:30)),priority=chosen?9000:({fire:5000,coen:4500,imminent:5500,ana:2000,additional:1500,barrier:1000,hydro:0}[r.kind]||0),cls='map-symbol'+(chosen?' selected':'')+(count>1?' grouped':'')+(compact?' compact':'');const label=count>1?symbolGroupLabel(r)+(this.getZoom()<13?' · pulsar para acercar':' · pulsar para ver registros'):r.tip;
  const action=()=>{if(count>1)openSymbolGroup(r,this);else this.onSelect(r.type,r.id);};
  if(this.kind==='raster')L.marker(r.coords,{zIndexOffset:priority,icon:L.divIcon({className:cls,html,iconSize:[size,size],iconAnchor:[size/2-(r.displayOffset?.[0]||0),size/2-(r.displayOffset?.[1]||0)]})}).addTo(this.extraGroup).bindTooltip(esc(label).replace(/\n/g,'<br>')).on('click',action);
  else{const element=document.createElement('button');element.className=cls;element.style.width=size+'px';element.style.height=size+'px';element.style.zIndex=priority;element.innerHTML=html;element.title=label;element.setAttribute('aria-label',label);element.onclick=e=>{e.stopPropagation();action();};this.nativeMarkers.push(new maplibregl.Marker({element,offset:r.displayOffset||[0,0]}).setLngLat([r.coords[1],r.coords[0]]).addTo(this.engine));}
 }
};

const baseRender=render;
render=function(){baseRender();for(const t of extraTypes)$('count_'+t).textContent=filtered[t].length;$('rainKey').hidden=!$('layer_rain').checked;};
const baseList=renderList;
renderList=function(){
 if(!extraTypes.includes(tab))return baseList();const rows=[...filtered[tab]];
 if(tab==='hydro')rows.sort((a,b)=>b.alert-a.alert||a.name.localeCompare(b.name,'es'));
 if(tab==='rain')rows.sort((a,b)=>b.value-a.value);
 $('resultCount').textContent=rows.length;
 $('resultsList').innerHTML=rows.slice(0,limit).map(r=>tab==='hydro'?`<button class="record" data-id="${esc(r.id)}"><strong>${esc(title(r.name))}</strong><span>${esc(title(r.station))} · ${esc(title(r.department))}</span><span class="river-number">${r.primary?decimal(r.primary.value):'Sin lectura'} <small>${esc(r.primary?.unit||'')}</small></span><span class="river-alert"><i style="background:${hydroColors[r.alert]}"></i>${esc(r.alertLabel)}</span><span class="record-meta">${esc(r.primary?(r.primary.stale?'Dato anterior · ':'')+r.primary.kind+' · '+readingWhen(r.primary):'Sin lectura en las fuentes consultadas')}</span></button>`:`<button class="record" data-id="${esc(r.id)}"><strong>${esc(title(r.name))}</strong><span>${esc(title(r.department))} / ${esc(title(r.district))}</span><span class="record-meta">${tab==='rain'?decimal(r.value)+' mm · '+rainPeriod(r):esc(r.subtitle)}</span></button>`).join('')||'<p class="empty">Sin registros para la selección.</p>';
 $('resultsList').querySelectorAll('button').forEach(b=>b.onclick=()=>selectRecord(tab,b.dataset.id,true));$('showMore').hidden=rows.length<=limit;
};
const baseDetail=renderDetail;
renderDetail=function(){
 if(!extraTypes.includes(selected.type))return baseDetail();const t=selected.type,r=DATA[t].find(x=>x.id===selected.id);let h;
 if(t==='hydro'){
  h=`<div class="detail-head"><span class="eyebrow">RÍO · ESTACIÓN ${esc(r.id)}</span><button id="closeDetail" class="close-button" aria-label="Cerrar ficha">×</button></div><h2>${esc(title(r.name))}</h2><p class="detail-sub">Estación ${esc(title(r.station))}<br>${esc([r.department,r.province,r.district].filter(Boolean).map(title).join(' / '))}</p>`;
  if(r.primary)h+=`<div class="measure-kind">${esc(r.primary.kind)}${r.primary.stale?' · dato anterior':''}</div><div class="hydro-value">${decimal(r.primary.value)} <span>${esc(r.primary.unit)}</span></div><p class="measure-date">${esc(readingWhen(r.primary))} · Perú${r.primary.stale?'<br><b>Último dato disponible en la fuente consultada.</b>':''}</p>`;
  else h+='<p class="hydro-more">Sin lectura publicada en el hidrograma ni en el reporte diario consultados.</p>';
  h+=`<span class="alert-badge"><i style="background:${hydroColors[r.alert]}"></i>${esc(r.alertLabel)}${r.alert&&r.alertDirection?' · '+esc(r.alertDirection.toLowerCase()):''}</span><p class="measure-date">Categoría oficial al ${esc(clock(r.alertDateTime))} · Perú</p>`;
  if(r.primary?.kind==='Nivel del río')h+='<p class="hydro-more">Esta estación publica nivel del agua. No se dispone de caudal publicado.</p>';
  if(r.caudal&&r.waterLevel)h+=`<dl><dt>Nivel del río</dt><dd>${decimal(r.waterLevel.value)} ${esc(r.waterLevel.unit)}<br><small>${esc(clock(r.waterLevel.dateTime))} · Perú</small></dd></dl>`;
  const ref=r.alertReference||r.primary;
  if(ref&&Object.values(ref.thresholds).some(v=>v!==null)){h+='<h3>Umbrales de referencia'+(r.alertDirection?' · '+esc(r.alertDirection.toLowerCase()):'')+'</h3><p class="hydro-more">'+esc(ref.kind)+' · '+esc(ref.unit)+'</p><div class="thresholds">'+['amarillo','naranja','rojo'].map((k,i)=>`<div style="border-color:${hydroColors[i+1]}">${title(k)}<strong>${ref.thresholds[k]===null?'No publicado':decimal(ref.thresholds[k])+' '+esc(ref.unit)}</strong></div>`).join('')+'</div>';}
  else h+='<p class="hydro-more">La fuente no publica umbrales numéricos para esta medición.</p>';
  if(r.primary)h+=`<p class="hydro-more">${esc(r.primary.source)}. ${r.primary.resolution==='daily'||r.primary.timeBasis.includes('Corte')?esc(r.primary.timeBasis)+'. ':''}Datos preliminares.</p>`;
  h+=link(r.url,'Consultar medición oficial');
 }else{
  h=detailHeader(extraLabels[t],title(r.name),[r.department,r.province,r.district].filter(Boolean).map(title).join(' / '),t==='rain'?decimal(r.value)+' mm / 24 h':r.subtitle);
  h+='<dl>'+r.details.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v??'Sin dato')}</dd>`).join('')+'</dl>'+link(r.url,'Consultar fuente oficial');
 }
 $('detail').innerHTML=h;$('closeDetail').onclick=()=>clearSelection();document.querySelector('.right-panel').classList.add('has-selection');
};
fit=function(){const coords=[];if($('layerAna').checked)filtered.ana.forEach(r=>coords.push(...r.paths.flat()));if($('layerEvents').checked)filtered.events.forEach(r=>r.coords&&coords.push(r.coords));if($('layerBarriers').checked)filtered.barriers.forEach(r=>coords.push(r.coords));for(const t of extraTypes)if($('layer_'+t).checked)filtered[t].forEach(r=>r.coords&&coords.push(r.coords));map.fitCoords(coords,13);};
const baseControls=setupControls;
setupControls=function(){
 baseControls();for(const t of extraTypes)$('layer_'+t).onchange=()=>render();$('onlyAlerts').onchange=()=>render();$('dateStart').value=DATA.meta.defaultStartDate;
 $('rainStations').onchange=()=>mapLayers();$('riverLabels').onchange=()=>mapLayers();$('rainOpacity').oninput=()=>{$('rainOpacityLabel').textContent=$('rainOpacity').value+' %';rainSurface(map);};
 const stops=[],max=130;let lower=0;for(const e of DATA.rainSurface.palette){const upper=Math.min(max,Number(e.quantity));if(upper>lower){stops.push(e.color+' '+(lower/max*100)+'%',e.color+' '+(upper/max*100)+'%');lower=upper;}}
 $('rainPalette').style.background='linear-gradient(to right,'+stops.join(',')+')';
 const reset=$('reset').onclick;$('reset').onclick=()=>{for(const t of extraTypes)$('layer_'+t).checked=true;$('onlyAlerts').checked=false;$('rainStations').checked=false;$('riverLabels').checked=true;reset();$('dateStart').value=DATA.meta.defaultStartDate;render();};
};
exportCSV=function(){
 const rows=[];for(const t of ['events','ana','barriers',...extraTypes])for(const r of filtered[t]){const loc=territory(t,r),out={capa:extraLabels[t]||t,id:r.id,departamento:loc[0],provincia:loc[1],distrito:loc[2]};
 if(t==='events')Object.assign(out,{fecha:r.date,fuente_fecha:r.dateSource,estado_validacion:r.state,peligro:r.hazard,url:r.url});
 else if(t==='ana'){const a=r[$('snapshot').value];Object.assign(out,{corte:activeAnaDate(),estado:a.ESTADO,fecha_avance:a.FEC_AVANCE,meta_km:a.META,avance_km:a.AVANCEKM,url:a.RUTA});if(anaTemporal()){const st=anaDailyMapState(r);Object.assign(out,{fecha_mapa:st.day,cobertura_diaria:st.label,avance_diario_km:st.row?.km??'',avance_diario_m3:st.row?.m3??'',acumulado_registrado_km:st.sumKm??'',acumulado_registrado_m3:st.sumM3??'',ultimo_reporte:st.last?.date||''});}}
 else if(t==='barriers')Object.assign(out,{corte:'2026-10-02',quebrada:r.attributes.QUEBRADA,estado:r.attributes.ESTADO,url:r.attributes.FICHA});
 else if(t==='hydro')Object.assign(out,{rio:r.name,estacion:r.station,medicion:r.primary?.value,unidad:r.primary?.unit,variable:r.primary?.kind,fecha_hora_Peru:r.primary?.dateTime,alerta:r.alertLabel,fecha_hora_alerta_Peru:r.alertDateTime,variable_umbral:r.alertReference?.kind,unidad_umbral:r.alertReference?.unit,umbral_amarillo:r.alertReference?.thresholds.amarillo,umbral_naranja:r.alertReference?.thresholds.naranja,umbral_rojo:r.alertReference?.thresholds.rojo,url:r.url});
 else if(t==='rain')Object.assign(out,{estacion:r.name,precipitacion_mm:r.value,inicio_observacion:r.periodStart,fin_observacion:r.periodEnd,url:r.url});
 else Object.assign(out,{nombre:r.name,detalle:r.subtitle,latitud:r.coords?.[0],longitud:r.coords?.[1],datos:JSON.stringify(r.details),url:r.url});rows.push(out);}
 const keys=[...new Set(rows.flatMap(Object.keys))],quote=x=>'"'+String(x??'').replace(/^[=+@\-]/,"'$&").replace(/"/g,'""')+'"',csv='\ufeff'+[keys.map(quote).join(';'),...rows.map(r=>keys.map(k=>quote(r[k])).join(';'))].join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='Monitoreo_FEN_seleccion.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
};

function activeAnaDate(){return $('snapshot').value==='current'?DATA.meta.anaDate:$('snapshot').value==='previous'?DATA.meta.anaPreviousDate:$('snapshot').value;}
function shortAnaDate(day){return day.slice(8,10)+'/'+day.slice(5,7);}
function anaCompare(r){return r[$('compareCut').value]||r.previous;}
function anaDetail(r){
 const a=r[$('snapshot').value],p=anaCompare(r),day=activeAnaDate(),prev=$('compareCut').value;
 let h=detailHeader('PUNTO CRÍTICO ANA · '+a.IDPC,title(a.SECTOR),[a.nombdep,a.nombprov,a.nombdistri].map(title).join(' / '),a.ESTADO);
 h+=`<p class="detail-sub">Corte ${fullDate(day)} · Avance ${esc(a.FEC_AVANCE||'sin fecha')}</p><p class="muted">${esc(a.NOMBRE_DE_ACTIVIDAD)}</p>`;
 h+=progress('Avance en longitud',a.AVANCEKMPOR,`${num(a.AVANCEKM,3)} de ${num(a.META,3)} km`)+progress('Descolmatación',a.AVANCEDESCOLMAPOR,`${num(a.AVANCEDESCOLMA,2)} de ${num(a.VOLUMEN_M3,2)} m³`);
 const rows=[['Estado','ESTADO',false],['Avance km','AVANCEKM',true],['Meta km','META',true],['Extraído m³','AVANCEDESCOLMA',true],['Meta m³','VOLUMEN_M3',true]];
 h+=`<h3>Comparación</h3><table class="compare-table"><thead><tr><th>Indicador</th><th>${shortAnaDate(prev)}</th><th>${shortAnaDate(day)}</th></tr></thead><tbody>`+rows.map(([label,k,n])=>`<tr><td>${label}</td><td>${n?num(p[k],3):esc(p[k])}</td><td>${n?num(a[k],3):esc(a[k])}</td></tr>`).join('')+'</tbody></table>';
 h+=`<dl><dt>Río / cuenca</dt><dd>${esc(a.NOMBRE)} / ${esc(a.CUENCA)}</dd><dt>Costo de actividad</dt><dd>S/ ${num(a.COSTO_DE_LA_ACTIVIDAD,2)}</dd><dt>Responsable</dt><dd>${esc(a.RESPONSABLE_MIDAGRI)}</dd></dl>`;
 h+='<details class="history-block"><summary>Historial de avances</summary><table class="history-table"><thead><tr><th>Corte</th><th>Estado</th><th>km</th><th>m³</th></tr></thead><tbody>'+[...DATA.meta.anaCuts].reverse().map(c=>{const x=r[c];return `<tr><td>${shortAnaDate(c)}</td><td>${esc(x.ESTADO)}</td><td>${num(x.AVANCEKM,3)}</td><td>${num(x.AVANCEDESCOLMA,1)}</td></tr>`;}).join('')+'</tbody></table></details>';
 return h+link(a.RUTA,'Ficha técnica')+link(a.GALERIA,'Galería oficial');
}
const withHistoryDetail=renderDetail;
renderDetail=function(){withHistoryDetail();if(selected?.type==='events'){const versions=DATA.eventRevisions[selected.id];if(versions?.length>1){const box=document.createElement('details');box.className='history-block';box.innerHTML='<summary>Historial del reporte</summary>'+versions.map(v=>`<div class="history-doc">Corte ${fullDate(v.cut)}${link(v.record.url,'Documento del corte')}</div>`).join('');$('detail').appendChild(box);}}};
const withHistoryControls=setupControls;
setupControls=function(){
 for(const r of DATA.ana){for(const day of DATA.meta.anaCuts)r[day]=day===DATA.meta.anaDate?r.current:day===DATA.meta.anaPreviousDate?r.previous:r.history[day];}
 $('snapshot').innerHTML=DATA.meta.anaCuts.map((day,i)=>`<option value="${i===0?'current':i===1?'previous':day}">${fullDate(day)}</option>`).join('');$('snapshot').value='current';
 $('compareCut').innerHTML=DATA.meta.anaCuts.map(day=>`<option value="${day}">${fullDate(day)}</option>`).join('');$('compareCut').value=DATA.meta.anaPreviousDate;
 $('hazardGroup').value='all';withHistoryControls();
 const changed=$('snapshot').onchange;$('snapshot').onchange=()=>{const i=DATA.meta.anaCuts.indexOf(activeAnaDate());$('compareCut').value=DATA.meta.anaCuts[Math.min(i+1,DATA.meta.anaCuts.length-1)];changed();};$('compareCut').onchange=()=>render();
 document.querySelectorAll('[data-symbol]').forEach(e=>{const kind=e.dataset.symbol;e.innerHTML=symbolSVG(kind,{coen:'#ad9049',fire:'#b54f46',imminent:'#80719b',ana:'#164f78',additional:'#387d75',barrier:'#253f58',hydro:'#688594',rain:'#3282a8'}[kind]);});
 $('reset').onclick=()=>{stop();['department','province','district','search','hazard','validation','status'].forEach(k=>$(k).value='');$('hazardGroup').value='all';$('snapshot').value='current';$('compareCut').value=DATA.meta.anaPreviousDate;$('onlyChanges').checked=false;$('onlyAlerts').checked=false;$('rainStations').checked=false;$('riverLabels').checked=true;['layerEvents','layerAna','layerBarriers','layer_additional','layer_hydro','layer_rain'].forEach(k=>$(k).checked=true);$('dateStart').value=DATA.meta.defaultStartDate;$('dateEnd').value=dates.at(-1);populateTerritories();populateHazards();clearSelection(false);limit=15;render();fit();document.querySelector('.right-panel').scrollTop=0;};
 $('exportBase').onclick=()=>{const payload=JSON.stringify(DATA,function(key,value){return /^2026-\d\d-\d\d$/.test(key)&&this&&Object.prototype.hasOwnProperty.call(this,'current')&&Object.prototype.hasOwnProperty.call(this,'paths')?undefined:value;});const u=URL.createObjectURL(new Blob([payload],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='Monitoreo_FEN_Base_'+DATA.meta.coenDate+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);};
};

const rainCache=new Map();let rainActiveDate=null,rainActiveEntry=null,rainActiveGeometry={type:'FeatureCollection',features:[]};
function rainPeriod(entry){return entry?shortAnaDate(entry.observationDate||entry.periodStart.slice(0,10))+' 07:00 → '+shortAnaDate(entry.endDate||entry.periodEnd.slice(0,10))+' 07:00 h':'';}
const rainGridLoads=new Map();
async function loadRainGrid(day){
 const entry=DATA.rainHistory[day];if(!entry||entry.gridGzip)return;
 const archive=document.getElementById('rainGridArchive');if(archive){const grids=JSON.parse(archive.textContent);if(grids[day]){entry.gridGzip=grids[day];return;}}
 if(!entry.gridFile)return;
 if(!rainGridLoads.has(day))rainGridLoads.set(day,(async()=>{const response=await fetch(entry.gridFile,{cache:'no-cache'});if(!response.ok)throw Error('No se pudo cargar la grilla de lluvia.');const raw=await response.json();if(raw.encoding!=='gzip-base64'||!raw.data)throw Error('Grilla diaria incompatible.');entry.gridGzip=raw.data;})());
 try{await rainGridLoads.get(day);}catch(e){rainGridLoads.delete(day);throw e;}
}
async function prepareRainGridArchive(){
 const days=Object.keys(DATA.rainHistory).filter(day=>DATA.rainHistory[day].gridFile||DATA.rainHistory[day].gridGzip);let cursor=0;
 await Promise.all(Array.from({length:4},async()=>{while(cursor<days.length)await loadRainGrid(days[cursor++]);}));
 const archive=Object.fromEntries(days.map(day=>[day,DATA.rainHistory[day].gridGzip]));
 const tag='<script id="rainGridArchive" type="application/json">'+JSON.stringify(archive)+'<'+ '/script>';
 window.__TERRITORIO_TEMPLATE__=window.__TERRITORIO_TEMPLATE__.replace(/<script id="rainGridArchive"[^>]*>[\s\S]*?<\/script>/,'').replace('</body>',tag+'</body>');
}
function activateRain(day){
 if(rainActiveDate===day)return;rainActiveDate=day;
 if(DATA.rainHistory[day]?.gridFile&&!DATA.rainHistory[day].gridGzip)loadRainGrid(day).then(()=>{if(rainActiveDate===day)render();}).catch(e=>{$('rainRarityPeriod').textContent=e.message;});rainActiveEntry=DATA.rainHistory[day]||null;
 if(selected?.type==='rain')clearSelection(false);
 if(rainActiveEntry){if(!rainCache.has(day)){const raw=Uint8Array.from(atob(rainActiveEntry.geojsonGzip),c=>c.charCodeAt(0));rainCache.set(day,JSON.parse(pako.ungzip(raw,{to:'string'})));if(rainCache.size>2)rainCache.delete(rainCache.keys().next().value);}rainActiveGeometry=rainCache.get(day);DATA.rain=rainActiveEntry.stations;}
 else{rainActiveGeometry={type:'FeatureCollection',features:[]};DATA.rain=[];}
}
function syncRain(){if($('rainFollow').checked)$('rainDate').value=$('dateEnd').value;activateRain($('rainDate').value);}
function rainSurface(view){
 const geo=rainActiveGeometry,show=$('layer_rain')?.checked&&!!rainActiveEntry&&!climateMode(),opacity=show?Number($('rainOpacity')?.value||60)/100:0;
 if(view.kind==='raster'){
  if(view.rainEngine!==view.engine){view.rainEngine=view.engine;view.engine.createPane('rainSurfacePane');const p=view.engine.getPane('rainSurfacePane');p.style.zIndex=350;p.style.pointerEvents='none';view.rainOverlay=L.geoJSON(geo,{pane:'rainSurfacePane',renderer:L.svg({pane:'rainSurfacePane'}),interactive:false,smoothFactor:.5,filter:f=>f.properties.mmMax>2,style:f=>({fillColor:f.properties.color,stroke:false,fillOpacity:opacity})}).addTo(view.engine);view.rainDate=rainActiveDate;}
  else{if(view.rainDate!==rainActiveDate){view.rainOverlay.clearLayers();view.rainOverlay.addData(geo);view.rainDate=rainActiveDate;}view.rainOverlay.setStyle({fillOpacity:opacity,opacity});}
 }else{
  const m=view.engine;if(!view.styleReady)return;
  if(!m.getSource('rain-surface')){m.addSource('rain-surface',{type:'geojson',data:geo,tolerance:0});view.rainDate=rainActiveDate;}
  else if(view.rainDate!==rainActiveDate){m.getSource('rain-surface').setData(geo);view.rainDate=rainActiveDate;}
  if(!m.getLayer('rain-surface'))m.addLayer({id:'rain-surface',type:'fill',source:'rain-surface',filter:['>', ['get','mmMax'],2],paint:{'fill-color':['get','color'],'fill-opacity':opacity,'fill-antialias':true}},m.getLayer('territorio-lines')?'territorio-lines':undefined);
  m.setPaintProperty('rain-surface','fill-opacity',opacity);m.setLayoutProperty('rain-surface','visibility',show?'visible':'none');
 }
}
updateChart=function(){const tally=new Map();for(const r of DATA.events)if(eventBase(r))tally.set(r.date,(tally.get(r.date)||0)+1);const counts=dates.map(d=>tally.get(d)||0),max=Math.max(1,...counts),dayMode=$('coenMode').value==='day';$('histogram').innerHTML=dates.map((d,i)=>`<button style="height:${Math.max(6,counts[i]/max*100)}%" class="${!dayMode&&d>=$('dateStart').value&&d<=$('dateEnd').value?'in-range ':''}${d===$('dateEnd').value?'current':''}" title="${esc(fullDate(d))}: ${counts[i]} reportes" aria-label="${esc(fullDate(d))}, ${counts[i]} reportes" data-day="${d}"></button>`).join('');$('histogram').querySelectorAll('button').forEach(b=>b.onclick=()=>{stop();setEnd(b.dataset.day);});$('sliderLabel').textContent=fullDate($('dateEnd').value);$('timeSlider').value=Math.max(0,dates.indexOf($('dateEnd').value));};
const renderBeforeDaily=render;
render=function(){syncRain();renderBeforeDaily();const dayMode=$('coenMode').value==='day',missing=filtered.events.filter(r=>!r.coords).length;$('rangeStart').hidden=dayMode;$('fullPeriod').hidden=dayMode;$('dateEndLabel').textContent=dayMode?'Fecha':'Hasta';$('eventSubtitle').textContent=(dayMode?fullDate($('dateEnd').value)+' · del día':shortDate($('dateStart').value)+' – '+shortDate($('dateEnd').value))+(missing?' · '+missing+' sin ubicación':'');$('layerEventsNote').textContent=(dayMode?'Ocurridas el '+fullDate($('dateEnd').value):'Ocurridas en el periodo')+(missing?' · '+missing+' sin coordenadas':'');$('rainDate').disabled=$('rainFollow').checked;
 const range=rainPeriod(rainActiveEntry),unavailable='Sin capa disponible para '+fullDate(rainActiveDate);$('rainPeriodRange').textContent=rainActiveEntry?range:unavailable;$('rainPeriodClock').textContent=rainActiveEntry?'2026 · hora Perú (UTC−5)':'Periodo visible: 24/10–09/11/2026';$('rainPeriodNote').textContent=rainActiveEntry?range+' · hora Perú (UTC−5)':unavailable;$('rainLayerNote').textContent=rainActiveEntry?'24 h · '+range:'Sin datos para la fecha';$('rainLegend').hidden=!rainActiveEntry;
};
const controlsBeforeDaily=setupControls;
setupControls=function(){controlsBeforeDaily();
 const first=DATA.meta.defaultStartDate,last=DATA.meta.mapEndDate||DATA.meta.coenDate;$('dateStart').min=$('dateEnd').min=first;$('minDate').textContent=shortDate(first);dates=[];for(let d=new Date(first+'T12:00:00Z');d.toISOString().slice(0,10)<=last;d.setUTCDate(d.getUTCDate()+1))dates.push(d.toISOString().slice(0,10));$('timeSlider').max=dates.length-1;$('dateEnd').max=last;$('dateEnd').value=last;$('dateStart').max=last;
 $('rainDate').min=first;$('rainDate').max=DATA.meta.rainLatestEndDate;$('rainDate').value=last;
 $('coenMode').onchange=()=>{stop();clearSelection(false);limit=15;render();};$('fullPeriod').onclick=()=>{stop();$('dateStart').value=dates[0];$('dateEnd').value=dates.at(-1);render();};
 $('rainDate').onchange=()=>{const day=$('rainDate').value||DATA.meta.rainLatestEndDate;$('rainDate').value=day<first?first:day>DATA.meta.rainLatestEndDate?DATA.meta.rainLatestEndDate:day;render();};const startChange=$('dateStart').onchange;$('dateStart').onchange=()=>{const day=$('dateStart').value||first;$('dateStart').value=day<first?first:day>last?last:day;startChange();};$('rainFollow').onchange=()=>render();
 $('play').onclick=()=>{if(timer){stop();return;}let index=dates.indexOf($('dateEnd').value);if(index<0||index===dates.length-1)index=0;setEnd(dates[index]);$('play').textContent='Ⅱ';$('play').setAttribute('aria-label','Pausar evolución');timer=setInterval(()=>{if(++index>=dates.length){stop();return;}setEnd(dates[index]);},1000);};
 const resetBeforeDaily=$('reset').onclick;$('reset').onclick=()=>{$('coenMode').value='day';$('rainFollow').checked=true;$('rainDate').value=last;resetBeforeDaily();};
};

const anaDiarySelections=new Map();
function diaryGroup(r,key){return (r.diary||[]).find(g=>g.key===(key||r.diaryCurrentKey))||null;}
function diaryNumber(v,digits=3){return v===null||v===undefined?'—':num(v,digits);}
function diaryStats(r,day,key){const g=diaryGroup(r,key);if(!g)return {group:null,row:null,last:null,sumKm:null,sumM3:null,count:0};const available=g.rows.filter(x=>x.date<=day),row=g.rows.find(x=>x.date===day)||null;const sum=k=>{const valid=available.filter(x=>Number.isFinite(x[k]));return valid.length?valid.reduce((s,x)=>s+x[k],0):null;};return {group:g,row,last:available.at(-1)||null,sumKm:sum('km'),sumM3:sum('m3'),count:available.length};}
function diaryStatus(r,st){return !r.diary?.length?'Sin reporte vinculado':!st.group?'Sólo normas anteriores':st.row?'Reporte del día':st.last?'Sin reporte del día':'Sin reportes hasta la fecha';}
function saveDiaryFile(text,name,mime){const u=URL.createObjectURL(new Blob([text],{type:mime}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);}
function exportAnaDiaryCSV(){const days=dates,rows=[],points=filtered.ana;for(const r of points){const a=r.current;for(const day of days){const st=diaryStats(r,day),row=st.row;rows.push({idpc:a.IDPC,id_intervencion:r.id,codigo_ficha:a.CODIGO,departamento:a.nombdep,provincia:a.nombprov,distrito:a.nombdistri,sector:a.SECTOR,fecha_reporte:day,norma:st.group?.legal||a.DECRETO,periodo:st.group?.period??'',cobertura:diaryStatus(r,st),avance_diario_km:row?.km??'',avance_diario_m3:row?.m3??'',eliminado_diario_m3:row?.eliminatedM3??'',meta_km:row?.metaKm??'',meta_m3:row?.metaM3??'',suma_reportada_km:st.sumKm??'',suma_reportada_m3:st.sumM3??'',ultimo_reporte:st.last?.date||'',corte_consulta:DATA.anaDiary.sourceDate,estado_corte:a.ESTADO,fecha_estado_corte:DATA.meta.anaDate});}}
 const keys=Object.keys(rows[0]||{}),quote=v=>{let s=String(v??'');if(/^[=+@\-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};saveDiaryFile('\ufeff'+[keys.map(quote).join(';'),...rows.map(r=>keys.map(k=>quote(r[k])).join(';'))].join('\r\n'),'ANA_Diario_536_'+dates[0]+'_'+dates.at(-1)+'.csv','text/csv;charset=utf-8');}
function renderAnaDiary(){
 if(!DATA?.anaDiary)return;if($('anaDiaryFollow').checked)$('anaDiaryDate').value=$('dateEnd').value;$('anaDiaryDate').disabled=$('anaDiaryFollow').checked;const day=$('anaDiaryDate').value,points=filtered.ana,stats=points.map(r=>({r,s:diaryStats(r,day)})),reported=stats.filter(x=>x.s.row),sum=k=>{const vv=reported.filter(x=>Number.isFinite(x.s.row[k]));return vv.length?num(vv.reduce((t,x)=>t+x.s.row[k],0),3):'—';};
 $('anaDiaryCoverage').textContent='Base: '+DATA.anaDiary.matchedPoints+'/536 puntos con historial vinculado · '+DATA.anaDiary.currentLegalPoints+' con reportes de la norma del corte disponible · '+DATA.anaDiary.previousOnlyPoints+' sólo de normas anteriores · '+DATA.anaDiary.unmatchedPoints+' sin vínculo.';
 $('anaDiarySummary').innerHTML=`<span><b>${fullDate(day)}</b></span><span><b>${reported.length} / ${points.length}</b> con reporte del día</span><span><b>${sum('km')}</b> km reportados</span><span><b>${sum('m3')}</b> m³ reportados</span>`;
 $('anaDiaryRows').innerHTML=stats.map(({r,s})=>{const a=r.current;return `<tr class="${s.row?'':'diary-missing'}"><td><button class="diary-point" data-diary-point="${esc(r.id)}">${esc(a.IDPC)} · ${esc(title(a.SECTOR))}</button><small>${esc(a.CODIGO)}</small></td><td>${esc([a.nombdep,a.nombprov,a.nombdistri].map(title).join(' / '))}</td><td>${diaryNumber(s.row?.km)}</td><td>${diaryNumber(s.row?.m3)}</td><td>${diaryNumber(s.sumKm)}</td><td>${s.last?fullDate(s.last.date):'—'}</td><td>${esc(diaryStatus(r,s))}${s.group?'<small>'+esc(s.group.legal)+' · periodo '+esc(s.group.period)+'</small>':''}</td></tr>`;}).join('')||'<tr><td colspan="7">Sin puntos para los filtros seleccionados.</td></tr>';
 $('anaDiaryRows').querySelectorAll('[data-diary-point]').forEach(b=>b.onclick=()=>{$('anaDiaryDialog').close();selectRecord('ana',b.dataset.diaryPoint,true);});
}
function diaryPointHTML(r){
 const day=$('dateEnd').value,choice=anaDiarySelections.get(r.id)||r.diaryCurrentKey,st=diaryStats(r,day,choice);let h='<section class="diary-point-block"><h3>Avance diario</h3>';
 if(!r.diary?.length)return h+'<p class="diary-note">Sin reporte diario vinculado en la consulta del 09/11. Se conservan los avances de los cortes disponibles.</p></section>';
 h+='<label class="stack-label">Norma y periodo<select id="anaDiaryPeriod"><option value="">Intervención del corte disponible'+(!r.diaryCurrentKey?' · sin diario':'')+'</option>'+r.diary.map(g=>`<option value="${esc(g.key)}" ${choice===g.key?'selected':''}>${esc(g.legal)} · periodo ${g.period}${g.matchesCurrentLegal?' · norma del corte disponible':''}</option>`).join('')+'</select></label>';
 if(!st.group)return h+'<p class="diary-note">Sólo hay reportes de normas anteriores. Seleccione un periodo para consultarlos.</p></section>';
 h+=`<p class="diary-note">${fullDate(day)} · ${esc(diaryStatus(r,st))}</p><div class="metric-grid"><div class="metric"><b>${diaryNumber(st.row?.km)}</b><span>km reportados ese día</span></div><div class="metric"><b>${diaryNumber(st.row?.m3)}</b><span>m³ reportados ese día</span></div></div><p class="diary-note">Suma de ${st.count} reportes hasta la fecha: <b>${diaryNumber(st.sumKm)} km</b> · <b>${diaryNumber(st.sumM3)} m³</b>. Último reporte: ${st.last?fullDate(st.last.date):'sin registro'}.</p>`;
 if(st.group.key===r.diaryCurrentKey&&st.group.rows.at(-1).date<=DATA.meta.anaDate){const finalKm=st.group.rows.reduce((t,x)=>t+(Number.isFinite(x.km)?x.km:0),0),cutKm=r.current.AVANCEKM;if(Number.isFinite(cutKm)&&Math.abs(finalKm-cutKm)>.001)h+=`<p class="diary-variance">Suma del diario: ${num(finalKm,3)} km · acumulado del corte ${fullDate(DATA.meta.anaDate)}: ${num(cutKm,3)} km. Diferencia pendiente de conciliación.</p>`;}
 h+='<details><summary>Reportes del periodo · '+st.group.rows.length+'</summary><p class="diary-note">Valores por fecha; no son acumulados diarios. Las fechas ausentes no se completan con cero.</p><div class="diary-scroll"><table class="diary-table"><thead><tr><th>Fecha</th><th>km del día</th><th>m³ del día</th><th>Suma km</th></tr></thead><tbody>';let accum=0;for(const x of st.group.rows){if(Number.isFinite(x.km))accum+=x.km;h+=`<tr><td>${fullDate(x.date)}</td><td>${diaryNumber(x.km)}</td><td>${diaryNumber(x.m3)}</td><td>${num(accum,3)}</td></tr>`;}return h+'</tbody></table></div></details></section>';
}
const detailBeforeAnaDiary=renderDetail;renderDetail=function(){detailBeforeAnaDiary();if(selected?.type==='ana'){const r=DATA.ana.find(x=>x.id===selected.id);if(r){$('detail').innerHTML+=diaryPointHTML(r);if($('anaDiaryPeriod'))$('anaDiaryPeriod').onchange=()=>{anaDiarySelections.set(r.id,$('anaDiaryPeriod').value||r.diaryCurrentKey);renderDetail();};}}};
const filterBeforeAnaDiary=filteredData;filteredData=function(){const x=filterBeforeAnaDiary();if($('anaDiaryOnlyReports').checked)x.ana=x.ana.filter(r=>!!diaryStats(r,$('dateEnd').value).row);return x;};
const renderBeforeAnaDiary=render;render=function(){renderBeforeAnaDiary();renderAnaDiary();};
const controlsBeforeAnaDiary=setupControls;setupControls=function(){controlsBeforeAnaDiary();$('anaDiaryDate').min=DATA.meta.defaultStartDate;$('anaDiaryDate').max=DATA.meta.mapEndDate||DATA.meta.coenDate;$('anaDiaryDate').value=DATA.meta.mapEndDate||DATA.meta.coenDate;$('openAnaDiary').onclick=()=>{renderAnaDiary();$('anaDiaryDialog').showModal();};$('closeAnaDiary').onclick=()=>$('anaDiaryDialog').close();$('anaDiaryFollow').onchange=()=>renderAnaDiary();$('anaDiaryDate').onchange=()=>{let day=$('anaDiaryDate').value||DATA.meta.coenDate;$('anaDiaryDate').value=day<dates[0]?dates[0]:day>dates.at(-1)?dates.at(-1):day;renderAnaDiary();};$('anaDiaryOnlyReports').onchange=()=>render();$('exportAnaDiary').onclick=exportAnaDiaryCSV;$('exportAnaDiaryOriginal').onclick=()=>{const raw=Uint8Array.from(atob(DATA.anaDiary.originalGzip),c=>c.charCodeAt(0));saveDiaryFile(pako.ungzip(raw,{to:'string'}),DATA.anaDiary.sourceFilename,'application/json');};const beforeReset=$('reset').onclick;$('reset').onclick=()=>{$('anaDiaryOnlyReports').checked=false;$('anaDiaryFollow').checked=true;anaDiarySelections.clear();beforeReset();};};

function anaTemporal(){return $('anaMapView')?.value==='daily';}
function anaDailyMapState(r){const day=$('dateEnd').value,s=diaryStats(r,day);let cls='missing',color='#aab4bd',label='Sin acumulado disponible';if(s.count>0){const values=[s.sumKm,s.sumM3].filter(Number.isFinite);if(values.length){const advanced=values.some(v=>v>0);cls=advanced?'advanced':'zero';color=advanced?'#147ca4':'#bf9743';label=advanced?'Con avance acumulado':'Acumulado registrado en cero';}}return {...s,day,cls,color,label};}

window.anaMapColor=(r,snapshot)=>anaTemporal()?anaDailyMapState(r).color:r[snapshot].ESTADO==='Ejecutado'?'#348778':r[snapshot].ESTADO==='En Ejecución'?'#164f78':'#8b98a4';
function riverHistoryRows(r){return dates.map(day=>({day,view:historicalRiver(r,day)}));}
function temporalChart(points,unit,mode='line'){
 const W=260,H=140,L=36,R=8,T=19,B=27,w=W-L-R,h=H-T-B,valid=points.filter(p=>Number.isFinite(p.value));if(!valid.length)return '<p class="diary-note">Sin serie disponible en el periodo.</p>';
 const vals=valid.map(p=>p.value),max=Math.max(...vals),min=mode==='bar'?Math.min(0,...vals):Math.min(...vals),span=max-min||Math.max(Math.abs(max)*.1,1),y=v=>T+h-(v-min)/span*h,x=i=>L+(i+.5)*w/points.length;let svg=`<svg class="temporal-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Historial ${esc(unit)}"><text x="${L}" y="11">${esc(decimal(max))} ${esc(unit)}</text><path d="M${L} ${T}V${T+h}H${W-R}" fill="none" stroke="#dbe2e9"/>`;
 let segment=[];const flush=()=>{if(segment.length>1)svg+=`<path d="${segment.join(' ')}" fill="none" stroke="#207fa4" stroke-width="2"/>`;segment=[];};
 points.forEach((p,i)=>{if(Number.isFinite(p.value)){if(mode==='bar')svg+=`<rect x="${x(i)-w/points.length*.32}" y="${y(Math.max(0,p.value))}" width="${w/points.length*.64}" height="${Math.max(1,Math.abs(y(p.value)-y(0)))}" fill="${p.day===$('dateEnd').value?'#bf9743':'#207fa4'}"/>`;else{segment.push(`${segment.length?'L':'M'}${x(i)} ${y(p.value)}`);svg+=`<circle cx="${x(i)}" cy="${y(p.value)}" r="2.4" fill="${p.day===$('dateEnd').value?'#bf9743':'#207fa4'}"/>`;}}else{flush();svg+=`<text x="${x(i)}" y="${T+h-2}" text-anchor="middle" fill="#aab4bd">–</text>`;}});flush();
 points.forEach((p,i)=>{if(p.day===$('dateEnd').value)svg+=`<path d="M${x(i)} ${T}V${T+h}" stroke="#bf9743" stroke-width=".8" stroke-dasharray="2 2"/>`;svg+=`<rect data-history-day="${p.day}" x="${L+i*w/points.length}" y="${T}" width="${w/points.length}" height="${h}" fill="transparent" tabindex="0" role="button" aria-label="${fullDate(p.day)}: ${Number.isFinite(p.value)?decimal(p.value)+' '+esc(unit):'sin dato'}"><title>${fullDate(p.day)} · ${Number.isFinite(p.value)?decimal(p.value)+' '+esc(unit):'sin dato'}</title></rect>`;});
 svg+=`<text x="${L}" y="${H-10}">${shortAnaDate(points[0].day)}</text><text x="${W-R}" y="${H-10}" text-anchor="end">${shortAnaDate(points.at(-1).day)}</text><text x="${L-5}" y="${T+h}" text-anchor="end">${decimal(min)}</text></svg>`;return svg;
}
const integratedCandidates=mapSymbolCandidates;
mapSymbolCandidates=function(data,visible,snapshot){const rows=integratedCandidates(data,visible,snapshot);for(const x of rows){if(x.type==='ana'&&anaTemporal()){const state=anaDailyMapState(x.record);x.color=state.color;x.diaryClass=state.cls;x.tip=title(x.record.current.SECTOR)+' · '+fullDate(state.day)+'\n'+state.label+(state.sumKm!==null?' · '+diaryNumber(state.sumKm)+' km acumulados':'')+(state.row?'\nAvance del día: '+diaryNumber(state.row.km)+' km / '+diaryNumber(state.row.m3)+' m³':'\nSin reporte ese día')+(state.last?'\nÚltimo reporte: '+fullDate(state.last.date):'');x.anaDayValue=Number.isFinite(state.sumKm)?diaryNumber(state.sumKm)+' km acum.':null;}if(x.type==='hydro')x.color=x.record.historyClassification?x.record.alert===0?'#3c8798':hydroColors[x.record.alert]:'#9ca5ab';}return rows;};
const integratedFilter=filteredData;
filteredData=function(){const x=integratedFilter();x.hydro=DATA.hydro.filter(r=>matchesTerritory('hydro',r)&&(!norm($('search').value)||norm(JSON.stringify(r)).includes(norm($('search').value)))).map(r=>historicalRiver(r,$('dateEnd').value)).filter(r=>!$('onlyAlerts').checked||r.historyClassification&&r.alert>0);return x;};
const anaCutDetail=anaDetail;
anaDetail=function(r){if(!anaTemporal())return anaCutDetail(r);const s=anaDailyMapState(r),a=r.current;let h=detailHeader('PUNTO CRÍTICO ANA · '+a.IDPC,title(a.SECTOR),[a.nombdep,a.nombprov,a.nombdistri].map(title).join(' / '),s.label);h+=`<p class="detail-sub">${fullDate(s.day)} · ${esc(s.group?.legal||a.DECRETO)}</p><div class="metric-grid"><div class="metric"><b>${diaryNumber(s.sumKm)}</b><span>km acumulados registrados</span></div><div class="metric"><b>${diaryNumber(s.sumM3)}</b><span>m³ acumulados registrados</span></div></div><p class="diary-note">Avance del día: ${diaryNumber(s.row?.km)} km · ${diaryNumber(s.row?.m3)} m³. Último reporte: ${s.last?fullDate(s.last.date):'sin registro'}.</p><h3>Avance reportado por día</h3>`;h+=temporalChart(dates.map(day=>({day,value:diaryStats(r,day).row?.km??null})),'km','bar');h+='<p class="diary-note">Seleccione una fecha del gráfico para actualizar el mapa.</p><details><summary>Corte oficial '+fullDate(DATA.meta.anaDate)+'</summary>'+anaCutDetail(r).replace(/<button id="closeDetail"[\s\S]*?<\/button>/,'')+'</details>';return h;};
const integratedDetail=renderDetail;
renderDetail=function(){if(selected?.type==='ana'&&anaTemporal()){const r=DATA.ana.find(x=>x.id===selected.id);$('detail').innerHTML=anaDetail(r)+'<details><summary>Reportes y periodos disponibles</summary>'+diaryPointHTML(r)+'</details>';$('closeDetail').onclick=()=>clearSelection();if($('anaDiaryPeriod'))$('anaDiaryPeriod').onchange=()=>{anaDiarySelections.set(r.id,$('anaDiaryPeriod').value||r.diaryCurrentKey);renderDetail();};document.querySelector('.right-panel').classList.add('has-selection');}else if(selected?.type!=='hydro'){integratedDetail();}else{const original=DATA.hydro.find(x=>x.id===selected.id),r=historicalRiver(original,$('dateEnd').value),series=DATA.hydroHistory?.byStation[r.id],rows=riverHistoryRows(original);let h=detailHeader('RÍO · ESTACIÓN '+r.id,title(r.name),'Estación '+title(r.station)+' · '+[r.department,r.province,r.district].filter(Boolean).map(title).join(' / '),r.alertLabel);
 if(r.primary)h+=`<div class="measure-kind">${esc(r.primary.kind)}</div><div class="hydro-value">${decimal(r.primary.value)} <span>${esc(r.primary.unit)}</span></div><p class="measure-date">${fullDate(r.historyDay)} · promedio diario preliminar</p>`;else h+=`<p class="diary-note">Sin lectura publicada para ${fullDate(r.historyDay)}.</p>`;
 if(r.caudal&&r.waterLevel)h+=`<p class="diary-note">Nivel medio: ${decimal(r.waterLevel.value)} ${esc(r.waterLevel.unit)}.</p>`;
 if(r.historyClassification){const ref=r.alertReference;h+=`<p class="diary-note">Clasificación calculada con los umbrales diarios de ${esc(ref.kind.toLowerCase())} · ${esc(r.alertDirection.toLowerCase())}.</p><div class="thresholds">`+['amarillo','naranja','rojo'].map((k,i)=>`<div style="border-color:${hydroColors[i+1]}">${title(k)}<strong>${decimal(ref.thresholds[k])} ${esc(ref.unit)}</strong></div>`).join('')+'</div>';}else h+='<p class="diary-note">Sin umbrales históricos suficientes para clasificar esta fecha.</p>';
 const flowPoints=rows.map(x=>({day:x.day,value:x.view.caudal?.value??null})),levelPoints=rows.map(x=>({day:x.day,value:x.view.waterLevel?.value??null}));h+='<h3>Historial de caudal</h3>'+temporalChart(flowPoints,'m³/s');if(!flowPoints.some(p=>Number.isFinite(p.value))&&levelPoints.some(p=>Number.isFinite(p.value)))h+='<h3>Historial de nivel</h3>'+temporalChart(levelPoints,series?.level?.unit||'m');
 h+='<p class="diary-note">Seleccione una fecha del gráfico para actualizar el mapa.</p><details><summary>Lecturas por fecha</summary><div class="diary-scroll"><table class="diary-table"><thead><tr><th>Fecha</th><th>m³/s</th><th>'+esc(series?.level?.unit||'m')+'</th><th>Clasificación</th></tr></thead><tbody>'+rows.map(({day,view:v})=>`<tr><td>${fullDate(day)}</td><td>${diaryNumber(v.caudal?.value,4)}</td><td>${diaryNumber(v.waterLevel?.value,4)}</td><td>${esc(v.alertLabel)}</td></tr>`).join('')+'</tbody></table></div></details>';
 if(original.primary)h+=`<details><summary>Lectura y alerta del corte conservado</summary><p class="diary-note">${esc(original.primary.kind)}: ${decimal(original.primary.value)} ${esc(original.primary.unit)} · ${esc(readingWhen(original.primary))}. Categoría oficial: ${esc(original.alertLabel)} · ${esc(clock(original.alertDateTime))}.</p></details>`;
 h+=link(series?.caudal?.sourceUrl||series?.level?.sourceUrl||original.url,'Hidrograma oficial');$('detail').innerHTML=h;$('closeDetail').onclick=()=>clearSelection();document.querySelector('.right-panel').classList.add('has-selection');}
 $('detail').querySelectorAll('[data-history-day]').forEach(b=>{b.onclick=()=>{stop();setEnd(b.dataset.historyDay);};b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();b.onclick();}};});
};
const integratedList=renderList;
renderList=function(){if(tab!=='ana'||!anaTemporal())return integratedList();const rows=[...filtered.ana].sort((a,b)=>Number(!!anaDailyMapState(b).row)-Number(!!anaDailyMapState(a).row)||title(a.current.SECTOR).localeCompare(title(b.current.SECTOR),'es'));$('resultCount').textContent=num(rows.length,0);$('resultsList').innerHTML=rows.slice(0,limit).map(r=>{const s=anaDailyMapState(r);return `<button class="record" data-id="${esc(r.id)}"><strong>${esc(title(r.current.SECTOR))}</strong><span>${esc(title(r.current.nombdistri))} · IDPC ${esc(r.current.IDPC)}</span><span class="record-meta"><i class="daily-dot" style="background:${s.color}"></i>${esc(s.label)} · ${shortAnaDate(s.day)}</span><span>${s.sumKm!==null?diaryNumber(s.sumKm)+' km acumulados':'Sin acumulado disponible'}${s.last?' · último reporte '+shortAnaDate(s.last.date):''}</span></button>`;}).join('')||'<p class="empty">Sin registros para la selección.</p>';$('resultsList').querySelectorAll('button').forEach(b=>b.onclick=()=>selectRecord('ana',b.dataset.id,true));$('showMore').hidden=rows.length<=limit;};
const integratedRender=render;
render=function(){integratedRender();const daily=anaTemporal(),reported=filtered.ana.filter(r=>!!diaryStats(r,$('dateEnd').value).row).length,flows=filtered.hydro.filter(r=>r.caudal).length,levels=filtered.hydro.filter(r=>!r.caudal&&r.waterLevel).length;$('anaSubtitle').textContent=daily?filtered.ana.filter(r=>anaDailyMapState(r).count>0).length+' con acumulado · '+fullDate($('dateEnd').value):'Corte '+fullDate(activeAnaDate());$('snapshot').disabled=daily;$('compareCut').disabled=daily;$('onlyChanges').disabled=daily;$('status').disabled=daily;$('anaDayLegend').hidden=!daily;$('riverDayLegend').hidden=!$('layer_hydro').checked;$('mapCaption').textContent=fullDate($('dateEnd').value)+' · ANA: '+(daily?filtered.ana.filter(r=>anaDailyMapState(r).count>0).length+' con acumulado':'corte '+shortAnaDate(activeAnaDate()))+' · Ríos: '+flows+' caudal / '+levels+' nivel';$('hydroLayerNote').textContent=shortAnaDate($('dateEnd').value)+' · '+flows+' caudales / '+levels+' niveles · promedio diario';$('anaLayerNote').textContent=daily?'Acumulado al '+fullDate($('dateEnd').value):'Geometría al 20/10/2026';$('anaDayStatus').textContent=daily?'Colores por acumulado registrado. Última fecha en cada punto.':'Colores por estado del corte seleccionado.';};
function exportRiverHistory(){const rows=[];for(const r of DATA.hydro.filter(r=>matchesTerritory('hydro',r)))for(const {day,view:v} of riverHistoryRows(r))rows.push({id_estacion:r.id,estacion:r.station,rio:r.name,departamento:r.department,fecha:day,caudal_medio_m3s:v.caudal?.value??'',nivel_medio_m:v.waterLevel?.value??'',unidad_nivel:v.waterLevel?.unit||'',clasificacion:v.alertLabel,variable_umbral:v.alertReference?.kind||'',unidad_umbral:v.alertReference?.unit||'',umbral_amarillo:v.alertReference?.thresholds.amarillo??'',umbral_naranja:v.alertReference?.thresholds.naranja??'',umbral_rojo:v.alertReference?.thresholds.rojo??'',resolucion:'Promedio diario',fuente:'SENAMHI'});const keys=Object.keys(rows[0]||{}),q=x=>'"'+String(x??'').replace(/^[=+@\-]/,"'$&").replace(/"/g,'""')+'"';saveDiaryFile('\ufeff'+[keys.map(q).join(';'),...rows.map(r=>keys.map(k=>q(r[k])).join(';'))].join('\r\n'),'SENAMHI_Rios_Historico_24oct_09nov2026.csv','text/csv;charset=utf-8');}
const integratedControls=setupControls;
setupControls=function(){integratedControls();$('anaMapView').value='daily';$('anaMapView').onchange=()=>{if(anaTemporal()){$('snapshot').value='current';$('compareCut').value=DATA.meta.anaPreviousDate;$('onlyChanges').checked=false;$('status').value='';populateTerritories();}render();};$('exportRiverHistory').onclick=exportRiverHistory;const resetBefore=$('reset').onclick;$('reset').onclick=()=>{$('anaMapView').value='daily';resetBefore();};};

function readEmbeddedData(){const raw=JSON.parse(document.getElementById('embeddedData').textContent);return raw.encoding==='gzip-base64'?JSON.parse(pako.ungzip(Uint8Array.from(atob(raw.data),c=>c.charCodeAt(0)),{to:'string'})):raw;}
function riverUnit(unit){const s=String(unit||'').trim().toLowerCase().replace(/\s+/g,'');if(s==='m3/s'||s==='m³/s')return 'm³/s';if(s==='msnm'||s.replace(/\./g,'')==='msnm')return 'm.s.n.m.';if(s==='m')return 'm';return String(unit||'Sin unidad');}
function classifyRiverReading(reading){
 const unavailable={known:false,alert:0,direction:null,label:reading?'Sin umbral disponible':'Sin lectura para la fecha',reading};if(!reading||!Number.isFinite(reading.value))return unavailable;
 const allowed=reading.variable==='caudal'?reading.unit==='m³/s':reading.variable==='level'&&['m','m.s.n.m.'].includes(reading.unit);if(!allowed||reading.thresholdUnit!==reading.unit)return {...unavailable,label:'Unidad de umbral no compatible'};
 const {amarillo:a,naranja:o,rojo:red}=reading.thresholds;if(![a,o,red].every(Number.isFinite))return [a,o,red].some(Number.isFinite)?{...unavailable,label:'Umbrales incompletos'}:unavailable;
 const direction=a<o&&o<red?'CRECIDA':a>o&&o>red?'ESTIAJE':null;if(!direction)return {...unavailable,label:'Umbrales sin orden válido'};
 const crosses=v=>direction==='CRECIDA'?reading.value>=v:reading.value<=v,alert=crosses(red)?3:crosses(o)?2:crosses(a)?1:0;
 return {known:true,alert,direction,label:alert?['','Amarillo','Naranja','Rojo'][alert]+' por '+direction.toLowerCase():'Fuera de umbrales de '+direction.toLowerCase(),reading};
}
function historicalRiver(r,day){
 const history=DATA.hydroHistory?.byStation[r.id];const make=(series,variable,kind)=>{const v=series?.days[day];if(!v||!Number.isFinite(v.value))return null;const unit=riverUnit(series.unit);return {value:v.value,unit,thresholdUnit:unit,variable,kind,dateTime:day,resolution:'daily',timeZone:'America/Lima',timeBasis:'Promedio diario publicado; sin hora de medición asignada',thresholds:v.thresholds||{amarillo:null,naranja:null,rojo:null},sourceUrl:series.sourceUrl,source:'SENAMHI · hidrograma diario',stale:false};};
 const caudal=make(history?.caudal,'caudal','Caudal medio diario'),waterLevel=make(history?.level,'level','Nivel medio diario'),flowClassification=classifyRiverReading(caudal),levelClassification=classifyRiverReading(waterLevel),mode=$('riverMeasure')?.value||'auto';
 const primary=mode==='flow'?caudal:mode==='level'?waterLevel:caudal||waterLevel;const classification=primary?.variable==='caudal'?flowClassification:primary?.variable==='level'?levelClassification:classifyRiverReading(null);
 const alertLabel=(primary?primary.variable==='caudal'?'Caudal · ':'Nivel · ':'')+classification.label;
 return {...r,primary,caudal,waterLevel,flowClassification,levelClassification,alertReference:classification.known?primary:null,alert:classification.alert,alertLabel,alertDirection:classification.direction,alertDateTime:classification.known?day:null,historyDay:day,historyClassification:classification.known,historyAvailable:!!history,subtitle:primary?decimal(primary.value)+' '+primary.unit+' · '+alertLabel:alertLabel};
}
function riverReadingCard(reading,classification,label,represented){
 const color=classification.known?(classification.alert?hydroColors[classification.alert]:'#3c8798'):'#9ca5ab';let h=`<section class="river-reading-card${represented?' represented':''}"><div class="river-card-heading"><h3>${esc(label)}</h3>${represented?'<small>Valor y color en el mapa</small>':''}</div>`;
 if(!reading)return h+'<p class="diary-note">Sin lectura para la fecha seleccionada.</p></section>';
 h+=`<div class="hydro-value">${decimal(reading.value)} <span>${esc(reading.unit)}</span></div><p class="measure-date">${fullDate(reading.dateTime)} · promedio diario preliminar</p><span class="river-classification" style="border-color:${color}"><i style="background:${color}"></i>${esc(classification.label)}</span>`;
 if(Object.values(reading.thresholds).some(Number.isFinite)&&reading.thresholdUnit===reading.unit){h+=`<p class="diary-note">${classification.known?'Clasificación del '+(reading.variable==='caudal'?'caudal':'nivel')+' con umbrales en '+esc(reading.unit)+' · '+esc(classification.direction.toLowerCase()):'Umbrales publicados en '+esc(reading.unit)+' · clasificación no disponible'}.</p><div class="thresholds">`+['amarillo','naranja','rojo'].map((k,i)=>`<div style="border-color:${hydroColors[i+1]}">${title(k)}<strong>${Number.isFinite(reading.thresholds[k])?decimal(reading.thresholds[k])+' '+esc(reading.unit):'No publicado'}</strong></div>`).join('')+'</div>';}
 if(classification.direction==='ESTIAJE')h+='<p class="river-context">Estos umbrales de estiaje no clasifican el peligro de desbordamiento. Sin umbral de crecida incorporado para esta medición.</p>';
 return h+'</section>';
}
const detailBeforeRiverUnits=renderDetail;
renderDetail=function(){
 if(selected?.type!=='hydro')return detailBeforeRiverUnits();const original=DATA.hydro.find(x=>x.id===selected.id),r=historicalRiver(original,$('dateEnd').value),series=DATA.hydroHistory?.byStation[r.id],rows=riverHistoryRows(original);let h=detailHeader('RÍO · ESTACIÓN '+r.id,title(r.name),'Estación '+title(r.station)+' · '+[r.department,r.province,r.district].filter(Boolean).map(title).join(' / '),r.alertLabel);
 const flowCard=riverReadingCard(r.caudal,r.flowClassification,'Caudal medio diario',r.primary?.variable==='caudal'),levelCard=riverReadingCard(r.waterLevel,r.levelClassification,'Nivel medio diario',r.primary?.variable==='level');h+=r.primary?.variable==='level'?levelCard+flowCard:flowCard+levelCard;
 h+='<h3>Historial de caudal · m³/s</h3>'+temporalChart(rows.map(x=>({day:x.day,value:x.view.caudal?.value??null})),'m³/s');
 if(rows.some(x=>x.view.waterLevel)){const unit=riverUnit(series?.level?.unit);h+='<h3>Historial de nivel · '+esc(unit)+'</h3>'+temporalChart(rows.map(x=>({day:x.day,value:x.view.waterLevel?.value??null})),unit);}
 h+='<p class="diary-note">Seleccione una fecha del gráfico para actualizar el mapa.</p><details><summary>Lecturas y clasificación por fecha</summary><div class="diary-scroll"><table class="diary-table"><thead><tr><th>Fecha</th><th>Caudal · m³/s</th><th>Clasificación del caudal</th><th>Nivel · '+esc(riverUnit(series?.level?.unit))+'</th><th>Clasificación del nivel</th></tr></thead><tbody>'+rows.map(({day,view:v})=>`<tr><td>${fullDate(day)}</td><td>${diaryNumber(v.caudal?.value,4)}</td><td>${esc(v.flowClassification.label)}</td><td>${diaryNumber(v.waterLevel?.value,4)}</td><td>${esc(v.levelClassification.label)}</td></tr>`).join('')+'</tbody></table></div></details>';
 if(original.primary){const p=original.primary,ref=original.alertReference;h+=`<details><summary>Lectura y categoría oficial archivadas</summary><p class="diary-note">Lectura archivada: ${esc(p.kind)} · ${decimal(p.value)} ${esc(riverUnit(p.unit))} · ${esc(readingWhen(p))}.</p><p class="diary-note">Categoría oficial archivada: ${esc(original.alertLabel)}${original.alertDirection?' · '+esc(original.alertDirection.toLowerCase()):''}. ${ref?'Referencia: '+esc(ref.kind)+' · '+decimal(ref.value)+' '+esc(riverUnit(ref.unit))+'. ':''}${esc(clock(original.alertDateTime))}.</p></details>`;}
 h+=link(series?.caudal?.sourceUrl||series?.level?.sourceUrl||original.url,'Hidrograma oficial');$('detail').innerHTML=h;$('closeDetail').onclick=()=>clearSelection();document.querySelector('.right-panel').classList.add('has-selection');$('detail').querySelectorAll('[data-history-day]').forEach(b=>{b.onclick=()=>{stop();setEnd(b.dataset.historyDay);};b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();b.onclick();}};});
};
const candidatesBeforeRiverUnits=mapSymbolCandidates;
mapSymbolCandidates=function(data,visible,snapshot){const out=candidatesBeforeRiverUnits(data,visible,snapshot);for(const x of out)if(x.type==='hydro'){const r=x.record;const other=r.primary?.variable==='caudal'?r.waterLevel:r.caudal,classification=r.primary?.variable==='caudal'?r.levelClassification:r.flowClassification;if(other)x.tip+='\n'+(other.variable==='caudal'?'Caudal':'Nivel')+': '+decimal(other.value)+' '+other.unit+' · '+classification.label;}return out;};
const controlsBeforeRiverUnits=setupControls;
setupControls=function(){controlsBeforeRiverUnits();$('riverMeasure').value='auto';$('riverMeasure').onchange=()=>render();const resetBeforeUnits=$('reset').onclick;$('reset').onclick=()=>{$('riverMeasure').value='auto';resetBeforeUnits();};};
const renderBeforeRiverUnits=render;
render=function(){renderBeforeRiverUnits();const flow=filtered.hydro.filter(r=>r.primary?.variable==='caudal').length,levels=filtered.hydro.filter(r=>r.primary?.variable==='level').length;$('hydroLayerNote').textContent=shortAnaDate($('dateEnd').value)+' · mapa: '+flow+' caudales / '+levels+' niveles';$('riverUnitNote').textContent='El color corresponde a la variable y unidad mostradas.';};
exportRiverHistory=function(){const rows=[];for(const r of DATA.hydro.filter(r=>matchesTerritory('hydro',r)))for(const {day,view:v} of riverHistoryRows(r)){const fc=v.flowClassification,lc=v.levelClassification;rows.push({id_estacion:r.id,estacion:r.station,rio:r.name,departamento:r.department,fecha:day,caudal_medio:v.caudal?.value??'',unidad_caudal:v.caudal?.unit||'m³/s',clasificacion_caudal:fc.label,tipo_umbral_caudal:fc.direction||'',caudal_umbral_amarillo:v.caudal?.thresholds.amarillo??'',caudal_umbral_naranja:v.caudal?.thresholds.naranja??'',caudal_umbral_rojo:v.caudal?.thresholds.rojo??'',nivel_medio:v.waterLevel?.value??'',unidad_nivel:v.waterLevel?.unit||'',clasificacion_nivel:lc.label,tipo_umbral_nivel:lc.direction||'',nivel_umbral_amarillo:v.waterLevel?.thresholds.amarillo??'',nivel_umbral_naranja:v.waterLevel?.thresholds.naranja??'',nivel_umbral_rojo:v.waterLevel?.thresholds.rojo??'',variable_mapa:v.primary?.variable||'',clasificacion_mapa:v.alertLabel,resolucion:'Promedio diario',fuente:'SENAMHI'});}
 const keys=Object.keys(rows[0]||{}),q=x=>'"'+String(x??'').replace(/^[=+@\-]/,"'$&").replace(/"/g,'""')+'"';saveDiaryFile('\ufeff'+[keys.map(q).join(';'),...rows.map(r=>keys.map(k=>q(r[k])).join(';'))].join('\r\n'),'SENAMHI_Rios_Historico_'+dates[0]+'_'+dates.at(-1)+'.csv','text/csv;charset=utf-8');};

let rainClimateReference=null;
const rainClimateColors=['#bbd3da','#6fac9e','#d8bd76','#cc7d69','#8b395b','#99a1a8','#7c9997'];
const rainClimateLabels=['Sin lluvia ≥0,1 mm / 24 h','Hasta P90','Lluviosa (P90–P95)','Muy lluviosa (P95–P99)','Extremadamente lluviosa (>P99)','Sin cobertura histórica suficiente','Histórico disponible · P99 por recalcular'];
function validateRainReference(r){
 if(r?.encoding==='gzip-base64')r=JSON.parse(pako.ungzip(Uint8Array.from(atob(r.data),c=>c.charCodeAt(0)),{to:'string'}));
 if(!r||r.schema!=='fen-rain-reference/v1'||r.dataset!=='PISCOp v3.0'||r.units!=='mm/24h'||r.thresholdBasis!=='wet_days_ge_1mm_by_calendar_month'||r.status!=='computed_from_real_netcdf')throw Error('El archivo no es una referencia PISCOp compatible.');
 if(r.baselineStart!=='1991-01-01'||r.baselineEnd!=='2025-12-31'||r.minWetDays<100||r.minValidFraction<.8)throw Error('Periodo o cobertura histórica incompatibles.');
 for(const key of ['lat','lon']){const a=r[key];if(!Array.isArray(a)||a.length<2||a.length>1000||a.some(v=>!Number.isFinite(v)))throw Error('Coordenadas no válidas.');for(let i=1;i<a.length;i++)if(a[i]<=a[i-1]||Math.abs(a[i]-a[i-1]-.1)>.002)throw Error('La grilla debe ser regular de 0,10°.');}
 const n=r.lat.length*r.lon.length;if(n>100000)throw Error('Grilla demasiado grande.');
 for(let m=1;m<=12;m++){const s=r.months?.[String(m)];let expected=0;for(let y=1991;y<=2025;y++)expected+=new Date(Date.UTC(y,m,0)).getUTCDate();if(!s||s.expectedDays!==expected||!s.allDays)throw Error('Fechas históricas incorrectas para el mes '+m+'.');for(const k of ['p90','p95','p99','validDays','wetDays'])if(!Array.isArray(s[k])||s[k].length!==n)throw Error('Serie histórica incompleta.');
  if(s.allDays){if(s.allDays.basis!=='all_valid_days_by_calendar_month')throw Error('Referencia de todos los días no válida.');for(const k of ['p90','p95','p99'])if(!Array.isArray(s.allDays[k])||s.allDays[k].length!==n)throw Error('Referencia de zonas secas incompleta.');}
  for(let i=0;i<n;i++){if(!Number.isInteger(s.validDays[i])||!Number.isInteger(s.wetDays[i])||s.validDays[i]<0||s.validDays[i]>s.expectedDays||s.wetDays[i]<0||s.wetDays[i]>s.validDays[i])throw Error('Conteos históricos no válidos.');
   for(const [basis,q] of [['wet',[s.p90[i],s.p95[i],s.p99[i]]],...(s.allDays?[['all',[s.allDays.p90[i],s.allDays.p95[i],s.allDays.p99[i]]]]:[])]){if(q.every(v=>v===null))continue;if(!q.every(Number.isFinite)||q[0]<(basis==='wet'?1:0)||q[0]>q[1]||q[1]>q[2]||basis==='wet'&&s.wetDays[i]<100||s.validDays[i]<s.expectedDays*.8)throw Error('Umbrales o cobertura no válidos.');}
  }
 }
 return r;
}
function rainClimateClass(r){
 const value=r.value,month=Number((r.periodStart||rainActiveEntry?.periodStart||'').slice(5,7)),ref=rainClimateReference;
 if(!ref)return {code:5,label:'Referencia histórica pendiente',month};const a=ref.lat,b=ref.lon,iy=Math.round((r.coords[0]-a[0])/.1),ix=Math.round((r.coords[1]-b[0])/.1),s=ref.months[String(month)];
 if(!s||iy<0||iy>=a.length||ix<0||ix>=b.length||Math.abs(r.coords[0]-a[iy])>.05001||Math.abs(r.coords[1]-b[ix])>.05001)return {code:5,label:rainClimateLabels[5],month};
 const i=iy*b.length+ix,coverage=s.validDays[i]>=s.expectedDays*.8;const q=[s.allDays.p90[i],s.allDays.p95[i],s.allDays.p99[i]],basis='all';
 const has=coverage&&q.every(Number.isFinite);let code=coverage?6:5;if(!Number.isFinite(value))code=5;else if(value<.1)code=0;else if(has)code=value>q[2]?4:value>q[1]?3:value>q[0]?2:1;
 return {code,label:rainClimateLabels[code],month,p90:q[0],p95:q[1],p99:q[2],basis,basisLabel:basis==='all'?'Todos los días válidos del mes':'Días húmedos ≥1 mm',wetDays:s.wetDays[i],validDays:s.validDays[i],expectedDays:s.expectedDays,wetFrequency:s.validDays[i]>0?s.wetDays[i]/s.validDays[i]*100:null,cell:[a[iy],b[ix]],supported:has,coverage,extreme:has&&value>=.1&&value>q[2]};
}
function climateMode(){return $('rainClimateMode')?.value==='rarity';}
function setRainReference(raw){raw=validateRainReference(raw);rainClimateReference=raw;intensityReferenceRevision++;intensitySurfaceCache.clear();DATA.rainClimateReference=rainClimateReference;const payload=JSON.stringify(raw).replace(/</g,'\\u003c');$('rainClimateReference').textContent=payload;if(window.__TERRITORIO_TEMPLATE__)window.__TERRITORIO_TEMPLATE__=window.__TERRITORIO_TEMPLATE__.replace(/(<script\b[^>]*id="rainClimateReference"[^>]*>)[\s\S]*?(<\/script\s*>)/,(_,open,close)=>open+payload+close);$('rainReferenceStatus').textContent='PISCOp 1991–2025 · 12 meses'+(raw.months['11'].allDays?' · zonas secas incluidas.':' · recálculo de zonas secas pendiente.');$('saveRainReference').disabled=false;}
const candidatesBeforeRainClimate=mapSymbolCandidates;
mapSymbolCandidates=function(data,visible,snapshot){const out=candidatesBeforeRainClimate(data,visible,snapshot);if(climateMode())for(const x of out)if(x.type==='rain'){const c=rainClimateClass(x.record);x.rainClimate=c;x.kind='rain-climate-'+c.code;x.color=rainClimateColors[c.code];x.tip=title(x.record.name)+' · '+decimal(x.record.value)+' mm / 24 h\n'+c.label+(c.supported?'\nP99 '+decimal(c.p99)+' mm · '+c.basisLabel:'')+'\n'+(c.coverage?c.validDays+' días históricos válidos':'Sin cobertura suficiente');}return out;};
const detailBeforeRainClimate=renderDetail;
renderDetail=function(){detailBeforeRainClimate();if(selected?.type==='rain'){const r=DATA.rain.find(x=>x.id===selected.id);if(!r)return;const c=rainClimateClass(r);let h='<section class="rain-climate-detail"><h3>Intensidad frente al histórico local</h3><span class="river-classification" style="border-color:'+rainClimateColors[c.code]+'">'+esc(c.label)+'</span>';
 if(rainClimateReference){h+='<p class="diary-note">PISCOp 1991–2025 · mes '+c.month+' · celda de unos 10 km.</p>';
  if(c.validDays!==undefined)h+='<dl><dt>Cobertura histórica</dt><dd>'+c.validDays+' de '+c.expectedDays+' días válidos</dd><dt>Días con ≥1 mm</dt><dd>'+c.wetDays+' · '+decimal(c.wetFrequency)+' %</dd></dl>';
  if(c.supported)h+='<dl><dt>Referencia utilizada</dt><dd>'+esc(c.basisLabel)+'</dd><dt>P90 / P95 / P99 · mm / 24 h</dt><dd>'+[c.p90,c.p95,c.p99].map(v=>decimal(v)).join(' / ')+'</dd></dl>'+(c.basis==='all'?'<p class="diary-note">P99 de todos los días: incluye días secos. Se destacan excesos con lluvia ≥0,1 mm; no equivale al P99 de días húmedos.</p>':'');
  else if(c.coverage)h+='<p class="diary-note">'+(c.wetDays===0?'Histórico seco: ningún día alcanzó 1 mm.':'Muestra húmeda escasa: '+c.wetDays+' días con ≥1 mm.')+' Hay datos históricos; el JSON actual no contiene sus percentiles de todos los días. Regenere la referencia con el procesador actualizado.</p>';
  else h+='<p class="diary-note">Cobertura histórica inferior al 80 % o fuera de la grilla.</p>';
  h+='<p class="diary-note">Comparación orientativa de una estación con una celda histórica. No es una alerta oficial.</p>';
 }else h+='<p class="diary-note">Cargue la referencia PISCOp para activar la comparación.</p>';$('detail').innerHTML+=h+'</section>';}};
const listBeforeRainClimate=renderList;
renderList=function(){listBeforeRainClimate();if(tab==='rain'&&climateMode())$('resultsList').querySelectorAll('button[data-id]').forEach(b=>{const r=filtered.rain.find(x=>String(x.id)===b.dataset.id);if(!r)return;const c=rainClimateClass(r),line=document.createElement('span');line.className='rain-climate-list';line.textContent=c.label;line.style.color=rainClimateColors[c.code];b.appendChild(line);});};
function extremeRainPoints(){return (filtered?.rain||[]).filter(r=>r.coords&&Number.isFinite(r.value)).map(r=>({r,c:rainClimateClass(r)})).filter(x=>x.c.extreme);}
const rainSurfaceBeforeExtreme=rainSurface;
rainSurface=function(view){rainSurfaceBeforeExtreme(view);drawExtremeRain(view);};
const intensitySurfaceCache=new Map();let intensityReferenceRevision=0;
const intensityStops=[[0,[187,211,218]],[1,[111,172,158]],[2,[216,189,118]],[3,[204,125,105]],[4,[139,57,91]]];
function rainIntensityScore(value,c){
 if(!c.supported||!Number.isFinite(value)||value<.1)return null;
 const q=[c.p90,c.p95,c.p99];
 if(value<=q[0])return q[0]>0?value/q[0]:0;
 if(value<=q[1])return 1+(value-q[0])/Math.max(1e-9,q[1]-q[0]);
 if(value<=q[2])return 2+(value-q[1])/Math.max(1e-9,q[2]-q[1]);
 return Math.min(4,3+(value-q[2])/Math.max(q[2],1));
}
function intensityRGB(score){const k=Math.min(3,Math.max(0,Math.floor(score))),f=Math.min(1,Math.max(0,score-k)),a=intensityStops[k][1],b=intensityStops[k+1][1];return a.map((v,i)=>Math.round(v+(b[i]-v)*f));}
// Sample values without spreading rainfall into dry or missing grid cells.
function rainGridValue(grid,lat,lon){
 const [dx,,west,,dy,north]=grid.transform,col=(lon-west)/dx-.5,row=(lat-north)/dy-.5;
 const cx=Math.floor(col+.5),cy=Math.floor(row+.5);
 if(cx<0||cy<0||cx>=grid.width||cy>=grid.height)return null;
 const center=grid.values[cy*grid.width+cx];if(!Number.isFinite(center)||center<.1)return null;
 const x0=Math.floor(col),y0=Math.floor(row),fx=col-x0,fy=row-y0;let sum=0,weight=0;
 for(let y=0;y<2;y++)for(let x=0;x<2;x++){const ix=x0+x,iy=y0+y;if(ix<0||iy<0||ix>=grid.width||iy>=grid.height)continue;const v=grid.values[iy*grid.width+ix],w=(x?fx:1-fx)*(y?fy:1-fy);if(Number.isFinite(v)&&v>=.1){sum+=v*w;weight+=w;}}
 return weight?sum/weight:center;
}
function buildIntensitySurface(){
 if(!rainActiveEntry?.gridGzip)return null;
 const key=intensityReferenceRevision+'|'+rainActiveDate+'|'+rainActiveEntry.gridGzip.length;
 if(intensitySurfaceCache.has(key))return intensitySurfaceCache.get(key);
 const grid=JSON.parse(pako.ungzip(Uint8Array.from(atob(rainActiveEntry.gridGzip),c=>c.charCodeAt(0)),{to:'string'}));
 const [dx,,west,,dy,north]=grid.transform,east=west+grid.width*dx,south=north+grid.height*dy;
 const merc=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360)),inv=y=>(2*Math.atan(Math.exp(y))-Math.PI/2)*180/Math.PI,top=merc(north),bottom=merc(south);
 const width=Math.min(1800,Math.max(grid.width,Math.ceil((east-west)/.025))),height=Math.min(1800,Math.max(grid.height,Math.ceil((north-south)/.025)));
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');if(!ctx)return null;
 const image=ctx.createImageData(width,height);let supported=0;
 for(let y=0;y<height;y++){const lat=inv(top-(y+.5)/height*(top-bottom));for(let x=0;x<width;x++){const lon=west+(x+.5)/width*(east-west),value=rainGridValue(grid,lat,lon);if(value===null)continue;
 const c=rainClimateClass({coords:[lat,lon],value,periodStart:rainActiveEntry.periodStart}),score=rainIntensityScore(value,c);if(score===null)continue;
 const i=(y*width+x)*4,rgb=intensityRGB(score);image.data[i]=rgb[0];image.data[i+1]=rgb[1];image.data[i+2]=rgb[2];image.data[i+3]=220;supported++;}}
 ctx.putImageData(image,0,0);
 const result={url:canvas.toDataURL('image/png'),bounds:[[south,west],[north,east]],coordinates:[[west,north],[east,north],[east,south],[west,south]],supportedPixels:supported,key};
 intensitySurfaceCache.set(key,result);while(intensitySurfaceCache.size>2)intensitySurfaceCache.delete(intensitySurfaceCache.keys().next().value);return result;
}
function drawExtremeRain(view){
 const show=climateMode()&&$('layer_rain')?.checked&&$('rainExtremeHeat')?.checked&&!!rainActiveEntry,opacity=Number($('rainOpacity')?.value||60)/100,surface=show?buildIntensitySurface():null;
 if(view.kind==='raster'){
  if(view.intensityEngine!==view.engine){view.intensityEngine=view.engine;view.intensityOverlay=null;view.engine.createPane('rainIntensityPane');view.engine.getPane('rainIntensityPane').style.zIndex=355;view.engine.getPane('rainIntensityPane').style.pointerEvents='none';}
  if(!surface){view.intensityOverlay?.setOpacity(0);return;}
  if(!view.intensityOverlay){view.intensityOverlay=L.imageOverlay(surface.url,surface.bounds,{pane:'rainIntensityPane',opacity,interactive:false,className:'rain-intensity-image'}).addTo(view.engine);view.intensityKey=surface.key;}
  else{if(view.intensityKey!==surface.key){view.intensityOverlay.setUrl(surface.url);view.intensityOverlay.setBounds(surface.bounds);view.intensityKey=surface.key;}view.intensityOverlay.setOpacity(opacity);}
 }else{
  const m=view.engine;if(!view.styleReady)return;
  if(surface){if(!m.getSource('rain-intensity'))m.addSource('rain-intensity',{type:'image',url:surface.url,coordinates:surface.coordinates});else if(view.intensityKey!==surface.key)m.getSource('rain-intensity').updateImage({url:surface.url,coordinates:surface.coordinates});view.intensityKey=surface.key;
   if(!m.getLayer('rain-intensity'))m.addLayer({id:'rain-intensity',type:'raster',source:'rain-intensity',paint:{'raster-opacity':opacity,'raster-resampling':'nearest','raster-fade-duration':0}},m.getLayer('territorio-lines')?'territorio-lines':undefined);
  }
  if(m.getLayer('rain-intensity')){m.setPaintProperty('rain-intensity','raster-opacity',opacity);m.setLayoutProperty('rain-intensity','visibility',surface?'visible':'none');}
 }
}

const renderBeforeRainClimate=render;
render=function(){renderBeforeRainClimate();const mode=climateMode(),show=$('layer_rain').checked;$('rainKey').hidden=mode||!show;$('rainRarityKey').hidden=!mode||!show;$('rainOpacity').disabled=false;$('rainReferenceStatus').textContent=rainClimateReference?'PISCOp 1991–2025 · 12 meses'+(rainClimateReference.months['11'].allDays?' · zonas secas incluidas.':' · recálculo de zonas secas pendiente.'):'Referencia histórica pendiente de cargar.';$('rainRarityPeriod').textContent=rainActiveEntry?rainPeriod(rainActiveEntry)+(rainActiveEntry.gridGzip?'':' · sin grilla diaria para comparar'):'Sin observación para la fecha';$('rainRarityBasis').textContent=rainClimateReference?'PISCOp 1991–2025 · mismo mes · grilla diaria SENAMHI':'Sin referencia cargada';const classes=filtered.rain.map(rainClimateClass);$('rainRarityCounts').textContent=mode?classes.filter(c=>c.coverage).length+' con histórico · '+classes.filter(c=>c.supported).length+' con P99 · '+classes.length+' estaciones':'';
 $('rainExtremeKey').hidden=true;$('rainExtremePeriod').textContent=rainActiveEntry?rainPeriod(rainActiveEntry)+' · hora Perú':'Sin observación para la fecha';$('rainExtremeCount').textContent=extremeRainPoints().length+' estaciones >P99 · '+classes.filter(c=>c.supported).length+' evaluables';
};
const controlsBeforeRainClimate=setupControls;
setupControls=function(){controlsBeforeRainClimate();try{const stored=JSON.parse($('rainClimateReference').textContent||'null');if(stored)setRainReference(stored);}catch(e){$('rainReferenceStatus').textContent=e.message;}
 $('rainClimateMode').value=rainClimateReference?'rarity':'observed';if(rainClimateReference)$('rainStations').checked=true;$('rainExtremeHeat').checked=true;$('rainExtremeHeat').onchange=()=>render();
 $('rainClimateMode').onchange=()=>{if(climateMode())$('rainStations').checked=true;render();};$('rainReferenceFile').onchange=async()=>{const file=$('rainReferenceFile').files?.[0];if(!file)return;try{if(file.size>35000000)throw Error('El archivo de referencia debe ser menor de 35 MB.');setRainReference(JSON.parse(await file.text()));$('rainClimateMode').value='rarity';$('rainStations').checked=true;render();}catch(e){$('rainReferenceStatus').textContent=e.message;}};
 $('saveRainReference').onclick=async()=>{if(!rainClimateReference)return;const button=$('saveRainReference');button.disabled=true;try{await prepareRainGridArchive();saveDiaryFile(window.__TERRITORIO_TEMPLATE__,'Monitoreo_FEN_26-27_con_referencia_PISCO.html','text/html;charset=utf-8');}catch(e){$('rainReferenceStatus').textContent=e.message;}finally{button.disabled=false;}};
 const resetBefore=$('reset').onclick;$('reset').onclick=()=>{$('rainClimateMode').value=rainClimateReference?'rarity':'observed';$('rainExtremeHeat').checked=true;resetBefore();if(rainClimateReference){$('rainStations').checked=true;render();}};
 $('rainRarityLegend').innerHTML=['Hasta P90','Lluviosa · P90–P95','Muy lluviosa · P95–P99','Extremadamente lluviosa · >P99'].map((label,i)=>'<span><i style="background:'+['#6fac9e','#d8bd76','#cc7d69','#8b395b'][i]+'"></i>'+label+'</span>').join('');
};

let expandedPanelHome=null;
function setExpandedInfo(open){const area=document.querySelector('.map-area');area.classList.toggle('expanded-info-open',open);$('expandedInfoHost').hidden=!open;$('mapInfoToggle').setAttribute('aria-expanded',String(open));}
function moveExpandedPanel(expanded){
 const panel=document.querySelector('.right-panel');
 if(expanded){if(!expandedPanelHome){expandedPanelHome={parent:panel.parentNode,next:panel.nextSibling};$('expandedInfoHost').appendChild(panel);}setExpandedInfo(Boolean(selected));}
 else{setExpandedInfo(false);if(expandedPanelHome){const {parent,next}=expandedPanelHome;parent.insertBefore(panel,next?.parentNode===parent?next:null);expandedPanelHome=null;}}
}
const selectBeforeExpandedInfo=selectRecord;
selectRecord=function(type,id,zoom){selectBeforeExpandedInfo(type,id,zoom);if($('expandMap').getAttribute('aria-expanded')==='true'){setExpandedInfo(true);document.querySelector('.right-panel').scrollTop=0;}};
const clearBeforeExpandedInfo=clearSelection;
clearSelection=function(redraw=true){clearBeforeExpandedInfo(redraw);if($('expandMap').getAttribute('aria-expanded')==='true')setExpandedInfo(false);};

function setMapExpanded(expanded){
 const area=document.querySelector('.map-area');area.classList.toggle('is-expanded',expanded);document.body.classList.toggle('map-expanded',expanded);const button=$('expandMap');button.setAttribute('aria-expanded',String(expanded));button.setAttribute('aria-label',expanded?'Reducir mapa':'Ampliar mapa');button.title=expanded?'Reducir mapa · Esc':'Ampliar mapa';button.innerHTML=(expanded?'⊡':'⛶')+' <span>'+(expanded?'Reducir mapa':'Ampliar mapa')+'</span>';moveExpandedPanel(expanded);map.invalidateSize();requestAnimationFrame(()=>{map.invalidateSize();});
}
const controlsBeforeMapExpand=setupControls;
setupControls=function(){controlsBeforeMapExpand();$('mapInfoToggle').onclick=()=>setExpandedInfo($('mapInfoToggle').getAttribute('aria-expanded')!=='true');$('closeExpandedInfo').onclick=()=>setExpandedInfo(false);$('expandMap').onclick=()=>setMapExpanded($('expandMap').getAttribute('aria-expanded')!=='true');window.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('expandMap').getAttribute('aria-expanded')==='true'){setMapExpanded(false);$('expandMap').focus();}});};

const anaDetailBeforeFreshness=anaDetail;
anaDetail=function(r){const html=anaDetailBeforeFreshness(r);return html+(r.currentSourceDate&&r.currentSourceDate!==DATA.meta.anaDate?'<p class="detail-note">Atributos conservados de '+fullDate(r.currentSourceDate)+'. Sin coincidencia única en el reporte general de la consulta más reciente.</p>':'');};
const renderBeforeSourceFreshness=render;
render=function(){
 renderBeforeSourceFreshness();
 const day=$('dateEnd').value,cut=DATA.meta.coenDate;
 if($('coenMode').value==='day'&&day>cut){$('countEvents').textContent='—';$('eventSubtitle').textContent='Sin actualización · último corte '+fullDate(cut);$('layerEventsCount').textContent='—';$('layerEventsNote').textContent='Sin actualización para '+fullDate(day);if(tab==='events'&&!filtered.events.length)$('resultsList').innerHTML='<p class="empty">Sin actualización COEN para esta fecha. Último corte: '+fullDate(cut)+'.</p>';}
 $('histogram').querySelectorAll('button[data-day]').forEach(button=>{if(button.dataset.day>cut){button.title=fullDate(button.dataset.day)+': sin actualización COEN';button.setAttribute('aria-label',button.title);button.style.opacity='.25';}});
};

async function init(){try{if(typeof window.TerritoryMap==='undefined')throw Error('No se pudo cargar el motor cartográfico.');await prepareWebData();await createPortableSiteTemplate();DATA=applySiteUpdates(readEmbeddedData());renderSourceStatus(DATA);setupMap();setupControls();render();fit();$('loading').remove();window.addEventListener('resize',()=>map.invalidateSize());window.territorio={get filtered(){return filtered},get selected(){return selected},get data(){return DATA},map,selectRecord,render};}catch(error){$('loading').innerHTML=`<h2>No se pudo abrir el visor</h2><p class="error-message">${esc(error.message)}</p><button onclick="location.reload()">Volver a intentar</button>`;}}
window.addEventListener('DOMContentLoaded',()=>{window.__TERRITORIO_TEMPLATE__='<!doctype html>\n'+document.documentElement.outerHTML;init();},{once:true});

