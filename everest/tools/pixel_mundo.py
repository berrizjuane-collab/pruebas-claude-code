"""Devuelve lat/lon/z del terreno visible en píxeles (u,v) de una escena. Uso: pixel_mundo.py recon escena u,v [u,v ...]"""
import sys, os
import numpy as np
from scipy import ndimage as ndi
RECON = os.path.abspath(sys.argv[1]); sys.path.insert(0, RECON); os.chdir(RECON)
import escenas as ESC
from render3d import render, camara_equivalente, CamaraInclinada
from pyproj import Transformer
INV = Transformer.from_crs('EPSG:32645', 'EPSG:4326', always_xy=True)
T, M, G = ESC.mundo()
cfg = ESC.ESCENAS[sys.argv[2]]
W, H = 960, 540
cf = ESC.camara(cfg, W, H)
if isinstance(cf, CamaraInclinada):
    cam, X2, Y2 = camara_equivalente(cf)
else:
    cam, X2, Y2 = cf, None, None
buf = render(M, cam, rho_min=cfg.get('rho_min', 4.0), paso_min=cfg.get('paso_min', 1.0))
E, N, z = buf['E'], buf['N'], buf['z']
if X2 is not None:
    E = ndi.map_coordinates(E, [Y2, X2], order=0); N = ndi.map_coordinates(N, [Y2, X2], order=0); z = ndi.map_coordinates(z, [Y2, X2], order=0)
for a in sys.argv[3:]:
    u, v = map(float, a.split(','))
    xi, yi = int(u * W), int(v * H)
    lon, lat = INV.transform(E[yi, xi], N[yi, xi])
    print(a, '->', round(lat, 5), round(lon, 5), round(float(z[yi, xi]) + 39), 'm')
