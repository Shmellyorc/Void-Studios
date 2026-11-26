const menuInputDefaults = [
 ['menu-up','Menu Up',['ArrowUp'],[12]], ['menu-down','Menu Down',['ArrowDown'],[13]],
 ['menu-left','Menu Left',['ArrowLeft'],[14]], ['menu-right','Menu Right',['ArrowRight'],[15]],
 ['menu-confirm','Menu Confirm',['Enter','Space'],[0]], ['menu-back','Menu Back',['Escape'],[1]],
].map(([id,name,keys,buttons]) => ({ id,name,keys,buttons }));
const gamepadButtonNames = ['A / Cross','B / Circle','X / Square','Y / Triangle','Left bumper','Right bumper',
 'Left trigger','Right trigger','Back / Select','Start / Options','Left stick','Right stick','D-pad Up',
 'D-pad Down','D-pad Left','D-pad Right','Home'];
const uiAnchors = {
 'top-left':[0,0], 'top-center':[.5,0], 'top-right':[1,0],
 'center-left':[0,.5], center:[.5,.5], 'center-right':[1,.5],
 'bottom-left':[0,1], 'bottom-center':[.5,1], 'bottom-right':[1,1],
};
const uiCommands = ['event','layout','restart','show','restore'];
const uiSettingsKinds = ['slider','toggle','dropdown'];
const uiFonts = { system:'system-ui, sans-serif', serif:'Georgia, serif', mono:'monospace' };
const uiStyleColors = ['color','background','hover','pressed','focus','disabled'];
const isUISetting = item => uiSettingsKinds.includes(item.kind);
const isUIInteractive = item => item.kind === 'button' || isUISetting(item);

function gameKeyName(key) {
 const name = String(key).toLowerCase();
 const aliases = { space:' ',spacebar:' ',left:'arrowleft',right:'arrowright',up:'arrowup',down:'arrowdown' };
 return Object.hasOwn(aliases,name) ? aliases[name] : name;
}

function projectInputActions(project) {
 const actions = new Map(menuInputDefaults.map(action => [action.id,action]));
 for (const action of project.inputActions ?? []) actions.set(action.id,action);
 return [...actions.values()];
}

