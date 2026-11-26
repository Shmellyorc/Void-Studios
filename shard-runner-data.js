function addShardRunnerData(project, arena, { freshStart,restored,collectShard }) {
 const file = { id:'shard-runner',name:'ShardRunner',tables:[] };
 const table = (id,name,columns) => ({
  id,name,columns:columns.map(([id,name,type])=>({id,name,type})),rows:[],
 });
 const items = table('items','Items',[
  ['name','Name','text'],['description','Description','longText'],['icon','Icon','sprite'],
 ]);
 const dialogue = table('dialogue','Dialogue',[
  ['speaker','Speaker','text'],['line','Line','longText'],['portrait','Portrait','sprite'],
 ]);
 const choices = table('choices','Choices',[
  ['from','From','row'],['prompt','Prompt','text'],['next','Next','row'],
 ]);
 file.tables.push(items,dialogue,choices);
 project.dataFiles = [file];
 const tableRef = table => dataReference(file.id,table.id);
 const rowRef = (table,id) => dataReference(tableRef(table),id);
 const addRow = (table,id,key,values) => {
  table.rows.push({ id,key,values });
  return rowRef(table,id);
 };

 const spriteAssets = [
  ['ada','Scout Ada',[
   '................','.....hhhhhh.....','....hhgggghh....','...hhgggggghh...','..hhhhhhhhhhhh..',
   '...hpsssssph....','...hpsxsxsph....','....pssssssp....','....pppsppp.....','.....pppppp.....',
   '....ggyyyygg....','...ggggyygggg...','...gggggggggg...','...gggccggggg...','....hcccccch....','................',
  ],{h:'#182d37',g:'#62aa9b',p:'#ba7862',s:'#f5bf97',x:'#162b32',y:'#e9bd6f',c:'#428382'}],
  ['journal','Field Journal',[
   '................','................','....hhhhhhh.....','...hycccccyh....','...hycccccyh....',
   '...hycyyycyh....','...hycccccyh....','...hycyyccyh....','...hycccccyh....','...hycccccyh....',
   '...hycccccyh....','...hyyyyyyyh....','...hsssssssh....','....hhhhhhh.....','................','................',
  ],{h:'#302e37',y:'#ecc586',c:'#926657',s:'#fff0c1'}],
  ['shard','Echo Shard',[
   '................','................','........h.......','.......hyh......','......hyych.....',
   '.....hyyycbh....','....hyyccbbbh...','...hyyccbbbbh...','....hccbbbbh....','.....hbbbbh.....',
   '......hbbh......','.......hh.......','................','................','................','................',
  ],{h:'#63434d',y:'#fff4ae',c:'#ffc168',b:'#dc8653'}],
  ['lantern','Scout Lantern',[
   '................','......hhhh......','.....h....h.....','.....h....h.....','....hhhhhhhh....',
   '....hlcclclh....','....hcyllych....','....hcyyyych....','....hcyyyych....','....hcyllych....',
   '....hlcclclh....','....hhhhhhhh....','...hbbbbbbbbh...','....hhhhhhhh....','................','................',
  ],{h:'#403542',l:'#eedb99',c:'#f1b55f',y:'#fff2b7',b:'#8b6854'}],
 ];
 const artwork = new Map();
 for (const [id,name,pixels,palette] of spriteAssets) {
  const doc = { ...newSpriteDocument(name,16,16),id:'shard-runner-'+id };
  const canvas = spriteCanvas(16,16), ctx = canvas.getContext('2d');
  pixels.forEach((line,y)=>[...line].forEach((pixel,x)=>{
   if (!palette[pixel]) return;
   ctx.fillStyle = palette[pixel];
   ctx.fillRect(x,y,1,1);
  }));
  const image = canvas.toDataURL('image/png');
  project.spriteDocuments.push(doc);
  project.spriteLayers.push(makeSpriteLayer(doc,'Artwork',image));
  artwork.set(id,{image,doc:doc.id,ref:dataReference('sprite',doc.id)});
 }
 const icon = id => artwork.get(id).ref;
 const journal = addRow(items,'journal','FieldJournal',{
  name:'Field Journal',description:'A pocket journal for notes from the ruins.',icon:icon('journal'),
 });
 const shard = addRow(items,'shard','EchoShard',{
  name:'Echo Shard',description:'The eastern gate opens when you collect all six.',icon:icon('shard'),
 });
 const lantern = addRow(items,'lantern','ScoutLantern',{
  name:'Scout Lantern',description:'Ada’s spare lantern. Its glass is still warm.',icon:icon('lantern'),
 });
 const line = (id,key,text) => addRow(dialogue,id,key,{ speaker:'Scout Ada',line:text,portrait:icon('ada') });
 const hello = line('intro','Introduction','Hey, runner. Looking for a way out? I’ve been scouting these ruins. What do you need?');
 const advice = line('advice','GateAdvice','The gate to the east needs all six Echo Shards. I’d start with the one just south of us.');
 const beacon = line('beacon','BeaconAdvice','Touch the blue beacon to save your place. Next time you open the game, choose Continue.');
 const gift = line('lantern','LanternGift','Here. Take my spare lantern. I’ll sit tight and keep an eye on the beacon.');
 const choice = (id,key,from,prompt,next='') => addRow(choices,id,key,{from,prompt,next});
 choice('ask-gate','AskAboutGate',hello,'How do I open the gate?',advice);
 const askLantern = choice('ask-lantern','AskForLantern',hello,'Can you spare a lantern?',gift);
 choice('leave-intro','LeaveIntroduction',hello,'I’ll get moving');
 choice('ask-beacon','AskAboutBeacon',advice,'What does the blue beacon do?',beacon);
 choice('back-gate','BackFromGate',advice,'Ask another question',hello);
 choice('leave-beacon','LeaveBeacon',beacon,'Thanks, Ada');
 choice('back-lantern','BackFromLantern',gift,'Ask another question',hello);
 choice('leave-lantern','LeaveLantern',gift,'I’ll keep it safe');

 const npc = artwork.get('ada');
 project.types.push({ id:'scout-ada',name:'ScoutAda',kind:'sprite',shape:'rect',color:'#62aa9b',
  image:npc.image,spriteDocument:npc.doc,dataRow:hello,w:32,h:32,behaviors:[],vars:{} });
 arena.instances.push({ id:'arena-scout-ada',type:'scout-ada',x:113,y:59,w:32,h:32,angle:0,opacity:1 });
 project.globals.push(
  { name:'Inventory',value:{ [journal]:1 } },
  { name:'SelectedItem',value:journal },
  { name:'DialogueNode',value:hello },
  { name:'ScoutHint',value:'Scout Ada is near the first shard' },
 );
 const control = uiControlPreset;
 const bind = (kind,base,column,global,text,props) => control(kind,text,{
  ...props,dataField:dataReference(base,column),dataRowVariable:global,emptyWithoutRow:true,
 });
 const panel = (text,w,h,y=0) => control('panel',text,{w,h,y,layout:'free',background:'#152c39'});
 const close = (text,x,y,w,order) => control('button',text,{ x,y,w,h:32,size:14,order,command:'restore' });
 const hud = project.uiScreens.find(screen=>screen.id === 'game-hud');
 hud.items.push(
  control('button','Pack [I]',{ id:'open-field-pack',anchor:'bottom-left',x:14,y:-11,w:78,h:34,size:14 }),
  control('button','Talk [E]',{ id:'talk-to-ada',anchor:'bottom-left',x:100,y:-11,w:77,h:34,size:14 }),
  control('label','{ScoutHint}',{ anchor:'top-center',y:12,w:292,h:30,size:14,color:'#a9d9d4' }),
 );
 const bag = { id:'field-pack',name:'Field Pack',pause:true,items:[
  panel('Pack background',550,270),
  control('label','Field Pack',{ x:-136,y:-105,w:240,h:37,size:24,textAlign:'left' }),
  control('data-list','Pack items',{
   id:'pack-items',x:-133,y:8,w:246,h:168,size:16,table:tableRef(items),variable:'Inventory',
   labelColumn:'name',iconColumn:'icon',selectionVariable:'SelectedItem',emptyText:'Your pack is empty.',
  }),
  bind('image',journal,'icon','SelectedItem','Selected item icon',{x:134,y:-61,w:76,h:76}),
  bind('label',journal,'name','SelectedItem','Item name',{x:134,y:-3,w:235,h:33,size:21}),
  bind('label',journal,'description','SelectedItem','Item description',{x:134,y:41,w:219,h:66,size:16,color:'#b3d2dc'}),
  close('Close pack',0,103,142,1),
 ] };
 const talk = { id:'scout-dialogue',name:'Scout Dialogue',pause:true,items:[
  panel('Dialogue background',554,260,30),
  bind('image',hello,'portrait','DialogueNode','Scout portrait',{x:-210,y:-30,w:92,h:92}),
  bind('label',hello,'speaker','DialogueNode','Speaker',{ x:53,y:-75,w:350,h:34,size:24,textAlign:'left' }),
  bind('label',hello,'line','DialogueNode','Line',{ x:53,y:-29,w:350,h:69,size:17,textAlign:'left',color:'#d0e6e9' }),
  control('data-list','Dialogue choices',{
   id:'scout-choices',x:53,y:76,w:350,h:123,size:15,mode:'choices',table:tableRef(choices),
   variable:'DialogueNode',labelColumn:'prompt',fromColumn:'from',nextColumn:'next',emptyText:'No further replies.',
  }),
  close('Leave',-210,113,92,1),
 ] };
 project.uiScreens.push(bag,talk);
 project.inputActions.push(
  { id:'open-pack',name:'Open pack',keys:['I'],buttons:[2] },
  { id:'talk-npc',name:'Talk to NPC',keys:['E'],buttons:[3] },
 );
 const inventory = (kind,row) => block(kind,{name:'Inventory',row,quantity:'1'});
 freshStart.actions.push(block('inventoryClear',{name:'Inventory'}),inventory('inventoryAdd',journal),
  block('setGlobal',{name:'SelectedItem',value:JSON.stringify(journal)}));
 // Earlier Shard Runner checkpoints stored Score but predate the inventory.
 restored.actions.push(block('setEntry',{ name:'Inventory',key:JSON.stringify(shard),value:'Score' }));
 collectShard.actions.push(inventory('inventoryAdd',shard));
 const fromInputOrButton = (input,control,actions,children=[]) => ({
  ...event([block('inputPressed',{input}),block('uiActivated',{control})],actions,children),mode:'or',
 });
 const nearAda = () => block('compare',{expr:'abs(Player.x - ScoutAda.x) < 68 && abs(Player.y - ScoutAda.y) < 58'});
 arena.events.push(
  event([block('tick')],[block('setGlobal',{name:'ScoutHint',value:'"Scout Ada is near the first shard"'})],[
   event([nearAda()],[block('setGlobal',{name:'ScoutHint',value:'"Scout Ada · E to talk"'})]),
  ]),
  fromInputOrButton('open-pack','open-field-pack',[block('showUI',{screen:bag.id})]),
  fromInputOrButton('talk-npc','talk-to-ada',[],[
   event([nearAda()],[block('openDialogue',{screen:talk.id,name:'DialogueNode',row:hello})]),
  ]),
  event([block('uiListSelected',{control:'scout-choices',row:askLantern}),
   { ...inventory('inventoryHas',lantern),invert:true }],[inventory('inventoryAdd',lantern)]),
 );
}
