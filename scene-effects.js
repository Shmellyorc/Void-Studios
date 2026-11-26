const sceneClamp = (value, low, high) => Math.min(high, Math.max(low, value));

function validSceneCamera(settings) {
 return settings && [settings.width, settings.height].every(value => Number.isInteger(value) && value >= 64 && value <= 4096) &&
  Number.isFinite(settings.zoom) && settings.zoom >= .1 && settings.zoom <= 8 &&
  Number.isFinite(settings.response) && settings.response >= 0 && settings.response <= 60 && typeof settings.target === 'string' &&
  typeof settings.bounds === 'boolean' && typeof settings.guide === 'boolean';
}

function createSceneCamera(layout) {
 const settings = layout.camera ?? {};
 const width = settings.width || layout.width, height = settings.height || layout.height;
 const response = settings.response ?? 8;
 const view = { width, height, x: layout.width / 2, y: layout.height / 2,
  zoom: settings.zoom ?? 1, left: 0, top: 0, shakeX: 0, shakeY: 0 };
 let mode = settings.target ? 'type' : 'fixed';
 let target, shake;

 function place(seconds, objects, instant = false) {
  const focus = mode === 'type' ? objects.find(object => !object.dead && object.type === settings.target) : target;
  if (focus && !focus.dead) {
   const blend = instant || !response ? 1 : 1 - Math.exp(-response * seconds);
   view.x += (focus.x + focus.w / 2 - view.x) * blend;
   view.y += (focus.y + focus.h / 2 - view.y) * blend;
  }
  const halfWidth = width / (2 * view.zoom), halfHeight = height / (2 * view.zoom);
  if (settings.bounds !== false) {
   if (halfWidth >= layout.width / 2) view.x = layout.width / 2;
   else view.x = sceneClamp(view.x, halfWidth, layout.width - halfWidth);
   if (halfHeight >= layout.height / 2) view.y = layout.height / 2;
   else view.y = sceneClamp(view.y, halfHeight, layout.height - halfHeight);
  }
  view.left = view.x - halfWidth;
  view.top = view.y - halfHeight;
  if (shake) {
   shake.age += seconds;
   if (shake.age >= shake.duration) shake = undefined;
  }
  const force = shake ? shake.strength * (1 - shake.age / shake.duration) : 0;
  view.shakeX = force ? Math.sin(shake.age * 83 + 1) * force : 0;
  view.shakeY = force ? Math.sin(shake.age * 109 + 2) * force : 0;
 }

 return {
  view, place,
  follow(object) { mode = 'instance'; target = object; },
  position(x, y) {
   if (!Number.isFinite(x) || !Number.isFinite(y)) return;
   mode = 'fixed'; target = undefined;
   view.x = x; view.y = y;
  },
  zoom(value) { if (Number.isFinite(value)) view.zoom = sceneClamp(value, .1, 8); },
  shake(strength, duration) {
   if (!Number.isFinite(strength) || !Number.isFinite(duration)) return;
   shake = duration > 0 && strength > 0 ? { age: 0, strength: Math.min(128, strength), duration: Math.min(30, duration) } : undefined;
  },
 };
}

const particleDefaults = {
 rate: 18, lifetime: .7, direction: -90, spread: 90, speed: 90, variation: 25, gravity: 70,
 startSize: 8, endSize: 2, spin: 0, opacity: 1, fade: true, additive: false,
 startColor: '#ffe39c', endColor: '#eb765d', sprite: '', clip: '', animationSpeed: 1,
};

function particleTint(value, fallback) {
 return /^#[0-9a-f]{6}$/i.test(value) ? Number.parseInt(value.slice(1), 16) : fallback;
}

function mixParticleTint(start, end, fraction) {
 let result = 0;
 for (const shift of [16, 8, 0]) {
  const from = (start >> shift) & 255, to = (end >> shift) & 255;
  result |= Math.round(from + (to - from) * fraction) << shift;
 }
 return result;
}

