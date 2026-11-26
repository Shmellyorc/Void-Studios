const { app, BrowserWindow, protocol, session } = require('electron');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const origin = 'void-studio://app';
const entry = `${origin}/index.html`;

protocol.registerSchemesAsPrivileged([
  { scheme: 'void-studio', privileges: { standard: true, secure: true } },
]);

function openWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.once('ready-to-show', () => window.show());
  window.loadURL(entry).catch((error) => {
    console.error(error);
    app.exit(1);
  });
}

app.whenReady().then(() => {
  const browserSession = session.defaultSession;
  browserSession.setPermissionCheckHandler(() => false);
  browserSession.setPermissionRequestHandler((_contents, _permission, respond) => respond(false));
  protocol.handle('void-studio', async (request) => {
    if (request.url !== entry) return new Response(null, { status: 404 });

    const html = await readFile(path.join(app.getAppPath(), 'dist', 'VOID-Studio.html'));
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });

  openWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow();
  });
}).catch((error) => {
  console.error(error);
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
