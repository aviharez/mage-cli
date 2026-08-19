import { describe, expect, test } from 'bun:test';
import { WINDOW_CONTROLS_OVERLAY_CSS_VARS } from './useWindowControlsOverlayLayout';

describe('Window Controls Overlay CSS geometry', () => {
  test('uses native titlebar geometry instead of a fixed Windows inset', () => {
    expect(WINDOW_CONTROLS_OVERLAY_CSS_VARS).toEqual({
      leftInset: 'env(titlebar-area-x, 0px)',
      rightInset: 'max(0px, calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw)))',
      titlebarHeight: 'env(titlebar-area-height, 0px)',
    });
  });
});
