"""Shot-specific fine heightfield levels (sub-metre) for close-ups.

fine = bicubic(corridor L0) + (sharp sculpt - smooth sculpt) + material-aware micro relief.
"""
import os
import numpy as np
from scipy import ndimage

import summit
from terrain import Grid, cavity
from terrain_maps import smoothstep, fall_field, streak_noise
from scene import MAP_KEYS, WORK


def _sample_level(g, maps, XX, YY):
    r = (YY - g.y0) / g.res
    c = (XX - g.x0) / g.res
    H = ndimage.map_coordinates(g.H, [r, c], order=3, mode='nearest')
    M = {k: ndimage.map_coordinates(maps[k], [r, c], order=1, mode='nearest') for k in MAP_KEYS}
    return H, M


def _noise(shape, sigma, seed):
    rng = np.random.default_rng(seed)
    n = ndimage.gaussian_filter(rng.standard_normal(shape).astype(np.float32), sigma)
    return n / (n.std() + 1e-6)


def summit_region(sc, res=0.35, cache=True):
    """C4 / Bottleneck / serac / traverse / summit snowfield at `res` metres."""
    path = f'{WORK}/fine_summit_{res:.2f}.npz'
    if cache and os.path.exists(path):
        d = np.load(path)
        g = Grid(d['H'], *d['p'])
        return g, {k: d[k] for k in MAP_KEYS}
    X0, X1, Y0, Y1 = -160.0, 900.0, -660.0, -90.0
    xs = np.arange(X0, X1 + 1e-6, res)
    ys = np.arange(Y0, Y1 + 1e-6, res)
    XX, YY = np.meshgrid(xs, ys)
    g0, m0 = sc.levels[0], sc.maps[0]
    H, M = _sample_level(g0, m0, XX, YY)
    # sharp features: evaluate the sculpt at full res on the DEM and subtract its 2.5 m blur
    gn = sc.levels[1]
    base = gn.sample(XX, YY, order=3)  # near grid already includes a 10 m version of the sculpt
    fr = sc.frame
    sharp, ice_s, rock_s, snow_s = summit.sculpt(fr, XX, YY, np.zeros_like(XX), res=res)
    smooth = ndimage.gaussian_filter(sharp, 2.5 / res * 0.6)
    H = H + (sharp - smooth)
    ice = np.clip(np.maximum(M['ice'], ice_s), 0, 1)
    rock = np.clip(np.maximum(M['rock'] * (1 - ice), rock_s * 0.95) * (1 - snow_s), 0, 1)
    # micro relief: wind ripples on snow, blocks on rock, fractures near the serac edge
    a, l = fr.local(XX, YY)
    wind = _noise(XX.shape, (0.6 / res, 6.0 / res), 5)          # ripples elongated across the slope
    rip = 0.04 * wind + 0.07 * _noise(XX.shape, 2.5 / res, 6)
    blocks = 0.9 * np.round(_noise(XX.shape, 1.2 / res, 7) * 1.5) / 1.5 + 0.4 * _noise(XX.shape, 0.5 / res, 8)
    H = H + rip * (1 - rock) * (1 - ice) + blocks * rock * 0.8
    fx = _noise(XX.shape, 0.8 / res, 9)
    H = H + ice * (0.5 * fx)
    gy, gx = np.gradient(H, res)
    slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)
    ao = cavity(H.astype(np.float32), res, radii=(1.0, 4.0, 15.0))
    maps = dict(rock=rock.astype(np.float32), glacier=np.zeros_like(slope), debris=np.zeros_like(slope),
                ao=ao.astype(np.float32), slope=slope, ice=ice.astype(np.float32))
    g = Grid(H.astype(np.float32), X0, Y0, res)
    np.savez(path, H=g.H, p=np.array([X0, Y0, res]), **maps)
    return g, maps


def pyramid_region(sc, res=0.3, cache=True):
    """Black Pyramid close-up: dark, stepped, faceted rock with ice in the runnels."""
    import setpieces
    path = f'{WORK}/fine_pyramid_{res:.2f}.npz'
    if cache and os.path.exists(path):
        d = np.load(path)
        g = Grid(d['H'], *d['p'])
        return g, {k: d[k] for k in MAP_KEYS}
    X0, X1, Y0, Y1 = 1240.0, 1620.0, -1330.0, -930.0
    xs = np.arange(X0, X1 + 1e-6, res)
    ys = np.arange(Y0, Y1 + 1e-6, res)
    XX, YY = np.meshgrid(xs, ys)
    H, M = _sample_level(sc.levels[0], sc.maps[0], XX, YY)
    vx, vy, gmag = fall_field(H.astype(np.float32), res, 6.0)
    # faceted blocks: Voronoi cells (in plan) whose planes tilt - steps and slabs on a ~45-55 deg face
    blocks = setpieces.voronoi_rock(XX, YY, 3.2, 31, tilt=0.55, crack=0.35, relief=2.2)
    blocks += 0.45 * setpieces.voronoi_rock(XX + 11.0, YY + 5.0, 1.1, 32, tilt=0.35, crack=0.12, relief=0.6)
    gull = streak_noise(XX.shape, vx, vy, int(18 / res), 6, scale_px=2.0 / res)
    H = H + blocks - 1.6 * np.clip(-gull - 0.2, 0, None)
    H = ndimage.gaussian_filter(H, 0.7)
    gy, gx = np.gradient(H, res)
    slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)
    snow = np.clip(smoothstep(34, 22, slope) * 0.9 + np.clip(-gull - 0.9, 0, 1) * 0.5, 0, 1)
    rock = np.clip(1 - snow, 0, 1)
    ice = np.clip(np.clip(-gull - 0.3, 0, 1) * smoothstep(35, 55, slope), 0, 1) * 0.7
    ao = cavity(H.astype(np.float32), res, radii=(0.8, 3.0, 12.0))
    maps = dict(rock=rock.astype(np.float32), glacier=np.zeros_like(slope), debris=np.zeros_like(slope),
                ao=ao.astype(np.float32), slope=slope, ice=ice.astype(np.float32))
    g = Grid(H.astype(np.float32), X0, Y0, res)
    np.savez(path, H=g.H, p=np.array([X0, Y0, res]), **maps)
    return g, maps
