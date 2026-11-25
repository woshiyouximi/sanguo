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
def run(label, blocked, trials=200000):
    nx=nf=nv=nb=0
    for _ in range(trials):
        pick=None
        for d in sample(-1,0,W1):
            if d not in blocked: pick=d; break
        if pick is None:
            for d in sample(-1,0,W2):
                if d not in blocked: pick=d; break
        if pick is None: nv+=1; continue  # no move at all
        dx,dy=pick
        if dx==-1 and dy==0: nf+=1
        elif dx==-1: nx+=1
        elif dx==0: nv+=1
        else: nb+=1
    t=float(trials)
    print("%-28s 前 %5.1f%%  斜前 %5.1f%%  纯上下 %5.1f%%  后退 %5.1f%%"%(label,100*nf/t,100*nx/t,100*nv/t,100*nb/t))
run("空场(无阻挡)", set())
run("正前1格被友军占", {(-1,0)})
run("正前+两斜前被占", {(-1,0),(-1,1),(-1,-1)})
run("正前2格方向+斜前被占", {(-1,0),(-1,1),(-1,-1),(0,-1),(0,1)})
