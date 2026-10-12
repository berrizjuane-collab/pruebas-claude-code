"""The Abruzzi Spur route in the local ENU frame (metres).

Horizontal positions follow the SE-ridge crest traced on the Copernicus GLO-30 DEM
(highest-ground path from the summit to the Godwin-Austen Glacier); above the Shoulder
the line follows the standard summit-day itinerary: up the Bottleneck couloir, a
leftward traverse beneath the serac, then the summit snowfield.  'alt' is the commonly
quoted (approximate) altitude used for labels; the drawn line is draped on the terrain.
"""
import numpy as np

# name, x, y, quoted altitude
WAYPOINTS = [
    ('Campo Base',          1180.0, -4420.0, 5150),
    ('ABC',                 2330.0, -2620.0, 5350),
    ('C1',                  1900.0, -2010.0, 6050),
    ('Chimenea de House',   1645.0, -1495.0, 6600),
    ('C2',                  1640.0, -1390.0, 6700),
    ('Pirámide Negra',      1420.0, -1120.0, 7050),
    ('C3',                  1190.0,  -890.0, 7400),
    ('Hombro',               960.0,  -660.0, 7700),
    ('C4',                   698.0,  -332.0, 7900),
    ('Bottleneck',           440.0,  -265.0, 8200),
    ('Travesía',             315.0,  -360.0, 8300),
    ('Arista final',         110.0,  -315.0, 8450),
    ('Cumbre',               -80.0,  -200.0, 8611),
]

# denser polyline for drawing: ridge-crest samples from ABC to Camp IV (the part above
# Camp IV comes from summit.route_upper)
CREST_LOWER = np.array([
    [2330, -2620], [2260, -2500], [2180, -2420], [2100, -2340], [2020, -2260], [1990, -2140],
    [1900, -2010], [1820, -1940], [1760, -1860], [1760, -1780], [1730, -1700], [1680, -1620],
    [1645, -1495], [1640, -1390], [1600, -1300], [1520, -1220], [1440, -1140], [1360, -1060],
    [1280, -980], [1190, -890], [1120, -820], [1040, -740], [960, -660], [880, -580],
    [800, -500], [760, -430], [725, -380], [698, -332]], dtype=np.float64)


def full_polyline(scene):
    import summit
    up = summit.route_upper(scene.frame)
    return np.concatenate([CREST_LOWER[:-1], up], axis=0)


def waypoint(name):
    for w in WAYPOINTS:
        if w[0] == name:
            return np.array(w[1:3], dtype=np.float64), w[3]
    raise KeyError(name)


def draped(scene, pts=None, step=6.0, lift=1.5):
    """Resample polyline every `step` m and drape it on the terrain."""
    if pts is None:
        pts = full_polyline(scene)
    seg = np.hypot(*np.diff(pts, axis=0).T)
    s = np.r_[0, np.cumsum(seg)]
    ss = np.arange(0, s[-1], step)
    x = np.interp(ss, s, pts[:, 0])
    y = np.interp(ss, s, pts[:, 1])
    z = scene.height(x, y) + lift
    return np.stack([x, y, z], -1), ss


class RouteTrack:
    """Arc-length parametrised, terrain-draped route (rebuild after changing the scene's fine level)."""

    def __init__(self, scene, step=1.0, lift=0.0):
        self.P, self.S = draped(scene, step=step, lift=lift)
        self.scene = scene

    def s_of(self, xy):
        d = np.hypot(self.P[:, 0] - xy[0], self.P[:, 1] - xy[1])
        return float(self.S[np.argmin(d)])

    def pos(self, s, lift=0.0):
        s = np.clip(s, 0, self.S[-1])
        x = np.interp(s, self.S, self.P[:, 0])
        y = np.interp(s, self.S, self.P[:, 1])
        z = self.scene.height(np.atleast_1d(x), np.atleast_1d(y))
        if np.ndim(s) == 0:
            return np.array([x, y, z[0] + lift])
        return np.stack([x, y, z + lift], -1)

    def dir(self, s, ds=3.0):
        a, b = self.pos(s - ds), self.pos(s + ds)
        d = b - a
        return d / (np.linalg.norm(d) + 1e-9)
