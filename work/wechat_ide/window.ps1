# Window control for the devtools window.
# Usage: -WinPid 122684 -Action maximize|restore|move -X -Y -W -H
param(
  [Parameter(Mandatory=$true)][int]$WinPid,
  [Parameter(Mandatory=$true)][ValidateSet('maximize','restore','move','minimize','foreground','topmost','notopmost','activate')][string]$Action,
  [int]$X = 0, [int]$Y = 0, [int]$W = 0, [int]$H = 0,
  [int]$SettleMs = 1200
)
$ErrorActionPreference='Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W2 {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$p = Get-Process -Id $WinPid
$h = $p.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { Write-Output "ERR no window"; exit 1 }
$SW_MAXIMIZE=3; $SW_RESTORE=9
$SWP_SHOWWINDOW=0x40; $HWND_TOP=[IntPtr]::Zero
switch ($Action) {
  'maximize' { [void][W2]::ShowWindow($h, $SW_MAXIMIZE) }
  'minimize' { [void][W2]::ShowWindow($h, 6) }
  'restore'  { [void][W2]::ShowWindow($h, $SW_RESTORE) }
  'move'     { [void][W2]::SetWindowPos($h, $HWND_TOP, $X, $Y, $W, $H, $SWP_SHOWWINDOW) }
  'topmost'  { [void][W2]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 0x0043) }
  'notopmost'{ [void][W2]::SetWindowPos($h, [IntPtr](-2), 0, 0, 0, 0, 0x0043) }
  'activate' {
    [void][W2]::ShowWindow($h, $SW_RESTORE)
    # aggressive foreground: attach input threads then set foreground
    [void][W2]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 0x0001 -bor 0x0002)
    [void][W2]::SetForegroundWindow($h)
    [void][W2]::SetWindowPos($h, [IntPtr](-2), 0, 0, 0, 0, 0x0001 -bor 0x0002)
  }
  'foreground' { [void][W2]::ShowWindow($h, $SW_RESTORE); [void][W2]::SetForegroundWindow($h) }
}
Start-Sleep -Milliseconds $SettleMs
$r = New-Object W2+RECT
[void][W2]::GetWindowRect($h, [ref]$r)
$fg = [W2]::GetForegroundWindow()
Write-Output "action=$Action rect=$($r.Left),$($r.Top) size=$($r.Right-$r.Left)x$($r.Bottom-$r.Top) isForeground=$($fg -eq $h)"
