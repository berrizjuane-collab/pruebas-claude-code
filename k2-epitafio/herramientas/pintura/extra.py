"""extra.py — escenas nuevas para la web «K2 · Epitafio», pintadas con el mismo motor
("pincel seco sobre fondo oscuro") que las seis ilustraciones originales.

Uso: python3 extra.py <escena> <ancho> <alto> <salida.png> [SS] [--meta salida.json]
Escenas: ruta_placa, ruta_linea, anfiteatro, horizonte, baltoro, gilkey
"""
import sys
import json
import time
import numpy as np
from scipy import ndimage as ndi
from PIL import Image
from paint import F32, smooth, mix, mixc, ridged, lum, ramp, paint, rebrush, finish
from kit import (Scene, Proxy, massif, sky, night, cumulus, mist, cloud_sea, crest, ridge_layer, side_wall,
                 plane_coords, lnoise, lfbm, stone, tent, climber, flags, scatter_stones, _sc)
import scenes as S0
from scenes import grids, snowfield, add_stars, glow, K2_SUR, K2_SE, P_A, P_B, P_C


# ---------------------------------------------------------------- utilidades
def set_unit(sc, unit):
    """Fija la unidad de trazo. En panorámicas se usa la de un 16:9 de la misma altura,
    para que la pincelada mida lo mismo en pantalla que en el resto de ilustraciones."""
    sc.ctx.unit = float(unit)
    sc.ctx.U = sc.ctx.unit / 1946.0


class _Win:
    def __init__(self, W, H):
        self.W, self.H = W, H


def massif_win(ctx, prof, u0, v_top, v_base, **kw):
    """massif() calculado solo en la ventana de columnas que ocupa (ahorra memoria en panorámicas)."""
    W, H = ctx.W, ctx.H
    Hm = (v_base - v_top) * H
    xs = kw.get('xs', 1.0)
    P = np.array(prof, F32)
    xa = int(max(0, np.floor(u0 * W + (P[0, 0] - 0.12) * Hm * xs)))
    xb = int(min(W, np.ceil(u0 * W + (P[-1, 0] + 0.12) * Hm * xs)))
    m = massif(_Win(xb - xa, H), prof, (u0 * W - xa) / (xb - xa), v_top, v_base, **kw)
    rgb = np.zeros((H, W, 3), F32)
    al = np.zeros((H, W), F32)
    fe = np.ones(xb - xa, F32)
    k = max(2, int(0.05 * Hm))
    if xa > 0:
        fe[:k] = np.linspace(0, 1, k) ** 2
    if xb < W:
        fe[-k:] = np.linspace(1, 0, k) ** 2
    rgb[:, xa:xb] = m.rgb
    al[:, xa:xb] = m.alpha * fe[None, :]
    m.xa, m.xb = xa, xb
    return rgb, al, m


def render(sc, out, SS=2, log=print, finish_seed=None):
    """Como Scene.render, pero permite resembrar el acabado: dos variantes de una misma
    escena (con y sin la línea de ruta) salen idénticas píxel a píxel fuera de lo añadido."""
    ctx = sc.ctx
    sc.T = np.clip(sc.T, 0, 255)
    log('pintando…')
    canvas = paint(ctx, sc.T, sc.reg, SS, sc.dir, log)
    p = Proxy(canvas, SS)
    for _, fn in sorted(sc.items, key=lambda t: t[0]):
        fn(p)
    rebrush(ctx, canvas, p.m, SS, log)
    p.mask_on = False
    for fn in sc.late:
        fn(p)
    img = canvas.resize((sc.W, sc.H), Image.LANCZOS) if SS > 1 else canvas
    if finish_seed is not None:
        ctx.rng = np.random.default_rng(finish_seed)
    log('acabado…')
    res = finish(ctx, img, sc.reg, sc.mode, log)
    res.save(out)
    return res


