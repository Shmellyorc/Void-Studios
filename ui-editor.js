const uiWorkspace = { project: null, screen: null, selection: new Set(), gesture: null };
const currentUIScreen = () => P.uiScreens?.find(screen => screen.id === uiWorkspace.screen);
const selectedUIControls = () => (currentUIScreen()?.items ?? []).filter(item => uiWorkspace.selection.has(item.id));
const uiScreenOptions = (project = P) => (project.uiScreens ?? []).map(screen => [screen.id,screen.name]);
const uiControlOptions = (project = P) => (project.uiScreens ?? []).flatMap(screen => screen.items
 .filter(item => item.kind === 'button').map(item => [item.id,screen.name + ' · ' + (item.text || 'Button')]));
const uiInputOptions = (project = P) => projectInputActions(project).map(input => [input.id,input.name]);
const uiStartOptions = () => [['','None'],...uiScreenOptions()];
const uiAnchorLabels = {
 'top-left':'Top Left', 'top-center':'Top Center', 'top-right':'Top Right',
 'center-left':'Center Left', center:'Center', 'center-right':'Center Right',
 'bottom-left':'Bottom Left', 'bottom-center':'Bottom Center', 'bottom-right':'Bottom Right',
};
const uiEdgeLabels = {
 left:'Align Left Edges', horizontal:'Align Horizontal Centers', right:'Align Right Edges',
 top:'Align Top Edges', vertical:'Align Vertical Centers', bottom:'Align Bottom Edges',
};
const uiResizeHandles = { nw:[-1,-1], n:[0,-1], ne:[1,-1], e:[1,0], se:[1,1], s:[0,1], sw:[-1,1], w:[-1,0] };

function uiControlBounds(item, viewport) {
 const [x,y] = uiAnchors[item.anchor];
 const left = (viewport.width-item.w)*x + item.x;
 const top = (viewport.height-item.h)*y + item.y;
 return { left,top,right:left+item.w,bottom:top+item.h };
}

function uiBoundsGroup(boxes) {
 return boxes.reduce((a,b) => ({
  left:Math.min(a.left,b.left), top:Math.min(a.top,b.top),
  right:Math.max(a.right,b.right), bottom:Math.max(a.bottom,b.bottom),
 }));
}

function setUIControlBounds(item, box, viewport, anchor = item.anchor) {
 const [x,y] = uiAnchors[anchor], w = box.right-box.left, h = box.bottom-box.top;
 Object.assign(item,{ anchor,w,h,x:box.left-(viewport.width-w)*x,y:box.top-(viewport.height-h)*y });
}

function offsetUIBounds(box, x, y) {
 return { left:box.left+x, right:box.right+x, top:box.top+y, bottom:box.bottom+y };
}

function positionUIBounds(node, box) {
 const px = value => 'calc(' + value + ' * var(--void-ui-unit))';
 node.style.left = px(box.left);
 node.style.top = px(box.top);
 node.style.width = px(box.right-box.left);
 node.style.height = px(box.bottom-box.top);
}

function alignUIControls(command) {
 const items = selectedUIControls();
 if (!items.length || !command) return;
 const viewport = createSceneCamera(L()).view;
 const boxes = items.map(item => uiControlBounds(item,viewport)), group = uiBoundsGroup(boxes);
 const [target, alignment] = command.split(':');
 if (target === 'viewport' && Object.hasOwn(uiAnchors,alignment)) {
  const [x,y] = uiAnchors[alignment];
  const dx = (viewport.width-(group.right-group.left))*x-group.left;
  const dy = (viewport.height-(group.bottom-group.top))*y-group.top;
  change(() => items.forEach((item,i) => setUIControlBounds(item,offsetUIBounds(boxes[i],dx,dy),viewport,alignment)));
 } else if (items.length > 1 && target === 'selection' && Object.hasOwn(uiEdgeLabels,alignment)) {
  change(() => items.forEach((item,i) => {
   const box = boxes[i];
   const x = ({ left:group.left-box.left, right:group.right-box.right,
    horizontal:(group.left+group.right-box.left-box.right)/2 })[alignment] ?? 0;
   const y = ({ top:group.top-box.top, bottom:group.bottom-box.bottom,
    vertical:(group.top+group.bottom-box.top-box.bottom)/2 })[alignment] ?? 0;
   setUIControlBounds(item,offsetUIBounds(box,x,y),viewport);
  }));
 }
}

