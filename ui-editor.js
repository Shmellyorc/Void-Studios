const uiWorkspace = { project: null, screen: null, selection: new Set(), gesture: null, viewport:'layout' };
const currentUIScreen = () => P.uiScreens?.find(screen => screen.id === uiWorkspace.screen);
const selectedUIControls = () => (currentUIScreen()?.items ?? []).filter(item => uiWorkspace.selection.has(item.id));
const uiScreenOptions = (project = P) => (project.uiScreens ?? []).map(screen => [screen.id,screen.name]);
const uiControlOptions = (project = P) => (project.uiScreens ?? []).flatMap(screen => screen.items
 .filter(item => item.kind === 'button').map(item => [item.id,screen.name + ' · ' + (item.text || 'Button')]));
const uiSettingOptions = (project = P) => (project.uiScreens ?? []).flatMap(screen => screen.items
 .filter(isUISetting).map(item => [item.id,screen.name + ' · ' + (item.text || item.kind)]));
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
const uiViewportPresets = [['layout','Layout'],['narrow','Narrow (4:3)',4/3],['wide','Widescreen (16:9)',16/9],
 ['ultrawide','Ultrawide (21:9)',21/9],['portrait','Portrait (9:16)',9/16]];
const uiControlKinds = [['button','Button'],['label','Label'],['bar','Bar'],['slider','Slider'],['toggle','Toggle'],['dropdown','Dropdown']];
const uiLayoutModes = [['free','Free placement'],['column','Vertical stack'],['row','Horizontal stack']];
const uiCrossOptions = [['start','Start'],['center','Center'],['end','End'],['stretch','Stretch']];

function editorUIViewport() {
 const { width,height } = createSceneCamera(L()).view;
 const aspect = uiViewportPresets.find(([id]) => id === uiWorkspace.viewport)?.[2];
 return { width:aspect ? Math.round(height*aspect) : width, height };
}

function editorUILayout(viewport = editorUIViewport()) {
 return arrangeUI(currentUIScreen()?.items ?? [],viewport);
}

function uiBoundsGroup(boxes) {
 return boxes.reduce((a,b) => ({
  left:Math.min(a.left,b.left), top:Math.min(a.top,b.top),
  right:Math.max(a.right,b.right), bottom:Math.max(a.bottom,b.bottom),
 }));
}

function setUIPosition(item, box, frame, anchor = item.anchor) {
 const [x,y] = uiAnchors[anchor], w = box.right-box.left, h = box.bottom-box.top;
 Object.assign(item,{ anchor,x:box.left-frame.left-(frame.right-frame.left-w)*x,
  y:box.top-frame.top-(frame.bottom-frame.top-h)*y });
}

function offsetUIBounds(box, x, y) {
 return { left:box.left+x, right:box.right+x, top:box.top+y, bottom:box.bottom+y };
}

function uiSelectionRoots(model) {
 return model.ordered.filter(({ item,hidden,locked }) => {
  if (hidden || locked || !uiWorkspace.selection.has(item.id)) return false;
  for (let parent = model.byId.get(item.parent); parent; parent = model.byId.get(parent.item.parent)) {
   if (uiWorkspace.selection.has(parent.item.id)) return false;
  }
  return true;
 });
}

function canAlignUI(entries) {
 return entries.length && entries.every(({ item,stacked }) =>
  !stacked && (item.parent || '') === (entries[0].item.parent || ''));
}

function alignUIControls(command) {
 const entries = uiSelectionRoots(editorUILayout());
 if (!command || !canAlignUI(entries)) return;
 const group = uiBoundsGroup(entries.map(({box}) => box));
 const [target, alignment] = command.split(':');
 if (target === 'viewport' && Object.hasOwn(uiAnchors,alignment)) {
  const { frame } = entries[0];
  const [x,y] = uiAnchors[alignment];
  const dx = frame.left+(frame.right-frame.left-(group.right-group.left))*x-group.left;
  const dy = frame.top+(frame.bottom-frame.top-(group.bottom-group.top))*y-group.top;
  change(() => entries.forEach(({item,box}) => setUIPosition(item,offsetUIBounds(box,dx,dy),frame,alignment)));
 } else if (entries.length > 1 && target === 'selection' && Object.hasOwn(uiEdgeLabels,alignment)) {
  change(() => entries.forEach(({item,box,frame}) => {
   const x = ({ left:group.left-box.left, right:group.right-box.right,
    horizontal:(group.left+group.right-box.left-box.right)/2 })[alignment] ?? 0;
   const y = ({ top:group.top-box.top, bottom:group.bottom-box.bottom,
    vertical:(group.top+group.bottom-box.top-box.bottom)/2 })[alignment] ?? 0;
   setUIPosition(item,offsetUIBounds(box,x,y),frame);
  }));
 }
}

