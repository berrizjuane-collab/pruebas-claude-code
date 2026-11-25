# -*- coding: utf-8 -*-
"""Cubierta extendida (tapa dura) y guardas.

Cálculo del lomo (valores orientativos: confirmar con la imprenta):
  tripa: 72 págs = 36 hojas × 0,135 mm (estucado mate 150 g/m²)  ≈ 4,9 mm
  guardas: 2 pliegos de offset 140 g/m² (4 hojas × 0,17 mm)        ≈ 0,7 mm
  cartones: 2 × 2,5 mm                                              = 5,0 mm
  holgura                                                           ≈ 0,4 mm
  LOMO ≈ 11 mm
Tapas = formato al corte + 3 mm de ceja en cabeza, pie y corte → 218,9 × 285,4 mm.
Cajo (bisagra) 7 mm a cada lado del lomo; vuelta de 15 mm alrededor.
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import build as B

HERE = os.path.dirname(os.path.abspath(__file__))
LEAVES = B.TOTAL // 2
SPINE = round(LEAVES * 0.135 + 4 * 0.17 + 2 * 2.5 + 0.4, 1)
BOARD_W, BOARD_H = B.TRIM_W + 3, B.TRIM_H + 6
HINGE, WRAP = 7.0, 15.0
W = 2 * (WRAP + BOARD_W + HINGE) + SPINE
H = 2 * WRAP + BOARD_H
X_BACK = WRAP; X_SPINE = WRAP + BOARD_W + HINGE; X_FRONT = X_SPINE + SPINE + HINGE

FONTS = ''.join(f'<link rel="stylesheet" href="node_modules/@fontsource/{p}">' for p in [
    'libre-caslon-text/400.css', 'libre-caslon-text/400-italic.css', 'libre-caslon-display/400.css', 'source-sans-3/600.css'])

def panel_img(src, x, w):
    # el arte cubre tapa + vuelta + medio cajo; escalado uniforme (cover), sin deformar
    return f'<img src="img/{src}" style="position:absolute;left:{x}mm;top:0;width:{w}mm;height:{H}mm;object-fit:cover">'

def cover_page(guides=False):
    gold = '#C9A45C'
    art = (panel_img('art_contracubierta.jpg', 0, WRAP + BOARD_W + HINGE / 2)
           + panel_img('art_cubierta.jpg', X_FRONT - HINGE / 2, BOARD_W + WRAP + HINGE / 2))
    spine = (f'<div style="position:absolute;left:{X_SPINE - HINGE}mm;top:0;width:{SPINE + 2 * HINGE}mm;height:{H}mm;background:#0F2033"></div>'
             f'<div style="position:absolute;left:{X_SPINE}mm;top:{WRAP}mm;width:{SPINE}mm;height:{BOARD_H}mm;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:14mm 0 12mm">'
             f'{B.svg_compass(gold, 8, ring=False)}'
             f'<div style="writing-mode:vertical-rl;transform:rotate(180deg);font:400 13pt/1 \'Libre Caslon Display\',serif;letter-spacing:.22em;color:{gold};white-space:nowrap">PIRATAS DEL CARIBE</div>'
             f'<div style="writing-mode:vertical-rl;transform:rotate(180deg);font:italic 400 8.5pt/1 \'Libre Caslon Text\',serif;color:#E9DFCB;white-space:nowrap">Las cinco travesías</div></div>')
    # marco dorado interior a 10 mm del borde de la tapa (zona segura)
    def frame(x):
        return (f'<div style="position:absolute;left:{x + 10}mm;top:{WRAP + 10}mm;width:{BOARD_W - 20}mm;height:{BOARD_H - 20}mm;border:.8pt solid {gold};opacity:.85"></div>'
                f'<div style="position:absolute;left:{x + 12}mm;top:{WRAP + 12}mm;width:{BOARD_W - 24}mm;height:{BOARD_H - 24}mm;border:.4pt solid {gold};opacity:.6"></div>')
    front = (frame(X_FRONT)
             + f'<div style="position:absolute;left:{X_FRONT}mm;top:{H * 0.335}mm;width:{BOARD_W}mm;text-align:center">'
               f'<div style="font:600 9pt/1 \'Source Sans 3\';letter-spacing:.42em;color:{gold};text-shadow:0 0 3mm #0F2033">LA SAGA COMPLETA</div>'
               f'<div style="font:400 64pt/1 \'Libre Caslon Display\',serif;letter-spacing:.06em;color:{gold};margin-top:7mm">PIRATAS</div>'
               f'<div style="font:400 40pt/1 \'Libre Caslon Display\',serif;letter-spacing:.12em;color:#F3EBDD;margin-top:3mm">DEL CARIBE</div>'
               f'<div style="width:60mm;border-top:.9pt solid {gold};margin:6mm auto 4.5mm"></div>'
               f'<div style="font:italic 400 15pt/1 \'Libre Caslon Text\',serif;color:#F3EBDD">Las cinco travesías</div></div>'
             + f'<div style="position:absolute;left:{X_FRONT}mm;top:{WRAP + BOARD_H - 26}mm;width:{BOARD_W}mm;text-align:center;font:italic 400 9.5pt/1 \'Libre Caslon Text\',serif;color:#D9CFBE">Crónica ilustrada · Edición no oficial de aficionados</div>')
    back = (frame(X_BACK)
            + f'<div style="position:absolute;left:{X_BACK + 34}mm;top:{WRAP + 100}mm;width:{BOARD_W - 68}mm;text-align:center;font:italic 400 14pt/21pt \'Libre Caslon Text\',serif;color:#F3EBDD">{B.C.BACK_BLURB}</div>'
            + f'<div style="position:absolute;left:{X_BACK + 34}mm;top:{WRAP + 150}mm;width:{BOARD_W - 68}mm;text-align:center;font:600 7.5pt/12pt \'Source Sans 3\';letter-spacing:.18em;color:{gold}">5 PELÍCULAS · 30 ESCENAS · 5 LÁMINAS<br>ÍNDICE ANALÍTICO Y CRONOLOGÍA</div>')
    g = ''
    if guides:
        def vline(x, c, lab):
            return (f'<div style="position:absolute;left:{x}mm;top:0;height:{H}mm;border-left:.5pt dashed {c}"></div>'
                    f'<div style="position:absolute;left:{x + .8}mm;top:3mm;font:600 6pt/1 \'Source Sans 3\';color:{c};background:rgba(0,0,0,.55);padding:.6mm">{lab}</div>')
        def hline(y, c):
            return f'<div style="position:absolute;top:{y}mm;left:0;width:{W}mm;border-top:.5pt dashed {c}"></div>'
        g = (vline(WRAP, '#FF4FD8', 'vuelta 15') + vline(WRAP + BOARD_W, '#56D1FF', 'tapa') + vline(X_SPINE, '#7CFF7C', f'lomo {SPINE} mm')
             + vline(X_SPINE + SPINE, '#7CFF7C', '') + vline(X_FRONT, '#56D1FF', 'cajo 7') + vline(W - WRAP, '#FF4FD8', 'vuelta 15')
             + hline(WRAP, '#FF4FD8') + hline(H - WRAP, '#FF4FD8')
             + f'<div style="position:absolute;left:{WRAP + 4}mm;bottom:{WRAP + 4}mm;font:600 7pt/10pt \'Source Sans 3\';color:#fff;background:rgba(0,0,0,.6);padding:1.5mm">GUÍAS (no imprimir) · pliego {W:.1f} × {H:.1f} mm · tapas {BOARD_W:.1f} × {BOARD_H:.1f} mm · lomo {SPINE} mm · cajo {HINGE:.0f} mm · vuelta {WRAP:.0f} mm</div>')
    return f'<section class="pg">{art}{spine}{front}{back}{g}</section>'

def guardas_page():
    # motivo de rombos de las guardas originales, redibujado en vectorial; pliego de 2 páginas + sangrado
    gw, gh = 2 * B.TRIM_W + 6, B.TRIM_H + 6
    pat = ('<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><defs>'
           '<pattern id="r" width="16" height="22" patternUnits="userSpaceOnUse" patternTransform="scale(.75)">'
           '<path d="M8 2 L13 11 L8 20 L3 11 Z" fill="#C9A45C" fill-opacity=".22"/></pattern></defs>'
           '<rect width="100%" height="100%" fill="#13283C"/><rect width="100%" height="100%" fill="url(#r)"/></svg>')
    return f'<section class="pg" style="width:{gw}mm;height:{gh}mm">{pat}</section>', gw, gh

def write():
    css = f'@page {{ size: {W}mm {H}mm; margin: 0 }} *{{margin:0;padding:0;box-sizing:border-box}} .pg{{position:relative;width:{W}mm;height:{H}mm;overflow:hidden;break-after:page;background:#0F2033}}'
    open(os.path.join(HERE, 'cover.html'), 'w', encoding='utf-8').write(
        f'<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Piratas del Caribe — cubierta</title>{FONTS}<style>{css}</style></head><body>'
        + cover_page(False) + cover_page(True) + '</body></html>')
    g, gw, gh = guardas_page()
    css2 = f'@page {{ size: {gw}mm {gh}mm; margin: 0 }} *{{margin:0;padding:0}} .pg{{position:relative;overflow:hidden}}'
    open(os.path.join(HERE, 'guardas.html'), 'w', encoding='utf-8').write(
        f'<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Piratas del Caribe — guardas</title><style>{css2}</style></head><body>{g}</body></html>')
    print(f'cubierta {W:.1f} × {H:.1f} mm, lomo {SPINE} mm; guardas {gw:.1f} × {gh:.1f} mm')

if __name__ == '__main__':
    write()
