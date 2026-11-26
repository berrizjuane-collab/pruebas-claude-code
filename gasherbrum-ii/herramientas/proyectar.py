#!/usr/bin/env python3
"""Proyecciones para la web: dónde cae cada cima, campo y punto de la ruta en cada lámina (apaisada y vertical),
con su visibilidad real, más el perfil de la ruta sobre el relieve y el plano con curvas de nivel.

    python3 proyectar.py <salida.json>

Usa la cámara exacta de cada escena (escena.camara_de) y un render de profundidad a 1600x900 para decidir si
cada punto se ve o lo tapa el relieve.  La vertical es un recorte 1:2 de la apaisada (escenas_extra.RECORTE_V).
"""
import json
import math
import os
import sys

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src')
sys.path.insert(0, SRC)
import numpy as np                       # noqa: E402
import escena as E                       # noqa: E402
import escenas as S                      # noqa: E402
import escenas_extra as SX               # noqa: E402
import render3d as R3                    # noqa: E402

MASTER = (5120, 2880)
W, H = 1600, 900
ANCHO_V = (MASTER[1] / 2) / MASTER[0]          # 1440 / 5120
CIMAS = {'g1': 'Gasherbrum I', 'g2': 'Gasherbrum II', 'g2e': 'Gasherbrum II Este', 'g3': 'Gasherbrum III',
         'g4': 'Gasherbrum IV', 'g5': 'Gasherbrum V', 'g6': 'Gasherbrum VI', 'bp': 'Broad Peak',
         'bpc': 'Broad Peak Central', 'k2': 'K2', 'chog': 'Chogolisa', 'bk': 'Baltoro Kangri', 'mitre': 'Mitre Peak',
         'masher': 'Masherbrum'}
COTAS = {'g1': 8080, 'g2': 8035, 'g2e': 7772, 'g3': 7952, 'g4': 7925, 'g5': 7147, 'g6': 6979, 'bp': 8051, 'bpc': 8011,
         'k2': 8611, 'chog': 7665, 'bk': 7312, 'mitre': 6010, 'masher': 7821}
COTA_CAMPO = {'CB': 5120, 'C1': 5880, 'C2': 6410, 'C3': 7010, 'C4': 7425, 'Cima': 8035}


def densificar(pts, paso=25.0):
    out = []
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) / paso))
        for k in range(n):
            t = k / n
            out.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    out.append(pts[-1])
    return out


