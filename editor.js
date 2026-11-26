const $=s=>document.querySelector(s),uid=()=>Math.random().toString(36).slice(2,10),clone=x=>structuredClone(x),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const C={start:['System','On start of layout',[]],tick:['System','Every tick',[]],keyDown:['Keyboard','Key is down',[['key','Key','Right']]],keyPressed:['Keyboard','On key pressed',[['key','Key','Space']]],mousePressed:['Mouse','On button clicked',[['button','Mouse button','@mouseButton']]],compare:['System','Compare expression',[['expr','Expression','Score >= 5']]],every:['System','Every N seconds',[['seconds','Seconds','1']]],exists:['Object','Instances exist',[['object','Object','@object']]],filter:['Object','Pick by expression',[['object','Object','@object'],['expr','Expression','Self.x > 100']]],overlap:['Object','Is overlapping',[['object','Object','@object'],['other','Other object','@object']]],collision:['Object','On collision with',[['object','Object','@object'],['other','Other object','@object']]]};
const A={setGlobal:['System','Set global',[['name','Variable','@global'],['value','Value','0']]],addGlobal:['System','Add to global',[['name','Variable','@global'],['value','Amount','1']]],create:['System','Create instance',[['object','Object','@object'],['x','X','100'],['y','Y','100']]],layout:['System','Go to layout',[['layout','Layout','@layout']]],restart:['System','Restart layout',[]],log:['System','Log message',[['value','Expression','"Hello"']]],sound:['Audio','Play tone',[['frequency','Frequency','660'],['duration','Seconds','0.12']]],set:['Object','Set property',[['object','Object','@object'],['property','Property','x'],['value','Value','0']]],add:['Object','Add to property',[['object','Object','@object'],['property','Property','x'],['value','Amount','100 * dt']]],position:['Object','Set position',[['object','Object','@object'],['x','X','100'],['y','Y','100']]],destroy:['Object','Destroy',[['object','Object','@object']]],jump:['Object','Jump',[['object','Object','@object'],['value','Speed','380']]],text:['Object','Set text',[['object','Object','@object'],['value','Text expression','"Score: " + Score']]],instance:['Object','Set instance variable',[['object','Object','@object'],['name','Variable','Health'],['value','Value','10']]]};
Object.assign(A,{call:['Functions','Call function',[['name','Function name','Damage'],['values','Argument expressions (JSON array)','["10"]'],['result','Result global (optional)','']]],return:['Functions','Return value',[['value','Expression','0']]],setLocal:['Functions','Set local variable',[['name','Name','amount'],['value','Expression','0']]],setEntry:['Collections','Set array or dictionary entry',[['name','Global variable','@global'],['key','Index or key expression','0'],['value','Value expression','1']]],animation:['Sprite','Set animation frame',[['object','Object','@object'],['value','Frame index','0']]],damage:['Health','Damage',[['object','Object','@object'],['value','Amount','10']]],heal:['Health','Heal',[['object','Object','@object'],['value','Amount','10']]]});
C.clipPlaying = ['Animation','Is clip playing',[['object','Object','@object'],['clip','Clip name (optional)','']]];
C.clipFinished = ['Animation','On clip finished',[['object','Object','@object'],['clip','Clip name (optional)','']]];
C.animationState = ['Animation','Is in animation state',[['object','Object','@object'],['state','State','@animationState']]];
C.animationStateEntered = ['Animation','On animation state entered',[['object','Object','@object'],['state','State','@animationState']]];
A.setAnimationState = ['Animation','Set animation state',[['object','Object','@object'],['state','State','@animationState'],['restart','Restart expression','false']]];
A.playClip = ['Animation','Play clip',[['object','Object','@object'],['clip','Clip name','Idle'],['restart','Restart expression','false']]];
A.stopClip = ['Animation','Stop clip',[['object','Object','@object']]];
C.tileTag = ['Tilemap','Is standing on tagged tile',[['object','Object','@object'],['layer','Tile layer','Ground'],['tag','Tag','@tileTag']]];
Object.assign(C, {
 navigating: ['Navigation','Is navigating',[['object','Object','@object']]],
 navArrived: ['Navigation','On destination reached',[['object','Object','@object']]],
 navFailed: ['Navigation','On navigation failed',[['object','Object','@object']]],
});
Object.assign(A, {
 cameraFollow: ['Camera','Follow object',[['object','Object','@object']]],
 cameraPosition: ['Camera','Set camera center',[['x','World X','320'],['y','World Y','180']]],
 cameraZoom: ['Camera','Set camera zoom',[['zoom','Zoom','1.5']]],
 cameraShake: ['Camera','Shake camera',[['strength','Strength (screen px)','8'],['duration','Duration (s)','0.3']]],
 emitParticles: ['Particles','Emit particle burst',[['object','Emitter','@object'],['count','Count','12']]],
 navigate: ['Navigation','Navigate to point',[['object','Object','@object'],['x','World X','Mouse.x'],['y','World Y','Mouse.y'],['restart','Replan same cell expression','false']]],
 stopNavigation: ['Navigation','Stop navigation',[['object','Object','@object']]],
});
Object.assign(C,{
 inputPressed: ['Input','On action pressed',[['input','Input action','@input']]],
 inputDown: ['Input','Is action held',[['input','Input action','@input']]],
 uiActivated: ['UI','On button activated',[['control','Button','@uiButton']]],
 uiChanged: ['UI','On control value changed',[['control','Control','@uiSetting']]],
 uiOpened: ['UI','On screen shown',[['screen','Screen','@uiScreen']]],
});
Object.assign(A,{
 showUI: ['UI','Show UI screen',[['screen','Screen','@uiScreen']]],
 restoreUI: ['UI','Restore layout UI',[]],
 audioVolume: ['Audio','Set master volume',[['value','Percent','100']]],
 playAudio: ['Audio','Play audio',[['clip','Clip','@audioClip'],['bus','Channel','@audioBus'],['volume','Volume (%)','100'],['loop','Loop expression','false'],['tag','Tag (optional)','']]],
 stopAudio: ['Audio','Stop audio',[['tag','Tag (empty stops all)','']]],
 fadeAudio: ['Audio','Fade audio',[['tag','Tag (empty fades all)','music'],['value','Target volume (%)','25'],['duration','Seconds','0.3']]],
 audioBusVolume: ['Audio','Set channel volume',[['bus','Channel','@mixBus'],['value','Volume (%)','100'],['duration','Fade seconds','0']]],
 fullscreen: ['Display','Set fullscreen from global',[['name','Boolean global','@global']]],
});
C.triggerOnce=['System','Trigger once while true',[]];
C.groupActive=['Groups','Is group active',[['group','Group','@group']]];
A.setGroupActive=['Groups','Set group active',[['group','Group','@group'],['active','Status','@activation']]];
A.aimAt=['Transform','Set angle toward position',[['object','Object','@object'],['x','X','Mouse.X'],['y','Y','Mouse.Y']]];
A.spawn=['Object','Spawn object',[['object','Object','@object'],['child','Spawned object','@object'],['x','X','Self.x + Self.w / 2'],['y','Y','Self.y + Self.h / 2']]];
const BEHAVIOR_CONDITIONS = { created: ['Self', 'On instance created', []], ...C };
A.setDataRow = ['Data','Set global to data row',[['name','Global','@global'],['row','Row','@dataRow']]];
A.setGlobalFromData = ['Data','Set global from data field',[['name','Global','@global'],['field','Field','@dataField']]];
A.moveSolid = ['Object', 'Move with solid collisions', [['object', 'Object', '@object'], ['x', 'Delta X', '0'], ['y', 'Delta Y', '0']]];
function event(conditions=[],actions=[],children=[]){return {id:uid(),conditions,actions,children,mode:'and',repeat:'1',disabled:false}}const block=(kind,args={})=>({kind,args});
function demo(){let types=[{id:'player',name:'Player',color:'#61d6b3',shape:'player',kind:'sprite',w:24,h:24,behaviors:[{id:'move8',settings:{speed:160}},{id:'bound',settings:{}}],vars:{Health:3}},{id:'coin',name:'Coin',color:'#f4c35d',shape:'diamond',kind:'sprite',w:17,h:17,behaviors:[{id:'rotate',settings:{rotation:65}}],vars:{}},{id:'wall',name:'Wall',color:'#344d63',shape:'rect',kind:'sprite',w:32,h:32,behaviors:[{id:'solid',settings:{}}],vars:{}},{id:'enemy',name:'Enemy',color:'#f07888',shape:'enemy',kind:'sprite',w:25,h:25,behaviors:[{id:'bullet',settings:{speed:95,bounce:true}}],vars:{}},{id:'gate',name:'Gate',color:'#9b83f6',shape:'rect',kind:'sprite',w:36,h:36,behaviors:[],vars:{}},{id:'hud',name:'HUD',color:'#ecf0e6',kind:'text',w:540,h:24,text:'COLLECT THE SHARDS',behaviors:[],vars:{}}];let inst=(type,x,y,w,h,extra={})=>({id:uid(),type,x,y,w,h,angle:0,opacity:1,...extra});let coins=[[80,110],[305,100],[550,120],[135,280],[490,265],[310,330]];let instances=[...[[0,0,640,18],[0,342,640,18],[0,0,18,360],[622,0,18,360],[210,72,24,142],[405,145,24,130],[82,225,115,20],[460,62,115,20]].map(q=>inst('wall',...q)),...coins.map(([x,y])=>inst('coin',x,y,17,17)),inst('gate',570,285,36,36),inst('enemy',270,180,25,25,{angle:32}),inst('enemy',505,185,25,25,{angle:155}),inst('player',42,55,24,24),inst('hud',28,20,540,24)];let ev=[event([block('start')],[block('setGlobal',{name:'Score',value:'0'}),block('setGlobal',{name:'Health',value:'3'})]),event([block('collision',{object:'player',other:'coin'})],[block('destroy',{object:'coin'}),block('addGlobal',{name:'Score',value:'1'}),block('sound',{frequency:'880',duration:'.08'})]),event([block('collision',{object:'player',other:'enemy'})],[block('addGlobal',{name:'Health',value:'-1'}),block('position',{object:'player',x:'42',y:'55'}),block('sound',{frequency:'180',duration:'.16'})]),event([block('compare',{expr:'Health <= 0'})],[block('layout',{layout:'lose'})]),event([block('overlap',{object:'player',other:'gate'}),block('compare',{expr:'Score >= 6'})],[block('layout',{layout:'win'})]),event([block('tick')],[block('text',{object:'hud',value:'"SHARDS " + Score + "/6    HEALTH " + Health + "    FIND THE GATE"'})])];let screen=(id,name,msg,bg)=>({id,name,width:640,height:360,background:bg,instances:[inst('hud',95,145,450,40,{text:msg}),inst('hud',155,205,350,23,{text:'PRESS R TO PLAY AGAIN'})],events:[event([block('keyPressed',{key:'R'})],[block('layout',{layout:'arena'})])]});return {version:12,eventSheets:[],spriteDocuments:[],spriteLayers:[],audioClips:[],audioMixer:{...audioDefaults},uiScreens:[],uiStyles:[],inputActions:[],prefabs:[],extensions:[],tilesets:[],enums:[],name:'Shard Runner',activeLayout:'arena',behaviorSheets:[],globals:[{name:'Score',value:0},{name:'Health',value:3}],types,layouts:[{id:'arena',name:'Arena',width:640,height:360,background:'#142535',instances,events:ev},screen('win','Victory','ALL SHARDS RECOVERED','#193c37'),screen('lose','Game Over','THE SHARDS ARE LOST','#3b2335')]}}
let P=demo(),selected=null,activeType='player',tab='layout',dirty=false,snap=16,zoom=1,history=[],future=[],runtime=null,drag=null,images=new Map(),modalCallback=null,openSheetId=null;
const L=()=>P.layouts.find(l=>l.id===P.activeLayout)||P.layouts[0],T=id=>P.types.find(t=>t.id===id),I=()=>L().instances.find(i=>i.id===selected);function validate(p){if(!p||![1,2,3,4,5,6,7,8,9,10,11,12].includes(p.version)||!Array.isArray(p.layouts)||!p.layouts.length||!Array.isArray(p.types)||!Array.isArray(p.globals)||!p.layouts.every(l=>Array.isArray(l.instances)&&Array.isArray(l.events)&&l.width>0&&l.height>0&&l.width<=4096&&l.height<=4096))throw Error('Invalid VOID Studio project');return normalizeProjectTree(validateProjectData(validateEventSheets(validateSpriteDocuments(validateProjectAudio(validateGameUI(validateProjectComponents(validateAssetProject(validateBehaviorSheets(normalizeProjectBehaviors(p))))))))))}
const currentSheet = () => P.behaviorSheets.find(sheet => sheet.id === openSheetId);
const currentEvents = () => editorEventSheet().events;

