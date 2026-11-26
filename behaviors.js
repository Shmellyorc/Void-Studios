const SELF_TARGET = '$self';

const BUILT_IN_BEHAVIORS = Object.freeze({
 move8: {
  name: 'Top-Down Movement', description: 'Move in eight directions with WASD or the arrow keys.',
  fields: [['speed', 'Speed (px/s)', 150]],
  step(object, { speed }, { dt, horizontal, vertical, move }) {
   const distance = speed * dt / (Math.hypot(horizontal, vertical) || 1);
   move(object, horizontal * distance, vertical * distance);
  },
 },
 platform: {
  name: 'Platformer', description: 'Run and jump with gravity. Land on objects with Solid attached.',
  fields: [['speed', 'Speed (px/s)', 150], ['jump', 'Jump speed', 380], ['gravity', 'Gravity', 950]],
  step(object, { speed, jump, gravity }, { dt, horizontal, jumpPressed, move }) {
   if (jumpPressed && object.ground) object.vy = -jump;
   object.vy += gravity * dt;
   object.ground = false;
   move(object, horizontal * speed * dt, object.vy * dt);
  },
 },
 solid: {
  name: 'Solid', description: 'Block objects that move with solid collisions.', fields: [],
 },
 bullet: {
  name: 'Bullet', description: 'Travel continuously in the direction the object faces.',
  fields: [['speed', 'Speed (px/s)', 150], ['bounce', 'Bounce at layout edges', false]],
  step(object, { speed, bounce }, { dt, layout, clamp }) {
   const angle = object.angle * Math.PI / 180;
   object.x += Math.cos(angle) * speed * dt;
   object.y += Math.sin(angle) * speed * dt;
   if (!bounce) return;
   const hitX = object.x < 0 || object.x + object.w > layout.width;
   const hitY = object.y < 0 || object.y + object.h > layout.height;
   if (hitX) object.angle = 180 - object.angle;
   if (hitY) object.angle = -object.angle;
   if (hitX || hitY) {
    object.x = clamp(object.x, 0, layout.width - object.w);
    object.y = clamp(object.y, 0, layout.height - object.h);
   }
  },
 },
 rotate: {
  name: 'Rotate', description: 'Spin continuously around the center of the object.',
  fields: [['rotation', 'Degrees per second', 90]], afterAnimation: true,
  step(object, { rotation }, { dt }) { object.angle += rotation * dt; },
 },
 fade: {
  name: 'Fade and Destroy', description: 'Fade the object out, then remove it from the layout.',
  fields: [['fadeTime', 'Fade duration (s)', 1]], afterAnimation: true,
  step(object, { fadeTime }, { dt }) {
   object.opacity -= dt / (fadeTime || 1);
   if (object.opacity <= 0) object.dead = true;
  },
 },
 bound: {
  name: 'Bound to Layout', description: 'Keep the object inside the layout edges.', fields: [], afterAnimation: true,
  step(object, _settings, { layout, clamp }) {
   object.x = clamp(object.x, 0, layout.width - object.w);
   object.y = clamp(object.y, 0, layout.height - object.h);
  },
 },
});

function builtInBehavior(id) {
 return Object.hasOwn(BUILT_IN_BEHAVIORS, id) ? BUILT_IN_BEHAVIORS[id] : undefined;
}

function behaviorSettings(fields, values) {
 return Object.fromEntries(fields.map(([key, , fallback]) => {
  const value = values?.[key];
  return [key, typeof value === typeof fallback && (typeof value !== 'number' || Number.isFinite(value))
   ? value : fallback];
 }));
}

function customBehaviorFields(sheet) {
 return Object.entries(sheet.defaults).map(([key, value]) => [key, key, value]);
}

function normalizeProjectBehaviors(project) {
 project.behaviorSheets ??= [];
 for (const type of project.types) {
  if (Array.isArray(type.behaviors)) continue;

  // Version 1 projects stored checkboxes and shared numbers on the object type.
  const legacy = type.behaviors || {};
  type.behaviors = Object.entries(BUILT_IN_BEHAVIORS)
   .filter(([id]) => legacy[id])
   .map(([id, { fields }]) => ({ id, settings: Object.fromEntries(fields.map(([key, , fallback]) => [
    key, typeof fallback === 'boolean' ? Boolean(legacy[key]) : Number(legacy[key]) || fallback,
   ])) }));
 }
 return project;
}
