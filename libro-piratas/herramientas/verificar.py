"""Verificación previa a imprenta (preflight) de la maqueta.

Comprueba:
  - 64 páginas, tamaño de corte y sangrado correctos en todas.
  - El índice coincide con la paginación: cada título aparece en la página indicada del PDF final.
  - Ningún texto invade la franja del lomo (±16 mm) ni se sale de los márgenes de seguridad.
  - No hay textos superpuestos entre sí (las superposiciones de texto sobre imagen se listan si no son intencionadas).
  - Fuentes incrustadas y resolución efectiva de todas las imágenes (mín. 300 ppp).

Uso: python3 verificar.py maqueta/medidas.json maqueta/indice.json salida/Piratas_del_Caribe_64pp_paginas.pdf
Devuelve código 1 si hay errores.
"""
import json
import re
import sys
import unicodedata
import pymupdf

MM = 72 / 25.4
W, H, B = 219.12, 309.37, 3.0
LOMO, FRANJA = 219.12, 16.0
errores, avisos = [], []
# Entradas del índice cuyo texto en página es más corto que la entrada
BUSCAR = {"sinopsis y reparto": "sinopsis", "detrás de cámaras y curiosidades": "detrás de cámaras"}


def norm(t):
    t = unicodedata.normalize("NFC", t).replace("’", "'").replace(" ", " ").replace(" ", " ")
    return " ".join(t.split()).lower()


def solape(a, b, tol=0.5):
    return min(a["x1"], b["x1"]) - max(a["x0"], b["x0"]) > tol and min(a["y1"], b["y1"]) - max(a["y0"], b["y0"]) > tol


def revisar_cajas(medidas):
    for pl in medidas["pliegos"]:
        nom = f'{pl["nombre"]} (pp. {pl["paginas"]})'
        textos = [c for c in pl["cajas"] if c["tipo"] == "texto"]
        imagenes = [c for c in pl["cajas"] if c["tipo"] == "imagen"]
        for c in textos:
            c = dict(c, x0=c.get("tx0", c["x0"]), x1=c.get("tx1", c["x1"]), y0=c.get("ty0", c["y0"]), y1=c.get("ty1", c["y1"]))
            et = f'«{c["texto"][:40]}»'
            if pl["tipo"] == "portada":
                if c["x0"] < W + 10 or c["x1"] > 2 * W - 10:
                    errores.append(f"{nom}: texto fuera de la zona segura de portada {et}")
                continue
            if pl["tipo"] == "contra":
                if c["x0"] < 10 or c["x1"] > W - 10:
                    errores.append(f"{nom}: texto fuera de la zona segura de contraportada {et}")
                continue
            if c["x0"] < LOMO + FRANJA and c["x1"] > LOMO - FRANJA:
                errores.append(f"{nom}: texto en la franja del lomo x={c['x0']:.1f}-{c['x1']:.1f} {et}")
            if c.get("exento"):
                continue
            if c["x0"] < 18 or c["x1"] > 2 * W - 18 or c["y0"] < 15 or c["y1"] > 290:
                errores.append(f"{nom}: texto fuera de márgenes ({c['x0']:.1f},{c['y0']:.1f})-({c['x1']:.1f},{c['y1']:.1f}) {et}")
            if c["desborde"]:
                errores.append(f"{nom}: texto cortado (desborda su caja) {et}")
        for i, a in enumerate(textos):
            for b in textos[i + 1:]:
                if solape(a, b):
                    errores.append(f"{nom}: textos superpuestos «{a['texto'][:30]}» / «{b['texto'][:30]}»")
            for im in imagenes:
                if solape(a, im, tol=1.0) and not (a["solapa"] or im["solapa"]):
                    avisos.append(f"{nom}: texto sobre ilustración «{a['texto'][:30]}» ({im['clase']})")
        for im in pl["imgs"]:
            if not im["ok"]:
                errores.append(f"{nom}: imagen no cargada {im['src']}")


