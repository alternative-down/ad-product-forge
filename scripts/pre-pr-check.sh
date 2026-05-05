#!/usr/bin/env bash
# scripts/pre-pr-check.sh
# Verifies the current branch is up-to-date with origin/develop before force-push.
# Exits 0 if up-to-date, exits 1 with helpful message if not.

set -euo pipefail

BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD)

echo "[pre-pr-check] Fetching origin/develop..."
git fetch origin develop --quiet

if git merge-base --is-ancestor origin/develop HEAD; then
  echo "[pre-pr-check] OK — $BRANCH is up-to-date with origin/develop."
  exit 0
else
  echo "[pre-pr-check] FAIL — $BRANCH is behind origin/develop."
  echo ""
  echo "  Run:  git fetch origin && git rebase origin/develop"
  echo "  Then: git push --force-with-lease"
  echo ""
  echo "  Current tip of origin/develop:"
  git log --oneline origin/develop -1
  echo "  Current tip of $BRANCH:"
  git log --oneline HEAD -1
  exit 1
fi
