#!/usr/bin/env python3
"""QFF (Quiz Factory Forever) : production et publication d'un Reel quiz, en quelques commandes.

  python3 qff.py setup                    installe tout (~4 min, idempotent)
  python3 qff.py state                    etat du planning + questions deja posees (fichiers dans $QFF_DIR)
  python3 qff.py check SPEC               doublons (questions, photos) : a corriger avant build
  python3 qff.py find "QUERY" [N]         images libres (Openverse), une ligne par image
  python3 qff.py fetch URL NOM [CREDIT]   telecharge une image dans img/ du quiz courant (QFF_QUIZ)
  python3 qff.py build SPEC SLOT          voix, rendu, musique, mixage, controles -> final.mp4 (SLOT = 14 ou 21)
  python3 qff.py publish SPEC "LEGENDE"   publie via n8n (Instagram + 1 tentative Facebook), affiche execution_id
  python3 qff.py log SPEC [SUJET] [REEL]  ecrit questions/photos dans le Sheet, coche le sujet, envoie les photos
  python3 qff.py rules                    regles editoriales QFF
  python3 qff.py state sons               idem pour le Sheet des quiz sonores (sujets + sons deja utilises)
  python3 qff.py soundsearch "QUERY" [N]  sons libres Wikimedia Commons (via Openverse) : titre | licence | duree | auteur | url

SPEC : JSON « levels » court, le preset QFF est applique automatiquement (theme, intro rapide, outro, voix).
Le dossier du SPEC contient img/ (images, credits dans img/credits.json). Voir RULES en bas du fichier.
"""
import datetime, glob, hashlib, json, os, re, shutil, subprocess, sys, time, urllib.parse, urllib.request

D = os.environ.get("QFF_DIR", "/home/claude/qff-run")
REPO = f"{D}/animatelier"
KOK = f"{D}/kokoro"
# Les cles des webhooks n8n ne sont pas dans le depot (public) : variables d'environnement ou ~/.qff_keys.json
# {"drive": "...", "publish": "..."}
_KF = os.path.expanduser("~/.qff_keys.json")
_K = json.load(open(_KF)) if os.path.exists(_KF) else {}
DRIVE = "https://n8n.letter-bird.com/webhook/qff-drive"
DKEY = os.environ.get("QFF_DRIVE_KEY") or _K.get("drive", "")
PUB = "https://n8n.letter-bird.com/webhook/qff-publish?key=" + (os.environ.get("QFF_PUB_KEY") or _K.get("publish", ""))
VOICES = ["am_michael", "am_fenrir", "af_heart", "af_bella"]  # voix 1, 4, 8, 9 d'Adel, en alternance
from zoneinfo import ZoneInfo
TZ = ZoneInfo("America/Toronto")  # Ottawa, heure d'ete/hiver geree automatiquement

PRESET = {
    "preset": "qff-reel", "format": "reel-9x16", "language": "en",
    "theme": {"extends": "qff", "backdrop": {"type": "linear", "color": "#07275F", "color2": "#0B3E93", "angle": 160}},
    "intro": {"logoSeconds": 1, "subtitle": "15 QUESTIONS", "tagline": "Rookie or GOAT?",
              "say": "Answer these fifteen questions, and find out if you're a rookie... or a goat!",
              "elements": [{"id": "cover_logo_big", "type": "image", "src": "file:qff-logo.png", "x": 370, "y": 300, "w": 340, "h": 340, "radius": 40}],
              "layout": {"brand_logo": {"visible": False}, "badge_*": {"visible": False}, "intro_title": {"y": 0.481},
                         "intro_subtitle": {"y": 0.553}, "intro_tagline": {"y": 0.781}}},
    "questionEffect": "none", "imageLayout": "hero",
    "voice": {"seed": 7, "answerTemplates": ["Of course, it's {a}!", "Yes, it's {a}.", "The answer is {a}.", "{a}!", "That's {a}."]},
    "outro": {"title": "What's your score?", "tiers": ["0-5 · ROOKIE", "6-10 · MASTER", "11-15 · GOAT"],
              "cta": ["Drop it in the comments!", "Follow Quiz Factory Forever"],
              "say": "So, what's your score? Rookie, master, or goat? Tell us in the comments, and follow for more!"},
    "timing": {"read": "voice", "readPad": 0.3, "countdown": 3, "answer": 2.4, "levelCard": 1.8, "outro": 6, "maxDuration": 180},
}

VOICE_SCRIPT_STACK_MJS = r'''import { register } from "tsx/esm/api";
register();
const fs = await import("node:fs"); const path = await import("node:path");
const { compileStack, stackSchema } = await import(path.join(process.cwd(), "packages/core/stack.ts"));
const { voiceScript } = compileStack(stackSchema.parse(JSON.parse(fs.readFileSync(process.argv[2], "utf8"))));
fs.writeFileSync(process.argv[3], JSON.stringify(voiceScript.map(({ id, text }) => ({ id, text }))));
'''

# quiz liste (mode stack) : valeurs par defaut QFF, la spec peut tout surcharger
STACK_DEFAULTS = {"preset": "qff-stack", "theme": "qff", "language": "en",
                  "timing": {"show": 1, "listen": 3, "think": 0, "countdown": 2, "reveal": 1.5, "endHold": 6.5},
                  # bandeau raccourci pour que le logo QFF soit visible a sa droite (il etait cache par la carte)
                  "layout": {"title_banner": {"w": 0.78}, "title": {"w": 0.72},
                             "brand_logo": {"x": 0.845, "y": 0.071, "w": 0.13, "h": 0.088}},
                  "end": {"text": "How many did you get?",
                          "say": "How many did you get? Tell us in the comments, and follow for a new quiz every day!"}}
STACK_CTA_SAY = "Enjoying it? Hit like and follow!"


def stack_full(raw, img=None):
    m = json.loads(json.dumps(STACK_DEFAULTS))
    for k, v in raw.items():
        m[k] = {**m[k], **v} if isinstance(v, dict) and isinstance(m.get(k), dict) else v
    if raw.get("backgrounds") and "background" not in raw:
        m["background"] = {"images": [f"file:{name}" for name in raw["backgrounds"]],
                           "blur": 16, "dim": 0.5, "motion": "pingpong", "zoom": 1.12}
    for k in ("cover", "stinger", "noCta", "backgrounds"):
        m.pop(k, None)
    if len(m["items"]) > 4 and not raw.get("noCta") and not any(
            x.get("after") == "question_3" for x in m.get("sequence", [])):
        m.setdefault("sequence", []).append({
            "after": "question_3", "id": "cta_like", "duration": 2.5, "showList": True,
            "say": STACK_CTA_SAY,
            "elements": [
                {"id": "cta_panel", "type": "rect", "x": 135, "y": 302, "w": 810, "h": 390, "fill": "#0F3678", "radius": 25},
                {"id": "cta_heart", "type": "image", "src": "file:heart.png", "x": 460, "y": 318, "w": 160, "h": 160, "fit": "contain"},
                {"id": "cta_text", "type": "text", "text": "LIKE & FOLLOW", "x": 540, "y": 560, "fontSize": 72,
                 "maxWidth": 760, "color": "#FECD1B", "bold": True, "align": "center"},
                {"id": "cta_handle", "type": "text", "text": "@quiz.factory.forever", "x": 540, "y": 640, "fontSize": 40,
                 "maxWidth": 760, "color": "#FFFFFF", "bold": True, "align": "center"}]})
    return m


