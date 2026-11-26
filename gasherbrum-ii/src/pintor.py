"""Pintor de trazos y acabado (README §3, §4, §5.4, §6, §7).

pintar(T, reg, theta_def, ...) reinterpreta la imagen objetivo con cinco pasadas de pinceladas
(de gruesa a fina) sobre un lienzo a SS = 2 veces la resolución final; rebrush() repinta la utilería
dentro de su máscara; acabado() aplica, a resolución final, el pulso inseguro, la paleta apagada,
el grano del papel, el fondo oscuro que asoma, la tiza, el borde y la viñeta.
"""
import math
import numpy as np
from scipy import ndimage as ndi
from PIL import Image, ImageDraw
from util import smooth, mix, fbm, ruido_valor, desenfoque, luminancia

# id: (longitud de trazo en anchos, dirección por defecto, peso tiza, peso hueco)
REGIONES = {
    0: (8.0, -0.30, 0.58, 0.34),   # cielo
    1: (3.0, None, 0.36, 0.20),    # nube / niebla (remolino)
    2: (4.5, math.pi / 2, 0.40, 0.30),   # montaña
    3: (4.0, 0.5, 0.36, 0.34),     # roca / morrena / nieve cercana
    4: (4.0, -0.12, 0.28, 0.32),   # terreno lejano
    5: (4.0, -0.12, 0.22, 0.28),   # terreno cercano
}
PASADAS = [(34, 72, None), (17, 62, 14), (8.5, 52, 13), (4.6, 46, 12.5), (3.0, 40, 13)]


def campo_orientacion(T, reg, theta_def, U, rng):
    """θ del tensor de estructura de la luminancia; donde hay poca energía, dirección por defecto
    (de la región o, en las caras de montaña, la línea de máxima pendiente)."""
    H, W = reg.shape
    unit = math.sqrt(W * H)
    lum = desenfoque(luminancia(T), 1.6 * U)
    gy, gx = np.gradient(lum)
    s4 = 4 * U
    Jxx = desenfoque(gx * gx, s4); Jyy = desenfoque(gy * gy, s4); Jxy = desenfoque(gx * gy, s4)
    ang = 0.5 * np.arctan2(2 * Jxy, Jxx - Jyy) + np.pi / 2
    energia = np.sqrt(Jxx + Jyy)
    umbral = np.where(reg == 0, 2.6 / U, 1.3 / U)
    default = np.zeros((H, W), np.float32)
    for k, (_, dd, _, _) in REGIONES.items():
        if dd is not None:
            default[reg == k] = dd
    # nubes: remolino (ruido x 7 rad)
    nub = reg == 1
    if nub.any():
        default[nub] = (fbm((H, W), 2.0, 2, rng, unit)[nub] - 0.5) * 7.0
    default = default + (fbm((H, W), 3, 3, rng, unit) - 0.5) * 0.9 * (reg == 0)
    if theta_def is not None:
        ok = np.isfinite(theta_def)
        default = np.where(ok, theta_def, default)
    theta = np.where(energia > umbral, ang, default)
    # en caras de montaña con poca energía relativa, mezclar hacia la caída para que el trazo baje
    if theta_def is not None:
        ok = np.isfinite(theta_def) & (energia < 2.2 * umbral)
        c2 = np.cos(2 * theta); s2 = np.sin(2 * theta)
        c2d = np.cos(2 * np.nan_to_num(theta_def)); s2d = np.sin(2 * np.nan_to_num(theta_def))
        w = np.where(ok, 0.55, 0.0)
        theta = np.where(ok, 0.5 * np.arctan2(s2 * (1 - w) + s2d * w, c2 * (1 - w) + c2d * w), theta)
    return theta.astype(np.float32)


