"""Prepara los modelos de elevacion de cada region en su Transversa de Mercator local.

Niveles (centrados en la region):
  L0  30 m   caja de imagen + 30 km   Copernicus GLO-30 (huecos: Terrain Tiles z12)
  L1  90 m   +-160 km                 GLO-30 promediado / Terrain Tiles z10
  L2  270 m  +-500 km                 Terrain Tiles z9 (horizontes lejanos)

Correccion de cumbres: el DEM de 30 m suaviza las cimas (hasta -242 m en el Makalu).
Se realza solo la parte alta de cada cumbre (radio < 2,5 km) para que su cota coincida con
la altitud de referencia; la forma del macizo y de las aristas no se altera.

Uso: python3 src/geo/terrain_prep.py <region|all>
"""
import json
import math
import os
import sys
import time

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.warp import reproject, transform as warp_transform

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from horizon import sky_view  # noqa: E402
from regions import REGIONS, ROOT, center, local_crs, peaks  # noqa: E402
import terrarium  # noqa: E402

VRT = os.path.join(ROOT, "data", "work", "cop30.vrt")
OUT = os.path.join(ROOT, "data", "work", "terrain")
LEVELS = [("L0", 30.0, None), ("L1", 90.0, 160000.0), ("L2", 270.0, 500000.0)]


def level_grid(region, cell, half):
    n = int(math.ceil(2 * half / cell / 16) * 16)
    x0 = -n * cell / 2
    y1 = n * cell / 2
    return from_origin(x0, y1, cell, cell), n


def from_cop30(dst, tr, crs, resampling):
    with rasterio.open(VRT) as src:
        reproject(rasterio.band(src, 1), dst, dst_transform=tr, dst_crs=crs,
                  src_nodata=-32767, dst_nodata=np.nan, resampling=resampling, num_threads=4)
    # el mosaico VRT devuelve 0 fuera de las teselas descargadas: es "sin dato", no nivel del mar
    # (no hay cotas reales cercanas a 0 m a menos de 500 km de estas cumbres)
    dst[np.abs(dst) < 0.5] = np.nan


def despike(z, max_valid=8850.0, tol=900.0):
    """Elimina artefactos de remuestreo (anillos del cubico junto a teselas defectuosas):
    cotas negativas, por encima del Everest o muy alejadas de la mediana local -> hueco."""
    from scipy.ndimage import median_filter
    med = median_filter(np.nan_to_num(z, nan=0.0), size=5)
    bad = (z < 0) | (z > max_valid) | (np.abs(z - med) > tol)
    z[bad] = np.nan
    return int(bad.sum())


def fill_gaps(z):
    """Rellena huecos residuales (NaN o 0 m) con el valor valido mas proximo."""
    from scipy.ndimage import distance_transform_edt
    bad = ~np.isfinite(z) | (np.abs(z) < 0.5)
    if bad.any():
        idx = distance_transform_edt(bad, return_distances=False, return_indices=True)
        z[bad] = z[tuple(i[bad] for i in idx)]
    return int(bad.sum())


def from_terrarium(dst, tr, crs, z, region):
    n = dst.shape[0]
    xs = [tr.c, tr.c + n * tr.a]
    ys = [tr.f, tr.f + n * tr.e]
    lons, lats = warp_transform(crs, "EPSG:4326", [xs[0], xs[1], xs[0], xs[1]], [ys[0], ys[0], ys[1], ys[1]])
    pad = 0.05
    arr, mtr = terrarium.mosaic(min(lons) - pad, min(lats) - pad, max(lons) + pad, max(lats) + pad, z)
    tmp = np.full(dst.shape, np.nan, np.float32)
    reproject(arr, tmp, src_transform=mtr, src_crs="EPSG:3857", dst_transform=tr, dst_crs=crs,
              dst_nodata=np.nan, resampling=Resampling.cubic, num_threads=4)
    fill = np.isnan(dst)
    dst[fill] = tmp[fill]


# Cimas secundarias cuya cota en el DEM contradice la referencia y afecta a la silueta.
# Broad Peak Central: 8.011 m (8000ers.com); el DEM la sobrestima (8.051 m).
SUBSIDIARY = [
    {"id": "broadpeak_central", "dem_lat": 35.82056, "dem_lon": 76.56444, "altitude_m": 8011.0},
]


