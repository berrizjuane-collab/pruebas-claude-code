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
             shF=68 + slope_deg * 0.45 + 14 * (1 - e), elF=34 - 14 * (1 - e),
             shB=-15 + 25 * lift, elB=35, crouch=0.05 * lift)
    return p


def pose_traverse(phase, fatigue=0.6):
    ph = phase % 1.0
    st = min(ph / 0.5, 1.0)
    lift = math.sin(math.pi * st)
    return Pose(lean=10, head=-5, hipF=15 + 22 * lift, kneeF=-20 - 25 * lift, hipB=-12, kneeB=8,
                shF=80 + 10 * lift, elF=25, shB=30, elB=40, crouch=0.04)


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


class Climber:
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
