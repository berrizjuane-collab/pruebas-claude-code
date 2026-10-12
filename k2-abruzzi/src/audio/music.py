"""Original score for 'K2 - Espolón de los Abruzos' (≈56 s), rendered from CC0 orchestral samples.

Arc (D minor): contained, airy opening on a low D pedal -> the route theme (i-VI-III-VII) as the
line draws itself -> a spiccato pulse enters at House's Chimney -> horns and timpani on the Black
Pyramid -> a held breath at the Shoulder, a dull timpani stroke on "el tramo decisivo" -> night:
chromatic ostinato, tremolo cluster, heartbeat timpani in the Bottleneck -> crescendo across the
traverse, cut to a hush on "Superado el corredor" -> rising Bb-C-D to a D-major climax on the
summit -> recedes to an open fifth that never resolves: there is still the way down.
"""
import os
import sys

import numpy as np
import soundfile as sf
from scipy.signal import fftconvolve, butter, sosfilt, resample_poly

sys.path.insert(0, os.path.dirname(__file__))
from sampler import Instrument, OneShot, Track, hall_ir, midi as M, SR  # noqa: E402

OUT = '/home/user/k2data/audio'
DUR = 56.0


def build_instruments():
    I = {}
    I['vln'] = Instrument('Strings/Violin Section/susVib/*.wav', pan=-0.45, gain=0.85, release=1.2)
    I['vln_trem'] = Instrument('Strings/Violin Section/Trem/*.wav', pan=-0.35, gain=0.6, release=1.0)
    I['vla'] = Instrument('Strings/Viola Section/susvib/*.wav', pan=-0.08, gain=0.8, release=1.2)
    I['vla_trem'] = Instrument('Strings/Viola Section/trem/*.wav', pan=-0.1, gain=0.55, release=0.9)
    I['vlc'] = Instrument('Strings/Cello Section/susvib/*.wav', pan=0.28, gain=0.9, release=1.2)
    I['vlc_spic'] = Instrument('Strings/Cello Section/spic/*.wav', pan=0.3, gain=0.75, release=0.18)
    I['vla_spic'] = Instrument('Strings/Viola Section/*spic*/*.wav', pan=-0.05, gain=0.55, release=0.15)
    I['cb'] = Instrument('Strings/Solo Contrabass/SusVib/*.wav', pan=0.45, gain=0.9, release=1.3)
    I['cb_spic'] = Instrument('Strings/Solo Contrabass/Spic/*.wav', pan=0.45, gain=0.7, release=0.2)
    I['hn'] = Instrument('Brass/F Horn/sus/*.wav', pan=-0.25, gain=0.7, release=1.0)
    I['tbn'] = Instrument('Brass/Tenor Trombone/sus/*.wav', pan=0.18, gain=0.55, release=1.0)
    I['tuba'] = Instrument('Brass/Tuba/sus/*.wav', pan=0.32, gain=0.55, release=1.0)
    I['harp'] = Instrument('Strings/Harp/*.wav', octave_offset=0, pan=-0.55, gain=0.55, release=3.0)
    I['timp'] = OneShot([f'Percussion/Timpani/Timpani{k}_Hit_v{v}_rr1_Sum.wav' for k in (1, 2, 3, 4, 5)
                         for v in (1, 3, 4) if not (k == 1 and v == 4)], gain=0.9, pan=0.05)
    I['roll'] = OneShot([f'Percussion/Timpani/Rolls/Timpani{k}_Roll_v{v}_rr1_Sum.wav'
                         for k, v in ((3, 3), (3, 5), (2, 3), (2, 5), (5, 3), (5, 4))], gain=0.7, pan=0.05)
    I['bd'] = OneShot(['VSCO 1 Percussion/drums/bass/bdrum_ff_1.wav', 'VSCO 1 Percussion/drums/bass/bdrum_mp_1.wav',
                       'VSCO 1 Percussion/drums/bass/bdrum_fff_1.wav', 'VSCO 1 Percussion/drums/bass/bdrum_pp_1.wav'],
                      gain=0.8, pan=0.0)
    I['cym'] = OneShot(['Percussion/susCymb1-cresc-Long_v1.wav', 'Percussion/susCymb1-cresc-Median_v1.wav',
                        'Percussion/susCymb1-hit_fff_rr1.wav', 'Percussion/susCymb1-hit_mp_rr1.wav'],
                       gain=0.45, pan=-0.1)
    return I


