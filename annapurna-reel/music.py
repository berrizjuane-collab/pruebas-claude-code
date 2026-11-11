"""Banda sonora original del reel: partitura MIDI (orquesta muestreada vía FluidSynth)
+ diseño sonoro sintetizado (viento, impactos, risers) + mezcla con la narración.

  intriga (re menor) -> búsqueda (pizzicatos) -> urgencia (ostinato + monzón)
  -> ataque a cumbre -> GLORIA (re mayor, compás 16 exacto = 48,0 s)
  -> el precio (corte seco, frío) -> epílogo (piano, re mayor)
"""
import json, subprocess, sys, os
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
BPM = 80
BEAT = 60 / BPM                       # 0,75 s ; compás 4/4 = 3 s
OUT = sys.argv[1] if len(sys.argv) > 1 else "audio"
VO_DIR = sys.argv[2] if len(sys.argv) > 2 else "audio/vo"
SF2 = "/usr/share/sounds/sf2/FluidR3_GM.sf2"
TL = json.load(open("audio/timeline.json"))
DUR = TL["dur"]
W = {v["id"]: [w["t"] for w in v["words"]] for v in TL["vo"]}
WE = {v["id"]: [w["t"] + w["d"] for w in v["words"]] for v in TL["vo"]}
b = lambda t: t / BEAT                # segundos -> pulsos

NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
def P(n):
    if isinstance(n, int): return n
    k = NAMES[n[0]]; r = n[1:]
    if r[0] == "#": k += 1; r = r[1:]
    elif r[0] == "b": k -= 1; r = r[1:]
    return 12 * (int(r) + 1) + k

# canales / programas GM
PIANO, STR, SLOW, TREM, PIZZ, HARP, TIMP, HORN, BRASS, DRUM, CHOIR, CELLO, BASS, CEL, BELL, VLN = range(16)
PROG = {PIANO: 0, STR: 48, SLOW: 49, TREM: 44, PIZZ: 45, HARP: 46, TIMP: 47, HORN: 60, BRASS: 61, DRUM: 48, CHOIR: 52, CELLO: 42, BASS: 43, CEL: 8, BELL: 14, VLN: 48}
VOL = {PIANO: 112, STR: 100, SLOW: 100, TREM: 86, PIZZ: 104, HARP: 100, TIMP: 112, HORN: 104, BRASS: 88, DRUM: 108, CHOIR: 84, CELLO: 104, BASS: 108, CEL: 92, BELL: 84, VLN: 96}
notes, ccs = [], []
def n(ch, beat, dur, pitch, vel): notes.append((ch, float(beat), float(dur), P(pitch), int(max(1, min(127, vel)))))
def ch_(ch, beat, dur, pitches, vel, roll=0.0):
    for i, p in enumerate(pitches): n(ch, beat + i * roll, dur - i * roll, p, vel)
def ramp(ch, b0, b1, v0, v1, cc=11, steps=24):
    for i in range(steps + 1): ccs.append((ch, b0 + (b1 - b0) * i / steps, cc, int(round(v0 + (v1 - v0) * i / steps))))
def setcc(ch, beat, val, cc=11): ccs.append((ch, beat, cc, val))

# ============================ A · 1950 (0 – 9,6 s) ============================
n(BASS, 0, 12.6, "D2", 58); n(CELLO, 1.5, 11, "A2", 44)
ramp(SLOW, 0, 5, 50, 100); ch_(SLOW, .5, 7.6, ["D3", "A3", "F4"], 50); ch_(SLOW, 8, 4.7, ["D3", "Bb3", "F4"], 54)
for bt, p, v in [(1, "A4", 62), (2.5, "D5", 66), (4, "F5", 70), (6, "E5", 60)]: n(PIANO, bt, 3, p, v)   # motivo "Annapurna"
t14 = b(W["s1"][7] - .12)
for i, p in enumerate(["D4", "F4", "G4", "A4", "C5", "D5", "F5", "G5", "A5", "C6", "D6", "F6", "G6", "A6"]): n(HARP, t14 + i * .055 / BEAT, 1.2, p, 46 + i * 2)  # 14 cimas
tNo = b(W["s1"][16])
ch_(PIANO, tNo, 4, ["D1", "D2"], 92); n(TIMP, tNo, 2, "D2", 78)                                    # "ningún": 0/14
for bt, p in [(tNo + 1.2, "E5"), (tNo + 2.2, "D5"), (tNo + 3.2, "A4")]: n(PIANO, bt, 2.5, p, 52)