def stack_timer(full, clips):
    """Petit minuteur en haut de la carte pendant le temps de reflexion (calcule sur la duree reelle des voix)."""
    import soundfile as sf
    tm = full["timing"]
    cd = tm.get("countdown", 0)
    if cd < 1:
        return full
    d = lambda k: sf.info(f"{clips}/{k}.wav").duration if os.path.exists(f"{clips}/{k}.wav") else 0
    fr = lambda x: round(x * 30) / 30
    for i, it in enumerate(full["items"]):
        if it.get("audio"):
            continue
        t0 = fr(max(tm["show"], d(f"question_{i + 1}") + 0.3) + it.get("think", tm.get("think", 0)))
        vis = {"opacity": [{"t": 0, "v": 0}, {"t": max(0, t0 - 0.01), "v": 0}, {"t": t0, "v": 1},
                           {"t": t0 + cd - 0.04, "v": 1}, {"t": t0 + cd, "v": 0}]}
        els = [{"id": "timer_bg", "type": "rect", "x": 500, "y": 320, "w": 80, "h": 80, "radius": 40,
                "fill": "#FECD1B", "keyframes": vis}]
        for k in range(int(cd)):
            a, b = t0 + k, t0 + k + 1 - 0.04
            els.append({"id": f"timer_{k}", "type": "text", "text": str(int(cd) - k), "x": 540, "y": 378,
                        "fontSize": 50, "color": "#0B1E4A", "bold": True, "align": "center",
                        "keyframes": {"opacity": [{"t": 0, "v": 0}, {"t": max(0, a - 0.01), "v": 0}, {"t": a, "v": 1},
                                                  {"t": b, "v": 1}, {"t": b + 0.02, "v": 0}]}})
        it.setdefault("elements", []).extend(els)
    return full


VOICE_SCRIPT_MJS = r'''import { register } from "tsx/esm/api";
register();
const fs = await import("node:fs"); const path = await import("node:path");
const { compileQuiz } = await import(path.join(process.cwd(), "packages/core/quiz.ts"));
const { normalizeLevels } = await import(path.join(process.cwd(), "packages/core/levels.ts"));
const spec = normalizeLevels(JSON.parse(fs.readFileSync(process.argv[2], "utf8")));
const { voiceScript } = compileQuiz(spec, undefined, { voiceDurations: {} });
fs.writeFileSync(process.argv[3], JSON.stringify(voiceScript.map(({ id, text }) => ({ id, text }))));
'''


def ensure_ffmpeg():
    """Certains environnements cloud n'ont pas ffmpeg/ffprobe : on prend ceux fournis par les paquets npm d'Animatelier."""
    b = f"{D}/bin"
    if os.path.isdir(b) and b not in os.environ.get("PATH", ""):
        os.environ["PATH"] = b + os.pathsep + os.environ.get("PATH", "")
    for name, src in (("ffmpeg", f"{REPO}/node_modules/ffmpeg-static/ffmpeg"),
                      ("ffprobe", f"{REPO}/node_modules/@ffprobe-installer/linux-x64/ffprobe")):
        if not shutil.which(name) and os.path.exists(src):
            os.makedirs(b, exist_ok=True)
            if not os.path.lexists(f"{b}/{name}"):
                os.symlink(src, f"{b}/{name}")
            if b not in os.environ["PATH"]:
                os.environ["PATH"] = b + os.pathsep + os.environ["PATH"]


def sh(cmd, check=True, quiet=True, **kw):
    r = subprocess.run(cmd, shell=True, text=True, capture_output=quiet, **kw)
    if check and r.returncode:
        sys.exit(f"ECHEC: {cmd}\n{(r.stderr or '')[-1500:]}")
    return r.stdout if quiet else ""


SHEET = "162L53rn0NUbo5AtKyx4k16KtNHgVTUEDtL1F4HbeK5w"
FOLDERS = {"photos": "1CsNoj2JJVOmoHYjzkSivZmBDLvT7k-T4", "tools": "1XLpyqA5pumJCd6n_TWinc1d4xRrDLXLR",
           "music": "1iW1YssT1eHL_rooLOzcLzHwJw8D5rRBJ"}
MUSIC_OK = ["joyeux.mp3", "action-rock.mp3", "detente-lofi.mp3", "suspense.mp3"]  # sans Content ID signale
TABS = ("Plannification quiz", "Questions posées", "Photos utilisées")
SHEET_SONS = "10vdd1Mdgepypyiv_YkhRPVOHJssTehZq9VCCsExG9Aw"
TABS_SONS = ("Plannification quiz sons", "Sons utilisés")
IMG_EXT = (".jpg", ".jpeg", ".png", ".webp")
GENERATED = {"qff-logo.png", "listen.png", "speaker_l.png", "speaker_r.png", "heart.png"}
CTA = {"after": "question_3", "id": "cta_like", "duration": 2.5,
       "say": "Quick favor! Tap like, and follow the page. Now, let's keep going!",
       "elements": [{"id": "cta_heart", "type": "image", "src": "file:heart.png", "x": 390, "y": 520, "w": 300, "h": 300,
                     "keyframes": {"scale": [{"t": 0, "v": 0.6}, {"t": 0.25, "v": 1.1}, {"t": 0.4, "v": 1}, {"t": 1.2, "v": 1},
                                             {"t": 1.35, "v": 1.12}, {"t": 1.5, "v": 1}]}},
                    {"id": "cta_t1", "type": "text", "x": 540, "y": 960, "align": "center", "fontSize": 96, "bold": True,
                     "color": "#FDF8E3", "text": "LIKE & FOLLOW"},
                    {"id": "cta_t2", "type": "text", "x": 540, "y": 1060, "align": "center", "fontSize": 52, "bold": True,
                     "color": "#FECD1B", "text": "then let's keep going!"}]}
