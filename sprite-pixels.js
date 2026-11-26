const spriteInitialPalette = ['#151a26','#3b415b','#768198','#d5e3f0','#ffffff','#f5bd67','#f46079','#aa80ed',
 '#52d5b0','#4c95e6','#ffd897','#78b85e'];
const spriteZoomLevels = [.25,.5,1,2,4,6,8,12,16,24,32];

function validSpriteSize(width,height) {
 return [width,height].every(value => Number.isInteger(value) && value >= 1 && value <= 4096) && width*height <= 4194304;
}

function spriteSheetGrid(width,height,grid,frameCount) {
 const { w,h,margin = 0,spacing = 0 } = grid;
 if (![w,h,margin,spacing].every(Number.isInteger) || w < 1 || h < 1 || margin < 0 || spacing < 0) return null;
 const [cols,rows] = atlasSize({ width,height,tileWidth:w,tileHeight:h,margin,spacing });
 const count = frameCount ?? cols*rows;
 return Number.isInteger(count) && count > 0 && count <= 4096 && count <= cols*rows
  ? { w,h,margin,spacing,cols,count,fps:grid.fps ?? 0 } : null;
}

const spriteFrameCount = doc => doc.sheet?.count ?? 1;
const validSpriteFrameDuration = value => Number.isInteger(value) && value>=1 && value<=60000;

function validateSpriteDocuments(project) {
 project.spriteDocuments ??= [];
 project.spriteLayers ??= [];
 if (!Array.isArray(project.spriteDocuments) || !Array.isArray(project.spriteLayers)) throw Error('Invalid sprite documents');
 const ids = new Set(), layers = new Set(), withLayers = new Set();
 const idOK = value => typeof value === 'string' && /^[a-z0-9_-]+$/i.test(value);
 const nameOK = value => typeof value === 'string' && value.trim() && value.length <= 100;
 for (const doc of project.spriteDocuments) {
  if (!idOK(doc?.id) || ids.has(doc.id) || !nameOK(doc.name) || !validSpriteSize(doc.width,doc.height) ||
      !Array.isArray(doc.slices) || !Array.isArray(doc.palette) ||
      doc.palette.some(color => typeof color !== 'string' || !/^#[a-f\d]{6}$/i.test(color))) throw Error('Invalid sprite document');
  ids.add(doc.id);
  if (doc.sheet) {
   const grid = spriteSheetGrid(doc.width,doc.height,doc.sheet,doc.sheet.count);
   if (!grid || grid.cols !== doc.sheet.cols || grid.count !== doc.sheet.count) throw Error('Invalid sprite sheet grid');
  }
  if (doc.frames != null) {
   if (!Array.isArray(doc.frames) || doc.frames.length!==spriteFrameCount(doc) ||
       doc.frames.some(frame=>!idOK(frame?.id) || !validSpriteFrameDuration(frame.duration)) ||
       new Set(doc.frames.map(frame=>frame.id)).size!==doc.frames.length) throw Error('Invalid sprite timeline');
  }
  const slices = new Set();
  for (const slice of doc.slices) {
   if (!idOK(slice?.id) || slices.has(slice.id) || !nameOK(slice.name) || !spriteContainsBox(doc,slice)) throw Error('Invalid sprite slice');
   slices.add(slice.id);
  }
 }
 for (const layer of project.spriteLayers) {
  if (!idOK(layer?.id) || layers.has(layer.id) || !ids.has(layer.document) || !nameOK(layer.name) ||
      typeof layer.visible !== 'boolean' || !Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1 ||
      typeof layer.image !== 'string' || (layer.image && !/^data:image\/[a-z\d.+-]+;base64,/i.test(layer.image))) {
   throw Error('Invalid sprite layer');
  }
  layers.add(layer.id);
  withLayers.add(layer.document);
 }
 if (withLayers.size !== ids.size || project.types.some(type => type.spriteDocument && !ids.has(type.spriteDocument))) {
  throw Error('A sprite document reference is missing');
 }
 return project;
}

function spriteContainsBox(doc,box) {
 return [box.x,box.y,box.w,box.h].every(Number.isInteger) && box.x >= 0 && box.y >= 0 &&
  box.w >= 1 && box.h >= 1 && box.x+box.w <= doc.width && box.y+box.h <= doc.height;
}

function pixelBox(a,b) {
 return { x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x)+1,h:Math.abs(a.y-b.y)+1 };
}

function pixelLine(a,b,paint) {
 let { x,y } = a;
 const dx = Math.abs(b.x-x), dy = -Math.abs(b.y-y), sx = x < b.x ? 1 : -1, sy = y < b.y ? 1 : -1;
 let error = dx+dy;
 for (;;) {
  paint(x,y);
  if (x === b.x && y === b.y) return;
  const twice = 2*error;
  if (twice >= dy) { error += dy; x += sx; }
  if (twice <= dx) { error += dx; y += sy; }
 }
}

function pixelShape(box, ellipse, filled, write) {
 const inside = (x,y) => x >= 0 && y >= 0 && x < box.w && y < box.h &&
  (!ellipse || ((2*x+1-box.w)/box.w)**2 + ((2*y+1-box.h)/box.h)**2 <= 1);
 for (let y=0;y<box.h;y++) for (let x=0;x<box.w;x++) {
  if (inside(x,y) && (filled || !inside(x-1,y) || !inside(x+1,y) || !inside(x,y-1) || !inside(x,y+1))) write(box.x+x,box.y+y);
 }
}

function lassoPixels(points,write) {
 if (points.length < 3) return;
 const top = points.reduce((y,p) => Math.min(y,p.y),points[0].y);
 const bottom = points.reduce((y,p) => Math.max(y,p.y),points[0].y);
 for (let y=top;y<=bottom;y++) {
  const crossings = [], row = y+.5;
  for (let i=0,j=points.length-1;i<points.length;j=i++) {
   const a=points[j], b=points[i];
   if ((a.y>row) !== (b.y>row)) crossings.push(a.x+(row-a.y)*(b.x-a.x)/(b.y-a.y));
  }
  crossings.sort((a,b)=>a-b);
  for (let i=0;i+1<crossings.length;i+=2) {
   for (let x=Math.ceil(crossings[i]-.5);x<crossings[i+1]-.5;x++) write(x,y);
  }
 }
 // Include the traced border even for a one-pixel-wide selection.
 for (let i=0;i<points.length;i++) pixelLine(points[i],points[(i+1)%points.length],write);
}

function matchingSpritePixels(source,width,area,point,tolerance,contiguous,allowed) {
 const result = new Uint8Array(source.length/4);
 const at = (point.y*width+point.x)*4;
 const matches = index => {
  if (allowed && !allowed[index]) return false;
  const start = index*4;
  for (let c=0;c<4;c++) if (Math.abs(source[start+c]-source[at+c]) > tolerance) return false;
  return true;
 };
 if (!contiguous) {
  for (let y=area.y;y<area.y+area.h;y++) for (let x=area.x;x<area.x+area.w;x++) {
   const index=y*width+x;
   if (matches(index)) result[index]=1;
  }
  return result;
 }
 const queue = new Uint32Array(area.w*area.h);
 let end = 0;
 const append = index => {
  if (result[index] || !matches(index)) return;
  result[index]=1;
  queue[end++]=index;
 };
 append(at/4);
 for (let i=0;i<end;i++) {
  const index=queue[i], x=index%width, y=Math.floor(index/width);
  if (x>area.x) append(index-1);
  if (x<area.x+area.w-1) append(index+1);
  if (y>area.y) append(index-width);
  if (y<area.y+area.h-1) append(index+width);
 }
 return result;
}

function mergeSpriteMask(old,mask,mode) {
 if (mode === 'replace') return mask;
 if (!old) return mode === 'add' ? mask : mask.fill(0);
 for (let i=0;i<mask.length;i++) {
  if (mode === 'add') mask[i] |= old[i];
  if (mode === 'subtract') mask[i] = old[i] && !mask[i] ? 1 : 0;
  if (mode === 'intersect') mask[i] &= old[i];
 }
 return mask;
}

function spriteMaskBounds(mask,width,area) {
 let left=Infinity, top=Infinity, right=-1, bottom=-1;
 for (let y=area.y;y<area.y+area.h;y++) for (let x=area.x;x<area.x+area.w;x++) {
  if (!mask || mask[y*width+x]) { left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y); }
 }
 return right < 0 ? null : { x:left,y:top,w:right-left+1,h:bottom-top+1 };
}