# ====================== B · el mapa que miente (9,6 – 23,4) ======================
CH_B = [(13, ["D3", "A3", "D4", "F4"], "D2"), (17, ["D3", "A3", "D4", "F4"], "D2"), (21, ["Bb2", "F3", "Bb3", "D4"], "Bb1"), (25, ["G2", "D3", "G3", "Bb3"], "G1"), (29, ["A2", "E3", "A3", "C#4"], "A1")]
PAD_B = [["A3", "D4", "F4"], ["A3", "D4", "F4"], ["Bb3", "D4", "F4"], ["Bb3", "D4", "G4"], ["A3", "C#4", "E4"]]
setcc(SLOW, 12.9, 78)
for k, (b0, tones, root) in enumerate(CH_B):
    end = 31.1 if k == 4 else b0 + 4
    for i in range(int((end - b0) * 2)):
        n(PIZZ, b0 + i * .5, .4, tones[[0, 1, 2, 1, 3, 1, 2, 1][i % 8]], 78 if i % 8 == 0 else 58 + (i % 2) * 4)
    n(BASS, b0, end - b0, root, 54); ch_(SLOW, b0, end - b0, PAD_B[k], 44)
for bt, d, p in [(14, 2, "D3"), (16, 1, "F3"), (17, 3, "A3"), (20, 1, "G3"), (21, 2, "F3"), (23, 2, "D3"), (25, 2, "G3"), (27, 2, "Bb3"), (29, 2.1, "A3")]: n(CELLO, bt, d, p, 70)
tLie = b(W["s2"][17]); ch_(PIANO, tLie - .1, 2.5, ["A4", "Eb5"], 72)                                # "mienten": tritono
tFind = b(WE["s2"][27] - .55)
for i, p in enumerate(["A3", "C#4", "E4", "A4", "C#5", "E5", "A5"]): n(HARP, tFind + i * .16, 1.5, p, 60 + i * 5)   # ¡ahí está!

# ====================== C · la ruta y el monzón (23,4 – 30,6) ======================
B3_ = 31.2
n(TIMP, B3_, 3, "D2", 112); n(DRUM, B3_, 1, 36, 112)
setcc(STR, B3_ - .05, 110); ch_(STR, B3_, 3.6, ["D2", "A2", "D3", "F3", "A3", "D4"], 84)
for bt, d, p in [(B3_, 2, "D3"), (B3_ + 2, 2, "A3"), (B3_ + 4, 3.4, "D4")]: n(HORN, bt, d, p, 84)
for b0, end, tones, root in [(33.2, 35.2, ["D3", "F3", "A3"], "D2"), (35.2, 39.2, ["Bb2", "D3", "F3"], "Bb1"), (39.2, 40.7, ["A2", "C#3", "E3"], "A1")]:
    n(BASS, b0, end - b0, root, 64)
    for i in range(int(round((end - b0) * 2))):
        bt = b0 + i * .5; v = 56 + (bt - 33.2) / 7.5 * 44
        n(STR, bt, .28, tones[[0, 0, 1, 0, 2, 0, 1, 0][i % 8]], v + (10 if i % 4 == 0 else 0))
tM = b(W["s3"][7])
ramp(TREM, tM, 40.5, 30, 118); ch_(TREM, tM, 40.7 - tM, ["D2", "A2", "Eb3"], 70)                  # el monzón: trémolo con roce de semitono
for i in range(int((40.6 - 37.6) * 4)): n(TIMP, 37.6 + i * .25, .3, "D2" if i % 8 < 6 else "A2", 36 + i * 5.5)
n(TIMP, 40.8, 2, "D2", 96); n(DRUM, 40.8, 1, 36, 100)

