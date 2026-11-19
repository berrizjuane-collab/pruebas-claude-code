"""
build.py — monta la página a partir de src/page.html.

    python3 makalu/build.py

· Incrusta las fuentes (woff2 → data URI) y los datos de la ruta (src/ruta.json).
· Escribe las alturas con espacio no separable («8 485 m») en el texto, nunca dentro de <script>/<style>.
· Salidas: makalu/artifact.html (cuerpo, para publicar como Artifact) y makalu/index.html (documento completo).
"""
import base64, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')


def b64(name):
    with open(os.path.join(SRC, 'fuentes', name), 'rb') as f:
        return base64.b64encode(f.read()).decode('ascii')


def nbsp_text(html):
    """«8 485 m» con espacios no separables, solo fuera de <script> y <style>."""
    parts = re.split(r'(<script\b.*?</script>|<style\b.*?</style>)', html, flags=re.S)
    out = []
    for p in parts:
        if p.startswith('<script') or p.startswith('<style'):
            out.append(p)
            continue
        # solo nodos de texto: las etiquetas (y sus atributos, p. ej. viewBox) quedan intactas
        bits = re.split(r'(<[^>]*>)', p)
        for i, b in enumerate(bits):
            if b.startswith('<'):
                continue
            b = re.sub(r'(?<=\d) (?=\d{3}\b)', ' ', b)            # 8 485
            b = re.sub(r'(?<=\d) (?=(m|km)(?=[\s<.,;:)]|$))', ' ', b)  # 8485 m, 6.5 km
            b = re.sub(r'(?<=\d) %', ' %', b)
            bits[i] = b
        out.append(''.join(bits))
    return ''.join(out)


def main():
    page = open(os.path.join(SRC, 'page.html'), encoding='utf-8').read()
    route = json.load(open(os.path.join(SRC, 'ruta.json'), encoding='utf-8'))
    page = (page.replace('{{ROZHA}}', b64('RozhaOne-Regular.woff2'))
                .replace('{{KARLA}}', b64('Karla-VF.woff2'))
                .replace('{{KARLA_I}}', b64('Karla-Italic-VF.woff2'))
                .replace('{{ROUTE}}', json.dumps(route, separators=(',', ':'))))
    page = nbsp_text(page)
    with open(os.path.join(HERE, 'artifact.html'), 'w', encoding='utf-8') as f:
        f.write(page)
    head = ('<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n')
    title_end = page.index('</title>') + len('</title>')
    doc = head + page[:title_end] + '\n</head>\n<body>\n' + page[title_end:] + '\n</body>\n</html>\n'
    with open(os.path.join(HERE, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(doc)
    print('artifact.html', os.path.getsize(os.path.join(HERE, 'artifact.html')) // 1024, 'KB')


if __name__ == '__main__':
    main()
