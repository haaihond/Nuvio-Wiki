import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ADDON_SUBTITLE_STARTUP_IDS,
  CONFIGURATION_PROFILE_FORMAT,
  CONFIGURATION_PROFILE_VERSION,
  CURATED_ADDON_IDS,
  DEFAULT_PROFILE_SHARE_MAX_ENTRIES,
  DEFAULT_PROFILE_SHARE_TTL_MS,
  MAX_CONFIGURATION_PROFILE_BYTES,
  PROFILE_SHARE_CODE_ALPHABET,
  PROFILE_SHARE_CODE_LENGTH,
  ProfileShareValidationError,
  TARGET_DEVICE_IDS,
  createProfileShareStore,
  generateProfileShareCode,
  normalizeConfigurationProfile,
  normalizeProfileShareCode
} from './profile-shares.js';

function profile(overrides = {}) {
  const value = {
    format: CONFIGURATION_PROFILE_FORMAT,
    version: CONFIGURATION_PROFILE_VERSION,
    name: 'Living room setup',
    targetDevice: 'android-tv',
    addons: [
      { id: 'cinemeta', enabled: true },
      { id: 'aiostreams', enabled: true },
      { id: 'opensubtitles', enabled: true }
    ],
    sourcePriority: ['usenet', 'debrid', 'p2p', 'direct'],
    quality: {
      maxResolution: '2160p',
      maxSizeGb: 80,
      preferHdr: true,
      allowDolbyVision: true,
      allowRemux: true,
      excludedTags: ['cam', 'telesync', 'low-seeders']
    },
    languages: {
      primaryAudio: 'original',
      secondaryAudio: 'en',
      primarySubtitle: 'en',
      secondarySubtitle: 'none',
      subtitleVisibility: 'automatic',
      preferForced: true,
      onlyPreferred: false
    },
    player: {
      engine: 'exoplayer',
      selectionMode: 'automatic',
      autoPlayNext: true,
      reuseLastLink: true,
      addonSubtitleStartup: 'preferred',
      bufferProfile: 'high-bitrate',
      tunneledPlayback: false,
      hardwareDecoding: 'hardware',
      useLibass: true
    },
    interface: {
      theme: 'dark',
      homeLayout: 'cinematic',
      contentWarnings: true,
      hideSpoilers: true,
      autoplayTrailers: false
    },
    credentials: ['torbox', 'usenet-provider']
  };

  return {
    ...value,
    ...overrides,
    quality: { ...value.quality, ...overrides.quality },
    languages: { ...value.languages, ...overrides.languages },
    player: { ...value.player, ...overrides.player },
    interface: { ...value.interface, ...overrides.interface }
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectInvalid(value, pattern) {
  assert.throws(
    () => normalizeConfigurationProfile(value),
    (error) => error instanceof ProfileShareValidationError
      && (!pattern || pattern.test(error.message))
  );
}

test('exports the frontend-aligned curated enums', () => {
  assert.deepEqual(TARGET_DEVICE_IDS, [
    'universal',
    'android-tv',
    'android-mobile',
    'ios',
    'desktop',
    'webos'
  ]);
  assert.deepEqual(CURATED_ADDON_IDS, [
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
  assert.deepEqual(ADDON_SUBTITLE_STARTUP_IDS, ['fast', 'preferred', 'all']);
  assert.equal(DEFAULT_PROFILE_SHARE_TTL_MS, 365 * 24 * 60 * 60_000);
  assert.equal(DEFAULT_PROFILE_SHARE_MAX_ENTRIES, 100_000);
});

test('normalizes a complete profile into an immutable detached value', () => {
  const input = profile({ name: "  Mika’s TV + Kids  " });
  const normalized = normalizeConfigurationProfile(input);

  assert.equal(normalized.name, "Mika’s TV + Kids");
  assert.deepEqual(normalized, { ...input, name: "Mika’s TV + Kids" });
  assert.notStrictEqual(normalized, input);
  assert.notStrictEqual(normalized.quality, input.quality);
  assert.notStrictEqual(normalized.addons, input.addons);
  assert.ok(Object.isFrozen(normalized));
  assert.ok(Object.isFrozen(normalized.player));
  assert.ok(Object.isFrozen(normalized.addons));
  assert.ok(Object.isFrozen(normalized.addons[0]));
  assert.throws(() => {
    normalized.quality.maxSizeGb = 1;
  }, TypeError);

  input.quality.maxSizeGb = 1;
  input.addons[0].enabled = false;
  assert.equal(normalized.quality.maxSizeGb, 80);
  assert.equal(normalized.addons[0].enabled, true);
  assert.ok(Buffer.byteLength(JSON.stringify(normalized), 'utf8') < MAX_CONFIGURATION_PROFILE_BYTES);
});

test('accepts the optional preset id and every safe secondary none value', () => {
  const normalized = normalizeConfigurationProfile(profile({
    presetId: 'family-friendly',
    languages: {
      secondaryAudio: 'none',
      primarySubtitle: 'none',
      secondarySubtitle: 'none'
    }
  }));
  assert.equal(normalized.presetId, 'family-friendly');
  assert.equal(normalized.languages.secondaryAudio, 'none');
  assert.equal(normalized.languages.primarySubtitle, 'none');
});

test('rejects unknown keys at every profile object level', () => {
  const cases = [];
  let value = profile();
  value.note = 'hello';
  cases.push(value);
  value = profile();
  value.addons[0].name = 'Cinemeta';
  cases.push(value);
  value = profile();
  value.quality.minimumSeeds = 5;
  cases.push(value);
  value = profile();
  value.languages.defaultFont = 'sans';
  cases.push(value);
  value = profile();
  value.player.volume = 50;
  cases.push(value);
  value = profile();
  value.interface.accent = 'blue';
  cases.push(value);

  for (const candidate of cases) expectInvalid(candidate, /unsupported fields/);
});

test('requires the complete schema and rejects invalid types, enums, and duplicates', () => {
  const missing = profile();
  delete missing.player;
  expectInvalid(missing, /missing required fields/);

  expectInvalid(profile({ targetDevice: 'smart-fridge' }), /targetDevice/);
  expectInvalid(profile({ sourcePriority: [] }), /sourcePriority/);
  expectInvalid(profile({ sourcePriority: ['debrid', 'debrid'] }), /duplicates/);
  expectInvalid(profile({ addons: [
    { id: 'cinemeta', enabled: true },
    { id: 'cinemeta', enabled: false }
  ] }), /duplicate addon IDs/);
  expectInvalid(profile({ quality: { maxSizeGb: Number.NaN } }), /finite numbers|maxSizeGb/);
  expectInvalid(profile({ quality: { maxSizeGb: 0.1 } }), /0\.25 to 500/);
  expectInvalid(profile({ quality: { maxSizeGb: 501 } }), /0\.25 to 500/);
  expectInvalid(profile({ player: { addonSubtitleStartup: true } }), /addonSubtitleStartup/);
  expectInvalid(profile({ player: { hardwareDecoding: false } }), /hardwareDecoding/);
  expectInvalid(profile({ credentials: ['torbox', 'torbox'] }), /duplicates/);
  expectInvalid(profile({ credentials: ['not-a-service'] }), /credentials/);
});

test('enforces the shared profile display-name policy', () => {
  assert.equal(
    normalizeConfigurationProfile(profile({ name: "Élodie & O’Neil’s TV (4K)_2" })).name,
    "Élodie & O’Neil’s TV (4K)_2"
  );
  expectInvalid(profile({ name: '' }), /1 to 60/);
  expectInvalid(profile({ name: 'x'.repeat(61) }), /1 to 60/);
  expectInvalid(profile({ name: '<script>alert(1)</script>' }), /safe display/);
  expectInvalid(profile({ name: 'Unsafe: profile' }), /safe display/);
  expectInvalid(profile({ name: 'Spoof\u202eexe' }), /safe display/);
});

test('rejects secret-like keys, credential-like values, opaque tokens, and URLs', () => {
  const secretKey = profile();
  secretKey.quality.apiKey = 'do-not-store';
  expectInvalid(secretKey, /credential-like field/);

  expectInvalid(profile({ name: 'https://evil.example/setup' }), /URL or credential-like/);
  expectInvalid(profile({ name: 'evil.example.xyz/path' }), /URL or credential-like/);
  expectInvalid(profile({ name: 'sk-abcdefghijklmnopqrstuv' }), /URL or credential-like/);
  expectInvalid(profile({ name: 'Bearer abcdefghijklmnopqrstuvwxyz' }), /URL or credential-like/);
  expectInvalid(profile({ name: '0123456789abcdef0123456789abcdef' }), /URL or credential-like/);
  expectInvalid(profile({ name: 'AbCdEfGhIjKlMnOpQrSt1234' }), /URL or credential-like/);

  const tokenValue = profile();
  tokenValue.note = 'access_token=abcdefghijklmnop';
  expectInvalid(tokenValue, /URL or credential-like/);
});

test('rejects excessive structure, sparse arrays, accessors, symbols, and cycles', () => {
  const tooMany = profile();
  tooMany.extra = Array.from({ length: 65 }, () => true);
  expectInvalid(tooMany, /at most 64 items/);

  const tooDeep = profile();
  tooDeep.extra = { a: { b: { c: { d: { e: true } } } } };
  expectInvalid(tooDeep, /nested deeper/);

  const sparse = profile();
  sparse.addons = new Array(1);
  expectInvalid(sparse, /must not be sparse/);

  const accessor = profile();
  Object.defineProperty(accessor, 'extra', {
    enumerable: true,
    get() {
      throw new Error('must not execute');
    }
  });
  expectInvalid(accessor, /enumerable data fields/);

  const symbol = profile();
  symbol[Symbol('hidden')] = 'value';
  expectInvalid(symbol, /symbol fields/);

  const cyclic = profile();
  cyclic.extra = cyclic;
  expectInvalid(cyclic, /circular references/);

  expectInvalid(profile({ name: 'x'.repeat(2_049) }), /excessively long string/);
});

test('generates and normalizes human-safe six-character codes', () => {
  let requestedBytes = 0;
  const bytes = Buffer.from([0, 1, 2, 3, 30, 31]);
  const code = generateProfileShareCode((length) => {
    requestedBytes = length;
    return bytes;
  });
  assert.equal(requestedBytes, PROFILE_SHARE_CODE_LENGTH);
  assert.equal(
    code,
    [...bytes].map((value) => PROFILE_SHARE_CODE_ALPHABET[value & 31]).join('')
  );
  assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  assert.equal(normalizeProfileShareCode(' 7kx2pm '), '7KX2PM');
  assert.equal(normalizeProfileShareCode('7KI2PM'), null);
  assert.equal(normalizeProfileShareCode('7KX2P0'), null);
  assert.equal(normalizeProfileShareCode('7KX2P'), null);
  assert.equal(normalizeProfileShareCode(null), null);
});

test('persists immutable profile clones across SQLite reopen', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'nuvio-profile-shares-'));
  const file = join(directory, 'shares.sqlite');
  let store = null;
  t.after(() => {
    store?.close();
    rmSync(directory, { recursive: true, force: true });
  });

  let timestamp = 1_000;
  const input = profile({ name: '  Persistent TV  ' });
  store = createProfileShareStore({
    file,
    ttlMs: 500,
    now: () => timestamp,
    generateCode: () => '7KX2PM'
  });
  const created = store.create(input);
  assert.deepEqual(Object.keys(created), ['code', 'profile', 'createdAt', 'expiresAt']);
  assert.equal(created.code, '7KX2PM');
  assert.equal(created.createdAt, 1_000);
  assert.equal(created.expiresAt, 1_500);
  assert.equal(created.profile.name, 'Persistent TV');
  assert.ok(Object.isFrozen(created));
  assert.ok(Object.isFrozen(created.profile.quality));

  input.name = 'Changed later';
  input.quality.maxSizeGb = 1;
  store.close();
  store = null;

  timestamp = 1_100;
  store = createProfileShareStore({ file, ttlMs: 500, now: () => timestamp });
  const first = store.get(' 7kx2pm ');
  const second = store.get('7KX2PM');
  assert.deepEqual(Object.keys(first), ['profile', 'createdAt', 'expiresAt']);
  assert.equal(first.profile.name, 'Persistent TV');
  assert.equal(first.profile.quality.maxSizeGb, 80);
  assert.deepEqual(first, second);
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.profile, second.profile);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.profile.addons[0]));
  assert.throws(() => {
    first.profile.addons[0].enabled = false;
  }, TypeError);
  assert.equal(store.stats().entries, 1);
});

