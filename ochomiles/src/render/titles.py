"""Titulos y firma: concepto de apertura, lineas editoriales y cierre de marca.

Todos los textos editables viven en config/brand.json (marca) y en este modulo (lineas de
guion), para cambiar el nombre de la empresa o el lema sin tocar la animacion.
"""
import json
import math
import os

import numpy as np
import skia

from .overlays import AMBER, GLACIER, OBSIDIAN, SLATE_LIGHT, W, H, out_cubic, smooth
from .typo import draw_text, measure

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def brand():
    return json.load(open(os.path.join(ROOT, "config", "brand.json")))


def appear(f, t_in, t_out, d_in=18, d_out=16):
    a_in = out_cubic((f - t_in) / d_in)
    a_out = 1 - smooth((f - t_out) / d_out)
    a = max(0.0, min(a_in, a_out))
    dy = (1 - a_in) * 18
    blur = (1 - a_in) * 8 + (1 - a_out) * 5
    return a, dy, blur


def line_center(canvas, fonts, text, y, f, t_in, t_out, family="TitleItalic", size=64, color=GLACIER,
                tracking=0.0, halo=True, d_in=18, d_out=16):
    a, dy, bl = appear(f, t_in, t_out, d_in, d_out)
    if a <= 0.003:
        return
    h = ((*OBSIDIAN, 0.45), size * 0.10) if halo else None
    draw_text(canvas, fonts, text, W / 2, y + dy, family, size, color, tracking=tracking, align="center",
              opacity=a, blur=bl, halo=h)


# ------------------------------------------------------------------------------------------
# apertura
# ------------------------------------------------------------------------------------------
def opening_titles(canvas, fonts, f):
    """Epigrafe durante la subida a la arista y titulo al salir el sol (fotograma 180)."""
    line_center(canvas, fonts, "Hay lugares que cambian nuestra forma de mirar.", 1800, f, 108, 160,
                family="SerifTextItalic", size=52, color=(*GLACIER, 0.92))
    # titulo: dos tiempos sincronizados con la musica (180: sol y golpe; 216: segunda frase)
    a1, dy1, b1 = appear(f, 180, 268, d_in=20, d_out=18)
    a2, dy2, b2 = appear(f, 214, 268, d_in=22, d_out=18)
    if a1 > 0.003:
        draw_text(canvas, fonts, "14 cumbres.", W / 2, 760 + dy1, "Title", 168, GLACIER, align="center",
                  opacity=a1, blur=b1, halo=((*OBSIDIAN, 0.35), 14))
    if a2 > 0.003:
        draw_text(canvas, fonts, "Un horizonte extraordinario.", W / 2, 900 + dy2, "TitleItalic", 96,
                  (*GLACIER, 0.94), align="center", opacity=a2, blur=b2, halo=((*OBSIDIAN, 0.35), 10))
    return True


# ------------------------------------------------------------------------------------------
# sintesis
# ------------------------------------------------------------------------------------------
SYNTH_LINES = [
    ("Cada una exige preparación, paciencia y respeto.", 3690, 3786),     # c.52 t.2
    ("La ambición nos lleva arriba.", 3852, 3984),                         # c.54 t.3
    ("El criterio nos trae de vuelta.", 3888, 3984),                       # c.55 t.1
]


def synthesis_titles(canvas, fonts, f):
    t, a0, a1 = SYNTH_LINES[0]
    line_center(canvas, fonts, t, 1960, f, a0, a1, family="TitleItalic", size=76)
    t, a0, a1 = SYNTH_LINES[1]
    line_center(canvas, fonts, t, 1760, f, a0, a1, family="TitleItalic", size=74)
    t, a0, a1 = SYNTH_LINES[2]
    line_center(canvas, fonts, t, 1870, f, a0, a1, family="TitleItalic", size=74)
    return True


