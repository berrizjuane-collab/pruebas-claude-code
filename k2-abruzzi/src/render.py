"""Frame renderer: reference render -> painterly pass -> characters -> canvas finish -> grade."""
import argparse
import os
import sys
import time

import cv2
import numpy as np

import shade
from painter import Painter
from scene import Scene
from timeline import FPS, SHOTS, TRANSITIONS
import shots as S

OUT = '/home/user/k2data/frames'
REF_W, REF_H = 960, 540


def grade(img, g):
    x = img.astype(np.float32)
    lift = np.asarray(g.get('lift', (0, 0, 0)), np.float32)
    gain = np.asarray(g.get('gain', (1, 1, 1)), np.float32)
    x = lift + x * (gain - lift)
    gm = g.get('gamma', 1.0)
    if gm != 1.0:
        x = np.clip(x, 0, 1) ** (1.0 / gm)
    con = g.get('contrast', 0.0)
    if con:
        xc = np.clip(x, 0, 1)
        s_curve = xc * xc * (3 - 2 * xc)
        x = x + (s_curve - xc) * con
    lum = x @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    x = lum[..., None] + (x - lum[..., None]) * g.get('sat', 1.0)
    w = g.get('warm', 0.0)
    if w:
        # warm highlights, cool shadows (split-tone)
        hl = np.clip((lum - 0.45) / 0.55, 0, 1)[..., None]
        sh = np.clip((0.45 - lum) / 0.45, 0, 1)[..., None]
        x = x + w * (hl * np.array([1.0, 0.45, -0.6]) + sh * np.array([-0.5, -0.1, 0.8]))
    v = g.get('vignette', 0.0)
    if v:
        H, W = x.shape[:2]
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) / np.sqrt(2)
        x = x * (1 - v * np.clip(r - 0.35, 0, 1) ** 1.6)[..., None]
    return np.clip(x, 0, 1)


SHOT_CLASSES = {}


def register():
    for name in dir(S):
        obj = getattr(S, name)
        if isinstance(obj, type) and issubclass(obj, S.Shot) and obj is not S.Shot:
            SHOT_CLASSES[obj.name] = obj


register()


def shot_range(name):
    """Frame range including the handles needed by the transitions around the shot."""
    names = [s[0] for s in SHOTS]
    i = names.index(name)
    _, a, b = SHOTS[i]
    pre = post = 0.0
    if i > 0:
        k, d = TRANSITIONS.get(f'{names[i - 1]}>{name}', ('cut', 0.0))
        if k == 'paint':
            pre = d / 2 + 2.0 / FPS
    if i < len(SHOTS) - 1:
        k, d = TRANSITIONS.get(f'{name}>{names[i + 1]}', ('cut', 0.0))
        if k == 'paint':
            post = d / 2 + 2.0 / FPS
    f0 = int(np.floor((a - pre) * FPS))
    f1 = int(np.ceil((b + post) * FPS))
    return max(f0, 0), f1


