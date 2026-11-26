const animator = { type: null, clip: null, frame: -1, selection: new Set(), lastTile: null, position: 0, playing: false, raf: 0 };
const animatorType = () => T(I()?.type || activeType);
const animatorClip = () => animatorType()?.animator?.clips.find(clip => clip.id === animator.clip);
const loopModes = [['loop', 'Loop'], ['once', 'Once'], ['pingpong', 'Ping-pong']];

function validAnimator(value) {
 return typeof value.autoplay === 'string' && Array.isArray(value.clips) && value.clips.every(clip =>
  clip && typeof clip.id === 'string' && typeof clip.name === 'string' && loopModes.some(([mode]) => mode === clip.loop) &&
  Number.isFinite(clip.duration) && clip.duration >= 0 && Array.isArray(clip.frames) && clip.frames.every(frame =>
   frame && Number.isInteger(frame.tile) && frame.tile >= 0 && Number.isFinite(frame.duration) && frame.duration > 0) &&
  isRecord(clip.tracks) && Object.entries(clip.tracks).every(([track, keys]) => Object.hasOwn(ANIMATION_TRACKS, track) &&
   Array.isArray(keys) && keys.every((key, index) => key && Number.isFinite(key.time) && key.time >= 0 &&
    Number.isFinite(key.value) && (!index || key.time > keys[index - 1].time))));
}

function layoutSpritePose(type, object) {
 const clip = type.animator?.clips.find(item => item.id === type.animator.autoplay);
 if (clip) {
  const pose = animationPose(clip, 0);
  return { ...object, pose, animFrame: pose.frame ?? 0 };
 }
 const frame = type.sheet?.fps ? Math.floor(performance.now() / 1000 * type.sheet.fps) % type.sheet.count : 0;
 return { ...object, animFrame: frame };
}

function spriteAtlas(type, image) {
 const sheet = type.sheet;
 return { tileWidth: sheet.w, tileHeight: sheet.h, margin: sheet.margin ?? 0, spacing: sheet.spacing ?? 0,
  width: image.naturalWidth, height: image.naturalHeight, image: type.image };
}

function configureSpriteSheet(type, source) {
 const current = type.sheet;
 const oldImage = type.image ? tileImage(images, { image: type.image }) : null;
 const asset = source ?? { image: type.image, width: oldImage?.naturalWidth, height: oldImage?.naturalHeight };
 if (!asset.width || !asset.height) throw Error('Load a sprite sheet image first');
 const fields = [['w', 'Frame width', current?.w ?? Math.min(16, asset.width)], ['h', 'Frame height', current?.h ?? Math.min(16, asset.height)],
  ['margin', 'Outer margin', current?.margin ?? 0], ['spacing', 'Frame spacing', current?.spacing ?? 0]];
 simple('Slice Sprite Sheet', `<div class="two">${fields.map(([key, name, value]) => field(name,key,value,'number')).join('')}</div>`, values => {
  const data = Object.fromEntries(fields.map(([key]) => [key, Number(values[key])]));
  if (!Object.values(data).every(Number.isInteger) || data.w < 1 || data.h < 1 || data.margin < 0 || data.spacing < 0) {
   throw Error('Use positive frame dimensions and a nonnegative margin and spacing');
  }
  const [cols, rows] = atlasSize({ ...asset, tileWidth: data.w, tileHeight: data.h, margin: data.margin, spacing: data.spacing });
  const count = cols * rows;
  if (!count || count > 4096) throw Error('The grid must contain between 1 and 4096 frames');
  if (type.animator?.clips.some(clip => clip.frames.some(frame => frame.tile >= count))) {
   throw Error('Remove clip frames outside the new grid before slicing it');
  }
  change(() => {
   type.image = asset.image;
   type.sheet = { ...data, cols, count, fps: current?.fps ?? 0 };
   type.w = data.w; type.h = data.h;
   for (const layout of P.layouts) for (const object of layout.instances) if (object.type === type.id) {
    object.w = data.w; object.h = data.h;
   }
   animator.selection.clear();
  });
 });
}

