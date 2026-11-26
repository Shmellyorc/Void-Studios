# VOID Studio

An offline visual 2D game editor with layout editing, sprite sheets, visual
event sheets, and a standalone game runtime. The editor opens v0.2 project JSON
and includes Shard Runner as a playable example.

## Run from source

Install Node.js 24 and run `npm ci`. Then choose how to launch the editor.

- **Browser** — Run `npm run build`, then open `dist/VOID-Studio.html`.
- **Desktop** — Run `npm start` to open the same editor in Electron.

Use **Play** to preview a layout, **Save project** to download a `.void` file, and
**Export HTML** to create a standalone game. Preview and export bundle PixiJS
locally. Auto mode tries WebGL and falls back to Canvas 2D if WebGL is unavailable.
Select **Canvas 2D** to check the fallback, or **WebGPU first** to try WebGPU.
The layout editing canvas uses Canvas 2D.

The `.void` format stores sprite and tileset images as binary data and stores
identical embedded images once. A saved project is self-contained. **Open**
also reads older `.void.json` projects. Save one again to convert it to `.void`.

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

## Camera and HUD

Open **Camera Settings** in the layout inspector to set the game viewport, zoom,
follow target, and how quickly the camera catches up. The dashed guide shows the
starting view. Visual events can follow a picked instance, set the camera center
or zoom, and shake the camera. Mark an object type **Screen space (HUD)** to keep
it fixed to the viewport. `Mouse.x` and `Mouse.y` give world coordinates, while
`Mouse.screenX` and `Mouse.screenY` give viewport coordinates.

## Animated particles

Attach **Particle Emitter** to an object. Configure its emission rate, lifetime,
direction, spread, size, spin, gravity, fading, and blend mode. Set the rate to
zero for an emitter driven by the **Emit particle burst** event action.

For sprite particles, import a sheet in **Animator** and make a clip on any
sprite type in the project. Pick that type and clip in the emitter, or reuse the
emitter's own sprite. Each particle starts its clip at birth and has its own
animation speed and lifetime. The entire effect is bundled in the offline export.

## Tilemap pathfinding

Attach **Tilemap Pathfinding** and use **Navigate to point** with world
coordinates such as `Mouse.x` and `Mouse.y`. The object follows an A* route to the
center of the destination cell. Routes respect collision-enabled solid tiles
and objects with **Solid** on both orthogonal and isometric maps. **On
destination reached** and **On navigation failed** fire once per attempt. Use
**Stop navigation** to cancel an active route.

## Debugger and profiler

Click the breakpoint dot on a visual event and choose **Play**. When the
event matches, the preview opens its sheet and highlights the next action.
The live sheet shows condition results and picked instances. Select an instance
to inspect its position, animation, navigation state, and variables alongside
the globals. The preview can also set or remove breakpoints while the game is
running. Breakpoints stay in the editor session.

Use **Step Into** to enter a visual function and **Step Over** to finish the
current call before stopping at the next action. **Frame** runs the rest of the
current frame, or one frame from a manual pause. Turn on **Trace** to review
recent hits across layout and custom behavior sheets. **Follow** moves the live
sheet to the latest hit.

The **Profiler** captures rolling CPU timings for simulation, visual events,
and rendering. It shows inclusive timings by event sheet and timings by
built-in behavior. Time spent at a breakpoint is excluded. Exported games run
with the editor debugger inactive.

## Compiled and interpreted events

The **Events** picker sets the execution mode for preview and HTML export.
Compiled mode generates JavaScript for each visual row and its expressions.
Offline exports include that generated code and use the same picking, collision,
timer, behavior, and visual function semantics as the interpreter.

Open **JavaScript** from an event sheet or click **JS** on a row. The viewer
shows the generated lines and expression functions for that sheet, with
diagnostics attached to their visual row. Download the full generated program
from the same window. During a breakpoint, the inspector’s **JavaScript**
button opens the code for the paused row. Step and breakpoints work in both modes.

## Prefabs

In **Layout**, select an instance or Shift-click several, then choose
**Create prefab**. You can replace that selection with a linked copy at the
same position. Select the prefab in the sidebar to place it in any layout.
Drag a linked copy as a group or use its inspector to set position, angle,
and scale. **Edit prefab** lets you preview, add, remove, and reposition
members. Saving updates every linked copy throughout the project.
**Unlink** turns a copy into individually editable instances at their
current positions.

## Extension packs

Open **Extensions** to create a pack from the included example, import a
pack's JSON, or export one to reuse in another project. Installed blocks
appear in the condition or action picker for both layout and behavior sheets.
Projects and standalone games include their installed packs.

A pack has a `format` of `void-studio-extension-1`, a stable `id`, a
display `name`, a `version` string, and a `blocks` array. Block IDs and pack
IDs start with a lowercase letter and can include lowercase letters, numbers,
and hyphens. Keep these IDs stable when updating a pack because events
reference them.

```json
{
  "format": "void-studio-extension-1",
  "id": "motion",
  "name": "Motion",
  "version": "1.0.0",
  "blocks": [
    {
      "id": "nudge",
      "name": "Nudge horizontally",
      "kind": "action",
      "parameters": [{"name": "distance", "label": "Distance", "default": "16"}],
      "operations": [{"operation": "add", "property": "x", "value": "distance"}]
    },
    {
      "id": "past-edge",
      "name": "Is beyond edge",
      "kind": "condition",
      "parameters": [{"name": "edge", "label": "Edge X", "default": "640"}],
      "expression": "Self.x > edge"
    }
  ]
}
```

Blocks use the editor's expression language. Parameter values are evaluated
for each picked instance. In the block formula, `Self` is the object picked
by the block. A condition filters that selection. An action runs its `set`
and `add` operations in order on each picked object. Actions can write
`x`, `y`, `w`, `h`, `angle`, `opacity`, `vx`, and `vy`, or an instance
variable. Use `set` to change `visible` or `text`.

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