function uiAlignmentMenu(count) {
 const options = (group,labels) => Object.entries(labels).map(([value,label]) =>
  `<option value="${group}:${value}">${label}</option>`).join('');
 return `<select id="ui-align" aria-label="Align selected controls" ${count ? '' : 'disabled'}>
  <option value="">Align</option>
  <optgroup label="Place in viewport">${options('viewport',uiAnchorLabels)}</optgroup>
  <optgroup label="Align within selection" ${count > 1 ? '' : 'disabled'}>${options('selection',uiEdgeLabels)}</optgroup>
 </select>`;
}

function uiControlPreset(kind, text, props = {}) {
 return {
  id: uid(), kind, text, anchor: 'center', x: 0, y: 0, w: 180, h: 42, size: 17,
  color: '#e8f2f6', background: '#24465a',
  ...(kind === 'button' ? { order: 0, command: 'event', target: '' } : {}),
  ...(kind === 'bar' ? { variable: '', max: 100, background: '#3cb58f' } : {}),
  ...props,
 };
}

function paintUIWorkspace() {
 const stage = $('#ui-stage'), viewport = createSceneCamera(L()).view, { width,height } = viewport;
 stage.style.aspectRatio = width + ' / ' + height;
 stage.style.setProperty('--void-ui-unit',stage.clientWidth / width + 'px');
 $('#ui-dimensions').textContent = width + ' × ' + height + ' viewport · Shift-click or drag a box to select';
 const screen = currentUIScreen();
 stage.classList.toggle('void-ui-paused',Boolean(screen?.pause));
 const vars = Object.fromEntries(P.globals.map(variable => [variable.name,variable.value]));
 stage.replaceChildren(...(screen?.items ?? []).map(item => {
  const node = createUIControl(item,vars);
  node.tabIndex = -1;
  node.classList.toggle('ui-editor-selected',uiWorkspace.selection.has(item.id));
  return node;
 }));
 const items = selectedUIControls();
 if (!items.length) return;
 const frame = document.createElement('div');
 frame.className = 'ui-selection-frame' + (items.length > 1 ? ' ui-selection-group' : '');
 frame.setAttribute('aria-hidden','true');
 positionUIBounds(frame, uiBoundsGroup(items.map(item => uiControlBounds(item,viewport))));
 if (items.length === 1) {
  for (const [direction,[x,y]] of Object.entries(uiResizeHandles)) {
   const handle = document.createElement('span');
   handle.className = 'ui-resize-handle';
   handle.dataset.uiResize = direction;
   handle.style.left = `clamp(5px,${(x+1)*50}%,100% - 5px)`;
   handle.style.top = `clamp(5px,${(y+1)*50}%,100% - 5px)`;
   frame.append(handle);
  }
 }
 stage.append(frame);
}

