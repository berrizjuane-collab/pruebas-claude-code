"""Lighting, materials, sky and aerial perspective (linear RGB, HDR)."""
import numpy as np

import noise as nz


def sun_vec(az_deg, el_deg):
    a, e = np.radians(az_deg), np.radians(el_deg)
    return np.array([np.sin(a) * np.cos(e), np.cos(a) * np.cos(e), np.sin(e)])


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# --------------------------------------------------------------------------------------
# Time-of-day palettes.  Values are linear-light; exposure handled by the tone mapper.
# --------------------------------------------------------------------------------------
PALETTES = {
    'morning': dict(sun_az=100, sun_el=22, sun=(4.0, 3.65, 3.15), zenith=(0.025, 0.075, 0.30),
                    horizon=(0.36, 0.47, 0.70), ground_haze=(0.42, 0.50, 0.68), skylight=(0.20, 0.29, 0.52),
                    amb=1.0, haze_dens=1.0 / 52000, haze_h=2600.0, mie=0.55, exposure=0.62, stars=0.0),
    'day': dict(sun_az=150, sun_el=50, sun=(4.4, 4.05, 3.55), zenith=(0.02, 0.07, 0.30),
                horizon=(0.34, 0.46, 0.70), ground_haze=(0.42, 0.50, 0.68), skylight=(0.20, 0.29, 0.50),
                amb=1.0, haze_dens=1.0 / 60000, haze_h=2600.0, mie=0.45, exposure=0.58, stars=0.0),
    'afternoon': dict(sun_az=235, sun_el=30, sun=(4.2, 3.55, 2.75), zenith=(0.025, 0.075, 0.30),
                      horizon=(0.42, 0.47, 0.66), ground_haze=(0.46, 0.48, 0.62), skylight=(0.21, 0.28, 0.48),
                      amb=1.0, haze_dens=1.0 / 50000, haze_h=2600.0, mie=0.55, exposure=0.62, stars=0.0),
    'sunset': dict(sun_az=292, sun_el=3.5, sun=(4.4, 2.2, 0.95), zenith=(0.03, 0.055, 0.17),
                   horizon=(0.80, 0.45, 0.30), ground_haze=(0.42, 0.32, 0.40), skylight=(0.14, 0.15, 0.30),
                   amb=1.0, haze_dens=1.0 / 42000, haze_h=2400.0, mie=0.9, exposure=0.85, stars=0.0),
    'night': dict(sun_az=200, sun_el=-25, sun=(0.0, 0.0, 0.0), zenith=(0.003, 0.006, 0.02),
                  horizon=(0.012, 0.02, 0.05), ground_haze=(0.010, 0.017, 0.040), skylight=(0.010, 0.016, 0.040),
                  amb=1.0, haze_dens=1.0 / 50000, haze_h=2600.0, mie=0.0, exposure=9.0, stars=1.0,
                  moon_az=235, moon_el=28, moon=(0.050, 0.062, 0.090)),
    'dawn': dict(sun_az=66, sun_el=1.5, sun=(3.0, 1.75, 1.05), zenith=(0.018, 0.035, 0.12),
                 horizon=(0.75, 0.40, 0.32), ground_haze=(0.22, 0.20, 0.32), skylight=(0.07, 0.08, 0.17),
                 amb=1.0, haze_dens=1.0 / 45000, haze_h=2400.0, mie=1.0, exposure=1.5, stars=0.25),
    'summit': dict(sun_az=120, sun_el=36, sun=(4.5, 3.95, 3.25), zenith=(0.012, 0.05, 0.26),
                   horizon=(0.32, 0.45, 0.72), ground_haze=(0.42, 0.50, 0.70), skylight=(0.17, 0.25, 0.48),
                   amb=1.0, haze_dens=1.0 / 70000, haze_h=2500.0, mie=0.5, exposure=0.56, stars=0.0),
}


def palette(name, **over):
    p = dict(PALETTES[name])
    p.update(over)
    for k in ('sun', 'zenith', 'horizon', 'ground_haze', 'skylight'):
        p[k] = np.asarray(p[k], dtype=np.float64)
    p['sun_dir'] = sun_vec(p['sun_az'], p['sun_el'])
    if 'moon' in p:
        p['moon'] = np.asarray(p['moon'], dtype=np.float64)
        p['moon_dir'] = sun_vec(p['moon_az'], p['moon_el'])
    return p


