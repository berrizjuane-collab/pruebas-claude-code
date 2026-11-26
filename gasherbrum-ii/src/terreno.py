"""Relieve de trabajo del macizo Gasherbrum en coordenadas locales (metros).

Origen: cumbre del Gasherbrum II según el DEM (35.75742 N, 76.65273 E).  x = este, y = norte, z = altura.
Tres niveles anidados (rejillas regulares, fila 0 = sur):
  L0  12.5 m   36 x 36 km  (macizo, Baltoro superior, Concordia, K2, Broad Peak)  + microrrelieve
  L1  60 m    180 x 180 km
  L2  400 m   700 x 700 km (horizontes lejanos)
Correcciones: cumbres llevadas a su altura oficial (el DEM de 90 m las rebaja) y microrrelieve
procedural por debajo de ~150 m (acanaladuras a lo largo de la línea de máxima pendiente,
espolones, bandas de roca). Nada cambia por encima de esa escala: la forma grande es la real.
"""
import os
import numpy as np
from scipy import ndimage as ndi
import dem

R_TIERRA = 6371000.0
LAT0, LON0 = 35.75742, 76.65273
KX = np.pi / 180 * R_TIERRA * np.cos(np.radians(LAT0))
KY = np.pi / 180 * R_TIERRA
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '..', 'cache')

# Cumbres y alturas oficiales (m).  Coordenadas aproximadas: se busca el máximo del DEM cerca.
CUMBRES = {
    'Gasherbrum I': (35.72444, 76.69639, 8080),
    'Gasherbrum II': (35.75742, 76.65273, 8035),
    'Gasherbrum II Este': (35.7548, 76.6655, 7772),
    'Gasherbrum III': (35.75944, 76.64194, 7952),
    'Gasherbrum IV': (35.76083, 76.61667, 7925),
    'Gasherbrum V': (35.7277, 76.6184, 7147),
    'Gasherbrum VI': (35.70833, 76.63167, 6979),
    'Broad Peak': (35.8097, 76.5683, 8051),
    'Broad Peak Central': (35.8201, 76.5608, 8011),
    'Broad Peak Norte': (35.8361, 76.5524, 7490),
    'K2': (35.8825, 76.5133, 8611),
    'Baltoro Kangri': (35.6380, 76.6730, 7312),
    'Chogolisa': (35.6125, 76.5781, 7665),
    'Sia Kangri': (35.6630, 76.7620, 7422),
    'Masherbrum': (35.6400, 76.3058, 7821),
    'Mitre Peak': (35.7244, 76.5272, 6010),
    'Crystal Peak': (35.7590, 76.5100, 6237),
    'Marble Peak': (35.7642, 76.5373, 6256),
    'Skyang Kangri': (35.9258, 76.5633, 7545),
    'Muztagh Tower': (35.8267, 76.3617, 7276),
    'Urdok I': (35.7375, 76.7086, 7300),
}


def ll2xy(lat, lon):
    return (np.asarray(lon) - LON0) * KX, (np.asarray(lat) - LAT0) * KY


def xy2ll(x, y):
    return LAT0 + np.asarray(y) / KY, LON0 + np.asarray(x) / KX


class Nivel:
    """Rejilla regular: z[fila, col] en (x0 + col*c, y0 + fila*c)."""

    def __init__(self, z, x0, y0, c):
        self.z = np.ascontiguousarray(z, np.float32)
        self.x0, self.y0, self.c = float(x0), float(y0), float(c)

    @property
    def shape(self):
        return self.z.shape

    def muestrear(self, x, y, arr=None, order=1):
        a = self.z if arr is None else arr
        return ndi.map_coordinates(a, [(np.asarray(y) - self.y0) / self.c, (np.asarray(x) - self.x0) / self.c],
                                   order=order, mode='nearest')

    def ejes(self):
        h, w = self.z.shape
        return self.x0 + np.arange(w) * self.c, self.y0 + np.arange(h) * self.c


