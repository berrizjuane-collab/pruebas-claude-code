"""Lectura de las teselas Copernicus DEM GLO-90 reempaquetadas por el proyecto Vershiny.

Formato (ver index.json de cada capa):
  * rejilla global lat/lon, celda `cellDeg` grados, teselas de 256x256 celdas;
  * la celda (i, j) cubre lon = -180 + i*cellDeg, lat = 90 - j*cellDeg (filas de norte a sur);
  * cada tesela es int16 little-endian, filtrada con delta a lo largo de cada fila
    (desborde simétrico de int16) y comprimida con gzip; altura = valor * quantM metros.

Capas en data/:
  dem_hi/0_{tx}_{ty}.bin.gz   ~87 m (0.00078125 deg)  -> agran/vershiny-dem-hi
  dem_lo/{lod}_{tx}_{ty}.bin.gz  lod 0 ~217 m, lod 1 ~434 m  -> agran/vershiny-dem

mosaico(capa, lod, lon0, lat0, lon1, lat1) -> (Z, lons, lats)   Z float32, filas de norte a sur.
"""
import os
import gzip
import json
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DATOS = next((p for p in (os.path.join(HERE, '..', 'data'), os.path.join(HERE, 'data'))
              if os.path.isdir(p)), os.path.join(HERE, '..', 'data'))
_IDX = {}


def indice(capa, lod=0):
    if capa not in _IDX:
        _IDX[capa] = json.load(open(os.path.join(DATOS, 'dem_' + capa, 'index.json')))
    return _IDX[capa]['lods'][lod]


def leer_tesela(capa, lod, tx, ty):
    ruta = os.path.join(DATOS, 'dem_' + capa, f'{lod}_{tx}_{ty}.bin.gz')
    if not os.path.exists(ruta):
        return None
    L = indice(capa, lod)
    d = np.frombuffer(gzip.decompress(open(ruta, 'rb').read()), dtype='<i2').reshape(256, 256)
    z = np.cumsum(d.astype(np.int64), axis=1)
    z = ((z + 32768) % 65536) - 32768
    return (z * L['quantM']).astype(np.float32)


def mosaico(capa, lod, lon0, lat0, lon1, lat1):
    """Rejilla de celdas que cubre [lon0, lon1] x [lat0, lat1]; NaN donde no hay tesela."""
    L = indice(capa, lod)
    c = L['cellDeg']
    i0 = int(np.floor((lon0 + 180) / c)); i1 = int(np.ceil((lon1 + 180) / c))
    j0 = int(np.floor((90 - lat1) / c)); j1 = int(np.ceil((90 - lat0) / c))
    Z = np.full((j1 - j0 + 1, i1 - i0 + 1), np.nan, np.float32)
    for tx in range(i0 // 256, i1 // 256 + 1):
        for ty in range(j0 // 256, j1 // 256 + 1):
            t = leer_tesela(capa, lod, tx, ty)
            if t is None:
                continue
            a0, b0 = tx * 256, ty * 256
            ia, ib = max(i0, a0), min(i1, a0 + 255)
            ja, jb = max(j0, b0), min(j1, b0 + 255)
            if ia > ib or ja > jb:
                continue
            Z[ja - j0:jb - j0 + 1, ia - i0:ib - i0 + 1] = t[ja - b0:jb - b0 + 1, ia - a0:ib - a0 + 1]
    lons = -180 + (np.arange(i0, i1 + 1) + 0.5) * c
    lats = 90 - (np.arange(j0, j1 + 1) + 0.5) * c
    return Z, lons, lats
