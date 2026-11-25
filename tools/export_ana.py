"""Publish the latest validated ANA catalog as two workbooks and a department map."""
import argparse
from copy import copy
from collections import Counter, defaultdict
from datetime import date, datetime
import hashlib
import json
import math
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

from refresh_data import ANA_CATALOG, LIMA, ROOT, dumps, fetch, load_base, load_live, norm, unpack
from urllib.parse import urlencode

OUTPUT = ROOT / 'data' / 'ana-export'
MANIFEST = OUTPUT / 'latest.json'
GEOMETRY = ROOT / 'tools' / 'ana-departamentos.geojson'
FIELDS = (
    'IDE_INTERVENCION', 'IDPC', 'SECTOR', 'nombdep', 'nombprov', 'nombdistri', 'DECRETO',
    'ESTADO', 'META', 'AVANCEKM', 'VOLUMEN_M3', 'AVANCEDESCOLMA', 'COSTO_DE_LA_ACTIVIDAD',
    'FEC_AVANCE',
)
CATEGORIES = ('En Ejecución con avance', 'Por Ejecutar', 'En Ejecución sin avance', 'Ejecutado')
COLORS = ('DAE9F8', 'FCE8D7', 'FFF2CE', 'E0EEDC')
MOVEMENT = {'H': 'AVANCEKM', 'I': 'META', 'K': 'COSTO_DE_LA_ACTIVIDAD',
            'L': 'VOLUMEN_M3', 'M': 'AVANCEDESCOLMA'}
SOURCE = 'ANA–SNIRH'
BLUE = '18365C'
MAP_COLORS = {
    'TUMBES': '#5D8AA8', 'PIURA': '#83B282', 'LAMBAYEQUE': '#A98AB0',
    'LALIBERTAD': '#91CBC8', 'ANCASH': '#DF9A7C', 'LIMA': '#5B88AD',
    'CALLAO': '#5B88AD', 'ICA': '#A2CB8E', 'AREQUIPA': '#A4ABD1',
}


def catalog_rows(raw, inventory, today):
    features = raw.get('features')
    if raw.get('error') or raw.get('exceededTransferLimit') or not isinstance(features, list) or len(features) != 536:
        raise ValueError('La consulta ANA debe contener los 536 puntos sin truncar.')
    rows = []
    dates = []
    observed = set()
    departments = {}
    territories = {'PROVINCIACONSTITUCIONALDELCALLAO': 'CALLAO'}
    for feature in features:
        original = feature['attributes']
        row = {key: original[key] for key in FIELDS}
        identity = (str(row['IDE_INTERVENCION']), str(row['IDPC']))
        if identity not in inventory or identity in observed:
            raise ValueError(f'Intervención fuera del inventario o duplicada: {identity}')
        observed.add(identity)
        territory = tuple(row[key] for key in ('nombdep', 'nombprov', 'nombdistri'))
        if not all(norm(part) for part in territory):
            raise ValueError(f'Ubicación incompleta para {identity}')
        if identity[1] == '18068':
            if identity[0] != '3382' or norm(row['SECTOR']) != 'VILCAS':
                raise ValueError('La intervención esperada de Vilcas no coincide.')
            location = tuple(map(norm, territory))
            corrected = ('La Libertad', 'Sánchez Carrión', 'Sanagorán')
            if location not in (('CAJAMARCA', 'CAJABAMBA', 'CAJABAMBA'), tuple(map(norm, corrected))):
                raise ValueError('Vilcas tiene una ubicación territorial distinta. Revisar la ficha.')
            row.update(zip(('nombdep', 'nombprov', 'nombdistri'), corrected))

        dep = norm(row['nombdep'])
        dep = territories.get(dep, dep)
        row['nombdep'] = departments.setdefault(dep, 'Callao' if dep == 'CALLAO' else row['nombdep'])
        for key in MOVEMENT.values():
            value = row[key]
            if key == 'COSTO_DE_LA_ACTIVIDAD' and value in (None, ''):
                row[key] = None
                continue
            n = float(value)
            if not math.isfinite(n) or n < 0:
                raise ValueError(f'{key} inválido para {identity}')
            row[key] = n
        if row['FEC_AVANCE']:
            day = datetime.strptime(row['FEC_AVANCE'], '%d/%m/%Y').date()
            if day > today:
                raise ValueError(f'Fecha futura de avance para {identity}')
            dates.append(day)
        state = norm(row['ESTADO'])
        if state not in ('EJECUTADO', 'POREJECUTAR', 'ENEJECUCION'):
            raise ValueError(f'Estado desconocido para {identity}')
        if row['META'] > 0 and row['AVANCEKM'] >= row['META']:
            row['category'] = CATEGORIES[3]
        elif state == 'POREJECUTAR':
            row['category'] = CATEGORIES[1]
        elif row['AVANCEKM'] > 0:
            row['category'] = CATEGORIES[0]
        else:
            row['category'] = CATEGORIES[2]
        rows.append(row)
    return sorted(rows, key=lambda row: tuple(norm(row[key]) for key in (
        'nombdep', 'nombprov', 'nombdistri', 'SECTOR', 'IDPC',
    ))), max(dates)


