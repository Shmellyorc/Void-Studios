let localFontMode = 'files';

function studioFontOptions() {
 return (P.fonts ?? []).map(font=>[font.id,font.name]);
}

function saveStudioFont(project,font,pages=[]) {
 if (P !== project) return;
 const assets=[...(P.fonts ?? []),font], atlases=[...(P.fontPages ?? []),...pages];
 validateStudioFonts({fonts:assets,fontPages:atlases});
 change(()=>{
  P.fonts = assets; P.fontPages = atlases;
  revealProjectItem('font:'+font.id,'assets');
 });
 return font;
}

function showStudioFonts(selected) {
 if ($('#dialog').open) $('#dialog').close();
 const asset=P.fonts?.find(font=>font.id === selected);
 const formats={vector:'Scalable font',bitmap:'BMFont',flood:'Flood-fill font'};
 const sample=asset?.kind==='vector' ? 'Pack my box with five dozen liquor jugs. 0123456789' :
  asset?.glyphs.slice(0,64).map(glyph=>String.fromCodePoint(glyph.code)).join('') ?? '';
 dialog('Project Fonts',
  '<div class="asset-button-row">' + button('Google Fonts…','font:google') +
  button('Import Font…','font:files') + button('Flood-fill Image…','font:flood') + '</div>' +
  '<p class="muted">Import a TTF, OTF or WOFF font, or select a .fnt file together with its atlas images.</p>' +
  (P.fonts ?? []).map(font=>`<div class="font-asset-row">
   <button type="button" data-act="font:open:${esc(font.id)}" class="${font===asset?'active':''}">${esc(font.name)}</button>
   <span class="muted">${formats[font.kind]}</span>${font.license?button('License','font:license:'+font.id):''}
   ${button('Remove','font:remove:'+font.id,'danger ghost')}</div>`).join('') +
  (asset ? '<div class="font-sample">'+field('Sample text','font-sample',sample)+'<div id="font-sample-preview"></div></div>' : ''),
  ()=>{},'Close');
 if (!asset) return;
 const input=$('#dialogbody [data-field="font-sample"]'), preview=$('#font-sample-preview');
 const font=loadStudioFont(studioFontLibrary(P),asset.id);
 const paint=()=>{
  if (!preview.isConnected) return;
  preview.replaceChildren();
  if (!font.ready) {preview.textContent=font.failed?'This font could not be loaded.':'Loading font…';return;}
  if (font.family) {
   preview.style.fontFamily=font.family;
   preview.textContent=input.value;
  } else {
   const image=studioBitmapText(font,input.value,'#e6eff5');
   const canvas=document.createElement('canvas');
   canvas.width=image.width; canvas.height=image.height;
   canvas.getContext('2d').drawImage(image,0,0);
   const scale=Math.min(8,32/font.asset.lineHeight);
   canvas.style.width=image.width*scale+'px';
   preview.append(canvas);
  }
 };
 input.addEventListener('input',paint);
 font.loading.then(paint);
 paint();
}

function chooseStudioFontFile(mode) {
 localFontMode = mode;
 const input=$('#font-file');
 input.multiple = mode === 'files';
 input.accept = mode === 'files' ? '.ttf,.otf,.woff,.woff2,.fnt,.png,.webp,.jpg,.jpeg' : 'image/png,image/webp,image/jpeg';
 input.click();
}

