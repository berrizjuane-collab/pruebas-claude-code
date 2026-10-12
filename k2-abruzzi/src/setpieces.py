"""Close-up set pieces built as tilted heightfield patches in their true place on the spur."""
import math
import numpy as np
from scipy import ndimage

from scene import Patch


def _n(shape, sigma, seed):
    rng = np.random.default_rng(seed)
    n = ndimage.gaussian_filter(rng.standard_normal(shape).astype(np.float32), sigma)
    return n / (n.std() + 1e-6)


def _ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def voronoi_rock(uu, vv, cell, seed, tilt=0.35, crack=0.12, relief=0.6):
    """Faceted, fractured rock: each Voronoi cell is a tilted plane; cracks along cell borders."""
    rng = np.random.default_rng(seed)
    gu = np.floor(uu / cell).astype(np.int64)
    gv = np.floor(vv / cell).astype(np.int64)
    best = np.full(uu.shape, 1e9, np.float32)
    second = np.full(uu.shape, 1e9, np.float32)
    hval = np.zeros(uu.shape, np.float32)

    def hsh(a, b, k):
        x = (a * 73856093) ^ (b * 19349663) ^ (k * 83492791) ^ seed
        x = (x * 2654435761) & 0xffffffff
        return x / 4294967295.0
    for du in (-1, 0, 1):
        for dv in (-1, 0, 1):
            cu, cv = gu + du, gv + dv
            su = (cu + 0.15 + 0.7 * hsh(cu, cv, 1)) * cell
            sv = (cv + 0.15 + 0.7 * hsh(cu, cv, 2)) * cell
            d = np.sqrt((uu - su) ** 2 + ((vv - sv) * 1.15) ** 2).astype(np.float32)
            ta = (hsh(cu, cv, 3) - 0.5) * 2 * tilt
            tb = (hsh(cu, cv, 4) - 0.5) * 2 * tilt - tilt * 0.4
            off = (hsh(cu, cv, 5) - 0.5) * relief
            hv = off + ta * (uu - su) + tb * (vv - sv)
            closer = d < best
            second = np.where(closer, best, np.minimum(second, d))
            hval = np.where(closer, hv, hval)
            best = np.where(closer, d, best)
    edge = second - best
    cr = crack * (1 - _ss(0.0, 0.10 * cell, edge))
    return hval - cr


def wall_frame(downhill_xy, steep_deg):
    """Frame of a rock wall facing `downhill_xy` (horizontal), inclined `steep_deg` from horizontal."""
    d = np.array([downhill_xy[0], downhill_xy[1], 0.0])
    d /= np.linalg.norm(d)
    a = math.radians(steep_deg)
    up_h = -d
    V = up_h * math.cos(a) + np.array([0, 0, 1.0]) * math.sin(a)      # up the wall
    N = d * math.sin(a) + np.array([0, 0, 1.0]) * math.cos(a)          # out of the wall
    U = np.cross(V, N)
    U /= np.linalg.norm(U)
    return U, V, N


def house_chimney(origin, downhill_xy, res=0.06, seed=21):
    """A 30 m chimney (1.2-1.6 m wide, ~2.6 m deep) in a 78 deg granite wall with snowy ledges."""
    U, V, N = wall_frame(downhill_xy, 76.0)
    u0, u1, v0, v1 = -30.0, 30.0, -10.0, 44.0
    us = np.arange(u0, u1 + 1e-6, res)
    vs = np.arange(v0, v1 + 1e-6, res)
    uu, vv = np.meshgrid(us, vs)
    shp = uu.shape
    # large forms: the wall bulges into a buttress around the chimney, recedes at the sides
    h = 2.5 * np.exp(-(uu / 14.0) ** 2) + 1.2 * _n(shp, 6.0 / res, seed)
    # fractured granite at two scales
    h += voronoi_rock(uu, vv, 2.6, seed + 1, tilt=0.30, crack=0.16, relief=0.9)
    h += 0.35 * voronoi_rock(uu + 7.3, vv + 3.1, 0.9, seed + 2, tilt=0.18, crack=0.05, relief=0.3)
    h = ndimage.gaussian_filter(h, 0.9)
    h += 0.03 * _n(shp, 0.12 / res, seed + 4)
    # horizontal ledges (step out) every few metres
    for lv, amp in ((4.2, 0.6), (9.8, 0.5), (15.5, 0.7), (21.0, 0.45), (27.5, 0.6), (34.0, 0.5)):
        h += amp * _ss(lv + 0.3, lv - 0.3, vv) * (0.6 + 0.4 * _n(shp, 3.0 / res, seed + int(lv * 7) + 50))
    # the platform at the foot (where the second climber waits)
    h += 2.0 * _ss(-1.0, -2.8, vv)
    # chimney slot
    cen = 0.25 * np.sin(vv / 4.3) + 0.15 * np.sin(vv / 1.7 + 0.4)
    wid = 0.70 + 0.12 * np.sin(vv / 3.1) + 0.05 * _n(shp, 0.6 / res, seed + 5)
    du = np.abs(uu - cen)
    inside = _ss(wid + 0.12, wid - 0.06, du) * _ss(-1.0, 0.0, vv) * _ss(31.0, 29.5, vv)
    depth = 2.7 + 0.3 * _n(shp, 0.8 / res, seed + 6)
    h = h * (1 - inside) + (-depth + 0.15 * _n(shp, 0.25 / res, seed + 7)) * inside
    # chimney lips slightly rounded / protruding
    h += 0.25 * np.exp(-((du - wid - 0.15) / 0.2) ** 2) * _ss(-1.0, 0.0, vv) * _ss(31.0, 29.5, vv)
    # fade the patch into the slope at its edges (sink below the DEM)
    edge = _ss(u0, u0 + 3.0, uu) * _ss(u1, u1 - 3.0, uu) * _ss(v0, v0 + 2.5, vv) * _ss(v1, v1 - 3.0, vv)
    h = h * edge - 6.0 * (1 - edge)
    # materials: snow where the surface faces up (ledges), dark ice glaze deep in the slot
    gy, gx = np.gradient(h, res)
    nl = np.stack([-gx, -gy, np.ones_like(gx)], -1)
    nl /= np.linalg.norm(nl, axis=-1, keepdims=True)
    A = np.stack([U, V, N])
    nw = nl @ A
    up = nw[..., 2]
    snow = _ss(0.55, 0.8, up + 0.15 * _n(shp, 0.5 / res, seed + 8)) * (1 - inside * 0.7)
    rock = np.clip(1 - snow, 0, 1)
    ice = np.clip(inside * _ss(-1.5, -2.4, h) * 0.6, 0, 1)
    slope = np.degrees(np.arccos(np.clip(up, -1, 1)))
    ao = np.clip(1.0 - 0.9 * _ss(0.0, 2.4, ndimage.gaussian_filter(h, 0.6 / res) - h), 0.15, 1.0)
    maps = dict(rock=rock.astype(np.float32), glacier=np.zeros(shp, np.float32), debris=np.zeros(shp, np.float32),
                ao=ao.astype(np.float32), slope=slope.astype(np.float32), ice=ice.astype(np.float32))
    p = Patch(origin, U, V, N, h.astype(np.float32), u0, v0, res, maps, name='house_chimney')
    p.slot_center = lambda v: 0.25 * np.sin(v / 4.3) + 0.15 * np.sin(v / 1.7 + 0.4)
    p.local_to_world = lambda u, v, n: np.asarray(origin) + np.multiply.outer(u, U) + np.multiply.outer(v, V) + np.multiply.outer(n, N)
    return p
