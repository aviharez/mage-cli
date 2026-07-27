#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(electronRoot, '../..');
const executableName = (name) => process.platform === 'win32' ? `${name}.cmd` : name;
const vite = path.join(repoRoot, 'packages', 'web-react', 'node_modules', '.bin', executableName('vite'));
const electron = path.join(electronRoot, 'node_modules', '.bin', executableName('electron'));
const sdkRuntimeEntry = path.join(repoRoot, 'packages', 'sdk', 'js', 'dist', 'v2', 'index.js');

const ensureSdkRuntime = () => {
  if (fs.existsSync(sdkRuntimeEntry)) return;
  const result = spawnSync(
    process.platform === 'win32' ? 'bun.exe' : 'bun',
    ['./packages/sdk/js/script/build.ts'],
    { cwd: repoRoot, stdio: 'inherit', windowsHide: true },
  );
  if (result.error || result.status !== 0) throw result.error || new Error('Mage SDK runtime is missing and could not be generated.');
};

const freePort = (preferred) => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', (error) => {
    if (preferred) {
      void freePort(0).then(resolve, reject);
      return;
    }
    reject(error);
  });
  server.listen(preferred || 0, '127.0.0.1', () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    server.close(() => resolve(port));
  });
});

const stop = (child) => {
  if (!child || child.exitCode !== null) return;
  try { child.kill('SIGTERM'); } catch {}
};

const main = async () => {
  ensureSdkRuntime();
  const apiPort = await freePort(Number(process.env.MAGE_HMR_API_PORT) || 57123);
  const uiPort = await freePort(Number(process.env.MAGE_HMR_UI_PORT) || 5173);
  const env = {
    ...process.env,
    MAGE_ELECTRON_DEV: '1',
    MAGE_HMR_API_PORT: String(apiPort),
    MAGE_HMR_UI_PORT: String(uiPort),
  };
  const viteProcess = spawn(vite, ['--host', '127.0.0.1', '--port', String(uiPort)], { cwd: path.join(repoRoot, 'packages', 'web-react'), env, stdio: 'inherit' });
  const electronProcess = spawn(electron, [path.join(electronRoot, 'main.mjs')], { cwd: electronRoot, env, stdio: 'inherit', windowsHide: true });
  let stopping = false;
  const teardown = (code = 0) => {
    if (stopping) return;
    stopping = true;
    stop(electronProcess);
    stop(viteProcess);
    setTimeout(() => process.exit(code), 250);
  };
  electronProcess.on('exit', (code) => teardown(code || 0));
  viteProcess.on('error', () => teardown(1));
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGQUIT']) process.on(signal, () => teardown(0));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
