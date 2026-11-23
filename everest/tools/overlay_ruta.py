import json, sys
from PIL import Image, ImageDraw
P = json.load(open(sys.argv[1]))['ruta']
im = Image.open(sys.argv[2]).convert('RGB'); W, H = im.size
d = ImageDraw.Draw(im)
pts = P['ruta']
for a, b in zip(pts[:-1], pts[1:]):
    d.line([(a[0]*W, a[1]*H), (b[0]*W, b[1]*H)], fill=(255, 210, 60) if a[2] and b[2] else (255, 60, 60), width=3)
for k, v in P['puntos'].items():
    x, y = v['x']*W, v['y']*H
    c = (255, 255, 255) if v['visible'] else (80, 255, 255)
    d.ellipse([x-5, y-5, x+5, y+5], outline=c, width=2); d.text((x+7, y-5), v['nombre'], fill=c)
im.save(sys.argv[3])
