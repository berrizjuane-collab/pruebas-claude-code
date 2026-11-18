"""
dem_build.py — construye el modelo digital de elevación (DEM) del macizo del Manaslu.

Fuente: muestras reales ASTER GDEM v3 (30 m) obtenidas de la API pública de
OpenTopoData (api.opentopodata.org/v1/aster30m) en tres mallas:
    data/coreA.txt   núcleo   lat 28.50575–28.625  lon 84.50–84.68   (filas cada ~250 m, 100 muestras ≈ 180 m)
    data/southB.txt  sur      lat 28.42–28.501      lon 84.48–84.74   (filas cada ~500 m)  → Ngadi Chuli, Himalchuli
    data/outerC.txt  anillo   lat 28.40–28.90       lon 84.25–84.95   (filas cada ~2.2 km) → picos lejanos
Cada línea: "<lat> v0 v1 … v99" (elevaciones en m, equiespaciadas en longitud).

Pasos:
 1. Interpolación bicúbica de cada malla a una rejilla métrica local de 30 m
    (origen = cumbre, x hacia el este, y hacia el norte).
 2. Mezcla con bordes difuminados: núcleo > sur > anillo.
 3. Detalle fractal "ridged" SOLO en las bandas de frecuencia que la malla no
    resuelve (contrafuertes, canales a lo largo de la línea de máxima pendiente).
 4. Corrección de cumbres conocidas (ASTER subestima pináculos estrechos):
    Manaslu 8163, Manaslu Norte 7157, Ngadi Chuli 7871, Himalchuli 7893.

Si tienes un DEM real completo (p.ej. Copernicus GLO-30 N28E084), usa
`python3 dem_build.py --tif archivo.tif --bounds 84 28 85 29` y se usará en su lugar.

Uso:  python3 dem_build.py [salida.npz]
"""
import sys, os, argparse
import numpy as np
from scipy import ndimage as nd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")

LAT0, LON0 = 28.553, 84.556            # origen local ≈ cumbre según ASTER
MLAT = 110828.0                        # m por grado de latitud a 28.5°
MLON = 97854.0                         # m por grado de longitud a 28.5°
DX = 30.0                              # paso de la rejilla (m)
LAT_MIN, LAT_MAX, LON_MIN, LON_MAX = 28.40, 28.90, 84.25, 84.95

PEAKS = {  # nombre: (lat, lon, altura real, radio de búsqueda m, sigma m)
    "Manaslu":       (28.5530, 84.5564, 8163, 450, 260),
    "Manaslu Norte": (28.5835, 84.5490, 7157, 500, 300),
    "Ngadi Chuli":   (28.5033, 84.5675, 7871, 700, 420),
    "Himalchuli":    (28.4380, 84.6376, 7893, 600, 380),
}


def ll2xy(lat, lon):
    return (np.asarray(lon) - LON0) * MLON, (np.asarray(lat) - LAT0) * MLAT


def xy2ll(x, y):
    return LAT0 + np.asarray(y) / MLAT, LON0 + np.asarray(x) / MLON


def load_rows(path, lon_a, lon_b):
    rows = [l.split() for l in open(path) if l.strip()]
    rows.sort(key=lambda r: float(r[0]))          # latitud ascendente
    lat = np.array([float(r[0]) for r in rows])
    Z = np.array([[float(v) for v in r[1:]] for r in rows], np.float64)
    lon = np.linspace(lon_a, lon_b, Z.shape[1])
    return lat, lon, Z


def grid_axes():
    x0, _ = ll2xy(LAT0, LON_MIN); x1, _ = ll2xy(LAT0, LON_MAX)
    _, y0 = ll2xy(LAT_MIN, LON0); _, y1 = ll2xy(LAT_MAX, LON0)
    xs = np.arange(x0, x1, DX); ys = np.arange(y0, y1, DX)
    return xs, ys


def resample(lat, lon, Z, LAT, LON):
    """bicúbica de una malla regular (lat asc, lon asc) a puntos arbitrarios"""
    fi = (LAT - lat[0]) / (lat[-1] - lat[0]) * (len(lat) - 1)
    fj = (LON - lon[0]) / (lon[-1] - lon[0]) * (len(lon) - 1)
    # filas no exactamente equiespaciadas: corregir con interpolación del índice
    fi = np.interp(LAT, lat, np.arange(len(lat)))
    return nd.map_coordinates(Z, [fi, fj], order=3, mode="nearest").astype(np.float32)


