"""Escenas extra (ruta aérea y vista desde Sikkim) sobre el mismo motor de scenes.py,
más proyección de cimas y del trazado de la ruta a coordenadas normalizadas de cada lámina."""
import sys, os, json, math
import numpy as np
SRC = sys.argv[1]
sys.path.insert(0, SRC)
import scenes, kit
from scenes import SCENES, OBJECTS, make_camera, terrain, render
from terrain import raster

SCENES['ruta'] = dict(
    title='La ruta', alt='5 450 → 8 586 m', where='sobre el glaciar Yalung · mirando al NE (38°) · mediodía',
    cam=(-9000, -9300), z=8200, yaw=38, hfov=60, horizon=0.30,
    sun=(215, 48), pal='day', sky='day', v_base=0.30, glow=0.25, glow_side='right', cirrus=0.35, crevasses=1.0,
    snowline=5600, haze_d=60000, near_d=900,
    clouds_back=[(0.06, 0.20, 0.08, 0.07, 120), (0.93, 0.16, 0.09, 0.08, 130)], fg=None, objects=None, ls=-1, seed=91)

SCENES['sikkim'] = dict(
    title='Desde Sikkim', alt='Dzongri · 4 100 m', where='mirando al NNO (356°) · amanecer',
    cam=(1500, -19500), z=5400, yaw=354, hfov=40, horizon=0.66,
    sun=(98, 5.0), pal='dawn', sky='antidawn', lit_rng=(0.04, 0.55), ambient=0.40, ambient_dir=(100, 25),
    crevasses=0.4, v_base=0.60, glow=0.0, cirrus=0.25,
    haze_d=60000, near_d=1500, d_min=900, warm_tip=(5200, 8000, (255, 160, 110), 0.55), snowline=5200,
    sea=dict(level=3900, scale=900, cover=0.70, sun=(98, 6),
             pal_cols=((92, 92, 150), (164, 150, 190), (240, 196, 186), (150, 140, 182), (40, 42, 86))),
    clouds_back=[(0.06, 0.30, 0.07, 0.05, 90), (0.93, 0.24, 0.08, 0.06, 100)],
    fg=dict(kind='moraine', far=None,
            near=[(0, 0.835), (0.20, 0.822), (0.42, 0.842), (0.64, 0.830), (0.86, 0.818), (1.0, 0.800)]),
    objects='sk', ls=-1, seed=81)


def objects_sk(P, Dd, Wc, Hc, Uc, rng, ctx):
    ls = ctx['ls']; near = ctx['near']
    cy = lambda u: near(np.array([u]))[0] * Hc
    chx = 0.80 * Wc; chy = cy(0.80) + 70 * Uc
    kit.chorten(P, chx, chy, 104 * Uc, Uc, rng, ls=ls,
                flags_to=[(1.02 * Wc, cy(1.0) - 300 * Uc, 70 * Uc), (0.50 * Wc, cy(0.50) - 60 * Uc, 110 * Uc),
                          (0.62 * Wc, cy(0.62) + 40 * Uc, 60 * Uc)])
    for k in range(26):
        u = rng.uniform(0.0, 1.0)
        y0 = cy(u)
        t = rng.random() ** 1.3
        y = y0 + 10 * Uc + t * (Hc - y0)
        kit.stone(P, u * Wc, y, (12 + 70 * t) * Uc * rng.uniform(0.6, 1.3), rng, ls=ls)
    kit.climber(P, 0.30 * Wc, cy(0.30) + 40 * Uc, 120 * Uc, suit=(60, 96, 170), ls=ls, face=1, U=Uc, axe=False, lean=0.04)


OBJECTS['sk'] = objects_sk
_orig_grass = scenes.grass_bc


