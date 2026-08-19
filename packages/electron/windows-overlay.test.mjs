import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import { getWindowsTitleBarOverlay, WINDOWS_TITLEBAR_HEIGHT } from './windows-overlay.mjs';

const mainSource = readFileSync(new URL('./main.mjs', import.meta.url), 'utf8');

describe('Windows titlebar overlay', () => {
  test('uses a transparent 48px overlay with light symbols for dark themes', () => {
    expect(getWindowsTitleBarOverlay(true)).toEqual({
      color: '#00000000',
      symbolColor: '#ffffff',
      height: WINDOWS_TITLEBAR_HEIGHT,
    });
  });

  test('uses dark symbols for light themes', () => {
    expect(getWindowsTitleBarOverlay(false).symbolColor).toBe('#000000');
  });

  test('keeps native Windows controls and the macOS traffic-light branch', () => {
    expect(mainSource).toMatch(/process\.platform === 'win32'.*titleBarStyle: 'hidden'.*titleBarOverlay: getWindowsTitleBarOverlay/s);
    expect(mainSource).toMatch(/process\.platform === 'darwin'.*titleBarStyle: 'hiddenInset'/s);
    expect(mainSource).not.toMatch(/titleBarOverlay:\s*true/);
  });

  test('updates every Windows overlay for explicit and system theme changes', () => {
    expect(mainSource).toContain('getWindowsTitleBarOverlay(nativeTheme.shouldUseDarkColors)');
    expect(mainSource).toContain("nativeTheme.on('updated', updateWindowsTitleBarOverlay);");

    const themeCommand = mainSource.slice(mainSource.indexOf("case 'desktop_set_window_theme'"));
    expect(themeCommand).toContain('nativeTheme.themeSource =');
    expect(themeCommand).toContain('updateWindowsTitleBarOverlay();');
  });
});
