const machineConditionKinds=[
 ['moving','Speed above threshold'],['stopped','Speed at or below threshold'],
 ['variable','Compare instance variable'],['finished','Clip finished'],
];

function validAnimationMachine(machine,clips) {
 if (!machine || typeof machine.enabled!=='boolean' || !Array.isArray(machine.states) || !machine.states.length ||
     machine.states.length>128 || !Array.isArray(machine.transitions) || machine.transitions.length>512) return false;
 const ids=new Set(), names=new Set(), clipIds=new Set(clips.map(clip=>clip.id));
 const validId=id=>typeof id==='string' && /^[\w-]+$/.test(id);
 for (const state of machine.states) {
  if (!validId(state?.id) || ids.has(state.id) || typeof state.name!=='string' || !state.name.trim() ||
      state.name.length>80 || names.has(state.name.toLowerCase()) || !clipIds.has(state.clip)) return false;
  ids.add(state.id);
  names.add(state.name.toLowerCase());
 }
 if (!ids.has(machine.initial)) return false;
 const rules=new Set();
 for (const rule of machine.transitions) {
  if (!validId(rule?.id) || rules.has(rule.id) || !ids.has(rule.to) ||
      !(rule.from==='' || ids.has(rule.from) && rule.from!==rule.to) ||
      !Array.isArray(rule.conditions) || !rule.conditions.length || rule.conditions.length>8 ||
      !rule.conditions.every(validMachineCondition)) return false;
  rules.add(rule.id);
 }
 return true;
}

function validMachineCondition(condition) {
 if (condition?.kind==='finished') return true;
 if (['moving','stopped'].includes(condition?.kind)) return Number.isFinite(condition.threshold) && condition.threshold>=0;
 if (condition?.kind!=='variable' || typeof condition.variable!=='string' || !condition.variable.trim() ||
     !animationComparisons.includes(condition.operator)) return false;
 const value=condition.value;
 if (['==','!='].includes(condition.operator)) return value===null || ['string','boolean'].includes(typeof value) || Number.isFinite(value);
 return Number.isFinite(value);
}

function animationStateLabel(type,value) {
 return type?.animator?.machine?.states.find(state=>state.id===value)?.name ?? value;
}

function animationBlockStateField(initial) {
 const root=$('#blockfields'), target=root.querySelector('[data-field="object"]'), host=root.querySelector('[data-animation-state]');
 if (!host || !target) return;
 function render(value) {
  const states=T(target.value)?.animator?.machine?.states;
  if (states?.length) {
   const state=states.find(state=>state.id===value || state.name===value);
   const choices=states.map(item=>[item.id,item.name]);
   if (value && !state) choices.push([value,value+' (unavailable)']);
   host.innerHTML=select('Animation state','state',state?.id??(value||states[0].id),choices);
  } else {
   host.innerHTML=field('Animation state name','state',value??'');
  }
 }
 render(initial);
 target.addEventListener('change',()=>render(''));
}

function firstMachineState(clip) {
 return {id:uid(),name:clip.name.trim().slice(0,80)||'Initial',clip:clip.id};
}

function newAnimationMachine(type) {
 const clip=animatorClip()??type.animator?.clips[0];
 if (!clip) return alert('Create a clip in Animator first.');
 const state=firstMachineState(clip);
 change(()=>{type.animator.machine={enabled:true,initial:state.id,states:[state],transitions:[]};});
}

function stateDialog(type,previous) {
 const {machine,clips}=type.animator;
 simple(previous?'Edit Animation State':'New Animation State',
  field('Name','name',previous?.name??'State '+(machine.states.length+1))+
  select('Clip','clip',previous?.clip??clips[0].id,clips.map(clip=>[clip.id,clip.name])),values=>{
   const name=values.name.trim();
   if (!name || name.length>80 || machine.states.some(state=>state!==previous && state.name.toLowerCase()===name.toLowerCase())) {
    throw Error('Enter a unique state name with up to 80 characters.');
   }
   if (!previous && machine.states.length>=128) throw Error('A state machine supports up to 128 states.');
   if (!clips.some(clip=>clip.id===values.clip)) throw Error('Select a clip for the state.');
   change(()=>{
    if (previous) Object.assign(previous,{name,clip:values.clip});
    else machine.states.push({id:uid(),name,clip:values.clip});
   });
  });
}