function renderUIWorkspace() {
 if (uiWorkspace.project !== P) {
  uiWorkspace.project = P;
  uiWorkspace.screen = L().uiScreen || P.uiScreens?.[0]?.id;
  uiWorkspace.selection.clear();
  uiWorkspace.gesture = null;
 }
 if (!currentUIScreen()) {
  uiWorkspace.screen = P.uiScreens?.[0]?.id;
  uiWorkspace.selection.clear();
 }
 const screen = currentUIScreen(), selection = selectedUIControls(), item = selection[0];
 $('#ui-layouts').innerHTML = P.layouts.map(layout =>
  `<button class="tree prefab-tree ${layout.id === L().id ? 'selected' : ''}" data-act="ui:layout:${esc(layout.id)}">${esc(layout.name)}</button>`).join('');
 $('#ui-screens').innerHTML = uiScreenOptions().map(([id,name]) =>
  `<button class="tree prefab-tree ${id === screen?.id ? 'selected' : ''}" data-act="ui:screen:${esc(id)}">${esc(name)}</button>`).join('');
 $('#ui-tools').innerHTML = button('+ Screen','ui:newScreen','primary') + (screen ?
  button('+ Button','ui:add:button') + button('+ Label','ui:add:label') + button('+ Bar','ui:add:bar') + uiAlignmentMenu(selection.length) : '') +
  '<div class="spacer"></div>' + button('Input Actions','ui:inputs') + button('Load Menu Demo','ui:demo');
 $('#ui-empty').hidden = Boolean(screen);
 $('#ui-board').hidden = !screen;
 $('#ui-inspector').innerHTML = '<div class="panelhead">UI PROPERTIES</div><div class="prop-group">' +
  select('Starting UI in ' + L().name,'ui-start',L().uiScreen ?? '',uiStartOptions()) + '</div>' +
  (screen ? '<div class="prop-group"><h4>SCREEN</h4>' +
   field('Name','ui-screen.name',screen.name) + checkbox('Pause gameplay','ui-screen.pause',screen.pause) +
   checkbox('Keyboard and controller navigation','ui-screen.navigation',screen.navigation !== false) +
   button('Delete screen','ui:deleteScreen','danger ghost') + '</div>' : '') +
  (selection.length === 1 ? uiInspectorControl(item) : selection.length > 1 ? `<div class="prop-group">
   <h4>${selection.length} CONTROLS SELECTED</h4>${uiSelectionActions(' selection')}</div>` : '');
 paintUIWorkspace();
}

function uiInspectorControl(item) {
 const fieldFor = (label,key,type) => field(label,'ui-item.'+key,item[key],type);
 const target = item.command === 'layout' ? select('Layout','ui-item.target',item.target,P.layouts.map(layout => [layout.id,layout.name])) :
  item.command === 'show' ? select('Screen','ui-item.target',item.target,uiStartOptions()) : '';
 return '<div class="prop-group"><h4>' + item.kind.toUpperCase() + '</h4>' + fieldFor('Text','text') +
  select('Anchor','ui-item.anchor',item.anchor,Object.entries(uiAnchorLabels)) + '<div class="two">' +
  [['Offset X','x'],['Offset Y','y'],['Width','w'],['Height','h'],['Font size','size']].map(([label,key]) => fieldFor(label,key,'number')).join('') +
  fieldFor('Text color','color','color') + (item.kind !== 'label' ? fieldFor('Fill color','background','color') : '') + '</div>' +
  (item.kind === 'button' ? fieldFor('Focus order','order','number') + select('When activated','ui-item.command',item.command,
   [['event','Trigger visual event'],['layout','Go to layout'],['restart','Restart layout'],['show','Show UI screen'],['restore','Restore layout UI']]) + target :
   item.kind === 'bar' ? select('Value','ui-item.variable',item.variable,[['','Choose a global variable'],...P.globals.map(variable => [variable.name,variable.name])]) +
    fieldFor('Maximum','max','number') : '') +
  uiSelectionActions('') + '</div>';
}

function uiSelectionActions(suffix) {
 return `<div class="two">${button('Duplicate'+suffix,'ui:duplicate')}${button('Delete'+suffix,'ui:deleteItem','danger')}</div>`;
}

