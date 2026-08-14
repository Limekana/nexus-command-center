// Electron shell for NCC's desktop edition. Wraps the existing static Vite
// build (dist/) — the same artifact already shipped as
// NexusCommandCenter-Desktop-1.9.0.zip and already proven live on the web —
// in a real installable Windows window rather than "download a zip, open
// index.html yourself."
//
// Serves dist/ over a local HTTP server instead of loading file:// directly.
// vite.config.ts doesn't set `base`, so the production build emits
// root-absolute asset paths (`/assets/...`). Those resolve fine over http
// but break under file://, which resolves `/assets/...` from the filesystem
// root, not the html file's directory. Changing `base` globally would risk
// the live web deployment (limecore.dev) and the GitHub Pages site instead —
// so the fix lives here, in the Electron-only wrapper, touching nothing
// shared with the web build.
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const ICON_PATH = path.join(__dirname, '..', 'resources', 'icon.ico');

// Verification-pass diagnostics (2026-08-14) — a packaged build launched
// three live processes with no visible window and no listening server, with
// nothing surfaced anywhere (packaged Electron apps have no attached
// console). This writes a plain-text log next to userData so a launch
// failure is actually inspectable instead of just "nothing happened."
const LOG_PATH = path.join(app.getPath('userData'), 'main.log');
function log(line) {
  try {
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    // Logging must never be why the app fails to start.
  }
}
log(`app starting — __dirname=${__dirname} DIST_DIR=${DIST_DIR} exists=${fs.existsSync(DIST_DIR)}`);
process.on('uncaughtException', (err) => log(`UNCAUGHT EXCEPTION: ${err && err.stack}`));
process.on('unhandledRejection', (err) => log(`UNHANDLED REJECTION: ${err && err.stack}`));

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
};

// Minimal static file server — no extra dependency, no network exposure
// (bound to 127.0.0.1 only). SPA fallback: any path that doesn't resolve to
// a real file under dist/ serves index.html so client-side routing (React
// Router) works exactly like it does on the live web deployment.
function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      let filePath = path.join(DIST_DIR, urlPath);

      // Guard against path traversal escaping dist/.
      if (!filePath.startsWith(DIST_DIR)) {
        res.writeHead(403);
        res.end();
        return;
      }

      fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
          filePath = path.join(DIST_DIR, 'index.html');
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
    server.on('error', reject);
  });
}

let mainWindow = null;

async function createWindow() {
  try {
    const { port } = await startStaticServer();
    log(`static server listening on 127.0.0.1:${port}`);

    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1024,
      minHeight: 700,
      icon: ICON_PATH,
      autoHideMenuBar: true,
      backgroundColor: '#0d1117', // matches the app's dark theme surface, avoids a white flash on load
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
      log(`did-fail-load: code=${code} desc=${desc} url=${url}`);
    });
    mainWindow.webContents.on('did-finish-load', () => {
      log('did-finish-load — window rendered successfully');
    });
    mainWindow.webContents.on('render-process-gone', (_e, details) => {
      log(`render-process-gone: ${JSON.stringify(details)}`);
    });

    mainWindow.loadURL(`http://127.0.0.1:${port}/`);

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  } catch (err) {
    log(`createWindow FAILED: ${err && err.stack}`);
  }
}

app.whenReady().then(() => {
  log('app.whenReady resolved');
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
