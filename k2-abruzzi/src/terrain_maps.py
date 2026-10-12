"""Precomputed per-grid surface maps: detail-enhanced heights, AO, rock/snow and debris masks.

Mountain faces are given fall-line streaks (line-integral convolution of noise along the
down-slope direction) so ribs and gullies read like a painter's strokes; the glacier gets
medial-moraine stripes along its flow.
"""
import math
import numpy as np
import numba as nb
from scipy import ndimage

from terrain import Grid, cavity, convexity


@nb.njit(parallel=True, fastmath=True)
def lic(noise, vx, vy, L, step):
    ny, nx = noise.shape
    out = np.zeros_like(noise)
    for j in nb.prange(ny):
        for i in range(nx):
            acc = noise[j, i]
            wsum = 1.0
            for sgn in (-1.0, 1.0):
                x = i + 0.5
                y = j + 0.5
                for k in range(L):
                    ix = int(x)
                    iy = int(y)
                    if ix < 0 or iy < 0 or ix >= nx or iy >= ny:
                        break
                    dx = vx[iy, ix]
                    dy = vy[iy, ix]
                    x += sgn * dx * step
                    y += sgn * dy * step
                    ix = int(x)
                    iy = int(y)
                    if ix < 0 or iy < 0 or ix >= nx or iy >= ny:
                        break
                    w = 1.0 - k / L
                    acc += noise[iy, ix] * w
                    wsum += w
            out[j, i] = acc / wsum
    return out


def fall_field(H, res, blur_m):
    Hs = ndimage.gaussian_filter(H.astype(np.float32), max(blur_m / res, 0.5))
    gy, gx = np.gradient(Hs, res)
    mag = np.sqrt(gx * gx + gy * gy) + 1e-6
    return (-gx / mag).astype(np.float32), (-gy / mag).astype(np.float32), mag


def streak_noise(shape, vx, vy, L, seed, scale_px=1.0):
    rng = np.random.default_rng(seed)
    n = rng.standard_normal(shape).astype(np.float32)
    if scale_px > 1:
        n = ndimage.gaussian_filter(n, scale_px * 0.5)
        n /= n.std() + 1e-6
    s = lic(n, vx, vy, L, 1.0)
    s /= s.std() + 1e-6
    return s


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def ridged(shape, sigma, seed):
    rng = np.random.default_rng(seed)
    n = ndimage.gaussian_filter(rng.standard_normal(shape).astype(np.float32), sigma)
    n /= n.std() + 1e-6
    return 1.0 - np.abs(n)


def build_maps(g: Grid, seed=7, detail_amp=1.0):
    """Returns dict of maps (same shape as g.H). Also adds fall-line relief to g.H in place."""
    H = g.H.astype(np.float32)
    res = g.res
    vx, vy, gmag = fall_field(H, res, 40.0)
    slope0 = np.degrees(np.arctan(gmag))
    # gullies and ribs: streak noise along the fall line at two scales (spacing ~35 m and ~120 m)
    L1 = int(max(5, 70 / res))
    s_fine = streak_noise(H.shape, vx, vy, L1, seed, scale_px=max(1.0, 12.0 / res))
    s_coarse = streak_noise(H.shape, vx, vy, L1 * 2, seed + 1, scale_px=max(1.0, 45.0 / res))
    steep = smoothstep(28, 55, slope0)
    relief = (np.sign(s_fine) * np.abs(s_fine) ** 0.7 * 4.0 + s_coarse * 9.0) * steep * detail_amp
    # rock bands (strata) crossing the faces
    band = ridged(H.shape, max(1.0, 9.0 / res), seed + 5)
    strata = np.sin(H / 38.0 + 3.0 * ndimage.gaussian_filter(np.random.default_rng(seed + 9).standard_normal(H.shape).astype(np.float32), 60.0 / res) * 6)
    relief += 3.0 * np.clip(strata, 0, 1) * steep * detail_amp
    H2 = H + relief.astype(np.float32)
    g.H = np.ascontiguousarray(H2)
    gy, gx = np.gradient(H2, res)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    slope_s = ndimage.gaussian_filter(slope, max(0.5, 6.0 / res))
    conv_s = convexity(H2, res, 25)
    conv_l = convexity(H2, res, 120)
    thr = 49.0 + 7.0 * smoothstep(6400, 8000, H) + 5.0 * ndimage.gaussian_filter(np.random.default_rng(seed + 2).standard_normal(H.shape).astype(np.float32), 80.0 / res) * 6
    raw = (slope_s - thr) / 6.0 + 0.10 * conv_s + 0.03 * conv_l + 0.35 * s_coarse
    rock = smoothstep(-0.6, 0.6, raw)
    # very steep ground is always bare; gentle ground always snow-covered (at altitude)
    rock = np.maximum(rock, smoothstep(58, 66, slope_s))
    rock = rock * smoothstep(24, 34, slope_s)
    rock = np.clip(rock, 0, 1).astype(np.float32)
    # glacier & debris (medial moraines): low, flat ground with elongated stripes
    alt = H2
    flat = 1.0 - smoothstep(8, 20, slope0)
    low = 1.0 - smoothstep(5500, 5900, alt)
    glacier = (flat * low).astype(np.float32)
    gvx, gvy, _ = fall_field(H, res, 400.0)
    mor = streak_noise(H.shape, gvx, gvy, int(max(8, 600 / res)), seed + 3, scale_px=max(1.0, 25.0 / res))
    deb = smoothstep(-0.2, 0.9, 0.14 * mor + 0.012 * convexity(H2, res, 60) + 0.42)
    debris = (glacier * deb).astype(np.float32)
    ao = cavity(H2, res, radii=(max(15, 2 * res), 60, 200))
    return dict(rock=rock, glacier=glacier, debris=debris, ao=ao,
                slope=slope.astype(np.float32), streak=s_fine.astype(np.float32))
