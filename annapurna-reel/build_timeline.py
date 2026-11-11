"""Une narración + guion visual en una línea de tiempo (src/timeline.js)."""
import json, re, sys
VO_DIR = sys.argv[1] if len(sys.argv) > 1 else "audio/vo"
FPS = 30
SCENES = [0.0, 9.6, 23.4, 30.6, 48.0, 60.0, 73.2]   # inicio de cada escena (s)
END = 88.5
VO_AT = [0.9, 10.0, 24.0, 31.2, 49.4, 60.6, 74.4]   # entrada de la voz en cada escena

# Subtítulos: "token{n}" = un token visible que abarca n palabras habladas. '*' = cita (se pinta en la escena, no como subtítulo)
CAPS = {
 "s1": ["1950.{3}", "En la Tierra hay", "catorce montañas", "de más de 8.000{2} metros…", "y ningún ser humano", "ha pisado la cima", "de ninguna."],
 "s2": ["Nepal acaba de abrir", "sus fronteras.", "Una expedición francesa,", "dirigida por", "Maurice Herzog,", "llega con mapas", "que mienten.", "Pasan semanas", "buscando la montaña,", "antes de poder", "siquiera tocarla."],
 "s3": ["Cuando por fin", "encuentran una ruta,", "el monzón está", "a punto de llegar.", "Quedan apenas", "unos días."],
 "s4": ["El 3 de junio,", "Herzog y Louis Lachenal", "salen hacia la cumbre.", "Sin oxígeno,", "y con los pies helándose.", "Lachenal pregunta:", "*«Si me doy la vuelta,", "*¿qué harás tú?»", "*«Seguiré solo.»", "*«Entonces, te sigo.»"],
 "s5": ["A las dos de la tarde,", "a 8.091{5} metros,", "ya no queda nada", "más arriba.", "Por primera vez,", "el ser humano", "está de pie", "sobre un ochomil."],
 "s6": ["Pero la montaña", "cobra su precio.", "Unos guantes", "que se escapan", "ladera abajo.", "Una noche", "dentro de una grieta.", "Una avalancha.", "Herzog perderá", "todos los dedos", "de las manos", "y de los pies."],
 "s7": ["Desde el hospital,", "dictó un libro", "que termina así:", "*«Hay otros Annapurnas", "*en la vida", "*de los hombres.»", "Quizá por eso", "seguimos subiendo:", "porque cada uno", "carga con su", "propia montaña."],
}
vo = json.load(open(f"{VO_DIR}/vo.json"))
out = {"fps": FPS, "dur": END, "scenes": SCENES, "vo": [], "caps": [], "voice": vo["voice"]}
for seg, at in zip(vo["segments"], VO_AT):
    words = [{"t": round(at + w["t"], 3), "d": round(w["d"], 3), "w": w["w"]} for w in seg["words"]]
    out["vo"].append({"id": seg["id"], "start": at, "dur": seg["dur"], "words": words})
    i = 0; chunks = []
    for ch in CAPS[seg["id"]]:
        quote = ch.startswith("*"); ch = ch.lstrip("*"); toks = []
        for tk in ch.split(" "):
            m = re.match(r"(.*?)\{(\d+)\}(.*)", tk); n = int(m.group(2)) if m else 1
            txt = (m.group(1) + m.group(3)) if m else tk
            a, b = words[i], words[i + n - 1]
            toks.append({"x": txt, "t": a["t"], "e": round(b["t"] + b["d"], 3)}); i += n
        chunks.append({"q": quote, "seg": seg["id"], "tok": toks, "t0": toks[0]["t"] - .1, "t1": toks[-1]["e"]})
    assert i == len(words), (seg["id"], i, len(words))
    for k, c in enumerate(chunks):
        nxt = chunks[k + 1]["t0"] if k + 1 < len(chunks) else c["t1"] + .55
        c["t1"] = round(min(nxt, c["t1"] + .7), 3); c["t0"] = round(c["t0"], 3)
    out["caps"] += chunks
    assert at + seg["dur"] < (SCENES[len(out["vo"])] if len(out["vo"]) < len(SCENES) else END) + .2, seg["id"]
open("src/timeline.js", "w").write("window.TL = " + json.dumps(out, ensure_ascii=False) + ";\n")
json.dump(out, open("audio/timeline.json", "w"), ensure_ascii=False)
print("timeline ok:", END, "s,", len(out["caps"]), "bloques de subtítulos")
