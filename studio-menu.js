const workspaceTabs = [
 ['layout','Scene','layouttab'], ['events','Event Sheet','eventtab'], ['tiles','Tilemap','tiletab'],
 ['animate','Animator','animtab'], ['ui','UI','uitab'], ['audio','Audio','audiotab'], ['sprite','Sprite','spritetab'], ['data','Data','datatab'],
];
const studioWorkspaceCommands = {
 layout: [
  ['Scene',[['New Scene…','addLayout'],['Camera Settings…','cameraSettings']]],
  ['Objects',[['New Object…','addType'],['Place Instance','place'],['Create Prefab…','prefab:create']]],
 ],
 events: [
  ['Event Sheet',[['New Sheet…','evt:newSheet'],['Add Event…','addevent'],['Add Blank Event','evt:blank'],
   ['Add Group…','evt:group'],['Include Sheet…','evt:include'],['Focus Sheet','evt:focus'],null,
   ['Generated JavaScript…','sheetJS']]],
  ['Input',[['Input Actions…','ui:inputs']]],
 ],
 tiles: [
  ['Tilemap',[['Map Settings…','tile:settings'],['Import Tileset…','tile:import'],['Load Sample Tileset','tile:sample']]],
  ['Layers',[['Add Layer…','tile:addLayer'],['Duplicate Layer…','tile:duplicate'],null,
   ['Raise Layer','tile:raise'],['Lower Layer','tile:lower'],['Delete Layer…','tile:deleteLayer']]],
 ],
 animate: [
  ['Animator',[['Import Sprite Sheet…','anim:import'],['Slice Sprite Sheet…','anim:slice'],['Edit Sprite','sprite:editObject'],null,
   ['State Machine','anim:machine'],['Load State Machine Demo…','anim:machineDemo']]],
  ['Clips',[['New Clip…','anim:new'],['Clip Settings…','anim:clipSettings'],['Duplicate Clip…','anim:duplicate'],null,
   ['Play / Pause Clip','anim:play'],['Rewind Clip','anim:rewind']]],
 ],
 ui: [
  ['UI',[['New Screen…','ui:newScreen'],['Add Panel','ui:add:panel'],['Add Button','ui:add:button'],['Add Label','ui:add:label'],['Add Image','ui:add:image'],
   ['Add Bar','ui:add:bar'],['Add Slider','ui:add:slider'],['Add Toggle','ui:add:toggle'],['Add Dropdown','ui:add:dropdown'],
   null,['Shared Styles…','ui:styles'],['Load Menu Demo…','ui:demo']]],
  ['Input',[['Input Actions…','ui:inputs']]],
 ],
 audio: [['Audio',[['Import Audio…','audio:import'],['Audition / Stop','audio:audition'],null,['Load Audio Demo…','audio:demo']]]],
 data: [['Data',[['New Data File…','data:newFile'],['Import…','data:import'],['Export…','data:export'],null,
  ['Tables','data:tables'],['Enums','data:enums'],['Load Bestiary Demo…','data:demo']]]],
 sprite: [
  ['Sprite',[['New Sprite…','sprite:new'],['Open Image…','sprite:import'],['Import Image as Layer…','sprite:importLayer'],null,
   ['Resize Canvas…','sprite:resize'],['Frame Grid…','sprite:gridDialog'],['Link to Object…','sprite:link'],['Export PNG','sprite:export']]],
  ['Brush',[['Mirror Horizontally','sprite:mirrorX'],['Mirror Vertically','sprite:mirrorY']]],
  ['Timeline',[['Play / Pause','sprite:timeline:play'],['Add Frame','sprite:timeline:add'],['Duplicate Frame','sprite:timeline:duplicate'],
   ['Delete Frame','sprite:timeline:delete']]],
  ['Panels',[...Object.entries(spritePanelLabels).map(([id,label])=>[label,'sprite:panel:'+id]),null,
   ['Reset Panel Layout','sprite:panel:reset']]],
  ['Selection',[['Select All','sprite:selectAll','Ctrl+A'],['Deselect','sprite:deselect','Ctrl+D'],['Invert Selection','sprite:invert'],null,
   ['Cut','sprite:cut','Ctrl+X'],['Copy','sprite:copy','Ctrl+C'],['Paste','sprite:paste','Ctrl+V'],['Clear Pixels','sprite:clearPixels','Delete'],null,
   ['Flip Horizontally','sprite:flip-x'],['Flip Vertically','sprite:flip-y'],['Rotate Clockwise','sprite:rotate'],['New Slice from Selection…','sprite:sliceSelection']]],
 ],
};
const studioMenuAvailability = {
 place: () => Boolean(T(I()?.type || activeType)),
 'prefab:create': () => Boolean(I() || componentSelection.members.size),
 'tile:addLayer': () => Boolean(L().tilemap),
 'tile:duplicate': () => Boolean(selectedTileLayer()),
 'tile:raise': () => Boolean(selectedTileLayer()),
 'tile:lower': () => Boolean(selectedTileLayer()),
 'tile:deleteLayer': () => Boolean(selectedTileLayer()),
 'anim:import': () => Boolean(animatorType()),
 'anim:slice': () => Boolean(animatorType()?.image),
 'anim:new': () => Boolean(animatorType()),
 'anim:clipSettings': () => Boolean(animatorClip()),
 'anim:duplicate': () => Boolean(animatorClip()),
 'anim:play': () => Boolean(animatorClip()),
 'anim:rewind': () => Boolean(animatorClip()),
 'ui:add:button': () => Boolean(currentUIScreen()),
 'ui:add:label': () => Boolean(currentUIScreen()),
 'ui:add:bar': () => Boolean(currentUIScreen()),
 'ui:add:panel': () => Boolean(currentUIScreen()),
 'ui:add:image': () => Boolean(currentUIScreen()),
 'data:export': () => Boolean(dataFile()),
 'ui:add:slider': () => Boolean(currentUIScreen()),
 'ui:add:toggle': () => Boolean(currentUIScreen()),
 'ui:add:dropdown': () => Boolean(currentUIScreen()),
 'audio:import': () => !audioWorkspace.importing,
 'audio:audition': () => Boolean(selectedAudioClip()),
 'sprite:editObject': () => animatorType()?.kind === 'sprite',
 'sprite:importLayer': () => Boolean(currentSprite()),
 'sprite:gridDialog': () => Boolean(currentSprite()),
 'sprite:resize': () => Boolean(currentSprite()),
 'sprite:link': () => Boolean(currentSprite()),
 'sprite:export': () => Boolean(currentSprite()),
 'sprite:mirrorX': () => Boolean(currentSprite()),
 'sprite:mirrorY': () => Boolean(currentSprite()),
 'sprite:timeline:play': () => spriteReady() && spriteFrameCount(currentSprite())>1,
 'sprite:timeline:add': () => spriteReady() && spriteFrameCount(currentSprite())<4096,
 'sprite:timeline:duplicate': () => spriteReady() && spriteFrameCount(currentSprite())<4096,
 'sprite:timeline:delete': () => spriteReady() && spriteFrameCount(currentSprite())>1,
 'zoom:in': () => canZoomWorkspace(1),
 'zoom:out': () => canZoomWorkspace(-1),
 'zoom:reset': () => canZoomWorkspace(0),
};
const studioMenuChecks = {
 'sprite:mirrorX':()=>spriteWorkspace.mirrorX,
 'sprite:mirrorY':()=>spriteWorkspace.mirrorY,
 ...Object.fromEntries(Object.keys(spritePanelLabels).map(id=>['sprite:panel:'+id,()=>!spritePreferences.panels[id].hidden])),
};

