#!/usr/bin/env bash
# Rebuild and restart the self-host stack from the current checkout.
#
# Usage (on the server, inside the multica directory):
#   ./scripts/selfhost-rebuild.sh                 # official Go/npm proxies, 127.0.0.1 only
#   ./scripts/selfhost-rebuild.sh --china         # goproxy.cn + npmmirror (recommended in CN)
#   ./scripts/selfhost-rebuild.sh --china --lan   # also bind 0.0.0.0 for LAN/desktop clients
#   ./scripts/selfhost-rebuild.sh --china --lan --no-cache

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

china=0
lan=0
no_cache=0
for arg in "$@"; do
  case "$arg" in
    --china) china=1 ;;
    --lan) lan=1 ;;
    --no-cache) no_cache=1 ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f docker-compose.selfhost.yml ]]; then
  echo "error: missing docker-compose.selfhost.yml in $root" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "error: missing .env — copy from .env.example and configure before rebuilding" >&2
  exit 1
fi

# Never let macOS resource forks into the build context / migrate Glob.
find . \( -name '._*' -o -name '.DS_Store' \) -type f -delete 2>/dev/null || true

# Official compose binds 127.0.0.1 (safe behind a reverse proxy). LAN/desktop
# clients that hit the host IP directly need 0.0.0.0. Re-apply after every
# unpack — source overlays restore the upstream 127.0.0.1 bindings.
if [[ "$lan" -eq 1 ]]; then
  echo "==> publishing ports on 0.0.0.0 (LAN / desktop clients)"
  if grep -q '127\.0\.0\.1:\${' docker-compose.selfhost.yml; then
    sed -i.bak-lan \
      -e 's/"127\.0\.0\.1:\${BACKEND_PORT/"0.0.0.0:${BACKEND_PORT/g' \
      -e 's/"127\.0\.0\.1:\${FRONTEND_PORT/"0.0.0.0:${FRONTEND_PORT/g' \
      docker-compose.selfhost.yml
  elif grep -q '0\.0\.0\.0:\${' docker-compose.selfhost.yml; then
    echo "==> ports already bound to 0.0.0.0"
  else
    echo "warn: could not find expected port bind lines; check docker-compose.selfhost.yml" >&2
  fi
fi

compose=(docker compose -f docker-compose.selfhost.yml -f docker-compose.selfhost.build.yml)
if [[ "$china" -eq 1 ]]; then
  if [[ ! -f docker-compose.selfhost.build.china.yml ]]; then
    echo "error: missing docker-compose.selfhost.build.china.yml" >&2
    exit 1
  fi
  compose+=(-f docker-compose.selfhost.build.china.yml)
  echo "==> using China build mirrors (goproxy.cn + npmmirror)"
fi

export VERSION="${VERSION:-$(git describe --tags --match 'v[0-9]*' --always --dirty 2>/dev/null || echo dev)}"
export COMMIT="${COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}"
export DATE="${DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

echo "==> VERSION=$VERSION COMMIT=$COMMIT"
echo "==> building backend + frontend from local source"

build_args=(build)
if [[ "$no_cache" -eq 1 ]]; then
  build_args+=(--no-cache)
fi
"${compose[@]}" "${build_args[@]}"

echo "==> starting stack (volumes preserved — not running down -v)"
"${compose[@]}" up -d

echo "==> status"
"${compose[@]}" ps

echo
echo "==> tip: wait a few seconds, then:"
echo "    ${compose[*]} logs --tail=40 backend"
echo "    ss -lntp | grep -E \"8082|3002|\${PORT:-8080}|\${FRONTEND_PORT:-3000}\" || true"
echo "    curl -sS http://127.0.0.1:\${PORT:-8082}/api/config | head"
echo "    # From a LAN client machine, also curl http://<server-ip>:<port>/api/config"
echo "    # desktop.json must match; use --lan if clients connect by host IP"
