"""Synthesised sound design: high-altitude wind, spindrift, crampons on snow, rope and metal,
tent fabric, breathing, ice creaks.  Every layer is keyed to the shot timeline."""
import os
import sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, lfilter

SR = 48000
DUR = 56.0
OUT = '/home/user/k2data/audio'
rng = np.random.default_rng(2024)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)


def smooth_noise(n, rate_hz, seed):
    """Slow random control signal in [0,1] (gusts)."""
    r = np.random.default_rng(seed)
    k = max(4, int(n / SR * rate_hz) + 4)
    pts = r.random(k)
    x = np.interp(np.arange(n), np.linspace(0, n, k), pts)
    return lp(x, rate_hz * 1.5, 1)


def env_points(n, pts):
    t, g = zip(*pts)
    return np.interp(np.arange(n) / SR, t, g)


def stereo(x, width=0.6, seed=0):
    """Decorrelated stereo from mono via short complementary delays."""
    d = int(0.011 * SR)
    l = x
    r = np.concatenate([np.zeros(d), x[:-d]]) * width + x * (1 - width)
    return np.stack([l, r], 1)


# --------------------------------------------------------------------------------------------
def wind_bed(n, intensity, seed=1, low=True):
    """Layered wind: rumble + broadband howl with moving resonances + whistle."""
    w = np.random.default_rng(seed).standard_normal(n)
    gust = smooth_noise(n, 0.35, seed + 1)
    gust2 = smooth_noise(n, 1.1, seed + 2)
    g = (0.45 + 0.55 * gust) * (0.8 + 0.2 * gust2)
    out = np.zeros(n)
    if low:
        out += lp(w, 160, 2) * 1.6 * g
    # howl: band-passed noise whose centre follows the gusts (processed in blocks)
    blk = 2048
    howl = np.zeros(n)
    for c, q, amp, sd in ((420, 0.35, 0.8, 11), (900, 0.25, 0.5, 12), (2200, 0.3, 0.25, 13)):
        cen = c * (0.7 + 0.6 * smooth_noise(n, 0.5, seed + sd))
        src = np.random.default_rng(seed + sd).standard_normal(n)
        zi = None
        y = np.zeros(n)
        for i in range(0, n, blk):
            f = float(cen[i])
            lo, hi = f * (1 - q), f * (1 + q)
            b, a = butter(2, [lo, hi], 'band', fs=SR)
            if zi is None or len(zi) != max(len(a), len(b)) - 1:
                from scipy.signal import lfilter_zi
                zi = lfilter_zi(b, a) * 0
            y[i:i + blk], zi = lfilter(b, a, src[i:i + blk], zi=zi)
        howl += y * amp
    out += howl * g ** 1.5
    # high whistle in strong gusts
    wh = bp(np.random.default_rng(seed + 5).standard_normal(n), 2800, 3400, 2) * np.clip(gust - 0.6, 0, 1) * 2.0
    out += wh * 0.4
    return out * intensity


def spindrift_hiss(n, intensity, seed=3):
    x = bp(np.random.default_rng(seed).standard_normal(n), 2200, 7500, 2) * 0.35
    g = smooth_noise(n, 1.4, seed + 1)
    return x * (0.3 + 0.7 * g ** 2) * intensity


def crunch_step(seed, dur=0.28, bright=1.0, amp=1.0):
    """Crampon step in snow: dense granular crackle with a soft thud."""
    r = np.random.default_rng(seed)
    n = int(dur * SR)
    out = np.zeros(n)
    ngr = r.integers(45, 90)
    for _ in range(ngr):
        t = int(abs(r.normal(0.05, 0.05)) * SR) % n
        L = r.integers(20, 160)
        g = r.standard_normal(L) * np.exp(-np.arange(L) / (L / 4)) * r.uniform(0.2, 1.0)
        out[t:t + L] += g[:max(0, min(L, n - t))]
    out = bp(out, 900, 7000 * bright, 2)
    thud = lp(r.standard_normal(n), 220, 2) * np.exp(-np.arange(n) / (0.03 * SR)) * 1.5
    # crampon points: two quick metallic ticks
    for k in range(2):
        t = int((0.008 + 0.012 * k) * SR)
        L = int(0.01 * SR)
        f = r.uniform(3800, 5200)
        tick = np.sin(2 * np.pi * f * np.arange(L) / SR) * np.exp(-np.arange(L) / (0.002 * SR)) * 0.35
        out[t:t + L] += tick
    out += thud
    return out * amp / (np.abs(out).max() + 1e-9)