# ====================== D · 3 de junio (30,6 – 48,0) ======================
n(BASS, 41, 13.2, "D2", 50)
setcc(SLOW, 43.9, 84); setcc(HORN, 43.9, 100)
for b0, end, tones, pad in [(44, 48, ["D3", "A3", "D4", "F4", "A4", "F4", "D4", "A3"], ["D3", "A3", "F4"]), (48, 52, ["Bb2", "F3", "Bb3", "D4", "F4", "D4", "Bb3", "F3"], ["D3", "Bb3", "F4"]), (52, 54, ["C3", "G3", "C4", "E4"], ["C3", "G3", "E4"])]:
    for i in range(int((end - b0) * 2)): n(HARP, b0 + i * .5, 1.2, tones[i % len(tones)], 58 if i % 4 else 70)
    for i in range(int(end - b0)): n(CELLO, b0 + i, .45, tones[0], 72 if i % 2 == 0 else 58)       # pulso: pasos en la nieve
    ch_(SLOW, b0, end - b0, pad, 52)
for bt, d, p in [(44, 2, "D4"), (46, 2, "F4"), (48, 3, "D4"), (51, 1, "F4"), (52, 2, "E4")]: n(HORN, bt, d, p, 62)
# el diálogo: todo se suspende
q1, q2, q3 = b(W["s4"][21]), b(W["s4"][29]), b(W["s4"][31])
setcc(SLOW, 54, 62); ch_(SLOW, 54, 8, ["D3", "A4", "D5"], 40)
n(PIANO, q1, 3, "A4", 58); n(PIANO, q1 + 1.4, 3, "E5", 50)                                         # la duda
ch_(PIANO, q2, 3.5, ["D2", "D3", "A3"], 88)                                                         # «Seguiré solo»: suelo firme
ch_(PIANO, q3 + .3, 3.5, ["F#4", "A4", "D5"], 66, roll=.12)                                         # «te sigo»: asoma el modo mayor
# subida final: dominante en crescendo
ramp(STR, 61.5, 63.95, 26, 127); ch_(STR, 61.5, 2.45, ["A2", "E3", "A3", "C#4", "E4", "A4"], 96)
ramp(TREM, 61.5, 63.95, 26, 127); ch_(TREM, 61.5, 2.45, ["A4", "C#5", "E5"], 90)
ramp(BRASS, 62.5, 63.95, 30, 120); ch_(BRASS, 62.5, 1.45, ["A3", "C#4", "E4"], 92)
for i in range(int(2.4 * 4)): n(TIMP, 61.5 + i * .25, .3, "A2", 34 + i * 9); n(DRUM, 61.6 + i * .25, .2, 38, 26 + i * 9)
for i, p in enumerate(["D3", "E3", "F#3", "G3", "A3", "B3", "C#4", "D4", "E4", "F#4", "G4", "A4", "B4", "C#5", "D5", "E5"]): n(HARP, 63.2 + i * .05, 1.5, p, 60 + i * 3)

# ====================== E · CUMBRE (48,0 – 60,0) · re mayor ======================
G = 64
n(DRUM, G, 2, 36, 127); n(DRUM, G, 4, 49, 118); n(DRUM, G, 4, 57, 108); n(TIMP, G, 3, "D2", 124); n(BELL, G, 6, "D4", 104); n(BELL, G, 6, "D5", 84)
for ch in (STR, BRASS, CHOIR, HORN, VLN): setcc(ch, G - .02, 127)
PROG_E = [  # (inicio, dur, cuerdas, metal, coro)
 (64, 4, ["D2", "A2", "D3", "F#3", "A3", "D4", "F#4", "A4", "D5"], ["D3", "A3", "D4", "F#4"], ["D4", "F#4", "A4"]),
 (68, 4, ["C#2", "A2", "E3", "A3", "C#4", "E4", "A4", "C#5"], ["E3", "A3", "C#4", "E4"], ["C#4", "E4", "A4"]),
 (72, 4, ["B1", "B2", "F#3", "B3", "D4", "F#4", "B4", "D5"], ["D3", "F#3", "B3", "D4"], ["B3", "D4", "F#4"]),
 (76, 2, ["G1", "G2", "D3", "G3", "B3", "D4", "G4", "B4"], ["D3", "G3", "B3"], ["B3", "D4", "G4"]),
 (78, 1.95, ["A1", "A2", "E3", "A3", "C#4", "E4", "A4", "C#5"], ["E3", "A3", "C#4"], ["C#4", "E4", "A4"]),
]
for k, (b0, d, s, br, co) in enumerate(PROG_E):
    ch_(STR, b0, d, s, 104 if k == 0 else 88); ch_(BRASS, b0, d, br, 98 if k == 0 else 78); ch_(CHOIR, b0, d, co, 84)
    if k: n(TIMP, b0, 2, s[0] if P(s[0]) >= 36 else P(s[0]) + 12, 96)
    arp = [co[2], co[1], co[0], co[1]]
    for i in range(int(d * 2)): n(CEL, b0 + i * .5, .6, P(arp[i % 4]) + 12, 50)