function validateGameUI(project) {
 project.inputActions ??= [];
 project.uiScreens ??= [];
 project.uiStyles ??= [];
 if (![project.inputActions,project.uiScreens,project.uiStyles].every(Array.isArray)) throw Error('Invalid UI screens, styles, or input actions');
 const idOK = id => typeof id === 'string' && /^[a-z0-9_-]+$/i.test(id);
 const nameOK = name => typeof name === 'string' && name.trim() && name.length <= 100;
 const actionIds = new Set(), screenIds = new Set(), itemIds = new Set(), styleIds = new Set();
 const colorOK = color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);
 for (const style of project.uiStyles) {
  if (!idOK(style?.id) || styleIds.has(style.id) || !nameOK(style.name) || !Object.hasOwn(uiFonts,style.font) ||
   !Number.isFinite(style.size) || style.size <= 0 || uiStyleColors.some(key => !colorOK(style[key]))) throw Error('Invalid shared UI style');
  styleIds.add(style.id);
 }
 for (const action of project.inputActions) {
  if (!idOK(action?.id) || actionIds.has(action.id) || !nameOK(action.name) ||
   !Array.isArray(action.keys) || action.keys.some(key => typeof key !== 'string' || key.length > 40) ||
   !Array.isArray(action.buttons) || action.buttons.some(button => !Number.isInteger(button) || button < 0 || button >= gamepadButtonNames.length)) {
   throw Error('Invalid named input action');
  }
  actionIds.add(action.id);
 }
 for (const screen of project.uiScreens) {
  if (!idOK(screen?.id) || screenIds.has(screen.id) || !nameOK(screen.name) || !Array.isArray(screen.items) ||
      (screen.pause !== undefined && typeof screen.pause !== 'boolean') ||
      (screen.navigation !== undefined && typeof screen.navigation !== 'boolean')) throw Error('Invalid UI screen');
  screenIds.add(screen.id);
  for (const item of screen.items) {
   if (!idOK(item?.id) || itemIds.has(item.id) || !['button','label','bar','panel','image',...uiSettingsKinds].includes(item.kind) ||
    !Object.hasOwn(uiAnchors,item.anchor) || ![item.x,item.y,item.w,item.h,item.size].every(Number.isFinite) ||
    Math.min(item.w,item.h,item.size) <= 0 || typeof item.text !== 'string' ||
    !colorOK(item.color) || !colorOK(item.background) ||
    (item.style != null && item.style !== '' && !styleIds.has(item.style)) ||
    (item.kind === 'button' && (!Number.isFinite(item.order) || !uiCommands.includes(item.command) || typeof item.target !== 'string')) ||
    (item.kind === 'panel' && (!uiPanelModes.includes(item.layout) ||
     !['start','center','end','stretch'].includes(item.align) ||
     ![item.padding,item.gap].every(value => Number.isFinite(value) && value >= 0))) ||
    (isUISetting(item) && (!Number.isFinite(item.order) || typeof item.variable !== 'string')) ||
    (item.kind === 'slider' && (![item.min,item.max,item.step].every(Number.isFinite) || item.min >= item.max || item.step <= 0)) ||
    (item.kind === 'dropdown' && (!Array.isArray(item.options) || !item.options.length ||
     new Set(item.options).size !== item.options.length || item.options.some(value => !nameOK(value)))) ||
    (item.kind === 'bar' && (!Number.isFinite(item.max) || item.max <= 0 || typeof item.variable !== 'string'))) {
    throw Error('Invalid control in ' + screen.name);
   }
   itemIds.add(item.id);
  }
  const items = new Map(screen.items.map(item => [item.id,item]));
  const verified = new Set();
  for (const item of screen.items) {
   const chain = new Set([item.id]);
   let cursor = item;
   while (cursor.parent && !verified.has(cursor.id)) {
    cursor = items.get(cursor.parent);
    if (cursor?.kind !== 'panel' || chain.has(cursor.id)) throw Error('Invalid panel hierarchy in ' + screen.name);
    chain.add(cursor.id);
   }
   for (const id of chain) verified.add(id);
  }
 }
 return project;
}

function createNamedInput(project) {
 const actions = projectInputActions(project).map(action => ({ ...action, keys: action.keys.map(gameKeyName) }));
 let down = new Set(), edges = new Set();
 return {
  update(keys, pressed, pads) {
   const next = new Set();
   edges = new Set();
   for (const action of actions) {
    const held = action.keys.some(key => keys.has(key)) || pads.some(pad => pad && pad.connected !== false &&
     action.buttons.some(index => pad.buttons[index]?.pressed || pad.buttons[index]?.value >= .5));
    if (held) next.add(action.id);
    if ((held && !down.has(action.id)) || (!down.has(action.id) && action.keys.some(key => pressed.has(key)))) edges.add(action.id);
   }
   down = next;
  },
  down: id => down.has(id),
  pressed: id => edges.has(id),
  isMenuKey: (key, includeBack) => actions.some(action =>
   action.id.startsWith('menu-') && (includeBack || action.id !== 'menu-back') && action.keys.includes(key)),
  isGameplayKey: key => actions.some(action => !action.id.startsWith('menu-') && action.keys.includes(key)),
 };
}

function uiControlContent(item, vars) {
 return item.text.replace(/\{([A-Za-z_$][\w$]*)\}/g, (token,key) => Object.hasOwn(vars,key) ? String(vars[key]) : token);
}

function uiSettingValue(item, vars, values) {
 return Object.hasOwn(vars,item.variable) ? vars[item.variable] :
  values?.get(item.id) ?? (item.kind === 'slider' ? item.min : item.kind === 'dropdown' ? item.options[0] : false);
}

