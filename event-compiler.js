const conditionExpressions = { compare: ['expr'], filter: ['expr'], every: ['seconds'] };
const actionExpressions = {
 return: ['value'], setLocal: ['value'], setEntry: ['key','value'], setGlobal: ['value'], addGlobal: ['value'],
 create: ['x','y'], cameraPosition: ['x','y'], cameraZoom: ['zoom'], cameraShake: ['strength','duration'],
 log: ['value'], sound: ['frequency','duration'], audioVolume: ['value'], emitParticles: ['count'], navigate: ['x','y','restart'],
 moveSolid: ['x','y'], playClip: ['restart'], animation: ['value'], damage: ['value'], heal: ['value'],
 set: ['value'], add: ['value'], position: ['x','y'], jump: ['value'], text: ['value'], instance: ['value'],
};

function compileStudioEvents(project) {
 const rows = [...projectEventRows(project)];
 const extensions = extensionRegistry(project.extensions);
 const layoutConditions = studioBlockCatalog('condition', false, project);
 const behaviorConditions = studioBlockCatalog('condition', true, project);
 const actions = studioBlockCatalog('action', false, project);
 const visualFunctions = new Map(project.layouts.flatMap(layout => layout.events.filter(event => event.functionName)
  .map(event => [event.functionName, event.params || []])));
 const expressions = new Map(), mappings = [], diagnostics = [], lines = [];
 const line = value => lines.push(value);
 const commentText = value => String(value).replace(/[\r\n\u2028\u2029]/g,' ').replace(/</g,'\\u003c');
 const visualBlock = (block, catalog) => {
  const name = catalog[block.kind]?.[1] ?? block.kind;
  const fields = Object.entries(block.args ?? {}).map(([name,value]) => `${name}=${eventJavaScriptLiteral(value)}`);
  return commentText([name, ...fields].join(' · '));
 };

 function problem(row, field, message) {
  diagnostics.push({ source: row.source, id: row.event.id, number: row.number, field, message });
 }

 function capture(row, references, field, value) {
  const text = String(value ?? '0');
  let result = expressions.get(text);
  if (!result) {
   try {
    result = { code: '(env, context) => ' + printEventExpression(parseEventExpression(text)) };
   } catch (error) {
    result = { error: error.message, code: `() => { throw new Error(${eventJavaScriptLiteral(error.message)}); }` };
   }
   expressions.set(text, result);
  }
  references.add(text);
  if (result.error) problem(row, field, result.error);
 }

 function compileArguments(row, references) {
  const conditionCatalog = row.source.kind === 'behavior' ? behaviorConditions : layoutConditions;
  function captureExtension(block, name, kind) {
   const descriptor = extensions.get(block.kind)?.block;
   if (descriptor?.kind !== kind) return;
   for (const parameter of descriptor.parameters) {
    capture(row, references, name + ' · ' + parameter.name, block.args?.[parameter.name] ?? parameter.default);
   }
   if (kind === 'condition') capture(row, references, name + ' · expression', descriptor.expression);
   else for (const operation of descriptor.operations) capture(row, references, name + ' · ' + operation.property, operation.value);
  }
  capture(row, references, 'Repeat', row.event.repeat || '1');
  row.event.conditions.forEach((block,index) => {
   if (!Object.hasOwn(conditionCatalog, block.kind)) problem(row, `Condition ${index+1}`, 'Unknown condition ' + block.kind);
   captureExtension(block, `Condition ${index+1}`, 'condition');
   for (const field of Object.hasOwn(conditionExpressions, block.kind) ? conditionExpressions[block.kind] : []) {
    capture(row, references, `Condition ${index+1} · ${field}`, block.args?.[field]);
   }
  });
  row.event.actions.forEach((block,index) => {
   if (!Object.hasOwn(actions, block.kind)) problem(row, `Action ${index+1}`, 'Unknown action ' + block.kind);
   captureExtension(block, `Action ${index+1}`, 'action');
   for (const field of Object.hasOwn(actionExpressions, block.kind) ? actionExpressions[block.kind] : []) {
    const value = block.args?.[field] ?? (field === 'restart' ? 'false' : undefined);
    capture(row, references, `Action ${index+1} · ${field}`, value);
   }
   if (block.kind !== 'call') return;
   const args = block.args ?? {};
   const params = visualFunctions.get(args.name);
   if (!params) problem(row, `Action ${index+1}`, 'Unknown visual function ' + args.name);
   try {
    const values = JSON.parse(args.values || '[]');
    if (!Array.isArray(values)) throw Error('Function arguments must be a JSON array');
    if (params && params.length !== values.length) problem(row, `Action ${index+1}`, `Expected ${params.length} argument expressions`);
    values.forEach((value,position) => capture(row, references, `Action ${index+1} · argument ${position+1}`, value));
   } catch (error) { problem(row, `Action ${index+1}`, error.message); }
  });
 }

 line('({');
 line('  // Generated event plans. The runtime supplies object picking, actions, and debugger hooks.');
 line('  rows: [');
 for (const row of rows) {
  const { event, source } = row;
  const start = lines.length + 1;
  const references = new Set();
  compileArguments(row, references);
  line(`    // ${commentText(source.name)} · Event ${row.number}${event.functionName ? ' · ' + commentText(event.functionName) : ''}`);
  line('    {');
  const conditionCatalog = source.kind === 'behavior' ? behaviorConditions : layoutConditions;
  if (event.conditions.length) {
   if (event.mode === 'or') {
    line('      select(scope, check, merge) {');
    line('        return merge([');
    event.conditions.forEach((block,index) => {
     line('          // ' + visualBlock(block,conditionCatalog));
     line(`          ...check(${index}, scope),`);
    });
    line('        ]);');
   } else {
    line('      select(scope, check) {');
    event.conditions.forEach((block,index) => {
     line('        // ' + visualBlock(block,conditionCatalog));
     if (!index) line('        let selection = check(0, scope);');
     else line(`        selection = selection.flatMap(items => check(${index}, items));`);
     if (index < event.conditions.length - 1) line('        if (!selection.length) return selection;');
    });
    line('        return selection;');
   }
   line('      },');
  } else line('      select(scope) { return [scope]; },');
  line('      *execute(action, subEvent, returned) {');
  event.actions.forEach((block,index) => {
   line('        // ' + visualBlock(block,actions));
   line(`        yield* action(${index});`);
   if (index < event.actions.length - 1 || event.children?.length) line('        if (returned()) return;');
  });
  (event.children ?? []).forEach((_,index) => {
   line(`        yield* subEvent(${index});`);
   if (index < event.children.length - 1) line('        if (returned()) return;');
  });
  line('      },');
  line('    },');
  mappings.push({ source, id: event.id, number: row.number, start, end: lines.length, references });
 }
 line('  ],');
 line(`  shape: ${eventJavaScriptLiteral(rows.map(eventRowShape))},`);
 line('  expressions: new Map([');
 for (const [text,expression] of expressions) {
  line(`    [${eventJavaScriptLiteral(text)}, ${expression.code}],`);
  expression.line = lines.length;
 }
 line('  ]),');
 line('})');
 return { code: lines.join('\n'), lines, mappings, expressions, diagnostics };
}

