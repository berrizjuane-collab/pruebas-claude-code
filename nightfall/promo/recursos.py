"""
Recursos del vídeo promocional, sacados del PDF de la revista a su resolución original.

    python3 -I nightfall/promo/recursos.py <Revista_NIGHTFALL.pdf> <fuentes_web> [salida]

<fuentes_web> es la carpeta con cabinet-black.woff2, montserrat-latin.woff2 y anton-sub.woff2
(las mismas que lleva incrustadas nightfall/index.html). Requiere PyMuPDF y Pillow.
"""
import io, os, sys, json, shutil
import pymupdf as fitz
from PIL import Image, ImageOps, ImageChops, ImageFilter

pdf, fuentes = sys.argv[1], sys.argv[2]
out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'recursos')
os.makedirs(out, exist_ok=True)
doc = fitz.open(pdf)
cache = {}

def img(xref):
    """Imagen del PDF con su máscara de transparencia (si la tiene), como RGBA."""
    if xref in cache: return cache[xref].copy()
    base = fitz.Pixmap(doc, xref)
    smask = doc.xref_get_key(xref, 'SMask')
    if base.alpha: base = fitz.Pixmap(base, 0)
    if base.colorspace and base.colorspace.n not in (1, 3): base = fitz.Pixmap(fitz.csRGB, base)
    if smask[0] == 'xref':
        base = fitz.Pixmap(base, fitz.Pixmap(doc, int(smask[1].split()[0])))
    im = Image.open(io.BytesIO(base.tobytes('png'))).convert('RGBA')
    cache[xref] = im
    return im.copy()

def recortar(im, pad=2):
    bb = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    if not bb: return im
    l, t, r, b = bb
    return im.crop((max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad)))

catalogo = {}
def guardar(nombre, im, q=86, sin_perdida=False):
    ruta = os.path.join(out, nombre + '.webp')
    kw = dict(lossless=True, quality=100, method=6) if sin_perdida else dict(quality=q, method=6, alpha_quality=90)
    im.save(ruta, 'WEBP', **kw)
    catalogo[nombre] = [im.width, im.height]

def gris(im, recorte=None, rot=0):
    """Fuente para semitono: luminancia en gris, conservando el alfa de los recortes."""
    if rot: im = im.rotate(rot, expand=True)
    if recorte:
        w, h = im.size
        im = im.crop((int(recorte[0] * w), int(recorte[1] * h), int(recorte[2] * w), int(recorte[3] * h)))
    g = ImageOps.grayscale(im.convert('RGB'))
    return Image.merge('RGBA', (g, g, g, im.getchannel('A')))

# --- stickers de papel recortado y piezas sueltas
STICKERS = dict(S=2158, clip=2177, rayos=2178, estrellas=2402, chispa=2393, chispa3=2547, exclam=2394,
                megafono=2397, pregunta=2520, chincheta=2530, flecha_curva=2521, flecha=2555, estallido_rayos=2535,
                flechas=2536, carita=2549, avion=2561, estallido=2565, espirales=2693, estrella_linea=2723,
                zigzag=2503, nube=2459, rayos_bolt=2462, exclam_doble=2456, rayos_blancos=2385, estrella_rosa=2589)
for n, x in STICKERS.items(): guardar('s_' + n, recortar(img(x)), q=88)
guardar('pincel_violeta', recortar(img(2680)), q=88)
guardar('tiza_blanca', recortar(img(2384)), q=90)
guardar('papel_roto', recortar(img(2164)), q=90)
pap = img(2156); fondo = Image.new('RGBA', pap.size, (0, 0, 0, 255)); fondo.alpha_composite(pap)
guardar('papel', ImageOps.grayscale(fondo.convert('RGB')).convert('RGB').resize((1024, 1024), Image.LANCZOS), q=70)

# --- logos de los locales: máscaras blancas (el alfa pondera la luminancia)
LOGOS = dict(zoe=2441, kabal=2419, monaco=2440, quinta=2439, blu=2438, velvet=2421, achant=2420, kabal_latino=2442)
for n, x in LOGOS.items():
    im = recortar(img(x), 1)
    a = ImageChops.multiply(im.getchannel('A'), ImageOps.grayscale(im.convert('RGB')).point(lambda v: min(255, int(v * 1.25))))
    blanco = Image.new('L', im.size, 255)
    guardar('logo_' + n, Image.merge('RGBA', (blanco, blanco, blanco, a)), sin_perdida=True)

