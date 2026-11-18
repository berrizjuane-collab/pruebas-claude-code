"""
extra_scenes.py — dos vistas nuevas en el mismo estilo «pincel seco»:

  samagaon  Samagaon 3 520 m: campos de cebada y alforfón, casas de piedra con tejado de
            tablillas, muro mani, chorten y banderas; detrás, Ngadi Chuli, Manaslu y Manaslu Norte.
  macizo    Vista aérea desde el NE (7 000 m): el macizo entero sobre un mar de nubes;
            sirve de mapa para los picos y la ruta normal (se exportan las coordenadas en pantalla).

    python3 extra_scenes.py <escena> <ancho> <alto> <salida.png> [SS]
    python3 extra_scenes.py poi <ancho> <alto> <salida.json>     (puntos proyectados por escena)
"""
import os, sys, math, json
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import scenes
from scenes import (SCENES, SCENE_HOOKS, curve, ground, rock, flags_line, climber, grass_and_stones,
                    cumulus, compose, mist, fog_band, smooth, mix, blur, _proj_ok)


# ------------------------------------------------------------------ escenas
SCENES["samagaon"] = dict(
    cam=(28.590, 84.650, 150), yaw=245, hfov=54, horizon=1.06,
    sun=(138, 30), pal="day", sky="day", sky_base=0.78, glow_side="left", cloud=None,
    haze_L=52000, snowline=4950, title="Samagaon · 3 520 m",
)
SCENES["macizo"] = dict(
    cam=(28.640, 84.690, 0), cam_abs=7000, yaw=222, hfov=72, horizon=0.42,
    sun=(112, 32), pal="day", sky="high", sky_base=0.42, glow_side="right",
    cloud=(3650, 170, 0.45), haze_L=70000, snowline=5000, title="El macizo desde el NE",
)

# build_target suma dz a la altura del DEM: para la cámara aérea fijamos la altitud absoluta
_orig_build = scenes.build_target


def _build(name, W, H, seed=1, log=print):
    sp = SCENES[name]
    if "cam_abs" in sp:
        dem = scenes.get_dem()
        lat, lon, _ = sp["cam"]
        x, y = dem.ll2xy(lat, lon)
        sp["cam"] = (lat, lon, sp["cam_abs"] - dem.height(x, y))
        sp.pop("cam_abs")
    return _orig_build(name, W, H, seed, log)


scenes.build_target = _build


# ------------------------------------------------------------------ Samagaon
FIELD_COLS = [(204, 172, 98), (188, 156, 92), (166, 128, 106), (138, 138, 88), (180, 154, 108), (198, 166, 96), (176, 140, 98)]


def fields(T, reg, U, crest, nz, rng, rid=4):
    """terrazas de cultivo en perspectiva: bandas de color separadas por muretes de piedra"""
    H, W = reg.shape
    v = ((np.arange(H) + 0.5) / H)[:, None]
    vc = crest[None, :]
    alpha = np.clip((v - vc) * H + 0.5, 0, 1)
    s = np.clip((v - vc) / np.maximum(1 - vc, 0.05), 0, 1)
    # coordenada de profundidad: las terrazas se estrechan hacia el horizonte
    u0 = ((np.arange(W) + 0.5) / W)[None, :]
    depth = np.sqrt(s) * 7.5 + 0.9 * (nz.fbm(1.3, 3, sx=1.0, sy=0.35) - 0.5) + 0.25 * np.sin(u0 * 9.0 + s * 3.0)
    k = np.floor(depth).astype(int)
    fr = depth - k
    # cada terraza se parte en parcelas a lo largo de u
    u = ((np.arange(W) + 0.5) / W)[None, :]
    plot = np.floor(u * (3 + k * 1.3) + 0.6 * nz.fbm(1.5, 2) + k * 0.37).astype(int)
    idx = (k * 7 + plot * 3) % len(FIELD_COLS)
    cols = np.array(FIELD_COLS, np.float32)[idx]
    tex = nz.fbm(18, 3, sx=0.35, sy=1.8)
    cols = cols * (0.74 + 0.46 * tex)[..., None]
    # hileras de surcos
    rows = 0.5 + 0.5 * np.sin((depth * 9.0 + u * 2.0) * math.pi * 2)
    cols = cols * (0.92 + 0.08 * rows)[..., None]
    # murete de piedra: borde de cada terraza (canto iluminado + cara en sombra)
    wall = smooth(0.0, 0.05, fr) * smooth(0.16, 0.08, fr)
    lip = smooth(0.94, 1.0, fr)
    stone = np.array((112, 102, 94), np.float32) * (0.85 + 0.3 * nz.value(90))[..., None]
    cols = mix(cols, stone, (wall * 0.85)[..., None])
    cols = mix(cols, np.array((206, 196, 172), np.float32), (lip * 0.55)[..., None])
    # luz lateral suave y oscurecimiento hacia el borde inferior
    cols = cols * (1.04 - 0.18 * s)[..., None]
    T[:] = mix(T, cols, alpha[..., None])
    reg[alpha > 0.5] = rid
    return s


