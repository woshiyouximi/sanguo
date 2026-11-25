# 34 · Cocos 同步 core 与三屏回归

> 2026-11-24。目标：把 `game/cocos` 从几天前的 core 快照拉到与 web 一致（garrison / unlock / wises /
> smartscript / march），补上数据文件，改完三个 Root 后重新出包并截图验证。

## 1. 同步了什么（18 个文件 + 1 处清单）

| 类别 | 文件 | 说明 |
| --- | --- | --- |
| core 源码 11 个 | `battle capture garrison march roster unlock wises` + `smartscript/{runtime,so,syscalls,vm}` | 从 `game/src/core/**` 全量拷到 `cocos/assets/scripts/core/` |
| 类型 1 个 | `types.ts` | `game/src/types.ts` → `cocos/assets/scripts/types.ts` |
| 数据 3 个 | `garrison.json` 87,547 B · `magic_so.bin` 261,008 B · `magic_so.symbols.json` 59,761 B | 进 `assets/bundles/res/data/` |
| 图集 2 个 | `units.json` 11,582 B · `units_00.png` 414,205 B | 进 `assets/bundles/res/anim/`（弓兵拉弓帧） |
| 清单 | `assets/bundles/res/manifest.json` | anim +2 / data +3，重算 summary：564 文件 / 29,782,437 B |

拷的时候把相对 import 的 `.ts` 后缀去掉（`'../types.ts'` → `'../types'`）——Creator 产物是
`System.register` 模块，带后缀的 specifier 解析不到。

## 2. 宿主 API 问题与解法

Cocos 没有 `import.meta` / `location` / `fetch` / `XMLHttpRequest`。三处处理：

1. **`import.meta.url`**（`smartscript/runtime.ts:47`，原来用 `new URL('../../../data/', import.meta.url)`
   定数据目录）——Creator 编译不了 `import.meta`，改成 `new URL('data/', 'https://cocos.local/')`。
   这是 cocos 副本相对 web 的**第 1 处偏离**，注释写在源码上方。
2. **`location` / `fetch` 兜底**：新增 `assets/scripts/shim/host.ts`——`installHostShim()` 幂等塞一个
   假 `location`，并包一层 `fetch`：URL 以 `magic_so.bin` / `magic_so.symbols.json` 结尾时改从 res
   bundle 取（`BufferAsset.buffer()` / `JsonAsset.json`），其余交回原 `fetch`。
   `preloadMagicProgram()` 在 `BootRoot.boot()` 里 `loadGameData()` 之后 `await`，失败只 warn 不抛，
   法术退化成占位特效但战斗照跑。core 的 `initMagicProgram('data/')` 预加载路径原样复用。
3. **`.bin` 的导入类型**：`magic_so.bin` 在 res bundle 里被导入成 `cc.BufferAsset`（见构建产物
   `assets/res/config.*.json`），所以 shim 里按 `BufferAsset` 取，不走 text。

另外两处是 Creator 的 Babel（loose 模式）**把 `[...set]` / `[...map.values()]` 编成 `[].concat(x)`**，
Set/迭代器不会展开，运行期拿到的是 `[Set]` / `[迭代器]`：

- `core/unlock.ts` 的 `toIndexes()` → 兵种/阵形白名单整排误判「未學」（截图里全灰）。
- `core/wises.ts` 的 `listWisdomChoices()` → 军师技列表显示成「技 undefined」。

两处都改成 `Array.from(...)`（第 2、3 处偏离），并在注释里写明原因。第三个数据问题是
`generals.json` 的 `WISESKILL` 是字符串 `"34, 47"`，`parseWiseSkill()` 只吃数组 → 补了字符串分支
（第 4 处偏离；web 侧由 `deploy.html` 自己 split，走不到这段）。

## 3. 三个 Root 的改动

