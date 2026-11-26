const dataWorkspace = { file:null, table:null, enum:null, view:'tables', drag:null };
const dataFile = () => P.dataFiles?.find(file=>file.id === dataWorkspace.file);
const dataTable = () => dataFile()?.tables.find(table=>table.id === dataWorkspace.table);
const dataEnum = () => P.enums.find(item=>item.id === dataWorkspace.enum);

function dataRowOptions(project = P) {
 return (project.dataFiles ?? []).flatMap(file=>file.tables.flatMap(table=>table.rows.map(row=>
  [dataReference(file.id,table.id,row.id),[file.name,table.name,row.key].join(' · ')])));
}

function dataFieldOptions(sprite, project = P) {
 return (project.dataFiles ?? []).flatMap(file=>file.tables.flatMap(table=>table.rows.flatMap(row=>table.columns
  .filter(column=>sprite == null || (column.type === 'sprite' || column.type === 'enum') === sprite)
  .map(column=>[dataReference(file.id,table.id,row.id,column.id),[file.name,table.name,row.key,column.name].join(' · ')]))));
}

function dataExpressionMembers(project) {
 const members = { Data:(project.dataFiles ?? []).map(file=>file.name) };
 for (const file of project.dataFiles ?? []) {
  const prefix = 'Data.' + file.name;
  members[prefix] = file.tables.map(table=>table.name);
  for (const table of file.tables) {
   const path = prefix + '.' + table.name, columns = table.columns.map(column=>column.name);
   members[path] = table.rows.map(row=>row.key);
   for (const row of table.rows) members[path + '.' + row.key] = columns;
  }
 }
 return members;
}

function dataSpriteOptions() {
 return [...(P.spriteDocuments ?? []).map(doc=>[dataReference('sprite',doc.id),doc.name]),
  ...P.types.filter(type=>type.image && !type.spriteDocument).map(type=>[dataReference('object',type.id),type.name + ' · Object image'])];
}

function dataOptionsWithMissing(options, value) {
 return value && !options.some(([id])=>id === value) ? [...options,[value,'Missing reference']] : options;
}

function dataObjectBinding(type) {
 const options = dataRowOptions();
 if (!options.length && !type.dataRow) return '';
 return '<div class="prop-group"><h4>DATA</h4>' +
  select('Data row','type.dataRow',type.dataRow ?? '',[['','None'],...dataOptionsWithMissing(options,type.dataRow)]) +
  (type.dataRow ? '<p class="muted">Use the row’s columns as instance variables.</p>' : '') + '</div>';
}

function dataCell(row,column,artworkOptions) {
 const value = row.values[column.id] ?? dataFieldDefault(column.type);
 const key = 'data-cell.' + row.id + '.' + column.id;
 if (column.type === 'boolean') return checkbox(column.name,key,value);
 if (column.type === 'enum') {
  const type = P.enums.find(item=>item.id === column.enum);
  const choices = (type?.values ?? []).map(member=>[tileEnumToken(type,member),member.name]);
  return select(column.name,key,value,[['','None'],...dataOptionsWithMissing(choices,value)]);
 }
 if (column.type === 'sprite') {
  const label = studioArtworkLabel(value,artworkOptions);
  return `<button type="button" class="data-artwork-cell" data-act="data:artwork:${esc(row.id)}:${esc(column.id)}"
   data-artwork-reference="${esc(value)}" title="${esc(label)}" aria-label="${esc(column.name+': '+label)}"><span>${esc(label)}</span></button>`;
 }
 return field(column.name,key,value,column.type === 'number' ? 'number' : 'text');
}