def sa_clouds(T, reg, ctx):
    H, W = reg.shape; U = ctx["U"]
    col, a = cumulus(H, W, U, [(0.90, 0.30, 0.12 * W, 0.12 * H, 80), (0.14, 0.40, 0.09 * W, 0.08 * H, 60)],
                     ctx["nz"], ctx["rng"])
    compose(T, reg, col, a, 1)


def sa_after(T, reg, ctx):
    nz = ctx["nz"]
    mist(T, reg, nz, 0.70, 0.045, 0.0, 0.55, amp=0.025, k=0.45, light_side=-1, rng=ctx["rng"])


def sa_fg(T, reg, ctx):
    H, W = reg.shape; U = ctx["U"]; rng = ctx["rng"]; nz = ctx["nz"]
    far = curve(W, [(0, 0.775), (0.3, 0.79), (0.6, 0.80), (1, 0.795)], 0.008, rng)
    s_far = fields(T, reg, U, far, nz, rng)
    near = curve(W, [(0, 0.905), (0.2, 0.915), (0.42, 0.96), (0.5, 1.06), (1, 1.12)], 0.010, rng)
    s_near = ground(T, reg, U, near, "moraine", nz, rng, rid=5)
    return dict(far=far, near=near)


def house(px, x, yb, w, h, rng, light=-1):
    """casa nubri: muros de piedra, tejado plano de tablillas con piedras y leña"""
    sgn = 1 if light > 0 else -1
    stone_l = np.array((168, 156, 140)) * rng.uniform(0.92, 1.06)
    stone_d = stone_l * 0.58
    side = w * rng.uniform(0.32, 0.45)
    # muro frontal
    x0, x1 = x - w / 2, x + w / 2
    px.polygon([(x0, yb), (x1, yb), (x1, yb - h), (x0, yb - h)], fill=stone_l if light < 0 else stone_d)
    # muro lateral (en fuga hacia la derecha si la luz viene de la izquierda)
    sx = x1 if light < 0 else x0
    dir_ = 1 if light < 0 else -1
    px.polygon([(sx, yb), (sx + dir_ * side, yb - h * 0.16), (sx + dir_ * side, yb - h * 1.16), (sx, yb - h)],
               fill=stone_d if light < 0 else stone_l)
    # hiladas de piedra
    for k in range(1, 4):
        yy = yb - h * k / 4
        px.line([(x0, yy), (x1, yy)], fill=stone_l * 0.80, width=max(1, h * 0.035))
    # tejado de tablillas (vuela un poco) con piedras encima
    ov = w * 0.06
    roof = [(x0 - ov, yb - h), (x1 + ov, yb - h), (sx + dir_ * (side + ov), yb - h * 1.16 - h * 0.02),
            (x0 - ov + dir_ * side, yb - h * 1.18)]
    px.polygon(roof, fill=(132, 98, 66))
    px.line([(x0 - ov, yb - h), (x1 + ov, yb - h)], fill=(84, 60, 42), width=max(1, h * 0.09))
    for _ in range(int(3 + w / (0.012 * 3840))):
        t = rng.uniform(0.05, 0.95)
        rx = x0 + (x1 - x0) * t + dir_ * side * rng.uniform(0.1, 0.8)
        ry = yb - h * 1.08 - rng.uniform(0, 0.06) * h
        px.ellipse((rx - h * 0.06, ry - h * 0.04, rx + h * 0.06, ry + h * 0.04), fill=(150, 144, 138))
    # leña apilada en el borde del tejado
    if rng.random() < 0.7:
        lx = x0 + w * rng.uniform(0.0, 0.5)
        px.rect((lx, yb - h * 1.22, lx + w * 0.35, yb - h * 1.04), fill=(112, 82, 56))
        for k in range(4):
            px.line([(lx, yb - h * (1.07 + 0.04 * k)), (lx + w * 0.35, yb - h * (1.07 + 0.04 * k))],
                    fill=(150, 116, 78), width=max(1, h * 0.02))
    # ventanas con marco ocre o rojo
    nwin = 1 + int(w / (h * 1.2))
    for k in range(nwin):
        wx = x0 + w * (k + 0.5) / nwin
        wy = yb - h * 0.62
        fw, fh = w * 0.09, h * 0.20
        frame = (186, 66, 46) if rng.random() < 0.5 else (196, 150, 60)
        px.rect((wx - fw, wy - fh, wx + fw, wy + fh), fill=frame)
        px.rect((wx - fw * 0.6, wy - fh * 0.7, wx + fw * 0.6, wy + fh * 0.75), fill=(34, 28, 30))
    # puerta
    if rng.random() < 0.6:
        dx = x0 + w * rng.uniform(0.15, 0.3)
        px.rect((dx, yb - h * 0.48, dx + w * 0.11, yb), fill=(62, 44, 36))


