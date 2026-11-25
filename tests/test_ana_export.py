import datetime as dt
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import export_ana


class AnaExportTests(unittest.TestCase):
    def test_report_supersedes_older_catalog_without_losing_ficha_fields(self):
        today = dt.date(2026, 11, 25)
        ficha = dict.fromkeys(export_ana.FIELDS)
        ficha.update(IDE_INTERVENCION=3382, IDPC=18068, CODIGO='VILCAS-01',
                     DECRETO='DS 164', nombdep='Cajamarca', SECTOR='Vilcas',
                     META=.605, AVANCEKM=.01, VOLUMEN_M3=9464.45, AVANCEDESCOLMA=1,
                     ESTADO='En Ejecución', FEC_AVANCE='24/11/2026',
                     COSTO_DE_LA_ACTIVIDAD=444846.42)
        catalog = {'features': [{'attributes': ficha}]}
        report = {'id': '3382', 'code': 'VILCAS01', 'legal': 'DS164', 'period': '1',
                  'date': '2026-11-25', 'state': 'En Ejecucion',
                  'totals': {'META': .605, 'AVANCEKM': .12, 'VOLUMEN_M3': 9464.45,
                             'AVANCEDESCOLMA': 150}}
        with patch.object(export_ana, 'catalog_rows'):
            mismatch = export_ana.reconcile(catalog, None, [{**report, 'legal': 'DS165'}], set(), today)
            updated = export_ana.reconcile(catalog, None, [report], set(), today)
            still_updated = export_ana.reconcile(updated, catalog, [], set(), today)
            same_day = export_ana.reconcile(
                still_updated, None, [{**report, 'totals': {**report['totals'], 'AVANCEKM': .14}}],
                set(), today,
            )
        self.assertEqual(mismatch, catalog)
        self.assertEqual(still_updated, updated)
        row = same_day['features'][0]['attributes']
        self.assertEqual(row['AVANCEKM'], .14)
        self.assertEqual(row['FEC_AVANCE'], '25/11/2026')
        self.assertEqual(row['COSTO_DE_LA_ACTIVIDAD'], ficha['COSTO_DE_LA_ACTIVIDAD'])
        self.assertEqual(row['nombdep'], 'Cajamarca')  # Territorial correction is applied at export.
