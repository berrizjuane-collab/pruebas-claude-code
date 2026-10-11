"""Banda sonora completa: orquesta (score.py) + capas sinteticas + diseno sonoro, mezcla y
masterizacion a -14 LUFS integrados con pico verdadero <= -1 dBTP.

Uso: python -m src.audio.mix [--stems]   ->  data/work/audio/banda_sonora.wav (48 kHz, 24 bit)
"""
import json
import math
import os
import subprocess
import sys

import numpy as np
import soundfile as sf
from scipy import signal

from . import synth as S
from .score import BAR, BEAT, render_stems, tb

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "data", "work", "audio")
SR = S.SR
DUR = 180.0
N = int(DUR * SR)


def fr(f):
    """Fotograma (24 fps) -> segundos."""
    return f / 24.0


class Bus:
    def __init__(self, name):
        self.name = name
        self.x = np.zeros((N + SR * 8, 2), np.float32)

    def add(self, sig, t, gain=1.0):
        i = int(round(t * SR))
        if i < 0:
            sig = sig[-i:]
            i = 0
        j = min(i + len(sig), len(self.x))
        if j > i:
            self.x[i:j] += sig[:j - i] * gain


def db(v):
    return 10 ** (v / 20.0)


def load(path):
    x, sr = sf.read(path, dtype="float32", always_2d=True)
    assert sr == SR
    if x.shape[1] == 1:
        x = np.repeat(x, 2, 1)
    return x


def gain_curve(points):
    """Automatizacion de volumen: lista (segundo, dB)."""
    t = np.arange(len(Bus("x").x)) / SR
    return db(np.interp(t, [p[0] for p in points], [p[1] for p in points])).astype(np.float32)[:, None]


