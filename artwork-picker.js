function studioArtworkOptions() {
 return [...dataSpriteOptions(),...P.tilesets.map(atlas=>[dataReference('tile',atlas.id),atlas.name + ' · Tileset'])];
}

function studioArtworkLabel(reference,options) {
 if (!reference) return 'Choose artwork…';
 const artwork = studioDataSprite(P,reference);
 const label = artwork && options.get(artwork.source);
 if (!label) return 'Missing reference';
 const index = studioArtworkFrameIndex(artwork,reference);
 return artwork.grid && reference.split('/').length > 2 && index >= 0 && index < artwork.grid.count
  ? label + ' · ' + (artwork.kind === 'tile' ? 'Tile ' : 'Frame ') + (index+1)
  : label;
}

function openStudioArtworkPicker(title,reference,save) {
 const initialSource = reference.split('/').slice(0,2).join('/');
 const options = studioArtworkOptions();
 const view = { art:null, images:[], index:0, zoom:1, x:0, y:0, fit:1, drag:null };
 const choices = new Map();
 let request = 0;
 dialog(title,
  select('Artwork','artwork-source',initialSource,[['','None'],...dataOptionsWithMissing(options,initialSource)]) +
  `<section class="artwork-picker" hidden>
   <canvas class="artwork-sheet" tabindex="0" aria-label="Artwork preview" aria-describedby="artwork-help artwork-selection"></canvas>
   <div class="artwork-view-tools">
    <button type="button" data-artwork-zoom="out" aria-label="Zoom out">−</button>
    <button type="button" data-artwork-zoom="fit">Fit</button>
    <button type="button" data-artwork-zoom="in" aria-label="Zoom in">+</button>
    <output id="artwork-zoom" aria-label="Zoom level"></output>
    <span class="spacer"></span><output id="artwork-selection" aria-live="polite"></output>
   </div>
   <p class="muted" id="artwork-help"></p>
  </section><p class="muted" id="artwork-status" role="status" hidden></p>`,()=>{
   if (!input.value) return save('');
   if (!view.art) throw Error('Choose an available artwork source');
   if (view.index < 0) throw Error('Select a tile or frame');
   save(studioArtworkReference(view.art,view.index));
 });

 const root = $('#dialogbody'), input = root.querySelector('[data-field="artwork-source"]');
 const picker = root.querySelector('.artwork-picker'), canvas = root.querySelector('.artwork-sheet');
 const context = canvas.getContext('2d'), status = root.querySelector('#artwork-status');
 const zoomLabel = root.querySelector('#artwork-zoom'), selection = root.querySelector('#artwork-selection');
 const hint = root.querySelector('#artwork-help');
 const checker = document.createElement('canvas');
 checker.width = checker.height = 16;
 const squares = checker.getContext('2d');
 squares.fillStyle = '#283747';
 squares.fillRect(0,0,16,16);
 squares.fillStyle = '#324456';
 squares.fillRect(0,0,8,8);
 squares.fillRect(8,8,8,8);
 const pattern = context.createPattern(checker,'repeat');

 function draw() {
  const {art,zoom,x,y,index} = view;
  if (!art) return;
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height) return;
  const density = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(width*density), pixelHeight = Math.round(height*density);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
   canvas.width = pixelWidth;
   canvas.height = pixelHeight;
  }
  context.setTransform(density,0,0,density,0,0);
  context.clearRect(0,0,width,height);
  context.save();
  context.translate(x,y);
  context.scale(zoom,zoom);
  context.imageSmoothingEnabled = false;
  context.fillStyle = pattern;
  context.fillRect(0,0,art.width,art.height);
  for (const {image,opacity} of view.images) {
   context.globalAlpha = opacity;
   context.drawImage(image,0,0);
  }
  context.globalAlpha = 1;
  if (art.grid) {
   const {cols,count,w,h,margin=0,spacing=0} = art.grid;
   const left = Math.max(0,Math.floor((-x/zoom-margin)/(w+spacing)));
   const right = Math.min(cols-1,Math.floor(((width-x)/zoom-margin)/(w+spacing)));
   const top = Math.max(0,Math.floor((-y/zoom-margin)/(h+spacing)));
   const bottom = Math.min(Math.ceil(count/cols)-1,Math.floor(((height-y)/zoom-margin)/(h+spacing)));
   context.strokeStyle = '#a4bed082';
   context.lineWidth = 1/zoom;
   context.beginPath();
   if (Math.min(zoom*w,zoom*h) >= 4) for (let row=top;row<=bottom;row++) {
    for (let column=left;column<=right;column++) {
     const frame = row*cols + column;
     if (frame >= count) break;
     const box = studioArtworkFrame(art,frame);
     context.rect(box.x,box.y,box.w,box.h);
    }
   }
   context.stroke();
   if (index >= 0) {
    const box = studioArtworkFrame(art,index);
    context.fillStyle = '#78dfbf38';
    context.strokeStyle = '#78dfbf';
    context.lineWidth = 2/zoom;
    context.fillRect(box.x,box.y,box.w,box.h);
    context.strokeRect(box.x,box.y,box.w,box.h);
   }
  }
  context.restore();
  zoomLabel.textContent = Math.round(zoom*100)+'%';
  const name = art.kind === 'tile' ? 'Tile' : 'Frame';
  selection.textContent = art.grid ? index < 0 ? 'Choose a '+name.toLowerCase() : name+' '+(index+1)+' of '+art.grid.count : '';
 }

 function fit() {
  if (!view.art || !canvas.clientWidth || !canvas.clientHeight) return;
  view.fit = Math.min((canvas.clientWidth-24)/view.art.width,(canvas.clientHeight-24)/view.art.height,8);
  view.zoom = view.fit;
  view.x = (canvas.clientWidth-view.art.width*view.zoom)/2;
  view.y = (canvas.clientHeight-view.art.height*view.zoom)/2;
  draw();
 }

 function zoomAt(factor,x,y) {
  if (!view.art || view.drag) return;
  const next = Math.min(Math.max(48,view.fit),Math.max(view.fit/4,view.zoom*factor));
  const ratio = next/view.zoom;
  view.x = x-(x-view.x)*ratio;
  view.y = y-(y-view.y)*ratio;
  view.zoom = next;
  draw();
 }

 function choose(index) {
  view.index = index;
  choices.set(input.value,index);
  draw();
 }

 async function load() {
  const token = ++request, source = input.value;
  view.art = null;
  view.drag = null;
  canvas.classList.remove('artwork-panning');
  picker.hidden = true;
  status.hidden = !source;
  $('#dialogok').disabled = Boolean(source);
  if (!source) return;
  const art = studioArtworkSource(P,source);
  status.textContent = art ? 'Loading artwork…' : 'Artwork is missing from this project.';
  if (!art) return;
  const pictures = await Promise.all(art.layers.map(async layer=>{
   const image = tileImage(images,{image:layer.source});
   try { await image.decode(); return {image,opacity:layer.opacity}; } catch { return null; }
  }));
  if (request !== token || !canvas.isConnected || !$('#dialog').open) return;
  view.images = pictures.filter(Boolean);
  if (!art.width && view.images.length) {
   art.width = view.images[0].image.naturalWidth;
   art.height = view.images[0].image.naturalHeight;
  }
  if (!art.width || !art.height) { status.textContent = 'Artwork could not be loaded.'; return; }
  view.art = art;
  const index = choices.get(source) ?? (source === initialSource ? studioArtworkFrameIndex(art,reference) : 0);
  view.index = index >= 0 && index < (art.grid?.count ?? 1) ? index : -1;
  $('#dialogok').disabled = view.index < 0;
  canvas.dataset.sheet = String(Boolean(art.grid));
  const unit = art.kind === 'tile' ? 'tile' : 'frame';
  canvas.setAttribute('aria-label',art.grid ? 'Choose a '+unit : 'Artwork preview');
  hint.textContent = (art.grid ? 'Click a '+unit+' to select it. ' : '') + 'Scroll to zoom. Middle-drag to pan.';
  status.hidden = true;
  picker.hidden = false;
  fit();
 }

 canvas.addEventListener('wheel',event=>{
  if (!view.art || !event.deltaY) return;
  event.preventDefault();
  const bounds = canvas.getBoundingClientRect();
  const delta = event.deltaMode ? Math.sign(event.deltaY)*100 : event.deltaY;
  zoomAt(Math.exp(-delta*.0025),event.clientX-bounds.left-canvas.clientLeft,event.clientY-bounds.top-canvas.clientTop);
 },{passive:false});
 canvas.addEventListener('pointerdown',event=>{
  if (event.button !== 1 || !view.art) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add('artwork-panning');
  view.drag = { pointer:event.pointerId,x:event.clientX,y:event.clientY };
 });
 canvas.addEventListener('pointermove',event=>{
  const drag = view.drag;
  if (!drag || drag.pointer !== event.pointerId) return;
  view.x += event.clientX-drag.x;
  view.y += event.clientY-drag.y;
  drag.x = event.clientX;
  drag.y = event.clientY;
  draw();
 });
 for (const type of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(type,event=>{
  if (view.drag?.pointer !== event.pointerId) return;
  view.drag = null;
  canvas.classList.remove('artwork-panning');
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
 });
 canvas.addEventListener('auxclick',event=>{ if (event.button === 1) event.preventDefault(); });
 canvas.addEventListener('click',event=>{
  const grid = view.art?.grid;
  if (!grid || event.button !== 0) return;
  const bounds = canvas.getBoundingClientRect();
  const {w,h,margin=0,spacing=0,cols,count} = grid;
  const x = (event.clientX-bounds.left-canvas.clientLeft-view.x)/view.zoom-margin;
  const y = (event.clientY-bounds.top-canvas.clientTop-view.y)/view.zoom-margin;
  const column = Math.floor(x/(w+spacing)), row = Math.floor(y/(h+spacing));
  const index = row*cols+column;
  if (column < 0 || column >= cols || row < 0 || index >= count || x%(w+spacing) >= w || y%(h+spacing) >= h) return;
  choose(index);
  $('#dialogok').disabled = false;
 });
 canvas.addEventListener('keydown',event=>{
  const grid = view.art?.grid;
  if (!grid) return;
  const steps = { ArrowLeft:-1,ArrowRight:1,ArrowUp:-grid.cols,ArrowDown:grid.cols };
  if (!Object.hasOwn(steps,event.key)) return;
  event.preventDefault();
  choose(Math.max(0,Math.min(grid.count-1,view.index < 0 ? 0 : view.index+steps[event.key])));
  $('#dialogok').disabled = false;
  const {x,y,w,h} = studioArtworkFrame(view.art,view.index);
  if (view.x+x*view.zoom < 0 || view.x+(x+w)*view.zoom > canvas.clientWidth ||
      view.y+y*view.zoom < 0 || view.y+(y+h)*view.zoom > canvas.clientHeight) {
   view.x = canvas.clientWidth/2-(x+w/2)*view.zoom;
   view.y = canvas.clientHeight/2-(y+h/2)*view.zoom;
   draw();
  }
 });
 picker.querySelector('.artwork-view-tools').addEventListener('click',event=>{
  const command = event.target.dataset.artworkZoom;
  if (command === 'fit') fit();
  else if (command) zoomAt(command === 'in' ? 1.25 : .8,canvas.clientWidth/2,canvas.clientHeight/2);
 });
 const observer = new ResizeObserver(draw);
 observer.observe(canvas);
 $('#dialog').addEventListener('close',()=>{
  request++;
  observer.disconnect();
 },{once:true});
 input.addEventListener('change',load);
 load();
}
