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
