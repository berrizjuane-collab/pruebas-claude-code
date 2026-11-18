"""
terrain.py — render en perspectiva del DEM real del Manaslu (sustituye a §2.3 del README).

En lugar de una arista inventada, la montaña es el DEM (dem_build.py) visto desde
la posición real de cada campo. Algoritmo de "horizonte flotante" columna a columna:
para cada columna de la imagen se avanza a lo largo del rayo horizontal, se proyecta
la altura del terreno a una fila de pantalla y el mínimo acumulado decide qué se ve.

Devuelve, por píxel, la distancia y el punto del mundo visto; con eso se sombrea
(luz lambertiana + sombras arrojadas + oclusión ambiental), se decide nieve/roca y
se aplica perspectiva aérea por distancia.
"""
import numpy as np
from scipy import ndimage as nd

R_EARTH = 6371000.0
K_REFR = 0.13


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    return a + (b - a) * t


class DEM:
    def __init__(self, path):
        d = np.load(path)
        self.Z = d["Z"].astype(np.float32)
        self.x0, self.y0, self.dx = float(d["x0"]), float(d["y0"]), float(d["dx"])
        self.lat0, self.lon0 = float(d["lat0"]), float(d["lon0"])
        self.mlat, self.mlon = float(d["mlat"]), float(d["mlon"])
        self.H, self.W = self.Z.shape
        gy, gx = np.gradient(self.Z, self.dx)
        self.gx, self.gy = gx.astype(np.float32), gy.astype(np.float32)
        gys, gxs = np.gradient(nd.gaussian_filter(self.Z, 1.2), self.dx)
        self.slope = np.degrees(np.arctan(np.hypot(gxs, gys))).astype(np.float32)
        self.cloud = None          # altura del techo del mar de nubes (o None)
        self.cloud_cval = -1e4     # nivel de nubes fuera de la rejilla
        self.outside = 1500.0      # altura del terreno fuera de la rejilla
        self.cache = {}

    # coordenadas -------------------------------------------------------------
    def ll2xy(self, lat, lon):
        return (lon - self.lon0) * self.mlon, (lat - self.lat0) * self.mlat

    def idx(self, x, y):
        return (np.asarray(y) - self.y0) / self.dx, (np.asarray(x) - self.x0) / self.dx

    def sample(self, A, x, y, order=1):
        fi, fj = self.idx(x, y)
        fi, fj = np.atleast_1d(fi).astype(np.float64), np.atleast_1d(fj).astype(np.float64)
        r = nd.map_coordinates(A, [fi.ravel(), fj.ravel()], order=order, mode="nearest")
        return r.reshape(fi.shape) if np.ndim(x) else float(r[0])

    def height(self, x, y):
        return self.sample(self.Z, x, y)

    # capas derivadas ------------------------------------------------------------
    def ao(self):
        if "ao" not in self.cache:
            self.cache["ao"] = self._disk(("ao",), self._ao)
        return self.cache["ao"]

    def _ao(self):
        if True:
            b = nd.gaussian_filter(self.Z, 140 / self.dx)
            b2 = nd.gaussian_filter(self.Z, 450 / self.dx)
            a = np.clip((b - self.Z) / 160, 0, 1) * 0.65 + np.clip((b2 - self.Z) / 500, 0, 1) * 0.35
            return a.astype(np.float32)

    def _disk(self, key, fn):
        import os, hashlib
        h = hashlib.md5((repr(key) + str(self.Z.shape) + str(float(self.Z.sum()))).encode()).hexdigest()[:10]
        p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache", f"{key[0]}_{h}.npy")
        if os.path.exists(p):
            return np.load(p)
        a = fn()
        os.makedirs(os.path.dirname(p), exist_ok=True)
        np.save(p, a)
        return a

    def lic(self, kind, lam, length, seed):
        key = ("lic", kind, lam, length, seed)
        if key not in self.cache:
            self.cache[key] = self._disk(key, lambda: self._lic(kind, lam, length, seed))
        return self.cache[key]

    def _lic(self, kind, lam, length, seed):
        """ruido estirado por integral de línea: 'fall' = a lo largo de la pendiente
        (estrías de nieve, canales, costillas de roca); 'contour' = a lo largo de las
        curvas de nivel (estratos de roca)."""
        rng = np.random.default_rng(seed)
        g = rng.random((int(self.H * self.dx / lam) + 4, int(self.W * self.dx / lam) + 4)).astype(np.float32)
        base = nd.map_coordinates(g, np.mgrid[0:self.H, 0:self.W].astype(np.float32) * (self.dx / lam) + 1,
                                  order=1, mode="wrap")
        gs_y, gs_x = np.gradient(nd.gaussian_filter(self.Z, 2.0), self.dx)
        ang = np.arctan2(gs_y, gs_x)
        if kind == "contour":
            ang = ang + np.pi / 2
        cy, cx = np.sin(ang), np.cos(ang)
        ii, jj = np.mgrid[0:self.H, 0:self.W].astype(np.float32)
        acc = np.zeros_like(self.Z); n = 0
        steps = max(2, int(length / (self.dx * 0.8)))
        for k in range(-steps, steps + 1):
            d = k * length / steps / self.dx
            acc += nd.map_coordinates(base, [ii + cy * d, jj + cx * d], order=1, mode="wrap"); n += 1
        a = acc / n
        a = (a - a.mean()) / (a.std() + 1e-6) * 0.17 + 0.5
        return np.clip(a, 0, 1).astype(np.float32)

    def micro(self):
        """gradiente del DEM + micro-relieve de estrías (para el sombreado)"""
        if "micro" not in self.cache:
            fl = self.lic("fall", 40, 650, 11)
            st = self.lic("contour", 60, 520, 12)
            steep = np.clip((self.slope - 18) / 25, 0, 1)
            m = (fl - 0.5) * 16 * steep + (st - 0.5) * 10 * steep
            gy, gx = np.gradient(self.Z + m, self.dx)
            cr = self.lic("contour", 22, 160, 13)
            self.cache["micro"] = (gx.astype(np.float32), gy.astype(np.float32), fl, st, cr)
        return self.cache["micro"]

    def shadow(self, sun_az, sun_el):
        """sombra arrojada (0..1) para sol en azimut/elevación (grados)"""
        key = ("sh", round(sun_az, 2), round(sun_el, 2), self.cloud is not None)
        if key in self.cache:
            return self.cache[key]
        Hf = self.Z if self.cloud is None else np.maximum(self.Z, self.cloud)
        az, el = np.radians(sun_az), np.radians(sun_el)
        sx, sy, te = np.sin(az), np.cos(az), np.tan(el)
        sh = np.zeros_like(self.Z)
        d = self.dx
        ii, jj = np.mgrid[0:self.H, 0:self.W].astype(np.float32)
        while d < 26000:
            fi = ii + sy * d / self.dx
            fj = jj + sx * d / self.dx
            hs = nd.map_coordinates(Hf, [fi, fj], order=1, mode="nearest")
            soft = 10 + 0.012 * d
            sh = np.maximum(sh, smooth(0, soft, hs - (Hf + d * te)))
            d = d * 1.07 + self.dx * 0.5
        self.cache[key] = sh.astype(np.float32)
        return self.cache[key]


