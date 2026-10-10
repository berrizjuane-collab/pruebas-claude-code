"""Regiones de trabajo (cajas WGS84) y sistema de coordenadas local de cada una.

Cada region agrupa las cumbres que comparten escenario 3D. El sistema local es una
Transversa de Mercator centrada en la region (k=1), con x al este, y al norte, en metros:
la distorsion es < 1e-4 dentro de +-100 km, despreciable a escala de la pelicula.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# lon_min, lat_min, lon_max, lat_max  (caja de imagen de satelite a 10 m)
REGIONS = {
    "khumbu":        {"bbox": (86.45, 27.74, 87.30, 28.26), "peaks": ["chooyu", "everest", "lhotse", "makalu"]},
    "karakoram":     {"bbox": (76.28, 35.54, 76.92, 36.06), "peaks": ["k2", "broadpeak", "gasherbrum1", "gasherbrum2"]},
    "annapurna":     {"bbox": (83.22, 28.38, 84.08, 28.92), "peaks": ["annapurna", "dhaulagiri"]},
    "manaslu":       {"bbox": (84.33, 28.35, 84.80, 28.75), "peaks": ["manaslu"]},
    "shishapangma":  {"bbox": (85.53, 28.15, 86.03, 28.55), "peaks": ["shishapangma"]},
    "nangaparbat":   {"bbox": (74.32, 35.03, 74.86, 35.45), "peaks": ["nangaparbat"]},
    "kangchenjunga": {"bbox": (87.90, 27.50, 88.40, 27.91), "peaks": ["kangchenjunga"]},
}


def center(name):
    b = REGIONS[name]["bbox"]
    return (b[1] + b[3]) / 2, (b[0] + b[2]) / 2


def local_crs(name):
    lat, lon = center(name)
    return f"+proj=tmerc +lat_0={lat:.6f} +lon_0={lon:.6f} +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs"


def peaks():
    with open(os.path.join(ROOT, "config", "peaks.json")) as f:
        return {p["id"]: p for p in json.load(f)["peaks"]}


def region_of(peak_id):
    for k, v in REGIONS.items():
        if peak_id in v["peaks"]:
            return k
    raise KeyError(peak_id)
