"""Numba ray-marchers.

* Terrain: z-up heightfield with four nested levels of detail (shot-specific fine patch,
  2.5 m route corridor, 10 m massif, 100 m Karakoram) and earth curvature.
* Patches: heightfields in an arbitrary tilted frame (near-vertical rock walls, serac
  faces) composited with the terrain by depth.

This produces the *reference footage* that the painterly pass later paints over,
in the same spirit as rotoscoping: geometry and light come from the real terrain,
the image itself is made of brush strokes.
"""
import math
import numpy as np
import numba as nb

K_CURV = (1.0 - 0.13) / (2.0 * 6371000.0)   # apparent curvature drop incl. refraction
ZMAX = 8700.0


@nb.njit(inline='always', fastmath=True)
def _bilerp(H, fy, fx):
    ny, nx = H.shape
    if fx < 0.0:
        fx = 0.0
    if fy < 0.0:
        fy = 0.0
    if fx > nx - 1.0001:
        fx = nx - 1.0001
    if fy > ny - 1.0001:
        fy = ny - 1.0001
    ix = int(fx)
    iy = int(fy)
    tx = fx - ix
    ty = fy - iy
    a = H[iy, ix]
    b = H[iy, ix + 1]
    c = H[iy + 1, ix]
    d = H[iy + 1, ix + 1]
    return (a * (1.0 - tx) + b * tx) * (1.0 - ty) + (c * (1.0 - tx) + d * tx) * ty


@nb.njit(inline='always', fastmath=True)
def _level_weight(gx, gy, nx, ny, margin):
    db = min(min(gx, gy), min(nx - 1.0 - gx, ny - 1.0 - gy))
    if db <= 0.0:
        return 0.0
    if db >= margin:
        return 1.0
    w = db / margin
    return w * w * (3.0 - 2.0 * w)


@nb.njit(inline='always', fastmath=True)
def height(x, y, HF, pF, H0, p0, H1, p1, H2, p2):
    """Blended height over the four levels. p* = (x0, y0, res, margin_cells)."""
    h = _bilerp(H2, (y - p2[1]) / p2[2], (x - p2[0]) / p2[2])
    gx = (x - p1[0]) / p1[2]
    gy = (y - p1[1]) / p1[2]
    w1 = _level_weight(gx, gy, H1.shape[1], H1.shape[0], p1[3])
    if w1 > 0.0:
        h = h + (_bilerp(H1, gy, gx) - h) * w1
        gx = (x - p0[0]) / p0[2]
        gy = (y - p0[1]) / p0[2]
        w0 = _level_weight(gx, gy, H0.shape[1], H0.shape[0], p0[3])
        if w0 > 0.0:
            h = h + (_bilerp(H0, gy, gx) - h) * w0
            gx = (x - pF[0]) / pF[2]
            gy = (y - pF[1]) / pF[2]
            wf = _level_weight(gx, gy, HF.shape[1], HF.shape[0], pF[3])
            if wf > 0.0:
                h = h + (_bilerp(HF, gy, gx) - h) * wf
    return h


@nb.njit(inline='always', fastmath=True)
def _lvl_vec(N, p, x, y, w_prev, nx, ny, nz, wmargin):
    gx = (x - p[0]) / p[2]
    gy = (y - p[1]) / p[2]
    w = _level_weight(gx, gy, N.shape[1], N.shape[0], p[3])
    if w > 0.0:
        nx = nx + (_bilerp(N[:, :, 0], gy, gx) - nx) * w
        ny = ny + (_bilerp(N[:, :, 1], gy, gx) - ny) * w
        nz = nz + (_bilerp(N[:, :, 2], gy, gx) - nz) * w
    return nx, ny, nz, w


