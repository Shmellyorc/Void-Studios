const tileWorkspace = {
 layout: null, layer: null, atlas: null, column: 0, row: 0, tool: 'paint',
 flipX: false, flipY: false, grid: true, enumIcons: true, zoom: 1, hover: null, stroke: null, tagFilter: '',
};
const tilePaletteView = {};
const tileTools = [
 ['paint', 'Paint', 'B'], ['erase', 'Erase', 'E'], ['line', 'Line', 'L'],
 ['rectangle', 'Rectangle', 'R'], ['fill', 'Fill', 'F'], ['terrain', 'Terrain', 'T'], ['pick', 'Pick', 'I'],
];
const terrainEdges = [[0, -1, 'North'], [1, 0, 'East'], [0, 1, 'South'], [-1, 0, 'West']];
const availableAtlases = () => new Map(P.tilesets.map(atlas => [atlas.id, atlas]));
const selectedTileLayer = () => L().tilemap?.layers.find(layer => layer.id === tileWorkspace.layer);
const selectedAtlas = () => P.tilesets.find(atlas => atlas.id === tileWorkspace.atlas);

function validateAssetProject(project) {
 project.version = 12;
 project.tilesets ??= [];
 project.enums ??= [];
 if (!Array.isArray(project.tilesets) || !Array.isArray(project.enums)) throw Error('Invalid project assets');
 const atlases = new Map();
 for (const atlas of project.tilesets) {
  if (!atlas || typeof atlas.id !== 'string' || atlases.has(atlas.id) || typeof atlas.name !== 'string' ||
   typeof atlas.image !== 'string' || !/^data:image\//i.test(atlas.image) || !isRecord(atlas.tiles) ||
   ![atlas.width, atlas.height, atlas.tileWidth, atlas.tileHeight].every(n => Number.isInteger(n) && n > 0) ||
   ![atlas.margin, atlas.spacing].every(n => Number.isInteger(n) && n >= 0) ||
   !atlasSize(atlas).every(count => count >= 1 && count <= 256) || Object.values(atlas.tiles).some(meta => !Array.isArray(meta?.tags))) {
   throw Error('Invalid tileset atlas');
  }
  atlases.set(atlas.id, atlas);
 }
 for (const enumType of project.enums) {
  if (!enumType || typeof enumType.id !== 'string' || !validSettingName(enumType.name) || !Array.isArray(enumType.values) ||
   enumType.values.some(value => !value || typeof value.id !== 'string' || !validSettingName(value.name) ||
    value.icon !== undefined && typeof value.icon !== 'string')) throw Error('Invalid project enum');
 }
 for (const layout of project.layouts) {
  if (layout.camera && !validSceneCamera(layout.camera)) throw Error('Invalid camera settings');
  const map = layout.tilemap;
  if (!map) continue;
  if (!['orthogonal', 'isometric'].includes(map.orientation) || !Array.isArray(map.layers) ||
   ![map.columns, map.rows, map.cellWidth, map.cellHeight].every(n => Number.isInteger(n) && n >= 1 && n <= 256) ||
   ![map.x, map.y].every(n => Number.isInteger(n) && n >= 0)) throw Error('Invalid tilemap grid');
  const [width, height] = tileMapSize(map);
  if (map.x + width > 4096 || map.y + height > 4096) throw Error('Tilemap exceeds the layout limit');
  for (const layer of map.layers) {
   if (!layer || typeof layer.id !== 'string' || typeof layer.name !== 'string' || !isRecord(layer.cells) ||
    !Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) throw Error('Invalid tile layer');
   for (const [key, tile] of Object.entries(layer.cells)) {
    if (!/^\d+,\d+$/.test(key) || !tileInBounds(map, ...key.split(',').map(Number)) || !tile || !atlases.has(tile.atlas)) {
     throw Error('Invalid tile placement');
    }
    const [columns, rows] = atlasSize(atlases.get(tile.atlas));
    if (!Number.isInteger(tile.column) || !Number.isInteger(tile.row) || tile.column < 0 || tile.row < 0 ||
     tile.column >= columns || tile.row >= rows) throw Error('Invalid atlas coordinates');
   }
  }
 }
 if (project.types.some(type => type.animator && !validAnimator(type.animator))) throw Error('Invalid Animator clips or state machine');
 return project;
}

function readStudioImage(file) {
 return new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(Error('Could not read the image'));
  reader.onload = () => {
   const image = new Image();
   image.onload = () => resolve({ image: reader.result, width: image.naturalWidth, height: image.naturalHeight });
   image.onerror = () => reject(Error('Choose an image that the browser can open'));
   image.src = reader.result;
  };
  reader.readAsDataURL(file);
 });
}

