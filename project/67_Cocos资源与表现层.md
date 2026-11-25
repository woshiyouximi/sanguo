# 67 · Cocos 资源同步与三个表现层（w1-cocos-assets 交付）

> 目标：让 Cocos 版不再「全程无声、战场纯色」。本报告只覆盖**源码与资源层面**；
> **没有**运行 CocosCreator 构建（最终打包是 lead 的最后一步）。
>
> 时间：2026-11-25（本地）。工程根：`F:\sanguo\game\cocos`。

## §0 一页结论

| 项 | 结果 |
| --- | --- |
| 工程根 | `F:\sanguo\game\cocos`（Cocos Creator **3.8.8**，设计分辨率 750×1334，fitHeight） |
| 场景 | 4 个：`Boot` / `Campaign` / `Deploy` / `Battle` |
| 脚本 | 28 个 `.ts`（原 23 + 本次新增 5），427,147 B |
| 资源同步 | **996 个文件 / 30,949,184 B**（本次真实拷贝 993 个 / 24,131,017 B） |
| bundle `res` | 1,147 → **2,140 文件**；20,115,393 → **44,246,410 B** |
| 幂等 | 第 2 次运行 `新增 0 / 更新 0 / 跳过 996`，写入 **0 B** |
| 新增表现层 | `AudioBus.ts` / `AudioHost.ts` / `BattleBg.ts` / `BattleWeather.ts` / `core/weather.ts` |
| 战斗壳接线 | `BattleRoot.ts` 11 处（见 §3 表），`core/battle.ts` 5 处天气补丁 |
| 类型检查 | `tsc -p tsconfig.check.json --noEmit` **EXIT=0**（改动前后都是 0） |
| 逻辑验证 | `work/cocos_sync/verify_logic.cjs` 在 Node 里真跑（cc 无关部分）**6 组断言全过** |

## §1 工程结构

### 1.1 根目录

```
F:\sanguo\game\cocos\
├─ package.json          234 B   name=sanguo-vertical, creator 3.8.8（description 已是 GBK 乱码）
├─ tsconfig.json         201 B   extends ./temp/tsconfig.cocos.json + strict
├─ tsconfig.check.json   478 B   我的检查用配置（ES2022/bundler/无 cc 运行时，见 §5）
├─ assets\                      （见 1.3）
├─ library\              57 MB   Creator 导入缓存（本报告不碰）
├─ temp\                 20 MB   构建临时（本报告不碰）
├─ profiles\  settings\  reference\   编辑器配置/参考（本报告不碰）
└─ types\
   ├─ cc.d.ts            189 行  手写 cc stub（注释已被 GBK 化；AudioClip/AudioSource/Graphics/Label/Sprite 都在）
   └─ cc.engine.d.ts     1 行    /// <reference path="F:/sanguo/tools/cocos/cc388/.../bin/.declarations/cc.d.ts" />
```