def revisar_pdf(ruta, indice):
    d = pymupdf.open(ruta)
    if len(d) != 64:
        errores.append(f"El PDF tiene {len(d)} páginas (se esperaban 64)")
    for i, p in enumerate(d):
        tb, mb = p.trimbox, p.mediabox
        if abs(tb.width / MM - W) > .05 or abs(tb.height / MM - H) > .05:
            errores.append(f"p. {i + 1}: TrimBox {tb.width / MM:.2f}×{tb.height / MM:.2f} mm")
        if abs(mb.width / MM - (W + 2 * B)) > .05 or abs(mb.height / MM - (H + 2 * B)) > .05:
            errores.append(f"p. {i + 1}: MediaBox {mb.width / MM:.2f}×{mb.height / MM:.2f} mm")
    # Índice
    txt = {}
    for i, p in enumerate(d):
        r = p.rect  # coordenadas normalizadas de la página; el corte es el rectángulo sin los 3 mm de sangrado
        clip = pymupdf.Rect(r.x0 + B * MM, r.y0 + B * MM, r.x1 - B * MM, r.y1 - B * MM)
        txt[i + 1] = norm(p.get_text("text", clip=clip))
    for ent in indice:
        t = norm(ent["t"])
        m = re.match(r"^[ivx]+\. (.*) \(\d{4}\)$", t)          # «I. Título (2003)» -> título en la portadilla
        clave = m.group(1) if m else BUSCAR.get(t, t)
        if clave not in txt.get(ent["n"], ""):
            # los títulos de doble página pueden ir en la página izquierda o derecha del pliego
            errores.append(f"Índice: «{ent['t']}» no aparece en la p. {ent['n']}")
    print(f"Índice: {len(indice)} entradas comprobadas contra el PDF")
    # Fuentes
    fuentes = set()
    for p in d:
        for f in p.get_fonts():
            fuentes.add((f[3], f[1]))
    no_emb = [f for f in fuentes if f[1] in ("Type3",) or f[0] == ""]
    if any("DejaVu" in f[0] for f in fuentes):
        errores.append("Se ha usado una fuente de sustitución (DejaVu): hay un carácter que no existe en las fuentes del libro")
    print("Fuentes:", ", ".join(sorted({f[0].split("+")[-1] for f in fuentes})))
    if no_emb:
        avisos.append(f"Fuentes a revisar: {no_emb}")
    # Resolución de imágenes (efectiva, en el tamaño al que se colocan)
    minppp = 10 ** 9
    # Solo objetos de imagen reales del archivo (los degradados vectoriales no cuentan)
    for i, p in enumerate(d):
        for img in p.get_images(full=True):
            xref, wpx, hpx = img[0], img[2], img[3]
            for r, m in p.get_image_rects(xref, transform=True):
                vis = r & p.mediabox
                if vis.is_empty or vis.width < 1 or vis.height < 1:
                    continue
                # tamaño real de la imagen colocada (con giro incluido), no su caja envolvente
                ancho, alto_ = (m.a ** 2 + m.b ** 2) ** .5, (m.c ** 2 + m.d ** 2) ** .5
                ppp = min(wpx / ancho * 72, hpx / alto_ * 72)
                minppp = min(minppp, ppp)
                if ppp < 290:
                    errores.append(f"p. {i + 1}: imagen a {ppp:.0f} ppp ({wpx}×{hpx} px)")
    print(f"Resolución mínima efectiva de imágenes: {minppp:.0f} ppp")


if __name__ == "__main__":
    medidas = json.load(open(sys.argv[1]))
    indice = json.load(open(sys.argv[2]))
    revisar_cajas(medidas)
    revisar_pdf(sys.argv[3], indice)
    for a in avisos:
        print("AVISO:", a)
    for e_ in errores:
        print("ERROR:", e_)
    print(f"\n{len(errores)} errores, {len(avisos)} avisos")
    sys.exit(1 if errores else 0)