def _remuestrear(fuentes, x0, y0, c, nx, ny, order=3, rampa_m=1500.0):
    """fuentes: lista de (Z, lons, lats) en orden de prioridad.  Donde una fuente de más prioridad
    tiene datos manda ella; en el borde de sus huecos se funde con la siguiente en `rampa_m` metros
    (sin costuras).  Los huecos se rellenan por vecino más cercano antes del filtro bicúbico para
    que no aparezcan ondas de Gibbs."""
    xs = x0 + np.arange(nx) * c
    ys = y0 + np.arange(ny) * c
    out = np.full((ny, nx), np.nan, np.float32)
    for (Z, lons, lats) in reversed(fuentes):
        valido = ~np.isnan(Z)
        if not valido.any():
            continue
        if valido.all():
            Zf = Z.astype(np.float32)
            dist = None
        else:
            idx = ndi.distance_transform_edt(~valido, return_distances=False, return_indices=True)
            Zf = Z[tuple(idx)].astype(np.float32)
            dist = ndi.distance_transform_edt(valido).astype(np.float32)   # celdas hasta el hueco
        celda_m = abs(lats[0] - lats[1]) * KY
        rampa = max(2.0, rampa_m / celda_m)
        coef = ndi.spline_filter(Zf, order=order) if order > 1 else Zf
        bloque = 400
        for j0 in range(0, ny, bloque):
            X, Y = np.meshgrid(xs, ys[j0:j0 + bloque])
            lat, lon = xy2ll(X, Y)
            jf = (lats[0] - lat) / (lats[0] - lats[1])
            iff = (lon - lons[0]) / (lons[1] - lons[0])
            v = ndi.map_coordinates(coef, [jf, iff], order=order, mode='nearest', prefilter=False)
            dentro = (jf >= 0) & (jf <= Z.shape[0] - 1) & (iff >= 0) & (iff <= Z.shape[1] - 1)
            if dist is None:
                w = np.ones_like(v)
            else:
                w = np.clip((ndi.map_coordinates(dist, [jf, iff], order=1, mode='nearest') - 1.5) / rampa, 0, 1)
            w = np.where(dentro, w, 0.0)
            sub = out[j0:j0 + bloque]
            prev = np.where(np.isnan(sub), v, sub)
            w = np.where(np.isnan(sub), np.where(w > 0, 1.0, 0.0), w)
            nuevo = prev * (1 - w) + v * w
            sub[:] = np.where(w > 0, nuevo, sub)
    return out


def _corregir_cumbres(z, x0, y0, c, sigma_min):
    """Lleva cada cumbre a su altura oficial con un abultamiento gaussiano local."""
    info = {}
    for nombre, (la, lo, hof) in CUMBRES.items():
        px, py = ll2xy(la, lo)
        ci, ri = (px - x0) / c, (py - y0) / c
        r = int(max(3, 350 / c))
        i0, j0 = int(round(ci)), int(round(ri))
        if not (r <= i0 < z.shape[1] - r and r <= j0 < z.shape[0] - r):
            continue
        sub = z[j0 - r:j0 + r + 1, i0 - r:i0 + r + 1]
        jj, ii = np.unravel_index(np.nanargmax(sub), sub.shape)
        en_borde = jj in (0, sub.shape[0] - 1) or ii in (0, sub.shape[1] - 1)
        jj += j0 - r; ii += i0 - r
        dz = hof - z[jj, ii]
        if en_borde:          # no es un máximo local: la coordenada no apunta a una cima del DEM
            continue
        if abs(dz) > 0.5:
            sig = max(sigma_min, 160.0)
            rr = int(4 * sig / c) + 2
            ja, jb = max(0, jj - rr), min(z.shape[0], jj + rr + 1)
            ia, ib = max(0, ii - rr), min(z.shape[1], ii + rr + 1)
            Y, X = np.mgrid[ja:jb, ia:ib]
            d2 = ((X - ii) ** 2 + (Y - jj) ** 2) * c * c
            # perfil algo más agudo que una gaussiana: las cimas son puntas, no cúpulas
            g = np.exp(-np.sqrt(d2) / sig) * np.exp(-d2 / (2 * (2.2 * sig) ** 2))
            z[ja:jb, ia:ib] += (dz * g).astype(np.float32)
        info[nombre] = (x0 + ii * c, y0 + jj * c, float(z[jj, ii]))
    return info


