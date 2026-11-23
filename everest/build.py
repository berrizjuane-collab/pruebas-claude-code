"""Ensambla everest/index.html a partir de src/.

* Inserta estilos, scripts y datos.
* Genera el cordel (10 banderas sueltas) y las barras del macizo.
* Crea subconjuntos WOFF2 de Gotu, Mukta y Noto Serif Tibetan con solo los glifos que usa la página
  y los incrusta como data-URI (el visor de artifacts no deja cargar fuentes de otro origen).

Uso: python -I build.py <carpeta_fuentes_ttf>
"""
import base64, io, json, os, re, sys, html as H

AQUI = os.path.dirname(os.path.abspath(__file__))
FUENTES = os.path.abspath(sys.argv[1])
SRC = os.path.join(AQUI, 'src')


def leer(n):
    return open(os.path.join(SRC, n), encoding='utf-8').read()


pagina = leer('index.html')
css = leer('estilos.css')
escena = leer('escena.js')
main = leer('main.js')
datos = leer('datos.json')
plantillas = json.load(open(os.path.join(AQUI, 'img', 'plantillas.json'), encoding='utf-8'))

# ------------------------------------------------------------------ cordel
ban = plantillas['cordel_banderas']['banderas']
partes = ['<figure class="plantilla" aria-hidden="true">',
          '<img class="cuerda" src="img/plantillas/cordel_cuerda.webp" alt="" loading="lazy" decoding="async">']
for i, b in enumerate(ban):
    dur = 4.0 + ((i * 7) % 5) * 0.45
    dl = -((i * 13) % 9) * 0.55
    partes.append(f'<div class="bandera" style="--x:{b["x"]}%;--y:{b["y"]}%;--w:{b["w"]}%;--h:{b["h"]}%;--ancla:{b["ancla"]}%;'
                  f'--dur:{dur:.2f}s;--del:{dl:.2f}s;--i:{i}"><img src="img/plantillas/bandera_{i}.webp" alt="" loading="lazy" decoding="async"></div>')
partes.append('</figure>')
pagina = pagina.replace('<!--CORDEL-->', ''.join(partes))

# ------------------------------------------------------------------ macizo a escala
MACIZO = [
    ('Everest', 8848.86, 'Hillary y Tenzing, 1953'),
    ('Cima Sur', 8749, 'Bourdillon y Evans, 1953'),
    ('Lhotse', 8516, 'Luchsinger y Reiss, 1956'),
    ('Lhotse Medio', 8414, 'una expedición rusa, 2001'),
    ('Lhotse Shar', 8383, 'Mayerl y Walter, 1970'),
    ('Nuptse', 7861, 'Davis y Tashi Sherpa, 1961'),
    ('Changtse', 7543, 'Udo Zehetleitner, 1982'),
]


def num(v):
    e, _, d = f'{v:.2f}'.partition('.')
    e = re.sub(r'\B(?=(\d{3})+(?!\d))', ' ', e)
    return e + (',' + d if v % 1 else '')


filas = []
for i, (n, v, q) in enumerate(MACIZO):
    filas.append(f'<div class="fila" tabindex="0" style="--v:{v / 9000:.4f};--i:{i}">'
                 f'<span class="n">{H.escape(n)}</span><div class="pista"><div class="barra-m"></div></div>'
                 f'<span class="v dato">{num(v)}</span>'
                 f'<div class="tip">Primera ascensión: {H.escape(q)}</div></div>')
pagina = pagina.replace('<!--MACIZO-->', ''.join(filas))

# ------------------------------------------------------------------ fuentes
from fontTools import subset
from fontTools.ttLib import TTFont

texto_visible = re.sub(r'<[^>]+>', ' ', pagina)
texto_visible = H.unescape(texto_visible)
cadenas_js = ' '.join(re.findall(r"'([^'\\]*)'", main))
d = json.loads(datos)
cadenas_datos = ' '.join(r['t'] + ' ' + r['d'] for v in d['etiquetas'].values() for r in v)
base = ''.join(chr(c) for c in range(0x20, 0x7f)) + ''.join(chr(c) for c in range(0xa0, 0x100))
base += '«»—–‘’“”…·′″°→−×≈ ₂ªº¿¡'
todo = texto_visible + cadenas_js + cadenas_datos + base
tib = ''.join(sorted(set(ch for ch in todo if 0x0f00 <= ord(ch) <= 0x0fff))) + '་།'
deva = ''.join(sorted(set(ch for ch in todo if 0x0900 <= ord(ch) <= 0x097f)))
lat = ''.join(sorted(set(ch for ch in todo if ord(ch) < 0x0900 or 0x1e00 <= ord(ch) <= 0x2bff)))


def woff2(ttf, texto, nombre):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.hinting = False
    f = TTFont(os.path.join(FUENTES, ttf))
    cmap = f.getBestCmap()
    faltan = [c for c in set(texto) if ord(c) not in cmap and c.strip()]
    s = subset.Subsetter(opts)
    s.populate(text=texto)
    s.subset(f)
    b = io.BytesIO()
    f.flavor = 'woff2'
    f.save(b)
    datos_b = b.getvalue()
    print(f'  {nombre:28s} {len(datos_b) / 1024:6.1f} KB' + (f'   sin glifo: {"".join(sorted(faltan))!r}' if faltan else ''))
    return base64.b64encode(datos_b).decode()


print('Fuentes:')
caras = []
for archivo, familia, peso in [('Gotu-Regular.ttf', 'Gotu', '400'), ('Mukta-Light.ttf', 'Mukta', '300'),
                               ('Mukta-Regular.ttf', 'Mukta', '400'), ('Mukta-Medium.ttf', 'Mukta', '500'),
                               ('Mukta-SemiBold.ttf', 'Mukta', '600 700')]:
    texto = lat + (deva if familia == 'Gotu' else '')
    b64 = woff2(archivo, texto, f'{familia} {peso}')
    caras.append(f'@font-face{{font-family:"{familia}";src:url(data:font/woff2;base64,{b64}) format("woff2");font-weight:{peso};font-style:normal;font-display:swap}}')
b64 = woff2('NotoSerifTibetan[wght].ttf', tib + ' ', 'Noto Serif Tibetan')
caras.append(f'@font-face{{font-family:"Noto Serif Tibetan";src:url(data:font/woff2;base64,{b64}) format("woff2");font-weight:100 900;font-display:swap}}')
css = css.replace('/*FUENTES*/', '\n'.join(caras))

# ------------------------------------------------------------------ ensamblar
pagina = pagina.replace('/*ESTILOS*/', css)
pagina = pagina.replace('/*DATOS*/', datos.replace('</', '<\\/'))
pagina = pagina.replace('/*ESCENA*/', escena)
pagina = pagina.replace('/*MAIN*/', main)
for marca in ['/*ESTILOS*/', '/*DATOS*/', '/*ESCENA*/', '/*MAIN*/', '<!--CORDEL-->', '<!--MACIZO-->']:
    assert marca not in pagina, marca
salida = os.path.join(AQUI, 'index.html')
open(salida, 'w', encoding='utf-8').write(pagina)
print(f'index.html: {len(pagina.encode()) / 1024:.0f} KB')
