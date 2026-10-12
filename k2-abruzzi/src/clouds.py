"""Volumetric-ish atmosphere: sea of clouds (slab) and the summit snow plume (numba)."""
import math
import numpy as np
import numba as nb

from noise import fbm3, PERM, GRAD3


@nb.njit(inline='always')
def _ss(a, b, x):
    t = (x - a) / (b - a)
    if t < 0.0:
        t = 0.0
    if t > 1.0:
        t = 1.0
    return t * t * (3.0 - 2.0 * t)


@nb.njit(parallel=True, fastmath=True)
def cloud_slab(Hh, W, cam, dirs, tbuf, rgb, zb, zt, scale, cover, sigma, sun, sun_col, amb_col,
               haze_col, haze_k, nsteps, wx, wy, perm, grad):
    for j in nb.prange(Hh):
        for i in range(W):
            dx = dirs[j, i, 0]
            dy = dirs[j, i, 1]
            dz = dirs[j, i, 2]
            cz = cam[2]
            if abs(dz) < 1e-7:
                if cz < zb or cz > zt:
                    continue
                t0 = 0.0
                t1 = 1e9
            else:
                ta = (zb - cz) / dz
                tb = (zt - cz) / dz
                if ta > tb:
                    ta, tb = tb, ta
                t0 = max(0.0, ta)
                t1 = tb
            tend = tbuf[j, i]
            if tend > 0.0 and tend < t1:
                t1 = tend
            if t1 > 160000.0:
                t1 = 160000.0
            if t1 <= t0:
                continue
            T = 1.0
            lr = 0.0
            lg = 0.0
            lb = 0.0
            tfirst = -1.0
            # samples spaced geometrically (dense near, sparse far)
            span = t1 - t0
            jit = ((i * 73 + j * 151) % 17) / 17.0
            mu = dx * sun[0] + dy * sun[1] + dz * sun[2]
            phase = 0.55 + 0.9 * math.exp((mu - 1.0) * 4.0)
            prev = t0
            for k in range(nsteps):
                f = (k + jit) / nsteps
                t = t0 + span * f * f
                dt = t - prev if k > 0 else span / (nsteps * nsteps)
                prev = t
                px = cam[0] + dx * t
                py = cam[1] + dy * t
                pz = cz + dz * t
                hf = (pz - zb) / (zt - zb)
                prof = _ss(0.0, 0.18, hf) * _ss(1.0, 0.45, hf)
                if prof <= 0.0:
                    continue
                n = fbm3(px / scale + wx, py / scale + wy, pz / (scale * 0.45), 5, 2.03, 0.5, perm, grad)
                d = (n + cover - 0.5) * 2.2 * prof
                if d <= 0.0:
                    continue
                if tfirst < 0.0:
                    tfirst = t
                a = 1.0 - math.exp(-d * sigma * max(dt, 1.0))
                lit = (0.35 + 0.65 * hf) * phase
                lr += T * a * (amb_col[0] * (0.6 + 0.4 * hf) + sun_col[0] * lit)
                lg += T * a * (amb_col[1] * (0.6 + 0.4 * hf) + sun_col[1] * lit)
                lb += T * a * (amb_col[2] * (0.6 + 0.4 * hf) + sun_col[2] * lit)
                T *= (1.0 - a)
                if T < 0.02:
                    break
            if tfirst < 0.0:
                continue
            hz = 1.0 - math.exp(-tfirst * haze_k)
            al = 1.0 - T
            lr = lr * (1.0 - hz) + haze_col[0] * al * hz
            lg = lg * (1.0 - hz) + haze_col[1] * al * hz
            lb = lb * (1.0 - hz) + haze_col[2] * al * hz
            rgb[j, i, 0] = rgb[j, i, 0] * T + lr
            rgb[j, i, 1] = rgb[j, i, 1] * T + lg
            rgb[j, i, 2] = rgb[j, i, 2] * T + lb


