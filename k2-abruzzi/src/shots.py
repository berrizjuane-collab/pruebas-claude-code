"""Shot definitions: cameras, light, atmosphere, characters and props for every beat."""
import math
import numpy as np
import cv2

import shade
import clouds as cl
import figures as F
import route
import summit
from camera import Camera
from campath import CamPath, ease_io
from timeline import SHOTS, FPS

W_OUT, H_OUT = 1920, 1080


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def orbit_pos(scene, subject, az, el, dist, clearance=1.5):
    """Camera position at (az, el, dist) from a subject point (az: compass bearing from subject to camera)."""
    a, e = math.radians(az), math.radians(el)
    p = np.asarray(subject, float) + dist * np.array([math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)])
    g = scene.height(p[0], p[1])[0] + clearance
    if p[2] < g:
        p[2] = g
    return p


class Ctx:
    """Per-frame data handed to overlays."""

    def __init__(self, **kw):
        self.__dict__.update(kw)


class Shot:
    name = 'base'
    grade = dict(sat=1.05, warm=0.0, lift=(0, 0, 0), gain=(1, 1, 1), gamma=1.0, vignette=0.25)
    painter_kw = {}

    def __init__(self, sc):
        self.sc = sc
        for n, a, b in SHOTS:
            if n == self.name:
                self.t0, self.t1 = a, b

    def u(self, t):
        return (t - self.t0) / (self.t1 - self.t0)

    def setup(self):
        self.sc.set_fine()
        self.sc.patches = []

    def ground(self, x, y, agl=0.0):
        return np.array([x, y, self.sc.height(x, y)[0] + agl])

    def light_fn(self, t):
        return None

    def atmos(self, t):
        return None

    def overlay(self, c):
        pass

    def draw_climber(self, c, cl_, base, pose, facing=1, view='side', headlamp=0.0, light_dir=None, height_m=1.72,
                     sun_vis=None):
        uv, z = c.cam.project(np.asarray(base)[None])
        if z[0] <= 0.3:
            return
        hpx = height_m * c.cam.focal / z[0]
        if hpx < 4.0:
            # too far to draw a figure: a speck of suit colour (what a climber is, seen from afar)
            vis = c.zbuf[int(np.clip(uv[0][1], 0, c.cam.H - 1)), int(np.clip(uv[0][0], 0, c.cam.W - 1))]
            if vis > 0 and vis < z[0] - max(2.0, 0.01 * z[0]):
                return
            glow_dot(c.canvas, (uv[0][0], uv[0][1] - 1.0), 0.9, 0.0)
            r = 1.3
            x0, y0 = int(uv[0][0]), int(uv[0][1] - 1.5)
            col = np.asarray(cl_.suit, np.float32) * 0.9
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    xx, yy = x0 + dx, y0 + dy
                    if 0 <= xx < c.cam.W and 0 <= yy < c.cam.H:
                        a = 0.85 if (dx == 0 or dy == 0) else 0.35
                        c.canvas[yy, xx] = c.canvas[yy, xx] * (1 - a) + col * a
            return
        pal = c.pal
        if sun_vis is None:
            # sample the reference shadow buffer at the figure's chest
            rh, rw = c.fr['sh'].shape
            sx = int(np.clip(uv[0][0] * rw / c.cam.W, 0, rw - 1))
            sy = int(np.clip((uv[0][1] - hpx * 0.6) * rh / c.cam.H, 0, rh - 1))
            sun_vis = float(c.fr['sh'][sy, sx]) if c.fr['t'][sy, sx] > 0 else 1.0
        sd = pal['sun_dir']
        if light_dir is None:
            uvs, zs = c.cam.project((np.asarray(base) + sd * 5.0)[None])
            d = uvs[0] - uv[0]
            light_dir = d / (np.linalg.norm(d) + 1e-6)
        sun = pal['sun'] * max(sd[2] + 0.1, 0) / max(sd[2] + 0.1, 1e-3) * sun_vis * 0.75
        sky = pal['skylight'] * 1.6 + pal['sun'] * 0.04 * sun_vis
        if 'moon' in pal:
            sky = sky + pal['moon'] * 1.2
        if not hasattr(c, 'figmask'):
            c.figmask = np.zeros(c.canvas.shape[:2], np.float32)
        cl_.draw(c.canvas, c.zbuf, uv[0], hpx, z[0], pose, facing=facing, view=view, light_dir=tuple(light_dir),
                 light=1.0, drawing=c.drawing, headlamp=headlamp, sun=sun, sky=sky, exposure=pal['exposure'],
                 mask=c.figmask)

    def paint_figures(self, c, cell=3.0, width=3.0, length=8.0):
        if getattr(c, 'figmask', None) is not None and not c.preview and c.figmask.max() > 0:
            m = cv2.dilate(c.figmask, np.ones((3, 3), np.uint8))
            c.painter.repaint_region(c.canvas, c.hmap, m, c.drawing, cell=cell, width=width, length=length)

    def label_anchor(self, name):
        for n, x, y, alt in route.WAYPOINTS:
            if n == name:
                return self.ground(x, y, 2.0)
        return None


