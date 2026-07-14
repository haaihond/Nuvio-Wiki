import Database from 'better-sqlite3';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync
} from 'node:fs';
import { dirname, resolve } from 'node:path';

export const DEFAULT_METADATA_CACHE_MAX_ENTRIES = 500_000;
export const DEFAULT_METADATA_CACHE_SUCCESS_TTL_MS = 180 * 24 * 60 * 60_000;
export const DEFAULT_METADATA_CACHE_FAILURE_TTL_MS = 6 * 60 * 60_000;
const MAX_LEGACY_CACHE_BYTES = 64 * 1024 * 1024;
const SQLITE_IN_CHUNK_SIZE = 500;

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function fileBytes(path) {
  try {
    return existsSync(path) ? statSync(path).size : 0;
  } catch {
    return 0;
  }
}

/**
 * A bounded, transactional metadata cache. SQLite avoids parsing and rewriting
 * the entire cache for every enrichment batch while WAL mode keeps reads fast.
 */
export function createMetadataCache({
  file,
  legacyFile = null,
  maxEntries = DEFAULT_METADATA_CACHE_MAX_ENTRIES,
  successTtlMs = DEFAULT_METADATA_CACHE_SUCCESS_TTL_MS,
  failureTtlMs = DEFAULT_METADATA_CACHE_FAILURE_TTL_MS,
  now = Date.now
} = {}) {
  if (!file) throw new Error('Metadata cache file is required.');

  const databaseFile = file === ':memory:' ? file : resolve(file);
  const entryLimit = positiveInteger(maxEntries, DEFAULT_METADATA_CACHE_MAX_ENTRIES);
  const successTtl = positiveInteger(successTtlMs, DEFAULT_METADATA_CACHE_SUCCESS_TTL_MS);
  const failureTtl = positiveInteger(failureTtlMs, DEFAULT_METADATA_CACHE_FAILURE_TTL_MS);

  if (databaseFile !== ':memory:') mkdirSync(dirname(databaseFile), { recursive: true });

  const db = new Database(databaseFile);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('temp_store = MEMORY');
  db.exec(`
    CREATE TABLE IF NOT EXISTS metadata_cache (
      cache_key TEXT PRIMARY KEY,
      poster_url TEXT,
      release_date TEXT,
      source TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS metadata_cache_expiry
      ON metadata_cache (expires_at);
    CREATE INDEX IF NOT EXISTS metadata_cache_updated
      ON metadata_cache (updated_at);
    CREATE TABLE IF NOT EXISTS metadata_cache_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) WITHOUT ROWID;
  `);

  const selectStatements = new Map();
  const selectCount = db.prepare('SELECT COUNT(*) AS count FROM metadata_cache');
  const deleteExpired = db.prepare('DELETE FROM metadata_cache WHERE expires_at <= ?');
  const deleteOldest = db.prepare(`
    DELETE FROM metadata_cache
    WHERE cache_key IN (
      SELECT cache_key FROM metadata_cache ORDER BY updated_at ASC LIMIT ?
    )
  `);
  const upsert = db.prepare(`
    INSERT INTO metadata_cache (
      cache_key, poster_url, release_date, source, updated_at, expires_at
    ) VALUES (
      @cacheKey, @posterUrl, @releaseDate, @source, @updatedAt, @expiresAt
    )
    ON CONFLICT(cache_key) DO UPDATE SET
      poster_url = excluded.poster_url,
      release_date = excluded.release_date,
      source = excluded.source,
      updated_at = excluded.updated_at,
      expires_at = excluded.expires_at
  `);
  const getMeta = db.prepare('SELECT value FROM metadata_cache_meta WHERE key = ?');
  const setMeta = db.prepare(`
    INSERT INTO metadata_cache_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  function prune(timestamp = now()) {
    deleteExpired.run(timestamp);
    const count = selectCount.get().count;
    if (count > entryLimit) deleteOldest.run(count - entryLimit);
  }

  const writeEntries = db.transaction((entries, timestamp) => {
    for (const [cacheKey, value] of entries) {
      if (typeof cacheKey !== 'string' || !cacheKey || !value) continue;
      const source = ['tmdb', 'cinemeta', 'failed'].includes(value.source)
        ? value.source
        : 'failed';
      const updatedAt = Number.isFinite(value.updatedAt) ? value.updatedAt : timestamp;
      const ttl = source === 'failed' ? failureTtl : successTtl;
      upsert.run({
        cacheKey,
        posterUrl: typeof value.posterUrl === 'string' ? value.posterUrl : null,
        releaseDate: typeof value.releaseDate === 'string' ? value.releaseDate : null,
        source,
        updatedAt,
        expiresAt: updatedAt + ttl
      });
    }
    prune(timestamp);
  });

  function setMany(entries) {
    const normalized = entries instanceof Map ? entries : new Map(entries || []);
    if (normalized.size === 0) return;
    writeEntries(normalized, now());
  }

  function getMany(keys) {
    const uniqueKeys = [...new Set(keys)].filter(key => typeof key === 'string' && key);
    const values = new Map();
    const timestamp = now();

    for (let offset = 0; offset < uniqueKeys.length; offset += SQLITE_IN_CHUNK_SIZE) {
      const chunk = uniqueKeys.slice(offset, offset + SQLITE_IN_CHUNK_SIZE);
      let statement = selectStatements.get(chunk.length);
      if (!statement) {
        const placeholders = Array.from({ length: chunk.length }, () => '?').join(',');
        statement = db.prepare(`
          SELECT cache_key, poster_url, release_date, source, updated_at
          FROM metadata_cache
          WHERE expires_at > ? AND cache_key IN (${placeholders})
        `);
        selectStatements.set(chunk.length, statement);
      }

      for (const row of statement.all(timestamp, ...chunk)) {
        values.set(row.cache_key, {
          posterUrl: row.poster_url,
          releaseDate: row.release_date,
          source: row.source,
          updatedAt: row.updated_at
        });
      }
    }

    return values;
  }

  function stats() {
    const entries = selectCount.get().count;
    const bytes = databaseFile === ':memory:'
      ? 0
      : fileBytes(databaseFile) + fileBytes(`${databaseFile}-wal`) + fileBytes(`${databaseFile}-shm`);
    return { metadataEntries: entries, metadataCacheBytes: bytes };
  }

  function migrateLegacyJson() {
    if (!legacyFile || getMeta.get('legacy_json_migration')) return 0;

    let imported = 0;
    try {
      if (existsSync(legacyFile) && statSync(legacyFile).size <= MAX_LEGACY_CACHE_BYTES) {
        const legacy = JSON.parse(readFileSync(legacyFile, 'utf8'));
        const recentEntries = Object.entries(legacy)
          .filter(([key, value]) => typeof key === 'string' && value && typeof value === 'object')
          .sort(([, left], [, right]) => (right.updatedAt || 0) - (left.updatedAt || 0))
          .slice(0, entryLimit);
        setMany(recentEntries);
        imported = recentEntries.length;
      }
    } catch (error) {
      console.warn('Metadata cache JSON migration skipped:', error.message);
    } finally {
      setMeta.run('legacy_json_migration', new Date(now()).toISOString());
    }
    return imported;
  }

  prune();
  const migratedEntries = migrateLegacyJson();

  return {
    getMany,
    setMany,
    prune,
    stats,
    close: () => db.close(),
    maxEntries: entryLimit,
    migratedEntries
  };
}
