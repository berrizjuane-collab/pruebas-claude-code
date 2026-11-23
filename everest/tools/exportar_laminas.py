"""Exporta las ocho láminas (PNG 3840×2160) a WebP para la web, más los mapas de profundidad.

Uso: python -I exportar_laminas.py <dir_png> <dir_profundidad> <img_salida>
  <dir_png> contiene everest_<vista>.png (las 7 reconstruidas + everest_ruta.png)
"""
import sys, os
from PIL import Image

PNG, PROF, OUT = map(os.path.abspath, sys.argv[1:4])
VISTAS = ['norte', 'campo_base', 'ruta', 'campo1', 'campo2', 'campo3', 'campo4', 'cumbre']
os.makedirs(os.path.join(OUT, 'laminas'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'prof'), exist_ok=True)
for v in VISTAS:
    im = Image.open(os.path.join(PNG, f'everest_{v}.png')).convert('RGB')
    for w, q in [(2560, 80), (1280, 78)]:
        r = im.resize((w, w * 9 // 16), Image.LANCZOS)
        ruta = os.path.join(OUT, 'laminas', f'{v}-{w}.webp')
        r.save(ruta, 'WEBP', quality=q, method=6)
        print(v, w, os.path.getsize(ruta) // 1024, 'KB')
    # miniatura para el respaldo inicial (sin WebGL) y el velo de carga
    p = Image.open(os.path.join(PROF, f'prof_{v}.png')).convert('L')
    p.save(os.path.join(OUT, 'prof', f'{v}.webp'), 'WEBP', quality=90, method=6)
