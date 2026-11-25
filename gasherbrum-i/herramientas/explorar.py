"""explorar.py — prueba rápida de encuadres: imagen objetivo T a baja resolución con la ruta, los campos y las
cimas proyectados encima.   python3 explorar.py <escena> <W> <H> <salida.png> ['{"pos":[..],"alt":..,"encuadre":[..]}']
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import extras                                   # noqa: E402
import numpy as np                              # noqa: E402
from PIL import Image, ImageDraw                # noqa: E402
import generar                                  # noqa: E402
import vistas                                   # noqa: E402
import dem                                      # noqa: E402
import render3d as r3                           # noqa: E402
from escenas import camino, visible             # noqa: E402

clave, W, H, salida = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
esc = vistas.ESCENAS[clave]()
if len(sys.argv) > 5:
    for k, v in json.loads(sys.argv[5]).items():
        setattr(esc, k, tuple(v) if isinstance(v, list) else v)
T, reg, e = generar.imagen_objetivo(esc, W, H, log=lambda *a: None)
im = Image.fromarray(T.astype(np.uint8))
d = ImageDraw.Draw(im)
rel, ctx = generar.recursos()
pts = camino(e, rel, ctx, extras.RUTA_COMPLETA, n=240, dz=2.0)
prev = None
for u, v, s, x, y in pts:
    vis = visible(e, u, v, s, tol=0.06)
    if prev is not None:
        d.line([prev, (u, v)], fill=(255, 140, 40) if vis else (120, 120, 255), width=2)
    prev = (u, v)
for nombre, (la, lo) in extras.PARADAS:
    z = rel.altura(lo, la)
    u, v, s = r3.proyectar(e, la, lo, z + 2)
    d.ellipse([u - 4, v - 4, u + 4, v + 4], outline=(255, 255, 0), width=2)
    d.text((u + 6, v - 6), nombre, fill=(255, 255, 0))
for nombre, la, lo, cota, *_ in dem.CIMAS[:18]:
    u, v, s = r3.proyectar(e, la, lo, cota)
    if 0 <= u < W and 0 <= v < H:
        d.text((u - 10, v - 14), nombre.replace('Gasherbrum', 'G'), fill=(255, 255, 255))
        d.line([(u, v - 3), (u, v)], fill=(255, 255, 255))
im.save(salida)
print('ok', salida, f'hc={e.hc:.0f}')