# ------------------------------------------------------------------------------------------
# musica
# ------------------------------------------------------------------------------------------
def music(stems):
    """Mezcla de la orquesta + capas sinteticas en buses con reverberacion propia."""
    hall = S.make_ir(rt60=3.4, predelay=0.03, damp=0.55, seed=11)
    room = S.make_ir(rt60=1.6, predelay=0.012, damp=0.4, seed=12)
    dry = Bus("dry")
    wet_hall = Bus("hall")
    lvl = {"cuerdas": (-2, 0.45), "graves": (-4, 0.40), "violines": (-2, 0.45), "ostinato": (-2, 0.30),
           "piano": (6, 0.38), "arpa": (0, 0.55), "celesta": (-2, 0.6), "trompas": (-3, 0.50),
           "coro": (-6, 0.55), "timbales": (-3, 0.35), "tremolo": (-6, 0.40), "contrabajos": (-4, 0.30)}
    for name, path in stems.items():
        x = load(path)
        g, send = lvl.get(name, (-6, 0.4))
        if name in ("graves", "contrabajos"):
            x = S.butter(x, "high", 32, 2).astype(np.float32)
        if name in ("violines", "cuerdas"):
            x = S.butter(x, "high", 60, 2).astype(np.float32)
        dry.add(x, 0.0, db(g))
        wet_hall.add(x, 0.0, db(g) * send)
    syn = Bus("synth")
    # dron grave (aire contenido) en la apertura y el mapa; vuelve en el K2 y en la firma
    d1 = S.drone(26.0, [26, 38], lambda t: np.interp(t, [0, 3, 7.4, 7.6, 12, 22, 26], [0, .35, .5, .9, .7, .5, 0]),
                 seed=1, bright=0.15)
    syn.add(d1, 0.0, db(-10))
    d2 = S.drone(22.0, [26, 33, 38], lambda t: np.interp(t, [0, 0.4, 9, 18, 22], [0, 1, .9, .7, 0]), seed=2, bright=0.25)
    syn.add(d2, 131.9, db(-9))
    d3 = S.drone(14.0, [38, 45, 50], lambda t: np.interp(t, [0, 2, 10, 14], [0, .8, .7, 0]), seed=3, bright=0.2)
    syn.add(d3, 166.0, db(-12))
    # cristal: aire de altura (apertura al coronar, Cho Oyu, firma)
    g1 = S.glass(10.0, [81, 86, 88], lambda t: np.interp(t, [0, 3, 8, 10], [0, 1, .8, 0]), seed=4)
    syn.add(g1, 4.0, db(-14))
    g2 = S.glass(9.0, [77, 81, 84, 88], lambda t: np.interp(t, [0, 2, 7, 9], [0, 1, .9, 0]), seed=5)
    syn.add(g2, tb(33), db(-16))
    g3 = S.glass(12.0, [74, 81, 86, 90], lambda t: np.interp(t, [0, 3, 9, 12], [0, 1, .8, 0]), seed=6)
    syn.add(g3, 168.0, db(-17))
    from .score import HARM, V
    for b in range(5, 57):
        if b in (44, 45, 46, 47):           # silencio antes del K2 y tension sin colchon
            continue
        bass, voices = V[HARM[b]]
        lvl_b = -21 if b < 27 else (-19 if b < 48 else -17)
        if 51 <= b <= 56:
            lvl_b = -18
        pad = S.drone(BAR + 1.2, [v - 12 for v in voices[:3]] + [voices[3]],
                      lambda t: np.clip(t / 0.9, 0, 1) * np.clip((BAR + 1.2 - t) / 1.1, 0, 1), seed=500 + b, bright=0.30)
        syn.add(pad, tb(b) - 0.1, db(lvl_b))
    wet_hall.add(syn.x[:len(syn.x)], 0.0, 0.35)
    perc = Bus("perc")
    # golpes graves: titulo, capitulo 1, K2, Everest, firma
    for t, g, kw in ((fr(180), -7, {}), (tb(9), -9, {"f_start": 80}), (tb(45), 1, {"drive": 2.2}),
                     (tb(48), 0, {"f_start": 110}), (tb(57), -8, {"f_start": 70, "drive": 1.2})):
        perc.add(S.boom(**kw), t, db(g - 4))
    # tambores de membrana: corte de cada capitulo (dosificado) y latido en la densidad
    for k in range(1, 15):
        b = 9 + (k - 1) * 3
        if k in (9, 13):          # Cho Oyu (respiro) y K2 (tiene su propio golpe)
            continue
        g = -13 if k < 7 else -9
        perc.add(S.membrane(f0=70 - k * 0.6, seed=100 + k), tb(b), db(g))
    for b in list(range(27, 33)) + list(range(36, 44)) + list(range(48, 51)):
        for beat in (1, 3) if b < 48 else (1, 2, 3, 4):
            if beat == 1 and (b - 9) % 3 == 0:
                continue
            perc.add(S.membrane(f0=64, slap=0.3, seed=1000 + b * 4 + beat), tb(b, beat), db(-16 if b < 36 else -13))
    # subidas hacia los golpes
    perc.add(S.reverse_cymbal(1.5, hall, seed=21), fr(180) - 1.5, db(-12))
    perc.add(S.riser(1.5, seed=22), fr(180) - 1.5, db(-14))
    perc.add(S.riser(3.0, seed=23, f0=300, f1=9000), tb(48) - 3.0, db(-10))
    perc.add(S.reverse_cymbal(2.0, hall, seed=24), tb(48) - 2.0, db(-6))
    perc.add(S.reverse_cymbal(1.2, hall, seed=25), tb(9) - 1.2, db(-14))
    perc.add(S.reverse_cymbal(1.5, hall, seed=26), tb(57) - 1.5, db(-14))
    wet_hall.add(perc.x, 0.0, 0.30)
    mus = dry.x + syn.x + perc.x
    wet = S.convolve(wet_hall.x, hall)[:len(mus)]
    mus = mus + wet * 0.9
    return mus


