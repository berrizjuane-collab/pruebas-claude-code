"""Try candidate cameras for a shot: python camtest.py shot 'a,l,dz|a,l,dz|fov' ... (local Bottleneck frame)
or world coords with prefix w:x,y,z|x,y,z|fov"""
import sys, numpy as np, cv2
from render import Renderer, SHOT_CLASSES
from campath import CamPath
R = Renderer()
name = sys.argv[1]
sh = SHOT_CLASSES[name](R.sc); sh.setup()
fr = R.sc.frame
tiles = []
f = int(round((sh.t0 * 0.5 + sh.t1 * 0.5) * 24))
import route as _route
from shots import orbit_pos
rt = getattr(sh, 'rt', None) or _route.RouteTrack(R.sc)
for spec in sys.argv[2:]:
    if spec.startswith('o:'):
        # o:s_offset_from_shot_anchor,az,el,dist,fov,look_dz  (subject on the route)
        so, az, el, dist, fov, ldz = [float(v) for v in spec[2:].split(',')]
        s0 = getattr(sh, 'anchor_s', 0.0) + so
        subj = rt.pos(s0) + np.array([0, 0, 1.0])
        pos = orbit_pos(R.sc, subj, az, el, dist)
        tgt = subj + np.array([0, 0, ldz])
        from camera import Camera as _C
        sh.cam = (lambda P, T, Fv: (lambda t: _C(P, T, hfov_deg=Fv, W=1920, H=1080)))(pos, tgt, fov)
        img, _ = R.frame(sh, None, f, preview=True)
        t = cv2.resize((img * 255).astype(np.uint8), (640, 360))
        cv2.putText(t, spec[:60], (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
        tiles.append(t)
        continue
    world = spec.startswith('w:')
    a, b, fov = spec[2:].split('|') if world else spec.split('|')
    def P(txt):
        v = [float(x) for x in txt.split(',')]
        if world:
            return np.array(v)
        p = fr.world(v[0], v[1]); return np.array([p[0], p[1], R.sc.height(p[0], p[1])[0] + v[2]])
    pos, tgt = P(a), P(b)
    from camera import Camera as _C
    sh.cam = (lambda P, T, Fv: (lambda t: _C(P, T, hfov_deg=Fv, W=1920, H=1080)))(pos, tgt, float(fov))
    img, _ = R.frame(sh, None, f, preview=True)
    t = cv2.resize((img * 255).astype(np.uint8), (640, 360))
    cv2.putText(t, spec[:60], (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
    tiles.append(t)
while len(tiles) % 2: tiles.append(np.zeros_like(tiles[0]))
rows = [np.concatenate(tiles[i:i + 2], 1) for i in range(0, len(tiles), 2)]
cv2.imwrite(f'/home/user/k2data/prev/cam_{name}.png', np.concatenate(rows, 0)[..., ::-1])
