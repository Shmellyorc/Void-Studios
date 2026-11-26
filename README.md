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
