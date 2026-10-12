"""Terrain levels (height grids in the local ENU frame) + derived maps.

Level 0: optional high-resolution detail patches (2.5 m) baked around the route.
Level 1: 'near' grid, 10 m, K2 massif / Godwin-Austen glacier.
Level 2: 'far' grid, 100 m, +-130 km of Karakoram.
"""
import os
import numpy as np
from scipy import ndimage

WORK = '/home/user/k2data/work'

SUMMIT_TRUE = 8611.0


class Grid:
    def __init__(self, H, x0, y0, res):
        self.H = np.ascontiguousarray(H, dtype=np.float32)
        self.x0 = float(x0)
        self.y0 = float(y0)
        self.res = float(res)
        self.ny, self.nx = self.H.shape

    @property
    def x1(self):
        return self.x0 + (self.nx - 1) * self.res

    @property
    def y1(self):
        return self.y0 + (self.ny - 1) * self.res

    def sample(self, x, y, order=1):
        r = (np.asarray(y, dtype=np.float64) - self.y0) / self.res
        c = (np.asarray(x, dtype=np.float64) - self.x0) / self.res
        shp = np.shape(r)
        out = ndimage.map_coordinates(self.H, [np.atleast_1d(r).ravel(), np.atleast_1d(c).ravel()],
                                      order=order, mode='nearest')
        return out.reshape(shp) if shp else float(out[0])

    def normals(self):
        gy, gx = np.gradient(self.H.astype(np.float64), self.res)
        n = np.stack([-gx, -gy, np.ones_like(gx)], -1)
        n /= np.linalg.norm(n, axis=-1, keepdims=True)
        return n.astype(np.float32)


def _summit_fix(g, peak_xy):
    """Raise the DEM summit (8572 m, smoothed by the 30 m DEM) to the surveyed 8611 m."""
    X = g.x0 + np.arange(g.nx) * g.res
    Y = g.y0 + np.arange(g.ny) * g.res
    XX, YY = np.meshgrid(X, Y)
    d2 = (XX - peak_xy[0]) ** 2 + (YY - peak_xy[1]) ** 2
    cur = g.sample(peak_xy[0], peak_xy[1])
    bump = (SUMMIT_TRUE - cur) * np.exp(-d2 / (2 * 140.0 ** 2))
    g.H += bump.astype(np.float32)


def load_levels():
    near = np.load(f'{WORK}/near.npz')
    far = np.load(f'{WORK}/far.npz')
    gn = Grid(near['H'], near['x0'], near['y0'], near['res'])
    gf = Grid(far['H'], far['x0'], far['y0'], far['res'])
    r, c = np.unravel_index(np.argmax(gn.H), gn.H.shape)
    peak = (gn.x0 + c * gn.res, gn.y0 + r * gn.res)
    _summit_fix(gn, peak)
    _summit_fix(gf, peak)
    return gn, gf, peak


def cavity(H, res, radii=(20, 60, 180)):
    """Cheap ambient-occlusion proxy: how far a cell sits below its blurred neighbourhood."""
    ao = np.zeros_like(H, dtype=np.float32)
    w = 0.0
    for rad in radii:
        s = max(rad / res, 0.6)
        b = ndimage.gaussian_filter(H.astype(np.float32), s)
        d = (b - H) / rad  # positive in concavities
        ao += np.clip(d * 1.5, -1.0, 1.0)
        w += 1.0
    ao = 1.0 - np.clip(ao / w, 0.0, 1.0) * 0.9
    return ao.astype(np.float32)


def convexity(H, res, rad):
    s = max(rad / res, 0.6)
    return (H - ndimage.gaussian_filter(H.astype(np.float32), s)).astype(np.float32)
