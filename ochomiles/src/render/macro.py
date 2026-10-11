"""Plano macro de apertura (0-4 s): costra de nieve dura con la huella de un crampon,
revelada por el haz de una frontal en la oscuridad previa al alba. Vaho de respiracion y
nieve en suspension cruzan el haz.

Todo es procedural y fisicamente motivado (escala real en metros):
  - relieve: ondulaciones de viento (sastrugi), granos, placas de hielo y dos huellas de
    crampon de 12 puntas (dos frontales + diez verticales) con suela marcada;
  - luz: foco de frontal con caida angular e inversa del cuadrado, sombras sobre el relieve
    (relief mapping), transluminancia azul de la nieve y destellos de cristales;
  - camara: objetivo de ~46 grados, poca profundidad de campo, leve balanceo de mano.
"""
import math
import os

import cv2
import numba as nb
import numpy as np

from .noise import spectral_noise
from .region import ROOT

CACHE = os.path.join(ROOT, "data", "cache")

# dominio del relieve (m): x a la derecha, y hacia delante, z arriba
X0, Y0, SPAN, NTEX = -0.80, -0.30, 1.60, 4096
TEXEL = SPAN / NTEX


# ------------------------------------------------------------------------------------------
# relieve
# ------------------------------------------------------------------------------------------
def _aniso_noise(n, lam_min, lam_max, angle, aniso, seed, span):
    """Ruido de banda con anisotropia (crestas perpendiculares al viento)."""
    rng = np.random.default_rng(seed)
    fx = np.fft.fftfreq(n, d=span / n)[None, :]
    fy = np.fft.fftfreq(n, d=span / n)[:, None]
    c, s = math.cos(angle), math.sin(angle)
    u = fx * c + fy * s
    v = (-fx * s + fy * c) * aniso
    f = np.sqrt(u * u + v * v)
    f[0, 0] = 1e-9
    amp = f ** -1.6
    band = np.exp(-((np.log(f) - np.log(0.5 / lam_min + 0.5 / lam_max)) / 1.1) ** 2)
    band *= (f > 1.0 / lam_max) * (f < 1.0 / lam_min)
    spec = amp * band * np.exp(1j * rng.uniform(0, 2 * np.pi, (n, n)))
    a = np.real(np.fft.ifft2(spec))
    return (a / (a.std() + 1e-12)).astype(np.float32)


# contorno de suela (u: 0 talon -> 1 puntera; semiancho exterior / interior en m), bota de alta montana
_SOLE = [(0.00, 0.000, 0.000), (0.015, 0.024, 0.024), (0.05, 0.035, 0.034), (0.14, 0.040, 0.038),
         (0.26, 0.040, 0.036), (0.38, 0.039, 0.030), (0.48, 0.044, 0.036), (0.60, 0.051, 0.045),
         (0.72, 0.055, 0.049), (0.82, 0.054, 0.048), (0.90, 0.048, 0.043), (0.955, 0.036, 0.033),
         (0.985, 0.020, 0.019), (1.00, 0.000, 0.000)]


def _sole_mask(n, length):
    """Mascara de la suela en una ventana local (u a lo largo, v a lo ancho) a 0,2 mm."""
    res = 0.0002
    w = int(0.14 / res)
    h = int((length + 0.02) / res)
    pts = []
    for u, wo, wi in _SOLE:
        pts.append((wo, u))
    for u, wo, wi in reversed(_SOLE):
        pts.append((-wi, u))
    P = np.array([[(v + 0.07) / res, (u * length + 0.01) / res] for v, u in pts], np.float64)
    m = np.zeros((h, w), np.uint8)
    cv2.fillPoly(m, [np.round(P * 16).astype(np.int32)], 255, cv2.LINE_AA, shift=4)
    dist = cv2.distanceTransform((m > 127).astype(np.uint8), cv2.DIST_L2, 5) * res
    return dist, res


