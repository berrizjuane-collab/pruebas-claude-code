"""Final compositing: painted transitions between shots, landmark labels, fades -> 8-bit frames.

Transitions are painted, not cross-faded: the next shot is brushed in along the direction of
the ascent (bottom -> top), blooms out of the place the route leads to, falls from the sky as
night comes, or follows the leftward traverse.
"""
import math
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

from timeline import SHOTS, TRANSITIONS, LABELS, FPS, DURATION, NFRAMES
from render import GROUPS

FR = '/home/user/k2data/frames'
OUT = '/home/user/k2data/final'
W, H = 1920, 1080
FONT_TITLE = '/home/user/k2data/fonts/CormorantGaramond-SemiBoldItalic.ttf'
FONT_SUB = '/usr/share/fonts/opentype/inter/Inter-Medium.otf'

# wipe style per transition: ('sweep', angle_deg) angle = direction the paint travels; ('bloom', anchor)
WIPES = {
    'spur>chimney': ('bloom', 'Chimenea de House'),
    'chimney>pyramid': ('sweep', -90),
    'pyramid>shoulder': ('sweep', -90),
    'shoulder>bottleneck': ('sweep', 90),
    'bottleneck>traverse': ('sweep', 180),
    'traverse>ridge': ('sweep', -90),
    'ridge>summit': ('bloom', 'Cumbre'),
}


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def ease_out(x):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** 3


def group_dir(shot):
    for g in GROUPS:
        if shot in g:
            return f'{FR}/{"+".join(g)}'
    raise KeyError(shot)


