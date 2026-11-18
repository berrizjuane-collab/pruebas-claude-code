"""
make_pdf.py — arma el PDF de la serie a partir de los PNG renderizados.

    python3 make_pdf.py <carpeta_png> <salida.pdf> [calidad_jpeg=90]

Las imágenes se incrustan como JPEG (sin recomprimir dentro del PDF) para que
el archivo sea liviano. La calidad completa está en los PNG que genera scenes.py.
"""
import os, sys, io
from PIL import Image
from reportlab import rl_config
rl_config.useA85 = 0            # JPEG binario dentro del PDF (sin inflar un 25 %)
from reportlab.pdfgen import canvas
from reportlab.lib.colors import Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
try:
    pdfmetrics.registerFont(TTFont("Serif", os.path.join(FONT_DIR, "DejaVuSerif.ttf")))
    pdfmetrics.registerFont(TTFont("SerifB", os.path.join(FONT_DIR, "DejaVuSerif-Bold.ttf")))
    pdfmetrics.registerFont(TTFont("Sans", os.path.join(FONT_DIR, "DejaVuSans.ttf")))
    F_SERIF, F_SERIFB, F_SANS = "Serif", "SerifB", "Sans"
except Exception:
    F_SERIF, F_SERIFB, F_SANS = "Times-Roman", "Times-Bold", "Helvetica"

PLATES = [
    ("01_campo_base", "Campo Base", "4 850 m",
     "28.584° N  84.602° E  ·  mirando al OSO (244°)  ·  mañana",
     "La cara NE del Manaslu desde la morrena: la cumbre (8 163 m) arriba al centro, la ruta normal "
     "subiendo por la cascada de hielo y el Manaslu Norte a la derecha. Chorten de la puja con banderas de oración."),
    ("02_campo_1", "Campo 1", "5 700 m",
     "28.580° N  84.573° E  ·  cámara a 5 500 m, bajo el campo  ·  mirando al SO (222°)  ·  mañana",
     "Al pie de la pared: la cascada de hielo hacia el Campo 2 y la cumbre asomando arriba a la izquierda, "
     "a 3 km y 40° sobre el horizonte. Una cordada sigue los banderines."),
    ("03_campo_2", "Campo 2", "6 400 m",
     "28.574° N  84.559° E  ·  mirando al E (80°)  ·  mediodía",
     "De espaldas a la montaña: el glaciar del Manaslu cae hacia el valle de Samagaon y las cumbres "
     "del otro lado del Budhi Gandaki. Cúmulos de la tarde formándose."),
    ("04_campo_3", "Campo 3", "6 800 m",
     "28.567° N  84.557° E  ·  mirando al NNO (344°)  ·  alba",
     "Primera luz sobre el Manaslu Norte (7 157 m), a 2 km, al otro lado del Collado Norte; "
     "detrás, la bruma rosada sobre los valles del Larkya."),
    ("05_campo_4_noche", "Campo 4", "7 400 m",
     "28.560° N  84.554° E  ·  mirando al N (346°)  ·  noche de cumbre",
     "Medianoche antes del ataque final: carpas encendidas, frontales y el Manaslu Norte "
     "bajo la luna, sobre un mar de nubes."),
    ("06_cumbre", "Cumbre", "8 163 m",
     "28.553° N  84.557° E  ·  mirando al SSE (163°)  ·  amanecer",
     "Desde la arista cimera: el Himalchuli (7 893 m, a 15 km) a la izquierda y el Ngadi Chuli "
     "(7 871 m, a 6 km) a la derecha, emergiendo del mar de nubes."),
]

PW, PH = 1152.0, 760.0          # página apaisada
IMG_H = PW * 9 / 16             # 648 pt
INK = Color(0.11, 0.12, 0.17)
PAPER = Color(0.93, 0.91, 0.87)
DIM = Color(0.62, 0.62, 0.66)


def jpeg_bytes(path, q, max_w=None):
    im = Image.open(path).convert("RGB")
    if max_w and im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    b = io.BytesIO()
    im.save(b, "JPEG", quality=q, optimize=True, progressive=True, subsampling=0 if q >= 93 else 2)
    b.seek(0)
    return b


