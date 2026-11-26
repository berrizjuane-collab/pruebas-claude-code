"""Imagen objetivo T del relieve (README §2.3) a partir del render 3D: materiales, luz de dos tonos,
oclusión ambiental y bruma; y el mapa de regiones `reg` y la dirección por defecto del trazo."""
import numpy as np
from scipy import ndimage as ndi
from util import smooth, mix
import render3d as R3

PALETAS = {
    # nieve sombra -> luz, roca sombra -> luz, bruma
    'dia': dict(ns=(130, 152, 200), nl=(254, 248, 234), rs=(56, 60, 92), rl=(160, 130, 106), bruma=(196, 208, 228),
                hs=(98, 120, 158), hl=(214, 226, 232), ds=(52, 52, 64), dl=(140, 126, 112)),
    'alba': dict(ns=(110, 114, 170), nl=(255, 206, 160), rs=(62, 62, 108), rl=(200, 132, 108), bruma=(168, 146, 178),
                 hs=(92, 98, 150), hl=(236, 200, 172), ds=(50, 48, 72), dl=(150, 112, 100)),
    'ocaso': dict(ns=(104, 106, 166), nl=(255, 196, 150), rs=(60, 56, 100), rl=(206, 124, 96), bruma=(176, 146, 170),
                  hs=(90, 94, 146), hl=(238, 192, 162), ds=(48, 46, 70), dl=(152, 108, 94)),
    'dorada': dict(ns=(118, 134, 190), nl=(255, 230, 182), rs=(58, 58, 96), rl=(196, 140, 98), bruma=(190, 190, 210),
                   hs=(96, 112, 156), hl=(240, 222, 190), ds=(50, 50, 66), dl=(152, 124, 100)),
    'noche': dict(ns=(130, 152, 200), nl=(254, 248, 234), rs=(56, 60, 92), rl=(160, 130, 106), bruma=(150, 166, 200),
                  hs=(98, 120, 158), hl=(214, 226, 232), ds=(52, 52, 64), dl=(140, 126, 112)),
}


def _pesos_nivel(px, py, dist, niveles, dlod):
    """Réplica de la mezcla de niveles de render3d.altura: peso de L0 y de L1 (frente a L2)."""
    def borde(n):
        h, w = n.z.shape
        return np.minimum.reduce([px - n.x0, n.x0 + (w - 2) * n.c - px, py - n.y0, n.y0 + (h - 2) * n.c - py])
    e1 = borde(niveles[1]); e0 = borde(niveles[0])
    w1 = np.clip(e1 / 6000.0, 0, 1) * np.where(dist > 120000, np.clip(1 - (dist - 120000) / 30000, 0, 1), 1)
    w1 = np.where(e1 <= 0, 0, w1)
    w0 = np.clip(e0 / 1500.0, 0, 1) * np.clip((dlod - dist) / (0.25 * dlod), 0, 1)
    w0 = np.where((e0 <= 0) | (dist > dlod), 0, w0)
    return w0.astype(np.float32), w1.astype(np.float32)


def muestrear_mapas(buf, niveles, extra, nombres, dlod, mapas_extra=None):
    """Muestrea los mapas de material de los tres niveles en cada píxel y los mezcla como el relieve."""
    px, py, dist = buf['px'], buf['py'], buf['dist']
    terr = np.isfinite(dist)
    w0, w1 = _pesos_nivel(px, py, np.where(terr, dist, 1e9), niveles, dlod)
    out = {}
    for nom in nombres:
        acc = np.zeros(px.shape, np.float32)
        for k, n in enumerate(niveles):
            peso = (w0 if k == 0 else (1 - w0) * (w1 if k == 1 else (1 - w1)))
            sel = terr & (peso > 1e-4)
            if not sel.any():
                continue
            if mapas_extra is not None and (k, nom) in mapas_extra:
                m = mapas_extra[(k, nom)]
            elif f'm{k}_{nom}' in extra:
                m = extra[f'm{k}_{nom}']
            else:
                continue
            v = ndi.map_coordinates(m.astype(np.float32), [(py[sel] - n.y0) / n.c, (px[sel] - n.x0) / n.c],
                                    order=1, mode='nearest')
            acc[sel] += peso[sel] * v
        out[nom] = acc
    return out