function machineRuleDialog(type,previous) {
 const {machine}=type.animator;
 const options=machine.states.map(state=>[state.id,state.name]);
 if (!previous && machine.transitions.length>=512) return alert('A state machine supports up to 512 transitions.');
 const first=previous?.from??machine.initial;
 const destination=previous?.to??machine.states.find(state=>state.id!==first)?.id??machine.initial;
 const defaults=previous?.conditions??[{kind:'moving',threshold:1}];
 simple(previous?'Edit Transition':'New Transition',
  '<div class="two">'+select('From','from',first,[['','Any state'],...options])+
   select('To','to',destination,options)+'</div><div id="animation-rule-conditions"></div>',values=>{
   const conditions=readRules().map(input=>{
    if (input.kind==='finished') return {kind:input.kind};
    if (input.kind==='variable') {
     let value;
     try { value=JSON.parse(input.value); }
     catch { throw Error('Use a number, true, false, null, or quoted text for the comparison value.'); }
     return {kind:input.kind,variable:input.variable.trim(),operator:input.operator,value};
    }
    if (input.threshold==='') throw Error('Enter a nonnegative speed threshold.');
    return {kind:input.kind,threshold:Number(input.threshold)};
   });
   if (values.from===values.to) throw Error('Choose a different destination state.');
   if (!conditions.every(validMachineCondition)) throw Error('Check the threshold, variable name, or comparison value.');
   const rule={from:values.from,to:values.to,conditions};
   change(()=>{
    if (previous) Object.assign(previous,rule);
    else machine.transitions.push({id:uid(),...rule});
   });
  });
 const root=$('#animation-rule-conditions');
 function readRules() {
  return [...root.querySelectorAll('.animation-rule-condition')].map(row=>Object.fromEntries(
   [...row.querySelectorAll('[data-field]')].map(field=>[field.dataset.field,field.value])));
 }
 function draw(items) {
  root.innerHTML='<div class="animation-rule-heading">All conditions must match</div>'+items.map((item,index)=>{
   let settings='';
   if (item.kind==='moving' || item.kind==='stopped') settings=field('Speed threshold (px/s)','threshold',item.threshold??1,'number');
   if (item.kind==='variable') {
    const value=Object.hasOwn(item,'value')?(typeof item.value==='string'&&item.raw?item.value:JSON.stringify(item.value)):'0';
    settings='<div class="two">'+field('Instance variable','variable',item.variable??Object.keys(type.vars??{})[0]??'')+
     select('Comparison','operator',item.operator??'==',animationComparisons.map(op=>[op,op]))+'</div>'+
     field('Value (JSON)','value',value);
   }
   if (item.kind==='finished') settings='<p class="muted animation-rule-note">Matches when the current state’s clip finishes playing once.</p>';
   return `<div class="animation-rule-condition"><div class="animation-rule-kind">
    ${select('Condition','kind',item.kind,machineConditionKinds)}
    <button type="button" data-remove-rule="${index}" ${items.length===1?'disabled':''}
     title="Remove condition" aria-label="Remove condition">×</button></div>${settings}</div>`;
  }).join('')+`<button type="button" data-add-rule ${items.length>=8?'disabled':''}>+ Condition</button>`;
 }
 function draft() { return readRules().map(rule=>({...rule,raw:true})); }
 root.addEventListener('change',event=>{
  if (event.target.dataset.field==='kind') draw(draft());
 });
 root.addEventListener('click',event=>{
  const control=event.target.closest('button');
  if (!control) return;
  const items=draft();
  if (control.hasAttribute('data-add-rule')) items.push({kind:'moving',threshold:1});
  else items.splice(Number(control.dataset.removeRule),1);
  draw(items);
 });
 draw(defaults);
}

