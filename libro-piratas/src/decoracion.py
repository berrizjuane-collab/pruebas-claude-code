# -*- coding: utf-8 -*-
"""Genera las piezas decorativas vectoriales (SVG) del libro.

- olas_pliego.svg : patrón de olas del marco azul (el original era un JPEG de 96 ppp; aquí es vectorial)
- sello.svg       : sello de lacre rojo
- bandera.svg     : Jolly Roger ondeando
- pentagrama.svg  : pentagrama decorativo para «La música de la saga»
- equis.svg       : la X del tesoro
"""
import math
import random
import os

AZUL, BLANCO, CELESTE = "#2c4a92", "#edf2fa", "#93aad9"
SW, SH = 444.24, 315.37  # pliego con sangrado (mm)


def olas(path):
    """Filas de arcos superpuestos, como el patrón del original (≈18,5 mm por ola, 15,9 mm por fila)."""
    w, row = 18.5, 15.9
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SW} {SH}" width="{SW}mm" height="{SH}mm">',
           f'<rect width="{SW}" height="{SH}" fill="{AZUL}"/>']
    outer, inner = [], []
    r = 0
    y = 6.0
    while y < SH + row:
        off = -w / 2 if r % 2 else 0
        x = off - w
        while x < SW + w:
            a0, a1 = x - 0.09 * w, x + 1.09 * w
            rx, ry = (a1 - a0) / 2, 0.36 * w
            outer.append(f"M{a0:.2f} {y:.2f}A{rx:.2f} {ry:.2f} 0 0 1 {a1:.2f} {y:.2f}")
            b0, b1 = x + 0.12 * w, x + 0.88 * w
            inner.append(f"M{b0:.2f} {y + 1.9:.2f}A{(b1 - b0) / 2:.2f} {0.27 * w:.2f} 0 0 1 {b1:.2f} {y + 1.9:.2f}")
            x += w
        y += row
        r += 1
    out.append(f'<path d="{"".join(inner)}" fill="none" stroke="{CELESTE}" stroke-width="0.55"/>')
    out.append(f'<path d="{"".join(outer)}" fill="none" stroke="{BLANCO}" stroke-width="0.95"/>')
    out.append("</svg>")
    open(path, "w").write("\n".join(out))


def sello(path):
    rnd = random.Random(7)
    pts = []
    for i in range(36):
        a = i / 36 * 2 * math.pi
        rr = 46 + rnd.uniform(-2.6, 2.6)
        pts.append(f"{50 + rr * math.cos(a):.1f},{50 + rr * math.sin(a):.1f}")
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs>
<radialGradient id="sl-g" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="#c2363d"/><stop offset=".55" stop-color="#a22029"/><stop offset="1" stop-color="#5e0f12"/></radialGradient>
<radialGradient id="sl-i" cx="58%" cy="62%" r="65%"><stop offset="0" stop-color="#b52a31"/><stop offset="1" stop-color="#7a161a"/></radialGradient>
</defs>
<polygon points="{' '.join(pts)}" fill="url(#sl-g)"/>
<circle cx="50" cy="50" r="31" fill="url(#sl-i)" stroke="#5e0f12" stroke-width="2.2"/>
<circle cx="50" cy="50" r="25" fill="none" stroke="#d65a5f" stroke-opacity=".55" stroke-width="1.2"/>
<path d="M50 34 l3.6 10.8 h11.4 l-9.2 6.7 3.5 10.9 -9.3-6.7 -9.3 6.7 3.5-10.9 -9.2-6.7 h11.4z" fill="#6e1216" fill-opacity=".75"/>
<ellipse cx="36" cy="28" rx="10" ry="5" fill="#fff" fill-opacity=".18" transform="rotate(-30 36 28)"/>
</svg>'''
    open(path, "w").write(svg)


def bandera(path):
    """Jolly Roger: tela negra ondeando con calavera y tibias en marfil (#efe6cf, como el original)."""
    marfil = "#efe6cf"
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 130">
<rect x="6" y="4" width="3.2" height="124" rx="1.4" fill="#5e4828"/>
<circle cx="7.6" cy="4" r="3" fill="#c9a24b"/>
<path d="M9 10 C40 2 60 18 90 10 S140 4 154 12 C150 40 156 62 150 90 C120 82 100 98 70 92 S28 86 9 94 Z" fill="#15100c"/>
<path d="M9 10 C40 2 60 18 90 10 S140 4 154 12 C150 40 156 62 150 90" fill="none" stroke="#3a2e25" stroke-width="1.2" opacity=".6"/>
<g transform="translate(80 49) rotate(-3)">
  <g stroke="{marfil}" stroke-width="7" stroke-linecap="round"><line x1="-30" y1="-14" x2="30" y2="26"/><line x1="30" y1="-14" x2="-30" y2="26"/></g>
  <g fill="{marfil}"><circle cx="-33" cy="-17" r="5"/><circle cx="-27" cy="-20" r="5"/><circle cx="33" cy="-17" r="5"/><circle cx="27" cy="-20" r="5"/>
  <circle cx="-33" cy="29" r="5"/><circle cx="-27" cy="32" r="5"/><circle cx="33" cy="29" r="5"/><circle cx="27" cy="32" r="5"/></g>
  <path d="M-19 -6 C-19 -30 19 -30 19 -6 C19 4 13 8 11 12 L11 18 L-11 18 L-11 12 C-13 8 -19 4 -19 -6Z" fill="{marfil}"/>
  <ellipse cx="-8" cy="-6" rx="5.5" ry="6.5" fill="#15100c"/><ellipse cx="8" cy="-6" rx="5.5" ry="6.5" fill="#15100c"/>
  <path d="M0 2 l-3 6 h6z" fill="#15100c"/>
  <g stroke="#15100c" stroke-width="1.2"><line x1="-5" y1="13" x2="-5" y2="18"/><line x1="0" y1="13" x2="0" y2="18"/><line x1="5" y1="13" x2="5" y2="18"/></g>
</g>
</svg>'''
    open(path, "w").write(svg)


