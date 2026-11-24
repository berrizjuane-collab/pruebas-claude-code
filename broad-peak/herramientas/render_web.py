"""render_web.py — pinta láminas con el código de la marca y exporta, además, profundidad y anclas.

  python render_web.py <carpeta codigo> <salida> <escena[,escena]> [ancho alto] [--solo-T]

Para cada escena escribe en <salida>:
  <id>.png          la lámina pintada (sin pérdida)
  <id>_depth.png    disparidad 8 bit (255 = cerca, 0 = cielo), con la utilería a la profundidad de su base
  <id>_anclas.json  cámara y posiciones proyectadas (x,y normalizados, distancia) de campos y cumbres
"""
import sys, os, json, math, time
import numpy as np

CODE = os.path.abspath(sys.argv[1])
OUT = os.path.abspath(sys.argv[2])
sys.path.insert(0, CODE)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageDraw
from scipy import ndimage as ndi
import pintor
import escena as esc
from terreno import rejillas_base, rejilla_detalle, CIMAS, COLLADO
from render3d import Mundo
from sombreado import Campos
from escenas import ESCENAS, CB, C1, C2, C3
import extra_escenas

ESCENAS.update(extra_escenas.ESCENAS)

# ---------------------------------------------------------------- registro de primitivas por objeto
REG = {'cur': None}
_poly, _line, _ell = pintor.Lienzo.poly, pintor.Lienzo.line, pintor.Lienzo.ellipse


def poly(self, pts, fill):
    if REG['cur'] is not None and len(pts) >= 3:
        REG['cur'].append(('poly', [(float(x), float(y)) for x, y in pts]))
    return _poly(self, pts, fill)


def line(self, pts, fill, width, rebrush=True):
    if REG['cur'] is not None:
        REG['cur'].append(('line', [(float(x), float(y)) for x, y in pts], float(width)))
    return _line(self, pts, fill, width, rebrush)


def ellipse(self, cx, cy, rx, ry, fill, rebrush=True):
    if REG['cur'] is not None:
        REG['cur'].append(('ell', float(cx), float(cy), float(rx), float(ry)))
    return _ell(self, cx, cy, rx, ry, fill, rebrush)


pintor.Lienzo.poly, pintor.Lienzo.line, pintor.Lienzo.ellipse = poly, line, ellipse
OBJS = []


def envolver(objetos):
    nuevos = []
    for k, (y, fn) in enumerate(objetos):
        def g(p, fn=fn, y=y):
            REG['cur'] = []
            try:
                fn(p)
            finally:
                OBJS.append((y, REG['cur']))
                REG['cur'] = None
        nuevos.append((y, g))
    return nuevos


def bbox(prims):
    xs, ys = [], []
    for pr in prims:
        if pr[0] == 'poly' or pr[0] == 'line':
            for x, y in pr[1]:
                xs.append(x); ys.append(y)
        else:
            _, cx, cy, rx, ry = pr
            xs += [cx - rx, cx + rx]; ys += [cy - ry, cy + ry]
    return min(xs), min(ys), max(xs), max(ys)


def profundidad(dist, W, H):
    """dist del relieve + utilería a la distancia de su base → disparidad log en [0,1]."""
    obj = Image.new('F', (W, H), 0.0)
    d = ImageDraw.Draw(obj)
    for y, prims in sorted(OBJS, key=lambda o: o[0]):
        if not prims or y < -1e8:
            continue
        if len(prims) == 1 and prims[0][0] == 'line':          # cuerdas: van pegadas al suelo
            continue
        x0, y0, x1, y1 = bbox(prims)
        if (x1 - x0) * (y1 - y0) > 0.35 * W * H:
            continue
        yb = int(min(H - 1, max(0, y1)))
        xa, xb = int(max(0, x0)), int(min(W - 1, x1)) + 1
        win = dist[max(0, yb - 3):min(H, yb + 4), xa:xb]
        v = win[win >= 0]
        if v.size == 0:
            continue
        db = float(np.median(v))
        for pr in prims:
            if pr[0] == 'poly':
                d.polygon(pr[1], fill=db)
            elif pr[0] == 'line':
                d.line(pr[1], fill=db, width=max(1, int(round(pr[2]))))
            else:
                _, cx, cy, rx, ry = pr
                d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=db)
    o = np.asarray(obj, np.float32)
    D = dist.astype(np.float32).copy()
    D[D < 0] = 1e7
    m = o > 0
    D[m] = np.minimum(D[m], o[m])
    dnear, dfar = 4.0, 90000.0
    disp = 1.0 - np.log(np.clip(D, dnear, dfar) / dnear) / math.log(dfar / dnear)
    disp[dist < 0] = 0.0
    disp[m] = np.maximum(disp[m], 1.0 - np.log(np.clip(o[m], dnear, dfar) / dnear) / math.log(dfar / dnear))
    return disp


