function starterHarborAudio() {
 const music = {
  version:1,bpm:104,instruments:['pluck','triangle','sine','drums'],volumes:[56,53,35,24],patterns:[],order:[],
 };
 const patterns = [
  {name:'Lantern',notes:[
   [[0,62,3],[4,65,2],[7,69,1],[8,67,3],[12,65,2],[14,62,2]],
   [[0,38,4],[4,38,3],[8,45,4],[12,43,4]],[[0,50,3],[4,57,3],[8,53,4],[12,55,4]],
  ]},
  {name:'Across the water',notes:[
   [[0,60,3],[4,64,2],[6,67,2],[8,69,3],[12,67,2],[14,64,2]],
   [[0,36,4],[4,43,4],[8,41,4],[12,43,4]],[[0,52,4],[4,55,3],[8,57,3],[12,55,4]],
  ]},
 ];
 for (const [index,{name,notes}] of patterns.entries()) {
  const pattern = blankStudioMusicPattern(name);
  pattern.id = 'harbor-bar-'+index;
  [...notes,[[0,36,1],[4,42,1],[8,36,1],[12,42,1]]].forEach((track,voice)=>{
   for (const [step,pitch,length] of track) pattern.tracks[voice][step]={pitch,length};
  });
  music.patterns.push(pattern);
 }
 const [a,b] = music.patterns.map(pattern=>pattern.id);
 music.order=[a,a,b,a];
 const effect = (id,name,preset,startHz,endHz,seed) => {
  const settings = {version:1,preset,startHz,endHz,seed,wave:'triangle',motion:'step',attack:3,hold:76,decay:125,noise:1,level:58};
  return studioSoundEffectClip(id,name,'sfx',settings,studioSoundEffectSamples(settings));
 };
 return [
  {...studioMusicClip('harbor-loop','Lanterns at low tide','music',music),music},
  effect('cell-pickup','Signal cell pickup','coin',640,1340,119),
  effect('beacon-saved','Beacon confirmation','confirm',490,840,103),
 ];
}

function starterHarborData(project, art) {
 const file = {id:'low-tide',name:'LowTide',tables:[]};
 const table = (id,name,columns) => {
  const result = {id,name,columns:columns.map(([id,name,type])=>({id,name,type})),rows:[]};
  file.tables.push(result);
  return result;
 };
 const items = table('items','Items',[['name','Name','text'],['description','Description','longText'],['icon','Icon','sprite']]);
 const dialogue = table('dialogue','Dialogue',[['speaker','Speaker','text'],['line','Line','longText'],['portrait','Portrait','sprite']]);
 const choices = table('choices','Choices',[['from','From','row'],['prompt','Prompt','text'],['next','Next','row']]);
 const ref = table => dataReference(file.id,table.id);
 const push = (table,id,key,values) => {
  table.rows.push({id,key,values});
  return dataReference(ref(table),id);
 };
 const sprite = asset => dataReference('sprite',asset.spriteDocument);
 const chart = push(items,'chart','TideChart',{
  name:'Tide chart',description:'At low tide, the north and south paths both connect to the main boardwalk.',icon:sprite(art.chart),
 });
 const cell = push(items,'cell','SignalCell',{
  name:'Signal cell',description:'One of two cells that can power the harbor signal.',icon:sprite(art.cell),
 });
 const line = (id,key,line) => push(dialogue,id,key,{speaker:'Keeper Mira',line,portrait:sprite(art.keeper)});
 const intro = line('intro','Introduction','The tide pulled the signal’s cells loose. Can you find them before the boats come in?');
 const routes = line('routes','Routes','Look for the gold lights. One is north of the boardwalk and one is on the south shoal.');
 const beacon = line('beacon','Beacon','Use the green beacon at the middle of the harbor to save. Continue will bring you back here.');
 const choice = (id,key,from,prompt,next='') => push(choices,id,key,{from,prompt,next});
 choice('ask-routes','AskRoutes',intro,'Where should I look?',routes);
 choice('ask-beacon','AskBeacon',intro,'How do I save?',beacon);
 choice('leave','Leave',intro,'I’ll bring them back');
 choice('routes-back','RoutesBack',routes,'One more question',intro);
 choice('routes-done','RoutesDone',routes,'I know the way');
 choice('beacon-back','BeaconBack',beacon,'One more question',intro);
 choice('beacon-done','BeaconDone',beacon,'Thanks, Mira');
 project.dataFiles = [file];
 return {chart,cell,intro,items:ref(items),choices:ref(choices)};
}

