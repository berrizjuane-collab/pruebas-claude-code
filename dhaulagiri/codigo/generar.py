"""Genera las láminas del Dhaulagiri en el estilo «pincel seco sobre fondo oscuro».

Uso:
    python3 generar.py <escena|todas|a,b,c> <ancho> <alto> [--ss 2] [--solo-T] [--salida DIR]

Escenas: poon_hill, campo_base, campo_1, campo_2, campo_3, cumbre (o `todas`).
Salida:  salida/dh_0N_<escena>.png (PNG sin pérdida).  --solo-T guarda la imagen objetivo y las
regiones sin pintar (para ajustar encuadres rápido).
Determinista: cada escena usa una semilla fija, así que con las mismas versiones de las librerías
salen los mismos píxeles.  Todo se mide en unidades U = sqrt(ancho·alto)/1946, por eso una versión
5K u 8K es la misma pintura con más definición.
"""
import os
import sys
import time
import argparse
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import escena as E          # noqa: E402
import escenas as S         # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('escena')
    ap.add_argument('ancho', type=int)
    ap.add_argument('alto', type=int)
    ap.add_argument('--ss', type=int, default=2)
    ap.add_argument('--solo-T', action='store_true')
    ap.add_argument('--salida', default=os.path.join(HERE, 'salida'))
    a = ap.parse_args()
    nombres = S.ORDEN if a.escena == 'todas' else a.escena.split(',')
    os.makedirs(a.salida, exist_ok=True)
    for nombre in nombres:
        if nombre not in S.ESCENAS:
            sys.exit(f'escena desconocida: {nombre}  (opciones: {", ".join(S.ORDEN)})')
        idx = S.ORDEN.index(nombre) + 1
        base = os.path.join(a.salida, f'dh_{idx:02d}_{nombre}')
        print(f'== {nombre} ({a.ancho}x{a.alto})', flush=True)
        t = time.time()
        esc = dict(S.ESCENAS[nombre])
        if a.solo_T:
            T, reg, cam, info = E.lamina(esc, a.ancho, a.alto, SS=a.ss, semilla=S.SEMILLAS[nombre], solo_T=True,
                                         log=lambda m: print(m, flush=True))
            Image.fromarray(np.clip(T, 0, 255).astype(np.uint8)).save(base + '_T.png')
            Image.fromarray((reg * 40).astype(np.uint8)).save(base + '_reg.png')
        else:
            img, T, reg, cam, info = E.lamina(esc, a.ancho, a.alto, SS=a.ss, semilla=S.SEMILLAS[nombre],
                                              log=lambda m: print(m, flush=True))
            img.save(base + '.png', optimize=False, compress_level=6)
        print(f'   listo en {time.time() - t:.0f} s -> {base}.png', flush=True)


if __name__ == '__main__':
    main()
