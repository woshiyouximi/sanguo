## §4 Cocos C1–C12 表（两次采样，含 mtime）

**采样 A：2026-11-25 05:22:33｜采样 B：2026-11-25 05:38:15**（`Get-Date` 实测）。这 16 分钟里 Cocos 侧**又出了一次包**：`game/cocos-build/wechatgame/game.json` **05:37:46**、`dist/wechat-upload/game.json` **05:37:49**，包体从 15.81 MB 涨到 **17.80 MB**。

**⚠️ 中间态声明（这是本表最该被质疑的地方）**：用户说有 3 个 agent 在改 Cocos，实测**确实在动，而且我读到的是中间态**——采样 B 时 6 个脚本的 mtime 晚于采样 A，`GeneralArt.ts`/`ArtLayer.ts` 是窗口内**新建**的：

| 文件 | 05:22（A） | 05:38（B） | 变化 |
|---|---|---|---|
| `assets/scripts/CampaignRoot.ts` | 39,340 B 05:02:13 | **44,536 B 05:35:13** | +5.2 KB |
| `assets/scripts/CityPanel.ts` | 41,400 B 05:05:29 | **43,409 B 05:35:45** | +2.0 KB |
| `assets/scripts/GeneralArt.ts` | — | **9,101 B 05:34:55** | **新文件**（美术） |
| `assets/scripts/ArtLayer.ts` | — | **16,052 B 05:32:03** | **新文件**（美术） |
| `assets/scripts/BattleRoot.ts` | 32,808 B 04:44:50 | **33,713 B 05:32:57** | +0.9 KB |
| `assets/scripts/BattleBg.ts` | 11,756 B 04:34:12 | **12,106 B 05:32:18** | +0.35 KB |
| `assets/scripts/AudioBus.ts` | 19,809 B 05:19:49 | 同（未再改） | 仍晚于旧包 |
| `assets/scripts/AudioHost.ts` | 23,361 B 05:20:12 | 同（未再改） | 仍晚于旧包 |
| `assets/bundles/res/audio-remote.json` | 549 B 05:19:49 | 同 | — |
| 脚本总数 | 37 个 .ts / 843,756 B | 37 个 / 843,756 B | 未增文件（新增两个是美术 ts） |

> **C1 在本轮采样后已经再次漂移**（读到的是 05:42 的实测）：`game/cocos/assets/scripts/core/` 11 个文件**全部停在 04:42:07**，而 `game/src/core/battle.ts` 已到 **05:33:29（94,307 B）**、`syso_host.ts` 05:34:38（45,781 B）——Cocos 副本的 `battle.ts` 只有 **72,419 B**，落后 **21,888 B**。也就是说 **05:22 那次「C1 已同步」的结论在 15 分钟内失效了**。这是 66「C1 core 旧 fork」问题的复发，不是新问题。