def _trazar(px, py, col, theta, Tc, maxpasos, paso, tol, mascara=None):
    """Avance vectorizado de todas las pinceladas de una pasada.  Devuelve (puntos, n)."""
    H, W = theta.shape
    n = px.size
    P = np.zeros((n, maxpasos.max() + 1, 2), np.float32)
    P[:, 0, 0] = px; P[:, 0, 1] = py
    cnt = np.ones(n, np.int32)
    vivo = np.ones(n, bool)
    rng_sig = np.where(np.random.default_rng(int(px.size)).random(n) < 0.5, -1.0, 1.0).astype(np.float32)
    dx_prev = np.zeros(n, np.float32); dy_prev = np.zeros(n, np.float32)
    x = px.copy(); y = py.copy()
    colf = col.astype(np.float32)
    for k in range(int(maxpasos.max())):
        idx = np.nonzero(vivo)[0]
        if idx.size == 0:
            break
        xi = np.clip(x[idx].astype(np.int32), 0, W - 1); yi = np.clip(y[idx].astype(np.int32), 0, H - 1)
        th = theta[yi, xi]
        dx = np.cos(th); dy = np.sin(th)
        if k == 0:
            dx *= rng_sig[idx]; dy *= rng_sig[idx]
        else:
            flip = (dx * dx_prev[idx] + dy * dy_prev[idx]) < 0
            dx = np.where(flip, -dx, dx); dy = np.where(flip, -dy, dy)
        nx_ = x[idx] + dx * paso; ny_ = y[idx] + dy * paso
        dentro = (nx_ >= 0) & (nx_ < W) & (ny_ >= 0) & (ny_ < H)
        xi2 = np.clip(nx_.astype(np.int32), 0, W - 1); yi2 = np.clip(ny_.astype(np.int32), 0, H - 1)
        dif = np.abs(Tc[yi2, xi2].astype(np.float32) - colf[idx]).sum(1)
        ok = dentro & (dif < tol[idx]) & (k < maxpasos[idx])
        if mascara is not None:
            ok &= mascara[yi2, xi2]
        sigue = idx[ok]
        x[sigue] = nx_[ok]; y[sigue] = ny_[ok]
        dx_prev[sigue] = dx[ok]; dy_prev[sigue] = dy[ok]
        P[sigue, cnt[sigue], 0] = x[sigue]; P[sigue, cnt[sigue], 1] = y[sigue]
        cnt[sigue] += 1
        vivo[idx[~ok]] = False
    return P, cnt


def _dibujar(draw, P, cnt, cols, anchos, rng, orden):
    """Dibuja las pinceladas (polilínea + extremos redondos) y sus cerdas."""
    n_tr, m, _ = P.shape
    # normales por punto (vectorizado) para desplazar las cerdas
    d = np.zeros_like(P)
    d[:, :-1] = P[:, 1:] - P[:, :-1]
    last = np.clip(cnt - 1, 0, m - 1)
    ar = np.arange(n_tr)
    prev = np.clip(cnt - 2, 0, m - 1)
    d[ar, last] = d[ar, prev]
    nn = np.hypot(d[..., 0], d[..., 1])[..., None] + 1e-6
    nrm = np.stack([-d[..., 1], d[..., 0]], -1) / nn
    nb_tr = np.where(anchos >= 14, 3, np.where(anchos >= 7, 2, np.where(anchos >= 4, 1, 0)))
    offs = rng.uniform(-0.40, 0.40, (n_tr, 3)) * anchos[:, None]
    dcs = rng.uniform(-16, 16, (n_tr, 3))
    cols_i = np.clip(cols, 0, 255).astype(np.int32)
    colb = np.clip(cols[:, None, :] + dcs[..., None], 0, 255).astype(np.int32)
    for i in orden:
        n = int(cnt[i])
        w = float(anchos[i])
        c = cols_i[i]
        fill = (int(c[0]), int(c[1]), int(c[2]))
        pts = P[i, :n]
        r = w / 2
        if n == 1:
            draw.ellipse([pts[0, 0] - r, pts[0, 1] - r, pts[0, 0] + r, pts[0, 1] + r], fill=fill)
            continue
        draw.line(pts.ravel().tolist(), fill=fill, width=max(1, int(round(w))), joint='curve')
        if w >= 4:
            draw.ellipse([pts[0, 0] - r, pts[0, 1] - r, pts[0, 0] + r, pts[0, 1] + r], fill=fill)
            draw.ellipse([pts[n - 1, 0] - r, pts[n - 1, 1] - r, pts[n - 1, 0] + r, pts[n - 1, 1] + r], fill=fill)
        nb = nb_tr[i]
        if nb:
            bw = max(1, int(round(0.17 * w)))
            nr = nrm[i, :n]
            for b in range(nb):
                q = pts + nr * offs[i, b]
                cb = colb[i, b]
                draw.line(q.ravel().tolist(), fill=(int(cb[0]), int(cb[1]), int(cb[2])), width=bw, joint='curve')