# ======================================================================================
class BaseCamp(Shot):
    """0-6.6 s: the Godwin-Austen Glacier, K2 towering, Base Camp appears; continues into Spur."""
    name = 'basecamp'
    grade = dict(sat=1.12, warm=0.035, lift=(0.012, 0.014, 0.03), gain=(1.0, 0.99, 0.96), gamma=1.0, vignette=0.32,
                 contrast=0.35)

    def __init__(self, sc):
        super().__init__(sc)
        g = self.ground
        self.path = CamPath([
            (0.0, g(700, -5300, 55.0), np.array([1350, -1600, 6164.0]), 74.0, 0.0),
            (1.0, g(800, -5120, 85.0), np.array([1420, -1500, 6300.0]), 70.0, 0.0),
        ], ease=1.2)
        rng = np.random.default_rng(42)
        self.tents = []
        centers = [(1180, -4420), (1130, -4470), (1240, -4390), (1210, -4480), (1100, -4400), (1270, -4450)]
        cols = [(0.95, 0.72, 0.10), (0.92, 0.40, 0.08), (0.78, 0.12, 0.10), (0.15, 0.45, 0.28), (0.18, 0.32, 0.65),
                (0.92, 0.88, 0.80)]
        for cx, cy in centers:
            n = rng.integers(5, 10)
            ccol = cols[rng.integers(len(cols))]
            for k in range(n):
                x = cx + rng.normal(0, 18)
                y = cy + rng.normal(0, 12)
                col = ccol if rng.random() < 0.7 else cols[rng.integers(len(cols))]
                size = rng.uniform(2.2, 3.2) if rng.random() < 0.85 else rng.uniform(4.5, 6.5)
                self.tents.append((x, y, size, col, int(rng.integers(1 << 30))))
        self.tents.sort(key=lambda tt: -tt[1])   # far first

    def cam(self, t):
        return self.path.at(self.u(t))

    def pal(self, t):
        return shade.palette('morning', sun_az=124, sun_el=41, exposure=0.6,
                             cloud_shadow=(1700.0, 0.42, 0.3 + t * 0.012, 1.1))

    def atmos(self, t):
        def f(rgb, tb, pos, dirs, cam, pal):
            sky = tb <= 0
            rgb[sky] = shade.cirrus(rgb[sky], dirs[sky].astype(np.float64), cam.pos, pal, cover=0.42, seed=3.0)
            cl.summit_plume(rgb, tb, dirs, cam, pal, top=(-80, -200, 8600), wind_dir=(1.0, -0.12), length=1300,
                            r0=10, grow=0.11, dens=0.006, tphase=t * 0.8)
            return rgb
        return f

    def overlay(self, c):
        for (x, y, size, col, sd) in self.tents:
            p = self.ground(x, y, 0.0)
            F.draw_tent(c.canvas, c.zbuf, c.cam, p, size, col, light=1.3, ambient=(0.35, 0.40, 0.52),
                        light_side=1, drawing=c.drawing, seed=sd, depth_tol=8.0)


# ======================================================================================
class Spur(Shot):
    """6.6-13.2 s: rise and reveal the Abruzzi Spur on the right skyline; the route draws itself."""
    name = 'spur'
    grade = BaseCamp.grade

    def __init__(self, sc):
        super().__init__(sc)
        g = self.ground
        self.path = CamPath([
            (0.00, g(800, -5120, 85.0), np.array([1420, -1500, 6300.0]), 70.0, 0.0),
            (0.45, np.array([1250, -5300, 5600.0]), np.array([1000, -1400, 6950.0]), 54.0, -1.0),
            (0.82, np.array([1700, -5520, 6150.0]), np.array([1050, -1500, 6950.0]), 46.0, -1.5),
            (1.00, np.array([1720, -5420, 6230.0]), np.array([1550, -1600, 6620.0]), 30.0, -1.0),
        ], ease=1.25)
        self.line, self.s = route.draped(sc, step=4.0, lift=2.0)
        self.camps = [route.waypoint(n) for n in ('ABC', 'C1', 'C2', 'C3', 'C4', 'Cumbre')]

    def cam(self, t):
        return self.path.at(self.u(t))

    def pal(self, t):
        return shade.palette('morning', sun_az=125, sun_el=42, exposure=0.6,
                             cloud_shadow=(1700.0, 0.42, 0.3 + t * 0.012, 1.1))

    def atmos(self, t):
        return BaseCamp.atmos(self, t)

    def overlay(self, c):
        # route line paints itself from ABC to the summit
        prog = smoothstep(7.2, 12.2, c.t)
        if prog <= 0:
            return
        n = max(2, int(len(self.line) * prog))
        draw_route_line(c, self.line[:n], color=(1.0, 0.86, 0.62), width=3.2, glow=0.35)
        # camp markers appear as the line passes them
        for (xy, alt) in self.camps[:-1]:
            p = self.ground(xy[0], xy[1], 2.0)
            d = np.linalg.norm(self.line[:n, :2] - xy[None], axis=1).min()
            if d < 15:
                draw_marker(c, p, radius=5.0, color=(1.0, 0.92, 0.78))


# ======================================================================================
def draw_route_line(c, pts, color, width=3.0, glow=0.3, alpha=0.95):
    """Hand-painted route line (depth-aware against the terrain buffer)."""
    import cv2
    H, W = c.canvas.shape[:2]
    uv, z = c.cam.project(pts)
    ok = z > 1
    # visibility against terrain
    vis = np.zeros(len(pts), bool)
    for k in range(len(pts)):
        if not ok[k]:
            continue
        u, v = int(uv[k, 0]), int(uv[k, 1])
        if 0 <= u < W and 0 <= v < H:
            tt = c.zbuf[v, u]
            d = np.linalg.norm(pts[k] - c.cam.pos)
            vis[k] = (tt <= 0) or (d < tt * 1.01 + 12)
    layer = np.zeros((H, W), np.float32)
    rng = np.random.default_rng(c.drawing * 17 + 3)
    wob = rng.normal(0, 0.5, (len(pts), 2))
    for k in range(len(pts) - 1):
        if vis[k] and vis[k + 1]:
            a = ((uv[k] + wob[k]) * 4).astype(int)
            b = ((uv[k + 1] + wob[k + 1]) * 4).astype(int)
            cv2.line(layer, tuple(a), tuple(b), 1.0, max(1, int(round(width))), cv2.LINE_AA, shift=2)
    if glow > 0:
        g = cv2.GaussianBlur(layer, (0, 0), width * 2.2) * glow
        c.canvas += g[..., None] * np.asarray(color, np.float32) * 0.8
    a = np.clip(layer, 0, 1) * alpha
    c.canvas[:] = c.canvas * (1 - a[..., None]) + np.asarray(color, np.float32) * a[..., None]