def _crampon_print(X, Y, cx, cy, ang, rng, length=0.305, crumb=None):
    """Huella de bota con crampon de 12 puntas sobre costra dura. Devuelve (dz en m, mascara).
    crumb: ruido fino (desv. 1) que desmenuza las paredes de la huella."""
    c, s = math.cos(ang), math.sin(ang)
    u = ((X - cx) * c + (Y - cy) * s) / length + 0.5          # 0 talon, 1 puntera
    v = -(X - cx) * s + (Y - cy) * c                           # a lo ancho (m)
    dist, res = _sole_mask(0, length)
    # muestreo de la distancia al borde de la suela
    rr = (u * length + 0.01) / res
    cc = (v + 0.07) / res
    d = cv2.remap(dist, cc.astype(np.float32), rr.astype(np.float32), cv2.INTER_LINEAR,
                  borderMode=cv2.BORDER_CONSTANT, borderValue=0.0)
    m = np.clip(d / 0.005, 0, 1)                                # pared de ~5 mm
    wall = m * m * (3 - 2 * m)
    # escalon del tacon suavizado (un corte brusco dibujaba una linea recta en la huella)
    heel = np.clip((0.34 - u) / 0.10, 0, 1)
    heel = heel * heel * (3 - 2 * heel)
    dz = -0.0075 * wall * (0.9 + 0.1 * np.cos(u * 23.0)) - 0.0012 * wall * heel
    if crumb is not None:
        # pared desmenuzada: migas de costra en la franja de la pared, no estrias verticales
        band = 4.0 * m * (1.0 - m)
        dz += 0.0011 * band * crumb
    # 12 puntas: 2 frontales, 2 secundarias, 4 verticales delanteras, 4 de talon
    def hole(pu, pv, rad, depth):
        r = np.sqrt(((u - pu) * length) ** 2 + (v - pv) ** 2)
        q = np.clip(1 - r / rad, 0, 1)
        return -depth * np.clip(q * 2.2, 0, 1) ** 0.7
    for side in (-1, 1):
        dz += hole(0.955, side * 0.016, 0.0050, 0.026)            # secundarias (bajo la puntera)
        dz += hole(0.80, side * 0.046, 0.0055, 0.030)             # verticales delanteras
        dz += hole(0.62, side * 0.043, 0.0055, 0.030)
        dz += hole(0.17, side * 0.033, 0.0058, 0.032)             # talon
        dz += hole(0.035, side * 0.021, 0.0055, 0.028)
        # puntas frontales: ranuras por delante de la puntera
        du = (u - 1.0) * length
        dv = v - side * 0.013
        slot = np.clip(1 - np.abs(dv) / 0.0036, 0, 1) * np.clip(1 - du / 0.036, 0, 1) * (du > -0.004)
        dz += -0.022 * np.clip(slot * 2.0, 0, 1) ** 0.7
    # borde: la costra se rompe en migas y labios levantados alrededor de la suela
    rim = np.exp(-(((np.clip(d, 0, None) - 0.0) / 0.003) ** 2)) * (d > -1)
    ring = cv2.GaussianBlur((m > 0.02).astype(np.float32), (0, 0), 3.0) - (m > 0.02)
    dz += 0.0025 * np.clip(ring, 0, None) * (0.6 + 0.8 * rng.random(X.shape).astype(np.float32))
    # costra rota alrededor: placas levantadas y grietas cortas
    for k in range(11):
        a0 = rng.uniform(0, 2 * math.pi)
        ru = 0.5 + 0.62 * math.cos(a0)
        rv = 0.075 * math.sin(a0)
        L = rng.uniform(0.010, 0.026)
        da = a0 + rng.uniform(-0.6, 0.6)
        du = (u - ru) * length
        dv = v - rv
        al = du * math.cos(da) + dv * math.sin(da)
        perp = np.abs(-du * math.sin(da) + dv * math.cos(da))
        crack = np.clip(1 - perp / 0.0008, 0, 1) * (al > 0) * (al < L) * (1 - al / L) * (1 - m)
        dz += -0.0016 * crack
    return dz.astype(np.float32), wall.astype(np.float32)


