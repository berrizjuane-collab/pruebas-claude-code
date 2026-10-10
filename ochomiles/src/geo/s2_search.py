"""Busca escenas Sentinel-2 L2A (AWS Open Data, bucket sentinel-cogs) por tesela MGRS.

Lista las escenas de los meses post-monzon (oct-dic) y de primavera, lee su item STAC
(nubosidad, angulos solares) y guarda un catalogo en data/work/s2_catalog.json.
Copernicus Sentinel data: uso libre, incluido comercial, citando
"Contains modified Copernicus Sentinel data [ano]".
"""
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from net import get  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BUCKET = "https://sentinel-cogs.s3.us-west-2.amazonaws.com"
PREFIX = "sentinel-s2-l2a-cogs"

TILES = sys.argv[1].split(",") if len(sys.argv) > 1 else [
    "45RUM", "43SFV", "44RQS", "43SDU", "45RTM", "45RVM", "45RWL", "45RVL", "45RXL"]
YEARS = [2022, 2023, 2024, 2025]
MONTHS = [10, 11, 12, 1, 3, 4, 5]


def list_prefixes(prefix):
    out, token = [], None
    while True:
        url = f"{BUCKET}/?list-type=2&prefix={prefix}&delimiter=/"
        if token:
            url += "&continuation-token=" + urllib_quote(token)
        x = get(url).decode()
        out += re.findall(r"<CommonPrefixes><Prefix>([^<]+)</Prefix>", x)
        m = re.search(r"<NextContinuationToken>([^<]+)</NextContinuationToken>", x)
        if not m:
            return out
        token = m.group(1)


def urllib_quote(s):
    import urllib.parse
    return urllib.parse.quote(s, safe="")


def scene_info(scene_prefix):
    sid = scene_prefix.rstrip("/").split("/")[-1]
    try:
        item = json.loads(get(f"{BUCKET}/{scene_prefix}{sid}.json"))
    except Exception as e:  # noqa: BLE001
        return {"id": sid, "error": str(e)}
    p = item.get("properties", {})
    return {
        "id": sid,
        "prefix": scene_prefix,
        "datetime": p.get("datetime"),
        "cloud": p.get("eo:cloud_cover"),
        "nodata": p.get("s2:nodata_pixel_percentage"),
        "snow": p.get("s2:snow_ice_percentage"),
        "sun_el": p.get("view:sun_elevation"),
        "sun_az": p.get("view:sun_azimuth"),
    }


def tile_parts(t):
    return t[:2], t[2], t[3:]


if __name__ == "__main__":
    cat_path = os.path.join(ROOT, "data", "work", "s2_catalog.json")
    catalog = json.load(open(cat_path)) if os.path.exists(cat_path) else {}
    for t in TILES:
        z, b, sq = tile_parts(t)
        scenes = []
        for y in YEARS:
            for m in MONTHS:
                scenes += list_prefixes(f"{PREFIX}/{int(z)}/{b}/{sq}/{y}/{m}/")
        with ThreadPoolExecutor(12) as ex:
            infos = [i for i in ex.map(scene_info, scenes) if "error" not in i]
        infos.sort(key=lambda i: (i["cloud"] if i["cloud"] is not None else 999))
        catalog[t] = infos
        good = [i for i in infos if (i["cloud"] or 99) < 3 and (i["nodata"] or 0) < 5]
        print(t, len(infos), "escenas;", len(good), "con <3% nubes y <5% sin datos", flush=True)
        for i in good[:6]:
            print("   ", i["id"], i["datetime"][:10], f"nubes {i['cloud']:.2f}%  nieve {i['snow']:.1f}%  sol el {i['sun_el']:.1f} az {i['sun_az']:.1f}")
        json.dump(catalog, open(cat_path, "w"), indent=1)