@nb.njit(inline='always', fastmath=True)
def normal_at(x, y, NF, pF, N0, p0, N1, p1, N2, p2):
    gx = (x - p2[0]) / p2[2]
    gy = (y - p2[1]) / p2[2]
    nx = _bilerp(N2[:, :, 0], gy, gx)
    ny = _bilerp(N2[:, :, 1], gy, gx)
    nz = _bilerp(N2[:, :, 2], gy, gx)
    nx, ny, nz, w = _lvl_vec(N1, p1, x, y, 1.0, nx, ny, nz, 0.0)
    if w > 0.0:
        nx, ny, nz, w = _lvl_vec(N0, p0, x, y, w, nx, ny, nz, 0.0)
        if w > 0.0:
            nx, ny, nz, w = _lvl_vec(NF, pF, x, y, w, nx, ny, nz, 0.0)
    l = math.sqrt(nx * nx + ny * ny + nz * nz) + 1e-9
    return nx / l, ny / l, nz / l


@nb.njit(parallel=True, fastmath=True)
def march(W, Hh, cam, fwd, right, up, focal, ccx, ccy, tnear, tmax,
          HF, pF, H0, p0, H1, p1, H2, p2, NF, N0, N1, N2, kstep,
          out_t, out_pos, out_nrm, out_dir):
    for j in nb.prange(Hh):
        for i in range(W):
            px = (i + 0.5 - ccx) / focal
            py = -(j + 0.5 - ccy) / focal
            dx = fwd[0] + px * right[0] + py * up[0]
            dy = fwd[1] + px * right[1] + py * up[1]
            dz = fwd[2] + px * right[2] + py * up[2]
            l = math.sqrt(dx * dx + dy * dy + dz * dz)
            dx /= l
            dy /= l
            dz /= l
            out_dir[j, i, 0] = dx
            out_dir[j, i, 1] = dy
            out_dir[j, i, 2] = dz
            t = tnear
            tp = t
            hit = False
            for s in range(1400):
                x = cam[0] + dx * t
                y = cam[1] + dy * t
                z = cam[2] + dz * t
                ddx = x - cam[0]
                ddy = y - cam[1]
                h = height(x, y, HF, pF, H0, p0, H1, p1, H2, p2) - (ddx * ddx + ddy * ddy) * K_CURV
                gap = z - h
                if gap < 0.0:
                    hit = True
                    break
                if z > ZMAX and dz > 0.0:
                    break
                tp = t
                st = gap * kstep
                mn = 0.02 + t * 0.0012
                if st < mn:
                    st = mn
                t += st
                if t > tmax:
                    break
            if hit:
                a = tp
                b = t
                for k in range(12):
                    m = 0.5 * (a + b)
                    x = cam[0] + dx * m
                    y = cam[1] + dy * m
                    z = cam[2] + dz * m
                    ddx = x - cam[0]
                    ddy = y - cam[1]
                    h = height(x, y, HF, pF, H0, p0, H1, p1, H2, p2) - (ddx * ddx + ddy * ddy) * K_CURV
                    if z - h < 0.0:
                        b = m
                    else:
                        a = m
                t = 0.5 * (a + b)
                x = cam[0] + dx * t
                y = cam[1] + dy * t
                out_t[j, i] = t
                out_pos[j, i, 0] = x
                out_pos[j, i, 1] = y
                out_pos[j, i, 2] = height(x, y, HF, pF, H0, p0, H1, p1, H2, p2)
                n0, n1, n2 = normal_at(x, y, NF, pF, N0, p0, N1, p1, N2, p2)
                out_nrm[j, i, 0] = n0
                out_nrm[j, i, 1] = n1
                out_nrm[j, i, 2] = n2
            else:
                out_t[j, i] = -1.0


# ---------------------------------------------------------------------------------------
# tilted patches
@nb.njit(inline='always', fastmath=True)
def patch_h(Hp, pp, u, v):
    # pp = (u0, v0, res)
    return _bilerp(Hp, (v - pp[1]) / pp[2], (u - pp[0]) / pp[2])


