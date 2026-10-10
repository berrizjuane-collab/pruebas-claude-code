"""Atmosfera fisica simplificada: dispersion simple Rayleigh + Mie, absorcion de ozono.

Proporciona, para cada plano:
  - una LUT de radiancia del cielo (azimut relativo al sol x elevacion) vista desde la camara,
  - una LUT de profundidad optica (altitud x coseno cenital) para la transmitancia hacia el sol,
  - la irradiancia del cielo en armonicos esfericos L1 (luz ambiente direccional).
Unidades: radiancia relativa (sol en el exterior = 1). Coordenadas: z arriba.
"""
import math

import numpy as np

R_EARTH = 6360e3
R_TOP = 6420e3
BETA_R = np.array([5.802e-6, 13.558e-6, 33.100e-6])
H_R = 8000.0
BETA_M_SCA = 3.996e-6
BETA_M_EXT = 4.440e-6
H_M = 1200.0
G_MIE = 0.80
OZONE = np.array([0.650e-6, 1.881e-6, 0.085e-6])
SUN_E0 = np.array([1.0, 0.985, 0.955])
SUN_ANGULAR_RADIUS = math.radians(0.2675)


def densities(h):
    """h: altitud (m) -> (rayleigh, mie, ozono) normalizadas."""
    dr = np.exp(-np.clip(h, 0, None) / H_R)
    dm = np.exp(-np.clip(h, 0, None) / H_M)
    do = np.clip(1.0 - np.abs(h - 25000.0) / 15000.0, 0, None)
    return dr, dm, do


def ray_sphere(r0, mu, R):
    """distancia desde un punto a radio r0 con coseno mu (respecto a la vertical) hasta la esfera R."""
    b = r0 * mu
    c = r0 * r0 - R * R
    disc = b * b - c
    return -b + np.sqrt(np.clip(disc, 0, None)), disc


