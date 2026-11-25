# Vertically stack PNG tiles with an index label drawn on the left.
# Usage: -In "a.png","b.png" -Out "stack.png" [-Label "1,2,3"]
param(
  [Parameter(Mandatory=$true)][string[]]$In,
  [Parameter(Mandatory=$true)][string]$Out,
  [string]$Label = ''
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$labels = if ($Label) { $Label.Split(',') } else { @() }
$imgs = @()
foreach ($f in $In) { $imgs += [System.Drawing.Image]::FromFile((Resolve-Path $f)) }
$padLeft = 34
$gap = 4
$maxW = 0; $sumH = 0
foreach ($img in $imgs) { if ($img.Width -gt $maxW) { $maxW = $img.Width }; $sumH += $img.Height }
$w = $maxW + $padLeft
$h = $sumH + ($gap * ($imgs.Count - 1))
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(30,30,30))
$font = New-Object System.Drawing.Font('Consolas', 13, [System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.Brushes]::White
$y = 0
for ($i = 0; $i -lt $imgs.Count; $i++) {
  $img = $imgs[$i]
  $g.DrawImage($img, $padLeft, $y)
  $lab = if ($i -lt $labels.Count) { $labels[$i] } else { "$($i+1)" }
  $g.DrawString($lab, $font, $brush, 2, ($y + [int]($img.Height/2) - 12))
  $y += $img.Height + $gap
}
$g.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
foreach ($img in $imgs) { $img.Dispose() }
Write-Output "stacked $($imgs.Count) tiles -> ${w}x${h} : $Out"
