const workspaceZoomLevels = [.25,.5,.75,1,1.5,2,3,4];
const workspaceCanvases = new Map();

function nextWorkspaceZoom(view, direction) {
 const current = view.get();
 if (!direction) return view.reset();
 if (direction > 0) return view.levels.find(level => level > current) ?? current;
 return view.levels.findLast(level => level < current) ?? current;
}

function canZoomWorkspace(direction) {
 const view = workspaceCanvases.get(tab);
 return Boolean(view && view.surface.clientWidth && (nextWorkspaceZoom(view,direction) !== view.get() ||
  !direction && (view.pan?.x || view.pan?.y)));
}

function zoomWorkspace(action, point) {
 const view = workspaceCanvases.get(tab);
 if (!view || !view.surface.clientWidth || view.pan?.gesture.active) return;
 if (tab === 'sprite' && spriteWorkspace.gesture) return;
 const direction = action === 'in' ? 1 : action === 'out' ? -1 : 0;
 const next = nextWorkspaceZoom(view,direction);
 if (!direction && view.pan) {
  if (next !== view.get()) view.set(next);
  view.pan.move(-view.pan.x,-view.pan.y);
  return;
 }
 if (next === view.get()) return;
 const board = view.board.getBoundingClientRect();
 const x = point?.clientX ?? board.left + board.width / 2;
 const y = point?.clientY ?? board.top + board.height / 2;
 const before = view.surface.getBoundingClientRect();
 const ratioX = (x-before.left) / before.width, ratioY = (y-before.top) / before.height;
 view.set(next);
 const after = view.surface.getBoundingClientRect();
 const dx = x-after.left-ratioX*after.width, dy = y-after.top-ratioY*after.height;
 if (view.pan) view.pan.move(dx,dy);
 else {
  view.board.scrollLeft -= dx;
  view.board.scrollTop -= dy;
 }
}

function enableWorkspacePan(view,ready) {
 const pan = {
  x:0,y:0,
  move(dx,dy) {
   pan.x += dx;
   pan.y += dy;
   view.surface.style.setProperty('--workspace-pan-x',pan.x+'px');
   view.surface.style.setProperty('--workspace-pan-y',pan.y+'px');
  },
 };
 pan.gesture = bindMiddlePan(view.board,pan.move,ready);
 view.pan = pan;
}

function setupWorkspaceZoom() {
 function register(workspace,surface,board,get,set,levels=workspaceZoomLevels,reset=()=>1) {
  const view = { surface,board,get,set,levels,reset };
  workspaceCanvases.set(workspace,view);
  let distance = 0, lastWheel = 0;
  surface.addEventListener('wheel',event => {
   if (tab !== workspace || event.deltaY === 0) return;
   event.preventDefault();
   const delta = event.deltaMode === 0 ? event.deltaY : Math.sign(event.deltaY)*40;
   if (event.timeStamp-lastWheel > 150 || Math.sign(distance) !== Math.sign(delta)) distance = 0;
   distance += delta;
   lastWheel = event.timeStamp;
   if (Math.abs(distance) < 32) return;
   zoomWorkspace(distance < 0 ? 'in' : 'out',event);
   distance = 0;
  },{ passive:false });
  return view;
 }
 const layout = $('#stage');
 $('#zoom').innerHTML = workspaceZoomLevels.map(level => `<option value="${level}">${level*100}%</option>`).join('');
 $('#zoom').value = String(zoom);
 const sceneView = register('layout',layout,layout.parentElement,() => zoom,value => {
  $('#zoom').value = String(value);
  zoom = value;
  drawEditor();
 });
 enableWorkspacePan(sceneView,()=>tab === 'layout' && !drag);
 const mapView = register('tiles',$('#tile-canvas'),$('#tile-board'),() => tileWorkspace.zoom,value => {
  tileWorkspace.zoom = value;
  const select = $('#tile-tools [data-field="tile-zoom"]');
  if (select) select.value = String(value);
  drawMapEditor();
 });
 enableWorkspacePan(mapView,()=>tab === 'tiles' && Boolean(L().tilemap) && !tileWorkspace.stroke);
 register('sprite',$('#sprite-stage'),$('#sprite-board'),() => spriteWorkspace.zoom,value => {
  spriteWorkspace.zoom = value;
  drawSpriteEditor();
 },spriteZoomLevels,resetSpriteZoom);
 for (const [workspace,selector] of [['animate','#animation-preview'],['ui','#ui-stage']]) {
  const surface = $(selector);
  let zoom = 1;
  register(workspace,surface,surface.parentElement,() => zoom,value => {
   zoom = value;
   surface.style.setProperty('--workspace-zoom',String(value));
  });
 }
}