def build_relief():
    path = os.path.join(CACHE, "macro_relief_v7.npz")
    if os.path.exists(path):
        d = np.load(path)
        return {k: d[k] for k in d.files}
    os.makedirs(CACHE, exist_ok=True)
    n = NTEX
    xs = X0 + (np.arange(n) + 0.5) * TEXEL
    ys = Y0 + (np.arange(n) + 0.5) * TEXEL
    X, Y = np.meshgrid(xs, ys)
    wind = math.radians(12.0)
    sast = _aniso_noise(n, 0.035, 0.45, wind, 3.2, 1, SPAN) * 0.0050
    bumps = _aniso_noise(n, 0.012, 0.09, wind, 1.4, 2, SPAN) * 0.0016
    grain = _aniso_noise(n, 0.0012, 0.006, 0.0, 1.0, 3, SPAN) * 0.00028
    glaze_n = _aniso_noise(n, 0.08, 0.6, wind, 2.0, 4, SPAN)
    glaze = np.clip((glaze_n - 0.9) / 0.6, 0, 1).astype(np.float32)
    h_far = (sast + bumps + grain * (1 - 0.7 * glaze)).astype(np.float32)
    rng = np.random.default_rng(42)
    crumb = _aniso_noise(n, 0.0012, 0.0045, 0.0, 1.0, 5, SPAN)
    p1, m1 = _crampon_print(X, Y, -0.045, 0.37, math.radians(128.0), rng, crumb=crumb)
    p2, m2 = _crampon_print(X, Y, 0.20, 1.02, math.radians(118.0), rng, crumb=crumb)
    # en la huella y su entorno inmediato la costra queda compactada (el pie aplana la nieve)
    flat = np.clip(m1 + m2, 0, 1)
    near = cv2.GaussianBlur(flat, (0, 0), 0.030 / TEXEL)
    near = np.clip(near / max(near.max(), 1e-6) * 1.6, 0, 1)
    h = h_far * (1 - 0.80 * flat) * (1 - 0.45 * near) + p1 + p2
    hb = cv2.GaussianBlur(h, (0, 0), 0.004 / TEXEL)
    out = {"h": h.astype(np.float32), "hb": hb.astype(np.float32), "far": h_far, "glaze": glaze}
    np.savez(path, **out)
    return out


# ------------------------------------------------------------------------------------------
# nucleo de render (numba)
# ------------------------------------------------------------------------------------------
@nb.njit(cache=True, fastmath=True)
def _samp(tex, far, x, y):
    fx = (x - X0) / TEXEL - 0.5
    fy = (y - Y0) / TEXEL - 0.5
    n = tex.shape[0]
    if fx < 0.0 or fy < 0.0 or fx > n - 2.0 or fy > n - 2.0:
        fx = fx % (n - 1.0)
        fy = fy % (n - 1.0)
        tex = far
    ix = int(fx)
    iy = int(fy)
    ax = fx - ix
    ay = fy - iy
    a = tex[iy, ix] * (1 - ax) + tex[iy, ix + 1] * ax
    b = tex[iy + 1, ix] * (1 - ax) + tex[iy + 1, ix + 1] * ax
    return a * (1 - ay) + b * ay


@nb.njit(cache=True, fastmath=True)
def _hash2(ix, iy, k):
    h = (ix * 374761393 + iy * 668265263 + k * 1274126177) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = h ^ (h >> 16)
    return (h & 0xFFFFFF) / 16777216.0


