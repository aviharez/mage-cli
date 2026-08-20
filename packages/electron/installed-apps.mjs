import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const appInfo = (name) => ({ name, iconDataUrl: null });
const candidateNames = (names) => (Array.isArray(names) ? names : [])
  .filter((name) => typeof name === 'string' && name.trim())
  .map((name) => name.trim());

const installedMacAppNames = (candidates, run) => {
  const result = run('/usr/bin/mdfind', ['kMDItemContentType == "com.apple.application-bundle"'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const names = result.status === 0
    ? String(result.stdout || '').split(/\r?\n/).map((value) => path.basename(value.trim(), '.app')).filter(Boolean)
    : [];
  const standardDirectories = ['/Applications', '/System/Applications', path.join(os.homedir(), 'Applications')];
  return new Set([
    ...names,
    ...standardDirectories.flatMap((directory) => candidates.filter((name) => fs.existsSync(path.join(directory, `${name}.app`)))),
  ].map((name) => name.toLowerCase()));
};

const installedWindowsAppNames = (run) => {
  const result = run('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    'Get-StartApps | Select-Object -ExpandProperty Name',
  ], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  return new Set(result.status === 0
    ? String(result.stdout || '').split(/\r?\n/).map((value) => value.trim()).filter(Boolean).map((name) => name.toLowerCase())
    : []);
};

export const installedApps = (names, platform = process.platform, run = spawnSync) => {
  const candidates = candidateNames(names);
  if (!candidates.length) return [];

  const installed = platform === 'darwin'
    ? installedMacAppNames(candidates, run)
    : platform === 'win32'
      ? installedWindowsAppNames(run)
      : new Set();

  return candidates.filter((name) => installed.has(name.toLowerCase())).map(appInfo);
};
