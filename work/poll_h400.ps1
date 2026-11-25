$ErrorActionPreference = 'Continue'
$env:POD_HOST = 'cpod-1xlpypxmr3u3-s1.podtcp.compshare.cn'
$env:POD_PORT = '27684'
$env:POD_USER = 'root'
$env:POD_PASSWORD = 'PW703Do241nkA96C'
$py = 'C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$ssh = 'F:\时空旅行者\tools\pod_ssh.py'
$log = 'F:\sanguo\work\poll_h400.log'

function Write-Log([string]$msg) {
    $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    Add-Content -Path $log -Value "[$ts] $msg" -Encoding UTF8
}

Write-Log "START polling"
$prev = -1
$stall = 0
for ($i = 1; $i -le 12; $i++) {
    $out = & $py $ssh exec "ls /workspace/sanguo/out_h400/*.png 2>/dev/null | wc -l" 2>&1 | Out-String
    $n = -1
    foreach ($ln in ($out -split "`r?`n")) {
        if ($ln -match '^\s*(\d+)\s*$') { $n = [int]$Matches[1]; break }
    }
    $flat = ($out -replace "`r?`n", ' ').Trim()
    if ($n -ge 0) {
        Write-Log "poll $i count=$n (prev=$prev)"
    } else {
        Write-Log "poll $i ERROR raw=[$flat]"
    }

    if ($n -ge 395) { Write-Log "DONE reached $n >= 395"; break }

    if ($n -ge 0 -and $n -eq $prev) { $stall++ } else { $stall = 0 }
    if ($n -ge 0) { $prev = $n }
    if ($stall -ge 2) { Write-Log "STALLED at $n for 2 consecutive polls"; break }

    if ($i -lt 12) { Start-Sleep -Seconds 360 }
}
Write-Log "EXIT final_count=$prev"
