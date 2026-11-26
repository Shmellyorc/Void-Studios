const soundEffectWaves = { sine:'Sine', triangle:'Triangle', square:'Pulse', saw:'Saw', noise:'Noise' };
const soundEffectMotions = { sweep:'Sweep', step:'Step' };
const soundEffectControls = [
 ['startHz','Start pitch',30,3200,'Hz'],
 ['endHz','End pitch',30,3200,'Hz'],
 ['attack','Attack',0,180,'ms'],
 ['hold','Hold',0,600,'ms'],
 ['decay','Decay',10,1800,'ms'],
 ['noise','Noise mix',0,100,'%'],
 ['level','Level',0,100,'%'],
];

// Numeric ranges are ordered to match the editor controls above.
const soundEffectPresets = {
 coin:{ name:'Coin',waves:['triangle','square'],motion:'step',ranges:[[550,890],[1050,1750],[1,4],[58,112],[72,145],[0,4],[50,72]] },
 jump:{ name:'Jump',waves:['triangle','square'],motion:'sweep',ranges:[[155,300],[490,850],[2,8],[27,77],[110,220],[0,6],[52,75]] },
 hit:{ name:'Hit',waves:['square','triangle'],motion:'sweep',ranges:[[160,420],[42,145],[0,3],[6,22],[65,145],[45,84],[58,80]] },
 laser:{ name:'Laser',waves:['saw','square'],motion:'sweep',ranges:[[950,2850],[70,260],[1,6],[20,72],[120,300],[0,15],[50,76]] },
 explosion:{ name:'Explosion',waves:['noise','triangle'],motion:'sweep',ranges:[[68,180],[33,73],[0,9],[55,184],[370,880],[74,98],[59,79]] },
 confirm:{ name:'Confirm',waves:['sine','triangle'],motion:'step',ranges:[[390,635],[720,1180],[2,7],[40,86],[66,125],[0,3],[44,65]] },
};

function studioSoundEffectRandom(seed) {
 let value = seed || 1;
 return ()=>{
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0)/4294967296;
 };
}

function rerollStudioSoundEffect(preset) {
 const seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
 const random = studioSoundEffectRandom(seed);
 const { waves,motion,ranges } = soundEffectPresets[preset];
 const values = Object.fromEntries(ranges.map(([low,high],index)=>
  [soundEffectControls[index][0],low+Math.floor(random()*(high-low+1))]));
 return { version:1,preset,seed,wave:waves[Math.floor(random()*waves.length)],motion,...values };
}

function validStudioSoundEffect(effect) {
 return effect?.version === 1 && Object.hasOwn(soundEffectPresets,effect.preset) &&
  Object.hasOwn(soundEffectWaves,effect.wave) && Object.hasOwn(soundEffectMotions,effect.motion) &&
  Number.isInteger(effect.seed) && effect.seed > 0 && effect.seed <= 0xffffffff &&
  soundEffectControls.every(([key,,low,high])=>Number.isInteger(effect[key]) && effect[key] >= low && effect[key] <= high);
}

function validateStudioSoundEffects(project) {
 for (const clip of project.audioClips ?? []) {
  if (clip.soundEffect !== undefined && !validStudioSoundEffect(clip.soundEffect)) throw Error('Invalid sound effect settings');
 }
 return project;
}

function studioSoundEffectSamples(effect) {
 const attack = Math.max(1,effect.attack*studioWavRate/1000), hold = effect.hold*studioWavRate/1000;
 const decay = effect.decay*studioWavRate/1000, fadeAt = attack+hold;
 const samples = new Float32Array(Math.ceil(fadeAt+decay));
 const random = studioSoundEffectRandom(effect.seed);
 const noiseMix = effect.noise/100, level = effect.level/100*.78;
 const sweep = Math.log(effect.endHz/effect.startHz);
 let phase = 0, filteredNoise = 0;
 for (let index=0;index<samples.length;index++) {
  const progress = index/samples.length;
  const frequency = effect.motion === 'step'
   ? progress < .42 ? effect.startHz : effect.endHz
   : effect.startHz*Math.exp(sweep*progress);
  phase = (phase+frequency/studioWavRate)%1;
  const white = random()*2-1;
  filteredNoise += (white-filteredNoise)*.27;
  let sample;
  switch (effect.wave) {
   case 'sine': sample = Math.sin(2*Math.PI*phase); break;
   case 'triangle': sample = 1-4*Math.abs(phase-.5); break;
   case 'square': sample = phase < .33 ? .68 : -.68; break;
   case 'saw': sample = 2*phase-1; break;
   default: sample = (white+filteredNoise)*.5;
  }
  const envelope = index < attack ? index/attack : Math.max(0,1-(index-fadeAt)/decay);
  const tail = Math.min(1,(samples.length-1-index)/22);
  const noise = effect.preset === 'explosion' ? filteredNoise : white;
  samples[index] = (sample*(1-noiseMix)+noise*noiseMix)*level*Math.min(1,envelope)**1.35*tail;
 }
 return samples;
}

function studioSoundEffectClip(id,name,bus,effect,samples) {
 return { ...encodeStudioWav(id,name,bus,samples.length/studioWavRate,(_,i)=>samples[i]),soundEffect:{...effect} };
}

function drawStudioSoundEffect(canvas,samples) {
 const ctx = canvas.getContext('2d'), { width,height } = canvas;
 ctx.clearRect(0,0,width,height);
 ctx.strokeStyle = '#34495b';
 ctx.beginPath();
 ctx.moveTo(0,height/2);
 ctx.lineTo(width,height/2);
 ctx.stroke();
 ctx.strokeStyle = '#82dfbf';
 ctx.beginPath();
 for (let x=0;x<width;x++) {
  const start = Math.floor(x*samples.length/width), end = Math.floor((x+1)*samples.length/width);
  let low=0, high=0;
  for (let i=start;i<end;i++) {
   low=Math.min(low,samples[i]);
   high=Math.max(high,samples[i]);
  }
  ctx.moveTo(x+.5,height*(.5-high*.45));
  ctx.lineTo(x+.5,height*(.5-low*.45));
 }
 ctx.stroke();
}

