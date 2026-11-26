const editorDebug = {
 breakpoints: new Set(), open: false, pane: 'sheet', mode: 'running', point: null,
 sourceKey: '', selected: '', traceEnabled: false, follow: true, trace: [], sequence: 0,
 profiling: false, profileOpened: false, samples: [], lastRefresh: 0, project: null,
};

const sourceKey = source => `${source.kind}:${source.id}`;
const breakpointKey = (source, id) => `${sourceKey(source)}:${id}`;

function editorEventSource() {
 const {events,...source}=editorEventSheet();
 return source;
}

function toggleBreakpoint(source, id) {
 const key = breakpointKey(source, id);
 if (editorDebug.breakpoints.has(key)) editorDebug.breakpoints.delete(key);
 else editorDebug.breakpoints.add(key);
}

function editorBreakpointButton(event) {
 const active = editorDebug.breakpoints.has(breakpointKey(editorEventSource(), event.id));
 return `<button class="breakpoint-button ${active ? 'armed' : ''}" data-act="breakpoint:${esc(event.id)}"
  title="${active ? 'Remove' : 'Set'} breakpoint" aria-label="${active ? 'Remove' : 'Set'} breakpoint" aria-pressed="${active}">${active ? '●' : '○'}</button>`;
}

function debugSources() {
 if (!editorDebug.project) return [];
 return eventSheetSources(editorDebug.project);
}

function debugEvent(events, id) {
 for (const event of events) {
  if (event.id === id) return event;
  const child = debugEvent(event.children || [], id);
  if (child) return child;
 }
}

function debugLabel(event, kind) {
 if (event?.functionName) return event.functionName;
 const catalog = editorDebug.conditions[kind==='behavior'?'behavior':'layout'];
 return event?.conditions.map(condition => catalog[condition.kind]?.[1] ?? condition.kind).join(' / ') || 'Unconditional event';
}

function preparePreviewDebug(project) {
 const source = project.activeLayout === L().id ? editorEventSource() : { kind:'layout',id:project.activeLayout };
 Object.assign(editorDebug, { project, mode: 'running', point: null, sourceKey: sourceKey(source), selected: '',
  trace: [], samples: [], sequence: 0, lastRefresh: 0, inspectedPoint: null,
  conditions: { layout: studioBlockCatalog('condition', false, project), behavior: studioBlockCatalog('condition', true, project) },
  actions: studioBlockCatalog('action', false, project) });
 $('#debug-source').innerHTML = debugSources().map(source =>
  `<option value="${esc(sourceKey(source))}">${({layout:'Layout',shared:'Shared',behavior:'Behavior'})[source.kind]} · ${esc(source.name)}</option>`).join('');
 delete $('#debug-sheet-rows').dataset.rendered;
 delete $('#debug-trace').dataset.sequence;
 delete $('#debug-object').dataset.objects;
 delete $('#debug-watch-object').dataset.objects;
 delete $('#debug-watch-list').dataset.watches;
 finishWatchEdit();
 debugStatus($('#debug-edit-status'),'');
 $('#debug-tracing').checked = editorDebug.traceEnabled;
 $('#debug-follow').checked = editorDebug.follow;
 $('#debug-profiling').checked = editorDebug.profiling;
 setPreviewInspector(editorDebug.open || tab === 'events');
 return {
  hasBreakpoint: (source, id) => editorDebug.breakpoints.has(breakpointKey(source, id)),
  isTracing: () => editorDebug.traceEnabled,
  isProfiling: () => editorDebug.profiling,
  trace(point) {
   editorDebug.trace.push({ ...point, sequence: ++editorDebug.sequence });
   if (editorDebug.trace.length > 120) editorDebug.trace.shift();
  },
  onPause(point) {
   editorDebug.mode = 'paused';
   editorDebug.point = point;
   editorDebug.inspectedPoint = null;
   if (point) {
    editorDebug.pane = 'sheet';
    editorDebug.sourceKey = sourceKey(point.source);
    const current = Number(editorDebug.selected);
    if (!point.selected.includes(current)) editorDebug.selected = String(point.selected[0] ?? '');
    setPreviewInspector(true);
   } else renderPreviewDebug(true);
  },
  onResume(command) {
   editorDebug.mode = command === 'continue' || command === 'frame' ? 'running' : 'stepping';
   editorDebug.point = editorDebug.inspectedPoint = null;
   debugStatus($('#debug-edit-status'),'');
   if (command === 'continue') $('#gamecanvas').focus({ preventScroll: true });
   renderPreviewDebug(true);
  },
  onReset(paused,selected) {
   Object.assign(editorDebug, { mode: paused ? 'paused' : 'running', point: null, inspectedPoint: null,
    selected: String(selected ?? ''), trace: [], samples: [] });
   if (paused) $('#debug').textContent = 'Paused before the first frame.';
   debugStatus($('#debug-edit-status'),'');
   renderPreviewDebug(true);
  },
 };
}

