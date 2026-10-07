"""Utilidades geoespaciales compartidas por los pasos del pipeline."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import numpy as np
from pyproj import Transformer
from rasterio.transform import from_origin

from . import config as C

# GDAL/curl detrás del proxy de salida: respeta HTTPS_PROXY y el CA del entorno.
_ca = "/root/.ccr/ca-bundle.crt"
if os.path.exists(_ca):
    os.environ.setdefault("CURL_CA_BUNDLE", _ca)
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "4")
os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "2")

TO_LOCAL = Transformer.from_crs("EPSG:4326", C.LOCAL_CRS, always_xy=True)
TO_GEO = Transformer.from_crs(C.LOCAL_CRS, "EPSG:4326", always_xy=True)
UTM43_TO_LOCAL = Transformer.from_crs("EPSG:32643", C.LOCAL_CRS, always_xy=True)
LOCAL_TO_UTM43 = Transformer.from_crs(C.LOCAL_CRS, "EPSG:32643", always_xy=True)


def grid_transform(grid: C.Grid):
    """Transformación afín cuyo centro de píxel (i, j) cae en el vértice (x_j, y_i)."""
    s = grid.spacing
    return from_origin(-grid.half - s / 2, grid.half + s / 2, s, s)


def raster_transform(half: float, spacing: float):
    """Igual que grid_transform pero para rásteres de imagen (píxel = celda)."""
    return from_origin(-half, half, spacing, spacing)


def lonlat_to_local(lon, lat):
    return TO_LOCAL.transform(lon, lat)


def local_to_lonlat(x, y):
    return TO_GEO.transform(x, y)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def bilinear(grid_values: np.ndarray, grid: C.Grid, x, y):
    """Muestreo bilineal de una rejilla de vértices en coordenadas locales."""
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    fx = (x + grid.half) / grid.spacing
    fy = (grid.half - y) / grid.spacing
    n = grid.n
    fx = np.clip(fx, 0, n - 1 - 1e-9)
    fy = np.clip(fy, 0, n - 1 - 1e-9)
    j0 = np.floor(fx).astype(int)
    i0 = np.floor(fy).astype(int)
    tx = fx - j0
    ty = fy - i0
    v00 = grid_values[i0, j0]
    v01 = grid_values[i0, j0 + 1]
    v10 = grid_values[i0 + 1, j0]
    v11 = grid_values[i0 + 1, j0 + 1]
    return (v00 * (1 - tx) + v01 * tx) * (1 - ty) + (v10 * (1 - tx) + v11 * tx) * ty


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def read_json(path: Path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)
