const spritePlayback = { raf:0, frame:null };
const spriteOnionSettings = {
 previous:{enabled:true,color:'#f28d9c',opacity:22},
 next:{enabled:true,color:'#78baff',opacity:22},
};

function spriteDefaultFrameDuration(doc) {
 const fps=doc.sheet?.fps;
 return Number.isFinite(fps) && fps>0 ? Math.min(60000,Math.max(1,Math.round(1000/fps))) : 100;
}

function spriteTimelineFrames(doc) {
 return doc.frames ?? Array.from({length:spriteFrameCount(doc)},(_,index)=>({
  id:'frame-'+index,duration:spriteDefaultFrameDuration(doc),
 }));
}

function spriteFrameGridForEdit(doc,width,height,settings) {
 const sameLayout=doc.sheet && ['w','h','margin','spacing'].every(key=>settings[key]===doc.sheet[key]);
 const full=spriteSheetGrid(width,height,settings);
 if (!doc.frames || !sameLayout) return full;
 if (full && full.cols!==doc.sheet.cols) return full;
 return spriteSheetGrid(width,height,settings,Math.min(full?.count ?? doc.sheet.count,doc.sheet.count));
}

function spriteTimelineForGrid(doc,width,height,sheet) {
 if (!doc.frames) return undefined;
 const key=({x,y,w,h})=>[x,y,w,h].join(':');
 const previous=new Map(doc.frames.map((frame,i)=>[key(spriteFrameBounds(doc,i)),frame]));
 const next={width,height,sheet};
 return Array.from({length:spriteFrameCount(next)},(_,i)=>
  previous.get(key(spriteFrameBounds(next,i))) ?? {id:uid(),duration:spriteDefaultFrameDuration(next)});
}

function spriteSheetForTimeline(doc,count) {
 if (!doc.sheet && count===1) return {width:doc.width,height:doc.height,sheet:null};
 const settings=doc.sheet ?? {w:doc.width,h:doc.height,margin:0,spacing:0};
 const {w,h,margin,spacing}=settings;
 const maxColumns=Math.min(count,Math.floor((4096-2*margin+spacing)/(w+spacing)));
 const first=doc.sheet?.cols ?? Math.min(2,maxColumns);
 for (const cols of new Set([...Array.from({length:Math.max(0,maxColumns-first+1)},(_,i)=>first+i),doc.sheet?.cols ?? 1])) {
  if (!cols) continue;
  const rows=Math.ceil(count/cols);
  const width=Math.max(doc.width,2*margin+w*cols+spacing*(cols-1));
  const height=Math.max(doc.height,2*margin+h*rows+spacing*(rows-1));
  if (!validSpriteSize(width,height)) continue;
  const sheet=spriteSheetGrid(width,height,settings,count);
  if (sheet) return {width,height,sheet};
 }
 throw Error('There is no room for another frame within the maximum sprite size.');
}

function spriteOccupiedPixels(image,box) {
 const right=Math.min(image.width,box.x+box.w), bottom=Math.min(image.height,box.y+box.h);
 for (let y=box.y;y<bottom;y++) for (let x=box.x;x<right;x++) {
  if (image.data[(y*image.width+x)*4+3]) return true;
 }
 return false;
}

function repackSpriteLayers(doc,layout,oldBoxes,newBoxes,sources) {
 const additions=layout.sheet?.cols===doc.sheet?.cols ? newBoxes.slice(oldBoxes.length) : newBoxes;
 const candidates=additions.filter(({ x,y })=>x<doc.width && y<doc.height);
 return spriteLayers(doc).map(layer=>{
  const canvas=spriteCanvas(layout.width,layout.height);
  if (!layer.image) return {layer,canvas,source:''};
  const original=spriteWorkspace.surfaces.get(layer.id).canvas;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  context.drawImage(original,0,0);
  for (const {x,y,w,h} of oldBoxes) context.clearRect(x,y,w,h);
  if (candidates.length) {
   const remainder=context.getImageData(0,0,doc.width,doc.height);
   if (candidates.some(box=>spriteOccupiedPixels(remainder,box))) {
    throw Error('A destination frame overlaps artwork outside the frame grid. Move that artwork before changing the timeline.');
   }
  }
  newBoxes.forEach(({x,y,w,h},i)=>{
   const from=oldBoxes[sources[i]];
   if (from) context.drawImage(original,from.x,from.y,from.w,from.h,x,y,w,h);
  });
  return {layer,canvas,source:canvas.toDataURL('image/png')};
 });
}

