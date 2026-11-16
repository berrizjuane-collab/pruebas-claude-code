"""kit.py — macizo 3D proyectado (§2.3), nubes (§2.2), planos intermedios (§2.4), Scene y utilería de alta montaña."""
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from paint import (F32, smooth, mix, mixc, ridged, lum, blur, ramp, Ctx, paint, rebrush, finish)

# ---------------------------------------------------------------- ruido en coordenadas arbitrarias
_TABLES = {}


def _table(seed):
    if seed not in _TABLES:
        _TABLES[seed] = np.random.default_rng(1000 + seed).random((256, 256)).astype(F32)
    return _TABLES[seed]


def lnoise(x, y, seed=0):
    t = _table(seed)
    x, y = np.broadcast_arrays(np.asarray(x, F32), np.asarray(y, F32))
    xi, yi = np.floor(x), np.floor(y)
    xf, yf = x - xi, y - yi
    xi = xi.astype(np.int32) & 255
    yi = yi.astype(np.int32) & 255
    x1, y1 = (xi + 1) & 255, (yi + 1) & 255
    u = xf * xf * (3 - 2 * xf)
    v = yf * yf * (3 - 2 * yf)
    a, b, c, d = t[yi, xi], t[yi, x1], t[y1, xi], t[y1, x1]
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v


def lfbm(x, y, octv=4, seed=0, kind=None, gain=0.5):
    tot, amp, norm = 0.0, 1.0, 0.0
    for i in range(octv):
        n = lnoise(x * 2 ** i + 17.3 * i, y * 2 ** i + 9.1 * i, seed + i)
        if kind == 'ridged':
            n = ridged(n)
        elif kind == 'billow':
            n = np.abs(2 * n - 1)
        tot = tot + amp * n
        norm += amp
        amp *= gain
    return tot / norm


# ---------------------------------------------------------------- paletas
PAL = {
    'dia': dict(snow=((130, 152, 200), (254, 248, 234)), rock=((56, 60, 92), (160, 130, 106)),
                ao=(20, 28, 60), haze=(196, 208, 228)),
    'altura': dict(snow=((112, 140, 198), (254, 250, 240)), rock=((48, 54, 90), (156, 128, 108)),
                   ao=(16, 24, 60), haze=(176, 198, 228)),
    'amanecer': dict(snow=((110, 114, 170), (255, 206, 160)), rock=((62, 62, 108), (200, 132, 108)),
                     ao=(24, 26, 64), haze=(168, 146, 178)),
    'oro': dict(snow=((116, 124, 176), (255, 226, 184)), rock=((58, 58, 98), (190, 138, 104)),
                ao=(22, 26, 62), haze=(190, 176, 190)),
}

SKY = {
    'dia': [(0, (84, 112, 158)), (0.55, (146, 174, 204)), (1, (222, 220, 210))],
    'altura': [(0, (22, 44, 104)), (0.5, (58, 98, 164)), (0.85, (140, 176, 212)), (1, (212, 224, 234))],
    'amanecer': [(0, (30, 44, 100)), (0.35, (66, 80, 148)), (0.62, (150, 126, 170)), (0.82, (238, 164, 140)),
                 (1, (255, 208, 150))],
    'oro': [(0, (30, 50, 108)), (0.45, (78, 104, 160)), (0.75, (170, 164, 184)), (0.92, (240, 198, 160)),
            (1, (252, 222, 176))],
}


def sky(ctx, kind, v_base, glow=True, cirrus=True, glow_side=1):
    W, H = ctx.W, ctx.H
    v = ((np.arange(H) + 0.5) / H)[:, None] * np.ones((1, W), F32)
    u = ((np.arange(W) + 0.5) / W)[None, :] * np.ones((H, 1), F32)
    t = np.clip(v / v_base, 0, 1)
    if kind == 'noche':
        T = mix(np.array((6, 9, 28), F32), np.array((34, 50, 100), F32), (t ** 1.4)[..., None])
    else:
        T = ramp(SKY[kind], t)
    if kind != 'noche':
        if glow:
            uu = u if glow_side > 0 else 1 - u
            T = mixc(T, (246, 228, 192), 0.55 * (uu) ** 1.3 * smooth(0.25, 0.95, t) * (0.5 if kind == 'altura' else 1))
        n = (ctx.fbm(2.5, 4, sx=0.5) - 0.5) * 30
        T = T + n[..., None] * np.array((1, 1, 0.9), F32)
        if cirrus:
            c = smooth(0.56, 0.82, ctx.fbm(3.2, 4, sx=0.22, sy=2.6)) * smooth(0.62, 0.25, t)
            T = mixc(T, (232, 236, 240), 0.42 * c)
    else:
        n = (ctx.fbm(2.5, 4, sx=0.5) - 0.5) * 10
        T = T + n[..., None]
    return T.astype(F32)


