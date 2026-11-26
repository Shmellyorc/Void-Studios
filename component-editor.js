const componentSelection = { layout: null, members: new Set(), prefab: null, placement: null };

function clearComponentSelection() {
 componentSelection.layout = L();
 componentSelection.members.clear();
 componentSelection.prefab = componentSelection.placement = null;
}

function selectedPrefabPlacement() {
 if (componentSelection.layout !== L()) return null;
 return L().prefabInstances?.find(placement => placement.id === componentSelection.placement);
}

function studioBlockCatalog(kind, behavior, project) {
 const builtIn = kind === 'action' ? A : behavior ? BEHAVIOR_CONDITIONS : C;
 if (!project.extensions?.length) return builtIn;
 const entries = [...extensionRegistry(project.extensions)].filter(([, { block }]) => block.kind === kind);
 return { ...builtIn, ...Object.fromEntries(entries.map(([id, { pack, block }]) => [
  id, ['Extension', pack.name + ' · ' + block.name,
   [['object','Object','@object'], ...block.parameters.map(parameter => [parameter.name,parameter.label,parameter.default])]],
 ])) };
}

function prefabProperties() {
 const placement = selectedPrefabPlacement();
 const prefab = P.prefabs?.find(asset => asset.id === componentSelection.prefab);
 if (!prefab) return '';
 const transform = placement ? '<div class="two">' + [['X','x',0],['Y','y',0],['Angle','angle',0],['Scale','scale',1]].map(([label,key,fallback]) =>
  field(label,'prefab.' + key,placement[key] ?? fallback,'number')).join('') + '</div>' : '';
 return `<div class="prop-group"><h4>PREFAB ${placement ? 'INSTANCE' : 'ASSET'} <span>${esc(prefab.name)}</span></h4>${transform}
  <div class="two">${button('Place linked copy','prefab:place')}${button('Edit prefab','prefab:edit')}
  ${placement ? button('Duplicate','prefab:duplicate') + button('Unlink','prefab:unlink') + button('Delete placement','prefab:remove','danger')
   : button('Delete prefab','prefab:delete','danger ghost')}</div></div>`;
}

function selectPrefab(id, placement = null) {
 clearComponentSelection();
 componentSelection.prefab = id;
 componentSelection.placement = placement;
 selected = activeType = null;
}

function createPrefab() {
 const members = L().instances.filter(object => componentSelection.members.has(object.id) || object.id === selected);
 if (!members.length) return;
 const x = Math.min(...members.map(object => object.x)), y = Math.min(...members.map(object => object.y));
 const prefab = { id: uid(), name: '', members: members.map(object =>
  ({ ...clone(object), id: uid(), x: object.x - x, y: object.y - y })) };
 dialog('Create prefab', field('Name','prefab-name','Prefab ' + ((P.prefabs?.length ?? 0) + 1)) +
  checkbox('Replace selection with a linked copy','prefab-replace',true), () => {
  prefab.name = $('[data-field="prefab-name"]').value.trim();
  if (!prefab.name) throw Error('Enter a prefab name');
  change(() => {
   (P.prefabs ??= []).push(prefab);
   revealProjectItem('prefab:' + prefab.id,'prefabs');
   if ($('[data-field="prefab-replace"]').checked) {
    L().instances = L().instances.filter(object => !members.includes(object));
    placePrefab(prefab, x, y);
   } else selectPrefab(prefab.id);
  });
 }, 'Create prefab');
}

function placePrefab(prefab, x = 96, y = 96, angle = 0, scale = 1) {
 const placement = { id: uid(), prefab: prefab.id, x, y, angle, scale };
 (L().prefabInstances ??= []).push(placement);
 tab = 'layout';
 selectPrefab(prefab.id, placement.id);
}

