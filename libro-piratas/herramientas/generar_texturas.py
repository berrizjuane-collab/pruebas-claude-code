"""Genera las texturas del libro a 300 ppp con la paleta del PDF original.

El original usaba texturas JPEG a 96 ppp (pergamino, fondo ahumado oscuro).
Aquí se recrean procedimentalmente (ruido fractal) con los mismos colores medidos
en el original, a resolución de imprenta:

  pergamino_pliego.jpg  -> fondo de pergamino para un pliego completo con sangrado
  oscuro_pliego.jpg     -> fondo ahumado oscuro (portadillas, introducción, legado)

Uso: python3 generar_texturas.py <carpeta_salida>
"""
import sys
import numpy as np
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
DPI = 300
MM = DPI / 25.4
TRIM_W, TRIM_H, BLEED = 219.12, 309.37, 3.0
rng = np.random.default_rng(1718)  # año de la muerte de Barbanegra


def fbm(h, w, octaves=6, base=3, persistence=0.55):
    """Ruido fractal: suma de capas de ruido suavizado a distintas escalas."""
    acc = np.zeros((h, w), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        cells = base * (2 ** o)
        gh, gw = max(2, int(cells * h / max(h, w)) + 2), max(2, int(cells * w / max(h, w)) + 2)
        g = rng.standard_normal((gh, gw)).astype(np.float32)
        img = Image.fromarray(g, mode="F").resize((w, h), Image.BICUBIC)
        acc += amp * np.asarray(img)
        total += amp
        amp *= persistence
    acc /= total
    return (acc - acc.mean()) / (acc.std() + 1e-6)


def blotches(h, w, n, rmin, rmax):
    """Manchas suaves y circulares, como las del pergamino original."""
    m = np.zeros((h, w), np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    small = 8
    hs, ws = h // small, w // small
    yy, xx = np.mgrid[0:hs, 0:ws].astype(np.float32)
    ms = np.zeros((hs, ws), np.float32)
    for _ in range(n):
        cy, cx = rng.uniform(0, hs), rng.uniform(0, ws)
        r = rng.uniform(rmin, rmax) / small
        d = np.sqrt((yy - cy) ** 2 + ((xx - cx) * rng.uniform(0.7, 1.3)) ** 2)
        ms += np.clip(1 - d / r, 0, 1) ** 1.6 * rng.uniform(0.4, 1.0)
    return np.asarray(Image.fromarray(ms, mode="F").resize((w, h), Image.BICUBIC))


def fibers(h, w, n):
    """Fibras finas del papel: detalle de alta frecuencia que se ve nítido al imprimir."""
    f = np.zeros((h, w), np.float32)
    for _ in range(n):
        y, x = rng.uniform(0, h), rng.uniform(0, w)
        ang = rng.uniform(0, np.pi)
        ln = rng.uniform(8, 40)
        for t in np.linspace(0, ln, int(ln * 2)):
            yi, xi = int(y + t * np.sin(ang)), int(x + t * np.cos(ang))
            if 0 <= yi < h and 0 <= xi < w:
                f[yi, xi] += 1
    return f


def compose(h, w, base, low_amp, grain_amp, blotch_amp, n_blotch, fiber_amp, vignette, edge_rgb):
    low = fbm(h, w, octaves=7, base=3)
    mid = fbm(h, w, octaves=4, base=24, persistence=0.5)
    grain = rng.standard_normal((h, w)).astype(np.float32)
    b = blotches(h, w, n_blotch, 0.02 * w, 0.07 * w) if n_blotch else 0
    fb = fibers(h, w, int(h * w / 9000)) if fiber_amp else 0
    lum = low * low_amp + mid * low_amp * 0.35 + grain * grain_amp - b * blotch_amp - fb * fiber_amp
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    ny, nx = (yy / h - 0.5) * 2, (xx / w - 0.5) * 2
    vig = np.clip((np.maximum(np.abs(nx) ** 3, np.abs(ny) ** 3)), 0, 1) * vignette
    base = np.array(base, np.float32)
    edge = np.array(edge_rgb, np.float32)
    rgb = base[None, None, :] * (1 - vig[..., None]) + edge[None, None, :] * vig[..., None]
    rgb = rgb + lum[..., None] * np.array([1.0, 0.95, 0.82], np.float32)[None, None, :]
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")


def save(img, name, q=86):
    img.save(f"{OUT}/{name}", quality=q, dpi=(DPI, DPI), optimize=True, subsampling=0)
    print(name, img.size)


if __name__ == "__main__":
    spread_w = int(round((2 * TRIM_W + 2 * BLEED) * MM))
    spread_h = int(round((TRIM_H + 2 * BLEED) * MM))
    # Pergamino (media del original: 231,215,179; bordes 212,196,160)
    save(compose(spread_h, spread_w, (232, 216, 178), 7.0, 2.2, 10, 26, 2.2, 0.0, (212, 196, 160)),
         "pergamino_pliego.jpg")
    # Oscuro ahumado (media del original: 28,21,15; bordes 17,10,6)
    save(compose(spread_h, spread_w, (30, 23, 17), 5.0, 1.4, 0, 0, 0, 0.55, (14, 9, 5)),
         "oscuro_pliego.jpg")
    # Nota: las notas no usan textura propia. Toman un fragmento de pergamino_pliego.jpg con una veladura clara,
    # porque los fondos en mosaico se exportan como patrones PDF y dejan costuras visibles.
