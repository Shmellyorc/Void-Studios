const editorDebug = {
 breakpoints: new Set(), open: false, pane: 'sheet', mode: 'running', point: null,
 sourceKey: '', selected: '', traceEnabled: false, follow: true, trace: [], sequence: 0,
 profiling: false, profileOpened: false, samples: [], lastRefresh: 0, project: null,
};

const sourceKey = source => `${source.kind}:${source.id}`;
const breakpointKey = (source, id) => `${sourceKey(source)}:${id}`;

function editorEventSource() {
 const sheet = currentSheet();
 return sheet ? { kind: 'behavior', id: sheet.id, name: sheet.name } : { kind: 'layout', id: L().id, name: L().name };
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
 const { layouts, behaviorSheets } = editorDebug.project;
 return [...layouts.map(layout => ({ ...layout, kind: 'layout' })), ...behaviorSheets.map(sheet => ({ ...sheet, kind: 'behavior' }))];
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
 const catalog = editorDebug.conditions[kind];
 return event?.conditions.map(condition => catalog[condition.kind]?.[1] ?? condition.kind).join(' / ') || 'Unconditional event';
}

function preparePreviewDebug(project) {
 Object.assign(editorDebug, { project, mode: 'running', point: null, sourceKey: sourceKey(editorEventSource()), selected: '',
  trace: [], samples: [], sequence: 0, lastRefresh: 0, inspectedPoint: null,
  conditions: { layout: studioBlockCatalog('condition', false, project), behavior: studioBlockCatalog('condition', true, project) },
  actions: studioBlockCatalog('action', false, project) });
 $('#debug-source').innerHTML = debugSources().map(source =>
  `<option value="${esc(sourceKey(source))}">${source.kind === 'layout' ? 'Layout' : 'Behavior'} · ${esc(source.name)}</option>`).join('');
 delete $('#debug-sheet-rows').dataset.rendered;
 delete $('#debug-trace').dataset.sequence;
 delete $('#debug-object').dataset.objects;
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
   if (command === 'continue') $('#gamecanvas').focus({ preventScroll: true });
   renderPreviewDebug(true);
  },
  onReset(paused) {
   Object.assign(editorDebug, { mode: paused ? 'paused' : 'running', point: null, inspectedPoint: null,
    selected: '', trace: [], samples: [] });
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
 for (const pane of ['sheet','objects','profiler']) {
  $('#debug-pane-' + pane).hidden = editorDebug.pane !== pane;
  $('#debug-tab-' + pane).setAttribute('aria-pressed', String(editorDebug.pane === pane));
 }
 const snapshot = runtime?.inspect();
 if (editorDebug.pane === 'sheet') renderDebugSheet(snapshot);
 else if (editorDebug.pane === 'objects') renderDebugObjects(snapshot);
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
  const conditions = editorDebug.conditions[source.kind];
  const actions = editorDebug.actions;
  const walk = (events, level = 0) => events.map(event => {
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
   </div>${walk(event.children || [],level+1)}`;
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

function renderDebugObjects(snapshot) {
 const types = snapshot?.objects ?? [];
 const picker = $('#debug-object');
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
 const entries = object ? [['X',+object.x.toFixed(2)],['Y',+object.y.toFixed(2)],['Rotation',+object.angle.toFixed(2)],
  ['Visible',object.visible],['Animation',object.animation?.clip?.name ?? ''],['Navigation',object.navigation?.status ?? ''],
  ...Object.entries(object.vars ?? {})] : [];
 $('#debug-object-data').innerHTML = entries.length ? debugTable(entries)
  : `<p class="muted">${removed ? 'This instance is no longer live.' : 'No live instances.'}</p>`;
 const globals = Object.entries(snapshot?.vars ?? {});
 $('#debug-global-data').innerHTML = globals.length ? debugTable(globals) : '<p class="muted">No global variables.</p>';
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
 $('#debug-object').onchange = event => { editorDebug.selected = event.target.value; renderPreviewDebug(true); };
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
