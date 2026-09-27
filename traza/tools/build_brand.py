#!/usr/bin/env python3
"""Extrae el emblema oficial de VÉRTICE desde la guía de marca (PDF).

Uso:
    python3 traza/tools/build_brand.py ruta/Vertice_Identidad_de_Marca.pdf

Requiere: pip install pymupdf pillow

La guía prohíbe reconstruir el símbolo, así que no se redibuja: se toma la
imagen incrustada en el PDF (PNG 1254 × 1254 con máscara de transparencia),
se recorta a su contenido y solo se reescala.

Salidas (traza/vendor/brand/):
  - vertice-emblema.png  emblema con fondo transparente, 400 px de ancho
                         (web en alta densidad y PDF a más de 300 ppp).
  - vertice-favicon.png  icono de app 64 × 64: emblema centrado sobre marfil,
                         con el área de respeto de 1/6 de la altura.
"""
import io
import os
import sys

import pymupdf
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "vendor", "brand")
MARFIL = (0xF4, 0xF1, 0xE8, 255)


def extract_emblem(pdf_path):
    doc = pymupdf.open(pdf_path)
    for page in doc:
        for img in page.get_images(full=True):
            xref, smask = img[0], img[1]
            info = doc.extract_image(xref)
            if smask and info["width"] == info["height"] >= 1000:
                base = Image.open(io.BytesIO(info["image"])).convert("RGB")
                mask_info = doc.extract_image(smask)
                mask = Image.open(io.BytesIO(mask_info["image"])).convert("L")
                rgba = base.copy()
                rgba.putalpha(mask)
                return rgba
    raise SystemExit("No se encontró el emblema con transparencia en el PDF.")


def resize(img, width):
    height = round(img.height * width / img.width)
    # Reescalado con alfa premultiplicado para no crear halos en los bordes.
    return img.convert("RGBa").resize((width, height), Image.LANCZOS).convert("RGBA")


def build(pdf_path):
    os.makedirs(OUT, exist_ok=True)
    emblem = extract_emblem(pdf_path)
    bbox = emblem.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    pad = 4
    bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(emblem.width, bbox[2] + pad), min(emblem.height, bbox[3] + pad))
    cropped = emblem.crop(bbox)

    web = resize(cropped, 400)
    web_path = os.path.join(OUT, "vertice-emblema.png")
    web.save(web_path, optimize=True)
    print("emblema", web.size, os.path.getsize(web_path), "bytes")

    # Icono de app: el ancho útil deja al menos H/6 de margen por cada lado.
    size = 256
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(tile).rounded_rectangle((0, 0, size - 1, size - 1), radius=56, fill=MARFIL)
    ratio = cropped.width / cropped.height
    w = int(size / (1 + 2 / (6 * ratio)) * 0.86)
    icon = resize(cropped, w)
    tile.alpha_composite(icon, ((size - icon.width) // 2, (size - icon.height) // 2))
    fav = tile.convert("RGBa").resize((64, 64), Image.LANCZOS).convert("RGBA")
    fav_path = os.path.join(OUT, "vertice-favicon.png")
    fav.save(fav_path, optimize=True)
    print("favicon", fav.size, os.path.getsize(fav_path), "bytes")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    build(sys.argv[1])
