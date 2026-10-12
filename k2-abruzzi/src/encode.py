"""Encode the composed frames + final mix into the deliverables.

  output/K2_Espolon_de_los_Abruzos.mp4               H.264 1080p24, AAC 48 kHz, soft Spanish subtitle track
  output/K2_Espolon_de_los_Abruzos_subtitulado.mp4   same picture with burned-in subtitles
  output/K2_Espolon_de_los_Abruzos.srt               subtitles (UTF-8)
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.normpath(os.path.join(HERE, '..', 'output'))
FRAMES = '/home/user/k2data/final/%05d.png'
MIX = '/home/user/k2data/audio/final_mix.wav'
ASS = '/home/user/k2data/audio/subs.ass'
NAME = 'K2_Espolon_de_los_Abruzos'
CRF = os.environ.get('CRF', '18')


def run(cmd):
    print(' '.join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    srt = f'{OUTDIR}/{NAME}.srt'
    common_v = ['-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-pix_fmt', 'yuv420p', '-profile:v', 'high',
                '-level', '4.1', '-tune', 'film', '-x264-params', 'aq-mode=3:aq-strength=0.9:deblock=-1,-1',
                '-movflags', '+faststart']
    common_a = ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000']
    meta = ['-metadata', 'title=K2 · Espolón de los Abruzos', '-metadata', 'language=spa',
            '-metadata', 'comment=Animación pictórica 2D sobre terreno real (Copernicus GLO-30)']
    # 1) clean picture + soft subtitles
    run(['ffmpeg', '-y', '-framerate', '24', '-i', FRAMES, '-i', MIX, '-i', srt,
         '-map', '0:v', '-map', '1:a', '-map', '2:s', *common_v, *common_a, '-c:s', 'mov_text',
         '-metadata:s:s:0', 'language=spa', '-metadata:s:s:0', 'title=Español', '-metadata:s:a:0', 'language=spa',
         '-shortest', *meta, f'{OUTDIR}/{NAME}.mp4'])
    # 2) burned-in subtitles (libass, Inter Medium)
    ass = ASS.replace(':', '\\:')
    run(['ffmpeg', '-y', '-framerate', '24', '-i', FRAMES, '-i', MIX,
         '-vf', f"subtitles='{ass}':fontsdir=/home/user/k2data/fonts", '-map', '0:v', '-map', '1:a',
         *common_v, *common_a, '-shortest', *meta, f'{OUTDIR}/{NAME}_subtitulado.mp4'])


if __name__ == '__main__':
    main()
