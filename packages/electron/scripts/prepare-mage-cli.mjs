#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveMageArtifact, targetArch, targetBinaryName, targetPlatform } from './target.mjs';

const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(electronRoot, '../..');
const mageRoot = path.join(repoRoot, 'packages', 'mage');
const distRoot = path.join(mageRoot, 'dist');
const stagedRoot = path.join(electronRoot, 'resources', 'mage-cli');
const magePackage = JSON.parse(fs.readFileSync(path.join(mageRoot, 'package.json'), 'utf8'));
const artifactBin = resolveMageArtifact(distRoot).bin;

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw result.error || new Error(`${command} exited with ${result.status}`);
};

const assertFile = (filePath) => {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile() || fs.statSync(filePath).size === 0) {
    throw new Error(`Missing or empty Mage artifact: ${filePath}`);
  }
};

const main = () => {
  run(process.platform === 'win32' ? 'bun.exe' : 'bun', [
    'run',
    '--cwd',
    'packages/mage',
    'build',
    '--',
    '--single',
    '--target-os',
    targetPlatform,
    '--target-arch',
    targetArch,
  ]);

  const sourceBinary = path.join(artifactBin, targetBinaryName);
  assertFile(sourceBinary);
  for (const binary of targetPlatform === 'win32' ? ['rg.exe', 'rtk.exe'] : ['rg', 'rtk']) {
    assertFile(path.join(artifactBin, binary));
  }

  fs.rmSync(stagedRoot, { recursive: true, force: true });
  fs.mkdirSync(stagedRoot, { recursive: true });
  fs.cpSync(artifactBin, stagedRoot, { recursive: true });
  const stagedBinary = path.join(stagedRoot, targetBinaryName);
  if (targetPlatform !== 'win32') fs.chmodSync(stagedBinary, 0o755);
  fs.writeFileSync(
    path.join(stagedRoot, 'manifest.json'),
    `${JSON.stringify({
      version: magePackage.version,
      platform: targetPlatform,
      arch: targetArch,
      binary: targetBinaryName,
    }, null, 2)}\n`,
  );
  console.log(`[electron] staged Mage CLI ${magePackage.version} ${targetPlatform}-${targetArch}: ${stagedRoot}`);
};

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
