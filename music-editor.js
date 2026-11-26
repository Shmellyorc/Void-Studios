function editStudioMusic(clip) {
 const project=P, music=clip ? clone(clip.music) : newStudioMusic();
 const octaves=[4,2,3,4];
 let pattern=music.patterns[0], track=0, bar=0, row=0, step=0, noteLength=1;
 let playing=null, animation=0;
 haltAudioAudition(true);
 dialog(clip ? 'Edit Music' : 'New Music',
  `<div id="music-editor">
   <div class="music-song-fields">
    ${field('Name','music-name',clip?.name ?? 'New Song')}
    <label>Tempo (BPM)<input id="music-tempo" type="number" min="${musicTempoMin}" max="${musicTempoMax}" value="${music.bpm}"></label>
    ${checkbox('Loop audition','music-loop',true)}
   </div>
   <div class="music-playback">
    <button type="button" id="music-play-pattern" class="primary">Play Pattern</button>
    <button type="button" id="music-play-song">Play Song</button>
    <button type="button" id="music-stop" disabled>Stop</button>
    <span id="music-status" role="status"></span>
   </div>
   <div class="music-layout">
    <section aria-label="Pattern editor">
     <div id="music-pattern-tools"></div>
     <div id="music-track-tabs" role="group" aria-label="Tracks"></div>
     <div id="music-track-settings"></div>
     <div id="music-roll" aria-label="Notes"></div>
    </section>
    <section class="music-arrangement" aria-labelledby="music-order-title">
     <h4 id="music-order-title">SONG ORDER</h4>
     <div id="music-order"></div>
     <div class="music-order-actions">
      <button type="button" id="music-add-bar">Add Current Pattern</button>
      <div>
       <button type="button" id="music-bar-up" aria-label="Move selected bar up">↑</button>
       <button type="button" id="music-bar-down" aria-label="Move selected bar down">↓</button>
       <button type="button" id="music-remove-bar">Remove Bar</button>
      </div>
     </div>
     <output id="music-song-length"></output>
    </section>
   </div>
  </div>`,()=>{
   if (P !== project || clip && !P.audioClips?.includes(clip)) throw Error('Reopen Music for the current project');
   const name=nameInput.value.trim().slice(0,100);
   if (!name) throw Error('Enter a song name');
   if (!validStudioMusic(music)) throw Error('Add a pattern to the song order and keep the song at three minutes or less');
   stop();
   const song={...studioMusicClip(clip?.id ?? uid(),name,clip?.bus ?? 'music',music),music:clone(music)};
   change(()=>{
    if (clip) Object.assign(clip,song);
    else (P.audioClips ??= []).push(song);
    tab='audio';
    Object.assign(audioWorkspace,{project:P,clip:song.id,status:(clip ? 'Updated ' : 'Created ')+name+'.',error:false});
    revealProjectItem('audio:'+song.id,'assets');
   });
  },clip ? 'Save Changes' : 'Save Music');
 const root=$('#music-editor'), find=selector=>root.querySelector(selector);
 const nameInput=find('[data-field="music-name"]'), tempo=find('#music-tempo');
 const patternTools=find('#music-pattern-tools'), trackTabs=find('#music-track-tabs'), settings=find('#music-track-settings');
 const roll=find('#music-roll'), order=find('#music-order'), status=find('#music-status');
 const patternButton=find('#music-play-pattern'), songButton=find('#music-play-song'), stopButton=find('#music-stop');
 const pitches=()=>track===3 ? [36,38,42] : Array.from({length:12},(_,index)=>(octaves[track]+1)*12+11-index);
 const toneName=pitch=>track===3 ? musicDrums[pitch] : musicNoteName(pitch);

 function renderPatterns() {
  patternTools.innerHTML=select('Pattern','music-pattern',pattern.id,music.patterns.map(item=>[item.id,item.name])) +
   field('Pattern name','music-pattern-name',pattern.name) +
   '<div class="music-pattern-actions"><button type="button" id="music-new-pattern">New Pattern</button>' +
   '<button type="button" id="music-copy-pattern">Duplicate</button>' +
   '<button type="button" id="music-delete-pattern" title="Remove unused pattern">Delete</button></div>';
  const remove=find('#music-delete-pattern');
  remove.disabled=music.patterns.length===1 || music.order.includes(pattern.id);
  if (music.order.includes(pattern.id)) remove.title='Remove this pattern’s bars from the song order first';
 }

 function renderTrack() {
  trackTabs.innerHTML=musicTrackNames.map((name,index)=>
   `<button type="button" data-music-track="${index}" aria-pressed="${track===index}">${name}</button>`).join('');
  settings.innerHTML=(track===3 ? '<span class="music-kit">Drum Kit</span>' :
   select('Instrument','music-instrument',music.instruments[track],Object.entries(musicInstruments)) +
   select('Octave','music-octave',String(octaves[track]),Array.from({length:7},(_,i)=>[String(i+1),String(i+1)])) +
   select('Note length','music-note-length',String(noteLength),[1,2,3,4].map(n=>[String(n),n+(n===1 ? ' step' : ' steps')]))) +
   `<label class="music-volume"><span>Track level <output>${music.volumes[track]}%</output></span>
    <input id="music-volume" type="range" min="0" max="100" value="${music.volumes[track]}"></label>`;
  roll.dataset.track=String(track);
 }

 function renderGrid(focus=false) {
  const notes=pattern.tracks[track], rows=pitches(), visible=new Set(rows);
  const held=Array(musicSteps).fill(null);
  for (const [index,note] of notes.entries()) {
   if (!note) continue;
   for (let offset=1;offset<note.length && !notes[index+offset];offset++) held[index+offset]=note.pitch;
  }
  roll.innerHTML='<div class="music-grid"><span></span>'+
   notes.map((note,index)=>`<span class="music-step-number ${index%4===0?'music-beat':''}" data-music-step="${index}"
    ${note && !visible.has(note.pitch) ? 'title="'+toneName(note.pitch)+' is in another octave"':''}>${index+1}${note && !visible.has(note.pitch)?' ·':''}</span>`).join('')+
   rows.map((pitch,y)=>`<span class="music-pitch">${toneName(pitch)}</span>`+
    notes.map((note,x)=>{
     const active=note?.pitch===pitch, sustain=held[x]===pitch;
     return `<button type="button" class="music-note ${x%4===0?'music-beat':''} ${sustain?'music-sustain':''}"
      data-music-cell="${y}:${x}" data-music-step="${x}" tabindex="${y===row && x===step?0:-1}" aria-pressed="${active}"
      aria-label="${toneName(pitch)}, step ${x+1}" ${active?`title="${note.length} step${note.length===1?'':'s'}"`:''}></button>`;
    }).join('')).join('')+'</div>';
  if (focus) find('[data-music-cell="'+row+':'+step+'"]')?.focus({preventScroll:true});
 }

 function renderOrder() {
  const names = new Map(music.patterns.map(item=>[item.id,item.name]));
  order.innerHTML=music.order.map((id,index)=>
   `<button type="button" data-music-bar="${index}" aria-pressed="${bar===index}">
    <span>${index+1}</span><strong>${esc(names.get(id))}</strong></button>`).join('') ||
   '<p class="muted">Add a pattern to play the song.</p>';
  find('#music-bar-up').disabled=bar<=0 || !music.order.length;
  find('#music-bar-down').disabled=bar>=music.order.length-1;
  find('#music-remove-bar').disabled=!music.order.length;
  const seconds=musicSeconds(music.bpm,music.order.length);
  const tooLong=seconds>musicDurationLimit;
  find('#music-add-bar').disabled=musicSeconds(music.bpm,music.order.length+1)>musicDurationLimit;
  find('#music-song-length').textContent=tooLong ? 'Song exceeds three minutes' :
   music.order.length+' '+(music.order.length===1 ? 'bar':'bars')+' · '+seconds.toFixed(1)+' s';
  songButton.disabled=!music.order.length || tooLong;
  $('#dialogok').disabled=songButton.disabled;
 }

 function clearPlayhead() {
  for (const cell of root.querySelectorAll('.music-playhead')) cell.classList.remove('music-playhead');
 }

 function stop(message='') {
  const active=playing;
  playing=null;
  active?.dispose();
  cancelAnimationFrame(animation);
  clearPlayhead();
  stopButton.disabled=true;
  patternButton.classList.remove('active');
  songButton.classList.remove('active');
  status.textContent=message;
 }

 function audition(asSong) {
  stop();
  const sequence=asSong ? [...music.order] : [pattern.id];
  if (!sequence.length || musicSeconds(music.bpm,sequence.length)>musicDurationLimit) return;
  const audio=studioMusicClip('music-preview','Music preview',clip?.bus ?? 'music',music,sequence);
  const loop=find('[data-field="music-loop"]').checked, bpm=music.bpm;
  const active=createGameAudio([audio],project.audioMixer,error=>{ if (playing===active) stop(error.message); });
  playing=active;
  stopButton.disabled=false;
  (asSong ? songButton : patternButton).classList.add('active');
  status.textContent=asSong ? 'Playing song' : 'Playing '+pattern.name;
  active.unlock();
  active.play(audio.id,{loop,onEnd:()=>{ if (playing===active) stop(); },onStart:elapsed=>{
   let last=-1, lastPattern=null;
   const paint=()=>{
    if (playing!==active) return;
    const position=Math.floor(elapsed()*bpm*4/60)%(sequence.length*musicSteps);
    const barIndex=Math.floor(position/musicSteps);
    if (position!==last || lastPattern!==pattern || !root.querySelector('.music-playhead')) {
     clearPlayhead();
     if (asSong) order.querySelector('[data-music-bar="'+barIndex+'"]')?.classList.add('music-playhead');
     if (sequence[barIndex]===pattern.id) for (const cell of roll.querySelectorAll('[data-music-step="'+position%musicSteps+'"]')) {
      cell.classList.add('music-playhead');
     }
     last=position;
     lastPattern=pattern;
    }
    animation=requestAnimationFrame(paint);
   };
   paint();
  }});
 }

 function showPattern(next) {
  pattern=next;
  renderPatterns();
  renderGrid();
 }

 function makePattern(copy) {
  let suffix=music.patterns.length+1;
  while (music.patterns.some(item=>item.name==='Pattern '+suffix)) suffix++;
  const next=blankStudioMusicPattern('Pattern '+suffix);
  if (copy) next.tracks=clone(pattern.tracks);
  music.patterns.push(next);
  showPattern(next);
 }

 function changeOrder(action) {
  stop();
  if (action==='music-add-bar') {
   music.order.push(pattern.id);
   bar=music.order.length-1;
  } else if (action==='music-remove-bar') {
   music.order.splice(bar,1);
   bar=Math.max(0,Math.min(bar,music.order.length-1));
  } else {
   const next=bar+(action==='music-bar-up' ? -1 : 1);
   [music.order[bar],music.order[next]]=[music.order[next],music.order[bar]];
   bar=next;
  }
  renderOrder();
  renderPatterns();
 }

 root.addEventListener('click',event=>{
  const input=event.target.closest('button');
  if (!input || input.disabled) return;
  const {musicTrack,musicBar,musicCell}=input.dataset;
  if (musicTrack!==undefined) {
   track=Number(musicTrack);
   row=step=0;
   renderTrack();
   renderGrid();
  } else if (musicBar!==undefined) {
   bar=Number(musicBar);
   showPattern(music.patterns.find(item=>item.id===music.order[bar]));
   renderOrder();
  } else if (musicCell!==undefined) {
   stop();
   [row,step]=musicCell.split(':').map(Number);
   const notes=pattern.tracks[track], pitch=pitches()[row];
   notes[step]=notes[step]?.pitch===pitch ? null : {pitch,length:track===3 ? 1 : Math.min(noteLength,musicSteps-step)};
   renderGrid(true);
  } else {
   switch (input.id) {
    case 'music-play-pattern': audition(false); break;
    case 'music-play-song': audition(true); break;
    case 'music-stop': stop(); break;
    case 'music-new-pattern': makePattern(false); break;
    case 'music-copy-pattern': makePattern(true); break;
    case 'music-delete-pattern':
     stop();
     music.patterns=music.patterns.filter(item=>item!==pattern);
     showPattern(music.patterns[0]);
     break;
    case 'music-add-bar': case 'music-remove-bar': case 'music-bar-up': case 'music-bar-down':
     changeOrder(input.id); break;
   }
  }
 });
 root.addEventListener('change',event=>{
  const input=event.target, value=input.value;
  if (input===tempo) {
   stop();
   music.bpm=Number.isFinite(input.valueAsNumber) ? Math.max(musicTempoMin,Math.min(musicTempoMax,Math.round(input.valueAsNumber))) : music.bpm;
   input.value=String(music.bpm);
   renderOrder();
   return;
  }
  switch (input.dataset.field) {
   case 'music-pattern': showPattern(music.patterns.find(item=>item.id===value)); break;
   case 'music-pattern-name': {
    const name=value.trim().slice(0,60);
    if (name) pattern.name=name;
    renderPatterns();
    renderOrder();
    break;
   }
   case 'music-instrument': stop(); music.instruments[track]=value; break;
   case 'music-octave': octaves[track]=Number(value); renderGrid(); break;
   case 'music-note-length': noteLength=Number(value); break;
   case 'music-loop': stop(); break;
  }
 });
 root.addEventListener('input',event=>{
  if (event.target.id!=='music-volume') return;
  stop();
  music.volumes[track]=Number(event.target.value);
  settings.querySelector('output').textContent=event.target.value+'%';
 });
 roll.addEventListener('keydown',event=>{
  const cell=event.target.dataset.musicCell;
  const moves={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};
  const move=moves[event.key];
  if (!cell || !move) return;
  event.preventDefault();
  [row,step]=cell.split(':').map(Number);
  row=Math.max(0,Math.min(pitches().length-1,row+move[0]));
  step=Math.max(0,Math.min(musicSteps-1,step+move[1]));
  const next=find('[data-music-cell="'+row+':'+step+'"]');
  event.target.tabIndex=-1;
  next.tabIndex=0;
  next.focus({preventScroll:true});
 });
 $('#dialog').addEventListener('close',()=>stop(),{once:true});
 renderPatterns();
 renderTrack();
 renderGrid();
 renderOrder();
}