function configureStudioFloodFont(project,file,image) {
 const scan=scanStudioFloodFont(image);
 if ($('#dialog').open) $('#dialog').close();
 const presets=Object.entries(fontCharsets).map(([id,[label]])=>[id,label]);
 simple('Import Flood-fill Font',field('Name','name',file.name.replace(/\.[^.]+$/,'')) +
  select('Mapping preset','preset','ascii',[...presets,['custom','Custom']]) +
  field('Character mapping','mapping',fontCharsets.ascii[1]) +
  '<p class="muted">Enter characters in glyph scan order, starting at the top left. A space in this field is a character.</p>' +
  '<div class="two">'+field('Glyph spacing','spacing',1,'number')+field('Line spacing','lineSpacing',0,'number')+'</div>' +
  `<section class="flood-font-preview" aria-label="Glyph mapping preview">
   <p id="flood-font-status" role="status"></p><div id="flood-font-glyphs"></div>
   <div id="flood-font-pages" hidden>
    <button type="button" id="flood-font-previous">Previous</button>
    <span id="flood-font-page"></span><button type="button" id="flood-font-next">Next</button>
   </div>
  </section>`,values=>{
   const name=values.name.trim().slice(0,100), spacing=Number(values.spacing), lineSpacing=Number(values.lineSpacing);
   if (!name || ![spacing,lineSpacing].every(value=>Number.isInteger(value) && value>=0 && value<=4096)) {
    throw Error('Enter a name and whole, nonnegative spacing values');
   }
   const {glyphs,lineHeight,page}=createStudioFloodFont(scan,values.mapping,spacing,lineSpacing);
   const font={id:'font-'+uid(),name,kind:'flood',glyphs,lineHeight,pages:[page.id]};
   if (saveStudioFont(project,font,[page])) setTimeout(()=>{ if (P===project) showStudioFonts(font.id); },0);
 });
 const preset=$('#dialogbody [data-field="preset"]'), mapping=$('#dialogbody [data-field="mapping"]');
 const updatePreview=setupStudioFloodPreview(scan,mapping);
 $('#dialogok').textContent='Import';
 preset.onchange=()=>{
  if (fontCharsets[preset.value]) mapping.value=fontCharsets[preset.value][1];
  else mapping.focus();
  updatePreview();
 };
 mapping.oninput=()=>{ preset.value='custom'; updatePreview(); };
}

function setupStudioFloodPreview(scan,mapping) {
 const grid=$('#flood-font-glyphs'), status=$('#flood-font-status'), count=scan.glyphs.length;
 const previous=$('#flood-font-previous'), next=$('#flood-font-next');
 const pageSize=96, pages=Math.max(1,Math.ceil(count/pageSize));
 let page=0;
 function update() {
  const {keys,implicitSpace,error}=studioFloodFontMapping(count,mapping.value);
  for (const caption of grid.querySelectorAll('figcaption')) {
   const index=Number(caption.dataset.glyphIndex), key=keys[index];
   caption.textContent=key===' ' ? 'Space' : key ?? 'Unmapped';
   caption.classList.toggle('muted',key===undefined);
   caption.parentElement.title='Glyph '+(index+1)+' · '+caption.textContent;
  }
  status.textContent=error || (count+' '+(count===1 ? 'glyph' : 'glyphs')+' mapped'+(implicitSpace ? ' · Space added automatically' : ''));
  status.classList.toggle('flood-font-error',Boolean(error));
  mapping.setAttribute('aria-invalid',String(Boolean(error)));
  $('#dialogok').disabled=Boolean(error);
 }
 function renderPage() {
  const start=page*pageSize;
  grid.replaceChildren(...scan.glyphs.slice(start,start+pageSize).map(({x,y,w,h},index)=>{
   const card=document.createElement('figure'), thumb=document.createElement('canvas'), caption=document.createElement('figcaption');
   thumb.width=thumb.height=36;
   thumb.setAttribute('aria-hidden','true');
   const ctx=thumb.getContext('2d'), scale=Math.min(6,34/Math.max(w,h));
   ctx.imageSmoothingEnabled=false;
   const width=Math.max(1,Math.floor(w*scale)), height=Math.max(1,Math.floor(h*scale));
   ctx.drawImage(scan.canvas,x,y,w,h,Math.floor((36-width)/2),Math.floor((36-height)/2),width,height);
   ctx.globalCompositeOperation='source-in';
   ctx.fillStyle='#e6eff5';
   ctx.fillRect(0,0,36,36);
   caption.dataset.glyphIndex=String(start+index);
   card.append(thumb,caption);
   return card;
  }));
  grid.scrollTop=0;
  $('#flood-font-page').textContent=(page+1)+' / '+pages;
  previous.disabled=page===0;
  next.disabled=page===pages-1;
  update();
 }
 $('#flood-font-pages').hidden=pages===1;
 previous.onclick=()=>{ page--; renderPage(); };
 next.onclick=()=>{ page++; renderPage(); };
 renderPage();
 return update;
}

