"""Hoja de contactos de miniaturas Sentinel-2 por tesela para elegir escena a ojo."""
import io, json, os, sys
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from net import get
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BUCKET = "https://sentinel-cogs.s3.us-west-2.amazonaws.com"
cat = json.load(open(os.path.join(ROOT, "data/work/s2_catalog.json")))
tile = sys.argv[1]; n = int(sys.argv[2]) if len(sys.argv) > 2 else 12
cands = [i for i in cat[tile] if (i["cloud"] or 99) < 5 and (i["nodata"] or 0) < 15]
cands.sort(key=lambda i: i["cloud"])
cands = cands[:n]
def thumb(i):
    try:
        im = Image.open(io.BytesIO(get(f"{BUCKET}/{i['prefix']}thumbnail.jpg"))).convert("RGB")
    except Exception:
        im = Image.new("RGB", (343, 343), (60, 0, 0))
    im = im.resize((343, 343))
    d = ImageDraw.Draw(im); d.rectangle([0, 0, 343, 16], fill=(0, 0, 0))
    d.text((3, 2), f"{i['datetime'][:10]} c{i['cloud']:.2f} s{i['snow']:.0f}", fill=(255, 255, 0))
    return im
ims = list(ThreadPoolExecutor(8).map(thumb, cands))
cols = 4; rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (cols * 345, rows * 345), (20, 20, 20))
for k, im in enumerate(ims):
    sheet.paste(im, ((k % cols) * 345, (k // cols) * 345))
sheet.save(os.path.join(ROOT, f"data/work/contact_{tile}.jpg"), quality=85)
for k, i in enumerate(cands): print(k, i["id"], i["datetime"][:10], i["cloud"], i["snow"])