def night(T):
    """Variante nocturna del README (§2.3, paletas)."""
    L = np.clip(lum(T) / 255.0, 0, 1) ** 1.35
    n = mix(np.array((8, 14, 38), F32), np.array((186, 202, 236), F32), L[..., None])
    return (0.78 * n + 0.22 * T * np.array((0.40, 0.52, 0.90), F32)).astype(F32)


# ---------------------------------------------------------------- macizo 3D (§2.3)
class Massif:
    pass


def massif(ctx, prof, u0, v_top, v_base, xs=1.0, depth=0.80, a_deg=16.0, back=1.4, tmax=1.02, pillars=(),
           seed=1, sun=(0.64, -0.46, 0.60), pal='dia', rock_bias=0.0, haze_k=1.0, glow=None, relief=1.0,
           level=None, ny_cap=2600, edge_haze=True, strata=0.45, hfun=None):
    W, H = ctx.W, ctx.H
    Hm = (v_base - v_top) * H
    xcol = (((np.arange(W) + 0.5) - u0 * W) / (Hm * xs)).astype(F32)
    P = np.array(prof, F32)
    R = np.interp(xcol, P[:, 0], P[:, 1]).astype(F32)
    R = R + (lnoise(xcol * 9.0, 0 * xcol + 3.3, seed + 11) - 0.5) * 0.020 * smooth(0.02, 0.2, R)
    R = np.maximum(R, 0.004)
    ymax = depth * float(R.max()) * tmax
    ny = int(min(ny_cap, max(200, 1.35 * Hm * tmax)))
    yrow = np.linspace(0, ymax, ny, dtype=F32)
    X = np.broadcast_to(xcol[None, :], (ny, W))
    Y = np.broadcast_to(yrow[:, None], (ny, W))
    Rr = R[None, :]
    t = Y / (depth * Rr)
    tc = np.clip(t, 0, 1)
    prof_ = np.where(t <= 1, tc ** 1.12, 1 - back * (t - 1))
    n17 = lnoise(X * 1.7, Y * 1.7, seed)
    n17b = lnoise(X * 1.7 + 40, Y * 1.7 + 11, seed + 1)
    n7 = lnoise(X * 7, Y * 7, seed + 2)
    Xw = X + (n17 - 0.5) * 0.34 + (n7 - 0.5) * 0.06
    Yw = Y + (n17b - 0.5) * 0.30
    A = np.clip(ridged(lnoise(Xw * 3.6, Yw * 0.75, seed + 3)), 0, 1) ** 1.8
    B = 0.0
    for i in range(6):
        B = B + 0.52 ** i * np.clip(ridged(lnoise(Xw * 7.5 * 2 ** i, Yw * 3.4 * 2 ** i, seed + 4 + i)), 0, 1) ** 1.3
    B = B / 2
    pill = 0.0
    for (x0, wd, am) in pillars:
        pill = pill + am * np.exp(-((Xw - x0) / wd) ** 2)
    bell = np.maximum(np.sin(np.pi * tc), 0) ** 0.7
    bellp = bell * smooth(1.0, 0.70, t)
    h = Rr * prof_ + relief * ((0.145 * A + 0.085 * pill) * bellp * (0.45 + 0.55 * Rr)
                               + 0.080 * B * (0.15 + 0.85 * bell) * (0.5 + 0.5 * Rr))
    dientes = ridged(lnoise(xcol * 22, 0 * xcol + 7.7, seed + 12)) * 0.6 + ridged(lnoise(xcol * 90, 0 * xcol + 1.7, seed + 13)) * 0.4
    h = h + 0.013 * dientes[None, :] * np.exp(-((t - 1) / 0.07) ** 2) * Rr
    if hfun is not None:
        h = hfun(h, X, Y, t, Rr)
    h = h.astype(F32)
    del n17, n17b, n7, A, pill, bellp
    dx = 1.0 / (Hm * xs)
    dy = ymax / (ny - 1)
    hy, hx = np.gradient(h, dy, dx)
    S = np.array(sun, F32)
    S = S / np.linalg.norm(S)
    nrm = np.sqrt(hx * hx + hy * hy + 1)
    lam = np.maximum(0, (-hx * S[0] - hy * S[1] + S[2]) / nrm)
    # sombras arrojadas (media resolución)
    h2 = h[::2, ::2]
    hz = float(np.hypot(S[0], S[1]))
    tan_e = float(S[2] / hz)
    sh = np.zeros_like(h2)
    for k in range(1, 71):
        d = 0.010 * k
        dr = d * S[1] / hz / (dy * 2)
        dc = d * S[0] / hz / (dx * 2)
        hs = ndi.shift(h2, (-dr, -dc), order=1, mode='nearest')
        sh = np.maximum(sh, smooth(0, 0.022, hs - (h2 + d * tan_e)))
    sh = np.asarray(Image.fromarray(sh, 'F').resize((W, ny), Image.BILINEAR), F32)
    luz = lam * (1 - 0.88 * sh)
    if glow is not None:
        luz = luz * smooth(glow[0], glow[1], h)
    ao = np.clip((ndi.gaussian_filter(h, (0.028 / dy, 0.028 / dx)) - h) * 16, 0, 1)
    slope = np.sqrt(hx * hx + hy * hy)
    ruido = lfbm(Xw * 5.0, Yw * 5.0, 3, seed + 20)
    estr = lnoise(h * 16 + X * 2.2, X * 0.9 + 3.1, seed + 21)
    fino = lnoise(X * 70, Y * 70, seed + 22)
    rs = slope + 1.5 * (ruido - 0.5) + 0.75 * (0.62 - h / Rr) + strata * (estr - 0.5) + 0.5 * (fino - 0.5) + rock_bias
    roca = smooth(1.55, 2.12, rs) * (1 - 0.85 * np.exp(-((t - 1) / 0.045) ** 2))
    lit = smooth(0.30, 0.80, luz)
    p = PAL[pal]
    sn = mix(np.array(p['snow'][0], F32), np.array(p['snow'][1], F32), lit[..., None])
    rk = mix(np.array(p['rock'][0], F32), np.array(p['rock'][1], F32), lit[..., None]) * (0.74 + 0.52 * fino)[..., None]
    C = sn + (rk - sn) * roca[..., None]
    C = C * (1 - 0.34 * ao)[..., None] + np.array(p['ao'], F32) * (0.34 * ao)[..., None]
    del sn, rk, lit, ao, slope, ruido, estr, fino, roca, luz, lam, sh
    a = np.deg2rad(a_deg)
    ca, sa = np.cos(a), np.sin(a)
    den = ca - depth * sa
    s = (h * ca - Y * sa) / den
    rgb = np.zeros((H, W, 3), F32)
    alpha = np.zeros((H, W), F32)
    hp = np.zeros((H, W), F32)
    sp = np.zeros((H, W), F32)
    rows_s = ((v_base * H - (np.arange(H) + 0.5)) / Hm).astype(F32)   # decrece con la fila
    rs_inc = rows_s[::-1]
    for j in range(W):
        sc = s[:, j]
        cm = np.maximum.accumulate(sc)
        vis = np.nonzero(sc >= cm)[0]
        if len(vis) < 2:
            continue
        sv = sc[vis]
        if sv[-1] - sv[0] < 2.0 / Hm:
            continue
        lo = np.searchsorted(rs_inc, sv[0], 'left')
        hi = np.searchsorted(rs_inc, sv[-1], 'right')
        if hi <= lo:
            continue
        sr = rs_inc[lo:hi]
        rr = (H - 1) - np.arange(lo, hi)
        pos = np.clip(np.searchsorted(sv, sr), 1, len(sv) - 1)
        i0, i1 = vis[pos - 1], vis[pos]
        f = np.where((i1 - i0) == 1, (sr - sv[pos - 1]) / (sv[pos] - sv[pos - 1] + 1e-9), 1.0).astype(F32)
        rgb[rr, j] = C[i0, j] * (1 - f)[:, None] + C[i1, j] * f[:, None]
        hp[rr, j] = h[i0, j] * (1 - f) + h[i1, j] * f
        sp[rr, j] = sr
        alpha[rr, j] = 1.0
    if level is not None:
        alpha = alpha * smooth(-0.025, 0.035, hp - level)
    hzv = 0.06 + 0.42 * (1 - np.clip(sp, 0, 1)) ** 2.2
    if edge_haze:
        hzv = hzv + 0.20 * smooth(1.25, 1.9, np.abs(xcol))[None, :]
    rgb = mixc(rgb, p['haze'], np.clip(hzv * haze_k, 0, 0.92))
    m = Massif()
    m.rgb, m.alpha, m.h, m.s = rgb, alpha, hp, sp
    m.grid_h, m.xcol, m.yrow, m.R = h, xcol, yrow, R
    m.Hm, m.v_base, m.u0, m.xs, m.depth = Hm, v_base, u0, xs, depth

    def proj(x, y, hh=None):
        """mundo → píxel. Si hh es None se toma la altura del relieve."""
        x = np.asarray(x, F32)
        y = np.asarray(y, F32)
        if hh is None:
            jj = np.clip((x * Hm * xs + u0 * W - 0.5), 0, W - 1)
            ii = np.clip(y / dy, 0, ny - 1)
            hh = ndi.map_coordinates(h, [ii, jj], order=1)
        ss = (hh * ca - y * sa) / den
        return x * Hm * xs + u0 * W, v_base * H - ss * Hm
    m.proj = proj
    return m


