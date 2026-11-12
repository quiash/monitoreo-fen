import copy, importlib.util, json, unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('refresh',Path(__file__).resolve().parents[1]/'tools/refresh_data.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

HTML="""<h3><a href="https://portal.indeci.gob.pe/emergencias/header/">REPORTE PRELIMINAR 12/11/2026</a></h3>
<article><h3><a href="https://portal.indeci.gob.pe/emergencias/test/">REPORTE COMPLEMENTARIO N.º 1 – 12/11/2026 LLUVIAS</a></h3><a class="btn-download" href="https://portal.indeci.gob.pe/wp-content/uploads/test.pdf">DESCARGAR</a></article>"""

class IndeciTests(unittest.TestCase):
    def test_article_scoping_and_publication_date(self):
        rows=m.parse_indeci_reports(HTML,'2026-11-12')
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['publishedDate'],'2026-11-12')
        self.assertNotIn('coords',rows[0]);self.assertNotIn('occurred',rows[0])

    def test_untrusted_pdf_and_future_publication_rejected(self):
        for html in [HTML.replace('https://portal.indeci.gob.pe/wp-content/uploads/test.pdf','https://example.org/test.pdf'),HTML.replace('12/11/2026','13/11/2026')]:
            with self.assertRaises(ValueError):m.parse_indeci_reports(html,'2026-11-12')

    def test_portal_success_does_not_advance_map_cut_or_duplicate_events(self):
        data={'meta':{'coenDate':'2026-11-09'},'events':[{'id':'existing','metrics':[1]}]}
        old=copy.deepcopy(data)
        with patch.object(m,'update_coen_api',side_effect=OSError('DNS')),patch.object(m,'fetch',side_effect=lambda url,**kw: b'%PDF-invalid' if url.endswith('.pdf') else HTML.encode()):
            result=m.update_coen(data,'2026-11-12')
        self.assertTrue(result['partial']);self.assertEqual(result['apiState'],'error')
        self.assertEqual(result['portalState'],'ok');self.assertEqual(data['events'],old['events'])
        self.assertEqual(data['meta']['coenDate'],'2026-11-09')
        self.assertEqual(len(data['coenDocuments']['reports']),1)
        self.assertIn('downloadError',data['coenDocuments']['reports'][0])

    def test_both_fail_preserves_history(self):
        data={'meta':{'coenDate':'2026-11-09'},'events':[]};old=copy.deepcopy(data)
        with patch.object(m,'fetch',side_effect=OSError('offline')):
            with self.assertRaises(ValueError):m.update_coen(data,'2026-11-12')
        self.assertEqual(data,old)

if __name__=='__main__':unittest.main()
