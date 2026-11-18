"""
scenes.py — las seis vistas del Manaslu en estilo pincel seco.

    python3 scenes.py <escena> <ancho> <alto> <salida.png> [SS] [semilla]
    python3 scenes.py all 3840 2160 out_dir/        (las seis)

Escenas:  campo_base · campo_1 · campo_2 · campo_3 · campo_4_noche · cumbre

Cada escena = cámara en la posición real del campo (lat/lon, sobre el DEM real),
dirección de vista, luz, cielo, nubes y primer plano. Ver README_reconstruccion.md.
"""
import os, sys, math, time
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from paint import (Noise, smooth, mix, lum, blur, sky, cumulus, compose, orientation, paint, mist, fog_band,
                   Proxy, rebrush, finish, PASSES)
from terrain import DEM, Camera, raymarch, shade

_DEM = None


def get_dem():
    global _DEM
    if _DEM is None:
        p = os.path.join(HERE, "manaslu_dem.npz")
        if not os.path.exists(p):
            import dem_build
            dem_build.build(p)
        _DEM = DEM(p)
    return _DEM


# ================================================================ utilidades de escena

def curve(W, pts, nz_amp, rng, H=None):
    """línea v(u) por puntos de control (interpolación lineal) + ruido 1D"""
    u = (np.arange(W) + 0.5) / W
    us, vs = zip(*pts)
    v = np.interp(u, us, vs)
    n = np.zeros(W, np.float32)
    for f, a in ((3, 1.0), (9, 0.45), (27, 0.2), (80, 0.08)):
        g = rng.random(f + 3)
        n += a * (np.interp(u * f, np.arange(f + 3), g) - 0.5)
    return (v + n * nz_amp).astype(np.float32)


def cloud_layer(dem, level, amp, seed, holes=0.0, lam=2600.0):
    """techo del mar de nubes como campo de alturas (billow fBm)"""
    rng = np.random.default_rng(seed)
    H, W = dem.H, dem.W
    acc = np.zeros((H, W), np.float32); tot = 0; a = 1.0
    for o in range(5):
        l = lam / 2 ** o
        g = rng.random((int(H * dem.dx / l) + 4, int(W * dem.dx / l) + 4)).astype(np.float32)
        n = np.asarray(Image.fromarray(g, "F").resize((W, H), Image.BICUBIC))
        acc += a * np.abs(2 * n - 1); tot += a; a *= 0.5
    b = 1 - acc / tot
    top = level + amp * (b - 0.5) * 2
    if holes > 0:
        hole = smooth(0.0, holes, b - 0.25)
        top = np.where(hole < 0.5, level - 3000, top)
    return top.astype(np.float32)


def ground(T, reg, U, crest, kind, nz, rng, light=1, rid=3, warm=0.0, night=False):
    """capa de primer plano definida por su línea de cresta (por columna)"""
    H, W = reg.shape
    v = ((np.arange(H) + 0.5) / H)[:, None]
    vc = crest[None, :]
    alpha = np.clip((v - vc) * H + 0.5, 0, 1)
    s = np.clip((v - vc) / np.maximum(1 - vc, 0.05), 0, 1)
    if kind == "snow":
        hn = nz.fbm(5, 4, sx=0.5, sy=1.8)
        gy, gx = np.gradient(blur(hn, 2 * U))
        sh = np.clip(0.55 + light * gx * 260 - gy * 120, 0, 1)
        sast = smooth(0.52, 0.78, nz.fbm(9, 3, sx=0.25, sy=3.0))
        base_l = np.array((240, 242, 246), np.float32) if not warm else np.array((255, 236, 214), np.float32)
        base_s = np.array((150, 166, 208), np.float32) if not warm else np.array((150, 140, 190), np.float32)
        k = np.clip(sh * (0.75 + 0.25 * (1 - s)) - 0.18 * sast, 0, 1)[..., None]
        col = mix(base_s, base_l, k)
        rim = smooth(0.014, 0, v - vc)
        col = mix(col, np.array((255, 250, 242), np.float32), (rim * 0.55)[..., None])
    else:  # morrena
        n1 = nz.fbm(6, 4); n2 = nz.value(22); n3 = nz.fbm(3, 3)
        col = mix(np.array((152, 142, 126), np.float32), np.array((88, 84, 82), np.float32),
                  (s ** 0.8)[..., None])
        col = col * (0.85 + 0.3 * nz.fbm(14, 3))[..., None]
        st = nz.value(170, sx=1.5)
        stones = smooth(0.64, 0.72, st) * (0.3 + 0.7 * n1)
        col = mix(col, np.array((70, 66, 70), np.float32), (stones * 0.55)[..., None])
        tops = smooth(0.68, 0.76, nz.value(170, sx=1.5)) * 0.45
        col = mix(col, np.array((190, 180, 162), np.float32), tops[..., None])
        snowp = smooth(0.76, 0.82, n3 + 0.2 * (n2 - 0.5))
        col = mix(col, np.array((226, 230, 238), np.float32), (snowp * 0.85)[..., None])
        sun = smooth(0.50, 0.80, nz.fbm(3.2, 3)) * 0.5
        col = mix(col, np.array((176, 160, 128), np.float32), sun[..., None])
        rim = smooth(0.012, 0, v - vc)
        col = mix(col, np.array((196, 186, 160), np.float32), (rim * 0.5)[..., None])
    if night:
        col = night_tone(col)
    T[:] = mix(T, col, alpha[..., None])
    reg[alpha > 0.5] = rid
    return s


def night_tone(c):
    L = (lum(c) / 255.0)[..., None] ** 1.35
    n = mix(np.array((8, 14, 38), np.float32), np.array((186, 202, 236), np.float32), L)
    tint = c * np.array((0.40, 0.52, 0.90), np.float32)
    return 0.78 * n + 0.22 * tint