# timpani drum pitches (measured): 1 F#1, 2 A#1, 3 C#2, 4 E2, 5 F#2 -> pick drum & repitch
TIMP_HZ = [45.7, 59.9, 70.5, 81.9, 93.0]


def timp(I, tr, t, note, vel=0.7, dur=None):
    hz = 440.0 * 2 ** ((M(note) - 69) / 12)
    k = int(np.argmin([abs(np.log2(hz / h)) for h in TIMP_HZ]))
    semis = 12 * np.log2(hz / TIMP_HZ[k])
    vi = 0 if vel < 0.45 else (1 if vel < 0.8 else 2)
    idx = {0: [0, 1], 1: [2, 3, 4], 2: [5, 6, 7], 3: [8, 9, 10], 4: [11, 12, 13]}[k]
    tr.add(t, I['timp'].hit(idx[min(vi, len(idx) - 1)], vel=vel, semis=semis, dur=dur))


def roll(I, tr, t, note, dur, v0=0.2, v1=1.0, loud=True):
    hz = 440.0 * 2 ** ((M(note) - 69) / 12)
    drums = {3: 70.5, 2: 59.9, 5: 93.0}
    base = min(drums, key=lambda d: abs(np.log2(hz / drums[d])))
    idx = {3: 1 if loud else 0, 2: 3 if loud else 2, 5: 5 if loud else 4}[base]
    y = I['roll'].hit(idx, vel=1.0, semis=12 * np.log2(hz / drums[base]), dur=dur, fade=0.08)
    env = np.linspace(v0, v1, len(y)) ** 1.6
    tr.add(t, y * env[:, None])


def chord(I, tr, inst, t, notes, dur, vel, swell=None, rr=0):
    for k, n in enumerate(notes):
        tr.add(t, I[inst].note(M(n), dur, vel, swell=swell, rr=rr + k))


def sw(points):
    """swell envelope from [(t, gain), ...] relative to note start."""
    t, g = zip(*points)
    return (np.array(t), np.array(g))


