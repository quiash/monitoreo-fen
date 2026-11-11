"""Refresh public FEN sources without replacing validated history on source failure."""
from __future__ import annotations
import argparse, base64, concurrent.futures, copy, datetime as dt, gzip, hashlib, json, math, os, re, time, unicodedata
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
LIMA = ZoneInfo('America/Lima')
ANA = 'https://snirh.ana.gob.pe/apiIntervencion/api/Reporte/datos/'
COEN = 'https://coen.indeci.gob.pe/api/v2/mer/emergencies/geojson-last-emergencies?daysAgo=30'
RAIN_PAGE = 'https://www.senamhi.gob.pe/mapas/mapa-monitoreo-meteo/monitoreo-precipitacion.php'
WFS = 'https://idesep.senamhi.gob.pe/geoserver/monitoreo_meteorologico/ows'
WCS = 'https://idesep.senamhi.gob.pe/geoserver/monitoreo_meteorologico/wcs'
HYDRO = 'https://www.senamhi.gob.pe/mapas/mapa-monitoreohidro/include/mnt-grafica-new.php'


def dumps(obj): return json.dumps(obj, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
def pack(obj): return base64.b64encode(gzip.compress(dumps(obj).encode(), mtime=0)).decode()
def unpack(value): return json.loads(gzip.decompress(base64.b64decode(value)))
def number(value):
    if isinstance(value, bool) or value is None or value == '': return None
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (ValueError, TypeError): return None

def norm(value):
    return re.sub('[^A-Z0-9]', '', unicodedata.normalize('NFKD', str(value or '')).encode('ascii', 'ignore').decode().upper())
def code(value):
    # Catalog fichas include a descriptive prefix absent from the report API.
    value = norm(value)
    match = re.search(r'\d{4}20\d{2}ANA.*', value)
    return match[0] if match else value

def fetch(url, form=None, timeout=45, retries=3):
    data = urlencode(form).encode() if form is not None else None
    headers = {'User-Agent': 'MonitoreoFEN/1.0 (+https://github.com/quiash/monitoreo-fen)', 'Accept': '*/*'}
    for attempt in range(retries):
        try:
            with urlopen(Request(url, data=data, headers=headers), timeout=timeout) as response:
                content = response.read(60_000_001)
            if len(content) > 60_000_000: raise ValueError('Respuesta demasiado grande')
            return content
        except Exception:
            if attempt == retries-1: raise
            time.sleep(2 ** attempt)

def get_json(url): return json.loads(fetch(url))
def report_rows(raw):
    if raw.get('success') is not True: raise ValueError('ANA no confirmó éxito')
    table = raw['data'][0]
    rows = table['filas']
    if not rows or len(rows) != table['totalFilas']: raise ValueError('Reporte ANA incompleto')
    return rows

def merge_patch(target, patch):
    if not isinstance(patch, dict): return copy.deepcopy(patch)
    result = copy.deepcopy(target) if isinstance(target, dict) else {}
    for key, value in patch.items(): result[key] = merge_patch(result.get(key), value)
    return result

def difference(old, new):
    if isinstance(old, dict) and isinstance(new, dict):
        # Updaters preserve historical keys. Deletion is deliberately unsupported.
        return {key: difference(old.get(key), value) for key, value in new.items() if key not in old or value != old[key]}
    return new

def hydrate(base, patch):
    data = merge_patch(base, patch)
    original = {point['id']: point for point in base['ana']}
    for point in data['ana']:
        old = original.get(point['id'])
        if old:
            point['history'] = {**old.get('history', {}), base['meta']['anaDate']: old['current'], base['meta']['anaPreviousDate']: old['previous'], **point.get('history', {})}
    return data

def load_base(root=ROOT):
    manifest = json.loads((root/'data/manifest.json').read_text())
    payload = ''.join((root/name).read_text() for name in manifest['parts'])
    if hashlib.sha256(payload.encode()).hexdigest() != manifest['payloadSha256']: raise ValueError('Checksum de base incorrecto')
    return unpack(payload)

def load_live(root=ROOT):
    path = root/'data/live.json'
    if not path.exists(): return {}
    obj = json.loads(path.read_text())
    if obj.get('schema') != 'fen-live/v1': raise ValueError('Formato de actualización incorrecto')
    return unpack(obj['data'])

def update_coen(data, today):
    raw = json.loads(fetch(COEN, timeout=20, retries=2))
    if raw.get('type') != 'FeatureCollection' or not raw.get('features'): raise ValueError('COEN vacío o sin GeoJSON válido')
    existing = {str(row['id']): row for row in data['events']}
    changed = 0
    for feature in raw['features']:
        p = feature['properties']; ident = str(p['id'])
        occurred = p.get('Fecha de ocurrencia') or p.get('Fecha de registro')
        if not occurred or not re.match(r'^20\d\d-\d\d-\d\dT', occurred): raise ValueError('Fecha COEN no reconocida')
        url = p.get('document') or ''
        old = existing.get(ident)
        coords = (feature.get('geometry') or {}).get('coordinates')
        coords = [coords[1], coords[0]] if coords and len(coords) >= 2 and -90 <= coords[1] <= 90 and -180 <= coords[0] <= 180 else None
        record = dict(old) if old else {'id': ident, 'state': 'propuesta_revisar', 'type': 'reporte_emergencia', 'report': '', 'sinpad': '', 'note': '', 'metrics': [], 'exposure': [], 'duplicateCandidate': False}
        if old and old.get('url') != url:
            record.update(state='propuesta_revisar', metrics=[], exposure=[], report='', sinpad='', note='Documento actualizado; pendiente de revisión.')
        record.update(department=p.get('Departamento') or '', province=p.get('Provincia') or '', district=p.get('Distrito') or '', hazard=p.get('Tipo de peligro') or '', originalDate=occurred, coords=coords, url=url, apiUpdated=p.get('Fecha de actualización') or '', lastSeenCut=today)
        if not old or old.get('dateSource') != 'PDF' or old.get('url') != url:
            record.update(date=occurred[:10], dateSource='API', occurred=occurred)
        if old != record:
            revisions = data.setdefault('eventRevisions', {}).setdefault(ident, [])
            if old and (not revisions or revisions[-1].get('record') != old): revisions.append({'cut': old.get('lastSeenCut', data['meta']['coenDate']), 'record': old})
            if revisions and revisions[-1].get('cut') == today: revisions[-1] = {'cut': today, 'record': record}
            else: revisions.append({'cut': today, 'record': record})
            changed += 1
        existing[ident] = record
    data['events'] = list(existing.values())
    data['coenSnapshots'][today] = raw
    data['meta']['coenDate'] = today
    data['meta']['coenCuts'] = sorted(data['coenSnapshots'])
    data['meta']['missingCoordinates'] = sum(not row.get('coords') for row in data['events'])
    return {'cut': today, 'records': len(raw['features']), 'changed': changed, 'latestObservation': max(row['properties'].get('Fecha de ocurrencia', '') for row in raw['features'])[:10], 'url': COEN}


def update_ana(data, today):
    daily_raw = get_json(ANA+'avancediario'); daily = report_rows(daily_raw)
    general_raw = get_json(ANA+'general'); general = report_rows(general_raw)
    grouped = {}; current = {}
    for index, row in enumerate(daily):
        if not row.get('CODIGO_INTERVENCION') or not row.get('FECHA_INTERVENCION'): raise ValueError('Diario ANA sin campos requeridos')
        grouped.setdefault(code(row['CODIGO_INTERVENCION']), []).append((index, row))
    for row in general: current.setdefault(code(row['CODIGO_INTERVENCION']), []).append(row)
    catalog = {}
    for point in data['ana']: catalog.setdefault(code(point['current']['CODIGO']), []).append(point)
    matched = current_legal = previous_only = updated = 0; excluded = []; matched_dates = []
    fields = {'META':'META_KM','AVANCEKM':'TOTAL_AVANCE_KM','AVANCEKMPOR':'TOTAL_PCT_AVANCE_KM','VOLUMEN_M3':'META_M3','AVANCEDESCOLMA':'TOTAL_AVANCE_M3','AVANCEDESCOLMAPOR':'TOTAL_PCT_AVANCE_M3','POB':'HABITANTES','VIVIENDAS':'VIVIENDA','CULTIVO':'AREA_CULTIVO'}
    for point in data['ana']:
        point.setdefault('history', {}).setdefault(data['meta']['anaDate'], copy.deepcopy(point['current']))
        point['history'].setdefault(data['meta']['anaPreviousDate'], copy.deepcopy(point['previous']))
        previous_cut = max((cut for cut in point['history'] if cut < today), default=data['meta']['anaDate'])
        point['previous'] = point['history'][previous_cut]
        point.setdefault('currentSourceDate', data['meta']['anaDate'])
        point['history'][today] = point['current']
        key = code(point['current']['CODIGO'])
        if len(catalog[key]) != 1: continue
        legal = norm(point['current'].get('DECRETO'))
        candidates = [r for r in current.get(key, []) if norm(r.get('DECRETO_URGENCIA')) == legal]
        if len(candidates) == 1:
            r = candidates[0]; before = copy.deepcopy(point['current']); after = copy.deepcopy(before)
            for target, source in fields.items():
                if r.get(source) is not None: after[target] = number(r[source])
            after['ESTADO'] = r.get('ESTADO_INTERVENCION') or before.get('ESTADO')
            dates = [row['FECHA_INTERVENCION'][:10] for _, row in grouped.get(key, []) if norm(row.get('DECRETO_URGENCIA')) == legal and row['FECHA_INTERVENCION'][:10] <= today]
            if dates: after['FEC_AVANCE'] = dt.date.fromisoformat(max(dates)).strftime('%d/%m/%Y')
            point.setdefault('history', {}).setdefault(data['meta']['anaDate'], before)
            previous_cut = max((cut for cut in point['history'] if cut < today), default=data['meta']['anaDate'])
            point['previous'] = point['history'][previous_cut]
            point['current'] = after; point['currentSourceDate'] = today; point['history'][today] = after; updated += 1
        rows = grouped.get(key, [])
        if not rows: continue
        groups = {}; matched += 1
        for index, row in rows:
            date = row['FECHA_INTERVENCION'][:10]
            if date > today:
                excluded.append({'pointId': point['id'], 'rowIndex': index, 'date': date}); continue
            matched_dates.append(date)
            group_key = str(row['PERIODO'])+'|'+norm(row['DECRETO_URGENCIA'])
            group = groups.setdefault(group_key, {'key':group_key,'period':row['PERIODO'],'legal':row['DECRETO_URGENCIA'],'matchesCurrentLegal':norm(row['DECRETO_URGENCIA']) == legal,'rows':[]})
            group['rows'].append({'date':date, **{out:number(row.get(src)) for out,src in {'km':'AVANCE_KM','m3':'AVANCE_M3','eliminatedM3':'AVANCE_ELI_M3','metaKm':'META_KM','metaM3':'META_M3','pctKm':'PCT_AVANCE_KM','pctM3':'PCT_AVANCE_M3'}.items()},'sourceRow':index})
        for group in groups.values():
            group['rows'].sort(key=lambda r:r['date'])
            if len({r['date'] for r in group['rows']}) != len(group['rows']): raise ValueError('Diario duplicado en ficha, norma y periodo; requiere revisión')
        # Preserve periods no longer returned by the API, without mixing their totals.
        for old_group in point.get('diary', []):
            if old_group['key'] not in groups: groups[old_group['key']] = old_group
            else:
                dates = {r['date'] for r in groups[old_group['key']]['rows']}
                groups[old_group['key']]['rows'] += [r for r in old_group['rows'] if r['date'] not in dates]
                groups[old_group['key']]['rows'].sort(key=lambda r:r['date'])
        point['diary'] = list(groups.values())
        matching = [g for g in groups.values() if g['matchesCurrentLegal']]
        point['diaryCurrentKey'] = max(matching, key=lambda g:(g['rows'][-1]['date'] if g['rows'] else '',number(g['period']) or -1))['key'] if matching else None
        current_legal += bool(matching); previous_only += not bool(matching)
    if matched < 250 or updated < 250: raise ValueError(f'Vinculación ANA insuficiente: {matched} diarios, {updated} estados')
    diary = data['anaDiary']
    diary.update(sourceFilename='API_ANA_avancediario_'+today+'.json',sourceDate=today,queryTimestamp=daily_raw.get('timestamp'),sourceRowCount=len(daily),matchedPoints=matched,currentLegalPoints=current_legal,unmatchedPoints=len(data['ana'])-matched,previousOnlyPoints=previous_only,futureExcluded=excluded,originalGzip=pack(daily_raw))
    diary.setdefault('snapshots', {})[today] = {'filename':diary['sourceFilename'],'timestamp':daily_raw.get('timestamp'),'originalGzip':diary['originalGzip']}
    data['meta'].update(anaPreviousDate=max((cut for cut in data['meta']['anaCuts'] if cut < today), default=data['meta']['anaDate']),anaDate=today,anaCuts=sorted(set(data['meta']['anaCuts']+[today]),reverse=True))
    return {'cut':today,'records':len(daily),'matched':matched,'updatedStates':updated,'partial':updated<len(data['ana']),'latestObservation':max(matched_dates),'url':ANA+'avancediario'}


def rain_dates(page):
    dates = {int(rank):date for rank,date in re.findall(r'data-corrltv="(\d+)"[^>]*>\s*(\d{4}-\d{2}-\d{2})', page)}
    if 1 not in dates: raise ValueError('SENAMHI no publicó fecha de lluvia')
    return dates

def rain_surface(raw, palette):
    import numpy as np
    import rasterio
    from rasterio.io import MemoryFile
    from rasterio.enums import Resampling
    from rasterio.features import shapes
    from rasterio.warp import transform_geom
    from shapely.geometry import shape, mapping
    with MemoryFile(raw) as file:
        with file.open() as src:
            if src.count != 1 or not src.crs: raise ValueError('Raster de lluvia no reconocido')
            height = min(700, src.height); width = round(src.width*height/src.height)
            values = src.read(1,out_shape=(height,width),resampling=Resampling.bilinear,masked=True)
            valid = ~np.ma.getmaskarray(values) & np.isfinite(values.data) & (values.data >= 0)
            bins = np.searchsorted([float(p['quantity']) for p in palette], values.data,side='left').clip(0,len(palette)-1).astype('int16')
            affine = src.transform * src.transform.scale(src.width/width, src.height/height)
            features = []
            for geom, index in shapes(bins,mask=valid,transform=affine):
                i=int(index); p=palette[i]
                geom=transform_geom(src.crs,'EPSG:4326',geom,precision=5)
                geom=mapping(shape(geom).simplify(.0008,preserve_topology=True))
                features.append({'type':'Feature','geometry':geom,'properties':{'mmMin':float(palette[i-1]['quantity']) if i else 0,'mmMax':float(p['quantity']),'color':p['color'],'label':p['label']}})
            if not features: raise ValueError('Superficie de lluvia vacía')
            return {'type':'FeatureCollection','features':features}, [src.width,src.height]


def update_rain(data, today):
    published = rain_dates(fetch(RAIN_PAGE, timeout=15, retries=2).decode())
    days = []
    for rank, observation in sorted(published.items()):
        end = (dt.date.fromisoformat(observation)+dt.timedelta(days=1)).isoformat()
        # Reprocess the latest available day and backfill days missing from history.
        if rank == 1 or end not in data['rainHistory']: days.append((rank,observation,end))
    if len(days) > 7: days=days[:7] # bounded recovery after prolonged outage
    latest = None
    for rank,observation,end in reversed(days):
        if end > today: raise ValueError('Periodo de lluvia futuro')
        params={'service':'WFS','version':'1.0.0','request':'GetFeature','typeName':f'monitoreo_meteorologico:prec_{rank}_all_points','maxFeatures':100000,'outputFormat':'application/json'}
        source_wfs=WFS+'?'+urlencode(params); raw=get_json(source_wfs)
        if raw.get('type')!='FeatureCollection' or len(raw.get('features',[]))<100: raise ValueError('Estaciones de lluvia incompletas')
        if raw.get('numberReturned',len(raw['features'])) != len(raw['features']): raise ValueError('WFS truncado')
        stations=[]
        for feature in raw['features']:
            p=feature['properties']; value=number(p.get('prec')); coords=feature['geometry']['coordinates']
            if value is None or value < 0: continue
            stations.append({'id':str(p['gid']),'name':p.get('estacion') or 'Sin nombre','department':p.get('departamen') or '', 'province':p.get('provincia') or '', 'district':p.get('distrito') or '', 'coords':[coords[1],coords[0]],'value':value,'subtitle':f'{value:g} mm / 24 h','url':RAIN_PAGE,'periodStart':observation+'T07:00:00-05:00','periodEnd':end+'T07:00:00-05:00','details':[['Precipitación acumulada',f'{value:g} mm / 24 h'],['Inicio de observación',observation+' · 07:00 h'],['Fin de observación',end+' · 07:00 h'],['Zona horaria','Perú · UTC−5'],['Fecha asignada por SENAMHI',observation]]})
        source_wcs=WCS+'?'+urlencode({'service':'WCS','version':'2.0.1','request':'GetCoverage','coverageId':f'monitoreo_meteorologico__prec_{rank}','format':'image/tiff'})
        raster=fetch(source_wcs)
        # Re-read the publication date to reject a source rollover during extraction.
        if rain_dates(fetch(RAIN_PAGE).decode()).get(rank)!=observation: raise ValueError('Cambio de fecha SENAMHI durante la descarga; se reintentará')
        geo,grid=rain_surface(raster,data['rainSurface']['palette'])
        entry={'endDate':end,'observationDate':observation,'periodStart':observation+'T07:00:00-05:00','periodEnd':end+'T07:00:00-05:00','geojsonGzip':pack(geo),'encoding':'gzip-base64','stations':stations,'polygonCount':len(geo['features']),'sourceGridSize':grid,'sourceAccessDate':today,'sourceWCS':source_wcs,'sourceWFS':source_wfs,'maximumMm':max(s['value'] for s in stations)}
        data['rainHistory'][end]=entry
        if rank==1: latest=entry
    if latest is None: raise ValueError('Sin capa de lluvia más reciente')
    data['rain']=latest['stations'];data['meta']['rainLatestEndDate']=latest['endDate'];data['meta']['rainAvailableEndDates']=sorted(data['rainHistory'])
    data['rainSurface'].update(periodStart=latest['periodStart'],periodEnd=latest['periodEnd'],sourceAccessDate=today,observationDate=latest['observationDate'])
    return {'cut':latest['endDate'],'records':len(latest['stations']),'url':RAIN_PAGE,'latestObservation':latest['endDate'],'periodStart':latest['periodStart'],'periodEnd':latest['periodEnd']}


def parse_hydro(html):
    match=re.search(r'var\s+data\s*=\s*',html)
    if not match: raise ValueError('Sin serie diaria publicada')
    obj,_=json.JSONDecoder().raw_decode(html[match.end():])
    if not obj.get('fechaHora') or len(obj.get('datoActual',[]))!=len(obj['fechaHora']): raise ValueError('Serie SENAMHI incompleta')
    return obj

def update_hydro(data, today):
    # Check the official host once before opening 160 station requests.
    fetch('https://www.senamhi.gob.pe/mapas/mapa-monitoreohidro/js/mnt-grafica-new.js', timeout=10, retries=1)
    tasks=[]
    for ident, station in data['hydroHistory']['byStation'].items():
        for kind in ['caudal','level']:
            if kind in station: tasks.append((ident,kind))
    def request(task):
        ident,kind=task
        form={'id':ident,'fecha_hora':today+' 23:59:00','rbtVariable':'CAUDAL' if kind=='caudal' else 'NIVEL','variable_opcion':'C' if kind=='caudal' else 'N','btnTipo':'D'}
        try:
            raw=parse_hydro(fetch(HYDRO,form,timeout=18,retries=1).decode())
            if str(raw['codEstacion'])!=ident or raw['variable']!=form['rbtVariable']: raise ValueError('Estación o variable distinta')
            unit=raw['unidad']; expected=data['hydroHistory']['byStation'][ident][kind]['unit']
            if norm(unit)!=norm(expected): raise ValueError('Cambio de unidad: requiere revisión')
            days={}
            for i,millis in enumerate(raw['fechaHora']):
                day=dt.datetime.fromtimestamp(millis/1000,dt.timezone.utc).date().isoformat()
                # Daily timestamps encode the published calendar date in UTC, not an hourly observation.
                if day>today or day<data['meta']['defaultStartDate']:continue
                sample=lambda value:number(value[1] if isinstance(value,list) and len(value)==2 else value)
                value=sample(raw['datoActual'][i])
                if value is None:continue
                days[day]={'value':value,'thresholds':{color:sample(raw.get(color,[None]*len(raw['fechaHora']))[i]) for color in ['amarillo','naranja','rojo']}}
            if not days: raise ValueError('Sin valores diarios válidos')
            return ident,kind,days,None
        except Exception as exc: return ident,kind,{},str(exc)
    errors=[];count=0;latest=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for ident,kind,days,error in pool.map(request,tasks):
            if error: errors.append({'id':ident,'variable':kind,'error':error});continue
            data['hydroHistory']['byStation'][ident][kind]['days'].update(days)
            count+=1;latest.append(max(days))
            if count % 25 == 0: print('hydro: series procesadas',count,'/',len(tasks),flush=True)
    if not count:raise ValueError('Ninguna estación devolvió una serie válida')
    data['hydroHistory']['sourceDate']=max(latest);data['hydroHistory']['errors']=errors
    return {'cut':max(latest),'records':count,'requested':len(tasks),'failedStations':len(errors),'latestObservation':max(latest),'url':HYDRO,'partial':bool(errors)}


def atomic_json(path, obj):
    temp=path.with_suffix(path.suffix+'.tmp');temp.write_text(dumps(obj)+'\n');temp.replace(path)

def persist_data(base, data, status, root):
    for name,cut in [('barriers',data['meta']['barrierDate']),('additional','2026-11-05')]:
        status['sources'].setdefault(name,{'state':'manual','cut':cut,'note':'Catálogo conservado; sin consulta automática de avance habilitada.'})
    cuts=[data['meta']['coenDate'],data['meta']['anaDate'],data['meta']['rainLatestEndDate'],data['hydroHistory']['sourceDate']]
    data['meta']['mapEndDate']=max(cuts);data['meta']['updatedAt']=max(cuts)
    data['meta']['note']='Actualización automática por fuente. Se conserva la última versión válida ante errores.'
    status['checkedAt']=dt.datetime.now(LIMA).isoformat(timespec='seconds')
    atomic_json(root/'data/live.json',{'schema':'fen-live/v1','encoding':'gzip-base64','data':pack(difference(base,data))})
    atomic_json(root/'data/status.json',status)

def refresh(root=ROOT, only=None):
    base=load_base(root);data=hydrate(base,load_live(root))
    today=dt.datetime.now(LIMA).date().isoformat();now=dt.datetime.now(LIMA).isoformat(timespec='seconds')
    status_path=root/'data/status.json'
    status=json.loads(status_path.read_text()) if status_path.exists() else {'schema':'fen-status/v1','sources':{}}
    jobs={'coen':update_coen,'ana':update_ana,'rain':update_rain,'hydro':update_hydro}
    for name,fn in jobs.items():
        if only and name not in only:continue
        previous=status['sources'].get(name,{})
        status['sources'][name]={**previous,'state':'error','lastAttempt':now,'error':'La última consulta aún no se completó.'}
        persist_data(base,data,status,root)
        candidate=copy.deepcopy(data)
        try:
            result=fn(candidate,today)
            status['sources'][name]={**previous,**result,'state':'partial' if result.get('partial') else 'ok','lastAttempt':now,'lastSuccess':now,'error':None}
            data=candidate;print(name,'OK',dumps(result),flush=True)
        except Exception as exc:
            status['sources'][name]={**previous,'state':'error','lastAttempt':now,'error':str(exc)}
            print(name,'ERROR',str(exc),flush=True)
        persist_data(base,data,status,root)
    summary=['## Actualización FEN', '', '| Fuente | Estado | Corte |', '|---|---|---|']
    summary += [f"| {name} | {value['state']} | {value.get('cut','Sin actualización')} |" for name,value in status['sources'].items()]
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as f:f.write('\n'.join(summary)+'\n')
    return status

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--only',nargs='+',choices=['coen','ana','rain','hydro']);args=parser.parse_args()
    refresh(only=args.only)
