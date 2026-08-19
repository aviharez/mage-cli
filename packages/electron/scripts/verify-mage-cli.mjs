import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isCrossBuild, targetArch, targetBinaryName, targetPlatform } from './target.mjs';

const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(electronRoot, '../..');

export const readExpectedVersion = () => JSON.parse(
  fs.readFileSync(path.join(workspaceRoot, 'packages', 'mage', 'package.json'), 'utf8'),
).version;

const readManifest = (root, target, expectedVersion) => {
  const manifestPath = path.join(root, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`Mage CLI manifest not found: ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const [key, expected] of Object.entries({
    version: expectedVersion,
    platform: target.targetPlatform,
    arch: target.targetArch,
    binary: target.targetBinaryName,
  })) {
    if (manifest[key] !== expected && !(key === 'version' && String(manifest[key]).startsWith(`${expected}-`))) {
      throw new Error(`Mage CLI manifest mismatch at ${manifestPath}: ${key} expected ${expected}, got ${manifest[key]}`);
    }
  }
};

const runVersion = (binaryPath) => {
  const result = spawnSync(binaryPath, ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15000,
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`Failed to run bundled Mage CLI: ${binaryPath}\n${result.stderr || result.stdout || ''}`);
  return (result.stdout || '').trim().split(/\s+/)[0] || '';
};

export const assertMageCli = (root, {
  cross,
  target = {},
  expectedVersion = readExpectedVersion(),
  runVersion: executeVersion = runVersion,
} = {}) => {
  const actualTargetPlatform = target.targetPlatform ?? targetPlatform;
  const actualTarget = {
    targetPlatform: actualTargetPlatform,
    targetArch: target.targetArch ?? targetArch,
    targetBinaryName: target.targetBinaryName ?? (actualTargetPlatform === 'win32' ? 'mage.exe' : 'mage'),
    isCrossBuild: target.isCrossBuild ?? isCrossBuild,
  };
  const isForeign = cross ?? actualTarget.isCrossBuild;
  const binaryPath = path.join(root, actualTarget.targetBinaryName);
  if (!fs.existsSync(binaryPath)) throw new Error(`Bundled Mage CLI not found: ${binaryPath}`);
  const stat = fs.statSync(binaryPath);
  if (!stat.isFile() || stat.size === 0) throw new Error(`Bundled Mage CLI is missing or empty: ${binaryPath}`);
  if (isForeign && actualTarget.targetPlatform === 'win32') {
    if (fs.readFileSync(binaryPath).subarray(0, 2).toString() !== 'MZ') {
      throw new Error(`Expected Windows PE Mage CLI: ${binaryPath}`);
    }
  } else if (!isForeign && (stat.mode & 0o111) === 0) {
    throw new Error(`Bundled Mage CLI is not executable: ${binaryPath}`);
  }
  readManifest(root, actualTarget, expectedVersion);
  if (!isForeign) {
    const actualVersion = executeVersion(binaryPath);
    if (actualVersion !== expectedVersion && !actualVersion.startsWith(`${expectedVersion}-`)) {
      throw new Error(`Bundled Mage CLI version mismatch at ${binaryPath}: expected ${expectedVersion}, got ${actualVersion}`);
    }
    console.log(`[electron] verified bundled Mage CLI ${actualVersion}: ${binaryPath}`);
    return;
  }
  console.log(`[electron] structurally verified foreign Mage CLI ${actualTarget.targetPlatform}-${actualTarget.targetArch}: ${binaryPath}`);
};

const walk = (root) => fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
  const target = path.join(root, entry.name);
  return entry.isDirectory() ? walk(target) : [target];
});

export const findPackagedMageRoots = () => {
  const distDir = path.join(electronRoot, 'dist');
  if (!fs.existsSync(distDir)) return [];
  return walk(distDir)
    .filter((file) => path.basename(file).toLowerCase() === targetBinaryName.toLowerCase())
    .map((file) => path.dirname(file))
    .filter((root) => path.basename(root).toLowerCase() === 'mage-cli');
};

export const main = () => {
  const mode = process.argv[2];
  if (mode !== '--staged' && mode !== '--packaged') {
    console.error('Usage: node scripts/verify-mage-cli.mjs --staged|--packaged');
    process.exit(2);
  }
  if (mode === '--staged') {
    assertMageCli(path.join(electronRoot, 'resources', 'mage-cli'));
    return;
  }
  const roots = findPackagedMageRoots();
  if (roots.length === 0) throw new Error('No packaged Mage CLI found under packages/electron/dist');
  roots.forEach((root) => assertMageCli(root));
};

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
