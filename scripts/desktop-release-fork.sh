#!/usr/bin/env bash
# Build Multica Desktop and publish installers to wanwan2qq/multica GitHub Releases.
#
# Usage:
#   export GH_TOKEN=ghp_...   # optional if `gh auth login` is active
#   ./scripts/desktop-release-fork.sh --mac --arm64 --publish always
#   ./scripts/desktop-release-fork.sh --mac --arm64 --mac --x64 --publish always
#   ./scripts/desktop-release-fork.sh --mac --arm64 --publish never   # local only
#
# Requires: pnpm, git, Node 22+, Go (for bundled CLI). Run from repo root.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP="$ROOT/apps/desktop"

if [[ "${GH_TOKEN:-}" == "" && "${GITHUB_TOKEN:-}" == "" ]]; then
  if command -v gh >/dev/null 2>&1 && gh auth token >/dev/null 2>&1; then
    GH_TOKEN="$(gh auth token)"
    echo "[desktop-release-fork] using GitHub token from gh auth login" >&2
  else
    echo "error: set GH_TOKEN or GITHUB_TOKEN (repo scope), or run gh auth login" >&2
    exit 1
  fi
fi

export GH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
export GITHUB_TOKEN="${GITHUB_TOKEN:-$GH_TOKEN}"

# Unsigned local / internal builds unless caller exports signing env vars.
export CSC_IDENTITY_AUTO_DISCOVERY="${CSC_IDENTITY_AUTO_DISCOVERY:-false}"

VERSION="$(cd "$ROOT" && git describe --tags --match 'v[0-9]*' --always --dirty)"
if [[ "$VERSION" == *-dirty ]]; then
  echo "warning: working tree is dirty; version will be $VERSION" >&2
  echo "         prefer a clean tree and a release tag (e.g. v0.4.28-kb2) for production." >&2
fi

echo "[desktop-release-fork] version → ${VERSION#v}"
echo "[desktop-release-fork] publish target → wanwan2qq/multica (see apps/desktop/electron-builder.yml)"

cd "$DESKTOP"
node scripts/package.mjs "$@"

echo "[desktop-release-fork] done. Check https://github.com/wanwan2qq/multica/releases"
