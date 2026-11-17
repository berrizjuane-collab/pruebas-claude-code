"""Geografía para la web: rutas sobre el relieve real, perfil de la Kinshofer,
picos y proyección de todo ello sobre cada lámina (con oclusión).

    python geo.py <engine_dir> <out_dir>
"""
import json
import sys
import time

sys.path.insert(0, sys.argv[1])
OUT = sys.argv[2]

import numpy as np
from scipy.ndimage import gaussian_filter, map_coordinates
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra

import kit
import scenes
from kit import Camera, Scene, dem
from nanga_dem import CELL, LAT0, LON0, KX, KY

t0 = time.time()
D = dem()
H = D.h
print("dem", time.time() - t0)

# ---------------------------------------------------------------- utilidades
def hgt(x, y):
    return D.sample(H, np.atleast_1d(x), np.atleast_1d(y), order=1)


def local_max(x, y, r=0.45):
    """punto más alto en un radio r (km) alrededor de (x, y)"""
    i0, j0 = D.ij(x, y)
    rr = int(r / CELL)
    i0, j0 = int(i0), int(j0)
    sub = H[max(0, i0 - rr):i0 + rr, max(0, j0 - rr):j0 + rr]
    k = np.unravel_index(sub.argmax(), sub.shape)
    i, j = max(0, i0 - rr) + k[0], max(0, j0 - rr) + k[1]
    return float(D.gx[j]), float(D.gy[i]), float(H[i, j])


# grafo a 60 m para caminos de mínimo coste
STEP = 4
Hs = H[::STEP, ::STEP]
ny, nx = Hs.shape
cs = CELL * STEP
gyy, gxx = np.gradient(gaussian_filter(Hs, 1.0), cs)
slope = np.hypot(gxx, gyy)                     # km/km
ridge = Hs - gaussian_filter(Hs, 0.35 / cs)    # > 0 en crestas
valley = -ridge


def graph(costfield):
    idx = np.arange(nx * ny).reshape(ny, nx)
    rows, cols, w = [], [], []
    for di, dj in ((0, 1), (1, 0), (1, 1), (1, -1)):
        a = idx[0:ny - di, max(0, -dj):nx - max(0, dj)]
        b = idx[di:ny, max(0, dj):nx - max(0, -dj)]
        L = np.hypot(di, dj) * cs
        ca = costfield.ravel()[a.ravel()]
        cb = costfield.ravel()[b.ravel()]
        ww = L * 0.5 * (ca + cb)
        rows += [a.ravel(), b.ravel()]
        cols += [b.ravel(), a.ravel()]
        w += [ww, ww]
    rows, cols, w = np.concatenate(rows), np.concatenate(cols), np.concatenate(w)
    return coo_matrix((w, (rows, cols)), shape=(nx * ny, nx * ny)).tocsr()


def node(x, y):
    i, j = D.ij(x, y)
    return int(round(i / STEP)) * nx + int(round(j / STEP))


def path(G, pts):
    out = []
    for (xa, ya), (xb, yb) in zip(pts[:-1], pts[1:]):
        a, b = node(xa, ya), node(xb, yb)
        _, pred = dijkstra(G, indices=a, return_predecessors=True)
        seq = [b]
        while seq[-1] != a and seq[-1] >= 0:
            seq.append(pred[seq[-1]])
        seq = seq[::-1]
        for n in seq:
            i, j = divmod(n, nx)
            out.append((float(D.gx[j * STEP]), float(D.gy[i * STEP])))
    return smooth_line(out)


def smooth_line(pts, k=2):
    p = np.array(pts, float)
    if len(p) < 5:
        return p
    q = p.copy()
    for _ in range(k):
        q[1:-1] = 0.25 * q[:-2] + 0.5 * q[1:-1] + 0.25 * q[2:]
    return q


def resample(p, ds=0.05):
    p = np.asarray(p, float)
    seg = np.hypot(*np.diff(p, axis=0).T)
    s = np.concatenate([[0], np.cumsum(seg)])
    n = max(2, int(s[-1] / ds) + 1)
    t = np.linspace(0, s[-1], n)
    return np.stack([np.interp(t, s, p[:, 0]), np.interp(t, s, p[:, 1])], 1)


def straight(pts, ds=0.05):
    return resample(np.array(pts, float), ds)


# --------------------------------------------------------------- campos de coste
G_ridge = graph(np.exp(-np.clip(ridge, -0.4, 0.4) * 9.0) * np.exp(-(Hs - 7.0) * 1.2))
G_valley = graph(1.0 + (slope / 0.35) ** 2 + 6.0 * np.clip(ridge, 0, None))

