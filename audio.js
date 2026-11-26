const audioBuses = { master:'Master', music:'Music', sfx:'Sound Effects', ui:'UI' };
const audioDefaults = { master:100, music:100, sfx:100, ui:100 };
const embeddedAudioPrefix = /^data:audio\/[a-z0-9.+-]+;base64,/i;

function decodeMediaBase64(encoded) {
 if (Uint8Array.fromBase64) return Uint8Array.fromBase64(encoded,{ lastChunkHandling:'strict' });
 const text = atob(encoded), bytes = new Uint8Array(text.length);
 for (let index = 0; index < text.length; index++) bytes[index] = text.charCodeAt(index);
 return bytes;
}

function validateProjectAudio(project) {
 project.audioClips ??= [];
 project.audioMixer ??= { ...audioDefaults };
 if (!Array.isArray(project.audioClips) || !project.audioMixer || typeof project.audioMixer !== 'object' ||
     Array.isArray(project.audioMixer)) throw Error('Invalid audio library');
 for (const bus of Object.keys(audioBuses)) {
  const level = project.audioMixer[bus] ?? 100;
  if (!Number.isFinite(level) || level < 0 || level > 100) throw Error('Invalid mixer volume');
  project.audioMixer[bus] = level;
 }
 const ids = new Set();
 for (const clip of project.audioClips) {
  if (!clip || typeof clip.id !== 'string' || !/^[a-z0-9_-]+$/i.test(clip.id) || ids.has(clip.id) ||
      typeof clip.name !== 'string' || !clip.name.trim() || clip.name.length > 100 ||
      typeof clip.source !== 'string' || !embeddedAudioPrefix.test(clip.source) ||
      !Number.isFinite(clip.duration) || clip.duration <= 0 || !Object.hasOwn(audioBuses,clip.bus)) {
   throw Error('Invalid audio clip');
  }
  ids.add(clip.id);
 }
 return project;
}

