import { LitElement, css, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';

class AnimationMachineView extends LitElement {
 static properties={model:{attribute:false}};
 static styles=css`
  :host { display:block; min-height:0; flex:1; overflow:auto; padding:20px; color:var(--text); }
  :host([hidden]) { display:none; }
  * { box-sizing:border-box; }
  header,.section-top,.toolbar,.actions,.direction { display:flex; align-items:center; gap:8px; }
  header,.section-top { justify-content:space-between; flex-wrap:wrap; }
  header { margin-bottom:18px; }
  h2,h3,p { margin:0; }
  h2 { font-size:19px; }
  h3 { font-size:13px; }
  .muted,small { color:var(--sub); }
  .section { margin-bottom:20px; }
  .section-top { margin-bottom:8px; }
  .states { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(210px,100%),1fr)); gap:8px; }
  .state,.transition,.empty { background:#212c38; border:1px solid #405264; border-radius:6px; padding:10px; min-width:0; }
  .state { display:grid; gap:9px; }
  .state[data-initial] { border-color:#609d89; }
  .state strong,.direction strong { overflow-wrap:anywhere; }
  .initial { color:#93e4c7; border:1px solid #4d756c; padding:2px 5px; border-radius:3px; font-size:10px; }
  .caption { display:flex; justify-content:space-between; align-items:center; gap:6px; }
  .actions { gap:4px; flex-wrap:wrap; }
  .rules { display:grid; gap:5px; }
  .transition { display:grid; grid-template-columns:2.2ch minmax(0,1fr) auto; align-items:center; gap:9px; }
  .conditions { display:flex; flex-wrap:wrap; gap:5px; color:var(--sub); margin-top:5px; }
  .condition { padding:2px 5px; background:#18242f; border-radius:3px; overflow-wrap:anywhere; max-width:100%; }
  button { font:inherit; color:inherit; cursor:pointer; padding:5px 8px; border:1px solid #485b6e; border-radius:4px; background:#2c3b49; }
  button:hover:enabled { background:#3b5268; }
  button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  button:disabled { opacity:.38; cursor:default; }
  button.primary,button[aria-pressed=true] { background:#23443c; border-color:#588e7d; color:#b8efd8; }
  button.danger { color:#f5a7b0; }
  .empty p { color:var(--sub); line-height:1.5; }
  .empty button { margin-top:8px; }
  @media (max-width:1050px) {
   :host { padding:12px; }
   .transition { grid-template-columns:2ch minmax(0,1fr); }
   .transition .actions { grid-column:2; }
  }
 `;

 action(action,id) {
  this.dispatchEvent(new CustomEvent('machine-control',{bubbles:true,composed:true,detail:{action,id}}));
 }

 button(label,action,id,{disabled=false,title=label,style=''}={}) {
  return html`<button type="button" class=${style} title=${title} aria-label=${title}
   ?disabled=${disabled} @click=${()=>this.action(action,id)}>${label}</button>`;
 }

 render() {
  const {name,clips,machine,conditions}=this.model??{clips:[]};
  if (!name) return html`<div class="empty"><p>Select an object type to edit its animation state machine.</p></div>`;
  if (!machine) return html`<div class="empty">
   <h2>Animation State Machine</h2><p>${clips.length?'Assign clips to states and choose when they switch.':'Create an Animator clip for this object first.'}</p>
   ${this.button('Create State Machine','create',undefined,{disabled:!clips.length,style:'primary'})}
  </div>`;
  const states=new Map(machine.states.map(state=>[state.id,state.name]));
  const names=new Map(clips.map(clip=>[clip.id,clip.name]));
  const canRemove=machine.states.length>1;
  return html`
   <header><h2>Animation State Machine</h2><div class="toolbar">
    <button type="button" aria-pressed=${machine.enabled} aria-label="Enable state machine"
      @click=${()=>this.action('toggle')}>${machine.enabled?'Enabled':'Disabled'}</button>
    ${this.button('Remove machine','remove',undefined,{style:'danger'})}
   </div></header>
   <section class="section">
    <div class="section-top"><h3>States</h3>${this.button('+ State','newState',undefined,{style:'primary'})}</div>
    <div class="states">
     ${repeat(machine.states,state=>state.id,state=>html`<article class="state" ?data-initial=${state.id===machine.initial}>
      <div class="caption"><strong>${state.name}</strong>${state.id===machine.initial?html`<span class="initial">Initial</span>`:nothing}</div>
      <small>Clip · ${names.get(state.clip)}</small>
      <div class="actions">
       ${this.button('Edit','editState',state.id,{title:'Edit '+state.name})}
       ${this.button('Make initial','initial',state.id,{disabled:state.id===machine.initial,title:'Make '+state.name+' initial'})}
       ${this.button('Delete','deleteState',state.id,{disabled:!canRemove,title:'Delete '+state.name,style:'danger'})}
      </div>
     </article>`)}
    </div>
   </section>
   <section class="section">
    <div class="section-top"><h3>Transitions</h3><small>First matching rule wins</small>
     ${this.button('+ Transition','newRule',undefined,{disabled:!canRemove,style:'primary'})}</div>
    <div class="rules">
     ${repeat(machine.transitions,rule=>rule.id,(rule,i)=>html`<article class="transition">
      <small>${i+1}</small>
      <div><div class="direction"><strong>${states.get(rule.from)??'Any state'}</strong><span aria-label="to">→</span><strong>${states.get(rule.to)}</strong></div>
       <div class="conditions">${conditions[i].map(label=>html`<span class="condition">${label}</span>`)}</div></div>
      <div class="actions">
       ${this.button('↑','raiseRule',rule.id,{disabled:i===0,title:'Raise transition '+(i+1)})}
       ${this.button('↓','lowerRule',rule.id,{disabled:i===machine.transitions.length-1,title:'Lower transition '+(i+1)})}
       ${this.button('Edit','editRule',rule.id,{title:'Edit transition '+(i+1)})}
       ${this.button('Delete','deleteRule',rule.id,{title:'Delete transition '+(i+1),style:'danger'})}
      </div>
     </article>`)}
    </div>
   </section>`;
 }
}

customElements.define('void-animation-machine',AnimationMachineView);
