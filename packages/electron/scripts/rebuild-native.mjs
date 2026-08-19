#!/usr/bin/env node
import path from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import fsp from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { rebuild } from '@electron/rebuild';
import semver from 'semver';
import { isCrossBuild, targetArch, targetPlatform } from './target.mjs';
import { validateNativeTree } from './validate-native.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const electronDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(electronDir, '..', '..');
const webReactDir = path.join(repoRoot, 'packages', 'web-react');
const require = createRequire(import.meta.url);
const webReactRequire = createRequire(path.join(webReactDir, 'package.json'));

const electronPkg = require('electron/package.json');
const electronVersion = electronPkg.version;
const nativeRoot = path.join(electronDir, 'resources', 'native');

const copyDirectory = async (src, dst) => {
  await fsp.mkdir(dst, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(from, to);
    } else {
      await fsp.copyFile(from, to);
    }
  }
};

const getWindowsShortPath = (target) => {
  if (process.platform !== 'win32') return target;
  try {
    const escaped = target.replace(/'/g, "''");
    const output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `$fso = New-Object -ComObject Scripting.FileSystemObject; $fso.GetFolder('${escaped}').ShortPath`],
      { encoding: 'utf8' },
    ).trim();
    return output || target;
  } catch {
    return target;
  }
};

const createWindowsRebuildPath = (target) => {
  if (process.platform !== 'win32') {
    return { buildPath: target, cleanup: () => {} };
  }

  for (const letter of 'ZYXWVUTSRQPONMLKJIHGFED') {
    const drive = `${letter}:`;
    if (existsSync(`${drive}\\`)) continue;
    try {
      execFileSync('subst.exe', [drive, target], { stdio: 'ignore' });
      return {
        buildPath: `${drive}\\`,
        cleanup: () => {
          try {
            execFileSync('subst.exe', [drive, '/d'], { stdio: 'ignore' });
          } catch {
            // Best-effort cleanup. The build result should not depend on this.
          }
        },
      };
    } catch {
      // Try the next drive letter.
    }
  }

  const shortPath = getWindowsShortPath(target);
  if (shortPath === target && /\s/.test(target)) {
    throw new Error(
      `Unable to create a space-free Windows rebuild path for ${target}. `
      + 'All subst drive letters are unavailable and the volume did not return an 8.3 short path.',
    );
  }

  return { buildPath: shortPath, cleanup: () => {} };
};

const writeWindowsNodeAddonApiIndex = async (nodeAddonApiDir, exportedNodeAddonApiDir) => {
  if (process.platform !== 'win32') return;

  const shortDir = getWindowsShortPath(exportedNodeAddonApiDir);
  await fsp.writeFile(
    path.join(nodeAddonApiDir, 'index.js'),
    `const path = require('path');

const includeDir = ${JSON.stringify(shortDir)};

module.exports = {
  include: \`"${shortDir}"\`,
  include_dir: includeDir,
  gyp: path.join(includeDir, 'node_api.gyp:nothing'),
  targets: path.join(includeDir, 'node_addon_api.gyp'),
  isNodeApiBuiltin: true,
  needsFlag: false
};

`,
  );
};

const resolveOptionalPackageDir = (packageName, versionRange) => {
  const candidates = [];
  try {
    candidates.push(path.dirname(webReactRequire.resolve(`${packageName}/package.json`)));
  } catch {}
  const storeRoot = path.join(repoRoot, 'node_modules', '.bun');
  if (existsSync(storeRoot)) {
    candidates.push(...readdirSync(storeRoot)
      .filter((entry) => entry.startsWith(`${packageName}@`))
      .map((entry) => path.join(storeRoot, entry, 'node_modules', packageName))
      .filter((candidate) => existsSync(path.join(candidate, 'package.json'))));
  }
  const versions = candidates.map((candidate) => JSON.parse(
    readFileSync(path.join(candidate, 'package.json'), 'utf8'),
  ).version);
  const selectedVersion = semver.maxSatisfying(versions, versionRange);
  if (!selectedVersion) {
    throw new Error(`No installed ${packageName} satisfies optional dependency range ${versionRange}`);
  }
  return candidates.find((candidate) => JSON.parse(
    readFileSync(path.join(candidate, 'package.json'), 'utf8'),
  ).version === selectedVersion);
};