MEL = [(64, 1, "F#4"), (65, 1, "A4"), (66, 2, "D5"), (68, 3, "E5"), (71, 1, "C#5"), (72, 2, "D5"), (74, 1, "B4"), (75, 1, "D5"), (76, 1, "B4"), (77, 1, "D5"), (78, 1.95, "E5")]
for bt, d, p in MEL: n(HORN, bt, d, p, 108); n(VLN, bt, d, P(p) + 12, 94); n(BRASS, bt, d, p, 70)
ramp(STR, 78, 79.9, 100, 127);
for i in range(7): n(TIMP, 78.2 + i * .25, .3, "A2", 60 + i * 9)
# ...y el acorde de dominante queda sin resolver: corte seco.

# ====================== F · el precio (60,0 – 73,2) ======================
tPr, tG, tN, tA, tH, tDed, tPies = b(W["s6"][5]), b(W["s6"][7]), b(W["s6"][14] - .25), b(W["s6"][20] - .2), b(W["s6"][22] - .25), b(W["s6"][25]), b(W["s6"][30])
n(BASS, 81, tH - 81, "D2", 56)
ramp(TREM, 81.5, 84, 20, 84); ramp(TREM, 84, tN, 84, 50); ramp(TREM, tN, tA, 50, 30); ch_(TREM, 81.5, tA - 81.5, ["D3", "Eb3"], 64); ch_(TREM, 83, tN - 83, ["A5", "Bb5"], 40)
ch_(PIANO, tPr - .1, 5, ["D1", "D2"], 96); n(BELL, tPr - .1, 6, "D3", 70)                         # "su precio": campana
for i, p in enumerate(["D6", "C6", "A5", "G5", "F5", "D5", "C5", "A4", "G4", "F4"]): n(CEL, tG + .2 + i * .34, 1.2, p, 62 - i * 4)   # los guantes caen
for dt, p in [(.9, "A5"), (1.9, "F5"), (2.8, "D5")]: n(CEL, tN + dt / BEAT * BEAT, 3, p, 44)       # gotas en la grieta
n(DRUM, tN, 2, 36, 96)
for i in range(10): n(TIMP, tA + i * .2, .3, "D2", 50 + (i if i < 6 else 12 - i) * 11)             # el alud
n(DRUM, tA + .3, 2, 36, 118)
n(CELLO, tH + .2, b(73.4) - tH, "D3", 50)
ch_(PIANO, tH + .4, 4, ["D3", "A3", "F4"], 54, roll=.1); n(PIANO, tDed, 3, "E4", 48)
ch_(PIANO, tPies, 3.5, ["Bb2", "F3", "D4"], 50, roll=.1)
ch_(PIANO, tPies + 1.9, 3, ["A2", "E3", "C#4"], 46, roll=.14)                                       # la sensible: se abre la puerta al mayor

