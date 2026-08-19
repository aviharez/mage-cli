import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { targetArch, targetPlatform } from './target.mjs';
import { validateNativeTree } from './validate-native.mjs';

const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };
const builderArgs = process.argv.slice(2);
const packageJson = JSON.parse(fs.readFileSync(path.join(electronRoot, 'package.json'), 'utf8'));
const nativeRoot = path.join(electronRoot, 'resources', 'native');
const sherpaName = `sherpa-onnx-${targetPlatform === 'win32' ? 'win' : targetPlatform}-${targetArch}`;

if (targetPlatform === 'win32' && !builderArgs.includes('--win')) builderArgs.push('--win');
if (targetPlatform === 'darwin' && !builderArgs.includes('--mac')) builderArgs.push('--mac');
if (targetPlatform === 'win32' && !builderArgs.some((arg) => ['--x64', '--arm64', '--ia32'].includes(arg))) {
  builderArgs.push(`--${targetArch}`);
}

if (targetPlatform === 'win32' && !env.CSC_LINK && !env.WINDOWS_CSC_LINK) {
  env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  console.log('[electron] Windows code signing disabled; building unsigned installer.');
}

const configPath = path.join(electronRoot, '.electron-builder.generated.json');
const buildConfig = {
  ...packageJson.build,
  files: [
    ...packageJson.build.files,
    '!node_modules/node-pty/prebuilds/**',
    '!node_modules/node-pty/bin/**',
    '!node_modules/node-pty/build/**',
    '!node_modules/sherpa-onnx-*/**',
    '!node_modules/better-sqlite3/build/**',
    { from: 'resources/native/better-sqlite3/build/Release/better_sqlite3.node', to: 'node_modules/better-sqlite3/build/Release/better_sqlite3.node' },
    { from: 'resources/native/node-pty', to: 'node_modules/node-pty' },
    { from: `resources/native/${sherpaName}`, to: `node_modules/${sherpaName}` },
  ],
  asarUnpack: [
    'node_modules/**/*.node',
    'node_modules/**/*.dll',
    'node_modules/**/*.exe',
    'node_modules/better-sqlite3/build/Release/*.node',
    `node_modules/${sherpaName}/*.node`,
    `node_modules/${sherpaName}/*.dll`,
  ],
};

validateNativeTree(nativeRoot, targetPlatform);
fs.writeFileSync(configPath, JSON.stringify(buildConfig, null, 2));

const bunBinaryCandidates = [
  process.env.npm_execpath,
  process.env.BUN_INSTALL ? path.join(process.env.BUN_INSTALL, 'bin', process.platform === 'win32' ? 'bun.exe' : 'bun') : null,
  process.platform === 'win32' ? 'bun.exe' : 'bun',
].filter(Boolean);

const bunBinary = bunBinaryCandidates.find((candidate) => {
  if (path.basename(candidate).toLowerCase().startsWith('bun')) {
    return candidate === 'bun' || candidate === 'bun.exe' || fs.existsSync(candidate);
  }
  return false;
}) || (process.platform === 'win32' ? 'bun.exe' : 'bun');

const child = spawn(bunBinary, ['x', 'electron-builder', '--config', configPath, ...builderArgs], {
  cwd: electronRoot,
  env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  fs.rmSync(configPath, { force: true });
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  fs.rmSync(configPath, { force: true });
  console.error('[electron] failed to start electron-builder:', error);
  process.exit(1);
});
