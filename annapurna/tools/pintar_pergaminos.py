#!/usr/bin/env python3
"""
Pinta las hojas sobre las que va el texto de la web: pergaminos y papeles
viejos, cada uno gastado a su manera (amarillento, quemado, rasgado, plegado,
roído, tostado) y tres papeles teñidos para las cartas oscuras.

Cada hoja es un cuadrado con fondo transparente pensado para usarse como
`border-image` de nueve piezas: las cuatro esquinas se pintan tal cual y los
bordes y el centro se estiran hasta el tamaño de la carta. Por eso todo el
desgaste (mordiscos, rasgones, quemaduras) vive en la franja exterior, y el
centro es papel entero: el texto nunca cae sobre un agujero.

    python3 tools/pintar_pergaminos.py            # todas, en img/pergamino-*.webp
    python3 tools/pintar_pergaminos.py quemado    # solo una
    python3 tools/pintar_pergaminos.py --hoja     # además, una hoja de contactos en /tmp

La franja que se recorta en el CSS es `CORTE` (150 px de 1200): si cambias el
tamaño, cambia también `border-image-slice` en css/annapurna.css.
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from pintar_mapa import a_lo_ancho, dist_segmento, mezcla, paso, rgb, ruido

SALIDA = Path(__file__).resolve().parent.parent / "img"
N = 1200                 # lado de la hoja
CORTE = N // 8           # franja de borde del border-image (150 px)
MARGEN = 0.0215 * N      # aire alrededor, para la sombra
HONDO = 0.75 * CORTE     # hasta dónde puede llegar el desgaste; más adentro, papel entero

TINTA = rgb(34, 36, 47)

# ───────────────────────── los modelos ─────────────────────────
# ondas: cuánto se aparta el borde de la recta (lentas, medias, finas), en fracción de la franja.
# mellas: mordiscos redondos · rasgones: cortes finos hacia dentro · esquinas: (cuál, cuánto) arrancadas
# quemado: (carbón, tueste, fuerza) · pliegues: (verticales, horizontales) · cercos: manchas de humedad
# sesgo y panza: por lado (arriba, derecha, abajo, izquierda), el borde cae en diagonal o se comba
MODELOS = {
    "viejo": dict(
        semilla=11, base=(234, 223, 194), mancha=(213, 195, 154), k_mancha=0.75,
        borde=(142, 108, 68), edad=0.85, edad_sigma=34, ondas=(0.42, 0.20, 0.08), panza=(0.18, -0.10, 0.22, 0.0),
        mellas=6, mella_r=(12, 30), foxing=0.5, cercos=1),
    "quemado": dict(
        semilla=23, base=(228, 213, 178), mancha=(203, 181, 139), k_mancha=0.85,
        borde=(120, 82, 46), edad=0.5, edad_sigma=40, ondas=(0.26, 0.30, 0.08), sesgo=(0.0, 0.16, -0.14, 0.0),
        mellas=13, mella_r=(24, 52), quemado=(17, 92, 1.0), foxing=0.25),
    "rasgado": dict(
        semilla=37, base=(238, 231, 210), mancha=(222, 210, 181), k_mancha=0.7,
        borde=(170, 144, 106), edad=0.42, edad_sigma=24, ondas=(0.12, 0.30, 0.30), sesgo=(0.34, 0.0, -0.30, 0.12),
        mellas=4, mella_r=(8, 18), rasgones=11, esquinas=[(1, 0.9), (3, 0.55)], fibra=0.9, foxing=0.25),
    "plegado": dict(
        semilla=41, base=(230, 220, 193), mancha=(208, 195, 161), k_mancha=0.7,
        borde=(146, 118, 82), edad=0.62, edad_sigma=28, ondas=(0.20, 0.20, 0.10), panza=(-0.14, 0.12, -0.10, 0.16),
        mellas=4, mella_r=(10, 22), pliegues=([0.335, 0.665], [0.5]), cercos=3, foxing=0.45, esquinas=[(2, 0.5)]),
    "roido": dict(
        semilla=53, base=(224, 209, 174), mancha=(194, 173, 131), k_mancha=0.9,
        borde=(130, 96, 58), edad=0.85, edad_sigma=36, ondas=(0.16, 0.40, 0.22), sesgo=(0.0, -0.12, 0.0, 0.14),
        mellas=30, mella_r=(8, 30), rasgones=5, agujeros=16, foxing=1.6, esquinas=[(0, 0.6)]),
    "tostado": dict(
        semilla=67, base=(220, 199, 157), mancha=(195, 167, 119), k_mancha=0.85,
        borde=(110, 76, 44), edad=0.92, edad_sigma=48, ondas=(0.32, 0.24, 0.10), panza=(0.0, 0.2, 0.0, -0.12),
        mellas=7, mella_r=(16, 40), quemado=(15, 110, 0.95), quemado_en=[2, 0], cercos=2, foxing=0.6,
        esquinas=[(2, 0.92), (0, 0.5)]),
    # papeles teñidos: el desgaste los aclara en vez de oscurecerlos
    "indigo": dict(
        semilla=71, oscuro=True, base=(37, 39, 54), mancha=(50, 54, 78), k_mancha=0.8,
        borde=(122, 124, 146), edad=0.66, edad_sigma=13, ondas=(0.30, 0.26, 0.18), panza=(0.14, 0.0, -0.12, 0.1),
        mellas=9, mella_r=(10, 28), rasgones=4, foxing=0.0),
    "noche": dict(
        semilla=83, oscuro=True, base=(33, 34, 45), mancha=(47, 47, 62), k_mancha=0.85,
        borde=(136, 128, 126), edad=0.72, edad_sigma=16, ondas=(0.14, 0.36, 0.24), sesgo=(-0.26, 0.0, 0.22, 0.0),
        mellas=14, mella_r=(8, 26), rasgones=7, esquinas=[(1, 0.8), (3, 0.5)], pliegues=([0.5], []), foxing=0.0),
    "musgo": dict(
        semilla=97, oscuro=True, base=(82, 88, 66), mancha=(99, 105, 77), k_mancha=0.8,
        borde=(170, 170, 138), edad=0.62, edad_sigma=14, ondas=(0.26, 0.30, 0.16), sesgo=(0.18, 0.0, 0.0, -0.14),
        mellas=10, mella_r=(10, 26), rasgones=4, esquinas=[(2, 0.7)], foxing=0.0),
}


def desenfocar(a, s):
    fy = np.fft.fftfreq(a.shape[0])[:, None]
    fx = np.fft.rfftfreq(a.shape[1])[None, :]
    return np.fft.irfft2(np.fft.rfft2(a) * np.exp(-2 * np.pi ** 2 * s * s * (fx * fx + fy * fy)), s=a.shape).astype(np.float32)


def en_el_borde(rng):
    """Un punto al azar sobre el contorno de la hoja (sin las esquinas) y la dirección hacia dentro."""
    lado = int(rng.integers(0, 4))
    t = rng.uniform(0.13, 0.87) * N
    o = MARGEN + rng.uniform(0, 8)
    return [((t, o), (0, 1)), ((N - 1 - o, t), (-1, 0)), ((t, N - 1 - o), (0, -1)), ((o, t), (1, 0))][lado]


def pintar(nombre):
    P = MODELOS[nombre]
    rng = np.random.default_rng(P["semilla"])
    u = N / 1400.0
    sh = (N, N)
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    dxe, dye = np.minimum(xx, N - 1 - xx), np.minimum(yy, N - 1 - yy)
    prof = np.minimum(dxe, dye)
    franja = HONDO - MARGEN

    n_len = ruido(sh, rng, 330 * u, 2)
    n_med = ruido(sh, rng, 64 * u, 3)
    n_fin = ruido(sh, rng, 13 * u, 2)

    # ── el contorno: `orilla` es positiva dentro del papel ──
    r = 26 * u
    ex, ey = np.maximum(r - (dxe - MARGEN), 0), np.maximum(r - (dye - MARGEN), 0)
    d = np.where((dxe - MARGEN < r) & (dye - MARGEN < r), r - np.hypot(ex, ey), prof - MARGEN)
    a, b, c = P["ondas"]
    orilla = d - franja * (a * n_len + b * n_med + c * n_fin)
    # ningún lado es recto: unos caen en diagonal y otros se comban
    tx, ty = xx / (N - 1), yy / (N - 1)
    lados = ((yy, tx), (N - 1 - xx, ty), (N - 1 - yy, tx), (xx, ty))
    for (dist, t), sg, pz in zip(lados, P.get("sesgo", (0, 0, 0, 0)), P.get("panza", (0, 0, 0, 0))):
        quita = franja * (abs(sg) * (t if sg > 0 else 1 - t) + abs(pz) * (np.sin(np.pi * t) if pz > 0 else 1 - np.sin(np.pi * t)))
        orilla = np.minimum(orilla, dist - MARGEN - quita - franja * (b * n_med + c * n_fin))

    for _ in range(P.get("mellas", 0)):                         # mordiscos
        (x, y), _n = en_el_borde(rng)
        rad = rng.uniform(*P["mella_r"]) * u
        orilla = np.minimum(orilla, np.hypot(xx - x, yy - y) - rad - 7 * u * (n_fin - 0.5))

    for _ in range(P.get("rasgones", 0)):                       # desgarros en cuña, de la orilla hacia dentro
        (x, y), (nx, ny) = en_el_borde(rng)
        giro = rng.normal(0, 0.4)
        vx, vy = nx * math.cos(giro) - ny * math.sin(giro), nx * math.sin(giro) + ny * math.cos(giro)
        largo = rng.uniform(0.5, 0.95) * franja
        ds, t = dist_segmento(xx, yy, (x - vx * 30, y - vy * 30), (x + vx * largo, y + vy * largo))
        orilla = np.minimum(orilla, ds - rng.uniform(13, 24) * u * (1 - t) ** 0.8 - 4 * u * (n_fin - 0.5))

    for cual, cuanto in P.get("esquinas", []):                  # esquinas arrancadas
        cx = xx if cual in (0, 3) else N - 1 - xx
        cy = yy if cual in (0, 1) else N - 1 - yy
        corte = (cx + cy * rng.uniform(0.85, 1.15)) - cuanto * CORTE * 1.05
        orilla = np.minimum(orilla, corte / 1.42 + 20 * u * (n_med - 0.5) + 8 * u * (n_fin - 0.5))

    orilla = np.maximum(orilla, prof - HONDO)                   # más adentro, papel entero

    for _ in range(P.get("agujeros", 0)):                       # polilla, en la franja interior
        (x, y), (nx, ny) = en_el_borde(rng)
        hondo = rng.uniform(HONDO * 0.7, CORTE - 22 * u) - MARGEN
        x, y = x + nx * hondo, y + ny * hondo
        rad = rng.uniform(3.5, 11) * u
        e = rng.uniform(0.6, 1.0)
        orilla = np.minimum(orilla, np.hypot((xx - x) * e, (yy - y)) - rad - 3 * u * (n_fin - 0.5))

    alfa = paso(0, 2.0, orilla)
    dentro = np.clip(orilla, 0, None)

    # ── el papel ──
    base, mancha, canto = rgb(*P["base"]), rgb(*P["mancha"]), rgb(*P["borde"])
    oscuro = P.get("oscuro", False)
    m1, m2 = ruido(sh, rng, 420 * u, 3), ruido(sh, rng, 110 * u, 3)
    col = mezcla(np.broadcast_to(base, sh + (3,)).copy(), mancha, paso(0.25, 0.85, 0.62 * m1 + 0.38 * m2) * P["k_mancha"])
    f1 = ruido(sh, rng, 9 * u, 2, estirar=(0.12, 1.0), giro=0.3)
    f2 = ruido(sh, rng, 9 * u, 2, estirar=(0.12, 1.0), giro=-1.15)
    col = col * (1 + (0.05 if oscuro else 0.03) * ((f1 - 0.5) + 0.7 * (f2 - 0.5)))[..., None]

    for _ in range(P.get("cercos", 0)):                         # manchas de humedad, con su cerco
        cx, cy = rng.uniform(0.18, 0.82, 2) * N
        rad = rng.uniform(90, 230) * u
        dist = np.hypot(xx - cx, yy - cy) / rad + 0.4 * (n_len - 0.5) + 0.16 * (m2 - 0.5)
        col = col * (1 - 0.055 * paso(1.0, 0.86, dist))[..., None]
        col = mezcla(col, canto, np.exp(-((dist - 1.0) / 0.03) ** 2) * 0.3)

    vert, horiz = P.get("pliegues", ([], []))                   # dobleces: una raya de sombra y otra de luz
    for eje, lista in ((xx, vert), (yy, horiz)):
        for f in lista:
            dd = eje - f * N - 9 * u * (n_len - 0.5)
            sombra = np.exp(-(dd / (1.5 * u)) ** 2) * (0.5 + 0.8 * m2)
            luz = np.exp(-((dd - 3.2 * u) / (1.9 * u)) ** 2)
            if oscuro:
                col = mezcla(col, canto, np.clip(sombra * 0.4, 0, 1))
            else:
                col = col * (1 - 0.22 * sombra)[..., None]
                col = col + (1 - col) * (0.16 * luz)[..., None]
            col = col * (1 + 0.018 * np.tanh(dd / (70 * u)))[..., None]

    if P.get("foxing", 0) > 0:                                  # pecas de óxido
        racimos = paso(0.42, 0.78, ruido(sh, rng, 240 * u, 2))        # salen a rodales, no repartidas
        fox = np.zeros(sh, np.float32)
        for dens, sigma, gana in ((0.00022, 1.7, 16), (0.00007, 3.6, 62), (0.000018, 8.0, 240)):
            pecas = (rng.random(sh, dtype=np.float32) > 1 - dens * P["foxing"] * (0.25 + 1.5 * racimos)).astype(np.float32)
            fox += desenfocar(pecas * rng.uniform(0.3, 1.0, sh).astype(np.float32), sigma * u) * gana
        col = mezcla(col, rgb(146, 96, 52), np.clip(fox, 0, 1) * 0.55)

    # ── el canto: se oscurece con los años (o se aclara, si el papel es teñido) ──
    viejo = np.exp(-dentro / (P["edad_sigma"] * u)) * (0.5 + 0.9 * m2)
    col = mezcla(col, canto, np.clip(viejo * P["edad"], 0, 1))
    if oscuro:
        roces = paso(0.86, 0.97, ruido(sh, rng, 30 * u, 2, estirar=(0.08, 1.0), giro=rng.uniform(-0.5, 0.5)))
        col = mezcla(col, canto, roces * 0.10 + np.exp(-dentro / (70 * u)) * 0.12)
    else:
        col = mezcla(col, mancha * 0.92, np.exp(-dentro / (130 * u)) * 0.5)

    if "quemado" in P:                                          # fuego: tueste ancho y carbón en el filo
        carbon, tueste, fuerza = P["quemado"]
        donde = 1.0
        if "quemado_en" in P:                                   # solo cerca de algunas esquinas
            donde = np.zeros(sh, np.float32)
            for cual in P["quemado_en"]:
                cx = xx if cual in (0, 3) else N - 1 - xx
                cy = yy if cual in (0, 1) else N - 1 - yy
                donde = np.maximum(donde, paso(0.62 * N, 0.2 * N, np.hypot(cx, cy) + 120 * u * (n_len - 0.5)))
        z = dentro + (0.6 * n_med + 0.4 * n_fin - 0.5) * tueste * u * 0.55
        col = mezcla(col, rgb(116, 74, 38), paso(tueste * u, 0, z) ** 1.5 * 0.88 * fuerza * donde)
        col = mezcla(col, rgb(24, 19, 18), paso(carbon * u * (0.5 + 1.0 * n_med), 0, dentro) * 0.94 * fuerza * donde)

    if P.get("fibra"):                                          # el desgarro deja ver la fibra clara
        col = mezcla(col, rgb(248, 244, 232), paso(7 * u, 0, dentro) * (0.35 + 0.65 * n_fin) * P["fibra"])

    # ── el grano, como el de las pinturas ──
    motas = (rng.random(sh, dtype=np.float32) > 0.988).astype(np.float32)
    hebras = a_lo_ancho((rng.random(sh, dtype=np.float32) > 0.9992).astype(np.float32), 5)
    hebras = np.maximum(hebras, a_lo_ancho((rng.random(sh, dtype=np.float32) > 0.9997).astype(np.float32), 13))
    grano = desenfocar(np.maximum(motas * 0.8, hebras), 0.7)
    if oscuro:
        col = col + (rgb(196, 196, 204) - col) * (grano * 0.2)[..., None]
    else:
        col = mezcla(col, TINTA * 1.6, np.clip(grano * 0.26, 0, 1))
        tiza = desenfocar((rng.random(sh, dtype=np.float32) > 0.99).astype(np.float32), 0.7)
        col = col + (1 - col) * (tiza * 0.3)[..., None]
    col = np.clip(col * (1 + 0.018 * rng.standard_normal(sh + (1,)).astype(np.float32)), 0, 1)

    # ── la sombra que deja sobre la pintura ──
    sombra = desenfocar(np.roll(np.roll(alfa, int(10 * u), axis=0), int(5 * u), axis=1), 9 * u) * 0.5
    a = alfa + sombra * (1 - alfa)
    out = (col * alfa[..., None] + rgb(14, 15, 22) * (sombra * (1 - alfa))[..., None]) / np.maximum(a, 1e-4)[..., None]
    return np.dstack([np.clip(out, 0, 1), np.clip(a, 0, 1)])


def guardar(nombre, im):
    SALIDA.mkdir(exist_ok=True)
    ruta = SALIDA / f"pergamino-{nombre}.webp"
    Image.fromarray((im * 255).astype(np.uint8), "RGBA").save(ruta, quality=82, method=6, alpha_quality=92)
    print(f"{ruta.name}  {ruta.stat().st_size // 1024} KB", flush=True)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    hechas = {}
    for nombre in args or list(MODELOS):
        hechas[nombre] = pintar(nombre)
        guardar(nombre, hechas[nombre])
    if "--hoja" in sys.argv:
        lado, cols = 520, 3
        filas = (len(hechas) + cols - 1) // cols
        hoja = Image.new("RGB", (cols * lado, filas * lado), (92, 108, 140))
        for i, im in enumerate(hechas.values()):
            pil = Image.fromarray((im * 255).astype(np.uint8), "RGBA").resize((lado, lado), Image.LANCZOS)
            hoja.paste(pil, ((i % cols) * lado, (i // cols) * lado), pil)
        hoja.save("/tmp/pergaminos.jpg", quality=88)
        print("/tmp/pergaminos.jpg")
