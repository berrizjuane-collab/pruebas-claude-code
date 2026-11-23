"""Prepara las plantillas de la identidad «Chomolungma» para la web.

* Copia las 14 plantillas WebP.
* Corta el cordel en cuerda + 10 banderas sueltas (cada una ondea por su cuenta).
* Separa la vara inferior de los thangkas para animar el desenrollado.
* Escribe img/plantillas.json con las cajas de texto y las piezas.

Uso: python -I preparar_plantillas.py <carpeta_plantillas> <carpeta_img_salida>
"""
import sys, os, json, glob, shutil
import numpy as np
from PIL import Image

SRC, OUT = map(os.path.abspath, sys.argv[1:3])
os.makedirs(os.path.join(OUT, 'plantillas'), exist_ok=True)
meta = {}

for p in sorted(glob.glob(os.path.join(SRC, '*.webp'))):
    n = os.path.splitext(os.path.basename(p))[0]
    shutil.copy(p, os.path.join(OUT, 'plantillas', n + '.webp'))
    j = os.path.join(SRC, n + '.json')
    if os.path.exists(j):
        meta[n] = json.load(open(j))


def guardar(arr, ruta):
    Image.fromarray(arr).save(ruta, 'WEBP', quality=88, method=6)


# ------------------------------------------------------------------ cordel
im = np.asarray(Image.open(os.path.join(SRC, 'cordel_banderas.webp')).convert('RGBA')).copy()
H, W = im.shape[:2]
a = im[..., 3]
cov = (a[60:, :] > 128).sum(0)
on = cov > 20
runs, s = [], None
for x, v in enumerate(on):
    if v and s is None:
        s = x
    if not v and s is not None:
        runs.append((s, x)); s = None
if s is not None:
    runs.append((s, W))
cuerda = im.copy()
banderas = []
for i, (x0, x1) in enumerate(runs):
    x0p, x1p = max(0, x0 - 2), min(W, x1 + 2)
    filas = np.flatnonzero((a[:, x0p:x1p] > 10).any(1))
    y0, y1 = int(filas.min()), int(filas.max()) + 1
    trozo = im[y0:y1, x0p:x1p].copy()
    guardar(trozo, os.path.join(OUT, 'plantillas', f'bandera_{i}.webp'))
    cuerda[:, x0p:x1p, 3] = 0
    # fila de la cuerda en el centro de la bandera (punto de anclaje para el giro)
    xc = (x0 + x1) // 2
    sup = np.flatnonzero(a[:, xc] > 128)
    ancla = int(sup.min()) if sup.size else y0
    banderas.append(dict(x=round(x0p / W * 100, 3), y=round(y0 / H * 100, 3), w=round((x1p - x0p) / W * 100, 3),
                         h=round((y1 - y0) / H * 100, 3), ancla=round((ancla - y0) / (y1 - y0) * 100, 2)))
guardar(cuerda, os.path.join(OUT, 'plantillas', 'cordel_cuerda.webp'))
meta['cordel_banderas']['banderas'] = banderas

# ------------------------------------------------------------------ thangkas: tela + vara inferior
for n in ['thangka_granate', 'thangka_lapis', 'thangka_velo']:
    im = np.asarray(Image.open(os.path.join(SRC, n + '.webp')).convert('RGBA')).copy()
    H, W = im.shape[:2]
    a = im[..., 3]
    cov = (a > 128).sum(1) / W
    filas = np.flatnonzero(cov > 0.02)
    ultima = int(filas.max())
    # la vara es más ancha que el brocado: filas inferiores con cobertura máxima
    ref = np.median(cov[int(H * 0.3):int(H * 0.6)])
    vara = np.flatnonzero(cov[:ultima + 1] > ref + 0.05)
    vara = vara[vara > H * 0.6]
    v0 = int(vara.min()); v1 = int(vara.max()) + 1
    corte = v0 + (v1 - v0) // 2          # la tela termina escondida detrás de la vara
    tela = im.copy(); tela[corte:, :, 3] = 0
    pieza = im.copy(); pieza[:v0 - 2, :, 3] = 0
    pieza = pieza[max(0, v0 - 2):min(H, v1 + 40)]
    guardar(tela, os.path.join(OUT, 'plantillas', n + '_tela.webp'))
    guardar(pieza, os.path.join(OUT, 'plantillas', n + '_vara.webp'))
    meta[n]['vara'] = dict(arriba=round((v0 - 2) / H * 100, 3), alto=round(pieza.shape[0] / H * 100, 3),
                           corte=round(corte / H * 100, 3))
    print(n, 'vara filas', v0, v1)

json.dump(meta, open(os.path.join(OUT, 'plantillas.json'), 'w'), ensure_ascii=False, indent=1)
print('banderas', len(banderas))
