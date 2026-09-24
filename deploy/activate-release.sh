#!/usr/bin/env bash
# Runs as the unprivileged nuvio-deploy user; all compilation happened in CI.
set -euo pipefail

release_id=${1:?Expected release ID}
[[ "$release_id" =~ ^[0-9a-f]{40}-[0-9]+-[0-9]+$ ]] || exit 1
root=${NUVIO_DEPLOY_ROOT:-/opt/nuvio-deploy}
archive="$HOME/upload-$release_id.tar.gz"
release="$root/releases/$release_id"
exec 9> "$root/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.'; exit 1; }

test -L "$root/current"
previous=$(readlink -f "$root/current")
test -d "$previous"
test ! -e "$release"
mkdir "$release"
switched=false

switch_to() {
  ln -s "$1" "$root/current.next"
  mv -Tf "$root/current.next" "$root/current"
}

finish() {
  status=$?
  trap - EXIT
  if (( status != 0 )) && "$switched"; then
    echo 'Deployment failed; restoring previous release.' >&2
    switch_to "$previous"
    sudo -n /usr/bin/systemctl restart nuvio-ai
  fi
  rm -f "$archive" "$root/current.next"
  exit "$status"
}
trap finish EXIT

tar -xzf "$archive" --no-same-owner -C "$release"
test -f "$release/docs/.vitepress/dist/index.html"
test -f "$release/server/index.js"
test ! -e "$release/server/.env"
chmod -R u=rwX,go=rX "$release"

# Check native SQLite compatibility before touching the running service.
test "$(node -p 'process.versions.node.split(".")[0]')" = 24
cd "$release/server"
node --input-type=module -e 'import Database from "better-sqlite3"; const db = new Database(":memory:"); db.prepare("SELECT 1").get(); db.close()'

# Keep old hashed assets working for browsers with the previous HTML cached.
if [[ -d "$previous/docs/.vitepress/dist/assets" ]]; then
  cp -an "$previous/docs/.vitepress/dist/assets/." "$release/docs/.vitepress/dist/assets/"
fi

switch_to "$release"
switched=true
sudo -n /usr/bin/systemctl restart nuvio-ai
curl --fail --silent --show-error --max-time 10 \
  --retry 10 --retry-connrefused --retry-delay 2 \
  http://127.0.0.1:3001/api/ai/health |
  node -e 'let s=""; process.stdin.on("data", c => s+=c); process.stdin.on("end", () => { if (JSON.parse(s).status !== "ok") process.exit(1) })'
curl --fail --silent --show-error --max-time 15 \
  --resolve nuvio.wiki:443:127.0.0.1 https://nuvio.wiki/ -o /dev/null

echo "Deployed $release_id"
# Retain the current and previous release; never delete unrelated directories.
for candidate in "$root"/releases/*; do
  [[ -d "$candidate" && ! -L "$candidate" ]] || continue
  [[ "$candidate" != "$release" && "$candidate" != "$previous" ]] || continue
  name=${candidate##*/}
  if [[ "$name" =~ ^[0-9a-f]{40}-[0-9]+-[0-9]+$ ]]; then
    rm -rf -- "$candidate"
  fi
done
