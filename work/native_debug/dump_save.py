"""把模拟器里 Cocos 的 localStorage（databases/jsb.sqlite）拉下来看清内容。

用法：
  python work\\native_debug\\dump_save.py [device]
device 默认 127.0.0.1:16384。
"""
import base64
import json
import os
import sqlite3
import subprocess
import sys

ADB = r"F:\devtools\android\sdk\platform-tools\adb.exe"
PKG = "com.sanguo.sango2"
OUT = r"F:\sanguo\work\native_debug\jsb.sqlite"


def adb(dev, *args):
    return subprocess.run([ADB, "-s", dev, *args], capture_output=True)


def main():
    dev = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1:16384"
    r = adb(dev, "shell", f"run-as {PKG} cat databases/jsb.sqlite | base64")
    if r.returncode != 0 or not r.stdout.strip():
        print("pull failed:", r.stderr.decode("utf-8", "replace")[:400])
        return 1
    raw = base64.b64decode(b"".join(r.stdout.split()))
    with open(OUT, "wb") as f:
        f.write(raw)
    print(f"wrote {OUT} ({len(raw):,} B)")

    con = sqlite3.connect(OUT)
    tables = [row[0] for row in con.execute("select name from sqlite_master where type='table'")]
    print("tables:", tables)
    for t in tables:
        try:
            cols = [c[1] for c in con.execute(f"pragma table_info({t})")]
            rows = list(con.execute(f"select * from {t}"))
        except sqlite3.Error as err:
            print(" ", t, "err", err)
            continue
        print(f"-- {t} cols={cols} rows={len(rows)}")
        for row in rows[:12]:
            key = str(row[0])
            val = str(row[1]) if len(row) > 1 else ""
            print(f"   {key[:40]!r} -> {val[:200]!r}")
            if key == "sanguo_campaign_v1":
                try:
                    save = json.loads(val)
                except json.JSONDecodeError:
                    continue
                print("      runKey:", save.get("runKey"), "scenario:", save.get("scenario"),
                      "month:", save.get("month"), "king:", save.get("king"), "owned:", save.get("owned"))
                for k in ("captured", "executed", "lastBattle", "lastPost", "acted", "away"):
                    if k in save:
                        print(f"      {k}: {json.dumps(save[k], ensure_ascii=False)[:300]}")
                print("      keys:", sorted(save.keys()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
