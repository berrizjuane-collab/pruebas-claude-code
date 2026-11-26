#!/usr/bin/env python3
"""Prueba rápida de encuadres: imagen objetivo T (sin pintar) con la ruta, los campos y las cimas encima.

    python3 explorar.py <escena> <ancho> <alto> <salida.png> ['{"xy":[..],"z_abs":..,"rumbo":..,"hfov":..,"cy":..}']
"""
import json
import os
import sys

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src')
sys.path.insert(0, SRC)
import numpy as np                      # noqa: E402
from PIL import Image, ImageDraw        # noqa: E402
import escena as E                      # noqa: E402
import escenas as S                     # noqa: E402
import escenas_extra as SX              # noqa: E402

clave, W, H, salida = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
esc = dict(S.ESCENAS[clave])
if len(sys.argv) > 5:
    for k, v in json.loads(sys.argv[5]).items():
        esc[k] = tuple(v) if isinstance(v, list) else v
rng = np.random.default_rng(1)
T, reg, theta, cam, buf, info = E.componer_T(esc, W, H, rng, log=lambda *a: None)
im = Image.fromarray(np.clip(T, 0, 255).astype(np.uint8))
d = ImageDraw.Draw(im)
prof = info['prof']


def visible(u, v, dist):
    ui, vi = int(np.clip(u, 0, W - 1)), int(np.clip(v + 1, 0, H - 1))
    return 0 <= u < W and 0 <= v < H and (not np.isfinite(prof[vi, ui]) or prof[vi, ui] > dist * 0.97 - 30)


def P(x, y, z):
    u, v, dd = cam.proyectar(np.array([x]), np.array([y]), np.array([z]))
    return float(u[0]), float(v[0]), float(np.hypot(x - cam.x, y - cam.y))


ruta = SX.RUTA
dens = []
for (x0, y0), (x1, y1) in zip(ruta[:-1], ruta[1:]):
    n = max(1, int(np.hypot(x1 - x0, y1 - y0) / 40))
    for k in range(n):
        t = k / n
        dens.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
dens.append(ruta[-1])
prev = None
for (x, y) in dens:
    z = E.altura_suelo(x, y) + 3
    u, v, dist = P(x, y, z)
    if not np.isfinite(u):
        prev = None
        continue
    vis = visible(u, v, dist)
    if prev is not None:
        d.line([prev, (u, v)], fill=(255, 140, 40) if vis else (120, 140, 255), width=2)
    prev = (u, v)
for nombre, (x, y) in SX.PARADAS:
    u, v, dist = P(x, y, E.altura_suelo(x, y) + 3)
    if np.isfinite(u):
        d.ellipse([u - 4, v - 4, u + 4, v + 4], outline=(255, 255, 0), width=2)
        d.text((u + 6, v - 6), nombre, fill=(255, 255, 0))
_, cum, _ = E.terreno()
for nombre, (x, y, z) in cum.items():
    u, v, dist = P(x, y, z)
    if np.isfinite(u) and 0 <= u < W and 0 <= v < H:
        col = (255, 255, 255) if visible(u, v - 2, dist) else (255, 90, 90)
        d.line([(u, v - 14), (u, v)], fill=col)
        d.text((u - 10, v - 26), str(nombre).replace('Gasherbrum', 'G'), fill=col)
im.save(salida)
print('ok', salida, f'z_cam={cam.z:.0f}')
