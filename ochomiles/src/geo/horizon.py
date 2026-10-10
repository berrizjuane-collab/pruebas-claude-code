"""Angulos de horizonte sobre un modelo de elevacion (numba, paralelo).

horizon_angle(): para cada celda, el angulo maximo de elevacion del terreno visto en una
direccion (azimut). Sirve para sombras proyectadas con cualquier altura de sol en ese
azimut, y combinado en varias direcciones para el factor de vision de cielo (luz ambiente).
Incluye la curvatura terrestre con refraccion estandar (k = 0.13).
"""
import math

import numba as nb
import numpy as np

R_EFF = 6371000.0 / (1.0 - 0.13)


@nb.njit(cache=True, fastmath=True)
def _bilinear(z, x, y):
    h, w = z.shape
    if x < 0.0 or y < 0.0 or x > w - 1.001 or y > h - 1.001:
        return -1e9
    ix = int(x)
    iy = int(y)
    fx = x - ix
    fy = y - iy
    a = z[iy, ix] * (1 - fx) + z[iy, ix + 1] * fx
    b = z[iy + 1, ix] * (1 - fx) + z[iy + 1, ix + 1] * fx
    return a * (1 - fy) + b * fy


@nb.njit(parallel=True, cache=True, fastmath=True)
def horizon_angle(z, cell, az_deg, max_dist):
    """z: elevaciones (filas hacia el sur). az en grados desde el norte, sentido horario.
    Devuelve el angulo de horizonte en radianes (puede ser negativo)."""
    h, w = z.shape
    out = np.empty((h, w), np.float32)
    az = math.radians(az_deg)
    dx = math.sin(az)      # columnas (+este)
    dy = -math.cos(az)     # filas (+sur)
    for i in nb.prange(h):
        for j in range(w):
            z0 = z[i, j]
            best = -1.0
            d = 1.0
            step = 1.0
            while d * cell < max_dist:
                zz = _bilinear(z, j + dx * d, i + dy * d)
                if zz < -1e8:
                    break
                dist = d * cell
                t = (zz - z0 - dist * dist / (2.0 * R_EFF)) / dist
                if t > best:
                    best = t
                d += step
                if d > 24.0:
                    step = d * 0.06
            out[i, j] = math.atan(best)
    return out


def sky_view(z, cell, ndir=16, max_dist=20000.0):
    """Factor de vision de cielo (0..1) promediando sin^2 del horizonte en ndir azimuts."""
    acc = np.zeros(z.shape, np.float32)
    for k in range(ndir):
        a = horizon_angle(z, cell, 360.0 * k / ndir, max_dist)
        acc += np.sin(np.clip(a, 0, None)) ** 2
    return 1.0 - acc / ndir
