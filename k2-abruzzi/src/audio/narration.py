"""Narration: neural TTS (Piper es_MX 'claude-high', espeak es-419 phonemes).

Each line is synthesised several times (VITS sampling is stochastic); every take is
transcribed with Whisper-small and scored on intelligibility (WER against the script),
pitch liveliness and clean edges.  The best take per line is kept.
"""
import json
import os
import re
import sys
import unicodedata

import numpy as np
import soundfile as sf
import librosa
import sherpa_onnx

T = '/home/user/k2data/tts'
OUT = '/home/user/k2data/audio/narration'

# (display text for subtitles, text sent to the TTS, speed)
LINES = [
    ("Tras semanas de aclimatación y avances por campamentos, el ascenso sigue el Espolón de los Abruzos.",
     "Tras semanas de aclimatación, y avances por campamentos, el ascenso sigue el Espolón de los Abruzos.", 0.96),
    ("No es una línea recta hacia la cima: es una sucesión de roca, hielo, viento y pasos expuestos.",
     "No es una línea recta hacia la cima: es una sucesión de roca, hielo, viento, y pasos expuestos.", 0.97),
    ("La Chimenea de House obliga a trepar por una angosta fisura;",
     "La Chimenea de Jáus obliga a trepar por una angosta fisura.", 0.96),
    ("más arriba, la Pirámide Negra exige avanzar por terreno mixto y empinado.",
     "Más arriba, la Pirámide Negra exige avanzar por terreno mixto y empinado.", 0.96),
    ("Tras el Hombro, cerca de los ocho mil metros, comienza el tramo decisivo.",
     "Tras el Hombro, cerca de los ocho mil metros, comienza el tramo decisivo.", 0.95),
    ("El Bottleneck se estrecha bajo un serac colgante: cada paso y cada minuto cuentan.",
     "El Bótelnek, se estrecha bajo un serac colgante. Cada paso y cada minuto cuentan.", 0.96),
    ("Superado el corredor y su travesía, la arista final conduce a 8.611 metros.",
     "Superado el corredor y su travesía, la arista final conduce a ocho mil seiscientos once metros.", 0.96),
    ("Pero en el K2, tocar la cima es solo la mitad del viaje: aún hay que volver.",
     "Pero en el Ka Dos, tocar la cima es solo la mitad del viaje. Aún hay que volver.", 0.97),
]

# Takes used in the film (chosen by retake_in_mix.py / the take search): noise_scale, noise_w, speed
# (lines 1, 3, 4, 6 from build(); 0, 2, 5 from retake_in_mix.py; 7 from a parameter sweep)
CHOSEN = {0: (0.50, 0.60, 0.96), 1: (0.60, 0.75, 0.97), 2: (0.70, 0.60, 0.96), 3: (0.70, 0.75, 0.96),
          4: (0.65, 0.75, 0.95), 5: (0.70, 0.80, 0.96), 6: (0.65, 0.75, 0.96), 7: (0.70, 0.60, 0.97)}
# VITS sampling is stochastic: re-running reproduces the selection procedure, not bit-identical audio.

# words whose TTS spelling differs: accept the display spelling in the ASR check
ASR_ALIASES = {'jaus': 'house', 'botelnek': 'bottleneck', 'ka': 'k', 'dos': '2', 'k2': 'k 2'}


def make_tts(noise_scale=0.667, noise_w=0.8):
    d = f'{T}/vits-piper-es_MX-claude-high'
    cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=f'{d}/es_MX-claude-high.onnx', tokens=f'{d}/tokens.txt',
                                                   data_dir=f'{d}/espeak-ng-data', noise_scale=noise_scale,
                                                   noise_scale_w=noise_w, length_scale=1.0),
        num_threads=4, provider='cpu'), max_num_sentences=1)
    return sherpa_onnx.OfflineTts(cfg)


