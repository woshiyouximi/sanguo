# check_wiring.ps1 -- READ ONLY. Prints the web wiring anchors cited by
# project/140_battle_audit report. Does not modify anything.
# Usage (the pwsh on PATH lacks the .NET 8 runtime -- use Windows PowerShell):
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File work\battle_audit\check_wiring.ps1
# NOTE: keep this file ASCII-only. Windows PowerShell reads BOM-less .ps1 as ANSI.
$root = 'F:\sanguo\game'
$targets = @(
  @{ f = 'web\main.js';              p = 'allRush|v2|learnedSkillSeqs|makeSkillBar|from .\.\./dist/core/battle' },
  @{ f = 'src\core\battle.ts';       p = 'export function allRush|export function isRushing|RUSH_SPEED|export function requestRetreat' },
  @{ f = 'src\core\syso_host.ts';    p = "name: .AllRush." },
  @{ f = 'src\view\battleView.ts';   p = 'DEFAULT_SKILL_SEQ|function learnedSkillSeqs|BTN_ASSAULT|for \(let i = 0; i < 4' }
)
foreach ($t in $targets) {
  $path = Join-Path $root $t.f
  Write-Output ("=== " + $t.f)
  $n = 0
  Get-Content -LiteralPath $path -Encoding UTF8 | ForEach-Object {
    $n++
    if ($_ -match $t.p) { Write-Output ("{0,5}: {1}" -f $n, $_.Trim()) }
  }
}