function debugOnFrame(profile) {
 if (profile) {
  editorDebug.samples.push(profile);
  if (editorDebug.samples.length > 90) editorDebug.samples.shift();
 }
 if (editorDebug.open) renderPreviewDebug();
}

function setPreviewInspector(open) {
 editorDebug.open = open;
 $('#preview').classList.toggle('debugger-open', open);
 $('#preview-inspector').hidden = !open;
 $('#toggle-preview-inspector').setAttribute('aria-pressed', String(open));
 renderPreviewDebug(true);
}

function renderPreviewDebug(force = false) {
 const now = performance.now();
 if (!force && now - editorDebug.lastRefresh < 150) return;
 editorDebug.lastRefresh = now;
 const point = editorDebug.point;
 const paused = editorDebug.mode === 'paused';
 $('#pause').textContent = paused ? 'Resume' : 'Pause';
 for (const id of ['step', 'step-into', 'step-over']) $('#' + id).disabled = !paused;
 $('#debug-run-state').textContent = point ? `${point.breakpoint ? 'Breakpoint' : 'Step'} · ${point.source.name} · frame ${point.frame}`
  : paused ? 'Paused' : editorDebug.mode === 'stepping' ? 'Stepping to next action…' : 'Running';
 if (!editorDebug.open) return;
 for (const pane of ['sheet','objects','watches','profiler']) {
  $('#debug-pane-' + pane).hidden = editorDebug.pane !== pane;
  $('#debug-tab-' + pane).setAttribute('aria-pressed', String(editorDebug.pane === pane));
 }
 const snapshot = runtime?.inspect();
 if (editorDebug.pane === 'sheet') renderDebugSheet(snapshot);
 else if (editorDebug.pane === 'objects') renderDebugObjects(snapshot);
 else if (editorDebug.pane === 'watches') renderDebugWatches(snapshot);
 else renderDebugProfiler(snapshot);
}

