"""Variantes verticales (móvil) de las pechas, con el mismo generador y las mismas texturas.
Uso: python3 -I pechas_v.py <dir codigo/identidad> <salida> [escala]"""
import sys, os, inspect, json, math
SRC = sys.argv[1]; OUT = sys.argv[2]; S = int(sys.argv[3]) if len(sys.argv) > 3 else 2
sys.path.insert(0, SRC)
import numpy as np
import pechas as P
from pechas import *  # noqa

def variant(fn, name, subs):
    src = inspect.getsource(fn)
    src = '\n'.join(l for l in src.splitlines() if not l.startswith('@reg'))
    for a, b in subs:
        assert a in src, (name, a)
        src = src.replace(a, b)
    src = src.replace('def %s(' % fn.__name__, 'def %s(' % name, 1)
    ns = vars(P)
    exec(compile(src, name, 'exec'), ns)
    P.T[name] = ns[name]

variant(P.t_gastado, 'gastado_v', [('wn, hn = 1200, 440', 'wn, hn = 360, 600'),
        ('safe = (28 + 46, 28 + 26, wn - 2 * (28 + 46) - 60, hn - 2 * (28 + 26))',
         'safe = (28 + 22, 28 + 26, wn - 2 * (28 + 22) - 30, hn - 2 * (28 + 26))'),
        ("for i in range(5):\n        cx, cy = (0.2 + 0.75 * rng.random()) * w, (0.15 + 0.7 * rng.random()) * h",
         "for i in range(3):\n        cx, cy = (0.86 + 0.08 * rng.random()) * w, (0.10 + 0.8 * rng.random()) * h")])
variant(P.t_suelta, 'suelta_v', [('wn, hn = 640, 300', 'wn, hn = 380, 360'),
        ('binding_circle(d, 70 * S, h / 2, 16 * S, S, seed + 2)', 'binding_circle(d, 52 * S, h / 2, 16 * S, S, seed + 2)'),
        ('np.hypot(xx - 70 * S, yy - h / 2)', 'np.hypot(xx - 52 * S, yy - h / 2)'),
        ('hx, hy = p + 70 * S, p + h / 2 + 3 * S', 'hx, hy = p + 52 * S, p + h / 2 + 3 * S'),
        ('safe = (70 + 34, 22 + 24, wn - (70 + 34) - 22 - 24 - 50, hn - 2 * (22 + 24))',
         'safe = (52 + 30, 22 + 44, wn - (52 + 30) - 22 - 18, hn - (22 + 44) - (22 + 22))')])
variant(P.t_tapa, 'tapa_v', [('wn, hn = 1200, 300', 'wn, hn = 440, 200'),
        ('band_out, band_in = 12 * S, 64 * S', 'band_out, band_in = 8 * S, 44 * S'),
        ('step = 46 * S', 'step = 32 * S'),
        ('wdt = 17 * S * (1 - s * s) ** 0.8\n                ln = 19 * S * (s + 1)\n                pts.append((cx + nx * (ln - 2 * S) + ux * wdt',
         'wdt = 12 * S * (1 - s * s) ** 0.8\n                ln = 13 * S * (s + 1)\n                pts.append((cx + nx * (ln - 2 * S) + ux * wdt'),
        ('wdt = 17 * S * (1 - s * s) ** 0.8\n                ln = 19 * S * (s + 1)\n                pts.append((cx + nx * (ln - 2 * S) - ux * wdt',
         'wdt = 12 * S * (1 - s * s) ** 0.8\n                ln = 13 * S * (s + 1)\n                pts.append((cx + nx * (ln - 2 * S) - ux * wdt'),
        ('for cx, cy in ((36 * S, 36 * S), (w - 36 * S, 36 * S), (36 * S, h - 36 * S), (w - 36 * S, h - 36 * S)):',
         'for cx, cy in ((26 * S, 26 * S), (w - 26 * S, 26 * S), (26 * S, h - 26 * S), (w - 26 * S, h - 26 * S)):'),
        ('smooth(20 * S, 17 * S, r /', 'smooth(14 * S, 12 * S, r /'),
        ('cx0, cy0, cx1, cy1 = 150 * S, 84 * S, w - 150 * S, h - 84 * S', 'cx0, cy0, cx1, cy1 = 64 * S, 58 * S, w - 64 * S, h - 58 * S'),
        ('safe = (150 + 22, 84 + 14, wn - 2 * (150 + 22), hn - 2 * (84 + 14))', 'safe = (64 + 16, 58 + 8, wn - 2 * (64 + 16), hn - 2 * (58 + 8))')])
variant(P.t_brocado, 'brocado_v', [('wn, hn = 1000, 660', 'wn, hn = 380, 560'),
        ('bx0, bx1 = 40 * S, w - 40 * S', 'bx0, bx1 = 22 * S, w - 22 * S'),
        ('m1 = 70 * S', 'm1 = 34 * S'),
        ('dx0, dx1 = w / 2 - 120 * S, w / 2 + 120 * S', 'dx0, dx1 = w / 2 - 64 * S, w / 2 + 64 * S'),
        ('safe = ((ix0 / S) + 22, (iy0 / S) + 18, (ix1 - ix0) / S - 44, (iy1 - iy0) / S - 36)',
         'safe = ((ix0 / S) + 18, (iy0 / S) + 16, (ix1 - ix0) / S - 36, (iy1 - iy0) / S - 32)')])
