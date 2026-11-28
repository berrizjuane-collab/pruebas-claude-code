#!/usr/bin/env python3
"""Empaqueta la entrega: el PDF de láminas y el código de reconstrucción en un zip.

    python3 herramientas/empaquetar.py <pdf> <salida.zip>

Dentro del zip:  Dhaulagiri_laminas/Dhaulagiri_laminas.pdf, Dhaulagiri_laminas/LEEME.md y
Dhaulagiri_laminas/codigo/ (sin data/, cache/ ni salida/: el relieve se baja con descargar_dem.py).
"""
import os
import sys
import zipfile

CODIGO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
FUERA = {'data', 'cache', 'salida', '__pycache__'}
pdf, salida = sys.argv[1], sys.argv[2]
raiz = 'Dhaulagiri_laminas'
with zipfile.ZipFile(salida, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    z.write(pdf, f'{raiz}/Dhaulagiri_laminas.pdf', compress_type=zipfile.ZIP_STORED)   # JPEG: no comprime más
    z.write(os.path.join(CODIGO, 'LEEME.md'), f'{raiz}/LEEME.md')
    for base, dirs, archivos in os.walk(CODIGO):
        dirs[:] = sorted(d for d in dirs if d not in FUERA)
        for a in sorted(archivos):
            ruta = os.path.join(base, a)
            rel = os.path.relpath(ruta, CODIGO)
            z.write(ruta, f'{raiz}/codigo/{rel}')
print(salida, f'{os.path.getsize(salida) / 1e6:.1f} MB')
with zipfile.ZipFile(salida) as z:
    for i in z.infolist():
        print(f'  {i.file_size / 1e3:9.1f} kB  {i.filename}')