function updateUIControl(node, item, vars, values, data) {
 const field = studioDataBoundValue(data,item.dataField,vars[item.dataRowVariable]);
 if (item.kind === 'image') {
  const sprite = data?.enumIcons.get(field) ?? field ?? '';
  if (node.dataset.dataSprite !== sprite) {
   const art = studioDataPortrait(data?.project,sprite);
   node.replaceChildren(...(art ? [art] : []));
   node.dataset.dataSprite = sprite;
  }
  return;
 }
 const content = field !== undefined ? String(field) : uiControlContent(item,vars);
 if (isUISetting(item)) {
  const label = node.firstElementChild, control = label.nextElementSibling;
  if (label.textContent !== content) {
   label.textContent = content;
   control.setAttribute('aria-label',content);
  }
  const value = uiSettingValue(item,vars,values);
  if (item.kind === 'toggle') {
   control.setAttribute('aria-pressed',String(Boolean(value)));
   const text = value ? 'On' : 'Off';
   if (control.textContent !== text) control.textContent = text;
  } else {
   const number = Number(value);
   const next = item.kind === 'slider' ? String(Math.max(item.min,Math.min(item.max,Number.isFinite(number) ? number : item.min))) :
    item.options.includes(value) ? value : item.options[0];
   if (control.value !== next) control.value = next;
   if (item.kind === 'slider') control.nextElementSibling.textContent = control.value;
  }
  return;
 }
 if (item.kind === 'panel') return;
 if (item.kind !== 'bar') {
  if (node.textContent !== content) node.textContent = content;
  return;
 }
 const value = Math.max(0,Math.min(item.max,Number(Object.hasOwn(vars,item.variable) ? vars[item.variable] : 0) || 0));
 const level = (100 * value / item.max) + '%';
 if (node.style.getPropertyValue('--void-ui-value') !== level) node.style.setProperty('--void-ui-value',level);
 const label = item.text ? content : value + ' / ' + item.max;
 if (node.firstChild.textContent !== label) node.firstChild.textContent = label;
}

function createUIControl(item, vars, style, values, data) {
 const node = document.createElement(item.kind === 'button' ? 'button' : 'div');
 node.className = 'void-ui-control void-ui-' + item.kind;
 node.dataset.uiControl = item.id;
 node.style.fontSize = 'calc(' + (style?.size ?? item.size) + ' * var(--void-ui-unit))';
 node.style.color = style?.color ?? item.color;
 node.style.setProperty('--void-ui-color',item.transparent ? 'transparent' : style?.background ?? item.background);
 if (style) {
  node.classList.add('void-ui-themed');
  node.style.fontFamily = uiFonts[style.font];
  for (const state of ['hover','pressed','focus','disabled']) node.style.setProperty('--void-ui-' + state,style[state]);
 }
 if (item.kind === 'panel') node.classList.toggle('void-ui-transparent',Boolean(item.transparent));
 if (item.kind === 'button') node.type = 'button';
 if (item.kind === 'bar') node.append(document.createElement('span'));
 if (item.kind === 'image' && item.text) {
  node.setAttribute('role','img');
  node.setAttribute('aria-label',item.text);
 }
 if (isUISetting(item)) {
  node.classList.add('void-ui-setting');
  const label = document.createElement('span');
  const control = document.createElement(({slider:'input',toggle:'button',dropdown:'select'})[item.kind]);
  if (item.kind === 'slider') {
   control.type = 'range';
   [control.min,control.max,control.step] = [item.min,item.max,item.step];
  }
  if (item.kind === 'toggle') control.type = 'button';
  if (item.kind === 'dropdown') for (const value of item.options) control.add(new Option(value,value));
  node.append(label,control);
  if (item.kind === 'slider') node.append(document.createElement('span'));
 }
 if (isUIInteractive(item)) {
  const control = item.kind === 'button' ? node : node.children[1];
  control.disabled = Boolean(item.disabled);
  node.classList.toggle('void-ui-disabled',Boolean(item.disabled));
 }
 updateUIControl(node,item,vars,values,data);
 return node;
}

