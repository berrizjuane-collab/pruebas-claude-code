"""Hand-drawn climbers, ropes, tents and headlamps, composited over the painted frame.

Characters are animated 2-D figures (as in traditional animation over painted
backgrounds): an articulated skeleton posed per frame, filled with flat paint, a lit
and a shadow side, ragged outlines that are redrawn every second frame (boil on twos).
They are placed with the 3-D camera, scaled by perspective and depth-tested against
the terrain.
"""
import math
import numpy as np
import cv2

SUIT_COLORS = {
    'red': (0.78, 0.14, 0.10), 'orange': (0.93, 0.42, 0.08), 'yellow': (0.95, 0.74, 0.12),
    'blue': (0.12, 0.30, 0.62), 'green': (0.18, 0.45, 0.30), 'purple': (0.40, 0.22, 0.52),
}


def _rot(v, a):
    c, s = math.cos(a), math.sin(a)
    return np.array([c * v[0] - s * v[1], s * v[0] + c * v[1]])


class Pose:
    """Joint angles in degrees. Limb angles measured from straight down, + = forward."""

    def __init__(self, lean=10, head=0, hipF=10, kneeF=-10, hipB=-5, kneeB=5,
                 shF=30, elF=20, shB=-20, elB=15, crouch=0.0):
        self.__dict__.update(locals())
        del self.__dict__['self']

    @staticmethod
    def lerp(a, b, t):
        p = Pose()
        for k in a.__dict__:
            setattr(p, k, getattr(a, k) + (getattr(b, k) - getattr(a, k)) * t)
        return p


def pose_jumar(phase, slope_deg=35.0, fatigue=0.5):
    """Uphill step on a fixed rope (front hand pushes the ascender up)."""
    ph = phase % 1.0
    # a step takes the first 45 % of the cycle, then the climber rests/breathes
    st = min(ph / 0.45, 1.0)
    e = 0.5 - 0.5 * math.cos(math.pi * st)
    lean = 10 + slope_deg * 0.25 + 5 * math.sin(2 * math.pi * ph) * fatigue
    lift = math.sin(math.pi * st)
    p = Pose(lean=lean, head=-8 - 6 * fatigue,
             hipF=25 + 30 * lift + slope_deg * 0.4, kneeF=-35 - 40 * lift,
             hipB=-10 - 10 * e + slope_deg * 0.15, kneeB=10 + 10 * e,
             shF=100 + slope_deg * 0.6 + 10 * (1 - e), elF=12 - 8 * (1 - e),
             shB=-15 + 25 * lift, elB=35, crouch=0.05 * lift)
    return p


def pose_traverse(phase, fatigue=0.6):
    ph = phase % 1.0
    st = min(ph / 0.5, 1.0)
    lift = math.sin(math.pi * st)
    return Pose(lean=10, head=-5, hipF=15 + 22 * lift, kneeF=-20 - 25 * lift, hipB=-12, kneeB=8,
                shF=72 + 8 * lift, elF=18, shB=-12, elB=28, crouch=0.04)


def pose_chimney(phase):
    """Back-and-foot in a chimney: back on one wall, feet pushing the other."""
    ph = phase % 1.0
    s = math.sin(2 * math.pi * ph)
    return Pose(lean=-6 + 4 * s, head=12, hipF=75 + 10 * s, kneeF=-55 - 15 * s, hipB=60 - 10 * s,
                kneeB=-50 + 10 * s, shF=150 + 10 * s, elF=15, shB=70 - 20 * s, elB=50, crouch=0.10)


def pose_stand(phase, raise_arm=0.0):
    b = 2 * math.sin(2 * math.pi * phase)
    return Pose(lean=4 + b, head=-2, hipF=4, kneeF=-3, hipB=-4, kneeB=3, shF=20 + 140 * raise_arm,
                elF=15 - 10 * raise_arm, shB=-12, elB=20, crouch=0.0)


def _capsule(img, a, b, r, color, aa=cv2.LINE_AA):
    a = tuple(int(round(v * 4)) for v in a)
    b = tuple(int(round(v * 4)) for v in b)
    cv2.line(img, a, b, color, max(1, int(round(r * 2))), aa, shift=2)


def _poly(img, pts, color):
    p = (np.asarray(pts) * 4).round().astype(np.int32)
    cv2.fillPoly(img, [p], color, cv2.LINE_AA, shift=2)


def _circle(img, c, r, color):
    cv2.circle(img, tuple(int(round(v * 4)) for v in c), max(1, int(round(r * 4))), color, -1, cv2.LINE_AA, shift=2)