def draw_marker(c, p, radius=5.0, color=(1, 1, 1)):
    import cv2
    H, W = c.canvas.shape[:2]
    uv, z = c.cam.project(np.asarray(p)[None])
    if z[0] <= 0:
        return
    u, v = uv[0]
    if not (0 <= u < W and 0 <= v < H):
        return
    layer = np.zeros((H, W), np.float32)
    cv2.circle(layer, (int(u * 4), int(v * 4)), int(radius * 4), 1.0, 2, cv2.LINE_AA, shift=2)
    cv2.circle(layer, (int(u * 4), int(v * 4)), int(radius * 0.45 * 4), 1.0, -1, cv2.LINE_AA, shift=2)
    a = np.clip(layer, 0, 1)
    c.canvas[:] = c.canvas * (1 - a[..., None]) + np.asarray(color, np.float32) * a[..., None]


# ======================================================================================
class Chimney(Shot):
    """13.2-19.0 s: House's Chimney (~6,600 m): a climber jumars up the narrow slot."""
    name = 'chimney'
    grade = dict(sat=1.1, warm=0.03, lift=(0.012, 0.012, 0.03), gain=(1.0, 0.99, 0.97), gamma=1.0, vignette=0.38,
                 contrast=0.3)

    def __init__(self, sc):
        super().__init__(sc)
        import setpieces
        o = self.ground(1645, -1495, -0.5)
        self.patch = setpieces.house_chimney(o, (0.387, -0.922))
        p = self.patch
        L = p.local_to_world
        self.L = L
        self.path = CamPath([
            (0.0, L(1.1, -0.6, 6.0), L(0.0, 12.0, -0.6), 64.0, 0.0),
            (1.0, L(0.8, 0.8, 5.2), L(0.0, 14.0, -0.8), 60.0, 0.0),
        ], ease=1.4)
        self.c1 = F.Climber('red', helmet=(0.96, 0.95, 0.9), seed=11)
        self.c2 = F.Climber('yellow', helmet=(0.95, 0.2, 0.12), seed=12, pack=(0.15, 0.22, 0.35))
        # fixed ropes hanging in the slot: (colour, u offset, n depth)
        self.ropes = [((0.15, 0.35, 0.85), 0.05, -0.9), ((0.75, 0.25, 0.2), -0.25, -1.4), ((0.8, 0.7, 0.35), 0.3, -1.8),
                      ((0.85, 0.85, 0.8), -0.1, -2.1)]

    def setup(self):
        self.sc.set_fine()
        self.sc.patches = [self.patch]

    def cam(self, t):
        return self.path.at(self.u(t))

    def pal(self, t):
        return shade.palette('day', sun_az=222, sun_el=44, exposure=0.6)

    def atmos(self, t):
        def f(rgb, tb, pos, dirs, cam, pal):
            sky = tb <= 0
            rgb[sky] = shade.cirrus(rgb[sky], dirs[sky].astype(np.float64), cam.pos, pal, cover=0.35, seed=7.0)
            return rgb
        return f

    def overlay(self, c):
        p = self.patch
        for k, (col, du, dn) in enumerate(self.ropes):
            vs = np.linspace(-1.2, 30.5, 90)
            us = p.slot_center(vs) + du + 0.04 * np.sin(vs * 0.7 + k)
            ns = dn + 0.15 * np.sin(vs * 0.35 + k * 1.3)
            pts = np.array([self.L(u, v, n) for u, v, n in zip(us, vs, ns)])
            F.draw_rope(c.canvas, c.zbuf, c.cam, pts, col, width_m=0.011, min_px=1.0, max_px=4.0, drawing=c.drawing,
                        seed=k, alpha=0.95)
        u = self.u(c.t)
        light = (0.95, -0.55)
        # climber 1 in the chimney (back-and-foot), slowly moving up
        v1 = 6.2 + 1.6 * ease_io(u, 1.3)
        base = self.L(p.slot_center(v1) + 0.05, v1, -0.75)
        self.draw_climber(c, self.c1, base, F.pose_jumar(c.t / 3.4, 70.0, 0.4), facing=1, view='back')
        # climber 2 higher up, already near the top of the chimney
        v2 = 15.5 + 1.2 * ease_io(u, 1.3)
        base2 = self.L(p.slot_center(v2) - 0.05, v2, -0.9)
        self.draw_climber(c, self.c2, base2, F.pose_jumar(c.t / 3.9 + 0.4, 70.0, 0.5), facing=-1, view='back')
        self.paint_figures(c)

    def _draw(self, c, cl_, base, pose, facing=1, light=(1, -0.5), view='side'):
        uv, z = c.cam.project(base[None])
        if z[0] <= 0.3:
            return
        hpx = 1.72 * c.cam.focal / z[0]
        cl_.draw(c.canvas, c.zbuf, uv[0], hpx, z[0], pose, facing=facing, view=view, light_dir=light, light=0.9,
                 ambient=(0.30, 0.34, 0.45), drawing=c.drawing)


