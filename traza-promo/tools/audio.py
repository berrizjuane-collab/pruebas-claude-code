#!/usr/bin/env python3
"""TRAZA · Diseño sonoro del spot, sintetizado desde cero.

Lee las marcas de tiempo que exporta la animación (tools/cues.json) y compone
una pista estéreo de 48 kHz: efectos de interfaz sincronizados al fotograma y
una base musical a 120 BPM que acompaña el arco del spot:

  gancho (si menor, pregunta) → producto (re mayor, pulso) → giro (tensión)
  → cierre (resolución en re mayor con el logo).

Uso:  python3 tools/audio.py tools/cues.json salida.wav
"""
import json
import sys

import numpy as np
from scipy import signal

SR = 48000
RNG = np.random.default_rng(20260929)


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(dur):
    return np.arange(int(round(dur * SR))) / SR


def noise(n):
    return RNG.standard_normal(n)


def sos(kind, f, order=2, q=None):
    nyq = SR / 2
    if kind == 'bp':
        lo, hi = f
        return signal.butter(order, [lo / nyq, min(hi / nyq, 0.99)], 'bandpass', output='sos')
    return signal.butter(order, min(f / nyq, 0.99), 'lowpass' if kind == 'lp' else 'highpass', output='sos')


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x)


def sweep_filter(x, f0, f1, kind='bp', width=1.4, block=256, curve=None):
    """Filtro que recorre de f0 a f1 (bloques con estado continuo)."""
    out = np.zeros_like(x)
    n = len(x)
    zi = None
    for i in range(0, n, block):
        p = i / max(1, n - 1)
        if curve:
            p = curve(p)
        fc = f0 * (f1 / f0) ** p
        s = sos('bp', (fc / width, fc * width)) if kind == 'bp' else sos(kind, fc)
        if zi is None or zi.shape[0] != s.shape[0]:
            zi = np.zeros((s.shape[0], 2))
        seg, zi = signal.sosfilt(s, x[i:i + block], zi=zi)
        out[i:i + block] = seg
    return out


class Mix:
    """Bus estéreo con envío a reverberación."""

    def __init__(self, dur):
        self.n = int(dur * SR)
        self.dry = np.zeros((2, self.n))
        self.rev = np.zeros((2, self.n))

    def add(self, t0, x, gain=1.0, pan=0.0, rev=0.15, width=0.0):
        if t0 < 0:
            x = x[int(-t0 * SR):]
            t0 = 0
        i = int(round(t0 * SR))
        if i >= self.n or len(x) == 0:
            return
        x = x[: self.n - i] * gain
        th = (np.clip(pan, -1, 1) + 1) * np.pi / 4
        l, r = np.cos(th), np.sin(th)
        if width:
            # pequeño retardo entre canales para dar cuerpo
            d = int(width * SR)
            xr = np.concatenate([np.zeros(d), x])[: len(x)]
            self.dry[0, i:i + len(x)] += x * l * np.sqrt(2)
            self.dry[1, i:i + len(x)] += xr * r * np.sqrt(2)
        else:
            self.dry[0, i:i + len(x)] += x * l * np.sqrt(2)
            self.dry[1, i:i + len(x)] += x * r * np.sqrt(2)
        self.rev[0, i:i + len(x)] += x * rev * l * np.sqrt(2)
        self.rev[1, i:i + len(x)] += x * rev * r * np.sqrt(2)


def fade(x, a=0.002, r=0.01):
    n = len(x)
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return x * e


# ---------------------------------------------------------------------------
# Instrumentos
# ---------------------------------------------------------------------------
def marimba(f, vel=1.0, bright=1.0, dur=None):
    """Síntesis modal: fundamental + modos 3,93 y 9,2 (barra de marimba)."""
    tau = float(np.clip(0.9 * (330 / f) ** 0.55, 0.12, 1.3))
    t = tt(dur or min(3.2, tau * 5))
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / tau)
    for ratio, amp, k in ((3.93, 0.30, 0.22), (9.2, 0.09, 0.07)):
        if f * ratio < SR * 0.45:
            y += amp * bright * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / (tau * k))
    mallet = filt(noise(len(t)), 'bp', (1500, 7000)) * np.exp(-t / 0.0025) * 0.06 * bright
    y = y + mallet
    y *= np.minimum(1, t / 0.0012)
    return fade(y, 0, 0.02) * vel


