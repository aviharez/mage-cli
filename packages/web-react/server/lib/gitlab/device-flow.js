const DEVICE_CODE_URL = 'https://bcagitlab/oauth/authorize_device';
const ACCESS_TOKEN_URL = 'https://bcagitlab/oauth/token';

const postForm = async (url, params, fetchImpl = globalThis.fetch, allowOAuthError = false) => {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok && !(allowOAuthError && payload?.error)) {
    const error = new Error(payload?.error_description || payload?.error || response.statusText || 'GitLab OAuth request failed');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
};

export const startDeviceFlow = ({ clientId, scope, fetchImpl }) => postForm(DEVICE_CODE_URL, { client_id: clientId, scope }, fetchImpl);

export const exchangeDeviceCode = ({ clientId, deviceCode, fetchImpl }) => postForm(ACCESS_TOKEN_URL, {
  client_id: clientId,
  device_code: deviceCode,
  grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
}, fetchImpl, true);
