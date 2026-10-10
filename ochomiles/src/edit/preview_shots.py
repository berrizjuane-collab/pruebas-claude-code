"""Hojas de contacto de planos protagonistas: python3 -m src.edit.preview_shots 1 2 3 ..."""
import os
import sys
import time

import cv2
import numpy as np

from ..render.region import ROOT
from .film import HEROES
from .shot3d import ShotRenderer, project_points, region_peaks
from .timeline import chapter_start

OUT = os.path.join(ROOT, "data", "work", "shots")


def main():
    ks = [int(a) for a in sys.argv[1:]] or list(range(1, 15))
    os.makedirs(OUT, exist_ok=True)
    W, H = 768, 432
    sr = ShotRenderer(W, H)
    for k in ks:
        shot = HEROES[k - 1]
        t0 = time.time()
        tiles = []
        for u in (0, 72, 144, 215):
            f = chapter_start(k) + u
            img = sr.render(shot, f)
            im = (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)
            ids, pts = region_peaks(sr, shot["region"])
            for pid, (u_, v_, ok) in zip(ids, project_points(sr, shot, f, pts)):
                if ok:
                    col = (255, 170, 40) if pid == shot["peak"] else (120, 220, 255)
                    cv2.circle(im, (int(u_), int(v_)), 5, col, 2)
                    cv2.putText(im, pid, (int(u_) + 7, int(v_) - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, col, 1)
            cv2.putText(im, f"{shot['id']} {shot['peak']} u={u}", (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                        (255, 210, 0), 2)
            tiles.append(im)
        sheet = np.concatenate([np.concatenate(tiles[:2], 1), np.concatenate(tiles[2:], 1)], 0)
        cv2.imwrite(os.path.join(OUT, f"ch{k:02d}.jpg"), sheet[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, 88])
        print(f"ch{k:02d} {shot['peak']}: {time.time()-t0:.1f} s", flush=True)


if __name__ == "__main__":
    main()