function tileLayer(name) {
 return { id: uid(), name, visible: true, locked: false, opacity: 1, above: false, collision: false, cells: {} };
}

function configureTilemap() {
 const layout = L();
 const map = layout.tilemap ?? { orientation: 'orthogonal', columns: 20, rows: 12, cellWidth: 32, cellHeight: 32, x: 0, y: 0 };
 const sizes = [['columns', 'Columns'], ['rows', 'Rows'], ['cellWidth', 'Cell width'], ['cellHeight', 'Cell height'], ['x', 'Origin X'], ['y', 'Origin Y']];
 simple(layout.tilemap ? 'Tilemap Settings' : 'Create Tilemap',
  select('Projection', 'orientation', map.orientation, [['orthogonal', 'Orthogonal'], ['isometric', 'Isometric']]) +
  `<div class="two">${sizes.map(([key, label]) => field(label, key, map[key], 'number')).join('')}</div>`, values => {
   const data = Object.fromEntries(sizes.map(([key]) => [key, Number(values[key])]));
   const updated = { ...data, orientation: values.orientation, layers: map.layers ?? [tileLayer('Ground')] };
   if (!Object.values(data).every(Number.isInteger) || data.columns < 1 || data.rows < 1 || data.columns > 256 || data.rows > 256 ||
    data.cellWidth < 2 || data.cellHeight < 2 || data.cellWidth > 256 || data.cellHeight > 256 || data.x < 0 || data.y < 0) {
    throw Error('Use 1–256 rows and columns, 2–256 px cells, and a nonnegative origin');
   }
   const [width, height] = tileMapSize(updated);
   if (data.x + width > 4096 || data.y + height > 4096) throw Error('The tilemap must fit in a 4096 × 4096 layout');
   if (updated.layers.some(layer => Object.keys(layer.cells).some(key => !tileInBounds(updated, ...key.split(',').map(Number))))) {
    throw Error('Erase the tiles outside the new bounds before shrinking the grid');
   }
   change(() => {
    layout.tilemap = updated;
    layout.width = Math.max(layout.width, Math.ceil(data.x + width));
    layout.height = Math.max(layout.height, Math.ceil(data.y + height));
   });
  });
}

function configureAtlas(asset, existing) {
 const dimensions = [['tileWidth', 'Tile width'], ['tileHeight', 'Tile height'], ['margin', 'Outer margin'], ['spacing', 'Tile spacing']];
 const defaults = { tileWidth: 16, tileHeight: 16, margin: 0, spacing: 0, ...existing };
 simple(existing ? 'Atlas Settings' : 'Import Tileset Atlas',
  field('Name', 'name', existing?.name ?? asset.name) +
  `<div class="two">${dimensions.map(([key, label]) => field(label, key, defaults[key], 'number')).join('')}</div>`, values => {
   const sizes = Object.fromEntries(dimensions.map(([key]) => [key, Number(values[key])]));
   const atlas = { ...asset, id: existing?.id ?? uid(), name: values.name.trim(), ...sizes, tiles: existing?.tiles ?? {} };
   if (!atlas.name || !Object.values(sizes).every(Number.isInteger) || sizes.tileWidth < 1 || sizes.tileHeight < 1 ||
    sizes.margin < 0 || sizes.spacing < 0 || atlasSize(atlas).some(count => count < 1 || count > 256)) {
    throw Error('Enter a name and a grid with 1–256 valid rows and columns');
   }
   if (existing) {
    const [columns, rows] = atlasSize(atlas);
    const outside = tile => tile.column >= columns || tile.row >= rows;
    const used = P.layouts.some(layout => layout.tilemap?.layers.some(layer =>
     Object.values(layer.cells).some(tile => tile.atlas === existing.id && outside(tile))));
   const hasMetadata = Object.keys(existing.tiles).some(key => {
    const [column, row] = key.split(',').map(Number);
    return outside({ column, row });
   });
   if (used || hasMetadata) throw Error('Remove painted tiles and tile metadata outside the new atlas grid before resizing it');
   }
   change(() => {
    if (existing) Object.assign(existing, atlas);
    else {
     P.tilesets.push(atlas);
     tab = 'tiles';
     revealProjectItem('tileset:' + atlas.id,'assets');
    }
    Object.assign(tileWorkspace, { atlas: atlas.id, column: 0, row: 0 });
   });
  });
}