function uiAlignmentMenu(entries) {
 const options = (group,labels) => Object.entries(labels).map(([value,label]) =>
  `<option value="${group}:${value}">${label}</option>`).join('');
 return `<select id="ui-align" aria-label="Align selected controls" ${canAlignUI(entries) ? '' : 'disabled'}>
  <option value="">Align</option>
  <optgroup label="Place in ${entries[0]?.item.parent ? 'panel' : 'viewport'}">${options('viewport',uiAnchorLabels)}</optgroup>
  <optgroup label="Align within selection" ${entries.length > 1 ? '' : 'disabled'}>${options('selection',uiEdgeLabels)}</optgroup>
 </select>`;
}

function uiControlPreset(kind, text, props = {}) {
 return {
  id: uid(), kind, text, anchor: 'center', x: 0, y: 0, w: 180, h: 42, size: 17,
  color: '#e8f2f6', background: '#24465a',
  ...(kind === 'button' ? { order: 0, command: 'event', target: '' } : {}),
  ...(kind === 'bar' ? { variable: '', max: 100, background: '#3cb58f' } : {}),
  ...(kind === 'panel' ? { w:320,h:180,layout:'column',padding:12,gap:8,align:'stretch',fit:true,background:'#213548' } : {}),
  ...(uiSettingsKinds.includes(kind) ? { w:260,variable:'',order:0 } : {}),
  ...(kind === 'slider' ? { min:0,max:100,step:5 } : {}),
  ...(kind === 'dropdown' ? { options:['First','Second'] } : {}),
  ...props,
 };
}

function sizeUIWorkspace(stage, viewport) {
 const available = Math.max(1,stage.parentElement.clientHeight-60);
 const max = uiWorkspace.viewport === 'layout' ? 850 : Math.min(850,available*viewport.width/viewport.height);
 stage.style.setProperty('--ui-stage-width',max+'px');
 stage.style.setProperty('--void-ui-unit',stage.clientWidth/viewport.width+'px');
}

