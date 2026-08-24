import { Buffer } from 'node:buffer';
import { buildTamConfig } from './template.js';

const TORBOX_API = 'https://api.torbox.app/v1';
const NUVIO_BASE = 'https://api.nuvio.tv';
const NUVIO_KEY = 'sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN';
const AIOSTREAMS_BASE =
  'https://aiostreamsfortheweebs.midnightignite.me';
const PENGUPLAY_BASE = 'https://pengu.uk';
const NUVIO_CATALOG_BASE = 'https://catalog.nuvio.tv/';
const CINEMETA_MANIFEST = 'https://v3-cinemeta.strem.io/manifest.json';

export class SetupError extends Error {
  constructor(message, step = 'setup', status = 500) {
    super(message);
    this.name = 'SetupError';
    this.step = step;
    this.status = status;
  }
}

class RemoteError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'RemoteError';
    this.status = status;
    this.body = body;
  }
}

function remoteMessage(body, fallback) {
  return (
    body?.error?.message ||
    body?.error_description ||
    body?.message ||
    body?.msg ||
    body?.detail ||
    body?.error ||
    fallback
  );
}

async function requestJson(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'NuvioQuickstart/1.0',
    ...options.headers,
  };
  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers,
    });

    if (response.status === 204) return null;

    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }

    if (!response.ok) {
      throw new RemoteError(
        remoteMessage(body, `Remote service returned ${response.status}.`),
        response.status,
        body
      );
    }

    if (body?.success === false) {
      throw new RemoteError(
        remoteMessage(body, 'The remote service rejected the request.'),
        response.status,
        body
      );
    }

    return body;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new RemoteError('The remote service timed out.', 504, null);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function jsonBody(value) {
  return {
    body: JSON.stringify(value),
  };
}

function normalizeManifestUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    throw new SetupError(
      'Enter a valid HTTPS catalog or manifest URL.',
      'details',
      400
    );
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password
  ) {
    throw new SetupError(
      'Enter a valid HTTPS catalog or manifest URL.',
      'details',
      400
    );
  }

  if (!/\/manifest\.json$/i.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/manifest.json`;
  }
  url.hash = '';
  return url.toString();
}

export function resolveCatalogAddon(input = {}) {
  const mode = String(input.catalogMode ?? 'nuvio').trim().toLowerCase();

  if (mode === 'none') return null;
  if (mode === 'nuvio') {
    return {
      url: normalizeManifestUrl(NUVIO_CATALOG_BASE),
      name: 'Nuvio Catalog',
      enabled: true,
    };
  }
  if (mode === 'cinemeta') {
    return {
      url: CINEMETA_MANIFEST,
      name: 'Cinemeta',
      enabled: true,
    };
  }
  if (mode === 'custom') {
    return {
      url: normalizeManifestUrl(input.customCatalogUrl),
      name: 'Custom catalog',
      enabled: true,
    };
  }

  throw new SetupError('Choose a valid catalog option.', 'details', 400);
}

export function normalizePenguplayManifestUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    throw new SetupError(
      'Paste the HTTPS addon URL copied from PenguPlay.',
      'penguplay',
      400
    );
  }

  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== 'pengu.uk' ||
    (url.port && url.port !== '443') ||
    url.username ||
    url.password ||
    url.search ||
    !/\/manifest\.json$/i.test(url.pathname)
  ) {
    throw new SetupError(
      'Use the complete HTTPS manifest URL copied from pengu.uk.',
      'penguplay',
      400
    );
  }

  url.hash = '';
  return url.toString();
}

export function formatTorBoxError(message, status) {
  const detail = String(message || 'TorBox rejected the API key.')
    .replace(/\btokens\b/gi, 'API keys')
    .replace(/\btoken\b/gi, 'API key');
  const authenticationFailure =
    [401, 403].includes(status) ||
    /(api key).*(invalid|expired)|(?:invalid|expired).*(api key)|unauthori[sz]ed/i.test(
      detail
    );

  return authenticationFailure
    ? 'That TorBox API key is invalid or has expired. Check it in TorBox settings and try again.'
    : `TorBox validation failed: ${detail}`;
}

export async function validateTorBox(apiKey) {
  try {
    const response = await requestJson(
      `${TORBOX_API}/api/user/me?settings=true`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      10000
    );
    const data = response?.data;
    if (!data) throw new Error('TorBox returned no account data.');
    return data;
  } catch (error) {
    const message = formatTorBoxError(error.message, error.status);
    throw new SetupError(
      message,
      'torbox',
      message.startsWith('That TorBox API key') ? 400 : 502
    );
  }
}

function nuvioHeaders(token) {
  return {
    apikey: NUVIO_KEY,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function nuvioAuth(path, body) {
  return requestJson(`${NUVIO_BASE}/auth/v1${path}`, {
    method: 'POST',
    headers: nuvioHeaders(),
    ...jsonBody(body),
  });
}

async function nuvioRest(path, token, options = {}) {
  return requestJson(`${NUVIO_BASE}/rest/v1${path}`, {
    ...options,
    headers: {
      ...nuvioHeaders(token),
      ...options.headers,
    },
  });
}

export async function createOrLoginNuvio(email, password) {
  let created = false;
  let signupResponse;

  try {
    signupResponse = await nuvioAuth('/signup', { email, password });
    created = Boolean(signupResponse?.user);
  } catch (error) {
    const alreadyExists =
      [400, 409, 422].includes(error.status) &&
      /already|registered|exists/i.test(error.message);
    if (!alreadyExists) {
      throw new SetupError(
        `Nuvio account creation failed: ${error.message}`,
        'nuvio',
        502
      );
    }
  }

  if (signupResponse?.access_token) {
    return {
      token: signupResponse.access_token,
      created,
    };
  }

  try {
    const login = await nuvioAuth('/token?grant_type=password', {
      email,
      password,
    });
    if (!login?.access_token) {
      throw new Error('No access token was returned.');
    }
    return { token: login.access_token, created };
  } catch (error) {
    throw new SetupError(
      `Nuvio sign-in failed: ${error.message}`,
      'nuvio',
      error.status === 400 ? 400 : 502
    );
  }
}

export async function getNuvioProfiles(token) {
  const profiles = await nuvioRest('/rpc/sync_pull_profiles', token, {
    method: 'POST',
    ...jsonBody({}),
  });
  return Array.isArray(profiles) ? profiles : [];
}

async function createDefaultNuvioProfile(token) {
  await nuvioRest('/rpc/sync_push_profiles', token, {
    method: 'POST',
    ...jsonBody({
      p_client_max_profiles: 6,
      p_profiles: [
        {
          profile_index: 1,
          name: 'Main',
          avatar_color_hex: '#7C5CFC',
          uses_primary_addons: false,
          uses_primary_plugins: false,
          avatar_id: null,
          avatar_url: null,
        },
      ],
    }),
  });
}

export async function ensureNuvioProfiles(token) {
  let profiles = await getNuvioProfiles(token);
  if (profiles.length === 0) {
    await createDefaultNuvioProfile(token);
    profiles = await getNuvioProfiles(token);
  }
  if (profiles.length === 0) {
    throw new SetupError(
      'Nuvio did not create a usable profile.',
      'nuvio',
      502
    );
  }
  return profiles;
}

function profileIndex(profile) {
  return Number(profile.profile_index ?? profile.id);
}

export async function getNuvioAddons(token, profileId) {
  const addons = await nuvioRest(
    `/addons?select=*&profile_id=eq.${profileId}&order=sort_order`,
    token
  );
  return Array.isArray(addons) ? addons : [];
}

export async function setNuvioAddons(token, profileId, addons) {
  await nuvioRest('/rpc/sync_push_addons', token, {
    method: 'POST',
    ...jsonBody({
      p_profile_id: profileId,
      p_addons: addons.map((addon, index) => ({
        url: addon.url,
        name: addon.name,
        enabled: addon.enabled !== false,
        sort_order: index,
      })),
    }),
  });
}

function normalizeAddonUrl(url) {
  return String(url ?? '')
    .trim()
    .replace(/\/manifest\.json\/?$/i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

export function isMetadataAddon(addon) {
  const name = String(addon?.name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  let hostname = '';
  try {
    hostname = new URL(String(addon?.url ?? '').trim()).hostname.toLowerCase();
  } catch {
    // A malformed URL cannot identify a metadata addon by host, but its name may.
  }

  return (
    hostname === 'catalog.nuvio.tv' ||
    name.includes('nuviocatalog') ||
    hostname.includes('cinemeta') ||
    name.includes('cinemeta') ||
    hostname.includes('aiometadata') ||
    hostname.split('.')[0] === 'aiomd' ||
    name.includes('aiometadata')
  );
}

function addonForPush(addon, fallbackName = 'Addon') {
  return {
    url: addon.url,
    name: addon.name || fallbackName,
    enabled: addon.enabled !== false,
  };
}

export function mergeAddons(existing, streamAddon, catalogAddon = null) {
  const metadataIndex = existing.findIndex(isMetadataAddon);
  const metadataAddon = metadataIndex >= 0
    ? addonForPush(existing[metadataIndex])
    : catalogAddon;
  const excludedUrls = new Set([
    normalizeAddonUrl(streamAddon.url),
    ...(metadataAddon ? [normalizeAddonUrl(metadataAddon.url)] : []),
  ].filter(Boolean));
  const preserved = existing
    .filter((addon, index) => (
      index !== metadataIndex &&
      !excludedUrls.has(normalizeAddonUrl(addon.url))
    ))
    .map((addon) => addonForPush(addon));

  return [
    ...(metadataAddon ? [addonForPush(metadataAddon)] : []),
    addonForPush(streamAddon, 'Streaming addon'),
    ...preserved,
  ];
}

export async function installNuvioAddons(
  token,
  profiles,
  streamAddonManifest,
  streamAddonName,
  catalogAddon = resolveCatalogAddon()
) {
  const targets = profiles.filter((profile) => {
    const id = profileIndex(profile);
    return id === 1 || profile.uses_primary_addons !== true;
  });
  const snapshots = [];
  const expectedLayouts = new Map();
  const streamAddon = {
    url: streamAddonManifest,
    name: streamAddonName || 'Streaming addon',
    enabled: true,
  };
  const streamUrl = normalizeAddonUrl(streamAddon.url);

  try {
    for (const profile of targets) {
      const id = profileIndex(profile);
      const current = await getNuvioAddons(token, id);
      snapshots.push({ id, addons: current });
      const ordered = mergeAddons(current, streamAddon, catalogAddon);
      const firstUrl = normalizeAddonUrl(ordered[0]?.url);
      expectedLayouts.set(id, {
        metadataUrl: firstUrl !== streamUrl ? firstUrl : null,
        streamIndex: firstUrl !== streamUrl ? 1 : 0,
      });
      await setNuvioAddons(token, id, ordered);
    }

    for (const profile of targets) {
      const id = profileIndex(profile);
      const installed = await getNuvioAddons(token, id);
      const installedUrls = installed.map((addon) => normalizeAddonUrl(addon.url));
      const expected = expectedLayouts.get(id);
      if (installedUrls[expected.streamIndex] !== streamUrl) {
        throw new Error('Nuvio did not retain the streaming addon in the expected position.');
      }
      if (expected.metadataUrl && installedUrls[0] !== expected.metadataUrl) {
        throw new Error('Nuvio did not retain the metadata addon in the first position.');
      }
    }
  } catch (error) {
    for (const snapshot of snapshots.reverse()) {
      try {
        await setNuvioAddons(token, snapshot.id, snapshot.addons);
      } catch {
        // Best-effort restore. The original failure is more useful to the user.
      }
    }
    throw new SetupError(
      `Nuvio addon installation failed: ${error.message}`,
      'addons',
      502
    );
  }

  return targets.length;
}

export async function getAiostreamsStatus() {
  try {
    const response = await requestJson(
      `${AIOSTREAMS_BASE}/api/v1/status`,
      {},
      45000
    );
    if (!response?.data?.settings) {
      throw new Error('The instance returned an incomplete status response.');
    }
    return response.data;
  } catch (error) {
    throw new SetupError(
      `Midnight's AIOStreams instance is unavailable: ${error.message}`,
      'aiostreams',
      502
    );
  }
}

