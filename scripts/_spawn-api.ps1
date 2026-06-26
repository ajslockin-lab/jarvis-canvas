$ErrorActionPreference = 'Stop'
Set-Location "C:\Users\sarth\jarvis-canvas\artifacts\api-server"
$env:DATABASE_URL = "postgresql://postgres:password@localhost:54329/jarvis"
$env:PORT         = "8080"
$env:CANVAS_SYNC_ENABLED     = "true"
$env:REMINDER_SCHEDULER_ENABLED = "true"
$arg = ".\dist\index.mjs"
$proc = Start-Process node -ArgumentList $arg -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput "..\..\scripts\api.out.log" `
  -RedirectStandardError  "..\..\scripts\api.err.log"
Start-Sleep -Seconds 1
Write-Output "started pid $($proc.Id)"
