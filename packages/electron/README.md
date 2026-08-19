# Mage Electron packaging

## macOS Jenkins Windows build

The Windows x64 installer can be built on a macOS worker without a Windows Jenkins agent:

```sh
bun install --frozen-lockfile
bun run electron:package:win
```

Prerequisites are Bun 1.3.14, normal project dependencies, and Homebrew. The Apple Silicon path has been verified on an `arm64` host without installing Wine or Rosetta. If a future external Wine package requires x64 translation, verify Rosetta first and install it only then.

Windows packaging is unsigned unless `CSC_LINK` or `WINDOWS_CSC_LINK` signing credentials are supplied. Signing can be enabled later without changing target selection.
