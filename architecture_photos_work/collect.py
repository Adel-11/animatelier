import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
API = "https://commons.wikimedia.org/w/api.php"
QUERIES = [
    ("01_Grec_classique", "Parthenon Athens exterior"),
    ("02_Romain_antique", "Pantheon Rome exterior"),
    ("03_Byzantin", "Basilica San Vitale Ravenna exterior"),
    ("04_Roman", "Basilica Vezelay nave"),
    ("05_Gothique", "Chartres Cathedral exterior"),
    ("06_Renaissance", "Chateau de Chambord exterior"),
    ("07_Baroque", "Schonbrunn Palace facade"),
    ("08_Neoclassique", "Monticello Virginia house exterior"),
    ("09_Neogothique", "Palace of Westminster London exterior"),
    ("10_Art_nouveau", "Hotel Tassel Brussels"),
    ("11_Art_deco", "Chrysler Building New York exterior"),
    ("12_Bauhaus", "Bauhaus Dessau building"),
    ("13_Brutalisme", "Barbican Estate London concrete"),
    ("14_Moghol", "Taj Mahal Agra front"),
    ("15_Chateau_japonais", "Himeji Castle Japan exterior"),
]

def get_json(params):
    url = API + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": "AnimatelierArchitectureCollection/1.0 (educational research; contact via Wikimedia Commons)"})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == 5:
                raise
            time.sleep(5 * (attempt + 1))

def clean(value):
    return re.sub(r"<[^>]*>", "", html.unescape(value or "")).strip()

def candidates():
    output=ROOT/"candidates.json"
    results = json.loads(output.read_text(encoding="utf-8")) if output.exists() else []
    done={row["slug"] for row in results}
    for slug, query in QUERIES:
        if slug in done:
            continue
        data = get_json({"action":"query", "generator":"search", "gsrsearch":query,
            "gsrnamespace":6, "gsrlimit":6, "prop":"imageinfo", "iiprop":"url|size|mime|extmetadata",
            "iiurlwidth":1200, "format":"json"})
        items=[]
        for page in sorted(data.get("query",{}).get("pages",{}).values(), key=lambda p:p.get("index",99)):
            info=page.get("imageinfo",[{}])[0]
            if info.get("mime") not in ("image/jpeg", "image/png") or info.get("width",0)<1000:
                continue
            meta=info.get("extmetadata",{})
            field=lambda k: clean(meta.get(k,{}).get("value",""))
            items.append({"title":page["title"],"description":field("ImageDescription")[:160],
                "artist":field("Artist")[:160],"license":field("LicenseShortName"),
                "license_url":field("LicenseUrl"),"page_url":info.get("descriptionurl"),
                "thumb_url":info.get("thumburl"),"width":info.get("width"),"height":info.get("height")})
        results.append({"slug":slug,"query":query,"candidates":items})
        output.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding="utf-8")
        print(slug, len(items), flush=True)
        time.sleep(1)

if __name__ == "__main__":
    candidates()
