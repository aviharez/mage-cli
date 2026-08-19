import path from 'node:path';

const hostPlatform = process.platform;
const hostArch = process.arch;

export const resolveTarget = ({ env = process.env, platform = hostPlatform, arch = hostArch } = {}) => {
  const targetPlatform = env.MAGE_ELECTRON_TARGET_PLATFORM || platform;
  const targetArch = env.MAGE_ELECTRON_TARGET_ARCH || arch;
  return {
    targetPlatform,
    targetArch,
    isCrossBuild: targetPlatform !== platform || targetArch !== arch,
    targetBinaryName: targetPlatform === 'win32' ? 'mage.exe' : 'mage',
  };
};

export const resolveMageArtifact = (distRoot, platform = targetPlatform, arch = targetArch) => {
  const packageName = `mage-${platform === 'win32' ? 'windows' : platform}-${arch}`;
  return {
    packageName,
    bin: path.join(distRoot, '@mybcabisnis', packageName, 'bin'),
  };
};

const target = resolveTarget();

export const targetPlatform = target.targetPlatform;
export const targetArch = target.targetArch;
export const isCrossBuild = target.isCrossBuild;
export const targetBinaryName = target.targetBinaryName;