function renderDataWorkspace() {
 P.dataFiles ??= [];
 if (!dataFile()) dataWorkspace.file = P.dataFiles[0]?.id;
 if (!dataTable()) dataWorkspace.table = dataFile()?.tables[0]?.id;
 if (!dataEnum()) dataWorkspace.enum = P.enums[0]?.id;
 const file = dataFile(), table = dataTable(), enumeration = dataEnum();
 $('#layoutlabel').textContent = dataWorkspace.view === 'enums' ? 'Project enums' : file?.name ?? 'Data';
 $('#data-tools').innerHTML = button('New Data File…','data:newFile','primary') + button('Import…','data:import') +
  (file ? select('File','data-file-choice',file.id,P.dataFiles.map(item=>[item.id,item.name])) + button('Export…','data:export') : '') +
  '<span class="spacer"></span>' + button('Tables','data:tables',dataWorkspace.view === 'tables' ? 'active' : '') +
  button('Enums','data:enums',dataWorkspace.view === 'enums' ? 'active' : '');
 const content = $('#data-content'), inspector = $('#data-inspector');
 if (dataWorkspace.view === 'enums') {
  content.innerHTML = '<div class="data-section-tools">' + button('New Enum…','data:newEnum','primary') +
   (enumeration ? select('Enum','data-enum-choice',enumeration.id,P.enums.map(item=>[item.id,item.name])) + button('Add Value…','data:newMember') : '') + '</div>' +
   (enumeration ? '<div class="data-enum-list">' + enumeration.values.map(member=>`<div class="data-enum-row" data-enum-member="${esc(member.id)}">
    <span class="data-enum-grip" draggable="true" title="Drag to reorder" aria-hidden="true">⠿</span>
    <button data-act="data:icon:${esc(member.id)}" class="data-enum-icon" aria-label="Set icon for ${esc(member.name)}" title="Set icon">◇</button>
    ${field('Value name','data-enum-name.'+member.id,member.name)}
    ${button('↑','data:raise:'+member.id)}${button('↓','data:lower:'+member.id)}${button('×','data:deleteMember:'+member.id,'danger ghost')}</div>`).join('') +
    '</div>' : '<div class="empty">Create an enum to share values between tables, tilemaps and events.</div>');
  for (const row of content.querySelectorAll('[data-enum-member]')) {
   const icon = studioDataPortrait(P,enumeration.values.find(item=>item.id === row.dataset.enumMember).icon);
   if (icon) row.querySelector('.data-enum-icon').replaceChildren(icon);
  }
  inspector.innerHTML = '<div class="panelhead">ENUM PROPERTIES</div>' + (enumeration ? '<div class="prop-group">' +
   field('Name','data-enum-title',enumeration.name) +
   select('Data file','data-enum-file',enumeration.dataFile ?? '',[['','Project enums'],...P.dataFiles.map(item=>[item.id,item.name])]) +
   button('Delete Enum','data:deleteEnum','danger ghost') + '</div>' : '');
  return;
 }
 const artworkOptions = new Map(table?.columns.some(column=>column.type === 'sprite') ? studioArtworkOptions() : []);
 content.innerHTML = file ? '<div class="data-section-tools">' + button('New Table…','data:newTable','primary') +
  (table ? select('Table','data-table-choice',table.id,file.tables.map(item=>[item.id,item.name])) +
   button('Add Column…','data:newColumn') + button('Add Row…','data:newRow') : '') + '</div>' +
  (table ? `<div class="data-grid-scroll"><table class="data-grid" aria-label="${esc(table.name)}"><thead><tr><th scope="col">Key</th>${
   table.columns.map(column=>`<th scope="col">${button(esc(column.name),'data:column:'+column.id)}
    <small>${esc(column.type === 'enum' ? P.enums.find(item=>item.id === column.enum)?.name ?? 'Missing enum' : studioDataTypes[column.type])}</small></th>`).join('')
  }<th scope="col"><span class="data-sr-only">Row actions</span></th></tr></thead><tbody>${
   table.rows.map(row=>'<tr><td>'+field('Row key','data-row-key.'+row.id,row.key)+'</td>'+
    table.columns.map(column=>'<td>'+dataCell(row,column,artworkOptions)+'</td>').join('')+
    '<td>'+button('×','data:removeRow:'+row.id,'danger ghost')+'</td></tr>').join('')
  }</tbody></table></div>` + (!table.rows.length ? '<div class="empty">Add a row to enter values.</div>' : '') :
   '<div class="empty">Create a table to store related data.</div>') :
  '<div class="empty">Create a data file or load the Bestiary demo.</div>';
 for (const button of content.querySelectorAll('[data-artwork-reference]')) {
  const preview = studioDataPortrait(P,button.dataset.artworkReference);
  if (preview) button.prepend(preview);
 }
 inspector.innerHTML = '<div class="panelhead">DATA PROPERTIES</div>' +
  (file ? '<div class="prop-group">' + field('File name','data-file-name',file.name) + button('Delete Data File','data:deleteFile','danger ghost') + '</div>' : '') +
  (table ? '<div class="prop-group">' + field('Table name','data-table-name',table.name) +
   '<p class="muted"><code>Data.' + esc(file.name+'.'+table.name) + '</code></p>' + button('Delete Table','data:deleteTable','danger ghost') + '</div>' : '') +
  '<div class="prop-group">' + button('Load Bestiary Demo…','data:demo') + '</div>';
}

