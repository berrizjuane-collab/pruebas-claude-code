#!/usr/bin/env python3
"""Genera las fuentes incorporadas de VÉRTICE.

La guía de marca pide Georgia (titulares) y Segoe UI (interfaz). Ambas son de
Microsoft y no pueden incrustarse, así que la interfaz las usa cuando están
instaladas y, si no, recurre a sustitutos abiertos (SIL OFL 1.1) incorporados:

  - VerticeSerif = Gelasio, diseñada con métricas compatibles con Georgia.
  - VerticeSans  = Noto Sans, cuyo latín deriva de Open Sans, el pariente
                   tipográfico directo de Segoe UI (mismo diseñador).

El informe PDF no puede usar fuentes del sistema, así que siempre incorpora
estos sustitutos. A Noto Sans le faltan algunas flechas y operadores que usan
las fórmulas; se toman de Inter (también OFL), reescalados a la misma unidad
de diseño. Por ser fuentes modificadas se renombran las familias.

Uso:
    npm pack @expo-google-fonts/noto-sans @expo-google-fonts/gelasio inter-ui@4.1.1
    (descomprimir cada .tgz en su carpeta)
    python3 traza/tools/build_fonts.py NOTO_PKG GELASIO_PKG INTER_UI_PKG

Requiere: pip install fonttools brotli

Salidas (traza/vendor/fonts/):
  - VerticeSans-Regular.woff2, VerticeSans-SemiBold.woff2, VerticeSerif-Regular.woff2   (interfaz)
  - VerticeSans-Regular.ttf,   VerticeSans-SemiBold.ttf,   VerticeSerif-Regular.ttf     (PDF)
  - pdf-cmap.json   caracteres cubiertos por las fuentes del PDF ({"sans": [...], "serif": [...]})
  - OFL-NotoSans.txt, OFL-Gelasio.txt, OFL-Inter.txt
"""
import json
import os
import shutil
import sys

from fontTools import subset
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "vendor", "fonts")

UNICODES = (
    list(range(0x0020, 0x007F))
    + list(range(0x00A0, 0x0180))
    + [0x0131, 0x02BC, 0x02C6, 0x02C7, 0x02D8, 0x02D9, 0x02DA, 0x02DB, 0x02DC, 0x02DD]
    + list(range(0x0391, 0x03AA))
    + list(range(0x03B1, 0x03CA))
    + list(range(0x2000, 0x2070))
    + list(range(0x2070, 0x20A0))
    + list(range(0x20A0, 0x20C1))
    + list(range(0x2190, 0x219A))
    + [0x2113, 0x2116, 0x2122, 0x2126, 0x2202, 0x2206, 0x220F, 0x2211, 0x2212, 0x2215,
       0x2219, 0x221A, 0x221E, 0x222B, 0x2248, 0x2260, 0x2264, 0x2265, 0x25B2, 0x25B4,
       0x25B6, 0x25B8, 0x25BC, 0x25BE, 0x25C0, 0x25C2, 0x25CF, 0x2713, 0x2717]
)

# Glifos que Noto Sans no trae y que la interfaz o el informe usan.
BORROW = [0x2190, 0x2191, 0x2192, 0x2193, 0x2194, 0x2195, 0x2248, 0x2264, 0x2265,
          0x25B2, 0x25BC, 0x2713]

UI_FEATURES = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk", "tnum", "pnum",
               "lnum", "case", "sups", "subs", "numr", "dnom", "frac"]


def borrow_glyphs(dst, src, codepoints):
    """Copia contornos de `src` a `dst` para los códigos ausentes, reescalando."""
    scale = dst["head"].unitsPerEm / src["head"].unitsPerEm
    src_set = src.getGlyphSet()
    src_cmap = src.getBestCmap()
    dst_cmap = dst.getBestCmap()
    order = list(dst.getGlyphOrder())
    glyf = dst["glyf"]
    hmtx = dst["hmtx"]
    added = []
    for cp in codepoints:
        if cp in dst_cmap or cp not in src_cmap:
            continue
        rec = DecomposingRecordingPen(src_set)
        src_set[src_cmap[cp]].draw(rec)
        pen = TTGlyphPen(None)
        rec.replay(TransformPen(pen, (scale, 0, 0, scale, 0, 0)))
        name = "vtx.%04X" % cp
        glyph = pen.glyph()
        glyph.recalcBounds(glyf)
        order.append(name)
        glyf.glyphs[name] = glyph
        adv = round(src["hmtx"][src_cmap[cp]][0] * scale)
        hmtx.metrics[name] = (adv, getattr(glyph, "xMin", 0))
        for table in dst["cmap"].tables:
            if table.isUnicode():
                table.cmap[cp] = name
        added.append(cp)
    dst.setGlyphOrder(order)
    glyf.glyphOrder = order
    return added


