const spriteWorkspace = {
 project:null,document:null,layer:null,slice:null,frame:null,tool:'pencil',color:'#52d5b0',alpha:100,size:1,
 zoom:8,grid:true,frameGrid:true,onion:false,filled:false,mirrorX:false,mirrorY:false,contiguous:true,tolerance:0,
 mode:'replace',mask:null,clipboard:null,gesture:null,space:false,status:'',surfaces:new Map(),
};
const currentSprite = () => P.spriteDocuments?.find(doc => doc.id === spriteWorkspace.document);
const spriteLayers = (doc = currentSprite()) => doc ? (P.spriteLayers ?? []).filter(layer => layer.document === doc.id) : [];
const selectedSpriteLayer = () => spriteLayers().find(layer => layer.id === spriteWorkspace.layer);
const selectedSpriteSlice = () => currentSprite()?.slices.find(slice => slice.id === spriteWorkspace.slice);
const spriteTargets = doc => P.types.filter(type => type.spriteDocument === doc.id);
const spriteSheetKeys = ['w','h','margin','spacing','cols','count'];

function spriteFrameBounds(doc,index) {
 if (index == null || !doc.sheet) return { x:0,y:0,w:doc.width,h:doc.height };
 const { w,h,cols,spacing,margin } = doc.sheet;
 return { x:margin+(index%cols)*(w+spacing),y:margin+Math.floor(index/cols)*(h+spacing),w,h };
}

function resetSpriteZoom() {
 const doc = currentSprite();
 if (!doc) return 8;
 const area = spriteFrameBounds(doc,spriteWorkspace.frame);
 const fit = Math.min(680/area.w,480/area.h,16);
 return spriteZoomLevels.findLast(level => level <= fit) ?? spriteZoomLevels[0];
}

function makeSpriteLayer(doc,name,image = '') {
 return { id:uid(),document:doc.id,name,image,visible:true,locked:false,opacity:1 };
}

function newSpriteDocument(name,width,height,sheet = null) {
 const doc = { id:uid(),name,width,height,sheet,palette:[...spriteInitialPalette],slices:[] };
 if (!validSpriteSize(width,height)) throw Error('Use a canvas up to 4096 pixels on either side and up to 4,194,304 pixels total');
 return doc;
}

function selectSpriteDocument(doc) {
 Object.assign(spriteWorkspace,{ document:doc?.id,frame:null,layer:null,slice:null,mask:null,gesture:null,status:'' });
 spriteWorkspace.surfaces.clear();
 spriteWorkspace.zoom = resetSpriteZoom();
}

function createSpriteDocument(doc,image = '',type = null) {
 change(() => {
  (P.spriteDocuments ??= []).push(doc);
  const layer = makeSpriteLayer(doc,image ? 'Artwork' : 'Layer 1',image);
  (P.spriteLayers ??= []).push(layer);
  if (type) type.spriteDocument = doc.id;
  selectSpriteDocument(doc);
  spriteWorkspace.layer = layer.id;
  tab = 'sprite';
 });
}

function spriteCanvas(width,height) {
 const canvas = document.createElement('canvas');
 canvas.width = width;
 canvas.height = height;
 return canvas;
}

function syncSpriteSurfaces(doc) {
 const stack = spriteLayers(doc), ids = new Set(stack.map(layer => layer.id));
 for (const key of spriteWorkspace.surfaces.keys()) if (!ids.has(key)) spriteWorkspace.surfaces.delete(key);
 for (const layer of stack) {
  const held = spriteWorkspace.surfaces.get(layer.id);
  if (held?.source === layer.image && held.canvas.width === doc.width && held.canvas.height === doc.height) continue;
  const canvas = spriteCanvas(doc.width,doc.height);
  const record = { canvas,source:layer.image,ready:!layer.image };
  spriteWorkspace.surfaces.set(layer.id,record);
  if (!layer.image) continue;
  const image = new Image();
  image.onload = () => {
   if (spriteWorkspace.surfaces.get(layer.id) !== record) return;
  canvas.getContext('2d',{willReadFrequently:true}).drawImage(image,0,0);
   record.ready = true;
   if (tab === 'sprite') drawSpriteEditor();
  };
  image.onerror = () => {
   if (spriteWorkspace.surfaces.get(layer.id) !== record) return;
   spriteWorkspace.status = 'Could not read ' + layer.name;
   if (tab === 'sprite') drawSpriteEditor();
  };
  image.src = layer.image;
 }
}

function spriteReady() {
 return Boolean(currentSprite() && spriteLayers().every(layer => spriteWorkspace.surfaces.get(layer.id)?.ready));
}

function editableSpriteLayer() {
 const layer = selectedSpriteLayer();
 if (!layer?.visible || layer.locked || !spriteReady()) return null;
 return layer;
}

function drawSpriteLayers(context,area,x=0,y=0,opacity=1) {
 context.save();
 context.imageSmoothingEnabled = false;
 for (const layer of spriteLayers()) {
  const surface = spriteWorkspace.surfaces.get(layer.id);
  if (!layer.visible || !layer.opacity || !surface?.ready) continue;
  context.globalAlpha = layer.opacity*opacity;
  context.drawImage(surface.canvas,area.x,area.y,area.w,area.h,x,y,area.w,area.h);
 }
 context.restore();
}

function flattenedSprite(doc,area = spriteFrameBounds(doc,null)) {
 const canvas = spriteCanvas(area.w,area.h);
 drawSpriteLayers(canvas.getContext('2d'),area);
 return canvas;
}

function setSpriteArtwork(doc) {
 const targets = spriteTargets(doc);
 if (!targets.length) return;
 const source = flattenedSprite(doc).toDataURL('image/png');
 for (const type of targets) type.image = source;
}

function stashSpriteLayer(layer) {
 const surface = spriteWorkspace.surfaces.get(layer.id);
 surface.source = layer.image = surface.canvas.toDataURL('image/png');
}

function commitSpritePixels(layer) {
 const doc = currentSprite();
 change(() => {
  stashSpriteLayer(layer);
  setSpriteArtwork(doc);
 });
}

