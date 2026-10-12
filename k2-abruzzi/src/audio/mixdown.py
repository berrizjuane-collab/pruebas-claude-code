"""Voice-over processing, subtitle timing and the final mix (voice always on top).

voice: HPF -> de-mud -> presence -> de-esser -> 3:1 compressor -> line loudness match -> small room
music: sidechain-ducked under the voice (~7 dB), sfx ducked ~4 dB
master: -16 LUFS integrated, true-peak ceiling -1 dBTP (4x oversampled look-ahead limiter)
"""
import json
import os
import re
import sys

import numpy as np
import soundfile as sf
import pyloudnorm as pyln
from scipy.signal import butter, sosfilt, resample_poly, fftconvolve

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.dirname(__file__))
from timeline import LINE_START, DURATION  # noqa: E402
from narration import LINES  # noqa: E402

SR = 48000
A = '/home/user/k2data/audio'
OUTDIR = os.path.join(os.path.dirname(__file__), '..', '..', 'output')


def peq(x, f0, gain_db, q, sr=SR):
    """RBJ peaking EQ."""
    A_ = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / sr
    al = np.sin(w) / (2 * q)
    b = np.array([1 + al * A_, -2 * np.cos(w), 1 - al * A_])
    a = np.array([1 + al / A_, -2 * np.cos(w), 1 - al / A_])
    from scipy.signal import lfilter
    return lfilter(b / a[0], a / a[0], x, axis=0)


def shelf_hi(x, f0, gain_db, sr=SR):
    A_ = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / sr
    al = np.sin(w) / 2 * np.sqrt(2)
    c = np.cos(w)
    b = np.array([A_ * ((A_ + 1) + (A_ - 1) * c + 2 * np.sqrt(A_) * al), -2 * A_ * ((A_ - 1) + (A_ + 1) * c),
                  A_ * ((A_ + 1) + (A_ - 1) * c - 2 * np.sqrt(A_) * al)])
    a = np.array([(A_ + 1) - (A_ - 1) * c + 2 * np.sqrt(A_) * al, 2 * ((A_ - 1) - (A_ + 1) * c),
                  (A_ + 1) - (A_ - 1) * c - 2 * np.sqrt(A_) * al])
    from scipy.signal import lfilter
    return lfilter(b / a[0], a / a[0], x, axis=0)


import numba as nb


@nb.njit(cache=True)
def _follow(ax, a_a, a_r):
    e = np.zeros_like(ax)
    v = 0.0
    for i in range(len(ax)):
        s = ax[i]
        c = a_a if s > v else a_r
        v = c * v + (1 - c) * s
        e[i] = v
    return e


@nb.njit(cache=True)
def _release(g, a_r):
    out = np.empty_like(g)
    v = 1.0
    for i in range(len(g)):
        v = g[i] if g[i] < v else a_r * v + (1 - a_r) * g[i]
        out[i] = v
    return out


def env_follow(x, att, rel, sr=SR):
    """Peak envelope follower (mono)."""
    return _follow(np.abs(np.asarray(x, np.float64)), np.exp(-1 / (att * sr)), np.exp(-1 / (rel * sr)))


def compressor(x, thr_db=-24, ratio=3.0, att=0.004, rel=0.09, knee=6.0, makeup_db=0.0):
    lvl = env_follow(x, att, rel)
    db = 20 * np.log10(lvl + 1e-9)
    over = db - thr_db
    gr = np.where(over <= -knee / 2, 0.0,
                  np.where(over >= knee / 2, over * (1 - 1 / ratio),
                           (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee)))
    g = 10 ** ((-gr + makeup_db) / 20)
    return x * g


def deesser(x, f_lo=4800, f_hi=9500, thr_db=-30, max_red_db=7.0):
    band = sosfilt(butter(2, [f_lo, f_hi], 'band', fs=SR, output='sos'), x)
    e = env_follow(band, 0.002, 0.05)
    db = 20 * np.log10(e + 1e-9)
    red = np.clip(db - thr_db, 0, max_red_db)
    g = 10 ** (-red / 20)
    return x - band + band * g


def process_voice(x):
    x = sosfilt(butter(2, 80, 'high', fs=SR, output='sos'), x)
    x = peq(x, 300, -2.0, 1.0)
    x = peq(x, 3200, 2.5, 0.9)
    x = shelf_hi(x, 9000, 1.5)
    x = deesser(x)
    x = compressor(x, thr_db=-26, ratio=3.0, makeup_db=3.0)
    return x


def room_ir(seconds=0.55, seed=11):
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal((n, 2)) * np.exp(-t * 6.9 / seconds)[:, None]
    ir = sosfilt(butter(2, 5000, 'low', fs=SR, output='sos'), ir, axis=0)
    ir *= (1 - np.exp(-t / 0.004))[:, None]
    return ir / np.sqrt((ir ** 2).sum(0, keepdims=True))


