function starterPaint(context, draw, offset = 0) {
 draw((x,y,w,h,color) => {
  context.fillStyle = color;
  context.fillRect(x+offset,y,w,h);
 });
}

function starterCoast() {
 const canvas = spriteCanvas(16*13,16), ctx = canvas.getContext('2d');
 const tile = (index,paint) => starterPaint(ctx,paint,16*index);
 const sea = (index,color,glint) => tile(index,p=>{
  p(0,0,16,16,color); p(2,5,5,1,glint); p(11,12,3,1,glint); p(4,14,2,1,'#123e51');
 });
 sea(0,'#153c51','#1b5062'); sea(8,'#163e52','#235867'); sea(9,'#174155','#286076');
 tile(1,p=>{
  p(0,0,16,16,'#3c655c'); p(1,3,1,1,'#60816b'); p(10,8,1,2,'#60816b');
  p(5,13,2,1,'#365c52'); p(13,1,2,1,'#35594e');
 });
 tile(2,p=>{
  p(0,0,16,16,'#735e51');
  for (let y=0;y<16;y+=4) { p(0,y,16,1,'#594c49'); p(0,y+1,16,1,'#8b7360'); }
  p(2,3,1,1,'#675550'); p(11,11,1,1,'#675550');
 });
 tile(3,p=>{
  p(0,0,16,16,'#465c64'); p(0,0,16,1,'#59737b'); p(0,8,16,1,'#3b4e59');
  p(4,1,1,7,'#547079'); p(12,9,1,7,'#3b4e59');
 });
 tile(4,p=>{p(0,0,16,2,'#97a582');p(0,2,16,2,'#628471');});
 tile(5,p=>{p(0,13,16,3,'#304f46');p(0,14,16,1,'#56786a');});
 tile(6,p=>{p(0,2,2,12,'#7c9a82');p(2,5,1,5,'#61816c');});
 tile(7,p=>{p(14,2,2,12,'#264a44');p(13,5,1,5,'#4d7463');});
 tile(10,p=>{
  p(1,7,2,4,'#6b945e'); p(3,10,4,2,'#537f58'); p(5,8,1,2,'#78a66d'); p(12,2,2,1,'#618f6b');
 });
 tile(11,p=>{
  p(0,10,16,2,'#493d43'); p(0,8,16,2,'#a58365'); p(2,6,3,8,'#674e47'); p(2,6,3,1,'#c29c75');
 });
 tile(12,p=>{
  p(6,4,3,2,'#e7b875'); p(4,6,9,1,'#9a8060'); p(6,7,3,2,'#cba06d');
 });

 const atlas = {
  id:'coast',name:'Harbor terrain',image:canvas.toDataURL('image/png'),width:canvas.width,height:16,
  tileWidth:16,tileHeight:16,margin:0,spacing:0,tiles:{},
 };
 const surfaces = {
  id:'harbor-surface',name:'HarborSurface',values:[
   {id:'sea',name:'Water',icon:'tile/coast/0/0'},{id:'land',name:'Grass',icon:'tile/coast/1/0'},
   {id:'pier',name:'Boardwalk',icon:'tile/coast/2/0'},{id:'stone',name:'Stone',icon:'tile/coast/3/0'},
  ],
 };
 for (const [index,surface] of [[0,0],[8,0],[9,0],[1,1],[2,2],[3,3]]) {
  atlas.tiles[index+',0'] = { solid:surface === 0,tags:[tileEnumToken(surfaces,surfaces.values[surface])] };
 }
 const ground = { ...tileLayer('Harbor ground'),id:'coast-ground',collision:true };
 const trim = { ...tileLayer('Shoreline and foliage'),id:'coast-trim' };
 const rails = { ...tileLayer('Pier rails and markers'),id:'coast-rails',above:true };
 const tileAt = (layer,x,y,column) => { layer.cells[x+','+y]={atlas:atlas.id,column,row:0}; };
 const within = (x,y,left,top,right,bottom) => x>=left && x<=right && y>=top && y<=bottom;
 const surfaceAt = (x,y) => {
  if (within(x,y,11,12,30,14) || within(x,y,15,9,17,12) || within(x,y,24,14,26,16)) return 2;
  if (within(x,y,29,8,37,17) || within(x,y,30,7,36,18)) return 3;
  if (within(x,y,2,12,11,18) || within(x,y,3,11,10,19) ||
      within(x,y,12,5,20,9) || within(x,y,13,4,19,10) ||
      within(x,y,22,16,28,19) || within(x,y,23,15,27,20)) return 1;
  return 0;
 };
 for (let y=0;y<22;y++) for (let x=0;x<40;x++) {
  const s = surfaceAt(x,y), salt = (x*37 + y*19 + x*y*5) % 29;
  tileAt(ground,x,y,s || (salt<2 ? 9 : salt<10 ? 8 : 0));
  if (!s) continue;
  if (!surfaceAt(x,y-1)) tileAt(s === 2 ? rails : trim,x,y,s === 2 ? 11 : 4);
  else if (!surfaceAt(x,y+1)) tileAt(trim,x,y,5);
  else if (!surfaceAt(x-1,y)) tileAt(trim,x,y,6);
  else if (!surfaceAt(x+1,y)) tileAt(trim,x,y,7);
  else if (s === 1 && salt<9) tileAt(trim,x,y,10);
  else if (s === 3 && salt<3) tileAt(trim,x,y,12);
 }
 return { atlas,surfaces,map:{orientation:'orthogonal',columns:40,rows:22,cellWidth:16,cellHeight:16,x:0,y:0,layers:[ground,trim,rails]} };
}