# ------------------------------------------------------------------- objetos vectoriales

TENT_COLS = [(232, 186, 52), (226, 128, 46), (200, 66, 50), (232, 196, 70), (62, 104, 170),
             (226, 150, 50), (88, 140, 96)]


def tent(px, x, yb, w, col, light=1, glow=False, rng=None, ground=(150, 166, 206)):
    """carpa domo: mitad en sombra ×0.62, gajo iluminado, varillas y puerta oscura"""
    h = 0.56 * w
    col = np.array(col, np.float32)
    n = 32
    th = np.linspace(0, math.pi, n)
    dome = [(x + math.cos(t) * w / 2, yb - math.sin(t) * h) for t in th]
    shadow = col * 0.62 if not glow else col * 0.9 + np.array((60, 30, 0))
    lit = col * 1.10 if not glow else col * 1.2 + np.array((110, 70, 20))
    g = np.array(ground, np.float32)
    px.polygon([(x - light * w * 0.15 - w * 0.55, yb + h * 0.06), (x - light * w * 0.9, yb + h * 0.02),
                (x - light * w * 0.95, yb - h * 0.06), (x + light * w * 0.45, yb - h * 0.04),
                (x + light * w * 0.5, yb + h * 0.06)], fill=g * 0.72)
    px.polygon(dome, fill=shadow)
    side = 1 if light > 0 else -1
    th2 = np.linspace(0, math.pi * 0.5, n // 2) if side > 0 else np.linspace(math.pi * 0.5, math.pi, n // 2)
    arc = [(x + math.cos(t) * w / 2, yb - math.sin(t) * h) for t in th2]
    gore = arc + [(x + side * w * 0.06, yb)] if side > 0 else [(x - w * 0.06, yb)] + arc
    px.polygon(gore + [(x, yb - h)] if side > 0 else [(x, yb - h)] + gore, fill=lit)
    sl = col * 0.42 if not glow else col * 0.7
    for k in (-1, 1):
        pts = [(x + k * w * 0.46 * math.cos(t) , yb - h * 0.98 * math.sin(t)) for t in np.linspace(0.08, math.pi / 2, 10)]
        pts = [(x + (px_ - x) * 0.95 + k * w * 0.02 * (1 - (yb - py_) / h), py_) for (px_, py_) in pts]
        px.line(pts, fill=sl, width=max(1, w * 0.02))
    dw, dh = w * 0.20, h * 0.50
    dx0 = x - side * w * 0.10
    door = [(dx0 + math.cos(t) * dw, yb - math.sin(t) * dh) for t in np.linspace(0, math.pi, 14)]
    px.polygon(door, fill=(36, 28, 32) if not glow else (255, 222, 150))
    px.line([(x - w / 2, yb), (x + w / 2, yb)], fill=col * 0.35, width=max(1, w * 0.018))


def flags_line(px, A, B, sag, size, rng, phase=0, width=1.0):
    cols = [(52, 92, 196), (240, 240, 236), (206, 52, 46), (54, 150, 82), (240, 204, 52)]
    (x0, y0), (x1, y1) = A, B
    L = math.hypot(x1 - x0, y1 - y0)
    n = max(3, int(L / (size * 1.35)))
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + sag * 4 * t * (1 - t)))
    px.line(pts, fill=(52, 46, 44), width=max(1, width))
    for i in range(1, n):
        x, y = pts[i]
        c = cols[(i + phase) % 5]
        sw = size * (0.85 + 0.3 * rng.random()); sh = size * (1.05 + 0.25 * rng.random())
        k = rng.uniform(-0.25, 0.35) * sw
        px.polygon([(x - sw / 2, y), (x + sw / 2, y), (x + sw / 2 + k, y + sh), (x - sw / 2 + k, y + sh)],
                   fill=np.array(c) * rng.uniform(0.82, 1.05))


def rock(px, x, y, r, light=1, base=(70, 66, 72), rng=None, snowcap=False):
    n = 9
    ang = np.sort(rng.uniform(0, 2 * math.pi, n))
    rr = r * rng.uniform(0.7, 1.15, n)
    pts = [(x + math.cos(a) * q * 1.25, y + math.sin(a) * q * 0.75) for a, q in zip(ang, rr)]
    px.polygon(pts, fill=base)
    lit = [(x + light * r * 0.25 + math.cos(a) * q * 0.85, y - r * 0.18 + math.sin(a) * q * 0.45)
           for a, q in zip(ang, rr) if math.sin(a) < 0.3 and light * math.cos(a) > -0.6]
    if len(lit) >= 3:
        px.polygon(lit, fill=np.array(base) * 1.75 + np.array((14, 10, 0)))
    if snowcap:
        cap = [(x + math.cos(a) * q * 1.1, y - r * 0.15 + math.sin(a) * q * 0.4) for a, q in zip(ang, rr)
               if math.sin(a) < -0.1]
        if len(cap) >= 3:
            px.polygon(cap, fill=(236, 238, 244))


