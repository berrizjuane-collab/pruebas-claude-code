# -*- coding: utf-8 -*-
"""Maqueta el libro «Piratas del Caribe» como HTML paginado (una <section> por página)
listo para imprimir a PDF con Chromium.

Sistema:
  Formato al corte 215,9 × 279,4 mm (carta) + 3 mm de sangrado por lado.
  Márgenes: cabeza 22 · pie 25,3 · lomo (interior) 22 · corte (exterior) 20 mm.
  Retícula modular 6 columnas (25,23 mm, medianil de columna 4,5 mm) × 6 filas
  de 7 líneas sobre línea base de 14 pt (47 líneas por página).
"""
import json, re, sys, os, html, math, random
import pyphen
sys.path.insert(0, os.path.dirname(__file__))
import content as C

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, 'img')
MAN = json.load(open(os.path.join(IMG, 'manifest.json'), encoding='utf-8'))

# ------------------------------------------------------------------ geometría (mm)
TRIM_W, TRIM_H, BLEED = 215.9, 279.4, 3.0
PAGE_W, PAGE_H = TRIM_W + 2 * BLEED, TRIM_H + 2 * BLEED
M_TOP, M_INNER, M_OUTER = 22.0, 22.0, 20.0
PT = 25.4 / 72
LH = 14 * PT                      # interlineado base 14 pt = 4,939 mm
LINES = 47
BLOCK_H = LINES * LH              # 232,13 mm
BLOCK_W = TRIM_W - M_INNER - M_OUTER   # 173,9 mm
GUT = 4.5
COL = (BLOCK_W - 5 * GUT) / 6     # 25,23 mm
ROW = 7 * LH                      # 34,57 mm
ROWGAP = LH
M_BOTTOM = TRIM_H - M_TOP - BLOCK_H

def span_w(n):  # anchura de n columnas
    return n * COL + (n - 1) * GUT
def span_h(n):
    return n * ROW + (n - 1) * ROWGAP

MIN_PPI_PHOTO = 200   # resolución efectiva mínima admitida para raster
MIN_PPI_VECTOR = 300

COLORS = {1: '#1E3D5C', 2: '#1D5550', 3: '#3A3868', 4: '#6A2D28', 5: '#74531C'}
NIGHT = '#0D1722'
NAVY = '#14273C'

# ------------------------------------------------------------------ texto
HY = pyphen.Pyphen(lang='es', left=3, right=3)
WORD = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+")

def hyphenate(text):
    """Inserta guiones blandos en palabras comunes largas (nunca en nombres propios)."""
    out, pos = [], 0
    for m in re.finditer(r"<[^>]+>|&[a-z#0-9]+;|[^<&]+", text):
        tok = m.group(0)
        if tok.startswith('<') or tok.startswith('&'):
            out.append(tok); continue
        def rep(w):
            w = w.group(0)
            if len(w) < 8 or w[0].isupper():
                return w
            return HY.inserted(w, hyphen='­')
        out.append(WORD.sub(rep, tok))
    return ''.join(out)

def nbsp(text):
    # sin cortes tras palabras de una letra ni entre «p.» y la cifra
    text = re.sub(r"(?<![\w>])([aeouyAEOUY]) (?=\w)", r"\1 ", text)
    text = re.sub(r"\bp\. (\d)", r"p. \1", text)
    text = re.sub(r"\bpp\. (\d)", r"pp. \1", text)
    return text

def tie_end(text, k=3):
    """Une con espacios de no separación las k últimas palabras (evita líneas finales cortas)."""
    parts = text.rsplit(' ', k)
    if len(parts) <= k or len(strip_tags(' '.join(parts[1:]))) > 26:
        parts = text.rsplit(' ', 2)
        if len(parts) < 3: return text
        return parts[0] + ' ' + '\u00a0'.join(parts[1:])
    return parts[0] + ' ' + '\u00a0'.join(parts[1:])

def prose(text, tie=True):
    t = nbsp(text)
    if tie: t = tie_end(t)
    return hyphenate(t)

def strip_tags(s):
    return re.sub(r"<[^>]+>", "", s)

# ------------------------------------------------------------------ plan de páginas
FRONT = {1: 'portadilla', 2: 'frontis', 3: 'portada', 4: 'indice_a', 5: 'indice_b',
         6: 'intro', 7: 'como', 8: 'personajes', 9: 'cronologia'}
CH_START = {f['num']: 10 + 12 * (f['num'] - 1) for f in C.FILMS}
OFF = dict(opener=0, ficha=1, quien=2, s1=3, s2=4, s3=5, clave_v=6, clave_r=7, s4=8, s5=9, s6=10, reflexion=11)
SCENE_OFF = {1: 3, 2: 4, 3: 5, 4: 8, 5: 9, 6: 10}
BACK = {70: 'epilogo', 71: 'analitico', 72: 'colofon'}
TOTAL = 72

def page_of(num, part):
    return CH_START[num] + OFF[part]
def scene_page(num, n):
    return CH_START[num] + SCENE_OFF[n]

# ------------------------------------------------------------------ índice analítico (se calcula antes de maquetar)
def page_texts():
    """Texto que aparece en cada página, para localizar los términos del índice."""
    t = {}
    t[6] = ' '.join(C.INTRO) + ' ' + C.SPOILER
    t[8] = ' '.join(n + ' ' + r + ' ' + d for n, r, d, _ in C.SAGA_CHARACTERS)
    t[9] = ' '.join(f['title'] + ' ' + f['logline'] for f in C.FILMS)
    for f in C.FILMS:
        n = f['num']
        t[page_of(n, 'ficha')] = f['title'] + ' ' + f['logline']
        t[page_of(n, 'quien')] = ' '.join(a + ' ' + b for a, b in f['who'])
        for i, s in enumerate(f['scenes'], 1):
            extra = (' ' + s['note'][0] + ' ' + s['note'][1]) if s.get('note') else ''
            t[scene_page(n, i)] = s['title'] + ' ' + s['text'] + extra + ' ' + s['fig'][1]
        t[page_of(n, 'clave_v')] = f['clave']['quote']
        t[page_of(n, 'clave_r')] = f['clave']['cap']
        t[page_of(n, 'reflexion')] = f['reflection']['quote'] + ' ' + f['reflection']['text']
    t[70] = ' '.join(C.EPILOGUE)
    return {k: strip_tags(v) for k, v in t.items()}

