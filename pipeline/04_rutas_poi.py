"""Paso 4 · Rutas, puntos de interés, serac y fixtures de test.

Lee pipeline/curated/k2_curado.json y resuelve sobre el DEM corregido:
  - tramos "cresta": camino de mínimo coste que favorece crestas (curvatura convexa);
  - tramos "glaciar": camino de mínimo coste que favorece pendientes suaves;
  - tramos "directo": polilínea entre puntos de control, densificada y apoyada en el DEM.
Los POI con método "ruta-altitud" se colocan en el primer punto de la ruta que alcanza
la altitud documentada. Nada de esto es un GPX: son trazados reconstruidos.

Salidas: public/data/routes.json, pois.json, serac.json; tests/fixtures/*.json
"""
from __future__ import annotations

import heapq
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parent))
from k2 import config as C  # noqa: E402
from k2.geo import bilinear, local_to_lonlat, lonlat_to_local, read_json, write_json  # noqa: E402

G = C.ANALYSIS
H = np.load(C.CACHE / "analysis_heights.npy").astype(np.float64)


def hessian_crest(h: np.ndarray, spacing: float) -> np.ndarray:
    z = ndi.gaussian_filter(h, 1.4)
    zy, zx = np.gradient(z, spacing)
    zyy, zyx = np.gradient(zy, spacing)
    zxy, zxx = np.gradient(zx, spacing)
    tr = zxx + zyy
    det = zxx * zyy - zxy * zyx
    lmin = tr / 2 - np.sqrt(np.maximum((tr / 2) ** 2 - det, 0))
    return -lmin


CREST = hessian_crest(H, G.spacing)
GY, GX = np.gradient(H, G.spacing)
SLOPE = np.degrees(np.arctan(np.hypot(GX, GY)))


def to_ij(x: float, y: float):
    return int(round((G.half - y) / G.spacing)), int(round((x + G.half) / G.spacing))


def to_xy(i: int, j: int):
    return -G.half + j * G.spacing, G.half - i * G.spacing


def least_cost(p0, p1, method: str, margin=300.0):
    i0, j0 = to_ij(*p0)
    i1, j1 = to_ij(*p1)
    m = int(margin / G.spacing)
    r0, r1 = max(min(i0, i1) - m, 0), min(max(i0, i1) + m, G.n - 1)
    c0, c1 = max(min(j0, j1) - m, 0), min(max(j0, j1) + m, G.n - 1)
    sub_slope = SLOPE[r0:r1 + 1, c0:c1 + 1]
    if method == "cresta":
        c = np.clip(CREST[r0:r1 + 1, c0:c1 + 1] / 0.008, 0, 1)
        cost = 1 + 10 * (1 - c) ** 2 + np.where(sub_slope > 62, 12, 0)
    else:  # glaciar
        cost = 1 + 30 * (sub_slope / 45.0) ** 2
    h, w = cost.shape
    start = (i0 - r0, j0 - c0)
    goal = (i1 - r0, j1 - c0)
    dist = np.full((h, w), np.inf)
    prev = -np.ones((h, w, 2), dtype=np.int32)
    dist[start] = 0
    pq = [(0.0, start)]
    nbrs = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    while pq:
        d, (i, j) = heapq.heappop(pq)
        if (i, j) == goal:
            break
        if d > dist[i, j]:
            continue
        for di, dj in nbrs:
            ii, jj = i + di, j + dj
            if 0 <= ii < h and 0 <= jj < w:
                step = 1.41421356 if di and dj else 1.0
                nd = d + step * 0.5 * (cost[i, j] + cost[ii, jj])
                if nd < dist[ii, jj]:
                    dist[ii, jj] = nd
                    prev[ii, jj] = (i, j)
                    heapq.heappush(pq, (nd, (ii, jj)))
    path = []
    cur = goal
    while cur != (-1, -1) and cur != start:
        path.append(cur)
        cur = tuple(prev[cur])
    path.append(start)
    path.reverse()
    pts = [to_xy(i + r0, j + c0) for i, j in path]
    pts[0] = tuple(p0)
    pts[-1] = tuple(p1)
    return pts