_AO_CACHE = {}


def mapas_ao(niveles, extra=None):
    """Oclusión ambiental por nivel (README: ao = clip((blur(h) - h)·k)), en dos escalas; y la
    pendiente del relieve base suavizado (sin microrrelieve) para decidir glaciar / derrubio."""
    if 'ao' in _AO_CACHE:
        return _AO_CACHE['ao']
    res = {}
    for k, n in enumerate(niveles):
        zb = extra['zbase0'] if (k == 0 and extra is not None and 'zbase0' in extra) else n.z
        zs = ndi.gaussian_filter(zb.astype(np.float32), max(1.0, 40.0 / n.c))
        gy, gx = np.gradient(zs, n.c)
        res[(k, 'pendb')] = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float16)
    for k, n in enumerate(niveles):
        z = n.z.astype(np.float32)
        c = n.c
        a = np.zeros_like(z)
        for r_m, esc in ((90.0, 22.0), (320.0, 75.0), (1200.0, 260.0)):
            s = r_m / c
            if s < 0.7:
                continue
            a += np.clip((ndi.gaussian_filter(z, s) - z) / esc, 0, 1)
        res[(k, 'ao')] = np.clip(a * 0.6, 0, 1).astype(np.float16)
    _AO_CACHE['ao'] = res
    return res


_TEX = {}


def textura_mundo(px, py, d):
    """fBm teselable muestreado en coordenadas de mundo a escalas de 0.6 a 20 m (espejo, sin costuras)."""
    if 'tex' not in _TEX:
        rng = np.random.default_rng(77)
        N = 512
        t = np.zeros((N, N), np.float32); a = 1.0; tot = 0
        for f in (8, 16, 32, 64, 128):
            g = rng.random((f, f)).astype(np.float32)
            t += a * np.clip(ndi.zoom(g, N / f, order=3, mode='grid-wrap'), 0, 1)[:N, :N]
            tot += a; a *= 0.6
        _TEX['tex'] = t / tot
    tex = _TEX['tex']; N = tex.shape[0]
    out = np.full(px.shape, 0.5, np.float32)
    sel = d < 2000
    if not sel.any():
        return out
    acc = np.zeros(sel.sum(), np.float32)
    for esc, w in ((24.0, 0.5), (6.0, 0.3), (1.6, 0.2)):
        qx = np.abs(np.mod(px[sel] / esc * 64, 2 * N) - N); qy = np.abs(np.mod(py[sel] / esc * 64, 2 * N) - N)
        acc += w * ndi.map_coordinates(tex, [np.clip(qy, 0, N - 1.01), np.clip(qx, 0, N - 1.01)], order=1)
    out[sel] = acc
    return out


def relieve_fino(buf, d, escena, peso=1.0):
    """Perturbación de normales (bump) con la textura de mundo para el terreno cercano."""
    nx, ny, nz = buf['nx'], buf['ny'], buf['nz']
    k = smooth(escena.get('textura_d', 450.0) * 0.8, 20.0, d) * escena.get('bump', 0.9) * peso
    sel = k > 0.01
    if not sel.any():
        return nx, ny, nz
    px, py = buf['px'][sel], buf['py'][sel]
    e = 0.8
    dd = d[sel]
    tx0 = textura_mundo(px - e, py, dd); tx1 = textura_mundo(px + e, py, dd)
    ty0 = textura_mundo(px, py - e, dd); ty1 = textura_mundo(px, py + e, dd)
    gx = (tx1 - tx0) / (2 * e) * 9.0; gy = (ty1 - ty0) / (2 * e) * 9.0
    nx2, ny2, nz2 = nx.copy(), ny.copy(), nz.copy()
    kk = k[sel]
    a = nx[sel] - gx * kk; b = ny[sel] - gy * kk; c = nz[sel]
    n = np.sqrt(a * a + b * b + c * c)
    nx2[sel] = a / n; ny2[sel] = b / n; nz2[sel] = c / n
    return nx2, ny2, nz2