def lerp_palette(a, b, t):
    out = {}
    for k in a:
        va, vb = a[k], b.get(k, a[k])
        if isinstance(va, (int, float, np.floating)) and isinstance(vb, (int, float, np.floating)):
            out[k] = va + (vb - va) * t
        elif isinstance(va, np.ndarray) and isinstance(vb, np.ndarray) and va.shape == vb.shape:
            out[k] = va + (vb - va) * t
        else:
            out[k] = va if t < 0.5 else vb
    sd = out['sun_dir']
    out['sun_dir'] = sd / (np.linalg.norm(sd) + 1e-9)
    if 'moon_dir' in out:
        out['moon_dir'] = out['moon_dir'] / (np.linalg.norm(out['moon_dir']) + 1e-9)
    return out


# --------------------------------------------------------------------------------------
def sky(dirs, pal, cam_z=5000.0):
    """dirs (...,3) unit vectors -> sky radiance."""
    dz = dirs[..., 2]
    sd = pal['sun_dir']
    # horizon dip from altitude (km) - the visible horizon sits below 0 at 8 km
    dip = -np.sqrt(2 * max(cam_z - 3000.0, 0.0) / 6.371e6)
    h = np.clip((dz - dip) / (1 - dip), 0.0, 1.0)
    t = (1.0 - h) ** 3.2
    col = pal['zenith'][None] * (1 - t[..., None]) + pal['horizon'][None] * t[..., None]
    col = col.reshape(dirs.shape)
    # darker toward zenith at high altitude (thin air)
    col *= (1.0 - 0.25 * h[..., None] * smoothstep(5000, 8600, cam_z))
    mu = np.clip((dirs * sd).sum(-1), -1, 1)
    g = 0.76
    hg = (1 - g * g) / (1 + g * g - 2 * g * mu) ** 1.5 / (4 * np.pi)
    sun_up = smoothstep(-0.12, 0.05, sd[2])
    col += pal['sun'][None] * (hg * pal['mie'] * 0.9 * (0.35 + 0.65 * t))[..., None] * sun_up
    # sun disc (soft, painterly)
    disc = smoothstep(0.99985, 0.99997, mu)
    col += pal['sun'][None] * 18.0 * disc[..., None] * sun_up
    # anti-solar 'belt of Venus' at twilight
    if pal['sun_dir'][2] < 0.12:
        tw = smoothstep(0.12, 0.0, pal['sun_dir'][2]) * smoothstep(-0.2, -0.02, pal['sun_dir'][2])
        anti = smoothstep(0.2, 0.9, -mu)
        band = np.exp(-((dz - 0.06) / 0.06) ** 2)
        col += (np.array([0.55, 0.32, 0.38]) * tw * 0.35)[None] * (anti * band)[..., None]
    below = dz < dip
    col = np.where(below[..., None], pal['ground_haze'][None] * 0.9, col)
    if 'moon_dir' in pal:
        mm = np.clip((dirs * pal['moon_dir']).sum(-1), -1, 1)
        glow = np.exp((mm - 1) * 60.0) * 0.6 + np.exp((mm - 1) * 4000.0) * 30.0
        col += pal['moon'][None] * glow[..., None]
    return col


def cirrus(rgb, dirs, cam_pos, pal, cover=0.5, alt=10500.0, scale=9000.0, wind=(1.0, 0.25), seed=0.0):
    """Thin high clouds on a plane, lit by the sun (painted streaks)."""
    dz = dirs[..., 2]
    up = dz > 0.015
    t = np.where(up, (alt - cam_pos[2]) / np.maximum(dz, 0.015), 0.0)
    x = cam_pos[0] + dirs[..., 0] * t
    y = cam_pos[1] + dirs[..., 1] * t
    w = np.array(wind) / np.linalg.norm(wind)
    a = (x * w[0] + y * w[1]) / scale
    b = (-x * w[1] + y * w[0]) / (scale * 0.22)
    n = nz.fbm(a + seed, b, np.full(a.size, 0.37), 1.0, 5).reshape(a.shape)
    n2 = nz.fbm(a * 3.1 + 5, b * 0.8, np.full(a.size, 1.7), 1.0, 3).reshape(a.shape)
    dens = np.clip((n + 0.25 * n2 + (cover - 0.5) * 0.6) * 2.2, 0, 1) * up
    dens *= smoothstep(0.015, 0.12, dz) * np.exp(-t / 160000.0)
    mu = np.clip((dirs * pal['sun_dir']).sum(-1), -1, 1)
    lit = pal['sun'] * (0.10 + 0.25 * np.exp((mu - 1) * 6.0))[..., None] + pal['skylight'] * 0.9
    return rgb * (1 - dens[..., None] * 0.85) + lit * dens[..., None] * 0.85


