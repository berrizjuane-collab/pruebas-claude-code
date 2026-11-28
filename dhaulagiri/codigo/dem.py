"""Lectura de las teselas Copernicus DEM (GLO-30 y GLO-90) en GeoTIFF.

Formato de las teselas del bucket público de AWS (descargar_dem.py las baja a data/):
  data/glo30/Copernicus_DSM_COG_10_N28_00_E083_00_DEM.tif   1 segundo de arco (~30 m), 3600 x 3600
  data/glo90/Copernicus_DSM_COG_30_N28_00_E083_00_DEM.tif   3 segundos de arco (~90 m), 1200 x 1200
Cada tesela cubre 1° x 1°; el píxel (0, 0) está centrado en la esquina NO (PixelIsPoint), filas de
norte a sur.  Por debajo de 50° de latitud el paso es igual en latitud y longitud.

mosaico(capa, lon0, lat0, lon1, lat1, reduccion=1) -> (Z, lons, lats)
    Z float32, filas de norte a sur, NaN donde falta tesela.  `reduccion` = k promedia bloques k x k
    (para los niveles gruesos: menos memoria y sin aliasing).
"""
import os
import numpy as np
import tifffile

HERE = os.path.dirname(os.path.abspath(__file__))
DATOS = os.path.join(HERE, 'data')
CAPAS = {'glo30': (3600, 'Copernicus_DSM_COG_10_{lat}_00_{lon}_00_DEM.tif'),
         'glo90': (1200, 'Copernicus_DSM_COG_30_{lat}_00_{lon}_00_DEM.tif')}
_CACHE = {}


def nombre_tesela(capa, lat_sur, lon_oeste):
    n, plantilla = CAPAS[capa]
    la = ('N' if lat_sur >= 0 else 'S') + f'{abs(lat_sur):02d}'
    lo = ('E' if lon_oeste >= 0 else 'W') + f'{abs(lon_oeste):03d}'
    return plantilla.format(lat=la, lon=lo)


def leer_tesela(capa, lat_sur, lon_oeste):
    clave = (capa, lat_sur, lon_oeste)
    if clave in _CACHE:
        return _CACHE[clave]
    ruta = os.path.join(DATOS, capa, nombre_tesela(capa, lat_sur, lon_oeste))
    if not os.path.exists(ruta):
        return None
    z = tifffile.imread(ruta).astype(np.float32)
    z[z < -1000] = np.nan
    if capa == 'glo30':           # las de 30 m pesan 52 MB: no se guardan en memoria entre llamadas
        return z
    _CACHE[clave] = z
    return z


def mosaico(capa, lon0, lat0, lon1, lat1, reduccion=1):
    """Rejilla de celdas que cubre [lon0, lon1] x [lat0, lat1] (centros de celda)."""
    n = CAPAS[capa][0]
    c = 1.0 / n
    # índices globales: i = (lon + 180) * n, j = (90 - lat) * n  (centros de píxel en múltiplos de c)
    i0 = int(np.floor((lon0 + 180) * n)); i1 = int(np.ceil((lon1 + 180) * n))
    j0 = int(np.floor((90 - lat1) * n)); j1 = int(np.ceil((90 - lat0) * n))
    Z = np.full((j1 - j0 + 1, i1 - i0 + 1), np.nan, np.float32)
    for lon_o in range(int(np.floor(lon0)), int(np.floor(lon1)) + 1):
        for lat_s in range(int(np.floor(lat0)), int(np.floor(lat1)) + 1):
            t = leer_tesela(capa, lat_s, lon_o)
            if t is None:
                continue
            # la tesela (lat_s, lon_o): fila 0 = lat_s + 1, columna 0 = lon_o
            a0 = (lon_o + 180) * n
            b0 = (90 - (lat_s + 1)) * n
            ia, ib = max(i0, a0), min(i1, a0 + n - 1)
            ja, jb = max(j0, b0), min(j1, b0 + n - 1)
            if ia > ib or ja > jb:
                continue
            sub = t[ja - b0:jb - b0 + 1, ia - a0:ib - a0 + 1]
            dst = Z[ja - j0:jb - j0 + 1, ia - i0:ib - i0 + 1]
            Z[ja - j0:jb - j0 + 1, ia - i0:ib - i0 + 1] = np.where(np.isnan(dst), sub, dst)
    lons = -180 + np.arange(i0, i1 + 1) * c
    lats = 90 - np.arange(j0, j1 + 1) * c
    if reduccion > 1:
        k = int(reduccion)
        h, w = (Z.shape[0] // k) * k, (Z.shape[1] // k) * k
        Z = np.nanmean(Z[:h, :w].reshape(h // k, k, w // k, k), axis=(1, 3)).astype(np.float32)
        lons = lons[:w].reshape(-1, k).mean(1)
        lats = lats[:h].reshape(-1, k).mean(1)
    return Z, lons, lats
