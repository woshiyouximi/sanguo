# 04 · 技术方案（Cocos Creator 3.8 + 微信小游戏）

> 本文回答三件事：**引擎为什么选 Cocos 而不是 Godot**、**工程怎么搭**、**微信的坑怎么绕**。
> 决策背景见 [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md)；玩法设计见 `01`/`02`/`03`。

---

## 1. 引擎选型（结论：Cocos Creator 3.8）

### 1.1 你问的"Cocos 3.8 还是 Godot"

**做微信小游戏，选 Cocos。** 不是引擎好坏的问题，是**发布链路**的问题。

微信官方有一张[引擎适配表](https://developers.weixin.qq.com/minigame/dev/guide/game-engine/engine-overview.html)：**Cocos Creator / LayaAir / Egret 是"引擎官方内置适配 ✅ 已支持"**，构建时选"微信小游戏"目标，引擎自己处理 `wx.*` API 映射、Canvas 适配、分包、首包裁剪。**Godot 不在这张表里。**

Godot 4 想上微信小游戏，目前只有社区插件：

| 方案 | 状态 | 风险 |
|---|---|---|
| [godothub/godot-minigame](https://github.com/godothub/godot-minigame) | Godot 4.4+ 的 C++ 编辑器插件，提供小游戏模板下载/导出（约 218★） | 社区维护，版本跟随靠人 |
| [yuchenyang1994/godot-love-wechat](https://github.com/yuchenyang1994/godot-love-wechat) | 自编译 Godot 4.3 的 WASM，把 `ScriptProcessor` 音频废案代码加回来才**能出声**（约 45★） | 要自己编译 WASM，升级引擎＝重做适配 |

三条硬伤，任一条都够劝退：

1. **包体**：Godot 4 的 Web 导出是 WASM，未压缩就是二三十 MB 量级；而小游戏**首包 4 MB / 整包 20 MB**。微信虽然有 [WXWebAssembly](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-webassembly.html)，但明确写了 **iOS 平台部分能力不支持**（如 `Global` 的 export），且"编译出来的 .wasm 体积太大超过代码包限制怎么办"是官方 FAQ 里单列的问题。Cocos 导出的是纯 JS + 资源，天然贴着小游戏的包体规则设计。
2. **性能**：Godot 的 2D 渲染器不是为"低端安卓 + 无 JIT + 100 个动画单位"设计的；Cocos 的 2D 合批、图集、骨骼动画在国产中低端机上是被几万个上线项目磨过的路径。
3. **审核与备案**：微信对"引擎内置适配"的游戏有成熟的自查/审核经验；自编译 WASM 的包在提审时更容易被判"动态代码"类问题。

> **反过来说**：如果哪天要做 Steam / PC 版，Godot 是更好的选择（编辑器、GDScript、3D 都更顺）。但 v1 只做微信小游戏，**不要为了将来可能的 PC 版牺牲现在唯一的发布渠道**。
> 真要做 PC 版，正确姿势是"数值表与战斗规则用纯 TS 写成与引擎无关的核心库，Cocos 只做表现层"——见 §4.1，这条路在 Cocos 里同样走得通。

### 1.2 四方案对比

| 维度 | **Cocos Creator 3.8** | LayaAir 3 | Godot 4 | 微信原生 Canvas |
|---|---|---|---|---|
| 微信官方适配 | ✅ 内置 | ✅ 内置 | ❌ 社区插件 | ✅ 就是原生的 |
| 2D 合批/图集 | 成熟 | 成熟 | 一般 | 全靠自己 |
| 骨骼动画 | Spine / DragonBones 官方支持 | 支持 | 支持（但要转） | 自己写 |
| 包体控制 | 构建期裁剪 + 分包 | 分包 | WASM 体积大 | 最小 |
| TS 体验 | 好（引擎即 TS） | 一般 | GDScript/C# | 原生 JS |
| 招人难度 | **最低**（小游戏岗位标配） | 中 | 高 | 中 |
| 本项目适配度 | **★★★★★** | ★★★☆ | ★★ | ★★（工期风险） |

结论：**Cocos Creator 3.8 + TypeScript**，锁定 3.8 LTS 小版本，不追 3.9/4.x（小游戏项目最怕引擎升级带来的适配回归）。

---

## 2. 工程结构

```
sanguo-mini/
├─ assets/
│  ├─ scenes/            Boot.scene  Lobby.scene  Battle.scene
│  ├─ scripts/
│  │  ├─ core/           与引擎无关的纯逻辑（战斗规则/数值/寻路/存档结构）
│  │  ├─ game/           场景控制器、UI 控制器
│  │  ├─ view/           表现层：单位渲染、特效、镜头
│  │  └─ platform/       wx 封装（登录/支付/广告/分享/存储）
│  ├─ prefabs/           UI 组件、战场单位、特效
│  ├─ art/               ui / hero / battle / fx（按 bundle 划分，见 §3）
│  ├─ audio/
│  └─ data/              由 tools/build_data.py 生成的 JSON + TS 常量
├─ bundles/
│  ├─ main/              首包：Boot/Lobby + 基础 UI + 1 张战场图
│  ├─ battle/            战斗场景与战场单位（分包，进战斗前预加载）
│  ├─ hero/              武将立绘（分包 or CDN，按需）
│  └─ fx/                技能特效（CDN）
└─ tools/
   ├─ import_legacy.py    原作 INI/JSON → 新 schema
   └─ build_data.py       schema → assets/data/*.json + 类型声明
```

**为什么把 `core/` 单独拎出来**：战斗规则（100 单位的战力、命中、伤害、阵形布点）是纯函数，不依赖引擎的 `Node`/`Component`。这样：① 可以在 Node 里跑单元测试和数值模拟（调平衡时跑 10 万场不用开引擎）；② 将来换引擎/做服务端校验时直接复用；③ 战斗 bug 不会藏在渲染代码里。

---

## 3. 分包与包体（微信最硬的约束）

| 包 | 内容 | 目标体积 |
|---|---|---|
| **主包**（≤ 4 MB） | `core/` + `game/` 逻辑、Boot/Lobby 场景、基础 UI 图集（≤ 3 张 2048）、字体子集、1 张低配战场地面 | ≤ 3.5 MB |
| 分包 `battle`（≤ 20 MB） | Battle 场景、13 兵种 × 动作序列帧/骨骼、战场 UI、常用特效 | ≤ 8 MB |
| 分包 `hero` | 40 张武将立绘 + 头像 | ≤ 12 MB（超了走 CDN） |
| CDN 远程 | 大特效、BGM、非首版剧本、高清立绘 | 不计入包体 |
| 总包 | ≤ 20 MB（微信上限），超出部分必须远程 | — |

三条操作规则：

1. **首包只放"能进大厅"的最小集**；`cc.assetManager.loadBundle('battle')` 在"进入战斗"前置进度条里预加载，加载时间预算 ≤ 1.5 s（4G）。
2. **立绘一律走"分包 + CDN 兜底"**：`hero` 分包内只放前 10 名武将，其余从 CDN `wx.downloadFile` 到本地缓存（`wx.env.USER_DATA_PATH`），二次进入不再下载。
3. **字体**：不要塞完整中文字库（一个 20 MB 的 TTF 能吃掉全部预算）。用**子集化**（只保留游戏内用到的约 3,500 字）+ 位图字体做数字/英文。

---

## 4. 运行时架构

### 4.1 三层分离

```
 platform/  ──  wx API（登录、支付、广告、存储、分享）
     ↑
  game/     ──  场景与 UI 控制器（Cocos 组件）
     ↑
  core/     ──  纯数据与规则：Battle, General, City, March, AiPlanner, SaveModel
```

`core/` 的约束（写进 code review checklist）：
- 不 `import` 任何 `cc` 模块；
- 不读全局状态，状态全部通过参数传入（便于模拟与回放）；
- 随机数走注入的 `Rng`（种子可复现，方便复现玩家报的 bug）。

### 4.2 战斗循环（100 单位怎么跑）

不做 ECS 框架，做**结构体数组 + 系统顺序更新**（DOD 的简化版）：

```ts
// core/battle/BattleWorld.ts
interface Unit { id: number; side: 0|1; kind: UnitKind; x: number; y: number;   // 逻辑坐标（格子 + 亚格偏移）
                hp: number; state: UnitState; targetId: number; cd: number; }
class BattleWorld {
  units: Unit[] = [];                    // 最多 200（双方各 100）
  update(dt: number) {                   // 固定步长 1/30 s
    this.spatialHash.rebuild(this.units); // 格子哈希，避免 O(n²)
    this.sysMarch.update(this, dt);
    this.sysTarget.update(this, dt);
    this.sysAttack.update(this, dt);
    this.sysProjectile.update(this, dt);  // 弓/弩/飞行道具
    this.sysDeath.update(this);
  }
}
```

表现层只做一件事：**每帧把 `units` 的 `(x, y, state)` 同步到渲染节点**（对象池复用，禁止战斗中 `instantiate`）。

### 4.3 渲染策略（决定能不能跑满 30 fps）

| 方案 | DrawCall | 内存 | 评价 |
|---|---|---|---|
| 每兵一个节点 + 序列帧 | 100+（同图集可合到 1~3） | 中 | 简单，**推荐起步** |
| 每兵一个节点 + 骨骼（Spine） | 100（骨骼无法合批） | 高 | 表现好但低端机危险 |
| **顶点动画 / 烘焙到一张大图 + 自定义材质合批** | 1~2 | 低 | 终极方案，工期长 |

结论：**v1 用"序列帧 + 同图集合批"**，一个兵种一个图集，同兵种天然合批；跨兵种靠 `SpriteAtlas` 合并成一张 2048。等性能有实测数据再考虑骨骼。

---

## 5. 数据管线

```
原作 extract/json/*.json  ──import_legacy.py──▶  新 schema（gamedata/*.json）
                                                        │
                                        build_data.py ──┴──▶ assets/data/*.json + .d.ts
```

- **构建期**做 schema 校验（字段缺失/越界直接 fail，不让脏数据进包）；
- **运行时**只读 JSON（Cocos 的 `JsonAsset`），不解析 INI；
- **热更**：数值表（兵种/阵形/技能/物品）允许从 CDN 拉新版本，本地存 `version`；逻辑不热更。
- **向后兼容**：表内加 `_v` 字段，读表时按版本走迁移函数。

新 schema 的核心表（与 `02_战斗重构设计.md` §8 对齐）：

| 表 | 关键字段 | 来源 |
|---|---|---|
| `troop.json` | id, name, atk, def, range, speed, counter[13] | 原作 13×13 相克矩阵 |
| `formation.json` | id, name, weights[5], slots[5][] | 原作 33 组坐标数组 |
| `magic.json` | id, name, mp, power, attack, attrib, active, script | `MAGIC.INI` 110 条 |
| `wise.json` | id, name, attrib, active, rate, wiseLevel | `MAGIC.INI` 67 条 |
| `terrain.json` | id, name, floor, fg[], mg[], bg[] | `SANGO.INI [TERRAIN]` 12 条 |
| `general.json` | id, name, str, int, hp, mp, skills[8], wise[8], face | `TIMES*.INI [GENERAL]` |
| `city.json` | id, name, pos, pop, money, defense, paths[] | `TIMES*.INI [CITY]` |
| `path.json` | from, to, len, points[] | `TIMES*.INI [PATH]` |

---

## 6. 存档与账号

- **本地**：`wx.setStorageSync('save', json)`，单存档 ≤ 200 KB；写前做 `JSON.stringify` 压缩（字段名短化）。
- **云存档**：`wx.getUserCloudStorage`（开放数据域只能拿托管数据）不够用，改用自建 HTTP 接口或云开发数据库；**冲突策略**：以"最后写入时间 + 关卡进度"取大者，冲突时弹窗让玩家选。
- **账号**：`wx.login` 拿 `code` → 后端 `code2session` 换 `openid`；**不强制登录**，游客先玩，绑定时再合并。
- **存档版本**：`{v: 3, ...}`，加载时 `migrate(v→3)`；**永远不要删玩家的旧存档**（只读旧档 + 写入新档）。

---

## 7. 微信能力接入清单

| 能力 | 接口 | 用在 | 备注 |
|---|---|---|---|
| 登录 | `wx.login` + 后端 `code2session` | 云存档、跨端 | 不强制 |
| 激励视频 | `wx.createRewardedVideoAd` | 加速练兵、补兵、抽将 | 广告是首版唯一变现手段（无版号期间） |
| 分享 | `wx.shareAppMessage` | 战报、招降名将 | 分享图要预生成 |
| 排行榜 | 开放数据域 `wx.getOpenDataContext` | 战功榜 | 需要子域工程 |
| 订阅消息 | `wx.requestSubscribeMessage` | 建筑完成、体力回满 | 不要滥用，掉留存 |
| 虚拟支付 | `wx.requestMidasPayment` | 内购 | **必须有版号**，v1 先不接 |
| 性能 | `wx.getPerformance()` | 上报 fps/内存 | 灰度期必备 |

---

## 8. 性能与稳定性指标（提审前必须达标）

| 指标 | 目标 | 测法 |
|---|---|---|
| 首屏到可操作 | ≤ 3 s（4G，中端机） | `wx.getPerformance` 打点 |
| 战斗帧率 | ≥ 30 fps（骁龙 660 / iPhone 8） | 真实设备跑 3 分钟混战 |
| 内存峰值 | ≤ 200 MB | iOS Instrument / 安卓 `adb shell dumpsys meminfo` |
| DrawCall（战斗） | ≤ 60 | Cocos Profiler |
| 崩溃率 | < 0.3% | 微信后台 |
| 包体 | 主包 ≤ 3.5 MB，整包 ≤ 18 MB | 构建产物统计 |

降级阶梯（按顺序触发，不要一次全关）：① 特效粒子减半 → ② 同屏单位渲染上限 60（逻辑仍 100）→ ③ 帧率锁 30 → ④ 序列帧降帧（12 → 8 fps）→ ⑤ 低配包（关阴影/关远景）。

---

## 9. 风险表

| 风险 | 概率 | 影响 | 应对 |
|---|---|---|---|
| 100 单位在低端机跑不到 30 fps | 中 | 高 | 先做"性能沙盒"（100 个假人 + 最重特效）验证，再进美术产能；降级阶梯已定 |
| 首包 4 MB 装不下 | 高 | 中 | UI 图集压到 2 张、字体子集、战场地面用 512 平铺（原作就是 512×512 材质） |
| 版号拿不到 | 中 | 高 | 首版只做广告变现，内购接口预留但不接 |
| 引擎小版本升级回归 | 中 | 中 | 锁 3.8.x 具体版本，CI 固定镜像 |
| 外包美术风格漂移 | 高 | 中 | 先出 3 张"金标准"样张 + 色板 + 笔触说明，验收按样张比 |
| IP 相似度 | 中 | 高 | 名称/UI/立绘全原创；不复刻原作的界面布局与图标（法务过一遍） |

---

## 10. 开放问题

1. 是否需要**实时 PvP**（v1 不做，但存档与战斗随机数种子要为将来回放/校验留口）？
2. 云存档用**微信云开发**还是自建后端？（影响首月成本与合规备案）
3. 是否需要 **iOS 高性能+ 模式**（`EmscriptenGLX`，见[官方说明](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-emscriptenglx.html)）？只在 iOS 14+ 生效，需基础库 ≥ 3.8.12。