def _lic(dirx, diry, ruido, pasos, paso):
    """Convolución integral de línea: promedia `ruido` a lo largo del campo (dirx, diry) (en celdas)."""
    h, w = ruido.shape
    J, I = np.mgrid[0:h, 0:w].astype(np.float32)
    acc = ruido.copy().astype(np.float32)
    n = np.ones_like(acc)
    for signo in (1.0, -1.0):
        py, px = J.copy(), I.copy()
        for k in range(pasos):
            dx = ndi.map_coordinates(dirx, [py, px], order=1, mode='nearest')
            dy = ndi.map_coordinates(diry, [py, px], order=1, mode='nearest')
            px += signo * paso * dx
            py += signo * paso * dy
            peso = 1.0 - (k + 1) / (pasos + 1)
            acc += peso * ndi.map_coordinates(ruido, [py, px], order=1, mode='wrap')
            n += peso
    return acc / n


def _ruido(shape, celdas, rng, octavas=1):
    """Ruido de valor: rejilla aleatoria reescalada (bicúbica), con fBm opcional. Media ~0, desv ~1."""
    h, w = shape
    out = np.zeros(shape, np.float32); a = 1.0; tot = 0
    for o in range(octavas):
        gh, gw = max(2, int(h / celdas) + 2), max(2, int(w / celdas) + 2)
        g = rng.standard_normal((gh, gw)).astype(np.float32)
        out += a * ndi.zoom(g, (h / (gh - 1), w / (gw - 1)), order=3)[:h, :w]
        tot += a * a; a *= 0.5; celdas /= 2
    return out / np.sqrt(tot)


def afilar(z, c, sigma_m, k, limite):
    """Máscara de enfoque sobre el relieve: devuelve a las aristas y canales la nitidez que el DEM de
    90 m promedia (cambio limitado a ±limite metros).  Solo en pendientes: los glaciares y mesetas
    quedan lisos (si no, el afilado ondula su superficie)."""
    dz = z - ndi.gaussian_filter(z, sigma_m / c)
    p100 = np.degrees(np.arctan(np.hypot(*np.gradient(ndi.gaussian_filter(z, max(1.0, 100 / c)), c))))
    w = np.clip((p100 - 12.0) / 14.0, 0, 1)
    return (z + w * np.clip(k * dz, -limite, limite)).astype(np.float32)


def _acumulacion(z):
    """Acumulación de flujo D8 (número de celdas aguas arriba)."""
    from numba import njit

    @njit(cache=True)
    def _d8(z, orden, acc):
        H, W = z.shape
        for k in range(orden.size):
            idx = orden[k]
            y = idx // W; x = idx - y * W
            best = -1; bd = 0.0
            for dy in range(-1, 2):
                for dx in range(-1, 2):
                    if dy == 0 and dx == 0:
                        continue
                    yy = y + dy; xx = x + dx
                    if yy < 0 or yy >= H or xx < 0 or xx >= W:
                        continue
                    dd = 1.41421356 if (dy != 0 and dx != 0) else 1.0
                    drop = (z[y, x] - z[yy, xx]) / dd
                    if drop > bd:
                        bd = drop; best = yy * W + xx
            if best >= 0:
                acc[best] += acc[idx]
    orden = np.argsort(z, axis=None)[::-1].astype(np.int64)
    acc = np.ones(z.size, np.float32)
    _d8(z.astype(np.float32), orden, acc)
    return acc.reshape(z.shape)


