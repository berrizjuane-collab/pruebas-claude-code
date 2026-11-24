import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
out = sys.argv[1]; W, H = 2400, 240
rng = np.random.default_rng(5)


def ruido1d(n, esc, oct=4):
    v = np.zeros(n)
    for o in range(oct):
        k = max(2, int(n / esc * 2 ** o)); c = rng.normal(0, 1, k + 3)
        v += np.interp(np.linspace(0, k, n), np.arange(k + 3), c) / 2 ** o
    return v / np.abs(v).max()


borde = H * (0.58 + 0.07 * ruido1d(W, 500) + 0.03 * ruido1d(W, 60))
yy = np.arange(H)[:, None]
a = np.clip((borde[None, :] - yy) / (H * 0.10), 0, 1)
vetas = ndi.gaussian_filter(rng.normal(0, 1, (H, W)), (1.0, 60)); vetas /= vetas.std()
cerca = np.clip(1 - (borde[None, :] - yy) / (H * 0.32), 0, 1)
a = a * np.clip(1 - cerca * np.clip(0.55 - 0.45 * vetas, 0, 1), 0, 1)
a = a * np.clip(0.94 + 0.06 * vetas, 0.75, 1)
a = ndi.gaussian_filter(a, 0.6)
a = np.maximum(a, (yy < borde[None, :] * 0.62).astype(float))
img = np.zeros((H, W, 4), np.uint8); img[..., :3] = 255; img[..., 3] = np.clip(a * 255, 0, 255).astype(np.uint8)
Image.fromarray(img, 'RGBA').save(out, 'WEBP', quality=80, method=6)