- **CampaignRoot**：城市卡三行 `勢力 / 太守 / 守將`（`garrisonOf` + `defendersOf`），开局自城也有
  「太守」可显示；`KING` 是数字时按關隘显示（12 个關隘编号）；出征前 `setDeployFrom(nearestOwnedTo(...))`
  给 Deploy 一个等价于 web `?from` 的出发城。
- **DeployRoot**（重写）：主将池按出发城 `city_by_times[0] === home && status_by_times[0] !== '未'`，
  太守优先再按 STR+INT；兵种 13 格 / 阵形 9 格用 `troopsOf/formationsOf` 置灰 + 「未學」角标且不可点；
  军师技一栏 `不用 + listWisdomChoices()`（未实作项标暗）；兵力改滑杆（上限 `min(等级×5,100)`）+
  50/80/100 快捷；`march()` 带 `wise` 与 `bgen`，敌方属性来自 `battleSetup()`（garrison.json 优先）。
- **BattleRoot**：`createWorld` 之后 `applyWise(world,'A',launch.wise)`；敌方主将名用 `launch.bgen`；
  兵种 3/11 换 `anim/units` 的 archer 帧；HUD 结算行显式列出法术击杀 `擊殺 N（法術 M）`、将名列尾追
  `軍師技：…`。**没有**自己调 `runSkill`/`cast`——法术仍由 core 的逐帧 `step()` 推进。

## 4. 出包与体积

`CocosCreator.exe --build "platform=…;debug=false;md5Cache=true;startScene=0b007000-…0001"`，
日志均以 `build Task (…) Finished` 收尾（`$p.ExitCode` 恒为空，按文档以日志+产物为准）：

| 产物 | 文件 | 体积 | 备注 |
| --- | --- | --- | --- |
| `game/cocos-build/web-mobile` | 1143 | 20.22 MB | 完整包，含引擎 cocos-js |
| `game/cocos-build/wechatgame` | 1148 | 20.13 MB | 完整包 |
| `web-mobile` + remote（`work/pack_remote.mjs`） | 22 | 1.89 MB | 首包，res 18.33 MB / 1121 文件走 CDN |
| `wechatgame` + remote | 27 | 1.80 MB | 首包，res 同上 |

`tsc -p cocos/tsconfig.check.json` exit 0（`types/cc.engine.d.ts` 直接引用引擎自带的 3.3 MB 声明）。

## 5. 截图（`work/`）

| 图 | 内容 |
| --- | --- |
| `cocos2_campaign.png` 750×1334 | 北平城市卡：`勢力 公孫瓚 · 太守 公孫瓚 · 守將 公孫瓚/嚴綱/公孫越` |
| `cocos2_deploy.png` 750×1334 | 公孫越：12 个兵种「未學」置灰、仅链锤可选；8 个阵形置灰、仅钩形可选；军师技 `不用 / 後選出陣`；兵力滑杆 60/100 |
| `cocos2_battle.png` 750×1334 | 劉備（弓兵 troop 3）对黃巾（troop 10），定格在拉弓帧（17 帧循环的第 4 帧），HUD 顯示 我軍 54/60 · 3.8s · 敵軍 54/60 |
| `cocos2_iphonex.png` 375×812 | SHOW_ALL 适配：750×1334 等比缩到 375×667，上下各 72 px 黑边吃掉刘海/Home 条 |

## 6. Cocos 与 web 还差什么

1. **守城战（defend）**：web 有 `defend=1&city=&bgen=` 分支、按比例扣兵、`defWins` 计入战绩；Cocos
   只会攻，没有守城入口。
2. **行军 march**：`core/march.ts` 已同步但没接视图——web 的行军动画/拦截还没搬。
3. **campaign AI**：敌方每月行动（web `campaign.js`）未移植，Cocos 只有「推进一月」。
4. **战后处置**：`capture.ts` / `roster.ts`（`applyCapturesToRoster`）未接，俘虏/招降没有入口。
5. **军师技**：选择能到 `applyWise`，但战斗里只作用于修正；未实作项（`WISE_UNIMPLEMENTED`）只剩提示，
   没有 web 那样的战前说明面板。
