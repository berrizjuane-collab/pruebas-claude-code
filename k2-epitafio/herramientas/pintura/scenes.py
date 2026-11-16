"""scenes.py — seis vistas del K2 en estilo "pincel seco sobre fondo oscuro".
Uso: python3 scenes.py <escena> <ancho> <alto> <salida.png> [SS]
Escenas: concordia, base, ruta, campo4, bottleneck, cumbre
"""
import sys
import time
import numpy as np
from scipy import ndimage as ndi
from paint import F32, smooth, mix, mixc, ridged, lum, blur, ramp
from kit import (Scene, massif, sky, night, cumulus, mist, cloud_sea, crest, ridge_layer, side_wall, plane_coords,
                 lnoise, lfbm, PAL, stone, tent, climber, flags, scatter_stones, _sc)

# Horizonte del K2 visto desde el sur (Concordia / glaciar Godwin-Austen): (x, R)
K2_SUR = [(-2.3, 0.05), (-1.9, 0.12), (-1.55, 0.20), (-1.30, 0.30), (-1.12, 0.43), (-1.02, 0.37), (-0.86, 0.42),
          (-0.66, 0.55), (-0.50, 0.63), (-0.40, 0.72), (-0.28, 0.78), (-0.20, 0.87), (-0.11, 0.945), (-0.04, 0.99),
          (0, 1.0), (0.035, 0.985), (0.10, 0.93), (0.17, 0.885), (0.24, 0.80), (0.31, 0.775), (0.46, 0.765),
          (0.55, 0.735), (0.64, 0.66), (0.80, 0.53), (0.98, 0.42), (1.20, 0.33), (1.50, 0.24), (1.90, 0.14),
          (2.3, 0.06)]


def grids(sc):
    W, H = sc.W, sc.H
    v = ((np.arange(H) + 0.5) / H)[:, None] * np.ones((1, W), F32)
    u = ((np.arange(W) + 0.5) / W)[None, :] * np.ones((H, 1), F32)
    return u, v


# ============================================================================ 1. CONCORDIA (amanecer)
def concordia(W, H):
    sc = Scene(W, H, seed=11, mode='amanecer')
    ctx = sc.ctx
    U = ctx.U
    u, v = grids(sc)
    vb = 0.645
    sc.put(sky(ctx, 'amanecer', vb + 0.02), np.ones((H, W), F32), 0)
    # nubes cálidas bajas detrás de las paredes
    crgb, cal = cumulus(ctx, [(0.90, 0.50, 0.10, 0.035, 60), (0.07, 0.47, 0.08, 0.030, 50), ],
                        warm=True, seed=4, tones=((150, 130, 170), (232, 176, 160), (255, 226, 190)))
    sc.put(crgb, cal * 0.92, 1)
    # el K2: la luz del alba solo toca la mitad alta
    m = massif(ctx, K2_SUR, 0.50, 0.105, vb, xs=0.74, depth=0.82, a_deg=15, seed=7, sun=(0.80, -0.42, 0.34),
               pal='amanecer', rock_bias=0.34, glow=(0.36, 0.60),
               pillars=[(-0.06, 0.10, 1.0), (0.40, 0.08, 0.9), (-0.40, 0.09, 0.7), (0.85, 0.10, 0.5)])
    sc.put(m.rgb, m.alpha, 2)
    # paredes laterales en sombra azul-violeta
    shade = dict(rock=((40, 40, 78), (98, 86, 118)), snow=((98, 104, 160), (176, 164, 200)), sun=(0.7, -0.4),
                 haze=(168, 146, 178), haze_k=0.22, snow_depth=0.10, snow_bias=-0.10)
    for side, A, inn, sd in (('L', 0.44, 0.40, 31), ('R', 0.40, 0.34, 47)):
        C, al, _ = side_wall(ctx, vb + 0.03, A, sd, side, inner=inn, **shade)
        sc.put(C, al, 3)
    # glaciar Godwin-Austen: plano en perspectiva con morrenas longitudinales
    Xw, Z, yy = plane_coords(ctx, vb - 0.012, 0.5, 0.42)
    band = lnoise(Xw * 1.5 + 1.1 * lnoise(Z * 0.35, Xw * 0.3, 3) + 0.4 * lnoise(Z * 1.3, 0.5, 4), Z * 0.04, 5)
    mor = smooth(0.50, 0.70, band + 0.45 * (lfbm(Xw * 7, Z * 2.2, 3, 8) - 0.5))
    rub = lfbm(Xw * 16, Z * 16, 4, 9, 'billow')
    ice = mix(np.array((128, 138, 192), F32), np.array((178, 180, 216), F32), smooth(0.2, 0.7, 1 - rub)[..., None])
    mo = mix(np.array((58, 58, 92), F32), np.array((104, 96, 126), F32), smooth(0.25, 0.8, rub)[..., None])
    G = ice + (mo - ice) * mor[..., None]
    G = mixc(G, (176, 152, 182), smooth(0.10, 0.0, yy) * 0.9)
    gal = np.clip((v - (vb - 0.004)) * H, 0, 1)
    sc.put(G, gal, 4)
    sc.set_dir(gal > 0.5, np.arctan2((v - (vb - 0.012)) * H, (u - 0.5) * W))
    mc, ma = mist(ctx, vb + 0.005, width=0.07, k=0.62, color=(206, 176, 190))
    sc.put(mc, ma, 1)
    # primer plano: lomo de morrena oscuro
    cr = crest(ctx, 3.0, 5, 4, 0.2)
    vfg = 0.865 + 0.075 * smooth(0.25, 0.75, u[0]) - 0.03 * cr + 0.05 * smooth(0.78, 1.0, u[0]) * -1
    below = v - vfg[None, :]
    s = np.clip(below / (1 - vfg[None, :]), 0, 1)
    tx = lfbm(u * W / ctx.unit * 18, below * H / ctx.unit * 30, 4, 21, 'billow')
    F = mix(np.array((34, 36, 62), F32), np.array((70, 68, 98), F32), smooth(0.2, 0.7, tx)[..., None])
    F = mixc(F, (128, 136, 190), smooth(0.56, 0.66, ctx.fbm(5, 3, sx=0.5, sy=1.6)) * 0.85)
    F = mixc(F, (142, 136, 180), smooth(0.012, 0, below) * 0.6)
    fal = np.clip(below * H + 0.5, 0, 1)
    sc.put(F, fal, 5)

    def region(rng):
        x = rng.uniform(0, W)
        i = int(min(W - 1, x))
        y = rng.uniform(vfg[i] * H, H)
        return x, y, (y / H - vfg[i]) / (1 - vfg[i])
    scatter_stones(sc, region, 520, lambda s, r: (2.5 + 34 * s ** 1.4) * r.uniform(0.35, 1.0) ** 1.6 * 1.7, 3,
                   dark=(26, 28, 50), light=(104, 104, 150))
    # campamento en sombra y un escalador mirando la pirámide
    k = 0.78
    for (tu, col, ts) in ((0.150, (236, 190, 70), 58), (0.235, (222, 110, 60), 52), (0.075, (200, 70, 66), 46)):
        x = tu * W
        y = (vfg[int(x)] + 0.022) * H
        sc.add(y, lambda p, x=x, y=y, ts=ts, col=col: tent(p, x, y, ts * U, _sc(col, k), sun_right=True))
    for (cu_, hh, jk, f) in ((0.300, 70, (196, 62, 56), 1), (0.328, 64, (64, 110, 180), 1)):
        x = cu_ * W
        y = (vfg[int(x)] + 0.03) * H
        sc.add(y + 1, lambda p, x=x, y=y, hh=hh, jk=jk, f=f: climber(p, x, y, hh * U, _sc(jk, 0.85), (40, 44, 80), f, 0.05, axe=False))
    return sc


