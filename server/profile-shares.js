import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const CONFIGURATION_PROFILE_FORMAT = 'nuvio-configuration-profile';
export const CONFIGURATION_PROFILE_VERSION = 1;

export const CONFIGURATION_PRESET_IDS = Object.freeze([
  'android-tv',
  'torbox',
  'usenet-first',
  'anime',
  'dutch',
  'low-bandwidth',
  '4k-remux',
  'family-friendly'
]);
export const TARGET_DEVICE_IDS = Object.freeze([
  'universal',
  'android-tv',
  'android-mobile',
  'ios',
  'desktop',
  'webos'
]);
export const CURATED_ADDON_IDS = Object.freeze([
  'cinemeta',
  'aiometadata',
  'anime-kitsu',
  'aiostreams',
  'torrentio',
  'comet',
  'mediafusion',
  'stremthru',
  'opensubtitles'
]);
export const SOURCE_PRIORITY_IDS = Object.freeze(['usenet', 'debrid', 'p2p', 'direct']);
export const RESOLUTION_IDS = Object.freeze(['2160p', '1080p', '720p', '480p']);
export const QUALITY_EXCLUDED_TAGS = Object.freeze([
  'cam',
  'telesync',
  'screener',
  '3d',
  'hdr',
  'dolby-vision',
  'remux',
  'dubbed',
  'x264',
  'x265',
  'av1',
  'low-seeders'
]);
export const LANGUAGE_IDS = Object.freeze([
  'original',
  'en',
  'nl',
  'ja',
  'de',
  'fr',
  'es',
  'it',
  'pt'
]);
export const SUBTITLE_VISIBILITY_IDS = Object.freeze([
  'automatic',
  'always',
  'forced-only',
  'off'
]);
export const PLAYER_ENGINE_IDS = Object.freeze(['auto', 'exoplayer', 'mpv', 'external']);
export const PLAYER_SELECTION_MODE_IDS = Object.freeze(['automatic', 'ask', 'first-match']);
export const ADDON_SUBTITLE_STARTUP_IDS = Object.freeze(['fast', 'preferred', 'all']);
export const BUFFER_PROFILE_IDS = Object.freeze([
  'low-memory',
  'balanced',
  'high-bitrate',
  'remux'
]);
export const HARDWARE_DECODING_IDS = Object.freeze([
  'auto',
  'hardware',
  'hardware-copy',
  'software'
]);
export const THEME_IDS = Object.freeze(['system', 'dark', 'light']);
export const HOME_LAYOUT_IDS = Object.freeze(['compact', 'balanced', 'cinematic', 'family']);
export const CREDENTIAL_SERVICE_IDS = Object.freeze([
  'torbox',
  'premiumize',
  'usenet-provider',
  'usenet-indexer',
  'tmdb',
  'tvdb',
  'anime-skip'
]);

export const PROFILE_SHARE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PROFILE_SHARE_CODE_LENGTH = 6;
export const DEFAULT_PROFILE_SHARE_TTL_MS = 365 * 24 * 60 * 60_000;
export const DEFAULT_PROFILE_SHARE_MAX_ENTRIES = 100_000;
export const MAX_CONFIGURATION_PROFILE_BYTES = 32 * 1024;
export const MAX_CONFIGURATION_PROFILE_DEPTH = 4;
export const MAX_CONFIGURATION_PROFILE_ITEMS = 256;