# ======================================================================================
# shared helpers for the upper mountain
def fixed_rope(c, rt, s0, s1, color=(0.85, 0.2, 0.15), lift=0.35, step=None, width_m=0.012, max_px=3.0,
               alpha=0.9, seed=0):
    d = np.linalg.norm(rt.pos((s0 + s1) / 2) - c.cam.pos)
    step = step or float(np.clip(d / 60.0, 0.25, 4.0))
    ss = np.arange(s0, s1, step)
    if len(ss) < 2:
        return
    pts = rt.pos(ss, lift)
    # sag between anchors every ~25 m
    ph = (ss - s0) % 25.0 / 25.0
    pts[:, 2] -= 0.35 * np.sin(np.pi * ph)
    F.draw_rope(c.canvas, c.zbuf, c.cam, pts, color, width_m=width_m, min_px=0.8, max_px=max_px,
                drawing=c.drawing, seed=seed, alpha=alpha)


def spindrift(c, amount=1.0, wind=(-14.0, 2.0), color=(0.92, 0.95, 1.0), seed=1, n=900, length=1.0, alpha=0.18):
    """Wind-blown snow crossing the frame (screen-space streaks, deterministic per frame)."""
    H, W = c.canvas.shape[:2]
    rng = np.random.default_rng(seed)
    p0 = rng.random((n, 2)) * np.array([W, H])
    sp = 0.5 + rng.random(n)
    gust = 1.0 + 0.6 * math.sin(c.t * 1.7 + seed)
    w = np.asarray(wind) * gust
    pos = p0 + np.outer(sp * c.t * FPS, w) + 25 * np.stack([np.sin(c.t * 2.1 + p0[:, 1] * 0.01),
                                                            np.cos(c.t * 1.3 + p0[:, 0] * 0.01)], -1)
    pos[:, 0] %= W
    pos[:, 1] %= H
    layer = np.zeros((H, W), np.float32)
    k = int(n * amount)
    for (x, y), s_ in zip(pos[:k], sp[:k]):
        dx, dy = w * s_ * 0.9 * length
        cv2.line(layer, (int(x * 4), int(y * 4)), (int((x - dx) * 4), int((y - dy) * 4)), 1.0, 1, cv2.LINE_AA, shift=2)
    layer = cv2.GaussianBlur(layer, (0, 0), 0.8)
    a = np.clip(layer * alpha * 2.5, 0, alpha)
    c.canvas[:] = c.canvas * (1 - a[..., None]) + np.asarray(color, np.float32) * a[..., None]


def headlamp_light(lamps, power=60.0):
    """lamps: list of (pos(3), dir(3)). Returns light_fn(pos, nrm) -> linear radiance multiplier."""
    def fn(P, N):
        out = np.zeros((len(P), 3))
        for lp, ld in lamps:
            L = lp[None] - P
            d2 = (L * L).sum(-1) + 0.25
            Ln = L / np.sqrt(d2)[:, None]
            lam = np.clip((N * Ln).sum(-1), 0, 1)
            cone = np.clip(((-Ln) @ ld - 0.82) / 0.18, 0, 1) ** 1.5
            out += (power * lam * (0.08 + cone) / d2)[:, None] * np.array([1.0, 0.92, 0.78])
        return out
    return fn


# ======================================================================================
class Pyramid(Shot):
    """19.0-27.0 s: the Black Pyramid - steep dark rock and ice, the glacier 2 km below."""
    name = 'pyramid'
    grade = dict(sat=1.08, warm=0.04, lift=(0.012, 0.012, 0.03), gain=(1.0, 0.985, 0.95), gamma=1.0, vignette=0.36,
                 contrast=0.32)

    def setup(self):
        import finelevels
        g, m = finelevels.pyramid_region(self.sc, 0.3)
        self.sc.set_fine(g, m, 40.0)
        self.sc.patches = []
        self.rt = route.RouteTrack(self.sc, step=0.5)
        sb = self.rt.s_of((1420, -1120))
        self.sb = sb
        self.anchor_s = sb - 18
        d = -self.rt.dir(sb + 20)                 # downhill along the route
        dh = np.array([d[0], d[1], 0.0])
        dh /= np.linalg.norm(dh)
        side = np.cross(dh, [0, 0, 1.0])
        self.orbit_keys = [(0.0, 246.0, -3.0, 265.0, 22.5, 0.0), (1.0, 241.0, -1.0, 232.0, 21.0, 2.0)]
        self.cl = [F.Climber('orange', helmet=(0.95, 0.95, 0.9), seed=21),
                   F.Climber('blue', helmet=(0.95, 0.85, 0.1), seed=22),
                   F.Climber('red', helmet=(0.95, 0.95, 0.9), seed=23, pack=(0.25, 0.2, 0.15))]
        self.offs = [-6.0, -19.0, -33.0]

    def cam(self, t):
        u = float(ease_io(self.u(t), 1.3))
        k0, k1 = self.orbit_keys
        az, el, dist, fov, ldz = [a + (b - a) * u for a, b in zip(k0[1:], k1[1:])]
        subj = self.rt.pos(self.anchor_s + 0.11 * (t - self.t0)) + np.array([0, 0, 1.0])
        pos = orbit_pos(self.sc, subj, az, el, dist)
        return Camera(pos, subj + np.array([0, 0, ldz]), hfov_deg=fov, roll_deg=0.0, W=W_OUT, H=H_OUT)

    def pal(self, t):
        return shade.palette('afternoon', sun_az=248, sun_el=27, exposure=0.6, haze_dens=1.0 / 90000,
                             cloud_shadow=(1500.0, 0.35, 2.0 + t * 0.01, 0.4))

    def atmos(self, t):
        def f(rgb, tb, pos, dirs, cam, pal):
            sky = tb <= 0
            rgb[sky] = shade.cirrus(rgb[sky], dirs[sky].astype(np.float64), cam.pos, pal, cover=0.4, seed=11.0)
            cl.sea_of_clouds(rgb, tb, dirs, cam, pal, zb=5600.0, zt=6350.0, scale=1700.0, cover=0.40,
                             sigma=0.006, nsteps=14, wind=(t * 0.004, 0.0))
            return rgb
        return f

    def overlay(self, c):
        rt = self.rt
        fixed_rope(c, rt, self.sb - 90, self.sb + 60, color=(0.9, 0.35, 0.12), seed=3)
        fixed_rope(c, rt, self.sb - 90, self.sb + 60, color=(0.55, 0.6, 0.7), lift=0.25, seed=4, alpha=0.6)
        for k, (cl_, o) in enumerate(zip(self.cl, self.offs)):
            s = self.sb + o + 0.11 * (c.t - self.t0)
            base = rt.pos(s)
            self.draw_climber(c, cl_, base, F.pose_jumar(c.t / (3.0 + 0.4 * k) + 0.3 * k, 48.0, 0.5),
                              facing=1 if k % 2 == 0 else 1, view='back' if k == 0 else 'side')
        self.paint_figures(c)


