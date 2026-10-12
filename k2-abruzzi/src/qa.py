"""QA helpers: frame contact sheet of the final cut, transition strips, loudness & sync report."""
import json
import os
import subprocess
import sys

import cv2
import numpy as np

from timeline import SHOTS, LABELS, FPS, NFRAMES

FINAL = '/home/user/k2data/final'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'output'))


def sheet(times, path, cols=4, w=480):
    tiles = []
    for t in times:
        f = min(NFRAMES - 1, int(round(t * FPS)))
        img = cv2.imread(f'{FINAL}/{f:05d}.png')
        h = int(w * img.shape[0] / img.shape[1])
        tile = cv2.resize(img, (w, h), interpolation=cv2.INTER_AREA)
        cv2.putText(tile, f'{t:5.1f}s', (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
        tiles.append(tile)
    while len(tiles) % cols:
        tiles.append(np.zeros_like(tiles[0]))
    rows = [np.concatenate(tiles[i:i + cols], 1) for i in range(0, len(tiles), cols)]
    cv2.imwrite(path, np.concatenate(rows, 0), [cv2.IMWRITE_JPEG_QUALITY, 88])


def main():
    os.makedirs(OUT, exist_ok=True)
    mids = [0.5 * (a + b) for _, a, b in SHOTS]
    sheet(mids + [2.5, 11.5, 36.0, 41.5, 46.5, 54.0], '/home/user/k2data/prev/qa_sheet.jpg')
    # one representative frame per shot for the README
    sheet([2.6, 10.6, 16.0, 23.0, 30.0, 36.0, 41.5, 46.4, 49.8, 55.0], f'{OUT}/fotogramas.jpg', cols=5, w=384)
    # transitions: 5 frames across each painted cut
    from timeline import TRANSITIONS
    names = [s[0] for s in SHOTS]
    for k in range(len(SHOTS) - 1):
        key = f'{names[k]}>{names[k + 1]}'
        kind, d = TRANSITIONS.get(key, ('cut', 0))
        if kind != 'paint':
            continue
        T = SHOTS[k + 1][1]
        sheet([T - d / 2 + d * q for q in (0.0, 0.25, 0.5, 0.75, 0.99)], f'/home/user/k2data/prev/qa_tr_{key}.jpg',
              cols=5, w=384)
    print('sheets written')


if __name__ == '__main__':
    main()