function starterSprite(project,id,name,w,h,frames,paint) {
 const canvas = spriteCanvas(w*frames.length,h), ctx = canvas.getContext('2d');
 frames.forEach((duration,index)=>starterPaint(ctx,draw=>paint(draw,index),index*w));
 const sheet = frames.length > 1 ? spriteSheetGrid(canvas.width,h,{w,h}) : null;
 const doc = { ...newSpriteDocument(name,canvas.width,h,sheet),id:'low-tide-'+id };
 if (sheet) doc.frames = frames.map((duration,index)=>({id:id+'-'+index,duration}));
 doc.palette = ['#152c3f','#203f52','#34646f','#60b58e','#91e9b0','#c48658','#efb866','#ffe9a4','#e9f7de'];
 const image = canvas.toDataURL('image/png');
 project.spriteDocuments.push(doc);
 project.spriteLayers.push(makeSpriteLayer(doc,'Pixel artwork',image));
 return { image,spriteDocument:doc.id,...(sheet ? {sheet} : {}) };
}

function starterHarborArtwork(project) {
 const sprite = (id,name,w,h,frames,draw) => starterSprite(project,id,name,w,h,frames,draw);
 const courier = sprite('courier','Courier walk cycle',16,16,[520,160,100,100],(p,frame)=>{
  const bob = frame === 3 ? -1 : 0, foot = frame === 2 ? 1 : frame === 3 ? -1 : 0;
  p(3,3+bob,10,10,'#132b3c'); p(4,2+bob,8,2,'#132b3c'); p(5,3+bob,6,1,'#efb866');
  p(4,4+bob,8,5,'#efb866'); p(5,6+bob,6,3,'#e9bd94'); p(6,7+bob,1,1,'#203f52'); p(9,7+bob,1,1,'#203f52');
  p(4,9+bob,8,3,'#60b58e'); p(5,9+bob,6,1,'#91e9b0'); p(10,10+bob,3,2,'#ffe9a4');
  p(4,12+foot,3,2,'#203f52'); p(9,12-foot,3,2,'#203f52');
 });
 const keeper = sprite('keeper','Mira portrait',16,16,[0],p=>{
  p(3,4,10,9,'#23344a'); p(2,4,12,2,'#276074'); p(4,2,8,2,'#3d8692');
  p(5,6,6,4,'#e4b490'); p(5,7,1,1,'#263c49'); p(10,7,1,1,'#263c49');
  p(6,9,4,2,'#c17f68'); p(3,11,10,4,'#568091'); p(7,11,2,3,'#ffe9a4');
 });
 const cell = sprite('cell','Signal cell pulse',16,16,[140,140,140,140],(p,frame)=>{
  const gold=['#efb866','#ffd47f','#ffe9a4','#ffd47f'][frame];
  p(4,3,8,11,'#463d51'); p(7,2,2,1,'#ffe9a4'); p(5,4,6,8,gold); p(6,5,4,5,'#fff3bd');
  p(7,7,2,3,'#d69c5b'); p(5,12,6,1,'#a36558');
  if (frame===2) { p(2,6,1,2,gold); p(13,6,1,2,gold); }
 });
 const beacon = sprite('beacon','Save beacon',16,16,[230,230],(p,frame)=>{
  p(4,12,8,2,'#213348'); p(6,5,4,7,'#42768b'); p(4,4,8,5,'#2b5974');
  p(5,3,6,4,'#72d6b1'); p(7,3,2,3,frame ? '#ddfff3' : '#a6f6d9'); p(6,10,4,1,'#64adad');
 });
 const towerPaint = (p,lit) => {
  if (lit) {
   p(0,13,7,1,'#c1a670'); p(0,17,8,1,'#ffe8a1'); p(0,21,7,1,'#967f62');
   p(25,13,7,1,'#c1a670'); p(24,17,8,1,'#ffe8a1'); p(25,21,7,1,'#967f62');
  }
  p(3,35,26,4,'#233c50'); p(6,33,20,4,'#5e7882'); p(9,15,14,20,'#c0ada0');
  p(9,21,14,5,'#a46156'); p(9,30,14,3,'#aa8474'); p(14,29,4,6,'#405663');
  p(6,11,20,5,'#315568'); p(8,8,16,4,'#48768a'); p(12,5,8,3,'#68959a'); p(14,3,4,2,'#eac277');
  p(7,13,18,8,'#263d53'); p(10,14,12,5,lit ? '#ffe199' : '#669ba0');
  p(14,14,2,5,lit ? '#fff7d8' : '#99cdc7'); p(7,21,18,2,'#344c5f');
 };
 const tower = sprite('tower','Signal tower',32,40,[0],p=>towerPaint(p,false));
 const litTower = sprite('lit-tower','Lit signal tower',32,40,[0],p=>towerPaint(p,true));
 const chart = sprite('chart','Tide chart',16,16,[0],p=>{
  p(3,3,11,10,'#674e43'); p(4,4,9,8,'#dbc49a'); p(5,6,7,1,'#78a49b');
  p(7,7,3,3,'#5c8d83'); p(6,8,1,2,'#639694'); p(11,9,1,1,'#a55e4f'); p(4,11,9,1,'#b69978');
 });
 const iconCanvas = spriteCanvas(256,256), ctx = iconCanvas.getContext('2d');
 ctx.scale(8,8);
 starterPaint(ctx,p=>{
  p(0,0,32,32,'#19394c'); p(3,3,26,26,'#224e5a'); p(0,25,32,7,'#142f46');
  p(13,13,6,12,'#c5ac98'); p(13,18,6,3,'#9f675d'); p(11,12,10,5,'#2b4156');
  p(12,13,8,3,'#ffe9a4'); p(12,10,8,2,'#6a9a9e'); p(14,8,4,2,'#80b3ad');
  p(3,14,6,1,'#d9bd7a'); p(23,14,6,1,'#d9bd7a'); p(4,27,9,1,'#306578'); p(21,28,7,1,'#306578');
 });
 return {courier,keeper,cell,beacon,tower,litTower,chart,icon:iconCanvas.toDataURL('image/png')};
}
