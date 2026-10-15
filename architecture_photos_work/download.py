import json
import urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

ROOT=Path(__file__).parent
rows=json.loads((ROOT/"candidates.json").read_text(encoding="utf-8"))
selection={
"01_Grec_classique":0,"02_Romain_antique":1,"03_Byzantin":1,
"04_Roman":0,"05_Gothique":2,"06_Renaissance":1,
"07_Baroque":1,"08_Neoclassique":0,"09_Neogothique":2,
"10_Art_nouveau":0,"11_Art_deco":0,"12_Bauhaus":2,
"13_Brutalisme":4,"14_Moghol":0,"15_Chateau_japonais":0,
}
out=ROOT/"previews"
out.mkdir(exist_ok=True)
selected=[]
for row in rows:
    slug=row["slug"]
    item=row["candidates"][selection[slug]]
    request=urllib.request.Request(item["thumb_url"],headers={"User-Agent":"AnimatelierArchitectureCollection/1.0 (educational research)"})
    with urllib.request.urlopen(request,timeout=50) as response:
        data=response.read()
    path=out/(slug+".jpg")
    path.write_bytes(data)
    with Image.open(path) as img:
        img.verify()
    selected.append({"slug":slug,**item,"local":str(path)})
    print(slug,len(data),flush=True)
(ROOT/"selected.json").write_text(json.dumps(selected,ensure_ascii=False,indent=2),encoding="utf-8")

cell_w,cell_h=330,260
sheet=Image.new("RGB",(cell_w*3,cell_h*5),"white")
draw=ImageDraw.Draw(sheet)
for i,item in enumerate(selected):
    x=(i%3)*cell_w;y=(i//3)*cell_h
    with Image.open(item["local"]) as img:
        im=ImageOps.contain(img.convert("RGB"),(cell_w-16,cell_h-55))
        sheet.paste(im,(x+(cell_w-im.width)//2,y+8))
    draw.text((x+8,y+cell_h-42),item["slug"],fill="black")
    draw.text((x+8,y+cell_h-24),item["title"][5:48],fill="black")
sheet.save(ROOT/"planche_contact.jpg",quality=88)
