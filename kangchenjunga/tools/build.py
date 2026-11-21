import base64, json, sys, os
root = sys.argv[1]
src = open(os.path.join(root, 'build/index.src.html'), encoding='utf-8').read()
f = lambda n: base64.b64encode(open(os.path.join(root, 'fonts', n), 'rb').read()).decode()
rep = {'__F_ECZAR__': f('eczar.woff2'), '__F_HIND400__': f('hind-Regular.woff2'), '__F_HIND500__': f('hind-Medium.woff2'),
       '__F_HIND600__': f('hind-SemiBold.woff2'), '__F_JOMOLHARI__': f('jomolhari.woff2'),
       '__ROUTE__': open(os.path.join(root, 'extra/route.json')).read()}
for k, v in rep.items():
    assert k in src, k
    src = src.replace(k, v)
open(os.path.join(root, 'site/index.html'), 'w', encoding='utf-8').write(src)
skel = ('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>'
        '</head><body>' + src + '</body></html>')
open(os.path.join(root, 'site/test.html'), 'w', encoding='utf-8').write(skel)
print('ok', len(src) // 1024, 'KB')
