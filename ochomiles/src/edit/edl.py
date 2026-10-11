"""Lista de decision de montaje: capas, transiciones y graficos de toda la pelicula.

Estructura (fotogramas a 24 fps; compas = 72):
  0-84      apertura sensorial (macro: cuerda, nieve, frontal, respiracion)
  72-300    revelacion del horizonte + titulo
  276-620   mapa regional: Asia -> arco -> 14 ochomiles (todos visibles > 5 s)
  576-3600  14 capitulos de 216 fotogramas
  3600-4032 sintesis: mapa completo, recorrido editorial, dimension humana
  4032-4320 firma de marca y llamada a la accion
"""
import copy

import numpy as np

from . import mapseq
from .film import HEROES, PEAK_ORDER
from .layers import Overlay, Shot3D, Solid, ramp, window
from .mapcam import VanWijk
from .timeline import CHAPTER_LEN, TOTAL, chapter_start, track
from .transitions import CameraPlan

# transicion en la frontera entre el capitulo k y k+1 (0: mapa -> 01; 14: 14 -> sintesis)
TRANSITIONS = {
    0: "contours", 1: "hop", 2: "cloud_wipe", 3: "motion_cut", 4: "hop", 5: "whip", 6: "cloud_pass",
    7: "dissolve", 8: "spindrift", 9: "summit_match", 10: "pan_reveal", 11: "glow", 12: "black",
    13: "grand_hop", 14: "rise_to_map",
}
# entrada y salida del bloque de datos (fotograma relativo al capitulo) segun la transicion
T_IN = {"contours": 46, "hop": 46, "grand_hop": 50, "black": 30}
T_OUT = {"hop": 168, "grand_hop": 160, "rise_to_map": 176, "pan_reveal": 158, "glow": 172, "black": 176,
         "cloud_wipe": 180, "whip": 182, "cloud_pass": 180, "spindrift": 182}

# tiempos de los saltos (relativos a la frontera b)
HOP = {"rise": (-36, -8), "map": (-12, 12), "dive": (8, 40), "style_up": (-30, -14), "style_down": (12, 30)}
GRAND = {"rise": (-46, -12), "map": (-16, 18), "dive": (12, 46), "style_up": (-40, -18), "style_down": (16, 34)}


class EDL:
    def __init__(self):
        self.layers = []
        self.overlays = []
        self.post = []


def _hero_shots():
    shots = [copy.copy(s) for s in HEROES]
    for s in shots:
        s["plan"] = CameraPlan(s)
        s["camera_fn"] = s["plan"]
    return shots


