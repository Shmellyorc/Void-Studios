const { app, BrowserWindow, dialog, ipcMain, protocol, session, shell, utilityProcess } = require('electron');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const origin = 'void-studio://app';
const entry = `${origin}/index.html`;
const buildTool = app.isPackaged
  ? path.join(process.resourcesPath,'build-tools','game-build.cjs')
  : path.join(__dirname,'game-build.cjs');
const buildOutputs = new WeakMap();
let exporting = false;

function editorContents(event) {
  if (event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== entry) throw Error('Game export is available from the editor window.');
  return event.sender;
}

function runGameBuild(contents, request) {
  return new Promise((resolve,reject) => {
    const job = utilityProcess.fork(buildTool,[],{ serviceName: 'VOID Game Builder' });
    job.once('exit',code => reject(Error('The game builder exited (' + code + ').')));
    job.on('message',result => {
      if (result.progress && !contents.isDestroyed()) contents.send('game-export:progress',result.progress);
      if (result.done || result.error) {
        if (result.error) reject(Error(result.error));
        else resolve();
        job.kill();
      }
    });
    job.postMessage(request);
  });
}

ipcMain.handle('game-export:host',event => {
  editorContents(event);
  return getExportHost();
});

async function getExportHost() {
  const { canBuildLinuxDeb } = require(path.join(path.dirname(buildTool),'linux-deb.cjs'));
  return { platform: process.platform, arch: process.arch, deb: await canBuildLinuxDeb() };
}

ipcMain.handle('game-export:build',async (event, input, html) => {
  const contents = editorContents(event);
  if (exporting) return { error: 'A desktop export is already running.' };
  exporting = true;
  buildOutputs.delete(contents);
  try {
    const { gameBuildSettings, gameArchiveName } = require(buildTool);
    const settings = gameBuildSettings(input);
    if (typeof html !== 'string' || !html.startsWith('<!doctype html>')) throw Error('The game has no HTML to package.');
    if (settings.format === 'deb' && !(await getExportHost()).deb) throw Error('Building a .deb requires dpkg-deb on the Linux host.');
    const extension = settings.format;
    const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(contents), {
      title: 'Save desktop game',
      defaultPath: path.join(app.getPath('downloads'),gameArchiveName(settings)),
      filters: [{ name: extension === 'deb' ? 'Ubuntu / Debian package' : 'ZIP archive', extensions: [extension] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const destination = result.filePath;
    if (path.extname(destination).toLowerCase() !== '.' + extension) throw Error('Choose a filename ending in .' + extension + '.');
    await runGameBuild(contents,{ input: settings, html, destination, electronVersion: process.versions.electron });
    buildOutputs.set(contents,destination);
    return { path: destination };
  } catch (error) { return { error: error.message }; }
  finally { exporting = false; }
});

ipcMain.handle('game-export:reveal',event => {
  const artifact = buildOutputs.get(editorContents(event));
  if (artifact) shell.showItemInFolder(artifact);
});

protocol.registerSchemesAsPrivileged([
  { scheme: 'void-studio', privileges: { standard: true, secure: true } },
]);

function openWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname,'export-preload.cjs'),
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
