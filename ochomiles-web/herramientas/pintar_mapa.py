#!/usr/bin/env python3
"""
Pinta el mapa de la antesala «Los 14 ochomiles»: el arco del Himalaya y el Karakórum,
del Nanga Parbat al Kangchenjunga, a pincel seco sobre papel oscuro, de noche.

Sigue la especificación «pincel seco sobre fondo oscuro» de la serie (README del Annapurna):

    relieve real → imagen objetivo T + mapa de regiones
                 → campo de orientación θ (tensor de estructura)
                 → pintor de trazos (5 pasadas, de gruesa a fina) sobre lienzo a 2×
                 → reducción LANCZOS
                 → acabado: temblor, lavado, grano, fondo oscuro, tiza, borde, viñeta

El cuadro es una vista cenital, así que no hay cielo ni primer plano: el papel lo pone el
terreno. Variante «noche» del §2.3/§7.7: la montaña es luz de luna sobre nieve y las
llanuras quedan hundidas, para que la tipografía clara de la página se lea encima.

Datos:
  · Relieve: AWS Terrain Tiles (Terrarium, z8; SRTM, GMTED2010, ETOPO1…).
    Atribución: https://github.com/tilezen/joerd/blob/master/docs/attribution.md
  · Ríos y lagos: Natural Earth 1:10m (dominio público).

Uso:
    python3 herramientas/pintar_mapa.py            # 3840×2560 → assets/mapa-*.webp + mapa.json
    python3 herramientas/pintar_mapa.py 1920        # ensayo rápido a 1920×1280 (no toca assets/)

Necesita numpy, opencv-python-headless, Pillow y pyproj.
"""
import json
import math
import os
import ssl
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from pyproj import Transformer

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
CACHE = Path(os.environ.get("OCHOMILES_CACHE", AQUI / ".cache"))
SALIDA = RAIZ / "assets"

# ───────────────────────── geografía ─────────────────────────
# Lambert cónica conforme centrada en el arco (la misma que usó la película «14 cumbres»).
LCC = "+proj=lcc +lat_1=27 +lat_2=37 +lat_0=31 +lon_0=81 +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs"
_ida = Transformer.from_crs("EPSG:4326", LCC, always_xy=True)
_vuelta = Transformer.from_crs(LCC, "EPSG:4326", always_xy=True)

CENTRO = (60e3, 100e3)          # metros LCC
EXTENSION = (1950e3, 1300e3)    # 3:2
X0 = CENTRO[0] - EXTENSION[0] / 2
Y1 = CENTRO[1] + EXTENSION[1] / 2

# Cumbres: coordenadas de la cima sobre el modelo de terreno (config/peaks.json de «14 cumbres»).
PICOS = [
    ("everest", "Everest", 8849, 27.98904, 86.92555),
    ("k2", "K2", 8611, 35.88072, 76.51250),
    ("kangchenjunga", "Kangchenjunga", 8586, 27.70277, 88.14758),
    ("lhotse", "Lhotse", 8516, 27.96178, 86.93243),
    ("makalu", "Makalu", 8485, 27.89146, 87.08851),
    ("cho-oyu", "Cho Oyu", 8188, 28.09697, 86.66023),
    ("dhaulagiri", "Dhaulagiri I", 8167, 28.69792, 83.48948),
    ("manaslu", "Manaslu", 8163, 28.55070, 84.55921),
    ("nanga-parbat", "Nanga Parbat", 8126, 35.23855, 74.58931),
    ("annapurna", "Annapurna I", 8091, 28.59619, 83.81952),
    ("gasherbrum-i", "Gasherbrum I", 8080, 35.72497, 76.69837),
    ("broad-peak", "Broad Peak", 8051, 35.81142, 76.56680),
    ("gasherbrum-ii", "Gasherbrum II", 8035, 35.75753, 76.65261),
    ("shishapangma", "Shishapangma", 8027, 28.35225, 85.78146),
]

# Rótulos de la página (no se pintan: los pone el HTML encima, en Archivo).
# (id, texto, tipo, [(lon, lat) que marcan el eje del rótulo])
ROTULOS = [
    ("himalaya", "Himalaya", "cordillera", [(76.15, 32.2), (79.55, 29.8)]),
    ("karakorum", "Karakórum", "cordillera", [(75.15, 35.88), (76.25, 35.42)]),
    ("meseta", "Meseta tibetana", "region", [(83.6, 32.6), (88.4, 32.4)]),
    ("indo", "Indo", "rio", [(73.35, 35.3), (74.1, 35.62)]),
    ("tsangpo", "Yarlung Tsangpo", "rio", [(88.9, 29.36), (90.9, 29.3)]),
]


def a_lcc(lon, lat):
    return _ida.transform(lon, lat)