# ============================================================================ RUTA (placa limpia + capa de línea)
def _ruta(W, H, with_items):
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
    frgb, fal_ = cumulus(ctx, [(0.30, 0.90, 0.30, 0.04, 200), (0.75, 0.93, 0.30, 0.04, 200)], soft=3.0, cut=(0.55, 0.35), contrast=0.6, seed=18)
    sc.put(frgb, fal_ * 0.85, 1)
    crgb, cal = cumulus(ctx, [(0.14, 1.00, 0.22, 0.050, 320), (0.82, 1.03, 0.24, 0.055, 340), (0.48, 1.05, 0.18, 0.040, 200)], seed=8)
    sc.put(crgb, cal, 1)
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
    vis = hr > lvl + 0.03

    def route(p):
        on = ((seg // dash) % 2 == 0) & vis
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
    camps = []
    for hc in (0.31, 0.47, 0.65, 0.80):
        k = int(np.argmin(np.abs(hr - hc) + (q > 0.8) * 9))
        if hr[k] < lvl + 0.03:
            continue
        camps.append(k)
    k = len(q) - 1
    if with_items:
        sc.add(0, route)
        for kk in camps:
            sc.add(py[kk], lambda p, k=kk: tent(p, px[k] + 26 * U, py[k] + 8 * U, 21 * U, (242, 204, 60)))
        sc.add(py[k] - 1, lambda p: (p.line([(px[k], py[k] + 2 * U), (px[k], py[k] - 34 * U)], (40, 40, 52), 2.4 * U),
                                     p.poly([(px[k], py[k] - 34 * U), (px[k] + 24 * U, py[k] - 27 * U), (px[k], py[k] - 19 * U)], (214, 52, 40))))
    idx = np.nonzero(vis)[0]
    sc.meta = dict(
        size=[W, H],
        route=[[round(float(px[i]) / W, 5), round(float(py[i]) / H, 5)] for i in idx],
        height=[round(float(hr[i]), 4) for i in idx],
        camps=[dict(i=int(np.searchsorted(idx, kk)), x=round(float(px[kk]) / W, 5), y=round(float(py[kk]) / H, 5),
                    tent=[round(float(px[kk] + 26 * U) / W, 5), round(float(py[kk] + 8 * U) / H, 5)]) for kk in camps],
        summit=[round(float(px[k]) / W, 5), round(float(py[k]) / H, 5)],
        shoulder=int(np.searchsorted(idx, int(0.72 * 399))),
    )
    return sc


def ruta_placa(W, H):
    return _ruta(W, H, False)


def ruta_linea(W, H):
    return _ruta(W, H, True)


# ============================================================================ ANFITEATRO (panorámica desde Concordia)
BROAD = [(-2.3, 0.02), (-1.8, 0.16), (-1.35, 0.40), (-1.08, 0.62), (-0.92, 0.735), (-0.80, 0.66), (-0.62, 0.78),
         (-0.46, 0.90), (-0.36, 0.945), (-0.24, 0.87), (-0.10, 0.955), (0, 1.0), (0.10, 0.955), (0.24, 0.86),
         (0.42, 0.74), (0.62, 0.62), (0.90, 0.47), (1.25, 0.31), (1.7, 0.15), (2.2, 0.02)]
G4 = [(-1.9, 0.02), (-1.4, 0.15), (-1.0, 0.33), (-0.72, 0.52), (-0.52, 0.70), (-0.36, 0.88), (-0.25, 0.965), (-0.12, 0.985),
      (0, 1.0), (0.10, 0.972), (0.22, 0.955), (0.30, 0.90), (0.40, 0.76), (0.54, 0.62), (0.74, 0.47), (1.0, 0.31), (1.4, 0.15),
      (1.9, 0.02)]
G2 = [(-1.6, 0.03), (-0.9, 0.40), (-0.45, 0.72), (-0.16, 0.92), (0, 1.0), (0.14, 0.93), (0.36, 0.78), (0.52, 0.80),
      (0.80, 0.55), (1.2, 0.30), (1.7, 0.03)]
CHOGO = [(-2.2, 0.02), (-1.6, 0.20), (-1.15, 0.44), (-0.88, 0.66), (-0.72, 0.86), (-0.62, 0.965), (-0.52, 1.0), (-0.30, 0.955),
         (0.0, 0.915), (0.30, 0.885), (0.52, 0.90), (0.62, 0.86), (0.78, 0.66), (1.0, 0.46), (1.4, 0.24), (2.0, 0.02)]
MITRE = [(-1.3, 0.02), (-0.9, 0.16), (-0.62, 0.34), (-0.42, 0.50), (-0.30, 0.56), (-0.20, 0.78), (-0.10, 0.93), (0, 1.0),
         (0.07, 0.94), (0.15, 0.80), (0.24, 0.70), (0.33, 0.745), (0.42, 0.60), (0.58, 0.42), (0.85, 0.22), (1.25, 0.02)]
BKANG = [(-1.8, 0.02), (-1.1, 0.34), (-0.6, 0.70), (-0.30, 0.90), (-0.12, 0.97), (0, 1.0), (0.30, 0.96), (0.55, 0.985),
         (0.75, 0.88), (1.0, 0.60), (1.4, 0.28), (1.9, 0.02)]

# (clave, perfil, u0, v_cima, v_base, xs, prof., áng., semilla, sesgo de roca, brillo, neblina, pilares)
PANO = [
    ('g2', G2, 0.468, 0.365, 0.665, 0.80, 0.80, 12, 210, 0.20, (0.25, 0.55), 2.3, ()),
    ('bkangri', BKANG, 0.702, 0.385, 0.665, 0.95, 0.80, 12, 220, -0.10, (0.25, 0.55), 2.2, ()),
    ('k2', K2_SUR, 0.170, 0.085, 0.660, 0.66, 0.82, 15, 7, 0.34, (0.34, 0.58), 1.0,
     [(-0.06, 0.10, 1.0), (0.40, 0.08, 0.9), (-0.40, 0.09, 0.7), (0.85, 0.10, 0.5)]),
    ('chogolisa', CHOGO, 0.818, 0.265, 0.665, 0.74, 0.80, 14, 230, -0.42, (0.28, 0.56), 1.45, ()),
    ('g4', G4, 0.582, 0.150, 0.665, 0.60, 0.84, 16, 240, 0.50, (0.22, 0.46), 1.0,
     [(0.0, 0.16, 1.3), (-0.42, 0.10, 0.8), (0.40, 0.09, 0.8)]),
    ('broad', BROAD, 0.365, 0.175, 0.672, 0.78, 0.82, 15, 250, 0.26, (0.34, 0.58), 0.85,
     [(-0.05, 0.12, 1.0), (-0.55, 0.10, 0.9), (0.45, 0.10, 0.8), (-0.95, 0.08, 0.6)]),
    ('mitre', MITRE, 0.928, 0.070, 0.700, 0.56, 0.80, 18, 260, 0.58, (0.50, 0.80), 0.55,
     [(0.0, 0.07, 1.2), (0.32, 0.06, 0.8), (-0.3, 0.07, 0.7)]),
]


def anfiteatro(W, H):
    sc = Scene(W, H, seed=77, mode='amanecer')
    set_unit(sc, H * 4.0 / 3.0)
    ctx = sc.ctx
    U = ctx.U
    u, v = grids(sc)
    vb = 0.665
    sc.put(sky(ctx, 'oro', vb + 0.02, glow_side=-1), np.ones((H, W), F32), 0)
    crgb, cal = cumulus(ctx, [(0.275, 0.50, 0.10, 0.030, 70), (0.655, 0.47, 0.08, 0.026, 60), (0.985, 0.36, 0.08, 0.030, 60)],
                        warm=True, seed=4, tones=((150, 134, 172), (236, 190, 168), (255, 232, 196)))
    sc.put(crgb, cal * 0.9, 1)
    # cordillera lejana que cierra el horizonte
    vl = (vb - 0.012 - 0.115 * crest(ctx, 7.0, 301, 5, 0.9) * 0.9).astype(F32)
    C, al = ridge_layer(ctx, vl, 301, rock=((70, 72, 118), (176, 140, 140)), snow=((120, 124, 180), (250, 214, 184)),
                        sun=(-0.7, -0.4), haze=(196, 170, 186), haze_k=0.50, fscale=2.4, snow_bias=0.25)
    sc.put(C, al, 4)
    sun = (-0.74, -0.46, 0.36)
    meta = {}
    for (key, P, u0, vt, vbm, xs, dp, ang, sd, rb, gl, hk, pil) in PANO:
        rgb, al, m = massif_win(ctx, P, u0, vt, vbm, xs=xs, depth=dp, a_deg=ang, seed=sd, sun=sun, pal='amanecer',
                                rock_bias=rb, glow=gl, haze_k=hk, pillars=pil)
        sc.put(rgb, al, 2)
        meta[key] = [round(u0 + (-0.52 * (vbm - vt) * H * xs / W if key == 'chogolisa' else 0), 4), round(vt, 4)]
    # muro oscuro que enmarca por la izquierda (Marble Peak)
    shade = dict(rock=((38, 38, 76), (96, 84, 116)), snow=((96, 102, 158), (172, 160, 198)), sun=(-0.7, -0.4),
                 haze=(168, 146, 178), haze_k=0.20, snow_depth=0.10, snow_bias=-0.10)
    C, al, _ = side_wall(ctx, vb + 0.03, 0.47, 31, 'L', inner=0.085, **shade)
    sc.put(C, al, 3)
    # glaciares: dos planos en perspectiva que confluyen (Godwin-Austen y alto Baltoro)
    G = None
    for (uvp, sd) in ((0.265, 5), (0.690, 15)):
        Xw, Z, yy = plane_coords(ctx, vb - 0.012, uvp, 0.42)
        band = lnoise(Xw * 1.5 + 1.1 * lnoise(Z * 0.35, Xw * 0.3, sd - 2) + 0.4 * lnoise(Z * 1.3, 0.5, sd - 1), Z * 0.04, sd)
        mor = smooth(0.50, 0.70, band + 0.45 * (lfbm(Xw * 7, Z * 2.2, 3, sd + 3) - 0.5))
        rub = lfbm(Xw * 16, Z * 16, 4, sd + 4, 'billow')
        ice = mix(np.array((128, 138, 192), F32), np.array((178, 180, 216), F32), smooth(0.2, 0.7, 1 - rub)[..., None])
        mo = mix(np.array((58, 58, 92), F32), np.array((104, 96, 126), F32), smooth(0.25, 0.8, rub)[..., None])
        g = ice + (mo - ice) * mor[..., None]
        g = mixc(g, (176, 152, 182), smooth(0.10, 0.0, yy) * 0.9)
        if G is None:
            G, ang0 = g, np.arctan2((v - (vb - 0.012)) * H, (u - uvp) * W)
        else:
            wz = smooth(0.43, 0.53, u + 0.05 * (ctx.fbm(3, 3) - 0.5))
            G = G + (g - G) * wz[..., None]
            ang1 = np.arctan2((v - (vb - 0.012)) * H, (u - uvp) * W)
            ang0 = np.where(wz > 0.5, ang1, ang0)
    gal = np.clip((v - (vb - 0.004)) * H, 0, 1)
    sc.put(G, gal, 4)
    sc.set_dir(gal > 0.5, ang0)
    mc, ma = mist(ctx, vb + 0.005, width=0.07, k=0.62, color=(206, 176, 190))
    sc.put(mc, ma, 1)
    # primer plano: lomo de morrena
    cr = crest(ctx, 9.0, 5, 4, 0.2)
    u1 = u[0]
    vfg = 0.875 + 0.045 * np.sin(u1 * 9.0 + 0.6) * 0.5 - 0.03 * cr + 0.03 * smooth(0.0, 0.10, u1) * 0 - 0.035 * np.exp(-((u1 - 0.47) / 0.10) ** 2)
    vfg = vfg.astype(F32)
    below = v - vfg[None, :]
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
    scatter_stones(sc, region, 1250, lambda s, r: (2.5 + 34 * s ** 1.4) * r.uniform(0.35, 1.0) ** 1.6 * 1.7, 3,
                   dark=(26, 28, 50), light=(104, 104, 150))
    k = 0.80
    for (tu, col, ts) in ((0.452, (236, 190, 70), 54), (0.487, (222, 110, 60), 50), (0.420, (200, 70, 66), 44), (0.512, (64, 112, 190), 40)):
        x = tu * W
        y = (vfg[int(x)] + 0.024) * H
        sc.add(y, lambda p, x=x, y=y, ts=ts, col=col: tent(p, x, y, ts * U, _sc(col, k), sun_right=False))
    for (cu_, hh, jk, f) in ((0.538, 66, (196, 62, 56), -1), (0.551, 60, (64, 110, 180), -1), (0.268, 62, (236, 150, 40), 1)):
        x = cu_ * W
        y = (vfg[int(x)] + 0.032) * H
        sc.add(y + 1, lambda p, x=x, y=y, hh=hh, jk=jk, f=f: climber(p, x, y, hh * U, _sc(jk, 0.85), (40, 44, 80), f, 0.05, axe=False))
    sc.meta = dict(size=[W, H], peaks=meta)
    return sc


# ============================================================================ HORIZONTE (1856, desde el Haramukh)
MASH = [(-1.9, 0.03), (-1.2, 0.30), (-0.7, 0.60), (-0.40, 0.78), (-0.22, 0.86), (-0.10, 0.97), (0, 1.0), (0.10, 0.95),
        (0.22, 0.985), (0.34, 0.90), (0.55, 0.70), (0.85, 0.46), (1.3, 0.22), (1.9, 0.03)]
K2_FAR = [(-1.7, 0.03), (-1.1, 0.28), (-0.62, 0.58), (-0.36, 0.78), (-0.16, 0.93), (0, 1.0), (0.12, 0.93), (0.25, 0.82),
          (0.40, 0.79), (0.56, 0.66), (0.85, 0.42), (1.25, 0.20), (1.7, 0.03)]


def theodolite(p, x, y, s, k=1.0):
    """Trípode de madera y teodolito de latón, visto de perfil."""
    wood = _sc((96, 70, 52), k)
    brass = _sc((214, 168, 84), k)
    dark = (30, 30, 44)
    top = (x, y - 1.00 * s)
    for dx in (-0.36, 0.05, 0.40):
        p.line([top, (x + dx * s, y)], wood, max(1.0, 0.045 * s))
    p.poly([(x - 0.10 * s, top[1]), (x + 0.10 * s, top[1]), (x + 0.08 * s, top[1] - 0.10 * s), (x - 0.08 * s, top[1] - 0.10 * s)], dark)
    p.dot(x, top[1] - 0.24 * s, 0.13 * s, brass)
    p.dot(x, top[1] - 0.24 * s, 0.07 * s, _sc(brass, 0.6))
    p.line([(x - 0.30 * s, top[1] - 0.20 * s), (x + 0.34 * s, top[1] - 0.32 * s)], brass, max(1.0, 0.07 * s))
    p.line([(x + 0.30 * s, top[1] - 0.31 * s), (x + 0.38 * s, top[1] - 0.325 * s)], _sc(brass, 1.2), max(1.0, 0.09 * s))


def surveyor(p, x, y, h, coat=(52, 58, 92), face=1, bend=0.0, hat=(196, 180, 150)):
    """Figura de abrigo largo; bend>0 la inclina hacia el instrumento."""
    f = face
    dark = (28, 30, 46)
    hip = (x, y - 0.47 * h)
    sh = (x + f * bend * 0.30 * h, y - 0.80 * h + bend * 0.08 * h)
    hd = (sh[0] + f * (0.04 + 0.10 * bend) * h, sh[1] - 0.11 * h)
    lw = max(0.8, 0.10 * h)
    p.line([hip, (x - f * 0.08 * h, y - 0.22 * h), (x - f * 0.10 * h, y)], dark, lw)
    p.line([hip, (x + f * 0.07 * h, y - 0.24 * h), (x + f * 0.10 * h, y)], dark, lw)
    p.poly([(sh[0] - f * 0.11 * h, sh[1]), (sh[0] + f * 0.11 * h, sh[1] + 0.02 * h), (hip[0] + f * 0.15 * h, hip[1] + 0.16 * h),
            (hip[0] - f * 0.15 * h, hip[1] + 0.16 * h)], coat)
    hand = (sh[0] + f * 0.26 * h, sh[1] + 0.10 * h)
    p.line([sh, hand], _sc(coat, 0.8), lw * 0.75)
    p.dot(hd[0], hd[1], 0.075 * h, (214, 170, 140))
    p.poly([(hd[0] - 0.12 * h, hd[1] - 0.03 * h), (hd[0] + 0.12 * h, hd[1] - 0.03 * h), (hd[0] + 0.07 * h, hd[1] - 0.12 * h),
            (hd[0] - 0.07 * h, hd[1] - 0.12 * h)], hat)


def range_layer(ctx, vline, seed, dark, light, snow, haze, haze_k, sun=(0.75, -0.4), relief=1.0, snowline=0.022,
                fade=0.12, fog=None, freq=9.0):
    """Cordillera lejana bajo vline: relieve de ruido 'ridged' isótropo, nieve en la cresta y bruma hacia abajo."""
    W, H = ctx.W, ctx.H
    v = ((np.arange(H) + 0.5) / H)[:, None] * np.ones((1, W), F32)
    below = v - vline[None, :]
    alpha = np.clip(below * H + 0.5, 0, 1)
    X = (np.arange(W)[None, :] / ctx.unit) * np.ones((H, 1), F32)
    Y = below * H / ctx.unit
    wx = X + (lnoise(X * 4, Y * 4, seed) - 0.5) * 0.10
    wy = Y + (lnoise(X * 4 + 9, Y * 4 + 3, seed + 1) - 0.5) * 0.10
    hm = lfbm(wx * freq, wy * freq * 1.25, 5, seed + 2, 'ridged') ** 1.35 * 0.075 - np.abs(Y) * 0.55
    px = 1.0 / ctx.unit
    gy, gx = np.gradient(ndi.gaussian_filter(hm, 0.7 * ctx.U), px, px)
    lam = np.clip(0.50 + relief * 0.40 * (-gx * sun[0] - gy * sun[1]), 0, 1)
    lit = smooth(0.25, 0.80, lam)
    C = mix(np.array(dark, F32), np.array(light, F32), lit[..., None])
    nz = lfbm(wx * 16, wy * 16, 3, seed + 7)
    snw = smooth(snowline, 0.0, below + 0.03 * (nz - 0.5)) * (0.45 + 0.55 * lit)
    C = mixc(C, snow, snw)
    C = mixc(C, haze, haze_k)
    if fade:
        C = mixc(C, fog if fog is not None else haze, smooth(0, fade, below) * 0.9)
    return C.astype(F32), alpha.astype(F32)


def horizonte(W, H):
    sc = Scene(W, H, seed=88, mode='amanecer')
    ctx = sc.ctx
    U = ctx.U
    u, v = grids(sc)
    vb = 0.575
    sc.put(sky(ctx, 'amanecer', vb + 0.03), np.ones((H, W), F32), 0)
    crgb, cal = cumulus(ctx, [(0.16, 0.50, 0.14, 0.022, 70), (0.90, 0.47, 0.12, 0.020, 60)],
                        warm=True, seed=14, tones=((150, 130, 170), (232, 176, 160), (255, 226, 190)))
    sc.put(crgb, cal * 0.85, 1)
    sun = (0.80, -0.42, 0.34)
    meta = {}
    # el Karakórum a 200 km: una línea blanca y dos picos que sobresalen
    vl = (vb - 0.012 - 0.060 * crest(ctx, 10.0, 401, 5, 0.9) * 0.9).astype(F32)
    C, al = range_layer(ctx, vl, 401, (150, 140, 190), (250, 214, 196), (255, 232, 206), (216, 182, 190), 0.55,
                        sun=(0.75, -0.35), snowline=0.05, fade=0.06, fog=(222, 186, 190), freq=12.0)
    sc.put(C, al, 4)
    for (key, P, u0, vt, xs, sd, hk) in (('k1', MASH, 0.335, 0.432, 0.86, 411, 2.1), ('k2', K2_FAR, 0.612, 0.338, 0.68, 413, 1.75)):
        b = massif(ctx, P, u0, vt, vb + 0.005, xs=xs, a_deg=6, seed=sd, pal='amanecer', sun=sun, haze_k=hk, rock_bias=0.10,
                   glow=(0.30, 0.62))
        sc.put(b.rgb, b.alpha, 2)
        meta[key] = [round(u0, 4), round(vt, 4)]
    mc, ma = mist(ctx, vb, width=0.05, k=0.72, color=(226, 186, 186))
    sc.put(mc, ma, 1)
    # cordilleras intermedias, cada una más oscura y más cercana
    layers = [(0.612, 0.070, 7.0, 421, (112, 110, 166), (190, 160, 184), (236, 204, 204), (196, 168, 190), 0.50, 0.10, 11.0),
              (0.672, 0.085, 5.2, 431, (80, 84, 142), (150, 132, 166), (214, 190, 204), (172, 152, 184), 0.36, 0.11, 9.0),
              (0.745, 0.100, 3.8, 441, (56, 62, 116), (120, 108, 148), (196, 180, 204), (150, 138, 174), 0.22, 0.12, 7.5)]
    for i, (v0, amp, xsc, sd, dark, light, snow, hz, hk, fd, fq) in enumerate(layers):
        vl = (v0 - amp * crest(ctx, xsc, sd, 5, 1.0)).astype(F32)
        C, al = range_layer(ctx, vl, sd, dark, light, snow, hz, hk, snowline=0.016 + 0.004 * i, fade=fd, fog=(188, 164, 188), freq=fq)
        sc.put(C, al, 4)
        mc, ma = mist(ctx, v0 + 0.040, width=0.04, k=0.50 - 0.1 * i, color=(204, 176, 192))
        sc.put(mc, ma, 1)
    # la cumbre del Haramukh: roca oscura y nieve en primer plano
    u1 = u[0]
    cr = crest(ctx, 3.2, 451, 4, 0.5)
    vfg = (0.930 - 0.185 * np.exp(-((u1 - 0.215) / 0.20) ** 2) - 0.030 * cr + 0.045 * smooth(0.55, 1.0, u1)).astype(F32)
    below = v - vfg[None, :]
    fal = np.clip(below * H + 0.5, 0, 1)
    tx = lfbm(u * W / ctx.unit * 14, below * H / ctx.unit * 24, 4, 461, 'billow')
    F = mix(np.array((30, 32, 60), F32), np.array((82, 74, 104), F32), smooth(0.2, 0.75, tx)[..., None])
    F = mixc(F, (176, 150, 150), smooth(0.014, 0.0, below) * smooth(0.25, 0.5, u) * 0.55)
    sn = smooth(0.50, 0.60, ctx.fbm(4, 3, sx=0.5, sy=1.6) + 0.10 * smooth(0.0, 0.06, below))
    F = mixc(F, (150, 152, 204), sn * 0.9)
    F = mixc(F, (236, 210, 200), sn * smooth(0.02, 0.0, below) * 0.5)
    sc.put(F, fal, 5)

    def region(rng):
        x = rng.uniform(0, W)
        i = int(min(W - 1, x))
        y = rng.uniform(vfg[i] * H, H)
        return x, y, (y / H - vfg[i]) / (1 - vfg[i] + 1e-6)
    scatter_stones(sc, region, 300, lambda s, r: (3 + 30 * s ** 1.3) * r.uniform(0.35, 1.0) ** 1.6 * 1.7, 13,
                   dark=(24, 26, 50), light=(110, 104, 144))
    xt = 0.215 * W
    yt = (vfg[int(xt)] + 0.014) * H
    sc.add(yt, lambda p: theodolite(p, xt, yt, 118 * U, 0.92))
    xs1 = 0.168 * W
    ys1 = (vfg[int(xs1)] + 0.016) * H
    sc.add(ys1 + 1, lambda p: surveyor(p, xs1, ys1, 150 * U, (56, 60, 96), 1, 0.55))
    xs2 = 0.105 * W
    ys2 = (vfg[int(xs2)] + 0.020) * H
    sc.add(ys2 + 1, lambda p: surveyor(p, xs2, ys2, 138 * U, (120, 70, 56), 1, 0.0, hat=(232, 226, 210)))
    sc.meta = dict(size=[W, H], peaks=meta, theodolite=[round(float(xt) / W, 4), round(float(yt - 150 * U) / H, 4)])
    return sc


# ============================================================================ BALTORO (porteadores hacia Concordia)
TORRE = [(-1.2, 0.02), (-0.8, 0.14), (-0.52, 0.30), (-0.36, 0.40), (-0.26, 0.66), (-0.17, 0.90), (-0.09, 0.975), (0, 1.0),
         (0.09, 0.97), (0.15, 0.86), (0.22, 0.60), (0.30, 0.50), (0.44, 0.44), (0.60, 0.30), (0.85, 0.14), (1.2, 0.02)]
TORRE2 = [(-1.3, 0.02), (-0.8, 0.20), (-0.50, 0.44), (-0.38, 0.62), (-0.30, 0.66), (-0.18, 0.92), (-0.08, 0.985), (0, 1.0),
          (0.10, 0.93), (0.20, 0.72), (0.30, 0.78), (0.38, 0.64), (0.52, 0.40), (0.80, 0.20), (1.3, 0.02)]
CATED = [(-1.5, 0.02), (-1.0, 0.24), (-0.70, 0.50), (-0.56, 0.74), (-0.48, 0.70), (-0.36, 0.90), (-0.28, 0.84), (-0.14, 0.98),
         (0, 1.0), (0.12, 0.90), (0.22, 0.95), (0.36, 0.76), (0.48, 0.80), (0.62, 0.56), (0.90, 0.30), (1.4, 0.02)]


def porter(p, x, y, h, cloth=(150, 140, 126), load=(60, 104, 170), face=1, kind='caja'):
    """Porteador balti: shalwar kameez, gorro de lana, bastón y la carga más alta que la cabeza."""
    f = face
    dark = (38, 36, 48)
    hip = (x, y - 0.45 * h)
    sh = (x + f * 0.08 * h, y - 0.78 * h)
    hd = (sh[0] + f * 0.05 * h, sh[1] - 0.11 * h)
    lw = max(0.8, 0.11 * h)
    p.line([hip, (x - f * 0.14 * h, y - 0.22 * h), (x - f * 0.18 * h, y)], _sc(cloth, 0.62), lw)
    p.line([hip, (x + f * 0.13 * h, y - 0.23 * h), (x + f * 0.17 * h, y)], _sc(cloth, 0.70), lw)
    # la carga, atada a la espalda
    bx = sh[0] - f * 0.20 * h
    if kind == 'bidon':
        p.poly([(bx - 0.15 * h, sh[1] - 0.34 * h), (bx + 0.15 * h, sh[1] - 0.36 * h), (bx + 0.16 * h, sh[1] + 0.22 * h),
                (bx - 0.14 * h, sh[1] + 0.24 * h)], load)
        p.line([(bx - 0.15 * h, sh[1] - 0.30 * h), (bx + 0.15 * h, sh[1] - 0.32 * h)], _sc(load, 0.6), max(0.6, 0.03 * h))
        p.poly([(bx + f * 0.02 * h, sh[1] - 0.34 * h), (bx + f * 0.15 * h, sh[1] - 0.36 * h), (bx + f * 0.16 * h, sh[1] + 0.22 * h),
                (bx + f * 0.04 * h, sh[1] + 0.23 * h)], _sc(load, 1.25))
    else:
        p.poly([(bx - 0.20 * h, sh[1] - 0.30 * h), (bx + 0.19 * h, sh[1] - 0.33 * h), (bx + 0.20 * h, sh[1] + 0.20 * h),
                (bx - 0.19 * h, sh[1] + 0.22 * h)], load)
        p.poly([(bx - 0.20 * h, sh[1] - 0.30 * h), (bx + 0.19 * h, sh[1] - 0.33 * h), (bx + 0.19 * h, sh[1] - 0.20 * h),
                (bx - 0.20 * h, sh[1] - 0.17 * h)], _sc(load, 1.28))
        p.line([(bx, sh[1] - 0.32 * h), (bx + 0.01 * h, sh[1] + 0.21 * h)], _sc(load, 0.55), max(0.6, 0.03 * h))
    # túnica larga
    p.poly([(sh[0] - f * 0.10 * h, sh[1]), (sh[0] + f * 0.10 * h, sh[1] + 0.02 * h), (hip[0] + f * 0.13 * h, hip[1] + 0.14 * h),
            (hip[0] - f * 0.12 * h, hip[1] + 0.13 * h)], cloth)
    hand = (sh[0] + f * 0.24 * h, sh[1] + 0.26 * h)
    p.line([sh, hand], _sc(cloth, 0.82), lw * 0.75)
    p.line([(hand[0], hand[1] - 0.12 * h), (hand[0] + f * 0.05 * h, y)], (70, 54, 44), max(0.6, 0.03 * h))
    p.dot(hd[0], hd[1], 0.078 * h, (176, 132, 104))
    p.poly([(hd[0] - 0.105 * h, hd[1] - 0.02 * h), (hd[0] + 0.105 * h, hd[1] - 0.02 * h), (hd[0] + 0.085 * h, hd[1] - 0.10 * h),
            (hd[0] - 0.085 * h, hd[1] - 0.10 * h)], (120, 96, 74))


def baltoro(W, H):
    sc = Scene(W, H, seed=99, mode='dia')
    ctx = sc.ctx
    U = ctx.U
    u, v = grids(sc)
    vb = 0.600
    sc.put(sky(ctx, 'dia', vb), np.ones((H, W), F32), 0)
    crgb, cal = cumulus(ctx, [(0.50, 0.30, 0.10, 0.030, 70), (0.74, 0.44, 0.10, 0.034, 70)], seed=16)
    sc.put(crgb, cal, 1)
    # al fondo del glaciar, la pirámide del Gasherbrum IV
    b = massif(ctx, G4, 0.585, 0.335, vb + 0.01, xs=0.62, depth=0.84, a_deg=14, seed=240, pal='dia', rock_bias=0.42, haze_k=1.9,
               pillars=[(0.0, 0.16, 1.3)])
    sc.put(b.rgb, b.alpha, 2)
    vl = (vb - 0.008 - 0.070 * crest(ctx, 8.0, 501, 5, 0.9) * (0.4 + 0.6 * smooth(0.0, 0.25, np.abs(u[0] - 0.585)))).astype(F32)
    C, al = ridge_layer(ctx, vl, 501, haze_k=0.55, fscale=2.4, snow_bias=0.15)
    sc.put(C, al, 4)
    mc, ma = mist(ctx, vb, width=0.05, k=0.6)
    sc.put(mc, ma, 1)
    # torres de granito a los lados (grupo del Trango a la izquierda, Catedrales a la derecha)
    gran = dict(pal='dia', depth=0.78, a_deg=20, tmax=1.0)
    for (P, u0, vt, vbm, xs, sd, rb, hk, pil) in (
            (TORRE2, 0.335, 0.250, vb + 0.03, 0.62, 511, 0.50, 1.25, [(0.0, 0.08, 1.2)]),
            (CATED, 0.855, 0.165, vb + 0.05, 0.66, 513, 0.55, 0.95, [(0.0, 0.09, 1.0), (-0.36, 0.07, 0.9), (0.22, 0.07, 0.9)]),
            (TORRE, 0.150, 0.060, vb + 0.07, 0.62, 515, 0.75, 0.70, [(0.0, 0.09, 1.5), (-0.30, 0.06, 0.7)])):
        m = massif(ctx, P, u0, vt, vbm, xs=xs, seed=sd, rock_bias=rb, haze_k=hk, pillars=pil, strata=0.25, **gran)
        sc.put(m.rgb, m.alpha, 2)
    wk = dict(rock=((60, 62, 90), (166, 140, 114)), snow=((130, 152, 200), (250, 246, 236)), haze_k=0.16, snow_depth=0.06, snow_bias=-0.22)
    C, al, _ = side_wall(ctx, vb + 0.07, 0.50, 67, 'R', inner=0.17, **wk)
    sc.put(C, al, 3)
    C, al, _ = side_wall(ctx, vb + 0.08, 0.30, 61, 'L', inner=0.06, **wk)
    sc.put(C, al, 3)
    # el glaciar: río de hielo y morrenas que apunta al Gasherbrum IV
    uvp = 0.585
    Xw, Z, yy = plane_coords(ctx, vb - 0.014, uvp, 0.46)
    band = lnoise(Xw * 1.3 + 1.0 * lnoise(Z * 0.35, Xw * 0.3, 23) + 0.4 * lnoise(Z * 1.3, 0.5, 24), Z * 0.04, 25)
    mor = smooth(0.44, 0.62, band + 0.45 * (lfbm(Xw * 7, Z * 2.2, 3, 28) - 0.5))
    rub = lfbm(Xw * 14, Z * 14, 4, 29, 'billow')
    ice = mix(np.array((150, 176, 214), F32), np.array((240, 244, 248), F32), smooth(0.2, 0.7, 1 - rub)[..., None])
    mo = mix(np.array((70, 68, 82), F32), np.array((168, 154, 140), F32), smooth(0.2, 0.8, rub)[..., None])
    G = ice + (mo - ice) * mor[..., None]
    G = mixc(G, (200, 210, 228), smooth(0.08, 0.0, yy) * 0.85)
    gal = np.clip((v - (vb - 0.004)) * H, 0, 1)
    sc.put(G, gal, 4)
    sc.set_dir(gal > 0.5, np.arctan2((v - (vb - 0.014)) * H, (u - uvp) * W))
    # primer plano de morrena: la senda
    u1 = u[0]
    vfg = (0.825 + 0.030 * np.sin(u1 * 5.2 + 1.0) - 0.020 * crest(ctx, 4.0, 521, 4, 0.2) + 0.03 * smooth(0.6, 1.0, u1)).astype(F32)
    below = v - vfg[None, :]
    Xp, Zp, yp = plane_coords(ctx, 0.74, 0.55, 0.5)
    rub = lfbm(Xp * 10, Zp * 10, 4, 35, 'billow')
    big = lfbm(Xp * 1.4, Zp * 1.4, 3, 36)
    F = mix(np.array((74, 72, 84), F32), np.array((176, 162, 148), F32), smooth(0.15, 0.75, rub + 0.5 * (big - 0.5))[..., None])
    F = mixc(F, (236, 240, 246), smooth(0.62, 0.70, lfbm(Xp * 2.2, Zp * 2.2, 3, 42)) * 0.85)
    F = mixc(F, (200, 204, 216), smooth(0.014, 0, below) * 0.5)
    fal = np.clip(below * H + 0.5, 0, 1)
    sc.put(F, fal, 5)

    def region(rng):
        x = rng.uniform(0, W)
        i = int(min(W - 1, x))
        y = rng.uniform(vfg[i] * H, H)
        return x, y, (y / H - vfg[i]) / (1 - vfg[i])
    scatter_stones(sc, region, 560, lambda s, r: (2.2 + 38 * s ** 1.5) * r.uniform(0.3, 1.0) ** 1.7 * 1.8, 14,
                   dark=(50, 50, 66), light=(192, 180, 166))
    # la hilera de porteadores: remonta la banda de hielo claro hacia el fondo del glaciar
    vh = vb - 0.014
    cloths = [(126, 112, 98), (98, 104, 122), (142, 122, 96), (110, 100, 92), (132, 126, 118), (104, 108, 96), (138, 118, 100), (112, 106, 118)]
    loads = [((56, 104, 176), 'bidon'), ((204, 70, 52), 'caja'), ((236, 190, 64), 'caja'), ((56, 104, 176), 'bidon'),
             ((70, 140, 96), 'caja'), ((226, 112, 48), 'caja'), ((56, 104, 176), 'bidon'), ((204, 70, 52), 'caja')]
    vv_ = [0.835, 0.792, 0.757, 0.728, 0.704, 0.684, 0.668, 0.655]
    who = []
    for i, b_ in enumerate(vv_):
        a = uvp + (0.262 - uvp) * (b_ - vh) / (0.80 - vh)
        who.append((a, b_, 520 * (b_ - vh) + 8, cloths[i], loads[i][0], loads[i][1]))
    for (a, b_, hh, cl, ld, kd) in who:
        d2 = ((u - a - 0.006) * W) ** 2 + ((v - b_ - 0.002) * H * 3.0) ** 2
        sc.T = mixc(sc.T, (120, 136, 176), 0.55 * np.exp(-d2 / (0.42 * hh * U) ** 2))
        sc.add(b_ * H, lambda p, a=a, b_=b_, hh=hh, cl=cl, ld=ld, kd=kd: porter(p, a * W, b_ * H, hh * U, cl, ld, 1, kd))
    sc.meta = dict(size=[W, H], g4=[0.585, 0.335])
    return sc


# ============================================================================ GILKEY (el memorial al anochecer)
def plaque(p, x, y, w, h, rot, tone, rng):
    """Placa de metal remachada a la roca; algunas son platos de aluminio."""
    c, s = np.cos(rot), np.sin(rot)
    pts = [(x + (dx * c - dy * s), y + (dx * s + dy * c)) for dx, dy in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]
    p.poly([(a + 0.10 * w, b + 0.12 * h) for a, b in pts], (14, 16, 30))
    p.poly(pts, tone)
    hi = [(x + (dx * c - dy * s), y + (dx * s + dy * c)) for dx, dy in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, -h / 2 + 0.26 * h), (-w / 2, -h / 2 + 0.22 * h))]
    p.poly(hi, _sc(tone, 1.25))
    for k in range(int(rng.integers(2, 4))):
        yy = -h / 2 + (0.42 + 0.2 * k) * h
        a = (x + (-0.32 * w * c - yy * s), y + (-0.32 * w * s + yy * c))
        b = (x + (rng.uniform(0.05, 0.32) * w * c - yy * s), y + (rng.uniform(0.05, 0.32) * w * s + yy * c))
        p.line([a, b], _sc(tone, 0.55), max(0.6, 0.05 * h))


