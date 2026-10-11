"""Camara del atlas 2D y enlace con las vistas 3D.

- Interpolacion zoom-paneo de van Wijk y Nuij (2003, "Smooth and efficient zooming and
  panning"): el recorrido optimo se aleja lo justo para que el desplazamiento se perciba
  con velocidad constante.
- Conversion entre la TM local de cada region (escenas 3D) y la LCC del atlas, para que
  un plano 3D cenital y el mapa coincidan en centro, escala y orientacion al fundirse.
"""
import math

import numpy as np
from pyproj import Transformer

from ..geo.map_base import LCC
from ..geo.regions import local_crs

_TF = {}


def _tf(region, inverse=False):
    key = (region, inverse)
    if key not in _TF:
        a, b = local_crs(region), LCC
        if inverse:
            a, b = b, a
        _TF[key] = Transformer.from_crs(a, b, always_xy=True)
    return _TF[key]


def tm_to_lcc(region, x, y):
    return _tf(region).transform(x, y)


def lcc_to_tm(region, X, Y):
    return _tf(region, True).transform(X, Y)


def map_cam_for_nadir(region, cam_xy, ground_z, cam_alt, fov_h_deg, W=3840):
    """Camara 2D equivalente a una camara 3D cenital (mirando al nadir, norte de la TM arriba)."""
    X, Y = tm_to_lcc(region, cam_xy[0], cam_xy[1])
    width = 2.0 * (cam_alt - ground_z) * math.tan(math.radians(fov_h_deg) / 2.0)
    # norte de la TM local expresado en la LCC: angulo de la cuadricula
    X2, Y2 = tm_to_lcc(region, cam_xy[0], cam_xy[1] + 1000.0)
    rot = math.degrees(math.atan2(X2 - X, Y2 - Y))   # >0: el norte TM apunta al este de la LCC
    return {"cx": X, "cy": Y, "scale": width / W, "rot": -rot}


class VanWijk:
    """Trayectoria optima entre (c0, w0) y (c1, w1); w = anchura visible (m)."""

    def __init__(self, c0, w0, c1, w1, rho=1.3):
        self.c0 = np.asarray(c0, float)
        self.c1 = np.asarray(c1, float)
        self.w0, self.w1, self.rho = float(w0), float(w1), rho
        self.u1 = float(np.linalg.norm(self.c1 - self.c0))
        r = rho
        if self.u1 < 1e-6:
            self.S = abs(math.log(self.w1 / self.w0)) / r
            self.flat = True
            return
        self.flat = False
        b0 = (w1 * w1 - w0 * w0 + r ** 4 * self.u1 ** 2) / (2 * w0 * r * r * self.u1)
        b1 = (w1 * w1 - w0 * w0 - r ** 4 * self.u1 ** 2) / (2 * w1 * r * r * self.u1)
        self.r0 = math.log(-b0 + math.sqrt(b0 * b0 + 1))
        r1 = math.log(-b1 + math.sqrt(b1 * b1 + 1))
        self.S = (r1 - self.r0) / r

    def at(self, t):
        """t en [0, 1] (ya suavizado por quien llama) -> (centro, anchura)."""
        s = self.S * min(max(t, 0.0), 1.0)
        r = self.rho
        if self.flat:
            k = 1.0 if self.w1 > self.w0 else -1.0
            return self.c0.copy(), self.w0 * math.exp(k * r * s)
        u = self.w0 / (r * r) * (math.cosh(self.r0) * math.tanh(r * s + self.r0) - math.sinh(self.r0))
        w = self.w0 * math.cosh(self.r0) / math.cosh(r * s + self.r0)
        c = self.c0 + (self.c1 - self.c0) * (u / self.u1)
        return c, w


def lerp_angle(a, b, t):
    d = (b - a + 180.0) % 360.0 - 180.0
    return a + d * t


def map_cam_path(keys, f, W=3840):
    """keys: lista de (fotograma, {"cx","cy","scale","rot"}[, ease, rho]). Entre claves se usa
    van Wijk para centro/escala y una interpolacion simple para la rotacion."""
    from .timeline import ease
    if f <= keys[0][0]:
        return dict(keys[0][1])
    for i in range(len(keys) - 1):
        f0, a = keys[i][0], keys[i][1]
        f1, b = keys[i + 1][0], keys[i + 1][1]
        if f0 <= f <= f1:
            kind = keys[i][2] if len(keys[i]) > 2 else "smooth"
            rho = keys[i][3] if len(keys[i]) > 3 else 1.3
            t = ease((f - f0) / max(f1 - f0, 1e-9), kind)
            vw = VanWijk((a["cx"], a["cy"]), a["scale"] * W, (b["cx"], b["cy"]), b["scale"] * W, rho)
            c, w = vw.at(t)
            return {"cx": float(c[0]), "cy": float(c[1]), "scale": w / W,
                    "rot": lerp_angle(a.get("rot", 0.0), b.get("rot", 0.0), t)}
    return dict(keys[-1][1])
