import pathlib
p = pathlib.Path(r'F:\sanguo\project\23_微信小游戏构建与包体.md')
t = p.read_text(encoding='utf-8')
add = """
## 6. 两种包的产出与用法（2026-11-24 实测）

包体瘦身完成后，**一个项目要出两种包**，别再混用——混用就是"game.json 未找到 / Unexpected end of JSON input"的直接原因。

| 包 | 命令 | 体积 | 目录 | 用途 |
|---|---|---|---|---|
| **预览包**（资源内嵌） | `-NoRemote` | 29.00 MB / 1133 文件 | `F:\\sanguo\\dist\\wechat-preview`（构建后另存的稳定副本） | 开发者工具扫码、真机测帧率；**不能上传** |
| **上传包**（资源远程） | 默认 | **1.72 MB / 27 文件** | `F:\\sanguo\\game\\cocos-build\\wechatgame` | 上传发布；需先把 `wechatgame-remote\\remote` 传 CDN |
| 远程资源 | 同上 | 27.28 MB / 1106 文件 | `F:\\sanguo\\game\\cocos-build\\wechatgame-remote\\remote\\res` | 传到 `<server>remote/res/…`（**带 remote/ 前缀**） |

一条命令（`F:\\sanguo\\tools\\build_wechat.ps1`）：

```powershell
# 上传包（远程 bundle + 注入 AppID + 包体体检）
.\\tools\\build_wechat.ps1 -AppId wxf631d432ca7abcee -Server https://cdn.your.com/sanguo/

# 预览包（全塞首包，能扫码）
.\\tools\\build_wechat.ps1 -AppId wxf631d432ca7abcee -NoRemote -OutDir F:/sanguo/game/cocos-build-local
```

### 6.1 导入开发者工具的三条铁律
1. **目录选到 `wechatgame` 这一层**（或 `dist\\wechat-preview`），不要选父目录——父目录没有 `game.json`。
2. **项目类型选「小游戏」**。选「小程序」会去找 `app.json`，报的就是 `game.json: 未找到`。
3. **别在构建过程中导入**：构建会先清空目录，这期间读到的 `game.json` 可能是空文件 → `Unexpected end of JSON input`。所以预览包要拷到 `dist\\wechat-preview` 这种"构建不碰"的位置。

### 6.2 预览包自检清单（导不进去时按顺序查）
- `dist\\wechat-preview\\game.json` 存在、首字节是 `{`（无 BOM）、含 `deviceOrientation: portrait`；
- `project.config.json` 里 `compileType === "game"`、`appid` 是你的测试号、`miniprogramRoot === "./"`；
- `src\\settings.*.json` 里 `assets.server` 必须是**空串**（预览包），`launch.launchScene === "db://assets/scene/Boot.scene"`；
- `assets\\res\\` 存在（预览包应有 1106 个文件；上传包里应该**没有**这个目录）。
"""
if '## 6. 两种包的产出与用法' not in t:
    t = t.rstrip() + "\n" + add
p.write_text(t, encoding='utf-8')
print('doc23 +s6')
