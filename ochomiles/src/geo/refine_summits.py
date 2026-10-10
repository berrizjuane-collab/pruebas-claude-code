"""Verifica y refina las coordenadas WGS84 de cada cumbre con el Copernicus DEM GLO-30.

Para cada montana busca el maximo local del DEM en un radio de busqueda alrededor de la
coordenada publicada y guarda ambas (publicada y DEM) en config/peaks.json, junto con la
distancia entre ellas y la cota del DEM. La cota rotulada en pantalla es siempre la de
referencia editorial; la del DEM solo sirve para colocar marcadores sobre el relieve.
"""
import json
import math
import os

import numpy as np
import rasterio
from rasterio.windows import from_bounds

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEM_DIR = os.path.join(ROOT, "data", "raw", "cop30")
SEARCH_KM = 0.5
# Penalizacion (m de cota por m de distancia) al elegir entre maximos locales: con cimas
# secundarias casi tan altas como la principal (Shishapangma, Broad Peak), el error del DEM
# puede invertir su orden; se favorece el maximo coherente con la coordenada publicada.
DIST_PENALTY = 0.2


VRT = os.path.join(ROOT, "data", "work", "cop30.vrt")  # mosaico continuo (gdalbuildvrt)


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def refine(lat, lon):
    dlat = SEARCH_KM / 111.32
    dlon = SEARCH_KM / (111.32 * math.cos(math.radians(lat)))
    with rasterio.open(VRT) as ds:
        win = from_bounds(lon - dlon, lat - dlat, lon + dlon, lat + dlat, ds.transform)
        win = win.round_offsets().round_lengths()
        z = ds.read(1, window=win).astype(np.float64)
        tr = ds.window_transform(win)
    from scipy.ndimage import maximum_filter
    mf = maximum_filter(z, size=5)
    ys, xs = np.where(z == mf)
    best, best_score = None, -1e9
    for y, x in zip(ys, xs):
        lo, la = tr * (x + 0.5, y + 0.5)
        d = haversine_m(lat, lon, la, lo)
        if d > SEARCH_KM * 1000:
            continue
        score = z[y, x] - DIST_PENALTY * d
        if score > best_score:
            best, best_score = (y, x), score
    iy, ix = best
    # refinamiento sub-pixel con un paraboloide 3x3
    def sub(a, b, c):
        d = a - 2 * b + c
        return 0.0 if d == 0 else 0.5 * (a - c) / d
    ox = sub(z[iy, ix - 1], z[iy, ix], z[iy, ix + 1]) if 0 < ix < z.shape[1] - 1 else 0.0
    oy = sub(z[iy - 1, ix], z[iy, ix], z[iy + 1, ix]) if 0 < iy < z.shape[0] - 1 else 0.0
    x, y = tr * (ix + 0.5 + ox, iy + 0.5 + oy)
    return y, x, float(z[iy, ix])


if __name__ == "__main__":
    cfg_path = os.path.join(ROOT, "config", "peaks.json")
    with open(cfg_path) as f:
        cfg = json.load(f)
    print(f"{'montaña':16s} {'ref':>8s} {'DEM':>8s} {'Δh':>6s} {'Δpos m':>7s}  lat/lon DEM")
    for p in cfg["peaks"]:
        lat, lon, h = refine(p["approx_lat"], p["approx_lon"])
        d = haversine_m(p["approx_lat"], p["approx_lon"], lat, lon)
        p["dem_lat"] = round(lat, 5)
        p["dem_lon"] = round(lon, 5)
        p["dem_elev_m"] = round(h, 1)
        p["dem_offset_m"] = round(d)
        print(f"{p['name']:16s} {p['altitude_m']:8.0f} {h:8.0f} {h - p['altitude_m']:6.0f} {d:7.0f}  {lat:.5f}, {lon:.5f}")
    with open(cfg_path, "w") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
