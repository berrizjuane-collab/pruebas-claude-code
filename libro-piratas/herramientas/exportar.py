"""Convierte el PDF de pliegos (salida de Chromium) en los dos entregables:

1. Piratas_del_Caribe_64pp_paginas.pdf
   64 páginas individuales en orden de lectura, sin imposición, cada una con 3 mm de sangrado.
   MediaBox = BleedBox = corte + 3 mm; TrimBox = corte (219,12 × 309,37 mm).
   En el lado del lomo, el sangrado muestra los 3 mm de la página enfrentada (como exporta InDesign).

2. Piratas_del_Caribe_revision_pliegos.pdf
   Revisión en pantalla: portada sola, 31 dobles páginas enfrentadas (sin sangrado) y contraportada sola,
   tal como se ven al abrir el libro. La mitad vacía de portada y contraportada aparece en gris.

Uso: python3 exportar.py salida/_pliegos.pdf salida/
"""
import sys
import os
import pymupdf
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject, NameObject

MM = 72 / 25.4
W, H, B = 219.12 * MM, 309.37 * MM, 3.0 * MM


def caja(x0, y0, x1, y1, alto_pag):
    """Rectángulo PDF (origen abajo a la izquierda) a partir de coordenadas desde arriba."""
    return RectangleObject([x0, alto_pag - y1, x1, alto_pag - y0])


def optimizar(src, dst):
    """Recomprime a JPEG (q 92, sin submuestreo de color) las texturas que Chromium guarda sin pérdida.
    Solo afecta a imágenes RGB opacas sin máscara (recortes del pergamino); no toca texto ni vectores."""
    import io
    from PIL import Image
    d = pymupdf.open(src)
    hechas, antes, despues = set(), 0, 0
    for p in d:
        for img in p.get_images(full=True):
            xref, smask, filtro = img[0], img[1], img[8]
            if xref in hechas or smask or filtro == "DCTDecode":
                continue
            hechas.add(xref)
            pix = pymupdf.Pixmap(d, xref)
            if pix.alpha or pix.n != 3:
                continue
            crudo = len(d.xref_stream_raw(xref))
            im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=92, subsampling=0, optimize=True)
            if buf.tell() < crudo * 0.8:
                p.replace_image(xref, stream=buf.getvalue())
                antes += crudo
                despues += buf.tell()
    d.save(dst, garbage=3, deflate=True)
    print(f"optimización: {len(hechas)} imágenes revisadas, {antes / 1048576:.1f} MB -> {despues / 1048576:.1f} MB")


def paginas(src, dst):
    r = PdfReader(src)
    w = PdfWriter()
    n = len(r.pages)
    for i, pg in enumerate(r.pages):
        hp = float(pg.mediabox.height)
        mitades = []
        if i == 0:
            mitades = ["der"]           # portada: página 1 (derecha)
        elif i == n - 1:
            mitades = ["izq"]           # contraportada: página 64 (izquierda)
        else:
            mitades = ["izq", "der"]
        for lado in mitades:
            nueva = w.add_page(pg)
            x0 = 0 if lado == "izq" else W  # bleed izquierdo empieza en 0; derecho en (B + W) - B
            media = caja(x0, 0, x0 + W + 2 * B, H + 2 * B, hp)
            trim = caja(x0 + B, B, x0 + B + W, B + H, hp)
            nueva.mediabox = media
            nueva.cropbox = media
            nueva[NameObject("/BleedBox")] = media
            nueva[NameObject("/TrimBox")] = trim
    w.add_metadata({"/Title": "Piratas del Caribe · La saga completa en cinco películas",
                    "/Subject": "Libro ilustrado, 64 páginas, corte 219,12 × 309,37 mm, sangrado 3 mm"})
    w.compress_identical_objects(remove_identicals=True, remove_orphans=True)
    with open(dst, "wb") as f:
        w.write(f)
    return len(w.pages)


def revision(src, dst):
    s = pymupdf.open(src)
    d = pymupdf.open()
    n = len(s)
    gris = (0.62, 0.62, 0.62)
    for i in range(n):
        pg = d.new_page(width=2 * W, height=H)
        if i == 0:
            pg.draw_rect(pymupdf.Rect(0, 0, W, H), color=None, fill=gris)
            pg.show_pdf_page(pymupdf.Rect(W, 0, 2 * W, H), s, i, clip=pymupdf.Rect(B + W, B, B + 2 * W, B + H))
        elif i == n - 1:
            pg.show_pdf_page(pymupdf.Rect(0, 0, W, H), s, i, clip=pymupdf.Rect(B, B, B + W, B + H))
            pg.draw_rect(pymupdf.Rect(W, 0, 2 * W, H), color=None, fill=gris)
        else:
            pg.show_pdf_page(pymupdf.Rect(0, 0, 2 * W, H), s, i, clip=pymupdf.Rect(B, B, B + 2 * W, B + H))
    d.set_metadata({"title": "Piratas del Caribe · revisión de pliegos (no imprimir)"})
    d.save(dst, garbage=3, deflate=True)
    return len(d)


if __name__ == "__main__":
    src, carpeta = sys.argv[1], sys.argv[2]
    opt = src.replace(".pdf", "_opt.pdf")
    optimizar(src, opt)
    src = opt
    a = os.path.join(carpeta, "Piratas_del_Caribe_64pp_paginas.pdf")
    b = os.path.join(carpeta, "Piratas_del_Caribe_revision_pliegos.pdf")
    print("páginas:", paginas(src, a), "->", a, f"{os.path.getsize(a) / 1048576:.1f} MB")
    print("revisión:", revision(src, b), "->", b, f"{os.path.getsize(b) / 1048576:.1f} MB")
