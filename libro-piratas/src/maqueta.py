# -*- coding: utf-8 -*-
"""Maqueta del libro «Piratas del Caribe» (64 páginas).

Genera maqueta/libro.html: un pliego (doble página con 3 mm de sangrado) por cada página del PDF
que imprime Chromium. Portada (p. 1) y contraportada (p. 64) van en pliegos propios: solo se
exporta su mitad. Todas las coordenadas están en mm respecto al corte de la doble página:
x de 0 a 438,24 (lomo en x = 219,12) e y de 0 a 309,37.

Zonas seguras para texto: márgenes exteriores ≥ 20 mm, cabeza ≥ 18 mm, pie ≤ 289 mm, y una
franja de 16 mm a cada lado del lomo (203,1–235,1 mm) libre de texto.

Uso: python3 src/maqueta.py   (desde la carpeta libro-piratas)
"""
import html
import math
import os
import random
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import contenido as C  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H, B = 219.12, 309.37, 3.0
LOMO = W
PT = 25.4 / 72
ILU = "../recursos/ilustraciones"
TEX = "../recursos/texturas"
e = html.escape

_aspectos = {}


def aspecto(nombre):
    """alto/ancho de una ilustración SVG."""
    if nombre not in _aspectos:
        cab = open(os.path.join(RAIZ, "recursos/ilustraciones", nombre + ".svg")).read(600)
        m = re.search(r'viewBox="[\d.\-]+ [\d.\-]+ ([\d.]+) ([\d.]+)"', cab)
        _aspectos[nombre] = float(m.group(2)) / float(m.group(1))
    return _aspectos[nombre]


def est(**kw):
    return ";".join(f"{k.replace('_', '-')}:{v}" for k, v in kw.items() if v is not None)


# ------------------------------------------------------------------ piezas básicas
def ilus(nombre, x, y, w, giro=0, op=None, solapa=False, caja="imagen", z=None):
    h = w * aspecto(nombre)
    t = f"rotate({giro}deg)" if giro else None
    return (f'<img class="p" data-caja="{caja}"{" data-solapa" if solapa else ""} alt="" src="{ILU}/{nombre}.svg" '
            f'style="{est(left=f"{x:.2f}mm", top=f"{y:.2f}mm", width=f"{w:.2f}mm", height=f"{h:.2f}mm", transform=t, opacity=op, z_index=z)}">')


def alto(nombre, w):
    return w * aspecto(nombre)


def titulo(x, y, texto, ante=None, tam=None, clase="", ancho=None, filete=True):
    a = f'<span class="ante">{e(ante)}</span>' if ante else ""
    f = '<span class="filete"></span>' if filete else ""
    return (f'<div class="titulo {clase}" data-caja="texto" style="{est(left=f"{x}mm", top=f"{y}mm", font_size=f"{tam}pt" if tam else None, max_width=f"{ancho}mm" if ancho else None)}">'
            f'{a}{texto}{f}</div>')


def texto(x, y, w, cuerpo, cols=False, capitular=False, tam=None, clase="", extra=""):
    cl = "texto" + (" cols" if cols else "") + (" capitular" if capitular else "") + (" " + clase if clase else "")
    return (f'<div class="{cl}" data-caja="texto" style="{est(left=f"{x}mm", top=f"{y}mm", width=f"{w}mm", font_size=f"{tam}pt" if tam else None)}{extra}">'
            f"{cuerpo}</div>")


def parrafos(t):
    return "".join(f"<p>{e(p)}</p>" for p in t.split("\n"))


def rasgado(semilla, w):
    """Contorno de papel rasgado como clip-path (vectorial)."""
    r = random.Random(semilla)
    n = max(8, int(w / 5.5))
    m = 9
    p = []
    for i in range(n):
        p.append(f"{i * 100 / n:.2f}% {r.uniform(0, 1.15):.2f}mm")
    for j in range(m):
        p.append(f"calc(100% - {r.uniform(0, .9):.2f}mm) {j * 100 / m:.2f}%")
    for i in range(n):
        p.append(f"{100 - i * 100 / n:.2f}% calc(100% - {r.uniform(0, 1.15):.2f}mm)")
    for j in range(m):
        p.append(f"{r.uniform(0, .9):.2f}mm {100 - j * 100 / m:.2f}%")
    return "polygon(" + ",".join(p) + ")"


_semilla = [100]


