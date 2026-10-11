"""Storyboard final: fotogramas reales del render 4K con su descripcion.

Extrae cada vineta de los segmentos ya renderizados (la misma fuente que las entregas),
de modo que el storyboard coincide fotograma a fotograma con el corte final.

Uso: python -m src.edit.storyboard   -> docs/storyboard/*.jpg y docs/storyboard.md
"""
import os
import subprocess

import cv2
import numpy as np

from ..render.region import ROOT
from .render_film import source_args
from .timeline import chapter_start

OUT = os.path.join(ROOT, "docs", "storyboard")
MD = os.path.join(ROOT, "docs", "storyboard.md")
TW, TH = 960, 540


def tc(f):
    return f"{f // 24 // 60:02d}:{f // 24 % 60:02d}+{f % 24:02d}"


# (fotograma, secuencia, imagen, texto en pantalla, sonido)
PANELS = [
    (48, "Apertura", "Macro: la frontal descubre la huella de un crampón de 12 puntas en la costra de nieve.",
     "—", "Viento, paso de crampón, respiración"),
    (130, "Apertura", "Subida en hora azul hacia el Collado Sur del Everest.",
     "Hay lugares que cambian nuestra forma de mirar.", "Dron grave, aire"),
    (240, "Apertura", "Amanecer sobre el horizonte oriental (sol a 98°).",
     "14 cumbres. / Un horizonte extraordinario.", "Golpe con el sol (f 180), entra re menor"),
    (340, "Mapa", "Asia en proyección cónica de Lambert con relieve sombreado y topónimos.", "Topónimos",
     "Aparece el pulso"),
    (430, "Mapa", "Zoom al arco: los 14 marcadores ya encendidos, rótulos de cordillera.",
     "Nombres y altitudes", "Arpegio de 14 notas (c. 6)"),
    (520, "Mapa", "Recuadros del Baltoro y del Mahalangur, leyenda; los 14 puntos visibles 5,8 s.",
     "LOS 14 OCHOMILES · Todos por encima de los 8.000 metros", ""),
] + [
    (chapter_start(k) + 110, f"Capítulo {k:02d}", desc, txt, snd) for k, desc, txt, snd in [
        (1, "Shishapangma desde la meseta tibetana, sol bajo del este.", "01 / 14 · Shishapangma · 8.027 m",
         "Golpe de membrana, motivo"),
        (2, "Gasherbrum II: la cámara alza la vista desde el glaciar.", "02 / 14 · Gasherbrum II · 8.034 m", ""),
        (3, "Broad Peak: travelling a lo largo de la cresta cimera.", "03 / 14 · Broad Peak · 8.051 m", ""),
        (4, "Gasherbrum I aparece tras las cumbres del Baltoro.", "04 / 14 · Gasherbrum I · 8.080 m", ""),
        (5, "Annapurna I: la pared sur con luz rasante de primera hora.", "05 / 14 · Annapurna I · 8.091 m", ""),
        (6, "Nanga Parbat: la cara Rupal, de la base a la cima.", "06 / 14 · Nanga Parbat · 8.125 m", ""),
        (7, "Manaslu a contraluz sobre un mar de nubes.", "07 / 14 · Manaslu · 8.163 m", "Crece la densidad"),
        (8, "Dhaulagiri I en órbita lenta.", "08 / 14 · Dhaulagiri I · 8.167 m", ""),
        (9, "Cho Oyu: encuadre amplio, el respiro del ritmo.", "09 / 14 · Cho Oyu · 8.188 m", "Cristal, sin golpe"),
        (10, "Makalu: pirámide de cuatro caras, luz y sombra.", "10 / 14 · Makalu · 8.485 m", ""),
        (11, "Lhotse desde el este, con el Everest detrás.", "11 / 14 · Lhotse · 8.516 m", ""),
        (12, "Kangchenjunga con luz dorada y nieblas en los valles.", "12 / 14 · Kangchenjunga · 8.586 m", ""),
        (13, "K2 sale del negro con luz de ocaso.", "13 / 14 · K2 · 8.611 m", "Repliegue y golpe (c. 45)"),
        (14, "Everest en alpenglow: la cámara sube y revela.", "14 / 14 · Everest · 8.848,86 m", "Re mayor (c. 48)"),
    ]
] + [
    (790, "Transición", "Salto por el mapa entre Shishapangma y Gasherbrum II.", "—", "Silbido de subida y bajada"),
    (1008, "Transición", "Cortinilla de nube entre Gasherbrum II y Broad Peak.", "—", "Soplo"),
    (2304, "Transición", "Ventisca entre Dhaulagiri I y Cho Oyu.", "—", "Siseo de nieve"),
    (3390, "Transición", "Gran salto sobre el mapa, del Karakórum al Khumbu.", "—", "Subida, platillo invertido"),
    (3700, "Síntesis", "Mapa final: los 14 puntos en ámbar unidos por el recorrido editorial.",
     "Recorrido editorial · orden ascendente de altitud, no una ruta / Cada una exige preparación, paciencia y respeto.",
     "Resolución en re mayor"),
    (3880, "Síntesis", "Campo base sur del Everest al atardecer.", "La ambición nos lleva arriba.", "Viento suave"),
    (3990, "Síntesis", "Se encienden las luces de tienda (ilustrativas) bajo el alpenglow.",
     "La ambición nos lleva arriba. / El criterio nos trae de vuelta.", ""),
    (4250, "Firma", "Marca provisional, nombre, lema y llamada a la acción; créditos de datos.",
     "NOMBRE DE LA EMPRESA · Tu próxima expedición empieza mucho antes de la cumbre. · PLANIFICA TU PRÓXIMA EXPEDICIÓN",
     "Golpe (c. 57), final en re mayor"),
]
PANELS.sort(key=lambda p: p[0])


