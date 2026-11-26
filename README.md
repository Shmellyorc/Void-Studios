# VOID Studio

An offline visual 2D game editor with layout editing, sprite sheets, visual
event sheets, and a standalone game runtime. The editor opens v0.2 project JSON
and includes Shard Runner as a playable example.

## Run from source

Install Node.js 24 and run `npm ci`. Then choose how to launch the editor.

- **Browser** — Run `npm run build`, then open `dist/VOID-Studio.html`.
- **Desktop** — Run `npm start` to open the same editor in Electron.

Use **Run → Preview** to preview a layout. The **File** menu has **Save Project**
for `.void` files and **Export Game** for standalone games. Preview and export bundle PixiJS
locally. Auto mode tries WebGL and falls back to Canvas 2D if WebGL is unavailable.
Select **Canvas 2D** to check the fallback, or **WebGPU first** to try WebGPU.
The layout editing canvas uses Canvas 2D.

The `.void` format stores sprite images, tilesets, and audio as binary data and
stores identical embedded media once. A saved project is self-contained. **Open**
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

## Sprite Editor

Open **Sprite** to draw from scratch or open a local image. From Layout or
Animator, use **Edit Sprite** to work on an object's existing artwork. The
editor supports stacked layers with visibility, locking, ordering, and opacity,
a reusable palette, mirrored brushes, flood fill, an eyedropper, and shape tools.
Scroll over the artwork to zoom. Middle-drag or hold Space and drag to pan.

The left and right mouse buttons each have a paint color and opacity. With a
drawing tool active, hold Alt (Option on Mac) and click to sample into that
button. Sample a transparent pixel to erase with that button. You can also
click a palette swatch with either button, including the checkerboard swatch
for transparency.

Drag the divider after the palette swatches to add or remove color slots.
Double-click a swatch to edit it. The palette lock protects the entries while
you paint. Shift-click a second swatch to select a range for palette operations
such as gradients. Use the palette controls to load or save a GIMP palette
file or pick a preset.

Each Sprite panel can collapse, move up or down, switch sides, or hide. Use
**Panels** in the menu bar to show panels again or reset their positions.
Double-click a layer name to rename it, and drag its thumbnail to reorder it.
Brush size and mirroring are in the top toolbar, and the **Brush** menu also
controls mirroring.

Use rectangular or elliptical selection, freehand lasso, or a magic wand with
color tolerance and contiguous or matching-color selection. Hold Shift to add,
Alt to subtract, or both to intersect. The **Selection** menu includes cut,
copy, paste, flip, and rotate. Drag with **Move Selection** to reposition the
selected pixels. Draw a named rectangle with **Slice**, or create a slice from
a selection. Export a slice or the whole composited image as PNG.

The **Timeline** lists layers down the side and frames across the top. Pick a
cell to draw on that layer in that frame. Add a blank frame or duplicate the
current frame across every layer. Drag frame headings to reorder them, or use
the arrow buttons. Set each frame's duration in milliseconds and press **Play**
to preview the loop. Onion skinning can show the previous and next frames
with separate colors and opacity. **Copy Previous** copies pixels on the
active layer.

**Link to Object** publishes the composite to an object. In **Animator**, new
clip frames added from a linked sprite use its timeline durations. Existing
clips keep the same artwork and timing when frames move in the sprite sheet.
Slices inside a single frame travel with it. A frame used by an Animator clip
or named slice can be deleted after that reference is removed. Binary project
files retain the editable layers, timeline, palette, and slices. Game exports
carry the published artwork and clips.

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

Open **State Machine** in Animator to assign clips to named states and choose
the initial state. Each rule moves from a specific state or any state to a
destination. All conditions on a rule must match, and the first matching
rule wins. Available conditions compare measured movement speed or instance
variables, or wait for the current state's one-shot clip to finish.

Event sheets can use **Set animation state**, **Is in animation state**, and
**On animation state entered**. State entry is reported on the next
simulation tick. Setting a state takes priority over rules for that frame.
Direct clip and frame actions switch the instance to manual animation.
**Set animation state** resumes its state machine.

In Preview, open **Inspector → Instances** and select an object to see its
state, measured speed, and recent transitions. **Animator → Load State Machine
Demo** opens Shard Runner with idle and walk states and a one-shot pickup
reaction.

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

## Event sheets

Open **Event Sheet** to edit a layout sheet, a shared sheet, or a custom
behavior sheet. Use **New Sheet** to create shared logic. A layout can run its
own sheet or an assigned shared sheet. **Include** runs a shared sheet at that
position in the event list. Each included sheet runs once per pass, and the
editor prevents circular includes.

Organize rows in nested, collapsible groups. Drag a row by its grip to move it,
or use **Move to group**. Colored headers and guides show where each group
starts and ends in the editor and live inspector. Comments can describe a
whole event or an individual condition or action. Disabling a group skips its events, and **System → Set
group active** can change that at runtime. **Else** runs when the preceding
branch did not match. **Trigger once while true** fires once for the same
picked selection until the other conditions fall false.

**Add Event** starts with the first condition. Choose a target, search the
commands it supports, then configure the parameters. Fixed choices use
dropdowns. Expression fields suggest properties after typing a name such as
`Mouse.` or `Self.`. Both `Mouse.X` and `Mouse.x` work in formulas.

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

## Menus, HUDs, and input

