"""
ruta.py — lámina extra «La ruta»: vista aérea oblicua del macizo del Makalu sobre el DEM real,
pintada con la misma tubería que las seis láminas (T + reg → θ → pincel a SS× → acabado).

    python3 ruta.py preview  960 540  salida.png      (solo imagen objetivo T, rápido)
    python3 ruta.py paint   2560 1440 salida.png      (lámina final)

Además escribe salida.json con la posición en la imagen (fracción 0–1) de cada campo y cima,
y si cada punto queda a la vista (comparando con la distancia rasterizada).
"""
import os, sys, math, json, time
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from terrain import Terrain, Camera, raster, shade, PAL_DAY
from paint import Noise, sky, orientation, paint, finish, resize_f, log

DEM = os.path.join(HERE, 'data', 'makalu_dem_c.npz')

# (lat, lon, altitud oficial) — campos de la ruta normal (francesa, 1955) y cimas
POINTS = {
    'campo_base': (27.834, 87.075, 4870),
    'cba': (27.894167, 87.0475, 5674),            # campo base avanzado, N27°53′39″ E87°02′51″
    'campo_1': (27.912, 87.054, 6200),
    'campo_2': (27.914, 87.069, 6650),
    'campo_3': (27.910, 87.086, 7400),           # Makalu La
    'campo_4': (27.900, 87.087, 7650),
    'cumbre': (27.891667, 87.088333, 8485),
    'kangchungtse': (27.915, 87.079167, 7678),
    'chomo_lonzo': (27.93, 87.1075, 7804),
    'baruntse': (27.8725, 86.980833, 7129),
    'chamlang': (27.775833, 86.979167, 7321),
    'lhotse': (27.961667, 86.931667, 8516),
    'everest': (27.988333, 86.925833, 8849),
    'kangchenjunga': (27.706667, 88.149167, 8586),
    'jannu': (27.6875, 88.053333, 7710),
}

CAM = dict(x=-11990, y=-26819, z=12400, yaw=23, hfov=40, horizon=0.10, sun=(128, 36))


def setup(W, H):
    terr = Terrain(DEM)
    terr.set_cloud(level=3900, amp=320, lam=3000, seed=21, clear=[])
    cam = Camera(CAM['x'], CAM['y'], CAM['z'], CAM['yaw'], CAM['hfov'], W, H, CAM['horizon'])
    return terr, cam


def project_points(terr, cam, R, W, H):
    out = {}
    for k, (lat, lon, alt) in POINTS.items():
        x, y = terr.ll2xy(lat, lon)
        z = max(alt, float(terr.height(np.array([x]), np.array([y]))[0]))
        c, r, d = cam.project(np.array([x]), np.array([y]), np.array([z + 15]))
        c, r, d = float(c[0]), float(r[0]), float(d[0])
        vis = None
        ci, ri = int(round(c)), int(round(r))
        if 0 <= ci < W and 0 <= ri < H:
            # visible si nada del terreno está claramente delante en ese píxel (y alrededor)
            win = R['dist'][max(0, ri - 2):ri + 3, max(0, ci - 2):ci + 3]
            vis = bool(np.nanmax(win) > d * 0.97)
        out[k] = dict(u=round(c / W, 4), v=round(r / H, 4), dist_km=round(d / 1000, 2), visible=vis, alt=alt)
    return out


def render(mode, W, H, out, SS=2):
    t0 = time.time()
    rng = np.random.default_rng(8485)
    U = math.sqrt(W * H) / 1946.0
    terr, cam = setup(W, H)
    saz, sel = CAM['sun']
    terr.light_maps(saz, sel)
    log('  mapas de luz')
    R = raster(terr, cam, log=lambda *a: log(*a))
    pts = project_points(terr, cam, R, W, H)
    json.dump(dict(W=W, H=H, cam=CAM, points=pts), open(out.replace('.png', '.json'), 'w'), indent=1, ensure_ascii=False)
    for k, p in pts.items():
        log(f'  {k:14s} u={p["u"]:.3f} v={p["v"]:.3f} d={p["dist_km"]} km vis={p["visible"]}')
    T, reg, aux = shade(terr, cam, R, saz, sel, pal=PAL_DAY, haze_k=0.85, haze_far=95000, snowline=5350)
    nz = Noise(H, W, rng)
    skym = R['sky']
    S = sky(H, W, nz, 'day', v_base=float(np.clip(cam.cy / H, 0.12, 1.0)), glow_side='right', glow=0.30, cirrus=0.35)
    T[skym] = S[skym]
    reg[skym] = 0
    if mode == 'preview':
        Image.fromarray(np.clip(T, 0, 255).astype(np.uint8)).save(out)
        log(f'  preview {out} ({time.time() - t0:.0f} s)')
        return
    Wc, Hc = W * SS, H * SS
    T2 = np.stack([resize_f(T[..., k], Wc, Hc, Image.BILINEAR) for k in range(3)], -1)
    reg2 = np.asarray(Image.fromarray(reg).resize((Wc, Hc), Image.NEAREST))
    nzd = Noise(Hc, Wc, rng)
    theta = orientation(T2, reg2, U * SS, nzd.fbm(3, 3))
    log('  campo θ')
    canvas = paint(T2, reg2, theta, U, SS, rng)
    del theta, T2
    img = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))
    del canvas
    small = img.resize((W, H), Image.LANCZOS)
    fin = finish(np.asarray(small), reg, U, rng)
    fin.save(out)
    log(f'  listo {out} ({time.time() - t0:.0f} s)')


if __name__ == '__main__':
    mode, W, H, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
    render(mode, W, H, out)
