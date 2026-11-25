# Mouse driver for the devtools window. Window-relative coords.
# Usage:
#   -Action click  -WinX 350 -WinY 852
#   -Action drag   -WinX 350 -WinY 852 -ToX 350 -ToY 460
#   -Action move   -WinX 350 -WinY 852
#   -Action wheel  -WinX 350 -WinY 600 -Delta -360
param(
  [Parameter(Mandatory=$true)][int]$WinPid,
  [Parameter(Mandatory=$true)][ValidateSet('click','drag','move','wheel','dblclick')][string]$Action,
  [int]$WinX = 0, [int]$WinY = 0,
  [int]$ToX = 0, [int]$ToY = 0,
  [int]$Delta = 0,
  [int]$SettleMs = 350
)
$ErrorActionPreference='Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class M {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, int dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$p = Get-Process -Id $WinPid
$h = $p.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { Write-Output "ERR no window for pid $WinPid"; exit 1 }
[void][M]::ShowWindow($h, 9)      # SW_RESTORE
[void][M]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 400
$r = New-Object M+RECT
[void][M]::GetWindowRect($h, [ref]$r)
$sx = $r.Left + $WinX
$sy = $r.Top  + $WinY
Write-Output "window=$($r.Left),$($r.Top) target_win=$WinX,$WinY -> screen=$sx,$sy"

$LDOWN=0x0002; $LUP=0x0004; $DBL=0x0002
switch ($Action) {
  'move'  { [void][M]::SetCursorPos($sx,$sy) }
  'click' {
    [void][M]::SetCursorPos($sx,$sy); Start-Sleep -Milliseconds 120
    [M]::mouse_event($LDOWN,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 60
    [M]::mouse_event($LUP,0,0,0,[UIntPtr]::Zero)
  }
  'dblclick' {
    [void][M]::SetCursorPos($sx,$sy); Start-Sleep -Milliseconds 120
    1..2 | ForEach-Object { [M]::mouse_event($LDOWN,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 40; [M]::mouse_event($LUP,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 90 }
  }
  'drag' {
    $tx = $r.Left + $ToX; $ty = $r.Top + $ToY
    [void][M]::SetCursorPos($sx,$sy); Start-Sleep -Milliseconds 150
    [M]::mouse_event($LDOWN,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 150
    for ($i=1; $i -le 12; $i++) {
      $ix = [int]($sx + ($tx-$sx)*$i/12); $iy = [int]($sy + ($ty-$sy)*$i/12)
      [void][M]::SetCursorPos($ix,$iy); Start-Sleep -Milliseconds 25
    }
    Start-Sleep -Milliseconds 150
    [M]::mouse_event($LUP,0,0,0,[UIntPtr]::Zero)
    Write-Output "dragged to screen=$tx,$ty"
  }
  'wheel' {
    [void][M]::SetCursorPos($sx,$sy); Start-Sleep -Milliseconds 120
    [M]::mouse_event(0x0800,0,0,$Delta,[UIntPtr]::Zero)
  }
}
Start-Sleep -Milliseconds $SettleMs
Write-Output "done $Action"
