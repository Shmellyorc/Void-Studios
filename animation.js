const ANIMATION_TRACKS = {
 x: ['Offset X', 0], y: ['Offset Y', 0], angle: ['Rotation', 0],
 scaleX: ['Scale X', 1], scaleY: ['Scale Y', 1], opacity: ['Opacity', 1],
};

function clipDuration(clip) {
 return Math.max(1, clip.duration, clip.frames.reduce((duration, frame) => duration + frame.duration, 0),
  ...Object.values(clip.tracks).map(keys => keys.at(-1)?.time ?? 0));
}

function clipTime(clip, elapsed, duration = clipDuration(clip)) {
 if (clip.loop === 'once') return Math.min(duration, elapsed);
 if (clip.loop === 'pingpong') {
  const position = elapsed % (2 * duration);
  return position <= duration ? position : 2 * duration - position;
 }
 return elapsed % duration;
}

function animationPose(clip, time) {
 const pose = {};
 let elapsed = 0;
 for (const frame of clip.frames) {
  pose.frame = frame.tile;
  elapsed += frame.duration;
  if (time < elapsed) break;
 }
 for (const [name, keys] of Object.entries(clip.tracks)) {
  if (!keys.length) continue;
  const right = keys.findIndex(key => key.time > time);
  if (right === 0) {
   pose[name] = keys[0].value;
  } else if (right < 0) {
   pose[name] = keys.at(-1).value;
  } else {
   const [a, b] = [keys[right - 1], keys[right]];
   const fraction = a.hold ? 0 : (time - a.time) / (b.time - a.time);
   pose[name] = a.value + fraction * (b.value - a.value);
  }
 }
 return pose;
}

function playSpriteClip(object, type, name, restart = false) {
 const clip = type.animator?.clips.find(item => item.name === name || item.id === name);
 if (!clip) return false;
 if (!restart && object.animation?.clip === clip && !object.animation.stopped) return true;
 object.animation = { clip, duration: clipDuration(clip), elapsed: 0, playing: true, finished: false };
 object.pose = animationPose(clip, 0);
 if (object.pose.frame !== undefined) object.animFrame = object.pose.frame;
 return true;
}

function advanceSpriteAnimation(object, type, seconds) {
 const { animation } = object;
 if (!animation) {
  const sheet = type.sheet;
  if (sheet && sheet.count > 0 && sheet.fps > 0 && sheet.w > 0 && sheet.h > 0 && sheet.cols > 0) {
   object.animTime = (object.animTime || 0) + seconds;
   object.animFrame = Math.floor(object.animTime * sheet.fps) % sheet.count;
  }
  return;
 }
 animation.finished = false;
 if (!animation.playing) return;
 animation.elapsed += seconds * 1000;
 const { clip, duration, elapsed } = animation;
 object.pose = animationPose(clip, clipTime(clip, elapsed, duration));
 if (object.pose.frame !== undefined) object.animFrame = object.pose.frame;
 if (clip.loop === 'once' && elapsed >= duration) {
  animation.playing = false;
  animation.finished = true;
 }
}

function drawObjectPose(ctx, type, object, images) {
 const pose = object.pose ?? {};
 ctx.save();
 ctx.translate(object.x + object.w / 2 + (pose.x ?? 0), object.y + object.h / 2 + (pose.y ?? 0));
 ctx.rotate(((object.angle || 0) + (pose.angle ?? 0)) * Math.PI / 180);
 ctx.scale(pose.scaleX ?? 1, pose.scaleY ?? 1);
 ctx.globalAlpha *= Math.max(0, Math.min(1, (object.opacity ?? 1) * (pose.opacity ?? 1)));
 drawObject(ctx, type, object, images);
 ctx.restore();
}
