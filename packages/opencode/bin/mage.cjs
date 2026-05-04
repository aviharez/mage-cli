#!/usr/bin/env node
/**
 * Platform wrapper — selects the correct pre-compiled Mage binary for the
 * current OS and CPU architecture, then hands off execution to it.
 *
 * Requires only Node.js; end users do NOT need Bun installed.
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const platform = os.platform(); // 'win32' | 'darwin' | 'linux'
const arch = os.arch();         // 'x64' | 'arm64'

function resolveBinary() {
  const pkgName = require('../package.json').name;
  const osName = platform === 'win32' ? 'windows' : platform;
  const dirName = `${pkgName}-${osName}-${arch}`;
  const binName = platform === 'win32' ? 'opencode.exe' : 'opencode';
  return path.join(dirName, 'bin', binName);
}

const binarySuffix = resolveBinary();
const binaryPath = path.join(__dirname, '..', 'dist', binarySuffix);

if (!fs.existsSync(binaryPath)) {
  console.error(
    `[mage] Binary not found: ${binaryPath}\n` +
    `[mage] Platform detected: ${platform}/${arch}\n` +
    `[mage] Please report this at your internal issue tracker.`
  );
  process.exit(1);
}

const result = spawnSync(binaryPath, process.argv.slice(2), { stdio: 'inherit' });
process.exit(result.status ?? 1);
