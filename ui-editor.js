const uiWorkspace = { project: null, screen: null, item: null, drag: null };
const currentUIScreen = () => P.uiScreens?.find(screen => screen.id === uiWorkspace.screen);
const currentUIControl = () => currentUIScreen()?.items.find(item => item.id === uiWorkspace.item);
const uiScreenOptions = (project = P) => (project.uiScreens ?? []).map(screen => [screen.id,screen.name]);
const uiControlOptions = (project = P) => (project.uiScreens ?? []).flatMap(screen => screen.items
 .filter(item => item.kind === 'button').map(item => [item.id,screen.name + ' · ' + (item.text || 'Button')]));
const uiInputOptions = (project = P) => projectInputActions(project).map(input => [input.id,input.name]);
const uiStartOptions = () => [['','None'],...uiScreenOptions()];

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
 const stage = $('#ui-stage'), { width,height } = createSceneCamera(L()).view;
 stage.style.aspectRatio = width + ' / ' + height;
 stage.style.setProperty('--void-ui-unit',stage.clientWidth / width + 'px');
 $('#ui-dimensions').textContent = width + ' × ' + height + ' viewport';
 const screen = currentUIScreen();
 stage.classList.toggle('void-ui-paused',Boolean(screen?.pause));
 const vars = Object.fromEntries(P.globals.map(variable => [variable.name,variable.value]));
 stage.replaceChildren(...(screen?.items ?? []).map(item => {
  const node = createUIControl(item,vars);
  node.tabIndex = -1;
  node.classList.toggle('ui-editor-selected',item.id === uiWorkspace.item);
  return node;
 }));
}

function renderUIWorkspace() {
 if (uiWorkspace.project !== P) {
  uiWorkspace.project = P;
  uiWorkspace.screen = L().uiScreen || P.uiScreens?.[0]?.id;
  uiWorkspace.item = null;
 }
 if (!currentUIScreen()) uiWorkspace.screen = P.uiScreens?.[0]?.id;
 const screen = currentUIScreen(), item = currentUIControl();
 $('#ui-layouts').innerHTML = P.layouts.map(layout =>
  `<button class="tree prefab-tree ${layout.id === L().id ? 'selected' : ''}" data-act="ui:layout:${esc(layout.id)}">${esc(layout.name)}</button>`).join('');
 $('#ui-screens').innerHTML = uiScreenOptions().map(([id,name]) =>
  `<button class="tree prefab-tree ${id === screen?.id ? 'selected' : ''}" data-act="ui:screen:${esc(id)}">${esc(name)}</button>`).join('');
 $('#ui-tools').innerHTML = button('+ Screen','ui:newScreen','primary') + (screen ?
  button('+ Button','ui:add:button') + button('+ Label','ui:add:label') + button('+ Bar','ui:add:bar') : '') +
  '<div class="spacer"></div>' + button('Input Actions','ui:inputs') + button('Load Menu Demo','ui:demo');
 $('#ui-empty').hidden = Boolean(screen);
 $('#ui-board').hidden = !screen;
 $('#ui-inspector').innerHTML = '<div class="panelhead">UI PROPERTIES</div><div class="prop-group">' +
  select('Starting UI in ' + L().name,'ui-start',L().uiScreen ?? '',uiStartOptions()) + '</div>' +
  (screen ? '<div class="prop-group"><h4>SCREEN</h4>' +
   field('Name','ui-screen.name',screen.name) + checkbox('Pause gameplay','ui-screen.pause',screen.pause) +
   checkbox('Keyboard and controller navigation','ui-screen.navigation',screen.navigation !== false) +
   button('Delete screen','ui:deleteScreen','danger ghost') + '</div>' : '') +
  (item ? uiInspectorControl(item) : '');
 paintUIWorkspace();
}

