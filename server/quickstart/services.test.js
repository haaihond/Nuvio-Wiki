import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isMetadataAddon,
  mergeAddons,
  normalizePenguplayManifestUrl,
  resolveCatalogAddon,
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
  ]) {
    assert.equal(isMetadataAddon(addon), true);
  }
  assert.equal(
    isMetadataAddon({ url: 'https://subtitles.example/manifest.json', name: 'Subtitles' }),
    false
  );
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
