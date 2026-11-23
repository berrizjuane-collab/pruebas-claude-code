"""Uso: python3 extraer_ilustraciones.py <pdf_original> <carpeta_salida> <ilustraciones.json>

Extrae una región vectorial de una página del PDF original como SVG,
eliminando texto y mapas de bits (texturas) para quedarnos solo con la ilustración."""
import pymupdf, sys, json, re
src, outdir, spec = sys.argv[1], sys.argv[2], sys.argv[3]
items = {k: v for k, v in json.load(open(spec)).items() if not k.startswith("_")}
d = pymupdf.open(src)
for name, (pn, x0, y0, x1, y1, keep_imgs) in items.items():
    tmp = pymupdf.open()
    tmp.insert_pdf(d, from_page=pn-1, to_page=pn-1)
    p = tmp[0]
    p.add_redact_annot(p.rect)
    p.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE if keep_imgs else pymupdf.PDF_REDACT_IMAGE_REMOVE,
                       graphics=pymupdf.PDF_REDACT_LINE_ART_NONE, text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    p.set_cropbox(pymupdf.Rect(x0, y0, x1, y1) & p.mediabox)
    svg = p.get_svg_image(text_as_path=True)
    open(f"{outdir}/{name}.svg", "w").write(svg)
    print(name, len(svg))
