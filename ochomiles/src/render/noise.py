"""Texturas de ruido fractal periodicas (sintesis espectral) para el detalle del terreno.

R: ruido 1/f^2 (relieve fino), G y B: su gradiente (para relieve en el shader con una sola
lectura), A: ruido independiente 1/f^1.5 (variacion de albedo y acanaladuras).
"""
import numpy as np


def spectral_noise(n, beta, seed):
    rng = np.random.default_rng(seed)
    fx = np.fft.fftfreq(n)[None, :]
    fy = np.fft.fftfreq(n)[:, None]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1.0
    amp = f ** (-beta / 2.0)
    amp[0, 0] = 0.0
    amp[f > 0.45] *= np.exp(-((f[f > 0.45] - 0.45) / 0.03) ** 2)
    phase = rng.uniform(0, 2 * np.pi, (n, n))
    spec = amp * np.exp(1j * phase)
    a = np.real(np.fft.ifft2(spec))
    a = (a - a.mean()) / (a.std() + 1e-9)
    return a


def detail_texture(n=1024, seed=7):
    h = spectral_noise(n, 2.2, seed)
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    gs = max(np.abs(gx).max(), np.abs(gy).max())
    a = spectral_noise(n, 1.5, seed + 1)
    tex = np.stack([np.clip(h * 0.18 + 0.5, 0, 1),
                    np.clip(gx / gs * 0.5 + 0.5, 0, 1),
                    np.clip(gy / gs * 0.5 + 0.5, 0, 1),
                    np.clip(a * 0.18 + 0.5, 0, 1)], -1)
    return tex.astype(np.float16), float(gs)
