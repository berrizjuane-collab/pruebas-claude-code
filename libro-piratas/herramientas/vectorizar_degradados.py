"""Sustituye los mapas de bits incrustados en las ilustraciones extraídas por degradados vectoriales.

Las ilustraciones del PDF original son vectoriales, salvo dos tipos de pequeños PNG a ~72 ppp:
  1. Cielos: degradados verticales (todas las columnas iguales)  -> <linearGradient>
  2. Halos de luz: máscara de luminancia elíptica + capa de color plano -> <radialGradient>
     con el color del halo y la opacidad de la máscara.
Así las ilustraciones quedan 100 % vectoriales y nítidas a cualquier tamaño de impresión.

Uso: python3 vectorizar_degradados.py archivo1.svg [archivo2.svg ...]   (modifica en el sitio)
"""
import base64
import io
import re
import sys
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image

SVG = "http://www.w3.org/2000/svg"
XL = "http://www.w3.org/1999/xlink"
ET.register_namespace("", SVG)
ET.register_namespace("xlink", XL)
ET.register_namespace("inkscape", "http://www.inkscape.org/namespaces/inkscape")
HREF = f"{{{XL}}}href"


def png(el):
    d = el.get(HREF, "")
    m = re.match(r"data:image/\w+;base64,(.*)", d, re.S)
    return np.asarray(Image.open(io.BytesIO(base64.b64decode(m.group(1)))).convert("RGBA")).astype(float)


def hexcol(rgb):
    return "#%02x%02x%02x" % tuple(int(round(v)) for v in rgb[:3])


def rect_desde(img_el, fill):
    r = ET.Element(f"{{{SVG}}}rect")
    for k in ("x", "y", "width", "height", "transform"):
        if img_el.get(k) is not None:
            r.set(k, img_el.get(k))
    r.set("fill", fill)
    return r


def perfil_radial(a):
    """Ajusta una máscara elíptica: centro, radios y valores (0-1) a lo largo del radio."""
    L = a[..., 0] / 255.0
    h, w = L.shape
    cy, cx = np.unravel_index(np.argmax(L), L.shape)
    fila, col = L[cy, :], L[:, cx]
    base = L.min()

    def radio(v, c):
        thr = base + 0.01 * (v.max() - base)
        der = np.argmax(v[c:] <= thr) if (v[c:] <= thr).any() else len(v) - c
        izq = np.argmax(v[:c + 1][::-1] <= thr) if (v[:c + 1] <= thr).any() else c
        return max(der, izq, 1)

    rx, ry = radio(fila, cx), radio(col, cy)
    ts = np.linspace(0, 1, 13)
    vals = []
    for t in ts:
        xs = [min(w - 1, int(cx + t * rx)), max(0, int(cx - t * rx))]
        vals.append(np.mean([fila[x] for x in xs]))
    return (cx + .5) / w, (cy + .5) / h, rx / w, ry / h, ts, np.array(vals), base


def procesar(ruta):
    tree = ET.parse(ruta)
    root = tree.getroot()
    defs = root.find(f"{{{SVG}}}defs")
    if defs is None:
        defs = ET.SubElement(root, f"{{{SVG}}}defs")
    padres = {c: p for p in root.iter() for c in p}
    por_id = {el.get("id"): el for el in root.iter() if el.get("id")}
    n = 0
    cambios = 0
    usados = set()
    # 1) Halos: grupos con máscara que contienen una imagen de color plano
    for g in list(root.iter()):
        m = g.get("mask")
        if not m:
            continue
        mid = m[5:-1]
        mask = por_id.get(mid)
        use = mask.find(f"{{{SVG}}}use") if mask is not None else None
        cont = por_id.get(use.get(HREF)[1:]) if use is not None else None
        mimg = next(iter(cont.iter(f"{{{SVG}}}image")), None) if cont is not None else None
        cimg = next(iter(g.iter(f"{{{SVG}}}image")), None)
        if mimg is None or cimg is None:
            continue
        ca, ma = png(cimg), png(mimg)
        color = ca[..., :3].reshape(-1, 3).mean(0)
        fx, fy, rx, ry, ts, vals, base = perfil_radial(ma)
        n += 1
        gid = f"vg-halo-{n}"
        rg = ET.SubElement(defs, f"{{{SVG}}}radialGradient", id=gid, cx=f"{fx:.4f}", cy=f"{fy:.4f}", r=f"{rx:.4f}",
                           gradientTransform=f"translate({fx:.4f} {fy:.4f}) scale(1 {ry / rx:.4f}) translate({-fx:.4f} {-fy:.4f})")
        for t, v in zip(ts, vals):
            ET.SubElement(rg, f"{{{SVG}}}stop", offset=f"{t:.3f}", **{"stop-color": hexcol(color), "stop-opacity": f"{v:.4f}"})
        p = padres[cimg]
        p.insert(list(p).index(cimg), rect_desde(cimg, f"url(#{gid})"))
        p.remove(cimg)
        del g.attrib["mask"]
        usados.add(id(mimg))
        cambios += 1
    # 2) Cielos: imágenes restantes con degradado vertical
    for img in list(root.iter(f"{{{SVG}}}image")):
        if id(img) in usados:
            continue
        a = png(img)
        if np.abs(a - a[:, :1, :]).max() > 3:
            print("  aviso: imagen no vertical, se mantiene", ruta, a.shape)
            continue
        n += 1
        gid = f"vg-cielo-{n}"
        lg = ET.SubElement(defs, f"{{{SVG}}}linearGradient", id=gid, x1="0", y1="0", x2="0", y2="1")
        col = a[:, 0, :]
        for t in np.linspace(0, 1, 17):
            i = min(len(col) - 1, int(round(t * (len(col) - 1))))
            ET.SubElement(lg, f"{{{SVG}}}stop", offset=f"{t:.4f}", **{"stop-color": hexcol(col[i]), "stop-opacity": f"{col[i][3] / 255:.3f}"})
        p = padres[img]
        p.insert(list(p).index(img), rect_desde(img, f"url(#{gid})"))
        p.remove(img)
        cambios += 1
    # Las máscaras ya no se usan: se eliminan sus imágenes para aligerar
    for mimg_id in usados:
        pass
    for el in list(root.iter()):
        for c in list(el):
            if c.tag == f"{{{SVG}}}image" and id(c) in usados:
                el.remove(c)
    tree.write(ruta, xml_declaration=False, encoding="unicode")
    quedan = sum(1 for _ in root.iter(f"{{{SVG}}}image"))
    print(f"{ruta}: {cambios} sustituciones, quedan {quedan} imágenes")


if __name__ == "__main__":
    for f in sys.argv[1:]:
        procesar(f)
