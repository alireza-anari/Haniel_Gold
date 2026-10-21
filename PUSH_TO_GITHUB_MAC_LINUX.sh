#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
REPO="https://github.com/alireza-anari/Haniel_Gold.git"
command -v git >/dev/null || { echo "Install Git first"; exit 1; }
command -v python3 >/dev/null || { echo "Install Python 3 first"; exit 1; }
python3 tools/preflight.py
python3 tools/scan_git_public.py --filesystem
if [ ! -d .git ]; then git init -b main; fi
BRANCH="$(git branch --show-current || true)"
if [ "$BRANCH" != main ]; then echo "Expected branch main; got $BRANCH. Stopped."; exit 1; fi
if git remote get-url origin >/dev/null 2>&1; then
  [ "$(git remote get-url origin)" = "$REPO" ] || { echo "Existing origin does not match requested repo; stopped"; exit 1; }
else
  git remote add origin "$REPO"
fi
git add -A
python3 tools/scan_git_public.py
git diff --cached --quiet && { echo "Nothing new to commit"; exit 0; }
git commit -m "chore: initialize HANI-EL GOLD frontend backend and deployment"
git push -u origin main
printf '\nRepository: https://github.com/alireza-anari/Haniel_Gold\n'