class ClimberV1:
    def __init__(self, suit='red', pants=(0.08, 0.08, 0.10), pack=(0.20, 0.22, 0.26), helmet=None,
                 boots=(0.92, 0.72, 0.15), seed=0, oxygen=False):
        self.suit = np.array(SUIT_COLORS.get(suit, suit) if isinstance(suit, str) else suit)
        self.pants = np.array(pants)
        self.pack = np.array(pack)
        self.helmet = np.array(helmet) if helmet is not None else None
        self.boots = np.array(boots)
        self.seed = seed
        self.oxygen = oxygen

    def skeleton(self, pose: Pose, facing=1):
        """Return dict of 2-D joint positions in body units (feet at y=0, height ~1)."""
        f = facing
        P = {}
        crouch = pose.crouch
        hip = np.array([0.0, 0.48 - crouch])
        lean = math.radians(pose.lean) * f
        up = np.array([math.sin(lean), math.cos(lean)])
        neck = hip + up * 0.29
        P['hip'] = hip
        P['neck'] = neck
        hd = math.radians(pose.lean * 0.6 + pose.head) * f
        P['head'] = neck + np.array([math.sin(hd), math.cos(hd)]) * 0.095 + np.array([0.025 * f, 0.0])

        def limb(root, a1, a2, l1, l2):
            a1r = math.radians(a1) * f
            k = root + np.array([math.sin(a1r), -math.cos(a1r)]) * l1
            a2r = math.radians(a1 + a2) * f
            e = k + np.array([math.sin(a2r), -math.cos(a2r)]) * l2
            return k, e

        P['kneeF'], P['ankleF'] = limb(hip, pose.hipF, pose.kneeF, 0.245, 0.24)
        P['kneeB'], P['ankleB'] = limb(hip, pose.hipB, pose.kneeB, 0.245, 0.24)
        sh = neck - up * 0.045
        P['sh'] = sh
        P['elbF'], P['handF'] = limb(sh, pose.shF, pose.elF, 0.16, 0.15)
        P['elbB'], P['handB'] = limb(sh, pose.shB, pose.elB, 0.16, 0.15)
        P['up'] = up
        return P

    def draw(self, canvas, zbuf, base_px, height_px, depth, pose, facing=1, view='side', light_dir=(-0.6, -0.8),
             light=1.0, ambient=(0.35, 0.40, 0.52), drawing=0, headlamp=0.0, roll=0.0, alpha=1.0,
             rope_hand=None, sun=None, sky=None, exposure=None, mask=None):
        """Draw onto canvas (H,W,3 float) where zbuf (H,W, metres) is farther than depth."""
        H, W = canvas.shape[:2]
        s = height_px
        if s < 1.2:
            return
        pad = int(s * 0.9) + 6
        x0 = int(base_px[0] - pad)
        y0 = int(base_px[1] - s * 1.25 - pad)
        x1 = int(base_px[0] + pad)
        y1 = int(base_px[1] + pad * 0.6)
        if x1 < 0 or y1 < 0 or x0 >= W or y0 >= H:
            return
        lw, lh = x1 - x0, y1 - y0
        col = np.zeros((lh, lw, 3), np.float32)
        a = np.zeros((lh, lw), np.float32)
        rng = np.random.default_rng((self.seed * 7919 + drawing * 104729) & 0x7fffffff)
        jit = lambda: rng.normal(0, 0.012)   # noqa: E731  (line boil)
        P = self.skeleton(pose, facing)
        rr = math.radians(roll)

        def tp(p):
            q = _rot(np.array([p[0], p[1]]), rr)
            return (base_px[0] - x0 + (q[0] + jit()) * s, base_px[1] - y0 - (q[1] + jit()) * s)

        # paint buffers (per part: color index layers drawn into col/a)
        layer = np.zeros((lh, lw, 4), np.float32)

        def put(fn, color, *args):
            m = np.zeros((lh, lw), np.uint8)
            fn(m, *args, 255)
            mm = m.astype(np.float32) / 255.0
            layer[..., :3] = layer[..., :3] * (1 - mm[..., None]) + np.asarray(color, np.float32) * mm[..., None]
            layer[..., 3] = np.maximum(layer[..., 3], mm)

        th = 0.085   # limb half-thickness (down suit)
        far = 0.82   # far-side limbs darker
        suit_d = self.suit * 0.55
        # far limbs first
        if view == 'side':
            put(_capsule, self.pants * far if self.oxygen else suit_d, tp(P['hip']), tp(P['kneeB']), th * s)
            put(_capsule, self.pants * far if self.oxygen else suit_d, tp(P['kneeB']), tp(P['ankleB']), th * 0.85 * s)
            put(_capsule, self.boots * 0.7, tp(P['ankleB']), tp(P['ankleB'] + np.array([0.07 * facing, -0.02])), 0.05 * s)
            put(_capsule, suit_d, tp(P['sh']), tp(P['elbB']), th * 0.8 * s)
            put(_capsule, suit_d, tp(P['elbB']), tp(P['handB']), th * 0.7 * s)
            put(_circle, (0.05, 0.05, 0.06), tp(P['handB']), 0.045 * s)
        # backpack (behind torso)
        up = P['up']
        side = np.array([up[1], -up[0]]) * facing
        if view in ('side', 'back'):
            back = -side if view == 'side' else np.zeros(2)
            c0 = P['hip'] + up * 0.10 + back * 0.12
            c1 = P['neck'] + up * 0.02 + back * 0.12
            w = 0.13 if view == 'side' else 0.17
            pts = [c0 - side * w * 0.6, c0 + side * w * 0.6 + back * 0.05, c1 + side * w * 0.6 + back * 0.05,
                   c1 - side * w * 0.6 + up * 0.03]
            if view == 'side':
                pts = [c0 + back * 0.08, c0 - back * 0.06, c1 - back * 0.06, c1 + back * 0.09 + up * 0.03]
            put(_poly, self.pack, [tp(p) for p in pts])
        # torso (puffy)
        tw = 0.115
        t0 = P['hip'] + side * 0.0
        pts = [P['hip'] - side * tw, P['hip'] + side * tw, P['neck'] + side * tw * 0.95, P['neck'] - side * tw * 0.95]
        put(_poly, self.suit, [tp(p) for p in pts])
        put(_capsule, self.suit, tp(P['hip']), tp(P['neck']), tw * 1.0 * s)
        # harness
        put(_capsule, (0.12, 0.12, 0.14), tp(P['hip'] - side * tw), tp(P['hip'] + side * tw), 0.025 * s)
        # near legs
        legc = self.pants if self.oxygen else self.suit * 0.9
        put(_capsule, legc, tp(P['hip']), tp(P['kneeF']), th * s)
        put(_capsule, legc, tp(P['kneeF']), tp(P['ankleF']), th * 0.85 * s)
        put(_capsule, self.boots, tp(P['ankleF']), tp(P['ankleF'] + np.array([0.08 * facing, -0.02])), 0.055 * s)
        if view != 'side':
            put(_capsule, legc * 0.85, tp(P['hip'] + side * 0.06), tp(P['kneeB'] + side * 0.06), th * s)
            put(_capsule, legc * 0.85, tp(P['kneeB'] + side * 0.06), tp(P['ankleB'] + side * 0.06), th * 0.85 * s)
            put(_capsule, self.boots * 0.85, tp(P['ankleB'] + side * 0.06),
                tp(P['ankleB'] + side * 0.06 + np.array([0.05, -0.02])), 0.05 * s)
        # head: hood + face/goggles + helmet
        hood = self.suit * 0.92
        put(_circle, hood, tp(P['head']), 0.082 * s)
        if self.helmet is not None:
            hc = P['head'] + up * 0.03 - side * 0.01
            a0 = math.atan2(up[1], up[0])
            dome = [tp(hc + np.array([math.cos(a_), math.sin(a_)]) * 0.072) for a_ in np.linspace(a0 - 1.75, a0 + 1.75, 14)]
            put(_poly, self.helmet, dome)
        if view in ('side', 'front'):
            fdir = side if view == 'side' else np.zeros(2)
            g0 = P['head'] + fdir * 0.035 - up * 0.004
            g1 = P['head'] + fdir * 0.075 - up * 0.012
            put(_capsule, (0.07, 0.065, 0.075), tp(g0), tp(g1), 0.024 * s)   # goggles band
            if self.oxygen:
                put(_circle, (0.16, 0.16, 0.18), tp(g1 - up * 0.04 - fdir * 0.01), 0.03 * s)
        # near arm (holding the ascender on the rope)
        put(_capsule, self.suit * 0.95, tp(P['sh']), tp(P['elbF']), th * 0.85 * s)
        put(_capsule, self.suit * 0.95, tp(P['elbF']), tp(P['handF']), th * 0.75 * s)
        put(_circle, (0.06, 0.06, 0.07), tp(P['handF']), 0.05 * s)
        # cow-tail from harness to the hand / rope
        hand = np.array(tp(P['handF']))
        harness = np.array(tp(P['hip'] + side * 0.03))
        if s > 18 and view == 'side':
            m = np.zeros((lh, lw), np.uint8)
            cv2.line(m, tuple((harness * 4).astype(int)), tuple((hand * 4).astype(int)), 255,
                     max(1, int(s * 0.012)), cv2.LINE_AA, shift=2)
            mm = m.astype(np.float32) / 255 * 0.8
            layer[..., :3] = layer[..., :3] * (1 - mm[..., None]) + np.array([0.95, 0.85, 0.2]) * mm[..., None]
            layer[..., 3] = np.maximum(layer[..., 3], mm)
        # --- light: lit side vs shadow side across the body (screen-space light direction)
        if layer[..., 3].max() <= 0:
            return
        yy, xx = np.mgrid[0:lh, 0:lw].astype(np.float32)
        cxp, cyp = tp(P['hip'] * 0.5 + P['neck'] * 0.5)
        ld = np.array(light_dir, np.float32)
        ld /= np.linalg.norm(ld) + 1e-6
        proj = ((xx - cxp) * ld[0] + (yy - cyp) * ld[1]) / (0.25 * s + 1e-3)
        lit = np.clip(0.5 + 0.9 * proj, 0, 1)
        lit = cv2.GaussianBlur(lit, (0, 0), max(0.6, s * 0.02))
        if sun is not None:
            # linear light: albedo * (sky + sun * lit) then the same filmic curve as the scene
            alb = np.clip(layer[..., :3], 0, 1) ** 2.2
            E = np.asarray(sky, np.float32)[None, None] + np.asarray(sun, np.float32)[None, None] * (light * lit)[..., None]
            x = np.maximum(alb * E * exposure, 0)
            rgb = np.clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1) ** (1 / 2.2)
        else:
            shade = np.asarray(ambient, np.float32)[None, None] + light * lit[..., None] * np.array([1.0, 0.95, 0.88])
            rgb = layer[..., :3] * shade
        if headlamp > 0:
            hp = P['head'] + side * 0.07 + up * 0.03
            hx, hy = tp(hp)
            g = np.exp(-((xx - hx) ** 2 + (yy - hy) ** 2) / (2 * (0.03 * s + 0.8) ** 2))
            rgb += g[..., None] * np.array([1.0, 0.95, 0.85]) * 3.0 * headlamp
            al_head = g
        else:
            al_head = 0
        al = np.clip(layer[..., 3], 0, 1) * alpha
        if s > 14:
            k = max(1, int(round(s * 0.012)))
            dil = cv2.dilate(al, np.ones((2 * k + 1, 2 * k + 1), np.uint8))
            ring = np.clip(dil - al, 0, 1)
            ink = np.asarray(ambient, np.float32) * 0.25
            rgb = rgb * (1 - ring[..., None]) + ink * ring[..., None]
            al = np.maximum(al, ring * 0.85 * alpha)
        # depth test against terrain
        ya, yb = max(0, y0), min(H, y1)
        xa, xb = max(0, x0), min(W, x1)
        if ya >= yb or xa >= xb:
            return
        sub_a = al[ya - y0:yb - y0, xa - x0:xb - x0]
        zt = zbuf[ya:yb, xa:xb]
        vis = ((zt <= 0) | (zt > depth - max(0.6, depth * 0.004))).astype(np.float32)
        sub_a = sub_a * vis
        canvas[ya:yb, xa:xb] = canvas[ya:yb, xa:xb] * (1 - sub_a[..., None]) + \
            np.clip(rgb[ya - y0:yb - y0, xa - x0:xb - x0], 0, 4) * sub_a[..., None]
        if mask is not None:
            mask[ya:yb, xa:xb] = np.maximum(mask[ya:yb, xa:xb], sub_a)
        self.last_head_px = (x0 + tp(P['head'])[0], y0 + tp(P['head'])[1])
        self.last_hand_px = (x0 + hand[0], y0 + hand[1])