def load(shot, f):
    p = f'{group_dir(shot)}/{f:05d}.png'
    img = cv2.imread(p, cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(p)
    return img[..., ::-1].astype(np.float32) / 255.0


# --------------------------------------------------------------------------------------------
class Wiper:
    """The next shot is laid down with broad bristle-brush strokes that grow along the travel direction."""

    def __init__(self, seed=3):
        from brushes import make_brushes
        self.brushes = make_brushes(10, seed=17)
        self.plans = {}
        self.seed = seed

    def _plan(self, key, style, center):
        if key in self.plans:
            return self.plans[key]
        rng = np.random.default_rng(abs(hash(key)) % (2 ** 32))
        strokes = []
        if style[0] == 'sweep':
            ang = math.radians(style[1])
            d = np.array([math.cos(ang), math.sin(ang)])
            nrm = np.array([-d[1], d[0]])
            ext_d = abs(W / 2 * d[0]) + abs(H / 2 * d[1])
            ext_n = abs(W / 2 * nrm[0]) + abs(H / 2 * nrm[1])
            step_n = 46.0
            for jn in np.arange(-ext_n - 80, ext_n + 80, step_n):
                pos = -ext_d - 300 + rng.uniform(0, 200)
                while pos < ext_d + 100:
                    L = rng.uniform(380, 720)
                    w = rng.uniform(80, 150)
                    c = np.array([W / 2, H / 2]) + d * pos + nrm * (jn + rng.normal(0, 12))
                    g = (pos + ext_d) / (2 * ext_d)
                    a_ = math.atan2(d[1], d[0]) + rng.normal(0, 0.06)
                    dd = np.array([math.cos(a_), math.sin(a_)])
                    strokes.append((c, dd, L, w, float(np.clip(g, 0, 1)) * 0.72 + rng.uniform(0, 0.12), rng.integers(10)))
                    pos += L * rng.uniform(0.45, 0.65)
        else:
            cx, cy = center
            rmax = max(math.hypot(cx - x, cy - y) for x in (0, W) for y in (0, H))
            for _ in range(520):
                r = rmax * math.sqrt(rng.uniform(0, 1.05))
                th = rng.uniform(0, 2 * math.pi)
                c = np.array([cx + r * math.cos(th), cy + r * math.sin(th)])
                a_ = th + rng.normal(0, 0.25)
                dd = np.array([math.cos(a_), math.sin(a_)])
                L = rng.uniform(260, 560)
                w = rng.uniform(70, 140)
                c = c - dd * L * 0.3
                strokes.append((c, dd, L, w, (r / rmax) * 0.72 + rng.uniform(0, 0.12), rng.integers(10)))
        strokes.sort(key=lambda s_: s_[4])
        self.plans[key] = strokes
        return strokes

    def mask(self, p, style, drawing, center=None, key='t'):
        strokes = self._plan(key, style, center)
        m = np.zeros((H, W), np.float32)
        grow = 0.22
        for (c, d, L, w, s0, bi) in strokes:
            q = (p - s0) / grow
            if q <= 0:
                continue
            q = 1 - (1 - min(q, 1.0)) ** 2
            Lq = L * q
            if Lq < 3:
                continue
            nrm = np.array([-d[1], d[0]])
            tail = c - d * L / 2
            tex = self.brushes[(bi + drawing) % len(self.brushes)]
            BHt, BWt = tex.shape
            # bounding box of the grown stroke
            corners = np.array([tail + nrm * w / 2, tail - nrm * w / 2, tail + d * Lq + nrm * w / 2,
                                tail + d * Lq - nrm * w / 2])
            x0, y0 = np.floor(corners.min(0)).astype(int)
            x1, y1 = np.ceil(corners.max(0)).astype(int)
            xa, ya, xb, yb = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
            if xa >= xb or ya >= yb:
                continue
            A = np.array([[d[0] * Lq / BWt, nrm[0] * w / BHt], [d[1] * Lq / BWt, nrm[1] * w / BHt]])
            o = tail - nrm * w / 2 - np.array([xa, ya])
            M = np.hstack([A, o[:, None]]).astype(np.float32)
            roi = cv2.warpAffine(tex, M, (xb - xa, yb - ya), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
            sub = m[ya:yb, xa:xb]
            np.maximum(sub, np.clip(roi * 1.6, 0, 1), out=sub)
        m = np.maximum(m, smoothstep(0.9, 1.0, p))
        return cv2.GaussianBlur(m, (0, 0), 0.7)


# --------------------------------------------------------------------------------------------
class LabelDrawer:
    def __init__(self):
        self.ft = ImageFont.truetype(FONT_TITLE, 78)
        self.fs = ImageFont.truetype(FONT_SUB, 25)
        self.col = (246, 243, 236)

    def _tracked(self, draw, xy, text, font, fill, tracking):
        x, y = xy
        for ch in text:
            draw.text((x, y), ch, font=font, fill=fill)
            x += font.getlength(ch) + tracking
        return x

    def _width(self, text, font, tracking):
        return sum(font.getlength(c) + tracking for c in text) - tracking

    def draw(self, img, title, sub, t, ts, te, anchor_px=None):
        """img float RGB (H,W,3). Returns new image with the label composited."""
        a_out = 1.0 - smoothstep(te - 0.55, te, t)
        a_rule = ease_out((t - ts) / 0.55)
        a_title = float(smoothstep(ts + 0.10, ts + 0.70, t)) * a_out
        a_sub = float(smoothstep(ts + 0.35, ts + 0.95, t)) * a_out
        if a_out <= 0 or t < ts:
            return img
        tw = self._width(title, self.ft, 0.5)
        sw = self._width(sub, self.fs, 2.2) if sub else 0
        rule_len = max(tw, sw, 200) + 18
        flip = False
        if anchor_px is not None:
            ax, ay = anchor_px
            ry_anchor = int(ay - 190)
            x0 = int(ax)
            if x0 + rule_len > W - 70:
                flip = True
                x0 = int(ax - rule_len)
            yb = ry_anchor - 104
        else:
            x0, yb = 112, 700
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        dr = ImageDraw.Draw(layer)
        rise = 16 * (1 - ease_out((t - ts - 0.1) / 0.6))
        # title
        ty = yb + rise
        tx = x0 + (rule_len - tw - 4 if flip else (14 if anchor_px is not None else 0))
        self._tracked(dr, (tx, ty), title, self.ft, self.col + (int(255 * a_title),), 0.5)
        # rule (draws outward from the leader / from the left)
        ry = yb + 104
        rl = int(rule_len * a_rule)
        if rl > 1:
            if flip:
                dr.rectangle([x0 + rule_len - rl, ry, x0 + rule_len, ry + 1], fill=self.col + (int(220 * a_out),))
            else:
                dr.rectangle([x0, ry, x0 + rl, ry + 1], fill=self.col + (int(220 * a_out),))
        # subline
        if sub:
            sx = x0 + (rule_len - sw - 6 if flip else (16 if anchor_px is not None else 1))
            self._tracked(dr, (sx, ry + 14), sub, self.fs, (232, 226, 214, int(255 * a_sub)), 2.2)
        # anchor pin + leader
        if anchor_px is not None:
            ax, ay = anchor_px
            a_pin = float(smoothstep(ts, ts + 0.35, t)) * a_out
            col = self.col + (int(225 * a_pin),)
            lead_len = (ay - 9 - ry) * ease_out((t - ts) / 0.45)
            dr.line([(ax, ay - 9), (ax, ay - 9 - lead_len)], fill=col, width=2)
            r = 7
            dr.ellipse([ax - r, ay - r, ax + r, ay + r], outline=self.col + (int(255 * a_pin),), width=2)
            dr.ellipse([ax - 2.5, ay - 2.5, ax + 2.5, ay + 2.5], fill=self.col + (int(255 * a_pin),))
        # soft shadow for legibility on bright snow
        al = np.asarray(layer)[..., 3].astype(np.float32) / 255.0
        sh = cv2.GaussianBlur(al, (0, 0), 7.0) * 0.55 + cv2.GaussianBlur(al, (0, 0), 1.6) * 0.35
        sh = np.clip(sh, 0, 0.75)
        out = img * (1 - sh[..., None]) + np.array([0.02, 0.03, 0.05], np.float32) * sh[..., None]
        rgb = np.asarray(layer)[..., :3].astype(np.float32) / 255.0
        out = out * (1 - al[..., None]) + rgb * al[..., None]
        return out


# --------------------------------------------------------------------------------------------
def build_anchor_fns():
    """Screen-position providers (need the scene + shot cameras)."""
    from scene import Scene
    import render as R
    import route
    sc = Scene(verbose=False)
    objs = {}

    def cam_of(name, t):
        if name not in objs:
            objs[name] = R.SHOT_CLASSES[name](sc)
            objs[name].setup()
        return objs[name].cam(t)

    def project(name, t, wp):
        (xy, alt) = route.waypoint(wp)
        P = np.array([xy[0], xy[1], sc.height(xy[0], xy[1])[0] + 2.0])
        cam = cam_of(name, t)
        uv, z = cam.project(P[None])
        return uv[0], z[0]
    return project


def main(start=0, end=NFRAMES, step=1):
    os.makedirs(OUT, exist_ok=True)
    project = build_anchor_fns()
    wiper = Wiper()
    labels = LabelDrawer()
    names = [s[0] for s in SHOTS]
    bloom_cache = {}
    for f in range(start, end, step):
        t = f / FPS
        i = max(k for k, s in enumerate(SHOTS) if t >= s[1] - 1e-9) if t >= 0 else 0
        name, a, b = SHOTS[i]
        img = None
        # inside a painted transition?
        for j in (i - 1, i):
            if j < 0 or j + 1 >= len(SHOTS):
                continue
            key = f'{names[j]}>{names[j + 1]}'
            kind, d = TRANSITIONS.get(key, ('cut', 0.0))
            T = SHOTS[j + 1][1]
            if kind == 'paint' and T - d / 2 <= t < T + d / 2:
                p = (t - (T - d / 2)) / d
                A = load(names[j], f)
                B = load(names[j + 1], f)
                style = WIPES.get(key, ('sweep', -90))
                center = None
                if style[0] == 'bloom':
                    if key not in bloom_cache:
                        uv, z = project(names[j], T, style[1])
                        bloom_cache[key] = (float(np.clip(uv[0], 0, W)), float(np.clip(uv[1], 0, H))) if z > 0 \
                            else (W / 2, H / 2)
                    center = bloom_cache[key]
                m = wiper.mask(p, style, f // 2, center, key=key)
                edge = 4 * m * (1 - m)
                img = A * (1 - m[..., None]) + B * m[..., None]
                img = img * (1 - 0.10 * edge[..., None])
                break
        if img is None:
            img = load(name, f)
        # labels
        for (title, sub, ts, te, wp) in LABELS:
            if ts - 0.05 <= t <= te + 0.05:
                anchor_px = None
                if title == 'Campo Base':
                    uv, z = project('basecamp', t, wp)
                    if z > 0 and 0 < uv[0] < W and 0 < uv[1] < H:
                        anchor_px = (float(uv[0]), float(uv[1]))
                img = labels.draw(img, title, sub, t, ts, te, anchor_px)
        # global fades
        fade = float(smoothstep(0.0, 0.9, t)) * (1.0 - float(smoothstep(DURATION - 1.0, DURATION - 0.05, t)))
        img = img * fade
        # 1-LSB triangular dither against banding in skies
        rng = np.random.default_rng(f)
        dith = (rng.random(img.shape[:2], dtype=np.float32) - rng.random(img.shape[:2], dtype=np.float32)) / 255.0
        out = np.clip(img + dith[..., None], 0, 1)
        cv2.imwrite(f'{OUT}/{f:05d}.png', (out[..., ::-1] * 255 + 0.5).astype(np.uint8))
        if f % 24 == 0:
            print('composed', f, name, flush=True)


if __name__ == '__main__':
    a = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    b = int(sys.argv[2]) if len(sys.argv) > 2 else NFRAMES
    s = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    main(a, b, s)
