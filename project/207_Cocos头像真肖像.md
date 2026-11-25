# 207 · Cocos 战斗 HUD 接真肖像（`face/full` 铺在金框下 + 右下角 Lv 徽章）

**一句话**：Cocos 战斗 HUD 左上角的头像框以前只画 `port.png` 金框 + 「將」占位；这一轮把 `res/face/full` 的真肖像按 web 同一口径（cover 90×108、金框压在脸上面、右下角 40×20 Lv 徽章）接进去，没图/没映射时仍退回占位那套。

**改动**：`game/cocos/assets/scripts/BattleHud.ts`（1217 → 1319 行）
**验收**：`node work\cocos_hud2\hud_assert.mjs` → **122 / 122 PASS**（原 108 条 + 新增 14 条），`work\cocos_hud2\hud_assert_r207.log`
**观感**：`work\cocos_hud2\battle_hud.png`（整页）、`cards_closeup.png`、`portrait_crop_r207b.png`（4× 放大）

![头像框里的關羽真肖像（4× 放大，右下 Lv.6 徽章）](../work/cocos_hud2/portrait_crop_r207b.png)

---

## 1. 改前是什么样（缺口是怎么定的）

- `BattleHud.ts:217` 只有一条 art spec：`{ name: 'HudPortrait', tex: 'port', rect: PORTRAIT, mode: 'sliced' }` —— 载入 `ui/battle/port.png` 当九宫框，框中心是透明的。
- 框里靠两条 Label 撑：`PortraitGlyph`（'hero' 40px，`'將'`，61,1062）+ `PortraitLevel`（'num' 20px，`Lv.N`，61,1102）。
- `refreshConsole()` 原来那行注释就是欠账：「头像框：没有头像图（face/* 还没接），框里叠「將」+ 等级」。
- **web 侧本来就有真肖像**：`game/web/main.js:1053 loadPortrait()` 按名字缓存 100×120 的 FACE，`main.js:1154` 传 `portrait:`；`game/src/view/battleView.ts:2159-2208 drawConsole` 画的就是 cover 裁切 + 右下角徽章。⇒ 这不是「新功能」，是 Cocos 侧少抄了一层，属真实保真缺口（`project/199` §5 第 2 项，1–2h）。

## 2. 改了什么（逐处）

| 位置 | 改动 |
|---|---|
| `BattleHud.ts:85` | 新增 `function coverFit(frame, rect)`：`scale = max(rect.w/s.width, rect.h/s.height)`；100×120 的 FACE 盖 86×108 的框 → **90×108**（左右各溢 2px，被金框 ≥6px 的边吃掉，不需要 Mask） |
| `BattleHud.ts:485` | 字段：`face: ArtSprite`、`faceName`、`faceState: 'none'|'loading'|'ready'`、`faceBadgeGfx: Graphics`、`faceBadge: Label` |
| `BattleHud.ts:583` | `new ArtSprite(this.consoleRoot, 'HudFace', PORTRAIT, 'stretch')` + `node.setSiblingIndex(0)`：0 号子节点 = **先渲染 = 压在金框下面** |
| `BattleHud.ts:609` | `PortraitBadge` 节点 + Graphics：`roundRect(...)` 40×20、圆角 4、`rgba(10,12,16,.78)`（对应 web `R(...,'rgba(10,12,16,.78)',{radius:RADIUS.sm})`） |
| `BattleHud.ts:620` | `PortraitBadgeLv` 标签：`caption` 12px、gold、盒中心 (84,1110) |
| `BattleHud.ts:1026` | `ensureFace(name)`：`faceName` 相同直接 return（**负缓存**，载失败也不每帧重跑五级回落链）；换将先收掉上一张脸；`Portrait.loadPortrait(..., 'full', loadFrame, cb)` |
| `BattleHud.ts:1050` | `applyFace(frame, size?)`：有 size 用 size，否则 `coverFit`；按 web 的 `sy=(pr.h-sh)*0.16` 折成 `dy=(fitted.h-108)*0.34` 把脸往下压（不压的话框里半张是背景） |
| `BattleHud.ts:1069` | `refreshConsole` 按 `faceState === 'ready'` 切两支：有脸 → 隐藏「將」与居中 Lv、显示底板+徽章字；没脸 → 原样保留 |

## 3. 与 web 的对齐口径

| 项 | web（`battleView.ts:2159-2208`） | Cocos（本轮） | 断言 |
|---|---|---|---|
| 框 | `PORTRAIT = {x:18,y:1012,w:86,h:108}` | 同一份 `layout.ts:126` 常量 | 90×108 cover |
| 脸 | cover，`sw=86/scale`、`sh=108/scale` | `coverFit` → 90×108 | `w=90 h=108` |
| 裁切 | `sy=(pr.h-sh)*0.16`（从头顶 16% 处切） | `dy=(108-108)*…`→ 本例 0；若 h>108 才下压 | 中心 (61,1066) |
| 层级 | 先铺脸、再压框、再字 | `setSiblingIndex(0)` | `parentName=HudConsole, index=0` |
| 徽章底 | `R(64,1100,40,20,'rgba(10,12,16,.78)',r=sm)` | 同几何、同色 | `plateActive=true` |
| 徽章字 | `T(84,1104,'Lv.N',12,gold)`（alphabetic 基线） | 盒中心 (84,1110)，12px gold | `dx=84 dy=1110 size=12` |
| 缺图 | 椭圆 + 32px「將」+ 14px Lv@(61,1104) | 原「將」分支原样保留 | `PortraitGlyph/Level.active=false`（有脸时） |

> 徽章字 6px 差：web 那行是 `textBaseline='alphabetic'`（`battleView.ts:2640`），1104 是基线；Cocos Label 给的是盒中心，取 1104+6=1110 才是同一行。已在代码注释里写明，不逐像素复刻。

## 4. 验证（全部可复跑）

1. **类型**：`cd F:\sanguo\game; node node_modules\typescript\bin\tsc -p cocos\tsconfig.check.json` → **exit 0**（`types/cc.engine.d.ts` 指向真 Cocos 3.8.8 声明，不是手写兜底）
2. **构建**：`powershell -NoProfile -ExecutionPolicy Bypass -File tools\build_wechat.ps1 -AppId wxf631d432ca7abcee -Mode preview`
   → `web-mobile` 2026-11-26 03:03:45（23.2 MB）、`wechatgame` 03:03:20、`✅ 出包成功：F:\sanguo\dist\wechat-preview`（日志 `work\build_hudface.log`）
3. **断言**：`node work\cocos_hud2\hud_assert.mjs` → **断言总数 122 · 通过 122 · 失败 0**（原 108 + §8 新增 14）
4. **截图**：`OUTDIR=…node work\cocos_verify\cdpweb.mjs run work\cocos_hud2\steps_shots.mjs` → 三张 876×1368，帧在涨（`frames@battle_hud 586 → 647 OK`），日志 `work\cocos_hud2\shots_r207.log`

新增的 14 条断言（`hud_assert.mjs` §8）：

```
ok  dump 里找到 HudFace                                     [{parentName:"HudConsole",index:0,active:true,w:90,h:108,dx:61,dy:1066,hasFrame:true}]
ok  HudFace 挂在 HudConsole 下、是 0 号子节点（先渲染 = 压在金框下面）
ok  HudFace 已激活且拿到了 frame（真肖像，不是占位）
ok  cover 后高 = 108 / 宽 = 90
ok  脸的设计中心 (61, 1066) = 头像框中心
ok  有肖像时「將」占位隐藏 / 居中 Lv 隐藏
ok  右下角 Lv 徽章出现（底板 + 字都在）
ok  徽章字 = Lv.6 / 12px / (84,1110)
```

## 5. 踩到的坑（断言器侧，都写进注释了）

1. `h.find(root, name)` 找的是**组件类名**，不是节点名 —— `h.find(node, 'HudFace')` 永远 null。改成自写的 `byName()`（`h.walk` 里按 `n.name` 比）。
2. `HUD_DUMP` 是 `String.raw` 模板串：**注释里写反引号会提前结束字符串**（`SyntaxError: Unexpected identifier 'cc'`）。dump 代码里一律不用反引号。
3. 构建产物里 `cc.UITransform` 可能是 `undefined`（`getComponent(cc.UITransform)` → null → w/h 采成 null）；用字符串 `getComponent('cc.UITransform')`（`h.label` 本来就这么写的）。
4. 子节点序号要按 `f.parent.children` 算：HudFace 的父是 `HudConsole`，拿 `BattleHud.children.indexOf` 会得 −1。

## 6. 基线没动

`cd F:\sanguo\game` 下 `npm.cmd exec -- tsc --noEmit` **0**、`-p tsconfig.build.json` **0**、`node --test tests/*.test.ts` **1555 pass / 0 fail**、根目录 `node work\fidelity\check.mjs` **PASS 459 / FAIL 0 / SKIP 3 / WARN 0**、`work\enc\scan_utf8.mjs`（改过的 3 个文件）**0 BAD**。日志 `work\baseline_r207b.log`。

## 7. 下一步

`project/199` §5 第 3 项：**名册列表行头像**（1h）——`GeneralBookPanel.ts:947/500` 现在行首是姓名首字牌，401 行要异步图 + 限流。之后按 §6 顺序：R115（8h）→ R83（4h）→ R81（4h）→ R91（3h）→ R103（4h）。
