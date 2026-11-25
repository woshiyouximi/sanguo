#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把 steps_fontcensus.mjs 的输出（`#fonts <page> {json}`）整理成 fontcensus.json。

两个坑（都踩过）：
  ① PowerShell 的 `Tee-Object` 默认写 UTF-16LE（BOM `ff fe`），按 utf-8 读会得到一坨 NUL；
  ② 控制台按 80 列折行，JSON 里会出现「字符串键被换行劈开」的非法控制字符
     （实测 `"24\n":1`），所以每段先去掉全部换行再交给 json 解。

用法：python fonts_json.py fontcensus_raw.txt
"""
import io
import json
import re
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else "fontcensus_raw.txt"
OUT = "fontcensus.json"

if __name__ == "__main__":
    raw = io.open(SRC, "rb").read()
    if raw[:2] == b"\xff\xfe":
        text = raw.decode("utf-16-le").lstrip("\ufeff")
    elif raw[:3] == b"\xef\xbb\xbf":
        text = raw[3:].decode("utf-8")
    else:
        text = raw.decode("utf-8", "replace")

    tags = [m.start() for m in re.finditer("#fonts ", text)]
    out = {}
    for i, tag in enumerate(tags):
        end = tags[i + 1] if i + 1 < len(tags) else len(text)
        blob = text[tag + 7 : end].replace("\r", "").replace("\n", "").strip()
        brace = blob.find("{")
        if brace < 0:
            continue
        key = blob[:brace].strip().split()[0] if blob[:brace].strip() else "?"
        try:
            out[key] = json.loads(blob[brace:])
        except Exception as exc:                                   # noqa: BLE001
            out.setdefault("_errors", []).append("%s: %s" % (key, exc))

    with io.open(OUT, "w", encoding="utf-8", newline="\n") as fp:
        json.dump(out, fp, ensure_ascii=False, indent=1)
    sizes = {k: v.get("sizes") for k, v in out.items() if isinstance(v, dict)}
    print("wrote %s  %s" % (OUT, sizes))
    if "_errors" in out:
        print("errors:", out["_errors"])
