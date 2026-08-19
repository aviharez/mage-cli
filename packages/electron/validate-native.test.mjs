import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isMachO, isPe, validateNativeTree } from './scripts/validate-native.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

const nativeFile = (bytes) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mage-native-'));
  roots.push(root);
  const filePath = path.join(root, 'module.node');
  fs.writeFileSync(filePath, bytes);
  return { root, filePath };
};

describe('Windows native validation', () => {
  test('accepts PE binaries', () => {
    const { root, filePath } = nativeFile(Buffer.from('MZ\x90\x00PE\x00\x00'));
    expect(isPe(filePath)).toBe(true);
    expect(validateNativeTree(root, 'win32')).toEqual([filePath]);
  });

  test('rejects Mach-O binaries', () => {
    const { root, filePath } = nativeFile(Buffer.from('feedfacf', 'hex'));
    expect(isMachO(filePath)).toBe(true);
    expect(() => validateNativeTree(root, 'win32')).toThrow('Mach-O');
  });
});
