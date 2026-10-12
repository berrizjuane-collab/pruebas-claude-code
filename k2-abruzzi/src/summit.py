"""Sculpting of the summit pyramid above the Shoulder.

The 30 m DEM resolves the shape of the summit pyramid but not its defining features.
Following route descriptions (Bottleneck: steep, narrow couloir at ~8,200 m beneath a
huge hanging serac; at its top the route traverses LEFT across a ~55 deg slope beneath
the ice cliff, then heads more or less straight up the summit snowfield), we add:

  * the Bottleneck couloir carved between two rock buttresses,
  * the serac: a raised ice slab whose downhill edge is a 40-50 m ice cliff,
  * the traverse ramp below the cliff,
  * a summit crest with a small cornice.

Everything is expressed in a local frame at the foot of the Bottleneck: 'up' is the
horizontal uphill direction of the DEM there, 'left' is the climber's left when facing
uphill (towards the south-west).
"""
import numpy as np
from scipy import ndimage

B = np.array([510.0, -290.0])          # foot of the Bottleneck (DEM ~8,135 m before carving)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


class Frame:
    def __init__(self, near_grid):
        g = near_grid
        e = 30.0
        hx = (g.sample(B[0] + e, B[1]) - g.sample(B[0] - e, B[1])) / (2 * e)
        hy = (g.sample(B[0], B[1] + e) - g.sample(B[0], B[1] - e)) / (2 * e)
        up = np.array([hx, hy])
        self.up = up / np.linalg.norm(up)
        self.left = np.array([-self.up[1], self.up[0]])

    def local(self, x, y):
        dx, dy = x - B[0], y - B[1]
        return dx * self.up[0] + dy * self.up[1], dx * self.left[0] + dy * self.left[1]

    def world(self, a, l):
        return B + a * self.up + l * self.left


def _seg_dist(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    t = np.clip(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy), 0, 1)
    return np.hypot(px - ax - t * vx, py - ay - t * vy), t


def sculpt(fr: Frame, x, y, h, rng_seed=3, res=2.5):
    """Return sculpted height and material masks (ice, rock) for world arrays x, y, h."""
    a, l = fr.local(x, y)            # a: uphill metres from B, l: metres to the left
    rng = np.random.default_rng(rng_seed)
    dh = np.zeros_like(h)
    ice = np.zeros_like(h)
    rock = np.zeros_like(h)

    # --- Bottleneck couloir: axis wiggles slightly, from a=-40 (top of the shoulder) to a=+150
    axis_l = 5.0 * np.sin(a / 31.0) + 0.04 * a
    w = 9.0 + 2.5 * np.sin(a / 23.0 + 1.0)                   # half width
    along = smoothstep(-60, -20, a) * (1 - smoothstep(140, 172, a))
    dl = np.abs(l - axis_l)
    gully = -13.0 * (1 - smoothstep(0.5 * w, w, dl)) * along
    # flanking rock buttresses (right one bigger, left one forms the serac's base)
    butt = (13.0 * np.exp(-((dl - w * 1.45) / 8.0) ** 2) * along
            + 8.0 * smoothstep(w * 1.2, w * 2.0, dl) * (1 - smoothstep(w * 2.2, w * 5.5, dl)) * along)
    dh += gully + butt
    rock += np.clip(butt / 7.0, 0, 1) * smoothstep(-50, -10, a) * (1 - smoothstep(135, 160, a))

    # --- serac: ice slab with a cliff whose foot runs along a(l) = 162 + 0.10*l  (l from -80 to +160)
    l0, l1 = -80.0, 160.0
    foot = 162.0 + 0.10 * l + 4.0 * np.sin(l / 17.0)
    span = smoothstep(l0, l0 + 25, l) * (1 - smoothstep(l1 - 25, l1, l))
    behind = a - foot
    cliff_h = 52.0 + 8.0 * np.sin(l / 29.0 + 0.5)
    slab = cliff_h * smoothstep(-1.5, 2.5, behind) * (1 - smoothstep(60, 230, behind)) * span
    # fracture steps on the cliff face / top (seracs are blocky)
    steps = 3.5 * np.round(ndimage.gaussian_filter(rng.standard_normal(h.shape), 2) * 2) / 2
    slab = slab + steps * smoothstep(0, 6, behind) * (1 - smoothstep(25, 60, behind)) * span
    dh += slab
    ice += np.clip(slab / 10.0, 0, 1)

    # --- traverse ramp beneath the cliff: slight bench (flattened band) from l=0 to l=150
    ramp_a = foot - 15.0
    bench = -3.0 * np.exp(-((a - ramp_a) / 7.0) ** 2) * smoothstep(-10, 10, l) * (1 - smoothstep(170, 200, l))
    dh += bench

    # --- the final arete: a sharp snow crest from the end of the traverse to the summit
    ax_, al_ = 225.0, 192.0          # start (local a, l)
    bx_, bl_ = 582.0, 132.0          # summit
    d, tt = _seg_dist(a, l, ax_, al_, bx_, bl_)
    amp = (5.0 + 3.0 * np.sin(np.pi * tt)) * smoothstep(0.0, 0.08, tt) * (1 - smoothstep(0.9, 1.0, tt))
    crest = amp * np.clip(1 - (d / 24.0) ** 2, 0, None) ** 1.6
    # cornice lip on the north-east (right) side: a bulge just past the crest
    side = (l - (al_ + (bl_ - al_) * tt))
    cornice = 1.6 * np.exp(-((side + 6.0) / 3.0) ** 2) * smoothstep(0.15, 0.3, tt) * (1 - smoothstep(0.85, 0.97, tt))
    dh += crest + cornice
    snowforce = np.clip(np.clip(1 - (d / 30.0) ** 2, 0, None) * smoothstep(0.0, 0.05, tt) * (1 - smoothstep(0.98, 1.05, tt)) * 1.5, 0, 1)
    rock = rock * (1 - snowforce)
    return h + dh, ice, rock, snowforce


def route_upper(fr: Frame):
    """Polyline from C4 to the summit in world xy (Bottleneck, traverse, snowfield)."""
    pts_local = [(-190, -30), (-150, -20), (-110, -10), (-70, -3), (-35, -1), (0, 0),
                 (35, 3), (70, 5), (105, 6), (132, 9), (142, 22), (148, 50), (152, 80), (157, 110),
                 (162, 140), (170, 168), (188, 188), (210, 196)]
    pts = [fr.world(a, l) for a, l in pts_local]
    # from the end of the traverse straight up the snowfield to the summit
    s = np.array([-80.0, -200.0])
    end = pts[-1]
    for k in range(1, 9):
        t = k / 8.0
        p = end + (s - end) * t
        pts.append(p)
    return np.array(pts)