function spriteStageSize() {
 const doc = currentSprite();
 if (!doc) return;
 const area = spriteFrameBounds(doc,spriteWorkspace.frame);
 const stage = $('#sprite-stage');
 stage.style.setProperty('--sprite-pixel',spriteWorkspace.zoom+'px');
 stage.style.width = area.w*spriteWorkspace.zoom+'px';
 stage.style.height = area.h*spriteWorkspace.zoom+'px';
 stage.classList.toggle('sprite-pixel-grid',spriteWorkspace.grid && spriteWorkspace.zoom >= 4);
}

function drawSpriteEditor(cursor) {
 const doc = currentSprite();
 if (!doc) return;
 const area = spriteFrameBounds(doc,spriteWorkspace.frame);
 const canvas = $('#sprite-canvas'), guides = $('#sprite-guides'), frame = spriteWorkspace.frame;
 for (const target of [canvas,guides]) {
  if (target.width !== area.w) target.width = area.w;
  if (target.height !== area.h) target.height = area.h;
 }
 spriteStageSize();
 const context = canvas.getContext('2d');
 context.clearRect(0,0,area.w,area.h);
 if (spriteWorkspace.onion && frame != null && frame > 0) drawSpriteLayers(context,spriteFrameBounds(doc,frame-1),0,0,.22);
 drawSpriteLayers(context,area);
 const outline = guides.getContext('2d');
 outline.clearRect(0,0,area.w,area.h);
 const highlight = spriteWorkspace.mask;
 if (highlight) {
  const overlay = outline.createImageData(area.w,area.h);
  for (let y=0;y<area.h;y++) for (let x=0;x<area.w;x++) {
   const index=(y+area.y)*doc.width+x+area.x;
   if (!highlight[index]) continue;
   const offset=(y*area.w+x)*4;
   overlay.data[offset]=104;
   overlay.data[offset+1]=206;
   overlay.data[offset+2]=255;
   overlay.data[offset+3]=73;
  }
  outline.putImageData(overlay,0,0);
 }
 if (spriteWorkspace.frameGrid && doc.sheet && frame == null) {
  outline.strokeStyle = '#70eeb18c';
  outline.lineWidth = 1/Math.max(1,spriteWorkspace.zoom);
  for (let index=0;index<doc.sheet.count;index++) {
   const box = spriteFrameBounds(doc,index);
   outline.strokeRect(box.x,box.y,box.w,box.h);
  }
 }
 const gesture = spriteWorkspace.gesture;
 const pending = gesture?.tool === 'slice' && gesture.end ? pixelBox(gesture.start,gesture.end) : null;
 const boxes = doc.slices.filter(slice => slice.id === spriteWorkspace.slice || spriteWorkspace.tool === 'slice');
 for (const box of pending ? [...boxes,pending] : boxes) {
  outline.strokeStyle = box === pending || box.id === spriteWorkspace.slice ? '#ffd361' : '#e9b24998';
  outline.lineWidth = 1/Math.max(1,spriteWorkspace.zoom);
  outline.setLineDash([2,1]);
  outline.strokeRect(box.x-area.x,box.y-area.y,box.w,box.h);
  outline.setLineDash([]);
 }
 if (gesture?.tool === 'lasso' && gesture.points.length) {
  outline.strokeStyle = '#6ddfff';
  outline.lineWidth = 1/Math.max(1,spriteWorkspace.zoom);
  outline.beginPath();
  for (const [i,p] of gesture.points.entries()) {
   if (i) outline.lineTo(p.x-area.x+.5,p.y-area.y+.5);
   else outline.moveTo(p.x-area.x+.5,p.y-area.y+.5);
  }
  outline.stroke();
 }
 const info = [area.w+' × '+area.h,Math.round(spriteWorkspace.zoom*100)+'%',
  cursor ? 'X '+cursor.x+' · Y '+cursor.y : '',!spriteReady() ? 'Loading layers…' : '',spriteWorkspace.status];
 $('#sprite-status').textContent = info.filter(Boolean).join(' · ');
}

function spriteToolFields() {
 const value = spriteWorkspace, check = (label,key) => checkbox(label,'sprite.'+key,value[key]);
 const showTolerance = value.tool === 'fill' || value.tool === 'wand';
 return '<div class="panelhead">BRUSH</div><div class="prop-group">' +
  '<div class="two">' + field('Color','sprite.color',value.color,'color') + field('Opacity (%)','sprite.alpha',value.alpha,'number') +
   field('Size','sprite.size',value.size,'number') + '</div>' +
   check('Mirror horizontally','mirrorX') + check('Mirror vertically','mirrorY') + check('Filled shapes','filled') +
   (showTolerance ? field('Color tolerance','sprite.tolerance',value.tolerance,'number') + check('Contiguous','contiguous') : '') +
   select('Selection mode','sprite.mode',value.mode,[['replace','Replace'],['add','Add'],['subtract','Subtract'],['intersect','Intersect']]) +
  '</div>';
}

