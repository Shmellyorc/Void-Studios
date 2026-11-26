const fs = require('node:fs/promises');
const { execSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { api } = require('@electron-forge/core');
const studio = require('../package.json');
const { buildDesktopGame, gameArchiveName, gameBuildSettings } = require('../desktop/game-build.cjs');

const root = path.resolve(__dirname, '..');
const htmlName = 'VOID-Studio.html';

async function stageBuildTools(directory) {
  await fs.mkdir(directory);
  // Reuse the lockfile's installed production dependencies. Packaging itself stays offline.
  const dependencies = execSync('npm ls --omit=dev --all --parseable', { cwd: root, encoding: 'utf8' })
    .trim().split(/\r?\n/).filter(item => path.relative(root,item).startsWith('node_modules' + path.sep));
  for (const item of dependencies) {
    await fs.cp(item,path.join(directory,path.relative(root,item)),{
      recursive: true,
      filter: source => path.basename(source) !== 'node_modules',
    });
  }
  await Promise.all([
    ...['game-build.cjs','game-main.cjs','game-preload.cjs'].map(file => fs.copyFile(path.join(root,'desktop',file),path.join(directory,file))),
    fs.copyFile(path.join(root,'LICENSE'),path.join(directory,'VOID-STUDIO-LICENSE')),
  ]);
}

async function makeGame(game) {
  const input = gameBuildSettings({
    title: path.parse(game).name, version: '1.0.0', platform: process.platform, arch: process.arch,
  });
  const html = await fs.readFile(game,'utf8');
  const output = path.join(root,'out','games');
  await fs.mkdir(output,{ recursive: true });
  const destination = path.join(output,gameArchiveName(input));
  await buildDesktopGame({ input, html, destination, electronVersion: studio.devDependencies.electron },console.log);
  console.log(`Created ${path.relative(root,destination)}`);
}

async function makeDesktopApp() {
  const args = process.argv.slice(2);
  const game = args[0] === '--game' && args.length === 2 ? path.resolve(args[1]) : null;
  if (args.length && (!game || !/\.html?$/i.test(game))) {
    throw new Error('Usage: npm run make:game -- <self-contained-game.html>');
  }
  if (game) return makeGame(game);

  const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'void-studio-'));
  const buildTools = path.join(stage,'build-tools');
  const platform = process.platform;
  const arch = process.arch;
  // macOS Info.plist version fields require a numeric version. The ZIP uses
  // metadata.version below, and the editor label comes from the source version.
  const appVersion = platform === 'darwin' ? studio.version.split(/[-+]/,1)[0] : studio.version;
  const metadata = {
    name: studio.name,
    productName: studio.productName,
    version: studio.version,
    main: studio.main,
    devDependencies: { electron: studio.devDependencies.electron },
    config: {
      forge: {
        packagerConfig: { asar: true, appVersion, extraResource: [buildTools], tmpdir: path.join(stage,'packager') },
        makers: [{ name: '@electron-forge/maker-zip' }],
      },
    },
  };

  try {
    const app = path.join(stage, 'app');
    await fs.mkdir(path.join(app, 'desktop'), { recursive: true });
    await fs.mkdir(path.join(app, 'dist'));
    await fs.writeFile(path.join(app, 'package.json'), JSON.stringify(metadata, null, 2));
    await fs.copyFile(path.join(root, studio.main), path.join(app, studio.main));
    await fs.copyFile(path.join(root,'desktop','export-preload.cjs'),path.join(app,'desktop','export-preload.cjs'));
    await fs.copyFile(path.join(root, 'LICENSE'), path.join(app, 'VOID-STUDIO-LICENSE'));
    await fs.copyFile(path.join(root, 'dist', htmlName), path.join(app, 'dist', htmlName));
    await stageBuildTools(buildTools);

    const results = await api.make({ dir: app, outDir: path.join(stage, 'out'), platform, arch });
    const destination = path.join(root, 'out', 'studio');
    await fs.mkdir(destination, { recursive: true });

    for (const result of results) {
      for (const artifact of result.artifacts) {
        const file = path.join(destination, path.basename(artifact));
        await fs.copyFile(artifact, file);
        console.log(`Created ${path.relative(root, file)}`);
      }
    }
  } finally {
    await fs.rm(stage, { recursive: true, force: true, maxRetries: 3 });
  }
}

makeDesktopApp().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