def climber(px, x, yf, h, suit, light=1, lean=0.25, axe=True, pack=(60, 60, 70), dark=False,
            helmet=None):
    """escalador con traje de plumas: piernas, torso inclinado, mochila, casco, piolet"""
    s = h
    suit = np.array(suit, np.float32)
    leg = np.array((46, 44, 54)) if not dark else np.array((14, 16, 26))
    boot = np.array((30, 28, 34)) if not dark else np.array((10, 10, 18))
    kx = lean * s * 0.06
    # piernas (pantalón de plumas, algo más ancho arriba) y botas
    px.polygon([(x - s * 0.11, yf - s * 0.02), (x - s * 0.03, yf - s * 0.02), (x + kx, yf - s * 0.44),
                (x - s * 0.10 + kx, yf - s * 0.44)], fill=leg * 1.15)
    px.polygon([(x + s * 0.04, yf), (x + s * 0.12, yf), (x + s * 0.06 + kx, yf - s * 0.44),
                (x - s * 0.02 + kx, yf - s * 0.44)], fill=leg)
    px.rect((x - s * 0.13, yf - s * 0.05, x - s * 0.02, yf), fill=boot)
    px.rect((x + s * 0.03, yf - s * 0.04, x + s * 0.14, yf + s * 0.01), fill=boot)
    # torso inclinado (chaqueta de plumas)
    tx, ty = x + kx, yf - s * 0.42
    lx = lean * s * 0.18
    torso = [(tx - s * 0.13, ty), (tx + s * 0.12, ty), (tx + s * 0.11 + lx, ty - s * 0.36),
             (tx - s * 0.10 + lx, ty - s * 0.38)]
    px.polygon(torso, fill=suit * (0.68 if not dark else 0.22))
    sgn = 1 if light > 0 else -1
    half = [(tx, ty), (tx + sgn * s * 0.12, ty), (tx + sgn * s * 0.11 + lx, ty - s * 0.36), (tx + lx, ty - s * 0.38)]
    px.polygon(half, fill=suit * (1.08 if not dark else 0.30))
    # brazo
    ax0 = (tx + sgn * s * 0.09 + lx * 0.8, ty - s * 0.32)
    px.line([ax0, (tx + sgn * s * 0.16 + lx * 0.3, ty - s * 0.12)], fill=suit * (0.8 if not dark else 0.25),
            width=s * 0.07)
    # mochila
    bx = tx - sgn * s * 0.14 + lx * 0.6
    px.polygon([(bx - s * 0.07, ty - s * 0.06), (bx + s * 0.06, ty - s * 0.06), (bx + s * 0.07 + lx * 0.3, ty - s * 0.40),
                (bx - s * 0.06 + lx * 0.3, ty - s * 0.42)], fill=np.array(pack) * (1 if not dark else 0.3))
    # cabeza / casco
    hx, hy = tx + lx * 1.15, ty - s * 0.46
    hc = helmet if helmet is not None else (226, 222, 210)
    px.ellipse((hx - s * 0.065, hy - s * 0.07, hx + s * 0.065, hy + s * 0.055),
               fill=np.array(hc) * (1 if not dark else 0.25))
    px.ellipse((hx - s * 0.02 + sgn * s * 0.02, hy - s * 0.005, hx + s * 0.05 * sgn + s * 0.02, hy + s * 0.05),
               fill=(40, 34, 36) if not dark else (8, 8, 14))
    head = (hx + s * 0.05 * sgn, hy - s * 0.02)
    if axe:
        ax = tx + sgn * s * 0.18 + lx * 0.3
        px.line([(ax, ty - s * 0.12), (ax + sgn * s * 0.05, yf - s * 0.02)], fill=(50, 48, 52), width=s * 0.03)
        px.line([(ax - s * 0.05, ty - s * 0.12), (ax + s * 0.05, ty - s * 0.13)], fill=(70, 70, 76), width=s * 0.025)
    return head


def wand(px, x, yb, h, rng):
    px.line([(x, yb), (x + h * 0.05, yb - h)], fill=(96, 78, 52), width=max(1, h * 0.035))
    px.polygon([(x + h * 0.05, yb - h), (x + h * 0.32, yb - h * 0.9), (x + h * 0.05, yb - h * 0.8)],
               fill=(214, 56, 48))


def grass_and_stones(canvas, regmask, s_map, U, SS, rng, density=0.04, dry=True):
    """hebras de pasto seco (no se re-pintan)"""
    d = ImageDraw.Draw(canvas)
    Hc, Wc = s_map.shape
    pal = [(40, 40, 30), (60, 56, 36), (84, 76, 44), (110, 98, 54), (140, 124, 66), (172, 150, 84),
           (204, 178, 110), (232, 206, 150)]
    area = regmask.sum()
    n = int(area / ((1.15 * U * SS) ** 2) * density)
    ys, xs = np.where(regmask)
    if len(ys) == 0:
        return
    pick = rng.integers(0, len(ys), n)
    items = []
    for i in pick:
        y, x = ys[i], xs[i]
        s = s_map[y, x]
        alto = (13 + 135 * s ** 1.3) * U * SS * rng.uniform(0.55, 1.35) * 0.55
        if rng.random() > (13 * U * SS * 0.55 / alto) ** 1.62:
            continue
        ancho = (0.9 + 3.0 * s) * U * SS * rng.uniform(0.7, 1.3) * 0.8
        inc = rng.normal(0.30, 0.28)
        ci = int(np.clip(rng.normal(0.6, 1.5) + 2.2 + 2.5 * rng.random(), 0, 7))
        items.append((y, x, alto, ancho, inc, ci))
    items.sort()
    for (y, x, alto, ancho, inc, ci) in items:
        c = np.array(pal[ci], np.float32)
        mx, my = x + inc * alto * 0.35, y - alto * 0.55
        tx, ty = x + inc * alto * 0.85, y - alto
        d.line([(x, y), (mx, my)], fill=tuple(int(v) for v in c), width=max(1, int(ancho)))
        tip = np.clip(c * 1.16 + np.array((14, 12, 0)), 0, 255)
        d.line([(mx, my), (tx, ty)], fill=tuple(int(v) for v in tip), width=max(1, int(ancho * 0.75)))