# quiz sonore : fond bleu clair, haut-parleurs autour du logo, son 5 s (4 s ecoute + 1 s de decompte masque), pas de tic
SOUND = {
    "theme": {"extends": "qff", "panel": "#0B4F9C", "track": "#1C6FC4", "muted": "#D6ECFF",
              "backdrop": {"type": "linear", "color": "#1E88E5", "color2": "#64C3F7", "angle": 160}},
    "intro": {"logoSeconds": 0, "subtitle": "15 SOUNDS TO GUESS",
              "elements": [{"id": "cover_logo_big", "type": "image", "src": "file:qff-logo.png", "x": 340, "y": 400, "w": 400, "h": 400, "radius": 48},
                           {"id": "cover_spk_l", "type": "image", "src": "file:speaker_l.png", "x": 20, "y": 450, "w": 300, "h": 300},
                           {"id": "cover_spk_r", "type": "image", "src": "file:speaker_r.png", "x": 760, "y": 450, "w": 300, "h": 300}],
              "layout": {"brand_logo": {"visible": False}, "badge_*": {"visible": False}, "intro_title": {"y": 0.10, "fontSize": 140},
                         "intro_subtitle": {"y": 0.555, "fontSize": 58}, "intro_tagline": {"y": 0.845, "fontSize": 64}}},
    "timing": {"countdown": 1, "listen": 4},
    "voice": {"offsets": {"intro": 2.7}},
    "layout": {"count_*": {"visible": False}, "countdown_*": {"visible": False}, "listen_remaining_*": {"visible": False}},
}


def g(api, path="", body=None, method=None, raw=False, **extra):
    """Appel Google via la passerelle n8n QFF - Drive (compte agents)."""
    p = {"key": DKEY, "api": api, "path": path, **extra}
    if body is not None:
        p["body"] = body
    if method:
        p["method"] = method
    req = urllib.request.Request(DRIVE, data=json.dumps(p).encode(),
                                 headers={"Content-Type": "application/json", "User-Agent": "curl/8.5"})
    data = urllib.request.urlopen(req, timeout=300).read()
    if raw:
        return data
    r = json.loads(data or b"{}")
    if isinstance(r, dict) and r.get("error"):
        sys.exit(f"ECHEC google {path}: {json.dumps(r['error'])[:500]}")
    return r


def rng(tab, cols):
    return urllib.parse.quote(f"'{tab}'!{cols}", safe="")


def dfiles(parent, extra=""):
    q = urllib.parse.quote(f"'{FOLDERS.get(parent, parent)}' in parents and trashed=false{extra}", safe="")
    return g("drive", f"drive/v3/files?q={q}&fields=files(id,name,webViewLink)&pageSize=1000")["files"]


def dfolder(parent, name):
    f = dfiles(parent, f" and name='{name}' and mimeType='application/vnd.google-apps.folder'")
    if f:
        return f[0]
    return g("drive", "drive/v3/files?fields=id,name,webViewLink",
             body={"name": name, "mimeType": "application/vnd.google-apps.folder", "parents": [FOLDERS.get(parent, parent)]})


def dupload(folder_id, name, data, mime):
    import base64
    meta = g("drive", "drive/v3/files?fields=id", body={"name": name, "parents": [folder_id]})
    g("upload", id=meta["id"], b64=base64.b64encode(data).decode(), mime=mime, name=name)
    return meta["id"]


def today():
    return datetime.datetime.now(TZ).date()


def slot_index(slot):
    n = (today() - datetime.date(2026, 9, 24)).days
    return n * 3 + {"7": 0, "14": 1}.get(str(slot), 2)


def merged(spec_path):
    s = json.load(open(spec_path))
    m = json.loads(json.dumps(PRESET))
    for k, v in s.items():
        if k in ("intro", "outro", "timing", "voice") and isinstance(v, dict):
            m[k].update(v)
        else:
            m[k] = v
    sound = is_sound(m)
    if sound:
        si = s.get("intro", {})
        if "theme" not in s:
            m["theme"] = SOUND["theme"]
        m["layout"] = {**SOUND["layout"], **s.get("layout", {})}
        intro = {**PRESET["intro"], **SOUND["intro"], **si}
        intro["say"] = si.get("say", "Can you recognize these fifteen sounds?")
        intro["elements"] = SOUND["intro"]["elements"] + [e for e in si.get("elements", []) if not e["id"].startswith(("cover_logo", "cover_spk"))]
        intro["layout"] = {**SOUND["intro"]["layout"], **si.get("layout", {})}
        m["intro"] = intro
        m["timing"] = {**PRESET["timing"], **SOUND["timing"], **s.get("timing", {})}
        m["voice"] = {**m["voice"], "offsets": {**SOUND["voice"]["offsets"], **s.get("voice", {}).get("offsets", {})}}
        d = m.setdefault("defaults", {})
        d.setdefault("audioDuringCountdown", "continue")
        for L in m["levels"]:
            for q in L["questions"]:
                if "audio" in q:
                    q["audio"] = "file:loop/" + os.path.splitext(os.path.basename(q["audio"]))[0] + ".wav"
                    q.pop("audioStart", None)
                    q.setdefault("image", "file:listen.png")
    m.pop("stinger", None)
    cover = m.pop("cover", [])
    els = m["intro"].setdefault("elements", [])
    if not any(e.get("id") == "cover_logo_big" for e in els):
        els.insert(0, PRESET["intro"]["elements"][0])
    for i, name in enumerate(cover[:3]):
        if sound:
            els.append({"id": f"cover_img_{i}", "type": "image", "src": f"file:{name}", "fit": "cover",
                        "x": 150 + 275 * i, "y": 1060, "w": 230, "h": 230, "radius": 115})
        else:
            els.append({"id": f"cover_img_{i}", "type": "image", "src": f"file:{name}", "fit": "cover",
                        "x": 150 + 270 * i, "y": 985, "w": 240, "h": 160, "radius": 12})
    if not m.pop("noCta", False) and not any(x.get("id") == "cta_like" for x in m.get("sequence", [])):
        m.setdefault("sequence", []).append(CTA)
    return m


def allq(s):
    """Toutes les questions d'un spec : niveaux (mode levels) ou items (mode stack, quiz liste)."""
    if s.get("mode") == "stack":
        return [dict(x, q=x.get("q", "")) for x in s.get("items", [])]
    return [q for L in s.get("levels", []) for q in L.get("questions", [])]


def is_sound(s):
    return any("audio" in q for q in allq(s))


