"""Genera la narración por segmentos (voz neural) + tiempos palabra a palabra."""
import asyncio, json, sys, os, subprocess
import edge_tts

VOICE = os.environ.get("VOICE", "en-US-AndrewMultilingualNeural")
RATE = os.environ.get("RATE", "-6%")
PITCH = os.environ.get("PITCH", "-2Hz")
OUT = sys.argv[1] if len(sys.argv) > 1 else "audio/vo"

# (id, texto que se pronuncia). Los nombres franceses van respelidos fonéticamente.
SEGMENTS = [
    ("s1", "Mil novecientos cincuenta. En la Tierra hay catorce montañas de más de ocho mil metros... y ningún ser humano ha pisado la cima de ninguna."),
    ("s2", "Nepal acaba de abrir sus fronteras. Una expedición francesa, dirigida por Maurice Herzog, llega con mapas que mienten. Pasan semanas buscando la montaña, antes de poder siquiera tocarla."),
    ("s3", "Cuando por fin encuentran una ruta, el monzón está a punto de llegar. Quedan apenas unos días."),
    ("s4", "El tres de junio, Herzog y Louis Lachenal salen hacia la cumbre. Sin oxígeno, y con los pies helándose. Lachenal pregunta: Si me doy la vuelta, ¿qué harás tú?... Seguiré solo... Entonces, te sigo."),
    ("s5", "A las dos de la tarde, a ocho mil noventa y un metros, ya no queda nada más arriba. Por primera vez, el ser humano está de pie sobre un ochomil."),
    ("s6", "Pero la montaña cobra su precio. Unos guantes que se escapan ladera abajo. Una noche dentro de una grieta. Una avalancha. Herzog perderá todos los dedos de las manos y de los pies."),
    ("s7", "Desde el hospital, dictó un libro que termina así: Hay otros Annapurnas en la vida de los hombres... Quizá por eso seguimos subiendo: porque cada uno carga con su propia montaña."),
]

async def synth(sid, text):
    com = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH, boundary="WordBoundary", proxy=os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy"))
    words, audio = [], bytearray()
    async for ch in com.stream():
        if ch["type"] == "audio":
            audio += ch["data"]
        elif ch["type"] == "WordBoundary":
            words.append({"t": ch["offset"] / 1e7, "d": ch["duration"] / 1e7, "w": ch["text"]})
    mp3 = f"{OUT}/{sid}.mp3"
    open(mp3, "wb").write(audio)
    wav = f"{OUT}/{sid}.wav"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", mp3, "-ar", "48000", "-ac", "1", wav], check=True)
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav]))
    return {"id": sid, "text": text, "dur": dur, "words": words}

async def main():
    os.makedirs(OUT, exist_ok=True)
    res = []
    for sid, text in SEGMENTS:
        for attempt in range(4):
            try:
                r = await synth(sid, text); break
            except Exception as e:
                print("retry", sid, e); await asyncio.sleep(2 ** attempt)
        res.append(r)
        print(sid, round(r["dur"], 2), len(r["words"]), "palabras")
    json.dump({"voice": VOICE, "segments": res}, open(f"{OUT}/vo.json", "w"), ensure_ascii=False, indent=1)
    print("total", round(sum(r["dur"] for r in res), 2))

asyncio.run(main())
