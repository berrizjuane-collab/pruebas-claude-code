"""Efectos de oclusion natural para transiciones: bancos de nube en paralaje, paso a traves
de una nube y ventisca (nieve arrastrada por el viento).

Las nubes son campos de densidad periodicos (sintesis espectral + deformacion de dominio)
proyectados en varias capas a distintas profundidades. Se iluminan con un sol en pantalla
(direccion 2D derivada del plano) y se componen con alfa: la transicion ocurre detras de
la zona de mayor cobertura.
"""
import math

import cv2
import numpy as np

from .noise import spectral_noise

_FIELDS = {}


def _field(n=1024, seed=11, kind="cloud"):
    key = (n, seed, kind)
    if key in _FIELDS:
        return _FIELDS[key]
    if kind == "cloud":
        # formas grandes y suaves (espectro empinado) con algo de detalle en los bordes
        base = spectral_noise(n, 3.6, seed)
        mid = spectral_noise(n, 3.0, seed + 1)
        det = spectral_noise(n, 2.4, seed + 4)
        wx = spectral_noise(n, 3.4, seed + 2)
        wy = spectral_noise(n, 3.4, seed + 3)
        yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
        amp = n * 0.06
        mx = ((xx + wx * amp) % n).astype(np.float32)
        my = ((yy + wy * amp) % n).astype(np.float32)
        b = cv2.remap(base.astype(np.float32), mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
        d = b + 0.45 * mid + 0.12 * det
    else:
        base = spectral_noise(n, 2.4, seed)
        det = spectral_noise(n, 1.6, seed + 1)
        d = base + 0.4 * det
    d = (d - d.mean()) / (d.std() + 1e-6)
    _FIELDS[key] = d.astype(np.float32)
    return _FIELDS[key]


def _sample(field, W, H, scale_px, off, stretch=(1.0, 1.0), rot=0.0):
    """Muestra el campo periodico en pantalla: un periodo ocupa scale_px pixeles."""
    n = field.shape[0]
    k = n / scale_px
    c, s = math.cos(rot), math.sin(rot)
    sx, sy = stretch
    M = np.array([[k * c / sx, -k * s / sx, 0.0], [k * s / sy, k * c / sy, 0.0]], np.float64)
    M[0, 2] = off[0] - (M[0, 0] * W / 2 + M[0, 1] * H / 2)
    M[1, 2] = off[1] - (M[1, 0] * W / 2 + M[1, 1] * H / 2)
    return cv2.warpAffine(field, M, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP,
                          borderMode=cv2.BORDER_WRAP)


def _light(d, sun2d, blur_px):
    """Sombreado volumetrico aproximado: gradiente de la densidad suavizada hacia el sol."""
    ds = cv2.GaussianBlur(d, (0, 0), max(blur_px, 1.0))
    gx = cv2.Sobel(ds, cv2.CV_32F, 1, 0, ksize=3) / 8.0
    gy = cv2.Sobel(ds, cv2.CV_32F, 0, 1, ksize=3) / 8.0
    g = -(gx * sun2d[0] + gy * sun2d[1]) * blur_px * 2.2
    return 0.5 + 0.5 * np.tanh(g)


def _layer(d, th, soft, sun2d, lit, shade, blur_px, k):
    a = np.clip((d - th) / soft, 0, 1)
    a = a * a * (3 - 2 * a)
    sh = _light(d, sun2d, blur_px)
    dens = np.clip((d - th) / (soft * 3.0), 0, 1)
    lit_ = np.array(lit, np.float32)
    shade_ = np.array(shade, np.float32)
    col = shade_[None, None] + (lit_ - shade_)[None, None] * (sh * (1.0 - 0.35 * dens))[..., None]
    # bordes finos: mas luz transmitida (borde plateado cuando el sol esta detras)
    rim = (1.0 - dens) * a
    col = col + rim[..., None] * 0.04
    return col, a


def cloud_bank(W, H, t, cover, sun2d=(0.6, -0.5), lit=(1.0, 0.97, 0.93), shade=(0.55, 0.60, 0.68),
               drift=(-1.0, 0.0), front=None, seed=11, scale=1.0):
    """Capas de nube a la deriva, de la mas lejana a la mas cercana. cover en [0,1].
    front: (x0, ancho) en fraccion de pantalla para un frente que barre la imagen.
    Devuelve (rgb, alfa) float32."""
    f = _field(seed=seed)
    k = W / 3840.0
    rgb = np.zeros((H, W, 3), np.float32)
    alpha = np.zeros((H, W), np.float32)
    layers = ((0.8, 0.6, 0.8, 1.5), (1.4, 1.0, 0.9, 3.0), (2.6, 1.8, 1.0, 7.0))  # escala, vel., peso, desenfoque
    for li, (sc, sp, wgt, bl) in enumerate(layers):
        scale_px = 3000 * sc * scale * k
        off = (drift[0] * t * sp * 700 / sc + li * 313.0, drift[1] * t * sp * 700 / sc + li * 197.0)
        d = _sample(f, W, H, scale_px, off)
        th = 1.9 - cover * 3.6 + 0.15 * li
        if front is not None:
            x = (np.arange(W, dtype=np.float32) / W)[None, :]
            th = th + (x - front[0]) / max(front[1], 1e-3) * 1.4
        col, a = _layer(d, th, 1.1, sun2d, lit, shade, 18 * sc * k, k)
        a = a * wgt
        if bl > 0:
            col = cv2.GaussianBlur(col, (0, 0), bl * k + 0.3)
            a = cv2.GaussianBlur(a, (0, 0), bl * k + 0.3)
        rgb = rgb * (1 - a[..., None]) + col * a[..., None]
        alpha = alpha + a * (1 - alpha)
    return rgb, alpha


def cloud_tunnel(W, H, t, cover, sun2d=(0.5, -0.6), lit=(1.0, 0.97, 0.93), shade=(0.62, 0.66, 0.72), seed=17):
    """Paso a traves de una nube: capas que crecen desde el centro (la camara avanza)."""
    f = _field(seed=seed)
    k = W / 3840.0
    rgb = np.zeros((H, W, 3), np.float32)
    alpha = np.zeros((H, W), np.float32)
    for li in range(4):
        z = (t * 1.4 + li * 0.25) % 1.0
        sc = 0.45 + 3.0 * z ** 2.0
        scale_px = 2600 * sc * k
        d = _sample(f, W, H, scale_px, (li * 211.0, li * 157.0))
        th = 1.9 - cover * 3.8
        col, a = _layer(d, th, 1.2, sun2d, lit, shade, 16 * sc * k, k)
        a = a * math.sin(math.pi * z) ** 0.6
        bl = (1.5 + 10.0 * z ** 2) * k + 0.3
        col = cv2.GaussianBlur(col, (0, 0), bl)
        a = cv2.GaussianBlur(a, (0, 0), bl)
        rgb = rgb * (1 - a[..., None]) + col * a[..., None]
        alpha = alpha + a * (1 - alpha)
    return rgb, alpha


def spindrift(W, H, t, amount, wind=(-1.0, 0.18), seed=23):
    """Nieve arrastrada: velos estirados en la direccion del viento + cristales con estela."""
    f = _field(seed=seed, kind="streak")
    k = W / 3840.0
    ang = math.atan2(wind[1], wind[0])
    rgb = np.zeros((H, W, 3), np.float32)
    alpha = np.zeros((H, W), np.float32)
    for li, (sc, sp, st) in enumerate(((1.0, 1.0, 9.0), (0.55, 1.6, 14.0), (0.3, 2.4, 22.0))):
        scale_px = 1800 * sc * k
        off = (t * sp * 2600 / sc + li * 101.0, li * 53.0)
        d = _sample(f, W, H, scale_px, off, stretch=(st, 1.0), rot=-ang)
        th = 2.2 - amount * 3.6 + li * 0.2
        a = np.clip((d - th) / 1.1, 0, 1) ** 1.5 * (0.85 - 0.2 * li)
        rgb = rgb * (1 - a[..., None]) + np.array((0.92, 0.95, 0.98), np.float32) * a[..., None]
        alpha = alpha + a * (1 - alpha)
    # cristales: puntos brillantes con estela (desenfoque de movimiento)
    rng = np.random.default_rng(seed)
    n = int(2600 * amount)
    if n > 0:
        sp = np.zeros((H, W), np.float32)
        xs = (rng.uniform(0, 1, n) * W + t * 5200 * k * rng.uniform(0.6, 1.4, n) * math.cos(ang)) % W
        ys = (rng.uniform(0, 1, n) * H + t * 5200 * k * rng.uniform(0.6, 1.4, n) * math.sin(ang)) % H
        sp[ys.astype(int), xs.astype(int)] = rng.uniform(0.4, 1.0, n)
        L = int(60 * k) | 1
        ker = np.zeros((L, L), np.float32)
        cv2.line(ker, (0, L // 2 - int(L / 2 * math.tan(ang))), (L - 1, L // 2 + int(L / 2 * math.tan(ang))), 1.0, 1)
        ker /= max(ker.sum(), 1)
        sp = cv2.filter2D(sp, -1, ker) * L * 0.5
        sp = cv2.GaussianBlur(sp, (0, 0), 0.8 * k + 0.2)
        a2 = np.clip(sp, 0, 1)
        rgb = rgb * (1 - a2[..., None]) + np.array((1.0, 1.0, 1.0), np.float32) * a2[..., None]
        alpha = alpha + a2 * (1 - alpha)
    return rgb, alpha


def palette_from(img):
    """Colores de luz y sombra de las nubes tomados del propio plano (nieve iluminada y
    tonos medios), para que la nube pertenezca a la luz de la escena."""
    small = cv2.resize(img, (192, 108), interpolation=cv2.INTER_AREA).reshape(-1, 3)
    lum = small @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    o = np.argsort(lum)
    n = len(o)
    lit = small[o[int(n * 0.97):]].mean(0)
    mid = small[o[int(n * 0.40):int(n * 0.65)]].mean(0)
    lit = np.clip(lit * 1.08 + 0.03, 0, 1)
    shade = np.clip(mid * 0.45 + lit * 0.45, 0, 1)
    return tuple(float(v) for v in lit), tuple(float(v) for v in shade)