class Atmosphere:
    def __init__(self, haze=1.0, ozone=1.0):
        self.haze = haze
        self.ozone = ozone
        self._build_od_lut()

    # ---- profundidad optica hacia el espacio: tabla (altitud, mu) ----
    def _build_od_lut(self, nh=64, nmu=128, steps=48):
        """Dos tablas: od (hacia el sol: nula si la Tierra lo tapa) y odv (vision: hasta el
        suelo o el techo de la atmosfera, continua a traves del horizonte)."""
        hs = (np.linspace(0, 1, nh) ** 2) * 60000.0
        mus = np.linspace(-0.35, 1.0, nmu)
        H, MU = np.meshgrid(hs, mus, indexing="ij")
        r0 = R_EARTH + H
        d_top, _ = ray_sphere(r0, MU, R_TOP)
        b = r0 * MU
        c = r0 * r0 - R_EARTH * R_EARTH
        disc = b * b - c
        hits = (MU < 0) & (disc > 0)
        d_ground = np.where(hits, -b - np.sqrt(np.clip(disc, 0, None)), d_top)
        d = np.minimum(d_top, d_ground)
        t = (np.arange(steps) + 0.5) / steps
        od = np.zeros(H.shape + (3,))
        for ti in t:
            s_ = d * ti
            r = np.sqrt(r0 * r0 + s_ * s_ + 2 * r0 * s_ * MU)
            h = r - R_EARTH
            dr, dm, do = densities(h)
            ds = d / steps
            od += (BETA_R[None, None, :] * dr[..., None]
                   + self.haze * BETA_M_EXT * dm[..., None]
                   + self.ozone * OZONE[None, None, :] * do[..., None]) * ds[..., None]
        self.odv = od.astype(np.float32)
        od_sun = od.copy()
        od_sun[hits] = 50.0
        self.od_h = hs
        self.od_mu = mus
        self.od = od_sun.astype(np.float32)

    def optical_depth(self, h, mu):
        h = np.clip(h, 0, 60000.0)
        mu = np.clip(mu, -0.35, 1.0)
        fh = np.sqrt(h / 60000.0) * (len(self.od_h) - 1)
        fm = (mu + 0.35) / 1.35 * (len(self.od_mu) - 1)
        i0 = np.clip(np.floor(fh).astype(int), 0, len(self.od_h) - 2)
        j0 = np.clip(np.floor(fm).astype(int), 0, len(self.od_mu) - 2)
        a = (fh - i0)[..., None]
        b = (fm - j0)[..., None]
        od = (self.od[i0, j0] * (1 - a) * (1 - b) + self.od[i0 + 1, j0] * a * (1 - b)
              + self.od[i0, j0 + 1] * (1 - a) * b + self.od[i0 + 1, j0 + 1] * a * b)
        return od

    def sun_transmittance(self, h, sun_el_rad):
        return np.exp(-self.optical_depth(np.asarray(h, float), np.sin(sun_el_rad)))

    # ---- radiancia del cielo ----
    def sky(self, cam_h, view_dirs, sun_dir, steps=40):
        """view_dirs: (...,3) unitarios; sun_dir: (3,). Devuelve radiancia (...,3)."""
        v = view_dirs.reshape(-1, 3)
        r0 = R_EARTH + cam_h
        mu = v[:, 2]
        d_top, _ = ray_sphere(r0, mu, R_TOP)
        b = r0 * mu
        c = r0 * r0 - R_EARTH * R_EARTH
        disc = b * b - c
        d_ground = np.where((mu < 0) & (disc > 0), -b - np.sqrt(np.clip(disc, 0, None)), np.inf)
        d = np.minimum(d_top, d_ground)
        cos_t = v @ sun_dir
        pr = 3.0 / (16 * math.pi) * (1 + cos_t ** 2)
        g = G_MIE
        pm = 3.0 / (8 * math.pi) * ((1 - g * g) * (1 + cos_t ** 2)) / ((2 + g * g) * (1 + g * g - 2 * g * cos_t) ** 1.5)
        lr = np.zeros((len(v), 3))
        lm = np.zeros((len(v), 3))
        od_view = np.zeros((len(v), 3))
        # muestreo no uniforme (mas denso cerca de la camara)
        u = (np.arange(steps) + 0.5) / steps
        tt = u ** 2
        dt = np.diff(np.concatenate([[0], ((np.arange(steps) + 1) / steps) ** 2]))
        for ti, dti in zip(tt, dt):
            s = d * ti
            ds = d * dti
            px = v * s[:, None]
            pz = r0 + px[:, 2]
            r = np.sqrt(px[:, 0] ** 2 + px[:, 1] ** 2 + pz ** 2)
            h = r - R_EARTH
            dr, dm, do = densities(h)
            ext = (BETA_R[None, :] * dr[:, None] + self.haze * BETA_M_EXT * dm[:, None]
                   + self.ozone * OZONE[None, :] * do[:, None])
            od_view += ext * ds[:, None] * 0.5
            up = np.stack([px[:, 0] / r, px[:, 1] / r, pz / r], 1)
            mu_s = up @ sun_dir
            t_sun = np.exp(-self.optical_depth(h, mu_s))
            t_view = np.exp(-od_view)
            od_view += ext * ds[:, None] * 0.5
            lr += (t_view * t_sun) * (dr * ds)[:, None]
            lm += (t_view * t_sun) * (dm * ds)[:, None]
        L = SUN_E0[None, :] * (lr * BETA_R[None, :] * pr[:, None]
                               + lm * self.haze * BETA_M_SCA * pm[:, None])
        return L.reshape(view_dirs.shape)

    def sky_lut(self, cam_h, sun_el_rad, n_az=256, n_el=192):
        """LUT (n_el, n_az, 3): azimut relativo al sol 0..pi (simetrico), elevacion -12..90 grados
        con mas resolucion cerca del horizonte."""
        az = np.linspace(0, math.pi, n_az)
        v = np.linspace(0, 1, n_el)
        el = np.radians(-12 + 102 * v ** 2)
        AZ, EL = np.meshgrid(az, el)
        dirs = np.stack([np.cos(EL) * np.sin(AZ), np.cos(EL) * np.cos(AZ), np.sin(EL)], -1)
        sun = np.array([0.0, math.cos(sun_el_rad), math.sin(sun_el_rad)])
        L = self.sky(cam_h, dirs, sun)
        return L.astype(np.float32)

    def sky_irradiance_sh(self, cam_h, sun_el_rad, n=48):
        """Coeficientes SH L1 (4, 3) de la radiancia del cielo (solo hemisferio superior,
        el inferior se aproxima con el rebote del terreno en el shader). Sol en azimut 0 (+y)."""
        u = (np.arange(n) + 0.5) / n
        th = np.arccos(u)               # elevacion via cos cenital uniforme
        ph = (np.arange(2 * n) + 0.5) / (2 * n) * 2 * math.pi
        TH, PH = np.meshgrid(th, ph, indexing="ij")
        dirs = np.stack([np.sin(TH) * np.sin(PH), np.sin(TH) * np.cos(PH), np.cos(TH)], -1)
        sun = np.array([0.0, math.cos(sun_el_rad), math.sin(sun_el_rad)])
        L = self.sky(cam_h, dirs, sun)
        dw = (2 * math.pi / (2 * n)) * (1.0 / n)   # d(phi) * d(cos theta)
        Y = np.stack([np.full(TH.shape, 0.282095), 0.488603 * dirs[..., 1],
                      0.488603 * dirs[..., 2], 0.488603 * dirs[..., 0]], -1)
        sh = np.einsum("ijk,ijc->kc", Y, L) * dw
        return sh.astype(np.float32)