# ------------------------------------------------------------------------------------------
def draw_rope(canvas, zbuf, cam, pts3d, color, width_m=0.011, min_px=0.9, max_px=3.0, alpha=0.9, drawing=0,
              wobble=0.35, seed=0):
    """Hand-drawn fixed rope (3-D polyline) with depth test and slight boil."""
    H, W = canvas.shape[:2]
    uv, z = cam.project(pts3d)
    rng = np.random.default_rng(seed * 31 + drawing)
    ok = z > 0.3
    layer = np.zeros((H, W), np.float32)
    for k in range(len(pts3d) - 1):
        if not (ok[k] and ok[k + 1]):
            continue
        a, b = uv[k], uv[k + 1]
        if (max(a[0], b[0]) < -5 or min(a[0], b[0]) > W + 5 or max(a[1], b[1]) < -5 or min(a[1], b[1]) > H + 5):
            continue
        w = np.clip(width_m * cam.focal / max(z[k], 0.1), min_px, max_px)
        j = rng.normal(0, wobble, 4)
        pa = (int((a[0] + j[0]) * 4), int((a[1] + j[1]) * 4))
        pb = (int((b[0] + j[2]) * 4), int((b[1] + j[3]) * 4))
        m = np.zeros((1,), np.uint8)
        cv2.line(layer, pa, pb, 1.0, max(1, int(round(w))), cv2.LINE_AA, shift=2)
    # depth test (approximate: use mean depth along the rope locally)
    if layer.max() <= 0:
        return
    zz = np.full((H, W), 1e9, np.float32)
    for k in range(len(pts3d)):
        if ok[k]:
            u, v = int(uv[k][0]), int(uv[k][1])
            if 0 <= u < W and 0 <= v < H:
                zz[v, u] = min(zz[v, u], z[k])
    zz = cv2.erode(zz, np.ones((7, 7), np.uint8))
    zz = np.where(zz > 1e8, 0, zz)
    zz = cv2.dilate(zz, np.ones((9, 9), np.uint8))
    vis = (zbuf <= 0) | (zz <= 0) | (zz < zbuf + np.maximum(1.0, zbuf * 0.01))
    a = np.clip(layer, 0, 1) * vis * alpha
    canvas[:] = canvas * (1 - a[..., None]) + np.asarray(color, np.float32)[None, None] * a[..., None]