def compose(I):
    T = {k: Track(DUR) for k in ('str', 'pulse', 'brass', 'perc', 'harp')}
    S, P, B, X, H = T['str'], T['pulse'], T['brass'], T['perc'], T['harp']

    # ---------------- 0.0-6.6  Base Camp: air and a low D --------------------------------------
    chord(I, S, 'cb', 0.0, ['D2'], 7.2, 0.5, swell=sw([(0, 0), (2.6, 1), (7.2, 0.9)]))
    chord(I, S, 'vlc', 0.2, ['D3', 'A3'], 7.0, 0.48, swell=sw([(0, 0), (2.8, 0.85), (7.0, 0.8)]))
    chord(I, S, 'vln', 1.0, ['A4', 'D5'], 6.0, 0.42, swell=sw([(0, 0), (3.0, 0.55), (6.0, 0.6)]))
    for k, n in enumerate(['D4', 'A4', 'D5', 'F5', 'A5']):
        H.add(0.7 + 0.21 * k, I['harp'].note(M(n), 2.0, 0.45))
    for k, n in enumerate(['Bb3', 'F4', 'A4', 'D5', 'E5']):
        H.add(3.6 + 0.24 * k, I['harp'].note(M(n), 2.0, 0.4))

    # ---------------- 6.6-13.2  The Spur: route theme i-VI-III-VII -----------------------------
    prog = [(6.6, ['D2'], ['D3', 'A3'], ['F4', 'A4'], ['D5']),
            (8.25, ['Bb1'], ['Bb2', 'F3'], ['D4', 'F4'], ['D5']),
            (9.9, ['F2'], ['F3', 'C4'], ['C4', 'A4'], ['F5']),
            (11.55, ['C2'], ['C3', 'G3'], ['E4', 'G4'], ['E5'])]
    for t, bass, low, mid, top in prog:
        d = 1.9
        chord(I, S, 'cb', t, [n.replace('Bb1', 'Bb1') for n in bass], d, 0.45, swell=sw([(0, 0.5), (0.8, 1), (d, 0.85)]))
        chord(I, S, 'vlc', t, low, d, 0.5, swell=sw([(0, 0.4), (0.9, 1), (d, 0.8)]))
        chord(I, S, 'vla', t, mid, d, 0.45, swell=sw([(0, 0.3), (0.9, 0.9), (d, 0.75)]))
        chord(I, S, 'vln', t, top, d, 0.45, swell=sw([(0, 0.25), (1.0, 0.85), (d, 0.7)]))
    chord(I, B, 'hn', 6.8, ['D4'], 3.2, 0.3, swell=sw([(0, 0), (1.5, 0.6), (3.2, 0.4)]))
    chord(I, B, 'hn', 9.9, ['C4'], 3.2, 0.3, swell=sw([(0, 0), (1.5, 0.6), (3.2, 0.4)]))
    arps = [(6.7, ['D4', 'F4', 'A4', 'D5']), (8.35, ['Bb3', 'D4', 'F4', 'Bb4']), (10.0, ['F3', 'A3', 'C4', 'F4']),
            (11.65, ['C4', 'E4', 'G4', 'C5'])]
    for t, ns in arps:
        for k, n in enumerate(ns):
            H.add(t + 0.17 * k, I['harp'].note(M(n), 1.6, 0.45))

    # ---------------- 13.2-19.0  House's Chimney: the pulse begins -----------------------------
    pulse_pat = ['D3', 'D3', 'A2', 'D3', 'D3', 'D3', 'F3', 'E3']
    t = 13.2
    k = 0
    while t < 19.0:
        n = pulse_pat[k % len(pulse_pat)]
        acc = 0.85 if k % 4 == 0 else 0.6
        P.add(t, I['vlc_spic'].note(M(n), 0.22, acc, rr=k))
        if k % 4 == 0:
            P.add(t, I['cb_spic'].note(M(n) - 12, 0.22, 0.7, rr=k))
        t += 0.25
        k += 1
    chord(I, S, 'cb', 13.2, ['D2'], 5.9, 0.55)
    chord(I, S, 'vla', 13.2, ['F3', 'A3'], 2.5, 0.55, swell=sw([(0, 0.4), (1.2, 0.8), (2.5, 0.7)]))
    chord(I, S, 'vla', 15.7, ['G3', 'Bb3'], 1.8, 0.6, swell=sw([(0, 0.6), (1.0, 0.85), (1.8, 0.8)]))
    chord(I, S, 'vla', 17.5, ['F3', 'Bb3'], 1.6, 0.62, swell=sw([(0, 0.6), (1.0, 0.9), (1.6, 0.9)]))
    chord(I, S, 'vln_trem', 15.5, ['A4'], 3.6, 0.5, swell=sw([(0, 0.2), (3.6, 0.9)]))

    # ---------------- 19.0-27.0  Black Pyramid: horns, timpani, rising harmony -----------------
    pat2 = ['D3', 'F3', 'E3', 'D3', 'D3', 'A2', 'C3', 'D3']
    t = 19.0
    k = 0
    while t < 27.0:
        n = pat2[k % len(pat2)]
        if t >= 23.0:
            n = {'D3': 'D3', 'F3': 'F3', 'E3': 'E3', 'A2': 'A2', 'C3': 'C#3'}[n]
        acc = 0.65 if k % 4 == 0 else 0.42
        P.add(t, I['vlc_spic'].note(M(n), 0.22, acc, rr=k))
        if t >= 21.0:
            P.add(t, I['vla_spic'].note(M(n) + 12, 0.2, acc * 0.8, rr=k + 3))
        t += 0.25
        k += 1
    harm = [(19.0, ['D2'], ['D3', 'A3'], ['F4', 'A4']), (21.0, ['G1'], ['G2', 'D3'], ['G4', 'Bb4']),
            (23.0, ['Bb1'], ['Bb2', 'F3'], ['F4', 'D5']), (25.0, ['A1'], ['A2', 'E3'], ['E4', 'C#5'])]
    for t, bass, low, top in harm:
        chord(I, S, 'cb', t, bass, 2.1, 0.55)
        chord(I, S, 'vlc', t, low, 2.1, 0.55, swell=sw([(0, 0.6), (1.0, 1), (2.1, 0.9)]))
        chord(I, S, 'vln_trem', t, top, 2.1, 0.45 + 0.05 * (t - 19) / 2, swell=sw([(0, 0.5), (2.1, 1)]))
    motif = [(19.2, 'D4', 1.8), (21.0, 'F4', 1.8), (23.0, 'E4', 1.0), (24.0, 'D4', 1.0), (25.0, 'A3', 2.2)]
    for t, n, d in motif:
        chord(I, B, 'hn', t, [n], d, 0.62, swell=sw([(0, 0.6), (0.4, 1), (d, 0.85)]))
    chord(I, B, 'tbn', 23.0, ['D3'], 2.0, 0.5)
    chord(I, B, 'tbn', 25.0, ['A2'], 2.2, 0.55)
    for t in (19.0, 21.0, 23.0, 25.0):
        timp(I, X, t, 'D2' if t != 25.0 else 'A1', vel=0.55)
    roll(I, X, 25.6, 'A1', 1.35, 0.1, 0.8)

    # ---------------- 27.0-33.0  The Shoulder: a held breath at dusk ----------------------------
    timp(I, X, 27.0, 'D2', vel=0.5)
    chord(I, S, 'cb', 27.0, ['A1'], 4.8, 0.6, swell=sw([(0, 0.8), (4.8, 0.5)]))
    chord(I, S, 'vln_trem', 27.1, ['D5', 'A5'], 4.6, 0.5, swell=sw([(0, 0.4), (2.0, 0.8), (4.6, 0.55)]))
    chord(I, S, 'vla', 27.2, ['E4', 'A4'], 4.4, 0.55, swell=sw([(0, 0.3), (2.0, 0.7), (4.4, 0.4)]))
    for k, n in enumerate(['D6', 'C6', 'A5', 'F5', 'E5', 'D5']):
        H.add(27.6 + 0.42 * k, I['harp'].note(M(n), 2.4, 0.35))
    # "...comienza el tramo decisivo": a dull, low stroke
    timp(I, X, 31.85, 'D2', vel=0.95)
    X.add(31.85, I['bd'].hit(0, vel=0.85))
    chord(I, S, 'cb', 31.85, ['D2'], 1.2, 0.8, swell=sw([(0, 1), (1.2, 0.2)]))

    # ---------------- 33.0-38.8  Bottleneck at night: tension ---------------------------------
    pat3 = ['D3', 'D#3', 'D3', 'C#3']
    t = 33.0
    k = 0
    while t < 42.85:
        n = pat3[k % 4]
        prog_ = min(1.0, (t - 33.0) / 9.8)
        acc = (0.75 if k % 4 == 0 else 0.55) + 0.25 * prog_
        P.add(t, I['vlc_spic'].note(M(n), 0.2, acc, rr=k))
        P.add(t, I['cb_spic'].note(M(n) - 12, 0.2, acc * 0.8, rr=k + 1))
        if t > 38.8:
            P.add(t, I['vla_spic'].note(M(n) + 12, 0.18, acc * 0.85, rr=k + 2))
        t += 0.25 if t < 38.8 else 0.1875
        k += 1
    chord(I, S, 'vln_trem', 33.2, ['A5', 'Bb5'], 5.8, 0.6, swell=sw([(0, 0.35), (5.8, 0.9)]))
    chord(I, B, 'tbn', 33.0, ['D2'], 5.8, 0.6, swell=sw([(0, 0.5), (5.8, 0.9)]))
    chord(I, B, 'tuba', 33.0, ['D1'], 5.8, 0.55, swell=sw([(0, 0.5), (5.8, 0.85)]))
    hb = 33.5
    while hb < 38.6:                   # heartbeat
        timp(I, X, hb, 'D2', vel=0.75, dur=0.6)
        timp(I, X, hb + 0.28, 'D2', vel=0.55, dur=0.5)
        hb += 1.15

    # ---------------- 38.8-44.4  Traverse: crescendo, then the hush --------------------------
    chord(I, S, 'vln_trem', 38.8, ['Bb5', 'B5'], 2.0, 0.75, swell=sw([(0, 0.6), (2.0, 0.8)]))
    chord(I, S, 'vln_trem', 40.8, ['B5', 'C6'], 2.05, 0.9, swell=sw([(0, 0.7), (2.05, 1.0)]))
    chord(I, S, 'vla_trem', 38.8, ['D4', 'Eb4'], 4.05, 0.6, swell=sw([(0, 0.5), (4.05, 1.0)]))
    chord(I, S, 'vlc', 38.8, ['D3', 'A3'], 4.05, 0.65, swell=sw([(0, 0.6), (4.05, 1.0)]))
    chord(I, B, 'hn', 39.4, ['D4', 'D5'], 1.4, 0.75)
    chord(I, B, 'hn', 41.0, ['Eb4', 'Eb5'], 1.8, 0.85)
    chord(I, B, 'tbn', 39.0, ['D3', 'A2'], 3.85, 0.7, swell=sw([(0, 0.5), (3.85, 1)]))
    chord(I, B, 'tuba', 39.0, ['D2'], 3.85, 0.65, swell=sw([(0, 0.5), (3.85, 1)]))
    roll(I, X, 40.4, 'D2', 2.45, 0.1, 1.0)
    X.add(41.2, I['cym'].hit(1, vel=0.8, dur=1.65, fade=0.05))
    timp(I, X, 42.85, 'D2', vel=1.0)
    X.add(42.85, I['bd'].hit(2, vel=1.0))
    # the hush: "Superado el corredor y su travesía"
    chord(I, S, 'vla', 43.0, ['F3', 'D4'], 1.5, 0.3, swell=sw([(0, 0), (0.6, 0.6), (1.5, 0.6)]))
    chord(I, S, 'vlc', 43.0, ['Bb2'], 1.5, 0.3, swell=sw([(0, 0), (0.6, 0.6), (1.5, 0.6)]))

    # ---------------- 44.4-48.2  The final ridge: rising Bb-C-Dsus-D --------------------------
    rise = [(44.3, ['Bb1'], ['Bb2', 'F3'], ['D4', 'F4'], 'F5', 1.2),
            (45.5, ['C2'], ['C3', 'G3'], ['E4', 'G4'], 'G5', 1.2),
            (46.7, ['D2'], ['D3', 'A3'], ['G4', 'A4'], 'A5', 1.5)]
    for t, bass, low, mid, top, d in rise:
        v = 0.55 + 0.1 * (t - 44.3)
        chord(I, S, 'cb', t, bass, d + 0.1, v)
        chord(I, S, 'vlc', t, low, d + 0.1, v, swell=sw([(0, 0.6), (d, 1)]))
        chord(I, S, 'vla', t, mid, d + 0.1, v, swell=sw([(0, 0.6), (d, 1)]))
        chord(I, S, 'vln', t, [top], d + 0.1, v, swell=sw([(0, 0.6), (d, 1)]))
    chord(I, B, 'hn', 46.7, ['A3', 'D4'], 1.5, 0.7, swell=sw([(0, 0.6), (1.5, 1)]))
    roll(I, X, 46.6, 'A1', 1.6, 0.1, 1.0)
    X.add(46.7, I['cym'].hit(1, vel=0.7, dur=1.5, fade=0.05))

    # ---------------- 48.2-51.2  Summit: D major ------------------------------------------------
    t = 48.2
    chord(I, S, 'cb', t, ['D2'], 3.4, 0.9, swell=sw([(0, 1), (3.4, 0.55)]))
    chord(I, S, 'vlc', t, ['D3', 'A3'], 3.4, 0.9, swell=sw([(0, 1), (3.4, 0.55)]))
    chord(I, S, 'vla', t, ['F#4', 'A4'], 3.4, 0.85, swell=sw([(0, 1), (3.4, 0.55)]))
    chord(I, S, 'vln', t, ['D5', 'F#5', 'A5'], 3.4, 0.85, swell=sw([(0, 1), (3.4, 0.6)]))
    chord(I, B, 'hn', t, ['A4', 'D5'], 1.3, 0.95)
    chord(I, B, 'hn', t + 1.3, ['F#4', 'A4'], 2.0, 0.85, swell=sw([(0, 1), (2.0, 0.5)]))
    chord(I, B, 'tbn', t, ['D3', 'F#3', 'A3'], 3.0, 0.85, swell=sw([(0, 1), (3.0, 0.4)]))
    chord(I, B, 'tuba', t, ['D2'], 3.0, 0.85, swell=sw([(0, 1), (3.0, 0.4)]))
    timp(I, X, t, 'D2', vel=1.0)
    X.add(t, I['bd'].hit(2, vel=0.9))
    X.add(t, I['cym'].hit(2, vel=0.75))
    for k, n in enumerate(['D4', 'F#4', 'A4', 'D5', 'F#5', 'A5', 'D6']):
        H.add(t + 0.06 * k, I['harp'].note(M(n), 2.5, 0.6))

    # ---------------- 51.2-56.0  Pull back: bittersweet, unresolved -------------------------------
    chord(I, S, 'vlc', 51.3, ['Bb2', 'F3'], 2.2, 0.6, swell=sw([(0, 0.2), (0.8, 0.7), (2.2, 0.6)]))
    chord(I, S, 'vla', 51.3, ['D4', 'F4'], 2.2, 0.55, swell=sw([(0, 0.2), (0.8, 0.7), (2.2, 0.6)]))
    chord(I, S, 'vln', 51.3, ['D5'], 2.2, 0.55, swell=sw([(0, 0.2), (0.8, 0.7), (2.2, 0.6)]))
    chord(I, S, 'cb', 51.3, ['Bb1'], 2.2, 0.4)
    # open fifth, no third: neither triumph nor defeat
    chord(I, S, 'cb', 53.4, ['D2'], 2.6, 0.55, swell=sw([(0, 0.3), (1.0, 0.7), (2.6, 0.0)]), )
    chord(I, S, 'vlc', 53.4, ['D3', 'A3'], 2.6, 0.55, swell=sw([(0, 0.3), (1.0, 0.7), (2.6, 0.0)]))
    chord(I, S, 'vln', 53.4, ['A5'], 2.6, 0.5, swell=sw([(0, 0.3), (1.0, 0.6), (2.6, 0.0)]))
    chord(I, B, 'hn', 53.6, ['A3'], 2.2, 0.3, swell=sw([(0, 0), (1.0, 0.5), (2.2, 0.0)]))
    H.add(54.2, I['harp'].note(M('D5'), 2.0, 0.35))
    H.add(54.9, I['harp'].note(M('A4'), 2.0, 0.3))
    return T