def add_glow(img, pts, U, color=(255, 226, 170), core=1.4, halo=7.0, k=1.0):
    """luces (frontales, carpas) — suma aditiva antes del acabado"""
    H, W = img.shape[:2]
    lay = np.zeros((H, W), np.float32)
    for (x, y, b) in pts:
        xi, yi = int(x), int(y)
        if 0 <= xi < W and 0 <= yi < H:
            lay[yi, xi] += b
    g = blur(lay, core * U) * (2 * math.pi * (core * U) ** 2) * 0.9 + blur(lay, halo * U) * (2 * math.pi * (halo * U) ** 2) * 0.10
    c = np.array(color, np.float32) / 255
    return img + (np.clip(g, 0, 3)[..., None] * c * 255 * k)


# ============================================================================ escenas

SCENES = {
    # Campo Base 4 850 m — mañana; morrena con carpas y chorten de banderas; cara NE del Manaslu
    "campo_base": dict(
        cam=(28.5840, 84.6020, 26), yaw=244, hfov=62, horizon=0.975,
        sun=(148, 33), pal="day", sky="day", sky_base=0.80, glow_side="left", cloud=None,
        haze_L=60000, snowline=4950,
        title="Campo Base · 4 850 m",
    ),
    # Campo 1 5 700 m — mirando hacia la cascada de hielo, el Collado Norte y la cumbre
    "campo_1": dict(
        cam=(28.5800, 84.5730, 20), yaw=222, hfov=68, horizon=1.22,
        sun=(112, 31), pal="day", sky="high", sky_base=0.55, glow_side="left", cloud=None,
        haze_L=70000, snowline=5000,
        title="Campo 1 · 5 700 m",
    ),
    # Campo 2 6 400 m — hacia el este: glaciar del Manaslu, valle de Samagaon bajo un mar de nubes
    "campo_2": dict(
        cam=(28.5735, 84.5590, 25), yaw=80, hfov=64, horizon=0.47,
        sun=(150, 46), pal="day", sky="high", sky_base=0.47, glow_side="right",
        cloud=(4300, 160, 0.35), haze_L=55000, snowline=5000,
        title="Campo 2 · 6 400 m",
    ),
    # Campo 3 6 800 m — alba sobre el Manaslu Norte; mar de nubes rosado
    "campo_3": dict(
        cam=(28.5670, 84.5570, 25), yaw=344, hfov=62, horizon=0.56,
        sun=(96, 4.5), pal="dawn", sky="dawn", sky_base=0.56, glow_side="right",
        cloud=(4700, 220, 0.0), haze_L=45000, snowline=5000,
        title="Campo 3 · 6 800 m",
    ),
    # Campo 4 7 450 m — noche de cumbre: fila de frontales hacia la arista final
    "campo_4_noche": dict(
        cam=(28.5600, 84.5543, 8), yaw=346, hfov=64, horizon=0.44, t_min=150,
        sun=(110, 24), pal="night", sky="night", sky_base=0.44, glow_side="left",
        cloud=(5100, 220, 0.0), haze_L=22000, snowline=5000, night=True,
        title="Campo 4 · 7 450 m · noche",
    ),
    # Cumbre 8 163 m — amanecer hacia el sur: Ngadi Chuli y Himalchuli sobre el mar de nubes
    "cumbre": dict(
        cam=(28.5532, 84.5566, 4), yaw=163, hfov=60, horizon=0.40,
        sun=(100, 9), pal="warm", sky="dawn", sky_base=0.40, glow_side="left",
        cloud=(5400, 260, 0.0), haze_L=60000, snowline=5000,
        title="Cumbre · 8 163 m",
    ),
}


def build_target(name, W, H, seed=1, log=print):
    sp = SCENES[name]
    U = math.sqrt(W * H) / 1946.0
    nz = Noise(H, W, seed)
    rng = np.random.default_rng(seed)
    dem = get_dem()
    lat, lon, dz = sp["cam"]
    x, y = dem.ll2xy(lat, lon)
    z = dem.height(x, y) + dz
    cam = Camera(x, y, z, sp["yaw"], sp["hfov"], W, H, sp["horizon"])
    cam.t_min = sp.get("t_min", 200.0)
    # mar de nubes
    if sp["cloud"]:
        lvl, amp, holes = sp["cloud"]
        dem.cloud = cloud_layer(dem, lvl, amp, seed + 11, holes)
        dem.cloud_cval = lvl
    else:
        dem.cloud = None
        dem.cloud_cval = -1e4
    t0 = time.time()
    tp, hard, rays = raymarch(dem, cam)
    col, regt, aux = shade(dem, cam, tp, rays, sp["sun"][0], sp["sun"][1], sp["pal"],
                           haze_L=sp["haze_L"], snowline=sp["snowline"], seed=seed)
    log(f"  terreno {time.time()-t0:.1f}s")
    skym = np.isnan(tp)
    # cielo
    T = sky(H, W, sp["sky_base"], sp["sky"], nz, glow_side=sp["glow_side"],
            glow=(246, 228, 192) if sp["sky"] != "dawn" else (255, 196, 150),
            glow_k=0.55 if sp["sky"] != "night" else 0.0,
            cirrus=0.42 if sp["sky"] != "night" else 0.25)
    reg = np.zeros((H, W), np.uint8)
    ctx = dict(sp=sp, U=U, nz=nz, rng=rng, cam=cam, dem=dem, tp=tp, aux=aux, sky=skym)
    # nubes de fondo (detrás de la montaña)
    hook = SCENE_HOOKS.get(name, {})
    if "clouds_back" in hook:
        hook["clouds_back"](T, reg, ctx)
    # montaña
    m = ~skym
    if sp.get("night"):
        col = col * 0.80
    T[m] = col[m]; reg[m] = regt[m]
    if "after_terrain" in hook:
        hook["after_terrain"](T, reg, ctx)
    # primer plano
    fg = hook["foreground"](T, reg, ctx) if "foreground" in hook else {}
    ctx.update(fg)
    return T, reg, ctx


