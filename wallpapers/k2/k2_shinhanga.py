"""
K2 al crepúsculo — grabado shin-hanga procedural.

Ilustración de K2 (8611 m) vista desde Concordia, mirando al norte por el
glaciar Godwin-Austen, en el estilo de los grabados japoneses en madera del
movimiento shin-hanga (Hiroshi Yoshida): planos de color posterizados,
degradados "bokashi", textura de papel washi y un sello rojo.

Salida: PNG a resolución de iPhone (1320x2868, 9:19.5).
Requiere solo numpy y Pillow.
"""

import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1320, 2868
rng = np.random.default_rng(8611)

YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)


# ---------------------------------------------------------------- utilidades
def hexc(s):
    s = s.lstrip("#")
    return np.array([int(s[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    t = np.asarray(t, np.float32)
    if t.ndim == 2:
        t = t[..., None]
    return a * (1 - t) + b * t


def noise(cell_x, cell_y, seed, h=H, w=W):
    """Ruido de valor suave: rejilla aleatoria ampliada con bicúbico."""
    r = np.random.default_rng(seed)
    gh, gw = int(h / cell_y) + 4, int(w / cell_x) + 4
    g = r.random((gh, gw)).astype(np.float32)
    im = Image.fromarray(g, "F").resize((int(gw * cell_x), int(gh * cell_y)), Image.BICUBIC)
    a = np.asarray(im)
    oy, ox = int(cell_y), int(cell_x)
    return a[oy:oy + h, ox:ox + w]


def fbm(cell, seed, octaves=5, aniso=(1.0, 1.0), h=H, w=W):
    tot, amp, norm = 0.0, 1.0, 0.0
    for o in range(octaves):
        c = cell / (2 ** o)
        if c < 1.5:
            break
        tot = tot + amp * noise(c * aniso[0], c * aniso[1], seed + o * 97, h, w)
        norm += amp
        amp *= 0.5
    return tot / norm


def poly_interp(pts, x):
    pts = np.array(pts, np.float32)
    return np.interp(x, pts[:, 0], pts[:, 1])


def seg_dist(px, py, ax, ay, bx, by):
    """Distancia de cada píxel al segmento AB y parámetro t sobre él."""
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy + 1e-9
    t = np.clip(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1)
    qx, qy = ax + t * dx, ay + t * dy
    return np.hypot(px - qx, py - qy), t


def blur(a, sigma):
    """Desenfoque gaussiano separable (Pillow no lo hace en modo 'F')."""
    r = max(1, int(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    out = np.zeros_like(a)
    p = np.pad(a, ((0, 0), (r, r)), mode="edge")
    for i, w in enumerate(k):
        out += w * p[:, i:i + a.shape[1]]
    p = np.pad(out, ((r, r), (0, 0)), mode="edge")
    out = np.zeros_like(a)
    for i, w in enumerate(k):
        out += w * p[i:i + a.shape[0], :]
    return out


def over(base, color, alpha):
    a = np.clip(alpha, 0, 1)[..., None]
    return base * (1 - a) + color * a


def mottle(seed, amt=0.035):
    """Moteado de la tinta al estampar con el baren."""
    n = fbm(60, seed, 4) - 0.5
    return 1.0 + amt * 2 * n


# ---------------------------------------------------------------- paleta
P = dict(
    sky_top=hexc("#141a33"), sky_hi=hexc("#262c52"), sky_mid=hexc("#4a4675"),
    sky_low=hexc("#9b7896"), sky_glow=hexc("#f0b9a0"), sky_hor=hexc("#f7d6b4"),
    # nieve con luz alpina (alpenglow)
    a_snow=[hexc("#b48aa8"), hexc("#e3a9ae"), hexc("#fbd0bf"), hexc("#ffeedf")],
    a_rock=[hexc("#573c5c"), hexc("#7f4c62"), hexc("#a8635f"), hexc("#c98271")],
    # en sombra crepuscular
    t_snow=[hexc("#4f5a8a"), hexc("#6b77a8"), hexc("#8b97c4"), hexc("#a6b1d8")],
    t_rock=[hexc("#2a2f55"), hexc("#383e69"), hexc("#4b5282"), hexc("#5d6493")],
    haze=hexc("#8f93bf"),
    ridge_far=hexc("#4d5487"), ridge_far_snow=hexc("#8a93c2"),
    ridge_mid=hexc("#2f355f"), ridge_mid_snow=hexc("#5f6899"),
    ridge_near=hexc("#1d2243"),
    ice_far=hexc("#a4add6"), ice_near=hexc("#5c6797"),
    moraine=hexc("#3a3e63"), moraine_lt=hexc("#555a83"),
    ground=hexc("#141730"), ground_rim=hexc("#2c3160"),
    moon=hexc("#fbefd2"), seal=hexc("#b8352a"), paper=hexc("#f4ecdd"),
)

img = np.zeros((H, W, 3), np.float32)

# ================================================================= CIELO
t = YY / 1800.0
sky = mix(P["sky_top"], P["sky_hi"], smoothstep(0.0, 0.35, t))
sky = mix(sky, P["sky_mid"], smoothstep(0.28, 0.62, t))
sky = mix(sky, P["sky_low"], smoothstep(0.55, 0.85, t))
# resplandor del ocaso más cálido hacia el oeste (izquierda)
west = 1.0 - XX / W
sky = mix(sky, P["sky_glow"], smoothstep(0.70, 1.0, t) * (0.55 + 0.45 * west))
sky = mix(sky, P["sky_hor"], smoothstep(0.86, 1.0, t) * west * 0.8)
# bandas bokashi horizontales, muy sutiles
band = 0.5 + 0.5 * np.sin(YY / 55.0 + fbm(400, 3, 3) * 4)
sky *= (1.0 + 0.012 * (band - 0.5))[..., None]
sky *= mottle(11, 0.02)[..., None]
img[:] = sky

# estrellas: más densas arriba, se apagan hacia el horizonte
n_st = 520
sx = rng.random(n_st) * W
sy = (rng.random(n_st) ** 1.6) * 1250
sb = rng.random(n_st) ** 3
star = np.zeros((H, W), np.float32)
for x, y, b in zip(sx, sy, sb):
    xi, yi = int(x), int(y)
    r = 1 if b < 0.85 else 2
    fade = 1.0 - smoothstep(500, 1250, y)
    star[max(yi - r, 0):yi + r, max(xi - r, 0):xi + r] += (0.25 + 0.75 * b) * fade
star = blur(star, 0.7)
img = over(img, hexc("#fff6e6"), np.clip(star * 1.6, 0, 0.9))

# luna creciente (al oeste, cerca del sol ya puesto)
mx, my, mr = 240.0, 700.0, 30.0
d1 = np.hypot(XX - mx, YY - my)
d2 = np.hypot(XX - (mx + 13), YY - (my - 8))
moon = np.clip(mr - d1 + 0.5, 0, 1) * np.clip(d2 - (mr - 2) + 0.5, 0, 1)
halo = np.exp(-((d1 / 110.0) ** 2)) * 0.18
img = over(img, P["sky_glow"], halo)
img = over(img, P["moon"], moon)

# ================================================================= K2
# Geometría (u, v): u horizontal y v altura, ambos en unidades de la altura
# aparente de la montaña. Perfil tomado de la vista clásica desde Concordia:
# a la derecha la arista Abruzzi con el Hombro (~7600-7800 m) casi plano;
# a la izquierda la arista SO, larga y escalonada.
XS, YB, HK = 650.0, 1770.0, 830.0
U = (XX - XS) / HK
V = (YB - YY) / HK

right = [(0, 1.0), (0.025, 0.996), (0.06, 0.978), (0.10, 0.948), (0.14, 0.915),
         (0.18, 0.884), (0.215, 0.852), (0.245, 0.815), (0.27, 0.792), (0.30, 0.781),
         (0.36, 0.774), (0.42, 0.766), (0.47, 0.755), (0.505, 0.738), (0.535, 0.705),
         (0.58, 0.640), (0.63, 0.570), (0.69, 0.495), (0.75, 0.425), (0.81, 0.365),
         (0.88, 0.310), (0.98, 0.255)]
left = [(-1.0, 0.24), (-0.90, 0.285), (-0.80, 0.335), (-0.72, 0.385),
        (-0.64, 0.440), (-0.57, 0.495), (-0.51, 0.548), (-0.45, 0.610),
        (-0.38, 0.685), (-0.33, 0.738), (-0.29, 0.775), (-0.255, 0.808),
        (-0.225, 0.828), (-0.205, 0.840), (-0.185, 0.858), (-0.15, 0.893),
        (-0.11, 0.932), (-0.07, 0.966), (-0.035, 0.990), (0, 1.0)]
u_line = (np.arange(W, dtype=np.float32) - XS) / HK
v_sky = np.where(u_line >= 0, poly_interp(right, u_line), poly_interp(left, u_line))
# dentado rocoso de la cresta
jag = (fbm(18, 21, 4, h=8, w=W)[4] - 0.5) * 9 + (fbm(5, 22, 2, h=8, w=W)[4] - 0.5) * 3
y_sky = YB - v_sky * HK + jag
k2_mask = np.clip(YY - y_sky[None, :] + 0.5, 0, 1)

# --- campo de "alturas" de aristas: tiendas de campaña sobre polilíneas
ridges = [
    # (puntos u,v ; prominencia ; pendiente)
    (left[::-1], 1.0, 2.2),                       # arista O/SO (silueta)
    (right, 1.0, 2.2),                            # arista Abruzzi (silueta)
    ([(-0.02, 0.975), (-0.08, 0.86), (-0.17, 0.70), (-0.27, 0.52),
      (-0.35, 0.33), (-0.42, 0.12), (-0.46, -0.05)], 0.95, 2.0),   # SSO "Magic Line"
    ([(0.29, 0.785), (0.25, 0.66), (0.21, 0.50), (0.17, 0.33),
      (0.14, 0.15), (0.12, -0.05)], 0.9, 2.1),                     # espolón SSE (Cesen)
    ([(0.49, 0.75), (0.50, 0.60), (0.53, 0.42), (0.58, 0.22), (0.62, 0.0)], 0.88, 2.2),
    ([(-0.30, 0.76), (-0.40, 0.58), (-0.55, 0.38), (-0.68, 0.18), (-0.76, 0.0)], 0.88, 2.1),
    ([(0.05, 0.86), (0.03, 0.70), (0.0, 0.50), (-0.03, 0.30), (-0.05, 0.08)], 0.72, 2.6),
    ([(-0.62, 0.43), (-0.70, 0.28), (-0.82, 0.12)], 0.7, 2.4),
    ([(0.72, 0.47), (0.74, 0.30), (0.78, 0.10)], 0.7, 2.4),
]

y0, y1 = int(YB - 1.02 * HK), int(YB + 40)
sl = slice(y0, y1)
u, v = U[sl], V[sl]
Hf = None
k_smooth = 22.0
acc = np.zeros_like(u)
for pts, prom, slope in ridges:
    best = np.full_like(u, 1e9)
    for (ax, ay), (bx, by) in zip(pts[:-1], pts[1:]):
        d, _ = seg_dist(u, v, ax, ay, bx, by)
        best = np.minimum(best, d)
    h = prom - slope * best
    acc += np.exp(k_smooth * h)
Hf = np.log(acc) / k_smooth                      # max suave: valles suavizados

# sub-costillas: ruido "ridged" estirado en la línea de máxima pendiente
rib = fbm(38, 31, 4, aniso=(1.0, 3.0), h=y1 - y0)
rib = 1.0 - np.abs(2 * rib - 1)
fine = fbm(9, 32, 3, aniso=(1.0, 3.0), h=y1 - y0)
Hf = Hf + 0.028 * rib + 0.008 * fine + 0.03 * fbm(120, 33, 4, h=y1 - y0)
# inclinación general: la cara sur mira hacia nosotros y hacia arriba
Hf = Hf + 0.45 * (1 - v) - 0.18 * np.abs(u - 0.02)

z = Hf * HK * 0.75
gy, gx = np.gradient(z)
nx, ny, nz = -gx, -gy, np.ones_like(gx)
nn = np.sqrt(nx * nx + ny * ny + nz * nz)
Lx, Ly, Lz = -0.72, -0.30, 0.62
Ll = np.sqrt(Lx * Lx + Ly * Ly + Lz * Lz)
lam = (nx * Lx + ny * Ly + nz * Lz) / (nn * Ll)

# posterización en 4 tintas, como 4 planchas de madera
def poster(x, edges=(0.18, 0.45, 0.70), w=0.025):
    return sum(smoothstep(e - w, e + w, x) for e in edges)

lvl = poster(lam)                                 # 0..3

# nieve vs roca: la roca aflora en costillas y crestas, la nieve en canales
steep = np.sqrt(gx * gx + gy * gy)
sn = fbm(70, 41, 3, aniso=(1.0, 6.0), h=y1 - y0)
gully = blur(Hf, 10.0) - Hf
snow_score = ((sn - 0.5) * 1.3 + (0.6 - rib) * 0.6 + gully * 26.0
              - smoothstep(1.2, 2.6, steep) * 0.3)
snow_score += smoothstep(0.72, 0.92, v) * 0.55          # pirámide cimera nevada
snow_score -= smoothstep(0.35, 0.05, v) * 0.15
snow = smoothstep(-0.05, 0.05, blur(snow_score, 1.5))

# terminador del alpenglow: lo alto aún recibe el último sol
term = 0.56 + 0.06 * u + 0.05 * (fbm(70, 51, 3, h=y1 - y0) - 0.5) * 2
alp = smoothstep(term - 0.005, term + 0.005, v + 0.16 * (Hf - np.median(Hf)))

def ramp(cols, lv):
    lv = np.clip(lv, 0, 3)
    out = np.zeros(lv.shape + (3,), np.float32)
    for i in range(3):
        wgt = np.clip(1 - np.abs(lv - i), 0, 1) if i else np.clip(1 - lv, 0, 1)
        out += wgt[..., None] * cols[i]
    out += np.clip(lv - 2, 0, 1)[..., None] * cols[3]
    return out

lv_a = lvl + 0.35 * smoothstep(0.75, 1.0, v)      # la cumbre más luminosa
c_alp = mix(ramp(P["a_rock"], lv_a), ramp(P["a_snow"], lv_a), snow)
c_tw = mix(ramp(P["t_rock"], lvl), ramp(P["t_snow"], lvl), snow)
k2 = mix(c_tw, c_alp, alp)

# estrías talladas en la roca (vetas verticales de gubia)
streak = fbm(4, 61, 2, aniso=(1.0, 14.0), h=y1 - y0)
streak = smoothstep(0.66, 0.74, streak) * (1 - snow) * 0.10
k2 *= (1 - streak * (1 - 0.7 * alp))[..., None]
# canales de nieve con vetas claras
gl = smoothstep(0.66, 0.74, fbm(5, 62, 2, aniso=(1.0, 12.0), h=y1 - y0)) * snow * 0.05 * (1 - alp)
k2 *= (1 + gl)[..., None]

# el serac colgante sobre el Cuello de Botella
# (una cornisa de hielo casi horizontal que corta la cara bajo la cumbre)
ser_top = 0.912 - 0.10 * u + 0.008 * (fbm(8, 71, 2, h=y1 - y0) - 0.5)
ser_band = ser_top - v
ser_span = smoothstep(0.0, 0.03, u)
ser = smoothstep(0.0, 0.004, ser_band) * smoothstep(0.034, 0.029, ser_band) * ser_span
ser_str = 0.5 + 0.5 * fbm(3, 72, 2, aniso=(1.0, 8.0), h=y1 - y0)
ser_col = mix(hexc("#d9b3c0"), hexc("#fbe4d6"), ser_str)
k2 = mix(k2, ser_col, ser * 0.65)
ser_lip = smoothstep(0.032, 0.035, ser_band) * smoothstep(0.042, 0.037, ser_band) * ser_span
k2 = mix(k2, hexc("#6e4a6a"), ser_lip * 0.5)

# perspectiva aérea hacia la base
k2 = mix(k2, P["haze"], smoothstep(0.42, 0.0, v)[..., None] * 0.45)
k2 *= mottle(81, 0.03)[sl][..., None]

region = img[sl]
img[sl] = region * (1 - k2_mask[sl][..., None]) + k2 * k2_mask[sl][..., None]

# borde iluminado de la cresta (filo de luz en la silueta)
rim = np.clip(1 - np.abs(YY - y_sky[None, :] - 1.6) / 1.8, 0, 1)
rim_lit = smoothstep(0.62, 0.70, V + 0.07 * U * 0) * (U < 0.6)
img = over(img, hexc("#ffe9d2"), rim * rim_lit * 0.55)

# penacho de nieve en la cumbre, arrastrado al este por el viento
pd = fbm(30, 91, 4, aniso=(4.0, 1.0))
dxs = np.maximum(XX - XS, 0)
env = (smoothstep(XS - 5, XS + 30, XX) * smoothstep(XS + 480, XS + 60, XX) *
       np.exp(-(((YY - (YB - HK + 14 + dxs * 0.13)) / (16 + dxs * 0.07)) ** 2)))
plume = smoothstep(0.40, 0.70, pd) * env
img = over(img, hexc("#f3cfcf"), plume * 0.42)

# ================================================================= CRESTAS
def skyline(base_y, amp, cell, seed, slope_pts=None):
    xs = np.arange(W, dtype=np.float32)
    y = np.full(W, base_y, np.float32)
    if slope_pts:
        y = poly_interp(slope_pts, xs)
    n = fbm(cell, seed, 5, h=8, w=W)[4] - 0.5
    return y + n * amp


def layer(ytop, col, snow_col, seed, snow_amt=0.3, rim_col=None, bok=120, clip=None):
    m = np.clip(YY - ytop[None, :] + 0.5, 0, 1)
    if clip is not None:
        m = m * clip
    depth = np.clip((YY - ytop[None, :]) / bok, 0, 1)
    c = mix(col * 1.25, col, smoothstep(0, 1, depth))          # bokashi: más claro arriba
    s = fbm(40, seed, 4, aniso=(1.0, 2.5))
    s = smoothstep(0.62 - snow_amt * 0.2, 0.68 - snow_amt * 0.2, s) * (1 - depth) ** 0.5
    c = mix(c, snow_col, s * snow_amt * 2)
    c *= mottle(seed + 5, 0.04)[..., None]
    out = img * (1 - m[..., None]) + c * m[..., None]
    if rim_col is not None:
        r = np.clip(1 - np.abs(YY - ytop[None, :] - 1.2) / 1.5, 0, 1)
        out = over(out, rim_col, r * 0.5 * (1 if clip is None else clip))
    return out

# bruma en la base de K2
mist_top = skyline(1690, 40, 120, 101)
mist = smoothstep(mist_top[None, :] - 30, mist_top[None, :] + 50, YY) * smoothstep(1880, 1790, YY)
mist *= 0.65 + 0.35 * fbm(80, 102, 3, aniso=(4, 1))
img = over(img, hexc("#9aa0c8"), mist * 0.75)

# crestas lejanas (Ángelus / Savoia a la izquierda, Marble Peak a la derecha)
far_l = skyline(0, 46, 70, 111, [(0, 1505), (180, 1560), (380, 1660), (560, 1760), (700, 1800), (1320, 1800)])
img = layer(far_l, P["ridge_far"], P["ridge_far_snow"], 112, 0.35, hexc("#8d8fbf"))
far_r = skyline(0, 40, 60, 121, [(0, 1800), (760, 1800), (900, 1735), (1080, 1620), (1320, 1520)])
img = layer(far_r, P["ridge_far"], P["ridge_far_snow"], 122, 0.35, hexc("#8d8fbf"))

# ================================================================= GLACIAR
# El Godwin-Austen como plano en perspectiva: baja de la base de K2 hacia
# Concordia, serpenteando, con sus morrenas medias como pentagrama oscuro.
YH = 1800.0
XV = 660.0
XW = 0.95                               # semiancho del glaciar en el plano
below = smoothstep(YH, YH + 3, YY)
dy = np.maximum(YY - YH, 1.0)
Zp = 900.0 / dy                         # profundidad en el plano del glaciar
Xp = (XX - XV) / dy                     # coordenada lateral en el plano
Zs = 7.0 * np.tanh(Zp / 7.0)           # profundidad suavizada
Xc = 0.22 * np.sin(Zs * 0.30 + 0.9) - 0.12
Xr = Xp - Xc

# fondo del valle fuera del hielo
valley = mix(hexc("#565c8c"), P["ridge_mid"], smoothstep(0, 500, YY - YH))
valley *= (0.92 + 0.16 * fbm(30, 141, 4))[..., None]
img = img * (1 - below[..., None]) + valley * below[..., None]

ice = mix(P["ice_far"], P["ice_near"], smoothstep(0, 700, YY - YH))
ice = mix(ice, hexc("#c3bfdc"), smoothstep(90, 0, YY - YH)[..., None] * 0.5)
# grietas transversales
crev_n = fbm(40, 151, 3)
crev = 0.5 + 0.5 * np.sin(Zp * 9.0 + crev_n * 6 + Xr * 0.8)
crev = smoothstep(0.94, 0.99, crev) * smoothstep(20, 160, dy) * 0.4
ice *= (1 - crev * 0.6)[..., None]

# morrenas medias y laterales
mor = np.zeros((H, W), np.float32)
for X0, wdt, amp, ph in [(-0.58, 0.05, 0.05, 0.3), (-0.22, 0.07, 0.06, 1.7),
                         (0.12, 0.05, 0.05, 2.9), (0.47, 0.06, 0.06, 4.1)]:
    xc = X0 + amp * np.sin(Zs * 0.9 + ph)
    edge = (fbm(14, int(ph * 100), 3) - 0.5) * 0.04
    mor = np.maximum(mor, smoothstep(wdt + 0.012, wdt - 0.004, np.abs(Xr - xc) + edge))
lat = smoothstep(XW - 0.16, XW - 0.10, np.abs(Xr) + (fbm(10, 155, 3) - 0.5) * 0.06)
mor = np.maximum(mor, lat)
rub = fbm(6, 161, 3)
mor_col = mix(P["moraine"], P["moraine_lt"], smoothstep(0.55, 0.75, rub))
glacier = mix(ice, mor_col, mor)
glacier *= mottle(171, 0.035)[..., None]
gl_mask = below * smoothstep(XW + 0.004, XW - 0.004, np.abs(Xr))
img = img * (1 - gl_mask[..., None]) + glacier * gl_mask[..., None]

# pirámides de hielo del Baltoro (penitentes), en perspectiva
def pyramids(img):
    S = 3
    msk_l = Image.new("L", (W * S, H * S), 0)
    msk_d = Image.new("L", (W * S, H * S), 0)
    dl, dd = ImageDraw.Draw(msk_l), ImageDraw.Draw(msk_d)
    r = np.random.default_rng(7)
    items = []
    for _ in range(400):
        yb = YH + 40 + (r.random() ** 1.5) * 560
        xb = r.random() * W
        Zb = 900.0 / (yb - YH)
        Zb = 7.0 * np.tanh(Zb / 7.0)
        Xb = (xb - XV) / (yb - YH) - (0.22 * np.sin(Zb * 0.30 + 0.9) - 0.12)
        if abs(Xb) > XW - 0.2 or min(abs(Xb - c) for c in (-0.58, -0.22, 0.12, 0.47)) < 0.12:
            continue
        sz = (yb - YH) * (0.025 + 0.03 * r.random())
        items.append((yb, xb, sz, 1.0 + 0.7 * r.random()))
        if len(items) >= 16:
            break
    for yb, xb, sz, hr in sorted(items):
        apex = (xb + sz * 0.1, yb - sz * hr)
        bl, br = (xb - sz * 0.6, yb), (xb + sz * 0.55, yb)
        mid = (xb + sz * 0.05, yb + sz * 0.05)
        dl.polygon([(p[0] * S, p[1] * S) for p in (bl, apex, mid)], fill=255)
        dd.polygon([(p[0] * S, p[1] * S) for p in (mid, apex, br)], fill=255)
    ml = np.asarray(msk_l.resize((W, H), Image.LANCZOS), np.float32) / 255
    md = np.asarray(msk_d.resize((W, H), Image.LANCZOS), np.float32) / 255
    img = over(img, hexc("#b4bde0"), ml * 0.9)
    img = over(img, hexc("#6c78a8"), md * 0.9)
    return img

img = pyramids(img)

# laderas laterales que bajan hasta el borde del hielo
edge_l = XV + (Xc - XW) * dy
edge_r = XV + (Xc + XW) * dy
mid_l = skyline(0, 40, 80, 131, [(0, 1820), (200, 1870), (380, 1950), (560, 2100), (760, 2500)])
mid_r = skyline(0, 40, 80, 141, [(560, 2500), (800, 2120), (1000, 1960), (1170, 1860), (1320, 1790)])
side_l = smoothstep(edge_l + 1, edge_l - 1, XX)
side_r = smoothstep(edge_r - 1, edge_r + 1, XX)
img = layer(mid_l, P["ridge_mid"], P["ridge_mid_snow"], 132, 0.25, hexc("#6b72a3"), bok=220, clip=side_l)
img = layer(mid_r, P["ridge_mid"], P["ridge_mid_snow"], 142, 0.25, hexc("#6b72a3"), bok=220, clip=side_r)


# ================================================================= PRIMER PLANO
near = skyline(0, 26, 90, 181, [(0, 2470), (200, 2440), (420, 2465), (640, 2520),
                                (900, 2555), (1120, 2520), (1320, 2490)])
rubble = fbm(10, 182, 3)
gm = np.clip(YY - near[None, :] + 0.5, 0, 1)
gcol = mix(P["ground_rim"], P["ground"], smoothstep(0, 140, YY - near[None, :]))
gcol *= (0.88 + 0.25 * rubble)[..., None]
img = img * (1 - gm[..., None]) + gcol * gm[..., None]
r = np.clip(1 - np.abs(YY - near[None, :] - 1.0) / 1.5, 0, 1)
img = over(img, hexc("#5a609a"), r * 0.6)

# rocas sueltas en primer plano
def boulders(img):
    S = 3
    m = Image.new("L", (W * S, H * S), 0)
    mt = Image.new("L", (W * S, H * S), 0)
    d, dt = ImageDraw.Draw(m), ImageDraw.Draw(mt)
    rr = np.random.default_rng(19)
    for _ in range(40):
        x = rr.random() * W
        y = near[int(min(max(x, 0), W - 1))] + 25 + rr.random() ** 0.9 * 330
        s = 5 + (y - 2450) * 0.09 * (0.4 + rr.random())
        n = rr.integers(5, 8)
        ang = np.sort(rr.random(n)) * 2 * np.pi
        rad = s * (0.7 + 0.5 * rr.random(n))
        pts = [((x + np.cos(a) * r_) * S, (y + np.sin(a) * r_ * 0.55) * S) for a, r_ in zip(ang, rad)]
        d.polygon(pts, fill=255)
        top = [p for p, a in zip(pts, ang) if np.sin(a) < 0.1] + [(x * S, y * S)]
        if len(top) >= 3:
            dt.polygon(top, fill=255)
    a = np.asarray(m.resize((W, H), Image.LANCZOS), np.float32) / 255
    at = np.asarray(mt.resize((W, H), Image.LANCZOS), np.float32) / 255
    img = over(img, hexc("#0e1026"), a * 0.85)
    img = over(img, hexc("#323867"), at * a * 0.7)
    return img

img = boulders(img)

# ================================================================= CAMPAMENTO
def tents(img):
    S = 4
    m = Image.new("L", (W * S, H * S), 0)
    d = ImageDraw.Draw(m)
    glow = np.zeros((H, W), np.float32)
    spots = [(318, 15), (350, 12), (290, 11), (382, 10), (262, 9)]
    for x, s in spots:
        yb = near[x] + 2
        d.chord([(x - s) * S, (yb - s * 1.25) * S, (x + s) * S, (yb + s * 1.25) * S],
                180, 360, fill=255)
        glow += np.exp(-(((XX - x) ** 2 + (YY - yb + s * 0.4) ** 2) / (2 * (s * 1.5) ** 2)))
    a = np.asarray(m.resize((W, H), Image.LANCZOS), np.float32) / 255
    img = over(img, hexc("#f2a65a"), np.clip(glow * 0.28, 0, 0.35))
    tc = mix(hexc("#ffd585"), hexc("#e07a40"), smoothstep(0.3, 0.9, fbm(8, 211, 2)))
    img = img * (1 - a[..., None]) + tc * a[..., None]
    return img

img = tents(img)

# ================================================================= SELLO
def seal(img):
    S = 4
    sz = 92
    x0, y0 = 1170, 1110
    im = Image.new("L", (sz * S, sz * S), 0)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, sz * S - 1, sz * S - 1], radius=8 * S, fill=255)
    try:
        f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", 46 * S)
        f2 = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", 13 * S)
    except OSError:
        f = f2 = ImageFont.load_default()
    d.text((sz * S / 2, sz * S * 0.42), "K2", font=f, fill=0, anchor="mm")
    d.text((sz * S / 2, sz * S * 0.80), "8611", font=f2, fill=0, anchor="mm")
    d.rounded_rectangle([5 * S, 5 * S, sz * S - 6 * S, sz * S - 6 * S], radius=5 * S, outline=0, width=2 * S)
    a = np.asarray(im.resize((sz, sz), Image.LANCZOS), np.float32) / 255
    wear = fbm(6, 201, 3, h=sz, w=sz)
    a = a * smoothstep(0.08, 0.20, wear) * 0.92
    full = np.zeros((H, W), np.float32)
    full[y0:y0 + sz, x0:x0 + sz] = a
    return over(img, P["seal"], full)

img = seal(img)

# ================================================================= PAPEL
fib = fbm(3, 301, 2, aniso=(4.0, 1.0)) - 0.5
grain = rng.normal(0, 1, (H, W)).astype(np.float32)
grain = blur(grain, 0.6)
paper = 1.0 + 0.03 * fib + 0.012 * grain
img = img * paper[..., None]
img = mix(img, P["paper"] * img.mean(axis=2, keepdims=True) ** 0.0 * img, 0.0)
# viñeta suave
vg = np.hypot((XX - W / 2) / (W * 0.8), (YY - H * 0.48) / (H * 0.7))
img *= (1 - 0.18 * smoothstep(0.55, 1.1, vg))[..., None]

out = np.clip(img, 0, 1)
out = (out ** (1 / 1.0) * 255 + rng.random((H, W, 1)) - 0.5).clip(0, 255).astype(np.uint8)
path = sys.argv[1] if len(sys.argv) > 1 else "k2_shinhanga.png"
Image.fromarray(out, "RGB").save(path, optimize=True)
print("guardado", path)
