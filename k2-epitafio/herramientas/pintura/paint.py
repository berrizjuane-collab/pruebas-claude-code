"""paint.py — motor "pincel seco sobre fondo oscuro" (README §1, §3, §4, §5.4, §6, §7)."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

F32 = np.float32


# ---------------------------------------------------------------- funciones base (§1.3)
def smooth(a, b, x):
    t = np.clip((np.asarray(x, F32) - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    return a + (b - a) * t


def mixc(A, color, alpha):
    c = np.asarray(color, F32)
    return A + (c - A) * np.asarray(alpha, F32)[..., None]


def ridged(n):
    return 1 - np.abs(2 * n - 1)


def lum(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def blur(a, sig):
    if a.ndim == 3:
        return np.stack([ndi.gaussian_filter(a[..., i], sig) for i in range(a.shape[2])], -1)
    return ndi.gaussian_filter(a, sig)


def ramp(stops, t):
    """Degradado por tramos. stops = [(t, (r,g,b)), ...]"""
    ts = np.array([s[0] for s in stops], F32)
    cs = np.array([s[1] for s in stops], F32)
    return np.stack([np.interp(t, ts, cs[:, i]) for i in range(3)], -1).astype(F32)


class Ctx:
    """Contexto de imagen: tamaño, unidad U (§1.1) y ruido de valor (§1.3)."""

    def __init__(self, W, H, seed=1):
        self.W, self.H = W, H
        self.unit = float(np.sqrt(W * H))
        self.U = self.unit / 1946.0
        self.rng = np.random.default_rng(seed)

    def vnoise(self, f, sx=1.0, sy=1.0):
        W, H = self.W, self.H
        cx = self.unit / (f * sx)
        cy = self.unit / (f * sy)
        gw = int(np.ceil(W / cx)) + 3
        gh = int(np.ceil(H / cy)) + 3
        g = self.rng.random((gh, gw)).astype(F32)
        im = Image.fromarray(g, 'F').resize((max(W, int(round(gw * cx))), max(H, int(round(gh * cy)))), Image.BICUBIC)
        a = np.asarray(im, F32)
        oy = (a.shape[0] - H) // 2
        ox = (a.shape[1] - W) // 2
        return a[oy:oy + H, ox:ox + W]

    def fbm(self, f, octv=4, sx=1.0, sy=1.0, kind=None):
        tot = np.zeros((self.H, self.W), F32)
        amp, norm = 1.0, 0.0
        for i in range(octv):
            n = np.clip(self.vnoise(f * 2 ** i, sx, sy), 0, 1)
            if kind == 'ridged':
                n = ridged(n)
            elif kind == 'billow':
                n = np.abs(2 * n - 1)
            tot += amp * n
            norm += amp
            amp *= 0.5
        return np.clip(tot / norm, 0, 1)

    def normal(self, sig):
        return ndi.gaussian_filter(self.rng.standard_normal((self.H, self.W)).astype(F32), sig)


# ---------------------------------------------------------------- regiones (§2)
#            cielo  nube  montaña  roca   lejano cercano
REGLEN = np.array([8.0, 3.0, 4.5, 4.0, 4.0, 4.0], F32)
REGDIR = np.array([-0.30, 0.0, np.pi / 2, 0.5, -0.12, -0.12], F32)
W_TIZA = np.array([0.58, 0.36, 0.40, 0.36, 0.28, 0.22], F32)
W_GAP = np.array([0.34, 0.20, 0.30, 0.34, 0.32, 0.28], F32)


# ---------------------------------------------------------------- orientación (§3)
def orientation(ctx, T, reg, dir_override=None):
    U = ctx.U
    l = ndi.gaussian_filter(lum(T), 1.6 * U)
    gy, gx = np.gradient(l)
    Jxx = ndi.gaussian_filter(gx * gx, 4 * U)
    Jyy = ndi.gaussian_filter(gy * gy, 4 * U)
    Jxy = ndi.gaussian_filter(gx * gy, 4 * U)
    ang = 0.5 * np.arctan2(2 * Jxy, Jxx - Jyy) + np.pi / 2
    en = np.sqrt(Jxx + Jyy)
    thr = np.where(reg == 0, 2.6 / U, 1.3 / U)
    default = REGDIR[reg] + (ctx.fbm(3, 3) - 0.5) * 0.9
    swirl = ctx.fbm(4, 2) * 7.0
    default = np.where(reg == 1, swirl, default)
    if dir_override is not None:
        ok = np.isfinite(dir_override)
        default = np.where(ok, np.nan_to_num(dir_override) + (ctx.fbm(5, 2) - 0.5) * 0.5, default)
    return np.where(en > thr, ang, default).astype(F32)


# ---------------------------------------------------------------- pintor (§4)
PASSES = [(34, 72, None), (17, 62, 14), (8.5, 52, 13), (4.6, 46, 12.5), (3.0, 40, 13)]


def stroke_pass(ctx, canvas, T, reg, theta, wU, tol, thr, SS, seedmask=None, length=None):
    rng = ctx.rng
    H, W = reg.shape
    w = wU * ctx.U
    cell = 0.74 * w
    nxs, nys = int(np.ceil(W / cell)), int(np.ceil(H / cell))
    gx, gy = np.meshgrid(np.arange(nxs, dtype=F32), np.arange(nys, dtype=F32))
    px = ((gx + rng.random(gx.shape)) * cell).ravel()
    py = ((gy + rng.random(gy.shape)) * cell).ravel()
    keep = (px < W) & (py < H)
    ix = np.clip(px.astype(int), 0, W - 1)
    iy = np.clip(py.astype(int), 0, H - 1)
    if thr is not None:
        small = np.asarray(canvas.reduce(SS) if SS > 1 else canvas, F32)
        err = np.abs(small - T).mean(2)
        err = ndi.uniform_filter(err, size=max(1, int(round(cell))))
        keep &= err[iy, ix] > thr
    if seedmask is not None:
        keep &= seedmask[iy, ix]
    px, py, ix, iy = px[keep], py[keep], ix[keep], iy[keep]
    n = len(px)
    if n == 0:
        return 0
    perm = rng.permutation(n)
    px, py, ix, iy = px[perm], py[perm], ix[perm], iy[perm]
    c0 = T[iy, ix]
    col = c0 + rng.normal(0, 8, (n, 1)) + rng.normal(0, 4.5, (n, 3))
    L = REGLEN[reg[iy, ix]] if length is None else np.full(n, length, F32)
    maxs = np.maximum(1, np.round(L / 0.7 * rng.uniform(0.6, 1.25, n))).astype(int)
    S = int(maxs.max())
    P = np.empty((n, S + 1, 2), F32)
    P[:, 0, 0], P[:, 0, 1] = px, py
    cnt = np.ones(n, int)
    th = theta[iy, ix]
    sgn = rng.choice(np.array([-1.0, 1.0], F32), n)
    dx, dy = np.cos(th) * sgn, np.sin(th) * sgn
    alive = np.ones(n, bool)
    x, y = px.copy(), py.copy()
    step = 0.7 * w
    for k in range(1, S + 1):
        alive &= (k <= maxs)
        idx = np.nonzero(alive)[0]
        if len(idx) == 0:
            break
        xn, yn = x[idx] + dx[idx] * step, y[idx] + dy[idx] * step
        inside = (xn >= 0) & (xn < W) & (yn >= 0) & (yn < H)
        jx = np.clip(xn.astype(int), 0, W - 1)
        jy = np.clip(yn.astype(int), 0, H - 1)
        ok = inside & (np.abs(T[jy, jx] - c0[idx]).sum(1) < tol)
        alive[idx[~ok]] = False
        idx, xn, yn, jx, jy = idx[ok], xn[ok], yn[ok], jx[ok], jy[ok]
        x[idx], y[idx] = xn, yn
        P[idx, k, 0], P[idx, k, 1] = xn, yn
        cnt[idx] = k + 1
        t2 = theta[jy, jx]
        ndx, ndy = np.cos(t2), np.sin(t2)
        flip = (ndx * dx[idx] + ndy * dy[idx]) < 0
        ndx[flip] *= -1
        ndy[flip] *= -1
        dx[idx], dy[idx] = ndx, ndy
    # --- dibujo
    d = ImageDraw.Draw(canvas)
    wp = w * SS
    wi = max(1, int(round(wp)))
    r = wp / 2
    nb = 3 if wp >= 14 else 2 if wp >= 7 else 1 if wp >= 4 else 0
    bw = max(1, int(round(0.17 * wp)))
    P *= SS
    colu = np.clip(col, 0, 255).astype(np.uint8)
    boff = rng.uniform(-0.40, 0.40, (n, 3)) * wp
    bcol = rng.uniform(-16, 16, (n, 3))
    CH = 20000
    for a in range(0, n, CH):
        b = min(n, a + CH)
        Pl = P[a:b]
        cl = [tuple(c) for c in colu[a:b].tolist()]
        for i in range(b - a):
            c = int(cnt[a + i])
            pts = Pl[i, :c]
            fill = cl[i]
            x0, y0 = float(pts[0, 0]), float(pts[0, 1])
            if c == 1:
                d.ellipse((x0 - r, y0 - r, x0 + r, y0 + r), fill=fill)
                continue
            flat = pts.ravel().tolist()
            d.line(flat, fill=fill, width=wi, joint='curve')
            x1, y1 = flat[-2], flat[-1]
            if wp >= 4:
                d.ellipse((x0 - r, y0 - r, x0 + r, y0 + r), fill=fill)
                d.ellipse((x1 - r, y1 - r, x1 + r, y1 + r), fill=fill)
            if nb:
                vx, vy = x1 - x0, y1 - y0
                m = (vx * vx + vy * vy) ** 0.5 + 1e-6
                nx_, ny_ = -vy / m, vx / m
                for q in range(nb):
                    o = boff[a + i, q]
                    dc = bcol[a + i, q]
                    bf = (int(min(255, max(0, fill[0] + dc))), int(min(255, max(0, fill[1] + dc))),
                          int(min(255, max(0, fill[2] + dc))))
                    sh = pts + np.array([nx_ * o, ny_ * o], F32)
                    d.line(sh.ravel().tolist(), fill=bf, width=bw)
    return n


def paint(ctx, T, reg, SS=2, dir_override=None, log=None):
    H, W = reg.shape
    U = ctx.U
    theta = orientation(ctx, T, reg, dir_override)
    base = np.clip(blur(T, 10 * U), 0, 255).astype(np.uint8)
    canvas = Image.fromarray(base).resize((W * SS, H * SS), Image.BILINEAR)
    for (wU, tol, thr) in PASSES:
        n = stroke_pass(ctx, canvas, T, reg, theta, wU, tol, thr, SS)
        if log:
            log(f'  pasada {wU:>4} U: {n} trazos')
    return canvas


# ---------------------------------------------------------------- rebrush (§5.4)
def rebrush(ctx, canvas, mask_img, SS, log=None):
    """Repinta solo dentro de la máscara usando el propio lienzo como objetivo."""
    m = np.asarray(mask_img.reduce(SS) if SS > 1 else mask_img, F32) / 255.0
    if m.max() < 0.5:
        return canvas
    T2 = np.asarray(canvas.reduce(SS) if SS > 1 else canvas, F32).copy()
    H, W = m.shape
    reg = np.full((H, W), 3, np.uint8)
    theta = orientation(ctx, T2, reg)
    mb = m > 0.35
    for (wU, tol) in [(6.5, 64), (3.8, 50), (2.5, 42)]:
        er = int(0.30 * wU * ctx.U)
        sm = ndi.binary_erosion(mb, iterations=er) if er >= 1 else mb
        n = stroke_pass(ctx, canvas, T2, reg, theta, wU, tol, None, SS, seedmask=sm, length=3.0)
        if log:
            log(f'  rebrush {wU} U: {n} trazos')
    return canvas


# ---------------------------------------------------------------- acabado (§7)
def rayas(ctx, largo, grosor, ang, esc):
    W, H, U = ctx.W, ctx.H, ctx.U
    D = int(np.hypot(W, H)) + 8
    # se genera a media resolución en el eje largo (el desenfoque es enorme en ese eje)
    k = 4 if largo * U > 24 else 2 if largo * U > 10 else 1
    n = ctx.rng.standard_normal((D, D // k + 2)).astype(F32)
    s = ndi.gaussian_filter(n, (grosor * U, largo * U / k), truncate=3.0)
    if k > 1:
        s = np.asarray(Image.fromarray(s, 'F').resize((D, D), Image.BILINEAR), F32)
    s = ndi.rotate(s, ang, reshape=False, order=1, mode='reflect')
    oy, ox = (D - H) // 2, (D - W) // 2
    s = s[oy:oy + H, ox:ox + W]
    s = s / (s.std() + 1e-9)
    big = np.clip(ctx.vnoise(1946.0 / esc), 0, 1)
    return s, big


def finish(ctx, img, reg, mode='dia', log=None):
    """img: uint8 (H,W,3) ya reducida. Devuelve uint8."""
    W, H, U = ctx.W, ctx.H, ctx.U
    a = np.asarray(img, F32)
    fondo = np.array((34, 36, 48), F32)
    tiza = np.array((240, 236, 224), F32)
    k_tiza, k_gap = 1.0, 1.0
    if mode == 'amanecer':
        tiza, k_tiza = np.array((246, 228, 208), F32), 0.9
    elif mode == 'noche':
        tiza, k_tiza, k_gap, fondo = np.array((176, 190, 226), F32), 0.50, 0.9, np.array((8, 9, 20), F32)

    # 7.1 pulso inseguro
    dx = (ctx.fbm(26, 3) - 0.5) * 9 * U + (ctx.fbm(90, 2) - 0.5) * 2 * U
    dy = (ctx.fbm(26, 3) - 0.5) * 9 * U + (ctx.fbm(90, 2) - 0.5) * 2 * U
    yy, xx = np.mgrid[0:H, 0:W].astype(F32)
    co = [yy + dy, xx + dx]
    a = np.stack([ndi.map_coordinates(a[..., i], co, order=1, mode='nearest') for i in range(3)], -1)
    regw = ndi.map_coordinates(reg.astype(F32), co, order=0, mode='nearest').astype(np.uint8)
    Wt = ndi.gaussian_filter(W_TIZA[regw], 5 * U) * k_tiza
    Wg = ndi.gaussian_filter(W_GAP[regw], 5 * U) * k_gap
    del co, yy, xx, dx, dy

    # 7.2 paleta apagada y lavado turbio
    l = lum(a)[..., None]
    a = a + (l - a) * 0.20
    a = a * (0.89 + 0.20 * ctx.fbm(2.2, 4))[..., None]
    veil = (96, 100, 118) if mode != 'noche' else (20, 24, 44)
    a = mixc(a, veil, 0.12 * smooth(0.35, 0.75, ctx.fbm(3.5, 3)))

    # 7.3 grano del papel
    g1 = ctx.normal(0.75 * U)
    g2 = ctx.normal(1.9 * U)
    tooth = 0.7 * g1 / g1.std() + 0.6 * g2 / g2.std()
    del g1, g2

    # 7.5 fondo oscuro que asoma (solo en los valles del papel)
    s1, b1 = rayas(ctx, 46, 1.5, 9, 150)
    gap = smooth(0.9, 2.1, s1 + 2.0 * (b1 - 0.5)) * smooth(0.5, -0.9, tooth)
    s2, b2 = rayas(ctx, 16, 1.0, -14, 90)
    gap = np.maximum(gap, smooth(1.1, 2.2, s2 + 2.2 * (b2 - 0.5)) * smooth(0.4, -0.8, tooth))
    pits = smooth(-1.35, -2.1, tooth)
    k = np.clip(gap * Wg + 0.20 * pits, 0, 1)
    a = mixc(a, fondo, k)
    del s1, b1, s2, b2, gap, pits, k
    if log:
        log('  huecos listos')

    # 7.6 arrastres de tiza clara (solo en las crestas del papel)
    s3, b3 = rayas(ctx, 60, 1.3, 7, 170)
    sc = smooth(0.7, 1.9, s3 + 2.4 * (b3 - 0.5)) * smooth(0.1, 1.1, tooth)
    s4, b4 = rayas(ctx, 22, 0.9, 19, 110)
    sc = np.maximum(sc, smooth(0.9, 2.0, s4 + 2.4 * (b4 - 0.5)) * smooth(0.2, 1.2, tooth))
    s5, b5 = rayas(ctx, 9, 1.6, -30, 70)
    sc = np.maximum(sc, 0.8 * smooth(1.2, 2.2, s5 + 2.6 * (b5 - 0.5)) * smooth(0.3, 1.2, tooth))
    al = np.clip(sc * Wt, 0, 1)[..., None]
    # ajuste: en zonas muy oscuras la tiza carga menos, para que el cielo no parezca nevado (README §8)
    kt = 0.72 * (0.50 + 0.50 * smooth(30, 150, lum(a)))[..., None]
    a = a + (tiza - a) * kt * al
    del s3, b3, s4, b4, s5, b5, sc, al
    if log:
        log('  tiza lista')

    # 7.7 borde, viñeta y tono
    a = a * (1 + 0.045 * np.clip(tooth, -2.5, 2.5))[..., None]
    yy, xx = np.mgrid[0:H, 0:W].astype(F32)
    dist = np.minimum(np.minimum(xx, W - 1 - xx), np.minimum(yy, H - 1 - yy)) / U
    borde = smooth(12 + 34 * ctx.fbm(7, 3), 0, dist) * smooth(1.0, -0.6, tooth + 0.8)
    a = mixc(a, fondo, 0.6 * borde)
    r2 = 2 * ((xx / W - 0.5) ** 2 + (yy / H - 0.5) ** 2)
    a = a * (1 - 0.20 * smooth(0.25, 1.0, r2))[..., None]
    a = a * np.array((1.015, 1.0, 0.965), F32)
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    out = out.filter(ImageFilter.UnsharpMask(radius=1.2 * U, percent=35, threshold=2))
    return out
