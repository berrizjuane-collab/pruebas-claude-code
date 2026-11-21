"""Prueba de encuadre para la lámina nueva de la ruta: renderiza solo el objetivo (sin pincel) y dibuja la ruta."""
import sys, os, json
MOTOR = os.path.abspath(sys.argv[1])
sys.path.insert(0, MOTOR); os.chdir(MOTOR)
import numpy as np
from PIL import Image, ImageDraw
import escenas as ESC

lat, lon, zabs, rumbo, hfov, pitch = map(float, sys.argv[2:8])
W, H = int(sys.argv[8]), int(sys.argv[9])
out = sys.argv[10]
paleta = sys.argv[11] if len(sys.argv) > 11 else 'tarde'
sol = (float(sys.argv[12]), float(sys.argv[13])) if len(sys.argv) > 13 else (250.0, 30.0)
ESC.ESCENAS['ruta'] = dict(titulo='ruta', sub='', pos=(lat, lon), zabs=zabs, rumbo=rumbo, hfov=hfov, pitch=pitch, vh=0.5,
    sol=sol, paleta=paleta, seed=707, mar=float(os.environ.get('MAR','5100')), rho_min=8.0, paso_min=2.0,
    nubes=[], niebla=[], ajustes=dict(bruma_D=float(os.environ.get('BRUMA','32000'))), cirros=0.3)
o = ESC.objetivo('ruta', W, H)
img = Image.fromarray(np.clip(o['T'], 0, 255).astype(np.uint8))
d = ImageDraw.Draw(img)
cam = o['cam']
r = np.load('datos/ruta_osm.npy')
E, N = ESC.TU.transform(r[:, 1], r[:, 0])
x, y, f = cam.proyectar(np.array(E), np.array(N), r[:, 2] + 5)
d.line(list(zip(x, y)), fill=(255, 0, 0), width=2)
pts = {'BC': (28.00255, 86.85490), 'C1': (27.98300, 86.88100), 'C2': (27.97997, 86.903825), 'C3': (27.9686733, 86.91921), 'LH': (27.962107, 86.933842), 'EV': (27.98806, 86.92521)}
T = ESC.mundo()[0]
for k, (la, lo) in pts.items():
    e, n = ESC.utm(la, lo); z = float(T.altura(np.array([e]), np.array([n]))[0])
    px, py, _ = cam.proyectar(e, n, z)
    d.ellipse([px - 4, py - 4, px + 4, py + 4], outline=(255, 255, 0), width=2); d.text((px + 6, py - 6), k, fill=(255, 255, 0))
img.save(out)
print('ok', out)
