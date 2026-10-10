"""Linea de tiempo de la pelicula: 24 fps, 80 BPM en 4/4 (compas = 3 s = 72 fotogramas).

Fotogramas clave: listas de (fotograma_global, valor[, interpolacion]) donde la interpolacion
describe el tramo que EMPIEZA en esa clave: "smooth" (acelera y frena), "linear", "in"
(arranca suave), "out" (frena suave), "hold" (mantiene el valor hasta la clave siguiente).
"""
import math

import numpy as np

FPS = 24
BPM = 80
BEAT = 18            # fotogramas por pulso (0,75 s)
BAR = 72             # fotogramas por compas (3 s)
TOTAL = 4320         # 180 s
CHAPTER0 = 576       # el capitulo 1 empieza en el compas 9 (24 s)
CHAPTER_LEN = 216    # 9 s = 3 compases


def bar(n, beat=1, frac=0.0):
    """Fotograma del pulso `beat` (1..4) del compas `n` (1..60)."""
    return (n - 1) * BAR + (beat - 1) * BEAT + int(round(frac * BEAT))


def chapter_start(k):
    return CHAPTER0 + (k - 1) * CHAPTER_LEN


def ease(t, kind="smooth"):
    t = min(max(t, 0.0), 1.0)
    if kind == "linear":
        return t
    if kind == "in":           # arranca suave, llega con velocidad
        return t * t
    if kind == "out":          # sale con velocidad, frena suave
        return 1 - (1 - t) * (1 - t)
    if kind == "in3":
        return t * t * t
    if kind == "out3":
        return 1 - (1 - t) ** 3
    if kind == "hold":
        return 0.0
    if kind == "smooth5":      # perfil quintico (aceleracion continua)
        return t * t * t * (t * (6 * t - 15) + 10)
    return t * t * (3 - 2 * t)  # smooth


def track(keys, f, angle=False):
    """Evalua una pista de claves en el fotograma f. angle=True interpola por el camino corto."""
    if not isinstance(keys, (list, tuple)) or (keys and not isinstance(keys[0], (list, tuple))):
        return keys  # valor constante
    if f <= keys[0][0]:
        return keys[0][1]
    for i in range(len(keys) - 1):
        f0, v0 = keys[i][0], keys[i][1]
        f1, v1 = keys[i + 1][0], keys[i + 1][1]
        kind = keys[i][2] if len(keys[i]) > 2 else "smooth"
        if f0 <= f <= f1:
            t = ease((f - f0) / max(f1 - f0, 1e-9), kind)
            if isinstance(v0, (tuple, list, np.ndarray)):
                return tuple(a + (b - a) * t for a, b in zip(v0, v1))
            if angle:
                d = (v1 - v0 + 180.0) % 360.0 - 180.0
                return v0 + d * t
            return v0 + (v1 - v0) * t
    return keys[-1][1]


class Rig:
    """Camara relativa a un pivote (cumbre): rumbo desde el pivote hacia la camara (grados),
    distancia horizontal (m), altitud absoluta (m), punto mirado = pivote + (lx, ly, lz)."""

    def __init__(self, keys):
        self.keys = keys

    def at(self, f, pivot):
        k = self.keys
        b = math.radians(track(k["bearing"], f, angle=True))
        d = track(k["dist"], f)
        alt = track(k["alt"], f)
        lx = track(k.get("lx", 0.0), f)
        ly = track(k.get("ly", 0.0), f)
        lz = track(k.get("lz", -800.0), f)
        fov = track(k.get("fov", 40.0), f)
        roll = track(k.get("roll", 0.0), f)
        sx = track(k.get("shift_x", 0.0), f)
        sy = track(k.get("shift_y", 0.0), f)
        # desplazamiento lateral del pivote (travelling paralelo a la vista)
        px = track(k.get("px", 0.0), f)
        py = track(k.get("py", 0.0), f)
        cam = np.array([pivot[0] + px + d * math.sin(b), pivot[1] + py + d * math.cos(b), alt])
        tgt = np.array([pivot[0] + px + lx, pivot[1] + py + ly, pivot[2] + lz])
        return cam, tgt, fov, roll, (sx, sy)
