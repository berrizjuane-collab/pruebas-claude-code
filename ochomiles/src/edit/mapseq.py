"""Secuencias de atlas 2D: mapa regional de apertura, saltos entre regiones y mapa final."""
import math

import numpy as np

from ..geo.map_base import project
from ..render.mapdraw import LABELS_ARC, CLUSTERS, to_screen
from ..render.overlays import AMBER, GLACIER, OBSIDIAN, SLATE_LIGHT, out_cubic, smooth
from ..render.typo import Layer as SkLayer, composite, draw_text
from .film import PEAK_ORDER
from .layers import Layer, ramp, window
from .mapcam import map_cam_path

W4, H4 = 3840, 2160


def lcc(lon, lat):
    return project(lon, lat)


def cam(lon, lat, scale, rot=0.0, dx_km=0.0, dy_km=0.0):
    X, Y = lcc(lon, lat)
    return {"cx": X + dx_km * 1000.0, "cy": Y + dy_km * 1000.0, "scale": scale, "rot": rot}


def arc_cam():
    """Vista del arco con los 14 ochomiles (ver pruebas de composicion)."""
    from ..edit.shot3d import peaks
    pk = peaks()
    pts = np.array([lcc(pk[i]["dem_lon"], pk[i]["dem_lat"]) for i in PEAK_ORDER])
    cx = (pts[:, 0].min() + pts[:, 0].max()) / 2 + 100e3
    cy = (pts[:, 1].min() + pts[:, 1].max()) / 2 - 30e3
    return {"cx": cx, "cy": cy, "scale": 620.0, "rot": 0.0}


class MapLayer(Layer):
    """Atlas 2D con vectores y contenido dibujado en la propia imagen (se funde entero)."""

    def __init__(self, start, end, cam_fn, content=None, opacity=1.0, mask=None, name="mapa", vectors=1.0):
        super().__init__(start, end, opacity, mask, name)
        self.cam_fn = cam_fn
        self.content = content
        self.vectors = vectors

    def render(self, ctx, f):
        c4 = self.cam_fn(ctx, f)
        cpx = dict(c4)
        cpx["scale"] = c4["scale"] / ctx.k
        base = ctx.mapart.atlas.render_base(cpx, ctx.W, ctx.H)
        sk = SkLayer(ctx.W, ctx.H)
        sk.canvas.scale(ctx.k, ctx.k)
        vo = self.vectors(f) if callable(self.vectors) else self.vectors
        ctx.mapart.draw_vectors(sk.canvas, c4, opacity=vo)
        if self.content:
            self.content(sk.canvas, ctx, f, c4)
        return composite(base, sk.array())


# ------------------------------------------------------------------------------------------
# mapa regional de apertura (276-620)
# ------------------------------------------------------------------------------------------
INTRO = {
    "in": 276,            # empieza el fundido desde el horizonte
    "asia": 352,          # vista de Asia
    "box": 384,           # recuadro del area de trabajo
    "zoom0": 404, "zoom1": 452,
    "markers0": 418,      # aparicion escalonada (orden narrativo)
    "marker_step": 3,
    "insets": 474,
    "out": 556,           # empieza la aproximacion al Shishapangma
}


def intro_keys(shisha_cam):
    a = arc_cam()
    asia = cam(83.0, 29.5, 1500.0)
    start = cam(86.925, 27.988, 760.0)
    return [
        (INTRO["in"], start, "out", 1.1),
        (INTRO["asia"], asia, "linear", 1.3),
        (INTRO["zoom0"], cam(83.0, 29.5, 1380.0), "smooth", 1.1),
        (INTRO["zoom1"], a, "linear", 1.3),
        (INTRO["out"], dict(a, scale=a["scale"] * 0.94), "in", 1.25),
        (INTRO["out"] + 34, shisha_cam),
    ]


def legend(canvas, ctx, a):
    if a <= 0.003:
        return
    x, y = 216, 1830
    draw_text(canvas, ctx.fonts, "LOS 14 OCHOMILES", x, y, "DataSemi", 30, (*GLACIER, 0.95), tracking=10,
              opacity=a, halo=((*OBSIDIAN, 0.6), 6))
    canvas_circle(canvas, x + 9, y + 44, 7.0, a)
    draw_text(canvas, ctx.fonts, "cumbre de más de 8.000 m (WGS84)", x + 30, y + 53, "Data", 25,
              (*GLACIER, 0.85), opacity=a, halo=((*OBSIDIAN, 0.6), 6))
    import skia
    p = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=1.6,
                   Color4f=skia.Color4f(*GLACIER, 0.55 * a))
    canvas.drawLine(x, y + 92, x + 22, y + 92, p)
    p.setPathEffect(skia.DashPathEffect.Make([9.0, 7.0], 0.0))
    canvas.drawLine(x, y + 124, x + 22, y + 124, p)
    draw_text(canvas, ctx.fonts, "límite internacional", x + 30, y + 100, "Data", 22, (*SLATE_LIGHT, 0.9),
              opacity=a, halo=((*OBSIDIAN, 0.6), 5))
    draw_text(canvas, ctx.fonts, "límite en disputa o línea de control (Natural Earth)", x + 30, y + 132, "Data", 22,
              (*SLATE_LIGHT, 0.9), opacity=a, halo=((*OBSIDIAN, 0.6), 5))


