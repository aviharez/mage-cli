import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { credentialPath, getMageAuthStatus, startMageOAuth } from './desktop-oauth.mjs';

const tempDirectories = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const createCredentialEnvironment = async (credential) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mage-desktop-oauth-'));
  tempDirectories.push(directory);
  const configDirectory = path.join(directory, '.mage');
  await mkdir(path.join(configDirectory, 'data'), { recursive: true });
  if (credential !== undefined) await writeFile(path.join(configDirectory, 'data', 'cred.json'), JSON.stringify(credential));
  return { MAGE_CONFIG_DIR: configDirectory };
};

const validCredential = {
  udomain: 'u012345',
  display_name: 'Mage User',
  access_token: 'secret-access',
  refresh_token: 'secret-refresh',
  expires_in: Date.now() + 3600_000,
};

const childProcess = () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
};

describe('desktop Mage OAuth helper', () => {
  test('uses Mage config home resolution for the shared credential path', () => {
    expect(credentialPath({ env: { MAGE_TEST_HOME: '/tmp/mage-test-home' }, homedir: () => '/tmp/other-home' })).toBe('/tmp/mage-test-home/.mage/data/cred.json');
  });

  test('returns only safe identity for valid credentials', async () => {
    const env = await createCredentialEnvironment(validCredential);
    const status = await getMageAuthStatus({ env });
    expect(status).toEqual({ authenticated: true, displayName: 'Mage User', udomain: 'u012345' });
    expect(JSON.stringify(status)).not.toContain('secret');
  });

  test('treats missing and malformed credentials as unauthenticated', async () => {
    const missingEnv = await createCredentialEnvironment();
    const malformedEnv = await createCredentialEnvironment({ ...validCredential, expires_in: Number.NaN });
    expect(await getMageAuthStatus({ env: missingEnv })).toEqual({ authenticated: false });
    expect(await getMageAuthStatus({ env: malformedEnv })).toEqual({ authenticated: false });
  });

  test('runs one hidden init process and revalidates credentials on success', async () => {
    const env = await createCredentialEnvironment();
    let spawnCount = 0;
    let child;
    let spawnCall;
    const spawn = (...args) => {
      spawnCount += 1;
      spawnCall = args;
      child = childProcess();
      return child;
    };
    const first = startMageOAuth({ mageBinary: '/tmp/mage', env, spawn });
    const second = startMageOAuth({ mageBinary: '/tmp/mage', env, spawn });
    expect(first).toBe(second);
    await writeFile(path.join(env.MAGE_CONFIG_DIR, 'data', 'cred.json'), JSON.stringify(validCredential));
    child.emit('exit', 0);
    await expect(first).resolves.toEqual({ authenticated: true, displayName: 'Mage User', udomain: 'u012345' });
    expect(spawnCount).toBe(1);
    expect(spawnCall[0]).toBe('/tmp/mage');
    expect(spawnCall[1]).toEqual(['init']);
    expect(spawnCall[2]).toMatchObject({ env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  });

  test('fails safely when init exits unsuccessfully or binary is absent', async () => {
    const env = await createCredentialEnvironment(validCredential);
    const child = childProcess();
    const failed = startMageOAuth({ mageBinary: '/tmp/mage', env, spawn: () => child });
    child.emit('exit', 1);
    await expect(failed).rejects.toThrow('Mage sign-in failed. Please try again.');
    await expect(startMageOAuth({ env })).rejects.toThrow('Mage sign-in could not be started. Please try again.');
  });
});
