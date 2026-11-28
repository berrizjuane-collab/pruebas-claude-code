"""Arma el PDF de láminas a partir de los masters PNG que genera generar.py.

    python3 pdf_laminas.py <carpeta_png> <salida.pdf> [--ancho 5120] [--calidad 90]

Las láminas se incrustan como JPEG (sin recomprimir dentro del PDF) para que el archivo pese poco;
la calidad completa está en los PNG de generar.py, que se pueden rehacer a cualquier resolución.
Tipografía neutra (DejaVu, o las PostScript estándar si no está): la identidad de la web se decide aparte.
"""
import io
import os
import sys
import argparse
from PIL import Image
from reportlab import rl_config
rl_config.useA85 = 0            # JPEG binario dentro del PDF (sin inflarlo un 25 %)
from reportlab.pdfgen import canvas                 # noqa: E402
from reportlab.lib.colors import Color              # noqa: E402
from reportlab.lib.utils import ImageReader         # noqa: E402
from reportlab.pdfbase import pdfmetrics            # noqa: E402
from reportlab.pdfbase.ttfonts import TTFont        # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import escenas as S             # noqa: E402

FUENTES = '/usr/share/fonts/truetype/dejavu'
try:
    pdfmetrics.registerFont(TTFont('Serif', os.path.join(FUENTES, 'DejaVuSerif.ttf')))
    pdfmetrics.registerFont(TTFont('SerifB', os.path.join(FUENTES, 'DejaVuSerif-Bold.ttf')))
    pdfmetrics.registerFont(TTFont('Sans', os.path.join(FUENTES, 'DejaVuSans.ttf')))
    F_SERIF, F_SERIFB, F_SANS = 'Serif', 'SerifB', 'Sans'
except Exception:
    F_SERIF, F_SERIFB, F_SANS = 'Times-Roman', 'Times-Bold', 'Helvetica'

# ficha de cada lámina: posición de la cámara y orientación (para el pie)
FICHA = {
    'poon_hill': '28.400° N  83.689° E  ·  3 210 m (torre, +14 m)  ·  mirando al NO (327°)  ·  Dhaulagiri I a 38 km',
    'campo_base': '28.746° N  83.502° E  ·  4 700 m  ·  mirando al S (178°)  ·  la cima a 5.5 km y 3 400 m más alta',
    'campo_1': '28.710° N  83.529° E  ·  5 850 m  ·  mirando al OSO (246°)  ·  la cima a 4.1 km por la arista NE',
    'campo_2': '28.707° N  83.514° E  ·  6 500 m  ·  mirando al E (104°)  ·  Annapurna I a 33 km',
    'campo_3': '28.703° N  83.504° E  ·  7 300 m  ·  mirando al NE (46°)  ·  Tukuche Peak a 7 km, 400 m más bajo',
    'cumbre': '28.699° N  83.487° E  ·  arista cimera, 220 m al O de la cima  ·  mirando al ONO (290°)  ·  Dhaulagiri II a 12 km',
}

PW, PH = 1152.0, 760.0          # página apaisada (pt)
IMG_H = PW * 9 / 16             # 648 pt
TINTA = Color(0.10, 0.11, 0.16)
PAPEL = Color(0.93, 0.91, 0.87)
TENUE = Color(0.62, 0.62, 0.66)
COTA = Color(0.86, 0.72, 0.52)


def jpeg(ruta, calidad, ancho=None):
    im = Image.open(ruta).convert('RGB')
    if ancho and im.width > ancho:
        im = im.resize((ancho, round(im.height * ancho / im.width)), Image.LANCZOS)
    b = io.BytesIO()
    im.save(b, 'JPEG', quality=calidad, optimize=True, progressive=True, subsampling=0 if calidad >= 92 else 2)
    b.seek(0)
    return b


def partir(c, texto, fuente, tam, ancho):
    palabras, lineas, cur = texto.split(), [], ''
    for w in palabras:
        t = (cur + ' ' + w).strip()
        if c.stringWidth(t, fuente, tam) > ancho and cur:
            lineas.append(cur); cur = w
        else:
            cur = t
    if cur:
        lineas.append(cur)
    return lineas