test('retries code collisions and preserves the existing row', () => {
  const codes = ['AAAAAA', 'AAAAAA', 'BBBBBB'];
  const store = createProfileShareStore({
    file: ':memory:',
    now: () => 1_000,
    generateCode: () => codes.shift()
  });
  try {
    const first = store.create(profile({ name: 'First' }));
    const second = store.create(profile({ name: 'Second' }));
    assert.equal(first.code, 'AAAAAA');
    assert.equal(second.code, 'BBBBBB');
    assert.equal(store.get('AAAAAA').profile.name, 'First');
    assert.equal(store.get('BBBBBB').profile.name, 'Second');
  } finally {
    store.close();
  }
});

test('rolls back cleanly when unique code allocation is exhausted', () => {
  const store = createProfileShareStore({
    file: ':memory:',
    maxEntries: 1,
    maxCodeAttempts: 2,
    now: () => 1_000,
    generateCode: () => 'AAAAAA'
  });
  try {
    store.create(profile({ name: 'Existing' }));
    assert.throws(
      () => store.create(profile({ name: 'Collision' })),
      (error) => error.code === 'PROFILE_SHARE_CODE_EXHAUSTED'
    );
    assert.equal(store.stats().entries, 1);
    assert.equal(store.get('AAAAAA').profile.name, 'Existing');
  } finally {
    store.close();
  }
});