function starterHarborUI(data) {
 const make = uiControlPreset;
 const card = (name,w,h,props={}) => make('panel',name,{w,h,layout:'free',background:'#162e3a',...props});
 const label = (text,x,y,w,h,size,props={}) => make('label',text,{x,y,w,h,size,...props});
 const button = (id,text,x,y,order,command='event',target='',props={}) =>
  make('button',text,{id,x,y,w:180,h:35,order,command,target,...props});
 const binding = (kind,name,row,column,variable,props) => make(kind,name,{
  ...props,dataField:dataReference(row,column),dataRowVariable:variable,emptyWithoutRow:true,
 });
 const title = {id:'harbor-title',name:'Title',items:[
  card('Title panel',294,262,{x:-139}),
  label('Low Tide Signal',-139,-93,265,43,32,{color:'#ffe5a7'}),
  label('Find two signal cells and relight the harbor tower.',-139,-47,222,43,15,{color:'#b8d9d6'}),
  button('harbor-play','New voyage',-139,1,0,'layout','harbor'),
  button('harbor-continue','Continue',-139,42,1,'continue','autosave'),
  button('harbor-controls','Controls',-139,83,2,'show','harbor-help'),
 ]};
 const controls = {id:'harbor-help',name:'Controls',items:[
  card('Controls panel',482,270),
  label('Controls',0,-97,360,40,29,{color:'#ffe5a7'}),
  label('Move with WASD, arrow keys, or D-pad.',0,-49,430,27,16),
  label('Interact with E or Y. Open the pack with I or X.',0,-13,430,27,16),
  label('Pause with Escape or Start.',0,23,430,27,16),
  label('Use the green beacon to save your voyage.',0,59,430,27,16,{color:'#a6dec5'}),
  button('harbor-help-back','Back',0,101,0,'restore'),
 ]};
 const hud = {id:'harbor-hud',name:'Harbor HUD',navigation:false,items:[
  make('label','CELLS {Cells} / 2',{anchor:'top-left',x:18,y:12,w:122,h:31,size:17,color:'#ffe5a7',textAlign:'left'}),
  make('label','{Objective}',{anchor:'top-center',y:12,w:342,h:34,size:15,color:'#cae6e3'}),
  make('label','{Notice}',{anchor:'bottom-center',x:70,y:-7,w:288,h:33,size:14,color:'#f3deaa'}),
  button('harbor-interact','{Prompt} [E]',12,-7,0,'event','',{anchor:'bottom-left',w:143,size:14}),
  button('harbor-pack','Pack [I]',160,-7,1,'event','',{anchor:'bottom-left',w:75,size:14}),
  button('harbor-pause','Pause',-12,-7,2,'show','harbor-paused',{anchor:'bottom-right',w:82,size:14}),
 ]};
 const pack = {id:'harbor-inventory',name:'Courier Pack',pause:true,items:[
  card('Pack panel',550,270),
  label('Courier pack',-138,-105,236,39,25,{textAlign:'left',color:'#ffe5a7'}),
  make('data-list','Cargo',{id:'harbor-cargo',x:-131,y:8,w:244,h:177,table:data.items,variable:'Inventory',
   labelColumn:'name',iconColumn:'icon',selectionVariable:'SelectedItem',emptyText:'The pack is empty.'}),
  binding('image','Selected item icon',data.chart,'icon','SelectedItem',{x:136,y:-58,w:78,h:78}),
  binding('label','Selected item',data.chart,'name','SelectedItem',{x:136,y:-2,w:235,h:36,size:21}),
  binding('label','Item description',data.chart,'description','SelectedItem',{x:136,y:44,w:216,h:68,size:16,color:'#bdd9d9'}),
  button('harbor-pack-close','Close pack',0,100,1,'restore'),
 ]};
 const dialogue = {id:'harbor-dialogue',name:'Keeper Mira',pause:true,items:[
  card('Dialogue panel',554,258,{y:33}),
  binding('image','Keeper portrait',data.intro,'portrait','DialogueNode',{x:-211,y:-24,w:88,h:88}),
  binding('label','Speaker',data.intro,'speaker','DialogueNode',{x:53,y:-73,w:350,h:34,size:24,textAlign:'left',color:'#ffe5a7'}),
  binding('label','Dialogue',data.intro,'line','DialogueNode',{x:53,y:-28,w:350,h:73,size:17,textAlign:'left'}),
  make('data-list','Replies',{id:'harbor-replies',x:53,y:76,w:350,h:120,size:15,mode:'choices',table:data.choices,
   variable:'DialogueNode',labelColumn:'prompt',fromColumn:'from',nextColumn:'next',emptyText:'No further replies.'}),
  button('harbor-dialogue-close','Leave',-211,109,1,'restore','',{w:90,size:14}),
 ]};
 const pause = {id:'harbor-paused',name:'Pause',pause:true,items:[
  card('Pause panel',304,220),
  label('Voyage paused',0,-76,268,36,25,{color:'#ffe5a7'}),
  button('harbor-resume','Resume',0,-24,0,'restore'),
  button('harbor-new','Restart voyage',0,20,1,'restart'),
  button('harbor-home','Main menu',0,64,2,'layout','title'),
 ]};
 const victory = {id:'harbor-victory',name:'Signal Restored',items:[
  card('Victory panel',322,235,{x:-122}),
  label('Signal restored',-122,-77,306,43,31,{color:'#ffe5a7'}),
  label('The harbor lights are guiding the boats home.',-122,-28,254,39,16,{color:'#c7e2da'}),
  button('harbor-replay','New voyage',-122,23,0,'layout','harbor'),
  button('harbor-victory-home','Main menu',-122,68,1,'layout','title'),
 ]};
 return [title,controls,hud,pack,dialogue,pause,victory];
}