def true_peak_limiter(x, ceiling_db=-1.0, look=0.004, rel=0.12):
    """Look-ahead brickwall on 4x oversampled peaks."""
    up = resample_poly(x, 4, 1, axis=0)
    pk = np.abs(up).max(1)
    pk = pk.reshape(-1, 4).max(1)[:len(x)]
    ceil = 10 ** (ceiling_db / 20)
    need = np.minimum(1.0, ceil / (pk + 1e-9))
    la = int(look * SR)
    # min over look-ahead window, then smooth release
    from scipy.ndimage import minimum_filter1d
    g = minimum_filter1d(need, size=2 * la + 1, origin=0)
    out = _release(np.ascontiguousarray(g, dtype=np.float64), np.exp(-1 / (rel * SR)))
    return x * out[:, None]


def find_pause(x, t_est, win=0.8):
    """Centre (s) of the longest silent stretch near t_est (ties broken by distance)."""
    h = int(0.005 * SR)
    e = np.sqrt(np.convolve(x ** 2, np.ones(4 * h) / (4 * h), mode='same'))
    a = max(0, int((t_est - win) * SR))
    b = min(len(x), int((t_est + win) * SR))
    seg = e[a:b]
    thr = max(np.percentile(np.abs(x), 60) * 0.12, seg.min() * 3.0)
    quiet = seg < thr
    best, best_score = None, -1e9
    i = 0
    while i < len(quiet):
        if quiet[i]:
            j = i
            while j < len(quiet) and quiet[j]:
                j += 1
            dur = (j - i) / SR
            c = (a + (i + j) / 2) / SR
            score = dur - 0.15 * abs(c - t_est)
            if dur > 0.03 and score > best_score:
                best, best_score = c, score
            i = j
        else:
            i += 1
    if best is None:
        best = (a + np.argmin(seg)) / SR
    return best


# subtitle events per line: list of (text, split_after_text_or_None)
SUB_SPLITS = {
    0: ["Tras semanas de aclimatación\ny avances por campamentos,", "el ascenso sigue el Espolón de los Abruzos."],
    1: ["No es una línea recta hacia la cima:", "es una sucesión de roca, hielo,\nviento y pasos expuestos."],
    2: ["La Chimenea de House obliga a trepar\npor una angosta fisura;"],
    3: ["más arriba, la Pirámide Negra exige\navanzar por terreno mixto y empinado."],
    4: ["Tras el Hombro, cerca de los ocho mil\nmetros, comienza el tramo decisivo."],
    5: ["El Bottleneck se estrecha\nbajo un serac colgante:", "cada paso y cada minuto cuentan."],
    6: ["Superado el corredor y su travesía,\nla arista final conduce a 8.611 metros."],
    7: ["Pero en el K2, tocar la cima\nes solo la mitad del viaje:", "aún hay que volver."],
}