# ------------------------------------------------------------------------------------------
# firma de marca
# ------------------------------------------------------------------------------------------
def logo_mark(canvas, cx, cy, s, a, draw_t=1.0):
    """Marca provisional: sol ambar naciendo tras una arista (el horizonte de la pelicula).
    s: escala (1 = 220 px de ancho). draw_t: progreso del trazado (0..1)."""
    if a <= 0.003:
        return
    # arista: polilinea con picos de distinta altura (14 vertices de cumbre estilizados)
    pts = [(-1.00, 0.18), (-0.78, 0.02), (-0.62, 0.12), (-0.40, -0.22), (-0.22, -0.02), (-0.05, -0.46),
           (0.12, -0.10), (0.30, -0.30), (0.48, 0.00), (0.66, -0.12), (0.82, 0.08), (1.00, 0.18)]
    P = [(cx + x * 110 * s, cy + y * 110 * s) for x, y in pts]
    # sol: circulo ambar parcialmente oculto por la arista
    sun = skia.Paint(AntiAlias=True, Color4f=skia.Color4f(*AMBER, a))
    canvas.save()
    clip = skia.Path()
    clip.moveTo(cx - 140 * s, cy - 200 * s)
    clip.lineTo(cx + 140 * s, cy - 200 * s)
    for x, y in reversed(P):
        clip.lineTo(x, y)
    clip.close()
    canvas.clipPath(clip, doAntiAlias=True)
    rise = out_cubic(draw_t)
    canvas.drawCircle(cx + 22 * s, cy - (8 + 26 * rise) * s, 34 * s, sun)
    canvas.restore()
    path = skia.Path()
    seg = np.cumsum([0] + [math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]) for i in range(len(P) - 1)])
    L = seg[-1] * min(max(draw_t * 1.25, 0.0), 1.0)
    path.moveTo(*P[0])
    for i in range(1, len(P)):
        if seg[i] <= L:
            path.lineTo(*P[i])
        else:
            t = (L - seg[i - 1]) / max(seg[i] - seg[i - 1], 1e-6)
            if t > 0:
                path.lineTo(P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t)
            break
    stroke = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=5.0 * s,
                        Color4f=skia.Color4f(*GLACIER, a))
    stroke.setStrokeJoin(skia.Paint.kMiter_Join)
    canvas.drawPath(path, stroke)


def brand_card(canvas, fonts, f, f0=4032):
    b = brand()
    u = f - f0
    cx = W / 2
    # marca
    a = out_cubic(u / 30.0)
    logo_mark(canvas, cx, 640, 1.45, a, draw_t=u / 40.0)
    # nombre (campo pendiente: config/brand.json)
    a, dy, bl = appear(u, 30, 1000, d_in=24)
    name = b["name"]
    draw_text(canvas, fonts, name, cx, 900 + dy, "DataSemi", 80, GLACIER, tracking=80 * 0.42, align="center",
              opacity=a, blur=bl)
    # lema
    a, dy, bl = appear(u, 62, 1000, d_in=26)
    draw_text(canvas, fonts, b["tagline"], cx, 1020 + dy, "TitleItalic", 68, (*GLACIER, 0.92), align="center",
              opacity=a, blur=bl)
    # llamada a la accion
    a, dy, bl = appear(u, 112, 1000, d_in=26)
    if a > 0.003:
        cta = b["cta"]
        wcta = measure(fonts, cta.upper(), "DataMedium", 40, tracking=40 * 0.30)
        y = 1210 + dy
        draw_text(canvas, fonts, cta.upper(), cx, y, "DataMedium", 40, GLACIER, tracking=40 * 0.30,
                  align="center", opacity=a, blur=bl)
        grow = out_cubic((u - 118) / 30.0)
        p = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=3.0,
                       Color4f=skia.Color4f(*AMBER, a))
        canvas.drawLine(cx - wcta / 2 * grow, y + 40, cx + wcta / 2 * grow, y + 40, p)
        if b.get("contact"):
            draw_text(canvas, fonts, b["contact"], cx, y + 120, "Data", 38, (*SLATE_LIGHT, 0.95),
                      align="center", opacity=a)
    # creditos de datos (obligatorios por licencia), discretos
    a, dy, bl = appear(u, 150, 1000, d_in=30)
    if a > 0.003:
        for i, ln in enumerate(b["credits"]):
            draw_text(canvas, fonts, ln, cx, 1910 + i * 50, "Data", 31, (*SLATE_LIGHT, 0.88), align="center",
                      opacity=a, halo=((*OBSIDIAN, 0.55), 6))
    return True