Open **UI** to create a screen and add buttons, labels, or bars. Drag controls
on the viewport and drag their edge or corner handles to resize them. Shift-click
controls or drag a selection box from empty space to select several. **Align**
can place a selection anywhere in the viewport as a group, or line up the edges
and centers of selected controls. The inspector also has anchor, offset, size,
and color fields for a single control.
Set **Starting UI** for each layout. Layouts can share screens, and a screen can
pause gameplay while its controls are active.

Add a **Panel** for free placement, a vertical stack, or a horizontal stack.
Set padding, gap, and cross-axis alignment in its inspector. Add controls while
a panel is selected, or move existing controls with **Parent panel**. Use the
hierarchy to reorder siblings, group a selection, or hide and lock items while
editing. The **Viewport** picker previews narrow, wide, ultrawide, and portrait
camera shapes without changing the layout.

Sliders, toggles, and dropdowns write to their bound global variable. Use **On
control value changed** to react in the visual event sheet. In a menu, Up and
Down move focus, Left and Right adjust the focused setting, and Confirm
activates buttons or toggles. **Styles** creates reusable fonts and colors,
including hover, pressed, focused, and disabled states.

Buttons can open a layout, restart it, show a different screen, or restore the
layout's starting UI. Choose **Trigger visual event** on a button and add **On
button activated** to run its event. To run a button event on a paused screen, put the activation condition
on the top-level row. Labels can display global values with tokens such as
`{Score}`. Bars read a numeric global and use the maximum set in the inspector.

Open **Input Actions** from the UI or Event Sheet toolbar to bind names to
keyboard keys and standard gamepad buttons. Use **On action pressed** for a
one-shot input or **Is action held** for continuous input. The menu actions
control focus and confirmation. Change each button's **Focus order** to set
the sequence. The Menu Back action restores the layout's starting UI from a
menu overlay. You can turn off menu navigation on a screen such as a gameplay HUD.

Choose **Load Menu Demo** in the UI workspace to try the Shard Runner title
screen, Options panel, HUD, and pause menu. Options includes a volume slider, a
fullscreen toggle, and a test-tone dropdown. Browser fullscreen can require a
mouse or keyboard gesture. Move with the arrow keys or D-pad and pause with
Escape or Start. Open **Editor → Settings** for renderer selection, event
execution mode, and the default layout grid.

The menu bar below the header shows commands for the active workspace. Layout
has camera and object menus, Tilemap has map and layer menus, and Animator has
sprite sheet and clip menus. The mouse wheel zooms over the Scene, Tilemap,
Animator, or UI canvas. Middle-drag pans the Scene, Tilemap, and UI canvases.
**View → Reset View** restores the default zoom and canvas position.

## Project fonts

Open **Project → Fonts** to import a TTF, OTF, or WOFF font, download a Google
Fonts family, or select a BMFont `.fnt` descriptor together with its atlas
images. Select an imported font in a text object, UI control, or shared UI
style. Saved projects and exports embed their fonts for offline use.

For a flood-fill font, import its image and select a character mapping preset
or enter the exact character order. The preview pairs each detected glyph with
its mapped character before import. The loader scans the image from top to
bottom and left to right, using four-neighbor connectivity to identify each
glyph. Pixel `(0,0)` supplies the ignore color. A glyph can be one pixel wide.

## Audio

Open **Audio** and choose **Import Audio** to add clips such as WAV, MP3, or
Ogg. Select a clip to audition it or set its default mixer channel. Change
**Master**, **Music**, **Sound Effects**, or **UI** in the mixer to set the
project defaults. The clips travel with the saved project and offline exports.

Use **Play audio** in an event sheet to choose a clip, channel, volume, and
whether it loops. Untagged sounds can overlap. A named tag replaces any
previous playback with the same tag. **Stop audio** and **Fade audio** target
that tag. Leaving it empty targets all clips. **Set channel volume** changes
the mixer from events. Expressions such as `audioLevel("music")` read its
current level. **On screen shown** can trigger an audio transition when a pause
menu opens or a HUD returns.

**Load Audio Demo** opens Shard Runner with original music and sounds. The
Options screen has a slider for each channel. Pause fades the music down and
Resume restores its level. Click or press a key in the game when the browser
requires an interaction to start audio.

## Export a game

Open **Export Game** to set the game title, version, icon, and startup layout.
**Save settings** stores these choices in the project. The startup layout
applies to the exported game. **Preview** starts from the layout you are editing.

- **Web (HTML)** creates one self-contained file that runs offline. This target
  works in both the browser editor and the desktop app.
- **Windows, macOS, and Linux** create portable ZIPs from the desktop editor.
  Choose the target and its architecture. After the build, **Show in folder**
  opens the ZIP's location. Unzip the package before launching the game.

The first desktop build for a target may download its Electron runtime. Later
builds reuse the cached runtime. Game files are packaged locally. Desktop ZIPs
are unsigned and contain the game and its runtime.

## Package from the command line

Run these commands on Windows, macOS, or Linux to build for that host.

```sh
npm run make
npm run make:game -- /path/to/Shard_Runner.html
```

Electron Forge produces ZIPs in `out/studio/` and `out/games/`. The game packager
takes a self-contained HTML file, including the HTML exported by VOID Studio.
The first packaging run downloads Electron. Built apps run offline. GitHub
Actions provides unsigned editor packages as build artifacts.
