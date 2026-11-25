# Keyboard driver for the devtools window (window-relative click + key chords).
# Usage:
#   -Action chord -Keys "CTRL+C"
#   -Action type  -Text "hello"
#   -Action clickthen -WinX 350 -WinY 947 -Keys "CTRL+C"
param(
  [Parameter(Mandatory=$true)][int]$WinPid,
  [Parameter(Mandatory=$true)][ValidateSet('chord','type','clickthen','ctrlc')][string]$Action,
  [string]$Keys = '',
  [string]$Text = '',
  [int]$WinX = 0, [int]$WinY = 0,
  [int]$SettleMs = 400
)
$ErrorActionPreference='Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class K {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, int dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int MapVirtualKey(uint uCode, uint uMapType);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$VK = @{ 'CTRL'=0x11; 'SHIFT'=0x10; 'ALT'=0x12; 'WIN'=0x5B; 'ENTER'=0x0D; 'TAB'=0x09;
         'ESC'=0x1B; 'SPACE'=0x20; 'BACK'=0x08; 'DEL'=0x2E;
         'A'=0x41;'B'=0x42;'C'=0x43;'D'=0x44;'E'=0x45;'F'=0x46;'G'=0x47;'H'=0x48;'I'=0x49;'J'=0x4A;
         'K'=0x4B;'L'=0x4C;'M'=0x4D;'N'=0x4E;'O'=0x4F;'P'=0x50;'Q'=0x51;'R'=0x52;'S'=0x53;'T'=0x54;
         'U'=0x55;'V'=0x56;'W'=0x57;'X'=0x58;'Y'=0x59;'Z'=0x5A;
         '0'=0x30;'1'=0x31;'2'=0x32;'3'=0x33;'4'=0x34;'5'=0x35;'6'=0x36;'7'=0x37;'8'=0x38;'9'=0x39;
         'F5'=0x74;'F12'=0x7B;'PLUS'=0xBB;'MINUS'=0xBD;'DOT'=0xBE;'SLASH'=0xBF;'TILDE'=0xC0 }

$p = Get-Process -Id $WinPid
$h = $p.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { Write-Output "ERR no window"; exit 1 }
[void][K]::ShowWindow($h, 9)
[void][K]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 300
$r = New-Object K+RECT; [void][K]::GetWindowRect($h, [ref]$r)
$fg = [K]::GetForegroundWindow()
Write-Output "foreground_matches=$($fg -eq $h)"

function DoClick([int]$wx,[int]$wy){
  $sx = $r.Left + $wx; $sy = $r.Top + $wy
  [void][K]::SetCursorPos($sx,$sy); Start-Sleep -Milliseconds 120
  [K]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 50
  [K]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 120
}
function DoChord([string]$spec){
  $parts = $spec.ToUpper().Split('+') | Where-Object { $_ -ne '' }
  $mods = @(); $main = $null
  foreach($x in $parts){ if($VK.ContainsKey($x) -and $x -in @('CTRL','SHIFT','ALT','WIN')){ $mods += $VK[$x] } else { $main = $x } }
  if($null -eq $main){ Write-Output "ERR empty chord $spec"; return }
  if(-not $VK.ContainsKey($main)){ Write-Output "ERR unknown key $main"; return }
  $mk = $VK[$main]
  foreach($m in $mods){ [K]::keybd_event([byte]$m, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 30 }
  $scan = [K]::MapVirtualKey($mk, 0)
  [K]::keybd_event([byte]$mk, [byte]$scan, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 40
  [K]::keybd_event([byte]$mk, [byte]$scan, 2, [UIntPtr]::Zero); Start-Sleep -Milliseconds 30
  foreach($m in ($mods | Sort-Object -Descending)){ [K]::keybd_event([byte]$m, 0, 2, [UIntPtr]::Zero); Start-Sleep -Milliseconds 30 }
  Write-Output "chord $spec done"
}

switch ($Action) {
  'ctrlc' { DoChord 'CTRL+C' }
  'chord' { DoChord $Keys }
  'type'  { Set-Clipboard -Value $Text; DoChord 'CTRL+V'; Write-Output "pasted $($Text.Length) chars" }
  'clickthen' { DoClick $WinX $WinY; Start-Sleep -Milliseconds 200; DoChord $Keys }
}
Start-Sleep -Milliseconds $SettleMs
Write-Output "done"
