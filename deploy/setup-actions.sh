#!/usr/bin/env bash
# One-time setup for the existing Debian 12/13 x86_64, Node 24 installation.
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run with sudo bash setup-actions.sh'; exit 1; }
[[ $(uname -m) == x86_64 ]] || { echo 'This workflow packages x86_64 binaries.'; exit 1; }
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || exit 1
test -f /etc/nuvio-wiki/server.env
test -f /opt/nuvio-wiki/docs/.vitepress/dist/index.html
for setting in FILE_SEARCH_DATA_FILE CACHE_DATA_FILE ADMIN_DATA_DB_FILE METADATA_CACHE_DB_FILE PROFILE_SHARE_DB_FILE; do
  grep -q "^${setting}=/var/lib/nuvio-ai/" /etc/nuvio-wiki/server.env || {
    echo "Set $setting to a file under /var/lib/nuvio-ai before continuing."
    exit 1
  }
done

apt-get update
apt-get install -y openssh-client curl sudo
id nuvio-deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash nuvio-deploy
install -d -o nuvio-deploy -g nuvio-deploy -m 755 /opt/nuvio-deploy /opt/nuvio-deploy/releases

# Keep the existing Nginx root and systemd WorkingDirectory valid.
if [[ ! -L /opt/nuvio-wiki ]]; then
  test ! -e /opt/nuvio-deploy/releases/initial
  test ! -e /opt/nuvio-deploy/current
  ln -s /opt/nuvio-deploy/releases/initial /opt/nuvio-deploy/current
  mv /opt/nuvio-wiki /opt/nuvio-deploy/releases/initial
  ln -s /opt/nuvio-deploy/current /opt/nuvio-wiki
else
  [[ $(readlink /opt/nuvio-wiki) == /opt/nuvio-deploy/current ]] || exit 1
fi

printf '%s\n' 'nuvio-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart nuvio-ai' > /etc/sudoers.d/nuvio-deploy
chmod 440 /etc/sudoers.d/nuvio-deploy
visudo -cf /etc/sudoers.d/nuvio-deploy

install -d -o nuvio-deploy -g nuvio-deploy -m 700 /home/nuvio-deploy/.ssh
if [[ ! -f /home/nuvio-deploy/.ssh/github-actions ]]; then
  sudo -u nuvio-deploy ssh-keygen -t ed25519 -N '' \
    -C nuvio-github-actions -f /home/nuvio-deploy/.ssh/github-actions
fi
key=$(cat /home/nuvio-deploy/.ssh/github-actions.pub)
touch /home/nuvio-deploy/.ssh/authorized_keys
if ! grep -Fq "$key" /home/nuvio-deploy/.ssh/authorized_keys; then
  printf 'restrict %s\n' "$key" >> /home/nuvio-deploy/.ssh/authorized_keys
fi
chown nuvio-deploy:nuvio-deploy /home/nuvio-deploy/.ssh/authorized_keys
chmod 600 /home/nuvio-deploy/.ssh/authorized_keys

systemctl restart nuvio-ai
curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 2 \
  http://127.0.0.1:3001/api/ai/health
printf '\nSetup complete. Follow deploy/GITHUB_ACTIONS.md to add the two GitHub secrets.\n'
