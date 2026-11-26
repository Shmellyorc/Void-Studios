const { app, BrowserWindow, ipcMain, protocol, session } = require('electron');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const entry = 'void-game://app/index.html';
protocol.registerSchemesAsPrivileged([
  { scheme: 'void-game', privileges: { standard: true, secure: true } },
]);
ipcMain.handle('void-game:fullscreen',(event, enabled) => {
  if (typeof enabled !== 'boolean' || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== entry) {
    throw Error('Fullscreen is available from the game window.');
  }
  const window = BrowserWindow.fromWebContents(event.sender);
  window.setFullScreen(enabled);
  return enabled;
});

function openWindow() {
  const icon = path.join(app.getAppPath(), 'icon.png');
  const window = new BrowserWindow({
    width: 1120,
    height: 760,
    show: false,
    ...(require('node:fs').existsSync(icon) ? { icon } : {}),
    webPreferences: { preload:path.join(__dirname,'game-preload.cjs'), contextIsolation:true, nodeIntegration:false, sandbox:true, spellcheck:false },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('enter-full-screen',() => window.webContents.send('void-game:fullscreen-changed',true));
  window.on('leave-full-screen',() => window.webContents.send('void-game:fullscreen-changed',false));
  window.once('ready-to-show', () => window.show());
  window.loadURL(entry).catch(error => {
    console.error(error);
    app.exit(1);
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_contents,_permission, respond) => respond(false));
  protocol.handle('void-game', async request => {
    if (request.url !== entry) return new Response(null, { status: 404 });
    const html = await readFile(path.join(app.getAppPath(), 'index.html'));
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
  openWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) openWindow(); });
}).catch(error => {
  console.error(error);
  app.exit(1);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