def rename(font, family, style):
    ps = (family + "-" + style).replace(" ", "")
    for rec in font["name"].names:
        if rec.nameID in (1, 16):
            rec.string = family
        elif rec.nameID in (2, 17):
            rec.string = style
        elif rec.nameID == 4:
            rec.string = family + " " + style
        elif rec.nameID == 6:
            rec.string = ps
        elif rec.nameID == 3:
            rec.string = ps + ";VERTICE"


def make_subset(font, layout_features, keep_layout):
    opts = subset.Options()
    opts.layout_features = layout_features
    # Las fuentes de origen no traen instrucciones por glifo, solo un `prep` mínimo
    # (control de dropout). Conservarlo en la interfaz importa: sin él, FreeType
    # recurre al autohinter, que redondea avances y espacia mal las versalitas.
    opts.hinting = keep_layout
    opts.glyph_names = False
    opts.notdef_outline = True
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    if not keep_layout:
        opts.drop_tables += ["GSUB", "GPOS", "GDEF"]
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=UNICODES)
    sub.subset(font)
    return font


def build(noto_pkg, gelasio_pkg, inter_pkg):
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ("VerticeSans", "Regular", os.path.join(noto_pkg, "400Regular", "NotoSans_400Regular.ttf"),
         os.path.join(inter_pkg, "web", "Inter-Regular.woff2")),
        ("VerticeSans", "SemiBold", os.path.join(noto_pkg, "600SemiBold", "NotoSans_600SemiBold.ttf"),
         os.path.join(inter_pkg, "web", "Inter-SemiBold.woff2")),
        ("VerticeSerif", "Regular", os.path.join(gelasio_pkg, "400Regular", "Gelasio_400Regular.ttf"), None),
    ]
    cmaps = {}
    for family, style, path, borrow_from in jobs:
        for flavor in ("woff2", "ttf"):
            font = TTFont(path, recalcTimestamp=False)  # salida reproducible
            if borrow_from:
                src = TTFont(borrow_from)
                src.flavor = None
                added = borrow_glyphs(font, src, BORROW)
                if flavor == "ttf":
                    print("  %s %s: glifos de Inter añadidos %s" % (family, style, ["U+%04X" % c for c in added]))
            rename(font, family, style)
            if flavor == "woff2":
                make_subset(font, UI_FEATURES, keep_layout=True)
                font.flavor = "woff2"
            else:
                make_subset(font, [], keep_layout=False)
            out = os.path.join(OUT, "%s-%s.%s" % (family, style, flavor))
            font.save(out)
            print("%-6s %s %d bytes" % (flavor, out, os.path.getsize(out)))
            if flavor == "ttf" and style == "Regular":
                cmaps["sans" if family == "VerticeSans" else "serif"] = sorted(TTFont(out).getBestCmap().keys())

    with open(os.path.join(OUT, "pdf-cmap.json"), "w") as fh:
        json.dump(cmaps, fh)
    shutil.copyfile(os.path.join(noto_pkg, "LICENSE_FONT"), os.path.join(OUT, "OFL-NotoSans.txt"))
    for name in ("LICENSE_FONT", "OFL.txt"):
        candidate = os.path.join(gelasio_pkg, name)
        if os.path.exists(candidate):
            shutil.copyfile(candidate, os.path.join(OUT, "OFL-Gelasio.txt"))
            break
    shutil.copyfile(os.path.join(inter_pkg, "LICENSE.txt"), os.path.join(OUT, "OFL-Inter.txt"))


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    build(*sys.argv[1:])