@nb.njit(parallel=True, cache=True, fastmath=True)
def render_kernel(W, H, cam, fwd, right, up, thw, thh, h, hb, far, glaze,
                  lamp, ldir, cos_in, cos_out, power, ambient, out, depth, glint):
    for py in nb.prange(H):
        for px in range(W):
            sx = ((px + 0.5) / W * 2.0 - 1.0) * thw
            sy = (1.0 - (py + 0.5) / H * 2.0) * thh
            dx = fwd[0] + right[0] * sx + up[0] * sy
            dy = fwd[1] + right[1] * sx + up[1] * sy
            dz = fwd[2] + right[2] * sx + up[2] * sy
            dl = math.sqrt(dx * dx + dy * dy + dz * dz)
            dx /= dl
            dy /= dl
            dz /= dl
            if dz > -0.02:
                out[py, px, 0] = ambient[0] * 0.2
                out[py, px, 1] = ambient[1] * 0.2
                out[py, px, 2] = ambient[2] * 0.2
                depth[py, px] = 50.0
                glint[py, px] = 0.0
                continue
            # relief mapping entre z=+0.03 y z=-0.035
            t0 = (cam[2] - 0.03) / (-dz)
            t1 = (cam[2] + 0.035) / (-dz)
            nst = 28
            dt = (t1 - t0) / nst
            tp = t0
            th = t1
            for i in range(nst + 1):
                t = t0 + dt * i
                x = cam[0] + dx * t
                y = cam[1] + dy * t
                z = cam[2] + dz * t
                if z <= _samp(h, far, x, y):
                    th = t
                    break
                tp = t
            for i in range(6):
                tm = 0.5 * (tp + th)
                x = cam[0] + dx * tm
                y = cam[1] + dy * tm
                z = cam[2] + dz * tm
                if z <= _samp(h, far, x, y):
                    th = tm
                else:
                    tp = tm
            t = th
            x = cam[0] + dx * t
            y = cam[1] + dy * t
            z = _samp(h, far, x, y)
            depth[py, px] = t
            # normal (relieve + grano procedural fino por pixel)
            e = TEXEL
            gx = (_samp(h, far, x + e, y) - _samp(h, far, x - e, y)) / (2 * e)
            gy = (_samp(h, far, x, y + e) - _samp(h, far, x, y - e)) / (2 * e)
            gz = _samp(glaze, glaze, x, y)
            cs = 0.00045
            cx = int(math.floor(x / cs))
            cy = int(math.floor(y / cs))
            r1 = _hash2(cx, cy, 1)
            r2 = _hash2(cx, cy, 2)
            gx += (r1 - 0.5) * 0.9 * (1.0 - 0.8 * gz)
            gy += (r2 - 0.5) * 0.9 * (1.0 - 0.8 * gz)
            nx, ny, nz = -gx, -gy, 1.0
            nl = math.sqrt(nx * nx + ny * ny + nz * nz)
            nx /= nl
            ny /= nl
            nz /= nl
            # luz de la frontal
            lx = lamp[0] - x
            ly = lamp[1] - y
            lz = lamp[2] - z
            d2 = lx * lx + ly * ly + lz * lz
            d = math.sqrt(d2)
            lx /= d
            ly /= d
            lz /= d
            ca = -(lx * ldir[0] + ly * ldir[1] + lz * ldir[2])
            spot = 0.0
            if ca > cos_out:
                q = (ca - cos_out) / (cos_in - cos_out)
                if q > 1.0:
                    q = 1.0
                spot = q * q * (3 - 2 * q)
                spot = spot * (0.75 + 0.25 * min(1.0, (ca - cos_in) / (1 - cos_in) * 3.0 + 1.0))
            E = 0.0
            Es = 0.0
            shadow = 1.0
            if spot > 0.0:
                # sombra suave: marcha hacia la lampara dentro de la capa de relieve
                tmax = (0.03 - z) / max(lz, 0.05)
                st = tmax / 18.0
                s = st * 0.5
                for i in range(18):
                    qx = x + lx * s
                    qy = y + ly * s
                    qz = z + lz * s
                    hh = _samp(h, far, qx, qy)
                    occ = (qz - hh) / (0.06 * s + 1e-5)
                    if occ < shadow:
                        shadow = occ
                    s += st
                if shadow < 0.0:
                    shadow = 0.0
                ndl = nx * lx + ny * ly + nz * lz
                if ndl < 0.0:
                    ndl = 0.0
                E = power * spot * ndl * shadow / d2
                # transluminancia: luz que viaja dentro de la nieve (normal suavizada, sin microsombra)
                bgx = (_samp(hb, hb, x + 0.003, y) - _samp(hb, hb, x - 0.003, y)) / 0.006
                bgy = (_samp(hb, hb, x, y + 0.003) - _samp(hb, hb, x, y - 0.003)) / 0.006
                bnl = math.sqrt(bgx * bgx + bgy * bgy + 1.0)
                wrap = (-bgx * lx - bgy * ly + lz) / bnl * 0.5 + 0.5
                Es = power * spot * wrap / d2
            # cavidad (oclusion ambiente)
            cav = (_samp(hb, hb, x, y) - z) / 0.006
            if cav < 0.0:
                cav = 0.0
            ao = 1.0 / (1.0 + cav * cav)
            alb = 0.90 - 0.06 * gz
            r = alb * (E * 0.95 + Es * 0.10 + ambient[0] * ao)
            g = alb * (E * 0.97 + Es * 0.21 + ambient[1] * ao)
            b = alb * (E * 1.00 + Es * 0.34 + ambient[2] * ao)
            # brillo especular de placas de hielo
            hx = lx - dx
            hy = ly - dy
            hz = lz - dz
            hl = math.sqrt(hx * hx + hy * hy + hz * hz)
            ndh = (nx * hx + ny * hy + nz * hz) / hl
            if ndh > 0.0 and E > 0.0:
                sp = gz * 0.6 * ndh ** 120.0 * E
                r += sp
                g += sp
                b += sp
            out[py, px, 0] = r
            out[py, px, 1] = g
            out[py, px, 2] = b
            # destellos de cristales (facetas aleatorias en celdas de 0,7 mm)
            gl = 0.0
            if E > 0.0:
                cs2 = 0.0007
                cx2 = int(math.floor(x / cs2))
                cy2 = int(math.floor(y / cs2))
                if _hash2(cx2, cy2, 7) < 0.045:
                    fxc = (cx2 + 0.2 + 0.6 * _hash2(cx2, cy2, 8)) * cs2
                    fyc = (cy2 + 0.2 + 0.6 * _hash2(cx2, cy2, 9)) * cs2
                    rr = math.sqrt((x - fxc) ** 2 + (y - fyc) ** 2)
                    if rr < 0.00016:
                        th_ = _hash2(cx2, cy2, 10) * 6.2832
                        ph_ = math.acos(1.0 - _hash2(cx2, cy2, 11) * 0.55)
                        fnx = math.sin(ph_) * math.cos(th_)
                        fny = math.sin(ph_) * math.sin(th_)
                        fnz = math.cos(ph_)
                        dd = (fnx * hx + fny * hy + fnz * hz) / hl
                        if dd > 0.985:
                            gl = E * ((dd - 0.985) / 0.015) ** 3 * 9.0
            glint[py, px] = gl


