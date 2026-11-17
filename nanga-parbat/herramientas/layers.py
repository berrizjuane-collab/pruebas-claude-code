"""Capas multiplano de una lámina (cielo / montaña / primer plano) cortadas
de la imagen final con las máscaras exactas del render.

Repite Scene.render() paso a paso (mismas llamadas, mismo orden: el mismo
azar), pero además dibuja todos los objetos en una máscara y captura el
desplazamiento del "pulso inseguro" del acabado para llevar las máscaras al
mismo sitio que los píxeles.  Rellena lo que cada capa tiene detrás con
inpainting + trazos, por si el parallax deja ver un borde.

    python layers.py <engine_dir> <escena> <W> <H> <out_dir>
"""
import sys
import time

sys.path.insert(0, sys.argv[1])
NAME, W, H, OUT = sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]

import cv2
import numpy as np
from PIL import Image, ImageDraw

import brush
import scenes
from brush import orientation, paint, rebrush, finish, Noise
from kit import Draw

t0 = time.time()
sc = scenes.SCENES[NAME](W, H, 2)
SS = sc.SS
nz = sc.nz
sc.T = np.clip(sc.T, 0, 255).astype(np.float32)
theta = orientation(sc.T, sc.reg, nz, hint=sc.hint)
canvas = paint(sc.T, sc.reg, theta, nz, SS=SS)
mask = Image.new("L", canvas.size, 0)
fullmask = Image.new("L", canvas.size, 0)          # también la hierba
dr = Draw(canvas, mask)
raw = ImageDraw.Draw(canvas)
rawm = ImageDraw.Draw(fullmask)
allit = [(yb, 0, k, d) for yb, k, d in sc.raw_items] + [(yb * SS, 1, fn, None) for yb, fn in sc.items]
allit.sort(key=lambda t: t[0])
for yb, typ, a, b in allit:
    if typ == 1:
        a(dr, SS)
    elif a == 0:
        x0, y0, xm, ym, xt, yt, ww, c, tip = b
        wi = max(1, int(round(ww)))
        raw.line((x0, y0, xm, ym), fill=c, width=wi)
        raw.line((xm, ym, xt, yt), fill=tip, width=max(1, int(round(ww * 0.75))))
        rawm.line((x0, y0, xm, ym), fill=255, width=wi)
        rawm.line((xm, ym, xt, yt), fill=255, width=max(1, int(round(ww * 0.75))))
    else:
        fx, fy, rad, col, rot = b
        if rad < 3.2:
            dr.ellipse((fx - rad, fy - rad, fx + rad, fy + rad), fill=col)
        else:
            for kk in range(5):
                an = rot + kk * 1.2566
                px, py = fx + rad * 0.62 * np.cos(an), fy + rad * 0.62 * np.sin(an)
                dr.ellipse((px - rad * 0.5, py - rad * 0.5, px + rad * 0.5, py + rad * 0.5), fill=col)
            dr.ellipse((fx - rad * 0.3, fy - rad * 0.3, fx + rad * 0.3, fy + rad * 0.3), fill=(236, 190, 60) if col != (242, 208, 72) else (180, 110, 40))
print("objetos", round(time.time() - t0, 1), flush=True)
canvas = rebrush(canvas, np.asarray(mask), sc.reg, nz, SS=SS)
if sc.late:
    d2 = Draw(canvas, None)
    for fn in sc.late:
        fn(d2, SS)
small = np.asarray(canvas.resize((W, H), Image.LANCZOS)).astype(np.float32)
# desplazamiento del acabado (mismas llamadas que brush.finish, sin gastar el azar)
U = nz.U
state = nz.rng.bit_generator.state
dx = (nz.fbm(26, 3) - 0.5) * 9 * U + (nz.fbm(90, 2) - 0.5) * 2 * U
dy = (nz.fbm(26, 3) - 0.5) * 9 * U + (nz.fbm(90, 2) - 0.5) * 2 * U
nz.rng.bit_generator.state = state
out = finish(small, sc.reg, nz, tiza=sc.pal["tiza"], tiza_k=sc.pal["tiza_k"], gap_k=sc.pal["gap_k"], fondo=sc.pal["fondo"])
print("render", round(time.time() - t0, 1), flush=True)
Image.fromarray(out).save(OUT + "/%s_full.png" % NAME)

