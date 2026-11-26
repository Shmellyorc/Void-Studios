const projectBranches = {
 scenes: ['Scenes','▧'], screens: ['UI Screens','▤'], sheets: ['Event Sheets','⌘'],
 objects: ['Objects','◇'], prefabs: ['Prefabs','◈'], assets: ['Assets','▣'],
 globals: ['Global Variables','𝑥'],
};

const projectPanel = {
 project:null, selected:null, expanded:new Set(), items:new Map(), dragged:null, markup:'',
};

function projectItems(project) {
 const items = [];
 const add = (kind, branch, collection, name = item => item.name) => {
  for (const data of collection ?? []) {
   const key = kind + ':' + (kind === 'global' ? data.name : data.id);
   items.push({ key, kind, branch, data, name:name(data) });
  }
 };
 add('scene','scenes',project.layouts);
 add('screen','screens',project.uiScreens);
 add('layout-sheet','sheets',project.layouts,layout => layout.name + ' · Scene');
 add('shared','sheets',project.eventSheets);
 add('behavior','sheets',project.behaviorSheets,sheet => sheet.name + ' · Behavior');
 add('object','objects',project.types);
 add('prefab','prefabs',project.prefabs);
 add('sprite','assets',project.spriteDocuments);
 add('image','assets',project.types.filter(type => type.image && !type.spriteDocument),type => type.name + ' · Image');
 add('tileset','assets',project.tilesets);
 add('audio','assets',project.audioClips);
 add('global','globals',project.globals);
 return items;
}

// Project folders organize references to existing items. IDs and runtime order stay with their original collections.
function projectDirectoryPath(key, folders) {
 const path = [], seen = new Set();
 while (!Object.hasOwn(projectBranches,key)) {
  const folder = folders.get(key);
  if (!folder || seen.has(key)) return null;
  seen.add(key);
  path.push(folder);
  key = folder.parent;
 }
 return { branch:key, folders:path.reverse() };
}

function projectFolderMap(project = P) {
 return new Map((project.projectTree?.folders ?? []).map(folder => [folder.id,folder]));
}

function normalizeProjectTree(project) {
 const tree = project.projectTree;
 if (!isRecord(tree)) {
  delete project.projectTree;
  return project;
 }
 const folders = new Map();
 for (const folder of Array.isArray(tree.folders) ? tree.folders : []) {
  if (folder && typeof folder.id === 'string' && /^folder:[\w-]+$/.test(folder.id) && typeof folder.name === 'string' && folder.name.trim() &&
      typeof folder.parent === 'string' && !folders.has(folder.id)) {
   folders.set(folder.id,{ id:folder.id, name:folder.name.trim().slice(0,100), parent:folder.parent });
  }
 }
 const valid = [...folders.values()].filter(folder => projectDirectoryPath(folder.id,folders));
 const locations = {};
 if (isRecord(tree.locations)) {
  for (const item of projectItems(project)) {
   const key = tree.locations[item.key];
   if (typeof key === 'string' && projectDirectoryPath(key,folders)?.branch === item.branch && folders.has(key)) {
    locations[item.key] = key;
   }
  }
 }
 project.projectTree = { folders:valid, locations };
 return project;
}

function currentProjectItemKey() {
 if (tab === 'layout') {
  if (componentSelection.prefab) return 'prefab:' + componentSelection.prefab;
  return 'scene:' + L().id;
 }
 if (tab === 'events') {
  const source = editorEventSheet();
  return (source.kind === 'layout' ? 'layout-sheet' : source.kind) + ':' + source.id;
 }
 if (tab === 'ui') return 'screen:' + currentUIScreen()?.id;
 if (tab === 'animate') return 'object:' + activeType;
 if (tab === 'tiles') return 'tileset:' + tileWorkspace.atlas;
 if (tab === 'sprite') return 'sprite:' + currentSprite()?.id;
 if (tab === 'audio') return 'audio:' + selectedAudioClip()?.id;
}

