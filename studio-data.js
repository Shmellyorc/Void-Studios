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
 const add = value => { if (typeof value === 'string' && value.startsWith('sprite/')) result.add(value.split('/')[1]); };
 for (const file of project.dataFiles ?? []) for (const table of file.tables) {
  const artwork = table.columns.filter(column=>column.type === 'sprite');
  for (const row of table.rows) for (const column of artwork) add(row.values[column.id]);
 }
 for (const item of project.enums ?? []) for (const value of item.values) add(value.icon);
 return result;
}

function studioArtworkSource(project,source) {
 if (typeof source !== 'string' || !source) return null;
 const [kind,id] = source.split('/');
 if (kind === 'tile') {
  const atlas = project.tilesets?.find(item=>item.id === id);
  if (!atlas) return null;
  const [cols,rows] = atlasSize(atlas);
  return { source,kind,width:atlas.width,height:atlas.height,
   grid:{ w:atlas.tileWidth,h:atlas.tileHeight,margin:atlas.margin,spacing:atlas.spacing,cols,count:cols*rows },
   layers:[{source:atlas.image,opacity:1}] };
 }
 if (kind === 'object') {
  const type = project.types.find(item=>item.id === id);
  if (!type?.image) return null;
  return { source,kind,grid:type.sheet,layers:[{source:type.image,opacity:1}] };
 }
 if (kind !== 'sprite') return null;
 const doc = project.spriteDocuments?.find(item=>item.id === id);
 if (!doc) return null;
 return { source,kind,width:doc.width,height:doc.height,grid:doc.sheet,frames:doc.frames,
  layers:(project.spriteLayers ?? []).filter(layer=>layer.document === id && layer.visible && layer.image)
   .map(layer=>({source:layer.image,opacity:layer.opacity})) };
}

function studioArtworkFrame(art,index) {
 const grid = art.grid;
 if (!grid) return { x:0,y:0,w:art.width,h:art.height };
 const margin = grid.margin ?? 0, spacing = grid.spacing ?? 0;
 return { x:margin + index%grid.cols*(grid.w+spacing),y:margin + Math.floor(index/grid.cols)*(grid.h+spacing),w:grid.w,h:grid.h };
}

function studioArtworkFrameIndex(art,reference) {
 const [, , part, row] = reference.split('/');
 if (part === undefined) return 0;
 if (art.kind === 'tile') {
  const column = Number(part), y = Number(row);
  return Number.isInteger(column) && column >= 0 && column < art.grid.cols && Number.isInteger(y) && y >= 0
   ? y*art.grid.cols + column : -1;
 }
 if (art.frames) return art.frames.findIndex(frame=>frame.id === part);
 return /^frame-\d+$/.test(part) ? Number(part.slice(6)) : -1;
}

function studioArtworkReference(art,index) {
 if (!art.grid) return art.source;
 if (art.kind === 'tile') return dataReference(art.source,index%art.grid.cols,Math.floor(index/art.grid.cols));
 return dataReference(art.source,art.frames?.[index]?.id ?? 'frame-'+index);
}

function studioDataSprite(project,reference) {
 if (!project || typeof reference !== 'string' || !reference) return null;
 const source = reference.split('/').slice(0,2).join('/');
 const art = studioArtworkSource(project,source);
 if (!art) return null;
 if (art.kind === 'tile') {
  // Older projects could pick from the trailing margin if the crop fit inside the image.
  const [, , rawColumn, rawRow] = reference.split('/');
  const column = Number(rawColumn), row = Number(rawRow), {w,h,margin,spacing} = art.grid;
  if (!Number.isInteger(column) || column < 0 || !Number.isInteger(row) || row < 0) return null;
  const x = margin+column*(w+spacing), y = margin+row*(h+spacing);
  return x+w <= art.width && y+h <= art.height ? { ...art,x,y,w,h } : null;
 }
 const index = studioArtworkFrameIndex(art,reference);
 if (index < 0 || index >= (art.grid?.count ?? 1)) return null;
 return { ...art,...studioArtworkFrame(art,index) };
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
   setFrame(image.naturalWidth,image.naturalHeight,art.x,art.y,art.w ?? image.naturalWidth,art.h ?? image.naturalHeight);
  },{once:true});
  image.src = layer.source;
  picture.append(image);
 }
 if (art.width) setFrame(art.width,art.height,art.x,art.y,art.w,art.h);
 return picture;
}
