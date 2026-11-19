import sys, json, numpy as np
sys.path.insert(0, '.')
from scenes import SCENES, DEM
from terrain import Terrain, Camera, raster
W, H = 640, 360
out = {}
for name, sc in SCENES.items():
    terr = Terrain(DEM)
    cx, cy = sc['cam']
    if sc.get('pad'): terr.pad(cx, cy)
    if sc.get('cloud_layer'): terr.set_cloud(**sc['cloud_layer'])
    cz = float(terr.height(np.array([cx]), np.array([cy]))[0]) + sc['dz']
    cam = Camera(cx, cy, cz, sc['yaw'], sc['hfov'], W, H, sc['horizon'])
    R = raster(terr, cam, log=lambda *a: None)
    res = []
    for (nm, lat, lon, alt) in terr.peaks:
        x, y = terr.ll2xy(lat, lon)
        z = max(alt, float(terr.height(np.array([x]), np.array([y]))[0]))
        c, r, d = cam.project(np.array([x]), np.array([y]), np.array([z]))
        c, r, d = float(c[0]), float(r[0]), float(d[0])
        if not (0 <= c < W and 0 <= r < H) or d < 50: continue
        ci, ri = int(c), int(r)
        win = R['dist'][max(0, ri - 1):ri + 2, max(0, ci - 1):ci + 2]
        vis = bool(np.nanmax(win) > d * 0.95) or bool(R['sky'][max(0, ri - 3), ci])
        res.append(dict(name=str(nm), alt=int(alt), u=round(c / W, 4), v=round(r / H, 4), km=round(d / 1000, 1), visible=vis))
    out[name] = res
    print(name, [(p['name'], p['u'], p['v'], p['km'], p['visible']) for p in res], flush=True)
json.dump(out, open('../labels.json', 'w'), indent=1, ensure_ascii=False)
