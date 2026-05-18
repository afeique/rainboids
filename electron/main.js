// Electron main process — Phase 2 (Desktop Port Plan 2026-05-18).
//
// Responsibilities:
//   - Register the `app://` custom protocol so the renderer can load
//     repo files (index.html, mp.html, css/, js/, etc.) over a standard
//     origin instead of file:// (which breaks ES module resolution).
//   - Register the `music://` custom protocol with a disk-backed cache:
//     first play streams from the CDN while writing the .mp3 to disk;
//     subsequent plays serve from disk (offline-capable).
//   - Create the main BrowserWindow pointed at app://rainboids/index.html.
//
// The renderer code in js/ runs unchanged. Anything desktop-specific is
// exposed via electron/preload.js → window.rainboids.

const { app, protocol, BrowserWindow, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const REPO_ROOT = path.resolve(__dirname, '..');
const PROTOCOL_HOST = 'rainboids';
const MUSIC_CDN_BASE = 'https://rainboids.cat.computer/music';
// Phase 3 — Multiplayer WebSocket URL handed to the renderer via the
// preload's additionalArguments. The renderer (`js/mp/mp-ws.js`
// discoverDefaultUrl()) reads this as priority-0 and connects to it
// verbatim. Defaults to the production endpoint that matches the web
// build's hardcoded fallback (`:8443/mp/ws` on the public host).
// Override at launch with: RAINBOIDS_MP_WS_URL=wss://… npm run electron:dev
const MP_WS_URL =
  process.env.RAINBOIDS_MP_WS_URL ||
  'wss://rainboids.cat.computer:8443/mp/ws';
// Music filenames are kebab-case-letters-digits-and-dots only; rejecting
// anything else stops path traversal at the URL layer.
const MUSIC_FILENAME_RE = /^[a-z0-9][a-z0-9._-]*\.mp3$/i;
let MUSIC_CACHE_DIR = null; // set after app.whenReady() — getPath requires it.

// Privileges must be declared BEFORE app.whenReady(). `standard` gives each
// scheme proper URL semantics (origin, relative paths), `secure` puts it in
// a secure context (required for crypto.subtle, service workers, etc.),
// `supportFetchAPI` + `stream` let the renderer use fetch() against these
// URLs and stream large bodies (mp3s in the music case).
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
  {
    scheme: 'music',
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

function parseMusicFilename(requestUrl) {
  const url = new URL(requestUrl);
  if (url.host !== PROTOCOL_HOST) return null;
  const name = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (!MUSIC_FILENAME_RE.test(name)) return null;
  return name;
}

// Fire-and-forget background pipe: stream the upstream half of a tee'd
// body into <cacheDir>/<name>.partial, then atomically rename to the
// final cache path. Failures cleanup the .partial so a half-written file
// is never mistaken for a valid cache hit.
async function persistToCache(webStream, name) {
  const finalPath = path.join(MUSIC_CACHE_DIR, name);
  const partialPath = finalPath + '.partial';
  try {
    const writer = fs.createWriteStream(partialPath);
    await pipeline(Readable.fromWeb(webStream), writer);
    await fs.promises.rename(partialPath, finalPath);
  } catch (err) {
    console.warn(`music:// cache write failed for ${name}:`, err.message);
    try { await fs.promises.unlink(partialPath); } catch { /* ignore */ }
  }
}

async function handleMusicRequest(request) {
  const name = parseMusicFilename(request.url);
  if (!name) return new Response('Bad Request', { status: 400 });

  const cachePath = path.join(MUSIC_CACHE_DIR, name);
  if (fs.existsSync(cachePath)) {
    return net.fetch(pathToFileURL(cachePath).toString());
  }

  // Cache miss → fetch from CDN. Tee the body so the renderer plays the
  // stream while we simultaneously persist it to disk for next time.
  const cdnUrl = `${MUSIC_CDN_BASE}/${name}`;
  let upstream;
  try {
    upstream = await net.fetch(cdnUrl);
  } catch (err) {
    return new Response(`Upstream fetch failed: ${err.message}`, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response(upstream.statusText || 'Upstream error', {
      status: upstream.status || 502,
    });
  }

  const [toClient, toDisk] = upstream.body.tee();
  persistToCache(toDisk, name); // intentionally not awaited

  return new Response(toClient, {
    status: upstream.status,
    headers: upstream.headers,
  });
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
      // Sandboxed preloads can't read process.env, so configuration is
      // piped through process.argv via this list.
      additionalArguments: [`--rainboids-mp-ws-url=${MP_WS_URL}`],
    },
  });

  win.once('ready-to-show', () => win.show());
  win.loadURL(`app://${PROTOCOL_HOST}/index.html`);
}

app.whenReady().then(async () => {
  MUSIC_CACHE_DIR = path.join(app.getPath('userData'), 'music-cache');
  await fs.promises.mkdir(MUSIC_CACHE_DIR, { recursive: true });

  protocol.handle('app', (request) => {
    const filePath = resolveAppUrl(request.url);
    if (!filePath) {
      return new Response('Not Found', { status: 404 });
    }
    // net.fetch handles file:// URLs, MIME inference, and range requests.
    return net.fetch(pathToFileURL(filePath).toString());
  });

  protocol.handle('music', handleMusicRequest);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
