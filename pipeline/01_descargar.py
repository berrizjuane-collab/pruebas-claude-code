"""Paso 1 · Descarga reproducible de las fuentes a pipeline/.cache.

- Copernicus DEM GLO-30 (teselas COG completas + máscaras auxiliares FLM/EDM/HEM/WBM)
  desde el bucket público de AWS Open Data.
- Sentinel-2 L2A (COG de Element 84 / AWS Open Data): solo las ventanas necesarias,
  leídas por rangos HTTP y guardadas como GeoTIFF con su georreferencia.

Registra URL, tamaño, SHA-256 y fecha de acceso en .cache/fuentes.json.
"""
from __future__ import annotations

import datetime as dt
import sys
import urllib.request
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import from_bounds

sys.path.insert(0, str(Path(__file__).resolve().parent))
from k2 import config as C  # noqa: E402
from k2.geo import LOCAL_TO_UTM43, sha256, write_json  # noqa: E402


def download(url: str, dest: Path) -> dict:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        tmp = dest.with_suffix(dest.suffix + ".part")
        with urllib.request.urlopen(url, timeout=600) as r, open(tmp, "wb") as f:
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                f.write(b)
        tmp.rename(dest)
    return {"url": url, "archivo": str(dest.relative_to(C.ROOT)), "bytes": dest.stat().st_size, "sha256": sha256(dest)}


def utm_bounds(half: float, margin: float):
    """Caja UTM 43N que contiene el cuadrado local ±half (+margen)."""
    h = half + margin
    xs = np.array([-h, 0, h, h, h, 0, -h, -h])
    ys = np.array([h, h, h, 0, -h, -h, -h, 0])
    ex, ny = LOCAL_TO_UTM43.transform(xs, ys)
    return float(ex.min()), float(ny.min()), float(ex.max()), float(ny.max())


def read_window(scene: str, band: str, bounds, res: float, dest: Path) -> dict:
    url = f"{C.S2_BUCKET}/{C.S2_SCENES[scene]}/{band}.tif"
    if not dest.exists():
        with rasterio.open("/vsicurl/" + url) as ds:
            left = max(bounds[0], ds.bounds.left)
            right = min(bounds[2], ds.bounds.right)
            bottom = max(bounds[1], ds.bounds.bottom)
            top = min(bounds[3], ds.bounds.top)
            # Ajuste a la malla nativa de 10/20 m para no desplazar píxeles
            nat = ds.res[0]
            left = np.floor(left / nat) * nat
            top = np.ceil(top / nat) * nat
            right = np.ceil(right / nat) * nat
            bottom = np.floor(bottom / nat) * nat
            win = from_bounds(left, bottom, right, top, ds.transform).round_offsets().round_lengths()
            out_w = int(round((right - left) / res))
            out_h = int(round((top - bottom) / res))
            resampling = rasterio.enums.Resampling.nearest if band == "SCL" else rasterio.enums.Resampling.average
            arr = ds.read(1, window=win, out_shape=(out_h, out_w), resampling=resampling)
            tr = rasterio.transform.from_origin(left, top, res, res)
            prof = dict(driver="GTiff", width=out_w, height=out_h, count=1, dtype=arr.dtype, crs=ds.crs,
                        transform=tr, compress="deflate", nodata=0)
            dest.parent.mkdir(parents=True, exist_ok=True)
            with rasterio.open(dest, "w", **prof) as o:
                o.write(arr, 1)
    return {"url": url, "archivo": str(dest.relative_to(C.ROOT)), "resolucion_m": res, "sha256": sha256(dest)}


def main() -> None:
    record = {"acceso": dt.date.today().isoformat(), "copernicus": [], "sentinel2": []}
    for tile in C.COP_TILES:
        base = f"{C.COP_BUCKET}/Copernicus_DSM_COG_10_{tile}_DEM"
        record["copernicus"].append(download(f"{base}/Copernicus_DSM_COG_10_{tile}_DEM.tif",
                                             C.CACHE / "cop30" / f"Copernicus_DSM_COG_10_{tile}_DEM.tif"))
        for aux in C.COP_AUX:
            record["copernicus"].append(download(f"{base}/AUXFILES/Copernicus_DSM_COG_10_{tile}_{aux}.tif",
                                                 C.CACHE / "cop30" / f"Copernicus_DSM_COG_10_{tile}_{aux}.tif"))
        print("DEM", tile, "ok")

    s2 = C.CACHE / "s2"
    # Núcleo a resolución nativa (10 m visibles, 20 m SWIR/SCL)
    core_b = utm_bounds(C.CORE.half, 1300)
    for band in C.S2_BANDS:
        res = 10.0 if band in ("B02", "B03", "B04") else 20.0
        record["sentinel2"].append(read_window("43SFV", band, core_b, res, s2 / f"43SFV_core_{band}.tif"))
    # Contexto a 40 m (lectura decimada sobre las vistas generales del COG)
    ctx_b = utm_bounds(C.CONTEXT.half, 1500)
    for band in C.S2_BANDS:
        record["sentinel2"].append(read_window("43SFV", band, ctx_b, 40.0, s2 / f"43SFV_context_{band}.tif"))
    # Horizonte a 160 m desde dos teselas de la misma pasada
    far_b = utm_bounds(C.FAR.half, 2500)
    for scene in ("43SFV", "43SFA"):
        for band in C.S2_BANDS:
            record["sentinel2"].append(read_window(scene, band, far_b, 160.0, s2 / f"{scene}_far_{band}.tif"))
    print("Sentinel-2 ok")
    # Metadatos de la escena (ángulos solares, nubosidad)
    meta = {}
    for scene, path in C.S2_SCENES.items():
        sid = path.rsplit("/", 1)[-1]
        dest = s2 / f"{sid}.json"
        record["sentinel2"].append(download(f"{C.S2_BUCKET}/{path}/{sid}.json", dest))
        meta[scene] = str(dest.relative_to(C.ROOT))
    record["sentinel2_metadatos"] = meta
    write_json(C.CACHE / "fuentes.json", record)
    print("registro:", C.CACHE / "fuentes.json")


if __name__ == "__main__":
    main()
