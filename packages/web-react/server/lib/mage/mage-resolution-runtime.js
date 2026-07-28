export const createMageResolutionRuntime = (dependencies) => {
  const {
    path,
    resolveMageCliPath,
    applyMageBinaryFromSettings,
    ensureMageCliEnv,
    resolveManagedMageLaunchSpec,
    getResolvedState,
    setResolvedMageBinarySource,
  } = dependencies;

  const getMageResolutionSnapshot = async (settings) => {
    const configured = typeof settings?.mageBinary === 'string' ? settings.mageBinary : null;

    const { resolvedMageBinarySource: previousSource } = getResolvedState();
    const detectedNow = resolveMageCliPath();
    const { resolvedMageBinarySource: rawDetectedSourceNow } = getResolvedState();
    setResolvedMageBinarySource(previousSource);

    await applyMageBinaryFromSettings();
    ensureMageCliEnv();

    const {
      resolvedMageBinary,
      resolvedMageBinarySource,
      useWslForMage,
      resolvedWslBinary,
      resolvedWslMagePath,
      resolvedWslDistro,
      resolvedNodeBinary,
      resolvedBunBinary,
    } = getResolvedState();

    const resolved = resolvedMageBinary || null;
    const source = resolvedMageBinarySource || null;
    const detectedSourceNow =
      detectedNow &&
      resolved &&
      detectedNow === resolved &&
      rawDetectedSourceNow === 'env' &&
      source &&
      source !== 'env'
        ? source
        : rawDetectedSourceNow;
    const launchSpec = resolved && !useWslForMage
      ? resolveManagedMageLaunchSpec(resolved)
      : null;

    return {
      configured,
      resolved,
      resolvedDir: resolved ? path.dirname(resolved) : null,
      source,
      detectedNow,
      detectedSourceNow,
      launchBinary: launchSpec?.binary || null,
      launchArgs: launchSpec?.args || [],
      launchWrapperType: launchSpec?.wrapperType || null,
      viaWsl: useWslForMage,
      wslBinary: resolvedWslBinary || null,
      wslPath: resolvedWslMagePath || null,
      wslDistro: resolvedWslDistro || null,
      node: resolvedNodeBinary || null,
      bun: resolvedBunBinary || null,
    };
  };

  return {
    getMageResolutionSnapshot,
  };
};