function sampleTileset() {
 const iso = L().tilemap?.orientation === 'isometric';
 const width = iso ? 64 : 32;
 const height = 32;
 const canvas = document.createElement('canvas');
 canvas.width = width * 5;
 canvas.height = height;
 const ctx = canvas.getContext('2d');
 const swatches = [['#45795c','#6e9e61'], ['#345f78','#508ba3'], ['#746556','#a28568'], ['#594f6d','#8e769c'], ['#a3713b','#d3a05b']];
 swatches.forEach(([base, detail], column) => {
  ctx.save();
  ctx.translate(column * width, 0);
  ctx.beginPath();
  if (iso) {
   ctx.moveTo(width / 2, 0); ctx.lineTo(width, height / 2);
   ctx.lineTo(width / 2, height); ctx.lineTo(0, height / 2); ctx.closePath();
  } else ctx.rect(0, 0, width, height);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = detail;
  for (let i = 0; i < 15; i++) ctx.fillRect((i * 19 + 3) % width, (i * 11 + 3) % height, 3 + i % 4, 2);
  ctx.restore();
 });
 change(() => {
  const atlas = { id: uid(), name: iso ? 'Isometric Sample' : 'Ground Sample', image: canvas.toDataURL(),
   width: canvas.width, height, tileWidth: width, tileHeight: height, margin: 0, spacing: 0,
   tiles: { '2,0': { solid: true, tags: [] } } };
  P.tilesets.push(atlas);
  Object.assign(tileWorkspace, { atlas: atlas.id, column: 0, row: 0 });
 });
}

function projectTagOptions() {
 return P.enums.flatMap(enumType => enumType.values.map(value => [tileEnumToken(enumType, value), `${enumType.name}.${value.name}`]));
}

function editTerrainTile(atlas) {
 const key = `${tileWorkspace.column},${tileWorkspace.row}`;
 const tile = atlas.tiles[key];
 dialog('Terrain Variant', select('Terrain', 'terrain', tile?.terrain ?? '', [['', 'None'], ...projectTagOptions()]) +
  '<p class="muted">Mark the grid edges this tile connects to. Tiles with the same terrain form a connected brush.</p>' +
  terrainEdges.map(([, , name], index) => checkbox(name, `edge-${index}`, (tile?.edges ?? 0) & (1 << index))).join(''), () => {
   const terrain = $('#dialogbody [data-field="terrain"]').value;
   const mask = terrainEdges.reduce((total, _, index) => total | ($('#dialogbody [data-field="edge-' + index + '"]').checked ? 1 << index : 0), 0);
   change(() => {
    const metadata = atlas.tiles[key] ??= { solid: false, tags: [] };
    if (terrain) {
     metadata.terrain = terrain;
     metadata.edges = mask;
    } else {
     delete metadata.terrain; delete metadata.edges;
     if (!metadata.solid && !metadata.tags.length) delete atlas.tiles[key];
    }
   });
  });
}

function tileSettingsHtml(map) {
 const layer = selectedTileLayer();
 const controls = layer ? `<div class="pad tile-layer-settings">
  ${field('Layer name', 'tile-layer.name', layer.name)}${field('Opacity (0–100%)', 'tile-layer.opacity', Math.round(layer.opacity * 100), 'number')}
  ${checkbox('Visible', 'tile-layer.visible', layer.visible)}${checkbox('Lock editing', 'tile-layer.locked', layer.locked)}
  ${checkbox('Above objects', 'tile-layer.above', layer.above)}${checkbox('Solid tile collisions', 'tile-layer.collision', layer.collision)}
  <div class="asset-button-row">${button('Raise', 'tile:raise')}${button('Lower', 'tile:lower')}${button('Duplicate','tile:duplicate')}${button('Delete','tile:deleteLayer','danger')}</div>
 </div>` : '';
 const layerList = above => [...(map?.layers ?? [])].reverse().filter(item => item.above === above).map(item =>
  `<button class="tile-layer ${layer === item ? 'selected' : ''}" data-act="tile:layer:${item.id}">
   <span>${esc(item.name)}</span><small>${item.locked ? 'Locked' : item.visible ? '' : 'Hidden'}</small>
  </button>`).join('');
 return `<div class="panelhead">TILE LAYERS${map ? button('+', 'tile:addLayer') : ''}</div>
  <div class="pad">${select('Layout', 'tile-layout', L().id, P.layouts.map(layout => [layout.id, layout.name]))}</div>
  ${map ? `<div class="tile-layer-group">Above objects${layerList(true)}</div><div class="tile-layer-group">Below objects${layerList(false)}</div>${controls}` : ''}`;
}

