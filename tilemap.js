function tileCellCenter(map, column, row) {
 const { x, y, cellWidth: w, cellHeight: h } = map;
 return map.orientation === 'isometric'
  ? [x + (map.rows + column - row) * w / 2, y + (column + row + 1) * h / 2]
  : [x + (column + .5) * w, y + (row + .5) * h];
}

function tileGridPoint(map, x, y) {
 const horizontal = (x - map.x) / map.cellWidth;
 const vertical = (y - map.y) / map.cellHeight;
 if (map.orientation === 'orthogonal') return [horizontal, vertical];
 const skew = horizontal - map.rows / 2;
 return [vertical + skew, vertical - skew];
}

function tileCellAt(map, x, y) {
 return tileGridPoint(map, x, y).map(Math.floor);
}

function tileInBounds(map, column, row) {
 return column >= 0 && row >= 0 && column < map.columns && row < map.rows;
}

function tileMapSize(map) {
 if (map.orientation === 'orthogonal') return [map.columns * map.cellWidth, map.rows * map.cellHeight];
 return [(map.columns + map.rows) * map.cellWidth / 2, (map.columns + map.rows) * map.cellHeight / 2];
}

function tileObjectOrder(layout, objects) {
 return layout.tilemap?.orientation === 'isometric'
  ? [...objects].sort((a, b) => (a.y + a.h) - (b.y + b.h)) : objects;
}

function atlasSize(atlas) {
 const count = (pixels, tile) => Math.max(0, Math.floor((pixels - 2 * atlas.margin + atlas.spacing) / (tile + atlas.spacing)));
 return [count(atlas.width, atlas.tileWidth), count(atlas.height, atlas.tileHeight)];
}

function atlasSource(atlas, column, row) {
 return [atlas.margin + column * (atlas.tileWidth + atlas.spacing),
  atlas.margin + row * (atlas.tileHeight + atlas.spacing), atlas.tileWidth, atlas.tileHeight];
}

function tileMeta(atlas, column, row) {
 return atlas.tiles?.[`${column},${row}`];
}

function tileEnumToken(enumType, value) {
 return enumType.id + ':' + value.id;
}

function tileAtWorld(map, layerName, x, y) {
 if (!map) return null;
 const [column, row] = tileCellAt(map, x, y);
 if (!tileInBounds(map, column, row)) return null;
 return map.layers.find(layer => layer.name === layerName)?.cells[`${column},${row}`];
}

function tileImage(cache, atlas) {
 if (!cache.has(atlas.image)) {
  const image = new Image();
  image.src = atlas.image;
  cache.set(atlas.image, image);
 }
 return cache.get(atlas.image);
}

function drawAtlasTile(ctx, image, atlas, column, row, x, y, width, height, flipX = false, flipY = false) {
 if (!image.complete || !image.naturalWidth) return;
 const frame = atlasSource(atlas, column, row);
 ctx.save();
 ctx.translate(x + (flipX ? width : 0), y + (flipY ? height : 0));
 ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
 ctx.drawImage(image, ...frame, 0, 0, width, height);
 ctx.restore();
}

function drawTileLayers(ctx, map, atlases, imageCache, layers) {
 if (!map) return;
 ctx.imageSmoothingEnabled = false;
 for (const layer of layers) {
  if (!layer.visible || layer.opacity <= 0) continue;
  const tiles = Object.entries(layer.cells).map(([key, tile]) => ({ cell: key.split(',').map(Number), tile }));
  if (map.orientation === 'isometric') tiles.sort((a, b) => a.cell[0] + a.cell[1] - b.cell[0] - b.cell[1] || a.cell[0] - b.cell[0]);
  ctx.save();
  ctx.globalAlpha *= layer.opacity;
  for (const { cell, tile } of tiles) {
   const atlas = atlases.get(tile.atlas);
   if (!atlas) continue;
   const [x, y] = tileCellCenter(map, ...cell);
   drawAtlasTile(ctx, tileImage(imageCache, atlas), atlas, tile.column, tile.row,
    x - atlas.tileWidth / 2, y + map.cellHeight / 2 - atlas.tileHeight,
    atlas.tileWidth, atlas.tileHeight, tile.flipX, tile.flipY);
  }
  ctx.restore();
 }
}