def metal_clink(seed, amp=1.0, dur=0.35):
    """Carabiner/ascender: inharmonic partials with fast decay."""
    r = np.random.default_rng(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    f0 = r.uniform(1900, 2600)
    y = np.zeros(n)
    for ratio, a, d in ((1.0, 1.0, 0.06), (2.76, 0.6, 0.035), (5.40, 0.35, 0.02), (8.93, 0.2, 0.012)):
        y += a * np.sin(2 * np.pi * f0 * ratio * t + r.uniform(0, 6)) * np.exp(-t / d)
    click = r.standard_normal(n) * np.exp(-t / 0.002) * 0.6
    return (y + hp(click, 2000)) * amp / 2.0


def ascender_ratchet(seed, amp=1.0):
    """Jumar sliding up the rope: zipper of tiny clicks + rope friction."""
    r = np.random.default_rng(seed)
    n = int(0.42 * SR)
    y = np.zeros(n)
    pos = 0
    while pos < n - 400:
        L = 200
        y[pos:pos + L] += r.standard_normal(L) * np.exp(-np.arange(L) / 30.0)
        pos += int(r.uniform(0.012, 0.022) * SR)
    y = bp(y, 1800, 8000)
    fr = bp(r.standard_normal(n), 400, 2500) * np.hanning(n) * 0.35
    out = y * 0.8 + fr
    return out * amp / (np.abs(out).max() + 1e-9)


def breath(seed, inhale=0.75, exhale=0.95, amp=1.0, effort=1.0):
    """Heavy breathing at altitude: formant-shaped noise, inhale brighter, exhale breathy."""
    r = np.random.default_rng(seed)
    out = []
    for dur, form, br in ((inhale, (1100, 2600), 1.0), (exhale, (700, 1800), 0.8)):
        n = int(dur * SR)
        src = r.standard_normal(n)
        y = bp(src, form[0] * 0.6, form[1] * 1.4, 2) * 0.7 + bp(src, 300, 900, 2) * 0.3
        e = np.sin(np.linspace(0, np.pi, n)) ** (1.2 if dur == inhale else 0.8)
        out.append(y * e * br)
    y = np.concatenate([out[0], np.zeros(int(0.05 * SR)), out[1]])
    y = lp(y, 4200, 2)
    return y * amp * effort / (np.abs(y).max() + 1e-9)


def tent_flap(n, intensity, seed=9):
    """Nylon fly sheet in strong wind: irregular flutter bursts."""
    r = np.random.default_rng(seed)
    y = np.zeros(n)
    t = 0
    while t < n:
        burst = int(r.uniform(0.05, 0.25) * SR)
        rate = r.uniform(14, 30)
        L = min(burst, n - t)
        tt = np.arange(L) / SR
        flutter = (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * rate * tt))) * np.exp(-tt / 0.2)
        y[t:t + L] += bp(r.standard_normal(L), 150, 2500) * flutter * r.uniform(0.3, 1.0)
        t += burst + int(r.uniform(0.05, 0.6) * SR)
    return y * intensity


