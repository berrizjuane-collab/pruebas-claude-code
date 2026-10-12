"""Pinhole camera helpers."""
import numpy as np


def normalize(v):
    v = np.asarray(v, dtype=np.float64)
    return v / (np.linalg.norm(v) + 1e-12)


class Camera:
    def __init__(self, pos, target=None, fwd=None, hfov_deg=50.0, roll_deg=0.0, W=960, H=540):
        self.pos = np.asarray(pos, dtype=np.float64)
        if fwd is None:
            fwd = np.asarray(target, dtype=np.float64) - self.pos
        f = normalize(fwd)
        worldup = np.array([0.0, 0.0, 1.0])
        r = normalize(np.cross(f, worldup))
        u = np.cross(r, f)
        if roll_deg:
            a = np.radians(roll_deg)
            r, u = r * np.cos(a) + u * np.sin(a), -r * np.sin(a) + u * np.cos(a)
        self.fwd, self.right, self.up = f, r, u
        self.W, self.H = W, H
        self.hfov = hfov_deg
        self.focal = (W / 2.0) / np.tan(np.radians(hfov_deg) / 2.0)

    def scaled(self, W, H):
        c = Camera.__new__(Camera)
        c.pos, c.fwd, c.right, c.up = self.pos, self.fwd, self.right, self.up
        c.W, c.H, c.hfov = W, H, self.hfov
        c.focal = self.focal * W / self.W
        return c

    def project(self, P):
        """World points (...,3) -> pixel coords (...,2), depth along fwd (...)."""
        P = np.asarray(P, dtype=np.float64)
        d = P - self.pos
        z = d @ self.fwd
        x = d @ self.right
        y = d @ self.up
        zs = np.where(np.abs(z) < 1e-6, 1e-6, z)
        u = self.W / 2.0 + self.focal * x / zs
        v = self.H / 2.0 - self.focal * y / zs
        return np.stack([u, v], -1), z

    def project_dir(self, D):
        """Directions at infinity -> pixel coords."""
        D = np.asarray(D, dtype=np.float64)
        z = D @ self.fwd
        x = D @ self.right
        y = D @ self.up
        zs = np.where(np.abs(z) < 1e-6, 1e-6, z)
        return np.stack([self.W / 2.0 + self.focal * x / zs, self.H / 2.0 - self.focal * y / zs], -1), z