function renderSpriteEditor() {
 if (spriteWorkspace.project !== P) {
  spriteWorkspace.project = P;
  const doc = currentSprite();
  if (doc) {
   if (!doc.sheet || spriteWorkspace.frame >= doc.sheet.count) spriteWorkspace.frame = null;
   if (spriteWorkspace.mask?.length !== doc.width*doc.height) spriteWorkspace.mask = null;
   spriteWorkspace.gesture = null;
  } else selectSpriteDocument(P.spriteDocuments?.[0]);
 }
 const doc = currentSprite();
 $('#layoutlabel').textContent = doc?.name ?? '';
 $('#sprite-documents').innerHTML = (P.spriteDocuments ?? []).map(item =>
  `<button class="tree prefab-tree ${item === doc ? 'selected' : ''}" data-act="sprite:document:${item.id}">${esc(item.name)}</button>`).join('');
 $('#sprite-tools').innerHTML = doc ? spriteTools.map(([key,label,shortcut]) =>
  `<button data-act="sprite:tool:${key}" class="${key === spriteWorkspace.tool ? 'active' : ''}" aria-pressed="${key === spriteWorkspace.tool}"
   title="${label} (${shortcut})">${label}</button>`).join('') : '';
 $('#sprite-empty').hidden = Boolean(doc);
 $('#sprite-board').hidden = !doc;
 const target = doc && spriteTargets(doc)[0];
 $('#sprite-toolbar').innerHTML = button('New Sprite…','sprite:new','primary') + button('Open Image…','sprite:import') +
  (doc ? button('Link to Object…','sprite:link') + (target?.sheet ? button('Open Animator','sprite:animator') : '') +
   '<div class="spacer"></div>' + button('Export PNG','sprite:export') : '');
 if (!doc) {
  $('#sprite-inspector').innerHTML = '';
  $('#sprite-slices').innerHTML = '';
  $('#sprite-frames').innerHTML = '';
  $('#sprite-status').textContent = '';
  return;
 }
 const layers = spriteLayers(doc);
 if (!selectedSpriteLayer()) spriteWorkspace.layer = layers.at(-1)?.id;
 syncSpriteSurfaces(doc);
 const selected = selectedSpriteLayer(), area = selectedSpriteSlice();
 $('#sprite-frames').innerHTML = button('Frame Grid…','sprite:gridDialog') + (doc.sheet ?
  select('View','sprite.view',spriteWorkspace.frame == null ? 'sheet' : 'frame',[['sheet','Sheet'],['frame','Frame']]) +
  (spriteWorkspace.frame == null ? '' : button('‹','sprite:prev') + field('Frame','sprite.frame',spriteWorkspace.frame+1,'number') +
   button('›','sprite:next') + button('Copy Previous','sprite:previousPixels') + checkbox('Onion skin','sprite.onion',spriteWorkspace.onion)) : '') +
  checkbox('Pixel grid','sprite.grid',spriteWorkspace.grid) + (doc.sheet ? checkbox('Frame guides','sprite.frameGrid',spriteWorkspace.frameGrid) : '');
 const targets = spriteTargets(doc).map(type => type.name).join(', ');
 $('#sprite-slices').innerHTML = '<div class="panelhead">SLICES</div><div class="prop-group">' +
   select('Named slice','sprite.slice',area?.id ?? '',[['','None'],...doc.slices.map(slice => [slice.id,slice.name])]) +
   button('New from Selection','sprite:sliceSelection') + (area ? button('Edit Slice…','sprite:editSlice') +
    button('Export Slice PNG','sprite:exportSlice') + button('Delete Slice','sprite:removeSlice','danger ghost') : '') + '</div>';
 $('#sprite-inspector').innerHTML = spriteToolFields() +
  '<div class="panelhead">PALETTE</div><div class="prop-group"><div class="sprite-swatches">' + doc.palette.map((color,i) =>
   `<button title="${color}" aria-label="${color}" data-act="sprite:color:${i}" aria-pressed="${color === spriteWorkspace.color}" style="--swatch:${color}"></button>`).join('') +
   '</div>' + button('Add Color','sprite:addColor') + button('Remove Color','sprite:removeColor') + '</div>' +
  '<div class="panelhead">LAYERS' + button('+','sprite:addLayer') + '</div><div class="prop-group">' +
   [...layers].reverse().map(layer => `<div class="sprite-layer-row ${layer === selected ? 'selected' : ''}">
    <button class="sprite-layer-name" data-act="sprite:layer:${layer.id}">${esc(layer.name)}</button>
    <button data-act="sprite:visible:${layer.id}" title="${layer.visible?'Hide layer':'Show layer'}" aria-label="${layer.visible?'Hide':'Show'} ${esc(layer.name)}">${layer.visible?'●':'○'}</button>
    <button data-act="sprite:lock:${layer.id}" title="${layer.locked?'Unlock layer':'Lock layer'}" aria-label="${layer.locked?'Unlock':'Lock'} ${esc(layer.name)}">${layer.locked?'🔒':'◇'}</button></div>`).join('') +
   button('Import Image as Layer…','sprite:importLayer') +
   (selected ? field('Layer name','sprite.layerName',selected.name) + field('Opacity (%)','sprite.layerOpacity',Math.round(selected.opacity*100),'number') +
    '<div class="sprite-actions">' + button('Raise','sprite:raiseLayer') + button('Lower','sprite:lowerLayer') +
    button('Duplicate','sprite:duplicateLayer') + button('Merge Down','sprite:mergeDown') + button('Delete','sprite:removeLayer','danger ghost') + '</div>' : '') + '</div>' +
  '<div class="panelhead">SPRITE</div><div class="prop-group">' + field('Name','sprite.name',doc.name) +
   (targets ? '<p class="muted">Linked to ' + esc(targets) + '</p>' : '') +
   button('Resize Canvas…','sprite:resize') + button('Delete Sprite','sprite:remove','danger ghost') + '</div>';
 drawSpriteEditor();
}

function spriteNewDialog() {
 simple('New Sprite',field('Name','name','Sprite ' + ((P.spriteDocuments?.length ?? 0)+1)) +
  '<div class="two">' + field('Frame width','w',16,'number') + field('Frame height','h',16,'number') +
  field('Frames across','cols',1,'number') + field('Frame rows','rows',1,'number') + '</div>', values => {
   const name = values.name.trim().slice(0,100), w = Number(values.w), h = Number(values.h);
   const cols = Number(values.cols), rows = Number(values.rows);
   if (!name || ![w,h,cols,rows].every(value=>Number.isInteger(value)&&value>0)) throw Error('Enter a name and positive dimensions');
   const width=w*cols,height=h*rows;
   const grid = cols*rows>1 ? spriteSheetGrid(width,height,{w,h}) : null;
   if (cols*rows>1 && !grid) throw Error('Use a sheet with up to 4096 frames');
   createSpriteDocument(newSpriteDocument(name,width,height,grid));
  });
}