def restore_summits(z, tr, crs, region_peaks, log):
    """Ajusta la cota de cada cima a su altitud de referencia con un realce local:
    perfil radial suave centrado en el maximo local del DEM."""
    for p in SUBSIDIARY + list(region_peaks):
        x, y = warp_transform("EPSG:4326", crs, [p["dem_lon"]], [p["dem_lat"]])
        col = (x[0] - tr.c) / tr.a
        row = (y[0] - tr.f) / tr.e
        cell = tr.a
        r_search = max(1, int(round(300 / cell)))
        r0, c0 = int(round(row)), int(round(col))
        if not (r_search <= r0 < z.shape[0] - r_search and r_search <= c0 < z.shape[1] - r_search):
            continue
        win = z[r0 - r_search:r0 + r_search + 1, c0 - r_search:c0 + r_search + 1]
        k = np.nanargmax(win)
        mr, mc = np.unravel_index(k, win.shape)
        mr += r0 - r_search
        mc += c0 - r_search
        zmax = float(z[mr, mc])
        delta = float(p["altitude_m"]) - zmax
        if abs(delta) < 1.0:
            continue
        # un deficit mayor de 400 m no es suavizado del DEM sino un hueco de datos: no se corrige
        # (inventaria relieve); el nivel L2 toma Copernicus alrededor de las cumbres para evitarlo
        if abs(delta) > 400.0:
            log.append({"peak": p["id"], "cell_m": cell, "dem_max_m": round(zmax, 1), "added_m": 0.0,
                        "new_max_m": round(zmax, 1), "skipped": "deficit > 400 m (hueco de datos)"})
            continue
        # perfil suave (1 - (r/R)^2)^2: eleva la cupula de la cumbre sin crear agujas;
        # pendiente anadida maxima ~ 1.5*delta/R (unos 10-15 grados)
        R = max(4.0 * abs(delta) + 400.0, 2.0 * cell)
        rr = int(math.ceil(R / cell)) + 1
        r_lo, r_hi = max(0, mr - rr), min(z.shape[0], mr + rr + 1)
        c_lo, c_hi = max(0, mc - rr), min(z.shape[1], mc + rr + 1)
        yy, xx = np.mgrid[r_lo:r_hi, c_lo:c_hi]
        dist = np.hypot((yy - mr) * cell, (xx - mc) * cell)
        w = np.clip(1.0 - (dist / R) ** 2, 0, 1) ** 2
        sub = z[r_lo:r_hi, c_lo:c_hi]
        sub += (delta * w).astype(np.float32)
        near = sub[dist < 300.0]
        log.append({"peak": p["id"], "cell_m": cell, "dem_max_m": round(zmax, 1),
                    "added_m": round(delta, 1), "new_max_m": round(float(np.nanmax(near)), 1)})


def prep(region, only=None):
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    crs = local_crs(region)
    bbox = REGIONS[region]["bbox"]
    lat_c, lon_c = center(region)
    xs, ys = warp_transform("EPSG:4326", crs, [bbox[0], bbox[2]], [bbox[1], bbox[3]])
    half0 = max(abs(xs[0]), abs(xs[1]), abs(ys[0]), abs(ys[1])) + 30000.0
    reg_peaks = [p for p in peaks().values() if p["id"] in REGIONS[region]["peaks"]]
    # cumbres de otras regiones que caen dentro de los niveles lejanos tambien se corrigen
    all_peaks = list(peaks().values())
    info = {"region": region, "crs": crs, "center": [lat_c, lon_c], "levels": {}, "summit_fix": []}
    old = json.load(open(os.path.join(OUT, f"{region}.json"))) if only and os.path.exists(
        os.path.join(OUT, f"{region}.json")) else None
    if old:
        info["levels"] = old["levels"]
        info["summit_fix"] = [f for f in old["summit_fix"] if f["cell_m"] not in [c for n_, c, h_ in LEVELS if n_ in only]]
    for name, cell, half in LEVELS:
        if only and name not in only:
            continue
        half = half0 if half is None else half
        tr, n = level_grid(region, cell, half)
        z = np.full((n, n), np.nan, np.float32)
        # Copernicus GLO-30 donde haya teselas (alrededor de las 14 cumbres), Terrain Tiles en el resto
        from_cop30(z, tr, crs, Resampling.cubic if name == "L0" else Resampling.average)
        missing = float(np.isnan(z).mean())
        if missing > 0:
            from_terrarium(z, tr, crs, {"L0": 12, "L1": 10, "L2": 9}[name], region)
        z[np.abs(z) < 0.5] = np.nan               # teselas Terrarium vacias o fallidas
        nspk = despike(z, tol=900.0 if name != "L0" else 1e9)
        nfill = fill_gaps(z)
        restore_summits(z, tr, crs, all_peaks if name != "L0" else reg_peaks + [
            p for p in all_peaks if p not in reg_peaks], info["summit_fix"])
        path = os.path.join(OUT, f"{region}_{name}.tif")
        with rasterio.open(path, "w", driver="GTiff", width=n, height=n, count=1, dtype="float32",
                           crs=crs, transform=tr, compress="deflate", predictor=3, tiled=True) as ds:
            ds.write(z, 1)
        info["levels"][name] = {"cell": cell, "n": n, "half": n * cell / 2, "cop30_missing": missing,
                                "transform": list(tr)[:6]}
        print(f"  {region} {name}: {n}x{n} @ {cell:.0f} m, faltaban {missing*100:.1f}% -> Terrain Tiles;"
              f" {nfill} celdas rellenadas por vecindad ({nspk} artefactos)", flush=True)
        if name in ("L0", "L1"):
            svf = sky_view(z, cell, ndir=16 if name == "L0" else 8,
                           max_dist=20000.0 if name == "L0" else 60000.0)
            with rasterio.open(os.path.join(OUT, f"{region}_{name}_svf.tif"), "w", driver="GTiff", width=n,
                               height=n, count=1, dtype="float32", crs=crs, transform=tr,
                               compress="deflate", predictor=3, tiled=True) as ds:
                ds.write(svf.astype(np.float32), 1)
            print(f"  {region} {name}: vision de cielo calculada ({time.time()-t0:.0f} s)", flush=True)
    json.dump(info, open(os.path.join(OUT, f"{region}.json"), "w"), indent=1)
    for f in info["summit_fix"]:
        if f["cell_m"] == 30.0:
            print(f"    cima {f['peak']}: DEM {f['dem_max_m']} m +{f['added_m']} m -> {f['new_max_m']} m")
    print(f"  {region} listo en {time.time()-t0:.0f} s", flush=True)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--levels=")]
    lv = [a.split("=", 1)[1].split(",") for a in sys.argv[1:] if a.startswith("--levels=")]
    regs = list(REGIONS) if args[0] == "all" else args
    for r in regs:
        prep(r, only=lv[0] if lv else None)