# ---------------------------------------------------------------- ayudas comunes
def snowfield(sc, alpha, seed, light=(0.6, -0.5), shade=(120, 144, 198), lit=(252, 248, 238), gain=1.0, sx=0.35, sy=2.4,
              und=1.0, rid=3, base=0.55, sas=0.16):
    """Nieve cercana con ondulación suave y sastrugi estirados."""
    ctx = sc.ctx
    hm = ctx.fbm(1.6, 3) * 0.9 * und + ctx.fbm(13, 3, sx=sx, sy=sy) * sas + ctx.fbm(60, 2, sx=sx, sy=sy) * sas * 0.2
    gy, gx = np.gradient(ndi.gaussian_filter(hm, 0.8 * ctx.U) * ctx.unit / 3.0)
    lam = np.clip(base + gain * (-gx * light[0] - gy * light[1]), 0, 1)
    C = mix(np.array(shade, F32), np.array(lit, F32), smooth(0.2, 0.9, lam)[..., None])
    sc.put(C, alpha, rid)
    return lam


def add_stars(sc, n, seed, vmax=0.8):
    rng = np.random.default_rng(seed)
    W, H, U = sc.W, sc.H, sc.ctx.U
    st = [(rng.uniform(0, W), rng.uniform(0, vmax * H) ** 1.0, rng.random()) for _ in range(n)]

    def fn(p):
        for x, y, q in st:
            if sc.reg[int(y), int(x)] != 0:
                continue
            r = (0.7 + 2.2 * q ** 6) * U
            b = 150 + 105 * q ** 0.7
            p.dot(x, y, r, (b, b, min(255, b + 14)))
            if q > 0.93:
                p.dot(x, y, r * 2.4, (70, 84, 130))
                p.dot(x, y, r, (255, 252, 240))
    sc.late.append(fn)


def glow(sc, x, y, r, col, k=1.0):
    u, v = grids(sc)
    d2 = ((u * sc.W - x) ** 2 + ((v * sc.H - y) * 2.2) ** 2) / (r * r)
    sc.T = sc.T + np.array(col, F32) * (k * np.exp(-d2))[..., None]


