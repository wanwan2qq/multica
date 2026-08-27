#!/usr/bin/env bash
# Pack the current Multica checkout for offline / air-gapped self-host deploy.
#
# Prefer this over Finder/rsync of the whole tree: it avoids macOS AppleDouble
# files (._*), node_modules, and build artifacts that have broken migrations.
#
# Usage (on your laptop):
#   ./scripts/selfhost-pack-local.sh
#   ./scripts/selfhost-pack-local.sh /tmp/multica-deploy.tar.gz
#
# Then upload the tarball to the server (堡垒机 / scp / USB) and unpack with:
#   ./scripts/selfhost-unpack-on-server.sh /path/to/multica-deploy.tar.gz

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

out="${1:-$HOME/Desktop/multica-deploy-$(git rev-parse --short HEAD 2>/dev/null || echo manual).tar.gz}"
mkdir -p "$(dirname "$out")"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: not a git checkout; refusing to pack an arbitrary tree" >&2
  exit 1
fi

echo "==> packing HEAD $(git rev-parse --short HEAD) → $out"
# git archive only includes tracked files — no .env, no ._, no node_modules.
git archive --format=tar.gz --prefix=multica/ -o "$out" HEAD

echo "==> done ($(du -h "$out" | awk '{print $1}'))"
echo
echo "Next:"
echo "  1. Upload $out to the server (e.g. /tmp/)"
echo "  2. On the server:"
echo "       cd /home/worker/multica   # or your deploy dir"
echo "       ./scripts/selfhost-unpack-on-server.sh /tmp/$(basename "$out")"
echo "       ./scripts/selfhost-rebuild.sh --china"