def anclas(E, mundo):
    cam = E['cam']
    W, H = cam.W, cam.H
    dist = E['dist']

    def p(la, lo, z=None, nombre=''):
        if z is None:
            z = mundo.altura(lo, la) + 2.0
        x, y, d = cam.proyectar(la, lo, z, cam.h_c)
        x, y, d = float(x), float(y), float(d)
        vis = False
        xi, yi = int(round(x)), int(round(y))
        if 0 <= xi < W and 0 <= yi < H:
            dm = dist[min(H - 1, yi + 1), xi]
            vis = bool(dm < 0 or dm > d * 0.93 - 30)
        return dict(nombre=nombre, x=x / W, y=y / H, d=d, z=float(z), visible=vis)

    a = {'cam': dict(lat=cam.lat, lon=cam.lon, h=cam.h_c, rumbo=cam.rumbo, hfov=cam.hfov, cy=cam.cy, W=W, H=H)}
    pts = []
    for n, la, lo, h, _ in CIMAS:
        pts.append(p(la, lo, h + 4.0, n))
    pts.append(p(COLLADO[0], COLLADO[1], COLLADO[2] + 3.0, 'Collado'))
    for n, (la, lo) in (('CB', CB), ('C1', C1), ('C2', C2), ('C3', C3)):
        pts.append(p(la, lo, None, n))
    a['puntos'] = pts
    # ruta normal: tramos rectos sobre el terreno (paso ~25 m) CB → C1 → C2 → C3 → collado → Rocky → principal
    rocky = next(c for c in CIMAS if 'Rocky' in c[0])
    prin = next(c for c in CIMAS if 'principal' in c[0])
    wp = [CB, C1, C2, C3, (35.8150, 76.5622), (COLLADO[0], COLLADO[1]), (35.8165, 76.5662), (rocky[1], rocky[2]),
          (35.8128, 76.5658), (prin[1], prin[2])]
    ruta = []
    for (la0, lo0), (la1, lo1) in zip(wp[:-1], wp[1:]):
        dN = (la1 - la0) * 111320.0; dE = (lo1 - lo0) * 111320.0 * math.cos(math.radians(la0))
        n = max(2, int(math.hypot(dN, dE) / 25.0))
        for t in np.linspace(0, 1, n, endpoint=False):
            la, lo = la0 + (la1 - la0) * t, lo0 + (lo1 - lo0) * t
            ruta.append(p(la, lo, mundo.altura(lo, la) + 3.0))
    ruta.append(p(prin[1], prin[2], prin[3] + 4.0))
    a['ruta'] = [dict(x=r['x'], y=r['y'], d=r['d'], z=r['z'], v=r['visible']) for r in ruta]
    return a


def main():
    nombres = sys.argv[3].split(',')
    W = int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4][0] != '-' else 3840
    H = int(sys.argv[5]) if len(sys.argv) > 5 and sys.argv[5][0] != '-' else 2160
    solo_T = '--solo-T' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    hi, lo = rejillas_base()
    det = rejilla_detalle(hi)
    mundo = Mundo(det, hi, lo)
    campos = Campos(mundo)
    for n in nombres:
        cfg = ESCENAS[n]
        t = time.time()
        print(f'== {n} {W}x{H}', flush=True)
        OBJS.clear()
        E = esc.construir(cfg, mundo, campos, W, H, seed=1)
        base = os.path.join(OUT, cfg['id'])
        A = anclas(E, mundo)
        json.dump(A, open(base + '_anclas.json', 'w'), ensure_ascii=False, indent=1)
        if solo_T:
            Image.fromarray(np.clip(E['T'], 0, 255).astype(np.uint8)).save(base + '_T.png')
            print('   T listo', time.time() - t, flush=True)
            continue
        im = pintor.pintar(E['T'], E['reg'], envolver(E['objetos']), cfg.get('acabado'), seed=2,
                           dir_extra=E['dir_extra'])
        im.save(base + '.png', compress_level=3)
        disp = profundidad(E['dist'], W, H)
        np.save(base + '_disp.npy', disp.astype(np.float16))
        print(f'   listo en {time.time() - t:.1f}s', flush=True)


if __name__ == '__main__':
    main()
