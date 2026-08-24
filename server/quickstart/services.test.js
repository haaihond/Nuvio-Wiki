import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isMetadataAddon,
  isPenguplayAddon,
  mergeAddons,
  normalizePenguplayManifestUrl,
  resolveCatalogAddon,
  selectAddonProfiles,
  serviceConstants,
  SetupError,
} from './services.js';

const streamAddon = {
  url: 'https://streams.example/user/manifest.json',
  name: 'User Streams',
  enabled: true,
};

test('defaults to the Nuvio Catalog manifest', () => {
  assert.deepEqual(resolveCatalogAddon(), {
    url: 'https://catalog.nuvio.tv/manifest.json',
    name: 'Nuvio Catalog',
    enabled: true,
  });
  assert.equal(serviceConstants.nuvioCatalogBase, 'https://catalog.nuvio.tv/');
});

test('supports the restrained advanced catalog choices', () => {
  assert.equal(resolveCatalogAddon({ catalogMode: 'none' }), null);
  assert.equal(
    resolveCatalogAddon({ catalogMode: 'cinemeta' }).url,
    serviceConstants.cinemetaManifest
  );
  assert.deepEqual(
    resolveCatalogAddon({
      catalogMode: 'custom',
      customCatalogUrl: 'https://example.com/my-catalog',
    }),
    {
      url: 'https://example.com/my-catalog/manifest.json',
      name: 'Custom catalog',
      enabled: true,
    }
  );
});

test('rejects unsafe or unknown catalog options', () => {
  assert.throws(
    () =>
      resolveCatalogAddon({
        catalogMode: 'custom',
        customCatalogUrl: 'http://example.com/manifest.json',
      }),
    (error) =>
      error instanceof SetupError &&
      error.step === 'details' &&
      error.status === 400
  );
  assert.throws(
    () => resolveCatalogAddon({ catalogMode: 'other' }),
    /valid catalog option/
  );
});

test('recognizes supported metadata addons by name or manifest host', () => {
  for (const addon of [
    { url: 'https://catalog.nuvio.tv/manifest.json', name: 'Catalog' },
    { url: 'https://configured.example/abc/manifest.json', name: 'Nuvio Catalog Addon' },
    { url: 'https://v3-cinemeta.strem.io/manifest.json', name: 'Movies' },
    { url: 'https://configured.example/abc/manifest.json', name: 'Cinemeta' },
    { url: 'https://aiometadata.elfhosted.com/abc/manifest.json', name: 'Metadata' },
    { url: 'https://aiomd.atbphosting.com/manifest.json', name: 'Metadata' },
    { url: 'https://configured.example/abc/manifest.json', name: 'AIO Metadata' },
    { url: 'https://media.example/stremio/selfhosted-user/manifest.json', name: null },
  ]) {
    assert.equal(isMetadataAddon(addon), true);
  }
  assert.equal(
    isMetadataAddon({ url: 'https://subtitles.example/manifest.json', name: 'Subtitles' }),
    false
  );
  assert.equal(
    isMetadataAddon({
      url: 'https://streams.example/stremio/user/password/manifest.json',
      name: 'AIOStreams',
    }),
    false
  );
});

test('reuses an installed PenguPlay addon instead of pushing a new one', () => {
  const installedPenguplay = {
    url: 'https://pengu.uk/%7B%22auth_token%22%3A%22existing%22%7D/manifest.json',
    name: null,
    enabled: true,
  };
  const requestedPenguplay = {
    url: 'https://pengu.uk/%7B%22auth_token%22%3A%22new%22%7D/manifest.json',
    name: 'PenguPlay',
    enabled: true,
  };
  const metadata = {
    url: 'https://media.example/stremio/user/manifest.json',
    name: null,
    enabled: true,
  };
  const other = { url: 'https://subtitles.example/manifest.json', name: 'Subtitles', enabled: true };

  assert.equal(isPenguplayAddon(installedPenguplay), true);
  assert.deepEqual(
    mergeAddons([other, installedPenguplay, metadata], requestedPenguplay, resolveCatalogAddon()),
    [metadata, installedPenguplay, other]
  );
});

