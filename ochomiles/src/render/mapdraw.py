"""Cartografia sobre el atlas: limites, rios, reticula, topónimos, marcadores, rotulos de
cumbre con lineas de llamada y recuadros de detalle (Baltoro y Mahalangur).

Todo se posiciona desde coordenadas WGS84 proyectadas a la misma LCC del relieve
(src/geo/map_base.py); nada se coloca a ojo. Las posiciones de los rotulos son
desplazamientos en pixeles respecto al punto, que permanece en su sitio.
"""
import json
import math
import os

import cv2
import numpy as np
import rasterio
import skia
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

from ..geo.map_base import LCC, project
from .atlas import MAPD, AtlasBase, hillshade, ramp
from .overlays import AMBER, GLACIER, OBSIDIAN, SLATE, SLATE_LIGHT, out_cubic, smooth
from .typo import draw_text, measure

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TER = os.path.join(ROOT, "data", "work", "terrain")
RIVER_BLUE = (0.36, 0.50, 0.60)

# Topónimos regionales (lon, lat de anclaje, texto, estilo). Paises segun Natural Earth.
PLACES = [
    (83.6, 33.4, "MESETA TIBETANA", "plateau", (420, 4200)),
    (86.6, 31.4, "CHINA", "country", (420, 6000)),
    (78.6, 24.4, "INDIA", "country", (420, 6000)),
    (85.35, 27.45, "NEPAL", "country_s", (300, 2600)),
    (71.6, 30.2, "PAKISTÁN", "country", (420, 6000)),
    (90.45, 27.42, "BUTÁN", "country_s", (300, 2600)),
    (90.2, 23.9, "BANGLADÉS", "country_s", (420, 6000)),
    (66.4, 34.2, "AFGANISTÁN", "country", (700, 6000)),
    (82.5, 39.3, "CUENCA DEL TARIM", "basin", (420, 3000)),
    (80.6, 26.6, "LLANURA DEL GANGES", "basin", (420, 3000)),
]

# Ejes de cordillera para rotular siguiendo su curvatura (lon, lat)
RANGE_AXES = {
    "HIMALAYA": [(75.6, 33.55), (77.6, 31.85), (79.6, 30.05), (81.8, 28.75), (84.4, 27.75), (87.2, 27.05)],
    "KARAKÓRUM": [(74.9, 37.35), (76.2, 36.75), (77.6, 35.95)],
}

# Rotulos de cumbre en la vista del arco: desplazamiento (px a 4K) desde el punto y alineacion
LABELS_ARC = {
    "nangaparbat": (-36, 64, "right"),
    "shishapangma": (40, -44, "left"),
    "annapurna": (-10, 92, "center"),
    "dhaulagiri": (-56, 40, "right"),
    "manaslu": (34, 72, "left"),
    "kangchenjunga": (44, 56, "left"),
}
CLUSTERS = {
    "baltoro": {"region": "karakoram", "ids": ["k2", "broadpeak", "gasherbrum1", "gasherbrum2"],
                "title": "KARAKÓRUM  ·  BALTORO", "scale": 62.0, "size": (700, 520)},
    "mahalangur": {"region": "khumbu", "ids": ["chooyu", "everest", "lhotse", "makalu"],
                   "title": "HIMALAYA  ·  MAHALANGUR", "scale": 74.0, "size": (820, 500)},
}
# rotulos dentro de los recuadros (px del recuadro)
LABELS_INSET = {
    "k2": (-22, 6, "right"),
    "broadpeak": (24, -8, "left"),
    "gasherbrum1": (22, 26, "left"),
    "gasherbrum2": (-22, 22, "right"),
    "chooyu": (24, 20, "left"),
    "everest": (-24, -24, "right"),
    "lhotse": (-4, 44, "center"),
    "makalu": (-24, -22, "right"),
}


