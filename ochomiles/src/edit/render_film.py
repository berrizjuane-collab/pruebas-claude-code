"""Render final por segmentos reanudables y montaje de las entregas.

1. render: divide la pelicula en segmentos y renderiza cada uno con compose.py en un
   intermedio H.264 High 4:2:2 10 bits (render/seg/AAAA_BBBB.mkv). Un segmento terminado
   no se repite: si el proceso se corta, basta con volver a lanzar la orden.
2. assemble: une los segmentos sin recodificar, anade la banda sonora PCM 24 bits (master
   de archivo .mov) y codifica las entregas MP4 4K y 1080p (H.264 8 bits 4:2:0, AAC).
3. verify: mide en los archivos exportados duracion, fotogramas, resolucion, sonoridad
   integrada (EBU R128) y pico verdadero, y lo guarda en render/verificacion.json.

Uso:
  python -m src.edit.render_film render --res 3840x2160 [--range 0:4320] [--jobs 1]
  python -m src.edit.render_film assemble
  python -m src.edit.render_film verify
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time

from ..render.region import ROOT
from .compose import COLOR_TAGS
from .timeline import FPS, TOTAL

SEG_DIR = os.path.join(ROOT, "render", "seg")
OUT_DIR = os.path.join(ROOT, "render", "final")
AUDIO = os.path.join(ROOT, "data", "work", "audio", "banda_sonora.wav")
LOG = os.path.join(ROOT, "render", "film.log")

NAME = "14_cumbres"
MASTER = os.path.join(OUT_DIR, f"{NAME}_master_2160p24_422_10bit.mov")
UHD = os.path.join(OUT_DIR, f"{NAME}_2160p24.mp4")
FHD = os.path.join(OUT_DIR, f"{NAME}_1080p24.mp4")

# cortes de segmento: limites de seccion del montaje (los fundidos quedan dentro de un segmento)
CUTS = [0, 96, 312, 576] + [576 + 216 * i for i in range(1, 15)] + [3810, 4032, 4320]


def log(msg):
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)
    with open(LOG, "a") as fh:
        fh.write(line + "\n")


def segments(a, b, max_len):
    cuts = sorted(set([c for c in CUTS if a < c < b] + [a, b]))
    out = []
    for s, e in zip(cuts[:-1], cuts[1:]):
        n = max(1, round((e - s) / max_len))
        step = (e - s) / n
        edges = [s + round(step * i) for i in range(n)] + [e]
        out += list(zip(edges[:-1], edges[1:]))
    return out


def seg_path(s, e):
    return os.path.join(SEG_DIR, f"{s:04d}_{e:04d}.mkv")


def count_frames(path):
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-count_packets", "-select_streams", "v:0",
                              "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", path],
                             capture_output=True, text=True, timeout=120).stdout.strip()
        return int(out)
    except Exception:
        return -1


def render(args):
    os.makedirs(SEG_DIR, exist_ok=True)
    a, b = (int(v) for v in args.range.split(":"))
    todo = []
    for s, e in segments(a, b, args.seg):
        p = seg_path(s, e)
        if os.path.exists(p) and count_frames(p) == e - s:
            continue
        todo.append((s, e))
    log(f"render {args.res}: {len(todo)} segmentos pendientes en {a}:{b}")
    env = dict(os.environ)
    if args.lp_threads:
        env["LP_NUM_THREADS"] = str(args.lp_threads)
    running = []
    t0 = time.time()
    done_frames = 0
    total_frames = sum(e - s for s, e in todo)

    def launch(s, e):
        part = seg_path(s, e).replace(".mkv", ".part.mkv")
        cmd = [sys.executable, "-m", "src.edit.compose", "--res", args.res, "--range", f"{s}:{e}",
               "--out", part, "--mezz", "--crf", str(args.crf), "--preset", args.preset,
               "--samples", str(args.samples)]
        fh = open(os.path.join(SEG_DIR, f"{s:04d}_{e:04d}.log"), "w")
        return subprocess.Popen(cmd, cwd=ROOT, env=env, stdout=fh, stderr=subprocess.STDOUT), part, fh

    queue = list(todo)
    while queue or running:
        while queue and len(running) < args.jobs:
            s, e = queue.pop(0)
            proc, part, fh = launch(s, e)
            running.append((proc, part, fh, s, e, time.time()))
            log(f"  segmento {s}-{e} lanzado")
        time.sleep(5)
        for item in list(running):
            proc, part, fh, s, e, ts = item
            if proc.poll() is None:
                continue
            fh.close()
            running.remove(item)
            n = count_frames(part) if os.path.exists(part) else -1
            if proc.returncode == 0 and n == e - s:
                os.replace(part, seg_path(s, e))
                done_frames += e - s
                el = time.time() - t0
                rate = (time.time() - ts) / (e - s)
                eta = el / done_frames * (total_frames - done_frames)
                log(f"  segmento {s}-{e} listo: {rate:.1f} s/fot; {done_frames}/{total_frames} fot;"
                    f" quedan ~{eta/3600:.1f} h")
            else:
                log(f"  ERROR segmento {s}-{e}: codigo {proc.returncode}, {n} fotogramas; se reintenta")
                queue.append((s, e))
    log("render terminado")


def run(cmd):
    log("  $ " + " ".join(cmd))
    subprocess.run(cmd, check=True)


def assemble(args):
    os.makedirs(OUT_DIR, exist_ok=True)
    segs = segments(0, TOTAL, args.seg)
    missing = [(s, e) for s, e in segs if not os.path.exists(seg_path(s, e))]
    if missing:
        sys.exit(f"faltan segmentos: {missing}")
    lst = os.path.join(SEG_DIR, "concat.txt")
    with open(lst, "w") as fh:
        for s, e in segs:
            fh.write(f"file '{seg_path(s, e)}'\n")
    # master de archivo: video intermedio sin recodificar + PCM 24 bits 48 kHz
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-i", AUDIO,
         "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "pcm_s24le", *COLOR_TAGS,
         "-metadata", "title=14 cumbres. Un horizonte extraordinario.", "-movflags", "+write_colr", MASTER])
    # entregas: H.264 High 8 bits 4:2:0 con difusion de error al bajar de 10 a 8 bits
    common_a = ["-c:a", "aac", "-b:a", "320k", "-ar", "48000"]
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", MASTER, "-map", "0:v", "-map", "0:a",
         "-vf", "zscale=dither=error_diffusion,format=yuv420p",
         "-c:v", "libx264", "-preset", "slow", "-crf", str(args.crf_uhd), "-maxrate", "80M", "-bufsize", "160M",
         "-profile:v", "high", "-level:v", "5.1", "-g", "48", *COLOR_TAGS, *common_a,
         "-movflags", "+faststart", UHD])
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", MASTER, "-map", "0:v", "-map", "0:a",
         "-vf", "zscale=w=1920:h=1080:filter=lanczos:dither=error_diffusion,format=yuv420p",
         "-c:v", "libx264", "-preset", "slow", "-crf", str(args.crf_fhd), "-maxrate", "30M", "-bufsize", "60M",
         "-profile:v", "high", "-level:v", "4.2", "-g", "48", *COLOR_TAGS, *common_a,
         "-movflags", "+faststart", FHD])
    log("entregas codificadas")


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-count_packets", "-show_entries",
                          "stream=index,codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,"
                          "nb_read_packets,sample_rate,channels,color_space,color_transfer,color_primaries,"
                          "bit_rate:format=duration,size,bit_rate", "-of", "json", path],
                         capture_output=True, text=True).stdout
    return json.loads(out)


def loudness(path):
    """Sonoridad integrada, rango y pico verdadero del audio del archivo (decodificado)."""
    r = subprocess.run(["ffmpeg", "-nostats", "-hide_banner", "-i", path, "-map", "0:a:0",
                        "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    summ = r[r.rfind("Summary:"):]
    get = lambda pat: float(re.search(pat, summ, re.S).group(1))
    return {"integrada_LUFS": get(r"I:\s+(-?[\d.]+) LUFS"), "rango_LU": get(r"LRA:\s+(-?[\d.]+) LU"),
            "pico_verdadero_dBTP": get(r"True peak:.*?Peak:\s+(-?[\d.]+) dBFS")}


def verify(args):
    rep = {}
    for p in [MASTER, UHD, FHD] + list(args.extra or []):
        if not os.path.exists(p):
            continue
        info = probe(p)
        v = [s for s in info["streams"] if s["codec_type"] == "video"][0]
        a = [s for s in info["streams"] if s["codec_type"] == "audio"]
        rep[os.path.basename(p)] = {
            "tamano_MB": round(int(info["format"]["size"]) / 1e6, 1),
            "duracion_s": float(info["format"]["duration"]),
            "video": {k: v.get(k) for k in ("codec_name", "profile", "width", "height", "pix_fmt", "r_frame_rate",
                                            "nb_read_packets", "color_space", "color_transfer", "color_primaries")},
            "audio": ({k: a[0].get(k) for k in ("codec_name", "sample_rate", "channels")} if a else None),
            "sonoridad": loudness(p) if a else None,
        }
        log(f"verificado {os.path.basename(p)}: {json.dumps(rep[os.path.basename(p)], ensure_ascii=False)}")
    out = os.path.join(ROOT, "render", "verificacion.json")
    with open(out, "w") as fh:
        json.dump(rep, fh, indent=2, ensure_ascii=False)
    return rep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["render", "assemble", "verify", "plan"])
    ap.add_argument("--res", default="3840x2160")
    ap.add_argument("--range", default=f"0:{TOTAL}")
    ap.add_argument("--seg", type=int, default=108, help="longitud maxima de segmento (fotogramas)")
    ap.add_argument("--jobs", type=int, default=1)
    ap.add_argument("--lp-threads", type=int, default=0, help="hilos de llvmpipe por proceso")
    ap.add_argument("--samples", type=int, default=4)
    ap.add_argument("--crf", type=int, default=12, help="calidad del intermedio 10 bits")
    ap.add_argument("--preset", default="medium")
    ap.add_argument("--crf-uhd", type=int, default=16)
    ap.add_argument("--crf-fhd", type=int, default=16)
    ap.add_argument("--extra", nargs="*")
    args = ap.parse_args()
    if args.cmd == "plan":
        for s, e in segments(*(int(v) for v in args.range.split(":")), args.seg):
            print(s, e, e - s)
    elif args.cmd == "render":
        render(args)
    elif args.cmd == "assemble":
        assemble(args)
    else:
        verify(args)


if __name__ == "__main__":
    main()