# ============================================================================ 2. CAMPO BASE (día)
def base(W, H):
    sc = Scene(W, H, seed=22, mode='dia')
    ctx = sc.ctx
    U = ctx.U
    u, v = grids(sc)
    vb = 0.660
    sc.put(sky(ctx, 'dia', vb), np.ones((H, W), F32), 0)
    crgb, cal = cumulus(ctx, [(0.10, 0.47, 0.13, 0.075, 120), (0.93, 0.52, 0.12, 0.055, 90), (0.81, 0.235, 0.085, 0.036, 80)], seed=6)
    sc.put(crgb, cal, 1)
    m = massif(ctx, K2_SUR, 0.50, 0.055, vb, xs=0.92, depth=0.95, a_deg=23, seed=19, pal='dia', rock_bias=0.30,
               pillars=[(-0.06, 0.10, 1.0), (0.40, 0.08, 1.0), (-0.42, 0.09, 0.8), (0.85, 0.10, 0.5)])
    sc.put(m.rgb, m.alpha, 2)
    # bancos de niebla enganchados a media pared
    frgb, fal_ = cumulus(ctx, [(0.29, 0.475, 0.15, 0.034, 110), (0.73, 0.53, 0.12, 0.028, 80)], soft=3.0, cut=(0.55, 0.35),
                         contrast=0.55, seed=9)
    sc.put(frgb, fal_ * 0.92, 1)
    wk = dict(rock=((60, 62, 90), (158, 136, 114)), snow=((130, 152, 200), (250, 246, 236)), haze_k=0.22, snow_depth=0.09)
    for side, A, inn, sd in (('L', 0.36, 0.33, 61), ('R', 0.42, 0.30, 67)):
        C, al, _ = side_wall(ctx, vb + 0.035, A, sd, side, inner=inn, **wk)
        sc.put(C, al, 3)
    # glaciar lejano que llena el pie de la pared
    Xg, Zg, yg = plane_coords(ctx, vb - 0.016, 0.5, 0.4)
    gl = mix(np.array((176, 196, 224), F32), np.array((238, 242, 246), F32), smooth(0.3, 0.7, lfbm(Xg * 3, Zg * 0.4, 3, 77))[..., None])
    gl = mixc(gl, (150, 150, 164), smooth(0.60, 0.72, lnoise(Xg * 2.2, Zg * 0.05, 78)) * 0.5)
    gl = mixc(gl, (206, 216, 232), smooth(0.05, 0, yg) * 0.8)
    sc.put(gl, np.clip((v - (vb - 0.006)) * H, 0, 1), 4)
    mc, ma = mist(ctx, vb + 0.004, width=0.05, k=0.7)
    sc.put(mc, ma, 1)
    # torres de hielo del glaciar
    rg = np.random.default_rng(12)
    pk = [(rg.uniform(0, 1), rg.uniform(0.006, 0.022), rg.uniform(0.25, 1.0) ** 1.5) for _ in range(46)]
    vi = 0.722 - 0.006 * crest(ctx, 15, 3, 4, 1.0) - 0.058 * (crest(ctx, 30, 4, 3, 1.0, pk) - crest(ctx, 30, 4, 3, 1.0)) 
    C, al = ridge_layer(ctx, vi.astype(F32), 71, snow=((112, 156, 206), (246, 250, 252)), snow_bias=1.0, fscale=2.2, haze_k=0.08)
    sc.put(C, al, 3)
    # morrena en perspectiva
    vt = 0.735
    Xw, Z, yy = plane_coords(ctx, vt - 0.03, 0.5, 0.5)
    rub = lfbm(Xw * 10, Z * 10, 4, 5, 'billow')
    big = lfbm(Xw * 1.4, Z * 1.4, 3, 6)
    F = mix(np.array((74, 72, 84), F32), np.array((170, 158, 146), F32), smooth(0.15, 0.75, rub + 0.5 * (big - 0.5))[..., None])
    F = mixc(F, (236, 240, 246), smooth(0.60, 0.68, lfbm(Xw * 2.2, Z * 2.2, 3, 12)) * 0.9)
    F = mixc(F, (190, 198, 214), smooth(0.06, 0, yy) * 0.5)
    vfg = vt + 0.012 * (crest(ctx, 6, 13, 3, 0) - 0.5)
    fal = np.clip((v - vfg[None, :]) * H + 0.5, 0, 1)
    sc.put(F, fal, 5)

    def region(rng):
        x = rng.uniform(0, W)
        y = rng.uniform(vt * H, H)
        return x, y, (y / H - vt) / (1 - vt)
    scatter_stones(sc, region, 620, lambda s, r: (2.0 + 40 * s ** 1.5) * r.uniform(0.3, 1.0) ** 1.7 * 1.8, 4,
                   dark=(50, 50, 66), light=(190, 178, 164))
    tents = [(0.20, 0.800, 30, (238, 196, 60)), (0.285, 0.812, 34, (226, 112, 48)), (0.37, 0.795, 28, (206, 60, 54)),
             (0.455, 0.822, 38, (240, 200, 64)), (0.60, 0.805, 30, (64, 112, 190)), (0.69, 0.830, 40, (228, 118, 50)),
             (0.33, 0.868, 56, (240, 198, 62)), (0.545, 0.885, 64, (210, 62, 54)), (0.80, 0.872, 54, (240, 196, 60)),
             (0.13, 0.905, 70, (228, 114, 48))]
    for (tu, tv, ts, col) in tents:
        sc.add(tv * H, lambda p, tu=tu, tv=tv, ts=ts, col=col: tent(p, tu * W, tv * H, ts * U, col))
    px_, py_ = 0.50 * W, 0.842 * H

    def cairn(p):
        rg = np.random.default_rng(3)
        for i in range(5):
            stone(p, px_ + rg.uniform(-3, 3) * U, py_ - i * 9 * U, (15 - 2.2 * i) * U, rg, dark=(58, 58, 74), light=(196, 184, 170))
        p.line([(px_, py_ - 40 * U), (px_, py_ - 118 * U)], (52, 46, 46), 2.4 * U)
        flags(p, (px_, py_ - 116 * U), (0.33 * W, 0.868 * H - 50 * U), 26 * U, 13, 9 * U)
        flags(p, (px_, py_ - 116 * U), (0.69 * W, 0.830 * H - 36 * U), 30 * U, 15, 9 * U)
        flags(p, (px_, py_ - 116 * U), (0.455 * W, 0.822 * H - 34 * U), 8 * U, 5, 7 * U)
    sc.add(py_ + 2, cairn)
    for (cu_, cv_, hh, jk, f) in ((0.405, 0.86, 58, (204, 60, 48), 1), (0.43, 0.865, 54, (60, 110, 190), -1), (0.635, 0.90, 72, (236, 150, 40), -1),
                                   (0.245, 0.835, 44, (70, 150, 110), 1), (0.745, 0.845, 46, (204, 60, 48), -1)):
        sc.add(cv_ * H + 1, lambda p, cu_=cu_, cv_=cv_, hh=hh, jk=jk, f=f: climber(p, cu_ * W, cv_ * H, hh * U, jk, (44, 50, 90), f, 0.12, axe=False))
    return sc