`cocos-build\` **不是 Cocos 的标准输出目录**（标准是 `build\`），它是历史遗留的导出快照：
`web-desktop` 只有 23 个文件、缺 `res` bundle，**不可用**。本次不碰，打包请走 Creator 正常构建。

### 1.2 场景（4 个，各 ~6.8 KB）

| 场景 | 挂的脚本 | 说明 |
| --- | --- | --- |
| `assets/scene/Boot.scene` | `BootRoot` | 启动、进大地图 |
| `assets/scene/Campaign.scene` | `CampaignRoot` | 大地图/城池/部队 |
| `assets/scene/Deploy.scene` | `DeployRoot` | 出征编成 |
| `assets/scene/Battle.scene` | `BattleRoot` | 战斗（本次接线的地方） |

### 1.3 `assets\` 结构（同步后）

```
assets\ 2,206 文件 / 44,706,641 B
├─ bundles\        2,140 文件 / 44,246,410 B（含 578 个 .meta）
│  ├─ res.meta      isBundle=true, bundleName="res", priority=1,
│  │                compressionType="merge_dep", isRemote=true
│  └─ res\         2,139 文件 / 44,246,082 B   ← 唯一 bundle 的内容全在这里（1,562 资源 + 577 个资源的 .meta）
│     ├─ manifest.json 65,342 B 自定义清单（**已过期**，见 §4-4；无代码引用）
│     ├─ anim\      44 文件 /  6,366,896 B  根 8（atlas.json/atlas_00.png/units.json/units_00.png + meta）
│     │  └─ general\ 37 文件 / 5,613,774 B  ← 本次同步（index.json + sheet_00..35）
│     ├─ audio\    215 文件 / 16,878,372 B  sfx 99 首（+meta）+ bgm 10 首（同步后；原 3 首）
│     ├─ bg\        93 文件 /  8,878,514 B
│     │  ├─ 根        8 文件 /  1,379,077 B  hud_bar/map_bg/map_sheet/deploy_bg + meta
│     │  ├─ env\     31 文件 /  2,716,537 B  ← 本次同步（terrain_00..11/hall_01..06/ui_* 13）
│     │  ├─ orig\    48 文件 /  2,558,605 B  ← 本次同步（floor/bg/mg/fg 各 12）
│     │  └─ policy\   6 文件 /  2,224,295 B  ← 本次同步（palais_01..05 + palais_yield）
│     ├─ data\      32 文件 /  2,110,466 B
│     ├─ face\     801 文件 /  1,987,174 B  ← 本次同步（full 400 + thumb 400 + index.json）
│     ├─ fx\        82 文件 /  2,954,943 B
│     ├─ hero\     800 文件 /  3,181,924 B  400 webp + 400 meta（web 立绘，Cocos 已有，未重复同步）
│     ├─ items\     57 文件 /    140,393 B  ← 本次同步
│     └─ map\        7 文件 /  1,680,865 B  ← 本次同步（chinamap.png/webp + city_1..4 + point）
├─ scene\           8 文件（4 .scene + 4 .meta）
└─ scripts\        55 文件 /   431,756 B（28 .ts = 427,147 B + 27 .ts.meta）
   ├─ ArtLayer.ts       337 行  图/图集加载层（本次扩展使用，未改接口）
   ├─ BattleRoot.ts     719 行  ★ 本次接线（原 635 行）
   ├─ BattleBg.ts       295 行  ★ 新增
   ├─ BattleWeather.ts  210 行  ★ 新增
   ├─ AudioBus.ts       513 行  ★ 新增（移植 core/audio_bus.ts）
   ├─ AudioHost.ts      441 行  ★ 新增（AudioSource 池）
   ├─ BootRoot/CampaignRoot/DeployRoot/DataLoader/EnemyIntel/GameState/types.ts
   ├─ core\  battle.ts(910 行, 打补丁) capture garrison march roster unlock wises
   │         smartscript\{runtime,syscalls,vm,so}.ts   weather.ts(86 行) ★ 新增
   └─ view\  layout.ts theme.ts     shim\ host.ts