const validBehaviorId = id => typeof id === 'string' && /^custom-[a-z0-9_-]+$/i.test(id);
const validSettingName = name => /^[A-Za-z_$][\w$]*$/.test(name) && !['__proto__', 'constructor', 'prototype'].includes(name);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function validBehaviorDefaults(defaults) {
 return isRecord(defaults) && Object.entries(defaults).every(([key, value]) =>
  validSettingName(key) && (typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value)));
}

function validateBehaviorSheets(project) {
 const sheets = project.behaviorSheets;
 if (!Array.isArray(sheets) || !sheets.every(sheet => sheet && validBehaviorId(sheet.id) &&
  typeof sheet.name === 'string' && Array.isArray(sheet.events) && validBehaviorDefaults(sheet.defaults))) {
  throw Error('Invalid custom behavior sheets');
 }
 const ids = new Set(sheets.map(sheet => sheet.id));
 if (ids.size !== sheets.length || project.types.some(type => !type.behaviors.every(attachment =>
  attachment && (builtInBehavior(attachment.id) || ids.has(attachment.id)) && isRecord(attachment.settings)))) {
  throw Error('Invalid behavior attachments');
 }
 return project;
}

function objectTargetName(id) {
 return id === SELF_TARGET ? 'Self' : T(id)?.name || 'Missing object';
}