# ------------------------------------------------------------------------------------------
# diseno sonoro
# ------------------------------------------------------------------------------------------
def sfx():
    room = S.make_ir(rt60=0.5, predelay=0.004, damp=0.6, seed=30, early=True)
    mtn = S.make_ir(rt60=2.6, predelay=0.04, damp=0.7, seed=31)
    close = Bus("close")
    far = Bus("far")
    # --- apertura: detalle fisico (cerca, seco) ---
    close.add(S.crampon_step(seed=31, weight=1.0), 0.12, db(-13))
    click = np.zeros((int(0.05 * SR), 2), np.float32)
    n = len(click)
    tt = np.arange(n) / SR
    c = (np.sin(2 * np.pi * 2300 * tt) * np.exp(-tt / 0.0025) + 0.4 * np.random.default_rng(3).standard_normal(n)
         * np.exp(-tt / 0.0015))
    click[:, 0] = click[:, 1] = c * 0.3
    close.add(click, fr(5), db(-17))                                   # interruptor de la frontal
    close.add(S.breath("inhale", 0.85, seed=40, effort=1.0), 0.35, db(-15))
    close.add(S.breath("exhale", 1.5, seed=41, effort=1.1), fr(40), db(-14))
    close.add(S.snow_hiss(1.9, seed=42), fr(46), db(-19))
    close.add(S.crampon_step(seed=43, weight=0.8), 3.30, db(-15))
    close.add(S.breath("inhale", 0.8, seed=44, effort=0.8), 3.55, db(-20))
    # --- viento por tramos (intensidad 0..1 por segundo) ---
    wind_pts = [(0, .45), (1.9, .8), (3.6, .5), (4.0, .55), (7.0, .75), (11.0, .6), (12.4, .0), (23.5, 0.0),
                (24.5, .35), (33, .35), (42, .3), (60, .35), (66, .5), (78, .45), (96, .7), (100, .4),
                (123, .4), (131.0, .55), (131.9, .0), (132.0, .0), (132.4, .85), (140, .7), (141, .5),
                (150, .4), (150.6, 0.0), (157.5, 0.0), (159, .3), (170, .25), (176, .0), (180, .0)]
    I = lambda t: np.interp(t, [p[0] for p in wind_pts], [p[1] for p in wind_pts])
    w = S.wind(DUR, I, seed=50)
    gate = np.interp(np.arange(len(w)) / SR, [p[0] for p in wind_pts],
                     [min(1.0, p[1] * 4) for p in wind_pts]).astype(np.float32)[:, None]
    wg = np.interp(np.arange(len(w)) / SR, [0, 11.5, 12.4, 23.5, 24.5, 130.5, 131.9, 132.2, 140.5, 141.5, 157.5, 159, 175],
                   [-17, -14, -30, -30, -17, -16, -30, -30, -9, -15, -15, -14, -20]).astype(np.float32)
    far.add(w * gate * db(wg)[:, None], 0.0, 1.0)
    # --- transiciones ---
    def hop(b, big=False):
        dur_up = 1.5 if not big else 2.0
        far.add(S.whoosh(dur_up, seed=int(b * 3), f0=250, f1=3500, peak=0.85, low=0.6), b - dur_up, db(-10))
        far.add(S.whoosh(1.8 if not big else 2.4, seed=int(b * 3) + 1, f0=3000, f1=200, peak=0.12, low=0.8),
                b + 0.1, db(-11))
    for k, tr in {1: "hop", 4: "hop", 13: "grand_hop"}.items():
        hop(tb(9 + k * 3), big=(tr == "grand_hop"))
    far.add(S.whoosh(1.6, seed=71, f0=400, f1=1600, peak=0.5, low=0.4), tb(15) - 0.8, db(-13))    # nube
    far.add(S.whoosh(0.7, seed=72, f0=900, f1=5500, peak=0.55, low=0.2), tb(24) - 0.35, db(-9))   # latigazo
    far.add(S.whoosh(2.2, seed=73, f0=200, f1=900, peak=0.45, low=1.0), tb(27) - 1.1, db(-10))    # paso por nube
    far.add(S.snow_hiss(1.8, seed=74), tb(33) - 0.9, db(-8))                                      # ventisca
    far.add(S.whoosh(1.9, seed=75, f0=300, f1=1200, peak=0.6, low=0.3), tb(39) - 1.4, db(-15))    # panoramica
    far.add(S.whoosh(1.4, seed=76, f0=250, f1=3800, peak=0.9, low=0.5), fr(3566), db(-11))       # sube al mapa
    far.add(S.whoosh(1.6, seed=77, f0=3200, f1=220, peak=0.15, low=0.7), fr(3812), db(-12))      # baja al campo
    sig = S.convolve(close.x, room)[:len(close.x)] * 0.25 + close.x
    sig = sig + S.convolve(far.x, mtn)[:len(far.x)] * 0.35 + far.x
    return sig


