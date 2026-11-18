"""
export_web.py — versiones para la web a partir de los PNG de máxima calidad.

    python3 export_web.py <carpeta_png> <carpeta_salida> [anchos=640,1280,1920,2560,3840]

Genera, por imagen y ancho: WebP (calidad 88), AVIF si Pillow lo soporta, y JPEG
progresivo de respaldo, más un fragmento <picture> con srcset listo para pegar.
El grano del papel y la tiza son detalle de alta frecuencia: no bajes la calidad
de WebP por debajo de ~85 o el acabado se "lava".
"""
import os, sys
from PIL import Image, features

src, dst = sys.argv[1], sys.argv[2]
widths = [int(w) for w in (sys.argv[3].split(",") if len(sys.argv) > 3 else "640,1280,1920,2560,3840".split(","))]
os.makedirs(dst, exist_ok=True)
avif = features.check("avif")
html = []
for fn in sorted(f for f in os.listdir(src) if f.endswith(".png")):
    name = fn[:-4]
    im = Image.open(os.path.join(src, fn)).convert("RGB")
    srcs = {"webp": [], "avif": [], "jpg": []}
    for w in widths:
        if w > im.width:
            continue
        r = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS) if w < im.width else im
        p = os.path.join(dst, f"{name}-{w}")
        r.save(p + ".webp", "WEBP", quality=88, method=6); srcs["webp"].append(f"{name}-{w}.webp {w}w")
        r.save(p + ".jpg", "JPEG", quality=88, optimize=True, progressive=True); srcs["jpg"].append(f"{name}-{w}.jpg {w}w")
        if avif:
            r.save(p + ".avif", "AVIF", quality=70); srcs["avif"].append(f"{name}-{w}.avif {w}w")
    html.append(f'<picture>\n' +
                (f'  <source type="image/avif" srcset="{", ".join(srcs["avif"])}" sizes="100vw">\n' if avif else "") +
                f'  <source type="image/webp" srcset="{", ".join(srcs["webp"])}" sizes="100vw">\n'
                f'  <img src="{name}-1920.jpg" srcset="{", ".join(srcs["jpg"])}" sizes="100vw"\n'
                f'       width="{im.width}" height="{im.height}" alt="{name.replace("_", " ")}" loading="lazy">\n</picture>')
    print("ok", name)
open(os.path.join(dst, "picture_snippets.html"), "w").write("\n\n".join(html))