def render(name, W, H, out, SS=2, seed=1, log=print, dump=None):
    t0 = time.time()
    U = math.sqrt(W * H) / 1946.0
    log(f"[{name}] {W}x{H} SS={SS} U={U:.3f}")
    T, reg, ctx = build_target(name, W, H, seed, log)
    if dump:
        Image.fromarray(np.clip(T, 0, 255).astype(np.uint8)).save(dump)
    rng = np.random.default_rng(seed + 100)
    Wc, Hc = W * SS, H * SS
    Tc = np.stack([np.asarray(Image.fromarray(T[..., c].astype(np.float32), "F").resize((Wc, Hc), Image.BICUBIC))
                   for c in range(3)], -1)
    regc = np.asarray(Image.fromarray(reg).resize((Wc, Hc), Image.NEAREST))
    nzc = Noise(Hc, Wc, seed + 7)
    theta = orientation(Tc, regc, U * SS, nzc)
    base = blur(Tc, 10 * U * SS)
    canvas = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))
    del base
    log(f"  objetivo listo {time.time()-t0:.0f}s; pintando…")
    paint(canvas, Tc, theta, regc, U, SS, rng, log=log)
    del theta
    # objetos
    hook = SCENE_HOOKS.get(name, {})
    px = Proxy(canvas)
    if "objects" in hook:
        hook["objects"](px, ctx, SS, rng)
    canvas = rebrush(canvas, px, U, SS, nzc, rng, log=log)
    if "objects_nobrush" in hook:
        hook["objects_nobrush"](canvas, ctx, SS, rng)
    log(f"  pintado {time.time()-t0:.0f}s")
    img = np.asarray(canvas.resize((W, H), Image.LANCZOS), np.float32)
    if "post" in hook:
        img = hook["post"](img, ctx)
    sp = SCENES[name]
    fk = dict()
    if sp["sky"] == "dawn":
        fk = dict(chalk=(246, 228, 208), chalk_k=0.9)
    if sp.get("night"):
        fk = dict(chalk=(176, 190, 226), chalk_k=0.50, gap_k=0.9, fondo=(8, 9, 20))
    fk.setdefault("gap_k", 0.85)
    out_img = finish(img, reg, U, rng, log=log, **fk)
    out_img.save(out)
    log(f"  listo {out}  ({time.time()-t0:.0f}s)")
    return out_img


# -------------------------------------------------------------- ganchos por escena

def _proj_ok(ctx, X, Y, Z, tol=60):
    cam, tp = ctx["cam"], ctx["tp"]
    c, r, dist, zf = cam.project(X, Y, Z)
    ok = (zf > 0) & (c >= 0) & (c < cam.W) & (r >= 0) & (r < cam.H)
    vis = np.zeros_like(ok)
    ci = np.clip(c.astype(int), 0, cam.W - 1); ri = np.clip(r.astype(int) + 1, 0, cam.H - 1)
    tt = tp[ri, ci]
    vis = ok & (np.isnan(tt) | (tt > dist - tol))
    return c, r, dist, vis


def route_points(ctx, A, B, n, jitter=0.0, rng=None, above=1.8):
    """puntos sobre el terreno a lo largo de la ruta A→B (lat, lon)"""
    dem = ctx["dem"]
    ax, ay = dem.ll2xy(*A); bx, by = dem.ll2xy(*B)
    t = np.linspace(0, 1, n)
    X = ax + (bx - ax) * t; Y = ay + (by - ay) * t
    if jitter and rng is not None:
        X = X + rng.normal(0, jitter, n); Y = Y + rng.normal(0, jitter, n)
    Z = dem.height(X, Y) + above
    return X, Y, Z


# ---- Campo Base
def cb_clouds(T, reg, ctx):
    H, W = reg.shape; U = ctx["U"]
    col, a = cumulus(H, W, U, [(0.08, 0.36, 0.17 * W, 0.17 * H, 110), (0.90, 0.26, 0.11 * W, 0.11 * H, 70)], ctx["nz"], ctx["rng"])
    compose(T, reg, col, a, 1)


def cb_after(T, reg, ctx):
    # banco de niebla bajo, delante del glaciar
    H, W = reg.shape; U = ctx["U"]; nz = ctx["nz"]
    mist(T, reg, nz, 0.775, 0.05, 0.0, 0.40, amp=0.03, k=0.55, light_side=-1, rng=ctx["rng"])
    mist(T, reg, nz, 0.785, 0.04, 0.66, 1.0, amp=0.025, k=0.5, light_side=-1, rng=ctx["rng"])


def cb_fg(T, reg, ctx):
    H, W = reg.shape; U = ctx["U"]; rng = ctx["rng"]; nz = ctx["nz"]
    far = curve(W, [(0, 0.815), (0.3, 0.825), (0.55, 0.835), (0.8, 0.83), (1, 0.82)], 0.010, rng)
    ground(T, reg, U, far, "moraine", nz, rng, rid=4)
    near = curve(W, [(0, 0.875), (0.18, 0.885), (0.36, 0.93), (0.42, 1.05), (1, 1.10)], 0.010, rng)
    s = ground(T, reg, U, near, "moraine", nz, rng, rid=5)
    return dict(far=far, near=near, s_near=s)


