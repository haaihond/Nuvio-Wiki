# Nuvio Wiki AI server

## Knowledge backend

The server uses Gemini File Search by default. File Search keeps the wiki index
without a token-hour storage charge and retrieves only relevant documentation
for each question.

Create or check the index manually:

```bash
npm run refresh-file-search
```

The server also checks lazily on the first request after 48 hours. It hashes the
English wiki and only re-indexes when content changed. New stores are fully
indexed before the server switches to them; the replaced store is then deleted.

When the service runs as a non-root account, keep mutable metadata outside the
repository in a directory owned by that account:

```env
FILE_SEARCH_DATA_FILE=/var/lib/nuvio-ai/file-search.json
CACHE_DATA_FILE=/var/lib/nuvio-ai/cache.json
METADATA_CACHE_DB_FILE=/var/lib/nuvio-ai/metadata-cache.sqlite
```

Metadata enrichment is sent by the browser in concurrent 400-item batches. The
server accepts at most 1,000 items per request, applies high abuse-only limits
(300 requests/minute and 3,000/hour per IP), and schedules upstream calls below
TMDB's bulk-request ceiling. Results are stored in a WAL-mode SQLite cache capped
at 500,000 keys with expiry and short-lived negative caching. All of these
operational limits can be tuned with the variables documented in `.env.example`.

## Roll back to explicit context caching

The previous cache implementation remains intact. Set this environment variable
and restart the server:

```env
KNOWLEDGE_MODE=cache
```

Then optionally prepare the cache immediately:

```bash
npm run refresh-cache
```

To switch back, set `KNOWLEDGE_MODE=file-search` and restart. The active backend
and resource name are visible at `GET /api/ai/health`.

## Private admin dashboard

The wiki includes an unlisted operations dashboard. It has no public route or
navigation entry. To enable it, set a strong, server-only unlock phrase:

```env
ADMIN_DASHBOARD_SECRET=nuvio-admin:REPLACE_WITH_A_STRONG_RANDOM_SECRET
```

The complete value must start with `nuvio-admin:` and its suffix must contain
at least 43 high-entropy base64url characters from at least three character
classes. From the `server` directory, generate a validated value with Node:

```bash
node --input-type=module -e "import { generateAdminSecret } from './admin.js'; console.log(generateAdminSecret())"
```

Restart the server, open **Search Docs**, and type the complete value. After a
short pause the search overlay becomes the dashboard. The phrase is checked
only by the Express server; it is never embedded in the VitePress bundle,
stored in browser storage, added to a URL, or sent to the AI assistant.

Successful unlocks receive a short-lived HttpOnly, SameSite session cookie.
Sessions and traffic history are held in memory, so restarting the service logs
out every administrator and resets dashboard history. In production, keep the
secret in a root-readable environment file outside this repository, serve the
site over HTTPS, and include the admin proxy location described below.

## Production Deployment (Nginx Reverse Proxy)

When running the wiki website and AI server in production behind Nginx, you must route requests starting with `/api/ai`, `/api/trakt`, and `/api/admin`, plus `/api/status` and `/api/setup-doctor/feedback`, to the Express backend (default port `3001`).

An example Nginx location block configuration is provided in [wiki-api.location.conf](../deploy/nginx/wiki-api.location.conf). Include these configuration blocks inside your site's HTTPS server block to enable the AI assistant, Trakt bridge, live status page, and Setup Doctor feedback.
