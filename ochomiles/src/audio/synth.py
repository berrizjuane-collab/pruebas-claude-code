"""Sintesis de instrumentos y diseno sonoro (numpy). Todo a 48 kHz, estereo float32.

Instrumentos: dron, pad de cristal, golpes graves (boom), tambores de membrana, subidas
(risers), platillo invertido. Efectos: viento por capas, respiracion, pasos con crampones
sobre nieve dura, barridos de aire (transiciones), nieve arrastrada.
Reverberacion: respuesta impulsional estereo sintetica (convolucion por FFT).
"""
import math

import numpy as np
from scipy import signal

SR = 48000


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def stereo(x, width=0.0, seed=0):
    """Mono -> estereo con decorrelacion ligera (retardos/filtros distintos por canal)."""
    if width <= 0:
        return np.stack([x, x], 1).astype(np.float32)
    rng = np.random.default_rng(seed)
    d = int(rng.uniform(0.0004, 0.0011) * SR)
    l = x
    r = np.concatenate([np.zeros(d), x[:-d]]) if d > 0 else x
    m = (l + r) * 0.5
    s = (l - r) * 0.5 * width
    return np.stack([m + s, m - s], 1).astype(np.float32)


def env_adsr(n, a, d, s, r, sr=SR):
    a, d, r = int(a * sr), int(d * sr), int(r * sr)
    sus = max(n - a - d - r, 0)
    e = np.concatenate([np.linspace(0, 1, max(a, 1)), np.linspace(1, s, max(d, 1)),
                        np.full(sus, s), np.linspace(s, 0, max(r, 1))])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))