```

完整展开（`assets/` 全展开 + `library`/`temp` 摘要）：**`F:\sanguo\work\cocos_sync\tree.txt`**（9,287 行 / 506,728 B，由 `tree.mjs` 生成）。

### 1.4 既有资源清单的坑（影响 §3 表现层的取值）

- `res/data/terrains.json`（2,542 B）是**裁剪版**：12 条只有 `Name/Sequence/SoundTrack/Floor/Foreground/Midground/Background/_index`，
  **没有 `vs` 战力修正列** → Cocos 的 `terrainBonus()` 恒 0（地形在 Cocos 里没有数值修正，这是既有差距，不是本次引入）。
  `SoundTrack` 序列 = `[6,5,4,4,6,5,4,6,6,5,5,4]`，与 `game/web/audio.js:38` 的 `TERRAIN_TRACK` 完全一致。
- `res/data/scenarios.json` 的 `cities[]` **没有地形字段**（只有 NAME/KING/POS/…），所以「哪座城是哪种地形」目前无处可取，
  只能像 web 的 `?terrain=N` 一样由调用方显式传（见 §3.3 的 `BattleLoadout.terrain`）。

## §2 资源同步（C3 / C11）

### 2.1 脚本

- `F:\sanguo\work\cocos_sync\sync_assets.mjs`（8,300 B，Node ESM，UTF-8，无依赖）
  - 源 `F:\sanguo\game\web\assets\...` → 目标 `F:\sanguo\game\cocos\assets\bundles\res\...`
  - 8 组 `{group, src, dst, why}`；递归遍历、**跳过 `.meta`**（web 侧本来就没有）
  - 幂等判据：逐文件 `size + sha256` 比对，一致就 `skip`（**不重写、不动 mtime**）
  - 输出：分组表 + 「新增 / 更新 / 跳过」三计数 + 本次写入字节；`--dry-run` 只报不写
  - 产物：`manifest.csv`（`group,dst,src,bytes,sha256`，996 行 + 表头，按 dst 排序 → 内容只由源决定，两次运行逐字节相同）
    与 `sync_log.csv`（每次运行追加一行：`run,at,added,updated,skipped,files,bytes,copiedBytes`）
- `F:\sanguo\work\cocos_sync\tree.mjs` → `tree.txt`

### 2.2 同步清单（run#1，本次真实拷贝）

| 组 | 源 | 文件 | 字节 | 新增 | 更新 | 跳过 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| face | `web/assets/face/{full,thumb}` + `index.json` | 801 | 1,987,174 | 801 | 0 | 0 |
| anim/general | `web/anim/general/**` | 36 | 5,613,774 | 36 | 0 | 0 |
| bg/env | `web/assets/bg/env/**` | 31 | 2,716,537 | 31 | 0 | 0 |
| bg/orig | `web/assets/bg/orig/**` | 48 | 2,558,605 | 48 | 0 | 0 |
| bg/policy | `web/assets/bg/policy/**` | 6 | 2,224,295 | 6 | 0 | 0 |
| map | `web/assets/map/**` | 7 | 1,680,865 | 7 | 0 | 0 |
| items | `web/assets/items/**` | 57 | 140,393 | 57 | 0 | 0 |
| audio/bgm | `web/assets/audio/bgm/*.mp3`（10 首） | 10 | 14,027,541 | 7 | 0 | 3 |
| **合计** | | **996** | **30,949,184** | **993** | **0** | **3** |

- `audio/bgm` 跳过 3 首 = Cocos 原有的 `04/05/06.mp3`；新增 7 首 = `03/10/11/12/13/14/17`（Cocos 3/10 → 10/10）。
- `hero`（`web/assets/hero` 400 文件 / 4,007,420 B）**没有同步**：Cocos 的 `res/hero` 已有 400 个 webp + 400 meta（3,181,924 B），
  重复同步只会让 bundle 多 4 MB，且 C12 的结论是「hero 待下线」。脚本每次运行只做「源 400 / 目标 800」核对并打印。
- 同步完后 bundle：1,147 → 2,140 文件；20,115,393 → 44,246,410 B。

### 2.3 幂等证据（两次连续运行）

```
$ node sync_assets.mjs           # run#1
新增 993 / 更新 0 / 跳过 3  （本次写入 23.01 MB）
sync_log.csv → 1,2026-11-24T20:28:01.313Z,993,0,3,996,30949184,24131017

$ node sync_assets.mjs           # run#2（第二条命令，中间只改过脚本源码，没动资源）
新增 0 / 更新 0 / 跳过 996  （本次写入 0 B）
sync_log.csv → 2,2026-11-24T20:33:40.567Z,0,0,996,996,30949184,0
```

`manifest.csv` 两次运行都是 997 行、130,064 B；第二次没有重写任何目标文件（`copiedBytes=0`）。

### 2.4 同步的**副作用**（必须在打包前处理，见 §4）

同步只搬文件，**不生成 Cocos 的 `.meta`**。实测：`assets/bundles` 下 993 个资源没有同名 `.meta`
（`.webp` 801 / `.png` 165 / `.jpg` 18 / `.mp3` 7 / `.json` 2）。Creator 只有在**打开工程**时才会导入并写 `.meta`；
直接用命令行构建或者拷 `library/` 都不会补。这一点是「bundle 里到底有没有新资源」的唯一开关。

## §3 三个表现层

### 3.1 音效总线（C6 / C9）

| 文件 | 行 | 内容 |
| --- | --- | --- |
| `game/cocos/assets/scripts/AudioBus.ts` | 1-513 | 移植 `game/src/core/audio_bus.ts`（547 行） |
| 同上 | 71 | `interface AudioSink`（`sfx/magic/flash/brightness` 四个可选方法，签名与 web 一致） |
| 同上 | 103 | `SFX_ALIASES`（`m016a→m016snd01` 等 7 条，与 web 一字不差） |
| 同上 | 163 | `setAudioSink(next)` |
| 同上 | 260 | `emitSfx(input)` → 归一化 → 记账 → 推 sink（sink 抛错 `warnOnce` 吞掉） |
| 同上 | 265 | `emitMagic(dir, volume, source, clock)`（dir 取数字位补 3 位） |
| 同上 | 325 / 370 | `battleAudioMark(world)` / `battleAudioEvents(world, mark)`（**只记账不推 sink**，就地把 mark 推进到当前 tick） |
| 同上 | 477 | `callSystemSo(name, args, input)`：`DownBrightness/RaiseBrightness/AllRush/MajorDeath/LoadingBattleMap` 五个已实装，其余返回 `null` |
| `game/cocos/assets/scripts/AudioHost.ts` | 122 | `class AudioHost`：8 路 `AudioSource` 声部 + Bgm + Ambience 两个 loop 声部 |
| 同上 | 44 / 78 | `MAGIC_SFX` 30 条（抄 `game/web/audio.js:59-68`）/ `TERRAIN_TRACK = [6,5,4,4,6,5,4,6,6,5,5,4]` |
| 同上 | 193 / 207 | `sink()` / `install()`（把自己注册成全局 sink） |
| 同上 | 218 | `pump(world, mark)`：推进快照 + **每 tick 只播 2 声**（`SFX_PER_TICK`）+ 同名 60 ms（`SFX_GAP_MS`） |
| 同上 | 229 / 235 | `playTerrainBgm(terrain)` / `playBattleAmbience(terrain)`（`bg03a/bg04a/bg08a/bg09a`，−9 dB 循环） |
| 同上 | 254 / 417 | `playSfx(name, volume)` / `loadClip(path)`（**四参** `bundle.load(path, AudioClip, null, cb)`） |
| `game/cocos/assets/scripts/BattleRoot.ts` | 108-114 | 字段：`audio / audioMark / bg / weatherLayer / tint` |
| 同上 | 299-302 | `buildUi()` 里 `new BattleBg(...)` + `new AudioHost(this.node)` + `audio.install()` |
| 同上 | 189-205 | `syncAudio(dt)`：`host.pump(world, audioMark)` → `host.update(dt)` → 把 `getBrightness()/getFlash()` 刷给 `ScreenTint` |
| 同上 | 265-267 | `boot()` 里 `audioMark = battleAudioMark(world)`、`playTerrainBgm(world.terrain)`、`playBattleAmbience(world.terrain)` |
| `game/cocos/assets/scripts/core/smartscript/runtime.ts` | 23 / 831 | `sound()` 不再只进日志：`emitSfx({name, volume, source:'script'})`（脚本的 `volume` 仍是 0..255 口径，由 `volume255()` 归一化） |

与 web 版的**三处刻意差异**（`AudioBus.ts` 文件头写明了原因）：

1. `stats.blocks` / `world.fled` 用**可选读取** —— Cocos 的 `World` 根本没有这两个字段（§4-7），所以 `defense` 与撤退音在 Cocos 永远不会触发；
2. `Unit.hurtTroop` 不存在 → 受击音量改用「本侧 `aliveCount` 本 tick 的减少量 ≥3」分档；
3. `unit` 不参与事件键（脚本侧传来的 `unit` 是槽位序号而不是 `Unit` 对象）。

### 3.2 战场背景（C7 / C8）

| 文件 | 行 | 内容 |
| --- | --- | --- |
| `game/cocos/assets/scripts/BattleBg.ts` | 73 | `origPath(kind, terrain)` → `bg/orig/floor07`（不带扩展名，bundle 路径就是资源名） |
| 同上 | 78-140 | 根节点 750×900，落在战场带中心（设计 y=550）；`FloorClip`（静止、`Mask.GRAPHICS_RECT`、750×900）里放 `Floor` |
| 同上 | 117 | `clip.addComponent(Mask); mask.type = Mask.Type.GRAPHICS_RECT` |
| 同上 | 48 / 122-135 | `FLOOR_ROWS=6`、`FLOOR_COLS=3` → 18 个 256×256 `SIMPLE/CUSTOM` sprite |
| 同上 | 165 / 174 / 201 | `get ready()` / `setTerrain(terrain)`（12 套缓存 + token 防竞态）/ `setCamX(camX)` |
| 同上 | 248 | `layerX(width, rate)`：`slack=max(0,w-750)`、`pan=clamp(rate*camPx,-slack/2,slack/2)`、返回 `-slack/2+pan`（**逐字复刻** web） |
| 同上 | 254 | `layoutBands()`：三条带都贴战场带顶部 `FIELD_H/2 - (100*1.04)/2` |
| 同上 | 271 | `drawVignette()`：顶 60px `0.30→0`、底 110px `0→0.30`，各 8 段阶梯（Graphics 无渐变） |
| `BattleRoot.ts` | 455-460 | `redrawBase()`：`const bgReady = this.bg?.ready === true`，ready 时**跳过**整屏底色与 6 段渐变，把战场交给真实底图 |
| `BattleRoot.ts` | 173 | 每帧 `this.bg?.setCamX(this.camX)`（镜头是 `camera(world)` 平滑到 `camX`） |
| `BattleRoot.ts` | 262 | `boot()` 里 `this.bg?.setTerrain(world.terrain)` |
| `ArtLayer.ts` | — | 未改接口；`BattleBg` 复用它的 `loadFrame(path, cb)`（内部四参 `bundle.load` + ImageAsset 兜底） |

三个关键取舍（都在 `BattleBg.ts` 头注释里）：

1. **不用 `Sprite.Type.TILED`** —— 无法在本机验证引擎 tiling 的 offset/size 语义，改用 18 个 SIMPLE sprite + 整块 `setPosition` 平移，
   走的是 `ArtSprite` 已经在用的同一批 API；
2. **遮罩挂在静止节点** —— `FloorClip` 不动、`Floor` 动；如果遮罩跟着内容走，裁剪框会一起滑走，等于没裁；
3. **行数取 6 而不是 5** —— 地面相位在 `[0,256)` 向下平移，最上一行的上边缘要始终 ≥ 战场带顶（局部 +450）：
   5 行（中心 −450…574）在 phase=255 时顶边只剩 446，**会露 4px 缝**；6 行（−450…830）恒定覆盖。

### 3.3 天气（C6 的数值 + 表现）

| 文件 | 行 | 内容 |
| --- | --- | --- |
| `game/cocos/assets/scripts/core/weather.ts` | 1-86（导出：26 `Weather` / 28 `WEATHER_NAME` / 55 `weatherOf` / 69 `weatherHitMod` / 83 `normalizeWeather`） | 逐字移植 `game/src/core/weather.ts`：`Weather` 类型 / `WEATHER_NAME` / `weatherOf(month,terrain)` / `weatherHitMod()` / `normalizeWeather()`（`normMonth` 内部） |
| `game/cocos/assets/scripts/core/battle.ts` | 22 | 新增 `import { normalizeWeather, weatherHitMod, weatherOf } from './weather';` |
| 同上 | 137 / 139 | `CreateOptions` 新增 `weather?: number; month?: number;` |
| 同上 | 162 | `World` 新增 `weather: number;` |
| 同上 | 311 | `createWorld` 里 `weather: normalizeWeather(opts.weather ?? (opts.month !== undefined ? weatherOf(opts.month, opts.terrain ?? 0) : 0))` |
| 同上 | 416 | `hitChance()` 里 `p += weatherHitMod(world.weather);`（**在 `p*2/3` 位移缩放之前**，与 web `src/core/battle.ts:825` 同序） |
| `game/cocos/assets/scripts/BattleWeather.ts` | 47-155 | `class BattleWeather`：雨=110 条斜线 stroke、雪=70 个圆 fill、雾=7 条半透明横带；位置由「时间+序号」确定性哈希算出，同一 t 可复现 |
| 同上 | 159-210 | `class ScreenTint`：`setBrightness(0..16)` → 黑幕 `(16-level)/16`；`setFlash(0..1)` → 白幕 `flash*0.55`；alpha 不变不重画 |
| `BattleRoot.ts` | 218-219 | `boot()` 里 `const terrain = launch?.terrain ?? 0; const month = loadSave().month;` → 一起传给 `createWorld` |
| `BattleRoot.ts` | 264 | `this.weatherLayer?.setWeather(world.weather as Weather)` |
| `BattleRoot.ts` | 317 / 329 | `buildUi()` 里 `new BattleWeather(this.node, 0)`（置于单位层之上）、`new ScreenTint(this.node)`（最上层） |
| `BattleRoot.ts` | 177 / 141 | 每帧 `weatherLayer.update(dt)`（有世界/无世界两条分支都推进） |
| `GameState.ts` | 100-108 | `BattleLoadout` 新增可选 `terrain?: number`（`startBattle()` 是 `{...loadout}` 展开 → 自动透传，不需要改调用点） |

天气与战斗规则的关系：**规则在 `core/weather.ts`，本文件只传 `month`/`terrain` 进去**，渲染层只读 `world.weather`。
`month` 取自 `loadSave().month`（`CampaignSave.month`），Cocos 没有 web 的 `?terrain=N`，所以地形先由 `BattleLoadout.terrain` 显式带（当前所有调用点都没带，默认 0 = 城郭 → 晴/按月份下雪）。

### 3.4 逻辑验证（不依赖 Creator）

`core/**` 与 `AudioBus.ts` 都**不 import 'cc'**，所以可以把它们编成 CommonJS 在 Node 里真跑：

```
cd F:\sanguo\work\cocos_sync
node F:\sanguo\game\node_modules\typescript\bin\tsc --outDir _sim --module commonjs \
  --target ES2022 --moduleResolution node --strict --skipLibCheck --noEmitOnError \
  --rootDir F:\sanguo\game\cocos\assets\scripts  F:\sanguo\game\cocos\assets\scripts\AudioBus.ts
node verify_logic.cjs
```

实测输出（`verify_logic.cjs`，6 组断言）：

```
verify_logic: 全部通过
  [PASS] 天气规则 weatherOf/weatherHitMod/normalizeWeather — 14 个断言全过
  [PASS] createWorld 按地形/月份生成天气 — terrain=8 weather=2
  [PASS] createWorld 接受显式 weather — weather=3
  [PASS] hitChance 吃到天气修正 — p(晴)=238 p(雾)=218 差=20
         事件 33 条 / 240 tick（8s）：death=17 hit01=16
  [PASS] battleAudioEvents 产出命中/受击事件 — 2 类
  [PASS] AudioBus sink/别名/归一化/SYSTEM.SO — sfx=3 magic=2 flash=2
```

其中「p(晴)−p(雾)=20」正是 `weatherHitMod(3) = -20`，说明补丁真的进了命中率而不是躺在字段里。

## §4 打包前必须补 / 需要 lead 决策（按紧急度）

1. **必须：在 Creator 里打开一次工程**，让它导入 993 个新资源 + 5 个新脚本并生成 `.meta`
   （否则 bundle 里不会有 `face/`、`anim/general/`、`bg/orig/`、`bg/env/`、7 首新 BGM）。
   核对命令（构建后跑，期望值）：
   ```powershell
   cd F:\sanguo\game\cocos\assets\bundles
   (Get-ChildItem face -Recurse -File -Filter *.webp).Count          # 期望 800
   (Get-ChildItem anim\general -Recurse -File -Filter *.png).Count   # 期望 35
   (Get-ChildItem bg\orig -Recurse -File -Filter *.png).Count        # 期望 48
   (Get-ChildItem bg\env  -Recurse -File).Count                      # 期望 31（18 jpg + 13 png）
   (Get-ChildItem audio\bgm -Recurse -File -Filter *.mp3).Count      # 期望 10
   ```
2. **必须：确认 `res` 是远端 bundle**（`res.meta` 里 `isRemote: true`，`compressionType: "merge_dep"`）。
   bundle 从 20.1 MB 涨到 **44.2 MB**，`remoteServerAddress`/CDN 与首包策略要跟着改，否则首包直接多 24 MB。
3. **必须：构建后确认 battle 场景真的挂了 `BattleRoot`**，且 Canvas 设计分辨率仍是 750×1334 fitHeight。
   本次所有新节点都是**代码创建**（不需要改 `.scene`），但这一条依赖 `Boot→Campaign→Deploy→Battle` 既有链路没被别的分支改坏。
4. `res/manifest.json`（65,342 B）**已过期且是 GBK 乱码**：里面写 `totalFiles 564 / totalBytes 29,782,437`，实际是 2,140 / 44,246,410。
   目前**没有任何代码读它**（全仓 grep `manifest` 只命中我自己的注释），所以不阻塞打包；若要留作审计用途，建议让 lead 在打包前用一次脚本重生成（或直接删除）。
5. `audio/bgm` 现在有 10 首（13.4 MB），但 Cocos 侧**只用到 `04/05/06`**（`TERRAIN_TRACK` 只取 4/5/6）。
   `03/10/11/12/13/14/17` 是给菜单/大地图/内政预留的，若做首包瘦身可以只留 3 首（省 ~13 MB），需要产品决策。
6. `face`(801) / `anim/general`(36) / `map`(7) / `items`(57) / `bg/env`(31) / `bg/policy`(6) **目前没有消费方**：
   `ArtLayer` 现在只加载 5 张图（`bg/hud_bar`、`bg/map_bg`、`bg/map_sheet`、`bg/deploy_bg`、以及 `BattleBg` 的 `bg/orig/*`）。
   这几组是为后续「头像/立绘/大地图/道具」准备的，接图的人需要知道路径已经就位（`face/full/001`、`anim/general/sheet_00` 之类，见 `manifest.csv`）。
7. **规则侧缺口（不是我能改的，`F:\sanguo\game\src\**` 归 s1/s2）**：Cocos 的 `core/battle.ts` 没有 `stats.blocks`、`World` 没有 `fled`，
   所以 `AudioBus` 的**格挡声 `defense` 与撤退声 `yell03+horse02` 永远不会响**。要补齐必须由 s1 在 core 里加这两项统计。
8. **数据侧缺口**：Cocos 现在 17 次命中 = 17 个阵亡（一击必杀），导致 `battleAudioEvents` 的
   「`u.alive && u.lastHitTick===tick`」分支实测 **0 命中** → 受击音 `hit02` 与主将 `yell01..04` 听不到（阵亡的 `death` 正常）。
   要么等 s1 调战斗数值，要么把条件放宽成「本 tick 挨打即发声（含刚死的）」——后者偏离 web 语义，我没擅自改。
9. 我改了 `core/smartscript/runtime.ts:23,831`（`sound()` 接总线）。**s2 若用 web 版覆盖 cocos 副本，这两行会丢**，
   覆盖时请保留；`AudioBus` 的 `SfxInput.unit` 是 `Unit` 对象，脚本传的槽位号不能直接塞（已注释在 831 行上方）。
10. 未接：菜单/大地图 BGM（`BootRoot`/`CampaignRoot` 没有 AudioHost），`MAGIC_SFX` 映射表已就位但没有调用点
    （法术音目前只走 `callSystemSo` 与 `battleAudioEvents`，smartscript 的 `emitMagic` 调用点还没接）。

## §5 我没有验证到的部分（诚实清单）

1. **没有运行 CocosCreator 构建，也没有预览**。所以：bundle 里到底有没有这 993 个资源、`res` 远端路径对不对、
   构建体积/首包时间，全部**未知**。
2. **渲染效果零实证**。以下都只过了类型检查：
   - `Mask.GRAPHICS_RECT` 在 3.8.8 上对「静止父节点 + 平移子节点」的裁剪是否如预期；
   - 18 个地面 sprite 的相位是否真的无缝（数学上按 256 网格算过，但没截图）；
   - `Graphics` 画 110 条雨线 + 70 个雪圆的每帧开销（30Hz 逻辑之外还有 60fps 渲染）；
   - `ScreenTint` 的白幕叠在黑幕之上是否与 web 的观感一致；
   - `Sprite.sizeMode=CUSTOM` + 运行时改 `contentSize` 后三条视差带的拉伸是否对。
3. **音频没响过一次**。`AudioSource` 池 8 路并发、`bundle.load` 音频路径（`audio/sfx/hit01`）、
   移动端自动播放策略（首次触摸前被静音）、`volume` 渐变，全部未验证。`AudioHost` 的加载失败会 `console.warn` 一次并负缓存，
   真机上如果路径不对只会安静地没声音 —— 首次真机验收请重点听 `hit01` 与 BGM。
4. **`tsc` 只证类型**。`tsconfig.check.json` 用的是「手写 stub `types/cc.d.ts` + 引擎 `cc.d.ts`（3.3 MB）」合并，
   `skipLibCheck: true` 掩盖了重复声明；真实 Creator 编译（`tsconfig.json` → `temp/tsconfig.cocos.json`）我没有跑。
   另外 `types/cc.d.ts` 的注释已经是 GBK 乱码，本次没动它（不属于我的范围）。
5. **没有 git**（`F:\sanguo\.git` 不存在），本次改动**无法用 diff 复核**，只能靠本报告的行号清单。
6. `verify_logic.cjs` 只覆盖「与 `cc` 无关」的部分（天气/命中率/事件生成/总线/sink）。三个表现层里真正碰引擎的代码
   （`AudioHost`/`BattleBg`/`BattleWeather`/`BattleRoot` 接线）**一行都没被执行过**。
7. 没有验证「不装 AudioHost 时游戏是否照常」以外的降级路径；也没验证连续重开（`onTouch` 重开一局）时
   `audioMark` 是否被正确重置（代码上 `boot()` 里重建，但没有运行时证据）。

## §6 交付物索引

| 路径 | 说明 |
| --- | --- |
| `F:\sanguo\work\cocos_sync\sync_assets.mjs` | 幂等同步脚本（8 组，size+sha256，写 manifest/sync_log） |
| `F:\sanguo\work\cocos_sync\manifest.csv` | 996 行清单：`group,dst,src,bytes,sha256` |
| `F:\sanguo\work\cocos_sync\sync_log.csv` | 两次运行记录（run1 993/0/3，run2 0/0/996） |
| `F:\sanguo\work\cocos_sync\tree.txt` | 工程结构展开（9,287 行 / 506,728 B） |
| `F:\sanguo\work\cocos_sync\tree.mjs` | 生成 tree.txt |
| `F:\sanguo\work\cocos_sync\patch_battle_weather.mjs` | 给 `core/battle.ts` 打 5 处天气补丁（幂等，`--dry-run`） |
| `F:\sanguo\work\cocos_sync\verify_logic.cjs` | cc 无关部分的运行时验证（6 组断言） |
| `F:\sanguo\work\cocos_sync\_sim\` | 上者的 CommonJS 编译产物（可随时删） |
| `F:\sanguo\game\cocos\assets\scripts\{AudioBus,AudioHost,BattleBg,BattleWeather}.ts` | 三个表现层 |
| `F:\sanguo\game\cocos\assets\scripts\core\weather.ts` | 天气规则（web 副本） |
