const musicSteps = 16;
const musicTempoMin = 40, musicTempoMax = 260;
const musicDurationLimit = 180;
const musicTrackNames = ['Lead','Bass','Harmony','Drums'];
const musicInstruments = { pulse:'Pulse', triangle:'Triangle', sine:'Sine', saw:'Saw', pluck:'Pluck' };
const musicDrums = { 36:'Kick',38:'Snare',42:'Hi-hat' };
const musicNotes = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];

const musicSeconds = (bpm,bars) => bars*240/bpm;
const musicNoteName = pitch => musicNotes[pitch%12]+(Math.floor(pitch/12)-1);

function blankStudioMusicPattern(name) {
 return { id:uid(),name,tracks:musicTrackNames.map(()=>Array(musicSteps).fill(null)) };
}

function newStudioMusic() {
 const pattern = blankStudioMusicPattern('Pattern 1');
 const notes = [
  [[0,60,2],[3,64,1],[4,67,2],[7,69,1],[8,67,2],[11,64,1],[12,62,2],[14,67,2]],
  [[0,36,3],[4,36,2],[8,43,3],[12,43,2],[14,40,2]],
  [[0,52,3],[4,55,3],[8,50,3],[12,55,3]],
  [[0,36,1],[2,42,1],[4,38,1],[6,42,1],[8,36,1],[10,42,1],[12,38,1],[14,42,1]],
 ];
 notes.forEach((track,index)=>{ for (const [step,pitch,length] of track) pattern.tracks[index][step]={pitch,length}; });
 return {
  version:1,bpm:120,instruments:['pulse','triangle','pluck','drums'],volumes:[70,78,43,70],
  patterns:[pattern],order:[pattern.id],
 };
}

function validStudioMusic(music) {
 if (music?.version !== 1 || !Number.isInteger(music.bpm) || music.bpm < musicTempoMin || music.bpm > musicTempoMax ||
     !Array.isArray(music.instruments) || music.instruments.length !== musicTrackNames.length ||
     !music.instruments.every((voice,index)=>index===3 ? voice==='drums' : Object.hasOwn(musicInstruments,voice)) ||
     !Array.isArray(music.volumes) || music.volumes.length !== musicTrackNames.length ||
     !music.volumes.every(volume=>Number.isInteger(volume) && volume>=0 && volume<=100) ||
     !Array.isArray(music.patterns) || !music.patterns.length || !Array.isArray(music.order) ||
     !music.order.length || musicSeconds(music.bpm,music.order.length)>musicDurationLimit) return false;
 const ids = new Set();
 for (const pattern of music.patterns) {
  if (typeof pattern?.id!=='string' || !/^[\w-]+$/.test(pattern.id) || ids.has(pattern.id) ||
      typeof pattern.name!=='string' || !pattern.name.trim() || pattern.name.length>60 ||
      !Array.isArray(pattern.tracks) || pattern.tracks.length!==musicTrackNames.length) return false;
  ids.add(pattern.id);
  if (!pattern.tracks.every((track,index)=>Array.isArray(track) && track.length===musicSteps &&
   track.every((note,step)=>note===null || Number.isInteger(note?.pitch) &&
    (index===3 ? Object.hasOwn(musicDrums,note.pitch) : note.pitch>=24 && note.pitch<=107) &&
    Number.isInteger(note.length) && note.length>=1 && note.length<=Math.min(4,musicSteps-step)))) return false;
 }
 return music.order.every(id=>ids.has(id));
}

function validateStudioMusicClips(project) {
 for (const clip of project.audioClips ?? []) {
  if (clip.music !== undefined && !validStudioMusic(clip.music)) throw Error('Invalid music settings');
 }
 return project;
}

function studioMusicSamples(music,order) {
 const samplesPerStep = studioWavRate*60/(music.bpm*4);
 const samples = new Float32Array(Math.round(samplesPerStep*musicSteps*order.length));
 const patterns = new Map(music.patterns.map(pattern=>[pattern.id,pattern]));
 for (const [bar,id] of order.entries()) {
  const pattern = patterns.get(id);
  for (const [index,track] of pattern.tracks.entries()) {
   const volume = music.volumes[index]/100*.23, instrument = music.instruments[index];
   if (!volume) continue;
   for (let step=0;step<musicSteps;step++) {
    const note = track[step];
    if (!note) continue;
    let length=1;
    while (length<note.length && !track[step+length]) length++;
    const first = Math.round((bar*musicSteps+step)*samplesPerStep);
    const last = Math.round((bar*musicSteps+step+length)*samplesPerStep);
    if (instrument==='drums') mixStudioDrum(samples,first,last,note.pitch,volume);
    else mixStudioNote(samples,first,last,note.pitch,instrument,volume);
   }
  }
 }
 return samples;
}

function mixStudioNote(samples,first,last,pitch,instrument,volume) {
 const size=last-first, increment=440*2**((pitch-69)/12)/studioWavRate;
 const attack=Math.max(1,Math.min(90,size*.12)), release=Math.max(1,Math.min(780,size*.3));
 for (let i=0;i<size;i++) {
  const phase=(i*increment)%1;
  let wave;
  switch (instrument) {
   case 'pulse': wave=phase<.38 ? .7 : -.7; break;
   case 'triangle': wave=1-4*Math.abs(phase-.5); break;
   case 'saw': wave=(2*phase-1)*.75; break;
   case 'pluck': wave=(Math.sin(2*Math.PI*phase)+.28*Math.sin(4*Math.PI*phase))*.78*Math.exp(-i/(size*.36)); break;
   default: wave=Math.sin(2*Math.PI*phase);
  }
  const envelope=Math.min(1,i/attack,(size-1-i)/release);
  samples[first+i]+=wave*envelope*volume;
 }
}

function mixStudioDrum(samples,first,last,pitch,volume) {
 const random=studioSoundEffectRandom((first^pitch^0x9e3779b9)>>>0);
 const duration=Math.min(last-first,Math.round(studioWavRate*(pitch===42 ? .055 : .14)));
 let phase=0,low=0;
 for (let i=0;i<duration;i++) {
  const progress=i/duration, t=i/studioWavRate, noise=2*random()-1;
  low+=(noise-low)*.18;
  phase+=(48+120*Math.exp(-t*48))/studioWavRate;
  const wave=pitch===36 ? Math.sin(phase*2*Math.PI)*.88+noise*.1
   : pitch===38 ? noise*.65+Math.sin(t*174*2*Math.PI)*.25 : (noise-low)*.75;
  samples[first+i]+=wave*Math.min(1,i/14)*(1-progress)**2*volume;
 }
}

function studioMusicClip(id,name,bus,music,order=music.order) {
 const samples=studioMusicSamples(music,order);
 return encodeStudioWav(id,name,bus,samples.length/studioWavRate,(_,index)=>samples[index]);
}