def ice_creak(seed, dur=1.6, amp=1.0):
    """Low, slow groan of a stressed ice mass (no collapse): FM tone with friction texture."""
    r = np.random.default_rng(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 70 + 25 * np.sin(2 * np.pi * 0.7 * t) + 8 * smooth_noise(n, 6, seed)
    ph = 2 * np.pi * np.cumsum(f) / SR
    stick = (smooth_noise(n, 40, seed + 1) > 0.55).astype(float)
    y = np.sin(ph) * 0.6 + np.sin(2.01 * ph) * 0.3 + bp(r.standard_normal(n), 120, 900) * stick * 0.5
    e = np.sin(np.linspace(0, np.pi, n)) ** 0.6
    return lp(y * e, 1200) * amp / 1.2


def headlamp_click(seed):
    return metal_clink(seed, amp=0.25, dur=0.05)


# --------------------------------------------------------------------------------------------
class Bus:
    def __init__(self):
        self.L = np.zeros((int((DUR + 2) * SR), 2))

    def add(self, t, y, gain=1.0, pan=0.0):
        if y.ndim == 1:
            p = (pan + 1) * np.pi / 4
            y = np.stack([y * np.cos(p), y * np.sin(p)], 1) * 1.414
        i = int(t * SR)
        n = min(len(y), len(self.L) - i)
        if n > 0:
            self.L[i:i + n] += y[:n] * gain


def steps(bus, t0, t1, period, seed, amp, pan, bright=1.0, jitter=0.08, double=True):
    r = np.random.default_rng(seed)
    t = t0
    k = 0
    while t < t1:
        bus.add(t, crunch_step(seed * 100 + k, bright=bright, amp=amp * r.uniform(0.7, 1.0)), pan=pan)
        if double:
            bus.add(t + 0.12, crunch_step(seed * 100 + k + 50, dur=0.18, bright=bright,
                                          amp=amp * 0.45 * r.uniform(0.6, 1.0)), pan=pan)
        t += period * r.uniform(1 - jitter, 1 + jitter)
        k += 1


def build():
    n = int((DUR + 2) * SR)
    bus = Bus()
    # wind beds per section: (t0, t1, intensity, low rumble)
    wind_env = [(0.0, 0.10), (6.6, 0.12), (13.2, 0.16), (19.0, 0.2), (26.0, 0.24), (27.0, 0.42), (32.5, 0.5),
                (33.0, 0.30), (38.8, 0.36), (44.0, 0.42), (44.4, 0.30), (48.2, 0.34), (51.2, 0.30), (55.5, 0.12),
                (56.0, 0.0)]
    w = wind_bed(n, 1.0, seed=7)
    e = env_points(n, wind_env)
    bus.add(0, stereo(w * e, 0.7))
    w2 = wind_bed(n, 1.0, seed=17, low=False)
    bus.add(0, stereo(w2 * e * 0.6, 0.7)[:, ::-1])
    sp_env = [(0, 0.0), (26.5, 0.0), (27.0, 0.25), (33.0, 0.3), (38.8, 0.22), (44.4, 0.25), (51.2, 0.2), (56, 0)]
    bus.add(0, stereo(spindrift_hiss(n, 1.0) * env_points(n, sp_env), 0.8))
    # base camp: distant prayer-flag flutter, a far metallic clank of camp life
    flags = tent_flap(int(6.6 * SR), 0.10, seed=21)
    bus.add(0.0, lp(flags, 2000), pan=-0.5)
    bus.add(2.4, metal_clink(31, amp=0.05), pan=0.4)
    # chimney: rock & metal, ascender ratchets, breathing close
    for k, t in enumerate((13.6, 15.2, 16.9, 18.4)):
        bus.add(t, ascender_ratchet(40 + k, amp=0.22), pan=-0.1)
        bus.add(t + 0.45, metal_clink(50 + k, amp=0.10), pan=0.1)
    for k, t in enumerate(np.arange(13.4, 19.0, 1.9)):
        bus.add(t, breath(60 + k, amp=0.10, effort=1.0), pan=0.05)
    # black pyramid: crampons on rock and ice (brighter, scrapier), rope sounds
    steps(bus, 19.3, 26.8, 1.5, seed=7, amp=0.16, pan=0.15, bright=1.15)
    for k, t in enumerate((20.4, 22.9, 25.3)):
        bus.add(t, ascender_ratchet(70 + k, amp=0.15), pan=0.2)
    # shoulder: tents flapping hard, wind roar, footsteps in deep snow
    bus.add(27.0, tent_flap(int(6.0 * SR), 0.33, seed=81), pan=-0.35)
    bus.add(27.0, tent_flap(int(6.0 * SR), 0.22, seed=82), pan=0.4)
    steps(bus, 27.3, 32.8, 1.25, seed=9, amp=0.15, pan=-0.1, bright=0.8)
    # bottleneck (night): breathing in the foreground, crampons, headlamp-lit creak of the serac
    for k, t in enumerate(np.arange(33.2, 44.2, 1.75)):
        bus.add(t, breath(90 + k, inhale=0.7, exhale=0.85, amp=0.16, effort=1.1), pan=-0.05)
    steps(bus, 33.4, 44.2, 1.7, seed=11, amp=0.17, pan=0.1, bright=1.0)
    bus.add(35.6, ice_creak(5, dur=2.0, amp=0.12), pan=0.3)
    bus.add(40.2, ice_creak(6, dur=1.6, amp=0.10), pan=-0.25)
    for k, t in enumerate((34.3, 36.6, 39.4, 41.8)):
        bus.add(t, metal_clink(110 + k, amp=0.10), pan=0.25 * (-1) ** k)
    # ridge & summit
    steps(bus, 44.6, 48.2, 1.2, seed=13, amp=0.17, pan=0.1, bright=0.9)
    for k, t in enumerate((45.0, 46.6)):
        bus.add(t, breath(130 + k, amp=0.12), pan=0.0)
    bus.add(48.6, breath(140, inhale=1.0, exhale=1.4, amp=0.14, effort=0.9), pan=0.0)   # the long exhale at the top
    # pullback: wind takes over, one last step -> the descent begins
    steps(bus, 52.9, 54.6, 1.3, seed=15, amp=0.08, pan=0.0, bright=0.85)
    out = bus.L[:int(DUR * SR)]
    out = hp(out.T, 25, 2).T
    out = lp(out.T, 9000, 2).T * 0.75 + out * 0.25   # tame the top end
    return out.astype(np.float32)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    y = build()
    y = y / (np.abs(y).max() + 1e-9) * 0.7
    sf.write(f'{OUT}/sfx.wav', y, SR, subtype='PCM_24')
    print('sfx', y.shape)
