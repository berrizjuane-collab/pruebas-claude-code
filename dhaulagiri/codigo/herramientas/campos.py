"""Rasgos de la ruta normal medidos sobre el GLO-30 (de aquí salen CAMPOS, ARISTA_NE y las cascadas
de escenas.py y sombreado.py):

  * collado noreste = punto de silla entre el Dhaulagiri I y el Tukuche Peak (unión de cuencas por
    altura decreciente: la primera cota a la que las dos cimas quedan conectadas);
  * arista noreste = camino de coste mínimo del collado a la cima que prefiere las celdas más altas que
    su entorno (la crestería);
  * cascadas = líneas de máxima pendiente que bajan del collado hacia el noroeste (glaciar
    Chhonbardan, ruta normal) y hacia el sureste (Kali Gandaki);
  * campo base = el punto llano (< 9°) más cercano a 4 660-4 780 m en el glaciar al pie de la cascada.

    python3 herramientas/campos.py
"""
import os
import sys
import heapq
import numpy as np
from scipy import ndimage as ndi
from numba import njit

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import dem                 # noqa: E402
import terreno as TR       # noqa: E402

Z, LONS, LATS = dem.mosaico('glo30', 83.38, 28.62, 83.64, 28.82)
H, W = Z.shape


def rc(lat, lon):
    return int(round((LATS[0] - lat) * 3600)), int(round((lon - LONS[0]) * 3600))


def ll(r, c):
    return float(LATS[r]), float(LONS[c])


def xy(r, c):
    x, y = TR.ll2xy(*ll(r, c))
    return int(round(float(x))), int(round(float(y)))


@njit(cache=True)
def _raiz(p, x):
    while p[x] != x:
        p[x] = p[p[x]]
        x = p[x]
    return x


@njit(cache=True)
def _silla(z, A, B):
    H, W = z.shape
    orden = np.argsort(-z.ravel())
    p = np.arange(H * W)
    act = np.zeros(H * W, np.bool_)
    for k in range(orden.size):
        i = orden[k]
        act[i] = True
        r = i // W; c = i % W
        for dr in range(-1, 2):
            for dc in range(-1, 2):
                rr = r + dr; cc = c + dc
                if 0 <= rr < H and 0 <= cc < W and act[rr * W + cc]:
                    a = _raiz(p, i); b = _raiz(p, rr * W + cc)
                    if a != b:
                        p[a] = b
        if _raiz(p, A) == _raiz(p, B):
            return i
    return -1


def cima_cerca(lat, lon, r=25):
    R, C = rc(lat, lon)
    sub = Z[R - r:R + r + 1, C - r:C + r + 1]
    j, i = np.unravel_index(np.nanargmax(sub), sub.shape)
    return R - r + j, C - r + i


def cresteria(A, B):
    zs = ndi.gaussian_filter(Z, 1.0)
    rel = zs - ndi.gaussian_filter(zs, 8)
    coste = np.exp(-np.clip(rel, -60, 60) / 15.0) + 0.05
    dist = np.full(Z.shape, np.inf); prev = -np.ones(Z.shape, np.int64)
    dist[A] = 0; h = [(0.0, A)]
    while h:
        d, (r, c) = heapq.heappop(h)
        if (r, c) == B:
            break
        if d > dist[r, c]:
            continue
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                rr, cc = r + dr, c + dc
                if (dr or dc) and 0 <= rr < H and 0 <= cc < W:
                    nd = d + coste[rr, cc] * (1.414 if dr and dc else 1)
                    if nd < dist[rr, cc]:
                        dist[rr, cc] = nd; prev[rr, cc] = r * W + c; heapq.heappush(h, (nd, (rr, cc)))
    camino = [B]
    while camino[-1] != A:
        q = prev[camino[-1]]
        camino.append((q // W, q % W))
    return camino[::-1]


def bajada(lat, lon, zmin=4300):
    zs = ndi.gaussian_filter(Z, 4)
    gy, gx = np.gradient(zs)
    r, c = (LATS[0] - lat) * 3600, (lon - LONS[0]) * 3600
    pts = []
    for k in range(3000):
        g = np.array([ndi.map_coordinates(gy, [[r], [c]], order=1)[0], ndi.map_coordinates(gx, [[r], [c]], order=1)[0]])
        n = np.hypot(*g) + 1e-9
        r -= g[0] / n * 0.7; c -= g[1] / n * 0.7
        zz = ndi.map_coordinates(Z, [[r], [c]], order=1)[0]
        if k % 30 == 0:
            pts.append((LATS[0] - r / 3600, LONS[0] + c / 3600, zz))
        if zz < zmin or n < 1e-3:
            break
    return pts


if __name__ == '__main__':
    D1 = cima_cerca(28.6981, 83.4894)
    TK = cima_cerca(28.7450, 83.5575, 20)
    print('Dhaulagiri I', round(float(Z[D1])), ll(*D1), '  Tukuche Peak', round(float(Z[TK])), ll(*TK))
    s = _silla(np.nan_to_num(Z, nan=0.0), D1[0] * W + D1[1], TK[0] * W + TK[1])
    S_ = (s // W, s % W)
    print('collado NE', round(float(Z[S_])), ll(*S_), xy(*S_))
    camino = cresteria(S_, D1)
    idx = list(range(0, len(camino), 12)) + [len(camino) - 1]
    print('ARISTA_NE =', [xy(*camino[k]) for k in idx])
    for z_obj in (6500, 7300):
        k = int(np.argmin([abs(Z[p] - z_obj) for p in camino]))
        print(f'  arista a {z_obj} m:', round(float(Z[camino[k]])), ll(*camino[k]), xy(*camino[k]))
    for nombre, (la, lo) in (('cascada NO', (28.7132, 83.5265)), ('cascada SE', (28.7079, 83.5319))):
        print(nombre, [(round(a, 4), round(b, 4), int(h)) for a, b, h in bajada(la, lo)])
    # campo base
    zs = ndi.gaussian_filter(Z, 1.5)
    gy, gx = np.gradient(zs, 30.87, 30.87 * np.cos(np.radians(28.7)))
    pend = np.degrees(np.arctan(np.hypot(gx, gy)))
    LA, LO = np.meshgrid(LATS, LONS, indexing='ij')
    d = np.hypot((LA - 28.7455) * 111200, (LO - 83.502) * 97600)
    m = (Z > 4650) & (Z < 4780) & (pend < 9) & (d < 1500)
    j, i = np.unravel_index(np.argmin(np.where(m, d, np.inf)), Z.shape)
    print('campo base', round(float(Z[j, i])), ll(j, i), xy(j, i))