def draw_assets(img):
    from PIL import Image, ImageDraw
    Y, N = "#FECD1B", "#07275F"
    def speaker(S=480):
        im = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im); k = S / 800
        for col, off in ((N, 14), (Y, 0)):
            o = off * k
            d.rectangle((130 * k - o, 320 * k - o, 220 * k + o, 480 * k + o), fill=col)
            d.polygon([(220 * k - o, 320 * k - o), (350 * k + o, 200 * k - o * 1.5), (350 * k + o, 600 * k + o * 1.5), (220 * k - o, 480 * k + o)], fill=col)
            for r in (120, 210, 300):
                d.arc(((350 - r) * k - o, (400 - r) * k - o, (350 + r) * k + o, (400 + r) * k + o), -48, 48, fill=col, width=int((34 + 2 * off) * k))
        return im
    sp = speaker(); sp.save(f"{img}/speaker_r.png"); sp.transpose(Image.FLIP_LEFT_RIGHT).save(f"{img}/speaker_l.png")
    bg = Image.new("RGB", (800, 800), "#0B4F9C"); big = speaker(800); bg.paste(big, (40, 0), big); bg.save(f"{img}/listen.png")
    import math
    S = 4  # coeur classique (courbe parametrique), dessine en x4 puis reduit pour des bords lisses
    h = Image.new("RGBA", (400 * S, 400 * S), (0, 0, 0, 0)); d = ImageDraw.Draw(h)
    def heart(scale):
        pts = []
        for i in range(360):
            t = math.radians(i)
            x = 16 * math.sin(t) ** 3
            y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
            pts.append(((200 + x * scale) * S, (190 - y * scale) * S))
        return pts
    d.polygon(heart(11.5), fill=N); d.polygon(heart(10.3), fill="#FF3B5C")
    h.resize((400, 400), Image.LANCZOS).save(f"{img}/heart.png")


def make_loops(spec, img, L=5.0):
    """Chaque son de question -> img/loop/<nom>.wav : 5 s depuis audioStart (ou la zone la plus forte), repete si court."""
    import numpy as np, soundfile as sf, librosa, pyloudnorm as pyln
    SR = 48000; M = pyln.Meter(SR, block_size=0.2)
    os.makedirs(f"{img}/loop", exist_ok=True)
    for Lv in spec["levels"]:
        for q in Lv["questions"]:
            if "audio" not in q:
                continue
            src = f"{img}/{q['audio'][5:]}"
            y, _ = librosa.load(src, sr=SR, mono=True)
            st = q.get("audioStart")
            if st is None and len(y) > L * SR:
                hop = 512; r = librosa.feature.rms(y=y, hop_length=hop)[0]; n = int(L * SR / hop)
                i = int(np.argmax(np.convolve(r ** 2, np.ones(n), "valid"))) if len(r) > n else 0
                db = 20 * np.log10(r + 1e-9); on = int(np.argmax(db[i:i + n] > db.max() - 20))
                st = max(0, (i + on) * hop / SR - 0.15)
            y = y[int((st or 0) * SR):]
            y, _ = librosa.effects.trim(y, top_db=40)
            out = y
            while len(out) < L * SR:
                out = np.concatenate([out, np.zeros(int(0.35 * SR)), y])
            out = out[:int(L * SR)].copy(); f = int(0.25 * SR)
            out[-f:] *= np.linspace(1, 0, f); out[:480] *= np.linspace(0, 1, 480)
            out = pyln.normalize.loudness(out, M.integrated_loudness(out), -18); out /= max(1, np.abs(out).max() / 0.95)
            sf.write(f"{img}/loop/{os.path.splitext(os.path.basename(src))[0]}.wav", out, SR)


STOP = set("a an the of in on at to is are was were which what who whom whose how many much this that these those one do does did and or for by with from its it s name last tricky easy careful".split())


def norm(t):
    return [w for w in re.sub(r"[^a-z0-9 ]", " ", t.lower().replace("→", " ")).split() if w not in STOP]


# ---------------------------------------------------------------- commandes
def setup():
    os.makedirs(D, exist_ok=True)
    if not os.path.isdir(REPO):
        sh(f"git clone -q --depth 1 https://github.com/Adel-11/animatelier.git {REPO}")
    if not os.path.isdir(f"{REPO}/node_modules"):
        sh(f"cd {REPO} && npm ci --silent --no-audit --no-fund")
    open(f"{REPO}/voice_script.qff.mjs", "w").write(VOICE_SCRIPT_MJS)
    if not shutil.which("espeak-ng"):
        sh("apt-get install -y -q espeak-ng >/dev/null 2>&1 || (apt-get update -q >/dev/null && apt-get install -y -q espeak-ng >/dev/null)", check=False)
    sh("pip install -q --break-system-packages kokoro-onnx soundfile librosa pyloudnorm pillow 2>&1 | grep -v WARN || true")
    os.makedirs(KOK, exist_ok=True)
    base = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
    for f in ("kokoro-v1.0.onnx", "voices-v1.0.bin"):
        if not os.path.exists(f"{KOK}/{f}"):
            sh(f"curl -sSL -o {KOK}/{f} {base}{f}")
    ensure_ffmpeg()
    miss = [x for x in ("ffmpeg", "ffprobe") if not shutil.which(x)]
    if miss:
        sh("apt-get install -y -q ffmpeg >/dev/null 2>&1 || (apt-get update -q >/dev/null && apt-get install -y -q ffmpeg >/dev/null)", check=False)
    print("setup ok" if all(shutil.which(x) for x in ("ffmpeg", "ffprobe")) else "setup ok (ATTENTION : ffmpeg/ffprobe introuvables)")


def state(kind=""):
    snd = kind == "sons"
    plan = rng(TABS_SONS[0], "A2:G") if snd else rng(TABS[0], "A2:G")
    r = g("sheets", f"spreadsheets/{SHEET_SONS if snd else SHEET}/values:batchGet?ranges={plan}")
    r2 = g("sheets", f"spreadsheets/{SHEET}/values:batchGet?ranges={rng(TABS[1], 'A2:C')}&ranges={rng(TABS[2], 'A2:E')}")
    v = [r["valueRanges"][0].get("values", [])] + [x.get("values", []) for x in r2["valueRanges"]]
    sons = []
    if snd:
        sons = g("sheets", f"spreadsheets/{SHEET_SONS}/values:batchGet?ranges={rng(TABS_SONS[1], 'A2:E')}")["valueRanges"][0].get("values", [])
    def _ord(x, i):
        try:
            return float(str((x + [""] * 6)[5]).replace(",", "."))
        except ValueError:
            return 1e6 + i
    topics = [{"sujet": x[0], "type": (x + [""])[1], "fait": str((x + ["", ""])[2]).upper() == "TRUE",
               "date": (x + [""] * 4)[3], "ordre": _ord(x, i), "commentaire": (x + [""] * 7)[6].strip()}
              for i, x in enumerate(v[0]) if x and x[0].strip()]
    topics.sort(key=lambda t: t["ordre"])
    st = {"topics": topics, "questions": [x + [""] * (3 - len(x)) for x in v[1] if x], "photos": [[x[0], (x + [""] * 5)[4]] for x in v[2] if x],
          "sons": [[x[0], (x + [""] * 5)[1], (x + [""] * 5)[4]] for x in sons if x]}
    json.dump(st, open(f"{D}/state.json", "w"))
    todo = [f"{t['sujet']}|{t['type']}" for t in topics if not t["fait"]]
    nxt = next((t for t in topics if not t["fait"]), None)
    if nxt:
        print(f"PROCHAIN SUJET (ordre {nxt['ordre']:g}) : {nxt['sujet']} | type : {nxt['type']}")
        print(f"COMMENTAIRE D'ADEL (a respecter) : {nxt['commentaire'] or 'aucun'}")
    done = [f"{t['sujet']} ({t['date'][:10]})" for t in topics if t["fait"]]
    print(f"A faire ({len(todo)}): " + "; ".join(todo))
    print("Deja faits: " + "; ".join(done))
    print("Quiz deja publies: " + "; ".join(sorted({q[2] for q in st['questions']})))
    if snd:
        print("Sons deja utilises: " + "; ".join(sorted({x[1] for x in st["sons"]})))
    print(f"{len(st['questions'])} questions deja posees, {len(st['photos'])} photos connues (doublons verifies par check)")