function spriteClipGridCompatible(type, grid) {
 const maxFrame = (type.animator?.clips ?? []).flatMap(clip => clip.frames).reduce((max,frame) => Math.max(max,frame.tile),-1);
 if (maxFrame < 0) return true;
 return Boolean(grid && type.sheet && maxFrame < grid.count &&
  spriteSheetKeys.filter(key => key !== 'count').every(key => (type.sheet[key] ?? 0) === (grid[key] ?? 0)));
}

function spriteApplyGrid(type,doc) {
 if (doc.sheet) type.sheet = { ...doc.sheet,fps:type.sheet?.fps ?? doc.sheet.fps ?? 0 };
 else delete type.sheet;
 type.w = doc.sheet?.w ?? doc.width;
 type.h = doc.sheet?.h ?? doc.height;
}

function spriteGridDialog(doc) {
 const previous = doc.sheet;
 const values = [['w','Frame width',previous?.w ?? doc.width],['h','Frame height',previous?.h ?? doc.height],
  ['margin','Margin',previous?.margin ?? 0],['spacing','Spacing',previous?.spacing ?? 0]];
 simple('Frame Grid','<div class="two">'+values.map(([key,label,value]) => field(label,key,value,'number')).join('')+'</div>',fields => {
  const grid = spriteSheetGrid(doc.width,doc.height,Object.fromEntries(values.map(([key])=>[key,Number(fields[key])])));
  if (!grid) throw Error('The grid must fit the image and contain 1–4096 frames');
  const targets = spriteTargets(doc);
  if (targets.some(type => !spriteClipGridCompatible(type,grid))) throw Error('This grid would remap frames used by an animation clip');
  change(() => {
   doc.sheet = grid;
   for (const type of targets) spriteApplyGrid(type,doc);
   spriteWorkspace.frame = null;
   spriteWorkspace.mask = null;
  });
 });
}

function spriteResizeDialog(doc) {
 if (!spriteReady()) return;
 const fields='<div class="two">'+field('Width','w',doc.width,'number')+field('Height','h',doc.height,'number')+'</div>';
 simple('Resize Canvas',fields+'<p class="muted">The top left stays fixed. Reducing the canvas crops pixels outside the new bounds.</p>',values=>{
  const width=Number(values.w), height=Number(values.h);
  if (!validSpriteSize(width,height)) throw Error('Use a canvas up to 4096 pixels on either side and up to 4,194,304 pixels total');
  if (width===doc.width && height===doc.height) return;
  const grid=doc.sheet ? spriteSheetGrid(width,height,doc.sheet) : null;
  if (doc.sheet && !grid) throw Error('The current frame grid must fit the resized canvas');
  if (doc.slices.some(slice=>!spriteContainsBox({width,height},slice))) throw Error('Adjust slices that extend outside the new canvas');
  const targets=spriteTargets(doc);
  if (targets.some(type=>!spriteClipGridCompatible(type,grid))) throw Error('This resize would remap frames used by an animation clip');
  const layers=spriteLayers(doc).map(layer=>{
   const canvas=spriteCanvas(width,height);
   canvas.getContext('2d',{willReadFrequently:true}).drawImage(spriteWorkspace.surfaces.get(layer.id).canvas,0,0);
   return { layer,canvas,source:layer.image ? canvas.toDataURL('image/png') : '' };
  });
  change(()=>{
   Object.assign(doc,{width,height,sheet:grid});
   for (const {layer,canvas,source} of layers) {
    layer.image=source;
    spriteWorkspace.surfaces.set(layer.id,{canvas,source,ready:true});
   }
   for (const type of targets) spriteApplyGrid(type,doc);
   setSpriteArtwork(doc);
   if (spriteWorkspace.frame >= (grid?.count ?? 0)) spriteWorkspace.frame=null;
   spriteWorkspace.mask=null;
   spriteWorkspace.zoom=resetSpriteZoom();
  });
 });
}

async function editObjectSprite(type = animatorType()) {
 if (type?.kind !== 'sprite') return;
 const existing = P.spriteDocuments?.find(doc => doc.id === type.spriteDocument);
 if (existing) {
  selectSpriteDocument(existing);
  tab = 'sprite';
  render();
  return;
 }
 const project = P, source = type.image;
 try {
  if (!source) {
   const doc = newSpriteDocument(type.name,Math.max(1,Math.round(type.w)),Math.max(1,Math.round(type.h)));
   createSpriteDocument(doc,'',type);
   return;
  }
  if (!/^data:image\/[a-z\d.+-]+;base64,/i.test(source)) throw Error('Open an embedded image or import a local file');
  const image = new Image();
  image.src = source;
  await image.decode();
  if (P !== project || !P.types.includes(type) || type.image !== source) return;
  const width=image.naturalWidth,height=image.naturalHeight;
  const grid = type.sheet ? spriteSheetGrid(width,height,type.sheet) : null;
  if (type.sheet && !grid) throw Error('The sheet grid does not fit the image');
  createSpriteDocument(newSpriteDocument(type.name,width,height,grid),source,type);
 } catch (error) { alert(error.message); }
}

function spriteLinkDialog(doc) {
 const types = P.types.filter(type=>type.kind !== 'text');
 if (!types.length) return alert('Create a sprite object type in Layout first');
 const chosen = types.find(type=>type.id===activeType) ?? types[0];
 simple('Link to Object',select('Object type','object',chosen.id,types.map(type=>[type.id,type.name])),values=>{
  const type=T(values.object);
  if (!spriteReady() || !type) throw Error('Wait for the layers to finish loading');
  if (!spriteClipGridCompatible(type,doc.sheet)) throw Error('Match the object’s existing frame grid to preserve its animation clips');
  const source=flattenedSprite(doc).toDataURL('image/png');
  change(()=>{
   type.spriteDocument=doc.id;
   type.image=source;
   spriteApplyGrid(type,doc);
   selected=null; activeType=type.id;
  });
 });
}

