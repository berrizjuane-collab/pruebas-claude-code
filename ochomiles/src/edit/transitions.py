"""Camaras y efectos de transicion.

orbit_rise / orbit_dive: la camara orbita hacia arriba alrededor de la cumbre (que queda
centrada) mientras se aleja en escala logaritmica hasta mirar al nadir, con el norte
arriba; es el enlace entre el plano 3D y el atlas 2D (y al reves).
"""
import math

import numpy as np

from ..render.terrain_gl import Camera
from .mapcam import map_cam_for_nadir
from .timeline import ease

D_TOP = 8.0e5          # distancia a la cumbre en el punto cenital (m): ~584 km de anchura con 40 grados


def _sph(v):
    d = float(np.linalg.norm(v))
    el = math.asin(max(-1.0, min(1.0, v[2] / d)))
    az = math.atan2(v[0], v[1])
    return d, el, az


def _lerp_ang(a, b, t):
    d = (b - a + math.pi) % (2 * math.pi) - math.pi
    return a + d * t


def orbit_camera(hero_cam, pivot, s, d_top=D_TOP, fov_top=40.0, psi_top=0.0, rot_from=0.72):
    """Mezcla entre la camara del plano (s=0) y la cenital sobre el pivote (s=1)."""
    s = min(max(s, 0.0), 1.0)
    tgt0 = hero_cam.target if hero_cam.target is not None else hero_cam.pos + np.asarray(hero_cam.fwd) * 1000.0
    v0 = hero_cam.pos - tgt0
    d0, el0, az0 = _sph(v0)
    st = ease(min(s / 0.6, 1.0), "smooth")                     # el objetivo pasa a la cumbre
    tgt = tgt0 + (np.asarray(pivot, float) - tgt0) * st
    sd = ease(s, "in")                                          # alejamiento logaritmico
    d = math.exp(math.log(d0) + (math.log(d_top) - math.log(d0)) * sd)
    se = ease(min(s / 0.8, 1.0), "smooth")                     # cabeceo hacia el nadir
    el = el0 + (math.radians(89.999) - el0) * se
    pos = tgt + d * np.array([math.cos(el) * math.sin(az0), math.cos(el) * math.cos(az0), math.sin(el)])
    heading = az0 + math.pi                                     # direccion de la vista
    sr = ease((s - rot_from) / (1 - rot_from), "smooth") if s > rot_from else 0.0
    psi = _lerp_ang(heading, math.radians(psi_top), sr)
    phi = el                                                    # inclinacion bajo el horizonte
    up = (math.sin(psi) * math.sin(phi), math.cos(psi) * math.sin(phi), math.cos(phi))
    fov = hero_cam.fov_h + (fov_top - hero_cam.fov_h) * ease(s, "smooth")
    c = Camera(pos, target=tgt, fov_h=fov, roll=hero_cam.roll * (1 - s),
               shift=tuple(v * (1 - s) for v in hero_cam.shift))
    c.up = up
    height = pos[2] - 9000.0
    c.near = max(15.0, 0.3 * height) if height > 0 else 15.0
    c.far = max(2.4e6, d * 2.5)
    c.psi = psi
    return c


def hero_camera(sr, shot, f):
    piv = sr.pivot(shot)
    cam, tgt, fov, roll, shift = shot["rig"].at(f, piv)
    c = Camera(cam, target=tgt, fov_h=fov, roll=roll, shift=shift)
    c.up = shot.get("up", (0.0, 0.0, 1.0))
    return c


def yaw_camera(c, deg):
    """Gira la direccion de la vista alrededor de la vertical de la camara (panoramica)."""
    if abs(deg) < 1e-6:
        return c
    a = math.radians(-deg)            # grados positivos: giro a la derecha (sentido horario)
    rel = c.target - c.pos
    x, y = rel[0], rel[1]
    rel = np.array([x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a), rel[2]])
    c2 = Camera(c.pos, target=c.pos + rel, fov_h=c.fov_h, roll=c.roll, shift=c.shift)
    c2.up = getattr(c, "up", (0.0, 0.0, 1.0))
    return c2


