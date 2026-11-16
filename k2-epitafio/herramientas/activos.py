"""activos.py — convierte los másteres PNG en los activos web de «K2 · La montaña sin nombre».

Uso: python3 activos.py <dir_másteres> <dir_identidad> <dir_salida_assets>

  · ilustraciones 16:9  → WebP a 960, 1600, 2560 y 3840 px (srcset)
  · panorámica          → WebP a 3600, 5400 y 7200 px
  · ruta                → placa limpia + capa recortada con transparencia (línea, carpas y banderín)
  · marcadores de carga → miniaturas de 40 px incrustadas en css/lqip.css
  · fuentes             → subconjuntos WOFF2 (solo los glifos que la página usa)
  · papeles             → copia de los 8 WebP de la identidad
"""
import base64
import io
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

Image.MAX_IMAGE_PIXELS = None

ESCENAS = {  # máster → nombre web
    'k2_01_concordia': 'k2_01_concordia',
    'k2_02_campo_base': 'k2_02_campo_base',
    'k2_03_ruta_placa': 'k2_03_ruta',
    'k2_04_campo_4_noche': 'k2_04_campo_4_noche',
    'k2_05_cuello_de_botella': 'k2_05_cuello_de_botella',
    'k2_06_cumbre': 'k2_06_cumbre',
    'k2_07_horizonte': 'k2_07_horizonte',
    'k2_08_baltoro': 'k2_08_baltoro',
    'k2_10_gilkey': 'k2_10_gilkey',
}
ANCHOS = (960, 1600, 2560, 3840)
PANO = ('k2_09_anfiteatro', (3600, 5400, 7200))


def webp(im, path, ancho, q):
    w, h = im.size
    out = im if ancho == w else im.resize((ancho, round(h * ancho / w)), Image.LANCZOS)
    out.save(path, 'WEBP', quality=q, method=6)
    return path.stat().st_size


