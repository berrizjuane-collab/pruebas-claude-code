"""Atlas 2D: relieve en Lambert Conica Conforme + vectores + marcadores calculados desde WGS84.

Camara del mapa: centro (X, Y) en metros LCC, escala s (m/px del lienzo 3840 de ancho)
y rotacion (grados, positivo antihorario) para casar el norte con las vistas 3D.
"""
import json
import math
import os

import cv2
import numpy as np
import skia

from ..geo.map_base import LCC, project
from .typo import Layer, draw_text

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MAPD = os.path.join(ROOT, "data", "work", "map")

# rampa hipsometrica (m, sRGB de pantalla) - atlas oscuro, cumbres claras
RAMP = [(-200, (0.040, 0.066, 0.090)), (0, (0.078, 0.106, 0.133)), (1000, (0.094, 0.126, 0.155)),
        (3000, (0.120, 0.152, 0.180)), (4500, (0.145, 0.178, 0.205)), (5500, (0.190, 0.226, 0.252)),
        (6500, (0.400, 0.445, 0.470)), (8000, (0.780, 0.810, 0.825)), (9000, (0.900, 0.920, 0.925))]
OCEAN = (0.035, 0.058, 0.080)
STYLE_VERSION = "v3"
GLACIER = (0.86, 0.90, 0.915)


def ramp(z):
    zs = np.array([r[0] for r in RAMP], np.float32)
    cs = np.array([r[1] for r in RAMP], np.float32)
    out = np.empty(z.shape + (3,), np.float32)
    for c in range(3):
        out[..., c] = np.interp(z, zs, cs[:, c])
    return out


def hillshade(z, res, exag):
    gy, gx = np.gradient(z.astype(np.float32) * exag, res)
    nx, ny, nz = -gx, gy, np.ones_like(gx)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + 1)
    nx, ny, nz = nx * inv, ny * inv, nz * inv
    acc = np.zeros_like(nz)
    for az, w in ((315, 0.55), (270, 0.15), (0, 0.15), (225, 0.15)):
        a, e = math.radians(az), math.radians(40)
        l = (math.cos(e) * math.sin(a), math.cos(e) * math.cos(a), math.sin(e))
        acc += w * np.clip(nx * l[0] + ny * l[1] + nz * l[2], 0, 1)
    flat = math.sin(math.radians(40))
    return acc / flat   # 1 en llano


def rasterize(polys, meta, shape):
    m = np.zeros(shape, np.uint8)
    x0, y1, res = meta["x0"], meta["y1"], meta["res"]
    pts = []
    for poly in polys:
        for ring in poly[:1]:
            a = np.asarray(ring, np.float64)
            px = np.stack([(a[:, 0] - x0) / res, (y1 - a[:, 1]) / res], 1)
            pts.append(np.round(px * 16).astype(np.int32))
    cv2.fillPoly(m, pts, 255, lineType=cv2.LINE_AA, shift=4)
    return m.astype(np.float32) / 255.0