def feather(LAT, LON, lat, lon, m=400.0):
    """peso 1 dentro de la malla, rampa de m metros en el borde"""
    d = np.minimum.reduce([(LAT - lat[0]) * MLAT, (lat[-1] - LAT) * MLAT,
                           (LON - lon[0]) * MLON, (lon[-1] - LON) * MLON])
    t = np.clip(d / m, 0, 1)
    return (t * t * (3 - 2 * t)).astype(np.float32)


def lattice_noise(shape_world, xs, ys, lam, rng, X=None, Y=None):
    """ruido de valor en coordenadas de mundo (m), longitud de onda lam"""
    W = xs[-1] - xs[0]; H = ys[-1] - ys[0]
    gw, gh = int(W / lam) + 4, int(H / lam) + 4
    g = rng.random((gh, gw)).astype(np.float32)
    if X is None:
        fx = (np.arange(len(xs)) * DX) / lam + 1
        fy = (np.arange(len(ys)) * DX) / lam + 1
        return nd.map_coordinates(g, np.meshgrid(fy, fx, indexing="ij"), order=3, mode="wrap")
    return nd.map_coordinates(g, [(Y - ys[0]) / lam + 1, (X - xs[0]) / lam + 1], order=3, mode="wrap")


def ridged(n):
    return 1 - np.abs(2 * np.clip(n, 0, 1) - 1)


def add_detail(Z, spacing, xs, ys, seed=7):
    rng = np.random.default_rng(seed)
    H, W = Z.shape
    Zs = nd.gaussian_filter(Z, 300 / DX)
    gy, gx = np.gradient(Zs, DX)
    slope = np.hypot(gx, gy)
    ang = np.arctan2(gy, gx)                       # dirección de máxima pendiente
    rug = np.clip((slope - 0.12) / 0.55, 0, 1) ** 0.8 * 0.85 + 0.15
    # malla de coordenadas (m)
    YY, XX = np.meshgrid(np.arange(H) * DX, np.arange(W) * DX, indexing="ij")
    # deformación de dominio
    wx = (lattice_noise(None, xs, ys, 2200, rng) - 0.5) * 900
    wy = (lattice_noise(None, xs, ys, 2200, rng) - 0.5) * 900
    out = Z.copy()
    for lam in (1800, 900, 450, 220, 110, 60):
        gate = np.clip((spacing / lam - 0.6) / 0.8, 0, 1)   # sólo bandas no resueltas
        if gate.max() <= 0:
            continue
        g = rng.random((int(H * DX / lam) + 6, int(W * DX / lam) + 6)).astype(np.float32)
        # anisotropía: estirar a lo largo de la pendiente (canales que bajan)
        ca, sa = np.cos(ang), np.sin(ang)
        Xw, Yw = XX + wx * (lam / 900) ** 0.5, YY + wy * (lam / 900) ** 0.5
        # muestreo con desplazamiento a lo largo de la pendiente (LIC corto)
        acc = np.zeros_like(Z)
        ks = range(-4, 5)
        for k in ks:
            px = Xw + ca * k * lam * 0.8
            py = Yw + sa * k * lam * 0.8
            acc += nd.map_coordinates(g, [py / lam + 2, px / lam + 2], order=3, mode="wrap")
        n = acc / len(ks)
        n = (n - n.mean()) / (n.std() + 1e-6) * 0.18 + 0.5
        r = ridged(n) ** 1.6
        r = r - r.mean()
        amp = 0.16 * lam * rug * min(1.0, (lam / 900.0) ** 0.35)
        out += (r * amp * gate).astype(np.float32)
        print(f"  detalle λ={lam} m  amp≈{0.16*lam:.0f} m", flush=True)
    return out


