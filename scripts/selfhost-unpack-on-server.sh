#!/usr/bin/env bash
# Unpack a tarball produced by scripts/selfhost-pack-local.sh into the current
# self-host checkout, preserving .env and cleaning macOS junk files.
#
# Usage (on the server, inside the existing multica directory):
#   ./scripts/selfhost-unpack-on-server.sh /tmp/multica-deploy-xxxx.tar.gz

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <multica-deploy.tar.gz>" >&2
  exit 1
fi

tarball="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
if [[ ! -f "$tarball" ]]; then
  echo "error: tarball not found: $1" >&2
  exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if [[ ! -f docker-compose.selfhost.yml ]]; then
  echo "error: run this from a Multica checkout (missing docker-compose.selfhost.yml)" >&2
  exit 1
fi

echo "==> deploy dir: $root"
echo "==> tarball:    $tarball"

# Preserve secrets / local config across the overlay.
backup_dir="$(mktemp -d /tmp/multica-env-backup.XXXXXX)"
cleanup() { rm -rf "$backup_dir"; }
trap cleanup EXIT

for f in .env .env.local; do
  if [[ -f "$f" ]]; then
    cp -a "$f" "$backup_dir/"
    echo "==> backed up $f"
  fi
done

tmpdir="$(mktemp -d /tmp/multica-unpack.XXXXXX)"
tar -xzf "$tarball" -C "$tmpdir"

# Support both `tar ... multica/...` (pack script) and flat archives.
src="$tmpdir/multica"
if [[ ! -d "$src" ]]; then
  src="$tmpdir"
fi
if [[ ! -f "$src/docker-compose.selfhost.yml" ]]; then
  echo "error: archive does not look like a Multica tree" >&2
  rm -rf "$tmpdir"
  exit 1
fi

echo "==> overlaying source (keeping .env)"
# Prefer rsync when available; fall back to tar pipe (no --delete).
if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    --exclude '.env' \
    --exclude '.env.*' \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude 'apps/desktop/dist' \
    --exclude 'apps/desktop/out' \
    "$src"/ "$root"/
else
  echo "==> rsync not found; using tar overlay"
  tar -C "$src" \
    --exclude='.env' \
    --exclude='.env.*' \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.next' \
    -cf - . | tar -C "$root" -xf -
fi

rm -rf "$tmpdir"

for f in .env .env.local; do
  if [[ -f "$backup_dir/$f" ]]; then
    cp -a "$backup_dir/$f" "$root/$f"
    echo "==> restored $f"
  fi
done

# Belt-and-braces: strip AppleDouble files even if an old archive included them.
echo "==> removing macOS AppleDouble / .DS_Store junk"
find "$root" \( -name '._*' -o -name '.DS_Store' \) -type f -print -delete | sed 's/^/  removed /' || true

echo "==> unpack complete"
echo "    next: ./scripts/selfhost-rebuild.sh --china"
