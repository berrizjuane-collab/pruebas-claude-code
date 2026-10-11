"""Comprobaciones de la revision sobre los archivos exportados (complementan render_film verify).

color   fidelidad de extremo a extremo: cada fijo renderizado (RGB del motor) frente al
        mismo fotograma de cada pelicula, decodificado con la matriz BT.709 de rango
        limitado escrita aqui (lo que hace un reproductor), sin conversiones de ffmpeg
sonido  medidas del master WAV: sonoridad, picos, componente continua, correlacion entre
        canales, perdida al sumar a mono y principio y final
sincro  desfase del audio decodificado de cada entrega frente a su master, en muestras,
        en tres puntos de cada archivo
empalmes  los cuatro empalmes del teaser frente al mismo punto musical de la pelicula

Uso: python -m src.edit.qa [color] [sonido] [sincro] [empalmes]   -> render/qa.json
"""
import json
import os
import re
import subprocess
import sys

import cv2
import numpy as np
import soundfile as sf
from scipy import signal

from .render_film import AUDIO, FHD, OUT_DIR, ROOT, UHD, WEB
from .stills import OUT as STILLS_DIR, STILLS
from .teaser import BARS, FHD as TEASER_FHD, UHD as TEASER_UHD, WAV as TEASER_WAV

SR = 48000
VERTICAL = os.path.join(OUT_DIR, "14_cumbres_teaser_30s_vertical_1080x1920.mp4")
QA_JSON = os.path.join(ROOT, "render", "qa.json")