function createTileArtwork(layout, atlases, images) {
 const map = layout.tilemap;
 const visible = map?.layers.filter(layer => layer.visible && layer.opacity > 0 && Object.keys(layer.cells).length) ?? [];
 const used = new Set(visible.flatMap(layer => Object.values(layer.cells).map(tile => atlases.get(tile.atlas))).filter(Boolean));
 for (const atlas of used) tileImage(images, atlas);
 let artwork;
 return () => {
  if (artwork) return artwork;
  if ([...used].some(atlas => !tileImage(images, atlas).complete)) return null;

  artwork = [false, true].map(above => {
   const layers = visible.filter(layer => layer.above === above);
   if (!layers.length) return null;
   const canvas = document.createElement('canvas');
   canvas.width = layout.width;
   canvas.height = layout.height;
   drawTileLayers(canvas.getContext('2d'), map, atlases, images, layers);
   return canvas;
  });
  return artwork;
 };
}

function tileSolidCells(map, atlases) {
 const occupied = new Set();
 for (const layer of map?.layers ?? []) {
  if (!layer.collision) continue;
  for (const [key, tile] of Object.entries(layer.cells)) {
   if (tileMeta(atlases.get(tile.atlas) ?? {}, tile.column, tile.row)?.solid) occupied.add(key);
  }
 }
 return occupied;
}

function* solidTilesInBox(map, occupied, left, top, right, bottom) {
 const corners = [left, right].flatMap(x => [top, bottom].map(y => tileGridPoint(map, x, y)));
 const [columns, rows] = [0, 1].map(index => corners.map(point => point[index]));
 for (let row = Math.max(0, Math.floor(Math.min(...rows))); row <= Math.min(map.rows - 1, Math.floor(Math.max(...rows))); row++) {
  for (let column = Math.max(0, Math.floor(Math.min(...columns))); column <= Math.min(map.columns - 1, Math.floor(Math.max(...columns))); column++) {
   if (occupied.has(`${column},${row}`)) yield tileCellCenter(map, column, row);
  }
 }
}

function tileBlocksRectangle(map, occupied, left, top, width, height) {
 if (!occupied.size) return false;
 const right = left + width, bottom = top + height;
 const w = map.cellWidth / 2, h = map.cellHeight / 2;
 for (const [x, y] of solidTilesInBox(map, occupied, left, top, right, bottom)) {
  const nx = Math.max(left - x, x - right, 0) / w;
  const ny = Math.max(top - y, y - bottom, 0) / h;
  if (map.orientation === 'isometric' ? nx + ny < 1 - 1e-8 : nx < 1 && ny < 1) return true;
 }
 return false;
}

function tileLimitMotion(map, occupied, object, distance, axis) {
 if (!distance || !occupied.size) return distance;
 const horizontal = axis === 'x';
 const start = horizontal ? object.x : object.y;
 const edge = start + (horizontal ? object.w : object.h);
 const crossStart = horizontal ? object.y : object.x;
 const crossEnd = crossStart + (horizontal ? object.h : object.w);
 const dimensions = horizontal ? [map.cellWidth / 2, map.cellHeight / 2] : [map.cellHeight / 2, map.cellWidth / 2];
 const along = [Math.min(start, start + distance), Math.max(edge, edge + distance)];
 const box = horizontal ? [along[0], crossStart, along[1], crossEnd] : [crossStart, along[0], crossEnd, along[1]];
 let allowed = distance;
 for (const [x, y] of solidTilesInBox(map, occupied, ...box)) {
   const center = horizontal ? x : y;
   const crossCenter = horizontal ? y : x;
   const crossDistance = Math.max(crossStart - crossCenter, crossCenter - crossEnd, 0);
   if (crossDistance >= dimensions[1]) continue;
   const reach = dimensions[0] * (map.orientation === 'isometric' ? 1 - crossDistance / dimensions[1] : 1);
   const [low, high] = [center - reach, center + reach];
   const tolerance = 1e-8;
   if (distance > 0 && edge <= low + tolerance) allowed = Math.min(allowed, Math.max(0, low - edge));
   if (distance < 0 && start >= high - tolerance) allowed = Math.max(allowed, Math.min(0, high - start));
 }
 return allowed;
}