def gilkey(W, H):
    sc = Scene(W, H, seed=111, mode='noche')
    ctx = sc.ctx
    U = ctx.U
    u, v = grids(sc)
    vb = 0.80
    sc.put(sky(ctx, 'dia', vb, cirrus=False), np.ones((H, W), F32), 0)
    # la cara sur, desde abajo: ocupa media pantalla
    sun = (0.80, -0.42, 0.30)
    m = massif(ctx, K2_SUR, 0.37, 0.050, vb, xs=0.86, depth=0.90, a_deg=24, seed=19, pal='dia', rock_bias=0.26, sun=sun,
               pillars=[(-0.06, 0.10, 1.0), (0.40, 0.08, 1.0), (-0.42, 0.09, 0.8), (0.85, 0.10, 0.5)], haze_k=0.5)
    sc.put(m.rgb, m.alpha, 2)
    alp = m.alpha * smooth(0.64, 0.93, m.s) * smooth(120, 215, lum(m.rgb))
    # glaciar y morrena a los pies
    Xg, Zg, yg = plane_coords(ctx, vb - 0.02, 0.37, 0.4)
    gl = mix(np.array((150, 170, 206), F32), np.array((226, 232, 242), F32), smooth(0.3, 0.7, lfbm(Xg * 3, Zg * 0.4, 3, 77))[..., None])
    gl = mixc(gl, (120, 122, 140), smooth(0.56, 0.70, lnoise(Xg * 2.2, Zg * 0.05, 78)) * 0.6)
    gal = np.clip((v - (vb - 0.006)) * H, 0, 1)
    sc.put(gl, gal, 4)
    mc, ma = mist(ctx, vb + 0.004, width=0.06, k=0.6)
    sc.put(mc, ma, 1)
    # el espolón de roca del memorial, a la derecha
    u1 = u[0]
    cr = crest(ctx, 5.0, 601, 5, 0.9)
    vfg = (1.02 - 0.50 * smooth(0.40, 0.86, u1) ** 1.25 - 0.045 * cr * smooth(0.36, 0.6, u1) + 0.10 * smooth(0.90, 1.0, u1)).astype(F32)
    below = v - vfg[None, :]
    fal = np.clip(below * H + 0.5, 0, 1)
    px_u = u * W / ctx.unit
    py_u = v * H / ctx.unit
    rr = ridged(lnoise(px_u * 7 + 0.5 * py_u, py_u * 9, 611))
    blk = lfbm(px_u * 3.2, py_u * 3.2, 3, 613)
    lam = np.clip(0.30 + 0.55 * rr + 0.5 * (blk - 0.5) + 0.35 * smooth(0.03, 0.0, below), 0, 1)
    R = mix(np.array((34, 34, 52), F32), np.array((150, 132, 122), F32), smooth(0.2, 0.9, lam)[..., None])
    R = mixc(R, (196, 180, 170), smooth(0.016, 0.0, below) * 0.55)
    sc.put(R, fal, 3)
    # anochecer: todo vira al azul; solo la punta guarda la última luz
    day = sc.T.copy()
    sc.T = (0.72 * night(day) + 0.28 * day * np.array((0.52, 0.60, 0.92), F32)).astype(F32)
    skyn = ramp([(0, (10, 14, 40)), (0.45, (30, 44, 96)), (0.80, (80, 86, 140)), (1, (150, 124, 150))], np.clip(v / (vb + 0.02), 0, 1))
    skyn = skyn + ((ctx.fbm(2.5, 4, sx=0.5) - 0.5) * 12)[..., None]
    sc.T = np.where((sc.reg == 0)[..., None], skyn, sc.T)
    sc.T = mixc(sc.T, (255, 170, 128), 0.78 * alp)
    add_stars(sc, 520, 6, vmax=0.42)
    # carpas del campo base, encendidas allá abajo
    for (tu, tv, ts, col) in ((0.085, 0.905, 30, (238, 180, 56)), (0.150, 0.935, 36, (236, 150, 40)), (0.215, 0.898, 26, (240, 190, 60)),
                              (0.285, 0.948, 40, (232, 120, 44)), (0.040, 0.955, 34, (240, 190, 60))):
        glow(sc, tu * W, tv * H + 3 * U, ts * U * 1.9, (110, 76, 26), 0.75)
        sc.add(tv * H, lambda p, tu=tu, tv=tv, ts=ts, col=col: tent(p, tu * W, tv * H, ts * U, col, glow=True))
    def region(rng):
        x = rng.uniform(0.42 * W, W)
        i = int(min(W - 1, x))
        if vfg[i] > 0.99:
            return None
        y = rng.uniform(vfg[i] * H, H)
        return x, y, (y / H - vfg[i]) / (1 - vfg[i] + 1e-6)
    scatter_stones(sc, region, 150, lambda s, r: (5 + 26 * s ** 1.2) * r.uniform(0.4, 1.0) ** 1.5 * 1.6, 23,
                   dark=(20, 22, 42), light=(92, 94, 132))
    # placas, platos y nombres sobre la roca
    rg = np.random.default_rng(31)
    plates = []
    tries = 0
    while len(plates) < 34 and tries < 4000:
        tries += 1
        a = rg.uniform(0.50, 0.985)
        i = int(a * W)
        lo, hi = vfg[i] + 0.035, min(0.975, vfg[i] + 0.40)
        if hi - lo < 0.02:
            continue
        b_ = rg.uniform(lo, hi)
        s = rg.uniform(40, 82) * U * (0.75 + 0.6 * (b_ - 0.5))
        if any(abs(a * W - q[0]) < 0.62 * (s + q[2]) and abs(b_ * H - q[1]) < 0.50 * (s + q[2]) for q in plates):
            continue
        plates.append((a * W, b_ * H, s))
    for (x, y, s) in plates:
        tone = _sc((126, 138, 168), rg.uniform(0.72, 1.12))
        if rg.random() < 0.24:
            sc.add(y, lambda p, x=x, y=y, s=s, tone=tone: (p.dot(x + 0.05 * s, y + 0.06 * s, 0.40 * s, (14, 16, 30)), p.dot(x, y, 0.40 * s, tone),
                                                            p.dot(x, y, 0.27 * s, _sc(tone, 0.80)), p.dot(x - 0.05 * s, y - 0.06 * s, 0.12 * s, _sc(tone, 1.3))))
        else:
            rot = rg.uniform(-0.16, 0.16)
            st = np.random.default_rng(int(rg.integers(1 << 30)))
            sc.add(y, lambda p, x=x, y=y, s=s, rot=rot, tone=tone, st=st: plaque(p, x, y, s, s * 0.64, rot, tone, st))
    # mojón y banderas en lo alto
    xc = 0.862 * W
    yc = (vfg[int(xc)] + 0.006) * H

    def cairn(p):
        rgc = np.random.default_rng(3)
        for i in range(6):
            stone(p, xc + rgc.uniform(-4, 4) * U, yc - i * 11 * U, (20 - 2.4 * i) * U, rgc, dark=(30, 32, 54), light=(118, 116, 150))
        p.line([(xc, yc - 54 * U), (xc, yc - 150 * U)], (24, 24, 36), 2.6 * U)
    sc.add(yc + 2, cairn)
    sc.late.append(lambda p: (flags(p, (xc, yc - 148 * U), (0.60 * W, (vfg[int(0.60 * W)] + 0.02) * H), 34 * U, 17, 11 * U),
                              flags(p, (xc, yc - 148 * U), (0.995 * W, (vfg[int(0.985 * W)] - 0.02) * H), 20 * U, 9, 11 * U)))
    sc.meta = dict(size=[W, H])
    return sc


SCENES = {'ruta_placa': ruta_placa, 'ruta_linea': ruta_linea, 'anfiteatro': anfiteatro, 'horizonte': horizonte,
          'baltoro': baltoro, 'gilkey': gilkey}


def main():
    name, W, H, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
    rest = sys.argv[5:]
    SS = int(rest[0]) if rest and rest[0].isdigit() else 2
    t0 = time.time()

    def log(msg):
        print(f'[{time.time() - t0:6.1f}s] {msg}', flush=True)
    sc = SCENES[name](W, H)
    log('escena compuesta')
    if '--meta' in rest:
        with open(rest[rest.index('--meta') + 1], 'w') as f:
            json.dump(getattr(sc, 'meta', {}), f)
    if '--target' in rest:
        Image.fromarray(np.clip(sc.T, 0, 255).astype(np.uint8)).save(out)
        return
    render(sc, out, SS, log, finish_seed=20261115)
    log('listo')


if __name__ == '__main__':
    main()