function lowTideSignalProject() {
 const project = {
  version:12,name:'Low Tide Signal',gameSaveId:'low-tide-signal-starter',activeLayout:'harbor',
  eventSheets:[],behaviorSheets:[],spriteDocuments:[],spriteLayers:[],uiStyles:[],extensions:[],prefabs:[],
  audioMixer:{master:80,music:52,sfx:82,ui:80},
 };
 const terrain = starterCoast(), art = starterHarborArtwork(project), data = starterHarborData(project,art);
 project.tilesets = [terrain.atlas];
 project.enums = [terrain.surfaces];
 project.audioClips = starterHarborAudio();
 project.uiScreens = starterHarborUI(data);
 project.buildSettings = {title:project.name,version:'1.0.0',layout:'title',icon:art.icon};
 const type = (id,name,artwork,w,h,props={}) =>
  ({id,name,kind:'sprite',color:'#76c1ae',w,h,behaviors:[],vars:{},...artwork,...props});
 const clip = (name,id,indexes,durations) => ({
  name,id,loop:'loop',duration:0,tracks:{},frames:indexes.map((tile,index)=>({tile,duration:durations[index]})),
 });
 const pulse = timings => ({autoplay:'pulse',clips:[clip('Pulse','pulse',timings.map((_,index)=>index),timings)]});
 const courier = type('courier','Courier',art.courier,23,23,{
  behaviors:[{id:'bound',settings:{}}],
  animator:{autoplay:'idle',clips:[clip('Idle','idle',[0,1],[520,160]),clip('Walk','walk',[2,3],[100,100])],machine:{
   enabled:true,initial:'idle',states:[{id:'idle',name:'Idle',clip:'idle'},{id:'walk',name:'Walk',clip:'walk'}],
   transitions:[
    {id:'begin-walk',from:'idle',to:'walk',conditions:[{kind:'moving',threshold:1}]},
    {id:'stop-walk',from:'walk',to:'idle',conditions:[{kind:'stopped',threshold:1}]},
   ],
  }},
 });
 project.types = [
  courier,type('keeper','Keeper',art.keeper,29,29,{dataRow:data.intro}),
  type('cell','SignalCell',art.cell,22,22,{vars:{CellIndex:0},animator:pulse([140,140,140,140]),
   behaviors:[{id:'particles',settings:{rate:0,lifetime:.55,speed:52,variation:14,startSize:4,endSize:1,
    startColor:'#fff2b3',endColor:'#efa965'}}]}),
  type('beacon','SaveBeacon',art.beacon,27,27,{animator:pulse([230,230])}),
  type('tower','SignalTower',art.tower,62,78),
  type('tower-lit','LitSignalTower',art.litTower,94,118),
 ];
 const place = (id,type,x,y,vars) => {
  const object = project.types.find(item=>item.id === type);
  return {id,type,x,y,w:object.w,h:object.h,angle:0,opacity:1,...(vars ? {vars} : {})};
 };
 const goal = 'Recover the two signal cells';
 const startNotice = 'Keeper Mira can point you to the cells.';
 project.globals = [
  {name:'Cells',value:0},{name:'CollectedCells',value:[false,false]},{name:'Inventory',value:{[data.chart]:1}},
  {name:'SelectedItem',value:data.chart},{name:'DialogueNode',value:data.intro},
  {name:'Objective',value:goal},{name:'Notice',value:startNotice},{name:'Prompt',value:'Interact'},
 ];
 const set = (name,value) => block('setGlobal',{name,value:JSON.stringify(value)});
 const audio = (clip,options={}) => block('playAudio',{clip,bus:'',volume:'100',loop:'false',...options});
 const input = id => block('inputPressed',{input:id});
 const ui = control => block('uiActivated',{control});
 const either = (inputs,actions,children=[]) => ({...event(inputs,actions,children),mode:'or'});
 const near = name => block('compare',{
  expr:`abs(Courier.x + Courier.w / 2 - ${name}.x - ${name}.w / 2) < 55 && abs(Courier.y + Courier.h / 2 - ${name}.y - ${name}.h / 2) < 48`,
 });
 const enough = block('inventoryHas',{name:'Inventory',row:data.cell,quantity:'2'});
 const inventory = (kind,row) => block(kind,{name:'Inventory',row,quantity:'1'});
 const oldStart = block('checkpointLoaded');
 const harbourEvents = [
  event([oldStart],[set('Notice','Checkpoint restored.'),set('Objective',goal)],[event(
   [block('filter',{object:'cell',expr:'at(CollectedCells, Self.CellIndex)'})],[block('destroy',{object:'cell'})],
  )]),
  event([block('start'),{...oldStart,invert:true}],[
   set('Cells',0),set('Notice',startNotice),set('Objective',goal),set('SelectedItem',data.chart),
   block('setEntry',{name:'CollectedCells',key:'0',value:'false'}),block('setEntry',{name:'CollectedCells',key:'1',value:'false'}),
   block('inventoryClear',{name:'Inventory'}),inventory('inventoryAdd',data.chart),
  ]),
  event([block('start')],[audio('harbor-loop',{loop:'true',tag:'harbor-music'})]),
  event([block('collision',{object:'courier',other:'cell'})],[
   block('setEntry',{name:'CollectedCells',key:'SignalCell.CellIndex',value:'true'}),
   inventory('inventoryAdd',data.cell),block('addGlobal',{name:'Cells',value:'1'}),
   block('emitParticles',{object:'cell',count:'14'}),audio('cell-pickup'),block('destroy',{object:'cell'}),
   set('Notice','Signal cell recovered.'),
  ]),
  event([enough],[set('Objective','Relight the tower on the east pier')]),
  event([block('tick')],[set('Prompt','Interact')],[
   event([near('Keeper')],[set('Prompt','Talk to Mira')]),
   event([near('SaveBeacon')],[set('Prompt','Save voyage')]),
   event([near('SignalTower')],[set('Prompt','Relight tower')]),
  ]),
  either([input('interact'),ui('harbor-interact')],[],[
   event([near('Keeper')],[block('openDialogue',{screen:'harbor-dialogue',name:'DialogueNode',row:data.intro})]),
   event([near('SaveBeacon')],[
    block('saveCheckpoint',{slot:'autosave',spawn:'courier',globals:'Cells, CollectedCells, Inventory'}),
    audio('beacon-saved'),set('Notice','Voyage saved. Continue resumes here.'),
   ]),
   event([near('SignalTower'),enough],[audio('beacon-saved'),block('layout',{layout:'victory'})]),
   event([near('SignalTower'),{...enough,invert:true}],[set('Notice','The tower needs both signal cells.')]),
  ]),
  either([input('open-pack'),ui('harbor-pack')],[block('showUI',{screen:'harbor-inventory'})]),
  event([input('pause-voyage')],[block('showUI',{screen:'harbor-paused'})]),
 ];
 project.inputActions = [
  {id:'interact',name:'Interact',keys:['E'],buttons:[3]},
  {id:'open-pack',name:'Open pack',keys:['I'],buttons:[2]},
  {id:'pause-voyage',name:'Pause',keys:['Escape'],buttons:[9]},
 ];
 for (const [id,key,alternate,button,x,y] of [
  ['west','ArrowLeft','A',14,-128,0],['east','ArrowRight','D',15,128,0],
  ['north','ArrowUp','W',12,0,-128],['south','ArrowDown','S',13,0,128],
 ]) {
  project.inputActions.push({id:'move-'+id,name:'Move '+id,keys:[key,alternate],buttons:[button]});
  harbourEvents.push(event([block('inputDown',{input:'move-'+id})],[block('moveSolid',{
   object:'courier',x:x+' * dt',y:y+' * dt',
  })]));
 }
 const scene = (id,name,uiScreen,instances,events) => ({
  id,name,uiScreen,width:640,height:360,background:'#153c51',tilemap:clone(terrain.map),instances,events,
 });
 const tower = place('harbor-tower','tower',522,163);
 const musicStop = event([block('start')],[block('stopAudio',{tag:'harbor-music'})]);
 project.layouts = [
  scene('title','Title','harbor-title',[{...tower,x:475,y:126,w:94,h:118}],[musicStop]),
  scene('harbor','Low Tide Harbor','harbor-hud',[
   place('keeper','keeper',112,227),place('mid-beacon','beacon',329,200),tower,
   place('north-cell','cell',262,100,{CellIndex:0}),place('south-cell','cell',400,275,{CellIndex:1}),
   place('courier-start','courier',66,226),
  ],harbourEvents),
  scene('victory','Signal Restored','harbor-victory',[place('lit-tower','tower-lit',475,126)],[{...musicStop,id:uid()}]),
 ];
 const settings = previewProjectSettings(project);
 settings.watches = ['Cells','Self.x','Self.y','len(Inventory)'];
 settings.spawns = [
  {id:'starter-boardwalk',name:'At the save beacon',layout:'harbor',instance:'courier-start',x:304,y:213},
  {id:'starter-tower',name:'East pier',layout:'harbor',instance:'courier-start',x:488,y:203},
 ];
 return validate(project);
}

function loadStarterGame() {
 if (!confirm('Load Low Tide Signal? Save your current project first.')) return;
 const project = lowTideSignalProject();
 change(()=>{
  P = project;
  selected = 'courier-start';
  activeType = 'courier';
  openSheetId = null;
  tab = 'layout';
 });
}
