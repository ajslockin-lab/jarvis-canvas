# scripts/deploy-hf.ps1
#
# One-shot deploy to a Hugging Face Space.
#   - Builds the api-server bundle (pnpm).
#   - Stages a deploy tree with paths the HF Dockerfile expects.
#   - Clones the Space's git repo, drops our files in, commits, pushes.
#
#Prereqs:
#   - PowerShell 7+ on Windows.
#   - Git on PATH (already in this repo).
#   - A HF write token: huggingface.co/settings/tokens → New token → role=Write.
#   - The Space must exist (created via huggingface.co/new-space, SDK=Docker,
#     hardware=Free CPU). Don't worry about its default files — this script
#     overwrites them all.
#
# Usage:
#   $env:HUGGINGFACE_TOKEN = "hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
#   pwsh ./scripts/deploy-hf.ps1
#
# Re-running on each deploy takes ~30 seconds.

param(
    [string]$HfUser    = "Ssatgk",
    [string]$SpaceName = "carvis-api",
    [string]$Branch    = "main",
    [string]$CommitAuthorName  = "Claude",
    [string]$CommitAuthorEmail = "noreply@anthropic.com"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not $env:HUGGINGFACE_TOKEN) {
    throw "Set `$env:HUGGINGFACE_TOKEN = 'hf_…' first (token from huggingface.co/settings/tokens)."
}

Write-Host "Building api-server bundle..." -ForegroundColor Cyan
pnpm --filter @workspace/api-server run build | Out-Null
if (-not (Test-Path "artifacts/api-server/dist/index.mjs")) {
    throw "Build failed: artifacts/api-server/dist/index.mjs not produced. Run `pnpm --filter @workspace/api-server run build` manually to see the error."
}

Write-Host "Staging deploy tree..." -ForegroundColor Cyan
$stage = Join-Path $repoRoot ".hf-stage"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item $stage -ItemType Directory -Force | Out-Null

# dist bundle under the path our Dockerfile expects
$apiDist = "$stage/artifacts/api-server/dist"
New-Item $apiDist -ItemType Directory -Force | Out-Null
Copy-Item "artifacts/api-server/dist/*" "$apiDist/" -Recurse

# chrome extension static files
$chromeExt = "$stage/artifacts/chrome-extension"
New-Item $chromeExt -ItemType Directory -Force | Out-Null
Copy-Item "artifacts/chrome-extension/*" "$chromeExt/" -Recurse -Force

# HF-targeted Dockerfile: small, no pnpm install at runtime—bundle is self-contained.
@'
FROM node:20-bookworm-slim
WORKDIR /app
COPY artifacts/api-server/dist ./artifacts/api-server/dist
COPY artifacts/chrome-extension ./artifacts/chrome-extension
USER node
EXPOSE 7860
CMD ["node", "./artifacts/api-server/dist/index.mjs"]
'@ | Out-File "$stage/Dockerfile" -Encoding ascii -NoNewline

Write-Host "Cloning HF Space repo..." -ForegroundColor Cyan
$hfRepo = Join-Path $repoRoot ".hf-repo"
$hfUrl  = "https://huggingface.co/spaces/$HfUser/$SpaceName"
if (Test-Path $hfRepo) { Remove-Item $hfRepo -Recurse -Force }
git clone $hfUrl $hfRepo
if ($LASTEXITCODE -ne 0) {
    throw "git clone failed. Confirm the Space exists at https://huggingface.co/spaces/$HfUser/$SpaceName."
}

# Overlay staged files onto the HF repo (preserves .git + Space's own files).
Write-Host "Syncing files into HF repo..." -ForegroundColor Cyan
Copy-Item "$stage/*" "$hfRepo/" -Recurse -Force

# gitignored junk from earlier cycles (pts/dist, etc.)
foreach ($junk in @(".git", ".gitattributes")) {
    $p = Join-Path $hfRepo $junk
    if (Test-Path $p) {
        # keep .git (we need it), drop any stray .gitattributes the Space may have
        if ($junk -eq ".gitattributes") { Remove-Item $p -Recurse -Force }
    }
}

Push-Location $hfRepo
git add -A
$stamp = Get-Date -Format "yyyyMMdd.HHmmss"
git -c "user.name=$CommitAuthorName" -c "user.email=$CommitAuthorEmail" commit -m "Carvis api-server v$stamp"
git remote set-url origin "https://$HfUser`:$($env:HUGGINGFACE_TOKEN)@huggingface.co/spaces/$HfUser/$SpaceName"
git push origin $Branch
Pop-Location

Remove-Item $stage -Recurse -Force
Remove-Item $hfRepo -Recurse -Force

Write-Host "Pushed." -ForegroundColor Green
Write-Host "Watch the Space build at: https://huggingface.co/spaces/$HfUser/$SpaceName" -ForegroundColor Green