test('expires shares at the exact TTL boundary and prunes expired rows', () => {
  let timestamp = 100;
  const codes = ['AAAAAA', 'BBBBBB'];
  const store = createProfileShareStore({
    file: ':memory:',
    ttlMs: 10,
    now: () => timestamp,
    generateCode: () => codes.shift()
  });
  try {
    store.create(profile({ name: 'Expires on read' }));
    timestamp = 110;
    assert.equal(store.get('AAAAAA'), null);
    assert.equal(store.stats().entries, 0);

    store.create(profile({ name: 'Expires on prune' }));
    timestamp = 120;
    assert.deepEqual(store.stats(), {
      entries: 1,
      expired: 1,
      maxEntries: DEFAULT_PROFILE_SHARE_MAX_ENTRIES,
      ttlMs: 10
    });
    assert.deepEqual(store.prune(), { expired: 1, evicted: 0, entries: 0 });
  } finally {
    store.close();
  }
});

test('evicts the oldest rows while always retaining a newly created share', () => {
  let timestamp = 1;
  const codes = ['AAAAAA', 'BBBBBB', 'CCCCCC'];
  const store = createProfileShareStore({
    file: ':memory:',
    maxEntries: 2,
    now: () => timestamp,
    generateCode: () => codes.shift()
  });
  try {
    store.create(profile({ name: 'Oldest' }));
    timestamp += 1;
    store.create(profile({ name: 'Middle' }));
    timestamp += 1;
    const newest = store.create(profile({ name: 'Newest' }));

    assert.equal(newest.code, 'CCCCCC');
    assert.equal(store.get('AAAAAA'), null);
    assert.equal(store.get('BBBBBB').profile.name, 'Middle');
    assert.equal(store.get('CCCCCC').profile.name, 'Newest');
    assert.equal(store.stats().entries, 2);
  } finally {
    store.close();
  }
});

