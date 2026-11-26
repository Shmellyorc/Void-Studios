const studioFontAssets = new WeakMap();
const studioFontLibraries = new WeakMap();
const studioVectorFaces = new Map();
let studioFaceNumber = 0;

function validateStudioFonts(project) {
 project.fonts ??= [];
 project.fontPages ??= [];
 if (!Array.isArray(project.fonts) || !Array.isArray(project.fontPages)) throw Error('Invalid font assets');
 const pages = new Map();
 for (const page of project.fontPages) {
  if (!dataId(page?.id) || pages.has(page.id) || !/^data:image\/(?:png|webp|jpeg);base64,/i.test(page.image) ||
      ![page.width,page.height].every(value=>Number.isInteger(value) && value > 0 && value <= 4096)) throw Error('Invalid font atlas page');
  pages.set(page.id,page);
 }
 const ids = new Set();
 for (const font of project.fonts) {
  if (!dataId(font?.id) || ids.has(font.id) || typeof font.name !== 'string' || !font.name.trim()) throw Error('Invalid font');
  ids.add(font.id);
  if (font.kind === 'vector') {
   if (!/^data:font\/(?:ttf|otf|woff2?);base64,/i.test(font.source)) throw Error('Invalid embedded font');
   continue;
  }
  if (!['bitmap','flood'].includes(font.kind) || !Number.isFinite(font.lineHeight) || font.lineHeight <= 0 ||
      !Array.isArray(font.glyphs) || !font.glyphs.length || !Array.isArray(font.pages) || !font.pages.length ||
      font.pages.some(id=>!pages.has(id))) throw Error('Invalid bitmap font');
  const codes = new Set();
  for (const glyph of font.glyphs) {
   const { code,x,y,w,h,dx,dy,advance,page } = glyph ?? {};
   const atlas = pages.get(font.pages[page]);
   if (!atlas || ![code,x,y,w,h,page].every(Number.isInteger) || code < 0 || code > 0x10ffff || codes.has(code) ||
       Math.min(x,y,w,h,page) < 0 || x+w > atlas.width || y+h > atlas.height ||
       ![dx,dy,advance].every(n=>Number.isFinite(n) && Math.abs(n)<=65535) ||
       glyph.channel !== undefined && ![1,2,4,8].includes(glyph.channel)) throw Error('Invalid bitmap glyph');
   codes.add(code);
  }
  if (font.kernings !== undefined && (!Array.isArray(font.kernings) || font.kernings.some(pair=>
   !Array.isArray(pair) || pair.length !== 3 || !pair.every(Number.isInteger)))) throw Error('Invalid font kerning');
 }
 return project;
}

function studioFontLibrary(project) {
 if (!project) return null;
 let library = studioFontLibraries.get(project);
 if (!library || library.assets !== project.fonts || library.pages !== project.fontPages) {
  library = { assets:project.fonts,pages:project.fontPages,fonts:new Map((project.fonts ?? []).map(asset=>[asset.id,asset])),
   atlases:new Map((project.fontPages ?? []).map(page=>[page.id,page])) };
  studioFontLibraries.set(project,library);
 }
 return library;
}

function studioFontImage(source) {
 const image = new Image();
 image.src = source;
 return image.decode().then(()=>image);
}

function loadStudioFont(library,id) {
 const asset = library?.fonts.get(id);
 if (!asset) return null;
 if (asset.kind === 'vector' && studioVectorFaces.has(asset.source)) return studioVectorFaces.get(asset.source);
 let font = studioFontAssets.get(asset);
 if (font) return font;
 font = { asset,ready:false,failed:false };
 studioFontAssets.set(asset,font);
 if (asset.kind === 'vector') {
  font.family = 'VoidFont' + ++studioFaceNumber;
  const face = new FontFace(font.family,'url('+JSON.stringify(asset.source)+')');
  font.loading = face.load().then(loaded=>document.fonts.add(loaded));
  studioVectorFaces.set(asset.source,font);
 } else {
  font.glyphs = new Map(asset.glyphs.map(glyph=>[glyph.code,glyph]));
  font.kernings = new Map((asset.kernings ?? []).map(([first,second,amount])=>[first+','+second,amount]));
  font.stamps = new Map();
  font.loading = Promise.all(asset.pages.map(page=>studioFontImage(library.atlases.get(page).image)))
   .then(images=>{ font.images = images; font.channels = new Map(); });
 }
 font.loading = font.loading.then(()=>{
  font.ready = true;
  document.dispatchEvent(new Event('studio-font-ready'));
  return font;
 },()=>{
  font.failed = true;
  document.dispatchEvent(new Event('studio-font-ready'));
  return font;
 });
 return font;
}

