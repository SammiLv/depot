#!/usr/bin/env bash
set -euo pipefail

MSG="${1:-}"
case "$MSG" in
  -h|--help)
    echo "Usage: $0 <commit-message>"
    exit 0
    ;;
  "")
    echo "Usage: $0 <commit-message>"
    exit 1
    ;;
esac

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" == "main" ]]; then
  echo "Already on main, use git commit directly."
  exit 1
fi

MAIN_WORKTREE="$(git worktree list | grep '\[main\]' | awk '{print $1}')"
if [[ -z "$MAIN_WORKTREE" ]]; then
  echo "Could not find local main worktree."
  exit 1
fi

if git diff --quiet && git diff --cached --quiet; then
  echo "Nothing to commit."
  exit 0
fi

git add .
git commit -m "$MSG"
COMMIT="$(git rev-parse HEAD)"

echo "==> Committed $COMMIT on $CURRENT_BRANCH"
echo "==> Cherry-picking into main at $MAIN_WORKTREE"
git -C "$MAIN_WORKTREE" cherry-pick "$COMMIT"

echo "==> Done."
