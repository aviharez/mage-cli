import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(electronRoot, '../..');

const readExpectedVersion = () => {
  return JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'packages', 'mage', 'package.json'), 'utf8')).version;
};

const binaryName = () => process.platform === 'win32' ? 'mage.exe' : 'mage';

const runVersion = (binaryPath) => {
  const result = spawnSync(binaryPath, ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15000,
    windowsHide: true,
  });
  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr.trim()}` : '';
    const stdout = result.stdout ? `\n${result.stdout.trim()}` : '';
    throw new Error(`Failed to run bundled Mage CLI: ${binaryPath}${stderr}${stdout}`);
  }
  return (result.stdout || '').trim().split(/\s+/)[0] || '';
};

const assertBinary = (binaryPath, expectedVersion) => {
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Bundled Mage CLI not found: ${binaryPath}`);
  }
  const stat = fs.statSync(binaryPath);
  if (!stat.isFile()) {
    throw new Error(`Bundled Mage CLI is not a file: ${binaryPath}`);
  }
  if (process.platform !== 'win32' && (stat.mode & 0o111) === 0) {
    throw new Error(`Bundled Mage CLI is not executable: ${binaryPath}`);
  }
  const actualVersion = runVersion(binaryPath);
  if (actualVersion !== expectedVersion && !actualVersion.startsWith(`${expectedVersion}-`)) {
    throw new Error(`Bundled Mage CLI version mismatch at ${binaryPath}: expected ${expectedVersion}, got ${actualVersion || '(empty)'}`);
  }
  console.log(`[electron] verified bundled Mage CLI ${actualVersion}: ${binaryPath}`);
};

const findPackagedBinaries = () => {
  const distDir = path.join(electronRoot, 'dist');
  if (!fs.existsSync(distDir)) return [];

  const candidates = [];
  const targetBinary = binaryName().toLowerCase();
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (!entry.isFile() || entry.name.toLowerCase() !== targetBinary) continue;
      const parent = path.basename(path.dirname(fullPath)).toLowerCase();
      if (parent === 'mage-cli') {
        candidates.push(fullPath);
      }
    }
  };
  visit(distDir);
  return candidates;
};

const usage = () => {
  console.error('Usage: node scripts/verify-mage-cli.mjs --staged|--packaged');
  process.exit(2);
};

const main = () => {
  const mode = process.argv[2];
  if (mode !== '--staged' && mode !== '--packaged') usage();

  const expectedVersion = readExpectedVersion();
  if (mode === '--staged') {
    assertBinary(path.join(electronRoot, 'resources', 'mage-cli', binaryName()), expectedVersion);
    return;
  }

  const packagedBinaries = findPackagedBinaries();
  if (packagedBinaries.length === 0) {
    throw new Error('No packaged Mage CLI found under packages/electron/dist');
  }
  for (const packagedBinary of packagedBinaries) {
    assertBinary(packagedBinary, expectedVersion);
  }
};

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