function editDataColumn(table,column) {
 const enums = P.enums.map(item=>[item.id,item.name]);
 dialog(column ? 'Edit Column' : 'Add Column',
  field('Name','name',column?.name ?? '') +
  (column ? '<p class="muted">' + esc(studioDataTypes[column.type]) + '</p>' :
   select('Type','type','text',Object.entries(studioDataTypes)) +
   '<div id="data-column-enum" hidden>' + select('Enum','enum',enums[0]?.[0] ?? '',enums) + '</div>') +
  (column ? '<button class="danger ghost" id="remove-data-column" type="button">Delete Column</button>' : ''),()=>{
   const name = $('[data-field="name"]').value.trim(), type = column?.type ?? $('[data-field="type"]').value;
   const enumId = column?.enum ?? $('[data-field="enum"]')?.value;
   if (!validSettingName(name) || table.columns.some(item=>item !== column && item.name === name)) throw Error('Use a unique column identifier');
   if (type === 'enum' && !enumId) throw Error('Create a project enum before adding an enum column');
   change(()=>{
    if (column) column.name = name;
    else table.columns.push({ id:uid(),name,type,...(type === 'enum' ? {enum:enumId} : {}) });
   });
 });
 const input = $('#dialogbody [data-field="type"]');
 if (input) input.onchange = ()=>{ $('#data-column-enum').hidden = input.value !== 'enum'; };
 if (column) $('#remove-data-column').onclick = ()=>{
  if (!confirm('Delete column ' + column.name + ' and its values?')) return;
  $('#dialog').close();
  change(()=>{
   table.columns = table.columns.filter(item=>item !== column);
   for (const row of table.rows) delete row.values[column.id];
  });
 };
}

function dataNameDialog(title, label, initial, collection, key, save) {
 simple(title,field(label,'name',initial),values=>{
  const name = values.name.trim();
  if (!validSettingName(name) || collection.some(item=>item[key] === name)) throw Error('Use a unique identifier such as EnemyKind');
  change(()=>save(name));
 });
}

function dataOpenFile(id) {
 dataWorkspace.file = id;
 dataWorkspace.table = null;
 dataWorkspace.view = 'tables';
 tab = 'data';
}

function editDataEnumIcon(member) {
 openStudioArtworkPicker('Icon for ' + member.name,member.icon ?? '',reference=>{
  if (reference === (member.icon ?? '')) return;
  change(()=>{ if (reference) member.icon = reference; else delete member.icon; });
 });
}

function clearRemovedEnumMembers(tokens) {
 for (const atlas of P.tilesets) for (const metadata of Object.values(atlas.tiles)) {
  metadata.tags = metadata.tags.filter(tag=>!tokens.has(tag));
  if (tokens.has(metadata.terrain)) { delete metadata.terrain; delete metadata.edges; }
 }
 for (const layout of P.layouts) for (const layer of layout.tilemap?.layers ?? []) {
  for (const cell of Object.values(layer.cells)) if (tokens.has(cell.terrain)) delete cell.terrain;
 }
 if (tokens.has(tileWorkspace.tagFilter)) tileWorkspace.tagFilter = '';
 for (const file of P.dataFiles ?? []) for (const table of file.tables) {
  const enumColumns = table.columns.filter(column=>column.type === 'enum');
  for (const row of table.rows) for (const column of enumColumns) {
   if (tokens.has(row.values[column.id])) delete row.values[column.id];
  }
 }
}