function makeAnimationClip(type, source) {
 simple(source ? 'Duplicate Clip' : 'New Animation Clip', field('Name','name', source ? `${source.name} Copy` : ''), values => {
  const name = values.name.trim();
  if (!name || type.animator?.clips.some(clip => clip.name === name)) throw Error('Use a unique clip name');
  haltAnimator();
  change(() => {
   const clip = { duration: 0, loop: 'loop', frames: [], tracks: {}, ...clone(source ?? {}), id: uid(), name };
   (type.animator ??= { autoplay: '', clips: [] }).clips.push(clip);
   Object.assign(animator, { clip: clip.id, frame: -1, position: 0 });
  });
 });
}

function editAnimationClip(type, clip) {
 simple('Clip Settings', field('Name','name',clip.name) + select('Playback','loop',clip.loop,loopModes) +
  field('Minimum length (ms)', 'duration', clip.duration, 'number'), values => {
  const name = values.name.trim(), duration = Number(values.duration);
  if (!name || type.animator.clips.some(other => other !== clip && other.name === name)) throw Error('Use a unique clip name');
  if (!Number.isFinite(duration) || duration < 0 || duration > 300000 || Object.values(clip.tracks).some(keys =>
   keys.some(key => key.time > Math.max(duration, clip.frames.reduce((total, frame) => total + frame.duration, 0))))) {
   throw Error('Use a length up to 300,000 ms that includes all keyframes');
  }
  change(() => Object.assign(clip, { name, loop: values.loop, duration }));
 });
}

function editAnimationKey(clip, track, index) {
 const keys = clip.tracks[track] ?? [];
 const previous = index === undefined ? null : keys[index];
 const [name, fallback] = ANIMATION_TRACKS[track];
 const time = previous?.time ?? Math.round(animator.position);
 const value = previous?.value ?? animationPose(clip, time)[track] ?? fallback;
 simple(`${previous ? 'Edit' : 'Add'} ${name} Key`, field('Time (ms)','time',time,'number') + field('Value','value',value,'number') +
  select('Interpolation to next key','interpolation',previous?.hold?'hold':'linear',[['linear','Linear'],['hold','Hold']]), values => {
   const time = Number(values.time), value = Number(values.value);
   if (!Number.isFinite(time) || !Number.isFinite(value) || time < 0 || time > 300000) throw Error('Enter a value and time from 0 to 300,000 ms');
   change(() => {
    const withoutKey = keys.filter(key => key !== previous && key.time !== time);
    clip.tracks[track] = [...withoutKey, { time, value, hold: values.interpolation === 'hold' }].sort((a,b) => a.time - b.time);
    if (time > clipDuration(clip)) clip.duration = time;
    animator.position = time;
   });
  });
}

