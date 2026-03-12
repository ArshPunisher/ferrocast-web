#!/bin/sh
# Every local gate, in CI's order. Fails on the first problem.
# Never pipe this through `head` in a commit chain: it hides the exit code.
#   tools/check.sh          all gates
#   tools/check.sh --fast   skip browsers and builds (formatting, types, lint, unit tests)
set -eu
cd "$(dirname "$0")/.."
fast=0
[ "${1:-}" = "--fast" ] && fast=1

echo "== prettier";   pnpm -s format:check
echo "== eslint";     pnpm -s lint
echo "== tsc";        pnpm -s typecheck
echo "== vitest";     pnpm -s -r --if-present test
echo "== shellcheck"; if command -v shellcheck >/dev/null 2>&1; then shellcheck tools/*.sh; else echo "(shellcheck not installed, skipped)"; fi
[ "$fast" = 1 ] && { echo "Fast checks passed."; exit 0; }

echo "== build";      pnpm -s build
echo "== embed dist"; test -f dist/dashboard/index.html && test -f dist/overlays/index.html
echo "== e2e overlays";  pnpm -s --filter @ferrocast/overlays e2e --reporter=dot
echo "== e2e dashboard"; pnpm -s --filter @ferrocast/dashboard e2e --reporter=dot
echo "== e2e site";      pnpm -s --filter @ferrocast/site e2e --reporter=dot
echo "All checks passed."
