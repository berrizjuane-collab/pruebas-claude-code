"""Versiones para la web de las láminas: AVIF y WebP en varios anchos + un JSON con srcset.

Uso:  python3 exportar_web.py [--carpeta ../salida] [--anchos 3840,2560,1920,1280,768]
Requiere Pillow >= 11 (AVIF nativo).  Si tu Pillow no trae AVIF, se generan solo WebP.
"""
import os
import sys
import json
import argparse
from PIL import Image, features

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import escenas as S   # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--carpeta', default=os.path.join(HERE, '..', 'salida'))
    ap.add_argument('--anchos', default='3840,2560,1920,1280,768')
    ap.add_argument('--calidad-webp', type=int, default=86)
    ap.add_argument('--calidad-avif', type=int, default=62)
    a = ap.parse_args()
    anchos = [int(v) for v in a.anchos.split(',')]
    destino = os.path.join(a.carpeta, 'web')
    os.makedirs(destino, exist_ok=True)
    avif = features.check('avif')
    manifiesto = {}
    for i, nombre in enumerate(S.ORDEN, 1):
        ruta = os.path.join(a.carpeta, f'g2_{i:02d}_{nombre}.png')
        if not os.path.exists(ruta):
            print('falta', ruta); continue
        im = Image.open(ruta).convert('RGB')
        entrada = {'titulo': S.ESCENAS[nombre]['titulo'], 'subtitulo': S.ESCENAS[nombre]['subtitulo'],
                   'alt': S.ESCENAS[nombre]['texto'], 'webp': [], 'avif': []}
        for w in anchos:
            if w > im.width:
                continue
            r = im if w == im.width else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
            base = os.path.join(destino, f'g2_{i:02d}_{nombre}_{w}')
            r.save(base + '.webp', 'WEBP', quality=a.calidad_webp, method=6)
            entrada['webp'].append(f'{os.path.basename(base)}.webp {w}w')
            if avif:
                r.save(base + '.avif', 'AVIF', quality=a.calidad_avif, speed=4)
                entrada['avif'].append(f'{os.path.basename(base)}.avif {w}w')
            print('ok', os.path.basename(base))
        manifiesto[nombre] = entrada
    json.dump(manifiesto, open(os.path.join(destino, 'srcset.json'), 'w'), ensure_ascii=False, indent=1)
    print('manifiesto:', os.path.join(destino, 'srcset.json'))


if __name__ == '__main__':
    main()
