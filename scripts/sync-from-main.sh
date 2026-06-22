#!/usr/bin/env bash
set -euo pipefail

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [[ "$CURRENT_BRANCH" == "main" ]]; then
  echo "Already on main, nothing to sync."
  exit 0
fi

echo "==> Current branch: $CURRENT_BRANCH"
echo "==> Merging local main into $CURRENT_BRANCH"
git merge --no-edit main

echo "==> Done. $(git log --oneline -1 main) is now merged."