function editPrefab(prefab) {
 const draft = clone(prefab);
 let index = 0;
 dialog('Edit prefab', field('Name','asset-name',draft.name) + `
  <canvas id="prefab-preview" width="480" height="160" aria-label="Prefab preview"></canvas>
  <div id="prefab-member-tools"></div><div id="prefab-member-fields" class="two"></div>`, () => {
  draft.name = $('[data-field="asset-name"]').value.trim();
  validateProjectComponents({ types: P.types, prefabs: [draft], layouts: [] });
  change(() => Object.assign(prefab, draft));
 }, 'Update linked copies');
 function draw() {
  const canvas = $('#prefab-preview'), ctx = canvas.getContext('2d');
  const circles = draft.members.map(member => [member.x + member.w / 2, member.y + member.h / 2, Math.hypot(member.w, member.h) / 2]);
  const left = Math.min(0,...circles.map(([x,,r]) => x-r)), right = Math.max(1,...circles.map(([x,,r]) => x+r));
  const top = Math.min(0,...circles.map(([,y,r]) => y-r)), bottom = Math.max(1,...circles.map(([,y,r]) => y+r));
  const scale = Math.min((canvas.width-24)/(right-left),(canvas.height-24)/(bottom-top),4);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();
  ctx.translate((canvas.width-(left+right)*scale)/2,(canvas.height-(top+bottom)*scale)/2);
  ctx.scale(scale,scale);
  draft.members.forEach((member, i) => {
   const type = T(member.type);
   drawObjectPose(ctx,type,layoutSpritePose(type,member),images);
   const image = images.get(type.image);
   if (image && !image.complete && !loadingArtwork.has(image)) {
    loadingArtwork.add(image);
    image.addEventListener('load',() => {
     if ($('#dialog').open && $('#prefab-preview') === canvas) draw();
    },{ once: true });
   }
   if (i === index) outlinePrefabMember(ctx, member, scale);
  });
  ctx.restore();
 }
 function refresh() {
  const member = draft.members[index];
  $('#prefab-member-tools').innerHTML = select('Member','member-index',String(index),draft.members.map((item,i) =>
   [String(i), (i+1) + '. ' + T(item.type).name])) +
   `<div class="two"><button id="prefab-add-member">Add member</button>
    <button id="prefab-remove-member" ${draft.members.length === 1 ? 'disabled' : ''}>Remove member</button></div>`;
  $('#prefab-member-fields').innerHTML = select('Object type','type',member.type,P.types.map(type => [type.id,type.name])) +
   [['X offset','x',0],['Y offset','y',0],['Width','w',32],['Height','h',32],['Angle','angle',0],['Opacity','opacity',1]]
    .map(([label,key,fallback]) => field(label,key,member[key] ?? fallback,'number')).join('') +
    (T(member.type).kind === 'text' ? field('Text','text',member.text ?? T(member.type).text) : '');
  $('[data-field="member-index"]').onchange = event => { index = Number(event.target.value); refresh(); };
  $('#prefab-add-member').onclick = () => {
   draft.members.push({ id: uid(), type: member.type, x: 0, y: 0, w: T(member.type).w, h: T(member.type).h });
   index = draft.members.length-1;
   refresh();
  };
  $('#prefab-remove-member').onclick = () => {
   draft.members.splice(index,1);
   index = Math.min(index,draft.members.length-1);
   refresh();
  };
  $('#prefab-member-fields').oninput = event => {
   const input = event.target, key = input.dataset.field;
   if (input.type === 'number' && !Number.isFinite(input.valueAsNumber)) return;
   if (input.type === 'number') {
    const value = input.valueAsNumber;
    member[key] = key === 'w' || key === 'h' ? Math.max(1,value) : key === 'opacity' ? Math.min(1,Math.max(0,value)) : value;
   } else member[key] = input.value;
   if (key === 'type') refresh();
   else draw();
  };
  draw();
 }
 const loadingArtwork = new WeakSet();
 refresh();
}

function outlinePrefabMember(ctx, member, scale) {
 ctx.save();
 ctx.translate(member.x + member.w / 2, member.y + member.h / 2);
 ctx.rotate((member.angle ?? 0) * Math.PI / 180);
 ctx.strokeStyle = '#6cd5ff';
 ctx.lineWidth = 1.5 / scale;
 ctx.setLineDash([4 / scale,3 / scale]);
 ctx.strokeRect(-member.w / 2,-member.h / 2,member.w,member.h);
 ctx.restore();
}

function stageObjectAt(layout, point) {
 return [...tileObjectOrder(layout,expandedLayoutInstances(P,layout))].reverse().find(object => {
  const x = point.x - object.x - object.w / 2, y = point.y - object.y - object.h / 2;
  const angle = (typeof object.id === 'string' && object.id.includes('/') ? object.angle ?? 0 : 0) * -Math.PI / 180;
  return Math.abs(x * Math.cos(angle) - y * Math.sin(angle)) <= object.w / 2 &&
   Math.abs(x * Math.sin(angle) + y * Math.cos(angle)) <= object.h / 2;
 });
}

