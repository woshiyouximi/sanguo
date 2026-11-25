$p = Start-Process -FilePath cmd.exe -ArgumentList '/c','exit 0' -PassThru -NoNewWindow
if (-not ($p.WaitForExit(5000))) { "timeout" }
"code=" + $p.ExitCode