function renderAnimator() {
 const type = animatorType();
 if (animator.type !== type?.id) {
  haltAnimator();
  Object.assign(animator, { type: type?.id, clip: null, frame: -1, lastTile: null, position: 0 });
  animator.selection.clear();
 }
 const clip = animatorClip() ?? type?.animator?.clips[0];
 animator.clip = clip?.id;
 const hasSheet = Boolean(type?.image && type?.sheet);
 const clipList = clip ? select('Clip', 'anim-clip', clip.id, type.animator.clips.map(item => [item.id, item.name])) : '';
 $('#animation-toolbar').innerHTML = type ? `<span class="asset-target">${esc(type.name)}</span>
  ${button('+ New Clip','anim:new','primary')}${clipList}${clip ? button('Clip Settings','anim:clipSettings') +
   button('Duplicate','anim:duplicate') + button('Delete','anim:deleteClip','danger ghost') : ''}` : '';
 $('#animation-inspector').innerHTML = type ? `<div class="panelhead">SPRITE SHEET</div><div class="pad">
  <div class="asset-button-row">${button(type.image ? 'Replace Sheet' : 'Import Sheet','anim:import')}${type.image ? button('Slice Sheet','anim:slice') : ''}</div>
  ${type.animator?.clips.length ? select('Autoplay','anim-autoplay',type.animator.autoplay,[['','None'],...type.animator.clips.map(item => [item.id,item.name])]) : ''}
  ${hasSheet ? `<div class="palette-scroll"><canvas id="animation-sheet" aria-label="Sprite sheet frames"></canvas></div>
   ${clip ? `<div class="asset-button-row">${button('Add Selected','anim:addFrames')}${button('Add All Frames','anim:addAll')}</div><div class="muted">Shift selects a range.</div>` : ''}` :
   '<p class="muted">Import one image, then slice it into frames. Transform tracks also work on objects without a sprite sheet.</p>'}
 </div>` : '<div class="pad muted">Select an object type to animate.</div>';
 if (!clip) {
  $('#animation-timeline').innerHTML = type ? '<div class="empty">Create a clip to start the timeline.</div>' : '<div class="empty">Select an object type in the project sidebar.</div>';
 } else {
  const duration = clipDuration(clip);
  animator.position = Math.min(animator.position, duration);
  const frame = clip.frames[animator.frame];
  const controls = frame ? `<div class="animation-frame-tools">
   ${field('Frame duration (ms)','anim-frame-duration',frame.duration,'number')}${button('←','anim:frameLeft')}${button('→','anim:frameRight')}${button('Duplicate Frame','anim:copyFrame')}${button('Remove Frame','anim:removeFrame')}</div>` : '';
  const frames = clip.frames.map((frame, index) => `<button draggable="true" data-order-frame="${index}" class="film-frame ${index === animator.frame ? 'active' : ''}" data-act="anim:frame:${index}">
   <canvas width="44" height="36" data-frame="${frame.tile}"></canvas><span>${index + 1} · ${frame.duration} ms</span></button>`).join('');
  const tracks = Object.entries(ANIMATION_TRACKS).map(([track, [name]]) => `<div class="animation-track">
   <div class="animation-track-label"><span>${name}</span><button data-act="anim:key:${track}" title="Add ${name} key">+</button></div>
   <div class="animation-track-keys">${(clip.tracks[track] ?? []).map((key,index) =>
    `<span class="animation-key" style="--time:${100 * key.time / duration}%"><button data-act="anim:editKey:${track},${index}" title="${name}: ${key.value} at ${key.time} ms">◆</button><button data-act="anim:deleteKey:${track},${index}" title="Delete ${name} key at ${key.time} ms">×</button></span>`).join('')}</div>
  </div>`).join('');
  $('#animation-timeline').innerHTML = `<div class="animation-transport">
   ${button(animator.playing ? 'Pause' : 'Play','anim:play')}${button('Rewind','anim:rewind')}
   <input id="animation-scrub" type="range" min="0" max="${duration}" step="1" value="${animator.position}" aria-label="Animation time">
   <output id="animation-time"></output>
  </div><div class="film-strip">${frames || '<span class="muted">Add frames from the sprite sheet.</span>'}</div>${controls}
  <div class="animation-tracks">${tracks}</div>`;
 }
 if (type?.image) {
  const image = tileImage(images, { image: type.image });
  const refresh = () => {
   if (tab !== 'animate' || animatorType() !== type) return;
   if (type.sheet) drawAnimationSheet(type, image);
   drawAnimationPreview();
  };
  if (image.complete) refresh();
  else image.addEventListener('load', refresh, { once: true });
 }
 drawAnimationPreview();
}

function drawAnimationSheet(type, image) {
 const canvas = $('#animation-sheet');
 if (!canvas || !image.naturalWidth) return;
 const atlas = spriteAtlas(type, image);
 const scale = Math.max(.5, Math.min(4, 210 / atlas.width));
 canvas.width = Math.ceil(atlas.width * scale); canvas.height = Math.ceil(atlas.height * scale);
 const ctx = canvas.getContext('2d');
 ctx.scale(scale, scale); ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 0, 0);
 for (let frame = 0; frame < type.sheet.count; frame++) {
  const box = atlasSource(atlas, frame % type.sheet.cols, Math.floor(frame / type.sheet.cols));
  const active = animator.selection.has(frame);
  ctx.strokeStyle = active ? '#78dfbf' : '#e0f2fc5e'; ctx.lineWidth = (active ? 2 : 1) / scale; ctx.strokeRect(...box);
 }
 for (const thumb of $('#animation-timeline').querySelectorAll('canvas[data-frame]')) {
  const frame = Number(thumb.dataset.frame), thumbContext = thumb.getContext('2d');
  const size = Math.min(thumb.width / type.sheet.w, thumb.height / type.sheet.h);
  const w = size * type.sheet.w, h = size * type.sheet.h;
  thumbContext.imageSmoothingEnabled = false;
  drawAtlasTile(thumbContext, image, atlas, frame % type.sheet.cols, Math.floor(frame / type.sheet.cols),
   (thumb.width - w) / 2, (thumb.height - h) / 2, w, h);
 }
}