def workbook(title):
    from openpyxl import Workbook
    book = Workbook()
    sheet = book.active
    sheet.title = title
    sheet.sheet_view.showGridLines = False
    return book, sheet


def style_row(sheet, row, count, *, bg='FFFFFF', fg=BLUE, bold=False, height=18):
    from openpyxl.styles import Alignment, Font, PatternFill

    for col in range(1, count + 1):
        cell = sheet.cell(row, col)
        cell.font = Font(name='Arial', size=11, color=fg, bold=bold)
        cell.fill = PatternFill('solid', fgColor=bg)
        cell.alignment = Alignment(vertical='center')
    sheet.row_dimensions[row].height = height


def header(sheet, row, last_col, value, **style):
    sheet.merge_cells(start_row=row, start_column=1, end_row=row, end_column=last_col)
    sheet.cell(row, 1, value)
    style_row(sheet, row, last_col, **style)


def safe_text(cell, value):
    cell.value = value
    if isinstance(value, str):
        cell.data_type = 's'


def group_rows(rows, key):
    groups = defaultdict(list)
    for row in rows:
        groups[row[key]].append(row)
    return groups


def details(rows, cut, path):
    from openpyxl.styles import PatternFill
    from openpyxl.utils import get_column_letter

    book, sheet = workbook('Tabla Detallada')
    header(sheet, 1, 14, 'ANA | PUNTOS CRÍTICOS', bg=BLUE, fg='FFFFFF', bold=True, height=27)
    header(sheet, 3, 14, f'Fuente: {SOURCE} · Último avance el {cut:%d/%m/%Y}')
    counts = Counter(row['category'] for row in rows)
    header(sheet, 4, 14, f'536 PUNTOS · {counts[CATEGORIES[1]]} POR EJECUTAR · '
           f'{counts[CATEGORIES[2]]} SIN AVANCE EN KM · {counts[CATEGORIES[0]]} CON AVANCE EN KM · '
           f'{counts[CATEGORIES[3]]} EJECUTADOS', bg='E8EFF6', bold=True)
    sheet.append([])
    sheet.append(['Departamento', 'Provincia', 'Distrito', 'IDPC', 'Sector / subtotal', 'Estado',
                  'Avance físico calc. (%)', 'Avance (km)', 'Meta (km)', 'Dispositivo legal',
                  'Costo actividad (S/)', 'Meta descolmatación (m³)', 'Avance descolmatación (m³)',
                  'Avance desc. calc. (%)'])
    style_row(sheet, 6, 14, bg=BLUE, fg='FFFFFF', bold=True, height=32)
    for cell in sheet[6]:
        alignment = copy(cell.alignment)
        alignment.wrap_text = True
        cell.alignment = alignment
    for col, width in enumerate((21, 27, 26, 12, 45, 31, 16, 15, 15, 24, 19, 18, 18, 15), 1):
        sheet.column_dimensions[get_column_letter(col)].width = width
    sheet.freeze_panes = 'A7'
    sheet.sheet_properties.outlinePr.summaryBelow = False
    sheet.sheet_view.showOutlineSymbols = True
    sheet.sheet_format.outlineLevelRow = 3

    def ratios(n):
        sheet[f'G{n}'] = f'=IF(I{n}>0,H{n}/I{n},"—")'
        sheet[f'N{n}'] = f'=IF(L{n}>0,M{n}/L{n},"—")'
        for col in 'GN':
            sheet[f'{col}{n}'].number_format = '0.00%'
        for col in 'HIKLM':
            sheet[f'{col}{n}'].number_format = '#,##0.00##' if col in 'HI' else '#,##0.00'

    def section(items, depth, labels=()):
        n = sheet.max_row + 1
        level = ('DEPARTAMENTO', 'PROVINCIA', 'DISTRITO')[depth]
        for col, label in enumerate(labels, 1):
            safe_text(sheet.cell(n, col), label)
        sheet.cell(n, 5, f'SUBTOTAL {level} · {len(items)} puntos')
        counts = Counter(row['category'] for row in items)
        sheet.cell(n, 6, ' | '.join(f'{label}:{counts[cat]}' for label, cat in zip(
            'PSAE', (CATEGORIES[1], CATEGORIES[2], CATEGORIES[0], CATEGORIES[3]),
        )))
        style_row(sheet, n, 14, bg=('DCE8F4', 'E7EFF7', 'F0F4F8')[depth], bold=True)
        dimension = sheet.row_dimensions[n]
        dimension.outlineLevel = depth
        dimension.hidden = depth > 0
        dimension.collapsed = True
        children = []
        if depth < 2:
            for label, group in group_rows(items, ('nombprov', 'nombdistri')[depth]).items():
                children.append(section(group, depth + 1, (*labels, label)))
        else:
            for row in items:
                pos = sheet.max_row + 1
                children.append(pos)
                for col, value in {
                    1: row['nombdep'], 2: row['nombprov'], 3: row['nombdistri'],
                    4: int(row['IDPC']), 5: row['SECTOR'], 6: row['category'], 10: row['DECRETO'],
                }.items():
                    safe_text(sheet.cell(pos, col), value)
                for col, key in MOVEMENT.items():
                    sheet[f'{col}{pos}'] = row[key]
                style_row(sheet, pos, 14)
                sheet[f'F{pos}'].fill = PatternFill(
                    'solid', fgColor=COLORS[CATEGORIES.index(row['category'])],
                )
                sheet.row_dimensions[pos].outlineLevel = 3
                sheet.row_dimensions[pos].hidden = True
                ratios(pos)
        for col in MOVEMENT:
            refs = ','.join(f'{col}{child}' for child in children)
            sheet[f'{col}{n}'] = f'=SUM({refs})'
        ratios(n)
        return n

    for label, group in group_rows(rows, 'nombdep').items():
        section(group, 0, (label,))
    book.save(path)