@nb.njit(parallel=True, fastmath=True)
def march_patch(Hh, W, out_dir, cam, O, A, Hp, pp, Np, hmax, out_t, out_uv, out_nrm):
    """A = 3x3 rows (U, V, N) world axes of the patch frame. Writes only where nearer."""
    nyp, nxp = Hp.shape
    u0 = pp[0]
    v0 = pp[1]
    u1 = pp[0] + (nxp - 1) * pp[2]
    v1 = pp[1] + (nyp - 1) * pp[2]
    ox = (cam[0] - O[0]) * A[0, 0] + (cam[1] - O[1]) * A[0, 1] + (cam[2] - O[2]) * A[0, 2]
    oy = (cam[0] - O[0]) * A[1, 0] + (cam[1] - O[1]) * A[1, 1] + (cam[2] - O[2]) * A[1, 2]
    oz = (cam[0] - O[0]) * A[2, 0] + (cam[1] - O[1]) * A[2, 1] + (cam[2] - O[2]) * A[2, 2]
    for j in nb.prange(Hh):
        for i in range(W):
            d0 = out_dir[j, i, 0]
            d1 = out_dir[j, i, 1]
            d2 = out_dir[j, i, 2]
            du = d0 * A[0, 0] + d1 * A[0, 1] + d2 * A[0, 2]
            dv = d0 * A[1, 0] + d1 * A[1, 1] + d2 * A[1, 2]
            dn = d0 * A[2, 0] + d1 * A[2, 1] + d2 * A[2, 2]
            # slab clip on n in [-hmax*0.5? .. hmax], u, v ranges
            t0 = 0.0
            t1 = 1e9
            # n slab
            if abs(dn) < 1e-9:
                if oz > hmax:
                    continue
            else:
                ta = (hmax - oz) / dn
                tb = (-hmax - oz) / dn
                if ta > tb:
                    ta, tb = tb, ta
                t0 = max(t0, ta)
                t1 = min(t1, tb)
            if abs(du) > 1e-9:
                ta = (u0 - ox) / du
                tb = (u1 - ox) / du
                if ta > tb:
                    ta, tb = tb, ta
                t0 = max(t0, ta)
                t1 = min(t1, tb)
            elif ox < u0 or ox > u1:
                continue
            if abs(dv) > 1e-9:
                ta = (v0 - oy) / dv
                tb = (v1 - oy) / dv
                if ta > tb:
                    ta, tb = tb, ta
                t0 = max(t0, ta)
                t1 = min(t1, tb)
            elif oy < v0 or oy > v1:
                continue
            if t0 >= t1:
                continue
            tcur = out_t[j, i]
            if tcur > 0.0 and t0 > tcur:
                continue
            t = t0 + 1e-4
            tp = t
            hit = False
            for s in range(600):
                uu = ox + du * t
                vv = oy + dv * t
                nn = oz + dn * t
                gap = nn - patch_h(Hp, pp, uu, vv)
                if gap < 0.0:
                    hit = True
                    break
                tp = t
                st = gap * 0.3
                mn = 0.004 + t * 0.0008
                if st < mn:
                    st = mn
                t += st
                if t > t1:
                    break
            if not hit:
                continue
            a = tp
            b = t
            for k in range(10):
                m = 0.5 * (a + b)
                if oz + dn * m - patch_h(Hp, pp, ox + du * m, oy + dv * m) < 0.0:
                    b = m
                else:
                    a = m
            t = 0.5 * (a + b)
            if tcur > 0.0 and t >= tcur:
                continue
            uu = ox + du * t
            vv = oy + dv * t
            out_t[j, i] = t
            out_uv[j, i, 0] = uu
            out_uv[j, i, 1] = vv
            fy = (vv - pp[1]) / pp[2]
            fx = (uu - pp[0]) / pp[2]
            lx = _bilerp(Np[:, :, 0], fy, fx)
            ly = _bilerp(Np[:, :, 1], fy, fx)
            lz = _bilerp(Np[:, :, 2], fy, fx)
            wx = lx * A[0, 0] + ly * A[1, 0] + lz * A[2, 0]
            wy = lx * A[0, 1] + ly * A[1, 1] + lz * A[2, 1]
            wz = lx * A[0, 2] + ly * A[1, 2] + lz * A[2, 2]
            l = math.sqrt(wx * wx + wy * wy + wz * wz) + 1e-9
            out_nrm[j, i, 0] = wx / l
            out_nrm[j, i, 1] = wy / l
            out_nrm[j, i, 2] = wz / l
            out_uv[j, i, 2] = 1.0