function tilePaletteHtml(atlas) {
 const [column, row] = [tileWorkspace.column, tileWorkspace.row];
 const metadata = atlas ? tileMeta(atlas, column, row) : null;
 const tags = projectTagOptions();
 return `<div class="panelhead">TILESET ATLAS</div><div class="pad">
  <div class="asset-button-row">${button('Import Atlas', 'tile:import')}${button('Sample', 'tile:sample')}${atlas ? button('Settings', 'tile:atlasSettings') : ''}</div>
  ${atlas ? select('Tileset', 'tile-atlas', atlas.id, P.tilesets.map(item => [item.id,item.name])) : '<p class="muted">Import a single tilesheet image to create a palette.</p>'}
  ${atlas && tags.length ? select('Highlight tag', 'tile-filter', tileWorkspace.tagFilter, [['','None'], ...tags]) : ''}
  ${atlas ? `${editorSheetMarkup('tile-palette','Tileset atlas')}
   <h4>Tile ${column}, ${row}</h4>${checkbox('Solid', 'tile-meta.solid', metadata?.solid)}
   ${tags.map(([token, name]) => checkbox(name, 'tile-tag.' + token, metadata?.tags?.includes(token))).join('')}
   ${tags.length ? button('Terrain Variant','tile:terrain') : ''}${metadata?.terrain ? `<p class="muted">${esc(tags.find(([token]) => token === metadata.terrain)?.[1])} · ${terrainEdges.filter((_, index) => metadata.edges & (1 << index)).map(([, , name]) => name).join(', ') || 'Isolated'}</p>` : ''}` : ''}
  <div class="sectionline"></div><h4>PROJECT ENUMS</h4>
  ${P.enums.map(item => button(esc(item.name), 'data:enums:' + item.id)).join(' ')} ${button('Manage Enums','data:enums')}
 </div>`;
}

function renderTileEditor() {
 const layout = L();
 const map = layout.tilemap;
 if (tileWorkspace.layout !== layout.id) {
  Object.assign(tileWorkspace, { layout: layout.id, layer: null, hover: null, stroke: null });
 }
 tileWorkspace.layer = selectedTileLayer()?.id ?? map?.layers[0]?.id;
 const atlas = selectedAtlas() ?? P.tilesets[0];
 tileWorkspace.atlas = atlas?.id;
 if (atlas) {
  const [columns, rows] = atlasSize(atlas);
  tileWorkspace.column = Math.min(tileWorkspace.column, columns - 1);
  tileWorkspace.row = Math.min(tileWorkspace.row, rows - 1);
 }
 $('#tile-sidebar').innerHTML = tileSettingsHtml(map);
 $('#tile-inspector').innerHTML = tilePaletteHtml(atlas);
 const names = map ? tileTools.map(([id, name, key]) => `<button class="${tileWorkspace.tool === id ? 'active' : ''}" data-act="tile:tool:${id}" title="${name} (${key})" aria-pressed="${tileWorkspace.tool === id}">${name}</button>`).join('') : '';
 $('#tile-tools').innerHTML = button(map ? 'Map Settings' : 'Create Tilemap','tile:settings',map ? '' : 'primary') + names + (map ?
  `<span class="spacer"></span>${checkbox('Grid','tile-grid',tileWorkspace.grid)}${checkbox('Enum icons','tile-enumIcons',tileWorkspace.enumIcons)}${checkbox('Flip X','tile-flipX',tileWorkspace.flipX)}${checkbox('Flip Y','tile-flipY',tileWorkspace.flipY)}
   ${select('Zoom','tile-zoom',String(tileWorkspace.zoom),workspaceZoomLevels.map(value => [String(value),value * 100 + '%']))}` : '');
 $('#tile-empty').hidden = Boolean(map);
 $('#tile-board').hidden = !map;
 if (atlas) drawTilePalette(atlas);
 drawMapEditor();
}

