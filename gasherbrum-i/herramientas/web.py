import json, os, sys, math
from PIL import Image
S, W, PL = sys.argv[1], sys.argv[2], sys.argv[3]
orden = ['aerea','campo_base','campo_1','campo_2','campo_3','cumbre','ruta','concordia']
for clave in orden:
    for fmt, carpeta in (('h', 'salida'), ('v', 'salida_v')):
        f = [x for x in os.listdir(os.path.join(S, carpeta)) if clave in x and x.endswith('.png')][0]
        im = Image.open(os.path.join(S, carpeta, f)).convert('RGB')
        im.save(os.path.join(W, 'laminas', f'{clave}-{fmt}.webp'), 'WEBP', quality=80, method=6)
        if fmt == 'h':
            im.resize((1280, 720), Image.LANCZOS).save(os.path.join(W, 'laminas', f'{clave}-g.webp'), 'WEBP', quality=80, method=6)
esc = {'tablero_nogal': .5, 'tablero_albaricoque': .5, 'dintel_nogal': .5, 'dintel_albaricoque': .5,
       'ventana_nogal': .5, 'ventana_albaricoque': .5, 'celosia_nogal': .5, 'celosia_albaricoque': .5,
       'ficha_nogal': .5, 'ficha_albaricoque': .5, 'medallon_nogal': .4, 'medallon_albaricoque': .4,
       'friso_nogal': .5, 'marco_lamina_nogal': .5}
for n, k in esc.items():
    im = Image.open(os.path.join(PL, n + '.png')).convert('RGBA')
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    im.save(os.path.join(W, 'plantillas', n + '.webp'), 'WEBP', quality=86, alpha_quality=95, method=6)
    print(n, im.size)
# datos: proyecciones recortadas
P = json.load(open(os.path.join(S, 'proy.json')))
for clave, d in P['laminas'].items():
    for fmt in d:
        if clave not in ('ruta', 'concordia'):
            d[fmt].pop('ruta', None)
json.dump(P, open(os.path.join(W, 'datos', 'proyecciones.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
# distancias desde el G I
sys.path.insert(0, os.environ['G1_CODIGO'])
import dem
g1 = dem.CIMAS[0]
def hav(a, b):
    R = 6371.0088; p1, p2 = math.radians(a[0]), math.radians(b[0]); dp = p2 - p1; dl = math.radians(b[1] - a[1])
    h = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(h))
for c in dem.CIMAS[:18]:
    print(f"{c[0]:22s} {c[3]}  {hav((g1[1],g1[2]),(c[1],c[2])):.1f} km")
