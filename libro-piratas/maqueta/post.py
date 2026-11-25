# -*- coding: utf-8 -*-
"""Posproducción del PDF base (página con sangrado) a los entregables:
  1. *_imprenta.pdf : sangrado 3 mm + marcas de corte en zona de cortesía, TrimBox/BleedBox.
  2. *_digital.pdf  : páginas al corte, marcadores (índice navegable) y metadatos.
  3. *_pliegos.pdf  : vista de lectura a doble página, para revisar medianil y pliegos.
"""
import sys, os, io
from pypdf import PdfReader, PdfWriter, PageObject, Transformation
from pypdf.generic import RectangleObject, NameObject, ArrayObject, FloatObject
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
sys.path.insert(0, os.path.dirname(__file__))
import build as B
import content as C

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, 'out', 'base.pdf')
OUT = os.path.join(HERE, 'out')
NAME = 'Piratas_del_Caribe'
TW, TH, BL = B.TRIM_W * mm, B.TRIM_H * mm, B.BLEED * mm
PW, PH = TW + 2 * BL, TH + 2 * BL
SLUG = 10 * mm

META = {'/Title': 'Piratas del Caribe. Las cinco travesías', '/Subject': 'Crónica ilustrada de la saga cinematográfica (edición no oficial de aficionados)',
        '/Author': 'Edición de aficionados', '/Keywords': 'Piratas del Caribe; enciclopedia; diseño editorial', '/Creator': 'Maqueta HTML/CSS + Chromium; posproducción pypdf'}

def rect(x0, y0, x1, y1):
    return RectangleObject([FloatObject(x0), FloatObject(y0), FloatObject(x1), FloatObject(y1)])

def marks_page(folio):
    W, H = PW + 2 * SLUG, PH + 2 * SLUG
    buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=(W, H))
    c.setLineWidth(0.25); c.setStrokeColorRGB(0, 0, 0)
    tx0, ty0 = SLUG + BL, SLUG + BL; tx1, ty1 = tx0 + TW, ty0 + TH
    off, ln = BL + 1 * mm, 6 * mm           # las marcas empiezan fuera del sangrado
    for x in (tx0, tx1):
        for y, d in ((ty0, -1), (ty1, 1)):
            c.line(x, y + d * off, x, y + d * (off + ln))
    for y in (ty0, ty1):
        for x, d in ((tx0, -1), (tx1, 1)):
            c.line(x + d * off, y, x + d * (off + ln), y)
    # marcas de registro centradas
    for (cx, cy) in ((W / 2, SLUG / 2), (W / 2, H - SLUG / 2)):
        c.circle(cx, cy, 1.6 * mm); c.line(cx - 2.6 * mm, cy, cx + 2.6 * mm, cy); c.line(cx, cy - 2.6 * mm, cx, cy + 2.6 * mm)
    c.setFont('Helvetica', 5.5); c.setFillColorRGB(0, 0, 0)
    side = 'impar (recto)' if folio % 2 else 'par (verso)'
    c.drawString(SLUG + BL, 3.2 * mm, f'{NAME}_imprenta.pdf  ·  página {folio} de {B.TOTAL}  ·  {side}  ·  formato al corte 215,9 × 279,4 mm  ·  sangrado 3 mm')
    c.showPage(); c.save()
    return PdfReader(io.BytesIO(buf.getvalue())).pages[0]

def outline(writer):
    root = writer.add_outline_item('Cubierta interior: portada', 2)
    writer.add_outline_item('Índice', 3)
    writer.add_outline_item('Introducción', 5)
    writer.add_outline_item('Cómo consultar este libro', 6)
    writer.add_outline_item('Los personajes de la saga', 7)
    writer.add_outline_item('Cronología de la saga', 8)
    for f in C.FILMS:
        n = f['num']
        par = writer.add_outline_item(f'{f["roman"]} · {f["title"]} ({f["year"]})', B.page_of(n, 'opener') - 1)
        writer.add_outline_item('Ficha técnica', B.page_of(n, 'ficha') - 1, parent=par)
        writer.add_outline_item('Quién es quién', B.page_of(n, 'quien') - 1, parent=par)
        for i, s in enumerate(f['scenes'], 1):
            t = B.strip_tags(s['title'])
            writer.add_outline_item(f'Escena {i} · {t}', B.scene_page(n, i) - 1, parent=par)
            if i == 3:
                writer.add_outline_item('Escena clave', B.page_of(n, 'clave_v') - 1, parent=par)
        writer.add_outline_item('Reflexión', B.page_of(n, 'reflexion') - 1, parent=par)
    writer.add_outline_item('Epílogo', 69)
    writer.add_outline_item('Índice analítico', 70)
    writer.add_outline_item('Colofón', 71)

def main():
    base = PdfReader(BASE)
    assert len(base.pages) == B.TOTAL
    # 1) imprenta
    w = PdfWriter()
    for i, p in enumerate(base.pages, 1):
        np_ = PageObject.create_blank_page(width=PW + 2 * SLUG, height=PH + 2 * SLUG)
        np_.merge_transformed_page(p, Transformation().translate(SLUG, SLUG))
        np_.merge_page(marks_page(i))
        np_.mediabox = rect(0, 0, PW + 2 * SLUG, PH + 2 * SLUG)
        np_[NameObject('/BleedBox')] = rect(SLUG, SLUG, SLUG + PW, SLUG + PH)
        np_[NameObject('/TrimBox')] = rect(SLUG + BL, SLUG + BL, SLUG + BL + TW, SLUG + BL + TH)
        np_[NameObject('/ArtBox')] = rect(SLUG + BL, SLUG + BL, SLUG + BL + TW, SLUG + BL + TH)
        w.add_page(np_)
    w.add_metadata(META)
    w.compress_identical_objects(remove_identicals=True, remove_orphans=True)
    w.write(os.path.join(OUT, f'{NAME}_imprenta.pdf'))
    # 2) digital (al corte), con marcadores, enlaces y etiquetas de página
    w = PdfWriter(clone_from=BASE)
    for p in w.pages:
        box = rect(BL, BL, BL + TW, BL + TH)
        p.mediabox = box; p.cropbox = box
        p[NameObject('/TrimBox')] = box; p[NameObject('/BleedBox')] = box
    outline(w)
    w.add_metadata(META)
    w._root_object[NameObject('/PageMode')] = NameObject('/UseOutlines')
    w._root_object[NameObject('/PageLayout')] = NameObject('/TwoPageRight')   # abre en pliegos
    w.write(os.path.join(OUT, f'{NAME}_digital.pdf'))
    # 3) pliegos (vista de libro abierto)
    dig = PdfReader(os.path.join(OUT, f'{NAME}_digital.pdf'))
    w = PdfWriter()
    def spread(left, right):
        sp = PageObject.create_blank_page(width=2 * TW, height=TH)
        for k, n in enumerate((left, right)):
            if n is None: continue
            p = dig.pages[n - 1]
            sp.merge_transformed_page(p, Transformation().translate(-BL + k * TW, -BL))
        sp.mediabox = rect(0, 0, 2 * TW, TH)
        return sp
    w.add_page(spread(None, 1))
    for n in range(2, B.TOTAL, 2):
        w.add_page(spread(n, n + 1))
    w.add_page(spread(B.TOTAL, None))
    w.add_metadata({**META, '/Title': 'Piratas del Caribe — vista en pliegos'})
    w.compress_identical_objects(remove_identicals=True, remove_orphans=True)
    w.write(os.path.join(OUT, f'{NAME}_pliegos.pdf'))
    print('ok')

if __name__ == '__main__':
    main()
