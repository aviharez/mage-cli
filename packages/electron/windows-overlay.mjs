export const WINDOWS_TITLEBAR_HEIGHT = 48;

export const getWindowsTitleBarOverlay = (shouldUseDarkColors) => ({
  color: '#00000000',
  symbolColor: shouldUseDarkColors ? '#ffffff' : '#000000',
  height: WINDOWS_TITLEBAR_HEIGHT,
});
