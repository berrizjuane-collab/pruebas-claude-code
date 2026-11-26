"""Las seis láminas del Gasherbrum II y su macizo.

Coordenadas locales en metros (x = este, y = norte) con origen en la cumbre del G2 (terreno.LAT0/LON0).
Campos de la ruta normal (espolón SO) ubicados sobre el DEM según las descripciones publicadas
(SummitPost, Explorersweb, Adventure Consultants, AAJ): la cresta del espolón sale del circo del
glaciar Gasherbrum Sur a ~5 950 m y sube recta hasta la pirámide cimera.
  CB  (  800, -7800)  ~5 110 m  glaciar Abruzzi, al pie de la cascada del glaciar Gasherbrum Sur
  C1  ( -300, -3200)  ~5 900 m  plataforma del circo, a ~1 km del pie del espolón
  C2  ( -630, -1600)  ~6 430 m  repisa en el espolón, sobre la "Banana Ridge"
  C3  ( -420,  -950)  ~7 000 m  hombro bajo la pirámide cimera
  C4  ( -175,  -700)  ~7 400 m  inicio de la travesía bajo la pirámide
  Cima(   25,   -88)   8 035 m  (máximo del DEM corregido)
"""
import math

CAMPOS = {
    'CB': (800.0, -7800.0),
    'C1': (-300.0, -3200.0),
    'C2': (-630.0, -1600.0),
    'C3': (-420.0, -950.0),
    'C4': (-175.0, -700.0),
    'Cima': (25.0, -88.0),
}

# ruta aproximada (x, y) de C2 a la cima
RUTA_ALTA = [(-630, -1600), (-615, -1500), (-640, -1400), (-655, -1300), (-640, -1200), (-600, -1110),
             (-520, -1030), (-420, -950), (-330, -880), (-250, -800), (-175, -700), (-60, -660), (80, -640),
             (220, -600), (330, -560), (420, -480), (420, -360), (330, -250), (200, -140), (90, -70), (12, -25)]


def rel(xy, rumbo, dist, az_rel):
    """Punto a `dist` m de xy en el rumbo de la cámara + az_rel (grados)."""
    a = math.radians(rumbo + az_rel)
    return (xy[0] + dist * math.sin(a), xy[1] + dist * math.cos(a))


def _carpas(xy, rumbo, lista, color=None):
    out = []
    for i, (d, a) in enumerate(lista):
        ob = dict(tipo='carpa', xy=rel(xy, rumbo, d, a))
        if color is not None:
            ob['color'] = color[i % len(color)]
        out.append(ob)
    return out


def _ruta_puntos(desde, hasta, paso=25.0):
    """Puntos de RUTA_ALTA entre dos índices, remuestreados cada `paso` m."""
    pts = RUTA_ALTA[desde:hasta + 1]
    out = []
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) / paso))
        for k in range(n):
            t = k / n
            out.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    out.append(pts[-1])
    return out


# ----------------------------------------------------------------------------------------------- escenas
CORDADA_C1 = [(0.375, 0.874), (0.402, 0.8795), (0.432, 0.886)]   # cordada en fila hacia el espolón
CB = CAMPOS['CB']; R_CB = 356.0
C1 = CAMPOS['C1']; R_C1 = 12.0
C2 = CAMPOS['C2']; R_C2 = 108.0
C3 = CAMPOS['C3']; R_C3 = 205.0
CI = (CAMPOS['Cima'][0] + 13.0, CAMPOS['Cima'][1] - 9.0); R_CI = 303.0