@nb.njit(parallel=True, fastmath=True)
def plume(Hh, W, cam, dirs, tbuf, rgb, top, wind, length, r0, grow, dens, sun, sun_col, amb_col, nsteps,
          tphase, perm, grad):
    """Wind-blown snow plume streaming from a summit point along `wind` (unit, horizontal)."""
    # bounding sphere around the plume mid-point
    cx = top[0] + wind[0] * length * 0.5
    cy = top[1] + wind[1] * length * 0.5
    cz = top[2] - length * 0.05
    R = length * 0.6 + r0 + grow * length
    for j in nb.prange(Hh):
        for i in range(W):
            dx = dirs[j, i, 0]
            dy = dirs[j, i, 1]
            dz = dirs[j, i, 2]
            ox = cam[0] - cx
            oy = cam[1] - cy
            oz = cam[2] - cz
            b = ox * dx + oy * dy + oz * dz
            c = ox * ox + oy * oy + oz * oz - R * R
            disc = b * b - c
            if disc <= 0.0:
                continue
            sq = math.sqrt(disc)
            t0 = max(0.0, -b - sq)
            t1 = -b + sq
            tend = tbuf[j, i]
            if tend > 0.0 and tend < t1:
                t1 = tend
            if t1 <= t0:
                continue
            T = 1.0
            lr = 0.0
            lg = 0.0
            lb = 0.0
            dt = (t1 - t0) / nsteps
            mu = dx * sun[0] + dy * sun[1] + dz * sun[2]
            phase = 0.5 + 2.5 * math.exp((mu - 1.0) * 8.0)
            for k in range(nsteps):
                t = t0 + (k + 0.5) * dt
                px = cam[0] + dx * t - top[0]
                py = cam[1] + dy * t - top[1]
                pz = cam[2] + dz * t - top[2]
                s = px * wind[0] + py * wind[1]
                if s < -r0 or s > length:
                    continue
                lat = -px * wind[1] + py * wind[0]
                vz = pz + s * 0.06
                rad = r0 + grow * max(s, 0.0)
                q = (lat * lat + vz * vz * 1.8) / (rad * rad)
                if q > 4.0:
                    continue
                n = fbm3(s / 260.0 - tphase, lat / 22.0, pz / 22.0, 4, 2.1, 0.5, perm, grad)
                d = dens * math.exp(-q) * max(0.0, 0.45 + 1.6 * n) * (1.0 - s / length) ** 1.5 * _ss(-r0, r0 * 2.0, s)
                if d <= 0.0:
                    continue
                a = 1.0 - math.exp(-d * dt)
                lr += T * a * (amb_col[0] + sun_col[0] * 0.6 * phase)
                lg += T * a * (amb_col[1] + sun_col[1] * 0.6 * phase)
                lb += T * a * (amb_col[2] + sun_col[2] * 0.6 * phase)
                T *= (1.0 - a)
                if T < 0.03:
                    break
            rgb[j, i, 0] = rgb[j, i, 0] * T + lr
            rgb[j, i, 1] = rgb[j, i, 1] * T + lg
            rgb[j, i, 2] = rgb[j, i, 2] * T + lb


def sea_of_clouds(rgb, t, dirs, cam, pal, zb=4600.0, zt=6200.0, scale=2600.0, cover=0.5, sigma=0.0045,
                  nsteps=18, wind=(0.0, 0.0)):
    Hh, W = t.shape
    amb = pal['skylight'] * 1.6 + pal['ground_haze'] * 0.2
    sun_col = pal['sun'] * 0.55 * float(np.clip(pal['sun_dir'][2] * 8 + 0.3, 0, 1))
    if 'moon' in pal:
        sun_col = sun_col + pal['moon'] * 1.5
    k = pal['haze_dens'] * 0.9
    cloud_slab(Hh, W, cam.pos.astype(np.float64), dirs, t, rgb, zb, zt, scale, cover, sigma,
               pal['sun_dir'].astype(np.float64), sun_col.astype(np.float64), amb.astype(np.float64),
               (pal['ground_haze'] * 1.0).astype(np.float64), k, nsteps, wind[0], wind[1], PERM, GRAD3)
    return rgb


def summit_plume(rgb, t, dirs, cam, pal, top, wind_dir, length=900.0, r0=25.0, grow=0.22, dens=0.004,
                 nsteps=28, tphase=0.0):
    Hh, W = t.shape
    w = np.asarray(wind_dir, np.float64)
    w = w / np.linalg.norm(w)
    amb = pal['skylight'] * 1.8
    sun_col = pal['sun'] * float(np.clip(pal['sun_dir'][2] * 8 + 0.2, 0, 1))
    plume(Hh, W, cam.pos.astype(np.float64), dirs, t, rgb, np.asarray(top, np.float64), w, length, r0, grow,
          dens, pal['sun_dir'].astype(np.float64), sun_col.astype(np.float64), amb.astype(np.float64), nsteps,
          tphase, PERM, GRAD3)
    return rgb
