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
 if (!Array.isArray(project.inputActions) || !Array.isArray(project.uiScreens)) throw Error('Invalid UI screens or input actions');
 const idOK = id => typeof id === 'string' && /^[a-z0-9_-]+$/i.test(id);
 const nameOK = name => typeof name === 'string' && name.trim() && name.length <= 100;
 const actionIds = new Set(), screenIds = new Set(), itemIds = new Set();
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
   if (!idOK(item?.id) || itemIds.has(item.id) || !['button','label','bar'].includes(item.kind) ||
    !Object.hasOwn(uiAnchors,item.anchor) || ![item.x,item.y,item.w,item.h,item.size].every(Number.isFinite) ||
    Math.min(item.w,item.h,item.size) <= 0 || typeof item.text !== 'string' ||
    !/^#[0-9a-f]{6}$/i.test(item.color) || !/^#[0-9a-f]{6}$/i.test(item.background) ||
    (item.kind === 'button' && (!Number.isFinite(item.order) || !uiCommands.includes(item.command) || typeof item.target !== 'string')) ||
    (item.kind === 'bar' && (!Number.isFinite(item.max) || item.max <= 0 || typeof item.variable !== 'string'))) {
    throw Error('Invalid control in ' + screen.name);
   }
   itemIds.add(item.id);
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

function positionUIControl(node, item) {
 const [x,y] = uiAnchors[item.anchor];
 const px = value => 'calc(' + value + ' * var(--void-ui-unit))';
 node.style.left = 'calc(' + x*100 + '% + ' + px(item.x) + ')';
 node.style.top = 'calc(' + y*100 + '% + ' + px(item.y) + ')';
 node.style.transform = 'translate(' + -x*100 + '%, ' + -y*100 + '%)';
 node.style.width = px(item.w);
 node.style.height = px(item.h);
 node.style.fontSize = px(item.size);
 node.style.color = item.color;
 node.style.setProperty('--void-ui-color',item.background);
}

function updateUIControl(node, item, vars) {
 const content = uiControlContent(item,vars);
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

function createUIControl(item, vars) {
 const node = document.createElement(item.kind === 'button' ? 'button' : 'div');
 node.className = 'void-ui-control void-ui-' + item.kind;
 node.dataset.uiControl = item.id;
 if (item.kind === 'button') node.type = 'button';
 if (item.kind === 'bar') node.append(document.createElement('span'));
 positionUIControl(node,item);
 updateUIControl(node,item,vars);
 return node;
}

function createGameOverlay(layer, canvas, activate) {
 if (!layer) return null;
 let controls = [], buttons = [], selected = 0;
 function resize() {
  if (!canvas.width || !canvas.height) return;
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (width && height) {
   layer.style.width = width + 'px';
   layer.style.height = height + 'px';
   layer.style.setProperty('--void-ui-unit',Math.min(width / canvas.width,height / canvas.height) + 'px');
  }
 }
 const observer = new ResizeObserver(resize);
 observer.observe(canvas);

 function focus(index, moveFocus) {
  if (!buttons.length) return;
  buttons[selected]?.classList.remove('void-ui-focused');
  selected = (index + buttons.length) % buttons.length;
  buttons[selected].classList.add('void-ui-focused');
  if (moveFocus) buttons[selected].focus({ preventScroll: true });
 }

 return {
  show(screen, vars) {
   const restoreFocus = layer.contains(document.activeElement);
   const items = screen?.items ?? [];
   const ordered = items.filter(item => item.kind !== 'button')
    .concat(items.filter(item => item.kind === 'button').sort((a,b) => a.order-b.order));
   controls = ordered.map(item => ({ item,node:createUIControl(item,vars) }));
   buttons = controls.filter(({item}) => item.kind === 'button').map(({item,node},index) => {
    node.addEventListener('focus',() => focus(index,false));
    node.addEventListener('click',() => { focus(index,false); activate(item.id); });
    return node;
   });
   layer.replaceChildren(...controls.map(({node}) => node));
   layer.classList.toggle('void-ui-paused',Boolean(screen?.pause));
   selected = 0;
   const menu = buttons.length && screen?.navigation !== false;
   if (menu) focus(0,restoreFocus);
   else if (restoreFocus) canvas.focus({ preventScroll: true });
   resize();
  },
  update(vars) { for (const {item,node} of controls) updateUIControl(node,item,vars); },
  navigate(input) {
   if (input.pressed('menu-up') || input.pressed('menu-left')) focus(selected-1,true);
   else if (input.pressed('menu-down') || input.pressed('menu-right')) focus(selected+1,true);
   if (input.pressed('menu-confirm')) buttons[selected]?.click();
  },
  get canNavigate() { return buttons.length > 0; },
  owns(node) { return node instanceof Node && layer.contains(node); },
  remove() { observer.disconnect(); layer.replaceChildren(); layer.classList.remove('void-ui-paused'); },
 };
}