def check(spec_path):
    st = json.load(open(f"{D}/state.json"))
    asked = [(q[0], set(norm(q[0].split("→")[0])), norm(q[0].split("→")[-1])) for q in st["questions"]]
    s = json.load(open(spec_path))
    issues = []
    n = 0
    for q in allq(s):
        n += 1
        qa, qw = norm(q["a"]), set(norm(q["q"]))
        for txt, w, a in asked:
            if qa == a and (qw & w or not qw or not w):
                issues.append(f"Q{n} « {q['q']} → {q['a']} » ressemble a « {txt} »")
                break
    known = {h for h, _ in st["photos"]}
    img = os.path.join(os.path.dirname(os.path.abspath(spec_path)), "img")
    for f in sorted(glob.glob(f"{img}/*")):
        if not f.lower().endswith(IMG_EXT) or os.path.basename(f) in GENERATED:
            continue
        if hashlib.sha256(open(f, "rb").read()).hexdigest()[:16] in known:
            issues.append(f"image deja utilisee : {os.path.basename(f)}")
    ksons = {x[0] for x in st.get("sons", [])}
    for f in sorted(glob.glob(f"{img}/sons/*")):
        if not f.endswith(".json") and hashlib.sha256(open(f, "rb").read()).hexdigest()[:16] in ksons:
            issues.append(f"son deja utilise : {os.path.basename(f)}")
    if s.get("mode") == "stack":
        if not 5 <= n <= 15:
            issues.append(f"{n} items (quiz liste : 5 a 15)")
    elif n != 15:
        issues.append(f"{n} questions au lieu de 15")
    print("\n".join(issues) if issues else "OK, aucun doublon")


def find(query, n=12):
    u = "https://api.openverse.org/v1/images/?" + urllib.parse.urlencode(
        {"q": query, "license_type": "commercial", "page_size": n, "mature": "false"})
    r = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "QFF/1.0"}), timeout=60))
    for x in r.get("results", []):
        print(f"{x['id']} | {x.get('license','')} {x.get('license_version','')} | {(x.get('creator') or '?')[:30]} | "
              f"{x.get('width')}x{x.get('height')} | {x.get('title','')[:50]} | {x['url']}")


def soundsearch(query, n=15):
    u = "https://api.openverse.org/v1/audio/?" + urllib.parse.urlencode(
        {"q": query, "source": "wikimedia_audio", "license": "cc0,pdm,by,by-sa", "page_size": 20})
    r = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "QFF/1.0"}), timeout=60))
    k = 0
    for x in r.get("results", []):
        t, du = x.get("title", ""), (x.get("duration") or 0) / 1000
        if re.search(r"^(LL-Q|[A-Z][a-z]{1,2}-)|pronunciation|Wikipedia|LibriVox", t) or not 1.2 < du < 180:
            continue
        print(f"{t[:60]} | {x.get('license')} {x.get('license_version') or ''} | {du:.1f}s | {(x.get('creator') or '?')[:30]} | {x['url']}")
        k += 1
        if k >= int(n):
            break


def fetch(url, name, credit=""):
    q = os.environ.get("QFF_QUIZ") or sys.exit("definir QFF_QUIZ (dossier du quiz)")
    img = f"{q}/img"
    os.makedirs(img, exist_ok=True)
    tmp = f"{img}/.dl"
    urls = [url]
    m = re.match(r"^[0-9a-f-]{36}$", url)
    if m:  # id Openverse : vignette servie par l'API
        urls = [f"https://api.openverse.org/v1/images/{url}/thumb/?full_size=true"]
    ok = False
    for u in urls:
        r = subprocess.run(["curl", "-sSL", "-m", "90", "-A", "QFF/1.0", "-o", tmp, "-w", "%{http_code}", u], capture_output=True, text=True)
        ok = r.stdout.strip() == "200"
        if ok:
            break
    if not ok:
        sys.exit(f"ECHEC telechargement {url} ({r.stdout})")
    from PIL import Image
    im = Image.open(tmp).convert("RGB")
    im.thumbnail((1400, 1400))
    im.save(f"{img}/{name}", quality=90)
    os.remove(tmp)
    cj = f"{img}/credits.json"
    c = json.load(open(cj)) if os.path.exists(cj) else {}
    c[name] = {"source": url, "credit": credit}
    json.dump(c, open(cj, "w"), indent=1)
    print(f"{name} {im.size[0]}x{im.size[1]}")


def _listen_windows(tl):
    r = []
    def walk(x):
        if isinstance(x, dict):
            if "listenStart" in x and "listenEnd" in x:
                r.append((x["listenStart"], max(x["listenEnd"], x.get("reveal", 0) if x.get("audioDuringCountdown", "continue") != "stop" else 0)))
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    walk(tl)
    return r