function drawTilePalette(atlas) {
 const canvas = $('#tile-palette');
 if (!canvas) return;
 const image = tileImage(images, atlas);
 const draw = () => {
  if (!canvas.isConnected || selectedAtlas() !== atlas) return;
  const [cols,rows] = atlasSize(atlas);
  const grid = { w:atlas.tileWidth,h:atlas.tileHeight,margin:atlas.margin,spacing:atlas.spacing,cols,count:cols*rows };
  const coordinates = frame=>[frame%cols,Math.floor(frame/cols)];
  renderEditorSheet(tilePaletteView,canvas,{
   key:atlas.id,image,width:atlas.width,height:atlas.height,grid,
   selected:frame=>frame === tileWorkspace.row*cols+tileWorkspace.column,
   dimmed:frame=>tileWorkspace.tagFilter && !tileMeta(atlas,...coordinates(frame))?.tags.includes(tileWorkspace.tagFilter),
   select(frame) {
    [tileWorkspace.column,tileWorkspace.row] = coordinates(frame);
    renderTileEditor();
   },
  });
 };
 if (image.complete) draw();
 else image.addEventListener('load', draw, { once: true });
}

function traceTileCell(ctx, map, column, row) {
 const [x, y] = tileCellCenter(map, column, row);
 const w = map.cellWidth / 2, h = map.cellHeight / 2;
 if (map.orientation === 'orthogonal') { ctx.rect(x - w, y - h, 2 * w, 2 * h); return; }
 ctx.moveTo(x, y - h); ctx.lineTo(x + w, y); ctx.lineTo(x, y + h); ctx.lineTo(x - w, y); ctx.closePath();
}

function drawTileEnumIcons(ctx,map,atlases,layer) {
 if (!tileWorkspace.enumIcons || !layer?.visible) return;
 const artwork = new Map();
 for (const type of P.enums) for (const member of type.values) {
  if (member.icon) artwork.set(tileEnumToken(type,member),studioDataSprite(P,member.icon));
 }
 if (!artwork.size) return;
 const size = Math.min(map.cellWidth,map.cellHeight)*.64;
 ctx.save();
 ctx.imageSmoothingEnabled = false;
 for (const [key,tile] of Object.entries(layer.cells)) {
  const meta = tileMeta(atlases.get(tile.atlas) ?? {},tile.column,tile.row);
  const icon = [tile.terrain,meta?.terrain,...(meta?.tags ?? [])].map(tag=>artwork.get(tag)).find(Boolean);
  if (!icon) continue;
  const [x,y] = tileCellCenter(map,...key.split(',').map(Number));
  for (const part of icon.layers) {
   const image = tileImage(images,{ image:part.source });
   if (!image.complete && !image.tileEditorWatching) {
    image.tileEditorWatching = true;
    image.addEventListener('load',drawMapEditor,{once:true});
   }
   if (!image.complete || !image.naturalWidth) continue;
   const w = icon.w ?? image.naturalWidth, h = icon.h ?? image.naturalHeight;
   const scale = size/Math.max(w,h);
   ctx.globalAlpha = part.opacity;
   ctx.drawImage(image,icon.x,icon.y,w,h,x-w*scale/2,y-h*scale/2,w*scale,h*scale);
  }
 }
 ctx.restore();
}

function drawMapEditor() {
 const map = L().tilemap;
 if (!map || tab !== 'tiles') return;
 const canvas = $('#tile-canvas');
 const layout = L();
 if (canvas.width !== layout.width || canvas.height !== layout.height) {
  canvas.width = layout.width; canvas.height = layout.height;
 }
 canvas.style.width = layout.width * tileWorkspace.zoom + 'px';
 canvas.style.height = layout.height * tileWorkspace.zoom + 'px';
 const ctx = canvas.getContext('2d');
 ctx.fillStyle = layout.background;
 ctx.fillRect(0, 0, canvas.width, canvas.height);
 const atlases = availableAtlases();
 for (const atlas of atlases.values()) {
  const image = tileImage(images, atlas);
  if (!image.complete && !image.tileEditorWatching) {
   image.tileEditorWatching = true;
   image.addEventListener('load', drawMapEditor, { once: true });
  }
 }
 drawTileLayers(ctx, map, atlases, images, map.layers.filter(layer => !layer.above));
 for (const object of tileObjectOrder(layout,expandedLayoutInstances(P,layout))) {
  const type = T(object.type);
  if (type) drawObjectPose(ctx, type, layoutSpritePose(type, object), images);
 }
 drawTileLayers(ctx, map, atlases, images, map.layers.filter(layer => layer.above));
 drawTileEnumIcons(ctx,map,atlases,selectedTileLayer());
 if (tileWorkspace.grid) {
  ctx.beginPath();
  for (let row = 0; row <= map.rows; row++) {
   ctx.moveTo(...tileVertex(map, 0, row)); ctx.lineTo(...tileVertex(map, map.columns, row));
  }
  for (let column = 0; column <= map.columns; column++) {
   ctx.moveTo(...tileVertex(map, column, 0)); ctx.lineTo(...tileVertex(map, column, map.rows));
  }
  ctx.strokeStyle = '#c4d9e82c'; ctx.lineWidth = 1 / tileWorkspace.zoom; ctx.stroke();
 }
 const hover = tileWorkspace.hover;
 if (hover && tileInBounds(map, ...hover)) {
  const stroke = tileWorkspace.stroke;
  ctx.beginPath();
  if (stroke && ['line','rectangle'].includes(stroke.tool)) for (const point of tilePoints(stroke.start, hover, stroke.tool)) traceTileCell(ctx, map, ...point);
  else traceTileCell(ctx, map, ...hover);
  ctx.fillStyle = '#6bcfb533'; ctx.fill(); ctx.strokeStyle = '#78dfbf'; ctx.stroke();
 }
 const layer = selectedTileLayer();
 $('#tile-status').textContent = `${layer?.name ?? 'No layer'}${layer?.locked ? ' · Locked' : !layer?.visible ? ' · Hidden' : ''} · ${map.columns} × ${map.rows}${hover ? ' · Cell ' + hover.join(', ') : ''}`;
}

