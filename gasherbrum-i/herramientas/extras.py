"""extras.py — dos láminas nuevas con la misma tubería «pincel seco»:

  VII  La ruta      vista aérea alta desde el oeste: CB, cascada, circo, Gasherbrum La, corredor japonés, cumbre
  VIII Concordia    a pie de glaciar, 4 580 m, mirando al E: el G IV encendido al atardecer y el G I escondido
"""
import os
import sys

CODIGO = os.environ.get('G1_CODIGO')
sys.path.insert(0, CODIGO)

import numpy as np                      # noqa: E402
import vistas                           # noqa: E402
import objetos as oj                    # noqa: E402
from escenas import Escena, CB, C1, C2, C3, CUMBRE, fila_suelo, pix_por_m  # noqa: E402
from vistas import _huella, _corredor, _lado, _rocas, _grava, Campo1, Campo2  # noqa: E402

# camino completo de la ruta normal, del CB a la cumbre (lat, lon)
CASCADA = [CB, (35.6950, 76.6520), (35.7040, 76.6545), (35.7130, 76.6530), (35.7215, 76.6512),
           (35.7290, 76.6500), C1]
CIRCO = Campo1.RUTA
CORREDOR = Campo2.RUTA
CONO = [C3, (35.7305, 76.6912), (35.7282, 76.6940), (35.7262, 76.6966), CUMBRE]
RUTA_COMPLETA = CASCADA[:-1] + CIRCO[:-1] + CORREDOR[:-1] + CONO
PARADAS = [('CB', CB), ('C1', C1), ('C2', C2), ('C3', C3), ('Cumbre', CUMBRE)]


class Ruta(Escena):
    clave = 'ruta'
    numero = 7
    titulo = 'La ruta'
    pos = (35.7120, 76.5300)
    alt = 11500.0
    encuadre = (90.0, 64.0, 0.08)
    encuadre_vertical = (92.0, 46.0, 0.10)
    hora = 10.2
    paleta = 'altura'
    bruma_L = 85e3
    bruma_max = 0.8
    cirros = 0.35
    nubes_mar = None
    cumulos_atras = []
    claro = (0.0, 1.0)

    def retocar(self, T, reg, e, info, U, rel, ctx):
        T = _corredor(T, e, rel, ctx, Campo2.CORREDOR, U)
        return T, reg


class Concordia(Escena):
    clave = 'concordia'
    numero = 8
    titulo = 'Concordia'
    pos = (35.7430, 76.5150)
    sobre_suelo = 1.7
    encuadre = (86.0, 50.0, 0.80)
    encuadre_vertical = (86.0, 34.0, 0.70)
    hora = 18.0
    paleta = 'atardecer'
    bruma_L = 60e3
    cirros = 0.45
    cumulos_atras = [(0.12, 0.40, 0.08, 0.05, 40), (0.90, 0.42, 0.06, 0.04, 30)]
    cumulos_calidos = True
    claro = (60.0, 0.15)

    def objetos(self, c):
        e, L, SS, r = c['e'], c['L'], c['SS'], c['rng']
        H, W = e.S.shape
        lado = _lado(e, self.sol()[0])
        items = []
        colores = [(232, 186, 56), (214, 92, 46), (60, 104, 176), (80, 150, 92), (196, 58, 52)]
        for k, (uf, s) in enumerate([(0.08, 48), (0.17, 62), (0.255, 40), (0.86, 55), (0.94, 44)]):
            u = uf * W
            v = fila_suelo(e, u, s)
            if v is not None:
                items.append((v, u, s, colores[k]))
        items.sort()
        for v, u, s, col in items:
            oj.carpa_domo(L, u * SS, v * SS, 2.2 * pix_por_m(e, s) * SS, col, lado=lado)
        # porteadores en fila camino del Abruzzi
        for uf, s, col in [(0.50, 70, (120, 92, 70)), (0.535, 80, (96, 110, 88)), (0.565, 92, (140, 70, 52)),
                           (0.59, 104, (90, 84, 110))]:
            u = uf * W
            v = fila_suelo(e, u, s)
            if v is not None:
                oj.escalador(L, u * SS, v * SS, 1.7 * pix_por_m(e, s) * SS, chaqueta=col, lado=lado, mira=1,
                             mochila=(200, 176, 120))
        _grava(c, 9000, 40.0, 0.82, lado=lado)
        _rocas(c, 500, 2.0, 50.0, 0.80, r_m=(0.06, 0.7), lado=lado)


vistas.ESCENAS['ruta'] = Ruta
vistas.ESCENAS['concordia'] = Concordia