def chapters(edl, shots):
    """Capas 3D de los capitulos y transiciones entre ellos (camaras, solapes, efectos)."""
    from .transitions import push_camera, yaw_camera
    from .timeline import ease
    style = {k: [] for k in range(1, 15)}     # (f0, f1, de, a) tramos de estilo atlas
    spans = {}
    fades = {k: {"in": None, "out": None} for k in range(1, 15)}
    fogs = {k: [] for k in range(1, 15)}
    blur = {k: [] for k in range(1, 15)}
    fx = []
    for k in range(1, 15):
        cs = chapter_start(k)
        spans[k] = [cs, cs + CHAPTER_LEN - 1]
    maps = []
    for k in range(0, 15):
        tr = TRANSITIONS[k]
        b = chapter_start(k + 1) if k < 14 else chapter_start(14) + CHAPTER_LEN
        src = shots[k - 1] if k >= 1 else None
        dst = shots[k] if k < 14 else None
        if tr == "contours":                       # mapa de apertura -> capitulo 1
            dst["plan"].dive = (b + 14, b + 44)
            spans[1][0] = b + 14
            style[1].append((b + 22, b + 38, 1.0, 0.0))
        elif tr in ("hop", "grand_hop"):
            P = HOP if tr == "hop" else GRAND
            src["plan"].rise = (b + P["rise"][0], b + P["rise"][1])
            dst["plan"].dive = (b + P["dive"][0], b + P["dive"][1])
            spans[k][1] = b + P["map"][0] + 6
            spans[k + 1][0] = b + P["map"][1] - 6
            style[k].append((b + P["style_up"][0], b + P["style_up"][1], 0.0, 1.0))
            style[k + 1].append((b + P["style_down"][0], b + P["style_down"][1], 1.0, 0.0))
            maps.append((k, b, P, src, dst, tr))
        elif tr == "rise_to_map":
            src["plan"].rise = (b - 34, b - 4)
            spans[14][1] = b - 2
            style[14].append((b - 28, b - 12, 0.0, 1.0))
        elif tr == "cloud_wipe":
            spans[k][1], spans[k + 1][0] = b + 6, b - 6
            fades[k + 1]["in"] = (b - 6, b + 6)
            fx.append(("cloud_wipe", b))
        elif tr == "cloud_pass":
            spans[k][1], spans[k + 1][0] = b + 6, b - 6
            fades[k + 1]["in"] = (b - 6, b + 6)
            src["plan"].mods.append(lambda f, c, b=b: push_camera(c, 3200.0 * ease((f - (b - 34)) / 40.0, "in"))
                                    if f > b - 34 else c)
            dst["plan"].mods.append(lambda f, c, b=b: push_camera(c, -2600.0 * (1 - ease((f - (b - 6)) / 34.0, "out")))
                                    if f < b + 28 else c)
            fx.append(("cloud_pass", b))
        elif tr == "spindrift":
            spans[k][1], spans[k + 1][0] = b + 6, b - 6
            fades[k + 1]["in"] = (b - 6, b + 6)
            fx.append(("spindrift", b))
        elif tr == "dissolve":
            spans[k][1], spans[k + 1][0] = b + 8, b - 8
            fades[k + 1]["in"] = (b - 8, b + 8)
        elif tr == "whip":
            spans[k][1], spans[k + 1][0] = b + 3, b - 3
            fades[k + 1]["in"] = (b - 3, b + 3)
            src["plan"].mods.append(lambda f, c, b=b: yaw_camera(c, 80.0 * ease((f - (b - 12)) / 15.0, "in3"))
                                    if f > b - 12 else c)
            dst["plan"].mods.append(lambda f, c, b=b: yaw_camera(c, -70.0 * (1 - ease((f - (b - 3)) / 16.0, "out3")))
                                    if f < b + 13 else c)
            blur[k].append((b - 9, b + 3, 7))
            blur[k + 1].append((b - 3, b + 9, 7))
        elif tr == "pan_reveal":
            spans[k][1], spans[k + 1][0] = b + 8, b - 8
            fades[k + 1]["in"] = (b - 8, b + 8)
            src["plan"].mods.append(lambda f, c, b=b: yaw_camera(c, -46.0 * ease((f - (b - 44)) / 50.0, "smooth"))
                                    if f > b - 44 else c)
        elif tr == "glow":
            # fundido luminoso: la luz de un plano se abre (halo calido) y deja paso al siguiente
            spans[k][1], spans[k + 1][0] = b + 10, b - 10
            fades[k + 1]["in"] = (b - 10, b + 10)
            fx.append(("glow", b))
        elif tr == "black":
            spans[k][1], spans[k + 1][0] = b - 1, b + 8
            fades[k]["out"] = (b - 20, b - 2)
            fades[k + 1]["in"] = (b + 8, b + 32)
        elif tr == "summit_match":
            from .transitions import summit_match_mod
            dst["plan"].mods.append(summit_match_mod(src["plan"], dst["plan"], b))
        # cortes (motion_cut, summit_match): sin solape

    for k in range(1, 15):
        sh = shots[k - 1]
        a, e = spans[k]
        segs = style[k]
        base_fog = sh.get("fog")

        def st(f, segs=segs):
            v = 0.0
            for f0, f1, s0, s1 in segs:
                if f0 - 40 <= f <= f1 + 40:
                    if f <= f0:
                        v = max(v, s0)
                    elif f >= f1:
                        v = max(v, s1)
                    else:
                        v = max(v, s0 + (s1 - s0) * ramp(f, f0, f1))
            return v

        def fog_at(f, fl=fogs[k], base=base_fog):
            for f0, f1, A, B in fl:
                if f0 <= f <= f1 + 60:
                    A = A or base or {"dens": 0.0, "h": 4000.0, "fall": 500.0}
                    B = B or base or {"dens": 0.0, "h": 4000.0, "fall": 500.0}
                    t = ramp(f, f0, f1)
                    return {q: A[q] + (B[q] - A[q]) * t for q in ("dens", "h", "fall")}
            return base

        def extra(f, st=st, fog_at=fog_at, has_fog=bool(fogs[k])):
            kw = {}
            s_ = st(f)
            if s_ > 0.001:
                kw["style"] = s_
            if has_fog:
                kw["fog"] = fog_at(f)
            return kw

        def nblur(f, bl=blur[k]):
            for f0, f1, n in bl:
                if f0 <= f <= f1:
                    return n
            return 1

        fi, fo = fades[k]["in"], fades[k]["out"]

        def op(f, fi=fi, fo=fo):
            v = 1.0
            if fi:
                v = min(v, ramp(f, fi[0], fi[1]))
            if fo:
                v = min(v, 1.0 - ramp(f, fo[0], fo[1]))
            return v

        edl.layers.append(Shot3D(sh, start=a, end=e, opacity=op, extra=extra, blur=nblur))
    return maps, fx