# ---------------------------------------------------------------- cúmulos (§2.2)
def cumulus(ctx, clouds, soft=1.0, cut=(0.06, -0.16), contrast=1.0, warm=False, light=(0.58, -0.62, 0.53), seed=5,
            tones=None):
    """clouds: [(cu, cv_base, semiancho, alto, n_manchas)] con semiancho/alto en fracción de `unit`."""
    W, H, U = ctx.W, ctx.H, ctx.U
    rng = np.random.default_rng(seed)
    Hf = np.zeros((H, W), F32)
    rel = np.zeros((H, W), F32)
    nz = ctx.fbm(9, 3)
    yy, xx = np.mgrid[0:H, 0:W].astype(F32)
    for (cu, cv, w, hg, nb) in clouds:
        w, hg = w * ctx.unit, hg * ctx.unit
        base = cv * H
        for _ in range(nb):
            fx = rng.normal(0, 0.45)
            if abs(fx) > 1:
                continue
            px = cu * W + fx * w
            top = hg * (1 - fx * fx) ** 0.55
            fr = rng.random() ** 0.9
            py = base - fr * top
            rad = min(w, 1.5 * hg) * (0.10 + 0.42 * rng.random() ** 2) * (0.45 + 0.75 * (1 - fr))
            x0, x1 = int(max(0, px - rad)), int(min(W, px + rad + 1))
            y0, y1 = int(max(0, py - rad)), int(min(H, py + rad + 1))
            if x1 <= x0 or y1 <= y0:
                continue
            d2 = (xx[y0:y1, x0:x1] - px) ** 2 + (yy[y0:y1, x0:x1] - py) ** 2
            alt = rad * np.sqrt(np.maximum(0, 1 - d2 / (rad * rad)))
            alt = alt * smooth(base + cut[0] * hg, base + cut[1] * hg, yy[y0:y1, x0:x1] + (nz[y0:y1, x0:x1] - 0.5) * 0.10 * hg)
            sub = Hf[y0:y1, x0:x1]
            np.maximum(sub, alt, out=sub)
            rsub = rel[y0:y1, x0:x1]
            np.maximum(rsub, np.clip((base - yy[y0:y1, x0:x1]) / hg, 0, 1) * (alt > 0), out=rsub)
    # deformación con dos campos de ruido
    dx = (ctx.fbm(6, 3) - 0.5) * 2 * 13 * U
    dy = (ctx.fbm(6, 3) - 0.5) * 2 * 13 * U
    co = [yy + dy, xx + dx]
    Hf = ndi.map_coordinates(Hf, co, order=1, mode='nearest')
    rel = ndi.map_coordinates(rel, co, order=1, mode='nearest')
    Hf = Hf * (0.70 + 0.6 * ctx.fbm(7, 3))
    alpha = smooth(0.6 * U, 8 * U, ndi.gaussian_filter(Hf, 1.8 * U * soft)) * (0.62 + 0.8 * ctx.fbm(40, 2))
    alpha = np.clip(alpha, 0, 1)
    Hs = ndi.gaussian_filter(Hf, 1.2 * U * soft)
    gy, gx = np.gradient(Hs)
    L = np.array(light, F32)
    L = L / np.linalg.norm(L)
    lam = np.clip((-gx * L[0] - gy * L[1] + L[2]) / np.sqrt(gx * gx + gy * gy + 1), 0, 1)
    lam = lam * (0.45 + 0.55 * smooth(0, 0.5, rel))
    lam = 0.5 + (lam - 0.5) * contrast
    if tones is None:
        tones = ((184, 172, 182), (238, 224, 208), (255, 247, 228)) if warm else ((146, 160, 196), (218, 224, 236), (255, 253, 247))
    rgb = ramp([(0, tones[0]), (0.5, tones[1]), (1, tones[2])], np.clip(lam, 0, 1))
    return rgb, alpha.astype(F32)


