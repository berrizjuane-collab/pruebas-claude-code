#!/usr/bin/env python3
"""
Pinta la ilustración extra de la web: un mapa en relieve del macizo del
Annapurna con el valle del Modi Khola, a pincel seco sobre papel oscuro.

No es una fotografía ni un modelo digital del terreno: es un dibujo. Las
cumbres, los ríos y las aldeas están en sus coordenadas reales, y el relieve
entre ellos se deduce de las aristas y los valles (ver `ARISTAS` y `RIOS`).
Sirve para orientarse en la página, no para caminar.

Uso:
    python3 tools/pintar_mapa.py horizontal   # img/mapa-3840.webp, -2560, -1280
    python3 tools/pintar_mapa.py vertical     # img/mapa-movil-1080.webp y -1620
    python3 tools/pintar_mapa.py brocha       # img/brocha.webp (textura de las transiciones)

Solo necesita numpy y Pillow.
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SALIDA = Path(__file__).resolve().parent.parent / "img"

# ───────────────────────── geografía ─────────────────────────
# Kilómetros al este y al norte de (83,80° E, 28,50° N).
LON0, LAT0 = 83.80, 28.50
KX, KY = 97.9, 110.9

# Los dos encuadres. La web usa estos mismos números para colocar la ruta
# y los rótulos encima de la pintura (js/datos.js → MAPA).
ENCUADRES = {
    "horizontal": dict(lon=(83.50, 84.36), lat_centro=28.4835, px=(3840, 2160)),
    "vertical": dict(lon=(83.665, 83.971), lat_centro=28.4705, px=(1620, 3520)),
}

# Aristas: cadenas de (longitud, latitud, altitud en metros).
ARISTAS = [
    # Gran Barrera: Nilgiri → Tilicho → Khangsar Kang
    [(83.700, 28.700, 5600), (83.747, 28.689, 7061), (83.775, 28.688, 6500), (83.805, 28.685, 7134),
     (83.840, 28.655, 6700), (83.872, 28.612, 7485)],
    # Espolón del Annapurna I y borde oeste del Santuario
    [(83.872, 28.612, 7485), (83.845, 28.598, 8010), (83.820, 28.596, 8091), (83.812, 28.580, 7250),
     (83.807, 28.566, 7647), (83.805, 28.540, 6850), (83.806, 28.518, 7219), (83.828, 28.512, 6100),
     (83.850, 28.511, 6441), (83.870, 28.503, 4900), (83.884, 28.497, 3600)],
    # Borde norte: Tarke Kang → Gangapurna → Annapurna III
    [(83.872, 28.612, 7485), (83.905, 28.607, 7193), (83.935, 28.607, 6850), (83.963, 28.605, 7455),
     (83.990, 28.585, 7555)],
    # Borde este: Gandharba Chuli → Machapuchare → Mardi Himal
    [(83.990, 28.585, 7555), (83.985, 28.560, 6350), (83.965, 28.535, 6248), (83.955, 28.512, 6300),
     (83.949, 28.495, 6993), (83.938, 28.472, 5587), (83.928, 28.440, 4500), (83.925, 28.405, 3700),
     (83.930, 28.360, 2900), (83.940, 28.315, 2000), (83.950, 28.270, 1400), (83.955, 28.235, 1050)],
    # Interior del Santuario: Singu Chuli → Tharpu Chuli
    [(83.905, 28.607, 7193), (83.925, 28.578, 6501), (83.905, 28.563, 5663), (83.893, 28.548, 4700)],
    # Macizo oriental: Annapurna IV → II → Lamjung
    [(83.990, 28.585, 7555), (84.030, 28.565, 6500), (84.083, 28.539, 7525), (84.122, 28.536, 7937),
     (84.160, 28.515, 6650), (84.190, 28.485, 6983), (84.230, 28.460, 5200), (84.270, 28.425, 3700),
     (84.310, 28.385, 2500), (84.350, 28.340, 1700)],
    # Espolón sur del Annapurna Sur → Tadapani → Poon Hill
    [(83.806, 28.518, 7219), (83.795, 28.490, 5500), (83.785, 28.455, 4300), (83.776, 28.425, 3400),
     (83.770, 28.402, 2720), (83.735, 28.399, 3100), (83.700, 28.400, 2874), (83.690, 28.400, 3210),
     (83.672, 28.420, 3300), (83.655, 28.455, 2500)],
    # Arista oeste del Annapurna I
    [(83.820, 28.596, 8091), (83.780, 28.600, 6700), (83.740, 28.600, 5700), (83.700, 28.590, 4500),
     (83.672, 28.572, 3100)],
    # Espolón oeste del Fang
    [(83.807, 28.566, 7647), (83.770, 28.558, 5900), (83.730, 28.545, 4700), (83.692, 28.522, 3500),
     (83.668, 28.500, 2300)],
    # Loma de Ghandruk
    [(83.785, 28.455, 4300), (83.798, 28.405, 2700), (83.806, 28.376, 2050), (83.800, 28.335, 1550)],
    # Loma de Landruk, entre el Modi y el Mardi
    [(83.938, 28.472, 5587), (83.900, 28.425, 3700), (83.872, 28.388, 2900), (83.852, 28.350, 2300),
     (83.835, 28.312, 1750), (83.815, 28.270, 1400)],
    # Sur de Poon Hill
    [(83.690, 28.400, 3210), (83.700, 28.362, 2500), (83.722, 28.332, 1900), (83.745, 28.300, 1450),
     (83.750, 28.260, 1250)],
    # Dhaulagiri, al otro lado del Kali Gandaki (borde del mapa)
    [(83.487, 28.698, 8167), (83.540, 28.662, 6100), (83.580, 28.605, 4700), (83.600, 28.525, 3600),
     (83.598, 28.430, 2900), (83.580, 28.335, 2200)],
    # Norte del lago Tilicho
    [(83.700, 28.760, 5200), (83.780, 28.742, 6300), (83.850, 28.737, 6400), (83.915, 28.750, 6200),
     (83.950, 28.790, 5416)],
    # Lomas menores del sur, para que el pie del macizo no quede liso
    [(84.000, 28.440, 3300), (84.020, 28.390, 2400), (84.040, 28.330, 1700), (84.050, 28.280, 1300)],
    [(84.083, 28.539, 7525), (84.095, 28.490, 4800), (84.105, 28.440, 3400), (84.120, 28.380, 2300),
     (84.140, 28.320, 1500)],
    [(84.190, 28.485, 6983), (84.200, 28.440, 4300), (84.210, 28.390, 2900), (84.225, 28.330, 1800)],
    [(83.990, 28.585, 7555), (84.010, 28.620, 5600), (84.030, 28.645, 4300)],
    [(84.122, 28.536, 7937), (84.130, 28.580, 5600), (84.150, 28.610, 4200)],
    [(84.190, 28.650, 6091), (84.240, 28.640, 5300), (84.300, 28.620, 4500), (84.350, 28.600, 4200)],
    [(83.640, 28.330, 2300), (83.660, 28.290, 1900), (83.690, 28.250, 1500)],
]

# Ríos: (longitud, latitud, altitud del cauce).
RIOS = {
    "kali": [(83.720, 28.800, 2760), (83.700, 28.745, 2670), (83.652, 28.705, 2590), (83.622, 28.645, 2450),
             (83.640, 28.600, 2010), (83.646, 28.550, 1500), (83.654, 28.496, 1190), (83.632, 28.430, 1050),
             (83.602, 28.380, 900), (83.570, 28.340, 830), (83.560, 28.270, 790), (83.560, 28.170, 760)],
    "miristi": [(83.805, 28.628, 4200), (83.755, 28.633, 3500), (83.705, 28.618, 2700), (83.660, 28.578, 1650),
                (83.646, 28.550, 1500)],
    "modi": [(83.862, 28.545, 4080), (83.878, 28.530, 4000), (83.898, 28.522, 3650), (83.890, 28.497, 3150),
             (83.875, 28.476, 2850), (83.861, 28.457, 2500), (83.851, 28.443, 2250), (83.836, 28.421, 1900),
             (83.826, 28.400, 1700), (83.815, 28.362, 1400), (83.792, 28.326, 1150), (83.775, 28.302, 1040),
             (83.760, 28.270, 950), (83.740, 28.230, 850), (83.705, 28.190, 780), (83.690, 28.160, 760)],
    "bhurungdi": [(83.775, 28.302, 1040), (83.757, 28.330, 1300), (83.745, 28.346, 1500), (83.722, 28.372, 2150),
                  (83.708, 28.392, 2650)],
    "kimrong": [(83.790, 28.432, 2700), (83.806, 28.412, 2050), (83.826, 28.400, 1700)],
    "seti": [(83.975, 28.505, 3300), (83.985, 28.435, 1750), (83.992, 28.360, 1200), (83.990, 28.285, 950),
             (83.985, 28.225, 820), (84.000, 28.160, 740)],
    "mardi": [(83.905, 28.432, 2700), (83.900, 28.372, 1650), (83.912, 28.312, 1150), (83.962, 28.282, 950)],
    "marsyangdi": [(83.880, 28.682, 4500), (83.925, 28.672, 4000), (83.970, 28.666, 3700), (84.022, 28.667, 3540),
                   (84.100, 28.646, 3300), (84.170, 28.616, 3200), (84.245, 28.560, 2700), (84.330, 28.530, 2300),
                   (84.380, 28.480, 1900)],
    "madi": [(84.110, 28.470, 2600), (84.130, 28.400, 1500), (84.150, 28.330, 1000), (84.170, 28.250, 750)],
    "thini": [(83.760, 28.760, 3600), (83.725, 28.775, 2760)],
}
RIO_ANCHO = dict(kali=1.5, modi=1.25, seti=1.2, marsyangdi=1.3, madi=1.0)

# Lagos: (longitud, latitud, semieje este-oeste km, semieje norte-sur km, giro°, altitud)
LAGOS = [
    (83.945, 28.214, 2.3, 0.75, -24, 742),   # Phewa (Pokhara)
    (83.857, 28.690, 0.8, 1.9, 8, 4919),     # Tilicho
]

# Glaciares del Santuario y de la cara norte: lenguas pálidas valle abajo.
# Nubes: (longitud, latitud, tamaño en km). Lejos de la ruta, para no taparla.
NUBES = [
    (83.585, 28.468, 3.0), (84.250, 28.352, 3.6), (84.045, 28.305, 2.6), (83.610, 28.305, 2.3),
    (84.285, 28.610, 2.8), (83.935, 28.338, 2.0), (83.705, 28.232, 2.4), (83.722, 28.508, 1.9),
    (83.935, 28.722, 2.2), (84.180, 28.672, 2.0),
]

GLACIARES = [
    [(83.832, 28.578), (83.848, 28.560), (83.866, 28.545)],   # Annapurna Sur
    [(83.818, 28.545), (83.840, 28.540), (83.862, 28.542)],   # Annapurna Oeste
    [(83.905, 28.590), (83.893, 28.565), (83.885, 28.545)],   # Tent Peak
    [(83.830, 28.615), (83.812, 28.628)],                      # Annapurna Norte
    [(83.975, 28.612), (83.992, 28.640)],                      # Gangapurna
]


def km(lon, lat):
    return (lon - LON0) * KX, (lat - LAT0) * KY


# ───────────────────────── utilidades ─────────────────────────
def paso(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def ruido(shape, rng, escala, octavas=5, caida=0.5, estirar=(1.0, 1.0), giro=0.0):
    """Ruido fractal por filtrado en frecuencia; sale en [0, 1] y es repetible."""
    h, w = shape
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.rfftfreq(w)[None, :] * w
    c, s = math.cos(giro), math.sin(giro)
    u = (fx * c + fy * s) * estirar[0]
    v = (-fx * s + fy * c) * estirar[1]
    r = np.sqrt(u * u + v * v)
    total = np.zeros(shape, np.float32)
    amp, f0 = 1.0, max(h, w) / escala
    for _ in range(octavas):
        blanco = np.fft.rfft2(rng.standard_normal(shape).astype(np.float32))
        banda = np.exp(-((r - f0) ** 2) / (2 * (f0 * 0.45) ** 2))
        capa = np.fft.irfft2(blanco * banda, s=shape).astype(np.float32)
        capa /= capa.std() + 1e-6
        total += amp * capa
        amp *= caida
        f0 *= 2
    total -= total.min()
    return total / total.max()


def igualar(a):
    """Reparte los valores de forma uniforme en [0, 1] (para umbrales previsibles)."""
    orden = np.argsort(a, axis=None)
    out = np.empty(a.size, np.float32)
    out[orden] = np.linspace(0, 1, a.size, dtype=np.float32)
    return out.reshape(a.shape)


def dist_segmento(X, Y, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy + 1e-9
    t = np.clip(((X - ax) * dx + (Y - ay) * dy) / L2, 0, 1)
    d = np.hypot(X - (ax + t * dx), Y - (ay + t * dy))
    return d, t


# ───────────────────────── el terreno ─────────────────────────
def suavizar(pts, n=6):
    """Catmull-Rom: pasa por todos los puntos y redondea las esquinas."""
    P = np.array(pts, np.float32)
    if len(P) < 3:
        return [tuple(p) for p in P]
    Q = np.vstack([P[0], P, P[-1]])
    out = []
    for i in range(1, len(Q) - 2):
        p0, p1, p2, p3 = Q[i - 1], Q[i], Q[i + 1], Q[i + 2]
        for t in np.linspace(0, 1, n, endpoint=False):
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-1])
    return [tuple(p) for p in out]


def de_crestas(a):
    return 1 - np.abs(2 * a - 1)


def espolones(cadena, rng, nivel=0):
    """Hijos de una arista: lomas que bajan a un lado y a otro, cada una con las suyas."""
    hijos = []
    lado = 1 if rng.random() < 0.5 else -1
    separacion = (1.25, 2.1) if nivel == 0 else (0.7, 1.3)
    sig = rng.uniform(0.3, separacion[1])
    hecho = 0.0
    for (ax, ay, az), (bx, by, bz) in zip(cadena, cadena[1:]):
        L = math.hypot(bx - ax, by - ay)
        if L < 1e-6:
            continue
        ux, uy = (bx - ax) / L, (by - ay) / L
        while sig < hecho + L:
            t = (sig - hecho) / L
            x, y, z = ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t
            giro = rng.normal(0, 0.38)
            nx, ny = -uy * lado, ux * lado
            dx = nx * math.cos(giro) - ny * math.sin(giro)
            dy = nx * math.sin(giro) + ny * math.cos(giro)
            alto = max(0.0, z - 1200) / 5500
            largo = (rng.uniform(1.5, 4.4) if nivel == 0 else rng.uniform(0.6, 1.5)) * (0.55 + 0.6 * alto)
            pasos = 4 if nivel == 0 else 2
            z0 = z - (140 if nivel == 0 else 90)
            caida_total = largo * rng.uniform(560, 900) * (0.55 + 0.75 * alto)
            hijo = [(x, y, z0)]
            for i in range(1, pasos + 1):
                g = rng.normal(0, 0.24)
                dx, dy = dx * math.cos(g) - dy * math.sin(g), dx * math.sin(g) + dy * math.cos(g)
                x, y = x + dx * largo / pasos, y + dy * largo / pasos
                hijo.append((x, y, z0 - caida_total * (i / pasos) ** 0.85))
            hijos.append(hijo)
            if nivel == 0:
                hijos.extend(espolones(hijo, rng, 1))
            lado = -lado
            sig += rng.uniform(*separacion)
        hecho += L
    return hijos


def terreno(encuadre, w, h, rng):
    lon_a, lon_b = encuadre["lon"]
    ancho_km = (lon_b - lon_a) * KX
    alto_km = ancho_km * h / w
    lat_c = encuadre["lat_centro"]
    x0 = (lon_a - LON0) * KX
    y1 = (lat_c - LAT0) * KY + alto_km / 2          # borde norte
    xs = x0 + (np.arange(w, dtype=np.float32) + 0.5) / w * ancho_km
    ys = y1 - (np.arange(h, dtype=np.float32) + 0.5) / h * alto_km
    X, Y = np.meshgrid(xs, ys)
    ppk = w / ancho_km                               # píxeles por kilómetro
    sh = (h, w)

    r_gr = ruido(sh, rng, 9.0 * ppk, 4)
    r1 = ruido(sh, rng, 4.2 * ppk, 5, 0.55)
    r2 = ruido(sh, rng, 1.7 * ppk, 4, 0.55)
    r3 = ruido(sh, rng, 0.7 * ppk, 3, 0.6)
    c1, c2, c3 = de_crestas(r1), de_crestas(r2), de_crestas(r3)

    # un temblor del plano: ni las crestas ni los ríos son rectos
    tx = (ruido(sh, rng, 4.0 * ppk, 3) - 0.5)
    ty = (ruido(sh, rng, 4.0 * ppk, 3) - 0.5)
    Xc, Yc = X + 0.7 * tx, Y + 0.7 * ty            # crestas (hasta ~0,3 km)
    Xr, Yr = X + 0.7 * ty, Y + 0.7 * tx            # ríos

    # Suelo regional: tierras bajas al sur, altiplano de Manang al norte, con lomas.
    lat = LAT0 + Y / KY
    base = (760 + 800 * paso(28.20, 28.38, lat) + 900 * paso(28.36, 28.52, lat)
            + 1500 * paso(28.52, 28.68, lat) + 500 * paso(28.68, 28.80, lat))
    base = base + 420 * (r_gr - 0.5) + (c1 - 0.5) * 620 + (c2 - 0.5) * 240

    # El esqueleto: aristas principales y sus espolones. Cada tramo es una
    # cresta que cae con la distancia; solo se calcula en su vecindad.
    rng_e = np.random.default_rng(1950)              # el mismo esqueleto en los dos encuadres
    principales = [[(*km(lo, la), z) for lo, la, z in cadena] for cadena in ARISTAS]
    tramos = []
    for cadena in principales:
        for a, b in zip(cadena, cadena[1:]):
            tramos.append((a, b, True))
        for hijo in espolones(cadena, rng_e):
            for a, b in zip(hijo, hijo[1:]):
                tramos.append((a, b, False))
    cresta = np.full(sh, -9999, np.float32)
    px = ancho_km / w
    for (ax, ay, az), (bx, by, bz), principal in tramos:
        radio = 9.0 if principal else 3.6
        i0 = int((min(ax, bx) - radio - x0) / px); i1 = int((max(ax, bx) + radio - x0) / px) + 1
        j0 = int((y1 - max(ay, by) - radio) / px); j1 = int((y1 - min(ay, by) + radio) / px) + 1
        i0, i1, j0, j1 = max(i0, 0), min(i1, w), max(j0, 0), min(j1, h)
        if i0 >= i1 or j0 >= j1:
            continue
        v = (slice(j0, j1), slice(i0, i1))
        d, t = dist_segmento(Xc[v], Yc[v], (ax, ay), (bx, by))
        alt = az + (bz - az) * t
        if principal:
            alt = alt - (0.10 * abs(bz - az) + 110) * np.sin(np.pi * t)   # collado entre cimas
        caida = (2350 if principal else 1650) * d ** 0.92 * (0.82 + 0.36 * r2[v]) * (0.55 + 0.45 * paso(2000, 6500, alt))
        np.maximum(cresta[v], alt - caida, out=cresta[v])

    # los valles altos (Santuario, Miristi, Manang) no se hunden hasta el suelo regional
    suelo = np.full(sh, -9999, np.float32)
    for cauce in RIOS.values():
        pts = suavizar([(*km(lo, la), z) for lo, la, z in cauce], 3)
        for (ax, ay, az), (bx, by, bz) in zip(pts, pts[1:]):
            if max(az, bz) < 2400:
                continue
            d, t = dist_segmento(X, Y, (ax, ay), (bx, by))
            np.maximum(suelo, az + (bz - az) * t - 230 * d - 40 * d * d, out=suelo)
    base = np.maximum(base, suelo)

    alt = np.maximum(base, cresta)
    relieve = np.clip(alt - 1400, 0, None)
    alt = alt + (c2 - 0.55) * (90 + 0.035 * relieve) + (c3 - 0.5) * (50 + 0.02 * relieve)

    # Valles: nada cerca de un río puede quedar por encima de su ladera.
    tapa = np.full(sh, 99999, np.float32)
    d_rio = np.full(sh, 999, np.float32)
    for nombre, cauce in RIOS.items():
        pts = suavizar([(*km(lo, la), z) for lo, la, z in cauce])
        for (ax, ay, az), (bx, by, bz) in zip(pts, pts[1:]):
            d, t = dist_segmento(Xr, Yr, (ax, ay), (bx, by))
            z = az + (bz - az) * t
            np.minimum(tapa, z + 860 * d ** 1.2 * (0.75 + 0.5 * c2) + 50 * d, out=tapa)
            np.minimum(d_rio, d / RIO_ANCHO.get(nombre, 0.8), out=d_rio)
    alt = np.minimum(alt, tapa)

    # Lagos: planos.
    lago = np.zeros(sh, np.float32)
    for lo, la, sa, sb, giro, z in LAGOS:
        cx, cy = km(lo, la)
        c, s = math.cos(math.radians(giro)), math.sin(math.radians(giro))
        u = ((X - cx) * c + (Y - cy) * s) / sa
        v = (-(X - cx) * s + (Y - cy) * c) / sb
        borde = u * u + v * v + 0.55 * (r2 - 0.5) + 0.3 * (r1 - 0.5)
        m = paso(1.06, 0.94, borde)
        alt = alt * (1 - m) + z * m
        np.maximum(lago, m, out=lago)

    d_glaciar = np.full(sh, 999, np.float32)
    for lengua in GLACIARES:
        pts = suavizar([km(lo, la) for lo, la in lengua])
        for a, b in zip(pts, pts[1:]):
            d, _ = dist_segmento(Xr, Yr, a, b)
            np.minimum(d_glaciar, d, out=d_glaciar)

    return dict(alt=alt, d_rio=d_rio, lago=lago, d_glaciar=d_glaciar, ppk=ppk,
                marco=(x0, y1, ancho_km, alto_km), r1=r1, r2=r2, r3=r3, r_gr=r_gr)


# ───────────────────────── el color ─────────────────────────
def rgb(*c):
    return np.array(c, np.float32) / 255.0


# Tomados de las pinturas del kit (y de la paleta de marca cuando coincide).
NIEVE = rgb(244, 241, 232)
SOMBRA_NIEVE = rgb(108, 121, 160)
SOMBRA_HONDA = rgb(66, 74, 108)
ROCA_SOL = rgb(158, 124, 92)
ROCA_SOMBRA = rgb(96, 88, 96)
MORRENA = rgb(180, 167, 152)
PARAMO = rgb(146, 138, 100)
BOSQUE = rgb(78, 112, 80)
BOSQUE_HONDO = rgb(52, 80, 66)
PRADERA = rgb(118, 142, 70)
CULTIVO = rgb(150, 158, 88)
TRIGAL = rgb(176, 160, 96)
AGUA = rgb(142, 186, 200)
RIO = rgb(150, 182, 198)
TINTA = rgb(34, 36, 47)
RODODENDRO = rgb(184, 52, 63)


def mezcla(a, b, t):
    return a + (b - a) * t[..., None]


def colorear(T, rng):
    alt = T["alt"]
    h, w = alt.shape
    ppk = T["ppk"]
    paso_m = 1000.0 / ppk
    gy, gx = np.gradient(alt)
    gx, gy = gx / paso_m, gy / paso_m
    pend = np.hypot(gx, gy)

    def lambert(lx, ly, lz, exag):
        nx, ny = -gx * exag, -gy * exag
        n = np.sqrt(nx * nx + ny * ny + 1)
        return np.clip((nx * lx + ny * ly + lz) / n, 0, 1)

    # luz del noroeste, alta y suave, con un relleno desde el oeste
    luz = 0.8 * lambert(-0.52, -0.60, 0.61, 1.0) + 0.2 * lambert(-0.78, 0.05, 0.62, 0.9)
    luz = paso(0.22, 0.88, luz)

    r1, r2, r3 = T["r1"], T["r2"], T["r3"]
    fino = r3
    manchas = ruido((h, w), rng, 3.0 * ppk, 3)
    parcelas = ruido((h, w), rng, 1.1 * ppk, 2)

    # pisos de vegetación
    cultivo = mezcla(PRADERA, CULTIVO, paso(0.30, 0.70, manchas))
    cultivo = mezcla(cultivo, TRIGAL, paso(0.60, 0.85, parcelas) * 0.6)
    bosque = mezcla(BOSQUE_HONDO, BOSQUE, paso(0.2, 0.75, manchas * 0.6 + fino * 0.4))
    paramo = mezcla(PARAMO, MORRENA, paso(0.35, 0.8, fino * 0.5 + manchas * 0.5))
    paramo = mezcla(paramo, rgb(112, 122, 84), paso(0.55, 0.2, manchas) * 0.5)
    roca = mezcla(MORRENA, rgb(151, 137, 133), paso(0.3, 0.7, manchas))

    z = alt + 300 * (r2 - 0.5)
    col = cultivo
    col = mezcla(col, bosque, paso(1650, 2100, z + 500 * (manchas - 0.5)))
    col = mezcla(col, paramo, paso(3300, 3750, z))
    col = mezcla(col, roca, paso(4150, 4650, z))

    # sombreado de la tierra: la umbría se enfría, no se apaga
    tierra = col * (0.60 + 0.54 * luz[..., None])
    tierra = mezcla(tierra, tierra * 0.6 + SOMBRA_HONDA * 0.4, (1 - luz) * 0.55)

    # nieve: blanca al sol, azul pizarra a la sombra; roca donde es muy empinado
    nieve = mezcla(rgb(138, 152, 190), NIEVE, paso(0.22, 0.60, luz))
    nieve = mezcla(nieve, SOMBRA_NIEVE * 0.92, paso(0.16, 0.0, luz) * 0.8)
    empinado = paso(1.25, 2.1, pend) * paso(0.45, 0.75, fino * 0.5 + r1 * 0.5)
    pared = mezcla(ROCA_SOMBRA, ROCA_SOL, paso(0.25, 0.65, luz))
    nieve = mezcla(nieve, pared, empinado * 0.8)
    cota = 4900 + 520 * (r1 - 0.5) - 380 * (luz - 0.5)
    nevado = paso(-260, 200, z - cota)
    col = mezcla(tierra, nieve, nevado)

    # glaciares: lenguas grises con morrena
    g = paso(1.0, 0.25, T["d_glaciar"] + 0.45 * (r2 - 0.5)) * paso(3800, 4100, alt)
    hielo = mezcla(rgb(190, 198, 210), rgb(234, 233, 228), paso(0.3, 0.7, fino))
    hielo = mezcla(hielo, MORRENA * 0.86, paso(0.66, 0.86, r2) * 0.75)
    col = mezcla(col, hielo * (0.80 + 0.24 * luz[..., None]), g * 0.92)

    # bruma en los fondos de valle bajos, como en las pinturas
    hondo = paso(1.3, 0.2, T["d_rio"]) * paso(2500, 1200, alt) * paso(0.45, 0.8, manchas)
    col = mezcla(col, rgb(214, 218, 216), hondo * 0.30)

    # agua
    ancho = 0.07 + 0.05 * paso(3000, 900, alt)
    rio = paso(ancho, ancho * 0.35, T["d_rio"]) * paso(4250, 3900, alt)
    col = mezcla(col, RIO * (0.86 + 0.16 * fino[..., None]), rio * 0.9)
    col = mezcla(col, mezcla(AGUA * 0.84, AGUA * 1.04, paso(0.3, 0.7, fino)), T["lago"])

    # dirección del pincel: ladera abajo; en bancales, siguiendo la curva de nivel
    x0, y1, ak, hk = T["marco"]
    XX, YY = np.meshgrid(x0 + (np.arange(w) + 0.5) / w * ak, y1 - (np.arange(h) + 0.5) / h * hk)
    ang = np.arctan2(gy, gx)
    bancal = paso(1950, 1650, z) * paso(0.04, 0.22, pend)
    ang = ang + bancal * (math.pi / 2)
    ang = np.where(pend < 0.035, -0.2, ang)
    ang = np.where(T["lago"] > 0.5, 0.05, ang)

    # nubes: cúmulos blancos con la panza lavanda y su sombra sobre el terreno
    rng_n = np.random.default_rng(55)
    bulto = np.zeros((h, w), np.float32)
    for lo, la, tam in NUBES:
        cx, cy = km(lo, la)
        for _ in range(int(rng_n.integers(8, 13))):
            ox, oy = rng_n.normal(0, 0.62 * tam), rng_n.normal(0, 0.24 * tam)
            r = rng_n.uniform(0.22, 0.46) * tam * (1 - 0.35 * min(1, abs(ox) / (1.2 * tam)))
            if not (x0 - 3 < cx + ox < x0 + ak + 3 and y1 - hk - 3 < cy + oy < y1 + 3):
                continue
            d2 = ((XX - cx - ox) ** 2 + (YY - cy - oy) ** 2) / (r * r)
            np.maximum(bulto, np.sqrt(np.clip(1 - d2, 0, 1)) * r, out=bulto)
    nube = paso(0.02, 0.16, bulto + 0.10 * (fino - 0.5))
    by_, bx_ = np.gradient(bulto)
    bx_, by_ = bx_ * ppk, by_ * ppk
    bn = np.sqrt(bx_ * bx_ + by_ * by_ + 1)
    bl = paso(0.30, 0.86, np.clip((-bx_ * -0.52 + -by_ * -0.60 + 0.61) / bn, 0, 1))
    blanco = mezcla(rgb(150, 156, 186), rgb(247, 245, 239), bl)
    blanco = mezcla(blanco, rgb(188, 190, 208), paso(0.5, 0.2, bl) * 0.5)
    corr = int(round(0.95 * ppk))
    sombra = np.roll(np.roll(nube, corr, axis=0), corr, axis=1)
    col = col * (1 - 0.34 * sombra[..., None] * (1 - nube[..., None]))
    col = mezcla(col, blanco, nube)
    ang = np.where(nube > 0.5, np.arctan2(by_, bx_) + math.pi / 2, ang)

    flor = np.zeros((h, w), np.float32)

    return dict(col=np.clip(col, 0, 1), ang=ang.astype(np.float32), flor=flor, luz=luz, alt=alt,
                nevado=np.maximum(nevado, nube), agua=np.maximum(rio, T["lago"]))


# ───────────────────────── la pintura ─────────────────────────
def pintar(C, W, H, rng, densidad=1.0):
    """Pinceladas opacas a doble tamaño, de más grandes a más pequeñas."""
    S = 2
    col, ang = C["col"], C["ang"]
    h, w = col.shape[:2]
    lienzo = Image.new("RGB", (W * S, H * S), (34, 36, 47))
    d = ImageDraw.Draw(lienzo)
    u = W / 3840.0 if W >= H else W / 1620.0     # tamaño del trazo relativo al original

    # (largo, ancho, pinceladas por megapíxel, variación de color, temblor del ángulo)
    capas = [
        (70, 22, 2400, 0.040, 0.28),
        (38, 9, 11000, 0.050, 0.22),
        (24, 4.2, 30000, 0.055, 0.18),
        (15, 2.2, 52000, 0.050, 0.16),
    ]
    for largo, ancho, por_mp, var, temblor in capas:
        n = int(por_mp * W * H / 1e6 * densidad)
        x = rng.uniform(0, w, n)
        y = rng.uniform(0, h, n)
        xi = np.clip(x.astype(int), 0, w - 1)
        yi = np.clip(y.astype(int), 0, h - 1)
        c = col[yi, xi]
        # variación: un poco de claridad y un poco de matiz, como pigmento mal mezclado
        claro = rng.normal(0, var, (n, 1)).astype(np.float32)
        matiz = rng.normal(0, var * 0.45, (n, 3)).astype(np.float32)
        c = np.clip(c * (1 + claro) + matiz, 0, 1)
        nev = C["nevado"][yi, xi]
        th = ang[yi, xi] + rng.normal(0, temblor, n) + (nev > 0.5) * rng.normal(0, 0.25, n)
        L = largo * u * rng.uniform(0.55, 1.35, n) * (1 - 0.35 * (C["agua"][yi, xi] > 0.4))
        dx, dy = np.cos(th) * L / 2, np.sin(th) * L / 2
        X0, Y0 = (x / w * W - dx) * S, (y / h * H - dy) * S
        X1, Y1 = (x / w * W + dx) * S, (y / h * H + dy) * S
        cc = (c * 255).astype(np.uint8)
        grosor = max(1, int(round(ancho * u * S)))
        for i in range(n):
            d.line((X0[i], Y0[i], X1[i], Y1[i]), fill=(int(cc[i, 0]), int(cc[i, 1]), int(cc[i, 2])), width=grosor)

    # motas de rododendro
    flor = C["flor"]
    n = int(9000 * W * H / 1e6 * densidad)
    x, y = rng.uniform(0, w, n), rng.uniform(0, h, n)
    ok = rng.uniform(0, 1, n) < flor[np.clip(y.astype(int), 0, h - 1), np.clip(x.astype(int), 0, w - 1)] * 2.2
    for xi, yi in zip(x[ok] / w * W * S, y[ok] / h * H * S):
        r = rng.uniform(1.6, 3.4) * u * S
        t = rng.uniform(0.75, 1.1)
        d.ellipse((xi - r, yi - r, xi + r, yi + r), fill=(int(184 * t), int(52 * t), int(63 * t)))

    return lienzo.resize((W, H), Image.LANCZOS)


def a_lo_ancho(m, n):
    out = m.copy()
    for k in range(1, n):
        np.maximum(out, np.roll(m, k, axis=1), out=out)
    return out


def grano(img, rng):
    """El papel: motas y hebras oscuras donde el pincel seco no llegó, y tiza clara."""
    a = np.asarray(img).astype(np.float32) / 255.0
    H, W = a.shape[:2]
    u = W / 3840.0 if W >= H else W / 1620.0
    nubes = ruido((H, W), rng, 60 * u, 3)                      # dónde el papel asoma más
    azar = rng.random((H, W), dtype=np.float32)
    mota = (azar > 0.972 - 0.02 * nubes).astype(np.float32)
    mota = np.maximum(mota, a_lo_ancho((rng.random((H, W), dtype=np.float32) > 0.988).astype(np.float32), 2))
    hebra = a_lo_ancho((rng.random((H, W), dtype=np.float32) > 0.9972).astype(np.float32), int(9 * u) + 3)
    hebra = np.maximum(hebra, a_lo_ancho((rng.random((H, W), dtype=np.float32) > 0.9988).astype(np.float32), int(22 * u) + 4))
    oscuro = np.maximum(mota * 0.62, hebra * 0.55)
    lum = a.mean(axis=2)
    oscuro = oscuro * (0.45 + 0.55 * paso(0.2, 0.75, lum))       # se nota más sobre lo claro
    oscuro = np.asarray(Image.fromarray((oscuro * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.45))) / 255.0
    a = a * (1 - oscuro[..., None]) + (TINTA * 1.1) * oscuro[..., None]
    tiza = a_lo_ancho((rng.random((H, W), dtype=np.float32) > 0.985).astype(np.float32), 2)
    tiza = np.asarray(Image.fromarray((tiza * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.5))) / 255.0
    a = a + 0.20 * tiza[..., None] * (1 - a)
    a = a * (1 + 0.03 * rng.standard_normal((H, W, 1)).astype(np.float32))
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))


def hacer_mapa(cual):
    enc = ENCUADRES[cual]
    W, H = enc["px"]
    rng = np.random.default_rng(1950)
    w, h = W // 2, H // 2
    T = terreno(enc, w, h, rng)
    C = colorear(T, rng)
    x0, y1, ak, hk = T["marco"]
    lat_n = LAT0 + y1 / KY
    lat_s = LAT0 + (y1 - hk) / KY
    print(f"{cual}: {W}×{H}  lon {enc['lon'][0]}–{enc['lon'][1]}  lat {lat_s:.4f}–{lat_n:.4f}", flush=True)
    img = grano(pintar(C, W, H, rng), rng)
    SALIDA.mkdir(exist_ok=True)
    if cual == "horizontal":
        img.save(SALIDA / "mapa-3840.webp", quality=80, method=6)
        img.resize((2560, 1440), Image.LANCZOS).save(SALIDA / "mapa-2560.webp", quality=82, method=6)
        img.resize((1280, 720), Image.LANCZOS).save(SALIDA / "mapa-1280.webp", quality=82, method=6)
    else:
        img.resize((1080, round(1080 * H / W)), Image.LANCZOS).save(SALIDA / "mapa-movil-1080.webp", quality=82, method=6)
        img.save(SALIDA / "mapa-movil-1620.webp", quality=80, method=6)


def hacer_brocha():
    """Textura repetible de pincel seco: decide por dónde entra la pintura nueva."""
    rng = np.random.default_rng(8091)
    n = 512
    largo = igualar(ruido((n, n), rng, 150, 4, 0.55, estirar=(0.07, 1.0), giro=-0.21))
    cerda = igualar(ruido((n, n), rng, 22, 3, 0.6, estirar=(0.10, 1.0), giro=-0.21))
    mota = igualar(ruido((n, n), rng, 5, 2, 0.6))
    # R: mechones largos · G: cerdas finas · B: grano del papel
    img = np.stack([largo, cerda, mota], axis=2)
    Image.fromarray((img * 255).astype(np.uint8)).save(SALIDA / "brocha.webp", quality=90, method=6)
    print("brocha.webp")


if __name__ == "__main__":
    for cual in sys.argv[1:] or ["horizontal", "vertical", "brocha"]:
        if cual == "brocha":
            hacer_brocha()
        else:
            hacer_mapa(cual)