function configureSceneCamera(layout) {
 const settings = layout.camera ?? { width: layout.width, height: layout.height, zoom: 1, response: 8, target: '', bounds: true, guide: true };
 const numeric = [['width', 'Viewport width'], ['height', 'Viewport height'], ['zoom', 'Zoom'], ['response', 'Follow response (0 is instant)']];
 const yesNo = [['true','Yes'],['false','No']];
 dialog('Camera Settings',
  `<div class="two">${numeric.map(([key,label]) => field(label,key,settings[key],'number')).join('')}</div>` +
  select('Follow object type','target',settings.target,[['','No target'],...P.types.map(type => [type.id,type.name])]) +
  select('Clamp to layout bounds','bounds',String(settings.bounds),yesNo) +
  select('Show camera guide in editor','guide',String(settings.guide),yesNo) +
  (layout.camera ? button('Reset to full layout','cameraReset','ghost') : ''), () => {
   const values = Object.fromEntries([...$('#dialogbody').querySelectorAll('[data-field]')].map(input => [input.dataset.field, input.value]));
   const numbers = Object.fromEntries(numeric.map(([key]) => [key, Number(values[key])]));
   const camera = { ...numbers, target: values.target, bounds: values.bounds === 'true', guide: values.guide === 'true' };
   if (!validSceneCamera(camera)) throw Error('Use a 64–4096 px viewport, zoom from 0.1–8, and follow response from 0–60');
   change(() => { layout.camera = camera; });
  });
}

function drawCameraGuide(context, layout) {
 if (!layout.camera?.guide) return;
 const camera = createSceneCamera(layout);
 camera.place(0, expandedLayoutInstances(P,layout), true);
 const view = camera.view;
 context.save();
 context.strokeStyle = '#b3dcff';
 context.lineWidth = 1.5 / zoom;
 context.setLineDash([5 / zoom, 4 / zoom]);
 context.strokeRect(view.left, view.top, view.width / view.zoom, view.height / view.zoom);
 context.restore();
}

function renderBehaviors(type) {
 const attached = type.behaviors.map(({ id, settings }) => {
  const builtIn = builtInBehavior(id);
  const sheet = P.behaviorSheets.find(item => item.id === id);
  const fields = builtIn?.fields ?? customBehaviorFields(sheet);
  const values = behaviorSettings(fields, settings);
  const art = id === 'particles' ? (values.sprite === '$emitter' ? type : T(values.sprite)) : null;
  const sprite = art?.kind === 'sprite' && art.image ? art : null;
  const inputs = fields.map(([key, label, fallback]) => {
   const fieldId = `behavior.${id}.${key}`;
   if (id === 'particles' && key === 'sprite') {
    const self = type.kind === 'sprite' && type.image ? [['$emitter', 'This object’s sprite']] : [];
    const sources = P.types.filter(other => other !== type && other.kind === 'sprite' && other.image).map(other => [other.id,other.name]);
    return select(label,fieldId,values.sprite,[['','Colored shape'],...self,...sources]);
   }
   if (id === 'particles' && key === 'clip') {
    return sprite ? select(label,fieldId,values.clip,[['','Autoplay or sheet FPS'],...(sprite.animator?.clips ?? []).map(clip => [clip.id,clip.name])]) : '';
   }
   if (id === 'particles' && key === 'animationSpeed' && !sprite) return '';
   if (id === 'particles' && ['startColor','endColor'].includes(key)) return sprite ? '' : field(label,fieldId,values[key],'color');
   return typeof fallback === 'boolean' ? checkbox(label, fieldId, values[key])
    : field(label, fieldId, values[key], typeof fallback === 'number' ? 'number' : 'text');
  }).join('');
  return `<div class="attached-behavior"><div class="behavior-title">
   <strong>${esc(builtIn?.name ?? sheet.name)}</strong>
   ${button('Remove', `removeBehavior:${id}`, 'ghost')}
  </div>${id === 'particles' ? '<p class="muted">Choose a sprite type to reuse its image and animation clips.</p>' : ''}${inputs}${sheet ? button('Open Event Sheet', `openBehavior:${id}`) : ''}</div>`;
 }).join('');

 return `<div class="prop-group"><h4>BEHAVIORS</h4>${button('+ Add Behavior', 'addBehavior')}${attached}</div>`;
}

function showBehaviorPicker(type) {
 const attached = new Set(type.behaviors.map(behavior => behavior.id));
 const option = (id, name, description) => `<label class="behavior-choice">
  <input type="radio" name="behavior-choice" value="${esc(id)}">
  <span><strong>${esc(name)}</strong><small>${esc(description)}</small></span>
 </label>`;
 const builtIns = Object.entries(BUILT_IN_BEHAVIORS).filter(([id]) => !attached.has(id))
  .map(([id, definition]) => option(id, definition.name, definition.description)).join('');
 const custom = P.behaviorSheets.filter(sheet => !attached.has(sheet.id))
  .map(sheet => option(sheet.id, sheet.name, 'Custom event sheet')).join('');

 dialog(`Add Behavior to ${type.name}`, `
  ${builtIns ? `<fieldset class="behavior-catalog"><legend>Built-in</legend>${builtIns}</fieldset>` : ''}
  ${custom ? `<fieldset class="behavior-catalog"><legend>Project</legend>${custom}</fieldset>` : ''}
  ${button('+ Create Custom Behavior', 'newBehavior')}`, () => {
   const choice = $('#dialogbody input[name="behavior-choice"]:checked');
   if (choice) change(() => type.behaviors.push({ id: choice.value, settings: {} }));
  }, 'Add Behavior');
 $('#dialogok').disabled = true;
 $('#dialogbody').querySelectorAll('input[name="behavior-choice"]').forEach(input => {
  input.onchange = () => { $('#dialogok').disabled = false; };
 });
}

function openBehaviorSheet(id) {
 openSheetId = id;
 tab = 'events';
}

function behaviorSheetName(value, currentId) {
 const name = value.trim();
 if (!name || name.length > 80 || P.behaviorSheets.some(sheet => sheet.id !== currentId &&
  sheet.name.toLowerCase() === name.toLowerCase())) throw Error('Enter a unique behavior name, up to 80 characters');
 return name;
}

function createBehaviorSheet(type) {
 $('#dialog').close();
 simple('Create Custom Behavior', field('Name', 'name', ''), values => {
  const name = behaviorSheetName(values.name);
  change(() => {
   const id = 'custom-' + uid();
   P.behaviorSheets.push({ id, name, defaults: {}, events: [] });
   type.behaviors.push({ id, settings: {} });
   openBehaviorSheet(id);
  });
 });
}