function dataAction(action,id,columnId) {
 const file = dataFile(), table = dataTable(), enumeration = dataEnum();
 const member = enumeration?.values.find(item=>item.id === id);
 switch (action) {
  case 'open': dataOpenFile(id); return render();
  case 'tables': case 'enums':
   dataWorkspace.view = action;
   if (id) dataWorkspace.enum = id;
   tab = 'data';
   return render();
  case 'newFile': return dataNameDialog('New Data File','Name','GameData',P.dataFiles ?? [],'name',name=>{
   const next = { id:uid(),name,tables:[] };
   (P.dataFiles ??= []).push(next);
   dataOpenFile(next.id);
   revealProjectItem('data-file:' + next.id,'data');
  });
  case 'newTable': if (file) return dataNameDialog('New Table','Name','Items',file.tables,'name',name=>{
   const next = { id:uid(),name,columns:[],rows:[] };
   file.tables.push(next); dataWorkspace.table = next.id;
  }); break;
  case 'newRow': if (table) return dataNameDialog('Add Row','Key','row'+(table.rows.length+1),table.rows,'key',key=>{
   table.rows.push({ id:uid(),key,values:{} });
  }); break;
  case 'newColumn': if (table) return editDataColumn(table); break;
  case 'column': if (table) return editDataColumn(table,table.columns.find(column=>column.id === id)); break;
  case 'artwork': {
   const row = table?.rows.find(item=>item.id === id), column = table?.columns.find(item=>item.id === columnId);
   if (!row || column?.type !== 'sprite') break;
   return openStudioArtworkPicker(column.name + ' · ' + row.key,row.values[column.id] ?? '',reference=>{
    if (reference !== (row.values[column.id] ?? '')) change(()=>{ row.values[column.id] = reference; });
   });
  }
  case 'removeRow':
   if (table && confirm('Delete this data row?')) change(()=>{ table.rows = table.rows.filter(row=>row.id !== id); });
   break;
  case 'deleteTable':
   if (table && confirm('Delete ' + table.name + ' and all its rows?')) change(()=>{ file.tables = file.tables.filter(item=>item !== table); });
   break;
  case 'deleteFile':
   if (file && confirm('Delete ' + file.name + ' and its tables?')) change(()=>{
    P.dataFiles = P.dataFiles.filter(item=>item !== file);
    for (const item of P.enums) if (item.dataFile === file.id) delete item.dataFile;
   });
   break;
  case 'newEnum': return dataNameDialog('New Enum','Name','EnemyKind',P.enums,'name',name=>{
   const next = { id:uid(),name,values:[],...(file ? {dataFile:file.id} : {}) };
   P.enums.push(next);
   dataWorkspace.enum = next.id;
   dataWorkspace.view = 'enums';
   tab = 'data';
   revealProjectItem('data-enum:' + next.id,'data');
  });
  case 'newMember': if (enumeration) return dataNameDialog('Add Enum Value','Name','Value'+(enumeration.values.length+1),enumeration.values,'name',
   name=>enumeration.values.push({ id:uid(),name })); break;
  case 'icon': if (member) return editDataEnumIcon(member); break;
  case 'raise': case 'lower': if (member) return reorderDataEnum(member,enumeration.values.indexOf(member)+(action === 'raise' ? -1 : 1)); break;
  case 'deleteMember':
   if (member && confirm('Delete ' + member.name + ' and clear references to this value?')) change(()=>{
    clearRemovedEnumMembers(new Set([tileEnumToken(enumeration,member)]));
    enumeration.values = enumeration.values.filter(item=>item !== member);
   });
   break;
  case 'deleteEnum':
   if (!enumeration) break;
   if ((P.dataFiles ?? []).some(file=>file.tables.some(table=>table.columns.some(column=>column.enum === enumeration.id)))) {
    return alert('Remove table columns using this enum before deleting it.');
   }
   if (confirm('Delete ' + enumeration.name + ' and clear references to its values?')) change(()=>{
    clearRemovedEnumMembers(new Set(enumeration.values.map(member=>tileEnumToken(enumeration,member))));
    P.enums = P.enums.filter(item=>item !== enumeration);
   });
   break;
  case 'import': return $('#data-file-input').click();
  case 'export': if (file) return exportStudioDataFile(file); break;
  case 'demo':
   if (confirm('Load the Bestiary demo? Save your current project first.')) change(()=>{
    P = bestiaryDemo();
    selected = openSheetId = null; activeType = P.types[0].id;
    eventWorkspace.focus = '';
    dataOpenFile(P.dataFiles[0].id);
   });
   break;
 }
}

