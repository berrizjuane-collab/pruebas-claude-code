"""Partitura original: 60 compases a 80 BPM en 4/4 (180 s). Re menor -> Re mayor en el Everest.

Arco:  1-4 aire y tension contenida (titulo en c.3 t.3 = 7,5 s)
       5-8 mapa: aparece el pulso; arpegio de 14 notas al encenderse los 14 puntos
       9-26 motivo principal y descubrimiento (capitulos 1-6)
       27-44 densidad y energia (capitulos 7-12; respiro en Cho Oyu, c.33-35)
       45-50 K2 (tension, tras un silencio) y Everest (Re mayor, culminacion)
       51-60 resolucion: sintesis, campo base y firma
Motivo: quinta ascendente y descenso por grados (D-A ... G-F-E): subir y volver con criterio.

Los instrumentos muestreados se interpretan con fluidsynth y MuseScore_General_Full.sf3
(licencia MIT); el resto se sintetiza en synth.py.
"""
import os
import subprocess

import mido
import numpy as np

BPM = 80
BEAT = 60.0 / BPM          # 0,75 s
BAR = 4 * BEAT             # 3 s
SF = "/usr/share/sounds/sf3/MuseScore_General_Full.sf3"


def tb(bar, beat=1.0):
    """Segundo en que cae el pulso 'beat' (1..4.x) del compas 'bar' (1..60)."""
    return (bar - 1) * BAR + (beat - 1) * BEAT


# ------------------------------------------------------------------------------------------
# armonia (acorde por compas) y voicings
# ------------------------------------------------------------------------------------------
V = {   # bajo, voces de cuerda (registro medio), nombre
    "Dm9": (38, [50, 57, 64, 65, 69]),
    "Bb9": (34, [46, 53, 60, 62, 65]),
    "F9": (41, [53, 60, 67, 69, 72]),
    "C9": (36, [48, 55, 62, 64, 67]),
    "Gm9": (43, [55, 62, 69, 70, 74]),
    "Asus": (33, [45, 52, 62, 64, 69]),
    "A": (33, [45, 52, 61, 64, 69]),
    "Ebmaj": (39, [46, 55, 62, 67, 70]),
    "A7b9": (33, [45, 55, 61, 64, 70]),
    "D": (38, [50, 57, 66, 69, 74, 76]),
    "G/D": (38, [55, 59, 62, 67, 71]),
    "Bm": (35, [47, 54, 62, 66, 71]),
    "G": (31, [43, 55, 59, 62, 67, 71]),
    "D/F#": (42, [57, 62, 66, 69, 74]),
    "Em": (40, [52, 59, 64, 67, 71]),
    "Asus2": (33, [45, 52, 59, 64, 69]),
    "Dadd9": (38, [50, 57, 64, 66, 69, 74]),
}

HARM = {}
for b in (3, 4, 5):
    HARM[b] = "Dm9"
HARM.update({6: "Bb9", 7: "F9", 8: "C9",
             9: "Dm9", 10: "Dm9", 11: "Bb9", 12: "F9", 13: "F9", 14: "C9", 15: "Bb9", 16: "F9", 17: "C9",
             18: "Dm9", 19: "Dm9", 20: "Asus", 21: "Dm9", 22: "Dm9", 23: "C9", 24: "Gm9", 25: "Gm9", 26: "A",
             27: "Bb9", 28: "Bb9", 29: "C9", 30: "Dm9", 31: "Dm9", 32: "F9", 33: "F9", 34: "F9", 35: "C9",
             36: "Dm9", 37: "Dm9", 38: "Bb9", 39: "Gm9", 40: "Gm9", 41: "A", 42: "Bb9", 43: "Gm9", 44: "Asus",
             45: "Dm9", 46: "Bb9", 47: "A7b9", 48: "D", 49: "D", 50: "G/D",
             51: "Bm", 52: "G", 53: "D/F#", 54: "Em", 55: "G", 56: "Asus2",
             57: "Dadd9", 58: "Dadd9", 59: "G/D", 60: "Dadd9"})


# ------------------------------------------------------------------------------------------
# motivos
# ------------------------------------------------------------------------------------------
MOTIF_A = [(1, 1.5, 0), (2.5, 2.5, 7), (5, 1, 5), (6, 1, 3), (7, 2, 2)]       # D A | G F E (relativo a D)
MOTIF_A2 = [(1, 1.5, 0), (2.5, 1.5, 7), (4, 1, 10), (5, 2, 8), (7, 2, 7)]     # D A C | Bb A
MOTIF_B = [(1, 1, 3), (2, 1, 5), (3, 2, 7), (5, 1, 10), (6, 1, 8), (7, 2, 7)]  # F G A | C Bb A
MOTIF_MAJ = [(1, 1.5, 0), (2.5, 2.5, 7), (5, 1, 5), (6, 1, 4), (7, 2, 2)]     # D A | G F# E