async function studioFontFilesSelected(event) {
 const input=event.target, files=[...input.files], project=P, mode=localFontMode;
 input.value='';
 if (!files.length) return;
 try {
  if (mode === 'flood') {
   const url=URL.createObjectURL(files[0]);
   try {
    const image=await studioFontImage(url);
    if (P===project) configureStudioFloodFont(project,files[0],image);
   } finally { URL.revokeObjectURL(url); }
   return;
  }
  let result;
  if (files.some(file=>/\.fnt$/i.test(file.name))) result=await readStudioBMFont(files);
  else {
   if (files.length !== 1) throw Error('Select one scalable font file at a time');
   result={font:await readStudioVectorFont(files[0],files[0].name.replace(/\.[^.]+$/,'').slice(0,100))};
  }
  if (saveStudioFont(project,result.font,result.pages)) showStudioFonts(result.font.id);
 } catch (error) { if (P===project) alert('Could not import font. '+error.message); }
}

function studioFontAction(action,id) {
 const asset=P.fonts?.find(font=>font.id === id);
 if (action === 'open') return showStudioFonts(id);
 if (action === 'files' || action === 'flood') return chooseStudioFontFile(action);
 if (action === 'license' && asset?.license) return dl(asset.name+'-license.txt',asset.license,'text/plain');
 if (action === 'remove' && asset) {
  const used=P.types.some(type=>type.font===id) || P.uiStyles?.some(style=>style.font===id) ||
   P.uiScreens?.some(screen=>screen.items.some(item=>item.font===id));
  if (used) return alert('Choose another font on the objects, controls or styles that use this font first.');
  if (!confirm('Remove '+asset.name+' from the project?')) return;
  change(()=>{
   P.fonts=P.fonts.filter(font=>font!==asset);
   const retained=new Set(P.fonts.flatMap(font=>font.pages ?? []));
   P.fontPages=(P.fontPages ?? []).filter(page=>retained.has(page.id));
  });
  return showStudioFonts();
 }
 if (action === 'google') {
  if ($('#dialog').open) $('#dialog').close();
  const project=P;
  dialog('Add a Google Font',field('Family name','family','') +
   '<p class="muted">Enter a Google Fonts family, such as Inter, Nunito or Press Start 2P. Studio downloads the font for offline use.</p>',()=>{
   const name=$('#dialogbody [data-field="family"]').value.trim().replace(/\s+/g,' ').slice(0,100);
   if (!name) throw Error('Enter a family name');
   $('#status').textContent='Downloading '+name+'…';
   downloadStudioGoogleFont(name).then(font=>{
    if (!saveStudioFont(project,font)) return;
    if (!$('#dialog').open) showStudioFonts(font.id);
   }).catch(error=>{ if (P===project) {persist(); alert('Could not import Google font. '+error.message);} });
  },'Download');
 }
}

function setupStudioFonts() {
 $('#font-file').addEventListener('change',studioFontFilesSelected);
 document.addEventListener('studio-font-ready',()=>{
  if (tab==='layout') drawEditor();
  else if (tab==='ui' && !uiWorkspace.gesture && currentUIScreen()) {
   const viewport=editorUIViewport();
   paintUIWorkspace(viewport,editorUILayout(viewport));
  } else if (tab==='tiles') drawMapEditor();
  else if (tab==='animate') drawAnimationPreview();
 });
}