def mist(ctx, v_base, width=0.105, k=0.86, color=(232, 236, 242)):
    W, H = ctx.W, ctx.H
    v = ((np.arange(H) + 0.5) / H)[:, None]
    a = smooth(0.28, 0.66, ctx.fbm(3, 4, sx=0.45, sy=1.6)) * smooth(width, 0, np.abs(v - v_base))
    return np.asarray(color, F32), (k * a).astype(F32)


# ---------------------------------------------------------------- mar de nubes (§2.4)
def cloud_sea(ctx, v_h, seed=3, f=0.55, scale=1.6, light=(0.7, -0.5), haze=(206, 218, 234), gaps=(44, 66, 112),
              lit=(252, 250, 244), shade=(150, 168, 206), gap_thr=(0.30, 0.44), v_end=1.0):
    W, H = ctx.W, ctx.H
    v = ((np.arange(H) + 0.5) / H)[:, None] * np.ones((1, W), F32)
    u = ((np.arange(W) + 0.5) / W)[None, :] * np.ones((H, 1), F32)
    yy = np.maximum(v - v_h, 1e-4)
    Z = f / yy
    Xw = (u - 0.5) * (W / H) * Z / f * 0.5
    hgt = 1 - lfbm(Xw * scale, Z * scale, 5, seed, 'billow')
    hgt = 0.75 * hgt + 0.25 * lfbm(Xw * scale * 0.3, Z * scale * 0.3, 2, seed + 9)
    near = smooth(0.0, 0.10, yy)
    gy, gx = np.gradient(ndi.gaussian_filter(hgt, 0.8 * ctx.U) * 60 * ctx.U)
    lam = np.clip(0.55 + (-gx * light[0] - gy * light[1]) * 0.9, 0, 1)
    rgb = mix(np.array(shade, F32), np.array(lit, F32), smooth(0.2, 0.85, lam)[..., None])
    g = smooth(gap_thr[1], gap_thr[0], hgt)
    rgb = mixc(rgb, gaps, 0.85 * g)
    rgb = mixc(rgb, haze, 1 - near * 0.92)
    alpha = np.clip((v - v_h) * H + 0.5, 0, 1) * (v <= v_end)
    return rgb.astype(F32), alpha.astype(F32), hgt


