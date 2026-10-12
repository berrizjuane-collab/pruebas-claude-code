"""Low-res unpainted preview of the whole film (every Nth frame) -> mp4 for timing checks."""
import sys, os, numpy as np, cv2, subprocess
from render import Renderer, SHOT_CLASSES
from timeline import SHOTS, FPS
step = int(sys.argv[1]) if len(sys.argv) > 1 else 6
out = '/home/user/k2data/prev/film'
os.makedirs(out, exist_ok=True)
R = Renderer()
for name, a, b in SHOTS:
    sh = SHOT_CLASSES[name](R.sc); sh.setup()
    for f in range(int(a * FPS), int(b * FPS), step):
        img, _ = R.frame(sh, None, f, preview=True)
        t = cv2.resize((img * 255).astype(np.uint8), (480, 270), interpolation=cv2.INTER_AREA)
        cv2.putText(t, f'{name} {f / FPS:.1f}s', (6, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
        cv2.imwrite(f'{out}/{f:05d}.png', t[..., ::-1])
    print(name, flush=True)