function drawAnimationPreview() {
 const canvas = $('#animation-preview');
 const ctx = canvas.getContext('2d');
 const { width, height } = canvas;
 ctx.clearRect(0, 0, width, height);
 ctx.strokeStyle = '#8caac34f';
 ctx.beginPath(); ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height); ctx.moveTo(0,height / 2); ctx.lineTo(width,height / 2); ctx.stroke();
 const type = animatorType(), clip = animatorClip();
 if (type) {
  const w = type.w || 32, h = type.h || 32;
  const pose = clip ? animationPose(clip, animator.position) : {};
  const scale = Math.min(4, (width - 48) / w, (height - 48) / h);
  ctx.save(); ctx.translate(width / 2, height / 2); ctx.scale(scale, scale);
  drawObjectPose(ctx, type, { x: -w / 2, y: -h / 2, w, h, opacity: 1, pose, animFrame: pose.frame ?? 0 }, images);
  ctx.restore();
 }
 if (clip) {
  const time = Math.round(animator.position);
  $('#animation-scrub').value = time;
  $('#animation-time').textContent = `${time} / ${clipDuration(clip)} ms`;
 }
}

function haltAnimator() {
 cancelAnimationFrame(animator.raf);
 animator.playing = false;
}

function playAnimator(clip) {
 const started = performance.now() - (animator.position >= clipDuration(clip) ? 0 : animator.position);
 animator.playing = true;
 const tick = time => {
  if (!animator.playing || tab !== 'animate' || animatorClip() !== clip) { haltAnimator(); return; }
  const elapsed = Math.max(0, time - started);
  animator.position = clipTime(clip, elapsed);
  drawAnimationPreview();
  if (clip.loop === 'once' && elapsed >= clipDuration(clip)) { haltAnimator(); renderAnimator(); }
  else animator.raf = requestAnimationFrame(tick);
 };
 animator.raf = requestAnimationFrame(tick);
}

function setupAnimator() {
 const timeline = $('#animation-timeline');
 let draggedFrame = null;
 timeline.ondragstart = event => {
  const frame = event.target.closest('[data-order-frame]');
  if (!frame) return;
  draggedFrame = Number(frame.dataset.orderFrame);
  event.dataTransfer.setData('text/plain', String(draggedFrame));
  event.dataTransfer.effectAllowed = 'move';
 };
 timeline.ondragover = event => {
  if (draggedFrame !== null && event.target.closest('[data-order-frame]')) event.preventDefault();
 };
 timeline.ondrop = event => {
  const frame = event.target.closest('[data-order-frame]');
  if (!frame || draggedFrame === null) return;
  event.preventDefault();
  const clip = animatorClip(), from = draggedFrame, to = Number(frame.dataset.orderFrame);
  draggedFrame = null;
  if (!clip || !clip.frames[from] || from === to) return;
  haltAnimator();
  change(() => {
   clip.frames.splice(to, 0, clip.frames.splice(from, 1)[0]);
   animator.frame = to;
  });
 };
 timeline.ondragend = () => { draggedFrame = null; };
 timeline.onpointerdown = event => {
  if (event.button !== 0 || !event.target.classList.contains('animation-track-keys')) return;
  const bounds = event.target.getBoundingClientRect();
  const clip = animatorClip();
  if (!clip) return;
  haltAnimator();
  const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
  animator.position = Math.round(clipDuration(clip) * ratio);
  renderAnimator();
 };
 $('#sprite-sheet-file').onchange = async event => {
  const file = event.target.files[0], type = animatorType();
  if (!file || !type) return;
  try { configureSpriteSheet(type, await readStudioImage(file)); }
  catch (error) { alert(error.message); }
  event.target.value = '';
 };
 document.addEventListener('input', event => {
  if (event.target.id !== 'animation-scrub') return;
  haltAnimator(); animator.position = Number(event.target.value);
  const play = $('#animation-timeline [data-act="anim:play"]');
  if (play) play.textContent = 'Play';
  drawAnimationPreview();
 });
 document.addEventListener('click', event => {
  if (event.target.id !== 'animation-sheet') return;
  const type = animatorType(), image = tileImage(images, { image: type.image });
  if (!image.naturalWidth) return;
  const bounds = event.target.getBoundingClientRect(), atlas = spriteAtlas(type,image);
  const x = (event.clientX - bounds.left) * atlas.width / bounds.width - atlas.margin;
  const y = (event.clientY - bounds.top) * atlas.height / bounds.height - atlas.margin;
  const column = Math.floor(x / (atlas.tileWidth + atlas.spacing)), row = Math.floor(y / (atlas.tileHeight + atlas.spacing));
  const frame = row * type.sheet.cols + column;
  if (column < 0 || column >= type.sheet.cols || row < 0 || frame >= type.sheet.count ||
   x % (atlas.tileWidth + atlas.spacing) >= atlas.tileWidth || y % (atlas.tileHeight + atlas.spacing) >= atlas.tileHeight) return;
  if (event.shiftKey && animator.lastTile !== null) {
   for (let i = Math.min(animator.lastTile,frame); i <= Math.max(animator.lastTile,frame); i++) animator.selection.add(i);
  } else if (animator.selection.has(frame)) animator.selection.delete(frame);
  else animator.selection.add(frame);
  animator.lastTile = frame;
  drawAnimationSheet(type,image);
 });
 document.addEventListener('change', event => {
  const target = event.target, type = animatorType(), clip = animatorClip();
  switch (target.dataset.field) {
   case 'anim-clip': haltAnimator(); Object.assign(animator, { clip: target.value, position: 0, frame: -1 }); renderAnimator(); break;
   case 'anim-autoplay': change(() => { type.animator.autoplay = target.value; }); break;
   case 'anim-frame-duration': {
    const value = Number(target.value);
    if (clip && Number.isFinite(value) && value >= 1 && value <= 60000) change(() => { clip.frames[animator.frame].duration = value; });
    else renderAnimator();
    break;
   }
  }
 });
}

