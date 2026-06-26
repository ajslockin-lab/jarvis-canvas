$ErrorActionPreference = 'Continue'
$conn = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
if ($null -eq $conn) {
  Write-Output "no listener on 8080"
  exit 0
}
$conn | Format-Table -AutoSize | Out-String | Write-Output
$conn | ForEach-Object {
  try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction Stop; Write-Output "killed pid $($_.OwningProcess)" }
  catch { Write-Output "skip pid $($_.OwningProcess): $($_.Exception.Message)" }
}
Write-Output "done"
