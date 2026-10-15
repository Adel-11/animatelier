# Mixe voix + musique pour un rendu quiz-video.js, voix bien devant.
# Usage : python3 mix_qff.py out/ clips/ musique.mp3 mix.wav [music_lufs=-32]
# Place les clips selon out/voice-script.json (intro +0,3 s, réponses +0,1 s), boucle la musique,
# musique ramenée à music_lufs puis baissée de ~10 dB sous la voix (sidechain), voix à -16 LUFS, limiteur -1,5 dBTP.
import json, sys, subprocess, numpy as np, soundfile as sf, librosa, pyloudnorm as pyln
OUT, CLIPS, MUS, DST = sys.argv[1].rstrip("/"), sys.argv[2].rstrip("/"), sys.argv[3], sys.argv[4]
MLUFS = float(sys.argv[5]) if len(sys.argv) > 5 else -32
SR = 48000
vs = json.load(open(f"{OUT}/voice-script.json"))
dur = json.load(open(f"{OUT}/timeline.json"))["duration"]
N = int(dur * SR)
voice = np.zeros(N)
for s in vs:
    try: w, _ = sf.read(f"{CLIPS}/{s['id']}.wav")
    except Exception: continue
    st = s["start"] + (0.3 if s["id"] == "intro" else 0.1 if s["id"].endswith("_answer") else 0)
    i = int(st * SR); voice[i:i + len(w)] += w[:max(0, N - i)]
meter = pyln.Meter(SR)
voice = pyln.normalize.loudness(voice, meter.integrated_loudness(voice), -16)
m, _ = librosa.load(MUS, sr=SR, mono=True)
m = np.tile(m, int(np.ceil(N / len(m))))[:N]
t = np.arange(N) / SR
m *= np.minimum(1, t / 0.5) * np.clip((dur - t) / 2.5, 0, 1)
m = pyln.normalize.loudness(m, meter.integrated_loudness(m), MLUFS)
# ducking : enveloppe de la voix lissée, -10 dB quand la voix parle
env = np.abs(voice)
k = int(0.25 * SR); env = np.convolve(env, np.ones(k) / k, mode="same")
gate = np.clip(env / (np.percentile(env[env > 1e-4], 30) + 1e-9), 0, 1)
k2 = int(0.15 * SR); gate = np.convolve(gate, np.ones(k2) / k2, mode="same")
m *= 10 ** (-10 * gate / 20)
mix = voice + m
sf.write("/tmp/_mix.wav", np.stack([mix, mix], 1), SR, subtype="FLOAT")
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", "/tmp/_mix.wav", "-af",
  "aresample=192000,alimiter=limit=0.8:attack=1:release=50:level=disabled,aresample=48000", "-c:a", "pcm_s16le", DST], check=True)
sp = gate > 0.5
print(json.dumps({"voice_lufs": round(meter.integrated_loudness(voice), 1),
  "music_lufs_under_voice": round(meter.integrated_loudness(m * sp), 1) if sp.any() else None,
  "music_lufs_between": round(meter.integrated_loudness(m * ~sp), 1)}))
