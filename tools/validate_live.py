"""Check merged live data, historical preservation and published source dates."""
from refresh_data import ROOT, load_base, load_live, hydrate
import json
base=load_base(); data=hydrate(base,load_live())
assert len(data['ana'])==536
assert len({r['id'] for r in data['ana']})==536
assert len(data['additional'])==94 and len(data['barriers'])==12
assert {r['id'] for r in base['events']} <= {r['id'] for r in data['events']}
assert set(base['rainHistory']) <= set(data['rainHistory'])
assert data['meta']['mapEndDate'] >= data['meta']['coenDate']
for point in data['ana']:
    assert point['paths'], point['id']
    assert set(data['meta']['anaCuts']) <= set(point['history']) | {data['meta']['anaDate'], data['meta']['anaPreviousDate']}, point['id']
    for group in point.get('diary',[]):
        assert len({r['date'] for r in group['rows']})==len(group['rows']), (point['id'],group['key'])
for day, entry in data['rainHistory'].items():
    if entry.get('gridFile'):
        path=ROOT/entry['gridFile']
        assert path.is_file(), f'Grilla diaria ausente: {day}'
        grid=json.loads(path.read_text())
        assert grid['encoding']=='gzip-base64' and grid['data'], day
status=json.loads((ROOT/'data/status.json').read_text())
assert status['schema']=='fen-status/v1'
for source in status['sources'].values():
    assert source['state'] in ['ok','partial','error','manual']
print('OK: actualización íntegra; historial y catálogos conservados. Periodo hasta', data['meta']['mapEndDate'])
