"""Graficos de superposicion a 3840x2160: bloque de datos, localizador, titulos.

Todo se dibuja con Skia en capas RGBA premultiplicadas. Paleta del encargo:
obsidiana #0B1016, blanco glaciar #F1F4F2, azul pizarra #597181, ambar #D5A45A.
"""
import json
import math
import os

import cv2
import numpy as np
import skia

from ..geo.map_base import project
from .typo import draw_text, measure, wrap

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
W, H = 3840, 2160
OBSIDIAN = (0.043, 0.063, 0.086)
GLACIER = (0.945, 0.957, 0.949)
SLATE = (0.349, 0.443, 0.506)
SLATE_LIGHT = (0.66, 0.73, 0.77)
AMBER = (0.835, 0.643, 0.353)
MARGIN_X = 216
FPS_OVL = 24

ALTS = [8027, 8034, 8051, 8080, 8091, 8125, 8163, 8167, 8188, 8485, 8516, 8586, 8611, 8848.86]


def smooth(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def out_cubic(t):
    t = min(max(t, 0.0), 1.0)
    return 1 - (1 - t) ** 3


def appear(u, t_in, t_out, d_in=14, d_out=12):
    """(opacidad, desplazamiento_y, desenfoque) para una linea que entra en t_in y sale en t_out."""
    a_in = out_cubic((u - t_in) / d_in)
    a_out = 1 - smooth((u - t_out) / d_out)
    a = min(a_in, a_out)
    dy = (1 - a_in) * 22 - (1 - a_out) * 10
    blur = (1 - a_in) * 7 + (1 - a_out) * 4
    return a, dy, blur


def scrim(canvas, strength=1.0, corner="bl"):
    """Degradado suave para legibilidad (sin paneles): mancha eliptica oscura en una esquina."""
    if strength <= 0.01:
        return
    cx, cy = (900, H + 120) if corner == "bl" else (W / 2, H + 200)
    rx, ry = (2300, 1150) if corner == "bl" else (2600, 900)
    paint = skia.Paint(AntiAlias=True)
    shader = skia.GradientShader.MakeRadial(
        skia.Point(0, 0), 1.0,
        [skia.Color4f(*OBSIDIAN, 0.62 * strength), skia.Color4f(*OBSIDIAN, 0.34 * strength),
         skia.Color4f(*OBSIDIAN, 0.0)], [0.0, 0.45, 1.0])
    paint.setShader(shader)
    canvas.save()
    canvas.translate(cx, cy)
    canvas.scale(rx, ry)
    canvas.drawCircle(0, 0, 1.0, paint)
    canvas.restore()


# ----------------------------------------------------------------------------------------
# bloque de datos del capitulo
# ----------------------------------------------------------------------------------------
def data_block(canvas, fonts, peak, k, u, t_in=14, t_out=184):
    """Dibuja el bloque de datos del capitulo k (1..14) en el fotograma relativo u."""
    a_all = min(out_cubic((u - t_in) / 20), 1 - smooth((u - t_out - 8) / 16))
    scrim(canvas, a_all)
    x = MARGIN_X
    base = H - 170
    detail = peak["detail"]
    lines = wrap(fonts, detail, "SerifTextItalic", 54, 1900)
    extra = (len(lines) - 1) * 70
    y_detail = base - extra
    y_loc = y_detail - 92
    y_ruler = y_loc - 98
    y_alt = y_ruler - 42
    y_name = y_alt - 132
    y_count = y_name - 176

    # contador
    a, dy, bl = appear(u, t_in, t_out + 12)
    draw_text(canvas, fonts, f"{k:02d}  /  14", x + 2, y_count + dy, "DataMedium", 34, (*GLACIER, 0.72),
              tracking=6, features={"tnum": True}, opacity=a, blur=bl)
    # nombre
    a, dy, bl = appear(u, t_in + 4, t_out + 9)
    draw_text(canvas, fonts, peak["name"], x - 6, y_name + dy, "Title", 156, GLACIER, opacity=a, blur=bl)
    # altitud
    a, dy, bl = appear(u, t_in + 12, t_out + 6)
    label = peak["altitude_label"].replace(" m", "")
    wnum = draw_text(canvas, fonts, label, x, y_alt + dy, "DataLight", 86, GLACIER,
                     features={"tnum": True}, opacity=a, blur=bl)
    draw_text(canvas, fonts, "m", x + wnum + 18, y_alt + dy, "DataLight", 52, (*GLACIER, 0.8), opacity=a, blur=bl)
    if peak.get("altitude_note"):
        draw_text(canvas, fonts, peak["altitude_note"], x + wnum + 80, y_alt + dy - 4, "Data", 28,
                  (*SLATE_LIGHT, 0.95), opacity=a, blur=bl)
    # regla de altitud: 8.000 - 8.850 m con las 14 marcas
    a_r = min(out_cubic((u - (t_in + 16)) / 24), 1 - smooth((u - t_out - 4) / 12))
    if a_r > 0.003:
        L = 780
        grow = out_cubic((u - (t_in + 16)) / 22)
        line = skia.Paint(AntiAlias=True, Color4f=skia.Color4f(*GLACIER, 0.32 * a_r), StrokeWidth=2.0)
        canvas.drawLine(x, y_ruler, x + L * grow, y_ruler, line)
        for i, alt in enumerate(ALTS):
            xx = x + (alt - 8000) / 850 * L
            if xx > x + L * grow + 1:
                continue
            if i == k - 1:
                p = skia.Paint(AntiAlias=True, Color4f=skia.Color4f(*AMBER, a_r), StrokeWidth=4.0)
                canvas.drawLine(xx, y_ruler - 30, xx, y_ruler + 2, p)
                canvas.drawCircle(xx, y_ruler - 36, 6.5, skia.Paint(AntiAlias=True, Color4f=skia.Color4f(*AMBER, a_r)))
            else:
                done = i < k - 1
                p = skia.Paint(AntiAlias=True, Color4f=skia.Color4f(*GLACIER, (0.62 if done else 0.30) * a_r),
                               StrokeWidth=2.0)
                canvas.drawLine(xx, y_ruler - 14, xx, y_ruler, p)
        draw_text(canvas, fonts, "8.000", x, y_ruler + 40, "Data", 25, (*GLACIER, 0.46), features={"tnum": True},
                  opacity=a_r)
        draw_text(canvas, fonts, "8.850 m", x + L, y_ruler + 40, "Data", 25, (*GLACIER, 0.46),
                  features={"tnum": True}, align="right", opacity=a_r)
    # ubicacion y cordillera
    a, dy, bl = appear(u, t_in + 18, t_out + 3)
    loc = f"{peak['location'].upper()}     ·     {peak['range'].upper()}"
    draw_text(canvas, fonts, loc, x + 2, y_loc + dy, "DataMedium", 33, SLATE_LIGHT, tracking=7, opacity=a, blur=bl)
    # detalle (entra poco despues de la ubicacion: el dato necesita el tiempo de lectura)
    a, dy, bl = appear(u, t_in + 20, t_out)
    for i, ln in enumerate(lines):
        draw_text(canvas, fonts, ln, x, y_detail + i * 70 + dy, "SerifTextItalic", 54, (*GLACIER, 0.94),
                  opacity=a, blur=bl)


# ----------------------------------------------------------------------------------------
# localizador (arco montanoso en miniatura, norte arriba, misma proyeccion LCC del atlas)
# ----------------------------------------------------------------------------------------
class Locator:
    W_BOX, H_BOX = 720, 480
    MX, MY = 80, 70

    def __init__(self, peaks_ordered):
        self.peaks = peaks_ordered
        pts = np.array([project(p["approx_lon"], p["approx_lat"]) for p in peaks_ordered])
        self.cx = (pts[:, 0].min() + pts[:, 0].max()) / 2
        self.cy = (pts[:, 1].min() + pts[:, 1].max()) / 2
        self.w, self.h = self.W_BOX, self.H_BOX
        self.x0 = W - MARGIN_X - self.w
        self.y0 = 132
        span_x = pts[:, 0].max() - pts[:, 0].min()
        span_y = pts[:, 1].max() - pts[:, 1].min()
        self.scale = max(span_x / (self.w - 2 * self.MX), span_y / (self.h - 2 * self.MY))   # m por pixel
        self.image = skia.Image.fromarray(self._relief(), colorType=skia.kRGBA_8888_ColorType,
                                          alphaType=skia.kPremul_AlphaType)
        self.screen = [self.to_px(*p) for p in pts]

    def _relief(self):
        """Mapa en miniatura: relieve sombreado del nivel A del atlas (Terrain Tiles, LCC)
        remuestreado al recuadro y teñido por altitud (llanuras oscuras, meseta pizarra,
        cordillera blanca). Ocupa todo el recuadro; el borde lo dibuja draw()."""
        from .atlas import MAPD, hillshade
        meta = json.load(open(os.path.join(MAPD, "A_meta.json")))
        z = np.load(os.path.join(MAPD, "A_elev.npy")).astype(np.float32)
        res = meta["res"]
        a = self.scale / res
        M = np.array([[a, 0, (self.cx - meta["x0"]) / res - 0.5 - a * self.w / 2],
                      [0, a, (meta["y1"] - self.cy) / res - 0.5 - a * self.h / 2]])
        z = cv2.warpAffine(z, M, (self.w, self.h), flags=cv2.INTER_AREA | cv2.WARP_INVERSE_MAP, borderValue=0)
        zc = np.maximum(z, 0)
        hs = np.clip(hillshade(zc, self.scale, 7.0), 0, 1.6)
        # la meseta (4.500-5.000 m) queda en pizarra media para que la cordillera sea lo mas claro
        zs = [0.0, 1200.0, 3600.0, 5200.0, 6300.0, 7500.0]
        cs = np.array([(0.100, 0.130, 0.165), (0.130, 0.160, 0.195), (0.195, 0.230, 0.265),
                       (0.290, 0.330, 0.365), (0.780, 0.810, 0.830), (0.950, 0.960, 0.955)], np.float32)
        base = np.dstack([np.interp(zc, zs, cs[:, c]) for c in range(3)])
        rgb = base * (0.50 + 0.50 * hs)[..., None]
        # vineta interior suave: el borde del recuadro se oscurece un poco (lectura de "ventana")
        yy, xx = np.mgrid[0:self.h, 0:self.w].astype(np.float32)
        ex = np.minimum(xx, self.w - 1 - xx) / 60.0
        ey = np.minimum(yy, self.h - 1 - yy) / 60.0
        vig = np.clip(np.minimum(ex, ey), 0, 1)
        rgb = rgb * (0.72 + 0.28 * vig)[..., None]
        alpha = np.full((self.h, self.w), 0.90, np.float32)
        pm = np.clip(rgb, 0, 1) * alpha[..., None]
        return np.ascontiguousarray((np.dstack([pm, alpha[..., None]]) * 255 + 0.5).astype(np.uint8))

    def to_px(self, X, Y):
        return (self.x0 + self.w / 2 + (X - self.cx) / self.scale,
                self.y0 + self.h / 2 - (Y - self.cy) / self.scale)

    RADIUS = 20.0
    # rotulos de cordillera: Karakorum en la esquina superior izquierda (sobre su grupo de
    # cumbres, sin tocar los marcadores) e Himalaya bajo el arco (lon, lat del ancla)
    RANGE_TAGS = [("KARAKÓRUM", None, None, "left"), ("HIMALAYA", 84.4, 27.25, "center")]

    def draw(self, canvas, k, u, opacity=1.0, t_in=0, fonts=None):
        """k: capitulo activo (1..14); u: fotograma relativo al inicio del capitulo."""
        if opacity <= 0.003:
            return
        rect = skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(self.x0, self.y0, self.w, self.h), self.RADIUS, self.RADIUS)
        # sombra suave que separa el recuadro del cielo
        sh = skia.Paint(AntiAlias=True, Color4f=skia.Color4f(*OBSIDIAN, 0.35 * opacity))
        sh.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 18))
        canvas.drawRRect(rect, sh)
        canvas.save()
        canvas.clipRRect(rect, doAntiAlias=True)
        paint = skia.Paint(AntiAlias=True)
        paint.setAlphaf(opacity)
        canvas.drawImage(self.image, self.x0, self.y0, skia.SamplingOptions(skia.FilterMode.kLinear), paint)
        canvas.restore()
        canvas.drawRRect(rect, skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=1.6,
                                          Color4f=skia.Color4f(*GLACIER, 0.30 * opacity)))
        if fonts is not None:
            for text, lon, lat, align in self.RANGE_TAGS:
                if lon is None:
                    tx, ty = self.x0 + 28, self.y0 + 30
                else:
                    tx, ty = self.to_px(*project(lon, lat))
                draw_text(canvas, fonts, text, tx, ty, "DataMedium", 21, (*SLATE_LIGHT, 0.80), tracking=21 * 0.32,
                          align=align, opacity=opacity)
        # resto de cumbres: puntos pequenos (visitadas algo mas presentes)
        for i, (px, py) in enumerate(self.screen):
            if i == k - 1:
                continue
            done = i < k - 1
            c = skia.Color4f(*GLACIER, (0.80 if done else 0.42) * opacity)
            canvas.drawCircle(px, py, 4.6 if done else 3.8, skia.Paint(AntiAlias=True, Color4f=c))
        # cumbre activa: punto ambar mayor + halo; llega desde la cumbre anterior
        t = out_cubic((u - t_in) / 22)
        ax, ay = self.screen[k - 1]
        if k > 1 and t < 1:
            bx, by = self.screen[k - 2]
            ax, ay = bx + (ax - bx) * t, by + (ay - by) * t
        pulse = 0.5 + 0.5 * math.sin((u - t_in) / FPS_OVL * math.pi * 0.5)
        glow = skia.Paint(AntiAlias=True, Color4f=skia.Color4f(*AMBER, 0.22 * opacity))
        glow.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 14))
        canvas.drawCircle(ax, ay, 20, glow)
        canvas.drawCircle(ax, ay, 19 + 3 * pulse, skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style,
                                                             StrokeWidth=2.4,
                                                             Color4f=skia.Color4f(*AMBER, 0.88 * opacity)))
        canvas.drawCircle(ax, ay, 8.0, skia.Paint(AntiAlias=True, Color4f=skia.Color4f(*AMBER, opacity)))
