import { LitElement, css, html, svg, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { live } from 'lit/directives/live.js';

const controls = css`
 :host { color:var(--text); font:inherit; }
 *, *::before, *::after { box-sizing:border-box; }
 button,input,summary { font:inherit; color:inherit; }
 button,summary { cursor:pointer; }
 button { border:1px solid #3b4a59; border-radius:5px; background:#2a3541; padding:4px 7px; }
 button:hover,summary:hover { background-color:#354657; }
 button:disabled { opacity:.38; cursor:default; }
 button:focus-visible,summary:focus-visible,input:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
 button[aria-pressed=true] { color:#a5f3d1; border-color:#648d82; background-color:#253d38; }
 input { min-width:0; border:1px solid #435365; border-radius:4px; background:#151c25; padding:4px; }
 .tools { display:flex; align-items:center; gap:4px; }
 .icon { display:grid; place-items:center; width:27px; height:27px; padding:0; flex:none; }
 svg { width:16px; height:16px; }
 details { position:relative; }
 summary { border-radius:4px; list-style:none; user-select:none; }
 summary::-webkit-details-marker { display:none; }
 summary.icon { border:1px solid #3b4a59; background:#2a3541; }
 summary.icon:hover { background:#354657; }
 .options { display:grid; gap:2px; color:var(--text); background:#202a35; padding:4px; border:1px solid #4b5e72; border-radius:5px; }
 .options button { text-align:left; background:transparent; border-color:transparent; }
 .options button:hover { background:#354657; }
 .checker { background:repeating-conic-gradient(#687788 0% 25%,#354255 0% 50%) 0 0 / 10px 10px; }
`;

const glyphs = {
 menu:svg`<path d="M4 6h12M4 10h12M4 14h12"/>`,
 collapse:svg`<path d="m6 8 4 4 4-4"/>`,
 expand:svg`<path d="m8 6 4 4-4 4"/>`,
 plus:svg`<path d="M10 4v12M4 10h12"/>`,
 lock:svg`<rect x="5" y="9" width="10" height="8" rx="1"/><path d="M7 9V6a3 3 0 0 1 6 0v3"/>`,
 unlock:svg`<rect x="5" y="9" width="10" height="8" rx="1"/><path d="M7 9V6a3 3 0 0 1 6 0"/>`,
 presets:svg`<rect x="3" y="5" width="14" height="10" rx="1"/><path d="M7 5v10m4-10v10"/>`,
 sort:svg`<path d="M4 5h7M4 9h5m-5 4h3m7-8v10m-3-3 3 3 3-3"/>`,
 grip:svg`<path d="M8 5v10m4-10v10"/>`,
 eye:svg`<path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z"/><circle cx="10" cy="10" r="2"/>`,
 eyeOff:svg`<path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Zm2-6 12 12"/>`,
 mirrorX:svg`<path d="M10 3v14M7 5l-4 9h4m6-9 4 9h-4"/>`,
 mirrorY:svg`<path d="M3 10h14M5 7l9-4v4m-9 6 9 4v-4"/>`,
};

function icon(name) {
 return html`<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"
  stroke-linejoin="round" aria-hidden="true">${glyphs[name]}</svg>`;
}

function send(host, action, detail = {}) {
 host.dispatchEvent(new CustomEvent('sprite-control', { bubbles:true, composed:true, detail:{ action, ...detail } }));
}

function closeOptions(event) {
 if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open=false;
}

function option(action, label, disabled = false) {
 return html`<button type="button" ?disabled=${disabled} @click=${event=>{
  event.currentTarget.closest('details').open=false;
  action();
 }}>${label}</button>`;
}

class SpritePanel extends LitElement {
 static properties = { config:{ attribute:false } };
 static styles = [controls,css`
  :host { display:block; border-bottom:1px solid var(--line); }
  :host([hidden]) { display:none; }
  header { display:flex; justify-content:space-between; align-items:center; min-height:36px; padding:4px 8px; background:#202934; }
  .heading { display:flex; align-items:center; gap:5px; border:0; background:transparent; padding:3px; }
  .heading span { font-size:11px; font-weight:750; text-transform:uppercase; letter-spacing:.075em; }
  .options { position:absolute; top:29px; right:0; z-index:4; width:max-content; }
 `];

 render() {
  if (!this.config) return nothing;
  const { id,label,collapsed,side,first,last }=this.config;
  const command=(action)=>send(this,'panel',{ id, command:action });
  return html`
   <header>
    <button class="heading" type="button" aria-expanded=${!collapsed} aria-controls="body" @click=${()=>command('collapse')}>
     ${icon(collapsed?'expand':'collapse')}<span>${label}</span>
    </button>
    <details @focusout=${closeOptions}>
     <summary class="icon" title=${label+' panel options'} aria-label=${label+' panel options'}>${icon('menu')}</summary>
     <div class="options">
      ${option(()=>command('up'),'Move up',first)}
      ${option(()=>command('down'),'Move down',last)}
      ${option(()=>command('side'),side==='left'?'Move to right':'Move to left')}
      ${option(()=>command('hide'),'Hide panel')}
     </div>
    </details>
   </header>
   <div id="body" ?hidden=${collapsed}><slot></slot></div>`;
 }
}

class SpriteBrush extends LitElement {
 static properties = { model:{ attribute:false } };
 static styles = [controls,css`
  :host { display:block; }
  :host([hidden]) { display:none; }
  label { display:flex; align-items:center; gap:5px; color:var(--sub); font-size:11px; }
  input { width:45px; }
 `];

 render() {
  if (!this.model) return nothing;
  const { size, mirrorX, mirrorY }=this.model;
  const mirror=(id,label,checked)=>html`<button class="icon" type="button" title=${label} aria-label=${label}
   aria-pressed=${checked} @click=${()=>send(this,id)}>${icon(id)}</button>`;
  return html`<div class="tools">
   <label title="Brush size in pixels">Size <input type="number" min="1" max="16" step="1" data-field="sprite.size"
    .value=${live(String(size))} @change=${event=>send(this,'brushSize',{ value:event.target.value })}></label>
   ${mirror('mirrorX','Mirror horizontally',mirrorX)}
   ${mirror('mirrorY','Mirror vertically',mirrorY)}
  </div>`;
 }
}

class SpritePalette extends LitElement {
 static properties = { model:{ attribute:false }, active:{ state:true }, anchor:{ state:true }, preview:{ state:true } };
 static styles = [controls,css`
  :host { display:block; padding:7px 8px 10px; }
  .tools { margin-bottom:7px; }
  details[open] .options { position:absolute; top:29px; left:0; z-index:2; width:max-content; max-width:170px; }
  details:last-child .options { left:auto; right:0; }
  .swatches { display:grid; grid-template-columns:repeat(auto-fill,minmax(var(--swatch-size,22px),1fr)); gap:3px; }
  .swatch,.grip { position:relative; min-width:0; width:100%; aspect-ratio:1; border-radius:3px; padding:0; }
  .swatch:not(.checker) { background:var(--color); }
  .swatch[data-active] { outline:1px solid var(--accent); outline-offset:1px; }
  .swatch[data-left]::before,.swatch[data-right]::after {
   content:''; position:absolute; width:8px; height:8px; background:#fff; filter:drop-shadow(1px 1px 0 #000);
  }
  .swatch[data-left]::before { inset:1px auto auto 1px; clip-path:polygon(0 0,100% 0,0 100%); }
  .swatch[data-right]::after { inset:auto 1px 1px auto; clip-path:polygon(100% 0,100% 100%,0 100%); }
  .grip { display:grid; place-items:center; touch-action:none; cursor:grab; color:var(--sub); }
  .grip:active { cursor:grabbing; }
  .grip[data-dragging] { color:var(--accent); }
  .resize-count { display:block; color:var(--sub); font:11px system-ui; margin-top:6px; }
  .inks { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:12px; }
  .ink label { display:block; color:var(--sub); font-size:11px; }
  .ink input { display:block; width:100%; margin:3px 0 5px; }
  .ink input[type=color] { height:27px; padding:2px; }
  .ink input::-webkit-color-swatch { opacity:var(--alpha); }
  .ink input::-moz-color-swatch { opacity:var(--alpha); }
  .ink .tools { margin:0; }
 `];

 willUpdate(changed) {
  if (changed.has('model') && changed.get('model')?.id!==this.model?.id) {
   this.active=this.anchor=undefined;
   this.preview=undefined;
   this.drag=null;
  }
 }

 select(event,index,side) {
  if (side==='right') event.preventDefault();
  if (index!==null) {
   if (!event.shiftKey || this.anchor==null) this.anchor=index;
   this.active=index;
  }
  send(this,'pickPalette',{ index,side });
 }

 setCount(count) {
  count=Math.max(0,Math.min(Math.max(256,this.model.colors.length),count));
  if (count!==this.model.colors.length) send(this,'paletteSize',{ count });
 }

 startResize(event) {
  if (event.button!==0 || this.model.locked) return;
  const grip=event.currentTarget, grid=grip.parentElement, css=getComputedStyle(grid);
  const cols=css.gridTemplateColumns.split(' ').length;
  const { width,height }=grip.getBoundingClientRect();
  this.drag={ id:event.pointerId, area:grid.getBoundingClientRect(), cols,
   dx:width+parseFloat(css.columnGap), dy:height+parseFloat(css.rowGap) };
  this.preview=this.model.colors.length;
  grip.focus({ preventScroll:true });
  grip.setPointerCapture(event.pointerId);
 }

 moveResize(event) {
  const move=this.drag;
  if (move?.id!==event.pointerId) return;
  const col=Math.max(0,Math.min(move.cols-1,Math.floor((event.clientX-move.area.left)/move.dx)));
  const row=Math.max(0,Math.floor((event.clientY-move.area.top)/move.dy));
  this.preview=Math.max(0,Math.min(Math.max(256,this.model.colors.length),row*move.cols+col-1));
 }

 endResize(event,apply) {
  if (this.drag?.id!==event.pointerId) return;
  const count=this.preview;
  this.drag=null;
  this.preview=undefined;
  if (apply) this.setCount(count);
 }

 resizeKeys(event) {
  const delta={ ArrowLeft:-1, ArrowRight:1, ArrowDown:1, ArrowUp:-1 }[event.key];
  if (delta) {
   event.preventDefault();
   this.setCount(this.model.colors.length+delta);
  } else if (event.key==='Escape' && this.drag) {
   event.stopPropagation();
   this.endResize({pointerId:this.drag.id},false);
  }
 }

 renderInk(side,ink,locked,colors) {
  const label=side==='left'?'Left':'Right', suffix=side==='left'?'':'right';
  return html`<div class="ink" style=${styleMap({'--alpha':String(ink.alpha/255)})}>
   <label>${label} color<input class="checker" type="color" data-field=${suffix?'sprite.rightColor':'sprite.color'}
    .value=${live(ink.color)} @change=${event=>send(this,'ink',{ side, color:event.target.value })}></label>
   <div class="tools"><label>${label} opacity (%)
    <input type="number" min="0" max="100" step="any" data-field=${suffix?'sprite.rightAlpha':'sprite.alpha'}
     .value=${live(String(Math.round(ink.alpha*1000/255)/10))}
     @change=${event=>send(this,'ink',{ side, opacity:event.target.value })}></label>
    ${!locked && ink.alpha && !colors.includes(ink.color) ? html`<button class="icon" type="button" title=${'Save '+label.toLowerCase()+' color to palette'}
     aria-label=${'Save '+label.toLowerCase()+' color to palette'} @click=${()=>send(this,'saveInk',{ side })}>${icon('plus')}</button>` : nothing}
   </div>
  </div>`;
 }

 render() {
  if (!this.model) return nothing;
  const { colors,left,right,locked,swatchSize }=this.model;
  const count=this.preview??colors.length;
  const validIndex=index=>Number.isInteger(index) && index>=0 && index<colors.length;
  const selected=validIndex(this.active)?this.active:colors.indexOf(left.color);
  const range=validIndex(this.anchor) && validIndex(selected)
   ? [Math.min(this.anchor,selected),Math.max(this.anchor,selected)] : null;
  const grid=Array.from({length:count},(_,i)=>colors[i]??'#000000');
  const command=(action,detail)=>send(this,action,detail);
  const ops=(name)=>command('paletteOperation',{ name,range:range?.[0]!==range?.[1]?range:null });
  return html`
   <div class="tools">
    <button type="button" class="icon" title="Lock palette editing" aria-label="Lock palette editing"
     aria-pressed=${locked} @click=${()=>command('paletteLock')}>${icon(locked?'lock':'unlock')}</button>
    <details @focusout=${closeOptions}>
     <summary class="icon" aria-label="Palette operations" title="Palette operations">${icon('sort')}</summary>
     <div class="options">
      ${option(()=>ops('reverse'),'Reverse colors',locked || colors.length<2)}
      ${option(()=>ops('gradient'),'Gradient between selected colors',locked || !range || range[1]-range[0]<2)}
      ${option(()=>ops('hue'),'Sort by hue',locked || colors.length<2)}
      ${option(()=>ops('brightness'),'Sort by brightness',locked || colors.length<2)}
     </div>
    </details>
    <button type="button" class="icon" aria-label="Palette presets" title="Palette presets" ?disabled=${locked}
     @click=${()=>command('palettePresets')}>${icon('presets')}</button>
    <details @focusout=${closeOptions}>
     <summary class="icon" aria-label="Palette options" title="Palette options">${icon('menu')}</summary>
     <div class="options">
      ${option(()=>command('editSwatch',{ index:selected }),'Edit swatch…',locked || selected<0)}
      ${option(()=>command('removeSwatch',{ index:selected }),'Remove swatch',locked || selected<0)}
      ${option(()=>command('paletteSizeDialog'),'Palette size…',locked)}
      ${[[18,'Small'],[22,'Medium'],[30,'Large']].map(([size,label])=>option(()=>command('swatchSize',{ size }),label+' swatches',size===swatchSize))}
      ${option(()=>command('paletteImport'),'Load palette…',locked)}
      ${option(()=>command('paletteExport'),'Save palette…',!colors.length)}
      ${option(()=>command('savePalettePreset'),'Save palette as preset…',!colors.length)}
      ${option(()=>command('paletteFromSprite'),'New palette from sprite',locked)}
     </div>
    </details>
   </div>
   <div class="swatches" style=${styleMap({'--swatch-size':swatchSize+'px'})}>
    <button class="swatch checker" type="button" title="Transparent · left or right click" aria-label="Transparent"
     ?data-left=${!left.alpha} ?data-right=${!right.alpha} @click=${event=>this.select(event,null,'left')}
     @contextmenu=${event=>this.select(event,null,'right')}></button>
    ${repeat(grid,(_,i)=>i,(color,i)=>html`<button class="swatch" type="button" aria-label=${color}
     title=${color+' · double-click to edit'} style=${styleMap({'--color':color})}
     ?data-active=${range && i>=range[0] && i<=range[1]} ?data-left=${left.alpha>0 && left.color===color}
     ?data-right=${right.alpha>0 && right.color===color}
     @click=${event=>this.select(event,i,'left')} @contextmenu=${event=>this.select(event,i,'right')}
     @dblclick=${()=>{ if (!locked) command('editSwatch',{ index:i }); }}></button>`)}
    <button class="grip" type="button" title="Drag to resize palette, or use arrow keys" aria-label="Resize palette"
     ?disabled=${locked} ?data-dragging=${this.preview!==undefined}
     @pointerdown=${this.startResize} @pointermove=${this.moveResize}
     @pointerup=${event=>this.endResize(event,true)} @pointercancel=${event=>this.endResize(event,false)}
     @lostpointercapture=${event=>this.endResize(event,false)} @keydown=${this.resizeKeys}>${icon('grip')}</button>
   </div>
   ${this.preview!==undefined ? html`<output class="resize-count">${count} colors</output>` : nothing}
   <div class="inks">${this.renderInk('left',left,locked,colors)}${this.renderInk('right',right,locked,colors)}</div>`;
 }
}

class SpriteLayers extends LitElement {
 static properties = { model:{ attribute:false }, editing:{ state:true }, dropTarget:{ state:true } };
 static styles = [controls,css`
  :host { display:block; padding:7px 8px 8px; }
  .tools { margin-bottom:6px; }
  details[open] .options { position:absolute; top:29px; left:0; z-index:2; width:max-content; }
  .stack { display:grid; gap:2px; max-height:340px; overflow:auto; }
  .row { display:grid; grid-template-columns:22px 22px 29px minmax(0,1fr); gap:3px; align-items:center; border:1px solid #344353;
   border-radius:4px; min-height:33px; padding:2px 3px; background:#232e39; }
  .row[data-active] { border-color:#597d9a; background:#31485d; }
  .row[data-drop=above] { box-shadow:inset 0 2px var(--accent); }
  .row[data-drop=below] { box-shadow:inset 0 -2px var(--accent); }
  .row button { min-width:0; padding:2px; border-color:transparent; background:transparent; }
  .row button:hover { background:#596f8670; }
  .row .icon { width:22px; height:24px; color:#ccdae6; }
  .row .thumb { height:25px; padding:0; cursor:grab; background:repeating-conic-gradient(#607080 0% 25%,#344354 0% 50%) 0 0 / 8px 8px; }
  .thumb img { display:block; width:100%; height:100%; object-fit:contain; image-rendering:pixelated; pointer-events:none; }
  .layer-name { display:block; width:100%; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; text-align:left; }
  .rename { width:100%; }
  .layer-opacity { display:flex; gap:5px; align-items:center; margin-top:8px; color:var(--sub); font-size:11px; }
  .layer-opacity input { flex:1; accent-color:var(--accent); padding:0; }
  .layer-opacity output { min-width:3.4ch; text-align:right; }
 `];

 async startRename(id) {
  if (!id) return;
  send(this,'layerAction',{ command:'layer',id });
  this.editing=id;
  await this.updateComplete;
  const field=this.renderRoot.querySelector('.rename');
  field?.focus();
  field?.select();
 }

 finishRename(input,apply) {
  const id=this.editing;
  if (!id) return;
  this.editing=null;
  if (apply) send(this,'renameLayer',{ id,name:input.value });
 }

 startDrag(event,id) {
  this.dragged=id;
  event.dataTransfer.effectAllowed='move';
  event.dataTransfer.setData('text/plain',id);
 }

 dragOver(event,id) {
  if (!this.dragged || this.dragged===id) {
   this.dropTarget=null;
   return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect='move';
  const row=event.currentTarget.getBoundingClientRect();
  this.dropTarget={ id,above:event.clientY<row.top+row.height/2 };
 }

 dropLayer(event) {
  if (!this.dragged || !this.dropTarget) return;
  event.preventDefault();
  send(this,'reorderLayer',{ id:this.dragged,target:this.dropTarget.id,above:this.dropTarget.above });
  this.clearDrag();
 }

 clearDrag() {
  this.dragged=null;
  this.dropTarget=null;
 }

 renderLayer(layer,active) {
  const command=action=>send(this,'layerAction',{ command:action,id:layer.id });
  const drop=this.dropTarget?.id===layer.id?(this.dropTarget.above?'above':'below'):nothing;
  const label=layer.name;
  return html`<div class="row" ?data-active=${active} data-drop=${drop}
   @dragover=${event=>this.dragOver(event,layer.id)} @drop=${this.dropLayer}>
   <button class="icon" type="button" title=${(layer.visible?'Hide ':'Show ')+label} aria-label=${(layer.visible?'Hide ':'Show ')+label}
    @click=${()=>command('visible')}>${icon(layer.visible?'eye':'eyeOff')}</button>
   <button class="icon" type="button" title=${(layer.locked?'Unlock ':'Lock ')+label} aria-label=${(layer.locked?'Unlock ':'Lock ')+label}
    @click=${()=>command('lock')}>${icon(layer.locked?'lock':'unlock')}</button>
   <button class="thumb" type="button" draggable="true" title=${'Drag to reorder '+label} aria-label=${'Select '+label}
    @dragstart=${event=>this.startDrag(event,layer.id)} @dragend=${this.clearDrag} @click=${()=>command('layer')}>
    ${layer.image?html`<img src=${layer.image} alt="" draggable="false">`:nothing}</button>
   ${this.editing===layer.id?html`<input class="rename" aria-label="Layer name" maxlength="100" .value=${label}
    @blur=${event=>this.finishRename(event.target,true)} @keydown=${event=>{
     if (!['Enter','Escape'].includes(event.key)) return;
     event.preventDefault(); event.stopPropagation();
     this.finishRename(event.target,event.key==='Enter');
    }}>`:html`<button type="button" class="layer-name" aria-pressed=${active} title=${label+' · double-click to rename'}
      @click=${()=>command('layer')} @dblclick=${()=>this.startRename(layer.id)}>${label}</button>`}
  </div>`;
 }

 render() {
  if (!this.model) return nothing;
  const { layers, selected }=this.model;
  const index=layers.findIndex(layer=>layer.id===selected);
  const layer=layers[index], below=layers[index-1];
  const command=action=>send(this,'layerAction',{ command:action,id:selected });
  return html`
   <div class="tools">
    <button class="icon" type="button" title="New layer" aria-label="New layer" @click=${()=>command('addLayer')}>${icon('plus')}</button>
    <details @focusout=${closeOptions}>
     <summary class="icon" title="Layer actions" aria-label="Layer actions">${icon('menu')}</summary>
     <div class="options">
      ${option(()=>this.startRename(selected),'Rename layer…',!layer)}
      ${option(()=>command('importLayer'),'Import image as layer…')}
      ${option(()=>command('raiseLayer'),'Move layer up',!layer || index===layers.length-1)}
      ${option(()=>command('lowerLayer'),'Move layer down',!below)}
      ${option(()=>command('duplicateLayer'),'Duplicate layer',!layer)}
      ${option(()=>command('mergeDown'),'Merge down',!below || layer.locked || below.locked || !layer.visible || !below.visible)}
      ${option(()=>command('removeLayer'),'Delete layer',layers.length<2)}
     </div>
    </details>
   </div>
   <div class="stack">${repeat([...layers].reverse(),layer=>layer.id,entry=>this.renderLayer(entry,entry.id===selected))}</div>
   ${layer?html`<label class="layer-opacity">Opacity
    <input type="range" aria-label="Layer opacity" min="0" max="100" .value=${live(String(Math.round(layer.opacity*100)))}
     @input=${event=>{ event.target.nextElementSibling.value=event.target.value+'%'; }}
     @change=${event=>send(this,'layerOpacity',{ id:layer.id,value:event.target.value })}>
    <output .value=${live(Math.round(layer.opacity*100)+'%')}></output>
   </label>`:nothing}`;
 }
}

customElements.define('void-sprite-panel',SpritePanel);
customElements.define('void-sprite-brush',SpriteBrush);
customElements.define('void-sprite-palette',SpritePalette);
customElements.define('void-sprite-layers',SpriteLayers);
