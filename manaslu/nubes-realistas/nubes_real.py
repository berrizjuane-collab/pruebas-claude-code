"""
nubes_real.py — plantillas de nube realistas (RGBA) para la identidad «Mani».

Cada nube es un campo de espesor (cuerpo + cúmulos) deformado con ruido, iluminado desde
arriba a la izquierda con sombra propia, borde de coliflor, jirones fibrosos y grano de
pincel seco. El «núcleo» (área de texto) se mantiene denso y claro para leer en pizarra.

    python3 nubes_real.py <salida_dir> [nombre ...]
"""
import sys, os, json, math
import numpy as np
from PIL import Image
from scipy import ndimage as nd


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def value_noise(H, W, cells_x, cells_y, rng):
    g = rng.random((int(cells_y) + 3, int(cells_x) + 3)).astype(np.float32)
    yy = np.linspace(1, cells_y + 1, H, dtype=np.float32)[:, None] * np.ones((1, W), np.float32)
    xx = np.linspace(1, cells_x + 1, W, dtype=np.float32)[None, :] * np.ones((H, 1), np.float32)
    return nd.map_coordinates(g, [yy, xx], order=3, mode='reflect')


def fbm(H, W, base, rng, octaves=5, sx=1.0, sy=1.0, turb=False):
    acc = np.zeros((H, W), np.float32); amp = 1.0; tot = 0.0; f = base
    for _ in range(octaves):
        n = value_noise(H, W, f * W / max(W, H) * sx + 1, f * H / max(W, H) * sy + 1, rng)
        if turb:
            n = np.abs(2 * n - 1)
        acc += amp * n; tot += amp; amp *= 0.5; f *= 2.03
    return acc / tot


def rounded_box_sd(xx, yy, box, r):
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    hw, hh = (x1 - x0) / 2, (y1 - y0) / 2
    r = min(r, hw, hh)
    qx = np.abs(xx - cx) - (hw - r); qy = np.abs(yy - cy) - (hh - r)
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r


def puff(T, xx, yy, cx, cy, r, sy=1.0, k=1.0):
    x0, x1 = int(max(cx - r - 2, 0)), int(min(cx + r + 2, T.shape[1]))
    y0, y1 = int(max(cy - r * sy - 2, 0)), int(min(cy + r * sy + 2, T.shape[0]))
    if x1 <= x0 or y1 <= y0:
        return
    d2 = ((xx[y0:y1, x0:x1] - cx) ** 2 + ((yy[y0:y1, x0:x1] - cy) / sy) ** 2) / (r * r)
    h = k * r * np.sqrt(np.clip(1 - d2, 0, 1))
    np.maximum(T[y0:y1, x0:x1], h, out=T[y0:y1, x0:x1])


