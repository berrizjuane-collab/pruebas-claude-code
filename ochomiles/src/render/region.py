"""Carga de los datos de una region y muestreo continuo de alturas entre niveles."""
import json
import os

import numpy as np
import rasterio
from scipy.ndimage import map_coordinates, spline_filter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TER = os.path.join(ROOT, "data", "work", "terrain")


class Grid:
    """Raster regular en la TM local: origen arriba-izquierda, filas hacia el sur."""

    def __init__(self, arr, transform):
        self.a = arr
        self.x0 = transform.c
        self.y0 = transform.f
        self.cell = transform.a
        self.h, self.w = arr.shape[:2]

    @property
    def extent(self):
        return (self.x0, self.y0 - self.h * self.cell, self.x0 + self.w * self.cell, self.y0)

    def rc(self, x, y):
        return (self.y0 - y) / self.cell - 0.5, (x - self.x0) / self.cell - 0.5

    def sample(self, x, y, order=3):
        r, c = self.rc(np.asarray(x, np.float64), np.asarray(y, np.float64))
        if order == 3:
            if getattr(self, "_coef", None) is None:
                self._coef = spline_filter(self.a.astype(np.float64), order=3, mode="nearest")
            src = self._coef
        else:
            src = self.a
        return map_coordinates(src, [r.ravel(), c.ravel()], order=order, mode="nearest",
                               prefilter=False).reshape(np.shape(x))

    def inside_weight(self, x, y, margin):
        x0, y0, x1, y1 = self.extent
        d = np.minimum.reduce([x - x0, x1 - x, y - y0, y1 - y])
        return np.clip(d / margin, 0, 1)


def sharpen(z, cell):
    """Realce de microrrelieve (mascara de enfoque multiescala, ~60 y ~180 m).

    El DEM de 30 m (remuestreado desde datos de 12 m) redondea aristas y canales; este realce
    devuelve nitidez a las formas menores sin cambiar la forma del macizo (la componente
    de escala > 500 m queda intacta)."""
    import cv2
    z = z.astype(np.float32)
    s1 = max(60.0 / cell, 0.6)
    s2 = max(180.0 / cell, 1.2)
    b1 = cv2.GaussianBlur(z, (0, 0), s1)
    b2 = cv2.GaussianBlur(z, (0, 0), s2)
    return z + 0.55 * (z - b1) + 0.35 * (b1 - b2)


SHARPEN_VERSION = "s1"


class RegionData:
    def __init__(self, region):
        self.name = region
        self.info = json.load(open(os.path.join(TER, f"{region}.json")))
        self.crs = self.info["crs"]
        self.levels = {}
        for name in ("L0", "L1", "L2"):
            with rasterio.open(os.path.join(TER, f"{region}_{name}.tif")) as ds:
                z = ds.read(1)
                if name in ("L0", "L1"):
                    z = sharpen(z, ds.transform.a)
                    # el realce eleva los maximos locales: se reajustan las cimas a su cota
                    import sys
                    sys.path.insert(0, os.path.join(ROOT, "src", "geo"))
                    from terrain_prep import restore_summits
                    allp = json.load(open(os.path.join(ROOT, "config", "peaks.json")))["peaks"]
                    self.summit_log = []
                    restore_summits(z, ds.transform, self.crs, allp, self.summit_log)
                self.levels[name] = Grid(z, ds.transform)
        self.svf = {}
        for name in ("L0", "L1"):
            with rasterio.open(os.path.join(TER, f"{region}_{name}_svf.tif")) as ds:
                self.svf[name] = Grid(ds.read(1), ds.transform)
        with rasterio.open(os.path.join(TER, f"{region}_albedo.tif")) as ds:
            self.albedo = Grid(np.transpose(ds.read(), (1, 2, 0)), ds.transform)
        self.albedo_model = json.load(open(os.path.join(TER, f"{region}_albedo.json")))

    def height(self, x, y):
        """Altura continua: L0 dentro de su caja, fundido a L1 y luego a L2 en los bordes."""
        x = np.asarray(x, np.float64)
        y = np.asarray(y, np.float64)
        L0, L1, L2 = self.levels["L0"], self.levels["L1"], self.levels["L2"]
        z = L2.sample(x, y)
        w1 = L1.inside_weight(x, y, 8000.0)
        if np.any(w1 > 0):
            z = np.where(w1 > 0, z * (1 - w1) + L1.sample(x, y) * w1, z)
        w0 = L0.inside_weight(x, y, 3000.0)
        if np.any(w0 > 0):
            m = w0 > 0
            z0 = np.zeros_like(z)
            z0[m] = L0.sample(x[m], y[m])
            z = np.where(m, z * (1 - w0) + z0 * w0, z)
        return z.astype(np.float32)

    def to_local(self, lat, lon):
        from pyproj import Transformer
        t = Transformer.from_crs("EPSG:4326", self.crs, always_xy=True)
        return t.transform(lon, lat)

    def peak_xyz(self, peak):
        x, y = self.to_local(peak["dem_lat"], peak["dem_lon"])
        z = float(self.height(np.array([x]), np.array([y]))[0])
        return np.array([x, y, max(z, float(peak["altitude_m"]) - 5.0)])
