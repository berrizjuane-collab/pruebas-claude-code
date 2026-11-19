"""Camino de mínimo coste sobre el DEM entre los campos de la ruta normal, proyectado en la lámina «La ruta»."""
import sys, json, math, numpy as np
sys.path.insert(0, '.')
import ruta
from terrain import Terrain, Camera, raster
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra
terr = Terrain(ruta.DEM)
Z = terr.near[::2, ::2].astype(np.float64); res = terr.nres * 2
H, W = Z.shape
idx = np.arange(H * W).reshape(H, W)
rows, cols, wts = [], [], []
for dy in (-1, 0, 1):
    for dx in (-1, 0, 1):
        if dx == 0 and dy == 0: continue
        ys = slice(max(0, -dy), H - max(0, dy)); xs = slice(max(0, -dx), W - max(0, dx))
        ys2 = slice(max(0, dy), H - max(0, -dy) if max(0, -dy) else H); xs2 = slice(max(0, dx), W - max(0, -dx) if max(0, -dx) else W)
        a = idx[ys, xs].ravel(); b = idx[ys2, xs2].ravel()
        d = res * math.hypot(dx, dy)
        dz = (Z[ys2, xs2] - Z[ys, xs]).ravel()
        s = np.abs(dz) / d
        c = d * (1 + 9 * s ** 2) + np.maximum(dz, 0) * 0.6
        rows.append(a); cols.append(b); wts.append(c)
G = csr_matrix((np.concatenate(wts), (np.concatenate(rows), np.concatenate(cols))), shape=(H * W, H * W))
def node(lat, lon):
    x, y = terr.ll2xy(lat, lon)
    return int(round((y - terr.ny0) / res)) * W + int(round((x - terr.nx0) / res))
order = ['campo_base', 'cba', 'campo_1', 'campo_2', 'campo_3', 'campo_4', 'cumbre']
P = ruta.POINTS
WI, HI = 800, 450
cam = Camera(ruta.CAM['x'], ruta.CAM['y'], ruta.CAM['z'], ruta.CAM['yaw'], ruta.CAM['hfov'], WI, HI, ruta.CAM['horizon'])
terr.set_cloud(level=3900, amp=320, lam=3000, seed=21, clear=[])
R = raster(terr, cam, log=lambda *a: None)
segs = []
for a, b in zip(order[:-1], order[1:]):
    na, nb = node(*P[a][:2]), node(*P[b][:2])
    dist, pred = dijkstra(G, indices=na, return_predecessors=True)
    path = [nb]
    while path[-1] != na:
        path.append(pred[path[-1]])
    path = path[::-1]
    pts = []
    for n in path[::2] + [path[-1]]:
        yy, xx = divmod(n, W)
        x = terr.nx0 + xx * res; y = terr.ny0 + yy * res; z = Z[yy, xx]
        c, r, d = cam.project(np.array([x]), np.array([y]), np.array([z + 10]))
        c, r, d = float(c[0]), float(r[0]), float(d[0])
        ci, ri = int(c), int(r)
        vis = False
        if 0 <= ci < WI and 0 <= ri < HI:
            win = R['dist'][max(0, ri - 1):ri + 2, max(0, ci - 1):ci + 2]
            vis = bool(np.nanmax(win) > d * 0.985)
        pts.append([round(c / WI, 4), round(r / HI, 4), int(vis), int(z)])
    L = sum(math.hypot(*(np.subtract(divmod(p2, W), divmod(p1, W)))) * res for p1, p2 in zip(path[:-1], path[1:]))
    segs.append(dict(desde=a, hasta=b, km=round(L / 1000, 2), pts=pts))
    print(a, '→', b, f'{L/1000:.1f} km', len(pts), 'pts', 'visibles', sum(p[2] for p in pts), flush=True)
json.dump(segs, open('../ruta_path.json', 'w'))
