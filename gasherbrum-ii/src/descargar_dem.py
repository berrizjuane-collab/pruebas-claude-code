"""Vuelve a bajar las teselas del relieve a ../data si faltan (no hace falta si el zip ya trae data/).

Fuentes (GitHub, proyecto Vershiny, Copernicus DEM GLO-90 reempaquetado):
  agran/vershiny-dem-hi  tiles/hi/0/{tx}/{ty}.bin.gz      celda 0.00078125° (~87 m), teselas de 0.2°
  agran/vershiny-dem     tiles/global/{lod}/{tx}/{ty}.bin.gz  lod 0 ~217 m (0.5°), lod 1 ~434 m (1°)
Usa git con clonado parcial (sin descargar el repositorio entero).
"""
import os
import json
import shutil
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')
HI = [(tx, ty) for tx in range(1276, 1291) for ty in range(266, 278)]
LO = [(0, tx, ty) for tx in range(507, 521) for ty in range(103, 114)] + \
     [(1, tx, ty) for tx in range(250, 263) for ty in range(49, 59)]


def _git(args, cwd):
    subprocess.run(['git'] + args, cwd=cwd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def bajar(repo, rutas, carpeta_idx, destino, nombre):
    tmp = tempfile.mkdtemp()
    try:
        _git(['clone', '--filter=blob:none', '--no-checkout', '--depth', '1', f'https://github.com/agran/{repo}', 'r'], tmp)
        r = os.path.join(tmp, 'r')
        _git(['config', 'gc.auto', '0'], r)
        lista = subprocess.run(['git', 'ls-tree', '-r', '--name-only', 'HEAD'], cwd=r, capture_output=True,
                               text=True, check=True).stdout.split()
        existentes = sorted(set(lista) & set(rutas))
        _git(['checkout', 'HEAD', '--', carpeta_idx + '/index.json'] + existentes, r)
        os.makedirs(destino, exist_ok=True)
        idx = json.load(open(os.path.join(r, carpeta_idx, 'index.json')))
        for L in idx['lods']:
            L.pop('coverage', None)
        json.dump(idx, open(os.path.join(destino, 'index.json'), 'w'), indent=1)
        for p in existentes:
            partes = p.split('/')
            lod, tx, ty = partes[-3], partes[-2], partes[-1].replace('.bin.gz', '')
            shutil.copy(os.path.join(r, p), os.path.join(destino, f'{lod}_{tx}_{ty}.bin.gz'))
        print(nombre, len(existentes), 'teselas')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    bajar('vershiny-dem-hi', [f'tiles/hi/0/{tx}/{ty}.bin.gz' for tx, ty in HI], 'tiles/hi',
          os.path.join(DATA, 'dem_hi'), 'dem_hi')
    bajar('vershiny-dem', [f'tiles/global/{l}/{tx}/{ty}.bin.gz' for l, tx, ty in LO], 'tiles/global',
          os.path.join(DATA, 'dem_lo'), 'dem_lo')
