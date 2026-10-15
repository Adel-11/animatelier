# Place les clips vocaux sur la timeline produite par quiz-video.js.
# Usage : python3 place_voice.py out/ clips/
# Lit out/voice-script.json et out/timeline.json, écrit out/voice.wav (stéréo 48 kHz).
# Règles : l'intro démarre à 0,3 s (elle couvre l'écran logo, souvent trop courte sinon),
# les réponses sont décalées de 0,1 s après la révélation, les questions collent au début du créneau
# pour que le compte à rebours démarre juste après la voix. Un chevauchement est signalé "OVERLAP".
import json, sys, numpy as np, soundfile as sf

OUT, CLIPS = sys.argv[1].rstrip("/"), sys.argv[2].rstrip("/")
vs = json.load(open(f"{OUT}/voice-script.json"))
dur = json.load(open(f"{OUT}/timeline.json"))["duration"]
SR = 48000
N = int((dur + 0.2) * SR)
v = np.zeros(N)

for s in vs:
    w, _ = sf.read(f"{CLIPS}/{s['id']}.wav")
    st = s["start"]
    if s["id"] == "intro":
        st = 0.3
    elif s["id"].endswith("answer"):
        st += 0.1
    i = int(st * SR)
    v[i:i + len(w)] += w[:N - i]
    end = st + len(w) / SR
    nxt = [x["start"] for x in vs if x["start"] > s["start"]]
    if nxt and end > min(nxt):
        print("OVERLAP", s["id"], round(end, 2), round(min(nxt), 2))

v = v / np.abs(v).max() * 0.9
sf.write(f"{OUT}/voice.wav", np.stack([v, v], 1), SR, subtype="PCM_16")
print("ok", dur)
