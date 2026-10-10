"""Mosaicos de elevacion a partir de AWS Terrain Tiles (formato Terrarium, Web Mercator).

Fuentes de los datos (Mapzen/Tilezen joerd): SRTM, GMTED2010, ETOPO1 y otros;
atribucion: https://github.com/tilezen/joerd/blob/master/docs/attribution.md
Se usan solo para el relieve lejano (horizontes) y el mapa regional/continental.
"""
import io
import math
import os
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from net import get  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(ROOT, "data", "raw", "terrarium")
URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
R_MERC = 6378137.0


def lonlat_to_tile(lon, lat, z):
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n
    return x, y


def tile(z, x, y):
    path = os.path.join(CACHE, str(z), str(x), f"{y}.png")
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        data = get(URL.format(z=z, x=x, y=y))
        with open(path + ".part", "wb") as f:
            f.write(data)
        os.replace(path + ".part", path)
    im = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    return im[..., 0] * 256.0 + im[..., 1] + im[..., 2] / 256.0 - 32768.0


def mosaic(lon0, lat0, lon1, lat1, z):
    """Devuelve (elevacion float32, transform affine en EPSG:3857)."""
    x0, y1 = lonlat_to_tile(lon0, lat0, z)
    x1, y0 = lonlat_to_tile(lon1, lat1, z)
    tx0, tx1 = int(math.floor(x0)), int(math.floor(x1))
    ty0, ty1 = int(math.floor(y0)), int(math.floor(y1))
    jobs = [(z, x, y) for y in range(ty0, ty1 + 1) for x in range(tx0, tx1 + 1)]
    with ThreadPoolExecutor(12) as ex:
        tiles = list(ex.map(lambda j: tile(*j), jobs))
    nx, ny = tx1 - tx0 + 1, ty1 - ty0 + 1
    out = np.zeros((ny * 256, nx * 256), np.float32)
    for (zz, x, y), t in zip(jobs, tiles):
        out[(y - ty0) * 256:(y - ty0 + 1) * 256, (x - tx0) * 256:(x - tx0 + 1) * 256] = t
    size = 2 * math.pi * R_MERC / (2 ** z)  # metros mercator por tesela
    from rasterio.transform import Affine
    left = -math.pi * R_MERC + tx0 * size
    top = math.pi * R_MERC - ty0 * size
    tr = Affine(size / 256, 0, left, 0, -size / 256, top)
    return out, tr
