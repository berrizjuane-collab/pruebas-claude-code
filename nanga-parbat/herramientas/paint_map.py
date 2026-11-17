"""Lámina 8 · el macizo visto desde arriba, en el mismo pincel seco.

Relieve real (DEM del manual), luz del noroeste para que el relieve se lea
sin inversión, nieve/roca/glaciar/prado/bosque con la lógica de kit.terrain
pero en el plano del mapa, y los trazos de la montaña siguiendo la línea de
máxima pendiente.

    python paint_map.py <engine_dir> <salida.png> [ancho]
"""
import sys
import time

sys.path.insert(0, sys.argv[1])
OUTP = sys.argv[2]
WOUT = int(sys.argv[3]) if len(sys.argv) > 3 else 2000

import cv2
import numpy as np
from PIL import Image

from brush import Noise, smooth, mix, ridged, rgb, orientation, paint, finish, blur
from kit import WorldNoise, PALETTES, dem

t0 = time.time()
D = dem()
L = D.light(318, 36, shadow_len=7.0)
print("luz", round(time.time() - t0, 1))

ny, nx = D.h.shape
HOUT = int(round(WOUT * ny / nx))


def up(a, interp=cv2.INTER_CUBIC):
    """del plano del DEM (fila 0 = sur) a la imagen (fila 0 = norte)"""
    return cv2.resize(np.ascontiguousarray(a[::-1]).astype(np.float32), (WOUT, HOUT), interpolation=interp)


h = up(D.h)
lam, sh, ao = up(L["lam"]), up(L["sh"]), up(L["ao"])
slope, flute, coarse = up(L["slope"]), up(D.flute), up(D.coarse)
gx, gy = up(L["gx"]), up(L["gy"])
gl = np.clip(up(D.glacier), 0, 1)

xs = np.linspace(D.x0, D.x1, WOUT, dtype=np.float32)
ys = np.linspace(D.y1, D.y0, HOUT, dtype=np.float32)
X, Y = np.meshgrid(xs, ys)

wn = WorldNoise(808)
n_lo = wn.fbm(X, Y, 1.6, 3, k=0)
n_mid = wn.fbm(X, Y, 0.30, 3, k=2)
n_fine = wn.fbm(X, Y, 0.045, 2, k=4)
strata = wn.value(X * 0.15 + h * 2.2, h * 9.0 + 0.4 * n_mid, 1.0, k=6)

pal = PALETTES["day"]
asp_n = -gy / (np.hypot(gx, gy) + 1e-4)              # >0: ladera que mira al norte (más nieve)
snowline = 4.70
sl = snowline - 0.30 * asp_n + 0.40 * (n_lo - 0.5)
snow_alt = smooth(sl - 0.32, sl + 0.22, h + 0.10 * (n_mid - 0.5))
steep = slope + 9 * (n_mid - 0.5) + 6.0 * flute + 5.0 * coarse + 9 * (strata - 0.5) - 14 * smooth(6.3, 7.7, h)
rock = smooth(48, 62, steep)
snow = snow_alt * (1 - rock)
snow = np.maximum(snow, snow_alt * smooth(0.2, 1.1, -flute) * smooth(74, 58, slope) * 0.8)

luz = lam * (1 - 0.80 * sh)
lit = smooth(0.22, 0.86, luz)
lit = np.maximum(lit, 0.10 * smooth(0.0, 0.4, lam))
s0, s1 = rgb(*pal["snow"][0]), rgb(*pal["snow"][1])
r0, r1 = rgb(*pal["rock"][0]), rgb(*pal["rock"][1])
c_snow = mix(s0, s1, lit[..., None])
c_rock = mix(r0, r1, lit[..., None]) * (0.74 + 0.52 * n_fine)[..., None]
c_rock = c_rock * (0.86 + 0.28 * strata)[..., None]

