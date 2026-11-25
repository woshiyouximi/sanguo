import io

P = r"F:\sanguo\project\02_战斗重构设计.md"
s = io.open(P, encoding="utf-8").read()
fail = []
def rep(old, new, tag):
    global s
    if old not in s: fail.append(tag); return
    s = s.replace(old, new, 1)

# D1 troops.json
rep("""{ "version": 1, "troops": [{
  "id": 2, "key": "dadao", "name": "大刀",
  "process": 3, "cavalry": false, "moveSpeed": 1.45, "atkInterval": 1.0, "atkRange": 1.5,
  "animSet": "inf_dadao", "shadowSize": 0.55, "sfxHit": "hit_blade",
  "counter": { "3": 66, "9": 68, "5": -67 } }] }""",
"""{ "version": 1, "troops": [{
  "id": 2, "key": "dadao", "name": "大刀", "process": 3, "cavalry": false,
  "moveSpeed": 1.45, "atkInterval": 1.0, "atkRange": 1.5, "animSet": "inf_dadao", "shadowSize": 0.55,
  "counter": { "3": 66, "9": 68, "5": -67 } }] }""", "D1")

# D2 formations.json
rep("""{ "version": 1, "formations": [{
  "id": 0, "key": "square", "name": "方形之陣", "anchorX": 9,
  "weights": [140, 60, 0, 0, 0],
  "areas": { "1": { "x0": 1,  "x1": 14, "y0": 2, "y1": 11, "count": 140 },
             "2": { "x0": -6, "x1": -1, "y0": 2, "y1": 11, "count": 60 } },
  "bakedSlots": "formations.bin#0",
  "counter": { "1": 7, "2": -18, "3": 19, "4": 13, "5": -6, "6": 23, "7": -23, "8": -15 } }] }""",
"""{ "version": 1, "formations": [{
  "id": 0, "key": "square", "name": "方形之陣", "anchorX": 9, "weights": [140, 60, 0, 0, 0],
  "areas": { "1": { "x0": 1,  "x1": 14, "y0": 2, "y1": 11, "count": 140 },
             "2": { "x0": -6, "x1": -1, "y0": 2, "y1": 11, "count": 60 } },
  "bakedSlots": "formations.bin#0",
  "counter": { "1": 7, "2": -18, "3": 19, "4": 13, "5": -6, "6": 23, "7": -23, "8": -15 } }] }""", "D2")

# D3 skills.json
rep("""{ "version": 1,
  "generalSkills": [{
    "id": 12, "key": "banyuezhan", "name": "半月斬",
    "costMp": 40, "power": 100, "qiCost": 120000, "attack": 18, "script": 503,
    "attr": 1, "rank": 2, "target": "area", "radiusCells": 3.0, "maxBBoxCells": [3, 4],
    "fxDir": "magic/001", "fxFrames": 24, "durationMs": 900, "hitFrameMs": 520 }],
  "advisorSkills": [{
    "id": 7, "key": "fubing", "name": "伏兵", "script": 207, "level": 3, "target": "self",
    "effect": { "type": "addTroops", "inf": 20, "cav": 0 }, "phase": "deploy" }] }""",
"""{ "version": 1,
  "generalSkills": [{
    "id": 12, "key": "banyuezhan", "name": "半月斬", "costMp": 40, "power": 100, "qiCost": 120000,
    "attack": 18, "script": 503, "attr": 1, "rank": 2, "target": "area", "radiusCells": 3.0,
    "maxBBoxCells": [3, 4], "fxDir": "magic/001", "fxFrames": 24, "durationMs": 900, "hitFrameMs": 520 }],
  "advisorSkills": [{
    "id": 7, "key": "fubing", "name": "伏兵", "script": 207, "level": 3, "target": "self",
    "effect": { "type": "addTroops", "inf": 20, "cav": 0 }, "phase": "deploy" }] }""", "D3")