def a_uv(lon, lat):
    x, y = a_lcc(lon, lat)
    return (x - X0) / EXTENSION[0], (Y1 - y) / EXTENSION[1]


# ───────────────────────── utilidades (§1.3) ─────────────────────────
def paso(a, b, x):
    """smoothstep; con a > b funciona como rampa invertida."""
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def mezcla(a, b, t):
    """mix(a, b, t); un color (3,) o una imagen (H, W, 3) contra una máscara (H, W)."""
    t = np.asarray(t, np.float32)
    if t.ndim == 2 and (np.shape(a)[-1:] == (3,) or np.shape(b)[-1:] == (3,)):
        t = t[..., None]
    return a + (b - a) * t


def rgb(*c):
    return np.array(c, np.float32)


def ruido_valor(shape, f, rng, sx=1.0, sy=1.0):
    """Rejilla aleatoria reescalada con bicúbica. f = celdas por unit (unit = √(W·H))."""
    H, W = shape
    unit = math.sqrt(W * H)
    gw = max(2, int(math.ceil(f * sx * W / unit)) + 2)
    gh = max(2, int(math.ceil(f * sy * H / unit)) + 2)
    g = rng.random((gh, gw), dtype=np.float32)
    # se agranda un poco más de lo necesario y se recorta con desplazamiento al azar,
    # para que los nodos de la rejilla no caigan siempre en el mismo sitio
    big = cv2.resize(g, (int(W * gw / (gw - 1.5)) + 2, int(H * gh / (gh - 1.5)) + 2), interpolation=cv2.INTER_CUBIC)
    ox = int(rng.integers(0, big.shape[1] - W + 1))
    oy = int(rng.integers(0, big.shape[0] - H + 1))
    return np.clip(big[oy:oy + H, ox:ox + W], 0.0, 1.0)


def fbm(shape, f, octavas, rng, sx=1.0, sy=1.0, tipo="valor"):
    total = np.zeros(shape, np.float32)
    amp, suma = 1.0, 0.0
    for o in range(octavas):
        n = ruido_valor(shape, f * 2 ** o, rng, sx, sy)
        if tipo == "ridged":
            n = 1 - np.abs(2 * n - 1)
        elif tipo == "billow":
            n = np.abs(2 * n - 1)
        total += amp * n
        suma += amp
        amp *= 0.5
    return total / suma


def desenfoque(a, sigma):
    if sigma <= 0.05:
        return a
    return cv2.GaussianBlur(a, (0, 0), sigmaX=float(sigma), sigmaY=float(sigma), borderType=cv2.BORDER_REFLECT)