function projectTreeSelection() {
 const root = $('#project-tree'), current = currentProjectItemKey();
 root.querySelectorAll('[data-project-key]').forEach(row => {
  row.classList.toggle('project-selected',row.dataset.projectKey === projectPanel.selected);
  if (row.dataset.projectKey === current) row.setAttribute('aria-current','true');
  else row.removeAttribute('aria-current');
  if (!row.hasAttribute('aria-expanded')) row.setAttribute('aria-pressed',String(row.dataset.projectKey === projectPanel.selected));
 });
}

function renderProjectPanel() {
 if (projectPanel.project !== P) {
  Object.assign(projectPanel,{ project:P, selected:null, expanded:new Set(['scenes','objects']), dragged:null });
 }
 const root = $('#project-tree'), folders = projectFolderMap(), children = new Map();
 const items = projectItems(P);
 projectPanel.items = new Map(items.map(item => [item.key,item]));
 const append = (parent, entry) => {
  if (!children.has(parent)) children.set(parent,[]);
  children.get(parent).push(entry);
 };
 for (const folder of folders.values()) append(folder.parent,{ key:folder.id,name:folder.name,directory:true });
 for (const item of items) {
  const folder = P.projectTree?.locations[item.key];
  append(folders.has(folder) ? folder : item.branch,item);
 }
 if (projectPanel.selected && !projectPanel.items.has(projectPanel.selected) &&
     !folders.has(projectPanel.selected) && !Object.hasOwn(projectBranches,projectPanel.selected)) projectPanel.selected = null;
 const icons = { scene:'▧', screen:'▤', 'layout-sheet':'⌘', shared:'⌘', behavior:'⌘', object:'◇',
  prefab:'◈', sprite:'▣', image:'▣', tileset:'▦', audio:'♫', global:'𝑥' };
 let html = '';
 const stack = Object.entries(projectBranches).map(([key,[name,icon]]) => ({ key,name,icon,directory:true,depth:0 })).reverse();
 while (stack.length) {
  const { key,name,icon,kind,directory,depth,data } = stack.pop();
  const expanded = directory && projectPanel.expanded.has(key);
  const safeKey = esc(key), displayName = esc(name);
  html += `<button type="button" class="project-row ${directory ? 'project-directory' : 'project-item'}"
   data-project-key="${safeKey}" style="--project-depth:${Math.min(10,depth)}"
   ${depth > 0 ? 'draggable="true"' : ''} ${directory ? 'aria-expanded="' + expanded + '"' : ''}
   title="${displayName}"><span class="project-chevron" aria-hidden="true">${directory ? expanded ? '▾' : '▸' : ''}</span>
   <span class="project-icon" aria-hidden="true">${kind === 'object' ? `<i class="swatch" style="background:${esc(data.color)}"></i>` : icon ?? icons[kind] ?? '▱'}</span>
   <span class="project-name">${displayName}</span></button>`;
  if (expanded) {
   const entries = children.get(key) ?? [];
   for (let index = entries.length - 1; index >= 0; index--) stack.push({ ...entries[index],depth:depth+1 });
  }
 }
 if (projectPanel.markup !== html) {
  const focus = root.contains(document.activeElement) ? document.activeElement.dataset.projectKey : null;
  root.innerHTML = html;
  projectPanel.markup = html;
  if (focus) [...root.querySelectorAll('[data-project-key]')].find(row => row.dataset.projectKey === focus)?.focus({ preventScroll:true });
 }
 projectTreeSelection();
}

function revealProjectItem(key, parent) {
 const path = projectDirectoryPath(parent,projectFolderMap());
 if (path) {
  projectPanel.expanded.add(path.branch);
  for (const folder of path.folders) projectPanel.expanded.add(folder.id);
 }
 projectPanel.selected = key;
}

