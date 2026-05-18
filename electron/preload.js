// Electron preload — Desktop Port Plan 2026-05-18 (Phase 1+2+3).
//
// The renderer process runs sandboxed with contextIsolation. Anything the
// game JS needs to know about the desktop runtime is exposed through
// window.rainboids, kept intentionally small.
//
// `mpServerUrl` is read by js/mp/mp-ws.js → discoverDefaultUrl() as the
// highest-priority URL source (Phase 3). The main process passes the URL
// via webPreferences.additionalArguments (sandboxed preloads can't read
// process.env), and we surface it here as a verbatim string the renderer
// uses unchanged. Empty string when unset → renderer falls through to its
// existing URL discovery logic.

const { contextBridge } = require('electron');

function readArg(prefix) {
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}

contextBridge.exposeInMainWorld('rainboids', {
  isDesktop: true,
  platform: process.platform,
  mpServerUrl: readArg('--rainboids-mp-ws-url='),
});
