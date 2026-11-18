"""
paint.py — estilo "pincel seco sobre fondo oscuro" (implementación del README).

  imagen objetivo T + regiones reg  →  campo de orientación θ  →  pintor de 5 pasadas
  (lienzo a SS×)  →  objetos vectoriales  →  re-pincelado  →  LANCZOS  →  acabado (§7)

Todas las medidas en unidades U = sqrt(W·H)/1946 para que el cuadro tenga el mismo
número de pinceladas a cualquier resolución.
"""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as nd

# --------------------------------------------------------------------------- base

def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    return a + (b - a) * t


def ridged(n):
    return 1 - np.abs(2 * np.clip(n, 0, 1) - 1)


def lum(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def blur(a, s):
    if s <= 0.3:
        return a
    if a.ndim == 3:
        return np.stack([nd.gaussian_filter(a[..., c], s) for c in range(a.shape[2])], -1)
    return nd.gaussian_filter(a, s)


class Noise:
    """ruido de valor reescalado con bicúbica; f = celdas por 'unit' (sqrt(W·H))"""

    def __init__(self, H, W, seed=0):
        self.H, self.W = H, W
        self.unit = math.sqrt(W * H)
        self.rng = np.random.default_rng(seed)

    def value(self, f, sx=1.0, sy=1.0, H=None, W=None):
        H = H or self.H; W = W or self.W
        gw = max(2, int(math.ceil(W / self.unit * f * sx)) + 2)
        gh = max(2, int(math.ceil(H / self.unit * f * sy)) + 2)
        g = self.rng.random((gh, gw)).astype(np.float32)
        a = np.asarray(Image.fromarray(g, "F").resize((W, H), Image.BICUBIC))
        return np.clip(a, 0, 1)

    def fbm(self, f, octaves=4, sx=1.0, sy=1.0, kind="plain", H=None, W=None):
        acc = 0; amp = 1; tot = 0
        for i in range(octaves):
            n = self.value(f * 2 ** i, sx, sy, H, W)
            if kind == "ridged":
                n = ridged(n)
            elif kind == "billow":
                n = np.abs(2 * n - 1)
            acc = acc + amp * n; tot += amp; amp *= 0.5
        return (acc / tot).astype(np.float32)


# ---------------------------------------------------------------- regiones (tabla §2)
#               cielo  nube  montaña  roca/nieve-cerca  terreno-lejano  terreno-cerca
STROKE_LEN = np.array([8.0, 3.0, 4.5, 4.0, 4.0, 4.0], np.float32)
DEF_DIR = np.array([-0.30, 0.0, math.pi / 2, 0.5, -0.12, -0.12], np.float32)
W_CHALK = np.array([0.58, 0.36, 0.40, 0.36, 0.28, 0.22], np.float32)
W_GAP = np.array([0.34, 0.20, 0.30, 0.34, 0.32, 0.28], np.float32)

# --------------------------------------------------------------------------- cielo

SKY = {
    "day": [(0, (84, 112, 158)), (0.55, (146, 174, 204)), (1, (222, 220, 210))],
    "high": [(0, (22, 44, 104)), (0.5, (58, 98, 164)), (0.85, (140, 176, 212)), (1, (212, 224, 234))],
    "dawn": [(0, (30, 44, 100)), (0.35, (66, 80, 148)), (0.62, (150, 126, 170)), (0.82, (238, 164, 140)),
             (1, (255, 208, 150))],
}


def sky(H, W, v_base, preset, nz, glow_side="left", glow=(246, 228, 192), glow_k=0.55, cirrus=0.42):
    v = (np.arange(H, dtype=np.float32) + 0.5) / H
    u = (np.arange(W, dtype=np.float32) + 0.5) / W
    t = np.clip(v / v_base, 0, 1)[:, None] * np.ones((1, W), np.float32)
    if preset == "night":
        c0, c1 = np.array((6, 9, 28), np.float32), np.array((34, 50, 100), np.float32)
        T = mix(c0, c1, (t ** 1.4)[..., None])
    else:
        stops = SKY[preset]
        T = np.zeros((H, W, 3), np.float32)
        for (a, ca), (b, cb) in zip(stops[:-1], stops[1:]):
            m = (t >= a) & (t <= b)
            k = ((t - a) / (b - a))[..., None]
            T = np.where(m[..., None], mix(np.array(ca, np.float32), np.array(cb, np.float32), k), T)
    uu = (1 - u) if glow_side == "left" else u
    g = glow_k * uu[None, :] ** 1.3 * smooth(0.25, 0.95, t)
    T = mix(T, np.array(glow, np.float32), g[..., None])
    T = T + ((nz.fbm(2.5, 4, sx=0.5) - 0.5) * 30)[..., None] * np.array([1, 1, 0.9], np.float32)
    if cirrus > 0:
        ci = smooth(0.56, 0.82, nz.fbm(3.2, 4, sx=0.22, sy=2.6)) * smooth(0.62, 0.25, t)
        cc = (232, 236, 240) if preset != "night" else (60, 72, 110)
        T = mix(T, np.array(cc, np.float32), (cirrus * ci)[..., None])
    return T


# ------------------------------------------------------------------ nubes cúmulo (§2.2)

def cumulus(H, W, U, clouds, nz, rng, light=(0.58, -0.62, 0.53), warm=False, soft=1.8,
            base_cut=(0.06, 0.16), contrast=1.0, tones=None):
    """clouds: lista de (cu, v_base, semiancho_px, alto_px, n_manchas). Devuelve (color, alfa)."""
    Hf = np.zeros((H, W), np.float32)
    REL = np.zeros((H, W), np.float32)
    for (cu, vb, w, hg, n) in clouds:
        base = vb * H
        for _ in range(n):
            fx = rng.normal(0, 0.45)
            if abs(fx) > 1:
                continue
            px = cu * W + fx * w
            top = hg * (1 - fx * fx) ** 0.55
            fr = rng.random() ** 0.9
            py = base - fr * top
            rad = min(w, 1.5 * hg) * (0.10 + 0.42 * rng.random() ** 2) * (0.45 + 0.75 * (1 - fr))
            x0, x1 = int(max(px - rad - 2, 0)), int(min(px + rad + 2, W))
            y0, y1 = int(max(py - rad - 2, 0)), int(min(py + rad + 2, H))
            if x1 <= x0 or y1 <= y0:
                continue
            yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
            d2 = (xx - px) ** 2 + (yy - py) ** 2
            hgt = rad * np.sqrt(np.maximum(0, 1 - d2 / (rad * rad)))
            cut = smooth(base + base_cut[0] * hg, base - base_cut[1] * hg, yy)
            hgt = hgt * cut
            sub = Hf[y0:y1, x0:x1]
            upd = hgt > sub
            sub[upd] = hgt[upd]
            REL[y0:y1, x0:x1][upd] = np.clip((base - yy[upd]) / max(hg, 1), 0, 1)
    if Hf.max() <= 0:
        return np.zeros((H, W, 3), np.float32), np.zeros((H, W), np.float32)
    # deformación (dos campos de ruido) → bordes y lóbulos irregulares
    amp = 13 * U * 2.2
    dx = (nz.fbm(7, 3) - 0.5) * 2 * amp; dy = (nz.fbm(7, 3) - 0.5) * 2 * amp
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    Hf = nd.map_coordinates(Hf, [yy + dy, xx + dx], order=1, mode="constant")
    REL = nd.map_coordinates(REL, [yy + dy, xx + dx], order=1, mode="constant")
    del yy, xx, dx, dy
    Hf = Hf * (0.70 + 0.6 * nz.fbm(12, 3))
    alpha = smooth(0.6 * U, 8 * U, blur(Hf, soft * U) * (0.62 + 0.8 * nz.fbm(45, 3)))
    gy, gx = np.gradient(blur(Hf, 3.0 * U))
    n = np.stack([-gx, -gy, np.ones_like(gx)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    L = np.array(light, np.float32); L /= np.linalg.norm(L)
    lam = np.clip((n * L).sum(-1) * 0.8 + 0.2, 0, 1)
    lam = lam * (0.45 + 0.55 * smooth(0, 0.5, blur(REL, 2 * U)))
    lam = 0.5 + (lam - 0.5) * contrast
    if tones is None:
        tones = [(184, 172, 182), (238, 224, 208), (255, 247, 228)] if warm else \
                [(146, 160, 196), (218, 224, 236), (255, 253, 247)]
    c0, c1, c2 = [np.array(c, np.float32) for c in tones]
    k = lam[..., None]
    col = np.where(k < 0.5, mix(c0, c1, k / 0.5), mix(c1, c2, (k - 0.5) / 0.5))
    return col.astype(np.float32), alpha.astype(np.float32)


def mist(T, reg, nz, v_top, thick, u0=0.0, u1=1.0, amp=0.03, k=0.85, light_side=1,
         tones=((168, 180, 210), (226, 232, 242), (250, 250, 248)), rid=1, rng=None):
    """banco de niebla: borde superior lobulado, base difusa"""
    H, W = reg.shape
    u = (np.arange(W) + 0.5) / W
    v = ((np.arange(H) + 0.5) / H)[:, None]
    r = rng if rng is not None else np.random.default_rng(0)
    line = np.zeros(W, np.float32)
    for f, a in ((2, 1.0), (5, 0.6), (13, 0.35), (31, 0.18), (70, 0.08)):
        g = r.random(f + 3)
        lob = np.interp(u * f, np.arange(f + 3), g)
        line += a * np.abs(2 * lob - 1)
    line = v_top - amp * line / 1.0 + amp * 0.8
    span = smooth(u0 - 0.04, u0 + 0.10, u) * smooth(u1 + 0.04, u1 - 0.10, u)
    top = line[None, :] + (1 - span[None, :]) * thick * 1.2
    a = smooth(top - 0.004, top + 0.035, v) * smooth(top + thick, top + 0.35 * thick, v)
    a = a * (0.55 + 0.45 * nz.fbm(6, 4, sx=0.5, sy=1.4))
    depth = np.clip((v - top) / max(thick, 1e-3), 0, 1)
    sideL = (u if light_side > 0 else 1 - u)[None, :]
    lam = np.clip(1 - depth * 1.3 + 0.25 * (sideL - 0.5) + 0.3 * (nz.fbm(9, 3) - 0.5), 0, 1)
    c0, c1, c2 = [np.array(c, np.float32) for c in tones]
    k3 = lam[..., None]
    col = np.where(k3 < 0.5, mix(c0, c1, k3 / 0.5), mix(c1, c2, (k3 - 0.5) / 0.5))
    T[:] = mix(T, col, (k * a)[..., None])
    reg[(k * a) > 0.5] = rid


def fog_band(T, reg, v_base, nz, color=(232, 236, 242), k=0.86, width=0.105):
    """banda de bruma horizontal (§2.2)"""
    H, W = reg.shape
    v = ((np.arange(H) + 0.5) / H)[:, None]
    b = smooth(0.28, 0.66, nz.fbm(3, 4, sx=0.45, sy=1.6)) * smooth(width, 0, np.abs(v - v_base))
    T[:] = mix(T, np.array(color, np.float32), (k * b)[..., None])


def compose(T, reg, col, alpha, rid, thr=0.5):
    T[:] = mix(T, col, alpha[..., None])
    reg[alpha > thr] = rid


# --------------------------------------------------------------- campo de orientación

def orientation(Tc, regc, U, nz):
    """θ en el lienzo (radianes; vector (cos, sin) con y hacia abajo)"""
    L = blur(lum(Tc), 1.6 * U)
    gy, gx = np.gradient(L)
    s = 4 * U
    Jxx, Jyy, Jxy = blur(gx * gx, s), blur(gy * gy, s), blur(gx * gy, s)
    ang = 0.5 * np.arctan2(2 * Jxy, Jxx - Jyy) + math.pi / 2
    energy = np.sqrt(Jxx + Jyy)
    thr = np.where(regc == 0, 2.6 / U, 1.3 / U)
    H, W = regc.shape
    wob = (nz.fbm(3, 3, H=H, W=W) - 0.5) * 0.9
    dflt = DEF_DIR[regc] + wob
    swirl = nz.value(7, H=H, W=W) * 7
    dflt = np.where(regc == 1, swirl, dflt)
    return np.where(energy > thr, ang, dflt).astype(np.float32)


# --------------------------------------------------------------------------- pintor

PASSES = [(34, 72, None), (17, 62, 14), (8.5, 52, 13), (4.6, 46, 12.5), (3.0, 40, 13)]
REBRUSH = [(6.5, 64, None), (3.8, 50, None), (2.5, 42, None)]


def box(a, size):
    size = max(1, int(size))
    return nd.uniform_filter(a, size)


def paint(canvas, Tc, theta, regc, U, SS, rng, passes=PASSES, mask=None, length_mult=None,
          log=print):
    """pinta sobre `canvas` (PIL RGB) reinterpretando Tc con trazos"""
    Hc, Wc = regc.shape
    draw = ImageDraw.Draw(canvas)
    for (wU, tol, ethr) in passes:
        w = wU * U * SS
        sp = 0.74 * w
        gx = np.arange(sp / 2, Wc, sp); gy = np.arange(sp / 2, Hc, sp)
        X, Y = np.meshgrid(gx, gy)
        X = X + rng.uniform(-sp / 2, sp / 2, X.shape); Y = Y + rng.uniform(-sp / 2, sp / 2, Y.shape)
        X = np.clip(X, 0, Wc - 1).ravel(); Y = np.clip(Y, 0, Hc - 1).ravel()
        xi, yi = X.astype(np.int32), Y.astype(np.int32)
        keep = np.ones(len(X), bool)
        if ethr is not None:
            cur = np.asarray(canvas, np.float32)
            err = box(np.abs(cur - Tc).mean(-1), sp)
            keep &= err[yi, xi] > ethr
            del cur
        if mask is not None:
            keep &= mask[yi, xi]
        X, Y, xi, yi = X[keep], Y[keep], xi[keep], yi[keep]
        N = len(X)
        if N == 0:
            continue
        col = Tc[yi, xi] + rng.normal(0, 8, (N, 1)) + rng.normal(0, 4.5, (N, 3))
        r = regc[yi, xi]
        Lm = STROKE_LEN[r] if length_mult is None else np.full(N, length_mult, np.float32)
        nst = np.round(Lm / 0.7 * rng.uniform(0.6, 1.25, N)).astype(np.int32)
        step = 0.7 * w
        th = theta[yi, xi]
        sgn = np.where(rng.random(N) < 0.5, -1.0, 1.0)
        d = np.stack([np.cos(th), np.sin(th)], -1) * sgn[:, None]
        pos = np.stack([X, Y], -1).astype(np.float32)
        M = int(nst.max()) if N else 0
        P = np.empty((M + 1, N, 2), np.float32); P[0] = pos
        cnt = np.zeros(N, np.int32); alive = np.ones(N, bool)
        for s in range(M):
            pi = np.clip(pos[:, 1].astype(np.int32), 0, Hc - 1); pj = np.clip(pos[:, 0].astype(np.int32), 0, Wc - 1)
            t2 = theta[pi, pj]
            nd2 = np.stack([np.cos(t2), np.sin(t2)], -1)
            flip = (nd2 * d).sum(-1) < 0
            nd2[flip] *= -1
            d = nd2
            npos = pos + step * d
            inside = (npos[:, 0] >= 0) & (npos[:, 0] < Wc) & (npos[:, 1] >= 0) & (npos[:, 1] < Hc)
            qi = np.clip(npos[:, 1].astype(np.int32), 0, Hc - 1); qj = np.clip(npos[:, 0].astype(np.int32), 0, Wc - 1)
            diff = np.abs(Tc[qi, qj] - col).sum(-1)
            ok = alive & inside & (diff < tol) & (s < nst)
            if mask is not None:
                ok &= mask[qi, qj]
            pos = np.where(ok[:, None], npos, pos)
            alive &= ok
            cnt += ok
            P[s + 1] = pos
        order = rng.permutation(N)
        colc = np.clip(col, 0, 255).astype(np.int32)
        wi = max(1, int(round(w)))
        nb = 3 if w >= 14 else 2 if w >= 7 else 1 if w >= 4 else 0
        bw = max(1, int(round(0.17 * w)))
        rad = w / 2
        jit = rng.integers(-16, 17, (N, 3, 3))
        offs = np.linspace(-0.4, 0.4, nb) if nb > 1 else np.array([rng.uniform(-0.4, 0.4)])
        for i in order:
            c = cnt[i]
            pts = P[:c + 1, i]
            cc = tuple(colc[i])
            if c == 0:
                x, y = pts[0]
                draw.ellipse((x - rad, y - rad * 0.8, x + rad, y + rad * 0.8), fill=cc)
                continue
            pl = [tuple(p) for p in pts.tolist()]
            draw.line(pl, fill=cc, width=wi, joint="curve")
            if w >= 4:
                for (x, y) in (pl[0], pl[-1]):
                    draw.ellipse((x - rad, y - rad, x + rad, y + rad), fill=cc)
            if nb:
                dv = pts[-1] - pts[0]
                nrm = math.hypot(dv[0], dv[1]) + 1e-6
                px, py = -dv[1] / nrm, dv[0] / nrm
                for b in range(nb):
                    o = offs[b] * w
                    bc = tuple(int(v) for v in np.clip(colc[i] + jit[i, b], 0, 255))
                    draw.line([(x + px * o, y + py * o) for (x, y) in pl], fill=bc, width=bw)
        log(f"    pasada ancho {wU:>4} U: {N} trazos")
    return canvas


# ---------------------------------------------------------- objetos con máscara (§5.4)

class Proxy:
    """dibuja en el lienzo y registra la huella en una máscara (para el re-pincelado)"""

    def __init__(self, canvas, rebrush=True):
        self.canvas = canvas
        self.d = ImageDraw.Draw(canvas)
        self.mask = Image.new("L", canvas.size, 0)
        self.m = ImageDraw.Draw(self.mask)
        self.rebrush = rebrush

    def _c(self, c):
        return tuple(int(max(0, min(255, v))) for v in c)

    def polygon(self, pts, fill):
        self.d.polygon(pts, fill=self._c(fill))
        if self.rebrush:
            self.m.polygon(pts, fill=255)

    def ellipse(self, box, fill):
        self.d.ellipse(box, fill=self._c(fill))
        if self.rebrush:
            self.m.ellipse(box, fill=255)

    def line(self, pts, fill, width):
        self.d.line(pts, fill=self._c(fill), width=max(1, int(round(width))), joint="curve")
        if self.rebrush:
            self.m.line(pts, fill=255, width=max(1, int(round(width))))

    def rect(self, box, fill):
        self.d.rectangle(box, fill=self._c(fill))
        if self.rebrush:
            self.m.rectangle(box, fill=255)


def rebrush(canvas, proxy, U, SS, nz, rng, log=print):
    m = np.asarray(proxy.mask) > 0
    if not m.any():
        return canvas
    m = nd.binary_dilation(m, iterations=max(1, int(1.5 * U * SS)))
    Tc = np.asarray(canvas, np.float32)
    regc = np.full(m.shape, 3, np.uint8)
    ys, xs = np.where(m)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    sub = Tc[y0:y1, x0:x1]
    nzs = Noise(*sub.shape[:2], seed=int(rng.integers(1 << 30)))
    th = orientation(sub, regc[y0:y1, x0:x1], U * SS, nzs)
    crop = canvas.crop((x0, y0, x1, y1))
    paint(crop, sub, th, regc[y0:y1, x0:x1], U, SS, rng, passes=REBRUSH, mask=m[y0:y1, x0:x1],
          length_mult=3.0, log=log)
    out = canvas.copy()
    out.paste(crop, (x0, y0), Image.fromarray((m[y0:y1, x0:x1] * 255).astype(np.uint8)))
    return out


# ---------------------------------------------------------------- acabado §7

def stripes(H, W, U, largo, grosor, ang_deg, escala, rng):
    """rayas anisótropas: ruido normal desenfocado (grosor·U × largo·U) rotado"""
    a = math.radians(ang_deg)
    D = int(math.hypot(H, W)) + 8
    sx, sy = largo * U, grosor * U
    # generar a resolución reducida si las sigmas lo permiten
    k = max(1, int(min(sy, sx) / 1.2))
    Dn = D // k + 4
    n = rng.normal(0, 1, (Dn, Dn)).astype(np.float32)
    n = nd.gaussian_filter(n, (sy / k, sx / k))
    n /= n.std() + 1e-6
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = W / 2, H / 2
    # coordenadas en el marco rotado (x a lo largo de la raya; ángulo positivo = sube a la derecha)
    u = (xx - cx) * math.cos(a) - (yy - cy) * math.sin(a)
    v = (xx - cx) * math.sin(a) + (yy - cy) * math.cos(a)
    s = nd.map_coordinates(n, [v / k + Dn / 2, u / k + Dn / 2], order=1, mode="wrap")
    unit = math.sqrt(W * H)
    nzb = Noise(H, W, seed=int(rng.integers(1 << 30)))
    big = nzb.value(unit / (escala * U))
    return s, big


def finish(img, reg, U, rng, chalk=(240, 236, 224), chalk_k=1.0, gap_k=1.0, fondo=(34, 36, 48),
           log=print):
    """img: float32 (H,W,3) ya reducida; reg a resolución final"""
    H, W = reg.shape
    nz = Noise(H, W, seed=int(rng.integers(1 << 30)))
    a = img.astype(np.float32)
    # 7.1 pulso inseguro
    dx = (nz.fbm(26, 3) - 0.5) * 9 * U + (nz.fbm(90, 2) - 0.5) * 2 * U
    dy = (nz.fbm(26, 3) - 0.5) * 9 * U + (nz.fbm(90, 2) - 0.5) * 2 * U
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    a = np.stack([nd.map_coordinates(a[..., c], [yy + dy, xx + dx], order=1, mode="nearest")
                  for c in range(3)], -1)
    reg = nd.map_coordinates(reg, [yy + dy, xx + dx], order=0, mode="nearest")
    del yy, xx
    # 7.2 paleta apagada y lavado
    L = lum(a)[..., None]
    a = a + (L - a) * 0.20
    a = a * (0.89 + 0.20 * nz.fbm(2.2, 4))[..., None]
    a = mix(a, np.array((96, 100, 118), np.float32), (0.12 * smooth(0.35, 0.75, nz.fbm(3.5, 3)))[..., None])
    # 7.3 grano
    g1 = blur(rng.normal(0, 1, (H, W)).astype(np.float32), 0.75 * U)
    g2 = blur(rng.normal(0, 1, (H, W)).astype(np.float32), 1.9 * U)
    tooth = 0.7 * g1 / (g1.std() + 1e-6) + 0.6 * g2 / (g2.std() + 1e-6)
    del g1, g2
    Wt = blur(W_CHALK[reg], 5 * U) * chalk_k
    Wg = blur(W_GAP[reg], 5 * U) * gap_k
    # 7.5 fondo oscuro que asoma
    s1, b1 = stripes(H, W, U, 46, 1.5, 9, 150, rng)
    gap = smooth(0.9, 2.1, s1 + 2.0 * (b1 - 0.5)) * smooth(0.5, -0.9, tooth)
    s2, b2 = stripes(H, W, U, 16, 1.0, -14, 90, rng)
    gap = np.maximum(gap, smooth(1.1, 2.2, s2 + 2.2 * (b2 - 0.5)) * smooth(0.4, -0.8, tooth))
    pits = smooth(-1.35, -2.1, tooth)
    k = np.clip(gap * Wg + 0.20 * pits, 0, 1)
    F = np.array(fondo, np.float32)
    a = mix(a, F, k[..., None])
    log("    acabado: huecos")
    # 7.6 tiza
    s3, b3 = stripes(H, W, U, 60, 1.3, 7, 170, rng)
    sc = smooth(0.7, 1.9, s3 + 2.4 * (b3 - 0.5)) * smooth(0.1, 1.1, tooth)
    s4, b4 = stripes(H, W, U, 22, 0.9, 19, 110, rng)
    sc = np.maximum(sc, smooth(0.9, 2.0, s4 + 2.4 * (b4 - 0.5)) * smooth(0.2, 1.2, tooth))
    s5, b5 = stripes(H, W, U, 9, 1.6, -30, 70, rng)
    sc = np.maximum(sc, 0.8 * smooth(1.2, 2.2, s5 + 2.6 * (b5 - 0.5)) * smooth(0.3, 1.2, tooth))
    C = np.array(chalk, np.float32)
    a = mix(a, mix(a, C, 0.72), np.clip(sc * Wt, 0, 1)[..., None])
    log("    acabado: tiza")
    # 7.7 borde, viñeta, tono
    a = a * (1 + 0.045 * np.clip(tooth, -2.5, 2.5))[..., None]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    dist = np.minimum.reduce([xx, yy, W - 1 - xx, H - 1 - yy]) / U
    borde = smooth(12 + 34 * nz.fbm(7, 3), 0, dist) * smooth(1.0, -0.6, tooth + 0.8)
    a = mix(a, F, (0.6 * borde)[..., None])
    u, v = xx / W, yy / H
    r2 = 2 * ((u - 0.5) ** 2 + (v - 0.5) ** 2)
    a = a * (1 - 0.20 * smooth(0.25, 1.0, r2))[..., None]
    a = a * np.array([1.015, 1.0, 0.965], np.float32)
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    out = out.filter(ImageFilter.UnsharpMask(radius=1.2 * U, percent=35, threshold=2))
    return out