function editBehaviorSheet(sheet) {
 dialog('Behavior Settings', field('Name', 'name', sheet.name) +
  `<label>Default settings (JSON)<textarea id="behavior-defaults" rows="5">${esc(JSON.stringify(sheet.defaults, null, 2))}</textarea></label>
  <p class="muted">Use numbers, text, or true/false. A setting named speed is available as <code>Settings.speed</code>.</p>`, () => {
   const name = behaviorSheetName($('#dialogbody [data-field="name"]').value, sheet.id);
   const defaults = JSON.parse($('#behavior-defaults').value);
   if (!validBehaviorDefaults(defaults)) throw Error('Use an object with identifier keys and number, text, or true/false values');
   change(() => {
    sheet.name = name;
    sheet.defaults = defaults;
    for (const type of P.types) {
     const attachment = type.behaviors.find(behavior => behavior.id === sheet.id);
     if (!attachment) continue;
     for (const key of Object.keys(attachment.settings)) {
      if (!Object.hasOwn(defaults, key) || typeof attachment.settings[key] !== typeof defaults[key]) {
       delete attachment.settings[key];
      }
     }
    }
   });
  });
}

function deleteBehaviorSheet(sheet) {
 if (!confirm(`Delete ${sheet.name} and detach it from every object?`)) return;
 change(() => {
  P.behaviorSheets = P.behaviorSheets.filter(item => item.id !== sheet.id);
  for (const type of P.types) type.behaviors = type.behaviors.filter(attachment => attachment.id !== sheet.id);
  openSheetId = null;
 });
}

