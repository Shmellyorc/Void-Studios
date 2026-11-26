const studioDataTypes = { text:'Text', number:'Number', boolean:'Boolean', enum:'Enum', sprite:'Sprite' };
const dataReference = (...parts) => parts.join('/');
const dataId = value => typeof value === 'string' && /^[\w-]+$/.test(value);
const dataFieldDefault = type => ({number:0,boolean:false,text:'',enum:'',sprite:''})[type];

function validateProjectData(project) {
 project.dataFiles ??= [];
 const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
 function checkList(list, nameFor, check, label) {
  if (!Array.isArray(list)) throw Error('Invalid ' + label);
  const ids = new Set(), names = new Set();
  for (const item of list) {
   if (!record(item) || !dataId(item.id) || ids.has(item.id)) throw Error('Invalid or duplicate ' + label);
   const name = nameFor(item);
   if (typeof name !== 'string' || !validSettingName(name) || names.has(name)) throw Error('Invalid or duplicate ' + label);
   ids.add(item.id);
   names.add(name);
   check(item);
  }
 }
 const columnsFor = table => {
  checkList(table.columns,item=>item.name,column=>{
   if (!Object.hasOwn(studioDataTypes,column.type) || column.type === 'enum' && !dataId(column.enum)) throw Error('Invalid column type');
  },'data column');
  const columns = new Map(table.columns.map(column=>[column.id,column]));
  checkList(table.rows,item=>item.key,row=>{
   if (!record(row.values)) throw Error('Invalid row values');
   for (const [id,value] of Object.entries(row.values)) {
    const column = columns.get(id);
    if (!column || typeof value !== typeof dataFieldDefault(column.type) ||
        column.type === 'number' && !Number.isFinite(value)) throw Error('Invalid value in row ' + row.key);
   }
  },'data row');
 };
 checkList(project.dataFiles,item=>item.name,file=>checkList(file.tables,item=>item.name,columnsFor,'data table'),'data file');
 return project;
}

function createStudioData(project) {
 const root = Object.create(null), rows = new Map(), fields = new Map();
 const enums = new Map((project.enums ?? []).map(item=>[item.id,item]));
 const enumIcons = new Map(), enumValues = new Set();
 for (const enumeration of enums.values()) for (const member of enumeration.values) {
  const token = tileEnumToken(enumeration,member);
  enumValues.add(token);
  if (member.icon) enumIcons.set(token,member.icon);
 }
 for (const file of project.dataFiles ?? []) {
  const namespace = root[file.name] = Object.create(null);
  for (const table of file.tables) {
   const tableValues = namespace[table.name] = Object.create(null);
   for (const row of table.rows) {
    const ref = dataReference(file.id,table.id,row.id), values = tableValues[row.key] = Object.create(null);
    rows.set(ref,values);
    for (const column of table.columns) {
     let value = row.values[column.id] ?? dataFieldDefault(column.type);
     if (column.type === 'enum' && (!value.startsWith(column.enum + ':') || !enumValues.has(value))) value = '';
     values[column.name] = value;
     fields.set(dataReference(ref,column.id),value);
    }
   }
  }
 }
 return { project,root,rows,fields,enumIcons };
}

function studioDataBoundValue(data, binding, row) {
 if (!binding || !data) return undefined;
 if (typeof row === 'string' && data.rows.has(row)) {
  const parts = binding.split('/'), next = row.split('/');
  if (parts[0] === next[0] && parts[1] === next[1]) return data.fields.get(dataReference(row,parts[3]));
 }
 return data.fields.get(binding);
}

function studioDataArtworkIds(project) {
 const result = new Set();
 const add = value => { if (typeof value === 'string' && value.startsWith('sprite/')) result.add(value.slice(7)); };
 for (const file of project.dataFiles ?? []) for (const table of file.tables) {
  const artwork = table.columns.filter(column=>column.type === 'sprite');
  for (const row of table.rows) for (const column of artwork) add(row.values[column.id]);
 }
 for (const item of project.enums ?? []) for (const value of item.values) add(value.icon);
 return result;
}

function studioDataSprite(project, reference) {
 if (typeof reference !== 'string' || !reference) return null;
 const [kind,id,rawColumn,rawRow] = reference.split('/');
 if (kind === 'tile') {
  const atlas = project.tilesets?.find(item=>item.id === id);
  const column = Number(rawColumn), row = Number(rawRow);
  if (!atlas || !Number.isInteger(column) || column < 0 || !Number.isInteger(row) || row < 0) return null;
  const x = atlas.margin + column*(atlas.tileWidth+atlas.spacing), y = atlas.margin + row*(atlas.tileHeight+atlas.spacing);
  if (x+atlas.tileWidth > atlas.width || y+atlas.tileHeight > atlas.height) return null;
  return { width:atlas.width,height:atlas.height,x,y,w:atlas.tileWidth,h:atlas.tileHeight,layers:[{source:atlas.image,opacity:1}] };
 }
 if (kind === 'object') {
  const type = project.types.find(item=>item.id === id);
  if (!type?.image) return null;
  if (type.spriteDocument) return studioDataSprite(project,dataReference('sprite',type.spriteDocument));
  // Imported sheets have a known grid. CSS uses the image's natural width when no grid was defined.
  return { layers:[{source:type.image,opacity:1}],sheet:type.sheet };
 }
 if (kind !== 'sprite') return null;
 const doc = project.spriteDocuments?.find(item=>item.id === id);
 if (!doc) return null;
 const grid = doc.sheet, first = grid?.frames?.[0], x = first?.x ?? grid?.margin ?? 0, y = first?.y ?? grid?.margin ?? 0;
 return { width:doc.width,height:doc.height,x,y,w:first?.w ?? grid?.w ?? doc.width,h:first?.h ?? grid?.h ?? doc.height,
  layers:(project.spriteLayers ?? []).filter(layer=>layer.document === id && layer.visible && layer.image)
   .map(layer=>({source:layer.image,opacity:layer.opacity})) };
}

function studioDataPortrait(project, reference) {
 const art = studioDataSprite(project,reference);
 if (!art?.layers.length) return null;
 const picture = document.createElement('span');
 picture.className = 'studio-data-portrait';
 const setFrame = (width,height,x,y,w,h) => {
  picture.style.setProperty('--data-aspect',String(w/h));
  for (const image of picture.children) {
   Object.assign(image.style,{ width:100*width/w+'%',height:100*height/h+'%',left:-100*x/w+'%',top:-100*y/h+'%' });
  }
 };
 for (const layer of art.layers) {
  if (!/^data:image\//i.test(layer.source)) continue;
  const image = document.createElement('img');
  image.alt = '';
  image.draggable = false;
  image.style.opacity = layer.opacity;
  if (!art.width) image.addEventListener('load',()=>{
   const grid = art.sheet;
   setFrame(image.naturalWidth,image.naturalHeight,grid?.margin ?? 0,grid?.margin ?? 0,
    grid?.w ?? image.naturalWidth,grid?.h ?? image.naturalHeight);
  },{once:true});
  image.src = layer.source;
  picture.append(image);
 }
 if (art.width) setFrame(art.width,art.height,art.x,art.y,art.w,art.h);
 return picture;
}