function remapSpriteSlices(doc,oldBoxes,newBoxes,indexMap) {
 return doc.slices.map(slice=>{
  const from=oldBoxes.findIndex(box=>slice.x>=box.x && slice.y>=box.y &&
   slice.x+slice.w<=box.x+box.w && slice.y+slice.h<=box.y+box.h);
  if (from<0) return slice;
  const to=newBoxes[indexMap[from]], old=oldBoxes[from];
  if (!to) throw Error('The slice “'+slice.name+'” belongs to this frame. Move or remove the slice before deleting the frame.');
  return {...slice,x:slice.x+to.x-old.x,y:slice.y+to.y-old.y};
 });
}

function applySpriteTimeline(doc,frames,focus,duplicateFrom) {
 const previous=spriteTimelineFrames(doc);
 const layout=spriteSheetForTimeline(doc,frames.length);
 const byId=new Map(frames.map((frame,i)=>[frame.id,i]));
 const byOldId=new Map(previous.map((frame,i)=>[frame.id,i]));
 const indexMap=previous.map(frame=>byId.get(frame.id));
 const sources=frames.map(frame=>byOldId.get(frame.id)??(frame===focus?duplicateFrom:undefined));
 const targets=spriteTargets(doc);
 const linkedFrames=targets.flatMap(type=>(type.animator?.clips ?? []).flatMap(clip=>
  clip.frames.map(frame=>({frame,tile:indexMap[frame.tile],name:clip.name}))));
 const broken=linkedFrames.find(item=>item.tile===undefined);
 if (broken) throw Error('Animator clip “'+broken.name+'” uses this frame. Remove that reference in Animator before deleting the frame.');
 const oldBoxes=previous.map((_,i)=>spriteFrameBounds(doc,i)), newBoxes=frames.map((_,i)=>spriteFrameBounds(layout,i));
 const slices=remapSpriteSlices(doc,oldBoxes,newBoxes,indexMap);
 const layers=repackSpriteLayers(doc,layout,oldBoxes,newBoxes,sources);
 const oldFrame=spriteWorkspace.frame;
 change(()=>{
  Object.assign(doc,layout,{frames,slices});
  for (const {layer,canvas,source} of layers) {
   layer.image=source;
   spriteWorkspace.surfaces.set(layer.id,{canvas,source,ready:true});
  }
  for (const item of linkedFrames) item.frame.tile=item.tile;
  for (const type of targets) type.sheet={...doc.sheet,fps:type.sheet?.fps??doc.sheet.fps};
  if (targets.some(type=>type.id===animator.type)) {
   animator.selection.clear();
   animator.lastTile=null;
  }
  setSpriteArtwork(doc);
  spriteWorkspace.frame=byId.get(focus.id);
  spriteWorkspace.mask=null;
  if (oldFrame===null) spriteWorkspace.zoom=resetSpriteZoom();
 });
}

function spriteTimelineAction(action,detail={}) {
 const doc=currentSprite();
 if (!doc) return;
 if (action==='play') {
  if (spritePlayback.raf) stopSpriteTimeline();
  else playSpriteTimeline(doc);
  return;
 }
 stopSpriteTimeline(false);
 const frames=[...spriteTimelineFrames(doc)];
 const index=spriteWorkspace.frame??0;
 try {
  if (action==='select') {
   if (!frames[detail.index]) return;
   if (detail.layer && spriteLayers(doc).some(layer=>layer.id===detail.layer)) spriteWorkspace.layer=detail.layer;
   if (spriteWorkspace.frame!==detail.index) return spriteSetFrame(detail.index);
   updateSpriteControls(doc);
   updateSpriteTimeline(doc);
   return;
  }
  if (action==='onion') {
   spriteWorkspace.onion=detail.value;
  } else if (action==='onionSetting') {
   const settings=spriteOnionSettings[detail.side];
   const {key,value}=detail;
   settings[key]=key==='opacity'?Math.min(100,Math.max(0,Number(value)||0)):value;
  } else if (action==='duration') {
   const ms=Number(detail.value);
   if (validSpriteFrameDuration(ms) && ms!==frames[index].duration) return change(()=>{
    frames[index]={...frames[index],duration:ms};
    doc.frames=frames;
   });
  } else {
   if (!spriteReady() || spriteWorkspace.gesture) return;
   let focus=frames[index], duplicateFrom;
   switch (action) {
    case 'add': case 'duplicate': {
     if (frames.length>=4096) throw Error('A sprite supports up to 4096 frames.');
     if (action==='duplicate') duplicateFrom=index;
     const position=spriteWorkspace.frame===null && action==='add'?frames.length:index+1;
     focus={id:uid(),duration:action==='duplicate'?focus.duration:spriteDefaultFrameDuration(doc)};
     frames.splice(position,0,focus);
     break;
    }
    case 'delete':
     if (frames.length===1) return;
     frames.splice(index,1);
     focus=frames[Math.min(index,frames.length-1)];
     break;
    case 'move': {
     const {from,to}=detail;
     if (!frames[from] || !frames[to] || from===to) return;
     [focus]=frames.splice(from,1);
     frames.splice(to,0,focus);
     break;
    }
    default: return;
   }
   applySpriteTimeline(doc,frames,focus,duplicateFrom);
   return;
  }
 } catch (error) { alert(error.message); }
 updateSpriteTimeline(doc);
 drawSpriteEditor();
}