@nb.njit(inline='always', fastmath=True)
def _patch_occ(x, y, z, O, A, Hp, pp):
    """>0 above patch surface (or outside), <0 below."""
    lx = (x - O[0]) * A[0, 0] + (y - O[1]) * A[0, 1] + (z - O[2]) * A[0, 2]
    ly = (x - O[0]) * A[1, 0] + (y - O[1]) * A[1, 1] + (z - O[2]) * A[1, 2]
    lz = (x - O[0]) * A[2, 0] + (y - O[1]) * A[2, 1] + (z - O[2]) * A[2, 2]
    nyp, nxp = Hp.shape
    if lx < pp[0] or ly < pp[1] or lx > pp[0] + (nxp - 1) * pp[2] or ly > pp[1] + (nyp - 1) * pp[2]:
        return 1e9
    return lz - patch_h(Hp, pp, lx, ly)


@nb.njit(parallel=True, fastmath=True)
def shadows(Hh, W, out_t, out_pos, out_nrm, sun, HF, pF, H0, p0, H1, p1, H2, p2, soft,
            npatch, PO, PA, PH, PP, out_sh):
    """Soft shadow factor toward the sun (terrain + up to npatch tilted patches)."""
    for j in nb.prange(Hh):
        for i in range(W):
            if out_t[j, i] < 0.0:
                out_sh[j, i] = 1.0
                continue
            ox = out_pos[j, i, 0] + out_nrm[j, i, 0] * 0.08 + sun[0] * 0.05
            oy = out_pos[j, i, 1] + out_nrm[j, i, 1] * 0.08 + sun[1] * 0.05
            oz = out_pos[j, i, 2] + out_nrm[j, i, 2] * 0.08 + sun[2] * 0.05
            res = 1.0
            t = 0.05
            for s in range(320):
                x = ox + sun[0] * t
                y = oy + sun[1] * t
                z = oz + sun[2] * t
                if z > ZMAX:
                    break
                h = height(x, y, HF, pF, H0, p0, H1, p1, H2, p2)
                gap = z - h
                for k in range(npatch):
                    g2 = _patch_occ(x, y, z, PO[k], PA[k], PH[k], PP[k])
                    if g2 < gap:
                        gap = g2
                if gap < 0.0:
                    res = 0.0
                    break
                v = soft * gap / t
                if v < res:
                    res = v
                st = gap * 0.4
                mn = 0.03 + t * 0.012
                if st < mn:
                    st = mn
                t += st
                if t > 60000.0:
                    break
            if res < 0.0:
                res = 0.0
            out_sh[j, i] = res * res * (3.0 - 2.0 * res)


@nb.njit(parallel=True, fastmath=True)
def sample_grid(Hh, W, out_t, out_pos, GF, pF, G0, p0, G1, p1, G2, p2, out):
    """Sample a per-level scalar map at hit positions (blended like the heights)."""
    for j in nb.prange(Hh):
        for i in range(W):
            if out_t[j, i] < 0.0:
                out[j, i] = 1.0
                continue
            out[j, i] = height(out_pos[j, i, 0], out_pos[j, i, 1], GF, pF, G0, p0, G1, p1, G2, p2)


@nb.njit(parallel=True)
def height_many(x, y, HF, pF, H0, p0, H1, p1, H2, p2, out):
    for i in nb.prange(x.shape[0]):
        out[i] = height(x[i], y[i], HF, pF, H0, p0, H1, p1, H2, p2)
