const triggerCommands=new Set(['start','created','keyPressed','inputPressed','uiActivated','uiChanged','uiOpened','mousePressed','collision',
 'clipFinished','animationStateEntered','navArrived','navFailed']);
const commandsByDevice={mousePressed:'Mouse',keyDown:'Keyboard',keyPressed:'Keyboard',inputDown:'Input',inputPressed:'Input',
 uiActivated:'UI',uiChanged:'UI',uiOpened:'UI',showUI:'UI',restoreUI:'UI',sound:'Audio',playAudio:'Audio',stopAudio:'Audio',
 audioVolume:'Audio',audioBusVolume:'Audio',fadeAudio:'Audio'};
const eventOwnerIcons={System:'⚙',Mouse:'⌖',Keyboard:'⌨',Input:'◈',UI:'▣',Audio:'♫',Self:'◉'};
const eventCommandDescriptions={
 start:'Run when the current layout starts.',tick:'Run once each simulation tick.',every:'Run at the interval you specify.',
 triggerOnce:'Run once while the other conditions stay true for the same selection.',
 groupActive:'Check whether this event group is enabled.',setGroupActive:'Enable or disable an event group during play.',
 setDataRow:'Store a selected table row in a global variable, for use in expressions and UI bindings.',
 setGlobalFromData:'Copy a typed value from a table cell into a global variable.',
 compare:'Run when the expression evaluates to true.',filter:'Keep only the instances that match your expression.',
 aimAt:'Rotate the selected instance toward a point in the layout.',spawn:'Create an object using coordinates relative to the selected instance.',
 position:'Move the selected instance to a position in the layout.',collision:'Run when two instances begin overlapping.',
 overlap:'Select instances that currently overlap.',create:'Create an instance at a position in the current layout.',
 playClip:'Play an Animator clip on the selected instance.',setAnimationState:'Request a state on the selected instance’s animation state machine.',
};

function eventCommandIcon(kind,condition) {
 if (triggerCommands.has(kind)) return '↳';
 if (kind==='triggerOnce' || kind==='every') return '◷';
 return condition?'◇':'▸';
}

function eventOwnerFor(kind,definition,args={}) {
 if (definition[2].some(field=>field[0]==='object') && kind!=='create') return args.object??'';
 return commandsByDevice[kind]??'System';
}

function eventOwnerBadge(owner) {
 const type=T(owner), name=owner===SELF_TARGET?'Self':type?.name??(eventOwnerIcons[owner]?owner:'Missing object');
 const icon=eventOwnerIcons[name]??(type?.kind==='text'?'T':'◆');
 const color=/^#[\da-f]{6}$/i.test(type?.color??'')?type.color:'#83c6e3';
 return `<span class="block-owner" style="--owner-color:${color}"><span aria-hidden="true">${icon}</span> ${esc(name)}</span>`;
}

function eventGroupOptions() {
 const result=[];
 for (const source of eventSheetSources(P)) walkEventEntries(source.events,row=>{
  if (row.group) result.push([row.id,source.name+' · '+row.group]);
 });
 return result;
}

function commandForTarget(kind,type,legacy) {
 if (legacy || !type) return true;
 if (['playClip','stopClip','clipFinished','clipPlaying'].includes(kind)) return Boolean(type.animator?.clips.length);
 if (['animationState','animationStateEntered','setAnimationState'].includes(kind)) return Boolean(type.animator?.machine);
 if (['navigate','stopNavigation','navigating','navArrived','navFailed'].includes(kind)) return type.behaviors.some(item=>item.id==='pathfinding');
 if (kind==='emitParticles') return type.behaviors.some(item=>item.id==='particles');
 if (kind==='text') return type.kind==='text';
 if (kind==='aimAt' || kind==='animation') return type.kind==='sprite';
 return true;
}

