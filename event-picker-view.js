import { LitElement, css, html, nothing } from 'lit';
import { live } from 'lit/directives/live.js';

class EventPicker extends LitElement {
 static properties={
  model:{attribute:false},stage:{state:true},targetKey:{state:true},commandId:{state:true},filter:{state:true},
  values:{state:true},menu:{state:true},error:{state:true},
 };
 static styles=css`
  :host { display:flex; flex-direction:column; min-height:0; height:100%; color:var(--text); }
  * { box-sizing:border-box; }
  header,footer { flex:none; display:flex; gap:10px; padding:12px 16px; align-items:center; background:#202a35; }
  header { border-bottom:1px solid #405164; }
  footer { border-top:1px solid #405164; justify-content:flex-end; }
  header h2 { margin:0; font-size:16px; flex:1; }
  header small { color:var(--sub); }
  .body { flex:1; min-height:0; overflow:auto; padding:14px 16px; }
  .tools { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between; margin-bottom:12px; }
  .tools span { color:var(--sub); }
  input,select,button { font:inherit; color:inherit; border:1px solid #42576a; border-radius:5px; min-width:0; }
  input,select { background:#141d26; padding:7px 8px; width:100%; }
  input:focus-visible,select:focus-visible,button:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  input[type=search] { width:min(100%,260px); }
  button { background:#293847; padding:6px 9px; cursor:pointer; }
  button:hover { background:#3c5269; }
  button:disabled { cursor:default; opacity:.4; }
  .primary { background:#274d40; border-color:#598e7c; color:#a5efce; }
  .targets,.commands { display:grid; gap:6px; }
  .targets { grid-template-columns:repeat(auto-fill,minmax(122px,1fr)); }
  .commands { grid-template-columns:repeat(auto-fill,minmax(172px,1fr)); }
  .targets button,.commands button { display:flex; gap:7px; align-items:center; text-align:left; min-height:39px; }
  .targets strong { color:var(--target-color); font-size:17px; }
  .commands strong { color:#8ac6e6; }
  .commands button[aria-pressed=true] { border-color:#77baa5; background:#254437; }
  h3 { font-size:11px; letter-spacing:.07em; color:var(--sub); margin:13px 0 6px; border-bottom:1px solid #405164; padding-bottom:4px; }
  .description { display:block; padding:7px 9px; margin:0 0 10px; background:#243543; color:#c2d7e7; border-radius:4px; }
  .parameters { display:grid; gap:12px; width:min(100%,620px); }
  .parameter { display:grid; gap:4px; }
  .parameter label { color:var(--sub); }
  .expression-box { position:relative; }
  input[data-expression] { font:13px ui-monospace,monospace; }
  .suggestions { position:absolute; top:calc(100% + 2px); left:0; z-index:2; width:min(100%,340px); max-height:154px; overflow:auto; background:#1b2834;
   border:1px solid #57748d; border-radius:4px; box-shadow:0 6px 16px #0009; padding:3px; }
  .suggestions button { display:block; width:100%; border:0; border-radius:2px; text-align:left; padding:5px 7px; background:transparent; }
  .suggestions button[aria-selected=true],.suggestions button:hover { background:#36536b; }
  .expression-help,.empty { color:var(--sub); }
  .error { color:#f7a6ae; margin:9px 0 0; }
 `;

 open(model) {
  this.model=model;
  this.targetKey=model.selectedTarget||'';
  this.commandId=model.selectedCommand||'';
  this.values={...model.values};
  this.stage=this.command?'parameters':'targets';
  this.filter='';
  this.menu=null;
  this.error='';
  if (this.command) this.chooseCommand(this.command);
  else this.focusSearch();
 }

 get target() { return this.model?.targets.find(item=>item.key===this.targetKey); }
 get command() { return this.target?.commands.find(item=>item.id===this.commandId); }

 async focusSearch() {
  await this.updateComplete;
  requestAnimationFrame(()=>this.renderRoot.querySelector('input[type=search]')?.focus({preventScroll:true}));
 }

 chooseTarget(target) {
  if (target.key!==this.targetKey) {this.commandId='';this.values={};}
  this.targetKey=target.key;
  this.stage='commands';
  this.filter='';
  this.focusSearch();
 }

