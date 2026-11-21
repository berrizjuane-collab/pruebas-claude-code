"""Proyecta cumbres y lugares en cada lámina (coordenadas 0-1) para rotularlas en la web."""
import sys, os, json
MOTOR = os.path.abspath(sys.argv[1]); sys.path.insert(0, MOTOR); os.chdir(MOTOR)
import numpy as np
import escenas as ESC
T, Mw, _ = ESC.mundo()
r = np.load('datos/ruta_osm.npy')[::-1]
# collado sur: mínimo local de la ruta entre 7 800 y 8 000 m, tras el espolón
zz = r[:, 2]; idx = np.flatnonzero((zz > 7700) & (zz < 8100))
seg = r[idx[0]:idx[-1] + 1]
k_spur = int(np.argmax(seg[:, 2][: len(seg) // 2 + 1]))
k_col = k_spur + int(np.argmin(seg[k_spur:, 2]))
print('espolon', seg[k_spur], 'collado', seg[k_col])
# búsqueda amplia de cumbres en la cresta este del Lhotse
la = np.linspace(27.935, 27.975, 160); lo = np.linspace(86.925, 86.985, 240)
LA, LO = np.meshgrid(la, lo, indexing='ij')
E, N = ESC.TU.transform(LO.ravel(), LA.ravel())
Z = Mw.altura(np.array(E), np.array(N)).reshape(LA.shape)
from scipy import ndimage as ndi
mx = (Z == ndi.maximum_filter(Z, size=9)) & (Z > 8000)
for i, j in zip(*np.nonzero(mx)):
    print(f'cumbre local {LA[i,j]:.4f} {LO[i,j]:.4f} {Z[i,j]:.0f}')
P = {
    'Everest': (27.98806, 86.92521), 'Lhotse': (27.962107, 86.933842), 'Nuptse': (27.9672, 86.8869),
    'Lhotse Medio': (27.9591, 86.9440), 'Collado Sur': (float(seg[k_col][0]), float(seg[k_col][1])),
    'Espolón de los Ginebrinos': (float(seg[k_spur][0]), float(seg[k_spur][1])),
    'Pumori': (28.0150, 86.8281), 'Makalu': (27.8897, 87.0886), 'Ama Dablam': (27.8613, 86.8614),
    'Cascada del Khumbu': (27.99542, 86.87478), 'Campo 3': (27.9686733, 86.91921), 'Campo 2': (27.97997, 86.903825),
    'Banda Amarilla': (27.967468, 86.924192), 'Changtse': (28.0244, 86.9131), 'Lho La': (28.0042, 86.8697),
}
out = {}
for esc, (W, H) in {'campo_base': (2560, 1440), 'campo1': (2560, 1440), 'campo2': (2560, 1440), 'campo3': (2560, 1440), 'cumbre': (2560, 1440), 'aerea': (2560, 1440)}.items():
    cfg = ESC.ESCENAS[esc]; cam = ESC.camara(cfg, W, H); res = {}
    for nombre, (a, b) in P.items():
        e, n = ESC.utm(a, b); z = float(Mw.altura(np.array([e]), np.array([n]))[0])
        x, y, f = cam.proyectar(np.array([e]), np.array([n]), np.array([z + 4]))
        x, y, f = float(x[0]) / W, float(y[0]) / H, float(f[0])
        if f <= 0 or not (0.02 < x < 0.98 and 0.02 < y < 0.98):
            continue
        t = np.linspace(0.01, 0.99, 400)
        Ei = cam.E + (e - cam.E) * t; Ni = cam.N + (n - cam.N) * t; zi = cam.z + (z + 4 - cam.z) * t
        vis = bool(np.all(Mw.altura(Ei, Ni) < zi + 8.0))
        res[nombre] = dict(x=round(x, 4), y=round(y, 4), visible=vis, dist_km=round(f / 1000, 1))
    out[esc] = res
json.dump(out, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
print(json.dumps(out, indent=1, ensure_ascii=False))