def cb_objects(px, ctx, SS, rng):
    W, H = ctx["cam"].W * SS, ctx["cam"].H * SS; U = ctx["U"] * SS
    far, near = ctx["far"], ctx["near"]
    yat = lambda line, u: line[int(np.clip(u, 0, 0.999) * len(line))] * H
    # chorten de la puja con mástil y líneas de banderas
    cx = 0.17 * W; cy = yat(near, 0.17) + 0.03 * H
    for i in range(6):
        w = (0.060 - i * 0.008) * W * 0.55; hh = 0.012 * H
        y = cy - i * hh * 0.95
        for k in range(int(4 + w / (8 * U))):
            sx = cx - w / 2 + rng.uniform(0, w)
            rock(px, sx, y - rng.uniform(0, hh * 0.4), rng.uniform(0.35, 0.6) * hh, -1, (92, 86, 84), rng)
    top = (cx + 0.002 * W, cy - 0.17 * H)
    px.line([(cx, cy - 0.04 * H), top], fill=(84, 64, 44), width=0.0032 * W)
    px.ellipse((top[0] - 0.003 * W, top[1] - 0.004 * H, top[0] + 0.003 * W, top[1] + 0.002 * H), fill=(214, 180, 60))
    anchors = [(0.01, 0.90), (0.06, 0.845), (0.30, 0.835), (0.37, 0.93), (0.09, 0.99), (0.26, 0.99)]
    for i, (u, v) in enumerate(anchors):
        flags_line(px, top, (u * W, v * H), 0.015 * H * (1 + i * 0.2), 0.0085 * W, rng, phase=i,
                   width=0.0012 * W)
    # carpas sobre la loma lejana y la cercana
    us = sorted(rng.uniform(0.40, 0.99, 14))
    for i, u in enumerate(us):
        yb = yat(far, u) + rng.uniform(0.006, 0.05) * H
        w = (0.026 + 0.05 * (yb / H - 0.82)) * W * rng.uniform(0.85, 1.15)
        tent(px, u * W, yb, w, TENT_COLS[rng.integers(len(TENT_COLS))], light=-1, ground=(120, 112, 104))
    for u, v, wsc in ((0.58, 0.915, 0.075), (0.76, 0.935, 0.09), (0.93, 0.905, 0.07)):
        tent(px, u * W, v * H, wsc * W, TENT_COLS[rng.integers(len(TENT_COLS))], light=-1, ground=(110, 104, 98))
    # piedras
    for _ in range(30):
        u = rng.uniform(0, 1); v = max(yat(near, u), yat(far, u)) / H + rng.uniform(0.01, 0.12)
        if v > 1.0:
            continue
        r = (0.004 + 0.05 * max(v - 0.82, 0) ** 1.1) * W * rng.uniform(0.6, 1.4)
        rock(px, u * W, v * H, r, -1, (78, 74, 80), rng, snowcap=rng.random() < 0.25)
    # dos escaladores caminando hacia la cascada
    climber(px, 0.45 * W, yat(far, 0.45) + 0.004 * H, 0.030 * H, (200, 60, 50), light=-1, lean=-0.3)
    climber(px, 0.485 * W, yat(far, 0.485) + 0.002 * H, 0.028 * H, (240, 190, 60), light=-1, lean=-0.3)


def cb_nobrush(canvas, ctx, SS, rng):
    H, W = ctx["cam"].H, ctx["cam"].W
    near = np.minimum(ctx["near"], 2.0)
    v = ((np.arange(H * SS) + 0.5) / (H * SS))[:, None]
    nc = np.repeat(near, SS)[None, :]
    regm = (v > nc + 0.01) & (v < 0.999)
    s_map = np.clip((v - nc) / (1 - nc), 0, 1) * np.ones_like(regm)
    grass_and_stones(canvas, regm, s_map, ctx["U"], SS, rng, density=0.05)


# ---- Campo 1
def c1_clouds(T, reg, ctx):
    H, W = reg.shape; U = ctx["U"]
    col, a = cumulus(H, W, U, [(0.94, 0.30, 0.13 * W, 0.14 * H, 90)],
                     ctx["nz"], ctx["rng"])
    compose(T, reg, col, a, 1)


def c1_after(T, reg, ctx):
    H, W = reg.shape; U = ctx["U"]
    mist(T, reg, ctx["nz"], 0.74, 0.07, 0.55, 1.0, amp=0.03, k=0.75, light_side=-1, rng=ctx["rng"])


def c1_fg(T, reg, ctx):
    H, W = reg.shape; U = ctx["U"]; rng = ctx["rng"]; nz = ctx["nz"]
    far = curve(W, [(0, 0.80), (0.4, 0.83), (0.7, 0.845), (1, 0.835)], 0.010, rng)
    ground(T, reg, U, far, "snow", nz, rng, light=-1, rid=3)
    near = curve(W, [(0, 0.90), (0.35, 0.88), (0.7, 0.915), (1, 0.93)], 0.012, rng)
    s = ground(T, reg, U, near, "snow", nz, rng, light=-1, rid=3)
    return dict(far=far, near=near)


def c1_objects(px, ctx, SS, rng):
    W, H = ctx["cam"].W * SS, ctx["cam"].H * SS
    far, near = ctx["far"], ctx["near"]
    yat = lambda line, u: line[int(np.clip(u, 0, 0.999) * len(line))] * H
    for u in sorted(rng.uniform(0.08, 0.62, 9)):
        yb = yat(far, u) + rng.uniform(0.006, 0.022) * H
        tent(px, u * W, yb, rng.uniform(0.032, 0.046) * W, TENT_COLS[rng.integers(len(TENT_COLS))], light=-1)
    for u, wsc in ((0.16, 0.10), (0.36, 0.085)):
        tent(px, u * W, yat(near, u) + 0.045 * H, wsc * W, TENT_COLS[rng.integers(len(TENT_COLS))], light=-1)
    # banderines (wands) marcando la huella hacia la cascada
    for i, u in enumerate(np.linspace(0.70, 0.93, 7)):
        yb = yat(far, u) - (u - 0.70) * 0.05 * H + 0.006 * H
        wand(px, u * W, yb, (0.03 - i * 0.002) * H, rng)
    # cordada subiendo
    for i, (u, c) in enumerate(((0.74, (204, 62, 48)), (0.79, (236, 186, 58)), (0.84, (60, 100, 170)))):
        yb = yat(far, u) - (u - 0.70) * 0.05 * H + 0.004 * H
        climber(px, u * W, yb, (0.034 - i * 0.003) * H, c, light=-1, lean=0.35)