function loadCompiledStudioEvents(artifact) {
 // Only compiler-produced source reaches this constructor. User expressions are parsed first.
 return Function('"use strict"; return ' + artifact.code)();
}

function showGeneratedJavaScript(source, rowTarget, project = P) {
 const compiled = compileStudioEvents(project);
 const maps = compiled.mappings.filter(row => row.source.kind === source.kind && row.source.id === source.id);
 const selected = maps.find(row => typeof rowTarget === 'number' ? row.number === rowTarget : row.id === rowTarget);
 const diagnostics = compiled.diagnostics.filter(issue => issue.source.kind === source.kind && issue.source.id === source.id);
 const options = [['','Entire sheet'], ...maps.map(row => [String(row.number), `Event ${row.number} · lines ${row.start}–${row.end}`])];
 dialog(`${source.name} · JavaScript`, `<div class="compiler-options">
  ${select('Visual event','compiler-row',String(selected?.number ?? ''),options)}
  <button id="compiler-download">Download generated JS</button>
 </div>${diagnostics.length ? `<ul class="compiler-diagnostics">${diagnostics.map(issue =>
  `<li>Event ${issue.number} · ${esc(issue.field)} · ${esc(issue.message)}</li>`).join('')}</ul>` : ''}
 <pre id="compiler-code" class="compiler-code" aria-label="Generated JavaScript"></pre>`, () => {}, 'Close');
 $('#dialog').classList.add('compiler-dialog');
 const picker = $('#dialogbody [data-field="compiler-row"]');
 const code = $('#compiler-code');
 const sourceLine = (number, active) => `<span class="compiler-line${active ? ' current' : ''}" data-generated-line="${number}"><span class="line-number" aria-hidden="true">${number}</span>${esc(compiled.lines[number - 1])}</span>`;

 function renderCode() {
  const row = maps.find(row => String(row.number) === picker.value);
  const visible = row ? [row] : maps;
  if (!visible.length) { code.textContent = 'This sheet has no events.'; return; }
  const rowLines = visible.flatMap(item => Array.from({ length: item.end - item.start + 1 },
   (_,index) => sourceLine(item.start + index, item === row)));
  const references = new Set(visible.flatMap(item => [...item.references]));
  const expressions = [...references].map(text => compiled.expressions.get(text).line).sort((a,b) => a-b).map(number => sourceLine(number,false));
  code.innerHTML = rowLines.join('') + (expressions.length ? '<span class="compiler-heading">Expression functions</span>' + expressions.join('') : '');
  code.scrollTop = 0;
 }
 picker.onchange = renderCode;
 $('#compiler-download').onclick = () => dl(filename() + '.events.js', 'const compiledEvents = ' + compiled.code + ';\n', 'text/javascript');
 renderCode();
}
