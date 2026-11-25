# Render a page with text removed, the icon-border overlay removed and the tiny icon forms removed.
import pikepdf, pymupdf as fitz, sys, io
src, out = sys.argv[1], sys.argv[2]
pages = [int(p) for p in sys.argv[3].split(',')]
dpi = int(sys.argv[4]) if len(sys.argv)>4 else 300
pdf = pikepdf.open(src)
def has_text(form, depth=0):
    try:
        ops = pikepdf.parse_content_stream(form)
    except Exception: return False
    if any(str(o) in ('Tj','TJ',"'",'"') for _, o in ops): return True
    sub = form.get('/Resources', {}).get('/XObject', {})
    return any(v.get('/Subtype')=='/Form' and has_text(v, depth+1) for v in sub.values()) if depth < 5 else False
for p in pages:
    page = pdf.pages[p-1]
    xo = page.Resources.get('/XObject', {})
    drop = set()
    for k, v in xo.items():
        st = v.get('/Subtype')
        if st == '/Image' and int(v.get('/Width',0)) == 1836: drop.add(k)   # icon border overlay
        if st == '/Form':
            bb = [float(x) for x in v.BBox]
            w = abs(bb[2]-bb[0]); h = abs(bb[3]-bb[1])
            if w < 12 and h < 12: drop.add(k)   # tiny border icons
            # text-only forms: detect BT in their stream
            if has_text(v): drop.add(k)
            try:
                data = b''
                if b'BT' in data and b' re' not in data[:0]:
                    ops = pikepdf.parse_content_stream(v)
                    kinds = set(str(o) for _, o in ops)
                    if kinds & {'Tj','TJ',"'",'"'}: drop.add(k)
            except Exception as e: pass
    ops = pikepdf.parse_content_stream(page)
    keep = []; intext=False
    for operands, op in ops:
        o = str(op)
        if o == 'BT': intext=True; continue
        if o == 'ET': intext=False; continue
        if intext: continue
        if o == 'Do' and str(operands[0]) in drop: continue
        keep.append((operands, op))
    np_ = pikepdf.new(); np_.pages.append(pikepdf.Page(page.obj)); newp = np_.pages[0]
    newp.obj.Contents = np_.make_stream(pikepdf.unparse_content_stream(keep))
    b = io.BytesIO(); np_.save(b)
    d = fitz.open(stream=b.getvalue(), filetype='pdf')
    pix = d[0].get_pixmap(dpi=dpi, alpha=False)
    pix.save(f"{out}/art_p{p}.png"); print('art', p, pix.width, pix.height, 'dropped', len(drop))