def find_terms(text):
    hits = []
    # «Cofre de Davy Jones» es un lugar: no cuenta como mención del personaje
    text_char = re.sub(r"Cofre de Davy Jones", "", text)
    for entry, cat, pats in C.INDEX_TERMS:
        src = text if cat else text_char
        if entry == 'Jones, Davy':
            src = text_char
        if any(re.search(p, src) for p in pats):
            hits.append((entry, cat))
    return hits

PT_TEXT = page_texts()
INDEX = {}
for pg, txt in PT_TEXT.items():
    for entry, cat in find_terms(txt):
        INDEX.setdefault((entry, cat), set()).add(pg)
# entradas principales (en negrita): fichas de personaje
MAIN = {}
def char_entry(name):
    m = {'Jack Sparrow': 'Sparrow, Jack', 'Will Turner': 'Turner, Will', 'Elizabeth Swann': 'Swann, Elizabeth',
         'Héctor Barbossa': 'Barbossa, Héctor', 'Davy Jones': 'Jones, Davy', 'Cutler Beckett': 'Beckett, Cutler',
         'Bill Turner': 'Turner, Bill', 'Tía Dalma': 'Tía Dalma', 'Sao Feng': 'Sao Feng', 'Calypso': 'Calypso',
         'Capitán Teague': 'Teague, capitán', 'Angélica': 'Angélica', 'Barbanegra': 'Barbanegra',
         'Syrena y Philip': None, 'Armando Salazar': 'Salazar, Armando', 'Henry Turner': 'Turner, Henry',
         'Carina Smyth': 'Smyth, Carina'}
    return m.get(name)
for f in C.FILMS:
    for name, _ in f['who']:
        for e in ([char_entry(name)] if char_entry(name) else ['Syrena', 'Philip']):
            MAIN.setdefault(e, set()).add(page_of(f['num'], 'quien'))
for name, *_ in C.SAGA_CHARACTERS:
    MAIN.setdefault(char_entry(name), set()).add(8)

def scene_refs(num, i):
    """Personajes, lugares y naves/objetos que aparecen en una escena (para la columna de datos)."""
    s = C.FILMS[num - 1]['scenes'][i - 1]
    txt = strip_tags(s['title'] + ' ' + s['text'])
    hits = find_terms(txt)
    def nice(e):
        if ', ' in e:
            a, b = e.split(', ', 1)
            if b[0].islower():
                return a + ' (' + b + ')' if b in ('rey', 'capitán', 'bahía de', 'Corte de la') else b + ' ' + a
            return b + ' ' + a
        return e
    out = {'Personajes': [], 'Lugares': [], 'Naves y objetos': [], 'Criaturas': []}
    for e, cat in hits:
        label = nice(e)
        if e == 'Teague, capitán': label = 'Capitán Teague'
        if e == 'Jorge, rey': label = 'Rey Jorge'
        if e == 'Whitecap, bahía de': label = 'Bahía de Whitecap'
        if e == 'Hermandad, Corte de la': label = 'Corte de la Hermandad'
        if cat == '':
            out['Personajes'].append(label)
        elif cat == 'lugar':
            out['Lugares'].append(label)
        elif cat == 'criatura':
            out['Criaturas'].append(label)
        else:
            out['Naves y objetos'].append(('<i>%s</i>' % label) if cat == 'nave' else label)
    return out

# ------------------------------------------------------------------ SVG: emblemas y decoraciones
def svg_ship(c, w=40):
    return f'''<svg viewBox="0 0 120 100" width="{w}mm" height="{w*100/120}mm" aria-hidden="true">
<path d="M8 72 L112 72 L98 86 L22 86 Z" fill="{c}"/><path d="M4 66 L30 72 L8 72 Z" fill="{c}"/>
<rect x="58" y="10" width="3.2" height="62" fill="{c}"/><rect x="33" y="30" width="2.6" height="42" fill="{c}"/><rect x="84" y="34" width="2.6" height="38" fill="{c}"/>
<path d="M59.6 14 C40 26 40 52 59.6 64 C79 52 79 26 59.6 14 Z" fill="{c}"/>
<path d="M34.3 34 C22 42 22 58 34.3 66 C46 58 46 42 34.3 34 Z" fill="{c}"/>
<path d="M85.3 38 C75 45 75 58 85.3 65 C95 58 95 45 85.3 38 Z" fill="{c}"/>
<path d="M60 8 l10 3 -10 3 z" fill="{c}"/></svg>'''

def svg_chest(c, w=40):
    return f'''<svg viewBox="0 0 120 100" width="{w}mm" height="{w*100/120}mm" aria-hidden="true">
<path d="M16 46 C16 22 104 22 104 46 Z" fill="{c}"/><rect x="16" y="48" width="88" height="40" rx="3" fill="{c}"/>
<rect x="16" y="46" width="88" height="5" fill="none" stroke="#F6F1E6" stroke-opacity=".55" stroke-width="1.6"/>
<rect x="31" y="27" width="5" height="61" fill="#F6F1E6" fill-opacity=".35"/><rect x="84" y="27" width="5" height="61" fill="#F6F1E6" fill-opacity=".35"/>
<rect x="53" y="50" width="14" height="17" rx="2" fill="#F6F1E6" fill-opacity=".8"/><circle cx="60" cy="57" r="2.4" fill="{c}"/><rect x="59" y="58" width="2" height="5" fill="{c}"/></svg>'''

def svg_compass(c, w=40, ring=True):
    pts = []
    for k in range(16):
        ang = math.radians(k * 22.5 - 90)
        r = 46 if k % 4 == 0 else (30 if k % 2 == 0 else 13)
        pts.append(f"{60 + r * math.cos(ang):.2f},{50 + r * math.sin(ang):.2f}")
    ringsvg = f'<circle cx="60" cy="50" r="36" fill="none" stroke="{c}" stroke-width="1.1"/><circle cx="60" cy="50" r="22" fill="none" stroke="{c}" stroke-width=".8"/>' if ring else ''
    return f'''<svg viewBox="0 0 120 100" width="{w}mm" height="{w*100/120}mm" aria-hidden="true">{ringsvg}
<polygon points="{' '.join(pts)}" fill="{c}"/></svg>'''

def svg_chalice(c, w=40):
    return f'''<svg viewBox="0 0 120 100" width="{w}mm" height="{w*100/120}mm" aria-hidden="true">
<path d="M34 10 L86 10 C86 40 74 52 60 52 C46 52 34 40 34 10 Z" fill="{c}"/>
<rect x="57.5" y="50" width="5" height="30" fill="{c}"/><ellipse cx="60" cy="84" rx="20" ry="5" fill="{c}"/>
<path d="M60 22 C56 28 55 32 60 35 C65 32 64 28 60 22 Z" fill="#F6F1E6" fill-opacity=".7"/></svg>'''

