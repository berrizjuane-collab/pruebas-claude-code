"""Camera paths: Catmull-Rom through keyframes with eased time."""
import numpy as np
from camera import Camera


def ease_io(x, k=2.0):
    x = np.clip(x, 0.0, 1.0)
    return x ** k / (x ** k + (1 - x) ** k)


def _cr(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)


class CamPath:
    """keys: list of (u, pos(3), target(3), hfov, roll) with u in [0,1] (shot-normalised time)."""

    def __init__(self, keys, ease=1.6):
        self.keys = sorted(keys, key=lambda k: k[0])
        self.ease = ease

    def _interp(self, idx, u):
        ks = self.keys
        us = [k[0] for k in ks]
        if u <= us[0]:
            return np.asarray(ks[0][idx], dtype=np.float64)
        if u >= us[-1]:
            return np.asarray(ks[-1][idx], dtype=np.float64)
        j = np.searchsorted(us, u) - 1
        t = (u - us[j]) / (us[j + 1] - us[j])
        g = lambda i: np.asarray(ks[min(max(i, 0), len(ks) - 1)][idx], dtype=np.float64)  # noqa: E731
        return _cr(g(j - 1), g(j), g(j + 1), g(j + 2), t)

    def at(self, u, W=1920, H=1080):
        ue = float(ease_io(u, self.ease)) if self.ease else u
        pos = self._interp(1, ue)
        tgt = self._interp(2, ue)
        fov = float(self._interp(3, ue))
        roll = float(self._interp(4, ue)) if len(self.keys[0]) > 4 else 0.0
        return Camera(pos, tgt, hfov_deg=fov, roll_deg=roll, W=W, H=H)