const MAX_CODE_ATTEMPTS = 32;
const MAX_STRING_LENGTH = 2_048;
const MAX_ARRAY_LENGTH = 64;
const MAX_OBJECT_KEYS = 32;
const SHARE_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const CONTROL_OR_BIDI_PATTERN = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const SAFE_PROFILE_NAME_PATTERN = /^[\p{L}\p{N} .,'’()+&_ -]+$/u;
const URL_PATTERN = /(?:[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\b(?:stremio|magnet):)/i;
const DOMAIN_PATTERN = /(?:^|\s)(?:[a-z0-9-]+\.)+[a-z]{2,63}(?:[\s/:?#]|$)/i;
const SECRET_ASSIGNMENT_PATTERN = /\b(?:api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret|secret|password|credential|authorization|cookie|session)\b\s*(?::|=|\bis\b)\s*\S+/i;
const SECRET_PREFIX_PATTERN = /^(?:bearer\s+|basic\s+|gh[pousr]_|glpat-|sk-|xox[baprs]-|AKIA[A-Z0-9]{12}|sb_(?:secret|publishable)_|(?:pk|rk)_(?:live|test)_|pat_|npm_|pypi-)/i;
const JWT_PATTERN = /^eyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}$/i;
const SECRET_FIELD_PARTS = Object.freeze([
  'apikey',
  'accesstoken',
  'refreshtoken',
  'authtoken',
  'token',
  'clientsecret',
  'privatekey',
  'password',
  'passwd',
  'authorization',
  'cookie',
  'sessionid',
  'session',
  'credential',
  'credentialvalue',
  'secret'
]);

const TOP_LEVEL_KEYS = Object.freeze([
  'format',
  'version',
  'name',
  'presetId',
  'targetDevice',
  'addons',
  'sourcePriority',
  'quality',
  'languages',
  'player',
  'interface',
  'credentials'
]);
const REQUIRED_TOP_LEVEL_KEYS = Object.freeze(TOP_LEVEL_KEYS.filter((key) => key !== 'presetId'));
const ADDON_KEYS = Object.freeze(['id', 'enabled']);
const QUALITY_KEYS = Object.freeze([
  'maxResolution',
  'maxSizeGb',
  'preferHdr',
  'allowDolbyVision',
  'allowRemux',
  'excludedTags'
]);
const LANGUAGE_KEYS = Object.freeze([
  'primaryAudio',
  'secondaryAudio',
  'primarySubtitle',
  'secondarySubtitle',
  'subtitleVisibility',
  'preferForced',
  'onlyPreferred'
]);
const PLAYER_KEYS = Object.freeze([
  'engine',
  'selectionMode',
  'autoPlayNext',
  'reuseLastLink',
  'addonSubtitleStartup',
  'bufferProfile',
  'tunneledPlayback',
  'hardwareDecoding',
  'useLibass'
]);
const INTERFACE_KEYS = Object.freeze([
  'theme',
  'homeLayout',
  'contentWarnings',
  'hideSpoilers',
  'autoplayTrailers'
]);

const ENUM_SETS = new Map([
  [CONFIGURATION_PRESET_IDS, new Set(CONFIGURATION_PRESET_IDS)],
  [TARGET_DEVICE_IDS, new Set(TARGET_DEVICE_IDS)],
  [CURATED_ADDON_IDS, new Set(CURATED_ADDON_IDS)],
  [SOURCE_PRIORITY_IDS, new Set(SOURCE_PRIORITY_IDS)],
  [RESOLUTION_IDS, new Set(RESOLUTION_IDS)],
  [QUALITY_EXCLUDED_TAGS, new Set(QUALITY_EXCLUDED_TAGS)],
  [LANGUAGE_IDS, new Set(LANGUAGE_IDS)],
  [SUBTITLE_VISIBILITY_IDS, new Set(SUBTITLE_VISIBILITY_IDS)],
  [PLAYER_ENGINE_IDS, new Set(PLAYER_ENGINE_IDS)],
  [PLAYER_SELECTION_MODE_IDS, new Set(PLAYER_SELECTION_MODE_IDS)],
  [ADDON_SUBTITLE_STARTUP_IDS, new Set(ADDON_SUBTITLE_STARTUP_IDS)],
  [BUFFER_PROFILE_IDS, new Set(BUFFER_PROFILE_IDS)],
  [HARDWARE_DECODING_IDS, new Set(HARDWARE_DECODING_IDS)],
  [THEME_IDS, new Set(THEME_IDS)],
  [HOME_LAYOUT_IDS, new Set(HOME_LAYOUT_IDS)],
  [CREDENTIAL_SERVICE_IDS, new Set(CREDENTIAL_SERVICE_IDS)]
]);

export class ProfileShareValidationError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = 'ProfileShareValidationError';
    this.code = 'INVALID_CONFIGURATION_PROFILE';
    this.path = path;
  }
}

function invalid(path, message) {
  throw new ProfileShareValidationError(path, message);
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasSecretLikeKey(key) {
  if (key === 'credentials') return false;
  const compact = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SECRET_FIELD_PARTS.some((part) => compact.includes(part));
}

function hasSecretLikeValue(value) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (URL_PATTERN.test(trimmed) || DOMAIN_PATTERN.test(trimmed)) return true;
  if (SECRET_ASSIGNMENT_PATTERN.test(trimmed)) return true;
  if (SECRET_PREFIX_PATTERN.test(trimmed) || JWT_PATTERN.test(trimmed)) return true;
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(trimmed)) return true;
  if (/^[a-f0-9]{32,}$/i.test(trimmed)) return true;
  if (/^[a-z0-9]{24,}$/i.test(trimmed) && /[a-z]/i.test(trimmed) && /\d/.test(trimmed)) {
    return true;
  }
  return /^[a-z0-9+/_=-]{28,}$/i.test(trimmed)
    && /[a-z]/i.test(trimmed)
    && /\d/.test(trimmed)
    && /[+/_=-]/.test(trimmed);
}