def svg_trident(c, w=40):
    return f'''<svg viewBox="0 0 120 100" width="{w}mm" height="{w*100/120}mm" aria-hidden="true">
<rect x="58" y="14" width="4" height="82" fill="{c}"/>
<path d="M36 38 C36 56 84 56 84 38" fill="none" stroke="{c}" stroke-width="4"/>
<rect x="34" y="18" width="4" height="22" fill="{c}"/><rect x="82" y="18" width="4" height="22" fill="{c}"/>
<path d="M36 6 L30 20 L42 20 Z M60 2 L54 16 L66 16 Z M84 6 L78 20 L90 20 Z" fill="{c}"/></svg>'''

EMBLEM = {1: svg_ship, 2: svg_chest, 3: svg_compass, 4: svg_chalice, 5: svg_trident}

def svg_waves(w_mm, h_mm, cols):
    """Tres bandas de olas superpuestas (eco de las portadillas originales)."""
    paths = []
    W = 1000; H = 200
    for k, (col, y0, amp, per) in enumerate(cols):
        d = f"M0 {y0}"
        n = int(W / per) + 2
        for i in range(n):
            x0 = i * per
            d += f" Q {x0 + per/4:.1f} {y0 - amp:.1f} {x0 + per/2:.1f} {y0:.1f} T {x0 + per:.1f} {y0:.1f}"
        d += f" L {W} {H} L 0 {H} Z"
        paths.append(f'<path d="{d}" fill="{col}"/>')
    return f'<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" width="{w_mm}mm" height="{h_mm}mm" aria-hidden="true">{"".join(paths)}</svg>'

def svg_stars(seed, w_mm, h_mm, n=70):
    rnd = random.Random(seed)
    dots = []
    for _ in range(n):
        x = rnd.uniform(0, 1000); y = rnd.uniform(0, 1000) ** 1.25 / 1000 ** 0.25
        r = rnd.choice([0.9, 1.1, 1.3, 1.6, 2.2])
        o = rnd.uniform(.35, .9)
        dots.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="#F3E9CF" fill-opacity="{o:.2f}"/>')
    return f'<svg viewBox="0 0 1000 1000" preserveAspectRatio="none" width="{w_mm}mm" height="{h_mm}mm" aria-hidden="true">{"".join(dots)}</svg>'

def shade(hexc, f):
    hexc = hexc.lstrip('#'); r, g, b = (int(hexc[i:i+2], 16) for i in (0, 2, 4))
    return '#%02X%02X%02X' % tuple(max(0, min(255, int(v * f))) for v in (r, g, b))

# ------------------------------------------------------------------ figuras
QA_IMAGES = []

def fig_size(fname, max_w, max_h):
    m = MAN[fname]
    vector = 'vectorial' in m['kind'] or 'render' in m['kind']
    min_ppi = MIN_PPI_VECTOR if vector else MIN_PPI_PHOTO
    w_ppi = m['w'] / min_ppi * 25.4
    w = min(max_w, w_ppi)
    h = w * m['h'] / m['w']
    if h > max_h:
        h = max_h; w = h * m['w'] / m['h']
    return w, h, m

FIG_NO = {}
PLATED = {'IV-3_calices.png'}
def figure(fname, label, desc, src, max_w, max_h, page, multiply=False, dark=False, caption_w=None, align='start', plate=None):
    w, h, m = fig_size(fname, max_w, max_h)
    ppi = m['w'] / (w / 25.4)
    QA_IMAGES.append(dict(page=page, file=fname, px=f"{m['w']}x{m['h']}", w_mm=round(w, 1), h_mm=round(h, 1),
                          ppi=round(ppi), ratio_ok=abs((w / h) - (m['w'] / m['h'])) < 0.002, kind=m['kind']))
    cw = caption_w or max(w, span_w(2))
    cls = 'fig' + (' dark' if dark else '')
    blend = 'mix-blend-mode:multiply;' if multiply else ''
    return (f'<figure class="{cls}" style="justify-self:{align}">'
            + (f'<div class="plate" style="background:{plate};padding:6mm {6}mm">' if plate else '')
            + f'<img src="img/{fname}" style="width:{w:.2f}mm;height:{h:.2f}mm;{blend}" alt="">'
            + ('</div>' if plate else '')
            + f''
            f'<figcaption style="width:{cw:.2f}mm"><b>{label}</b> {desc} <span class="src">{src}.</span></figcaption></figure>')

# ------------------------------------------------------------------ piezas comunes
def side_of(folio):
    return 'recto' if folio % 2 else 'verso'

def text_cols(side):
    return (1, 5) if side == 'recto' else (3, 7)
def marg_cols(side):
    return (5, 7) if side == 'recto' else (1, 3)

def area(c, r, cls='', inner='', style=''):
    return f'<div class="{cls}" style="grid-column:{c[0]}/{c[1]};grid-row:{r[0]}/{r[1]};{style}">{inner}</div>'

def tab_html(num, side, light=False):
    top = 34 + (num - 1) * 42
    bg = '#C9A45C' if light else COLORS[num]
    fg = NIGHT if light else '#F6F1E6'
    vis = 10.0
    left = (PAGE_W - vis - BLEED) if side == 'recto' else 0
    pad = 'padding-left:3mm' if side == 'verso' else 'padding-right:3mm'
    return (f'<div class="tab" style="top:{BLEED + top}mm;left:{left}mm;width:{vis + BLEED}mm;'
            f'height:36mm;background:{bg};color:{fg};{pad}">{C.FILMS[num-1]["roman"]}</div>')

def cornisa(side, text, folio, dark=False):
    cls = 'cornisa dark' if dark else 'cornisa'
    left = BLEED + (M_INNER if side == 'recto' else M_OUTER)
    folio_html = f'<span class="folio">{folio}</span>'
    txt = f'<span class="rh">{text}</span>' if text else '<span class="rh"></span>'
    inner = (folio_html + txt) if side == 'verso' else (txt + folio_html)
    return f'<div class="{cls} {side}" style="left:{left}mm;width:{BLOCK_W}mm">{inner}</div>'

def page(folio, body, *, rh=None, ch=None, dark=False, bg=None, tab_light=False, no_head=False, extra_cls=''):
    side = side_of(folio)
    left = BLEED + (M_INNER if side == 'recto' else M_OUTER)
    style = f'background:{bg};' if bg else ''
    out = [f'<section id="p{folio}" class="page {side} {"dark" if dark else "light"} {extra_cls}" data-folio="{folio}" style="{style}">']
    out.append(body.get('under', ''))
    if not no_head:
        out.append(cornisa(side, rh, folio, dark))
    if ch:
        out.append(tab_html(ch, side, tab_light))
    out.append(f'<div class="block" style="top:{BLEED + M_TOP}mm;left:{left}mm">{body.get("grid", "")}</div>')
    out.append(body.get('over', ''))
    out.append('</section>')
    return '\n'.join(out)

