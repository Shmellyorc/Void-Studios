const checkpointSlotOptions = [['autosave','Autosave'],['1','Slot 1'],['2','Slot 2'],['3','Slot 3']];
const validCheckpointSlot = slot => checkpointSlotOptions.some(([id]) => id === slot);
const validGameSaveId = id => typeof id === 'string' && /^[a-z0-9-]{1,80}$/.test(id);

function createGameSaves(project, storage) {
 const transient = new Map();
 const globalNames = new Set(project.globals.map(variable => variable.name));
 const layouts = new Map(project.layouts.map(layout => [layout.id,layout]));
 const types = new Set(project.types.map(type => type.id));

 function key(slot) {
  if (!validCheckpointSlot(slot)) throw Error('Choose a valid save slot.');
  if (storage && !validGameSaveId(project.gameSaveId)) throw Error('This game has no save ID.');
  return 'void-studio:checkpoint:' + project.gameSaveId + ':' + slot;
 }

 function read(slot) {
  try {
   const id = key(slot);
   const raw = storage ? storage().getItem(id) : transient.get(id);
   if (!raw) return null;
   const save = JSON.parse(raw);
   const layout = layouts.get(save?.layout);
   if (save?.format !== 1 || !layout || !save.globals ||
       typeof save.globals !== 'object' || Array.isArray(save.globals)) return null;
   const spawn = save.spawn;
   if (spawn != null && (!Number.isFinite(spawn.x) || !Number.isFinite(spawn.y) || !types.has(spawn.type) ||
       !expandedLayoutInstances(project,layout).some(instance => instance.id === spawn.id && instance.type === spawn.type))) return null;
   return save;
  } catch {
   return null;
  }
 }

 function write(slot, layout, vars, names, spawn) {
  const id = key(slot);
  const selected = [...new Set(String(names ?? '').split(',').map(name => name.trim()).filter(Boolean))];
  const globals = Object.fromEntries(selected.map(name => {
   if (!globalNames.has(name)) throw Error('Unknown checkpoint global: ' + name);
   return [name,vars[name]];
  }));
  const raw = JSON.stringify({ format:1, layout:layout.id, globals, spawn });
  if (!storage) { transient.set(id,raw); return; }
  try { storage().setItem(id,raw); }
  catch { throw Error('Could not save the checkpoint. Game storage is unavailable or full.'); }
 }

 function remove(slot) {
  const id = key(slot);
  if (!storage) { transient.delete(id); return; }
  try { storage().removeItem(id); }
  catch { throw Error('Could not clear the checkpoint. Game storage is unavailable.'); }
 }

 function restoreGlobals(save, vars) {
  for (const [name,value] of Object.entries(save.globals)) {
   if (globalNames.has(name)) Object.defineProperty(vars,name,{ value,writable:true,configurable:true,enumerable:true });
  }
 }

 return { read,write,remove,restoreGlobals };
}