variant(P.t_fardo, 'fardo_v', [('wn, hn = 1200, 520', 'wn, hn = 380, 620'),
        ('r0 = 46 * S', 'r0 = 34 * S'),
        ('bx0, bx1 = 168 * S, 206 * S', 'bx0, bx1 = 46 * S, 76 * S'),
        ('band = smooth(-1 * S, 1 * S, np.minimum(xx - bx0, bx1 - xx)) * a', 'band = smooth(-1 * S, 1 * S, np.minimum(yy - bx0, bx1 - yy)) * a'),
        ('lx0, ly0, lw, lh = 262, 62, 870, 396', 'lx0, ly0, lw, lh = 24, 100, 332, 494'),
        ('np.hypot((xx - (bx0 + bx1) / 2) / 1.25, yy - 74 * S)', 'np.hypot(xx - 74 * S, (yy - (bx0 + bx1) / 2) / 1.25)'),
        ('tx0, ty0 = int(p - 56 * S), int(p + 300 * S)', 'tx0, ty0 = int(p - 56 * S), int(p + 430 * S)'),
        ('safe = (lx0 + 30 + 22, ly0 + 30 + 20, lw - 2 * (30 + 22), lh - 2 * (30 + 20))',
         'safe = (lx0 + 30 + 14, ly0 + 30 + 16, lw - 2 * (30 + 14), lh - 2 * (30 + 16))')])
variant(P.t_tira, 'tira_v', [('wn, hn = 1400, 150', 'wn, hn = 360, 1120'),
        ('wobbly(d, [(70 * S, h / 2), (w - 70 * S, h / 2)], S, 0.9, seed + 3)', 'wobbly(d, [(108 * S, 64 * S), (108 * S, h - 64 * S)], S, 0.9, seed + 3)'),
        ('for xx_ in (44 * S, w - 44 * S):\n            binding_circle(d, xx_, h / 2, 13 * S, S, seed + 4)',
         'for yy_ in (40 * S, h - 40 * S):\n            binding_circle(d, 108 * S, yy_, 13 * S, S, seed + 4)'),
        ('safe = (80, 26, wn - 160, hn - 52)', 'safe = (26, 66, wn - 52, hn - 132)')])

def t_folio_v(S, seed=111, wn=360, hn=720):
    """Folio vertical: paneles arriba (medallón y ka) y abajo (círculo del cordel)."""
    W, H, p = canvas(wn, hn, S)
    big_rgb = np.zeros((H, W, 3), np.float32); big_a = np.zeros((H, W), np.float32)
    big_rgb, big_a = stack_under(big_rgb, big_a, wn, hn, S, p, p, seed, n=4)
    col, a, _ = leaf(wn, hn, S, seed)
    w, h = wn * S, hn * S
    m = 28 * S; band = 78 * S
    def frame(d):
        pecha_frame(d, m, m, w - m, h - m, S, seed + 5)
        wobbly(d, [(m + 5 * S, m + band), (w - m - 5 * S, m + band)], S, 1.0, seed + 7)
        wobbly(d, [(m + 5 * S, h - m - band), (w - m - 5 * S, h - m - band)], S, 1.0, seed + 8)
        binding_circle(d, w / 2, h - m - band / 2, 19 * S, S, seed + 10)
    ink = ink_layer(h, w, S, frame, seed + 11)
    col = put_ink(col, ink, 'regla')
    guide = np.zeros((h, w), np.float32)
    for yy in np.arange(m + band + 34 * S, h - m - band - 20 * S, 30 * S):
        guide[int(yy):int(yy) + max(1, S // 2), int(m + 14 * S):int(w - m - 14 * S)] = 1
    col = col * (1 - 0.05 * blur(guide, 0.4 * S)[..., None])
    mc, mm, ml, mr = medallion(h, w, S, w / 2, m + band / 2, 25 * S, seed + 12)
    col = col * (1 - 0.92 * mm[..., None]) + 0.92 * mc * mm[..., None]
    col = put_ink(col, ml * 0.9, 'tinta'); col = put_ink(col, mr * 0.9, 'regla')
    g = tibetan_glyph('ཀ', 36 * S, None)
    tib = stamp(np.zeros((h, w), np.float32), g, m + 22 * S, m + band / 2 - g.shape[0] / 2)
    col = put_ink(col, blur(tib, 0.3 * S) * 0.95, 'tinta')
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = w / 2, h - m - band / 2
    hole = smooth(4.2 * S, 3.0 * S, np.hypot(xx - cx, yy - cy))
    a = a * (1 - hole)
    col = col * (1 - 0.45 * smooth(7 * S, 4 * S, np.hypot(xx - cx, yy - cy)))[..., None]
    R = place(big_a.shape, col, p, p); A = place(big_a.shape, a, p, p)
    big_rgb, big_a = over(big_rgb, big_a, R, A)
    rgb_, a_ = finish(big_rgb, big_a, S)
    safe = (28 + 20, 28 + 78 + 18, wn - 2 * (28 + 20), hn - 2 * (28 + 78 + 18))
    return rgb_, a_, dict(nominal=(wn, hn), safe=safe, texto=HEX['tinta'], uso='Texto largo en móvil.', titulo='Folio vertical')

P.T['folio_v'] = t_folio_v
P.T['folio_v2'] = lambda S: t_folio_v(S, seed=121, wn=360, hn=900)
names = sys.argv[4].split(',') if len(sys.argv) > 4 else ['folio_v', 'folio_v2', 'gastado_v', 'suelta_v', 'tapa_v', 'brocado_v', 'fardo_v', 'tira_v']
P.build(names, OUT, S)
