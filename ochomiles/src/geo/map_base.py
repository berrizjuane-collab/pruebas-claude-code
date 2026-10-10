"""Mapa base del atlas: relieve sombreado en Lambert Conica Conforme y capas vectoriales.

Proyeccion: LCC, paralelos estandar 27 y 37 N, meridiano central 81 E (centro del arco
Himalaya-Karakorum). Los marcadores se calculan con la misma proyeccion desde WGS84.

Niveles raster:
  A  contexto de Asia   ~1,6 km/px   Terrain Tiles z6
  B  arco montanoso     ~0,3 km/px   Terrain Tiles z9
Salidas en data/work/map/: <nivel>_elev.npy, <nivel>_meta.json, vectores.json
"""
import json
import math
import os
import sys

import cv2
import numpy as np
from pyproj import Transformer
from rasterio.transform import from_origin
from rasterio.warp import reproject, Resampling

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import terrarium  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "data", "work", "map")
NE = os.path.join(ROOT, "data", "raw", "naturalearth")
LCC = "+proj=lcc +lat_1=27 +lat_2=37 +lat_0=31 +lon_0=81 +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs"
_fwd = Transformer.from_crs("EPSG:4326", LCC, always_xy=True)
_inv = Transformer.from_crs(LCC, "EPSG:4326", always_xy=True)

LEVELS = {
    # nombre: (lon0, lat0, lon1, lat1 de descarga), zoom de teselas, metros por pixel
    "A": ((40.0, -8.0, 125.0, 58.0), 6, 1600.0),
    "B": ((68.0, 22.0, 94.0, 40.5), 9, 300.0),
}


def project(lon, lat):
    return _fwd.transform(lon, lat)


def unproject(x, y):
    return _inv.transform(x, y)


def build_level(name):
    (lo0, la0, lo1, la1), z, res = LEVELS[name]
    arr, mtr = terrarium.mosaic(lo0, la0, lo1, la1, z)
    # caja proyectada que cabe dentro de la descarga
    xs, ys = [], []
    for lo in np.linspace(lo0, lo1, 40):
        for la in np.linspace(la0, la1, 40):
            x, y = project(lo, la)
            xs.append(x)
            ys.append(y)
    # recorta a la region interior para no dejar esquinas sin datos
    xs, ys = np.array(xs), np.array(ys)
    x0, x1 = np.percentile(xs, 4), np.percentile(xs, 96)
    y0, y1 = np.percentile(ys, 4), np.percentile(ys, 96)
    w, h = int((x1 - x0) / res), int((y1 - y0) / res)
    tr = from_origin(x0, y1, res, res)
    dst = np.zeros((h, w), np.float32)
    reproject(arr, dst, src_transform=mtr, src_crs="EPSG:3857", dst_transform=tr, dst_crs=LCC,
              resampling=Resampling.cubic if name == "B" else Resampling.average, num_threads=4)
    os.makedirs(OUT, exist_ok=True)
    np.save(os.path.join(OUT, f"{name}_elev.npy"), dst)
    json.dump({"x0": x0, "y1": y1, "res": res, "w": w, "h": h}, open(os.path.join(OUT, f"{name}_meta.json"), "w"))
    print(name, w, h, "px", dst.min(), dst.max(), flush=True)


def _proj_coords(coords):
    a = np.asarray(coords, np.float64)
    x, y = project(a[:, 0], a[:, 1])
    return np.stack([x, y], 1).round(1).tolist()


def _lines(geom):
    t = geom["type"]
    if t == "LineString":
        return [geom["coordinates"]]
    if t == "MultiLineString":
        return geom["coordinates"]
    if t == "Polygon":
        return geom["coordinates"]
    if t == "MultiPolygon":
        return [ring for poly in geom["coordinates"] for ring in poly]
    return []


def _polys(geom):
    t = geom["type"]
    if t == "Polygon":
        return [geom["coordinates"]]
    if t == "MultiPolygon":
        return geom["coordinates"]
    return []


def _in_box(coords, box):
    a = np.asarray(coords)
    return ((a[:, 0] > box[0]) & (a[:, 0] < box[2]) & (a[:, 1] > box[1]) & (a[:, 1] < box[3])).any()


def build_vectors():
    box = (35.0, -10.0, 130.0, 60.0)
    vec = {}

    def load(f):
        return json.load(open(os.path.join(NE, f + ".geojson")))["features"]

    vec["coast"] = [_proj_coords(l) for ft in load("ne_50m_coastline") for l in _lines(ft["geometry"])
                    if _in_box(l, box)]
    vec["land"] = [[_proj_coords(r) for r in poly] for ft in load("ne_50m_land") for poly in _polys(ft["geometry"])
                   if _in_box(poly[0], box)]
    borders = []
    for ft in load("ne_10m_admin_0_boundary_lines_land"):
        p = ft["properties"]
        for l in _lines(ft["geometry"]):
            if _in_box(l, box):
                borders.append({"cls": p.get("FEATURECLA"), "pts": _proj_coords(l)})
    vec["borders"] = borders
    rivers = []
    for ft in load("ne_10m_rivers_lake_centerlines"):
        p = ft["properties"]
        if (p.get("scalerank") or p.get("SCALERANK") or 10) > 6:
            continue
        for l in _lines(ft["geometry"]):
            if _in_box(l, box):
                rivers.append({"name": p.get("name") or p.get("NAME"), "rank": p.get("scalerank") or p.get("SCALERANK"),
                               "pts": _proj_coords(l)})
    vec["rivers"] = rivers
    vec["lakes"] = [[_proj_coords(r) for r in poly] for ft in load("ne_10m_lakes") for poly in _polys(ft["geometry"])
                    if _in_box(poly[0], box) and (ft["properties"].get("scalerank") or 9) <= 6]
    vec["glaciers"] = [[_proj_coords(r) for r in poly] for ft in load("ne_10m_glaciated_areas")
                       for poly in _polys(ft["geometry"]) if _in_box(poly[0], box)]
    ranges = {}
    for ft in load("ne_10m_geography_regions_polys"):
        n = ft["properties"].get("NAME") or ft["properties"].get("name")
        if n in ("HIMALAYAS", "KARAKORAM RA.", "PLATEAU OF TIBET", "HINDU KUSH", "GANGES PLAIN", "TARIM BASIN"):
            ranges[n] = [[_proj_coords(r) for r in poly] for poly in _polys(ft["geometry"])]
    vec["regions"] = ranges
    json.dump(vec, open(os.path.join(OUT, "vectors.json"), "w"))
    print("vectores:", {k: len(v) for k, v in vec.items()})


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for lv in (sys.argv[1:] or ["A", "B", "vec"]):
        if lv == "vec":
            build_vectors()
        else:
            build_level(lv)
