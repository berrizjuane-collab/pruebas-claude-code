"""Proyecta cumbres y puntos de la ruta sobre cada lámina (cámara real del código de reconstrucción)
y exporta mapas de profundidad para el parallax de la web.

Uso: python -I analizar.py <dir_recon> <dir_salida> [escenas]
"""
import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

RECON = os.path.abspath(sys.argv[1])
OUT = os.path.abspath(sys.argv[2])
sys.path.insert(0, RECON)
os.chdir(RECON)
import escenas as ESC
from render3d import render, camara_equivalente, CamaraInclinada
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ruta_cfg
ruta_cfg.registrar(ESC)

if len(sys.argv) > 3:
    exec_extra = sys.argv[3]
else:
    exec_extra = None

W, H = 1920, 1080          # coordenadas de las láminas web
DW, DH = 960, 540          # resolución del mapa de profundidad

T, M, G = ESC.mundo()

# (clave, nombre, lat, lon, cota oficial, radio de búsqueda del máximo local en m)
CUMBRES = [
    ('everest', 'Everest', 27.98806, 86.92521, 8849, 60),
    ('lhotse', 'Lhotse', 27.9617, 86.9333, 8516, 250),
    ('lhotse_shar', 'Lhotse Shar', 27.9590, 86.9439, 8383, 250),
    ('nuptse', 'Nuptse', 27.9675, 86.8869, 7861, 300),
    ('changtse', 'Changtse', 28.0250, 86.9144, 7543, 300),
    ('pumori', 'Pumori', 28.0151, 86.8283, 7161, 300),
    ('makalu', 'Makalu', 27.8897, 87.0886, 8485, 300),
    ('kangchenjunga', 'Kangchenjunga', 27.7025, 88.1475, 8586, 600),
    ('cho_oyu', 'Cho Oyu', 28.0942, 86.6608, 8188, 400),
    ('ama_dablam', 'Ama Dablam', 27.8614, 86.8614, 6812, 300),
    ('baruntse', 'Baruntse', 27.8717, 86.9792, 7129, 300),
    ('chomo_lonzo', 'Chomo Lonzo', 27.9306, 87.1083, 7804, 400),
    ('chamlang', 'Chamlang', 27.7750, 86.9800, 7319, 400),
    ('kangtega', 'Kangtega', 27.7958, 86.8253, 6782, 300),
    ('thamserku', 'Thamserku', 27.7869, 86.7883, 6623, 300),
    ('gyachung_kang', 'Gyachung Kang', 28.0981, 86.7422, 7952, 400),
]

RUTA = np.load(os.path.join(RECON, 'datos', 'ruta_osm.npy'))  # lat, lon, z
HITOS_RUTA = [  # (clave, nombre, cota objetivo, índice aproximado)
    ('campo_base', 'Campo Base', 5364, None),
    ('cascada', 'Cascada del Khumbu', 5750, None),
    ('campo1', 'Campo 1', 6065, None),
    ('campo2', 'Campo 2', 6400, None),
    ('campo3', 'Campo 3', 7160, None),
    ('collado_sur', 'Collado Sur', 7906, None),
    ('balcon', 'El Balcón', 8400, None),
    ('cima_sur', 'Cima Sur', 8749, None),
    ('escalon_hillary', 'Escalón Hillary', 8790, None),
    ('cumbre', 'Cumbre', 8849, None),
]


def snap_max(lat, lon, rad):
    E, N = ESC.utm(lat, lon)
    if rad <= 0:
        return E, N, float(M.altura(np.array([E]), np.array([N]))[0])
    g = np.linspace(-rad, rad, 41)
    EE, NN = np.meshgrid(E + g, N + g)
    ok = np.hypot(EE - E, NN - N) <= rad
    z = M.altura(EE.ravel(), NN.ravel()).reshape(EE.shape)
    z = np.where(ok, z, -1e9)
    i = np.unravel_index(np.argmax(z), z.shape)
    return float(EE[i]), float(NN[i]), float(z[i])


def collado_norte():
    """Collado Norte: punto más bajo de la cresta entre el Changtse y la arista norte."""
    E1, N1, _ = snap_max(28.0250, 86.9144, 300)
    E2, N2 = ESC.utm(28.0060, 86.9290)  # arista norte ~7 600 m
    best = None
    for t in np.linspace(0.1, 0.9, 161):
        Ec, Nc = E1 + t * (E2 - E1), N1 + t * (N2 - N1)
        dx, dy = -(N2 - N1), (E2 - E1)
        L = np.hypot(dx, dy); dx, dy = dx / L, dy / L
        s = np.linspace(-250, 250, 51)
        z = M.altura(Ec + s * dx, Nc + s * dy)
        k = int(np.argmax(z))
        cand = (float(z[k]), float(Ec + s[k] * dx), float(Nc + s[k] * dy))
        if best is None or cand[0] < best[0]:
            best = cand
    z, E, N = best
    return E, N, z


PUNTOS = {}
for clave, nombre, la, lo, cota, rad in CUMBRES:
    E, N, z = snap_max(la, lo, rad)
    PUNTOS[clave] = dict(nombre=nombre, E=E, N=N, z=z, cota=cota, tipo='cumbre')