def world_matrix(cam, W, H):
    th = math.radians(cam.get("rot", 0.0))
    c, sn = math.cos(th), math.sin(th)
    s = cam["scale"]
    cx, cy = cam["cx"], cam["cy"]
    return skia.Matrix.MakeAll(c / s, sn / s, -(c * cx + sn * cy) / s + W / 2,
                               sn / s, -c / s, -(sn * cx - c * cy) / s + H / 2, 0, 0, 1)


def to_screen(cam, X, Y, W, H):
    th = math.radians(cam.get("rot", 0.0))
    c, sn = math.cos(th), math.sin(th)
    dx = (np.asarray(X, float) - cam["cx"]) / cam["scale"]
    dy = (np.asarray(Y, float) - cam["cy"]) / cam["scale"]
    return c * dx + sn * dy + W / 2, sn * dx - c * dy + H / 2


def _path(lines):
    p = skia.Path()
    for pts in lines:
        if len(pts) < 2:
            continue
        p.moveTo(*pts[0])
        for q in pts[1:]:
            p.lineTo(*q)
    return p


def _stroke(color, a, width, dash=None):
    paint = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=width,
                       Color4f=skia.Color4f(*color, a))
    paint.setStrokeJoin(skia.Paint.kRound_Join)
    paint.setStrokeCap(skia.Paint.kRound_Cap)
    if dash:
        paint.setPathEffect(skia.DashPathEffect.Make(dash, 0.0))
    return paint


def text_on_path(canvas, fonts, text, pts, family, size, color, tracking=0.0, opacity=1.0, offset=0.0):
    """Texto centrado sobre una polilinea (pixeles). Glifos orientados por la tangente."""
    face = fonts[family]
    gl, xs, wtxt = face.shape(text, size, None, tracking)
    if not gl or opacity <= 0.003:
        return
    P = np.asarray(pts, float)
    seg = np.hypot(*(P[1:] - P[:-1]).T)
    cum = np.concatenate([[0], np.cumsum(seg)])
    L = cum[-1]
    start = (L - wtxt) / 2 + offset
    font = skia.Font(face.tf, size)
    font.setSubpixel(True)
    font.setHinting(skia.FontHinting.kNone)
    widths = font.getWidths(gl)
    xforms = []
    for g, x, wg in zip(gl, xs, widths):
        s = start + x + wg / 2
        s = min(max(s, 0), L - 1e-3)
        i = int(np.searchsorted(cum, s, side="right") - 1)
        i = min(max(i, 0), len(seg) - 1)
        t = (s - cum[i]) / max(seg[i], 1e-9)
        px, py = P[i] + (P[i + 1] - P[i]) * t
        ang = math.atan2(P[i + 1][1] - P[i][1], P[i + 1][0] - P[i][0])
        c, sn = math.cos(ang), math.sin(ang)
        # el origen del glifo se desplaza media anchura hacia atras sobre la tangente
        xforms.append(skia.RSXform(c, sn, px - c * wg / 2, py - sn * wg / 2))
    blob = skia.TextBlob.MakeFromRSXform(bytes(np.array(gl, np.uint16).tobytes()), xforms, font,
                                         skia.TextEncoding.kGlyphID)
    paint = skia.Paint(AntiAlias=True, Color4f=skia.Color4f(*color[:3], (color[3] if len(color) > 3 else 1) * opacity))
    canvas.drawTextBlob(blob, 0, 0, paint)


def _smooth_poly(pts, n=64):
    """Curva Catmull-Rom por los puntos (suaviza los ejes de cordillera)."""
    P = np.asarray(pts, float)
    P = np.vstack([P[0] * 2 - P[1], P, P[-1] * 2 - P[-2]])
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, n // (len(P) - 3) + 2)[:-1]:
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-2])
    return np.array(out)


