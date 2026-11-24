import sys, os, json, math
CODE=sys.argv[1]; OUT=sys.argv[2]; sys.path.insert(0, CODE)
import numpy as np
from terreno import rejillas_base, rejilla_detalle, CIMAS, COLLADO
from render3d import Mundo
from escenas import CB, C1, C2, C3, CONCORDIA
hi, lo = rejillas_base(); det = rejilla_detalle(hi); m = Mundo(det, hi, lo)
R = 6371000.0
def dist(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0]); dl = math.radians(b[1]-a[1])
    h = math.sin((p2-p1)/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(h))
C = {n: (la, lo, h) for n, la, lo, h, _ in CIMAS}
prin = C['Broad Peak (principal)']; rocky = C['Broad Peak (Rocky Summit)']; cen = C['Broad Peak Central']; nor = C['Broad Peak Norte']
out = {}
# ruta: CB → C1 → C2 → C3 → (corredor) → collado → arista → Rocky → principal, sobre el terreno
wp = [('CB', CB), ('C1', C1), ('C2', C2), ('C3', C3), (None, (35.8150, 76.5622)), ('Collado', COLLADO[:2]),
      (None, (35.8165, 76.5662)), ('Rocky Summit', rocky[:2]), (None, (35.8128, 76.5658)), ('Cima', prin[:2])]
pts = []; s = 0.0; prev = None; marcas = {}
for (n0, a), (n1, b) in zip(wp[:-1], wp[1:]):
    if n0: marcas[n0] = None
    L = dist(a, b); k = max(2, int(L/20))
    for t in np.linspace(0, 1, k, endpoint=False):
        la, lo_ = a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t
        z = m.altura(lo_, la)
        if prev is not None:
            s += math.hypot(dist(prev[:2], (la, lo_)), z - prev[2])
        if t == 0 and n0: marcas[n0] = s
        prev = (la, lo_, z); pts.append((round(s, 1), round(float(z), 1)))
la, lo_ = prin[0], prin[1]; s += math.hypot(dist(prev[:2], (la, lo_)), prin[2]-prev[2]); pts.append((round(s,1), prin[2])); marcas['Cima'] = s
out['ruta_perfil'] = pts; out['ruta_marcas'] = marcas; out['ruta_km'] = s/1000
# cresta: de la principal hacia el norte, siguiendo el punto más alto en perpendicular (E-O)
cresta = []; la = prin[0]-0.002
lon_c = prin[1]
while la < nor[0] + 0.004:
    best = (-1e9, None)
    for dlo in np.linspace(-0.006, 0.006, 61):
        z = m.altura(lon_c + dlo, la)
        if z > best[0]: best = (z, lon_c + dlo)
    lon_c = lon_c + 0.6*(best[1]-lon_c)
    cresta.append((round(la, 5), round(float(best[0]), 1)))
    la += 0.0002
out['cresta'] = cresta
out['dist'] = {
  'K2_desde_cima_km': dist(prin, C['K2'])/1000,
  'rocky_cima_m': dist(prin, rocky),
  'concordia': {n: dist(CONCORDIA, C[n])/1000 for n in ('K2', 'Broad Peak (principal)', 'Gasherbrum I', 'Gasherbrum II', 'Gasherbrum III', 'Gasherbrum IV')},
  'concordia_cb_km': dist(CONCORDIA, CB)/1000,
  'cresta_principal_central_km': dist(prin, cen)/1000,
  'cresta_principal_norte_km': dist(prin, nor)/1000,
}
lat0 = math.radians(prin[0]); dN = (C['K2'][0]-prin[0])*111320; dE = (C['K2'][1]-prin[1])*111320*math.cos(lat0)
out['dist']['K2_rumbo'] = math.degrees(math.atan2(dE, dN)) % 360
json.dump(out, open(OUT, 'w'), indent=1)
print(json.dumps(out['dist'], indent=1)); print('ruta km', out['ruta_km'], out['ruta_marcas'])
