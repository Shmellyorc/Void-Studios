const workspaceTabs = [
 ['layout','Layout','layouttab'], ['events','Event Sheet','eventtab'], ['tiles','Tilemap','tiletab'],
 ['animate','Animator','animtab'], ['ui','UI','uitab'],
];
const studioWorkspaceCommands = {
 layout: [
  ['Layout',[['Add Layout…','addLayout'],['Camera Settings…','cameraSettings']]],
  ['Objects',[['Add Object Type…','addType'],['Place Instance','place'],['Create Prefab…','prefab:create']]],
 ],
 events: [
  ['Event Sheet',[['Add Event','addevent'],['Generated JavaScript…','sheetJS']]],
  ['Input',[['Input Actions…','ui:inputs']]],
 ],
 tiles: [
  ['Tilemap',[['Map Settings…','tile:settings'],['Import Tileset…','tile:import'],['Load Sample Tileset','tile:sample']]],
  ['Layers',[['Add Layer…','tile:addLayer'],['Duplicate Layer…','tile:duplicate'],null,
   ['Raise Layer','tile:raise'],['Lower Layer','tile:lower'],['Delete Layer…','tile:deleteLayer']]],
 ],
 animate: [
  ['Animator',[['Import Sprite Sheet…','anim:import'],['Slice Sprite Sheet…','anim:slice']]],
  ['Clips',[['New Clip…','anim:new'],['Clip Settings…','anim:clipSettings'],['Duplicate Clip…','anim:duplicate'],null,
   ['Play / Pause Clip','anim:play'],['Rewind Clip','anim:rewind']]],
 ],
 ui: [
  ['UI',[['New Screen…','ui:newScreen'],['Add Button','ui:add:button'],['Add Label','ui:add:label'],
   ['Add Bar','ui:add:bar'],null,['Load Menu Demo…','ui:demo']]],
  ['Input',[['Input Actions…','ui:inputs']]],
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
 'zoom:in': () => canZoomWorkspace(1),
 'zoom:out': () => canZoomWorkspace(-1),
 'zoom:reset': () => canZoomWorkspace(0),
};

function studioMenuMarkup(label, entries, index, workspace) {
 const items = entries.map(entry => {
  if (!entry) return '<div class="studio-menu-separator" role="separator"></div>';
  const [text, action, hint, id, view] = entry;
  return `<button type="button" class="studio-menu-command" role="${view ? 'menuitemradio' : 'menuitem'}" tabindex="-1"
   ${action ? 'data-menu-act="' + esc(action) + '"' : ''} ${id ? 'id="' + esc(id) + '"' : ''}
   ${view ? 'data-menu-view="' + esc(view) + '" aria-checked="false"' : ''}>
   ${view ? '<span class="studio-menu-check" aria-hidden="true">✓</span>' : ''}
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
 };
}