| # | 66 的缺口 | R83 状态 | 证据（本轮实测，含 mtime） |
|---|---|---|---|
| C1 | core 是 R81 前旧 fork | **🟡 同步过一次，又漂了** | 05:22 逐文件 diff：battle 8/8、capture 2/2、roster 2/2、strategy 5/5、unlock 2/3、wises 7/20 行差异（KEEP_PATCH：`WISESKILL` 字符串解析压成一行）；march/weather 哈希相同。**但 05:42 复采：Cocos `core/battle.ts` 72,419 B@**04:42:07** vs `src/core/battle.ts` 94,307 B@**05:33:29**，差 21,888 B** → 现在又不同步了 |
| C2 | 不复用 `dist/` | **🟡 设计如此（风险）** | `CampaignRoot.ts:33 from './core/garrison'`；Cocos 用自有副本、不 import `game/dist`。靠手工 `copy` 同步 → C1 的漂移就是代价。建议同步脚本，1h〔自估〕 |
| C3 | 缺内政页 | **✅ 已有** | `scripts/CityPanel.ts` **43,409 B（05:35:45）**，`CampaignRoot.ts:29` import、`:443-460 openCityPanel`；无独立 `CityRoot.ts`（挂 CampaignRoot 下） |
| C4 | 缺物品页 | **✅ 已有** | `scripts/ItemsPanel.ts` 57,377 B（05:01:49），`CampaignRoot.ts:38` import、`:949-957 ItemsPanel.show` |
| C5 | 无君主系统 | **❌ 仍缺** | Cocos 无 `monarch_model`（37 个 .ts 里 grep `monarch\|Monarch` = **0**）；`CampaignRoot.ts:733 kingNameOf` 只从 scenarios 的 `KING` 字段取字符串；无 `save.king`/`ensureKing`/`renderKingBar`/`forceExtinct` |
| C6 | 无 AI / 无势力灭亡 | **❌ 仍缺** | Cocos 无 `ai_model`（grep `ai_model\|AI\.plan\|planMonth\|runMonth` = **0**）→ 敌人回合不发兵、不内政、不外交 |
| C7 | 缺 `weather.ts` | **✅ 已有** | `BattleWeather.ts` 6,998 B（04:31:24），`BattleRoot.ts:33` import |
| C8 | 缺 `audio_bus.ts` | **✅ 代码已有** | `AudioBus.ts` 19,809 B（05:19:49）/ `AudioHost.ts` 23,361 B（05:20:12）；`BattleRoot.ts:29-31/107-125/181-189` 接 pump（`SFX_PER_TICK=2` 节流）→ **代码在，素材不进包（C12）** |
| C9 | 战场无背景层 | **✅ 已有** | `BattleBg.ts` **12,106 B（05:32:18）**、`ArtLayer.ts` 16,052 B（新）；`BattleRoot.ts:32/112/175` |
| C10 | 大地图仍 4:3 | **❌ 仍在** | 05:42 复读 `CampaignRoot.ts:57 MAP_VIEW={x:20,y:130,w:710,h:900}`、`:58 MAP_WORLD={x0:88,x1:1138,y0:84,y1:860}`、`:66 MAP_IMAGE_W=1280`（H=960）、`:343-347 scale=Math.min(sx,sy)*0.94` → 图矩形 **813×610**（`:64`/`:233` 注释同值）；竖屏 750×1334 下地图上下各空 ~290px（32%） |
| C11 | 资源不同步 | **🟡 补进来了，但没瘦身** | `assets/bundles/res` **3079 档 33.37 MB**：anim 75/2.43、audio 222/**16.10**、bg 125/3.84、data 32/2.01、**face 1604/2.64**、fx 82/2.82、**hero 800/3.03**、items 114/0.19、map 12/0.24。零引用资源停 `game/cocos-park/res/{anim/general,bg/env,bg/policy,map}`；**hero 800 档 3.03 MB 仍无脚本引用**（grep `hero/` 只命中 weather 假阳性） |
| C12 | 音频不同步 + hero 进包 | **❌ 音效仍缺** | bundle 里 audio **222 档 / 109 个 mp3+ogg / 16.10 MB**；**新包（05:37:49）里 mp3/ogg/wav/m4a 仍是 0 个** → 打出来的包**全程无声**。`hero 800 档 3.03 MB` 同样仍在包里 |

**出包静态事实（05:38 采样）**：`dist/wechat-upload` **2962 档 / 17.80 MB**（assets 11/0.48、cocos-js 1/1.33、src 6/0.03、subpackages **2934/15.80**）；`game.json` 253 B = `{"deviceOrientation":"portrait", …, "subpackages":[{"name":"res","root":"subpackages/res/"}]}`；`game/cocos-build` 下 wechatgame **05:37:46**、web-mobile 04:49、web-desktop/-remote 为 11-24 旧物。
**与 05:11 旧包对比**：15.81 → **17.80 MB**（+1.99 MB），subpackages 13.83 → **15.80 MB**（+1.97 MB，多出来的基本是窗口内补进包的美术/音频描述，**音频本体仍为 0**）。

**Cocos 侧一句话**：**C1/C3/C4/C7/C8/C9 的代码都在（其中 C1 又在漂）**；**真正拦发布的只剩 C5（君主）、C6（AI）、C10（4:3）、C12（无声）**，其中 C5/C6 是「敌人不会动、你不知道自己是谁」级别的缺失——Cocos 版现在**不是一个能玩的游戏**，是「能点开的大地图 + 能打一场战斗」。
