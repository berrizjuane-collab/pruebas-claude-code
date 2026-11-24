"""montar.py — genera broad-peak/index.html a partir de src/index.template.html y los datos de herramientas/datos/.

  python3 herramientas/montar.py            (desde broad-peak/)

Inyecta en la página las anclas de cada lámina (cumbres y campos proyectados con su cámara), la ruta
normal proyectada en la lámina VII y el perfil de la cresta cimera, y envuelve el resultado en un
documento completo (doctype, charset y viewport) para servirlo tal cual.
"""
import json
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
DAT = os.path.join(AQUI, 'datos')

esc = json.load(open(os.path.join(DAT, 'escenas.json')))
ruta = json.load(open(os.path.join(DAT, 'ruta.json')))
dem = json.load(open(os.path.join(DAT, 'datos_dem.json')))
escenas = {k: dict(asp=e['asp'], anchos=e['anchos'],
                   puntos={n: dict(x=p['x'], y=p['y'], p=p['p']) for n, p in e['puntos'].items()})
           for k, e in esc.items()}
datos = dict(escenas=escenas, ruta=ruta, cresta=[[round(a, 5), round(b)] for a, b in dem['cresta']])

t = open(os.path.join(RAIZ, 'src', 'index.template.html'), encoding='utf-8').read()
assert t.count('__DATOS__') == 1
t = t.replace('__DATOS__', json.dumps(datos, ensure_ascii=False, separators=(',', ':')))
cabeza, cuerpo = t.split('</style>\n', 1)
doc = ('<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
       + cabeza + '</style>\n</head>\n<body>\n' + cuerpo.rstrip() + '\n</body>\n</html>\n')
open(os.path.join(RAIZ, 'index.html'), 'w', encoding='utf-8').write(doc)
print('index.html', len(doc) // 1024, 'KB')
