import os
base=r"F:\sanguo\extract\pak"
b=open(os.path.join(base,"MAGIC.INI"),"rb").read()
print(repr(b[:400]))