function reorderDataEnum(member,index) {
 const values = dataEnum().values, from = values.indexOf(member);
 if (index < 0 || index >= values.length || from === index) return;
 change(()=>{ values.splice(from,1); values.splice(index,0,member); });
}

function exportStudioDataFile(file) {
 const enums = new Set(file.tables.flatMap(table=>table.columns.filter(column=>column.enum).map(column=>column.enum)));
 dl(file.name + '.voiddata',JSON.stringify({format:'void-data',version:1,file,
  enums:P.enums.filter(item=>item.dataFile === file.id || enums.has(item.id))},null,2));
}

async function importStudioDataFile(event) {
 const input = event.target, asset = input.files[0], project = P;
 input.value = '';
 if (!asset) return;
 try {
  const {format,version,file,enums} = JSON.parse(await asset.text());
  if (P !== project) return;
  if (format !== 'void-data' || version !== 1 || !Array.isArray(enums)) throw Error('Invalid VOID data file');
  validateProjectData({dataFiles:[file]});
  if ((P.dataFiles ?? []).some(item=>item.id === file.id || item.name === file.name)) throw Error('This data file already exists');
  const added = [], ids = new Set(P.enums.map(item=>item.id)), names = new Set(P.enums.map(item=>item.name));
  for (const item of enums) {
   if (!dataId(item?.id) || !validSettingName(item.name) || !Array.isArray(item.values) ||
       item.values.some(value=>!dataId(value?.id) || !validSettingName(value.name)) ||
       new Set(item.values.map(value=>value.id)).size !== item.values.length ||
       new Set(item.values.map(value=>value.name)).size !== item.values.length) throw Error('Invalid enum in data file');
   if (ids.has(item.id)) continue;
   if (names.has(item.name)) throw Error('An enum named ' + item.name + ' already exists');
   ids.add(item.id); names.add(item.name);
   added.push({ id:item.id,name:item.name,values:item.values.map(({id,name,icon})=>({id,name,...(typeof icon === 'string' ? {icon} : {})})),dataFile:file.id });
  }
  change(()=>{
   (P.dataFiles ??= []).push(file); P.enums.push(...added);
   dataOpenFile(file.id);
   revealProjectItem('data-file:' + file.id,'data');
  });
 } catch (error) { alert('Could not import data. ' + error.message); }
}