function renderDebugSheet(snapshot) {
 const selectedPoint = editorDebug.inspectedPoint ?? editorDebug.point ?? (editorDebug.traceEnabled && editorDebug.follow ? editorDebug.trace.at(-1) : null);
 if (selectedPoint && (editorDebug.inspectedPoint || editorDebug.follow)) editorDebug.sourceKey = sourceKey(selectedPoint.source);
 const source = debugSources().find(item => sourceKey(item) === editorDebug.sourceKey);
 if (!source) return;
 const visiblePoint = selectedPoint && sourceKey(selectedPoint.source) === sourceKey(source) ? selectedPoint : null;
 $('#debug-source').value = sourceKey(source);
 const contents = $('#debug-sheet-rows');
 const stoppedHere = Boolean(visiblePoint && editorDebug.point === visiblePoint);
 const pointId = visiblePoint ? `${visiblePoint.id}:${visiblePoint.actionIndex}:${stoppedHere}:${visiblePoint.conditions.join(',')}:${visiblePoint.parents.map(item => item.id).join(',')}` : '';
 const key = `${sourceKey(source)}|${pointId}|${[...editorDebug.breakpoints].join(';')}`;
 if (contents.dataset.rendered !== key) {
  const conditions = editorDebug.conditions[source.kind==='behavior'?'behavior':'layout'];
  const actions = editorDebug.actions;
  const walk = (events, level = 0, parentColor) => events.map(event => {
   if (event.group) {
    const accent=eventGroupColor(event.id,parentColor);
    return `<div class="debug-event debug-event-group" style="--event-indent:${Math.min(5,level)};--group-accent:${accent}">
     <strong>${esc(event.group)}</strong></div>`+
     eventGroupGuide(walk(event.children??[],level+1,accent),accent,level*13+1,level<5);
   }
   if (event.include) {
    const name=editorDebug.project.eventSheets?.find(sheet=>sheet.id===event.include)?.name??'Unavailable sheet';
    return `<div class="debug-event" style="--event-indent:${Math.min(5,level)}"><strong>Include · ${esc(name)}</strong></div>`;
   }
   const active = visiblePoint?.id === event.id;
   const reached = visiblePoint?.parents.some(parent => sourceKey(parent.source) === sourceKey(source) && parent.id === event.id);
   const armed = editorDebug.breakpoints.has(breakpointKey(source, event.id));
   const actionIndex = active && stoppedHere ? (visiblePoint.actionIndex ?? 0) : -1;
   return `<div class="debug-event ${active ? 'debug-event-active' : ''} ${reached ? 'debug-event-parent' : ''} ${event.disabled ? 'debug-event-disabled' : ''}"
    style="--event-indent:${Math.min(5,level)}" data-debug-row="${esc(event.id)}" ${active ? 'aria-current="step"' : ''}>
    <div class="debug-event-title"><button data-debug-break="${esc(event.id)}" class="breakpoint-button ${armed ? 'armed' : ''}"
     aria-label="${armed ? 'Remove' : 'Set'} breakpoint" aria-pressed="${armed}">${armed ? '●' : '○'}</button>
     <strong>${esc(debugLabel(event,source.kind))}</strong></div>
    ${event.conditions.map((block,index) => {
     const result = active ? visiblePoint.conditions[index] : null;
     const status = result === true ? '<b class="condition-pass" title="Passed">✓</b>' : result === false ? '<b class="condition-fail" title="Failed">×</b>' : '';
     return `<div class="debug-rule debug-condition">${status}${formatBlock(block, conditions)}</div>`;
    }).join('')}
    ${event.actions.map((block,index) => `<div class="debug-rule debug-action ${actionIndex === index ? 'debug-next' : ''}">
     ${actionIndex === index ? '<span class="next-marker" aria-label="Next action">▶</span>' : ''}${formatBlock(block,actions)}</div>`).join('')}
   </div>${walk(event.children || [],level+1,parentColor)}`;
  }).join('');
  contents.innerHTML = walk(source.events) || '<p class="muted">This sheet has no events.</p>';
  contents.dataset.rendered = key;
  if (visiblePoint) (contents.querySelector('.debug-next') ?? contents.querySelector('[aria-current=step]'))?.scrollIntoView({ block: 'nearest' });
 }
 $('#debug-picked').innerHTML = visiblePoint ? `<div class="debug-pick-summary">
  <span>${visiblePoint.calls.length ? `Calls · ${esc(visiblePoint.calls.join(' → '))}` : 'Picked instances'}</span>
  ${visiblePoint.selected.map(id => {
   const object = snapshot?.objects.find(item => item.id === id);
   return `<button data-debug-pick="${id}">${esc(T(object?.type)?.name ?? 'Instance')} #${id}</button>`;
  }).join('') || '<span class="muted">None</span>'}</div>` : '';
 const trace = $('#debug-trace');
 const sequence = editorDebug.trace.at(-1)?.sequence ?? 0;
 if (trace.dataset.sequence !== String(sequence)) {
  const sources = new Map(debugSources().map(source => [sourceKey(source), source]));
  trace.innerHTML = [...editorDebug.trace].reverse().slice(0,16).map(item => {
   const source = sources.get(sourceKey(item.source));
   const title = debugLabel(debugEvent(source?.events ?? [], item.id), item.source.kind);
   return `<button class="trace-item" data-debug-trace="${item.sequence}"><span>${item.frame}</span>
    <span>${esc(item.source.name)} · ${esc(title)}</span></button>`;
  }).join('') || '<p class="muted">Enable trace to record recent event hits.</p>';
  trace.dataset.sequence = String(sequence);
 }
}

function plainDebugValue(value) {
 let output;
 try { output = JSON.stringify(value) ?? 'undefined'; }
 catch { output = '[Circular]'; }
 return output.length > 200 ? output.slice(0,197) + '…' : output;
}

function debugTable(entries) {
 return `<dl class="debug-values">${entries.map(([key,value]) => `<dt>${esc(key)}</dt><dd>${esc(plainDebugValue(value))}</dd>`).join('')}</dl>`;
}

function updateDebugObjectPicker(picker,snapshot) {
 const types = (snapshot?.objects ?? []).filter(object=>!object.dead);
 const object = editorDebug.selected ? types.find(object => String(object.id) === editorDebug.selected) : types[0];
 const removed = editorDebug.selected && !object;
 if (object) editorDebug.selected = String(object.id);
 const signature = types.map(object => `${object.id}:${object.type}`).join(',') + (removed ? `|removed:${editorDebug.selected}` : '');
 if (picker.dataset.objects !== signature) {
  picker.innerHTML = (removed ? `<option value="${esc(editorDebug.selected)}">Instance #${esc(editorDebug.selected)} (removed)</option>` : '') +
   types.map(object => `<option value="${object.id}">${esc(T(object.type)?.name ?? object.type)} #${object.id}</option>`).join('');
  picker.dataset.objects = signature;
 }
 picker.value = editorDebug.selected;
 picker.disabled = !types.length;
 return {object,removed};
}