Ec, Nc, zc = collado_norte()
PUNTOS['collado_norte'] = dict(nombre='Collado Norte', E=Ec, N=Nc, z=zc, cota=7020, tipo='collado')
RE, RN = ESC.TU.transform(RUTA[:, 1], RUTA[:, 0])
RE, RN = np.array(RE), np.array(RN)
for clave, nombre, cota, j in HITOS_RUTA:
    zz = RUTA[:, 2] + 39.0  # datum: el modelo queda ~39 m por debajo de las cotas oficiales
    if j is None:
        j = int(np.argmin(np.abs(zz - cota)))
    PUNTOS['ruta_' + clave] = dict(nombre=nombre, E=float(RE[j]), N=float(RN[j]),
                                   z=float(M.altura(np.array([RE[j]]), np.array([RN[j]]))[0]), cota=cota, tipo='ruta', j=int(j))
print('collado norte', Ec, Nc, zc)


def buffers(cfg):
    cam_final = ESC.camara(cfg, DW, DH)
    if isinstance(cam_final, CamaraInclinada):
        cam, X2, Y2 = camara_equivalente(cam_final)
    else:
        cam = cam_final; X2 = Y2 = None
    buf = render(M, cam, rho_min=cfg.get('rho_min', 4.0), paso_min=cfg.get('paso_min', 1.0))
    dist = np.where(np.isfinite(buf['dist']), buf['dist'], 1e9).astype(np.float32)
    if X2 is not None:
        dist = ndi.map_coordinates(dist, [Y2, X2], order=0, mode='nearest')
    return dist


def proyectar_todo(nombre, cfg, dist):
    cam = ESC.camara(cfg, W, H)
    res = {}
    for clave, p in PUNTOS.items():
        x, y, fwd = cam.proyectar(np.array([p['E']]), np.array([p['N']]), np.array([p['z'] + 2.0]))
        x, y, fwd = float(x[0]), float(y[0]), float(fwd[0])
        if fwd <= 1 or not (-0.02 * W <= x <= 1.02 * W and -0.02 * H <= y <= 1.02 * H):
            continue
        rho = float(np.hypot(p['E'] - cam.E, p['N'] - cam.N))
        # visibilidad: algún píxel en un entorno pequeño ve tan lejos como el punto
        xi, yi = int(np.clip(x / W * DW, 0, DW - 1)), int(np.clip(y / H * DH, 0, DH - 1))
        win = dist[max(0, yi - 2):yi + 3, max(0, xi - 2):xi + 3]
        vis = bool(win.max() >= 0.96 * rho - 40)
        res[clave] = dict(nombre=p['nombre'], x=round(x / W, 4), y=round(y / H, 4), dist_km=round(rho / 1000, 2),
                          visible=vis, cota=p['cota'], tipo=p['tipo'])
    return res


def ruta_2d(cfg, dist):
    cam = ESC.camara(cfg, W, H)
    z = M.altura(RE, RN) + 3.0
    x, y, fwd = cam.proyectar(RE, RN, z)
    rho = np.hypot(RE - cam.E, RN - cam.N)
    pts = []
    for k in range(len(RE)):
        xi, yi = int(np.clip(x[k] / W * DW, 0, DW - 1)), int(np.clip(y[k] / H * DH, 0, DH - 1))
        win = dist[max(0, yi - 1):yi + 2, max(0, xi - 1):xi + 2]
        vis = bool(win.max() >= 0.95 * rho[k] - 60) and fwd[k] > 1
        pts.append([round(float(x[k] / W), 5), round(float(y[k] / H), 5), int(vis), round(float(RUTA[k, 2] + 39.0), 1)])
    return pts


def mapa_profundidad(dist, salida):
    d = dist.copy()
    cielo = d >= 1e8
    dmin = max(1.0, float(np.percentile(d[~cielo], 2))) if np.any(~cielo) else 1.0
    dmax = 80000.0
    v = (np.log(dmax) - np.log(np.clip(d, dmin, dmax))) / (np.log(dmax) - np.log(dmin))
    v[cielo] = 0.0
    v = ndi.grey_dilation(v, size=(5, 5))      # el primer plano "gana" en los bordes: sin desgarros
    v = ndi.gaussian_filter(v, 2.2)
    Image.fromarray((np.clip(v, 0, 1) * 255).astype(np.uint8)).save(salida)
    return dmin


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    nombres = (exec_extra.split(',') if exec_extra else list(ESC.ESCENAS))
    todo = {}
    for n in nombres:
        cfg = ESC.ESCENAS[n]
        dist = buffers(cfg)
        dmin = mapa_profundidad(dist, os.path.join(OUT, f'prof_{n}.png'))
        cam = ESC.camara(cfg, W, H)
        todo[n] = dict(puntos=proyectar_todo(n, cfg, dist), cam=dict(rumbo=cfg['rumbo'], hfov=cfg['hfov'], pos=cfg['pos']))
        if n == 'ruta':
            todo[n]['ruta'] = ruta_2d(cfg, dist)
            zz = RUTA[:, 2] + 39.0
            d3 = np.sqrt(np.diff(RE) ** 2 + np.diff(RN) ** 2 + np.diff(zz) ** 2)
            cum = np.concatenate([[0], np.cumsum(d3[::-1])])[::-1]   # km desde el Campo Base
            todo[n]['perfil'] = [[round(float(cum[k]) / 1000, 3), round(float(zz[k]), 1)] for k in range(len(zz))]
            todo[n]['hitos'] = {c: int(PUNTOS['ruta_' + c]['j']) for c, *_ in HITOS_RUTA}
        vis = {k: (v['x'], v['y']) for k, v in todo[n]['puntos'].items() if v['visible']}
        print(n, 'dmin', round(dmin, 1), 'visibles:', vis)
    prev = {}
    pj = os.path.join(OUT, 'proyecciones.json')
    if os.path.exists(pj):
        prev = json.load(open(pj))
    prev.update(todo)
    json.dump(prev, open(pj, 'w'), ensure_ascii=False, indent=1)