function tileVertex(map, column, row) {
 if (map.orientation === 'isometric') return [map.x + (map.rows + column - row) * map.cellWidth / 2, map.y + (column + row) * map.cellHeight / 2];
 return [map.x + column * map.cellWidth, map.y + row * map.cellHeight];
}

function* tilePoints(start, end, tool) {
 let [x, y] = start;
 const [targetX, targetY] = end;
 if (tool === 'rectangle') {
  for (let row = Math.min(y, targetY); row <= Math.max(y, targetY); row++) {
   for (let column = Math.min(x, targetX); column <= Math.max(x, targetX); column++) yield [column, row];
  }
  return;
 }
 const horizontal = Math.abs(targetX - x), vertical = -Math.abs(targetY - y);
 const stepX = x < targetX ? 1 : -1, stepY = y < targetY ? 1 : -1;
 let error = horizontal + vertical;
 while (true) {
  yield [x, y];
  if (x === targetX && y === targetY) return;
  const twice = 2 * error;
  if (twice >= vertical) { error += vertical; x += stepX; }
  if (twice <= horizontal) { error += horizontal; y += stepY; }
 }
}

const sameTile = (a, b) => a?.atlas === b?.atlas && a?.column === b?.column && a?.row === b?.row &&
 a?.terrain === b?.terrain && Boolean(a?.flipX) === Boolean(b?.flipX) && Boolean(a?.flipY) === Boolean(b?.flipY);

function refreshTerrain(stroke, point) {
 for (const [dx, dy] of [[0, 0], ...terrainEdges]) {
  const [x, y] = [point[0] + dx, point[1] + dy];
  const cells = stroke.layer.cells;
  const cell = cells[`${x},${y}`];
  if (!cell?.terrain) continue;
  const key = cell.atlas + ':' + cell.terrain;
  if (!stroke.variants.has(key)) {
   const atlas = P.tilesets.find(item => item.id === cell.atlas);
   const candidates = Object.entries(atlas?.tiles ?? {}).filter(([, tile]) => tile.terrain === cell.terrain);
   stroke.variants.set(key, new Map(candidates.map(([coordinates, tile]) => [tile.edges, coordinates.split(',').map(Number)])));
  }
  const mask = terrainEdges.reduce((value, [offsetX, offsetY], index) => {
   const nearby = cells[`${x + offsetX},${y + offsetY}`];
   return nearby?.terrain === cell.terrain && nearby.atlas === cell.atlas ? value | (1 << index) : value;
  }, 0);
  const variant = stroke.variants.get(key).get(mask);
  if (variant) [cell.column, cell.row] = variant;
 }
}

function paintTile(stroke, point) {
 if (!tileInBounds(L().tilemap, ...point)) return;
 const key = point.join(',');
 if (sameTile(stroke.layer.cells[key], stroke.brush)) return;
 if (!stroke.saved) { checkpoint(); stroke.saved = true; }
 const old = stroke.layer.cells[key];
 if (stroke.brush) stroke.layer.cells[key] = { ...stroke.brush };
 else delete stroke.layer.cells[key];
 if (old?.terrain || stroke.brush?.terrain) refreshTerrain(stroke, point);
}