def rh_chapter(f):
    return f'Película {f["roman"]} · {f["title_html"]}'

def label(text, color=None):
    st = f' style="color:{color}"' if color else ''
    return f'<div class="label"{st}>{text}</div>'

def head(lbl, title, color, side, cols=None, rule=True):
    c = cols or text_cols(side)
    inner = label(lbl, color) + f'<h2>{title}</h2>' + ('<div class="hrule"></div>' if rule else '')
    return area(c, (1, 2), 'head', inner)

def dots(n, total, color):
    s = ''.join(f'<span class="dot{" on" if i == n else ""}" style="{"background:" + color if i <= n else "border-color:" + color}"></span>' for i in range(1, total + 1))
    return f'<div class="dots" title="Escena {n} de {total}">{s}</div>'

# ------------------------------------------------------------------ páginas de capítulo
def p_opener(f):
    n = f['num']; fo = page_of(n, 'opener'); col = COLORS[n]
    under = (f'<div class="full stars">{svg_stars(n * 11, PAGE_W, PAGE_H * 0.62)}</div>'
             f'<div class="full waves" style="top:{PAGE_H - 52}mm">{svg_waves(PAGE_W, 52, [(shade(col, .78), 40, 14, 160), (shade(col, .6), 95, 12, 190), (shade(col, .45), 150, 10, 220)])}</div>')
    toc = [('Ficha técnica', page_of(n, 'ficha')), ('Quién es quién', page_of(n, 'quien'))]
    for i, s in enumerate(f['scenes'], 1):
        toc.append((f'{i} · {s["title"]}', scene_page(n, i)))
        if i == 3:
            toc.append(('Escena clave', page_of(n, 'clave_v')))
    toc.append(('Reflexión', page_of(n, 'reflexion')))
    toc_html = ''.join(f'<li><a href="#p{p}"><span>{t}</span><span class="pg">{p}</span></a></li>' for t, p in toc)
    grid = (area((1, 7), (1, 3), 'op-num', f'<div class="label gold">Película</div><div class="numeral">{f["roman"]}</div>')
            + area((1, 6), (3, 4), 'op-title', f'<h1>{f["title_html"]}</h1><div class="year">{f["year"]}</div>')
            + area((5, 7), (1, 3), 'op-emblem', EMBLEM[n]('#C9A45C', 34))
            + area((1, 5), (4, 6), 'op-toc', f'<div class="label gold">En este capítulo</div><ol class="mini-toc">{toc_html}</ol>'))
    return page(fo, dict(under=under, grid=grid), ch=n, dark=True, bg=col, tab_light=True, rh='')

def p_ficha(f):
    n = f['num']; fo = page_of(n, 'ficha'); side = side_of(fo); col = COLORS[n]
    rows = [('Año de estreno', str(f['year'])), ('Título original', f'<i>{f["original"]}</i>'),
            ('Dirección', f['director']), ('Música', f['music']),
            ('Producción', 'Walt Disney Pictures · Jerry Bruckheimer Films'),
            ('Reparto principal', f['cast']), ('Ambientación', f['setting'])]
    def keep_names(v):
        return ', '.join(x.strip().replace(' ', '\u00a0') for x in v.split(','))
    dl = ''.join(f'<dt style="color:{col}">{a}</dt><dd>{keep_names(b) if a == "Reparto principal" else b}</dd>' for a, b in rows)
    saga = ''.join(
        f'<div class="saga-node{" on" if g["num"] == n else ""}" style="--c:{COLORS[g["num"]]}">'
        f'<span class="sn-r">{g["roman"]}</span><span class="sn-y">{g["year"]}</span>'
        f'<span class="sn-p">p. {page_of(g["num"], "opener")}</span></div>' for g in C.FILMS)
    grid = (head(f'Película {f["roman"]} · Ficha técnica', f['title_html'], col, side)
            + area(text_cols(side), (2, 5), 'ficha', f'<dl>{dl}</dl>')
            + area(text_cols(side), (5, 6), 'sinopsis', f'<div class="label" style="color:{col}">Sinopsis</div><p class="logline">{prose(f["logline"])}</p>')
            + area(marg_cols(side), (1, 3), 'emblem-box', EMBLEM[n](col, 40) + f'<div class="emb-cap">Película {n} de 5<br>{f["year"]}</div>')
            + area((1, 7), (6, 7), 'saga', f'<div class="label">La saga de un vistazo</div><div class="saga-line">{saga}</div>'))
    return page(fo, dict(grid=grid), ch=n, rh='Ficha técnica')

def scenes_of_char(f, name):
    first = name.split(' y ')[0]
    pats = {'Cutler Beckett': r'\bBeckett\b', 'Héctor Barbossa': r'\bBarbossa\b', 'Capitán Teague': r'\bTeague\b',
            'Armando Salazar': r'\bSalazar\b', 'Davy Jones': r'\bJones\b', 'Bill Turner': r'\bBill Turner\b',
            'Syrena y Philip': r'\b(Syrena|Philip)\b', 'Tía Dalma': r'\bTía Dalma\b', 'Sao Feng': r'\bSao Feng\b',
            'Henry Turner': r'\bHenry\b', 'Carina Smyth': r'\bCarina\b', 'Calypso': r'\bCalypso\b'}
    pat = pats.get(name, r'\b' + first.split()[0] + r'\b')
    out = []
    for i, s in enumerate(f['scenes'], 1):
        t = strip_tags(s['text']).replace('Cofre de Davy Jones', '')
        if re.search(pat, t):
            out.append((i, scene_page(f['num'], i)))
    return out

def appears(name, current, colorful=True):
    ap = C.APPEARS.get(name, [])
    spans = []
    for g in C.FILMS:
        on = g['num'] in ap
        st = f'background:{COLORS[g["num"]]};color:#F6F1E6' if on and (g['num'] == current or current == 0) else ('color:' + COLORS[g['num']] + ';border-color:' + COLORS[g['num']] if on else '')
        spans.append(f'<span class="ap{" on" if on else " off"}" style="{st}">{g["roman"]}</span>')
    return f'<div class="appears"><span class="ap-l">Aparece en</span>{"".join(spans)}</div>'

