"""Tipografia y dibujo 2D: HarfBuzz para dar forma al texto (kerning, cifras tabulares,
ligaduras desactivadas al espaciar) y Skia para rasterizar glifos y vectores con antialias.

Medidas en pixeles del lienzo (3840x2160 en el master).
"""
import os

import numpy as np
import skia
import uharfbuzz as hb

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONTS = os.path.join(ROOT, "assets", "fonts")


def _tag(s):
    s = s.ljust(4)[:4]
    return (ord(s[0]) << 24) | (ord(s[1]) << 16) | (ord(s[2]) << 8) | ord(s[3])


class Face:
    def __init__(self, rel_path, **axes):
        path = os.path.join(FONTS, rel_path)
        blob = hb.Blob.from_file_path(path)
        self.hb_face = hb.Face(blob)
        self.hb_font = hb.Font(self.hb_face)
        self.upem = self.hb_face.upem
        tf = skia.Typeface.MakeFromFile(path)
        if axes:
            self.hb_font.set_variations({k: float(v) for k, v in axes.items()})
            coords = [skia.FontArguments.VariationPosition.Coordinate(_tag(k), float(v)) for k, v in axes.items()]
            pos = skia.FontArguments.VariationPosition(skia.FontArguments.VariationPosition.Coordinates(coords))
            args = skia.FontArguments()
            args.setVariationDesignPosition(pos)
            tf = tf.makeClone(args)
        self.tf = tf

    def shape(self, text, size, features=None, tracking=0.0):
        feats = {"kern": True, "liga": tracking == 0, "clig": tracking == 0}
        feats.update(features or {})
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.hb_font, buf, feats)
        sc = size / self.upem
        gl, xs, x = [], [], 0.0
        for info, p in zip(buf.glyph_infos, buf.glyph_positions):
            gl.append(info.codepoint)
            xs.append(x + p.x_offset * sc)
            x += p.x_advance * sc + tracking
        width = x - tracking if gl else 0.0
        return gl, xs, width

    def metrics(self, size):
        m = skia.Font(self.tf, size).getMetrics()
        return {"ascent": -m.fAscent, "descent": m.fDescent, "cap": m.fCapHeight, "x": m.fXHeight}


class Fonts(dict):
    def register(self, alias, rel_path, **axes):
        self[alias] = Face(rel_path, **axes)
        return alias


def default_fonts():
    f = Fonts()
    # Nombres de montana y titulos: serif de tradicion cartografica (Source Serif 4, corte display)
    f.register("Title", "sourceserif4/SourceSerif4[opsz,wght].ttf", opsz=60, wght=400)
    f.register("TitleLight", "sourceserif4/SourceSerif4[opsz,wght].ttf", opsz=60, wght=300)
    f.register("TitleItalic", "sourceserif4/SourceSerif4-Italic[opsz,wght].ttf", opsz=60, wght=350)
    f.register("SerifText", "sourceserif4/SourceSerif4[opsz,wght].ttf", opsz=24, wght=400)
    f.register("SerifTextItalic", "sourceserif4/SourceSerif4-Italic[opsz,wght].ttf", opsz=24, wght=400)
    # Datos: Inter con cifras tabulares
    f.register("Data", "inter/Inter-Regular.otf")
    f.register("DataLight", "inter/Inter-Light.otf")
    f.register("DataMedium", "inter/Inter-Medium.otf")
    f.register("DataSemi", "inter/Inter-SemiBold.otf")
    f.register("Display", "inter/InterDisplay-Light.otf")
    return f


def color4(c, a=None):
    if len(c) == 3:
        c = (*c, 1.0 if a is None else a)
    elif a is not None:
        c = (c[0], c[1], c[2], a)
    return skia.Color4f(*[float(v) for v in c])


def draw_text(canvas, fonts, text, x, y, family, size, color=(1, 1, 1, 1), tracking=0.0, features=None,
              align="left", opacity=1.0, blur=0.0, halo=None):
    """Texto en una linea con la linea base en y. Devuelve el ancho."""
    face = fonts[family]
    gl, xs, w = face.shape(text, size, features, tracking)
    if not gl:
        return 0.0
    ox = {"left": x, "center": x - w / 2, "right": x - w}[align]
    font = skia.Font(face.tf, size)
    font.setSubpixel(True)
    font.setEdging(skia.Font.Edging.kAntiAlias)
    font.setHinting(skia.FontHinting.kNone)
    b = skia.TextBlobBuilder()
    b.allocRunPosH(font, gl, xs, 0.0)
    blob = b.make()
    c = list(color) + [1.0] * (4 - len(color))
    if halo:
        # halo oscuro difuso: separa el texto del relieve claro sin dibujar paneles
        hc, hw = halo
        hc = list(hc) + [1.0] * (4 - len(hc))
        hp = skia.Paint(AntiAlias=True, Color4f=skia.Color4f(hc[0], hc[1], hc[2], hc[3] * opacity),
                        Style=skia.Paint.kStrokeAndFill_Style, StrokeWidth=hw)
        hp.setStrokeJoin(skia.Paint.kRound_Join)
        hp.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, max(hw * 0.7, 0.5)))
        canvas.drawTextBlob(blob, ox, y, hp)
    paint = skia.Paint(AntiAlias=True, Color4f=skia.Color4f(c[0], c[1], c[2], c[3] * opacity))
    if blur > 0.05:
        paint.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, blur))
    canvas.drawTextBlob(blob, ox, y, paint)
    return w


def measure(fonts, text, family, size, tracking=0.0, features=None):
    return fonts[family].shape(text, size, features, tracking)[2]


def wrap(fonts, text, family, size, max_w, tracking=0.0):
    words, lines, cur = text.split(), [], ""
    for wd in words:
        t = (cur + " " + wd).strip()
        if measure(fonts, t, family, size, tracking) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = wd
    if cur:
        lines.append(cur)
    return lines


class Layer:
    """Lienzo RGBA premultiplicado de Skia con conversion a numpy."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.surface = skia.Surface(w, h)
        self.canvas = self.surface.getCanvas()
        self.canvas.clear(skia.Color4f(0, 0, 0, 0))

    def array(self):
        img = self.surface.makeImageSnapshot()
        a = img.toarray(colorType=skia.kRGBA_8888_ColorType, alphaType=skia.kPremul_AlphaType)
        return a.astype(np.float32) * (1.0 / 255.0)


def composite(base, layer_rgba_premul, opacity=1.0):
    """base: float32 HxWx3 en espacio de pantalla; capa premultiplicada."""
    a = layer_rgba_premul[..., 3:4] * opacity
    return base * (1.0 - a) + layer_rgba_premul[..., :3] * opacity