# ====================== G · otros Annapurnas (73,2 – 88,5) ======================
PROG_G = [(98, ["G2", "D3", "G3", "B3", "D4", "B3", "G3", "D3"], ["G3", "B3", "D4"], "G2"),
          (102, ["F#2", "D3", "F#3", "A3", "D4", "A3", "F#3", "D3"], ["F#3", "A3", "D4"], "F#2"),
          (106, ["E2", "B2", "E3", "G3", "D4", "G3", "E3", "B2"], ["E3", "G3", "B3", "D4"], "E2"),
          (110, ["A2", "E3", "A3", "D4", "E4", "D4", "A3", "E3"], ["E3", "A3", "D4"], "A2")]
setcc(SLOW, 97.9, 70); ramp(SLOW, 98, 110, 70, 96); setcc(CELLO, 97.9, 96); setcc(HORN, 97.9, 90); setcc(STR, 97.9, 70)
for k, (b0, arp, pad, root) in enumerate(PROG_G):
    for i in range(8):
        p = arp[i]
        if k == 3 and i >= 4 and p == "D4": p = "C#4"
        n(PIANO, b0 + i * .5, 1.1, p, 56 if i % 4 else 64)
    if k == 3: ch_(SLOW, b0, 2, pad, 54); ch_(SLOW, b0 + 2, 2, ["E3", "A3", "C#4"], 56)
    else: ch_(SLOW, b0, 4, pad, 50 + k * 2)
    n(CELLO, b0, 4, root, 56)
for bt, d, p in [(98, 2, "B4"), (100, 2, "D5"), (102, 3, "A4"), (105, 1, "F#4"), (106, 2, "G4"), (108, 2, "B4"), (110, 2, "A4"), (112, 1, "E5"), (113, 1, "C#5")]: n(PIANO, bt, d + .4, p, 76)
# acorde final: re mayor, y el motivo sigue subiendo
ch_(PIANO, 114, 6, ["D2", "A2", "D3", "F#3", "A3", "D4", "F#4"], 74, roll=.07); n(PIANO, 114, 6, "D5", 80)
ramp(SLOW, 114, 116, 84, 112); ramp(SLOW, 116, 118.4, 112, 30); ch_(SLOW, 114, 4.4, ["D3", "A3", "D4", "F#4", "A4"], 62)
ramp(STR, 114, 116, 60, 96); ramp(STR, 116, 118.4, 96, 20); ch_(STR, 114, 4.4, ["D2", "A2", "D4", "A4", "D5"], 58)
n(CELLO, 114, 4.4, "D2", 60); ch_(HORN, 114, 4, ["A3", "D4"], 56); n(BELL, 114, 5, "D5", 56); n(TIMP, 114, 3, "D2", 60)
for bt, p, v in [(114.6, "A5", 60), (115.6, "D6", 56), (116.6, "F#6", 52)]: n(PIANO, bt, 3, p, v)

# ---------------------------- escribir MIDI ----------------------------
def write_midi(path, tpq=480):
    ev = [(0, 0, bytes([0xFF, 0x51, 0x03]) + int(60e6 / BPM).to_bytes(3, "big"))]
    for ch, pr in PROG.items(): ev += [(0, 0, bytes([0xC0 | ch, pr])), (0, 0, bytes([0xB0 | ch, 7, VOL[ch]])), (0, 0, bytes([0xB0 | ch, 11, 100])), (0, 0, bytes([0xB0 | ch, 91, 70 if ch != DRUM else 40]))]
    for ch, bt, cc, val in ccs: ev.append((round(bt * tpq), 1, bytes([0xB0 | ch, cc, max(0, min(127, val))])))
    for ch, bt, d, p, v in notes: ev.append((round(bt * tpq), 3, bytes([0x90 | ch, p, v]))); ev.append((round((bt + d) * tpq), 2, bytes([0x80 | ch, p, 0])))
    ev.sort(key=lambda e: (e[0], e[1]))
    def vl(v):
        out = [v & 0x7F]; v >>= 7
        while v: out.append((v & 0x7F) | 0x80); v >>= 7
        return bytes(reversed(out))
    trk, last = bytearray(), 0
    for tick, _, data in ev: trk += vl(tick - last) + data; last = tick
    trk += b"\x00\xFF\x2F\x00"
    open(path, "wb").write(b"MThd" + (6).to_bytes(4, "big") + (0).to_bytes(2, "big") + (1).to_bytes(2, "big") + tpq.to_bytes(2, "big") + b"MTrk" + len(trk).to_bytes(4, "big") + bytes(trk))