def construir(carpeta, salida, calidad=90, ancho=5120):
    c = canvas.Canvas(salida, pagesize=(PW, PH))
    c.setTitle('Dhaulagiri I · 8 167 m — seis láminas a pincel seco')
    c.setSubject('Ilustraciones del Dhaulagiri sobre el relieve real (Copernicus DEM GLO-30)')
    rutas = {k: os.path.join(carpeta, f'dh_{i:02d}_{k}.png') for i, k in enumerate(S.ORDEN, 1)}
    # portada: el macizo atenuado
    c.setFillColor(TINTA); c.rect(0, 0, PW, PH, fill=1, stroke=0)
    portada = rutas['poon_hill']
    if os.path.exists(portada):
        c.drawImage(ImageReader(jpeg(portada, 72, 1800)), 0, PH - IMG_H, PW, IMG_H)
        c.setFillColor(Color(0.06, 0.07, 0.12, alpha=0.58)); c.rect(0, 0, PW, PH, fill=1, stroke=0)
    c.setFillColor(PAPEL)
    c.setFont(F_SERIFB, 66); c.drawString(72, PH - 250, 'DHAULAGIRI I')
    c.setFont(F_SERIF, 26); c.drawString(76, PH - 292, '8 167 m  ·  Dhaulagiri Himal, Nepal')
    c.setFont(F_SANS, 14); c.setFillColor(Color(0.86, 0.84, 0.81))
    for i, l in enumerate(['Seis láminas de la montaña blanca y su macizo: de Poon Hill a la cumbre por la ruta normal',
                           '(arista noreste). Pincel seco sobre fondo oscuro. Relieve calculado sobre el modelo digital',
                           'de elevación Copernicus GLO-30 y la posición de cada campo situada sobre él.']):
        c.drawString(78, PH - 340 - i * 22, l)
    c.setFont(F_SANS, 11); c.setFillColor(TENUE)
    for i, k in enumerate(S.ORDEN):
        e = S.ESCENAS[k]
        c.drawString(78, 168 - i * 17, f'{i + 1:02d}   {e["titulo"]}  ·  {e["subtitulo"]}')
    c.setFont(F_SANS, 8); c.setFillColor(Color(0.5, 0.5, 0.55))
    c.drawString(78, 40, 'Relieve: Copernicus DEM GLO-30 y GLO-90 © DLR e.V. 2010-2014 y © Airbus Defence and Space '
                         'GmbH 2014-2018, provisto bajo COPERNICUS por la Unión Europea y la ESA.')
    c.showPage()
    for i, k in enumerate(S.ORDEN):
        ruta = rutas[k]
        if not os.path.exists(ruta):
            print('falta', ruta)
            continue
        e = S.ESCENAS[k]
        nombre, resto = e['titulo'], e['subtitulo']
        c.setFillColor(TINTA); c.rect(0, 0, PW, PH, fill=1, stroke=0)
        c.drawImage(ImageReader(jpeg(ruta, calidad, ancho)), 0, PH - IMG_H, PW, IMG_H)
        y = PH - IMG_H
        # columna izquierda (hasta x = 556): título, subtítulo y ficha; derecha (desde x = 596): el texto
        c.setFillColor(PAPEL); c.setFont(F_SERIFB, 22)
        c.drawString(36, y - 34, nombre)
        c.setFont(F_SERIF, 13); c.setFillColor(COTA)
        c.drawString(36, y - 54, resto)
        tf = 9.0
        while c.stringWidth(FICHA[k], F_SANS, tf) > 520 and tf > 7:
            tf -= 0.25
        c.setFont(F_SANS, tf); c.setFillColor(TENUE)
        c.drawString(36, y - 74, FICHA[k])
        c.setFont(F_SERIF, 10.5); c.setFillColor(Color(0.82, 0.81, 0.78))
        for j, l in enumerate(partir(c, e['texto'], F_SERIF, 10.5, 520)):
            c.drawString(PW - 36 - 520, y - 26 - j * 14.5, l)
        c.setFont(F_SANS, 9); c.setFillColor(TENUE)
        c.drawString(36, 14, f'Lámina {["I", "II", "III", "IV", "V", "VI"][i]}')
        c.drawRightString(PW - 36, 14, f'{i + 1} / {len(S.ORDEN)}')
        c.showPage()
    c.save()
    print('PDF:', salida, f'{os.path.getsize(salida) / 1e6:.1f} MB')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('carpeta')
    ap.add_argument('salida')
    ap.add_argument('--calidad', type=int, default=90)
    ap.add_argument('--ancho', type=int, default=5120)
    a = ap.parse_args()
    construir(a.carpeta, a.salida, a.calidad, a.ancho)
