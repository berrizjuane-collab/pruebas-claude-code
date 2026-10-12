"""Re-take selected narration lines, judging each take by ASR *inside the final mix context*.

Usage: python3 retake_in_mix.py 0 2 5   (line indices).  Each candidate take is processed with the
voice chain, laid over the ducked music + effects exactly where it will sit, transcribed by
Whisper-small, and scored on word error rate (in the mix and in isolation) and pitch liveliness.
The best take overwrites narration/line_<i>.wav.
"""
import os
import sys, json, itertools, numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..'))
import narration as N
import mixdown as MD
from timeline import LINE_START
from scipy.signal import resample_poly
import pyloudnorm as pyln
meter = pyln.Meter(48000)
asr = N.make_asr()
mus, _ = sf.read('/home/user/k2data/audio/music.wav'); sfx, _ = sf.read('/home/user/k2data/audio/sfx.wav')
mus = mus * 10 ** ((-23.0 - meter.integrated_loudness(mus)) / 20); sfx = sfx * 10 ** ((-27.0 - meter.integrated_loudness(sfx)) / 20)
VAR = {0: ["Tras semanas de aclimatación y avances por campamentos, el ascenso sigue el Espolón de los Abruzos.",
           "Tras semanas de aclimatación, y avances por campamentos, el ascenso sigue el Espolón de los Abruzos.",
           "Tras semanas de aclimatación y de avances por campamentos, el ascenso sigue el Espolón de los Abruzos."],
       2: ["La Chimenea de Jáus obliga a trepar por una angosta fisura.", "La Chimenea de Jáus, obliga a trepar, por una angosta fisura."],
       5: ["El Bótelnek se estrecha bajo un serac colgante: cada paso, y cada minuto, cuentan.",
           "El Bótelnek se estrecha, bajo un serac colgante. Cada paso, y cada minuto, cuentan.",
           "El Bótelnek, se estrecha bajo un serac colgante. Cada paso y cada minuto cuentan."]}
for li in [int(a) for a in sys.argv[1:]]:
    disp = N.LINES[li][0]
    best = None
    for txt, ns, nw, sp in itertools.product(VAR[li], [0.5, 0.6, 0.7], [0.6, 0.8], [0.93, 0.96]):
        tts = N.make_tts(ns, nw); a = tts.generate(txt, sid=0, speed=sp)
        x = N.trim(np.array(a.samples, np.float32), a.sample_rate)
        x48 = resample_poly(x.astype(np.float64), 320, 147)
        v = MD.process_voice(x48)
        pad = np.zeros(int(0.4 * 48000)); v = v * 10 ** ((-20 - meter.integrated_loudness(np.concatenate([pad, v, pad]))) / 20)
        t0 = LINE_START[li]; i0 = int(t0 * 48000)
        seg = (mus[i0:i0 + len(v)].mean(1) * 10 ** (-7 / 20) + sfx[i0:i0 + len(v)].mean(1) * 10 ** (-4 / 20))[:len(v)]
        mixseg = v[:len(seg)] + seg
        m16 = resample_poly(mixseg, 1, 3).astype(np.float32)
        s = asr.create_stream(); s.accept_waveform(16000, m16); asr.decode_stream(s); hyp = s.result.text.strip()
        w = N.wer(disp, hyp)
        s2 = asr.create_stream(); s2.accept_waveform(16000, resample_poly(v, 1, 3).astype(np.float32)); asr.decode_stream(s2)
        w2 = N.wer(disp, s2.result.text.strip())
        med, sd = N.f0_stats(x, a.sample_rate)
        dur = len(x) / a.sample_rate
        score = (w + w2) * 3 - min(sd, 3.5) * 0.1 + (0.5 if (li == 5 and dur > 5.45) else 0)
        if best is None or score < best[0]:
            best = (score, x, a.sample_rate, dict(txt=txt, ns=ns, nw=nw, sp=sp, wer_mix=w, wer_clean=w2, sd=sd, dur=dur, hyp=hyp))
        print(li, f'{w:.2f}/{w2:.2f} {dur:.2f}s | {hyp}', flush=True)
    print('BEST', li, json.dumps(best[3], ensure_ascii=False), flush=True)
    sf.write(f'/home/user/k2data/audio/narration/line_{li}.wav', best[1], best[2])
