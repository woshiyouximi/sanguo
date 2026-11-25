# 22 Cocos 场景与构建（Creator 3.8.8）

> 目标：`F:\sanguo\game\cocos` 从「0 个 .scene」到「4 个场景 + 可打开的 web 包 + 实机截图」。
> 结论：已完成。4 个场景全部生成、构建 exit 0、headless 跑起来看到自家 UI 并可触控。

## 1. 场景清单

| 场景文件 | 场景 uuid | 挂载脚本 | 组件 `__type__`（压缩 uuid） | 大小 |
|---|---|---|---|---|
| `assets/scene/Boot.scene` | `0b007000-1a2b-4c3d-8e4f-000000000001` | `BootRoot.ts` | `36dec7Wwu5JGqNtiB7o914X` | 6807 B |
| `assets/scene/Campaign.scene` | `0ca3d000-1a2b-4c3d-8e4f-000000000002` | `CampaignRoot.ts` | `534e9nuNE9IGIg42Lg7mDbK` | 6815 B |
| `assets/scene/Deploy.scene` | `0de91000-1a2b-4c3d-8e4f-000000000003` | `DeployRoot.ts` | `c624c8048FEhrwIC5/qQVLn` | 6811 B |
| `assets/scene/Battle.scene` | `0ba77100-1a2b-4c3d-8e4f-000000000004` | `BattleRoot.ts` | `ab2d5IDwWZMRoL5rkubYjhG` | 6811 B |

**启动场景 = Boot**（`settings.launch.launchScene = db://assets/scene/Boot.scene`）。
生成器：`F:\sanguo\work\gen_cocos_scenes.py`（幂等，重跑会覆盖 4 个 .scene，不动 .meta 里的 uuid）。

**文件名必须 CamelCase**：引擎 `cocos/asset/asset-manager/config.ts` 的 `getSceneInfo()` 用
`key.endsWith('/' + name + '.scene')` 匹配，**大小写敏感**；而脚本里写死的是
`director.loadScene('Campaign'|'Deploy'|'Battle')`。小写 `campaign.scene` 会 loadScene 失败（黑屏）。

## 2. 场景 JSON 结构（每个文件 15 个对象，纯手写、无编辑器参与）

| `__id__` | 类型 | 要点 |
|---|---|---|
| 0 | `cc.SceneAsset` | `_name` + `scene:{__id__:1}` |
| 1 | `cc.Scene` | `_children:[2]`、`_globals:{__id__:8}`、`_id`=场景 uuid 字符串 |
| 2 | `cc.Node` Canvas | `_lpos`(375,667,0)、`_layer:33554432`、`_children:[3]`、`_components:[5,6,7,15]` |
| 3 | `cc.Node` Camera | `_layer:1073741824`、`_lpos`(0,0,1000)、`_components:[4]` |
| 4 | `cc.Camera` | `_projection:0`(正交)、`_orthoHeight:667`、`_near:0`、`_far:2000`、`_clearFlags:7`、`_visibility:1108344832` = 0x42100000（含 UI_2D 33554432） |
| 5 | `cc.UITransform` | `_contentSize` 750×1334、`_anchorPoint`(0.5,0.5) |
| 6 | `cc.Canvas` | `_cameraComponent:{__id__:4}`、`_alignCanvasWithScreen:true` |
| 7 | `cc.Widget` | `_alignFlags:45`、`_alignMode:2`（全屏拉伸） |
| 8–14 | `cc.SceneGlobals` + Ambient/Shadows/Skybox/Fog/Octree/Skin | **整段照抄** `scene-2d.scene`（编辑器「新建 2D 场景」默认内容），一个字不改 |
| 15 | 业务脚本组件 | `__type__` = 压缩 uuid，`node:{__id__:2}`、`_enabled:true` |

两个踩过的关键点：
- **脚本挂在 Canvas 节点本身**（第 15 号组件属于节点 2）。`CampaignRoot.ts:451` / `DeployRoot.ts:481` 里
  `const transform = this.node.getComponent(UITransform); if (!transform) return;` —— 挂空节点会触控全哑；
  Canvas 自带全屏 UITransform、anchor 0.5，正好等于脚本假定的「屏幕中心」坐标口径。
