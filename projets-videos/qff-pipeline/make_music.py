# Génère une musique de fond synthétique (Am F C G, 100 bpm) de la durée de la vidéo.
# Usage : python3 make_music.py out/   (out/timeline.json doit exister, écrit out/music.wav)
# Extrait de audio_lv.py, partie musique seulement : les bruitages sont désormais produits
# par quiz-video.js --sfx default et conservés par mux-audio.js --keep-sfx.
import json, sys, os
_D = sys.argv[1].rstrip("/")
json.dump({"duration": json.load(open(f"{_D}/timeline.json"))["duration"], "marks": []},
          open(f"{_D}/project.marks.json", "w"))
import numpy as np, json, sys, soundfile as sf, librosa
from scipy.signal import butter, sosfilt
D=_D; SR=48000
mk=json.load(open(f"{D}/project.marks.json")); DUR=mk['duration']+0.05; N=int(SR*DUR)
rng=np.random.default_rng(7)
def lp(x,f,o=2): return sosfilt(butter(o,f,'low',fs=SR,output='sos'),x)
def hp(x,f,o=2): return sosfilt(butter(o,f,'high',fs=SR,output='sos'),x)
def add(buf,sig,t):
    i=int(t*SR); j=min(N,i+len(sig))
    if 0<=i<N: buf[i:j]+=sig[:j-i]
def mtof(m): return 440*2**((m-69)/12)
# musique : boucle Am F C G, 100 bpm
beat=60/100; chords=[[57,60,64],[53,57,60],[48,52,55],[55,59,62]]; cl=beat*8
mus=np.zeros(N); t=np.arange(int(cl*SR))/SR; start=0; ci=0
while start<DUR:
    ch=chords[ci%4]; pad=np.zeros_like(t)
    for mm in ch+[ch[0]+12]:
        for h,a in [(1,1),(2,.35),(3,.15)]: pad+=a*np.sin(2*np.pi*mtof(mm)*h*t+rng.uniform(0,6))
    add(mus,lp(pad*np.minimum(1,t/0.6)*np.minimum(1,(cl-t)/0.4),1800)*0.05,start)
    for b in range(8):
        tb=start+b*beat; tt=np.arange(int(0.55*SR))/SR
        if b%2==0:
            add(mus,np.sin(2*np.pi*mtof(ch[0]-12)*tt)*np.exp(-tt*5)*0.22,tb)
            add(mus,np.sin(2*np.pi*(50+90*np.exp(-tt*30))*tt)*np.exp(-tt*14)*0.35,tb)
        for half in (0,1):
            note=(ch+[ch[0]+12])[(b*2+half)%4]+12; tt=np.arange(int(0.4*SR))/SR
            add(mus,2/np.pi*np.arcsin(np.sin(2*np.pi*mtof(note)*tt))*np.exp(-tt*9)*0.045,tb+half*beat/2)
            if half: add(mus,hp(rng.standard_normal(int(0.05*SR)),7000)*np.exp(-np.arange(int(0.05*SR))/SR*80)*0.05,tb+beat/2)
    start+=cl; ci+=1
tt=np.arange(N)/SR; mus*=np.minimum(1,tt/1.0)*np.clip((DUR-0.3-tt)/3.0,0,1); mus=mus/np.abs(mus).max()*0.22

sf.write(f"{D}/music.wav", np.stack([mus, mus], 1), SR, subtype="PCM_16")
print("music", DUR)