function openProjectItem(item) {
 const { kind,data } = item;
 switch (kind) {
  case 'scene':
   P.activeLayout = data.id;
   clearComponentSelection();
   selected = null;
   tab = 'layout';
   break;
  case 'layout-sheet':
   P.activeLayout = data.id;
   clearComponentSelection();
   selected = openSheetId = null;
   eventWorkspace.focus = 'layout:' + data.id;
   tab = 'events';
   break;
  case 'shared': return eventWorkspaceAction('open',data.id);
  case 'behavior': openBehaviorSheet(data.id); break;
  case 'screen':
   Object.assign(uiWorkspace,{ project:P, screen:data.id, gesture:null });
   uiWorkspace.selection.clear();
   tab = 'ui';
   break;
  case 'object':
   clearComponentSelection();
   activeType = data.id;
   selected = null;
   tab = 'layout';
   break;
  case 'prefab':
   prefabAction('select',data.id);
   return editPrefab(data);
  case 'sprite': selectSpriteDocument(data); tab = 'sprite'; break;
  case 'image': return editObjectSprite(data);
  case 'tileset':
   Object.assign(tileWorkspace,{ atlas:data.id,column:0,row:0 });
   tab = 'tiles';
   break;
  case 'audio':
   haltAudioAudition(true);
   if (audioWorkspace.project !== P) Object.assign(audioWorkspace,{ status:'',error:false });
   Object.assign(audioWorkspace,{ project:P,clip:data.id });
   tab = 'audio';
   break;
  case 'global': return editProjectGlobal(data);
 }
 render();
}

function editProjectGlobal(variable) {
 dialog('Global Variable',field('Name','global-name',variable.name) +
  field('Initial value (JSON)','global-value',JSON.stringify(variable.value)) +
  '<button type="button" class="danger ghost" id="project-remove-variable">Delete variable</button>',() => {
  const value = JSON.parse($('[data-field="global-value"]').value);
  change(() => { variable.value = value; });
 });
 $('[data-field="global-name"]').readOnly = true;
 $('#project-remove-variable').onclick = () => {
  if (!confirm('Delete ' + variable.name + '?')) return;
  $('#dialog').close();
  change(() => {
   P.globals = P.globals.filter(item => item !== variable);
   if (P.projectTree) delete P.projectTree.locations['global:' + variable.name];
  });
 };
}

function projectFolderOptions(branch, excluded, folders = projectFolderMap()) {
 const options = Object.entries(projectBranches).filter(([key]) => !branch || key === branch)
  .map(([key,[label]]) => [key,label]);
 const paths = [];
 for (const folder of folders.values()) {
  const path = projectDirectoryPath(folder.id,folders);
  if (path && (!branch || path.branch === branch) && !path.folders.some(item => item.id === excluded)) {
   paths.push([folder.id,[projectBranches[path.branch][0],...path.folders.map(item => item.name)].join(' / ')]);
  }
 }
 return options.concat(paths.sort((a,b) => a[1].localeCompare(b[1])));
}

function editProjectFolder(folder) {
 const folders = projectFolderMap(), selected = projectPanel.selected;
 const parent = folders.has(selected) || Object.hasOwn(projectBranches,selected)
  ? selected : P.projectTree?.locations[selected] ?? projectPanel.items.get(selected)?.branch ?? 'scenes';
 simple(folder ? 'Rename Folder' : 'New Folder',
  field('Name','name',folder?.name ?? '') + (folder ? '' : select('Inside','parent',parent,projectFolderOptions())),values => {
   const name = values.name.trim().slice(0,100), target = folder?.parent ?? values.parent;
   if (!name || [...folders.values()].some(item => item !== folder && item.parent === target && item.name.toLowerCase() === name.toLowerCase())) {
    throw Error('Enter a unique folder name for this location');
   }
   change(() => {
    if (folder) folder.name = name;
    else {
     const next = { id:'folder:' + uid(),name,parent:target };
     (P.projectTree ??= { folders:[],locations:{} }).folders.push(next);
     revealProjectItem(next.id,target);
     projectPanel.expanded.add(next.id);
    }
   });
 });
}