def draw_tent(canvas, zbuf, cam, base3d, size_m, color, glow=0.0, light=1.0, ambient=(0.4, 0.45, 0.55),
              light_side=1, drawing=0, seed=0, snow=(0.85, 0.88, 0.95), depth_tol=2.0):
    """Dome tent (painted silhouette) with guy-lines and banked snow."""
    H, W = canvas.shape[:2]
    uv, z = cam.project(np.asarray(base3d)[None])
    if z[0] <= 0.5:
        return
    s = size_m * cam.focal / z[0]
    if s < 1.0:
        return
    cx, cy = uv[0]
    if cx < -s * 2 or cx > W + s * 2 or cy < -s * 2 or cy > H + s * 2:
        return
    rng = np.random.default_rng(seed * 97 + drawing)
    pad = int(s * 1.6) + 4
    x0, y0 = int(cx - pad), int(cy - pad)
    lw = lh = 2 * pad
    m = np.zeros((lh, lw), np.uint8)
    ccx, ccy = cx - x0, cy - y0
    # dome: half ellipse
    axes = (int(s * 0.62 * 4), int(s * 0.42 * 4))
    cv2.ellipse(m, (int(ccx * 4), int(ccy * 4)), axes, 0, 180, 360, 255, -1, cv2.LINE_AA, shift=2)
    mm = m.astype(np.float32) / 255
    yy, xx = np.mgrid[0:lh, 0:lw].astype(np.float32)
    side = np.clip(0.5 + light_side * (xx - ccx) / (s * 0.7), 0, 1)
    col = np.asarray(color, np.float32)
    rgb = col[None, None] * (np.asarray(ambient, np.float32)[None, None] + light * side[..., None] * 0.9)
    # pole seams
    for k in (-0.25, 0.25):
        sx = ccx + k * s
        seam = np.exp(-((xx - sx) ** 2) / (2 * (0.03 * s + 0.4) ** 2)) * mm
        rgb = rgb * (1 - 0.35 * seam[..., None])
    if glow > 0:
        g = np.exp(-(((xx - ccx) / (s * 0.5)) ** 2 + ((yy - ccy + s * 0.15) / (s * 0.35)) ** 2))
        rgb = rgb + (col * 0.5 + np.array([1.0, 0.75, 0.4]) * 0.8)[None, None] * (g * glow)[..., None]
    # banked snow at the base
    sm = np.exp(-((yy - ccy) / (0.07 * s + 0.6)) ** 2) * (np.abs(xx - ccx) < s * 0.75)
    rgb = rgb * (1 - sm[..., None] * 0.7) + np.asarray(snow, np.float32) * ambient[2] * 1.5 * sm[..., None] * 0.7
    a = np.clip(mm + sm * 0.6, 0, 1)
    # guy lines
    if s > 8:
        gl = np.zeros((lh, lw), np.float32)
        for sgn in (-1, 1):
            p0 = (int((ccx + sgn * s * 0.45) * 4), int((ccy - s * 0.3) * 4))
            p1 = (int((ccx + sgn * s * 1.3) * 4), int((ccy + s * 0.05) * 4))
            cv2.line(gl, p0, p1, 0.6, 1, cv2.LINE_AA, shift=2)
        a = np.maximum(a, gl)
        rgb = rgb * (1 - gl[..., None]) + np.array([0.15, 0.15, 0.17]) * gl[..., None]
    ya, yb = max(0, y0), min(H, y0 + lh)
    xa, xb = max(0, x0), min(W, x0 + lw)
    if ya >= yb or xa >= xb:
        return
    zt = zbuf[ya:yb, xa:xb]
    vis = ((zt <= 0) | (zt > z[0] - depth_tol)).astype(np.float32)
    sa = a[ya - y0:yb - y0, xa - x0:xb - x0] * vis
    canvas[ya:yb, xa:xb] = canvas[ya:yb, xa:xb] * (1 - sa[..., None]) + rgb[ya - y0:yb - y0, xa - x0:xb - x0] * sa[..., None]


