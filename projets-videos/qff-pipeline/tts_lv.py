import warnings, json, sys, numpy as np; warnings.filterwarnings("ignore")
import soundfile as sf, librosa
from TTS.api import TTS
D=sys.argv[1]
d="en_voice/tts_models--en--ljspeech--vits/"
t=TTS(model_path=d+"model_file.pth.tar", config_path=d+"config.json"); sr=t.synthesizer.output_sample_rate; m=t.synthesizer.tts_model
mk=json.load(open(f"{D}/project.marks.json")); say=json.load(open(f"{D}/speech.json"))
num="one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen".split()
clips=[]
for k in mk['marks']:
    if k['type']=='intro':
        clips+= [("i1",say['intro'][0],0.2,3.0,0.9),("i2",say['intro'][1],3.1,5.0,0.9),("i3",say['intro'][2],5.1,6.4,0.9)]
    elif k['type']=='level':
        clips.append((f"l{k['level']}",say['levels'][k['level']],k['s']+0.1,k['end']+0.1,0.9))
    elif k['type']=='q':
        n=k['n']; clips.append((f"q{n}",f"Question {num[n-1]}. {k['q']}",k['s']+0.15,k['cd']+0.6,1.0))
        clips.append((f"a{n}",say['answers'][n-1],k['ans']+0.1,k['end']-0.05,1.0))
    elif k['type']=='outro':
        clips.append(("o1",say['outro'],k['s']+0.2,k['end']-0.2,0.92))
out=[]
for cid,txt,t0,dl,ls in clips:
    for attempt in range(3):
        m.length_scale=ls
        w=np.array(t.tts(text=txt),dtype=np.float32); w,_=librosa.effects.trim(w,top_db=38)
        dur=len(w)/sr
        if t0+dur<=dl or ls<=0.8: break
        ls=max(0.8, ls*(dl-t0)/dur)
    sf.write(f"{D}/vx_{cid}.wav",w,sr)
    out.append(dict(id=cid,text=txt,t0=t0,deadline=dl,dur=dur,ls=ls))
    flag = "OVER %.2f"%(t0+dur-dl) if t0+dur>dl else ""
    print(cid, round(dur,2), round(ls,2), flag)
json.dump(out,open(f"{D}/clips.json","w"),indent=1)