# ======================================================================================
TENT_COLORS = [(0.96, 0.74, 0.12), (0.94, 0.45, 0.10), (0.80, 0.14, 0.10), (0.96, 0.80, 0.20)]


class Shoulder(Shot):
    """27.0-33.0 s: the Shoulder and Camp IV (~7,900 m) at dusk; wind; the summit still lit."""
    name = 'shoulder'
    grade = dict(sat=1.12, warm=0.05, lift=(0.02, 0.012, 0.04), gain=(1.0, 0.96, 0.98), gamma=1.0, vignette=0.42,
                 contrast=0.3)

    def setup(self):
        import finelevels
        g, m = finelevels.summit_region(self.sc, 0.35)
        self.sc.set_fine(g, m, 40.0)
        self.sc.patches = []
        self.rt = route.RouteTrack(self.sc, step=0.5)
        fr = self.sc.frame
        self.s4 = self.rt.s_of((698, -332))
        w = lambda a, l, dz=0.0: self.ground(*fr.world(a, l), dz)  # noqa: E731
        self.tents = []
        for k, (ds, lat) in enumerate([(-48, 9.0), (-41, 13.0), (-55, 15.0), (-36, 7.5)]):
            pp = self.rt.pos(self.s4 + ds)
            dd = self.rt.dir(self.s4 + ds)
            sd = np.cross(np.array([dd[0], dd[1], 0.0]) / (np.hypot(dd[0], dd[1]) + 1e-9), [0, 0, 1.0])
            q = pp - sd * lat
            self.tents.append((self.ground(q[0], q[1], 0.0), 2.3 if k != 2 else 2.7, TENT_COLORS[k]))
        rt = self.rt
        c0 = rt.pos(self.s4 - 96)
        d = rt.dir(self.s4 - 80)
        side = np.cross(np.array([d[0], d[1], 0.0]) / (np.hypot(d[0], d[1]) + 1e-9), [0, 0, 1.0])
        p0 = c0 + side * 5.0 + np.array([0, 0, 1.8])
        p1 = rt.pos(self.s4 - 93) + side * 4.6 + np.array([0, 0, 2.1])
        self.path = CamPath([(0.0, p0, w(-10, -8, 22.0), 60.0, -1.0),
                             (1.0, p1, w(10, -4, 40.0), 58.0, -1.0)], ease=1.3)
        self.cl = [F.Climber('red', helmet=None, seed=31, oxygen=True), F.Climber('yellow', helmet=None, seed=32)]

    def cam(self, t):
        return self.path.at(self.u(t))

    def pal(self, t):
        u = self.u(t)
        return shade.palette('sunset', sun_az=289, sun_el=2.6 - 1.2 * u, exposure=0.95 + 0.2 * u)

    def atmos(self, t):
        def f(rgb, tb, pos, dirs, cam, pal):
            cl.sea_of_clouds(rgb, tb, dirs, cam, pal, zb=5200.0, zt=6500.0, scale=2600.0, cover=0.55,
                             sigma=0.006, nsteps=14, wind=(t * 0.003, 0.0))
            cl.summit_plume(rgb, tb, dirs, cam, pal, top=(-80, -200, 8600), wind_dir=(0.75, 0.66), length=900,
                            r0=10, grow=0.12, dens=0.006, tphase=t * 0.9)
            return rgb
        return f

    def overlay(self, c):
        u = self.u(c.t)
        for k, (p, size, col) in enumerate(self.tents):
            F.draw_tent(c.canvas, c.zbuf, c.cam, p, size, col, glow=0.15 + 0.35 * u, light=0.2,
                        ambient=(0.22, 0.20, 0.30), drawing=c.drawing, seed=k, depth_tol=1.0)
        fixed_rope(c, self.rt, self.s4 + 10, self.s4 + 260, color=(0.85, 0.85, 0.8), seed=7, alpha=0.5)
        for k, cl_ in enumerate(self.cl):
            s = self.s4 - 72 - 13 * k + 0.25 * (c.t - self.t0)
            self.draw_climber(c, cl_, self.rt.pos(s), F.pose_jumar(c.t / (3.6 + 0.5 * k), 18.0, 0.8),
                              facing=1, view='back')
        self.paint_figures(c)
        spindrift(c, amount=0.9, wind=(-16.0, 1.5), seed=5, alpha=0.16)