def p_quien(f):
    n = f['num']; fo = page_of(n, 'quien'); side = side_of(fo); col = COLORS[n]
    cards = []
    pos = [((1, 4), (2, 4)), ((4, 7), (2, 4)), ((1, 4), (4, 6)), ((4, 7), (4, 6))]
    for (name, desc), (c, r) in zip(f['who'], pos):
        sc = scenes_of_char(f, name)
        refs = ', '.join(f'{i} (p. {p})' for i, p in sc) if sc else '—'
        inner = (f'<h3>{name}</h3>{appears(name, n)}<p>{prose(desc)}</p>'
                 f'<div class="xref"><span>En este capítulo, escenas:</span> {refs}</div>')
        cards.append(area(c, r, 'card', inner))
    note = (f'<div class="legend">Las cifras romanas indican en qué películas aparece cada personaje; la destacada es la de este capítulo. '
            f'Los protagonistas de toda la saga se presentan en la p. 8.</div>')
    grid = (head(f'Película {f["roman"]} · Personajes clave', 'Quién es quién', col, side, cols=(1, 7))
            + ''.join(cards) + area((1, 5), (6, 7), 'legend-box', note))
    return page(fo, dict(grid=grid), ch=n, rh=rh_chapter(f))

def p_scene(f, i):
    n = f['num']; s = f['scenes'][i - 1]; fo = scene_page(n, i); side = side_of(fo); col = COLORS[n]
    tc, mc = text_cols(side), marg_cols(side)
    refs = scene_refs(n, i)
    data = ''.join(f'<div class="dgroup"><div class="dlabel">{k}</div><div class="dval">{"<br>".join(v)}</div></div>' for k, v in refs.items() if v)
    data += f'<div class="dgroup"><div class="dlabel">Véase</div><div class="dval">Quién es quién, p. {page_of(n, "quien")}</div></div>'
    marg = f'<div class="datos"><div class="label" style="color:{col}">En esta escena</div>{data}</div>'
    if s.get('note'):
        nt, nx = s['note']
        marg += f'<aside class="nota" style="border-color:{col}"><div class="label" style="color:{col}">Nota</div><h4>{nt}</h4><p>{prose(nx)}</p></aside>'
    fname, desc, src = s['fig']
    multiply = fname.endswith('.jpg') and 'multiplicar' in MAN[fname]['kind']
    est_lines = math.ceil(len(strip_tags(s['text'])) / 60)
    r_fig = 3 if est_lines <= 7 else 4
    plate = shade(COLORS[n], .55) if fname in PLATED else None
    mw = span_w(4) - (12 if plate else 0)
    fig = figure(fname, f'Fig. {f["roman"]}·{i}', desc, src, mw, span_h(7 - r_fig) - 14 - (12 if plate else 0), fo, multiply=multiply, plate=plate)
    grid = (head(f'Película {f["roman"]} · Escena {i} de 6', s['title'], col, side)
            + area(mc, (1, 2), 'dots-box', dots(i, 6, col))
            + area(tc, (2, r_fig), 'body', f'<p>{prose(s["text"])}</p>')
            + area(tc, (r_fig, 7), 'figarea', fig)
            + area(mc, (2, 7), 'marg', marg))
    return page(fo, dict(grid=grid), ch=n, rh=f'Escena {i} · {s["title"]}' if side == 'recto' else rh_chapter(f))

def p_clave_v(f):
    n = f['num']; fo = page_of(n, 'clave_v'); col = COLORS[n]; k = f['clave']
    under = f'<div class="full stars">{svg_stars(n * 31, PAGE_W, PAGE_H * 0.8, 55)}</div>'
    s3, s4 = f['scenes'][2]['title'], f['scenes'][3]['title']
    grid = (area((3, 7), (1, 2), 'kv-label', label('Escena clave', '#C9A45C'))
            + area((3, 7), (2, 5), 'kv-quote', f'<blockquote>«{prose(k["quote"])}»</blockquote>')
            + area((3, 7), (5, 6), 'kv-ctx', f'<div class="label gold">Entre la escena 3 y la 4</div><p>De «{s3}» (p. {scene_page(n, 3)}) a «{s4}» (p. {scene_page(n, 4)}). La lámina de la página siguiente ilustra el momento.</p>'))
    return page(fo, dict(under=under, grid=grid), ch=n, dark=True, bg=shade(col, .82), tab_light=True, rh='')

def p_clave_r(f):
    n = f['num']; fo = page_of(n, 'clave_r'); k = f['clave']
    fig = figure(k['img'], f'Lámina {f["roman"]}', k['cap'], k['src'], span_w(4), span_h(4), fo, dark=True, caption_w=span_w(4))
    grid = area((2, 6), (1, 6), 'lamina', fig)
    return page(fo, dict(grid=grid), ch=n, dark=True, bg=NIGHT, tab_light=True, rh='')

def p_reflexion(f):
    n = f['num']; fo = page_of(n, 'reflexion'); side = side_of(fo); col = COLORS[n]
    r = f['reflection']
    nxt = C.FILMS[n] if n < 5 else None
    nav = (f'Siguiente: <b>Película {nxt["roman"]} · {nxt["title_html"]}</b>, p. {page_of(nxt["num"], "opener")}' if nxt
           else f'Siguiente: <b>Epílogo</b>, p. 70')
    grid = (head(f'Película {f["roman"]} · Reflexión', 'Lo que deja la película', col, side)
            + area(text_cols(side), (2, 3), 'rquote', f'<blockquote style="border-color:{col}">«{prose(r["quote"])}»</blockquote>')
            + area(text_cols(side), (3, 5), 'body', f'<p>{prose(r["text"])}</p>')
            + area(text_cols(side), (5, 6), 'vignette', EMBLEM[n](col, 26))
            + area(text_cols(side), (6, 7), 'endnav', f'<div class="hrule"></div><div class="label" style="color:{col}">Fin de la película {f["roman"]}</div><p>{nav}</p>'))
    return page(fo, dict(grid=grid), ch=n, rh='Reflexión')

# ------------------------------------------------------------------ preliminares
def p_portadilla():
    grid = area((1, 7), (3, 5), 'center', svg_compass(NAVY, 22, ring=True) + f'<div class="half-title">{C.BOOK_TITLE}</div>')
    return page(1, dict(grid=grid), no_head=True)

