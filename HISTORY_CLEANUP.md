# History Cleanup Guide

If you discover that secrets or large binaries were committed in the past, use one of the following tools to rewrite history and remove them from all branches and tags.

Important: After rewriting history, force-push all affected branches and ask collaborators to reclone.

## Using git filter-repo (recommended)

Install:
- https://github.com/newren/git-filter-repo

Examples (replace paths with real ones you want to purge):

- Remove a file from entire history:
  git filter-repo --path README.secret.txt --invert-paths

- Remove multiple patterns (example: dist/ and releases/):
  git filter-repo --path dist/ --path video-merger-gui/dist/ --path video-splitter-gui/dist/ --path releases/ --invert-paths

- Remove files matching extension (e.g., .pem, .p12):
  git filter-repo --path-glob "*.pem" --path-glob "*.p12" --invert-paths

## Using BFG Repo-Cleaner

Install:
- https://rtyley.github.io/bfg-repo-cleaner/

Examples:

- Remove all files bigger than 100MB:
  bfg --strip-blobs-bigger-than 100M

- Remove private keys:
  bfg --delete-files "*.pem" "*.p12" "*.pfx" "*.keystore"

- Remove folders (example: dist and releases):
  bfg --delete-folders dist,releases --no-blob-protection

After running filter-repo or BFG:
- Run: git reflog expire --expire=now --all && git gc --prune=now --aggressive
- Force push: git push --force --all; git push --force --tags

## Notes for this repository
- No secrets detected in current HEAD.
- Built artifacts were present in the repository. We recommend purging historical copies of `dist/` and `releases/` if repository size becomes a concern.
