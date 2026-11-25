# Capture a top-level window by PID to PNG.
# Usage: pwsh -File capture.ps1 -TargetPid 122684 -Out "F:\sanguo\work\wechat_ide\shots\x.png" [-Mode print|screen] [-Activate]
param(
  [Parameter(Mandatory=$true)][int]$TargetPid,
  [Parameter(Mandatory=$true)][string]$Out,
  [ValidateSet('print','screen')][string]$Mode = 'print',
  [switch]$Activate
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
}
"@
$p = Get-Process -Id $TargetPid
$h = $p.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { Write-Output "ERR no MainWindowHandle for pid $TargetPid"; exit 1 }

if ($Activate) { [void][W]::ShowWindow($h, 9); [void][W]::SetForegroundWindow($h); Start-Sleep -Milliseconds 700 }

$r = New-Object W+RECT
[void][W]::GetWindowRect($h, [ref]$r)
$w = $r.Right - $r.Left; $ht = $r.Bottom - $r.Top
if ($w -le 0 -or $ht -le 0) { Write-Output "ERR bad rect $w x $ht"; exit 1 }

$bmp = New-Object System.Drawing.Bitmap($w, $ht)
$g = [System.Drawing.Graphics]::FromImage($bmp)

if ($Mode -eq 'print') {
  $hdc = $g.GetHdc()
  $ok = [W]::PrintWindow($h, $hdc, 2)   # PW_RENDERFULLCONTENT
  $g.ReleaseHdc($hdc)
  Write-Output "printwindow_ok=$ok rect=$($r.Left),$($r.Top) ${w}x${ht}"
} else {
  $g.CopyFromScreen($r.Left, $r.Top, 0, 0, (New-Object System.Drawing.Size($w, $ht)))
  Write-Output "copyscreen rect=$($r.Left),$($r.Top) ${w}x${ht}"
}
$g.Dispose()
$dir = Split-Path -Parent $Out
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$fi = Get-Item $Out
Write-Output "saved=$($fi.FullName) bytes=$($fi.Length)"
