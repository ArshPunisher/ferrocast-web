#!/bin/sh
# A quick smoke run (about a minute): unit tests for the design model and catalogue, then
# the @smoke browser tests (the app boots, the gallery loads, a test alert renders, an
# overlay plays a design). Builds first, because the browser tests run the built app.
#   tools/smoke.sh
set -eu
cd "$(dirname "$0")/.."
echo "== unit (designs, api, overlays)"
pnpm -s --filter @ferrocast/designs test
pnpm -s --filter @ferrocast/api test
pnpm -s --filter @ferrocast/overlays test
echo "== build"
pnpm -s build:embed
echo "== smoke: overlays"
pnpm -s --filter @ferrocast/overlays e2e --grep @smoke --reporter=dot
echo "== smoke: dashboard"
pnpm -s --filter @ferrocast/dashboard e2e --grep @smoke --project=chromium --reporter=dot
echo "Smoke tests passed."