 chooseCommand(command) {
  const fresh=this.commandId===command.id;
  this.commandId=command.id;
  this.values=Object.fromEntries(command.fields.map(field=>[
   field.key,fresh && Object.hasOwn(this.values,field.key)?String(this.values[field.key]):
    field.options?.some(([value])=>value===field.fallback) || !field.options?field.fallback:(field.options[0]?.[0]??field.fallback),
  ]));
  this.stage='parameters';
  this.menu=null;
  this.error='';
  this.updateComplete.then(()=>this.renderRoot.querySelector('.parameter input,.parameter select')?.focus({preventScroll:true}));
 }

 back() {
  this.stage=this.stage==='parameters'?'commands':'targets';
  this.menu=null;
  this.error='';
  this.filter='';
  this.focusSearch();
 }

 close() { this.dispatchEvent(new CustomEvent('event-picker-close')); }

 save() {
  if (!this.command || this.command.fields.some(field=>field.options && !field.options.length && !this.values[field.key])) {
   this.error='Choose a value for each available parameter.';
   return;
  }
  this.dispatchEvent(new CustomEvent('event-picker-save',{detail:{...this.command,target:this.targetKey,values:this.values}}));
 }

 suggestions(input,key) {
  const position=input.selectionStart??input.value.length;
  const before=input.value.slice(0,position);
  const token=before.match(/[A-Za-z_$][\w$]*(?:\.[\w$]*)*$/)?.[0]??'';
  const dot=token.lastIndexOf('.');
  const namespace=dot<0?'':token.slice(0,dot);
  const prefix=token.slice(dot+1).toLowerCase();
  const data=this.target.expressions;
  if (!prefix && !namespace) {this.menu=null;return;}
  const candidates=namespace?Object.hasOwn(data.members,namespace)?data.members[namespace]:[]:
   [...data.names,...data.functions];
  const items=[...new Set(candidates)].filter(name=>name.toLowerCase().startsWith(prefix) && name!==token.split('.').at(-1)).slice(0,16)
   .map(name=>({label:name,value:!namespace && data.functions.includes(name)?name+'(':name}));
  this.menu=items.length?{key,items,index:0,start:position-prefix.length,end:position}:null;
 }

 acceptSuggestion(item,input) {
  const {key,start,end}=this.menu;
  const value=input.value.slice(0,start)+item.value+input.value.slice(end);
  this.values={...this.values,[key]:value};
  this.menu=null;
  this.updateComplete.then(()=>{
   input.focus();
   input.setSelectionRange(start+item.value.length,start+item.value.length);
  });
 }

 expressionKeys(event,key) {
  const menu=this.menu;
  if (!menu || menu.key!==key || !['ArrowUp','ArrowDown','Enter','Escape','Tab'].includes(event.key)) return;
  if (event.key==='Tab') {this.menu=null;return;}
  event.preventDefault();
  event.stopPropagation();
  if (event.key==='Escape') {this.menu=null;return;}
  if (event.key==='Enter') return this.acceptSuggestion(menu.items[menu.index],event.target);
  const index=(menu.index+(event.key==='ArrowUp'?-1:1)+menu.items.length)%menu.items.length;
  this.menu={...menu,index};
  this.updateComplete.then(()=>this.renderRoot.querySelector('[role=option][aria-selected=true]')?.scrollIntoView({block:'nearest'}));
 }

