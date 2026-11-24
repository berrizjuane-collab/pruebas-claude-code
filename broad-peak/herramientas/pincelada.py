import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
out = sys.argv[1]; W, H = int(sys.argv[2]), int(sys.argv[3]); seed = int(sys.argv[4])
rng = np.random.default_rng(seed)
def ruido1d(n, esc, oct=4):
    v = np.zeros(n)
    for o in range(oct):
        k = max(2, int(n / esc * 2 ** o))
        c = rng.normal(0, 1, k + 3)
        v += np.interp(np.linspace(0, k, n), np.arange(k + 3), c) / 2 ** o
    return v / np.abs(v).max()
y = np.arange(H)
# cerdas: grupos de filas de 2-5 px con extremo propio
cerda = np.zeros(H); i = 0
while i < H:
    h = rng.integers(2, 6); cerda[i:i + h] = rng.normal(0, 1); i += h
xl = W * (0.045 + 0.022 * ruido1d(H, 300) + 0.018 * cerda + 0.012 * ruido1d(H, 40))
xr = W * (0.955 + 0.022 * ruido1d(H, 260) - 0.018 * np.roll(cerda, 7) - 0.012 * ruido1d(H, 37))
xx = np.arange(W)[None, :]
a = np.clip((xx - xl[:, None]) / (W * 0.03), 0, 1) * np.clip((xr[:, None] - xx) / (W * 0.03), 0, 1)
# bordes superior e inferior: cerdas que no llegan
v = (y / H)[:, None]
borde = np.clip(np.minimum(v, 1 - v) / 0.07, 0, 1)
keep = (rng.random(H) < 0.35 + 0.65 * borde[:, 0] ** 0.7)[:, None]
a = a * np.where(keep, 1.0, 0.0) * np.clip(borde * 1.6, 0, 1) ** 0.5
# textura seca interior: vetas horizontales
vetas = ndi.gaussian_filter(rng.normal(0, 1, (H, W)), (0.8, 40))
vetas = vetas / vetas.std()
a = a * np.clip(0.93 + 0.07 * vetas, 0.72, 1.0)
a = ndi.gaussian_filter(a, 0.6)
img = np.zeros((H, W, 4), np.uint8); img[..., :3] = 255; img[..., 3] = np.clip(a * 255, 0, 255).astype(np.uint8)
Image.fromarray(img, 'RGBA').save(out, 'WEBP', quality=82, method=6)