def mix(T):
    ir = hall_ir(3.6)
    sends = {'str': 0.38, 'pulse': 0.22, 'brass': 0.42, 'perc': 0.3, 'harp': 0.45}
    gains = {'str': 1.0, 'pulse': 1.25, 'brass': 0.9, 'perc': 1.0, 'harp': 0.75}
    dry = np.zeros_like(T['str'].buf)
    wet_in = np.zeros_like(T['str'].buf)
    for k, tr in T.items():
        y = tr.buf * gains[k]
        dry += y
        wet_in += y * sends[k]
    wet = np.stack([fftconvolve(wet_in[:, c], ir[:, c])[:len(wet_in)] for c in range(2)], 1)
    out = dry * 0.85 + wet * 0.9
    # gentle high-pass and a touch of air
    out = sosfilt(butter(2, 32, 'high', fs=SR, output='sos'), out, axis=0)
    out = out[:int(DUR * SR) + SR * 2]
    # fade tail
    n_end = int(DUR * SR)
    fade = np.ones(len(out))
    fade[n_end - int(1.2 * SR):n_end] = np.linspace(1, 0, int(1.2 * SR)) ** 2
    fade[n_end:] = 0
    out *= fade[:, None]
    out = out[:n_end]
    peak = np.abs(out).max()
    out = out / peak * 0.89
    return out.astype(np.float32)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    I = build_instruments()
    T = compose(I)
    stems = {k: v.buf[:int(DUR * SR)] for k, v in T.items()}
    m = mix(T)
    m48 = resample_poly(m, 160, 147, axis=0).astype(np.float32)
    sf.write(f'{OUT}/music.wav', m48, 48000, subtype='PCM_24')
    print('music', m48.shape, np.abs(m48).max())