# ---------------------------------------------------------------- crestas 2D sombreadas (paredes, cordilleras)
def crest(ctx, x_scale, seed, octv=5, jag=1.0, peaks=()):
    """Línea de cresta 1D en [0,1] aprox. (ridged fbm) + picos gaussianos opcionales [(u, ancho, alto)]."""
    W = ctx.W
    u = (np.arange(W) + 0.5) / W
    xx = u * x_scale
    r = lfbm(xx, 0 * xx + 0.37 * seed, octv, seed, 'ridged', gain=0.5) ** (1.0 + 0.6 * jag)
    for (pu, pw, ph) in peaks:
        d = np.abs(u - pu) / pw
        r = r + ph * np.maximum(0, 1 - d) ** 1.25
    return r.astype(F32)


def ridge_layer(ctx, vline, seed, rock=((56, 60, 92), (160, 130, 106)), snow=((130, 152, 200), (254, 248, 234)),
                sun=(0.64, -0.5), snow_depth=0.10, snow_bias=0.0, haze=(196, 208, 228), haze_k=0.2, fade=None,
                fog=None, fscale=1.0, gain=1.0, fall=0.9):
    """Capa bajo una línea de cresta vline[u] (fracción de H), sombreada con relieve de ruido ridged."""
    W, H = ctx.W, ctx.H
    v = ((np.arange(H) + 0.5) / H)[:, None] * np.ones((1, W), F32)
    below = v - vline[None, :]
    alpha = np.clip(below * H + 0.5, 0, 1)
    X = (np.arange(W)[None, :] / ctx.unit) * np.ones((H, 1), F32)
    Y = below * H / ctx.unit
    wx = X + (lnoise(X * 3 * fscale, Y * 3 * fscale, seed) - 0.5) * 0.10 / fscale
    hm = lfbm(wx * 22 * fscale, Y * 7 * fscale, 4, seed + 1, 'ridged') ** 1.4
    hm = hm * 0.05 / fscale - fall * np.abs(below * H / ctx.unit) * 0.35
    px = 1.0 / ctx.unit
    gy, gx = np.gradient(ndi.gaussian_filter(hm, 0.6 * ctx.U), px, px)
    lam = np.clip(0.52 + gain * 0.42 * (-gx * sun[0] - gy * sun[1]), 0, 1)
    lit = smooth(0.25, 0.80, lam)
    fine = lnoise(X * 260, Y * 260, seed + 5)
    rk = mix(np.array(rock[0], F32), np.array(rock[1], F32), lit[..., None]) * (0.78 + 0.44 * fine)[..., None]
    sn = mix(np.array(snow[0], F32), np.array(snow[1], F32), lit[..., None])
    nz = lfbm(wx * 14 * fscale, Y * 14 * fscale, 3, seed + 7)
    snw = smooth(0.42, 0.58, nz + snow_bias + 0.5 * smooth(snow_depth, 0, below) - 0.25 * smooth(0, snow_depth * 2.5, below) + 0.12 * (lam - 0.5))
    C = rk + (sn - rk) * snw[..., None]
    C = mixc(C, haze, haze_k)
    if fade is not None:
        C = mixc(C, fog if fog is not None else haze, smooth(0, fade, below))
    return C.astype(F32), alpha.astype(F32)


