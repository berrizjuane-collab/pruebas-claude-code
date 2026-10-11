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
    "markers0": 378,      # aparicion escalonada (orden narrativo): compas 6, pulso 2 (arpegio de 14 notas)
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
    draw_text(canvas, ctx.fonts, "LOS 14 OCHOMILES", x, y - 70, "DataSemi", 30, (*GLACIER, 0.95), tracking=10,
              opacity=a, halo=((*OBSIDIAN, 0.6), 6))
    draw_text(canvas, ctx.fonts, "Todos por encima de los 8.000 metros", x, y - 22, "SerifTextItalic", 34,
              (*GLACIER, 0.9), opacity=a, halo=((*OBSIDIAN, 0.6), 6))
    canvas_circle(canvas, x + 9, y + 44, 7.0, a)
    draw_text(canvas, ctx.fonts, "cumbre principal (coordenadas WGS84 verificadas)", x + 30, y + 54, "Data", 28,
              (*GLACIER, 0.85), opacity=a, halo=((*OBSIDIAN, 0.6), 6))
    import skia
    p = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=1.6,
                   Color4f=skia.Color4f(*GLACIER, 0.55 * a))
    canvas.drawLine(x, y + 92, x + 22, y + 92, p)
    p.setPathEffect(skia.DashPathEffect.Make([9.0, 7.0], 0.0))
    canvas.drawLine(x, y + 124, x + 22, y + 124, p)
    draw_text(canvas, ctx.fonts, "límite internacional", x + 30, y + 101, "Data", 26, (*SLATE_LIGHT, 0.9),
              opacity=a, halo=((*OBSIDIAN, 0.6), 5))
    draw_text(canvas, ctx.fonts, "límite en disputa o línea de control (Natural Earth)", x + 30, y + 133, "Data", 26,
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


# ------------------------------------------------------------------------------------------
# sintesis (3594-3822): mapa completo con los 14 puntos encendidos y el recorrido editorial
# ------------------------------------------------------------------------------------------
SYN = {"in": 3594, "arc": 3664, "lit0": 3618, "lit_step": 3, "route0": 3622, "route1": 3690,
       "zoom": 3770, "out": 3812}


def _route_paths(art, c4, order_ids, t):
    """Arcos suaves entre cumbres consecutivas (orden narrativo); t = tramos recorridos."""
    import skia
    P = [art.marker_xy(c4, pid) for pid in order_ids]
    path = skia.Path()
    for i in range(len(P) - 1):
        if t <= i:
            break
        (x0, y0), (x1, y1) = P[i], P[i + 1]
        dx, dy = x1 - x0, y1 - y0
        L = math.hypot(dx, dy)
        side = 1 if i % 2 == 0 else -1
        cx = (x0 + x1) / 2 - dy / max(L, 1e-6) * L * 0.16 * side
        cy = (y0 + y1) / 2 + dx / max(L, 1e-6) * L * 0.16 * side
        u = min(1.0, t - i)
        n = max(2, int(24 * u))
        path.moveTo(x0, y0)
        for j in range(1, n + 1):
            s = u * j / n
            bx = (1 - s) ** 2 * x0 + 2 * (1 - s) * s * cx + s * s * x1
            by = (1 - s) ** 2 * y0 + 2 * (1 - s) * s * cy + s * s * y1
            path.lineTo(bx, by)
    return path


def synth_content(canvas, ctx, f, c4):
    import skia
    art = ctx.mapart
    S = SYN
    out = ramp(f, S["zoom"], S["zoom"] + 16)
    # los toponimos se retiran cuando aparece la frase (evita choques con el texto)
    art.draw_places(canvas, c4, opacity=0.85 * (1 - out) * (1 - ramp(f, 3676, 3690)),
                    ranges_opacity=ramp(f, S["in"] + 20, S["arc"]) * (1 - out))
    ids = [p["id"] for p in ctx.peaks_ordered]
    # recorrido editorial: arcos discontinuos (no es una ruta real)
    t = 13.0 * ramp(f, S["route0"], S["route1"], "linear")
    if t > 0 and out < 1:
        path = _route_paths(art, c4, ids, t)
        paint = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=2.2,
                           Color4f=skia.Color4f(*GLACIER, 0.55 * (1 - out)))
        paint.setPathEffect(skia.DashPathEffect.Make([12.0, 9.0], 0.0))
        canvas.drawPath(path, paint)
    for i, p in enumerate(ctx.peaks_ordered):
        u, v = art.marker_xy(c4, p["id"])
        lit = ramp(f, S["lit0"] + i * S["lit_step"], S["lit0"] + i * S["lit_step"] + 8)
        art.draw_marker(canvas, u, v, appear=1.0, lit=lit, r=8.5, opacity=1.0 - 0.6 * out)
        if p["id"] in LABELS_ARC:
            art.draw_label(canvas, u, v, p["id"], LABELS_ARC[p["id"]], opacity=ramp(f, S["in"] + 30, S["arc"]) * (1 - out))
    for j, key in enumerate(("baltoro", "mahalangur")):
        g = ramp(f, S["arc"] - 6 + j * 8, S["arc"] + 14 + j * 8)
        a = 1.0 - out
        if g > 0 and a > 0.003:
            xy = (1380, 170) if key == "baltoro" else (2880, 900)
            lits = {pid: {"lit": ramp(f, S["lit0"] + ids.index(pid) * S["lit_step"],
                                       S["lit0"] + ids.index(pid) * S["lit_step"] + 8)}
                    for pid in CLUSTERS[key]["ids"]}
            art.draw_inset(canvas, c4, key, xy, opacity=a, grow=g, markers=lits)
    # leyenda del recorrido
    a = ramp(f, S["route0"] + 10, S["route0"] + 30) * (1 - out)
    if a > 0.003:
        x, y = 216, 1500
        draw_text(canvas, ctx.fonts, "LOS 14 OCHOMILES", x, y, "DataSemi", 30, (*GLACIER, 0.95), tracking=10,
                  opacity=a, halo=((*OBSIDIAN, 0.6), 6))
        p = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=2.4,
                       Color4f=skia.Color4f(*GLACIER, 0.8 * a))
        p.setPathEffect(skia.DashPathEffect.Make([12.0, 9.0], 0.0))
        canvas.drawLine(x, y + 48, x + 60, y + 48, p)
        draw_text(canvas, ctx.fonts, "Recorrido editorial", x + 78, y + 58, "DataMedium", 30, (*GLACIER, 0.92),
                  opacity=a, halo=((*OBSIDIAN, 0.6), 6))
        draw_text(canvas, ctx.fonts, "orden ascendente de altitud, no una ruta", x + 78, y + 100, "Data", 28,
                  (*SLATE_LIGHT, 0.95), opacity=a, halo=((*OBSIDIAN, 0.6), 6))