function createGameOverlay(layer, canvas, activate, styles = [], data) {
 if (!layer) return null;
 const styleMap = new Map(styles.map(style => [style.id,style]));
 const values = new Map();
 let controls = [], interactive = [], selected = 0;
 function resize() {
  if (!canvas.width || !canvas.height) return;
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (width && height) {
   Object.assign(layer.style,{ width:width+'px',height:height+'px',left:canvas.offsetLeft+'px',top:canvas.offsetTop+'px' });
   layer.style.setProperty('--void-ui-unit',Math.min(width / canvas.width,height / canvas.height) + 'px');
  }
 }
 const observer = new ResizeObserver(resize);
 observer.observe(canvas);

 function focus(index, moveFocus) {
  if (!interactive.length) return;
  interactive[selected]?.node.classList.remove('void-ui-focused');
  selected = (index + interactive.length) % interactive.length;
  interactive[selected].node.classList.add('void-ui-focused');
  if (moveFocus) interactive[selected].control.focus({ preventScroll: true });
 }
 function notify(item,value) {
  values.set(item.id,value);
  activate(item.id,value);
 }
 function press(entry) {
  entry.node.classList.add('void-ui-pressed');
  setTimeout(() => entry.node.classList.remove('void-ui-pressed'),110);
  entry.control.click();
 }
 function adjust(entry, direction) {
  const { item,control } = entry;
  if (item.kind === 'slider') {
   if (direction > 0) control.stepUp();
   else control.stepDown();
   notify(item,control.valueAsNumber);
  } else if (item.kind === 'dropdown') {
   control.selectedIndex = (control.selectedIndex+direction+control.length) % control.length;
   notify(item,control.value);
  } else if (item.kind === 'toggle') {
   const value = direction > 0;
   control.setAttribute('aria-pressed',String(value));
   notify(item,value);
  }
 }

 return {
  show(screen, vars) {
   const restoreFocus = layer.contains(document.activeElement);
   const { ordered } = arrangeUI(screen?.items ?? [],canvas);
   controls = ordered.map(({item,box}) => {
    const node = createUIControl(item,vars,styleMap.get(item.style),values,data);
    positionUIBounds(node,box);
    return { item,node,control:item.kind === 'button' ? node : node.children[1] };
   });
   interactive = controls.filter(({item}) => isUIInteractive(item) && !item.disabled).sort((a,b) => a.item.order-b.item.order);
   interactive.forEach((entry,index) => {
    const {item,control} = entry;
    control.addEventListener('focus',() => focus(index,false));
    if (item.kind === 'button') control.addEventListener('click',() => { focus(index,false); activate(item.id); });
    if (item.kind === 'toggle') control.addEventListener('click',() => {
     const value = control.getAttribute('aria-pressed') !== 'true';
     control.setAttribute('aria-pressed',String(value));
     notify(item,value);
    });
    if (item.kind === 'slider') control.addEventListener('input',() => notify(item,control.valueAsNumber));
    if (item.kind === 'dropdown') control.addEventListener('change',() => notify(item,control.value));
   });
   layer.replaceChildren(...controls.map(({node}) => node));
   layer.classList.toggle('void-ui-paused',Boolean(screen?.pause));
   selected = 0;
   const menu = interactive.length && screen?.navigation !== false;
   if (menu) focus(0,restoreFocus);
   else if (restoreFocus) canvas.focus({ preventScroll: true });
   resize();
  },
  update(vars) { for (const {item,node} of controls) updateUIControl(node,item,vars,values,data); },
  navigate(input) {
   const horizontal = Number(input.pressed('menu-right'))-Number(input.pressed('menu-left'));
   if (input.pressed('menu-up')) focus(selected-1,true);
   else if (input.pressed('menu-down')) focus(selected+1,true);
   else if (horizontal && interactive[selected]) {
    const entry = interactive[selected];
    if (isUISetting(entry.item)) adjust(entry,horizontal);
    else focus(selected+horizontal,true);
   }
   if (input.pressed('menu-confirm') && interactive[selected]) {
    const entry = interactive[selected];
    if (entry.item.kind === 'dropdown') adjust(entry,1);
    else if (entry.item.kind !== 'slider') press(entry);
   }
  },
  get canNavigate() { return interactive.length > 0; },
  owns(node) { return node instanceof Node && layer.contains(node); },
  remove() { observer.disconnect(); layer.replaceChildren(); layer.classList.remove('void-ui-paused'); },
 };
}
