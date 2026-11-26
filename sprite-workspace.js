const spritePanelLabels={ palette:'Palette', documents:'Sprites', slices:'Slices', tools:'Tools', layers:'Layers', properties:'Sprite Properties' };
const spritePanelDefaults={
 palette:{side:'left',order:0},documents:{side:'left',order:1},slices:{side:'left',order:2},
 tools:{side:'right',order:0},layers:{side:'right',order:1},properties:{side:'right',order:2},
};
const spriteBuiltInPalettes=[
 {name:'VOID Studio',colors:spriteInitialPalette},
 {name:'Moonlight',colors:['#131227','#252548','#3a426f','#516698','#7a9bb8','#b3d3d7','#eff7e6']},
 {name:'Copper Canyon',colors:['#231817','#472624','#73332a','#ae5540','#d97e4a','#f3af68','#ffe1a2']},
];
const spriteWorkspaceStorage='void-sprite-workspace';

function loadSpritePreferences() {
 let saved;
 try { saved=JSON.parse(localStorage.getItem(spriteWorkspaceStorage)); } catch {}
 const panels={};
 for (const [id,defaults] of Object.entries(spritePanelDefaults)) {
  const panel=saved?.panels?.[id];
  panels[id]={side:['left','right'].includes(panel?.side)?panel.side:defaults.side,
   order:Number.isFinite(panel?.order)?panel.order:defaults.order,collapsed:panel?.collapsed===true,hidden:panel?.hidden===true};
 }
 return {panels,locked:saved?.locked===true,swatchSize:[18,22,30].includes(saved?.swatchSize)?saved.swatchSize:22,
  presets:Array.isArray(saved?.presets)?saved.presets.filter(preset=>typeof preset?.name==='string' &&
   Array.isArray(preset.colors) && preset.colors.length<=256 && preset.colors.every(color=>/^#[\da-f]{6}$/i.test(color))):[]};
}
const spritePreferences=loadSpritePreferences();

function saveSpritePreferences() {
 try { localStorage.setItem(spriteWorkspaceStorage,JSON.stringify(spritePreferences)); } catch {}
}

function spritePanelsOnSide(side) {
 return Object.keys(spritePanelLabels).filter(id=>spritePreferences.panels[id].side===side)
  .sort((a,b)=>spritePreferences.panels[a].order-spritePreferences.panels[b].order);
}

function renderSpritePanelLayout(doc) {
 for (const [side,root] of [['left',$('#sprite-sidebar')],['right',$('#sprite-inspector')]]) {
  const ids=spritePanelsOnSide(side);
  const visible=ids.filter(id=>!spritePreferences.panels[id].hidden && (doc || id==='documents'));
  root.toggleAttribute('data-empty',!visible.length);
  ids.forEach((id,index)=>{
   const panel=document.getElementById('sprite-panel-'+id);
   const {collapsed}=spritePreferences.panels[id];
   const position=visible.indexOf(id);
   panel.hidden=position<0;
   panel.config={id,label:spritePanelLabels[id],collapsed,side,first:position===0,last:position===visible.length-1};
   if (root.children[index]!==panel) root.insertBefore(panel,root.children[index]??null);
  });
 }
}

function changeSpritePanel(id,command) {
 if (command==='reset') {
  for (const [key,defaults] of Object.entries(spritePanelDefaults)) spritePreferences.panels[key]={...defaults,hidden:false,collapsed:false};
 } else {
  const panel=spritePreferences.panels[id];
  if (!panel) return;
  if (command==='collapse') panel.collapsed=!panel.collapsed;
  else if (command==='hide') panel.hidden=!panel.hidden;
  else if (command==='side') {
   panel.side=panel.side==='left'?'right':'left';
   const destination=spritePanelsOnSide(panel.side).filter(other=>other!==id);
   [...destination,id].forEach((key,index)=>{ spritePreferences.panels[key].order=index; });
  } else {
   const ids=spritePanelsOnSide(panel.side);
   const visible=ids.filter(key=>!spritePreferences.panels[key].hidden);
   const neighbor=visible[visible.indexOf(id)+(command==='up'?-1:1)];
   if (!neighbor) return;
   const a=ids.indexOf(id), b=ids.indexOf(neighbor);
   [ids[a],ids[b]]=[ids[b],ids[a]];
   ids.forEach((key,index)=>{ spritePreferences.panels[key].order=index; });
  }
 }
 saveSpritePreferences();
 renderSpritePanelLayout(currentSprite());
 renderStudioMenu();
}

function updateSpriteControls(doc = currentSprite()) {
 $('#sprite-brush').hidden=!doc;
 if (!doc) return;
 const {paint,size,mirrorX,mirrorY}=spriteWorkspace;
 $('#sprite-brush').model={size,mirrorX,mirrorY};
 $('#sprite-palette').model={id:doc.id,colors:doc.palette,...paint,locked:spritePreferences.locked,swatchSize:spritePreferences.swatchSize};
 $('#sprite-layers').model={layers:spriteLayers(doc),selected:spriteWorkspace.layer};
}

function pickSpriteSwatch(doc,index,side) {
 const ink=spriteWorkspace.paint[side];
 if (index===null) ink.alpha=0;
 else if (doc.palette[index]) Object.assign(ink,{color:doc.palette[index],alpha:255});
 updateSpriteControls(doc);
}

function replaceSpritePalette(doc,colors) {
 if (colors.length===doc.palette.length && colors.every((color,i)=>color===doc.palette[i])) return;
 change(()=>{ doc.palette=colors; });
}

function resizeSpritePalette(doc,count) {
 const size=Math.max(0,Math.min(Math.max(256,doc.palette.length),Math.round(count)));
 if (Number.isFinite(size)) replaceSpritePalette(doc,Array.from({length:size},(_,i)=>doc.palette[i]??'#000000'));
}

function editSpriteSwatch(doc,index) {
 const current=doc.palette[index];
 if (!current) return;
 simple('Edit Swatch',field('Color','color',current,'color'),values=>{
  const color=values.color.toLowerCase();
  if (color===current) return;
  change(()=>{
   doc.palette[index]=color;
   for (const ink of Object.values(spriteWorkspace.paint)) if (ink.color===current && ink.alpha) ink.color=color;
  });
 });
}

function spritePaletteOperation(doc,{ name,range }) {
 const colors=doc.palette.slice();
 const [start,end]=range??[0,colors.length-1];
 const segment=colors.slice(start,end+1);
 const rgb=color=>[1,3,5].map(i=>Number.parseInt(color.slice(i,i+2),16));
 if (segment.length<2) return;
 if (name==='reverse') segment.reverse();
 else if (name==='gradient') {
  const a=rgb(segment[0]), b=rgb(segment.at(-1));
  for (let i=1;i<segment.length-1;i++) {
   segment[i]='#'+a.map((value,c)=>Math.round(value+(b[c]-value)*i/(segment.length-1)).toString(16).padStart(2,'0')).join('');
  }
 } else {
  const hue=([r,g,b])=>{
   const min=Math.min(r,g,b), max=Math.max(r,g,b), delta=max-min;
   if (!delta) return -1;
   const h=max===r?(g-b)/delta:max===g?2+(b-r)/delta:4+(r-g)/delta;
   return (h+6)%6;
  };
  const brightness=([r,g,b])=>.2126*r+.7152*g+.0722*b;
  const compare=name==='hue'?hue:brightness;
  const ranked=segment.map(color=>({color,key:compare(rgb(color))})).sort((a,b)=>a.key-b.key);
  segment.splice(0,segment.length,...ranked.map(item=>item.color));
 }
 colors.splice(start,segment.length,...segment);
 replaceSpritePalette(doc,colors);
}

function spritePaletteFromCanvas(doc) {
 if (!spriteReady()) return;
 const canvas=flattenedSprite(doc), data=canvas.getContext('2d').getImageData(0,0,doc.width,doc.height).data;
 const counts=new Map();
 const stride=Math.max(1,Math.ceil(doc.width*doc.height/65536))*4;
 for (let i=0;i<data.length;i+=stride) if (data[i+3]) {
  const color=(data[i]<<16)|(data[i+1]<<8)|data[i+2];
  counts.set(color,(counts.get(color)??0)+1);
 }
 if (!counts.size) return alert('The sprite has no visible colors.');
 const colors=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,256).map(([color])=>'#'+color.toString(16).padStart(6,'0'));
 replaceSpritePalette(doc,colors);
}

function spritePalettePresets(doc) {
 const presets=[...spriteBuiltInPalettes,...spritePreferences.presets];
 simple('Palette Presets',field('Search presets','search','','search')+
  '<div class="sprite-preset-list">'+presets.map(({name,colors},index)=>
   `<label class="sprite-preset" data-preset-name="${esc(name.toLowerCase())}">
    <input type="radio" name="sprite-preset" value="${index}" ${index===0?'checked':''}><span>${esc(name)}</span>
    <span class="sprite-preset-colors">${colors.map(color=>`<i style="background:${color}"></i>`).join('')}</span>
   </label>`).join('')+'</div>',()=>{
    const selected=$('#dialogbody [name="sprite-preset"]:checked');
    if (!selected || selected.closest('label').hidden) throw Error('Select a palette preset.');
    replaceSpritePalette(doc,[...presets[Number(selected.value)].colors]);
   });
 $('#dialogbody [data-field="search"]').addEventListener('input',event=>{
  const query=event.target.value.trim().toLowerCase();
  for (const row of $('#dialogbody').querySelectorAll('.sprite-preset')) row.hidden=!row.dataset.presetName.includes(query);
  const selected=$('#dialogbody [name="sprite-preset"]:checked');
  if (!selected || selected.closest('label').hidden) {
   const first=$('#dialogbody .sprite-preset:not([hidden]) input');
   if (first) first.checked=true;
  }
 });
}

function saveSpritePalettePreset(doc) {
 simple('Save Palette Preset',field('Name','name',doc.name),values=>{
  const name=values.name.trim().slice(0,80);
  if (!name || spriteBuiltInPalettes.some(preset=>preset.name.toLowerCase()===name.toLowerCase())) throw Error('Choose a name for your preset.');
  const index=spritePreferences.presets.findIndex(preset=>preset.name.toLowerCase()===name.toLowerCase());
  const preset={name,colors:doc.palette.slice(0,256)};
  if (index<0) spritePreferences.presets.push(preset);
  else spritePreferences.presets[index]=preset;
  saveSpritePreferences();
 });
}

async function openSpritePalette(event) {
 const input=event.target, file=input.files[0], project=P, doc=currentSprite();
 input.value='';
 if (!file || !doc || spritePreferences.locked) return;
 try {
  const contents=await file.text();
  if (P!==project || currentSprite()!==doc || spritePreferences.locked) return;
  const [header,...rows]=contents.replace(/^\uFEFF/,'').split(/\r?\n/);
  if (header.trim()!=='GIMP Palette') throw Error('Choose a GIMP Palette (.gpl) file.');
  const colors=rows.flatMap(line=>{
   const match=line.match(/^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s|$)/);
   const channels=match?.slice(1).map(Number);
   return channels?.every(channel=>channel<=255)?['#'+channels.map(channel=>channel.toString(16).padStart(2,'0')).join('')]:[];
  });
  if (!colors.length || colors.length>256) throw Error('Use a palette containing 1 to 256 RGB colors.');
  replaceSpritePalette(doc,colors);
 } catch (error) { alert(error.message); }
}

function exportSpritePalette(doc) {
 const name=doc.name.replace(/[^a-z0-9_-]+/gi,'_')||'sprite';
 const entries=doc.palette.map(color=>[1,3,5].map(i=>Number.parseInt(color.slice(i,i+2),16)).join('\t'));
 dl(name+'.gpl',['GIMP Palette','Name: '+doc.name.replace(/[\r\n]/g,' '),'#',...entries,''].join('\n'),'text/plain');
}

function reorderSpriteLayer(doc,{id,target,above}) {
 const stack=spriteLayers(doc);
 const item=stack.find(layer=>layer.id===id), neighbor=stack.find(layer=>layer.id===target);
 if (!item || !neighbor || item===neighbor || !spriteReady()) return;
 const order=stack.filter(layer=>layer!==item);
 order.splice(order.indexOf(neighbor)+(above?1:0),0,item);
 if (order.every((layer,i)=>layer===stack[i])) return;
 change(()=>{
  let index=0;
  P.spriteLayers=P.spriteLayers.map(layer=>layer.document===doc.id?order[index++]:layer);
  spriteWorkspace.layer=id;
  setSpriteArtwork(doc);
 });
}

function spriteControlAction(event) {
 const details=event.detail, {action}=details, doc=currentSprite(), state=spriteWorkspace;
 if (tab!=='sprite') return;
 if (action==='panel') return changeSpritePanel(details.id,details.command);
 if (action==='timeline') return spriteTimelineAction(details.command,details);
 if (!doc) return;
 switch (action) {
 case 'brushSize': state.size=Math.max(1,Math.min(16,Math.round(Number(details.value)||1))); updateSpriteControls(doc); break;
 case 'mirrorX': case 'mirrorY': spriteEditorAction(action); break;
 case 'ink': {
  const ink=state.paint[details.side];
  if (details.color!==undefined) Object.assign(ink,{color:details.color,alpha:ink.alpha||255});
  else ink.alpha=Math.round(255*Math.max(0,Math.min(100,Number(details.opacity)||0))/100);
  updateSpriteControls(doc); break;
 }
 case 'layerAction': spriteEditorAction(details.command,details.id); break;
 case 'renameLayer': {
  const layer=spriteLayers(doc).find(item=>item.id===details.id), name=details.name.trim().slice(0,100);
  if (layer && name && name!==layer.name) change(()=>{ layer.name=name; });
  break;
 }
 case 'layerOpacity': {
  const layer=spriteLayers(doc).find(item=>item.id===details.id);
  const opacity=Number(details.value)/100;
  if (layer && opacity!==layer.opacity && spriteReady()) change(()=>{ layer.opacity=opacity; setSpriteArtwork(doc); });
  break;
 }
 case 'reorderLayer': reorderSpriteLayer(doc,details); break;
 case 'pickPalette': pickSpriteSwatch(doc,details.index,details.side); break;
 case 'paletteLock': spritePreferences.locked=!spritePreferences.locked; saveSpritePreferences(); updateSpriteControls(doc); break;
 case 'swatchSize': spritePreferences.swatchSize=details.size; saveSpritePreferences(); updateSpriteControls(doc); break;
 case 'paletteExport': exportSpritePalette(doc); break;
 case 'savePalettePreset': saveSpritePalettePreset(doc); break;
 default: if (!spritePreferences.locked) spritePaletteEdit(doc,action,details);
 }
}

function spritePaletteEdit(doc,action,details) {
 switch (action) {
 case 'paletteSize': resizeSpritePalette(doc,details.count); break;
 case 'paletteSizeDialog': simple('Palette Size',field('Colors','count',doc.palette.length,'number'),values=>resizeSpritePalette(doc,Number(values.count))); break;
 case 'editSwatch': editSpriteSwatch(doc,details.index); break;
 case 'removeSwatch': replaceSpritePalette(doc,doc.palette.filter((color,i)=>i!==details.index)); break;
 case 'saveInk': {
  const { color }=spriteWorkspace.paint[details.side];
  if (doc.palette.length<256 && !doc.palette.includes(color)) replaceSpritePalette(doc,[...doc.palette,color]);
  break;
 }
 case 'paletteOperation': spritePaletteOperation(doc,details); break;
 case 'palettePresets': spritePalettePresets(doc); break;
 case 'paletteImport': $('#sprite-palette-file').click(); break;
 case 'paletteFromSprite': spritePaletteFromCanvas(doc); break;
 }
}

function setupSpriteControls() {
 document.addEventListener('sprite-control',spriteControlAction);
 $('#sprite-palette-file').addEventListener('change',openSpritePalette);
}