function createParticleField(types) {
 const items = [];
 let randomState = 0x37b06d;
 const fractions = new WeakMap();

 function random() {
  randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
  return randomState / 0x100000000;
 }

 function emit(object, settings, amount) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const x = object.x + object.w / 2, y = object.y + object.h / 2;
  const sprite = types[settings.sprite === '$emitter' ? object.type : settings.sprite];
  const art = sprite?.kind === 'sprite' && sprite.image ? sprite : undefined;
  const clip = art?.animator?.clips.find(item => item.id === settings.clip || item.name === settings.clip ||
   (!settings.clip && item.id === art.animator.autoplay));
  const duration = clip ? clipDuration(clip) : 0;
  const animationSpeed = sceneClamp(settings.animationSpeed, 0, 16);
  const screenSpace = Boolean(types[object.type]?.screenSpace);
  const life = sceneClamp(settings.lifetime, .02, 60);
  const startColor = particleTint(settings.startColor, 0xffe39c), endColor = particleTint(settings.endColor, 0xeb765d);
  const startSize = sceneClamp(settings.startSize, 0, 512), endSize = sceneClamp(settings.endSize, 0, 512);
  const direction = (object.angle % 360) + (settings.direction % 360);
  const variation = Math.min(6000, Math.abs(settings.variation));
  const limit = Math.min(Math.floor(amount), 1024, 4096 - items.length);
  for (let i = 0; i < limit; i++) {
   const angle = (direction + (random() - .5) * sceneClamp(settings.spread, 0, 360)) * Math.PI / 180;
   const speed = sceneClamp(settings.speed + (random() - .5) * 2 * variation, 0, 6000);
   items.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, angle: 0, age: 0,
    life, settings, art, clip, duration, animationSpeed, screenSpace, startColor, endColor, startSize, endSize,
    size: startSize, alpha: sceneClamp(settings.opacity, 0, 1), tint: startColor,
    pose: clip ? animationPose(clip, 0) : undefined, frame: 0 });
  }
 }

 function continuous(object, settings, seconds) {
  const rate = sceneClamp(settings.rate, 0, 2000);
  if (!rate) return;
  const total = (fractions.get(object) ?? 0) + rate * seconds;
  const count = Math.floor(total);
  fractions.set(object, total - count);
  emit(object, settings, count);
 }

 function advance(seconds) {
  let count = 0;
  for (const particle of items) {
   particle.age += seconds;
   if (particle.age >= particle.life) continue;
   const { settings, age, life, art, clip } = particle;
   particle.vy += sceneClamp(settings.gravity, -10000, 10000) * seconds;
   particle.x += particle.vx * seconds;
   particle.y += particle.vy * seconds;
   particle.angle += sceneClamp(settings.spin, -14400, 14400) * seconds;
   const progress = age / life;
   particle.size = particle.startSize + (particle.endSize - particle.startSize) * progress;
   particle.alpha = sceneClamp(settings.opacity, 0, 1) * (settings.fade ? 1 - progress : 1);
   if (art && clip) particle.pose = animationPose(clip, clipTime(clip, age * 1000 * particle.animationSpeed, particle.duration));
   else if (art?.sheet?.fps) particle.frame = Math.floor(age * art.sheet.fps * particle.animationSpeed) % art.sheet.count;
   if (!art) particle.tint = mixParticleTint(particle.startColor, particle.endColor, progress);
   items[count++] = particle;
  }
  items.length = count;
 }

 return { items, emit, continuous, advance, clear() { items.length = 0; } };
}

function particleDrawSize(particle) {
 if (!particle.art) return [particle.size, particle.size];
 const w = particle.art.w || 1, h = particle.art.h || 1;
 const scale = particle.size / Math.max(w, h);
 return [w * scale, h * scale];
}

function drawSceneParticles(ctx, particles, images, screenSpace) {
 for (const particle of particles) {
  if (particle.screenSpace !== screenSpace || particle.size <= 0 || particle.alpha <= 0) continue;
  const [w, h] = particleDrawSize(particle);
  ctx.save();
  if (particle.settings.additive) ctx.globalCompositeOperation = 'lighter';
  if (particle.art) {
   const image = tileImage(images, particle.art);
   if (image.complete && image.naturalWidth) drawObjectPose(ctx, particle.art,
    { x: particle.x - w / 2, y: particle.y - h / 2, w, h, opacity: particle.alpha, angle: particle.angle,
     pose: particle.pose, animFrame: particle.pose?.frame ?? particle.frame }, images);
  } else {
   ctx.translate(particle.x, particle.y);
   ctx.rotate(particle.angle * Math.PI / 180);
   ctx.globalAlpha = particle.alpha;
   ctx.fillStyle = '#' + particle.tint.toString(16).padStart(6, '0');
   ctx.fillRect(-w / 2, -h / 2, w, h);
  }
  ctx.restore();
 }
}
