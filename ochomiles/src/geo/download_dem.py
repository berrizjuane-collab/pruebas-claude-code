"""Descarga de teselas Copernicus DEM GLO-30 (AWS Open Data) para las regiones de la pelicula.

Copernicus DEM (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018,
provided under COPERNICUS by the European Union and ESA; all rights reserved.
Licencia: uso gratuito, incluido comercial, con atribucion.
"""
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "data", "raw", "cop30")
BASE = "https://copernicus-dem-30m.s3.amazonaws.com"

# Margen (grados) alrededor de cada cumbre que debe cubrir el DEM de 30 m
MARGIN_LAT = 0.65
MARGIN_LON = 0.75


def tile_name(lat, lon):
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return f"Copernicus_DSM_COG_10_{ns}{abs(lat):02d}_00_{ew}{abs(lon):03d}_00_DEM"


def needed_tiles():
    with open(os.path.join(ROOT, "config", "peaks.json")) as f:
        peaks = json.load(f)["peaks"]
    tiles = set()
    import math
    for p in peaks:
        la0 = math.floor(p["approx_lat"] - MARGIN_LAT)
        la1 = math.floor(p["approx_lat"] + MARGIN_LAT)
        lo0 = math.floor(p["approx_lon"] - MARGIN_LON)
        lo1 = math.floor(p["approx_lon"] + MARGIN_LON)
        for la in range(la0, la1 + 1):
            for lo in range(lo0, lo1 + 1):
                tiles.add((la, lo))
    return sorted(tiles)


def fetch(t):
    name = tile_name(*t)
    dst = os.path.join(OUT, name + ".tif")
    if os.path.exists(dst) and os.path.getsize(dst) > 1000:
        return name, "cached"
    url = f"{BASE}/{name}/{name}.tif"
    r = subprocess.run(["curl", "-sS", "-f", "--retry", "4", "--retry-delay", "2",
                        "-o", dst + ".part", url], capture_output=True, text=True)
    if r.returncode != 0:
        return name, "FAIL " + r.stderr.strip()[:120]
    os.replace(dst + ".part", dst)
    return name, f"{os.path.getsize(dst)/1e6:.1f} MB"


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    tiles = needed_tiles()
    print(len(tiles), "teselas")
    with ThreadPoolExecutor(6) as ex:
        for name, status in ex.map(fetch, tiles):
            print(name, status, flush=True)
