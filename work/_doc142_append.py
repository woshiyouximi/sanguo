import io

p = r'F:\sanguo\project\142_音频CDN上线.md'
add = """

## 7. R193：base 改成配置驱动，占位域名硬拒

之前的问题是：验收把 `https://example.com/sanguo/audio` 写进了包内 `audio-remote.json`，而构建脚本对此毫无意见——这种包一旦发出去，运行时就是「静音 + 每首都在 404」。

现在的口径（三处一起改）：

1. **权威来源是配置文件**：`tools/audio_cdn_config.json` 的 `base` 字段（空字符串 = 静音出包）。构建优先级 `-AudioBase 参数 > 配置文件 > 空`。
2. **占位/本机地址硬拒**：`tools/build_wechat.ps1` 与 `tools/check_audio_cdn.mjs` 都对 `example.com/org/net`、`your.com`、`localhost`、`127.0.0.1` 直接失败（构建 throw，自检 exit 3），不再允许它们进发布包。
3. **静音是显式选择，不是意外**：未配置 base 时构建打 `Write-Warning`（「音频将以静音出包…」）并继续，日志里能看见；这样「静音」永远是一个被写下来的状态，而不是忘了填。

发布前要做的三步（只有第一步需要人）：
1. 把 `dist/audio-cdn`（110 档 16.86 MB，`tools/publish_audio_cdn.ps1 -Target` 产出）上传到你的 CDN，拿到根地址；
2. 把根地址填进 `tools/audio_cdn_config.json` 的 `base`；
3. 重出包 `powershell -File tools\\build_wechat.ps1 -AppId <appid> -Mode upload`，再跑 `node tools/check_audio_cdn.mjs --pkg dist/wechat-upload --base <根>`，必须 `RESULT: PASS`。

注意：`tools/build_wechat.ps1` 是 **UTF-8 with BOM** 的 PowerShell 脚本，用会丢 BOM 的编辑器改它会让 Windows PowerShell 5.1 按 ANSI 读、中文注释变乱码并直接 parse error（R193 实际踩过，`-File` 报 `Unexpected token '-AudioBase'`）。改完请确认 `[System.Management.Automation.Language.Parser]::ParseFile` 的 `parseErrors=0`。
"""

with io.open(p, 'a', encoding='utf-8', newline='\n') as f:
    f.write(add)
print('appended', len(add))