function uiInspectorControl(item) {
 const fieldFor = (label,key,type) => field(label,'ui-item.'+key,item[key],type);
 const options = entries => entries.map(key => [key,key.replace(/-/g,' ').replace(/^./,char => char.toUpperCase())]);
 const target = item.command === 'layout' ? select('Layout','ui-item.target',item.target,P.layouts.map(layout => [layout.id,layout.name])) :
  item.command === 'show' ? select('Screen','ui-item.target',item.target,uiStartOptions()) : '';
 return '<div class="prop-group"><h4>' + item.kind.toUpperCase() + '</h4>' + fieldFor('Text','text') +
  select('Anchor','ui-item.anchor',item.anchor,options(Object.keys(uiAnchors))) + '<div class="two">' +
  [['Offset X','x'],['Offset Y','y'],['Width','w'],['Height','h'],['Font size','size']].map(([label,key]) => fieldFor(label,key,'number')).join('') +
  fieldFor('Text color','color','color') + (item.kind !== 'label' ? fieldFor('Fill color','background','color') : '') + '</div>' +
  (item.kind === 'button' ? fieldFor('Focus order','order','number') + select('When activated','ui-item.command',item.command,
   [['event','Trigger visual event'],['layout','Go to layout'],['restart','Restart layout'],['show','Show UI screen'],['restore','Restore layout UI']]) + target :
   item.kind === 'bar' ? select('Value','ui-item.variable',item.variable,[['','Choose a global variable'],...P.globals.map(variable => [variable.name,variable.name])]) +
    fieldFor('Maximum','max','number') : '') +
  `<div class="two">${button('Duplicate','ui:duplicate')}${button('Delete','ui:deleteItem','danger')}</div></div>`;
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
 const screen = currentUIScreen(), item = currentUIControl();
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
  uiWorkspace.item = null;
  return renderUIWorkspace();
 }
 if (action === 'layout') {
  P.activeLayout = value;
  if (L().uiScreen) uiWorkspace.screen = L().uiScreen;
  uiWorkspace.item = null;
  selected = null;
  return render();
 }
 if (action === 'newScreen') return simple('New UI Screen',field('Name','name','Screen ' + ((P.uiScreens?.length ?? 0) + 1)),values => {
  const name = values.name.trim().slice(0,100);
  if (!name) throw Error('Enter a screen name');
  const next = { id:uid(),name,items:[] };
  change(() => { (P.uiScreens ??= []).push(next); uiWorkspace.screen = next.id; uiWorkspace.item = null; });
 });
 if (!screen) return;
 switch (action) {
 case 'add': change(() => {
  const next = uiControlPreset(value,({ button:'Button',label:'Label',bar:'' })[value]);
  if (value === 'button') next.order = screen.items.filter(item => item.kind === 'button').length;
  if (value === 'bar') next.variable = P.globals[0]?.name ?? '';
  screen.items.push(next);
  uiWorkspace.item = next.id;
 }); break;
 case 'duplicate': if (item) change(() => {
  const next = { ...item,id:uid(),x:item.x+16,y:item.y+16 };
  screen.items.push(next); uiWorkspace.item = next.id;
 }); break;
 case 'deleteItem': if (item) change(() => { screen.items = screen.items.filter(control => control !== item); uiWorkspace.item = null; }); break;
 case 'deleteScreen':
  if (confirm('Delete ' + screen.name + '?')) change(() => {
   P.uiScreens = P.uiScreens.filter(candidate => candidate !== screen);
   for (const layout of P.layouts) if (layout.uiScreen === screen.id) delete layout.uiScreen;
  });
  break;
 }
}

function setupUIWorkspace() {
 const stage = $('#ui-stage');
 new ResizeObserver(() => {
  if (tab === 'ui') stage.style.setProperty('--void-ui-unit',stage.clientWidth / createSceneCamera(L()).view.width + 'px');
 }).observe(stage);
 $('#ui-inspector').addEventListener('change',event => {
  const input = event.target;
  const [group,key] = (input.dataset.field ?? '').split('.');
  const screen = currentUIScreen(), item = currentUIControl();
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
 stage.addEventListener('pointerdown',event => {
  if (event.button !== 0) return;
  uiWorkspace.item = event.target.closest('[data-ui-control]')?.dataset.uiControl;
  const item = currentUIControl();
  if (item) {
   const scale = stage.clientWidth / createSceneCamera(L()).view.width;
   uiWorkspace.drag = { item,scale,x:event.clientX,y:event.clientY,oldX:item.x,oldY:item.y,saved:false };
   stage.setPointerCapture(event.pointerId);
  }
  renderUIWorkspace();
 });
 stage.addEventListener('pointermove',event => {
  const drag = uiWorkspace.drag;
  if (!drag) return;
  const x = event.clientX-drag.x,y = event.clientY-drag.y;
  if (!drag.saved) {
   if (Math.hypot(x,y) < 3) return;
   checkpoint();
   drag.saved = true;
  }
  drag.item.x = Math.round(drag.oldX+x/drag.scale);
  drag.item.y = Math.round(drag.oldY+y/drag.scale);
  positionUIControl(stage.querySelector('[data-ui-control="' + drag.item.id + '"]'),drag.item);
 });
 for (const name of ['pointerup','pointercancel','lostpointercapture']) stage.addEventListener(name,() => {
  if (!uiWorkspace.drag) return;
  uiWorkspace.drag = null;
  render();
 });
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