function prefabAction(action, id) {
 if (action === 'create') return createPrefab();
 if (action === 'select') { selectPrefab(id); tab = 'layout'; render(); return; }
 const prefab = P.prefabs?.find(asset => asset.id === componentSelection.prefab);
 const placement = selectedPrefabPlacement();
 if (!prefab) return;
 if (action === 'edit') return editPrefab(prefab);
 if (action === 'delete') {
  if (P.layouts.some(layout => layout.prefabInstances?.some(item => item.prefab === prefab.id))) {
   alert('Remove or unlink this prefab’s placements before deleting the asset.');
   return;
  }
  change(() => { P.prefabs = P.prefabs.filter(asset => asset !== prefab); clearComponentSelection(); });
 } else if (action === 'place') change(() => placePrefab(prefab));
 else if (placement && action === 'duplicate') change(() =>
  placePrefab(prefab,placement.x+16,placement.y+16,placement.angle,placement.scale));
 else if (placement && (action === 'unlink' || action === 'remove')) change(() => {
  if (action === 'unlink') {
   const objects = prefabMembers(prefab,placement).map(object => ({ ...clone(object), id: uid() }));
   L().instances.push(...objects);
   selected = objects[0].id;
   activeType = objects[0].type;
  }
  L().prefabInstances = L().prefabInstances.filter(item => item !== placement);
  clearComponentSelection();
 });
}

function exampleExtension() {
 return { format: extensionFormat, id: 'health-' + uid(), name: 'Health tools', version: '1.0.0', blocks: [
  { id: 'set-health', name: 'Set health', kind: 'action', parameters: [{ name: 'amount', label: 'Health', default: '100' }],
   operations: [{ operation: 'set', property: 'Health', value: 'amount' }] },
  { id: 'low-health', name: 'Is low health', kind: 'condition', parameters: [{ name: 'threshold', label: 'Threshold', default: '25' }],
   expression: 'Self.Health <= threshold' },
 ] };
}

function extensionManager() {
 dialog('Extension packs', `<div class="asset-toolbar">${button('Create pack','extension:new')}${button('Import JSON','extension:import')}</div>
  ${(P.extensions ?? []).map(pack => `<div class="prop-group"><h4>${esc(pack.name)} <span>${esc(pack.version)}</span></h4>
   <div class="asset-toolbar">${button('Edit JSON','extension:edit:' + pack.id)}${button('Export JSON','extension:export:' + pack.id)}
    ${button('Remove','extension:remove:' + pack.id,'danger ghost')}</div></div>`).join('') ||
   '<p class="muted">Install a pack to add its conditions and actions to the event picker.</p>'}`, () => {}, 'Close');
}

function saveExtension(pack, previous) {
 validateExtensionPack(pack);
 if (previous && pack.id !== previous.id) throw Error('Keep the pack ID to preserve event references');
 if ((P.extensions ?? []).some(other => other !== previous && other.id === pack.id)) throw Error('A pack with this ID is already installed');
 change(() => {
  if (previous) P.extensions[P.extensions.indexOf(previous)] = pack;
  else (P.extensions ??= []).push(pack);
 });
}

function extensionActionUI(action, id) {
 const pack = P.extensions?.find(item => item.id === id);
 if (action === 'open') extensionManager();
 if (action === 'new' || (action === 'edit' && pack)) {
  $('#dialog').close();
  const manifest = JSON.stringify(pack ?? exampleExtension(),null,2);
  dialog(pack ? 'Edit extension pack' : 'Create extension pack', `<label>Extension manifest
   <textarea id="extension-manifest" rows="18" spellcheck="false">${esc(manifest)}</textarea></label>`,
   () => saveExtension(JSON.parse($('#extension-manifest').value),pack), 'Save pack');
 }
 if (action === 'import') $('#extension-file').click();
 if (action === 'export' && pack) dl(pack.id + '.void-extension.json',JSON.stringify(pack,null,2));
 if (action === 'remove' && pack && confirm('Remove ' + pack.name + '? Event blocks that use this pack will need it reinstalled.')) {
  change(() => { P.extensions = P.extensions.filter(item => item !== pack); });
  $('#dialog').close();
  extensionManager();
 }
}

function setupComponentEditor() {
 $('#extension-file').onchange = async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
   saveExtension(JSON.parse(await file.text()));
   if ($('#dialog').open) $('#dialog').close();
   extensionManager();
  } catch (error) { alert(error.message); }
 };
}
