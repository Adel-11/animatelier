# Génère un clip vocal par créneau à partir d'une spec de quiz "levels".
# Usage : python3 tts_clips.py spec.json clips/ voice-durations.json
# Sortie : clips/<id>.wav (48 kHz mono), clips/all-durations.json, voice-durations.json (questions seules)
# Le fichier voice-durations.json se passe ensuite à quiz-video.js --voice-durations
import warnings, json, sys, os, numpy as np
warnings.filterwarnings("ignore")
import soundfile as sf, librosa
from TTS.api import TTS

SPEC, OUT, DUR_FILE = sys.argv[1], sys.argv[2], sys.argv[3]
MODEL = os.environ.get("QFF_TTS_DIR", "en_voice/tts_models--en--ljspeech--vits/")
os.makedirs(OUT, exist_ok=True)

t = TTS(model_path=MODEL + "model_file.pth.tar", config_path=MODEL + "config.json")
sr = t.synthesizer.output_sample_rate

s = json.load(open(SPEC))
items = {"intro": s["intro"]["say"], "outro": s["outro"]["say"]}
n = 0
for li, L in enumerate(s["levels"], 1):
    items[f"level_{li}"] = L["say"]
    for q in L["questions"]:
        n += 1
        items[f"question_{n}"] = q["say"]
        items[f"question_{n}_answer"] = q["sayAnswer"]

dur = {}
for k, txt in items.items():
    w = np.array(t.tts(text=txt), dtype=np.float32)
    w, _ = librosa.effects.trim(w, top_db=38)
    w = librosa.resample(w, orig_sr=sr, target_sr=48000)
    sf.write(f"{OUT}/{k}.wav", w, 48000)
    dur[k] = round(len(w) / 48000, 2)
    print(k, dur[k], flush=True)

json.dump({k: v for k, v in dur.items() if k.startswith("question_") and not k.endswith("answer")},
          open(DUR_FILE, "w"), indent=1)
json.dump(dur, open(f"{OUT}/all-durations.json", "w"), indent=1)
