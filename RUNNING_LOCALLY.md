# Run Nuvio Wiki locally

This guide covers local use and development on your own computer. It does not deploy or expose the wiki as a public website.

There are two ways to run the project:

| Mode | Starts | Use it when |
| --- | --- | --- |
| Documentation only | VitePress website | You are writing or reviewing documentation |
| Complete local environment | VitePress website and Node.js backend | You are working on AI search, status, Sync Bridge, profiles, feedback, or other interactive tools |

## 1. Install the prerequisites

Install:

- A current Node.js LTS release, including npm
- Git

Verify both from a terminal:

```bash
node --version
npm --version
git --version
```

## 2. Download the project

```bash
git clone https://github.com/haaihond/Nuvio-Wiki.git
cd Nuvio-Wiki
```

If you already have the repository, open a terminal in its root directory instead.

## 3. Choose what to run

### Documentation only

This is the shortest path. It does not require API keys or the backend.

#### Windows launcher

Double-click `Start Nuvio Wiki.cmd` in the project folder. The launcher:

1. Checks that Node.js is installed.
2. Installs the website dependencies when needed.
3. Starts VitePress on port `5173`.
4. Opens the wiki in your default browser.

The local address is [http://localhost:5173](http://localhost:5173).

#### Terminal

On Windows, macOS, or Linux:

```bash
npm install
npm run docs:dev
```

Open the local address printed in the terminal. VitePress refreshes the page when documentation or theme files change.

You are finished if you only need the documentation website. Press `Ctrl+C` in the terminal to stop it.

### Complete local environment

Use this mode when interactive features need to reach the local Node.js backend.

Install both sets of dependencies:

```bash
npm install
npm --prefix server install
```

Create the backend environment file.

On Windows PowerShell:

```powershell
Copy-Item server/.env.example server/.env
```

On macOS or Linux:

```bash
cp server/.env.example server/.env
```

Open `server/.env` and replace the placeholder `GEMINI_API_KEY`. Keep these local defaults unchanged:

```dotenv
PORT=3001
ALLOWED_ORIGIN=http://localhost:5173
KNOWLEDGE_MODE=file-search
```

The Gemini key is required because the backend exits when it is missing. Trakt, Simkl, TMDB, and the private admin secret are optional; configure them only when working on those features. Never commit `server/.env`.

Start the website and backend together from the repository root:

```bash
npm run dev
```

This runs:

- VitePress at [http://localhost:5173](http://localhost:5173)
- The Node.js backend at [http://localhost:3001](http://localhost:3001)

VitePress forwards its configured backend API requests to port `3001`. The first AI request can take longer while File Search prepares the documentation index.

Press `Ctrl+C` once to stop both processes.

## 4. Verify the local environment

For documentation-only mode:

- Open [http://localhost:5173](http://localhost:5173).
- Open several pages and refresh one directly.
- Edit a Markdown file in `docs/` and confirm that the browser updates.

For the complete environment, also open:

```text
http://localhost:3001/api/ai/health
http://localhost:5173/api/status
```

The first address verifies the backend directly. The second verifies that the website's development proxy can reach it.

## Common commands

Run these from the repository root unless noted otherwise.

| Command | Purpose |
| --- | --- |
| `npm run docs:dev` | Start only the documentation website |
| `npm run server:dev` | Start only the backend with file watching |
| `npm run dev` | Start the website and backend together |
| `npm run docs:build` | Build the production website and validate internal links |
| `npm run docs:preview` | Preview the most recent production build locally |
| `npm --prefix server test` | Run the backend tests |

Additional focused tests are available in the root `package.json` for AI Markdown, the badge editor, Media Bridge, configuration profiles, and profile transfer.

## Troubleshooting

### `node` or `npm` is not recognized

Install a current Node.js LTS release, close and reopen the terminal, then run:

```bash
node --version
npm --version
```

### A package cannot be found

Make sure dependencies were installed for the part you are running:

```bash
npm install
npm --prefix server install
```

The website and backend have separate package files and separate `node_modules` directories.

### The backend stops immediately

Read the backend error in the terminal. The most common cause is a missing or unchanged `GEMINI_API_KEY` in `server/.env`.

You can also start the backend by itself for clearer output:

```bash
npm run server:dev
```

### The website loads but an interactive tool fails

Confirm that you used `npm run dev`, not `npm run docs:dev`, and open the backend health address:

```text
http://localhost:3001/api/ai/health
```

Also keep the backend on port `3001`. The VitePress development proxy is configured for that port.

### Port `5173` or `3001` is already in use

Stop the other process using that port, then run the start command again. The Windows launcher deliberately requires port `5173` so it does not silently open a different address. In complete mode, keep VitePress on `5173` because `ALLOWED_ORIGIN` uses that exact origin.

### A documentation change does not appear

Check that the file is inside `docs/`, save it, and inspect the VitePress terminal for a Markdown or build error. Restart `npm run docs:dev` if the file watcher was interrupted.

## Before submitting changes

Build the documentation before opening a pull request:

```bash
npm run docs:build
```

This renders the site and checks its internal links. Run the focused test commands relevant to any application code you changed.