def nota(x, y, w, cuerpo, titulo_=None, ante=None, sello=None, giro=0, medalla=None, clase="", flujo=False,
         solapa=False, estilo_papel="", alto_min=None, actor=None):
    """Nota de pergamino rasgado. sello: 'td' (arriba dcha.), 'ti' (arriba izq.) o None."""
    _semilla[0] += 1
    cp = rasgado(_semilla[0], w)
    r = random.Random(_semilla[0])
    # fragmento aleatorio del pergamino grande (444 × 315 mm): sin repetición, sin costuras
    bgpos = f"background-position:0 0, {-r.uniform(0, max(0, 440 - w)):.1f}mm {-r.uniform(0, 40):.1f}mm;"
    pos = "" if flujo else f"left:{x}mm;top:{y}mm;"
    t = f"transform:rotate({giro}deg);" if giro else ""
    mh = f"min-height:{alto_min}mm;box-sizing:border-box;" if alto_min else ""
    h = ""
    if ante:
        h += f'<span class="ante">{e(ante)}</span>'
    if titulo_:
        h += f"<h3>{e(titulo_)}</h3>"
    if actor:
        h += f'<span class="actor">{e(actor)}</span>'
    extra = ""
    if sello == "td":
        extra += f'<img class="sello" alt="" src="{ILU}/sello.svg" style="right:-4mm;top:-4.5mm">'
    elif sello == "ti":
        extra += f'<img class="sello" alt="" src="{ILU}/sello.svg" style="left:-4mm;top:-4.5mm">'
    if medalla is not None:
        extra += f'<div class="medalla" style="left:-5mm;top:-5mm">{e(str(medalla))}</div>'
    fl = " flujo" if flujo else ""
    return (f'<div class="nota {clase}{fl}" data-caja="texto"{" data-solapa" if solapa else ""} style="{pos}width:{w}mm;{t}">'
            f'<div class="sombra s2" style="clip-path:{cp}"></div><div class="sombra" style="clip-path:{cp}"></div>'
            f'<div class="borde" style="clip-path:{cp}"></div>'
            f'<div class="papel" style="clip-path:{cp};{bgpos}{mh}{estilo_papel}">{h}{cuerpo}</div>{extra}</div>')


def columna(x, y, w, piezas, hueco=6):
    """Apila notas en vertical (la altura la decide el texto: nunca se corta)."""
    return (f'<div class="p columna" style="left:{x}mm;top:{y}mm;width:{w}mm;display:flex;flex-direction:column;gap:{hueco}mm">'
            + "".join(piezas) + "</div>")


def cita(x, y, w, t):
    return f'<div class="cita" data-caja="texto" style="left:{x}mm;top:{y}mm;width:{w}mm">{e(t)}</div>'


def pie(x, y, w, t):
    return f'<div class="pie" data-caja="texto" style="left:{x}mm;top:{y}mm;width:{w}mm">{e(t)}</div>'


def lib(x, base_pt, tam, t, peso=400, cursiva=False, color="var(--crema)", centro_en=None, ls=None, ancho=None, exento=False):
    """Texto en Liberation Serif colocado por su línea base (en pt del original) para replicar
    al milímetro portada, portadillas y contraportada. 0,8375 em = ascendente efectiva con line-height 1."""
    top = (base_pt - 0.8375 * tam) * PT
    s = est(top=f"{top:.2f}mm", font_size=f"{tam}pt", font_weight=peso, font_style="italic" if cursiva else None,
            color=color, letter_spacing=ls)
    if centro_en is not None:
        s += f";left:{centro_en[0]}mm;width:{centro_en[1]}mm;text-align:center"
    else:
        s += f";left:{x:.2f}mm"
    return f'<div class="p lib" data-caja="texto"{" data-exento" if exento else ""} style="{s}">{e(t)}</div>'