class Camera:
    def __init__(self, x, y, z, yaw, hfov, W, H, horizon):
        self.x, self.y, self.z = x, y, z
        self.yaw, self.hfov = yaw, hfov
        self.W, self.H = W, H
        self.f = (W / 2) / np.tan(np.radians(hfov) / 2)
        self.v0 = horizon * H            # fila de la línea del horizonte (lente descentrada)

    def project(self, X, Y, Zw):
        """mundo → (col, fila, distancia horizontal)"""
        dx, dy = np.asarray(X) - self.x, np.asarray(Y) - self.y
        dist = np.hypot(dx, dy)
        a = np.arctan2(dx, dy) - np.radians(self.yaw)
        a = (a + np.pi) % (2 * np.pi) - np.pi
        zf = dist * np.cos(a)
        col = self.W / 2 + self.f * np.tan(a)
        drop = dist ** 2 / (2 * R_EARTH) * (1 - K_REFR)
        row = self.v0 - self.f * (np.asarray(Zw) - self.z - drop) / np.maximum(zf, 1e-3)
        return col, row, dist, zf


def raymarch(dem, cam, t_min=200.0, t_max=150000.0, ratio=0.0016):
    t_min = getattr(cam, "t_min", t_min)
    """horizonte flotante. Devuelve t (distancia por píxel, NaN = cielo), borde duro."""
    W, H = cam.W, cam.H
    j = np.arange(W) + 0.5
    alpha = np.arctan((j - W / 2) / cam.f)
    az = np.radians(cam.yaw) + alpha
    dxr, dyr, ca = np.sin(az), np.cos(az), np.cos(alpha)
    ts = [t_min]
    while ts[-1] < t_max:
        ts.append(ts[-1] + max(dem.dx * 0.45, ts[-1] * ratio))
    ts = np.array(ts, np.float32)
    K = len(ts)
    Hf = dem.Z if dem.cloud is None else np.maximum(dem.Z, dem.cloud)
    cval = max(dem.outside, dem.cloud_cval)
    rows = np.empty((K, W), np.float32)
    for k, t in enumerate(ts):
        px, py = cam.x + t * dxr, cam.y + t * dyr
        fi, fj = (py - dem.y0) / dem.dx, (px - dem.x0) / dem.dx
        h = nd.map_coordinates(Hf, [fi, fj], order=1, mode="constant", cval=cval)
        drop = t * t / (2 * R_EARTH) * (1 - K_REFR)
        rows[k] = cam.v0 - cam.f * (h - cam.z - drop) / (t * ca)
    m = np.minimum.accumulate(rows, axis=0)
    tpix = np.full((H, W), np.nan, np.float32)
    hard = np.zeros((H, W), bool)
    rr = np.arange(H) + 0.5
    for c in range(W):
        mc = m[:, c]; rc = rows[:, c]
        k = np.searchsorted(-mc, -rr, side="left")
        ok = k < K
        kk = np.clip(k, 1, K - 1)
        prev_vis = rc[kk - 1] <= mc[kk - 1] + 1e-3
        frac = np.clip((mc[kk - 1] - rr) / np.maximum(mc[kk - 1] - rc[kk], 1e-4), 0, 1)
        t_int = ts[kk - 1] + frac * (ts[kk] - ts[kk - 1])
        tc = np.where(prev_vis, t_int, ts[kk])
        tc = np.where(k == 0, ts[0], tc)
        tpix[:, c] = np.where(ok, tc, np.nan)
        hard[:, c] = ok & ~prev_vis & (k > 0)
    return tpix, hard, (dxr, dyr, ca)


