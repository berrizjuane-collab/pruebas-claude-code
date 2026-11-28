"""Baja a data/ las teselas del relieve que usa el motor (no van en el zip: pesan ~460 MB).

Fuente: Copernicus DEM, en el registro de datos abiertos de AWS (sin cuenta ni clave):
  GLO-30  https://copernicus-dem-30m.s3.amazonaws.com/<nombre>/<nombre>.tif   (~30 m, 7 teselas)
  GLO-90  https://copernicus-dem-90m.s3.amazonaws.com/<nombre>/<nombre>.tif   (~90 m, 35 teselas)

    python3 descargar_dem.py            # baja lo que falte (se puede relanzar: no repite)
"""
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
import dem

BUCKET = {'glo30': 'https://copernicus-dem-30m.s3.amazonaws.com',
          'glo90': 'https://copernicus-dem-90m.s3.amazonaws.com'}
# (lat_sur, lon_oeste) de cada tesela de 1° x 1°
TESELAS = {
    # macizo, Kali Gandaki, Annapurna y Poon Hill: nivel fino (L0) y medio (L1)
    'glo30': [(27, 83), (28, 82), (28, 83), (28, 84), (29, 82), (29, 83), (29, 84)],
    # horizontes lejanos (L2): 26-31 N, 80-87 E
    'glo90': [(la, lo) for la in range(26, 31) for lo in range(80, 87)],
}


def bajar(capa, lat, lon):
    nombre = dem.nombre_tesela(capa, lat, lon)
    destino = os.path.join(dem.DATOS, capa, nombre)
    if os.path.exists(destino) and os.path.getsize(destino) > 0:
        return nombre, 'ya estaba'
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    url = f'{BUCKET[capa]}/{nombre[:-4]}/{nombre}'
    tmp = destino + '.part'
    for intento in range(4):
        try:
            with urllib.request.urlopen(url, timeout=120) as r, open(tmp, 'wb') as f:
                while True:
                    b = r.read(1 << 20)
                    if not b:
                        break
                    f.write(b)
            os.replace(tmp, destino)
            return nombre, f'{os.path.getsize(destino) / 1e6:.0f} MB'
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):        # tesela de mar o inexistente: el motor la trata como hueco
                return nombre, f'no existe ({e.code})'
        except Exception as e:              # red: reintenta
            err = e
    return nombre, f'ERROR {err}'


if __name__ == '__main__':
    trabajos = [(c, la, lo) for c, lista in TESELAS.items() for la, lo in lista]
    with ThreadPoolExecutor(6) as ex:
        for nombre, estado in ex.map(lambda t: bajar(*t), trabajos):
            print(f'{nombre:48s} {estado}', flush=True)
    if any('ERROR' in bajar(*t)[1] for t in trabajos):
        sys.exit('faltan teselas: vuelve a lanzar el script')
