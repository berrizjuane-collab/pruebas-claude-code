"""Elige la mejor fecha Sentinel-2 para cada region: nubes y huecos medidos dentro de la caja.

Uso: python3 src/geo/s2_select.py <region> [n_candidatas]
Escribe data/work/s2_select_<region>.json y una hoja de previsualizaciones TCI.
"""
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor

import mgrs
import numpy as np
import rasterio
from PIL import Image, ImageDraw
from rasterio.enums import Resampling
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from net import get  # noqa: E402
from regions import REGIONS, ROOT  # noqa: E402

BUCKET = "https://sentinel-cogs.s3.us-west-2.amazonaws.com"
PREFIX = "sentinel-s2-l2a-cogs"
proxy = os.environ.get("HTTPS_PROXY", "").replace("http://", "")
GDAL_ENV = dict(CURL_CA_BUNDLE="/root/.ccr/ca-bundle.crt", GDAL_HTTP_PROXY=proxy,
                GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MULTIRANGE="YES",
                GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES", VSI_CACHE="TRUE",
                GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="2")
MONTHS = [(y, m) for y in (2022, 2023, 2024, 2025) for m in (10, 11, 12, 1, 2, 3, 4, 5)]
_list_cache = {}


def tiles_for_bbox(bbox):
    m = mgrs.MGRS()
    lo0, la0, lo1, la1 = bbox
    out = set()
    for i in range(9):
        for j in range(9):
            la = la0 + (la1 - la0) * i / 8
            lo = lo0 + (lo1 - lo0) * j / 8
            out.add(m.toMGRS(la, lo, MGRSPrecision=0))
    return sorted(out)


def list_month(tile, y, mth):
    key = (tile, y, mth)
    if key in _list_cache:
        return _list_cache[key]
    z, b, sq = tile[:2], tile[2], tile[3:]
    prefix = f"{PREFIX}/{int(z)}/{b}/{sq}/{y}/{mth}/"
    out, token = [], None
    import urllib.parse
    while True:
        url = f"{BUCKET}/?list-type=2&prefix={prefix}&delimiter=/"
        if token:
            url += "&continuation-token=" + urllib.parse.quote(token, safe="")
        x = get(url).decode()
        out += re.findall(r"<CommonPrefixes><Prefix>([^<]+)</Prefix>", x)
        mm = re.search(r"<NextContinuationToken>([^<]+)</NextContinuationToken>", x)
        if not mm:
            break
        token = mm.group(1)
    _list_cache[key] = out
    return out


def scenes_by_date(tile):
    """{yyyymmdd: prefix} quedandose con la version de procesado mas alta."""
    res = {}
    with ThreadPoolExecutor(8) as ex:
        lists = list(ex.map(lambda ym: list_month(tile, *ym), MONTHS))
    for lst in lists:
        for p in lst:
            sid = p.rstrip("/").split("/")[-1]
            d = sid.split("_")[2]
            ver = int(sid.split("_")[3])
            if d not in res or ver > res[d][1]:
                res[d] = (p, ver)
    return {d: v[0] for d, v in res.items()}


def read_box(prefix, band, bbox, max_px=600, resampling=Resampling.nearest):
    url = f"/vsicurl/{BUCKET}/{prefix}{band}.tif"
    with rasterio.Env(**GDAL_ENV):
        with rasterio.open(url) as ds:
            b = transform_bounds("EPSG:4326", ds.crs, *bbox)
            w = from_bounds(*b, ds.transform)
            scale = max(w.width, w.height) / max_px
            shape = (max(1, int(w.height / scale)), max(1, int(w.width / scale)))
            return ds.read(1, window=w, out_shape=shape, boundless=True, fill_value=0,
                           resampling=resampling)