# --------------------------------------------------------------- puntos clave
SUM = local_max(-0.02, 0.15, 0.3)
NORTH = local_max(0.24, 1.25, 0.5)
RAKH = local_max(4.35, 2.40, 0.5)
MAZ = local_max(-4.3, -1.5, 0.6)
GAN = local_max(-3.3, 5.7, 0.6)
CHO = local_max(7.6, 9.6, 0.6)
print("summit", SUM, "north", NORTH, "rakhiot", RAKH)

# arista Rakhiot -> cumbre, por los rasgos que el relieve muestra (cotas reales del DEM)
SATTEL = local_max(2.25, 2.45, 0.12)
PLATEAU = (1.2, 2.2, float(hgt(1.2, 2.2)[0]))
VOR = local_max(0.05, 1.55, 0.15)
BAZ = (0.0, 1.0, float(hgt(0.0, 1.0)[0]))
SHOULDER = local_max(0.0, 0.5, 0.12)
RIDGE_WP = [(RAKH[0] - 0.05, RAKH[1] + 0.02), (3.5, 2.55), (3.0, 2.5), SATTEL[:2], PLATEAU[:2], (0.35, 1.75), VOR[:2], BAZ[:2], SHOULDER[:2], (SUM[0], SUM[1])]
ridge_r = resample(smooth_line(straight(RIDGE_WP, 0.03), 4), 0.03)
print("sattel", SATTEL, "plateau", PLATEAU, "vor", VOR, "bazhin", BAZ, "shoulder", SHOULDER)

# ---------------------------------------------------------- ruta Kinshofer (Diamir)
BC_D = (-7.1, 2.2)
C1, C2, C3 = (-3.85, 1.8), (-2.62, 1.8), (-1.95, 1.8)
# C4 hacia 7200 m, en la cuenca alta de la cara Diamir, camino de la cumbre
line = straight([C3, (SUM[0] - 0.25, SUM[1] + 0.55)], 0.01)
hl = hgt(line[:, 0], line[:, 1])
k4 = int(np.argmin(np.abs(hl - 7.20)))
C4 = (float(line[k4, 0]), float(line[k4, 1]))
approach = path(G_valley, [BC_D, (-4.6, 2.05)])
kin = np.concatenate([approach, straight([(-4.6, 2.05), C1, C2, C3, C4, (SUM[0] - 0.30, SUM[1] + 0.30), (SUM[0], SUM[1])], 0.05)])
kin = resample(smooth_line(kin, 3), 0.04)

# ------------------------------------------------- ruta Buhl 1953 (Rakhiot / Silbersattel)
FM = (-0.9, 16.6)
BC_R = (1.2, 9.6)
C4_R = (3.55, 3.55)
buhl_app = path(G_valley, [FM, BC_R, (2.4, 6.2)])
buhl_up = straight([(2.4, 6.2), C4_R, (RAKH[0] - 0.35, RAKH[1] + 0.05)], 0.05)
k_r = 0
buhl_ridge = ridge_r.copy()
buhl = np.concatenate([buhl_app, buhl_up, buhl_ridge])
buhl = resample(smooth_line(buhl, 2), 0.04)

# --------------------------------------------- ruta Messner 1970 (cara Rupal, centro)
# por el centro de la pared, del valle de Rupal (≈3600 m) a la cumbre; cotas del DEM
RUPAL_WP = [(1.7, -4.75), (1.05, -4.1), (0.6, -3.2), (0.2, -2.4), (-0.1, -1.6), (0.0, -1.0), (0.12, -0.4), (SUM[0], SUM[1])]
rupal = resample(smooth_line(straight(RUPAL_WP, 0.04), 6), 0.04)

# --------------------------------------------- arista Mazeno (2012)
W_END = local_max(-11.2, -2.8, 1.2)
maz = path(G_ridge, [(W_END[0], W_END[1]), (MAZ[0], MAZ[1]), (SUM[0], SUM[1])])
maz = resample(maz, 0.05)
print("mazeno west end", W_END, "len", len(maz))


def z3(p):
    return hgt(p[:, 0], p[:, 1])


def dist(p):
    return np.concatenate([[0], np.cumsum(np.hypot(*np.diff(p, axis=0).T))])


