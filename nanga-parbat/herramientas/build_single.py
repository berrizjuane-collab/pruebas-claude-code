#!/usr/bin/env python3
"""Empaqueta la web en UN solo archivo HTML sin dependencias (ni red, ni carpetas).

Uso:
    python3 herramientas/build_single.py FUENTES_DIR [--ancho 1800] [--salida dist/nanga-parbat.html]

FUENTES_DIR es una carpeta con los .woff2 ya descargados (de @fontsource):
    fraunces-latin-opsz-normal.woff2, fraunces-latin-opsz-italic.woff2,
    work-sans-latin-wght-normal.woff2,
    gulzar-arabic-400-normal.woff2, gulzar-latin-400-normal.woff2
Necesita: Pillow y esbuild (npx esbuild) en el PATH.

Qué hace
  · CSS y JS dentro del HTML (JS agrupado con esbuild en un IIFE).
  · Láminas, capas y mapa: se reducen a --ancho px de lado largo (WebP) y se guardan
    una sola vez en base64; al arrancar se convierten en blob: URLs que usan
    <img>, el escenario WebGL y la galería.
  · Piedras (border-image / background) y sello: data: URIs dentro del CSS.
  · geo.json y las tres librerías (GSAP, ScrollTrigger, Lenis) incrustados.
  · Tipografías Fraunces, Work Sans y Gulzar incrustadas (WOFF2).
"""
import argparse, base64, io, json, re, shutil, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent

ap = argparse.ArgumentParser()
ap.add_argument('fuentes')
ap.add_argument('--ancho', type=int, default=1800, help='lado largo de láminas y capas (px)')
ap.add_argument('--calidad', type=int, default=80)
ap.add_argument('--salida', default=str(RAIZ / 'dist' / 'nanga-parbat.html'))
a = ap.parse_args()
FU = Path(a.fuentes)


def b64(b): return base64.b64encode(b).decode('ascii')