function showInputActions() {
 dialog('Input Actions',
  '<div class="asset-toolbar">' + button('+ Add action','ui:editInput') + '</div>' +
  projectInputActions(P).map(action => `<div class="prop-group"><h4>${esc(action.name)}</h4>
   <p class="muted">${esc([...action.keys,...action.buttons.map(index => gamepadButtonNames[index])].join(' · ') || 'No bindings')}</p>
   ${button('Edit','ui:editInput:'+action.id)}</div>`).join(''),() => {},'Close');
}

function editInputAction(id) {
 $('#dialog').close();
 const original = projectInputActions(P).find(action => action.id === id);
 const defaults = menuInputDefaults.find(action => action.id === id);
 const removable = original && !defaults;
 const options = gamepadButtonNames.map((name,index) =>
  `<option value="${index}" ${original?.buttons.includes(index) ? 'selected' : ''}>${esc(name)}</option>`).join('');
 dialog(original ? 'Edit Input Action' : 'New Input Action',
  field('Name','input-name',original?.name ?? '') + field('Keys (comma separated)','input-keys',original?.keys.join(', ') ?? '') +
  `<label>Gamepad buttons<select id="input-gamepad" multiple size="5">${options}</select></label>
   <p class="muted">Use names like Space, Escape, ArrowUp, or a letter. Ctrl or Command selects several gamepad buttons.</p>
   ${removable ? button('Delete action','ui:deleteInput:'+original.id,'danger ghost') : ''}`,() => {
   const name = $('[data-field="input-name"]').value.trim().slice(0,100);
   if (!name || projectInputActions(P).some(action => action.id !== id && action.name.toLowerCase() === name.toLowerCase())) throw Error('Enter a unique action name');
   const keys = [...new Set($('[data-field="input-keys"]').value.split(',').map(key => key.trim()).filter(Boolean))];
   if (keys.some(key => key.length > 40)) throw Error('Enter key names up to 40 characters');
   const buttons = [...$('#input-gamepad').selectedOptions].map(option => Number(option.value));
   change(() => {
    const next = { id: original?.id ?? uid(), name,keys,buttons };
    P.inputActions = [...(P.inputActions ?? []).filter(action => action.id !== next.id),next];
   });
  });
}

function studioUIAction(action, value) {
 const screen = currentUIScreen(), selection = selectedUIControls();
 if (action === 'inputs') return showInputActions();
 if (action === 'editInput') return editInputAction(value);
 if (action === 'deleteInput') {
  if (!confirm('Delete this input action? Event blocks using it will need another binding.')) return;
  $('#dialog').close();
  change(() => { P.inputActions = P.inputActions.filter(action => action.id !== value); });
  return showInputActions();
 }
 if (action === 'demo') {
  if (confirm('Load Shard Runner with menus? Save your current project first.')) change(() => {
   P = menuDemo(); selected = openSheetId = null; activeType = 'player';
  });
  return;
 }
 if (action === 'screen') {
  uiWorkspace.screen = value;
  uiWorkspace.selection.clear();
  return renderUIWorkspace();
 }
 if (action === 'layout') {
  P.activeLayout = value;
  if (L().uiScreen) uiWorkspace.screen = L().uiScreen;
  uiWorkspace.selection.clear();
  selected = null;
  return render();
 }
 if (action === 'newScreen') return simple('New UI Screen',field('Name','name','Screen ' + ((P.uiScreens?.length ?? 0) + 1)),values => {
  const name = values.name.trim().slice(0,100);
  if (!name) throw Error('Enter a screen name');
  const next = { id:uid(),name,items:[] };
  change(() => { (P.uiScreens ??= []).push(next); uiWorkspace.screen = next.id; uiWorkspace.selection.clear(); });
 });
 if (!screen) return;
 switch (action) {
 case 'add': change(() => {
  const next = uiControlPreset(value,({ button:'Button',label:'Label',bar:'' })[value]);
  if (value === 'button') next.order = screen.items.filter(item => item.kind === 'button').length;
  if (value === 'bar') next.variable = P.globals[0]?.name ?? '';
  screen.items.push(next);
  uiWorkspace.selection = new Set([next.id]);
 }); break;
 case 'duplicate': if (selection.length) change(() => {
  const copies = selection.map(item => ({ ...item,id:uid(),x:item.x+16,y:item.y+16 }));
  screen.items.push(...copies);
  uiWorkspace.selection = new Set(copies.map(item => item.id));
 }); break;
 case 'deleteItem': if (selection.length) change(() => {
  screen.items = screen.items.filter(item => !uiWorkspace.selection.has(item.id));
  uiWorkspace.selection.clear();
 }); break;
 case 'deleteScreen':
  if (confirm('Delete ' + screen.name + '?')) change(() => {
   P.uiScreens = P.uiScreens.filter(candidate => candidate !== screen);
   for (const layout of P.layouts) if (layout.uiScreen === screen.id) delete layout.uiScreen;
  });
  break;
 }
}