def lqip(im):
    t = im.convert('RGB').resize((40, max(1, round(40 * im.size[1] / im.size[0]))), Image.LANCZOS)
    b = io.BytesIO()
    t.save(b, 'WEBP', quality=45, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()


def capa_ruta(placa, linea, out, meta_in, meta_out):
    """La diferencia entre las dos variantes de la escena es exactamente lo añadido:
    se recorta a su caja y se le da un canal alfa con el borde difuminado."""
    A = np.asarray(placa.convert('RGB')).astype(np.int16)
    B = np.asarray(linea.convert('RGB'))
    d = np.abs(A - B.astype(np.int16)).sum(2)
    m = ndi.binary_dilation(d > 18, iterations=5)
    alpha = np.clip(ndi.gaussian_filter(m.astype(np.float32), 2.0) * 1.6, 0, 1)
    ys, xs = np.nonzero(alpha > 0.01)
    pad = 12
    x0, x1 = max(0, xs.min() - pad), min(A.shape[1], xs.max() + pad)
    y0, y1 = max(0, ys.min() - pad), min(A.shape[0], ys.max() + pad)
    rgba = np.dstack([B[y0:y1, x0:x1], (alpha[y0:y1, x0:x1] * 255).astype(np.uint8)])
    Image.fromarray(rgba, 'RGBA').save(out, 'WEBP', quality=90, method=6, exact=False)
    meta = json.loads(Path(meta_in).read_text())
    meta['capa'] = dict(x=int(x0), y=int(y0), w=int(x1 - x0), h=int(y1 - y0))
    Path(meta_out).write_text(json.dumps(meta))
    return out.stat().st_size, meta['capa']


def datos_ruta(meta, salida):
    """Vuelca el trazado de la ruta a un módulo JS, en píxeles de la lámina 3840 × 2160."""
    d = json.loads(Path(meta).read_text())
    W, H = d['size']
    out = dict(tam=[W, H], capa=d['capa'],
               puntos=[[round(x * W, 1), round(y * H, 1)] for x, y in d['route']],
               campos=[dict(i=c['i'], carpa=[round(c['tent'][0] * W), round(c['tent'][1] * H)]) for c in d['camps']],
               cumbre=[round(d['summit'][0] * W), round(d['summit'][1] * H)])
    Path(salida).write_text('// generado por herramientas/activos.py a partir de la escena «ruta» '
                            '(coordenadas en píxeles de la lámina 3840 × 2160)\n'
                            'export const RUTA = ' + json.dumps(out, separators=(',', ':')) + ';\n')


def papeles(src, dst, ancho_max=1280):
    """Los recuadros se muestran a 530 px de ancho como mucho: con 1280 px sobran para pantallas 2×.
    Se reduce con alfa premultiplicado para que el borde rasgado no arrastre halos."""
    for f in sorted(src.glob('*.webp')):
        im = Image.open(f).convert('RGBA')
        w, h = im.size
        if w > ancho_max:
            im = im.convert('RGBa').resize((ancho_max, round(h * ancho_max / w)), Image.LANCZOS).convert('RGBA')
        im.save(dst / f.name, 'WEBP', quality=88, method=6)
        print(f'  {f.name:42s} {w}→{im.size[0]} px  {(dst / f.name).stat().st_size / 1024:6.0f} KB')


def fuentes(src, dst):
    from fontTools import subset
    latin = ('U+0020-007E,U+00A0-00FF,U+0100-017F,U+2009,U+200A,U+2013,U+2014,U+2018-201D,U+2026,U+2032,U+2033,'
             'U+2190-2193,U+2248,U+2153,U+2212,U+00D7')
    jobs = [('Cinzel[wght].ttf', 'cinzel-var.woff2', latin),
            ('Spectral-Light.ttf', 'spectral-300.woff2', latin),
            ('Spectral-LightItalic.ttf', 'spectral-300i.woff2', latin),
            ('Spectral-Regular.ttf', 'spectral-400.woff2', latin),
            ('Spectral-Italic.ttf', 'spectral-400i.woff2', latin),
            ('Spectral-Medium.ttf', 'spectral-500.woff2', latin),
            # solo las consonantes sueltas de la línea decorativa: sin apilados no hacen falta las tablas de composición
            ('Jomolhari-Regular.ttf', 'jomolhari.woff2', 'U+0F0B,U+0F40-0F47')]
    for a, b, uni in jobs:
        feats = '' if b.startswith('jomolhari') else '*'
        subset.main([str(src / a), f'--unicodes={uni}', '--flavor=woff2', f'--layout-features={feats}',
                     f'--output-file={dst / b}'])
        print(f'  {b:22s} {(dst / b).stat().st_size / 1024:7.1f} KB')
    for f in src.glob('OFL-*.txt'):
        if 'gulzar' not in f.name:
            shutil.copy(f, dst / f.name)


def main():
    masters, ident, out = (Path(a) for a in sys.argv[1:4])
    img = out / 'img'
    img.mkdir(parents=True, exist_ok=True)
    datos = Path(__file__).resolve().parent / 'datos'      # coordenadas de rótulos y trazado de la ruta
    datos.mkdir(exist_ok=True)
    total = 0
    css = ['/* generado por herramientas/activos.py — marcadores de carga (40 px) */']
    for src, name in ESCENAS.items():
        im = Image.open(masters / f'{src}.png').convert('RGB')
        for w in ANCHOS:
            n = webp(im, img / f'{name}-{w}.webp', w, 80 if w == 3840 else 84)
            total += n
            print(f'  {name}-{w}.webp {n / 1024:8.0f} KB')
        css.append(f'.plate[data-img="{name}"]{{background-image:url({lqip(im)})}}')
    src, anchos = PANO
    im = Image.open(masters / f'{src}.png').convert('RGB')
    for w in anchos:
        n = webp(im, img / f'{src}-{w}.webp', w, 80 if w == 7200 else 84)
        total += n
        print(f'  {src}-{w}.webp {n / 1024:8.0f} KB')
    css.append(f'.plate[data-img="{src}"]{{background-image:url({lqip(im)})}}')
    (out.parent / 'css' / 'lqip.css').write_text('\n'.join(css) + '\n')
    n, caja = capa_ruta(Image.open(masters / 'k2_03_ruta_placa.png'), Image.open(masters / 'k2_03_ruta_linea.png'),
                        img / 'k2_03_ruta_linea.webp', masters / 'k2_03_ruta_linea.json', datos / 'ruta.json')
    total += n
    print(f'  k2_03_ruta_linea.webp {n / 1024:8.0f} KB  caja={caja}')
    # imagen para compartir (Open Graph)
    og = Image.open(masters / 'k2_01_concordia.png').convert('RGB').resize((1200, 675), Image.LANCZOS).crop((0, 22, 1200, 652))
    og.save(img / 'og.jpg', quality=84, optimize=True, progressive=True)
    for k in ('k2_07_horizonte', 'k2_09_anfiteatro'):
        shutil.copy(masters / f'{k}.json', datos / f'{k.split("_", 2)[2]}.json')
    datos_ruta(datos / 'ruta.json', out.parent / 'js' / 'datos.js')
    print(f'ilustraciones: {total / 1e6:.1f} MB')
    (out / 'papel').mkdir(exist_ok=True)
    papeles(ident / 'recuadros' / 'webp', out / 'papel')
    (out / 'fuentes').mkdir(exist_ok=True)
    fuentes(ident / 'fuentes', out / 'fuentes')


if __name__ == '__main__':
    main()
