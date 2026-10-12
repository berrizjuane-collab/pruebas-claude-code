"""Painterly rotoscoping: brush strokes anchored to the 3-D scene, repainted on twos.

Every stroke is a particle anchored to a world point (terrain) or to a direction (sky).
Each frame the particles are re-projected with the camera, occluded ones are removed,
gaps are refilled (stratified, one stroke per cell), and every stroke picks its colour
from the reference footage underneath - exactly what a rotoscoping painter does when
repainting the next frame over the projected previous one.  Shape/colour jitter is
re-drawn every second frame (animation "on twos"), which gives the hand-made boil.
"""
import math
import numpy as np
import numba as nb
import cv2

from brushes import make_brushes, make_canvas, BW, BH


# --------------------------------------------------------------------------------------
@nb.njit(fastmath=True)
def _splat(canvas, hmap, ref, rscale, n, cx, cy, ang, length, width, col, alpha, bidx, brushes, esig):
    H, W, _ = canvas.shape
    RH, RW, _ = ref.shape
    BHt = brushes.shape[1]
    BWt = brushes.shape[2]
    for k in range(n):
        c = math.cos(ang[k])
        s = math.sin(ang[k])
        L = length[k]
        Wd = width[k]
        hx = abs(c) * L * 0.5 + abs(s) * Wd * 0.5
        hy = abs(s) * L * 0.5 + abs(c) * Wd * 0.5
        x0 = int(cx[k] - hx)
        x1 = int(cx[k] + hx) + 1
        y0 = int(cy[k] - hy)
        y1 = int(cy[k] + hy) + 1
        if x0 < 0:
            x0 = 0
        if y0 < 0:
            y0 = 0
        if x1 > W - 1:
            x1 = W - 1
        if y1 > H - 1:
            y1 = H - 1
        inv2 = 1.0 / (esig[k] * esig[k])
        cr = col[k, 0]
        cg = col[k, 1]
        cb = col[k, 2]
        b = bidx[k]
        al = alpha[k]
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                dx = x + 0.5 - cx[k]
                dy = y + 0.5 - cy[k]
                u = (dx * c + dy * s) / L + 0.5
                v = (-dx * s + dy * c) / (Wd * 0.5)
                if u <= 0.0 or u >= 1.0 or v <= -1.0 or v >= 1.0:
                    continue
                tu = u * (BWt - 1)
                tv = (v * 0.5 + 0.5) * (BHt - 1)
                iu = int(tu)
                iv = int(tv)
                fu = tu - iu
                fv = tv - iv
                if iu >= BWt - 1:
                    iu = BWt - 2
                    fu = 1.0
                if iv >= BHt - 1:
                    iv = BHt - 2
                    fv = 1.0
                a = ((brushes[b, iv, iu] * (1 - fu) + brushes[b, iv, iu + 1] * fu) * (1 - fv)
                     + (brushes[b, iv + 1, iu] * (1 - fu) + brushes[b, iv + 1, iu + 1] * fu) * fv)
                if a < 0.004:
                    continue
                rx = int((x + 0.5) * rscale)
                ry = int((y + 0.5) * rscale)
                if rx > RW - 1:
                    rx = RW - 1
                if ry > RH - 1:
                    ry = RH - 1
                d0 = ref[ry, rx, 0] - cr
                d1 = ref[ry, rx, 1] - cg
                d2 = ref[ry, rx, 2] - cb
                dd = d0 * d0 + d1 * d1 + d2 * d2
                a = a * al * math.exp(-dd * inv2)
                if a > 1.0:
                    a = 1.0
                ia = 1.0 - a
                canvas[y, x, 0] = canvas[y, x, 0] * ia + cr * a
                canvas[y, x, 1] = canvas[y, x, 1] * ia + cg * a
                canvas[y, x, 2] = canvas[y, x, 2] * ia + cb * a
                hmap[y, x] = hmap[y, x] * ia + a * (0.4 + 0.6 * a)