# ------------------------------------------------------------------------------------------
# camara, luz y posproceso
# ------------------------------------------------------------------------------------------
def _cam_basis(pos, target, roll=0.0):
    f = np.asarray(target, float) - np.asarray(pos, float)
    f /= np.linalg.norm(f)
    r = np.cross(f, [0, 0, 1.0])
    r /= np.linalg.norm(r)
    u = np.cross(r, f)
    if roll:
        a = math.radians(roll)
        r, u = r * math.cos(a) + u * math.sin(a), -r * math.sin(a) + u * math.cos(a)
    return f, r, u


def _agx(x):
    """Mismo mapeo tonal AgX que el renderizador 3D (coherencia entre fuentes)."""
    m = np.array([[0.842479062253094, 0.0423282422610123, 0.0423756549057051],
                  [0.0784335999999992, 0.878468636469772, 0.0784336],
                  [0.0792237451477643, 0.0791661274605434, 0.879142973793104]], np.float32)
    mi = np.array([[1.19687900512017, -0.0528968517574562, -0.0529716355144438],
                   [-0.0980208811401368, 1.15190312990417, -0.0980434501171241],
                   [-0.0990297440797205, -0.0989611768448433, 1.15107367264116]], np.float32)
    mn, mx = -12.47393, 4.026069
    v = np.maximum(x @ m, 1e-10)
    v = np.clip(np.log2(v), mn, mx)
    v = (v - mn) / (mx - mn)
    v2 = v * v
    v4 = v2 * v2
    v = 15.5 * v4 * v2 - 40.14 * v4 * v + 31.96 * v4 - 6.868 * v2 * v + 0.4298 * v2 + 0.1191 * v - 0.00232
    return np.clip(v @ mi, 0, 1)