def headlamp_beam(canvas, head_px, dir_px, length_px, width_deg=22.0, intensity=0.6, color=(1.0, 0.93, 0.8)):
    """Additive cone of light in the air (spindrift scatter) from a headlamp."""
    H, W = canvas.shape[:2]
    L = int(length_px)
    if L < 3:
        return
    x0, y0 = int(head_px[0] - L), int(head_px[1] - L)
    x1, y1 = int(head_px[0] + L), int(head_px[1] + L)
    xa, xb, ya, yb = max(0, x0), min(W, x1), max(0, y0), min(H, y1)
    if xa >= xb or ya >= yb:
        return
    yy, xx = np.mgrid[ya:yb, xa:xb].astype(np.float32)
    dx, dy = xx - head_px[0], yy - head_px[1]
    r = np.sqrt(dx * dx + dy * dy) + 1e-3
    d = np.asarray(dir_px, np.float32)
    d /= np.linalg.norm(d) + 1e-6
    cosang = (dx * d[0] + dy * d[1]) / r
    cone = np.clip((cosang - math.cos(math.radians(width_deg))) / (1 - math.cos(math.radians(width_deg))), 0, 1)
    fall = np.exp(-r / (0.45 * L)) * (r < L)
    add = (cone ** 1.5) * fall * intensity
    canvas[ya:yb, xa:xb] += add[..., None] * np.asarray(color, np.float32)


# ==========================================================================================
# Climber v2: volumetric 2-D figure (tapered capsules with cylindrical shading, down-suit
# baffles, backpack with straps, helmet & goggles, mittens, boots with crampons).
# ==========================================================================================
class _Part:
    __slots__ = ('a', 'b', 'ra', 'rb', 'col', 'kind', 'z')

    def __init__(self, a, b, ra, rb, col, kind='suit', z=0.0):
        self.a, self.b, self.ra, self.rb, self.col, self.kind, self.z = a, b, ra, rb, col, kind, z


def _capsule_field(xx, yy, a, b, ra, rb):
    """Signed coordinates for a tapered capsule: inside-mask (soft), v across [-1,1], t along [0,1]."""
    ab = b - a
    L2 = float(ab @ ab) + 1e-9
    t = ((xx - a[0]) * ab[0] + (yy - a[1]) * ab[1]) / L2
    tc = np.clip(t, 0, 1)
    px = a[0] + ab[0] * tc
    py = a[1] + ab[1] * tc
    dx, dy = xx - px, yy - py
    d = np.sqrt(dx * dx + dy * dy)
    r = ra + (rb - ra) * tc
    L = math.sqrt(L2)
    perp = np.array([-ab[1] / L, ab[0] / L])
    v = (dx * perp[0] + dy * perp[1]) / np.maximum(r, 1e-3)
    inside = np.clip((r - d) / 0.9 + 0.5, 0, 1)        # ~1 px antialiasing
    return inside, np.clip(v, -1, 1), t, d / np.maximum(r, 1e-3), perp


