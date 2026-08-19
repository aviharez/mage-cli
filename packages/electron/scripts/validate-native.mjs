import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { targetPlatform } from './target.mjs';

const nativeExtensions = new Set(['.node', '.dll', '.exe']);
const machOHeaders = new Set([
  'feedface',
  'cefaedfe',
  'feedfacf',
  'cffaedfe',
  'cafebabe',
  'bebafeca',
]);

const walk = (root) => fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
  const filePath = path.join(root, entry.name);
  return entry.isDirectory() ? walk(filePath) : [filePath];
});

export const isPe = (filePath) => fs.readFileSync(filePath).subarray(0, 2).toString() === 'MZ';

export const isMachO = (filePath) => machOHeaders.has(fs.readFileSync(filePath).subarray(0, 4).toString('hex'));

export const validateNativeTree = (root, platform = targetPlatform) => {
  if (!fs.existsSync(root)) throw new Error(`Native staging/output directory not found: ${root}`);
  const files = walk(root).filter((filePath) => nativeExtensions.has(path.extname(filePath).toLowerCase()));
  if (platform !== 'win32') return files;
  files.forEach((filePath) => {
    if (fs.statSync(filePath).size === 0) throw new Error(`Empty Windows native binary: ${filePath}`);
    if (isMachO(filePath)) throw new Error(`Expected Windows native binary but found Mach-O: ${filePath}`);
    if (!isPe(filePath)) throw new Error(`Expected Windows PE native binary but found another format: ${filePath}`);
  });
  if (files.length === 0) throw new Error(`No Windows native binaries found under ${root}`);
  return files;
};

export const main = () => {
  const root = process.argv[2] === '--packaged'
    ? path.resolve(process.argv[3] || '')
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'native');
  const files = validateNativeTree(root);
  console.log(`[electron] validated ${files.length} ${targetPlatform} native files under ${root}`);
};

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
