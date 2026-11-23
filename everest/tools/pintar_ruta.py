"""Pinta la lámina VIII (la ruta) con la tubería original del pincel seco.
Uso: python -I pintar_ruta.py <dir_recon> <salida.png> <ancho> <alto> <SS> [clave=valor ...]"""
import sys, os, json
HERE = os.path.dirname(os.path.abspath(__file__))
RECON = os.path.abspath(sys.argv[1]); SALIDA = os.path.abspath(sys.argv[2])
sys.path.insert(0, RECON); sys.path.insert(0, HERE)
os.chdir(RECON)
import escenas as ESC
import ruta_cfg

cambios = {}
for kv in sys.argv[6:]:
    k, v = kv.split('=', 1)
    cambios[k] = json.loads(v)
ruta_cfg.registrar(ESC, **cambios)
import generar
generar.generar('ruta', int(sys.argv[3]), int(sys.argv[4]), SALIDA, int(sys.argv[5]))
