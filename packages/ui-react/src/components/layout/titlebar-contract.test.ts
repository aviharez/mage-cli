import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

const headerSource = readFileSync(new URL('./Header.tsx', import.meta.url), 'utf8');
const miniChatSource = readFileSync(new URL('../mini-chat/MiniChatLayout.tsx', import.meta.url), 'utf8');
const designSystemSource = readFileSync(new URL('../../styles/design-system.css', import.meta.url), 'utf8');

describe('desktop titlebar contract', () => {
  test('does not render duplicate Windows controls', () => {
    expect(headerSource).not.toContain('WindowsWindowControls');
    expect(miniChatSource).not.toContain('WindowsWindowControls');
  });

  test('reserves native caption space while keeping drag/no-drag regions', () => {
    expect(headerSource).toContain("'app-region-drag relative flex h-12 select-none items-center pr-3'");
    expect(headerSource).toContain("'app-region-no-drag inline-flex");
    expect(headerSource).toContain("var(--oc-wco-right-inset, 0px)");
    expect(headerSource).toContain("target.closest('.app-region-no-drag')");
    expect(headerSource).toContain('startDesktopWindowDrag()');

    expect(miniChatSource).toContain("WebkitAppRegion: 'drag'");
    expect(miniChatSource).toContain("WebkitAppRegion: 'no-drag'");
    expect(miniChatSource).toContain("var(--oc-wco-right-inset, 0px)");
  });

  test('keeps the safe-area env geometry scoped to desktop runtime', () => {
    expect(designSystemSource).toContain(':root.desktop-runtime {');
    expect(designSystemSource).toContain('--oc-wco-left-inset: env(titlebar-area-x, 0px);');
    expect(designSystemSource).toContain('--oc-wco-titlebar-height: env(titlebar-area-height, 0px);');
  });
});