def peak_fix(Z, xs, ys):
    for name, (la, lo, htrue, srch, sig) in PEAKS.items():
        x, y = ll2xy(la, lo)
        j = int((x - xs[0]) / DX); i = int((y - ys[0]) / DX); r = int(srch / DX)
        sub = Z[max(i - r, 0):i + r, max(j - r, 0):j + r]
        if sub.size == 0:
            continue
        ii, jj = np.unravel_index(np.argmax(sub), sub.shape)
        ii += max(i - r, 0); jj += max(j - r, 0)
        dh = htrue - Z[ii, jj]
        if dh <= 0:
            continue
        R = int(4 * sig / DX)
        y0, y1, x0, x1 = max(ii - R, 0), ii + R, max(jj - R, 0), jj + R
        yy, xx = np.mgrid[y0:y1, x0:x1]
        d = np.hypot(yy - ii, xx - jj) * DX
        bump = dh * np.exp(-(d / sig) ** 1.35)
        Z[y0:y1, x0:x1] += bump.astype(np.float32)
        lat, lon = xy2ll(xs[jj], ys[ii])
        print(f"  {name}: ASTER {htrue-dh:.0f} m → {htrue} m  en ({lat:.4f}, {lon:.4f})")
    return Z


def build(out_path):
    xs, ys = grid_axes()
    YY, XX = np.meshgrid(ys, xs, indexing="ij")
    LAT, LON = xy2ll(XX, YY)
    print("rejilla", XX.shape, f"{len(xs)*DX/1000:.1f} x {len(ys)*DX/1000:.1f} km")
    srcs = [("outerC.txt", 84.25, 84.95, 2200.0),
            ("southB.txt", 84.48, 84.74, 480.0),
            ("coreA.txt", 84.50, 84.68, 230.0)]
    Z = None; spacing = None
    for fn, la, lb, sp in srcs:
        lat, lon, G = load_rows(os.path.join(DATA, fn), la, lb)
        Zi = resample(lat, lon, G, LAT, LON)
        w = feather(LAT, LON, lat, lon, 500 if sp < 1000 else 1)
        if Z is None:
            Z, spacing = Zi, np.full_like(Zi, sp)
        else:
            Z = Z + (Zi - Z) * w
            spacing = spacing + (sp - spacing) * w
        print(f"  {fn}: {G.shape}  rango {G.min():.0f}–{G.max():.0f} m")
    # bordes sin datos (sur de 28.40): caída suave
    Z = nd.gaussian_filter(Z, 0.6).astype(np.float32)
    Z = add_detail(Z, spacing, xs, ys)
    Z = peak_fix(Z, xs, ys)
    np.savez_compressed(out_path, Z=Z.astype(np.float32), x0=xs[0], y0=ys[0], dx=DX,
                        lat0=LAT0, lon0=LON0, mlat=MLAT, mlon=MLON)
    print("guardado", out_path, Z.shape, f"{Z.min():.0f}–{Z.max():.0f} m")


def from_tif(path, bounds, out_path):
    """DEM real (GeoTIFF float, EPSG:4326) → misma rejilla local"""
    try:
        import tifffile
        A = tifffile.imread(path).astype(np.float32)
    except ImportError:
        from PIL import Image
        A = np.array(Image.open(path), np.float32)
    lon_a, lat_a, lon_b, lat_b = bounds
    lat = np.linspace(lat_b, lat_a, A.shape[0])[::-1]; A = A[::-1]
    lon = np.linspace(lon_a, lon_b, A.shape[1])
    xs, ys = grid_axes()
    YY, XX = np.meshgrid(ys, xs, indexing="ij")
    LAT, LON = xy2ll(XX, YY)
    Z = resample(lat, lon, A, LAT, LON)
    np.savez_compressed(out_path, Z=Z, x0=xs[0], y0=ys[0], dx=DX, lat0=LAT0, lon0=LON0,
                        mlat=MLAT, mlon=MLON)
    print("guardado (DEM real)", out_path, Z.shape)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("out", nargs="?", default=os.path.join(HERE, "manaslu_dem.npz"))
    ap.add_argument("--tif"); ap.add_argument("--bounds", nargs=4, type=float)
    a = ap.parse_args()
    if a.tif:
        from_tif(a.tif, a.bounds, a.out)
    else:
        build(a.out)