def _dof(img, depth, focus, strength, levels=(0.0, 1.5, 3.5, 7.0, 12.0, 20.0)):
    """Profundidad de campo por capas: mezcla de versiones desenfocadas segun el circulo de confusion."""
    coc = strength * np.abs(depth - focus) / np.maximum(depth, 1e-3)
    coc = cv2.GaussianBlur(coc.astype(np.float32), (0, 0), 3)
    out = np.zeros_like(img)
    wsum = np.zeros(img.shape[:2], np.float32)
    blurred = [img if s == 0 else cv2.GaussianBlur(img, (0, 0), s) for s in levels]
    for i, s in enumerate(levels):
        lo = levels[i - 1] if i > 0 else -1e9
        hi = levels[i + 1] if i < len(levels) - 1 else 1e9
        w = np.where(coc < s, np.clip((coc - lo) / max(s - lo, 1e-6), 0, 1),
                     np.clip((hi - coc) / max(hi - s, 1e-6), 0, 1)) if i > 0 else np.clip((levels[1] - coc) / levels[1], 0, 1)
        if i == len(levels) - 1:
            w = np.clip((coc - lo) / max(s - lo, 1e-6), 0, 1)
        out += blurred[i] * w[..., None]
        wsum += w
    return out / np.maximum(wsum, 1e-6)[..., None]