const animationStateBlockKinds=new Set(['animationState','animationStateEntered','setAnimationState']);
function machineUsedInEvents(type,states) {
 const ids=new Set(states.map(state=>state.id));
 const names=new Set(states.map(state=>state.name.toLowerCase()));
 for (const {event,source} of projectEventRows(P)) for (const block of [...event.conditions,...event.actions]) {
  if (!animationStateBlockKinds.has(block.kind)) continue;
  const target=block.args?.object, state=String(block.args?.state??'');
  const forType=target===type.id || target===SELF_TARGET && source.kind==='behavior' &&
   type.behaviors.some(behavior=>behavior.id===source.id);
  if (forType && (ids.has(state) || names.has(state.trim().toLowerCase()))) return true;
 }
 return false;
}

function animationMachineAction(type,action,id) {
 const machine=type?.animator?.machine;
 if (!type) return;
 if (action==='create') return newAnimationMachine(type);
 if (!machine) return;
 const state=machine.states.find(item=>item.id===id);
 const position=machine.transitions.findIndex(rule=>rule.id===id);
 const rule=machine.transitions[position];
 switch (action) {
 case 'toggle': change(()=>{machine.enabled=!machine.enabled;}); break;
 case 'newState': stateDialog(type); break;
 case 'editState': if (state) stateDialog(type,state); break;
 case 'initial': if (state && machine.initial!==id) change(()=>{machine.initial=id;}); break;
 case 'deleteState':
  if (!state || machine.states.length===1) break;
  if (machineUsedInEvents(type,[state])) return alert('This state is used by an event sheet. Update that block before deleting the state.');
  if (confirm('Delete “'+state.name+'” and its transitions?')) change(()=>{
   machine.states=machine.states.filter(item=>item!==state);
   machine.transitions=machine.transitions.filter(item=>item.from!==id && item.to!==id);
   if (machine.initial===id) machine.initial=machine.states[0].id;
  });
  break;
 case 'newRule': machineRuleDialog(type); break;
 case 'editRule': if (rule) machineRuleDialog(type,rule); break;
 case 'deleteRule': if (rule) change(()=>{machine.transitions.splice(position,1);}); break;
 case 'raiseRule': case 'lowerRule': {
  const next=position+(action==='raiseRule'?-1:1);
  if (!rule || !machine.transitions[next]) break;
  change(()=>{ [machine.transitions[position],machine.transitions[next]]=[machine.transitions[next],rule]; });
  break;
 }
 case 'remove':
  if (machineUsedInEvents(type,machine.states)) return alert('This machine is used by an event sheet. Update those blocks before removing it.');
  if (confirm('Remove the state machine from '+type.name+'?')) change(()=>{delete type.animator.machine;});
  break;
 }
}

function renderAnimationMachine(type) {
 const view=$('#animation-machine-view');
 const animator=type?.animator;
 view.model={name:type?.name, clips:animator?.clips??[], machine:animator?.machine,
  conditions:animator?.machine?.transitions.map(rule=>rule.conditions.map(describeAnimationCondition))??[]};
 $('#animation-inspector').innerHTML=type ? '<div class="panelhead">PLAYBACK</div><div class="prop-group">'+
  (animator?.clips.length?select('Autoplay clip','anim-autoplay',animator.autoplay,[['','None'],...animator.clips.map(clip=>[clip.id,clip.name])]):'')+
  '<p class="muted">An enabled machine starts in its initial state. Inspect the running instance in Preview to see transition history.</p></div>' : '';
}

function setupAnimationMachine() {
 $('#animation-machine-view').addEventListener('machine-control',event=>{
  if (tab==='animate' && animator.mode==='machine') animationMachineAction(animatorType(),event.detail.action,event.detail.id);
 });
}

