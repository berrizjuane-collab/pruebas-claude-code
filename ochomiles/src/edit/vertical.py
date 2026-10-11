"""Teaser vertical 9:16 (1080 x 1920) para redes.

Mismos compases, imagen y sonido que el teaser horizontal (teaser.py), pero cada plano se
renderiza de forma nativa en vertical: la camara 3D estrecha su campo hasta equivaler a un
recorte central exacto del plano horizontal (y se desplaza cuando el sujeto no esta
centrado), los mapas se renderizan en horizontal y se recortan o se enmarcan, y todos los
textos se recomponen para la pantalla vertical (no se recorta ningun grafico del master).

Uso: python -m src.edit.vertical [--frames a,b,c --stills dir]
     -> render/final/14_cumbres_teaser_30s_vertical_1080x1920.mp4
"""
import argparse
import math
import os
import time

import cv2
import numpy as np
import skia

from ..render.overlays import AMBER, GLACIER, OBSIDIAN, SLATE_LIGHT, out_cubic, smooth
from ..render.terrain_gl import Camera
from ..render.titles import appear, brand, logo_mark
from ..render.typo import Layer as SkLayer, composite, draw_text, measure, wrap
from . import teaser
from .compose import COLOR_TAGS, Ctx, to_uint8
from .layers import ramp
from .mapseq import MapLayer
from .render_film import OUT_DIR, log, run
from .timeline import FPS, chapter_start

W, H = 1080, 1920
DW, DH = 2160, 3840                       # espacio de diseno de los graficos (4K vertical)
FRAC = (W / H) / (16 / 9)                 # 0,316: ancho del recorte respecto al plano horizontal
OUT = os.path.join(OUT_DIR, "14_cumbres_teaser_30s_vertical_1080x1920.mp4")

# centro del encuadre vertical dentro del plano horizontal (NDC horizontal, -1..1) por plano
REFRAME = {"apertura": [(96, -0.10), (200, -0.16), (312, -0.16)], "campo_base": [(3790, 0.30), (4320, 0.30)]}
# tramos de mapa: "box" = el mapa horizontal entero enmarcado; si no, recorte central
MAP_BOX = [(276, 600)]


def _track(keys, f):
    if isinstance(keys, (int, float)):
        return float(keys)
    xs = [k[0] for k in keys]
    return float(np.interp(f, xs, [k[1] for k in keys]))


def crop_camera(c, shot, f):
    """Camara vertical equivalente a un recorte del plano horizontal centrado en REFRAME."""
    cx = _track(REFRAME.get(shot["id"], 0.0), f)
    t = math.tan(math.radians(c.fov_h) / 2) * FRAC
    s0 = c.shift
    c2 = Camera(c.pos, target=c.target, fov_h=2 * math.degrees(math.atan(t)), roll=c.roll, fwd=c.fwd,
                shift=((s0[0] + cx / 2) / FRAC, s0[1]))
    c2.up = getattr(c, "up", (0.0, 0.0, 1.0))
    for a in ("psi",):
        if hasattr(c, a):
            setattr(c2, a, getattr(c, a))
    return c2


class VCtx(Ctx):
    def __init__(self):
        super().__init__(W, H)
        self.k = W / 3840.0 / FRAC            # densidad equivalente al plano horizontal (grano, halos)
        self._land = None
        self._box = None

    @property
    def sr(self):
        if self._sr is None:
            from .shot3d import ShotRenderer
            self._sr = ShotRenderer(self.W, self.H, samples=self.samples)
            self._sr.cam_mod = crop_camera
        return self._sr

    def land(self, w, h):
        """Contexto horizontal para mapas (comparte renderizador 3D, atlas y fuentes)."""
        key = (w, h)
        if self._land is None:
            self._land = {}
        if key not in self._land:
            lc = Ctx(w, h)
            lc._sr = self.sr
            lc._map = self.mapart
            lc.fonts = self.fonts
            self._land[key] = lc
        return self._land[key]


