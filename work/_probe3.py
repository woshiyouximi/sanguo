import os
base=r"F:\sanguo\extract\pak"
b=open(os.path.join(base,"COMBINE.INI"),"rb").read()
print("len",len(b))
parts=b.split(b"\r\n")
print("parts",len(parts))
for i,p in enumerate(parts):
    s=p.decode("gbk").rstrip()
    print(i,repr(s[:120]))
print("tail bytes", repr(b[-40:]))