function resizeUIBounds(box, direction, x, y) {
 const [horizontal,vertical] = uiResizeHandles[direction];
 return {
  left:horizontal < 0 ? Math.min(box.right-1,box.left+x) : box.left,
  right:horizontal > 0 ? Math.max(box.left+1,box.right+x) : box.right,
  top:vertical < 0 ? Math.min(box.bottom-1,box.top+y) : box.top,
  bottom:vertical > 0 ? Math.max(box.top+1,box.bottom+y) : box.bottom,
 };
}

function setupUISelection(stage) {
 const point = (event, viewport) => {
  const surface = stage.getBoundingClientRect();
  return { x:(event.clientX-surface.left)*viewport.width/surface.width, y:(event.clientY-surface.top)*viewport.height/surface.height };
 };
 stage.addEventListener('pointerdown',event => {
  if (event.button !== 0 || uiWorkspace.gesture) return;
  const id = event.target.closest('[data-ui-control]')?.dataset.uiControl;
  const direction = event.target.closest('[data-ui-resize]')?.dataset.uiResize;
  const viewport = createSceneCamera(L()).view, start = point(event,viewport);
  const extend = event.shiftKey, alreadySelected = uiWorkspace.selection.has(id);
  event.preventDefault();
  stage.focus({ preventScroll:true });
  if (id && extend) {
   if (alreadySelected) uiWorkspace.selection.delete(id);
   else uiWorkspace.selection.add(id);
   return renderUIWorkspace();
  }
  if (id && !alreadySelected) uiWorkspace.selection = new Set([id]);
  if (!id && !direction && !extend) uiWorkspace.selection.clear();
  const items = selectedUIControls().map(item => ({ item,box:uiControlBounds(item,viewport) }));
  if ((id || direction) && !items.length) return;
  uiWorkspace.gesture = {
   pointer:event.pointerId, clientX:event.clientX, clientY:event.clientY, start, viewport,
   mode:direction ? 'resize' : id ? 'move' : 'box', items, direction,
   collapse:id && alreadySelected && items.length > 1 ? id : null, moved:false,
  };
  stage.setPointerCapture(event.pointerId);
  renderUIWorkspace();
 });
 stage.addEventListener('pointermove',event => {
  const gesture = uiWorkspace.gesture;
  if (gesture?.pointer !== event.pointerId) return;
  if (!gesture.moved && Math.hypot(event.clientX-gesture.clientX,event.clientY-gesture.clientY) < 3) return;
  const end = point(event,gesture.viewport);
  if (gesture.mode === 'box') {
   if (!gesture.moved) {
    gesture.marquee = document.createElement('div');
    gesture.marquee.className = 'ui-selection-marquee';
    stage.append(gesture.marquee);
   }
   gesture.moved = true;
   gesture.box = { left:Math.min(gesture.start.x,end.x), top:Math.min(gesture.start.y,end.y),
    right:Math.max(gesture.start.x,end.x), bottom:Math.max(gesture.start.y,end.y) };
   positionUIBounds(gesture.marquee,gesture.box);
   return;
  }
  if (!gesture.moved) checkpoint();
  gesture.moved = true;
  const dx = Math.round(end.x-gesture.start.x), dy = Math.round(end.y-gesture.start.y);
  const bounds = gesture.items.map(({ item,box }) => {
   const next = gesture.mode === 'resize' ? resizeUIBounds(box,gesture.direction,dx,dy) : offsetUIBounds(box,dx,dy);
   setUIControlBounds(item,next,gesture.viewport);
   positionUIControl(stage.querySelector('[data-ui-control="' + item.id + '"]'),item);
   return next;
  });
  positionUIBounds(stage.querySelector('.ui-selection-frame'),uiBoundsGroup(bounds));
 });
 for (const name of ['pointerup','pointercancel','lostpointercapture']) stage.addEventListener(name,event => {
  const gesture = uiWorkspace.gesture;
  if (gesture?.pointer !== event.pointerId) return;
  uiWorkspace.gesture = null;
  if (name === 'pointerup') {
   if (gesture.mode === 'box' && gesture.box) {
    for (const item of currentUIScreen()?.items ?? []) {
     const itemBox = uiControlBounds(item,gesture.viewport), box = gesture.box;
     if (itemBox.left < box.right && itemBox.right > box.left && itemBox.top < box.bottom && itemBox.bottom > box.top) {
      uiWorkspace.selection.add(item.id);
     }
    }
   } else if (!gesture.moved && gesture.collapse) uiWorkspace.selection = new Set([gesture.collapse]);
  }
  if (gesture.moved && gesture.mode !== 'box') render();
  else renderUIWorkspace();
 });
}

