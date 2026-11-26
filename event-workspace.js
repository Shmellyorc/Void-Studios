const eventWorkspace={focus:'',collapsed:new Set(),dragged:null,picker:null};
const sheetKey=source=>source.kind+':'+source.id;
const eventGroupPalette=['#77d8ac','#83baff','#c5a5fa','#efba78','#f29eb2','#78d4de','#d0da83','#f0a68b'];

function eventGroupColor(id,parent) {
 let hash=2166136261;
 for (const character of id) hash=Math.imul(hash^character.charCodeAt(0),16777619);
 const slot=(hash>>>0)%eventGroupPalette.length;
 const color=eventGroupPalette[slot];
 return color===parent?eventGroupPalette[(slot+1)%eventGroupPalette.length]:color;
}

function eventGroupGuide(children,accent,offset,visible) {
 return children?`<div class="event-scope" style="--group-accent:${accent};--event-guide-x:${offset}px" ${visible?'data-guide':''}>${children}</div>`:'';
}

function editorEventSheet() {
 const sources=eventSheetSources(P);
 return sources.find(source=>source.kind==='behavior' && source.id===openSheetId) ??
  sources.find(source=>sheetKey(source)===eventWorkspace.focus && source.kind!=='behavior') ??
  sources.find(source=>source.kind==='shared' && source.id===L().eventSheet) ??
  sources.find(source=>source.kind==='layout' && source.id===L().id);
}

function validateEventSheets(project) {
 project.eventSheets??=[];
 if (!Array.isArray(project.eventSheets)) throw Error('Invalid project event sheets.');
 const sheets=new Map(), names=new Set();
 for (const sheet of project.eventSheets) {
  if (!sheet || !/^[\w-]+$/.test(sheet.id??'') || sheets.has(sheet.id) ||
      typeof sheet.name!=='string' || !sheet.name.trim() || names.has(sheet.name.toLowerCase()) || !Array.isArray(sheet.events)) {
   throw Error('Invalid shared event sheet.');
  }
  sheets.set(sheet.id,sheet);
  names.add(sheet.name.toLowerCase());
 }
 if (project.layouts.some(layout=>layout.eventSheet && !sheets.has(layout.eventSheet))) throw Error('A layout refers to a missing event sheet.');
 const edges=new Map(), groups=new Set();
 function visit(events,source,depth=0) {
  if (depth>120) throw Error('Event nesting is too deep.');
  for (const row of events) {
   if (!row || !Array.isArray(row.conditions) || !Array.isArray(row.actions) ||
       (row.children!==undefined && !Array.isArray(row.children))) throw Error('Invalid event row.');
   if (row.group) {
    if (typeof row.group!=='string' || typeof row.id!=='string' || groups.has(row.id) ||
        row.include || row.conditions.length || row.actions.length || !Array.isArray(row.children)) throw Error('Invalid event group.');
    groups.add(row.id);
   }
   if (row.include) {
    if (!sheets.has(row.include) || source.kind==='behavior' || row.conditions.length || row.actions.length || row.children?.length) {
     throw Error('Invalid event sheet include.');
    }
    if (source.kind==='shared') edges.get(source.id).add(row.include);
   }
   if (row.children?.length) visit(row.children,source,depth+1);
  }
 }
 for (const source of eventSheetSources(project)) {
  if (source.kind==='shared') edges.set(source.id,new Set());
  visit(source.events,source);
 }
 const checking=new Set(), checked=new Set();
 function check(id) {
  if (checking.has(id)) throw Error('Event sheet includes form a cycle.');
  if (checked.has(id)) return;
  checking.add(id);
  for (const target of edges.get(id)) check(target);
  checking.delete(id);
  checked.add(id);
 }
 for (const id of edges.keys()) check(id);
 return project;
}

function walkEventEntries(events,callback) {
 for (const event of events) {
  callback(event);
  if (event.children?.length) walkEventEntries(event.children,callback);
 }
}

function sheetIncludes(source,id,visited=new Set()) {
 if (source.kind==='shared' && source.id===id) return true;
 if (visited.has(sheetKey(source))) return false;
 visited.add(sheetKey(source));
 let found=false;
 walkEventEntries(source.events,event=>{
  if (event.include && !found) {
   const next=(P.eventSheets??[]).find(item=>item.id===event.include);
   if (next) found=sheetIncludes({...next,kind:'shared'},id,visited);
  }
 });
 return found;
}

