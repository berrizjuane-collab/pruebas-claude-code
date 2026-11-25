"""control.py proy.json carpeta_h carpeta_v salida — superpone cimas/campos/ruta proyectados sobre las láminas."""
import json, os, sys
from PIL import Image, ImageDraw
P = json.load(open(sys.argv[1]))
orden = ['aerea','campo_base','campo_1','campo_2','campo_3','cumbre','ruta','concordia']
tiles = []
for fmt, carpeta, W in (('h', sys.argv[2], 800), ('v', sys.argv[3], 300)):
    for k, clave in enumerate(orden):
        f = [x for x in os.listdir(carpeta) if clave in x and x.endswith('.png')][0]
        im = Image.open(os.path.join(carpeta, f)).convert('RGB')
        im = im.resize((W, round(im.height * W / im.width)))
        d = ImageDraw.Draw(im); w, h = im.size
        L = P['laminas'][clave][fmt]
        if 'ruta' in L:
            pts = L['ruta']
            for a, b in zip(pts, pts[1:]):
                d.line([(a[0]*w, a[1]*h), (b[0]*w, b[1]*h)], fill=(255,140,40) if b[2] else (120,140,255), width=2)
        for c in L['cimas']:
            x, y = c['u']*w, c['v']*h
            col = (255,255,255) if c['vis'] else (255,90,90)
            d.line([(x, y-14), (x, y-2)], fill=col, width=1)
            d.text((x+3, y-24), c['id'], fill=col)
        for c in L['campos']:
            x, y = c['u']*w, c['v']*h
            d.ellipse([x-3,y-3,x+3,y+3], outline=(255,230,0) if c['vis'] else (0,200,255))
            d.text((x+4, y), c['id'], fill=(255,230,0))
        for c in L['rasgos']:
            x, y = c['u']*w, c['v']*h
            d.text((x, y), c['id'], fill=(0,255,160))
        d.text((6, 6), clave + ' ' + fmt, fill=(255,255,0))
        tiles.append(im)
hs = tiles[:8]; vs = tiles[8:]
sheet = Image.new('RGB', (1600, 450*4 + 600*2), (20,20,20))
for i, t in enumerate(hs):
    sheet.paste(t, ((i % 2) * 800, (i // 2) * 450))
for i, t in enumerate(vs):
    sheet.paste(t, ((i % 4) * 400, 1800 + (i // 4) * 600))
sheet.save(sys.argv[4])