# perfil de la Kinshofer (desde el campo base)
kd = dist(kin)
kz = z3(kin)
prof_idx = np.linspace(0, len(kin) - 1, 160).astype(int)
profile = [dict(d=round(float(kd[i]), 3), z=int(round(float(kz[i]) * 1000))) for i in prof_idx]


def near_d(pt):
    k = int(np.argmin(np.hypot(kin[:, 0] - pt[0], kin[:, 1] - pt[1])))
    return round(float(kd[k]), 3)


camps = [
    dict(id="bc", nombre="Campo base", x=BC_D[0], y=BC_D[1]),
    dict(id="c1", nombre="Campo 1", x=C1[0], y=C1[1]),
    dict(id="c2", nombre="Campo 2", x=C2[0], y=C2[1]),
    dict(id="c3", nombre="Campo 3", x=C3[0], y=C3[1]),
    dict(id="c4", nombre="Campo 4", x=C4[0], y=C4[1]),
    dict(id="cumbre", nombre="Cumbre", x=SUM[0], y=SUM[1]),
]
for c in camps:
    c["z"] = int(round(float(hgt(c["x"], c["y"])[0]) * 1000))
    c["d"] = near_d((c["x"], c["y"]))

# --------------------------------------------------------------- picos y lugares
peaks = [
    dict(id="nanga", nombre="Nanga Parbat", alt=8126, x=SUM[0], y=SUM[1], tipo="cumbre"),
    dict(id="hombro", nombre="Hombro", alt=8070, x=SHOULDER[0], y=SHOULDER[1], tipo="rasgo"),
    dict(id="bazhin", nombre="Brecha Bazhin", alt=7810, x=BAZ[0], y=BAZ[1], tipo="collado"),
    dict(id="antecima", nombre="Antecima", alt=7850, x=VOR[0], y=VOR[1], tipo="pico"),
    dict(id="plateau", nombre="Meseta de Plata", alt=7500, x=PLATEAU[0], y=PLATEAU[1], tipo="rasgo"),
    dict(id="sattel", nombre="Silbersattel", alt=7450, x=SATTEL[0], y=SATTEL[1], tipo="collado"),
    dict(id="norte", nombre="Cumbre Norte", alt=7816, x=NORTH[0], y=NORTH[1], tipo="pico"),
    dict(id="rakhiot", nombre="Pico Rakhiot", alt=7070, x=RAKH[0], y=RAKH[1], tipo="pico"),
    dict(id="mazeno", nombre="Pico Mazeno", alt=7120, x=MAZ[0], y=MAZ[1], tipo="pico"),
    dict(id="ganalo", nombre="Pico Ganalo", alt=6606, x=GAN[0], y=GAN[1], tipo="pico"),
    dict(id="chongra", nombre="Chongra", alt=6830, x=CHO[0], y=CHO[1], tipo="pico"),
]
places = [
    dict(id="fairy", nombre="Fairy Meadows", x=FM[0], y=FM[1]),
    dict(id="bc_diamir", nombre="Campo base Diamir", x=BC_D[0], y=BC_D[1]),
    dict(id="bc_rupal", nombre="Campo base Herrligkoffer", x=4.0, y=-4.95),
    dict(id="bc_rakhiot", nombre="Campo base Rakhiot", x=BC_R[0], y=BC_R[1]),
]
for p in places:
    p["z"] = int(round(float(hgt(p["x"], p["y"])[0]) * 1000))

routes = dict(
    kinshofer=dict(nombre="Kinshofer · 1962", cara="Diamir", pts=kin),
    buhl=dict(nombre="Buhl · 1953", cara="Rakhiot", pts=buhl),
    messner=dict(nombre="Messner · 1970", cara="Rupal", pts=rupal),
    mazeno=dict(nombre="Arista Mazeno · 2012", cara="Mazeno", pts=maz),
)

# --------------------------------------------------------------- proyecciones
def grab_cam(name):
    cams = {}
    orig = kit.Scene.__init__

    def grab(self, W_, H_, seed, cam, *a, **k):
        cams["cam"] = cam
        raise StopIteration
    kit.Scene.__init__ = grab
    try:
        scenes.SCENES[name](3600, 2400, 1)
    except StopIteration:
        pass
    finally:
        kit.Scene.__init__ = orig
    c = cams["cam"]
    return Camera(c.x, c.y, c.z, np.degrees(c.az0), np.degrees(c.el0), np.degrees(c.hfov))


PW, PH = 1200, 800


R_EFF = kit.R_EFF


