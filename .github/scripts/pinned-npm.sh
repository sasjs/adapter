#!/usr/bin/env bash
# Put the npm release this repository is reviewed against on the PATH, without
# an `npm install`.
#
# `npm install -g npm@<version>` is the obvious way to move a runner off its
# bundled npm, and it is what these workflows did. It also makes the toolchain in
# the release path unverifiable: npm has no hash-verified install mode, so the
# install resolves the version against the registry again on every run and can
# never be attested to. Fetching the tarball by version and checking it against a
# recorded sha512 makes what runs a named artifact rather than a resolution.
#
# The version is shared between jobs on purpose. npm 12 changed the shape of
# `npm pack --json`, so a release job on a different npm from the pull-request
# gate reads that report differently - which is how a release failed once already.
# Bump both together, from one table.
set -euo pipefail

NPM_VERSION=12.2.0
# `npm view npm@12.2.0 dist.integrity` - the registry's own checksum for the file
NPM_SHA512="sha512-ZsJjKpTnlmSXOLLXiU1xDCzC4Wlok4IwZmh/aw2KUuXytU7q6qMv/cUT7MoeSf95Slwuw/lRXYefGzGCspHPNQ=="

target="${RUNNER_TEMP:-/tmp}/npm-${NPM_VERSION}"
bin="$target/package/bin"
shim="$target/shim"

# The tarball is kept beside the tree it was extracted into, and its hash is
# checked on EVERY run rather than only on a cold cache: a persisted RUNNER_TEMP is
# not a trust boundary, so a truncated download or a half-extracted tree would
# otherwise be used for as long as the directory survived.
if [ ! -f "$target/npm.tgz" ]; then
  mkdir -p "$target"
  # --fail is what makes the retry policy real: without it curl writes a 4xx/5xx
  # body into the tarball, exits 0, and the hash check then reports a confusing
  # mismatch instead of the registry's status.
  if ! curl -sSLf --retry 3 --retry-connrefused \
      -o "$target/npm.tgz" "https://registry.npmjs.org/npm/-/npm-${NPM_VERSION}.tgz"; then
    rm -f "$target/npm.tgz"
    echo "::error::could not download npm-${NPM_VERSION}.tgz from the registry"
    exit 1
  fi
fi

actual="sha512-$(openssl dgst -sha512 -binary "$target/npm.tgz" | openssl base64 -A)"
if [ "$actual" != "$NPM_SHA512" ]; then
  # removed so the next run downloads again rather than hashing the same bad file
  rm -rf "$target/npm.tgz" "$target/package"
  echo "::error::npm-${NPM_VERSION}.tgz hashed to ${actual}, expected ${NPM_SHA512} - refusing to run it"
  exit 1
fi

if [ ! -f "$bin/npm-cli.js" ]; then
  tar -xzf "$target/npm.tgz" -C "$target"
fi

# The tarball's own bin/ wrappers resolve their prefix against the path they are
# invoked from, which is the installed layout rather than this one. Two-line
# shims call the CLIs where they actually are.
if [ ! -d "$shim" ]; then
  mkdir -p "$shim"
  for cli in npm npx; do
    printf '#!/bin/sh\nexec node "%s/%s-cli.js" "$@"\n' "$bin" "$cli" > "$shim/$cli"
    chmod +x "$shim/$cli"
  done
fi

# GITHUB_PATH applies to every step after this one; PATH covers this script's
# own check, which is what fails loudly here rather than three steps later.
if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$shim" >> "$GITHUB_PATH"
fi
export PATH="$shim:$PATH"

echo "node $(node --version), npm $(npm --version)"
if [ "$(npm --version)" != "$NPM_VERSION" ]; then
  echo "::error::expected npm ${NPM_VERSION} on the PATH, got $(npm --version)"
  exit 1
fi
