"""從 sourcemap 還原的檔案覆蓋 DeployRoot.ts，並保留一份損壞檔備份。"""
import shutil
import os

src = r"work\cocos_render4\DeployRoot.frommap.ts"
dst = r"game\cocos\assets\scripts\DeployRoot.ts"
bak = r"work\cocos_render4\DeployRoot.damaged.ts"
if not os.path.exists(bak):
    shutil.copy2(dst, bak)
shutil.copy2(src, dst)
print("restored", dst, os.path.getsize(dst), "bytes; backup", bak)
a = open(src, "rb").read()
b = open(dst, "rb").read()
print("identical:", a == b)