def p_frontis():
    under = f'<img class="full-img" src="img/art_contracubierta.jpg" alt="">'
    MAN_ = MAN['art_contracubierta.jpg']
    QA_IMAGES.append(dict(page=2, file='art_contracubierta.jpg', px=f"{MAN_['w']}x{MAN_['h']}", w_mm=PAGE_W, h_mm=round(PAGE_W * MAN_['h'] / MAN_['w'], 1),
                          ppi=round(MAN_['w'] / (PAGE_W / 25.4)), ratio_ok=True, kind=MAN_['kind']))
    return page(2, dict(under=under), no_head=True, dark=True, bg=NAVY)

def p_portada():
    grid = (area((1, 7), (1, 3), 'center-b', svg_compass(COLORS[1], 46))
            + area((1, 7), (3, 5), 'title-page',
                   f'<h1>{C.BOOK_TITLE.upper()}</h1><div class="subtitle">{C.BOOK_SUB}</div><div class="rule-c"></div>'
                   f'<div class="tp-desc">Crónica ilustrada de la saga cinematográfica</div>')
            + area((1, 7), (6, 7), 'center-e', '<div class="tp-ed">Edición no oficial de aficionados</div>'))
    return page(3, dict(grid=grid), no_head=True)

def toc_block(f):
    n = f['num']; col = COLORS[n]
    items = [('Portadilla y ficha técnica', page_of(n, 'opener')), ('Quién es quién', page_of(n, 'quien'))]
    for i, s in enumerate(f['scenes'], 1):
        items.append((f'Escena {i} · {s["title"]}', scene_page(n, i)))
        if i == 3:
            items.append(('Escena clave', page_of(n, 'clave_v')))
    items.append(('Reflexión', page_of(n, 'reflexion')))
    li = ''.join(f'<li><a href="#p{p}"><span class="t">{t}</span><span class="lead"></span><span class="pg">{p}</span></a></li>' for t, p in items)
    return (f'<div class="toc-film"><div class="toc-h"><span class="sq" style="background:{col}">{f["roman"]}</span>'
            f'<a href="#p{page_of(n, "opener")}"><span class="t">{f["title_html"]} <span class="yr">({f["year"]})</span></span><span class="lead"></span><span class="pg">{page_of(n, "opener")}</span></a></div>'
            f'<ol class="toc-sub">{li}</ol></div>')

def toc_simple(title, items):
    li = ''.join(f'<li><a href="#p{p}"><span class="t">{t}</span><span class="lead"></span><span class="pg">{p}</span></a></li>' for t, p in items)
    return f'<div class="toc-group"><div class="toc-gh">{title}</div><ol class="toc-sub">{li}</ol></div>'

def p_indice_a():
    pre = toc_simple('Preliminares', [('Introducción', 6), ('Cómo consultar este libro', 7), ('Los personajes de la saga', 8), ('Cronología de la saga', 9)])
    grid = (head('Contenido', 'Índice', COLORS[1], 'verso', cols=(1, 7))
            + area((1, 7), (2, 7), 'toc', pre + toc_block(C.FILMS[0]) + toc_block(C.FILMS[1])))
    return page(4, dict(grid=grid), rh='Piratas del Caribe')

def p_indice_b():
    ap = toc_simple('Apéndices', [('Epílogo', 70), ('Índice analítico', 71), ('Colofón y créditos', 72)])
    grid = area((1, 7), (1, 7), 'toc', toc_block(C.FILMS[2]) + toc_block(C.FILMS[3]) + toc_block(C.FILMS[4]) + ap)
    return page(5, dict(grid=grid), rh='Índice')

def p_intro():
    side = 'verso'
    paras = ''.join(f'<p>{prose(t)}</p>' for t in C.INTRO)
    grid = (head('Antes de zarpar', 'Introducción', COLORS[1], side)
            + area(text_cols(side), (2, 6), 'body intro', paras)
            + area(marg_cols(side), (2, 4), 'marg', f'<aside class="nota" style="border-color:{COLORS[4]}"><div class="label" style="color:{COLORS[4]}">Aviso</div><h4>Contiene los finales</h4><p>{prose(C.SPOILER)}</p></aside>'))
    return page(6, dict(grid=grid), rh='Piratas del Caribe')