def stars(dirs, density=1.0, seed=3):
    """Fixed star field (world-anchored)."""
    d = dirs
    az = np.arctan2(d[..., 0], d[..., 1])
    el = np.arcsin(np.clip(d[..., 2], -1, 1))
    gx = (az / (2 * np.pi) + 0.5) * 3000.0
    gy = (el / np.pi + 0.5) * 1500.0
    ix = np.floor(gx).astype(np.int64)
    iy = np.floor(gy).astype(np.int64)
    hsh = (ix * 73856093) ^ (iy * 19349663) ^ seed
    r = ((hsh * 2654435761) & 0xffffffff) / 4294967295.0
    r2 = (((hsh + 977) * 2246822519) & 0xffffffff) / 4294967295.0
    fx = gx - ix - 0.5
    fy = gy - iy - 0.5
    on = r > 1.0 - 0.0045 * density
    b = np.exp(-(fx * fx + fy * fy) / 0.02) * on * (0.4 + 3.0 * r2 ** 6)
    tint = np.stack([0.9 + 0.2 * r2, 0.92 + 0.05 * r, 1.05 - 0.1 * r2], -1)
    return b[..., None] * tint * smoothstep(-0.02, 0.12, d[..., 2])[..., None]


def transmittance(t, dirs, cam_z, pal):
    """Exponential height fog optical depth from the camera along the ray to distance t."""
    k = 1.0 / pal['haze_h']
    dz = dirs[..., 2]
    base = pal['haze_dens'] * np.exp(-(cam_z - 4500.0) * k)
    a = dz * k
    small = np.abs(a * t) < 1e-3
    integ = np.where(small, t, (1.0 - np.exp(-a * t)) / np.where(np.abs(a) < 1e-9, 1e-9, a))
    tau = base * integ + t / 900000.0   # + faint Rayleigh
    return np.exp(-tau)


def inscatter(dirs, pal):
    sd = pal['sun_dir']
    mu = (dirs * sd).sum(-1)
    g = 0.6
    hg = (1 - g * g) / (1 + g * g - 2 * g * mu) ** 1.5
    sun_up = smoothstep(-0.1, 0.05, sd[2])
    c = pal['ground_haze'][None] * 1.0 + pal['sun'][None] * (0.03 + 0.02 * hg)[..., None] * pal['mie'] * sun_up
    return c.reshape(dirs.shape)


# --------------------------------------------------------------------------------------
ROCK = np.array([0.085, 0.070, 0.060])
ROCK_LIGHT = np.array([0.165, 0.142, 0.122])
ROCK_BLACK = np.array([0.019, 0.018, 0.022])
SNOW = np.array([0.90, 0.93, 0.97])
ICE = np.array([0.55, 0.72, 0.82])
DEBRIS = np.array([0.17, 0.165, 0.16])
GLACIER = np.array([0.70, 0.72, 0.75])
SERAC = np.array([0.60, 0.78, 0.88])


def black_pyramid_mask(pos):
    """The Black Pyramid: dark rock buttress on the spur between ~6,700 and ~7,450 m."""
    x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
    # along-ridge axis from C2 (1640,-1380) to C3 (1200,-900)
    ax = np.array([1200 - 1640, -900 + 1380.0])
    L = np.linalg.norm(ax)
    ax /= L
    rx, ry = x - 1640, y + 1380
    along = rx * ax[0] + ry * ax[1]
    across = -rx * ax[1] + ry * ax[0]
    m = smoothstep(-80, 40, along) * (1 - smoothstep(L - 60, L + 80, along))
    m *= 1 - smoothstep(170, 330, np.abs(across))
    m *= smoothstep(6620, 6740, z) * (1 - smoothstep(7380, 7480, z))
    return m


