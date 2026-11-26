/* PixiJS and Canvas share the same simulation and drawing data. */
let pixiPromise;

function loadPixi() {
 if (globalThis.PIXI?.Application) return Promise.resolve(globalThis.PIXI);
 if (pixiPromise) return pixiPromise;

 pixiPromise = new Promise((resolve, reject) => {
  const source = document.getElementById('pixi-source')?.textContent.trim();
  if (!source) {
   reject(new Error('Bundled PixiJS is unavailable'));
   return;
  }

  const bytes = Uint8Array.from(atob(source), character => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
  const script = document.createElement('script');
  const cleanup = () => {
   URL.revokeObjectURL(url);
   script.remove();
  };
  script.src = url;
  script.onload = () => {
   cleanup();
   if (globalThis.PIXI?.Application) resolve(globalThis.PIXI);
   else reject(new Error('Bundled PixiJS did not initialize'));
  };
  script.onerror = () => {
   cleanup();
   reject(new Error('Could not load bundled PixiJS'));
  };
  document.head.append(script);
 }).catch(error => {
  pixiPromise = undefined;
  throw error;
 });

 return pixiPromise;
}

function createPixiView(canvas, { report = () => {} } = {}) {
 const entries = new Map(), textures = new Map(), images = new Map(), particleSprites = [[], []];
 const savedStyle = canvas.getAttribute('style');
 let renderer, stage, worldStage, objectsStage, particleStages, hudStage, tileStages, tileTextures = [], lastTiles, host, lastFrame;
 let closed = false, pending = false, engine = 'Canvas 2D';

 function restoreCanvas() {
  if (host?.parentNode) {
   host.parentNode.insertBefore(canvas, host);
   host.remove();
  }
  if (savedStyle === null) canvas.removeAttribute('style');
  else canvas.setAttribute('style', savedStyle);
  host = undefined;
 }

 function teardown() {
  restoreCanvas();
  stage?.destroy({ children: true });
  stage = worldStage = objectsStage = particleStages = hudStage = tileStages = lastTiles = undefined;
  for (const pool of particleSprites) pool.length = 0;
  for (const texture of tileTextures) texture.destroy(true);
  tileTextures = [];
  entries.clear();
  for (const texture of textures.values()) texture.destroy(true);
  textures.clear();
  images.clear();
  try { renderer?.destroy(); } catch { /* A failed init may leave a partial renderer. */ }
  renderer = undefined;
  engine = 'Canvas 2D';
 }

 async function enable(preference) {
  if (closed || pending || stage) return false;
  pending = true;
  try {
   const pixi = globalThis.PIXI;
   const webgpu = preference === 'webgpu';
   const supported = webgpu ? await pixi.isWebGPUSupported() : pixi.isWebGLSupported(true);
   if (!supported) return false;
   const Renderer = webgpu ? pixi.WebGPURenderer : pixi.WebGLRenderer;
   renderer = new Renderer();
   await renderer.init({
    width: canvas.width, height: canvas.height, resolution: 1,
    antialias: false, backgroundAlpha: 1, failIfMajorPerformanceCaveat: true,
   });
   if (closed || !canvas.parentNode) {
    teardown();
    return false;
   }

   stage = new pixi.Container();
   worldStage = new pixi.Container();
   hudStage = new pixi.Container();
   particleStages = [new pixi.Container(), new pixi.Container()];
   stage.addChild(worldStage, hudStage, particleStages[1]);
   objectsStage = new pixi.Container();
   tileStages = [new pixi.Container(), new pixi.Container()];
   worldStage.addChild(tileStages[0], objectsStage, particleStages[0], tileStages[1]);
   host = document.createElement('div');
   host.style.cssText = 'display:grid;place-items:center;position:relative;flex:none;max-width:100%;max-height:65vh';
   canvas.parentNode.insertBefore(host, canvas);
   host.append(renderer.canvas, canvas);
   renderer.canvas.style.cssText = 'grid-area:1/1;display:block;pointer-events:none;image-rendering:pixelated';
   canvas.style.cssText += ';grid-area:1/1;position:relative;z-index:1;opacity:0';
   renderer.canvas.addEventListener('webglcontextlost', () => {
    teardown();
    report('Canvas 2D · WebGL context lost');
   }, { once: true });
   engine = webgpu ? 'WebGPU' : 'WebGL';
   if (lastFrame && !render(...lastFrame)) return false;
   report('PixiJS · ' + engine);
   return true;
  } catch (error) {
   teardown();
   if (!closed) report('Canvas 2D · ' + error.message);
   return false;
  } finally {
   pending = false;
  }
 }

 function textureFor(type, object, key) {
  if (textures.has(key)) return textures.get(key);
  if (type.image) {
   let image = images.get(type.image);
   if (!image) {
    image = new Image();
    image.src = type.image;
    images.set(type.image, image);
   }
   if (!image.complete) return null;
  }

  const bitmap = document.createElement('canvas');
  bitmap.width = Math.max(1, Math.min(4096, Math.ceil(object.w)));
  bitmap.height = Math.max(1, Math.min(4096, Math.ceil(object.h)));
  const context = bitmap.getContext('2d');
  context.translate(bitmap.width / 2, bitmap.height / 2);
  drawObject(context, type, { ...object, w: bitmap.width, h: bitmap.height }, images);
  const texture = PIXI.Texture.from(bitmap);
  texture.source.scaleMode = 'nearest';
  textures.set(key, texture);
  return texture;
 }

 function renderParticles(particles, displayedTextures) {
  const sizes = [0, 0];
  for (const particle of particles) {
   if (particle.size <= 0 || particle.alpha <= 0) continue;
   const { art, pose } = particle;
   const frame = pose?.frame ?? particle.frame;
   let texture = PIXI.Texture.WHITE;
   if (art) {
    const key = 'particle:' + art.id + ':' + frame;
    texture = textureFor(art, { w: art.w || 1, h: art.h || 1, animFrame: frame }, key);
    if (!texture) continue;
    displayedTextures.add(key);
   }
   const group = Number(particle.screenSpace);
   const pool = particleSprites[group];
   let sprite = pool[sizes[group]++];
   if (!sprite) {
    sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(.5);
    particleStages[group].addChild(sprite);
    pool.push(sprite);
   }
   const [w, h] = particleDrawSize(particle);
   sprite.visible = true;
   sprite.texture = texture;
   sprite.tint = art ? 0xffffff : particle.tint;
   sprite.blendMode = particle.settings.additive ? 'add' : 'normal';
   sprite.position.set(particle.x + (pose?.x ?? 0), particle.y + (pose?.y ?? 0));
   sprite.scale.set(w / texture.width * (pose?.scaleX ?? 1), h / texture.height * (pose?.scaleY ?? 1));
   sprite.rotation = (particle.angle + (pose?.angle ?? 0)) * Math.PI / 180;
   sprite.alpha = sceneClamp(particle.alpha * (pose?.opacity ?? 1), 0, 1);
  }
  for (let group = 0; group < particleSprites.length; group++) {
   for (let index = sizes[group]; index < particleSprites[group].length; index++) particleSprites[group][index].visible = false;
  }
 }

 function render(layout, objects, types, artwork, camera, particles) {
  lastFrame = [layout, objects, types, artwork, camera, particles];
  if (!stage) return false;
  try {
   if (renderer.screen.width !== camera.width || renderer.screen.height !== camera.height) {
    renderer.resize(camera.width, camera.height);
   }
   worldStage.scale.set(camera.zoom);
   worldStage.position.set(camera.shakeX - camera.left * camera.zoom, camera.shakeY - camera.top * camera.zoom);
   Object.assign(renderer.canvas.style, {
    width: canvas.style.width || canvas.width + 'px',
    height: canvas.style.height || canvas.height + 'px',
    maxWidth: getComputedStyle(canvas).maxWidth,
    maxHeight: getComputedStyle(canvas).maxHeight,
   });
   renderer.background.color = layout.background || '#172332';
   if (artwork !== lastTiles) {
    for (const group of tileStages) for (const sprite of group.removeChildren()) sprite.destroy();
    for (const texture of tileTextures) texture.destroy(true);
    tileTextures = [];
    artwork?.forEach((canvas, index) => {
     if (!canvas) return;
     const texture = PIXI.Texture.from(canvas, true);
     texture.source.scaleMode = 'nearest';
     tileTextures.push(texture);
     tileStages[index].addChild(new PIXI.Sprite(texture));
    });
    lastTiles = artwork;
   }
   const drawn = new Set(), used = new Set();
   let worldDepth = 0, hudDepth = 0;
   for (const object of tileObjectOrder(layout, objects)) {
    const type = types[object.type];
    if (object.dead || !object.visible || !type) continue;
    const key = JSON.stringify([type.id, object.w, object.h, object.animFrame || 0,
     type.kind === 'text' ? (object.text ?? type.text ?? '') : '']);
    const texture = textureFor(type, object, key);
    if (!texture) continue;

    let entry = entries.get(object.id);
    if (!entry) {
     const sprite = new PIXI.Sprite(texture);
     sprite.anchor.set(0.5);
     (type.screenSpace ? hudStage : objectsStage).addChild(sprite);
     entry = { sprite, key };
     entries.set(object.id, entry);
    } else if (entry.key !== key) {
     entry.key = key;
     entry.sprite.texture = texture;
    }

    const { sprite } = entry;
    const pose = object.pose ?? {};
    sprite.position.set(object.x + object.w / 2 + (pose.x ?? 0), object.y + object.h / 2 + (pose.y ?? 0));
    sprite.scale.set(object.w / texture.width * (pose.scaleX ?? 1), object.h / texture.height * (pose.scaleY ?? 1));
    sprite.rotation = ((object.angle || 0) + (pose.angle ?? 0)) * Math.PI / 180;
    sprite.alpha = Math.max(0, Math.min(1, (object.opacity ?? 1) * (pose.opacity ?? 1)));
    if (type.screenSpace) hudStage.setChildIndex(sprite, hudDepth++);
    else objectsStage.setChildIndex(sprite, worldDepth++);
    drawn.add(object.id);
    used.add(key);
   }

   for (const [id, { sprite }] of entries) {
    if (drawn.has(id)) continue;
    sprite.destroy();
    entries.delete(id);
   }
   renderParticles(particles, used);
   if (textures.size > 256) {
    for (const [key, texture] of textures) {
     if (used.has(key)) continue;
     texture.destroy(true);
     textures.delete(key);
    }
   }
   renderer.render({ container: stage });
   return true;
  } catch (error) {
   teardown();
   report('Canvas 2D · ' + error.message);
   return false;
  }
 }

 return {
  enable, render,
  close() {
   closed = true;
   if (!pending) teardown();
  },
  get engine() { return engine; },
 };
}

/* VOID Studio game runtime. */
function createRuntime(project, canvas, hooks={}) {
 const p=normalizeProjectBehaviors(structuredClone(project)),ctx=canvas.getContext('2d'),keys=new Set(),pressed=new Set(),images=new Map(),errors=new Set();
 let objects=[],vars={},layout=null,time=0,dt=0,first=true,uid=0,frame=0,raf=0,running=false,last=0,nextLayout=null,previousPairs=new Set(),timers=new Map(),previousTimers=new Map(),changed=false,paused=false;
 const debugHooks = hooks.debugger;
 let frameWork, stopPoint, stepRule, pausedAt, profile;
 let excludedTime = 0;
 const clock = () => performance.now() - excludedTime;
 const renderer=createPixiView(canvas,{report:m=>hooks.renderer?.(m)}); const types=Object.fromEntries(p.types.map(t=>[t.id,t])); const byName=Object.fromEntries(p.types.map(t=>[t.name,t.id]));
 function report(e){let msg=String(e.message||e);if(!errors.has(msg)){errors.add(msg);hooks.error?.(msg)}}
 const animationPlans=new Map(p.types.map(type=>[type.id,planAnimationMachine(type)]).filter(([,plan])=>plan));
 const sheets = new Map(p.behaviorSheets.map(sheet => [sheet.id, sheet]));
 const extensions = extensionRegistry(p.extensions);
 const audio = createGameAudio(p.audioClips,p.audioMixer,report);
 const input = createNamedInput(p), uiScreens = new Map((p.uiScreens ?? []).map(screen => [screen.id,screen]));
 const uiActivations = new Set(), uiChanges = new Set(), uiValues = new Map(), uiQueue = [];
 let uiScreen, openedUI, nextUIOpening;
 const studioData = createStudioData(p);
 const overlay = createGameOverlay(hooks.uiLayer,canvas,(id,value) => uiQueue.push({ screen:uiScreen,id,value }),p.uiStyles,studioData);
 const atlases = new Map((p.tilesets ?? []).map(atlas => [atlas.id, atlas]));
 const enums = Object.fromEntries((p.enums ?? []).map(enumType => [enumType.name,
  Object.fromEntries(enumType.values.map(value => [value.name, tileEnumToken(enumType, value)]))]));
 let camera;
 const particles = createParticleField(types);
 let tileSolids = new Set();
 let readTileArtwork = () => null;
 const behaviorPlans = new Map(p.types.map(type => {
  const attached = new Map(type.behaviors.map(behavior => [behavior.id, behavior.settings]));
  const builtIn = Object.entries(BUILT_IN_BEHAVIORS)
   .filter(([id, definition]) => attached.has(id) && definition.step)
   .map(([id, definition]) => ({ definition, settings: behaviorSettings(definition.fields, attached.get(id)) }));
  const custom = [...attached].filter(([id]) => sheets.has(id)).map(([id, settings]) => {
   const sheet = sheets.get(id);
   return { sheet, settings: behaviorSettings(customBehaviorFields(sheet), settings) };
  });
  const emitter = attached.has('particles') ? behaviorSettings(BUILT_IN_BEHAVIORS.particles.fields, attached.get('particles')) : null;
  return [type.id, { solid: attached.has('solid'), pathfinding: attached.has('pathfinding'), emitter, builtIn, custom }];
 }));
 const instanceClocks = new WeakMap();
 let currentBehaviorPairs, previousBehaviorPairs = new Set();
 let solids = [];

 function make(type, props = {}) {
  const object = {
   x: 0, y: 0, w: type.w || 32, h: type.h || 32, angle: 0, opacity: 1,
   text: type.text || '', vx: 0, vy: 0, ground: false, dead: false, visible: true,
   ...props, id: ++uid, type: type.id, vars: structuredClone({ ...type.vars, ...studioData.rows.get(type.dataRow), ...props.vars }),
  };
  const machine=animationPlans.get(type.id);
  if (machine) enterAnimationState(object,machine.initial,frame,'Initial state');
  else if (type.animator?.autoplay) playSpriteClip(object, type, type.animator.autoplay);
  if (behaviorPlans.get(type.id).custom.length) {
   instanceClocks.set(object, { created: true, startedAt: time, previousTimers: new Map() });
  }
  return object;
 }
 function enter(id) {
  layout = p.layouts.find(item => item.id === id) || p.layouts[0];
  camera = createSceneCamera(layout);
  canvas.width = camera.view.width;
  canvas.height = camera.view.height;
  fitFullscreen();
  time = 0;
  triggerRecords=new WeakMap();
  tileSolids = tileSolidCells(layout.tilemap, atlases);
  readTileArtwork = createTileArtwork(layout, atlases, images);
  objects = expandedLayoutInstances(p, layout).filter(instance => types[instance.type]).map(instance => make(types[instance.type], instance));
  camera.place(0, objects, true);
  updateMouseWorld();
  particles.clear();
  first = true;
  previousPairs.clear();
  previousBehaviorPairs.clear();
  timers.clear();
  previousTimers.clear();
  changed = true;
  nextLayout = null;
  uiQueue.length = 0;
  showUI(layout.uiScreen,true);
  hooks.layout?.(layout.name);
 }
 function showUI(id, force = false) {
  const screen = uiScreens.get(id);
  if (id && !screen && !force) { report(Error('Unknown UI screen ' + id)); return; }
  if (!force && screen === uiScreen) return;
  uiScreen = screen;
  nextUIOpening = screen?.id;
  overlay?.show(screen,vars);
 }
 function canGoBack() {
  return uiScreen && uiScreen.id !== layout.uiScreen && (uiScreen.pause || uiScreen.navigation !== false);
 }
 function readUIInput() {
  let pads = [];
  try { pads = Array.from(navigator.getGamepads?.() ?? []); } catch {}
  input.update(keys,pressed,pads);
  uiActivations.clear();
  uiChanges.clear();
  const resumed = canGoBack() && input.pressed('menu-back');
  if (resumed) showUI(layout.uiScreen);
  if (uiScreen?.navigation !== false) overlay?.navigate(input);
  for (const {screen,id,value} of uiQueue.splice(0)) {
   if (screen !== uiScreen) continue;
   const item = screen?.items.find(control => control.id === id && isUIInteractive(control));
   if (!item || item.disabled) continue;
   if (isUISetting(item)) {
    if (uiSettingValue(item,vars,uiValues) === value) continue;
    if (Object.hasOwn(vars,item.variable)) vars[item.variable] = value;
    else uiValues.set(item.id,value);
    uiChanges.add(id);
    continue;
   }
   uiActivations.add(id);
   if (item.command === 'layout' && p.layouts.some(candidate => candidate.id === item.target)) nextLayout = item.target;
   if (item.command === 'restart') nextLayout = layout.id;
   if (item.command === 'show') showUI(item.target);
   if (item.command === 'restore') showUI(layout.uiScreen);
  }
  openedUI = nextUIOpening;
  nextUIOpening = undefined;
  return resumed;
 }
 const overlap=(a,b)=>a!==b&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
 const all=id=>objects.filter(o=>!o.dead&&o.type===id);
 const pick=(scope,id,owner)=> (scope[id] || (id===SELF_TARGET ? (owner ? [owner.object] : []) : all(id))).filter(o=>!o.dead);
 const narrow=(s,id,items)=>({...s,[id]:items});
 const pairKey=(a,b)=>Math.min(a.id,b.id)+':'+Math.max(a.id,b.id);
 const norm=gameKeyName;
 const keyDown=k=>keys.has(norm(k));
 const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
 const functions={dataField:(row,name)=>studioData.rows.get(row)?.[name]??0,tileHasTag, tileColumn, tileRow, audioLevel:bus=>audio.volume(bus), min:Math.min,max:Math.max,abs:Math.abs,floor:Math.floor,ceil:Math.ceil,round:Math.round,sqrt:Math.sqrt,sin:Math.sin,cos:Math.cos,random:(a=1,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a),clamp,len:x=>Array.isArray(x)?x.length:typeof x==='object'&&x?Object.keys(x).length:String(x).length,at:(x,k)=>x!=null&&Object.hasOwn(x,k)?x[k]:0,str:String,num:Number,lerp:(a,b,t)=>a+(b-a)*t};
 const expressionEnvironment = { read: resolve, functions };
 const expressionCache = new Map();
 function interpretExpression(text, context) {
  if (!expressionCache.has(text)) expressionCache.set(text, bindEventExpression(parseEventExpression(text), expressionEnvironment));
  return expressionCache.get(text)(context);
 }

 const rowPlans = new WeakMap();
 const proposedProgram = hooks.compiledEvents;
 const definitions=[...projectEventRows(p)];
 const compiledRows = proposedProgram ? definitions : [];
 const program = proposedProgram?.format===2 && proposedProgram.shape.length === compiledRows.length &&
  compiledRows.every((row,index) => proposedProgram.shape[index] === eventRowShape(row)) ? proposedProgram : null;
 if (program) compiledRows.forEach(({event},index) => rowPlans.set(event, program.rows[index]));
 const execution = program ? 'Compiled' : 'Interpreted';
 const callStack = [];
 const layoutSource = level => ({ kind:'layout',id:level.id,name:level.name,events:level.events });
 const sharedSheets=new Map(eventSheetSources(p).filter(source=>source.kind==='shared').map(source=>[source.id,source]));
 const preventGameContextMenu=event=>event.preventDefault();
 const needsRightClick=definitions.some(({event})=>event.conditions.some(condition=>condition.kind==='mousePressed' && Number(condition.args?.button)===2));
 const mouseAliases={X:'x',Y:'y',ScreenX:'screenX',ScreenY:'screenY'};
 const functionDefs=new Map(definitions.filter(({event,source})=>event.functionName && source.kind!=='behavior')
  .map(({event,source})=>[event.functionName,{event,source}]));
 const groupDefaults=new Map(), groupOverrides=new Map();
 let triggerRecords=new WeakMap();
 function registerGroups(events) {
  for (const event of events) {
   if (event.group) groupDefaults.set(event.id,!event.disabled);
   registerGroups(event.children??[]);
  }
 }
 for (const source of eventSheetSources(p)) registerGroups(source.events);
 const groupActive=id=>groupOverrides.get(id)??groupDefaults.get(id)??false;
 function resolve(path,c){let [a,...rest]=path;if(a==='dt')return dt;if(a==='time')return time;if(a==='true')return true;if(a==='false')return false;if(a==='pi')return Math.PI;if(a==='index')return c.index||0;if(a==='count')return objects.filter(o=>!o.dead).length;let v;let local=callStack.at(-1);if(c.parameters&&Object.hasOwn(c.parameters,a))v=c.parameters[a];else if(local&&Object.hasOwn(local.params,a))v=local.params[a];else if(a==='global')v=vars;else if(a==='Data'&&Object.hasOwn(studioData.root,rest[0]))v=studioData.root;else if(a==='Self'||a==='self')v=c.owner?.object??c.target;else if(a==='Target'&&c.owner)v=c.target;else if(a==='Settings'&&c.owner)v=c.owner.settings;else if(a==='Mouse'){v=mouse;if(rest.length&&Object.hasOwn(mouseAliases,rest[0]))rest[0]=mouseAliases[rest[0]];}else if(a==='Camera'&&rest.length&&!Object.hasOwn(byName,a))v=camera.view;else if(a==='Enums'&&rest.length&&Object.keys(enums).length)v=enums;else if(Object.hasOwn(byName,a))v=pick(c.scope,byName[a])[0];else if(Object.hasOwn(vars,a))v=vars[a];else throw Error('Unknown name '+a);for(let k of rest){if(v==null)return 0;if(Object.hasOwn(v,k))v=v[k];else if(v.vars&&Object.hasOwn(v.vars,k))v=v.vars[k];else if(k==='width')v=v.w;else if(k==='height')v=v.h;else return 0}return v??0}
 const attachedSheets = [...behaviorPlans.values()].flatMap(plan => plan.custom.map(({ sheet }) => sheet));
 function containsCollision(events) {
  return events.some(event => event.conditions.some(condition => condition.kind === 'collision') ||
   containsCollision(event.children || []));
 }
 const checksBehaviorCollisions = attachedSheets.some(sheet => containsCollision(sheet.events)) ||
  (attachedSheets.length > 0 && containsCollision([...functionDefs.values()].map(definition => definition.event)));

 function matchingPair(kind, a, b, owner) {
  if (kind === 'overlap') return overlap(a, b);
  const key = pairKey(a, b);
  if (owner) return currentBehaviorPairs.has(key) && !previousBehaviorPairs.has(key);
  return overlap(a, b) && !previousPairs.has(key);
 }

 function expr(value, scope, target, index = 0, owner, parameters) {
  const text = String(value ?? '0');
  const context = { scope, target, index, owner, parameters };
  const compiled = program?.expressions.get(text);
  return compiled ? compiled(expressionEnvironment, context) : interpretExpression(text, context);
 }
 function extensionBlock(kind, expected) {
  const block = extensions.get(kind)?.block;
  if (block?.kind !== expected) throw Error('Unavailable extension ' + expected + ' ' + kind);
  return block;
 }
 function extensionInputs(block, args, scope, object, index, owner) {
  return Object.fromEntries(block.parameters.map(({ name, default: fallback }) =>
   [name, expr(args[name] ?? fallback, scope, object, index, owner)]));
 }
 function extensionCondition(condition, args, scope, index, owner) {
  const block = extensionBlock(condition.kind, 'condition');
  const matches = pick(scope, args.object, owner).filter(object => {
   const inputs = extensionInputs(block, args, scope, object, index, owner);
   const value = expr(block.expression, scope, object, index, owner && { ...owner, object }, inputs);
   return Boolean(value) !== Boolean(condition.invert);
  });
  return matches.length ? [narrow(scope, args.object, matches)] : [];
 }
 function extensionAction(action, args, scope, index, owner) {
  const block = extensionBlock(action.kind, 'action');
  for (const object of pick(scope, args.object, owner)) {
   const inputs = extensionInputs(block, args, scope, object, index, owner);
   const context = owner && { ...owner, object };
   for (const op of block.operations) {
    writeInstanceProperty(object, op.property, expr(op.value, scope, object, index, context, inputs), op.operation === 'add');
   }
  }
 }
 function writeInstanceProperty(object, property, value, add) {
  if (['x','y','w','h','angle','opacity','vx','vy'].includes(property)) {
   object[property] = add ? object[property] + Number(value) : Number(value);
  } else if (!add && property === 'visible') object.visible = Boolean(value);
  else if (!add && property === 'text') object.text = String(value);
  else object.vars[property] = add ? (object.vars[property] ?? 0) + value : value;
 }
 function tileHasTag(layerName, x, y, tag) {
  const tile = tileAtWorld(layout.tilemap, layerName, x, y);
  if (!tile || !tag) return false;
  const metadata = tileMeta(atlases.get(tile.atlas) ?? {}, tile.column, tile.row);
  return tile.terrain === tag || metadata?.terrain === tag || (metadata?.tags ?? []).includes(tag);
 }
 function tileColumn(x, y) { return layout.tilemap ? tileCellAt(layout.tilemap, x, y)[0] : -1; }
 function tileRow(x, y) { return layout.tilemap ? tileCellAt(layout.tilemap, x, y)[1] : -1; }
 let mouse={x:0,y:0,screenX:0,screenY:0,down:false,clicked:false};
 const mouseButtons=new Set();
 let pointer;
 function updateMouseWorld() {
  if (!pointer) return;
  const view = camera.view;
  mouse.screenX = pointer.x * view.width;
  mouse.screenY = pointer.y * view.height;
  mouse.x = view.left + (mouse.screenX - view.shakeX) / view.zoom;
  mouse.y = view.top + (mouse.screenY - view.shakeY) / view.zoom;
 }
 function navigate(object, x, y, restart) {
  if (!behaviorPlans.get(object.type).pathfinding) throw Error('Attach Tilemap Pathfinding before navigating');
  const map = layout.tilemap;
  const destination = map && Number.isFinite(x) && Number.isFinite(y) ? tileCellAt(map, x, y).join(',') : 'unreachable';
  if (!restart && object.navigation?.destination === destination) return;
  const obstacles = objects.filter(item => behaviorPlans.get(item.type).solid);
  const route = findTileRoute(map, tileSolids, obstacles, object, x, y);
  object.navigation = { destination, route, index: 0, stalled: 0, status: route ? 'moving' : 'failed', eventFrame: frame + 1 };
 }
 function navigationCondition(kind, object) {
  const state = object.navigation;
  if (kind === 'navigating') return state?.status === 'moving';
  return Boolean(state?.eventFrame === frame && state.status === (kind === 'navArrived' ? 'arrived' : 'failed'));
 }
 function condition(c,s,eventId,index,owner){let a=c.args||{},id=a.object,other=a.other,ok=false,out=[];const val=(e,o)=>expr(e,s,o,index,owner);if(typeof c.kind==='string'&&c.kind.startsWith('extension/'))return extensionCondition(c,a,s,index,owner);switch(c.kind){case 'start':ok=first;break;case 'created':ok=owner?.created??false;break;case 'tick':ok=true;break;case 'groupActive':ok=groupActive(a.group);break;case 'keyDown':ok=keyDown(a.key);break;case 'keyPressed':ok=pressed.has(norm(a.key));break;case 'inputDown':ok=input.down(a.input);break;case 'inputPressed':ok=input.pressed(a.input);break;case 'uiActivated':ok=uiActivations.has(a.control);break;case 'uiChanged':ok=uiChanges.has(a.control);break;case 'uiOpened':ok=Boolean(openedUI&&openedUI===a.screen);break;case 'mousePressed':ok=a.button==null||a.button===''?mouse.clicked:mouseButtons.has(Number(a.button));break;case 'compare':ok=!!val(a.expr);break;case 'every':ok=timerFired(eventId, Number(val(a.seconds)) || 1, owner);break;case 'exists':ok=pick(s,id,owner).length>0;break;case 'navigating':case 'navArrived':case 'navFailed':{const matches=pick(s,id,owner).filter(o=>navigationCondition(c.kind,o)!==Boolean(c.invert));return matches.length?[narrow(s,id,matches)]:[]}case 'tileTag':{const matches=pick(s,id,owner).filter(o=>tileHasTag(a.layer,o.x+o.w/2,o.y+o.h+1e-6,a.tag)!==Boolean(c.invert));return matches.length?[narrow(s,id,matches)]:[]}case 'animationState':case 'animationStateEntered':{const matches=pick(s,id,owner).filter(o=>{const active=matchAnimationState(o,animationPlans.get(o.type),a.state)&&(c.kind==='animationState'||o.animationState.signalFrame===frame);return active!==Boolean(c.invert)});return matches.length?[narrow(s,id,matches)]:[]}case 'clipPlaying':case 'clipFinished':{const matches=pick(s,id,owner).filter(o=>{const state=o.animation;const active=c.kind==='clipPlaying'?state?.playing:state?.finished;return Boolean(active&&(!a.clip||(state.clip.name===a.clip||state.clip.id===a.clip)))!==Boolean(c.invert)});return matches.length?[narrow(s,id,matches)]:[]}case 'filter':{let matches=pick(s,id,owner).filter(o=>!!val(a.expr,o)!==!!c.invert);return matches.length?[narrow(s,id,matches)]:[]}case 'overlap':case 'collision':{if(c.invert){let m=pick(s,id,owner).filter(o=>!pick(s,other,owner).some(b=>matchingPair(c.kind,o,b,owner)));return m.length?[narrow(s,id,m)]:[]}for(let o of pick(s,id,owner))for(let b of pick(s,other,owner)){if(!matchingPair(c.kind,o,b,owner))continue;let n=narrow(s,id,[o]);n=narrow(n,other,id===other?[o,b]:[b]);out.push(n)}return out}default:throw Error('Unknown condition '+c.kind)}return ok!==!!c.invert?[s]:[]}
 function* action(a,s,index,owner,depth,parents,breakpoint){if(breakpoint)yield breakpoint;let q=a.args||{},id=q.object,ev=(x,o)=>expr(x,s,o,index,owner);if(typeof a.kind==='string'&&a.kind.startsWith('extension/')){extensionAction(a,q,s,index,owner);return}switch(a.kind){case 'call':{let def=functionDefs.get(q.name);if(!def)throw Error('Unknown visual function '+q.name);if(callStack.length>=32)throw Error('Function recursion limit');let names=def.event.params||[],values=JSON.parse(q.values||'[]');if(!Array.isArray(values)||values.length!==names.length)throw Error('Expected '+names.length+' argument expressions');let params=Object.fromEntries(names.map((n,i)=>[n,ev(values[i])]));let local={params,result:null,returned:false,name:q.name};callStack.push(local);try{yield* runSheet([def.event],def.source,s,owner,depth+1,parents,index,true)}finally{callStack.pop()}if(q.result)vars[q.result]=local.result;break}case 'return':{let local=callStack.at(-1);if(!local)throw Error('Return outside function');local.result=ev(q.value);local.returned=true;break}case 'setLocal':{let local=callStack.at(-1);if(!local)throw Error('Local variable outside function');local.params[q.name]=ev(q.value);break}case 'setEntry':{let a=vars[q.name],k=ev(q.key);if(!a||typeof a!=='object'||['__proto__','prototype','constructor'].includes(String(k)))throw Error('Invalid collection or key');if(Array.isArray(a)&&(!Number.isInteger(k)||k<0||k>100000))throw Error('Invalid array index');a[k]=ev(q.value);break}case 'setGroupActive':if(groupDefaults.has(q.group))groupOverrides.set(q.group,q.active!=='false');break;case 'setDataRow':if(studioData.rows.has(q.row))vars[q.name]=q.row;break;case 'setGlobalFromData':if(studioData.fields.has(q.field))vars[q.name]=studioData.fields.get(q.field);break;case 'setGlobal':vars[q.name]=ev(q.value);break;case 'addGlobal':vars[q.name]=(vars[q.name]??0)+ev(q.value);break;case 'create':if(types[id])objects.push(make(types[id],{x:Number(ev(q.x)),y:Number(ev(q.y))}));break;case 'layout':nextLayout=q.layout;break;case 'restart':nextLayout=layout.id;break;case 'showUI':showUI(q.screen);break;case 'restoreUI':showUI(layout.uiScreen);break;case 'cameraFollow':{const targets=pick(s,id,owner);if(targets.length)camera.follow(targets[0]);break}case 'cameraPosition':camera.position(Number(ev(q.x)),Number(ev(q.y)));break;case 'cameraZoom':camera.zoom(Number(ev(q.zoom)));break;case 'cameraShake':camera.shake(Number(ev(q.strength)),Number(ev(q.duration)));break;case 'log':hooks.log?.(String(ev(q.value)));break;case 'sound':audio.tone(Number(ev(q.frequency)),Number(ev(q.duration)));break;case 'audioVolume':audio.setVolume('master',Number(ev(q.value)));break;case 'playAudio':audio.play(q.clip,{bus:q.bus,tag:q.tag?.trim(),volume:Number(ev(q.volume??'100')),loop:Boolean(ev(q.loop??'false'))});break;case 'stopAudio':audio.stop(q.tag?.trim());break;case 'fadeAudio':audio.fade(q.tag?.trim(),Number(ev(q.value)),Number(ev(q.duration)));break;case 'audioBusVolume':audio.setVolume(q.bus,Number(ev(q.value)),Number(ev(q.duration??'0')));break;case 'fullscreen':setGameFullscreen(q.name);break;default:for(let o of pick(s,id,owner)){switch(a.kind){case 'emitParticles':{const settings=behaviorPlans.get(o.type).emitter;if(!settings)throw Error('Attach Particle Emitter before emitting');particles.emit(o,settings,Number(ev(q.count,o)));break}case 'navigate':navigate(o,Number(ev(q.x,o)),Number(ev(q.y,o)),Boolean(ev(q.restart??'false',o)));break;case 'aimAt':{const dx=Number(ev(q.x,o))-o.x-o.w/2,dy=Number(ev(q.y,o))-o.y-o.h/2;if(Math.hypot(dx,dy)>0)o.angle=Math.atan2(dy,dx)*180/Math.PI;break}case 'spawn':if(types[q.child])objects.push(make(types[q.child],{x:Number(ev(q.x,o)),y:Number(ev(q.y,o))}));break;case 'stopNavigation':delete o.navigation;break;case 'moveSolid':moveAxis(o,Number(ev(q.x,o)),Number(ev(q.y,o)),solids);break;case 'destroy':o.dead=true;break;case 'setAnimationState':{if(types[o.type].animator?.machine?.enabled===false)break;const state=resolveAnimationState(animationPlans.get(o.type),q.state);if(state)enterAnimationState(o,state,frame,'Event sheet',Boolean(ev(q.restart??'false',o)));else report(Error('Unknown animation state '+q.state+' for '+types[o.type].name));break}case 'playClip':if(playSpriteClip(o,types[o.type],q.clip,Boolean(ev(q.restart??'false',o))))useManualAnimation(o,'Play clip');break;case 'stopClip':if(o.animation){o.animation.playing=false;o.animation.stopped=true;useManualAnimation(o,'Stop clip');}break;case 'animation':if(o.animation){o.animation.playing=false;o.animation.stopped=true;delete o.pose.frame}useManualAnimation(o,'Set animation frame');o.animTime=Number(ev(q.value,o))/(types[o.type].sheet?.fps||1);o.animFrame=Math.floor(Number(ev(q.value,o)));break;case 'damage':o.vars.Health=Math.max(0,(Number(o.vars.Health)||0)-Math.max(0,Number(ev(q.value,o))));break;case 'heal':o.vars.Health=Math.min(Number(o.vars.MaxHealth)||100,(Number(o.vars.Health)||0)+Math.max(0,Number(ev(q.value,o))));break;case 'set':case 'add':writeInstanceProperty(o,q.property,ev(q.value,o),a.kind==='add');break;case 'position':o.x=Number(ev(q.x,o));o.y=Number(ev(q.y,o));break;case 'jump':if(o.ground){o.vy=-Math.abs(Number(ev(q.value,o)));o.ground=false}break;case 'text':o.text=String(ev(q.value,o));break;case 'instance':o.vars[q.name]=ev(q.value,o);break}}}}
 function executionPoint(event, source, scope, owner, depth, parents, conditions, index, actionIndex, breakpoint = false) {
  const target = event.actions[actionIndex ?? 0]?.args?.object;
  const selected = new Set(Object.values(scope).flat().filter(object => !object.dead).map(object => object.id));
  if (target) for (const object of pick(scope, target, owner)) selected.add(object.id);
  if (owner && !owner.object.dead) selected.add(owner.object.id);
  return {
   source, id: event.id, depth, parents, conditions: conditions ? [...conditions] : [], index, actionIndex, breakpoint,
   selected: [...selected], calls: callStack.map(entry => entry.name), callDepth: callStack.length, frame,
  };
 }

 function mergeSelections(matches) {
  const seen = new Set();
  return matches.filter(scope => {
   const key = JSON.stringify(Object.keys(scope).sort().map(id => [id, scope[id].map(object => object.id).sort()]));
   if (seen.has(key)) return false;
   seen.add(key);
   return true;
  });
 }

 function allowTrigger(event,owner,scope) {
  let events=triggerRecords.get(owner?.object??event);
  if (!events) triggerRecords.set(owner?.object??event,events=new WeakMap());
  let record=events.get(event);
  if (record?.frame!==frame) {
   record={frame,previous:record?.frame===frame-1?record.current:new Set(),current:new Set()};
   events.set(event,record);
  }
  const key=JSON.stringify(Object.keys(scope).sort().map(id=>[id,scope[id].map(object=>object.id).sort()]));
  const pass=!record.previous.has(key) && !record.current.has(key);
  record.current.add(key);
  return pass;
 }

 function* executeEvent(event, scope, index, owner, source, depth, parents, traversal) {
  if (event.disabled) return false;
  try {
   const breakpoint = debugHooks?.hasBreakpoint?.(source, event.id) ?? false;
   const tracing = debugHooks?.isTracing?.() ?? false;
   const conditions = breakpoint || tracing || stepRule ? Array(event.conditions.length).fill(null) : null;
   const evaluateCondition = (block, blockIndex, scope) => {
    const matches = condition(block, scope, event.id + ':' + blockIndex, index, owner);
    if (conditions && (!conditions[blockIndex] || matches.length)) conditions[blockIndex] = matches.length > 0;
    return matches;
   };
   const plan = rowPlans.get(event);
   const triggers=event.conditions.map((block,i)=>block.kind==='triggerOnce'?i:-1).filter(i=>i>=0);
   let scopes;
   if (plan && !triggers.length) {
    scopes = plan.select(scope, (blockIndex, items) => evaluateCondition(event.conditions[blockIndex], blockIndex, items), mergeSelections);
   } else {
    const checks=event.conditions.map((block,i)=>[block,i]).filter(([block])=>block.kind!=='triggerOnce');
    if (event.mode==='or' && checks.length) scopes=mergeSelections(checks.flatMap(([block,i])=>evaluateCondition(block,i,scope)));
    else {
     scopes=[scope];
     for (const [block,i] of checks) {
      scopes=scopes.flatMap(items=>evaluateCondition(block,i,items));
      if (!scopes.length) break;
     }
    }
   }
   if (triggers.length) {
    scopes=scopes.filter(items=>allowTrigger(event,owner,items));
    if (conditions) for (const i of triggers) conditions[i]=scopes.length>0;
   }
   const trail = debugHooks ? [...parents, { source, id: event.id }] : parents;
   for (const selectedScope of scopes) {
    const repeat = clamp(Math.floor(Number(expr(event.repeat || '1', selectedScope, null, index, owner))) || 0, 0, 1000);
    for (let j = 0; j < repeat; j++) {
     if (breakpoint || tracing) {
      const point = executionPoint(event, source, selectedScope, owner, depth, parents, conditions, j, null, breakpoint);
      if (tracing) debugHooks.trace?.(point);
      if (breakpoint) yield point;
     }
     const runAction=actionIndex=>action(event.actions[actionIndex],selectedScope,j,owner,depth,trail,
      stepRule?executionPoint(event,source,selectedScope,owner,depth,parents,conditions,j,actionIndex):null);
     if (plan) yield* plan.execute(runAction,()=>callStack.at(-1)?.returned);
     else for (let i=0;i<event.actions.length;i++) {
      yield* runAction(i);
      if (callStack.at(-1)?.returned) return true;
     }
     if (callStack.at(-1)?.returned) return true;
     yield* runEventList(event.children??[],source,selectedScope,owner,depth+1,trail,j,traversal);
     if (callStack.at(-1)?.returned) return true;
    }
   }
   return scopes.length>0;
  } catch (error) { report(error);return false; }
 }

 function* runEventList(events,source,scope,owner,depth,parents,index,traversal,uiOnly=false,call=false) {
  let previous=false, adjacent=false;
  for (const event of events) {
   if ((!call && owner?.object.dead) || callStack.at(-1)?.returned) break;
   if (event.group || event.include) {
    adjacent=previous=false;
    if (event.group && groupActive(event.id)) {
     yield* runEventList(event.children,source,scope,owner,depth+1,parents,index,traversal,uiOnly);
    } else if (event.include && !event.disabled && !traversal.has(event.include)) {
     const included=sharedSheets.get(event.include);
     if (included) {
      traversal.add(event.include);
      yield* runSheet(included.events,included,scope,owner,depth+1,parents,index,false,traversal,uiOnly);
     }
    }
    continue;
   }
   if (!call && event.functionName) { adjacent=previous=false;continue; }
   if (event.otherwise && (!adjacent || previous)) continue;
   const allowed=!uiOnly || event.conditions.some(condition=>!condition.invert && (
    condition.kind==='uiActivated' && uiActivations.has(condition.args?.control) ||
    condition.kind==='uiChanged' && uiChanges.has(condition.args?.control) ||
    condition.kind==='uiOpened' && openedUI===condition.args?.screen));
   const matched=allowed && (yield* executeEvent(event,scope,index,owner,source,depth,parents,traversal));
   previous=event.otherwise?(previous || matched):matched;
   adjacent=true;
  }
 }

 function* runSheet(events,source,scope={},owner,depth=0,parents=[],index=0,call=false,traversal=new Set(),uiOnly=false) {
  const started=profile?clock():0;
  if (source.kind==='shared') traversal.add(source.id);
  yield* runEventList(events,source,scope,owner,depth,parents,index,traversal,uiOnly,call);
  if (profile) addDuration(profile.sheets,source.kind+':'+source.name,clock()-started);
 }

 function* runLayoutEvents(uiOnly=false) {
  const root=sharedSheets.get(layout.eventSheet)??layoutSource(layout);
  yield* runSheet(root.events,root,{},undefined,0,[],0,false,new Set(),uiOnly);
 }

 function addDuration(samples, name, ms) {
  samples[name] = (samples[name] ?? 0) + ms;
 }
 function moveAxis(object, dx, dy, solids) {
  const moveX = tileLimitMotion(layout.tilemap, tileSolids, object, dx, 'x');
  object.x += moveX;
  if (moveX !== dx) object.vx = 0;
  for (const solid of solids) {
   if (!overlap(object, solid)) continue;
   if (dx > 0) object.x = solid.x - object.w;
   else if (dx < 0) object.x = solid.x + solid.w;
   object.vx = 0;
  }
  const moveY = tileLimitMotion(layout.tilemap, tileSolids, object, dy, 'y');
  object.y += moveY;
  if (moveY !== dy) {
   if (dy > 0) object.ground = true;
   object.vy = 0;
  }
  for (const solid of solids) {
   if (!overlap(object, solid)) continue;
   if (dy > 0) { object.y = solid.y - object.h; object.ground = true; }
   else if (dy < 0) object.y = solid.y + solid.h;
   object.vy = 0;
  }
 }
 function runBuiltInBehaviors() {
  solids = objects.filter(object => !object.dead && behaviorPlans.get(object.type).solid);
  const inputAxis = (positive, negative) => Number(positive) - Number(negative);
  const move = (object, dx, dy) => moveAxis(object, dx, dy, solids);
  const environment = {
   dt, layout, clamp, move,
   horizontal: inputAxis(keyDown('right') || keyDown('d'), keyDown('left') || keyDown('a')),
   vertical: inputAxis(keyDown('down') || keyDown('s'), keyDown('up') || keyDown('w')),
   jumpPressed: pressed.has(' ') || pressed.has('arrowup') || pressed.has('w'),
   followPath: (object, speed) => followTileRoute(object, speed, dt, move, frame),
   emitContinuously: (object, settings) => particles.continuous(object, settings, dt),
  };
  for (const object of objects) {
   if (object.dead) continue;
   const { builtIn } = behaviorPlans.get(object.type);
   for (const { definition, settings } of builtIn) {
    if (!definition.afterAnimation) runBehavior(definition, object, settings, environment);
   }
   advanceSpriteAnimation(object, types[object.type], dt);
   for (const { definition, settings } of builtIn) {
    if (definition.afterAnimation) runBehavior(definition, object, settings, environment);
   }
  }
 }

 function runBehavior(definition, object, settings, environment) {
  const started = profile ? clock() : 0;
  definition.step(object, settings, environment);
  if (profile) addDuration(profile.behaviors, definition.name, clock() - started);
 }

 function timerFired(eventId, interval, owner) {
  const seconds = Math.max(.016, interval);
  const key = `${owner?.sheet.id || ''}:${eventId}:${seconds}`;
  const current = owner?.timers ?? timers;
  const previous = owner?.previousTimers ?? previousTimers;
  if (!current.has(key)) {
   const elapsed = owner ? time - owner.startedAt : time;
   const count = Math.floor(elapsed / seconds);
   current.set(key, count > (previous.get(key) || 0));
   previous.set(key, count);
  }
  return current.get(key);
 }

 function* runCustomBehaviors() {
  for (let i = 0, count = objects.length; i < count; i++) {
   const object = objects[i];
   const clock = instanceClocks.get(object);
   if (object.dead || !clock) continue;
   const timers = new Map();
   for (const { sheet, settings } of behaviorPlans.get(object.type).custom) {
    const owner = { ...clock, object, sheet, settings, timers };
    const scope = { [SELF_TARGET]: [object] };
    const source = { kind: 'behavior', id: sheet.id, name: sheet.name };
    yield* runSheet(sheet.events, source, scope, owner);
   }
   clock.created = false;
  }
 }
 function draw() {
  const artwork = readTileArtwork();
  const view = camera.view;
  if (renderer.render(layout, objects, types, artwork, view, particles.items)) return;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = layout.background || '#172332';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(view.shakeX - view.left * view.zoom, view.shakeY - view.top * view.zoom);
  ctx.scale(view.zoom, view.zoom);
  if (artwork?.[0]) ctx.drawImage(artwork[0], 0, 0);
  const orderedObjects = tileObjectOrder(layout, objects);
  for (const object of orderedObjects) {
   const type = types[object.type];
   if (!object.dead && object.visible && !type.screenSpace) drawObjectPose(ctx, type, object, images);
  }
  drawSceneParticles(ctx, particles.items, images, false);
  if (artwork?.[1]) ctx.drawImage(artwork[1], 0, 0);
  ctx.restore();
  for (const object of orderedObjects) {
   const type = types[object.type];
   if (!object.dead && object.visible && type.screenSpace) drawObjectPose(ctx, type, object, images);
  }
  drawSceneParticles(ctx, particles.items, images, true);
 }
 function collectCollisionPairs() {
  const pairs = new Set(), buckets = new Map(), checked = new Set(), large = [];
  for (const object of objects) {
   if (object.dead) continue;
   const x0 = Math.floor(object.x / 64), y0 = Math.floor(object.y / 64);
   const x1 = Math.floor((object.x + object.w) / 64), y1 = Math.floor((object.y + object.h) / 64);
   if (![x0, y0, x1, y1].every(Number.isFinite) || (x1 - x0 + 1) * (y1 - y0 + 1) > 512) {
    large.push(object);
    continue;
   }
   for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
     const key = `${x},${y}`;
     const bucket = buckets.get(key) ?? [];
     for (const other of bucket) {
      const pair = pairKey(object, other);
      if (checked.has(pair)) continue;
      checked.add(pair);
      if (overlap(object, other)) pairs.add(pair);
     }
     bucket.push(object);
     buckets.set(key, bucket);
    }
   }
  }
  for (const object of large) {
   for (const other of objects) {
    if (!other.dead && overlap(object, other)) pairs.add(pairKey(object, other));
   }
  }
  return pairs;
 }

 function* executeFrame(delta) {
  const started = clock();
  profile = debugHooks?.isProfiling?.() ? { simulation: 0, events: 0, rendering: 0, total: 0,
   sheets: Object.create(null), behaviors: Object.create(null) } : null;
  const resumed = readUIInput();
  const menuPaused = Boolean(uiScreen?.pause);
  dt = menuPaused || resumed ? 0 : clamp(delta, 0, .05);
  timers.clear();
  changed = false;
  let phaseStarted = profile ? clock() : 0;
  if (!nextLayout && !menuPaused && !resumed) {
   time += dt;
   frame++;
   particles.advance(dt);
   runBuiltInBehaviors();
   if (checksBehaviorCollisions) currentBehaviorPairs = collectCollisionPairs();
   if (profile) { profile.simulation = clock() - started; phaseStarted = clock(); }
   yield* runCustomBehaviors();
   if (profile) { profile.events = clock() - phaseStarted; phaseStarted = clock(); }
   if (checksBehaviorCollisions) previousBehaviorPairs = currentBehaviorPairs;
   const layoutPairs = collectCollisionPairs();
   if (profile) { profile.simulation += clock() - phaseStarted; phaseStarted = clock(); }
   yield* runLayoutEvents();
   if (profile) { profile.events += clock() - phaseStarted; phaseStarted = clock(); }
   if (animationPlans.size && !nextLayout) for (const object of objects) {
    const plan=animationPlans.get(object.type);
    if (plan && !object.dead) updateAnimationMachine(object,plan,frame,dt);
   }
   objects = objects.filter(object => !object.dead);
   previousPairs = layoutPairs;
   first = false;
  } else if (!nextLayout && (uiActivations.size || uiChanges.size || openedUI)) {
   yield* runLayoutEvents(true);
   if (profile) { profile.events = clock() - phaseStarted; phaseStarted = clock(); }
  }
  pressed.clear();
  mouse.clicked = false;
  mouseButtons.clear();
  if (nextLayout) enter(nextLayout);
  else if (!menuPaused) { camera.place(dt, objects); updateMouseWorld(); }
  if (profile) { profile.simulation += clock() - phaseStarted; phaseStarted = clock(); }
  draw();
  overlay?.update(vars);
  if (profile) { profile.rendering = clock() - phaseStarted; profile.total = clock() - started; }
  hooks.tick?.({
   ms: clock() - started, fps: dt ? 1 / dt : 0, renderer: renderer.engine, execution,
   vars: { ...vars }, count: objects.length, particles: particles.items.length, layout: layout.name, frame, time, profile,
   objects: objects.map(object => ({ ...object, vars: { ...object.vars } })),
  });
 }

 function restoreDebugClock() {
  if (pausedAt === undefined) return;
  excludedTime += performance.now() - pausedAt;
  pausedAt = undefined;
 }

 function step(delta = 1 / 60) {
  if (paused) return;
  restoreDebugClock();
  frameWork ??= executeFrame(delta);
  while (frameWork) {
   const result = frameWork.next();
   if (result.done) { frameWork = null; break; }
   const point = result.value;
   if (point.breakpoint || (stepRule && point.actionIndex !== null && point.callDepth <= stepRule.callDepth)) {
    paused = true;
    last = 0;
    pausedAt = performance.now();
    stopPoint = point;
    stepRule = null;
    draw();
    debugHooks?.onPause?.(point);
    break;
   }
  }
 }

 function discardFrame() {
  frameWork?.return();
  frameWork = stopPoint = stepRule = null;
  restoreDebugClock();
  profile = null;
 }

 function pause(value) {
  paused = value;
  last = 0;
  if (!value) { stopPoint = stepRule = null; restoreDebugClock(); }
  else if (frameWork && pausedAt === undefined) pausedAt = performance.now();
 }

 function debugCommand(mode) {
  if (!debugHooks) return;
  if (mode === 'pause') {
   pause(true);
   stepRule = null;
   debugHooks.onPause?.(stopPoint);
   return;
  }
  const point = stopPoint;
  pause(false);
  if (mode === 'into' || mode === 'over') {
   stepRule = { callDepth: mode === 'over' && point ? point.callDepth : Infinity };
  }
  debugHooks.onResume?.(mode);
  if (mode === 'continue') return;
  step();
  if (mode === 'frame' && !paused) { pause(true); debugHooks.onPause?.(null); }
 }

 function loop(now) {
  if (!running) return;
  const delta = last ? (now - last) / 1000 : 1 / 60;
  last = paused ? 0 : now;
  step(delta);
  raf = requestAnimationFrame(loop);
 }
 function key(e,down){let k=norm(e.key);if(down){if(!keys.has(k))pressed.add(k);keys.add(k)}else keys.delete(k);if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault()}
 const kd=e=>{
  const ownsFocus = overlay?.owns(e.target);
  if (!ownsFocus && e.target?.closest?.('button,input,select,textarea')) return;
  audio.unlock();
  const name = norm(e.key);
  if ((canGoBack() && input.isMenuKey(name,true)) ||
      (uiScreen?.navigation !== false && overlay?.canNavigate && input.isMenuKey(name,false)) ||
      (name === 'escape' && input.isGameplayKey(name))) e.preventDefault();
  key(e,true);
 },ku=e=>{if(keys.has(norm(e.key)))key(e,false)},blur=()=>{keys.clear();pressed.clear();mouse.down=false;mouse.clicked=false;mouseButtons.clear()},mm=e=>{const r=canvas.getBoundingClientRect();pointer={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};updateMouseWorld()},md=e=>{mm(e);mouse.down=true;mouse.clicked=true;mouseButtons.add(e.button)},mu=()=>mouse.down=false;
 const fullscreenHost = canvas.closest('.void-ui-host');
 const nativeFullscreen = window.voidGameWindow;
 let fullscreenVariable, fullscreenState = false, fullscreenRequest = 0, unsubscribeFullscreen;
 function fitFullscreen() {
  if (!fullscreenHost) return;
  fullscreenHost.classList.toggle('void-ui-window-fullscreen',fullscreenState && Boolean(nativeFullscreen));
  if (!fullscreenState) {
   canvas.style.removeProperty('width');
   canvas.style.removeProperty('height');
   return;
  }
  const scale = Math.min(window.innerWidth/canvas.width,window.innerHeight/canvas.height);
  canvas.style.width = Math.floor(canvas.width*scale)+'px';
  canvas.style.height = Math.floor(canvas.height*scale)+'px';
 }
 function syncFullscreen(enabled) {
  fullscreenState = enabled;
  fitFullscreen();
  if (Object.hasOwn(vars,fullscreenVariable)) vars[fullscreenVariable] = enabled;
 }
 const syncBrowserFullscreen = () => syncFullscreen(Boolean(fullscreenHost && document.fullscreenElement === fullscreenHost));
 async function setGameFullscreen(name) {
  if (!Object.hasOwn(vars,name)) return report(Error('Choose a global variable for fullscreen'));
  fullscreenVariable = name;
  const desired = Boolean(vars[name]), request = ++fullscreenRequest;
  try {
   if (nativeFullscreen) {
    const result = await nativeFullscreen.setFullscreen(desired);
    if (request === fullscreenRequest) syncFullscreen(result);
   } else if (desired) {
    if (!fullscreenHost?.requestFullscreen) throw Error('Fullscreen is unavailable');
    if (document.fullscreenElement !== fullscreenHost) await fullscreenHost.requestFullscreen();
   } else if (!desired && fullscreenHost && document.fullscreenElement === fullscreenHost) await document.exitFullscreen();
  } catch (error) {
   if (request === fullscreenRequest) {
    syncFullscreen(fullscreenState);
    report(Error('Fullscreen: ' + error.message));
   }
  }
 }
 function reset(id) {
  discardFrame();
  audio.reset();
  frame = 0;
  groupOverrides.clear();
  mouseButtons.clear();
  vars = Object.fromEntries(p.globals.map(v => [v.name,structuredClone(v.value)]));
  if (Object.hasOwn(vars,fullscreenVariable)) vars[fullscreenVariable] = fullscreenState;
  enter(id);
  draw();
  debugHooks?.onReset?.(paused);
 }

 async function startRenderer() {
  if (p.renderer === 'canvas') {
   hooks.renderer?.('Canvas 2D · selected');
   return;
  }
  try {
   await loadPixi();
   const order = p.renderer === 'webgpu' ? ['webgpu', 'webgl'] : ['webgl'];
   for (const preference of order) {
    if (!running || await renderer.enable(preference)) return;
   }
   if (running) hooks.renderer?.('Canvas 2D · GPU unavailable');
  } catch (error) {
   if (running) hooks.renderer?.('Canvas 2D · ' + error.message);
  }
 }
 reset(p.activeLayout);return {start(){if(running)return;running=true;if(navigator.userActivation?.isActive)audio.unlock();startRenderer();window.addEventListener('pointerdown',audio.unlock);window.addEventListener('pointerup',audio.unlock);window.addEventListener('keydown',kd);window.addEventListener('keyup',ku);window.addEventListener('blur',blur);window.addEventListener('resize',fitFullscreen);document.addEventListener('fullscreenchange',syncBrowserFullscreen);unsubscribeFullscreen=nativeFullscreen?.onFullscreenChange(syncFullscreen);canvas.addEventListener('pointermove',mm);canvas.addEventListener('pointerdown',md);if(needsRightClick)canvas.addEventListener('contextmenu',preventGameContextMenu);window.addEventListener('pointerup',mu);raf=requestAnimationFrame(loop)},stop(){running=false;window.removeEventListener('pointerdown',audio.unlock);window.removeEventListener('pointerup',audio.unlock);discardFrame();cancelAnimationFrame(raf);window.removeEventListener('keydown',kd);window.removeEventListener('keyup',ku);window.removeEventListener('blur',blur);window.removeEventListener('resize',fitFullscreen);document.removeEventListener('fullscreenchange',syncBrowserFullscreen);unsubscribeFullscreen?.();fullscreenRequest++;syncFullscreen(false);if(fullscreenHost&&document.fullscreenElement===fullscreenHost)document.exitFullscreen().catch(()=>{});canvas.removeEventListener('pointermove',mm);canvas.removeEventListener('pointerdown',md);canvas.removeEventListener('contextmenu',preventGameContextMenu);window.removeEventListener('pointerup',mu);audio.dispose();renderer.close();overlay?.remove()},pause,step,reset,debugCommand,inspect:()=>{
 const sound = audio.inspect();
 return {vars,objects,layout:layout.id,camera:{...camera.view},particles:particles.items,frame,execution,ui:uiScreen?.id??'',menuPaused:Boolean(uiScreen?.pause),volume:sound.channels.master,audio:sound};
 },key(k,down=true){k=norm(k);if(down){if(!keys.has(k))pressed.add(k);keys.add(k)}else keys.delete(k)},evaluate:(s)=>expr(s,{})}
}
function drawObject(ctx,t,o,images){let w=o.w,h=o.h;ctx.imageSmoothingEnabled=false;let c=t.color||'#90c1ce';if(t.kind==='text'){ctx.fillStyle=c;ctx.font=`bold ${Math.max(10,h*.75)}px monospace`;ctx.textBaseline='middle';ctx.fillText(o.text??t.text??'',-w/2,0,w);return}if(t.image){let im=images.get(t.image);if(!im){im=new Image();im.src=t.image;images.set(t.image,im)}if(im.complete&&im.naturalWidth){let sh=t.sheet;if(sh&&sh.count>0&&sh.cols>0){let f=Math.max(0,Math.min(sh.count-1,o.animFrame||0)),sx=(sh.margin||0)+(f%sh.cols)*(sh.w+(sh.spacing||0)),sy=(sh.margin||0)+Math.floor(f/sh.cols)*(sh.h+(sh.spacing||0));ctx.drawImage(im,sx,sy,sh.w,sh.h,-w/2,-h/2,w,h)}else ctx.drawImage(im,-w/2,-h/2,w,h);return}}ctx.fillStyle=c;if(t.shape==='circle'){ctx.beginPath();ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ffffff50';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#ffffff90';ctx.fillRect(-w*.16,-h*.22,w*.17,h*.17)}else if(t.shape==='diamond'){ctx.beginPath();ctx.moveTo(0,-h/2);ctx.lineTo(w/2,0);ctx.lineTo(0,h/2);ctx.lineTo(-w/2,0);ctx.closePath();ctx.fill();ctx.strokeStyle='#ffffff70';ctx.stroke()}else{ctx.fillRect(-w/2,-h/2,w,h);ctx.fillStyle='#ffffff22';ctx.fillRect(-w/2,-h/2,w,Math.min(5,h/4));ctx.fillStyle='#00000030';ctx.fillRect(-w/2,h/2-4,w,4);if(t.shape==='player'){ctx.fillStyle='#f4f1d6';ctx.fillRect(-w*.26,-h*.2,w*.16,h*.16);ctx.fillRect(w*.1,-h*.2,w*.16,h*.16);ctx.fillStyle='#182534';ctx.fillRect(-w*.15,h*.13,w*.3,h*.1)}if(t.shape==='enemy'){ctx.fillStyle='#171a25';ctx.fillRect(-w*.3,-h*.1,w*.2,h*.18);ctx.fillRect(w*.1,-h*.1,w*.2,h*.18)}}}