def transition_fx(edl, fx, shots):
    from ..render.fxclouds import cloud_bank, cloud_tunnel, palette_from, spindrift
    from .layers import FX
    for kind, b in fx:
        if kind == "cloud_wipe":
            def fn(ctx, f, below, b=b):
                t = (f - (b - 24)) / 48.0
                c = 1.6 - 2.2 * t                     # centro de la masa de nubes (fraccion de pantalla)
                lit, shade = palette_from(below)
                x = np.arange(ctx.W, dtype=np.float32) / ctx.W
                env = np.clip(1.0 - np.abs(x - c) / 0.95, 0, 1)
                env = env * env * (3 - 2 * env)
                cover = float(window(f, b - 24, b - 6, b + 6, b + 24))
                rgb, al = cloud_bank(ctx.W, ctx.H, f / 24.0, 1.0, sun2d=(0.7, -0.4), lit=lit, shade=shade,
                                     drift=(-1.6, 0.05), front=None, seed=11)
                al = al * np.clip(env[None, :] * 1.15 * cover, 0, 1)
                return rgb, al
            edl.layers.append(FX(b - 24, b + 24, fn, "nube_lateral"))
        elif kind == "cloud_pass":
            def fn(ctx, f, below, b=b):
                cover = float(window(f, b - 20, b - 3, b + 3, b + 22)) ** 1.4
                lit, shade = palette_from(below)
                return cloud_tunnel(ctx.W, ctx.H, (f - b) / 24.0, cover, lit=lit, shade=shade)
            edl.layers.append(FX(b - 26, b + 28, fn, "paso_nube"))
        elif kind == "spindrift":
            def fn(ctx, f, below, b=b):
                amt = float(window(f, b - 20, b - 4, b + 4, b + 20))
                rgb, al = spindrift(ctx.W, ctx.H, (f - b) / 24.0, amt)
                # en el centro de la transicion el velo de nieve cubre casi todo
                veil = float(window(f, b - 6, b - 1, b + 1, b + 6)) * 0.55
                al = al + veil * (1 - al)
                rgb = rgb * (1 - veil * 0.3) + np.array((0.90, 0.93, 0.96), np.float32) * veil * 0.3
                return rgb, al
            edl.layers.append(FX(b - 20, b + 20, fn, "ventisca"))
        elif kind == "glow":
            edl.post.append(_glow_post(b))


def hop_maps(edl, maps):
    for (k, b, P, src, dst, tr) in maps:
        m0, m1 = b + P["map"][0], b + P["map"][1]
        r1 = b + P["rise"][1]
        d0 = b + P["dive"][0]
        rho = 1.25 if tr == "hop" else 1.6

        def cam_fn(ctx, f, src=src, dst=dst, r1=r1, d0=d0, rho=rho):
            sr = ctx.sr
            if f <= r1:
                return src["plan"].map_cam(sr, f)
            if f >= d0:
                return dst["plan"].map_cam(sr, f)
            a = src["plan"].map_cam(sr, r1)
            c = dst["plan"].map_cam(sr, d0)
            t = ramp(f, r1, d0)
            vw = VanWijk((a["cx"], a["cy"]), a["scale"] * 3840, (c["cx"], c["cy"]), c["scale"] * 3840, rho)
            cc, w = vw.at(t)
            rot = a["rot"] + ((c["rot"] - a["rot"] + 180) % 360 - 180) * t
            return {"cx": float(cc[0]), "cy": float(cc[1]), "scale": w / 3840, "rot": rot}

        content = mapseq.hop_content_factory(k, k + 1, b, (m0 + 6, m0 + 14, m1 - 8, m1))
        op = (lambda m0, m1: (lambda f: window(f, m0, m0 + 6, m1 - 6, m1)))(m0, m1)
        edl.layers.append(mapseq.MapLayer(m0, m1, cam_fn, content, opacity=op, name=f"salto{k:02d}"))


