#!/usr/bin/env bash
set -euo pipefail

echo "== Secret scan (quick grep) =="
git grep -InE 'API[_-]?KEY|SECRET|TOKEN|PASSWORD|PRIVATE[_-]?KEY|BEGIN (RSA|OPENSSH)|client_secret|slack|oauth' || true

echo -e "\n== Big files in history (potential leaks) =="
git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \
  | awk '$1=="blob"{print $3/1024 "KB\t" $4}' | sort -nr | head -n 50

echo -e "\n== Dependency audits =="
if [ -f requirements.txt ] || ls requirements*.txt >/dev/null 2>&1; then
  python -m pip install --upgrade pip pip-audit >/dev/null 2>&1 || true
  pip-audit || true
fi
if [ -f package.json ]; then
  if command -v npm >/dev/null; then npm audit || true; fi
fi

echo -e "\n== Generate checksums for dist/ (if present) =="
if [ -d dist ]; then
  (cd dist && (shasum -a 256 * || sha256sum * ) > checksums.txt) || true
  echo "checksums written to dist/checksums.txt"
fi

echo -e "\nDone. Review findings above."
