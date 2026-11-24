"""Ruta normal sobre el DEM: perfil (s, z) y proyección en la lámina VII con visibilidad, para la web."""
import sys, os, json, math
CODE = sys.argv[1]; OUT = sys.argv[2]
sys.path.insert(0, CODE); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from terreno import rejillas_base, rejilla_detalle, CIMAS, COLLADO
from render3d import Mundo
from sombreado import Campos
from escenas import CB, C1, C2, C3
import escena as esc
import extra_escenas
hi, lo = rejillas_base(); det = rejilla_detalle(hi); mundo = Mundo(det, hi, lo); campos = Campos(mundo)
C = {n: (la, lo_, h) for n, la, lo_, h, _ in CIMAS}
prin = C['Broad Peak (principal)']; rocky = C['Broad Peak (Rocky Summit)']
R = 6371000.0
def dist(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0]); dl = math.radians(b[1]-a[1])
    h = math.sin((p2-p1)/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(h))
wp = [('CB', CB), ('C1', C1), ('C2', C2), ('C3', C3), (None, (35.8150, 76.5622)), ('Collado', COLLADO[:2]),
      (None, (35.8165, 76.5662)), ('Rocky', rocky[:2]), (None, (35.8128, 76.5658)), ('Cima', prin[:2])]
pts = []; s = 0.0; prev = None; marcas = {}
for (n0, a), (n1, b) in zip(wp[:-1], wp[1:]):
    L = dist(a, b); k = max(2, int(L / 22))
    for t in np.linspace(0, 1, k, endpoint=False):
        la, lo_ = a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t
        z = mundo.altura(lo_, la)
        if n0 in ('Rocky',) and t == 0: z = rocky[2]
        if n0 == 'Collado' and t == 0: z = COLLADO[2]
        if prev is not None: s += math.hypot(dist(prev[:2], (la, lo_)), z - prev[2])
        if t == 0 and n0: marcas[n0] = s
        prev = (la, lo_, z); pts.append((la, lo_, z, s))
s += math.hypot(dist(prev[:2], prin[:2]), prin[2] - prev[2]); pts.append((prin[0], prin[1], prin[2], s)); marcas['Cima'] = s
# proyección en la lámina VII
cfg = extra_escenas.ESCENAS['ruta']
W, H = 1920, 1080
E = esc.construir(cfg, mundo, campos, W, H, seed=1)
cam, D = E['cam'], E['dist']
DN, DF = 4.0, 90000.0
out = []
for la, lo_, z, si in pts:
    x, y, d = cam.proyectar(la, lo_, z + 3.0, cam.h_c); x, y, d = float(x), float(y), float(d)
    xi, yi = int(round(x)), int(round(y)); v = 0
    if 0 <= xi < W and 0 <= yi < H:
        dm = D[min(H-1, yi+1), xi]; v = int(dm < 0 or dm > d*0.93 - 30)
    p = 1 - math.log(min(max(d, DN), DF)/DN)/math.log(DF/DN)
    out.append([round(x/W, 5), round(y/H, 5), round(p, 4), v, round(si, 1), round(z, 1)])
json.dump(dict(puntos=out, marcas={k: round(v, 1) for k, v in marcas.items()}, total=round(s, 1)), open(OUT, 'w'), separators=(',', ':'))
print(len(out), 'puntos', round(s), 'm', {k: round(v) for k, v in marcas.items()}, 'visibles', sum(o[3] for o in out))
