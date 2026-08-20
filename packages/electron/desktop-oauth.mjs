import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn as spawnProcess } from 'node:child_process';

const OAUTH_FAILURE = 'Mage sign-in failed. Please try again.';
const OAUTH_START_FAILURE = 'Mage sign-in could not be started. Please try again.';
const MAX_DIAGNOSTIC_BYTES = 4096;

let pendingOAuth = null;

const mageConfigDirectory = ({ env = process.env, homedir = os.homedir } = {}) => {
  const mageHome = env.MAGE_TEST_HOME || homedir();
  return env.MAGE_CONFIG_DIR ? path.resolve(env.MAGE_CONFIG_DIR) : path.join(mageHome, '.mage');
};

export const credentialPath = (options = {}) => path.join(mageConfigDirectory(options), 'data', 'cred.json');

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

export const projectMageCredential = (value) => {
  if (!isRecord(value)) return null;
  const fields = ['udomain', 'display_name', 'access_token', 'refresh_token'];
  if (fields.some((field) => typeof value[field] !== 'string' || value[field].trim().length === 0)) return null;
  if (typeof value.expires_in !== 'number' || !Number.isFinite(value.expires_in)) return null;
  return {
    authenticated: true,
    displayName: value.display_name.trim(),
    udomain: value.udomain.trim(),
  };
};

export const getMageAuthStatus = async ({ env = process.env, homedir = os.homedir } = {}) => {
  try {
    const value = JSON.parse(await fsp.readFile(credentialPath({ env, homedir }), 'utf8'));
    return projectMageCredential(value) || { authenticated: false };
  } catch {
    return { authenticated: false };
  }
};

const drainOutput = (stream) => {
  let bytes = 0;
  stream?.on('data', (chunk) => {
    bytes = Math.min(MAX_DIAGNOSTIC_BYTES, bytes + Buffer.byteLength(String(chunk)));
  });
};

const runMageOAuth = async ({ mageBinary, env = process.env, homedir = os.homedir, spawn = spawnProcess }) => {
  if (!mageBinary) throw new Error(OAUTH_START_FAILURE);

  let child;
  try {
    child = spawn(mageBinary, ['init'], {
      env: { ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch {
    throw new Error(OAUTH_START_FAILURE);
  }

  drainOutput(child.stdout);
  drainOutput(child.stderr);

  const exitCode = await new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    child.once('error', () => fail(new Error(OAUTH_START_FAILURE)));
    child.once('exit', (code) => {
      if (settled) return;
      settled = true;
      resolve(code);
    });
  });

  if (exitCode !== 0) throw new Error(OAUTH_FAILURE);
  const status = await getMageAuthStatus({ env, homedir });
  if (!status.authenticated) throw new Error(OAUTH_FAILURE);
  return status;
};

export const startMageOAuth = (options = {}) => {
  if (pendingOAuth) return pendingOAuth;

  const operation = runMageOAuth(options);
  pendingOAuth = operation.finally(() => {
    pendingOAuth = null;
  });
  return pendingOAuth;
};