# ============================================================================ 3. RUTA (aérea, espolón de los Abruzos)
K2_SE = [(-2.4, 0.05), (-1.7, 0.20), (-1.15, 0.38), (-0.72, 0.56), (-0.44, 0.74), (-0.21, 0.89), (-0.07, 0.975), (0, 1.0),
         (0.06, 0.975), (0.15, 0.905), (0.25, 0.835), (0.35, 0.805), (0.50, 0.79), (0.60, 0.74), (0.74, 0.62),
         (0.95, 0.46), (1.25, 0.32), (1.75, 0.18), (2.4, 0.05)]
P_A = [(-1.6, 0.1), (-0.9, 0.45), (-0.45, 0.80), (-0.2, 0.93), (0, 1.0), (0.2, 0.90), (0.42, 0.95), (0.7, 0.80), (0.95, 0.86),
       (1.3, 0.5), (1.9, 0.1)]
P_B = [(-1.5, 0.1), (-0.7, 0.5), (-0.25, 0.86), (0, 1.0), (0.3, 0.8), (0.6, 0.9), (1.0, 0.5), (1.6, 0.1)]
P_C = [(-1.7, 0.08), (-1.0, 0.42), (-0.6, 0.62), (-0.3, 0.70), (-0.1, 0.94), (0, 1.0), (0.12, 0.93), (0.4, 0.66), (0.62, 0.72),
       (0.9, 0.48), (1.3, 0.3), (1.8, 0.08)]