def motif(bar0, base, shape, vel=80, legato=0.98):
    """Notas (t, dur, nota, vel) de un motivo de 2 compases (pulsos 1..8) desde el compas bar0."""
    out = []
    for beat, dur, iv in shape:
        bb = bar0 + (beat - 1) // 4
        bt = (beat - 1) % 4 + 1
        out.append((tb(bb, bt), dur * BEAT * legato, base + iv, vel))
    return out


# ------------------------------------------------------------------------------------------
# construccion de pistas
# ------------------------------------------------------------------------------------------
class Track:
    def __init__(self, name, program, channel, cc_vol=100):
        self.name, self.program, self.channel, self.cc_vol = name, program, channel, cc_vol
        self.notes = []          # (t, dur, nota, vel)
        self.expr = []           # (t, 0..127) CC11

    def add(self, t, dur, note, vel):
        self.notes.append((float(t), float(dur), int(note), int(np.clip(vel, 1, 127))))

    def chord(self, t, dur, notes, vel):
        for n in notes:
            self.add(t, dur, n, vel)


def expr_curve(points):
    return sorted(points)


def build():
    T = {}

    def tr(name, prog, ch, vol=100):
        T[name] = Track(name, prog, ch, vol)
        return T[name]

    pad = tr("cuerdas", 49, 0, 110)        # String Ensemble 2 (acordes sostenidos)
    low = tr("graves", 49, 1, 110)         # cuerdas graves (bajo de cada acorde)
    mel = tr("violines", 48, 2, 105)       # melodia en cuerdas
    ost = tr("ostinato", 48, 3, 96)        # ostinato de cuerdas en semicorcheas
    pno = tr("piano", 0, 4, 100)
    harp = tr("arpa", 46, 5, 100)
    cel = tr("celesta", 8, 6, 90)
    hrn = tr("trompas", 60, 7, 100)
    cho = tr("coro", 52, 8, 95)
    tim = tr("timbales", 47, 10, 110)
    trem = tr("tremolo", 44, 11, 100)
    cb = tr("contrabajos", 43, 12, 105)

    # ---- acordes sostenidos (cuerdas) y bajos, con dinamica por compas ----
    dyn = {}   # compas -> velocidad base de las cuerdas
    for b in range(3, 61):
        if b <= 4:
            d = 58
        elif b <= 8:
            d = 52 + (b - 5) * 5
        elif b <= 26:
            d = 68
        elif b <= 32:
            d = 70
        elif b <= 35:
            d = 56          # Cho Oyu: respiro
        elif b <= 44:
            d = 74 + (b - 36) * 2
        elif b <= 47:
            d = 84
        elif b <= 50:
            d = 100
        elif b <= 56:
            d = 68
        else:
            d = 64
        dyn[b] = d
    b = 3
    while b <= 60:
        name = HARM[b]
        e = b
        while e + 1 <= 60 and HARM.get(e + 1) == name and e + 1 not in (9, 21, 27, 33, 36, 42, 45, 48, 51, 57):
            e += 1
        t0 = tb(3, 3) if b == 3 else tb(b)
        t1 = tb(e + 1)
        if b == 44:
            t1 = tb(44, 4.0)          # corte seco antes del silencio del K2
        if e == 60:
            t1 = tb(60, 3.2)
        bass, voices = V[name]
        pad.chord(t0, t1 - t0 + (0.25 if e < 60 else 0), voices, dyn[b])
        if b >= 5 or b == 3:
            low.chord(t0, t1 - t0 + 0.25, [bass + 12] if bass < 40 else [bass], dyn[b] - 4)
        b = e + 1

    # expresion (CC11) de las cuerdas: crescendos dentro de cada seccion
    pad.expr = expr_curve([(0, 40), (tb(3, 3), 40), (tb(4, 1), 80), (tb(5), 70), (tb(8, 4), 96), (tb(9), 92),
                           (tb(26, 4), 102), (tb(27), 92), (tb(32, 4), 104), (tb(33), 76), (tb(35, 4), 84),
                           (tb(36), 96), (tb(44, 3), 127), (tb(44, 4), 120), (tb(45), 92), (tb(47, 4), 127),
                           (tb(48), 127), (tb(50, 4), 118), (tb(51), 84), (tb(56, 4), 92), (tb(57), 96),
                           (tb(60, 2), 70), (tb(60, 4), 0)])
    low.expr = pad.expr

    # ---- pulso: piano en corcheas (mapa y capitulos 1-6), pizzicato suave despues ----
    for b in range(5, 27):
        if b in (9,):
            pass
        bass, voices = V[HARM[b]]
        root = voices[0]
        pattern = [root, root + 7, root + 14, root + 7, root + 12, root + 7, root + 14, root + 19]
        for i, n in enumerate(pattern):
            vel = (34 + (b - 5) * 4 if b <= 8 else 46) + (8 if i % 4 == 0 else 0)
            pno.add(tb(b, 1 + i * 0.5), BEAT * 0.45, n, vel)

    # ---- arpegio de los 14 puntos (mapa, c.6 t.2): tresillos de semicorchea, 14 notas ----
    arp = [62, 64, 65, 69, 72, 74, 76, 77, 81, 84, 86, 88, 89, 93]   # Re dorico ascendente
    for i, n in enumerate(arp):
        t = tb(6, 2) + i * BEAT / 6
        harp.add(t, 1.6, n - 12, 64 + i)
        cel.add(t, 1.2, n, 50 + i)

    # ---- sintesis: los 14 puntos se encienden (c.51 t.2): arpegio en Re mayor ----
    arp_maj = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 88, 90, 93]
    for i, n in enumerate(arp_maj):
        t = tb(51, 2) + i * BEAT / 6
        harp.add(t, 1.8, n - 12, 58 + i)
        cel.add(t, 1.4, n, 46 + i)

    # ---- melodias ----
    for n in motif(9, 62, MOTIF_A, 82):                       # cap. 1 piano
        pno.add(*n)
    for n in motif(12, 62, MOTIF_A2, 84):                     # cap. 2 piano
        pno.add(*n)
    for n in motif(15, 74, MOTIF_B, 70):                      # cap. 3 violines
        mel.add(*n)
    for n in motif(15, 62, MOTIF_B, 56):
        pno.add(*n)
    for n in motif(18, 74, MOTIF_A, 76):                      # cap. 4 violines (octava alta)
        mel.add(*n)
    for n in motif(21, 62, MOTIF_A, 74):                      # cap. 5 trompas + violines
        hrn.add(*n)
    for n in motif(21, 74, MOTIF_A, 70):
        mel.add(*n)
    for n in motif(24, 50, MOTIF_A, 80):                      # cap. 6 graves (verticalidad)
        low.add(*n)
        cb.add(n[0], n[1], n[2] - 12, n[3])
    for n in motif(27, 74, MOTIF_B, 78):                      # cap. 7
        mel.add(*n)
    for n in motif(30, 74, MOTIF_A2, 80):                     # cap. 8 trompas + violines
        mel.add(*n)
    for n in motif(30, 62, MOTIF_A2, 76):
        hrn.add(*n)
    for n in motif(33, 74, MOTIF_A, 58):                      # cap. 9 (Cho Oyu) piano solo, aire
        pno.add(*n)
    for n in motif(36, 74, MOTIF_A, 86):                      # cap. 10 tutti
        mel.add(*n)
    for n in motif(36, 62, MOTIF_A, 82):
        hrn.add(*n)
    for n in motif(39, 74, MOTIF_B, 84):                      # cap. 11
        mel.add(*n)
    for n in motif(42, 62, MOTIF_A2, 82):                     # cap. 12 coro + trompas (solemne)
        hrn.add(*n)
        cho.add(n[0], n[1] * 1.05, n[2] + 12, n[3] - 6)
    for n in motif(48, 74, MOTIF_MAJ, 104):                   # cap. 14 Everest: Re mayor
        mel.add(*n)
    for n in motif(48, 62, MOTIF_MAJ, 100):
        hrn.add(*n)
    for n in motif(48, 74, MOTIF_MAJ, 84):
        cho.add(n[0], n[1] * 1.05, n[2], n[3])
    mel.add(tb(50), BAR * 0.98, 86, 108)                     # cima: Re6
    hrn.add(tb(50), BAR * 0.98, 74, 100)
    for n in motif(51, 74, MOTIF_MAJ, 62):                    # sintesis: piano en Re mayor
        pno.add(*n)
    for n in motif(54, 74, [(1, 2, 0), (3, 2, 7), (5, 2, 5), (7, 2, 4)], 58):
        pno.add(*n)
    pno.add(tb(57, 1), BEAT * 3, 74, 66)                      # firma: Re - La
    pno.add(tb(57, 4), BEAT * 5, 81, 60)
    pno.add(tb(59, 1), BEAT * 7, 78, 52)

    # ---- ostinato de cuerdas (densidad, c.27-44 salvo Cho Oyu; y Everest) ----
    for b in list(range(27, 33)) + list(range(36, 44)) + [44] + list(range(48, 51)):
        bass, voices = V[HARM[b]]
        r = voices[0] + 12
        cells = [r, r + 7, r + 12, r + 7]
        for i in range(16 if b != 44 else 12):
            vel = 50 + (b - 27) + (10 if i % 4 == 0 else 0)
            if b >= 48:
                vel = 74 + (12 if i % 4 == 0 else 0)
            ost.add(tb(b, 1 + i * 0.25), BEAT * 0.22, cells[i % 4], vel)

    # ---- K2: tremolo y trompas en golpes (c.45-47) ----
    for b in (45, 46, 47):
        bass, voices = V[HARM[b]]
        trem.chord(tb(b), BAR, [v + 12 for v in voices[1:4]], 70 + (b - 45) * 8)
        for beat in (1, 3.5):
            hrn.chord(tb(b, beat), BEAT * 0.6, [voices[0], voices[1]], 92)

    # ---- timbales: redobles al final de algunos capitulos y golpes ----
    for b in (8, 20, 26, 32, 41, 44):
        for i in range(12):
            tim.add(tb(b, 3) + i * BEAT / 6, 0.2, 38 if HARM[b] in ("Dm9",) else 33 + 12, 40 + i * 5)
    for t in (tb(3, 3), tb(45), tb(48)):
        tim.add(t, 1.5, 38, 120)
    for b in range(48, 51):
        for beat in (1, 3):
            tim.add(tb(b, beat), 1.0, 38 if beat == 1 else 45, 100)

    # ---- coro (pads) en la culminacion y la firma ----
    for b, name in ((48, "D"), (49, "D"), (50, "G/D")):
        cho.chord(tb(b), BAR, [v + 12 for v in V[name][1][1:4]], 70)
    cho.expr = expr_curve([(0, 100), (tb(57), 100)])

    # ---- contrabajos: pedal en la culminacion y la firma ----
    cb.add(tb(48), BAR * 3, 38, 96)
    cb.add(tb(57), BAR * 3.3, 38, 70)
    return T


