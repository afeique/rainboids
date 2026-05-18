// Electron main process — Phase 1 (Desktop Port Plan 2026-05-18).
//
// Responsibilities:
//   - Register the `app://` custom protocol so the renderer can load
//     repo files (index.html, mp.html, css/, js/, etc.) over a standard
//     origin instead of file:// (which breaks ES module resolution).
//   - Create the main BrowserWindow pointed at app://rainboids/index.html.
//
// The renderer code in js/ runs unchanged. Anything desktop-specific is
// exposed via electron/preload.js → window.rainboids.
//
// Phase 2 will add the `music://` protocol with disk cache.

const { app, protocol, BrowserWindow, net } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..');
const PROTOCOL_HOST = 'rainboids';

// Privileges must be declared BEFORE app.whenReady(). `standard` gives the
// scheme proper URL semantics (origin, relative paths), `secure` puts it in
// a secure context (required for crypto.subtle, service workers, etc.),
// `supportFetchAPI` + `stream` let the renderer use fetch() against app://
// URLs and stream large bodies.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

function resolveAppUrl(requestUrl) {
  const url = new URL(requestUrl);
  if (url.host !== PROTOCOL_HOST) return null;
  const requested = path.normalize(path.join(REPO_ROOT, decodeURIComponent(url.pathname)));
  // Defense in depth: URL parsing already normalizes ".." segments, but
  // refuse anything that escapes the repo root.
  if (requested !== REPO_ROOT && !requested.startsWith(REPO_ROOT + path.sep)) {
    return null;
  }
  return requested;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#000000',
    show: false,
    title: 'Rainboids',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.loadURL(`app://${PROTOCOL_HOST}/index.html`);
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const filePath = resolveAppUrl(request.url);
    if (!filePath) {
      return new Response('Not Found', { status: 404 });
    }
    // net.fetch handles file:// URLs, MIME inference, and range requests.
    return net.fetch(pathToFileURL(filePath).toString());
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