def relieve_roca(buf, d, escena, nx, ny, nz, roca):
    """Facetas de roca (bump a escala de 4-40 m) visibles hasta ~8 km: luz y sombra nítidas en paredes."""
    k = roca * smooth(escena.get('roca_d', 9000.0), 300.0, d) * escena.get('bump_roca', 1.0)
    sel = k > 0.02
    if not sel.any():
        return nx, ny, nz
    px, py, dd = buf['px'][sel], buf['py'][sel], d[sel]
    e = np.maximum(1.5, dd / 2500.0)
    # textura a escala proporcional a la distancia (aprox. LOD)
    sc = np.clip(dd / 600.0, 1.0, 6.0)
    tx0 = textura_mundo(px / sc - e, py / sc, dd * 0); tx1 = textura_mundo(px / sc + e, py / sc, dd * 0)
    ty0 = textura_mundo(px / sc, py / sc - e, dd * 0); ty1 = textura_mundo(px / sc, py / sc + e, dd * 0)
    gx = (tx1 - tx0) / (2 * e) * 14.0; gy = (ty1 - ty0) / (2 * e) * 14.0
    kk = k[sel]
    a = nx[sel] - gx * kk; b = ny[sel] - gy * kk; c = nz[sel] + 0.0
    n = np.sqrt(a * a + b * b + c * c)
    nx2, ny2, nz2 = nx.copy(), ny.copy(), nz.copy()
    nx2[sel] = a / n; ny2[sel] = b / n; nz2[sel] = c / n
    return nx2, ny2, nz2


# eje de la lengua del glaciar Gasherbrum Sur (cascada de hielo) trazado sobre el DEM: (x, y) en m
CASCADA_SUR = [(1000, -7300), (1200, -6800), (1450, -6500), (1350, -6200), (1100, -5900), (1050, -5600),
               (900, -5300), (850, -5000), (550, -4400), (150, -4100), (100, -3800)]


def mascara_cascada(px, py, ancho=520.0):
    """1 sobre la lengua de la cascada de hielo, 0 fuera (borde suave)."""
    dmin = np.full(px.shape, 1e9, np.float32)
    for (x0, y0), (x1, y1) in zip(CASCADA_SUR[:-1], CASCADA_SUR[1:]):
        vx, vy = x1 - x0, y1 - y0
        L2 = vx * vx + vy * vy
        t = np.clip(((px - x0) * vx + (py - y0) * vy) / L2, 0, 1)
        dx = px - (x0 + t * vx); dy = py - (y0 + t * vy)
        dmin = np.minimum(dmin, np.sqrt(dx * dx + dy * dy))
    return smooth(ancho * 1.45, ancho, dmin)


def angulo_caida(buf, cam):
    """Ángulo en pantalla (rad, convención atan2(dy_pantalla, dx_pantalla) con y hacia abajo) de la
    línea de máxima pendiente: los trazos de las caras siguen las canales."""
    nx, ny, nz = buf['nx'], buf['ny'], buf['nz']
    gx = -nx / np.maximum(nz, 0.05); gy = -ny / np.maximum(nz, 0.05)   # gradiente
    s = np.hypot(gx, gy) + 1e-6
    ex = buf['dist'] * 0.01 + 5.0
    X1 = buf['px'] - gx / s * ex; Y1 = buf['py'] - gy / s * ex; Z1 = buf['pz'] - s * ex
    u0, v0, _ = cam.proyectar(buf['px'], buf['py'], buf['pz'])
    u1, v1, _ = cam.proyectar(X1, Y1, Z1)
    ang = np.arctan2(v1 - v0, u1 - u0)
    return np.where(np.isfinite(ang), ang, np.pi / 2).astype(np.float32), s


