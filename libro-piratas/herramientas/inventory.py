import fitz, json, sys, os
src, out = sys.argv[1], sys.argv[2]
doc = fitz.open(src)
inv = []
seen = {}
for pno in range(len(doc)):
    page = doc[pno]
    for info in page.get_image_info(xrefs=True):
        xref = info['xref']
        if xref == 0: continue
        w, h = info['width'], info['height']
        bbox = fitz.Rect(info['bbox'])
        # visible part (clipped to page)
        vis = bbox & page.rect
        sx = bbox.width / w * 72 if w else 0  # pt per px... we want ppi
        ppi_x = w / (bbox.width/72) if bbox.width else 0
        ppi_y = h / (bbox.height/72) if bbox.height else 0
        rec = dict(page=pno+1, xref=xref, w=w, h=h,
                   bbox=[round(v,1) for v in bbox], visible=[round(v,1) for v in vis],
                   ppi_x=round(ppi_x,1), ppi_y=round(ppi_y,1),
                   distort=round((ppi_x/ppi_y) if ppi_y else 0,3),
                   offpage=not page.rect.contains(bbox))
        inv.append(rec)
        if xref not in seen:
            seen[xref] = 1
            base = doc.extract_image(xref)
            smask = base.get('smask', 0)
            pix = fitz.Pixmap(doc, xref)
            if pix.n - pix.alpha >= 4:
                pix = fitz.Pixmap(fitz.csRGB, pix)
            pix.save(f"{out}/x{xref}_base.png")
            if smask:
                m = fitz.Pixmap(doc, smask)
                try:
                    rgba = fitz.Pixmap(pix, m)
                    rgba.save(f"{out}/x{xref}_alpha.png")
                except Exception as e:
                    print('mask fail', xref, e)
            rec['smask'] = smask
json.dump(inv, open(f"{out}/inventory.json","w"), indent=1)
for r in inv:
    if r['w']==918 or (r['w']==1836): continue
    print(r['page'], r['xref'], f"{r['w']}x{r['h']}", 'ppi', r['ppi_x'], r['ppi_y'], 'dist', r['distort'], 'off' if r['offpage'] else '', r['bbox'])
