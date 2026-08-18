import fs from 'fs';
import path from 'path';
import os from 'os';

const MAGE_HOME = process.env.MAGE_TEST_HOME || os.homedir();
const MAGE_CONFIG_DIR = process.env.MAGE_CONFIG_DIR
  ? path.resolve(process.env.MAGE_CONFIG_DIR)
  : path.join(MAGE_HOME, '.mage');
const MAGE_DATA_DIR = process.env.MAGE_DATA_DIR
  ? path.resolve(process.env.MAGE_DATA_DIR)
  : path.join(MAGE_HOME, '.mage', 'data');

export const ANTIGRAVITY_ACCOUNTS_PATHS = [
  path.join(MAGE_CONFIG_DIR, 'antigravity-accounts.json'),
  path.join(MAGE_DATA_DIR, 'antigravity-accounts.json')
];

export const readJsonFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return JSON.parse(trimmed);
  } catch (error) {
    console.warn(`Failed to read JSON file: ${filePath}`, error);
    return null;
  }
};

export const getAuthEntry = (auth, aliases) => {
  for (const alias of aliases) {
    if (auth[alias]) {
      return auth[alias];
    }
  }
  return null;
};

export const normalizeAuthEntry = (entry) => {
  if (!entry) return null;
  if (typeof entry === 'string') {
    return { token: entry };
  }
  if (typeof entry === 'object') {
    return entry;
  }
  return null;
};
