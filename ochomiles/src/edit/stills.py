"""Fijos promocionales en 4K renderizados directamente (sin pasar por la compresion de video).

Uso: python -m src.edit.stills [f1,f2,f3]  -> render/final/fijos/*.png (8 bits) y *.jpg
"""
import os
import sys

import cv2

from ..render.region import ROOT
from .compose import Ctx, evaluate, to_uint8

OUT = os.path.join(ROOT, "render", "final", "fijos")
STILLS = {240: "01_amanecer_titulo", 520: "02_mapa_14_ochomiles", 3500: "03_everest_alpenglow"}


def main():
    from . import edl as edl_mod
    frames = [int(v) for v in sys.argv[1].split(",")] if len(sys.argv) > 1 else list(STILLS)
    os.makedirs(OUT, exist_ok=True)
    edl = edl_mod.build()
    ctx = Ctx(3840, 2160, samples=4)
    for f in frames:
        img = to_uint8(evaluate(edl, ctx, f), f)[..., ::-1]
        name = f"14_cumbres_{STILLS.get(f, f'f{f:04d}')}"
        cv2.imwrite(os.path.join(OUT, name + ".png"), img, [cv2.IMWRITE_PNG_COMPRESSION, 9])
        cv2.imwrite(os.path.join(OUT, name + ".jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 95])
        print("fijo", f, name, flush=True)


if __name__ == "__main__":
    main()
