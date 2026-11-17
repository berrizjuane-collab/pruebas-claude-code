import sys, os, json, shutil
from PIL import Image
S, R = sys.argv[1], sys.argv[2]
def save(im, path, q, w=None, alpha=False):
    if w and im.size[0] != w:
        im = im.resize((w, round(im.size[1] * w / im.size[0])), Image.LANCZOS)
    im.save(path, "WEBP", quality=q, method=6, alpha_quality=88 if alpha else 100)
    return os.path.getsize(path)
tot = 0
for n in ["fairy", "rupal", "diamir", "camp1", "camp2", "camp3", "summit"]:
    im = Image.open(f"{S}/engine/laminas/nanga_{n}_3600x2400.png").convert("RGB")
    for w, q in ((2400, 82), (1280, 80)):
        b = save(im, f"{R}/assets/laminas/{n}-{w}.webp", q, w); tot += b; print(n, w, b // 1024, "KB")
for l in ["l0_cielo", "l1_montana", "l2_frente"]:
    im = Image.open(f"{S}/out/layers/fairy_{l}.png")
    for w, q in ((2400, 82), (1280, 80)):
        b = save(im, f"{R}/assets/capas/fairy-{l.split('_')[0]}-{w}.webp", q, w, alpha=True); tot += b; print(l, w, b // 1024, "KB")
im = Image.open(f"{S}/out/mapa.png").convert("RGB")
for w, q in ((2000, 82), (1100, 80)):
    b = save(im, f"{R}/assets/mapa/mapa-{w}.webp", q, w); tot += b; print("mapa", w, b // 1024, "KB")
for n in ["losa", "estela", "chilas", "tablilla", "medallon", "dintel", "pizarra", "lapida"]:
    im = Image.open(f"{S}/engine/piedras/piedra_{n}.png")
    b = save(im, f"{R}/assets/piedras/piedra_{n}.webp", 84, None, alpha=True); tot += b; print(n, im.size, b // 1024, "KB")
shutil.copy(f"{S}/out/geo.json", f"{R}/assets/data/geo.json")
print("total MB", round(tot / 1e6, 1))
