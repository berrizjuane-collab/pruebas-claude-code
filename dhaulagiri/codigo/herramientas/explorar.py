#!/usr/bin/env python3
"""Prueba rápida de encuadres: imagen objetivo T (sin pintar) con la ruta, los campos y las cimas encima.

    python3 herramientas/explorar.py <escena> <ancho> <alto> <salida.png> ['{"rumbo":..,"hfov":..,"cy":..}']

Las cimas en blanco se ven; en rojo, quedan ocultas tras el relieve (comprobación de la topología).
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import numpy as np                      # noqa: E402
from PIL import Image, ImageDraw        # noqa: E402
import escena as E                      # noqa: E402
import escenas as S                     # noqa: E402

clave, W, H, salida = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
esc = dict(S.ESCENAS[clave])
if len(sys.argv) > 5:
    for k, v in json.loads(sys.argv[5]).items():
        if v is None:
            esc.pop(k, None)
        else:
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


ruta = S.CASCADA_NO + S.ARISTA_NE[1:]
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
    if not np.isfinite(u) or dist < 30:
        prev = None
        continue
    vis = visible(u, v, dist)
    if prev is not None:
        d.line([prev, (u, v)], fill=(255, 140, 40) if vis else (120, 140, 255), width=2)
    prev = (u, v)
for nombre, (x, y) in S.CAMPOS.items():
    u, v, dist = P(x, y, E.altura_suelo(x, y) + 3)
    if np.isfinite(u) and dist > 30:
        d.ellipse([u - 4, v - 4, u + 4, v + 4], outline=(255, 255, 0), width=2)
        d.text((u + 6, v - 6), nombre, fill=(255, 255, 0))
import terreno as TR                    # noqa: E402
_, cum, _ = E.terreno()
cum = dict(cum)
for nombre, (la, lo, h) in TR.CUMBRES.items():      # las de fuera del nivel fino, con su cota oficial
    if nombre not in cum:
        x_, y_ = TR.ll2xy(la, lo)
        cum[nombre] = (float(x_), float(y_), float(h))
for nombre, (x, y, z) in cum.items():
    u, v, dist = P(x, y, z)
    if np.isfinite(u) and 0 <= u < W and 0 <= v < H and dist > 30:
        col = (255, 255, 255) if visible(u, v - 2, dist) else (255, 90, 90)
        d.line([(u, v - 14), (u, v)], fill=col)
        d.text((u - 10, v - 26), str(nombre).replace('Dhaulagiri', 'Dh'), fill=col)
im.save(salida)
print('ok', salida, f'z_cam={cam.z:.0f}')
