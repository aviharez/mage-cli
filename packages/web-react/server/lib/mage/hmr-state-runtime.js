export const createHmrStateRuntime = (dependencies) => {
  const {
    globalThisLike,
    os,
    processLike,
    stateKey,
  } = dependencies;

  const getInitialMageWorkingDirectory = () => {
    const configured = typeof processLike.env.MAGE_MAGE_CWD === 'string'
      ? processLike.env.MAGE_MAGE_CWD.trim()
      : '';
    return configured || os.homedir();
  };

  const getOrCreateHmrState = () => {
    if (!globalThisLike[stateKey]) {
      globalThisLike[stateKey] = {
        mageProcess: null,
        magePort: null,
        mageWorkingDirectory: getInitialMageWorkingDirectory(),
        isShuttingDown: false,
        signalsAttached: false,
        userProvidedMagePassword: undefined,
        mageAuthPassword: null,
        mageAuthSource: null,
      };
    }
    return globalThisLike[stateKey];
  };

  const ensureUserProvidedMagePassword = (hmrState) => {
    if (typeof hmrState.userProvidedMagePassword !== 'undefined') {
      return;
    }
    const initialPassword = typeof processLike.env.MAGE_SERVER_PASSWORD === 'string'
      ? processLike.env.MAGE_SERVER_PASSWORD.trim()
      : '';
    hmrState.userProvidedMagePassword = initialPassword || null;
  };

  const getUserProvidedMagePassword = (hmrState) => (
    typeof hmrState.userProvidedMagePassword === 'string' && hmrState.userProvidedMagePassword.length > 0
      ? hmrState.userProvidedMagePassword
      : null
  );

  const resolveMageAuthFromState = ({ hmrState, userProvidedMagePassword }) => ({
    mageAuthPassword:
      typeof hmrState.mageAuthPassword === 'string' && hmrState.mageAuthPassword.length > 0
        ? hmrState.mageAuthPassword
        : userProvidedMagePassword,
    mageAuthSource:
      typeof hmrState.mageAuthSource === 'string' && hmrState.mageAuthSource.length > 0
        ? hmrState.mageAuthSource
        : (userProvidedMagePassword ? 'user-env' : null),
  });

  const syncStateFromRuntime = (hmrState, runtime) => {
    hmrState.mageProcess = runtime.mageProcess;
    hmrState.magePort = runtime.magePort;
    hmrState.mageBaseUrl = runtime.mageBaseUrl;
    hmrState.isShuttingDown = runtime.isShuttingDown;
    hmrState.signalsAttached = runtime.signalsAttached;
    hmrState.mageWorkingDirectory = runtime.mageWorkingDirectory;
    hmrState.mageAuthPassword = runtime.mageAuthPassword;
    hmrState.mageAuthSource = runtime.mageAuthSource;
  };

  const restoreRuntimeFromState = ({ hmrState, userProvidedMagePassword }) => {
    const auth = resolveMageAuthFromState({ hmrState, userProvidedMagePassword });
    return {
      mageProcess: hmrState.mageProcess,
      magePort: hmrState.magePort,
      mageBaseUrl: hmrState.mageBaseUrl ?? null,
      isShuttingDown: hmrState.isShuttingDown,
      signalsAttached: hmrState.signalsAttached,
      mageWorkingDirectory: hmrState.mageWorkingDirectory,
      mageAuthPassword: auth.mageAuthPassword,
      mageAuthSource: auth.mageAuthSource,
    };
  };

  return {
    getOrCreateHmrState,
    ensureUserProvidedMagePassword,
    getUserProvidedMagePassword,
    resolveMageAuthFromState,
    syncStateFromRuntime,
    restoreRuntimeFromState,
  };
};
