"""tiza.py — aplica a las nubes el mismo acabado de las ilustraciones: diente de papel, estrías de tiza
y algún hueco oscuro, más suave en la cara del texto para no restar legibilidad.
    python3 tiza.py <dir_nubes> <dir_salida> <ruta_render>"""
import sys, os, json, math
import numpy as np
from PIL import Image
from scipy import ndimage as nd
src, out, rdir = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, rdir)
from paint import stripes, blur, smooth, mix
os.makedirs(out, exist_ok=True)
meta = json.load(open(os.path.join(src, 'plantillas.json')))
for name, m in meta.items():
    im = np.asarray(Image.open(os.path.join(src, f'nube_{name}.webp')).convert('RGBA'), np.float32)
    H, W = im.shape[:2]
    rgb, A = im[..., :3], im[..., 3] / 255
    rng = np.random.default_rng(abs(hash(name)) % 2**31)
    U = 2.3   # sprites se muestran a ~½: trazos del mismo tamaño en pantalla que los de las pinturas
    # cara del texto: allí el acabado es más suave
    x0, x1 = m['left'] * W, W - m['right'] * W; y0, y1 = m['top'] * W, H - m['bottom'] * W
    cm = np.zeros((H, W), np.float32); cm[int(y0):int(y1), int(x0):int(x1)] = 1
    cm = blur(cm, 0.03 * math.sqrt(W * H))
    soft = 1 - 0.6 * cm
    g1 = blur(rng.normal(0, 1, (H, W)).astype(np.float32), 0.75 * U)
    g2 = blur(rng.normal(0, 1, (H, W)).astype(np.float32), 1.9 * U)
    tooth = 0.7 * g1 / (g1.std() + 1e-6) + 0.6 * g2 / (g2.std() + 1e-6)
    # estrías de tiza (mismos ángulos que las pinturas)
    s3, b3 = stripes(H, W, U, 60, 1.3, 7, 170, rng)
    sc = smooth(0.7, 1.9, s3 + 2.4 * (b3 - 0.5)) * smooth(0.1, 1.1, tooth)
    s4, b4 = stripes(H, W, U, 22, 0.9, 19, 110, rng)
    sc = np.maximum(sc, smooth(0.9, 2.0, s4 + 2.4 * (b4 - 0.5)) * smooth(0.2, 1.2, tooth))
    s5, b5 = stripes(H, W, U, 9, 1.6, -30, 70, rng)
    sc = np.maximum(sc, 0.8 * smooth(1.2, 2.2, s5 + 2.6 * (b5 - 0.5)) * smooth(0.3, 1.2, tooth))
    chalk = np.array((244, 240, 230), np.float32)
    lum0 = rgb.mean(-1)
    shade0 = 1 - smooth(170, 248, lum0)
    # tiza clara sobre las sombras (como en las pinturas) y trazo gris sobre las luces: así se ve también en lo blanco
    rgb = mix(rgb, mix(rgb, chalk, 0.42), np.clip(sc * (0.10 + 0.70 * shade0) * soft, 0, 1)[..., None])
    s6, b6 = stripes(H, W, U, 40, 1.1, 11, 140, rng)
    dark = smooth(1.0, 2.1, s6 + 2.2 * (b6 - 0.5)) * smooth(0.0, -1.2, tooth) * (1 - shade0)
    rgb = mix(rgb, np.array((176, 186, 204), np.float32), np.clip(dark * 0.50 * (1 - 0.88 * cm), 0, 1)[..., None])
    # huecos: el pincel seco deja ver el fondo en la sombra de la nube
    s1, b1 = stripes(H, W, U, 46, 1.5, 9, 150, rng)
    gap = smooth(0.9, 2.1, s1 + 2.0 * (b1 - 0.5)) * smooth(0.5, -0.9, tooth)
    shade = 1 - smooth(150, 245, rgb.mean(-1))          # más huecos en las zonas en sombra
    gapk = np.clip(gap * (0.25 + 0.75 * shade) * soft * 0.55 + 0.12 * smooth(-1.35, -2.1, tooth) * soft, 0, 1)
    rgb = mix(rgb, np.array((96, 104, 124), np.float32), (gapk * 0.6)[..., None])
    A = A * (1 - 0.35 * gapk)
    # diente del papel y borde quebrado (la tiza no deja bordes suaves perfectos)
    rgb = rgb * (1 + 0.06 * np.clip(tooth, -2.5, 2.5) * soft)[..., None]
    edge = smooth(0.0, 0.25, A) * smooth(0.9, 0.35, A)
    A = np.clip(A * (1 + edge * 0.55 * np.clip(tooth, -2, 2) * 0.5) - edge * 0.12 * smooth(0.2, -1.2, tooth), 0, 1)
    o = np.dstack([np.clip(rgb, 0, 255), np.clip(A * 255, 0, 255)]).astype(np.uint8)
    Image.fromarray(o, 'RGBA').save(os.path.join(out, f'nube_{name}.webp'), 'WEBP', quality=88, method=6, exact=True)
    print(name, flush=True)
json.dump(meta, open(os.path.join(out, 'plantillas.json'), 'w'), indent=1)