function renderEventToolbar() {
 const source=editorEventSheet();
 const sources=eventSheetSources(P), captions={layout:'Layout',shared:'Shared',behavior:'Behavior'};
 $('#event-sheet-choice').innerHTML=select('Sheet','event-sheet',sheetKey(source),
  sources.map(item=>[sheetKey(item),captions[item.kind]+' · '+item.name]));
 $('#event-sheet-settings').innerHTML=source.kind==='shared'
  ? button('Rename','evt:renameSheet')+button('Delete sheet','evt:deleteSheet','danger ghost') : '';
 $('#event-include').disabled=source.kind==='behavior' || !P.eventSheets?.some(sheet=>sheet.id!==source.id);
 $('#event-layout-assignment').innerHTML=select(L().name+' runs','event-layout-sheet',L().eventSheet??'',
  [['','Layout sheet'],...(P.eventSheets??[]).map(sheet=>[sheet.id,sheet.name])]);
 if (tab==='events') $('#layoutlabel').textContent=source.name;
}

function renderEventRows() {
 renderEventToolbar();
 let number=0;
 const catalog={C:studioBlockCatalog('condition',!!currentSheet(),P),A:studioBlockCatalog('action',false,P)};
 function blocks(row,which) {
  const entries=which==='C'?row.conditions:row.actions;
  return entries.map((block,i)=>{
   const kind=eventCommandIcon(block.kind,which==='C');
   return (block.comment?'<p class="event-annotation">'+esc(block.comment)+'</p>':'')+
    `<div class="eventblock ${which==='C'?'cond':'act'}">
     <button class="blockmain" data-act="edit:${which}:${row.id}:${i}"><span class="event-mark" aria-hidden="true">${kind}</span>${formatBlock(block,catalog[which])}</button>
     <button data-act="evt:blockComment:${which}:${row.id}:${i}" title="Add or edit comment" aria-label="Comment on block">⋯</button>
     ${which==='C' && block.kind!=='triggerOnce'?'<button data-act="invert:'+row.id+':'+i+'" title="Invert condition">!</button>':''}
     <button data-act="delblock:${which}:${row.id}:${i}" aria-label="Remove block" title="Remove block">×</button>
    </div>`;
  }).join('')+`<button class="addblock" data-act="addblock:${which}:${row.id}">+ Add ${which==='C'?'condition':'action'}</button>`;
 }
 function rows(list,depth=0,parentColor) {
  return list.map(row=>{
   const collapsed=eventWorkspace.collapsed.has(row.id);
   const grip=`<span class="event-grip" draggable="true" data-drag-event="${row.id}" title="Drag to reorder">⠿</span>`;
   const tail=`<span class="event-spacer"></span>${button('↑','up:'+row.id)}${button('↓','down:'+row.id)}
     ${button(row.disabled?'Enable':'Disable','toggle:'+row.id)}${button('×','delevent:'+row.id,'danger')}`;
   if (row.group) {
    const accent=eventGroupColor(row.id,parentColor);
    const children=rows(row.children,depth+1,accent);
    return `<div class="event-entry event-group ${row.disabled?'event-group-disabled':''}" data-event-entry="${row.id}" data-event-group
      style="--depth:${Math.min(6,depth)};--group-accent:${accent}">
     <div class="event-group-heading">${grip}
      <button type="button" data-act="evt:collapse:${row.id}" aria-expanded="${!collapsed}">${collapsed?'▸':'▾'} ${esc(row.group)}</button>
      ${button('Rename','evt:editGroup:'+row.id)}${button('+ Event','evt:addIn:'+row.id)}${button('+ Group','evt:group:'+row.id)}
      ${button('Comment','evt:comment:'+row.id)}${button('Move','evt:move:'+row.id)}${tail}</div>
     ${row.comment?'<p class="event-annotation">'+esc(row.comment)+'</p>':''}
    </div>${collapsed?'':eventGroupGuide(children,accent,depth*18+1,depth<6)}`;
   }
   if (row.include) {
    const target=(P.eventSheets??[]).find(sheet=>sheet.id===row.include);
    return `<div class="event-entry event-include ${row.disabled?'disabled':''}" data-event-entry="${row.id}" style="--depth:${Math.min(6,depth)}">
     <div class="event-group-heading">${grip}<span>Include</span>${button(target?.name??'Unavailable sheet','evt:open:'+row.include)}
      ${button('Move','evt:move:'+row.id)}${tail}</div>
    </div>`;
   }
   const count=++number, children=rows(row.children??[],depth+1,parentColor);
   return `<div class="event event-entry ${row.disabled?'disabled':''}" data-event-entry="${row.id}" style="--depth:${Math.min(6,depth)}">
    ${row.comment?'<p class="event-annotation event-note">'+esc(row.comment)+'</p>':''}
    <div class="eventbar">${grip}${editorBreakpointButton(row)}<span class="eventno">${count}</span>
     ${button('JS','eventJS:'+count,'event-js-button')}
     ${row.functionName?'<strong>ƒ '+esc(row.functionName)+'('+esc((row.params??[]).join(', '))+')</strong>':''}
     ${row.otherwise?'<span class="else-label">Else</span>':''}
     ${button(row.mode.toUpperCase(),'mode:'+row.id)}${button('↻ '+row.repeat,'repeat:'+row.id)}
     ${button('Comment','evt:comment:'+row.id)}${button('+ Sub-event','child:'+row.id)}${button('+ Else','evt:else:'+row.id)}
     <details class="event-options"><summary aria-label="More event actions">⋯</summary><div>
      ${button('Move to group…','evt:move:'+row.id)}${button('Duplicate event','copyevent:'+row.id)}
      ${!currentSheet()?button('Visual function…','function:'+row.id):''}
      ${row.children?.length?button(collapsed?'Expand sub-events':'Collapse sub-events','evt:collapse:'+row.id):''}
     </div></details>${tail}</div>
    <div class="eventcols"><div class="conditions">${blocks(row,'C')}</div><div class="actions">${blocks(row,'A')}</div></div>
   </div>${collapsed?'':children}`;
  }).join('');
 }
 $('#events').innerHTML=rows(currentEvents())||'<p class="event-sheet-empty">Add an event, group, or shared sheet include.</p>';
 $('#eventcount').textContent=number+' events';
}