# ---- Campo 2
def c2_clouds(T, reg, ctx):
    H, W = reg.shape; U = ctx["U"]
    col, a = cumulus(H, W, U, [(0.22, 0.475, 0.07 * W, 0.10 * H, 80), (0.52, 0.48, 0.09 * W, 0.13 * H, 90), (0.80, 0.47, 0.06 * W, 0.08 * H, 60)], ctx["nz"], ctx["rng"])
    compose(T, reg, col, a, 1)


def c2_fg(T, reg, ctx):
    H, W = reg.shape; U = ctx["U"]; rng = ctx["rng"]; nz = ctx["nz"]
    near = curve(W, [(0, 0.70), (0.25, 0.76), (0.55, 0.83), (0.8, 0.86), (1, 0.88)], 0.016, rng)
    ground(T, reg, U, near, "snow", nz, rng, light=1, rid=3)
    return dict(near=near)


def c2_objects(px, ctx, SS, rng):
    W, H = ctx["cam"].W * SS, ctx["cam"].H * SS
    near = ctx["near"]
    yat = lambda u: near[int(np.clip(u, 0, 0.999) * len(near))] * H
    for u, wsc in ((0.10, 0.09), (0.22, 0.075), (0.31, 0.06)):
        tent(px, u * W, yat(u) + 0.035 * H, wsc * W, TENT_COLS[rng.integers(len(TENT_COLS))], light=1)
    # cuerda fija bajando por la ladera
    pts = [(0.47 * W, yat(0.47) + 0.02 * H), (0.62 * W, yat(0.62) + 0.06 * H), (0.80 * W, 1.02 * H)]
    px.line(pts, fill=(196, 60, 52), width=0.0014 * W)
    climber(px, 0.585 * W, yat(0.585) + 0.05 * H, 0.085 * H, (226, 120, 46), light=1, lean=-0.15)
    climber(px, 0.43 * W, yat(0.43) + 0.022 * H, 0.06 * H, (60, 100, 170), light=1, lean=0.05, axe=False)


# ---- Campo 3
def c3_after(T, reg, ctx):
    H, W = reg.shape; U = ctx["U"]
    fog_band(T, reg, 0.60, ctx["nz"], color=(230, 196, 196), k=0.45, width=0.06)


def c3_fg(T, reg, ctx):
    H, W = reg.shape; U = ctx["U"]; rng = ctx["rng"]; nz = ctx["nz"]
    near = curve(W, [(0, 0.86), (0.3, 0.83), (0.62, 0.845), (1, 0.80)], 0.012, rng)
    ground(T, reg, U, near, "snow", nz, rng, light=1, rid=3, warm=1)
    return dict(near=near)


def c3_objects(px, ctx, SS, rng):
    W, H = ctx["cam"].W * SS, ctx["cam"].H * SS
    near = ctx["near"]
    yat = lambda u: near[int(np.clip(u, 0, 0.999) * len(near))] * H
    for u, wsc in ((0.70, 0.07), (0.80, 0.085), (0.91, 0.065)):
        c = np.array(TENT_COLS[rng.integers(len(TENT_COLS))]) * np.array((1.05, 0.88, 0.85))
        tent(px, u * W, yat(u) + 0.045 * H, wsc * W, c, light=1)
    climber(px, 0.30 * W, yat(0.30) + 0.03 * H, 0.10 * H, (210, 70, 60), light=1, lean=0.0, axe=True)


# ---- Campo 4 (noche): desde la arista cimera, mirando abajo hacia las carpas del C4
C4_LL = (28.5600, 84.5543)


def c4_fg(T, reg, ctx):
    H, W = reg.shape; U = ctx["U"]; rng = ctx["rng"]; nz = ctx["nz"]
    far = curve(W, [(0, 0.79), (0.3, 0.775), (0.6, 0.80), (1, 0.82)], 0.008, rng)
    ground(T, reg, U, far, "snow", nz, rng, light=1, rid=3, night=True)
    T[reg == 3] *= 0.72
    near = curve(W, [(0, 0.90), (0.35, 0.88), (0.7, 0.92), (1, 0.95)], 0.010, rng)
    ground(T, reg, U, near, "snow", nz, rng, light=1, rid=3, night=True)
    m = np.zeros_like(reg, bool); v = ((np.arange(H) + 0.5) / H)[:, None]
    T[(v > near[None, :])] *= 0.62
    return dict(far=far, near=near)


def c4_objects(px, ctx, SS, rng):
    W, H = ctx["cam"].W * SS, ctx["cam"].H * SS
    far, near = ctx["far"], ctx["near"]
    yat = lambda line, u: line[int(np.clip(u, 0, 0.999) * len(line))] * H
    gl = []
    for u, dv, wsc in ((0.08, 0.020, 0.046), (0.20, 0.012, 0.038), (0.29, 0.016, 0.042), (0.47, 0.010, 0.032),
                       (0.58, 0.014, 0.036), (0.86, 0.022, 0.050)):
        x = u * W; yb = yat(far, u) + dv * H; w = wsc * W
        col = TENT_COLS[rng.integers(len(TENT_COLS))]
        tent(px, x, yb, w, np.array(col) * 0.55, light=1, glow=True, ground=(60, 70, 110))
        gl.append((x / SS, (yb - 0.25 * w) / SS, 0.9 + 0.4 * rng.random()))
    for u, wsc in ((0.70, 0.10), (0.13, 0.085)):
        x = u * W; yb = yat(near, u) + 0.05 * H; w = wsc * W
        col = TENT_COLS[rng.integers(len(TENT_COLS))]
        tent(px, x, yb, w, np.array(col) * 0.55, light=1, glow=True, ground=(50, 60, 100))
        gl.append((x / SS, (yb - 0.25 * w) / SS, 1.6))
    ctx["tent_glow"] = gl
    heads = []
    for u, hh, c, ln in ((0.38, 0.15, (130, 40, 36), 0.25), (0.45, 0.13, (40, 60, 120), 0.3),
                         (0.53, 0.11, (150, 110, 30), 0.3)):
        x = u * W; yf = yat(near, u) + 0.03 * H + (hh - 0.11) * 0.5 * H
        hx, hy = climber(px, x, yf, hh * H, c, light=1, lean=ln, dark=True)
        heads.append((hx / SS, hy / SS, 1.4))
    ctx["fg_heads"] = heads