def project_info(name, W=1920, H=1080):
    """Cimas y ruta en (u, v) normalizados; visible = no tapado por el relieve."""
    sc = SCENES[name]
    terr = terrain()
    cam = make_camera(sc, terr, W, H)
    R = raster(terr, cam, d_min=sc.get('d_min', 60.0))
    D = R['dist']
    out = dict(scene=name, peaks=[], route=None)
    g = terr.fine; X, Y = g.coords(); m = (np.abs(X) < 300) & (np.abs(Y) < 300)
    k = int(np.argmax(np.where(m, g.z, -1))); sx, sy = float(X.ravel()[k]), float(Y.ravel()[k])
    for pn, lat, lon, h in terr.peaks:
        if pn == 'Kangchenjunga':
            x, y = sx, sy
        else:
            x, y = (lon - terr.lon0) * terr.m_lon, (lat - terr.lat0) * terr.m_lat
        gx, gy = np.meshgrid(np.arange(-300, 301, 30.0), np.arange(-300, 301, 30.0))
        gx, gy = (gx + x).ravel(), (gy + y).ravel()
        gz = terr.height(gx.astype(np.float32), gy.astype(np.float32))
        k_ = int(np.argmax(gz)); x, y, z = float(gx[k_]), float(gy[k_]), float(gz[k_])
        c, r, d = cam.project(np.array([x]), np.array([y]), np.array([z + 4]))
        c, r, d = float(c[0]), float(r[0]), float(d[0])
        a = math.radians(cam.yaw)
        fwd = (x - cam.x) * math.sin(a) + (y - cam.y) * math.cos(a)
        if fwd <= 0 or not (0 <= c < W and 0 <= r < H):
            continue
        vis = True
        if D is not None:
            ci = int(c); vis = False
            for k_ in range(0, 9):
                ri = int(min(H - 1, max(0, r + k_)))
                dd = float(D[ri, ci])
                if (not np.isfinite(dd)) or dd > d * 0.92:
                    vis = True; break
        out['peaks'].append(dict(name=pn, h=h, u=round(c / W, 4), v=round(r / H, 4), dist_km=round(d / 1000, 1), visible=bool(vis)))
    return out, cam, terr, R


def route_info(W=1920, H=1080):
    out, cam, terr, R = project_info('ruta', W, H)
    g = terr.fine; X, Y = g.coords(); m = (np.abs(X) < 300) & (np.abs(Y) < 300)
    k = int(np.argmax(np.where(m, g.z, -1))); sx, sy = float(X.ravel()[k]), float(Y.ravel()[k])
    way = [('bc', -4250, -4380), (None, -3950, -3700), (None, -3650, -3050), ('c1', -3450, -2550), (None, -3100, -2200),
           ('c2', -2750, -1950), (None, -2200, -1800), (None, -1750, -1620), (None, -1400, -1520), ('c3', -1050, -1450),
           (None, -800, -1150), (None, -620, -880), ('c4', -500, -650), (None, -640, -420), (None, -790, -210),
           (None, -760, -40), (None, -520, 40), (None, -300, 20), ('cima', sx, sy)]
    pts = []
    for i in range(len(way) - 1):
        _, x0, y0 = way[i]; _, x1, y1 = way[i + 1]
        n = max(2, int(math.hypot(x1 - x0, y1 - y0) / 25))
        for t in np.linspace(0, 1, n, endpoint=(i == len(way) - 2)):
            pts.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    pts = np.array(pts)
    z = terr.height(pts[:, 0].astype(np.float32), pts[:, 1].astype(np.float32)).astype(float) + 6
    c, r, d = cam.project(pts[:, 0], pts[:, 1], z)
    D = R['dist']
    vis = []
    for ci, ri, di in zip(c, r, d):
        ii, jj = int(min(H - 1, max(0, ri + 2))), int(min(W - 1, max(0, ci)))
        dd = float(D[ii, jj]); vis.append(bool((not np.isfinite(dd)) or dd > di * 0.96))
    poly = [[round(float(a) / W, 4), round(float(b) / H, 4), int(zz), v] for a, b, zz, v in zip(c, r, z, vis)]
    camps = []
    for key, x, y in [w for w in way if w[0]]:
        zz = float(terr.height(np.array([x], np.float32), np.array([y], np.float32))[0])
        cc, rr, _ = cam.project(np.array([x]), np.array([y]), np.array([zz + 6]))
        camps.append(dict(id=key, u=round(float(cc[0]) / W, 4), v=round(float(rr[0]) / H, 4), z=int(zz)))
    out['route'] = dict(poly=poly, camps=camps)
    return out


if __name__ == '__main__':
    cmd = sys.argv[2]
    for a in sys.argv:
        if a.startswith('--set='):
            nm, js = a[6:].split(':', 1)
            SCENES[nm].update(json.loads(js))
    if cmd == 'render':
        name, W, H, outp = sys.argv[3], int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
        render(name, W, H, outp, preview='--preview' in sys.argv)
    elif cmd == 'info':
        res = {}
        for n in sys.argv[4:]:
            if n == 'ruta':
                res[n] = route_info()
            else:
                res[n] = project_info(n)[0]
        json.dump(res, open(sys.argv[3], 'w'), ensure_ascii=False, indent=1)
        print(json.dumps({k: [(p['name'], p['u'], p['v'], p['visible']) for p in v['peaks']] for k, v in res.items()}, ensure_ascii=False))
