"""Evaluacion y render de planos 3D definidos en film.py."""
import json
import math
import os

import numpy as np

from ..render.region import ROOT, RegionData
from ..render.terrain_gl import Camera, TerrainRenderer
from .timeline import FPS, track

_PEAKS = None


def peaks():
    global _PEAKS
    if _PEAKS is None:
        _PEAKS = {p["id"]: p for p in json.load(open(os.path.join(ROOT, "config/peaks.json")))["peaks"]}
    return _PEAKS


class ShotRenderer:
    """Mantiene regiones y escenas preparadas para renderizar planos 3D fotograma a fotograma."""

    def __init__(self, W, H, samples=4, max_regions=2, max_scenes=3):
        self.r = TerrainRenderer(W, H, samples=samples)
        self.regions = {}
        self.scenes = {}
        self.max_regions = max_regions
        self.max_scenes = max_scenes
        self._use = 0
        self.cam_mod = None      # (camara, plano, f) -> camara: reencuadre (version vertical)

    def _touch(self, d, k):
        self._use += 1
        d[k]["_lru"] = self._use

    def region(self, name):
        if name not in self.regions:
            # como mucho dos regiones en memoria (fundidos entre regiones distintas)
            while len(self.regions) >= self.max_regions:
                old = min(self.regions, key=lambda n: self.regions[n]._lru)
                for sid in [k for k, sc in self.scenes.items() if sc["region"].name == old]:
                    self.r.release(self.scenes.pop(sid))
                del self.regions[old]
                for t in self.r._region_tex.pop(old, {}).values():
                    if hasattr(t, "release"):
                        t.release()
            self.regions[name] = RegionData(name)
        self._use += 1
        self.regions[name]._lru = self._use
        return self.regions[name]

    def pivot(self, shot):
        rd = self.region(shot["region"])
        if "pivot_xyz" in shot:
            return np.array(shot["pivot_xyz"], float)
        return rd.peak_xyz(peaks()[shot["peak"]])

    def camera(self, shot, f):
        if "camera_fn" in shot:          # camaras de transicion (subida/bajada cenital, latigazos)
            c = shot["camera_fn"](self, f)
        else:
            piv = self.pivot(shot)
            cam, tgt, fov, roll, shift = shot["rig"].at(f, piv)
            c = Camera(cam, target=tgt, fov_h=fov, roll=roll, shift=shift)
            c.up = shot.get("up", (0.0, 0.0, 1.0))
        return self.cam_mod(c, shot, f) if self.cam_mod else c

    def scene(self, shot):
        sid = shot["id"]
        if sid in self.scenes:
            self._touch(self.scenes, sid)
            self.region(shot["region"])
            return self.scenes[sid]
        while len(self.scenes) >= self.max_scenes:
            old = min(self.scenes, key=lambda k: self.scenes[k]["_lru"])
            self.r.release(self.scenes.pop(old))
        rd = self.region(shot["region"])
        mid = shot.get("prep_frame", (shot["start"] + shot["end"]) // 2)
        c = self.camera(shot, mid)
        piv = self.pivot(shot)
        focus = shot.get("focus")
        if focus is None:
            focus = piv[:2] * 0.6 + c.pos[:2] * 0.4
        az, el = shot["sun"][0], track(shot["sun"][1], mid) if isinstance(shot["sun"][1], list) else shot["sun"][1]
        cam_alt = float(min(c.pos[2], 12000.0))
        sc = self.r.prepare(rd, focus, sun_az=az, sun_el=el, cam_alt=cam_alt, haze=shot.get("haze", 1.0))
        sc["shot"] = sid
        sc["sun_el_cur"] = el
        self.scenes[sid] = sc
        self._touch(self.scenes, sid)
        return sc

    def render(self, shot, f, **extra):
        sc = self.scene(shot)
        c = self.camera(shot, f)
        el = shot["sun"][1]
        alt = float(min(max(c.pos[2], 1000.0), 60000.0))
        if isinstance(el, list):
            elv = track(el, f)
            if abs(elv - sc["sun_el_cur"]) > 0.02:
                self.r.set_sun(sc, elv, alt)
                sc["sun_el_cur"] = elv
        if abs(math.log(alt / max(sc["cam_alt_lut"], 1.0))) > 0.3:
            # camara subiendo o bajando: el cielo se recalcula para la nueva altitud
            self.r.set_sun(sc, sc["sun_el_cur"], alt)
        t = (f - shot["start"]) / FPS
        clouds = shot.get("clouds")
        if clouds:
            clouds = dict(clouds)
            w = clouds.pop("wind", (0.0, 0.0))
            clouds["off"] = (w[0] * t * 20.0, w[1] * t * 20.0)
        kw = dict(exposure=track(shot.get("exposure", 8.0), f), clouds=clouds, fog=shot.get("fog"),
                  sky_boost=shot.get("sky_boost", 1.35), stars=track(shot.get("stars", 0.0), f),
                  style=track(shot.get("style", 0.0), f), grade=shot.get("grade"))
        kw.update(extra)
        return self.r.render(sc, c, **kw)


def project_points(sr, shot, f, pts_xyz):
    """Proyecta puntos del mundo (TM local) a pixeles; devuelve (u, v, visible_por_delante)."""
    from ..render.terrain_gl import R_EFF
    c = sr.camera(shot, f)
    W, H = sr.r.W, sr.r.H
    view, proj = c.matrices(W / H)
    out = []
    for p in pts_xyz:
        rel = np.array(p, float) - c.pos
        rel[2] -= (rel[0] ** 2 + rel[1] ** 2) / (2 * R_EFF)
        clip = proj @ view @ np.array([rel[0], rel[1], rel[2], 1.0])
        if clip[3] <= 0:
            out.append((None, None, False))
            continue
        ndc = clip[:3] / clip[3]
        out.append(((ndc[0] * 0.5 + 0.5) * W, (1 - (ndc[1] * 0.5 + 0.5)) * H, abs(ndc[0]) <= 1 and abs(ndc[1]) <= 1))
    return out


def region_peaks(sr, region):
    from ..geo.regions import REGIONS
    rd = sr.region(region)
    pk = peaks()
    ids = [i for i in pk if i in REGIONS[region]["peaks"]]
    return ids, [rd.peak_xyz(pk[i]) for i in ids]


def clearance_report(shot, sr, step=24):
    """Altura de la camara sobre el terreno a lo largo del plano (detecta camaras dentro del relieve)."""
    rd = sr.region(shot["region"])
    worst = (1e9, None)
    for f in range(shot["start"], shot["end"] + 1, step):
        c = sr.camera(shot, f)
        h = float(rd.height(np.array([c.pos[0]]), np.array([c.pos[1]]))[0])
        if c.pos[2] - h < worst[0]:
            worst = (c.pos[2] - h, f)
    return worst
