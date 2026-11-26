const fs = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const { randomUUID } = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { buildLinuxDeb, canBuildLinuxDeb, linuxDebName } = require('./linux-deb.cjs');

const platforms = { win32: 'windows', darwin: 'macos', linux: 'linux' };

function gameBuildSettings(input) {
  const { title, version, platform, arch, icon, format = 'zip' } = input ?? {};
  if (typeof title !== 'string' || !title.trim() || title.length > 100) throw Error('Enter a game title of up to 100 characters.');
  if (typeof version !== 'string' || !/^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})$/.test(version) ||
      version.split('.').some(part => Number(part) > 65535)) throw Error('Enter a version like 1.0.0, with each number at most 65535.');
  if (!Object.hasOwn(platforms,platform) || !['x64','arm64'].includes(arch)) throw Error('Select a desktop platform and architecture.');
  if (format !== 'zip' && !(format === 'deb' && platform === 'linux')) throw Error('Select an archive format supported by the target platform.');
  if (icon && (typeof icon !== 'string' || icon.length > 500000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(icon))) {
    throw Error('The game icon must be a PNG.');
  }
  let name = title.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,60).replace(/[. ]+$/,'');
  if (!name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = 'VOID Game';
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'game';
  return { title: title.trim(), version, platform, arch, icon, name, slug, format };
}

function gameArchiveName(settings) {
  if (settings.format === 'deb') return linuxDebName('void-game-' + settings.slug,settings.version,settings.arch);
  return `${settings.name}-${settings.version}-${platforms[settings.platform]}-${settings.arch}.zip`;
}

async function writeGameIcon(directory, url, platform) {
  if (!url) return undefined;
  const png = Buffer.from(url.slice('data:image/png;base64,'.length), 'base64');
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  if (png.length < 24 || !png.subarray(0,8).equals(signature) ||
      png.readUInt32BE(16) !== 256 || png.readUInt32BE(20) !== 256) throw Error('The game icon must be a 256 × 256 PNG.');
  await fs.writeFile(path.join(directory,'icon.png'), png);
  if (platform === 'linux') return undefined;
  const icon = path.join(path.dirname(directory), platform === 'darwin' ? 'game.icns' : 'game.ico');
  if (platform === 'darwin') {
    const header = Buffer.alloc(16);
    header.write('icns',0);
    header.writeUInt32BE(header.length+png.length,4);
    header.write('ic08',8);
    header.writeUInt32BE(8+png.length,12);
    await fs.writeFile(icon,Buffer.concat([header,png]));
  } else {
    const header = Buffer.alloc(22);
    header.writeUInt16LE(1,2);
    header.writeUInt16LE(1,4);
    header.writeUInt16LE(1,10);
    header.writeUInt16LE(32,12);
    header.writeUInt32LE(png.length,14);
    header.writeUInt32LE(header.length,18);
    await fs.writeFile(icon,Buffer.concat([header,png]));
  }
  return icon;
}

async function archiveGame(directory, destination) {
  const { ZipFile } = require('yazl');
  const zip = new ZipFile();
  async function append(file, name) {
    const stat = await fs.lstat(file);
    const options = { mtime: stat.mtime, mode: stat.mode };
    if (stat.isDirectory()) {
      zip.addEmptyDirectory(name,options);
      for (const child of await fs.readdir(file)) await append(path.join(file,child),path.posix.join(name,child));
    } else if (stat.isSymbolicLink()) {
      zip.addBuffer(Buffer.from(await fs.readlink(file)),name,options);
    } else if (stat.isFile()) zip.addFile(file,name,options);
  }
  // Write beside the destination so a failed build leaves an existing archive intact.
  const temporary = path.join(path.dirname(destination),'.void-' + randomUUID() + '.zip');
  const written = pipeline(zip.outputStream,createWriteStream(temporary,{ flags: 'wx' }));
  written.catch(() => {});
  zip.on('error',error => zip.outputStream.destroy(error));
  try {
    await append(directory,path.basename(directory));
    zip.end();
    await written;
    await fs.rename(temporary,destination);
  } finally {
    zip.outputStream.destroy();
    await written.catch(() => {});
    await fs.rm(temporary,{ force: true });
  }
}

async function buildDesktopGame({ input, html, destination, electronVersion }, progress = () => {}) {
  const settings = gameBuildSettings(input);
  if (settings.format === 'deb' && !await canBuildLinuxDeb()) {
    throw Error('Building a .deb requires dpkg-deb on the Linux host.');
  }
  if (typeof html !== 'string' || !html.trim()) throw Error('The game has no HTML to package.');
  progress('Preparing game files…');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(),'void-game-'));
  try {
    const source = path.join(temporary,'app');
    await fs.mkdir(source);
    const { name, title, slug, version, platform, arch } = settings;
    const icon = await writeGameIcon(source,settings.icon,platform);
    await Promise.all([
      fs.copyFile(path.join(__dirname,'game-main.cjs'),path.join(source,'main.cjs')),
      fs.copyFile(path.join(__dirname,'game-preload.cjs'),path.join(source,'game-preload.cjs')),
      fs.copyFile(path.join(__dirname,'..','LICENSE'),path.join(source,'VOID-STUDIO-LICENSE')).catch(error => {
        if (error.code !== 'ENOENT') throw error;
        return fs.copyFile(path.join(__dirname,'VOID-STUDIO-LICENSE'),path.join(source,'VOID-STUDIO-LICENSE'));
      }),
      fs.writeFile(path.join(source,'index.html'),html),
      fs.writeFile(path.join(source,'package.json'),JSON.stringify({
        name: 'void-' + slug,
        productName: title,
        version,
        author: {},
        main: 'main.cjs',
      })),
    ]);
    progress('Getting the Electron runtime from cache or downloading it…');
    const { packager } = await import('@electron/packager');
    const [built] = await packager({
      dir: source,
      out: path.join(temporary,'out'),
      tmpdir: path.join(temporary,'packager'),
      name, platform, arch, electronVersion, appVersion: version,
      appBundleId: 'game.voidstudio.' + slug,
      asar: true,
      prune: false,
      quiet: true,
      icon,
      win32metadata: { ProductName: title, FileDescription: title },
      afterExtract: [async () => { progress('Packaging the desktop app…'); }],
    });
    if (!built) throw Error('Electron Packager did not create an app.');
    if (settings.format === 'deb') {
      progress('Writing the Ubuntu / Debian package…');
      await buildLinuxDeb({
        directory: built, executable: name, packageName: 'void-game-' + slug, title, version, arch,
        category: 'Game', icon: settings.icon ? path.join(source,'icon.png') : undefined, destination,
      });
    } else {
      progress('Writing the ZIP archive…');
      await archiveGame(built,destination);
    }
    return destination;
  } finally {
    await fs.rm(temporary,{ recursive: true, force: true, maxRetries: 3 });
  }
}

if (process.parentPort) {
  // The builder copies ASAR files as archive bytes, including during cleanup.
  process.noAsar = true;
  process.parentPort.once('message', async ({ data }) => {
    try {
      await buildDesktopGame(data, message => process.parentPort.postMessage({ progress: message }));
      process.parentPort.postMessage({ done: true });
    } catch (error) {
      process.parentPort.postMessage({ error: error.message });
    }
  });
}

module.exports = { buildDesktopGame, gameBuildSettings, gameArchiveName };
