"""proyectar.py <salida.json> — para cada lámina (apaisada y vertical): posición en pantalla de las cimas,
los campos y la ruta normal (fracciones del cuadro, con visibilidad). Además, el perfil real de la ruta y
las curvas de nivel del macizo para el plano."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import extras                                   # noqa: E402
import numpy as np                              # noqa: E402
import generar                                  # noqa: E402
import vistas                                   # noqa: E402
import dem                                      # noqa: E402
import render3d as r3                           # noqa: E402
from escenas import camino, visible             # noqa: E402

salida = sys.argv[1]
rel, ctx = generar.recursos()
FORMATOS = {'h': (960, 540), 'v': (540, 1080)}
CIMAS = {c[0]: c for c in dem.CIMAS}
IDS = {'Gasherbrum I': 'g1', 'Gasherbrum II': 'g2', 'Gasherbrum III': 'g3', 'Gasherbrum IV': 'g4',
       'Gasherbrum II Este': 'g2e', 'Gasherbrum V': 'g5', 'Gasherbrum VI': 'g6', 'Broad Peak': 'bp',
       'Broad Peak Central': 'bpc', 'K2': 'k2', 'Baltoro Kangri': 'bk', 'Chogolisa': 'cho', 'Sia Kangri': 'sk',
       'Masherbrum': 'mash', 'Muztagh Tower': 'mt', 'Mitre Peak': 'mitre', 'Skyang Kangri': 'skk'}


def en_cuadro(e, u, v):
    return 0 <= u < e.W and 0 <= v < e.H


def delante(e, lat, lon):
    la0, lo0 = np.radians(e.cam.lat), np.radians(e.cam.lon)
    la1, lo1 = np.radians(lat), np.radians(lon)
    dlo = lo1 - lo0
    az = np.arctan2(np.sin(dlo) * np.cos(la1), np.cos(la0) * np.sin(la1) - np.sin(la0) * np.cos(la1) * np.cos(dlo))
    da = (np.degrees(az) - e.cam.rumbo + 540) % 360 - 180
    return abs(da) < e.cam.hfov / 2 + 1


def cima_visible(e, u, v, s):
    c = int(round(u))
    for dv in range(1, 7):
        r = int(round(v)) + dv
        if 0 <= r < e.H and 0 <= c < e.W:
            S = e.S[r, c]
            if np.isfinite(S) and S >= s * 0.95 - 60:
                return True
            if np.isfinite(S) and S < s * 0.9:
                return False
    return False


def gasherbrum_la():
    """Collado entre el G II Este y el G I: el punto más bajo de la cresta (búsqueda en un pasillo)."""
    a = CIMAS['Gasherbrum II Este']
    b = (None, 35.7300, 76.6880)
    best = None
    for t in np.linspace(0.15, 0.85, 60):
        la = a[1] + (b[1] - a[1]) * t
        lo = a[2] + (b[2] - a[2]) * t
        # máximo transversal (la cresta) en cada sección
        crest = None
        for k in np.linspace(-0.006, 0.006, 41):
            z = rel.altura(lo + k, la + k * 0.8)
            if crest is None or z > crest[0]:
                crest = (z, la + k * 0.8, lo + k)
        if best is None or crest[0] < best[0]:
            best = crest
    return best


z_la, la_la, lo_la = gasherbrum_la()
mid = len(vistas.Campo2.CORREDOR) // 2
RASGOS = [
    ('cascada', 'Cascada de hielo', (35.7130, 76.6530)),
    ('circo', 'Circo del Gasherbrum', (35.7392, 76.6680)),
    ('la', 'Gasherbrum La', (la_la, lo_la)),
    ('corredor', 'Corredor japonés', vistas.Campo2.CORREDOR[mid]),
]
print(f'Gasherbrum La ≈ {z_la:.0f} m en {la_la:.4f}, {lo_la:.4f}')

out = {'laminas': {}}
for clave, Esc in vistas.ESCENAS.items():
    esc = Esc()
    out['laminas'][clave] = {}
    for fmt, (W, H) in FORMATOS.items():
        cam = esc.camara(W, H)
        e = r3.trazar(rel, ctx, cam, W, H, nubes=esc.nubes_mar, claro=esc.claro)
        d = {'cam': {'lat': cam.lat, 'lon': cam.lon, 'rumbo': cam.rumbo, 'hfov': cam.hfov, 'v_h': cam.v_h,
                     'alt': round(float(e.hc))}}
        cimas = []
        for nombre, la, lo, cota, *_ in dem.CIMAS:
            if nombre not in IDS or not delante(e, la, lo):
                continue
            u, v, s = r3.proyectar(e, la, lo, cota)
            if not en_cuadro(e, u, v):
                continue
            cimas.append(dict(id=IDS[nombre], nombre=nombre, cota=cota, u=round(u / W, 4), v=round(v / H, 4),
                              km=round(s / 1000, 1), vis=bool(cima_visible(e, u, v, s))))
        d['cimas'] = cimas
        campos = []
        for nombre, (la, lo) in extras.PARADAS:
            z = rel.altura(lo, la)
            u, v, s = r3.proyectar(e, la, lo, z + 3)
            if delante(e, la, lo):
                campos.append(dict(id=nombre, u=round(u / W, 4), v=round(v / H, 4), z=round(float(z)),
                                   vis=bool(visible(e, u, v, s, tol=0.06)) and en_cuadro(e, u, v)))
        d['campos'] = campos
        rasgos = []
        for rid, nombre, (la, lo) in RASGOS:
            z = rel.altura(lo, la)
            u, v, s = r3.proyectar(e, la, lo, z + 3)
            if delante(e, la, lo) and en_cuadro(e, u, v):
                rasgos.append(dict(id=rid, nombre=nombre, u=round(u / W, 4), v=round(v / H, 4), z=round(float(z))))
        d['rasgos'] = rasgos
        if clave in ('ruta', 'concordia', 'campo_1', 'aerea'):
            pts = camino(e, rel, ctx, extras.RUTA_COMPLETA, n=320, dz=3.0)
            d['ruta'] = [[round(u / W, 4), round(v / H, 4), 1 if (visible(e, u, v, s, tol=0.06) and en_cuadro(e, u, v))
                          else 0] for u, v, s, x, y in pts]
        out['laminas'][clave][fmt] = d
        print(clave, fmt, len(cimas), 'cimas', [c['id'] + ('' if c['vis'] else '*') for c in cimas])

# ---------------------------------------------------------------------------- perfil real de la ruta
xs, ys = [], []
for la, lo in extras.RUTA_COMPLETA:
    x, y = dem.lonlat_a_xy(lo, la)
    xs.append(float(x))
    ys.append(float(y))
xs, ys = np.array(xs), np.array(ys)
dd = np.concatenate([[0], np.cumsum(np.hypot(np.diff(xs), np.diff(ys)))])
t = np.linspace(0, dd[-1], 220)
xi, yi = np.interp(t, dd, xs), np.interp(t, dd, ys)
perfil = []
for k in range(len(t)):
    lo, la = dem.xy_a_lonlat(xi[k], yi[k])
    perfil.append([round(t[k] / 1000, 3), round(float(rel.altura(float(lo), float(la))))])
paradas = []
for nombre, (la, lo) in extras.PARADAS:
    x, y = dem.lonlat_a_xy(lo, la)
    k = int(np.argmin(np.hypot(xi - x, yi - y)))
    paradas.append(dict(id=nombre, km=round(t[k] / 1000, 2), z=round(float(rel.altura(lo, la)))))
out['perfil'] = dict(puntos=perfil, paradas=paradas)

# ----------------------------------------------------------------------- curvas de nivel para el plano
from skimage import measure                     # noqa: E402
LA0, LA1, LO0, LO1 = 35.676, 35.772, 76.600, 76.728
n_la, n_lo = 300, int(300 * (LO1 - LO0) * np.cos(np.radians(35.72)) / (LA1 - LA0))
las = np.linspace(LA1, LA0, n_la)
los = np.linspace(LO0, LO1, n_lo)
LO_, LA_ = np.meshgrid(los, las)
Z = np.asarray(rel.altura(LO_, LA_), np.float32)
from scipy import ndimage                       # noqa: E402
Zs = ndimage.gaussian_filter(Z, 1.0)
VW = 1000.0
VH = VW * n_la / n_lo
curvas = []
for nivel in range(4800, 8100, 200):
    for c in measure.find_contours(Zs, nivel):
        if len(c) < 8:
            continue
        c = measure.approximate_polygon(c, tolerance=0.5)
        pts = 'L'.join(f'{p[1] / (n_lo - 1) * VW:.1f} {p[0] / (n_la - 1) * VH:.1f}' for p in c)
        curvas.append(dict(z=nivel, d='M' + pts))


def plano_xy(la, lo):
    return round((lo - LO0) / (LO1 - LO0) * VW, 1), round((LA1 - la) / (LA1 - LA0) * VH, 1)


plano = dict(vw=VW, vh=round(VH, 1), curvas=curvas,
             ruta=[plano_xy(la, lo) for la, lo in
                   [dem.xy_a_lonlat(xi[k], yi[k])[::-1] for k in range(0, len(t), 2)]],
             campos=[dict(id=n, xy=plano_xy(la, lo)) for n, (la, lo) in extras.PARADAS],
             cimas=[dict(id=IDS[c[0]], nombre=c[0], cota=c[3], xy=plano_xy(c[1], c[2])) for c in dem.CIMAS
                    if c[0] in IDS and LA0 < c[1] < LA1 and LO0 < c[2] < LO1],
             rasgos=[dict(id=rid, nombre=n, xy=plano_xy(la, lo)) for rid, n, (la, lo) in RASGOS],
             km=round(1000 / ((LO1 - LO0) * dem.M_LON / VW), 2))
out['plano'] = plano
json.dump(out, open(salida, 'w'), ensure_ascii=False, separators=(',', ':'), default=lambda o: o.item())
print('perfil', paradas, 'curvas', len(curvas), 'bytes', os.path.getsize(salida))
