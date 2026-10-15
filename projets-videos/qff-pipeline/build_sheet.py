import csv, json, sys
from openpyxl import Workbook
from openpyxl.worksheet.datavalidation import DataValidation
topics=[l.split("|") for l in open("topics.txt",encoding="utf-8").read().strip().splitlines()]
wb=Workbook(); ws=wb.active; ws.title="Plannification quiz"
ws.append(["Sujet","Type de quiz","Fait ?","Date de diffusion","Repertoire photos"])
done=json.load(open("done.json"))
for s,ty in topics:
    d=done.get(s)
    ws.append([s,ty,True,d["date"],d["photos"]] if d else [s,ty,False,None,None])
dv=DataValidation(type="list",formula1='"TRUE,FALSE"'); ws.add_data_validation(dv); dv.add(f"C2:C{len(topics)+1}")
for c,w in zip("ABCDE",[30,14,8,16,60]): ws.column_dimensions[c].width=w
ws2=wb.create_sheet("Questions posées")
ws2.append(["Question posée","Date","Quel Quiz"])
for r in csv.reader(open("questions.csv",encoding="utf-8")): ws2.append(r)
for c,w in zip("ABC",[80,14,30]): ws2.column_dimensions[c].width=w
wb.save("Theme de quiz.xlsx")