class Renderer:
    def __init__(self, sc=None):
        self.sc = sc or Scene(verbose=False)

    def frame(self, shot, painter, f, preview=False):
        t = f / FPS
        cam = shot.cam(t)
        cref = cam.scaled(REF_W, REF_H)
        pal = shot.pal(t)
        fr = self.sc.render(cref, pal, light_fn=shot.light_fn(t), clouds=shot.atmos(t),
                            kstep=getattr(shot, 'kstep', 0.3))
        ref = shade.tonemap(fr['rgb'], pal['exposure']).astype(np.float32)
        if hasattr(shot, 'ref_post'):
            ref = shot.ref_post(ref, fr, cref, pal, t)
        if preview:
            canvas = cv2.resize(ref, (cam.W, cam.H), interpolation=cv2.INTER_LINEAR)
            hmap = None
        else:
            canvas, hmap = painter.paint(f, ref, fr['t'], fr['pos'], fr['dirs'], fr['nrm'], cam)
        zbuf = cv2.resize(fr['t'], (cam.W, cam.H), interpolation=cv2.INTER_NEAREST)
        ctx = S.Ctx(canvas=canvas, zbuf=zbuf, cam=cam, t=t, frame=f, drawing=f // 2, pal=pal, ref=ref, fr=fr,
                    painter=painter, preview=preview, hmap=hmap if hmap is not None else np.zeros(zbuf.shape, np.float32))
        shot.overlay(ctx)
        out = ctx.canvas if preview else painter.finish(ctx.canvas, ctx.hmap)
        if hasattr(shot, 'post'):
            out = shot.post(out, ctx)
        out = grade(out, shot.grade)
        return out, ctx

    def run(self, name, frames=None, preview=False, outdir=None, every=1):
        shot = SHOT_CLASSES[name](self.sc)
        shot.setup()
        painter = Painter(S.W_OUT, S.H_OUT, **shot.painter_kw)
        f0, f1 = shot_range(name)
        frames = frames if frames is not None else list(range(f0, f1, every))
        outdir = outdir or f'{OUT}/{name}'
        os.makedirs(outdir, exist_ok=True)
        # warm the painter with a few frames before the first requested one (stroke continuity)
        t_all = time.time()
        for f in frames:
            t0 = time.time()
            img, _ = self.frame(shot, painter, f, preview)
            cv2.imwrite(f'{outdir}/{f:05d}.png', (img[..., ::-1] * 255 + 0.5).astype(np.uint8))
            print(f'{name} frame {f} ({f / FPS:.2f}s) {time.time() - t0:.2f}s', flush=True)
        print(f'{name}: {len(frames)} frames in {time.time() - t_all:.1f}s')


GROUPS = [['basecamp', 'spur'], ['chimney'], ['pyramid'], ['shoulder'], ['bottleneck'], ['traverse'], ['ridge'],
          ['summit', 'pullback']]


def group_range(names):
    a = min(shot_range(n)[0] for n in names)
    b = max(shot_range(n)[1] for n in names)
    return a, b


def run_group(names, R=None, every=1, warm=4, outroot=OUT):
    """Render a group of shots that share one continuous stroke field (one Painter)."""
    R = R or Renderer()
    objs = {n: SHOT_CLASSES[n](R.sc) for n in names}
    bounds = [(n, objs[n].t0, objs[n].t1) for n in names]
    painter = None
    current = None
    f0, f1 = group_range(names)
    gname = '+'.join(names)
    os.makedirs(f'{outroot}/{gname}', exist_ok=True)
    t_all = time.time()
    frames = list(range(f0 - warm, f1, every))
    for f in frames:
        t = f / FPS
        name = names[0]
        for n, a, b in bounds:
            if t >= a - 1e-6:
                name = n
        if name != current:
            objs[name].setup()
            current = name
            if painter is None:
                painter = Painter(S.W_OUT, S.H_OUT, **objs[name].painter_kw)
        t0 = time.time()
        img, _ = R.frame(objs[name], painter, f, preview=False)
        if f >= f0:
            cv2.imwrite(f'{outroot}/{gname}/{f:05d}.png', (img[..., ::-1] * 255 + 0.5).astype(np.uint8))
        print(f'{gname} {name} f{f} {time.time() - t0:.2f}s', flush=True)
    print(f'{gname}: done in {time.time() - t_all:.1f}s', flush=True)


if __name__ == '__main__' and len(sys.argv) > 1 and sys.argv[1] == 'groups':
    R = Renderer()
    for g in sys.argv[2:]:
        run_group(g.split('+'), R)
    sys.exit(0)

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('shot')
    ap.add_argument('--frames', default=None, help='comma list or a:b:step')
    ap.add_argument('--preview', action='store_true')
    ap.add_argument('--out', default=None)
    a = ap.parse_args()
    fr = None
    if a.frames:
        if ':' in a.frames:
            p = [int(v) for v in a.frames.split(':')]
            fr = list(range(p[0], p[1], p[2] if len(p) > 2 else 1))
        else:
            fr = [int(v) for v in a.frames.split(',')]
    Renderer().run(a.shot, fr, a.preview, a.out)