os.makedirs(OUT, exist_ok=True)
write_midi(f"{OUT}/score.mid")
subprocess.run(["fluidsynth", "-ni", "-q", "-g", "0.45", "-r", str(SR), "-o", "synth.reverb.active=yes", "-o", "synth.reverb.room-size=0.82", "-o", "synth.reverb.damp=0.35",
                "-o", "synth.reverb.width=1.0", "-o", "synth.reverb.level=0.9", "-o", "synth.chorus.active=no", "-o", "synth.polyphony=512", "-F", f"{OUT}/orch.wav", SF2, f"{OUT}/score.mid"], check=True)
N_ = int(DUR * SR)
def load(path):
    sr, d = wavfile.read(path); d = d.astype(np.float64) / (32768.0 if d.dtype == np.int16 else 2147483648.0 if d.dtype == np.int32 else 1.0)
    if d.ndim == 1: d = np.stack([d, d], 1)
    assert sr == SR, sr; return d
orch = load(f"{OUT}/orch.wav"); orch = np.vstack([orch, np.zeros((max(0, N_ - len(orch)), 2))])[:N_]

# ---------------------------- diseño sonoro ----------------------------
rs = np.random.default_rng(7)
sfx = np.zeros((N_, 2))
def sos(kind, f): return signal.butter(2, f, btype=kind, fs=SR, output="sos")
def filt(x, kind, f): return signal.sosfilt(sos(kind, f), x)
def place(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i < 0: sig = sig[-i:]; i = 0
    sig = sig[: max(0, N_ - i)]
    if sig.ndim == 1: sig = np.stack([sig * (1 - max(0, pan)), sig * (1 + min(0, pan))], 1)
    sfx[i:i + len(sig)] += sig * gain * .8
def bump(nn, peak=.5, pa=2.0, pd=2.0):
    x = np.linspace(0, 1, nn); return np.where(x < peak, (x / peak) ** pa, ((1 - x) / (1 - peak)) ** pd)
def whoosh(dur, up=True, lo=(150, 900), hi=(1500, 7000)):
    nn = int(dur * SR); a = filt(rs.standard_normal(nn), "band", lo); c = filt(rs.standard_normal(nn), "band", hi); x = np.linspace(0, 1, nn)
    m = x if up else 1 - x
    L = (a * (1 - m) + c * m * .6) * bump(nn, .6 if up else .3)
    R = np.roll(L, 240) * (.8 + .2 * x)
    return np.stack([L, R], 1)
def boom(dur=2.2, f0=90, f1=30, click=.4):
    nn = int(dur * SR); t = np.arange(nn) / SR; f = f1 + (f0 - f1) * np.exp(-t * 9)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * (3.2 / dur))
    s += filt(rs.standard_normal(nn), "low", 220) * np.exp(-t * 14) * click
    return np.tanh(s * 1.6) * .8
def riser(dur):
    nn = int(dur * SR); x = np.linspace(0, 1, nn)
    a = filt(rs.standard_normal(nn), "high", 2500) * x ** 2.6 * .7 + filt(rs.standard_normal(nn), "band", (400, 2500)) * x ** 1.8 * .5
    s = np.sin(2 * np.pi * np.cumsum(180 * 2 ** (x * 2.6)) / SR) * x ** 2 * .12
    y = a + s; return np.stack([y, np.roll(y, 300)], 1)
def tick(f=1900):
    nn = int(.07 * SR); t = np.arange(nn) / SR; return (np.sin(2 * np.pi * f * t) * np.exp(-t * 70) + rs.standard_normal(nn) * np.exp(-t * 400) * .5) * .5
def rumble(dur):
    nn = int(dur * SR); y = filt(rs.standard_normal(nn), "low", 110) * 2.2 + filt(rs.standard_normal(nn), "band", (150, 900)) * .5
    return np.tanh(y * bump(nn, .3, 1.5, 1.8) * 1.2)
