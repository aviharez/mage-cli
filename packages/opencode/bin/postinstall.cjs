#!/usr/bin/env node
/**
 * Postinstall hook — marks the platform binary as executable on Unix.
 * No-op on Windows (.exe files are always executable).
 */
'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');

if (os.platform() === 'win32') process.exit(0);

const arch = os.arch();
const platform = os.platform();

function resolveBinary() {
  const pkgName = require('../package.json').name;
  const osName = platform === 'win32' ? 'windows' : platform;
  const dirName = `${pkgName}-${osName}-${arch}`;
  const binName = platform === 'win32' ? 'opencode.exe' : 'opencode';
  return path.join(dirName, 'bin', binName);
}

const binaryPath = path.join(__dirname, '..', 'dist', resolveBinary());
if (!fs.existsSync(binaryPath)) process.exit(0);

try {
  fs.chmodSync(binaryPath, 0o755);
} catch {
  // Best-effort; non-fatal.
}