function animationDemoProject() {
 const project=demo(), player=project.types.find(type=>type.id==='player');
 const canvas=spriteCanvas(128,16), ctx=canvas.getContext('2d');
 const draw=(frame,x,y,w,h,color)=>{
  ctx.fillStyle=color;
  ctx.fillRect(frame*16+x,y,w,h);
 };
 const solid='#163345', mint='#64deba', dark='#308775', light='#9aefd5', gold='#ffc56b';
 for (let frame=0;frame<8;frame++) {
  const walk=frame>=2 && frame<=5, pickup=frame>=6;
  const bob=walk && frame%2 || pickup?-1:0;
  const p=(x,y,w,h,color)=>draw(frame,x,y+bob,w,h,color);
  const foot=walk?(frame-2)%4:0;
  const left=[0,-1,1,0][foot], right=[0,1,-1,0][foot];
  p(3,3,10,9,solid);p(4,2,8,2,solid);p(4,4,8,7,mint);
  p(5,3,6,1,light);p(5,10,6,1,dark);
  p(5,6,2,frame===1?1:2,'#effbf7');p(9,6,2,frame===1?1:2,'#effbf7');
  p(7,3,2,1,pickup?gold:dark);p(7,8,2,1,solid);
  p(4,12+left,3,2,solid);p(9,12+right,3,2,solid);
  if (pickup) {
   const offset=frame===7?1:0;
   p(1,5-offset,2,1,gold);p(13,6-offset,2,1,gold);p(7,1,2,1,gold);
  }
 }
 const image=canvas.toDataURL('image/png');
 const grid=spriteSheetGrid(128,16,{w:16,h:16});
 const doc=newSpriteDocument('Shard Runner Player',128,16,grid);
 const timings=[710,90,92,92,92,92,115,165];
 doc.frames=timings.map((duration,index)=>({id:'shard-frame-'+index,duration}));
 project.spriteDocuments.push(doc);
 project.spriteLayers.push(makeSpriteLayer(doc,'Player artwork',image));
 const clip=(name,id,indexes,loop='loop')=>({name,id,loop,duration:0,tracks:{},
  frames:indexes.map(tile=>({tile,duration:timings[tile]}))});
 player.image=image;
 player.sheet={...grid};
 player.spriteDocument=doc.id;
 player.animator={autoplay:'idle-clip',clips:[clip('Idle','idle-clip',[0,1]),clip('Walk','walk-clip',[2,3,4,5]),
  clip('Pickup','pickup-clip',[6,7],'once')],machine:{
  enabled:true,initial:'idle',states:[{id:'idle',name:'Idle',clip:'idle-clip'},{id:'walk',name:'Walk',clip:'walk-clip'},
   {id:'pickup',name:'Pickup',clip:'pickup-clip'}],
  transitions:[
   {id:'walk-when-moving',from:'idle',to:'walk',conditions:[{kind:'moving',threshold:1}]},
   {id:'idle-when-stopped',from:'walk',to:'idle',conditions:[{kind:'stopped',threshold:1}]},
   {id:'walk-after-pickup',from:'pickup',to:'walk',conditions:[{kind:'finished'},{kind:'moving',threshold:1}]},
   {id:'idle-after-pickup',from:'pickup',to:'idle',conditions:[{kind:'finished'}]},
  ],
 }};
 const pickup=project.layouts.find(layout=>layout.id==='arena').events.find(row=>
  row.conditions.some(condition=>condition.kind==='collision' && condition.args.other==='coin'));
 pickup.actions.push(block('setAnimationState',{object:'player',state:'pickup',restart:'true'}));
 project.name='Shard Runner — Animation Demo';
 return project;
}

function loadAnimationDemo() {
 if (!confirm('Load the Shard Runner animation demo? Save your current project first.')) return;
 change(()=>{
  P=animationDemoProject();
  selected=openSheetId=null;
  activeType='player';
  animator.mode='machine';
  tab='animate';
 });
}
