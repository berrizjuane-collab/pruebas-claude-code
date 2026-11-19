"""Variantes verticales de las piedras para pantallas estrechas: misma receta y semilla,
otra proporción (no se estira ni se recorta la piedra original)."""
import sys, os, json
sys.path.insert(0, '.')
import numpy as np
from PIL import Image
import piedras as P
MOBILE = {
    'losa': ((480, 640), (0.11, 0.09, 0.89, 0.91)),
    'cuarteada': ((480, 420), (0.08, 0.15, 0.92, 0.85)),
    'laja': ((480, 620), (0.15, 0.15, 0.82, 0.82)),
    'veta': ((480, 600), (0.12, 0.10, 0.88, 0.90)),
    'escarcha': ((480, 600), (0.10, 0.19, 0.90, 0.90)),
    'brasa': ((480, 300), (0.08, 0.20, 0.92, 0.80)),
    'antigua': ((480, 640), (0.13, 0.11, 0.87, 0.89)),
}
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
meta = {}
for name, (size, box) in MOBILE.items():
    P.SPECS[name]['size'] = size
    P.SPECS[name]['box'] = box
    im, boxm = P.make(name, 2)
    im.save(os.path.join(out, f'piedra_{name}-m@2x.webp'), 'WEBP', quality=84, method=6)
    a = np.asarray(im); sel = (boxm > 0.9) & (a[..., 3] > 250)
    px = a[..., :3][sel].astype(np.float64); lum = P.rel_lum(px)
    light = px[np.argsort(lum)[int(len(lum) * 0.97)]]
    meta[name] = dict(css_px=list(size), caja_frac=list(box), contraste_medio=round(P.contrast(P.BONE, px.mean(0)), 1),
                      contraste_peor=round(P.contrast(P.BONE, light), 1))
    print(name, meta[name], flush=True)
json.dump(meta, open(os.path.join(out, 'piedras_m.json'), 'w'), indent=1)