function projectMoveDestination(key, parent) {
 const folders = projectFolderMap();
 const source = folders.has(key) ? projectDirectoryPath(key,folders)?.branch : projectPanel.items.get(key)?.branch;
 const target = projectDirectoryPath(parent,folders);
 if (!source || target?.branch !== source || target.folders.some(folder => folder.id === key)) return false;
 return (folders.get(key)?.parent ?? P.projectTree?.locations[key] ?? source) !== parent;
}

function moveProjectItem(key, parent) {
 if (!projectMoveDestination(key,parent)) return;
 change(() => {
  const tree = P.projectTree ??= { folders:[],locations:{} };
  const folder = tree.folders.find(item => item.id === key);
  if (folder) folder.parent = parent;
  else if (Object.hasOwn(projectBranches,parent)) delete tree.locations[key];
  else tree.locations[key] = parent;
  revealProjectItem(key,parent);
 });
}

function deleteProjectFolder(folder) {
 if (!confirm('Remove “' + folder.name + '” and move its contents to the parent folder?')) return;
 change(() => {
  const tree = P.projectTree;
  for (const child of tree.folders) if (child.parent === folder.id) child.parent = folder.parent;
  for (const [key,parent] of Object.entries(tree.locations)) {
   if (parent !== folder.id) continue;
   if (Object.hasOwn(projectBranches,folder.parent)) delete tree.locations[key];
   else tree.locations[key] = folder.parent;
  }
  tree.folders = tree.folders.filter(item => item !== folder);
  projectPanel.expanded.delete(folder.id);
  revealProjectItem(folder.parent,folder.parent);
 });
}

