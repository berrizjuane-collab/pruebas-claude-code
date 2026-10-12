"""Encode the composed frames + final mix into the deliverables.

  output/K2_Espolon_de_los_Abruzos.mp4                       1080p24 H.264 (2-pass ~10 Mbps), AAC 48 kHz,
                                                              soft Spanish subtitle track
  output/K2_Espolon_de_los_Abruzos_subtitulado.mp4           same picture with burned-in subtitles
  output/alta_calidad/K2_Espolon_de_los_Abruzos_master.mp4   1080p24 H.264 CRF 15 (Git LFS)
  output/K2_Espolon_de_los_Abruzos.srt                       subtitles (UTF-8)
"""
import os
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.normpath(os.path.join(HERE, '..', 'output'))
FRAMES = '/home/user/k2data/final/%05d.png'
MIX = '/home/user/k2data/audio/final_mix.wav'
ASS = '/home/user/k2data/audio/subs.ass'
NAME = 'K2_Espolon_de_los_Abruzos'
WEB_KBPS = int(os.environ.get('WEB_KBPS', '9800'))


def run(cmd):
    print(' '.join(cmd), flush=True)
    subprocess.run(cmd, check=True)


X264 = ['-c:v', 'libx264', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1',
        '-tune', 'film', '-x264-params', 'aq-mode=3:aq-strength=0.9:deblock=-1,-1']
AAC = ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000']
META = ['-metadata', 'title=K2 · Espolón de los Abruzos', '-metadata', 'language=spa',
        '-metadata', 'comment=Animación pictórica 2D sobre terreno real (Copernicus GLO-30)']


def two_pass(vf, extra_in, maps, out, extra_out=()):
    log = os.path.join(tempfile.gettempdir(), 'k2_x264pass')
    base = ['ffmpeg', '-y', '-framerate', '24', '-i', FRAMES]
    vfa = ['-vf', vf] if vf else []
    run(base + vfa + ['-map', '0:v', *X264, '-b:v', f'{WEB_KBPS}k', '-maxrate', f'{int(WEB_KBPS * 1.6)}k',
                      '-bufsize', f'{WEB_KBPS * 3}k', '-pass', '1', '-passlogfile', log, '-an', '-f', 'mp4',
                      os.devnull])
    run(base + list(extra_in) + vfa + list(maps) + X264 +
        ['-b:v', f'{WEB_KBPS}k', '-maxrate', f'{int(WEB_KBPS * 1.6)}k', '-bufsize', f'{WEB_KBPS * 3}k',
         '-pass', '2', '-passlogfile', log] + AAC + list(extra_out) + ['-shortest', '-movflags', '+faststart'] +
        META + [out])


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    os.makedirs(f'{OUTDIR}/alta_calidad', exist_ok=True)
    srt = f'{OUTDIR}/{NAME}.srt'
    # 1) web version: clean picture + soft subtitles
    two_pass(None, ['-i', MIX, '-i', srt], ['-map', '0:v', '-map', '1:a', '-map', '2:s'], f'{OUTDIR}/{NAME}.mp4',
             ['-c:s', 'mov_text', '-metadata:s:s:0', 'language=spa', '-metadata:s:s:0', 'title=Español',
              '-metadata:s:a:0', 'language=spa'])
    # 2) web version with burned-in subtitles (libass, Inter Medium)
    ass = ASS.replace(':', '\\:')
    two_pass(f"subtitles='{ass}':fontsdir=/home/user/k2data/fonts", ['-i', MIX], ['-map', '0:v', '-map', '1:a'],
             f'{OUTDIR}/{NAME}_subtitulado.mp4')
    # 3) high-quality master (Git LFS)
    run(['ffmpeg', '-y', '-framerate', '24', '-i', FRAMES, '-i', MIX, '-i', srt, '-map', '0:v', '-map', '1:a',
         '-map', '2:s', *X264, '-crf', '15', *AAC, '-c:s', 'mov_text', '-metadata:s:s:0', 'language=spa',
         '-shortest', '-movflags', '+faststart', *META, f'{OUTDIR}/alta_calidad/{NAME}_master.mp4'])


if __name__ == '__main__':
    main()
