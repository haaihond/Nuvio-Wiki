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

When the service runs as a non-root account, keep mutable server data outside the
repository in a directory owned by that account:

```env
FILE_SEARCH_DATA_FILE=/var/lib/nuvio-ai/file-search.json
CACHE_DATA_FILE=/var/lib/nuvio-ai/cache.json
ADMIN_DATA_DB_FILE=/var/lib/nuvio-ai/admin-data.sqlite
METADATA_CACHE_DB_FILE=/var/lib/nuvio-ai/metadata-cache.sqlite
PROFILE_SHARE_DB_FILE=/var/lib/nuvio-ai/profile-shares.sqlite
```

Metadata enrichment is sent by the browser in concurrent 400-item batches. The
server accepts at most 1,000 items per request, applies high abuse-only limits
(300 requests/minute and 3,000/hour per IP), and schedules upstream calls below
TMDB's bulk-request ceiling. Results are stored in a WAL-mode SQLite cache capped
at 500,000 keys with expiry and short-lived negative caching. All of these
operational limits can be tuned with the variables documented in `.env.example`.

## Configuration profile share codes

Configuration profiles are immutable, non-secret setup plans stored in a
separate SQLite database. Public payloads use a strict allowlist of curated
add-on IDs and documented preferences. Raw Profile Transfer exports, configured
manifest URLs, tokens, API keys, passwords, and session data are never accepted.

```env
PROFILE_SHARE_DB_FILE=/var/lib/nuvio-ai/profile-shares.sqlite
PROFILE_SHARE_TTL_DAYS=365
PROFILE_SHARE_MAX_ENTRIES=100000
```

`POST /api/setup-profiles` creates an expiring short code and
`GET /api/setup-profiles/:code` resolves it. Creation and lookup are separately
rate-limited, responses are not cached, and recipients enter all required
credentials on their own device.

## Sync Bridge OAuth

Trakt and Simkl use confidential OAuth clients. Keep both client secrets only in
the server environment:

```env
TRAKT_CLIENT_ID=your-trakt-client-id
TRAKT_CLIENT_SECRET=your-trakt-client-secret
SIMKL_CLIENT_ID=your-simkl-client-id
SIMKL_CLIENT_SECRET=your-simkl-client-secret
ALLOWED_ORIGIN=https://nuvio.wiki
```

Create the Simkl app in [Simkl developer settings](https://simkl.com/settings/developer/)
and register the callback URI exactly as served, including scheme and path:

```text
https://nuvio.wiki/api/simkl/callback
```

Local development should register `http://localhost:3001/api/simkl/callback`
when the Express server is reached directly on its default port. OAuth state is
opaque, single-use, allowlisted to `ALLOWED_ORIGIN`, and held only in memory.
Restarting the server invalidates pending popup authorizations. Simkl access
tokens are long-lived and Simkl does not issue a refresh token; reconnect after
revocation or a `401` response.

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
Admin sessions remain in memory, so restarting the service safely logs out every
administrator. Anonymous request metrics, page votes, and Setup Doctor feedback
are stored in the WAL-mode SQLite database at `ADMIN_DATA_DB_FILE` and survive a
restart. Traffic storage is bounded to the newest 500,000 requests by default;
set `ADMIN_TRAFFIC_MAX_ENTRIES` to tune that limit. Keep the database in a
writable, backed-up server data directory. Traffic records contain route
templates and a keyed anonymous digest, never raw IP addresses, user agents, or
query strings. In production, keep the secret in a root-readable environment
file outside this repository, serve the site over HTTPS, and include the admin
proxy location described below.

## Production Deployment (Nginx Reverse Proxy)

When running the wiki website and AI server in production behind Nginx, you must route requests starting with `/api/ai`, `/api/trakt`, `/api/simkl`, `/api/setup-profiles`, and `/api/admin`, plus `/api/status`, `/api/setup-doctor/feedback`, and `/api/page-feedback`, to the Express backend (default port `3001`). Clean `/setup/CODE` URLs must also redirect to the built `/setup/` receiver with the code preserved in its query string.

An example Nginx location block configuration is provided in [wiki-api.location.conf](../deploy/nginx/wiki-api.location.conf). Include these configuration blocks inside your site's HTTPS server block to enable the AI assistant, Sync Bridge OAuth, live status page, and anonymous feedback.
