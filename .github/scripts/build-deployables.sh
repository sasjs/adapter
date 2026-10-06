#!/bin/bash
# Build the adapter-tests app against THIS adapter, then produce a deployable
# package from it.
#
# The point is that the PR's adapter build ends up inside the app bundle, so
# whoever deploys the artefact is testing this PR's adapter - not the published
# one.
#
# Usage: build-deployables.sh <appLoc> <outputDir>
#   appLoc    e.g. /Public/app/adapter-tests/pr-919
#             A streamed app only works from the appLoc it was built against,
#             so each run gets its own.
#   outputDir where the artefacts are written.
#
# Outputs:
#   adapter-tests-deployable.zip   the build folder + sasjsconfig + README -
#                                  unzip, then `npx @sasjs/cli deploy -t <target>`
#   adaptertestssasjs.json         the SASjs Server service pack (readable)
#   adaptertestsviya.sas           the Viya deploy programme (readable)
set -euo pipefail

APPLOC="${1:?usage: build-deployables.sh <appLoc> <outputDir>}"
OUT="${2:?usage: build-deployables.sh <appLoc> <outputDir>}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$REPO_ROOT/sasjs-tests"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"

echo "== repo:    $REPO_ROOT"
echo "== appLoc:  $APPLOC"
echo "== output:  $OUT"

echo
echo "== 1. install and build the adapter from this checkout =="
cd "$REPO_ROOT"
# A fresh checkout has no node_modules, and `npm run package:lib` needs the
# adapter's own devDependencies (copyfiles, webpack). CI starts clean, so
# install first - a pre-populated local tree hides this.
if [ -f package-lock.json ]; then npm ci; else npm i; fi
npm run package:lib
TARBALL="$(ls -t "$REPO_ROOT"/build/sasjs-adapter-*.tgz | head -1)"
echo "   tarball: $TARBALL"
echo "   sha256:  $(sha256sum "$TARBALL" | cut -d' ' -f1)"

echo
echo "== 2. point the app's targets at this run's appLoc =="
cd "$APP_DIR"
python3 - "$APPLOC" <<'PY'
import json, sys
apploc = sys.argv[1]
p = "sasjs/sasjsconfig.json"
cfg = json.load(open(p))
for t in cfg.get("targets", []):
    t["appLoc"] = apploc
    t.setdefault("streamConfig", {})["streamServiceName"] = "adapter-tests"
json.dump(cfg, open(p, "w"), indent=2)
print("   targets:", ", ".join(f"{t['name']}->{t['appLoc']}" for t in cfg["targets"]))
PY

echo
echo "== 3. install and build the app against that adapter =="
# npm ci, not npm i: the build tools (@sasjs/cli, @sasjs/core) are pinned in
# this manifest and its lockfile. Floating them to latest would mean two runs of
# the same PR produced different artefacts, and the deployable would stop
# testing only this PR's adapter.
npm ci --ignore-scripts
npm i "$TARBALL" --ignore-scripts
echo "   adapter inside the app: $(python3 -c "import json;print(json.load(open('node_modules/@sasjs/adapter/package.json'))['version'])")"
npm run build
echo "   dist: $(find dist -type f | wc -l) files"

echo
echo "== 4. sasjs build + web for both targets (both offline) =="
for target in 4gl viya; do
  echo "   --- $target ---"
  npx sasjs build -t "$target"
  npx sasjs web   -t "$target"
done
# Re-run build so the deploy programmes reference the web services just written.
for target in 4gl viya; do npx sasjs build -t "$target" >/dev/null 2>&1; done
echo "   sasjsbuild:"
find sasjsbuild -maxdepth 3 -type f | sed 's/^/     /' | head -14

echo
echo "== 5. the two readable artefacts =="
# 4gl is serverType SASJS, so its JSON is the service pack for SASjs Server;
# the viya .sas is the self-contained Viya deploy programme.
cp sasjsbuild/4gl.json  "$OUT/adaptertestssasjs.json"
cp sasjsbuild/viya.sas  "$OUT/adaptertestsviya.sas"
echo "   adaptertestssasjs.json <- sasjsbuild/4gl.json"
echo "   adaptertestsviya.sas   <- sasjsbuild/viya.sas"

echo
echo "== 6. the deployable package =="
STAGE="$(mktemp -d)"
cp -r sasjsbuild "$STAGE/sasjsbuild"
cp sasjs/sasjsconfig.json "$STAGE/sasjsconfig.json"
cat > "$STAGE/README.md" <<README
# adapter-tests, built against the adapter from this PR

Deployed appLoc: \`$APPLOC\`

This package carries the adapter built from the pull request, baked into the
frontend bundle. Deploying it tests that adapter.

## Deploy

    npx @sasjs/cli deploy -t 4gl     # SASjs Server
    npx @sasjs/cli deploy -t viya    # Viya

Credentials are yours - the CLI prompts, or use \`.env.4gl\` / \`.env.viya\`.
Nothing in this package authenticates on its own.

## Then

Open the streamed app and let its suite run. Every test is a check on how the
adapter parses a SAS response - sendObj, sendArr, runAsTask and friends.

The appLoc is per-run on purpose: a streamed app only works from the appLoc it
was built against, and separate paths keep two PRs from colliding.
README
(cd "$STAGE" && {
  if command -v zip >/dev/null 2>&1; then
    zip -qr "$OUT/adapter-tests-deployable.zip" .
  else
    # GitHub runners have zip; minimal images do not. Python's stdlib always does.
    python3 - "$STAGE" "$OUT/adapter-tests-deployable.zip" <<'PY'
import os, sys, zipfile
stage, dest = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _dirs, files in os.walk(stage):
        for f in files:
            full = os.path.join(root, f)
            z.write(full, os.path.relpath(full, stage))
PY
  fi
})
rm -rf "$STAGE"
echo "   adapter-tests-deployable.zip ($(du -h "$OUT/adapter-tests-deployable.zip" | cut -f1))"

echo
echo "== 7. checksums =="
cd "$OUT" && sha256sum adapter-tests-deployable.zip adaptertestssasjs.json adaptertestsviya.sas

# Leave the checkout as we found it - in CI this is throwaway, but a local run
# should not leave the appLoc rewritten in the working tree.
cd "$REPO_ROOT"
git checkout -- sasjs-tests/sasjs/sasjsconfig.json 2>/dev/null || true
git checkout -- sasjs-tests/package.json sasjs-tests/package-lock.json 2>/dev/null || true