class Inset:
    """Recuadro de detalle: relieve del DEM Copernicus (30 m) y nieve de Sentinel-2,
    reproyectados a la LCC del atlas a escala propia."""

    def __init__(self, key, peaks_by_id):
        cfg = CLUSTERS[key]
        self.key, self.cfg = key, cfg
        self.ids = cfg["ids"]
        pts = np.array([project(peaks_by_id[i]["dem_lon"], peaks_by_id[i]["dem_lat"]) for i in self.ids])
        self.cx = (pts[:, 0].min() + pts[:, 0].max()) / 2
        self.cy = (pts[:, 1].min() + pts[:, 1].max()) / 2
        self.w, self.h = cfg["size"]
        self.scale = cfg["scale"]
        self.pts = pts
        self.image = self._relief(cfg["region"])
        self.peaks = peaks_by_id

    def _grid(self):
        x0 = self.cx - self.w / 2 * self.scale
        y1 = self.cy + self.h / 2 * self.scale
        return from_origin(x0, y1, self.scale, self.scale)

    def _relief(self, region):
        cache = os.path.join(MAPD, f"inset_{self.key}_v3.npy")
        if os.path.exists(cache):
            return np.load(cache)
        tr = self._grid()
        z = np.zeros((self.h, self.w), np.float32)
        with rasterio.open(os.path.join(TER, f"{region}_L0.tif")) as ds:
            reproject(rasterio.band(ds, 1), z, dst_transform=tr, dst_crs=LCC, resampling=Resampling.average)
        snow = np.zeros((self.h, self.w), np.float32)
        with rasterio.open(os.path.join(TER, f"{region}_albedo.tif")) as ds:
            reproject(rasterio.band(ds, 4), snow, dst_transform=tr, dst_crs=LCC, resampling=Resampling.average)
        snow = np.clip(snow / 255.0, 0, 1)
        hs = hillshade(z, self.scale, 1.0)
        base = ramp(np.clip(z, -200, 9000)) * (0.36 + 0.80 * hs)[..., None]
        g = np.array(GLACIER, np.float32) * (0.30 + 0.62 * hs)[..., None]
        k = (np.clip(snow, 0, 1) ** 1.2 * 0.62)[..., None]
        img = np.clip((base * (1 - k) + g * k) * 0.88, 0, 1).astype(np.float32)
        np.save(cache, img)
        return img

    def px(self, X, Y):
        return (self.w / 2 + (X - self.cx) / self.scale, self.h / 2 - (Y - self.cy) / self.scale)