def summary(rows, cut, path):
    from openpyxl.utils import get_column_letter

    book, sheet = workbook('Por departamento')
    header(sheet, 1, 17, 'ANA | PUNTOS CRÍTICOS POR DEPARTAMENTO',
           bg=BLUE, fg='FFFFFF', bold=True, height=26)
    header(sheet, 2, 17, f'Fuente: {SOURCE} · Último avance el {cut:%d/%m/%Y}')
    sheet.merge_cells('A3:A4')
    sheet['A3'] = 'DEPARTAMENTO'
    style_row(sheet, 3, 17, bg=BLUE, fg='FFFFFF', bold=True)
    style_row(sheet, 4, 17, bg='ECF2F7', bold=True)
    for idx, category in enumerate(CATEGORIES):
        start = 2 + idx * 4
        sheet.merge_cells(start_row=3, start_column=start, end_row=3, end_column=start + 3)
        sheet.cell(3, start, 'EJECUTADO (≥100 %)' if idx == 3 else category.upper())
        for offset, label in enumerate(('Número', 'Avance (km)', 'Meta (km)', '%')):
            sheet.cell(4, start + offset, label)
    sheet.freeze_panes = 'B5'
    sheet.column_dimensions['A'].width = 23
    for col in range(2, 18):
        sheet.column_dimensions[get_column_letter(col)].width = 13

    departments = group_rows(rows, 'nombdep')
    last = len(departments) + 5
    for n, (name, group) in enumerate([*departments.items(), ('TOTAL', rows)], 5):
        sheet.cell(n, 1, name)
        style_row(sheet, n, 17, bg=BLUE if n == last else 'FFFFFF',
                  fg='FFFFFF' if n == last else BLUE, bold=n == last)
        for idx, category in enumerate(CATEGORIES):
            col = 2 + idx * 4
            subset = [r for r in group if r['category'] == category]
            for offset, value in enumerate((len(subset), sum(r['AVANCEKM'] for r in subset),
                                           sum(r['META'] for r in subset))):
                letter = get_column_letter(col + offset)
                cell = sheet.cell(n, col + offset)
                cell.value = f'=SUM({letter}5:{letter}{n - 1})' if n == last else value
                cell.number_format = '#,##0' if offset == 0 else '#,##0.00##'
            advance = get_column_letter(col + 1)
            target = get_column_letter(col + 2)
            sheet.cell(n, col + 3, f'=IF({target}{n}>0,{advance}{n}/{target}{n},"—")').number_format = '0.00%'
    book.save(path)


