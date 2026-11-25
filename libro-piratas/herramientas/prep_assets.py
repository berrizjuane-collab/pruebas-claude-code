"""Prepara las imágenes finales del libro a partir de lo extraído del PDF original.
Reglas: nunca se deforma (solo escalado uniforme en la maqueta), recortes solo para
eliminar áreas vacías/fondos horneados, y se registra el tamaño en píxeles de cada pieza."""
import json, sys, os, io
import numpy as np, cv2
from PIL import Image, ImageChops
import pikepdf, pymupdf as fitz

S = sys.argv[1]            # scratchpad root
RAW = f"{S}/assets/raw"; ART = f"{S}/assets/art"; OUT = f"{S}/build/img"
SRC = f"{S}/src/original.pdf"
man = {}

def save(name, im, kind, note=""):
    path = f"{OUT}/{name}"
    if im.mode == 'RGBA' or name.endswith('.png'):
        im.save(path, optimize=True)
    else:
        im.convert('RGB').save(path, quality=92, subsampling=0)
    man[name] = dict(w=im.width, h=im.height, kind=kind, note=note)

def bbox_alpha(im, thr=10, pad=6):
    a = np.array(im.getchannel('A'))
    ys, xs = np.where(a > thr)
    return (max(0, xs.min()-pad), max(0, ys.min()-pad), min(im.width, xs.max()+pad+1), min(im.height, ys.max()+pad+1))

def bbox_nonbg(im, bg, tol=18, pad=4):
    a = np.array(im.convert('RGB')).astype(int)
    d = np.abs(a - np.array(bg)).sum(axis=2)
    ys, xs = np.where(d > tol)
    return (max(0, xs.min()-pad), max(0, ys.min()-pad), min(im.width, xs.max()+pad+1), min(im.height, ys.max()+pad+1))

def cut(name):  # cutout with soft mask, trimmed to content
    im = Image.open(f"{RAW}/{name}_alpha.png").convert('RGBA')
    return im.crop(bbox_alpha(im))

# ---------- Fotogramas / ilustraciones raster ----------
save('I-1_barco_niebla.png', cut('x2497'), 'recorte (silueta)')
im = Image.open(f"{RAW}/x1496_base.png").convert('RGB')
save('I-2_duelo_herreria.jpg', im.crop(bbox_nonbg(im, im.getpixel((5,5)), tol=40)), 'fotograma', 'se elimina el área crema vacía superior')
save('I-3_perla_noche.png', cut('x1514'), 'ilustración')
save('I-4_cofre.png', cut('x2584'), 'recorte (silueta)')
im = Image.open(f"{RAW}/x1567_base.png").convert('RGB')
save('I-5_isla_desierta.jpg', im.crop(bbox_nonbg(im, im.getpixel((5,5)), tol=30)), 'ilustración', 'se elimina el margen crema vacío')
im = Image.open(f"{RAW}/x1583_base.png").convert('RGB')
save('I-6_cueva.jpg', im.crop(bbox_nonbg(im, im.getpixel((450,5)), tol=40)), 'fotograma tratado', 'se elimina el área crema vacía superior')
save('II-1_will_elizabeth.png', cut('x2526'), 'recorte (silueta)')
save('II-2_perla_negra.jpg', Image.open(f"{RAW}/x2067_base.png").convert('RGB'), 'ilustración (fondo blanco, multiplicar)')
save('II-4_holandes.png', cut('x2537'), 'ilustración')
save('II-5_isla_cruz.jpg', Image.open(f"{RAW}/x1752_base.png").convert('RGB'), 'fotograma')
save('II-6_kraken_grabado.png', cut('x1755'), 'grabado')
save('III-1_banco_arena.jpg', Image.open(f"{RAW}/x1809_base.png").convert('RGB'), 'fotograma')
save('III-2_carta_navegacion.jpg', Image.open(f"{RAW}/x2576_base.png").convert('RGB'), 'acuarela')
save('III-3_jack_corre.png', cut('x2587'), 'recorte (silueta)')
save('III-4_hermandad.jpg', Image.open(f"{RAW}/x1843_base.png").convert('RGB'), 'ilustración de aficionado (firmada)')
save('IV-1_barbossa.png', cut('x2610'), 'recorte (silueta)')
# Jack + Angélica: la imagen se colocó girada -90° en el original; se restituye su orientación
im = Image.open(f"{RAW}/x2634_alpha.png").convert('RGBA').rotate(90, expand=True)
save('IV-2_jack_angelica.png', im.crop(bbox_alpha(im)), 'ilustración', 'orientación restituida (estaba girada y estirada)')
save('IV-5_velero_acuarela.png', cut('x1754'), 'acuarela (silueta)')
save('IV-6_perla_botella.jpg', Image.open(f"{RAW}/x1600_base.png").convert('RGB'), 'ilustración (fondo blanco, multiplicar)')
save('V-1_galeon.jpg', Image.open(f"{RAW}/x2727_base.png").convert('RGB'), 'ilustración (fondo blanco, multiplicar)')
save('V-3_olas.png', cut('x2496'), 'ilustración')
save('V-4_mono.png', cut('x2617'), 'recorte (silueta)')
save('V-5_isla.jpg', Image.open(f"{RAW}/x2717_base.png").convert('RGB'), 'ilustración (fondo blanco, multiplicar)')