def pintar(T, reg, theta, U, SS, rng, pasadas=PASADAS, lienzo=None, mascara=None, largo_mult=1.0,
           semillas_mascara=None, log=None):
    """T: (H, W, 3) a resolución final; devuelve el lienzo PIL a SS× y la T del lienzo (uint8)."""
    H, W = reg.shape
    H2, W2 = H * SS, W * SS
    Uc = U * SS
    Tc = np.asarray(Image.fromarray(np.clip(T, 0, 255).astype(np.uint8)).resize((W2, H2), Image.BICUBIC))
    reg2 = np.asarray(Image.fromarray(reg).resize((W2, H2), Image.NEAREST))
    th2 = np.asarray(Image.fromarray(np.ascontiguousarray(theta, np.float32)).resize((W2, H2), Image.NEAREST))
    # θ en coordenadas del lienzo: misma orientación (escala isótropa)
    if lienzo is None:
        base = desenfoque(Tc.astype(np.float32), 10 * Uc)
        lienzo = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))
    draw = ImageDraw.Draw(lienzo)
    largo = np.zeros(256, np.float32)
    for k, v in REGIONES.items():
        largo[k] = v[0]
    total = 0
    for ip, (ancho_U, tol, umbral) in enumerate(pasadas):
        w = ancho_U * Uc
        sp = 0.74 * w
        gx = np.arange(sp / 2, W2, sp); gy = np.arange(sp / 2, H2, sp)
        X, Y = np.meshgrid(gx, gy)
        X = (X + rng.uniform(-sp / 2, sp / 2, X.shape)).ravel().astype(np.float32)
        Y = (Y + rng.uniform(-sp / 2, sp / 2, Y.shape)).ravel().astype(np.float32)
        X = np.clip(X, 0, W2 - 1); Y = np.clip(Y, 0, H2 - 1)
        xi = X.astype(np.int32); yi = Y.astype(np.int32)
        sel = np.ones(X.size, bool)
        if semillas_mascara is not None:
            sel &= semillas_mascara[yi, xi]
        if umbral is not None:
            L = np.asarray(lienzo).astype(np.int16)
            err = np.abs(L - Tc.astype(np.int16)).mean(2).astype(np.float32)
            err = ndi.uniform_filter(err, size=max(3, int(sp)))
            sel &= err[yi, xi] > umbral
        X, Y, xi, yi = X[sel], Y[sel], xi[sel], yi[sel]
        if X.size == 0:
            continue
        n = X.size
        col = Tc[yi, xi].astype(np.float32) + rng.normal(0, 8, (n, 1)) + rng.normal(0, 4.5, (n, 3))
        col = np.clip(col, 0, 255)
        rg = reg2[yi, xi]
        maxp = (largo[rg] * largo_mult / 0.7 * rng.uniform(0.6, 1.25, n)).astype(np.int32)
        maxp = np.maximum(maxp, 1)
        tolv = np.full(n, tol, np.float32)
        P, cnt = _trazar(X, Y, col, th2, Tc, maxp, 0.7 * w, tolv, mascara)
        anchos = w * rng.uniform(0.88, 1.12, n)
        orden = rng.permutation(n)
        _dibujar(draw, P, cnt, col, anchos, rng, orden)
        total += n
        if log:
            log(f'  pasada {ip + 1}: {n} trazos, ancho {w:.1f}px')
    return lienzo, Tc