def map_intro(edl, shots):
    from .shot3d import peaks
    pk = peaks()
    I = mapseq.INTRO
    target = mapseq.nadir_map_cam(pk["shishapangma"], "shishapangma")
    keys = mapseq.intro_keys(target)
    from .mapcam import map_cam_path

    b = chapter_start(1)
    plan = shots[0]["plan"]

    def cam_fn(ctx, f):
        if f >= b + 14:          # durante el fundido el mapa sigue a la bajada 3D
            return plan.map_cam(ctx.sr, f)
        return map_cam_path(keys, f)

    def op(f):
        return ramp(f, I["in"], I["in"] + 24) * (1.0 - ramp(f, b + 14, b + 22))

    edl.layers.append(mapseq.MapLayer(I["in"], b + 22, cam_fn, mapseq.intro_content, opacity=op, name="mapa"))


def chapter_overlays(edl):
    from ..render.overlays import data_block

    for k in range(1, 15):
        cs = chapter_start(k)
        t_in = T_IN.get(TRANSITIONS[k - 1], 16)
        t_out = T_OUT.get(TRANSITIONS[k], 186)

        def draw(canvas, ctx, f, img, k=k, cs=cs, t_in=t_in, t_out=t_out):
            u = f - cs
            data_block(canvas, ctx.fonts, ctx.peaks_ordered[k - 1], k, u, t_in=t_in, t_out=t_out)
            op = window(u, t_in - 4, t_in + 14, t_out + 4, t_out + 22)
            ctx.locator.draw(canvas, k, u, opacity=op, t_in=t_in)
            return True

        edl.overlays.append(Overlay(cs, cs + CHAPTER_LEN - 1, draw, f"datos{k:02d}"))


def _glow_post(b, half=22):
    """Halo luminoso sobre la imagen compuesta alrededor de b (se aplica tras los graficos
    no: antes del grano; los graficos ya estan fundidos a esa altura)."""
    import cv2

    def post(ctx, f, img):
        a = window(f, b - half, b - 2, b + 2, b + half)
        if a <= 0.002:
            return img
        k = ctx.k
        big = cv2.GaussianBlur(img, (0, 0), 60 * k + 1)
        warm = np.array([1.06, 1.0, 0.92], np.float32)
        out = img * (1 - 0.35 * a) + big * warm * (0.55 * a) + (0.10 * a) * warm
        return out
    return post


def opening(edl):
    """0-96 macro de nieve y huella; 96-312 subida a la arista del Collado Sur y amanecer."""
    from .film import OPENING
    from .layers import Fn, Overlay
    from ..render.titles import opening_titles

    def macro(ctx, f):
        m = ctx.cache.get("macro")
        if m is None:
            from ..render.macro import MacroOpening
            m = ctx.cache["macro"] = MacroOpening(ctx.W, ctx.H)
        return m.render(f)

    edl.layers.append(Fn(0, 96, macro, name="macro"))
    edl.layers.append(Shot3D(OPENING, start=96, end=312, opacity=lambda f: ramp(f, 96, 116)))
    edl.overlays.append(Overlay(100, 290, lambda canvas, ctx, f, img: opening_titles(canvas, ctx.fonts, f),
                                "titulo"))


