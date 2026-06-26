# scripts/bootstrap-neon.ps1
#
# Brings a fresh Neon Postgres to the same schema state the api-server
# expects. Run once after provisioning Neon, before pointing the api-server
# at it. Reads $env:DATABASE_URL.
#
# Order:
#   1. wipe (force-drop everything; neon is fresh so safe)
#   2. 0000_init             -- users, sessions, etc.
#   3. 0001_add_referred_from.sql through 0007 -- additive migrations
#   4. apply-security-hardening -- extensions, audit triggers, app role
#   5. verify-security-hardening -- green check
#
# Re-runnable; the wipe step makes that safe.

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not $env:DATABASE_URL) {
    throw "Set `$env:DATABASE_URL first."
}

Write-Host "Wiping public schema..." -ForegroundColor Cyan
$psqlOk = $true
try {
    $psqlOut = psql $env:DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO PUBLIC;" 2>&1
    if ($LASTEXITCODE -ne 0) { $psqlOk = $false }
} catch {
    $psqlOk = $false
}
if (-not $psqlOk) {
    Write-Host "  (psql not on PATH -- falling back to node wipe + DROP SCHEMA)" -ForegroundColor DarkYellow
    # 0000_init.sql uses plain CREATE TABLE (no IF NOT EXISTS), so a
    # schema drop is required for re-runnability. wipe-db.mjs only
    # TRUNCATEs (keeps schema), so we follow it with a DROP SCHEMA via
    # an inline node snippet -- which also proves the connection works.
    $env:WIPE = "yes"
    node lib/db/scripts/wipe-db.mjs
    if ($LASTEXITCODE -ne 0) {
        throw "wipe-db.mjs failed. Ensure DATABASE_URL is reachable."
    }
    # inline DROP SCHEMA -- run from lib/db so node can resolve `pg`
    # (.pnpm virtual store, not at workspace root).
    Push-Location lib/db
    node -e "import('pg').then(async ({default:pg})=>{const c=new pg.Client({connectionString:process.env.DATABASE_URL}); await c.connect(); try { await c.query('DROP SCHEMA public CASCADE'); await c.query('CREATE SCHEMA public'); await c.query('GRANT ALL ON SCHEMA public TO PUBLIC'); console.log('public schema dropped + recreated'); } finally { await c.end(); }});"
    $nodeExit = $LASTEXITCODE
    Pop-Location
    if ($nodeExit -ne 0) {
        throw "DROP SCHEMA public CASCADE failed. Inspect DATABASE_URL and connectivity."
    }
}

Write-Host "Applying schema migrations 0000-0008..." -ForegroundColor Cyan
$sql = @()
foreach ($m in @(
    "0000_init.sql",
    "0001_add_referred_from.sql",
    "0002_add_sync_state.sql",
    "0003_activation_events.sql",
    "0004_add_password_and_verification.sql",
    "0005_security_hardening.sql",
    "0006_calendar_events.sql",
    "0007_notes.sql",
    "0008_password_resets.sql"
)) {
    $p = "lib/db/drizzle/$m"
    if (Test-Path $p) {
        $sql += (Get-Content $p -Raw)
    }
}
$combined = ($sql -join "
-- =============================================================
-- next migration
-- =============================================================
")
# Write ASCII (no BOM) -- PowerShell's default for Set-Content uses UTF-8
# with BOM (PS 5.1 default), which Postgres rejects as a syntax error.
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Resolve-Path .).Path + "\.combined.sql", $combined, $utf8NoBom)

# Run the migration from lib/db so node can resolve `pg` via pnpm hoisting.
# Use an absolute path so the relative path stays valid after Push-Location.
$combinedAbs = (Resolve-Path .combined.sql).Path
Push-Location lib/db
node --input-type=module -e "import pg from 'pg'; import {readFileSync} from 'node:fs'; const c = new pg.Client({connectionString: process.env.DATABASE_URL}); await c.connect(); try { await c.query(readFileSync(process.argv[1],'utf8')); console.log('migrations applied'); } finally { await c.end(); }" "$combinedAbs"
$nodeExit = $LASTEXITCODE
Pop-Location
Remove-Item ".combined.sql"
if ($nodeExit -ne 0) {
    throw "Applying combined migrations failed."
}

Write-Host "Re-applying security hardening idempotently..." -ForegroundColor Cyan
node lib/db/scripts/apply-security-hardening.mjs

Write-Host "Verifying..." -ForegroundColor Cyan
node lib/db/scripts/verify-security-hardening.mjs
if ($LASTEXITCODE -ne 0) {
    throw "verify-security-hardening reported problems. Inspect output above."
}

Write-Host "Done. Neon is at the same schema state the api-server expects." -ForegroundColor Green