def make_asr():
    d = f'{T}/sherpa-onnx-whisper-small'
    return sherpa_onnx.OfflineRecognizer.from_whisper(encoder=f'{d}/small-encoder.int8.onnx',
                                                      decoder=f'{d}/small-decoder.int8.onnx',
                                                      tokens=f'{d}/small-tokens.txt', language='es',
                                                      task='transcribe', num_threads=4)


def norm_words(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.replace('8.611', 'ocho mil seiscientos once').replace('8611', 'ocho mil seiscientos once')
    s = s.replace('8.000', 'ocho mil').replace('8000', 'ocho mil')
    w = re.sub(r'[^a-z0-9 ]', ' ', s).split()
    return [ASR_ALIASES.get(x, x) for x in w]


def wer(ref, hyp):
    r, h = norm_words(ref), norm_words(hyp)
    d = np.zeros((len(r) + 1, len(h) + 1), int)
    d[:, 0] = range(len(r) + 1)
    d[0, :] = range(len(h) + 1)
    for i in range(1, len(r) + 1):
        for j in range(1, len(h) + 1):
            d[i, j] = min(d[i - 1, j] + 1, d[i, j - 1] + 1, d[i - 1, j - 1] + (r[i - 1] != h[j - 1]))
    return d[-1, -1] / max(1, len(r))


def trim(x, sr, thr_db=-45, pad=0.04):
    env = librosa.feature.rms(y=x, frame_length=512, hop_length=128)[0]
    db = 20 * np.log10(env + 1e-9)
    on = np.nonzero(db > thr_db)[0]
    if not len(on):
        return x
    a = max(0, on[0] * 128 - int(pad * sr))
    b = min(len(x), on[-1] * 128 + 512 + int(pad * sr))
    return x[a:b]


def f0_stats(x, sr):
    f0, vf, vp = librosa.pyin(x, fmin=65, fmax=320, sr=sr, frame_length=1024)
    f = f0[~np.isnan(f0)]
    if len(f) < 5:
        return 0.0, 0.0
    st = 12 * np.log2(f / np.median(f))
    return float(np.median(f)), float(np.std(st))


def build(takes=6):
    os.makedirs(OUT, exist_ok=True)
    asr = make_asr()
    report = []
    for li, (disp, txt, speed) in enumerate(LINES):
        best = None
        for k in range(takes):
            ns = 0.6 + 0.05 * (k % 3)
            tts = make_tts(noise_scale=ns, noise_w=0.75)
            a = tts.generate(txt, sid=0, speed=speed)
            x = np.array(a.samples, np.float32)
            sr = a.sample_rate
            x = trim(x, sr)
            s = asr.create_stream()
            s.accept_waveform(sr, x)
            asr.decode_stream(s)
            hyp = s.result.text.strip()
            w = wer(disp, hyp)
            med, sd = f0_stats(x, sr)
            clip = float(np.mean(np.abs(x) > 0.98))
            score = w * 3.0 - min(sd, 3.5) * 0.12 + clip * 10
            rec = dict(line=li, take=k, noise=ns, dur=len(x) / sr, wer=w, f0=med, f0_sd_st=sd, hyp=hyp, score=score)
            print(json.dumps(rec, ensure_ascii=False))
            if best is None or score < best[0]:
                best = (score, x, sr, rec)
        sf.write(f'{OUT}/line_{li}.wav', best[1], best[2])
        report.append(best[3])
    json.dump(report, open(f'{OUT}/report.json', 'w'), ensure_ascii=False, indent=1)
    return report


if __name__ == '__main__':
    r = build(int(sys.argv[1]) if len(sys.argv) > 1 else 6)
    print('\nBEST TAKES')
    for x in r:
        print(f"L{x['line']} take{x['take']} {x['dur']:.2f}s wer={x['wer']:.2f} f0={x['f0']:.0f}Hz sd={x['f0_sd_st']:.2f}st | {x['hyp']}")
    print('total', sum(x['dur'] for x in r))
