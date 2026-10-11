"""Guion de planos de la pelicula (lista de decision de montaje en codigo).

Cada plano 3D: region, pivote (cumbre), rango de fotogramas globales, rig de camara con
claves y parametros de luz/atmosfera. Las claves se escriben en fotogramas relativos al
inicio del capitulo con ck(k, u).
"""
from .timeline import CHAPTER_LEN, Rig, chapter_start

PEAK_ORDER = ["shishapangma", "gasherbrum2", "broadpeak", "gasherbrum1", "annapurna", "nangaparbat",
              "manaslu", "dhaulagiri", "chooyu", "makalu", "lhotse", "kangchenjunga", "k2", "everest"]


def ck(k, u):
    return chapter_start(k) + u


def K(k, pairs):
    """Claves relativas al capitulo k: [(u, valor[, interp]), ...] -> fotogramas globales."""
    return [(ck(k, p[0]),) + tuple(p[1:]) for p in pairs]


def hero(k, region, keys, sun, **kw):
    s = chapter_start(k)
    d = {"id": f"ch{k:02d}", "chapter": k, "peak": PEAK_ORDER[k - 1], "region": region,
         "start": s + kw.pop("pre", -24), "end": s + CHAPTER_LEN + kw.pop("post", 24),
         "rig": Rig({name: (K(k, v) if isinstance(v, list) else v) for name, v in keys.items()}),
         "sun": sun}
    d.update(kw)
    return d


