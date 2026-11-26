$ErrorActionPreference = 'Stop'
[System.Text.Encoding]::RegisterProvider([System.Text.CodePagesEncodingProvider]::Instance)

$global:ExePath = 'F:\sanguo\work\units_per_side\Sango2.exe'
$global:Bytes = [System.IO.File]::ReadAllBytes($global:ExePath)

# --- parse PE sections ---
$e_lfanew = [BitConverter]::ToInt32($global:Bytes, 0x3C)
$numSec = [BitConverter]::ToUInt16($global:Bytes, $e_lfanew + 6)
$optSize = [BitConverter]::ToUInt16($global:Bytes, $e_lfanew + 20)
$secOff = $e_lfanew + 24 + $optSize
$global:ImageBase = [BitConverter]::ToUInt32($global:Bytes, $e_lfanew + 24 + 28)
$global:Sections = @()
for ($i = 0; $i -lt $numSec; $i++) {
    $o = $secOff + $i * 40
    $name = [System.Text.Encoding]::ASCII.GetString($global:Bytes, $o, 8).Trim([char]0)
    $vsize = [BitConverter]::ToUInt32($global:Bytes, $o + 8)
    $vaddr = [BitConverter]::ToUInt32($global:Bytes, $o + 12)
    $rawsize = [BitConverter]::ToUInt32($global:Bytes, $o + 16)
    $rawptr = [BitConverter]::ToUInt32($global:Bytes, $o + 20)
    $global:Sections += [pscustomobject]@{ Name=$name; VA=$vaddr; VSize=$vsize; RawPtr=$rawptr; RawSize=$rawsize }
}

function Va2Off([uint32]$va) {
    foreach ($s in $global:Sections) {
        $sva = $s.VA + $global:ImageBase
        if ($va -ge $sva -and $va -lt ($sva + [Math]::Max($s.VSize, $s.RawSize))) {
            return [int]($s.RawPtr + ($va - $sva))
        }
    }
    return -1
}

function Read-Str([uint32]$va, [int]$max = 200) {
    $off = Va2Off $va
    if ($off -lt 0) { return "<bad va 0x$($va.ToString('X'))>" }
    $enc = [System.Text.Encoding]::GetEncoding(950)
    $end = $off
    while ($end -lt $global:Bytes.Length -and $global:Bytes[$end] -ne 0 -and ($end - $off) -lt $max) { $end++ }
    return $enc.GetString($global:Bytes, $off, $end - $off)
}

function Read-Bytes([uint32]$va, [int]$n) {
    $off = Va2Off $va
    return $global:Bytes[$off..($off + $n - 1)]
}

function Read-I32([uint32]$va) {
    $off = Va2Off $va
    return [BitConverter]::ToInt32($global:Bytes, $off)
}

# dump all strings in .rdata + .data
function Dump-Strings([string]$outFile) {
    $sw = New-Object System.IO.StreamWriter($outFile, $false, [System.Text.Encoding]::UTF8)
    $enc = [System.Text.Encoding]::GetEncoding(950)
    foreach ($s in $global:Sections) {
        if ($s.Name -notin @('.rdata', '.data')) { continue }
        $base = $s.VA + $global:ImageBase; $off = $s.RawPtr; $end = $s.RawPtr + $s.RawSize
        $start = -1
        for ($i = $off; $i -le $end; $i++) {
            $b = if ($i -lt $end) { $global:Bytes[$i] } else { 0 }
            $isStr = ($b -ge 0x20 -and $b -lt 0x7F) -or ($b -ge 0x81)
            if ($isStr) { if ($start -lt 0) { $start = $i } }
            else {
                if ($start -ge 0 -and ($i - $start) -ge 3) {
                    $va = $base + ($start - $off)
                    $txt = $enc.GetString($global:Bytes, $start, $i - $start)
                    $sw.WriteLine(('0x{0:X8}`t{1}`t{2}' -f $va, ($i - $start), $txt))
                }
                $start = -1
            }
        }
    }
    $sw.Close()
}