def bell(f, vel=1.0, dur=2.5):
    t = tt(dur)
    y = np.zeros(len(t))
    for ratio, amp, tau in ((1, 1, 1.4), (2.0, 0.35, 0.8), (2.76, 0.22, 0.5), (5.4, 0.08, 0.2), (8.93, 0.03, 0.1)):
        if f * ratio < SR * 0.45:
            y += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / tau)
    y *= np.minimum(1, t / 0.002)
    return fade(y, 0, 0.05) * vel


def kick(vel=1.0):
    t = tt(0.55)
    f = 52 + 120 * np.exp(-t / 0.028)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) * np.exp(-t / 0.2) + 0.45 * np.sin(2 * ph) * np.exp(-t / 0.06)
    y += filt(noise(len(t)), 'bp', (1500, 6000)) * np.exp(-t / 0.004) * 0.3
    return fade(np.tanh(1.4 * y), 0, 0.05) * vel


def clap(vel=1.0):
    t = tt(0.35)
    e = np.zeros(len(t))
    for d in (0, 0.009, 0.019):
        e += (t >= d) * np.exp(-np.clip(t - d, 0, None) / 0.005)
    e += (t >= 0.024) * np.exp(-np.clip(t - 0.024, 0, None) / 0.07) * 0.7
    return fade(filt(noise(len(t)) * e, 'bp', (900, 5000)), 0, 0.03) * vel


def shaker(vel=1.0):
    t = tt(0.12)
    env = np.minimum(1, t / 0.008) * np.exp(-t / 0.028)
    return fade(filt(noise(len(t)), 'hp', 6500, 4) * env, 0, 0.01) * vel


def bass(f, dur, vel=1.0):
    t = tt(dur + 0.12)
    y = np.sin(2 * np.pi * f * t) + 0.32 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)
    env = np.minimum(1, t / 0.006) * np.exp(-t / (dur * 1.1)) * np.clip((dur + 0.12 - t) / 0.12, 0, 1)
    return np.tanh(1.3 * y * env) * vel


def pad(notes, dur, vel=1.0, attack=0.4, release=1.0, bright=0.45):
    t = tt(dur + release)
    y = np.zeros(len(t))
    for m in notes:
        for det in (-0.0045, 0.0, 0.0045):
            f = midi(m) * (1 + det)
            ph = RNG.uniform(0, 2 * np.pi)
            for k in range(1, int(min(10, 4200 / f)) + 1):
                y += (bright ** (k - 1)) / k * np.sin(2 * np.pi * f * k * t + ph * k)
    y /= len(notes) * 3
    env = np.minimum(1, t / attack) ** 1.5 * np.clip((dur + release - t) / release, 0, 1) ** 1.3
    vib = 1 + 0.03 * np.sin(2 * np.pi * 0.35 * t)
    return filt(y * env * vib, 'lp', 3200) * vel


def whoosh(dur, vel=1.0, f0=250, f1=4000, shape='swell'):
    n = int(dur * SR)
    x = noise(n)
    y = sweep_filter(x, f0, f1, 'bp', 1.6)
    p = np.linspace(0, 1, n)
    env = np.sin(np.pi * p) ** 1.6 if shape == 'swell' else (p ** 2.2 if shape == 'rise' else (1 - p) ** 2.5)
    return fade(y * env, 0.005, 0.02) * vel


def tick(f=3200, vel=1.0, decay=0.004):
    t = tt(0.03)
    y = filt(noise(len(t)), 'bp', (f / 1.5, f * 1.5)) * np.exp(-t / decay)
    y += 0.4 * np.sin(2 * np.pi * f * 0.5 * t) * np.exp(-t / 0.006)
    return fade(y, 0, 0.005) * vel


