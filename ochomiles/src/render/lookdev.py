"""Desarrollo de look: renderiza varias vistas de una region en un solo proceso.

python3 -m src.render.lookdev <region> <out.jpg> <W> <H> "<peak,dist_km,bearing,alt,fov,sun_az,sun_el,exposure>" ...
"""
import json
import math
import os
import sys
import time

import cv2
import numpy as np

from .region import ROOT, RegionData
from .terrain_gl import Camera, TerrainRenderer


def main():
    region, out, W, H = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    views = sys.argv[5:]
    peaks = {p["id"]: p for p in json.load(open(os.path.join(ROOT, "config/peaks.json")))["peaks"]}
    rd = RegionData(region)
    r = TerrainRenderer(W, H, samples=4)
    imgs = []
    for v in views:
        pid, dist, bearing, alt, fov, saz, sel, expo = v.split(",")
        dist, bearing, alt, fov, saz, sel, expo = map(float, (dist, bearing, alt, fov, saz, sel, expo))
        t = rd.peak_xyz(peaks[pid])
        b = math.radians(bearing)
        cam_xy = t[:2] + dist * 1000 * np.array([math.sin(b), math.cos(b)])
        cam = Camera([cam_xy[0], cam_xy[1], alt], target=[t[0], t[1], t[2] - 900], fov_h=fov)
        t0 = time.time()
        sc = r.prepare(rd, t[:2] * 0.6 + cam_xy * 0.4, sun_az=saz, sun_el=sel, cam_alt=alt)
        t1 = time.time()
        img = r.render(sc, cam, exposure=expo)
        t2 = time.time()
        r.release(sc)
        print(f"{v}: preparar {t1-t0:.1f} s, render {t2-t1:.2f} s", flush=True)
        im = (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)
        cv2.putText(im, v, (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 220, 0), 2)
        imgs.append(im)
    cols = 2 if len(imgs) > 1 else 1
    rows = (len(imgs) + cols - 1) // cols
    sheet = np.zeros((rows * H, cols * W, 3), np.uint8)
    for i, im in enumerate(imgs):
        sheet[(i // cols) * H:(i // cols + 1) * H, (i % cols) * W:(i % cols + 1) * W] = im
    cv2.imwrite(out, sheet[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, 90])


if __name__ == "__main__":
    main()
