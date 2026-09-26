#!/usr/bin/env python3
"""Genera las fuentes Inter incorporadas en TRAZA.

Uso:
    npm pack inter-ui@4.1.1 && tar xzf inter-ui-4.1.1.tgz
    python3 traza/tools/build_fonts.py package/   # carpeta del paquete inter-ui

Requiere: pip install fonttools brotli

Salidas (traza/vendor/fonts/):
  - InterVariable-traza.woff2  interfaz; eje wght limitado a 400-700, opsz 14-32,
                               subconjunto latino + simbolos financieros y matematicos.
  - Inter-Regular-traza.ttf    informe PDF (jsPDF solo admite TTF); cifras 0-9
  - Inter-Bold-traza.ttf       remapeadas a sus variantes tabulares (.tf) para que
                               las columnas del PDF queden alineadas.
  - OFL.txt                    licencia SIL Open Font License 1.1 de Inter.
"""
import json
import os
import shutil
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "vendor", "fonts")

# Latin basico, Latin-1, Latin extendido A, griego basico (Delta, Sigma, epsilon),
# puntuacion general, super/subindices, divisas, flechas, operadores y formas.
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

UI_FEATURES = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk", "tnum", "pnum",
               "case", "sups", "subs", "numr", "dnom", "frac", "zero"]


def subset_font(font, unicodes, layout_features, flavor=None, keep_layout=True):
    opts = subset.Options()
    opts.layout_features = layout_features
    opts.hinting = False
    opts.desubroutinize = True
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    opts.notdef_outline = True
    opts.glyph_names = False
    opts.flavor = flavor
    if not keep_layout:
        opts.drop_tables += ["GSUB", "GPOS", "GDEF"]
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=unicodes)
    sub.subset(font)
    return font


def freeze_tabular_digits(font):
    """Hace que U+0030..U+0039 apunten a los glifos tabulares (.tf)."""
    glyphs = set(font.getGlyphOrder())
    names = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
    for table in font["cmap"].tables:
        if not table.isUnicode():
            continue
        for i, name in enumerate(names):
            tf = name + ".tf"
            cp = 0x30 + i
            if cp in table.cmap and tf in glyphs:
                table.cmap[cp] = tf


def build(pkg):
    os.makedirs(OUT, exist_ok=True)

    # 1) Interfaz: fuente variable acotada a 400-700.
    # Primero el subconjunto y luego el acotado del eje: al reves, gvar pierde
    # entradas de glifos vacios y fontTools falla al subconjuntar.
    var = TTFont(os.path.join(pkg, "variable", "InterVariable.woff2"))
    var.flavor = None
    subset_font(var, UNICODES, UI_FEATURES)
    var = instancer.instantiateVariableFont(var, {"wght": (400, 700)})
    var.flavor = "woff2"
    ui_path = os.path.join(OUT, "InterVariable-traza.woff2")
    var.save(ui_path)
    print("UI  ", ui_path, os.path.getsize(ui_path), "bytes")

    # 2) PDF: instancias estaticas TTF con cifras tabulares congeladas.
    for weight in ("Regular", "Bold"):
        f = TTFont(os.path.join(pkg, "web", "Inter-%s.woff2" % weight))
        f.flavor = None
        freeze_tabular_digits(f)
        extra = [n + ".tf" for n in ("zero", "one", "two", "three", "four",
                                      "five", "six", "seven", "eight", "nine")]
        opts = subset.Options()
        opts.layout_features = []
        opts.hinting = False
        opts.glyph_names = False
        opts.notdef_outline = True
        opts.name_IDs = ["*"]
        opts.drop_tables += ["GSUB", "GPOS", "GDEF"]
        sub = subset.Subsetter(options=opts)
        sub.populate(unicodes=UNICODES, glyphs=extra)
        sub.subset(f)
        path = os.path.join(OUT, "Inter-%s-traza.ttf" % weight)
        f.save(path)
        print("PDF ", path, os.path.getsize(path), "bytes")

    # Mapa de caracteres cubiertos por la fuente del PDF: las pruebas lo usan
    # para garantizar que ningún texto del informe caiga en .notdef.
    covered = sorted(TTFont(os.path.join(OUT, "Inter-Regular-traza.ttf")).getBestCmap().keys())
    with open(os.path.join(OUT, "pdf-cmap.json"), "w") as fh:
        json.dump(covered, fh)

    shutil.copyfile(os.path.join(pkg, "LICENSE.txt"), os.path.join(OUT, "OFL.txt"))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    build(sys.argv[1])