function checkpoint(){history.push(JSON.stringify(P));if(history.length>60)history.shift();future=[];dirty=true}function persist(){let stored=true;try{localStorage.setItem('void-creator-v1',JSON.stringify(P))}catch{stored=false}$('#projectname').textContent=P.name;$('#status').textContent=stored?(dirty?'Local autosave • '+L().name:'Ready • '+L().name):'Autosave storage is full. Save the project to disk.';$('#undo').disabled=!history.length;$('#redo').disabled=!future.length}function change(fn){checkpoint();fn();render()}
function button(label,action,cls=''){return `<button class="${cls}" data-act="${action}">${esc(label)}</button>`}function field(label,id,value,type='text'){return `<label>${esc(label)}<input data-field="${id}" type="${type}" value="${esc(value)}" ${type==='number'?'step="any"':''}></label>`}function checkbox(label,id,v){return `<label class="check"><input type="checkbox" data-field="${id}" ${v?'checked':''}>${esc(label)}</label>`}function select(label,id,value,options){return `<label>${esc(label)}<select data-field="${id}">${options.map(([v,n])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(n)}</option>`).join('')}</select></label>`}
function render() {
 if (tab !== 'sprite') stopSpriteTimeline(false);
 if (tab !== 'audio') haltAudioAudition(true);
 const layout = L(), instances = expandedLayoutInstances(P,layout);
 if (componentSelection.layout !== layout) clearComponentSelection();
 const canCreatePrefab = Boolean(I() || componentSelection.members.size);
 $('#create-prefab').disabled = !canCreatePrefab;
 $('#project-create-prefab').disabled = !canCreatePrefab;
 for (const [workspace,id] of [['layout','layout'],['events','event'],['tiles','tile'],['animate','anim'],['ui','ui'],['audio','audio'],['sprite','sprite'],['data','data']]) {
  $('#' + id + 'tab').classList.toggle('active',tab === workspace);
  $('#' + id + 'view').hidden = tab !== workspace;
 }
 for (const [workspace,id] of [['tiles','tile'],['ui','ui'],['sprite','sprite']]) {
  $('#' + id + '-sidebar').hidden = tab !== workspace;
 }
 $('#project-inspector').hidden = tab !== 'layout' && tab !== 'events';
 for (const [workspace,id] of [['tiles','tile'],['animate','animation'],['ui','ui'],['audio','audio'],['sprite','sprite'],['data','data']]) {
  $('#' + id + '-inspector').hidden = tab !== workspace;
 }
 $('#rendererChoice').value = P.renderer || 'auto';
 $('#executionChoice').value = P.executionMode === 'interpreted' ? 'interpreted' : 'compiled';
 $('#layoutlabel').textContent = layout.name + '  /  ' + layout.width + ' × ' + layout.height;
 $('#sheettools').hidden = !currentSheet();
 $('#count').textContent = instances.length + ' instances';
 $('#eventcount').textContent = currentEvents().length + ' events';
 if (tab === 'tiles') renderTileEditor();
 else if (tab === 'animate') renderAnimator();
 else {
  haltAnimator();
  if (tab === 'ui') renderUIWorkspace();
  else if (tab === 'audio') renderAudioWorkspace();
  else if (tab === 'sprite') renderSpriteEditor();
  else if (tab === 'data') renderDataWorkspace();
  else { drawEditor(); renderProperties(); renderEvents(); }
 }
 renderProjectPanel();
 renderStudioMenu();
 persist();
}
function drawEditor(){let l=L(),c=$('#stage'),ctx=c.getContext('2d');if(c.width!==l.width)c.width=l.width;if(c.height!==l.height)c.height=l.height;c.style.width=l.width*zoom+'px';c.style.height=l.height*zoom+'px';ctx.imageSmoothingEnabled=false;ctx.fillStyle=l.background;ctx.fillRect(0,0,c.width,c.height);const atlases=availableAtlases();drawTileLayers(ctx,l.tilemap,atlases,images,(l.tilemap?.layers??[]).filter(layer=>!layer.above));if(snap){ctx.strokeStyle='#ffffff13';ctx.lineWidth=1;ctx.beginPath();for(let x=0;x<c.width;x+=snap){ctx.moveTo(x+.5,0);ctx.lineTo(x+.5,c.height)}for(let y=0;y<c.height;y+=snap){ctx.moveTo(0,y+.5);ctx.lineTo(c.width,y+.5)}ctx.stroke()}const linked=selectedPrefabPlacement();for(let o of tileObjectOrder(l,expandedLayoutInstances(P,l))){let t=T(o.type);if(!t)continue;drawObjectPose(ctx,t,layoutSpritePose(t,o),images);if(o.id===selected){ctx.strokeStyle='#6cd5ff';ctx.lineWidth=1.5;ctx.strokeRect(o.x-.5,o.y-.5,o.w+1,o.h+1);ctx.fillStyle='#6cd5ff';for(let [x,y] of [[o.x,o.y],[o.x+o.w,o.y],[o.x,o.y+o.h],[o.x+o.w,o.y+o.h]])ctx.fillRect(x-3,y-3,6,6)}else if(componentSelection.members.has(o.id)||linked&&typeof o.id==='string'&&o.id.startsWith(linked.id+'/'))outlinePrefabMember(ctx,o,zoom)}drawTileLayers(ctx,l.tilemap,atlases,images,(l.tilemap?.layers??[]).filter(layer=>layer.above));drawCameraGuide(ctx,l);}
function renderProperties(){let o=I(),t=T(o?.type||activeType),l=L(),html=prefabProperties()+'<div class="prop-group"><h4>SCENE</h4>'+field('Name','layout.name',l.name)+`<div class="two">${field('Width','layout.width',l.width,'number')}${field('Height','layout.height',l.height,'number')}</div>`+field('Background','layout.background',l.background,'color')+select('Event sheet','layout.eventSheet',l.eventSheet??'',[['','Scene event sheet'],...(P.eventSheets??[]).map(sheet=>[sheet.id,sheet.name])])+select('Starting UI','layout.uiScreen',l.uiScreen??'',uiStartOptions())+button('Camera Settings','cameraSettings')+button('Delete scene','deleteLayout','danger ghost')+'</div>';if(o)html+='<div class="prop-group"><h4>INSTANCE <span>'+esc(t?.name)+'</span></h4><div class="two">'+['x','y','w','h','angle','opacity'].map(k=>field(({w:'Width',h:'Height',x:'X',y:'Y',angle:'Angle',opacity:'Opacity'})[k],'instance.'+k,o[k]??(k==='opacity'?1:0),'number')).join('')+'</div>'+(t?.kind==='text'?field('Text','instance.text',o.text??t.text):'')+`<div class="two">${button('Duplicate','duplicate')}${button('Delete','deleteInstance','danger')}</div></div>`;if(t)html+='<div class="prop-group"><h4>OBJECT</h4>'+field('Name','type.name',t.name)+select('Kind','type.kind',t.kind,[['sprite','Sprite'],['text','Text']])+checkbox('Screen space (HUD)','type.screenSpace',t.screenSpace)+field('Color','type.color',t.color,'color')+select('Shape','type.shape',t.shape||'rect',[['rect','Rectangle'],['circle','Circle'],['diamond','Diamond'],['player','Hero'],['enemy','Enemy']])+`<div class="two">${field('Default W','type.w',t.w,'number')}${field('Default H','type.h',t.h,'number')}</div>`+(t.kind==='text'?field('Default text','type.text',t.text||''):'')+(t.kind==='sprite'?button('Edit Sprite','sprite:editObject'):'')+button(t.image?'Replace image':'Import sprite PNG','image')+(t.image?button('Sprite sheet / animation','sheet')+button('Remove image','removeImage'):'')+(t.sheet?'<p class="muted">'+esc(t.sheet.count)+' frames · '+esc(t.sheet.fps)+' FPS</p>':'')+button('Place instance','place','primary')+button('Delete object','deleteType','danger ghost')+'</div>'+dataObjectBinding(t)+renderBehaviors(t)+`<div class="prop-group"><h4>INSTANCE VARIABLES</h4>${Object.entries(t.vars||{}).map(([k,v])=>field(k,'var.'+k,JSON.stringify(v))).join('')}${button('+ Add variable','addInstanceVar')}</div>`;$('#properties').innerHTML=html}
function locate(id,list=currentEvents()){for(let e of list){if(e.id===id)return {e,list};let q=locate(id,e.children||[]);if(q)return q}return null}
function formatBlock(block,catalog) {
 const definition=catalog[block.kind];
 if (!Object.hasOwn(catalog,block.kind)) return 'Unavailable block · '+esc(block.kind);
 const info=block.args??{}, owner=eventOwnerFor(block.kind,definition,info), type=T(info.object);
 const groups=Object.values(info).length && definition[2].some(field=>field[2]==='@group')?eventGroupOptions():[];
 const details=definition[2].filter(([key])=>key!=='object' || block.kind==='create').map(([key,,schema])=>{
  const value=info[key];
  if (schema==='@object') return objectTargetName(value);
  if (schema==='@animationState') return animationStateLabel(type,value);
  if (schema==='@group') return groups.find(([id])=>id===value)?.[1]??'Missing group';
  if (key==='clip' && schema!=='@audioClip') return type?.animator?.clips.find(clip=>clip.id===value)?.name??value;
  const choices=fixedEventParameter(block.kind,key,schema,type);
  return choices?.find(([id])=>id===value)?.[1]??value;
 }).filter(value=>value!=='' && value!=null).map(esc).join(' · ');
 return eventOwnerBadge(owner)+`<span>${block.invert?'NOT ':''}${esc(definition[1])}${details?' <em>'+details+'</em>':''}</span>`;
}
function renderEvents(){renderEventRows();}
function dialog(title,body,cb,confirm='Apply'){let d=$('#dialog');d.classList.remove('compiler-dialog');$('#dialogtitle').textContent=title;$('#dialogbody').innerHTML=body;$('#dialogok').textContent=confirm;$('#dialogok').disabled=false;modalCallback=cb;d.showModal()}
function simple(title,fields,cb){dialog(title,fields,()=>{let values={};$('#dialogbody').querySelectorAll('[data-field]').forEach(x=>values[x.dataset.field]=x.value);cb(values)})}
function place(t,x=96,y=96){if(!t)return;clearComponentSelection();let o={id:uid(),type:t.id,x,y,w:t.w,h:t.h,angle:0,opacity:1};L().instances.push(o);selected=o.id;activeType=t.id}
function dl(name,content,mime='application/json'){let url=URL.createObjectURL(content instanceof Blob ? content : new Blob([content],{type:mime}));let a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}const filename=()=>P.name.replace(/[^a-z0-9_-]+/gi,'_')||'game';
function saveProject() {
 try { dl(filename() + '.void', encodeProjectFile(P)); }
 catch (error) { alert('Could not save project. ' + error.message); }
}

let projectOpenRequest = 0;
async function projectFileSelected(event) {
 const input = event.target, file = input.files[0];
 input.value = '';
 if (!file) return;
 const request = ++projectOpenRequest;
 const previous = P;
 try {
  const project = validate(await openProjectFile(file));
  if (request !== projectOpenRequest || P !== previous) return;
  change(() => { P = project; eventWorkspace.focus=''; selected = openSheetId = null; activeType = P.types[0]?.id; });
 } catch (error) {
  if (request === projectOpenRequest && P === previous) alert('Could not open project. ' + error.message);
 }
}

function renderGameHTML(project, icon) {
 const { spriteDocuments, spriteLayers, ...gameProject } = project;
 const artwork = studioDataArtworkIds(project);
 if (artwork.size) {
  gameProject.spriteDocuments = (spriteDocuments ?? []).filter(doc => artwork.has(doc.id));
  gameProject.spriteLayers = (spriteLayers ?? []).filter(layer => artwork.has(layer.document));
 }
 gameProject.types = gameProject.types.map(({ spriteDocument, ...type }) => type);
 const data = JSON.stringify(gameProject).replace(/</g, '\\u003c');
 const title = esc(project.name);
 const runtime = $('#runtime-source').textContent;
 const effects = $('#effects-source').outerHTML;
 const uiLayout = $('#ui-layout-source').outerHTML;
 const uiSource = $('#game-ui-source').outerHTML;
 const studioDataSource = $('#studio-data-source').outerHTML;
 const audioSource = $('#audio-source').outerHTML;
 const uiStyle = $('#game-ui-style').outerHTML;
 const behaviors = $('#behavior-source').outerHTML;
 const navigation = $('#navigation-source').outerHTML;
 const tiles = $('#tilemap-source').outerHTML;
 const animation = $('#animation-source').outerHTML;
 const expressions = $('#expression-source').outerHTML;
 const components = $('#component-source').outerHTML;
 const compiled = project.executionMode === 'interpreted' ? null : compileStudioEvents(project);
 const pixi = $('#pixi-source').outerHTML;
 const notices = $('#runtime-licenses').outerHTML;
 return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
${icon ? `<link rel="icon" href="${esc(icon)}">` : ''}
<style>
body{margin:0;background:#101721;color:#e6edf4;font:16px system-ui;display:grid;place-content:center;min-height:100vh}
canvas{max-width:96vw;max-height:85vh;object-fit:contain;image-rendering:pixelated;border:1px solid #435568}
header{display:flex;justify-content:space-between;padding:10px}
button{background:#364d63;color:white;border:0;padding:8px 15px;cursor:pointer}
</style>
${uiStyle}
</head>
<body>
<header><b>${title}</b><button id="restart">Restart</button></header>
<div class="void-ui-host"><canvas id="game" tabindex="0" aria-label="Game canvas"></canvas><div id="game-ui" class="void-ui-layer"></div></div>
<p id="renderer">Canvas 2D</p>
<p id="err"></p>
${notices}
${pixi}
${effects}
${behaviors}
${tiles}
${navigation}
${animation}
${expressions}
${components}
${uiLayout}
${studioDataSource}
${uiSource}
${audioSource}
<script>
${runtime}
const project = ${data};
const compiledEvents = ${compiled?.code ?? 'null'};
const game = createRuntime(project, document.querySelector('#game'), {
 compiledEvents,
 uiLayer: document.querySelector('#game-ui'),
 error: message => document.querySelector('#err').textContent = message,
 renderer: message => document.querySelector('#renderer').textContent = message,
});
game.start();
document.querySelector('#restart').onclick = () => {
 game.reset(project.activeLayout);
 document.querySelector('#game').focus({ preventScroll: true });
};
<\/script>
</body>
</html>`;
}

