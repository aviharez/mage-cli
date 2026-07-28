export const UPDATE_METADATA_URL = 'https://mage.apps.ocpdevgra.dti.co.id/update.json';

const SEMVER = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export const parseSemver = (value) => {
  const match = typeof value === 'string' ? value.trim().match(SEMVER) : null;
  if (!match) return null;
  return { original: value, core: match.slice(1, 4).map(Number), prerelease: match[4]?.split('.') || [] };
};

export const compareSemver = (left, right) => {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) throw new Error('Invalid semantic version');
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1;
  }
  if (!a.prerelease.length && !b.prerelease.length) return 0;
  if (!a.prerelease.length) return 1;
  if (!b.prerelease.length) return -1;
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    const av = a.prerelease[index];
    const bv = b.prerelease[index];
    if (av === undefined) return -1;
    if (bv === undefined) return 1;
    if (av === bv) continue;
    const an = /^\d+$/.test(av);
    const bn = /^\d+$/.test(bv);
    if (an && bn) return Number(av) > Number(bv) ? 1 : -1;
    if (an !== bn) return an ? -1 : 1;
    return av > bv ? 1 : -1;
  }
  return 0;
};

export const validateUpdateMetadata = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Update metadata must be an object');
  if (!parseSemver(value.version)) throw new Error('Update metadata has an invalid version');
  let releaseUrl;
  try {
    releaseUrl = new URL(value.releaseUrl);
  } catch {
    throw new Error('Update metadata has an invalid release URL');
  }
  if (releaseUrl.protocol !== 'https:' || !releaseUrl.hostname) throw new Error('Update release URL must be absolute HTTPS');
  if (value.notes !== undefined && typeof value.notes !== 'string') throw new Error('Update metadata notes must be a string');
  return { version: value.version, releaseUrl: releaseUrl.toString(), notes: value.notes };
};

export const checkForUpdate = async ({ currentVersion, fetch = globalThis.fetch, timeoutMs = 10_000, url = UPDATE_METADATA_URL }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`Update metadata request failed (${response.status})`);
    const metadata = validateUpdateMetadata(await response.json());
    if (!parseSemver(currentVersion)) throw new Error('Current version is invalid');
    return {
      available: compareSemver(metadata.version, currentVersion) > 0,
      currentVersion,
      version: metadata.version,
      releaseUrl: metadata.releaseUrl,
      ...(metadata.notes === undefined ? {} : { body: metadata.notes }),
      installMode: 'external',
    };
  } finally {
    clearTimeout(timeout);
  }
};