def shade_terrain(pos, nrm, t, dirs, sh, maps, pal, cam_z, extra_light=None):
    t = np.asarray(t, dtype=np.float64)
    """Return linear radiance for terrain hits (arrays shaped (N,...))."""
    rock = maps['rock']
    debris = maps['debris']
    glacier = maps['glacier']
    ao = maps['ao']
    x, y, z = pos[:, 0], pos[:, 1], pos[:, 2]
    # material noise
    n1 = nz.fbm(x / 37.0, y / 37.0, z / 37.0, 1.0, 4)
    n2 = nz.fbm(x / 230.0 + 11, y / 230.0, z / 230.0, 1.0, 3)
    # snow line: below ~5,700 m everything that is not glacier is bare moraine/rock
    snowline = smoothstep(5350, 6150, z + n2 * 300)
    rockiness = np.clip(rock + (1 - snowline) * (1 - glacier) * 0.8, 0, 1)
    # wind-scoured ice on steep upper snow
    icy = smoothstep(30, 48, maps['slope']) * (1 - rockiness) * smoothstep(6800, 8000, z) * 0.5
    snow_col = SNOW[None] * (1 - icy[:, None]) + ICE[None] * icy[:, None]
    snow_col *= (0.94 + 0.06 * n1)[:, None]
    rk = ROCK[None] * (0.75 + 0.5 * (n1 + 0.5))[:, None]
    upper = smoothstep(7600, 8300, z)                        # paler granite in the summit pyramid
    rk = rk * (1 - upper[:, None]) + ROCK_LIGHT[None] * upper[:, None] * (0.85 + 0.3 * n2[:, None])
    bp = black_pyramid_mask(pos)
    rk = rk * (1 - bp[:, None]) + ROCK_BLACK[None] * bp[:, None] * (0.8 + 0.4 * (n1[:, None] + 0.5))
    bp_r = np.maximum(rockiness, bp * smoothstep(30, 45, maps['slope']) * 0.85)
    albedo = snow_col * (1 - bp_r[:, None]) + rk * bp_r[:, None]
    # glacier: clean ice/snow vs debris stripes
    n_rub = nz.fbm(x / 3.1, y / 3.1, z / 3.1 + 7.0, 1.0, 3)
    near_f = np.clip(1.0 - t / 900.0, 0, 1)
    rub = 0.5 + (np.clip(n_rub + 0.5, 0, 1) - 0.5) * near_f
    ice_patch = smoothstep(0.62, 0.75, rub)[:, None]
    gl_col = GLACIER[None] * (1 - debris[:, None]) + debris[:, None] * (DEBRIS[None] * (0.55 + 0.9 * n1[:, None] + 0.4) * (0.35 + 1.3 * rub[:, None]) * (1 - ice_patch) + GLACIER[None] * 0.9 * ice_patch)
    gw = glacier[:, None] * (1 - smoothstep(5500, 5800, z))[:, None]
    albedo = albedo * (1 - gw) + gl_col * gw
    if 'ice' in maps:
        ice = np.clip(maps['ice'], 0, 1)
        # serac: blue glacial ice on steep faces, wind-packed white on top
        steep_ice = smoothstep(0.75, 0.35, nrm[:, 2])
        ice_col = SERAC[None] * (0.9 + 0.2 * n1[:, None]) * steep_ice[:, None] + SNOW[None] * (1 - steep_ice[:, None])
        albedo = albedo * (1 - ice[:, None]) + ice_col * ice[:, None]
        bp_r = bp_r * (1 - ice)

    sd = pal['sun_dir']
    lam = np.clip(nrm @ sd, 0, 1)
    sun_vis = smoothstep(-0.08, 0.04, sd[2])
    cs = pal.get('cloud_shadow')
    if cs is not None:
        # shadows of passing clouds (world-anchored, drifting with the wind)
        sc_, cov, ox, oy = cs
        cn = nz.fbm(x / sc_ + ox, y / sc_ + oy, np.full(len(x), 3.3), 1.0, 4)
        sh = sh * (1.0 - 0.78 * smoothstep(0.02, 0.16, cn + cov - 0.5))
    direct = pal['sun'][None] * (lam * sh * sun_vis)[:, None]
    skyamb = pal['skylight'][None] * pal['amb']
    hemi = (0.55 + 0.45 * nrm[:, 2])
    amb = skyamb * (hemi * (0.35 + 0.65 * ao))[:, None]
    # bounce light from sunlit snow below onto walls (warm)
    bounce = pal['sun'][None] * 0.07 * ((1 - nrm[:, 2]) * 0.5 * sun_vis * ao)[:, None]
    light = direct + amb + bounce
    if 'moon_dir' in pal:
        ml = np.clip(nrm @ pal['moon_dir'], 0, 1)
        light = light + pal['moon'][None] * 2.0 * ml[:, None]
    if extra_light is not None:
        light = light + extra_light
    col = albedo * light
    # subtle snow specular sheen toward the sun
    h = sd[None] - dirs
    h /= np.linalg.norm(h, axis=-1, keepdims=True) + 1e-9
    spec = np.clip((nrm * h).sum(-1), 0, 1) ** 40 * sh * (1 - bp_r) * 0.25 * sun_vis
    col += pal['sun'][None] * spec[:, None]
    return col


def aerial(col, t, dirs, cam_z, pal):
    T = transmittance(t, dirs, cam_z, pal)[..., None]
    return col * T + inscatter(dirs, pal) * (1 - T)


# --------------------------------------------------------------------------------------
def tonemap(col, exposure=1.0):
    """ACES-ish filmic curve -> display sRGB-like gamma."""
    x = np.maximum(col * exposure, 0.0)
    a, b, c, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
    y = np.clip((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0)
    return y ** (1 / 2.2)
