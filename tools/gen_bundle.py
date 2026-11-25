"""生成 `proto/data_bundle.js` —— 原型用的最小数据集（可 file:// 直接打开）。

从 `data/` 里只挑原型真正要用的字段，压到几百 KB：
  troops      : names + 13×13 矩阵
  formations  : names + 9×9 矩阵 + 11 组阵形的 fill（10/50/100/200 人）
  magics      : 110 条（序号/名/MP/ATTACK/特效目录/帧数）
  generals    : 400 条（名/武/智/头像号），供选将用

用法：python tools/gen_bundle.py
"""
from __future__ import annotations

import json
import os

DATA = r"F:\sanguo\data"
OUT = r"F:\sanguo\proto\data_bundle.js"


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def main():
    troops = load("troops.json")
    forms = load("formations.json")
    magics = load("magics.json")
    generals = load("generals.json")

    slots = []
    for s in forms.get("slots", []):
        slots.append({
            "a": s["a"],
            "name": s["name"],
            "anchorX": s["anchorX"],
            "weights": s.get("weights"),
            "fill": {k: v for k, v in (s.get("fill") or {}).items() if isinstance(v, list)},
        })

    bundle = {
        "troops": {"names": troops.get("names"), "matrix": troops.get("matrix")},
        "formations": {
            "names": forms.get("names"),
            "matrix": forms.get("matrix"),
            "slots": slots,
            "slot_rule": forms.get("slot_rule"),
        },
        "magics": [
            {
                "seq": m.get("SEQUENCE"), "name": m.get("NAME"), "mp": m.get("MP"),
                "attack": m.get("ATTACK"), "script": m.get("SCRIPT"),
                "fx": m.get("fx_dir"), "fxFrames": m.get("fx_frames"),
            }
            for m in magics
        ],
        "generals": [
            {"n": g.get("NAME"), "s": g.get("STR"), "i": g.get("INT"), "face": g.get("FACE")}
            for g in generals if g.get("NAME")
        ],
    }

    js = "/* 自动生成，不要手改：python tools/gen_bundle.py */\n"
    js += "(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();"
    js += "else root.SANGO_DATA=factory();})(typeof self!=='undefined'?self:this,function(){return "
    js += json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))
    js += ";});\n"
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(js)

    print("写出 %s" % OUT)
    print("  兵种 %d / 阵形 %d（%d 组 slot）/ 技能 %d / 武将 %d"
          % (len(bundle["troops"]["names"]), len(bundle["formations"]["names"]),
             len(slots), len(bundle["magics"]), len(bundle["generals"])))
    print("  体积 %d B" % os.path.getsize(OUT))


if __name__ == "__main__":
    main()
