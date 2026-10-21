$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$Repo = 'https://github.com/alireza-anari/Haniel_Gold.git'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Install Git for Windows first.' }
if (-not (Get-Command py -ErrorAction SilentlyContinue)) { throw 'Install Python 3 first.' }
py -3 tools/preflight.py
if ($LASTEXITCODE -ne 0) { throw 'Preflight failed.' }
py -3 tools/scan_git_public.py --filesystem
if ($LASTEXITCODE -ne 0) { throw 'Public file check failed.' }
if (-not (Test-Path '.git')) { git init -b main; if ($LASTEXITCODE -ne 0) { throw 'git init failed' } }
$branch = (git branch --show-current).Trim()
if ($branch -ne 'main') { throw "Expected branch main; got $branch" }
if (@(git remote) -contains 'origin') {
  $origin = (git remote get-url origin).Trim()
  if ($origin -ne $Repo) { throw "origin mismatch: $origin" }
} else { git remote add origin $Repo }
git add -A
if ($LASTEXITCODE -ne 0) { throw 'git add failed.' }
py -3 tools/scan_git_public.py
if ($LASTEXITCODE -ne 0) { throw 'Staged-file scan failed.' }
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { Write-Host 'Nothing to commit'; exit 0 }
git commit -m 'chore: initialize HANI-EL GOLD frontend backend and deployment'
if ($LASTEXITCODE -ne 0) { throw 'git commit failed. Configure your Git name/email first.' }
git push -u origin main
if ($LASTEXITCODE -ne 0) { throw 'git push failed. Verify GitHub login and that the repo is still empty.' }
Write-Host 'Pushed to https://github.com/alireza-anari/Haniel_Gold'