const ensureWindowsNodeAddonApiForNodePty = async (rebuildRootPath) => {
  if (process.platform !== 'win32') return async () => {};

  const nodePtyPackagePath = webReactRequire.resolve('node-pty/package.json');
  const nodePtyDir = path.dirname(nodePtyPackagePath);
  const rootNodeAddonApiDir = path.dirname(webReactRequire.resolve('node-addon-api/package.json'));
  const tempNodeAddonApiDir = path.join(rebuildRootPath, 'node_modules', '.mage-node-addon-api-7.1.1');
  const exportedTempNodeAddonApiDir = path.join(rebuildRootPath, 'node_modules', '.mage-node-addon-api-7.1.1');
  const localNodeAddonApiDir = path.join(nodePtyDir, 'node_modules', 'node-addon-api');

  await fsp.rm(tempNodeAddonApiDir, { recursive: true, force: true });
  await copyDirectory(rootNodeAddonApiDir, tempNodeAddonApiDir);
  await fsp.access(path.join(tempNodeAddonApiDir, 'package.json'));

  await fsp.rm(localNodeAddonApiDir, { recursive: true, force: true });
  await copyDirectory(rootNodeAddonApiDir, localNodeAddonApiDir);
  await writeWindowsNodeAddonApiIndex(localNodeAddonApiDir, exportedTempNodeAddonApiDir);
  await fsp.access(path.join(localNodeAddonApiDir, 'package.json'));

  return async () => {
    await fsp.rm(localNodeAddonApiDir, { recursive: true, force: true });
    await fsp.rm(tempNodeAddonApiDir, { recursive: true, force: true });
  };
};

const stageCrossNativeDependencies = async () => {
  await fsp.rm(nativeRoot, { recursive: true, force: true });
  await fsp.mkdir(nativeRoot, { recursive: true });

  const betterPackagePath = webReactRequire.resolve('better-sqlite3/package.json');
  const betterPackage = JSON.parse(await fsp.readFile(betterPackagePath, 'utf8'));
  const betterRequire = createRequire(betterPackagePath);
  const betterStage = path.join(nativeRoot, 'better-sqlite3');
  await fsp.mkdir(betterStage, { recursive: true });
  await fsp.writeFile(path.join(betterStage, 'package.json'), JSON.stringify(betterPackage));

  if (isCrossBuild) {
    const prebuildInstall = betterRequire.resolve('prebuild-install/bin.js');
    execFileSync(process.execPath, [
      prebuildInstall,
      '--runtime',
      'electron',
      '--target',
      electronVersion,
      '--platform',
      targetPlatform,
      '--arch',
      targetArch,
      '--force',
      '--path',
      betterStage,
    ], { cwd: betterStage, stdio: 'inherit', windowsHide: true });
  }

  const betterBinary = path.join(betterStage, 'build', 'Release', 'better_sqlite3.node');
  const betterSource = isCrossBuild
    ? betterBinary
    : path.join(path.dirname(betterPackagePath), 'build', 'Release', 'better_sqlite3.node');
  if (!existsSync(betterSource)) throw new Error(`No Electron ${targetPlatform}-${targetArch} better-sqlite3 binary at ${betterSource}`);
  await fsp.mkdir(path.join(nativeRoot, 'better-sqlite3', 'build', 'Release'), { recursive: true });
  await fsp.copyFile(
    betterSource,
    path.join(nativeRoot, 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
  );

  const nodePtyDir = path.dirname(webReactRequire.resolve('node-pty/package.json'));
  await copyDirectory(
    path.join(nodePtyDir, 'prebuilds', `${targetPlatform}-${targetArch}`),
    path.join(nativeRoot, 'node-pty', 'prebuilds', `${targetPlatform}-${targetArch}`),
  );

  const sherpaName = `sherpa-onnx-${targetPlatform === 'win32' ? 'win' : targetPlatform}-${targetArch}`;
  const sherpaNodePackage = JSON.parse(await fsp.readFile(
    webReactRequire.resolve('sherpa-onnx-node/package.json'),
    'utf8',
  ));
  const sherpaRange = sherpaNodePackage.optionalDependencies?.[sherpaName];
  if (!sherpaRange) throw new Error(`sherpa-onnx-node declares no optional dependency for ${sherpaName}`);
  const sherpaDir = resolveOptionalPackageDir(sherpaName, sherpaRange);
  await copyDirectory(sherpaDir, path.join(nativeRoot, sherpaName));
  const files = validateNativeTree(nativeRoot, targetPlatform);
  console.log(`[electron] staged ${files.length} ${targetPlatform}-${targetArch} native files`);
};

if (isCrossBuild) {
  console.log(`[electron] staging ${targetPlatform}-${targetArch} native prebuilts for Electron ${electronVersion}...`);
  await stageCrossNativeDependencies();
  process.exit(0);
}

console.log(`[electron] rebuilding native modules against Electron ${electronVersion}...`);

// Rebuild from the web-react package so ModuleWalker sees its native deps.
// force=true re-links regardless of cached state; prebuild-install lookup is
// bypassed by @electron/rebuild in favor of direct node-gyp builds.
const rebuildPath = createWindowsRebuildPath(webReactDir);
let cleanupNodeAddonApi = async () => {};
try {
  cleanupNodeAddonApi = await ensureWindowsNodeAddonApiForNodePty(rebuildPath.buildPath);
  await rebuild({
    buildPath: rebuildPath.buildPath,
    electronVersion,
    force: true,
    arch: process.env.ELECTRON_BUILDER_ARCH || process.arch,
    onlyModules: ['better-sqlite3', 'node-pty'],
  });
} finally {
  try {
    await cleanupNodeAddonApi();
  } finally {
    rebuildPath.cleanup();
  }
}

console.log('[electron] native modules rebuilt successfully');

await stageCrossNativeDependencies();
