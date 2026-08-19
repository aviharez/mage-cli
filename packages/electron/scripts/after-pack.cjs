const fs = require('node:fs');
const path = require('node:path');

module.exports = (context) => {
  if (context.electronPlatformName === 'win32') {
    const nativeRoot = path.join(__dirname, '..', 'resources', 'native');
    const unpackedRoot = path.join(context.appOutDir, 'resources', 'app.asar.unpacked', 'node_modules');
    fs.mkdirSync(path.join(unpackedRoot, 'better-sqlite3', 'build', 'Release'), { recursive: true });
    fs.copyFileSync(
      path.join(nativeRoot, 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
      path.join(unpackedRoot, 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
    );
    fs.cpSync(
      path.join(nativeRoot, 'sherpa-onnx-win-x64'),
      path.join(unpackedRoot, 'sherpa-onnx-win-x64'),
      { recursive: true },
    );
    return import('./validate-native.mjs').then(({ validateNativeTree }) => {
      const files = validateNativeTree(context.appOutDir, 'win32');
      console.log(`[electron] validated ${files.length} packaged Windows native files`);
    });
  }
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appBundlePath = path.join(context.appOutDir, `${appName}.app`);
  const resourcesPath = path.join(appBundlePath, 'Contents', 'Resources');
  const sourceAssetsPath = path.join(__dirname, '..', 'resources', 'icons', 'Assets.car');

  if (!fs.existsSync(sourceAssetsPath)) {
    throw new Error(`Missing compiled app icon asset catalog at ${sourceAssetsPath}`);
  }

  fs.copyFileSync(sourceAssetsPath, path.join(resourcesPath, 'Assets.car'));
};