function setupUIWorkspace() {
 const stage = $('#ui-stage');
 new ResizeObserver(() => {
  if (tab === 'ui') stage.style.setProperty('--void-ui-unit',stage.clientWidth / createSceneCamera(L()).view.width + 'px');
 }).observe(stage);
 $('#ui-inspector').addEventListener('change',event => {
  const input = event.target;
  const [group,key] = (input.dataset.field ?? '').split('.');
  const screen = currentUIScreen(), items = selectedUIControls();
  const item = items.length === 1 ? items[0] : null;
  if (group === 'ui-start') return change(() => { L().uiScreen = input.value; });
  if (group === 'ui-screen' && screen) {
   const value = key === 'name' ? input.value.trim().slice(0,100) : input.checked;
   if (key === 'name' && !value) return renderUIWorkspace();
   return change(() => { screen[key] = value; });
  }
  if (group !== 'ui-item' || !item) return;
  let value = input.type === 'number' ? input.valueAsNumber : input.value;
  if (input.type === 'number' && !Number.isFinite(value)) return renderUIWorkspace();
  if (['w','h','size','max'].includes(key)) value = Math.max(1,value);
  change(() => {
   item[key] = value;
   if (key === 'command') item.target = value === 'layout' ? L().id : '';
  });
 });
 $('#ui-tools').addEventListener('change',event => {
  if (event.target.id !== 'ui-align') return;
  alignUIControls(event.target.value);
  $('#ui-align')?.focus();
 });
 setupUISelection(stage);
}

function setupStudioSettings() {
 const dialog = $('#studio-settings'), defaultGrid = $('#default-grid');
 try {
  const saved = localStorage.getItem('void-studio-default-grid');
  if (['0','8','16','32'].includes(saved)) defaultGrid.value = saved;
 } catch {}
 snap = Number(defaultGrid.value);
 $('#snap').value = defaultGrid.value;
 $('#settings-open').onclick = () => dialog.showModal();
 $('#settings-close').onclick = () => dialog.close();
 defaultGrid.onchange = () => {
  try { localStorage.setItem('void-studio-default-grid',defaultGrid.value); } catch {}
  snap = Number(defaultGrid.value);
  $('#snap').value = defaultGrid.value;
  drawEditor();
 };
}

