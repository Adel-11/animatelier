#!/usr/bin/env python3
"""Sons libres Wikimedia Commons (Wikimedia limite le debit du cloud : attentes et reessais automatiques, compter quelques minutes).

  python3 commons.py search "wolf howl" "Panthera leo" ...    candidats : licence | duree | taille | titre
  python3 commons.py get DOSSIER nom="Titre exact.ogg" ...     telecharge nom.ext + credits.json dans DOSSIER
                                                               (environ 1 fichier par minute : lancer en arriere-plan avec nohup)
Autres sources (rapides, a utiliser en premier ou en repli) :
  python3 commons.py osearch "sitar" "bagpipes" ...            Openverse audio (Freesound, Jamendo, Wikimedia...) : id | licence | duree | source | titre
                                                               (licences compatibles usage commercial seulement : cc0, pdm, by, by-sa)
  python3 commons.py oget DOSSIER nom=<id openverse> ...        telecharge en parallele + credits.json
  python3 commons.py url DOSSIER nom "URL" "auteur" "licence" "page source"   n'importe quelle autre source libre (Internet Archive...)
"""
import html, json, os, re, sys, urllib.parse, urllib.request

UA = {"User-Agent": "QFFQuizBot/1.0 (https://www.instagram.com/quiz.factory.forever; contact via Instagram)"}


def fetch(url, tries=8):
    """Wikimedia limite le debit des IP partagees (HTTP 429) : on respecte la limite en attendant puis en reessayant."""
    import time, urllib.error
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503) or i == tries - 1:
                raise
            time.sleep(min(20 * (i + 1), 90))
OK = ("Public domain", "CC0", "CC BY")


def api(**p):
    p.update(format="json", action="query")
    u = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(p)
    return json.loads(fetch(u))


def search(*queries):
    for q in queries:
        d = api(generator="search", gsrsearch=f"filetype:audio {q}", gsrnamespace=6, gsrlimit=15,
                prop="imageinfo", iiprop="size|extmetadata")
        pages = sorted(d.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
        print("##", q)
        for p in pages:
            ii = p["imageinfo"][0]
            lic = ii.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "?")
            du, t = ii.get("duration", 0), p["title"][5:]
            if re.search(r"^(LL-Q|[A-Z][a-z]{1,2}-)|Wikipedia|LibriVox|\.mid$", t) or not lic.startswith(OK) or not 1 < du < 300:
                continue
            print(f"  {lic[:14]:14} {du:6.1f}s {ii['size'] // 1024:6}k {t[:90]}")


def get(out, *pairs):
    os.makedirs(out, exist_ok=True)
    want = dict(p.split("=", 1) for p in pairs)
    d = api(titles="|".join("File:" + v for v in want.values()), prop="imageinfo", iiprop="url|extmetadata")
    norm = {n["to"]: n["from"] for n in d["query"].get("normalized", [])}
    by = {norm.get(p["title"], p["title"])[5:]: p for p in d["query"]["pages"].values()}
    cj = f"{out}/credits.json"
    cred = json.load(open(cj)) if os.path.exists(cj) else {}
    for k, v in want.items():
        p = by.get(v)
        if not p or "imageinfo" not in p:
            print("INTROUVABLE", k, v)
            continue
        ii = p["imageinfo"][0]
        m = ii["extmetadata"]
        ext = os.path.splitext(v)[1].lower().replace(".oga", ".ogg")
        try:
            data = fetch(ii["url"])
        except Exception as e:
            print("ECHEC", k, e)
            continue
        open(f"{out}/{k}{ext}", "wb").write(data)
        art = re.sub("<[^>]+>", "", html.unescape(m.get("Artist", {}).get("value", ""))).strip()
        cred[f"{k}{ext}"] = {"source": ii["descriptionurl"], "credit": art[:80] or "Wikimedia Commons",
                             "license": m.get("LicenseShortName", {}).get("value", "")}
        json.dump(cred, open(cj, "w"), indent=1)
        print(k + ext, len(data) // 1024, "k", cred[f"{k}{ext}"]["license"], "|", art[:40], flush=True)


OV = "https://api.openverse.org/v1/audio/"


def osearch(*queries):
    for q in queries:
        u = OV + "?" + urllib.parse.urlencode({"q": q, "license": "cc0,pdm,by,by-sa", "page_size": 20})
        d = json.loads(fetch(u))
        print("##", q, f"({d.get('result_count', 0)} resultats)")
        for x in d.get("results", []):
            du, t = (x.get("duration") or 0) / 1000, x.get("title", "")
            if not 1 < du < 300 or re.search(r"pronunciation|LibriVox|Wikipedia", t):
                continue
            print(f"  {x['id']} | {x.get('license')} {x.get('license_version') or ''} | {du:5.1f}s | {x.get('source')} | {t[:70]}")


def _save(out, k, url, credit, lic, src):
    ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower().replace(".oga", ".ogg") or ".mp3"
    if ext not in (".mp3", ".ogg", ".wav", ".flac", ".m4a", ".aiff", ".aif"):
        ext = ".mp3"
    data = fetch(url)
    open(f"{out}/{k}{ext}", "wb").write(data)
    return f"{k}{ext}", {"source": src, "credit": (credit or "?")[:80], "license": lic}, len(data)


def _credits(out, add):
    cj = f"{out}/credits.json"
    cred = json.load(open(cj)) if os.path.exists(cj) else {}
    cred.update(add)
    json.dump(cred, open(cj, "w"), indent=1)


def oget(out, *pairs):
    from concurrent.futures import ThreadPoolExecutor
    os.makedirs(out, exist_ok=True)

    def one(pair):
        k, i = pair.split("=", 1)
        try:
            x = json.loads(fetch(OV + i + "/"))
            lic = f"{'CC ' if x['license'] not in ('cc0', 'pdm') else ''}{x['license'].upper()} {x.get('license_version') or ''}".strip()
            return _save(out, k, x["url"], x.get("creator"), lic, x.get("foreign_landing_url") or x["url"])
        except Exception as e:
            print("ECHEC", k, e, flush=True)
    for r in ThreadPoolExecutor(6).map(one, pairs):
        if r:
            _credits(out, {r[0]: r[1]})
            print(r[0], r[2] // 1024, "k", r[1]["license"], "|", r[1]["credit"][:40], flush=True)


def url(out, name, link, credit="", lic="", page=""):
    os.makedirs(out, exist_ok=True)
    f, c, n = _save(out, name, link, credit, lic, page or link)
    _credits(out, {f: c})
    print(f, n // 1024, "k", lic)


if __name__ == "__main__":
    a = sys.argv[1:]
    {"search": search, "get": get, "osearch": osearch, "oget": oget, "url": url}.get(a[0] if a else "", lambda *x: print(__doc__))(*a[1:])
