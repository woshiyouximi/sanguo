import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\core\battle.ts')
t = p.read_text(encoding='utf-8')
old = "/** 战力 = 150 + 兵种相克 + 地形 + 阵形相克 + 士气项（原作五段加算，04b §2.5） */"
new = """/**
 * 战力 = 150 + 兵种相克 + 地形 + 阵形相克 + 士气项（原作五段加算）。
 *
 * 五段是**纯加法**：150 是硬编码立即数（`0x43A3AD` / `0x43A3B7` 两条
 * `c705 … 96000000` 把 `unit+0x70` 直接写成 150），后续只有
 * read-modify-write（`0x442FC0`/`0x442FC3`/`0x442FC8`）。依据：docs/04b5 Q1。
 * 疲劳（`general+0x3A`）**不在**这五项里（`0x442EFA`/`0x443498` 零命中），别加。
 */"""
assert old in t
p.write_text(t.replace(old, new, 1), encoding='utf-8')
print('powerOf 注释')
