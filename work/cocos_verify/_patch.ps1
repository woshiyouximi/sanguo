$p = "156_Cocos战斗指令界面.md"
$t = Get-Content -Raw -Encoding UTF8 $p
$t = $t.Replace('`BattleRoot.ts:534`', '`BattleRoot.ts:538`')
$t = $t.Replace('`paintChromeBand()`（`:1122`）', '`paintChromeBand()`（`:1131`）')
$t = $t.Replace('`hideLegacyConsole()` `:965`', '`hideLegacyConsole()` `:975`')
$t = $t.Replace('`BattleRoot.ts:373`', '`BattleRoot.ts:375`')
$t = $t.Replace('`drawGeneralGauge()`（`:1095`）', '`drawGeneralGauge()`（`:1105`）')
$t = $t.Replace('`syncCmdUi()`（`:993`）', '`syncCmdUi()`（`:1003`）')
$t = $t.Replace('`buildCmdItem()` `:1034`', '`buildCmdItem()` `:1044`')
$t = $t.Replace('（`.ts:1027-1030`）', '（`BattleRoot.ts:1036-1039`）')
$t = $t.Replace('`tap()`（`BattleInput.ts:636`）', '`tap()`（`BattleInput.ts:636`）')
$t = $t.Replace('1.2s −3.05 变成
3s +0.63（90 tick）', '1.2s −2.96 变成 3s +0.52（89 tick）')
$t = $t.Replace('真点第 5 行「全軍待機」后位移从 1.2s −3.05 变成
3s +0.63（90 tick）', '真点第 5 行「全軍待機」后位移从 1.2s −2.96 变成 3s +0.52（89 tick）')
Set-Content -Path $p -Value $t -Encoding UTF8 -NoNewline
'patched'