function paintUIWorkspace(viewport, model) {
 const stage = $('#ui-stage'), { width,height } = viewport;
 stage.style.aspectRatio = width + ' / ' + height;
 sizeUIWorkspace(stage,viewport);
 $('#ui-dimensions').textContent = width + ' × ' + height + ' viewport · Shift-click or drag a box to select';
 const screen = currentUIScreen();
 stage.classList.toggle('void-ui-paused',Boolean(screen?.pause));
 const vars = Object.fromEntries(P.globals.map(variable => [variable.name,variable.value]));
 const styles = new Map((P.uiStyles ?? []).map(style => [style.id,style]));
 const visible = model.ordered.filter(entry => !entry.hidden);
 stage.replaceChildren(...visible.map(({ item,box,locked }) => {
  const node = createUIControl(item,vars,styles.get(item.style));
  node.tabIndex = -1;
  if (item.kind === 'button') node.disabled = false;
  for (const control of node.querySelectorAll('input,select,button')) control.tabIndex = -1;
  positionUIBounds(node,box);
  node.classList.toggle('ui-editor-locked',locked);
  node.classList.toggle('ui-editor-selected',uiWorkspace.selection.has(item.id));
  return node;
 }));
 const items = visible.filter(({item}) => uiWorkspace.selection.has(item.id));
 if (!items.length) return;
 const frame = document.createElement('div');
 frame.className = 'ui-selection-frame' + (items.length > 1 ? ' ui-selection-group' : '');
 frame.setAttribute('aria-hidden','true');
 positionUIBounds(frame, uiBoundsGroup(items.map(({box}) => box)));
 if (items.length === 1 && !items[0].stacked) {
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

function uiHierarchyMarkup(model, entries) {
 const rows = model.ordered.map(({item,depth,locked,hidden}) => `<div class="ui-hierarchy-row
  ${uiWorkspace.selection.has(item.id) ? 'ui-hierarchy-selected' : ''} ${hidden || locked ? 'ui-hierarchy-muted' : ''}"
  style="--ui-depth:${Math.min(depth,8)}">
  <button type="button" class="ui-hierarchy-name" data-ui-pick="${esc(item.id)}" title="${esc(item.text || item.kind)}"
   ${locked || hidden ? 'disabled' : ''}>${esc(item.text || item.kind)} <small>${esc(item.kind)}</small></button>
  <button type="button" data-act="ui:hide:${esc(item.id)}" aria-label="${item.editorHidden ? 'Show' : 'Hide'} ${esc(item.text || item.kind)}"
   title="${item.editorHidden ? 'Show' : 'Hide'} in editor">${item.editorHidden ? '○' : '●'}</button>
  <button type="button" data-act="ui:lock:${esc(item.id)}" aria-label="${item.editorLocked ? 'Unlock' : 'Lock'} ${esc(item.text || item.kind)}"
   title="${item.editorLocked ? 'Unlock' : 'Lock'} in editor">${item.editorLocked ? '🔒' : '◇'}</button></div>`).join('');
 return rows + (entries.length ? `<div class="ui-hierarchy-tools">
  ${entries.length === 1 ? button('Up','ui:reorder:-1') + button('Down','ui:reorder:1') : ''}
  ${entries.length > 1 && canAlignUI(entries) ? button('Group','ui:group') : ''}</div>` : '');
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
 const viewport = editorUIViewport(), model = editorUILayout(viewport);
 for (const id of uiWorkspace.selection) {
  const entry = model.byId.get(id);
  if (!entry || entry.hidden || entry.locked) uiWorkspace.selection.delete(id);
 }
 const screen = currentUIScreen(), selection = selectedUIControls(), item = selection[0];
 const entries = uiSelectionRoots(model);
 $('#ui-layouts').innerHTML = P.layouts.map(layout =>
  `<button class="tree prefab-tree ${layout.id === L().id ? 'selected' : ''}" data-act="ui:layout:${esc(layout.id)}">${esc(layout.name)}</button>`).join('');
 $('#ui-screens').innerHTML = uiScreenOptions().map(([id,name]) =>
  `<button class="tree prefab-tree ${id === screen?.id ? 'selected' : ''}" data-act="ui:screen:${esc(id)}">${esc(name)}</button>`).join('');
 $('#ui-hierarchy').innerHTML = uiHierarchyMarkup(model,entries);
 $('#ui-tools').innerHTML = button('+ Screen','ui:newScreen','primary') + (screen ?
  button('+ Panel','ui:add:panel') + button('+ Button','ui:add:button') + button('+ Label','ui:add:label') +
  button('+ Bar','ui:add:bar') + select('Add setting','ui-add-setting','',[['','Choose…'],...uiControlKinds.filter(([id]) => uiSettingsKinds.includes(id))]) +
  uiAlignmentMenu(entries) : '') +
  '<div class="spacer"></div>' + select('Viewport','ui-viewport',uiWorkspace.viewport,uiViewportPresets) +
  button('Styles','ui:styles') + button('Input Actions','ui:inputs') + button('Load Menu Demo','ui:demo');
 $('#ui-empty').hidden = Boolean(screen);
 $('#ui-board').hidden = !screen;
 $('#ui-inspector').innerHTML = '<div class="panelhead">UI PROPERTIES</div><div class="prop-group">' +
  select('Starting UI in ' + L().name,'ui-start',L().uiScreen ?? '',uiStartOptions()) + '</div>' +
  (screen ? '<div class="prop-group"><h4>SCREEN</h4>' +
   field('Name','ui-screen.name',screen.name) + checkbox('Pause gameplay','ui-screen.pause',screen.pause) +
   checkbox('Keyboard and controller navigation','ui-screen.navigation',screen.navigation !== false) +
   button('Delete screen','ui:deleteScreen','danger ghost') + '</div>' : '') +
  (selection.length === 1 ? uiInspectorControl(item,model) : selection.length > 1 ? `<div class="prop-group">
   <h4>${selection.length} CONTROLS SELECTED</h4>${uiSelectionActions(' selection')}</div>` : '');
 paintUIWorkspace(viewport,model);
}

function uiParents(item,model) {
 return [['','Screen root'],...model.ordered.filter(({item:panel}) => {
  if (panel.kind !== 'panel' || panel === item) return false;
  for (let parent = panel.parent; parent; parent = model.byId.get(parent)?.item.parent) if (parent === item.id) return false;
  return true;
 }).map(({item:panel,depth}) => [panel.id,' '.repeat(depth*2)+panel.text])];
}

function uiInspectorControl(item,model) {
 const fieldFor = (label,key,type) => field(label,'ui-item.'+key,item[key],type);
 const checkFor = (label,key) => checkbox(label,'ui-item.'+key,item[key]);
 const target = item.command === 'layout' ? select('Layout','ui-item.target',item.target,P.layouts.map(layout => [layout.id,layout.name])) :
  item.command === 'show' ? select('Screen','ui-item.target',item.target,uiStartOptions()) : '';
 const stacked = model.byId.get(item.id).stacked;
 const panel = item.kind === 'panel';
 const fields = [...(stacked ? [] : [['Offset X','x'],['Offset Y','y']]),['Width','w'],['Height','h']];
 const globals = [['','Choose a global variable'],...P.globals.map(variable => [variable.name,variable.name])];
 const style = !panel ? select('Shared style','ui-item.style',item.style ?? '',[['','Custom'],...(P.uiStyles ?? []).map(style => [style.id,style.name])]) : '';
 return '<div class="prop-group"><h4>' + item.kind.toUpperCase() + '</h4>' + fieldFor(panel ? 'Name' : 'Text','text') +
  select('Parent panel','ui-item.parent',item.parent ?? '',uiParents(item,model)) + style +
  (stacked ? '<p class="muted">Positioned by parent stack.</p>' : select('Anchor','ui-item.anchor',item.anchor,Object.entries(uiAnchorLabels))) +
  '<div class="two">' + fields.map(([label,key]) => fieldFor(label,key,'number')).join('') +
  (!panel && !item.style ? fieldFor('Font size','size','number') + fieldFor('Text color','color','color') : '') +
  (!item.style && item.kind !== 'label' ? fieldFor('Fill color','background','color') : '') + '</div>' +
  (isUIInteractive(item) ? fieldFor('Focus order','order','number') + checkFor('Disabled','disabled') : '') +
  (item.kind === 'button' ? select('When activated','ui-item.command',item.command,
   [['event','Trigger visual event'],['layout','Go to layout'],['restart','Restart layout'],['show','Show UI screen'],['restore','Restore layout UI']]) + target :
   item.kind === 'bar' ? select('Value','ui-item.variable',item.variable,globals) + fieldFor('Maximum','max','number') :
   panel ? select('Layout','ui-item.layout',item.layout,uiLayoutModes) +
    (item.layout === 'free' ? '' : select('Cross-axis alignment','ui-item.align',item.align,uiCrossOptions) + fieldFor('Gap','gap','number')) +
    fieldFor('Padding','padding','number') + checkFor('Fit available width','fit') + checkFor('Transparent','transparent') :
   isUISetting(item) ? select('Value','ui-item.variable',item.variable,globals) +
    (item.kind === 'slider' ? ['min','max','step'].map(key => fieldFor(({min:'Minimum',max:'Maximum',step:'Step'})[key],key,'number')).join('') :
     item.kind === 'dropdown' ? `<label>Choices (one per line)<textarea data-field="ui-item.options" rows="4">${esc(item.options.join('\n'))}</textarea></label>` : '') : '') +
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

function uiStyleDefaults(name = 'Menu Style') {
 return { id:uid(),name,font:'system',size:16,color:'#edf6fd',background:'#25475b',
  hover:'#34617a',pressed:'#1b3545',focus:'#b8ffdf',disabled:'#4c5763' };
}

function showUIStyles() {
 dialog('Shared UI Styles',button('+ New Style','ui:editStyle','primary') +
  (P.uiStyles ?? []).map(style => `<div class="prop-group">
   <h4>${esc(style.name)}</h4>${button('Edit','ui:editStyle:'+style.id)}${button('Delete','ui:deleteStyle:'+style.id,'danger ghost')}</div>`).join(''),() => {},'Close');
}

function editUIStyle(id) {
 $('#dialog').close();
 const original = (P.uiStyles ?? []).find(style => style.id === id), style = clone(original ?? uiStyleDefaults());
 const labels = { color:'Text',background:'Normal',hover:'Hover',pressed:'Pressed',focus:'Focus outline',disabled:'Disabled' };
 simple(original ? 'Edit UI Style' : 'New UI Style',field('Style name','name',style.name) +
  select('Font','font',style.font,[['system','System'],['serif','Serif'],['mono','Monospace']]) +
  field('Font size','size',style.size,'number') +
  uiStyleColors.map(key => field(labels[key],key,style[key],'color')).join(''),values => {
   const name = values.name.trim().slice(0,100), size = Number(values.size);
   if (!name || !Number.isFinite(size) || size <= 0) throw Error('Enter a style name and positive font size');
   change(() => {
    const next = { ...style,...values,name,size };
    if (original) Object.assign(original,next);
    else (P.uiStyles ??= []).push(next);
   });
  });
}

function uiSelectionTree(model) {
 const roots = new Set(uiSelectionRoots(model).map(({item}) => item.id));
 return model.ordered.filter(({ item }) => {
  for (let entry = model.byId.get(item.id); entry; entry = model.byId.get(entry.item.parent)) if (roots.has(entry.item.id)) return true;
  return false;
 });
}

function studioUIAction(action, value) {
 const screen = currentUIScreen(), selection = selectedUIControls();
 if (action === 'inputs') return showInputActions();
 if (action === 'editInput') return editInputAction(value);
 if (action === 'styles') return showUIStyles();
 if (action === 'editStyle') return editUIStyle(value);
 if (action === 'deleteStyle') {
  if (!confirm('Delete this shared UI style? Controls will use their custom appearance.')) return;
  $('#dialog').close();
  change(() => {
   P.uiStyles = P.uiStyles.filter(style => style.id !== value);
   for (const screen of P.uiScreens) for (const item of screen.items) if (item.style === value) delete item.style;
  });
  return showUIStyles();
 }
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
  const next = uiControlPreset(value,value === 'bar' ? '' : value === 'panel' ? 'Panel' : uiControlKinds.find(([kind]) => kind === value)?.[1] || 'Control');
  const owner = selection.length === 1 ? selection[0] : null;
  next.parent = owner?.kind === 'panel' ? owner.id : owner?.parent ?? '';
  if (isUIInteractive(next)) next.order = screen.items.filter(isUIInteractive).length;
  if (value === 'bar') next.variable = P.globals[0]?.name ?? '';
  screen.items.push(next);
  uiWorkspace.selection = new Set([next.id]);
 }); break;
 case 'hide':
 case 'lock': {
  const item = screen.items.find(item => item.id === value), key = action === 'hide' ? 'editorHidden' : 'editorLocked';
  if (item) change(() => { item[key] = !item[key]; });
  break;
 }
 case 'reorder': {
  const item = selection.length === 1 && selection[0];
  if (!item) break;
  const siblings = screen.items.filter(other => (other.parent || '') === (item.parent || ''));
  const sibling = siblings[siblings.indexOf(item)+Number(value)];
  if (sibling) change(() => {
   const a = screen.items.indexOf(item), b = screen.items.indexOf(sibling);
   [screen.items[a],screen.items[b]] = [screen.items[b],screen.items[a]];
  });
  break;
 }
 case 'group': {
  const entries = uiSelectionRoots(editorUILayout());
  if (entries.length < 2 || !canAlignUI(entries)) break;
  const bounds = uiBoundsGroup(entries.map(({box}) => box)), {item:first,frame} = entries[0];
  change(() => {
   const panel = uiControlPreset('panel','Group',{ parent:first.parent ?? '',layout:'free',padding:0,
    fit:false,transparent:true,w:bounds.right-bounds.left,h:bounds.bottom-bounds.top });
   setUIPosition(panel,bounds,frame);
   screen.items.splice(screen.items.indexOf(first),0,panel);
   for (const {item,box} of entries) {
    item.parent = panel.id;
    setUIPosition(item,box,bounds);
   }
   uiWorkspace.selection = new Set([panel.id]);
  });
  break;
 }
 case 'duplicate': if (selection.length) change(() => {
  const model = editorUILayout(), tree = uiSelectionTree(model);
  const ids = new Map(tree.map(({item}) => [item.id,uid()]));
  const copies = tree.map(({item}) => {
   const parentCopy = ids.get(item.parent);
   return { ...clone(item),id:ids.get(item.id),parent:parentCopy ?? item.parent ?? '',
    x:item.x+(parentCopy ? 0 : 16),y:item.y+(parentCopy ? 0 : 16) };
  });
  screen.items.push(...copies);
  uiWorkspace.selection = new Set(uiSelectionRoots(model).map(({item}) => ids.get(item.id)));
 }); break;
 case 'deleteItem': if (selection.length) change(() => {
  const deleted = new Set(uiSelectionTree(editorUILayout()).map(({item}) => item.id));
  screen.items = screen.items.filter(item => !deleted.has(item.id));
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
  const viewport = editorUIViewport(), start = point(event,viewport), model = editorUILayout(viewport);
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
  const items = uiSelectionRoots(model);
  if ((id || direction) && !items.length) return;
  if ((id || direction) && items.some(entry => entry.stacked)) return renderUIWorkspace();
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
  for (const { item,box,frame } of gesture.items) {
   const next = gesture.mode === 'resize' ? resizeUIBounds(box,gesture.direction,dx,dy) : offsetUIBounds(box,dx,dy);
   setUIPosition(item,next,frame);
   if (gesture.mode === 'resize') {
    if (uiResizeHandles[gesture.direction][0]) item.w = next.right-next.left;
    if (uiResizeHandles[gesture.direction][1]) item.h = next.bottom-next.top;
   }
  }
  const { byId,ordered } = editorUILayout(gesture.viewport);
  for (const control of stage.querySelectorAll('[data-ui-control]')) {
   positionUIBounds(control,byId.get(control.dataset.uiControl).box);
  }
  const bounds = ordered.filter(entry => uiWorkspace.selection.has(entry.item.id)).map(entry => entry.box);
  positionUIBounds(stage.querySelector('.ui-selection-frame'),uiBoundsGroup(bounds));
 });
 for (const name of ['pointerup','pointercancel','lostpointercapture']) stage.addEventListener(name,event => {
  const gesture = uiWorkspace.gesture;
  if (gesture?.pointer !== event.pointerId) return;
  uiWorkspace.gesture = null;
  if (name === 'pointerup') {
   if (gesture.mode === 'box' && gesture.box) {
    for (const {item,box:itemBox,hidden,locked} of editorUILayout(gesture.viewport).ordered) {
     if (hidden || locked) continue;
     const box = gesture.box;
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
 const observer = new ResizeObserver(() => { if (tab === 'ui') sizeUIWorkspace(stage,editorUIViewport()); });
 observer.observe(stage);
 observer.observe(stage.parentElement);
 $('#ui-hierarchy').addEventListener('click',event => {
  const button = event.target.closest('[data-ui-pick]');
  if (!button || button.disabled) return;
  const id = button.dataset.uiPick;
  if (!event.shiftKey) uiWorkspace.selection = new Set([id]);
  else if (uiWorkspace.selection.has(id)) uiWorkspace.selection.delete(id);
  else uiWorkspace.selection.add(id);
  renderUIWorkspace();
  $('#ui-hierarchy [data-ui-pick="' + id + '"]')?.focus();
 });
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
  let value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? input.valueAsNumber : input.value;
  if (input.type === 'number' && !Number.isFinite(value)) return renderUIWorkspace();
  if (['w','h','size'].includes(key) || key === 'max' && item.kind === 'bar') value = Math.max(1,value);
  if (['gap','padding'].includes(key)) value = Math.max(0,value);
  if (item.kind === 'slider' && (key === 'min' && value >= item.max || key === 'max' && value <= item.min || key === 'step' && value <= 0)) {
   alert('The maximum must exceed the minimum, and step must be positive.');
   return renderUIWorkspace();
  }
  if (key === 'options') {
   value = [...new Set(input.value.split(/\r?\n/).map(option => option.trim().slice(0,100)).filter(Boolean))];
   if (!value.length) { alert('Enter at least one choice.'); return renderUIWorkspace(); }
  }
  if (key === 'parent') {
   const viewport = editorUIViewport(), model = editorUILayout(viewport);
   if (!uiParents(item,model).some(([id]) => id === value)) return;
   const parent = model.byId.get(value), box = model.byId.get(item.id).box;
   return change(() => {
    item.parent = value;
    item.w = box.right-box.left;
    item.h = box.bottom-box.top;
    setUIPosition(item,box,parent ? uiPanelContent(parent.item,parent.box) : emptyUIFrame(viewport));
   });
  }
  change(() => {
   item[key] = value;
   if (key === 'command') item.target = value === 'layout' ? L().id : '';
  });
 });
 $('#ui-tools').addEventListener('change',event => {
  const {id,value} = event.target;
  if (id === 'ui-align') { alignUIControls(value); $('#ui-align')?.focus(); }
  if (event.target.dataset.field === 'ui-add-setting' && uiSettingsKinds.includes(value)) studioUIAction('add',value);
  if (event.target.dataset.field === 'ui-viewport') {
   uiWorkspace.viewport = value;
   renderUIWorkspace();
   $('#ui-tools [data-field="ui-viewport"]')?.focus();
  }
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
 const optionStyle = uiStyleDefaults('Options controls');
 const panel = uiControlPreset('panel','Options panel',{w:400,h:252,padding:16,gap:8});
 const option = (kind,text,props) => uiControlPreset(kind,text,{ parent:panel.id,h:36,style:optionStyle.id,...props });
 const volume = option('slider','Volume',{variable:'Volume',order:0});
 const fullscreen = option('toggle','Fullscreen',{variable:'Fullscreen',order:1});
 const tone = option('dropdown','Test tone',{variable:'Tone',options:['Low','High'],order:2});
 project.uiStyles = [optionStyle];
 project.globals.push({name:'Volume',value:75},{name:'Fullscreen',value:false},{name:'Tone',value:'Low'});
 title.events.push(
  event([block('start')],[block('audioVolume',{value:'Volume'})]),
  event([block('uiChanged',{control:volume.id})],[block('audioVolume',{value:'Volume'})]),
  event([block('uiChanged',{control:fullscreen.id})],[block('fullscreen',{name:'Fullscreen'})]),
  event([block('uiChanged',{control:tone.id})],[block('sound',{frequency:'300 + 420 * (Tone == "High")',duration:'0.15'})])
 );
 project.uiScreens = [
  { id:'title-menu',name:'Main Menu',items:[
   label('Shard Runner',-100,42),
   label('Collect the shards and reach the gate.',-54,17),
   buttonAt('Play',12,'layout','arena',0),
   buttonAt('Controls',66,'show','controls-menu',1),
   buttonAt('Options',120,'show','options-menu',2),
  ] },
  { id:'controls-menu',name:'Controls',items:[
   label('Controls',-100,38),
   label('Move with the arrow keys or D-pad.',-38,18),
   label('Pause with Escape or Start.',-4,18),
   buttonAt('Back',62,'show','title-menu',0),
  ] },
  { id:'options-menu',name:'Options',items:[panel,
   option('label','Options',{h:40,style:'',size:30}),volume,fullscreen,tone,
   option('button','Back',{order:3,command:'restore'}),
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