function bindMiddlePan(surface,move,ready) {
 let drag = null;
 function cancel() {
  if (!drag) return;
  const pointer = drag.pointer;
  drag = null;
  surface.classList.remove('middle-panning');
  if (surface.hasPointerCapture(pointer)) surface.releasePointerCapture(pointer);
 }
 surface.addEventListener('pointerdown',event=>{
  if (event.button !== 1 || !ready()) return;
  event.preventDefault();
  surface.setPointerCapture(event.pointerId);
  surface.classList.add('middle-panning');
  drag = { pointer:event.pointerId,x:event.clientX,y:event.clientY };
 });
 surface.addEventListener('pointermove',event=>{
  if (drag?.pointer !== event.pointerId) return;
  if (!(event.buttons & 4)) return cancel();
  move(event.clientX-drag.x,event.clientY-drag.y);
  drag.x = event.clientX;
  drag.y = event.clientY;
 });
 for (const name of ['pointerup','pointercancel','lostpointercapture']) surface.addEventListener(name,event=>{
  if (drag?.pointer === event.pointerId) cancel();
 });
 surface.addEventListener('auxclick',event=>{ if (event.button === 1) event.preventDefault(); });
 return { cancel,get active() { return Boolean(drag); } };
}

function fitSheetViewport(canvas,view,width,height,inset=12,limit=8) {
 if (!canvas.clientWidth || !canvas.clientHeight) return;
 const fit = Math.min(Math.max(1,canvas.clientWidth-2*inset)/width,Math.max(1,canvas.clientHeight-2*inset)/height,limit);
 Object.assign(view,{ fit,zoom:fit,x:(canvas.clientWidth-width*fit)/2,y:(canvas.clientHeight-height*fit)/2 });
}

function paintSheetViewport(canvas,view,paint) {
 const width = canvas.clientWidth, height = canvas.clientHeight;
 if (!width || !height) return;
 const density = window.devicePixelRatio || 1;
 const pixelsWide = Math.round(width*density), pixelsHigh = Math.round(height*density);
 if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
  canvas.width = pixelsWide;
  canvas.height = pixelsHigh;
 }
 const ctx = canvas.getContext('2d');
 ctx.setTransform(density,0,0,density,0,0);
 ctx.clearRect(0,0,width,height);
 ctx.save();
 ctx.translate(view.x,view.y);
 ctx.scale(view.zoom,view.zoom);
 ctx.imageSmoothingEnabled = false;
 paint(ctx,width,height);
 ctx.restore();
}

function bindSheetViewport(canvas,view,draw,ready) {
 const pan = bindMiddlePan(canvas,(dx,dy)=>{
  view.x += dx;
  view.y += dy;
  draw();
 },ready);
 const point = event=>{
  const bounds = canvas.getBoundingClientRect();
  return [event.clientX-bounds.left-canvas.clientLeft,event.clientY-bounds.top-canvas.clientTop];
 };
 function zoomAt(factor,x,y) {
  if (!ready() || pan.active) return;
  const next = Math.min(48,Math.max(view.fit/4,view.zoom*factor));
  if (next === view.zoom) return;
  const ratio = next/view.zoom;
  view.x = x-(x-view.x)*ratio;
  view.y = y-(y-view.y)*ratio;
  view.zoom = next;
  draw();
 }
 canvas.addEventListener('wheel',event=>{
  if (!ready() || !event.deltaY) return;
  event.preventDefault();
  const delta = event.deltaMode ? Math.sign(event.deltaY)*100 : event.deltaY;
  zoomAt(Math.exp(-delta*.0025),...point(event));
 },{passive:false});
 return { zoomAt,cancelPan:pan.cancel,sheetPoint(event) {
  const [x,y] = point(event);
  return [(x-view.x)/view.zoom,(y-view.y)/view.zoom];
 } };
}

