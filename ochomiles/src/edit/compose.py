"""Compositor de la pelicula: evalua las capas del montaje (edl.py) fotograma a fotograma,
dibuja los graficos y entrega imagenes RGB en espacio de pantalla.

Uso:
  python -m src.edit.compose --res 960x540 --range 0:4320 --out render/preview.mp4
  python -m src.edit.compose --res 3840x2160 --frames 700,1500 --stills render/stills
"""
import argparse
import math
import os
import subprocess
import sys
import time

import cv2
import numpy as np

from ..render.region import ROOT
from ..render.typo import Layer as SkLayer, composite, default_fonts
from .timeline import FPS, TOTAL


class Ctx:
    """Recursos compartidos por las capas (se crean al primer uso)."""

    def __init__(self, W, H, samples=4):
        self.W, self.H = W, H
        self.k = W / 3840.0                 # factor de los graficos (disenados a 4K)
        self.samples = samples
        self._sr = None
        self._map = None
        self._loc = None
        self.fonts = default_fonts()
        self.cache = {}

    @property
    def sr(self):
        if self._sr is None:
            from .shot3d import ShotRenderer
            self._sr = ShotRenderer(self.W, self.H, samples=self.samples)
        return self._sr

    @property
    def peaks_ordered(self):
        from .film import PEAK_ORDER
        from .shot3d import peaks
        pk = peaks()
        return [pk[i] for i in PEAK_ORDER]

    @property
    def mapart(self):
        if self._map is None:
            from ..render.mapdraw import MapArt
            self._map = MapArt(self.fonts, self.peaks_ordered)
        return self._map

    @property
    def locator(self):
        if self._loc is None:
            from ..render.overlays import Locator
            self._loc = Locator(self.peaks_ordered)
        return self._loc


def evaluate(edl, ctx, f):
    """Imagen final del fotograma f."""
    layers = [L for L in edl.layers if L.start <= f <= L.end]
    ops = []
    for L in layers:
        a = L.opacity(f)
        if a > 0.002:
            ops.append((L, a))
    # desde la capa opaca mas alta hacia arriba (lo de debajo no se ve)
    first = 0
    for i in range(len(ops) - 1, -1, -1):
        L, a = ops[i]
        if a >= 0.999 and L.mask is None:
            first = i
            break
    img = np.zeros((ctx.H, ctx.W, 3), np.float32)
    for L, a in ops[first:]:
        if getattr(L, "needs_below", False):
            im = L.render_with(ctx, f, img)
        else:
            im = L.render(ctx, f)
        if L.mask is not None:
            m = L.mask(ctx, f) * a
            img = img * (1 - m[..., None]) + im * m[..., None]
        elif a >= 0.999:
            img = im
        else:
            img = img * (1 - a) + im * a
    # graficos
    sk = SkLayer(ctx.W, ctx.H)
    sk.canvas.scale(ctx.k, ctx.k)
    drew = False
    for ov in edl.overlays:
        if ov.start <= f <= ov.end:
            drew |= bool(ov.draw(sk.canvas, ctx, f, img))
    if drew:
        img = composite(img, sk.array())
    for post in edl.post:
        img = post(ctx, f, img)
    return img


def to_uint8(img, f, dither=True):
    x = np.clip(img, 0, 1) * 255.0
    if dither:
        rng = np.random.default_rng(f * 7919 + 13)
        x = x + rng.uniform(-0.5, 0.5, x.shape[:2])[..., None].astype(np.float32)
    return np.clip(x + 0.5, 0, 255).astype(np.uint8)


# conversion RGB -> YUV con matriz BT.709 (la que suponen los reproductores en HD y 4K) y etiquetas
COLOR_TAGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]


def to_uint16(img):
    return (np.clip(img, 0, 1) * 65535.0 + 0.5).astype(np.uint16)


def ffmpeg_writer(path, W, H, crf=16, preset="medium", audio=None, mezz=False):
    """mezz=False: H.264 8 bits 4:2:0 (revision). mezz=True: intermedio de alta calidad
    H.264 High 4:2:2 10 bits (familia XAVC) a partir de RGB de 16 bits, para el master."""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    pix_in = "rgb48le" if mezz else "rgb24"
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", pix_in, "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-"]
    if audio:
        cmd += ["-i", audio, "-c:a", "aac", "-b:a", "320k", "-shortest"]
    if mezz:
        cmd += ["-vf", "zscale=matrix=709:range=limited:dither=error_diffusion,format=yuv422p10le",
                "-c:v", "libx264", "-profile:v", "high422", "-preset", preset, "-crf", str(crf),
                "-g", "48", "-keyint_min", "24", *COLOR_TAGS, path]
    else:
        cmd += ["-vf", "zscale=matrix=709:range=limited:dither=error_diffusion,format=yuv420p",
                "-c:v", "libx264", "-preset", preset, "-crf", str(crf), *COLOR_TAGS,
                "-movflags", "+faststart", path]
    return subprocess.Popen(cmd, stdin=subprocess.PIPE)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--res", default="960x540")
    ap.add_argument("--range", default=None, help="a:b (b excluido)")
    ap.add_argument("--frames", default=None, help="lista separada por comas")
    ap.add_argument("--step", type=int, default=1)
    ap.add_argument("--out", default=None)
    ap.add_argument("--stills", default=None)
    ap.add_argument("--samples", type=int, default=4)
    ap.add_argument("--crf", type=int, default=18)
    ap.add_argument("--preset", default="medium")
    ap.add_argument("--mezz", action="store_true", help="intermedio 10 bits 4:2:2 (render final)")
    ap.add_argument("--png", action="store_true", help="fijos en PNG de 16 bits en vez de JPEG")
    args = ap.parse_args()
    W, H = (int(v) for v in args.res.split("x"))
    from . import edl as edl_mod
    edl = edl_mod.build()
    ctx = Ctx(W, H, samples=args.samples)
    if args.frames:
        frames = [int(v) for v in args.frames.split(",")]
    else:
        a, b = (int(v) for v in (args.range or f"0:{TOTAL}").split(":"))
        frames = list(range(a, b, args.step))
    writer = ffmpeg_writer(args.out, W, H, crf=args.crf, preset=args.preset, mezz=args.mezz) if args.out else None
    if args.stills:
        os.makedirs(args.stills, exist_ok=True)
    t0 = time.time()
    for i, f in enumerate(frames):
        img = evaluate(edl, ctx, f)
        if writer:
            if args.mezz:
                writer.stdin.write(to_uint16(img).tobytes())
            else:
                writer.stdin.write(to_uint8(img, f).tobytes())
        if args.stills:
            if args.png:
                cv2.imwrite(os.path.join(args.stills, f"f{f:04d}.png"), to_uint16(img)[..., ::-1])
            else:
                cv2.imwrite(os.path.join(args.stills, f"f{f:04d}.jpg"), to_uint8(img, f)[..., ::-1],
                            [cv2.IMWRITE_JPEG_QUALITY, 93])
        if i % 24 == 0 or i == len(frames) - 1:
            el = time.time() - t0
            print(f"[compose] {i+1}/{len(frames)} f={f} {el/(i+1):.2f} s/fot", flush=True)
    if writer:
        writer.stdin.close()
        if writer.wait() != 0:
            sys.exit("[compose] ffmpeg termino con error")


if __name__ == "__main__":
    main()
