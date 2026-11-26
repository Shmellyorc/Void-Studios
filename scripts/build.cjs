const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const pixiRoot = path.resolve(path.dirname(require.resolve('pixi.js')), '..');
const pixi = fs.readFileSync(path.join(pixiRoot, 'dist', 'pixi.min.js'));

const source = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const notices = [source('LICENSE'), fs.readFileSync(path.join(pixiRoot, 'LICENSE'), 'utf8')];
const html = source('shell.html')
  .replace('/*PIXI*/', () => pixi.toString('base64'))
  .replace('/*LICENSES*/', () => notices.join('\n'))
  .replace('/*ASSET_CSS*/', () => source('asset-workspaces.css'))
  .replace('/*DEBUGGER_CSS*/', () => source('studio-debugger.css'))
  .replace('/*SCENE_EFFECTS*/', () => source('scene-effects.js'))
  .replace('/*BEHAVIORS*/', () => source('behaviors.js'))
  .replace('/*TILEMAP*/', () => source('tilemap.js'))
  .replace('/*NAVIGATION*/', () => source('navigation.js'))
  .replace('/*ANIMATION*/', () => source('animation.js'))
  .replace('/*RUNTIME*/', () => source('runtime.js'))
  .replace('/*TILE_EDITOR*/', () => source('tile-editor.js'))
  .replace('/*ANIMATOR_EDITOR*/', () => source('animator-editor.js'))
  .replace('/*STUDIO_DEBUGGER*/', () => source('studio-debugger.js'))
  .replace('/*EDITOR*/', () => source('editor.js'));

fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'VOID-Studio.html'), html);
console.log('Built dist/VOID-Studio.html');
