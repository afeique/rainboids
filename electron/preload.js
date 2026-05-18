// Electron preload — Phase 1 (Desktop Port Plan 2026-05-18).
//
// The renderer process runs sandboxed with contextIsolation. Anything the
// game JS needs to know about the desktop runtime is exposed through
// window.rainboids, kept intentionally small.

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('rainboids', {
  isDesktop: true,
  platform: process.platform,
});
