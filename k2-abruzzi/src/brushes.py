"""Procedural brush-stroke textures and canvas.

A brush texture is a (BH, BW) alpha/height map in stroke space: u runs along the stroke
(columns), v across it (rows).  Bristle streaks run along u, edges are ragged and the
tail of the stroke dries out - the marks a loaded flat brush leaves on primed canvas.
"""
import numpy as np
from scipy import ndimage

BW, BH = 192, 48


def _bristle_tex(rng, kind):
    v = np.linspace(-1, 1, BH)[:, None]
    u = np.linspace(0, 1, BW)[None, :]
    # bristles: 1-D noise across v, stretched along u
    n_br = rng.standard_normal((BH, 1))
    n_br = ndimage.gaussian_filter1d(n_br, 0.8, axis=0)
    n_br = (n_br - n_br.min()) / (np.ptp(n_br) + 1e-6)
    streak = 0.72 + 0.28 * n_br                     # per-bristle paint load
    # paint runs out toward the tail; some bristles run dry earlier
    dry_at = 0.55 + 0.45 * rng.random((BH, 1)) ** 0.6
    load = np.clip((dry_at - u) / 0.25 + 0.6, 0, 1)
    # ragged edge profile
    edge_noise = ndimage.gaussian_filter1d(rng.standard_normal(BW), 3.0)
    half = 0.86 + 0.08 * edge_noise[None, :] / (np.abs(edge_noise).max() + 1e-6)
    prof = np.clip((half - np.abs(v)) / 0.10, 0, 1)
    # head/tail shape
    if kind == 0:   # flat brush: square-ish head, dry tail
        head = np.clip(u / 0.06, 0, 1)
    else:           # filbert: rounded head
        head = np.clip(1.0 - ((1 - np.clip(u / 0.22, 0, 1)) ** 2) / np.maximum(1 - v ** 2, 1e-3) * 0.9, 0, 1)
    tail = np.clip((1.0 - u) / 0.12, 0, 1)
    # paper tooth
    tooth = ndimage.gaussian_filter(rng.random((BH, BW)), 0.7)
    tooth = (tooth - tooth.min()) / (np.ptp(tooth) + 1e-6)
    a = prof * head * tail * streak * load
    a = a * (0.85 + 0.3 * tooth)
    a = np.clip(a * 1.45, 0, 1)
    return a.astype(np.float32)


def make_brushes(n=8, seed=5):
    rng = np.random.default_rng(seed)
    return np.stack([_bristle_tex(rng, k % 2) for k in range(n)]).astype(np.float32)


def make_canvas(W, H, seed=9):
    """Linen-like canvas weave + grain, centred on 1.0 (multiplicative)."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    period = 4.2
    jx = ndimage.gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 6) * 6
    jy = ndimage.gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 6) * 6
    wx = np.sin((xx + jx) * 2 * np.pi / period)
    wy = np.sin((yy + jy) * 2 * np.pi / period)
    weave = 0.5 * (wx * (wy > 0) + wy * (wx <= 0))
    grain = ndimage.gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 0.8)
    blot = ndimage.gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 40)
    blot /= np.abs(blot).max() + 1e-6
    c = 1.0 + 0.022 * weave + 0.03 * grain / (grain.std() + 1e-6) * 0.5 + 0.025 * blot
    # canvas height for impasto lighting
    h = 0.5 * weave + 0.3 * grain / (grain.std() + 1e-6)
    return c.astype(np.float32), h.astype(np.float32)