def visibility(cam, x, y, z, margin=0.12, near=0.15, full=False):
    """visible si ningún punto del relieve entre la cámara y el punto lo tapa.
    Con full=True devuelve además, para los tapados por poco (< 1.2° y a menos
    de 3.5 km del objetivo), la posición en pantalla de la cresta que lo tapa."""
    x, y, z = np.atleast_1d(x).astype(float), np.atleast_1d(y).astype(float), np.atleast_1d(z).astype(float)
    u, v, rho = cam.project(x, y, z)
    vis = np.zeros(len(x), bool)
    alt_uv = [None] * len(x)
    for k in range(len(x)):
        if not (-0.02 * PW <= u[k] <= 1.02 * PW and -0.02 * PH <= v[k] <= 1.02 * PH):
            continue
        r = rho[k]
        ep = np.arctan2(z[k] - cam.z - r * r / (2 * R_EFF), r)
        n = max(60, int(r / 0.015))
        t = np.linspace(0.0, 1.0, n)[1:]
        d = t * r
        keep = (d < r - margin) & (d > near)
        if not keep.any():
            vis[k] = True
            continue
        sx = cam.x + (x[k] - cam.x) * t[keep]
        sy = cam.y + (y[k] - cam.y) * t[keep]
        hs = hgt(sx, sy)
        es = np.arctan2(hs - cam.z - d[keep] ** 2 / (2 * R_EFF), d[keep])
        j = int(np.argmax(es))
        vis[k] = bool(es[j] <= ep + np.radians(0.02))
        if full and not vis[k] and es[j] - ep < np.radians(1.2) and r - d[keep][j] < 3.5:
            uu, vv, _ = cam.project(np.array([sx[j]]), np.array([sy[j]]), np.array([hs[j] + 0.004]))
            alt_uv[k] = (float(uu[0]) / PW, float(vv[0]) / PH)
    if full:
        return u / PW, v / PH, vis, alt_uv
    return u / PW, v / PH, vis


proj = {}
for name in scenes.ORDER:
    cam = grab_cam(name)
    cam.fit(PW, PH)
    entry = dict(peaks=[], places=[], camps=[], routes={})
    for p in peaks:
        z = float(hgt(p["x"], p["y"])[0]) + 0.004
        u, v, vis, alt = visibility(cam, p["x"], p["y"], z, full=True)
        e = dict(id=p["id"], u=round(float(u[0]), 4), v=round(float(v[0]), 4), vis=bool(vis[0]))
        if alt[0] is not None:
            e.update(u=round(alt[0][0], 4), v=round(alt[0][1], 4), vis=True, tras=True)
        entry["peaks"].append(e)
    for p in camps:
        z = float(hgt(p["x"], p["y"])[0]) + 0.004
        u, v, vis = visibility(cam, p["x"], p["y"], z)
        entry["camps"].append(dict(id=p["id"], u=round(float(u[0]), 4), v=round(float(v[0]), 4), vis=bool(vis[0])))
    for rid, r in routes.items():
        P = resample(r["pts"], 0.03)
        z = hgt(P[:, 0], P[:, 1]) + 0.004
        u, v, vis = visibility(cam, P[:, 0], P[:, 1], z)
        entry["routes"][rid] = [[round(float(a), 4), round(float(b), 4), int(c)] for a, b, c in zip(u, v, vis)]
    proj[name] = entry
    vis_names = [p["id"] for p, e in zip(peaks, entry["peaks"]) if e["vis"] and 0 <= e["u"] <= 1 and 0 <= e["v"] <= 1]
    print(name, "visibles:", vis_names, " ruta kin vis:", sum(1 for q in entry["routes"]["kinshofer"] if q[2]), "/", len(entry["routes"]["kinshofer"]))


# --------------------------------------------------------------- salida
def r3(p):
    return [[round(float(a), 3), round(float(b), 3)] for a, b in p]


data = dict(
    bounds=dict(x0=D.x0, x1=D.x1, y0=D.y0, y1=D.y1, lat0=LAT0, lon0=LON0, kx=KX, ky=KY),
    peaks=[{**p, "x": round(p["x"], 3), "y": round(p["y"], 3)} for p in peaks],
    places=places,
    camps=camps,
    routes={k: dict(nombre=v["nombre"], cara=v["cara"], pts=r3(resample(v["pts"], 0.08))) for k, v in routes.items()},
    profile=profile,
    proj=proj,
)
with open(OUT + "/geo.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
print("camps", [(c["id"], c["z"], c["d"]) for c in camps])
print("listo", time.time() - t0)