xx, yy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))


def warp(m):
    return cv2.remap(m.astype(np.float32), xx + dx, yy + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def down(m):
    return cv2.resize(np.asarray(m).astype(np.float32) / 255.0, (W, H), interpolation=cv2.INTER_AREA)


reg = sc.reg
hit = getattr(sc, "hit", np.zeros((H, W), bool))
items = np.maximum(down(mask), down(fullmask))
# primer plano: lomas (reg 4/5) + objetos (pinos, piedras, hierba, flores)
fg = np.maximum(np.isin(reg, (4, 5)).astype(np.float32), np.clip(items * 1.6, 0, 1))
# cielo: lo que no es relieve ni primer plano
sky = ((~hit) & np.isin(reg, (0, 1))).astype(np.float32) * (1 - fg)
fg, sky = warp(fg), warp(sky)
# bordes: un poco hacia fuera en el primer plano (los trazos desbordan), suaves
fg = np.clip(cv2.GaussianBlur(cv2.dilate(fg, np.ones((3, 3), np.uint8)), (0, 0), 1.1) * 1.15, 0, 1)
sky = np.clip(cv2.GaussianBlur(cv2.erode(sky, np.ones((3, 3), np.uint8)), (0, 0), 1.1), 0, 1)
mtn = np.clip(1 - sky, 0, 1)

img = out.astype(np.float32)


def fill_behind(img, hole, seed):
    """rellena `hole` (1 = tapado) con inpainting a baja resolución y luego
    lo repinta con trazos para que hable el idioma de la lámina."""
    k = 4
    small_i = cv2.resize(img, (W // k, H // k), interpolation=cv2.INTER_AREA).astype(np.uint8)
    small_m = (cv2.resize(hole, (W // k, H // k), interpolation=cv2.INTER_AREA) > 0.05).astype(np.uint8) * 255
    small_m = cv2.dilate(small_m, np.ones((5, 5), np.uint8))
    filled = cv2.inpaint(cv2.cvtColor(small_i, cv2.COLOR_RGB2BGR), small_m, 9, cv2.INPAINT_TELEA)
    filled = cv2.cvtColor(filled, cv2.COLOR_BGR2RGB)
    big = cv2.resize(filled, (W, H), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    region = cv2.GaussianBlur(cv2.dilate(hole, np.ones((9, 9), np.uint8)), (0, 0), 6)
    T = img * (1 - region[..., None]) + big * region[..., None]
    nz2 = Noise(W, H, seed)
    reg2 = np.full((H, W), 2, np.uint8)
    th = orientation(T, reg2, nz2)
    cv = Image.fromarray(np.clip(T, 0, 255).astype(np.uint8))
    cv = paint(T, reg2, th, nz2, SS=1, passes=[(8.5, 52, None), (4.6, 46, None), (3.0, 40, None)], canvas=cv, mask=region)
    P = np.asarray(cv).astype(np.float32)
    return img * (1 - region[..., None]) + P * region[..., None]


back_mtn = fill_behind(img, fg, 901)              # la montaña sin el primer plano encima
back_sky = fill_behind(img, mtn, 902)             # el cielo sin la montaña delante
print("rellenos", round(time.time() - t0, 1), flush=True)


def save_rgba(rgb, a, path):
    rgba = np.dstack([np.clip(rgb, 0, 255), np.clip(a * 255, 0, 255)]).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(path)


Image.fromarray(np.clip(back_sky, 0, 255).astype(np.uint8)).save(OUT + "/%s_l0_cielo.png" % NAME)
save_rgba(back_mtn, mtn, OUT + "/%s_l1_montana.png" % NAME)
save_rgba(img, fg, OUT + "/%s_l2_frente.png" % NAME)
# comprobación: recomponer las tres capas en su sitio debe dar la lámina
comp = back_sky
comp = comp * (1 - mtn[..., None]) + back_mtn * mtn[..., None]
comp = comp * (1 - fg[..., None]) + img * fg[..., None]
err = np.abs(comp - img).mean()
print("error de recomposición (media, 0-255): %.3f" % err)
print("listo", round(time.time() - t0, 1))
