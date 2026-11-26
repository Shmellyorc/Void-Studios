const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const pixiRoot = path.resolve(path.dirname(require.resolve('pixi.js')), '..');
const pixi = fs.readFileSync(path.join(pixiRoot, 'dist', 'pixi.min.js'));
const spriteControls = require('esbuild').buildSync({
  entryPoints: [path.join(root, 'sprite-controls.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  legalComments: 'inline',
  write: false,
}).outputFiles[0].text;

const source = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const notices = [source('LICENSE'), fs.readFileSync(path.join(pixiRoot, 'LICENSE'), 'utf8')];
const html = source('shell.html')
  .replace('/*PIXI*/', () => pixi.toString('base64'))
  .replace('/*LICENSES*/', () => notices.join('\n'))
  .replace('/*ASSET_CSS*/', () => source('asset-workspaces.css'))
  .replace('/*DEBUGGER_CSS*/', () => source('studio-debugger.css'))
  .replace('/*GAME_UI_CSS*/', () => source('game-ui.css'))
  .replace('/*STUDIO_MENU_CSS*/', () => source('studio-menu.css'))
  .replace('/*SCENE_EFFECTS*/', () => source('scene-effects.js'))
  .replace('/*BEHAVIORS*/', () => source('behaviors.js'))
  .replace('/*TILEMAP*/', () => source('tilemap.js'))
  .replace('/*NAVIGATION*/', () => source('navigation.js'))
  .replace('/*ANIMATION*/', () => source('animation.js'))
  .replace('/*EVENT_EXPRESSIONS*/', () => source('event-expressions.js'))
  .replace('/*COMPONENTS*/', () => source('components.js'))
  .replace('/*UI_LAYOUT*/', () => source('ui-layout.js'))
  .replace('/*GAME_UI*/', () => source('game-ui.js'))
  .replace('/*AUDIO*/', () => source('audio.js'))
  .replace('/*RUNTIME*/', () => source('runtime.js'))
  .replace('/*TILE_EDITOR*/', () => source('tile-editor.js'))
  .replace('/*ANIMATOR_EDITOR*/', () => source('animator-editor.js'))
  .replace('/*ANIMATION_MACHINE_EDITOR*/', () => source('animation-machine-editor.js'))
  .replace('/*STUDIO_DEBUGGER*/', () => source('studio-debugger.js'))
  .replace('/*EVENT_COMPILER*/', () => source('event-compiler.js'))
  .replace('/*COMPONENT_EDITOR*/', () => source('component-editor.js'))
  .replace('/*PROJECT_FILE*/', () => source('project-file.js'))
  .replace('/*GAME_EXPORT*/', () => source('game-export.js'))
  .replace('/*UI_EDITOR*/', () => source('ui-editor.js'))
  .replace('/*AUDIO_EDITOR*/', () => source('audio-editor.js'))
  .replace('/*SPRITE_PIXELS*/', () => source('sprite-pixels.js'))
  .replace('/*SPRITE_CONTROLS*/', () => spriteControls)
  .replace('/*SPRITE_WORKSPACE*/', () => source('sprite-workspace.js'))
  .replace('/*SPRITE_TIMELINE*/', () => source('sprite-timeline.js'))
  .replace('/*SPRITE_EDITOR*/', () => source('sprite-editor.js'))
  .replace('/*WORKSPACE_ZOOM*/', () => source('workspace-zoom.js'))
  .replace('/*STUDIO_MENU*/', () => source('studio-menu.js'))
  .replace('/*EDITOR*/', () => source('editor.js'));

fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'VOID-Studio.html'), html);
console.log('Built dist/VOID-Studio.html');