function fillTiles(stroke, seed) {
 const map = L().tilemap;
 const reference = stroke.layer.cells[seed.join(',')];
 if (sameTile(reference, stroke.brush)) return;
 const queue = [seed];
 for (let i = 0; i < queue.length; i++) {
  const [x, y] = queue[i];
  if (!tileInBounds(map,x,y) || !sameTile(stroke.layer.cells[`${x},${y}`], reference)) continue;
  paintTile(stroke, [x,y]);
  queue.push([x-1,y],[x+1,y],[x,y-1],[x,y+1]);
 }
}

function tilePointerCell(event) {
 const canvas = $('#tile-canvas');
 const bounds = canvas.getBoundingClientRect();
 const map = L().tilemap;
 const cell = tileCellAt(map, (event.clientX - bounds.left) * canvas.width / bounds.width,
  (event.clientY - bounds.top) * canvas.height / bounds.height);
 return tileInBounds(map, ...cell) ? cell : null;
}

function setupTileEditor() {
 const canvas = $('#tile-canvas');
 const board = $('#tile-board');
 let pan = null;
 board.onpointerdown = event => {
  if (event.button !== 1) return;
  event.preventDefault();
  pan = { x: event.clientX, y: event.clientY, left: board.scrollLeft, top: board.scrollTop };
  canvas.classList.add('tile-canvas-panning');
  board.setPointerCapture(event.pointerId);
 };
 board.onpointermove = event => {
  if (!pan) return;
  board.scrollLeft = pan.left + pan.x - event.clientX;
  board.scrollTop = pan.top + pan.y - event.clientY;
 };
 board.onlostpointercapture = () => { pan = null; canvas.classList.remove('tile-canvas-panning'); };
 canvas.onpointerdown = event => {
  if (event.button !== 0 || !L().tilemap) return;
  const cell = tilePointerCell(event);
  const layer = selectedTileLayer();
  if (!layer || !cell) return;
  const tool = event.altKey ? 'pick' : tileWorkspace.tool;
  if (tool === 'pick') {
   const picked = layer.cells[cell.join(',')];
   if (picked) {
    Object.assign(tileWorkspace, { ...picked, hover: cell });
    renderTileEditor();
   }
   return;
  }
  if (layer.locked || !layer.visible || (tool !== 'erase' && !selectedAtlas())) return;
  const brush = tool === 'erase' ? null : { atlas: tileWorkspace.atlas, column: tileWorkspace.column,
   row: tileWorkspace.row, flipX: tileWorkspace.flipX, flipY: tileWorkspace.flipY };
  if (tool === 'terrain') {
   const metadata = tileMeta(selectedAtlas(), brush.column, brush.row);
   if (!metadata?.terrain) { $('#tile-status').textContent = 'Select a tile with a terrain variant first.'; return; }
   Object.assign(brush, { terrain: metadata.terrain, flipX: false, flipY: false });
  }
  const stroke = { layer, tool, brush, start: cell, last: cell, saved: false, variants: new Map() };
  tileWorkspace.hover = cell;
  if (tool === 'fill') { fillTiles(stroke, cell); drawMapEditor(); persist(); return; }
  tileWorkspace.stroke = stroke;
  canvas.setPointerCapture(event.pointerId);
  if (['paint', 'erase', 'terrain'].includes(tool)) paintTile(stroke, cell);
  drawMapEditor();
 };
 canvas.onpointermove = event => {
  if (!L().tilemap) return;
  const cell = tilePointerCell(event);
  const stroke = tileWorkspace.stroke;
  if (cell && stroke && ['paint','erase','terrain'].includes(stroke.tool)) {
   for (const point of tilePoints(stroke.last, cell)) paintTile(stroke, point);
  }
  if (stroke && cell) stroke.last = cell;
  tileWorkspace.hover = cell;
  drawMapEditor();
 };
 canvas.onpointerleave = () => { tileWorkspace.hover = null; drawMapEditor(); };
 canvas.onpointerup = canvas.onpointercancel = event => {
  const stroke = tileWorkspace.stroke;
  if (!stroke) return;
  if (event.type === 'pointerup' && ['line','rectangle'].includes(stroke.tool)) {
   for (const point of tilePoints(stroke.start, stroke.last, stroke.tool)) paintTile(stroke, point);
  }
  tileWorkspace.stroke = null;
  drawMapEditor(); persist();
 };
 document.addEventListener('change', event => updateTileField(event.target));
 $('#atlas-file').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try { configureAtlas({ ...await readStudioImage(file), name: file.name.replace(/\.[^.]+$/, '') }); }
  catch (error) { alert(error.message); }
  event.target.value = '';
 };
 window.addEventListener('keydown', event => {
  if (tab !== 'tiles' || runtime || $('#dialog').open || event.ctrlKey || event.metaKey || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
  const tool = tileTools.find(([, , key]) => key.toLowerCase() === event.key.toLowerCase());
  if (tool) { tileWorkspace.tool = tool[0]; renderTileEditor(); }
 });
}

