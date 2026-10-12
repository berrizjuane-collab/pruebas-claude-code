"""Render a contact sheet of key frames for a set of shots (preview or painted)."""
import sys
import numpy as np
import cv2
from render import Renderer, SHOT_CLASSES, shot_range
from painter import Painter
import shots as S

def main(names, painted=False, per=1, out='/home/user/k2data/prev/sheet.png'):
    R = Renderer()
    tiles = []
    for name in names:
        sh = SHOT_CLASSES[name](R.sc)
        sh.setup()
        f0, f1 = shot_range(name)
        a, b = int(round(sh.t0 * 24)), int(round(sh.t1 * 24)) - 1
        frames = np.linspace(a, b, per + 2).astype(int)[1:-1] if per == 1 else np.linspace(a, b, per).astype(int)
        P = Painter(S.W_OUT, S.H_OUT, **sh.painter_kw)
        for f in frames:
            if painted:   # warm up the stroke field with a couple of frames
                for w in (f - 4, f - 2):
                    R.frame(sh, P, w, preview=False)
            img, _ = R.frame(sh, P, int(f), preview=not painted)
            t = cv2.resize((img * 255).astype(np.uint8), (640, 360), interpolation=cv2.INTER_AREA)
            cv2.putText(t, f'{name} f{f}', (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
            tiles.append(t)
            print(name, f, flush=True)
    rows = [np.concatenate(tiles[i:i + 2] + [np.zeros_like(tiles[0])] * (2 - len(tiles[i:i + 2])), 1)
            for i in range(0, len(tiles), 2)]
    sheet = np.concatenate(rows, 0)
    cv2.imwrite(out, sheet[..., ::-1])

if __name__ == '__main__':
    painted = '--paint' in sys.argv
    names = [a for a in sys.argv[1:] if not a.startswith('--')]
    out = '/home/user/k2data/prev/sheet_' + '_'.join(names)[:40] + ('_p' if painted else '') + '.png'
    main(names, painted, out=out)
    print(out)
