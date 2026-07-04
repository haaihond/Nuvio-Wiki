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
```

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

## Production Deployment (Nginx Reverse Proxy)

When running the wiki website and AI server in production behind Nginx, you must route requests starting with `/api/ai` and `/api/trakt` to the Express backend (default port `3001`).

An example Nginx location block configuration is provided in [wiki-api.location.conf](../deploy/nginx/wiki-api.location.conf). Include these configuration blocks inside your site's HTTPS server block to enable the AI assistant and Trakt bridge to work correctly.