def evaluate(region, n=10):
    bbox = REGIONS[region]["bbox"]
    tiles = tiles_for_bbox(bbox)
    print(region, "teselas:", tiles, flush=True)
    per_tile = {t: scenes_by_date(t) for t in tiles}
    common = set.intersection(*[set(v) for v in per_tile.values()])
    cat = json.load(open(os.path.join(ROOT, "data/work/s2_catalog.json")))
    cloud = {}
    for t in tiles:
        for i in cat.get(t, []):
            d = i["id"].split("_")[2]
            cloud[d] = max(cloud.get(d, 0), i["cloud"] or 0)
    cands = sorted(common, key=lambda d: cloud.get(d, 50))[: n * 2]
    results = []

    def score(d):
        valid = np.zeros(0)
        stats = []
        for t in tiles:
            scl = read_box(per_tile[t][d], "SCL", bbox)
            stats.append(scl)
        # combina: por pixel, el primer valor no nulo
        comb = stats[0].copy()
        for s in stats[1:]:
            s = np.array(Image.fromarray(s).resize(comb.shape[::-1], Image.NEAREST))
            comb = np.where(comb == 0, s, comb)
        tot = comb.size
        nod = np.mean(comb == 0)
        cl = np.mean(np.isin(comb, [3, 8, 9, 10]))
        sn = np.mean(comb == 11)
        return {"date": d, "nodata": float(nod), "cloud": float(cl), "snow": float(sn),
                "prefixes": {t: per_tile[t][d] for t in tiles}}
    def safe(d):
        try:
            return score(d)
        except Exception as e:  # noqa: BLE001  escena incompleta en el archivo
            print("  ", d, "descartada:", str(e)[:60], flush=True)
            return None
    with ThreadPoolExecutor(4) as ex:
        for r in ex.map(safe, cands):
            if r is None:
                continue
            results.append(r)
            print(f"  {r['date']}  nubes {r['cloud']*100:5.2f}%  sin datos {r['nodata']*100:5.2f}%  nieve {r['snow']*100:5.1f}%", flush=True)
    results.sort(key=lambda r: r["cloud"] * 3 + r["nodata"])
    json.dump(results, open(os.path.join(ROOT, f"data/work/s2_select_{region}.json"), "w"), indent=1)
    # hoja de previsualizacion TCI de las 4 mejores
    ims = []
    for r in results[:4]:
        comb = None
        for t in tiles:
            a = np.stack([read_box(r["prefixes"][t], "TCI", bbox, 420, Resampling.average)], 0)
            with rasterio.Env(**GDAL_ENV):
                url = f"/vsicurl/{BUCKET}/{r['prefixes'][t]}TCI.tif"
                with rasterio.open(url) as ds:
                    b = transform_bounds("EPSG:4326", ds.crs, *bbox)
                    w = from_bounds(*b, ds.transform)
                    sc = max(w.width, w.height) / 420
                    rgb = ds.read(window=w, out_shape=(3, int(w.height / sc), int(w.width / sc)),
                                  boundless=True, fill_value=0, resampling=Resampling.average)
            rgb = np.transpose(rgb, (1, 2, 0))
            if comb is None:
                comb = rgb
            else:
                rgb = np.array(Image.fromarray(rgb).resize(comb.shape[1::-1]))
                comb = np.where(comb.sum(-1, keepdims=True) == 0, rgb, comb)
        im = Image.fromarray(comb.astype(np.uint8))
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, 260, 14], fill=(0, 0, 0))
        d.text((2, 1), f"{r['date']} c{r['cloud']*100:.2f}% nd{r['nodata']*100:.1f}% s{r['snow']*100:.0f}%", fill=(255, 255, 0))
        ims.append(im)
    W = sum(i.width for i in ims) + 4 * len(ims)
    H = max(i.height for i in ims)
    sheet = Image.new("RGB", (W, H), (30, 30, 30))
    x = 0
    for i in ims:
        sheet.paste(i, (x, 0))
        x += i.width + 4
    sheet.save(os.path.join(ROOT, f"data/work/s2_preview_{region}.jpg"), quality=88)


if __name__ == "__main__":
    evaluate(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 8)