function debugEditField(group,key,label,value,field = {}) {
 const type = typeof value;
 const attrs = `data-debug-group="${group}" data-debug-key="${esc(key)}" data-debug-label="${esc(label)}"`;
 if (type === 'boolean') return `<label class="check"><input type="checkbox" ${attrs} ${value ? 'checked' : ''}> ${esc(label)}</label>`;
 const input = type === 'number' ? `<input type="number" step="any" value="${esc(value)}" required ${attrs}
  ${field.min !== undefined ? 'min="'+field.min+'"' : ''} ${field.max !== undefined ? 'max="'+field.max+'"' : ''}>` :
  type === 'string' && !/[\r\n]/.test(value) ? `<input type="text" value="${esc(value)}" ${attrs}>` :
  `<textarea rows="2" ${attrs} data-debug-format="${type === 'string' ? 'text' : 'json'}">
${esc(type === 'string' ? value : JSON.stringify(value) ?? 'null')}</textarea>`;
 return `<label>${esc(label)}${input}</label>`;
}

function renderDebugObjects(snapshot) {
 const {object,removed} = updateDebugObjectPicker($('#debug-object'),snapshot);
 const state=object?.animationState;
 const animation=state ? [['Animation state',state.name],['Speed',+state.speed.toFixed(1)+' px/s'],
  ['Animation control',state.manual?'Manual · '+state.manual:'State machine']] : [];
 const editable = Boolean(object && editorDebug.mode === 'paused');
 const entries = object ? [
  ...(editable ? [] : [['X',+object.x.toFixed(2)],['Y',+object.y.toFixed(2)],['Rotation',+object.angle.toFixed(2)],['Visible',object.visible]]),
  ['Animation',object.animation?.clip?.name ?? ''],['Navigation',object.navigation?.status ?? ''],
  ...animation,...(editable ? [] : Object.entries(object.vars ?? {})),
 ] : [];
 $('#debug-object-data').innerHTML = entries.length ? debugTable(entries)
  : `<p class="muted">${removed ? 'This instance is no longer live.' : 'No live instances.'}</p>`;
 const form = $('#debug-instance-form');
 form.hidden = !editable;
 if (editable) {
  const fields = Object.entries(previewInstanceFields).filter(([key])=>key !== 'text' || T(object.type)?.kind === 'text')
   .map(([key,field])=>debugEditField('property',key,field.label,object[key],field));
  const variables = Object.entries(object.vars).map(([key,value])=>debugEditField('variable',key,key,value));
  $('#debug-instance-fields').innerHTML = '<div class="debug-edit-grid">'+fields.join('')+'</div>' +
   (variables.length ? '<h4>INSTANCE VARIABLES</h4><div class="debug-edit-grid">'+variables.join('')+'</div>' : '');
 }
 const history=$('#debug-animation-history');
 history.hidden=!state;
 history.innerHTML=state?'<h4>ANIMATION TRANSITIONS</h4><ol>'+[...state.history].reverse().map(change=>
  `<li><strong>${esc(change.from?change.from+' → '+change.to:change.to)}</strong>
   <small>Frame ${change.frame} · ${esc(change.reason)}</small></li>`).join('')+'</ol>':'';
 const globals = Object.entries(snapshot?.vars ?? {});
 $('#debug-global-data').innerHTML = globals.length ? debugTable(globals) : '<p class="muted">No global variables.</p>';
}

function debugStatus(node,message,error = false) {
 if (node.textContent !== message) node.textContent = message;
 node.classList.toggle('debug-error',error);
}

function finishWatchEdit() {
 editorDebug.editingWatch = null;
 $('#debug-watch-expression').value = '';
 $('#debug-watch-save').textContent = 'Add watch';
 $('#debug-watch-cancel').hidden = true;
 debugStatus($('#debug-watch-status'),'');
}

