"""Localizacion: 6 orientaciones por cumbre para elegir encuadres.

python3 -m src.render.scout [peak_id ...]
Salida: data/work/scout/<peak>.jpg (rejilla 3x2, rumbo desde la cumbre hacia la camara)
"""
import json
import math
import os
import sys
import time

import cv2
import numpy as np

from ..geo.regions import region_of
from .region import ROOT, RegionData
from .terrain_gl import Camera, TerrainRenderer

OUT = os.path.join(ROOT, "data", "work", "scout")


def main():
    peaks = {p["id"]: p for p in json.load(open(os.path.join(ROOT, "config/peaks.json")))["peaks"]}
    ids = sys.argv[1:] or list(peaks)
    os.makedirs(OUT, exist_ok=True)
    W, H = 960, 540
    r = TerrainRenderer(W, H, samples=4)
    cache = {}
    for pid in ids:
        reg = region_of(pid)
        if reg not in cache:
            cache.clear()
            cache[reg] = RegionData(reg)
        rd = cache[reg]
        t = rd.peak_xyz(peaks[pid])
        t0 = time.time()
        sc = r.prepare(rd, t[:2], sun_az=125.0, sun_el=14.0, cam_alt=t[2] - 1200)
        ims = []
        for bearing in (0, 60, 120, 180, 240, 300):
            b = math.radians(bearing)
            dist = 21000.0
            cam_xy = t[:2] + dist * np.array([math.sin(b), math.cos(b)])
            cam = Camera([cam_xy[0], cam_xy[1], t[2] - 1300], target=[t[0], t[1], t[2] - 1100], fov_h=36)
            img = r.render(sc, cam, exposure=7.0)
            im = (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)
            cv2.putText(im, f"{pid} rumbo {bearing}", (10, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 210, 0), 2)
            ims.append(im)
        r.release(sc)
        sheet = np.concatenate([np.concatenate(ims[:3], 1), np.concatenate(ims[3:], 1)], 0)
        cv2.imwrite(os.path.join(OUT, f"{pid}.jpg"), sheet[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, 85])
        print(f"{pid}: {time.time()-t0:.1f} s", flush=True)


if __name__ == "__main__":
    main()