function inspectSafeTree(value, path = '$', depth = 0, state = { items: 0, ancestors: new Set() }) {
  state.items += 1;
  if (state.items > MAX_CONFIGURATION_PROFILE_ITEMS) {
    invalid('$', `must contain at most ${MAX_CONFIGURATION_PROFILE_ITEMS} values`);
  }
  if (depth > MAX_CONFIGURATION_PROFILE_DEPTH) {
    invalid(path, `must not be nested deeper than ${MAX_CONFIGURATION_PROFILE_DEPTH} levels`);
  }

  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) invalid(path, 'contains an excessively long string');
    if (hasSecretLikeValue(value)) invalid(path, 'contains a URL or credential-like value');
    return;
  }
  if (value == null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid(path, 'must contain only finite numbers');
    return;
  }
  if (typeof value !== 'object') invalid(path, 'contains an unsupported value type');
  if (state.ancestors.has(value)) invalid(path, 'must not contain circular references');

  state.ancestors.add(value);
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) invalid(path, `must contain at most ${MAX_ARRAY_LENGTH} items`);
    const extraKeys = Reflect.ownKeys(value).filter((key) => {
      if (key === 'length') return false;
      return typeof key !== 'string' || !/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= value.length;
    });
    if (extraKeys.length) invalid(path, 'contains unsupported array properties');
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) invalid(path, 'must not be sparse');
      inspectSafeTree(value[index], `${path}[${index}]`, depth + 1, state);
    }
  } else {
    if (!isPlainRecord(value)) invalid(path, 'must contain only plain objects');
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX_OBJECT_KEYS) invalid(path, `must contain at most ${MAX_OBJECT_KEYS} fields`);
    for (const key of keys) {
      if (typeof key !== 'string') invalid(path, 'must not contain symbol fields');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        invalid(path, 'must contain only enumerable data fields');
      }
      if (hasSecretLikeKey(key)) invalid(path, 'contains a credential-like field');
      inspectSafeTree(descriptor.value, `${path}.${key}`, depth + 1, state);
    }
  }
  state.ancestors.delete(value);
}

function expectRecord(value, path) {
  if (!isPlainRecord(value)) invalid(path, 'must be an object');
  return value;
}

function assertExactKeys(value, allowed, required, path) {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) {
    invalid(path, 'contains unsupported fields');
  }
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    invalid(path, 'is missing required fields');
  }
}