def blip(f, vel=1.0, dur=0.16):
    """Burbuja: sube de tono muy rápido y se apaga."""
    t = tt(dur)
    fr = f * (0.62 + 0.38 * (1 - np.exp(-t / 0.012)))
    y = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t / 0.05) * np.minimum(1, t / 0.002)
    return fade(y, 0, 0.02) * vel


def glide(f0, f1, dur, vel=1.0, decay=None):
    t = tt(dur)
    fr = f0 * (f1 / f0) ** (t / dur)
    env = np.sin(np.pi * t / dur) ** 0.8 if decay is None else np.exp(-t / decay)
    y = np.sin(2 * np.pi * np.cumsum(fr) / SR) * env
    return fade(y, 0.003, 0.02) * vel


def reverb_ir(dur=1.6, decay=0.42):
    t = tt(dur)
    irs = []
    for _ in range(2):
        x = noise(len(t)) * np.exp(-t / decay)
        x = filt(x, 'lp', 5200)
        x[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
        irs.append(x / np.sqrt(np.sum(x ** 2)))
    return irs


# ---------------------------------------------------------------------------
# Composición
# ---------------------------------------------------------------------------
def compose(cues, dur):
    mus = Mix(dur)
    fx = Mix(dur)
    by = {}
    for c in cues:
        by.setdefault(c['type'], []).append(c)

    # --- Gancho -----------------------------------------------------------
    for c in by.get('drop', []):
        fx.add(c['t'] - 0.004, marimba(midi(67), 0.9, 0.5, 0.6), 0.3, 0, 0.18)
        fx.add(c['t'], kick(0.35), 0.32, 0, 0.05)
    for c in by.get('whoosh', []):
        d = c.get('dur', 0.45)
        fx.add(c['t'] - 0.05, whoosh(d + 0.12, 1, 220, 3200), 0.09, -0.2, 0.25, 0.012)
    for c in by.get('hop', []):
        fx.add(c['t'], glide(420, 900, 0.22, 1), 0.12, -0.3, 0.2)
    for c in by.get('up', []):
        fx.add(c['t'], marimba(midi(81), 0.8, 1.0), 0.32, -0.55, 0.3)
        fx.add(c['t'], marimba(midi(88), 0.5, 0.8), 0.2, -0.55, 0.3)
        fx.add(c['t'] - 0.02, whoosh(0.3, 1, 600, 5000, 'decay'), 0.05, -0.55, 0.2)
    # Lluvia: escala de re mayor que baja de D7 a B3 y se acelera (el dinero que sale)
    scale = [98, 97, 95, 93, 91, 90, 88, 86, 85, 83, 81, 79, 78, 76, 74, 73, 71, 69, 67, 66, 64, 62, 61, 59]
    for c in by.get('rain', []):
        k = c['i']
        f = midi(scale[k])
        v = 0.105 * (0.6 + 0.4 * min(1, 500 / f))
        fx.add(c['t'], marimba(f, 1.0, 1.0 - 0.3 * k / 23, 0.55), v, -0.75 + 1.5 * k / 23, 0.28)
    for c in by.get('question', []):
        # si menor con novena: curiosidad
        mus.add(c['t'] - 0.05, pad([47, 54, 59, 62, 73], 1.1, 1, 0.35, 0.3, 0.4), 0.2, 0, 0.35, 0.01)
        mus.add(c['t'], bass(midi(35), 1.0, 1), 0.15, 0, 0.05)
        # subida hacia la entrada del ritmo
        mus.add(c['t'] + 0.46, whoosh(0.7, 1, 400, 7000, 'rise'), 0.13, 0, 0.3, 0.015)
    for c in by.get('swish', []):
        fx.add(c['t'], whoosh(0.28, 1, 2500, 9000, 'decay'), 0.06, -0.1, 0.2)
    for c in by.get('retract', []):
        for i in range(8):
            fx.add(c['t'] + i * 0.022, tick(2600 + i * 180, 1, 0.003), 0.07, 0.6 - i * 0.15, 0.1)

    # --- Interfaz ---------------------------------------------------------
    for c in by.get('reel', []):
        for i, g in enumerate((0.5, 0.6, 0.75, 1.0)):
            fx.add(c['t'] + 0.03 + i * 0.03, tick(1800 + 300 * i, 1, 0.005), 0.09 * g, -0.6, 0.08)
    for c in by.get('slide', []):
        d = c.get('dur', 0.66)
        n = 11
        for k in range(n):
            u = (k / (n - 1)) ** 1.7            # cada vez más espaciado, como el pulgar que frena
            fx.add(c['t'] + u * d * 0.85, tick(2200 + 900 * k / n, 1, 0.003), 0.08 * (1 - 0.5 * k / n), 0.35, 0.05)
    for c in by.get('click', []):
        fx.add(c['t'], tick(4200, 1, 0.0025), 0.22, 0.25, 0.05)
        fx.add(c['t'] + 0.085, tick(3600, 1, 0.002), 0.14, 0.25, 0.05)
        fx.add(c['t'], kick(0.25), 0.25, 0.25, 0.02)
    for c in by.get('key', []):
        fx.add(c['t'], tick(2400, 1, 0.006), 0.16, 0.35, 0.06)
        fx.add(c['t'] + 0.05, tick(1800, 1, 0.004), 0.08, 0.35, 0.06)
    for c in by.get('count', []):
        d = c.get('dur', 0.7)
        down = c.get('down', False)
        n = 18
        for k in range(n):
            u = (k / (n - 1)) ** 2.0
            fx.add(c['t'] + u * d * 0.9, tick(2800 - (900 if down else 0) + 400 * np.sin(k), 1, 0.003), 0.07 * (1 - 0.4 * k / n), 0.1, 0.06)
        land = c['t'] + d * 0.95
        if down:
            fx.add(land, marimba(midi(78), 0.8), 0.16, 0, 0.3)
        else:
            fx.add(land, marimba(midi(81), 0.8), 0.24, 0, 0.3)
            fx.add(land + 0.06, marimba(midi(86), 0.6), 0.18, 0.1, 0.3)
    pops = [74, 78, 81, 86, 76, 81, 83, 86]
    for c in by.get('pop', []):
        i = c.get('i', 0)
        fx.add(c['t'], blip(midi(pops[i % len(pops)]), 1), 0.2, -0.2 + 0.15 * (i % 4), 0.15)
    for c in by.get('focus', []):
        fx.add(c['t'], bell(midi(78), 0.6, 1.4), 0.14, -0.15, 0.35)
    for c in by.get('sweep', []):
        d = c.get('dur', 0.8)
        fx.add(c['t'], glide(330, 740, d, 1), 0.07, -0.3, 0.3)
        fx.add(c['t'], whoosh(d, 1, 800, 6000, 'swell'), 0.035, -0.3, 0.2)
    for c in by.get('dot', []):
        i = c.get('i', 0)
        fx.add(c['t'], tick(3000 + i * 60, 1, 0.002), 0.035, 0.4, 0.05)
    for c in by.get('note', []):
        # cuota más baja: dos notas que suben (¡buena noticia!)
        fx.add(c['t'], marimba(midi(74), 0.9), 0.19, -0.1, 0.3)
        fx.add(c['t'] + 0.09, marimba(midi(78), 0.9), 0.19, -0.1, 0.3)
    for c in by.get('uhoh', []):
        # …pero los intereses suben: «uh-oh» en tercera menor, con fa natural que choca
        fx.add(c['t'], marimba(midi(69), 1.0, 0.7), 0.24, 0.05, 0.3)
        fx.add(c['t'] + 0.16, marimba(midi(65), 1.0, 0.6), 0.26, 0.05, 0.3)
        fx.add(c['t'] + 0.16, glide(midi(65) * 2, midi(64) * 2, 0.35, 1, 0.12), 0.05, 0.05, 0.2)
    for c in by.get('paper', []):
        n = int(0.42 * SR)
        x = filt(noise(n), 'bp', (1200, 6000))
        p = np.linspace(0, 1, n)
        flutter = 0.6 + 0.4 * np.sin(2 * np.pi * 22 * p * 0.42)
        fx.add(c['t'], fade(x * np.sin(np.pi * p) ** 1.2 * flutter, 0.01, 0.03), 0.05, 0.2, 0.2)

    # --- Cierre -----------------------------------------------------------
    for c in by.get('collapse', []):
        d = c.get('dur', 0.28)
        fx.add(c['t'], glide(1400, 140, d + 0.04, 1), 0.08, 0, 0.1)
        fx.add(c['t'] - 0.25, whoosh(d + 0.3, 1, 500, 8000, 'rise'), 0.07, 0, 0.2, 0.01)
    for c in by.get('boom', []):
        t = tt(1.4)
        f = 40 + 60 * np.exp(-t / 0.06)
        y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.45)
        fx.add(c['t'], fade(np.tanh(1.5 * y), 0.002, 0.1), 0.26, 0, 0.1)
        fx.add(c['t'], whoosh(0.7, 1, 150, 1500, 'decay'), 0.06, 0, 0.3, 0.015)
    for c in by.get('line', []):
        fx.add(c['t'], whoosh(0.34, 1, 1500, 7000, 'swell'), 0.04, 0, 0.3, 0.01)
    for i, c in enumerate(by.get('stroke', [])):
        fx.add(c['t'], marimba(midi([69, 74, 78][i % 3]), 0.9, 0.8), 0.24, [-0.25, 0.25, 0][i % 3], 0.35)
    for c in by.get('land', []):
        t0 = c['t']
        fx.add(t0, marimba(midi(62), 0.9, 0.4, 0.8), 0.3, 0, 0.2)
        fx.add(t0, kick(0.5), 0.35, 0, 0.1)
        # re mayor con novena: resolución
        mus.add(t0 - 0.02, pad([50, 57, 62, 66, 69, 73, 76], dur - t0 - 0.9, 1, 0.08, 0.9, 0.5), 0.34, 0, 0.45, 0.012)
        mus.add(t0, bass(midi(38), 1.7, 1), 0.3, 0, 0.1)
        for k, m in enumerate((74, 81, 86)):
            fx.add(t0 + 0.012 * k, marimba(midi(m), 0.8, 0.6), 0.16, (-0.3, 0.3, 0)[k], 0.45)
        fx.add(t0 + 0.02, bell(midi(90), 0.5, 2.0), 0.06, 0.2, 0.5)
    for c in by.get('logo', []):
        fx.add(c['t'], whoosh(0.45, 1, 400, 3000, 'swell'), 0.045, 0.4, 0.3)

    # --- Base musical a 120 BPM (re mayor), del inicio del producto al pliegue ---
    start = 3.5
    stop = by['collapse'][0]['t'] if 'collapse' in by else 12.0
    beat = 0.5
    s16 = beat / 4
    # (inicio del compás, raíz del bajo, voces del acorde)
    prog = [
        (3.5, 38, [54, 57, 61, 64]),   # Dmaj9  · Configura
        (5.5, 43, [59, 62, 66, 69]),   # Gmaj9  · Calcula
        (7.5, 35, [62, 66, 69, 73]),   # Bm9    · Entiende
        (9.5, 40, [55, 59, 62, 66]),   # Em9    · el giro
        (10.5, 33, [62, 64, 67, 69]),  # A7sus4 · Exporta
        (11.5, 33, [61, 64, 67, 69]),  # A7     · hacia el cierre
    ]

    def chord_at(t):
        cur = prog[0]
        for p in prog:
            if t + 1e-6 >= p[0]:
                cur = p
        return cur

    t = start
    step = 0
    while t < stop - 1e-6:
        pos = step % 16
        c0, root, voices = chord_at(t)
        # bombo en 1 y 3 (+ fantasma), palmas en 2 y 4, shaker en semicorcheas
        if pos in (0, 8):
            mus.add(t, kick(1), 0.62, 0, 0.03)
        if pos == 14:
            mus.add(t, kick(0.5), 0.22, 0, 0.03)
        if pos in (4, 12):
            mus.add(t, clap(1), 0.21, 0.1, 0.25)
        mus.add(t, shaker(1), 0.055 * (1.0 if pos % 4 == 2 else 0.55), 0.45 if pos % 2 else -0.45, 0.05)
        # bajo
        pat = {0: (0, 0.34), 3: (0, 0.12), 6: (12, 0.2), 8: (7, 0.34), 11: (0, 0.12), 14: (12, 0.2)}
        if pos in pat:
            iv, d = pat[pos]
            mus.add(t, bass(midi(root + iv), d, 1), 0.25, 0, 0.02)
        # acordes de marimba a contratiempo
        if pos in (2, 7, 10, 15):
            vv = voices if pos in (2, 10) else voices[1:3]
            for j, m in enumerate(vv):
                mus.add(t + 0.004 * j, marimba(midi(m), 0.7, 0.9, 0.9), 0.1, (-0.35 + 0.23 * j), 0.3)
        # pad continuo muy suave en cada cambio de acorde
        if abs(t - c0) < 1e-6:
            nxt = min([p[0] for p in prog if p[0] > t + 1e-6] + [stop])
            mus.add(t, pad(voices, nxt - t, 1, 0.25, 0.35, 0.4), 0.12, 0, 0.4, 0.01)
        t = round(t + s16, 6)
        step += 1

    return mus, fx