def mix(out, clips, music, dst):
    import numpy as np, soundfile as sf, librosa, pyloudnorm as pyln
    SR = 48000
    vs = json.load(open(f"{out}/voice-script.json"))
    dur = json.load(open(f"{out}/timeline.json"))["duration"]
    N = int(dur * SR)
    voice = np.zeros(N)
    fs = os.path.join(os.path.dirname(out), "spec.full.json")
    intro_off = (json.load(open(fs)).get("voice", {}).get("offsets", {}).get("intro", 0.3)) if os.path.exists(fs) else 0.3
    for s in vs:
        f = f"{clips}/{s['id']}.wav"
        if not os.path.exists(f):
            continue
        w, _ = sf.read(f)
        st = s["start"] + (intro_off if s["id"] == "intro" else 0.1 if s["id"].endswith("_answer") else 0)
        i = int(st * SR)
        voice[i:i + len(w)] += w[:max(0, N - i)]
    meter = pyln.Meter(SR)
    voice = pyln.normalize.loudness(voice, meter.integrated_loudness(voice), -16)
    snd = np.zeros(N)
    if os.path.exists(f"{out}/sounds.wav"):  # sons des questions (quiz sonores), deja normalises par l'outil
        w, sr2 = sf.read(f"{out}/sounds.wav")
        w = w.mean(1) if w.ndim > 1 else w
        if sr2 != SR:
            w = librosa.resample(w, orig_sr=sr2, target_sr=SR)
        w = w[:N] * 10 ** (3.5 / 20)
        snd[:len(w)] = w
    stg = os.path.join(os.path.dirname(out), "stinger.wav")  # petit jingle sonore au tout debut (optionnel)
    if os.path.exists(stg):
        w, _ = sf.read(stg)
        w = (w.mean(1) if w.ndim > 1 else w)[:N]
        snd[:len(w)] += w * 10 ** (3.5 / 20)
    if not music:
        sf.write(dst, np.stack([voice + snd] * 2, 1), SR, subtype="FLOAT")
        return
    m, _ = librosa.load(music, sr=SR, mono=True)
    m = np.tile(m, int(np.ceil(N / len(m))))[:N]
    t = np.arange(N) / SR
    m *= np.minimum(1, t / 0.5) * np.clip((dur - t) / 2.5, 0, 1)
    m = pyln.normalize.loudness(m, meter.integrated_loudness(m), -33)  # fond musical (baisse a la demande d'Adel)
    env = np.convolve(np.abs(voice), np.ones(int(0.25 * SR)) / int(0.25 * SR), mode="same")

    gate = np.clip(env / (np.percentile(env[env > 1e-4], 30) + 1e-9), 0, 1)
    gate = np.convolve(gate, np.ones(int(0.15 * SR)) / int(0.15 * SR), mode="same")
    m *= 10 ** (-10 * gate / 20)
    if snd.any():  # musique coupee pendant les phases d'ecoute, fondus de 0,3 s
        mask = np.ones(N)
        stl = len(sf.read(stg)[0]) / SR if os.path.exists(stg) else 0
        for a, b in _listen_windows(json.load(open(f"{out}/timeline.json"))) + ([(0.2, stl)] if stl else []):
            mask[max(0, int((a - 0.2) * SR)):int((b + 0.2) * SR)] = 0
        k = int(0.3 * SR)
        m *= np.convolve(mask, np.ones(k) / k, mode="same")
    sf.write(dst, np.stack([voice + m + snd] * 2, 1), SR, subtype="FLOAT")