function studioMenuMarkup(label, entries, index, workspace) {
 const items = entries.map(entry => {
  if (!entry) return '<div class="studio-menu-separator" role="separator"></div>';
  const [text, action, hint, id, view] = entry;
  const checked = studioMenuChecks[action];
  const role = view ? 'menuitemradio' : checked ? 'menuitemcheckbox' : 'menuitem';
  return `<button type="button" class="studio-menu-command" role="${role}" tabindex="-1"
   ${action ? 'data-menu-act="' + esc(action) + '"' : ''} ${id ? 'id="' + esc(id) + '"' : ''}
   ${view ? 'data-menu-view="' + esc(view) + '"' : ''} ${view || checked ? 'aria-checked="false"' : ''}>
   ${view || checked ? '<span class="studio-menu-check" aria-hidden="true">✓</span>' : ''}
   <span>${esc(text)}</span>${hint ? '<kbd>' + esc(hint) + '</kbd>' : ''}</button>`;
 }).join('');
 return `<div class="studio-menu-group" role="none" ${workspace ? 'data-menu-workspace="' + esc(workspace) + '" hidden' : ''}>
  <button type="button" class="studio-menu-trigger" role="menuitem" id="studio-menu-trigger-${index}" tabindex="-1"
   aria-haspopup="menu" aria-expanded="false" aria-controls="studio-menu-panel-${index}">${esc(label)}</button>
  <div class="studio-menu-panel" role="menu" id="studio-menu-panel-${index}"
   aria-labelledby="studio-menu-trigger-${index}" hidden>${items}</div></div>`;
}