def pentagrama(path):
    """Pentagrama ornamental (notas genéricas, no una melodía real)."""
    W, H = 178, 26
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}mm" height="{H}mm">']
    for i in range(5):
        y = 6 + i * 3.2
        s.append(f'<line x1="2" y1="{y}" x2="{W - 2}" y2="{y}" stroke="#6b5a3e" stroke-width=".35"/>')
    s.append(f'<line x1="2" y1="6" x2="2" y2="18.8" stroke="#6b5a3e" stroke-width=".5"/>')
    s.append(f'<line x1="{W - 2}" y1="6" x2="{W - 2}" y2="18.8" stroke="#6b5a3e" stroke-width=".9"/>')
    s.append(f'<line x1="{W - 4}" y1="6" x2="{W - 4}" y2="18.8" stroke="#6b5a3e" stroke-width=".35"/>')
    # Clave de sol estilizada
    s.append('<path d="M10 22 C6 22 6 17 10 17 C14 17 14 23 9 23 C4 23 3 15 9 11 C13 8 13 3 11 2 C9 3 8 8 10 13 L12 24 C12 26 9 26 9 24" '
             'fill="none" stroke="#2a1b12" stroke-width=".7" stroke-linecap="round"/>')
    rnd = random.Random(3)
    x = 22
    pitches = [0, 2, 4, 2, 5, 4, 2, 0, 1, 3, 5, 6, 5, 3, 2, 4, 6, 7, 6, 4, 2, 1, 0, 2, 4, 3, 1, 0]
    for k, p in enumerate(pitches):
        if x > W - 10:
            break
        y = 18.8 - p * 1.6
        s.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="1.45" ry="1.05" transform="rotate(-20 {x:.1f} {y:.1f})" fill="#2a1b12"/>')
        s.append(f'<line x1="{x + 1.3:.1f}" y1="{y:.1f}" x2="{x + 1.3:.1f}" y2="{y - 8:.1f}" stroke="#2a1b12" stroke-width=".4"/>')
        if k % 4 == 3:
            s.append(f'<line x1="{x + 1.3 - 15:.1f}" y1="{18.8 - pitches[k - 3] * 1.6 - 8:.1f}" x2="{x + 1.3:.1f}" y2="{y - 8:.1f}" stroke="#2a1b12" stroke-width="1.1"/>')
            s.append(f'<line x1="{x + 4:.1f}" y1="6" x2="{x + 4:.1f}" y2="18.8" stroke="#6b5a3e" stroke-width=".35"/>')
            x += 8
        else:
            x += 5
    s.append("</svg>")
    open(path, "w").write("\n".join(s))


def equis(path):
    svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
<g stroke="#a22029" stroke-width="6" stroke-linecap="round"><path d="M7 8 C15 16 24 25 33 33"/><path d="M33 7 C25 15 16 25 7 33"/></g>
<g stroke="#5e0f12" stroke-width="1.2" stroke-linecap="round" opacity=".55"><path d="M9 11 C16 18 24 26 31 31"/><path d="M31 10 C24 17 17 25 10 31"/></g>
</svg>'''
    open(path, "w").write(svg)


def generar(carpeta):
    os.makedirs(carpeta, exist_ok=True)
    olas(os.path.join(carpeta, "olas_pliego.svg"))
    sello(os.path.join(carpeta, "sello.svg"))
    bandera(os.path.join(carpeta, "bandera.svg"))
    pentagrama(os.path.join(carpeta, "pentagrama.svg"))
    equis(os.path.join(carpeta, "equis.svg"))


if __name__ == "__main__":
    import sys
    generar(sys.argv[1] if len(sys.argv) > 1 else "recursos/ilustraciones")