def extract():
    os.makedirs(OUT, exist_ok=True)
    frames = sorted(set(p[0] for p in PANELS))
    sel = "+".join(f"eq(n\\,{f})" for f in frames)
    raw = subprocess.run(["ffmpeg", "-v", "error", *source_args(), "-vf",
                          f"select='{sel}',zscale=w={TW}:h={TH}:filter=lanczos:matrixin=709:rangein=limited:dither=error_diffusion,"
                          "format=bgr24",
                          "-vsync", "0", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    imgs = np.frombuffer(raw, np.uint8).reshape(-1, TH, TW, 3)
    assert len(imgs) == len(frames), (len(imgs), len(frames))
    names = {}
    for f, im in zip(frames, imgs):
        name = f"sb_{f:04d}.jpg"
        cv2.imwrite(os.path.join(OUT, name), im, [cv2.IMWRITE_JPEG_QUALITY, 86])
        names[f] = (name, im)
    # hoja resumen: todas las vinetas en orden
    cols, tw, th = 7, 480, 270
    rows = (len(PANELS) + cols - 1) // cols
    sheet = np.full((rows * (th + 26), cols * tw, 3), 11, np.uint8)
    for i, (f, *_rest) in enumerate(PANELS):
        r, c = divmod(i, cols)
        sheet[r * (th + 26):r * (th + 26) + th, c * tw:(c + 1) * tw] = cv2.resize(names[f][1], (tw, th),
                                                                                interpolation=cv2.INTER_AREA)
        cv2.putText(sheet, f"{i + 1:02d}  {tc(f)}", (c * tw + 6, r * (th + 26) + th + 18), cv2.FONT_HERSHEY_SIMPLEX,
                    0.5, (225, 230, 228), 1, cv2.LINE_AA)
    cv2.imwrite(os.path.join(OUT, "hoja_resumen.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return names


def write_md(names):
    lines = ["# Storyboard final", "",
             "Fotogramas reales del render 4K, reducidos a 960 × 540. Cada viñeta corresponde exactamente al",
             "corte final; los tiempos detallados están en [guion.md](guion.md).", "",
             "![Hoja resumen](storyboard/hoja_resumen.jpg)", ""]
    sec = None
    for i, (f, seq, img, txt, snd) in enumerate(PANELS):
        group = ("Apertura" if f < 288 else "Mapa regional" if f < 576 else "Las 14 cumbres" if f < 3600
                 else "Síntesis" if f < 4032 else "Firma")
        if group != sec:
            lines += ["", f"## {group}", ""]
            sec = group
        lines += [f"### {i + 1:02d} · {tc(f)} · f {f} · {seq}", "",
                  f"![{seq}, fotograma {f}](storyboard/{names[f][0]})", "",
                  f"- **Imagen:** {img}",
                  f"- **Texto en pantalla:** {txt}" if txt and txt != "—" else "- **Texto en pantalla:** ninguno"]
        if snd:
            lines.append(f"- **Sonido:** {snd}")
        lines.append("")
    with open(MD, "w") as fh:
        fh.write("\n".join(lines))


def main():
    write_md(extract())
    print(f"{len(PANELS)} viñetas -> {OUT}")


if __name__ == "__main__":
    main()