function setupStudioMenu() {
 const bar = $('#studio-menu');
 const menus = [
  ['File',[['New Project…','new'],['Open Project…','open'],['Save Project','save','Ctrl+S'],null,['Export Game…',null,null,'export-open']]],
  ['Editor',[['Undo','undo','Ctrl+Z','undo'],['Redo','redo','Ctrl+Y','redo'],null,['Settings…',null,null,'settings-open']]],
  ['Project',[['Rename Project…','rename'],['Extensions…','extension:open'],null,['Load Demo…','demo']]],
  ['View',[...workspaceTabs.map(([id,label,action]) => [label,action,null,null,id]),null,
   ['Zoom In','zoom:in'],['Zoom Out','zoom:out'],['Reset Zoom','zoom:reset']]],
  ...Object.entries(studioWorkspaceCommands).flatMap(([workspace,list]) =>
   list.map(([label,entries]) => [label,entries,workspace])),
  ['Run',[['Preview','play','F5'],null,['Load Stress Test…','stress']]],
  ['Help',[['Expressions & Help','help']]],
 ];
 $('#studio-menu-groups').innerHTML = menus.map(([name,items,workspace],index) =>
  studioMenuMarkup(name,items,index,workspace)).join('');
 let expanded = null;
 const visibleTriggers = () => [...bar.querySelectorAll('.studio-menu-group:not([hidden]) > .studio-menu-trigger')];
 const panelOf = trigger => document.getElementById(trigger.getAttribute('aria-controls'));
 const commands = panel => [...panel.querySelectorAll('.studio-menu-command:not(:disabled)')];
 const selectTrigger = (trigger, focus = false) => {
  for (const entry of bar.querySelectorAll('.studio-menu-trigger')) entry.tabIndex = entry === trigger ? 0 : -1;
  if (focus) trigger.focus();
 };
 function close(focus = false) {
  if (!expanded) return;
  const trigger = expanded;
  expanded = null;
  panelOf(trigger).hidden = true;
  trigger.setAttribute('aria-expanded','false');
  if (focus) selectTrigger(trigger,true);
 }
 function open(trigger, last = false) {
  if (expanded !== trigger) close();
  const panel = panelOf(trigger);
  for (const item of panel.querySelectorAll('[data-menu-act]')) {
   const available = studioMenuAvailability[item.dataset.menuAct];
   if (available) item.disabled = !available();
  }
  expanded = trigger;
  panel.hidden = false;
  trigger.setAttribute('aria-expanded','true');
  selectTrigger(trigger);
  const available = commands(panel);
  (last ? available.at(-1) : available[0])?.focus();
 }
 function moveTrigger(origin, key) {
  const list = visibleTriggers();
  const index = list.indexOf(origin);
  const next = key === 'Home' ? list[0] : key === 'End' ? list.at(-1) :
   list[(index + (key === 'ArrowRight' ? 1 : -1) + list.length) % list.length];
  if (expanded) open(next);
  else selectTrigger(next,true);
 }
 bar.addEventListener('click',event => {
  const trigger = event.target.closest('.studio-menu-trigger');
  if (trigger) {
   if (expanded === trigger) close(true);
   else open(trigger);
   return;
  }
  const command = event.target.closest('.studio-menu-command');
  if (!command || command.disabled) return;
  const action = command.dataset.menuAct;
  close(Boolean(action));
  if (action) {
   if (action.startsWith('zoom:')) zoomWorkspace(action.slice(5));
   else act(action);
  }
 });
 bar.addEventListener('pointerover',event => {
  if (event.pointerType !== 'mouse') return;
  const trigger = event.target.closest('.studio-menu-trigger');
  if (expanded && trigger && trigger !== expanded) open(trigger);
  const item = event.target.closest('.studio-menu-command:not(:disabled)');
  if (item) item.focus();
 });
 bar.addEventListener('keydown',event => {
  const key = event.key, trigger = event.target.closest('.studio-menu-trigger');
  if (key === 'Tab') { close(true); return; }
  if (key === 'Delete') { event.preventDefault(); event.stopPropagation(); return; }
  if (key === 'Escape') {
   if (!expanded) return;
   close(true);
  } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
   if (!trigger && !expanded) return;
   moveTrigger(trigger || expanded,key);
  } else if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'Home' || key === 'End') {
   if (trigger) {
    if (key === 'Home' || key === 'End') moveTrigger(trigger,key);
    else open(trigger,key === 'ArrowUp');
   } else if (expanded) {
    const list = commands(panelOf(expanded)), index = list.indexOf(event.target);
    const next = key === 'Home' ? list[0] : key === 'End' ? list.at(-1) :
     list[(index + (key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
    next?.focus();
   }
  } else return;
  event.preventDefault();
  event.stopPropagation();
 });
 document.addEventListener('pointerdown',event => { if (!bar.contains(event.target)) close(); });
 document.addEventListener('focusin',event => { if (!bar.contains(event.target)) close(); });
 return () => {
  for (const group of bar.querySelectorAll('[data-menu-workspace]')) group.hidden = group.dataset.menuWorkspace !== tab;
  if (expanded?.parentElement.hidden) close();
  const visible = visibleTriggers();
  if (!visible.some(trigger => trigger.tabIndex === 0)) selectTrigger(visible[0]);
  for (const item of bar.querySelectorAll('[data-menu-view]')) item.setAttribute('aria-checked',String(item.dataset.menuView === tab));
  for (const item of bar.querySelectorAll('[role="menuitemcheckbox"]')) {
   item.setAttribute('aria-checked',String(studioMenuChecks[item.dataset.menuAct]()));
  }
 };
}
