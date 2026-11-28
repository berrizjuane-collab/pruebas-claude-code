"""Perfil del horizonte desde un punto: elevación aparente del relieve por acimut y qué cimas asoman.

    python3 herramientas/horizonte.py <x> <y> [ojo=1.7] [paso_az=5]
"""
import math
import os
import sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import escena as E          # noqa: E402
import render3d as R3       # noqa: E402
import terreno as TR        # noqa: E402

x0, y0 = float(sys.argv[1]), float(sys.argv[2])
ojo = float(sys.argv[3]) if len(sys.argv) > 3 else 1.7
paso = float(sys.argv[4]) if len(sys.argv) > 4 else 5
z0 = E.altura_suelo(x0, y0) + ojo
print(f'cámara z = {z0:.0f} m')


def elev(x, y, z):
    d = math.hypot(x - x0, y - y0)
    return math.degrees(math.atan2(z - d * d / (2 * R3.R_EF) - z0, d)), d


def horizonte(az):
    a = math.radians(az); best = -90; dbest = 0; d = 20.0
    while d < 250000:
        x, y = x0 + d * math.sin(a), y0 + d * math.cos(a)
        e, _ = elev(x, y, E.altura_suelo(x, y))
        if e > best:
            best, dbest = e, d
        d += max(15.0, d * 0.01)
    return best, dbest


cum = {}
for nombre, (la, lo, h) in TR.CUMBRES.items():
    x, y = TR.ll2xy(la, lo); cum[nombre] = (float(x), float(y), float(h))
for az in np.arange(0, 360, paso):
    e, d = horizonte(az)
    vis = []
    for n, (x, y, h) in cum.items():
        azc = math.degrees(math.atan2(x - x0, y - y0)) % 360
        if abs((azc - az + 180) % 360 - 180) <= paso / 2:
            ec, dc = elev(x, y, h)
            vis.append(f'{n} {ec:+.1f}° {dc / 1000:.0f}km {"VISIBLE" if ec >= e - 0.05 else "oculta"}')
    print(f'{az:5.0f}°  horizonte {e:+6.1f}° a {d / 1000:6.1f} km   ' + '; '.join(vis))
