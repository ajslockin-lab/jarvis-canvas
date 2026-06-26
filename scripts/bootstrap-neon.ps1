# scripts/bootstrap-neon.ps1
#
# Brings a fresh Neon Postgres to the same schema state the api-server
# expects. Run once after provisioning Neon, before pointing the api-server
# at it. Reads $env:DATABASE_URL.
#
# Order:
#   1. wipe (force-drop everything; neon is fresh so safe)
#   2. 0000_init through 0004 + 0006 through 0008 (idempotent additive migrations)
#   3. 0005_security_hardening (separate so we can capture the randomized
#      carvis_app role password via RAISE NOTICE -> .env.production)
#   4. verify-security-hardening
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

Write-Host "Applying schema migrations 0000-0004 + 0006-0008 (0005 runs separately to capture the randomized carvis_app password)..." -ForegroundColor Cyan
$sql = @()
foreach ($m in @(
    "0000_init.sql",
    "0001_add_referred_from.sql",
    "0002_add_sync_state.sql",
    "0003_activation_events.sql",
    "0004_add_password_and_verification.sql",
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

Write-Host "Applying 0005 with randomized carvis_app password capture..." -ForegroundColor Cyan
$envPath = Join-Path $repoRoot "artifacts/api-server/.env.production"
$pwCapturePath = Join-Path $repoRoot ".carvis_app_pw"
Remove-Item $pwCapturePath -ErrorAction SilentlyContinue
$env:PW_OUT = $pwCapturePath
Push-Location lib/db
node --input-type=module -e "import pg from 'pg'; import {readFileSync, appendFileSync} from 'node:fs'; const c = new pg.Client({connectionString: process.env.DATABASE_URL}); c.on('notice', n => { const m = n.message && n.message.match(/^CARVIS_APP_PASSWORD(?:_REFRESH)?=(.+)$/m); if (m) { try { appendFileSync(process.env.PW_OUT, m[1] + String.fromCharCode(10)); } catch {} } }); await c.connect(); try { await c.query(readFileSync('drizzle/0005_security_hardening.sql','utf8')); console.log('0005 applied'); } finally { await c.end(); }"
$nodeExit = $LASTEXITCODE
Pop-Location
Remove-Item env:PW_OUT -ErrorAction SilentlyContinue
if ($nodeExit -ne 0) {
    throw "0005_security_hardening failed."
}

$captured = ""
if (Test-Path $pwCapturePath) {
    $captured = (Get-Content $pwCapturePath -Raw).Trim()
    Remove-Item $pwCapturePath -Force
}

if ($captured) {
    @"
# Generated by scripts/bootstrap-neon.ps1 -- do not commit
CARVIS_APP_PASSWORD=$captured
"@ | Out-File -FilePath $envPath -Encoding ascii -NoNewline
    Write-Host "Wrote carvis_app password to: $envPath" -ForegroundColor DarkGray
} else {
    Write-Host "WARNING: no captured carvis_app password (role existed already); not rewriting $envPath" -ForegroundColor Yellow
}

# Skip apply-security-hardening.mjs for raw-SQL bootstrap; 0005 already ran with
# the random password captured above. Re-running would rotate the pw and break
# the .env we just wrote. verify below is enough on a fresh DB.

Write-Host "Verifying..." -ForegroundColor Cyan
node lib/db/scripts/verify-security-hardening.mjs
if ($LASTEXITCODE -ne 0) {
    throw "verify-security-hardening reported problems. Inspect output above."
}

Write-Host "Done. Neon is at the same schema state the api-server expects." -ForegroundColor Green
