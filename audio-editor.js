const audioWorkspace = { project:null,clip:null,preview:null,importing:false,status:'',error:false };
const studioWavRate = 22050;
const audioClipOptions = (project = P) => (project.audioClips ?? []).map(({id,name}) => [id,name]);
const selectedAudioClip = () => P.audioClips?.find(clip => clip.id === audioWorkspace.clip);
const audioFileTypes = {
 wav:'audio/wav', mp3:'audio/mpeg', ogg:'audio/ogg', opus:'audio/ogg', m4a:'audio/mp4',
 aac:'audio/aac', flac:'audio/flac', weba:'audio/webm', aiff:'audio/aiff',
};

function haltAudioAudition(ended = false) {
 const preview = audioWorkspace.preview;
 if (!preview) return;
 audioWorkspace.preview = null;
 preview.dispose();
 if (ended) audioWorkspace.status = '';
}

function renderAudioWorkspace() {
 if (audioWorkspace.project !== P) {
  haltAudioAudition(true);
  Object.assign(audioWorkspace,{ project:P,clip:null,status:'',error:false });
 }
 const clips = P.audioClips ?? [];
 if (!selectedAudioClip()) audioWorkspace.clip = clips[0]?.id;
 const clip = selectedAudioClip();
 $('#audio-tools').innerHTML = button('Import Audio…','audio:import','primary') +
  button('Sound Effects…','audio:soundEffect') +
  (clip ? button(audioWorkspace.preview ? 'Stop Audition' : 'Audition','audio:audition') : '') +
  '<div class="spacer"></div>' + button('Load Audio Demo…','audio:demo');
 $('#audio-tools [data-act="audio:import"]').disabled = audioWorkspace.importing;
 const list = clips.map(item => `<button class="audio-clip-row ${item === clip ? 'selected' : ''}" data-act="audio:select:${item.id}">
  <span>${esc(item.name)}</span><span>${esc(audioBuses[item.bus])}</span><span>${item.duration.toFixed(1)} s</span></button>`).join('');
 $('#audio-clips').innerHTML = list ? '<div class="audio-clip-head"><span>Name</span><span>Channel</span><span>Duration</span></div>' + list :
  '<div class="empty">Import audio or create a sound effect to start the library.</div>';
 const inspector = $('#audio-inspector');
 inspector.innerHTML = (clip ? '<div class="panelhead">CLIP</div><div class="prop-group">' +
  field('Name','audio-clip-name',clip.name) +
  select('Default channel','audio-clip-bus',clip.bus,Object.entries(audioBuses)) +
  (clip.soundEffect ? button('Edit Sound Effect…','audio:editEffect') : '') +
  button('Remove Clip','audio:remove','danger ghost') + '</div>' : '') +
  '<div class="panelhead">MIXER</div><div class="prop-group audio-mixer">' + Object.entries(audioBuses).map(([id,name]) => {
   const amount = P.audioMixer?.[id] ?? 100;
   return `<label>${name}<span><input type="range" min="0" max="100" value="${amount}" data-audio-bus="${id}"><output>${amount}%</output></span></label>`;
  }).join('') + '</div>';
 const status = $('#audio-status');
 status.textContent = audioWorkspace.status;
 status.classList.toggle('audio-error',audioWorkspace.error);
}

async function audioFileDuration(file) {
 const media = new Audio(), url = URL.createObjectURL(file);
 try {
  return await new Promise((resolve,reject) => {
   const timer = setTimeout(() => reject(Error('Audio metadata timed out')),10000);
   media.onloadedmetadata = () => { clearTimeout(timer); resolve(media.duration); };
   media.onerror = () => { clearTimeout(timer); reject(Error('This audio format could not be read')); };
   media.preload = 'metadata';
   media.src = url;
  });
 } finally {
  media.onloadedmetadata = media.onerror = null;
  media.removeAttribute('src');
  media.load();
  URL.revokeObjectURL(url);
 }
}

async function importAudioFiles(files) {
 if (!files.length || audioWorkspace.importing) return;
 const project = P, imported = [], errors = [];
 Object.assign(audioWorkspace,{ importing:true,status:'Reading audio…',error:false });
 if (tab === 'audio') renderAudioWorkspace();
 try {
  for (const file of files) {
   if (P !== project) return;
   try {
    const extension = file.name.split('.').at(-1).toLowerCase();
    const mime = /^audio\/[a-z0-9.+-]+$/i.test(file.type) ? file.type : audioFileTypes[extension];
    if (!mime) throw Error('Select a supported audio file');
    const duration = await audioFileDuration(file);
    if (!Number.isFinite(duration) || duration <= 0) throw Error('The clip has no duration');
    const source = 'data:' + mime + ';base64,' + projectMediaBase64(new Uint8Array(await file.arrayBuffer()));
    const name = file.name.replace(/\.[^.]+$/,'').trim().slice(0,100) || 'Audio clip';
    imported.push({ id:uid(),name,source,duration,bus:'sfx' });
   } catch (error) { errors.push(file.name + ' — ' + error.message); }
  }
  if (P !== project) return;
  audioWorkspace.error = Boolean(errors.length);
  audioWorkspace.status = [
   imported.length ? 'Imported ' + imported.length + (imported.length === 1 ? ' clip.' : ' clips.') : '',
   ...errors,
  ].filter(Boolean).join(' ');
  if (imported.length) {
   haltAudioAudition();
   change(() => {
    (P.audioClips ??= []).push(...imported);
    Object.assign(audioWorkspace,{ project:P,clip:imported[0].id });
    tab = 'audio';
    revealProjectItem('audio:' + imported[0].id,'assets');
   });
  }
 } finally {
  audioWorkspace.importing = false;
  if (tab === 'audio') renderAudioWorkspace();
 }
}

