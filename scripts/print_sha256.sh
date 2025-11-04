#!/usr/bin/env bash
set -euo pipefail

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$@"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$@"
else
  echo "No SHA256 tool found (need shasum or sha256sum)." >&2
  exit 1
fi
