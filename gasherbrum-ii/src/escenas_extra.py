"""Láminas nuevas para la web, con el mismo motor, y la ruta normal completa del G2.

  VII   La ruta      vista aérea alta desde el suroeste: del Campo Base a la cima por el espolón suroeste
  VIII  La caravana  a pie de glaciar en el Abruzzi, por la mañana: porteadores en fila sobre la morrena,
                     camino del campo base, con el macizo al fondo

La ruta une tres tramos: la cascada de hielo del glaciar Gasherbrum Sur (CB → C1, el mismo trazado que la
web del Gasherbrum I, porque los dos ochomiles comparten campo base y C1), el circo hasta el pie del espolón
y la «Banana Ridge» hasta C2, y RUTA_ALTA de escenas.py (C2 → C3 → C4 → travesía bajo la pirámide → cima).
"""
import math
import escenas as S
import terreno as TR


def _ll(lat, lon):
    return tuple(float(v) for v in TR.ll2xy(lat, lon))


# CB -> C1: cascada de hielo (puntos de paso de la web del G I, compartidos)
CASCADA = [S.CAMPOS['CB'], _ll(35.6950, 76.6520), _ll(35.7040, 76.6545), _ll(35.7130, 76.6530),
           _ll(35.7215, 76.6512), S.CAMPOS['C1']]
# C1 -> C2: travesía del circo (llano a ~5 900 m) y la cresta del espolón desde ~5 950 m
PIE_ESPOLON = (-495.0, -2260.0)
ESPOLON = [S.CAMPOS['C1'], (-400.0, -2700.0), PIE_ESPOLON, (-540.0, -2050.0), (-590.0, -1800.0), S.CAMPOS['C2']]
RUTA = CASCADA + ESPOLON[1:] + S.RUTA_ALTA[1:]
PARADAS = [('CB', S.CAMPOS['CB']), ('C1', S.CAMPOS['C1']), ('C2', S.CAMPOS['C2']), ('C3', S.CAMPOS['C3']),
           ('C4', S.CAMPOS['C4']), ('Cima', S.CAMPOS['Cima'])]
RASGOS = [('cascada', 'Cascada de hielo', _ll(35.7040, 76.6545)),
          ('circo', 'Circo del Gasherbrum Sur', (-120.0, -2850.0)),
          ('banana', 'Banana Ridge', (-560.0, -1950.0)),
          ('piramide', 'Pirámide cimera', (300.0, -400.0))]

# porteadores en fila por la morrena del Abruzzi, camino del campo base
CAM_CARAVANA = (-6750.0, -10000.0)


def _fila2(xy0, rumbo_ini, dist_ini, rumbo_marcha, dists, zigzag=0.0):
    """Fila que arranca a `dist_ini` m de xy0 en `rumbo_ini` y avanza en `rumbo_marcha`."""
    a0 = math.radians(rumbo_ini); a = math.radians(rumbo_marcha)
    x0 = xy0[0] + dist_ini * math.sin(a0); y0 = xy0[1] + dist_ini * math.cos(a0)
    return [(x0 + d * math.sin(a) + zigzag * (-1) ** k * math.cos(a), y0 + d * math.cos(a) - zigzag * (-1) ** k * math.sin(a))
            for k, d in enumerate(dists)]


def _fila(xy0, rumbo_deg, dists, lado=0.0):
    a = math.radians(rumbo_deg)
    return [(xy0[0] + d * math.sin(a) + lado * math.cos(a), xy0[1] + d * math.cos(a) - lado * math.sin(a)) for d in dists]


_CARGAS = ['bidon', 'fardo', 'bidon', 'bidon', 'fardo', 'bidon', 'fardo', 'bidon', 'bidon', 'fardo', 'bidon', 'bidon']
_ROPA = [(120, 96, 78), (96, 104, 92), (140, 78, 60), (88, 88, 108), (150, 132, 104), (104, 84, 70),
         (78, 96, 112), (132, 104, 86), (98, 92, 84), (126, 80, 72), (90, 100, 96), (138, 116, 92)]

S.ESCENAS['ruta'] = dict(
    titulo='La ruta normal', subtitulo='desde 12 500 m al sur-suroeste · media mañana · lámina nueva',
    texto='Vista aérea de la ruta normal entera: el campo base sobre el Abruzzi, la cascada de hielo, el circo del '
          'Gasherbrum Sur, el espolón suroeste y la pirámide cimera.',
    xy=(-3200.0, -24500.0), z_abs=12500.0, rumbo=8.0, hfov=50.0, cy=0.05,
    sol=(128.0, 42.0), paleta='dia', cielo='altura', acabado='dia', cielo_E=36.0, bruma_D=90000.0,
    linea_firn=5450.0, nieve_sesgo=7.0, bump=0.35, dlod=40000.0,
    cumulos=[dict(u=0.08, v=0.08, w=0.08, h=0.04, n=40, dist=60000)],
    objetos=[])

S.ESCENAS['caravana'] = dict(
    titulo='La caravana', subtitulo='≈ 5 200 m · mañana · morrena del glaciar Abruzzi · lámina nueva',
    texto='Una fila de porteadores baltis cruza la morrena del glaciar Abruzzi camino del campo base, con los bidones '
          'y los fardos de la expedición a la espalda. Al fondo, el macizo de los Gasherbrum.',
    xy=CAM_CARAVANA, ojo=1.9, rumbo=55.0, hfov=70.0, cy=0.60,
    sol=(112.0, 24.0), paleta='dia', cielo='altura', acabado='dia', cielo_E=36.0, bruma_D=55000.0,
    linea_firn=5450.0, nieve_sesgo=7.0, textura_d=260.0, bump=0.4,
    cumulos=[dict(u=0.18, v=0.22, w=0.10, h=0.06, n=70, dist=40000),
             dict(u=0.86, v=0.30, w=0.08, h=0.05, n=50, dist=40000, calida=True)],
    objetos=[dict(tipo='piedras', n=700, dmin=10.0, dmax=120.0, sector=40, r=0.18)] +
            [dict(tipo='porteador', xy=p, color=_ROPA[k % len(_ROPA)], carga=_CARGAS[k % len(_CARGAS)], mira=1,
                  inclinacion=-0.42)
             for k, p in enumerate(_fila2(CAM_CARAVANA, 86.0, 13.0, 38.0, [0, 5, 10.5, 16.5, 23, 30, 38, 47, 57, 68, 80],
                                          zigzag=0.6))])

S.ORDEN += ['ruta', 'caravana']
SEMILLAS = {'ruta': 707, 'caravana': 808}

# encuadres verticales (móvil): recorte 1:2 de la apaisada, centrado en esta fracción del ancho
RECORTE_V = {'gondogoro': 0.63, 'campo_base': 0.45, 'campo_1': 0.40, 'campo_2': 0.30, 'campo_3': 0.62,
             'cumbre': 0.36, 'ruta': 0.53, 'caravana': 0.72}