def yuv420_to_rgb(raw, w, h):
    """YUV 4:2:0 de 8 bits, rango limitado, matriz BT.709 -> RGB 0..255 (coma flotante)."""
    a = np.frombuffer(raw, np.uint8).astype(np.float64)
    y = a[:w * h].reshape(h, w)
    up = lambda p: cv2.resize(p.reshape(h // 2, w // 2), (w, h), interpolation=cv2.INTER_LINEAR)
    u, v = up(a[w * h:w * h * 5 // 4]), up(a[w * h * 5 // 4:])
    yn, un, vn = (y - 16) / 219.0, (u - 128) / 224.0, (v - 128) / 224.0
    kr, kb = 0.2126, 0.0722
    r = yn + 2 * (1 - kr) * vn
    b = yn + 2 * (1 - kb) * un
    g = (yn - kr * r - kb * b) / (1 - kr - kb)
    return np.clip(np.stack([r, g, b], -1), 0, 1) * 255.0


def color():
    out = {}
    for f, name in STILLS.items():
        ref = cv2.imread(os.path.join(STILLS_DIR, f"14_cumbres_{name}.png"), cv2.IMREAD_UNCHANGED)
        ref = ref[..., ::-1].astype(np.float64)
        for key, path, w, h in (("2160p", UHD, 3840, 2160), ("1080p", FHD, 1920, 1080), ("1080p web", WEB, 1920, 1080)):
            r = ref if w == 3840 else cv2.resize(ref, (w, h), interpolation=cv2.INTER_AREA)
            raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"select=eq(n\\,{f})", "-frames:v", "1",
                                  "-f", "rawvideo", "-pix_fmt", "yuv420p", "-"], capture_output=True).stdout
            d = yuv420_to_rgb(raw, w, h) - r
            out[f"{key} f{f}"] = {"media_firmada_RGB": d.mean((0, 1)).round(2).tolist(),
                                  "error_abs_medio": round(float(np.abs(d).mean()), 2),
                                  "PSNR_dB": round(float(10 * np.log10(255 ** 2 / (d ** 2).mean())), 2)}
            print(key, f, out[f"{key} f{f}"], flush=True)
    return out


def ebur(path):
    err = subprocess.run(["ffmpeg", "-nostats", "-hide_banner", "-i", path, "-map", "0:a:0",
                          "-af", "ebur128=peak=true+sample", "-f", "null", "-"], capture_output=True, text=True).stderr
    summ = err[err.rfind("Summary:"):]
    g = lambda p: float(re.search(p, summ, re.S).group(1))
    return {"integrada_LUFS": g(r"I:\s+(-?[\d.]+) LUFS"), "rango_LU": g(r"LRA:\s+(-?[\d.]+) LU"),
            "pico_verdadero_dBTP": g(r"True peak:.*?Peak:\s+(-?[\d.]+) dBFS"),
            "pico_muestra_dBFS": g(r"Sample peak:.*?Peak:\s+(-?[\d.]+) dBFS"),
            "momentanea_max_LUFS": max(float(v) for v in re.findall(r" M:\s*(-?[\d.]+)", err)),
            "corto_plazo_max_LUFS": max(float(v) for v in re.findall(r" S:\s*(-?[\d.]+)", err))}


def sonido():
    x, sr = sf.read(AUDIO, dtype="float64", always_2d=True)
    assert sr == SR
    left, right = x[:, 0], x[:, 1]
    corr = [np.corrcoef(left[i:i + SR], right[i:i + SR])[0, 1] for i in range(0, len(x) - SR, SR)
            if left[i:i + SR].std() > 1e-4 and right[i:i + SR].std() > 1e-4]
    mono = os.path.join(ROOT, "render", "qa_mono.wav")
    m = (left + right) / 2
    sf.write(mono, np.stack([m, m], 1).astype(np.float32), SR, subtype="FLOAT")
    st, mo = ebur(AUDIO), ebur(mono)
    os.remove(mono)
    db = lambda v: round(float(20 * np.log10(v + 1e-12)), 1)
    out = {"formato": f"{sr} Hz, {x.shape[1]} canales, {sf.info(AUDIO).subtype}", "muestras": len(x), **st,
           "componente_continua_dBFS": [db(abs(left.mean())), db(abs(right.mean()))],
           "correlacion_LR": round(float(np.corrcoef(left, right)[0, 1]), 2),
           "correlacion_LR_minima_por_segundo": round(float(min(corr)), 2),
           "perdida_al_sumar_a_mono_LU": round(st["integrada_LUFS"] - mo["integrada_LUFS"], 1),
           "primera_muestra": x[0].tolist(),
           "rms_ultimos_100ms_dBFS": db(np.sqrt((x[-SR // 10:] ** 2).mean()))}
    print(out, flush=True)
    return out


def decode_audio(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-map", "0:a:0", "-f", "f32le", "-ac", "2",
                          "-ar", str(SR), "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2)


def lag(ref, x, start, dur, maxlag=4800):
    """Desfase en muestras de x frente a ref (positivo: x llega tarde)."""
    a = ref[int(start * SR):int((start + dur) * SR)].mean(1)
    b = x[int(start * SR) - maxlag:int((start + dur) * SR) + maxlag].mean(1)
    return int(np.argmax(signal.correlate(b, a, mode="valid", method="fft"))) - maxlag


def sincro():
    film = sf.read(AUDIO, dtype="float32", always_2d=True)[0]
    teaser = sf.read(TEASER_WAV, dtype="float32", always_2d=True)[0]
    out = {}
    for path, ref, points, dur in ((UHD, film, (5, 80, 155), 20), (FHD, film, (5, 80, 155), 20),
                                   (WEB, film, (5, 80, 155), 20), (TEASER_UHD, teaser, (2, 12, 20), 8),
                                   (TEASER_FHD, teaser, (2, 12, 20), 8), (VERTICAL, teaser, (2, 12, 20), 8)):
        d = decode_audio(path)
        out[os.path.basename(path)] = {"desfase_muestras": [lag(ref, d, s, dur) for s in points],
                                       "en_segundos": list(points)}
        print(os.path.basename(path), out[os.path.basename(path)], flush=True)
    return out


def empalmes():
    """Mayor salto entre muestras a +-12,5 ms del empalme (zona del fundido cruzado) y
    correlacion de los 15-50 ms siguientes, frente al mismo punto de la pelicula."""
    film = sf.read(AUDIO, dtype="float64", always_2d=True)[0].mean(1)
    teaser = sf.read(TEASER_WAV, dtype="float64", always_2d=True)[0].mean(1)
    out = []
    for i in range(1, len(BARS)):
        if BARS[i] == BARS[i - 1] + 1:
            continue
        c, fs = i * 3 * SR, (BARS[i] - 1) * 3 * SR
        jt = np.abs(np.diff(teaser[c - 600:c + 600]))
        jf = np.abs(np.diff(film[fs - 600:fs + 600]))
        corr = np.corrcoef(teaser[c + 720:c + 2400], film[fs + 720:fs + 2400])[0, 1]
        out.append({"teaser_s": i * 3, "compases": f"{BARS[i - 1]}->{BARS[i]}",
                    "salto_max_teaser": round(float(jt.max()), 4), "salto_max_pelicula": round(float(jf.max()), 4),
                    "correlacion_despues": round(float(corr), 3)})
        print(out[-1], flush=True)
    return out


def main():
    cmds = sys.argv[1:] or ["color", "sonido", "sincro", "empalmes"]
    rep = json.load(open(QA_JSON)) if os.path.exists(QA_JSON) else {}
    for c in cmds:
        rep[c] = {"color": color, "sonido": sonido, "sincro": sincro, "empalmes": empalmes}[c]()
    with open(QA_JSON, "w") as fh:
        json.dump(rep, fh, indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