# ------------------------------------------------------------------------------------------
# masterizacion
# ------------------------------------------------------------------------------------------
def compress(x, thresh_db=-18.0, ratio=2.0, attack=0.02, release=0.25):
    """Compresor de bus (detector RMS estereo enlazado)."""
    env = np.sqrt(signal.lfilter([1 - math.exp(-1 / (0.05 * SR))], [1, -math.exp(-1 / (0.05 * SR))],
                                 (x ** 2).mean(1)))
    lvl = 20 * np.log10(env + 1e-9)
    over = np.maximum(lvl - thresh_db, 0)
    gr = -over * (1 - 1 / ratio)
    a = math.exp(-1 / (attack * SR))
    r = math.exp(-1 / (release * SR))
    g = np.zeros_like(gr)
    cur = 0.0
    for i in range(0, len(gr), 64):
        target = gr[i:i + 64].min()
        coef = a if target < cur else r
        cur = target + (cur - target) * coef ** 64
        g[i:i + 64] = cur
    return x * db(g)[:, None]


def _release(g, r):
    import numba

    @numba.njit(cache=True)
    def run(g, r):
        out = np.empty_like(g)
        cur = 1.0
        for i in range(len(g)):
            v = g[i]
            cur = v if v < cur else v + (cur - v) * r
            out[i] = cur
        return out
    return run(g, r)


def true_peak_limit(x, ceiling_db=-1.5, lookahead=0.005, release=0.08):
    """Limitador de pico verdadero: detecta sobre senal sobremuestreada x4."""
    ceil = db(ceiling_db)
    up = signal.resample_poly(x, 4, 1, axis=0)
    pk = np.abs(up).max(1).reshape(-1, 4).max(1)[:len(x)]
    need = np.minimum(1.0, ceil / np.maximum(pk, 1e-9))
    la = int(lookahead * SR)
    # minimo hacia delante (anticipacion) y relajacion exponencial
    from scipy.ndimage import minimum_filter1d
    g = minimum_filter1d(need, size=2 * la + 1, origin=0)
    out = _release(g.astype(np.float64), math.exp(-1 / (release * SR)))
    out = signal.lfilter([1 / la] * la, [1], out)   # suavizado del cambio de ganancia
    out = np.minimum(out, minimum_filter1d(need, size=2 * la + 1))
    return x * out[:, None]


def master(mus, fx, target_lufs=-14.0):
    import pyloudnorm as pyln
    mix = mus * db(-1.0) + fx * db(-2.0)
    mix = mix[:N]
    mix = S.butter(mix, "high", 25, 2).astype(np.float32)
    mix = compress(mix, thresh_db=-20, ratio=1.8)
    meter = pyln.Meter(SR)
    loud = meter.integrated_loudness(mix)
    mix = mix * db(target_lufs - loud)
    mix = true_peak_limit(mix, ceiling_db=-1.6)
    loud2 = meter.integrated_loudness(mix)
    mix = mix * db(target_lufs - loud2)
    mix = true_peak_limit(mix, ceiling_db=-1.6)
    # fundido final (la pelicula termina en negro a los 180 s)
    t = np.arange(len(mix)) / SR
    mix = mix * np.clip((180.0 - t) / 0.8, 0, 1)[:, None]
    return mix.astype(np.float32)


def measure(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    lines = [l for l in r.stderr.splitlines() if "I:" in l or "Peak:" in l or "LRA:" in l]
    return "\n".join(lines[-4:])


def main():
    os.makedirs(OUT, exist_ok=True)
    stems = render_stems(os.path.join(OUT, "stems"))
    mus = music(stems)
    fx = sfx()
    n = min(len(mus), len(fx))
    mix = master(mus[:n], fx[:n])
    path = os.path.join(OUT, "banda_sonora.wav")
    sf.write(path, mix, SR, subtype="PCM_24")
    if "--stems" in sys.argv:
        sf.write(os.path.join(OUT, "musica.wav"), mus[:N], SR, subtype="FLOAT")
        sf.write(os.path.join(OUT, "efectos.wav"), fx[:N], SR, subtype="FLOAT")
    print(measure(path))


if __name__ == "__main__":
    main()
