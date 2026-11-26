#!/usr/bin/env python3
"""Láminas para la web a partir de los masters de 5120x2880 (renderizar.sh):

    python3 exportar.py <carpeta_masters> <carpeta_laminas>

  <clave>-h.webp  2560x1440  apaisada (fondo en pantallas anchas)
  <clave>-v.webp  1440x2880  vertical para móvil: recorte 1:2 del master a resolución nativa,
                             centrado en escenas_extra.RECORTE_V[clave]
  <clave>-g.webp  1280x720   galería
"""
import os
import sys
from PIL import Image

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src')
sys.path.insert(0, SRC)
import escenas as S          # noqa: E402
import escenas_extra as SX   # noqa: E402

M, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
for i, clave in enumerate(S.ORDEN, 1):
    ruta = os.path.join(M, f'g2_{i:02d}_{clave}.png')
    if not os.path.exists(ruta):
        print('falta', ruta)
        continue
    im = Image.open(ruta).convert('RGB')
    W, H = im.size
    im.resize((2560, 1440), Image.LANCZOS).save(os.path.join(OUT, f'{clave}-h.webp'), 'WEBP', quality=84, method=6)
    wv = H // 2
    c = SX.RECORTE_V.get(clave, 0.5) * W
    x0 = int(min(max(c - wv / 2, 0), W - wv))
    v = im.crop((x0, 0, x0 + wv, H))
    if v.size != (1440, 2880):
        v = v.resize((1440, 2880), Image.LANCZOS)
    v.save(os.path.join(OUT, f'{clave}-v.webp'), 'WEBP', quality=84, method=6)
    im.resize((1280, 720), Image.LANCZOS).save(os.path.join(OUT, f'{clave}-g.webp'), 'WEBP', quality=80, method=6)
    tam = [os.path.getsize(os.path.join(OUT, f'{clave}-{k}.webp')) // 1024 for k in 'hvg']
    print('ok', clave, 'h/v/g KB', tam, flush=True)