function editStudioSoundEffect(clip) {
 const project = P;
 let draft = clip ? { ...clip.soundEffect } : rerollStudioSoundEffect('coin');
 let samples, preview = null;
 const defaults = soundEffectPresets[draft.preset];
 haltAudioAudition(true);
 dialog(clip ? 'Edit Sound Effect' : 'New Sound Effect',
  `<div id="sound-effect-editor">
   <div class="two">${field('Name','sfx-name',clip?.name ?? defaults.name)}
    ${select('Preset','sfx-preset',draft.preset,Object.entries(soundEffectPresets).map(([id,preset])=>[id,preset.name]))}</div>
   <canvas id="sfx-waveform" width="720" height="110" aria-label="Generated sound waveform"></canvas>
   <div class="sfx-audition-tools">
    <button type="button" id="sfx-audition">Audition</button>
    <button type="button" id="sfx-reroll">Reroll</button>
    <output id="sfx-duration" aria-label="Duration"></output><span id="sfx-status" role="status"></span>
   </div>
   <div class="two">${select('Waveform','sfx-wave',draft.wave,Object.entries(soundEffectWaves))}
    ${select('Pitch motion','sfx-motion',draft.motion,Object.entries(soundEffectMotions))}</div>
   <div class="sfx-controls">${soundEffectControls.map(([key,label,low,high,unit])=>
    `<label><span>${label}<output data-sfx-output="${key}">${draft[key]} ${unit}</output></span>
     <input type="range" min="${low}" max="${high}" value="${draft[key]}" data-sfx-setting="${key}"></label>`).join('')}</div>
  </div>`,()=>{
   if (P !== project || clip && !P.audioClips?.includes(clip)) throw Error('Reopen Sound Effects for the current project');
   const name = nameInput.value.trim().slice(0,100);
   if (!name) throw Error('Enter a sound effect name');
   const generated = studioSoundEffectClip(clip?.id ?? uid(),name,clip?.bus ?? 'sfx',draft,samples);
   stop();
   change(()=>{
    if (clip) Object.assign(clip,generated);
    else (P.audioClips ??= []).push(generated);
    tab = 'audio';
    Object.assign(audioWorkspace,{ project:P,clip:generated.id,status:(clip ? 'Updated ' : 'Created ')+name+'.',error:false });
    revealProjectItem('audio:'+generated.id,'assets');
   });
  },clip ? 'Save Changes' : 'Save Sound');
 const root = $('#sound-effect-editor'), nameInput = root.querySelector('[data-field="sfx-name"]');
 const presetInput = root.querySelector('[data-field="sfx-preset"]');
 const waveInput = root.querySelector('[data-field="sfx-wave"]'), motionInput = root.querySelector('[data-field="sfx-motion"]');
 const play = root.querySelector('#sfx-audition'), status = root.querySelector('#sfx-status');
 const waveform = root.querySelector('#sfx-waveform'), duration = root.querySelector('#sfx-duration');
 const syncSamples = ()=>{
  samples = studioSoundEffectSamples(draft);
  drawStudioSoundEffect(waveform,samples);
  duration.textContent = Math.round(samples.length/studioWavRate*1000)+' ms';
 };
 function stop(message = '') {
  const active = preview;
  preview = null;
  active?.dispose();
  play.textContent = 'Audition';
  status.textContent = message;
 }
 function reroll() {
  const oldName = soundEffectPresets[draft.preset].name;
  draft = rerollStudioSoundEffect(presetInput.value);
  if (!clip && (!nameInput.value.trim() || nameInput.value === oldName)) nameInput.value = soundEffectPresets[draft.preset].name;
  waveInput.value = draft.wave;
  motionInput.value = draft.motion;
  for (const [key,,,,unit] of soundEffectControls) {
   root.querySelector('[data-sfx-setting="'+key+'"]').value = draft[key];
   root.querySelector('[data-sfx-output="'+key+'"]').textContent = draft[key]+' '+unit;
  }
  stop();
  syncSamples();
 }
 root.querySelector('#sfx-reroll').onclick = reroll;
 presetInput.onchange = reroll;
 waveInput.onchange = ()=>{ draft.wave=waveInput.value; stop(); syncSamples(); };
 motionInput.onchange = ()=>{ draft.motion=motionInput.value; stop(); syncSamples(); };
 root.addEventListener('input',event=>{
  const input = event.target, key = input.dataset.sfxSetting;
  if (!key) return;
  draft[key] = Number(input.value);
  const unit = soundEffectControls.find(([setting])=>setting === key)[4];
  root.querySelector('[data-sfx-output="'+key+'"]').textContent = draft[key]+' '+unit;
  stop();
  syncSamples();
 });
 play.onclick = ()=>{
  if (preview) return stop();
  const sound = studioSoundEffectClip('sfx-preview','Sound effect',clip?.bus ?? 'sfx',draft,samples);
  const active = createGameAudio([sound],project.audioMixer,error=>{ if (preview === active) stop(error.message); });
  preview = active;
  play.textContent = 'Stop';
  status.textContent = 'Auditioning';
  active.unlock();
  active.play(sound.id,{onEnd:()=>{ if (preview === active) stop(); }});
 };
 $('#dialog').addEventListener('close',()=>stop(),{once:true});
 syncSamples();
}
