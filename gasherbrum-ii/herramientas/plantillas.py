#!/usr/bin/env python3
"""Plantillas de la identidad «Caravana» (Gasherbrum II): la carga de los porteadores como contenedor.

    python3 plantillas.py <carpeta_salida> [familia,familia,...]

Familias y piezas (PNG RGBA con sombra; todo a 2x del tamaño de uso):
  lona     lona_<color>_9.png      9-slice para bloques de texto (esquinas con ojal, refuerzo y amarre;
                                   bordes con dobladillo y un ojal por periodo)
           lona_<color>_tela.png   textura de relleno repetible (con pliegues de doblado)
           cinta_<color>.png       pancarta de capítulo con ojales arriba y abajo y amarres en las esquinas
           telon_izq.png / telon_der.png   las dos lonas del telón de entrada
           friso_lona.png          franja repetible para la barra superior
  ficha    ficha_v_<material>.png  etiqueta vertical colgada de su cordel (campos)
           ficha_h_<material>.png  etiqueta horizontal con talón troquelado (datos sueltos)
  fardo    fardo_<color>_h.png / fardo_<color>_v.png   saco de rafia atado en cruz (hazañas)
  bidon    bidon_<color>.png       tapa con aro de cierre (altímetro, cifras)
           bidon_aro.png           costado con aros de rodadura (altímetro en el friso móvil)
  morrena  morrena_ancha.png, morrena_fina.png (repetibles en x), morrena_v.png (repetible en y)

Colores de la identidad: cobalto #2645B0, morrena #17191F, hielo #EEF0F3, cartón #DCD5C6, grava #6B6E79.
Determinista: semillas fijas.
"""
import os
import sys
import math
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

OUT = sys.argv[1] if len(sys.argv) > 1 else 'plantillas_png'
SEL = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else None
os.makedirs(OUT, exist_ok=True)


def rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255


COBALTO, MORRENA, HIELO, CARTON, GRAVA = rgb('2645B0'), rgb('17191F'), rgb('EEF0F3'), rgb('DCD5C6'), rgb('6B6E79')
METAL = rgb('A3A9B1')
SOMBRA = rgb('0B0C12')
LUZ = np.array([-0.52, -0.64, 0.56], np.float32)
LUZ /= np.linalg.norm(LUZ)


# ================================================================ utilidades
def noise(h, w, sigma, seed, wrap=False):
    r = np.random.default_rng(seed).standard_normal((h, w)).astype(np.float32)
    n = ndi.gaussian_filter(r, sigma, mode='wrap' if wrap else 'reflect')
    return n / (n.std() + 1e-8)


def fbm(h, w, sigmas, weights, seed, wrap=False):
    out = np.zeros((h, w), np.float32)
    for i, (s, wt) in enumerate(zip(sigmas, weights)):
        out += wt * noise(h, w, s, seed + 101 * i, wrap)
    return out


def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def grad(hm, wrap=False):
    if wrap:
        gx = (np.roll(hm, -1, 1) - np.roll(hm, 1, 1)) / 2
        gy = (np.roll(hm, -1, 0) - np.roll(hm, 1, 0)) / 2
        return gx, gy
    gy, gx = np.gradient(hm)
    return gx, gy


def shade(hm, k=1.0, wrap=False):
    gx, gy = grad(hm, wrap)
    nx, ny = -gx * k, -gy * k
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + 1.0)
    d = (nx * LUZ[0] + ny * LUZ[1] + LUZ[2]) * inv
    H = LUZ + np.array([0, 0, 1], np.float32)
    H /= np.linalg.norm(H)
    sp = np.clip((nx * H[0] + ny * H[1] + H[2]) * inv, 0, 1)
    return np.clip(d / LUZ[2], 0, 1.45), sp


def oclusion(hm, sigma, k, wrap=False):
    occ = np.clip(ndi.gaussian_filter(hm, sigma, mode='wrap' if wrap else 'reflect') - hm, 0, None)
    return np.clip(1 - k * occ, 0.45, 1)


