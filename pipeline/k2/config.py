"""Configuración única del pipeline: sistema de referencia, rejillas y fuentes.

Todo lo que el navegador necesita saber de estas decisiones se copia a
public/data/manifest.json; la aplicación nunca reinterpreta los datos por su
cuenta.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PIPELINE = ROOT / "pipeline"
CACHE = PIPELINE / ".cache"
PUBLIC_DATA = ROOT / "public" / "data"
FIXTURES = ROOT / "tests" / "fixtures"
CURATED = PIPELINE / "curated"

# ---------------------------------------------------------------------------
# Sistema espacial
# ---------------------------------------------------------------------------
# Coordenada publicada de la cumbre (Wikipedia/GeoNames, 35°52'57"N 76°30'48"E).
# Solo fija el ORIGEN del sistema local; la cumbre del modelo se busca en el DEM.
ORIGIN_LAT = 35.8825
ORIGIN_LON = 76.5133

# Transversa de Mercator local centrada en el origen (k=1). En ella el norte de
# cuadrícula coincide con el norte geográfico en el meridiano del origen; la
# convergencia en el borde del área (±36 km) es < 0,2°.
LOCAL_CRS = (
    f"+proj=tmerc +lat_0={ORIGIN_LAT} +lon_0={ORIGIN_LON} +k=1 "
    "+x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs"
)

# Referencia vertical: alturas ortométricas EGM2008 (las del DEM Copernicus).
# Altura local de renderizado: y = altitud - H0.
H0 = 6000.0

# Codificación PNG de 16 bits de las alturas: H = OFFSET + SCALE * v
HEIGHT_OFFSET = 3000.0
HEIGHT_SCALE = 0.1


@dataclass(frozen=True)
class Grid:
    name: str
    spacing: float  # metros entre muestras
    half: float  # semilado en metros (rejilla centrada en el origen)

    @property
    def n(self) -> int:
        return int(round(2 * self.half / self.spacing)) + 1

    def xs(self):
        import numpy as np

        return -self.half + np.arange(self.n) * self.spacing

    def ys(self):
        import numpy as np

        # fila 0 = norte
        return self.half - np.arange(self.n) * self.spacing


# Núcleo: 14,4 km de lado a 25 m (6×6 bloques de 96 celdas).
CORE = Grid("core", 25.0, 7200.0)
# Contexto: 43,2 km a 100 m (6×6 bloques de 72 celdas; el núcleo ocupa los 2×2 centrales).
CONTEXT = Grid("context", 100.0, 21600.0)
# Horizonte: 72 km a 400 m; anillo exterior sin el área del contexto.
FAR = Grid("far", 400.0, 36000.0)
# Rejilla de análisis (no se publica): 25 m con margen para horizontes y rutas.
ANALYSIS = Grid("analysis", 25.0, 10000.0)

GRIDS = {g.name: g for g in (CORE, CONTEXT, FAR)}

# ---------------------------------------------------------------------------
# Fuentes
# ---------------------------------------------------------------------------
COP_BUCKET = "https://copernicus-dem-30m.s3.amazonaws.com"
COP_TILES = ["N35_00_E076_00", "N36_00_E076_00"]
COP_AUX = ["FLM", "EDM", "HEM", "WBM"]

S2_BUCKET = "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs"
# Escena elegida: 2024-08-14, 1,1 % de nubes en la tesela, temporada de escalada,
# sol alto (63,6°). Se usa la tesela 43SFV y, para el anillo de horizonte, la
# 43SFA de la misma pasada.
S2_SCENES = {
    "43SFV": "43/S/FV/2024/8/S2A_43SFV_20240814_0_L2A",
    "43SFA": "43/S/FA/2024/8/S2A_43SFA_20240814_0_L2A",
}
S2_BANDS = ["B02", "B03", "B04", "B11", "SCL"]

# Cumbre convencional y corrección local
SUMMIT_ALTITUDE = 8611.0
SUMMIT_SEARCH_RADIUS = 500.0  # m alrededor del origen para buscar el máximo del DEM
SUMMIT_CORRECTION_RADIUS = 250.0  # m; soporte compacto de la corrección

# Umbral de la zona de la muerte (altitud geográfica)
DEATH_ZONE_ALTITUDE = 8000.0

# Clases de la máscara de relleno (FLM) de Copernicus DEM (Product Handbook)
FLM_CLASSES = {
    0: "Vacío",
    1: "Editado (sin relleno)",
    2: "TanDEM-X sin editar",
    3: "Relleno ASTER",
    4: "Relleno SRTM90",
    5: "Relleno SRTM30",
    6: "Relleno GMTED2010",
    7: "Relleno SRTM30plus",
    8: "Relleno TerraSAR-X radargramétrico",
    9: "Relleno AW3D30",
}