flow = wn.value(X * 0.25 + 3 * n_lo, Y * 0.25 + 3 * wn.value(X, Y, 2.0, 3), 0.11, 5)
deb = np.clip(smooth(4.5, 3.6, h) * 0.75 + 0.9 * smooth(0.52, 0.70, flow) - 0.25 + 0.5 * (n_mid - 0.5), 0, 1)
crev = ridged(wn.value(X, Y, 0.07, 3)) ** 4
c_ice = mix(rgb(112, 142, 186), rgb(226, 234, 240), lit[..., None]) * (1 - 0.30 * crev)[..., None]
c_deb = mix(rgb(70, 72, 90), rgb(160, 152, 140), np.maximum(lit, 0.25)[..., None]) * (0.74 + 0.52 * n_fine)[..., None]
c_gl = mix(c_ice, c_deb, deb[..., None])
gl = gl * smooth(28, 14, slope)

veg = smooth(4.55, 3.95, h + 0.3 * (n_lo - 0.5)) * smooth(52, 34, slope)
clump = wn.fbm(X, Y, 0.035, 2, k=5)
forest = smooth(3.70, 3.30, h + 0.30 * (n_mid - 0.5)) * smooth(0.30, 0.52, wn.fbm(X, Y, 0.6, 2, k=7)) * smooth(4, 10, slope)
c_mead = mix(rgb(52, 76, 56), rgb(140, 150, 84), lit[..., None]) * (0.82 + 0.36 * n_fine)[..., None]
c_dry = mix(rgb(62, 66, 70), rgb(166, 150, 104), lit[..., None]) * (0.80 + 0.40 * n_fine)[..., None]
c_mead = mix(c_mead, c_dry, (smooth(0.38, 0.66, wn.fbm(X, Y, 0.9, 3, k=1)) * smooth(3.3, 3.9, h) * 0.8)[..., None])
c_for = mix(rgb(18, 34, 36), rgb(58, 90, 56), lit[..., None]) * (0.55 + 0.9 * clump)[..., None]
c_veg = mix(c_mead, c_for, forest[..., None])
c_scree = mix(rgb(66, 68, 92), rgb(168, 154, 134), lit[..., None]) * (0.80 + 0.40 * n_fine)[..., None]
low_rock = smooth(40, 52, slope + 14 * (n_mid - 0.5))
c_low = mix(c_scree, c_rock, low_rock[..., None])
c_low = mix(c_low, c_veg, (veg * (1 - 0.8 * low_rock))[..., None])
c_low = mix(c_low, c_gl, gl[..., None])
col = mix(c_low, c_rock, (snow_alt * rock)[..., None])
col = mix(col, c_snow, snow[..., None])
col = mix(col, c_gl, (gl * (1 - snow_alt))[..., None])
col = col * (1 - 0.34 * ao)[..., None] + rgb(20, 28, 60) * (0.34 * ao)[..., None]
# un poco de bruma azulada en los fondos de valle, como en las láminas
col = mix(col, rgb(*pal["haze"]) * 0.82, (0.16 * smooth(3.6, 2.2, h))[..., None])
T = np.clip(col, 0, 255).astype(np.float32)
print("objetivo", round(time.time() - t0, 1))

reg = np.where(slope > 14, 2, 4).astype(np.uint8)
reg[(h < 4.0) & (slope < 22)] = 5
# los trazos siguen la línea de máxima pendiente (en la imagen y crece hacia el sur)
hint = np.arctan2(gy, -gx).astype(np.float32)
hint[slope < 10] = np.nan
nz = Noise(WOUT, HOUT, 818)
theta = orientation(T, reg, nz, hint=hint)
canvas = paint(T, reg, theta, nz, SS=2, log=lambda m: print("[%5.1fs] %s" % (time.time() - t0, m), flush=True))
small = np.asarray(canvas.resize((WOUT, HOUT), Image.LANCZOS)).astype(np.float32)
out = finish(small, reg, nz, tiza=pal["tiza"], tiza_k=0.85, gap_k=0.9, fondo=pal["fondo"])
Image.fromarray(out).save(OUTP)
print("->", OUTP, WOUT, HOUT, round(time.time() - t0, 1))
