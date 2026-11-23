"""Construye src/datos.json para la web a partir de analisis/proyecciones.json.

Etiquetas curadas por lámina: las coordenadas (u, v ∈ [0,1] sobre la lámina) salen de proyectar las cumbres
reales con la cámara de cada escena; las que no son un punto geográfico (aristas, penacho, campamentos
pintados) se colocan a mano sobre la pintura y van marcadas con 'manual'.

Uso: python -I exportar_datos.py <proyecciones.json> <salida datos.json>
"""
import sys, json

P = json.load(open(sys.argv[1]))


def p(esc, clave):
    q = P[esc]['puntos'][clave]
    return [q['x'], q['y']]


# prioridad 1: siempre; 2: solo en pantallas anchas
ETIQUETAS = {
    'norte': [
        dict(id='everest', uv=p('norte', 'everest'), t='Everest', d='8 848,86 m', pr=1),
        dict(id='changtse', uv=p('norte', 'changtse'), t='Changtse', d='7 543 m · pico norte', pr=1),
        dict(id='penacho', uv=[0.305, 0.145], t='Penacho de nieve', d='la corriente en chorro', pr=2, manual=True),
        dict(id='ne', uv=[0.4375, 0.162], t='Arista noreste', d='la ruta de Mallory', pr=2, manual=True),
        dict(id='oeste', uv=[0.603, 0.252], t='Arista oeste', d='Hornbein y Unsoeld, 1963', pr=2, manual=True),
        dict(id='nuptse_n', uv=p('norte', 'nuptse'), t='Nuptse', d='7 861 m', pr=2),
        dict(id='chorten', uv=[0.238, 0.84], t='Chorten de Rongbuk', d='5 150 m', pr=2, manual=True),
    ],
    'campo_base': [
        dict(id='arista', uv=[0.472, 0.07], t='Arista oeste', d='la cumbre queda oculta detrás', pr=1, manual=True),
        dict(id='changtse_b', uv=p('campo_base', 'changtse'), t='Changtse', d='asoma sobre el Lho La', pr=2),
        dict(id='altar', uv=[0.754, 0.79], t='Altar de la puja', d='lhap-so de piedra', pr=1, manual=True),
        dict(id='carpas', uv=[0.17, 0.615], t='Campo Base', d='5 364 m', pr=2, manual=True),
    ],
    'ruta': [
        dict(id='r_everest', uv=p('ruta', 'everest'), t='Everest', d='8 848,86 m', pr=1),
        dict(id='r_lhotse', uv=p('ruta', 'lhotse'), t='Lhotse', d='8 516 m', pr=1),
        dict(id='r_nuptse', uv=p('ruta', 'nuptse'), t='Nuptse', d='7 861 m', pr=2),
        dict(id='r_makalu', uv=p('ruta', 'makalu'), t='Makalu', d='8 485 m', pr=2),
        dict(id='r_changtse', uv=p('ruta', 'changtse'), t='Changtse', d='7 543 m', pr=2),
        dict(id='r_pumori', uv=p('ruta', 'pumori'), t='Pumori', d='7 161 m', pr=2),
    ],
    'campo1': [
        dict(id='c1_everest', uv=p('campo1', 'everest'), t='Everest', d='cara suroeste', pr=1),
        dict(id='c1_lhotse', uv=p('campo1', 'lhotse'), t='Lhotse', d='8 516 m', pr=1),
        dict(id='c1_collado', uv=p('campo1', 'ruta_collado_sur'), t='Collado Sur', d='7 906 m', pr=2),
        dict(id='c1_c3', uv=p('campo1', 'ruta_campo3'), t='Campo 3', d='cara del Lhotse', pr=2),
        dict(id='c1_nuptse', uv=[0.972, 0.17], t='Nuptse', d='7 861 m, en sombra', pr=1, manual=True),
        dict(id='c1_hombro', uv=[0.15, 0.13], t='Hombro oeste', d='del Everest', pr=2, manual=True),
    ],
    'campo2': [
        dict(id='c2_everest', uv=p('campo2', 'everest'), t='Cumbre', d='2 400 m más arriba', pr=1),
        dict(id='c2_carpas', uv=[0.575, 0.73], t='Campo 2', d='6 400 m · morrena', pr=2, manual=True),
    ],
    'campo3': [
        dict(id='c3_everest', uv=p('campo3', 'everest'), t='Everest', d='arista sureste', pr=1),
        dict(id='c3_carpas', uv=[0.765, 0.64], t='Campo 3', d='7 160 m · repisas en el hielo', pr=1, manual=True),
    ],
    'campo4': [
        dict(id='c4_cima', uv=p('campo4', 'ruta_escalon_hillary'), t='Cima Sur', d='8 749 m', pr=1),
        dict(id='c4_balcon', uv=p('campo4', 'ruta_balcon'), t='El Balcón', d='8 400 m', pr=1),
        dict(id='c4_frontales', uv=[0.452, 0.33], t='Frontales', d='el ataque, de noche', pr=2, manual=True),
    ],
    'cumbre': [
        dict(id='k_makalu', uv=p('cumbre', 'makalu'), t='Makalu', d='8 485 m · 5.ª del mundo', pr=1),
        dict(id='k_kangch', uv=p('cumbre', 'kangchenjunga'), t='Kangchenjunga', d='8 586 m · a 124 km', pr=1),
        dict(id='k_lhotse', uv=p('cumbre', 'lhotse'), t='Lhotse', d='8 516 m', pr=1),
        dict(id='k_shar', uv=p('cumbre', 'lhotse_shar'), t='Lhotse Shar', d='8 383 m', pr=2),
        dict(id='k_chomo', uv=p('cumbre', 'chomo_lonzo'), t='Chomo Lonzo', d='7 804 m', pr=2),
        dict(id='k_chamlang', uv=p('cumbre', 'chamlang'), t='Chamlang', d='7 319 m', pr=2),
        dict(id='k_baruntse', uv=p('cumbre', 'baruntse'), t='Baruntse', d='7 129 m', pr=2),
    ],
}

R = P['ruta']
pts = R['ruta']
hitos = R['hitos']
# la ruta va de la cumbre (índice 0) al Campo Base: se invierte para dibujarla subiendo
n = len(pts)
ruta = [pts[k][:3] for k in range(n - 1, -1, -1)]
perfil = [R['perfil'][k] for k in range(n - 1, -1, -1)]
hitos_sub = {k: n - 1 - j for k, j in hitos.items()}
# recorta lo que queda por debajo del Campo Base
i0 = hitos_sub['campo_base']
ruta, perfil = ruta[i0:], perfil[i0:]
hitos_sub = {k: v - i0 for k, v in hitos_sub.items()}
d0 = perfil[0][0]
perfil = [[round(d - d0, 3), z] for d, z in perfil]

out = dict(etiquetas=ETIQUETAS, ruta=dict(puntos=ruta, perfil=perfil, hitos=hitos_sub))
json.dump(out, open(sys.argv[2], 'w'), ensure_ascii=False, separators=(',', ':'))
print('puntos de ruta', len(ruta), 'longitud', perfil[-1][0], 'km; hitos', hitos_sub)