def main(salida):
    niv, cum, extra = E.terreno()
    z = E.altura_suelo
    ruta = densificar(SX.RUTA, 25.0)
    ruta_z = [z(x, y) for x, y in ruta]
    ruta_z[-1] = 8035.0
    res = {'laminas': {}, 'master': list(MASTER), 'ancho_v': ANCHO_V}
    for clave in S.ORDEN:
        esc = S.ESCENAS[clave]
        cam = E.camara_de(esc, W, H)
        buf = R3.render(cam, niv, sol=None, dlod=esc.get('dlod', 32000.0))
        prof = buf['dist']

        def proy(x, y, zz):
            u, v, d = cam.proyectar(np.array([x]), np.array([y]), np.array([zz]))
            return float(u[0]), float(v[0]), float(math.hypot(x - cam.x, y - cam.y))

        def ve(u, v, d, tol=0.03):
            if not (0 <= u < W and 0 <= v < H):
                return False
            ui, vi = int(u), int(min(H - 1, max(0, v + 1.5)))
            p = prof[vi, ui]
            return (not np.isfinite(p)) or p > d * (1 - tol) - 25

        L = {'cam': dict(x=round(cam.x), y=round(cam.y), z=round(cam.z), rumbo=esc['rumbo'], hfov=esc['hfov'], cy=esc['cy']),
             'cimas': [], 'campos': [], 'rasgos': []}
        for cid, nombre in CIMAS.items():
            if nombre not in cum:
                continue
            x, y, zz = cum[nombre]
            u, v, d = proy(x, y, zz)
            if not (np.isfinite(u) and -0.05 * W < u < 1.05 * W and -0.05 * H < v < 1.05 * H):
                continue
            L['cimas'].append(dict(id=cid, nombre=nombre, cota=COTAS[cid], u=round(u / W, 4), v=round(v / H, 4),
                                   km=round(d / 1000, 1), vis=bool(ve(u, v - 2, d, 0.02))))
        for nombre, (x, y) in SX.PARADAS:
            zz = 8035.0 if nombre == 'Cima' else z(x, y) + 3
            u, v, d = proy(x, y, zz)
            if not np.isfinite(u):
                continue
            L['campos'].append(dict(id=nombre, z=COTA_CAMPO[nombre], u=round(u / W, 4), v=round(v / H, 4), vis=bool(ve(u, v, d))))
        for rid, nombre, (x, y) in SX.RASGOS:
            u, v, d = proy(x, y, z(x, y) + 3)
            if np.isfinite(u) and 0 <= u < W and 0 <= v < H:
                L['rasgos'].append(dict(id=rid, nombre=nombre, u=round(u / W, 4), v=round(v / H, 4), vis=bool(ve(u, v, d))))
        if clave in ('ruta', 'caravana', 'campo_1'):
            pts = []
            for (x, y), zz in zip(ruta, ruta_z):
                u, v, d = proy(x, y, zz + 3)
                if not np.isfinite(u):
                    continue
                pts.append([round(u / W, 4), round(v / H, 4), 1 if ve(u, v, d) else 0])
            L['ruta'] = pts
        # vertical: recorte centrado en RECORTE_V
        c = SX.RECORTE_V.get(clave, 0.5)
        x0 = min(max(c - ANCHO_V / 2, 0), 1 - ANCHO_V)
        LV = {'cam': L['cam'], 'recorte': [round(x0, 4), round(ANCHO_V, 4)], 'cimas': [], 'campos': [], 'rasgos': []}
        for k in ('cimas', 'campos', 'rasgos'):
            for it in L[k]:
                uu = (it['u'] - x0) / ANCHO_V
                if -0.02 <= uu <= 1.02:
                    j = dict(it); j['u'] = round(uu, 4); LV[k].append(j)
        if 'ruta' in L:
            LV['ruta'] = [[round((p[0] - x0) / ANCHO_V, 4), p[1], p[2]] for p in L['ruta']]
        res['laminas'][clave] = {'h': L, 'v': LV}
        print(clave, 'cimas', [(c_['id'], c_['vis']) for c_ in L['cimas']], 'campos', [(c_['id'], c_['vis']) for c_ in L['campos']], flush=True)

    # ---------------------------------------------------------------- perfil de la ruta
    dist = [0.0]
    for (x0, y0), (x1, y1) in zip(ruta[:-1], ruta[1:]):
        dist.append(dist[-1] + math.hypot(x1 - x0, y1 - y0))
    puntos = []
    for k in range(0, len(ruta), 2):
        puntos.append([round(dist[k] / 1000, 3), round(ruta_z[k])])
    if puntos[-1][0] != round(dist[-1] / 1000, 3):
        puntos.append([round(dist[-1] / 1000, 3), 8035])
    paradas = []
    for nombre, (x, y) in SX.PARADAS:
        k = int(np.argmin([math.hypot(px - x, py - y) for px, py in ruta]))
        paradas.append(dict(id=nombre, km=round(dist[k] / 1000, 2), z=COTA_CAMPO[nombre]))
    res['perfil'] = dict(puntos=puntos, paradas=paradas, total_km=round(dist[-1] / 1000, 2))
    print('perfil', res['perfil']['total_km'], 'km', paradas)

    # ---------------------------------------------------------------- plano con curvas de nivel
    from skimage import measure
    X0, X1, Y0, Y1 = -4300.0, 5300.0, -9300.0, 1700.0
    paso = 40.0
    xs = np.arange(X0, X1 + paso, paso); ys = np.arange(Y0, Y1 + paso, paso)
    gx, gy = np.meshgrid(xs, ys)
    Z = niv[0].muestrear(gx.ravel(), gy.ravel(), order=1).reshape(gx.shape)
    vw = 1000.0
    k_ = vw / (X1 - X0)
    vh = round((Y1 - Y0) * k_, 1)
    a_svg = lambda x, y: (round((x - X0) * k_, 1), round((Y1 - y) * k_, 1))
    curvas = []
    from scipy import ndimage as ndi
    Zs = ndi.gaussian_filter(np.nan_to_num(Z, nan=float(np.nanmin(Z))), 1.2)
    for nivel in range(4800, 8001, 200):
        for cont in measure.find_contours(Zs, nivel):
            if len(cont) < 12:
                continue
            cont = measure.approximate_polygon(cont, tolerance=0.9)
            pts = [a_svg(X0 + c[1] * paso, Y0 + c[0] * paso) for c in cont]
            d = 'M' + 'L'.join(f'{p[0]} {p[1]}' for p in pts)
            curvas.append(dict(z=nivel, d=d))
    plano = dict(vw=vw, vh=vh, km=round(1000 * k_, 2), curvas=curvas,
                 ruta=[list(a_svg(x, y)) for x, y in densificar(SX.RUTA, 60.0)],
                 campos=[dict(id=n, xy=list(a_svg(x, y))) for n, (x, y) in SX.PARADAS],
                 cimas=[dict(id=cid, nombre=CIMAS[cid], cota=COTAS[cid], xy=list(a_svg(*cum[CIMAS[cid]][:2])))
                        for cid in ('g1', 'g2', 'g2e', 'g3', 'g4', 'g5', 'g6')],
                 rasgos=[dict(id=r, nombre=n, xy=list(a_svg(x, y))) for r, n, (x, y) in SX.RASGOS])
    res['plano'] = plano
    print('plano', len(curvas), 'curvas', vw, vh)
    json.dump(res, open(salida, 'w'), ensure_ascii=False, separators=(',', ':'))
    print('ok', salida, os.path.getsize(salida) // 1024, 'KB')


if __name__ == '__main__':
    main(sys.argv[1])