function createGameAudio(assets = [], mix = {}, report = () => {}) {
 const clips = new Map(assets.map(clip => [clip.id,clip]));
 const buses = new Map(Object.keys(audioBuses).map(id => [id,{ volume:(mix[id] ?? 100)/100 }]));
 const voices = new Set(), buffers = new Map(), tones = new Set();
 let context, closed = false, resume;
 function clampVolume(value, fallback = 1) {
  return Number.isFinite(value) ? Math.max(0,Math.min(100,value))/100 : fallback;
 }
 function currentLevel(fader) {
  const fade = fader.fade;
  if (!fade || !context || context.currentTime >= fade.end) return fader.volume;
  const fraction = (context.currentTime-fade.start)/(fade.end-fade.start);
  return fade.from+(fader.volume-fade.from)*fraction;
 }
 function setLevel(fader, percent, seconds) {
  const value = clampVolume(percent,fader.volume);
  const from = currentLevel(fader);
  fader.volume = value;
  fader.fade = null;
  if (!fader.gain) return;
  const now = context.currentTime;
  const param = fader.gain.gain;
  param.cancelScheduledValues(now);
  if (Number.isFinite(seconds) && seconds > 0) {
   fader.fade = { from,start:now,end:now+seconds };
   param.setValueAtTime(from,now);
   param.linearRampToValueAtTime(value,fader.fade.end);
  } else param.setValueAtTime(value,now);
 }
 function createGain(fader, destination) {
  fader.gain = context.createGain();
  fader.gain.gain.value = fader.volume;
  fader.gain.connect(destination);
 }
 function bufferFor(clip) {
  if (!buffers.has(clip.id)) {
   const decoded = Promise.resolve().then(() => {
    const prefix = clip.source.match(embeddedAudioPrefix)?.[0];
    if (!prefix) throw Error('Audio must be embedded in the project');
    return context.decodeAudioData(decodeMediaBase64(clip.source.slice(prefix.length)).buffer);
   });
   buffers.set(clip.id,decoded);
  }
  return buffers.get(clip.id);
 }
 function finish(voice) {
  const ended = voices.delete(voice);
  voice.source?.disconnect();
  voice.gain?.disconnect();
  if (ended) voice.onEnd?.();
 }
 async function startVoice(voice) {
  voice.status = 'decoding';
  try {
   const buffer = await bufferFor(voice.clip);
   if (closed || !voices.has(voice)) return;
   createGain(voice,buses.get(voice.bus).gain);
   const source = context.createBufferSource();
   voice.source = source;
   source.buffer = buffer;
   source.loop = voice.loop;
   source.connect(voice.gain);
   source.onended = () => finish(voice);
   source.start();
   voice.status = 'playing';
  } catch (error) {
   if (!closed && voices.has(voice)) report(Error('Could not play ' + voice.clip.name + ': ' + error.message));
   finish(voice);
  }
 }
 function flush() {
  if (closed || context?.state !== 'running') return;
  for (const voice of voices) if (voice.status === 'queued') startVoice(voice);
 }
 function unlock(event) {
  if (closed || event?.isTrusted === false) return;
  try {
   if (!context) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw Error('Web Audio is unavailable');
    context = new Audio();
    const master = buses.get('master');
    createGain(master,context.destination);
    for (const [id,bus] of buses) if (id !== 'master') createGain(bus,master.gain);
    context.addEventListener('statechange',flush);
   }
   if (context.state === 'running') flush();
   else if (!resume || navigator.userActivation?.isActive) {
    const attempt = context.resume().then(flush).catch(error => { if (!closed) report(error); });
    resume = attempt;
    attempt.finally(() => { if (resume === attempt) resume = null; });
   }
  } catch (error) { report(error); }
 }
 function stop(tag = '') {
  for (const voice of voices) {
   if (tag && voice.tag !== tag) continue;
   voice.source?.stop();
   finish(voice);
  }
 }
 function stopTones() {
  for (const tone of tones) tone.stop();
  tones.clear();
 }
 return {
  unlock,
  play(id,{ bus,volume = 100,loop = false,tag = '',onEnd } = {}) {
   if (closed) return;
   const clip = clips.get(id);
   if (!clip) return report(Error('Missing audio clip'));
   if (tag) stop(tag);
   else if (context?.state !== 'running') {
    for (const voice of voices) if (voice.status === 'queued' && voice.clip === clip && !voice.tag) finish(voice);
   }
   const channel = bus || clip.bus || 'sfx';
   if (!buses.has(channel)) return report(Error('Unknown audio channel'));
   voices.add({ clip,tag,bus:channel,loop,onEnd,volume:clampVolume(volume),status:'queued' });
   if (!context && navigator.userActivation?.isActive) unlock();
   flush();
  },
  stop,
  fade(tag,volume,duration) {
   for (const voice of voices) if (!tag || voice.tag === tag) setLevel(voice,volume,duration);
  },
  setVolume(bus,volume,duration = 0) {
   if (buses.has(bus)) setLevel(buses.get(bus),volume,duration);
  },
  tone(frequency,duration) {
   if (!context && navigator.userActivation?.isActive) unlock();
   if (context?.state !== 'running' || closed) return;
   const oscillator = context.createOscillator(), gain = context.createGain();
   oscillator.type = 'triangle';
   oscillator.frequency.value = Math.min(4000,Math.max(40,frequency || 440));
   const end = context.currentTime+Math.min(1,Math.max(.02,duration || .1));
   gain.gain.setValueAtTime(.07,context.currentTime);
   gain.gain.exponentialRampToValueAtTime(.001,end);
   oscillator.connect(gain);
   gain.connect(buses.get('sfx').gain);
   tones.add(oscillator);
   oscillator.onended = () => { tones.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
   oscillator.start();
   oscillator.stop(end);
  },
  reset() {
   stop();
   stopTones();
   for (const [id,bus] of buses) setLevel(bus,mix[id] ?? 100,0);
  },
  dispose() {
   if (closed) return;
   closed = true;
   stop();
   stopTones();
   buffers.clear();
   if (context) {
    context.removeEventListener('statechange',flush);
    context.close().catch(() => {});
   }
  },
  inspect() {
   return {
    state: closed ? 'closed' : context?.state ?? 'locked',
    channels: Object.fromEntries([...buses].map(([id,bus]) => [id,currentLevel(bus)*100])),
    voices: [...voices].map(voice => ({
     clip:voice.clip.id,bus:voice.bus,tag:voice.tag,loop:voice.loop,status:voice.status,volume:currentLevel(voice)*100,
    })),
   };
  },
 };
}