def make_stinger(spec, img, dst, total=2.6):
    """Jingle d'intro lie au theme : "stinger": ["file:sons/a.ogg", "file:sons/b.ogg"] (1 ou 2 sons droles/typiques,
    pas ceux des questions). Le passage le plus fort de chacun, enchaines, 2,6 s max. Sans "stinger" : pas de jingle."""
    import numpy as np, soundfile as sf, librosa, pyloudnorm as pyln
    if os.path.exists(dst):
        os.remove(dst)
    src = [s[5:] if s.startswith("file:") else s for s in (spec.get("stinger") or [])][:2]
    if not src:
        return
    SR = 48000
    part = total / len(src) - 0.1
    parts = []
    for s in src:
        y, _ = librosa.load(f"{img}/{s}", sr=SR, mono=True)
        y, _ = librosa.effects.trim(y, top_db=40)
        n = int(part * SR)
        if len(y) > n:
            r = librosa.feature.rms(y=y, hop_length=512)[0]; k = max(1, n // 512)
            i = int(np.argmax(np.convolve(r ** 2, np.ones(k), "valid"))) if len(r) > k else 0
            y = y[i * 512:i * 512 + n]
        f = min(len(y) // 4, int(0.08 * SR))
        if f:
            y[:f] *= np.linspace(0, 1, f); y[-f:] *= np.linspace(1, 0, f)
        parts += [y, np.zeros(int(0.1 * SR))]
    out = np.concatenate(parts)[:int(total * SR)]
    out = pyln.normalize.loudness(out, pyln.Meter(SR, block_size=0.2).integrated_loudness(out), -18)
    out /= max(1, np.abs(out).max() / 0.95)
    sf.write(dst, out, SR)


def build(spec_path, slot):
    spec_path = os.path.abspath(spec_path)
    q = os.path.dirname(spec_path)
    img, clips, out = f"{q}/img", f"{q}/clips", f"{q}/out"
    os.makedirs(img, exist_ok=True)
    shutil.copy(f"{REPO}/brands/qff/logo.png", f"{img}/qff-logo.png")
    draw_assets(img)
    raw = json.load(open(spec_path))
    if is_sound(raw):
        make_loops(raw, img)
        json.dump({"tick": None}, open(f"{q}/sfx.json", "w"))
        make_stinger(raw, img, f"{q}/stinger.wav")
    full = f"{q}/spec.full.json"
    voice = VOICES[slot_index(slot) % 4]
    if raw.get("mode") == "stack":  # quiz liste
        json.dump(stack_full(raw, img), open(full, "w"))
        open(f"{REPO}/voice_script_stack.qff.mjs", "w").write(VOICE_SCRIPT_STACK_MJS)
        sh(f"cd {REPO} && node voice_script_stack.qff.mjs {full} {q}/voice-script.json")
    else:
        json.dump(merged(spec_path), open(full, "w"))
        sh(f"cd {REPO} && node voice_script.qff.mjs {full} {q}/voice-script.json")
    shutil.rmtree(clips, ignore_errors=True)
    os.makedirs(clips)
    import numpy as np, soundfile as sf, librosa
    from kokoro_onnx import Kokoro
    k = Kokoro(f"{KOK}/kokoro-v1.0.onnx", f"{KOK}/voices-v1.0.bin")
    for s in json.load(open(f"{q}/voice-script.json")):
        w, sr = k.create(s["text"], voice=voice, speed=1.05, lang="en-gb" if voice[0] == "b" else "en-us")
        w, _ = librosa.effects.trim(w, top_db=38)
        sf.write(f"{clips}/{s['id']}.wav", librosa.resample(w, orig_sr=sr, target_sr=48000), 48000)
    if raw.get("mode") == "stack":
        json.dump(stack_timer(json.load(open(full)), clips), open(full, "w"))
    shutil.rmtree(out, ignore_errors=True)
    jobs = max(1, os.cpu_count() or 2)
    sfx = f"{q}/sfx.json" if os.path.exists(f"{q}/sfx.json") else "default"  # ex. {"tick": null}
    vopt = f"--voice-clips {clips}"
    if raw.get("mode") == "stack":  # durees passees d'emblee : les elements d'item (minuteur) sont valides avec les vraies durees
        import soundfile as sf
        json.dump({os.path.basename(f)[:-4]: round(sf.info(f).duration, 3) for f in glob.glob(f"{clips}/*.wav")},
                  open(f"{q}/voice-durations.json", "w"))
        vopt = f"--voice-durations {q}/voice-durations.json"
    r = sh(f"cd {REPO} && node apps/cli/quiz-video.js {full} --assets-dir {img} {vopt} --sfx {sfx} "
           f"--preview auto --preview-scale 0.3 --jobs {jobs} --out {out}" + (f" --sounds-out {out}/sounds.wav" if '"audio"' in open(full).read() else ""))
    res = json.loads(r.strip().splitlines()[-1])
    # musique : alternance dans le dossier Drive Musiques
    music = None
    try:
        files = {f["name"]: f["id"] for f in dfiles("music")}
        names = [n for n in MUSIC_OK if n in files]
        if names:
            name = names[slot_index(slot) % len(names)]
            music = f"{D}/music/{name}"
            if not os.path.exists(music):
                os.makedirs(f"{D}/music", exist_ok=True)
                open(music, "wb").write(g("download", id=files[name], raw=True))
    except (SystemExit, Exception) as e:
        print("musique indisponible:", e, file=sys.stderr)
        music = None
    mixf = f"{q}/mix.wav"
    mix(out, clips, music, mixf)
    sh(f"ffmpeg -loglevel error -y -i {out}/video.mp4 -an -c:v copy {out}/silent.mp4")
    sh(f"ffmpeg -loglevel error -y -f lavfi -i anullsrc=r=48000:cl=stereo -t {res['duration'] + 1:.1f} {q}/silence.wav")
    sh(f"rm -f {q}/sfxonly.mp4 && cd {REPO} && node apps/cli/mux-audio.js {out}/silent.mp4 --audio {q}/silence.wav --keep-sfx" + (f" --sfx {sfx}" if sfx != "default" else "") + f" --out {q}/sfxonly.mp4")
    sh(f"ffmpeg -loglevel error -y -i {q}/sfxonly.mp4 -vn -ar 48000 {q}/sfx.wav")
    sh(f"ffmpeg -loglevel error -y -i {mixf} -i {q}/sfx.wav -filter_complex \"[1:a]volume=-8dB[s];[0:a][s]amix=inputs=2:normalize=0,aresample=192000,alimiter=limit=0.72:attack=1:release=50:level=disabled,aresample=48000\" -c:a pcm_s16le {q}/final-audio.wav")
    sh(f"rm -f {q}/final.mp4 && cd {REPO} && node apps/cli/mux-audio.js {out}/silent.mp4 --audio {q}/final-audio.wav --out {q}/final.mp4")
    probe = sh(f"ffprobe -v error -show_entries stream=codec_name,sample_rate,channels -of compact {q}/final.mp4").split()
    lufs = sh(f"ffmpeg -i {q}/final.mp4 -af ebur128=peak=true -f null - 2>&1 | grep -E '^ +(I|Peak):' | tail -2")
    elst = open(f"{q}/final.mp4", "rb").read().count(b"elst")
    print(json.dumps({"final": f"{q}/final.mp4", "preview": f"{out}/preview.jpg", "duration": round(res["duration"], 1),
                      "voice": voice, "music": os.path.basename(music) if music else "aucune", "elst": elst,
                      "probe": probe, "loudness": " ".join(lufs.split()), "warnings": res.get("warnings", [])[:6]}))


def publish(spec_path, caption):
    q = os.path.dirname(os.path.abspath(spec_path))
    r = subprocess.run(["curl", "-sS", "-m", "300", "-F", f"video=@{q}/final.mp4", "-F", f"caption={caption}",
                        "-F", "dry_run=" + os.environ.get("QFF_DRY", "false"), "-F", "facebook=true", "-F", "cover_at=2", PUB],
                       capture_output=True, text=True)
    print(r.stdout or r.stderr, flush=True)
    if '"execution_id"' in (r.stdout or ""):
        time.sleep(100)
        print("100 s écoulées : lis maintenant l'exécution n8n.")


def log(spec_path, topic="", reel=""):
    import io
    from PIL import Image
    q = os.path.dirname(os.path.abspath(spec_path))
    s = json.load(open(spec_path))
    quiz = s.get("title", "Quiz")
    date = str(today())
    qs = [[f"{x['q']} → {x['a']}", date, quiz] for x in allq(s)]
    credits = json.load(open(f"{q}/img/credits.json")) if os.path.exists(f"{q}/img/credits.json") else {}
    used = sorted({v.split("file:")[1] for v in re.findall(r'"(file:[^"]+)"', json.dumps(s))})
    used = [n for n in used if n.lower().endswith(IMG_EXT) and n not in GENERATED and "/" not in n]
    sound = is_sound(s)
    snds = sorted({q["audio"][5:] for q in allq(s) if "audio" in q})
    scred = json.load(open(f"{q}/img/sons/credits.json")) if os.path.exists(f"{q}/img/sons/credits.json") else {}
    srows = []
    photos, folder_url = [], ""
    if [n for n in used + snds if os.path.exists(f"{q}/img/{n}")]:
        fo = dfolder("photos", f"{topic or quiz} - {date}")
        folder_url = fo.get("webViewLink") or f"https://drive.google.com/drive/folders/{fo['id']}"
        lines = []
        for name in used:
            f = f"{q}/img/{name}"
            if not os.path.exists(f):
                continue
            h = hashlib.sha256(open(f, "rb").read()).hexdigest()[:16]
            src = credits.get(name, {}).get("source", "")
            photos.append([h, name, quiz, date, src])
            lines.append(f"{name} | {h} | {src} | {credits.get(name, {}).get('credit', '')}")
            im = Image.open(f).convert("RGB")
            im.thumbnail((480, 480))
            b = io.BytesIO()
            im.save(b, "JPEG", quality=80)
            dupload(fo["id"], os.path.splitext(name)[0] + ".jpg", b.getvalue(), "image/jpeg")
        for name in snds:
            f = f"{q}/img/{name}"
            if not os.path.exists(f):
                continue
            b = os.path.basename(f); c = scred.get(b, {})
            h = hashlib.sha256(open(f, "rb").read()).hexdigest()[:16]
            srows.append([h, b, quiz, date, c.get("source", ""), c.get("license", "")])
            lines.append(f"{b} | {h} | {c.get('source', '')} | {c.get('credit', '')} | {c.get('license', '')}")
            dupload(fo["id"], b, open(f, "rb").read(), "audio/ogg" if b.endswith((".ogg", ".oga")) else "audio/wav" if b.endswith(".wav") else "audio/mpeg")
        dupload(fo["id"], "sources.txt", f"{quiz} - {date}\nReel : {reel}\n\n".encode() + "\n".join(lines).encode(), "text/plain")
    r = g("sheets", f"spreadsheets/{SHEET}/values:batchGet?ranges={rng(TABS[0], 'A:A')}&ranges={rng(TABS[1], 'A:A')}&ranges={rng(TABS[2], 'A:A')}")
    cols = [x.get("values", []) for x in r["valueRanges"]]
    data = []
    nq, npho = len(cols[1]) + 1, len(cols[2]) + 1
    data.append({"range": f"'{TABS[1]}'!A{nq}:C{nq + len(qs) - 1}", "values": qs})
    if photos:
        data.append({"range": f"'{TABS[2]}'!A{npho}:E{npho + len(photos) - 1}", "values": photos})
    marked = False
    if topic and not sound:
        for i, row in enumerate(cols[0]):
            if row and row[0].strip().lower() == topic.strip().lower():
                data.append({"range": f"'{TABS[0]}'!C{i + 1}:E{i + 1}", "values": [[True, date, folder_url]]})
                marked = True
    g("sheets", f"spreadsheets/{SHEET}/values:batchUpdate", body={"valueInputOption": "USER_ENTERED", "data": data})
    if sound:
        r = g("sheets", f"spreadsheets/{SHEET_SONS}/values:batchGet?ranges={rng(TABS_SONS[0], 'A:A')}&ranges={rng(TABS_SONS[1], 'A:A')}")
        c0, c1 = [x.get("values", []) for x in r["valueRanges"]]
        d2 = []
        if srows:
            d2.append({"range": f"'{TABS_SONS[1]}'!A{len(c1) + 1}:F{len(c1) + len(srows)}", "values": srows})
        for i, row in enumerate(c0):
            if topic and row and row[0].strip().lower() == topic.strip().lower():
                d2.append({"range": f"'{TABS_SONS[0]}'!C{i + 1}:E{i + 1}", "values": [[True, date, folder_url]]})
                marked = True
        if d2:
            g("sheets", f"spreadsheets/{SHEET_SONS}/values:batchUpdate", body={"valueInputOption": "USER_ENTERED", "data": d2})
    print(json.dumps({"questions": len(qs), "photos": len(photos), "sons": len(srows), "topicMarked": marked, "folder": folder_url}))


RULES = """
- 15 questions, 3 niveaux ROOKIE / MASTER / GOAT de 5, grand public meme au niveau GOAT, reponses verifiees.
- VERIFIER LES FAITS RECENTS : toute question sur un record, un palmares, un titre, un « le plus... », un « dernier... »
  ou un evenement des 3 dernieres annees doit etre verifiee par une recherche web (WebSearch / WebFetch) AVANT
  publication, car ta memoire peut etre perimee (ex. l'Espagne a gagne la Coupe du monde 2026 : 2 titres ; Mbappe
  est devenu le meilleur buteur de l'histoire de la Coupe du monde en 2026). En cas de doute non leve, change de question.
- Anglais. Pas de question qui donne l'indice. Varier les formulations. Environ 1/3 de QCM (a + wrong:[3]).
- Nombres en toutes lettres dans aSay si la reponse est un nombre. Prononciations difficiles : voice.pronounce.
- Countdown : timing.countdown = 2 si la majorite des questions ont une image, sinon 3 (defaut du preset).
- Images : libres de droits uniquement (Openverse commercial, domaine public). Pas d'effet (imageEffect none).
  Sinon passer le theme en questions texte. Ajouter a intro.elements le logo (cover_logo_big) ET une petite
  illustration (sauf culture G) entre y=985 et y=1145 : l'ecran titre sert de couverture (grille Insta 3:4).
- intro.title = intitule du quiz en majuscules, court (ex. GUESS THE FLAG).
- "cover": ["a.jpg","b.jpg","c.jpg"] a la racine du spec = 3 petites illustrations de couverture (placement auto).
- Apres la question 3, une scene « LIKE & FOLLOW » est ajoutee automatiquement (rien a ecrire).
- Anecdotes : sur UNE question MASTER et UNE question GOAT, celles ou le public risque le plus de se tromper,
  ajouter "sayAnswer" (voix, 12 a 20 mots : l'erreur probable + un fait vrai, verifiable, amusant) et
  "explanation" (meme idee ecrite a l'ecran, 70 caracteres max). Ex : "Not a monkey! Old jungle movies used
  this Australian bird's laugh." Pas d'anecdote douteuse : en cas de doute, choisir un autre fait.
QUIZ SONORE (question avec "audio") : le preset son s'applique tout seul (fond bleu clair, haut-parleurs,
  son 5 s en boucle si court, pas de decompte).
  Jingle d'intro : "stinger": ["file:sons/a.ogg", "file:sons/b.ogg"] a la racine = 1 ou 2 sons courts, droles ou
  typiques, LIES AU THEME du quiz (ex. instruments : un gong + un kazoo ; vehicules : un klaxon), pas utilises dans
  les questions. Sans "stinger", pas de jingle (jamais de sons d'animaux si le theme n'est pas les animaux). Par question : "audio":"file:sons/x.ogg"
  (optionnel "audioStart"), "answerImage":"file:x.jpg" (photo revelee), pas de "image". intro.title "SOUND QUIZ",
  intro.subtitle ex. "15 ANIMALS TO GUESS", intro.say ex. "Can you recognize these fifteen animals, just by their sound?".
  Niveau adulte : pas de reponses trop evidentes au niveau ROOKIE (pas d'animaux domestiques par ex.).
  Sons : Openverse audio (commons.py osearch/oget), Wikimedia Commons (commons.py search/get) ou toute source libre
  (commons.py url), licences PD / CC0 / CC BY / CC BY-SA uniquement (jamais NC, ND, sampling+) ;
  credits dans img/sons/credits.json {"fichier": {"source": url, "credit": auteur, "license": licence}}.
  Legende : crediter a la fin tous les sons et photos CC BY / CC BY-SA (auteur + licence), une ligne compacte.
"""


def rules():
    print(RULES)


def wait(sec="40"):
    """Pause (les tâches cloud n'aiment pas les longs sleep lancés directement)."""
    time.sleep(min(int(sec), 110))
    print(f"{sec} s écoulées")


if __name__ == "__main__":
    a = sys.argv[1:] or ["-h"]
    cmds = {"setup": setup, "state": state, "check": check, "find": find, "fetch": fetch,
            "build": build, "publish": publish, "log": log, "rules": rules, "soundsearch": soundsearch, "wait": wait}
    if a[0] not in cmds:
        print(__doc__)
        sys.exit(0)
    ensure_ffmpeg()
    cmds[a[0]](*a[1:])
