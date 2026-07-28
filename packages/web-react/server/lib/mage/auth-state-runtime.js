export const createMageAuthStateRuntime = (dependencies) => {
  const {
    crypto,
    process,
    getAuthPassword,
    setAuthPassword,
    getAuthSource,
    setAuthSource,
    getUserProvidedPassword,
    syncToHmrState,
  } = dependencies;

  const normalizeMagePassword = (value) => {
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim();
  };

  const isValidMagePassword = (password) => typeof password === 'string' && password.trim().length > 0;

  const generateSecureMagePassword = () =>
    crypto
      .randomBytes(32)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

  const setMageAuthState = (password, source) => {
    const normalized = normalizeMagePassword(password);
    if (!isValidMagePassword(normalized)) {
      setAuthPassword(null);
      setAuthSource(null);
      delete process.env.MAGE_SERVER_PASSWORD;
      syncToHmrState();
      return null;
    }

    setAuthPassword(normalized);
    setAuthSource(source);
    process.env.MAGE_SERVER_PASSWORD = normalized;
    syncToHmrState();
    return normalized;
  };

  const getMageAuthHeaders = () => {
    const password = normalizeMagePassword(getAuthPassword() || process.env.MAGE_SERVER_PASSWORD || '');

    if (!password) {
      return {};
    }

    const username = process.env.MAGE_SERVER_USERNAME?.trim() || 'mage';
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    return { Authorization: `Basic ${credentials}` };
  };

  const isMageConnectionSecure = () => Object.prototype.hasOwnProperty.call(getMageAuthHeaders(), 'Authorization');

  const ensureLocalMageServerPassword = async ({ rotateManaged = false } = {}) => {
    const userProvidedPassword = getUserProvidedPassword();
    if (isValidMagePassword(userProvidedPassword)) {
      return setMageAuthState(userProvidedPassword, 'user-env');
    }

    if (rotateManaged) {
      const rotatedPassword = setMageAuthState(generateSecureMagePassword(), 'rotated');
      console.log('Rotated secure password for managed local Mage instance');
      return rotatedPassword;
    }

    const currentPassword = getAuthPassword();
    const currentSource = getAuthSource();
    if (isValidMagePassword(currentPassword)) {
      return setMageAuthState(currentPassword, currentSource || 'generated');
    }

    const generatedPassword = setMageAuthState(generateSecureMagePassword(), 'generated');
    console.log('Generated secure password for managed local Mage instance');
    return generatedPassword;
  };

  return {
    getMageAuthHeaders,
    isMageConnectionSecure,
    ensureLocalMageServerPassword,
  };
};
