const fs = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID } = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

const run = promisify(execFile);
const architectures = { x64: 'amd64', arm64: 'arm64' };
const dependencies = [
  'libasound2t64 | libasound2', 'libatk-bridge2.0-0t64 | libatk-bridge2.0-0', 'libatk1.0-0t64 | libatk1.0-0',
  'libatspi2.0-0t64 | libatspi2.0-0', 'libc6', 'libcairo2', 'libcups2t64 | libcups2', 'libdbus-1-3',
  'libexpat1', 'libgbm1', 'libgcc-s1', 'libglib2.0-0t64 | libglib2.0-0', 'libgtk-3-0t64 | libgtk-3-0',
  'libnspr4', 'libnss3', 'libpango-1.0-0', 'libudev1', 'libx11-6', 'libxcb1', 'libxcomposite1',
  'libxdamage1', 'libxext6', 'libxfixes3', 'libxkbcommon0', 'libxrandr2',
].join(', ');

async function canBuildLinuxDeb() {
  if (process.platform !== 'linux') return false;
  try {
    await run('dpkg-deb', ['--version']);
    return true;
  } catch {
    return false;
  }
}

// Debian sorts a tilde suffix before the corresponding stable version.
const debVersion = version => version.replace('-', '~');

function linuxDebName(packageName, version, arch) {
  return `${packageName}_${debVersion(version)}_${architectures[arch]}.deb`;
}

async function preparePackageTree(directory) {
  await fs.chmod(directory, 0o755);
  let size = 0;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) size += await preparePackageTree(file);
    else if (entry.isFile()) {
      const info = await fs.stat(file);
      await fs.chmod(file, info.mode & 0o111 ? 0o755 : 0o644);
      size += Math.ceil(info.size / 1024);
    }
  }
  return size;
}

async function buildLinuxDeb({ directory, executable, packageName, title, version, arch, category, icon, destination }) {
  if (!Object.hasOwn(architectures,arch) || !/^[a-z][a-z0-9-]+$/.test(packageName) ||
      !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(version)) {
    throw Error('Invalid Debian package name, version, or architecture.');
  }
  const architecture = architectures[arch];
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'void-deb-'));
  const output = path.join(path.dirname(destination), '.void-' + randomUUID() + '.deb');
  try {
    const control = path.join(stage, 'DEBIAN');
    const appPath = '/opt/' + packageName;
    const command = '/usr/bin/' + packageName;
    const app = path.join(stage, appPath);
    const desktop = path.join(stage, 'usr/share/applications');
    await Promise.all([
      fs.mkdir(control),
      fs.mkdir(path.dirname(app), { recursive: true }),
      fs.mkdir(path.join(stage, 'usr/bin'), { recursive: true }),
      fs.mkdir(desktop, { recursive: true }),
    ]);
    await fs.cp(directory, app, { recursive: true, verbatimSymlinks: true });
    const sandbox = path.join(app, 'chrome-sandbox');
    if (!(await fs.lstat(sandbox)).isFile()) throw Error('Electron did not provide its Chromium sandbox helper.');
    const appExecutable = path.join(app, executable);
    if (!(await fs.lstat(appExecutable)).isFile()) throw Error('Electron did not provide the app executable.');
    const launcher = path.posix.join(appPath, packageName);
    if (executable !== packageName) await fs.rename(appExecutable, path.join(app, packageName));
    await fs.symlink(launcher, path.join(stage, command));

    const name = title.replace(/[\x00-\x1f\x7f]/g, ' ').trim();
    let desktopIcon = category === 'Development' ? 'applications-development' : 'applications-games';
    if (icon) {
      const icons = path.join(stage, 'usr/share/icons/hicolor/256x256/apps');
      await fs.mkdir(icons, { recursive: true });
      await fs.copyFile(icon, path.join(icons, packageName + '.png'));
      desktopIcon = packageName;
    }
    await fs.writeFile(path.join(desktop, packageName + '.desktop'), [
      '[Desktop Entry]', 'Type=Application', 'Name=' + name.replace(/\\/g, '\\\\'), 'Exec=' + command,
      'Icon=' + desktopIcon, 'Terminal=false', 'Categories=' + category + ';', '',
    ].join('\n'));
    // Packager's temporary directories can be private, but the installed app
    // must be readable and executable by regular users.
    const size = await preparePackageTree(stage);
    // dpkg-deb records root ownership. Only the official Electron helper is setuid.
    await fs.chmod(sandbox, 0o4755);
    await fs.writeFile(path.join(control, 'control'), [
      'Package: ' + packageName, 'Version: ' + debVersion(version), 'Architecture: ' + architecture,
      'Section: ' + (category === 'Development' ? 'devel' : 'games'), 'Priority: optional',
      'Maintainer: VOID Studio contributors', 'Installed-Size: ' + size, 'Depends: ' + dependencies,
      'Description: ' + name, '',
    ].join('\n'), { mode: 0o644 });
    await run('dpkg-deb', ['--root-owner-group', '-Zgzip', '--build', stage, output]);
    await fs.rename(output, destination);
  } finally {
    await Promise.all([fs.rm(stage, { recursive: true, force: true }), fs.rm(output, { force: true })]);
  }
}

module.exports = { buildLinuxDeb, canBuildLinuxDeb, linuxDebName };