# ------------------------------------------------------------------------------------------
# render con fluidsynth (una pista por fichero: mezcla y reverb propias)
# ------------------------------------------------------------------------------------------
def to_midi(track, path):
    mid = mido.MidiFile(ticks_per_beat=960)
    meta = mido.MidiTrack()
    meta.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(BPM), time=0))
    mid.tracks.append(meta)
    t = mido.MidiTrack()
    mid.tracks.append(t)
    ch = track.channel
    ev = [(0.0, 0, mido.Message("program_change", program=track.program, channel=ch))]
    ev.append((0.0, 0, mido.Message("control_change", control=7, value=track.cc_vol, channel=ch)))
    ev.append((0.0, 0, mido.Message("control_change", control=91, value=0, channel=ch)))
    ev.append((0.0, 0, mido.Message("control_change", control=93, value=0, channel=ch)))
    if track.expr:
        pts = track.expr
        ts = np.arange(0, pts[-1][0] + 0.05, 0.05)
        vals = np.interp(ts, [p[0] for p in pts], [p[1] for p in pts])
        last = None
        for tt, v in zip(ts, vals):
            vi = int(round(v))
            if vi != last:
                ev.append((tt, 1, mido.Message("control_change", control=11, value=vi, channel=ch)))
                last = vi
    else:
        ev.append((0.0, 1, mido.Message("control_change", control=11, value=110, channel=ch)))
    for (st, dur, n, v) in track.notes:
        ev.append((st, 3, mido.Message("note_on", note=n, velocity=v, channel=ch)))
        ev.append((st + dur, 2, mido.Message("note_off", note=n, velocity=0, channel=ch)))
    ev.sort(key=lambda e: (e[0], e[1]))
    last_tick = 0
    for tt, _, msg in ev:
        tick = int(round(tt / BEAT * 960))
        msg.time = max(tick - last_tick, 0)
        last_tick = max(tick, last_tick)
        t.append(msg)
    mid.save(path)


def render_stems(outdir, sr=48000):
    os.makedirs(outdir, exist_ok=True)
    T = build()
    paths = {}
    for name, track in T.items():
        if not track.notes:
            continue
        mp = os.path.join(outdir, f"{name}.mid")
        wp = os.path.join(outdir, f"{name}.wav")
        to_midi(track, mp)
        subprocess.run(["fluidsynth", "-ni", "-g", "0.5", "-R", "0", "-C", "0", "-r", str(sr),
                        "-o", "audio.file.format=float", "-F", wp, SF, mp],
                       check=True, capture_output=True)
        paths[name] = wp
    return paths
