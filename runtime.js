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
 const entries = new Map(), textures = new Map(), images = new Map();
 const savedStyle = canvas.getAttribute('style');
 let renderer, stage, host, lastFrame;
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
  stage = undefined;
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

 function render(layout, objects, types) {
  lastFrame = [layout, objects, types];
  if (!stage) return false;
  try {
   if (renderer.screen.width !== layout.width || renderer.screen.height !== layout.height) {
    renderer.resize(layout.width, layout.height);
   }
   Object.assign(renderer.canvas.style, {
    width: canvas.style.width || canvas.width + 'px',
    height: canvas.style.height || canvas.height + 'px',
    maxWidth: getComputedStyle(canvas).maxWidth,
    maxHeight: getComputedStyle(canvas).maxHeight,
   });
   renderer.background.color = layout.background || '#172332';
   const drawn = new Set();
   for (const object of objects) {
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
     stage.addChild(sprite);
     entry = { sprite, key };
     entries.set(object.id, entry);
    } else if (entry.key !== key) {
     entry.key = key;
     entry.sprite.texture = texture;
    }

    const { sprite } = entry;
    sprite.position.set(object.x + object.w / 2, object.y + object.h / 2);
    sprite.width = object.w;
    sprite.height = object.h;
    sprite.rotation = (object.angle || 0) * Math.PI / 180;
    sprite.alpha = Math.max(0, Math.min(1, object.opacity ?? 1));
    stage.setChildIndex(sprite, drawn.size);
    drawn.add(object.id);
   }

   for (const [id, { sprite }] of entries) {
    if (drawn.has(id)) continue;
    sprite.destroy();
    entries.delete(id);
   }
   if (textures.size > 256) {
    const used = new Set([...entries.values()].map(entry => entry.key));
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
 const p=structuredClone(project),ctx=canvas.getContext('2d'),keys=new Set(),pressed=new Set(),images=new Map(),errors=new Set();
 let objects=[],vars={},layout=null,time=0,dt=0,first=true,uid=0,frame=0,raf=0,running=false,last=0,nextLayout=null,previousPairs=new Set(),currentPairs=new Set(),pairRecords=new Map(),timers=new Map(),previousTimers=new Map(),changed=false,paused=false;
 const renderer=createPixiView(canvas,{report:m=>hooks.renderer?.(m)}); const types=Object.fromEntries(p.types.map(t=>[t.id,t])); const byName=Object.fromEntries(p.types.map(t=>[t.name,t.id]));
 function report(e){let msg=String(e.message||e);if(!errors.has(msg)){errors.add(msg);hooks.error?.(msg)}}
 function make(t,props={}){return {id:++uid,type:t.id,x:0,y:0,w:t.w||32,h:t.h||32,angle:0,opacity:1,text:t.text||'',vx:0,vy:0,ground:false,dead:false,visible:true,vars:structuredClone(t.vars||{}),...props,id:uid,type:t.id,vars:{...t.vars,...props.vars}}}
 function enter(id){layout=p.layouts.find(l=>l.id===id)||p.layouts[0];canvas.width=layout.width;canvas.height=layout.height;objects=layout.instances.filter(i=>types[i.type]).map(i=>make(types[i.type],i));first=true;time=0;previousPairs.clear();currentPairs.clear();pairRecords.clear();timers.clear();previousTimers.clear();changed=true;nextLayout=null;hooks.layout?.(layout.name)}
 const overlap=(a,b)=>a!==b&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
 const all=id=>objects.filter(o=>!o.dead&&o.type===id);
 const pick=(s,id)=> (s[id]||all(id)).filter(o=>!o.dead);
 const narrow=(s,id,items)=>({...s,[id]:items});
 const pairKey=(a,b)=>Math.min(a.id,b.id)+':'+Math.max(a.id,b.id);
 const norm=k=>({space:' ',spacebar:' ',left:'arrowleft',right:'arrowright',up:'arrowup',down:'arrowdown'}[String(k).toLowerCase()]||String(k).toLowerCase());
 const keyDown=k=>keys.has(norm(k));
 const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
 const functions={min:Math.min,max:Math.max,abs:Math.abs,floor:Math.floor,ceil:Math.ceil,round:Math.round,sqrt:Math.sqrt,sin:Math.sin,cos:Math.cos,random:(a=1,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a),clamp,len:x=>Array.isArray(x)?x.length:typeof x==='object'&&x?Object.keys(x).length:String(x).length,at:(x,k)=>x!=null&&Object.hasOwn(x,k)?x[k]:0,str:String,num:Number,lerp:(a,b,t)=>a+(b-a)*t};
 // Small expression compiler: no eval, no access to browser globals or prototypes.
 const cache=new Map();
 function compile(src){src=String(src??'0');if(cache.has(src))return cache.get(src);let tok=[],r=/\s*(?:(\d+(?:\.\d*)?|\.\d+)(?:([eE][+-]?\d+))?|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|([A-Za-z_$][\w$]*)|(===|!==|==|!=|<=|>=|&&|\|\||[+\-*/%<>()!.,]))/gy,pos=0;while(pos<src.length){if(!src.slice(pos).trim())break;r.lastIndex=pos;let m=r.exec(src);if(!m)throw Error('Invalid expression near '+src.slice(pos));pos=r.lastIndex;tok.push(m[1]?['n',Number(m[1]+(m[2]||''))]:m[3]?['s',m[3].slice(1,-1).replace(/\\([nrt'"\\])/g,(_,c)=>({n:'\n',r:'\r',t:'\t'}[c]||c))]:m[4]?['id',m[4]]:['op',m[5]])}let i=0;const peek=()=>tok[i]?.[1],take=()=>tok[i++],expect=x=>{if(peek()!==x)throw Error('Expected '+x+' in '+src);i++};const prec={'||':1,'&&':2,'==':3,'===':3,'!=':3,'!==':3,'<':4,'>':4,'<=':4,'>=':4,'+':5,'-':5,'*':6,'/':6,'%':6};
 function atom(){let t=take();if(!t)throw Error('Incomplete expression: '+src);let [kind,v]=t;if(v==='('&&kind==='op'){let f=parse(0);expect(')');return f}if(kind==='op'&&['!','-','+'].includes(v)){let f=atom();return c=>v==='!'?!f(c):v==='-'?-f(c):+f(c)}if(kind==='n'||kind==='s')return ()=>v;if(kind!=='id')throw Error('Unexpected '+v);if(peek()==='('){i++;let args=[];if(peek()!==')'){do{args.push(parse(0));if(peek()!==',')break;i++}while(true)}expect(')');if(!Object.hasOwn(functions,v))throw Error('Unknown function '+v);return c=>functions[v](...args.map(f=>f(c)))}let path=[v];while(peek()==='.'){i++;let q=take();if(q?.[0]!=='id')throw Error('Expected property');path.push(q[1])}return c=>resolve(path,c)}
 function parse(min){let a=atom();while(prec[peek()]>=min&&prec[peek()]!==undefined){let op=take()[1],b=parse(prec[op]+1),prev=a;a=c=>{let x=prev(c);if(op==='&&')return x&&b(c);if(op==='||')return x||b(c);let y=b(c);switch(op){case '+':return x+y;case '-':return x-y;case '*':return x*y;case '/':return x/y;case '%':return x%y;case '==':case '===':return x===y;case '!=':case '!==':return x!==y;case '<':return x<y;case '>':return x>y;case '<=':return x<=y;case '>=':return x>=y}}}return a}let f=parse(0);if(i!==tok.length)throw Error('Unexpected token in '+src);cache.set(src,f);return f}
 const callStack=[];const functionDefs=new Map(p.layouts.flatMap(l=>l.events.filter(e=>e.functionName).map(e=>[e.functionName,e])));function resolve(path,c){let [a,...rest]=path;if(a==='dt')return dt;if(a==='time')return time;if(a==='true')return true;if(a==='false')return false;if(a==='pi')return Math.PI;if(a==='index')return c.index||0;if(a==='count')return objects.filter(o=>!o.dead).length;let v;let local=callStack.at(-1);if(local&&Object.hasOwn(local.params,a))v=local.params[a];else if(a==='global')v=vars;else if(a==='Self'||a==='self')v=c.self;else if(a==='Mouse')v=mouse;else if(Object.hasOwn(byName,a))v=pick(c.scope,byName[a])[0];else if(Object.hasOwn(vars,a))v=vars[a];else throw Error('Unknown name '+a);for(let k of rest){if(v==null)return 0;if(Object.hasOwn(v,k))v=v[k];else if(v.vars&&Object.hasOwn(v.vars,k))v=v.vars[k];else if(k==='width')v=v.w;else if(k==='height')v=v.h;else return 0}return v??0}
 function expr(s,scope,self,index=0){return compile(s)({scope,self,index})}
 let mouse={x:0,y:0,down:false,clicked:false};
 function condition(c,s,eventId,index){let a=c.args||{},id=a.object,other=a.other,ok=false,out=[];const val=(e,o)=>expr(e,s,o,index);switch(c.kind){case 'start':ok=first;break;case 'tick':ok=true;break;case 'keyDown':ok=keyDown(a.key);break;case 'keyPressed':ok=pressed.has(norm(a.key));break;case 'mousePressed':ok=mouse.clicked;break;case 'compare':ok=!!val(a.expr);break;case 'every':{let n=Math.max(.016,Number(val(a.seconds))||1),k=eventId+':'+n;if(!timers.has(k)){let old=previousTimers.get(k)||0,now=Math.floor(time/n);timers.set(k,now>old);previousTimers.set(k,now)}ok=timers.get(k);break}case 'exists':ok=pick(s,id).length>0;break;case 'filter':{let matches=pick(s,id).filter(o=>!!val(a.expr,o)!==!!c.invert);return matches.length?[narrow(s,id,matches)]:[]}case 'overlap':case 'collision':{if(c.invert){let m=pick(s,id).filter(o=>!pick(s,other).some(b=>overlap(o,b)&&(c.kind==='overlap'||!previousPairs.has(pairKey(o,b)))));return m.length?[narrow(s,id,m)]:[]}for(let o of pick(s,id))for(let b of pick(s,other)){if(!overlap(o,b))continue;let k=pairKey(o,b);if(c.kind==='collision'&&previousPairs.has(k))continue;let n=narrow(s,id,[o]);n=narrow(n,other,id===other?[o,b]:[b]);out.push(n)}return out}default:throw Error('Unknown condition '+c.kind)}return ok!==!!c.invert?[s]:[]}
 function action(a,s,index){let q=a.args||{},id=q.object,ev=(x,o)=>expr(x,s,o,index);switch(a.kind){case 'call':{let def=functionDefs.get(q.name);if(!def)throw Error('Unknown visual function '+q.name);if(callStack.length>=32)throw Error('Function recursion limit');let names=def.params||[],values=JSON.parse(q.values||'[]');if(!Array.isArray(values)||values.length!==names.length)throw Error('Expected '+names.length+' argument expressions');let params=Object.fromEntries(names.map((n,i)=>[n,ev(values[i])]));let local={params,result:null,returned:false};callStack.push(local);try{executeEvent(def,s,index)}finally{callStack.pop()}if(q.result)vars[q.result]=local.result;break}case 'return':{let local=callStack.at(-1);if(!local)throw Error('Return outside function');local.result=ev(q.value);local.returned=true;break}case 'setLocal':{let local=callStack.at(-1);if(!local)throw Error('Local variable outside function');local.params[q.name]=ev(q.value);break}case 'setEntry':{let a=vars[q.name],k=ev(q.key);if(!a||typeof a!=='object'||['__proto__','prototype','constructor'].includes(String(k)))throw Error('Invalid collection or key');if(Array.isArray(a)&&(!Number.isInteger(k)||k<0||k>100000))throw Error('Invalid array index');a[k]=ev(q.value);break}case 'setGlobal':vars[q.name]=ev(q.value);break;case 'addGlobal':vars[q.name]=(vars[q.name]??0)+ev(q.value);break;case 'create':if(types[id])objects.push(make(types[id],{x:Number(ev(q.x)),y:Number(ev(q.y))}));break;case 'layout':nextLayout=q.layout;break;case 'restart':nextLayout=layout.id;break;case 'log':hooks.log?.(String(ev(q.value)));break;case 'sound':beep(Number(ev(q.frequency)),Number(ev(q.duration)));break;default:for(let o of pick(s,id)){let v;switch(a.kind){case 'destroy':o.dead=true;break;case 'animation':o.animTime=Number(ev(q.value,o))/(types[o.type].sheet?.fps||1);o.animFrame=Math.floor(Number(ev(q.value,o)));break;case 'damage':o.vars.Health=Math.max(0,(Number(o.vars.Health)||0)-Math.max(0,Number(ev(q.value,o))));break;case 'heal':o.vars.Health=Math.min(Number(o.vars.MaxHealth)||100,(Number(o.vars.Health)||0)+Math.max(0,Number(ev(q.value,o))));break;case 'set':v=ev(q.value,o);if(['x','y','w','h','angle','opacity','vx','vy'].includes(q.property))o[q.property]=Number(v);else if(q.property==='visible')o.visible=!!v;else if(q.property==='text')o.text=String(v);else o.vars[q.property]=v;break;case 'add':v=ev(q.value,o);if(['x','y','w','h','angle','opacity','vx','vy'].includes(q.property))o[q.property]+=Number(v);else o.vars[q.property]=(o.vars[q.property]??0)+v;break;case 'position':o.x=Number(ev(q.x,o));o.y=Number(ev(q.y,o));break;case 'jump':if(o.ground){o.vy=-Math.abs(Number(ev(q.value,o)));o.ground=false}break;case 'text':o.text=String(ev(q.value,o));break;case 'instance':o.vars[q.name]=ev(q.value,o);break}}}}
 function executeEvent(e,scope={},index=0){if(e.disabled)return;try{let scopes=[scope];if(e.mode==='or'&&e.conditions.length){let matches=e.conditions.flatMap((c,i)=>condition(c,scope,e.id+':'+i,index));let seen=new Set();scopes=matches.filter(s=>{let k=JSON.stringify(Object.keys(s).sort().map(id=>[id,s[id].map(o=>o.id).sort()]));if(seen.has(k))return false;seen.add(k);return true})}else for(let [i,c] of e.conditions.entries()){scopes=scopes.flatMap(s=>condition(c,s,e.id+':'+i,index));if(!scopes.length)break}for(let s of scopes){let repeat=clamp(Math.floor(Number(expr(e.repeat||'1',s,null,index)))||0,0,1000);for(let j=0;j<repeat;j++){for(let a of e.actions){action(a,s,j);if(callStack.at(-1)?.returned)return}for(let child of e.children||[]){executeEvent(child,s,j);if(callStack.at(-1)?.returned)return}}}}catch(err){report(err)}}
 function moveAxis(o,dx,dy,solids){o.x+=dx;for(let b of solids)if(overlap(o,b)){if(dx>0)o.x=b.x-o.w;else if(dx<0)o.x=b.x+b.w;o.vx=0}o.y+=dy;for(let b of solids)if(overlap(o,b)){if(dy>0){o.y=b.y-o.h;o.ground=true}else if(dy<0)o.y=b.y+b.h;o.vy=0}}
 function tAnim(o){let sh=types[o.type].sheet;return sh&&sh.count>0&&sh.fps>0&&sh.w>0&&sh.h>0&&sh.cols>0}function behaviors(){let solids=objects.filter(o=>!o.dead&&types[o.type].behaviors?.solid);for(let o of objects){if(o.dead)continue;let b=types[o.type].behaviors||{},speed=Number(b.speed)||150;let dx=(keyDown('right')||keyDown('d')?1:0)-(keyDown('left')||keyDown('a')?1:0),dy=(keyDown('down')||keyDown('s')?1:0)-(keyDown('up')||keyDown('w')?1:0);if(b.move8){let n=Math.hypot(dx,dy)||1;moveAxis(o,dx*speed*dt/n,dy*speed*dt/n,solids)}if(b.platform){if((pressed.has(' ')||pressed.has('arrowup')||pressed.has('w'))&&o.ground)o.vy=-(Number(b.jump)||380);o.vy+= (Number(b.gravity)||950)*dt;o.ground=false;moveAxis(o,dx*speed*dt,o.vy*dt,solids)}if(b.bullet){let rad=o.angle*Math.PI/180;o.x+=Math.cos(rad)*speed*dt;o.y+=Math.sin(rad)*speed*dt;if(b.bounce&&(o.x<0||o.y<0||o.x+o.w>layout.width||o.y+o.h>layout.height)){if(o.x<0||o.x+o.w>layout.width)o.angle=180-o.angle;if(o.y<0||o.y+o.h>layout.height)o.angle=-o.angle;o.x=clamp(o.x,0,layout.width-o.w);o.y=clamp(o.y,0,layout.height-o.h)}}if(tAnim(o)){let sh=types[o.type].sheet;o.animTime=(o.animTime||0)+dt;o.animFrame=Math.floor(o.animTime*sh.fps)%sh.count;}if(b.rotate)o.angle+=Number(b.rotation||90)*dt;if(b.fade){o.opacity-=dt/(Number(b.fadeTime)||1);if(o.opacity<=0)o.dead=true}if(b.bound){o.x=clamp(o.x,0,layout.width-o.w);o.y=clamp(o.y,0,layout.height-o.h)}}}
 function draw(){if(renderer.render(layout,objects,types))return;ctx.imageSmoothingEnabled=false;ctx.fillStyle=layout.background||'#172332';ctx.fillRect(0,0,canvas.width,canvas.height);for(let o of objects){if(o.dead||!o.visible)continue;let t=types[o.type];ctx.save();ctx.translate(o.x+o.w/2,o.y+o.h/2);ctx.rotate(o.angle*Math.PI/180);ctx.globalAlpha=clamp(o.opacity,0,1);drawObject(ctx,t,o,images);ctx.restore()}}
 function step(delta=1/60){if(paused)return;let started=performance.now();dt=clamp(delta,0,.05);time+=dt;frame++;timers.clear();changed=false;behaviors();currentPairs=new Set();let buckets=new Map(),checked=new Set(),large=[];for(let o of objects){if(o.dead)continue;let x0=Math.floor(o.x/64),y0=Math.floor(o.y/64),x1=Math.floor((o.x+o.w)/64),y1=Math.floor((o.y+o.h)/64);if(![x0,y0,x1,y1].every(Number.isFinite)||(x1-x0+1)*(y1-y0+1)>512){large.push(o);continue}for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){let k=x+','+y,b=buckets.get(k)||[];for(let other of b){let pair=pairKey(o,other);if(!checked.has(pair)){checked.add(pair);if(overlap(o,other))currentPairs.add(pair)}}b.push(o);buckets.set(k,b)}}for(let o of large)for(let other of objects)if(!other.dead&&overlap(o,other))currentPairs.add(pairKey(o,other));for(let e of layout.events)if(!e.functionName)executeEvent(e);objects=objects.filter(o=>!o.dead);previousPairs=currentPairs;first=false;pressed.clear();mouse.clicked=false;if(nextLayout)enter(nextLayout);draw();hooks.tick?.({ms:performance.now()-started,fps:dt?1/dt:0,renderer:renderer.engine,vars:{...vars},count:objects.length,layout:layout.name,frame,time,objects:objects.map(o=>({...o,vars:{...o.vars}}))})}
 function loop(now){if(!running)return;let d=last?(now-last)/1000:1/60;last=now;step(d);raf=requestAnimationFrame(loop)}
 function key(e,down){let k=norm(e.key);if(down){if(!keys.has(k))pressed.add(k);keys.add(k)}else keys.delete(k);if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault()}
 const kd=e=>key(e,true),ku=e=>key(e,false),blur=()=>{keys.clear();pressed.clear();mouse.down=false},mm=e=>{let r=canvas.getBoundingClientRect();mouse.x=(e.clientX-r.left)*canvas.width/r.width;mouse.y=(e.clientY-r.top)*canvas.height/r.height},md=e=>{mm(e);mouse.down=true;mouse.clicked=true},mu=()=>mouse.down=false;
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
 reset(p.activeLayout);return {start(){if(running)return;running=true;startRenderer();window.addEventListener('keydown',kd);window.addEventListener('keyup',ku);window.addEventListener('blur',blur);canvas.addEventListener('pointermove',mm);canvas.addEventListener('pointerdown',md);window.addEventListener('pointerup',mu);raf=requestAnimationFrame(loop)},stop(){running=false;cancelAnimationFrame(raf);window.removeEventListener('keydown',kd);window.removeEventListener('keyup',ku);window.removeEventListener('blur',blur);canvas.removeEventListener('pointermove',mm);canvas.removeEventListener('pointerdown',md);window.removeEventListener('pointerup',mu);audio?.close();renderer.close()},pause(v){paused=v;last=0},step,reset,inspect:()=>({vars,objects,layout:layout.id}),key(k,down=true){k=norm(k);if(down){if(!keys.has(k))pressed.add(k);keys.add(k)}else keys.delete(k)},evaluate:(s)=>expr(s,{})}
}
function drawObject(ctx,t,o,images){let w=o.w,h=o.h;ctx.imageSmoothingEnabled=false;let c=t.color||'#90c1ce';if(t.kind==='text'){ctx.fillStyle=c;ctx.font=`bold ${Math.max(10,h*.75)}px monospace`;ctx.textBaseline='middle';ctx.fillText(o.text??t.text??'',-w/2,0,w);return}if(t.image){let im=images.get(t.image);if(!im){im=new Image();im.src=t.image;images.set(t.image,im)}if(im.complete&&im.naturalWidth){let sh=t.sheet;if(sh&&sh.count>0&&sh.cols>0){let f=Math.max(0,Math.min(sh.count-1,o.animFrame||0)),sx=(f%sh.cols)*sh.w,sy=Math.floor(f/sh.cols)*sh.h;ctx.drawImage(im,sx,sy,sh.w,sh.h,-w/2,-h/2,w,h)}else ctx.drawImage(im,-w/2,-h/2,w,h);return}}ctx.fillStyle=c;if(t.shape==='circle'){ctx.beginPath();ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ffffff50';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#ffffff90';ctx.fillRect(-w*.16,-h*.22,w*.17,h*.17)}else if(t.shape==='diamond'){ctx.beginPath();ctx.moveTo(0,-h/2);ctx.lineTo(w/2,0);ctx.lineTo(0,h/2);ctx.lineTo(-w/2,0);ctx.closePath();ctx.fill();ctx.strokeStyle='#ffffff70';ctx.stroke()}else{ctx.fillRect(-w/2,-h/2,w,h);ctx.fillStyle='#ffffff22';ctx.fillRect(-w/2,-h/2,w,Math.min(5,h/4));ctx.fillStyle='#00000030';ctx.fillRect(-w/2,h/2-4,w,4);if(t.shape==='player'){ctx.fillStyle='#f4f1d6';ctx.fillRect(-w*.26,-h*.2,w*.16,h*.16);ctx.fillRect(w*.1,-h*.2,w*.16,h*.16);ctx.fillStyle='#182534';ctx.fillRect(-w*.15,h*.13,w*.3,h*.1)}if(t.shape==='enemy'){ctx.fillStyle='#171a25';ctx.fillRect(-w*.3,-h*.1,w*.2,h*.18);ctx.fillRect(w*.1,-h*.1,w*.2,h*.18)}}}