def p_como():
    side = 'recto'; col = COLORS[2]
    # maqueta esquemática de una página de escena, con llamadas numeradas
    sc = 0.385
    def box(x, y, w, h, cls, txt=''):
        return f'<div class="sk {cls}" style="left:{x*sc}mm;top:{y*sc}mm;width:{w*sc}mm;height:{h*sc}mm">{txt}</div>'
    def call(x, y, n):
        return f'<div class="callout" style="left:{x*sc}mm;top:{y*sc}mm">{n}</div>'
    bx = M_INNER; by = M_TOP
    sk = (box(0, 0, TRIM_W, TRIM_H, 'sk-page')
          + box(TRIM_W - 10, 76, 10, 36, 'sk-tab', 'II')
          + box(bx, 11, BLOCK_W - 8, 0.6, 'sk-rule') + box(bx, 7, 60, 3, 'sk-rh') + box(TRIM_W - M_OUTER - 6, 6.5, 6, 4, 'sk-folio', '25')
          + box(bx, by, span_w(2), 3, 'sk-label') + box(bx, by + 6, span_w(3), 9, 'sk-title')
          + box(TRIM_W - M_OUTER - span_w(2), by + 2, span_w(2), 3, 'sk-dots')
          + ''.join(box(bx, by + ROW + ROWGAP + k * 5, span_w(4) - (12 if k == 9 else 0), 2.2, 'sk-line') for k in range(10))
          + box(bx, by + 3 * (ROW + ROWGAP) + 6, span_w(3), 80, 'sk-fig') + box(bx, by + 3 * (ROW + ROWGAP) + 90, span_w(3), 8, 'sk-cap')
          + box(TRIM_W - M_OUTER - span_w(2), by + ROW + ROWGAP, span_w(2), 46, 'sk-data')
          + box(TRIM_W - M_OUTER - span_w(2), by + ROW + ROWGAP + 52, span_w(2), 40, 'sk-note')
          + call(TRIM_W - 13, 92, 1) + call(bx + 62, 5, 2) + call(TRIM_W - M_OUTER - 20, 4.5, 3) + call(bx + span_w(2) + 2, by - 1, 4)
          + call(bx + span_w(3) + 2, by + 6, 5) + call(bx + span_w(4) - 8, by + ROW + ROWGAP + 20, 6) + call(bx + span_w(3) + 2, by + 3 * (ROW + ROWGAP) + 40, 7)
          + call(TRIM_W - M_OUTER - 9, by + ROW + ROWGAP + 20, 8) + call(TRIM_W - M_OUTER - 9, by + ROW + ROWGAP + 70, 9))
    legend = [
        ('Pestaña de color', 'Cada película tiene un color y una altura propios en el borde exterior: con el libro cerrado se ven en el canto y permiten abrir directamente el capítulo.'),
        ('Cornisa', 'En la página par, la película; en la impar, la sección o escena que se consulta.'),
        ('Folio', 'Siempre en la esquina exterior superior, junto a la cornisa, para localizarlo al hojear.'),
        ('Etiqueta y progreso', 'Película, número de escena y seis puntos que indican en qué parte del relato estamos.'),
        ('Título de la entrada', 'Mismo cuerpo, posición y filete en todas las entradas.'),
        ('Texto', 'Caslon de 10,5/14 pt, en bandera, sobre la línea base de la retícula.'),
        ('Figura y pie', 'Numerada por película (Fig. II·4), con descripción, técnica y procedencia. Ninguna imagen está deformada.'),
        ('En esta escena', 'Personajes, lugares, naves y objetos citados, con remisión a «Quién es quién».'),
        ('Notas', 'Ampliaciones y curiosidades, siempre en la columna exterior.'),
    ]
    leg = ''.join(f'<li><span class="cn">{k}</span><b>{t}.</b> {prose(d)}</li>' for k, (t, d) in enumerate(legend, 1))
    strip = []
    parts = [('Portadilla', 'd'), ('Ficha', ''), ('Quién', ''), ('Esc. 1', ''), ('Esc. 2', ''), ('Esc. 3', ''), ('Clave', 'd'), ('Lámina', 'd'), ('Esc. 4', ''), ('Esc. 5', ''), ('Esc. 6', ''), ('Reflexión', '')]
    for k in range(0, 12, 2):
        a, b = parts[k], parts[k + 1]
        strip.append(f'<div class="spread"><div class="mp {a[1]}">{a[0]}</div><div class="mp {b[1]}">{b[0]}</div></div>')
    colors = ''.join(f'<li><span class="sq" style="background:{COLORS[g["num"]]}">{g["roman"]}</span><span class="ct-t"><i>{g["title"]}</i>, p.\u00a0{page_of(g["num"], "opener")}</span></li>' for g in C.FILMS)
    grid = (head('Guía de uso', 'Cómo consultar este libro', col, side)
            + area((1, 4), (2, 6), 'sketch', f'<div class="sk-wrap" style="width:{TRIM_W*sc}mm;height:{TRIM_H*sc}mm">{sk}</div>')
            + area((4, 7), (2, 6), 'legend-list', f'<ol class="how">{leg}</ol>')
            + area((1, 5), (5, 7), 'struct', f'<div class="label" style="color:{col}">Cada capítulo: 12 páginas, 6 pliegos</div><div class="strip">{"".join(strip)}</div>')
            + area((5, 7), (5, 7), 'colors', f'<div class="label" style="color:{col}">Colores de las películas</div><ul class="colors">{colors}</ul>'))
    return page(7, dict(grid=grid), rh='Cómo consultar este libro')

def p_personajes():
    side = 'verso'
    pos = [((1, 4), (2, 4)), ((4, 7), (2, 4)), ((1, 4), (4, 6)), ((4, 7), (4, 6))]
    cards = []
    for (name, role, desc, films), (c, r) in zip(C.SAGA_CHARACTERS, pos):
        fichas = [page_of(g['num'], 'quien') for g in C.FILMS if any(w[0] == name for w in g['who'])]
        ref = ('Fichas en «Quién es quién»: ' + ', '.join(f'p. {p}' for p in fichas)) if fichas else ''
        cards.append(area(c, r, 'card big', f'<h3>{name}</h3><div class="role">{role}</div>{appears(name, 0)}<p>{prose(desc)}</p><div class="xref">{ref}</div>'))
    grid = (head('Tripulación', 'Los personajes de la saga', COLORS[1], side, cols=(1, 7))
            + ''.join(cards)
            + area((1, 5), (6, 7), 'legend-box', '<div class="legend">Las cifras romanas, en el color de cada película, indican en qué entregas aparece el personaje. El índice analítico (p. 71) reúne todas sus menciones.</div>'))
    return page(8, dict(grid=grid), rh='Piratas del Caribe')

def p_cronologia():
    side = 'recto'
    items = ''.join(
        f'<li style="--c:{COLORS[g["num"]]}"><div class="cy">{g["year"]}</div><div class="cdot"></div>'
        f'<div class="ct"><div class="label" style="color:{COLORS[g["num"]]}">Película {g["roman"]} · {g["director"]}</div>'
        f'<h3><i>{g["title_html"]}</i></h3><p>{prose(g["logline"])}</p><div class="xref">Capítulo {g["roman"]}, p. {page_of(g["num"], "opener")}</div></div></li>'
        for g in C.FILMS)
    grid = (head('La saga de un vistazo', 'Cronología de la saga', COLORS[1], side)
            + area((1, 7), (2, 7), 'timeline', f'<ol class="tl">{items}</ol>'))
    return page(9, dict(grid=grid), rh='Cronología de la saga')

# ------------------------------------------------------------------ apéndices
def p_epilogo():
    side = 'verso'
    paras = ''.join(f'<p>{prose(t)}</p>' for t in C.EPILOGUE)
    grid = (head('Fin de la travesía', 'Epílogo', COLORS[1], side)
            + area(text_cols(side), (2, 4), 'body', paras)
            + area(text_cols(side), (4, 6), 'vignette', svg_ship(NAVY, 60)))
    return page(70, dict(grid=grid), rh='Piratas del Caribe')

def sort_key(s):
    t = s.lower()
    for a, b in (('á', 'a'), ('é', 'e'), ('í', 'i'), ('ó', 'o'), ('ú', 'u'), ('ü', 'u')):
        t = t.replace(a, b)
    return t.replace('ñ', 'n~')

def p_analitico():
    entries = sorted(INDEX.items(), key=lambda kv: sort_key(kv[0][0]))
    out = []; cur = None
    for (entry, cat), pages in entries:
        letter = sort_key(entry)[0].upper()
        if letter != cur:
            cur = letter; out.append(f'<div class="ix-letter">{letter}</div>')
        main = MAIN.get(entry, set())
        if entry in ('Syrena', 'Philip'):
            main = MAIN.get(entry, set())
        pgs = ', '.join((f'<b>{p}</b>' if p in main else str(p)) for p in sorted(pages | main))
        name = f'<i>{entry}</i>' if cat == 'nave' else entry
        tag = f' <span class="ix-cat">({cat})</span>' if cat and cat != 'nave' else (' <span class="ix-cat">(nave)</span>' if cat == 'nave' else '')
        out.append(f'<div class="ix">{name}{tag} <span class="ix-p">{pgs}</span></div>')
    grid = (head('Apéndice', 'Índice analítico', COLORS[1], 'recto', cols=(1, 5))
            + area((5, 7), (1, 2), 'ix-help', '<div class="legend">Personajes, naves, lugares, objetos e instituciones. En <b>negrita</b>, la página donde se presenta el personaje; las naves, en cursiva.</div>')
            + area((1, 7), (2, 7), 'ix-cols', ''.join(out)))
    return page(71, dict(grid=grid), rh='Índice analítico')

