#!/usr/bin/env python3
"""Plantillas para la web (WebP con transparencia, a su tamaño de uso) y artifact.html.

    python3 web.py <carpeta_png_plantillas> <carpeta_web>      (carpeta_web = gasherbrum-ii/)

El 9-slice de lona se exporta a 0,6: 616 px de lado, corte 200 px, 66 px de margen (lo que usa el CSS).
"""
import os
import sys
from PIL import Image

PL, WEB = sys.argv[1], sys.argv[2]
ESCALA = {'lona_cobalto_9': .6, 'lona_cruda_9': .6, 'lona_grava_9': .6,
          'lona_cobalto_tela': 1, 'lona_cruda_tela': 1, 'lona_grava_tela': 1,
          'cinta_cobalto': .6, 'cinta_cruda': .6, 'telon_izq': .8, 'telon_der': .8, 'friso_lona': .5,
          'ficha_v_carton': .5, 'ficha_v_blanca': .5, 'ficha_v_cobalto': .5,
          'ficha_h_carton': .5, 'ficha_h_blanca': .5, 'ficha_h_cobalto': .5,
          'fardo_blanco_h': .55, 'fardo_azul_h': .55, 'fardo_blanco_v': .55, 'fardo_azul_v': .55,
          'bidon_cobalto': .4, 'bidon_blanco': .4, 'bidon_aro': .4,
          'morrena_ancha': .5, 'morrena_fina': .5, 'morrena_v': .5}
os.makedirs(os.path.join(WEB, 'plantillas'), exist_ok=True)
for n, k in ESCALA.items():
    im = Image.open(os.path.join(PL, n + '.png'))
    im = im.convert('RGBA') if im.mode != 'RGB' else im
    if k != 1:
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    dst = os.path.join(WEB, 'plantillas', n + '.webp')
    if n.startswith('telon'):
        im.save(dst, 'WEBP', quality=72, alpha_quality=80, method=6)
    elif im.mode == 'RGBA':
        im.save(dst, 'WEBP', quality=84, alpha_quality=92, method=6)
    else:
        im.save(dst, 'WEBP', quality=80, method=6)
    print(n, im.size, os.path.getsize(dst) // 1024, 'KB')
# artifact.html: el mismo documento sin doctype ni metas de charset/viewport (el visor de claude.ai las pone)
src = open(os.path.join(WEB, 'index.html'), encoding='utf-8').read()
lineas = [l for l in src.split('\n') if not l.startswith(('<!doctype', '<meta charset', '<meta name="viewport"'))]
open(os.path.join(WEB, 'artifact.html'), 'w', encoding='utf-8').write('\n'.join(lineas))
print('artifact.html')
