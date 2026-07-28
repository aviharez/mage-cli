import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mergePathValues } from './path-utils.js';

export const createMageEnvRuntime = (deps) => {
  const {
    state,
    normalizeDirectoryPath,
    readSettingsFromDiskMigrated,
  } = deps;
  const runSpawnSync = typeof deps.spawnSync === 'function' ? deps.spawnSync : spawnSync;
  const resolveHomeDir = typeof deps.homedir === 'function' ? deps.homedir : () => os.homedir();

  const parseNullSeparatedEnvSnapshot = (raw) => {
    if (typeof raw !== 'string' || raw.length === 0) {
      return null;
    }

    const result = {};
    const entries = raw.split('\0');
    for (const entry of entries) {
      if (!entry) {
        continue;
      }
      const idx = entry.indexOf('=');
      if (idx <= 0) {
        continue;
      }
      const key = entry.slice(0, idx);
      const value = entry.slice(idx + 1);
      result[key] = value;
    }

    if (Object.keys(result).length === 0) {
      return null;
    }

    if (process.platform === 'win32' && typeof result.PATH !== 'string') {
      const pathEntry = Object.entries(result).find(([key]) => key.toLowerCase() === 'path');
      if (pathEntry && typeof pathEntry[1] === 'string') {
        result.PATH = pathEntry[1];
      }
    }

    return result;
  };

  const isExecutable = (filePath) => {
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return false;
      if (process.platform === 'win32') {
        const ext = path.extname(filePath).toLowerCase();
        if (!ext) return true;
        return ['.exe', '.cmd', '.bat', '.com'].includes(ext);
      }
      fs.accessSync(filePath, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };

  const resolveWindowsExecutablePath = (candidate) => {
    if (process.platform !== 'win32' || typeof candidate !== 'string' || candidate.trim().length === 0) {
      return candidate;
    }

    const trimmed = candidate.trim();
    const ext = path.extname(trimmed).toLowerCase();
    if (ext) {
      return isExecutable(trimmed) ? trimmed : null;
    }

    const pathExt = process.env.PATHEXT || process.env.PathExt || '.COM;.EXE;.BAT;.CMD';
    for (const rawExt of pathExt.split(';')) {
      const normalizedExt = rawExt.trim();
      if (!normalizedExt) continue;
      const withExt = `${trimmed}${normalizedExt.startsWith('.') ? normalizedExt : `.${normalizedExt}`}`;
      if (isExecutable(withExt)) {
        return withExt;
      }
    }

    return isExecutable(trimmed) ? trimmed : null;
  };

  const searchPathFor = (binaryName) => {
    const trimmed = typeof binaryName === 'string' ? binaryName.trim() : '';
    if (!trimmed) {
      return null;
    }

    const current = process.env.PATH || '';
    const parts = current.split(path.delimiter).filter(Boolean);
    const candidateNames = [];

    if (process.platform === 'win32' && !path.extname(trimmed)) {
      const pathExt = process.env.PATHEXT || process.env.PathExt || '.COM;.EXE;.BAT;.CMD';
      for (const ext of pathExt.split(';')) {
        const normalizedExt = ext.trim();
        if (!normalizedExt) continue;
        const candidateName = `${trimmed}${normalizedExt.startsWith('.') ? normalizedExt : `.${normalizedExt}`}`;
        if (!candidateNames.some((existing) => existing.toLowerCase() === candidateName.toLowerCase())) {
          candidateNames.push(candidateName);
        }
      }
    }

    candidateNames.push(trimmed);

    for (const dir of parts) {
      for (const candidateName of candidateNames) {
        const candidate = path.join(dir, candidateName);
        if (isExecutable(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  };

  const prependToPath = (dir) => {
    const trimmed = typeof dir === 'string' ? dir.trim() : '';
    if (!trimmed) return;
    const current = process.env.PATH || '';
    const parts = current.split(path.delimiter).filter(Boolean);
    if (parts.includes(trimmed)) return;
    process.env.PATH = [trimmed, ...parts].join(path.delimiter);
  };

  const getWindowsShellEnvSnapshot = () => {
    const parseResult = (stdout) => parseNullSeparatedEnvSnapshot(typeof stdout === 'string' ? stdout : '');

    const psScript = [
      '$entries = [ordered]@{}',
      'Get-ChildItem Env: | ForEach-Object { $entries[$_.Name] = $_.Value }',
      "$pathValues = @([Environment]::GetEnvironmentVariable('Path', 'Machine'), [Environment]::GetEnvironmentVariable('Path', 'User'), [Environment]::GetEnvironmentVariable('Path', 'Process')) | Where-Object { $_ }",
      "if ($pathValues.Count -gt 0) { $entries['Path'] = ($pathValues -join ';') }",
      "$entries.GetEnumerator() | ForEach-Object { [Console]::Out.Write($_.Name); [Console]::Out.Write('='); [Console]::Out.Write($_.Value); [Console]::Out.Write([char]0) }",
    ].join('; ');

    const powershellCandidates = [
      'pwsh.exe',
      'powershell.exe',
      path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ];

    for (const shellPath of powershellCandidates) {
      try {
        const result = runSpawnSync(shellPath, ['-NoLogo', '-Command', psScript], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 10 * 1024 * 1024,
          windowsHide: true,
        });
        if (result.status !== 0) {
          continue;
        }
        const parsed = parseResult(result.stdout);
        if (parsed) {
          return parsed;
        }
      } catch {
      }
    }

    const comspec = process.env.ComSpec || 'cmd.exe';
    try {
      const result = runSpawnSync(comspec, ['/d', '/s', '/c', 'set'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      });
      if (result.status === 0 && typeof result.stdout === 'string' && result.stdout.length > 0) {
        return parseNullSeparatedEnvSnapshot(result.stdout.replace(/\r?\n/g, '\0'));
      }
    } catch {
    }

    return null;
  };

  const getLoginShellEnvSnapshot = () => {
    if (state.cachedLoginShellEnvSnapshot !== undefined) {
      return state.cachedLoginShellEnvSnapshot;
    }

    if (process.platform === 'win32') {
      const windowsSnapshot = getWindowsShellEnvSnapshot();
      state.cachedLoginShellEnvSnapshot = windowsSnapshot;
      return windowsSnapshot;
    }

    const shellCandidates = [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh'].filter(Boolean);

    for (const shellPath of shellCandidates) {
      if (!isExecutable(shellPath)) {
        continue;
      }

      try {
        const result = runSpawnSync(shellPath, ['-lic', 'env -0'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 10 * 1024 * 1024,
          windowsHide: true,
        });

        if (result.status !== 0) {
          continue;
        }

        const parsed = parseNullSeparatedEnvSnapshot(result.stdout || '');
        if (parsed) {
          state.cachedLoginShellEnvSnapshot = parsed;
          return parsed;
        }
      } catch {
      }
    }

    state.cachedLoginShellEnvSnapshot = null;
    return null;
  };

  const applyLoginShellEnvSnapshot = () => {
    const snapshot = getLoginShellEnvSnapshot();
    if (!snapshot) {
      return;
    }

    const skipKeys = new Set(['PWD', 'OLDPWD', 'SHLVL', '_']);
    for (const [key, value] of Object.entries(snapshot)) {
      if (skipKeys.has(key)) {
        continue;
      }
      const existing = process.env[key];
      if (typeof existing === 'string' && existing.length > 0) {
        continue;
      }
      process.env[key] = value;
    }

    const currentPath = process.env.PATH || '';
    const shellPath = snapshot.PATH || '';
    if (!shellPath) {
      return;
    }

    process.env.PATH = mergePathValues(shellPath, currentPath, path.delimiter);
  };

  const isWslExecutableValue = (value) => {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    return /(^|[\\/])wsl(\.exe)?$/i.test(trimmed);
  };

  const isWindowsMageDesktopAppPath = (candidate) => {
    if (process.platform !== 'win32' || typeof candidate !== 'string') {
      return false;
    }
    const normalized = path.resolve(candidate).toLowerCase();
    const localAppData = typeof process.env.LOCALAPPDATA === 'string' && process.env.LOCALAPPDATA.trim()
      ? path.resolve(process.env.LOCALAPPDATA).toLowerCase()
      : '';
    if (!localAppData || !normalized.startsWith(`${localAppData}${path.sep}`)) {
      return false;
    }
    return normalized.endsWith(`${path.sep}programs${path.sep}mage${path.sep}mage.exe`);
  };

  const bundledMageCliCandidates = () => {
    const names = process.platform === 'win32' ? ['mage.exe'] : ['mage'];
    const roots = [
      process.env.MAGE_BUNDLED_MAGE_CLI_DIR,
      typeof process.resourcesPath === 'string' ? path.join(process.resourcesPath, 'mage-cli') : null,
    ]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);

    const candidates = [];
    for (const root of roots) {
      for (const name of names) {
        candidates.push(path.join(root, name));
      }
    }
    return candidates;
  };

  const resolveBundledMageCliPath = () => {
    for (const candidate of bundledMageCliCandidates()) {
      if (isExecutable(candidate) && !isWindowsMageDesktopAppPath(candidate)) {
        return candidate;
      }
    }
    return null;
  };

  const bundledMageCliFallback = () => {
    const bundled = resolveBundledMageCliPath();
    if (!bundled) return null;
    clearWslMageResolution();
    state.resolvedMageBinarySource = 'bundled';
    return bundled;
  };

  const clearWslMageResolution = () => {
    state.useWslForMage = false;
    state.resolvedWslBinary = null;
    state.resolvedWslMagePath = null;
    state.resolvedWslDistro = null;
  };

  // Strip a single wrapping quote pair (Windows "Copy as path" and quoted
  // shell snippets) — literal quotes are never part of a real path and break
  // every executable check.
  const stripWrappingQuotes = (value) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed.length >= 2
      && ((trimmed.startsWith('"') && trimmed.endsWith('"'))
        || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
      return trimmed.slice(1, -1).trim();
    }
    return trimmed;
  };

  const resolveMageCliPath = () => {
    const explicit = [
      process.env.MAGE_BINARY,
      process.env.MAGE_PATH,
      process.env.MAGE_MAGE_PATH,
      process.env.MAGE_MAGE_BIN,
    ]
      .map(stripWrappingQuotes)
      .filter(Boolean);

    for (const candidate of explicit) {
      if (isExecutable(candidate) && !isWindowsMageDesktopAppPath(candidate)) {
        clearWslMageResolution();
        state.resolvedMageBinarySource = 'env';
        return candidate;
      }
    }

    // The bundled CLI is the LAST resort (see bundledMageCliFallback at the
    // exit points below): a user's own Mage install — PATH, known install
    // locations, or shell-resolved — must win over the pinned bundled copy.
    const resolvedFromPath = searchPathFor('mage');
    if (resolvedFromPath) {
      clearWslMageResolution();
      state.resolvedMageBinarySource = 'path';
      return resolvedFromPath;
    }

    const home = resolveHomeDir();
    const unixFallbacks = [
      path.join(home, '.mage', 'bin', 'mage'),
      path.join(home, '.bun', 'bin', 'mage'),
      path.join(home, '.local', 'bin', 'mage'),
      path.join(home, 'bin', 'mage'),
      '/opt/homebrew/bin/mage',
      '/usr/local/bin/mage',
      '/home/linuxbrew/.linuxbrew/bin/mage',
      '/usr/bin/mage',
      '/bin/mage',
    ];

    const winFallbacks = (() => {
      const userProfile = process.env.USERPROFILE || home;
      const appData = process.env.APPDATA || '';
      const localAppData = process.env.LOCALAPPDATA || '';
      const programData = process.env.ProgramData || 'C:\\ProgramData';

      const programFiles = process.env.ProgramFiles || 'C:\\Program Files';

      return [
        path.join(userProfile, '.mage', 'bin', 'mage.exe'),
        path.join(userProfile, '.mage', 'bin', 'mage.cmd'),
        path.join(appData, 'npm', 'mage.cmd'),
        // System-wide Node installer keeps the global npm prefix here
        // (npm i -g mage-ai → mage.cmd shim).
        path.join(programFiles, 'nodejs', 'mage.cmd'),
        path.join(userProfile, 'scoop', 'shims', 'mage.exe'),
        path.join(userProfile, 'scoop', 'shims', 'mage.cmd'),
        path.join(programData, 'chocolatey', 'bin', 'mage.exe'),
        path.join(programData, 'chocolatey', 'bin', 'mage.cmd'),
        path.join(userProfile, '.bun', 'bin', 'mage.exe'),
        path.join(userProfile, '.bun', 'bin', 'mage.cmd'),
      ].filter(Boolean);
    })();

    const fallbacks = process.platform === 'win32' ? winFallbacks : unixFallbacks;
    for (const candidate of fallbacks) {
      if (isExecutable(candidate)) {
        clearWslMageResolution();
        state.resolvedMageBinarySource = 'fallback';
        return candidate;
      }
    }

    if (process.platform === 'win32') {
      try {
        const result = runSpawnSync('where', ['mage'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
        if (result.status === 0) {
          const lines = (result.stdout || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
          const found = lines.find((line) => isExecutable(line) && !isWindowsMageDesktopAppPath(line));
          if (found) {
            clearWslMageResolution();
            state.resolvedMageBinarySource = 'where';
            return found;
          }
        }
      } catch {
      }
      // Do not auto-detect Mage from WSL. Mage sessions are keyed by
      // server-visible directories, and mixing Windows paths with WSL paths
      // creates duplicate/missing project state in the desktop app.
      return bundledMageCliFallback();
    }

    const shells = [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh'].filter(Boolean);
    for (const shell of shells) {
      if (!isExecutable(shell)) continue;
      try {
        const result = runSpawnSync(shell, ['-lic', 'command -v mage'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
        if (result.status === 0) {
          const found = (result.stdout || '').trim().split(/\s+/).pop() || '';
          if (found && isExecutable(found)) {
            clearWslMageResolution();
            state.resolvedMageBinarySource = 'shell';
            return found;
          }
        }
      } catch {
      }
    }

    return bundledMageCliFallback();
  };

  const resolveNodeCliPath = () => {
    const explicit = [process.env.NODE_BINARY, process.env.MAGE_NODE_BINARY]
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);

    for (const candidate of explicit) {
      if (isExecutable(candidate)) {
        return candidate;
      }
    }

    const resolvedFromPath = searchPathFor('node');
    if (resolvedFromPath) {
      return resolvedFromPath;
    }

    const unixFallbacks = ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node', '/bin/node'];
    for (const candidate of unixFallbacks) {
      if (isExecutable(candidate)) {
        return candidate;
      }
    }

    if (process.platform === 'win32') {
      try {
        const result = runSpawnSync('where', ['node'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
        if (result.status === 0) {
          const lines = (result.stdout || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
          const found = lines.find((line) => isExecutable(line));
          if (found) return found;
        }
      } catch {
      }
      return null;
    }

    const shells = [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh'].filter(Boolean);
    for (const shell of shells) {
      if (!isExecutable(shell)) continue;
      try {
        const result = runSpawnSync(shell, ['-lic', 'command -v node'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
        if (result.status === 0) {
          const found = (result.stdout || '').trim().split(/\s+/).pop() || '';
          if (found && isExecutable(found)) {
            return found;
          }
        }
      } catch {
      }
    }

    return null;
  };

  const resolveBunCliPath = () => {
    const explicit = [process.env.BUN_BINARY, process.env.MAGE_BUN_BINARY]
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);

    for (const candidate of explicit) {
      if (isExecutable(candidate)) {
        return candidate;
      }
    }

    const resolvedFromPath = searchPathFor('bun');
    if (resolvedFromPath) {
      return resolvedFromPath;
    }

    const home = os.homedir();
    const unixFallbacks = [
      path.join(home, '.bun', 'bin', 'bun'),
      '/opt/homebrew/bin/bun',
      '/usr/local/bin/bun',
      '/usr/bin/bun',
      '/bin/bun',
    ];
    for (const candidate of unixFallbacks) {
      if (isExecutable(candidate)) {
        return candidate;
      }
    }

    if (process.platform === 'win32') {
      const userProfile = process.env.USERPROFILE || home;
      const winFallbacks = [
        path.join(userProfile, '.bun', 'bin', 'bun.exe'),
        path.join(userProfile, '.bun', 'bin', 'bun.cmd'),
      ];
      for (const candidate of winFallbacks) {
        if (isExecutable(candidate)) return candidate;
      }

      try {
        const result = runSpawnSync('where', ['bun'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
        if (result.status === 0) {
          const lines = (result.stdout || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
          const found = lines.find((line) => isExecutable(line));
          if (found) return found;
        }
      } catch {
      }
      return null;
    }

    const shells = [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh'].filter(Boolean);
    for (const shell of shells) {
      if (!isExecutable(shell)) continue;
      try {
        const result = runSpawnSync(shell, ['-lic', 'command -v bun'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
        if (result.status === 0) {
          const found = (result.stdout || '').trim().split(/\s+/).pop() || '';
          if (found && isExecutable(found)) {
            return found;
          }
        }
      } catch {
      }
    }

    return null;
  };

  const ensureBunCliEnv = () => {
    if (state.resolvedBunBinary) {
      return state.resolvedBunBinary;
    }

    const resolved = resolveBunCliPath();
    if (resolved) {
      prependToPath(path.dirname(resolved));
      state.resolvedBunBinary = resolved;
      return resolved;
    }

    return null;
  };

  const ensureNodeCliEnv = () => {
    if (state.resolvedNodeBinary) {
      return state.resolvedNodeBinary;
    }

    const resolved = resolveNodeCliPath();
    if (resolved) {
      prependToPath(path.dirname(resolved));
      state.resolvedNodeBinary = resolved;
      return resolved;
    }

    return null;
  };

  const WINDOWS_BATCH_EXTENSIONS = new Set(['.cmd', '.bat', '.com']);

  const normalizeExecutableCandidate = (value) => {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (process.platform === 'win32') {
      return resolveWindowsExecutablePath(trimmed);
    }
    return isExecutable(trimmed) ? trimmed : null;
  };

  const getWindowsNativeMagePackageNames = () => {
    if (process.arch === 'arm64') {
      return ['mage-windows-arm64'];
    }
    if (process.arch === 'x64') {
      // Prefer the baseline build when bypassing package-manager wrappers so the
      // direct binary still runs on hosts without AVX2 support.
      return ['mage-windows-x64-baseline', 'mage-windows-x64'];
    }
    return [];
  };

  const resolveNativeMageBinaryFromNodeModules = (nodeModulesDir) => {
    if (typeof nodeModulesDir !== 'string' || nodeModulesDir.trim().length === 0) {
      return null;
    }

    const packageShim = path.join(nodeModulesDir, 'mage-ai', 'bin', 'mage.exe');
    if (isExecutable(packageShim)) {
      return packageShim;
    }

    for (const packageName of getWindowsNativeMagePackageNames()) {
      const candidates = [
        path.join(nodeModulesDir, packageName, 'bin', 'mage.exe'),
        path.join(nodeModulesDir, 'mage-ai', 'node_modules', packageName, 'bin', 'mage.exe'),
      ];
      for (const candidate of candidates) {
        if (isExecutable(candidate)) {
          return candidate;
        }
      }
    }

    return null;
  };

  const resolveMageNodeLaunchSpecFromNodeModules = (nodeModulesDir) => {
    if (typeof nodeModulesDir !== 'string' || nodeModulesDir.trim().length === 0) {
      return null;
    }

    const launcher = path.join(nodeModulesDir, 'mage-ai', 'bin', 'mage');
    if (!isExecutable(launcher) && !fs.existsSync(launcher)) {
      return null;
    }

    const nodeBinary = ensureNodeCliEnv() || resolveNodeCliPath() || 'node';
    return {
      binary: nodeBinary,
      args: [launcher],
      wrapperType: 'node-launcher',
    };
  };

  const resolveNodeModulesDirFromCmdWrapper = (wrapperPath) => {
    if (!wrapperPath || typeof wrapperPath !== 'string') {
      return null;
    }

    try {
      const content = fs.readFileSync(wrapperPath, 'utf8');
      const launcherMatch = content.match(/node_modules[\\/]+mage-ai[\\/]+bin[\\/]+mage/i);
      if (!launcherMatch) {
        return null;
      }

      const launcherPath = path.resolve(path.dirname(wrapperPath), launcherMatch[0].replace(/[\\/]+/g, path.sep));
      return path.dirname(path.dirname(path.dirname(launcherPath)));
    } catch {
      return null;
    }
  };

  const resolveMageNodeModulesDir = (magePath) => {
    if (typeof magePath !== 'string' || magePath.trim().length === 0) {
      return null;
    }

    const normalized = path.resolve(magePath);
    const lower = normalized.toLowerCase();
    const fileDir = path.dirname(normalized);
    const nodeModulesCandidates = [];
    const pushCandidate = (candidate) => {
      if (typeof candidate !== 'string' || candidate.trim().length === 0) {
        return;
      }
      if (!nodeModulesCandidates.includes(candidate)) {
        nodeModulesCandidates.push(candidate);
      }
    };

    if (lower.includes(`${path.sep}.bun${path.sep}bin${path.sep}mage`)) {
      const bunRoot = path.dirname(path.dirname(normalized));
      pushCandidate(path.join(bunRoot, 'install', 'global', 'node_modules'));
    }

    if (lower.endsWith(`${path.sep}node_modules${path.sep}.bin${path.sep}mage`)
      || lower.endsWith(`${path.sep}node_modules${path.sep}.bin${path.sep}mage.cmd`)
      || lower.endsWith(`${path.sep}node_modules${path.sep}.bin${path.sep}mage.bat`)
      || lower.endsWith(`${path.sep}node_modules${path.sep}.bin${path.sep}mage.exe`)) {
      pushCandidate(path.dirname(fileDir));
    }

    if (lower.endsWith(`${path.sep}node_modules${path.sep}mage-ai${path.sep}bin${path.sep}mage`)) {
      pushCandidate(path.dirname(path.dirname(fileDir)));
    }

    if (path.basename(fileDir).toLowerCase() === 'npm') {
      pushCandidate(path.join(fileDir, 'node_modules'));
    }

    if (WINDOWS_BATCH_EXTENSIONS.has(path.extname(normalized).toLowerCase())) {
      pushCandidate(resolveNodeModulesDirFromCmdWrapper(normalized));
    }

    for (const candidate of nodeModulesCandidates) {
      if (resolveNativeMageBinaryFromNodeModules(candidate) || resolveMageNodeLaunchSpecFromNodeModules(candidate)) {
        return candidate;
      }
    }

    return null;
  };

  const resolveManagedMageLaunchSpec = (magePath) => {
    const fallbackBinary = typeof magePath === 'string' && magePath.trim().length > 0
      ? magePath.trim()
      : 'mage';

    if (process.platform !== 'win32') {
      return { binary: fallbackBinary, args: [], wrapperType: null };
    }

    const ext = path.extname(fallbackBinary).toLowerCase();
    const candidatePaths = [fallbackBinary];
    if (WINDOWS_BATCH_EXTENSIONS.has(ext)) {
      candidatePaths.push(fallbackBinary.slice(0, -ext.length) + '.exe');
    }

    for (const candidate of candidatePaths) {
      const nodeModulesDir = resolveMageNodeModulesDir(candidate);
      const nativeBinary = resolveNativeMageBinaryFromNodeModules(nodeModulesDir);
      if (nativeBinary) {
        return {
          binary: nativeBinary,
          args: [],
          wrapperType: nativeBinary === fallbackBinary ? null : 'native-wrapper',
        };
      }

      const nodeLaunchSpec = resolveMageNodeLaunchSpecFromNodeModules(nodeModulesDir);
      if (nodeLaunchSpec) {
        return nodeLaunchSpec;
      }

      const interpreter = mageShimInterpreter(candidate);
      if (interpreter === 'node') {
        return {
          binary: ensureNodeCliEnv() || resolveNodeCliPath() || 'node',
          args: [candidate],
          wrapperType: 'node-shebang',
        };
      }
      if (interpreter === 'bun') {
        return {
          binary: ensureBunCliEnv() || resolveBunCliPath() || 'bun',
          args: [candidate],
          wrapperType: 'bun-shebang',
        };
      }

      const directBinary = normalizeExecutableCandidate(candidate);
      if (directBinary) {
        const directExt = path.extname(directBinary).toLowerCase();
        if (WINDOWS_BATCH_EXTENSIONS.has(directExt)) {
          return {
            binary: process.env.ComSpec || 'cmd.exe',
            args: ['/d', '/s', '/c', 'call', directBinary],
            wrapperType: 'cmd-wrapper',
          };
        }

        return {
          binary: directBinary,
          args: [],
          wrapperType: directBinary === fallbackBinary ? null : 'executable-wrapper',
        };
      }
    }

    // Final fallback: never hand a raw .cmd/.bat to spawn(shell:false) — cmd
    // shims need cmd.exe, and unquoted space-containing paths break there.
    if (WINDOWS_BATCH_EXTENSIONS.has(ext)) {
      return {
        binary: process.env.ComSpec || 'cmd.exe',
        args: ['/d', '/s', '/c', 'call', fallbackBinary],
        wrapperType: 'cmd-wrapper',
      };
    }

    return { binary: fallbackBinary, args: [], wrapperType: null };
  };

  const readShebang = (magePath) => {
    if (!magePath || typeof magePath !== 'string') {
      return null;
    }
    try {
      const fd = fs.openSync(magePath, 'r');
      try {
        const buf = Buffer.alloc(256);
        const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
        const head = buf.subarray(0, bytes).toString('utf8');
        const firstLine = head.split(/\r?\n/, 1)[0] || '';
        if (!firstLine.startsWith('#!')) {
          return null;
        }
        const shebang = firstLine.slice(2).trim();
        if (!shebang) {
          return null;
        }
        return shebang;
      } finally {
        try {
          fs.closeSync(fd);
        } catch {
        }
      }
    } catch {
      return null;
    }
  };

  const mageShimInterpreter = (magePath) => {
    const shebang = readShebang(magePath);
    if (!shebang) return null;
    if (/\bnode\b/i.test(shebang)) return 'node';
    if (/\bbun\b/i.test(shebang)) return 'bun';
    return null;
  };

  const ensureMageShimRuntime = (magePath) => {
    const runtime = mageShimInterpreter(magePath);
    if (runtime === 'node') {
      ensureNodeCliEnv();
    }
    if (runtime === 'bun') {
      ensureBunCliEnv();
    }
  };

  const isMacMageAppBundlePath = (candidate) => {
    if (process.platform !== 'darwin' || typeof candidate !== 'string') {
      return false;
    }
    return /\/Mage(?: Dev| Beta)?\.app\/Contents\/MacOS\/(?:Mage(?: Dev| Beta)?|mage-cli)$/i.test(candidate);
  };

  const isKnownMageDesktopAppPath = (candidate) => isMacMageAppBundlePath(candidate)
    || isWindowsMageDesktopAppPath(candidate);

  const createConfiguredMageBinaryError = (raw, normalized) => {
    const configured = typeof raw === 'string' ? raw.trim() : '';
    const candidate = typeof normalized === 'string' && normalized.trim().length > 0 ? normalized.trim() : configured;
    const messageSuffix = 'Mage needs the standalone mage CLI. Install it and set settings.mageBinary to the CLI path, for example ~/.mage/bin/mage, or leave the setting empty to use PATH lookup.';
    const error = (() => {
      if (isKnownMageDesktopAppPath(candidate) || isKnownMageDesktopAppPath(configured)) {
        const platformName = process.platform === 'win32' ? 'Windows desktop app install' : 'macOS desktop app bundle';
        return new Error(`Configured Mage binary points at the ${platformName}, not the CLI: ${candidate}. ${messageSuffix}`);
      }

      try {
        const configuredStat = fs.statSync(configured);
        if (configuredStat.isDirectory()) {
          return new Error(`Configured Mage binary directory does not contain an executable ${process.platform === 'win32' ? 'mage.exe' : 'mage'}: ${configured}. ${messageSuffix}`);
        }
      } catch {
      }

      try {
        const stat = fs.statSync(candidate);
        if (stat.isDirectory()) {
          return new Error(`Configured Mage binary directory does not contain an executable ${process.platform === 'win32' ? 'mage.exe' : 'mage'}: ${candidate}. ${messageSuffix}`);
        }
        if (!stat.isFile()) {
          return new Error(`Configured Mage binary is not a file: ${candidate}. ${messageSuffix}`);
        }
        return new Error(`Configured Mage binary is not executable: ${candidate}. ${messageSuffix}`);
      } catch {
        return new Error(`Configured Mage binary not found: ${candidate}. ${messageSuffix}`);
      }
    })();
    error.code = 'MAGE_BINARY_INVALID';
    return error;
  };

  const createConfiguredWslMageError = (raw) => new Error(
    `Configured settings.mageBinary uses WSL but Mage could not resolve a WSL Mage command: ${raw}. Ensure WSL is available and mage is installed in the configured distro.`
  );

  const normalizeMageBinarySetting = (raw) => {
    if (typeof raw !== 'string') {
      return null;
    }
    const trimmed = normalizeDirectoryPath(raw).trim();
    if (!trimmed) {
      return '';
    }

    try {
      const stat = fs.statSync(trimmed);
      if (stat.isDirectory()) {
        const bin = process.platform === 'win32' ? 'mage.exe' : 'mage';
        return path.join(trimmed, bin);
      }
    } catch {
    }

    return trimmed;
  };

  const applyMageBinaryFromSettings = async (options = {}) => {
    const strict = options?.strict === true;
    try {
      const settings = await readSettingsFromDiskMigrated();
      if (!settings || typeof settings !== 'object') {
        return null;
      }
      if (!Object.prototype.hasOwnProperty.call(settings, 'mageBinary')) {
        return null;
      }

      const normalized = normalizeMageBinarySetting(settings.mageBinary);

      if (normalized === '') {
        delete process.env.MAGE_BINARY;
        state.resolvedMageBinary = null;
        state.resolvedMageBinarySource = null;
        clearWslMageResolution();
        return null;
      }

      const raw = typeof settings.mageBinary === 'string' ? settings.mageBinary.trim() : '';
      const explicitWslPath = process.platform === 'win32' && typeof raw === 'string'
        ? raw.match(/^wsl:\s*(.+)$/i)
        : null;

      if (explicitWslPath && explicitWslPath[1] && explicitWslPath[1].trim().length > 0) {
        clearWslMageResolution();
        if (strict) {
          throw createConfiguredWslMageError(raw);
        }
        console.warn(`Configured settings.mageBinary uses WSL, which is no longer supported by Mage desktop: ${raw}`);
        return null;
      }

      if (process.platform === 'win32' && (isWslExecutableValue(raw) || isWslExecutableValue(normalized || ''))) {
        clearWslMageResolution();
        if (strict) {
          throw createConfiguredWslMageError(raw);
        }
        console.warn(`Configured settings.mageBinary points to WSL, which is no longer supported by Mage desktop: ${raw}`);
        return null;
      }

      if (normalized && isExecutable(normalized) && !isKnownMageDesktopAppPath(normalized)) {
        clearWslMageResolution();
        process.env.MAGE_BINARY = normalized;
        prependToPath(path.dirname(normalized));
        state.resolvedMageBinary = normalized;
        state.resolvedMageBinarySource = 'settings';
        ensureMageShimRuntime(normalized);
        return normalized;
      }

      if (raw) {
        if (strict) {
          throw createConfiguredMageBinaryError(raw, normalized);
        }
        console.warn(`Configured settings.mageBinary is not executable: ${raw}`);
      }
    } catch (error) {
      if (strict) {
        throw error;
      }
    }

    return null;
  };

  const ensureMageCliEnv = () => {
    if (state.resolvedMageBinary) {
      if (state.useWslForMage) {
        return state.resolvedMageBinary;
      }
      ensureMageShimRuntime(state.resolvedMageBinary);
      return state.resolvedMageBinary;
    }

    const existing = typeof process.env.MAGE_BINARY === 'string' ? process.env.MAGE_BINARY.trim() : '';
    if (existing && isExecutable(existing)) {
      clearWslMageResolution();
      state.resolvedMageBinary = existing;
      state.resolvedMageBinarySource = state.resolvedMageBinarySource || 'env';
      prependToPath(path.dirname(existing));
      ensureMageShimRuntime(existing);
      return state.resolvedMageBinary;
    }

    const resolved = resolveMageCliPath();
    if (resolved) {
      if (state.useWslForMage) {
        state.resolvedMageBinary = resolved;
        state.resolvedMageBinarySource = state.resolvedMageBinarySource || 'wsl';
        console.log(`Resolved mage CLI via WSL: ${state.resolvedWslMagePath || 'mage'}`);
        return resolved;
      }

      process.env.MAGE_BINARY = resolved;
      prependToPath(path.dirname(resolved));
      ensureMageShimRuntime(resolved);
      state.resolvedMageBinary = resolved;
      state.resolvedMageBinarySource = state.resolvedMageBinarySource || 'unknown';
      console.log(`Resolved mage CLI: ${resolved}`);
      return resolved;
    }

    clearWslMageResolution();
    return null;
  };

  const resolveGitBinaryForSpawn = () => {
    if (process.platform !== 'win32') {
      return 'git';
    }

    if (state.resolvedGitBinary) {
      return state.resolvedGitBinary;
    }

    const explicit = [process.env.GIT_BINARY, process.env.MAGE_GIT_BINARY]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);
    for (const candidate of explicit) {
      if (isExecutable(candidate)) {
        state.resolvedGitBinary = candidate;
        return state.resolvedGitBinary;
      }
    }

    const candidates = [];
    const normalizeGitCandidate = (candidate) => {
      if (typeof candidate !== 'string') {
        return '';
      }
      const trimmed = candidate.trim();
      if (!trimmed) {
        return '';
      }
      const ext = path.extname(trimmed).toLowerCase();
      if (ext === '.cmd' || ext === '.bat' || ext === '.com') {
        const exeCandidate = trimmed.slice(0, -ext.length) + '.exe';
        if (isExecutable(exeCandidate)) {
          return exeCandidate;
        }
      }
      return trimmed;
    };

    const pathCandidate = normalizeGitCandidate(searchPathFor('git'));
    if (pathCandidate && isExecutable(pathCandidate)) {
      candidates.push(pathCandidate);
    }

    const pathExeCandidate = normalizeGitCandidate(searchPathFor('git.exe'));
    if (pathExeCandidate && isExecutable(pathExeCandidate)) {
      candidates.push(pathExeCandidate);
    }

    const programRoots = [
      process.env.ProgramFiles,
      process.env['ProgramFiles(x86)'],
      process.env.LocalAppData,
    ]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);
    for (const root of programRoots) {
      const installCandidates = [
        path.join(root, 'Git', 'cmd', 'git.exe'),
        path.join(root, 'Git', 'bin', 'git.exe'),
        path.join(root, 'Git', 'mingw64', 'bin', 'git.exe'),
        path.join(root, 'Programs', 'Git', 'cmd', 'git.exe'),
        path.join(root, 'Programs', 'Git', 'bin', 'git.exe'),
      ];
      for (const candidate of installCandidates) {
        const normalized = normalizeGitCandidate(candidate);
        if (normalized && isExecutable(normalized)) {
          candidates.push(normalized);
        }
      }
    }

    const preferredExe = candidates.find((candidate) => candidate.toLowerCase().endsWith('.exe'));
    state.resolvedGitBinary = preferredExe || candidates[0] || 'git.exe';
    return state.resolvedGitBinary;
  };

  const clearResolvedMageBinary = () => {
    state.resolvedMageBinary = null;
  };

  return {
    applyLoginShellEnvSnapshot,
    ensureMageCliEnv,
    applyMageBinaryFromSettings,
    getLoginShellEnvSnapshot,
    resolveMageCliPath,
    resolveManagedMageLaunchSpec,
    isExecutable,
    searchPathFor,
    resolveGitBinaryForSpawn,
    clearResolvedMageBinary,
  };
};