function expectBoolean(value, path) {
  if (typeof value !== 'boolean') invalid(path, 'must be a boolean');
  return value;
}

function expectEnum(value, allowed, path) {
  if (typeof value !== 'string' || !ENUM_SETS.get(allowed).has(value)) {
    invalid(path, `must be one of ${allowed.join(', ')}`);
  }
  return value;
}

function expectEnumArray(value, allowed, path, { min = 0, max = allowed.length } = {}) {
  if (!Array.isArray(value)) invalid(path, 'must be an array');
  if (value.length < min || value.length > max) {
    invalid(path, `must contain between ${min} and ${max} items`);
  }
  const normalized = value.map((entry, index) => expectEnum(entry, allowed, `${path}[${index}]`));
  if (new Set(normalized).size !== normalized.length) invalid(path, 'must not contain duplicates');
  return normalized;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function profileBytes(profile) {
  return Buffer.byteLength(JSON.stringify(profile), 'utf8');
}

export function normalizeConfigurationProfile(value) {
  inspectSafeTree(value);
  const input = expectRecord(value, '$');
  assertExactKeys(input, TOP_LEVEL_KEYS, REQUIRED_TOP_LEVEL_KEYS, '$');

  if (input.format !== CONFIGURATION_PROFILE_FORMAT) {
    invalid('$.format', `must be ${CONFIGURATION_PROFILE_FORMAT}`);
  }
  if (input.version !== CONFIGURATION_PROFILE_VERSION) {
    invalid('$.version', `must be ${CONFIGURATION_PROFILE_VERSION}`);
  }
  if (typeof input.name !== 'string') invalid('$.name', 'must be a string');
  const name = input.name.trim();
  if (!name
    || Array.from(name).length > 60
    || CONTROL_OR_BIDI_PATTERN.test(name)
    || !SAFE_PROFILE_NAME_PATTERN.test(name)) {
    invalid('$.name', 'must contain 1 to 60 safe display characters');
  }

  if (!Array.isArray(input.addons)) invalid('$.addons', 'must be an array');
  if (input.addons.length > CURATED_ADDON_IDS.length) {
    invalid('$.addons', `must contain at most ${CURATED_ADDON_IDS.length} items`);
  }
  const addons = input.addons.map((entry, index) => {
    const addon = expectRecord(entry, `$.addons[${index}]`);
    assertExactKeys(addon, ADDON_KEYS, ADDON_KEYS, `$.addons[${index}]`);
    return {
      id: expectEnum(addon.id, CURATED_ADDON_IDS, `$.addons[${index}].id`),
      enabled: expectBoolean(addon.enabled, `$.addons[${index}].enabled`)
    };
  });
  if (new Set(addons.map((addon) => addon.id)).size !== addons.length) {
    invalid('$.addons', 'must not contain duplicate addon IDs');
  }

  const quality = expectRecord(input.quality, '$.quality');
  assertExactKeys(quality, QUALITY_KEYS, QUALITY_KEYS, '$.quality');
  if (typeof quality.maxSizeGb !== 'number'
    || !Number.isFinite(quality.maxSizeGb)
    || quality.maxSizeGb < 0.25
    || quality.maxSizeGb > 500) {
    invalid('$.quality.maxSizeGb', 'must be a finite number from 0.25 to 500');
  }
  const languages = expectRecord(input.languages, '$.languages');
  assertExactKeys(languages, LANGUAGE_KEYS, LANGUAGE_KEYS, '$.languages');
  const player = expectRecord(input.player, '$.player');
  assertExactKeys(player, PLAYER_KEYS, PLAYER_KEYS, '$.player');
  const interfaceSettings = expectRecord(input.interface, '$.interface');
  assertExactKeys(interfaceSettings, INTERFACE_KEYS, INTERFACE_KEYS, '$.interface');
  const optionalLanguage = (entry, path) => (
    entry === 'none' ? 'none' : expectEnum(entry, LANGUAGE_IDS, path)
  );

  const profile = {
    format: CONFIGURATION_PROFILE_FORMAT,
    version: CONFIGURATION_PROFILE_VERSION,
    name,
    ...(input.presetId === undefined
      ? {}
      : { presetId: expectEnum(input.presetId, CONFIGURATION_PRESET_IDS, '$.presetId') }),
    targetDevice: expectEnum(input.targetDevice, TARGET_DEVICE_IDS, '$.targetDevice'),
    addons,
    sourcePriority: expectEnumArray(
      input.sourcePriority,
      SOURCE_PRIORITY_IDS,
      '$.sourcePriority',
      { min: 1 }
    ),
    quality: {
      maxResolution: expectEnum(quality.maxResolution, RESOLUTION_IDS, '$.quality.maxResolution'),
      maxSizeGb: quality.maxSizeGb,
      preferHdr: expectBoolean(quality.preferHdr, '$.quality.preferHdr'),
      allowDolbyVision: expectBoolean(quality.allowDolbyVision, '$.quality.allowDolbyVision'),
      allowRemux: expectBoolean(quality.allowRemux, '$.quality.allowRemux'),
      excludedTags: expectEnumArray(
        quality.excludedTags,
        QUALITY_EXCLUDED_TAGS,
        '$.quality.excludedTags'
      )
    },
    languages: {
      primaryAudio: expectEnum(languages.primaryAudio, LANGUAGE_IDS, '$.languages.primaryAudio'),
      secondaryAudio: optionalLanguage(languages.secondaryAudio, '$.languages.secondaryAudio'),
      primarySubtitle: optionalLanguage(languages.primarySubtitle, '$.languages.primarySubtitle'),
      secondarySubtitle: optionalLanguage(languages.secondarySubtitle, '$.languages.secondarySubtitle'),
      subtitleVisibility: expectEnum(
        languages.subtitleVisibility,
        SUBTITLE_VISIBILITY_IDS,
        '$.languages.subtitleVisibility'
      ),
      preferForced: expectBoolean(languages.preferForced, '$.languages.preferForced'),
      onlyPreferred: expectBoolean(languages.onlyPreferred, '$.languages.onlyPreferred')
    },
    player: {
      engine: expectEnum(player.engine, PLAYER_ENGINE_IDS, '$.player.engine'),
      selectionMode: expectEnum(
        player.selectionMode,
        PLAYER_SELECTION_MODE_IDS,
        '$.player.selectionMode'
      ),
      autoPlayNext: expectBoolean(player.autoPlayNext, '$.player.autoPlayNext'),
      reuseLastLink: expectBoolean(player.reuseLastLink, '$.player.reuseLastLink'),
      addonSubtitleStartup: expectEnum(
        player.addonSubtitleStartup,
        ADDON_SUBTITLE_STARTUP_IDS,
        '$.player.addonSubtitleStartup'
      ),
      bufferProfile: expectEnum(player.bufferProfile, BUFFER_PROFILE_IDS, '$.player.bufferProfile'),
      tunneledPlayback: expectBoolean(player.tunneledPlayback, '$.player.tunneledPlayback'),
      hardwareDecoding: expectEnum(
        player.hardwareDecoding,
        HARDWARE_DECODING_IDS,
        '$.player.hardwareDecoding'
      ),
      useLibass: expectBoolean(player.useLibass, '$.player.useLibass')
    },
    interface: {
      theme: expectEnum(interfaceSettings.theme, THEME_IDS, '$.interface.theme'),
      homeLayout: expectEnum(interfaceSettings.homeLayout, HOME_LAYOUT_IDS, '$.interface.homeLayout'),
      contentWarnings: expectBoolean(interfaceSettings.contentWarnings, '$.interface.contentWarnings'),
      hideSpoilers: expectBoolean(interfaceSettings.hideSpoilers, '$.interface.hideSpoilers'),
      autoplayTrailers: expectBoolean(interfaceSettings.autoplayTrailers, '$.interface.autoplayTrailers')
    },
    credentials: expectEnumArray(input.credentials, CREDENTIAL_SERVICE_IDS, '$.credentials')
  };

  if (profileBytes(profile) > MAX_CONFIGURATION_PROFILE_BYTES) {
    invalid('$', `must serialize to at most ${MAX_CONFIGURATION_PROFILE_BYTES} bytes`);
  }
  return deepFreeze(profile);
}

export function normalizeProfileShareCode(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return SHARE_CODE_PATTERN.test(normalized) ? normalized : null;
}

export function generateProfileShareCode(randomBytesImpl = randomBytes) {
  const bytes = randomBytesImpl(PROFILE_SHARE_CODE_LENGTH);
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    throw new TypeError('The profile share random byte source must return bytes.');
  }
  if (bytes.length < PROFILE_SHARE_CODE_LENGTH) {
    throw new TypeError(`The profile share random byte source must return ${PROFILE_SHARE_CODE_LENGTH} bytes.`);
  }
  let code = '';
  for (let index = 0; index < PROFILE_SHARE_CODE_LENGTH; index += 1) {
    code += PROFILE_SHARE_CODE_ALPHABET[bytes[index] & 31];
  }
  return code;
}

