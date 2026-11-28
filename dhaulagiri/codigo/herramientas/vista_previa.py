#!/usr/bin/env python3
"""Vista previa ligera de las láminas para el repositorio: JPEG de 1600 px y una hoja de contacto.

    python3 herramientas/vista_previa.py <carpeta_masters> <carpeta_salida>
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import escenas as S          # noqa: E402

M, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
mini = []
for i, k in enumerate(S.ORDEN, 1):
    im = Image.open(os.path.join(M, f'dh_{i:02d}_{k}.png')).convert('RGB')
    im.resize((1600, 900), Image.LANCZOS).save(os.path.join(OUT, f'dh_{i:02d}_{k}.jpg'), quality=86,
                                               optimize=True, progressive=True)
    mini.append((k, im.resize((960, 540), Image.LANCZOS)))
try:
    f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf', 22)
except OSError:
    f = ImageFont.load_default()
g = 12
hoja = Image.new('RGB', (2 * 960 + 3 * g, 3 * (540 + 40) + 4 * g - 40 + 40), (22, 23, 32))
d = ImageDraw.Draw(hoja)
for j, (k, im) in enumerate(mini):
    x = g + (j % 2) * (960 + g); y = g + (j // 2) * (540 + 40 + g)
    hoja.paste(im, (x, y))
    e = S.ESCENAS[k]
    d.text((x + 4, y + 548), f'{["I", "II", "III", "IV", "V", "VI"][j]}  {e["titulo"]}  ·  {e["subtitulo"]}',
           fill=(226, 220, 208), font=f)
hoja.save(os.path.join(OUT, 'hoja_de_contacto.jpg'), quality=86, optimize=True)
print('ok', OUT)