def synthesis(edl, shots):
    """3594-3822 mapa completo; 3806-4319 campo base al anochecer; textos y marca."""
    from .film import CAMP
    from .layers import CampShot, Overlay
    from .mapcam import map_cam_path
    from ..render.titles import brand_card, synthesis_titles
    S = mapseq.SYN
    camp = copy.copy(CAMP)
    camp["plan"] = CameraPlan(camp)
    camp["camera_fn"] = camp["plan"]
    dive0, dive1 = S["out"], S["out"] + 34
    camp["plan"].dive = (dive0, dive1)
    ev = shots[13]

    def cam_fn(ctx, f):
        sr = ctx.sr
        a = ev["plan"].map_cam(sr, 3596)
        arc = mapseq.arc_cam()
        z = camp["plan"].map_cam(sr, dive0)
        keys = [(S["in"], a, "out", 1.3), (S["arc"], arc, "linear", 1.3),
                (S["zoom"], dict(arc, scale=arc["scale"] * 0.96), "in", 1.3), (dive0, z)]
        if f >= dive0:
            return camp["plan"].map_cam(sr, f)
        return map_cam_path(keys, f)

    op = lambda f: ramp(f, S["in"], S["in"] + 8) * (1.0 - ramp(f, dive0, dive0 + 10))
    edl.layers.append(mapseq.MapLayer(S["in"], dive0 + 10, cam_fn, mapseq.synth_content, opacity=op,
                                      name="sintesis"))
    # luces de tienda sobre el glaciar (campo base sur): posiciones reales del glaciar, ilustrativas
    rng = np.random.default_rng(8848)
    from .film import EBC
    n = 64
    along = rng.normal(0, 210, n)
    across = rng.normal(0, 55, n)
    ang = np.radians(42.0)
    xy = np.stack([EBC[0] + along * np.sin(ang) + across * np.cos(ang),
                   EBC[1] + along * np.cos(ang) - across * np.sin(ang)], 1)
    warm = rng.uniform(0, 1, n) < 0.8
    col = np.where(warm[:, None], np.array([1.0, 0.70, 0.40]), np.array([0.92, 0.95, 1.0]))
    inten = rng.uniform(0.35, 1.0, n) ** 1.5
    phase = rng.uniform(0, 6.28, n)
    lights_state = {"P": None}

    def style(f):
        return {"style": 1.0 - ramp(f, dive0 + 4, dive0 + 22)} if f < dive0 + 24 else {}

    class _Camp(CampShot):
        def render(self, ctx, f):
            if lights_state["P"] is None:
                rd = ctx.sr.region("khumbu")
                z = rd.height(xy[:, 0], xy[:, 1]) + 2.0
                lights_state["P"] = np.column_stack([xy, z])
                self.lights = (lights_state["P"], col, inten, phase)
            return super().render(ctx, f)

    edl.layers.append(_Camp(camp, None, on=lambda f: ramp(f, 3888, 3944), start=dive0 - 6, end=4319,
                            opacity=lambda f: ramp(f, dive0 - 6, dive0 + 4), extra=style))
    edl.overlays.append(Overlay(3690, 3995, lambda canvas, ctx, f, img: synthesis_titles(canvas, ctx.fonts, f),
                                "sintesis_textos"))
    edl.overlays.append(Overlay(4032, 4319, lambda canvas, ctx, f, img: brand_card(canvas, ctx.fonts, f),
                                "marca"))

    def fade_end(ctx, f, img):
        return img * (1.0 - ramp(f, 4300, 4319)) if f >= 4300 else img

    edl.final_post = [fade_end]


def grain(ctx, f, img):
    """Grano fino de pelicula, igual en todas las fuentes (unifica 3D, mapa y graficos)."""
    import cv2
    rng = np.random.default_rng(1000 + f)
    h, w = img.shape[:2]
    g = rng.standard_normal((h // 2 + 1, w // 2 + 1)).astype(np.float32)
    g = cv2.resize(g, (w, h), interpolation=cv2.INTER_LINEAR)
    lum = img.mean(axis=2, keepdims=True)
    amp = 0.010 * ctx.k * (0.35 + 0.65 * np.sqrt(np.clip(lum, 0, 1))) * (1 - 0.6 * np.clip(lum, 0, 1) ** 4)
    return img + g[..., None] * amp


def build():
    edl = EDL()
    edl.layers.append(Solid(0, TOTAL - 1, (0, 0, 0)))
    shots = _hero_shots()
    opening(edl)
    maps, fx = chapters(edl, shots)
    map_intro(edl, shots)
    synthesis(edl, shots)
    hop_maps(edl, maps)
    transition_fx(edl, fx, shots)
    chapter_overlays(edl)
    edl.post.append(grain)
    edl.post.extend(getattr(edl, "final_post", []))
    return edl