function spriteCopyPixels(source,mask,width,area) {
 const box = spriteMaskBounds(mask,width,area);
 if (!box) return null;
 const pixels = new Uint8ClampedArray(box.w*box.h*4), selected = new Uint8Array(box.w*box.h);
 for (let y=0;y<box.h;y++) for (let x=0;x<box.w;x++) {
  const from=(box.y+y)*width+box.x+x, to=y*box.w+x;
  if (mask && !mask[from]) continue;
  selected[to]=1;
  pixels.set(source.subarray(from*4,from*4+4),to*4);
 }
 return { ...box,pixels,selected };
}

function spritePastePixels(target,width,area,copy,x,y,transform) {
 const mask = new Uint8Array(target.length/4);
 for (let row=0;row<copy.h;row++) for (let column=0;column<copy.w;column++) {
  const from=row*copy.w+column;
  if (!copy.selected[from]) continue;
  const [dx,dy] = transform === 'rotate' ? [copy.h-1-row,column] :
   [transform === 'flip-x' ? copy.w-1-column : column,transform === 'flip-y' ? copy.h-1-row : row];
  const px=x+dx, py=y+dy;
  if (px<area.x || py<area.y || px>=area.x+area.w || py>=area.y+area.h) continue;
  const to=py*width+px;
  target.set(copy.pixels.subarray(from*4,from*4+4),to*4);
  mask[to]=1;
 }
 return mask;
}

function spriteErasePixels(target,width,area,mask) {
 for (let y=area.y;y<area.y+area.h;y++) for (let x=area.x;x<area.x+area.w;x++) {
  const index=y*width+x;
  if (!mask || mask[index]) target.fill(0,index*4,index*4+4);
 }
}
