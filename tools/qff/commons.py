#!/usr/bin/env python3
"""Sons libres Wikimedia Commons (Wikimedia limite le debit du cloud : attentes et reessais automatiques, compter quelques minutes).

  python3 commons.py search "wolf howl" "Panthera leo" ...    candidats : licence | duree | taille | titre
  python3 commons.py get DOSSIER nom="Titre exact.ogg" ...     telecharge nom.ext + credits.json dans DOSSIER
                                                               (environ 1 fichier par minute : lancer en arriere-plan avec nohup)
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


if __name__ == "__main__":
    a = sys.argv[1:]
    {"search": search, "get": get}.get(a[0] if a else "", lambda *x: print(__doc__))(*a[1:])
