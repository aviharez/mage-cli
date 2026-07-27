export const resolveManagedMageCwd = ({ env, homedir }) => {
  const configured = typeof env?.MAGE_MAGE_CWD === 'string'
    ? env.MAGE_MAGE_CWD.trim()
    : '';
  if (configured) {
    return configured;
  }

  const home = typeof homedir === 'function' ? homedir() : '';
  return typeof home === 'string' && home.trim() ? home : process.cwd();
};
