"""Tipos de capa del montaje y graficos superpuestos."""
import math

import numpy as np

from .timeline import track


class Layer:
    def __init__(self, start, end, opacity=1.0, mask=None, name=""):
        self.start, self.end = int(start), int(end)
        self._op = opacity
        self.mask = mask
        self.name = name

    def opacity(self, f):
        if callable(self._op):
            return float(self._op(f))
        return float(track(self._op, f))

    def render(self, ctx, f):
        raise NotImplementedError


class Shot3D(Layer):
    """Plano 3D (dict de film.py). extra(f) -> kwargs adicionales para el render (estilo, etc.).
    blur: n subfotogramas para desenfoque de movimiento (o funcion f -> n)."""

    def __init__(self, shot, start=None, end=None, opacity=1.0, mask=None, extra=None, blur=None, fx=None):
        super().__init__(shot["start"] if start is None else start, shot["end"] if end is None else end,
                         opacity, mask, shot["id"])
        self.shot = shot
        self.extra = extra
        self.blur = blur
        self.fx = fx

    def render(self, ctx, f):
        kw = self.extra(f) if self.extra else {}
        n = self.blur(f) if callable(self.blur) else (self.blur or 1)
        if n and n > 1:
            # obturador de 180 grados: subfotogramas en [f - 0.25, f + 0.25]
            acc, first, last = None, None, None
            for i in range(n):
                fs = f + (i + 0.5) / n * 0.5 - 0.25
                im = ctx.sr.render(self.shot, fs, **kw)
                if i == 0:
                    first = im.copy()
                last = im
                acc = im.copy() if acc is None else acc + im
            img = fill_motion_gaps(acc / n, first, last, n)
        else:
            img = ctx.sr.render(self.shot, f, **kw)
        if self.fx:
            img = self.fx(ctx, f, img)
        return img


def fill_motion_gaps(img, first, last, n):
    """Los n subfotogramas dejan copias discretas cuando el movimiento es rapido (barrido).
    Se estima el desplazamiento entre el primero y el ultimo por correlacion de fase y se
    aplica un desenfoque lineal de la longitud de un paso: muestras + caja = integral continua."""
    import cv2
    q = 4
    h, w = img.shape[:2]
    a = cv2.resize(first.mean(axis=2).astype(np.float32), (w // q, h // q), interpolation=cv2.INTER_AREA)
    b = cv2.resize(last.mean(axis=2).astype(np.float32), (w // q, h // q), interpolation=cv2.INTER_AREA)
    win = cv2.createHanningWindow(a.shape[::-1], cv2.CV_32F)
    (dx, dy), _ = cv2.phaseCorrelate(a, b, win)
    dx, dy = dx * q, dy * q
    step = math.hypot(dx, dy) / max(n - 1, 1)
    if step < 1.5:
        return img
    L = int(math.ceil(step)) | 1
    k = np.zeros((L, L), np.float32)
    c = L // 2
    ux, uy = dx / math.hypot(dx, dy), dy / math.hypot(dx, dy)
    for t in np.linspace(-c, c, 4 * L):
        k[int(round(c + t * uy)), int(round(c + t * ux))] += 1.0
    k /= k.sum()
    return cv2.filter2D(img, -1, k, borderType=cv2.BORDER_REPLICATE)


class Fn(Layer):
    def __init__(self, start, end, fn, opacity=1.0, mask=None, name="fn"):
        super().__init__(start, end, opacity, mask, name)
        self.fn = fn

    def render(self, ctx, f):
        return self.fn(ctx, f)


class Solid(Layer):
    def __init__(self, start, end, color=(0, 0, 0), opacity=1.0, name="solid"):
        super().__init__(start, end, opacity, None, name)
        self.color = np.array(color, np.float32)

    def render(self, ctx, f):
        return np.broadcast_to(self.color, (ctx.H, ctx.W, 3)).copy()


class Overlay:
    def __init__(self, start, end, draw, name=""):
        self.start, self.end = int(start), int(end)
        self._draw = draw
        self.name = name

    def draw(self, canvas, ctx, f, img):
        return self._draw(canvas, ctx, f, img)


def ramp(f, a, b, kind="smooth"):
    """0 antes de a, 1 despues de b, suave entre medias."""
    if b <= a:
        return 1.0 if f >= a else 0.0
    t = min(max((f - a) / (b - a), 0.0), 1.0)
    if kind == "linear":
        return t
    return t * t * (3 - 2 * t)


def window(f, a, b, c, d):
    """Sube de a a b, se mantiene, baja de c a d."""
    return min(ramp(f, a, b), 1.0 - ramp(f, c, d))


class FX(Layer):
    """Capa de efecto con su propia alfa (nubes, ventisca). fn(ctx, f, below) -> (rgb, alfa).
    'below' es la imagen ya compuesta bajo la capa (para tomar su paleta)."""

    needs_below = True

    def __init__(self, start, end, fn, name="fx"):
        super().__init__(start, end, 1.0, None, name)
        self.fn = fn
        self._cache = (None, None, None)
        self.mask = self._mask

    def render_with(self, ctx, f, below):
        rgb, a = self.fn(ctx, f, below)
        self._cache = (f, rgb, a)
        return rgb

    def render(self, ctx, f):
        return self.render_with(ctx, f, None)

    def _mask(self, ctx, f):
        return self._cache[2] if self._cache[0] == f else np.zeros((ctx.H, ctx.W), np.float32)


class CampShot(Shot3D):
    """Plano 3D con luces de campamento proyectadas desde coordenadas reales del glaciar
    (oclusion con el mapa de profundidad del render)."""

    def __init__(self, shot, lights, on, **kw):
        super().__init__(shot, **kw)
        self.lights = lights          # (N, 3) mundo; (N, 3) color; (N,) intensidad; (N,) fase
        self.on = on                  # f -> 0..1 encendido

    def render(self, ctx, f):
        import cv2
        from .shot3d import project_points
        kw = self.extra(f) if self.extra else {}
        img, aux = ctx.sr.render(self.shot, f, return_aux=True, **kw)
        on = float(self.on(f))
        if on <= 0.002:
            return img
        P, C, I, ph = self.lights
        H, W = img.shape[:2]
        layer = np.zeros((H, W, 3), np.float32)
        c = ctx.sr.camera(self.shot, f)
        uvs = project_points(ctx.sr, self.shot, f, list(P))
        k = ctx.k
        for i, (u, v, ok) in enumerate(uvs):
            if u is None or not ok:
                continue
            iu, iv = int(u), int(v)
            if not (0 <= iu < W and 0 <= iv < H):
                continue
            d = float(np.linalg.norm(P[i] - c.pos))
            if d > aux[iv, iu, 3] + 40.0:          # tapada por el relieve
                continue
            fl = 0.88 + 0.12 * np.sin(f * 0.21 + ph[i]) * np.sin(f * 0.07 + 2 * ph[i])
            cv2.circle(layer, (int(u * 16), int(v * 16)), max(int(16 * 1.2 * k), 8),
                       tuple(float(x) * I[i] * fl * on for x in C[i]), -1, cv2.LINE_AA, shift=4)
        glow = cv2.GaussianBlur(layer, (0, 0), 1.0 * k + 0.4) * 1.4 + cv2.GaussianBlur(layer, (0, 0), 7 * k + 1) * 1.8 \
            + cv2.GaussianBlur(layer, (0, 0), 26 * k + 2) * 1.2
        return img + glow