function setupDataWorkspace() {
 const root = $('#dataview'), content = $('#data-content');
 $('#data-file-input').addEventListener('change',importStudioDataFile);
 function update(event) {
  const input = event.target, [key,id,columnId] = (input.dataset.field ?? '').split('.');
  const value = input.value, table = dataTable(), file = dataFile(), enumeration = dataEnum();
  if (key === 'data-file-choice') { dataOpenFile(value); return render(); }
  if (key === 'data-table-choice') { dataWorkspace.table = value; return renderDataWorkspace(); }
  if (key === 'data-enum-choice') { dataWorkspace.enum = value; return renderDataWorkspace(); }
  if (key === 'data-enum-file') return change(()=>{ if (value) enumeration.dataFile = value; else delete enumeration.dataFile; });
  if (key === 'data-cell') {
   const row = table?.rows.find(item=>item.id === id), column = table?.columns.find(item=>item.id === columnId);
   if (!row || !column) return;
   const next = column.type === 'number' ? input.valueAsNumber : column.type === 'boolean' ? input.checked : value;
   if (column.type === 'number' && !Number.isFinite(next)) return renderDataWorkspace();
   if (row.values[columnId] !== next) {
    checkpoint();
    row.values[columnId] = next;
    persist();
   }
   return;
  }
  const targets = {
   'data-file-name':[file,P.dataFiles,'name'], 'data-table-name':[table,file?.tables,'name'],
   'data-enum-title':[enumeration,P.enums,'name'], 'data-enum-name':[enumeration?.values.find(item=>item.id === id),enumeration?.values,'name'],
   'data-row-key':[table?.rows.find(item=>item.id === id),table?.rows,'key'],
  };
  if (!Object.hasOwn(targets,key)) return;
  const [item,list,property] = targets[key], name = value.trim();
  if (!item) return;
  if (!validSettingName(name) || list.some(entry=>entry !== item && entry[property] === name)) {
   alert('Use a unique identifier'); return renderDataWorkspace();
  }
  if (item[property] !== name) change(()=>{ item[property] = name; });
 }
 root.addEventListener('change',update);
 $('#data-inspector').addEventListener('change',update);
 content.addEventListener('dragstart',event=>{
  const row = event.target.closest('.data-enum-grip')?.closest('[data-enum-member]');
  if (!row) return;
  dataWorkspace.drag = row.dataset.enumMember;
  event.dataTransfer.setData('text/plain',dataWorkspace.drag);
  event.dataTransfer.effectAllowed = 'move';
 });
 content.addEventListener('dragover',event=>{
  if (!dataWorkspace.drag || !event.target.closest('[data-enum-member]')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
 });
 content.addEventListener('drop',event=>{
  const target = event.target.closest('[data-enum-member]')?.dataset.enumMember, enumeration = dataEnum();
  const member = enumeration?.values.find(item=>item.id === dataWorkspace.drag);
  if (!target || !member) return;
  event.preventDefault();
  dataWorkspace.drag = null;
  reorderDataEnum(member,enumeration.values.findIndex(item=>item.id === target));
 });
 content.addEventListener('dragend',()=>{ dataWorkspace.drag = null; });
}

function bestiaryDemo() {
 const project = demo(), file = { id:'bestiary',name:'Bestiary',tables:[] };
 const kind = { id:'enemy-kind',name:'EnemyKind',dataFile:file.id,values:[
  { id:'ground',name:'Ground',icon:'sprite/slime-art' },{ id:'flying',name:'Flying',icon:'sprite/bat-art' },
 ] };
 const table = { id:'enemies',name:'Enemies',columns:[
  { id:'name',name:'Name',type:'text' },{ id:'kind',name:'Kind',type:'enum',enum:kind.id },
  { id:'health',name:'Health',type:'number' },{ id:'speed',name:'Speed',type:'number' },
  { id:'portrait',name:'Portrait',type:'sprite' },
 ],rows:[
  { id:'slime',key:'slime',values:{name:'Moss Slime',kind:tileEnumToken(kind,kind.values[0]),health:20,speed:45,portrait:'sprite/slime-art'} },
  { id:'bat',key:'bat',values:{name:'Cave Bat',kind:tileEnumToken(kind,kind.values[1]),health:12,speed:110,portrait:'sprite/bat-art'} },
 ] };
 file.tables.push(table);
 const sprites = [
  ['slime-art','Moss Slime',['................','................','................','......oooo......','....oo++++oo....',
   '...o++++++++o...','..o++cc++++++o..','..o+ccc++++++o..','.o++++++++++++o.','.o++x++++++x++o.','.o++x++++++x++o.',
   '.o++++xx++++++o.','..o==========o..','...oooooooooo...','................','................'],
   {o:'#153e43','+':'#64c48b',c:'#acf2a2',x:'#112f39','=':'#3e916c'}],
  ['bat-art','Cave Bat',['................','................','o..............o','oo....o..o....oo','oco...oooo...oco',
   'occo.oo++oo.occo','o+ccoo++++oocc+o','o++++o++++o++++o','.o+++o+xx+o+++o.','..oooo+xx+oooo..','....oo++++oo....',
   '.....o=++=o.....','......oooo......','.......oo.......','................','................'],
   {o:'#302145','+':'#b383de',c:'#d2b5f4',x:'#ffe1ac','=':'#78579b'}],
 ];
 const documents = [], layers = [], types = [];
 for (const [index,[id,name,pixels,palette]] of sprites.entries()) {
  const doc = { ...newSpriteDocument(name,16,16),id };
  const canvas = spriteCanvas(16,16), ctx = canvas.getContext('2d');
  pixels.forEach((line,y)=>[...line].forEach((pixel,x)=>{
   if (!palette[pixel]) return;
   ctx.fillStyle = palette[pixel]; ctx.fillRect(x,y,1,1);
  }));
  const artwork = canvas.toDataURL('image/png');
  documents.push(doc); layers.push(makeSpriteLayer(doc,'Artwork',artwork));
  const row = table.rows[index];
  types.push({ id:row.id,name:index ? 'Bat' : 'Slime',image:artwork,spriteDocument:id,kind:'sprite',shape:'rect',
   color:index ? '#b383de' : '#64c48b',w:64,h:64,behaviors:[],vars:{},dataRow:dataReference(file.id,table.id,row.id) });
 }
 const rowRef = name=>dataReference(file.id,table.id,name);
 const fieldRef = column=>dataReference(rowRef('slime'),column);
 const bound = (control,column,text,props)=>uiControlPreset(control,text,{
  ...props,dataField:fieldRef(column),dataRowVariable:'SelectedEnemy',
 });
 const screen = { id:'bestiary-card',name:'Bestiary Card',items:[
  uiControlPreset('label','BESTIARY',{x:-148,y:-135,w:260,h:42,size:27}),
  uiControlPreset('panel','Details',{x:148,y:0,w:272,h:308,layout:'free',background:'#213548'}),
  bound('label','name','',{x:148,y:-115,w:230,h:34,size:25}),
  bound('image','portrait','Enemy portrait',{x:148,y:-41,w:104,h:104}),
  uiControlPreset('label','HEALTH',{x:91,y:35,w:94,h:26,size:13,color:'#a3b8ce'}),
  uiControlPreset('label','SPEED',{x:205,y:35,w:94,h:26,size:13,color:'#a3b8ce'}),
  bound('label','health','',{x:91,y:61,w:90,h:28,size:23}),
  bound('label','speed','',{x:205,y:61,w:90,h:28,size:23}),
  uiControlPreset('button','Moss Slime',{id:'pick-slime',x:91,y:113,w:102,h:36,order:0}),
  uiControlPreset('button','Cave Bat',{id:'pick-bat',x:205,y:113,w:102,h:36,order:1}),
 ] };
 Object.assign(project,{ name:'Bestiary Demo',activeLayout:'bestiary-scene',enums:[kind],dataFiles:[file],
  types,spriteDocuments:documents,spriteLayers:layers,uiScreens:[screen],globals:[{name:'SelectedEnemy',value:rowRef('slime')}],
  layouts:[{ id:'bestiary-scene',name:'Creature Hall',width:640,height:360,background:'#172633',uiScreen:screen.id,
   instances:types.map((type,index)=>({id:'sample-'+type.id,type:type.id,x:137,y:112+index*103,w:64,h:64,angle:0,opacity:1})),
   events:table.rows.map(row=>event([block('uiActivated',{control:'pick-'+row.id})],
    [block('setDataRow',{name:'SelectedEnemy',row:rowRef(row.id)})])),
  }],
 });
 return project;
}
