import csv
import io
import json
import zipfile
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).parent
DEST=ROOT.parent/"livrables"/"15_styles_architecturaux_2026-09-23.zip"
selected={x["slug"]:x for x in json.loads((ROOT/"selected.json").read_text(encoding="utf-8"))}
alternatives={x["title"]:x for x in json.loads((ROOT/"alternatives.json").read_text(encoding="utf-8"))}
replacements={
"01_Grec_classique":"File:Parthenon on Acropolis in Athens.jpg",
"05_Gothique":"File:Chartres cathedral (West façade).jpg",
"07_Baroque":"File:Schonbrunn Palace - Vienna.jpg",
"12_Bauhaus":"File:Außenansichten des Bauhaus-Gebäudes in Dessau 01.jpg",
"15_Chateau_japonais":"File:Himeji castle sakura full bloom.JPG",
}
styles=[
("01_Grec_classique","Grec classique","Parthénon, Athènes","https://whc.unesco.org/en/list/404"),
("02_Romain_antique","Romain antique","Panthéon, Rome","https://www.turismoroma.it/en/places/pantheon"),
("03_Byzantin","Byzantin","Basilique San Vitale, Ravenne","https://whc.unesco.org/en/list/788"),
("04_Roman","Roman","Basilique Sainte-Marie-Madeleine, Vézelay","https://whc.unesco.org/en/list/84"),
("05_Gothique","Gothique","Cathédrale de Chartres","https://whc.unesco.org/en/list/81"),
("06_Renaissance","Renaissance française","Château de Chambord","https://www.chambord.org/fr/histoire/le-chateau/architecture/"),
("07_Baroque","Baroque","Palais de Schönbrunn, Vienne","https://whc.unesco.org/en/list/786"),
("08_Neoclassique","Néoclassique","Monticello, Charlottesville","https://whc.unesco.org/en/list/442"),
("09_Neogothique","Néogothique","Palais de Westminster, Londres","https://www.parliament.uk/about/living-heritage/building/palace/architecture/palacestructure/new-gothic-vision/"),
("10_Art_nouveau","Art nouveau","Hôtel Tassel, Bruxelles","https://whc.unesco.org/en/list/1005"),
("11_Art_deco","Art déco","Chrysler Building, New York","https://s-media.nyc.gov/agencies/lpc/lp/0992.pdf"),
("12_Bauhaus","Bauhaus","Bâtiment du Bauhaus, Dessau","https://whc.unesco.org/en/list/729"),
("13_Brutalisme","Brutalisme","Barbican Estate, Londres","https://www.barbican.org.uk/our-story/architecture/our-building"),
("14_Moghol","Moghol","Taj Mahal, Agra","https://whc.unesco.org/en/list/252"),
("15_Chateau_japonais","Architecture de château japonais","Château de Himeji","https://whc.unesco.org/en/list/661"),
]
records=[]
DEST.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(DEST,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=8) as archive:
    for slug,style,building,source in styles:
        item=alternatives[replacements[slug]] if slug in replacements else selected[slug]
        path=Path(item["local"])
        with Image.open(path) as img:
            img.verify()
        name=slug+".jpg"
        archive.write(path,name)
        records.append({"fichier":name,"style":style,"bâtiment":building,"source_du_style":source,
            "photo_wikimedia_commons":item["page_url"],"auteur_photo":item["artist"],
            "licence":item["license"],"lien_licence":item["license_url"]})
    output=io.StringIO()
    writer=csv.DictWriter(output,fieldnames=records[0].keys(),delimiter=";")
    writer.writeheader();writer.writerows(records)
    archive.writestr("sources_et_credits.csv",output.getvalue().encode("utf-8-sig"))
    readme="""15 styles architecturaux — photographies et provenance

Chaque fichier JPG porte le nom de son style. Les monuments et leur attribution
sont vérifiés par les institutions listées dans sources_et_credits.csv.

Les images proviennent de Wikimedia Commons. Le CSV donne pour chacune la page
du fichier, son auteur, sa licence et le lien vers les conditions de réutilisation.
Conservez ces crédits lors de toute diffusion ou réutilisation. Les fichiers JPG
sont des aperçus d'environ 1 200 px de largeur fournis par Wikimedia Commons.

« Romain antique » désigne l'architecture de la Rome ancienne ; « Roman »
désigne l'architecture romane médiévale. « Architecture de château japonais »
désigne ici la tradition des châteaux japonais du début du XVIIe siècle.
"""
    archive.writestr("LISEZ_MOI.txt",readme.encode("utf-8"))
with zipfile.ZipFile(DEST) as archive:
    bad=archive.testzip()
    assert bad is None,bad
    assert len([x for x in archive.namelist() if x.lower().endswith(".jpg")])==15
print(DEST)
print(f"{DEST.stat().st_size:,} bytes; 15 photos; archive vérifiée")