function renderDebugWatches(snapshot) {
 updateDebugObjectPicker($('#debug-watch-object'),snapshot);
 const list = $('#debug-watch-list');
 const watches = P.previewSettings?.watches ?? [];
 const signature = JSON.stringify(watches);
 if (list.dataset.watches !== signature) {
  list.innerHTML = watches.map((expression,index)=>`<div class="debug-watch-row">
   <button type="button" class="debug-watch-expression" data-watch-edit="${index}" title="Edit expression">${esc(expression)}</button>
   <output class="debug-watch-value" aria-live="off"></output>
   <button type="button" data-watch-remove="${index}" aria-label="Remove watch ${esc(expression)}">×</button>
  </div>`).join('') || '<p class="muted">Add an expression to watch it update as the game runs.</p>';
  list.dataset.watches = signature;
 }
 for (const [index,output] of [...list.querySelectorAll('output')].entries()) {
  try {
   const result = runtime ? plainDebugValue(runtime.evaluateWatch(watches[index],Number(editorDebug.selected))) : '—';
   debugStatus(output,result);
  } catch (error) { debugStatus(output,error.message,true); }
 }
}

function setupPreviewWatches() {
 $('#debug-watch-form').onsubmit = event => {
  event.preventDefault();
  const input = $('#debug-watch-expression'), expression = input.value.trim(), index = editorDebug.editingWatch;
  const watches = P.previewSettings?.watches ?? [];
  try {
   if (!expression || expression.length > 300) throw Error('Enter an expression up to 300 characters.');
   parseEventExpression(expression);
   if (watches.some((watch,i)=>watch === expression && i !== index)) throw Error('Already watching this expression.');
   checkpoint();
   const settings = previewProjectSettings(P);
   if (index === null) settings.watches.push(expression);
   else settings.watches[index] = expression;
   persist();
   finishWatchEdit();
   renderPreviewDebug(true);
   input.focus();
  } catch (error) { debugStatus($('#debug-watch-status'),error.message,true); }
 };
 $('#debug-watch-cancel').onclick = finishWatchEdit;
 $('#debug-watch-list').onclick = event => {
  const target = event.target.closest('[data-watch-edit],[data-watch-remove]');
  if (!target) return;
  const input = $('#debug-watch-expression'), watches = P.previewSettings?.watches ?? [];
  if (target.hasAttribute('data-watch-edit')) {
   const index = Number(target.dataset.watchEdit);
   editorDebug.editingWatch = index;
   input.value = watches[index];
   $('#debug-watch-save').textContent = 'Update watch';
   $('#debug-watch-cancel').hidden = false;
   debugStatus($('#debug-watch-status'),'');
  } else {
   checkpoint();
   watches.splice(Number(target.dataset.watchRemove),1);
   persist();
   finishWatchEdit();
   renderPreviewDebug(true);
  }
  input.focus();
 };
}

function setupPreviewInstanceEditor() {
 $('#debug-instance-form').onsubmit = event => {
  event.preventDefault();
  const status = $('#debug-edit-status');
  try {
   const edits = [...event.currentTarget.querySelectorAll('[data-debug-key]')].flatMap(input => {
    const {debugGroup:group,debugKey:key,debugLabel:label,debugFormat:format} = input.dataset;
    const checkbox = input.type === 'checkbox';
    if (checkbox ? input.checked === input.defaultChecked : input.value === input.defaultValue) return [];
    let value;
    try {
     value = checkbox ? input.checked : input.type === 'number' ? input.valueAsNumber :
      format === 'json' ? JSON.parse(input.value) : input.value;
    } catch { throw Error('Enter valid JSON for ' + label + '.'); }
    return [{group,key,value}];
   });
   if (!edits.length) { debugStatus(status,'No values changed.'); return; }
   runtime.editPreviewInstance(Number(editorDebug.selected),edits);
   renderPreviewDebug(true);
   debugStatus(status,'Updated in Preview.');
  } catch (error) { debugStatus(status,error.message,true); }
 };
}

