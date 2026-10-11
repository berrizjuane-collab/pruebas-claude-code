"""Teaser de 30 s montado por compases a partir del master de la pelicula.

A 80 BPM un compas de 4/4 dura 3 s (72 fotogramas), asi que 10 compases son 30 s
exactos. Imagen y sonido se cortan en los mismos limites de compas de la pelicula, de modo
que la sincronia se conserva; el sonido se recompone desde las mezclas previas al master
(musica y efectos) con fundidos cruzados de 25 ms y se vuelve a masterizar con la misma
cadena que la pelicula (-14 LUFS, pico verdadero <= -1 dBTP).

Uso: python -m src.edit.teaser            -> render/final/14_cumbres_teaser_30s_{2160p,1080p}.mp4
"""
import os
import subprocess

import numpy as np
import soundfile as sf

from ..audio import mix as M
from ..audio import synth as S
from .compose import COLOR_TAGS
from .render_film import MASTER, OUT_DIR, log, run

# compases de la pelicula (1..60) que forman el teaser, en orden
BARS = [2, 3, 4, 6, 45, 48, 49, 57, 58, 59]
BAR_F = 72                    # fotogramas por compas
BAR_S = 3 * M.SR              # muestras por compas
XF = int(0.025 * M.SR)        # fundido cruzado entre compases no contiguos

AUDIO_DIR = os.path.join(M.ROOT, "data", "work", "audio")
WAV = os.path.join(OUT_DIR, "14_cumbres_teaser_30s.wav")
UHD = os.path.join(OUT_DIR, "14_cumbres_teaser_30s_2160p24.mp4")
FHD = os.path.join(OUT_DIR, "14_cumbres_teaser_30s_1080p24.mp4")


def runs(bars):
    """Agrupa compases contiguos: [2,3,4,6] -> [(2,4),(6,6)]."""
    out = []
    for b in bars:
        if out and out[-1][1] == b - 1:
            out[-1][1] = b
        else:
            out.append([b, b])
    return [tuple(r) for r in out]


def cut_audio(x):
    """Concatena los tramos de compases con fundidos cruzados de igual potencia."""
    total = len(BARS) * BAR_S
    out = np.zeros((total + XF, 2), np.float32)
    pos = 0
    h = XF // 2
    for a, b in runs(BARS):
        s0, s1 = (a - 1) * BAR_S, b * BAR_S
        seg = x[max(s0 - h, 0):s1 + h].copy()
        if s0 - h < 0:
            seg = np.concatenate([np.zeros((h - s0, 2), np.float32), seg])
        t = np.linspace(0, np.pi / 2, XF, dtype=np.float32)[:, None]
        seg[:XF] *= np.sin(t)
        seg[-XF:] *= np.cos(t)
        n = len(seg)
        out[pos:pos + n] += seg[:len(out) - pos]
        pos += (b - a + 1) * BAR_S
    return out[h:h + total]


def master_audio():
    import pyloudnorm as pyln
    mus = M.load(os.path.join(AUDIO_DIR, "musica.wav"))
    fx = M.load(os.path.join(AUDIO_DIR, "efectos.wav"))
    mix = cut_audio(mus) * M.db(-1.0) + cut_audio(fx) * M.db(-2.0)
    mix = S.butter(mix, "high", 25, 2).astype(np.float32)
    mix = M.compress(mix, thresh_db=-20, ratio=1.8)
    meter = pyln.Meter(M.SR)
    for _ in range(2):
        mix = mix * M.db(-14.0 - meter.integrated_loudness(mix))
        mix = M.true_peak_limit(mix, ceiling_db=-1.6)
    t = np.arange(len(mix)) / M.SR
    dur = len(BARS) * 3.0
    mix = mix * np.clip(t / 0.05, 0, 1)[:, None] * np.clip((dur - t) / 1.2, 0, 1)[:, None]
    sf.write(WAV, mix.astype(np.float32), M.SR, subtype="PCM_24")
    log(f"teaser: audio {len(mix)/M.SR:.2f} s, {meter.integrated_loudness(mix):.2f} LUFS")


def video():
    sel = "+".join(f"between(n\\,{(a-1)*BAR_F}\\,{b*BAR_F-1})" for a, b in runs(BARS))
    n = len(BARS) * BAR_F
    cut = f"select='{sel}',setpts=N/(24*TB),fade=t=in:st=0:d=0.25,fade=t=out:st={n/24-0.5}:d=0.5"
    common = ["-map", "0:v", "-map", "1:a", "-frames:v", str(n), "-c:a", "aac", "-b:a", "320k", "-ar", "48000",
              *COLOR_TAGS, "-movflags", "+faststart", "-shortest"]
    for path, scale, level, maxrate in ((UHD, "", "5.1", "80M"), (FHD, "w=1920:h=1080:filter=lanczos:", "4.2", "30M")):
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", MASTER, "-i", WAV,
             "-vf", f"{cut},zscale={scale}dither=error_diffusion,format=yuv420p",
             "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-maxrate", maxrate, "-bufsize", "160M",
             "-profile:v", "high", "-level:v", level, "-g", "48", *common, path])


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    master_audio()
    video()
    log("teaser listo")


if __name__ == "__main__":
    main()
