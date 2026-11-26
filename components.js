const extensionFormat = 'void-studio-extension-1';
const extensionIdentifier = value => typeof value === 'string' && /^[a-z][a-z0-9-]*$/.test(value);
const componentIdentifier = value => typeof value === 'string' && /^[A-Za-z_$][\w$]*$/.test(value) &&
 !['__proto__','constructor','prototype'].includes(value);
const extensionReserved = new Set(['Self','self','Target','Settings','global','Mouse','Camera','Enums','true','false','dt','time','pi','index','count']);

function prefabMembers(prefab, placement) {
 const rotation = (placement.angle ?? 0) * Math.PI / 180;
 const scale = placement.scale ?? 1;
 const cos = Math.cos(rotation), sin = Math.sin(rotation);
 return prefab.members.map(member => {
  const x = (member.x + member.w / 2) * scale, y = (member.y + member.h / 2) * scale;
  const w = member.w * scale, h = member.h * scale;
  return { ...member, id: placement.id + '/' + member.id, w, h,
   x: placement.x + x * cos - y * sin - w / 2,
   y: placement.y + x * sin + y * cos - h / 2,
   angle: (member.angle ?? 0) + (placement.angle ?? 0) };
 });
}

function expandedLayoutInstances(project, layout) {
 if (!layout.prefabInstances?.length) return layout.instances;
 const prefabs = new Map((project.prefabs ?? []).map(prefab => [prefab.id, prefab]));
 return [...layout.instances, ...layout.prefabInstances.flatMap(placement => {
  const prefab = prefabs.get(placement.prefab);
  return prefab ? prefabMembers(prefab, placement) : [];
 })];
}

function validateExtensionPack(pack) {
 if (!pack || pack.format !== extensionFormat || !extensionIdentifier(pack.id) || typeof pack.name !== 'string' ||
  !pack.name.trim() || typeof pack.version !== 'string' || !pack.version.trim() || !Array.isArray(pack.blocks) || !pack.blocks.length) {
  throw Error('An extension needs format, id, name, version, and at least one block');
 }
 const ids = new Set();
 for (const block of pack.blocks) {
  if (!block || !extensionIdentifier(block.id) || ids.has(block.id) || typeof block.name !== 'string' ||
   !block.name.trim() || !Array.isArray(block.parameters)) throw Error('Every extension block needs a unique id, a name, and a parameter list');
  ids.add(block.id);
  const parameters = new Set(['object']);
  for (const parameter of block.parameters) {
   if (!parameter || !componentIdentifier(parameter.name) || parameters.has(parameter.name) || extensionReserved.has(parameter.name) ||
    typeof parameter.label !== 'string' || !parameter.label.trim() || typeof parameter.default !== 'string') {
    throw Error(`${block.name} needs unique parameter names, labels, and default expressions`);
   }
   parameters.add(parameter.name);
   parseEventExpression(parameter.default);
  }
  if (block.kind === 'condition') {
   if (typeof block.expression !== 'string') throw Error(`${block.name} needs an expression`);
   parseEventExpression(block.expression);
  } else if (block.kind === 'action') {
   if (!Array.isArray(block.operations) || !block.operations.length) throw Error(`${block.name} needs at least one operation`);
   for (const operation of block.operations) {
    if (!operation || !['set','add'].includes(operation.operation) || !componentIdentifier(operation.property) ||
     typeof operation.value !== 'string') throw Error(`${block.name} supports set or add operations with a property and expression`);
    parseEventExpression(operation.value);
   }
  } else throw Error(`${block.name} must be a condition or action`);
 }
 return pack;
}

function extensionRegistry(packs = []) {
 return new Map(packs.flatMap(pack => pack.blocks.map(block => ['extension/' + pack.id + '/' + block.id, { block, pack }])));
}

function validateProjectComponents(project) {
 project.prefabs ??= [];
 project.extensions ??= [];
 if (!Array.isArray(project.prefabs) || !Array.isArray(project.extensions)) throw Error('Invalid project components');
 const types = new Set(project.types.map(type => type.id)), prefabs = new Set(), packs = new Set();
 const id = identifier => typeof identifier === 'string' && /^[A-Za-z0-9_-]+$/.test(identifier);
 for (const prefab of project.prefabs) {
  if (!prefab || !id(prefab.id) || prefabs.has(prefab.id) || typeof prefab.name !== 'string' || !prefab.name.trim() ||
   !Array.isArray(prefab.members) || !prefab.members.length) throw Error('Invalid prefab definition');
  prefabs.add(prefab.id);
  const members = new Set();
  for (const member of prefab.members) {
   if (!member || !id(member.id) || members.has(member.id) || !types.has(member.type) ||
    ![member.x,member.y,member.w,member.h].every(Number.isFinite) || member.w <= 0 || member.h <= 0 ||
    !Number.isFinite(member.angle ?? 0) || !Number.isFinite(member.opacity ?? 1)) throw Error(`Invalid member in ${prefab.name}`);
   members.add(member.id);
  }
 }
 for (const layout of project.layouts) {
  layout.prefabInstances ??= [];
  if (!Array.isArray(layout.prefabInstances)) throw Error('Invalid prefab placements');
  const placements = new Set();
  for (const placement of layout.prefabInstances) {
   if (!placement || !id(placement.id) || placements.has(placement.id) || !prefabs.has(placement.prefab) ||
    ![placement.x,placement.y,placement.angle ?? 0,placement.scale ?? 1].every(Number.isFinite) ||
    (placement.scale ?? 1) <= 0) throw Error(`Invalid prefab placement in ${layout.name}`);
   placements.add(placement.id);
  }
 }
 for (const pack of project.extensions) {
  validateExtensionPack(pack);
  if (packs.has(pack.id)) throw Error(`Duplicate extension pack ${pack.id}`);
  packs.add(pack.id);
 }
 return project;
}