- `Canvas.__preload()` 会自己刷新 Widget 并把相机 `setWorldPosition(x, y, 1000)`、`orthoHeight = 高/2`，
  所以场景里相机的 `_lpos/_orthoHeight` 写得不准也不会黑屏（但仍按上面写对，便于编辑器里看）。

## 3. 脚本组件的压缩 uuid（23 字符）

`__type__` 不能直接写 36 字符 uuid，必须压缩：

```python
KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
def compress_uuid(u):                 # u = 脚本 .meta 里的 uuid
    out = u[:5]                       # 保留前 5 个字符
    rest = u[5:].replace('-', '')     # 剩下 27 个 hex
    for i in range(0, len(rest), 3):
        v = int(rest[i:i+3], 16)      # 12 bit
        out += KEYS[v >> 6] + KEYS[v & 63]
    return out                        # 5 + 18 = 23
```

实测（`.meta` uuid → 压缩 id，已与构建产物 `assets/main/index.js` 里的 `_RF.push` 对照一致）：

| 脚本 | `.meta` uuid | 压缩 id |
|---|---|---|
| CampaignRoot | `534e99ee-344f-4818-8838-d8b83b9836ca` | `534e9nuNE9IGIg42Lg7mDbK` |
| BootRoot | `36deced6-c2ee-491a-a36d-881ee8f75e17` | `36dec7Wwu5JGqNtiB7o914X` |
| DeployRoot | `c624cf34-e3c1-4486-bc08-0b9fea4152e7` | `c624c8048FEhrwIC5/qQVLn` |
| BattleRoot | `ab2d5203-c166-4c46-82f9-ae4b9b623846` | `ab2d5IDwWZMRoL5rkubYjhG` |

构建产物里能看到它被原样保留：`assets/main/import/0b/0b007000-….json` → `["36dec7Wwu5JGqNtiB7o914X",["node"],3,1]`。

## 4. 构建

```powershell
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue   # 不删的话 exe 变 node，--project 报 bad option
& 'F:\sanguo\tools\cocos\cc388\CocosCreator.exe' --project F:/sanguo/game/cocos `
  --build "platform=web-desktop;debug=true;md5Cache=false;buildPath=F:/sanguo/game/cocos-build;startScene=0b007000-1a2b-4c3d-8e4f-000000000001"
```

- **必须放在后台任务里跑**（`Start-Process … ; $p.WaitForExit()`）；前台跑会被外层带走，日志出现
  `SIGTERM in task build-script`、产物残缺。
- **`startScene=<场景 uuid>` 必填**：不传时 CLI 静默不产出（日志停在插件注册那 316 行，无 web-desktop 目录、无报错）。
- 实测耗时：web-desktop 6–18 s，web-mobile 45 s，均 exit 0。产物 `F:\sanguo\game\cocos-build\{web-desktop,web-mobile}\`。
- 只剩 3 条无害告警：`Check build parameter debug ("true") failed, typeof debug should be boolean… default true will be used`
  （`md5Cache` / `mainBundleCompressionType` 同款，CLI 传的是字符串）。**没有** `Can not find class`、`Script attached to … is missing`。

## 5. 跑起来与截图

```powershell
# 两个包各起一个静态服务（都要后台）
python -m http.server 8899 --bind 127.0.0.1 --directory F:\sanguo\game\cocos-build\web-desktop
python -m http.server 8900 --bind 127.0.0.1 --directory F:\sanguo\game\cocos-build\web-mobile
# CDP 截图（Edge headless，无第三方依赖）
node F:\sanguo\work\shot.mjs <url> <out.png> [waitMs] [W] [H] [clipSel|-] [extraJs|-] [tapX,tapY|-]
node shot.mjs http://127.0.0.1:8900/index.html out.png 9000 750 1334 - 'cc.debug.setDisplayStats(false);'
```

| 截图 | 尺寸 | 内容 |
|---|---|---|
| `F:\sanguo\work\cocos_run_1.png` | 1290×970 | web-desktop 的 `#GameDiv` 区域：大地圖、第1年1月、金1200 城3 戰績0 敗0、60 座城（中文名+道路细线）、徵兵/開發/推進一月、內政：襄平兵141·民79500·金2846 |
| `F:\sanguo\work\cocos_run_2.png` | 750×1334 | 同上的竖屏全屏版（web-mobile，手机形态），无黑边无遮挡 |
| `F:\sanguo\work\cocos_tap_city.png` | 750×1334 | CDP 触摸点 (535,540) → 定陶被选中（白圈），按钮变为「出征 需6段路」，底部提示「出征 定陶：守軍約 110 兵」 |
| `F:\sanguo\work\verify_deploy.png` | 750×1334 | `loadScene('Deploy')` 后的出征編成：主將/兵種/陣形三张网格、戰前情報、兵力 50/80/100、返回+出征 |
| `F:\sanguo\work\verify_battle.png` | 750×1334 | `loadScene('Battle')` 后的战斗：我軍/敵軍血条、倒计时、双方各 20 个兵牌、技能行 |