function editEventAnnotation(item) {
 dialog('Event Comment','<label>Comment<textarea id="event-comment" rows="4">'+esc(item.comment??'')+'</textarea></label>',()=>{
  const comment=$('#event-comment').value.trim().slice(0,4000);
  change(()=>{if (comment) item.comment=comment;else delete item.comment;});
 });
}

function moveEventEntry(row,target,before=false) {
 const origin=locate(row.id);
 if (!origin || target===row) return;
 let cycle=false;
 walkEventEntries(row.children??[],child=>{if (child===target) cycle=true;});
 if (cycle) return;
 const destination=before?locate(target.id)?.list:target?.children??currentEvents();
 if (!destination) return;
 change(()=>{
  origin.list.splice(origin.list.indexOf(row),1);
  if (before) destination.splice(destination.indexOf(target),0,row);
  else destination.push(row);
  if (target?.group) eventWorkspace.collapsed.delete(target.id);
 });
}

function eventWorkspaceAction(action,id,...args) {
 const source=editorEventSheet(), loc=id?locate(id):null;
 if (action==='open') {
  openSheetId=null;eventWorkspace.focus='shared:'+id;tab='events';render();return;
 }
 if (action==='newSheet' || action==='renameSheet') {
  const previous=action==='renameSheet'?(P.eventSheets??[]).find(item=>item.id===source.id && source.kind==='shared'):null;
  simple(previous?'Rename Event Sheet':'New Event Sheet',field('Name','name',previous?.name??'Shared Events'),values=>{
   const name=values.name.trim();
   if (!name || name.length>100 || (P.eventSheets??[]).some(item=>item!==previous && item.name.toLowerCase()===name.toLowerCase())) {
    throw Error('Enter a unique sheet name up to 100 characters.');
   }
   change(()=>{
    if (previous) previous.name=name;
    else {
     const sheet={id:uid(),name,events:[]};
     (P.eventSheets??=[]).push(sheet);
     openSheetId=null;eventWorkspace.focus='shared:'+sheet.id;tab='events';
    }
   });
  });
  return;
 }
 if (action==='deleteSheet') {
  if (source.kind!=='shared') return;
  if (P.layouts.some(layout=>layout.eventSheet===source.id) || eventSheetSources(P).some(item=>sheetKey(item)!==sheetKey(source) && sheetIncludes(item,source.id))) {
   return alert('Remove layout assignments and includes before deleting this sheet.');
  }
  if (confirm('Delete the event sheet “'+source.name+'”?')) change(()=>{
   P.eventSheets=P.eventSheets.filter(item=>item.id!==source.id);
   eventWorkspace.focus='';
  });
  return;
 }
 if (action==='include') {
  if (source.kind==='behavior') return;
  const sheets=(P.eventSheets??[]).filter(item=>!sheetIncludes({...item,kind:'shared'},source.id) || source.kind!=='shared');
  if (!sheets.length) return alert('Create another shared event sheet before adding an include.');
  simple('Include Event Sheet',select('Sheet','include',sheets[0].id,sheets.map(item=>[item.id,item.name])),values=>{
   change(()=>currentEvents().push({...event(),include:values.include}));
  });
  return;
 }
 if (action==='group' || action==='editGroup') {
  const previous=action==='editGroup'?loc?.e:null;
  simple(previous?'Rename Event Group':'New Event Group',field('Name','name',previous?.group??'New group'),values=>{
   const name=values.name.trim().slice(0,100);
   if (!name) throw Error('Enter a group name.');
   change(()=>{
    if (previous) previous.group=name;
    else (loc?.e.children??currentEvents()).push({...event(),group:name});
   });
  });
  return;
 }
 if (action==='blank') return change(()=>currentEvents().push(event()));
 if (action==='addIn' && loc?.e.group) return addEventWithPicker(loc.e.children);
 if (action==='blockComment') {
  const block=locate(args[0])?.e[id==='C'?'conditions':'actions'][Number(args[1])];
  if (block) editEventAnnotation(block);
  return;
 }
 if (action==='focus') {
  $('#eventview').classList.toggle('sheet-focused');
  return;
 }
 if (!loc) return;
 if (action==='collapse') {
  if (eventWorkspace.collapsed.has(id)) eventWorkspace.collapsed.delete(id);
  else eventWorkspace.collapsed.add(id);
  return renderEventRows();
 }
 if (action==='comment') return editEventAnnotation(loc.e);
 if (action==='else') {
  const row={...event(),otherwise:true};
  const i=loc.list.indexOf(loc.e);
  return addEventWithPicker(loc.list,row,i+1,true);
 }
 if (action==='move') {
  const destinations=[['','Sheet root']];
  let excluded=new Set([loc.e.id]);
  walkEventEntries(loc.e.children??[],child=>excluded.add(child.id));
  walkEventEntries(currentEvents(),row=>{if (row.group && !excluded.has(row.id)) destinations.push([row.id,row.group]);});
  simple('Move Event',select('Destination','destination','',destinations),values=>moveEventEntry(loc.e,locate(values.destination)?.e));
 }
}