def render(W, H, core, kind='cumulo', seed=1, light=(-0.55, -0.80, 0.62), tint='neutral',
           puffs=None, margin=0.10, wisp=0.55, warp=0.020):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    S = math.sqrt(W * H)
    x0, y0, x1, y1 = [c * (W if i % 2 == 0 else H) for i, c in enumerate(core)]
    box = (x0, y0, x1, y1)
    m = margin * S
    sd = rounded_box_sd(xx, yy, box, 0.45 * min(x1 - x0, y1 - y0))
    Tc = m * 1.25
    # cuerpo: meseta sobre el núcleo que cae esférica hasta el borde
    T = np.where(sd <= 0, Tc, Tc * np.sqrt(np.clip(1 - (sd / m) ** 2, 0, 1))).astype(np.float32)
    # cúmulos alrededor (más grandes arriba, base plana)
    plist = puffs(W, H, box, m, rng) if puffs else default_puffs(W, H, box, m, rng, kind)
    for (cx, cy, r, sy, k) in plist:
        puff(T, xx, yy, cx, cy, r, sy, k)
    # deformación de dominio: lóbulos irregulares
    a = warp * S
    dx = (fbm(H, W, 3.0, rng, 4) - 0.5) * 2 * a; dy = (fbm(H, W, 3.0, rng, 4) - 0.5) * 2 * a
    T = nd.map_coordinates(T, [yy + dy, xx + dx], order=1, mode='constant')
    # rugosidad de coliflor en el borde
    tb = fbm(H, W, 9.0, rng, 4, turb=True)
    T = T * (0.86 + 0.28 * fbm(H, W, 5.0, rng, 3))
    edge = T / Tc + 0.30 * (tb - 0.5)
    alpha = smooth(0.03, 0.42, edge)
    # jirones fibrosos que escapan del borde
    if wisp > 0:
        fib = fbm(H, W, 2.2, rng, 6, sx=0.35, sy=2.4)
        out = np.clip(-(T / Tc) + 0.4, 0, 1)
        dist = nd.distance_transform_edt(alpha < 0.3).astype(np.float32)
        band = np.exp(-dist / (0.05 * S)) * (alpha < 0.6)
        w = smooth(0.50, 0.80, fib) * band * wisp
        alpha = np.maximum(alpha, w * 0.75)
        T = np.maximum(T, w * 0.10 * Tc)
    # ---- luz
    Hs = nd.gaussian_filter(T, 0.010 * S)
    gy, gx = np.gradient(Hs)
    s = 1.6
    nx, ny, nz = -gx * s, -gy * s, np.ones_like(gx)
    nn = np.sqrt(nx * nx + ny * ny + nz * nz)
    L = np.array(light, np.float32); L /= np.linalg.norm(L)
    diff = np.clip((nx * L[0] + ny * L[1] + nz * L[2]) / nn, 0, 1)
    # sombra propia: marcha hacia la luz en el plano
    occ = np.zeros_like(T); step = 0.012 * S
    for i in range(1, 10):
        t = i * step
        hsamp = nd.map_coordinates(Hs, [yy + L[1] * t, xx + L[0] * t], order=1, mode='constant')
        occ += np.clip(hsamp - Hs - t * 0.55, 0, None)
    shadow = np.exp(-occ / (Tc * 1.6))
    # oscurecimiento de la base (las bases de los cúmulos son grises)
    base = smooth(0.15, 1.0, (yy - y1) / max(H - y1, 1)) * 0.55
    k = 0.22 + 0.78 * (0.35 + 0.65 * diff) * shadow - base
    # ribete de plata en los bordes finos que miran a la luz
    rim = (1 - smooth(0.25, 0.75, alpha)) * smooth(0.2, 0.9, diff)
    k = k + 0.35 * rim
    # núcleo: cara iluminada y tranquila para el texto
    core_m = smooth(0.0, -0.05 * S, sd)
    k = k * (1 - core_m) + np.maximum(k, 0.93 + 0.04 * (fbm(H, W, 2.0, rng, 3) - 0.5)) * core_m
    k = np.clip(k, 0, 1)
    if tint == 'neutral':
        c0, c1, c2 = (150, 162, 184), (212, 219, 230), (250, 250, 247)
    elif tint == 'calido':
        c0, c1, c2 = (160, 150, 176), (226, 214, 214), (255, 248, 240)
    else:  # noche
        c0, c1, c2 = (92, 104, 140), (170, 182, 210), (226, 232, 244)
    c0, c1, c2 = [np.array(c, np.float32) for c in (c0, c1, c2)]
    kk = k[..., None]
    col = np.where(kk < 0.5, c0 + (c1 - c0) * (kk / 0.5), c1 + (c2 - c1) * ((kk - 0.5) / 0.5))
    # pincel seco: estrías diagonales suaves y grano, como en las ilustraciones
    ang = math.radians(-18)
    u = xx * math.cos(ang) + yy * math.sin(ang); v = -xx * math.sin(ang) + yy * math.cos(ang)
    streak = nd.map_coordinates(rng.random((260, 260)).astype(np.float32),
                                [(v / (0.004 * S)) % 259, (u / (0.05 * S)) % 259], order=1, mode='wrap')
    col += ((streak - 0.5) * 9 * (1 - core_m * 0.6))[..., None]
    col += rng.normal(0, 2.6, (H, W, 1)).astype(np.float32)
    rgba = np.dstack([np.clip(col, 0, 255), np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
    pad = dict(top=y0 / W, right=(W - x1) / W, bottom=(H - y1) / W, left=x0 / W)
    return Image.fromarray(rgba, 'RGBA'), pad


def default_puffs(W, H, box, m, rng, kind):
    x0, y0, x1, y1 = box
    P = []
    w, h = x1 - x0, y1 - y0
    if kind in ('cumulo', 'torre'):
        n = max(4, int(w / (0.9 * m)))
        for i in range(n):
            t = (i + 0.5 + rng.uniform(-0.3, 0.3)) / n
            cx = x0 + w * t
            r = m * rng.uniform(0.85, 1.55) * (1.0 - 0.35 * abs(t - 0.45))
            P.append((cx, y0 - r * rng.uniform(0.05, 0.35), r, 1.0, rng.uniform(1.0, 1.25)))
        for side in (x0, x1):
            for j in range(max(2, int(h / (0.9 * m)))):
                t = (j + 0.5) / max(2, int(h / (0.9 * m)))
                r = m * rng.uniform(0.7, 1.1)
                P.append((side + (rng.uniform(-0.25, 0.05) if side == x0 else rng.uniform(-0.05, 0.25)) * r,
                          y0 + h * t * 0.85, r, 1.0, 0.95))
        for i in range(max(3, int(w / (1.4 * m)))):
            t = (i + 0.5) / max(3, int(w / (1.4 * m)))
            r = m * rng.uniform(0.6, 0.9)
            P.append((x0 + w * t, y1 + r * 0.05, r, 0.45, 0.8))
    return P


def torre_puffs(W, H, box, m, rng):
    x0, y0, x1, y1 = box
    P = default_puffs(W, H, box, m, rng, 'cumulo')
    cx = (x0 + x1) / 2; top = 0.10 * H
    n = 9
    for i in range(n):
        t = i / (n - 1)
        y = y0 - (y0 - top) * t
        r = m * (1.7 - 0.8 * t) * rng.uniform(0.85, 1.1)
        P.append((cx + rng.uniform(-0.6, 0.6) * m * (1 - 0.5 * t), y, r, 1.0, 1.2))
        if rng.random() < 0.7:
            P.append((cx + rng.choice([-1, 1]) * r * 0.7, y + r * 0.2, r * 0.7, 1.0, 1.1))
    return P


def lenticular(W, H, core, seed=3, tint='neutral'):
    """lente lisa con capas apiladas: las lenticulares son suaves, no algodonosas"""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    S = math.sqrt(W * H)
    x0, y0, x1, y1 = core[0] * W, core[1] * H, core[2] * W, core[3] * H
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    alpha = np.zeros((H, W), np.float32); k = np.zeros((H, W), np.float32)
    layers = [(0.00, 0.50, 0.30, 1.0), (-0.20, 0.40, 0.17, 0.9), (-0.33, 0.27, 0.10, 0.8), (0.17, 0.44, 0.11, 0.75)]
    warp = (fbm(H, W, 2.0, rng, 4) - 0.5) * 0.02 * S
    for dy, rx, ry, a in layers:
        ex = (xx + warp - cx) / (rx * W); ey = (yy - (cy + dy * H)) / (ry * H)
        d = ex * ex + ey * ey
        lay = smooth(1.0, 0.72, d) * a
        shade = np.clip(0.55 - ey * 0.45 - ex * 0.12, 0, 1)
        k = np.where(lay > alpha, shade, k)
        alpha = np.maximum(alpha, lay)
    fib = fbm(H, W, 1.8, rng, 6, sx=0.18, sy=3.0)
    alpha = np.clip(alpha * (0.85 + 0.3 * fib), 0, 1)
    core_m = smooth(1.0, 0.55, ((xx - cx) / ((x1 - x0) / 2)) ** 2 + ((yy - cy) / ((y1 - y0) / 1.6)) ** 2)
    k = np.clip(0.35 + 0.65 * k, 0, 1)
    k = k * (1 - core_m) + np.maximum(k, 0.94) * core_m
    c0, c1, c2 = [np.array(c, np.float32) for c in ((150, 162, 184), (212, 219, 230), (250, 250, 247))]
    kk = k[..., None]
    col = np.where(kk < 0.5, c0 + (c1 - c0) * (kk / 0.5), c1 + (c2 - c1) * ((kk - 0.5) / 0.5))
    col += rng.normal(0, 2.4, (H, W, 1)).astype(np.float32)
    rgba = np.dstack([np.clip(col, 0, 255), np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA'), dict(top=y0 / W, right=(W - x1) / W, bottom=(H - y1) / W, left=x0 / W)


def estandarte_puffs(W, H, box, m, rng):
    x0, y0, x1, y1 = box
    P = []
    # cabeza densa a la izquierda (pegada a la cima) que se estira a la derecha
    for i in range(14):
        t = i / 13
        cx = x0 - 0.4 * m + (x1 - x0 + 0.9 * m) * t
        r = m * (1.35 - 0.55 * t) * rng.uniform(0.85, 1.1)
        P.append((cx, (y0 + y1) / 2 - 0.25 * m * (1 - t) + rng.uniform(-0.2, 0.2) * m, r, 0.62 + 0.25 * (1 - t), 1.1))
    return P


TEMPLATES = {
    # nombre: (W, H, núcleo x0,y0,x1,y1 en fracción, tipo, semilla, extra)
    'hero':       (1600, 700, (0.16, 0.40, 0.84, 0.82), 'cumulo', 11, {}),
    'bloque':     (1600, 1000, (0.12, 0.24, 0.88, 0.84), 'cumulo', 12, {}),
    'movil':      (900, 1500, (0.12, 0.17, 0.88, 0.87), 'cumulo', 13, {}),
    'tarjeta':    (1000, 1000, (0.16, 0.27, 0.84, 0.82), 'cumulo', 14, {}),
    'dato':       (900, 860, (0.22, 0.30, 0.78, 0.76), 'cumulo', 15, {}),
    'etiqueta':   (720, 320, (0.15, 0.34, 0.85, 0.76), 'cumulo', 16, dict(margin=0.12, wisp=0.6)),
    'torre':      (900, 1250, (0.18, 0.60, 0.82, 0.90), 'torre', 17, {}),
    'estandarte': (1800, 640, (0.08, 0.34, 0.60, 0.74), 'estandarte', 18, dict(wisp=0.9)),
    'banco':      (2200, 600, (0.10, 0.46, 0.90, 0.84), 'cumulo', 19, dict(margin=0.09)),
}


def build(name, outdir, scale=1.0):
    if name == 'lenticular':
        im, pad = lenticular(int(1600 * scale), int(560 * scale), (0.22, 0.40, 0.78, 0.66))
    else:
        W, H, core, kind, seed, extra = TEMPLATES[name]
        W, H = int(W * scale), int(H * scale)
        pf = {'torre': torre_puffs, 'estandarte': estandarte_puffs}.get(kind)
        im, pad = render(W, H, core, kind if kind != 'estandarte' else 'cumulo', seed, puffs=pf, **extra)
    im.save(os.path.join(outdir, f'nube_{name}.webp'), 'WEBP', quality=88, method=6, exact=True)
    im.save(os.path.join(outdir, f'nube_{name}.png'))
    return {k: round(v, 4) for k, v in pad.items()} | dict(aspect=f'{im.width}/{im.height}')


if __name__ == '__main__' and sys.argv[1] != 'v5':
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    names = sys.argv[2:] or list(TEMPLATES) + ['lenticular']
    meta = {}
    for n in names:
        meta[n] = build(n, out)
        print(n, meta[n])
    p = os.path.join(out, 'plantillas.json')
    old = json.load(open(p)) if os.path.exists(p) else {}
    old.update(meta)
    json.dump(old, open(p, 'w'), indent=1)


# =============================================================== v2: volumétrica
def blob(D, xx, yy, cx, cy, r, w, sy=1.0):
    x0, x1 = int(max(cx - r - 2, 0)), int(min(cx + r + 2, D.shape[1]))
    y0, y1 = int(max(cy - r * sy - 2, 0)), int(min(cy + r * sy + 2, D.shape[0]))
    if x1 <= x0 or y1 <= y0:
        return
    d2 = ((xx[y0:y1, x0:x1] - cx) ** 2 + ((yy[y0:y1, x0:x1] - cy) / sy) ** 2) / (r * r)
    D[y0:y1, x0:x1] += w * np.clip(1 - d2, 0, 1) ** 2


def vol(W, H, core, seed=1, sun=(-0.52, -0.86), sigma=1.0, dens=1.0, tint='neutral', shape='cumulo',
        flat_base=True, wisp=0.6, lift=0.88):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    S = math.sqrt(W * H)
    x0, y0, x1, y1 = core[0] * W, core[1] * H, core[2] * W, core[3] * H
    cw, ch = x1 - x0, y1 - y0
    D = np.zeros((H, W), np.float32)
    # nivel 0: lóbulos grandes que cubren el núcleo
    n0 = max(3, int(cw / (0.55 * ch)) + 2)
    for i in range(n0):
        t = (i + 0.5) / n0
        cx = x0 + cw * t + rng.uniform(-0.08, 0.08) * cw / n0
        cy = y0 + ch * rng.uniform(0.40, 0.62)
        r = ch * rng.uniform(0.80, 1.05) + 0.12 * cw / n0
        blob(D, xx, yy, cx, cy, r, 1.0, 0.92)
    # nivel 1: cabezas de cúmulo sobre el borde superior y laterales
    def ring(level, count, rmin, rmax, w, top_bias):
        for _ in range(count):
            side = rng.random()
            if side < top_bias:      # arriba
                cx = x0 + cw * rng.uniform(-0.02, 1.02); cy = y0 + ch * rng.uniform(-0.05, 0.25)
            elif side < top_bias + (1 - top_bias) * 0.7:  # laterales
                left = rng.random() < 0.5
                cx = (x0 if left else x1) + cw * rng.uniform(-0.04, 0.04); cy = y0 + ch * rng.uniform(0.1, 0.85)
            else:                    # base
                cx = x0 + cw * rng.uniform(0.05, 0.95); cy = y1 + ch * rng.uniform(-0.12, 0.02)
            r = rng.uniform(rmin, rmax)
            blob(D, xx, yy, cx, cy, r, w * rng.uniform(0.7, 1.15), 0.95 if cy < y1 else 0.55)
    ring(1, 14, 0.18 * S, 0.30 * S, 0.85, 0.62)
    ring(2, 40, 0.07 * S, 0.14 * S, 0.65, 0.66)
    ring(3, 90, 0.025 * S, 0.06 * S, 0.45, 0.70)
    D = D / np.percentile(D[D > 0], 97)
    # base plana: los cúmulos se cortan abajo
    if flat_base:
        D *= smooth(y1 + 0.20 * ch + 0.04 * S, y1 - 0.05 * ch, yy + (fbm(H, W, 6, rng, 3) - 0.5) * 0.03 * S)
    # deformación + detalle de coliflor
    a = 0.018 * S
    dx = (fbm(H, W, 4.0, rng, 4) - 0.5) * 2 * a; dy = (fbm(H, W, 4.0, rng, 4) - 0.5) * 2 * a
    D = nd.map_coordinates(D, [yy + dy, xx + dx], order=1, mode='constant')
    bill = fbm(H, W, 7.0, rng, 5, turb=True)
    D = D * (0.55 + 0.9 * (1 - bill)) - 0.18 * bill * (1 - np.clip(D, 0, 1))
    D = np.clip(D, 0, None)
    # jirones: densidad fibrosa tenue fuera del borde
    if wisp > 0:
        fib = fbm(H, W, 2.0, rng, 6, sx=0.30, sy=2.8)
        near = nd.gaussian_filter((D > 0.08).astype(np.float32), 0.05 * S)
        D = D + wisp * 0.22 * smooth(0.55, 0.85, fib) * near * (D < 0.15)
    D = D * dens
    # opacidad por absorción
    alpha = 1 - np.exp(-D * 3.2)
    # luz: transmitancia hacia el sol (marcha en el plano) + ambiente
    Ds = nd.gaussian_filter(D, 0.004 * S)
    acc = np.zeros_like(D); step = 0.010 * S
    sx, sy = sun
    for i in range(1, 22):
        acc += nd.map_coordinates(Ds, [yy + sy * i * step, xx + sx * i * step], order=1, mode='constant')
    T = np.exp(-acc * sigma * 0.42)
    thin = np.exp(-Ds * 1.6)
    k = 0.30 + 0.62 * T + 0.20 * thin
    # caída de la base hacia gris azulado
    k -= 0.18 * smooth(y1 - 0.25 * ch, y1 + 0.15 * ch, yy) * (1 - thin)
    # núcleo legible
    sdc = rounded_box_sd(xx, yy, (x0, y0, x1, y1), 0.35 * min(cw, ch))
    core_m = smooth(0.02 * S, -0.06 * S, sdc)
    k = k * (1 - core_m) + np.maximum(k, lift + 0.05 * (fbm(H, W, 2.5, rng, 3) - 0.5)) * core_m
    alpha = np.maximum(alpha, core_m * 0.97)
    k = np.clip(k, 0, 1.05)
    pal = {'neutral': ((132, 146, 172), (206, 214, 228), (252, 252, 249)),
           'calido': ((150, 138, 168), (228, 210, 208), (255, 247, 238)),
           'noche': ((70, 82, 118), (156, 170, 202), (222, 228, 242))}[tint]
    c0, c1, c2 = [np.array(c, np.float32) for c in pal]
    kk = np.clip(k, 0, 1)[..., None]
    col = np.where(kk < 0.55, c0 + (c1 - c0) * (kk / 0.55), c1 + (c2 - c1) * ((kk - 0.55) / 0.45))
    col += rng.normal(0, 2.2, (H, W, 1)).astype(np.float32)
    rgba = np.dstack([np.clip(col, 0, 255), np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA'), dict(top=y0 / W, right=(W - x1) / W, bottom=(H - y1) / W, left=x0 / W)


# =============================================================== v3: masa fractal + superficie iluminada
def vol3(W, H, core, seed=1, light=(-0.50, -0.78, 0.62), tint='neutral', crown=0.55, base_cut=0.10,
         wisp=0.6, lift=0.6, detail=1.0, side_puffs=True, tower=0.0, stream=0.0):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    S = math.sqrt(W * H)
    x0, y0, x1, y1 = core[0] * W, core[1] * H, core[2] * W, core[3] * H
    cw, ch = x1 - x0, y1 - y0
    cy0 = (y0 + y1) / 2
    D = np.zeros((H, W), np.float32)
    # cuerpo: lóbulos grandes a lo largo del eje que cubren el núcleo con holgura
    rb = 0.64 * ch + 0.05 * cw
    n = max(2, int(math.ceil(cw / (0.75 * rb))) + 1)
    for i in range(n):
        t = i / (n - 1)
        blob(D, xx, yy, x0 + cw * t + rng.uniform(-0.1, 0.1) * rb, cy0 + rng.uniform(-0.06, 0.06) * ch,
             rb * rng.uniform(0.95, 1.12), 1.25, 0.95)
    # corona: copos que asoman por arriba, de tamaño desigual
    m = max(3, int(cw / (0.42 * ch + 0.08 * cw)) + 2)
    xs = np.sort(rng.uniform(x0 - 0.04 * cw, x1 + 0.04 * cw, m))
    for cx in xs:
        r = ch * rng.uniform(0.22, 0.55) * (crown / 0.55)
        cy = y0 + ch * rng.uniform(-0.05, 0.18) - r * 0.25
        blob(D, xx, yy, cx, cy, r, rng.uniform(0.9, 1.3))
        for _ in range(rng.integers(2, 5)):      # copos secundarios sobre la superficie
            a = rng.uniform(-math.pi * 0.95, -math.pi * 0.05)
            rr = r * rng.uniform(0.32, 0.55)
            blob(D, xx, yy, cx + math.cos(a) * r * 0.78, cy + math.sin(a) * r * 0.78, rr, rng.uniform(0.7, 1.0))
            for _ in range(rng.integers(1, 3)):  # y terciarios
                b = a + rng.uniform(-0.8, 0.8); r3 = rr * rng.uniform(0.35, 0.55)
                blob(D, xx, yy, cx + math.cos(a) * r * 0.78 + math.cos(b) * rr * 0.8,
                     cy + math.sin(a) * r * 0.78 + math.sin(b) * rr * 0.8, r3, rng.uniform(0.5, 0.8))
    if side_puffs:
        for side in (x0, x1):
            for _ in range(3):
                r = ch * rng.uniform(0.22, 0.40)
                blob(D, xx, yy, side + (r * rng.uniform(0.0, 0.35)) * (-1 if side == x0 else 1),
                     y0 + ch * rng.uniform(0.15, 0.85), r, rng.uniform(0.7, 1.0))
    if tower > 0:   # cúmulo congestus encima del núcleo
        cxm = (x0 + x1) / 2; top = 0.06 * H
        for i in range(10):
            t = i / 9
            y = y0 - (y0 - top - 0.12 * H) * t
            r = (0.30 - 0.14 * t) * W * tower * rng.uniform(0.9, 1.1)
            blob(D, xx, yy, cxm + rng.uniform(-0.12, 0.12) * W * (1 - 0.5 * t), y, r, 1.1)
            for _ in range(3):
                a = rng.uniform(-math.pi, 0); rr = r * rng.uniform(0.35, 0.55)
                blob(D, xx, yy, cxm + math.cos(a) * r * 0.85, y + math.sin(a) * r * 0.85, rr, 0.8)
    if stream > 0:  # nube-bandera: se estira a la derecha
        for i in range(26):
            t = i / 25
            cx = x1 + (W * 0.97 - x1) * t
            r = ch * (0.55 - 0.42 * t) * rng.uniform(0.8, 1.15)
            blob(D, xx, yy, cx, cy0 + rng.uniform(-0.15, 0.1) * ch, r, 0.9 * (1 - 0.6 * t), 0.55)
    # base plana algo irregular
    if base_cut is not None:
        D *= smooth(y1 + base_cut * ch + 0.035 * S, y1 + (base_cut - 0.18) * ch,
                    yy + (fbm(H, W, 5, rng, 3) - 0.5) * 0.05 * S)
    # deformación de dominio
    a = 0.016 * S
    dx = (fbm(H, W, 3.5, rng, 4) - 0.5) * 2 * a; dy = (fbm(H, W, 3.5, rng, 4) - 0.5) * 2 * a
    D = nd.map_coordinates(D, [yy + dy, xx + dx], order=1, mode='constant')
    # detalle de coliflor: erosión fuerte en el borde, suave dentro
    bill = fbm(H, W, 8.0, rng, 5, turb=True)
    fine = fbm(H, W, 22.0, rng, 3, turb=True)
    edge_w = 1 - smooth(0.15, 0.9, D)
    D = D - detail * edge_w * (0.42 * bill + 0.16 * fine) + detail * 0.10 * (0.5 - bill) * (1 - edge_w)
    D = np.clip(D, 0, None)
    # jirones tenues
    if wisp > 0:
        fib = fbm(H, W, 2.2, rng, 6, sx=0.28, sy=3.0)
        near = nd.gaussian_filter((D > 0.12).astype(np.float32), 0.045 * S)
        D = D + wisp * 0.16 * smooth(0.52, 0.86, fib) * near * smooth(0.25, 0.0, D)
    alpha = 1 - np.exp(-D * 4.2)
    # superficie: altura = espesor suavizado + relieve de coliflor
    Hh = nd.gaussian_filter(D, 0.006 * S) + 0.06 * (1 - bill) * smooth(0.05, 0.4, D)
    gy, gx = np.gradient(Hh)
    s = 0.42 * S
    nx, ny, nz = -gx * s, -gy * s, np.ones_like(gx)
    nn = np.sqrt(nx * nx + ny * ny + nz * nz)
    L = np.array(light, np.float32); L /= np.linalg.norm(L)
    diff = np.clip((nx * L[0] + ny * L[1] + nz * L[2]) / nn, 0, 1)
    # sombras de grieta (alcance corto)
    occ = np.zeros_like(D); st = 0.008 * S
    for i in range(1, 9):
        t = i * st
        hs = nd.map_coordinates(Hh, [yy + L[1] * t / math.hypot(L[0], L[1]), xx + L[0] * t / math.hypot(L[0], L[1])],
                                order=1, mode='constant')
        occ = np.maximum(occ, (hs - Hh) / (t / S * 1.0 + 1e-3))
    shadow = np.exp(-np.clip(occ, 0, None) * 0.010)
    thin = np.exp(-D * 2.0)
    k = 0.30 + 0.70 * diff * shadow + 0.12 * thin * smooth(0.0, 0.6, diff)
    k -= 0.20 * smooth(y1 - 0.15 * ch, y1 + 0.25 * ch, yy) * (1 - thin)      # base en sombra
    # legibilidad: aclarar suavemente la cara donde va el texto (sin bordes visibles)
    cm = np.zeros((H, W), np.float32)
    cm[int(y0):int(y1), int(x0):int(x1)] = 1
    cm = nd.gaussian_filter(cm, 0.05 * S) * smooth(0.3, 0.9, D)
    k = k + (np.maximum(k, 0.90) - k) * np.clip(cm * 1.6, 0, 1) * lift
    k = np.clip(k, 0, 1)
    pal = {'neutral': ((128, 142, 170), (204, 212, 226), (252, 252, 250)),
           'calido': ((146, 132, 160), (226, 206, 204), (255, 246, 236)),
           'noche': ((64, 76, 112), (150, 164, 198), (222, 228, 242))}[tint]
    c0, c1, c2 = [np.array(c, np.float32) for c in pal]
    kk = k[..., None]
    col = np.where(kk < 0.55, c0 + (c1 - c0) * (kk / 0.55), c1 + (c2 - c1) * ((kk - 0.55) / 0.45))
    col += rng.normal(0, 2.0, (H, W, 1)).astype(np.float32)
    rgba = np.dstack([np.clip(col, 0, 255), np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA'), dict(top=y0 / W, right=(W - x1) / W, bottom=(H - y1) / W, left=x0 / W)


# =============================================================== v4: fbm deformado + luz direccional
_GRIDS = {}
def _grid(seed):
    if seed not in _GRIDS:
        _GRIDS[seed] = np.random.default_rng(seed).random((515, 515)).astype(np.float32)
    return _GRIDS[seed]


def fbmc(xc, yc, scale, octaves, seed, turb=False, gain=0.5, lac=2.07):
    acc = np.zeros(xc.shape, np.float32); amp = 1.0; tot = 0.0; sc = scale
    g = _grid(seed)
    for o in range(octaves):
        n = nd.map_coordinates(g, [(yc / sc + o * 37.3) % 512, (xc / sc + o * 91.7) % 512], order=3, mode='wrap')
        if turb:
            n = 1 - np.abs(2 * n - 1)
        acc += amp * n; tot += amp; amp *= gain; sc /= lac
    return acc / tot


def shape_field(W, H, core, rng, crown=0.55, side_puffs=True, tower=0.0, stream=0.0, base_cut=0.10):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    S = math.sqrt(W * H)
    x0, y0, x1, y1 = core[0] * W, core[1] * H, core[2] * W, core[3] * H
    cw, ch = x1 - x0, y1 - y0; cy0 = (y0 + y1) / 2
    D = np.zeros((H, W), np.float32)
    rb = 0.66 * ch + 0.05 * cw
    n = max(2, int(math.ceil(cw / (0.7 * rb))) + 1)
    for i in range(n):
        t = i / (n - 1)
        blob(D, xx, yy, x0 + cw * t + rng.uniform(-0.1, 0.1) * rb, cy0, rb * rng.uniform(1.0, 1.12), 1.3, 0.95)
    m = max(3, int(cw / (0.45 * ch + 0.08 * cw)) + 2)
    for cx in np.sort(rng.uniform(x0 - 0.02 * cw, x1 + 0.02 * cw, m)):
        r = ch * rng.uniform(0.25, 0.58) * (crown / 0.55)
        cy = y0 + ch * rng.uniform(-0.02, 0.18) - r * 0.30
        blob(D, xx, yy, cx, cy, r, rng.uniform(1.0, 1.3))
        for _ in range(rng.integers(1, 4)):
            a = rng.uniform(-math.pi * 0.9, -math.pi * 0.1); rr = r * rng.uniform(0.35, 0.6)
            blob(D, xx, yy, cx + math.cos(a) * r * 0.75, cy + math.sin(a) * r * 0.75, rr, rng.uniform(0.7, 1.0))
    if side_puffs:
        for side in (x0, x1):
            for _ in range(2):
                r = ch * rng.uniform(0.25, 0.42)
                blob(D, xx, yy, side + r * rng.uniform(0.0, 0.3) * (-1 if side == x0 else 1),
                     y0 + ch * rng.uniform(0.2, 0.8), r, rng.uniform(0.8, 1.0))
    if tower > 0:
        cxm = (x0 + x1) / 2
        for i in range(9):
            t = i / 8
            y = y0 - (y0 - 0.20 * H) * t
            r = (0.30 - 0.12 * t) * W * tower * rng.uniform(0.9, 1.1)
            blob(D, xx, yy, cxm + rng.uniform(-0.10, 0.10) * W * (1 - 0.5 * t), y, r, 1.2)
            for _ in range(2):
                a = rng.uniform(-math.pi, 0); rr = r * rng.uniform(0.4, 0.6)
                blob(D, xx, yy, cxm + math.cos(a) * r * 0.8, y + math.sin(a) * r * 0.8, rr, 0.9)
    if stream > 0:
        for i in range(30):
            t = i / 29
            cx = x1 - 0.05 * cw + (W * 0.98 - x1) * t
            r = ch * (0.62 - 0.48 * t) * rng.uniform(0.85, 1.1)
            blob(D, xx, yy, cx, cy0 + 0.05 * ch + rng.uniform(-0.12, 0.08) * ch, r, 1.0 * (1 - 0.55 * t), 0.6)
    if base_cut is not None:
        D *= smooth(y1 + base_cut * ch + 0.04 * S, y1 + (base_cut - 0.2) * ch, yy)
    return D, (x0, y0, x1, y1)


def vol4(W, H, core, seed=1, light=(-0.55, -0.83), tint='neutral', noise=1.0, crown=0.55, side_puffs=True,
         tower=0.0, stream=0.0, base_cut=0.10, lift=0.75, wispy=0.5, grain=2.0, calm=0.65):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    S = math.sqrt(W * H)
    Df, (x0, y0, x1, y1) = shape_field(W, H, core, rng, crown, side_puffs, tower, stream, base_cut)
    cw, ch = x1 - x0, y1 - y0
    Df = nd.gaussian_filter(Df, 0.008 * S)
    Df = Df / max(np.percentile(Df, 99.5), 1e-3)
    # zona tranquila donde irá el texto (menos turbulencia)
    cm = np.zeros((H, W), np.float32); cm[int(y0):int(y1), int(x0):int(x1)] = 1
    cm = nd.gaussian_filter(cm, 0.06 * S)
    # fbm con deformación de dominio
    sc = 0.30 * S
    wx = fbmc(xx, yy, sc, 4, seed + 1) - 0.5; wy = fbmc(xx + 311, yy, sc, 4, seed + 2) - 0.5
    qx, qy = xx + 0.10 * S * wx, yy + 0.10 * S * wy
    N = fbmc(qx, qy, 0.16 * S, 6, seed + 3, turb=True, gain=0.52)
    Nf = fbmc(qx * 1.0, qy * 1.0, 0.035 * S, 4, seed + 4)
    amp = noise * (1 - calm * np.clip(cm * 1.4, 0, 1))
    d = Df * 1.35 - 0.38 + amp * (0.85 * (N - 0.62) + 0.25 * (Nf - 0.5))
    # jirones: fibras estiradas en el borde
    if wispy > 0:
        fib = fbmc(xx * 0.35, yy * 2.6, 0.06 * S, 5, seed + 5)
        ring = smooth(0.05, 0.45, Df) * smooth(0.75, 0.30, Df)
        d = np.maximum(d, wispy * 0.30 * smooth(0.55, 0.85, fib) * ring)
    dens = np.clip(d, 0, None)
    alpha = 1 - np.exp(-dens * 6.0)
    # luz: diferencia de densidad hacia el sol a dos escalas + transmitancia
    lx, ly = light; ln = math.hypot(lx, ly); lx, ly = lx / ln, ly / ln
    def towards(t):
        return nd.map_coordinates(dens, [yy + ly * t, xx + lx * t], order=1, mode='constant')
    det = np.clip(0.5 + (dens - towards(0.006 * S)) * 2.2, 0, 1)
    mac = np.clip(0.5 + (dens - towards(0.035 * S)) * 0.9, 0, 1)
    acc = np.zeros_like(dens)
    for i in range(1, 14):
        acc += towards(i * 0.018 * S)
    T = np.exp(-acc * 0.16)
    k = 0.18 + 0.30 * det + 0.22 * mac + 0.42 * T
    k += 0.18 * np.exp(-dens * 3.0) * smooth(0.4, 0.9, det)          # bordes finos al sol: ribete claro
    k -= 0.16 * smooth(y1 - 0.2 * ch, y1 + 0.25 * ch, yy) * (1 - np.exp(-dens * 2))   # base gris
    # legibilidad: la cara del texto se aclara sin bordes duros
    lm = np.clip(cm * 1.5, 0, 1) * smooth(0.25, 0.8, dens)
    k = k + (np.maximum(k, 0.92) - k) * lm * lift
    k = np.clip(k, 0, 1)
    pal = {'neutral': ((120, 134, 162), (200, 209, 224), (253, 253, 251)),
           'calido': ((140, 126, 156), (224, 204, 202), (255, 246, 236)),
           'noche': ((60, 72, 108), (146, 160, 196), (222, 228, 242))}[tint]
    c0, c1, c2 = [np.array(c, np.float32) for c in pal]
    kk = k[..., None]
    col = np.where(kk < 0.55, c0 + (c1 - c0) * (kk / 0.55), c1 + (c2 - c1) * ((kk - 0.55) / 0.45))
    col += rng.normal(0, grain, (H, W, 1)).astype(np.float32)
    rgba = np.dstack([np.clip(col, 0, 255), np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA'), dict(top=y0 / W, right=(W - x1) / W, bottom=(H - y1) / W, left=x0 / W)


# =============================================================== v5: forma general con holguras + catálogo
def shape_field2(W, H, core, rng, crown=0.55, sides=True, tower=0.0, stream=0.0, base_cut=0.10, lens=False):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    S = math.sqrt(W * H)
    x0, y0, x1, y1 = core[0] * W, core[1] * H, core[2] * W, core[3] * H
    cw, ch = x1 - x0, y1 - y0; cx0, cy0 = (x0 + x1) / 2, (y0 + y1) / 2
    D = np.zeros((H, W), np.float32)
    if lens:
        for dy, rx, ry, w in ((0.0, 0.62, 0.62, 1.4), (-0.55, 0.50, 0.42, 1.0), (-0.95, 0.36, 0.30, 0.8), (0.45, 0.52, 0.36, 0.9)):
            ex = (xx - cx0) / (rx * cw); ey = (yy - (cy0 + dy * ch)) / (ry * ch)
            D += w * np.clip(1 - ex * ex - ey * ey, 0, 1) ** 1.5
        return D, (x0, y0, x1, y1)
    short, long_ = min(cw, ch), max(cw, ch)
    rb = 0.70 * short + 0.04 * long_
    rb = min(rb, cx0 - 0.075 * W, 0.925 * W - cx0, (cy0 - 0.07 * H) / 0.95, (0.93 * H - cy0) / 0.95) if cw < ch else \
         min(rb, (cy0 - 0.07 * H) / 0.95, (0.93 * H - cy0) / 0.95 + 0.15 * ch)
    inset = 0.24 * rb
    n = max(2, int(math.ceil((long_ - 2 * inset) / (0.7 * rb))) + 1)
    for i in range(n):
        t = i / (n - 1)
        if cw >= ch:
            cx, cy = x0 + inset + (cw - 2 * inset) * t, cy0
        else:
            cx, cy = cx0, y0 + inset + (ch - 2 * inset) * t
        blob(D, xx, yy, cx + rng.uniform(-0.06, 0.06) * rb, cy + rng.uniform(-0.05, 0.05) * rb,
             rb * rng.uniform(1.0, 1.1), 1.3, 0.95)
    room_top = y0 - 0.05 * H
    m = max(3, int(cw / (0.30 * short + 0.08 * cw)) + 2)
    for cx in np.sort(rng.uniform(x0 + 0.02 * cw, x1 - 0.02 * cw, m)):
        cy_off = short * rng.uniform(0.0, 0.16)
        r = min(short * rng.uniform(0.28, 0.62) * (crown / 0.55), (y0 + cy_off - 0.07 * H) / 1.75)
        cy = y0 + cy_off - r * 0.30
        blob(D, xx, yy, cx, cy, r, rng.uniform(1.0, 1.3))
        for _ in range(rng.integers(1, 4)):
            a = rng.uniform(-math.pi * 0.9, -math.pi * 0.1); rr = r * rng.uniform(0.35, 0.6)
            blob(D, xx, yy, cx + math.cos(a) * r * 0.75, cy + math.sin(a) * r * 0.75, rr, rng.uniform(0.7, 1.0))
    if sides:
        for side in (x0, x1):
            room = (side - 0.05 * W) if side == x0 else (0.95 * W - side)
            k_ = max(2, int(ch / (0.5 * short)))
            for j in range(k_):
                r = min(short * rng.uniform(0.26, 0.42), room / 1.2 + 0.25 * short)
                blob(D, xx, yy, side + r * rng.uniform(-0.2, 0.15) * (-1 if side == x0 else 1),
                     y0 + ch * (j + rng.uniform(0.3, 0.7)) / k_, r, rng.uniform(0.85, 1.05))
    if tower > 0:
        for i in range(10):
            t = i / 9
            y = y0 - (y0 - 0.22 * H) * t
            r = (0.27 - 0.11 * t) * W * tower * rng.uniform(0.9, 1.08)
            blob(D, xx, yy, cx0 + rng.uniform(-0.08, 0.08) * W * (1 - 0.5 * t), y, r, 1.2)
            for _ in range(2):
                a = rng.uniform(-math.pi, 0); rr = r * rng.uniform(0.4, 0.6)
                blob(D, xx, yy, cx0 + math.cos(a) * r * 0.8, y + math.sin(a) * r * 0.8, rr, 0.9)
    if stream > 0:
        for i in range(30):
            t = i / 29
            cx = x1 - 0.1 * cw + (W * 0.93 - x1) * t
            r = ch * (0.62 - 0.50 * t) * rng.uniform(0.85, 1.1)
            blob(D, xx, yy, cx, cy0 + 0.05 * ch + rng.uniform(-0.12, 0.08) * ch, r, 1.0 * (1 - 0.6 * t), 0.6)
    if base_cut is not None:
        D *= smooth(y1 + base_cut * ch + 0.04 * S, y1 + (base_cut - 0.2) * ch, yy)
    border = np.minimum(np.minimum(xx, W - 1 - xx), np.minimum(yy, H - 1 - yy))
    D *= smooth(0.0, 0.07 * S, border)
    return D, (x0, y0, x1, y1)


def vol5(W, H, core, seed=1, light=(-0.55, -0.83), noise=1.0, lift=0.7, wispy=0.5, grain=2.0, calm=0.42,
         contrast=1.0, lens=False, **shape):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    S = math.sqrt(W * H)
    Df, (x0, y0, x1, y1) = shape_field2(W, H, core, rng, lens=lens, **shape)
    cw, ch = x1 - x0, y1 - y0
    Df = nd.gaussian_filter(Df, 0.008 * S)
    inside = (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1)
    Df = Df / max(float(np.median(Df[inside])), 1e-3)
    cm = np.zeros((H, W), np.float32); cm[int(y0):int(y1), int(x0):int(x1)] = 1
    cm = nd.gaussian_filter(cm, 0.05 * S)
    sc = 0.30 * S
    wx = fbmc(xx, yy, sc, 4, seed + 1) - 0.5; wy = fbmc(xx + 311, yy, sc, 4, seed + 2) - 0.5
    qx, qy = xx + 0.10 * S * wx, yy + 0.10 * S * wy
    # garantía de legibilidad: el área de texto queda dentro de un cuerpo denso, redondeado y deformado
    e = 0.040 * S
    sdc = rounded_box_sd(xx + 0.025 * S * wx, yy + 0.025 * S * wy, (x0 - e, y0 - 0.6 * e, x1 + e, y1 + 0.6 * e),
                         0.14 * min(x1 - x0, y1 - y0) + e)   # esquinas casi rectas: las esquinas del texto quedan en lo denso
    Df = np.maximum(Df, 1.0 * smooth(0.065 * S, -0.035 * S, sdc))
    if lens:   # lenticular: estrías horizontales, sin coliflor
        N = fbmc(qx * 0.25, qy * 3.0, 0.10 * S, 6, seed + 3)
        Nf = fbmc(qx * 0.2, qy * 4.0, 0.03 * S, 4, seed + 4)
    else:
        N = fbmc(qx, qy, 0.15 * S, 6, seed + 3, turb=True, gain=0.52)
        Nf = fbmc(qx, qy, 0.032 * S, 4, seed + 4)
    amp = noise * (1 - calm * np.clip(cm * 1.4, 0, 1))
    d = Df * 1.35 - 0.38 + amp * (0.85 * (N - 0.62) + 0.25 * (Nf - 0.5))
    if wispy > 0:
        fib = fbmc(xx * 0.35, yy * 2.6, 0.06 * S, 5, seed + 5)
        ring = smooth(0.04, 0.40, Df) * smooth(0.75, 0.30, Df)
        d = np.maximum(d, wispy * 0.30 * smooth(0.55, 0.85, fib) * ring)
    dens = np.clip(d, 0, None)
    alpha = 1 - np.exp(-dens * 6.0)
    lx, ly = light; ln = math.hypot(lx, ly); lx, ly = lx / ln, ly / ln
    def towards(t):
        return nd.map_coordinates(dens, [yy + ly * t, xx + lx * t], order=1, mode='constant')
    det = np.clip(0.5 + (dens - towards(0.006 * S)) * 2.6 * contrast, 0, 1)
    mac = np.clip(0.5 + (dens - towards(0.035 * S)) * 1.1 * contrast, 0, 1)
    acc = np.zeros_like(dens)
    for i in range(1, 8):
        acc += towards(i * 0.016 * S)
    T = np.exp(-acc * 0.22)
    # cara frontal iluminada; el relieve de los copos sale del gradiente hacia el sol
    k = 0.80 + 0.50 * (det - 0.5) * contrast + 0.62 * (mac - 0.5) * contrast + 0.12 * (T - 0.5)
    k += 0.12 * np.exp(-dens * 3.0) * smooth(0.45, 0.9, det)                       # ribete al sol
    k -= 0.20 * smooth(y1 - 0.15 * ch, y1 + 0.25 * ch, yy) * (1 - np.exp(-dens * 2))  # base en sombra
    lm = np.clip(cm * 1.5, 0, 1) * smooth(0.25, 0.8, dens)
    k = k + (1.0 - k) * lm * lift * 0.55
    k = k + (np.maximum(k, 0.885) - k) * smooth(0.15, 0.85, lm)   # cara del texto casi blanca: contraste con pizarra > 9:1
    k = np.clip(k, 0, 1)
    c0, c1, c2 = [np.array(c, np.float32) for c in ((116, 130, 158), (196, 205, 220), (253, 253, 251))]
    kk = k[..., None]
    col = np.where(kk < 0.5, c0 + (c1 - c0) * (kk / 0.5), c1 + (c2 - c1) * np.clip((kk - 0.5) / 0.42, 0, 1))
    col += rng.normal(0, grain, (H, W, 1)).astype(np.float32)
    rgba = np.dstack([np.clip(col, 0, 255), np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA'), dict(top=y0 / W, right=(W - x1) / W, bottom=(H - y1) / W, left=x0 / W)


CATALOGO = {
    'hero':       dict(W=1700, H=780, core=(0.19, 0.49, 0.81, 0.83), seed=51),
    'bloque':     dict(W=1800, H=1140, core=(0.155, 0.35, 0.845, 0.79), seed=52),
    'movil':      dict(W=1200, H=1900, core=(0.18, 0.27, 0.82, 0.84), seed=53, crown=0.75),
    'tarjeta':    dict(W=1150, H=1150, core=(0.19, 0.35, 0.81, 0.79), seed=54),
    'dato':       dict(W=940, H=900, core=(0.26, 0.38, 0.74, 0.72), seed=55, crown=0.7),
    'etiqueta':   dict(W=800, H=360, core=(0.19, 0.40, 0.81, 0.72), seed=56, crown=0.35, wispy=0.9, sides=False),
    'torre':      dict(W=1000, H=1400, core=(0.19, 0.64, 0.81, 0.88), seed=57, tower=1.0),
    'lenticular': dict(W=1700, H=620, core=(0.24, 0.44, 0.76, 0.66), seed=58, lens=True, noise=0.55, calm=0.5, wispy=0.3),
    'estandarte': dict(W=1900, H=680, core=(0.07, 0.38, 0.55, 0.76), seed=59, stream=1.0, sides=False),
    'banco':      dict(W=2400, H=660, core=(0.10, 0.52, 0.90, 0.84), seed=60, crown=0.45),
}


def build5(name, outdir):
    p = dict(CATALOGO[name]); W, H, core, seed = p.pop('W'), p.pop('H'), p.pop('core'), p.pop('seed')
    im, pad = vol5(W, H, core, seed, **p)
    im.save(os.path.join(outdir, f'nube_{name}.webp'), 'WEBP', quality=86, method=6, exact=True)
    return {k: round(v, 4) for k, v in pad.items()} | dict(aspect=f'{W}/{H}')


if __name__ == '__main__' and len(sys.argv) > 1 and sys.argv[1] == 'v5':
    out = sys.argv[2]; os.makedirs(out, exist_ok=True)
    names = sys.argv[3:] or list(CATALOGO)
    meta = {}
    for n in names:
        meta[n] = build5(n, out); print(n, meta[n], flush=True)
    p = os.path.join(out, 'plantillas.json')
    old = json.load(open(p)) if os.path.exists(p) else {}
    old.update(meta); json.dump(old, open(p, 'w'), indent=1)