def sombrear(buf, cam, niveles, extra, escena, rng):
    """Devuelve T (H,W,3 float32 0-255), reg (uint8), theta_def (rad), extras útiles."""
    P = PALETAS[escena.get('paleta', 'dia')]
    dlod = escena.get('dlod', 32000.0)
    H, W = buf['dist'].shape
    dist = buf['dist']
    terr = np.isfinite(dist)
    d = np.where(terr, dist, 1e7).astype(np.float32)
    mats = muestrear_mapas(buf, niveles, extra, ['margen', 'glaciar', 'derrubio', 'franja', 'tono', 'estrato', 'ao',
                                                 'seracs', 'pendb'], dlod, mapas_extra=mapas_ao(niveles, extra))
    sesgo = escena.get('nieve_sesgo', 7.0)          # >0: más nieve
    roca = smooth(sesgo - 2.5, sesgo + 3.0, mats['margen'])
    glac, deb, franja = mats['glaciar'], mats['derrubio'], mats['franja']
    # el derrubio solo cubre los troncos de glaciar casi llanos; las cascadas de hielo quedan limpias
    pend_px = mats['pendb']
    deb = deb * smooth(14.0, 7.0, pend_px) * (1 - np.clip(mats['seracs'] * 1.5, 0, 1))
    tono, estr, ao, serac = mats['tono'], mats['estrato'], mats['ao'], mats['seracs']
    # textura cercana en coordenadas de mundo (derrubio, ondas de viento en la nieve)
    tx = textura_mundo(buf['px'], buf['py'], d_ := np.where(np.isfinite(buf['dist']), buf['dist'], 1e7))
    cerca_t = smooth(escena.get('textura_d', 260.0), 25.0, d_)
    deb = np.clip(deb + (tx - 0.5) * 0.9 * cerca_t * smooth(0.05, 0.3, deb), 0, 1)
    franja = franja + (tx - 0.5) * 1.6 * cerca_t
    z = buf['pz']
    s = buf.get('sol', np.array([0.5, -0.5, 0.7]))
    nx_, ny_, nz_ = relieve_fino(buf, d, escena, 0.12 + 0.88 * deb)
    nx_, ny_, nz_ = relieve_roca(buf, d, escena, nx_, ny_, nz_, roca)
    lam = np.clip(nx_ * s[0] + ny_ * s[1] + nz_ * s[2], 0, 1)
    vis = buf.get('vis', np.ones_like(lam))
    luz = lam * (1 - 0.88 * (1 - vis))
    luz = luz * escena.get('intensidad_luz', 1.0)
    lit = smooth(0.30, 0.80, luz)[..., None]
    A = lambda k: np.array(P[k], np.float32)
    nieve = mix(A('ns'), A('nl'), lit)
    tono_r = (0.74 + 0.52 * np.clip(tono * 0.5 + 0.5, 0, 1))[..., None]
    roca_c = mix(A('rs'), A('rl') * tono_r, lit)
    roca_c = roca_c * (1 + 0.07 * estr[..., None] * smooth(0.3, 0.8, roca)[..., None])
    hielo = mix(A('hs'), A('hl'), lit)
    derr = mix(A('ds'), A('dl'), lit)
    # nieve fresca más blanca en lo alto; algo de roca asoma en la nieve lejana por textura
    col = mix(nieve, roca_c, roca[..., None])
    linea_firn = escena.get('linea_firn', 5450.0)
    g_bajo = (glac * smooth(linea_firn + 250, linea_firn - 150, z))[..., None]
    banda = np.clip(deb * (0.35 + 0.65 * smooth(-0.15, 0.55, franja)), 0, 1)
    # de cerca el glaciar cubierto es un mosaico de piedra y crestas de hielo
    manchas = smooth(0.26, 0.50, tx + 0.12 * franja)
    banda = mix(banda, deb * manchas, cerca_t * smooth(0.2, 0.5, deb))[..., None]
    glaciar_c = mix(hielo, derr, banda)
    col = mix(col, glaciar_c, g_bajo)
    # seracs: hielo azulado en las caras de las terrazas, blanco en sus techos
    cara = smooth(0.25, 0.7, 1 - buf['nz'])[..., None] * serac[..., None]
    col = mix(col, mix(np.array([70, 98, 150], np.float32), np.array([200, 222, 236], np.float32), lit), cara * 0.75)
    # cascada de hielo: grietas transversales (bandas por cota, rotas por ruido) y bloques de serac claros
    casc = mascara_cascada(buf['px'], buf['py']) * smooth(5.0, 9.0, pend_px) * smooth(36.0, 24.0, pend_px)
    casc = np.where(terr, casc, 0) * smooth(9000.0, 5000.0, d) * smooth(350.0, 800.0, d)
    if casc.max() > 0.01:
        tx2 = textura_mundo(buf['px'] / 3.0, buf['py'] / 3.0, d * 0)
        tx3 = textura_mundo(buf['px'] / 7.0 + 300, buf['py'] / 7.0 - 200, d * 0)
        q = (z + 26.0 * (tx2 - 0.5) * 2) / 4.5
        fq = q - np.floor(q)
        grieta = smooth(0.11, 0.0, fq) * smooth(0.30, 0.52, tx3)
        azul = mix(np.array([46, 70, 122], np.float32), np.array([92, 126, 178], np.float32), lit * 0.6)
        blanco = mix(A('hs'), A('nl'), lit)
        col = mix(col, blanco, (casc * 0.55)[..., None])
        col = mix(col, azul, (grieta * casc * 0.9)[..., None])
    # nieve cercana: ondas de viento (sastrugi) sutiles
    col = col * (1 + ((tx - 0.5) * 0.05 * cerca_t * (1 - roca))[..., None])
    # pedreras bajas (fuera del glaciar)
    ped = (deb * (1 - glac) * smooth(0.2, 0.6, roca + 0.3))[..., None]
    col = mix(col, derr * 1.05, ped * 0.8)
    # oclusión ambiental
    aoe = (ao * escena.get('ao_peso', 1.0))[..., None]
    col = col * (1 - 0.34 * aoe) + np.array([20, 28, 60], np.float32) * 0.34 * aoe
    # bruma por distancia (planos: más lejos = más claro, más azul, menos contraste)
    D = escena.get('bruma_D', 48000.0)
    hz = 1 - np.exp(-(d / D) ** 0.9)
    hz = escena.get('bruma_min', 0.04) + (1 - escena.get('bruma_min', 0.04)) * hz
    hz = hz + 0.16 * smooth(6200, 4300, z) * smooth(1500, 14000, d)      # bruma de valle
    hz = np.clip(hz * escena.get('bruma_k', 1.0), 0, 0.97)
    bruma_c = np.array(escena.get('bruma_color', P['bruma']), np.float32)
    col = mix(col, bruma_c, hz[..., None])
    if escena.get('paleta') == 'noche':
        # README §2.3: noche = mezcla oscura->clara por luminancia^1.35 (78 %) + 22 % del original teñido
        lum = np.clip((col[..., 0] * 0.299 + col[..., 1] * 0.587 + col[..., 2] * 0.114) / 255.0, 0, 1)
        noche = mix(np.array([8, 14, 38], np.float32), np.array([186, 202, 236], np.float32), (lum ** 1.35)[..., None])
        col = 0.78 * noche + 0.22 * col * np.array([0.40, 0.52, 0.90], np.float32)
    col = np.where(terr[..., None], col, 0)
    # regiones y dirección por defecto del trazo
    pend = np.degrees(np.arccos(np.clip(buf['nz'], -1, 1)))
    ang_caida, _ = angulo_caida(buf, cam)
    reg = np.zeros((H, W), np.uint8)
    cerca = d < escena.get('d_cerca', 900.0)
    lejos = d > escena.get('d_lejos', 45000.0)
    empinado = pend > 24
    reg[terr & ~cerca & empinado] = 2
    reg[terr & ~cerca & ~empinado] = 4
    reg[terr & cerca & empinado] = 3
    reg[terr & cerca & ~empinado] = 5
    reg[terr & lejos] = 4
    theta = np.full((H, W), np.nan, np.float32)
    caras = terr & empinado & (d < 60000)
    theta[caras] = ang_caida[caras]
    info = dict(roca=roca, glaciar=glac, z=z, d=d, hz=hz, lit=lit[..., 0], pend=pend)
    return col.astype(np.float32), reg, theta, info