function menuDemo() {
 const project = demo();
 const title = { id:'title', name:'Title', width:640,height:360,background:'#142535',instances:[],events:[],uiScreen:'title-menu' };
 const arena = project.layouts.find(layout => layout.id === 'arena');
 arena.instances = arena.instances.filter(object => object.type !== 'hud');
 arena.events = arena.events.filter(row => !row.actions.some(action => action.kind === 'text' && action.args.object === 'hud'));
 arena.uiScreen = 'game-hud';
 const buttonAt = (text,y,command,target,order) => uiControlPreset('button',text,{ y,command,target,order,w:224 });
 const label = (text,y,size,w=440) => uiControlPreset('label',text,{ y,size,w });
 project.uiScreens = [
  { id:'title-menu',name:'Main Menu',items:[
   label('Shard Runner',-100,42),
   label('Collect the shards and reach the gate.',-54,17),
   buttonAt('Play',12,'layout','arena',0),
   buttonAt('Controls',66,'show','controls-menu',1),
  ] },
  { id:'controls-menu',name:'Controls',items:[
   label('Controls',-100,38),
   label('Move with the arrow keys or D-pad.',-38,18),
   label('Pause with Escape or Start.',-4,18),
   buttonAt('Back',62,'show','title-menu',0),
  ] },
  { id:'game-hud',name:'Gameplay HUD',navigation:false,items:[
   uiControlPreset('label','SHARDS {Score} / 6',{ anchor:'top-left',x:16,y:10,w:145,h:40,size:18 }),
   uiControlPreset('bar','HEALTH {Health} / 3',{ anchor:'top-right',x:-16,y:12,w:150,h:34,size:15,variable:'Health',max:3 }),
   uiControlPreset('button','Pause',{ anchor:'bottom-right',x:-16,y:-12,w:86,h:34,size:15,command:'show',target:'pause-menu' }),
  ] },
  { id:'pause-menu',name:'Pause Menu',pause:true,items:[
   label('Paused',-104,38),
   buttonAt('Resume',-35,'restore','',0),
   buttonAt('Restart',13,'restart','',1),
   buttonAt('Main Menu',61,'layout','title',2),
  ] },
 ];
 project.inputActions = [
  { id:'pause-game',name:'Pause',keys:['Escape'],buttons:[9] },
  ...[['Left',14,-1,0],['Right',15,1,0],['Up',12,0,-1],['Down',13,0,1]].map(([direction,index,x,y]) => {
   const id = 'move-' + direction.toLowerCase();
   arena.events.push(event([block('inputDown',{ input:id })],[block('moveSolid',{ object:'player',
    x:String(x*160) + '*dt',y:String(y*160) + '*dt' })]));
   return { id,name:'Move ' + direction,keys:['Arrow' + direction],buttons:[index] };
  }),
 ];
 const player = project.types.find(type => type.id === 'player');
 player.behaviors = player.behaviors.filter(behavior => behavior.id !== 'move8');
 arena.events.push(event([block('inputPressed',{ input:'pause-game' })],[block('showUI',{ screen:'pause-menu' })]));
 for (const [layoutId,screenId] of [['win','victory-menu'],['lose','retry-menu']]) {
  const layout = project.layouts.find(item => item.id === layoutId);
  layout.instances = [];
  layout.uiScreen = screenId;
  project.uiScreens.push({ id:screenId,name:layout.name,items:[
   label(layoutId === 'win' ? 'All shards recovered' : 'The shards are lost',-70,34),
   buttonAt('Play Again',12,'layout','arena',0),
   buttonAt('Main Menu',66,'layout','title',1),
  ] });
 }
 project.layouts.unshift(title);
 project.name = 'Shard Runner — Menu Demo';
 project.activeLayout = title.id;
 project.buildSettings = { title:'Shard Runner',version:'1.0.0',layout:title.id,icon:'' };
 return project;
}