def chorten(px, x, yb, s, rng, light=-1):
    """chorten (estupa) encalado: dos gradas, cuerpo en campana, trece anillos y remate dorado"""
    white_l, white_d = np.array((246, 242, 232)), np.array((168, 172, 190))
    sgn = -1 if light < 0 else 1

    def block(cx, y0, w, h):
        px.rect((cx - w / 2, y0 - h, cx + w / 2, y0), fill=white_l)
        px.polygon([(cx - sgn * w / 2, y0), (cx - sgn * w / 2, y0 - h), (cx - sgn * w * 0.18, y0 - h),
                    (cx - sgn * w * 0.18, y0)], fill=white_d)
    y = yb
    for w, h in ((1.0, 0.16), (0.82, 0.12), (0.66, 0.10)):
        block(x, y, w * s, h * s); y -= h * s
    # cuerpo (bumpa)
    n = 24
    pts = [(x + math.cos(t) * 0.30 * s, y - math.sin(t) * 0.30 * s) for t in np.linspace(0, math.pi, n)]
    px.polygon(pts, fill=white_l)
    half = [(x + sgn * math.cos(t) * 0.30 * s, y - math.sin(t) * 0.30 * s) for t in np.linspace(0, math.pi / 2, n // 2)]
    px.polygon([(x, y)] + half[::-1] + [(x, y - 0.30 * s)], fill=white_d)
    y -= 0.30 * s
    block(x, y, 0.22 * s, 0.07 * s); y -= 0.07 * s
    # anillos: cono rojizo-ocre
    px.polygon([(x - 0.09 * s, y), (x + 0.09 * s, y), (x + 0.03 * s, y - 0.34 * s), (x - 0.03 * s, y - 0.34 * s)],
               fill=(196, 150, 70))
    for k in range(7):
        yy = y - 0.34 * s * (k + 0.5) / 7
        px.line([(x - 0.09 * s * (1 - k / 8), yy), (x + 0.09 * s * (1 - k / 8), yy)], fill=(150, 104, 52),
                width=max(1, s * 0.012))
    y -= 0.34 * s
    px.ellipse((x - 0.07 * s, y - 0.05 * s, x + 0.07 * s, y + 0.01 * s), fill=(206, 168, 64))
    px.polygon([(x - 0.02 * s, y - 0.04 * s), (x + 0.02 * s, y - 0.04 * s), (x, y - 0.14 * s)], fill=(226, 190, 80))
    # ojos / nicho en la gradas: pequeño nicho oscuro
    px.rect((x - 0.05 * s, yb - 0.30 * s, x + 0.05 * s, yb - 0.18 * s), fill=(70, 60, 66))
    return (x, y - 0.14 * s)


def mani_wall(px, A, B, h0, h1, rng, light=-1):
    """muro mani en perspectiva de A (cerca) a B (lejos): lajas talladas encima"""
    (xa, ya), (xb, yb) = A, B
    n = 60
    top_l = np.array((210, 204, 190)); face = np.array((146, 136, 124)); end = np.array((96, 90, 92))
    base = []
    top = []
    for i in range(n + 1):
        t = i / n
        x = xa + (xb - xa) * t; y = ya + (yb - ya) * t; h = h0 + (h1 - h0) * t
        base.append((x, y)); top.append((x, y - h))
    px.polygon(base + top[::-1], fill=face)
    # testero del extremo cercano (sombra)
    px.polygon([(xa, ya), (xa - h0 * 0.35, ya - h0 * 0.12), (xa - h0 * 0.35, ya - h0 * 1.12), (xa, ya - h0)], fill=end)
    # hiladas
    for k in (0.33, 0.66):
        px.line([(x, y - (h0 + (h1 - h0) * i / n) * k) for i, (x, y) in enumerate(base)], fill=face * 0.78,
                width=max(1, h0 * 0.04))
    # lajas mani sobre el lomo, inclinadas, algunas pintadas
    paint_cols = [(232, 230, 220), (206, 64, 52), (60, 98, 180), (214, 176, 70), (70, 140, 92)]
    m = int(n * 1.6)
    for i in range(m):
        t = (i + rng.random() * 0.6) / m
        x = xa + (xb - xa) * t; y = ya + (yb - ya) * t; h = h0 + (h1 - h0) * t
        sw = h * rng.uniform(0.35, 0.55); sh = h * rng.uniform(0.30, 0.55)
        yt = y - h
        lean = rng.uniform(-0.25, 0.25) * sw
        c = np.array(paint_cols[rng.integers(len(paint_cols))]) if rng.random() < 0.35 else top_l * rng.uniform(0.85, 1.05)
        px.polygon([(x - sw / 2, yt + sh * 0.25), (x + sw / 2, yt + sh * 0.25), (x + sw / 2 + lean, yt - sh),
                    (x - sw / 2 + lean, yt - sh * 0.9)], fill=c)
        if rng.random() < 0.5:   # trazo de la inscripción
            px.line([(x - sw * 0.25 + lean * 0.5, yt - sh * 0.35), (x + sw * 0.25 + lean * 0.5, yt - sh * 0.35)],
                    fill=np.array(c) * 0.55, width=max(1, sh * 0.08))


def yak(px, x, yb, s, rng, col=(52, 44, 44)):
    c = np.array(col) * rng.uniform(0.85, 1.1)
    px.ellipse((x - s * 0.55, yb - s * 0.75, x + s * 0.45, yb - s * 0.30), fill=c)            # cuerpo
    px.polygon([(x - s * 0.55, yb - s * 0.42), (x - s * 0.45, yb - s * 0.18), (x + s * 0.40, yb - s * 0.18),
                (x + s * 0.45, yb - s * 0.45)], fill=c * 0.85)                                    # flequillo de pelo
    for lx in (-0.42, -0.25, 0.2, 0.34):
        px.line([(x + lx * s, yb - s * 0.3), (x + lx * s, yb)], fill=c * 0.8, width=max(1, s * 0.08))
    hx, hy = x - s * 0.62, yb - s * 0.55
    px.ellipse((hx - s * 0.16, hy - s * 0.12, hx + s * 0.12, hy + s * 0.14), fill=c * 0.9)      # cabeza
    px.line([(hx - s * 0.05, hy - s * 0.1), (hx - s * 0.2, hy - s * 0.26)], fill=(224, 214, 196), width=max(1, s * 0.035))
    px.line([(hx + s * 0.05, hy - s * 0.1), (hx + s * 0.12, hy - s * 0.27)], fill=(224, 214, 196), width=max(1, s * 0.035))


def sa_objects(px, ctx, SS, rng):
    W, H = ctx["cam"].W * SS, ctx["cam"].H * SS
    far, near = ctx["far"], ctx["near"]
    yat = lambda line, u: line[int(np.clip(u, 0, 0.999) * len(line))] * H
    # aldea: casas escalonadas sobre las terrazas, de lejos a cerca
    spots = [(0.56, 0.010, 0.040), (0.62, 0.006, 0.036), (0.67, 0.016, 0.046), (0.735, 0.008, 0.040),
             (0.79, 0.020, 0.052), (0.86, 0.012, 0.046), (0.92, 0.026, 0.060), (0.975, 0.016, 0.050),
             (0.70, 0.036, 0.062), (0.83, 0.046, 0.072), (0.95, 0.058, 0.080)]
    spots.sort(key=lambda s: s[1])
    for u, dv, wsc in spots:
        yb = yat(far, u) + dv * H
        w = wsc * W * rng.uniform(0.9, 1.1)
        house(px, u * W, yb, w, w * rng.uniform(0.42, 0.52), rng)
    # mástil de banderas (darchen) junto a la aldea
    mx, my = 0.885 * W, yat(far, 0.885) + 0.024 * H
    px.line([(mx, my), (mx + 0.002 * W, my - 0.16 * H)], fill=(96, 74, 50), width=0.0028 * W)
    cols = [(52, 92, 196), (240, 240, 236), (206, 52, 46), (54, 150, 82), (240, 204, 52)]
    for k in range(5):
        y0 = my - 0.155 * H + k * 0.018 * H
        px.polygon([(mx + 0.002 * W, y0), (mx + 0.03 * W, y0 + 0.004 * H), (mx + 0.028 * W, y0 + 0.018 * H),
                    (mx + 0.002 * W, y0 + 0.016 * H)], fill=cols[k])
    # chorten con cuerdas de banderas
    cx = 0.30 * W; cyb = yat(far, 0.30) + 0.060 * H
    top = chorten(px, cx, cyb, 0.16 * H, rng)
    for i, (u, v) in enumerate(((0.14, 0.835), (0.21, 0.88), (0.40, 0.875), (0.47, 0.84))):
        flags_line(px, top, (u * W, v * H), 0.012 * H * (1 + i * 0.25), 0.0072 * W, rng, phase=i, width=0.0011 * W)
    # muro mani en diagonal hacia la montaña
    mani_wall(px, (0.015 * W, 0.99 * H), (0.46 * W, yat(far, 0.46) + 0.050 * H), 0.075 * H, 0.018 * H, rng)
    # yaks pastando en las terrazas
    for u, dv, s in ((0.50, 0.040, 0.030), (0.545, 0.034, 0.026), (0.44, 0.030, 0.022)):
        yak(px, u * W, yat(far, u) + dv * H, s * H, rng)
    # caminantes junto al muro
    climber(px, 0.205 * W, 0.902 * H, 0.050 * H, (200, 60, 50), light=-1, lean=-0.2, axe=False)
    climber(px, 0.235 * W, 0.895 * H, 0.046 * H, (230, 180, 60), light=-1, lean=-0.2, axe=False,
            pack=(120, 86, 52))
    # piedras del primer plano
    for _ in range(18):
        u = rng.uniform(0.45, 1.0); v = yat(near, u) / H + rng.uniform(0.0, 0.08)
        if v > 1.0 or v < 0.9:
            continue
        r = (0.006 + 0.04 * max(v - 0.9, 0)) * W * rng.uniform(0.6, 1.3)
        rock(px, u * W, v * H, r, -1, (96, 90, 92), rng)


def sa_nobrush(canvas, ctx, SS, rng):
    H, W = ctx["cam"].H, ctx["cam"].W
    near = np.minimum(ctx["near"], 2.0)
    v = ((np.arange(H * SS) + 0.5) / (H * SS))[:, None]
    nc = np.repeat(near, SS)[None, :]
    regm = (v > nc + 0.01) & (v < 0.999)
    s_map = np.clip((v - nc) / (1 - nc), 0, 1) * np.ones_like(regm)
    grass_and_stones(canvas, regm, s_map, ctx["U"], SS, rng, density=0.045)


SCENE_HOOKS["samagaon"] = dict(clouds_back=sa_clouds, after_terrain=sa_after, foreground=sa_fg,
                               objects=sa_objects, objects_nobrush=sa_nobrush)


# ------------------------------------------------------------------ Macizo (aérea)
def mz_clouds(T, reg, ctx):
    H, W = reg.shape; U = ctx["U"]
    col, a = cumulus(H, W, U, [(0.33, 0.30, 0.07 * W, 0.07 * H, 60), (0.93, 0.25, 0.08 * W, 0.08 * H, 70)],
                     ctx["nz"], ctx["rng"])
    compose(T, reg, col, a, 1)


def mz_after(T, reg, ctx):
    fog_band(T, reg, 0.44, ctx["nz"], color=(226, 232, 242), k=0.35, width=0.04)


SCENE_HOOKS["macizo"] = dict(clouds_back=mz_clouds, after_terrain=mz_after)


# ------------------------------------------------------------------ puntos de interés proyectados
POI = {
    "samagaon": 3520, "cb": 4850, "c1": 5700, "c2": 6400, "c3": 6800, "c4": 7400, "cumbre": 8163,
}
LL = {
    "cb": (28.5840, 84.6020), "c1": (28.5800, 84.5730), "c2": (28.5735, 84.5590), "c3": (28.5670, 84.5570),
    "c4": (28.5600, 84.5543), "cumbre": (28.5535, 84.5566), "samagaon": (28.5855, 84.640),
    "manaslu": (28.5535, 84.5566), "norte": (28.5841, 84.5492), "ngadi": (28.5050, 84.5676),
    "himalchuli": (28.4384, 84.6369),
}
# trazado aproximado de la ruta normal: puntos intermedios (lat, lon) entre campos
ROUTE = [LL["cb"], (28.5835, 84.5940), (28.5822, 84.5850), (28.5812, 84.5785), LL["c1"],
         (28.5780, 84.5690), (28.5755, 84.5630), LL["c2"], (28.5705, 84.5580), LL["c3"],
         (28.5640, 84.5560), LL["c4"], (28.5575, 84.5552), LL["cumbre"]]


def poi(W, H, out):
    res = {}
    for name in list(scenes.SCENES):
        if name == "probe":
            continue
        sp = SCENES[name]
        T, reg, ctx = scenes.build_target(name, W // 4, H // 4, 1, log=lambda *a: None) if False else (None, None, None)
        dem = scenes.get_dem()
        lat, lon, dz = sp["cam"]
        if "cam_abs" in sp:
            x, y = dem.ll2xy(lat, lon); dz = sp["cam_abs"] - dem.height(x, y)
        from terrain import Camera, raymarch
        x, y = dem.ll2xy(lat, lon)
        cam = Camera(x, y, dem.height(x, y) + dz, sp["yaw"], sp["hfov"], W // 4, H // 4, sp["horizon"])
        cam.t_min = sp.get("t_min", 200.0)
        dem.cloud = None; dem.cloud_cval = -1e4
        tp, hard, rays = raymarch(dem, cam)
        ctx = dict(cam=cam, tp=tp)
        pts = {}
        for k, (la, lo) in LL.items():
            X, Y = dem.ll2xy(la, lo); Z = dem.height(X, Y)
            c, r, dist, vis = _proj_ok(ctx, np.array([X]), np.array([Y]), np.array([Z + 8]), tol=250)
            u, v = float(c[0]) / cam.W, float(r[0]) / cam.H
            if -0.02 < u < 1.02 and -0.02 < v < 1.02:
                pts[k] = dict(u=round(u, 4), v=round(v, 4), vis=bool(vis[0]), km=round(float(dist[0]) / 1000, 1))
        entry = dict(points=pts)
        if name == "macizo":
            path = []
            for (a, b) in zip(ROUTE[:-1], ROUTE[1:]):
                ax, ay = dem.ll2xy(*a); bx, by = dem.ll2xy(*b)
                for t in np.linspace(0, 1, 14, endpoint=False):
                    X, Y = ax + (bx - ax) * t, ay + (by - ay) * t
                    Z = dem.height(X, Y) + 10
                    c, r, dist, zf = cam.project(np.array([X]), np.array([Y]), np.array([Z]))
                    path.append((round(float(c[0]) / cam.W, 4), round(float(r[0]) / cam.H, 4)))
            X, Y = dem.ll2xy(*ROUTE[-1]); Z = dem.height(X, Y) + 10
            c, r, _, _ = cam.project(np.array([X]), np.array([Y]), np.array([Z]))
            path.append((round(float(c[0]) / cam.W, 4), round(float(r[0]) / cam.H, 4)))
            entry["route"] = path
        res[name] = entry
        print(name, {k: (v["u"], v["v"], v["vis"]) for k, v in pts.items()})
    json.dump(res, open(out, "w"), indent=1)


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[0] == "poi":
        poi(int(a[1]), int(a[2]), a[3])
    else:
        name, W, H, out = a[0], int(a[1]), int(a[2]), a[3]
        SS = int(a[4]) if len(a) > 4 else 2
        scenes.render(name, W, H, out, SS, 1)