def department_map(rows, cut, path):
    import matplotlib
    matplotlib.use('Agg')
    from matplotlib import font_manager, pyplot as plt
    from matplotlib.colors import to_hex
    from matplotlib.patches import PathPatch
    from matplotlib.path import Path as PlotPath
    from PIL import Image
    from shapely.geometry import shape
    from shapely.geometry.polygon import orient

    fonts = {font.name for font in font_manager.fontManager.ttflist}
    plt.rcParams['font.family'] = next(name for name in ('Arial', 'Liberation Sans', 'DejaVu Sans') if name in fonts)
    groups = group_rows(rows, 'nombdep')
    groups = {norm(name): group for name, group in groups.items()}
    geometry = json.loads(GEOMETRY.read_text(encoding='utf-8'))
    shapes = {norm(feature['properties']['NOMBDEP']): shape(feature['geometry'])
              for feature in geometry['features']}
    if len(shapes) != 25 or 'CALLAO' not in shapes or not groups.keys() <= shapes.keys():
        raise ValueError('Los límites departamentales no cubren el inventario ANA.')

    def values(group):
        advance = sum(row['AVANCEKM'] for row in group)
        target = sum(row['META'] for row in group)
        return advance, target, 100 * advance / target if target else None

    fig = plt.figure(figsize=(9.5, 11.5), facecolor='white')
    ax = fig.add_axes((.04, .17, .92, .73))
    for key, geom in shapes.items():
        pct = values(groups[key])[2] if key in groups else None
        color = '#D7D7D5'
        if pct is not None and pct > 0:
            color = MAP_COLORS.get(key, to_hex(plt.get_cmap('GnBu')(min(pct / 100, 1))))
        polygons = geom.geoms if geom.geom_type == 'MultiPolygon' else (geom,)
        for polygon in polygons:
            polygon = orient(polygon)
            rings = (polygon.exterior, *polygon.interiors)
            vertices, codes = [], []
            for ring in rings:
                coords = list(ring.coords)
                vertices.extend(coords)
                codes.extend([PlotPath.MOVETO] + [PlotPath.LINETO] * (len(coords) - 2) + [PlotPath.CLOSEPOLY])
            ax.add_patch(PathPatch(PlotPath(vertices, codes), facecolor=color, edgecolor='#787878',
                                   linewidth=.65, joinstyle='round'))
        if pct is None:
            continue
        largest = max(polygons, key=lambda polygon: polygon.area)
        point = largest.centroid
        if not largest.contains(point):
            point = largest.representative_point()
        offset = {'TUMBES': (-38, 30), 'CALLAO': (-88, -28)}.get(key, (0, 0))
        label = f'{pct:.1f}%'.replace('.', ',')
        if key == 'CALLAO':
            label = f'Callao: {label}'
        ax.annotate(label, (point.x, point.y), xytext=offset, textcoords='offset points',
                    ha='right' if offset[0] < 0 else 'center', va='center',
                    fontsize=14.5, fontweight='bold', color='#0F172A', zorder=4,
                    annotation_clip=False, arrowprops={'arrowstyle': '-', 'color': '#475569'} if any(offset) else None,
                    bbox={'boxstyle': 'round,pad=.24', 'facecolor': '#F5F5F4', 'edgecolor': '#94A3B8'})

    ax.autoscale_view()
    ax.margins(x=.08, y=.04)
    ax.set_aspect(1 / math.cos(math.radians(9)))
    ax.axis('off')
    fig.text(.5, .965, 'AVANCE FÍSICO EN INTERVENCIÓN DE PUNTOS CRÍTICOS POR DEPARTAMENTOS',
             ha='center', va='top', fontsize=15, fontweight='bold')
    fig.text(.5, .935, '(Porcentaje)', ha='center', va='top', fontsize=14)
    advance, target, pct = values(rows)
    national_pct = f'{pct:.2f}%'.replace('.', ',') if pct is not None else '—'
    for idx, (label, val) in enumerate((
        ('Número de puntos críticos', len(rows)),
        ('Extensión intervenida', f'{advance:.1f}'.replace('.', ',') + ' km'),
        ('Extensión meta', f'{target:.1f}'.replace('.', ',') + ' km'),
        ('Avance físico', national_pct),
    )):
        fig.text(.24, .135 - idx * .027, f'{label}: {val}', fontsize=13)
    fig.text(.05, .025, f'Fuente: ANA–SNIRH · Último avance registrado: {cut:%d/%m/%Y}.\n'
             'Límites departamentales referenciales: juaneladio/peru-geojson (MPL 2.0).',
             fontsize=8, color='#64748B')
    fig.savefig(path, dpi=600, facecolor='white')
    plt.close(fig)
    with Image.open(path) as image:
        palette = image.convert('RGB').quantize(colors=256)
    palette.save(path, dpi=(600, 600), optimize=True)