function sheetFrameAt(grid,x,y) {
 const { w,h,margin=0,spacing=0,cols,count } = grid;
 const localX = x-margin, localY = y-margin;
 const column = Math.floor(localX/(w+spacing)), row = Math.floor(localY/(h+spacing));
 const frame = row*cols+column;
 return column < 0 || column >= cols || row < 0 || frame >= count || localX%(w+spacing) >= w || localY%(h+spacing) >= h ? -1 : frame;
}

function visitVisibleSheetFrames(view,width,height,grid,visit) {
 const { zoom,x,y } = view;
 const { w,h,margin=0,spacing=0,cols,count } = grid;
 const left = Math.max(0,Math.floor((-x/zoom-margin)/(w+spacing)));
 const right = Math.min(cols-1,Math.floor(((width-x)/zoom-margin)/(w+spacing)));
 const top = Math.max(0,Math.floor((-y/zoom-margin)/(h+spacing)));
 const bottom = Math.min(Math.ceil(count/cols)-1,Math.floor(((height-y)/zoom-margin)/(h+spacing)));
 for (let row=top;row<=bottom;row++) for (let column=left;column<=right;column++) {
  const frame = row*cols+column;
  if (frame >= count) break;
  visit(frame,margin+column*(w+spacing),margin+row*(h+spacing),w,h);
 }
}

function editorSheetMarkup(id,label) {
 return `<div class="sheet-palette">
  <canvas id="${id}" class="editor-sheet" aria-label="${label}"></canvas>
  <div class="sheet-palette-tools"><button type="button" data-sheet-fit>Fit</button>
   <span class="muted">Wheel to zoom · Middle-drag to pan</span></div>
 </div>`;
}

function renderEditorSheet(view,canvas,{ key,image,width,height,grid,select,selected,dimmed }) {
 const geometry = [key,width,height,grid.w,grid.h,grid.margin,grid.spacing,grid.cols,grid.count].join('/');
 if (geometry !== view.geometry || image !== view.image) view.zoom = null;
 Object.assign(view,{ geometry,image });
 canvas.style.setProperty('--sheet-aspect',String(width/height));
 const fit = ()=>fitSheetViewport(canvas,view,width,height,8,4);
 const draw = ()=>{
  if (!canvas.isConnected) return;
  if (!view.zoom) fit();
  if (!view.zoom) return;
  paintSheetViewport(canvas,view,(ctx,viewportWidth,viewportHeight)=>{
   if (image.naturalWidth) ctx.drawImage(image,0,0);
   if (Math.min(grid.w,grid.h)*view.zoom < 3) return;
   visitVisibleSheetFrames(view,viewportWidth,viewportHeight,grid,(frame,x,y,w,h)=>{
    if (dimmed?.(frame)) {
     ctx.fillStyle = '#08111bb8';
     ctx.fillRect(x,y,w,h);
    }
    const active = selected(frame);
    ctx.strokeStyle = active ? '#78dfbf' : '#e0f2fc5e';
    ctx.lineWidth = (active ? 2 : 1)/view.zoom;
    ctx.strokeRect(x,y,w,h);
   });
  });
 };
 const replaced = view.canvas !== canvas;
 Object.assign(view,{ draw,fit,grid,select,canvas });
 if (replaced) {
  view.observer?.disconnect();
  view.gestures?.cancelPan();
  const ready = ()=>Boolean(view.zoom && view.canvas === canvas);
  const gestures = bindSheetViewport(canvas,view,()=>view.draw(),ready);
  view.gestures = gestures;
  canvas.addEventListener('click',event=>{
   if (event.button !== 0 || !ready()) return;
   const index = sheetFrameAt(view.grid,...gestures.sheetPoint(event));
   if (index >= 0) view.select(index,event);
  });
  canvas.parentElement.querySelector('[data-sheet-fit]').addEventListener('click',()=>{
   view.fit(); view.draw();
  });
  view.observer = new ResizeObserver(()=>{ if (view.canvas === canvas) view.draw(); });
  view.observer.observe(canvas);
 }
 draw();
}
