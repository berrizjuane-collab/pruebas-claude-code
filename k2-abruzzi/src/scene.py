"""Scene: terrain levels + maps + tilted patches + reference-frame rendering."""
import os
import time
import numpy as np
from scipy import ndimage

import raymarch as rm
import shade
import summit
from terrain import Grid, load_levels, cavity
from terrain_maps import build_maps, smoothstep

WORK = '/home/user/k2data/work'
MAP_KEYS = ('rock', 'glacier', 'debris', 'ao', 'slope', 'ice')

SUMMIT = np.array([-80.0, -200.0, 8611.0])


def _dummy_level():
    g = Grid(np.zeros((4, 4), np.float32), -1e7, -1e7, 1.0)
    maps = {k: np.zeros((4, 4), np.float32) for k in MAP_KEYS}
    return g, maps


class Patch:
    """Heightfield in a tilted frame. axes rows: U (along), V (up the wall), N (out)."""

    def __init__(self, origin, U, V, N, Hloc, u0, v0, res, maps, name='patch'):
        self.O = np.asarray(origin, np.float64)
        self.A = np.ascontiguousarray(np.stack([U, V, N]).astype(np.float64))
        self.H = np.ascontiguousarray(Hloc, np.float32)
        self.pp = np.array([u0, v0, res], np.float64)
        gy, gx = np.gradient(self.H.astype(np.float64), res)
        n = np.stack([-gx, -gy, np.ones_like(gx)], -1)
        n /= np.linalg.norm(n, axis=-1, keepdims=True)
        self.N = np.ascontiguousarray(n.astype(np.float32))
        self.maps = maps
        self.hmax = float(np.abs(self.H).max() + 1.0)
        self.name = name

    def sample_map(self, key, uv):
        m = self.maps[key]
        r = (uv[:, 1] - self.pp[1]) / self.pp[2]
        c = (uv[:, 0] - self.pp[0]) / self.pp[2]
        return ndimage.map_coordinates(m, [r, c], order=1, mode='nearest')