function spriteSliceDialog(doc,box,previous = null) {
 simple(previous ? 'Edit Slice' : 'New Slice',field('Name','name',previous?.name ?? 'Slice '+(doc.slices.length+1)) +
  '<div class="two">'+[['x','X'],['y','Y'],['w','Width'],['h','Height']].map(([key,label]) =>
  field(label,key,box[key],'number')).join('')+'</div>',values=>{
   const name=values.name.trim().slice(0,100), next=Object.fromEntries(['x','y','w','h'].map(key=>[key,Number(values[key])]));
   if (!name || doc.slices.some(slice=>slice!==previous&&slice.name===name) || !spriteContainsBox(doc,next)) {
    throw Error('Use a unique name and a rectangle entirely inside the artwork');
   }
   change(()=>{
    const slice=previous ?? {id:uid()};
    Object.assign(slice,next,{name});
    if (!previous) doc.slices.push(slice);
    spriteWorkspace.slice=slice.id;
   });
  });
}

function spriteSetFrame(index) {
 const doc=currentSprite();
 const next=index==null || !doc?.sheet ? null : Math.max(0,Math.min(doc.sheet.count-1,index));
 const changesView=(spriteWorkspace.frame===null)!==(next===null);
 if (next===spriteWorkspace.frame) return;
 spriteWorkspace.frame=next;
 spriteWorkspace.mask=null;
 if (changesView) spriteWorkspace.zoom=resetSpriteZoom();
 renderSpriteEditor();
}

function spriteExportPNG(doc,slice) {
 if (!spriteReady()) return;
 const canvas=flattenedSprite(doc,slice), name=(slice?.name ?? doc.name).replace(/[^a-z0-9_-]+/gi,'_')||'sprite';
 canvas.toBlob(blob=>{ if (blob) dl(name+'.png',blob,'image/png'); },'image/png');
}

function spriteTool(key) {
 if (!spriteTools.some(([id])=>id===key)) return;
 spriteWorkspace.tool=key;
 renderSpriteEditor();
}

function editSpriteLayer(draw) {
 const layer=editableSpriteLayer();
 if (!layer) return;
 const {canvas}=spriteWorkspace.surfaces.get(layer.id), context=canvas.getContext('2d',{willReadFrequently:true});
 const data=context.getImageData(0,0,canvas.width,canvas.height);
 if (draw(data,context) === false) return;
 context.putImageData(data,0,0);
 commitSpritePixels(layer);
}

function mergeSpriteLayer(doc,layer) {
 const layers=spriteLayers(doc), lower=layers[layers.indexOf(layer)-1];
 if (!lower || !spriteReady()) return;
 if ([lower,layer].some(item=>!item.visible || item.locked)) return alert('Both layers must be visible and unlocked');
 const canvas=spriteCanvas(doc.width,doc.height), context=canvas.getContext('2d',{willReadFrequently:true});
 for (const item of [lower,layer]) {
  context.globalAlpha=item.opacity;
  context.drawImage(spriteWorkspace.surfaces.get(item.id).canvas,0,0);
 }
 const source=canvas.toDataURL('image/png');
 change(()=>{
  lower.opacity=1;
  lower.image=source;
  spriteWorkspace.layer=lower.id;
  spriteWorkspace.surfaces.set(lower.id,{canvas,source,ready:true});
  P.spriteLayers=P.spriteLayers.filter(item=>item!==layer);
  setSpriteArtwork(doc);
 });
}

function spriteSelectionAction(action,doc) {
 const area=spriteFrameBounds(doc,spriteWorkspace.frame), mask=spriteWorkspace.mask;
 if (action === 'deselect') {
  spriteWorkspace.mask=null;
  return drawSpriteEditor();
 }
 if (action === 'selectAll' || action === 'invert') {
  const next=new Uint8Array(doc.width*doc.height);
  pixelShape(area,false,true,(x,y)=>{
   const index=y*doc.width+x;
   if (action === 'selectAll' || !mask?.[index]) next[index]=1;
  });
  spriteWorkspace.mask=next;
  return drawSpriteEditor();
 }
 if (action === 'copy' || action === 'cut') {
  const record=spriteWorkspace.surfaces.get(selectedSpriteLayer()?.id);
  if (!record?.ready) return;
  const data=record.canvas.getContext('2d').getImageData(0,0,doc.width,doc.height);
  const copy=spriteCopyPixels(data.data,mask,doc.width,area);
  if (!copy) return;
  spriteWorkspace.clipboard=copy;
  if (action === 'copy') {
   spriteWorkspace.status='Copied '+copy.w+' × '+copy.h;
   return drawSpriteEditor();
  }
 }
 editSpriteLayer(data=>{
  if (action === 'cut' || action === 'clearPixels') {
   spriteErasePixels(data.data,doc.width,area,mask);
   return;
  }
  const paste=action==='paste';
  const copy=paste ? spriteWorkspace.clipboard : spriteCopyPixels(data.data,mask,doc.width,area);
  if (!copy) return false;
  const rotated=action==='rotate', w=rotated ? copy.h : copy.w, h=rotated ? copy.w : copy.h;
  if (rotated && (w>area.w || h>area.h)) {
   spriteWorkspace.status='Rotated selection does not fit this view';
   drawSpriteEditor();
   return false;
  }
  const x=paste ? area.x+Math.max(0,Math.floor((area.w-w)/2)) : Math.min(copy.x,area.x+area.w-w);
  const y=paste ? area.y+Math.max(0,Math.floor((area.h-h)/2)) : Math.min(copy.y,area.y+area.h-h);
  if (!paste) spriteErasePixels(data.data,doc.width,copy,mask);
  spriteWorkspace.mask=spritePastePixels(data.data,doc.width,area,copy,x,y,action);
 });
}