def world_of(cam, tpix, rays):
    dxr, dyr, ca = rays
    X = cam.x + tpix * dxr[None, :]
    Y = cam.y + tpix * dyr[None, :]
    return X, Y


def fine_noise(X, Y, lam, seed, aniso=(1.0, 1.0)):
    rng = np.random.default_rng(seed)
    g = rng.random((257, 257)).astype(np.float32)
    u = np.nan_to_num(X) / (lam * aniso[0]); v = np.nan_to_num(Y) / (lam * aniso[1])
    return nd.map_coordinates(g, [v % 256, u % 256], order=3, mode="wrap")


PALETTES = {
    "day": dict(snow=((130, 152, 200), (254, 248, 234)), rock=((52, 56, 86), (150, 128, 112)),
                veg=((58, 72, 62), (146, 146, 92)), haze=(196, 208, 228),
                cloud=((146, 160, 196), (218, 224, 236), (255, 253, 247))),
    "warm": dict(snow=((118, 132, 186), (255, 236, 206)), rock=((58, 58, 96), (178, 132, 104)),
                 veg=((58, 70, 62), (150, 140, 92)), haze=(236, 206, 196),
                 cloud=((150, 150, 186), (232, 214, 210), (255, 240, 222))),
    "dawn": dict(snow=((110, 114, 170), (255, 206, 160)), rock=((62, 62, 108), (200, 132, 108)),
                 veg=((56, 60, 84), (140, 110, 100)), haze=(196, 160, 182),
                 cloud=((120, 116, 168), (214, 170, 176), (255, 214, 176))),
    "night": dict(snow=((52, 64, 110), (176, 192, 230)), rock=((22, 26, 48), (84, 90, 120)),
                  veg=((20, 24, 40), (60, 64, 90)), haze=(26, 34, 70),
                  cloud=((40, 50, 86), (96, 110, 150), (150, 164, 204))),
}