# ======================================================================================
class Bottleneck(Shot):
    """33.0-38.8 s: night; headlamps climb the Bottleneck couloir beneath the hanging serac."""
    name = 'bottleneck'
    grade = dict(sat=1.05, warm=0.0, lift=(0.008, 0.012, 0.035), gain=(0.95, 0.98, 1.05), gamma=1.0, vignette=0.5,
                 contrast=0.25)

    def setup(self):
        import finelevels
        g, m = finelevels.summit_region(self.sc, 0.35)
        self.sc.set_fine(g, m, 40.0)
        self.sc.patches = []
        self.rt = route.RouteTrack(self.sc, step=0.5)
        fr = self.sc.frame
        self.sB = self.rt.s_of(fr.world(0, 0))
        w = lambda a, l, dz=0.0: self.ground(*fr.world(a, l), dz)  # noqa: E731
        self.path = CamPath([
            (0.0, w(-72, -42, 6.0), w(120, 8, 20.0), 58.0, 0.0),
            (1.0, w(-58, -36, 6.5), w(128, 8, 26.0), 55.0, 0.0),
        ], ease=1.3)
        self.cl = [F.Climber(col, seed=40 + k, oxygen=(k % 2 == 0)) for k, col in
                   enumerate(['red', 'yellow', 'orange', 'blue', 'red'])]
        self.offs = [8.0, 21.0, 35.0, 51.0, 68.0]

    def climbers3d(self, t):
        out = []
        for k, o in enumerate(self.offs):
            s = self.sB + o + 0.09 * (t - self.t0)
            out.append((s, self.rt.pos(s)))
        return out

    def light_fn(self, t):
        lamps = []
        for s, p in self.climbers3d(t):
            d = self.rt.dir(s)
            lamps.append((p + np.array([0, 0, 1.55]), d / np.linalg.norm(d)))
        return headlamp_light(lamps, power=55.0)

    def cam(self, t):
        return self.path.at(self.u(t))

    def pal(self, t):
        return shade.palette('night', moon_az=228, moon_el=24, exposure=5.5)

    def atmos(self, t):
        def f(rgb, tb, pos, dirs, cam, pal):
            cl.sea_of_clouds(rgb, tb, dirs, cam, pal, zb=5200.0, zt=6600.0, scale=2600.0, cover=0.55,
                             sigma=0.006, nsteps=12)
            return rgb
        return f

    def overlay(self, c):
        fixed_rope(c, self.rt, self.sB - 40, self.sB + 160, color=(0.55, 0.15, 0.12), seed=9, alpha=0.7)
        heads = []
        for k, (s, p) in enumerate(self.climbers3d(c.t)):
            cl_ = self.cl[k]
            self.draw_climber(c, cl_, p, F.pose_jumar(c.t / (4.4 + 0.3 * k) + 0.27 * k, 55.0, 0.8),
                              facing=1, view='back', headlamp=1.0)
            uv, z = c.cam.project((p + np.array([0, 0, 1.55]))[None])
            if z[0] > 0:
                d3 = self.rt.dir(s)
                uv2, _ = c.cam.project((p + np.array([0, 0, 1.55]) + d3 * 3.0 - np.array([0, 0, 0.6]))[None])
                heads.append((uv[0], uv2[0] - uv[0], 1.72 * c.cam.focal / z[0]))
        self.paint_figures(c)
        for hp, dpx, hpx in heads:
            F.headlamp_beam(c.canvas, hp, dpx, length_px=hpx * 2.2, width_deg=20, intensity=0.35)
            glow_dot(c.canvas, hp, max(1.5, hpx * 0.035), 1.4)
        spindrift(c, amount=0.6, wind=(-9.0, 3.0), seed=8, alpha=0.12, color=(0.75, 0.82, 1.0))


def glow_dot(canvas, p, r, inten, color=(1.0, 0.95, 0.85)):
    H, W = canvas.shape[:2]
    R = int(r * 6) + 2
    x0, y0 = int(p[0]) - R, int(p[1]) - R
    xa, xb, ya, yb = max(0, x0), min(W, x0 + 2 * R), max(0, y0), min(H, y0 + 2 * R)
    if xa >= xb or ya >= yb:
        return
    yy, xx = np.mgrid[ya:yb, xa:xb].astype(np.float32)
    d2 = (xx - p[0]) ** 2 + (yy - p[1]) ** 2
    g = np.exp(-d2 / (2 * r * r)) * inten + np.exp(-d2 / (2 * (r * 4) ** 2)) * inten * 0.15
    canvas[ya:yb, xa:xb] += g[..., None] * np.asarray(color, np.float32)


