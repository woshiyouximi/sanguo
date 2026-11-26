# -*- coding: utf-8 -*-
"""从 MuMu 直接读 Cocos 存档（base64 过 adb，避免 PowerShell 重定向写坏二进制）。"""
import base64, json, sqlite3, subprocess, sys, tempfile, os

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ADB = r'F:\devtools\android\sdk\platform-tools\adb.exe'
DEV = '127.0.0.1:16384'
PKG = 'com.sanguo.sango2'


def sh(args):
    return subprocess.run(args, capture_output=True).stdout


raw = sh([ADB, '-s', DEV, 'shell', 'run-as', PKG, 'cat', 'databases/jsb.sqlite'])
# run-as 走 adb shell 时会把 CRLF 掺进来，base64 允许换行
blob = base64.b64decode(b''.join(raw.split()), validate=False)
fd, path = tempfile.mkstemp(suffix='.sqlite')
os.close(fd)
with open(path, 'wb') as f:
    f.write(blob)
db = sqlite3.connect(path)
rows = dict(db.execute('select key, value from data'))
print('DB KEYS', sorted(rows.keys()))
save = json.loads(rows.get('sanguo_campaign_v1', '{}'))
print('SAVE KEYS', sorted(save.keys()))
print('owned', save.get('owned'))
roster = save.get('roster') or {}
print('roster cities', list(roster.keys())[:8])
for city, names in list(roster.items())[:6]:
    print(' ', city, names if isinstance(names, list) else type(names).__name__)
os.unlink(path)
