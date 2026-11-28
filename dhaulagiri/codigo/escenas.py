"""Las seis láminas del Dhaulagiri I (8 167 m) y su macizo.

Coordenadas locales en metros (x = este, y = norte) con origen en la cumbre del Dhaulagiri I
(terreno.LAT0/LON0).  La ruta normal es la arista noreste.  Los campos no tienen coordenadas publicadas:
están situados sobre el relieve GLO-30 a partir de las descripciones de la ruta y de sus cotas
habituales, con un margen de unos 200 a 300 m:
  CB   ( 1220,  5281)  ~4 700 m  glaciar Chhonbardan, al pie de la cascada que baja del collado NE
  C1   ( 3890,  1360)  ~5 850 m  collado noreste, entre el Dhaulagiri I y el Tukuche Peak (punto de
                                 silla del DEM: 28.7103 N, 83.5292 E)
  C2   ( 2412,   957)  ~6 500 m  repisa de la arista noreste
  C3   ( 1382,   525)  ~7 300 m  arista noreste, al pie de la pirámide cimera
  Cima (    0,     0)   8 167 m  (máximo del DEM corregido a la altura oficial)
La arista (collado -> cima) es el camino de crestería sobre el DEM que calcula herramientas/campos.py.
"""
import math

CAMPOS = {
    'CB': (1220.0, 5281.0),
    'C1': (3890.0, 1360.0),
    'C2': (2412.0, 957.0),
    'C3': (1382.0, 525.0),
    'Cima': (0.0, 0.0),
}
# Poon Hill (3 210 m), sobre Ghorepani: máximo local del GLO-30 en 28.4000 N, 83.6894 E
POON_HILL = (19508.0, -33143.0)
# giba oeste de la arista cimera, a 220 m de la cima y ~15 m más baja: desde la cima, su nieve tapa la
# base de los Dhaulagiri II-V; desde aquí se ve la cordillera entera hacia el oeste
CUMBRE_OESTE = (-188.0, 112.0)

# arista noreste: del collado a la cima (crestería sobre el GLO-30), (x, y) en m
ARISTA_NE = [(3875, 1359), (3550, 1266), (3225, 1050), (2899, 957), (2574, 957), (2249, 957), (1924, 895),
             (1599, 741), (1274, 401), (949, 185), (624, 92), (298, 61), (0, 0)]
# del campo base al collado: el glaciar Chhonbardan y la cascada de hielo que baja del collado
CASCADA_NO = [(1220, 5281), (1683, 4819), (1986, 4274), (2259, 3707), (2600, 3196), (3020, 2762), (3381, 2262), (3615, 1706), (3875, 1359)]


def rel(xy, rumbo, dist, az_rel):
    """Punto a `dist` m de xy en el rumbo de la cámara + az_rel (grados)."""
    a = math.radians(rumbo + az_rel)
    return (xy[0] + dist * math.sin(a), xy[1] + dist * math.cos(a))


CORDADA_C1 = [(0.47, 0.805), (0.492, 0.79), (0.514, 0.775)]   # cordada subiendo la primera pala
TREKKERS = [(214, 104, 38), (64, 112, 168), (196, 58, 44), (92, 140, 70), (226, 196, 70), (120, 96, 150)]

