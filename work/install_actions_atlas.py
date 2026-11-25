# -*- coding: utf-8 -*-
"""把 pack_atlas.py 的产物（atlas.json + atlas_00.png）改名安装成
game/web/anim/actions.json + actions_00.png，不碰已有 atlas.json / atlas_00.png。
用法（捆绑 python 或系统 python 均可）：
  python F:\\sanguo\\work\\install_actions_atlas.py
"""
import json
import shutil
from pathlib import Path

SRC = Path(r"F:\sanguo\work\actions_atlas")
DST = Path(r"F:\sanguo\game\web\anim")


def main() -> int:
    meta = json.loads((SRC / "atlas.json").read_text(encoding="utf-8"))
    pages = meta["pages"]
    if len(pages) != 1:
        raise SystemExit(f"期望单页，实际 {len(pages)} 页；请检查 --page 参数")
    pages[0]["file"] = "actions_00.png"  # 运行时不依赖该字段，但保持图集自描述一致
    meta.setdefault("meta", {})["kind"] = "actions_back"

    shutil.copyfile(SRC / "atlas_00.png", DST / "actions_00.png")
    (DST / "actions.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    info = json.loads((DST / "actions.json").read_text(encoding="utf-8"))
    n = len(info["pages"][0]["sprites"])
    size = (DST / "actions_00.png").stat().st_size
    print(f"installed actions_00.png ({size} bytes) + actions.json ({n} sprites)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