def microrrelieve(z, c, rng):
    """Detalle por debajo de ~150 m sobre el relieve real:
    * red dendrítica de canales: flujo D8 sobre el relieve con un ruido suave (los canales se unen y
      ramifican como en una pared real) -> se excavan en las pendientes fuertes;
    * acanaladuras finas a lo largo de la línea de máxima pendiente (LIC) en las caras empinadas;
    * escalones de seracs en las cascadas de hielo (pendiente moderada sobre glaciar);
    * crestas de morrena a lo largo del flujo en los glaciares bajos.
    Devuelve (z, pendiente, dirx, diry, canal) donde canal (0..1) marca couloirs (para la nieve)."""
    zs = ndi.gaussian_filter(z, 60 / c)
    gy, gx = np.gradient(zs, c)
    s = np.hypot(gx, gy) + 1e-6
    dirx, diry = (-gx / s).astype(np.float32), (-gy / s).astype(np.float32)
    pend = np.degrees(np.arctan(np.hypot(*np.gradient(ndi.gaussian_filter(z, 25 / c), c))))
    pend100 = np.degrees(np.arctan(np.hypot(*np.gradient(ndi.gaussian_filter(z, 100 / c), c))))
    # --- red de canales
    pert = (_ruido(z.shape, 140 / c, rng, 3) * 7.0 + _ruido(z.shape, 45 / c, rng, 2) * 2.5)
    acc = _acumulacion(z + pert)
    area = acc * c * c                                   # m² aguas arriba
    prof = np.clip(np.log1p(area / 2500.0), 0, None) ** 1.3 * 4.2
    prof = np.minimum(prof, 45.0)
    empin = np.clip((pend100 - 20) / 16, 0, 1)
    canal = ndi.gaussian_filter(prof * empin, 0.75)
    # los canales anchos se ensanchan un poco (couloirs)
    canal = np.maximum(canal, ndi.gaussian_filter(canal, 2.2) * 1.3)
    dz = -canal
    # --- acanaladuras finas a lo largo de la pendiente
    n1 = ndi.gaussian_filter(rng.standard_normal(z.shape).astype(np.float32), 0.8)
    l1 = _lic(dirx, diry, n1 / n1.std(), 10, 1.0)
    l1 = (l1 - ndi.gaussian_filter(l1, 3)) / (l1.std() + 1e-6)
    parches = np.clip(_ruido(z.shape, 400 / c, rng, 2) * 0.6 + 0.6, 0, 1)
    nieve_alta = np.clip((z - 5600) / 500, 0, 1)
    dz += l1 * 2.4 * np.clip((pend - 32) / 14, 0, 1) * np.clip((58 - pend) / 8, 0, 1) * parches * nieve_alta
    # --- textura de roca (crestas irregulares) en paredes muy empinadas
    rr = _ruido(z.shape, 70 / c, rng, 3)
    roc = np.clip((pend - 40) / 14, 0, 1)
    dz += (1 - 2 * np.abs(np.tanh(rr))) * 9.0 * roc
    rr2 = _ruido(z.shape, 28 / c, rng, 2)
    dz += (1 - 2 * np.abs(np.tanh(rr2))) * 3.5 * roc
    # resaltes de roca: escalones irregulares casi horizontales en paredes

    # --- seracs: escalones solo en las lenguas de glaciar (gran cuenca aguas arriba) con pendiente 9-32°
    lengua = ndi.maximum_filter(ndi.gaussian_filter((area > 1.2e6).astype(np.float32), 60 / c), size=int(500 / c))
    lengua = ndi.gaussian_filter(lengua, 80 / c)
    hielo = np.clip((pend100 - 4.5) / 4, 0, 1) * np.clip((33 - pend100) / 8, 0, 1) * np.clip(lengua * 1.5, 0, 1)
    fase = _ruido(z.shape, 250 / c, rng, 2) * 9.0
    paso = 22.0
    q = (z + fase) / paso
    sierra = (q - np.floor(q) - 0.5) * paso          # diente de sierra: terrazas con frentes verticales
    dz += -sierra * 0.55 * hielo
    # --- glaciares bajos: crestas de morrena a lo largo del flujo + abultamientos
    glac = np.clip((10 - pend100) / 5, 0, 1) * np.clip((5700 - z) / 300, 0, 1)
    n3 = ndi.gaussian_filter(rng.standard_normal(z.shape).astype(np.float32), 1.6)
    l3 = _lic(dirx, diry, n3 / n3.std(), 16, 2.5)
    l3 = (l3 - ndi.gaussian_filter(l3, 6)) / (l3.std() + 1e-6)
    dz += glac * (np.clip(l3, -1, 2.5) * 2.2 + _ruido(z.shape, 35 / c, rng, 2) * 1.2)
    canal_n = np.clip(canal / 12.0, 0, 1)
    return (z + dz.astype(np.float32)), pend.astype(np.float32), dirx, diry, canal_n.astype(np.float32), hielo.astype(np.float32)