 renderParameter(parameter) {
  const {key,label,expression}=parameter;
  const value=String(this.values[key]??parameter.fallback??'');
  let options=parameter.options;
  if (options && value && !options.some(([candidate])=>candidate===value)) {
   const existing=options.find(([,label])=>label===value);
   options=[...options,[value,existing?.[1]??value+' (saved)']];
  }
  const store=(value)=>{this.values={...this.values,[key]:value};this.error='';};
  const menu=expression && this.menu?.key===key?this.menu:null;
  return html`<div class="parameter"><label for=${'param-'+key}>${label}</label>
   ${options ? html`<select id=${'param-'+key} data-field=${key} .value=${live(value)}
    @change=${event=>store(event.target.value)}>
    ${options.length?options.map(([choice,name])=>html`<option value=${choice} ?selected=${choice===value}>${name}</option>`):html`<option value="">No options available</option>`}
   </select>`:html`<div class="expression-box">
    <input id=${'param-'+key} data-field=${key} ?data-expression=${expression} .value=${live(value)}
     role=${expression?'combobox':nothing} aria-autocomplete=${expression?'list':nothing}
     aria-expanded=${expression?Boolean(menu):nothing} aria-controls=${menu?'expression-options':nothing}
     aria-activedescendant=${menu?'expression-'+menu.index:nothing}
     @input=${event=>{store(event.target.value);if(expression)this.suggestions(event.target,key);}}
     @keydown=${event=>{if(expression)this.expressionKeys(event,key);}}
     @blur=${()=>{this.menu=null;}} spellcheck="false" autocomplete="off">
    ${menu?html`<div class="suggestions" role="listbox" id="expression-options">
     ${menu.items.map((item,i)=>html`<button type="button" role="option" id=${'expression-'+i} aria-selected=${menu.index===i}
      @pointerdown=${event=>event.preventDefault()} @click=${()=>this.acceptSuggestion(item,this.renderRoot.getElementById('param-'+key))}>${item.label}</button>`)}
    </div>`:nothing}
   </div>`}
  </div>`;
 }

 render() {
  if (!this.model) return nothing;
  const title=(this.model.editing?'Edit ':'Add ')+this.model.label;
  const matching=text=>text.toLowerCase().includes(this.filter.toLowerCase().trim());
  const targets=this.model.targets.filter(target=>matching(target.name));
  const commands=(this.target?.commands??[]).filter(command=>matching(command.label+' '+command.category));
  const grouped=Object.groupBy(commands,command=>command.category);
  const search=label=>html`<input type="search" aria-label=${label} placeholder=${label} .value=${live(this.filter)}
   @input=${event=>{this.filter=event.target.value;}}>`;
  return html`<header><h2>${title}</h2><small>${this.stage==='targets'?'Target · 1 of 3':this.stage==='commands'?'Command · 2 of 3':'Parameters · 3 of 3'}</small></header>
   <div class="body">
    ${this.stage==='targets'?html`<div class="tools"><span>Choose a target</span>${search('Search targets')}</div>
     <div class="targets">${targets.map(target=>html`<button type="button" style=${'--target-color:'+target.color}
      @click=${()=>this.chooseTarget(target)}><strong aria-hidden="true">${target.icon}</strong>${target.name}</button>`)}</div>
     ${!targets.length?html`<p class="empty">No matching targets.</p>`:nothing}`:nothing}
    ${this.stage==='commands'?html`<div class="tools"><span>${this.target.name}</span>${search('Search commands')}</div>
     ${Object.entries(grouped).map(([name,list])=>html`<section><h3>${name}</h3><div class="commands">
      ${list.map(command=>html`<button type="button" aria-pressed=${this.commandId===command.id} title=${command.description||command.label}
       @click=${()=>this.chooseCommand(command)}><strong aria-hidden="true">${command.icon}</strong>${command.label}</button>`)}</div></section>`)}
     ${!commands.length?html`<p class="empty">No matching commands.</p>`:nothing}`:nothing}
    ${this.stage==='parameters'?html`<div class="tools"><strong>${this.target.name} · ${this.command.label}</strong></div>
     ${this.command.description?html`<p class="description">${this.command.description}</p>`:nothing}
     <div class="parameters">${this.command.fields.map(parameter=>this.renderParameter(parameter))}</div>
     ${this.command.fields.every(field=>!field.expression)?nothing:html`<p class="expression-help">Type <code>Mouse.</code>, an object name, or a function for suggestions.</p>`}
     ${!this.command.fields.length?html`<p class="empty">Ready to add to the sheet.</p>`:nothing}
     ${this.error?html`<p class="error" role="alert">${this.error}</p>`:nothing}`:nothing}
   </div>
   <footer><button type="button" @click=${this.close}>Cancel</button>
    ${this.stage!=='targets'?html`<button type="button" @click=${this.back}>Back</button>`:nothing}
    ${this.stage==='parameters'?html`<button class="primary" type="button" @click=${this.save}>${this.model.editing?'Apply':'Add to sheet'}</button>`:nothing}
   </footer>`;
 }
}
customElements.define('void-event-picker',EventPicker);
