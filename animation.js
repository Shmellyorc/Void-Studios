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
 return playAnimationClip(object,clip,restart);
}

function playAnimationClip(object,clip,restart) {
 if (!restart && object.animation?.clip === clip && !object.animation.stopped) return true;
 object.animation = { clip, duration: clipDuration(clip), elapsed: 0, playing: true, finished: false };
 object.pose = animationPose(clip, 0);
 if (object.pose.frame !== undefined) object.animFrame = object.pose.frame;
 return true;
}

const animationComparisons=['==','!=','>','>=','<','<='];

function describeAnimationCondition(condition) {
 if (condition.kind==='moving') return 'Speed > '+condition.threshold+' px/s';
 if (condition.kind==='stopped') return 'Speed ≤ '+condition.threshold+' px/s';
 if (condition.kind==='finished') return 'Clip finished';
 return condition.variable+' '+condition.operator+' '+JSON.stringify(condition.value);
}

function animationRuleMatches(condition,object,record,state) {
 if (condition.kind==='moving') return record.speed>condition.threshold;
 if (condition.kind==='stopped') return record.speed<=condition.threshold;
 if (condition.kind==='finished') return object.animation?.clip===state.clip && object.animation.finished;
 if (!Object.hasOwn(object.vars,condition.variable)) return false;
 const value=object.vars[condition.variable], expected=condition.value, op=condition.operator;
 if (op==='==') return value===expected;
 if (op==='!=') return value!==expected;
 if (!Number.isFinite(value) || !Number.isFinite(expected)) return false;
 if (op==='>') return value>expected;
 if (op==='>=') return value>=expected;
 if (op==='<') return value<expected;
 return value<=expected;
}

function planAnimationMachine(type) {
 const animator=type.animator, machine=animator?.machine;
 if (!machine?.enabled) return null;
 const clips=new Map(animator.clips.map(clip=>[clip.id,clip]));
 const states=new Map(machine.states.filter(state=>clips.has(state.clip)).map(state=>[state.id,{...state,clip:clips.get(state.clip)}]));
 const initial=states.get(machine.initial);
 if (!initial) return null;
 const names=new Map([...states.values()].map(state=>[state.name.toLowerCase(),state]));
 const rules=new Map([...states.keys()].map(id=>[id,[]]));
 machine.transitions.forEach((transition,index)=>{
  const target=states.get(transition.to);
  if (!target) return;
  const rule={...transition,target,reason:'Rule '+(index+1)+' · '+transition.conditions.map(describeAnimationCondition).join(' and ')};
  if (transition.from) rules.get(transition.from)?.push(rule);
  else for (const queue of rules.values()) queue.push(rule);
 });
 return {states,names,initial,rules};
}

function enterAnimationState(object,state,frame,reason,restart=false) {
 const previous=object.animationState;
 if (!restart && previous?.id===state.id && !previous.manual) return;
 const history=[...(previous?.history??[]),{from:previous?.name??'',to:state.name,reason,frame}].slice(-8);
 object.animationState={id:state.id,name:state.name,changedFrame:frame,signalFrame:frame+1,
  x:previous?.x??object.x,y:previous?.y??object.y,speed:previous?.speed??0,history};
 playAnimationClip(object,state.clip,true);
}

function useManualAnimation(object,reason) {
 if (object.animationState) object.animationState.manual=reason;
}

function resolveAnimationState(plan,name) {
 return plan?.states.get(name)??plan?.names.get(String(name??'').trim().toLowerCase());
}

function matchAnimationState(object,plan,name) {
 if (!plan || !object.animationState || object.animationState.manual) return false;
 const target=resolveAnimationState(plan,name);
 return target?.id===object.animationState.id;
}

function updateAnimationMachine(object,plan,frame,dt) {
 const record=object.animationState;
 if (!record) return;
 if (dt>0) record.speed=Math.hypot(object.x-record.x,object.y-record.y)/dt;
 record.x=object.x;
 record.y=object.y;
 if (record.manual || record.changedFrame===frame) return;
 const current=plan.states.get(record.id);
 const rule=plan.rules.get(record.id)?.find(rule=>rule.target.id!==record.id &&
  rule.conditions.every(condition=>animationRuleMatches(condition,object,record,current)));
 if (rule) enterAnimationState(object,rule.target,frame,rule.reason);
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

function drawObjectPose(ctx, type, object, images, fonts) {
 const pose = object.pose ?? {};
 ctx.save();
 ctx.translate(object.x + object.w / 2 + (pose.x ?? 0), object.y + object.h / 2 + (pose.y ?? 0));
 ctx.rotate(((object.angle || 0) + (pose.angle ?? 0)) * Math.PI / 180);
 ctx.scale(pose.scaleX ?? 1, pose.scaleY ?? 1);
 ctx.globalAlpha *= Math.max(0, Math.min(1, (object.opacity ?? 1) * (pose.opacity ?? 1)));
 drawObject(ctx, type, object, images, fonts);
 ctx.restore();
}