class ClimberV2:
    def __init__(self, suit='red', pack=(0.16, 0.18, 0.22), helmet=(0.95, 0.94, 0.9), boots=(0.95, 0.72, 0.12),
                 mitts=(0.10, 0.10, 0.12), seed=0, oxygen=False, accent=None):
        self.suit = np.array(SUIT_COLORS.get(suit, suit) if isinstance(suit, str) else suit, np.float32)
        self.pack = np.array(pack, np.float32)
        self.helmet = None if helmet is None else np.array(helmet, np.float32)
        self.boots = np.array(boots, np.float32)
        self.mitts = np.array(mitts, np.float32)
        self.seed = seed
        self.oxygen = oxygen
        self.accent = np.array(accent if accent is not None else (0.12, 0.13, 0.16), np.float32)

    # ---- skeletons (body units: feet at y=0, height ~1, +y up, +x = facing direction) ----

    def _back(self, ph, reach=1.0, step=1.0):
        """Climber seen from behind, moving up a fixed rope. ph in [0,1)."""
        s = math.sin(2 * math.pi * ph)
        c = math.cos(2 * math.pi * ph)
        P = {}
        hipL, hipR = np.array([-0.065, 0.47]), np.array([0.065, 0.47])
        P['hip'] = np.array([0.0, 0.47 + 0.02 * s])
        P['neck'] = np.array([0.01 * s, 0.77 + 0.01 * s])
        P['head'] = P['neck'] + np.array([0.0, 0.095])
        shL, shR = P['neck'] + np.array([-0.12, -0.035]), P['neck'] + np.array([0.12, -0.035])
        # legs: alternate stepping (one knee up), feet apart
        upL = max(0.0, s) * step
        upR = max(0.0, -s) * step
        P['kneeL'] = hipL + np.array([-0.03, -0.22 + 0.12 * upL])
        P['ankleL'] = P['kneeL'] + np.array([-0.01, -0.23 + 0.10 * upL])
        P['kneeR'] = hipR + np.array([0.03, -0.22 + 0.12 * upR])
        P['ankleR'] = P['kneeR'] + np.array([0.01, -0.23 + 0.10 * upR])
        # arms: right hand up on the ascender, left hand low on the rope
        hr = 0.30 + 0.06 * c * reach
        P['elbR'] = shR + np.array([0.03, 0.12 + 0.03 * c])
        P['handR'] = shR + np.array([-0.02 + 0.01 * s, hr])
        P['elbL'] = shL + np.array([-0.05, -0.12])
        P['handL'] = shL + np.array([0.02, -0.25 + 0.02 * s])
        P['hipL'], P['hipR'], P['shL'], P['shR'] = hipL, hipR, shL, shR
        return P

    def parts(self, P, view, facing):
        suit, sd = self.suit, self.suit * 0.78
        parts = []
        T = 0.075   # limb radius (body units)
        if view == 'back':
            # legs
            for side_, z in (('L', 0.0), ('R', 0.0)):
                parts.append(_Part(P['hip' + side_], P['knee' + side_], T * 1.15, T * 0.95, suit, 'suit', z))
                parts.append(_Part(P['knee' + side_], P['ankle' + side_], T * 0.95, T * 0.8, suit, 'suit', z))
                boot_a = P['ankle' + side_] + np.array([0, 0.005])
                parts.append(_Part(boot_a, boot_a + np.array([0.0, -0.045]), T * 0.85, T * 0.8, self.boots, 'boot', z))
            # torso
            parts.append(_Part(P['hip'] + np.array([0, 0.02]), P['neck'] - np.array([0, 0.02]), 0.125, 0.135, suit,
                               'suit', 1))
            # arms
            parts.append(_Part(P['shL'], P['elbL'], T * 0.95, T * 0.85, suit, 'suit', 1))
            parts.append(_Part(P['elbL'], P['handL'], T * 0.85, T * 0.75, suit, 'suit', 1))
            parts.append(_Part(P['handL'], P['handL'] + np.array([0.0, -0.03]), T * 0.6, T * 0.55, self.mitts, 'mitt', 1))
            # backpack over the torso
            bp0 = P['hip'] + np.array([0.0, 0.10])
            bp1 = P['neck'] + np.array([0.0, 0.02])
            parts.append(_Part(bp0, bp1, 0.105, 0.11, self.pack, 'pack', 2))
            # head (hood + helmet seen from behind)
            parts.append(_Part(P['head'] - np.array([0, 0.01]), P['head'] + np.array([0, 0.01]), 0.068, 0.068,
                               suit * 0.92, 'suit', 3))
            if self.helmet is not None:
                parts.append(_Part(P['head'] + np.array([0, 0.018]), P['head'] + np.array([0, 0.03]), 0.062, 0.058,
                                   self.helmet, 'helmet', 4))
            # reaching arm last (in front of the head when it crosses)
            parts.append(_Part(P['shR'], P['elbR'], T * 0.95, T * 0.85, suit, 'suit', 5))
            parts.append(_Part(P['elbR'], P['handR'], T * 0.85, T * 0.75, suit, 'suit', 5))
            parts.append(_Part(P['handR'], P['handR'] + np.array([0.0, 0.03]), T * 0.6, T * 0.55, self.mitts, 'mitt', 5))
            return parts
        # side view (facing = +1 right / -1 left)
        up = P['up']
        fwd = np.array([up[1], -up[0]]) * facing
        far = 0.80
        parts.append(_Part(P['hip'], P['kneeB'], T * 1.15, T * 0.95, suit * far, 'suit', 0))
        parts.append(_Part(P['kneeB'], P['ankleB'], T * 0.95, T * 0.8, suit * far, 'suit', 0))
        parts.append(_Part(P['ankleB'], P['ankleB'] + np.array([0.075 * facing, -0.025]), T * 0.75, T * 0.7,
                           self.boots * far, 'boot', 0))
        parts.append(_Part(P['sh'], P['elbB'], T * 0.9, T * 0.8, suit * far, 'suit', 0))
        parts.append(_Part(P['elbB'], P['handB'], T * 0.8, T * 0.7, suit * far, 'suit', 0))
        parts.append(_Part(P['handB'], P['handB'] + (P['handB'] - P['elbB']) * 0.2, T * 0.58, T * 0.52,
                           self.mitts * far, 'mitt', 0))
        # backpack behind the torso
        back = -fwd
        bp0 = P['hip'] + up * 0.10 + back * 0.12
        bp1 = P['neck'] + back * 0.11
        parts.append(_Part(bp0, bp1, 0.085, 0.095, self.pack, 'pack', 1))
        # torso
        parts.append(_Part(P['hip'], P['neck'] - up * 0.015, 0.115, 0.12, suit, 'suit', 2))
        # near leg
        parts.append(_Part(P['hip'], P['kneeF'], T * 1.15, T * 0.95, suit, 'suit', 3))
        parts.append(_Part(P['kneeF'], P['ankleF'], T * 0.95, T * 0.8, suit, 'suit', 3))
        parts.append(_Part(P['ankleF'], P['ankleF'] + np.array([0.08 * facing, -0.025]), T * 0.78, T * 0.72,
                           self.boots, 'boot', 3))
        # head: hood, helmet, goggles, oxygen mask
        parts.append(_Part(P['head'] - up * 0.005, P['head'] + up * 0.005, 0.07, 0.07, suit * 0.92, 'suit', 4))
        if self.helmet is not None:
            parts.append(_Part(P['head'] + up * 0.02 - fwd * 0.01, P['head'] + up * 0.03 - fwd * 0.01, 0.062, 0.058,
                               self.helmet, 'helmet', 5))
        g0 = P['head'] + fwd * 0.03 + up * 0.0
        parts.append(_Part(g0, g0 + fwd * 0.04, 0.022, 0.02, np.array([0.06, 0.06, 0.08], np.float32), 'goggle', 6))
        if self.oxygen:
            m0 = P['head'] + fwd * 0.045 - up * 0.04
            parts.append(_Part(m0, m0 + fwd * 0.012, 0.022, 0.02, np.array([0.12, 0.12, 0.14], np.float32), 'mask', 6))
        # near arm
        parts.append(_Part(P['sh'], P['elbF'], T * 0.9, T * 0.8, suit, 'suit', 7))
        parts.append(_Part(P['elbF'], P['handF'], T * 0.8, T * 0.7, suit, 'suit', 7))
        parts.append(_Part(P['handF'], P['handF'] + (P['handF'] - P['elbF']) * 0.2, T * 0.6, T * 0.55,
                           self.mitts, 'mitt', 7))
        return parts

    def draw(self, canvas, zbuf, base_px, height_px, depth, pose, facing=1, view='side', light_dir=(-0.6, -0.8),
             light=1.0, ambient=(0.35, 0.40, 0.52), drawing=0, headlamp=0.0, roll=0.0, alpha=1.0,
             rope_hand=None, sun=None, sky=None, exposure=None, mask=None, phase=None):
        H, W = canvas.shape[:2]
        s = height_px
        if s < 1.2:
            return
        if view == 'back':
            P = self._back(phase if phase is not None else 0.0)
        else:
            P = ClimberV1.skeleton(self, pose, facing)
        rng = np.random.default_rng((self.seed * 7919 + drawing * 104729) & 0x7fffffff)
        pad = int(s * 0.75) + 6
        x0 = int(base_px[0] - pad)
        y0 = int(base_px[1] - s * 1.25 - pad)
        lw, lh = 2 * pad, int(s * 1.25) + int(pad * 1.6)
        if x0 + lw < 0 or y0 + lh < 0 or x0 >= W or y0 >= H:
            return
        rr = math.radians(roll)

        def tp(p):
            q = _rot(np.array([p[0], p[1]]), rr)
            return np.array([base_px[0] - x0 + q[0] * s, base_px[1] - y0 - q[1] * s])

        yy, xx = np.mgrid[0:lh, 0:lw].astype(np.float32)
        acc = np.zeros((lh, lw, 3), np.float32)       # albedo (linear)
        shade = np.zeros((lh, lw), np.float32)
        cover = np.zeros((lh, lw), np.float32)
        kindmap = np.zeros((lh, lw), np.int8)
        ld = np.array(light_dir, np.float32)
        ld = ld / (np.linalg.norm(ld) + 1e-6)
        L3 = np.array([ld[0] * 0.8, ld[1] * 0.8, 0.6])
        jit = rng.normal(0, 0.006, 4)
        for part in sorted(self.parts(P, view, facing), key=lambda q: q.z):
            a = tp(part.a + jit[:2] * 0.3)
            b = tp(part.b + jit[2:] * 0.3)
            ra, rb = part.ra * s, part.rb * s
            if max(ra, rb) < 0.35:
                continue
            ins, v, t, dn, perp = _capsule_field(xx, yy, a, b, max(ra, 0.6), max(rb, 0.6))
            if ins.max() <= 0:
                continue
            # cylindrical normal -> Lambert + soft wrap
            nz = np.sqrt(np.clip(1 - v * v, 0, 1))
            nx, ny = v * perp[0], v * perp[1]
            lam = np.clip((nx * L3[0] + ny * L3[1] + nz * L3[2]) * 0.8 + 0.2, 0, 1)
            col = np.asarray(part.col, np.float32)
            alb = np.clip(col, 0, 1) ** 2.2
            if part.kind == 'suit' and s > 30:
                # down-suit baffles across the part's axis
                n_b = max(2, int(abs(part.ra + part.rb) / 0.03 + 3))
                baff = 0.5 + 0.5 * np.cos(2 * np.pi * t * n_b)
                lam = lam * (0.82 + 0.18 * baff)
            if part.kind == 'pack' and s > 30:
                lid = np.exp(-((t - 0.88) / 0.05) ** 2)
                lam = lam * (1 - 0.35 * lid)
            if part.kind in ('helmet', 'goggle'):
                spec = np.clip((nx * L3[0] + ny * L3[1] + nz * L3[2]), 0, 1) ** 24
                lam = lam + spec * (2.0 if part.kind == 'goggle' else 0.8)
            m = ins
            acc = acc * (1 - m[..., None]) + alb[None, None] * m[..., None]
            shade = shade * (1 - m) + lam * m
            cover = np.maximum(cover, m)
            kindmap[m > 0.5] = {'suit': 1, 'pack': 2, 'helmet': 3, 'goggle': 4, 'mitt': 5, 'boot': 6, 'mask': 4}[part.kind]
        if cover.max() <= 0:
            return
        # shoulder straps over the backpack (back view)
        if view == 'back' and s > 40:
            for sx in (-0.06, 0.06):
                a = tp(P['neck'] + np.array([sx, 0.0]))
                b = tp(P['hip'] + np.array([sx * 1.3, 0.12]))
                ins, v, t, dn, perp = _capsule_field(xx, yy, a, b, 0.012 * s, 0.012 * s)
                acc = acc * (1 - ins[..., None] * 0.8) + (self.accent ** 2.2)[None, None] * ins[..., None] * 0.8
        # crampons: thin light line under each boot
        if s > 50:
            for key in (('ankleL', 'ankleR') if view == 'back' else ('ankleF', 'ankleB')):
                pa = tp(P[key] + np.array([-0.04, -0.05]))
                pb = tp(P[key] + np.array([0.06 * (facing if view != 'back' else 0.5), -0.05]))
                ins, v, t, dn, perp = _capsule_field(xx, yy, pa, pb, 0.006 * s + 0.4, 0.006 * s + 0.4)
                acc = acc * (1 - ins[..., None]) + np.array([0.55, 0.57, 0.6], np.float32)[None, None] * ins[..., None]
                shade = shade * (1 - ins) + ins
                cover = np.maximum(cover, ins)
        # light: linear albedo * (sky + sun * shade) -> filmic
        if sun is None:
            sun = np.array([1.0, 0.95, 0.88]) * light
            sky = np.asarray(ambient)
            exposure = 1.0
        E = np.asarray(sky, np.float32)[None, None] + np.asarray(sun, np.float32)[None, None] * shade[..., None]
        x = np.maximum(acc * E * exposure, 0)
        rgb = np.clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1) ** (1 / 2.2)
        # sketchy contour: darker local colour, broken
        if s > 14:
            k = max(1, int(round(s * 0.008)))
            dil = cv2.dilate(cover, np.ones((2 * k + 1, 2 * k + 1), np.uint8))
            ring = np.clip(dil - cover, 0, 1)
            brk = (rng.random(ring.shape) > 0.25).astype(np.float32)
            brk = cv2.GaussianBlur(brk, (0, 0), max(1.0, s * 0.01))
            ring = ring * np.clip(brk * 1.4, 0, 1)
            inkcol = cv2.GaussianBlur(rgb, (0, 0), 2.0) * 0.35
            rgb = rgb * (1 - ring[..., None]) + inkcol * ring[..., None]
            cover = np.maximum(cover, ring * 0.9)
        if headlamp > 0:
            hp = tp(P['head'] + (np.array([0.0, 0.03]) if view == 'back' else np.array([0.05 * facing, 0.03])))
            g = np.exp(-((xx - hp[0]) ** 2 + (yy - hp[1]) ** 2) / (2 * (0.03 * s + 0.8) ** 2))
            rgb = rgb + g[..., None] * np.array([1.0, 0.95, 0.85]) * 2.0 * headlamp
            cover = np.maximum(cover, g * headlamp)
        al = np.clip(cover, 0, 1) * alpha
        ya, yb = max(0, y0), min(H, y0 + lh)
        xa, xb = max(0, x0), min(W, x0 + lw)
        if ya >= yb or xa >= xb:
            return
        sub_a = al[ya - y0:yb - y0, xa - x0:xb - x0]
        zt = zbuf[ya:yb, xa:xb]
        vis = ((zt <= 0) | (zt > depth - max(0.6, depth * 0.004))).astype(np.float32)
        sub_a = sub_a * vis
        canvas[ya:yb, xa:xb] = canvas[ya:yb, xa:xb] * (1 - sub_a[..., None]) + \
            np.clip(rgb[ya - y0:yb - y0, xa - x0:xb - x0], 0, 4) * sub_a[..., None]
        if mask is not None:
            mask[ya:yb, xa:xb] = np.maximum(mask[ya:yb, xa:xb], sub_a)
        hp = tp(P['head'])
        self.last_head_px = (x0 + hp[0], y0 + hp[1])


Climber = ClimberV2