6. **技能 HUD**：BattleRoot 仍硬编码 `命療術 / 半月斬 / 落月箭 / 神鬼亂舞`，没按武将 SKILL 解析。
7. **音效**：`audio/` 资源未接（BGM / 战斗音效全静音）。
8. **微信分包**：`wechatgame` 完整包 20.13 MB 超主包 4 MB 限制，本轮用 `pack_remote` 手工验证两分法，
   还没纳入 `tools/build_wechat.ps1` 的一键流程。

## 7. 复现命令

```powershell
# 构建（GUI 子系统 exe，PowerShell 不会等待，必须 Start-Process + WaitForExit）
Remove-Item Env:\ELECTRON_RUN_AS_NODE -EA SilentlyContinue
$arg='platform=web-mobile;debug=false;md5Cache=true;buildPath=F:/sanguo/game/cocos-build;startScene=0b007000-1a2b-4c3d-8e4f-000000000001'
$p=Start-Process 'F:\sanguo\tools\cocos\cc388\CocosCreator.exe' -ArgumentList @('--project','F:/sanguo/game/cocos','--build',$arg) -PassThru -Wait
# 静态服务 + 截图
python -m http.server 8900 --bind 127.0.0.1 --directory F:/sanguo/game/cocos-build/web-mobile
node work\shot.mjs http://127.0.0.1:8900/index.html work\cocos2_deploy.png 9000 750 1334 - '@F:\sanguo\work\cocos2_deploy.js' -
```

---

## 8. 2026-11-25 修复：敌将取数 / 守城战与行军入口 / 一键出包

> 本轮只动 `game/cocos/**`、`tools/build_wechat.ps1`、`project/23`、`project/34`；
> `game/src`、`game/web`、`proto`、`data`、`docs` 未碰。

### 8.1 「敵將 守將（武 0 / 智 0）」的真实根因

上报的判断是「`CampaignRoot` 只传了出发城，目标城的 `bgen/bstr/bint` 没传」。实测**不成立**：
`DeployRoot.start()` 里 `this.targetCity` 已经是目标城，`applyGeneral()` 也在调
`battleSetup(data, 0, targetCity.NAME, 100)`。真正的三个洞是：

1. **开局只有空城可打**。开局 3 城（襄平/北平/代縣）按 `paths` 只与 **晉陽、易京** 接壤，而这两座城在
   `garrison.json` 剧本 0 里都是 `owner:""`、`officers:[]` 的無主空城；`battleSetup` 拿不到将 → 返回
   `{enemyGeneral:{name:'守將',str:0,int:0}}`。而 `doAction('march')` 又硬性要求 `distanceFromOwned===1`，
   玩家永远走不到有守将的城。**屏幕上「守將 0/0」是数据现状的必然结果，不是传参丢了。**
2. **空城没有兜底**。web `deploy.html:171-184` 对空城同样给 `0/0`（它的 catch 分支才是 `70/60`），
   所以「web 已做对」只对取数链路成立，空城一样是 0。
3. **`BattleRoot` 根本不显示 B 方主将**。`labelB` 只有 `b.count/start 敵軍`，`labelGeneral` 只有 A 方两行，
   所以哪怕 `bgen=沮授` 传进去了，战斗屏上也看不见。

### 8.2 改法（三屏同源）