def side_wall(ctx, v_base, A, seed, side='L', inner=0.40, **kw):
    W = ctx.W
    u = (np.arange(W) + 0.5) / W
    uu = u if side == 'L' else 1 - u
    n1 = lfbm(u * 9, 0 * u + seed, 4, seed, 'ridged')
    c = A * smooth(inner, 0, uu) ** 1.15 * (1 + 0.30 * (n1 * 2 - 1))
    vline = (v_base - c).astype(F32)
    C, al = ridge_layer(ctx, vline, seed, **kw)
    al = al * (c[None, :] > 1.5 / ctx.H)
    return C, al, vline


# ---------------------------------------------------------------- plano en perspectiva (glaciar / morrena)
def plane_coords(ctx, v_h, u_vp=0.5, f=0.5):
    W, H = ctx.W, ctx.H
    v = ((np.arange(H) + 0.5) / H)[:, None] * np.ones((1, W), F32)
    u = ((np.arange(W) + 0.5) / W)[None, :] * np.ones((H, 1), F32)
    yy = np.maximum(v - v_h, 1e-4)
    Z = f / yy
    Xw = (u - u_vp) * (W / H) * Z / f
    return Xw.astype(F32), Z.astype(F32), yy.astype(F32)


# ---------------------------------------------------------------- Scene
class Proxy:
    """Dibuja en el lienzo (a SS) y registra la máscara para el rebrush (§5.4)."""

    def __init__(self, canvas, SS):
        self.im, self.SS = canvas, SS
        self.d = ImageDraw.Draw(canvas)
        self.m = Image.new('L', canvas.size, 0)
        self.md = ImageDraw.Draw(self.m)
        self.mask_on = True

    def _p(self, pts):
        return [(float(x) * self.SS, float(y) * self.SS) for x, y in pts]

    def poly(self, pts, col):
        q = self._p(pts)
        self.d.polygon(q, fill=tuple(int(c) for c in col))
        if self.mask_on:
            self.md.polygon(q, fill=255)

    def line(self, pts, col, w):
        q = self._p(pts)
        ww = max(1, int(round(w * self.SS)))
        self.d.line(q, fill=tuple(int(c) for c in col), width=ww, joint='curve')
        if self.mask_on and ww >= 3:
            self.md.line(q, fill=255, width=ww)

    def dot(self, x, y, r, col):
        S = self.SS
        b = ((x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S)
        self.d.ellipse(b, fill=tuple(int(c) for c in col))
        if self.mask_on:
            self.md.ellipse(b, fill=255)


class Scene:
    def __init__(self, W, H, seed=1, mode='dia'):
        self.ctx = Ctx(W, H, seed)
        self.W, self.H = W, H
        self.T = np.zeros((H, W, 3), F32)
        self.reg = np.zeros((H, W), np.uint8)
        self.items = []     # (y_base, fn(proxy))  → se re-pincelan
        self.late = []      # fn(proxy) tras el rebrush (estrellas, luces, cuerdas finas)
        self.mode = mode
        self.dir = None

    def put(self, color, alpha, rid):
        self.T = mixc(self.T, color, alpha) if np.ndim(color) == 1 else self.T + (color - self.T) * alpha[..., None]
        self.reg[alpha > 0.5] = rid

    def set_dir(self, mask, ang):
        if self.dir is None:
            self.dir = np.full((self.H, self.W), np.nan, F32)
        self.dir[mask] = ang if np.ndim(ang) == 0 else ang[mask]

    def add(self, y, fn):
        self.items.append((y, fn))

    def render(self, out, SS=2, log=print):
        ctx = self.ctx
        self.T = np.clip(self.T, 0, 255)
        log('pintando…')
        canvas = paint(ctx, self.T, self.reg, SS, self.dir, log)
        p = Proxy(canvas, SS)
        for _, fn in sorted(self.items, key=lambda t: t[0]):
            fn(p)
        rebrush(ctx, canvas, p.m, SS, log)
        p.mask_on = False
        for fn in self.late:
            fn(p)
        img = canvas.resize((self.W, self.H), Image.LANCZOS) if SS > 1 else canvas
        log('acabado…')
        res = finish(ctx, img, self.reg, self.mode, log)
        res.save(out)
        return res


# ---------------------------------------------------------------- utilería de alta montaña (§5.3)
def _sc(c, k):
    return tuple(min(255, max(0, v * k)) for v in c)


def stone(p, x, y, r, rng, dark=(52, 54, 72), light=(168, 156, 146), snowcap=False, sun_right=True):
    """Piedra en tres tonos: sombra arrojada, cuerpo a media tinta y cara clara arriba a la derecha."""
    n = int(rng.integers(6, 9))
    ang = np.sort(rng.uniform(0, 2 * np.pi, n))
    rad = r * rng.uniform(0.7, 1.1, n)
    cy = y - r * 0.55
    pts = [(x + np.cos(a) * rr * 1.25, cy + np.sin(a) * rr * 0.72) for a, rr in zip(ang, rad)]
    k = rng.uniform(0.85, 1.15)
    sg = 1 if sun_right else -1
    p.poly([(px - sg * 0.30 * r, cy + (py - cy) * 0.45 + 0.42 * r) for px, py in pts], _sc(dark, 0.9))
    mid = tuple(0.45 * d + 0.55 * l for d, l in zip(dark, light))
    p.poly(pts, _sc(mid, k * 0.86))
    q = rng.uniform(0.50, 0.70)
    top = [(x + (px - x) * q + sg * 0.20 * r, cy + (py - cy) * (q - 0.04) - 0.20 * r) for px, py in pts]
    p.poly(top, _sc((236, 240, 246) if snowcap else light, k))


def tent(p, x, y, s, col, sun_right=True, glow=False, rng=None):
    """Carpa domo: semielipse, mitad en sombra ×0.62, gajo de luz, puerta oscura."""
    a = np.linspace(np.pi, 0, 18)
    hh = 0.92 * s
    dome = [(x + np.cos(t) * s, y - np.sin(t) * hh) for t in a]
    if glow:
        p.poly(dome, _sc(col, 1.0))
        inner = [(x + np.cos(t) * s * 0.62, y - np.sin(t) * hh * 0.70) for t in a]
        p.poly(inner, (255, 236, 150))
        p.line([(x, y), (x + 0.05 * s, y - hh)], _sc(col, 0.55), 0.05 * s)
        p.line([(x - 0.45 * s, y), (x - 0.25 * s, y - hh * 0.86)], _sc(col, 0.6), 0.04 * s)
        p.line([(x + 0.5 * s, y), (x + 0.3 * s, y - hh * 0.84)], _sc(col, 0.6), 0.04 * s)
        return
    p.poly(dome, col)
    sg = 1 if sun_right else -1
    half = [(x - sg * np.cos(t) * s, y - np.sin(t) * hh) for t in np.linspace(0, np.pi / 2, 10)] + [(x - sg * 0.08 * s, y)]
    p.poly(half, _sc(col, 0.62))
    gore = [(x + sg * 0.18 * s, y), (x + sg * 0.12 * s, y - hh * 0.97), (x + sg * 0.46 * s, y - hh * 0.84), (x + sg * 0.62 * s, y)]
    p.poly(gore, _sc(col, 1.22))
    door = [(x - sg * 0.30 * s, y), (x - sg * 0.20 * s, y - hh * 0.52), (x - sg * 0.02 * s, y - hh * 0.50), (x + sg * 0.06 * s, y)]
    p.poly(door, (30, 30, 44))
    p.line([(x - s * 1.0, y), (x + s * 1.0, y)], _sc(col, 0.45), max(0.5, 0.05 * s))


def climber(p, x, y, h, jacket=(204, 60, 48), pack=(60, 80, 150), face=1, lean=0.25, axe=True, pose='walk'):
    """Silueta de pocos polígonos: piernas, torso inclinado, mochila, casco, piolet."""
    f = face
    hip = (x, y - 0.46 * h)
    sh = (x + f * lean * 0.34 * h, y - 0.80 * h)
    hd = (sh[0] + f * 0.04 * h, sh[1] - 0.12 * h)
    lw = max(0.8, 0.11 * h)
    dark = (30, 32, 48)
    p.line([hip, (x - f * 0.16 * h, y - 0.22 * h), (x - f * 0.20 * h, y)], dark, lw)
    p.line([hip, (x + f * 0.14 * h, y - 0.24 * h), (x + f * 0.18 * h, y)], dark, lw)
    p.poly([(sh[0] - f * 0.18 * h, sh[1] + 0.02 * h), (sh[0] - f * 0.26 * h, sh[1] + 0.26 * h), (hip[0] - f * 0.20 * h, hip[1] - 0.02 * h),
            (hip[0] - f * 0.04 * h, hip[1] - 0.06 * h)], pack)
    p.poly([(sh[0] - f * 0.10 * h, sh[1]), (sh[0] + f * 0.10 * h, sh[1] + 0.02 * h), (hip[0] + f * 0.10 * h, hip[1]), (hip[0] - f * 0.10 * h, hip[1])], jacket)
    if pose == 'cheer':
        p.line([sh, (sh[0] + f * 0.20 * h, sh[1] - 0.26 * h)], jacket, lw * 0.8)
        p.line([(sh[0] + f * 0.20 * h, sh[1] - 0.26 * h), (sh[0] + f * 0.22 * h, sh[1] - 0.56 * h)], (40, 40, 52), max(0.6, 0.035 * h))
        p.line([sh, (sh[0] - f * 0.20 * h, sh[1] - 0.20 * h)], jacket, lw * 0.8)
    else:
        hand = (sh[0] + f * 0.22 * h, sh[1] + 0.26 * h)
        p.line([sh, hand], _sc(jacket, 0.8), lw * 0.8)
        if axe:
            p.line([hand, (hand[0] + f * 0.06 * h, y - 0.02 * h)], (40, 40, 52), max(0.6, 0.035 * h))
    p.dot(hd[0], hd[1], 0.085 * h, (236, 220, 96))


def flags(p, a, b, sag, n=14, size=6.0):
    """Banderas de oración en catenaria: azul, blanco, rojo, verde, amarillo."""
    cols = [(60, 96, 190), (240, 240, 234), (204, 58, 50), (62, 140, 84), (238, 204, 72)]
    ts = np.linspace(0, 1, n * 2 + 1)
    pts = [(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + sag * 4 * t * (1 - t)) for t in ts]
    p.line(pts, (44, 44, 56), max(0.5, size * 0.08))
    for i in range(n):
        x0, y0 = pts[2 * i]
        x1, y1 = pts[2 * i + 1]
        sk = size * 0.15
        p.poly([(x0, y0), (x1, y1), (x1 + sk, y1 + size), (x0 + sk, y0 + size)], cols[i % 5])


def scatter_stones(sc, region_fn, n, size_fn, seed, mask_min=3.5, **kw):
    """Piedras de morrena ordenadas por profundidad; region_fn(rng) → (x, y, s) con s∈[0,1] profundidad."""
    rng = np.random.default_rng(seed)
    for _ in range(n):
        r = region_fn(rng)
        if r is None:
            continue
        x, y, s = r
        rad = size_fn(s, rng) * sc.ctx.U
        st = np.random.default_rng(int(rng.integers(1 << 30)))

        def fn(p, x=x, y=y, rad=rad, st=st):
            keep = p.mask_on
            p.mask_on = keep and rad >= mask_min * sc.ctx.U
            stone(p, x, y, rad, st, **kw)
            p.mask_on = keep
        sc.add(y, fn)
