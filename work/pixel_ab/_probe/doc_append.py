# -*- coding: utf-8 -*-
"""把 §后处理实验 追加到 project/37b_美术对照.md（幂等）。"""
import io

P = r"F:\sanguo\project\37b_美术对照.md"
ADD = """
## 6. §后处理实验（2026-11-25，纯后处理 A/B）

针对 §3 第 2 条缺口（187–255 色 vs 原作 32 色）做了一次**不重新生成、不碰代码**的后处理实验，
工具 `tools/pixel_post.py`、`tools/apply_pixel_post.py`，完整记录见 **`project/43_像素化实验.md`**。

- **色数**：兵种 1297–2874 色/帧 → **24–29**；攻击图集 1546–1981 → **32**；动作集 845–1937 → **31–32**；立绘 74200 → **32**。整页 = 32 色板 + 1 描边色。
  口径提醒：本文件上文写的「兵种 187 / 立绘 253」是压缩缩样后的数，实测原始像素远高于此，两者不可混用。
- **体积**：units 404.5→225.1 KB（PNG8 **58.7 KB，−86%**）；atlas 309.7→177.9（PNG8 57.8）；actions 238.8→123.9（PNG8 39.7）。
- **描边**：1 px 外侧描边，auto 色实测吸附到 `#16120C`（与统一 `#12151A` 等价）。
- **判断**：把「照片贴纸」去掉了大半（削掉 white rim light + 硬剪影 + 压进 32 色地形），
  但没变成「原作那种 32 色像素画」—— 缺的是**明暗阶数**（原作每材质 3–4 个平色阶，我们是连续渐变），不是色数。
- **不要做**：兵种 `--pixel 2`（源帧 80×104 已和原作 FORCE 64×117 同级，2× 后比原作还粗）；
  `--colors 16/24`（亮部变近白块、剪影散架）；给 `assets/fx/` 加描边（那是原作拆包素材，已达标）。
- 对比图：`work\\pixel_ab_units.jpg`、`work\\pixel_ab_hero.jpg`（均叠在 terrain_04 的 32 色版上）。
"""

s = io.open(P, encoding="utf-8").read()
if "§后处理实验" not in s:
    s = s.rstrip() + "\n" + ADD
    io.open(P, "w", encoding="utf-8", newline="\n").write(s)
    print("appended")
else:
    print("already there")
print("lines", len(s.splitlines()))
