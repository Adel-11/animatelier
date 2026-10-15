# Génère un clip WAV 48 kHz par créneau du script vocal, avec Kokoro (ONNX, local).
# Usage : python3 tts_kokoro.py voice-script.json clips/ [voix] [vitesse]
# Modèle : QFF_KOKORO_DIR (kokoro-v1.0.onnx + voices-v1.0.bin, release GitHub thewh1teagle/kokoro-onnx model-files-v1.0)
import json, os, sys, warnings
warnings.filterwarnings("ignore")
import numpy as np, soundfile as sf, librosa
from kokoro_onnx import Kokoro
VS, OUT = sys.argv[1], sys.argv[2]
VOICE = sys.argv[3] if len(sys.argv) > 3 else "af_heart"
SPEED = float(sys.argv[4]) if len(sys.argv) > 4 else 1.05
M = os.environ.get("QFF_KOKORO_DIR", "kokoro/")
k = Kokoro(M + "kokoro-v1.0.onnx", M + "voices-v1.0.bin")
lang = "en-gb" if VOICE[0] == "b" else "en-us"
os.makedirs(OUT, exist_ok=True)
dur = {}
for s in json.load(open(VS)):
    w, sr = k.create(s["text"], voice=VOICE, speed=SPEED, lang=lang)
    w, _ = librosa.effects.trim(w, top_db=38)
    w = librosa.resample(w, orig_sr=sr, target_sr=48000)
    sf.write(f"{OUT}/{s['id']}.wav", w, 48000)
    dur[s["id"]] = round(len(w) / 48000, 2)
json.dump(dur, open(f"{OUT}/all-durations.json", "w"), indent=1)
print(json.dumps(dur))
