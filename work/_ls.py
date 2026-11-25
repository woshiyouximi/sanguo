import os
base=r"F:\sanguo\extract\pak\SHAPE"
for root,dirs,files in os.walk(base):
    rel=os.path.relpath(root,base)
    n=len(files)
    if n>0:
        sample=sorted(files)[:4]
        print(f"{rel:32s} files={n:5d}  {sample}")
    if rel.count(os.sep)>1:
        dirs[:]=[]