def srt_time(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'


def ass_time(t):
    cs = int(round(t * 100))
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f'{h:d}:{m:02d}:{s:02d}.{cs:02d}'


def build():
    meter = pyln.Meter(SR)
    n = int(DURATION * SR)
    voice = np.zeros((n, 2))
    vmono = np.zeros(n)
    events = []
    timing = []
    for i in range(len(LINES)):
        x, sr = sf.read(f'{A}/narration/line_{i}.wav', dtype='float64')
        x = resample_poly(x, 320, 147) if sr == 22050 else x
        x = process_voice(x)
        # line loudness match
        pad = np.zeros(int(0.4 * SR))
        lufs = meter.integrated_loudness(np.concatenate([pad, x, pad]))
        x = x * 10 ** ((-20.0 - lufs) / 20)
        t0 = LINE_START[i]
        a = int(t0 * SR)
        L = min(len(x), n - a)
        vmono[a:a + L] += x[:L]
        dur = len(x) / SR
        timing.append(dict(line=i, start=t0, end=t0 + dur, text=LINES[i][0]))
        parts = SUB_SPLITS[i]
        if len(parts) == 1:
            events.append((t0, t0 + dur, parts[0]))
        else:
            # split at the pause nearest to the character-proportional estimate
            frac = len(parts[0].replace('\n', ' ')) / (len(parts[0]) + len(parts[1]))
            ts = find_pause(x, dur * frac)
            events.append((t0, t0 + ts, parts[0]))
            events.append((t0 + ts, t0 + dur, parts[1]))
    # voice: centred, tiny room
    ir = room_ir()
    wet = np.stack([fftconvolve(vmono, ir[:, c])[:n] for c in range(2)], 1)
    voice = vmono[:, None] * np.array([1.0, 1.0]) + wet * 0.10
    # ---- music & sfx
    mus, _ = sf.read(f'{A}/music.wav', dtype='float64')
    sfx, _ = sf.read(f'{A}/sfx.wav', dtype='float64')
    mus = np.pad(mus, ((0, max(0, n - len(mus))), (0, 0)))[:n]
    sfx = np.pad(sfx, ((0, max(0, n - len(sfx))), (0, 0)))[:n]
    mus *= 10 ** ((-23.0 - meter.integrated_loudness(mus)) / 20)
    sfx *= 10 ** ((-27.0 - meter.integrated_loudness(sfx)) / 20)
    # sidechain: smooth voice-activity envelope
    ve = env_follow(vmono, 0.01, 0.25)
    ve = ve / (np.percentile(ve[ve > 1e-4], 90) + 1e-9)
    ve = np.clip(ve, 0, 1)
    # slow the ducking gain itself (attack 120 ms, release 450 ms)
    duck = env_follow(ve, 0.12, 0.45)
    duck = np.clip(duck / (duck.max() + 1e-9), 0, 1)
    g_m = 10 ** (-7.0 * duck / 20)
    g_s = 10 ** (-4.0 * duck / 20)
    bg = mus * g_m[:, None] + sfx * g_s[:, None]
    # adaptive: keep every line at least 11 dB above the bed (extra dip where the score swells)
    extra = np.zeros(n)
    for L in timing:
        a_, b_ = int(L['start'] * SR), int(L['end'] * SR)
        r = 10 * np.log10((voice[a_:b_] ** 2).mean() / ((bg[a_:b_] ** 2).mean() + 1e-12))
        need = max(0.0, 11.0 - r)
        lo, hi = max(0, a_ - int(0.15 * SR)), min(n, b_ + int(0.25 * SR))
        extra[lo:hi] = np.maximum(extra[lo:hi], need)
    k = int(0.3 * SR)
    win = np.hanning(2 * k + 1)
    extra = np.convolve(extra, win / win.sum(), mode='same')
    bg = bg * (10 ** (-extra / 20))[:, None]
    mix = voice + bg
    # master: loudness then true-peak ceiling
    lufs = meter.integrated_loudness(mix)
    mix = mix * 10 ** ((-16.0 - lufs) / 20)
    mix = true_peak_limiter(mix, -1.0)
    # gentle fade-in/out guards
    f = np.ones(n)
    f[:int(0.05 * SR)] = np.linspace(0, 1, int(0.05 * SR))
    mix *= f[:, None]
    os.makedirs(OUTDIR, exist_ok=True)
    sf.write(f'{A}/final_mix.wav', mix.astype(np.float32), SR, subtype='PCM_24')
    sf.write(f'{A}/stem_voice.wav', voice.astype(np.float32), SR, subtype='PCM_24')
    print('final LUFS', meter.integrated_loudness(mix), 'peak', np.abs(mix).max())
    # ---- subtitles
    # hold each subtitle 150 ms past the speech, never overlapping the next one
    ends = []
    for k, (a, b, txt) in enumerate(events):
        nxt = events[k + 1][0] if k + 1 < len(events) else 1e9
        ends.append(min(b + 0.15, nxt - 0.04))
    events = [(a, e, t) for (a, b, t), e in zip(events, ends)]
    srt = []
    for k, (a, b, txt) in enumerate(events, 1):
        srt.append(f'{k}\n{srt_time(a)} --> {srt_time(b)}\n{txt}\n')
    name = 'K2_Espolon_de_los_Abruzos'
    with open(f'{OUTDIR}/{name}.srt', 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(srt))
    ass = ['[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1920', 'PlayResY: 1080', 'WrapStyle: 2',
           'ScaledBorderAndShadow: yes', '', '[V4+ Styles]',
           'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, '
           'Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, '
           'MarginR, MarginV, Encoding',
           'Style: Sub,Inter Medium,42,&H00F2F4F6,&H00FFFFFF,&H64000000,&H8C000000,0,0,0,0,100,100,0.3,0,1,1.6,1.4,2,'
           '200,200,58,1', '', '[Events]',
           'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text']
    for a, b, txt in events:
        ass.append(f'Dialogue: 0,{ass_time(a)},{ass_time(b)},Sub,,0,0,0,,{{\\fad(120,160)}}'
                   + txt.replace('\n', '\\N'))
    with open(f'{A}/subs.ass', 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(ass) + '\n')
    json.dump(dict(lines=timing, events=[dict(start=a, end=b, text=t) for a, b, t in events]),
              open(f'{A}/timing.json', 'w'), ensure_ascii=False, indent=1)
    for t in timing:
        print(f"L{t['line']} {t['start']:6.2f}-{t['end']:6.2f}  {t['text'][:60]}")


if __name__ == '__main__':
    build()
