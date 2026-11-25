import json, sys, io, numpy as np
from PIL import Image
import pikepdf, pymupdf as fitz
S = sys.argv[1]; OUT=f"{S}/build/img"; RAW=f"{S}/assets/raw"
man = json.load(open(f"{OUT}/manifest.json"))
pdf = pikepdf.open(f"{S}/src/original.pdf")
def has_text(form, depth=0):
    try: ops = pikepdf.parse_content_stream(form)
    except Exception: return False
    if any(str(o) in ('Tj','TJ',"'",'"') for _, o in ops): return True
    sub = form.get('/Resources', {}).get('/XObject', {})
    return depth < 5 and any(v.get('/Subtype')=='/Form' and has_text(v, depth+1) for v in sub.values())
def bbox_alpha(im, thr=10, pad=10):
    a = np.array(im.getchannel('A')); ys, xs = np.where(a > thr)
    return (max(0,xs.min()-pad), max(0,ys.min()-pad), min(im.width,xs.max()+pad+1), min(im.height,ys.max()+pad+1))
def vec(pno, clip, name, dpi=400, skip=(), only=None):
    page = pdf.pages[pno-1]; xo = page.Resources.get('/XObject', {})
    ops = pikepdf.parse_content_stream(page); keep=[]; intext=False
    for operands, op in ops:
        o = str(op)
        if o=='BT': intext=True; continue
        if o=='ET': intext=False; continue
        if intext or o=='sh': continue
        if only and o not in ('Do','q','Q','cm','gs'): continue
        if o=='Do':
            k = str(operands[0]); v = xo.get(k)
            if v is None or v.get('/Subtype')!='/Form' or has_text(v) or k in skip or (only and k not in only): continue
        keep.append((operands, op))
    np_ = pikepdf.new(); np_.pages.append(pikepdf.Page(page.obj)); newp = np_.pages[0]
    newp.obj.Contents = np_.make_stream(pikepdf.unparse_content_stream(keep))
    b = io.BytesIO(); np_.save(b)
    d = fitz.open(stream=b.getvalue(), filetype='pdf')
    pix = d[0].get_pixmap(dpi=dpi, alpha=True, clip=fitz.Rect(*clip))
    im = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGBA'); im = im.crop(bbox_alpha(im))
    im.save(f"{OUT}/{name}", optimize=True)
    man[name] = dict(w=im.width, h=im.height, kind='ilustración vectorial original (render 400 ppp)', note='')
    print(name, im.size)
# p17 boat region (bottom); p36 ships+waves; p45 moon+chalices; p56 trident only
vec(17, (60, 470, 560, 790), 'II-3_bote.png', only=('/Fm8',))
vec(36, (0, 500, 612, 760), 'III-5_barcos.png')
vec(45, (120, 286, 492, 602), 'IV-3_calices.png')
vec(56, (440, 300, 560, 596), 'V-6_tridente.png')
def crop_dark(src, name, thr, kind, note):
    im = Image.open(src).convert('RGB'); a = np.array(im.convert('L'))
    ys, xs = np.where(a < thr)
    box = (max(0,xs.min()-6), max(0,ys.min()-6), min(im.width,xs.max()+7), min(im.height,ys.max()+7))
    im = im.crop(box); im.save(f"{OUT}/{name}", quality=92, subsampling=0)
    man[name] = dict(w=im.width, h=im.height, kind=kind, note=note); print(name, im.size, box)
crop_dark(f"{RAW}/x1496_base.png", 'I-2_duelo_herreria.jpg', 175, 'fotograma', 'se elimina el área crema vacía (viñeta horneada en el original)')
crop_dark(f"{RAW}/x1583_base.png", 'I-6_cueva.jpg', 185, 'fotograma tratado', 'se elimina el área crema vacía superior')
json.dump(man, open(f"{OUT}/manifest.json",'w'), indent=1, ensure_ascii=False)