class AtlasBase:
    def __init__(self):
        self.vec = json.load(open(os.path.join(MAPD, "vectors.json")))
        self.levels = {}
        for name, exag in (("A", 9.0), ("B", 2.6)):
            meta = json.load(open(os.path.join(MAPD, f"{name}_meta.json")))
            cache = os.path.join(MAPD, f"{name}_styled_{STYLE_VERSION}.npy")
            if os.path.exists(cache):
                img = np.load(cache)
            else:
                z = np.load(os.path.join(MAPD, f"{name}_elev.npy"))
                shape = z.shape
                land = rasterize(self.vec["land"], meta, shape)
                lakes = rasterize(self.vec["lakes"], meta, shape)
                glac = rasterize(self.vec["glaciers"], meta, shape)
                zc = np.clip(z, -200, 9000)
                hs = hillshade(np.maximum(zc, 0), meta["res"], exag)
                base = ramp(zc)
                shade = (0.38 + 0.78 * hs)[..., None]
                col = base * shade
                # glaciares (Natural Earth): borde suavizado y sombreado del relieve, sin recortes planos
                glac = cv2.GaussianBlur(glac, (0, 0), 0.9)
                g = np.array(GLACIER, np.float32) * (0.42 + 0.66 * hs)[..., None]
                col = col * (1 - 0.55 * glac[..., None]) + g * (0.55 * glac[..., None])
                water = np.clip((1 - land) + lakes, 0, 1)[..., None]
                col = col * (1 - water) + np.array(OCEAN, np.float32) * water
                img = np.clip(col, 0, 1).astype(np.float16)
                np.save(cache, img)
            pyr = [img.astype(np.float32)]
            while min(pyr[-1].shape[:2]) > 900:
                pyr.append(cv2.pyrDown(pyr[-1]))
            self.levels[name] = {"meta": meta, "pyr": pyr}

    def warp(self, name, cam, W, H):
        lv = self.levels[name]
        meta = lv["meta"]
        s = cam["scale"]
        k = int(max(0, min(len(lv["pyr"]) - 1, math.floor(math.log2(max(s / meta["res"], 1.0))))))
        img = lv["pyr"][k]
        res = meta["res"] * (2 ** k)
        # pixel destino (u, v) -> metros -> pixel fuente (inversa exacta de to_screen)
        th = math.radians(cam.get("rot", 0.0))
        c, sn = math.cos(th), math.sin(th)
        a = s / res
        M = np.array([[a * c, a * sn, 0.0], [-a * sn, a * c, 0.0]], np.float64)
        M[0, 2] = (cam["cx"] - meta["x0"]) / res - 0.5 - a * c * W / 2 - a * sn * H / 2
        M[1, 2] = (meta["y1"] - cam["cy"]) / res - 0.5 + a * sn * W / 2 - a * c * H / 2
        out = cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP,
                             borderMode=cv2.BORDER_CONSTANT, borderValue=OCEAN)
        return out

    def coverage(self, name, cam, W, H, feather=40.0):
        """Peso [0,1] de los pixeles de pantalla cubiertos por el nivel (borde suavizado)."""
        meta = self.levels[name]["meta"]
        q = 8   # se calcula a 1/8 y se amplia: la mascara es suave
        u = (np.arange(0, W, q, dtype=np.float32)[None, :] + q / 2) - W / 2
        v = (np.arange(0, H, q, dtype=np.float32)[:, None] + q / 2) - H / 2
        th = math.radians(cam.get("rot", 0.0))
        c, sn = math.cos(th), math.sin(th)
        s = cam["scale"]
        X = cam["cx"] + (c * u + sn * v) * s
        Y = cam["cy"] + (sn * u - c * v) * s
        x1 = meta["x0"] + meta["w"] * meta["res"]
        y0 = meta["y1"] - meta["h"] * meta["res"]
        d = np.minimum.reduce([X - meta["x0"], x1 - X, Y - y0, meta["y1"] - Y]) / s
        m = np.clip(d / feather, 0, 1).astype(np.float32)
        return cv2.resize(m, (W, H), interpolation=cv2.INTER_LINEAR)

    def render_base(self, cam, W=3840, H=2160):
        s = cam["scale"]
        if s >= 1500:
            return self.warp("A", cam, W, H)
        m = self.coverage("B", cam, W, H)
        if s > 900:
            t = (s - 900) / 600
            m = m * (1 - t * t * (3 - 2 * t))
        b = self.warp("B", cam, W, H)
        if m.min() >= 0.999:
            return b
        a = self.warp("A", cam, W, H)
        m = m[..., None]
        return a * (1 - m) + b * m


def to_screen(cam, X, Y, W=3840, H=2160):
    th = math.radians(cam.get("rot", 0.0))
    c, sn = math.cos(th), math.sin(th)
    dx = (np.asarray(X) - cam["cx"]) / cam["scale"]
    dy = (np.asarray(Y) - cam["cy"]) / cam["scale"]
    u = c * dx + sn * dy + W / 2
    v = sn * dx - c * dy + H / 2
    return u, v


def path_from(cam, pts, closed=False, W=3840, H=2160):
    a = np.asarray(pts, np.float64)
    u, v = to_screen(cam, a[:, 0], a[:, 1], W, H)
    p = skia.Path()
    p.moveTo(float(u[0]), float(v[0]))
    for i in range(1, len(u)):
        p.lineTo(float(u[i]), float(v[i]))
    if closed:
        p.close()
    return p


def visible(cam, pts, W=3840, H=2160, margin=200):
    a = np.asarray(pts, np.float64)
    u, v = to_screen(cam, a[:, 0], a[:, 1], W, H)
    return not (u.max() < -margin or u.min() > W + margin or v.max() < -margin or v.min() > H + margin)


def convergence_deg(lon):
    """Angulo entre el norte de cuadricula LCC y el norte verdadero (gamma = n*(lon-lon0))."""
    n = (math.log(math.cos(math.radians(27)) / math.cos(math.radians(37))) /
         math.log(math.tan(math.radians(45 + 37 / 2)) / math.tan(math.radians(45 + 27 / 2))))
    return n * (lon - 81.0)
