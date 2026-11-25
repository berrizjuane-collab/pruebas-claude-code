import pymupdf as fitz, sys
src = sys.argv[1]; out = sys.argv[2]; pages = [int(p) for p in sys.argv[3].split(',')]
mode = sys.argv[4] if len(sys.argv)>4 else 'vec'   # vec: remove text+images ; art: remove text + border image only
for p in pages:
    doc = fitz.open(src)
    page = doc[p-1]
    if mode == 'vec':
        page.add_redact_annot(page.rect)
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_REMOVE, graphics=fitz.PDF_REDACT_LINE_ART_NONE, text=fitz.PDF_REDACT_TEXT_REMOVE)
        pix = page.get_pixmap(dpi=300, alpha=True)
    else:
        # remove text only; remove the 1836x2376 icon-border overlay image
        for info in page.get_image_info(xrefs=True):
            if info['width']==1836 and info['xref']:
                page.delete_image(info['xref'])
        page.add_redact_annot(page.rect)
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE, graphics=fitz.PDF_REDACT_LINE_ART_NONE, text=fitz.PDF_REDACT_TEXT_REMOVE)
        pix = page.get_pixmap(dpi=300, alpha=False)
    pix.save(f"{out}/p{p}_{mode}.png")
    print('ok', p, pix.width, pix.height)
