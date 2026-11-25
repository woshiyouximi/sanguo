# 203 · 微信开发者工具报错诊断（R199）

最后更新：2026-11-25 20:0x

## 结论先说

1. **包本身是好的**：`verify_pkg` PASS（`bundle res dir=subpackages\res`、image native ok=1391 bad=0、import 缺=0）。
2. **`ENOENT ... assets/res/index.<hash>.js` 是开发者工具的编译缓存**（按项目路径存，拿旧文件清单找旧 hash）。
3. **`80051 source size 12433KB exceed max limit 4MB` 是 GUI 上传时的打包错误**：它把分包当成了主包（12433KB ≈ 整包 12732389 B）。**同一份包用 CLI 上传是成功的**。

## 证据

### 缓存 / 路径

- 包内**没有** `assets/res/`：分包在 `subpackages/res/`（`game.json`: `{"name":"res","root":"subpackages/res/"}`）。
- 全包 2947 个文件逐个搜：`assets/res/` 命中 0、旧 hash `3cf90` 命中 0。
- 当前分包版本 `96656`：`src/settings.628c8.json` 的 `"subpackages":["res"]`、`"bundleVers":{"res":"96656"}`。

### CLI 实测（决定性）

```
C:\...\微信web开发者工具\cli.bat upload --project F:\sanguo\dist\wechat-upload -v 0.1.0 -d "R199 静音包 首次可上传测试"
```

输出（`work\cli_upload.log`）：

```
┌───────────────────┬───────────┬─────────────┐
│ (index)           │ size      │ size (Byte) │
├───────────────────┼───────────┼─────────────┤
│ TOTAL             │ '12.1 MB' │ 12732389    │
│ main              │ '2.5 MB'  │ 2594655     │
│ /subpackages/res/ │ '9.7 MB'  │ 10137734    │
└───────────────────┴───────────┴─────────────┘
√ upload
exit=0
```

- 没有任何 `80051`；`main` 2.5 MB < 4 MB，分包 9.7 MB（官方规则：主包 ≤4MB、单个普通分包不限、总 ≤30MB，见 [分包加载](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/subPackage/useSubPackage.html)）。
- 对照实验：把 `subpackages/res/native` 删掉（总 4.4MB）再上传也成功；说明不是「账号被限 4MB」，而是 GUI 那次把整包当主包算了。

## 处理

**首选：用 CLI 上传**（一条命令，绕开 GUI 缓存）：

```powershell
powershell -NoProfile -File tools\upload_wechat.ps1 -Version 0.1.0 -Desc "R199 静音包"
# 或直接：
& 'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat' upload --project F:\sanguo\dist\wechat-upload -v 0.1.0 -d "说明"
```

CLI 需要开发者工具处于登录态（`cli.bat islogin` → `{"login":true}`），首次会自动起 IDE server（46032 端口）。

**GUU 里预览/调试**：打开新目录 `dist\wechat-test-<时间戳>`（`tools\make_test_build.ps1` 生成），并 **工具 → 清除缓存 → 全部清除**。旧目录 `dist\wechat-upload` 在 GUI 里已被缓存污染。

**已上传的版本**：`0.1.0` = 完整包（推荐保留）；`0.0.3` = 实验包（删掉了 native，**不可用**，请在后台删掉）；`0.0.4` = 完整包（实验用）。

## 后续建议

- 固定出包流程：`build_wechat.ps1 -Mode upload` → `tools\upload_wechat.ps1`（CLI）→ 需要 GUI 调试时 `tools\make_test_build.ps1` 开新目录。
- 若哪天 CLI 也报 80051，先跑 `node work\map_ide\verify_pkg.js dist\wechat-upload` 看包是否自洽，再把 `work\cli_upload_*.log` 全文发我。


---

## 追加（R199b）：80051 的真因是账号 20MB 总包上限

- 17.06 MiB 包：CLI 上传成功（TOTAL 12.1 MB）→ 说明当时没超限。
- 27.76 MiB 包（音频全进包）：CLI 和 GUI **都**报
  `80051, source size 23388KB exceed max limit 20MB`。
- ⇒ 之前 GUI 那次 `12433KB exceed max limit 4MB` 的 `4MB` 是「主包」口径误报（GUI 把整包算主包），而 `20MB` 才是**这个 AppID 的真实总包上限**（官方文档写 30MB，此账号没到 30MB 档）。
- 解决：音频压到 6.01 MB（全 mono 32k），原始包 23.07 MiB → 开发者工具计 **18.1 MB**，上传成功（`0.2.0`，日志 `work\cli_upload_020.log`）。

**结论**：以后出包按「开发者工具计数 ≤ 20MB」做闸门，别只看原始字节。