def poly_mask(w, h, pts, ss_=4):
    im = Image.new('L', (w * ss_, h * ss_), 0)
    ImageDraw.Draw(im).polygon([(x * ss_, y * ss_) for x, y in pts], fill=255)
    return np.asarray(im.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255


def rrect_sd(xx, yy, x0, y0, x1, y1, rad):
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    hx, hy = (x1 - x0) / 2 - rad, (y1 - y0) / 2 - rad
    qx, qy = np.abs(xx - cx) - hx, np.abs(yy - cy) - hy
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - rad


def guardar(nombre, col, alpha, sombra=(10, 16, 18, 0.55)):
    a = np.clip(alpha, 0, 1).astype(np.float32)
    if sombra:
        dx, dy, blur, op = sombra
        sh = ndi.shift(a, (dy, dx), order=1, mode='constant')
        sh = np.clip(ndi.gaussian_filter(sh, blur) * op + ndi.gaussian_filter(a, 2.5) * 0.25, 0, 1)
        oa = a + sh * (1 - a)
        c = (np.clip(col, 0, 1) * a[..., None] + SOMBRA * (sh * (1 - a))[..., None]) / np.maximum(oa, 1e-6)[..., None]
    else:
        oa, c = a, np.clip(col, 0, 1)
    arr = np.dstack([np.clip(c, 0, 1), oa])
    im = Image.fromarray((arr * 255 + 0.5).astype(np.uint8), 'RGBA')
    im.save(os.path.join(OUT, nombre + '.png'))
    print('ok', nombre, im.size, flush=True)
    return im


def guardar_rgb(nombre, col):
    im = Image.fromarray((np.clip(col, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB')
    im.save(os.path.join(OUT, nombre + '.png'))
    print('ok', nombre, im.size, flush=True)


# ================================================================ cuerda y ojal
def cuerda_capa(shape, pts, ancho, color, torsion=14.0, seed=0, fin=0, inicio=0, color2=None):
    """Cuerda de tres cabos torcidos a lo largo de una polilínea: (alfa, rgb) del tamaño de la imagen."""
    H, W = shape
    pts = np.asarray(pts, np.float32)
    r = ancho / 2
    x0 = int(max(0, math.floor(pts[:, 0].min() - r - 3))); x1 = int(min(W, math.ceil(pts[:, 0].max() + r + 3)))
    y0 = int(max(0, math.floor(pts[:, 1].min() - r - 3))); y1 = int(min(H, math.ceil(pts[:, 1].max() + r + 3)))
    A = np.zeros((H, W), np.float32); C = np.zeros((H, W, 3), np.float32)
    if x1 <= x0 or y1 <= y0:
        return A, C
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    seg = np.diff(pts, axis=0)
    lens = np.hypot(seg[:, 0], seg[:, 1])
    cum = np.concatenate([[0], np.cumsum(lens)])
    total = cum[-1]
    bd = np.full(xx.shape, 1e9, np.float32); bt = np.zeros_like(xx); bs = np.zeros_like(xx)
    for i in range(len(pts) - 1):
        L = lens[i]
        if L < 1e-6:
            continue
        u = seg[i] / L; n = np.array([-u[1], u[0]], np.float32)
        dx, dy = xx - pts[i, 0], yy - pts[i, 1]
        s = dx * u[0] + dy * u[1]
        sc = np.clip(s, 0, L)
        dist = np.hypot(xx - (pts[i, 0] + u[0] * sc), yy - (pts[i, 1] + u[1] * sc))
        t = dx * n[0] + dy * n[1]
        m = dist < bd
        bd = np.where(m, dist, bd); bt = np.where(m, np.clip(t / r, -1, 1), bt); bs = np.where(m, cum[i] + sc, bs)
    a = np.clip((r - bd) / 1.2 + 0.5, 0, 1)
    if fin:
        a *= np.clip((total - bs) / fin, 0, 1)
    if inicio:
        a *= np.clip(bs / inicio, 0, 1)
    nz = np.sqrt(np.clip(1 - bt * bt, 0, 1))
    fase = bs / torsion + bt * 0.9
    cabo = 0.5 + 0.5 * np.cos(2 * np.pi * fase)
    surco = ss(0.0, 0.38, cabo)
    fib = ndi.gaussian_filter(np.random.default_rng(seed).standard_normal(xx.shape).astype(np.float32), 0.6)
    lum = (0.26 + 0.66 * nz - 0.2 * bt) * (0.55 + 0.45 * surco) * (1 + 0.07 * fib)
    lum += 0.14 * nz ** 10 * surco
    base = color[None, None, :]
    if color2 is not None:     # cabo de otro color (cuerda trenzada de dos tonos)
        k = (np.floor(fase * 3) % 3 == 0).astype(np.float32)[..., None]
        base = base * (1 - k) + color2[None, None, :] * k
    A[y0:y1, x0:x1] = a
    C[y0:y1, x0:x1] = np.clip(base * lum[..., None], 0, 1)
    return A, C


def poner_cuerda(col, alpha, pts, ancho, color, sombra=0.38, **kw):
    A, C = cuerda_capa(alpha.shape, pts, ancho, color, **kw)
    if sombra:
        sh = ndi.gaussian_filter(ndi.shift(A, (6, 4), order=1), 4.0)
        col *= (1 - sombra * sh * np.clip(alpha, 0, 1))[..., None]
    col[:] = C * A[..., None] + col * (1 - A[..., None])
    alpha[:] = A + alpha * (1 - A)


def ojal(col, alpha, cx, cy, ri, ro, metal=METAL, seed=0):
    """Ojal metálico engastado: arandela con rizado de prensa, pared interior oscura y agujero."""
    H, W = alpha.shape
    x0, x1 = max(0, int(cx - ro - 14)), min(W, int(cx + ro + 15))
    y0, y1 = max(0, int(cy - ro - 14)), min(H, int(cy + ro + 15))
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    dx, dy = xx - cx, yy - cy
    d = np.hypot(dx, dy) + 1e-6
    th = np.arctan2(dy, dx)
    sub = col[y0:y1, x0:x1]
    # sombra de contacto sobre la tela
    sub *= (1 - 0.42 * np.exp(-np.clip(d - ro, 0, None) / 5.0) * (d > ro - 1))[..., None]
    t = np.clip((d - ri) / (ro - ri), 0, 1)
    ring = np.clip(d - ri + 0.5, 0, 1) * np.clip(ro - d + 0.5, 0, 1)
    rizo = 0.10 * np.cos(28 * th) * ss(0.45, 0.8, t)
    dh = (np.pi * np.cos(np.pi * t) * 0.85 + rizo * 6) / max(1.0, (ro - ri) * 0.12)
    nx, ny = -dh * dx / d, -dh * dy / d
    inv = 1 / np.sqrt(nx * nx + ny * ny + 1)
    df = np.clip((nx * LUZ[0] + ny * LUZ[1] + LUZ[2]) * inv, 0, 1)
    Hh = LUZ + np.array([0, 0, 1]); Hh /= np.linalg.norm(Hh)
    sp = np.clip((nx * Hh[0] + ny * Hh[1] + Hh[2]) * inv, 0, 1)
    rng = np.random.default_rng(seed)
    ox = 1 + 0.06 * ndi.gaussian_filter(rng.standard_normal(xx.shape).astype(np.float32), 1.2)
    c = metal[None, None, :] * (0.22 + 0.92 * df)[..., None] * ox[..., None] + (0.85 * sp ** 34 + 0.12 * sp ** 6)[..., None]
    sub[:] = c * ring[..., None] + sub * (1 - ring[..., None])
    # pared interior (el tubo del ojal) y agujero
    pared = np.clip(d - (ri - 4) + 0.5, 0, 1) * np.clip(ri - d + 0.5, 0, 1)
    ang = 0.5 + 0.5 * np.cos(th - math.atan2(LUZ[1], LUZ[0]) + np.pi)
    sub[:] = sub * (1 - pared[..., None]) + (metal * 0.32)[None, None, :] * (0.5 + 0.8 * ang)[..., None] * pared[..., None]
    agujero = np.clip((ri - 4) - d + 0.5, 0, 1)
    alpha[y0:y1, x0:x1] *= (1 - agujero)


def costura(xx, yy, din, filas, paso=13.0, largo=8.0, along=None):
    """Máscara de pespuntes (filas a distancia `din` del borde)."""
    if along is None:
        along = xx
    dash = ss(0.0, 1.2, (along % paso)) * (1 - ss(largo - 1.2, largo, (along % paso)))
    m = np.zeros_like(din)
    for f in filas:
        m = np.maximum(m, np.clip(1.6 - np.abs(din - f), 0, 1) * dash)
    agujas = np.zeros_like(din)
    for f in filas:
        agujas = np.maximum(agujas, np.clip(1.2 - np.hypot(din - f, (along % paso) - largo - 1.5), 0, 1))
    return m, agujas


# ================================================================ 1. LONA
LONAS = {
    'cobalto': dict(base=rgb('2645B0'), hilo=rgb('C9D3F2'), cuerda=rgb('BDB3A0'), weave=0.2, spec=0.13, mott=0.03, k=0.78),
    'cruda': dict(base=rgb('D9D0BD'), hilo=rgb('5A5D66'), cuerda=rgb('2C4CB8'), weave=0.55, spec=0.03, mott=0.035, k=0.85),
    'grava': dict(base=rgb('44464F'), hilo=rgb('A9AEB9'), cuerda=rgb('BDB3A0'), weave=0.3, spec=0.10, mott=0.03, k=0.8),
}


def tela(H, W, v, seed, wrap=False, pliegues=None, arrugas=1.0):
    """Altura de la tela: trama, fibras, hilos gruesos, arrugas suaves y pliegues de doblado."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    p = 8.0
    hm = v['weave'] * np.sin(2 * np.pi * xx / p) * np.sin(2 * np.pi * yy / p)
    hm += 0.22 * noise(H, W, 0.7, seed + 1, wrap)
    rng = np.random.default_rng(seed + 2)
    slub = ndi.gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), (0.6, 9), mode='wrap' if wrap else 'reflect')
    hm += 0.9 * slub / (slub.std() + 1e-6) * (0.25 if v is LONAS['cobalto'] else 0.45)
    hm += arrugas * 2.2 * fbm(H, W, (70, 26), (1, 0.4), seed + 3, wrap)
    if pliegues:
        for k, (eje, pos, signo) in enumerate(pliegues):
            wob = 2.0 * noise(H, W, 40, seed + 10 + k, wrap)
            dd = (xx if eje == 'x' else yy) - pos + wob
            if wrap:
                n = W if eje == 'x' else H
                dd = (dd + n / 2) % n - n / 2
            fuerza = np.clip(0.6 + 0.4 * noise(H, W, 80, seed + 20 + k, wrap), 0.15, 1.2)
            hm += signo * 3.6 * np.clip(1 - np.abs(dd) / 11, 0, 1) ** 1.7 * fuerza
            hm -= signo * 0.8 * np.exp(-(dd / 26) ** 2) * fuerza   # el doblez hunde un poco a los lados
    return hm


def colorear_tela(hm, v, seed, wrap=False, extra_occ=None):
    H, W = hm.shape
    d, sp = shade(hm, k=v['k'], wrap=wrap)
    ao = oclusion(hm, 9, 0.09, wrap)
    if extra_occ is not None:
        ao *= extra_occ
    mott = 1 + v['mott'] * fbm(H, W, (40, 6), (1, 0.6), seed + 5, wrap)
    col = v['base'][None, None, :] * mott[..., None] * (0.36 + 0.6 * np.minimum(d, 1.3))[..., None] * ao[..., None]
    col += v['spec'] * (sp ** 22)[..., None]
    return col


def lona9(color, seed, P=360, m=110, hem=86):
    """9-slice: S = esquina; un ojal por periodo P en cada borde; m = margen exterior (cuerdas y sombra)."""
    v = LONAS[color]
    S = int(m + hem / 2 + P / 2)
    N = 2 * S + P
    H = W = N
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    x0 = y0 = m; x1 = y1 = N - m
    sd = rrect_sd(xx, yy, x0, y0, x1, y1, 14) + 1.6 * noise(H, W, 12, seed)
    din = -sd
    alpha = np.clip(din + 0.5, 0, 1)
    hm = tela(H, W, v, seed, arrugas=0.0)
    hm += 0.35 * fbm(H, W, (50, 18), (1, .5), seed + 4) * ss(S - 40, S - 110, np.minimum.reduce([xx, W - xx, yy, H - yy]) * 0 + 0)
    # dobladillo: doble capa, canto enrollado
    hm += 3.0 * (1 - ss(hem - 3, hem + 3, din))
    hm += 2.6 * np.sqrt(np.clip(din / 8, 0, 1))
    # refuerzos triangulares en las esquinas (otra capa de lona cosida en diagonal)
    refz = np.zeros_like(hm); stitch_ref = np.zeros_like(hm)
    for (cx, cy, sx, sy) in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
        u = (xx - cx) * sx; w = (yy - cy) * sy
        diag = u + w
        L = 205.0
        tri = (1 - ss(L - 3, L + 3, diag)) * (u > -2) * (w > -2)
        refz = np.maximum(refz, tri)
        stitch_ref = np.maximum(stitch_ref, np.clip(1.6 - np.abs(diag - (L - 14)), 0, 1) * ((diag % 13) < 8) * (u > hem * 0.4) * (w > hem * 0.4))
    hm += 1.6 * refz
    # ojales: esquinas y uno a mitad de cada borde
    g = m + hem / 2
    pos = [(g, g), (W - g, g), (g, H - g), (W - g, H - g), (W / 2, g), (W / 2, H - g), (g, H / 2), (W - g, H / 2)]
    ri, ro = 17, 31
    for (gx, gy) in pos:
        rr = np.hypot(xx - gx, yy - gy); th = np.arctan2(yy - gy, xx - gx)
        hm += 2.8 * np.exp(-(rr - ro - 5) ** 2 / (2 * 5.0 ** 2))
        hm += 1.0 * np.cos(7 * th) * np.exp(-(rr - 52) ** 2 / (2 * 14.0 ** 2)) * (rr > ro)
    # pliegues de tensión desde los ojales de esquina, que mueren antes del corte
    for (cx, cy) in pos[:4]:
        base_ang = math.atan2(H / 2 - cy, W / 2 - cx)
        for kk, amp in ((-1, 3.0), (0, 4.4), (1, 3.0)):
            a = base_ang + kk * 0.24
            ux, uy = math.cos(a), math.sin(a)
            dx, dy = xx - cx, yy - cy
            s = dx * ux + dy * uy; t = -dx * uy + dy * ux
            wdt = 6 + np.clip(s, 0, None) * 0.05
            hm += amp * np.exp(-t * t / (2 * wdt * wdt)) * ss(30, 60, s) * (1 - ss(150, S - m - 30, s))
    # pespuntes del dobladillo
    dist4 = np.stack([xx - x0, x1 - xx, yy - y0, y1 - yy])
    along = np.where(np.argmin(dist4, 0) < 2, yy, xx)
    st, agujas = costura(xx, yy, din, (13.0, hem - 9.0), along=along)
    hm += 0.9 * st + 0.7 * stitch_ref
    col = colorear_tela(hm, v, seed)
    col *= (1 - 0.07 * (1 - ss(hem - 2, hem + 2, din)))[..., None]
    col *= (1 - 0.05 * refz)[..., None]
    # suciedad: bordes y alrededor de los ojales
    sucio = np.exp(-np.clip(din, 0, None) / 40) * np.clip(0.5 + 0.5 * fbm(H, W, (14, 4), (1, .5), seed + 7), 0, 1.4)
    for (gx, gy) in pos:
        sucio += 0.6 * np.exp(-np.hypot(xx - gx, yy - gy) / 38) * np.clip(0.6 + 0.4 * noise(H, W, 5, seed + 8), 0, 1.5)
    dirt = rgb('5B4E44')
    k = 0.2 * np.clip(sucio, 0, 1.4)
    col = col * (1 - k[..., None]) + (dirt * 0.65)[None, None, :] * k[..., None] * 0.55 + col * k[..., None] * 0.45
    hilo = v['hilo']
    col = col * (1 - 0.85 * np.maximum(st, stitch_ref)[..., None]) + hilo[None, None, :] * 0.9 * np.maximum(st, stitch_ref)[..., None]
    col *= (1 - 0.5 * agujas)[..., None]
    for i, (gx, gy) in enumerate(pos):
        ojal(col, alpha, gx, gy, ri, ro, seed=seed + 30 + i)
    # amarres: la cuerda sale del ojal de esquina hacia fuera y se pierde en el margen
    for i, (gx, gy) in enumerate(pos[:4]):
        ang = math.atan2(gy - H / 2, gx - W / 2)
        ex, ey = gx + math.cos(ang) * 175, gy + math.sin(ang) * 175
        mx, my = (gx + ex) / 2 + 8, (gy + ey) / 2 + 12
        pts = [((1 - t) ** 2 * gx + 2 * (1 - t) * t * mx + t * t * ex, (1 - t) ** 2 * gy + 2 * (1 - t) * t * my + t * t * ey)
               for t in np.linspace(0, 1, 26)]
        # vuelta de la cuerda alrededor del canto (un lazo corto antes de salir)
        lazo = [(gx + 18 * math.cos(a2), gy + 18 * math.sin(a2)) for a2 in np.linspace(ang + 2.4, ang + 2.4 + 4.2, 14)]
        poner_cuerda(col, alpha, lazo, 13, v['cuerda'] * 0.95, seed=seed + 60 + i, sombra=0.3)
        poner_cuerda(col, alpha, pts, 15, v['cuerda'], seed=seed + 50 + i, fin=60)
    guardar(f'lona_{color}_9', col, alpha, sombra=(10, 16, 16, 0.5))
    return S, m, N


def lona_tela(color, seed, n=768):
    v = LONAS[color]
    pl = [('x', n * 0.5, 1), ('y', n * 0.5, -1)]
    hm = tela(n, n, v, seed, wrap=True, pliegues=pl, arrugas=0.7)
    col = colorear_tela(hm, v, seed, wrap=True)
    guardar_rgb(f'lona_{color}_tela', col)


def pancarta(nombre, color, W, H, seed, n_ojales=14, cuerdas=True, telon=None, m=120, hem=80):
    """Lona rectangular suelta: cinta de capítulo o mitad del telón."""
    v = LONAS[color]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    if telon == 'izq':
        x0, y0, x1, y1 = -40, -40, W - m * 0.35, H + 40
    elif telon == 'der':
        x0, y0, x1, y1 = m * 0.35, -40, W + 40, H + 40
    else:
        x0, y0, x1, y1 = m, m, W - m, H - m
    sd = rrect_sd(xx, yy, x0, y0, x1, y1, 16) + 1.8 * noise(H, W, 14, seed)
    din = -sd
    alpha = np.clip(din + 0.5, 0, 1)
    big = min(W, H)
    pl = []
    if telon:
        pl = [('y', H * f, s) for f, s in ((0.25, 1), (0.5, -1), (0.75, 1))] + [('x', W * 0.5, -1)]
    else:
        pl = [('x', W * f, s) for f, s in ((0.25, 1), (0.5, -1), (0.75, 1))]
    hm = tela(H, W, v, seed, pliegues=pl, arrugas=0.8 if telon else 0.5)
    hm += 3.0 * (1 - ss(hem - 3, hem + 3, din)) + 2.6 * np.sqrt(np.clip(din / 8, 0, 1))
    # posiciones de ojales
    pos = []
    if telon:
        xg = x1 - hem / 2 if telon == 'izq' else x0 + hem / 2
        pos = [(xg, y) for y in np.arange(140, H - 60, 190.0)]
    else:
        xs = np.linspace(x0 + hem / 2, x1 - hem / 2, n_ojales)
        pos = [(x, y0 + hem / 2) for x in xs] + [(x, y1 - hem / 2) for x in xs]
    ri, ro = (17, 31)
    for (gx, gy) in pos:
        rr = np.hypot(xx - gx, yy - gy)
        hm += 2.8 * np.exp(-(rr - ro - 5) ** 2 / (2 * 25.0))
    # arrugas de pancarta: diagonales desde las esquinas tensadas
    if cuerdas and not telon:
        for (cx, cy) in ((x0 + hem / 2, y0 + hem / 2), (x1 - hem / 2, y0 + hem / 2), (x0 + hem / 2, y1 - hem / 2), (x1 - hem / 2, y1 - hem / 2)):
            ba = math.atan2(H / 2 - cy, W / 2 - cx)
            for kk, amp in ((-1, 3.0), (0, 4.6), (1, 3.0)):
                a = ba + kk * 0.13
                ux, uy = math.cos(a), math.sin(a)
                dx, dy = xx - cx, yy - cy
                s = dx * ux + dy * uy; t = -dx * uy + dy * ux
                wdt = 7 + np.clip(s, 0, None) * 0.03
                hm += amp * np.exp(-t * t / (2 * wdt * wdt)) * ss(30, 70, s) * (1 - ss(W * 0.12, W * 0.3, s))
    dist4 = np.stack([xx - x0, x1 - xx, yy - y0, y1 - yy])
    along = np.where(np.argmin(dist4, 0) < 2, yy, xx)
    st, agujas = costura(xx, yy, din, (13.0, hem - 9.0), along=along)
    hm += 0.9 * st
    col = colorear_tela(hm, v, seed)
    col *= (1 - 0.07 * (1 - ss(hem - 2, hem + 2, din)))[..., None]
    sucio = np.exp(-np.clip(din, 0, None) / 46) * np.clip(0.5 + 0.5 * fbm(H, W, (16, 4), (1, .5), seed + 7), 0, 1.4)
    if telon:
        sucio += ss(H * 0.7, H, yy) * 0.6 * np.clip(0.5 + 0.5 * fbm(H, W, (30, 6), (1, .5), seed + 9), 0, 1.4)
    k = 0.2 * np.clip(sucio, 0, 1.4)
    col = col * (1 - 0.55 * k[..., None])
    col = col * (1 - 0.85 * st[..., None]) + v['hilo'][None, None, :] * 0.9 * st[..., None]
    col *= (1 - 0.5 * agujas)[..., None]
    for i, (gx, gy) in enumerate(pos):
        ojal(col, alpha, gx, gy, ri, ro, seed=seed + 30 + i)
    if cuerdas and not telon:
        for i, (gx, gy) in enumerate([pos[0], pos[n_ojales - 1], pos[n_ojales], pos[-1]]):
            ang = math.atan2(gy - H / 2, (gx - W / 2) * 0.25)
            ex, ey = gx + math.cos(ang) * 190, gy + math.sin(ang) * 190
            mx, my = (gx + ex) / 2 + 6, (gy + ey) / 2 + 14
            pts = [((1 - t) ** 2 * gx + 2 * (1 - t) * t * mx + t * t * ex, (1 - t) ** 2 * gy + 2 * (1 - t) * t * my + t * t * ey)
                   for t in np.linspace(0, 1, 26)]
            poner_cuerda(col, alpha, pts, 15, v['cuerda'], seed=seed + 50 + i, fin=70)
    if telon:
        # cordón que enlaza los ojales del borde interior, colgando hacia el centro
        for i, (gx, gy) in enumerate(pos):
            sgn = 1 if telon == 'izq' else -1
            pts = [(gx + sgn * 40 * t + sgn * 10 * math.sin(3 * t), gy + 60 * t * t) for t in np.linspace(0, 1, 14)]
            poner_cuerda(col, alpha, pts, 12, v['cuerda'], seed=seed + 70 + i, fin=30, sombra=0.3)
    guardar(nombre, col, alpha, sombra=None if telon else (10, 18, 18, 0.5))


def friso_lona(seed, W=1440, H=200):
    """Franja de lona repetible en x con dobladillo y ojales abajo (barra superior)."""
    v = LONAS['cobalto']
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    hem = 64
    din = (H - 22) - yy + 1.2 * noise(H, W, 10, seed, wrap=True)
    alpha = np.clip(din + 0.5, 0, 1)
    hm = tela(H, W, v, seed, wrap=True, pliegues=[('x', W * 0.25, 1), ('x', W * 0.75, -1)], arrugas=0.4)
    hm += 3.0 * (1 - ss(hem - 3, hem + 3, din)) + 2.6 * np.sqrt(np.clip(din / 8, 0, 1))
    pos = [(x, H - 22 - hem / 2) for x in np.arange(120, W, 240.0)]
    ri, ro = 13, 24
    for (gx, gy) in pos:
        rr = np.hypot(xx - gx, yy - gy)
        hm += 2.4 * np.exp(-(rr - ro - 4) ** 2 / (2 * 16.0))
    st, ag = costura(xx, yy, din, (11.0, hem - 8.0), along=xx)
    hm += 0.9 * st
    col = colorear_tela(hm, v, seed, wrap=True)
    col *= (1 - 0.07 * (1 - ss(hem - 2, hem + 2, din)))[..., None]
    col = col * (1 - 0.85 * st[..., None]) + v['hilo'][None, None, :] * 0.9 * st[..., None]
    col *= (1 - 0.5 * ag)[..., None]
    for i, (gx, gy) in enumerate(pos):
        ojal(col, alpha, gx, gy, ri, ro, seed=seed + i)
    guardar('friso_lona', col, alpha, sombra=None)


# ================================================================ 2. FICHA
FICHAS = {
    'carton': dict(base=rgb('DCD5C6'), tinta=rgb('2443A8'), fibra=0.32, borde=0.14),
    'blanca': dict(base=rgb('EDECE6'), tinta=rgb('2443A8'), fibra=0.2, borde=0.1),
    'cobalto': dict(base=rgb('2A49B4'), tinta=rgb('EEF0F3'), fibra=0.22, borde=0.18),
}


def carton(H, W, f, seed, vertical):
    rng = np.random.default_rng(seed)
    sig = (6.0, 0.7) if vertical else (0.7, 6.0)
    fib = ndi.gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), sig)
    fib /= fib.std()
    hm = f['fibra'] * fib + 1.0 * fbm(H, W, (90, 30), (1, .4), seed + 2) + 0.2 * noise(H, W, 0.7, seed + 3)
    motas = ndi.gaussian_filter((rng.random((H, W)) < 0.003).astype(np.float32), (sig[0] * 0.25 + 0.4, sig[1] * 0.25 + 0.4)) * 3
    return hm, fib, np.clip(motas, 0, 1)


def ficha(material, orient, seed):
    f = FICHAS[material]
    vertical = orient == 'v'
    if vertical:
        W, H = 1100, 1800
        x0, y0, x1, y1 = 170, 260, 930, 1660
        corte = 120
        pts = [(x0 + corte, y0), (x1 - corte, y0), (x1, y0 + corte), (x1, y1), (x0, y1), (x0, y0 + corte)]
        hc = ((x0 + x1) / 2, y0 + 120)
    else:
        W, H = 1700, 1000
        x0, y0, x1, y1 = 260, 110, 1600, 880
        corte = 120
        pts = [(x0 + corte, y0), (x1, y0), (x1, y1), (x0 + corte, y1), (x0, y1 - corte), (x0, y0 + corte)]
        hc = (x0 + 110, (y0 + y1) / 2)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    mk = poly_mask(W, H, pts)
    din = ndi.distance_transform_edt(mk > 0.5).astype(np.float32)
    mella = noise(H, W, 1.4, seed) * 1.1 + noise(H, W, 7, seed + 1) * 0.9
    alpha = np.clip(mk * np.clip(din + mella, 0, 1), 0, 1)
    hm, fib, motas = carton(H, W, f, seed, vertical)
    rr = np.hypot(xx - hc[0], yy - hc[1])
    refuerzo = 1 - ss(78, 82, rr)
    hm += 2.2 * refuerzo + 0.6 * np.exp(-(rr - 80) ** 2 / 8)
    # curvatura ligera del cartón
    curva = (xx / W - 0.5) ** 2 * 18 if vertical else (yy / H - 0.5) ** 2 * 18
    hm -= curva
    hm = ndi.gaussian_filter(hm, 0.6)
    d, sp = shade(hm, k=0.9)
    mott = 1 + 0.022 * fbm(H, W, (40, 5), (1, .5), seed + 3)
    col = f['base'][None, None, :] * mott[..., None] * (0.58 + 0.44 * np.minimum(d, 1.3))[..., None]
    col *= (1 - 0.3 * motas)[..., None]
    col *= (1 - 0.06 * refuerzo)[..., None]
    col *= (1 - f['borde'] * np.exp(-din / 6))[..., None]
    # mancha de agua, huella de grasa y polvo
    wx, wy = (x1 - 240, y1 - 380) if vertical else (x1 - 330, y1 - 140)
    wr = np.hypot(xx - wx, yy - wy)
    col *= (1 - 0.09 * np.exp(-(wr - 92) ** 2 / (2 * 3.5 ** 2)) * (0.6 + 0.4 * noise(H, W, 8, seed + 4)))[..., None]
    col *= (1 - 0.04 * (wr < 92) * (0.5 + 0.5 * noise(H, W, 20, seed + 5)))[..., None]
    for (sx, sy, s) in (((x0 + 120, y1 - 140, 46), (x1 - 110, y0 + 330, 34)) if vertical else ((x0 + 260, y1 - 90, 44), (x1 - 140, y0 + 120, 32))):
        blob = np.exp(-((xx - sx) ** 2 + (yy - sy) ** 2) / (2 * s * s))
        crestas = 0.5 + 0.5 * np.sin(np.hypot(xx - sx, yy - sy) * 0.9)
        col *= (1 - 0.08 * blob * (0.6 + 0.4 * crestas))[..., None]
    # tinta impresa (filete, cabecera, líneas del talón, perforación)
    ink = np.zeros((H, W), np.float32)
    ins = 26
    if vertical:
        fy0 = y0 + 230
        ink = np.maximum(ink, (np.abs(xx - (x0 + ins)) < 2) * (yy > fy0) * (yy < y1 - ins))
        ink = np.maximum(ink, (np.abs(xx - (x1 - ins)) < 2) * (yy > fy0) * (yy < y1 - ins))
        ink = np.maximum(ink, (np.abs(yy - fy0) < 2) * (xx > x0 + ins) * (xx < x1 - ins))
        ink = np.maximum(ink, (np.abs(yy - (y1 - ins)) < 2) * (xx > x0 + ins) * (xx < x1 - ins))
        cab = (yy > fy0 + 22) & (yy < fy0 + 140) & (xx > x0 + ins + 22) & (xx < x1 - ins - 22)
        ink = np.maximum(ink, cab.astype(np.float32))
        perf_y = y1 - 300
        for ly in (y1 - 210, y1 - 120):
            ink = np.maximum(ink, (np.abs(yy - ly) < 1.3) * (xx > x0 + 260) * (xx < x1 - ins - 30))
        caja = (np.abs(xx - (x0 + ins + 40)) < 1.5) | (np.abs(xx - (x0 + 230)) < 1.5)
        ink = np.maximum(ink, (caja & (yy > y1 - 250) & (yy < y1 - 70)).astype(np.float32))
        ink = np.maximum(ink, ((np.abs(yy - (y1 - 250)) < 1.5) | (np.abs(yy - (y1 - 70)) < 1.5)) * (xx > x0 + ins + 40) * (xx < x0 + 230))
    else:
        fx0 = x0 + 230
        px = x1 - 300
        ink = np.maximum(ink, (np.abs(yy - (y0 + ins)) < 2) * (xx > fx0) * (xx < x1 - ins))
        ink = np.maximum(ink, (np.abs(yy - (y1 - ins)) < 2) * (xx > fx0) * (xx < x1 - ins))
        ink = np.maximum(ink, (np.abs(xx - (x1 - ins)) < 2) * (yy > y0 + ins) * (yy < y1 - ins))
        ink = np.maximum(ink, (np.abs(xx - fx0) < 2) * (yy > y0 + ins) * (yy < y1 - ins))
        cab = (yy > y0 + ins + 20) & (yy < y0 + ins + 110) & (xx > fx0 + 20) & (xx < px - 26)
        ink = np.maximum(ink, cab.astype(np.float32))
        for ly in (y0 + 330, y0 + 480, y0 + 630):
            ink = np.maximum(ink, (np.abs(yy - ly) < 1.3) * (xx > px + 40) * (xx < x1 - ins - 24))
        perf_y = None
    ink = ndi.gaussian_filter(ink.astype(np.float32), 0.6)
    grano = np.clip(0.76 + 0.24 * noise(H, W, 0.8, seed + 6) + 0.12 * fib, 0.3, 1)
    gasto = np.clip(0.85 + 0.15 * fbm(H, W, (24, 6), (1, .5), seed + 7), 0.4, 1)
    ink *= grano * gasto
    col = col * (1 - 0.92 * ink[..., None]) + (f['tinta'][None, None, :] * (0.82 + 0.22 * np.minimum(d, 1.2))[..., None]) * 0.92 * ink[..., None]
    # sello de goma (círculo con doble aro), un poco torcido
    sx, sy = (x1 - 190, y0 + 520) if vertical else (x0 + 560, y1 - 190)
    sr = np.hypot(xx - sx, yy - sy)
    sello = (np.clip(2.2 - np.abs(sr - 92), 0, 1) + np.clip(1.6 - np.abs(sr - 78), 0, 1))
    sello *= np.clip(0.55 + 0.45 * noise(H, W, 2.2, seed + 8), 0, 1) * ss(-0.4, 0.6, noise(H, W, 18, seed + 9))
    tinta_sello = rgb('2645B0') if material != 'cobalto' else rgb('EEF0F3')
    col = col * (1 - 0.55 * sello[..., None]) + tinta_sello[None, None, :] * 0.55 * sello[..., None]
    # perforación del talón
    perf = np.zeros((H, W), np.float32)
    if vertical:
        for px_ in np.arange(x0 + 14, x1 - 8, 15.0):
            perf = np.maximum(perf, np.clip(3.0 - np.hypot(xx - px_, yy - perf_y) + 0.5, 0, 1))
    else:
        px = x1 - 300
        for py_ in np.arange(y0 + 12, y1 - 6, 15.0):
            perf = np.maximum(perf, np.clip(3.0 - np.hypot(xx - px, yy - py_) + 0.5, 0, 1))
    col *= (1 - 0.3 * ndi.gaussian_filter(perf, 1.6))[..., None]
    alpha *= (1 - perf)
    ojal(col, alpha, hc[0], hc[1], 21, 34, seed=seed + 11)
    # cordel: lazo que entra por el ojal
    cordel = rgb('E6E8EC') if material != 'blanca' else rgb('C9B98F') * 0 + rgb('2F4FB8')
    if vertical:
        tramos = (((hc[0] - 70, 0), (hc[0] - 40, hc[1] - 140)), ((hc[0] + 60, 0), (hc[0] + 46, hc[1] - 150)))
    else:
        tramos = (((0, hc[1] - 170), (hc[0] - 120, hc[1] - 40)), ((0, hc[1] + 140), (hc[0] - 120, hc[1] + 70)))
    for k, ((ex, ey), (mx, my)) in enumerate(tramos):
        pts = [((1 - t) ** 2 * hc[0] + 2 * (1 - t) * t * mx + t * t * ex, (1 - t) ** 2 * hc[1] + 2 * (1 - t) * t * my + t * t * ey)
               for t in np.linspace(0, 1, 34)]
        poner_cuerda(col, alpha, pts, 9, cordel, torsion=8, seed=seed + 20 + k, fin=50, sombra=0.32)
    guardar(f'ficha_{orient}_{material}', col, alpha, sombra=(10, 16, 16, 0.5))


# ================================================================ 3. FARDO
FARDOS = {
    'blanco': dict(saco=rgb('E7E9EC'), franja=rgb('2645B0'), cuerda=rgb('B9AF9B'), hilo=rgb('8E929C')),
    'azul': dict(saco=rgb('2D4DB8'), franja=rgb('EEF0F3'), cuerda=rgb('C2B8A4'), hilo=rgb('C9D3F2')),
}


def fardo(color, orient, seed):
    v = FARDOS[color]
    if orient == 'h':
        W, H = 1600, 1150
    else:
        W, H = 1150, 1500
    pad = 80
    cx, cy = W / 2, H / 2
    a, b = (W - 2 * pad) / 2, (H - 2 * pad) / 2
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    nx_, ny_ = (xx - cx) / a, (yy - cy) / b
    n = 7.0
    r = (np.abs(nx_) ** n + np.abs(ny_) ** n) ** (1 / n) + 0.010 * noise(H, W, 18, seed)
    alpha = np.clip((1 - r) * min(a, b) + 0.5, 0, 1)
    for sx in (-1, 1):
        for sy in (-1, 1):
            ex, ey = cx + sx * a * 0.935, cy + sy * b * 0.91
            ang = math.atan2(sy * b, sx * a)
            ux, uy = math.cos(ang), math.sin(ang)
            s_, t_ = (xx - ex) * ux + (yy - ey) * uy, -(xx - ex) * uy + (yy - ey) * ux
            alpha = np.maximum(alpha, np.clip((1 - (s_ / 52) ** 2 - (t_ / 22) ** 2) * 30, 0, 1))
    hm = 110 * np.clip(1 - np.clip(r, 0, 1) ** 6, 0, 1) ** 0.35
    ry = (cy - b * 0.6, cy + b * 0.6)
    rx = (cx - a * 0.72, cx + a * 0.72)
    for y in ry:
        hm -= 24 * np.exp(-(yy - y) ** 2 / (2 * 16 ** 2))
    for x in rx:
        hm -= 22 * np.exp(-(xx - x) ** 2 / (2 * 16 ** 2))
    hm += 2.4 * fbm(H, W, (40, 14), (1, .5), seed + 1)
    for x in rx:
        for y in ry:
            rr = np.hypot(xx - x, yy - y); th = np.arctan2(yy - y, xx - x)
            hm += 3.0 * np.cos(6 * th) * np.exp(-(rr - 46) ** 2 / (2 * 24 ** 2))
    # arrugas de tensión a lo largo de las cuerdas
    for y in ry:
        hm += 1.6 * np.sin(xx / 23 + 2 * noise(H, W, 30, seed + 2)) * np.exp(-(yy - y) ** 2 / (2 * 40 ** 2))
    tape = 11.0
    wx, wy = (xx / tape) % 1, (yy / tape) % 1
    top = ((np.floor(xx / tape) + np.floor(yy / tape)) % 2) == 0
    weave = np.where(top, np.sin(np.pi * wy), np.sin(np.pi * wx))
    hueco = np.where(top, (wy < 0.07) | (wy > 0.93), (wx < 0.07) | (wx > 0.93)).astype(np.float32)
    d, sp = shade(hm + 1.1 * weave, k=0.72)
    ao = oclusion(hm, 22, 0.035)
    mott = 1 + 0.03 * fbm(H, W, (50, 4), (1, .6), seed + 3)
    brillo = np.where(top, 1.0, 0.92)
    col = v['saco'][None, None, :] * (mott * brillo * ao)[..., None] * (0.36 + 0.66 * np.minimum(d, 1.3))[..., None] + 0.2 * (sp ** 30)[..., None]
    col *= (1 - 0.2 * hueco)[..., None]
    # franjas impresas y su texto (bandas finas a modo de rótulo)
    ink = np.zeros((H, W), np.float32)
    for (ya, yb) in ((cy - b * 0.87, cy - b * 0.78), (cy + b * 0.78, cy + b * 0.87)):
        ink = np.maximum(ink, ss(ya - 1, ya + 1, yy) * (1 - ss(yb - 1, yb + 1, yy)))
        mid = (ya + yb) / 2
        ink = np.maximum(ink, (np.abs(yy - (ya - 16)) < 2.2) * (np.abs(xx - cx) < a * 0.5))
    ink *= np.clip(0.72 + 0.28 * noise(H, W, 1.2, seed + 4) - 0.4 * np.clip(fbm(H, W, (20, 5), (1, .5), seed + 5) - 0.9, 0, 1), 0, 1)
    ink *= (1 - 0.7 * hueco)
    col = col * (1 - ink[..., None]) + (v['franja'][None, None, :] * (0.45 + 0.6 * np.minimum(d, 1.3))[..., None]) * ink[..., None]
    polvo = ss(cy + b * 0.25, cy + b, yy) * np.clip(0.5 + 0.5 * fbm(H, W, (30, 8), (1, .5), seed + 6), 0, 1.4)
    col = col * (1 - 0.13 * polvo[..., None]) + rgb('6D6155')[None, None, :] * 0.07 * polvo[..., None]
    # costura de cierre: puntadas gruesas en cadeneta
    for xs in np.arange(cx - a * 0.86, cx + a * 0.86, 24.0):
        t = (xs - cx) / a
        yt = cy - b * (1 - abs(t) ** n) ** (1 / n) + 34
        poner_cuerda(col, alpha, [(xs, yt - 5), (xs + 9, yt + 3), (xs + 17, yt - 4)], 7, v['hilo'], torsion=5, seed=int(xs), sombra=0.25)
    for y in ry:
        xa, xb = cx - a * 0.99, cx + a * 0.99
        pts = [(x, y + 6 * math.sin(math.pi * (x - xa) / (xb - xa))) for x in np.linspace(xa, xb, 70)]
        poner_cuerda(col, alpha, pts, 19, v['cuerda'], seed=seed + int(y), fin=24, inicio=24)
    for x in rx:
        ya, yb = cy - b * 0.99, cy + b * 0.99
        pts = [(x + 5 * math.sin(math.pi * (y - ya) / (yb - ya)), y) for y in np.linspace(ya, yb, 60)]
        poner_cuerda(col, alpha, pts, 19, v['cuerda'], seed=seed + 7 + int(x), fin=24, inicio=24)
    for i, x in enumerate(rx):
        for j, y in enumerate(ry):
            ang = np.linspace(0, 2 * np.pi * 1.2, 44)
            pts = [(x + 17 * math.cos(t) + 3.4 * t, y + 15 * math.sin(t)) for t in ang]
            poner_cuerda(col, alpha, pts, 16, v['cuerda'] * 0.96, seed=seed + 40 + 3 * i + j, sombra=0.42)
    x, y = rx[1], ry[1]
    for k, (ex, ey) in enumerate(((x + 70, y + 170), (x + 112, y + 146))):
        pts = [(x + 8 + (ex - x) * t + 11 * math.sin(3 * t), y + 6 + (ey - y) * t) for t in np.linspace(0, 1, 28)]
        poner_cuerda(col, alpha, pts, 15, v['cuerda'], seed=seed + 60 + k, sombra=0.42)
        # cabo deshilachado: unos pelos al final
        rng = np.random.default_rng(seed + 80 + k)
        for _ in range(5):
            a0 = rng.uniform(-0.6, 0.6) + math.atan2(ey - y, ex - x)
            L = rng.uniform(12, 26)
            poner_cuerda(col, alpha, [(ex, ey), (ex + L * math.cos(a0), ey + L * math.sin(a0))], 2.2, v['cuerda'] * 1.05, torsion=4,
                         seed=int(rng.integers(1e6)), sombra=0.15, fin=8)
    guardar(f'fardo_{color}_{orient}', col, alpha, sombra=(12, 18, 20, 0.55))


# ================================================================ 4. BIDÓN
BIDONES = {'cobalto': rgb('2645B0'), 'blanco': rgb('E9EBEF')}


def bidon(color, seed, S=1200):
    plast = BIDONES[color]
    c = S / 2
    k = S / 820
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    dx, dy = xx - c, yy - c
    d = np.hypot(dx, dy); th = np.arctan2(dy, dx)
    Ro, Ri, Rl = 372 * k, 334 * k, 298 * k
    alpha = np.clip(Ro - d + 0.5, 0, 1)
    la = math.radians(38); ux, uy = math.cos(la), math.sin(la)
    s = dx * ux + dy * uy; t = -dx * uy + dy * ux
    oreja = np.clip(48 * k - np.abs(t), 0, 1) * np.clip(s - Ri, 0, 1) * np.clip(Ro + 34 * k - s, 0, 1)
    alpha = np.maximum(alpha, oreja)
    hm = np.zeros((S, S), np.float32)
    tt = np.clip((d - Ri) / (Ro - Ri), 0, 1)
    aro = (d >= Ri) & (d <= Ro)
    hm += np.where(aro, 20 * k + 15 * k * np.sin(np.pi * tt), 0)
    hm += np.where((d < Ri) & (d >= Rl), 13 * k + 5 * k * np.sin(np.pi * (d - Rl) / (Ri - Rl)), 0)
    tapa = d < Rl
    hm += np.where(tapa, 6 * k + 3 * k * (1 - (d / Rl) ** 2), 0)
    for g in (262.0 * k, 214.0 * k):
        hm -= 3.4 * k * np.exp(-(d - g) ** 2 / (2 * (3.2 * k) ** 2)) * tapa
    # pestañas moldeadas en el borde y tapón
    for j in range(6):
        aa = j * np.pi / 3 + 0.3
        bx_, by_ = c + 318 * k * math.cos(aa), c + 318 * k * math.sin(aa)
        hm += 3 * k * np.exp(-((xx - bx_) ** 2 + (yy - by_) ** 2) / (2 * (7 * k) ** 2))
    bx, by = c + 238 * k * math.cos(math.radians(-52)), c + 238 * k * math.sin(math.radians(-52))
    bd = np.hypot(xx - bx, yy - by)
    hm += np.where(bd < 27 * k, 7 * k, 0) + 3 * k * np.exp(-(bd - 27 * k) ** 2 / (6 * k))
    hexa = np.abs(np.cos(3 * np.arctan2(yy - by, xx - bx)))
    hm += np.where(bd < 15 * k, 3 * k + 0.6 * k * hexa, 0)
    orej = (np.abs(t) < 48 * k) & (s > Ri) & (s < Ro + 34 * k)
    hm += np.where(orej, 32 * k + 6 * k * np.clip(1 - np.abs(t) / (48 * k), 0, 1), 0)
    hm += 0.4 * noise(S, S, 1.2, seed)
    hm = ndi.gaussian_filter(hm, 1.0)
    dd, sp = shade(hm, k=0.9 / k)
    dd = np.minimum(dd, 1.3)
    ao = oclusion(hm, 10 * k, 0.03)
    metal = METAL * (1 + 0.05 * noise(S, S, 3, seed + 1))[..., None]
    pl = plast * (1 + 0.035 * fbm(S, S, (30, 4), (1, .6), seed + 2))[..., None]
    es_metal = ((d >= Ri - 1) | orej).astype(np.float32)
    col = pl * (1 - es_metal[..., None]) + metal * es_metal[..., None]
    col = col * (0.32 + 0.64 * dd)[..., None] * ao[..., None] + ((0.6 * es_metal + 0.16 * (1 - es_metal)) * sp ** 28)[..., None]
    # tornillo y tuerca de la orejeta
    bxx, byy = c + ux * (Ro + 6 * k), c + uy * (Ro + 6 * k)
    bdist = np.hypot(xx - bxx, yy - byy)
    tornillo = np.clip(15 * k - bdist, 0, 1)
    hexn = np.abs(np.cos(3 * (np.arctan2(yy - byy, xx - bxx) + 0.3)))
    tl = 0.55 + 0.6 * np.clip(1 - bdist / (15 * k), 0, 1) * (0.7 + 0.3 * hexn)
    col = col * (1 - tornillo[..., None]) + (METAL[None, None, :] * 0.8 * tl[..., None]) * tornillo[..., None]
    # arañazos, polvo en los surcos, borde gastado
    rng = np.random.default_rng(seed)
    scr = Image.new('L', (S, S), 0)
    dr = ImageDraw.Draw(scr)
    for _ in range(110):
        r0 = rng.uniform(40, Rl - 10); a0 = rng.uniform(0, 2 * np.pi)
        x_, y_ = c + r0 * math.cos(a0), c + r0 * math.sin(a0)
        ang = rng.uniform(0, np.pi); ln = rng.uniform(10, 70) * k
        dr.line([(x_, y_), (x_ + ln * math.cos(ang), y_ + ln * math.sin(ang))], fill=int(rng.uniform(50, 150)), width=1)
    scr = np.asarray(scr).astype(np.float32) / 255 * tapa
    col = col + (0.2 if color == 'cobalto' else -0.12) * scr[..., None]
    for g in (262.0 * k, 214.0 * k):
        col *= (1 - 0.2 * np.exp(-(d - g) ** 2 / (2 * (3 * k) ** 2)) * tapa)[..., None]
    polvo = np.clip(0.5 + 0.5 * fbm(S, S, (40, 8), (1, .5), seed + 4), 0, 1.4) * ss(Rl * 0.5, Rl, d) * tapa
    col = col * (1 - 0.1 * polvo[..., None]) + rgb('6D6155')[None, None, :] * 0.06 * polvo[..., None]
    guardar(f'bidon_{color}', col, alpha, sombra=(10, 16, 20, 0.55))


def bidon_aro(seed, W=1600, H=300):
    """Costado del bidón: banda cobalto con dos aros de rodadura (altímetro en la barra móvil)."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    m = 26
    sd = rrect_sd(xx, yy, m, m, W - m, H - m, 22)
    alpha = np.clip(-sd + 0.5, 0, 1)
    v = (yy - m) / (H - 2 * m)
    hm = 30 * np.clip(np.sin(np.pi * np.clip(v, 0, 1)), 0, 1) ** 0.6
    for c_ in (0.2, 0.8):
        hm += 10 * np.exp(-((v - c_) / 0.045) ** 2)
    hm += 0.4 * noise(H, W, 1.2, seed)
    # curvatura del cilindro en x (luz que corre por el costado)
    u = (xx - W / 2) / (W / 2 - m)
    d, sp = shade(hm, k=0.6)
    cil = 0.55 + 0.45 * np.cos(np.clip(u, -1, 1) * 1.1)
    col = COBALTO[None, None, :] * (0.32 + 0.66 * np.minimum(d, 1.3))[..., None] * cil[..., None]
    col += (0.22 * sp ** 24 * np.exp(-((u + 0.35) / 0.25) ** 2))[..., None]
    rng = np.random.default_rng(seed)
    scr = Image.new('L', (W, H), 0)
    dr = ImageDraw.Draw(scr)
    for _ in range(60):
        x_ = rng.uniform(m, W - m); y_ = rng.uniform(m, H - m); ln = rng.uniform(10, 60)
        dr.line([(x_, y_), (x_ + ln, y_ + rng.uniform(-6, 6))], fill=int(rng.uniform(60, 140)), width=1)
    col += 0.18 * (np.asarray(scr).astype(np.float32) / 255)[..., None]
    guardar('bidon_aro', col, alpha, sombra=(6, 10, 10, 0.5))


# ================================================================ 5. MORRENA
def morrena(nombre, W, H, seed, vertical=False, banda=0.36, n=1500, rmax=24):
    """Franja de grava y piedras repetible (en x, o en y si vertical)."""
    if vertical:
        W, H = H, W
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    zbuf = np.full((H, W), -1e9, np.float32)
    col = np.zeros((H, W, 3), np.float32)
    largo, ancho = (H, W) if vertical else (W, H)
    eje = xx if vertical else yy
    centro = ancho / 2
    borde = ancho * banda + ancho * 0.08 * noise(1, largo, 30, seed, wrap=True)[0] + ancho * 0.04 * noise(1, largo, 6, seed + 1, wrap=True)[0]
    borde = borde[:, None] if vertical else borde[None, :]
    band = ndi.gaussian_filter((np.abs(eje - centro) < borde).astype(np.float32), 1.0)
    grit_h = 1.3 * noise(H, W, 0.8, seed + 2, wrap=True)
    zbuf = np.where(band > 0.5, grit_h, zbuf)
    grit_c = rgb('2A2B31')[None, None, :] * (1 + 0.28 * noise(H, W, 0.6, seed + 3, wrap=True))[..., None]
    col = np.where((band > 0.5)[..., None], grit_c, col)
    pal = [(MORRENA, 3), (rgb('24262C'), 3), (rgb('34363D'), 3), (GRAVA, 2), (rgb('4A4C54'), 2),
           (rgb('8E8C88'), 0.8), (rgb('A7A39C'), 0.4), (rgb('5C4F49'), 0.5), (rgb('3B4A78'), 0.25)]
    ws = np.array([w for _, w in pal]); ws /= ws.sum()
    for i in range(n):
        R = 3 + rmax * rng.random() ** 3.2
        p_l = rng.uniform(0, largo)
        p_a = centro + rng.normal(0, ancho * banda * 0.42) * (1.0 if R < rmax * 0.55 else 0.7)
        x, y = (p_a, p_l) if vertical else (p_l, p_a)
        asp = rng.uniform(0.55, 1.0); ang = rng.uniform(0, np.pi)
        lados = int(rng.integers(5, 9))
        fases = rng.uniform(0, 2 * np.pi, 2)
        cb = pal[rng.choice(len(pal), p=ws)][0] * rng.uniform(0.85, 1.12)
        z0 = rng.uniform(0, 4); ext = int(R + 3)
        ys = np.arange(int(y) - ext, int(y) + ext + 1); xs = np.arange(int(x) - ext, int(x) + ext + 1)
        if vertical:
            xs = xs[(xs >= 0) & (xs < W)]
        else:
            ys = ys[(ys >= 0) & (ys < H)]
        if len(ys) == 0 or len(xs) == 0:
            continue
        gx, gy = np.meshgrid(xs.astype(np.float32), ys.astype(np.float32))
        dx, dy = gx - x, gy - y
        rx_ = dx * math.cos(ang) + dy * math.sin(ang)
        ry_ = (-dx * math.sin(ang) + dy * math.cos(ang)) / asp
        th = np.arctan2(ry_, rx_)
        # contorno anguloso: polígono irregular de `lados` caras
        sector = 2 * np.pi / lados
        local = ((th + fases[0]) % sector) - sector / 2
        rad = R * math.cos(sector / 2) / np.cos(local) * (1 + 0.08 * np.sin(3 * th + fases[1]))
        dn = np.hypot(rx_, ry_) / rad
        inside = dn < 1
        facet = np.cos(np.floor((th + fases[0]) / sector) * 1.7 + fases[1]) * 0.25
        hz = z0 + R * 0.55 * np.sqrt(np.clip(1 - dn ** 2, 0, 1)) * (1 + facet * (1 - dn))
        yi = np.mod(ys, H) if vertical else ys
        xi = xs if vertical else np.mod(xs, W)
        sub_z = zbuf[np.ix_(yi, xi)]
        upd = inside & (hz > sub_z)
        zbuf[np.ix_(yi, xi)] = np.where(upd, hz, sub_z)
        sub_c = col[np.ix_(yi, xi)]
        col[np.ix_(yi, xi)] = np.where(upd[..., None], cb[None, None, :], sub_c)
    have = zbuf > -1e8
    hm = np.where(have, zbuf, 0)
    if vertical:
        dd, sp = shade(hm.T, k=1.0, wrap=False)
        dd, sp = dd.T, sp.T
        p = np.pad(hm, ((2, 2), (0, 0)), mode='wrap')
        gy_, gx_ = np.gradient(p); gx_, gy_ = gx_[2:-2], gy_[2:-2]
        nx, ny = -gx_, -gy_
        inv = 1 / np.sqrt(nx * nx + ny * ny + 1)
        dd = np.clip((nx * LUZ[0] + ny * LUZ[1] + LUZ[2]) * inv / LUZ[2], 0, 1.45)
    else:
        dd, sp = shade(hm, k=1.0, wrap=True)
    tex = 1 + 0.09 * noise(H, W, 0.7, seed + 9, wrap=True)
    out = col * tex[..., None] * (0.33 + 0.8 * np.minimum(dd, 1.35))[..., None]
    occ = ndi.gaussian_filter(hm, 2.2, mode='wrap') - hm
    out *= np.clip(1 - 0.06 * np.clip(occ, 0, 8), 0.55, 1)[..., None]
    # destellos de hielo entre la grava
    brillo = (rng.random((H, W)) < 0.0008) & (band > 0.5)
    out += 0.5 * ndi.gaussian_filter(brillo.astype(np.float32), 0.8)[..., None] * np.array([0.8, 0.88, 1.0])[None, None, :]
    alpha = np.clip(ndi.gaussian_filter(have.astype(np.float32), 0.6, mode='wrap') * 1.4, 0, 1)
    guardar(nombre, out, alpha, sombra=None)


# ================================================================ principal
def quiero(f):
    return SEL is None or f in SEL


if __name__ == '__main__':
    if quiero('lona'):
        info = {}
        for i, c in enumerate(('cobalto', 'cruda', 'grava')):
            info[c] = lona9(c, 11 + i)
            lona_tela(c, 21 + i)
        print('lona9 S, m, N =', info['cobalto'])
        pancarta('cinta_cobalto', 'cobalto', 2600, 620, 31)
        pancarta('cinta_cruda', 'cruda', 2600, 620, 32)
        pancarta('telon_izq', 'cobalto', 1300, 2200, 33, telon='izq')
        pancarta('telon_der', 'cobalto', 1300, 2200, 34, telon='der')
        friso_lona(35)
    if quiero('ficha'):
        for i, mat in enumerate(('carton', 'blanca', 'cobalto')):
            ficha(mat, 'v', 41 + i)
            ficha(mat, 'h', 51 + i)
    if quiero('fardo'):
        for i, c in enumerate(('blanco', 'azul')):
            fardo(c, 'h', 61 + i)
            fardo(c, 'v', 71 + i)
    if quiero('bidon'):
        bidon('cobalto', 81)
        bidon('blanco', 82)
        bidon_aro(83)
    if quiero('morrena'):
        morrena('morrena_ancha', 2400, 300, 91)
        morrena('morrena_fina', 2400, 130, 92, banda=0.3, n=1600, rmax=13)
        morrena('morrena_v', 2400, 220, 93, vertical=True, banda=0.3, n=1500, rmax=16)