控制台证据（三张图都零异常、零 `resources.load` 失败）：
`Success to load scene: db://assets/scene/Boot.scene` → `LoadScene Campaign: 4.5ms` → 探针 `{"scene":"Campaign","nodeCount":73}`；
Deploy/Battle 各自 `LOADED Deploy -> Deploy nodes 1`（58 节点）/ `LOADED Battle -> Battle nodes 1`（13 节点）。

## 6. 黑屏排查清单（这次真踩到的，按命中顺序）

1. **`Missing class: cc.ModelLightmapSettings`**：仓库里原有的 `assets/scene/main.scene`（hello-3d-world 预制体，
   引用了 3.8 已删除的类）会让构建刷 26 条 error。已备份到 `F:\sanguo\work\backup\main.scene{,.meta}` 并从
   `assets/scene` 删除。删完 stderr 只剩 3 条参数告警。
2. **文件名大小写**：见第 1 节，`Campaign.scene` ≠ `campaign.scene`。
3. **脚本节点没有 UITransform**：`CampaignRoot.ts:451` / `DeployRoot.ts:481` 会静默 `return`，画面正常但点不动。
4. **相机 `_visibility` 不含 UI_2D / 节点 `_layer` 不对**：`_visibility` 用 0x42100000，UI 节点 `_layer` 用
   `33554432`（`Layers.Enum.UI_2D`），否则黑屏。
5. **脚本没执行（压缩 uuid 算错）**：查构建产物 `assets/main/import/<前两位>/<场景 uuid>.json` 里那一项
   是不是 23 字符 id；错的话组件是空对象，画面全黑。
6. **`resources.load` 路径**：只有 `assets/resources/**` 才是 resources bundle（`resources.meta` 里
   `isBundle:true`）；`DataLoader` 读的是 `data/<name>`，13 张表都在 `assets/resources/data/` 下。
7. **工具坑（不是游戏的问题）**：pwsh 把 `node shot.mjs … 'cc.director.loadScene("Deploy")'` 传给 node 时双引号被吃掉，
   变成 `loadScene(Deploy)` → `ReferenceError: Deploy is not defined`。后来给 shot.mjs 加了 `@文件路径` 形式（`js_deploy.js` / `js_battle.js`）。

## 7. 已知限制 / 离「手机微信里能开」还差什么

- **没做微信小游戏构建**：只验证了 `web-desktop` / `web-mobile`。要进微信需要加 `wechatgame` 平台构建 + 小游戏适配层
  （目前 0 张图片资源、全靠 `Graphics`/`Label`，适配成本低），再加微信开发者工具导入 `cocos-build/wechatgame`。
- **web-desktop 模板把画布钉死在 1280×960**（`index.html` 里 `#GameDiv` 硬编码），750×1334 设计稿会左右留黑；
  手机形态请用 `web-mobile`（`cc_exact_fit_screen="true"`，画布=视口）。
- **Battle 场景左下角文字溢出**（属性行被裁到屏幕外、压在兵牌上）——属于 `BattleRoot.ts` 的布局问题，本次范围不允许改。
- **触控只在 headless + CDP 合成触摸下验证过**，还没在真机/微信里试；真机需要再确认安全区（`env(safe-area-inset-*)`）。
- 编辑器 GUI 里点「构建」时没有启动场景记录，需在构建面板手动选 `Boot`（或用上面的 CLI 命令）。
- `assets/scene/main.scene`（hello-3d-world 立方体）已移除，`library/` 里还有旧缓存，首次开编辑器会自动清。
