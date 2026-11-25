import io

def append(path, text):
    with io.open(path, 'a', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('appended', path, '+', len(text))

A = '''

---

## R199b · 真机 20MB 上限逼出的二次压缩（[确认]）

### 关键事实：这个账号的总包上限是 **20MB**，不是 30MB

`cli.bat preview --project dist\\wechat-upload`（27.76 MiB 包）报：

```
错误码：80051, source size 23388KB exceed max limit 20MB
```

官方文档写的是「总包不超过 30M」，但**该 AppID 实际按 20MB 卡**（可能受虚拟支付未开通影响）。CLI 上传同一份 27.76 MiB 包也是这个错，所以与 GUI 缓存无关。

### 二次压缩

| 项 | 之前（56k/48k + 原样 SFX） | 现在（全 mono 32k） |
|---|---|---|
| BGM | 8.01 MB | **5.07 MB**（13.38 → 37.9%） |
| SFX | 2.69 MB（原样 96k） | **0.961 MB**（34.9%） |
| 音频合计 | 10.70 MB | **6.01 MB** |
| 包内分包 res | 25.27 MB | **20.58 MB** |
| 原始包总 | 27.76 MiB | **23.07 MiB** |
| 开发者工具计（压缩后） | 23388 KB ❌ 超 20MB | **18.1 MB / 19,030,717 B** ✅ |
| 主包 | 2.49 MB | 2.49 MB（2,584,554 B） |

`tools\\pack_audio_local.ps1` 新增 `-BgmMono`（强制单声道 32kHz）与 `-SfxKbps`（>0 转码）两个参数，本次调用：

```powershell
powershell -NoProfile -File tools\\pack_audio_local.ps1 -BgmMono -BgmMonoKbps 32 -SfxKbps 32 -Force
```

幂等：第二次跑会打印「跳过 109 档」。

### 上传

```powershell
& 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat' upload `
    --project F:\\sanguo\\dist\\wechat-upload -v 0.2.0 -d "R199 全本地音频 32k + 摄像机夹取 + 编码守门"
# TOTAL 18.1 MB / main 2.5 MB / subpackages/res/ 15.7 MB → √ upload（exit 0）
```

日志 `work\\cli_upload_020.log`。

### 代价（必须说清）

- BGM 由 128k stereo / 64k mono 统一降到 **32k mono 32kHz**，音质明显下降（1998 年配乐素材本来简单，但仍听得出变闷）。
- SFX 从 96k mono 降到 32k mono 22.05kHz，刀剑/弓弦的瞬态会糊一点。
- 想要原音质 + 全本地，只能：①开虚拟支付把上限抬到 30MB；②把大图转 WebP 腾 3–4MB；③音乐回到 CDN（需真 base）。

### 两个口径备忘

- 构建脚本里 `-Audio embed` 的闸门是 30MB，但**真机/上传卡 20MB**；下次改闸门时应按 20MB 卡（或在文档里标清「本账号 20MB」）。
- `tools\\build_wechat.ps1` 头部注释仍写「embed 总包 ~31.9MB 不能上传」，已过时（当前 23.07 MiB、可上传）。
'''

B = '''

---

## 追加（R199b）：80051 的真因是账号 20MB 总包上限

- 17.06 MiB 包：CLI 上传成功（TOTAL 12.1 MB）→ 说明当时没超限。
- 27.76 MiB 包（音频全进包）：CLI 和 GUI **都**报
  `80051, source size 23388KB exceed max limit 20MB`。
- ⇒ 之前 GUI 那次 `12433KB exceed max limit 4MB` 的 `4MB` 是「主包」口径误报（GUI 把整包算主包），而 `20MB` 才是**这个 AppID 的真实总包上限**（官方文档写 30MB，此账号没到 30MB 档）。
- 解决：音频压到 6.01 MB（全 mono 32k），原始包 23.07 MiB → 开发者工具计 **18.1 MB**，上传成功（`0.2.0`，日志 `work\\cli_upload_020.log`）。

**结论**：以后出包按「开发者工具计数 ≤ 20MB」做闸门，别只看原始字节。
'''

C = '''

## §一之補 24（R199 · 打包链路与音频本地化）

| # | 事项 | 结论 | 证据 |
|---|---|---|---|
| 257 | 音频全本地化 | BGM+SFX 打进 res 分包，离线可播 | `project/204` §R199b；`AudioHost.ts:455` local-first |
| 258 | 音频二次压缩 | BGM 32k mono / SFX 32k mono，16.07→6.01 MB | `tools/pack_audio_local.ps1 -BgmMono -SfxKbps 32` |
| 259 | **总包真实上限 20MB** | 该 AppID 卡 20MB（官方 30MB 未达档） | `80051 ... exceed max limit 20MB` |
| 260 | 上传走 CLI | `cli.bat upload` 成功 0.1.0 / 0.2.0 | `work/cli_upload*.log` |
| 261 | 相机夹取 | `camera()` 走 `clampCameraX`，端点 [6.2874, 64.4877] | `project/201`；`tests/persp_edge.test.ts` 11 条 |
| 262 | 编码守门 | `tools/check_encoding.ps1` + gate G11（无 SKIP） | `project/202` |
| 263 | layout.ts 注释复原 | 150 FFFD → 0，代码 144 行逐字节相同 | 同上 |
| 264 | 基线 | 1555/1555、fidelity 459/0/3/0、gate 14/0/1 | `work/test_r199b.log`、`work/gate_r199.log` |
'''

append(r'F:/sanguo/project/204_本地音频分包.md', A)
append(r'F:/sanguo/project/203_devtools报错诊断.md', B)
append(r'F:/sanguo/project/31_还原清单.md', C)