def resample(points, step=12.5):
    pts = np.asarray(points, dtype=np.float64)
    seg = np.hypot(*np.diff(pts, axis=0).T)
    s = np.concatenate([[0], np.cumsum(seg)])
    n = max(int(np.ceil(s[-1] / step)), 1)
    t = np.linspace(0, s[-1], n + 1)
    return np.stack([np.interp(t, s, pts[:, 0]), np.interp(t, s, pts[:, 1])], -1)


def smooth(pts, iters=2):
    p = pts.copy()
    for _ in range(iters):
        q = p.copy()
        q[1:-1] = 0.25 * p[:-2] + 0.5 * p[1:-1] + 0.25 * p[2:]
        p = q
    return p


def build_segment(seg: dict):
    ctrl = [tuple(map(float, c)) for c in seg["control"]]
    if seg["metodo"] == "directo":
        raw = ctrl
    else:
        raw = []
        for a, b in zip(ctrl[:-1], ctrl[1:]):
            part = least_cost(a, b, seg["metodo"])
            raw.extend(part if not raw else part[1:])
    pts = resample(raw, 12.5)
    if seg["metodo"] != "directo":
        pts = smooth(pts, 6)
    pts = resample(pts, 12.5)
    alt = bilinear(H, G, pts[:, 0], pts[:, 1])
    return np.column_stack([pts, alt])


def route_polyline(route: dict, segs: dict):
    out = []
    for sid in route["tramos"]:
        p = segs[sid]
        out.append(p if not out else p[1:])
    return np.vstack(out)


def point_at_altitude(poly: np.ndarray, target: float):
    for k in range(1, len(poly)):
        a, b = poly[k - 1], poly[k]
        if a[2] < target <= b[2]:
            t = (target - a[2]) / (b[2] - a[2])
            return a + t * (b - a), k
    raise ValueError(f"la ruta no alcanza {target} m")


def serac_geometry(common: np.ndarray, base_alt: float = 8360.0):
    """Línea base del serac: la curva de nivel de `base_alt` por encima de la travesía.

    Para cada x entre los extremos de la travesía (ampliados) se busca hacia el norte
    (pendiente arriba en esta ladera SE) la altitud `base_alt` por bisección. Así la
    barrera queda paralela a la travesía y 50–80 m por encima, como describen las fuentes.
    """
    trav = [p for p in common if 8250 <= p[2] <= 8320]
    xs_t = np.array([p[0] for p in trav])
    # la travesía avanza hacia el oeste bajo la barrera hasta poder superarla: el serac
    # termina poco antes del extremo oeste de la travesía y se prolonga al este del Bottleneck
    x0, x1 = float(xs_t.min()) + 18.0, float(xs_t.max()) + 70.0
    pts = []
    for x in np.arange(x0, x1 + 1e-6, 12.0):
        lo, hi = -560.0, -180.0
        if not (bilinear(H, G, x, lo) < base_alt < bilinear(H, G, x, hi)):
            continue
        for _ in range(40):
            mid = 0.5 * (lo + hi)
            if bilinear(H, G, x, mid) < base_alt:
                lo = mid
            else:
                hi = mid
        pts.append((x, 0.5 * (lo + hi)))
    pts = resample(smooth(np.asarray(pts), 2), 15.0)
    gx = bilinear(GX, G, pts[:, 0], pts[:, 1])
    gy = -bilinear(GY, G, pts[:, 0], pts[:, 1])  # GY es d/dfila (hacia el sur)
    g = np.stack([gx, gy], -1)
    g /= np.linalg.norm(g, axis=1, keepdims=True)
    alt = bilinear(H, G, pts[:, 0], pts[:, 1])
    upslope = smooth(g, 4)
    upslope /= np.linalg.norm(upslope, axis=1, keepdims=True)
    return {
        "linea": [[round(float(x), 1), round(float(y), 1), round(float(a), 1)] for (x, y), a in zip(pts, alt)],
        "pendienteArriba": [[round(float(u), 4), round(float(v), 4)] for u, v in upslope],
        "alturaFrente": {"min": 35.0, "max": 70.0},
        "fondo": 140.0,
        "vuelo": 7.0,
        "semilla": 2008,
        "altitudBase": base_alt,
        "nota": "Malla esquemática y determinista: frente de hielo de 35–70 m sobre el DEM, con ligero desplome, "
                "a lo largo de la curva de 8 360 m por encima de la travesía. El DEM de 25 m no resuelve el serac; "
                "su geometría real cambia cada temporada.",
    }


