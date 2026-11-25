import io
p = r"F:\sanguo\project\31_还原清单.md"
add = """
### §一之補 21（R192 引擎节拍 60Hz + 保真网工具链修复）

| # | 项 | 结论 / 落地 | 证据 |
|---|---|---|---|
| 229 | 引擎节拍 | `TICK_HZ 30→60`、`BATTLE_TICK_LIMIT 5940→11880`（= 原作 `0x2E68` 本身）；40 tick 的**数值一个没动**，改的是「一 tick 多久」 | `project/192`、`game/src/core/battle.ts:66/82` |
| 230 | 节拍连带 | 13 处乙类换算：`FX_TTL_DEFAULT/FX_TICK_PER_FRAME/FX_TTL_MIN/MAX`、`SKILL_MARK_TTL 45→90`、`EFFECT_WINDOW_MIN 240→480`、`AI_SKILL_INTERVAL_TICKS=10*TICK_HZ`、`strategy.ts` 的 `REGEN_PERIOD_TICKS/REINFORCE_TICKS_PER_STEP 60→120` 与 clamp(30,300)→(60,600)、`battleView` 的 `CLOCK_UNIT_TICKS=2*TICK_HZ`、`animSelect` 10/8/12→20/16/24、`generalAtlas DEATH_TICKS 24→48` | 同上 §三 |
| 231 | 节奏实测 | 一格 1.367 s → **0.683 s**；31 格接近 42.4 s → 21.2 s（首次接触 10.3 s）；整场 43.7 s → **21.8 s**；AI 对 AI 打满 **198.0 s**；倒计时 99→0 = 198.0 s（0.5/秒） | `work/tick60/pace.mjs` |
| 232 | 契约锁 | 新增 `tests/tick60.test.ts` 10 条（`TICK_HZ=60`、`BATTLE_TICK_LIMIT=11880`、一格 40 tick、倒计时 120 tick/字、FX 换算、AI 60 tick、`ACTION_*`=40 不许动） | 同上 §四 |
| 233 | 保真网 `PASS 459 / FAIL 0 / SKIP 3 / WARN 0` | 工具链 R192 修复后重新生成期望值仍全绿 | `work/fidelity/` |
| 234 | **工具链事故** | p7 用 PowerShell `(Get-Content -Raw) -replace \\| Set-Content -Encoding utf8` 改 `work/fidelity/gen_expect.mjs`，UTF-8 按 CP936 读坏、吞约 60 字符（`/補血\\|補兵/` 正则里的「血」被吃，导致 seq1 命療術 被判成 strike）。修复：字节反解 → 18 处不平衡引号重写 → 4 个被吃字的路径字面量按实际文件名回填（`xls_武将技/军师技/兵种/路径.json`）→ 一条被注释吞掉的 `const xlsPathBySeq` 拆行 → `castKind` 改为直接问引擎 `skillKindOfEx`。旧文件留 `gen_expect.corrupt-r192.mjs` | `work/fidelity/_restore2.py`/`_repair.py`/`_fix3.py`/`_fix4.py` |
| 235 | 音效证级 2 条纠错 | `work/sfx84/map6.json` 的 seq43/102 原按磁盘命名猜成 `m022/m021`（grade X）；按 deep 直证改回 **043→m032snd01（CreateSparkle 0x02A658）**、**102→m031snd01（CreateFirePillar 0x029E20）**，grade A。证级分布回到 `{A:72,A2:37,X:1}` | `work/sfx84/_fix_map6.mjs`、`map6.before_r192.json` |
| 236 | 断言口径 2 条 | `battle.cast.heal` 改为「cast 后 120 tick 内 hp 上升」（R187 起技走逐帧结算，不再同步）；`battle.cast.strike` 改为「减员 **或** 敌将掉血」（R187 o1 证 `Hurt@0x12B8` 把非主将受害者拦成只放音效）；`magic.castkind` 比较时把 `heal-troop` 归一成 `heal`（引擎对外只三值） | `work/fidelity/check.mjs:260/777-790/813-830` |
"""
s = io.open(p, encoding="utf-8").read()
io.open(p, "w", encoding="utf-8", newline="\n").write(s + add)
print("ok")