def shade(dem, cam, tpix, rays, sun_az, sun_el, pal="day", haze_L=55000.0, haze_base=0.03,
          snowline=5000.0, seed=3):
    """color de la montaña + mapa de regiones + datos auxiliares"""
    P = PALETTES[pal] if isinstance(pal, str) else pal
    H, W = tpix.shape
    sky = np.isnan(tpix)
    X, Y = world_of(cam, tpix, rays)
    Xs, Ys = np.where(sky, cam.x, X), np.where(sky, cam.y, Y)
    fi, fj = dem.idx(Xs, Ys)
    S = lambda A, o=1: nd.map_coordinates(A, [fi, fj], order=o, mode="nearest")
    h = nd.map_coordinates(dem.Z, [fi, fj], order=1, mode="constant", cval=dem.outside)
    slope = S(dem.slope)
    iscloud = np.zeros((H, W), bool)
    if dem.cloud is not None:
        cl = nd.map_coordinates(dem.cloud, [fi, fj], order=1, mode="constant", cval=dem.cloud_cval)
        iscloud = (cl > h + 1) & ~sky
    # tamaño del píxel en el terreno → filtrar el ruido fino (evita el moteado "leopardo")
    foot = np.nan_to_num(tpix, nan=1e6) / cam.f
    fw = lambda lam_: smooth(1.0, 0.25, foot / lam_)
    outside = (fi < 0) | (fj < 0) | (fi > dem.H - 1) | (fj > dem.W - 1)
    # micro-relieve: estrías a lo largo de la pendiente + estratos (precalculados en el DEM)
    mgx, mgy, FL, ST, CR = dem.micro()
    gx, gy = S(mgx), S(mgy)
    fl, st, cr = S(FL), S(ST), S(CR)
    slope = np.where(outside, 0, slope)
    gx = np.where(outside, 0, gx); gy = np.where(outside, 0, gy)
    n1 = 0.5 + (fine_noise(Xs, Ys, 26, seed) - 0.5) * fw(26)
    n2 = 0.5 + (fine_noise(Xs, Ys, 9, seed + 1) - 0.5) * fw(9)
    n3 = fine_noise(Xs, Ys, 160, seed + 2)
    fl = 0.5 + (fl - 0.5) * (0.35 + 0.65 * fw(40))
    st = 0.5 + (st - 0.5) * (0.35 + 0.65 * fw(60))
    if dem.cloud is not None:
        cgy, cgx = dem.cache.get("cgrad", (None, None))
        if cgx is None:
            cgy, cgx = np.gradient(dem.cloud, dem.dx)
            dem.cache["cgrad"] = (cgy, cgx)
        cnx = S(cgx.astype(np.float32)); cny = S(cgy.astype(np.float32))
        cnx = np.where(outside, 0, cnx); cny = np.where(outside, 0, cny)
        gx = np.where(iscloud, cnx * 1.6, gx); gy = np.where(iscloud, cny * 1.6, gy)
    pert = 0.10 * (n1 - 0.5)
    nx, ny = -gx + pert, -gy - pert
    nz = np.ones_like(nx)
    nn = np.sqrt(nx * nx + ny * ny + nz * nz)
    az, el = np.radians(sun_az), np.radians(sun_el)
    Sv = np.array([np.sin(az) * np.cos(el), np.cos(az) * np.cos(el), np.sin(el)])
    lam = np.clip((nx * Sv[0] + ny * Sv[1] + nz * Sv[2]) / nn, 0, 1)
    shd = np.where(outside, 0, S(dem.shadow(sun_az, sun_el)))
    luz = lam * (1 - 0.88 * shd)
    ao = np.where(outside, 0, S(dem.ao()))
    # nieve o roca: la pendiente manda; estratos y costillas modulan
    thr = np.interp(h, [3600, 4300, 4800, 5500, 6500, 7600, 7950, 8200], [16, 26, 36, 46, 51, 54, 60, 64])
    # probabilidad de roca según la pendiente; se "tramita" con el ruido de estrías:
    # roca en las costillas, nieve en los canales (no manchas redondas)
    p = np.minimum(smooth(thr - 15, thr + 13, slope + 8 * (st - 0.5) + 4 * (n3 - 0.5)), 0.9)
    from scipy.special import ndtr
    uq = ndtr((fl - 0.5) / 0.17 * 1.0)
    rock = smooth(-0.035, 0.035, p - uq)
    low = smooth(snowline + 200, snowline - 300, h + 300 * (n3 - 0.5) + 160 * (fl - 0.5))
    rock = np.maximum(rock, low * smooth(8, 16, slope + 10 * (n1 - 0.5)))
    # grietas y seracs en el glaciar (líneas a lo largo de las curvas de nivel)
    glac = (1 - rock) * smooth(6, 14, slope) * smooth(4700, 5200, h) * (1 - smooth(40, 50, slope))
    crev = smooth(0.60, 0.68, cr) * glac * smooth(0.2, 0.9, fw(22) + 0.3 * smooth(20, 35, slope))
    # seracs: escalones de hielo en las cascadas (bandas a lo largo de las curvas de nivel)
    ice = (1 - rock) * smooth(22, 30, slope) * (1 - smooth(44, 52, slope)) * smooth(5200, 5500, h) \
        * (1 - smooth(6900, 7200, h))
    zone = smooth(0.30, 0.45, fine_noise(Xs, Ys, 900, seed + 9))
    q = (h + 90 * (fl - 0.5) + 40 * (n3 - 0.5)) / 75.0
    fq = q - np.floor(q)
    cliff = smooth(0.0, 0.03, fq) * smooth(0.38, 0.26, fq)
    blocks = smooth(0.36, 0.50, cr)
    serac = ice * zone * cliff * blocks * fw(40)
    veg = smooth(4350, 3900, h + 200 * (n3 - 0.5)) * (1 - smooth(30, 45, slope))
    lit = smooth(0.30, 0.80, luz)
    lit3 = lit[..., None]
    def ramp(pair):
        a, b = np.array(pair[0], np.float32), np.array(pair[1], np.float32)
        return a + (b - a) * lit3
    snowc = ramp(P["snow"])
    rockc = ramp(P["rock"]) * (0.74 + 0.52 * (0.25 * n2 + 0.45 * st + 0.30 * fl))[..., None]
    vegc = ramp(P["veg"]) * (0.80 + 0.35 * n1)[..., None]
    # nieve en repisas (estratos) y canales dentro de la roca
    ledges = smooth(0.60, 0.68, st) * fw(60) + smooth(0.64, 0.72, fl) * fw(40) * 0.8
    rock_eff = rock * (1 - 0.85 * np.clip(ledges, 0, 1) * smooth(30, 45, slope))
    col = mix(snowc, rockc, rock_eff[..., None])
    col = mix(col, vegc, (veg * rock)[..., None])
    col = mix(col, np.array([70, 92, 150], np.float32) * (0.55 + 0.45 * lit3), (0.75 * crev)[..., None])
    col = mix(col, np.array([84, 124, 190], np.float32) * (0.55 + 0.55 * lit3), (0.92 * serac)[..., None])
    col = col * (1 - 0.34 * ao)[..., None] + np.array([20, 28, 60], np.float32) * (0.34 * ao)[..., None]
    # mar de nubes
    if iscloud.any():
        c0, c1, c2 = [np.array(c, np.float32) for c in P["cloud"]]
        cn = fine_noise(Xs, Ys, 420, seed + 7)
        cn2 = fine_noise(Xs, Ys, 1500, seed + 8)
        cl_lit = np.clip(0.60 + 3.2 * (lam - np.sin(el)) + 0.45 * (cn - 0.5) + 0.35 * (cn2 - 0.5), 0, 1) \
            * (1 - 0.6 * shd)
        cc = np.where((cl_lit < 0.5)[..., None], mix(c0, c1, (cl_lit / 0.5)[..., None]),
                      mix(c1, c2, ((cl_lit - 0.5) / 0.5)[..., None]))
        col = np.where(iscloud[..., None], cc, col)
    # perspectiva aérea por distancia
    tt = np.nan_to_num(tpix, nan=1e6)
    hz = haze_base + (1 - haze_base) * (1 - np.exp(-tt / haze_L)) ** 1.15
    col = mix(col, np.array(P["haze"], np.float32), hz[..., None])
    # regiones del README: 1 nube, 2 montaña, 3 roca/nieve cercana, 4 terreno lejano
    reg = np.full((H, W), 2, np.uint8)
    reg[(tt < 2200)] = 3
    reg[(h < 5200) & (tt > 6000) & (rock > 0.5)] = 4
    reg[iscloud] = 1
    reg[sky] = 0
    aux = dict(h=h, X=X, Y=Y, lit=lit, rock=rock, slope=slope, iscloud=iscloud, hz=hz, t=tpix,
               ice=ice, serac=serac)
    return col.astype(np.float32), reg, aux
