"""Build ENU height grids (near: fine, far: coarse) from Copernicus GLO-30 tiles."""
import os, sys, numpy as np, rasterio
from scipy import ndimage
sys.path.insert(0, os.path.dirname(__file__))
from geo import LAT0, LON0, MLAT, MLON, ll_to_en, en_to_ll

DEM_DIR = '/home/user/k2data/dem'
OUT = '/home/user/k2data/work'


def mosaic():
    rows = []
    for lat in (36, 35, 34):
        row = []
        for lon in (75, 76, 77):
            p = f'{DEM_DIR}/Copernicus_DSM_COG_10_N{lat}_00_E{lon:03d}_00_DEM.tif'
            with rasterio.open(p) as ds:
                row.append(ds.read(1).astype(np.float32))
        rows.append(np.concatenate(row, axis=1))
    m = np.concatenate(rows, axis=0)
    # pixel centres: top-left centre lat=37 - 0.5/3600, lon = 75 + 0.5/3600 (tiles are pixel-is-area w/ half-pixel offset)
    lat_top = 37.0
    lon_left = 75.0
    return m, lat_top, lon_left


def sample(m, lat_top, lon_left, lat, lon, order=3):
    r = (lat_top - lat) * 3600.0
    c = (lon - lon_left) * 3600.0
    return ndimage.map_coordinates(m, [r.ravel(), c.ravel()], order=order, mode='nearest').reshape(r.shape)


def build(name, x0, x1, y0, y1, res, m, lt, ll, order=3):
    xs = np.arange(x0, x1 + 1e-6, res)
    ys = np.arange(y0, y1 + 1e-6, res)
    X, Y = np.meshgrid(xs, ys)
    lat, lon = en_to_ll(X, Y)
    H = sample(m, lt, ll, lat, lon, order=order).astype(np.float32)
    np.savez_compressed(f'{OUT}/{name}.npz', H=H, x0=x0, y0=y0, res=res)
    print(name, H.shape, H.min(), H.max())
    return H


if __name__ == '__main__':
    m, lt, ll = mosaic()
    print('mosaic', m.shape)
    # far grid: +-130 km, 100 m
    build('far', -130000, 130000, -130000, 120000, 100.0, m, lt, ll, order=1)
    # near grid: K2 massif and Godwin-Austen glacier, 10 m (bicubic)
    build('near', -14000, 14000, -18000, 10000, 10.0, m, lt, ll, order=3)