def materiales(z, c, rng, canal=None, zbase=None):
    """Mapas de material sobre una rejilla (independientes de la luz):
    roca 0..1 (roca expuesta vs nieve), glaciar 0..1 (lengua/plataforma de hielo), derrubio 0..1
    (morrena y glaciar cubierto de piedras), franja (-1..1, bandas de morrena a lo largo del flujo),
    tono (variación fina del color de la roca), estrato (bandas casi horizontales de la roca)."""
    zb = z if zbase is None else zbase
    pend = np.degrees(np.arctan(np.hypot(*np.gradient(ndi.gaussian_filter(z, max(1.0, 20 / c)), c))))
    pend100 = np.degrees(np.arctan(np.hypot(*np.gradient(ndi.gaussian_filter(zb, max(1.0, 100 / c)), c))))
    gy, gx = np.gradient(ndi.gaussian_filter(zb, max(1.0, 60 / c)), c)
    s = np.hypot(gx, gy) + 1e-6
    sur = np.clip(gy / s, -1, 1)          # +1 = ladera que cae hacia el sur (más sol, menos nieve)
    conv = z - ndi.gaussian_filter(z, max(1.0, 70 / c))      # >0 en crestas y espolones
    n_med = _ruido(z.shape, max(2.0, 260 / c), rng, 3)
    n_fin = _ruido(z.shape, max(1.5, 40 / c), rng, 2)
    S0 = np.interp(zb, [4300, 5000, 5600, 6200, 6900, 7600], [29, 33, 40, 46, 49, 51])
    S0 = S0 - 5.0 * sur * np.clip((pend100 - 12) / 15, 0, 1) - np.clip(conv / 5.0, -1.5, 3.0) * 4.5
    warp2 = _ruido(z.shape, max(2.0, 500 / c), rng, 2) * 40
    banda = np.sin((zb + warp2) / 140.0 * 2 * np.pi)          # bandas de roca casi horizontales
    S0 = S0 - 5.0 * np.clip(banda * 2 - 1, 0, 1) * np.clip((pend - 36) / 10, 0, 1)
    if c < 100:
        # modulación alargada según la línea de máxima pendiente: costillas de roca y canales de nieve
        dx_, dy_ = (-gx / s).astype(np.float32), (-gy / s).astype(np.float32)
        n5 = ndi.gaussian_filter(rng.standard_normal(z.shape).astype(np.float32), max(0.8, 35 / c))
        l5 = _lic(dx_, dy_, n5 / n5.std(), 14, max(1.0, 22 / c))
        l5 = (l5 - ndi.gaussian_filter(l5, max(1.0, 300 / c))) / (l5.std() + 1e-6)
        S0 = S0 + n_med * 1.6 + l5 * 4.2 + n_fin * 0.8
    else:
        S0 = S0 + n_med * 3.0 + n_fin * 1.2
    if canal is not None:
        S0 = S0 + 12.0 * canal
    # margen = pendiente - umbral de nieve (°); la roca se decide en el sombreado con un sesgo por escena
    margen = np.maximum(pend - S0, (pend - 58) * 2.0)
    # glaciares y plataformas: pendiente suave a 100 m y posición cóncava
    conc = ndi.gaussian_filter(zb, max(1.0, 600 / c)) - zb
    glaciar = np.clip((15 - pend100) / 6, 0, 1) * np.clip(conc / 40 + 0.8, 0, 1)
    # morrena / glaciar cubierto: glaciar bajo (por debajo de ~5300-5500 m)
    bajo = np.clip((5450 + n_med * 120 - zb) / 250, 0, 1)
    derrubio = np.clip(glaciar * bajo * 1.2, 0, 1)
    # laderas bajas con poca pendiente: pedreras
    derrubio = np.maximum(derrubio, np.clip((5300 - zb) / 400, 0, 1) * (1 - glaciar) * 0.7)
    # bandas de morrena a lo largo del flujo (rayas oscuras del Baltoro)
    franja = np.zeros_like(z)
    if c < 100:
        dirx, diry = (-gx / s).astype(np.float32), (-gy / s).astype(np.float32)
        gyb, gxb = np.gradient(ndi.gaussian_filter(zb, max(1.0, 400 / c)), c)
        sb = np.hypot(gxb, gyb) + 1e-6
        fx, fy = (-gxb / sb).astype(np.float32), (-gyb / sb).astype(np.float32)
        n4 = ndi.gaussian_filter(rng.standard_normal(z.shape).astype(np.float32), max(0.8, 30 / c))
        l4 = _lic(fx, fy, n4 / n4.std(), 18, max(1.0, 40 / c))
        l4 = (l4 - ndi.gaussian_filter(l4, max(1.0, 250 / c))) / (l4.std() + 1e-6)
        franja = np.tanh(l4 * 1.6)
    tono = n_fin
    warp = _ruido(z.shape, max(2.0, 700 / c), rng, 2) * 45
    estrato = np.sin((zb + warp) / 55.0 * 2 * np.pi) * 0.6 + np.sin((zb + warp * 0.7) / 19.0 * 2 * np.pi) * 0.4
    f16 = lambda a: np.asarray(a, np.float16)
    return dict(margen=f16(margen), glaciar=f16(glaciar), derrubio=f16(derrubio), franja=f16(franja),
                tono=f16(tono), estrato=f16(estrato), pend=f16(pend))


