import os
base=r"F:\sanguo\extract\pak"
for n in ["MAGIC.INI","MESSAGE.INI"]:
    b=open(os.path.join(base,n),"rb").read()
    txt=b.decode("gbk")
    print("=====",n)
    print(txt[:1800])