export async function createAiostreamsConfig({
  password,
  torboxApiKey,
  torboxUser,
  tmdbApiKey,
  tvdbApiKey,
}) {
  const status = await getAiostreamsStatus();
  const availablePresetIds = new Set(
    status.settings.presets
      .filter((preset) => !preset.DISABLED?.disabled)
      .map((preset) => preset.ID)
  );

  const built = buildTamConfig({
    torboxApiKey,
    torboxPlan: Number(torboxUser.plan),
    tmdbApiKey,
    tvdbApiKey,
    availablePresetIds,
  });

  let response;
  try {
    response = await requestJson(
      `${AIOSTREAMS_BASE}/api/v1/user`,
      {
        method: 'POST',
        ...jsonBody({ config: built.config, password }),
      },
      120000
    );
  } catch (error) {
    const detail = error.body?.detail || error.body?.error?.message;
    throw new SetupError(
      `AIOStreams setup failed: ${detail || error.message}`,
      'aiostreams',
      error.status === 400 ? 400 : 502
    );
  }

  const data = response?.data;
  if (!data?.uuid || !data?.encryptedPassword) {
    throw new SetupError(
      'AIOStreams did not return a manifest identifier.',
      'aiostreams',
      502
    );
  }

  const manifestUrl = `${AIOSTREAMS_BASE}/stremio/${data.uuid}/${data.encryptedPassword}/manifest.json`;
  let manifest;
  try {
    manifest = await requestJson(manifestUrl, {}, 45000);
  } catch (error) {
    await deleteAiostreamsConfig(data.uuid, password);
    throw new SetupError(
      `The generated AIOStreams manifest could not be verified: ${error.message}`,
      'aiostreams',
      502
    );
  }

  return {
    uuid: data.uuid,
    password,
    manifestUrl,
    manifestName: manifest?.name || 'AIOStreams',
    configureUrl: `${AIOSTREAMS_BASE}/stremio/${data.uuid}/${data.encryptedPassword}/configure`,
    templateVersion: built.templateVersion,
    metadataMatchingEnabled: built.metadataMatchingEnabled,
  };
}

