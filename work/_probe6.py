import os
base=r"F:\sanguo\extract\pak"
for n in ["MESSAGE.INI","SANGO.INI","THINGS.INI"]:
    b=open(os.path.join(base,n),"rb").read()
    t=b.decode("cp950")
    print("="*20,n,len(t))
    print(t[:1200])