# ---------- Láminas de "Escena clave" ----------
def lam(src, name, edge=0.012):
    im = Image.open(src).convert('RGB')
    w, h = im.size; dx = int(w*edge); dy = int(h*edge)
    save(name, im.crop((dx, dy, w-dx, h-dy)), 'lámina', 'se retiran 1,2 % de borde con artefactos de la exportación')
lam(f"{ART}/art_p12.png", 'K-I.jpg'); lam(f"{ART}/art_p45.png", 'K-IV.jpg'); lam(f"{ART}/art_p56.png", 'K-V.jpg')
lam(f"{RAW}/x1669_base.png", 'K-II.jpg', 0.0)
# III: borrar el texto incrustado (etiqueta, cita y pie) con inpainting sobre el cielo
im = cv2.imread(f"{RAW}/x1835_base.png")
g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
bg = cv2.medianBlur(g, 21)
mask = np.zeros_like(g)
for y0, y1 in [(140, 180), (228, 432), (1098, 1132)]:
    band = (g[y0:y1].astype(int) - bg[y0:y1].astype(int)) > 22
    mask[y0:y1][band] = 255
mask = cv2.dilate(mask, np.ones((5,5), np.uint8), iterations=2)
clean = cv2.inpaint(im, mask, 9, cv2.INPAINT_TELEA)
cv2.imwrite(f"{S}/assets/x1835_clean.png", clean)
lam(f"{S}/assets/x1835_clean.png", 'K-III.jpg', 0.0)

# ---------- Ilustraciones vectoriales del original (render 400 dpi, fondo transparente) ----------
pdf = pikepdf.open(SRC)
def render_forms(pno, forms, name, dpi=400, strip_main=False, clip=None):
    page = pdf.pages[pno-1]
    np_ = pikepdf.new(); np_.pages.append(pikepdf.Page(page.obj)); newp = np_.pages[0]
    if strip_main:
        ops = pikepdf.parse_content_stream(page); keep=[]; intext=False
        for operands, op in ops:
            o = str(op)
            if o=='BT': intext=True; continue
            if o=='ET': intext=False; continue
            if intext or o in ('sh','Do'): continue
            keep.append((operands, op))
        content = pikepdf.unparse_content_stream(keep)
    else:
        content = " ".join(f"q {f} Do Q" for f in forms).encode()
    newp.obj.Contents = np_.make_stream(content)
    b = io.BytesIO(); np_.save(b)
    d = fitz.open(stream=b.getvalue(), filetype='pdf')
    pix = d[0].get_pixmap(dpi=dpi, alpha=True, clip=clip)
    im = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGBA')
    im = im.crop(bbox_alpha(im, pad=10))
    save(name, im, 'ilustración vectorial original (render 400 ppp)')
render_forms(17, ['/Fm6'], 'II-3_bote.png')
render_forms(36, ['/Fm4', '/Fm5'], 'III-5_barcos.png')
render_forms(37, ['/Fm5'], 'III-6_duelo.png')
render_forms(45, ['/Fm36', '/Fm37', '/Fm39'], 'IV-3_calices.png')
render_forms(46, [], 'IV-4_sirena.png', strip_main=True, clip=fitz.Rect(0, 160, 330, 720))
render_forms(3, [], 'V-2_rosa_vientos.png', strip_main=True, clip=fitz.Rect(150, 100, 460, 330))
render_forms(56, ['/Fm35', '/Fm37'], 'V-6_tridente.png')

# ---------- Arte de cubierta / frontis ----------
save('art_cubierta.jpg', Image.open(f"{ART}/art_p1.png").convert('RGB'), 'arte vectorial original (render 300 ppp)')
save('art_contracubierta.jpg', Image.open(f"{ART}/art_p64.png").convert('RGB'), 'arte vectorial original (render 300 ppp)')
json.dump(man, open(f"{OUT}/manifest.json", 'w'), indent=1, ensure_ascii=False)
for k, v in man.items(): print(f"{k:32s} {v['w']:5d}x{v['h']:<5d} {v['kind']}")
