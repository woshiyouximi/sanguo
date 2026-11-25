# Probe a list of map city coordinates: click each, capture bottom bar, stack results.
param(
  [Parameter(Mandatory=$true)][int]$WinPid,
  [Parameter(Mandatory=$true)][string]$OutDir,
  [string]$Coords = '713,327;760,369;800,363;885,417;860,479;987,452;952,325;920,358',
  [int]$SettleMs = 1300,
  [int]$BarX = 700, [int]$BarY = 695, [int]$BarW = 365, [int]$BarH = 95,
  [int]$Scale = 2
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class P {
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
[void][P]::ShowWindow($h, 9)
[void][P]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 400
$r = New-Object P+RECT
[void][P]::GetWindowRect($h, [ref]$r)

$items = $Coords.Split(';') | Where-Object { $_ -ne '' }
$tiles = @()
$i = 0
foreach ($it in $items) {
  $i++
  $xy = $it.Split(',')
  $wx = [int]$xy[0]; $wy = [int]$xy[1]
  $sx = $r.Left + $wx; $sy = $r.Top + $wy
  [void][P]::SetCursorPos($sx, $sy); Start-Sleep -Milliseconds 120
  [P]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 60
  [P]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds $SettleMs
  $bmp = New-Object System.Drawing.Bitmap $BarW, $BarH
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen(($r.Left + $BarX), ($r.Top + $BarY), 0, 0, (New-Object System.Drawing.Size($BarW, $BarH)))
  $g.Dispose()
  $f = Join-Path $OutDir ("probe_{0}_{1}_{2}.png" -f $i, $wx, $wy)
  $bmp.Save($f, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $tiles += ,@($f, "$i ($wx,$wy)")
  Write-Output "clicked $wx,$wy -> $f"
}
# stack vertically with label strip on the left
$lab = 96
$tw = $BarW * $Scale; $th = $BarH * $Scale
$outBmp = New-Object System.Drawing.Bitmap ($tw + $lab), ($th * $tiles.Count)
$og = [System.Drawing.Graphics]::FromImage($outBmp)
$og.Clear([System.Drawing.Color]::FromArgb(20, 20, 24))
$og.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$og.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$font = New-Object System.Drawing.Font('Consolas', 11)
$brush = [System.Drawing.Brushes]::White
$k = 0
foreach ($t in $tiles) {
  $img = [System.Drawing.Image]::FromFile($t[0])
  $og.DrawImage($img, (New-Object System.Drawing.Rectangle($lab, ($k * $th), $tw, $th)))
  $og.DrawString($t[1], $font, $brush, 2, ($k * $th + 6))
  $img.Dispose()
  $k++
}
$og.Dispose()
$outFile = Join-Path $OutDir 'probe2_stack.png'
$outBmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
$outBmp.Dispose()
Write-Output "stacked=$outFile"