test('installs addons only on the selected effective profiles', () => {
  const profiles = [
    { profile_index: 1, name: 'Main', uses_primary_addons: false },
    { profile_index: 2, name: 'Kids', uses_primary_addons: false },
    { profile_index: 3, name: 'Shared', uses_primary_addons: true },
  ];

  assert.deepEqual(selectAddonProfiles(profiles, [2]), [profiles[1]]);
  assert.deepEqual(selectAddonProfiles(profiles, [1, 2]), [profiles[0], profiles[1]]);
  assert.deepEqual(selectAddonProfiles(profiles, [3]), [profiles[0]]);
  assert.deepEqual(selectAddonProfiles(profiles, [1, 3]), [profiles[0]]);
  assert.throws(
    () => selectAddonProfiles(profiles, []),
    (error) => error instanceof SetupError && error.step === 'profiles' && error.status === 400
  );
  assert.throws(() => selectAddonProfiles(profiles, [4]), /valid Nuvio profiles/);
});

test('keeps an installed metadata addon first without adding Nuvio Catalog', () => {
  const existing = [
    { url: 'https://subtitles.example/manifest.json', name: 'Subtitles', enabled: true },
    { url: 'https://aiometadata.elfhosted.com/user/manifest.json', name: 'AIOMetadata', enabled: false },
    { url: streamAddon.url, name: 'Old stream name', enabled: false },
    { url: 'https://ratings.example/manifest.json', name: 'Ratings', enabled: true },
  ];

  assert.deepEqual(mergeAddons(existing, streamAddon, resolveCatalogAddon()), [
    existing[1],
    streamAddon,
    existing[0],
    existing[3],
  ]);
});

test('adds the fallback metadata addon first when none is installed', () => {
  const catalogAddon = resolveCatalogAddon();
  const existing = [
    { url: 'https://subtitles.example/manifest.json', name: 'Subtitles', enabled: true },
    { url: 'https://ratings.example/manifest.json', name: 'Ratings', enabled: false },
  ];

  assert.deepEqual(mergeAddons(existing, streamAddon, catalogAddon), [
    catalogAddon,
    streamAddon,
    ...existing,
  ]);
});

test('promotes only the first installed metadata addon and preserves the rest', () => {
  const existing = [
    { url: 'https://first.example/manifest.json', name: 'First user addon', enabled: true },
    { url: 'https://v3-cinemeta.strem.io/manifest.json', name: 'Cinemeta', enabled: true },
    { url: 'https://aiometadata.stremio.ru/manifest.json', name: 'AIOMetadata', enabled: true },
    { url: 'https://last.example/manifest.json', name: 'Last user addon', enabled: true },
  ];

  assert.deepEqual(mergeAddons(existing, streamAddon, resolveCatalogAddon()), [
    existing[1],
    streamAddon,
    existing[0],
    existing[2],
    existing[3],
  ]);
});

test('accepts only personal HTTPS manifests hosted by PenguPlay', () => {
  const manifest =
    'https://pengu.uk/zabc_DEF-123/manifest.json';

  assert.equal(normalizePenguplayManifestUrl(manifest), manifest);
  assert.equal(serviceConstants.penguplayBase, 'https://pengu.uk');
});

test('rejects lookalike, incomplete, and modified PenguPlay URLs', () => {
  for (const value of [
    'https://pengu.uk.example.com/zabc/manifest.json',
    'http://pengu.uk/zabc/manifest.json',
    'https://pengu.uk/configure',
    'https://pengu.uk/zabc/manifest.json?token=unexpected',
  ]) {
    assert.throws(
      () => normalizePenguplayManifestUrl(value),
      (error) =>
        error instanceof SetupError &&
        error.step === 'penguplay' &&
        error.status === 400
    );
  }
});
