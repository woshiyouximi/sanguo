import random
DIRS=[(1,0),(1,-1),(0,-1),(-1,-1),(-1,0),(-1,1),(0,1),(1,1)]
BASE=[3,2,1,4,-1,0,5,6,7]; ROT=[0,-1,1,-2,2,-3,3,-4]
W1=[80,10,10,0,0,0,0,0]; W2=[60,15,15,5,5,0,0,0]
def sample(sx,sy,w):
    cx=(sx>0)-(sx<0); cy=(sy>0)-(sy<0)
    mode=BASE[3*(cy+1)+(cx+1)]
    if mode<0: return []
    left=list(w); s=sum(left); out=[]
    while s>0:
        r=random.randrange(s); j=0
        while j<8 and r>=left[j]: r-=left[j]; j+=1
        if j>=8: j=7
        k=(mode+ROT[j])&7; out.append(DIRS[k])
        s-=left[j]; left[j]=0
    return out
def run(label, sx, sy, blocked, trials=200000):
    c={"前":0,"斜前":0,"纯上下":0,"后退":0,"不动":0}
    for _ in range(trials):
        pick=None
        for d in sample(sx,sy,W1):
            if d not in blocked: pick=d; break
        if pick is None:
            for d in sample(sx,sy,W2):
                if d not in blocked: pick=d; break
        if pick is None: c["不动"]+=1; continue
        dx,dy=pick
        if dx==-sx if sx else False: pass
        if sx and dx==sx and dy==0: c["前"]+=1
        elif sx and dx==sx: c["斜前"]+=1
        elif dx==0: c["纯上下"]+=1
        else: c["后退"]+=1
    t=float(trials)
    print("%-22s %s"%(label," ".join("%s %5.1f%%"%(k,100*v/t) for k,v in c.items())))
print("== 基向量=正前(-1,0)（原作 cmd1 前進 / AI 全軍前進）==")
run("空场",-1,0,set())
run("前1格被占",-1,0,{(-1,0)})
run("前+两斜被占",-1,0,{(-1,0),(-1,1),(-1,-1)})
run("前+两斜+上下被占(第二圈)",-1,0,{(-1,0),(-1,1),(-1,-1),(0,-1),(0,1)})
print("== 基向量=斜前(-1,-1)（planToward 朝斜方向的敌人）==")
run("空场",-1,-1,set())
run("该斜格被占",-1,-1,{(-1,-1)})