function setupProjectPanel() {
 const panel = $('#project-sidebar'), root = $('#project-tree'), menu = $('#project-menu'), add = $('#project-new');
 let menuAnchor = add;
 const rowFor = event => event.target.closest('[data-project-key]');
 const menuIsOpen = () => menu.matches(':popover-open');
 const openMenu = (x,y,anchor) => {
  menuAnchor = anchor;
  const folder = projectFolderMap().has(projectPanel.selected), item = projectPanel.items.has(projectPanel.selected);
  $('#project-item-commands').hidden = !(folder || item);
  menu.querySelector('[data-project-command="move"]').hidden = !(folder || item);
  menu.querySelector('[data-project-command="rename"]').hidden = !folder;
  menu.querySelector('[data-project-command="delete"]').hidden = !folder;
  if (!menuIsOpen()) menu.showPopover();
  menu.style.left = Math.max(8,Math.min(x,window.innerWidth-menu.offsetWidth-8)) + 'px';
  menu.style.top = Math.max(8,Math.min(y,window.innerHeight-menu.offsetHeight-8)) + 'px';
 };
 add.addEventListener('click',() => {
  if (menuIsOpen()) return menu.hidePopover();
  const anchor = add.getBoundingClientRect();
  openMenu(panel.getBoundingClientRect().left+6,anchor.bottom+4,add);
 });
 menu.addEventListener('toggle',() => add.setAttribute('aria-expanded',String(menuIsOpen())));
 // Keep the menu open through the release of the button that opened it.
 document.addEventListener('pointerdown',event => {
  if (menuIsOpen() && !menu.contains(event.target) && !add.contains(event.target) &&
      (event.button === 0 || !panel.contains(event.target))) menu.hidePopover();
 });
 document.addEventListener('keydown',event => {
  if (event.key !== 'Escape' || !menuIsOpen()) return;
  event.preventDefault();
  menu.hidePopover();
  (menuAnchor.isConnected ? menuAnchor : add).focus();
 });
 root.addEventListener('click',event => {
  const row = rowFor(event);
  if (!row) return;
  const key = row.dataset.projectKey, item = projectPanel.items.get(key);
  projectPanel.selected = key;
  if (row.hasAttribute('aria-expanded')) {
   if (projectPanel.expanded.has(key)) projectPanel.expanded.delete(key);
   else projectPanel.expanded.add(key);
   renderProjectPanel();
  } else if (item.kind === 'object' && (tab === 'layout' || tab === 'animate')) {
   clearComponentSelection();
   activeType = item.data.id;
   selected = null;
   render();
  } else if (item.kind === 'prefab' && tab === 'layout') {
   selectPrefab(item.data.id);
   render();
  } else projectTreeSelection();
 });
 const open = event => {
  const item = projectPanel.items.get(rowFor(event)?.dataset.projectKey);
  if (!item) return;
  event.preventDefault();
  projectPanel.selected = item.key;
  openProjectItem(item);
 };
 root.addEventListener('dblclick',open);
 root.addEventListener('keydown',event => { if (event.key === 'Enter') open(event); });
 panel.addEventListener('contextmenu',event => {
  event.preventDefault();
  if (menu.contains(event.target)) return;
  const row = rowFor(event);
  projectPanel.selected = row?.dataset.projectKey ?? null;
  projectTreeSelection();
  const anchor = (row ?? add).getBoundingClientRect();
  const keyboard = !event.clientX && !event.clientY;
  openMenu(keyboard ? anchor.left : event.clientX,keyboard ? anchor.bottom : event.clientY,row ?? add);
  menu.querySelector('button').focus();
 });
 root.addEventListener('dragstart',event => {
  const row = rowFor(event);
  if (!row?.draggable) return;
  projectPanel.dragged = row.dataset.projectKey;
  event.dataTransfer.setData('text/plain',projectPanel.dragged);
  event.dataTransfer.effectAllowed = 'move';
 });
 const clearDrop = () => root.querySelector('.project-drop')?.classList.remove('project-drop');
 root.addEventListener('dragover',event => {
  const row = rowFor(event);
  clearDrop();
  if (!projectPanel.dragged || !row?.hasAttribute('aria-expanded') ||
      !projectMoveDestination(projectPanel.dragged,row.dataset.projectKey)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  row.classList.add('project-drop');
 });
 root.addEventListener('drop',event => {
  if (!projectPanel.dragged) return;
  event.preventDefault();
  const row = rowFor(event);
  if (row?.hasAttribute('aria-expanded')) moveProjectItem(projectPanel.dragged,row.dataset.projectKey);
  projectPanel.dragged = null;
  clearDrop();
 });
 root.addEventListener('dragend',() => { projectPanel.dragged = null; clearDrop(); });
 menu.addEventListener('click',event => {
  const command = event.target.closest('[data-project-command]')?.dataset.projectCommand;
  if (!command) return;
  const folder = projectFolderMap().get(projectPanel.selected), item = projectPanel.items.get(projectPanel.selected);
  menu.hidePopover();
  if (command === 'folder') return editProjectFolder();
  if (command === 'rename' && folder) return editProjectFolder(folder);
  if (command === 'delete' && folder) return deleteProjectFolder(folder);
  if (command === 'move' && (folder || item)) {
   const key = folder?.id ?? item.key, branch = item?.branch ?? projectDirectoryPath(key,projectFolderMap()).branch;
   const origin = folder?.parent ?? P.projectTree?.locations[key] ?? branch;
   return simple('Move ' + (folder?.name ?? item.name),
    select('Destination','parent',origin,projectFolderOptions(branch,folder?.id)),
    values => moveProjectItem(key,values.parent));
  }
  const actions = {
   scene:'addLayout', screen:'ui:newScreen', sheet:'evt:newSheet', object:'addType', prefab:'prefab:create',
   global:'addGlobal', sprite:'sprite:new', image:'sprite:import', tileset:'tile:import', audio:'audio:import',
  };
  if (Object.hasOwn(actions,command)) act(actions[command]);
 });
}