ESCENAS = {
    'gondogoro': dict(
        titulo='El macizo desde el Gondogoro La', subtitulo='5 585 m · atardecer · mirando al NE',
        texto='Desde el paso, el macizo entero al último sol: del Broad Peak, en el borde izquierdo, al G1 o '
              '«Hidden Peak», a la derecha; en el centro, el G4, el G3 y la pirámide del G2. Delante, las laderas '
              'del lado norte del paso, ya en sombra.',
        latlon=(35.65306, 76.47528), ojo=45.0, rumbo=47.0, hfov=46.0, cy=0.70,
        sol=(292.0, 4.5), paleta='ocaso', cielo='venus', acabado='ocaso', cielo_E=24.0, cirros=0.16,
        resplandor=(255, 206, 176), resplandor_k=0.18, bruma_D=65000.0, linea_firn=5300.0, nieve_sesgo=6.0,
        bump_roca=0.6,
        cumulos=[],
        objetos=[]),
    'campo_base': dict(
        titulo='Campo Base', subtitulo='5 120 m · mañana · glaciar Abruzzi',
        texto='Sobre la morrena del glaciar Abruzzi, la cascada de hielo del glaciar Gasherbrum Sur sube hacia '
              'el circo; arriba asoma la pirámide del G2 entre el G3 (izquierda) y el G2 Este.',
        xy=CB, ojo=12.0, rumbo=R_CB, hfov=54.0, cy=0.80,
        sol=(108.0, 32.0), paleta='dia', cielo='dia', acabado='dia', cielo_E=34.0, bruma_D=50000.0,
        linea_firn=5450.0, nieve_sesgo=7.0, textura_d=260.0,
        cumulos=[dict(u=0.14, v=0.30, w=0.12, h=0.075, n=80, dist=40000),
                 dict(u=0.90, v=0.26, w=0.10, h=0.06, n=60, dist=40000, calida=True)],
        objetos=[dict(tipo='cresta', textura='morrena', luz=(150, 138, 126), sombra=(84, 80, 88),
                      puntos=[(0.0, 0.858), (0.12, 0.866), (0.30, 0.876), (0.50, 0.884), (0.70, 0.879), (0.86, 0.87),
                              (1.0, 0.862)],
                      encima=[dict(tipo='piedras', n=520, caja=(0.0, 1.0, 0.875, 1.0), r=(0.003, 0.016),
                                   base=(56, 54, 60), clara=(156, 144, 130)),
                              dict(tipo='mastil_banderas', de=(0.19, 0.905, 0.075), a=(0.64, 0.912, 0.08), ancho=0.013),
                              dict(tipo='carpa', uv=(0.07, 0.962), ancho=0.075, color=(222, 168, 44)),
                              dict(tipo='carpa', uv=(0.155, 0.925), ancho=0.05, color=(214, 104, 38)),
                              dict(tipo='carpa', uv=(0.29, 0.945), ancho=0.058, color=(196, 58, 44)),
                              dict(tipo='comedor', uv=(0.46, 0.935), ancho=0.10, color=(70, 110, 160)),
                              dict(tipo='carpa', uv=(0.615, 0.922), ancho=0.046, color=(226, 196, 70)),
                              dict(tipo='carpa', uv=(0.73, 0.958), ancho=0.07, color=(92, 140, 70)),
                              dict(tipo='carpa', uv=(0.885, 0.928), ancho=0.048, color=(230, 122, 30)),
                              dict(tipo='escalador', uv=(0.545, 0.952), alto=0.07, color=(214, 104, 38),
                                   inclinacion=0.03, piolet=False, mira=-1)])]),
    'campo_1': dict(
        titulo='Campo 1', subtitulo='5 880 m · tarde · circo del glaciar Gasherbrum Sur',
        texto='La pared sur del G2 desde el circo, con el G3 a la izquierda y el G2 Este a la derecha. Por el centro '
              'sube el espolón suroeste, la ruta normal; una cordada cruza el circo hacia su pie.',
        xy=C1, ojo=4.0, rumbo=R_C1, hfov=78.0, cy=0.84,
        sol=(236.0, 30.0), paleta='dia', cielo='altura', acabado='dia', cielo_E=42.0, bruma_D=55000.0,
        linea_firn=5450.0, nieve_sesgo=10.0, bump=0.4,
        cumulos=[dict(u=0.93, v=0.40, w=0.10, h=0.07, n=60, dist=30000, calida=True)],
        objetos=([dict(tipo='carpa', uv=uv, color=c) for uv, c in [
                     ((0.085, 0.935), (222, 168, 44)), ((0.145, 0.918), (214, 104, 38)), ((0.205, 0.94), (226, 196, 70)),
                     ((0.82, 0.925), (196, 58, 44)), ((0.875, 0.945), (222, 168, 44))]] +
                 [dict(tipo='escalador', uv=uv, color=c, inclinacion=-0.3, mira=-1)
                  for uv, c in zip(CORDADA_C1, [(196, 58, 44), (64, 112, 168), (226, 196, 70)])] +
                 [dict(tipo='cuerda', uvs=CORDADA_C1, altura=0.9, color=(150, 60, 50), ancho=0.5)])),
    'campo_2': dict(
        titulo='Campo 2', subtitulo='6 410 m · tarde dorada · el Gasherbrum I al otro lado del circo',
        texto='La luz baja de la tarde enciende la cara oeste del Gasherbrum I (8 080 m), al otro lado del circo, '
              'que abajo ya está en sombra. Las carpas del Campo 2 ocupan una repisa del espolón.',
        xy=C2, ojo=1.7, rumbo=118.0, hfov=58.0, cy=0.56,
        sol=(266.0, 11.0), paleta='dorada', cielo='dorada', acabado='dia', cielo_E=32.0, bruma_D=60000.0,
        resplandor=(255, 226, 180), resplandor_k=0.20, linea_firn=5450.0, nieve_sesgo=7.5, cirros=0.30,
        cirros_color=(244, 226, 206),
        cumulos=[dict(u=0.86, v=0.34, w=0.11, h=0.06, n=60, dist=40000, calida=True)],
        bump_roca=0.45,
        objetos=[dict(tipo='cresta', puntos=[(0.0, 0.835), (0.10, 0.842), (0.22, 0.858), (0.32, 0.885), (0.40, 0.93),
                                             (0.46, 1.02)],
                      luz=(248, 226, 186), sombra=(120, 128, 178),
                      encima=[dict(tipo='carpa', uv=(0.075, 0.905), ancho=0.085, color=(226, 196, 70)),
                              dict(tipo='carpa', uv=(0.175, 0.935), ancho=0.10, color=(214, 104, 38)),
                              dict(tipo='escalador', uv=(0.272, 0.95), alto=0.13, color=(64, 112, 168),
                                   inclinacion=0.05, mira=1)])]),
    'campo_3': dict(
        titulo='Campo 3', subtitulo='7 010 m · medianoche · luna sobre el mar de nubes',
        texto='Medianoche en el hombro bajo la pirámide cimera. Los valles duermen bajo un mar de nubes; la luna, '
              'baja en el sursuroeste, alumbra el Gasherbrum VI, el Chogolisa y el Gasherbrum V.',
        xy=C3, ojo=1.7, rumbo=R_C3, hfov=72.0, cy=0.38,
        sol=(196.0, 14.0), paleta='noche', cielo='noche', acabado='noche', cielo_E=40.0, bruma_D=80000.0,
        linea_firn=5450.0, nieve_sesgo=7.5, bump=0.3,
        mar_nubes=dict(nivel=5650.0, escala=2600.0, claros=0.45, bruma_D=90000.0, relieve=200.0,
                       tonos=((40, 52, 92), (110, 124, 168), (196, 206, 232)), bruma=(70, 84, 128),
                       claro_color=(12, 18, 42)),
        objetos=[dict(tipo='estrellas', n=2400), dict(tipo='luna', az=196.0, elev=14.0, r=7),
                 dict(tipo='cresta', puntos=[(0.0, 0.875), (0.18, 0.885), (0.36, 0.905), (0.52, 0.915), (0.70, 0.905),
                                             (0.86, 0.888), (1.0, 0.878)],
                      luz=(150, 166, 206), sombra=(44, 56, 96),
                      encima=[dict(tipo='carpa', uv=(0.12, 0.955), ancho=0.11, color=(226, 160, 70)),
                              dict(tipo='carpa', uv=(0.875, 0.95), ancho=0.085, color=(214, 120, 50)),
                              dict(tipo='escalador', uv=(0.68, 0.955), alto=0.115, color=(196, 58, 44),
                                   inclinacion=0.15, mira=-1),
                              dict(tipo='resplandor', uv=(0.12, 0.93), r=0.07),
                              dict(tipo='resplandor', uv=(0.875, 0.93), r=0.055),
                              dict(tipo='frontal', uv=(0.672, 0.853), r=0.0035, haz=(0.55, 0.93))])]),
    'cumbre': dict(
        titulo='Cumbre', subtitulo='8 035 m · primera hora de la tarde · K2 y Broad Peak al noroeste',
        texto='Desde la cima, el Broad Peak (10 km) y, a su derecha, el K2 (19 km), 560 m más alto; alrededor, '
              'el Karakórum asoma sobre un mar de nubes.',
        en_cumbre='Gasherbrum II', xy=CAMPOS['Cima'], ojo=1.7, rumbo=321.0, hfov=52.0, cy=0.45,
        sol=(205.0, 50.0), paleta='dia', cielo='altura', acabado='dia', cielo_E=34.0, bruma_D=75000.0,
        linea_firn=5450.0, nieve_sesgo=7.0, bump=0.4,
        mar_nubes=dict(nivel=5650.0, escala=3200.0, claros=0.55, bruma_D=110000.0, relieve=260.0),
        objetos=[dict(tipo='cresta', puntos=[(0.0, 0.915), (0.20, 0.895), (0.42, 0.872), (0.60, 0.852), (0.70, 0.842),
                                             (0.76, 0.846), (0.86, 0.872), (1.0, 0.925)],
                      encima=[dict(tipo='escalador', uv=(0.712, 0.846), alto=0.115, color=(214, 104, 38),
                                   inclinacion=0.0, mira=-1),
                              dict(tipo='mastil_banderas', de=(0.742, 0.848, 0.062), a=(0.565, 0.866, 0.004),
                                   ancho=0.013)])]),
}


def _resolver_rel():
    """Completa xy de los objetos definidos relativos a la cámara (rel=(dist, az))."""
    import terreno as TR
    for nombre, e in ESCENAS.items():
        if 'latlon' in e:
            xy = tuple(float(v) for v in TR.ll2xy(*e['latlon']))
        else:
            xy = e['xy']
        for ob in e.get('objetos', []):
            if ob.get('xy', 1) is None and 'rel' in ob:
                ob['xy'] = rel(xy, e['rumbo'], *ob['rel'])
            if ob.get('de', 1) is None and 'rel_de' in ob:
                d0, a0, h0 = ob['rel_de']; d1, a1, h1 = ob['rel_a']
                ob['de'] = (*rel(xy, e['rumbo'], d0, a0), h0)
                ob['a'] = (*rel(xy, e['rumbo'], d1, a1), h1)


_resolver_rel()
ORDEN = ['gondogoro', 'campo_base', 'campo_1', 'campo_2', 'campo_3', 'cumbre']
