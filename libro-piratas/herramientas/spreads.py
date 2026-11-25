import sys, glob, os
from PIL import Image, ImageDraw
d = sys.argv[1]; out = sys.argv[2]; first, last = int(sys.argv[3]), int(sys.argv[4])
files = sorted(glob.glob(f"{d}/p-*.png"))
pages = {int(os.path.basename(f)[2:-4]): f for f in files}
W, H = Image.open(files[0]).size
# crop bleed (3mm of 221.9 wide)
bx = round(W * 3 / 221.9); by = round(H * 3 / 285.4)
def pg(n):
    im = Image.open(pages[n]).convert('RGB'); return im.crop((bx, by, W - bx, H - by))
tw, th = W - 2 * bx, H - 2 * by
spreads = []
n = first
if first % 2 == 1: spreads.append((None, first)); n = first + 1
while n <= last:
    spreads.append((n, n + 1 if n + 1 <= last else None)); n += 2
cols = 2
rows = (len(spreads) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (2 * tw + 30) + 10, rows * (th + 30) + 10), (90, 90, 90))
dr = ImageDraw.Draw(sheet)
for i, (a, b) in enumerate(spreads):
    x = 10 + (i % cols) * (2 * tw + 30); y = 10 + (i // cols) * (th + 30)
    if a: sheet.paste(pg(a), (x, y)); dr.text((x + 3, y + th + 3), str(a), fill=(255, 255, 255))
    if b: sheet.paste(pg(b), (x + tw, y)); dr.text((x + 2 * tw - 20, y + th + 3), str(b), fill=(255, 255, 255))
    dr.line([(x + tw, y), (x + tw, y + th)], fill=(60, 60, 60), width=1)
sheet.save(out)
print(out, sheet.size)