function renderDebugProfiler(snapshot) {
 const { samples } = editorDebug;
 $('#debug-particle-count').textContent = `${snapshot?.objects.length ?? 0} instances · ${snapshot?.particles.length ?? 0} particles`;
 if (!samples.length) {
  const status = !editorDebug.profiling ? 'Enable capture to measure CPU frame time.'
   : editorDebug.mode === 'paused' ? 'Resume or step a frame to collect CPU timings.' : 'Collecting CPU timings…';
  $('#debug-profile-data').innerHTML = `<p class="muted">${status}</p>`;
  return;
 }
 const average = key => samples.reduce((sum,sample) => sum + sample[key], 0) / samples.length;
 const total = average('total');
 const phases = [['simulation','Simulation'],['events','Visual events'],['rendering','Rendering']].map(([key,label]) => {
  const ms = average(key), fraction = total ? Math.min(100, ms / total * 100) : 0;
  return `<div class="profile-phase"><span>${label}</span><strong>${ms.toFixed(2)} ms</strong>
   <span class="profile-bar"><span style="width:${fraction}%"></span></span></div>`;
 }).join('');
 const leaders = key => {
  const sums = new Map();
  for (const sample of samples) for (const [name, value] of Object.entries(sample[key])) sums.set(name, (sums.get(name) ?? 0) + value);
  return [...sums].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,value])=>[name, (value / samples.length).toFixed(3)+' ms']);
 };
 $('#debug-profile-data').innerHTML = `<p class="profile-total"><b>${total.toFixed(2)} ms</b> mean CPU frame time · ${samples.length} frames</p>
  ${phases}<h4>Event sheets · inclusive</h4>${debugTable(leaders('sheets'))}<h4>Built-in behaviors</h4>${debugTable(leaders('behaviors'))}`;
}

function setupPreviewDebugger() {
 setupPreviewWatches();
 setupPreviewInstanceEditor();
 $('#toggle-preview-inspector').onclick = () => setPreviewInspector(!editorDebug.open);
 $('#pause').onclick = () => runtime?.debugCommand(editorDebug.mode === 'paused' ? 'continue' : 'pause');
 $('#step').onclick = () => runtime?.debugCommand('frame');
 $('#step-into').onclick = () => runtime?.debugCommand('into');
 $('#step-over').onclick = () => runtime?.debugCommand('over');
 $('#debug-source').onchange = event => {
  editorDebug.sourceKey = event.target.value;
  editorDebug.inspectedPoint = null;
  editorDebug.follow = false;
  $('#debug-follow').checked = false;
  renderPreviewDebug(true);
 };
 $('#debug-show-code').onclick = () => {
  const source = debugSources().find(item => sourceKey(item) === editorDebug.sourceKey);
  const point = editorDebug.inspectedPoint ?? editorDebug.point;
  if (source) showGeneratedJavaScript(source, point && sourceKey(point.source) === sourceKey(source) ? point.id : undefined, editorDebug.project);
 };
 for (const picker of [$('#debug-object'),$('#debug-watch-object')]) picker.onchange = event => {
  editorDebug.selected = event.target.value;
  debugStatus($('#debug-edit-status'),'');
  renderPreviewDebug(true);
 };
 $('#debug-tracing').onchange = event => { editorDebug.traceEnabled = event.target.checked; renderPreviewDebug(true); };
 $('#debug-follow').onchange = event => { editorDebug.follow = event.target.checked; editorDebug.inspectedPoint = null; renderPreviewDebug(true); };
 $('#debug-profiling').onchange = event => { editorDebug.profiling = event.target.checked; renderPreviewDebug(true); };
 $('#preview-inspector').addEventListener('click', event => {
  const control = event.target.closest('[data-debug-pane], [data-debug-break], [data-debug-pick], [data-debug-trace]');
  if (!control) return;
  const { debugPane, debugBreak, debugPick, debugTrace } = control.dataset;
  if (debugPane) {
   editorDebug.pane = debugPane;
  if (debugPane === 'profiler' && !editorDebug.profileOpened) {
   editorDebug.profileOpened = true;
   $('#debug-profiling').checked = editorDebug.profiling = true;
   }
  }
  if (debugBreak) {
   const source = debugSources().find(item => sourceKey(item) === editorDebug.sourceKey);
   if (source) toggleBreakpoint(source,debugBreak);
  }
  if (debugPick) { editorDebug.selected = debugPick; editorDebug.pane = 'objects'; }
  if (debugTrace) {
   editorDebug.inspectedPoint = editorDebug.trace.find(item => item.sequence === Number(debugTrace));
   if (editorDebug.inspectedPoint) editorDebug.sourceKey = sourceKey(editorDebug.inspectedPoint.source);
   editorDebug.follow = false;
   $('#debug-follow').checked = false;
  }
  renderPreviewDebug(true);
 });
}