class Scene:
    def __init__(self, verbose=True):
        t0 = time.time()
        cache = f'{WORK}/scene_cache_v2.npz'
        if os.path.exists(cache):
            d = np.load(cache)
            self.levels = []
            self.maps = []
            for k in range(3):
                p = d[f'p{k}']
                self.levels.append(Grid(d[f'H{k}'], p[0], p[1], p[2]))
                self.maps.append({m: d[f'{m}{k}'] for m in MAP_KEYS})
        else:
            self._build(cache)
        gn = self.levels[1]
        self.frame = summit.Frame(gn)
        self.margins = [120.0, 60.0, 4.0]
        self.fine, self.fine_maps = _dummy_level()
        self.fine_margin = 40.0
        self.patches = []
        self._prep()
        if verbose:
            print(f'scene ready in {time.time() - t0:.1f}s', [h.shape for h in self.H])

    def _build(self, cache):
        gn, gf, peak = load_levels()
        fr = summit.Frame(gn)
        X0, X1, Y0, Y1, r0 = -700.0, 2900.0, -3100.0, 300.0, 2.5
        xs = np.arange(X0, X1 + 1e-6, r0)
        ys = np.arange(Y0, Y1 + 1e-6, r0)
        XX, YY = np.meshgrid(xs, ys)
        H0 = gn.sample(XX, YY, order=3)
        H0s, ice0, rock0, snow0 = summit.sculpt(fr, XX, YY, H0, res=r0)
        g0 = Grid(H0s, X0, Y0, r0)
        m0 = build_maps(g0, seed=11, detail_amp=1.0)
        m0['ice'] = np.clip(ice0, 0, 1).astype(np.float32)
        m0['rock'] = np.clip(np.maximum(m0['rock'] * (1 - m0['ice']), rock0 * 0.9) * (1 - snow0), 0, 1).astype(np.float32)
        # also carve the near grid with the same features (consistency in mid shots)
        Xn = gn.x0 + np.arange(gn.nx) * gn.res
        Yn = gn.y0 + np.arange(gn.ny) * gn.res
        sel_c = (Xn > -400) & (Xn < 1100)
        sel_r = (Yn > -900) & (Yn < 200)
        XXn, YYn = np.meshgrid(Xn[sel_c], Yn[sel_r])
        sub = gn.H[np.ix_(sel_r, sel_c)]
        subs, icen, _, _ = summit.sculpt(fr, XXn, YYn, sub.astype(np.float64), res=gn.res)
        gn.H[np.ix_(sel_r, sel_c)] = subs.astype(np.float32)
        m1 = build_maps(gn, seed=7, detail_amp=1.0)
        ice1 = np.zeros_like(gn.H)
        ice1[np.ix_(sel_r, sel_c)] = icen
        m1['ice'] = np.clip(ice1, 0, 1).astype(np.float32)
        gy, gx = np.gradient(gf.H, gf.res)
        slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)
        rock = np.clip(smoothstep(30, 45, slope), 0, 1).astype(np.float32)
        glacier = ((1 - smoothstep(6, 14, slope)) * (1 - smoothstep(5000, 5600, gf.H))).astype(np.float32)
        m2 = dict(rock=rock, glacier=glacier, debris=(glacier * 0.4).astype(np.float32),
                  ao=cavity(gf.H, gf.res, radii=(200, 600)), slope=slope, ice=np.zeros_like(slope))
        self.levels = [g0, gn, gf]
        self.maps = [m0, m1, m2]
        save = {}
        for k, (g, m) in enumerate(zip(self.levels, self.maps)):
            save[f'H{k}'] = g.H
            save[f'p{k}'] = np.array([g.x0, g.y0, g.res])
            for key in MAP_KEYS:
                save[f'{key}{k}'] = m[key].astype(np.float32)
        np.savez(cache, **save)

    def _prep(self):
        self.N = [g.normals() for g in self.levels]
        self.P = [np.array([g.x0, g.y0, g.res, m], dtype=np.float64) for g, m in zip(self.levels, self.margins)]
        self.H = [np.ascontiguousarray(g.H, dtype=np.float32) for g in self.levels]
        self.M = {k: [np.ascontiguousarray(m[k], dtype=np.float32) for m in self.maps] for k in MAP_KEYS}
        self._prep_fine()

    def _prep_fine(self):
        g = self.fine
        self.HF = np.ascontiguousarray(g.H, np.float32)
        self.NF = g.normals()
        self.PF = np.array([g.x0, g.y0, g.res, self.fine_margin], np.float64)
        self.MF = {k: np.ascontiguousarray(self.fine_maps[k], np.float32) for k in MAP_KEYS}

    def set_fine(self, grid=None, maps=None, margin_cells=40.0):
        if grid is None:
            self.fine, self.fine_maps = _dummy_level()
        else:
            self.fine, self.fine_maps = grid, maps
        self.fine_margin = margin_cells
        self._prep_fine()

    def levels_args(self):
        return (self.HF, self.PF, self.H[0], self.P[0], self.H[1], self.P[1], self.H[2], self.P[2])

    # ----------------------------------------------------------------------------------
    def height(self, x, y):
        x = np.ascontiguousarray(np.atleast_1d(np.asarray(x, dtype=np.float64)).ravel())
        y = np.ascontiguousarray(np.atleast_1d(np.asarray(y, dtype=np.float64)).ravel())
        out = np.empty(x.shape, dtype=np.float64)
        rm.height_many(x, y, *self.levels_args(), out)
        return out

    def march(self, cam, tmax=260000.0, kstep=0.3):
        W, Hh = cam.W, cam.H
        t = np.zeros((Hh, W), np.float32)
        pos = np.zeros((Hh, W, 3), np.float32)
        nrm = np.zeros((Hh, W, 3), np.float32)
        dirs = np.zeros((Hh, W, 3), np.float32)
        rm.march(W, Hh, cam.pos, cam.fwd, cam.right, cam.up, cam.focal, W / 2.0, Hh / 2.0, 0.05, tmax,
                 *self.levels_args(), self.NF, self.N[0], self.N[1], self.N[2], kstep, t, pos, nrm, dirs)
        pid = np.full((Hh, W), -1, np.int16)
        uv = np.zeros((Hh, W, 3), np.float32)
        for k, p in enumerate(self.patches):
            uvk = np.zeros((Hh, W, 3), np.float32)
            before = t.copy()
            rm.march_patch(Hh, W, dirs, cam.pos, p.O, p.A, p.H, p.pp, p.N, p.hmax, t, uvk, nrm)
            changed = (t != before) & (t > 0)
            pid[changed] = k
            uv[changed] = uvk[changed]
            if changed.any():
                pos[changed] = (cam.pos[None] + dirs[changed].astype(np.float64) * t[changed][:, None]).astype(np.float32)
        return t, pos, nrm, dirs, pid, uv

    def shadow(self, t, pos, nrm, sun, soft=10.0):
        Hh, W = t.shape
        sh = np.ones((Hh, W), np.float32)
        if sun[2] > -0.1:
            npch = len(self.patches)
            if npch:
                PO = np.stack([p.O for p in self.patches])
                PA = np.stack([p.A for p in self.patches])
                # patch grids must share a shape for the stacked numba call
                shp = np.max([p.H.shape for p in self.patches], axis=0)
                PH = np.full((npch, shp[0], shp[1]), -1e4, np.float32)
                PP = np.zeros((npch, 3))
                for k, p in enumerate(self.patches):
                    PH[k, :p.H.shape[0], :p.H.shape[1]] = p.H
                    PP[k] = p.pp
                # cells outside a smaller patch are 'deep' -> no occlusion, but bounds use pp & full shape;
            else:
                PO = np.zeros((1, 3))
                PA = np.zeros((1, 3, 3))
                PH = np.zeros((1, 2, 2), np.float32)
                PP = np.zeros((1, 3))
            rm.shadows(Hh, W, t, pos, nrm, np.asarray(sun, np.float64), *self.levels_args(), soft,
                       npch, PO, PA, PH, PP, sh)
        return sh

    def sample_maps(self, t, pos, pid, uv):
        Hh, W = t.shape
        out = {}
        tt = np.where(pid >= 0, -1.0, t).astype(np.float32)
        for k in MAP_KEYS:
            o = np.zeros((Hh, W), np.float32)
            G = self.M[k]
            rm.sample_grid(Hh, W, tt, pos, self.MF[k], self.PF, G[0], self.P[0], G[1], self.P[1], G[2],
                           self.P[2], o)
            out[k] = o
        for pk, p in enumerate(self.patches):
            m = pid == pk
            if m.any():
                uvm = uv[m]
                for k in MAP_KEYS:
                    if k in p.maps:
                        out[k][m] = p.sample_map(k, uvm)
        return out

    # ----------------------------------------------------------------------------------
    def render(self, cam, pal, light_fn=None, clouds=None, post=None, kstep=0.3):
        """Reference frame. Returns dict with linear 'rgb' and aux buffers."""
        t, pos, nrm, dirs, pid, uv = self.march(cam, kstep=kstep)
        hit = t > 0
        sh = self.shadow(t, pos, nrm, pal['sun_dir'])
        maps = self.sample_maps(t, pos, pid, uv)
        rgb = shade.sky(dirs, pal, cam.pos[2])
        if pal.get('stars', 0) > 0:
            rgb = rgb + shade.stars(dirs, 1.0) * pal['stars']
        idx = np.nonzero(hit)
        if len(idx[0]):
            m = {k: v[idx] for k, v in maps.items()}
            el = light_fn(pos[idx].astype(np.float64), nrm[idx].astype(np.float64)) if light_fn else None
            c = shade.shade_terrain(pos[idx].astype(np.float64), nrm[idx].astype(np.float64), t[idx],
                                    dirs[idx].astype(np.float64), sh[idx], m, pal, cam.pos[2], el)
            c = shade.aerial(c, t[idx].astype(np.float64), dirs[idx].astype(np.float64), cam.pos[2], pal)
            rgb[idx] = c
        if clouds is not None:
            rgb = clouds(rgb, t, pos, dirs, cam, pal)
        out = dict(rgb=rgb.astype(np.float32), t=t, pos=pos, nrm=nrm, dirs=dirs, hit=hit, sh=sh, maps=maps,
                   pid=pid)
        if post is not None:
            post(out, cam, pal)
        return out