function updateSpriteTimeline(doc=currentSprite()) {
 const timeline=$('#sprite-timeline');
 timeline.hidden=!doc;
 if (!doc) {
  timeline.model=null;
  return;
 }
 const frames=spriteTimelineFrames(doc);
 const layers=spriteLayers(doc).map(layer=>({
  id:layer.id,name:layer.name,locked:layer.locked,visible:layer.visible,
  canvas:spriteWorkspace.surfaces.get(layer.id)?.ready?spriteWorkspace.surfaces.get(layer.id).canvas:null,
 }));
 timeline.model={doc:doc.id,frames,layers,layer:spriteWorkspace.layer,frame:spriteWorkspace.frame,
  boxes:frames.map((_,i)=>spriteFrameBounds(doc,i)),onion:spriteWorkspace.onion,onionSettings:spriteOnionSettings,ready:spriteReady()};
}

function stopSpriteTimeline(redraw=true) {
 if (!spritePlayback.raf && spritePlayback.frame===null) return;
 cancelAnimationFrame(spritePlayback.raf);
 Object.assign(spritePlayback,{raf:0,frame:null});
 $('#sprite-timeline').playhead=null;
 if (redraw && tab==='sprite') drawSpriteEditor();
}

function playSpriteTimeline(doc) {
 const frames=spriteTimelineFrames(doc);
 if (!spriteReady() || spriteWorkspace.gesture || frames.length<2) return;
 const endings=[];
 for (const {duration} of frames) endings.push((endings.at(-1)??0)+duration);
 const total=endings.at(-1);
 const start=performance.now();
 const offset=endings[(spriteWorkspace.frame??0)-1]??0;
 function tick(now) {
  if (tab!=='sprite' || currentSprite()!==doc) {
   stopSpriteTimeline(false);
   return;
  }
  const position=(Math.max(0,now-start)+offset)%total;
  let lo=0,hi=endings.length-1;
  while (lo<hi) {
   const middle=(lo+hi)>>1;
   if (position<endings[middle]) hi=middle;
   else lo=middle+1;
  }
  if (spritePlayback.frame!==lo) {
   spritePlayback.frame=lo;
   $('#sprite-timeline').playhead=lo;
   drawSpriteEditor();
  }
  spritePlayback.raf=requestAnimationFrame(tick);
 }
 spritePlayback.raf=requestAnimationFrame(tick);
}

const spriteOnionSurface=document.createElement('canvas');
function drawSpriteOnion(context,doc,frame) {
 if (!spriteWorkspace.onion || frame==null) return;
 const area=spriteFrameBounds(doc,frame);
 if (spriteOnionSurface.width!==area.w) spriteOnionSurface.width=area.w;
 if (spriteOnionSurface.height!==area.h) spriteOnionSurface.height=area.h;
 const tint=spriteOnionSurface.getContext('2d');
 for (const [side,index] of [['previous',frame-1],['next',frame+1]]) {
  const {enabled,color,opacity}=spriteOnionSettings[side];
  if (!enabled || !opacity || index<0 || index>=spriteFrameCount(doc)) continue;
  tint.clearRect(0,0,area.w,area.h);
  drawSpriteLayers(tint,spriteFrameBounds(doc,index));
  tint.globalCompositeOperation='source-in';
  tint.fillStyle=color;
  tint.fillRect(0,0,area.w,area.h);
  tint.globalCompositeOperation='source-over';
  context.save();
  context.globalAlpha=opacity/100;
  context.drawImage(spriteOnionSurface,0,0);
  context.restore();
 }
}