def p_colofon():
    side = 'verso'
    specs = [
        ('Formato', '21,59 × 27,94 cm al corte (carta), vertical; 72 páginas en 4 pliegos de 16 y 1 de 8.'),
        ('Retícula', '6 columnas de 25,23 mm con medianil de 4,5 mm; 6 filas de 7 líneas sobre línea base de 14 pt. Márgenes: cabeza 22, pie 25,3, lomo 22 y corte 20 mm.'),
        ('Tipografía', 'Libre Caslon Text y Libre Caslon Display (Pablo Impallari y Rodrigo Fuenzalida), revival de la letra inglesa del siglo XVIII, la época en que transcurre la saga. Source Sans 3 (Paul D. Hunt, Adobe) para cornisas, datos y pies de foto.'),
        ('Impresión', 'Offset en cuatricromía (CMYK) con sangrado de 3 mm y marcas de corte. Imágenes a un mínimo de 200 ppp efectivos; ilustraciones vectoriales a 300–560 ppp.'),
        ('Papel', 'Interior: estucado mate de 150 g/m², que reproduce bien las imágenes sin reflejos al leer. Guardas: offset de 140 g/m² impreso con el motivo de rombos.'),
        ('Encuadernación', 'Tapa dura (cartón gris de 2,5 mm forrado), cosido al hilo y lomo recto con cabezada: el libro abre por completo y el lomo no se quiebra con el uso de consulta.'),
    ]
    sp = ''.join(f'<dt>{a}</dt><dd>{prose(b)}</dd>' for a, b in specs)
    credits = (
        '<p><b>Textos</b>: adaptación y edición a partir de la versión anterior de este libro.</p>'
        '<p><b>Ilustraciones vectoriales</b> (portadillas, láminas I, IV y V, bote, flotas, duelo, cálices, sirena, rosa de los vientos y tridente): originales de la edición.</p>'
        '<p><b>Fotografías de las películas</b>: © Disney Enterprises, Inc. / Jerry Bruckheimer Films. Se reproducen a título de cita, con fines académicos.</p>'
        '<p><b>Ilustraciones digitales y acuarelas</b>: archivo de la edición. Ilustración de la Hermandad (fig. III·4): obra de aficionado firmada por su autor.</p>')
    grid = (head('Créditos y datos técnicos', 'Colofón', COLORS[1], side)
            + area(text_cols(side), (2, 6), 'colo', f'<dl class="specs">{sp}</dl>')
            + area(marg_cols(side), (2, 6), 'marg small', credits)
            + area(text_cols(side), (6, 7), 'legal', f'<p>{prose(C.DISCLAIMER)}</p><p class="fin">Se terminó de componer en noviembre de 2026.</p>'))
    return page(72, dict(grid=grid), rh='Piratas del Caribe')

# ------------------------------------------------------------------ ensamblado
def build():
    pages = {1: p_portadilla(), 2: p_frontis(), 3: p_portada(), 4: p_indice_a(), 5: p_indice_b(),
             6: p_intro(), 7: p_como(), 8: p_personajes(), 9: p_cronologia(),
             70: p_epilogo(), 71: p_analitico(), 72: p_colofon()}
    for f in C.FILMS:
        n = f['num']
        pages[page_of(n, 'opener')] = p_opener(f)
        pages[page_of(n, 'ficha')] = p_ficha(f)
        pages[page_of(n, 'quien')] = p_quien(f)
        for i in range(1, 7):
            pages[scene_page(n, i)] = p_scene(f, i)
        pages[page_of(n, 'clave_v')] = p_clave_v(f)
        pages[page_of(n, 'clave_r')] = p_clave_r(f)
        pages[page_of(n, 'reflexion')] = p_reflexion(f)
    assert sorted(pages) == list(range(1, TOTAL + 1)), sorted(set(range(1, TOTAL + 1)) - set(pages))
    css = open(os.path.join(HERE, 'book.css'), encoding='utf-8').read()
    css = css.replace('{{PAGE_W}}', f'{PAGE_W}').replace('{{PAGE_H}}', f'{PAGE_H}') \
             .replace('{{COL}}', f'{COL:.4f}').replace('{{GUT}}', f'{GUT}').replace('{{ROW}}', f'{ROW:.4f}') \
             .replace('{{ROWGAP}}', f'{ROWGAP:.4f}').replace('{{BLOCK_W}}', f'{BLOCK_W:.4f}').replace('{{BLOCK_H}}', f'{BLOCK_H:.4f}') \
             .replace('{{LH}}', f'{LH:.4f}')
    fonts = ''.join(f'<link rel="stylesheet" href="node_modules/@fontsource/{p}">' for p in [
        'libre-caslon-text/400.css', 'libre-caslon-text/400-italic.css', 'libre-caslon-text/700.css',
        'libre-caslon-display/400.css', 'source-sans-3/400.css', 'source-sans-3/400-italic.css',
        'source-sans-3/600.css', 'source-sans-3/700.css'])
    doc = (f'<!doctype html><html lang="es"><head><meta charset="utf-8"><title>{C.BOOK_TITLE}</title>{fonts}'
           f'<style>{css}</style></head><body>' + '\n'.join(pages[k] for k in range(1, TOTAL + 1)) + '</body></html>')
    open(os.path.join(HERE, 'book.html'), 'w', encoding='utf-8').write(doc)
    json.dump(dict(images=QA_IMAGES, index={f'{k[0]}|{k[1]}': sorted(v) for k, v in INDEX.items()},
                   geometry=dict(COL=COL, ROW=ROW, LH=LH, BLOCK_W=BLOCK_W, BLOCK_H=BLOCK_H, M_BOTTOM=M_BOTTOM)),
              open(os.path.join(HERE, 'qa_build.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print('ok', len(pages), 'páginas;', len(QA_IMAGES), 'imágenes; col', round(COL, 3), 'fila', round(ROW, 3), 'pie', round(M_BOTTOM, 2))

if __name__ == '__main__':
    build()