test('prunes an oversized persisted database when reopened with a lower bound', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'nuvio-profile-bound-'));
  const file = join(directory, 'shares.sqlite');
  let store = null;
  t.after(() => {
    store?.close();
    rmSync(directory, { recursive: true, force: true });
  });
  let timestamp = 1;
  const codes = ['AAAAAA', 'BBBBBB', 'CCCCCC'];
  store = createProfileShareStore({
    file,
    maxEntries: 3,
    now: () => timestamp,
    generateCode: () => codes.shift()
  });
  for (const name of ['First', 'Second', 'Third']) {
    store.create(profile({ name }));
    timestamp += 1;
  }
  store.close();
  store = createProfileShareStore({ file, maxEntries: 2, now: () => timestamp });
  assert.equal(store.get('AAAAAA'), null);
  assert.equal(store.get('BBBBBB').profile.name, 'Second');
  assert.equal(store.get('CCCCCC').profile.name, 'Third');
  assert.equal(store.stats().entries, 2);
});

test('rejects invalid generated codes and invalid configuration before persistence', () => {
  let generatorCalls = 0;
  const store = createProfileShareStore({
    file: ':memory:',
    generateCode: () => {
      generatorCalls += 1;
      return 'BAD100';
    }
  });
  try {
    assert.throws(() => store.create(profile({ targetDevice: 'invalid' })), ProfileShareValidationError);
    assert.equal(generatorCalls, 0);
    assert.equal(store.stats().entries, 0);
    assert.throws(() => store.create(profile()), /generator returned an invalid code/);
    assert.equal(store.stats().entries, 0);
    assert.equal(store.get('invalid'), null);
  } finally {
    store.close();
  }
});

test('validates store options and makes close idempotent', () => {
  assert.throws(() => createProfileShareStore(), /database file is required/);
  assert.throws(() => createProfileShareStore({ file: ':memory:', ttlMs: 0 }), /TTL/);
  assert.throws(() => createProfileShareStore({ file: ':memory:', maxEntries: 0 }), /entry limit/);
  assert.throws(
    () => createProfileShareStore({ file: ':memory:', generateCode: 'nope' }),
    /generator must be a function/
  );

  const store = createProfileShareStore({ file: ':memory:' });
  store.close();
  store.close();
  assert.throws(() => store.stats(), /closed/);
  assert.throws(() => store.create(profile()), /closed/);
});
