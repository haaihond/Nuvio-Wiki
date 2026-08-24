import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePenguplayManifestUrl,
  resolveCatalogAddon,
  serviceConstants,
  SetupError,
} from './services.js';

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
