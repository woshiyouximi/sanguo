# Crop a region out of a PNG and scale it up (nearest-neighbour preserved by high-quality bicubic).
# Usage: -In <png> -Out <png> -X -Y -W -H [-Scale 3]
param(
  [Parameter(Mandatory=$true)][string]$In,
  [Parameter(Mandatory=$true)][string]$Out,
  [Parameter(Mandatory=$true)][int]$X,
  [Parameter(Mandatory=$true)][int]$Y,
  [Parameter(Mandatory=$true)][int]$W,
  [Parameter(Mandatory=$true)][int]$H,
  [double]$Scale = 3.0
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile((Resolve-Path $In))
if ($X -lt 0) { $X = 0 }
if ($Y -lt 0) { $Y = 0 }
if (($X + $W) -gt $src.Width)  { $W = $src.Width  - $X }
if (($Y + $H) -gt $src.Height) { $H = $src.Height - $Y }
$rect = New-Object System.Drawing.Rectangle($X, $Y, $W, $H)
$crop = New-Object System.Drawing.Bitmap($W, $H)
$gc = [System.Drawing.Graphics]::FromImage($crop)
$gc.DrawImage($src, (New-Object System.Drawing.Rectangle(0,0,$W,$H)), $rect, [System.Drawing.GraphicsUnit]::Pixel)
$gc.Dispose()
$nw = [int]($W * $Scale); $nh = [int]($H * $Scale)
$big = New-Object System.Drawing.Bitmap($nw, $nh)
$gb = [System.Drawing.Graphics]::FromImage($big)
$gb.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$gb.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$gb.DrawImage($crop, 0, 0, $nw, $nh)
$gb.Dispose(); $crop.Dispose(); $src.Dispose()
$big.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$big.Dispose()
Write-Output "cropped ${W}x${H} -> ${nw}x${nh} : $Out"