def read_catalog():
    params = {'where': '1=1', 'outFields': ','.join(FIELDS), 'returnGeometry': 'false', 'f': 'json'}
    return json.loads(fetch(ANA_CATALOG + '?' + urlencode(params), timeout=17, retries=2))


def latest_ana_status():
    status_path = ROOT / 'data' / 'status.json'
    status = json.loads(status_path.read_text())
    prior = subprocess.check_output(['git', 'show', 'HEAD:data/status.json'], cwd=ROOT, text=True)
    ana = status['sources'].get('ana', {})
    prior_ana = json.loads(prior)['sources'].get('ana', {})
    return ana if ana.get('lastAttempt') != prior_ana.get('lastAttempt') else None


def generate(raw, force=False):
    inventory = {(str(point['id']), str(point['current']['IDPC'])) for point in load_base()['ana']}
    rows, cut = catalog_rows(raw, inventory, datetime.now(LIMA).date())
    digest = hashlib.sha256(dumps(rows).encode()).hexdigest()
    previous = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    if previous.get('cut', '') > cut.isoformat():
        raise ValueError('La consulta ANA es anterior al corte publicado.')
    if not force and previous.get('digest') == digest:
        print(f'Exportaciones ANA sin cambios ({cut}).')
        return
    products = {
        'detalle': ('ANA_Puntos_criticos_detalle.xlsx', details),
        'departamento': ('ANA_Puntos_criticos_por_departamento.xlsx', summary),
        'mapa': ('ANA_Mapa_Avance_Fisico_Departamentos.png', department_map),
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix='fen-ana-', dir=OUTPUT.parent) as directory:
        tmp = Path(directory)
        for filename, create in products.values():
            create(rows, cut, tmp / filename)
        for filename, _ in products.values():
            (tmp / filename).replace(OUTPUT / filename)
        manifest = {'cut': cut.isoformat(), 'digest': digest, 'records': len(rows),
                    'files': {key: product[0] for key, product in products.items()}}
        (tmp / 'latest.json').write_text(dumps(manifest) + '\n', encoding='utf-8')
        (tmp / 'latest.json').replace(MANIFEST)
    print(f'Exportaciones ANA generadas: {cut}, {len(rows)} puntos.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--if-ana-updated', action='store_true')
    mode.add_argument('--catalog', type=Path, help='JSON oficial archivado para validar la generación')
    args = parser.parse_args()

    if args.if_ana_updated:
        ana = latest_ana_status()
        if ana is None:
            return
        try:
            if ana.get('catalog', {}).get('state') == 'ok':
                raw = unpack(load_live()['anaCatalog']['originalGzip'])
            else:
                raw = read_catalog()
            generate(raw)
        except (ValueError, TypeError, KeyError, OSError) as exc:
            if not MANIFEST.is_file():
                raise
            print(f'::warning::Exportación ANA conserva el último corte válido: {exc}')
    else:
        raw = json.loads(args.catalog.read_text()) if args.catalog else read_catalog()
        generate(raw, force=True)


if __name__ == '__main__':
    main()
