from collect import get_json
queries=["Parthenon Athens building", "Chartres Cathedral facade", "Schönbrunn Palace Vienna panorama", "Bauhaus Dessau exterior building", "Himeji castle full view"]
for q in queries:
    data=get_json({"action":"query","generator":"search","gsrsearch":q,"gsrnamespace":6,"gsrlimit":20,"format":"json"})
    print("\n",q,flush=True)
    for p in sorted(data.get("query",{}).get("pages",{}).values(),key=lambda x:x.get("index",99)):
        print(p["title"],flush=True)
