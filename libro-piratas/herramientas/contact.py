import sys, glob, os
from PIL import Image, ImageDraw
files = sys.argv[2:]
out = sys.argv[1]
cell = 300; cols = 5
rows = (len(files)+cols-1)//cols
sheet = Image.new('RGB', (cols*cell, rows*(cell+24)), (200,200,200))
d = ImageDraw.Draw(sheet)
for i,f in enumerate(files):
    im = Image.open(f)
    label = os.path.basename(f).replace('.png','') + f" {im.size[0]}x{im.size[1]}"
    if im.mode in ('RGBA','LA'):
        bg = Image.new('RGBA', im.size, (255,0,255,255)); bg.alpha_composite(im.convert('RGBA')); im = bg
    im = im.convert('RGB'); im.thumbnail((cell-8, cell-8))
    x = (i%cols)*cell; y = (i//cols)*(cell+24)
    sheet.paste(im, (x+4, y+4))
    d.text((x+4, y+cell+4), label, fill=(0,0,0))
sheet.save(out)