function spriteEditorAction(action,id) {
 const doc=currentSprite(), layer=selectedSpriteLayer(), slice=selectedSpriteSlice();
 if (action==='new') return spriteNewDialog();
 if (action==='import' || action==='importLayer') {
  $('#sprite-file').dataset.mode=action;
  $('#sprite-file').click();
  return;
 }
 if (action==='editObject') return editObjectSprite();
 if (action==='document') {
  selectSpriteDocument(P.spriteDocuments.find(item=>item.id===id));
  return renderSpriteEditor();
 }
 if (!doc) return;
 switch (action) {
 case 'tool': spriteTool(id); break;
 case 'link': spriteLinkDialog(doc); break;
 case 'gridDialog': spriteGridDialog(doc); break;
 case 'resize': spriteResizeDialog(doc); break;
 case 'animator': {
  const type=spriteTargets(doc).find(type=>type.id===activeType) ?? spriteTargets(doc)[0];
  if (!type) break;
  selected=null; activeType=type.id; tab='animate'; render();
  break;
 }
 case 'prev': spriteSetFrame((spriteWorkspace.frame ?? 0)-1); break;
 case 'next': spriteSetFrame((spriteWorkspace.frame ?? -1)+1); break;
 case 'previousPixels': if (spriteWorkspace.frame>0) editSpriteLayer((data,context)=>{
  const area=spriteFrameBounds(doc,spriteWorkspace.frame), from=spriteFrameBounds(doc,spriteWorkspace.frame-1);
  const previous=context.getImageData(from.x,from.y,from.w,from.h);
  for (let y=0;y<area.h;y++) {
   const destination=((area.y+y)*doc.width+area.x)*4;
   data.data.set(previous.data.subarray(y*area.w*4,(y+1)*area.w*4),destination);
  }
 }); break;
 case 'color': spriteWorkspace.color=doc.palette[Number(id)] ?? spriteWorkspace.color;renderSpriteEditor();break;
 case 'addColor': if (!doc.palette.includes(spriteWorkspace.color)) change(()=>doc.palette.push(spriteWorkspace.color));break;
 case 'removeColor': change(()=>{doc.palette=doc.palette.filter(color=>color!==spriteWorkspace.color);});break;
 case 'layer': spriteWorkspace.layer=id;renderSpriteEditor();break;
 case 'addLayer': change(()=>{
  const next=makeSpriteLayer(doc,'Layer '+(spriteLayers(doc).length+1));
  P.spriteLayers.push(next);spriteWorkspace.layer=next.id;
 }); break;
 case 'duplicateLayer': if (layer && spriteReady()) change(()=>{
  const next={...layer,id:uid(),name:(layer.name+' Copy').slice(0,100)};
  const canvas=spriteCanvas(doc.width,doc.height);
  canvas.getContext('2d').drawImage(spriteWorkspace.surfaces.get(layer.id).canvas,0,0);
  spriteWorkspace.surfaces.set(next.id,{canvas,source:next.image,ready:true});
  P.spriteLayers.splice(P.spriteLayers.indexOf(layer)+1,0,next);
  spriteWorkspace.layer=next.id;
  setSpriteArtwork(doc);
 }); break;
 case 'mergeDown': if (layer) mergeSpriteLayer(doc,layer); break;
 case 'visible':
 case 'lock': {
  const target=spriteLayers(doc).find(item=>item.id===id);
  if (!target || action==='visible' && !spriteReady()) break;
  change(()=>{
   if (action==='lock') target.locked=!target.locked;
   else { target.visible=!target.visible;setSpriteArtwork(doc); }
  });
  break;
 }
 case 'raiseLayer':
 case 'lowerLayer': {
  const stack=spriteLayers(doc), sibling=stack[stack.indexOf(layer)+(action==='raiseLayer'?1:-1)];
  if (!layer || !sibling || !spriteReady()) break;
  change(()=>{
   const a=P.spriteLayers.indexOf(layer), b=P.spriteLayers.indexOf(sibling);
   [P.spriteLayers[a],P.spriteLayers[b]]=[P.spriteLayers[b],P.spriteLayers[a]];
   setSpriteArtwork(doc);
  });
  break;
 }
 case 'removeLayer': if (layer && spriteLayers(doc).length>1 && spriteReady()) change(()=>{
  P.spriteLayers=P.spriteLayers.filter(item=>item!==layer);
  spriteWorkspace.layer=null;setSpriteArtwork(doc);
 }); break;
 case 'sliceSelection': {
  const area=spriteFrameBounds(doc,spriteWorkspace.frame);
  const box=spriteMaskBounds(spriteWorkspace.mask,doc.width,area);
  if (box) spriteSliceDialog(doc,box);
  break;
 }
 case 'editSlice': if (slice) spriteSliceDialog(doc,slice,slice);break;
 case 'removeSlice': if (slice) change(()=>{doc.slices=doc.slices.filter(item=>item!==slice);spriteWorkspace.slice=null;});break;
 case 'exportSlice': if (slice) spriteExportPNG(doc,slice);break;
 case 'export': spriteExportPNG(doc);break;
 case 'remove':
  if (confirm('Delete the editable sprite document? Linked objects keep the last published image.')) change(()=>{
   for (const type of spriteTargets(doc)) delete type.spriteDocument;
   P.spriteDocuments=P.spriteDocuments.filter(other=>other!==doc);
   P.spriteLayers=P.spriteLayers.filter(item=>item.document!==doc.id);
   selectSpriteDocument(P.spriteDocuments[0]);
  });
  break;
 default: spriteSelectionAction(action,doc);
 }
}

function spriteBrush(data,area,mask,rgba) {
 const {width}=data, {size,mirrorX,mirrorY}=spriteWorkspace;
 const before=Math.floor((size-1)/2), after=Math.ceil((size-1)/2);
 function stamp(x,y) {
  if (x<area.x || x>=area.x+area.w || y<area.y || y>=area.y+area.h) return;
  const index=y*width+x;
  if (!mask || mask[index]) data.data.set(rgba,index*4);
 }
 return (x,y)=>{
  for (let dy=-before;dy<=after;dy++) for (let dx=-before;dx<=after;dx++) {
   const px=x+dx, py=y+dy, mx=2*area.x+area.w-1-px, my=2*area.y+area.h-1-py;
   stamp(px,py);
   if (mirrorX) stamp(mx,py);
   if (mirrorY) stamp(px,my);
   if (mirrorX && mirrorY) stamp(mx,my);
  }
 };
}

