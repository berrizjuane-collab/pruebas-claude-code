"""Cámara y trazado del relieve en perspectiva (núcleos numba).

Cámara de lente descentrada: eje óptico horizontal (las verticales del mundo quedan verticales) y el
horizonte en la fila `cy` de la imagen.  Proyección rectilínea:
    columna u -> acimut  rumbo + atan((u - W/2)/f)
    fila v    -> pendiente del rayo  s = (cy - v) / sqrt(f² + (u - W/2)²)
Cada columna comparte acimut, así que el relieve se traza columna por columna de cerca a lejos con un
"horizonte flotante" (README §2.3), con intersección exacta por fila entre muestras consecutivas.
La altura efectiva incluye curvatura terrestre y refracción: z_ef = z - d²/(2 R (1 + k)), k = 0.13.
"""
import math
import numpy as np
from numba import njit, prange

# fastmath sin 'nnan'/'ninf': los núcleos usan NaN/inf como marcas (fuera de rejilla, cielo)
FM = {'nsz', 'arcp', 'contract', 'afn', 'reassoc'}

R_EF = 6371000.0 / (1.0 - 0.13)   # radio efectivo con refracción estándar


@njit(cache=True, fastmath=FM, inline='always')
def _bil(Z, x0, y0, c, x, y):
    fx = (x - x0) / c
    fy = (y - y0) / c
    if fx < 0.0 or fy < 0.0 or fx >= Z.shape[1] - 1.001 or fy >= Z.shape[0] - 1.001:
        return np.nan
    i = int(fx); j = int(fy)
    tx = fx - i; ty = fy - j
    return ((Z[j, i] * (1 - tx) + Z[j, i + 1] * tx) * (1 - ty) +
            (Z[j + 1, i] * (1 - tx) + Z[j + 1, i + 1] * tx) * ty)


@njit(cache=True, fastmath=FM, inline='always')
def _borde(Z, x0, y0, c, x, y):
    """Distancia (m) al borde de la rejilla (negativa fuera)."""
    return min(x - x0, (x0 + (Z.shape[1] - 2) * c) - x, y - y0, (y0 + (Z.shape[0] - 2) * c) - y)


@njit(cache=True, fastmath=FM)
def altura(x, y, d, Z0, g0, Z1, g1, Z2, g2, dlod):
    """Altura con fundido entre niveles: por borde de rejilla y por distancia a la cámara (LOD)."""
    h2 = _bil(Z2, g2[0], g2[1], g2[2], x, y)
    e1 = _borde(Z1, g1[0], g1[1], g1[2], x, y)
    if e1 <= 0.0:
        return h2
    h1 = _bil(Z1, g1[0], g1[1], g1[2], x, y)
    w1 = min(1.0, e1 / 6000.0)
    if d > 120000.0:
        w1 *= max(0.0, 1.0 - (d - 120000.0) / 30000.0)
    h = h1 if (np.isnan(h2) or w1 >= 1.0) else h2 + (h1 - h2) * w1
    e0 = _borde(Z0, g0[0], g0[1], g0[2], x, y)
    if e0 <= 0.0 or d > dlod:
        return h
    h0 = _bil(Z0, g0[0], g0[1], g0[2], x, y)
    w0 = min(1.0, e0 / 1500.0)
    w0 *= min(1.0, (dlod - d) / (0.25 * dlod))
    return h + (h0 - h) * w0


@njit(cache=True, fastmath=FM, parallel=True)
def trazar(W, H, f, cy, cam, rumbo, Z0, g0, Z1, g1, Z2, g2, dlod, dmax, eps, paso_min,
           dist, px, py, pz):
    """Llena dist/px/py/pz (H, W).  Cielo: dist = inf."""
    cx_, cy_, cz_ = cam[0], cam[1], cam[2]
    for col in prange(W):
        du = col + 0.5 - W * 0.5
        az = rumbo + math.atan2(du, f)
        fu = math.sqrt(f * f + du * du)
        sx = math.sin(az); sy = math.cos(az)
        rtop = H
        d_p = 0.0
        h_p = altura(cx_, cy_, 0.0, Z0, g0, Z1, g1, Z2, g2, dlod)
        he_p = h_p
        d = paso_min
        while d < dmax:
            x = cx_ + d * sx; y = cy_ + d * sy
            h = altura(x, y, d, Z0, g0, Z1, g1, Z2, g2, dlod)
            if np.isnan(h):
                break
            he = h - d * d / (2.0 * R_EF)
            q = (he - cz_) / d
            rn = int(math.ceil(cy - 0.5 - q * fu))
            if rn < rtop:
                r0 = max(rn, 0)
                for r in range(r0, min(rtop, H)):
                    s = (cy - r - 0.5) / fu
                    den = (he - he_p) - s * (d - d_p)
                    t = 1.0
                    if abs(den) > 1e-9:
                        t = (cz_ + s * d_p - he_p) / den
                    if t < 0.0: t = 0.0
                    if t > 1.0: t = 1.0
                    dh = d_p + t * (d - d_p)
                    dist[r, col] = dh
                    px[r, col] = cx_ + dh * sx
                    py[r, col] = cy_ + dh * sy
                    pz[r, col] = h_p + t * (h - h_p)
                rtop = r0
                if rtop <= 0:
                    break
            d_p = d; h_p = h; he_p = he
            d += max(paso_min, d * eps)


