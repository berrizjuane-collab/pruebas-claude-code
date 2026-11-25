"""pintar.py <escena,...> W H salida — pinta escenas (incluidas las extra) con generar.generar."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import extras  # noqa
import generar
for k in sys.argv[1].split(','):
    generar.generar(k, int(sys.argv[2]), int(sys.argv[3]), salida=sys.argv[4])