def construir(forzar=False, verbose=True):
    os.makedirs(CACHE, exist_ok=True)
    ruta = os.path.join(CACHE, 'terreno_v2.npz')
    if os.path.exists(ruta) and not forzar:
        d = np.load(ruta)
        niveles = [Nivel(d[f'z{i}'], *d[f'g{i}']) for i in range(3)]
        cumbres = {k: tuple(v) for k, v in zip(d['cn'], d['cv'])}
        extra = {k: d[k] for k in d.files if k.startswith('m') or k in ('zbase0', 'canal0')}
        return niveles, cumbres, extra
    rng = np.random.default_rng(20261124)
    # --- fuentes
    hi = dem.mosaico('hi', 0, 75.15, 34.55, 78.25, 36.85)
    lo0 = dem.mosaico('lo', 0, 73.4, 32.9, 80.6, 38.6)
    lo1 = dem.mosaico('lo', 1, 70.0, 31.0, 83.0, 40.9)
    # --- L2
    c2 = 400.0
    n2 = int(700000 / c2)
    x02 = y02 = -350000.0
    z2 = _remuestrear([lo0, lo1], x02, y02, c2, n2, n2, order=1)
    z2 = np.where(np.isnan(z2), np.nanmedian(z2), z2)
    _corregir_cumbres(z2, x02, y02, c2, 400)
    if verbose: print('L2', z2.shape)
    # --- L1
    c1 = 60.0
    n1 = int(180000 / c1)
    x01 = y01 = -90000.0
    z1 = _remuestrear([hi, lo0, lo1], x01, y01, c1, n1, n1, order=3)
    falt = np.isnan(z1)
    if falt.any():
        X, Y = np.meshgrid(x01 + np.arange(n1) * c1, y01 + np.arange(n1) * c1)
        z1[falt] = Nivel(z2, x02, y02, c2).muestrear(X[falt], Y[falt])
    z1 = afilar(z1, c1, 150.0, 0.45, 40.0)
    _corregir_cumbres(z1, x01, y01, c1, 160)
    if verbose: print('L1', z1.shape)
    # --- L0
    c0 = 12.5
    x00, y00 = -22000.0, -18000.0
    nx0, ny0 = int(36000 / c0), int(36000 / c0)
    z0 = _remuestrear([hi], x00, y00, c0, nx0, ny0, order=3)
    falt = np.isnan(z0)
    if falt.any():
        X, Y = np.meshgrid(x00 + np.arange(nx0) * c0, y00 + np.arange(ny0) * c0)
        z0[falt] = Nivel(z1, x01, y01, c1).muestrear(X[falt], Y[falt])
    z0 = afilar(z0, c0, 75.0, 0.75, 35.0)
    z0 = afilar(z0, c0, 180.0, 0.35, 45.0)
    cumbres = _corregir_cumbres(z0, x00, y00, c0, 140)
    zbase = z0.copy()
    if verbose: print('L0 base', z0.shape, 'microrrelieve...')
    z0, pend, dirx, diry, canal, seracs = microrrelieve(z0, c0, rng)
    # las cumbres corregidas no se mueven
    for nombre, (cx, cy_, cz) in cumbres.items():
        ii, jj = int(round((cx - x00) / c0)), int(round((cy_ - y00) / c0))
        rr = 10
        ja, jb, ia, ib = max(0, jj - rr), jj + rr + 1, max(0, ii - rr), ii + rr + 1
        Y, X = np.mgrid[ja:jb, ia:ib]
        w = np.exp(-((X - ii) ** 2 + (Y - jj) ** 2) * c0 * c0 / (2 * 45.0 ** 2))
        z0[ja:jb, ia:ib] = w * zbase[ja:jb, ia:ib] + (1 - w) * z0[ja:jb, ia:ib]
    if verbose: print('materiales...')
    m0 = materiales(z0, c0, rng, canal=canal, zbase=zbase)
    m0['seracs'] = np.asarray(seracs, np.float16)
    m1 = materiales(z1, c1, rng)
    m2 = materiales(z2, c2, rng)
    niveles = [Nivel(z0, x00, y00, c0), Nivel(z1, x01, y01, c1), Nivel(z2, x02, y02, c2)]
    mats = {}
    for i, m in enumerate((m0, m1, m2)):
        for k, v in m.items():
            mats[f'm{i}_{k}'] = v
    np.savez(ruta, **{f'z{i}': n.z for i, n in enumerate(niveles)},
             **{f'g{i}': np.array([n.x0, n.y0, n.c]) for i, n in enumerate(niveles)},
             cn=np.array(list(cumbres.keys())), cv=np.array(list(cumbres.values())),
             zbase0=zbase, canal0=canal.astype(np.float16), **mats)
    return construir(False, verbose)


if __name__ == '__main__':
    import time
    t = time.time()
    niv, cum, extra = construir(forzar=True)
    print('listo en', round(time.time() - t, 1), 's')
    for k, v in cum.items():
        print(f'{k:22s} x={v[0]:9.0f} y={v[1]:9.0f} z={v[2]:6.0f}')