def rebrush(lienzo, mascara, U, SS, rng, log=None):
    """Repinta solo dentro de la máscara tomando el propio lienzo como objetivo (README §5.4)."""
    if mascara is None or not mascara.any():
        return lienzo
    A = np.asarray(lienzo).copy()
    H2, W2 = mascara.shape
    Uc = U * SS
    # orientación del propio lienzo
    lum = desenfoque(luminancia(A.astype(np.float32)), 1.6 * Uc)
    gy, gx = np.gradient(lum)
    Jxx = desenfoque(gx * gx, 3 * Uc); Jyy = desenfoque(gy * gy, 3 * Uc); Jxy = desenfoque(gx * gy, 3 * Uc)
    th = (0.5 * np.arctan2(2 * Jxy, Jxx - Jyy) + np.pi / 2).astype(np.float32)
    dentro = ndi.binary_erosion(mascara, iterations=max(1, int(1.0 * Uc)))
    draw = ImageDraw.Draw(lienzo)
    for ancho_U, tol in ((6.5, 64), (3.8, 50), (2.5, 42)):
        w = ancho_U * Uc
        sp = 0.74 * w
        ys, xs = np.nonzero(dentro[::max(1, int(sp)), ::max(1, int(sp))])
        if xs.size == 0:
            continue
        X = (xs * max(1, int(sp)) + rng.uniform(-sp / 2, sp / 2, xs.size)).clip(0, W2 - 1).astype(np.float32)
        Y = (ys * max(1, int(sp)) + rng.uniform(-sp / 2, sp / 2, ys.size)).clip(0, H2 - 1).astype(np.float32)
        ok = dentro[Y.astype(np.int32), X.astype(np.int32)]
        X, Y = X[ok], Y[ok]
        n = X.size
        if n == 0:
            continue
        col = A[Y.astype(np.int32), X.astype(np.int32)].astype(np.float32) + rng.normal(0, 5, (n, 1)) + rng.normal(0, 3, (n, 3))
        col = np.clip(col, 0, 255)
        maxp = np.maximum(1, (3.0 / 0.7 * rng.uniform(0.6, 1.25, n)).astype(np.int32))
        P, cnt = _trazar(X, Y, col, th, A, maxp, 0.7 * w, np.full(n, tol, np.float32), mascara)
        _dibujar(draw, P, cnt, col, w * rng.uniform(0.85, 1.1, n), rng, rng.permutation(n))
        if log:
            log(f'  rebrush {ancho_U}U: {n} trazos')
    return lienzo


def rayas(shape, largo, grosor, angulo, escala_grande, U, rng):
    """Campo de rayas (README §7.4): ruido normal con desenfoque anisótropo rotado, normalizado a σ=1,
    y ruido de valor grande que agrupa las rayas en bandas."""
    H, W = shape
    D = int(math.ceil(math.hypot(H, W))) + 8
    r = rng.standard_normal((D, D)).astype(np.float32)
    r = ndi.gaussian_filter(r, (grosor * U, largo * U), mode='wrap')
    r = ndi.rotate(r, angulo, reshape=False, order=1, mode='wrap')
    y0 = (D - H) // 2; x0 = (D - W) // 2
    s = r[y0:y0 + H, x0:x0 + W]
    s = (s - s.mean()) / (s.std() + 1e-9)
    unit = math.sqrt(W * H)
    big = ruido_valor((H, W), unit / (escala_grande * U), rng, unit)
    return s, big


