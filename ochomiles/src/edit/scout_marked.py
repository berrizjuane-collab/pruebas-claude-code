"""Localizacion con marcas de cumbres: python3 -m src.edit.scout_marked <peak> <region> <dist> <alt> <fov> <sun_az> <sun_el> <b1,b2,...>"""
import math
import os
import sys

import cv2
import numpy as np

from ..render.region import ROOT
from .shot3d import ShotRenderer, project_points, region_peaks
from .timeline import Rig


def main():
    pid, region = sys.argv[1], sys.argv[2]
    dist, alt, fov, saz, sel = map(float, sys.argv[3:8])
    bearings = [float(b) for b in sys.argv[8].split(",")]
    W, H = 768, 432
    sr = ShotRenderer(W, H)
    tiles = []
    for b in bearings:
        shot = {"id": f"scout_{pid}_{b}", "peak": pid, "region": region, "start": 0, "end": 10,
                "rig": Rig({"bearing": b, "dist": dist, "alt": alt, "lz": -900.0, "fov": fov}),
                "sun": (saz, sel), "exposure": 7.0}
        sr.scenes.clear() if False else None
        img = sr.render(shot, 0)
        im = (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)
        ids, pts = region_peaks(sr, region)
        for q, (u_, v_, ok) in zip(ids, project_points(sr, shot, 0, pts)):
            if ok:
                col = (255, 170, 40) if q == pid else (120, 220, 255)
                cv2.circle(im, (int(u_), int(v_)), 5, col, 2)
                cv2.putText(im, q, (int(u_) + 7, int(v_) - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, col, 1)
        cv2.putText(im, f"{pid} rumbo {b:.0f}", (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 210, 0), 2)
        tiles.append(im)
    while len(tiles) % 3:
        tiles.append(np.zeros_like(tiles[0]))
    rows = [np.concatenate(tiles[i:i + 3], 1) for i in range(0, len(tiles), 3)]
    os.makedirs(os.path.join(ROOT, "data/work/scout"), exist_ok=True)
    cv2.imwrite(os.path.join(ROOT, f"data/work/scout/marked_{pid}.jpg"), np.concatenate(rows, 0)[..., ::-1],
                [cv2.IMWRITE_JPEG_QUALITY, 85])


if __name__ == "__main__":
    main()
