"""Render de prueba de un plano fijo. Uso:
python3 -m src.render.test_render <region> <peak_id> <dist_km> <bearing_from_peak_deg> <cam_alt_m> <fov> <sun_az> <sun_el> <out.jpg> [W H]
"""
import math
import os
import sys
import time

import cv2
import numpy as np

from .region import RegionData, ROOT
from .terrain_gl import Camera, TerrainRenderer
import json


def main():
    a = sys.argv[1:]
    region, pid = a[0], a[1]
    dist, bearing, alt, fov, saz, sel = map(float, a[2:8])
    out = a[8]
    W, H = (int(a[9]), int(a[10])) if len(a) > 10 else (1920, 1080)
    peaks = {p["id"]: p for p in json.load(open(os.path.join(ROOT, "config/peaks.json")))["peaks"]}
    t0 = time.time()
    rd = RegionData(region)
    target = rd.peak_xyz(peaks[pid])
    b = math.radians(bearing)
    cam_xy = target[:2] + dist * 1000 * np.array([math.sin(b), math.cos(b)])
    cam = Camera([cam_xy[0], cam_xy[1], alt], target=[target[0], target[1], target[2] - 600], fov_h=fov)
    r = TerrainRenderer(W, H, samples=4)
    focus = (target[:2] * 0.65 + cam_xy * 0.35)
    scene = r.prepare(rd, focus, sun_az=saz, sun_el=sel, cam_alt=alt)
    print(f"preparado en {time.time()-t0:.1f} s", flush=True)
    t1 = time.time()
    img = r.render(scene, cam)
    print(f"render {W}x{H} en {time.time()-t1:.2f} s", flush=True)
    cv2.imwrite(out, (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, 92])


if __name__ == "__main__":
    main()
