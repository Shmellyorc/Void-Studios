# VOID Studio

An offline visual 2D game editor with layout editing, sprite sheets, visual
event sheets, and a standalone game runtime. The editor opens v0.2 project JSON
and includes Shard Runner as a playable example.

## Run from source

Install Node.js 24 and run `npm ci`. Then choose how to launch the editor.

- **Browser** — Run `npm run build`, then open `dist/VOID-Studio.html`.
- **Desktop** — Run `npm start` to open the same editor in Electron.

Use **Play** to preview a layout, **Save** to download project JSON, and
**Export HTML** to create a standalone game. Preview and export bundle PixiJS
locally. Auto mode tries WebGL and falls back to Canvas 2D if WebGL is unavailable.
Select **Canvas 2D** to check the fallback, or **WebGPU first** to try WebGPU.
The layout editing canvas uses Canvas 2D.

## Tilemaps and project enums

Open **Tilemap** and create an orthogonal or isometric grid for the layout. Use
**Import Atlas** to slice one image into tiles by width, height, margin, and
spacing. The sample atlas lets you try painting without importing art. Use the
toolbar to paint, erase, draw lines or rectangles, flood fill, and pick existing
tiles. Middle-drag pans the canvas and a stroke takes one undo.

Layers can draw below or above objects. Reorder, rename, duplicate, lock, hide,
and change their opacity independently. Turn on **Solid tile collisions** for
a layer and mark atlas tiles **Solid** to use them with Platformer, Top-Down
Movement, or the visual **Move with solid collisions** action. Hidden layers
can still provide collision geometry.

Create project enums such as `Surface` with values `Grass` and `Water`. Tag an
atlas tile once and its placements carry the tag. Visual events can use **Is
standing on tagged tile**, or use world coordinates in expressions such as
`tileHasTag("Ground", Self.x, Self.y, Enums.Surface.Water)`. Define edge masks
with **Terrain Variant** and use the **Terrain** brush to connect matching
variants on a layer.

## Animator

Select an object, open **Animator**, and import a single sprite sheet. Set the
frame dimensions, margin, and spacing, then add selected frames or the entire
sheet to a named clip. Edit individual frame durations, drag to reorder frames,
and scrub or play the clip. Clips can play once, loop, or ping-pong.

Keyframe sprite offset, rotation, scale, and opacity on separate tracks. Use
linear interpolation or hold the value until the next key. Set an autoplay clip
per object type, or use the **Play clip**, **Stop clip**, and **On clip finished**
visual event blocks. These tracks animate the sprite pose. Tiles, atlases,
enum tags, and animation clips all travel with the project JSON and offline
game exports.

## Behaviors

Select an object type and click **Add Behavior** in the inspector. The picker
offers built-ins such as Platformer, Bullet, and Solid, plus any custom behaviors
defined in the project. Attached behaviors show their own settings in the inspector.

Use **Create Custom Behavior** to attach a blank visual event sheet. Use **Self**
to target the instance running the sheet, and **On instance created** to initialize
it. **Behavior Settings** defines defaults that attachments can override and events
can read as `Settings.name`. You can attach the same custom sheet to multiple object
types. Built-ins are implemented in `behaviors.js`, and the editor converts older
projects' behavior checkboxes when opening their JSON.

## Package a desktop app

Run these commands on Windows, macOS, or Linux to build for that host.

```sh
npm run make
npm run make:game -- /path/to/Shard_Runner.html
```

Electron Forge produces ZIPs in `out/studio/` and `out/games/`. The game packager
takes a self-contained HTML file, including the HTML exported by VOID Studio.
The first packaging run downloads Electron. Built apps run offline. GitHub
Actions provides unsigned editor packages as build artifacts.
