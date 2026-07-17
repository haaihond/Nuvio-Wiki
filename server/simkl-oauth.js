import { createTraktOAuthStateStore } from './trakt-oauth.js';

export const SIMKL_AUTHORIZE_URL = 'https://simkl.com/oauth/authorize';
export const SIMKL_TOKEN_URL = 'https://api.simkl.com/oauth/token';

function requiredString(value, name) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function inlineJson(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => ({
    '<': '\\u003c',
    '>': '\\u003e',
    '&': '\\u0026',
    '\u2028': '\\u2028',
    '\u2029': '\\u2029'
  }[character]));
}

function responseDetail(data, fallback) {
  if (data && typeof data === 'object') {
    return String(data.error_description || data.message || data.error || fallback).slice(0, 500);
  }
  return String(data || fallback).slice(0, 500);
}

/**
 * Simkl uses the same bounded, opaque, single-use state semantics as Trakt,
 * but every invocation owns a separate in-memory store.
 */
export function createSimklOAuthStateStore(options) {
  return createTraktOAuthStateStore(options);
}

export function buildSimklAuthorizationUrl({ clientId, redirectUri, state }) {
  const url = new URL(SIMKL_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', requiredString(clientId, 'Simkl client ID'));
  url.searchParams.set('redirect_uri', requiredString(redirectUri, 'Simkl redirect URI'));
  url.searchParams.set('state', requiredString(state, 'Simkl OAuth state'));
  url.searchParams.set('app-name', 'nuvio-wiki');
  url.searchParams.set('app-version', '1.0');
  return url.toString();
}

export async function exchangeSimklAuthorizationCode({
  clientId,
  clientSecret,
  code,
  redirectUri,
  fetchImpl = fetch
}) {
  const response = await fetchImpl(SIMKL_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Nuvio-Sync-Bridge/1.0'
    },
    body: JSON.stringify({
      code: requiredString(code, 'Simkl authorization code'),
      client_id: requiredString(clientId, 'Simkl client ID'),
      client_secret: requiredString(clientSecret, 'Simkl client secret'),
      redirect_uri: requiredString(redirectUri, 'Simkl redirect URI'),
      grant_type: 'authorization_code'
    })
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const error = new Error(
      `Simkl token exchange failed: ${responseDetail(data, response.statusText || `HTTP ${response.status}`)}`
    );
    error.upstreamStatus = response.status;
    throw error;
  }
  if (!data || typeof data !== 'object' || typeof data.access_token !== 'string' || !data.access_token) {
    throw new Error('Simkl token exchange failed: the response did not include an access token.');
  }

  return data;
}

export function renderSimklOAuthCallback({ state, clientId, tokens, returnOrigin }) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Simkl Auth Callback</title>
    </head>
    <body style="background: #0d0e12; color: #ffffff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
      <div style="text-align: center; border: 1px solid #1c1e24; border-radius: 12px; padding: 24px; background: #07080a;">
        <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">Authentication successful!</p>
        <p style="margin: 0; font-size: 14px; color: #9ca3af;">Returning to the wiki...</p>
      </div>
      <script>
        try {
          if (window.opener) {
            window.opener.postMessage({
              source: 'simkl-oauth',
              status: 'success',
              state: ${inlineJson(requiredString(state, 'Simkl OAuth state'))},
              client_id: ${inlineJson(requiredString(clientId, 'Simkl client ID'))},
              tokens: ${inlineJson(tokens)}
            }, ${inlineJson(requiredString(returnOrigin, 'Simkl return origin'))});
            window.close();
          } else {
            document.querySelector('div').innerHTML = '<p style="margin: 0; font-size: 16px;">Authentication successful! You can close this window now.</p>';
          }
        } catch (err) {
          console.error('Error posting message back:', err);
          document.querySelector('div').innerHTML = '<p style="margin: 0; color: #ef4444;">Failed to communicate with the main window. Please close this window and try again.</p>';
        }
      </script>
    </body>
    </html>
  `;
}