# ======================================================================================
class Traverse(Shot):
    """38.8-44.4 s: dawn; the exposed leftward traverse beneath the ice cliff."""
    name = 'traverse'
    grade = dict(sat=1.12, warm=0.05, lift=(0.02, 0.012, 0.04), gain=(1.0, 0.97, 0.98), gamma=1.0, vignette=0.42,
                 contrast=0.3)

    def setup(self):
        import finelevels
        g, m = finelevels.summit_region(self.sc, 0.35)
        self.sc.set_fine(g, m, 40.0)
        self.sc.patches = []
        self.rt = route.RouteTrack(self.sc, step=0.5)
        fr = self.sc.frame
        self.sT = self.rt.s_of(fr.world(152, 50))
        w = lambda a, l, dz=0.0: self.ground(*fr.world(a, l), dz)  # noqa: E731
        self.path = CamPath([
            (0.0, w(143, 12, 8.0), w(170, 135, 25.0), 60.0, 1.0),
            (1.0, w(147, 40, 9.0), w(173, 168, 25.0), 58.0, 1.0),
        ], ease=1.2)
        self.cl = [F.Climber(col, seed=60 + k, oxygen=(k != 1)) for k, col in enumerate(['yellow', 'red', 'orange'])]
        self.offs = [26.0, 40.0, 55.0]

    def climbers3d(self, t):
        return [(self.sT + o + 0.12 * (t - self.t0), self.rt.pos(self.sT + o + 0.12 * (t - self.t0)))
                for o in self.offs]

    def light_fn(self, t):
        lamps = [(p + np.array([0, 0, 1.55]), self.rt.dir(s)) for s, p in self.climbers3d(t)]
        return headlamp_light(lamps, power=30.0)

    def cam(self, t):
        u = float(ease_io(self.u(t), 1.2))
        fr = self.sc.frame
        up_dir = np.array([fr.up[0], fr.up[1], 0.0])
        left = np.array([fr.left[0], fr.left[1], 0.0])
        cl_ = [p + np.array([0, 0, 1.0]) for s_, p in self.climbers3d(t)]
        cen = np.mean(cl_, 0)
        if not hasattr(self, '_cen0'):
            self._cen0 = cen
        pos = self._cen0 - up_dir * 60.0 - left * (80.0 - 22.0 * u) + np.array([0, 0, 16.0 + 4.0 * u])
        tgt = cen + np.array([0, 0, 13.0])
        return Camera(pos, tgt, hfov_deg=52.0 - 4.0 * u, roll_deg=-1.0, W=W_OUT, H=H_OUT)

    def pal(self, t):
        u = self.u(t)
        return shade.palette('dawn', sun_az=68, sun_el=-3.2 + 0.9 * u, exposure=3.2 - 0.6 * u)

    def atmos(self, t):
        def f(rgb, tb, pos, dirs, cam, pal):
            cl.sea_of_clouds(rgb, tb, dirs, cam, pal, zb=5000.0, zt=6700.0, scale=3000.0, cover=0.62,
                             sigma=0.006, nsteps=14)
            return rgb
        return f

    def overlay(self, c):
        fixed_rope(c, self.rt, self.sT - 10, self.sT + 150, color=(0.15, 0.4, 0.9), seed=12, alpha=0.85)
        heads = []
        for k, (s, p) in enumerate(self.climbers3d(c.t)):
            self.draw_climber(c, self.cl[k], p, F.pose_traverse(c.t / (3.4 + 0.4 * k) + 0.3 * k, 0.8),
                              facing=-1 if k % 2 else -1, view='side', headlamp=0.7)
            uv, z = c.cam.project((p + np.array([0, 0, 1.55]))[None])
            if z[0] > 0:
                heads.append((uv[0], 1.72 * c.cam.focal / z[0]))
        self.paint_figures(c)
        for hp, hpx in heads:
            glow_dot(c.canvas, hp, max(1.2, hpx * 0.03), 0.9)
        spindrift(c, amount=0.5, wind=(-11.0, 2.5), seed=13, alpha=0.12)


# ======================================================================================
class Ridge(Shot):
    """44.4-48.2 s: the final snow slopes toward the summit in morning light."""
    name = 'ridge'
    grade = dict(sat=1.12, warm=0.04, lift=(0.012, 0.014, 0.035), gain=(1.0, 0.99, 0.97), gamma=1.0, vignette=0.36,
                 contrast=0.32)

    def setup(self):
        import finelevels
        g, m = finelevels.summit_region(self.sc, 0.35)
        self.sc.set_fine(g, m, 40.0)
        self.sc.patches = []
        self.rt = route.RouteTrack(self.sc, step=0.5)
        self.sR = self.rt.s_of((60, -275))
        self.anchor_s = self.sR
        rt = self.rt
        p = rt.pos(self.sR - 22)
        d = rt.dir(self.sR)
        dh = np.array([d[0], d[1], 0])
        dh /= np.linalg.norm(dh)
        side = np.cross(dh, [0, 0, 1.0])
        self.path = CamPath([
            (0.0, p + side * 6.0 + np.array([0, 0, 1.2]), rt.pos(self.sR + 60) + np.array([0, 0, 8.0]), 58.0, -4.0),
            (1.0, p + side * 4.0 + dh * 5.0 + np.array([0, 0, 1.6]), rt.pos(self.sR + 70) + np.array([0, 0, 10.0]),
             56.0, -3.0),
        ], ease=1.3)
        self.cl = [F.Climber('red', seed=71, oxygen=True), F.Climber('yellow', seed=72, oxygen=True)]

    def cam(self, t):
        u = float(ease_io(self.u(t), 1.3))
        az, el, dist, fov = 318 + 12 * u, 3.0 + 2.5 * u, 15.0 - 2.5 * u, 62.0 - 4.0 * u
        subj = self.rt.pos(self.sR + 0.22 * (t - self.t0)) + np.array([0, 0, 1.0])
        pos = orbit_pos(self.sc, subj, az, el, dist)
        return Camera(pos, subj + np.array([0, 0, 1.0]), hfov_deg=fov, roll_deg=-2.0, W=W_OUT, H=H_OUT)

    def pal(self, t):
        return shade.palette('summit', sun_az=112, sun_el=24, exposure=0.56, haze_dens=1.0 / 110000)

    def atmos(self, t):
        def f(rgb, tb, pos, dirs, cam, pal):
            sky = tb <= 0
            rgb[sky] = shade.cirrus(rgb[sky], dirs[sky].astype(np.float64), cam.pos, pal, cover=0.3, seed=21.0)
            cl.sea_of_clouds(rgb, tb, dirs, cam, pal, zb=4700.0, zt=5900.0, scale=2600.0, cover=0.46,
                             sigma=0.006, nsteps=12)
            return rgb
        return f

    def overlay(self, c):
        fixed_rope(c, self.rt, self.sR - 40, self.sR + 120, color=(0.9, 0.85, 0.75), seed=15, alpha=0.6)
        for k, cl_ in enumerate(self.cl):
            s = self.sR + 4 - 9 * k + 0.22 * (c.t - self.t0)
            self.draw_climber(c, cl_, self.rt.pos(s), F.pose_jumar(c.t / (3.2 + 0.4 * k) + 0.4 * k, 38.0, 0.9),
                              facing=-1, view='side')
        self.paint_figures(c)
        spindrift(c, amount=0.5, wind=(-12.0, 1.0), seed=17, alpha=0.14)