function setupEventWorkspace() {
 $('#eventview').addEventListener('change',event=>{
  const key=event.target.dataset.field, value=event.target.value;
  if (key==='event-sheet') {
   openSheetId=value.startsWith('behavior:')?value.slice(9):null;
   eventWorkspace.focus=value;
   render();
  } else if (key==='event-layout-sheet') change(()=>{
   if (value) L().eventSheet=value;else delete L().eventSheet;
   if (!openSheetId) eventWorkspace.focus='';
  });
 });
 const root=$('#events');
 root.addEventListener('dragstart',event=>{
  const id=event.target.dataset.dragEvent;
  if (!id) return;
  eventWorkspace.dragged=id;
  event.dataTransfer.setData('text/plain',id);
  event.dataTransfer.effectAllowed='move';
 });
 root.addEventListener('dragover',event=>{
  const target=event.target.closest('[data-event-entry]');
  if (!target || !eventWorkspace.dragged || target.dataset.eventEntry===eventWorkspace.dragged) return;
  event.preventDefault();
  event.dataTransfer.dropEffect='move';
  root.querySelector('.event-drop')?.classList.remove('event-drop');
  target.classList.add('event-drop');
 });
 root.addEventListener('drop',event=>{
  const destination=event.target.closest('[data-event-entry]');
  const origin=locate(eventWorkspace.dragged)?.e, target=locate(destination?.dataset.eventEntry)?.e;
  if (origin && target) {
   event.preventDefault();
   moveEventEntry(origin,target,!target.group || event.shiftKey);
  }
  eventWorkspace.dragged=null;
  root.querySelector('.event-drop')?.classList.remove('event-drop');
 });
 root.addEventListener('dragend',()=>{
  eventWorkspace.dragged=null;
  root.querySelector('.event-drop')?.classList.remove('event-drop');
 });
 setupEventPicker();
}