def luminancia(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


# ───────────────────────── relieve (Terrain Tiles) ─────────────────────────
URL_TESELA = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
_ssl = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE") or None)


def bajar(url, destino):
    if destino.exists():
        return
    destino.parent.mkdir(parents=True, exist_ok=True)
    for intento in range(5):
        try:
            with urllib.request.urlopen(url, context=_ssl, timeout=60) as r:
                datos = r.read()
            tmp = destino.with_suffix(destino.suffix + ".part")
            tmp.write_bytes(datos)
            tmp.replace(destino)
            return
        except Exception:
            if intento == 4:
                raise
            time.sleep(1.5 * (intento + 1))


def tesela_xy(lon, lat, z):
    n = 2 ** z
    return (lon + 180.0) / 360.0 * n, (1.0 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2.0 * n


def relieve(W, H, z=8):
    """Altitud (m) en la rejilla LCC del cuadro, muestreada de las teselas Terrarium."""
    px = EXTENSION[0] / W
    xs = X0 + (np.arange(W) + 0.5) * px
    ys = Y1 - (np.arange(H) + 0.5) * px
    XX, YY = np.meshgrid(xs, ys)
    lon, lat = _vuelta.transform(XX, YY)
    lon = lon.astype(np.float64)
    lat = lat.astype(np.float64)
    tx, ty = tesela_xy(lon, lat, z)
    tx0, tx1 = int(np.floor(tx.min())), int(np.floor(tx.max()))
    ty0, ty1 = int(np.floor(ty.min())), int(np.floor(ty.max()))
    trabajos = [(x, y) for y in range(ty0, ty1 + 1) for x in range(tx0, tx1 + 1)]
    print(f"  relieve: {len(trabajos)} teselas z{z}", flush=True)

    def una(xy):
        x, y = xy
        ruta = CACHE / "terrarium" / str(z) / str(x) / f"{y}.png"
        bajar(URL_TESELA.format(z=z, x=x, y=y), ruta)
        a = np.asarray(Image.open(ruta).convert("RGB")).astype(np.float32)
        return a[..., 0] * 256.0 + a[..., 1] + a[..., 2] / 256.0 - 32768.0

    with ThreadPoolExecutor(12) as ex:
        teselas = list(ex.map(una, trabajos))
    nx, ny = tx1 - tx0 + 1, ty1 - ty0 + 1
    mosaico = np.zeros((ny * 256, nx * 256), np.float32)
    for (x, y), t in zip(trabajos, teselas):
        mosaico[(y - ty0) * 256:(y - ty0 + 1) * 256, (x - tx0) * 256:(x - tx0 + 1) * 256] = t
    mx = ((tx - tx0) * 256 - 0.5).astype(np.float32)
    my = ((ty - ty0) * 256 - 0.5).astype(np.float32)
    alt = cv2.remap(mosaico, mx, my, interpolation=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    alt = np.maximum(alt, -50)
    # los saltos sueltos de las teselas (huecos rellenos, picos falsos) se suavizan con una mediana
    alt = cv2.medianBlur(alt, 3)
    return alt, lon.astype(np.float32), lat.astype(np.float32), px


# ───────────────────────── agua (Natural Earth) ─────────────────────────
URL_NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/{}.geojson"


def agua(W, H, px):
    rios = np.zeros((H, W), np.float32)
    lagos = np.zeros((H, W), np.float32)
    k = W / 3840.0

    def a_px(coords):
        c = np.asarray(coords, np.float64)
        x, y = a_lcc(c[:, 0], c[:, 1])
        return np.stack([(np.asarray(x) - X0) / px, (Y1 - np.asarray(y)) / px], axis=1)

    def dentro(c):
        return any(66 < x < 98 and 20 < y < 42 for x, y in c)

    ruta = CACHE / "ne" / "ne_10m_rivers_lake_centerlines.geojson"
    bajar(URL_NE.format("ne_10m_rivers_lake_centerlines"), ruta)
    for f in json.loads(ruta.read_text())["features"]:
        g = f["geometry"]
        if not g:
            continue
        lineas = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
        rango = f["properties"].get("scalerank") or 10
        grosor = 4.2 if rango <= 3 else 3.0 if rango <= 6 else 2.1 if rango <= 9 else 1.5
        for linea in lineas:
            if len(linea) < 2 or not dentro(linea):
                continue
            p = a_px(linea) * 16
            cv2.polylines(rios, [p.astype(np.int32)], False, 1.0, max(1, int(round(grosor * k))), cv2.LINE_AA, shift=4)

    ruta = CACHE / "ne" / "ne_10m_lakes.geojson"
    bajar(URL_NE.format("ne_10m_lakes"), ruta)
    for f in json.loads(ruta.read_text())["features"]:
        g = f["geometry"]
        if not g:
            continue
        polis = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for poli in polis:
            anillo = poli[0]
            if len(anillo) < 3 or not dentro(anillo):
                continue
            p = a_px(anillo) * 16
            cv2.fillPoly(lagos, [p.astype(np.int32)], 1.0, cv2.LINE_AA, shift=4)
    return np.clip(rios, 0, 1), np.clip(lagos, 0, 1)


# ───────────────────────── imagen objetivo T y regiones (§2) ─────────────────────────
# Regiones: (longitud de trazo × ancho, peso tiza, peso hueco)
LLANURA, BRUMA, MONTANA, NIEVE, MESETA, AGUA = range(6)
REGIONES = {
    LLANURA: (8.0, 0.58, 0.34),
    BRUMA: (3.0, 0.36, 0.20),
    MONTANA: (4.5, 0.40, 0.30),
    NIEVE: (4.0, 0.36, 0.34),
    MESETA: (5.5, 0.30, 0.32),
    AGUA: (6.0, 0.22, 0.28),
}

# Línea de cumbres aproximada (lon, lat): separa la vertiente húmeda de la sombra de lluvia.
CRESTA = [(68, 36.6), (71, 36.4), (73, 35.9), (75, 35.3), (77, 33.4), (79, 31.3), (81, 30.2),
          (84, 28.75), (86.5, 28.15), (88, 27.95), (90, 28.0), (92, 28.15), (96, 28.6)]


def colorear(alt, lon, lat, px, rios, lagos, rng):
    H, W = alt.shape
    U = math.sqrt(W * H) / 1946.0
    gy, gx = np.gradient(alt, px)                     # gy: hacia el sur (filas)
    pend = np.hypot(gx, gy)

    k = int(12e3 / px) | 1
    m1 = cv2.blur(alt, (k, k))
    m2 = cv2.blur(alt * alt, (k, k))
    rel = np.sqrt(np.maximum(m2 - m1 * m1, 0))       # relieve local (m) en ~12 km

    def lambert(az, el, exag):
        lx, ly, lz = math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el)
        nx, ny = -gx * exag, -gy * exag
        n = np.sqrt(nx * nx + ny * ny + 1)
        return np.clip((nx * lx + ny * ly + lz) / n, 0, 1)

    # luz única del noroeste (convención cartográfica) con un relleno suave del oeste
    luz = 0.82 * lambert(math.radians(315), math.radians(38), 2.6) + 0.18 * lambert(math.radians(270), math.radians(55), 1.6)
    lit = paso(0.30, 0.80, luz)
    sombra_arrojada = sombras(alt, px)
    lit = lit * (1 - 0.70 * sombra_arrojada)

    fino = fbm((H, W), 40, 3, rng)
    medio = fbm((H, W), 9, 4, rng)
    grande = fbm((H, W), 2.5, 4, rng)

    lat_c = np.interp(lon, [c[0] for c in CRESTA], [c[1] for c in CRESTA]).astype(np.float32)
    arido = paso(-0.15, 0.9, lat - lat_c + 0.35 * (medio - 0.5)) * paso(1800, 3400, alt)
    thar = paso(76.2, 73.0, lon) * paso(30.6, 28.2, lat) * paso(900, 300, alt)
    karak = paso(33.6, 34.8, lat) * paso(79.5, 77.5, lon)

    # pisos de color diurnos; la noche se aplica después (§2.3, variante Noche)
    cultivo = mezcla(rgb(98, 112, 70), rgb(128, 132, 82), paso(0.35, 0.7, medio))
    cultivo = mezcla(cultivo, rgb(166, 150, 108), thar * 0.85)
    bosque = mezcla(rgb(48, 74, 56), rgb(70, 96, 66), paso(0.3, 0.7, medio * 0.6 + fino * 0.4))
    monte = mezcla(rgb(92, 96, 84), rgb(124, 112, 98), paso(0.3, 0.75, medio))
    estepa = mezcla(rgb(118, 106, 86), rgb(140, 124, 96), paso(0.3, 0.7, grande * 0.6 + fino * 0.4))
    estepa = mezcla(estepa, rgb(104, 94, 88), paso(0.4, 1.0, pend) * 0.6)
    roca = mezcla(rgb(56, 60, 92), rgb(160, 130, 106) * (0.74 + 0.52 * fino[..., None]), lit)

    z = alt + 260 * (medio - 0.5)
    col = cultivo
    col = mezcla(col, bosque, paso(500, 1100, z) * (1 - thar))
    col = mezcla(col, monte, paso(2600, 3400, z))
    col = mezcla(col, estepa, arido)
    col = col * (0.62 + 0.52 * lit[..., None])
    col = mezcla(col, roca, paso(0.75, 1.25, pend) * paso(3000, 4200, alt))

    # nieve: blanca a la luz, azul pizarra en sombra; la pared muy empinada queda en roca
    # la nieve se decide a escala de ladera, no de píxel: si no, sale confeti (§8)
    lit_s = desenfoque(lit, 1.4 * U)
    pend_s = desenfoque(pend, 1.4 * U)
    cota = 4950 + 620 * arido - 420 * karak + 420 * (medio - 0.5) - 200 * (lit_s - 0.5)
    nevado = paso(-220, 220, desenfoque(alt, 1.0 * U) - cota) * (1 - 0.82 * paso(0.95, 1.6, pend_s + 0.15 * (medio - 0.5)))
    nevado = desenfoque(nevado, 0.9 * U)
    nieve = mezcla(rgb(130, 152, 200), rgb(254, 248, 234), paso(0.1, 0.9, lit_s))
    # glaciares: lenguas lisas entre relieve fuerte, por encima de 3 800 m
    glaciar = paso(3700, 4300, alt) * paso(380, 650, rel) * paso(0.30, 0.12, pend) * (1 - paso(0.6, 1.0, arido) * 0.5)
    hielo = mezcla(rgb(150, 164, 196), rgb(214, 220, 230), lit) * (0.92 + 0.12 * fino[..., None])
    col = mezcla(col, nieve, nevado)
    col = mezcla(col, hielo, glaciar * (1 - nevado) * 0.85)

    # oclusión ambiental: los fondos de valle encajados se oscurecen
    ao = np.clip((desenfoque(alt, 2.6e3 / px * 3) - alt) / 900.0, 0, 1)
    col = col * (1 - 0.34 * ao[..., None]) + rgb(20, 28, 60) * (0.34 * ao[..., None])

    # agua: el río refleja la luna, el lago es un espejo quieto
    rio_col = rgb(150, 180, 205) * (0.9 + 0.2 * fino[..., None])
    col = mezcla(col, rio_col, rios * 0.92)
    col = mezcla(col, rgb(132, 168, 196), lagos)

    # ── noche (§2.3): luminancia^1.35 hacia la paleta de luna, 22 % del original teñido
    lum = np.clip(luminancia(col) / 255.0, 0, 1)
    luna = mezcla(rgb(8, 14, 38), rgb(186, 202, 236), lum ** 1.35)
    noche = 0.78 * luna + 0.22 * (col * rgb(0.40, 0.52, 0.90))
    # la luna enciende la cordillera: llanuras y meseta se hunden, el relieve y la nieve no
    vivo = np.maximum(paso(180, 900, rel), np.maximum(nevado, glaciar))
    hondo = 0.58 + 0.42 * vivo + 0.10 * paso(3000, 4200, alt) * (1 - vivo)
    noche = noche * hondo[..., None]
    noche = mezcla(noche, noche * 1.16 + rgb(8, 10, 16), nevado * (0.25 + 0.65 * lit))
    agua_m = np.maximum(rios, lagos)
    noche = mezcla(noche, rgb(118, 142, 186), agua_m * 0.55)
    T = np.clip(noche, 0, 255).astype(np.float32)

    # regiones
    reg = np.full((H, W), LLANURA, np.uint8)
    reg[(alt > 1200) | (rel > 260)] = MONTANA
    reg[(alt > 3600) & (rel < 260) & (arido > 0.5)] = MESETA
    reg[np.maximum(nevado, glaciar) > 0.5] = NIEVE
    reg[agua_m > 0.5] = AGUA

    # dirección por defecto: en llanura y meseta casi horizontal; en la montaña, ladera abajo;
    # en la nieve, siguiendo la curva de nivel
    abajo = np.arctan2(gy, gx).astype(np.float32)
    por_defecto = np.full((H, W), -0.12, np.float32)
    por_defecto[reg == MONTANA] = abajo[reg == MONTANA]
    por_defecto[reg == NIEVE] = abajo[reg == NIEVE] + math.pi / 2
    plano = pend < 0.03
    por_defecto[plano & (reg != AGUA)] = -0.12
    por_defecto += ((fbm((H, W), 3, 3, rng) - 0.5) * 0.9).astype(np.float32)

    return T, reg, por_defecto, dict(nevado=nevado, alt=alt)


def sombras(alt, px):
    """Sombras arrojadas por la luz del noroeste (§2.3, 70 desplazamientos)."""
    H, W = alt.shape
    tan_elev = math.tan(math.radians(38)) / 2.6
    sombra = np.zeros_like(alt)
    paso_px = max(1.0, 1.6e3 / px)
    dx, dy = -math.sin(math.radians(45)), -math.cos(math.radians(45))   # hacia el NO en la imagen
    for k in range(1, 40):
        d = k * paso_px
        M = np.float32([[1, 0, -dx * d], [0, 1, -dy * d]])
        desplazado = cv2.warpAffine(alt, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        sombra = np.maximum(sombra, paso(0, 260, desplazado - (alt + d * px * tan_elev)))
    return desenfoque(sombra, 1.2)


# ───────────────────────── campo de orientación θ (§3) ─────────────────────────
def orientacion(T, reg, por_defecto, U):
    lum = desenfoque(luminancia(T), 1.6 * U)
    gx = cv2.Sobel(lum, cv2.CV_32F, 1, 0, ksize=3) / 8.0
    gy = cv2.Sobel(lum, cv2.CV_32F, 0, 1, ksize=3) / 8.0
    Jxx = desenfoque(gx * gx, 4 * U)
    Jyy = desenfoque(gy * gy, 4 * U)
    Jxy = desenfoque(gx * gy, 4 * U)
    ang = 0.5 * np.arctan2(2 * Jxy, Jxx - Jyy) + math.pi / 2
    energia = np.sqrt(Jxx + Jyy)
    umbral = np.where((reg == LLANURA) | (reg == MESETA), 2.6 / U, 1.3 / U)
    return np.where(energia > umbral, ang, por_defecto).astype(np.float32)


# ───────────────────────── pintor de trazos (§4) ─────────────────────────
PASADAS = [  # (ancho en U, tolerancia de color, umbral de error)
    (34.0, 72, None),
    (17.0, 62, 14.0),
    (8.5, 52, 13.0),
    (4.6, 46, 12.5),
    (3.0, 40, 13.0),
]


def pintar(T, reg, theta, rng, SS=2):
    H, W = reg.shape
    U = math.sqrt(W * H) / 1946.0
    largo_reg = np.array([REGIONES[i][0] for i in range(6)], np.float32)
    ini = desenfoque(T, 10 * U)
    lienzo = Image.fromarray(np.clip(ini, 0, 255).astype(np.uint8)).resize((W * SS, H * SS), Image.BILINEAR)
    d = ImageDraw.Draw(lienzo)
    cos_t, sin_t = np.cos(theta), np.sin(theta)
    # el corte del trazo se mide sobre T apenas suavizada: frena en los bordes del cuadro,
    # no en el grano del relieve (un DEM tiene detalle a escala de píxel que un cuadro no)
    Tt = desenfoque(T, 1.2 * U)

    total = 0
    for n_pasada, (ancho_u, tol, umbral) in enumerate(PASADAS, 1):
        w = ancho_u * U
        sep = 0.74 * w
        gx = np.arange(sep / 2, W, sep)
        gy = np.arange(sep / 2, H, sep)
        X, Y = np.meshgrid(gx, gy)
        X = (X + rng.uniform(-sep / 2, sep / 2, X.shape)).ravel()
        Y = (Y + rng.uniform(-sep / 2, sep / 2, Y.shape)).ravel()
        X = np.clip(X, 0, W - 1)
        Y = np.clip(Y, 0, H - 1)
        if umbral is not None:
            actual = np.asarray(lienzo.resize((W, H), Image.BOX), np.float32)
            err = np.abs(actual - T).mean(axis=2)
            c = max(1, int(round(sep)))
            err = cv2.blur(err, (c, c))
            ok = err[Y.astype(int), X.astype(int)] > umbral
            X, Y = X[ok], Y[ok]
        orden = rng.permutation(len(X))
        X, Y = X[orden], Y[orden]
        n = len(X)
        xi, yi = X.astype(int), Y.astype(int)
        semilla = T[yi, xi]
        color = semilla + rng.normal(0, 8, (n, 1)) + rng.normal(0, 4.5, (n, 3))
        color = np.clip(color, 0, 255)

        # trazado vectorizado: todas las pinceladas avanzan a la vez
        paso_px = 0.7 * w
        maxpasos = np.floor(largo_reg[reg[yi, xi]] / 0.7 * rng.uniform(0.6, 1.25, n)).astype(int)
        K = int(maxpasos.max())
        signo = np.where(rng.random(n) < 0.5, -1.0, 1.0)
        dx = cos_t[yi, xi] * signo
        dy = sin_t[yi, xi] * signo
        pts = np.zeros((n, K + 1, 2), np.float32)
        pts[:, 0, 0], pts[:, 0, 1] = X, Y
        largo = np.ones(n, int)
        vivo = np.ones(n, bool)
        px_, py_ = X.copy(), Y.copy()
        for k in range(1, K + 1):
            vivo &= k <= maxpasos
            if not vivo.any():
                break
            nx_ = px_ + dx * paso_px
            ny_ = py_ + dy * paso_px
            fuera = (nx_ < 0) | (nx_ > W - 1) | (ny_ < 0) | (ny_ > H - 1)
            vivo &= ~fuera
            ix = np.clip(nx_, 0, W - 1).astype(int)
            iy = np.clip(ny_, 0, H - 1).astype(int)
            dif = np.abs(Tt[iy, ix] - semilla).sum(axis=1)
            if k > 1:                       # el primer paso siempre se da: toque → guion orientado
                vivo &= dif < tol
            pts[vivo, k, 0] = nx_[vivo]
            pts[vivo, k, 1] = ny_[vivo]
            largo[vivo] = k + 1
            ndx, ndy = cos_t[iy, ix], sin_t[iy, ix]
            voltear = (ndx * dx + ndy * dy) < 0
            ndx = np.where(voltear, -ndx, ndx)
            ndy = np.where(voltear, -ndy, ndy)
            dx = np.where(vivo, ndx, dx)
            dy = np.where(vivo, ndy, dy)
            px_ = np.where(vivo, nx_, px_)
            py_ = np.where(vivo, ny_, py_)

        # dibujo
        wS = w * SS
        grosor = max(1, int(round(wS)))
        n_cerdas = 3 if wS >= 14 else 2 if wS >= 7 else 1 if wS >= 4 else 0
        offs = [0.0] if n_cerdas == 1 else list(np.linspace(-0.40, 0.40, n_cerdas)) if n_cerdas else []
        g_cerda = max(1, int(round(0.17 * wS)))
        r = wS / 2
        cc = color.astype(int)
        cerda_var = rng.integers(-16, 17, (n, max(1, n_cerdas)))
        off1 = rng.uniform(-0.40, 0.40, n)
        for i in range(n):
            L = largo[i]
            p = pts[i, :L] * SS
            c = (int(cc[i, 0]), int(cc[i, 1]), int(cc[i, 2]))
            if L == 1:
                d.ellipse((p[0, 0] - r, p[0, 1] - r, p[0, 0] + r, p[0, 1] + r), fill=c)
                continue
            lista = [tuple(q) for q in p.tolist()]
            d.line(lista, fill=c, width=grosor, joint="curve")
            if wS >= 4:
                d.ellipse((p[0, 0] - r, p[0, 1] - r, p[0, 0] + r, p[0, 1] + r), fill=c)
                d.ellipse((p[-1, 0] - r, p[-1, 1] - r, p[-1, 0] + r, p[-1, 1] + r), fill=c)
            if n_cerdas:
                t = p[-1] - p[0]
                nrm = math.hypot(t[0], t[1]) or 1.0
                perp = np.array([-t[1] / nrm, t[0] / nrm], np.float32)
                for j in range(n_cerdas):
                    o = off1[i] if n_cerdas == 1 else offs[j]
                    q = p + perp * (o * wS)
                    v = int(cerda_var[i, j])
                    cj = (min(255, max(0, c[0] + v)), min(255, max(0, c[1] + v)), min(255, max(0, c[2] + v)))
                    d.line([tuple(z) for z in q.tolist()], fill=cj, width=g_cerda)
        total += n
        print(f"  pasada {n_pasada}: {n} pinceladas de {w:.1f} px", flush=True)
    print(f"  total: {total} pinceladas", flush=True)
    return lienzo.resize((W, H), Image.LANCZOS)


# ───────────────────────── acabado (§7, variante noche) ─────────────────────────
def rayas(shape, largo, grosor, angulo, escala_grande, U, rng):
    H, W = shape
    D = int(math.ceil(math.hypot(W, H))) + 8
    ruido = rng.standard_normal((D, D)).astype(np.float32)
    s = cv2.GaussianBlur(ruido, (0, 0), sigmaX=float(largo * U), sigmaY=float(grosor * U), borderType=cv2.BORDER_REFLECT)
    M = cv2.getRotationMatrix2D((D / 2, D / 2), -angulo, 1.0)
    s = cv2.warpAffine(s, M, (D, D), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    oy, ox = (D - H) // 2, (D - W) // 2
    s = s[oy:oy + H, ox:ox + W]
    s = s / (s.std() + 1e-6)
    big = ruido_valor(shape, 1946.0 / escala_grande, rng)
    return s, big


def acabado(img, reg, rng):
    a = np.asarray(img, np.float32) / 255.0
    H, W = reg.shape
    U = math.sqrt(W * H) / 1946.0
    unit = math.sqrt(W * H)

    peso_tiza = np.array([REGIONES[i][1] for i in range(6)], np.float32)[reg]
    peso_hueco = np.array([REGIONES[i][2] for i in range(6)], np.float32)[reg]
    peso_tiza = desenfoque(peso_tiza, 5 * U)
    peso_hueco = desenfoque(peso_hueco, 5 * U) * 0.9          # noche: huecos × 0.9

    # 7.1 pulso inseguro
    dx = (fbm((H, W), 26, 3, rng) - 0.5) * 9 * U + (fbm((H, W), 90, 2, rng) - 0.5) * 2 * U
    dy = (fbm((H, W), 26, 3, rng) - 0.5) * 9 * U + (fbm((H, W), 90, 2, rng) - 0.5) * 2 * U
    mx, my = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
    a = cv2.remap(a, mx + dx, my + dy, interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

    # 7.2 paleta apagada y lavado turbio
    lum = luminancia(a)[..., None]
    a = a + (lum - a) * 0.20
    a = a * (0.89 + 0.20 * fbm((H, W), 2.2, 4, rng))[..., None]
    a = mezcla(a, rgb(96, 100, 118) / 255.0, 0.12 * paso(0.35, 0.75, fbm((H, W), 3.5, 3, rng)))

    # 7.3 grano del papel
    g1 = desenfoque(rng.standard_normal((H, W)).astype(np.float32), 0.75 * U)
    g2 = desenfoque(rng.standard_normal((H, W)).astype(np.float32), 1.9 * U)
    tooth = 0.7 * g1 / g1.std() + 0.6 * g2 / g2.std()

    # 7.5 fondo oscuro que asoma (en los valles del papel)
    fondo = rgb(8, 9, 20) / 255.0
    s1, b1 = rayas((H, W), 46, 1.5, 9, 150, U, rng)
    gap = paso(0.9, 2.1, s1 + 2.0 * (b1 - 0.5)) * paso(0.5, -0.9, tooth)
    s2, b2 = rayas((H, W), 16, 1.0, -14, 90, U, rng)
    gap = np.maximum(gap, paso(1.1, 2.2, s2 + 2.2 * (b2 - 0.5)) * paso(0.4, -0.8, tooth))
    pits = paso(-1.35, -2.1, tooth)
    kk = np.clip(gap * peso_hueco + 0.20 * pits, 0, 1)
    a = mezcla(a, fondo, kk)

    # 7.6 arrastres de tiza (en las crestas del papel); noche: tiza fría × 0.50
    tiza = rgb(176, 190, 226) / 255.0
    s3, b3 = rayas((H, W), 60, 1.3, 7, 170, U, rng)
    sc = paso(0.7, 1.9, s3 + 2.4 * (b3 - 0.5)) * paso(0.1, 1.1, tooth)
    s4, b4 = rayas((H, W), 22, 0.9, 19, 110, U, rng)
    sc = np.maximum(sc, paso(0.9, 2.0, s4 + 2.4 * (b4 - 0.5)) * paso(0.2, 1.2, tooth))
    s5, b5 = rayas((H, W), 9, 1.6, -30, 70, U, rng)
    sc = np.maximum(sc, 0.8 * paso(1.2, 2.2, s5 + 2.6 * (b5 - 0.5)) * paso(0.3, 1.2, tooth))
    a = mezcla(a, mezcla(a, np.broadcast_to(tiza, a.shape), 0.72), np.clip(sc * peso_tiza * 0.50, 0, 1))

    # 7.7 grano general, borde irregular, viñeta y tinte
    a = a * (1 + 0.045 * np.clip(tooth, -2.5, 2.5))[..., None]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    dist = np.minimum(np.minimum(xx, W - 1 - xx), np.minimum(yy, H - 1 - yy)) / U
    borde = paso(12 + 34 * fbm((H, W), 7, 3, rng), 0, dist) * paso(1.0, -0.6, tooth + 0.8)
    a = mezcla(a, fondo, 0.6 * borde)
    u, v = xx / W, yy / H
    r2 = 2 * ((u - 0.5) ** 2 + (v - 0.5) ** 2)
    a = a * (1 - 0.20 * paso(0.25, 1.0, r2))[..., None]
    a = a * rgb(1.015, 1.0, 0.965)
    out = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    return out.filter(ImageFilter.UnsharpMask(radius=1.2 * U, percent=35, threshold=2))


# ───────────────────────── principal ─────────────────────────
def main():
    ancho = int(sys.argv[1]) if len(sys.argv) > 1 else 3840
    W, H = ancho, int(round(ancho * EXTENSION[1] / EXTENSION[0]))
    ensayo = ancho != 3840
    rng = np.random.default_rng(8849)
    t0 = time.time()
    print(f"Mapa {W}×{H}", flush=True)
    alt, lon, lat, px = relieve(W, H)
    print(f"  altitud {alt.min():.0f}…{alt.max():.0f} m · {px:.0f} m/px · {time.time() - t0:.0f} s", flush=True)
    rios, lagos = agua(W, H, px)
    T, reg, por_defecto, extra = colorear(alt, lon, lat, px, rios, lagos, rng)
    U = math.sqrt(W * H) / 1946.0
    theta = orientacion(T, reg, por_defecto, U)
    print(f"  objetivo listo · {time.time() - t0:.0f} s", flush=True)
    dest = SALIDA if not ensayo else Path(os.environ.get("OCHOMILES_ENSAYO", AQUI / ".ensayo"))
    dest.mkdir(parents=True, exist_ok=True)
    if ensayo:
        Image.fromarray(np.clip(T, 0, 255).astype(np.uint8)).save(dest / f"objetivo-{W}.png")
    pintado = pintar(T, reg, theta, rng)
    print(f"  pintado · {time.time() - t0:.0f} s", flush=True)
    final = acabado(pintado, reg, rng)
    print(f"  acabado · {time.time() - t0:.0f} s", flush=True)

    if ensayo:
        final.save(dest / f"mapa-{W}.png")
    else:
        final.save(dest / "mapa-3840.webp", quality=82, method=6)
        for w in (2560, 1600):
            final.resize((w, round(w * H / W)), Image.LANCZOS).save(dest / f"mapa-{w}.webp", quality=84, method=6)

    datos = {
        "fuente": "herramientas/pintar_mapa.py",
        "proyeccion": LCC,
        "extension_m": {"x0": X0, "y1": Y1, "ancho": EXTENSION[0], "alto": EXTENSION[1]},
        "aspecto": EXTENSION[0] / EXTENSION[1],
        "picos": [],
        "rotulos": [],
    }
    for pid, nombre, altura, la, lo in PICOS:
        u, v = a_uv(lo, la)
        datos["picos"].append({"id": pid, "nombre": nombre, "altitud": altura, "lat": la, "lon": lo,
                               "u": round(u, 5), "v": round(v, 5)})
    for rid, texto, tipo, eje in ROTULOS:
        (u0, v0), (u1, v1) = a_uv(*eje[0]), a_uv(*eje[1])
        ang = math.degrees(math.atan2((v1 - v0) * EXTENSION[1], (u1 - u0) * EXTENSION[0]))
        datos["rotulos"].append({"id": rid, "texto": texto, "tipo": tipo, "u": round((u0 + u1) / 2, 5),
                                 "v": round((v0 + v1) / 2, 5), "angulo": round(ang, 1),
                                 "largo": round(math.hypot((u1 - u0), (v1 - v0) / (EXTENSION[0] / EXTENSION[1])), 5)})
    (dest / "mapa.json").write_text(json.dumps(datos, ensure_ascii=False, indent=1))
    print(f"Listo en {time.time() - t0:.0f} s → {dest}", flush=True)


if __name__ == "__main__":
    main()
