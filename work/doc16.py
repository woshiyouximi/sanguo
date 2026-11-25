import pathlib
p = pathlib.Path(r'F:\sanguo\project\11_客户端工程与视图层.md')
t = p.read_text(encoding='utf-8')
add = """
### 16.1 立绘覆盖率（v2：153/401 = 38.2%）
- 云上 `out_h400` 跑到 **153/400** 时先拉一版回来：pod 上 `tar cf h400.tar out_h400` → `pod_ssh.py get`（244 MB / 23.5 MB/s）→ Python `tarfile` 解（避免中文名乱码）。
- **改名策略换成"按名字转繁"，不再按排名猜**：`opencc s2t` 把 `hero_<簡体>.png` 的简体名转繁，
  再与 `data/generals.json` 的 `NAME` 精确比对；转换产生的异体字（淩/凌、裏/里、禇/褚、禕/褘、醜/丑）
  用一张 8 条别名表补掉，最后 `逄纪→逢紀`、`陈群→陳群` 两条单独补。
  结果：**153 张全部落在 generals 的合法名字上（0 张错名）**。
- **已知质量缺陷**：`derive_look()` 用名字 `crc32` 派生 9 面相 × 6 甲式 × 8 兵器 × 8 主色，
  所以**兵器和身份不挂钩**——荀彧（智 98）会拿到刀。修法：`derive_look` 里按 `ARCH` 约束兵器集合
  （谋士 → 羽扇/書簡/劍，猛将 → 大刀/長槍），只有重生成才能修，已在 `03 §3.14` 记为待办。
- **仍待补**：剩余约 247 张（云上继续跑），补齐后本文件与 `assets/hero` 同步即可，无需改代码。
"""
if '16.1 立绘覆盖率' not in t:
    t = t.rstrip() + "\n" + add
p.write_text(t, encoding='utf-8')
print('doc 16.1')