def scratch(dur=.28):
    nn = int(dur * SR); return filt(rs.standard_normal(nn), "band", (1800, 5200)) * bump(nn, .35) * (.6 + .4 * np.sin(np.arange(nn) / SR * 2 * np.pi * 38))

S = TL["scenes"]
# viento: ruido filtrado cuya intensidad sigue el guion
tt = np.arange(N_) / SR
lvl = np.interp(tt, [0, 9, 10.2, 23, 24, 30, 31.2, 46.5, 48.2, 59.9, 60.2, W["s6"][14] - .3, W["s6"][14] + .2, W["s6"][20] - .2, W["s6"][22], 73.5, DUR],
                    [.10, .10, .025, .025, .10, .18, .26, .30, .05, .06, .46, .46, .13, .16, .02, .05, .03])
for c in (0, 1):
    base = filt(rs.standard_normal(N_), "band", (220, 1300)) + .5 * filt(rs.standard_normal(N_), "band", (900, 3200))
    gust = .62 + .25 * np.sin(2 * np.pi * (.11 * tt + c * .3)) + .13 * np.sin(2 * np.pi * (.37 * tt + c * .7))
    sfx[:, c] += base * gust * lvl * .55
place(whoosh(1.1, up=False), S[1] - .7, .5); place(scratch(.5) * .5, S[1] - .35, .5)                 # el mapa entra
tHz = W["s2"][12]
for t_ in (tHz + .45, tHz + .65, W["s2"][17] - .15, W["s2"][17] + .05): place(scratch(.24), t_, .34, pan=.2)   # tachones
place(scratch(.6), WE["s2"][27] - .55, .3)                                                           # círculo rojo
place(whoosh(1.0, up=True), S[2] - .8, .6); place(boom(2.6, 80, 30), S[2] + .02, .75)                # zoom al macizo
tQ = W["s3"][13] - .1
for i in range(5): place(tick(1700 + i * 60), tQ + .6 + i * .16, .32, pan=-.3 + i * .15)             # calendario
place(tick(2500), tQ + 1.5, .4)
place(whoosh(1.5, up=False, lo=(80, 600)), S[3] - .7, .8); place(boom(2.2, 70, 28), S[3], .55)       # el techo de nubes cae
tO = W["s4"][12]; place(boom(.5, 150, 55, click=1.2), tO, .55)                                        # sello "sin oxígeno"
place(riser(1.9), S[4] - 1.9, .75)
place(boom(3.2, 95, 30, click=.8), S[4], 1.0)                                                         # CUMBRE
place(boom(2.4, 110, 28, click=1.4), S[5], 1.0)                                                       # el corte
place(whoosh(.9, up=False, lo=(90, 500)), W["s6"][14] - .55, .7); place(boom(2.8, 60, 26), W["s6"][14] - .05, .8)   # caída a la grieta
place(rumble(3.0), W["s6"][20] - .35, .85)                                                            # alud
for i in range(10): place(tick(900 - i * 30) * .6, W["s6"][25] - .15 + i * .1, .22)                   # los dedos
for i in range(10): place(tick(700 - i * 20) * .6, W["s6"][30] - .1 + i * .06, .2)

# ---------------------------- sala (reverb por convolución) ----------------------------
def hall(x, rt=2.6, wet=.2):
    nn = int(rt * SR); t = np.arange(nn) / SR; out = np.zeros_like(x)
    for c in (0, 1):
        ir = rs.standard_normal(nn) * np.exp(-t * 6.9 / rt); ir = filt(ir, "low", 5200); ir[: int(.012 * SR)] = 0; ir /= np.sqrt((ir ** 2).sum())
        out[:, c] = signal.fftconvolve(x[:, c], ir)[: len(x)]
    return x + out * wet
