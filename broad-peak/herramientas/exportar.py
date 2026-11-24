import sys, os, json, math, glob
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
SRC, DST = sys.argv[1], sys.argv[2]
solo = sys.argv[3].split(',') if len(sys.argv) > 3 else None
os.makedirs(os.path.join(DST, 'img'), exist_ok=True); os.makedirs(os.path.join(DST, 'data'), exist_ok=True)
ANCHOS = {'16:9': [2560, 1600], 'pano': [5120, 3200]}
DN, DF = 4.0, 90000.0
def disp_de(d):
    return float(1 - math.log(min(max(d, DN), DF) / DN) / math.log(DF / DN))
escenas = json.load(open(os.path.join(DST, 'data', 'escenas.json'))) if os.path.exists(os.path.join(DST, 'data', 'escenas.json')) else {}
for png in sorted(glob.glob(os.path.join(SRC, '*.png'))):
    base = os.path.splitext(os.path.basename(png))[0]
    if solo and base not in solo:
        continue
    im = Image.open(png).convert('RGB'); W, H = im.size
    tipo = 'pano' if W / H > 2.5 else '16:9'
    tam = {}
    for w in ANCHOS[tipo]:
        r = im.resize((w, round(H * w / W)), Image.LANCZOS)
        r.save(os.path.join(DST, 'img', f'{base}-{w}.webp'), 'WEBP', quality=80, method=6)
        r.save(os.path.join(DST, 'img', f'{base}-{w}.avif'), 'AVIF', quality=60, speed=4)
        tam[w] = (os.path.getsize(os.path.join(DST, 'img', f'{base}-{w}.webp')), os.path.getsize(os.path.join(DST, 'img', f'{base}-{w}.avif')))
    # profundidad: el primer plano se dilata un poco para que arrastre su contorno pintado, luego se suaviza
    d = np.load(os.path.join(SRC, base + '_disp.npy')).astype(np.float32)
    d = ndi.grey_dilation(d, size=(9, 9))
    dw = 1600 if tipo == 'pano' else 960
    dh = round(H * dw / W)
    dd = np.asarray(Image.fromarray(d).resize((dw, dh), Image.BOX), np.float32)
    dd = ndi.gaussian_filter(dd, 1.2)
    Image.fromarray(np.clip(dd * 255 + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(DST, 'img', f'{base}-prof.png'), optimize=True)
    # miniatura para el primer pintado
    im.resize((48, round(48 * H / W)), Image.LANCZOS).save(os.path.join(DST, 'img', f'{base}-mini.jpg'), quality=70)
    a = json.load(open(os.path.join(SRC, base + '_anclas.json')))
    pts = {}
    for p in a['puntos']:
        pts[p['nombre']] = dict(x=round(p['x'], 5), y=round(p['y'], 5), p=round(disp_de(p['d']), 4), v=p['visible'],
                                d=round(p['d']))
    ruta = [[round(r['x'], 5), round(r['y'], 5), round(disp_de(r['d']), 4), 1 if r['v'] else 0] for r in a['ruta'][::2]]
    escenas[base] = dict(asp=round(W / H, 5), w=W, h=H, anchos=ANCHOS[tipo], puntos=pts,
                         cam=dict(h=round(a['cam']['h']), rumbo=a['cam']['rumbo'], hfov=a['cam']['hfov']),
                         ruta=ruta if base == '07_ruta' else None)
    print(base, W, H, {k: (round(v[0] / 1024), round(v[1] / 1024)) for k, v in tam.items()}, 'KB (webp, avif)')
json.dump(escenas, open(os.path.join(DST, 'data', 'escenas.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