| 文件 | 改动 |
|---|---|
| `game/cocos/assets/scripts/EnemyIntel.ts`（新） | 唯一敌情入口 `resolveEnemyIntel(data, scenario, cityName, mine)`：`garrisonOf()` + `battleSetup()` 取真守将；取不到（空城）时按城防折算兜底 `守備隊`，`str=clamp(28+DEF*0.1,24,72)`、`int=clamp(20+DEF*0.06,20,60)`，并置 `fallback:true`。另有 `cityDefense()` / `cityGarrisonTroops()`。**没动 `core/garrison.ts`**，所以 `game/src/core` 与 cocos 副本继续逐字节同源 |
| `CampaignRoot.ts` | `march` 时 `setDeployEnemy(intel)`（`{name,str,int,troops,defense,owner,fallback}`）走参数总线给 Deploy；城市卡/提示里显示 `守將 沮授（武 66 / 智 90）`；空城显示 `守備隊（城防折算 武 38/智 26）` |
| `DeployRoot.ts` | 优先用总线带来的 `DeployEnemy`，没有才自己算；标题按 `守城戰/出征編成` 分流；情报行改成 `敵 將 <名>（武 x / 智 y）· 守軍 N 兵`，兜底时行尾标注 `· 無守將（守備隊·城防折算）`；`march()` 的 `bgen/bstr/bint` 一律取该敌情 |
| `BattleRoot.ts` | B 方主将用 `launch.bgen/bstr/bint`（不再 fallback 成「守將 0/0」）；HUD 右上 `60/60 敵軍 沮授`；底部两行主将信息 `我 … / 敵 …` |
| `GameState.ts` | `BattleLoadout` 加 `defend?/armyId?`；新增 `setDeployEnemy/takeDeployEnemy`、`setDeployArmy/takeDeployArmy`；`CampaignSave` 加 `armies/armySeq` + `normalizeArmies()`；新增 `armies()/nextArmyId()/addArmy()/removeArmy()/armiesTo()/arrivedAt()/marchArmies()`；`recordBattleResult(city,winner,armyId,defend)` |

### 8.3 验收数值（`work/cocos3_*.png`，750×1334）

| 图 | 关键数值（脚本注入读回，非肉眼估） |
|---|---|
| `cocos3_deploy_enemy.png` | `labelTarget="目標 南皮 · 從 易京 出征 · 守軍 240 兵"`；`labelIntel="敵 將 沮授（武 66 / 智 90）· 守軍 240 兵"`；`intel={name:"沮授",str:66,int:90,troops:60,defense:366,owner:"張角",fallback:false}`；城市卡 `守將 沮授（武 66 / 智 90）` |
| `cocos3_battle_enemy.png` | `genB={name:"沮授",str:66,int:90,level:5}`；`labelB="60/60  敵軍 沮授"`；`labelGeneral="我 公孫越 … · 出征\n敵 沮授  Lv.5   武力 66   智力 90   HP 166/166"`；`launch.bgen="沮授"` |
| `cocos3_upload_build.png` | `build_wechat.ps1 -Mode upload` 的完整终端输出（体积表在下方，见 23 §11） |

复现脚本：`work/cocos3_deploy_enemy.js`、`work/cocos3_battle_enemy.js`（都先 `loadScene('Campaign')`，把「易京」补进
`save.owned` 并 `doAction('advance')` 落盘——等价于「已打赢易京」的存档，然后选南皮出征；易京是通往南皮唯一的桥）。

### 8.4 守城战 / 行军（§6 第 1、2 条）做到什么程度

**已做（可在游戏里操作）**：

- **行军数据 + 地图表现**：`GameState.armies` 落存档（`armies/armySeq` 有归一化，坏档不崩）；`drawMap()` 在
  `posOf()` 算出的位置画部队点——我方绿 `#7FD1A8`、敌方红 `#E0705E`，`progress>=1` 再套一圈光表示「已到城下」。
- **敌方每月出兵**：`doAction('advance')` → 先 `marchArmies(3)` 推进在途部队 → 再 `spawnRaid()` 出一支新部队。
  口径对齐 web 的 `aiCandidates`：敌城邻我方城、敌兵 ≥ 我守军 + 30、打守军最少的那座；同起点不重复、在途上限 3 支、
  `troops = clamp(round(敌兵*0.6),20,100)`、`general` 取该敌城守将。
