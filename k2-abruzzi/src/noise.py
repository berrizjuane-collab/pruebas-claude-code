"""Numba gradient noise / fbm used for clouds, snow plumes, textures."""
import math
import numpy as np
import numba as nb

_rng = np.random.default_rng(1234)
PERM = np.concatenate([_rng.permutation(256), _rng.permutation(256)]).astype(np.int32)
GRAD3 = np.array([[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
                  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1], [1, 1, 0], [-1, 1, 0], [0, -1, 1], [0, -1, -1]],
                 dtype=np.float32)


@nb.njit(inline='always', fastmath=True)
def _fade(t):
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)


@nb.njit(inline='always', fastmath=True)
def _g(grad, h, x, y, z):
    return grad[h & 15, 0] * x + grad[h & 15, 1] * y + grad[h & 15, 2] * z


@nb.njit(fastmath=True)
def perlin3(x, y, z, perm, grad):
    xi = int(math.floor(x)) & 255
    yi = int(math.floor(y)) & 255
    zi = int(math.floor(z)) & 255
    xf = x - math.floor(x)
    yf = y - math.floor(y)
    zf = z - math.floor(z)
    u = _fade(xf)
    v = _fade(yf)
    w = _fade(zf)
    a = perm[xi] + yi
    aa = perm[a & 255] + zi
    ab = perm[(a + 1) & 255] + zi
    b = perm[(xi + 1) & 255] + yi
    ba = perm[b & 255] + zi
    bb = perm[(b + 1) & 255] + zi

    x1 = _g(grad, perm[aa & 255], xf, yf, zf) * (1 - u) + _g(grad, perm[ba & 255], xf - 1, yf, zf) * u
    x2 = _g(grad, perm[ab & 255], xf, yf - 1, zf) * (1 - u) + _g(grad, perm[bb & 255], xf - 1, yf - 1, zf) * u
    y1 = x1 * (1 - v) + x2 * v
    x1 = _g(grad, perm[(aa + 1) & 255], xf, yf, zf - 1) * (1 - u) + _g(grad, perm[(ba + 1) & 255], xf - 1, yf, zf - 1) * u
    x2 = _g(grad, perm[(ab + 1) & 255], xf, yf - 1, zf - 1) * (1 - u) + _g(grad, perm[(bb + 1) & 255], xf - 1, yf - 1, zf - 1) * u
    y2 = x1 * (1 - v) + x2 * v
    return y1 * (1 - w) + y2 * w


@nb.njit(fastmath=True)
def fbm3(x, y, z, octaves, lac, gain, perm, grad):
    s = 0.0
    a = 0.5
    f = 1.0
    for o in range(octaves):
        s += a * perlin3(x * f, y * f, z * f, perm, grad)
        f *= lac
        a *= gain
    return s


@nb.njit(parallel=True, fastmath=True)
def fbm_field(X, Y, Z, scale, octaves, perm, grad, out):
    n = X.shape[0]
    for i in nb.prange(n):
        out[i] = fbm3(X[i] * scale, Y[i] * scale, Z[i] * scale, octaves, 2.03, 0.5, perm, grad)


def fbm(X, Y, Z=None, scale=1.0, octaves=5):
    X = np.ascontiguousarray(np.asarray(X, dtype=np.float64).ravel())
    Y = np.ascontiguousarray(np.asarray(Y, dtype=np.float64).ravel())
    shp = np.shape(X)
    if Z is None:
        Z = np.zeros_like(X)
    else:
        Z = np.ascontiguousarray(np.broadcast_to(np.asarray(Z, dtype=np.float64).ravel(), X.shape))
    out = np.empty(X.shape[0], dtype=np.float64)
    fbm_field(X, Y, Z, float(scale), int(octaves), PERM, GRAD3, out)
    return out


def fbm_img(shape, scale, octaves=5, seed=0.0, zoff=0.0):
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
    return fbm(xx + seed * 131.7, yy + seed * 71.3, np.full(xx.size, zoff), scale, octaves).reshape(h, w)