def butter(x, kind, f, order=2):
    if isinstance(f, (list, tuple)):
        wn = [min(max(v / (SR / 2), 1e-5), 0.999) for v in f]
    else:
        wn = min(max(f / (SR / 2), 1e-5), 0.999)
    sos = signal.butter(order, wn, btype=kind, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def noise(n, seed, color="white"):
    rng = np.random.default_rng(seed)
    w = rng.standard_normal(n)
    if color == "pink":
        X = np.fft.rfft(w)
        f = np.arange(len(X)) + 1.0
        X /= np.sqrt(f)
        w = np.fft.irfft(X, n)
    elif color == "brown":
        w = np.cumsum(w)
        w = w - signal.savgol_filter(w, 4001 if n > 4001 else (n // 2) * 2 - 1, 2)
    return w / (np.std(w) + 1e-12)


def smooth_curve(n, points, sr=SR):
    """Curva por puntos (t, valor) con interpolacion suave (coseno)."""
    t = np.arange(n) / sr
    ts = np.array([p[0] for p in points])
    vs = np.array([p[1] for p in points])
    out = np.interp(t, ts, vs)
    # suavizado de esquinas
    k = int(0.05 * sr) | 1
    return np.convolve(np.pad(out, (k // 2, k // 2), mode="edge"), np.ones(k) / k, mode="valid")[:n]


# ------------------------------------------------------------------------------------------
# reverberacion
# ------------------------------------------------------------------------------------------
def make_ir(rt60=3.2, predelay=0.025, damp=0.55, size=1.0, seed=7, early=True):
    """IR estereo: reflexiones tempranas + cola difusa con caida dependiente de la frecuencia."""
    n = int((rt60 * 1.3 + predelay) * SR)
    rng = np.random.default_rng(seed)
    ir = np.zeros((n, 2))
    t = np.arange(n) / SR
    for c in range(2):
        tail = rng.standard_normal(n)
        # bandas con decaimientos distintos (graves mas largos, agudos amortiguados)
        bands = [(0, 250, 1.15), (250, 2000, 1.0), (2000, 6000, 1.0 - 0.35 * damp), (6000, 20000, 1.0 - 0.6 * damp)]
        acc = np.zeros(n)
        for lo, hi, k in bands:
            if lo == 0:
                b = butter(tail, "low", hi, 4)
            elif hi >= 20000:
                b = butter(tail, "high", lo, 4)
            else:
                b = butter(tail, "band", (lo, hi), 4)
            acc += b * np.exp(-6.9 * t / (rt60 * k))
        fade_in = np.clip((t - predelay) / 0.06, 0, 1)
        acc *= fade_in
        if early:
            for i in range(14):
                tt = predelay * 0.4 + rng.uniform(0.004, 0.09) * size
                j = int(tt * SR)
                if j < n:
                    acc[j] += rng.uniform(0.3, 0.8) * (1 if rng.random() > 0.5 else -1) * math.exp(-tt * 9)
        ir[:, c] = acc
    ir /= np.sqrt((ir ** 2).sum(0, keepdims=True)) + 1e-12
    return ir.astype(np.float32)


def convolve(x, ir):
    """x: (n, 2) estereo; ir: (m, 2). Cada canal con su IR (decorrelado)."""
    out = np.zeros((len(x) + len(ir) - 1, 2), np.float32)
    for c in range(2):
        out[:, c] = signal.fftconvolve(x[:, c], ir[:, c])
    return out


# ------------------------------------------------------------------------------------------
# instrumentos sinteticos
# ------------------------------------------------------------------------------------------
def midi_hz(n):
    return 440.0 * 2 ** ((n - 69) / 12.0)


def drone(dur, notes, level_curve, seed=1, bright=0.35):
    """Dron/pad: osciladores de sierra desafinados filtrados, vibrato lento."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    acc = np.zeros(n)
    for note in notes:
        f0 = midi_hz(note)
        for k in range(5):
            det = rng.uniform(-6, 6)                          # cents
            f = f0 * 2 ** (det / 1200)
            vib = 1 + 0.0012 * np.sin(2 * np.pi * rng.uniform(0.07, 0.19) * t + rng.uniform(0, 6))
            ph = 2 * np.pi * np.cumsum(f * vib) / SR + rng.uniform(0, 6.28)
            saw = 2 * ((ph / (2 * np.pi)) % 1.0) - 1
            acc += saw / 5
    cutoff = 300 + 2400 * bright
    acc = butter(acc, "low", cutoff, 2)
    acc = butter(acc, "high", 28, 2)
    acc *= level_curve(t) if callable(level_curve) else level_curve
    return stereo(acc / (len(notes) or 1), width=0.8, seed=seed)


def glass(dur, notes, level_curve, seed=2):
    """Pad cristalino: parciales senoidales con amplitud que respira (aire de altura)."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    L = np.zeros(n)
    R = np.zeros(n)
    for note in notes:
        f0 = midi_hz(note)
        for h, a in ((1, 1.0), (2, 0.35), (3, 0.12), (4.01, 0.06)):
            am = 0.6 + 0.4 * np.sin(2 * np.pi * rng.uniform(0.05, 0.22) * t + rng.uniform(0, 6))
            ph = rng.uniform(0, 6.28)
            s = np.sin(2 * np.pi * f0 * h * t + ph) * a * am
            pan = rng.uniform(0.2, 0.8)
            L += s * (1 - pan)
            R += s * pan
    lv = level_curve(t) if callable(level_curve) else level_curve
    return (np.stack([L, R], 1) * lv[:, None] / (len(notes) * 1.5)).astype(np.float32)


def boom(length=6.0, f_start=95.0, f_end=34.0, drop=0.35, seed=3, click=0.5, drive=1.6):
    """Impacto grave cinematografico: barrido senoidal descendente + transitorio + saturacion."""
    n = int(length * SR)
    t = np.arange(n) / SR
    f = f_end + (f_start - f_end) * np.exp(-t / drop)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 1.6)
    sub = np.sin(ph * 0.5) * np.exp(-t / 2.4) * 0.5
    rng = np.random.default_rng(seed)
    tr = butter(rng.standard_normal(n), "band", (60, 900), 2) * np.exp(-t / 0.035) * click
    x = body + sub + tr
    x = np.tanh(x * drive) / np.tanh(drive)
    return stereo(x * 0.9, width=0.3, seed=seed)


def membrane(f0=72.0, length=2.5, seed=4, slap=0.6, depth=0.45):
    """Tambor grave de membrana (tipo taiko): tono con caida de afinacion + golpe filtrado."""
    n = int(length * SR)
    t = np.arange(n) / SR
    f = f0 * (1 + depth * np.exp(-t / 0.05))
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = np.sin(ph) * np.exp(-t / 0.55) + 0.3 * np.sin(ph * 1.58) * np.exp(-t / 0.25)
    rng = np.random.default_rng(seed)
    sl = butter(rng.standard_normal(n), "band", (180, 1600), 2) * np.exp(-t / 0.04) * slap
    x = np.tanh((tone + sl) * 1.3)
    return stereo(x * 0.85, width=0.25, seed=seed)


def riser(dur, seed=5, f0=400.0, f1=7000.0, curve=2.2):
    """Subida de ruido filtrado (tension hacia un golpe)."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    u = t / dur
    x = noise(n, seed, "pink")
    out = np.zeros(n)
    blocks = 48
    for b in range(blocks):
        a, e = b * n // blocks, (b + 1) * n // blocks
        fc = f0 * (f1 / f0) ** ((a / n) ** 1.2)
        seg = butter(x[max(a - 2000, 0):e], "band", (fc * 0.6, min(fc * 1.6, 20000)), 2)[-(e - a):]
        out[a:e] = seg
    out *= u ** curve
    return stereo(out * 0.5, width=0.9, seed=seed)


def reverse_cymbal(dur, ir, seed=6):
    """Platillo invertido: rafaga de ruido brillante a traves de la sala, invertida en el tiempo."""
    n = int(0.25 * SR)
    rng = np.random.default_rng(seed)
    hit = butter(rng.standard_normal(n), "high", 3500, 2) * np.exp(-np.arange(n) / SR / 0.05)
    x = stereo(hit, width=0.6, seed=seed)
    wet = convolve(x, ir)
    m = int(dur * SR)
    wet = wet[:m] if len(wet) >= m else np.pad(wet, ((0, m - len(wet)), (0, 0)))
    rev = wet[::-1].copy()
    return rev / (np.abs(rev).max() + 1e-9) * 0.6


# ------------------------------------------------------------------------------------------
# diseno sonoro
# ------------------------------------------------------------------------------------------
def wind(dur, intensity, seed=10):
    """Viento de altura por capas: rumor grave, soplo medio con rachas, silbido y polvo de nieve.
    intensity: funcion t -> 0..1 (rachas)."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    I = intensity(t)
    rng = np.random.default_rng(seed)
    out = np.zeros((n, 2))
    for c in range(2):
        base = noise(n, seed + c, "pink")
        low = butter(base, "low", 180, 2) * 0.9
        # soplo medio con banda que se mueve con la racha
        mid_src = noise(n, seed + 10 + c, "pink")
        mid = np.zeros(n)
        blocks = int(dur * 8) + 1
        for b in range(blocks):
            a, e = b * n // blocks, (b + 1) * n // blocks
            fc = 350 + 900 * I[min(a, n - 1)]
            mid[a:e] = butter(mid_src[max(a - 3000, 0):e], "band", (fc * 0.55, fc * 1.7), 2)[-(e - a):]
        # silbido: resonancia estrecha que deriva lentamente
        wh_src = noise(n, seed + 20 + c, "white")
        wh = np.zeros(n)
        for b in range(blocks):
            a, e = b * n // blocks, (b + 1) * n // blocks
            fc = 1500 + 700 * math.sin(a / SR * 0.21 + c) + 400 * I[min(a, n - 1)]
            wh[a:e] = butter(wh_src[max(a - 3000, 0):e], "band", (fc * 0.97, fc * 1.03), 2)[-(e - a):]
        hiss = butter(noise(n, seed + 30 + c, "white"), "high", 4500, 2)
        out[:, c] = (low * (0.5 + 0.5 * I) + mid * (0.25 + 0.9 * I) + wh * (0.05 + 0.25 * I ** 2)
                     + hiss * 0.18 * I ** 2)
    return (out * 0.25).astype(np.float32)


def breath(kind="exhale", length=1.4, seed=20, effort=1.0):
    """Respiracion a gran altura: ruido con formantes de boca/garganta y envolvente organica."""
    n = int(length * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    x = noise(n, seed, "white")
    if kind == "inhale":
        bands = [(900, 1.0), (2300, 0.7), (3600, 0.35)]
        env = np.sin(np.clip(t / length, 0, 1) * math.pi) ** 1.6 * (0.6 + 0.4 * t / length)
    else:
        bands = [(500, 1.0), (1150, 0.8), (2500, 0.35)]
        env = np.clip(t / 0.12, 0, 1) * np.exp(-np.clip(t - 0.12, 0, None) / (length * 0.42))
    out = np.zeros(n)
    for fc, a in bands:
        q = 0.30
        out += butter(x, "band", (fc * (1 - q), fc * (1 + q)), 2) * a
    # ligera aspereza (turbulencia irregular)
    rough = 1 + 0.25 * butter(rng.standard_normal(n), "low", 30, 2)
    out *= env * rough * effort
    return stereo(out * 0.6, width=0.15, seed=seed)


def crampon_step(seed=30, weight=1.0):
    """Paso con crampones sobre costra dura: golpe sordo de bota, crujido granular y el
    chasquido metalico de las puntas al entrar en la nieve."""
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    thump = np.sin(2 * np.pi * 85 * t) * np.exp(-t / 0.05) * 0.8 * weight
    crunch = np.zeros(n)
    grains = rng.integers(0, int(0.16 * SR), 140)
    for g in grains:
        ln = rng.integers(40, 220)
        if g + ln < n:
            crunch[g:g + ln] += rng.standard_normal(ln) * np.exp(-np.arange(ln) / (ln * 0.3)) * rng.uniform(0.2, 1)
    crunch = butter(crunch, "band", (900, 5200), 2) * 0.9
    tick = np.zeros(n)
    for k in range(4):
        s = int(rng.uniform(0.004, 0.03) * SR)
        f = rng.uniform(3200, 6200)
        ln = int(0.03 * SR)
        tt = np.arange(ln) / SR
        tick[s:s + ln] += np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.006) * 0.25
    x = thump + crunch + tick
    return stereo(x * 0.7, width=0.2, seed=seed)


def whoosh(dur, seed=40, f0=300.0, f1=2500.0, peak=0.55, low=0.0, width=0.9):
    """Barrido de aire: ruido filtrado con banda que sube y baja, envolvente asimetrica."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    u = t / dur
    x = noise(n, seed, "pink")
    out = np.zeros(n)
    blocks = 40
    for b in range(blocks):
        a, e = b * n // blocks, (b + 1) * n // blocks
        uu = a / n
        fc = f0 + (f1 - f0) * math.sin(min(uu / peak, 1.0) * math.pi / 2) if uu < peak else \
            f1 + (f0 - f1) * ((uu - peak) / (1 - peak))
        out[a:e] = butter(x[max(a - 2000, 0):e], "band", (fc * 0.5, min(fc * 1.8, 20000)), 2)[-(e - a):]
    env = np.where(u < peak, (u / peak) ** 2, np.exp(-(u - peak) / max(1 - peak, 1e-3) * 3.2))
    out = out * env
    if low > 0:
        out += butter(noise(n, seed + 1, "brown"), "low", 120, 2) * env * low
    return stereo(out * 0.55, width=width, seed=seed)


def snow_hiss(dur, seed=50):
    """Nieve arrastrada por el viento (ventisca rasante): siseo granular agudo."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = butter(noise(n, seed, "white"), "band", (3000, 11000), 2)
    rng = np.random.default_rng(seed)
    gran = butter(np.abs(rng.standard_normal(n)), "low", 60, 1)
    env = np.sin(np.clip(t / dur, 0, 1) * math.pi) ** 0.8
    return stereo(x * gran * env * 0.5, width=0.95, seed=seed)
