import numpy as np, json, sys, soundfile as sf, librosa
from scipy.signal import butter, sosfilt
D=sys.argv[1]; SR=48000
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
# bruitages
sfx=np.zeros(N)
def tick(strong=False):
    L=int(0.06*SR); x=np.arange(L)/SR
    return (np.sin(2*np.pi*(1400 if strong else 1800)*x)*np.exp(-x*90)+hp(rng.standard_normal(L),3000)*np.exp(-x*300)*0.5)*0.5
def ding():
    L=int(1.4*SR); x=np.arange(L)/SR; s=np.zeros(L)
    for f,dd,a,dl in [(880,3.5,.5,0),(1318.5,3,.4,0.09),(1760,4,.25,0.09)]:
        i=int(dl*SR); y=x[:L-i]; s[i:]+=a*np.sin(2*np.pi*f*y)*np.exp(-y*dd)*np.minimum(1,y/0.005)
    return s*0.55
def whoosh():
    L=int(0.35*SR); x=np.arange(L)/SR; return lp(hp(rng.standard_normal(L),800),3500)*np.sin(np.pi*x/x[-1])**2*0.12
def levelup(root):
    L=int(1.2*SR); s=np.zeros(L)
    for k,mm in enumerate([root,root+4,root+7,root+12]):
        i=int(k*0.09*SR); x=np.arange(L-i)/SR
        s[i:]+=(np.sin(2*np.pi*mtof(mm)*x)+0.3*np.sin(4*np.pi*mtof(mm)*x))*np.exp(-x*4)*0.28
    return s
for k in mk['marks']:
    if k['type']=='q':
        add(sfx,whoosh(),k['s']-0.1)
        for j in range(4): add(sfx,tick(j==3),k['cd']+j)
        add(sfx,ding(),k['ans'])
    elif k['type']=='level': add(sfx,levelup([72,74,77][k['level']]),k['s']+0.15)
    elif k['type']=='outro': add(sfx,whoosh(),k['s']-0.1)
add(sfx,ding()*0.6,0.05)
# voix
v=np.zeros(N); cur=0.0
for c in json.load(open(f"{D}/clips.json")):
    w,sr=sf.read(f"{D}/vx_{c['id']}.wav"); w=librosa.resample(w,orig_sr=sr,target_sr=SR)
    st=c['t0'] if not c['id'].startswith('i') else (0.2 if c['id']=='i1' else cur+0.12)
    add(v,w,st); cur=st+len(w)/SR
    if c['id'].startswith('i'): print(c['id'],round(st,2),round(cur,2))
v=v/np.abs(v).max()*0.9
for name,x in [('music',mus),('sfx',sfx),('voice',v)]:
    y=x/max(1,np.abs(x).max()/0.95); sf.write(f"{D}/{name}.wav",np.stack([y,y],1),SR,subtype='PCM_16')
print('ok',DUR)