def limiter(x, thr=0.89, release=0.08):
    """Limitador de picos con anticipación de 2 ms."""
    from scipy.ndimage import maximum_filter1d
    look = int(0.002 * SR)
    peak = np.max(np.abs(x), axis=0)
    env = maximum_filter1d(peak, size=2 * look + 1)   # máximo en ventana deslizante (anticipación)
    gain = np.minimum(1.0, thr / np.maximum(env, 1e-9))
    # suavizado: ataque instantáneo, liberación exponencial
    a = np.exp(-1 / (release * SR))
    g = np.empty_like(gain)
    cur = 1.0
    for i in range(len(gain)):
        cur = gain[i] if gain[i] < cur else a * cur + (1 - a) * gain[i]
        g[i] = cur
    return x * g


def measure_lufs(mix):
    """Sonoridad integrada (EBU R128) medida con el filtro ebur128 de ffmpeg."""
    import os
    import re
    import subprocess
    import tempfile
    import wave
    ff = os.environ.get('FFMPEG', 'ffmpeg')
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        path = f.name
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((mix.T * 32767).astype(np.int16).tobytes())
    r = subprocess.run([ff, '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True)
    os.unlink(path)
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)[-1])


def main():
    cues_path, out = sys.argv[1], sys.argv[2]
    data = json.load(open(cues_path))
    dur = float(data['dur'])
    mus, fx = compose(data['cues'], dur + 0.001)

    ir = reverb_ir()
    rev_in = mus.rev + fx.rev
    rev = np.stack([signal.fftconvolve(rev_in[c], ir[c])[: rev_in.shape[1]] for c in range(2)])

    mix = mus.dry * 0.9 + fx.dry * 1.0 + rev * 0.55
    mix = signal.sosfilt(sos('hp', 45, 2), mix, axis=1)        # sin continua ni subgraves inútiles
    mix = mix + 0.5 * signal.sosfilt(sos('hp', 3500, 2), mix, axis=1)    # +3,5 dB de presencia y aire
    # entrada y salida limpias
    n = mix.shape[1]
    mix[:, : int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    tail = int(0.6 * SR)
    mix[:, -tail:] *= np.linspace(1, 0, tail) ** 1.5
    # sonoridad objetivo: -15 LUFS integrados con picos ≤ -1 dBFS (limitador con anticipación)
    mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.5
    target = -15.0
    for _ in range(4):
        out_mix = np.clip(limiter(mix, thr=0.891), -0.999, 0.999)
        lufs = measure_lufs(out_mix)
        if abs(lufs - target) < 0.2:
            break
        mix = mix * 10 ** ((target - lufs) / 20)
    mix = out_mix
    print(f'sonoridad integrada ≈ {lufs:.1f} LUFS')

    pcm = (mix.T * 32767).astype(np.int16)
    import wave
    with wave.open(out, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f'audio → {out}  ({n / SR:.2f} s, pico {20 * np.log10(np.max(np.abs(mix))):.2f} dBFS)')


if __name__ == '__main__':
    main()