# D4 ai_weights.json
rep("""{ "version": 1, "squadDecideHz": 2,
  "score": { "wDist": 60, "wCounter": 0.35, "wBusy": 8, "distBias": 2 },
  "flank": { "counterThreshold": 20, "offsetCols": 3, "minAlive": 6, "maxFrontalDeltaCol": 2 },
  "rout": { "squadAliveLt": 3, "armyRateLt": 0.25 },
  "flow": { "hz": 5, "diagCost": 141, "straightCost": 100 },
  "attack": { "inf": 1.0, "cav": 1.0, "gen": 1.6, "postDelay": 0.2 },
  "ranged": { "bow": { "range": 8, "interval": 2.4, "speed": 12 },
              "crossbow": { "range": 6, "interval": 3.6, "speed": 14, "pierce": 2 } } }""",
"""{ "version": 1, "squadDecideHz": 2,
  "score": { "wDist": 60, "wCounter": 0.35, "wBusy": 8, "distBias": 2 },
  "flank": { "counterThreshold": 20, "offsetCols": 3, "minAlive": 6, "maxFrontalDeltaCol": 2 },
  "rout": { "squadAliveLt": 3, "armyRateLt": 0.25 },
  "flow": { "hz": 5, "diagCost": 141, "straightCost": 100 },
  "attack": { "inf": 1.0, "cav": 1.0, "gen": 1.6, "postDelay": 0.2 },
  "ranged": { "bow": { "range": 8, "interval": 2.4, "speed": 12 },
              "crossbow": { "range": 6, "interval": 3.6, "speed": 14, "pierce": 2 } } }""", "D4")

# D5 battle_params.json
rep("""{ "version": 1,
  "grid": { "cols": 14, "rows": 60, "cellW": 52, "cellH": 46, "logicSub": 256 },
  "view": { "viewH": 900, "zoomNear": 1.5, "zoomStd": 1.0, "zoomWide": 0.7,
            "camDeadzoneRows": 3, "camMaxStepPx": 12 },
  "combat": { "powerBase": 150, "hitDenom": 300, "movingTargetMul": [2, 3],
              "cavalryRetry": true, "soldierDmgDiv": 32, "generalHpScale": 0.6 },
  "flow": { "timeLimitS": 480, "countdownS": 3, "deployMaxS": 20 },
  "post": { "reinforceOnWinRatio": 0.5, "moralePostLoss": 20, "captiveMoraleLoss": 20 } }""",
"""{ "version": 1,
  "grid": { "cols": 14, "rows": 60, "cellW": 52, "cellH": 46, "logicSub": 256 },
  "view": { "viewH": 900, "zoomNear": 1.5, "zoomStd": 1.0, "zoomWide": 0.7,
            "camDeadzoneRows": 3, "camMaxStepPx": 12 },
  "combat": { "powerBase": 150, "hitDenom": 300, "movingTargetMul": [2, 3], "cavalryRetry": true,
              "soldierDmgDiv": 32, "generalHpScale": 0.6 },
  "flow": { "timeLimitS": 480, "countdownS": 3, "deployMaxS": 20 },
  "post": { "reinforceOnWinRatio": 0.5, "moralePostLoss": 20, "captiveMoraleLoss": 20 } }""", "D5")

# D6 §2.9 折叠进 §2.1 尾部（删除 2.9 节，内容并入 2.2 校验段）
rep("""### 2.9 主将位置与 A 侧镜像

- **原作**：主将行固定 6（`0x6A8 = 6 * 0x11C`），列由 `0x442CB6` 算出（依据：docs/04b1 §3.4）；A 侧整表镜像 `X = 0x47 − X`（依据：docs/04b1 §3.2）。
- **竖屏**：主将 `col = 6`（原作 格Y=6 → col 6，忠于原作，14 列的正中在 6.5，偏左半格），`row` 取我方阵形 row 范围的**中点 − 1**（方陣 → row 46，錐形 → row 46）。理由：原作主将站在本阵中央略靠前，竖屏若放在最前排会"主将先死"，放在最后排又看不见（新设计）。
- **A 侧镜像不需要显式实现**：`toVertical(gx, gy, 'foe')` 里的 row 翻转已经完成了原作 `71 − gx` 的等价操作；col 两侧同向（§2.1）。M1 断言：同一阵形对开时，我方 slot i 与敌方 slot i 的 `col` 相同、`row` 之和恒为 59。""",
"""### 2.9 主将位置与 A 侧镜像

原作主将行固定 6（`0x6A8 = 6 × 0x11C`），列由 `0x442CB6` 算出，A 侧整表镜像 `X = 0x47 − X`（依据：docs/04b1 §3.4/§3.2）。竖屏：主将 `col = 6`（原作 格Y=6，忠于原作；14 列正中在 6.5，偏左半格）、`row` 取我方阵形 row 范围的**中点 − 1**（方陣/錐形均为 row 46）——原作主将站在本阵中央略靠前，放到最前排会"主将先死"，放最后排又看不见（新设计）。**A 侧镜像不必显式实现**：`toVertical(gx,gy,'foe')` 的 row 翻转已等价于原作 `71 − gx`，col 两侧同向（§2.1）；M1 断言同一阵形对开时我方 slot i 与敌方 slot i 的 `col` 相同、`row` 之和恒为 59。""", "D6")

io.open(P, "w", encoding="utf-8", newline="\n").write(s)
print("fail:", fail)
print("lines:", s.count("\n"), "chars:", len(s))