def webp(ruta, lado):
    im = Image.open(ruta)
    if max(im.size) > lado:
        f = lado / max(im.size)
        im = im.resize((round(im.width * f), round(im.height * f)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=a.calidad, method=6)
    return buf.getvalue()


def datauri(ruta, mime=None):
    ruta = Path(ruta)
    mime = mime or {'.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'}[ruta.suffix]
    return f'data:{mime};base64,{b64(ruta.read_bytes())}'


# ── imágenes que viven como blob: (clave → base64) ───────────────────────────
imgs = {}
for p in sorted((RAIZ / 'assets/laminas').glob('*-2400.webp')):
    imgs[f'lam/{p.name.split("-")[0]}'] = webp(p, a.ancho)
imgs['lam/mapa'] = webp(RAIZ / 'assets/mapa/mapa-2000.webp', round(a.ancho * 0.9))
for i in range(3):
    imgs[f'capa/{i}'] = webp(RAIZ / f'assets/capas/fairy-l{i}-2400.webp', a.ancho)
print('imágenes:', {k: len(v) // 1024 for k, v in imgs.items()}, 'KB')

# ── JS: copia parcheada + esbuild ────────────────────────────────────────────
tmp = Path(tempfile.mkdtemp(prefix='np_build_'))
shutil.copytree(RAIZ / 'js', tmp / 'js')


def parche(fichero, viejo, nuevo, regex=False):
    p = tmp / 'js' / fichero
    t = p.read_text(encoding='utf8')
    n = re.subn(viejo, nuevo, t, flags=re.S)[1] if regex else t.count(viejo)
    assert n == 1, f'{fichero}: patrón {viejo!r} aparece {n} veces'
    p.write_text(re.sub(viejo, nuevo, t, flags=re.S) if regex else t.replace(viejo, nuevo), encoding='utf8')


# una sola resolución: las URLs salen del mapa de blobs
parche('data.js', r"export const lamSrc = .*?webp`;", "export const lamSrc = (id) => window.__U['lam/' + id];", regex=True)
parche('fx.js', r"    img\.srcset = .*?;\n", "", regex=True)
parche('main.js', "fetch('assets/data/geo.json').then((r) => r.json())", "Promise.resolve(window.__GEO)")
(tmp / 'entrada.js').write_text("import './js/main.js';\n")
js = subprocess.run(['npx', '--yes', 'esbuild', str(tmp / 'entrada.js'), '--bundle', '--format=iife', '--minify', '--target=es2020'],
                    capture_output=True, text=True, check=True).stdout
print('js propio:', len(js) // 1024, 'KB')

# ── CSS ──────────────────────────────────────────────────────────────────────
css = (RAIZ / 'css/diamir.css').read_text(encoding='utf8') + '\n' + (RAIZ / 'css/site.css').read_text(encoding='utf8')


def url_css(m):
    ruta = (RAIZ / 'css' / m.group(1)).resolve()
    return f'url({datauri(ruta)})'


css, n = re.subn(r'url\((?:"|\')?(\.\./assets/[^)"\']+)(?:"|\')?\)', url_css, css)
print('url() del CSS incrustadas:', n)
assert 'assets/' not in css


def face(fam, fichero, estilo='normal', peso='400', rango=None):
    r = f'unicode-range:{rango};' if rango else ''
    return (f'@font-face{{font-family:"{fam}";font-style:{estilo};font-weight:{peso};font-display:swap;'
            f'src:url({datauri(FU / fichero)}) format("woff2");{r}}}')


# rangos Unicode de Gulzar tal como los publica Google (para repartir latino y árabe)
UR_AR = 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC'
UR_LA = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
fuentes = '\n'.join([
    face('Fraunces', 'fraunces-latin-opsz-normal.woff2', 'normal', '100 900'),
    face('Fraunces', 'fraunces-latin-opsz-italic.woff2', 'italic', '100 900'),
    face('Work Sans', 'work-sans-latin-wght-normal.woff2', 'normal', '100 900'),
    face('Gulzar', 'gulzar-arabic-400-normal.woff2', 'normal', '400', UR_AR),
    face('Gulzar', 'gulzar-latin-400-normal.woff2', 'normal', '400', UR_LA),
])

# ── HTML ─────────────────────────────────────────────────────────────────────
html = (RAIZ / 'index.html').read_text(encoding='utf8')
cuerpo = html.split('<body class="is-loading">', 1)[1].rsplit('</body>', 1)[0]
cabeza = html.split('<body class="is-loading">', 1)[0]
cabeza = re.sub(r'\s*<link rel="(?:preconnect|preload|stylesheet|icon)"[^>]*>', '', cabeza)
cabeza = re.sub(r'\s*<meta property="og:image"[^>]*>', '', cabeza)
cabeza = cabeza.replace('</head>', f'  <link rel="icon" href="{datauri(RAIZ / "assets/sello.svg")}" type="image/svg+xml">\n</head>')

# <img> con srcset → una sola imagen, puesta por clave desde el arranque
MAPA_CLAVE = {'fairy-l0': 'capa/0', 'fairy-l1': 'capa/1', 'fairy-l2': 'capa/2', 'mapa': 'lam/mapa'}


def img(m):
    tag = m.group(0)
    k = re.search(r'src="assets/(?:capas|mapa)/([a-z0-9-]+?)-(?:\d+)\.webp"', tag).group(1)
    tag = re.sub(r'\s*srcset="[^"]*"', '', tag)
    tag = re.sub(r'\s*sizes="[^"]*"', '', tag)
    return re.sub(r'src="[^"]*"', f'data-asset="{MAPA_CLAVE[k]}"', tag, count=1)


cuerpo = re.sub(r'<img\b[^>]*?src="assets/[^>]*?>', img, cuerpo, flags=re.S)
cuerpo = re.sub(r'<script[^>]*src="[^"]*"[^>]*></script>\s*', '', cuerpo)
assert 'assets/' not in cuerpo.replace('assets/sello', ''), re.findall(r'.{40}assets/.{40}', cuerpo)[:3]

esc = lambda s: s.replace('</script', '<\\/script').replace('<!--', '<\\!--')
libs = '\n'.join(esc((RAIZ / 'vendor' / f).read_text(encoding='utf8')) for f in ('gsap.min.js', 'ScrollTrigger.min.js', 'lenis.min.js'))
geo = json.dumps(json.loads((RAIZ / 'assets/data/geo.json').read_text(encoding='utf8')), separators=(',', ':'))
mapa_js = json.dumps({k: b64(v) for k, v in imgs.items()}, separators=(',', ':'))

arranque = """(function(){
  var B=window.__B, U=window.__U={};
  Object.keys(B).forEach(function(k){
    var s=atob(B[k]), n=s.length, u=new Uint8Array(n);
    for(var i=0;i<n;i++)u[i]=s.charCodeAt(i);
    U[k]=URL.createObjectURL(new Blob([u],{type:'image/webp'}));
    delete B[k];
  });
  document.querySelectorAll('img[data-asset]').forEach(function(im){im.src=U[im.getAttribute('data-asset')];});
})();"""

salida = (cabeza + f'  <style>\n{fuentes}\n{css}\n  </style>\n</head>\n<body class="is-loading">\n' + cuerpo.strip() + '\n'
          + f'<script>window.__B={mapa_js};window.__GEO={geo};</script>\n'
          + f'<script>{arranque}</script>\n'
          + f'<script>{libs}</script>\n'
          + f'<script>{esc(js)}</script>\n</body>\n</html>\n')

dest = Path(a.salida)
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(salida, encoding='utf8')
shutil.rmtree(tmp, ignore_errors=True)
print(f'OK → {dest}  ({dest.stat().st_size / 1e6:.1f} MB)')