function studioFontGlyphPage(font,glyph) {
 const image = font.images[glyph.page];
 if (!glyph.channel) return image;
 const key = glyph.page+':'+glyph.channel;
 if (font.channels.has(key)) return font.channels.get(key);
 const canvas = document.createElement('canvas');
 canvas.width = image.naturalWidth;
 canvas.height = image.naturalHeight;
 const ctx = canvas.getContext('2d',{willReadFrequently:true});
 ctx.drawImage(image,0,0);
 const pixels = ctx.getImageData(0,0,canvas.width,canvas.height);
 const channel = {1:2,2:1,4:0,8:3}[glyph.channel];
 for (let i=0;i<pixels.data.length;i+=4) pixels.data[i+3] = pixels.data[i+channel];
 ctx.putImageData(pixels,0,0);
 font.channels.set(key,canvas);
 return canvas;
}

function studioBitmapText(font,text,color) {
 const key = JSON.stringify([text,color]);
 if (font.stamps.has(key)) return font.stamps.get(key);
 const glyphs = [], lines = String(text).split(/\r\n?|\n/), lineHeight = font.asset.lineHeight;
 let left=0,top=0,right=0,bottom=lines.length*lineHeight;
 for (const [row,line] of lines.entries()) {
  let x=0,previous=null;
  for (const character of line) {
   const code = character.codePointAt(0);
   const glyph = font.glyphs.get(code) ?? font.glyphs.get(63);
   if (!glyph) { x += lineHeight/3; previous=null; continue; }
   x += font.kernings.get(previous+','+glyph.code) ?? 0;
   const dx=x+glyph.dx, dy=row*lineHeight+glyph.dy;
   if (glyph.w && glyph.h) glyphs.push({glyph,x:dx,y:dy});
   left=Math.min(left,dx); top=Math.min(top,dy);
   right=Math.max(right,dx+glyph.w); bottom=Math.max(bottom,dy+glyph.h);
   x += glyph.advance;
   previous = glyph.code;
  }
  right = Math.max(right,x);
 }
 const canvas = document.createElement('canvas');
 canvas.width = Math.min(4096,Math.max(1,Math.ceil(right-left)));
 canvas.height = Math.min(4096,Math.max(1,Math.ceil(bottom-top)));
 const ctx = canvas.getContext('2d');
 ctx.imageSmoothingEnabled = false;
 for (const {glyph,x,y} of glyphs) {
  ctx.drawImage(studioFontGlyphPage(font,glyph),glyph.x,glyph.y,glyph.w,glyph.h,x-left,y-top,glyph.w,glyph.h);
 }
 ctx.globalCompositeOperation = 'source-in';
 ctx.fillStyle = color;
 ctx.fillRect(0,0,canvas.width,canvas.height);
 if (canvas.width*canvas.height <= 65536) {
  if (font.stamps.size >= 64) font.stamps.delete(font.stamps.keys().next().value);
  font.stamps.set(key,canvas);
 }
 return canvas;
}

function drawStudioTextObject(ctx,type,object,fonts) {
 const value = object.text ?? type.text ?? '', color = type.color || '#90c1ce';
 const {w,h} = object, size = type.fontSize > 0 ? type.fontSize : Math.max(10,h*.75);
 const font = loadStudioFont(fonts,type.font);
 if (font?.ready && font.asset.kind !== 'vector') {
  const image = studioBitmapText(font,value,color);
  const scale = Math.min(size/font.asset.lineHeight,w/image.width,h/image.height);
  if (scale > 0) ctx.drawImage(image,-w/2,-image.height*scale/2,image.width*scale,image.height*scale);
  return;
 }
 ctx.fillStyle = color;
 ctx.font = font?.family ? size+'px '+font.family : 'bold '+size+'px monospace';
 ctx.textBaseline = 'middle';
 ctx.fillText(value,-w/2,0,w);
}