def push_camera(c, meters):
    """Avance (o retroceso) a lo largo de la direccion de la vista."""
    if abs(meters) < 1e-6:
        return c
    rel = c.target - c.pos
    d = rel / np.linalg.norm(rel)
    c2 = Camera(c.pos + d * meters, target=c.target + d * meters, fov_h=c.fov_h, roll=c.roll, shift=c.shift)
    c2.up = getattr(c, "up", (0.0, 0.0, 1.0))
    return c2


class CameraPlan:
    """Camara de un plano protagonista con subida al mapa al final y/o bajada al principio,
    y modificadores de transicion (panoramicas, latigazos, avances)."""

    def __init__(self, shot):
        self.shot = shot
        self.rise = None     # (f0, f1)
        self.dive = None     # (f0, f1)
        self.mods = []       # funciones (f, cam) -> cam

    def __call__(self, sr, f):
        self.sr = sr
        c = self._base(sr, f)
        for m in self.mods:
            c = m(f, c)
        return c

    def _base(self, sr, f):
        hero = hero_camera(sr, self.shot, f)
        piv = sr.pivot(self.shot)
        if self.dive and f < self.dive[1]:
            f0, f1 = self.dive
            s = 1.0 - (f - f0) / (f1 - f0)
            return orbit_camera(hero, piv, s)
        if self.rise and f > self.rise[0]:
            f0, f1 = self.rise
            s = (f - f0) / (f1 - f0)
            return orbit_camera(hero, piv, s)
        return hero

    def map_cam(self, sr, f, W=3840):
        """Camara 2D equivalente al estado cenital del plano en f (solo valida con s ~ 1)."""
        c = self._base(sr, f)
        piv = sr.pivot(self.shot)
        mc = map_cam_for_nadir(self.shot["region"], (piv[0], piv[1]), float(piv[2]) - 2500.0,
                               float(c.pos[2]), c.fov_h, W)
        mc["rot"] = mc["rot"] - math.degrees(getattr(c, "psi", 0.0))
        return mc


def ndc_of(c, p, aspect=16 / 9):
    """Coordenadas normalizadas de pantalla (-1..1) de un punto del mundo para la camara c."""
    from ..render.terrain_gl import R_EFF
    view, proj = c.matrices(aspect)
    rel = np.asarray(p, float) - c.pos
    rel[2] -= (rel[0] ** 2 + rel[1] ** 2) / (2 * R_EFF)
    clip = proj @ view @ np.array([rel[0], rel[1], rel[2], 1.0])
    return clip[:2] / clip[3]


def summit_match_mod(src_plan, dst_plan, b, settle=60):
    """Corte por correspondencia: en el primer fotograma del plano B su cumbre ocupa el lugar
    exacto de la cumbre del plano A en el ultimo; el desplazamiento optico se disuelve luego."""
    cache = {}

    def mod(f, c):
        if f >= b + settle:
            return c
        if "s" not in cache:
            sr = dst_plan.sr
            ca = src_plan._base(sr, b - 1)
            for m in src_plan.mods:
                ca = m(b - 1, ca)
            na = ndc_of(ca, sr.pivot(src_plan.shot))
            nb_ = ndc_of(dst_plan._base(sr, b), sr.pivot(dst_plan.shot))
            cache["s"] = ((nb_[0] - na[0]) / 2.0, (nb_[1] - na[1]) / 2.0)
        sx, sy = cache["s"]
        k = 1.0 - ease(min(max((f - b) / settle, 0.0), 1.0), "smooth")
        c2 = Camera(c.pos, target=c.target, fov_h=c.fov_h, roll=c.roll,
                    shift=(c.shift[0] + sx * k, c.shift[1] + sy * k))
        c2.up = getattr(c, "up", (0.0, 0.0, 1.0))
        return c2

    return mod