class MapArt:
    def __init__(self, fonts, peaks_ordered, W=3840, H=2160):
        self.W, self.H = W, H
        self.fonts = fonts
        self.atlas = AtlasBase()
        vec = self.atlas.vec
        solid, dashed = [], []
        for b in vec["borders"]:
            (solid if b["cls"].startswith("International") else dashed).append(b["pts"])
        self.p_border = _path(solid)
        self.p_border_d = _path(dashed)
        self.p_coast = _path(vec["coast"])
        self.p_rivers = {r: _path([v["pts"] for v in vec["rivers"] if v["rank"] is not None and
                                    (v["rank"] <= 3 if r == 1 else 3 < v["rank"] <= 5)]) for r in (1, 2)}
        grat = []
        for lon in range(60, 105, 5):
            lat = np.linspace(15, 45, 61)
            x, y = project(np.full_like(lat, lon), lat)
            grat.append(np.stack([x, y], 1).tolist())
        for lat in range(15, 50, 5):
            lon = np.linspace(55, 105, 101)
            x, y = project(lon, np.full_like(lon, lat))
            grat.append(np.stack([x, y], 1).tolist())
        self.p_grat = _path(grat)
        self.peaks = peaks_ordered
        self.by_id = {p["id"]: p for p in peaks_ordered}
        self.XY = {p["id"]: project(p["dem_lon"], p["dem_lat"]) for p in peaks_ordered}
        self.places = [(project(lon, lat), txt, sty, rng) for lon, lat, txt, sty, rng in PLACES]
        self.ranges = {k: np.array([project(lo, la) for lo, la in v]) for k, v in RANGE_AXES.items()}
        self._insets = {}

    # ------------------------------------------------------------------ base
    def base(self, cam):
        return self.atlas.render_base(cam, self.W, self.H)

    def inset(self, key):
        if key not in self._insets:
            self._insets[key] = Inset(key, self.by_id)
        return self._insets[key]

    # ------------------------------------------------------------------ vectores
    def draw_vectors(self, canvas, cam, opacity=1.0):
        if opacity <= 0.003:
            return
        M = world_matrix(cam, self.W, self.H)
        s = cam["scale"]
        k = float(np.clip((4000 - s) / 3000, 0.35, 1.0))     # lineas algo mas finas en vista continental
        for path, paint in (
                (self.p_grat, _stroke(GLACIER, 0.065 * opacity, 1.3)),
                (self.p_coast, _stroke(SLATE_LIGHT, 0.30 * opacity, 1.6 * k)),
                (self.p_rivers[2], _stroke(RIVER_BLUE, 0.22 * opacity, 1.2 * k)),
                (self.p_rivers[1], _stroke(RIVER_BLUE, 0.42 * opacity, 2.0 * k)),
                (self.p_border, _stroke(GLACIER, 0.30 * opacity, 1.7 * k)),
                (self.p_border_d, _stroke(GLACIER, 0.24 * opacity, 1.5 * k, dash=[9.0, 7.0])),
        ):
            p = skia.Path(path)
            p.transform(M)
            canvas.drawPath(p, paint)

    # ------------------------------------------------------------------ toponimos
    def draw_places(self, canvas, cam, opacity=1.0, ranges_opacity=None):
        if opacity > 0.003:
            for (X, Y), txt, sty, (smin, smax) in self.places:
                s = cam["scale"]
                vis = smooth((s - smin * 0.8) / (smin * 0.25)) * (1 - smooth((s - smax) / (smax * 0.3)))
                a = opacity * vis
                if a <= 0.003:
                    continue
                u, v = to_screen(cam, X, Y, self.W, self.H)
                if sty == "plateau":
                    draw_text(canvas, self.fonts, _title_es(txt), u, v, "SerifTextItalic", 46,
                              (*GLACIER, 0.50), tracking=2, align="center", opacity=a)
                elif sty == "basin":
                    draw_text(canvas, self.fonts, _title_es(txt), u, v,
                              "SerifTextItalic", 34, (*GLACIER, 0.36), align="center", opacity=a)
                else:
                    size = 30 if sty == "country" else 24
                    draw_text(canvas, self.fonts, txt, u, v, "DataMedium", size, (*SLATE_LIGHT, 0.62),
                              tracking=size * 0.42, align="center", opacity=a)
        ro = opacity if ranges_opacity is None else ranges_opacity
        if ro > 0.003:
            for name, P in self.ranges.items():
                u, v = to_screen(cam, P[:, 0], P[:, 1], self.W, self.H)
                pts = _smooth_poly(np.stack([u, v], 1), 96)
                s = cam["scale"]
                size = float(np.clip(44 * (700 / s) ** 0.35, 30, 56))
                text_on_path(canvas, self.fonts, name, pts, "DataSemi", size, (*GLACIER, 0.82),
                             tracking=size * 0.62, opacity=ro)

    # ------------------------------------------------------------------ marcadores
    def marker_xy(self, cam, pid):
        X, Y = self.XY[pid]
        u, v = to_screen(cam, X, Y, self.W, self.H)
        return float(u), float(v)

    def draw_marker(self, canvas, u, v, appear=1.0, active=0.0, lit=0.0, r=7.0, opacity=1.0):
        if appear <= 0.003 or opacity <= 0.003:
            return
        a = opacity * min(appear * 1.5, 1.0)
        rr = r * (0.4 + 0.6 * out_cubic(appear)) * (1 + 0.35 * active)
        # aro oscuro para contraste sobre nieve
        canvas.drawCircle(u, v, rr + 3.2, skia.Paint(AntiAlias=True, Color4f=skia.Color4f(*OBSIDIAN, 0.55 * a)))
        col = tuple(GLACIER[i] * (1 - max(active, lit)) + AMBER[i] * max(active, lit) for i in range(3))
        if lit > 0.01:
            glow = skia.Paint(AntiAlias=True, Color4f=skia.Color4f(*AMBER, 0.30 * lit * a))
            glow.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 10))
            canvas.drawCircle(u, v, rr + 8, glow)
        canvas.drawCircle(u, v, rr, skia.Paint(AntiAlias=True, Color4f=skia.Color4f(*col, a)))
        if active > 0.01:
            canvas.drawCircle(u, v, rr + 13 + 4 * (1 - active), _stroke(AMBER, 0.9 * active * a, 2.6))
        if appear < 1.0:   # onda de aparicion
            t = appear
            canvas.drawCircle(u, v, rr + 6 + 30 * t, _stroke(GLACIER, 0.5 * (1 - t) * opacity, 1.6))

    def draw_label(self, canvas, u, v, pid, off, opacity=1.0, size=1.0, alt=True, leader_gap=12):
        if opacity <= 0.003:
            return
        p = self.by_id[pid]
        dx, dy, align = off
        lx, ly = u + dx, v + dy
        name_sz, alt_sz = 33 * size, 26 * size
        if math.hypot(dx, dy) > 34:
            # linea de llamada desde el borde del punto hasta el rotulo
            d = math.hypot(dx, dy)
            sx, sy = u + dx / d * leader_gap, v + dy / d * leader_gap
            ex = lx + (8 if align == "left" else -8 if align == "right" else 0)
            ey = ly - (name_sz * 0.35 if dy < 0 else name_sz * 0.95)
            canvas.drawLine(sx, sy, ex, ey, _stroke(GLACIER, 0.42 * opacity, 1.4))
        ty = ly + (0 if dy < 0 else name_sz * 0.72)
        if dy < 0 and alt:
            ty -= alt_sz * 1.25
        halo = ((*OBSIDIAN, 0.78), 7.0 * size)
        draw_text(canvas, self.fonts, p["name"], lx, ty, "DataMedium", name_sz, (*GLACIER, 0.97),
                  align=align, opacity=opacity, halo=halo)
        if alt:
            draw_text(canvas, self.fonts, p["altitude_label"], lx, ty + alt_sz * 1.22, "Data", alt_sz,
                      (*SLATE_LIGHT, 1.0), features={"tnum": True}, align=align, opacity=opacity, halo=halo)

    # ------------------------------------------------------------------ recuadros
    def draw_inset(self, canvas, cam, key, box_xy, opacity=1.0, grow=1.0, markers=None):
        """box_xy: esquina superior izquierda del recuadro en pantalla. Dibuja el marco en el
        mapa alrededor del grupo, las lineas de llamada y el recuadro ampliado."""
        if opacity <= 0.003:
            return
        ins = self.inset(key)
        bx, by = box_xy
        # rectangulo de referencia en el mapa principal (extension del recuadro a escala del mapa)
        X0, Y1 = ins.cx - ins.w / 2 * ins.scale, ins.cy + ins.h / 2 * ins.scale
        X1, Y0 = ins.cx + ins.w / 2 * ins.scale, ins.cy - ins.h / 2 * ins.scale
        us, vs = to_screen(cam, [X0, X1, X1, X0], [Y1, Y1, Y0, Y0], self.W, self.H)
        rect = skia.Rect.MakeLTRB(float(min(us)), float(min(vs)), float(max(us)), float(max(vs)))
        canvas.drawRect(rect, _stroke(GLACIER, 0.75 * opacity, 1.6))
        g = out_cubic(grow)
        w, h = ins.w, ins.h
        # lineas de llamada entre las esquinas mas proximas
        corners_r = [(rect.left(), rect.top()), (rect.right(), rect.top()), (rect.right(), rect.bottom()),
                     (rect.left(), rect.bottom())]
        corners_i = [(bx, by), (bx + w, by), (bx + w, by + h), (bx, by + h)]
        pairs = sorted(range(4), key=lambda i: math.hypot(corners_r[i][0] - corners_i[i][0],
                                                          corners_r[i][1] - corners_i[i][1]))[:2]
        for i in pairs:
            (x0, y0), (x1, y1) = corners_r[i], corners_i[i]
            canvas.drawLine(x0, y0, x0 + (x1 - x0) * g, y0 + (y1 - y0) * g, _stroke(GLACIER, 0.38 * opacity, 1.3))
        if grow <= 0.02:
            return
        # recuadro: crece desde el rectangulo de referencia
        cx_r, cy_r = rect.centerX(), rect.centerY()
        L = cx_r + (bx - cx_r) * g
        T = cy_r + (by - cy_r) * g
        R = cx_r + (bx + w - cx_r) * g
        B = cy_r + (by + h - cy_r) * g
        dst = skia.Rect.MakeLTRB(L, T, R, B)
        img = getattr(ins, "_skimg", None)
        if img is None:
            arr = (np.clip(ins.image, 0, 1) * 255 + 0.5).astype(np.uint8)
            arr = np.ascontiguousarray(np.dstack([arr, np.full(arr.shape[:2], 255, np.uint8)]))
            img = ins._skimg = skia.Image.fromarray(arr, colorType=skia.kRGBA_8888_ColorType)
        shadow = skia.Paint(AntiAlias=True, Color4f=skia.Color4f(*OBSIDIAN, 0.55 * opacity * g))
        shadow.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 22))
        canvas.drawRect(dst.makeOffset(0, 10), shadow)
        p = skia.Paint(AntiAlias=True)
        p.setAlphaf(opacity * min(1.0, g * 1.4))
        canvas.drawImageRect(img, dst, skia.SamplingOptions(skia.FilterMode.kLinear), p)
        canvas.drawRect(dst, _stroke(GLACIER, 0.75 * opacity, 1.6))
        if g < 0.98:
            return
        a_in = opacity
        # titulo del recuadro
        draw_text(canvas, self.fonts, ins.cfg["title"], bx + 2, by - 18, "DataMedium", 24, (*SLATE_LIGHT, 0.9),
                  tracking=7, opacity=a_in)
        # escala grafica (10 km)
        km = 10000.0 / ins.scale
        x0s, y0s = bx + w - 30 - km, by + h - 30
        canvas.drawLine(x0s, y0s, x0s + km, y0s, _stroke(GLACIER, 0.8 * a_in, 2.0))
        for xx in (x0s, x0s + km):
            canvas.drawLine(xx, y0s - 7, xx, y0s + 1, _stroke(GLACIER, 0.8 * a_in, 2.0))
        draw_text(canvas, self.fonts, "10 km", x0s + km / 2, y0s - 14, "Data", 21, (*GLACIER, 0.85),
                  align="center", opacity=a_in)
        canvas.save()
        canvas.clipRect(dst)
        for j, pid in enumerate(ins.ids):
            st = (markers or {}).get(pid, {})
            X, Y = self.XY[pid]
            ux, vy = ins.px(X, Y)
            ux, vy = bx + ux, by + vy
            self.draw_marker(canvas, ux, vy, appear=st.get("appear", 1.0), active=st.get("active", 0.0),
                             lit=st.get("lit", 0.0), r=7.5, opacity=a_in)
            self.draw_label(canvas, ux, vy, pid, LABELS_INSET[pid], opacity=a_in * st.get("label", 1.0),
                            size=0.92, leader_gap=11)
        canvas.restore()


def _title_es(txt):
    small = {"del", "de", "la", "el"}
    return " ".join(w.lower() if w.lower() in small else w.capitalize() for w in txt.split())