def render_map(L, ctx, f):
    if any(a <= f <= b for a, b in MAP_BOX):
        lc = ctx.land(1920, 1080)
        im = L.render(lc, f)
        out = np.empty((H, W, 3), np.float32)
        out[:] = np.array(OBSIDIAN, np.float32)
        box = cv2.resize(im, (W, W * 9 // 16), interpolation=cv2.INTER_AREA)
        y0 = (H - box.shape[0]) // 2
        out[y0:y0 + box.shape[0]] = box
        return out
    lc = ctx.land(3840, 2160)
    im = L.render(lc, f)
    cw = int(round(2160 * W / H))
    x0 = (3840 - cw) // 2
    return cv2.resize(im[:, x0:x0 + cw], (W, H), interpolation=cv2.INTER_AREA)


# ------------------------------------------------------------------------------------------
# graficos en vertical (espacio de diseno 2160 x 3840)
# ------------------------------------------------------------------------------------------
def balanced(fonts, text, family, size, max_w):
    """Dos lineas de anchura parecida (sin palabras huerfanas) si el texto no cabe en una."""
    if measure(fonts, text, family, size) <= max_w:
        return [text]
    words = text.split()
    best = None
    for i in range(1, len(words)):
        a, b = " ".join(words[:i]), " ".join(words[i:])
        w = max(measure(fonts, a, family, size), measure(fonts, b, family, size))
        if best is None or w < best[0]:
            best = (w, [a, b])
    return best[1]


def _center(canvas, fonts, text, y, f, t_in, t_out, family, size, color=GLACIER, d_in=18, d_out=16, tracking=0.0,
            halo=0.45):
    a, dy, bl = appear(f, t_in, t_out, d_in, d_out)
    if a <= 0.003:
        return
    draw_text(canvas, fonts, text, DW / 2, y + dy, family, size, color, tracking=tracking, align="center",
              opacity=a, blur=bl, halo=((*OBSIDIAN, halo), size * 0.10) if halo else None)


def titles_v(canvas, fonts, f):
    _center(canvas, fonts, "Hay lugares que cambian", 2860, f, 108, 160, "SerifTextItalic", 74, (*GLACIER, 0.92))
    _center(canvas, fonts, "nuestra forma de mirar.", 2960, f, 110, 160, "SerifTextItalic", 74, (*GLACIER, 0.92))
    a1, dy1, b1 = appear(f, 180, 268, d_in=20, d_out=18)
    a2, dy2, b2 = appear(f, 214, 268, d_in=22, d_out=18)
    if a1 > 0.003:
        draw_text(canvas, fonts, "14 cumbres.", DW / 2, 1240 + dy1, "Title", 230, GLACIER, align="center",
                  opacity=a1, blur=b1, halo=((*OBSIDIAN, 0.35), 18))
    if a2 > 0.003:
        draw_text(canvas, fonts, "Un horizonte", DW / 2, 1440 + dy2, "TitleItalic", 128, (*GLACIER, 0.94),
                  align="center", opacity=a2, blur=b2, halo=((*OBSIDIAN, 0.35), 12))
        draw_text(canvas, fonts, "extraordinario.", DW / 2, 1590 + dy2, "TitleItalic", 128, (*GLACIER, 0.94),
                  align="center", opacity=a2, blur=b2, halo=((*OBSIDIAN, 0.35), 12))


def map_text_v(canvas, fonts, f):
    """Mapa enmarcado: titular arriba y cordilleras abajo (los mismos textos del mapa)."""
    a = ramp(f, 300, 330) * (1 - ramp(f, 560, 590))
    if a <= 0.003:
        return
    top = (DH - DW * 9 // 16) // 2
    draw_text(canvas, fonts, "LOS 14 OCHOMILES", DW / 2, top - 230, "DataSemi", 64, (*GLACIER, 0.96), tracking=64 * 0.30,
              align="center", opacity=a)
    draw_text(canvas, fonts, "Todos por encima de los 8.000 metros", DW / 2, top - 120, "SerifTextItalic", 74,
              (*GLACIER, 0.9), align="center", opacity=a)
    b = DH - top
    draw_text(canvas, fonts, "HIMALAYA  ·  KARAKÓRUM", DW / 2, b + 170, "DataMedium", 48, (*SLATE_LIGHT, 0.95),
              tracking=48 * 0.36, align="center", opacity=a)


def data_block_v(canvas, fonts, peak, k, u, t_in, t_out):
    a_all = min(out_cubic((u - t_in) / 20), 1 - smooth((u - t_out - 8) / 16))
    if a_all <= 0.003:
        return
    # velo inferior a todo el ancho para asegurar la lectura
    p = skia.Paint(AntiAlias=True)
    p.setShader(skia.GradientShader.MakeLinear(
        [skia.Point(0, DH * 0.52), skia.Point(0, DH)],
        [skia.Color4f(*OBSIDIAN, 0.0), skia.Color4f(*OBSIDIAN, 0.62 * a_all)]))
    canvas.drawRect(skia.Rect.MakeXYWH(0, DH * 0.52, DW, DH * 0.48), p)
    x = 150
    lines = balanced(fonts, peak["detail"], "SerifTextItalic", 70, DW - 2 * x)
    y_detail = DH - 300 - (len(lines) - 1) * 92
    y_loc = y_detail - 120
    y_ruler = y_loc - 110
    y_alt = y_ruler - 52
    y_name = y_alt - 170
    y_count = y_name - 220
    a, dy, bl = appear(u, t_in, t_out + 12)
    draw_text(canvas, fonts, f"{k:02d}  /  14", x + 2, y_count + dy, "DataMedium", 44, (*GLACIER, 0.75), tracking=8,
              features={"tnum": True}, opacity=a, blur=bl)
    a, dy, bl = appear(u, t_in + 4, t_out + 9)
    draw_text(canvas, fonts, peak["name"], x - 8, y_name + dy, "Title", 210, GLACIER, opacity=a, blur=bl)
    a, dy, bl = appear(u, t_in + 12, t_out + 6)
    label = peak["altitude_label"].replace(" m", "")
    wnum = draw_text(canvas, fonts, label, x, y_alt + dy, "DataLight", 112, GLACIER, features={"tnum": True},
                     opacity=a, blur=bl)
    draw_text(canvas, fonts, "m", x + wnum + 22, y_alt + dy, "DataLight", 66, (*GLACIER, 0.8), opacity=a, blur=bl)
    if peak.get("altitude_note"):
        draw_text(canvas, fonts, peak["altitude_note"], x + wnum + 100, y_alt + dy - 6, "Data", 36,
                  (*SLATE_LIGHT, 0.95), opacity=a, blur=bl)
    from ..render.overlays import ALTS
    a_r = min(out_cubic((u - (t_in + 16)) / 24), 1 - smooth((u - t_out - 4) / 12))
    if a_r > 0.003:
        L = DW - 2 * x
        grow = out_cubic((u - (t_in + 16)) / 22)
        canvas.drawLine(x, y_ruler, x + L * grow, y_ruler,
                        skia.Paint(AntiAlias=True, Color4f=skia.Color4f(*GLACIER, 0.32 * a_r), StrokeWidth=2.6))
        for i, alt in enumerate(ALTS):
            xx = x + (alt - 8000) / 850 * L
            if xx > x + L * grow + 1:
                continue
            if i == k - 1:
                pp = skia.Paint(AntiAlias=True, Color4f=skia.Color4f(*AMBER, a_r), StrokeWidth=5.0)
                canvas.drawLine(xx, y_ruler - 38, xx, y_ruler + 2, pp)
                canvas.drawCircle(xx, y_ruler - 46, 8.5, skia.Paint(AntiAlias=True, Color4f=skia.Color4f(*AMBER, a_r)))
            else:
                done = i < k - 1
                pp = skia.Paint(AntiAlias=True, Color4f=skia.Color4f(*GLACIER, (0.62 if done else 0.30) * a_r),
                                StrokeWidth=2.6)
                canvas.drawLine(xx, y_ruler - 18, xx, y_ruler, pp)
        draw_text(canvas, fonts, "8.000", x, y_ruler + 50, "Data", 32, (*GLACIER, 0.5), features={"tnum": True},
                  opacity=a_r)
        draw_text(canvas, fonts, "8.850 m", x + L, y_ruler + 50, "Data", 32, (*GLACIER, 0.5),
                  features={"tnum": True}, align="right", opacity=a_r)
    a, dy, bl = appear(u, t_in + 18, t_out + 3)
    loc = f"{peak['location'].upper()}   ·   {peak['range'].upper()}"
    draw_text(canvas, fonts, loc, x + 2, y_loc + dy, "DataMedium", 42, SLATE_LIGHT, tracking=8, opacity=a, blur=bl)
    a, dy, bl = appear(u, t_in + 20, t_out)
    for i, ln in enumerate(lines):
        draw_text(canvas, fonts, ln, x, y_detail + i * 92 + dy, "SerifTextItalic", 70, (*GLACIER, 0.95),
                  opacity=a, blur=bl)


def brand_v(canvas, fonts, f, f0=4032):
    b = brand()
    u = f - f0
    cx = DW / 2
    a = out_cubic(u / 30.0)
    logo_mark(canvas, cx, 1330, 2.1, a, draw_t=u / 40.0)
    a, dy, bl = appear(u, 30, 1000, d_in=24)
    draw_text(canvas, fonts, b["name"], cx, 1700 + dy, "DataSemi", 92, GLACIER, tracking=92 * 0.36, align="center",
              opacity=a, blur=bl)
    a, dy, bl = appear(u, 62, 1000, d_in=26)
    for i, ln in enumerate(balanced(fonts, b["tagline"], "TitleItalic", 92, DW - 300)):
        draw_text(canvas, fonts, ln, cx, 1880 + i * 118 + dy, "TitleItalic", 92, (*GLACIER, 0.92), align="center",
                  opacity=a, blur=bl)
    a, dy, bl = appear(u, 112, 1000, d_in=26)
    if a > 0.003:
        cta = b["cta"].upper()
        wcta = measure(fonts, cta, "DataMedium", 52, tracking=52 * 0.26)
        y = 2290 + dy
        draw_text(canvas, fonts, cta, cx, y, "DataMedium", 52, GLACIER, tracking=52 * 0.26, align="center", opacity=a,
                  blur=bl)
        grow = out_cubic((u - 118) / 30.0)
        canvas.drawLine(cx - wcta / 2 * grow, y + 52, cx + wcta / 2 * grow, y + 52,
                        skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=4.0,
                                   Color4f=skia.Color4f(*AMBER, a)))
    a, dy, bl = appear(u, 150, 1000, d_in=30)
    if a > 0.003:
        y = 3260
        for ln in b["credits"]:
            for sub in wrap(fonts, ln, "Data", 36, DW - 260):
                draw_text(canvas, fonts, sub, cx, y, "Data", 36, (*SLATE_LIGHT, 0.9), align="center", opacity=a,
                          halo=((*OBSIDIAN, 0.55), 7))
                y += 52
            y += 16


def overlays_v(canvas, ctx, f):
    peaks = ctx.peaks_ordered
    if 100 <= f <= 290:
        titles_v(canvas, ctx.fonts, f)
    if 290 <= f <= 600:
        map_text_v(canvas, ctx.fonts, f)
    for k in (13, 14):
        cs = chapter_start(k)
        if cs <= f < cs + 216:
            from .edl import T_IN, T_OUT, TRANSITIONS
            data_block_v(canvas, ctx.fonts, peaks[k - 1], k, f - cs, T_IN.get(TRANSITIONS[k - 1], 16),
                         T_OUT.get(TRANSITIONS[k], 186))
    if f >= 4032:
        brand_v(canvas, ctx.fonts, f)


# ------------------------------------------------------------------------------------------
# composicion
# ------------------------------------------------------------------------------------------
def evaluate_v(edl, ctx, f):
    layers = [L for L in edl.layers if L.start <= f <= L.end]
    ops = [(L, L.opacity(f)) for L in layers]
    ops = [(L, a) for L, a in ops if a > 0.002]
    first = 0
    for i in range(len(ops) - 1, -1, -1):
        L, a = ops[i]
        if a >= 0.999 and L.mask is None:
            first = i
            break
    img = np.zeros((H, W, 3), np.float32)
    for L, a in ops[first:]:
        if isinstance(L, MapLayer):
            im = render_map(L, ctx, f)
        elif getattr(L, "needs_below", False):
            im = L.render_with(ctx, f, img)
        else:
            im = L.render(ctx, f)
        if L.mask is not None:
            m = L.mask(ctx, f) * a
            img = img * (1 - m[..., None]) + im * m[..., None]
        elif a >= 0.999:
            img = im
        else:
            img = img * (1 - a) + im * a
    sk = SkLayer(W, H)
    sk.canvas.scale(W / DW, W / DW)
    overlays_v(sk.canvas, ctx, f)
    img = composite(img, sk.array())
    for post in edl.post:
        if getattr(post, "__name__", "") == "grain":
            # grano algo mas suave: en vertical los 2 px del grano pesan mas en el encuadre
            k0, ctx.k = ctx.k, 0.5
            img = post(ctx, f, img)
            ctx.k = k0
        else:
            img = post(ctx, f, img)
    return img


def frames():
    out = []
    for a, b in teaser.runs(teaser.BARS):
        out += list(range((a - 1) * 72, b * 72))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", default=None)
    ap.add_argument("--stills", default=None)
    args = ap.parse_args()
    from . import edl as edl_mod
    from ..render.macro import MacroOpening
    edl = edl_mod.build()
    ctx = VCtx()
    ctx.cache["macro"] = MacroOpening(W, H, frac=FRAC)
    if args.frames:
        os.makedirs(args.stills, exist_ok=True)
        for f in [int(v) for v in args.frames.split(",")]:
            t0 = time.time()
            img = evaluate_v(edl, ctx, f)
            cv2.imwrite(os.path.join(args.stills, f"v{f:04d}.jpg"), to_uint8(img, f)[..., ::-1],
                        [cv2.IMWRITE_JPEG_QUALITY, 92])
            print(f"f{f} {time.time() - t0:.1f} s", flush=True)
        return
    fl = frames()
    n = len(fl)
    import subprocess
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb48le", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-i", teaser.WAV, "-map", "0:v", "-map", "1:a",
           "-vf", f"fade=t=in:st=0:d=0.25,fade=t=out:st={n / FPS - 0.5}:d=0.5,"
                  "zscale=matrix=709:range=limited:dither=error_diffusion,format=yuv420p",
           "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-maxrate", "24M", "-bufsize", "48M",
           "-profile:v", "high", "-level:v", "4.2", *COLOR_TAGS, "-c:a", "aac", "-b:a", "320k", "-ar", "48000",
           "-movflags", "+faststart", "-shortest", OUT]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    t0 = time.time()
    for i, f in enumerate(fl):
        img = evaluate_v(edl, ctx, f)
        proc.stdin.write((np.clip(img, 0, 1) * 65535.0 + 0.5).astype(np.uint16).tobytes())
        if i % 48 == 0:
            log(f"vertical {i + 1}/{n} f={f} {(time.time() - t0) / (i + 1):.2f} s/fot")
    proc.stdin.close()
    if proc.wait() != 0:
        raise SystemExit("ffmpeg fallo")
    log("teaser vertical listo")


if __name__ == "__main__":
    main()