def ruta(puntos, color="#8b1e1e", ancho=.75, guion="2.2 1.6"):
    """Línea punteada suave (Catmull-Rom) que dibuja el viaje por la doble página."""
    p = puntos
    d = f"M{p[0][0]:.1f} {p[0][1]:.1f}"
    for i in range(len(p) - 1):
        p0 = p[i - 1] if i > 0 else p[i]
        p1, p2 = p[i], p[i + 1]
        p3 = p[i + 2] if i + 2 < len(p) else p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}"
    return (f'<svg class="p" style="left:0;top:0;width:438.24mm;height:309.37mm" viewBox="0 0 438.24 309.37">'
            f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{ancho}" stroke-dasharray="{guion}" stroke-linecap="round" stroke-opacity=".85"/></svg>')


def equis(x, y, w=13):
    return f'<img class="p" data-caja="imagen" alt="" src="{ILU}/equis.svg" style="left:{x}mm;top:{y}mm;width:{w}mm;height:{w}mm">'


# ------------------------------------------------------------------ pliegos
class Pliego:
    def __init__(self, tipo, paginas, piezas, indice=(), nombre=""):
        self.tipo, self.paginas, self.piezas, self.indice, self.nombre = tipo, paginas, piezas, list(indice), nombre

    def html(self):
        t = self.tipo
        fondo = ""
        cls = "pliego"
        if t == "perg":
            fondo = (f'<img class="fondo" alt="" src="{ILU}/olas_pliego.svg">'
                     f'<div class="panel"><div class="lomo"></div><div class="vineta"></div></div>')
        elif t == "liso":
            cls += " liso"
            fondo = (f'<div class="fondo" style="background:url({TEX}/pergamino_pliego.jpg) 0 0/cover"></div>'
                     f'<div class="fondo"><div class="lomo"></div><div class="vineta"></div></div>')
        elif t in ("oscuro", "portada", "contra"):
            cls += " oscuro"
            fondo = f'<img class="fondo" alt="" src="{TEX}/oscuro_pliego.jpg">'
        folios = ""
        if t not in ("portada", "contra"):
            fl = " lib" if self.nombre.startswith("portadilla") else ""
            folios = (f'<div class="folio izq{fl}">{self.paginas[0]}</div>'
                      f'<div class="folio der{fl}">{self.paginas[1]}</div>')
        pags = "-".join(str(p) for p in self.paginas)
        return (f'<section class="{cls}" data-tipo="{t}" data-paginas="{pags}" data-nombre="{e(self.nombre)}">{fondo}'
                f'<div class="corte">{"".join(self.piezas)}{folios}</div></section>')


# ------------------------------------------------------------------ portada y contraportada
def portada():
    x0 = W  # la portada es la página derecha del pliego 0
    pz = [f'<img class="p" data-caja="imagen" data-solapa alt="" src="{ILU}/portada.svg" style="left:{x0}mm;top:0;width:{W}mm;height:{H}mm">']
    for base, t in ((669.7, C.LIBRO["titulo"][0]), (727.9, C.LIBRO["titulo"][1])):
        pz.append(lib(0, base, 55.5, t, peso=700, cursiva=True, color="var(--oro)", centro_en=(x0, W)))
    pz.append(lib(0, 769.0, 13.5, C.LIBRO["subtitulo"], color="var(--crema)", centro_en=(x0, W)))
    return Pliego("portada", (None, 1), pz, nombre="portada")


def contraportada():
    pz = []
    cuerpo = (f'<h3 class="lib" style="font-weight:700;font-size:19.5pt;margin:0 0 3.3mm;line-height:1">{e(C.LIBRO["contra_titulo"])}</h3>'
              f'<p class="lib" style="white-space:normal;font-size:15.75pt;line-height:1.28">{e(C.LIBRO["contra_texto"])}</p>')
    pz.append(nota(23.99, 49.39, 173.21, cuerpo, sello="td", alto_min=93.5,
                   estilo_papel="padding:7.4mm 8mm 6mm;font-family:'Liberation Serif'"))
    pz.append(ilus("contra_cofre", 25.4, 169.69, 78.32))
    pz.append(ilus("contra_calavera", 129.82, 182.74, 58.21))
    return Pliego("contra", (64, None), pz, nombre="contraportada")


# ------------------------------------------------------------------ preliminares
def sobre_e_indice(entradas):
    pz = []
    pz.append(ilus("brujula", 52.06, 24, 115, op=.95))
    pz.append(nota(30, 150, 159, f"<p>{e(C.LIBRO['sobre'])}</p>", titulo_="Sobre este libro", sello="td", giro=-.4))
    pz.append(ilus("calavera", 87.56, 226, 44))
    # Índice
    filas = '<div class="indice">'
    for ent in entradas:
        if ent["tipo"] == "grupo":
            filas += f'<div class="grupo">{e(ent["t"])}</div>'
        elif ent["tipo"] == "sub":
            filas += '<div class="s">' + " · ".join(f'{e(t)} <b>{n}</b>' for t, n in ent["items"]) + "</div>"
        else:
            filas += f'<div class="e{" cap" if ent["tipo"] == "cap" else ""}"><span class="t">{e(ent["t"])}</span><span class="n">{ent["n"]}</span></div>'
    filas += "</div>"
    cab = '<div style="font:400 36pt/1 \'Pirata One\';color:var(--tinta-osc);margin:0 0 1mm">Índice</div><div class="titulo-filete" style="height:.7mm;background:var(--tinta-osc);margin-bottom:2mm"></div>'
    pz.append(nota(238, 20, 174, cab + filas, giro=.25, estilo_papel="padding:8mm 9mm 7mm"))
    return Pliego("liso", (2, 3), pz, nombre="sobre-indice")


def introduccion():
    pz = [titulo(24, 24, "Introducción", ante="Bienvenidos a bordo", tam=48)]
    (t1, c1), (t2, c2), (t3, c3) = C.INTRO
    pz.append(nota(24, 68, 148, f"<p>{e(c1)}</p>", titulo_=t1, giro=-.5))
    pz.append(nota(52, 154, 148, f"<p>{e(c2)}</p>", titulo_=t2, sello="td", giro=.4))
    pz.append(cita(40, 252, 140, "Todo gran viaje empieza con una leyenda"))
    pz.append(ilus("marco_intro", 229, 24, 190))
    pz.append(nota(240, 174, 132, f"<p>{e(c3)}</p>", titulo_=t3, giro=-.8, solapa=True))
    pz.append(ilus("calavera", 372, 228, 42))
    return Pliego("oscuro", (4, 5), pz, nombre="introduccion")


def parque():
    P = C.PARQUE
    pz = [titulo(24, 22, "Del parque a la pantalla", ante="Antes de zarpar")]
    cuerpo = "".join(f"<h3>{e(t)}</h3><p>{e(c)}</p>" for t, c in (P["atraccion"], P["genero"]))
    pz.append(texto(24, 62, 179, cuerpo, cols=True, capitular=True))
    pz.append(ilus("barco_rojo_ola", 34, 152, 150))
    pz.append(pie(34, 252, 150, "De las barcas de la atracción a los galeones del cine."))
    pz.append(nota(240, 26, 150, f"<p>{e(P['cine'][1])}</p>", titulo_=P["cine"][0], giro=.4))
    celdas = ""
    for n, et in P["cifras"]:
        celdas += (f'<div style="text-align:center"><div class="cifra" style="font-size:44pt">{e(n)}</div>'
                   f'<div class="cifra-et">{e(et)}</div></div>')
    cifras = (f'<div style="display:grid;grid-template-columns:repeat(3,1fr);row-gap:6mm;column-gap:3mm;margin:3mm 0 5mm">{celdas}</div>'
              f'<p style="font-size:11.6pt;font-style:italic;text-align:center">{e(P["cifras_pie"])}</p>')
    pz.append(nota(238, 104, 176, cifras, titulo_="La saga en cifras", giro=-.3, sello="td"))
    pz.append(ilus("calavera", 306, 236, 40))
    return Pliego("perg", (6, 7), pz, nombre="parque")


def edad_oro():
    E = C.EDAD_ORO
    pz = [titulo(24, 22, "La Edad de Oro de la piratería", ante="La historia real")]
    pz.append(texto(24, 62, 122, f"<h3>{e(E['cuando'][0])}</h3><p>{e(E['cuando'][1])}</p>", capitular=True))
    pz.append(ilus("bandera", 152, 60, 52, giro=-4))
    pz.append(texto(24, 132, 179, f"<h3>Corsarios, bucaneros y piratas</h3><p>{e(E['tipos_intro'])}</p>"))
    for i, (t, c) in enumerate(E["tipos"]):
        pz.append(nota(26 + i * 60, 154, 55, f"<p>{e(c)}</p>", titulo_=t, clase="compacta", giro=(-.6, .5, -.3)[i],
                       sello="td" if i == 2 else None))
    pz.append(ilus("isla_tesoro", 54, 222, 112))
    pie_ = pie(54, 278, 112, "El tesoro enterrado es, sobre todo, cosa de novela.")
    pz.append(pie_)
    pz.append(nota(240, 26, 140, f"<p>{e(E['vida'][1])}</p>", titulo_=E["vida"][0], giro=.5))
    pz.append(nota(272, 112, 140, f"<p>{e(E['mitos'][1])}</p>", titulo_=E["mitos"][0], sello="td", giro=-.4))
    pz.append(ilus("brujula", 244, 198, 84, op=.9))
    return Pliego("perg", (8, 9), pz, nombre="edad-oro")


def barbanegra():
    Bn = C.BARBANEGRA
    pz = [titulo(24, 22, "Barbanegra y el Queen Anne’s Revenge", ante="La historia real", tam=30)]
    cartel = (f'<div class="sb">SE BUSCA</div><div class="regla"></div>'
              f'<img alt="" src="{ILU}/calavera.svg" style="width:30mm;display:block;margin:2.5mm auto 1.5mm">'
              f'<div class="nom">Edward Teach</div><div class="ali">alias Barbanegra</div><div class="regla"></div>'
              f'<div class="det">Por piratería en el Caribe y en la costa de Carolina</div>'
              f'<div class="det" style="font-style:italic">Visto por última vez en Ocracoke, 1718</div>')
    pz.append(nota(24, 56, 80, cartel, clase="cartel", giro=-2.2))
    pz.append(nota(112, 54, 89, f"<p>{e(Bn['hombre'][1])}</p>", titulo_=Bn["hombre"][0], giro=.5))
    pz.append(ilus("barco_rojo_qar", 26, 172, 80, giro=-1.5))
    pz.append(nota(112, 146, 89, f"<p>{e(Bn['barco'][1])}</p>", titulo_=Bn["barco"][0], sello="td", giro=-.4))
    pz.append(nota(46, 236, 154, f"<p>{e(Bn['naufragio'][1])}</p>", titulo_=Bn["naufragio"][0], giro=.3))
    # Página derecha: el mapa
    pz.append(titulo(236, 22, "Port Royal, Tortuga y Nassau", ante="Puertos piratas", clase="sub"))
    mx, my, mw = 234, 47, 180
    k = mw / 185
    mapa = open(os.path.join(RAIZ, "recursos/ilustraciones/mapa_caribe.svg")).read()
    mapa = mapa.replace('class="mapa-caribe"', f'class="p mapa-caribe" data-caja="imagen" style="left:{mx}mm;top:{my}mm;width:{mw}mm;height:{242 * k:.2f}mm"', 1)
    pz.append(mapa)
    pz.append(ilus("brujula", mx + 116 * k, my + 150 * k, 36, op=.85, solapa=True))
    (t1, c1), (t2, c2), (t3, c3) = C.PUERTOS
    pz.append(nota(mx + 113 * k, my + 13 * k, 66, f"<p>{e(c3)}</p>", titulo_=t3, clase="mapa", medalla=3, solapa=True, giro=.4))
    pz.append(nota(mx + 113 * k, my + 80 * k, 66, f"<p>{e(c2)}</p>", titulo_=t2, clase="mapa", medalla=2, solapa=True, giro=-.5))
    pz.append(nota(mx + 5 * k, my + 177 * k, 66, f"<p>{e(c1)}</p>", titulo_=t1, clase="mapa", medalla=1, solapa=True, giro=.3))
    return Pliego("perg", (10, 11), pz, nombre="barbanegra")


# ------------------------------------------------------------------ capítulos
def portadilla(pe, pags):
    """Reproduce la portadilla original (mismas posiciones, colores y tipografía).
    Cambios mínimos: la calavera, que caía sobre el lomo, pasa a la página izquierda; el marco del barco
    se desplaza 4 mm hacia fuera para alejarlo del pliegue."""
    pz = []
    pz.append(lib(26.46, 255.4, 247.5, str(pe["n"]), peso=700, color="var(--oro)", exento=True))  # cifra de 247,5 pt: su caja tipográfica sube más que la tinta
    pz.append(lib(26.46, 349.7, 58.5, pe["lineas"][0], peso=700, cursiva=True, color="var(--crema)"))
    pz.append(lib(26.46, 411.1, 58.5, pe["lineas"][1], peso=700, cursiva=True, color="var(--crema)"))
    pz.append(lib(26.46, 528.0, 30, pe["anio"], color="var(--oro)", ls=".16em"))
    cap = (f'<h3 class="lib" style="font-size:18pt;font-weight:700;margin:0 0 3.2mm">Capítulo {pe["romano"]}</h3>'
           f'<p class="lib" style="font-size:16.5pt;white-space:normal;line-height:1.2">{e(pe["lema"])}</p>')
    pz.append(nota(31.75, 197.56, 149.93, cap, sello="td", alto_min=67,
                   estilo_papel="padding:10.2mm 8mm 6mm 7.6mm;font-family:'Liberation Serif'"))
    pz.append(ilus("calavera", 150, 152, 40))
    pz.append(ilus(pe["ilus"]["marco"], 231.2, 19.05, 196.85))
    ficha = '<h3 class="lib" style="font-size:15pt;font-weight:700;margin:0 0 2.6mm">Ficha técnica</h3>'
    ficha += "".join(f'<p class="lib" style="font-size:11.25pt;line-height:1.28;white-space:normal;text-indent:0">{e(k)}: {e(v)}</p>'
                     for k, v in pe["ficha"])
    pz.append(nota(238.13, 208.84, 173.92, ficha, alto_min=79.7,
                   estilo_papel="padding:7mm 8mm 6mm 7.6mm;font-family:'Liberation Serif'"))
    return Pliego("oscuro", pags, pz, nombre=f"portadilla-{pe['n']}")


def ante_cap(pe):
    return f"Capítulo {pe['romano']} · {pe['titulo']}"


def sinopsis(pe, pags):
    pz = [titulo(24, 22, "Sinopsis", ante=ante_cap(pe))]
    pz.append(texto(24, 62, 179, parrafos(pe["argumento"]), cols=True, capitular=True))
    pz.append(ilus(pe["ilus"]["pegatina"], 26, 146, 82, giro=-2))
    pz.append(nota(116, 146, 86, f"<p>{e(pe['musica'])}</p>", titulo_="Música y sonido", sello="td", giro=.5))
    pz.append(cita(30, 238, 168, f"«{pe['lema']}»"))
    pz.append(titulo(236, 22, "Reparto y personajes", ante="Quién es quién", clase="sub"))
    rep = pe["reparto"]
    hueco = 6 if len(rep) > 6 else 9
    colA = [nota(0, 0, 86, f"<p>{e(d)}</p>", titulo_=pj, actor=act, clase="compacta", flujo=True, giro=(.3 if i % 4 else -.3))
            for i, (act, pj, d) in enumerate(rep) if i % 2 == 0]
    colB = [nota(0, 0, 86, f"<p>{e(d)}</p>", titulo_=pj, actor=act, clase="compacta", flujo=True, giro=(-.3 if i % 4 == 1 else .4),
                 sello="td" if i == 1 else None) for i, (act, pj, d) in enumerate(rep) if i % 2 == 1]
    pz.append(columna(236, 58, 86, colA, hueco=hueco))
    pz.append(columna(328, 70, 86, colB, hueco=hueco))
    return Pliego("perg", pags, pz, nombre=f"sinopsis-{pe['n']}")


def viaje(pe, pags):
    v = pe["viaje"]
    il = pe["ilus"]
    pz = [titulo(24, 22, "El viaje", ante=ante_cap(pe))]
    var_b = pe["n"] in (2, 4)
    if not var_b:
        # Actos I-III en zigzag por la página izquierda; clímax y desenlace a la derecha, con el barco en medio
        pos = [(24, 54, 104), (98, 132, 104), (24, 210, 104), (312, 22, 102), (300, 204, 104)]
        hw = 138
        hx = 236 + (178 - hw) / 2 + 6
        hy = 104 + (88 - alto(il["heroe"], hw)) / 2
        pz.append(ilus(il["heroe"], hx, hy, hw))
        puntos = [(78, 47), (28, 58), (16, 112), (60, 128), (100, 136), (206, 160), (160, 204), (30, 214), (16, 262),
                  (100, 282), (219, 276), (244, 240), (236, 110), (262, 40), (314, 26), (410, 62), (412, 170), (304, 208),
                  (296, 276), (382, 282)]
        xfin = (380, 274)
        if il["secundaria"]:
            pz.append(ilus(il["secundaria"], 140, 236, 62))
        else:
            pz.append(ilus("brujula", 146, 230, 48, op=.9))
    else:
        # Actos I-II arriba a la izquierda con el barco debajo; III, clímax y desenlace a la derecha
        pos = [(24, 54, 92), (120, 70, 83), (240, 22, 100), (314, 104, 100), (240, 190, 100)]
        hw = 150
        pz.append(ilus(il["heroe"], 34, 274 - alto(il["heroe"], hw), hw))
        puntos = [(78, 47), (26, 58), (18, 140), (70, 150), (122, 74), (206, 96), (214, 150), (230, 120), (238, 26),
                  (300, 18), (410, 60), (318, 108), (300, 176), (240, 196), (228, 268), (330, 282), (384, 266)]
        xfin = (382, 252)
        if il["secundaria"]:
            pz.append(ilus(il["secundaria"], 346, 222, 66))
    pz.insert(1, ruta(puntos))
    pz.append(equis(*xfin))
    for i, ((etq, tt, c), (x, y, w)) in enumerate(zip(v, pos)):
        pz.append(nota(x, y, w, f"<p>{e(c)}</p>", titulo_=tt, ante=etq, medalla=i + 1,
                       giro=(-.5, .4, -.3, .5, -.4)[i], sello="td" if i == 3 else None))
    return Pliego("perg", pags, pz, nombre=f"viaje-{pe['n']}")


def detras(pe, pags):
    il = pe["ilus"]
    pz = [titulo(24, 22, "Detrás de cámaras", ante=ante_cap(pe))]
    pz.append(texto(24, 62, 179, parrafos(pe["detras"]), cols=True, capitular=True))
    pz.append(ilus(il["pegatina"], 26, 134, 124, giro=-1.8))
    etq, nom, c = pe["ficha_barco"]
    pz.append(nota(108, 206, 94, f"<p>{e(c)}</p>", titulo_=nom, ante=etq, sello="td", giro=.6, solapa=True))
    # Página derecha
    pz.append(titulo(236, 22, "Curiosidades y legado", ante="Para la bitácora", clase="sub"))
    for i, (t, (x, y)) in enumerate(zip(pe["curiosidades"], ((240, 58), (290, 100), (240, 142)))):
        pz.append(nota(x, y, 122, f"<p>{e(t)}</p>", clase="compacta", medalla=i + 1, giro=(-.5, .4, -.3)[i]))
    taq = (f'<div class="cifra" style="font-size:56pt">{e(pe["taquilla"])}</div>'
           f'<div class="cifra-et" style="margin-top:1.4mm">USD de recaudación mundial (aprox.)</div>'
           f'<div class="cifra-et" style="font-style:normal;font-weight:600;margin-top:1.6mm">{e(pe["premio"])}</div>')
    pz.append(texto(242, 202, 78, taq))
    pz.append(nota(324, 196, 90, f"<p>{e(pe['recepcion'])}</p>", titulo_="Recepción y legado", sello="td", giro=.5))
    return Pliego("perg", pags, pz, nombre=f"detras-{pe['n']}")


# ------------------------------------------------------------------ páginas finales
def cronologia():
    pz = [titulo(24, 22, "Cronología de la saga", ante="De 1967 a 2017")]
    pz.append('<svg class="p" style="left:0;top:0;width:438.24mm;height:309.37mm" viewBox="0 0 438.24 309.37">'
              '<path d="M22 164 C120 158 320 170 416 164" fill="none" stroke="#5e4828" stroke-width="1.6"/>'
              '<path d="M22 164 C120 158 320 170 416 164" fill="none" stroke="#c9a24b" stroke-width=".5" stroke-dasharray="3 2"/></svg>')
    hitos = [C.CRONOLOGIA_1967] + [(p["anio"], p["titulo"], f"{p['taquilla']} USD · {p['premio']}.") for p in C.PELICULAS]
    pegs = ["isla_tesoro"] + [p["ilus"]["pegatina"] for p in C.PELICULAS]
    xs = [24, 85, 146, 236, 297, 358]
    for i, ((anio, tt, c), x) in enumerate(zip(hitos, xs)):
        arriba = i % 2 == 0
        cx = x + 28
        pz.append(f'<div class="medalla p" style="left:{cx - 5.5}mm;top:{158.5}mm;font-size:13pt">{"" if i == 0 else C.PELICULAS[i - 1]["romano"]}</div>')
        img = f'<img alt="" src="{ILU}/{pegs[i]}.svg" style="width:44mm;display:block;margin:1.5mm auto 2.5mm">'
        cuerpo = (f'<div style="font:400 30pt/1 \'Pirata One\';color:var(--rojo)">{anio}</div>{img}'
                  f'<h3 style="font-size:13.4pt">{e(tt)}</h3><p style="font-size:11.6pt">{e(c)}</p>')
        y = 50 if arriba else 178
        pz.append(nota(x, y, 56, cuerpo, clase="compacta", giro=(-.6 if arriba else .5)))
        y0, y1 = (148, 158) if arriba else (170, 178)
        pz.append(f'<svg class="p" style="left:{cx - 1}mm;top:{y0}mm;width:2mm;height:{y1 - y0}mm" viewBox="0 0 2 {y1 - y0}">'
                  f'<line x1="1" y1="0" x2="1" y2="{y1 - y0}" stroke="#5e4828" stroke-width=".5" stroke-dasharray="1 .8"/></svg>')
    return Pliego("perg", (52, 53), pz, nombre="cronologia")


def personajes():
    Pj = C.PERSONAJES
    pz = [titulo(24, 22, "Personajes de la saga", ante="Galería de la tripulación")]
    jack = Pj[0]
    cartel = (f'<div class="sb">SE BUSCA</div><div class="regla"></div>'
              f'<img alt="" src="{ILU}/barco_negro_ola.svg" style="width:62mm;display:block;margin:2.5mm auto 1.5mm">'
              f'<div class="nom">{e(jack[0])}</div><div class="ali">capitán (cuando tiene barco)</div><div class="regla"></div>'
              f'<div class="det" style="text-align:left">{e(jack[1])}</div>')
    pz.append(nota(24, 58, 84, cartel, clase="cartel", giro=-1.6))
    izq = [nota(0, 0, 90, f"<p>{e(c)}</p>", titulo_=t, flujo=True, giro=(.4, -.3, .3)[i], sello="td" if i == 1 else None)
           for i, (t, c) in enumerate(Pj[1:4])]
    pz.append(columna(113, 56, 90, izq, hueco=8))
    pz.append(ilus("brujula", 34, 218, 62, op=.85))
    der = [nota(0, 0, 86, f"<p>{e(c)}</p>", titulo_=t, flujo=True, giro=(-.4, .4, -.3, .3)[i], sello="td" if i == 2 else None)
           for i, (t, c) in enumerate(Pj[4:8])]
    pz.append(columna(236, 26, 86, [der[0], der[2]], hueco=8))
    pz.append(columna(328, 40, 86, [der[1], der[3]], hueco=8))
    pz.append(ilus("kraken", 270, 196, 118))
    return Pliego("perg", (54, 55), pz, nombre="personajes")


def barcos_musica():
    pz = [titulo(24, 22, "Los barcos de la saga", ante="La flota")]
    y = 58
    for i, (nom, img, c) in enumerate(C.BARCOS):
        izq = i % 2 == 0
        pz.append(ilus(img, 24 if izq else 146, y, 56, giro=(1.5 if izq else -1.5)))
        pz.append(texto(86 if izq else 24, y + 5, 116, f"<h3>{e(nom)}</h3><p>{e(c)}</p>"))
        y += 46
    pz.append(titulo(236, 22, "La música de la saga", ante="Banda sonora", clase="sub"))
    pz.append(ilus("pentagrama", 236, 60, 178))
    filas = "".join(
        f'<div class="it"><div class="num" style="font-size:22pt">{r}</div><div><b>{e(n)}</b>{(" · <i>" + e(x) + "</i>") if x else ""}</div></div>'
        for r, n, x in C.MUSICA["compositores"])
    pz.append(nota(240, 94, 170, f'<div class="lista">{filas}</div>', titulo_="Los compositores", giro=-.4))
    pz.append(nota(262, 204, 150, f"<p>{e(C.MUSICA['sonido'])}</p>", titulo_="El sonido de la saga", sello="td", giro=.4))
    return Pliego("perg", (56, 57), pz, nombre="barcos-musica")


def glosario():
    G = C.GLOSARIO
    pz = [titulo(24, 22, "Glosario pirata", ante="Para hablar como un lobo de mar")]
    pz.append(ilus("bandera", 364, 16, 46, giro=3))
    pz.append(ilus("brujula", 104, 176, 96, op=.2, solapa=True))
    pz.append(ilus("brujula", 300, 150, 110, op=.2, solapa=True))
    mitad = (len(G) + 1) // 2
    for x, parte in ((26, G[:mitad]), (238, G[mitad:])):
        cuerpo = '<div class="glosa">' + "".join(f'<div class="g"><span class="term">{e(t)}</span>{e(d)}</div>' for t, d in parte) + "</div>"
        pz.append(texto(x, 64, 172, cuerpo, tam=13.4))
    return Pliego("perg", (58, 59), pz, nombre="glosario")


def legado():
    L = C.LEGADO
    pz = [titulo(24, 24, "Legado", ante="Lo que deja la saga", tam=48)]
    pz.append(nota(24, 68, 150, f"<p>{e(L['cambio'][1])}</p>", titulo_=L["cambio"][0], giro=-.5))
    pz.append(nota(50, 160, 150, f"<p>{e(L['icono'][1])}</p>", titulo_=L["icono"][0], sello="td", giro=.5))
    pz.append(cita(40, 240, 140, "El mar siempre guarda una historia más"))
    pz.append(ilus("marco_legado", 229, 22, 188))
    maxv = 1100
    filas = ""
    for anio, tt, v, et in L["cifras"]:
        filas += (f'<div style="display:grid;grid-template-columns:14mm 1fr 24mm;align-items:center;gap:2.5mm;margin:2mm 0">'
                  f'<div style="font:400 16pt/1 \'Pirata One\';color:var(--rojo)">{anio}</div>'
                  f'<div><div style="font-size:11pt;line-height:1.1;margin-bottom:1mm">{e(tt)}</div>'
                  f'<div style="height:4mm;width:{v / maxv * 100:.1f}%;background:linear-gradient(90deg,#b08a35,#c9a24b);border-radius:.4mm"></div></div>'
                  f'<div style="font-weight:700;text-align:right;font-size:12pt">{e(et)}</div></div>')
    filas += '<p style="font-size:10pt;font-style:italic;margin-top:1.6mm;color:var(--sepia)">Recaudación mundial aproximada, en millones de dólares.</p>'
    pz.append(nota(238, 176, 176, filas, titulo_="La saga en cifras", giro=-.3, solapa=True))
    return Pliego("oscuro", (60, 61), pz, nombre="legado")


def mapa_final():
    pz = [titulo(24, 22, "Mapa y escenarios", ante="Dónde se rodó la aventura")]
    # Carta del tesoro: papel rasgado que ocupa la doble página (el lomo solo cruza papel y ruta)
    cp = rasgado(999, 390)
    pz.append(f'<div class="p" data-caja="imagen" data-solapa style="left:24mm;top:52mm;width:390mm;height:232mm">'
              f'<div style="position:absolute;inset:0;background:rgba(55,32,10,.22);clip-path:{cp};transform:translate(1.6mm,2mm)"></div>'
              f'<div style="position:absolute;inset:0;background:#8f7244;clip-path:{cp}"></div>'
              f'<div style="position:absolute;inset:.4mm;background:linear-gradient(rgba(250,241,214,.42),rgba(250,241,214,.42)),url({TEX}/pergamino_pliego.jpg) -20mm -40mm/444.24mm 315.37mm no-repeat;clip-path:{cp}"></div>'
              f'<div style="position:absolute;inset:.4mm;clip-path:{cp};background:radial-gradient(ellipse at center, rgba(120,80,30,0) 55%, rgba(120,80,30,.22) 100%)"></div></div>')
    puntos = [(40, 268), (70, 200), (40, 130), (110, 92), (180, 120), (219, 110), (262, 76), (330, 92), (306, 150),
              (250, 190), (300, 248), (372, 236)]
    pz.append(ruta(puntos, ancho=.9))
    pz.append(ilus("isla_tesoro", 30, 226, 74))
    pz.append(ilus("barco_rojo_ola", 112, 196, 82, giro=-2))
    pz.append(ilus("brujula", 340, 60, 62, op=.85))
    pz.append(equis(366, 228, 15))
    pz.append(ilus("contra_cofre", 382, 248, 26))
    esc = C.ESCENARIOS
    pos = [(62, 66, 62), (130, 116, 66), (246, 100, 60), (238, 196, 62), (36, 160, 62)]
    for i, ((t, c), (x, y, w)) in enumerate(zip(esc, pos)):
        pz.append(nota(x, y, w, f"<p>{e(c)}</p>", titulo_=t, clase="compacta", medalla=i + 1, giro=(-.6, .5, -.4, .6, .3)[i]))
    pz.append(nota(318, 150, 92, '<p style="font:italic 500 13pt/1.3 \'EB Garamond\'">El mar siempre guarda una historia más.</p>',
                   titulo_="Fin", sello="td", giro=-.5))
    return Pliego("perg", (62, 63), pz, nombre="mapa-escenarios")


# ------------------------------------------------------------------ plan del libro
def plan():
    """Orden de los pliegos. Cada entrada: (función, páginas, entradas de índice)."""
    pl = [(portada, None, [])]
    pl.append(("indice", (2, 3), []))
    pl.append((introduccion, (4, 5), [("Introducción", 4)]))
    pl.append((parque, (6, 7), [("Del parque a la pantalla", 6)]))
    pl.append((edad_oro, (8, 9), [("La Edad de Oro de la piratería", 8)]))
    pl.append((barbanegra, (10, 11), [("Barbanegra y el Queen Anne’s Revenge", 10), ("Port Royal, Tortuga y Nassau", 11)]))
    p = 12
    for pe in C.PELICULAS:
        pl.append((lambda pe=pe, p=p: portadilla(pe, (p, p + 1)), (p, p + 1),
                   [("cap", f"{pe['romano']}. {pe['titulo']} ({pe['anio']})", p,
                     [("Sinopsis y reparto", p + 2), ("El viaje", p + 4), ("Detrás de cámaras y curiosidades", p + 6)])]))
        pl.append((lambda pe=pe, p=p: sinopsis(pe, (p + 2, p + 3)), (p + 2, p + 3), []))
        pl.append((lambda pe=pe, p=p: viaje(pe, (p + 4, p + 5)), (p + 4, p + 5), []))
        pl.append((lambda pe=pe, p=p: detras(pe, (p + 6, p + 7)), (p + 6, p + 7), []))
        p += 8
    pl.append((cronologia, (52, 53), [("Cronología de la saga", 52)]))
    pl.append((personajes, (54, 55), [("Personajes de la saga", 54)]))
    pl.append((barcos_musica, (56, 57), [("Los barcos de la saga", 56), ("La música de la saga", 57)]))
    pl.append((glosario, (58, 59), [("Glosario pirata", 58)]))
    pl.append((legado, (60, 61), [("Legado", 60)]))
    pl.append((mapa_final, (62, 63), [("Mapa y escenarios", 62)]))
    pl.append((contraportada, None, []))
    return pl


def entradas_indice(pl):
    out = []
    grupos = {4: "Antes de zarpar", 12: "Las cinco películas", 52: "Al final del viaje"}
    for _, _, ents in pl:
        for ent in ents:
            if ent[0] == "cap":
                _, t, n, subs = ent
                if n in grupos:
                    out.append({"tipo": "grupo", "t": grupos[n]})
                out.append({"tipo": "cap", "t": t, "n": n})
                out.append({"tipo": "sub", "items": subs})
            else:
                t, n = ent
                if n in grupos:
                    out.append({"tipo": "grupo", "t": grupos[n]})
                out.append({"tipo": "e", "t": t, "n": n})
    return out


def construir(salida):
    pl = plan()
    ents = entradas_indice(pl)
    pliegos = []
    for f, pags, _ in pl:
        pliegos.append(sobre_e_indice(ents) if f == "indice" else f())
    # Comprobaciones de paginación
    paginas = [p for pg in pliegos for p in pg.paginas if p is not None]
    assert paginas == list(range(1, 65)), f"Paginación incorrecta: {paginas}"
    doc = ('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Piratas del Caribe · maqueta</title>'
           '<link rel="stylesheet" href="../src/estilos.css"></head><body>'
           + "\n".join(pg.html() for pg in pliegos) + "</body></html>")
    os.makedirs(os.path.dirname(salida), exist_ok=True)
    open(salida, "w").write(doc)
    # Índice para la verificación automática contra el PDF final
    import json
    json.dump([{"t": x["t"], "n": x["n"]} for x in ents if x["tipo"] in ("e", "cap")]
              + [{"t": t, "n": n} for x in ents if x["tipo"] == "sub" for t, n in x["items"]],
              open(os.path.join(os.path.dirname(salida), "indice.json"), "w"), ensure_ascii=False, indent=1)
    print(f"{len(pliegos)} pliegos, {len(paginas)} páginas -> {salida}")


if __name__ == "__main__":
    construir(os.path.join(RAIZ, "maqueta", "libro.html"))