function updateTileField(input) {
 const [key, fieldName] = (input.dataset.field ?? '').split('.');
 if (!key.startsWith('tile-')) return;
 if (key === 'tile-layout') { P.activeLayout = input.value; selected = null; render(); return; }
 if (key === 'tile-atlas') {
  Object.assign(tileWorkspace,{ atlas:input.value,column:0,row:0 });
  renderTileEditor();
  projectTreeSelection();
  return;
 }
 if (key === 'tile-filter') { tileWorkspace.tagFilter = input.value; drawTilePalette(selectedAtlas()); return; }
 if (key === 'tile-zoom') { tileWorkspace.zoom = Number(input.value); drawMapEditor(); return; }
 if (['tile-grid','tile-enumIcons','tile-flipX','tile-flipY'].includes(key)) { tileWorkspace[key.slice(5)] = input.checked; drawMapEditor(); return; }
 if (key === 'tile-layer') {
  const layer = selectedTileLayer();
  if (!layer) return;
  if (fieldName === 'name' && (!input.value.trim() || L().tilemap.layers.some(other => other !== layer && other.name === input.value.trim()))) {
   input.value = layer.name; alert('Use a unique layer name'); return;
  }
  const value = input.type === 'checkbox' ? input.checked : fieldName === 'opacity' ? Math.max(0, Math.min(1, Number(input.value) / 100)) : input.value.trim();
  change(() => { layer[fieldName] = value; });
 }
 if (key === 'tile-tag' || key === 'tile-meta') {
  const atlas = selectedAtlas();
  if (!atlas) return;
  change(() => {
   const cell = `${tileWorkspace.column},${tileWorkspace.row}`;
   const info = atlas.tiles[cell] ??= { solid: false, tags: [] };
   if (key === 'tile-meta') info.solid = input.checked;
   else if (input.checked) info.tags.push(fieldName);
   else info.tags = info.tags.filter(tag => tag !== fieldName);
   if (!info.solid && !info.tags.length && !info.terrain) delete atlas.tiles[cell];
  });
 }
}

function tileEditorAction(action, id) {
 const map = L().tilemap, layer = selectedTileLayer();
 switch (action) {
  case 'settings': configureTilemap(); break;
  case 'import': $('#atlas-file').click(); break;
  case 'sample': sampleTileset(); break;
  case 'atlasSettings': { const atlas = selectedAtlas(); configureAtlas(atlas, atlas); break; }
  case 'terrain': editTerrainTile(selectedAtlas()); break;
  case 'newEnum': dataAction('newEnum'); break;
  case 'editEnum': dataAction('enums',id); break;
  case 'tool': tileWorkspace.tool = id; renderTileEditor(); break;
  case 'layer': tileWorkspace.layer = id; renderTileEditor(); break;
  case 'addLayer': case 'duplicate': {
   const name = action === 'duplicate' ? `${layer.name} Copy` : `Layer ${map.layers.length + 1}`;
   simple(action === 'duplicate' ? 'Duplicate Layer' : 'New Tile Layer', field('Name', 'name', name), values => {
    const name = values.name.trim();
    if (!name || map.layers.some(item => item.name === name)) throw Error('Use a unique layer name');
    change(() => {
     const next = action === 'duplicate' ? { ...clone(layer), id: uid(), name, locked: false } : tileLayer(name);
     map.layers.push(next); tileWorkspace.layer = next.id;
    });
   });
   break;
  }
  case 'deleteLayer':
   if (layer && confirm(`Delete the ${layer.name} layer and all its tiles?`)) change(() => {
    map.layers = map.layers.filter(item => item !== layer);
   });
   break;
  case 'raise': case 'lower': {
   if (!layer) break;
   const group = map.layers.filter(item => item.above === layer.above);
   const other = group[group.indexOf(layer) + (action === 'raise' ? 1 : -1)];
   if (other) change(() => {
    const [a, b] = [map.layers.indexOf(layer), map.layers.indexOf(other)];
    [map.layers[a], map.layers[b]] = [map.layers[b], map.layers[a]];
   });
   break;
  }
 }
}
