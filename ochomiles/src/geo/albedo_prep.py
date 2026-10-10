"""Albedo y nieve a 10 m a partir de Sentinel-2 L2A, sin la iluminacion de la toma.

1. Iluminacion de la toma con el DEM: coseno de incidencia, sombra proyectada (horizonte en
   el azimut solar de la escena) y vision de cielo.
2. Calibracion con la nieve (albedo casi uniforme): R_nieve = a*directa + b*difusa, por banda.
3. Albedo = R / iluminacion, normalizado a terreno llano soleado; en sombra profunda (poca
   senal) se mezcla con el albedo medio local de las zonas soleadas.
4. Nieve: NDSI = (B03-B11)/(B03+B11), excluyendo agua (SCL=6).
5. Modelo de albedo por altitud para el terreno lejano sin imagen.

Uso: python3 src/geo/albedo_prep.py <region|all>
"""
import json
import math
import os
import sys
import time

import cv2
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import reproject

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from horizon import horizon_angle  # noqa: E402
from regions import REGIONS, ROOT  # noqa: E402

TER = os.path.join(ROOT, "data", "work", "terrain")


def to_grid(path, ref_tr, ref_crs, shape, resampling=Resampling.cubic, arr=None, src_tr=None):
    dst = np.zeros(shape, np.float32)
    if arr is None:
        with rasterio.open(path) as src:
            reproject(rasterio.band(src, 1), dst, dst_transform=ref_tr, dst_crs=ref_crs,
                      resampling=resampling, num_threads=4)
    else:
        reproject(arr, dst, src_transform=src_tr, src_crs=ref_crs, dst_transform=ref_tr, dst_crs=ref_crs,
                  resampling=resampling, num_threads=4)
    return dst


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def prep(region):
    t0 = time.time()
    meta = json.load(open(os.path.join(ROOT, f"data/work/s2_{region}.json")))
    sun_el = float(np.mean([s[0] for s in meta["sun"]]))
    sun_az = float(np.mean([s[1] for s in meta["sun"]]))
    with rasterio.open(os.path.join(ROOT, f"data/work/s2_{region}.tif")) as ds:
        crs, tr, shape = ds.crs, ds.transform, (ds.height, ds.width)
        r = ds.read(1).astype(np.float32) / 10000
        g = ds.read(2).astype(np.float32) / 10000
        b = ds.read(3).astype(np.float32) / 10000
        sw = ds.read(4).astype(np.float32) / 10000
        scl = ds.read(5)
    cell = tr.a
    print(f"{region}: {shape[1]}x{shape[0]} sol el {sun_el:.1f} az {sun_az:.1f}", flush=True)

    # --- iluminacion de la toma ---
    with rasterio.open(os.path.join(TER, f"{region}_L0.tif")) as ds:
        z30 = ds.read(1)
        tr30 = ds.transform
    hz30 = horizon_angle(z30, tr30.a, sun_az, 40000.0)
    z = to_grid(None, tr, crs, shape, Resampling.cubic, z30, tr30)
    hz = to_grid(None, tr, crs, shape, Resampling.bilinear, hz30, tr30)
    svf = to_grid(os.path.join(TER, f"{region}_L0_svf.tif"), tr, crs, shape, Resampling.bilinear)
    del z30, hz30
    gy, gx = np.gradient(z, cell)
    # filas hacia el sur: dz/dnorte = -gy
    nx, ny = -gx, gy
    nz = np.ones_like(z)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + 1.0)
    nx *= inv
    ny *= inv
    nz *= inv
    se, sa = math.radians(sun_el), math.radians(sun_az)
    s = (math.cos(se) * math.sin(sa), math.cos(se) * math.cos(sa), math.sin(se))
    cos_i = np.clip(nx * s[0] + ny * s[1] + nz * s[2], 0, 1)
    half = math.radians(0.6)
    lit = smoothstep(-half, half, se - hz)
    direct = cos_i * lit / math.sin(se)          # 1 en terreno llano soleado
    del gx, gy, nx, ny, inv
    slope = np.degrees(np.arccos(np.clip(nz, 0, 1)))
    del nz

    # --- nieve ---
    ndsi = (g - sw) / np.maximum(g + sw, 1e-4)
    water = scl == 6
    snow = smoothstep(0.30, 0.55, ndsi) * (~water)
    snow *= smoothstep(0.04, 0.10, g)   # descarta sombras muy oscuras sin senal

    # --- calibracion con nieve pura ---
    sel = (snow > 0.95) & (slope < 35) & (svf > 0.6)
    idx = np.flatnonzero(sel.ravel())
    rng = np.random.default_rng(1)
    if idx.size > 400000:
        idx = rng.choice(idx, 400000, replace=False)
    A = np.stack([direct.ravel()[idx], svf.ravel()[idx]], 1)
    coef = {}
    for name, band in (("r", r), ("g", g), ("b", b)):
        y = band.ravel()[idx]
        sol, *_ = np.linalg.lstsq(A, y, rcond=None)
        coef[name] = [float(sol[0]), float(sol[1])]
    print("  calibracion nieve (directa, difusa):", {k: [round(v, 3) for v in c] for k, c in coef.items()}, flush=True)

    # --- albedo ---
    alb = []
    lit_w = smoothstep(0.15, 0.5, direct)  # confianza: zonas con luz directa suficiente
    for name, band in (("r", r), ("g", g), ("b", b)):
        a_dir, a_dif = coef[name]
        a_dir = max(a_dir, 0.05)
        a_dif = max(a_dif, 0.02)
        flat = a_dir + a_dif                         # nieve en llano soleado
        illum = (a_dir * direct + a_dif * svf) / flat
        al = band / np.maximum(illum, 0.04) * (0.88 / flat)  # reescala: nieve llana -> 0.88
        alb.append(np.clip(al, 0, 1.2).astype(np.float32))
    alb = np.stack(alb, 0)
    # en sombra profunda: mezcla con el albedo medio soleado de su misma clase (local -> regional
    # -> global, segun haya o no superficie soleada de esa clase alrededor)
    for cls_w in (snow, 1 - snow):
        wgt = (lit_w * cls_w).astype(np.float32)
        gsum = float(wgt.sum()) + 1e-6
        gmean = [float((alb[c] * wgt).sum() / gsum) for c in range(3)]
        means = [np.full(wgt.shape, gmean[c], np.float32) for c in range(3)]
        for k in (401, 121, 41):      # de grande a pequeno: cada escala refina a la anterior
            den = cv2.blur(wgt, (k, k))
            conf = smoothstep(0.02, 0.12, den)
            for c in range(3):
                loc = cv2.blur(alb[c] * wgt, (k, k)) / (den + 1e-6)
                means[c] = means[c] * (1 - conf) + loc * conf
        mix = (1 - lit_w) * 0.8 * cls_w
        for c in range(3):
            alb[c] = alb[c] * (1 - mix) + means[c] * mix
    alb[:, water] = np.array([0.02, 0.05, 0.06], np.float32)[:, None]
    # limites fisicos por clase
    rock_max = 0.45
    for c in range(3):
        alb[c] = np.where(snow > 0.5, np.clip(alb[c], 0.45, 0.97), np.clip(alb[c], 0.02, rock_max))

    # --- modelo de albedo por altitud (para terreno sin imagen) ---
    bins = np.arange(1000, 8800, 200)
    zb = np.digitize(z, bins)
    model = []
    for i in range(1, len(bins)):
        m = (zb == i) & (lit_w > 0.5)
        if m.sum() < 2000:
            model.append(None)
            continue
        sf = float(snow[m].mean())
        rock = (m & (snow < 0.2))
        rc = [float(np.median(alb[c][rock])) for c in range(3)] if rock.sum() > 500 else None
        model.append({"z0": int(bins[i - 1]), "snow": round(sf, 3),
                      "rock": [round(v, 4) for v in rc] if rc else None})
    # nieve segun pendiente y altitud: tasa de nieve en pendientes >45 grados por banda
    out = {"region": region, "sun_el": sun_el, "sun_az": sun_az, "calibration": coef,
           "albedo_by_elevation": model}
    json.dump(out, open(os.path.join(TER, f"{region}_albedo.json"), "w"), indent=1)

    # --- escritura: RGB albedo (sRGB 8 bit) + A = fraccion de nieve ---
    srgb = np.where(alb <= 0.0031308, alb * 12.92, 1.055 * np.power(np.clip(alb, 0, None), 1 / 2.4) - 0.055)
    rgba = np.concatenate([np.clip(srgb * 255 + 0.5, 0, 255).astype(np.uint8),
                           (np.clip(snow, 0, 1) * 255 + 0.5).astype(np.uint8)[None]], 0)
    with rasterio.open(os.path.join(TER, f"{region}_albedo.tif"), "w", driver="GTiff", width=shape[1],
                       height=shape[0], count=4, dtype="uint8", crs=crs, transform=tr, compress="deflate",
                       tiled=True, photometric="RGB", alpha="UNSPECIFIED") as ds:
        ds.write(rgba)
    # previsualizacion
    small = cv2.resize(np.transpose(rgba[:3], (1, 2, 0)), (shape[1] // 6, shape[0] // 6), interpolation=cv2.INTER_AREA)
    cv2.imwrite(os.path.join(ROOT, f"data/work/albedo_{region}_preview.jpg"), small[..., ::-1])
    print(f"  {region} albedo listo en {time.time()-t0:.0f} s", flush=True)


if __name__ == "__main__":
    regs = list(REGIONS) if sys.argv[1] == "all" else sys.argv[1:]
    for rg in regs:
        prep(rg)