- **守城战入口**：自己的城被围时，城市卡第一按钮变 **「守 城 戰」**（`caption: 敵 沮授 · 100 兵`，primary 高亮），
  提示行 `敵軍已到 易京 城下：點該城 →「守 城 戰」`。点了之后走 `setDeployArmy(army.id) + setDeployTarget(被攻的城) + loadScene('Deploy')`。
- **守城战编成屏**：标题 `守 城 戰`，第二行 `守 城 易京 · 敵軍自 南皮 來襲 · 敵軍 100 兵`，守军数取来袭部队兵力
  （`garrison = army.troops`），敌将取来袭部队的 general。
- **结算**：`recordBattleResult(city, winner, armyId, defend)`——守方胜：击退、部队移除；守方败：**该城从 `owned` 移出**。
- **在途提示**：自己的城有敌军在路上时，按钮位显示 `行 軍 中 / 南皮 軍 100 兵 · 0%`（不可点），提示行 `行 軍 中：南皮 → 易京 · 100 兵 · 已走 0%`。

截图：`work/cocos3_campaign_march.png`（行軍中 0%）、`work/cocos3_campaign_defend.png`（守 城 戰 按鈕 + 地图上到城下的光圈）、
`work/cocos3_deploy_defend.png`（守城战编成屏）。

**还没做（明确列清缺什么、为什么）**：

1. **我方派兵「在路上」**：web 有 `dispatchArmy(to)`（我方部队在地图上走、可被拦截），Cocos 这轮**只做了 B 方行军**。
   原因：我方出征现在的语义是「接壤即开战」（`distanceFromOwned===1` 才放行，`doAction('march')` 直接 `loadScene('Deploy')`），
   要支持在途就得同时改「出征按钮 → 造 A 方 Army」「抵达后才进编成屏」「非接壤城的远程出征」，等于重做半条战役循环，
   超出本轮范围。数据层已经通用了（`Army.side` 支持 `'A'`，`addArmy/armiesTo/arrivedAt` 都带 side 参数），接线即可。
2. **遭遇战 / 拦截**：`core/march.ts` 的 `intercept(a,b)` 没接视图，同路相向不会自动打起来。
3. **敌军 AI 的其它行为**：援军、回防、攻城时先扣守军、连续围城都还没有；现在只保证「每月最多一支、最多三支在途」。
4. **地图上的行军画法**：只有圆点 + 光圈，没有 web 的三角箭头与折线轨迹。
5. **战后处置**：`capture.ts` / `roster.ts` 仍未接（§6 第 4 条），守城胜利没有俘虏/招降。

### 8.5 一键出包

见 `project/23_微信小游戏构建与包体.md` §11。要点：`build_wechat.ps1 -AppId … -Mode upload|preview|remote`，
构建两平台 → 按 Mode 处理资源 → 注入 appid → 体检（主包 < 4 MB / 总包 < 20 MB / `game.json` 首字节 `0x7B` /
`subpackages/res/game.js`）→ 打印体积表；任一失败 `exit 1`。`upload` 实测主包 **1.81 MB / 27 文件**、
分包 **9.14 MB / 1020 文件**、合计 **10.95 MB**，退出码 0。

### 8.6 本轮改的文件

- 新增：`game/cocos/assets/scripts/EnemyIntel.ts`
- 修改：`game/cocos/assets/scripts/{CampaignRoot,DeployRoot,BattleRoot,GameState}.ts`
- 重写：`tools/build_wechat.ps1`（参数 / 三 Mode / 体检 / 体积表 / `-KeepAudio` / `-SkipWeb`）
- 文档：`project/23`（新增 §11）、`project/34`（本节）
- 验证脚本与截图：`work/cocos3_{deploy_enemy,battle_enemy,campaign_march,campaign_defend,deploy_defend}.js`、
  `work/cocos3_upload_build.html`（把终端输出渲染成页面）+ 对应 `.png`
