"""Funciones base del README §1.3: smooth, mix, ridged, ruido de valor y fBm, en unidades U."""
import numpy as np
from scipy import ndimage as ndi


def smooth(a, b, x):
    """smoothstep; con a > b funciona como rampa invertida."""
    t = np.clip((np.asarray(x, np.float32) - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    return a + (b - a) * t


def ridged(n):
    return 1 - np.abs(2 * n - 1)


def ruido_valor(shape, f, rng, unit, sx=1.0, sy=1.0):
    """Rejilla aleatoria (gh, gw) reescalada con bicúbica.  f = celdas por `unit` píxeles.
    sx, sy estiran el ruido (sx<1 alarga en x).  Devuelve valores ~[0,1] (recortados)."""
    H, W = shape
    gw = max(2, int(np.ceil(f * sx * W / unit)) + 3)
    gh = max(2, int(np.ceil(f * sy * H / unit)) + 3)
    g = rng.random((gh, gw)).astype(np.float32)
    z = ndi.zoom(g, ((H + 2) / (gh - 1) * 1.0, (W + 2) / (gw - 1) * 1.0), order=3, mode='mirror')
    z = z[1:H + 1, 1:W + 1]
    if z.shape != (H, W):
        z = np.pad(z, ((0, max(0, H - z.shape[0])), (0, max(0, W - z.shape[1]))), mode='edge')[:H, :W]
    return np.clip(z, 0, 1)


def fbm(shape, f, octavas, rng, unit, sx=1.0, sy=1.0, modo='normal'):
    out = np.zeros(shape, np.float32)
    a, tot, ff = 1.0, 0.0, f
    for _ in range(octavas):
        n = ruido_valor(shape, ff, rng, unit, sx, sy)
        if modo == 'ridged':
            n = ridged(n)
        elif modo == 'billow':
            n = np.abs(2 * n - 1)
        out += a * n
        tot += a
        a *= 0.5
        ff *= 2
    return out / tot


def desenfoque(a, sigma):
    if sigma <= 0.05:
        return a
    if a.ndim == 3:
        return np.stack([ndi.gaussian_filter(a[..., k], sigma) for k in range(a.shape[2])], -1)
    return ndi.gaussian_filter(a, sigma)


def luminancia(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def unidad(W, H):
    unit = float(np.sqrt(W * H))
    return unit, unit / 1946.0


def gradiente_paradas(t, paradas):
    """paradas: lista de (t, (r,g,b)); devuelve (…, 3) float32."""
    ts = np.array([p[0] for p in paradas], np.float32)
    cs = np.array([p[1] for p in paradas], np.float32)
    t = np.clip(t, ts[0], ts[-1])
    out = np.empty(t.shape + (3,), np.float32)
    for k in range(3):
        out[..., k] = np.interp(t, ts, cs[:, k])
    return out