def wrap(c, text, font, size, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if c.stringWidth(t, font, size) > width and cur:
            lines.append(cur); cur = w
        else:
            cur = t
    if cur:
        lines.append(cur)
    return lines


def build(folder, out, q=90, max_w=None):
    from reportlab.lib.utils import ImageReader
    c = canvas.Canvas(out, pagesize=(PW, PH))
    c.setTitle("Manaslu · 8 163 m — seis vistas en pincel seco")
    c.setAuthor("Juan Berrizbeitia")
    c.setSubject("Ilustraciones del Manaslu sobre DEM real (ASTER GDEM v3)")
    # portada: la cumbre como fondo atenuado
    c.setFillColor(INK); c.rect(0, 0, PW, PH, fill=1, stroke=0)
    cover = os.path.join(folder, "06_cumbre.png")
    if os.path.exists(cover):
        c.drawImage(ImageReader(jpeg_bytes(cover, 70, 1600)), 0, PH - IMG_H, PW, IMG_H)
        c.setFillColor(Color(0.07, 0.08, 0.13, alpha=0.55)); c.rect(0, 0, PW, PH, fill=1, stroke=0)
    c.setFillColor(PAPER)
    c.setFont(F_SERIFB, 64); c.drawString(72, PH - 250, "MANASLU")
    c.setFont(F_SERIF, 26); c.drawString(76, PH - 292, "8 163 m  ·  Mansiri Himal, Nepal")
    c.setFont(F_SANS, 14); c.setFillColor(Color(0.85, 0.83, 0.80))
    lines = ["Seis vistas de la ruta normal (cara NE) — del Campo Base a la cumbre.",
             "Estilo «pincel seco sobre fondo oscuro». Relieve calculado sobre el modelo digital",
             "de elevación real ASTER GDEM v3 y la posición real de cada campo."]
    for i, l in enumerate(lines):
        c.drawString(78, PH - 340 - i * 22, l)
    c.setFont(F_SANS, 11); c.setFillColor(DIM)
    for i, (fn, name, alt, *_r) in enumerate(PLATES):
        c.drawString(78, 150 - i * 17, f"{i+1:02d}   {name}  ·  {alt}")
    c.showPage()
    for i, (fn, name, alt, where, text) in enumerate(PLATES):
        p = os.path.join(folder, fn + ".png")
        if not os.path.exists(p):
            print("falta", p); continue
        c.setFillColor(INK); c.rect(0, 0, PW, PH, fill=1, stroke=0)
        c.drawImage(ImageReader(jpeg_bytes(p, q, max_w)), 0, PH - IMG_H, PW, IMG_H)
        y = PH - IMG_H
        c.setFillColor(PAPER); c.setFont(F_SERIFB, 22)
        c.drawString(36, y - 40, f"{name}")
        nw = c.stringWidth(name, F_SERIFB, 22)
        c.setFont(F_SERIF, 18); c.setFillColor(Color(0.86, 0.72, 0.52))
        c.drawString(36 + nw + 14, y - 40, alt)
        c.setFont(F_SANS, 9.5); c.setFillColor(DIM)
        c.drawString(36, y - 62, where)
        c.setFont(F_SERIF, 11); c.setFillColor(Color(0.82, 0.81, 0.78))
        for k, l in enumerate(wrap(c, text, F_SERIF, 11, 560)):
            c.drawString(PW - 36 - 560, y - 34 - k * 15, l)
        c.setFont(F_SANS, 9); c.setFillColor(DIM)
        c.drawRightString(PW - 36, 14, f"{i+1} / 6")
        c.showPage()
    c.save()
    print("PDF:", out, f"{os.path.getsize(out)/1e6:.1f} MB")


if __name__ == "__main__":
    folder, out = sys.argv[1], sys.argv[2]
    q = int(sys.argv[3]) if len(sys.argv) > 3 else 93
    build(folder, out, q)
