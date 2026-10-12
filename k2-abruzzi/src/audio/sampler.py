"""Tiny sample-playback engine over the VSCO-2 Community Edition orchestral library (CC0)."""
import glob
import os
import re

import numpy as np
import soundfile as sf

LIB = '/home/user/sgossner/vsco-2-ce'
SR = 44100

NOTE_RE = re.compile(r'_([A-G]#?)(-?\d)(?=[_.])')
PC = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}


def note_to_midi(name, octave):
    return 12 * (octave + 1) + PC[name]


def midi(n):
    """'D3' -> 50 (scientific pitch, A4 = 440)."""
    m = re.match(r'([A-G])(#|b)?(-?\d)', n)
    pc = PC[m.group(1)] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0)
    return 12 * (int(m.group(3)) + 1) + pc


def _load(path):
    x, sr = sf.read(path, dtype='float32', always_2d=True)
    if x.shape[1] == 1:
        x = np.repeat(x, 2, axis=1)
    if sr != SR:
        t = np.arange(int(len(x) * SR / sr)) * sr / SR
        x = np.stack([np.interp(t, np.arange(len(x)), x[:, c]) for c in range(2)], 1).astype(np.float32)
    return x


class Instrument:
    """Multi-sampled instrument. `octave_offset`: library names sit one octave low (measured)."""

    def __init__(self, pattern, octave_offset=1, gain=1.0, pan=0.0, release=0.8, vel_re=r'_v(\d)'):
        self.samples = {}      # midi -> list of (vel_layer, array)
        for p in sorted(glob.glob(os.path.join(LIB, pattern))):
            m = NOTE_RE.search(os.path.basename(p))
            if not m:
                continue
            mi = note_to_midi(m.group(1), int(m.group(2))) + 12 * octave_offset
            v = re.search(vel_re, os.path.basename(p))
            layer = int(v.group(1)) if v else 1
            self.samples.setdefault(mi, []).append((layer, p))
        if not self.samples:
            raise ValueError(f'no samples for {pattern}')
        self.keys = np.array(sorted(self.samples))
        self.cache = {}
        self.gain = gain
        self.pan = pan
        self.release = release

    def _get(self, path):
        if path not in self.cache:
            self.cache[path] = _load(path)
        return self.cache[path]

    def note(self, m, dur, vel=0.6, swell=None, release=None, rr=0):
        """Render one note -> stereo float32 array starting at the note onset."""
        k = self.keys[np.argmin(np.abs(self.keys - m))]
        layers = sorted(self.samples[k])
        lv = sorted(set(l for l, _ in layers))
        want = lv[min(len(lv) - 1, int(vel * len(lv)))]
        cands = [p for l, p in layers if l == want]
        x = self._get(cands[rr % len(cands)])
        ratio = 2.0 ** ((m - k) / 12.0)
        rel = self.release if release is None else release
        n_out = int((dur + rel) * SR)
        src = np.arange(n_out) * ratio
        src = src[src < len(x) - 1]
        y = np.stack([np.interp(src, np.arange(len(x)), x[:, c]) for c in range(2)], 1)
        n = len(y)
        env = np.ones(n, np.float32)
        a = int(dur * SR)
        if a < n:
            r = n - a
            env[a:] = np.cos(np.linspace(0, np.pi / 2, r)) ** 2
        if swell is not None:
            tt = np.arange(n) / SR
            env *= np.interp(tt, swell[0], swell[1]).astype(np.float32)
        y = y * env[:, None] * self.gain * (0.35 + 0.65 * vel)
        # equal-power pan
        p = (self.pan + 1) * np.pi / 4
        y[:, 0] *= np.cos(p) * 1.414
        y[:, 1] *= np.sin(p) * 1.414
        return y.astype(np.float32)


class OneShot:
    """Unpitched / fixed-pitch hits (timpani, drums, cymbals) with optional repitch."""

    def __init__(self, files, gain=1.0, pan=0.0, base_hz=None):
        self.files = [os.path.join(LIB, f) for f in files]
        self.cache = {}
        self.gain = gain
        self.pan = pan
        self.base_hz = base_hz

    def hit(self, idx=0, vel=1.0, semis=0.0, dur=None, fade=0.3):
        p = self.files[idx % len(self.files)]
        if p not in self.cache:
            self.cache[p] = _load(p)
        x = self.cache[p]
        ratio = 2.0 ** (semis / 12.0)
        src = np.arange(int(len(x) / ratio)) * ratio
        src = src[src < len(x) - 1]
        y = np.stack([np.interp(src, np.arange(len(x)), x[:, c]) for c in range(2)], 1)
        if dur is not None and dur * SR < len(y):
            n = int(dur * SR)
            f = int(fade * SR)
            y = y[:n + f]
            y[n:] *= np.cos(np.linspace(0, np.pi / 2, len(y) - n))[:, None] ** 2
        p_ = (self.pan + 1) * np.pi / 4
        y[:, 0] *= np.cos(p_) * 1.414
        y[:, 1] *= np.sin(p_) * 1.414
        return (y * self.gain * vel).astype(np.float32)


class Track:
    def __init__(self, seconds):
        self.buf = np.zeros((int(seconds * SR) + SR * 8, 2), np.float32)

    def add(self, t, y, gain=1.0):
        i = int(round(t * SR))
        if i < 0:
            y = y[-i:]
            i = 0
        n = min(len(y), len(self.buf) - i)
        if n > 0:
            self.buf[i:i + n] += y[:n] * gain


def hall_ir(seconds=3.4, sr=SR, seed=4, predelay=0.022, damp=0.55):
    """Synthetic stereo concert-hall impulse response (decorrelated, high frequencies decay faster)."""
    rng = np.random.default_rng(seed)
    n = int(seconds * sr)
    t = np.arange(n) / sr
    out = []
    for ch in range(2):
        noise = rng.standard_normal(n).astype(np.float32)
        # split into bands with different decay (RT60 low ~ seconds, high ~ seconds*damp)
        from scipy.signal import butter, sosfilt
        lo = sosfilt(butter(2, 600, 'low', fs=sr, output='sos'), noise)
        mid = sosfilt(butter(2, [600, 3500], 'band', fs=sr, output='sos'), noise)
        hi = sosfilt(butter(2, 3500, 'high', fs=sr, output='sos'), noise)
        k = np.log(1000) / seconds
        ir = lo * np.exp(-k * t) + mid * np.exp(-k * t / 0.85) * 0.8 + hi * np.exp(-k * t / damp) * 0.5
        # soft onset (diffusion build-up)
        ir *= 1 - np.exp(-t / 0.012)
        ir = np.concatenate([np.zeros(int(predelay * sr)), ir])
        # a few early reflections
        for d, g in ((0.011, 0.5), (0.019, 0.38), (0.027, 0.3), (0.041, 0.22)):
            j = int((d + ch * 0.003) * sr)
            ir[j] += g
        out.append(ir / np.sqrt((ir ** 2).sum()))
    L = max(len(o) for o in out)
    return np.stack([np.pad(o, (0, L - len(o))) for o in out], 1).astype(np.float32)
