"""Paso 2 · Terreno: DEM Copernicus → rejillas locales, corrección de cumbre y assets.

Salidas (public/data):
  heights_core.png / heights_context.png / heights_far.png   PNG 16 bits, H = 3000 + 0,1·v (m EGM2008)
  aux_core.png      RGB 8 bits: R = clase FLM (procedencia del dato), G = peso de la
                    corrección local de cumbre (0-255), B = factor de cielo visible (0-255)
  manifest.json     (sección "terreno")
Salidas de trabajo (pipeline/.cache): analysis_heights.npy, analysis_flm.npy, core_heights.npy …
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.merge import merge
from rasterio.warp import Resampling, reproject
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parent))
from k2 import config as C  # noqa: E402
from k2.geo import grid_transform, local_to_lonlat, read_json, write_json  # noqa: E402
from k2.png16 import write_png  # noqa: E402


def mosaic(kind: str):
    srcs = [rasterio.open(C.CACHE / "cop30" / f"Copernicus_DSM_COG_10_{t}_{kind}.tif") for t in C.COP_TILES]
    arr, tr = merge(srcs)
    crs = srcs[0].crs
    for s in srcs:
        s.close()
    return arr[0], tr, crs


def to_grid(src, src_tr, src_crs, grid: C.Grid, resampling, dtype=np.float32):
    dst = np.zeros((grid.n, grid.n), dtype=dtype)
    reproject(src, dst, src_transform=src_tr, src_crs=src_crs, dst_transform=grid_transform(grid),
              dst_crs=C.LOCAL_CRS, resampling=resampling)
    return dst


def fill_invalid(h: np.ndarray) -> int:
    bad = ~np.isfinite(h) | (h < 1000) | (h > 9000)
    n = int(bad.sum())
    if n:
        idx = ndi.distance_transform_edt(bad, return_distances=False, return_indices=True)
        h[bad] = h[tuple(i[bad] for i in idx)]
    return n


def summit_correction(h: np.ndarray, grid: C.Grid, center, delta: float, radius: float):
    xs, ys = grid.xs(), grid.ys()
    X, Y = np.meshgrid(xs, ys)
    r = np.hypot(X - center[0], Y - center[1])
    w = np.where(r < radius, (1 - (r / radius) ** 2) ** 2, 0.0)
    h += (delta * w).astype(h.dtype)
    return w


def sky_view(h: np.ndarray, spacing: float, ndir=16, max_dist=2000.0) -> np.ndarray:
    """Factor de cielo visible aproximado: media de cos²(ángulo de horizonte) en ndir direcciones."""
    steps = int(max_dist / spacing)
    pad = steps + 1
    hp = np.pad(h, pad, mode="edge").astype(np.float32)
    n0, n1 = h.shape
    acc = np.zeros_like(h, dtype=np.float32)
    for d in range(ndir):
        th = 2 * np.pi * d / ndir
        best = np.zeros_like(h, dtype=np.float32)  # tan del horizonte (≥ 0)
        seen = set()
        for k in range(1, steps + 1):
            di = int(round(-k * np.cos(th)))
            dj = int(round(k * np.sin(th)))
            if (di, dj) in seen:
                continue
            seen.add((di, dj))
            dist = np.hypot(di, dj) * spacing
            sh = hp[pad + di:pad + di + n0, pad + dj:pad + dj + n1]
            np.maximum(best, (sh - h) / dist, out=best)
        acc += 1.0 / (1.0 + best * best)  # cos²(atan(t)) = 1/(1+t²)
    return acc / ndir


def main() -> None:
    dem, dem_tr, crs = mosaic("DEM")
    flm, flm_tr, _ = mosaic("FLM")
    print("DEM mosaico", dem.shape)

    analysis = to_grid(dem, dem_tr, crs, C.ANALYSIS, Resampling.cubic)
    # el núcleo es un recorte exacto de la rejilla de análisis (mismos vértices y valores):
    # rutas, POI y malla comparten así las mismas alturas
    off = int(round((C.ANALYSIS.half - C.CORE.half) / C.CORE.spacing))
    assert C.ANALYSIS.spacing == C.CORE.spacing
    core = analysis[off:off + C.CORE.n, off:off + C.CORE.n].copy()
    context = to_grid(dem, dem_tr, crs, C.CONTEXT, Resampling.average)
    far = to_grid(dem, dem_tr, crs, C.FAR, Resampling.average)
    filled = {name: fill_invalid(g) for name, g in [("core", core), ("analysis", analysis), ("context", context), ("far", far)]}
    print("celdas sin dato rellenadas:", filled)

    # --- Cumbre del modelo y corrección local documentada -------------------
    xs, ys = C.CORE.xs(), C.CORE.ys()
    X, Y = np.meshgrid(xs, ys)
    near = np.hypot(X, Y) < C.SUMMIT_SEARCH_RADIUS
    idx = np.unravel_index(np.argmax(np.where(near, core, -1)), core.shape)
    sx, sy = float(xs[idx[1]]), float(ys[idx[0]])
    raw_max = float(core[idx])
    # máximo del píxel original (sin remuestrear) para el registro
    with rasterio.open(C.CACHE / "cop30" / f"Copernicus_DSM_COG_10_{C.COP_TILES[0]}_DEM.tif") as ds:
        lon, lat = local_to_lonlat(sx, sy)
        r, c = ds.index(lon, lat)
        win = ds.read(1, window=rasterio.windows.Window(c - 10, r - 10, 21, 21))
        pix_max = float(win.max())
        pi = np.unravel_index(np.argmax(win), win.shape)
        plon, plat = ds.xy(r - 10 + pi[0], c - 10 + pi[1])
    delta = C.SUMMIT_ALTITUDE - raw_max
    summit_correction(analysis, C.ANALYSIS, (sx, sy), delta, C.SUMMIT_CORRECTION_RADIUS)
    core = analysis[off:off + C.CORE.n, off:off + C.CORE.n].copy()
    w_core = summit_correction(np.zeros_like(core), C.CORE, (sx, sy), 1.0, C.SUMMIT_CORRECTION_RADIUS)
    slon, slat = local_to_lonlat(sx, sy)
    print(f"cumbre del modelo ({sx:.1f}, {sy:.1f}) H={raw_max:.1f} → +{delta:.1f} m")

    # --- Costuras entre anillos: el borde interior copia el anillo interior ---
    def stitch(outer: np.ndarray, og: C.Grid, inner: np.ndarray, ig: C.Grid):
        oxs, oys = og.xs(), og.ys()
        for i, y in enumerate(oys):
            for j, x in enumerate(oxs):
                if abs(x) <= ig.half + 1e-6 and abs(y) <= ig.half + 1e-6 and (
                        abs(abs(x) - ig.half) < 1e-6 or abs(abs(y) - ig.half) < 1e-6):
                    ii = int(round((ig.half - y) / ig.spacing))
                    jj = int(round((x + ig.half) / ig.spacing))
                    outer[i, j] = inner[ii, jj]

    stitch(context, C.CONTEXT, core, C.CORE)
    stitch(far, C.FAR, context, C.CONTEXT)

    # --- Procedencia (FLM) y cielo visible ----------------------------------
    flm_core = to_grid(flm, flm_tr, crs, C.CORE, Resampling.nearest, dtype=np.uint8)
    flm_an = to_grid(flm, flm_tr, crs, C.ANALYSIS, Resampling.nearest, dtype=np.uint8)
    svf_an = sky_view(analysis, C.ANALYSIS.spacing)
    svf_core = svf_an[off:off + C.CORE.n, off:off + C.CORE.n]
    assert svf_core.shape == core.shape

    def flm_stats(mask):
        vals, cnt = np.unique(flm_core[mask], return_counts=True)
        tot = cnt.sum()
        return {C.FLM_CLASSES.get(int(v), str(v)): round(100 * c / tot, 1) for v, c in zip(vals, cnt)}

    stats_all = flm_stats(np.ones_like(core, dtype=bool))
    stats_high = flm_stats(core > 7000)
    print("FLM núcleo:", stats_all)
    print("FLM > 7000 m:", stats_high)

    # --- Exportación ----------------------------------------------------------
    def enc(h):
        v = np.round((h - C.HEIGHT_OFFSET) / C.HEIGHT_SCALE)
        assert v.min() >= 0 and v.max() <= 65535, (v.min(), v.max())
        return v.astype(np.uint16)

    write_png(C.PUBLIC_DATA / "heights_core.png", enc(core))
    write_png(C.PUBLIC_DATA / "heights_context.png", enc(context))
    write_png(C.PUBLIC_DATA / "heights_far.png", enc(far))
    aux = np.stack([flm_core, np.round(w_core * 255).astype(np.uint8),
                    np.round(np.clip(svf_core, 0, 1) * 255).astype(np.uint8)], -1)
    write_png(C.PUBLIC_DATA / "aux_core.png", aux)

    np.save(C.CACHE / "core_heights.npy", core)
    np.save(C.CACHE / "context_heights.npy", context)
    np.save(C.CACHE / "far_heights.npy", far)
    np.save(C.CACHE / "analysis_heights.npy", analysis)
    np.save(C.CACHE / "analysis_flm.npy", flm_an)
    np.save(C.CACHE / "analysis_svf.npy", svf_an)

    fuentes = read_json(C.CACHE / "fuentes.json")
    manifest_path = C.PUBLIC_DATA / "manifest.json"
    manifest = read_json(manifest_path) if manifest_path.exists() else {}
    manifest["version"] = 1
    manifest["sistema"] = {
        "crs": C.LOCAL_CRS,
        "descripcion": "Transversa de Mercator local (k=1) centrada en la coordenada publicada de la cumbre. "
                       "Ejes de la escena: x = este, y = altura, z = sur (norte = −z).",
        "origen": {"lat": C.ORIGIN_LAT, "lon": C.ORIGIN_LON},
        "elipsoide": "WGS84",
        "referenciaVertical": "EGM2008 (alturas ortométricas del Copernicus DEM)",
        "h0": C.H0,
        "nota": "La altura de renderizado es y = altitud − h0. Se ignora la curvatura terrestre "
                "(≤ 4 m en el núcleo, ≤ 100 m en el borde del horizonte a 36 km).",
    }
    manifest["alturas"] = {"codificacion": "png16-gris", "offset": C.HEIGHT_OFFSET, "escala": C.HEIGHT_SCALE}
    manifest["rejillas"] = {
        name: {
            "archivo": f"heights_{name}.png",
            "espaciado": g.spacing,
            "semilado": g.half,
            "muestras": g.n,
            "filaCero": "norte",
            "remuestreo": "cúbico" if name == "core" else "promedio",
            "rango": [float(h.min()), float(h.max())],
        }
        for name, g, h in [("core", C.CORE, core), ("context", C.CONTEXT, context), ("far", C.FAR, far)]
    }
    manifest["aux"] = {
        "archivo": "aux_core.png",
        "rejilla": "core",
        "canales": {"r": "clase FLM de Copernicus (procedencia del dato)", "g": "peso de la corrección de cumbre ×255",
                    "b": "factor de cielo visible ×255 (16 direcciones, 2 km)"},
        "clasesFLM": {str(k): v for k, v in C.FLM_CLASSES.items()},
    }
    manifest["cumbre"] = {
        "altitudReferencia": C.SUMMIT_ALTITUDE,
        "coordenadaPublicada": {"lat": C.ORIGIN_LAT, "lon": C.ORIGIN_LON},
        "modelo": {"x": sx, "y": sy, "lat": round(slat, 6), "lon": round(slon, 6),
                   "alturaDEMRemuestreada": round(raw_max, 1)},
        "pixelMaximoDEM": {"lat": round(plat, 6), "lon": round(plon, 6), "altura": round(pix_max, 1)},
        "distanciaACoordenadaPublicada": round(float(np.hypot(sx, sy)), 1),
        "correccion": {
            "tipo": "reconstrucción local",
            "incrementoMaximo": round(delta, 1),
            "radio": C.SUMMIT_CORRECTION_RADIUS,
            "perfil": "(1 − (r/R)²)²",
            "motivo": "El DEM (relleno AW3D30/SRTM90 en la pirámide cimera) culmina en "
                      f"{pix_max:.1f} m; se eleva localmente el ápice hasta la altitud convencional "
                      "sin reescalar el resto del relieve.",
        },
    }
    manifest["procedencia"] = {"nucleo": stats_all, "nucleoSobre7000m": stats_high}
    manifest["celdasRellenadas"] = filled
    manifest["fuentesTerreno"] = fuentes["copernicus"]
    write_json(manifest_path, manifest)
    print("manifest actualizado")


if __name__ == "__main__":
    main()
