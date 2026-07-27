#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(electronRoot, '../..');
const mageRoot = path.join(repoRoot, 'packages', 'mage');
const distRoot = path.join(mageRoot, 'dist');
const stagedRoot = path.join(electronRoot, 'resources', 'mage-cli');
const binaryName = process.platform === 'win32' ? 'mage.exe' : 'mage';
const expectedVersion = JSON.parse(fs.readFileSync(path.join(mageRoot, 'package.json'), 'utf8')).version;

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw result.error || new Error(`${command} exited with ${result.status}`);
};

const walk = (root) => fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
  const target = path.join(root, entry.name);
  return entry.isDirectory() ? walk(target) : [target];
});

const readVersion = (binary) => {
  const result = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  if (result.status !== 0) throw new Error(`Mage CLI failed: ${result.stderr || result.stdout || binary}`);
  return String(result.stdout || '').trim().split(/\s+/)[0] || '';
};

const main = () => {
  run(process.platform === 'win32' ? 'bun.exe' : 'bun', ['run', '--cwd', 'packages/mage', 'build', '--', '--single']);
  const candidates = walk(distRoot).filter((file) => path.basename(file).toLowerCase() === binaryName.toLowerCase());
  const preferred = candidates.find((file) => path.basename(path.dirname(file)) === 'bin' && !file.includes('baseline'));
  if (!preferred) throw new Error(`No current-platform Mage CLI found under ${distRoot}`);
  fs.rmSync(stagedRoot, { recursive: true, force: true });
  fs.mkdirSync(stagedRoot, { recursive: true });
  fs.cpSync(path.dirname(preferred), stagedRoot, { recursive: true });
  const stagedBinary = path.join(stagedRoot, binaryName);
  if (process.platform !== 'win32') fs.chmodSync(stagedBinary, 0o755);
  const actualVersion = readVersion(stagedBinary);
  if (actualVersion !== expectedVersion && !actualVersion.startsWith(`${expectedVersion}-`)) {
    throw new Error(`Mage CLI version mismatch: expected ${expectedVersion}, got ${actualVersion}`);
  }
  console.log(`[electron] staged Mage CLI ${actualVersion}: ${stagedRoot}`);
};

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
