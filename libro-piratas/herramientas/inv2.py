import pymupdf as fitz, math, json, sys
doc = fitz.open(sys.argv[1])
rows=[]
for pno in range(len(doc)):
    page = doc[pno]
    for info in page.get_image_info(xrefs=True):
        x = info['xref']; w,h = info['width'], info['height']
        if w in (918,1836): continue
        a,b,c,d,e,f = info['transform']
        sx = math.hypot(a,b); sy = math.hypot(c,d)
        rot = round(math.degrees(math.atan2(b,a)))
        ppx = w/(sx/72); ppy = h/(sy/72)
        rows.append((pno+1,x,w,h,round(ppx),round(ppy),round(ppx/ppy,3),rot, round(sx/72*25.4), round(sy/72*25.4)))
        print(pno+1, x, f"{w}x{h}", "ppi", round(ppx), round(ppy), "ratio", round(ppx/ppy,3), "rot", rot, "size_mm", round(sx/72*25.4), round(sy/72*25.4))
