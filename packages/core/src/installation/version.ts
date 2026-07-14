declare global {
  const MAGE_VERSION: string
  const MAGE_CHANNEL: string
}

export const InstallationVersion = typeof MAGE_VERSION === "string" ? MAGE_VERSION : "local"
export const InstallationChannel = typeof MAGE_CHANNEL === "string" ? MAGE_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