def canvas_circle(canvas, x, y, r, a):
    import skia
    canvas.drawCircle(x, y, r + 3, skia.Paint(AntiAlias=True, Color4f=skia.Color4f(*OBSIDIAN, 0.55 * a)))
    canvas.drawCircle(x, y, r, skia.Paint(AntiAlias=True, Color4f=skia.Color4f(*GLACIER, a)))


def intro_content(canvas, ctx, f, c4):
    art = ctx.mapart
    I = INTRO
    out = ramp(f, I["out"], I["out"] + 16)
    # toponimos (por escala) y cordilleras
    art.draw_places(canvas, c4, opacity=1.0 - out, ranges_opacity=ramp(f, I["zoom0"] + 16, I["zoom1"]) * (1 - out))
    # recuadro del area del arco sobre la vista de Asia
    a_box = window(f, I["box"], I["box"] + 10, I["zoom0"] + 10, I["zoom0"] + 30)
    if a_box > 0.003:
        import skia
        a = arc_cam()
        hw, hh = W4 / 2 * a["scale"], H4 / 2 * a["scale"]
        us, vs = to_screen(c4, [a["cx"] - hw, a["cx"] + hw], [a["cy"] + hh, a["cy"] - hh], W4, H4)
        r = skia.Rect.MakeLTRB(float(us[0]), float(vs[0]), float(us[1]), float(vs[1]))
        canvas.drawRect(r, skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=2.0,
                                      Color4f=skia.Color4f(*GLACIER, 0.85 * a_box)))
        draw_text(canvas, ctx.fonts, "HIMALAYA Y KARAKÓRUM", r.left() + 4, r.top() - 16, "DataMedium", 26,
                  (*GLACIER, 0.9), tracking=8, opacity=a_box)
    # marcadores y rotulos
    peaks = ctx.peaks_ordered
    for i, p in enumerate(peaks):
        t0 = I["markers0"] + i * I["marker_step"]
        ap = ramp(f, t0, t0 + 10, "linear")
        if ap <= 0:
            continue
        u, v = art.marker_xy(c4, p["id"])
        is_target = p["id"] == "shishapangma"
        active = ramp(f, I["out"] - 4, I["out"] + 10) if is_target else 0.0
        fade = 1.0 if is_target else 1.0 - 0.55 * out
        art.draw_marker(canvas, u, v, appear=ap, active=active, r=8.5, opacity=fade)
        if p["id"] in LABELS_ARC:
            al = ramp(f, t0 + 4, t0 + 14) * (1.0 if is_target else 1.0 - out)
            art.draw_label(canvas, u, v, p["id"], LABELS_ARC[p["id"]], opacity=al)
    # recuadros de detalle
    for j, key in enumerate(("baltoro", "mahalangur")):
        t0 = I["insets"] + j * 12
        g = ramp(f, t0, t0 + 20)
        a = 1.0 - out
        if g > 0 and a > 0.003:
            xy = (1380, 170) if key == "baltoro" else (2880, 900)
            art.draw_inset(canvas, c4, key, xy, opacity=a, grow=g)
    legend(canvas, ctx, ramp(f, I["insets"] + 10, I["insets"] + 30) * (1 - out))


# ------------------------------------------------------------------------------------------
# camaras cenitales equivalentes (sin cargar la region) y saltos entre regiones
# ------------------------------------------------------------------------------------------
def nadir_map_cam(peak, region, d_top=None, psi_deg=0.0):
    """Camara 2D igual a la cenital 3D sobre la cumbre (orbit_camera con s = 1)."""
    from .mapcam import tm_to_lcc, lcc_to_tm
    from .transitions import D_TOP
    d = D_TOP if d_top is None else d_top
    X, Y = lcc(peak["dem_lon"], peak["dem_lat"])
    x, y = lcc_to_tm(region, X, Y)
    X2, Y2 = tm_to_lcc(region, x, y + 1000.0)
    alpha = math.degrees(math.atan2(X2 - X, Y2 - Y))
    width = 2.0 * (d + 2500.0) * math.tan(math.radians(20.0))
    return {"cx": X, "cy": Y, "scale": width / W4, "rot": -alpha - psi_deg}


def hop_content_factory(k_from, k_to, b, label_window):
    """Contenido del mapa en un salto: las 14 cumbres, la de destino activa con su nombre."""

    def content(canvas, ctx, f, c4):
        art = ctx.mapart
        art.draw_places(canvas, c4, opacity=0.0, ranges_opacity=0.55)
        for i, p in enumerate(ctx.peaks_ordered):
            k = i + 1
            u, v = art.marker_xy(c4, p["id"])
            if k == k_to:
                act = ramp(f, b - 8, b + 2)
                art.draw_marker(canvas, u, v, appear=1.0, active=act, r=8.5)
            elif k == k_from:
                art.draw_marker(canvas, u, v, appear=1.0, active=1.0 - ramp(f, b - 10, b), r=8.5)
            else:
                art.draw_marker(canvas, u, v, appear=1.0, r=7.0, opacity=0.85 if k < k_to else 0.5)
        a0, a1, a2, a3 = label_window
        al = window(f, a0, a1, a2, a3)
        if al > 0.003:
            p = ctx.peaks_ordered[k_to - 1]
            u, v = art.marker_xy(c4, p["id"])
            art.draw_label(canvas, u, v, p["id"], (34, -30, "left"), opacity=al)

    return content
