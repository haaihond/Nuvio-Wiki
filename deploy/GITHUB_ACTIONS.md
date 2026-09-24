# Deploy from GitHub Actions

The CI workflow tests the backend, builds VitePress and its Mermaid diagrams,
and packages the backend's production dependencies on GitHub. The Debian VPS
only extracts the release, switches a symlink, and restarts `nuvio-ai`.
Nothing is compiled or installed with npm on the VPS during deployment.

This targets the existing **Debian 12/13 x86_64 server with Node 24**. CI uses
Ubuntu 22.04 (older glibc), and tests the packaged native SQLite module again on
the VPS before switching releases. Changing server architecture or Node major
requires updating the build first.

## 1. Push the workflow and deployment scripts

Commit and push `.github/workflows/ci.yml` and the files under `deploy/` to
`main`, along with the website/backend changes you want published. Only pushed
commits are deployed; uncommitted local changes are not included. Deployment
remains disabled until step 4. Pull requests only test and build.

## 2. One-time server setup

In Windows PowerShell, upload the setup script:

```powershell
cd C:\Users\mikap\Documents\Nuvio-Wiki
scp .\deploy\setup-actions.sh mikap@34.1.228.134:setup-actions.sh
```

In your server's SSH terminal:

```bash
sed -i 's/\r$//' ~/setup-actions.sh
sudo bash ~/setup-actions.sh
```

The script preserves the existing installation at
`/opt/nuvio-deploy/releases/initial`. `/opt/nuvio-wiki` becomes a stable symlink
through `/opt/nuvio-deploy/current`, so the existing Nginx and systemd paths
continue working. A dedicated `nuvio-deploy` user can upload releases and restart
only the `nuvio-ai` service through sudo. Setup briefly restarts the backend.

Existing secrets stay in `/etc/nuvio-wiki/server.env`; databases and AI index
state stay in `/var/lib/nuvio-ai`. The script verifies those state paths before
moving anything. The deployment user cannot read the root-owned environment
file directly; deployed backend code still runs with the application's secrets.

## 3. Add two repository secrets

Open [repository Actions secrets](https://github.com/haaihond/Nuvio-Wiki/settings/secrets/actions)
and use **New repository secret** for each entry below.

**DEPLOY_SSH_KEY**: run this on the server and copy the entire output, including
the BEGIN/END lines, into the GitHub secret. Do not paste it into chat or commit it.

```bash
sudo cat /home/nuvio-deploy/.ssh/github-actions
```

**DEPLOY_KNOWN_HOSTS**: copy the output of this server command. This takes the
host's key directly from its configuration, rather than trusting an unverified
network key scan:

```bash
sudo awk '{print "34.1.228.134 " $1 " " $2}' /etc/ssh/ssh_host_ed25519_key.pub
```

No Gemini or other application API keys belong in GitHub for this workflow.
The workflow uses SSH on port 22, which must remain reachable from GitHub-hosted
runners in both Google Cloud and UFW. The generated SSH key is a dedicated
deployment credential; its public key is installed with forwarding disabled.

## 4. Enable and run

In the repository's **Settings → Secrets and variables → Actions → Variables**,
add a **repository variable** named `DEPLOY_ENABLED` with value `true`.
Optional: set `DEPLOY_HOST` if the server IP changes; also replace
`DEPLOY_KNOWN_HOSTS` with the same server key prefixed by the new IP.

Open **Actions → CI → Run workflow**, choose `main`, and run it. After that,
successful builds of pushes to `main` deploy automatically. Only deployment
jobs use the `production` environment and its secrets; they run one at a time
without interrupting a deployment already in progress. You can configure
environment approvals in GitHub if desired.

## Checks, rollback, and maintenance

The release must pass backend tests and the site build/link check on GitHub.
On the server, activation checks SQLite compatibility, restarts the backend,
and checks its health and the local HTTPS website. If activation fails after
switching, it restores the previous release and restarts the backend again.
This health check does not exercise paid AI calls or external OAuth providers.

The current and previous automated release are retained; older automated
releases are deleted. The original `initial` backup is preserved. Old hashed
site assets are carried forward for browsers with cached HTML, so monitor disk
usage over time. Rollback restores code, not database contents; incompatible
database migrations need a separate backup/migration plan.

Nginx configuration and certificates are managed separately. A commit changing
Nginx templates does not apply those templates to `/etc/nginx` automatically.
Apply such changes manually, then run `sudo nginx -t` before reloading Nginx.
Normal website and backend updates need no Nginx reload.

To stop future automatic deployments, set `DEPLOY_ENABLED` to `false`.
If a deployment fails, open its failed Actions step for the error and inspect:

```bash
sudo journalctl -u nuvio-ai -n 80 --no-pager
readlink -f /opt/nuvio-deploy/current
```