function spriteRGBA(erase) {
 if (erase) return [0,0,0,0];
 const value=Number.parseInt(spriteWorkspace.color.slice(1),16);
 return [value>>16,(value>>8)&255,value&255,Math.round(spriteWorkspace.alpha*255/100)];
}

function paintSpriteGesture(gesture,point) {
 const {tool,working,base,start,end,area,mask}=gesture;
 const write=spriteBrush(working,area,mask,gesture.color);
 if (tool==='pencil' || tool==='eraser') pixelLine(end ?? start,point,write);
 else {
  working.data.set(base.data);
  if (tool==='line') pixelLine(start,point,write);
  else if (tool==='move') {
   const {copy}=gesture;
   spriteErasePixels(working.data,working.width,copy,mask);
   const x=Math.max(area.x,Math.min(area.x+area.w-copy.w,copy.x+point.x-start.x));
   const y=Math.max(area.y,Math.min(area.y+area.h-copy.h,copy.y+point.y-start.y));
   spriteWorkspace.mask=spritePastePixels(working.data,working.width,area,copy,x,y);
  } else pixelShape(pixelBox(start,point),tool==='ellipse',spriteWorkspace.filled,write);
 }
 gesture.end=point;
 gesture.context.putImageData(working,0,0);
}

function spriteSelectionMask(gesture) {
 const {doc,tool,start,end,points,mask,mode}=gesture;
 const next=new Uint8Array(doc.width*doc.height), write=(x,y)=>{next[y*doc.width+x]=1;};
 if (tool==='lasso') lassoPixels(points,write);
 else pixelShape(pixelBox(start,end ?? start),tool==='select-ellipse',true,write);
 spriteWorkspace.mask=mergeSpriteMask(mask,next,mode);
}

function setupSpriteStage() {
 const stage=$('#sprite-stage'), board=$('#sprite-board');
 const pointAt=(event,area)=>{
  const rect=stage.getBoundingClientRect();
  const offset=(value,min,size,count)=>Math.min(count-1,Math.max(0,Math.floor((value-min)*count/size)));
  return {x:area.x+offset(event.clientX,rect.left,rect.width,area.w),y:area.y+offset(event.clientY,rect.top,rect.height,area.h)};
 };
 stage.addEventListener('pointerdown',event=>{
  const doc=currentSprite(), state=spriteWorkspace;
  if (!doc || state.gesture || ![0,1].includes(event.button)) return;
  const area=spriteFrameBounds(doc,state.frame), point=pointAt(event,area), tool=state.tool;
  const common={ id:event.pointerId,doc,tool,area,start:point,end:point,mask:state.mask,
   mode:event.shiftKey && event.altKey ? 'intersect' : event.shiftKey ? 'add' : event.altKey ? 'subtract' : state.mode };
  event.preventDefault();
  stage.focus({preventScroll:true});
  if (event.button===1 || state.space) {
   state.gesture={id:event.pointerId,tool:'pan',x:event.clientX,y:event.clientY,left:board.scrollLeft,top:board.scrollTop};
  } else if (tool==='eyedropper') {
   if (!spriteReady()) return;
   const pixel=flattenedSprite(doc,{...point,w:1,h:1}).getContext('2d').getImageData(0,0,1,1).data;
   state.color='#'+Array.from(pixel.slice(0,3),channel=>channel.toString(16).padStart(2,'0')).join('');
   state.alpha=Math.round(pixel[3]*100/255);
   return renderSpriteEditor();
  } else if (tool==='slice' || tool==='lasso' || tool.startsWith('select-')) {
   state.gesture={...common,points:[point]};
   if (tool.startsWith('select-')) spriteSelectionMask(state.gesture);
  } else if (tool==='wand') {
   const record=state.surfaces.get(selectedSpriteLayer()?.id);
   if (!record?.ready) return;
   const image=record.canvas.getContext('2d').getImageData(0,0,doc.width,doc.height);
   state.mask=mergeSpriteMask(state.mask,matchingSpritePixels(image.data,doc.width,area,point,state.tolerance,state.contiguous),common.mode);
   return drawSpriteEditor(point);
  } else if (tool==='fill') {
   return editSpriteLayer(image=>{
    const mask=matchingSpritePixels(image.data,doc.width,area,point,state.tolerance,state.contiguous,state.mask), color=spriteRGBA(false);
    for (let index=0;index<mask.length;index++) if (mask[index]) image.data.set(color,index*4);
   });
  } else {
   const layer=editableSpriteLayer();
   if (!layer) { state.status='Choose a visible, unlocked layer';return drawSpriteEditor(point); }
   const context=state.surfaces.get(layer.id).canvas.getContext('2d',{willReadFrequently:true});
   const base=context.getImageData(0,0,doc.width,doc.height);
   if (tool==='move' && !state.mask) return;
   const copy=tool==='move' ? spriteCopyPixels(base.data,state.mask,doc.width,area) : null;
   if (tool==='move' && !copy) return;
   state.gesture={...common,layer,context,base,working:new ImageData(new Uint8ClampedArray(base.data),doc.width,doc.height),
    color:spriteRGBA(tool==='eraser'),copy};
   paintSpriteGesture(state.gesture,point);
  }
  state.status='';
  stage.setPointerCapture(event.pointerId);
  drawSpriteEditor(point);
 });
 stage.addEventListener('pointermove',event=>{
  const gesture=spriteWorkspace.gesture, doc=currentSprite();
  if (!doc) return;
  if (!gesture) {
   const point=pointAt(event,spriteFrameBounds(doc,spriteWorkspace.frame));
   $('#sprite-status').textContent='X '+point.x+' · Y '+point.y+' · '+Math.round(spriteWorkspace.zoom*100)+'%';
   return;
  }
  if (gesture.id!==event.pointerId) return;
  if (gesture.tool==='pan') {
   board.scrollLeft=gesture.left+gesture.x-event.clientX;
   board.scrollTop=gesture.top+gesture.y-event.clientY;
   return;
  }
  const point=pointAt(event,gesture.area);
  if (point.x===gesture.end.x && point.y===gesture.end.y) return;
  if (gesture.working) paintSpriteGesture(gesture,point);
  else {
   gesture.end=point;
   if (gesture.tool==='lasso') gesture.points.push(point);
   else if (gesture.tool.startsWith('select-')) spriteSelectionMask(gesture);
  }
  drawSpriteEditor(point);
 });
 for (const name of ['pointerup','pointercancel','lostpointercapture']) stage.addEventListener(name,event=>{
  const state=spriteWorkspace, gesture=state.gesture;
  if (gesture?.id!==event.pointerId) return;
  state.gesture=null;
  if (name!=='pointerup') {
   if (gesture.working) gesture.context.putImageData(gesture.base,0,0);
   if (gesture.tool!=='pan') state.mask=gesture.mask;
   return drawSpriteEditor();
  }
  if (gesture.working) {
   if (gesture.base.data.some((value,i)=>value!==gesture.working.data[i])) commitSpritePixels(gesture.layer);
   else drawSpriteEditor();
  } else if (gesture.tool==='slice') {
   drawSpriteEditor();
   spriteSliceDialog(gesture.doc,pixelBox(gesture.start,gesture.end));
  } else {
   if (gesture.tool==='lasso') spriteSelectionMask(gesture);
   drawSpriteEditor();
  }
 });
}