# ------------------------------------------------------------------------------------
# Planos protagonistas (primer diseno, ajustado tras pruebas de encuadre)
# Rumbo = desde la cumbre hacia la camara. Distancias en m. Altitudes absolutas en m.
# ------------------------------------------------------------------------------------
HEROES = [
    # 01 Shishapangma: apertura contemplativa desde la meseta tibetana (norte); sol del ESE -> luz lateral izq.
    hero(1, "shishapangma",
         {"bearing": [(0, 12.0), (216, 21.0, "linear")], "dist": [(0, 31000.0), (216, 25000.0, "out")],
          "alt": [(0, 6400.0), (216, 6750.0)], "lz": -800.0, "fov": [(0, 42.0), (216, 38.0)]},
         sun=(108.0, 6.0), exposure=8.5, haze=1.3),
    # 02 Gasherbrum II: picado sobre el glaciar -> la camara alza la vista y revela la piramide (SSO)
    hero(2, "karakoram",
         {"bearing": [(0, 208.0), (216, 205.0)], "dist": [(0, 13000.0), (150, 15800.0, "out"), (216, 16200.0)],
          "alt": [(0, 10200.0), (150, 8000.0, "out"), (216, 7950.0)],
          "lx": [(0, -2700.0), (40, -2700.0), (150, 0.0), (216, 0.0)],
          "ly": [(0, -5800.0), (40, -5800.0), (150, 0.0), (216, 0.0)],
          "lz": [(0, -2700.0), (40, -2700.0), (150, -900.0), (216, -800.0)], "fov": 40.0},
         sun=(118.0, 15.0), exposure=7.0),
    # 03 Broad Peak: travelling lateral a lo largo de la cresta cimera (oeste); sol del SSE
    hero(3, "karakoram",
         {"bearing": [(0, 238.0, "linear"), (216, 268.0)], "dist": 15500.0, "alt": 7100.0,
          "lz": -600.0, "fov": 40.0},
         sun=(165.0, 18.0), exposure=6.5),
    # 04 Gasherbrum I: revelacion progresiva tras las cumbres del Baltoro (oeste-suroeste)
    hero(4, "karakoram",
         {"bearing": [(0, 262.0), (216, 250.0)], "dist": [(0, 24000.0), (216, 21000.0)],
          "alt": [(0, 6300.0), (216, 7400.0, "out")], "lz": -900.0, "fov": 34.0},
         sun=(160.0, 15.0), exposure=6.5),
    # 05 Annapurna I: gran pared sur (Santuario), encuadre frontal; sol bajo de primera hora
    # desde el este: luz rasante que modela aristas y canales (con luz frontal la pared se aplana)
    hero(5, "annapurna",
         {"bearing": [(0, 184.0), (216, 176.0)], "dist": [(0, 17500.0), (216, 15000.0, "out")],
          "alt": [(0, 7200.0), (216, 7500.0)], "lz": -1600.0, "fov": 36.0},
         sun=(84.0, 9.0), exposure=6.4),
    # 06 Nanga Parbat: cara Rupal (sur): panoramica vertical de la base a la cima; sol rasante del este
    hero(6, "nangaparbat",
         {"bearing": 168.0, "dist": [(0, 17000.0), (216, 16000.0)], "alt": [(0, 6000.0), (216, 6400.0)],
          "lz": [(0, -4400.0), (40, -4400.0), (170, -500.0), (216, -400.0)], "fov": 44.0},
         sun=(95.0, 12.0), exposure=6.5),
    # 07 Manaslu: contraluz sobre mar de nubes (noroeste)
    hero(7, "manaslu",
         {"bearing": [(0, 296.0), (216, 304.0)], "dist": 20000.0, "alt": [(0, 7100.0), (216, 7300.0)],
          "lz": -900.0, "fov": 40.0},
         sun=(126.0, 13.0), exposure=9.0,
         clouds={"base": 4300.0, "thick": 900.0, "cov": 0.72, "scale": 7000.0, "wind": (6.0, 2.0)},
         fog={"dens": 0.00010, "h": 4000.0, "fall": 500.0}),
    # 08 Dhaulagiri I: presencia monumental, orbita lenta (este-sureste); sol del SSO -> luz lateral izq.
    hero(8, "annapurna",
         {"bearing": [(0, 102.0, "linear"), (216, 128.0)], "dist": 19500.0, "alt": 7300.0,
          "lz": -1100.0, "fov": 36.0},
         sun=(205.0, 26.0), exposure=6.5),
    # 09 Cho Oyu: apertura del ritmo, encuadre amplio desde el sur (Gokyo); sol del este
    hero(9, "khumbu",
         {"bearing": 192.0, "dist": [(0, 18500.0), (216, 17500.0)], "alt": [(0, 6200.0), (216, 6700.0)],
          "lz": -1500.0, "fov": 54.0},
         sun=(100.0, 22.0), exposure=6.5),
    # 10 Makalu: geometria piramidal, simetria (sur-suroeste); sol del ESE: una cara luz, otra sombra
    hero(10, "khumbu",
         {"bearing": 206.0, "dist": [(0, 18000.0), (216, 15500.0, "out")], "alt": 7800.0,
          "lz": -1100.0, "fov": 32.0},
         sun=(110.0, 16.0), exposure=7.0),
    # 11 Lhotse: desde el este (Kangshung): Lhotse delante, Everest detras y el Collado Sur entre ambos
    hero(11, "khumbu",
         {"bearing": [(0, 104.0), (216, 116.0)], "dist": [(0, 16500.0), (216, 15500.0)], "alt": 8300.0,
          "lz": -900.0, "lx": 0.0, "ly": 900.0, "fov": 40.0},
         sun=(175.0, 24.0), exposure=6.5),
    # 12 Kangchenjunga: gran macizo, solemnidad, luz dorada (sur-suroeste), nieblas en los valles
    hero(12, "kangchenjunga",
         {"bearing": [(0, 204.0), (216, 200.0)], "dist": [(0, 28000.0), (216, 25000.0)], "alt": 7200.0,
          "lz": -1400.0, "fov": 44.0},
         sun=(252.0, 6.0), exposure=9.0,
         fog={"dens": 0.00022, "h": 4700.0, "fall": 600.0}),
    # 13 K2: tension, contraste; acercamiento preciso (sur-sureste, Concordia); ocaso lateral izq.
    hero(13, "karakoram",
         {"bearing": 164.0, "dist": [(0, 14500.0), (216, 11500.0, "smooth5")],
          "alt": [(0, 6900.0), (216, 7700.0, "smooth5")], "lz": [(0, -1300.0), (216, -800.0, "smooth5")],
          "fov": 32.0},
         sun=(256.0, 3.0), exposure=10.0),
    # 14 Everest: maxima amplitud, alpenglow (oeste-noroeste), la camara sube y revela
    hero(14, "khumbu",
         {"bearing": [(0, 280.0), (216, 286.0)], "dist": [(0, 24000.0), (216, 22000.0)],
          "alt": [(0, 6300.0), (150, 8100.0, "out"), (216, 8250.0)], "lz": [(0, -500.0), (216, -1500.0)],
          "fov": [(0, 46.0), (216, 50.0)]},
         sun=(250.0, 0.9), exposure=14.0,
         clouds={"base": 4800.0, "thick": 700.0, "cov": 0.55, "scale": 8000.0, "wind": (4.0, 1.0)}),
]


