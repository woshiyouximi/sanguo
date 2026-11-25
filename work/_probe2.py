import os
base=r"F:\sanguo\extract\pak"
for n in ["COMBINE.INI"]:
    txt=open(os.path.join(base,n),"rb").read().decode("gbk")
    print(txt[:3000])