def _hash(a, b):
    """Deterministic per-(particle, drawing) uniform randoms in [0,1)."""
    with np.errstate(over='ignore'):
        bb = np.full(np.shape(a), int(b) & 0xFFFFFFFF, dtype=np.uint64)
        x = (np.asarray(a).astype(np.uint64) * np.uint64(0x9E3779B97F4A7C15)) ^ (bb * np.uint64(0xBF58476D1CE4E5B9))
        x ^= x >> np.uint64(31)
        x *= np.uint64(0x94D049BB133111EB)
        x ^= x >> np.uint64(29)
    return (x & np.uint64(0xFFFFFF)).astype(np.float64) / float(0x1000000)


def _bilinear(img, u, v):
    """Sample img (H,W[,C]) at float pixel coords u (x), v (y)."""
    H, W = img.shape[:2]
    u = np.clip(u, 0, W - 1.001)
    v = np.clip(v, 0, H - 1.001)
    iu = u.astype(np.int64)
    iv = v.astype(np.int64)
    fu = u - iu
    fv = v - iv
    if img.ndim == 3:
        fu = fu[:, None]
        fv = fv[:, None]
    a = img[iv, iu]
    b = img[iv, iu + 1]
    c = img[iv + 1, iu]
    d = img[iv + 1, iu + 1]
    return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv


def kuwahara(img, r):
    """Smooth generalized Kuwahara (4 quadrants, inverse-variance weights): oil-paint flattening."""
    img = img.astype(np.float32)
    k = r + 1
    lum = img @ np.array([0.3, 0.55, 0.15], np.float32)
    l2 = lum * lum
    acc = np.zeros_like(img)
    wsum = np.zeros(img.shape[:2], np.float32)
    for ax, ay in ((0, 0), (r, 0), (0, r), (r, r)):
        m = cv2.blur(img, (k, k), anchor=(ax, ay), borderType=cv2.BORDER_REFLECT)
        ml = cv2.blur(lum, (k, k), anchor=(ax, ay), borderType=cv2.BORDER_REFLECT)
        m2 = cv2.blur(l2, (k, k), anchor=(ax, ay), borderType=cv2.BORDER_REFLECT)
        var = np.maximum(m2 - ml * ml, 0)
        w = 1.0 / (1e-5 + var) ** 1.5
        acc += m * w[..., None]
        wsum += w
    return acc / wsum[..., None]


# --------------------------------------------------------------------------------------
class LayerSpec:
    def __init__(self, name, cell, length, width, alpha, esig, jitter_col, detail=0.0, max_per_cell=2):
        self.name = name
        self.cell = cell
        self.length = length
        self.width = width
        self.alpha = alpha
        self.esig = esig
        self.jitter_col = jitter_col
        self.detail = detail
        self.max_per_cell = max_per_cell


DEFAULT_LAYERS = [
    LayerSpec('under', cell=24, length=84, width=34, alpha=0.96, esig=0.34, jitter_col=0.075),
    LayerSpec('body', cell=12, length=42, width=15, alpha=0.96, esig=0.24, jitter_col=0.065, detail=0.10),
    LayerSpec('detail', cell=6.5, length=20, width=7, alpha=0.95, esig=0.26, jitter_col=0.05, detail=0.32),
    LayerSpec('fine', cell=3.6, length=10, width=3.4, alpha=0.95, esig=0.30, jitter_col=0.04, detail=0.62),
]


