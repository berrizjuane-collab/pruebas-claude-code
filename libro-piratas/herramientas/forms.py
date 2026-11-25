import pikepdf, pymupdf as fitz, sys, io
from PIL import Image
src = sys.argv[1]; out = sys.argv[2]; pages = [int(p) for p in sys.argv[3].split(',')]
pdf = pikepdf.open(src)
def render_pdf_bytes(b, dpi=300):
    d = fitz.open(stream=b, filetype='pdf')
    pix = d[0].get_pixmap(dpi=dpi, alpha=True)
    im = Image.open(io.BytesIO(pix.tobytes('png')))
    return im
def autocrop(im, pad=8):
    bb = im.getchannel('A').point(lambda a: 255 if a>8 else 0).getbbox()
    if not bb: return None
    x0,y0,x1,y1 = bb
    return im.crop((max(0,x0-pad),max(0,y0-pad),min(im.width,x1+pad),min(im.height,y1+pad)))
for p in pages:
    page = pdf.pages[p-1]
    xo = page.Resources.get('/XObject', {})
    forms = [k for k,v in xo.items() if v.get('/Subtype')=='/Form']
    # 1) each form alone
    for f in forms:
        np = pikepdf.new()
        np.pages.append(pikepdf.Page(page.obj))  # copy page
        newp = np.pages[0]
        newp.obj.Contents = np.make_stream(f"q {f} Do Q".encode())
        b = io.BytesIO(); np.save(b)
        im = autocrop(render_pdf_bytes(b.getvalue()))
        if im: im.save(f"{out}/p{p}_{f[1:]}.png"); print(p, f, im.size)
    # 2) stripped main content (paths only)
    ops = pikepdf.parse_content_stream(page)
    keep = []; intext = False
    for operands, op in ops:
        o = str(op)
        if o == 'BT': intext = True; continue
        if o == 'ET': intext = False; continue
        if intext: continue
        if o in ('sh', 'Do', 'INLINE IMAGE', 'BI', 'ID', 'EI'): continue
        keep.append((operands, op))
    np = pikepdf.new(); np.pages.append(pikepdf.Page(page.obj)); newp = np.pages[0]
    newp.obj.Contents = np.make_stream(pikepdf.unparse_content_stream(keep))
    b = io.BytesIO(); np.save(b)
    im = autocrop(render_pdf_bytes(b.getvalue()))
    if im: im.save(f"{out}/p{p}_main.png"); print(p, 'main', im.size)