def acabado(a, reg, U, rng, escena, log=None):
    """Acabado §7 sobre la imagen reducida (H, W, 3) float32 0-255."""
    H, W = reg.shape
    unit = math.sqrt(W * H)
    momento = escena.get('acabado', 'dia')
    fondo = np.array((8, 9, 20) if momento == 'noche' else escena.get('fondo', (34, 36, 48)), np.float32)
    tiza = np.array(escena.get('tiza', {'alba': (246, 228, 208), 'ocaso': (246, 226, 204),
                                         'noche': (176, 190, 226)}.get(momento, (240, 236, 224))), np.float32)
    k_tiza = escena.get('k_tiza', {'alba': 0.9, 'ocaso': 0.9, 'noche': 0.50}.get(momento, 1.0))
    k_hueco = escena.get('k_hueco', 0.9 if momento == 'noche' else 1.0)
    # pesos por región, suavizados 5U
    Wt = np.zeros((H, W), np.float32); Wg = np.zeros((H, W), np.float32)
    for k, (_, _, wt, wg) in REGIONES.items():
        Wt[reg == k] = wt; Wg[reg == k] = wg
    Wt = desenfoque(Wt, 5 * U) * k_tiza
    Wg = desenfoque(Wg, 5 * U) * k_hueco
    # 7.1 pulso inseguro
    dx = (fbm((H, W), 26, 3, rng, unit) - 0.5) * 9 * U + (fbm((H, W), 90, 2, rng, unit) - 0.5) * 2 * U
    dy = (fbm((H, W), 26, 3, rng, unit) - 0.5) * 9 * U + (fbm((H, W), 90, 2, rng, unit) - 0.5) * 2 * U
    J, I = np.mgrid[0:H, 0:W].astype(np.float32)
    a = np.stack([ndi.map_coordinates(a[..., k], [J + dy, I + dx], order=1, mode='reflect') for k in range(3)], -1)
    del J, I, dx, dy
    # 7.2 paleta apagada y lavado turbio
    lum = luminancia(a)[..., None]
    a = a + (lum - a) * 0.20
    a = a * (0.89 + 0.20 * fbm((H, W), 2.2, 4, rng, unit))[..., None]
    a = mix(a, np.array([96, 100, 118], np.float32), (0.12 * smooth(0.35, 0.75, fbm((H, W), 3.5, 3, rng, unit)))[..., None])
    # 7.3 grano del papel
    g1 = ndi.gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 0.75 * U)
    g2 = ndi.gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 1.9 * U)
    tooth = 0.7 * g1 / g1.std() + 0.6 * g2 / g2.std()
    del g1, g2
    # 7.5 fondo oscuro que asoma (solo en los valles del papel)
    s1, b1 = rayas((H, W), 46, 1.5, 9, 150, U, rng)
    gap = smooth(0.9, 2.1, s1 + 2.0 * (b1 - 0.5)) * smooth(0.5, -0.9, tooth)
    s2, b2 = rayas((H, W), 16, 1.0, -14, 90, U, rng)
    gap = np.maximum(gap, smooth(1.1, 2.2, s2 + 2.2 * (b2 - 0.5)) * smooth(0.4, -0.8, tooth))
    pits = smooth(-1.35, -2.1, tooth)
    k = np.clip(gap * Wg + 0.20 * pits, 0, 1)
    a = mix(a, fondo, k[..., None])
    del s1, b1, s2, b2, gap, pits
    # 7.6 arrastres de tiza clara (solo en las crestas del papel); atenuada en zonas oscuras
    s3, b3 = rayas((H, W), 60, 1.3, 7, 170, U, rng)
    sc = smooth(0.7, 1.9, s3 + 2.4 * (b3 - 0.5)) * smooth(0.1, 1.1, tooth)
    s4, b4 = rayas((H, W), 22, 0.9, 19, 110, U, rng)
    sc = np.maximum(sc, smooth(0.9, 2.0, s4 + 2.4 * (b4 - 0.5)) * smooth(0.2, 1.2, tooth))
    s5, b5 = rayas((H, W), 9, 1.6, -30, 70, U, rng)
    sc = np.maximum(sc, 0.8 * smooth(1.2, 2.2, s5 + 2.6 * (b5 - 0.5)) * smooth(0.3, 1.2, tooth))
    del s3, b3, s4, b4, s5, b5
    oscuro = smooth(escena.get('tiza_lum0', 30), escena.get('tiza_lum1', 120), luminancia(a))
    kt = np.clip(sc * Wt * (0.35 + 0.65 * oscuro), 0, 1)
    a = mix(a, mix(a, tiza, 0.72), kt[..., None])
    # 7.7 grano fino, borde irregular, viñeta y tinte
    a = a * (1 + 0.045 * np.clip(tooth, -2.5, 2.5))[..., None]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    dist_borde = np.minimum.reduce([xx, W - 1 - xx, yy, H - 1 - yy]) / U
    borde = smooth(12 + 34 * fbm((H, W), 7, 3, rng, unit), 0, dist_borde) * smooth(1.0, -0.6, tooth + 0.8)
    a = mix(a, fondo, (0.6 * borde)[..., None])
    r2 = 2 * ((xx / W - 0.5) ** 2 + (yy / H - 0.5) ** 2)
    a = a * (1 - 0.20 * smooth(0.25, 1.0, r2))[..., None]
    del xx, yy, dist_borde, borde, r2
    a = a * np.array([1.015, 1.0, 0.965], np.float32)
    # máscara de enfoque: radio 1.2U, 35 %, umbral 2
    bl = desenfoque(a, 1.2 * U)
    dif = a - bl
    a = np.where(np.abs(dif) > 2, a + 0.35 * dif, a)
    return np.clip(a, 0, 255)
