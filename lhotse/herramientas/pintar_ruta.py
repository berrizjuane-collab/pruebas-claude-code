"""Lámina VII (nueva): la ruta normal del Lhotse desde el aire, pintada con el mismo motor.
Uso: python pintar_ruta.py <motor> <W> <H> <salida.png> <salida.json> [SS]"""
import sys, os, json
MOTOR = os.path.abspath(sys.argv[1]); sys.path.insert(0, MOTOR); os.chdir(MOTOR)
import numpy as np
import escenas as ESC
import generar as G

W, H = int(sys.argv[2]), int(sys.argv[3])
salida, salida_json = os.path.abspath(sys.argv[4]), os.path.abspath(sys.argv[5])
SS = int(sys.argv[6]) if len(sys.argv) > 6 else 2
ESC.ESCENAS['ruta'] = dict(
    titulo='La ruta normal del Lhotse', sub='Del Campo Base a la cumbre por el Cwm Occidental y la cara del Lhotse',
    pos=(28.042, 86.782), zabs=10400.0, rumbo=121.0, hfov=50.0, pitch=-15.0, vh=0.5,
    sol=(248.0, 34.0), paleta='tarde', seed=707, mar=5150.0, rho_min=8.0, paso_min=2.0,
    nubes=[dict(cu=0.86, cv=0.20, w=0.20, hg=0.05, n=70, dist=60000, opacidad=0.8),
           dict(cu=0.12, cv=0.18, w=0.16, hg=0.04, n=60, dist=60000, opacidad=0.7)],
    niebla=[], ajustes=dict(bruma_D=30000.0), cirros=0.40)

if os.environ.get('SOLO_JSON') != '1':
    G.generar('ruta', W, H, salida, SS)

# ---- coordenadas proyectadas para la capa SVG animada
cfg = ESC.ESCENAS['ruta']
T, Mw, _ = ESC.mundo()
cam = ESC.camara(cfg, W, H)

def visible(E, N, z):
    t = np.linspace(0.02, 0.985, 260)
    Ei = cam.E + (E - cam.E) * t; Ni = cam.N + (N - cam.N) * t; zi = cam.z + (z - cam.z) * t
    zt = Mw.altura(Ei, Ni)
    return bool(np.all(zt < zi + 6.0))

def proy(E, N, z):
    x, y, f = cam.proyectar(np.array([E]), np.array([N]), np.array([z]))
    return float(x[0]) / W, float(y[0]) / H

r = np.load(os.path.join(MOTOR, 'datos', 'ruta_osm.npy'))[::-1]  # campo base -> cumbre del Everest
E, N = ESC.TU.transform(r[:, 1], r[:, 0]); E = np.array(E); N = np.array(N); Z = r[:, 2]
# tramo común hasta la Banda Amarilla (~7 500 m), luego ramal propio del Lhotse
j_rama = int(np.flatnonzero(Z >= 7500)[0])
comun = [(E[j], N[j], Z[j]) for j in range(j_rama + 1)]
everest = [(E[j], N[j], Z[j]) for j in range(j_rama, len(Z))]
a = (27.967468, 86.924192); s = (27.962107, 86.933842)
lh = []
for t in np.linspace(0, 1, 40)[1:]:
    la = a[0] + (s[0] - a[0]) * t; lo = a[1] + (s[1] - a[1]) * t
    e, n = ESC.utm(la, lo); lh.append((e, n, float(Mw.altura(np.array([e]), np.array([n]))[0])))

def linea(pts, paso=1):
    out = []
    for (e, n, z) in pts[::paso]:
        x, y = proy(e, n, z + 3)
        out.append([round(x, 5), round(y, 5), int(round(z)), visible(e, n, z + 3)])
    return out

hitos = {}
def hito(nombre, la, lo, dz=0.0):
    e, n = ESC.utm(la, lo); z = float(Mw.altura(np.array([e]), np.array([n]))[0]) + dz
    x, y = proy(e, n, z); hitos[nombre] = dict(x=round(x, 5), y=round(y, 5), z_dem=int(round(z)), visible=visible(e, n, z + 3))

hito('campo_base', 28.00255, 86.85490)
hito('cascada', 27.99542, 86.87478)
hito('campo1', 27.98300, 86.88100)
hito('campo2', 27.97997, 86.903825)
hito('campo3', 27.9686733, 86.91921)
hito('banda', 27.967468, 86.924192)
hito('campo4', 27.965592, 86.927570)
hito('cumbre_lhotse', 27.962107, 86.933842)
hito('everest', 27.98806, 86.92521)
hito('collado_sur', 27.97389, 86.92972)
hito('nuptse', 27.96722, 86.88611)
hito('pumori', 28.01500, 86.82806)
json.dump(dict(W=W, H=H, comun=linea(comun), everest=linea(everest, 2), lhotse=linea(lh), hitos=hitos), open(salida_json, 'w'), indent=0)
print('json', salida_json, len(comun), len(everest), len(lh))
print(json.dumps(hitos, indent=0))