export async function deleteAiostreamsConfig(uuid, password) {
  try {
    await requestJson(`${AIOSTREAMS_BASE}/api/v1/user`, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${Buffer.from(`${uuid}:${password}`, 'utf8').toString('base64')}`,
      },
    });
  } catch {
    // Best-effort cleanup only.
  }
}

export async function logoutNuvio(token) {
  try {
    await requestJson(`${NUVIO_BASE}/auth/v1/logout`, {
      method: 'POST',
      headers: nuvioHeaders(token),
    });
  } catch {
    // Session expiry is sufficient if logout is unavailable.
  }
}

export async function verifyPenguplayManifest(value) {
  const manifestUrl = normalizePenguplayManifestUrl(value);
  let manifest;

  try {
    manifest = await requestJson(manifestUrl, {}, 45000);
  } catch (error) {
    throw new SetupError(
      `PenguPlay could not verify this addon URL: ${error.message}`,
      'penguplay',
      error.status === 401 || error.status === 403 ? 400 : 502
    );
  }

  if (!manifest?.id || !manifest?.name || !Array.isArray(manifest?.resources)) {
    throw new SetupError(
      'PenguPlay returned an incomplete addon manifest. Copy a fresh addon URL and try again.',
      'penguplay',
      502
    );
  }

  return {
    manifestUrl,
    manifestName: manifest.name || 'PenguPlay',
  };
}

export async function runHttpsSetup(input, progress = () => {}) {
  const email = String(input.email ?? '').trim().toLowerCase();
  const nuvioPassword = String(input.nuvioPassword ?? '');
  const catalogAddon = resolveCatalogAddon(input);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new SetupError('Enter a valid email address.', 'details', 400);
  }
  if (nuvioPassword.length < 6) {
    throw new SetupError(
      'The Nuvio password must be at least 6 characters.',
      'details',
      400
    );
  }

  progress('penguplay', 'Checking your personal PenguPlay addon URL');
  const penguplay = await verifyPenguplayManifest(input.penguplayManifest);

  progress('nuvio', 'Creating or signing in to Nuvio');
  const nuvio = await createOrLoginNuvio(email, nuvioPassword);
  const profiles = await ensureNuvioProfiles(nuvio.token);

  try {
    const addons = [
      penguplay.manifestName,
      ...(catalogAddon ? [catalogAddon.name] : []),
    ];
    progress('addons', `Installing ${addons.join(' and ')} in Nuvio`);
    const installedProfiles = await installNuvioAddons(
      nuvio.token,
      profiles,
      penguplay.manifestUrl,
      penguplay.manifestName,
      catalogAddon
    );

    progress('complete', 'Setup complete');
    return {
      setupPath: 'https',
      email,
      nuvioAccountCreated: nuvio.created,
      ...(nuvio.created ? { nuvioPassword } : {}),
      installedProfiles,
      addonManifest: penguplay.manifestUrl,
      addonConfigureUrl: `${PENGUPLAY_BASE}/configure`,
      addonName: penguplay.manifestName,
      addons,
    };
  } finally {
    await logoutNuvio(nuvio.token);
  }
}

export async function runSetup(input, progress = () => {}) {
  const email = String(input.email ?? '').trim().toLowerCase();
  const nuvioPassword = String(input.nuvioPassword ?? '');
  const torboxApiKey = String(input.torboxApiKey ?? '').trim();
  const aiostreamsPassword = String(input.aiostreamsPassword ?? '');
  const tmdbApiKey = String(input.tmdbApiKey ?? '').trim();
  const tvdbApiKey = String(input.tvdbApiKey ?? '').trim();
  const catalogAddon = resolveCatalogAddon(input);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new SetupError('Enter a valid email address.', 'details', 400);
  }
  if (nuvioPassword.length < 6) {
    throw new SetupError(
      'The Nuvio password must be at least 6 characters.',
      'details',
      400
    );
  }
  if (!torboxApiKey || /[\r\n\t]/.test(torboxApiKey)) {
    throw new SetupError('Enter a valid TorBox API key.', 'details', 400);
  }
  if (aiostreamsPassword.length < 6) {
    throw new SetupError(
      'The AIOStreams password must be at least 6 characters.',
      'details',
      400
    );
  }

  progress('torbox', 'Checking your TorBox account');
  const torboxUser = await validateTorBox(torboxApiKey);

  progress('nuvio', 'Creating or signing in to Nuvio');
  const nuvio = await createOrLoginNuvio(email, nuvioPassword);
  const profiles = await ensureNuvioProfiles(nuvio.token);

  let aiostreams;
  try {
    progress('aiostreams', 'Building Tam-Taro SEL configuration');
    aiostreams = await createAiostreamsConfig({
      password: aiostreamsPassword,
      torboxApiKey,
      torboxUser,
      tmdbApiKey,
      tvdbApiKey,
    });

    const addons = [
      aiostreams.manifestName,
      ...(catalogAddon ? [catalogAddon.name] : []),
    ];
    progress('addons', `Installing ${addons.join(' and ')} in Nuvio`);
    const installedProfiles = await installNuvioAddons(
      nuvio.token,
      profiles,
      aiostreams.manifestUrl,
      aiostreams.manifestName,
      catalogAddon
    );

    progress('complete', 'Setup complete');
    return {
      setupPath: 'debrid',
      email,
      nuvioAccountCreated: nuvio.created,
      ...(nuvio.created ? { nuvioPassword } : {}),
      aiostreamsPassword,
      installedProfiles,
      aiostreamsManifest: aiostreams.manifestUrl,
      aiostreamsConfigureUrl: aiostreams.configureUrl,
      aiostreamsName: aiostreams.manifestName,
      tamTemplateVersion: aiostreams.templateVersion,
      metadataMatchingEnabled: aiostreams.metadataMatchingEnabled,
      torboxPlan: torboxUser.plan,
      addons,
    };
  } catch (error) {
    if (aiostreams?.uuid) {
      await deleteAiostreamsConfig(
        aiostreams.uuid,
        aiostreams.password
      );
    }
    throw error;
  } finally {
    await logoutNuvio(nuvio.token);
  }
}

export const serviceConstants = {
  aiostreamsBase: AIOSTREAMS_BASE,
  penguplayBase: PENGUPLAY_BASE,
  nuvioCatalogBase: NUVIO_CATALOG_BASE,
  nuvioCatalogManifest: normalizeManifestUrl(NUVIO_CATALOG_BASE),
  cinemetaManifest: CINEMETA_MANIFEST,
};