# ======================================================================================
class Summit(Shot):
    """48.2-51.2 s: on top of K2, 8,611 m; the Karakoram falls away on every side."""
    name = 'summit'
    grade = dict(sat=1.14, warm=0.05, lift=(0.012, 0.014, 0.035), gain=(1.0, 0.99, 0.96), gamma=1.0, vignette=0.34,
                 contrast=0.32)

    def setup(self):
        Ridge.setup(self)
        self.top = self.rt.pos(self.rt.S[-1])
        self.anchor_s = self.rt.S[-1]
        self.cl = [F.Climber('red', seed=71, oxygen=True), F.Climber('yellow', seed=72, oxygen=True)]

    def orbit_params(self, u):
        return 215.0 + 35.0 * u, 1.0 + 3.0 * u, 22.0 - 3.0 * u

    def cam(self, t):
        u = float(ease_io(self.u(t), 1.2))
        az, el, dist = self.orbit_params(u)
        subj = self.top + np.array([0, 0, 1.2])
        pos = orbit_pos(self.sc, subj, az, el, dist)
        return Camera(pos, subj + np.array([0, 0, 1.0]), hfov_deg=62.0, roll_deg=-1.5, W=W_OUT, H=H_OUT)

    def pal(self, t):
        return Ridge.pal(self, t)

    def atmos(self, t):
        return Ridge.atmos(self, t)

    def overlay(self, c):
        S = self.rt.S[-1]
        u = self.u(c.t)
        poses = [F.pose_stand(c.t / 4.0, raise_arm=0.0), F.pose_stand(c.t / 4.6 + 0.3, raise_arm=0.0)]
        for k, cl_ in enumerate(self.cl):
            s = S - 0.5 - 2.6 * k
            self.draw_climber(c, cl_, self.rt.pos(s), poses[k], facing=1 if k == 0 else -1, view='side')
        self.paint_figures(c)
        spindrift(c, amount=0.4, wind=(-12.0, 1.0), seed=19, alpha=0.12)


class Pullback(Shot):
    """51.2-56.0 s: pull back until the climbers are specks on K2 - and the way down is long."""
    name = 'pullback'
    grade = Summit.grade

    def setup(self):
        Ridge.setup(self)
        self.top = self.rt.pos(self.rt.S[-1])
        self.line, _ = route.draped(self.sc, step=3.0, lift=1.5)

    def cam(self, t):
        # continue the summit orbit outward and down to the south-east, until K2 towers over
        # two specks on its summit and the long way down
        u = float(np.clip(self.u(t), 0, 1))
        e = 1 - (1 - u) ** 2.4
        az = 250.0 - 140.0 * e
        el = 4.0 - 10.0 * e
        dist = 19.0 * (3000.0 / 19.0) ** e
        subj = self.top + np.array([0, 0, 1.2])
        pos = orbit_pos(self.sc, subj, az, el, dist, clearance=4.0)
        tgt = subj + np.array([0, 0, 1.0 - 0.10 * dist])
        return Camera(pos, tgt, hfov_deg=62.0 - 14.0 * e, roll_deg=-1.5 * (1 - e), W=W_OUT, H=H_OUT)

    def pal(self, t):
        return shade.palette('summit', sun_az=114, sun_el=25, exposure=0.56, haze_dens=1.0 / 110000)

    def atmos(self, t):
        return Ridge.atmos(self, t)

    def overlay(self, c):
        S = self.rt.S[-1]
        u = self.u(c.t)
        # the descent: a faint dotted line back down the route appears late in the shot
        a = smoothstep(0.45, 0.85, u)
        if a > 0:
            n = len(self.line)
            k0 = int(n * (1 - smoothstep(0.45, 1.0, u)))
            pts = self.line[k0:][::-1]
            draw_route_line(c, self.line[k0:], color=(1.0, 0.88, 0.7), width=2.2, glow=0.25, alpha=0.75 * a)
        cls = [F.Climber('red', seed=71, oxygen=True), F.Climber('yellow', seed=72, oxygen=True)]
        for k, cl_ in enumerate(cls):
            s = S - 0.5 - 2.6 * k - 0.6 * max(0.0, c.t - self.t0 - 2.0)
            self.draw_climber(c, cl_, self.rt.pos(s), F.pose_jumar(c.t / 3.6 + k * 0.4, 30.0, 0.9),
                              facing=1, view='side')
        self.paint_figures(c)
