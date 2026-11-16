"""pagina_unica.py — empaqueta la web en un solo HTML.

Uso: python3 pagina_unica.py <salida.html> [--fragmento] [--esbuild RUTA]

Incrusta el CSS, los marcadores de carga, las fuentes (como data: URI) y el JavaScript
(empaquetado con esbuild en un único guion). Las ilustraciones y los papeles siguen siendo
archivos aparte, referenciados de forma relativa como assets/…: hay que servirlos junto al HTML.

  --fragmento   omite <!doctype>, <html>, <head> y <body>: para alojamientos que ya envuelven
                la página en su propio esqueleto (por ejemplo, un Artifact de Claude).
  --esbuild     ruta al binario de esbuild (por defecto, `npx --yes esbuild`).
"""
import base64
import re
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def empaquetar_js(esbuild):
    cmd = (esbuild or ['npx', '--yes', 'esbuild']) + [str(RAIZ / 'js' / 'main.js'), '--bundle', '--format=iife',
                                                      '--minify', '--target=es2020', '--log-level=warning']
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout.strip()


def estilos():
    css = (RAIZ / 'css' / 'k2.css').read_text(encoding='utf8')

    def fuente(m):
        datos = (RAIZ / 'assets' / 'fuentes' / m.group(1)).read_bytes()
        return "url('data:font/woff2;base64," + base64.b64encode(datos).decode() + "')"
    css = re.sub(r"url\('\.\./assets/fuentes/([^']+)'\)", fuente, css)
    css = css.replace("url('../assets/", "url('assets/")
    return css + '\n' + (RAIZ / 'css' / 'lqip.css').read_text(encoding='utf8')


def main():
    args = sys.argv[1:]
    salida = Path(args[0])
    fragmento = '--fragmento' in args
    esbuild = [args[args.index('--esbuild') + 1]] if '--esbuild' in args else None

    html = (RAIZ / 'index.html').read_text(encoding='utf8')
    cabeza = html[html.index('<head>') + 6:html.index('</head>')]
    cuerpo = html[html.index('<body>') + 6:html.index('</body>')]

    # hojas de estilo y precargas de fuente → un único <style>; módulo → guion incrustado
    cabeza = re.sub(r'<link rel="preload"[^>]*>\s*', '', cabeza)
    cabeza = re.sub(r'<link rel="stylesheet" href="css/lqip\.css">\s*', '', cabeza)
    cabeza = cabeza.replace('<link rel="stylesheet" href="css/k2.css">', '<style>\n' + estilos() + '</style>')
    guion = '<script>\n' + empaquetar_js(esbuild) + '\n</script>'
    cuerpo = cuerpo.replace('<script type="module" src="js/main.js"></script>', guion)
    assert guion in cuerpo and '<style>' in cabeza

    if fragmento:
        cabeza = re.sub(r'<meta charset[^>]*>\s*|<meta name="viewport"[^>]*>\s*', '', cabeza)
        pagina = cabeza.strip() + '\n' + cuerpo.strip() + '\n'
    else:
        pagina = '<!doctype html>\n<html lang="es">\n<head>' + cabeza + '</head>\n<body>' + cuerpo + '</body>\n</html>\n'
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(pagina, encoding='utf8')
    print(f'{salida}  {salida.stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    main()
