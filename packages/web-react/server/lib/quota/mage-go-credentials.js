import { deleteManagedCredential, getManagedCredentialStatus, normalizers, readManagedCredential, writeManagedCredential } from './credentials/providers.js';

export const normalizeMageGoCredential = normalizers['mage-go'];

export const readMageGoCredential = () => readManagedCredential('mage-go');

export const getMageGoCredentialStatus = () => getManagedCredentialStatus('mage-go');

export const writeMageGoCredential = (value) => writeManagedCredential('mage-go', value);

export const deleteMageGoCredential = () => deleteManagedCredential('mage-go');