# ------------------------------------------------------------------------------------
# Apertura (3,5-12,5 s): subida junto al Collado Sur (7.861 m en el DEM) desde el Cwm
# Occidental; al coronar entre las paredes del Everest y el Lhotse se abre el horizonte
# oriental y asoma el sol (azimut de salida del sol a 28 N a mediados de octubre: ~98 grados).
# ------------------------------------------------------------------------------------
def _opening():
    import math as _m
    import numpy as _np
    from .timeline import PathRig
    C = _np.array([5599.0, -2818.0, 7861.0])        # Collado Sur en la TM local de 'khumbu'

    def at(bearing, d, z):
        b = _m.radians(bearing)
        return (C[0] + d * _m.sin(b), C[1] + d * _m.cos(b), z)

    east = lambda d, z, az=103.0: at(az, d, z)
    keys = [
        (96, (4300.0, -3215.0, 7770.0), (9700.0, -3770.0, 8300.0), 58.0),
        (156, at(252.0, 1050.0, 8020.0), east(9000.0, 8300.0), 56.0),
        (198, at(250.0, 520.0, 8360.0), east(30000.0, 7800.0), 50.0),
        (312, east(1700.0, 8460.0, 100.0), east(45000.0, 6950.0, 104.0), 44.0),
    ]
    return {"id": "apertura", "chapter": 0, "peak": "everest", "region": "khumbu",
            "start": 96, "end": 312, "rig": PathRig(keys, timing="linear"),
            "pivot_xyz": tuple(C), "focus": (C[0] + 2000.0, C[1] - 500.0),
            "sun": (98.0, [(96, -1.95), (180, -1.25), (230, -0.95), (312, -0.55)]),
            # hora azul mas baja al principio: la nieve en sombra y el horizonte encendido
            "exposure": [(96, 13.0), (150, 15.5), (178, 18.0), (214, 12.0), (312, 10.5)],
            "sky_boost": 2.8,
            "clouds": {"base": 4500.0, "thick": 900.0, "cov": 0.62, "scale": 8000.0, "wind": (3.0, 1.0)},
            "haze": 1.1}


OPENING = _opening()


# ------------------------------------------------------------------------------------------
# Sintesis: campo base sur del Everest (5.364 m; 5.290 m en el DEM) al anochecer.
# Las luces de tienda son ilustrativas (dimension humana), dispuestas sobre el glaciar.
# ------------------------------------------------------------------------------------------
EBC = (-2184.0, 288.0, 5290.0)


def _camp():
    import math as _m
    from .timeline import PathRig

    def at(bearing, d, z, base=EBC):
        b = _m.radians(bearing)
        return (base[0] + d * _m.sin(b), base[1] + d * _m.cos(b), z)

    look = lambda bearing, d, z: at(bearing, d, z)
    keys = [
        (3790, at(235.0, 1800.0, 5570.0), look(72.0, 6500.0, 5420.0), 56.0),
        (3880, at(235.0, 1740.0, 5570.0), look(74.0, 6500.0, 5560.0), 56.0),
        (4050, at(235.0, 1620.0, 5580.0), look(82.0, 6500.0, 9150.0), 56.0),
        (4320, at(235.0, 1580.0, 5585.0), look(83.0, 6500.0, 9450.0), 56.0),
    ]
    return {"id": "campo_base", "chapter": 15, "peak": "everest", "region": "khumbu",
            "start": 3790, "end": 4319, "rig": PathRig(keys, timing="linear"), "lights": True,
            "pivot_xyz": EBC, "focus": (EBC[0] + 3000.0, EBC[1] + 1000.0),
            "sun": (262.0, [(3790, 1.4), (3900, 0.4), (4000, -0.6), (4100, -1.6), (4200, -2.4), (4320, -3.2)]),
            "exposure": [(3790, 9.0), (3900, 11.0), (4000, 14.0), (4100, 20.0), (4320, 28.0)],
            "sky_boost": 2.6, "stars": [(3790, 0.0), (4000, 0.2), (4150, 1.0)]}


CAMP = _camp()