function play() {
 if (runtime) return;
 haltAudioAudition(true);
 if (tab === 'audio') renderAudioWorkspace();
 const snapshot = clone(P);
 const generated = snapshot.executionMode === 'interpreted' ? null : compileStudioEvents(snapshot);
 const compiledEvents = generated && loadCompiledStudioEvents(generated);
 $('#preview').showModal();
 $('#renderstatus').textContent = 'Canvas 2D · starting';
 $('#previewtitle').textContent = P.name;
 $('#debug').textContent = 'Starting runtime...';
 $('#errors').textContent = (generated?.diagnostics ?? []).map(issue =>
  `[Compiler] ${issue.source.name} · Event ${issue.number} · ${issue.field} · ${issue.message}\n`).join('');
 const debuggerHooks = preparePreviewDebug(snapshot);
 runtime = createRuntime(snapshot, $('#gamecanvas'), {
  debugger: debuggerHooks,
  uiLayer: $('#preview-ui'),
  compiledEvents,
  tick(state) {
   const globals = Object.entries(state.vars).map(([name,value]) => `${name} = ${plainDebugValue(value)}`).join('\n');
   $('#debug').textContent = `${state.renderer} · ${state.execution} events · ${Math.round(state.fps)} FPS · ${state.ms.toFixed(2)} ms · ${state.count} instances · ${state.particles} particles · ${state.layout}` + (globals ? '\n' + globals : '');
   debugOnFrame(state.profile);
  },
  error: message => { $('#errors').textContent += message + '\n'; },
  log: message => { $('#errors').textContent += '[Log] ' + message + '\n'; },
  renderer: message => { $('#renderstatus').textContent = message; },
 });
 runtime.start();
 $('#gamecanvas').focus({ preventScroll: true });
}
function stop() {
 runtime?.stop();
 runtime = null;
 if ($('#preview').open) $('#preview').close();
 if (tab === 'events') renderEvents();
}
function act(s){let [a,...args]=s.split(':');let o=I(),t=T(o?.type||activeType);switch(a){case 'data':dataAction(...args);break;case 'datatab':tab='data';projectPanel.expanded.add('data');render();break;case 'ui':studioUIAction(...args);break;case 'uitab':tab='ui';render();break;case 'audiotab':tab='audio';render();break;case 'audio':studioAudioAction(...args);break;case 'spritetab':tab='sprite';render();break;case 'sprite':spriteEditorAction(...args);break;case 'prefab':prefabAction(...args);break;case 'extension':extensionActionUI(...args);break;case 'evt':eventWorkspaceAction(...args);break;case 'sheetJS':showGeneratedJavaScript(editorEventSource());break;case 'eventJS':showGeneratedJavaScript(editorEventSource(),Number(args[0]));break;case 'breakpoint':toggleBreakpoint(editorEventSource(),args[0]);renderEvents();break;case 'cameraSettings':configureSceneCamera(L());break;case 'cameraReset':$('#dialog').close();change(()=>{delete L().camera});break;case 'tile':tileEditorAction(...args);break;case 'anim':animatorAction(...args);break;case 'new':if(confirm('Start a blank project? Save your current project first.'))change(()=>{P={version:12,eventSheets:[],spriteDocuments:[],spriteLayers:[],audioClips:[],audioMixer:{...audioDefaults},uiScreens:[],uiStyles:[],inputActions:[],prefabs:[],extensions:[],tilesets:[],enums:[],name:'Untitled game',activeLayout:'main',behaviorSheets:[],globals:[],types:[],layouts:[{id:'main',name:'Scene 1',width:640,height:360,background:'#182535',instances:[],events:[]}]};selected=activeType=openSheetId=null});break;case 'demo':if(confirm('Load Shard Runner demo?'))change(()=>{P=demo();selected=openSheetId=null;activeType='player'});break;case 'rename':simple('Project name',field('Name','name',P.name),v=>change(()=>P.name=v.name||'Untitled'));break;case 'save':saveProject();break;case 'open':$('#projectfile').click();break;case 'play':play();break;case 'undo':if(history.length){future.push(JSON.stringify(P));P=JSON.parse(history.pop());selected=null;render()}break;case 'redo':if(future.length){history.push(JSON.stringify(P));P=JSON.parse(future.pop());selected=null;render()}break;case 'tiletab':haltAnimator();tab='tiles';render();break;case 'animtab':tab='animate';render();break;case 'layouttab':tab='layout';render();break;case 'eventtab':tab='events';openSheetId=null;eventWorkspace.focus='';render();break;case 'addLayout':simple('New Scene',field('Name','name','Scene '+(P.layouts.length+1))+field('Width','width',640,'number')+field('Height','height',360,'number'),v=>change(()=>{let id=uid();P.layouts.push({id,name:v.name,width:Math.min(4096,Math.max(64,+v.width||640)),height:Math.min(4096,Math.max(64,+v.height||360)),background:'#182535',instances:[],events:[]});P.activeLayout=id;selected=null;tab='layout';revealProjectItem('scene:'+id,'scenes')}));break;case 'deleteLayout':if(P.layouts.length>1&&confirm('Delete this scene?'))change(()=>{P.layouts=P.layouts.filter(l=>l.id!==L().id);P.activeLayout=P.layouts[0].id;selected=null});break;case 'addType':simple('New Object',field('Name','name','Object'+(P.types.length+1))+select('Kind','kind','sprite',[['sprite','Sprite'],['text','Text']])+field('Color','color','#65c8ac','color')+field('Width','w',32,'number')+field('Height','h',32,'number'),v=>{if(!/^[A-Za-z_$][\w$]*$/.test(v.name)||P.types.some(t=>t.name===v.name))throw Error('Use a unique identifier as object name');change(()=>{let id=uid();P.types.push({id,name:v.name,kind:v.kind,color:v.color,w:Math.max(1,+v.w||32),h:Math.max(1,+v.h||32),shape:'rect',behaviors:[],vars:{}});activeType=id;selected=null;tab='layout';place(T(id));revealProjectItem('object:'+id,'objects')})});break;case 'deleteType':if(t&&P.prefabs?.some(prefab=>prefab.members.some(member=>member.type===t.id))){alert('Remove this object from its prefabs before deleting the object type.');break}if(t&&confirm('Delete '+t.name+' and all instances?'))change(()=>{P.types=P.types.filter(x=>x!==t);for(let l of P.layouts)l.instances=l.instances.filter(o=>o.type!==t.id);activeType=P.types[0]?.id;selected=null});break;case 'place':change(()=>place(t));tab='layout';render();break;case 'duplicate':if(o)change(()=>{let n={...clone(o),id:uid(),x:o.x+16,y:o.y+16};L().instances.push(n);selected=n.id});break;case 'deleteInstance':if(selectedPrefabPlacement()){prefabAction('remove');break}if(o)change(()=>{L().instances=L().instances.filter(x=>x!==o);selected=null});break;case 'image':if(t?.sheet||t?.animator){tab='animate';render();$('#sprite-sheet-file').click();}else if(t)$('#imagefile').click();break;
case 'removeImage':if(t&&(!t.animator?.clips.some(clip=>clip.frames.length)||confirm('Remove the sprite sheet and its frame sequences?')))change(()=>{delete t.spriteDocument;delete t.image;delete t.sheet;for(const clip of t.animator?.clips??[])clip.frames=[];});break;
case 'sheet':if(t){tab='animate';render();animatorAction('slice');}break;
case 'stress':if(confirm('Replace project with a sprite stress test? Save first.'))change(()=>{P=demo();P.name='Sprite stress test';let l=P.layouts[0];l.width=960;l.height=540;l.events=[];P.types=[{id:'particle',name:'Particle',color:'#72cfae',shape:'diamond',kind:'sprite',w:8,h:8,behaviors:[{id:'bullet',settings:{speed:100,bounce:true}}],vars:{}}];l.instances=Array.from({length:1000},(_,i)=>({id:uid(),type:'particle',x:(i*79)%950,y:(i*53)%530,w:8,h:8,angle:i*137%360,opacity:1}));P.layouts=[l];P.globals=[];selected=openSheetId=null;activeType='particle'});break;case 'addGlobal':simple('Global variable',field('Name','name','Score')+field('Initial value (JSON)','value','0'),v=>{if(!/^[A-Za-z_$][\w$]*$/.test(v.name)||P.globals.some(g=>g.name===v.name))throw Error('Use a unique identifier');let value=JSON.parse(v.value);change(()=>{P.globals.push({name:v.name,value});revealProjectItem('global:'+v.name,'globals')})});break;case 'addBehavior':if(t)showBehaviorPicker(t);break;
case 'newBehavior':if(t)createBehaviorSheet(t);break;
case 'openBehavior':openBehaviorSheet(args[0]);render();break;
case 'removeBehavior':if(t)change(()=>t.behaviors=t.behaviors.filter(behavior=>behavior.id!==args[0]));break;
case 'behaviorSettings':if(currentSheet())editBehaviorSheet(currentSheet());break;
case 'deleteBehavior':if(currentSheet())deleteBehaviorSheet(currentSheet());break;
case 'addInstanceVar':if(t)simple('Instance variable',field('Name','name','Health')+field('Initial value (JSON)','value','10'),v=>{let val=JSON.parse(v.value);change(()=>{t.vars??={};t.vars[v.name]=val})});break;case 'addevent':addEventWithPicker(currentEvents());break;case 'help':dialog('Expression reference','<p>Use numbers, quoted strings, booleans, arithmetic, comparisons, AND <code>&&</code>, OR <code>||</code>, and NOT <code>!</code>.</p><p><code>Score + 1</code> · <code>Self.x + 100 * dt</code> · <code>Player.Health &lt;= 0</code> · <code>"HP " + Health</code></p><p>Functions: min, max, abs, floor, ceil, round, sqrt, sin, cos, random, clamp, len, str, num, lerp. <code>index</code> is the repeat index; <code>Mouse.x</code> and <code>Mouse.y</code> give layout coordinates.</p><p>Events run top to bottom. Conditions narrow selected instances; child events inherit their parents’ selections. Collision triggers on entering overlap; overlapping runs each tick. Preview is isolated from the editor.</p>',()=>{},'Close');break;default:{let which=['edit','addblock','delblock'].includes(a)?args.shift():null;let loc=locate(args[0]);if(!loc)return;let {e,list}=loc,i=list.indexOf(e);if(a==='addblock'||a==='edit'){openEventBlock(which,e,a==='edit'?+args[1]:undefined);return}if(a==='child'){addEventWithPicker(e.children??(e.children=[]));return}if(a==='function'){simple('Visual function',field('Name (empty converts back to event)','name',e.functionName||'')+field('Parameters (comma separated)','params',(e.params||[]).join(', ')),v=>{let names=v.params.split(',').map(x=>x.trim()).filter(Boolean);if(v.name&&(!/^[A-Za-z_$][\w$]*$/.test(v.name)||names.some(n=>! /^[A-Za-z_$][\w$]*$/.test(n))||new Set(names).size!==names.length||[...projectEventRows(P)].some(({event:row})=>row!==e&&row.functionName===v.name)))throw Error('Use unique valid identifiers');change(()=>{if(v.name){e.functionName=v.name;e.params=names}else{delete e.functionName;delete e.params}})});return}if(a==='repeat'){simple('Repeat event',field('Repeat count expression','repeat',e.repeat),v=>change(()=>e.repeat=v.repeat||'1'));return}change(()=>{switch(a){case 'mode':e.mode=e.mode==='and'?'or':'and';break;case 'toggle':e.disabled=!e.disabled;break;case 'up':if(i>0)[list[i-1],list[i]]=[e,list[i-1]];break;case 'down':if(i<list.length-1)[list[i+1],list[i]]=[e,list[i+1]];break;case 'copyevent':{let n=clone(e);function ids(k){k.id=uid();k.children.forEach(ids)}ids(n);list.splice(i+1,0,n);break}case 'delevent':list.splice(i,1);break;case 'invert':e.conditions[+args[1]].invert=!e.conditions[+args[1]].invert;break;case 'delblock':(which==='C'?e.conditions:e.actions).splice(+args[1],1);break}})}}}
document.addEventListener('click',event => {
 const button = event.target.closest('[data-act]');
 if (button) act(button.dataset.act);
});
$('#properties').addEventListener('change',e=>{let el=e.target,key=el.dataset.field;if(!key)return;let [group,k,setting]=key.split('.'),o=I(),t=T(o?.type||activeType),v=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;if(group==='prefab'){const placement=selectedPrefabPlacement();if(placement&&Number.isFinite(v))change(()=>placement[k]=k==='scale'?Math.max(0.01,v):v);return}if(group==='var'){try{v=JSON.parse(v)}catch{alert('Invalid JSON');render();return}}if(group==='type'&&k==='name'&&(!/^[A-Za-z_$][\w$]*$/.test(v)||P.types.some(x=>x!==t&&x.name===v))){alert('Use a unique identifier');render();return}if(group==='layout'&&['width','height'].includes(k)){const map=L().tilemap,index=k==='width'?0:1,min=map?tileMapSize(map)[index]+(index===0?map.x:map.y):64;v=Math.min(4096,Math.max(64,Math.ceil(min),v||64));}if(['w','h'].includes(k))v=Math.max(1,v||1);change(()=>{if(group==='layout'){if(['eventSheet','uiScreen'].includes(k)&&!v)delete L()[k];else L()[k]=v;if(k==='eventSheet'&&!openSheetId)eventWorkspace.focus='';}if(group==='instance'&&o)o[k]=v;if(group==='type'&&t)t[k]=v;if(group==='behavior'&&t){const attachment=t.behaviors.find(behavior=>behavior.id===k);if(attachment){attachment.settings[setting]=v;if(k==='particles'&&setting==='sprite')attachment.settings.clip='';}}if(group==='var'&&t)t.vars[k]=v})});
$('#dialogok').onclick=()=>{try{modalCallback?.();$('#dialog').close()}catch(e){alert(e.message)}};$('#dialogcancel').onclick=()=>$('#dialog').close();$('#projectfile').onchange=projectFileSelected;$('#imagefile').onchange=e=>{let f=e.target.files[0],t=T(I()?.type||activeType);if(f&&t){let r=new FileReader();r.onload=()=>{let im=new Image();im.onload=()=>change(()=>{delete t.spriteDocument;t.image=r.result;t.w=im.width;t.h=im.height});im.onerror=()=>alert('Invalid image');im.src=r.result};r.readAsDataURL(f)}e.target.value=''};
let stamping=false;$('#stamp').onchange=e=>stamping=e.target.checked;function stampAt(p){let t=T(activeType);if(!t)return;let x=Math.floor(p.x/(snap||16))*(snap||16),y=Math.floor(p.y/(snap||16))*(snap||16);if(x<0||y<0||x>=L().width||y>=L().height||L().instances.some(o=>o.type===t.id&&o.x===x&&o.y===y))return;place(t,x,y);drawEditor()}const stage=$('#stage');function point(e){let r=stage.getBoundingClientRect();return {x:(e.clientX-r.left)*stage.width/r.width,y:(e.clientY-r.top)*stage.height/r.height}}stage.onpointerdown = e => {
 if(e.button!==0)return;
 const p=point(e),o=I();
 if(stamping){checkpoint();drag={stamp:true};stage.setPointerCapture(e.pointerId);stampAt(p);return}
 const resize=!e.shiftKey&&o&&Math.abs(p.x-o.x-o.w)<7/zoom&&Math.abs(p.y-o.y-o.h)<7/zoom;
 const hit=resize?o:stageObjectAt(L(),p);
 const placement=typeof hit?.id==='string'&&L().prefabInstances?.find(item=>hit.id.startsWith(item.id+'/'));
 if(e.shiftKey&&!placement){
  if(hit){
   if(selected)componentSelection.members.add(selected);
   if(componentSelection.members.has(hit.id))componentSelection.members.delete(hit.id);
   else componentSelection.members.add(hit.id);
   componentSelection.prefab=componentSelection.placement=null;
   selected=null;
   activeType=hit.type;
   render();
  }
  return;
 }
 if(placement)selectPrefab(placement.prefab,placement.id);
 else {
  clearComponentSelection();
  selected=hit?.id??null;
  if(hit)activeType=hit.type;
 }
 const target=placement||hit;
 if(target){
  drag={p,old:{x:target.x,y:target.y,w:target.w,h:target.h},resize,saved:false};
  stage.setPointerCapture(e.pointerId);
 }
 render();
};
stage.onpointermove = e => {
 if(!drag)return;
 if(drag.stamp){stampAt(point(e));return}
 const target=selectedPrefabPlacement()??I(),p=point(e);
 if(!target)return;
 const dx=p.x-drag.p.x,dy=p.y-drag.p.y;
 if(!drag.saved&&Math.hypot(dx,dy)>2){checkpoint();drag.saved=true}
 if(!drag.saved)return;
 const round=value=>snap&&!e.altKey?Math.round(value/snap)*snap:Math.round(value);
 if(drag.resize){target.w=Math.max(1,round(drag.old.w+dx));target.h=Math.max(1,round(drag.old.h+dy))}
 else {target.x=round(drag.old.x+dx);target.y=round(drag.old.y+dy)}
 drawEditor();
};
stage.onpointerup=stage.onpointercancel=()=>{drag=null;render()};stage.ondblclick=e=>{if(stamping)return;let p=point(e),t=T(activeType);if(t)change(()=>place(t,Math.round(p.x/(snap||1))*(snap||1),Math.round(p.y/(snap||1))*(snap||1)))};$('#snap').onchange=e=>{snap=+e.target.value;drawEditor()};$('#zoom').onchange=e=>{zoom=+e.target.value;drawEditor()};$('#stop').onclick=stop;$('#preview').addEventListener('cancel',e=>{e.preventDefault();stop()});$('#restart').onclick=()=>runtime?.reset(P.activeLayout);window.addEventListener('keydown',e=>{if(runtime||document.querySelector('dialog[open]')||e.composedPath()[0]?.matches?.('input,select,textarea,[contenteditable]'))return;if(e.key==='Delete'&&tab!=='data'&&!e.target.closest?.('#project-sidebar'))act(tab==='ui'?'ui:deleteItem':tab==='audio'?'audio:remove':tab==='sprite'?'sprite:clearPixels':'deleteInstance');if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();act('undo')}if((e.ctrlKey||e.metaKey)&&e.key==='y'){e.preventDefault();act('redo')}if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();act('save')}if(e.key==='F5'){e.preventDefault();play()}});$('#rendererChoice').onchange=e=>change(()=>P.renderer=e.target.value);$('#executionChoice').onchange=e=>change(()=>P.executionMode=e.target.value);setInterval(()=>{if(tab==='layout'&&!drag)drawEditor()},250);
try{let saved=localStorage.getItem('void-creator-v1');if(saved)P=validate(JSON.parse(saved))}catch{};
const renderStudioMenu=setupStudioMenu();
setupProjectPanel();setupDataWorkspace();setupEventWorkspace();setupTileEditor();setupAnimator();setupAnimationMachine();setupPreviewDebugger();setupComponentEditor();setupGameExport();setupUIWorkspace();setupAudioWorkspace();setupStudioSettings();setupSpriteEditor();setupWorkspaceZoom();render();window.Creator={get project(){return P},createRuntime,demo};
