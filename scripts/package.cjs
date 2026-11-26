const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { api } = require('@electron-forge/core');
const studio = require('../package.json');

const root = path.resolve(__dirname, '..');
const htmlName = 'VOID-Studio.html';

async function makeDesktopApp() {
  const args = process.argv.slice(2);
  const game = args[0] === '--game' && args.length === 2 ? path.resolve(args[1]) : null;
  if (args.length && (!game || !/\.html?$/i.test(game))) {
    throw new Error('Usage: npm run make:game -- <self-contained-game.html>');
  }

  const gameName = game && path.parse(game).name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^[-_]+/, '');
  const productName = game ? (gameName || 'Game') : studio.productName;
  const metadata = {
    name: game ? `game-${productName.toLowerCase()}` : studio.name,
    productName,
    version: game ? '1.0.0' : studio.version,
    main: studio.main,
    devDependencies: { electron: studio.devDependencies.electron },
    config: {
      forge: {
        packagerConfig: { asar: true },
        makers: [{ name: '@electron-forge/maker-zip' }],
      },
    },
  };

  const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'void-studio-'));
  try {
    const app = path.join(stage, 'app');
    await fs.mkdir(path.join(app, 'desktop'), { recursive: true });
    await fs.mkdir(path.join(app, 'dist'));
    await fs.writeFile(path.join(app, 'package.json'), JSON.stringify(metadata, null, 2));
    await fs.copyFile(path.join(root, studio.main), path.join(app, studio.main));
    await fs.copyFile(path.join(root, 'LICENSE'), path.join(app, 'VOID-STUDIO-LICENSE'));
    await fs.copyFile(game || path.join(root, 'dist', htmlName), path.join(app, 'dist', htmlName));

    const results = await api.make({ dir: app, outDir: path.join(stage, 'out') });
    const destination = path.join(root, 'out', game ? 'games' : 'studio');
    await fs.mkdir(destination, { recursive: true });

    for (const result of results) {
      for (const artifact of result.artifacts) {
        const file = path.join(destination, path.basename(artifact));
        await fs.copyFile(artifact, file);
        console.log(`Created ${path.relative(root, file)}`);
      }
    }
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}

makeDesktopApp().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
