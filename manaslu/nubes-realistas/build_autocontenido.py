"""Arma un único HTML autocontenido: tipografías, pinturas y nubes incrustadas (base64 -> blob en el navegador)."""
import base64, glob, os, re, json, sys
SP = sys.argv[1]
b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()
s = open(f'{SP}/site/test.html', encoding='utf-8').read()

# 1. fuera Google Fonts; @font-face embebidas
s = re.sub(r'<link rel="preconnect"[^>]*>\n?', '', s)
s = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis[^>]*>\n?', '', s)
ff = lambda fam, f, w, st='normal': ("@font-face{font-family:'%s';src:url(data:font/woff2;base64,%s) format('woff2');font-weight:%s;font-style:%s;font-display:swap}"
                                    % (fam, b64(f'{SP}/solo/fonts/{f}.woff2'), w, st))
fonts = '\n'.join([ff('Marcellus', 'marcellus_Marcellus-Regular', 400),
                   ff('Alegreya Sans', 'alegreyasans_AlegreyaSans-Regular', 400),
                   ff('Alegreya Sans', 'alegreyasans_AlegreyaSans-Italic', 400, 'italic'),
                   ff('Alegreya Sans', 'alegreyasans_AlegreyaSans-Medium', 500),
                   ff('Alegreya Sans', 'alegreyasans_AlegreyaSans-Bold', 700),
                   ff('Noto Serif Tibetan', 'tibetan', '100 900')])
s = s.replace('<style>', '<style>\n' + fonts, 1)

# 2. jirones en CSS (data URI directa, son solo dos)
for i in (0, 1):
    s = s.replace(f"url('nubes2/jiron_{i}.webp')", f"url(data:image/webp;base64,{b64(f'{SP}/solo/nubes/jiron_{i}.webp')})")

# 3. pinturas y sprites: base64 en un script, convertidos a blob URL al arrancar
assets = {}
for f in sorted(glob.glob(f'{SP}/solo/img/*.webp')):
    assets['img/' + os.path.basename(f)[:-5]] = b64(f)
for f in sorted(glob.glob(f'{SP}/solo/nubes/*.webp')):
    n = os.path.basename(f)[:-5]
    if not n.startswith('jiron'):
        assets['n/' + n] = b64(f)
loader = ('<script>window.__A=' + json.dumps(assets, separators=(',', ':')) + ';'
          'window.__U={};window.__url=function(k){var u=__U[k];if(u)return u;var b=atob(__A[k]),a=new Uint8Array(b.length);'
          'for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);u=__U[k]=URL.createObjectURL(new Blob([a],{type:"image/webp"}));delete __A[k];return u}</script>\n')
s = s.replace('<style>', loader + '<style>', 1)
s = s.replace("const srcOf = k => `img/${k}-${big ? 2560 : 1600}.webp`;", "const srcOf = k => __url('img/' + k);")
s = s.replace("el.style.setProperty('--img', `url('nubes2/${r.n.n}.webp')`);", "el.style.setProperty('--img', `url(${__url('n/' + r.n.n)})`);")
assert 'nubes2/' not in s and 'googleapis' not in s and 'img/${k}' not in s
open(f'{SP}/manaslu_autocontenido.html', 'w', encoding='utf-8').write(s)
print(round(len(s.encode()) / 1e6, 1), 'MB')