function studioAudioAction(action, id) {
 const clip = selectedAudioClip();
 if (action === 'soundEffect') return editStudioSoundEffect();
 if (action === 'editEffect' && clip?.soundEffect) return editStudioSoundEffect(clip);
 if (action === 'import') {
  if (!audioWorkspace.importing) $('#audio-file').click();
 } else if (action === 'demo') {
  if (confirm('Load Shard Runner with audio? Save your current project first.')) change(() => {
   P = menuDemo(); selected = openSheetId = null; activeType = 'player';
  });
 } else if (action === 'select') {
  haltAudioAudition(true);
  audioWorkspace.clip = id;
  renderAudioWorkspace();
  projectTreeSelection();
 } else if (action === 'audition' && clip) {
  if (audioWorkspace.preview) haltAudioAudition(true);
  else {
   const preview = createGameAudio([clip],P.audioMixer,error => {
    if (audioWorkspace.preview !== preview) return;
    haltAudioAudition();
    Object.assign(audioWorkspace,{ status:error.message,error:true });
    renderAudioWorkspace();
   });
   Object.assign(audioWorkspace,{ preview,status:'Auditioning ' + clip.name,error:false });
   preview.unlock();
   preview.play(clip.id,{ onEnd:() => {
    if (audioWorkspace.preview !== preview) return;
    haltAudioAudition(true);
    renderAudioWorkspace();
   } });
  }
  renderAudioWorkspace();
 } else if (action === 'remove' && clip && confirm('Remove ' + clip.name + ' from the project?')) {
  haltAudioAudition(true);
  change(() => { P.audioClips = P.audioClips.filter(item => item.id !== clip.id); });
 }
}

function setupAudioWorkspace() {
 $('#audio-file').addEventListener('change',event => {
  const files = [...event.target.files];
  event.target.value = '';
  importAudioFiles(files);
 });
 const inspector = $('#audio-inspector');
 inspector.addEventListener('input',event => {
  const bus = event.target.dataset.audioBus;
  if (!bus) return;
  const value = Number(event.target.value);
  event.target.nextElementSibling.value = value + '%';
  audioWorkspace.preview?.setVolume(bus,value);
 });
 inspector.addEventListener('change',event => {
  const input = event.target, bus = input.dataset.audioBus, clip = selectedAudioClip();
  if (bus) return change(() => { (P.audioMixer ??= { ...audioDefaults })[bus] = Number(input.value); });
  if (!clip) return;
  if (input.dataset.field === 'audio-clip-name') {
   const name = input.value.trim().slice(0,100);
   if (name) change(() => { clip.name = name; });
   else renderAudioWorkspace();
  }
  if (input.dataset.field === 'audio-clip-bus') {
   haltAudioAudition(true);
   change(() => { clip.bus = input.value; });
  }
 });
}

function encodeStudioWav(id,name,bus,duration,sample) {
 const rate = studioWavRate, frames = Math.round(rate*duration);
 const bytes = new Uint8Array(44+frames*2), view = new DataView(bytes.buffer);
 const ascii = (at,value) => bytes.set([...value].map(char => char.charCodeAt(0)),at);
 ascii(0,'RIFF'); view.setUint32(4,bytes.length-8,true); ascii(8,'WAVEfmt ');
 view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true);
 view.setUint32(24,rate,true); view.setUint32(28,rate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true);
 ascii(36,'data'); view.setUint32(40,frames*2,true);
 for (let i=0;i<frames;i++) view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,sample(i/rate,i)))*32767),true);
 return { id,name,bus,duration:frames/rate,source:'data:audio/wav;base64,' + projectMediaBase64(bytes) };
}

function demoAudioClips() {
 const wave = (frequency,t) => Math.sin(2*Math.PI*frequency*t);
 const note = midi => 440*2**((midi-69)/12);
 const bass = [48,48,45,45,41,41,43,43].map(note);
 const melody = [72,76,79,76,69,72,76,72,65,69,72,69,67,71,74,79].map(note);
 return [
  encodeStudioWav('menu-confirm','Menu Confirm','ui',.14,t => .42*wave(t < .06 ? 480 : 720,t)*Math.sin(Math.PI*t/.14)),
  encodeStudioWav('shard-pickup','Shard Pickup','sfx',.24,t => {
   const step = Math.min(2,Math.floor(t/.08)), time = t-step*.08, frequency = [740,990,1320][step];
   return (.4*wave(frequency,time)+.13*wave(frequency*2,time))*Math.sin(Math.PI*time/.08);
  }),
  encodeStudioWav('arena-loop','Starlit Circuit','music',8,t => {
   const beat = Math.floor(t), time = t-beat, half = Math.floor(t*2), phase = t-half/2;
   const low = .16*(wave(bass[beat],time)+.24*wave(bass[beat]*2,time))*Math.sin(Math.PI*time);
   const lead = .13*(wave(melody[half],phase)+.23*wave(melody[half]*2,phase))*Math.sin(2*Math.PI*phase);
   return low+lead;
  }),
 ];
}
