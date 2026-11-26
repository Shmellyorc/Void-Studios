function previewProjectSettings(project) {
 return project.previewSettings ??= { watches:[],spawns:[] };
}

function normalizePreviewSettings(project) {
 if (!Object.hasOwn(project,'previewSettings')) return project;
 const settings = project.previewSettings;
 const watches = Array.isArray(settings?.watches) ? settings.watches : [];
 const spawns = Array.isArray(settings?.spawns) ? settings.spawns : [];
 const ids = new Set();
 project.previewSettings = {
  watches:[...new Set(watches.filter(watch=>typeof watch === 'string' && watch.trim() && watch.length <= 300))],
  spawns:spawns.filter(spawn=>{
   if (!spawn || ![spawn.id,spawn.layout,spawn.instance,spawn.name].every(value=>typeof value === 'string' && value.trim()) ||
       spawn.name.length > 80 || ![spawn.x,spawn.y].every(Number.isFinite) || ids.has(spawn.id)) return false;
   ids.add(spawn.id);
   return true;
  }),
 };
 return project;
}

function previewSpawnInstances(layout) {
 return expandedLayoutInstances(P,layout).filter(instance=>{
  const type = T(instance.type);
  return type && !type.screenSpace && typeof instance.id === 'string';
 });
}

function setupPreviewSpawnPicker() {
 const dialog = $('#preview-spawn'), form = $('#preview-spawn-form'), canvas = $('#preview-spawn-canvas');
 const scene = $('#preview-spawn-scene'), point = $('#preview-spawn-point'), instance = $('#preview-spawn-instance');
 const x = $('#preview-spawn-x'), y = $('#preview-spawn-y'), name = $('#preview-spawn-name'), paused = $('#preview-spawn-paused');
 const save = $('#preview-spawn-save'), remove = $('#preview-spawn-remove'), playButton = $('#preview-spawn-play');
 const status = $('#preview-spawn-status'), imageListeners = new WeakSet();
 const layout = () => P.layouts.find(item=>item.id === scene.value);
 const savedPoints = () => (P.previewSettings?.spawns ?? []).filter(item=>item.layout === scene.value);
 const targets = () => previewSpawnInstances(layout());
 const options = (select,choices) => select.replaceChildren(...choices.map(([value,label])=>new Option(label,value)));

 function selectedPosition() {
  const target = targets().find(item=>item.id === instance.value);
  if (!target || !x.validity.valid || !y.validity.valid) return null;
  return {layout:scene.value,id:target.id,type:target.type,x:x.valueAsNumber,y:y.valueAsNumber};
 }

 function drawMap() {
  if (!dialog.open) return;
  const sceneLayout = layout();
  const ctx = canvas.getContext('2d');
  if (canvas.width !== sceneLayout.width) canvas.width = sceneLayout.width;
  if (canvas.height !== sceneLayout.height) canvas.height = sceneLayout.height;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = sceneLayout.background ?? '#172332';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  const atlases = availableAtlases(), layers = sceneLayout.tilemap?.layers ?? [];
  drawTileLayers(ctx,sceneLayout.tilemap,atlases,images,layers.filter(layer=>!layer.above));
  const fonts = studioFontLibrary(P);
  for (const object of tileObjectOrder(sceneLayout,expandedLayoutInstances(P,sceneLayout))) {
   const type = T(object.type);
   if (type && !type.screenSpace) drawObjectPose(ctx,type,layoutSpritePose(type,object),images,fonts);
  }
  drawTileLayers(ctx,sceneLayout.tilemap,atlases,images,layers.filter(layer=>layer.above));
  for (const image of images.values()) if (!image.complete && !imageListeners.has(image)) {
   imageListeners.add(image);
   image.addEventListener('load',drawMap,{once:true});
  }
  const spawn = selectedPosition();
  if (!spawn) return;
  const target = targets().find(item=>item.id === spawn.id);
  const unit = canvas.width / (canvas.clientWidth || canvas.width);
  const radius = 6*unit;
  ctx.lineWidth = Math.max(1,unit*1.5);
  ctx.strokeStyle = '#a0ffdd';
  ctx.fillStyle = '#93f3d333';
  ctx.fillRect(spawn.x,spawn.y,target.w,target.h);
  ctx.strokeRect(spawn.x,spawn.y,target.w,target.h);
  ctx.beginPath();
  ctx.moveTo(spawn.x-radius,spawn.y);
  ctx.lineTo(spawn.x+radius,spawn.y);
  ctx.moveTo(spawn.x,spawn.y-radius);
  ctx.lineTo(spawn.x,spawn.y+radius);
  ctx.stroke();
 }

 function refresh(message = '') {
  const choices = targets(), spawn = selectedPosition();
  instance.disabled = !choices.length;
  playButton.disabled = !spawn;
  save.disabled = !spawn || !name.value.trim();
  remove.hidden = !point.value;
  debugStatus(status,message || (!choices.length ? 'This scene has no placed world instances.' :
   !instance.value ? 'Choose an instance to move.' : ''));
  drawMap();
 }

 function loadPoints(value = '') {
  options(point,[['','Custom position'],...savedPoints().map(item=>[item.id,item.name])]);
  point.value = value;
 }

 function placeAtAuthoredPosition() {
  const target = targets().find(item=>item.id === instance.value);
  x.value = target ? sceneClamp(target.x,0,Number(x.max)) : '';
  y.value = target ? sceneClamp(target.y,0,Number(y.max)) : '';
 }

 function selectScene() {
  const current = layout(), choices = targets();
  options(instance,[['','Choose an instance'],...choices.map(object=>[
   object.id,T(object.type).name + ' · ' + Math.round(object.x) + ', ' + Math.round(object.y),
  ])]);
  const preferred = (current.id === L().id && choices.find(item=>item.id === selected)) ||
   choices.find(item=>item.type === current.camera?.target) ||
   choices.find(item=>T(item.type).name.toLowerCase() === 'player') || choices[0];
  instance.value = preferred?.id ?? '';
  x.min = y.min = '0';
  x.max = String(current.width - 1);
  y.max = String(current.height - 1);
  placeAtAuthoredPosition();
  name.value = '';
  loadPoints();
  refresh();
 }

 scene.onchange = selectScene;
 point.onchange = () => {
  const stored = savedPoints().find(item=>item.id === point.value);
  if (stored) {
   instance.value = targets().some(item=>item.id === stored.instance) ? stored.instance : '';
   x.value = stored.x;
   y.value = stored.y;
   name.value = stored.name;
  } else {
   name.value = '';
   placeAtAuthoredPosition();
  }
  refresh();
 };
 instance.onchange = () => { if (!point.value) placeAtAuthoredPosition(); refresh(); };
 x.oninput = y.oninput = name.oninput = () => refresh();
 canvas.onclick = event => {
  const bounds = canvas.getBoundingClientRect();
  x.value = sceneClamp(Math.round((event.clientX-bounds.left)*canvas.width/bounds.width),0,Number(x.max));
  y.value = sceneClamp(Math.round((event.clientY-bounds.top)*canvas.height/bounds.height),0,Number(y.max));
  refresh();
 };
 save.onclick = () => {
  const spawn = selectedPosition(), label = name.value.trim();
  if (!spawn || !label) return;
  if (savedPoints().some(item=>item.id !== point.value && item.name === label)) {
   debugStatus(status,'A spawn point already uses that name in this scene.',true);
   return;
  }
  checkpoint();
  const spawns = previewProjectSettings(P).spawns;
  const existing = spawns.find(item=>item.id === point.value);
  const record = { id:existing?.id ?? uid(),name:label,layout:spawn.layout,instance:spawn.id,x:spawn.x,y:spawn.y };
  if (existing) Object.assign(existing,record);
  else spawns.push(record);
  persist();
  loadPoints(record.id);
  refresh('Spawn point saved in the project.');
 };
 remove.onclick = () => {
  const spawns = P.previewSettings?.spawns, index = spawns?.findIndex(item=>item.id === point.value);
  if (index == null || index < 0) return;
  checkpoint();
  spawns.splice(index,1);
  persist();
  loadPoints();
  name.value = '';
  refresh('Spawn point removed.');
 };
 form.onsubmit = event => {
  event.preventDefault();
  const spawn = selectedPosition();
  if (!spawn) return;
  dialog.close();
  play({spawn,startPaused:paused.checked});
 };
 $('#preview-spawn-cancel').onclick = () => dialog.close();
 return () => {
  if (runtime || dialog.open) return;
  options(scene,P.layouts.map(item=>[item.id,item.name]));
  scene.value = (previewSpawnInstances(L()).length ? L() : P.layouts.find(item=>previewSpawnInstances(item).length) ?? L()).id;
  paused.checked = false;
  dialog.showModal();
  selectScene();
 };
}