function positiveInteger(value, name, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
  return value;
}

function timestampFrom(now) {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('Profile share time must be a non-negative safe integer.');
  }
  return value;
}

function frozenRecord(profile, createdAt, expiresAt, code) {
  return Object.freeze({
    ...(code ? { code } : {}),
    profile,
    createdAt,
    expiresAt
  });
}

/**
 * Durable, endpoint-neutral storage for immutable, secret-free configuration profiles.
 */
export function createProfileShareStore({
  file,
  ttlMs = DEFAULT_PROFILE_SHARE_TTL_MS,
  maxEntries = DEFAULT_PROFILE_SHARE_MAX_ENTRIES,
  now = Date.now,
  generateCode = generateProfileShareCode,
  maxCodeAttempts = MAX_CODE_ATTEMPTS
} = {}) {
  if (!file) throw new TypeError('Profile share database file is required.');
  if (typeof now !== 'function') throw new TypeError('Profile share now must be a function.');
  if (typeof generateCode !== 'function') {
    throw new TypeError('Profile share code generator must be a function.');
  }
  const retentionMs = positiveInteger(ttlMs, 'Profile share TTL');
  const entryLimit = positiveInteger(maxEntries, 'Profile share entry limit', 1_000_000);
  const attemptLimit = positiveInteger(maxCodeAttempts, 'Profile share code attempt limit', 1_000);
  const databaseFile = file === ':memory:' ? file : resolve(file);
  if (databaseFile !== ':memory:') mkdirSync(dirname(databaseFile), { recursive: true });

  const db = new Database(databaseFile);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('temp_store = MEMORY');
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile_shares (
      code TEXT PRIMARY KEY
        CHECK (length(code) = ${PROFILE_SHARE_CODE_LENGTH})
        CHECK (code NOT GLOB '*[^${PROFILE_SHARE_CODE_ALPHABET}]*'),
      schema_version INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS profile_shares_expiry
      ON profile_shares (expires_at);
    CREATE INDEX IF NOT EXISTS profile_shares_created
      ON profile_shares (created_at);
  `);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO profile_shares (
      code, schema_version, payload_json, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?)
  `);
  const select = db.prepare(`
    SELECT schema_version, payload_json, created_at, expires_at
    FROM profile_shares
    WHERE code = ? AND expires_at > ?
  `);
  const deleteExpired = db.prepare('DELETE FROM profile_shares WHERE expires_at <= ?');
  const deleteExpiredCode = db.prepare(
    'DELETE FROM profile_shares WHERE code = ? AND expires_at <= ?'
  );
  const countEntries = db.prepare('SELECT COUNT(*) AS count FROM profile_shares');
  const countExpired = db.prepare(
    'SELECT COUNT(*) AS count FROM profile_shares WHERE expires_at <= ?'
  );
  const deleteOldest = db.prepare(`
    DELETE FROM profile_shares
    WHERE code IN (
      SELECT code FROM profile_shares
      ORDER BY created_at ASC, code ASC
      LIMIT ?
    )
  `);
  const deleteOldestExcept = db.prepare(`
    DELETE FROM profile_shares
    WHERE code IN (
      SELECT code FROM profile_shares
      WHERE code <> ?
      ORDER BY created_at ASC, code ASC
      LIMIT ?
    )
  `);

  let closed = false;
  function assertOpen() {
    if (closed) throw new Error('Profile share store is closed.');
  }

  const pruneTransaction = db.transaction((timestamp) => {
    const expired = deleteExpired.run(timestamp).changes;
    const count = countEntries.get().count;
    const excess = Math.max(0, count - entryLimit);
    const evicted = excess ? deleteOldest.run(excess).changes : 0;
    return Object.freeze({ expired, evicted, entries: count - evicted });
  });

  const createTransaction = db.transaction((payloadJson, profile, timestamp, expiresAt) => {
    deleteExpired.run(timestamp);
    let code = null;
    for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
      const candidate = normalizeProfileShareCode(generateCode());
      if (!candidate) throw new Error('Profile share code generator returned an invalid code.');
      const result = insert.run(
        candidate,
        CONFIGURATION_PROFILE_VERSION,
        payloadJson,
        timestamp,
        expiresAt
      );
      if (result.changes === 1) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      const error = new Error('Could not allocate a unique profile share code.');
      error.code = 'PROFILE_SHARE_CODE_EXHAUSTED';
      throw error;
    }

    const count = countEntries.get().count;
    const excess = Math.max(0, count - entryLimit);
    if (excess) deleteOldestExcept.run(code, excess);
    return frozenRecord(profile, timestamp, expiresAt, code);
  });

  pruneTransaction(timestampFrom(now));

  return Object.freeze({
    create(profileInput) {
      assertOpen();
      const profile = normalizeConfigurationProfile(profileInput);
      const payloadJson = JSON.stringify(profile);
      const createdAt = timestampFrom(now);
      const expiresAt = createdAt + retentionMs;
      if (!Number.isSafeInteger(expiresAt)) {
        throw new RangeError('Profile share expiry exceeds the safe timestamp range.');
      }
      return createTransaction(payloadJson, profile, createdAt, expiresAt);
    },

    get(codeInput) {
      assertOpen();
      const code = normalizeProfileShareCode(codeInput);
      if (!code) return null;
      const timestamp = timestampFrom(now);
      const row = select.get(code, timestamp);
      if (!row) {
        deleteExpiredCode.run(code, timestamp);
        return null;
      }
      if (row.schema_version !== CONFIGURATION_PROFILE_VERSION) {
        throw new Error('Stored configuration profile version is unsupported.');
      }
      let parsed;
      try {
        parsed = JSON.parse(row.payload_json);
      } catch (cause) {
        throw new Error('Stored configuration profile is unreadable.', { cause });
      }
      const profile = normalizeConfigurationProfile(parsed);
      return frozenRecord(profile, row.created_at, row.expires_at);
    },

    prune() {
      assertOpen();
      return pruneTransaction(timestampFrom(now));
    },

    stats() {
      assertOpen();
      const timestamp = timestampFrom(now);
      return Object.freeze({
        entries: countEntries.get().count,
        expired: countExpired.get(timestamp).count,
        maxEntries: entryLimit,
        ttlMs: retentionMs
      });
    },

    close() {
      if (closed) return;
      closed = true;
      db.close();
    }
  });
}