ESCENAS = {
    'poon_hill': dict(
        titulo='El macizo desde Poon Hill', subtitulo='3 210 m · alba · mirando al noroeste',
        texto='La primera luz enciende la cara sur del Dhaulagiri I, a 38 km, sobre el mar de nubes que llena los '
              'valles del Myagdi y del Kali Gandaki. A la izquierda, el Gurja Himal y el Dhaulagiri VI; a la '
              'derecha del gigante, el Tukuche Peak y, al otro lado del desfiladero, el Nilgiri.',
        xy=POON_HILL, ojo=14.0, rumbo=327.0, hfov=44.0, cy=0.58, dlod=48000.0,
        sol=(78.0, 7.0), paleta='alba', cielo='venus', acabado='alba', cielo_E=26.0, cirros=0.10,
        intensidad_luz=1.2,
        resplandor=(255, 214, 186), resplandor_k=0.12, bruma_D=70000.0, linea_firn=5000.0, nieve_sesgo=6.5,
        bump_roca=0.55, bruma_valle=0.10,
        mar_nubes=dict(nivel=2350.0, escala=2300.0, claros=0.35, bruma_D=60000.0, relieve=160.0,
                       tonos=((96, 98, 150), (176, 164, 196), (246, 222, 214)), bruma=(170, 160, 194),
                       claro_color=(44, 52, 92)),
        cumulos=[],
        objetos=[dict(tipo='cresta', textura='morrena', luz=(78, 74, 76), sombra=(26, 30, 44),
                      puntos=[(0.0, 0.905), (0.14, 0.896), (0.30, 0.902), (0.46, 0.915), (0.62, 0.928),
                              (0.80, 0.936), (1.0, 0.95)],
                      encima=[dict(tipo='mastil_banderas', de=(0.08, 0.905, 0.11), a=(0.40, 0.92, 0.05), ancho=0.012),
                              dict(tipo='escalador', uv=(0.62, 0.985), alto=0.11, color=TREKKERS[0],
                                   inclinacion=0.0, piolet=False, mira=1),
                              dict(tipo='escalador', uv=(0.69, 0.99), alto=0.12, color=TREKKERS[1],
                                   inclinacion=-0.05, piolet=False, mira=-1),
                              dict(tipo='escalador', uv=(0.86, 1.0), alto=0.15, color=TREKKERS[2],
                                   inclinacion=0.04, piolet=False, mira=1)])]),
    'campo_base': dict(
        titulo='Campo Base', subtitulo='4 700 m · última hora de la tarde · glaciar Chhonbardan',
        texto='La cara norte del Dhaulagiri I se levanta 3 400 m sobre el glaciar Chhonbardan. A la izquierda, la '
              'cascada de hielo sube hacia el collado noreste, donde arranca la arista de la ruta normal; la '
              'luz rasante del oeste marca cada costilla de la pared.',
        xy=CAMPOS['CB'], ojo=10.0, rumbo=178.0, hfov=80.0, cy=0.90,
        sol=(282.0, 16.0), paleta='dorada', cielo='dorada', acabado='dia', cielo_E=36.0, bruma_D=45000.0,
        resplandor=(255, 226, 184), resplandor_k=0.22, linea_firn=5000.0, nieve_sesgo=11.0, textura_d=260.0,
        cirros=0.22, cirros_color=(244, 230, 212),
        cumulos=[dict(u=0.93, v=0.30, w=0.09, h=0.06, n=60, dist=30000, calida=True)],
        objetos=[dict(tipo='cresta', textura='morrena', luz=(160, 140, 120), sombra=(82, 78, 92),
                      puntos=[(0.0, 0.875), (0.12, 0.881), (0.30, 0.889), (0.50, 0.894), (0.70, 0.888),
                              (0.86, 0.881), (1.0, 0.874)],
                      encima=[dict(tipo='piedras', n=480, caja=(0.0, 1.0, 0.89, 1.0), r=(0.003, 0.015),
                                   base=(58, 54, 60), clara=(164, 146, 126)),
                              dict(tipo='mastil_banderas', de=(0.22, 0.915, 0.08), a=(0.60, 0.92, 0.075), ancho=0.012),
                              dict(tipo='carpa', uv=(0.06, 0.965), ancho=0.075, color=(222, 168, 44)),
                              dict(tipo='carpa', uv=(0.16, 0.935), ancho=0.05, color=(214, 104, 38)),
                              dict(tipo='comedor', uv=(0.40, 0.94), ancho=0.10, color=(70, 110, 160)),
                              dict(tipo='carpa', uv=(0.68, 0.93), ancho=0.048, color=(196, 58, 44)),
                              dict(tipo='carpa', uv=(0.78, 0.962), ancho=0.07, color=(92, 140, 70)),
                              dict(tipo='carpa', uv=(0.91, 0.935), ancho=0.05, color=(226, 196, 70)),
                              dict(tipo='escalador', uv=(0.555, 0.962), alto=0.07, color=(214, 104, 38),
                                   inclinacion=0.03, piolet=False, mira=-1)])]),
    'campo_1': dict(
        titulo='Campo 1', subtitulo='5 850 m · media mañana · collado noreste',
        texto='Desde el collado noreste la arista sube 2 300 m hasta la cima, a 4 km. A la izquierda cae la cara '
              'este hacia el Kali Gandaki; a la derecha, la cara norte, todavía en sombra. Una cordada sale del '
              'campo hacia el primer resalte.',
        xy=CAMPOS['C1'], ojo=3.0, rumbo=246.0, hfov=72.0, cy=0.86,
        sol=(158.0, 46.0), paleta='dia', cielo='altura', acabado='dia', cielo_E=42.0, bruma_D=55000.0,
        linea_firn=5000.0, nieve_sesgo=9.0, bump=0.4,
        cumulos=[dict(u=0.08, v=0.42, w=0.10, h=0.07, n=60, dist=30000)],
        objetos=[dict(tipo='carpa', uv=uv, color=c) for uv, c in [
                     ((0.07, 0.93), (222, 168, 44)), ((0.15, 0.95), (214, 104, 38)), ((0.25, 0.925), (226, 196, 70)),
                     ((0.86, 0.94), (196, 58, 44)), ((0.93, 0.925), (64, 112, 168))]] +
                [dict(tipo='escalador', uv=uv, color=c, inclinacion=0.35, mira=-1)
                 for uv, c in zip(CORDADA_C1, [(196, 58, 44), (64, 112, 168), (226, 196, 70)])] +
                [dict(tipo='cuerda', uvs=CORDADA_C1, altura=0.9, color=(150, 60, 50), ancho=0.5)]),
    'campo_2': dict(
        titulo='Campo 2', subtitulo='6 500 m · atardecer · al este, el Annapurna',
        texto='El sol se pone detrás del Dhaulagiri y su sombra cruza el desfiladero del Kali Gandaki, 4 000 m más '
              'abajo. Al otro lado aún arden el Nilgiri, el Tilicho y el Annapurna I, a 33 km; abajo, la arista '
              'baja hacia el collado noreste del Campo 1.',
        xy=CAMPOS['C2'], ojo=1.7, rumbo=104.0, hfov=70.0, cy=0.46,
        sol=(289.0, 2.5), paleta='ocaso', cielo='venus', acabado='ocaso', cielo_E=26.0, bruma_D=110000.0,
        resplandor=(255, 206, 176), resplandor_k=0.10, linea_firn=5000.0, nieve_sesgo=7.5, cirros=0.12,
        bump_roca=0.45, intensidad_luz=1.15, bruma_valle=0.08,
        objetos=[dict(tipo='cresta', puntos=[(0.0, 0.83), (0.10, 0.842), (0.20, 0.862), (0.30, 0.89), (0.38, 0.93),
                                             (0.44, 1.02)],
                      luz=(236, 214, 206), sombra=(104, 108, 160),
                      encima=[dict(tipo='carpa', uv=(0.07, 0.90), ancho=0.085, color=(226, 196, 70)),
                              dict(tipo='carpa', uv=(0.17, 0.93), ancho=0.10, color=(214, 104, 38)),
                              dict(tipo='escalador', uv=(0.265, 0.95), alto=0.13, color=(64, 112, 168),
                                   inclinacion=0.05, mira=1)])]),
    'campo_3': dict(
        titulo='Campo 3', subtitulo='7 300 m · medianoche · al noreste, el Tukuche Peak bajo la luna',
        texto='Medianoche en la arista noreste, antes del ataque a la cima. La luna, alta en el suroeste, alumbra el '
              'Tukuche Peak, 7 km al noreste y 400 m más bajo, y detrás las mesetas del Mustang bajo las estrellas. '
              'En las carpas aún hay luz; un escalador enciende el frontal.',
        xy=CAMPOS['C3'], ojo=1.7, rumbo=46.0, hfov=72.0, cy=0.34,
        sol=(215.0, 32.0), paleta='noche', cielo='noche', acabado='noche', cielo_E=40.0, bruma_D=95000.0,
        linea_firn=5000.0, nieve_sesgo=7.5, bump=0.3, bruma_valle=0.04,
        objetos=[dict(tipo='estrellas', n=2600),
                 dict(tipo='cresta', puntos=[(0.0, 0.905), (0.14, 0.90), (0.30, 0.908), (0.46, 0.922), (0.62, 0.93),
                                             (0.80, 0.926), (1.0, 0.915)],
                      luz=(150, 166, 206), sombra=(44, 56, 96),
                      encima=[dict(tipo='carpa', uv=(0.10, 0.958), ancho=0.10, color=(226, 160, 70)),
                              dict(tipo='carpa', uv=(0.24, 0.948), ancho=0.08, color=(214, 120, 50)),
                              dict(tipo='escalador', uv=(0.74, 0.965), alto=0.115, color=(196, 58, 44),
                                   inclinacion=0.12, mira=1),
                              dict(tipo='resplandor', uv=(0.10, 0.935), r=0.065),
                              dict(tipo='resplandor', uv=(0.24, 0.93), r=0.05),
                              dict(tipo='frontal', uv=(0.752, 0.862), r=0.0034, haz=(0.86, 0.95))])]),
    'cumbre': dict(
        titulo='Cumbre', subtitulo='8 167 m · media mañana · al oeste, el Dhaulagiri Himal',
        texto='Desde la arista cimera, a unos pasos de la cima, la cordillera entera hacia el oeste: sobre la cuenca '
              'alta del Chhonbardan, los Dhaulagiri II, III, IV y V; detrás, el Churen Himal y el Putha Hiunchuli, y a '
              'la izquierda el Dhaulagiri VI y el Gurja Himal. Las nubes de la mañana llenan ya los valles del Myagdi.',
        xy=CUMBRE_OESTE, ojo=2.0, rumbo=290.0, hfov=48.0, cy=0.38,
        sol=(160.0, 42.0), paleta='dia', cielo='altura', acabado='dia', cielo_E=34.0, bruma_D=80000.0,
        linea_firn=5000.0, nieve_sesgo=7.0, bump=0.4, bruma_valle=0.10,
        mar_nubes=dict(nivel=4300.0, escala=2600.0, claros=0.55, bruma_D=110000.0, relieve=300.0),
        cumulos=[dict(u=0.20, v=0.47, w=0.10, h=0.05, n=60, dist=30000),
                 dict(u=0.82, v=0.50, w=0.12, h=0.05, n=60, dist=40000)],
        objetos=[dict(tipo='cresta', puntos=[(0.0, 0.93), (0.18, 0.905), (0.36, 0.882), (0.48, 0.868), (0.56, 0.864),
                                             (0.64, 0.872), (0.80, 0.895), (1.0, 0.93)],
                      encima=[dict(tipo='escalador', uv=(0.56, 0.866), alto=0.115, color=(214, 104, 38),
                                   inclinacion=0.0, mira=-1),
                              dict(tipo='mastil_banderas', de=(0.585, 0.868, 0.05), a=(0.76, 0.888, 0.004),
                                   ancho=0.013)])]),
}

ORDEN = ['poon_hill', 'campo_base', 'campo_1', 'campo_2', 'campo_3', 'cumbre']
SEMILLAS = {'poon_hill': 101, 'campo_base': 202, 'campo_1': 303, 'campo_2': 404, 'campo_3': 505, 'cumbre': 606}
# encuadres verticales (móvil): recorte 1:2 de la apaisada, centrado en esta fracción del ancho
RECORTE_V = {'poon_hill': 0.50, 'campo_base': 0.55, 'campo_1': 0.50, 'campo_2': 0.62, 'campo_3': 0.50,
             'cumbre': 0.50}