function animatorAction(action, id) {
 const type = animatorType(), clip = animatorClip();
 if (!type) return;
 if (!['new','import','slice'].includes(action) && !clip) return;
 if (action !== 'play') haltAnimator();
 switch (action) {
  case 'new': makeAnimationClip(type); break;
  case 'import': $('#sprite-sheet-file').click(); break;
  case 'slice': {
   const image = tileImage(images, { image: type.image });
   if (image.naturalWidth) configureSpriteSheet(type);
   break;
  }
  case 'clipSettings': editAnimationClip(type,clip); break;
  case 'duplicate': makeAnimationClip(type,clip); break;
  case 'deleteClip':
   if (confirm(`Delete the ${clip.name} clip?`)) change(() => {
    type.animator.clips = type.animator.clips.filter(item => item !== clip);
    if (type.animator.autoplay === clip.id) type.animator.autoplay = '';
    Object.assign(animator, { clip: null, frame: -1, position: 0 });
   });
   break;
  case 'play': if (animator.playing) haltAnimator(); else playAnimator(clip); renderAnimator(); break;
  case 'rewind': animator.position = 0; renderAnimator(); break;
  case 'frame':
   animator.frame = Number(id);
   animator.position = clip.frames.slice(0, animator.frame).reduce((sum, frame) => sum + frame.duration, 0);
   renderAnimator(); break;
  case 'addFrames': case 'addAll': {
   const frames = action === 'addAll' ? Array.from({length:type.sheet.count},(_,index)=>index) : [...animator.selection].sort((a,b)=>a-b);
   if (clip.frames.length + frames.length > 4096) { alert('A clip supports up to 4096 frames'); break; }
   if (frames.length) change(() => {
    animator.frame = clip.frames.length;
    clip.frames.push(...frames.map(tile => ({ tile, duration: 100 })));
    animator.selection.clear();
   });
   break;
  }
  case 'frameLeft': case 'frameRight': {
   const from = animator.frame, to = from + (action === 'frameLeft' ? -1 : 1);
   if (clip.frames[from] && clip.frames[to]) change(() => {
    [clip.frames[from], clip.frames[to]] = [clip.frames[to], clip.frames[from]]; animator.frame = to;
   });
   break;
  }
  case 'copyFrame': case 'removeFrame':
   if (clip.frames[animator.frame]) change(() => {
    if (action === 'copyFrame') clip.frames.splice(++animator.frame, 0, clone(clip.frames[animator.frame - 1]));
    else clip.frames.splice(animator.frame, 1);
    animator.frame = Math.min(animator.frame, clip.frames.length - 1);
   });
   break;
  case 'key': editAnimationKey(clip,id); break;
  case 'editKey': case 'deleteKey': {
   const [track, index] = id.split(',');
   if (action === 'editKey') editAnimationKey(clip,track,Number(index));
   else change(() => clip.tracks[track].splice(Number(index),1));
   break;
  }
 }
}
