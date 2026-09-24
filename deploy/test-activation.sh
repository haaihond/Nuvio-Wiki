#!/usr/bin/env bash
# Linux integration checks with real archives/symlinks and mocked services.
set -euo pipefail
script=$(realpath "$(dirname "$0")/activate-release.sh")
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
real_node=$(command -v node)
export REAL_NODE="$real_node"
mkdir "$scratch/bin"
cat > "$scratch/bin/node" <<'EOF'
#!/usr/bin/env bash
if [[ ${1:-} == --input-type=module ]]; then
  exit "${MOCK_SQLITE_FAIL:-0}"
fi
exec "$REAL_NODE" "$@"
EOF
cat > "$scratch/bin/sudo" <<'EOF'
#!/usr/bin/env bash
printf 'restart\n' >> "$HOME/restarts"
EOF
cat > "$scratch/bin/curl" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *api/ai/health* ]]; then
  [[ ${MOCK_HEALTH_FAIL:-0} == 0 ]] || exit 22
  printf '{"status":"ok"}'
else
  exit "${MOCK_WEBSITE_FAIL:-0}"
fi
EOF
chmod +x "$scratch/bin/"*
export PATH="$scratch/bin:$PATH"
id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1-1

run_case() {
  local name=$1 sqlite=$2 health=$3 website=$4 expected=$5 restarts=$6
  export HOME="$scratch/$name/home"
  export NUVIO_DEPLOY_ROOT="$scratch/$name/root"
  export MOCK_SQLITE_FAIL=$sqlite MOCK_HEALTH_FAIL=$health MOCK_WEBSITE_FAIL=$website
  mkdir -p "$HOME" "$NUVIO_DEPLOY_ROOT/releases/initial/docs/.vitepress/dist/assets"
  printf old > "$NUVIO_DEPLOY_ROOT/releases/initial/docs/.vitepress/dist/assets/old.js"
  ln -s "$NUVIO_DEPLOY_ROOT/releases/initial" "$NUVIO_DEPLOY_ROOT/current"
  local bundle="$scratch/$name/bundle"
  mkdir -p "$bundle/docs/.vitepress/dist/assets" "$bundle/server"
  printf page > "$bundle/docs/.vitepress/dist/index.html"
  printf app > "$bundle/server/index.js"
  tar -czf "$HOME/upload-$id.tar.gz" -C "$bundle" .
  local result=0
  bash "$script" "$id" || result=$?
  if [[ $expected == success ]]; then
    [[ $result == 0 ]]
    [[ $(readlink -f "$NUVIO_DEPLOY_ROOT/current") == "$NUVIO_DEPLOY_ROOT/releases/$id" ]]
    test -f "$NUVIO_DEPLOY_ROOT/current/docs/.vitepress/dist/assets/old.js"
  else
    [[ $result != 0 ]]
    [[ $(readlink -f "$NUVIO_DEPLOY_ROOT/current") == "$NUVIO_DEPLOY_ROOT/releases/initial" ]]
  fi
  local actual=0
  if [[ -f "$HOME/restarts" ]]; then actual=$(wc -l < "$HOME/restarts"); fi
  [[ $actual == "$restarts" ]]
  test ! -e "$HOME/upload-$id.tar.gz"
  echo "PASS: $name"
}

run_case successful-release 0 0 0 success 1
run_case incompatible-native-module 1 0 0 failure 0
run_case failed-backend-health 0 1 0 failure 2
run_case failed-website-health 0 0 22 failure 2