# --- recortes de personas (con su borde blanco de sticker)
guardar('dj_victori', recortar(img(2681)), q=90)
guardar('dj_portada', recortar(img(2175)), q=90)
guardar('pinta_recorte', recortar(img(2915)), q=90)
guardar('vinilo', recortar(img(2790)), q=90)
guardar('kabal_fachada', recortar(img(2608)), q=88)

# --- fuentes de semitono (gris; se tramean en el compositor)
SEMITONO = dict(portada_pareja=(2160, None, 0), multitud_beat=(2401, None, 0), multitud_contra=(2841, None, 0),
                manos_arriba=(2674, None, 0), dj_cabina=(2931, None, 0), amigas_monaco=(2617, (0, .085, 1, .925), 0),
                achante=(2657, None, 0), multitud_violeta=(2796, None, 0), zoe_laser=(2534, (0, .05, 1, .95), 90),
                gafas=(2870, None, 0), luces_escenario=(2906, None, 0), chica_pinta=(2719, None, 0))
for n, (x, rc, rot) in SEMITONO.items():
    g = gris(img(x), rc, rot)
    if g.getchannel('A').getextrema()[0] < 250: g = recortar(g)
    guardar('ht_' + n, g, q=88)

# --- fotos a color (polaroids con su marco, calle y locales)
POL = [2871, 2872, 2873, 2874, 2875, 2876, 2892, 2893, 2895, 2896, 2897, 2898, 2899, 2932, 2933, 2934, 2935, 2936, 2937]
for i, x in enumerate(POL): guardar(f'polaroid_{i:02d}', recortar(img(x)), q=84)
FOTOS = dict(quinta_cupula=2627, blu_laser=2637, velvet_escenario=2641, modo_verde=2597, zoe_dj=2579,
             pinta_1=2911, pinta_2=2912, pinta_3=2913, pinta_4=2720, pinta_5=2919, gafas=2870)
for n, x in FOTOS.items(): guardar('foto_' + n, img(x).convert('RGB'), q=84)

# --- mapa neón del pliego central (págs. 3-4) en dos capas: vías rosas y calles ácidas
PW, PH, SC = 595.5, 842.25, 1.55
lienzo = Image.new('RGBA', (int(2 * PW * SC), int(PH * SC)), (0, 0, 0, 0))
for x, bb, off in ((2428, [0.2878, 0.2125, 0.9996, 0.7622], 0), (2450, [0.0, 0.2376, 0.7119, 0.8629], 1)):
    im = img(x).resize((round((bb[2] - bb[0]) * PW * SC), round((bb[3] - bb[1]) * PH * SC)), Image.LANCZOS)
    lienzo.alpha_composite(im, (round((bb[0] + off) * PW * SC), round(bb[1] * PH * SC)))
caja = lienzo.getbbox(); lienzo = lienzo.crop(caja)
import colorsys
vias = Image.new('RGBA', lienzo.size); calles = Image.new('RGBA', lienzo.size)
src, pv, pc = lienzo.load(), vias.load(), calles.load()
for yy in range(lienzo.height):
    for xx in range(lienzo.width):
        r, g, b, a = src[xx, yy]
        if a < 6: continue
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255); hd = h * 360
        if 225 <= hd <= 295 and s > .3 and v > .15: continue      # líneas guía violetas impresas: fuera
        (pc if (38 <= hd <= 125 and s > .28) else pv)[xx, yy] = (r, g, b, a)
guardar('mapa_vias', vias, q=82); guardar('mapa_calles', calles, q=82)
catalogo['mapa_caja_pliego'] = [round(caja[0] / (PW * SC), 4), round(caja[1] / (PH * SC), 4), round(caja[2] / (PW * SC), 4), round(caja[3] / (PH * SC), 4)]

for f in ('cabinet-black.woff2', 'montserrat-latin.woff2', 'anton-sub.woff2'):
    shutil.copy(os.path.join(fuentes, f), os.path.join(out, f))
json.dump(catalogo, open(os.path.join(out, 'catalogo.json'), 'w'), indent=1, sort_keys=True)
total = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out))
print(f'{len(catalogo)} recursos · {total / 1024 / 1024:.2f} MB en {out}')
