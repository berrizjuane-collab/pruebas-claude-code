#!/usr/bin/env python3
"""Láminas para la web a partir de los masters (renderizar.sh), con la misma convención que el G II:

    python3 herramientas/exportar.py <carpeta_masters> <carpeta_laminas>

  <clave>-h.webp  2560x1440  apaisada (fondo en pantallas anchas)
  <clave>-v.webp  1440x2880  vertical para móvil: recorte 1:2 del master, centrado en escenas.RECORTE_V
  <clave>-g.webp  1280x720   galería
"""
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import escenas as S          # noqa: E402

M, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
for i, clave in enumerate(S.ORDEN, 1):
    ruta = os.path.join(M, f'dh_{i:02d}_{clave}.png')
    if not os.path.exists(ruta):
        print('falta', ruta)
        continue
    im = Image.open(ruta).convert('RGB')
    W, H = im.size
    im.resize((2560, 1440), Image.LANCZOS).save(os.path.join(OUT, f'{clave}-h.webp'), 'WEBP', quality=86, method=6)
    wv = H // 2
    c = S.RECORTE_V.get(clave, 0.5) * W
    x0 = int(min(max(c - wv / 2, 0), W - wv))
    v = im.crop((x0, 0, x0 + wv, H))
    if v.size != (1440, 2880):
        v = v.resize((1440, 2880), Image.LANCZOS)
    v.save(os.path.join(OUT, f'{clave}-v.webp'), 'WEBP', quality=86, method=6)
    im.resize((1280, 720), Image.LANCZOS).save(os.path.join(OUT, f'{clave}-g.webp'), 'WEBP', quality=82, method=6)
    tam = [os.path.getsize(os.path.join(OUT, f'{clave}-{k}.webp')) // 1024 for k in 'hvg']
    print('ok', clave, 'h/v/g KB', tam, flush=True)