# corte seco de la orquesta al entrar "el precio": la cola del acorde se apaga en 40 ms
# "mano en el fader": realza los pasajes íntimos para que la música no desaparezca bajo la voz
ride = 10 ** (np.interp(tt, [0, 9, 22.6, 23.4, 30.4, 31.2, 45.8, 46.6, 49.5, 60, 61, 72.6, 73.6, 85.2, 86, DUR], [7, 7, 7, 1, 1, 6, 6, 0, 0, 0, 1, 1, 8.5, 8.5, 10, 10]) / 20)
orch = orch * ride[:, None]
cut = np.interp(tt, [0, S[5] - .02, S[5] + .03, S[5] + .7, S[5] + 1.0, DUR], [1, 1, .05, .05, 1, 1])
music = hall(orch * cut[:, None], 2.8, .22) * np.interp(tt, [0, S[5] - .02, S[5] + .04, S[5] + .5, S[5] + .9, DUR], [1, 1, .25, .25, 1, 1])[:, None] + hall(sfx, 2.2, .18)

# ---------------------------- narración + ducking ----------------------------
vo = np.zeros(N_)
for v in TL["vo"]:
    sr, d = wavfile.read(f"{VO_DIR}/{v['id']}.wav"); d = d.astype(np.float64) / 32768.0; i = int(v["start"] * SR); d = d[: N_ - i]; vo[i:i + len(d)] += d
vo = filt(vo, "high", 75)
# realce de presencia + compresión suave
vo = vo + .18 * filt(vo, "band", (2500, 6500))
env = np.sqrt(signal.sosfilt(sos("low", 12), vo ** 2).clip(0)); g = np.minimum(1, (.09 / np.maximum(env, 1e-4)) ** .45); vo *= signal.sosfilt(sos("low", 25), g)
vo /= np.abs(vo).max() / .92
act = (np.sqrt(signal.sosfilt(sos("low", 6), vo ** 2).clip(0)) > .012).astype(float)
k = int(.5 * SR); act = np.convolve(act, np.ones(k) / k, mode="same")      # sostén entre palabras
act = signal.sosfiltfilt(sos("low", 2.2), act).clip(0, 1)
duck = 1 - np.interp(tt, [0, 47, 48, 59.5, 60.5, DUR], [.5, .5, .38, .38, .5, .5]) * act   # ≈ -6 dB bajo la voz (-4 en la cumbre)
vo_st = np.stack([vo, vo], 1); vo_st = vo_st + (hall(vo_st, .9, .06) - vo_st)  # una pizca de sala
def rms_db(x): return 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9)
music *= 10 ** ((-12.5 - rms_db(music[int(48 * SR):int(49.4 * SR)])) / 20)
vo_st *= 10 ** ((-19.5 - rms_db(vo_st)) / 20)
mixm = music * duck[:, None]
fade = np.ones(N_); nf = int(1.1 * SR); fade[-nf:] = np.cos(np.linspace(0, np.pi / 2, nf)) ** 2; fade[: int(.05 * SR)] = np.linspace(0, 1, int(.05 * SR))
mix = (mixm + vo_st) * fade[:, None]
mix = np.tanh(mix * 1.5) / 1.5 * 1.35                                         # limitador suave
mix /= max(1.0, np.abs(mix).max() / .97)
wavfile.write(f"{OUT}/mix.wav", SR, (mix * 32767).astype(np.int16))
wavfile.write(f"{OUT}/music_only.wav", SR, (np.clip(music * fade[:, None] * 2.2, -1, 1) * 32767).astype(np.int16))
print("notas:", len(notes), "| pico mezcla:", round(float(np.abs(mix).max()), 3))
for a, c, name in [(0, 9.6, "1950"), (9.6, 23.4, "mapa"), (23.4, 30.6, "monzón"), (30.6, 46.5, "ataque"), (48, 49.4, "CUMBRE(hit)"), (49.4, 60, "cumbre"), (60, 73.2, "precio"), (73.2, 88.5, "epílogo")]:
    sl = slice(int(a * SR), int(c * SR)); print(f"  {name:12s} música {rms_db(mixm[sl]):6.1f} dB | voz {rms_db(vo_st[sl]):6.1f} dB | orquesta {rms_db(orch[sl]):6.1f} dB")
