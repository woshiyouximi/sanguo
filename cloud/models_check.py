#!/usr/bin/env python3
"""校验云机上的模型是否齐、是否完整。

用法：
    python models_check.py --root ~/sango_ai
    python models_check.py --root ~/sango_ai --hash      # 顺便算 sha256 前 16 位（慢，35 GB 约 3~5 分钟）

为什么不静默跳过：模型缺一块时 ComfyUI 的报错是 "value not in list" 或 CUDA OOM，
排查成本远高于这里直接告诉你"少了 3.2 GB"。
"""
import argparse
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def human(n):
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return "%.2f %s" % (n, unit)
        n /= 1024.0


def sha16(path, chunk=32 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()[:16]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.expanduser("~/sango_ai"))
    ap.add_argument("--manifest", default=os.path.join(HERE, "models_manifest.json"))
    ap.add_argument("--hash", action="store_true")
    a = ap.parse_args()

    man = json.load(open(a.manifest, encoding="utf-8"))
    models = os.path.join(a.root, "ComfyUI", "models")
    bad = 0
    for f in man["files"]:
        p = os.path.join(models, f["dir"], f["name"])
        if not os.path.exists(p):
            print("MISSING  %-22s %-46s 期望 %s" % (f["dir"], f["name"], human(f["size"])))
            bad += 1
            continue
        got = os.path.getsize(p)
        ok = got == f["size"]
        line = "%-8s %-22s %-46s %s" % ("OK" if ok else "SIZE", f["dir"], f["name"], human(got))
        if not ok:
            line += "（期望 %s）" % human(f["size"])
            bad += 1
        if a.hash:
            line += "  sha256_16=%s" % sha16(p)
        print(line)

    print("\n%d/%d 就绪" % (len(man["files"]) - bad, len(man["files"])))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
