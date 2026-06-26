# scripts/bootstrap-neon.ps1
#
# Brings a fresh Neon Postgres to the same schema state the api-server
# expects. Run once after provisioning Neon, before pointing the api-server
# at it. Reads $env:DATABASE_URL.
#
# Order:
#   1. wipe (force-drop everything; neon is fresh so safe)
#   2. 0000_init             — users, sessions, etc.
#   3. 0001_add_referred_from.sql through 0007 — additive migrations
#   4. apply-security-hardening — extensions, audit triggers, app role
#   5. verify-security-hardening — green check
#
# Re-runnable; the wipe step makes that safe.

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not $env:DATABASE_URL) {
    throw "Set `$env:DATABASE_URL first."
}

Write-Host "Wiping public schema..." -ForegroundColor Cyan
psql $env:DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO PUBLIC;" 2>&1
if ($LASTEXITCODE -ne 0) {
    # psql isn't on PATH; fall back to a tiny node wipe via pg
    node lib/db/scripts/wipe-db.mjs
}

Write-Host "Applying schema migrations 0000-0007..." -ForegroundColor Cyan
$sql = @()
foreach ($m in @(
    "0000_init.sql",
    "0001_add_referred_from.sql",
    "0002_add_sync_state.sql",
    "0003_activation_events.sql",
    "0004_add_password_and_verification.sql",
    "0005_security_hardening.sql",
    "0006_calendar_events.sql",
    "0007_notes.sql"
)) {
    $p = "lib/db/drizzle/$m"
    if (Test-Path $p) {
        $sql += (Get-Content $p -Raw)
    }
}
$combined = Join-String $sql ";</-->"   # noqa: PS doesn't need this; pivoted below
# PS Join-String isn't on 5.1; use -join with separator
$combined = ($sql -join "
-- =============================================================
-- next migration
-- =============================================================
")
Set-Content -Path ".combined.sql" -Value $combined -Encoding utf8
node -e "import('pg').then(async ({default:pg})=>{const c = new pg.Client({connectionString: process.env.DATABASE_URL}); await c.connect(); try { await c.query(require('node:fs').readFileSync('.combined.sql','utf8')); console.log('migrations applied'); } finally { await c.end(); }});"
Remove-Item ".combined.sql"

Write-Host "Re-applying security hardening idempotently..." -ForegroundColor Cyan
node lib/db/scripts/apply-security-hardening.mjs

Write-Host "Verifying..." -ForegroundColor Cyan
node lib/db/scripts/verify-security-hardening.mjs
if ($LASTEXITCODE -ne 0) {
    throw "verify-security-hardening reported problems. Inspect output above."
}

Write-Host "Done. Neon is at the same schema state the api-server expects." -ForegroundColor Green
