import importlib.util, unittest
from pathlib import Path
import numpy as np
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
spec=importlib.util.spec_from_file_location('refresh',Path(__file__).resolve().parents[1]/'tools/refresh_data.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class RainGridTests(unittest.TestCase):
    def test_preserves_trace_dry_and_missing_values(self):
        original=np.array([[0,.1,2.75],[-9999,-1,12.125]],dtype='float32')
        with MemoryFile() as file:
            with file.open(driver='GTiff',height=2,width=3,count=1,dtype='float32',crs='EPSG:4326',transform=from_origin(-77,-12,.1,.1),nodata=-9999) as dst:dst.write(original,1)
            grid=m.rain_grid(file.read())
        self.assertEqual(grid['values'],[0,.1,2.75,None,None,12.125])
        self.assertEqual(grid['width'],3)
        self.assertAlmostEqual(grid['transform'][0],.1)
        self.assertEqual(m.unpack(m.pack(grid)),grid)