function fixedEventParameter(kind,key,schema,type) {
 const choices = {
  '@object':()=>P.types.map(item=>[item.id,item.name]),
  '@layout':()=>P.layouts.map(item=>[item.id,item.name]),
  '@global':()=>P.globals.map(item=>[item.name,item.name]),
  '@dataRow':dataRowOptions,'@dataField':()=>dataFieldOptions(null),
  '@tileTag':projectTagOptions,
  '@input':uiInputOptions,'@uiButton':uiControlOptions,'@uiSetting':uiSettingOptions,'@uiScreen':uiScreenOptions,
  '@audioClip':audioClipOptions,'@audioBus':()=>[['','Clip default'],...Object.entries(audioBuses)],
  '@mixBus':()=>Object.entries(audioBuses),
  '@group':eventGroupOptions,
  '@mouseButton':()=>[['0','Left'],['1','Middle'],['2','Right'],['','Any button']],
  '@activation':()=>[['true','Enabled'],['false','Disabled']],
 };
 if (Object.hasOwn(choices,schema)) return choices[schema]();
 if (schema==='@animationState') return type?.animator?.machine?.states.map(state=>[state.id,state.name])??null;
 if (key==='clip' && ['playClip','clipPlaying','clipFinished'].includes(kind) && type?.animator) {
  const clips=type.animator.clips.map(clip=>[clip.id,clip.name]);
  return kind==='playClip'?clips:[['','Any clip'],...clips];
 }
 if (key==='key' && ['keyDown','keyPressed'].includes(kind)) return ['Up','Down','Left','Right','Space','Enter','Escape','Shift','Control','Tab',...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789']
  .map(value=>[value,value]);
 if (key==='property') return [['x','X'],['y','Y'],['w','Width'],['h','Height'],['angle','Rotation'],['opacity','Opacity'],
  ['vx','Horizontal velocity'],['vy','Vertical velocity'],...(kind==='set'?[['visible','Visible'],['text','Text']]:[]),
  ...Object.keys(type?.vars??{}).map(name=>[name,name])];
 if (kind==='instance' && key==='name' && Object.keys(type?.vars??{}).length) return Object.keys(type.vars).map(name=>[name,name]);
 if (kind==='call' && key==='name') return [...projectEventRows(P)].filter(({event})=>event.functionName).map(({event})=>[event.functionName,event.functionName]);
 return null;
}

function eventExpressionSuggestions(type,dataMembers,rows) {
 const names=['dt','time','index','count','pi','true','false','Mouse','Camera','Self','global','Enums','Data',
  ...P.types.map(item=>item.name),...P.globals.map(item=>item.name)];
 const properties=['x','y','w','h','width','height','angle','opacity','vx','vy','visible','ground','text'];
 const members={Mouse:['X','Y','screenX','screenY','down','clicked'],Camera:['left','top','width','height','zoom','shakeX','shakeY'],
  Self:[...properties,...Object.keys(type?.vars??{}),...Object.keys(rows.get(type?.dataRow)??{})],
  global:P.globals.map(item=>item.name),Enums:(P.enums??[]).map(item=>item.name),...dataMembers};
 for (const item of P.enums??[]) members['Enums.'+item.name]=item.values.map(value=>value.name);
 for (const item of P.types) if (!Object.hasOwn(members,item.name)) {
  members[item.name]=[...properties,...Object.keys(item.vars??{}),...Object.keys(rows.get(item.dataRow)??{})];
 }
 const behavior=currentSheet();
 if (behavior) {
  names.push('Settings','Target');
  members.Settings=Object.keys(behavior.defaults??{});
  members.Target=properties;
 }
 return {names:[...new Set(names)],members,functions:[...expressionFunctions]};
}

function eventPickerModel(which,old) {
 const condition=which==='C', kind=condition?'condition':'action';
 const catalog=studioBlockCatalog(kind,!!currentSheet(),P);
 const definitions=Object.entries(catalog);
 const dataMembers=dataExpressionMembers(P), {rows}=createStudioData(P);
 const specials=[...new Set(definitions.map(([id,entry])=>eventOwnerFor(id,entry)).filter(Boolean))];
 const targets=[...specials.map(key=>({key,name:key,icon:eventOwnerIcons[key]??'◇',color:'#83c6e3'})),
  ...(currentSheet()?[{key:SELF_TARGET,name:'Self',icon:'◉',color:'#8ed7bb'}]:[]),
  ...P.types.map(type=>({key:type.id,name:type.name,icon:type.kind==='text'?'T':'◆',
   color:/^#[\da-f]{6}$/i.test(type.color??'')?type.color:'#83c6e3',type}))];
 const allowed=(type,id,target)=>old?.kind===id && (old.args?.object===target.key || eventOwnerFor(id,catalog[id],old.args)===target.key);
 for (const target of targets) {
  target.commands=definitions.flatMap(([id,definition])=>{
   const owner=eventOwnerFor(id,definition), type=target.type;
   const legacy=allowed(type,id,target);
   if ((owner?owner!==target.key:!type && target.key!==SELF_TARGET) || !commandForTarget(id,type,legacy)) return [];
   const expressionKeys=condition?(conditionExpressions[id]??[]):(actionExpressions[id]??[]);
   const fields=definition[2].filter(([key])=>key!=='object' || owner).map(([key,label,schema])=>({
    key,label,options:fixedEventParameter(id,key,schema,type),expression:expressionKeys.includes(key) || id.startsWith('extension/'),
    fallback:schema==='@mouseButton'?'0':(schema.startsWith('@')?'':schema),
   }));
   return [{id,owner,label:definition[1],category:definition[0],icon:eventCommandIcon(id,condition),
    description:eventCommandDescriptions[id]??'',fields}];
  });
 target.expressions=eventExpressionSuggestions(target.type,dataMembers,rows);
 }
 return {label:condition?'condition':'action',editing:Boolean(old),targets:targets.filter(target=>target.commands.length),
  selectedTarget:old && Object.hasOwn(catalog,old.kind)?eventOwnerFor(old.kind,catalog[old.kind],old.args):'',
  selectedCommand:old?.kind??'',values:old?.kind==='mousePressed'&&!Object.hasOwn(old.args??{},'button')?{...old.args,button:''}:{...old?.args}};
}

function openEventPicker(which,old,save) {
 const dialog=$('#event-picker-dialog'), picker=$('#event-picker');
 eventWorkspace.picker=save;
 picker.open(eventPickerModel(which,old));
 dialog.showModal();
}

function addEventWithPicker(list,row=event(),position=list.length,optional=false) {
 if (optional) return change(()=>list.splice(position,0,row));
 openEventPicker('C',null,block=>change(()=>{
  row.conditions.push(block);
  list.splice(position,0,row);
 }));
}

function openEventBlock(which,row,index) {
 const list=which==='C'?row.conditions:row.actions, old=list[index];
 openEventPicker(which,old,block=>change(()=>{
  if (old) list[index]={...old,...block};
  else list.push(block);
 }));
}

function setupEventPicker() {
 const dialog=$('#event-picker-dialog'), picker=$('#event-picker');
 picker.addEventListener('event-picker-close',()=>dialog.close());
 picker.addEventListener('event-picker-save',({detail})=>{
  if (!eventWorkspace.picker) return;
  const {id,owner,target,fields,values}=detail, args={};
  if (!owner) args.object=target;
  for (const parameter of fields) {
   const value=values[parameter.key]??'';
   if (parameter.expression) {
    try { parseEventExpression(value); }
    catch (error) {
     picker.error=parameter.label+' · '+error.message;
     return;
    }
   }
   args[parameter.key]=value;
  }
  eventWorkspace.picker({kind:id,args});
  dialog.close();
 });
 dialog.addEventListener('close',()=>{eventWorkspace.picker=null;});
}