def ruta(W, H):
    sc = Scene(W, H, seed=33, mode='dia')
    ctx = sc.ctx
    U = ctx.U
    u, v = grids(sc)
    vh = 0.56
    sc.put(sky(ctx, 'altura', vh + 0.02), np.ones((H, W), F32), 0)
    srgb, sal, _ = cloud_sea(ctx, vh, seed=4, f=0.5, scale=1.0, gap_thr=(0.36, 0.50))
    sc.put(srgb, sal, 1)
    lvl = 0.235
    for (P, u0, vt_, vb_, xs_, sd, lv, hk) in ((P_A, 0.905, 0.335, 0.80, 0.9, 51, 0.42, 1.5), (P_B, 0.085, 0.43, 0.74, 0.9, 57, 0.50, 1.9),
                                                (P_C, 0.245, 0.475, 0.70, 0.8, 59, 0.55, 2.1)):
        b = massif(ctx, P, u0, vt_, vb_, xs=xs_, a_deg=-8, seed=sd, pal='altura', level=lv, haze_k=hk, tmax=1.0, rock_bias=0.25)
        sc.put(b.rgb, b.alpha, 2)
    m = massif(ctx, K2_SE, 0.50, 0.085, 1.00, xs=0.60, depth=0.92, a_deg=-13, seed=23, pal='altura', rock_bias=0.62,
               level=lvl, tmax=1.0, pillars=[(0.45, 0.11, 1.7), (-0.10, 0.10, 0.9), (-0.55, 0.10, 0.8), (0.95, 0.10, 0.6)])
    sc.put(m.rgb, m.alpha, 2)
    # nubes cercanas que tapan el pie
    frgb, fal_ = cumulus(ctx, [(0.30, 0.90, 0.30, 0.04, 200), (0.75, 0.93, 0.30, 0.04, 200)], soft=3.0, cut=(0.55, 0.35), contrast=0.6, seed=18)
    sc.put(frgb, fal_ * 0.85, 1)
    crgb, cal = cumulus(ctx, [(0.14, 1.00, 0.22, 0.050, 320), (0.82, 1.03, 0.24, 0.055, 340), (0.48, 1.05, 0.18, 0.040, 200)], seed=8)
    sc.put(crgb, cal, 1)
    # --- la ruta: espolón → Hombro → Cuello de Botella → cumbre
    q = np.linspace(0, 1, 400)
    x_sp = 0.47 + 0.03 * np.sin(q * 19)
    xr = np.where(q < 0.72, x_sp, np.interp(q, [0.72, 0.80, 0.9, 1.0], [0.47 + 0.03 * np.sin(0.72 * 19), 0.30, 0.13, 0.012]))
    tr = np.where(q < 0.72, 0.30 + 0.63 * (q / 0.72), np.interp(q, [0.72, 0.80, 0.9, 1.0], [0.93, 0.95, 0.955, 0.985]))
    Rr = np.interp(xr, [p_[0] for p_ in K2_SE], [p_[1] for p_ in K2_SE])
    yr = tr * m.depth * Rr
    px, py = m.proj(xr, yr)
    jj = np.clip(px, 0, W - 1)
    hr = ndi.map_coordinates(m.grid_h, [np.clip(yr / (m.yrow[1] - m.yrow[0]), 0, len(m.yrow) - 1), jj], order=1)
    py = ndi.gaussian_filter1d(py, 3)
    seg = np.cumsum(np.hypot(np.diff(px, prepend=px[0]), np.diff(py, prepend=py[0])))
    dash = 24 * U

    def route(p):
        on = ((seg // dash) % 2 == 0) & (hr > lvl + 0.03)
        i, n = 0, len(q)
        while i < n:
            if on[i]:
                j = i
                while j + 1 < n and on[j + 1]:
                    j += 1
                if j > i:
                    pts = list(zip(px[i:j + 1], py[i:j + 1]))
                    p.line(pts, (255, 240, 224), 8.5 * U)
                    p.line(pts, (214, 52, 40), 5.0 * U)
                i = j + 1
            else:
                i += 1
    sc.add(0, route)
    for hc in (0.31, 0.47, 0.65, 0.80):
        k = int(np.argmin(np.abs(hr - hc) + (q > 0.8) * 9))
        if hr[k] < lvl + 0.03:
            continue
        sc.add(py[k], lambda p, k=k: tent(p, px[k] + 26 * U, py[k] + 8 * U, 21 * U, (242, 204, 60)))
    k = len(q) - 1
    sc.add(py[k] - 1, lambda p: (p.line([(px[k], py[k] + 2 * U), (px[k], py[k] - 34 * U)], (40, 40, 52), 2.4 * U),
                                 p.poly([(px[k], py[k] - 34 * U), (px[k] + 24 * U, py[k] - 27 * U), (px[k], py[k] - 19 * U)], (214, 52, 40))))
    return sc


# ============================================================================ 4. CAMPO 4 (noche, salida a cumbre)
K2_C4 = [(-2.9, 0.05), (-2.2, 0.20), (-1.6, 0.36), (-1.1, 0.50), (-0.74, 0.60), (-0.52, 0.76), (-0.26, 0.905), (-0.08, 0.982),
         (0, 1.0), (0.07, 0.985), (0.18, 0.94), (0.30, 0.875), (0.44, 0.78), (0.56, 0.735), (0.72, 0.70), (0.90, 0.56),
         (1.25, 0.40), (1.8, 0.24), (2.6, 0.08)]


def campo4(W, H):
    sc = Scene(W, H, seed=44, mode='noche')
    ctx = sc.ctx
    U = ctx.U
    u, v = grids(sc)
    vb = 0.73
    sc.put(sky(ctx, 'dia', vb, cirrus=False), np.ones((H, W), F32), 0)
    moon = (-0.62, -0.42, 0.52)
    m = massif(ctx, K2_C4, 0.585, 0.075, vb, xs=0.50, depth=0.84, a_deg=20, seed=41, pal='dia', rock_bias=0.10, sun=moon,
               pillars=[(0.36, 0.10, 1.0), (-0.40, 0.10, 0.8), (0.0, 0.08, 0.5)], haze_k=0.35)
    sc.put(m.rgb, m.alpha, 2)
    # gran serac bajo la cumbre: banda de hielo colgante con estrías verticales
    xc = m.xcol
    inb = smooth(0.02, 0.09, xc) * smooth(0.60, 0.47, xc)
    s_top = 0.865 - 0.27 * np.clip(xc - 0.03, 0, 1) + 0.014 * (lfbm(xc * 12, 0 * xc + 2, 3, 5) - 0.5)
    thick = (0.075 + 0.07 * lfbm(xc * 9, 0 * xc + 5, 3, 6, 'ridged')) * inb
    srow = (vb - v) * H / m.Hm
    on = (inb[None, :] > 0.04) * m.alpha
    band = smooth(0, 0.004, s_top[None, :] - srow) * smooth(0, 0.004, srow - (s_top - thick)[None, :]) * on
    fl = ridged(lnoise(u * W / ctx.unit * 120, v * H / ctx.unit * 6, 9))
    ice = mix(np.array((60, 96, 168), F32), np.array((196, 218, 240), F32), smooth(0.2, 0.8, fl)[..., None])
    ice = mixc(ice, (250, 252, 255), smooth(0.014, 0, s_top[None, :] - srow))
    ice = mixc(ice, (40, 60, 120), smooth(0.012, 0, srow - (s_top - thick)[None, :]) * 0.7)
    sc.put(ice, band, 2)
    below = (s_top - thick)[None, :] - srow
    shadow = smooth(0, 0.004, below) * smooth(0.05, 0, below) * on
    sc.T = mixc(sc.T, (50, 66, 128), 0.6 * shadow)
    # el Hombro: campo de nieve convexo que tapa el pie
    vfg = (vb - 0.060 - 0.035 * smooth(0.55, 0.0, u[0]) + 0.085 * smooth(0.62, 1.0, u[0]) + 0.006 * (crest(ctx, 4, 3, 3, 0) - 0.5)).astype(F32)
    al = np.clip((v - vfg[None, :]) * H + 0.5, 0, 1)
    snowfield(sc, al, 7, light=(moon[0], moon[1]), gain=0.5, und=0.7, base=0.60, sas=0.035)
    sc.T = mixc(sc.T, (236, 240, 250), 0.5 * smooth(0.02, 0, v - vfg[None, :]) * al)
    # noche
    sc.T = night(sc.T)
    skyn = sky(ctx, 'noche', vb + 0.1)
    sc.T = np.where((sc.reg == 0)[..., None], skyn, sc.T)
    mw = smooth(0.46, 0.80, ctx.fbm(2.2, 4, sx=0.6, sy=1.2)) * smooth(0.30, 0.0, np.abs((v - 0.02) - (u - 0.10) * 0.40)) * (sc.reg == 0)
    sc.T = mixc(sc.T, (92, 106, 160), 0.42 * mw)
    add_stars(sc, 1700, 5, vmax=0.74)
    # carpas encendidas
    tents = [(0.09, 0.775, 40, (238, 180, 56)), (0.275, 0.815, 52, (240, 190, 60)), (0.17, 0.865, 66, (236, 150, 40)),
             (0.375, 0.885, 70, (232, 120, 44))]
    for (tu, tv, ts, col) in tents:
        glow(sc, tu * W, tv * H + 4 * U, ts * U * 1.9, (110, 76, 26), 0.8)
        sc.add(tv * H, lambda p, tu=tu, tv=tv, ts=ts, col=col: tent(p, tu * W, tv * H, ts * U, col, glow=True))
    sc.add(0.87 * H, lambda p: climber(p, 0.455 * W, 0.872 * H, 64 * U, (150, 52, 46), (30, 34, 60), 1, 0.2))
    # hilera de frontales hacia el Cuello de Botella
    wx = np.array([0.30, 0.34, 0.375, 0.405, 0.43, 0.45, 0.465])
    Rw = np.interp(wx, [p_[0] for p_ in K2_C4], [p_[1] for p_ in K2_C4])
    ws = np.array([0.30, 0.38, 0.45, 0.51, 0.56, 0.60, 0.635])           # altura en pantalla (unidades s)
    hx_ = wx * m.Hm * m.xs + m.u0 * W
    hy_ = vb * H - ws * m.Hm
    path = [(0.50, 0.855), (0.555, 0.82), (0.61, 0.785), (0.655, 0.755), (0.69, 0.725), (0.715, 0.70)]
    lamps = [(a * W, b_ * H, 5.0 - 0.45 * i) for i, (a, b_) in enumerate(path)]
    lamps += [(float(hx_[i]), float(hy_[i]), 2.6 - 0.14 * i) for i in range(len(wx))]
    for (lx, ly, lr) in lamps:
        glow(sc, lx, ly, lr * U * 4, (80, 70, 40), 0.7)

    def lights(p):
        for (lx, ly, lr) in lamps:
            p.dot(lx, ly, lr * U * 1.9, (236, 200, 120))
            p.dot(lx, ly, lr * U, (255, 250, 226))
    sc.late.append(lights)
    return sc


# ============================================================================ 5. CUELLO DE BOTELLA (vista lateral)
def bottleneck(W, H):
    sc = Scene(W, H, seed=55, mode='dia')
    ctx = sc.ctx
    U = ctx.U
    u, v = grids(sc)
    vh = 0.70
    sc.put(sky(ctx, 'altura', vh + 0.04), np.ones((H, W), F32), 0)
    srgb, sal, _ = cloud_sea(ctx, vh, seed=14, f=0.4, scale=1.3, gap_thr=(0.34, 0.48))
    sc.put(srgb, sal, 1)
    # vecinos lejanos que asoman del mar de nubes
    for (P, u0, vt_, vb_, xs_, sd, lv, hk) in ((P_B, 0.70, 0.635, 0.80, 0.9, 81, 0.40, 2.0), (P_C, 0.99, 0.60, 0.84, 1.0, 83, 0.38, 1.7),
                                                (P_A, 0.855, 0.535, 0.95, 1.0, 85, 0.36, 1.2)):
        b = massif(ctx, P, u0, vt_, vb_, xs=xs_, a_deg=-10, seed=sd, pal='altura', level=lv, haze_k=hk, tmax=1.0, rock_bias=0.3)
        sc.put(b.rgb, b.alpha, 2)
    # pendiente de nieve: sube hacia la izquierda, se desploma a la derecha
    u1 = u[0]
    vs = np.where(u1 < 0.56, 0.47 + 0.36 * u1, 0.6716 + (u1 - 0.56) * 0.78) + 0.010 * (crest(ctx, 5, 3, 3, 0) - 0.5)
    vs = ndi.gaussian_filter1d(vs, 6 * U).astype(F32)
    al = np.clip((v - vs[None, :]) * H + 0.5, 0, 1)
    lam = snowfield(sc, al, 3, light=(0.75, -0.45), gain=0.8, sx=0.6, sy=1.2, und=0.8, base=0.62)
    sc.set_dir(al > 0.5, 0.52)
    # serac: muro de hielo desplomado; relieve facetado (torres + terrazas) iluminado desde la derecha
    vv = v[:, 0]
    rg = np.random.default_rng(7)
    kn = np.sort(np.concatenate([[0.0, 1.0], rg.uniform(0, 1, 26)]))
    zig = np.interp(vv, kn, rg.uniform(-0.5, 0.5, len(kn)))
    edge = 0.565 + 0.085 * np.sin(np.pi * np.clip(1 - vv / 0.69, 0, 1)) ** 0.8 + 0.036 * zig
    ser = np.clip((edge[:, None] - u) * W + 0.5, 0, 1) * np.clip((vs[None, :] - v) * H + 0.5, 0, 1)
    px_u = u * W / ctx.unit
    py_u = v * H / ctx.unit
    wob = (lnoise(px_u * 2.5, py_u * 2.5, 33) - 0.5) * 0.10
    c1 = ridged(lnoise((px_u + wob) * 7, py_u * 0.8, 34))               # grandes torres
    c2 = ridged(lnoise((px_u + wob * 0.5) * 24, py_u * 2.2, 35))        # estrías
    c3 = lnoise(px_u * 2.2 + 3, (py_u + wob * 1.5) * 7.5, 36)           # terrazas inclinadas
    hm = 0.60 * c1 + 0.22 * c2 + 0.30 * c3 + 0.9 * smooth(0.10, 0.0, edge[:, None] - u)
    hq = np.floor(hm * 5) / 5
    hm = 0.68 * hm + 0.32 * hq
    gy, gx = np.gradient(ndi.gaussian_filter(hm, 0.9 * U) * ctx.unit / 14.0)
    lam_s = np.clip(0.42 + 0.9 * (-gx * 0.85 - gy * (-0.35)), 0, 1)
    I = ramp([(0, (26, 50, 108)), (0.30, (70, 112, 178)), (0.55, (132, 172, 216)), (0.80, (212, 230, 246)), (1, (250, 253, 255))], lam_s)
    I = mixc(I, (24, 44, 100), smooth(0.10, 0.02, c1) * 0.8)
    de = (edge[:, None] - u)
    I = mixc(I, (248, 252, 255), smooth(0.030, 0.0, de) * 0.75)
    I = mixc(I, (36, 60, 122), smooth(0.09, 0.0, vs[None, :] - v) * 0.6)
    sc.put(I, ser, 2)
    sc.set_dir(ser > 0.5, np.pi / 2 - 0.06)
    # sombra del serac sobre la nieve
    shd = smooth(0.0, 0.01, v - vs[None, :]) * smooth(0.10, 0.02, v - vs[None, :]) * smooth(0.62, 0.50, u)
    sc.T = mixc(sc.T, (92, 120, 188), 0.75 * shd)
    # afloramientos de roca oscura
    rn = lfbm(px_u * 2.2, py_u * 3.0, 4, 40)
    dcorner = np.hypot((u - 0.0) * 1.9, (1.0 - v) * 1.15)
    rk = smooth(0.40, 0.36, dcorner + 0.16 * (rn - 0.5) + 0.05 * (lnoise(px_u * 9, py_u * 9, 43) - 0.5)) * al
    fine = lnoise(px_u * 50, py_u * 22, 41)
    R_ = mix(np.array((40, 42, 70), F32), np.array((120, 104, 98), F32), smooth(0.2, 0.9, 0.5 * fine + 0.3)[..., None])
    rr = ridged(lnoise(px_u * 6 + 0.4 * py_u, py_u * 16, 44))
    R_ = mixc(R_, (176, 150, 128), smooth(0.55, 0.9, rr) * 0.55)
    R_ = mixc(R_, (236, 240, 248), smooth(0.80, 0.88, lnoise(px_u * 5, py_u * 14, 42)) * 0.85)
    # (el afloramiento de roca se descartó: en la esquina competía con la hilera de escaladores)
    # huella de la travesía y escaladores en hilera con cuerda fija
    tu = np.linspace(0.07, 0.93, 60)
    tv = np.interp(tu, u1, vs) + np.interp(tu, [0.07, 0.5, 0.93], [0.060, 0.085, 0.060])
    for a, b_ in zip(tu, tv):
        d2 = ((u - a) * W) ** 2 + ((v - b_) * H * 2.0) ** 2
        sc.T = mixc(sc.T, (116, 138, 198), 0.5 * np.exp(-d2 / (7 * U * (0.6 + a)) ** 2))
    who = [(0.14, 30, (204, 60, 48)), (0.215, 36, (240, 170, 40)), (0.30, 43, (60, 110, 190)), (0.40, 54, (220, 70, 120)),
           (0.565, 74, (240, 150, 40)), (0.70, 92, (204, 60, 48))]
    anch = []
    for (a, hh, jk) in who:
        b_ = float(np.interp(a, tu, tv))
        sc.add(b_ * H, lambda p, a=a, b_=b_, hh=hh, jk=jk: climber(p, a * W, b_ * H + 2 * U, hh * U, jk, (36, 40, 70), -1, 0.45))
        anch.append((a * W - 0.2 * hh * U, b_ * H - 0.45 * hh * U))

    def rope(p):
        pts = [(0.05 * W, float(np.interp(0.05, tu, tv)) * H - 14 * U)] + anch + [(0.80 * W, float(np.interp(0.80, tu, tv)) * H - 30 * U)]
        p.line(pts, (236, 120, 40), 1.6 * U)
    sc.late.append(rope)
    return sc


# ============================================================================ 6. CUMBRE (luz dorada sobre el Karakórum)
def cumbre(W, H):
    sc = Scene(W, H, seed=66, mode='amanecer')
    ctx = sc.ctx
    U = ctx.U
    u, v = grids(sc)
    vh = 0.47
    sc.put(sky(ctx, 'oro', vh + 0.015), np.ones((H, W), F32), 0)
    srgb, sal, _ = cloud_sea(ctx, vh, seed=24, f=0.35, scale=1.2, haze=(236, 210, 190), lit=(255, 240, 214), shade=(146, 148, 192),
                             gaps=(74, 84, 136), gap_thr=(0.34, 0.47))
    sc.put(srgb, sal, 1)
    # una cordillera de fondo muy lavada y, delante, los gigantes vecinos como macizos 3D
    vl = 0.482 - 0.030 * crest(ctx, 9, 91, 5, 0.9, [(0.22, 0.03, 1.0), (0.62, 0.04, 0.8)]) * 0.62
    C, al = ridge_layer(ctx, vl.astype(F32), 91, rock=((80, 84, 130), (196, 160, 150)), snow=((132, 138, 190), (255, 230, 200)),
                        sun=(0.75, -0.35), haze=(226, 204, 196), haze_k=0.55, fade=0.05, fog=(236, 212, 194), fscale=3.0, snow_bias=0.2)
    sc.put(C, al, 4)
    sun = (0.80, -0.36, 0.38)
    peaks = [(P_C, 0.33, 0.438, 0.60, 0.80, 72, 0.40, 2.2), (P_B, 0.93, 0.430, 0.63, 0.85, 74, 0.38, 2.1),
             (P_A, 0.08, 0.425, 0.66, 0.90, 71, 0.36, 1.9), (P_B, 0.515, 0.405, 0.68, 0.90, 73, 0.34, 1.7),
             (P_C, 0.215, 0.50, 0.86, 1.0, 76, 0.30, 1.15), (P_A, 0.735, 0.455, 0.92, 1.05, 75, 0.27, 0.95)]
    for (P, u0, vt_, vb_, xs_, sd, lv, hk) in peaks:
        b = massif(ctx, P, u0, vt_, vb_, xs=xs_, a_deg=-7, seed=sd, pal='oro', sun=sun, level=lv, haze_k=hk, tmax=1.0, rock_bias=0.28)
        sc.put(b.rgb, b.alpha, 2)
    # jirones de niebla entre valles
    frgb, fal_ = cumulus(ctx, [(0.45, 0.80, 0.30, 0.03, 160)], soft=3.0, cut=(0.55, 0.35), contrast=0.55, seed=28,
                         tones=((150, 150, 192), (236, 216, 204), (255, 240, 216)))
    sc.put(frgb, fal_ * 0.8, 1)
    # cúpula de la cumbre
    u1 = u[0]
    vfg = 0.845 - 0.135 * np.exp(-((u1 - 0.36) / 0.33) ** 2) + 0.05 * smooth(0.6, 1.0, u1) + 0.006 * (crest(ctx, 5, 9, 3, 0) - 0.5)
    vfg = vfg.astype(F32)
    al = np.clip((v - vfg[None, :]) * H + 0.5, 0, 1)
    snowfield(sc, al, 5, light=(0.8, -0.3), shade=(112, 124, 184), lit=(255, 236, 204), gain=0.9, sx=0.4, sy=2.0, base=0.60)
    sc.T = mixc(sc.T, (108, 120, 184), 0.55 * smooth(0.34, 0.10, u) * al)
    sc.T = mixc(sc.T, (255, 244, 220), 0.6 * smooth(0.016, 0.0, v - vfg[None, :]) * al * smooth(0.2, 0.4, u))
    # huella que sube por la arista
    tu = np.linspace(0.40, 0.98, 46)
    tv = np.interp(tu, u1, vfg) + np.interp(tu, [0.40, 0.7, 0.98], [0.012, 0.06, 0.13])
    for a, b_ in zip(tu, tv):
        d2 = ((u - a) * W) ** 2 + ((v - b_) * H * 2.2) ** 2
        sc.T = mixc(sc.T, (120, 128, 188), 0.55 * np.exp(-d2 / (6 * U * (0.5 + 1.6 * (a - 0.3))) ** 2))
    xs_, ys_ = 0.385 * W, (float(np.interp(0.385, u1, vfg)) + 0.012) * H
    sc.add(ys_, lambda p: climber(p, xs_, ys_, 96 * U, (206, 58, 46), (40, 46, 84), 1, 0.05, pose='cheer'))
    x2, y2 = 0.47 * W, (float(np.interp(0.47, tu, tv)) + 0.004) * H
    sc.add(y2, lambda p: climber(p, x2, y2, 88 * U, (240, 176, 44), (40, 60, 120), -1, 0.40))
    x3, y3 = 0.60 * W, (float(np.interp(0.60, tu, tv)) + 0.004) * H
    sc.add(y3, lambda p: climber(p, x3, y3, 104 * U, (60, 112, 190), (150, 50, 46), -1, 0.50))
    xf, yf = 0.325 * W, (float(np.interp(0.325, u1, vfg)) + 0.008) * H

    def flag(p):
        p.line([(xf, yf), (xf - 4 * U, yf - 74 * U)], (40, 40, 52), 2.4 * U)
        flags(p, (xf - 4 * U, yf - 72 * U), (xf - 120 * U, yf + 30 * U), 16 * U, 9, 10 * U)
    sc.add(yf, flag)
    sc.late.append(lambda p: p.line([(xs_ - 10 * U, ys_ - 44 * U), (x2 + 14 * U, y2 - 42 * U), (x3 + 16 * U, y3 - 48 * U)], (236, 120, 40), 1.6 * U))
    return sc


SCENES = {'concordia': concordia, 'base': base, 'ruta': ruta, 'campo4': campo4, 'bottleneck': bottleneck, 'cumbre': cumbre}


def main():
    name, W, H, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
    SS = int(sys.argv[5]) if len(sys.argv) > 5 else 2
    t0 = time.time()

    def log(msg):
        print(f'[{time.time() - t0:6.1f}s] {msg}', flush=True)
    sc = SCENES[name](W, H)
    log('escena compuesta')
    if '--target' in sys.argv:
        from PIL import Image
        Image.fromarray(np.clip(sc.T, 0, 255).astype(np.uint8)).save(out)
        return
    sc.render(out, SS, log)
    log('listo')


if __name__ == '__main__':
    main()