async function importSpriteImage(event) {
 const input=event.target, file=input.files[0], mode=input.dataset.mode, doc=currentSprite(), project=P;
 input.value='';
 if (!file) return;
 const url=URL.createObjectURL(file);
 try {
  const artwork=new Image();
  artwork.src=url;
  await artwork.decode();
  if (P!==project) return;
  const {naturalWidth:width,naturalHeight:height}=artwork, name=file.name.replace(/\.[^.]+$/,'').trim().slice(0,100) || 'Sprite';
  if (!validSpriteSize(width,height)) throw Error('Use an image up to 4096 pixels on either side and up to 4,194,304 pixels total');
  if (mode==='importLayer' && (doc!==currentSprite() || !spriteReady())) return;
  if (mode==='importLayer' && (width>doc.width || height>doc.height)) throw Error('The image must fit inside the sprite canvas');
  const canvas=mode==='importLayer' ? spriteCanvas(doc.width,doc.height) : spriteCanvas(width,height);
  canvas.getContext('2d',{willReadFrequently:true}).drawImage(artwork,0,0);
  const image=canvas.toDataURL('image/png');
  if (mode!=='importLayer') return createSpriteDocument(newSpriteDocument(name,width,height),image);
  change(()=>{
   const layer=makeSpriteLayer(doc,name,image);
   P.spriteLayers.push(layer);
   spriteWorkspace.layer=layer.id;
   spriteWorkspace.surfaces.set(layer.id,{canvas,source:image,ready:true});
   setSpriteArtwork(doc);
  });
 } catch (error) { alert('Could not open image. '+error.message); }
 finally { URL.revokeObjectURL(url); }
}

function spriteFieldChanged(event) {
 const input=event.target, key=input.dataset.field?.split('.')[1], doc=currentSprite(), layer=selectedSpriteLayer();
 if (!key || !doc) return;
 const value=input.type==='checkbox' ? input.checked : input.value;
 if (key==='view') return spriteSetFrame(value==='frame' ? 0 : null);
 if (key==='frame') return spriteSetFrame(Math.round(Number(value)||1)-1);
 if (key==='name' || key==='layerName') {
  const target=key==='name' ? doc : layer;
  const name=value.trim().slice(0,100);
  if (target && name && target.name!==name) change(()=>{target.name=name;});
  else input.value=target?.name ?? '';
  return;
 }
 if (key==='layerOpacity') {
  if (!layer || !spriteReady()) return;
  const opacity=Math.round(Math.min(100,Math.max(0,Number(value)||0)))/100;
  if (opacity!==layer.opacity) change(()=>{ layer.opacity=opacity;setSpriteArtwork(doc); });
  else input.value=Math.round(layer.opacity*100);
  return;
 }
 const numericLimits={alpha:[0,100],size:[1,16],tolerance:[0,255]};
 if (numericLimits[key]) {
  const [min,max]=numericLimits[key];
  spriteWorkspace[key]=Math.min(max,Math.max(min,Math.round(Number(value)||0)));
  input.value=spriteWorkspace[key];
 } else {
  spriteWorkspace[key]=value;
  if (key==='color' || key==='slice') return renderSpriteEditor();
 }
 drawSpriteEditor();
}

function setupSpriteEditor() {
 setupSpriteStage();
 $('#sprite-file').addEventListener('change',importSpriteImage);
 for (const selector of ['#sprite-inspector','#sprite-frames','#sprite-slices']) $(selector).addEventListener('change',spriteFieldChanged);
 const selectionKeys={a:'selectAll',d:'deselect',c:'copy',x:'cut',v:'paste'};
 window.addEventListener('keydown',event=>{
  if (tab!=='sprite' || !currentSprite() || document.querySelector('dialog[open]') ||
      document.activeElement.matches('input,select,textarea,[contenteditable],.studio-menu-command')) return;
  if (event.code==='Space' && document.activeElement.matches('#sprite-stage,body')) {
   event.preventDefault();
   spriteWorkspace.space=true;
   return;
  }
  if (spriteWorkspace.gesture) return;
  const key=event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey) {
   const action=selectionKeys[key];
   if (action) {
    event.preventDefault();
    spriteSelectionAction(action,currentSprite());
   }
  } else if (event.key==='Escape') {
   spriteSelectionAction('deselect',currentSprite());
  } else if (!event.altKey) {
   const tool=spriteTools.find(([, , shortcut])=>shortcut.toLowerCase()===key);
   if (tool) spriteTool(tool[0]);
  }
 });
 window.addEventListener('keyup',event=>{ if (event.code==='Space') spriteWorkspace.space=false; });
 window.addEventListener('blur',()=>{ spriteWorkspace.space=false; });
}