def c4_nobrush(canvas, ctx, SS, rng):
    stars(canvas, ctx, SS, rng)
    d = ImageDraw.Draw(canvas); U = ctx["U"] * SS
    for (x, y, b) in ctx.get("fg_heads", []):
        r = 2.2 * U
        d.ellipse((x * SS - r, y * SS - r, x * SS + r, y * SS + r), fill=(255, 246, 220))


def stars(canvas, ctx, SS, rng, n=None):
    d = ImageDraw.Draw(canvas)
    H, W = ctx["cam"].H * SS, ctx["cam"].W * SS
    sky = np.asarray(Image.fromarray(ctx["sky"].astype(np.uint8) * 255).resize((W, H)))
    U = ctx["U"] * SS
    n = n or int(2600)
    for _ in range(n):
        x = rng.uniform(0, W); y = H * rng.random() ** 1.4
        if not sky[min(int(y), H - 1), min(int(x), W - 1)]:
            continue
        b = rng.random() ** 3
        r = (0.6 + 2.2 * b) * U * 0.6
        c = tuple(int(v) for v in np.array((214, 224, 255)) * (0.55 + 0.45 * b))
        d.ellipse((x - r, y - r, x + r, y + r), fill=c)


def c4_post(img, ctx):
    img = add_glow(img, ctx.get("fg_heads", []), ctx["U"], (255, 244, 214), core=1.8, halo=14, k=1.6)
    img = add_glow(img, ctx.get("tent_glow", []), ctx["U"], (255, 186, 104), core=4.0, halo=16, k=0.7)
    return img


# ---- Cumbre
def cu_after(T, reg, ctx):
    H, W = reg.shape; U = ctx["U"]
    fog_band(T, reg, 0.43, ctx["nz"], color=(236, 214, 206), k=0.5, width=0.05)


def cu_fg(T, reg, ctx):
    H, W = reg.shape; U = ctx["U"]; rng = ctx["rng"]; nz = ctx["nz"]
    crest = curve(W, [(0, 0.97), (0.18, 0.86), (0.36, 0.80), (0.5, 0.79), (0.62, 0.81), (0.85, 0.93), (1, 1.02)],
                  0.008, rng)
    ground(T, reg, U, crest, "snow", nz, rng, light=-1, rid=3, warm=1)
    return dict(crest=crest)


def cu_objects(px, ctx, SS, rng):
    W, H = ctx["cam"].W * SS, ctx["cam"].H * SS
    crest = ctx["crest"]
    yat = lambda u: crest[int(np.clip(u, 0, 0.999) * len(crest))] * H
    top = (0.49 * W, yat(0.49) - 0.11 * H)
    px.line([(0.49 * W, yat(0.49) + 0.01 * H), top], fill=(70, 60, 50), width=0.003 * W)
    for i, (u, v) in enumerate(((0.20, 0.90), (0.30, 0.86), (0.70, 0.88), (0.80, 0.95))):
        flags_line(px, top, (u * W, v * H), 0.02 * H, 0.011 * W, rng, phase=i, width=0.0012 * W)
    climber(px, 0.60 * W, yat(0.60) + 0.012 * H, 0.15 * H, (226, 120, 46), light=-1, lean=0.05, axe=True,
            helmet=(230, 196, 60))
    climber(px, 0.36 * W, yat(0.36) + 0.010 * H, 0.12 * H, (200, 60, 50), light=-1, lean=-0.1, axe=False,
            helmet=(236, 232, 224))


SCENE_HOOKS = {
    "campo_base": dict(clouds_back=cb_clouds, after_terrain=cb_after, foreground=cb_fg, objects=cb_objects,
                       objects_nobrush=cb_nobrush),
    "campo_1": dict(clouds_back=c1_clouds, after_terrain=c1_after, foreground=c1_fg, objects=c1_objects),
    "campo_2": dict(clouds_back=c2_clouds, foreground=c2_fg, objects=c2_objects),
    "campo_3": dict(after_terrain=c3_after, foreground=c3_fg, objects=c3_objects),
    "campo_4_noche": dict(foreground=c4_fg, objects=c4_objects, objects_nobrush=c4_nobrush, post=c4_post),
    "cumbre": dict(after_terrain=cu_after, foreground=cu_fg, objects=cu_objects),
}


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) < 4:
        print(__doc__); sys.exit(1)
    name, W, H, out = a[0], int(a[1]), int(a[2]), a[3]
    SS = int(a[4]) if len(a) > 4 else 2
    seed = int(a[5]) if len(a) > 5 else 1
    if name == "all":
        os.makedirs(out, exist_ok=True)
        for i, n in enumerate(SCENES):
            render(n, W, H, os.path.join(out, f"{i+1:02d}_{n}.png"), SS, seed)
    else:
        render(name, W, H, out, SS, seed)
