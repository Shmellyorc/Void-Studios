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
 const renderer=createPixiView(canvas,{report:m=>hooks.renderer?.(m)}); const types=Object.fromEntries(p.types.map(t=>[t.id,t])); const byName=Object.fromEntries(p.types.map(t=>[t.name,t.id]));
 function report(e){let msg=String(e.message||e);if(!errors.has(msg)){errors.add(msg);hooks.error?.(msg)}}
 const sheets = new Map(p.behaviorSheets.map(sheet => [sheet.id, sheet]));
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
   ...props, id: ++uid, type: type.id, vars: structuredClone({ ...type.vars, ...props.vars }),
  };
  if (type.animator?.autoplay) playSpriteClip(object, type, type.animator.autoplay);
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
  time = 0;
  tileSolids = tileSolidCells(layout.tilemap, atlases);
  readTileArtwork = createTileArtwork(layout, atlases, images);
  objects = layout.instances.filter(instance => types[instance.type]).map(instance => make(types[instance.type], instance));
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
  hooks.layout?.(layout.name);
 }
 const overlap=(a,b)=>a!==b&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
 const all=id=>objects.filter(o=>!o.dead&&o.type===id);
 const pick=(scope,id,owner)=> (scope[id] || (id===SELF_TARGET ? (owner ? [owner.object] : []) : all(id))).filter(o=>!o.dead);
 const narrow=(s,id,items)=>({...s,[id]:items});
 const pairKey=(a,b)=>Math.min(a.id,b.id)+':'+Math.max(a.id,b.id);
 const norm=k=>({space:' ',spacebar:' ',left:'arrowleft',right:'arrowright',up:'arrowup',down:'arrowdown'}[String(k).toLowerCase()]||String(k).toLowerCase());
 const keyDown=k=>keys.has(norm(k));
 const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
 const functions={tileHasTag, tileColumn, tileRow, min:Math.min,max:Math.max,abs:Math.abs,floor:Math.floor,ceil:Math.ceil,round:Math.round,sqrt:Math.sqrt,sin:Math.sin,cos:Math.cos,random:(a=1,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a),clamp,len:x=>Array.isArray(x)?x.length:typeof x==='object'&&x?Object.keys(x).length:String(x).length,at:(x,k)=>x!=null&&Object.hasOwn(x,k)?x[k]:0,str:String,num:Number,lerp:(a,b,t)=>a+(b-a)*t};
 // Small expression compiler: no eval, no access to browser globals or prototypes.
 const cache=new Map();
 function compile(src){src=String(src??'0');if(cache.has(src))return cache.get(src);let tok=[],r=/\s*(?:(\d+(?:\.\d*)?|\.\d+)(?:([eE][+-]?\d+))?|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|([A-Za-z_$][\w$]*)|(===|!==|==|!=|<=|>=|&&|\|\||[+\-*/%<>()!.,]))/gy,pos=0;while(pos<src.length){if(!src.slice(pos).trim())break;r.lastIndex=pos;let m=r.exec(src);if(!m)throw Error('Invalid expression near '+src.slice(pos));pos=r.lastIndex;tok.push(m[1]?['n',Number(m[1]+(m[2]||''))]:m[3]?['s',m[3].slice(1,-1).replace(/\\([nrt'"\\])/g,(_,c)=>({n:'\n',r:'\r',t:'\t'}[c]||c))]:m[4]?['id',m[4]]:['op',m[5]])}let i=0;const peek=()=>tok[i]?.[1],take=()=>tok[i++],expect=x=>{if(peek()!==x)throw Error('Expected '+x+' in '+src);i++};const prec={'||':1,'&&':2,'==':3,'===':3,'!=':3,'!==':3,'<':4,'>':4,'<=':4,'>=':4,'+':5,'-':5,'*':6,'/':6,'%':6};
 function atom(){let t=take();if(!t)throw Error('Incomplete expression: '+src);let [kind,v]=t;if(v==='('&&kind==='op'){let f=parse(0);expect(')');return f}if(kind==='op'&&['!','-','+'].includes(v)){let f=atom();return c=>v==='!'?!f(c):v==='-'?-f(c):+f(c)}if(kind==='n'||kind==='s')return ()=>v;if(kind!=='id')throw Error('Unexpected '+v);if(peek()==='('){i++;let args=[];if(peek()!==')'){do{args.push(parse(0));if(peek()!==',')break;i++}while(true)}expect(')');if(!Object.hasOwn(functions,v))throw Error('Unknown function '+v);return c=>functions[v](...args.map(f=>f(c)))}let path=[v];while(peek()==='.'){i++;let q=take();if(q?.[0]!=='id')throw Error('Expected property');path.push(q[1])}return c=>resolve(path,c)}
 function parse(min){let a=atom();while(prec[peek()]>=min&&prec[peek()]!==undefined){let op=take()[1],b=parse(prec[op]+1),prev=a;a=c=>{let x=prev(c);if(op==='&&')return x&&b(c);if(op==='||')return x||b(c);let y=b(c);switch(op){case '+':return x+y;case '-':return x-y;case '*':return x*y;case '/':return x/y;case '%':return x%y;case '==':case '===':return x===y;case '!=':case '!==':return x!==y;case '<':return x<y;case '>':return x>y;case '<=':return x<=y;case '>=':return x>=y}}}return a}let f=parse(0);if(i!==tok.length)throw Error('Unexpected token in '+src);cache.set(src,f);return f}
 const callStack=[];const functionDefs=new Map(p.layouts.flatMap(l=>l.events.filter(e=>e.functionName).map(e=>[e.functionName,e])));function resolve(path,c){let [a,...rest]=path;if(a==='dt')return dt;if(a==='time')return time;if(a==='true')return true;if(a==='false')return false;if(a==='pi')return Math.PI;if(a==='index')return c.index||0;if(a==='count')return objects.filter(o=>!o.dead).length;let v;let local=callStack.at(-1);if(local&&Object.hasOwn(local.params,a))v=local.params[a];else if(a==='global')v=vars;else if(a==='Self'||a==='self')v=c.owner?.object??c.target;else if(a==='Target'&&c.owner)v=c.target;else if(a==='Settings'&&c.owner)v=c.owner.settings;else if(a==='Mouse')v=mouse;else if(a==='Camera'&&rest.length&&!Object.hasOwn(byName,a))v=camera.view;else if(a==='Enums'&&rest.length&&Object.keys(enums).length)v=enums;else if(Object.hasOwn(byName,a))v=pick(c.scope,byName[a])[0];else if(Object.hasOwn(vars,a))v=vars[a];else throw Error('Unknown name '+a);for(let k of rest){if(v==null)return 0;if(Object.hasOwn(v,k))v=v[k];else if(v.vars&&Object.hasOwn(v.vars,k))v=v.vars[k];else if(k==='width')v=v.w;else if(k==='height')v=v.h;else return 0}return v??0}
 const attachedSheets = [...behaviorPlans.values()].flatMap(plan => plan.custom.map(({ sheet }) => sheet));
 function containsCollision(events) {
  return events.some(event => event.conditions.some(condition => condition.kind === 'collision') ||
   containsCollision(event.children || []));
 }
 const checksBehaviorCollisions = attachedSheets.some(sheet => containsCollision(sheet.events)) ||
  (attachedSheets.length > 0 && containsCollision([...functionDefs.values()]));

 function matchingPair(kind, a, b, owner) {
  if (kind === 'overlap') return overlap(a, b);
  const key = pairKey(a, b);
  if (owner) return currentBehaviorPairs.has(key) && !previousBehaviorPairs.has(key);
  return overlap(a, b) && !previousPairs.has(key);
 }

 function expr(s,scope,target,index=0,owner){return compile(s)({scope,target,index,owner})}
 function tileHasTag(layerName, x, y, tag) {
  const tile = tileAtWorld(layout.tilemap, layerName, x, y);
  if (!tile || !tag) return false;
  const metadata = tileMeta(atlases.get(tile.atlas) ?? {}, tile.column, tile.row);
  return tile.terrain === tag || metadata?.terrain === tag || (metadata?.tags ?? []).includes(tag);
 }
 function tileColumn(x, y) { return layout.tilemap ? tileCellAt(layout.tilemap, x, y)[0] : -1; }
 function tileRow(x, y) { return layout.tilemap ? tileCellAt(layout.tilemap, x, y)[1] : -1; }
 let mouse={x:0,y:0,screenX:0,screenY:0,down:false,clicked:false};
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
 function condition(c,s,eventId,index,owner){let a=c.args||{},id=a.object,other=a.other,ok=false,out=[];const val=(e,o)=>expr(e,s,o,index,owner);switch(c.kind){case 'start':ok=first;break;case 'created':ok=owner?.created??false;break;case 'tick':ok=true;break;case 'keyDown':ok=keyDown(a.key);break;case 'keyPressed':ok=pressed.has(norm(a.key));break;case 'mousePressed':ok=mouse.clicked;break;case 'compare':ok=!!val(a.expr);break;case 'every':ok=timerFired(eventId, Number(val(a.seconds)) || 1, owner);break;case 'exists':ok=pick(s,id,owner).length>0;break;case 'navigating':case 'navArrived':case 'navFailed':{const matches=pick(s,id,owner).filter(o=>navigationCondition(c.kind,o)!==Boolean(c.invert));return matches.length?[narrow(s,id,matches)]:[]}case 'tileTag':{const matches=pick(s,id,owner).filter(o=>tileHasTag(a.layer,o.x+o.w/2,o.y+o.h+1e-6,a.tag)!==Boolean(c.invert));return matches.length?[narrow(s,id,matches)]:[]}case 'clipPlaying':case 'clipFinished':{const matches=pick(s,id,owner).filter(o=>{const state=o.animation;const active=c.kind==='clipPlaying'?state?.playing:state?.finished;return Boolean(active&&(!a.clip||state.clip.name===a.clip))!==Boolean(c.invert)});return matches.length?[narrow(s,id,matches)]:[]}case 'filter':{let matches=pick(s,id,owner).filter(o=>!!val(a.expr,o)!==!!c.invert);return matches.length?[narrow(s,id,matches)]:[]}case 'overlap':case 'collision':{if(c.invert){let m=pick(s,id,owner).filter(o=>!pick(s,other,owner).some(b=>matchingPair(c.kind,o,b,owner)));return m.length?[narrow(s,id,m)]:[]}for(let o of pick(s,id,owner))for(let b of pick(s,other,owner)){if(!matchingPair(c.kind,o,b,owner))continue;let n=narrow(s,id,[o]);n=narrow(n,other,id===other?[o,b]:[b]);out.push(n)}return out}default:throw Error('Unknown condition '+c.kind)}return ok!==!!c.invert?[s]:[]}
 function action(a,s,index,owner){let q=a.args||{},id=q.object,ev=(x,o)=>expr(x,s,o,index,owner);switch(a.kind){case 'call':{let def=functionDefs.get(q.name);if(!def)throw Error('Unknown visual function '+q.name);if(callStack.length>=32)throw Error('Function recursion limit');let names=def.params||[],values=JSON.parse(q.values||'[]');if(!Array.isArray(values)||values.length!==names.length)throw Error('Expected '+names.length+' argument expressions');let params=Object.fromEntries(names.map((n,i)=>[n,ev(values[i])]));let local={params,result:null,returned:false};callStack.push(local);try{executeEvent(def,s,index,owner)}finally{callStack.pop()}if(q.result)vars[q.result]=local.result;break}case 'return':{let local=callStack.at(-1);if(!local)throw Error('Return outside function');local.result=ev(q.value);local.returned=true;break}case 'setLocal':{let local=callStack.at(-1);if(!local)throw Error('Local variable outside function');local.params[q.name]=ev(q.value);break}case 'setEntry':{let a=vars[q.name],k=ev(q.key);if(!a||typeof a!=='object'||['__proto__','prototype','constructor'].includes(String(k)))throw Error('Invalid collection or key');if(Array.isArray(a)&&(!Number.isInteger(k)||k<0||k>100000))throw Error('Invalid array index');a[k]=ev(q.value);break}case 'setGlobal':vars[q.name]=ev(q.value);break;case 'addGlobal':vars[q.name]=(vars[q.name]??0)+ev(q.value);break;case 'create':if(types[id])objects.push(make(types[id],{x:Number(ev(q.x)),y:Number(ev(q.y))}));break;case 'layout':nextLayout=q.layout;break;case 'restart':nextLayout=layout.id;break;case 'cameraFollow':{const targets=pick(s,id,owner);if(targets.length)camera.follow(targets[0]);break}case 'cameraPosition':camera.position(Number(ev(q.x)),Number(ev(q.y)));break;case 'cameraZoom':camera.zoom(Number(ev(q.zoom)));break;case 'cameraShake':camera.shake(Number(ev(q.strength)),Number(ev(q.duration)));break;case 'log':hooks.log?.(String(ev(q.value)));break;case 'sound':beep(Number(ev(q.frequency)),Number(ev(q.duration)));break;default:for(let o of pick(s,id,owner)){let v;switch(a.kind){case 'emitParticles':{const settings=behaviorPlans.get(o.type).emitter;if(!settings)throw Error('Attach Particle Emitter before emitting');particles.emit(o,settings,Number(ev(q.count,o)));break}case 'navigate':navigate(o,Number(ev(q.x,o)),Number(ev(q.y,o)),Boolean(ev(q.restart??'false',o)));break;case 'stopNavigation':delete o.navigation;break;case 'moveSolid':moveAxis(o,Number(ev(q.x,o)),Number(ev(q.y,o)),solids);break;case 'destroy':o.dead=true;break;case 'playClip':playSpriteClip(o,types[o.type],q.clip,Boolean(ev(q.restart??'false',o)));break;case 'stopClip':if(o.animation){o.animation.playing=false;o.animation.stopped=true;}break;case 'animation':if(o.animation){o.animation.playing=false;o.animation.stopped=true;delete o.pose.frame}o.animTime=Number(ev(q.value,o))/(types[o.type].sheet?.fps||1);o.animFrame=Math.floor(Number(ev(q.value,o)));break;case 'damage':o.vars.Health=Math.max(0,(Number(o.vars.Health)||0)-Math.max(0,Number(ev(q.value,o))));break;case 'heal':o.vars.Health=Math.min(Number(o.vars.MaxHealth)||100,(Number(o.vars.Health)||0)+Math.max(0,Number(ev(q.value,o))));break;case 'set':v=ev(q.value,o);if(['x','y','w','h','angle','opacity','vx','vy'].includes(q.property))o[q.property]=Number(v);else if(q.property==='visible')o.visible=!!v;else if(q.property==='text')o.text=String(v);else o.vars[q.property]=v;break;case 'add':v=ev(q.value,o);if(['x','y','w','h','angle','opacity','vx','vy'].includes(q.property))o[q.property]+=Number(v);else o.vars[q.property]=(o.vars[q.property]??0)+v;break;case 'position':o.x=Number(ev(q.x,o));o.y=Number(ev(q.y,o));break;case 'jump':if(o.ground){o.vy=-Math.abs(Number(ev(q.value,o)));o.ground=false}break;case 'text':o.text=String(ev(q.value,o));break;case 'instance':o.vars[q.name]=ev(q.value,o);break}}}}
 function executeEvent(e,scope={},index=0,owner){if(e.disabled)return;try{let scopes=[scope];if(e.mode==='or'&&e.conditions.length){let matches=e.conditions.flatMap((c,i)=>condition(c,scope,e.id+':'+i,index,owner));let seen=new Set();scopes=matches.filter(s=>{let k=JSON.stringify(Object.keys(s).sort().map(id=>[id,s[id].map(o=>o.id).sort()]));if(seen.has(k))return false;seen.add(k);return true})}else for(let [i,c] of e.conditions.entries()){scopes=scopes.flatMap(s=>condition(c,s,e.id+':'+i,index,owner));if(!scopes.length)break}for(let s of scopes){let repeat=clamp(Math.floor(Number(expr(e.repeat||'1',s,null,index,owner)))||0,0,1000);for(let j=0;j<repeat;j++){for(let a of e.actions){action(a,s,j,owner);if(callStack.at(-1)?.returned)return}for(let child of e.children||[]){executeEvent(child,s,j,owner);if(callStack.at(-1)?.returned)return}}}}catch(err){report(err)}}
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
    if (!definition.afterAnimation) definition.step(object, settings, environment);
   }
   advanceSpriteAnimation(object, types[object.type], dt);
   for (const { definition, settings } of builtIn) {
    if (definition.afterAnimation) definition.step(object, settings, environment);
   }
  }
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

 function runCustomBehaviors() {
  for (let i = 0, count = objects.length; i < count; i++) {
   const object = objects[i];
   const clock = instanceClocks.get(object);
   if (object.dead || !clock) continue;
   const timers = new Map();
   for (const { sheet, settings } of behaviorPlans.get(object.type).custom) {
    const owner = { ...clock, object, sheet, settings, timers };
    const scope = { [SELF_TARGET]: [object] };
    for (const event of sheet.events) {
     if (object.dead) break;
     executeEvent(event, scope, 0, owner);
    }
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

 function step(delta = 1 / 60) {
  if (paused) return;
  const started = performance.now();
  dt = clamp(delta, 0, .05);
  time += dt;
  frame++;
  timers.clear();
  changed = false;
  particles.advance(dt);
  runBuiltInBehaviors();
  // Custom sheets see the same contacts even if an earlier sheet moves an object.
  if (checksBehaviorCollisions) currentBehaviorPairs = collectCollisionPairs();
  runCustomBehaviors();
  if (checksBehaviorCollisions) previousBehaviorPairs = currentBehaviorPairs;
  const layoutPairs = collectCollisionPairs();
  for (const event of layout.events) if (!event.functionName) executeEvent(event);
  objects = objects.filter(object => !object.dead);
  previousPairs = layoutPairs;
  first = false;
  pressed.clear();
  mouse.clicked = false;
  if (nextLayout) enter(nextLayout);
  else { camera.place(dt, objects); updateMouseWorld(); }
  draw();
  hooks.tick?.({
   ms: performance.now() - started, fps: dt ? 1 / dt : 0, renderer: renderer.engine,
   vars: { ...vars }, count: objects.length, particles: particles.items.length, layout: layout.name, frame, time,
   objects: objects.map(object => ({ ...object, vars: { ...object.vars } })),
  });
 }
 function loop(now){if(!running)return;let d=last?(now-last)/1000:1/60;last=now;step(d);raf=requestAnimationFrame(loop)}
 function key(e,down){let k=norm(e.key);if(down){if(!keys.has(k))pressed.add(k);keys.add(k)}else keys.delete(k);if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault()}
 const kd=e=>key(e,true),ku=e=>key(e,false),blur=()=>{keys.clear();pressed.clear();mouse.down=false},mm=e=>{const r=canvas.getBoundingClientRect();pointer={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};updateMouseWorld()},md=e=>{mm(e);mouse.down=true;mouse.clicked=true},mu=()=>mouse.down=false;
 let audio=null;function beep(f,d){try{audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();let osc=audio.createOscillator(),gain=audio.createGain();osc.type='triangle';osc.frequency.value=clamp(f||440,40,4000);gain.gain.setValueAtTime(.07,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+clamp(d||.1,.02,1));osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+clamp(d||.1,.02,1))}catch{}}
 function reset(id){frame=0;vars=Object.fromEntries(p.globals.map(v=>[v.name,structuredClone(v.value)]));enter(id);draw()}
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
 reset(p.activeLayout);return {start(){if(running)return;running=true;startRenderer();window.addEventListener('keydown',kd);window.addEventListener('keyup',ku);window.addEventListener('blur',blur);canvas.addEventListener('pointermove',mm);canvas.addEventListener('pointerdown',md);window.addEventListener('pointerup',mu);raf=requestAnimationFrame(loop)},stop(){running=false;cancelAnimationFrame(raf);window.removeEventListener('keydown',kd);window.removeEventListener('keyup',ku);window.removeEventListener('blur',blur);canvas.removeEventListener('pointermove',mm);canvas.removeEventListener('pointerdown',md);window.removeEventListener('pointerup',mu);audio?.close();renderer.close()},pause(v){paused=v;last=0},step,reset,inspect:()=>({vars,objects,layout:layout.id,camera:{...camera.view},particles:particles.items}),key(k,down=true){k=norm(k);if(down){if(!keys.has(k))pressed.add(k);keys.add(k)}else keys.delete(k)},evaluate:(s)=>expr(s,{})}
}
function drawObject(ctx,t,o,images){let w=o.w,h=o.h;ctx.imageSmoothingEnabled=false;let c=t.color||'#90c1ce';if(t.kind==='text'){ctx.fillStyle=c;ctx.font=`bold ${Math.max(10,h*.75)}px monospace`;ctx.textBaseline='middle';ctx.fillText(o.text??t.text??'',-w/2,0,w);return}if(t.image){let im=images.get(t.image);if(!im){im=new Image();im.src=t.image;images.set(t.image,im)}if(im.complete&&im.naturalWidth){let sh=t.sheet;if(sh&&sh.count>0&&sh.cols>0){let f=Math.max(0,Math.min(sh.count-1,o.animFrame||0)),sx=(sh.margin||0)+(f%sh.cols)*(sh.w+(sh.spacing||0)),sy=(sh.margin||0)+Math.floor(f/sh.cols)*(sh.h+(sh.spacing||0));ctx.drawImage(im,sx,sy,sh.w,sh.h,-w/2,-h/2,w,h)}else ctx.drawImage(im,-w/2,-h/2,w,h);return}}ctx.fillStyle=c;if(t.shape==='circle'){ctx.beginPath();ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ffffff50';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#ffffff90';ctx.fillRect(-w*.16,-h*.22,w*.17,h*.17)}else if(t.shape==='diamond'){ctx.beginPath();ctx.moveTo(0,-h/2);ctx.lineTo(w/2,0);ctx.lineTo(0,h/2);ctx.lineTo(-w/2,0);ctx.closePath();ctx.fill();ctx.strokeStyle='#ffffff70';ctx.stroke()}else{ctx.fillRect(-w/2,-h/2,w,h);ctx.fillStyle='#ffffff22';ctx.fillRect(-w/2,-h/2,w,Math.min(5,h/4));ctx.fillStyle='#00000030';ctx.fillRect(-w/2,h/2-4,w,4);if(t.shape==='player'){ctx.fillStyle='#f4f1d6';ctx.fillRect(-w*.26,-h*.2,w*.16,h*.16);ctx.fillRect(w*.1,-h*.2,w*.16,h*.16);ctx.fillStyle='#182534';ctx.fillRect(-w*.15,h*.13,w*.3,h*.1)}if(t.shape==='enemy'){ctx.fillStyle='#171a25';ctx.fillRect(-w*.3,-h*.1,w*.2,h*.18);ctx.fillRect(w*.1,-h*.1,w*.2,h*.18)}}}