@njit(cache=True, fastmath=FM, parallel=True)
def normales(px, py, dist, f, Z0, g0, Z1, g1, Z2, g2, dlod, nx, ny, nz):
    H, W = px.shape
    for r in prange(H):
        for c in range(W):
            d = dist[r, c]
            if not np.isfinite(d):
                continue
            x = px[r, c]; y = py[r, c]
            e = max(g0[2], d / f * 1.5)
            if d > dlod:
                e = max(e, g1[2])
            hx1 = altura(x + e, y, d, Z0, g0, Z1, g1, Z2, g2, dlod)
            hx0 = altura(x - e, y, d, Z0, g0, Z1, g1, Z2, g2, dlod)
            hy1 = altura(x, y + e, d, Z0, g0, Z1, g1, Z2, g2, dlod)
            hy0 = altura(x, y - e, d, Z0, g0, Z1, g1, Z2, g2, dlod)
            gx = (hx1 - hx0) / (2 * e); gy = (hy1 - hy0) / (2 * e)
            if np.isnan(gx) or np.isnan(gy):
                gx = 0.0; gy = 0.0
            n = math.sqrt(gx * gx + gy * gy + 1.0)
            nx[r, c] = -gx / n; ny[r, c] = -gy / n; nz[r, c] = 1.0 / n


@njit(cache=True, fastmath=FM, parallel=True)
def sombras(px, py, pz, nx, ny, nz, dist, sol, Z0, g0, Z1, g1, Z2, g2, tmax, pen, out):
    """Visibilidad del sol (0 = sombra, 1 = luz) con penumbra suave."""
    H, W = px.shape
    sx, sy, sz = sol[0], sol[1], sol[2]
    hor = math.sqrt(sx * sx + sy * sy)
    ux = sx / hor; uy = sy / hor
    tg = sz / hor
    for r in prange(H):
        for c in range(W):
            if not np.isfinite(dist[r, c]):
                out[r, c] = 1.0
                continue
            ndl = nx[r, c] * sx + ny[r, c] * sy + nz[r, c] * sz
            if ndl <= 0.0:
                out[r, c] = 0.0
                continue
            x0 = px[r, c]; y0 = py[r, c]; z0 = pz[r, c] + 1.5
            res = 1.0
            t = 6.0
            while t < tmax:
                x = x0 + t * ux; y = y0 + t * uy
                h = altura(x, y, 0.0, Z0, g0, Z1, g1, Z2, g2, 1e12)
                if np.isnan(h):
                    break
                zr = z0 + t * tg + t * t / (2.0 * R_EF)
                k = (zr - h) / (t * pen + 4.0)
                if k < res:
                    res = k
                    if res <= 0.0:
                        res = 0.0
                        break
                if h + 9000.0 < zr:     # ya por encima de todo
                    break
                t += max(4.0, t * 0.018)
            out[r, c] = res * res * (3.0 - 2.0 * res)


class Camara:
    def __init__(self, x, y, z, rumbo_deg, hfov_deg, W, H, cy_frac):
        self.x, self.y, self.z = float(x), float(y), float(z)
        self.rumbo = math.radians(rumbo_deg)
        self.W, self.H = int(W), int(H)
        self.f = (W / 2) / math.tan(math.radians(hfov_deg) / 2)
        self.cy = cy_frac * H

    def proyectar(self, X, Y, Z):
        """Mundo -> (u, v, d).  Incluye la caída por curvatura."""
        dx = np.asarray(X) - self.x; dy = np.asarray(Y) - self.y
        fw = dx * math.sin(self.rumbo) + dy * math.cos(self.rumbo)
        rt = dx * math.cos(self.rumbo) - dy * math.sin(self.rumbo)
        dh = np.hypot(dx, dy)
        ze = np.asarray(Z) - dh * dh / (2 * R_EF) - self.z
        fw = np.where(fw > 1e-3, fw, np.nan)
        u = self.W / 2 + self.f * rt / fw
        v = self.cy - self.f * ze / fw
        return u, v, dh


def _g(niv):
    return np.array([niv.x0, niv.y0, niv.c], np.float64)


def render(cam, niveles, sol=None, dlod=32000.0, dmax=380000.0, eps=0.0012, paso_min=0.6, pen=0.035):
    """Devuelve dict con dist, px, py, pz, nx, ny, nz y (si hay sol) luz directa con sombras."""
    W, H = cam.W, cam.H
    Z0, Z1, Z2 = (n.z for n in niveles)
    g0, g1, g2 = (_g(n) for n in niveles)
    dist = np.full((H, W), np.inf, np.float32)
    px = np.zeros((H, W), np.float32); py = np.zeros_like(px); pz = np.zeros_like(px)
    camv = np.array([cam.x, cam.y, cam.z], np.float64)
    trazar(W, H, cam.f, cam.cy, camv, cam.rumbo, Z0, g0, Z1, g1, Z2, g2, dlod, dmax, eps, paso_min,
           dist, px, py, pz)
    nx = np.zeros_like(px); ny = np.zeros_like(px); nz = np.ones_like(px)
    normales(px, py, dist, cam.f, Z0, g0, Z1, g1, Z2, g2, dlod, nx, ny, nz)
    out = dict(dist=dist, px=px, py=py, pz=pz, nx=nx, ny=ny, nz=nz)
    if sol is not None:
        s = np.asarray(sol, np.float64); s = s / np.linalg.norm(s)
        vis = np.ones_like(px)
        sombras(px, py, pz, nx, ny, nz, dist, s, Z0, g0, Z1, g1, Z2, g2, 60000.0, pen, vis)
        out['vis'] = vis
        out['sol'] = s
    return out


def vector_sol(azimut_deg, elev_deg):
    a = math.radians(azimut_deg); e = math.radians(elev_deg)
    return np.array([math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)])