def main() -> None:
    cur = read_json(C.CURATED / "k2_curado.json")
    manifest = read_json(C.PUBLIC_DATA / "manifest.json")
    segs = {sid: build_segment(s) for sid, s in cur["tramos"].items()}
    routes = {rid: route_polyline(r, segs) for rid, r in cur["rutas"].items()}

    # --- Validación de los trazados -----------------------------------------
    report = {}
    for sid, p in segs.items():
        d = np.hypot(*np.diff(p[:, :2], axis=0).T)
        grade = np.degrees(np.arctan2(np.abs(np.diff(p[:, 2])), np.maximum(d, 1e-6)))
        inside = np.all(np.abs(p[:, :2]) < C.CORE.half)
        report[sid] = {"longitud_m": round(float(d.sum())), "altMin": round(float(p[:, 2].min())),
                       "altMax": round(float(p[:, 2].max())), "inclinacionMax": round(float(grade.max()), 1),
                       "dentroDelNucleo": bool(inside)}
        assert inside, sid
    print("tramos:", report)

    # --- POI --------------------------------------------------------------------
    refs_ids = {r["id"] for r in cur["referencias"]}
    serac = serac_geometry(segs["comun-hombro-cumbre"])
    pois = []
    for p in cur["poi"]:
        assert all(r in refs_ids for r in p["refs"]), p["id"]
        col = p["colocacion"]
        m = col["metodo"]
        if m == "local":
            x, y = col["x"], col["y"]
            alt = float(bilinear(H, G, x, y))
        elif m == "ruta-altitud":
            pt, _ = point_at_altitude(routes[col["ruta"]], col["altitud"])
            x, y, alt = map(float, pt)
        elif m == "ruta-punto":
            poly = routes[col["ruta"]]
            k = int(np.argmin(np.hypot(poly[:, 0] - col["x"], poly[:, 1] - col["y"])))
            x, y, alt = map(float, poly[k])
        elif m == "cumbre-modelo":
            x, y = manifest["cumbre"]["modelo"]["x"], manifest["cumbre"]["modelo"]["y"]
            alt = float(bilinear(H, G, x, y))
        elif m == "serac":
            line = np.asarray(serac["linea"])
            k = len(line) // 2
            x, y = float(line[k, 0]), float(line[k, 1])
            alt = float(line[k, 2]) + 0.5 * (serac["alturaFrente"]["min"] + serac["alturaFrente"]["max"])
        elif m == "maximo-local":
            ctx = np.load(C.CACHE / "context_heights.npy")
            CG = C.CONTEXT
            X, Y = np.meshgrid(CG.xs(), CG.ys())
            msk = np.hypot(X - col["x"], Y - col["y"]) < col["radio"]
            idx = np.unravel_index(np.argmax(np.where(msk, ctx, -1)), ctx.shape)
            x, y, alt = float(CG.xs()[idx[1]]), float(CG.ys()[idx[0]]), float(ctx[idx])
        else:
            raise ValueError(m)
        lon, lat = local_to_lonlat(x, y)
        entry = {k: v for k, v in p.items() if k not in ("colocacion",)}
        entry["posicion"] = {"x": round(x, 1), "y": round(y, 1), "altModelo": round(alt, 1)}
        entry["geo"] = {"lat": round(lat, 5), "lon": round(lon, 5)}
        entry["metodoColocacion"] = m
        if "altitudRef" in p and "valor" in p["altitudRef"] and m in ("ruta-altitud", "ruta-punto", "local", "cumbre-modelo"):
            entry["diferenciaModeloRef"] = round(alt - p["altitudRef"]["valor"], 1)
        pois.append(entry)
        print(f"  {p['id']:22s} ({x:8.1f},{y:8.1f}) alt modelo {alt:7.1f}  ref {p.get('altitudRef', {}).get('valor', '-')}")

    # el C4 y el Hombro deben estar en el tramo común
    def seg_dist(pt, seg):
        return float(np.min(np.hypot(seg[:, 0] - pt[0], seg[:, 1] - pt[1])))

    c4 = next(p for p in pois if p["id"] == "c4")["posicion"]
    assert seg_dist((c4["x"], c4["y"]), segs["comun-hombro-cumbre"]) < 13, "C4 fuera del tramo común"

    out_routes = {
        "nota": "Trazados reconstruidos sobre el DEM (no son GPX). Coordenadas locales [x, y, altitud modelo].",
        "tramos": {
            sid: {**{k: v for k, v in cur["tramos"][sid].items() if k != "control"},
                  "control": cur["tramos"][sid]["control"],
                  "puntos": [[round(float(a), 1), round(float(b), 1), round(float(c), 1)] for a, b, c in segs[sid]],
                  "validacion": report[sid]}
            for sid in segs
        },
        "rutas": cur["rutas"],
    }
    write_json(C.PUBLIC_DATA / "routes.json", out_routes)
    write_json(C.PUBLIC_DATA / "pois.json", {"referencias": cur["referencias"], "poi": pois})
    write_json(C.PUBLIC_DATA / "serac.json", serac)

    # --- Fixtures para los tests de la app --------------------------------------
    rng = np.random.default_rng(7)
    samples = []
    for lon, lat in [(C.ORIGIN_LON, C.ORIGIN_LAT), (76.5125, 35.88083), (76.40, 35.80), (76.62, 35.97),
                     (76.15, 35.60), (76.90, 36.15)] + [(76.5133 + rng.uniform(-0.2, 0.2), 35.8825 + rng.uniform(-0.15, 0.15)) for _ in range(6)]:
        x, y = lonlat_to_local(lon, lat)
        samples.append({"lon": lon, "lat": lat, "x": x, "y": y})
    write_json(C.FIXTURES / "projection.json", {"crs": C.LOCAL_CRS, "muestras": samples})
    core = np.load(C.CACHE / "core_heights.npy").astype(np.float64)
    q = np.round((core - C.HEIGHT_OFFSET) / C.HEIGHT_SCALE) * C.HEIGHT_SCALE + C.HEIGHT_OFFSET  # tal como queda en el PNG
    hs = []
    for _ in range(12):
        x, y = rng.uniform(-7100, 7100), rng.uniform(-7100, 7100)
        hs.append({"x": x, "y": y, "h": float(bilinear(q, C.CORE, x, y))})
    hs.append({"x": manifest["cumbre"]["modelo"]["x"], "y": manifest["cumbre"]["modelo"]["y"],
               "h": float(bilinear(q, C.CORE, manifest["cumbre"]["modelo"]["x"], manifest["cumbre"]["modelo"]["y"]))})
    write_json(C.FIXTURES / "heights.json", {"rejilla": "core", "muestras": hs})

    manifest["rutas"] = {"archivo": "routes.json", "validacion": report}
    manifest["poi"] = {"archivo": "pois.json", "total": len(pois)}
    manifest["serac"] = {"archivo": "serac.json"}
    write_json(C.PUBLIC_DATA / "manifest.json", manifest)


if __name__ == "__main__":
    main()
