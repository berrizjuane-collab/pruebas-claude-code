"""Paso 3 · Imagen: Sentinel-2 L2A → albedo y máscara de nieve/hielo en la rejilla local.

Hallazgo que condiciona el método: en la escena elegida la reflectancia L2A de la
nieve es casi independiente de cos(i) entre 0,3 y 1,0 (Sen2Cor ya aplicó corrección
topográfica). Por eso NO se vuelve a dividir por la iluminación; solo se sustituyen
los píxeles poco fiables (cos(i) bajo, sombra proyectada calculada con nuestro DEM,
nubes según SCL) por una media local de píxeles fiables de la misma clase
(nieve/no-nieve según NDSI, que es robusto en sombra).

Salidas (public/data):
  albedo_core.webp (10 m), albedo_context.webp (40 m), albedo_far.webp (160 m)   sRGB
  masks_core.png / masks_context.png / masks_far.png  RGB: R = nieve (NDSI), G = fiabilidad, B = nube
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.warp import Resampling, reproject
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parent))
from k2 import config as C  # noqa: E402
from k2.geo import raster_transform, read_json, write_json  # noqa: E402
from k2.png16 import write_png  # noqa: E402

S2 = C.CACHE / "s2"

LEVELS = {
    # nombre: (semilado, resolución del ráster, tesela(s), fuente de alturas, espaciado de alturas)
    "core": (C.CORE.half, 10.0, ["core"], "analysis", C.ANALYSIS),
    "context": (C.CONTEXT.half, 40.0, ["context"], "context", C.CONTEXT),
    "far": (C.FAR.half, 160.0, ["far"], "far", C.FAR),
}


def load_band(level: str, band: str, half: float, res: float) -> np.ndarray:
    n = int(round(2 * half / res))
    out = np.zeros((n, n), np.float32)
    scenes = ["43SFV", "43SFA"] if level == "far" else ["43SFV"]
    for scene in scenes:
        with rasterio.open(S2 / f"{scene}_{level}_{band}.tif") as ds:
            a = ds.read(1)
            tmp = np.zeros((n, n), np.float32)
            rs = Resampling.nearest if band == "SCL" else (Resampling.bilinear if ds.res[0] >= res else Resampling.average)
            reproject(a.astype(np.float32), tmp, src_transform=ds.transform, src_crs=ds.crs, src_nodata=0,
                      dst_transform=raster_transform(half, res), dst_crs=C.LOCAL_CRS, dst_nodata=0, resampling=rs)
            fill = (out == 0) & (tmp != 0)
            out[fill] = tmp[fill]
    return out


def heights_at(level_src: str, grid: C.Grid, half: float, res: float) -> np.ndarray:
    """Alturas en los centros de píxel del ráster (interpolación bilineal de la rejilla)."""
    h = np.load(C.CACHE / f"{level_src}_heights.npy")
    n = int(round(2 * half / res))
    centers = -half + (np.arange(n) + 0.5) * res
    fx = (centers + grid.half) / grid.spacing
    fy = (grid.half - centers) / grid.spacing
    FX, FY = np.meshgrid(fx, fy)
    return ndi.map_coordinates(h, [FY, FX], order=1, mode="nearest").astype(np.float32)


def cast_shadow(h: np.ndarray, res: float, az: float, el: float, max_dist: float) -> np.ndarray:
    n0, n1 = h.shape
    I, J = np.mgrid[0:n0, 0:n1].astype(np.float32)
    lit = np.ones_like(h, dtype=bool)
    step = res
    tan_el = np.tan(el)
    k = 1
    while k * step <= max_dist:
        d = k * step
        jj = J + d * np.sin(az) / res
        ii = I - d * np.cos(az) / res
        hs = ndi.map_coordinates(h, [ii, jj], order=1, mode="nearest")
        lit &= hs <= h + d * tan_el + 0.5
        k += 1 if d < 400 else 2
    return lit


def normalized_blur(values: np.ndarray, weights: np.ndarray, sigma: float) -> np.ndarray:
    num = ndi.gaussian_filter(values * weights, sigma)
    den = ndi.gaussian_filter(weights, sigma)
    return num / np.maximum(den, 1e-4)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def linear_to_srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def main() -> None:
    meta = read_json(S2 / "S2A_43SFV_20240814_0_L2A.json")["properties"]
    az = np.radians(meta["view:sun_azimuth"])
    el = np.radians(meta["view:sun_elevation"])
    report = {}
    for level, (half, res, _, hsrc, hgrid) in LEVELS.items():
        b = {k: load_band(level, k, half, res) for k in ("B02", "B03", "B04", "B11")}
        scl = load_band(level, "SCL", half, res)
        nodata = b["B03"] == 0
        refl = {k: v * 1e-4 - 0.1 for k, v in b.items()}
        h = heights_at(hsrc, hgrid, half, res)
        hs = ndi.gaussian_filter(h, max(1.0, 25.0 / res))
        gy, gx = np.gradient(hs, res)
        nx, ny = -gx, gy
        nn = np.sqrt(nx * nx + ny * ny + 1)
        L = np.array([np.sin(az) * np.cos(el), np.cos(az) * np.cos(el), np.sin(el)])
        cosi = (nx * L[0] + ny * L[1] + L[2]) / nn
        lit = cast_shadow(hs, res, az, el, 2500.0 if level == "core" else 6000.0)
        cloud = np.isin(scl, [3, 8, 9, 10]) | nodata
        reliab = smoothstep(0.08, 0.3, cosi) * lit * (~cloud)
        ndsi = (refl["B03"] - refl["B11"]) / np.maximum(refl["B03"] + refl["B11"], 1e-4)
        snow = smoothstep(0.2, 0.5, ndsi)
        snow[cloud] = np.nan
        # en nubes: la clase se toma del entorno
        snow_f = np.where(np.isnan(snow), normalized_blur(np.nan_to_num(snow), (~np.isnan(snow)).astype(np.float32), 6), snow)
        sigma = max(2.0, 80.0 / res)
        rgb = np.stack([refl["B04"], refl["B03"], refl["B02"]], -1)
        out = np.empty_like(rgb)
        for ch in range(3):
            v = np.clip(rgb[..., ch], 0, 1.2)
            fill_snow = normalized_blur(v, reliab * snow_f, sigma)
            fill_rock = normalized_blur(v, reliab * (1 - snow_f), sigma)
            fill = snow_f * fill_snow + (1 - snow_f) * fill_rock
            out[..., ch] = reliab * v + (1 - reliab) * fill
        out = np.clip(out, 0, 1)
        srgb = (linear_to_srgb(out) * 255 + 0.5).astype(np.uint8)
        Image.fromarray(srgb, "RGB").save(C.PUBLIC_DATA / f"albedo_{level}.webp", quality=90, method=6)
        mres = 2 if level != "far" else 1
        m = np.stack([snow_f, reliab, cloud.astype(np.float32)], -1)
        if mres > 1:
            n2 = m.shape[0] // mres
            m = m[: n2 * mres, : n2 * mres].reshape(n2, mres, n2, mres, 3).mean(axis=(1, 3))
        write_png(C.PUBLIC_DATA / f"masks_{level}.png", np.round(np.clip(m, 0, 1) * 255).astype(np.uint8))
        report[level] = {
            "albedo": f"albedo_{level}.webp",
            "mascaras": f"masks_{level}.png",
            "resolucion": res,
            "resolucionMascaras": res * mres,
            "semilado": half,
            "pixeles": int(out.shape[0]),
            "nubesPct": round(100 * float(cloud.mean()), 2),
            "baja_fiabilidadPct": round(100 * float((reliab < 0.5).mean()), 1),
            "nievePct": round(100 * float((snow_f > 0.5).mean()), 1),
        }
        print(level, report[level])

    manifest_path = C.PUBLIC_DATA / "manifest.json"
    manifest = read_json(manifest_path)
    fuentes = read_json(C.CACHE / "fuentes.json")
    manifest["imagen"] = {
        "escena": meta["s2:product_uri"],
        "fecha": meta["datetime"],
        "solAzimut": meta["view:sun_azimuth"],
        "solElevacion": meta["view:sun_elevation"],
        "nubosidadTesela": meta["eo:cloud_cover"],
        "atribucion": "Contiene datos Copernicus Sentinel modificados (2024).",
        "metodo": "Reflectancia L2A (B4/B3/B2) ya corregida topográficamente por ESA; se rellenan "
                  "píxeles con cos(i) < 0,3, sombra proyectada o nube con la media local de su clase "
                  "(nieve/no nieve por NDSI). Máscara de nieve = smoothstep(0,2; 0,5; NDSI).",
        "niveles": report,
        "fuentes": fuentes["sentinel2"],
    }
    write_json(manifest_path, manifest)


if __name__ == "__main__":
    main()