class Painter:
    def __init__(self, W=1920, H=1080, layers=None, seed=1, boil_every=2, boil_amount=1.0):
        self.W, self.H = W, H
        self.layers = layers or DEFAULT_LAYERS
        self.brushes = make_brushes(10)
        self.canvas_tex, self.canvas_h = make_canvas(W, H)
        self.rng = np.random.default_rng(seed)
        self.boil_every = boil_every
        self.boil_amount = boil_amount
        self.reset()

    def reset(self):
        self.anc = np.zeros((0, 3))
        self.sky = np.zeros(0, bool)
        self.layer = np.zeros(0, np.int8)
        self.seed = np.zeros(0, np.uint64)
        self.born = np.zeros(0, np.int64)
        self.next_seed = 1

    # ----------------------------------------------------------------------------------
    def _orientation(self, ref, nrm, hit, pos, cam_ref):
        """Per-pixel stroke angle (radians, screen space, ref resolution)."""
        H, W = ref.shape[:2]
        lum = cv2.GaussianBlur((ref @ np.array([0.3, 0.55, 0.15])).astype(np.float32), (0, 0), 1.2)
        gx = cv2.Sobel(lum, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(lum, cv2.CV_32F, 0, 1, ksize=3)
        sig = 3.0
        Jxx = cv2.GaussianBlur(gx * gx, (0, 0), sig)
        Jxy = cv2.GaussianBlur(gx * gy, (0, 0), sig)
        Jyy = cv2.GaussianBlur(gy * gy, (0, 0), sig)
        tr = Jxx + Jyy + 1e-6
        coh = np.sqrt((Jxx - Jyy) ** 2 + 4 * Jxy ** 2) / tr
        strength = np.clip(np.sqrt(tr) / 0.08, 0, 1)
        th_g = 0.5 * np.arctan2(2 * Jxy, Jxx - Jyy)          # gradient orientation
        th_e = th_g + np.pi / 2                               # edge tangent
        w_e = coh * strength * 1.6
        # fall line projected to the screen
        n = nrm.astype(np.float64)
        t3 = np.stack([n[..., 0] * n[..., 2], n[..., 1] * n[..., 2], n[..., 2] ** 2 - 1.0], -1)
        t3 /= np.linalg.norm(t3, axis=-1, keepdims=True) + 1e-9
        P = pos.astype(np.float64) - cam_ref.pos
        pf = P @ cam_ref.fwd
        pr = P @ cam_ref.right
        pu = P @ cam_ref.up
        tf = t3 @ cam_ref.fwd
        tr_ = t3 @ cam_ref.right
        tu = t3 @ cam_ref.up
        du = tr_ * pf - pr * tf
        dv = -(tu * pf - pu * tf)
        th_f = np.arctan2(dv, du)
        steep = np.clip((1.0 - n[..., 2]) / 0.25, 0, 1) * hit
        w_f = steep * 1.0
        w_h = 0.35 + 0.65 * (~hit)          # horizontal default (sky, flat ground)
        cx = w_e * np.cos(2 * th_e) + w_f * np.cos(2 * th_f) + w_h * 1.0
        cy = w_e * np.sin(2 * th_e) + w_f * np.sin(2 * th_f)
        cx = cv2.GaussianBlur(cx.astype(np.float32), (0, 0), 2.0)
        cy = cv2.GaussianBlur(cy.astype(np.float32), (0, 0), 2.0)
        ang = 0.5 * np.arctan2(cy, cx)
        return ang.astype(np.float32), lum

    def _detail(self, lum, sigma_px):
        """Local contrast at the scale of a brush (Hertzmann-style need for smaller strokes)."""
        b = cv2.GaussianBlur(lum, (0, 0), max(0.6, sigma_px))
        gx = cv2.Sobel(b, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(b, cv2.CV_32F, 0, 1, ksize=3)
        g = np.sqrt(gx * gx + gy * gy) * max(1.0, sigma_px) * 0.6
        g = cv2.dilate(g, np.ones((3, 3), np.uint8))
        return np.clip(g / 0.35, 0, 1)

    # ----------------------------------------------------------------------------------
    def paint(self, frame, ref, t_ref, pos, dirs, nrm, cam, detail_boost=None, ground=None):
        """ref: display RGB (h,w,3) at reference res; cam: output-res camera."""
        W, H = self.W, self.H
        rh, rw = ref.shape[:2]
        sc = rw / W                         # output px -> ref px
        cam_ref = cam.scaled(rw, rh)
        hit = t_ref > 0
        ang_f, lum = self._orientation(ref, nrm, hit, pos, cam_ref)
        dmaps = {}
        for L in self.layers:
            if L.detail > 0:
                d = self._detail(lum, L.width * sc * 0.5)
                if detail_boost is not None:
                    d = np.maximum(d, detail_boost)
                dmaps[L.name] = d
        drawing = frame // self.boil_every

        # ---- project & cull existing particles
        if len(self.anc):
            uv = np.zeros((len(self.anc), 2))
            z = np.zeros(len(self.anc))
            ter = ~self.sky
            if ter.any():
                uv[ter], z[ter] = cam.project(self.anc[ter])
            if self.sky.any():
                uv[self.sky], z[self.sky] = cam.project_dir(self.anc[self.sky])
            m = 60
            ok = (z > 0) & (uv[:, 0] > -m) & (uv[:, 0] < W + m) & (uv[:, 1] > -m) & (uv[:, 1] < H + m)
            ru = np.clip(uv[:, 0] * sc, 0, rw - 1).astype(np.int64)
            rv = np.clip(uv[:, 1] * sc, 0, rh - 1).astype(np.int64)
            tr = t_ref[rv, ru]
            dist = np.linalg.norm(self.anc - cam.pos, axis=1)
            vis_t = (~self.sky) & (tr > 0) & (np.abs(dist - tr) < np.maximum(0.03 * tr, 3.0))
            vis_s = self.sky & (tr <= 0)
            ok &= (vis_t | vis_s)
            self._keep(ok)
            uv = uv[ok]
        else:
            uv = np.zeros((0, 2))

        # ---- density control per layer (stratified: <= max_per_cell per cell, refill empty cells)
        new_anc, new_sky, new_layer, new_uv = [], [], [], []
        keep = np.ones(len(self.anc), bool)
        for li, L in enumerate(self.layers):
            cs = L.cell
            gw, gh = int(np.ceil(W / cs)) + 2, int(np.ceil(H / cs)) + 2
            sel = np.nonzero(self.layer == li)[0]
            if L.detail > 0 and len(sel):
                ru_ = np.clip(uv[sel, 0] * sc, 0, rw - 1).astype(np.int64)
                rv_ = np.clip(uv[sel, 1] * sc, 0, rh - 1).astype(np.int64)
                gone = dmaps[L.name][rv_, ru_] < L.detail * 0.35
                keep[sel[gone]] = False
                sel = sel[~gone]
            cnt = np.zeros(gh * gw, np.int64)
            if len(sel):
                cu = np.clip((uv[sel, 0] / cs).astype(np.int64) + 1, 0, gw - 1)
                cv_ = np.clip((uv[sel, 1] / cs).astype(np.int64) + 1, 0, gh - 1)
                cid = cv_ * gw + cu
                order = np.lexsort((self.born[sel], cid))           # oldest first within a cell
                cs_sorted = cid[order]
                first = np.r_[True, cs_sorted[1:] != cs_sorted[:-1]]
                grp_start = np.maximum.accumulate(np.where(first, np.arange(len(order)), 0))
                rank = np.arange(len(order)) - grp_start
                over = rank >= L.max_per_cell
                keep[sel[order[over]]] = False
                np.add.at(cnt, cs_sorted[~over], 1)
            # empty cells inside the frame -> spawn
            gy_, gx_ = np.mgrid[1:gh - 1, 1:gw - 1]
            empty = cnt.reshape(gh, gw)[1:gh - 1, 1:gw - 1] == 0
            ey, ex = gy_[empty], gx_[empty]
            if len(ex):
                px = (ex - 1 + self.rng.random(len(ex))) * cs
                py = (ey - 1 + self.rng.random(len(ey))) * cs
                inb = (px < W) & (py < H)
                px, py = px[inb], py[inb]
                ru = np.clip(px * sc, 0, rw - 1).astype(np.int64)
                rv = np.clip(py * sc, 0, rh - 1).astype(np.int64)
                if L.detail > 0:
                    cell_id = (ey * 7919 + ex * 104729 + li * 31).astype(np.uint64)[inb]
                    thr = L.detail * (0.6 + 0.8 * _hash(cell_id, 99))
                    need = dmaps[L.name][rv, ru] > thr
                    px, py, ru, rv = px[need], py[need], ru[need], rv[need]
                h = t_ref[rv, ru] > 0
                a = np.where(h[:, None], pos[rv, ru].astype(np.float64), dirs[rv, ru].astype(np.float64))
                # exact anchor at sub-pixel position along the pixel ray for terrain
                new_anc.append(a)
                new_sky.append(~h)
                new_layer.append(np.full(len(px), li, np.int8))
                new_uv.append(np.stack([px, py], -1))
        self._keep(keep)
        uv = uv[keep]
        if new_anc:
            na = np.concatenate(new_anc)
            n_new = len(na)
            self.anc = np.concatenate([self.anc, na])
            self.sky = np.concatenate([self.sky, np.concatenate(new_sky)])
            self.layer = np.concatenate([self.layer, np.concatenate(new_layer)])
            self.seed = np.concatenate([self.seed, np.arange(self.next_seed, self.next_seed + n_new, dtype=np.uint64)])
            self.born = np.concatenate([self.born, np.full(n_new, frame, np.int64)])
            self.next_seed += n_new
            uv = np.concatenate([uv, np.concatenate(new_uv)])

        # ---- build canvas: toned ground (underpainting) then strokes coarse -> fine
        if ground is None:
            ground = cv2.GaussianBlur(ref, (0, 0), 6.0)
        canvas = cv2.resize(ground, (W, H), interpolation=cv2.INTER_LINEAR).astype(np.float32)
        hmap = np.zeros((H, W), np.float32)
        refs_blur = {}
        ref32 = np.ascontiguousarray(ref.astype(np.float32))
        ref_up = np.ascontiguousarray(cv2.resize(ref32, (W, H), interpolation=cv2.INTER_LINEAR))
        for li, L in enumerate(self.layers):
            sel = np.nonzero(self.layer == li)[0]
            if not len(sel):
                continue
            sel = sel[np.argsort(_hash(self.seed[sel], 7))]          # stable painting order
            sd = self.seed[sel]
            r1 = _hash(sd, 11)
            r2 = _hash(sd, 13)
            r3 = _hash(sd, 17)
            b1 = _hash(sd, drawing * 31 + 1)
            b2 = _hash(sd, drawing * 31 + 2)
            b3 = _hash(sd, drawing * 31 + 3)
            b4 = _hash(sd, drawing * 31 + 4)
            ba = self.boil_amount
            u = uv[sel, 0] + (b1 - 0.5) * L.cell * 0.45 * ba
            v = uv[sel, 1] + (b2 - 0.5) * L.cell * 0.45 * ba
            if L.cell not in refs_blur:
                r = int(max(1, round(L.width * sc * 0.28)))
                refs_blur[L.cell] = kuwahara(ref32, r)
            col = _bilinear(refs_blur[L.cell], u * sc, v * sc)
            # persistent pigment variation + boil
            jc = L.jitter_col
            lum_j = (r1 - 0.5) * 2 * jc + (b3 - 0.5) * jc * 0.7 * ba
            warm = (r2 - 0.5) * jc * 1.1
            col = col * (1 + lum_j[:, None]) + np.stack([warm, warm * 0.15, -warm * 0.9], -1)
            g = col.mean(-1, keepdims=True)
            sat = 1.0 + (_hash(sd, 29) - 0.5) * 0.35
            col = np.clip(g + (col - g) * sat[:, None], 0, 1)
            skyp = self.sky[sel]
            ang = _bilinear(ang_f, u * sc, v * sc) + (r3 - 0.5) * np.where(skyp, 0.55, 0.35) + (b4 - 0.5) * 0.16 * ba
            # strokes are dragged "downhill"/rightwards: randomise head side
            ang = ang + np.where(_hash(sd, 23) > 0.5, 0.0, np.pi)
            length = L.length * (0.65 + 0.7 * r2) * (0.9 + 0.2 * b1) * np.where(skyp, 1.55, 1.0)
            width = L.width * (0.8 + 0.4 * r1) * np.where(skyp, 1.2, 1.0)
            alpha = np.full(len(sel), L.alpha) * (0.85 + 0.15 * r3)
            bidx = (sd % np.uint64(len(self.brushes))).astype(np.int64)
            esig = np.full(len(sel), L.esig)
            _splat(canvas, hmap, ref_up, 1.0, len(sel), u.astype(np.float64), v.astype(np.float64),
                   ang.astype(np.float64), length.astype(np.float64), width.astype(np.float64),
                   np.ascontiguousarray(col, dtype=np.float32), alpha.astype(np.float64), bidx,
                   self.brushes, esig.astype(np.float64))
        return canvas, hmap

    def repaint_region(self, canvas, hmap, mask, drawing, cell=4.0, width=3.6, length=10.0, alpha=0.9, esig=0.16,
                       seed=5):
        """Screen-space brushwork over moving characters (re-drawn on twos; strokes sample the canvas)."""
        H, W = mask.shape
        ys, xs = np.nonzero(mask > 0.05)
        if not len(xs):
            return
        x0, x1 = max(0, xs.min() - 6), min(W, xs.max() + 7)
        y0, y1 = max(0, ys.min() - 6), min(H, ys.max() + 7)
        gx_, gy_ = np.meshgrid(np.arange(x0, x1, cell), np.arange(y0, y1, cell))
        gx_, gy_ = gx_.ravel(), gy_.ravel()
        m = mask[np.clip(gy_.astype(int), 0, H - 1), np.clip(gx_.astype(int), 0, W - 1)] > 0.1
        gx_, gy_ = gx_[m], gy_[m]
        if not len(gx_):
            return
        cid = (gy_.astype(np.int64) * 7919 + gx_.astype(np.int64) * 131 + seed).astype(np.uint64)
        r1, r2, r3 = _hash(cid, drawing * 7 + 1), _hash(cid, drawing * 7 + 2), _hash(cid, drawing * 7 + 3)
        u = gx_ + (r1 - 0.5) * cell
        v = gy_ + (r2 - 0.5) * cell
        sub = np.ascontiguousarray(canvas[y0:y1, x0:x1].astype(np.float32))
        blur = cv2.GaussianBlur(sub, (0, 0), 0.8)
        lum = sub @ np.array([0.3, 0.55, 0.15], np.float32)
        gxs = cv2.Sobel(lum, cv2.CV_32F, 1, 0, ksize=3)
        gys = cv2.Sobel(lum, cv2.CV_32F, 0, 1, ksize=3)
        Jxx = cv2.GaussianBlur(gxs * gxs, (0, 0), 2.0)
        Jxy = cv2.GaussianBlur(gxs * gys, (0, 0), 2.0)
        Jyy = cv2.GaussianBlur(gys * gys, (0, 0), 2.0)
        th = 0.5 * np.arctan2(2 * Jxy, Jxx - Jyy) + np.pi / 2
        lu = np.clip((u - x0).astype(int), 0, x1 - x0 - 1)
        lv = np.clip((v - y0).astype(int), 0, y1 - y0 - 1)
        col = blur[lv, lu] * (1 + (r3[:, None] - 0.5) * 0.08)
        ang = th[lv, lu] + (r1 - 0.5) * 0.4
        n = len(u)
        bidx = (cid % np.uint64(len(self.brushes))).astype(np.int64)
        ref_full = np.ascontiguousarray(canvas.astype(np.float32))
        _splat(canvas, hmap, ref_full, 1.0, n, u.astype(np.float64), v.astype(np.float64), ang.astype(np.float64),
               (length * (0.7 + 0.6 * r2)).astype(np.float64), (width * (0.8 + 0.4 * r3)).astype(np.float64),
               np.ascontiguousarray(np.clip(col, 0, 1), dtype=np.float32), np.full(n, alpha), bidx, self.brushes,
               np.full(n, esig))

    def finish(self, canvas, hmap, impasto=0.11, tex=1.0):
        """Canvas texture + impasto relief lighting."""
        h = cv2.GaussianBlur(hmap, (0, 0), 0.9) + self.canvas_h * 0.08
        gx = cv2.Sobel(h, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(h, cv2.CV_32F, 0, 1, ksize=3)
        shade_ = 1.0 + impasto * np.clip(-(gx * 0.7 + gy * 0.7), -1.5, 1.5)
        out = canvas * shade_[..., None] * (1 + (self.canvas_tex[..., None] - 1) * tex)
        return np.clip(out, 0, 1)

    def _keep(self, m):
        self.anc = self.anc[m]
        self.sky = self.sky[m]
        self.layer = self.layer[m]
        self.seed = self.seed[m]
        self.born = self.born[m]
