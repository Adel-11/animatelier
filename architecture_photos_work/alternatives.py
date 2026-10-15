import json, urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps
from collect import get_json, clean

ROOT=Path(__file__).parent
titles=[
"File:Parthenon on Acropolis in Athens.jpg",
"File:Chartres cathedral (West façade).jpg",
"File:Schonbrunn Palace - Vienna.jpg",
"File:Himeji castle sakura full bloom.JPG",
"File:Außenansichten des Bauhaus-Gebäudes in Dessau 11.jpg",
"File:Außenansichten des Bauhaus-Gebäudes in Dessau 01.jpg",
]
data=get_json({"action":"query","titles":"|".join(titles),"prop":"imageinfo","iiprop":"url|size|mime|extmetadata","iiurlwidth":1200,"format":"json"})
items=[]
out=ROOT/"alternatives";out.mkdir(exist_ok=True)
for page in data.get("query",{}).get("pages",{}).values():
    info=page.get("imageinfo",[{}])[0]
    if not info.get("thumburl"): continue
    meta=info.get("extmetadata",{})
    field=lambda k:clean(meta.get(k,{}).get("value",""))
    item={"title":page["title"],"artist":field("Artist"),"license":field("LicenseShortName"),"license_url":field("LicenseUrl"),"page_url":info.get("descriptionurl"),"thumb_url":info["thumburl"],"width":info.get("width"),"height":info.get("height")}
    name=f"alt_{len(items)+1:02}.jpg";path=out/name
    req=urllib.request.Request(info["thumburl"],headers={"User-Agent":"AnimatelierArchitectureCollection/1.0"})
    with urllib.request.urlopen(req,timeout=50) as response:path.write_bytes(response.read())
    item["local"]=str(path);items.append(item)
    print(name,item["title"],item["license"],flush=True)
(ROOT/"alternatives.json").write_text(json.dumps(items,ensure_ascii=False,indent=2),encoding="utf-8")
sheet=Image.new("RGB",(350*3,275*2),"white");draw=ImageDraw.Draw(sheet)
for i,item in enumerate(items):
    x=(i%3)*350;y=(i//3)*275
    with Image.open(item["local"]) as img:
        im=ImageOps.contain(img.convert("RGB"),(330,225));sheet.paste(im,(x+(350-im.width)//2,y+5))
    draw.text((x+8,y+238),f"{i+1} {item['title'][5:48]}",fill="black")
sheet.save(ROOT/"alternatives_contact.jpg",quality=88)
