import { afterAll, afterEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deleteMageGoCredential, getMageGoCredentialStatus, readMageGoCredential, writeMageGoCredential } from './mage-go-credentials.js';

const previousDataDir = process.env.MAGE_DATA_DIR;
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mage-go-'));
process.env.MAGE_DATA_DIR = temporaryDirectory;

afterEach(() => deleteMageGoCredential());

describe('Mage Go credential store', () => {
  it('normalizes, masks, and stores credentials with owner-only permissions', () => {
    const status = writeMageGoCredential({ workspaceId: ' wrk_test ', authCookie: ' auth=secret ' });
    expect(status).toEqual({ configured: true, workspaceId: 'wrk_test', secretMasked: '••••••••' });
    expect(readMageGoCredential()).toEqual({ workspaceId: 'wrk_test', authCookie: 'secret' });
    expect(fs.statSync(path.join(temporaryDirectory, 'quota', 'mage-go.json')).mode & 0o777).toBe(0o600);
  });

  it('removes credentials without exposing prior values', () => {
    writeMageGoCredential({ workspaceId: 'wrk_test', authCookie: 'secret' });
    deleteMageGoCredential();
    expect(getMageGoCredentialStatus()).toEqual({ configured: false });
  });
});

afterAll(() => {
  if (previousDataDir === undefined) delete process.env.MAGE_DATA_DIR;
  else process.env.MAGE_DATA_DIR = previousDataDir;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});
