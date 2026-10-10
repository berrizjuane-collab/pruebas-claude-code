"""Descarga y mosaico Sentinel-2 L2A para una region, reproyectado a su TM local.

Uso: python3 src/geo/s2_fetch.py <region> [yyyymmdd]
Salida: data/work/s2_<region>.tif  (uint16: B04,B03,B02,B11,SCL; reflectancia*10000 sin offset)
        data/work/s2_<region>.json (fecha, angulos solares, escenas usadas)
"""
import json
import os
import sys

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.warp import reproject, transform_bounds

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from net import get  # noqa: E402
from regions import REGIONS, ROOT, local_crs  # noqa: E402
from s2_select import BUCKET, GDAL_ENV  # noqa: E402

RES = 10.0
BANDS = [("B04", Resampling.bilinear), ("B03", Resampling.bilinear), ("B02", Resampling.bilinear),
         ("B11", Resampling.bilinear), ("SCL", Resampling.nearest)]


def grid(region):
    crs = local_crs(region)
    x0, y0, x1, y1 = transform_bounds("EPSG:4326", crs, *REGIONS[region]["bbox"], densify_pts=21)
    x0, y0 = np.floor(x0 / RES) * RES, np.floor(y0 / RES) * RES
    x1, y1 = np.ceil(x1 / RES) * RES, np.ceil(y1 / RES) * RES
    w, h = int((x1 - x0) / RES), int((y1 - y0) / RES)
    return crs, from_origin(x0, y1, RES, RES), w, h


def main(region, date=None):
    sel = json.load(open(os.path.join(ROOT, f"data/work/s2_select_{region}.json")))
    pick = sel[0] if date is None else next(r for r in sel if r["date"] == date)
    crs, tr, w, h = grid(region)
    print(region, pick["date"], f"{w}x{h} px a {RES} m", flush=True)
    out = np.zeros((len(BANDS), h, w), np.uint16)
    meta = {"region": region, "date": pick["date"], "crs": crs, "res": RES, "scenes": [], "sun": []}
    for tile, prefix in pick["prefixes"].items():
        sid = prefix.rstrip("/").split("/")[-1]
        item = json.loads(get(f"{BUCKET}/{prefix}{sid}.json"))
        props = item["properties"]
        offset = 0
        # Linea base >= 04.00: los ND llevan un desplazamiento BOA de +1000 que hay que restar
        if not props.get("earthsearch:boa_offset_applied", False) and \
                float(props.get("s2:processing_baseline", "0")) >= 4.0:
            offset = 1000
        meta["scenes"].append({"tile": tile, "id": sid, "offset": offset,
                               "baseline": props.get("s2:processing_baseline")})
        meta["sun"].append((props.get("view:sun_elevation"), props.get("view:sun_azimuth")))
        for bi, (band, rs) in enumerate(BANDS):
            url = f"/vsicurl/{BUCKET}/{prefix}{band}.tif"
            dst = np.zeros((h, w), np.uint16)
            with rasterio.Env(**GDAL_ENV):
                with rasterio.open(url) as ds:
                    reproject(rasterio.band(ds, 1), dst, dst_transform=tr, dst_crs=crs,
                              src_nodata=0, dst_nodata=0, resampling=rs, num_threads=4)
            if band != "SCL" and offset:
                valid = dst > 0
                dst = np.where(valid, np.clip(dst.astype(np.int32) - offset, 1, 65535), 0).astype(np.uint16)
            fill = (out[bi] == 0) & (dst > 0)
            out[bi][fill] = dst[fill]
            print(f"  {tile} {band} rellenados {fill.mean()*100:.1f}%", flush=True)
    dst_path = os.path.join(ROOT, f"data/work/s2_{region}.tif")
    with rasterio.open(dst_path, "w", driver="GTiff", width=w, height=h, count=len(BANDS), dtype="uint16",
                       crs=crs, transform=tr, compress="deflate", predictor=2, tiled=True,
                       blockxsize=512, blockysize=512, BIGTIFF="IF_SAFER") as ds:
        ds.write(out)
        ds.descriptions = tuple(b for b, _ in BANDS)
    meta["missing_pct"] = float((out[0] == 0).mean() * 100)
    json.dump(meta, open(os.path.join(ROOT, f"data/work/s2_{region}.json"), "w"), indent=1)
    print("guardado", dst_path, f"sin datos {meta['missing_pct']:.2f}%")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