class MacroOpening:
    """Plano macro 0-96 (fotogramas a 24 fps)."""

    def __init__(self, W, H):
        self.W, self.H = W, H
        self.k = W / 3840.0
        self.relief = build_relief()
        from .fxclouds import _field
        self.vapor = _field(seed=31)
        rng = np.random.default_rng(5)
        n = 2600
        # nieve en suspension: posiciones iniciales (m) y velocidades (racha hacia +x)
        self.drift_p = np.stack([rng.uniform(-1.4, 0.3, n), rng.uniform(0.0, 1.2, n),
                                 0.002 + 0.045 * rng.uniform(0.0, 1.0, n) ** 2.2], 1)
        self.drift_v = np.stack([rng.uniform(1.1, 1.9, n), rng.uniform(-0.12, 0.18, n),
                                 rng.uniform(-0.02, 0.05, n)], 1)
        self.drift_s = rng.uniform(0.4, 1.0, n)

    # ---- animacion ----
    def camera(self, f):
        """Camara a ras de nieve (11 cm), mirando la huella; leve avance y balanceo de mano."""
        t = f / 24.0
        sway = np.array([0.0012 * math.sin(t * 1.3 + 0.4) + 0.0005 * math.sin(t * 3.1),
                         0.0008 * math.sin(t * 0.9 + 1.1), 0.0007 * math.sin(t * 1.7)])
        q = min(f / 96.0, 1.0)
        pos = np.array([0.06 - 0.03 * q, -0.24 + 0.05 * q, 0.165]) + sway
        tilt = 0.0
        if f > 66:
            q2 = min((f - 66) / 30.0, 1.0)
            tilt = q2 * q2 * (3 - 2 * q2)                 # la mirada sigue al haz hacia arriba
        tgt = np.array([-0.025, 0.37 + 0.7 * tilt, -0.010 + 0.20 * tilt])
        return pos, tgt, 0.20 * math.sin(t * 0.7)

    def lamp(self, f, cam_pos):
        """Frontal de un companero, baja y a la izquierda: luz rasante sobre la costra."""
        lamp = np.array([-1.05, 0.52, 0.56]) + np.array([0.02 * math.sin(f / 24 * 1.1), 0.0,
                                                          0.015 * math.sin(f / 24 * 0.8)])
        keys = [(4, (-1.20, 0.10)), (30, (-0.10, 0.34)), (60, (0.00, 0.40)), (94, (0.85, 2.6))]
        aim = keys[-1][1]
        if f <= keys[0][0]:
            aim = keys[0][1]
        for (f0, a0), (f1, a1) in zip(keys[:-1], keys[1:]):
            if f0 <= f <= f1:
                q = (f - f0) / (f1 - f0)
                q = 1 - (1 - q) ** 3 if f0 == 4 else q * q * (3 - 2 * q)
                aim = (a0[0] + (a1[0] - a0[0]) * q, a0[1] + (a1[1] - a0[1]) * q)
                break
        aim3 = np.array([aim[0], aim[1], 0.0])
        if f > 66:
            q = min((f - 66) / 28.0, 1.0)
            aim3[2] = 0.8 * q * q
        d = aim3 - lamp
        d /= np.linalg.norm(d)
        on = min(max((f - 3) / 6.0, 0.0), 1.0)
        return lamp, d, on

    # ---- render ----
    def render(self, f):
        W, H = self.W, self.H
        R = self.relief
        pos, tgt, roll = self.camera(f)
        fwd, right, up = _cam_basis(pos, tgt, roll)
        fov = math.radians(40.0)
        thw = math.tan(fov / 2)
        thh = thw * H / W
        lamp, ldir, on = self.lamp(f, pos)
        out = np.zeros((H, W, 3), np.float32)
        depth = np.zeros((H, W), np.float32)
        glint = np.zeros((H, W), np.float32)
        ambient = np.array([0.0011, 0.0017, 0.0034], np.float32) * (1.0 + 0.8 * min(f / 96.0, 1.0))
        render_kernel(W, H, pos.astype(np.float64), fwd, right, up, thw, thh, R["h"], R["hb"], R["far"],
                      R["glaze"], lamp.astype(np.float64), ldir.astype(np.float64),
                      math.cos(math.radians(11.0)), math.cos(math.radians(28.0)), 1.15 * on, ambient,
                      out, depth, glint)
        k = self.k
        out = self._sky(out, depth, pos, fwd, right, up, thw, thh, f)
        img = _dof(out, depth, 0.66, 30.0 * k)
        gl = _dof(np.repeat(glint[..., None], 3, 2), depth, 0.66, 44.0 * k)
        img = img + gl * np.array([1.0, 0.985, 0.96], np.float32)
        img = self._breath(img, f, lamp, ldir, on, pos, fwd, right, up, thw, thh)
        img = self._drift(img, f, lamp, ldir, on, pos, fwd, right, up, thw, thh, depth)
        bright = np.clip(img - 0.6, 0, None)
        img = img + 0.10 * cv2.GaussianBlur(bright, (0, 0), 10 * k + 0.5) + 0.05 * cv2.GaussianBlur(bright, (0, 0), 40 * k + 1)
        exposure = 1.0
        disp = _agx(img * exposure)
        lum = disp @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        sh = np.clip(1 - lum / 0.5, 0, 1)[..., None]
        disp = disp + sh * np.array([-0.004, 0.0, 0.010], np.float32)
        fade = 1.0 - min(max((f - 80) / 16.0, 0.0), 1.0) ** 1.5
        return np.clip(disp, 0, 1) * fade

    def _sky(self, out, depth, pos, fwd, right, up, thw, thh, f):
        """Cielo previo al alba sobre el horizonte (parte alta del encuadre) con estrellas tenues."""
        m = depth >= 49.0
        if not m.any():
            return out
        H, W = depth.shape
        ys = (1.0 - (np.arange(H) + 0.5) / H * 2.0) * thh
        el = np.empty(H, np.float32)
        for iy in range(H):
            d = fwd + up * ys[iy]
            el[iy] = d[2] / np.linalg.norm(d)
        g = np.clip(el / 0.12, -0.2, 1.0)
        base = np.array([0.0030, 0.0042, 0.0075], np.float32)
        top = np.array([0.0006, 0.0009, 0.0020], np.float32)
        sky = base[None] * (1 - g[:, None]) + top[None] * g[:, None]
        sky = np.repeat(sky[:, None, :], W, 1)
        rng = np.random.default_rng(3)
        n = int(260 * W / 3840 * 2)
        xs = rng.integers(0, W, n)
        yy = rng.integers(0, H, n)
        sk = np.zeros((H, W), np.float32)
        sk[yy, xs] = rng.uniform(0.002, 0.03, n) ** 1.5 * (0.8 + 0.2 * np.sin(f * 0.3 + np.arange(n)))
        sk = cv2.GaussianBlur(sk, (0, 0), 0.6 * self.k + 0.3) * 30
        sky = sky + sk[..., None] * np.array([0.9, 0.95, 1.0], np.float32)
        out[m] = sky[m]
        return out

    def _beam_screen(self, P, lamp, ldir):
        """Intensidad del cono para puntos 3D P (N,3)."""
        v = P - lamp
        d = np.linalg.norm(v, axis=-1)
        ca = (v @ ldir) / np.maximum(d, 1e-6)
        q = np.clip((ca - math.cos(math.radians(24))) / (math.cos(math.radians(9)) - math.cos(math.radians(24))), 0, 1)
        return q * q * (3 - 2 * q) / np.maximum(d * d, 1e-3)

    def _project(self, P, pos, fwd, right, up, thw, thh):
        rel = P - pos
        z = rel @ fwd
        x = (rel @ right) / np.maximum(z, 1e-4) / thw
        y = (rel @ up) / np.maximum(z, 1e-4) / thh
        return (x * 0.5 + 0.5) * self.W, (0.5 - y * 0.5) * self.H, z

    def _breath(self, img, f, lamp, ldir, on, pos, fwd, right, up, thw, thh):
        """Vaho de una exhalacion (40-80): nube tenue que sale del borde inferior y se deriva."""
        t = (f - 38) / 40.0
        if t <= 0 or t >= 1.2 or on <= 0:
            return img
        W, H = self.W, self.H
        k = self.k
        a_env = math.sin(min(t, 1.0) * math.pi) ** 0.8 if t < 1 else max(0.0, 1 - (t - 1) * 5)
        cx = W * (0.20 + 0.30 * t)
        cy = H * (-0.05 + 0.22 * t)
        sc = 900 * k * (0.6 + 1.2 * t)
        from .fxclouds import _sample
        d = _sample(self.vapor, W, H, sc * 1.8, (t * 60.0, -t * 90.0))
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        r = np.sqrt(((xx - cx) / (sc * 1.1)) ** 2 + ((yy - cy) / (sc * 0.75)) ** 2)
        env = np.clip(1 - r, 0, 1) ** 1.5
        dens = np.clip((d + 0.6) / 2.2, 0, 1) * env * a_env
        # iluminacion: muestras del cono en un plano a 28 cm delante de la camara
        gx = (xx[::40, ::40] / W - 0.5) * 2 * thw * 0.45
        gy = (0.5 - yy[::40, ::40] / H) * 2 * thh * 0.45
        Pl = (pos + fwd * 0.45)[None, None, :] + right[None, None, :] * gx[..., None] + up[None, None, :] * gy[..., None]
        lit = self._beam_screen(Pl.reshape(-1, 3), lamp, ldir).reshape(Pl.shape[:2])
        lit = cv2.resize(lit.astype(np.float32), (W, H), interpolation=cv2.INTER_LINEAR)
        light = 0.004 + 0.035 * lit * on
        col = np.array([0.80, 0.86, 0.95], np.float32) * light[..., None]
        a = (dens * 0.45)[..., None]
        return img * (1 - a * 0.35) + col * a

    def _drift(self, img, f, lamp, ldir, on, pos, fwd, right, up, thw, thh, depth):
        """Racha de nieve rasante (44-88): un velo fino que corre sobre la costra a traves del
        haz (la nieve suspendida dispersa la luz de la frontal) y unos pocos granos nitidos."""
        g = (f - 44) / 44.0
        if g <= 0 or g >= 1 or on <= 0:
            return img
        amp = math.sin(g * math.pi) ** 0.9
        W, H = self.W, self.H
        k = self.k
        from .fxclouds import _sample
        t = f / 24.0
        d1 = _sample(self.vapor, W, H, 1400 * k, (t * 520.0, 0.0), stretch=(5.0, 1.0))
        d2 = _sample(self.vapor, W, H, 600 * k, (t * 900.0 + 300, 200.0), stretch=(7.0, 1.0))
        dens = np.clip((d1 * 0.7 + d2 * 0.5 + 0.2) / 1.6, 0, 1) ** 1.6
        # solo cerca del suelo iluminado: mascara de luz del suelo (luminancia ya renderizada)
        lum = img @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        litm = cv2.GaussianBlur(np.clip(lum / 0.6, 0, 1), (0, 0), 20 * k + 1)
        # el velo es mas denso en la parte alta (lejos) del suelo iluminado y rasante
        veil = dens * litm * amp * on
        col = np.array([0.20, 0.21, 0.23], np.float32)
        return img + veil[..., None] * col
