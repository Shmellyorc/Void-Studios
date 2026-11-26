const fontCharsets = {
 ascii:['Printable ASCII (space–~)',Array.from({length:95},(_,i)=>String.fromCharCode(32+i)).join('')],
 digits:['Digits (0–9)','0123456789'],
 upper:['Uppercase (A–Z)','ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
 lower:['Lowercase (a–z)','abcdefghijklmnopqrstuvwxyz'],
 letters:['Letters (A–Z, a–z)','ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'],
 alphanumeric:['Alphanumeric (0–9, A–Z, a–z)','0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'],
 hex:['Hexadecimal (0–9, A–F)','0123456789ABCDEF'],
};

async function readStudioVectorFont(file,name,license) {
 const extension = file.name.split('.').at(-1).toLowerCase();
 if (!['ttf','otf','woff','woff2'].includes(extension)) throw Error('Choose a TTF, OTF, WOFF or WOFF2 font');
 const bytes = new Uint8Array(await file.arrayBuffer());
 if (!bytes.length) throw Error('The font file is empty');
 const face = new FontFace('VoidImport',bytes);
 try { await face.load(); } catch { throw Error('The font file could not be decoded'); }
 return { id:'font-'+uid(),kind:'vector',name,source:'data:font/'+extension+';base64,'+projectMediaBase64(bytes),
  ...(license ? {license} : {}) };
}

async function downloadStudioGoogleFont(name) {
 const slug = name.toLowerCase().replace(/[^a-z0-9]/g,'');
 if (!slug) throw Error('Enter a Google Fonts family name');
 const request = url=>fetch(url,{signal:AbortSignal.timeout(15000)});
 for (const list of ['ofl','apache','ufl']) {
  const path = list+'/'+slug;
  const catalog = await request('https://api.github.com/repos/google/fonts/contents/'+path);
  if (catalog.status === 404) continue;
  if (!catalog.ok) throw Error('Google Fonts catalog could not be reached ('+catalog.status+')');
  const files = await catalog.json();
  if (!Array.isArray(files)) continue;
  const fonts = files.filter(file=>file.type === 'file' && /\.ttf$/i.test(file.name));
  const candidate = fonts.find(file=>/-Regular\.ttf$/i.test(file.name)) ??
   fonts.find(file=>file.name.includes('[') && !/italic/i.test(file.name)) ??
   fonts.find(file=>!/(italic|bold)/i.test(file.name)) ?? fonts[0];
  const license = files.find(file=>file.type === 'file' && /^(?:OFL|LICENSE|UFL)(?:\.txt)?$/i.test(file.name));
  if (!candidate || !license) continue;
  const base = 'https://raw.githubusercontent.com/google/fonts/main/'+path+'/';
  const [data,terms] = await Promise.all([request(base+encodeURIComponent(candidate.name)),request(base+encodeURIComponent(license.name))]);
  if (!data.ok || !terms.ok) throw Error('The font or its license could not be downloaded');
  return readStudioVectorFont(new File([await data.blob()],candidate.name),name,await terms.text());
 }
 throw Error('Could not find a downloadable family with that name in Google Fonts');
}

function parseStudioBMFont(data) {
 const bytes = new Uint8Array(data);
 const view = new DataView(data);
 const decoder = new TextDecoder();
 const documentFont = { common:{},pages:[],chars:[],kernings:[] };
 if (bytes[0] === 66 && bytes[1] === 77 && bytes[2] === 70) {
  if (bytes[3] !== 3) throw Error('Use a BMFont binary version 3, text, or XML descriptor');
  for (let i=4;i<bytes.length;) {
   if (i+5>bytes.length) throw Error('Truncated BMFont block');
   const kind=bytes[i], size=view.getUint32(i+1,true), start=i+5, end=start+size;
   if (end>bytes.length) throw Error('Truncated BMFont block');
   if (kind === 1 && size >= 15) documentFont.name = decoder.decode(bytes.subarray(start+14,end)).split('\0')[0];
   if (kind === 2) {
    if (size < 15) throw Error('Invalid BMFont common block');
    documentFont.common = {lineHeight:view.getUint16(start,true),pages:view.getUint16(start+8,true),packed:Number(Boolean(bytes[start+10]&128)),
     alphaChnl:bytes[start+11],redChnl:bytes[start+12],greenChnl:bytes[start+13],blueChnl:bytes[start+14]};
   }
   if (kind === 3) documentFont.pages = decoder.decode(bytes.subarray(start,end)).split('\0').filter(Boolean).map((file,id)=>({file,id}));
   if (kind === 4) {
    if (size%20) throw Error('Invalid BMFont glyph block');
    for (let p=start;p<end;p+=20) documentFont.chars.push({
     id:view.getUint32(p,true),x:view.getUint16(p+4,true),y:view.getUint16(p+6,true),
     width:view.getUint16(p+8,true),height:view.getUint16(p+10,true),
     xoffset:view.getInt16(p+12,true),yoffset:view.getInt16(p+14,true),xadvance:view.getInt16(p+16,true),page:bytes[p+18],chnl:bytes[p+19],
    });
   }
   if (kind === 5) {
    if (size%10) throw Error('Invalid BMFont kerning block');
    for (let p=start;p<end;p+=10) documentFont.kernings.push({first:view.getUint32(p,true),second:view.getUint32(p+4,true),amount:view.getInt16(p+8,true)});
   }
   i=end;
  }
 } else {
  const source=decoder.decode(data).trim();
  const read=(tag,fields)=>{
   if (tag === 'info') documentFont.name=fields.face;
   if (tag === 'common') documentFont.common=fields;
   if (tag === 'page') documentFont.pages.push(fields);
   if (tag === 'char') documentFont.chars.push(fields);
   if (tag === 'kerning') documentFont.kernings.push(fields);
  };
  if (source.startsWith('<')) {
   const xml = new DOMParser().parseFromString(source,'application/xml');
   if (xml.documentElement.tagName !== 'font' || xml.querySelector('parsererror')) throw Error('Invalid BMFont XML descriptor');
   for (const node of xml.querySelectorAll('info,common,page,char,kerning')) {
    read(node.tagName,Object.fromEntries([...node.attributes].map(attribute=>[attribute.name,attribute.value])));
   }
  } else {
   for (const line of source.split(/\r\n?|\n/)) {
    const tag=line.trim().match(/^\w+/)?.[0];
    if (!tag) continue;
    const fields=Object.fromEntries([...line.matchAll(/(\w+)\s*=\s*(?:"([^"]*)"|(\S+))/g)].map(([,key,quoted,value])=>[key,quoted??value]));
    read(tag,fields);
   }
  }
 }
 const {common,pages,chars}=documentFont;
 if (!(Number(common.lineHeight)>0) || !pages.length || !chars.length || (common.pages!=null && Number(common.pages)!==pages.length)) {
  throw Error('The descriptor must contain BMFont metrics, glyphs and atlas pages');
 }
 return documentFont;
}

async function readStudioBMFont(files) {
 const descriptors=files.filter(file=>/\.fnt$/i.test(file.name));
 if (descriptors.length !== 1) throw Error('Select one .fnt file together with all its atlas images');
 const descriptor=descriptors[0], details=parseStudioBMFont(await descriptor.arrayBuffer());
 const indices=new Map();
 const atlases=await Promise.all(details.pages.map(async ({id,file},index)=>{
  if (!Number.isInteger(Number(id)) || Number(id)<0 || typeof file!=='string' || !file.trim() || indices.has(Number(id))) throw Error('Invalid BMFont page');
  const name=file.split(/[\\/]/).at(-1);
  const match=files.find(item=>item.name===name) ?? files.find(item=>item.name.toLowerCase()===name.toLowerCase());
  if (!match) throw Error('Please include atlas page ' + name);
  indices.set(Number(id),index);
  const artwork=await readStudioImage(match);
  return { id:'font-page-'+uid(),...artwork };
 }));
 const common=details.common;
 const hasGlyph = channel=>[0,2].includes(Number(common[channel]));
 const glyphs=details.chars.filter(item=>Number(item.id)!==-1 && Number(item.id)!==4294967295).map(item=>{
  const channel=Number(item.chnl);
  const mask=Number(common.packed) && [1,2,4,8].includes(channel) ? channel :
   Number(common.alphaChnl)===4 ? ({redChnl:4,greenChnl:2,blueChnl:1}[['redChnl','greenChnl','blueChnl'].find(hasGlyph)]) : undefined;
  return {code:Number(item.id),x:Number(item.x),y:Number(item.y),w:Number(item.width),h:Number(item.height),
   dx:Number(item.xoffset),dy:Number(item.yoffset),advance:Number(item.xadvance),page:indices.get(Number(item.page)),
   ...(mask ? {channel:mask} : {})};
 });
 const font={id:'font-'+uid(),name:(details.name || descriptor.name.replace(/\.fnt$/i,'')).slice(0,100),kind:'bitmap',
  lineHeight:Number(common.lineHeight),pages:atlases.map(page=>page.id),glyphs,
  kernings:details.kernings.map(item=>[Number(item.first),Number(item.second),Number(item.amount)])};
 return {font,pages:atlases};
}

// Uses the same RGBA key, scan order and four-neighbor traversal as Void.Engine SpriteFont.
function extractStudioFloodFont(image,mapping,spacing,lineSpacing) {
 const keys=[...mapping], {naturalWidth:width,naturalHeight:height}=image;
 if (!keys.length || new Set(keys).size!==keys.length) throw Error('Enter one unique character per glyph');
 if (!width || !height || width>4096 || height>4096) throw Error('Choose an image up to 4096 × 4096');
 const canvas=document.createElement('canvas');
 canvas.width=width; canvas.height=height;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 ctx.drawImage(image,0,0);
 const pixels=ctx.getImageData(0,0,width,height), rgba=new Uint32Array(pixels.data.buffer);
 const background=rgba[0], remaining=new Uint8Array(rgba.length), glyphs=[], stack=[];
 for (let i=0;i<rgba.length;i++) {
  if (rgba[i]===background) rgba[i]=0;
  else remaining[i]=1;
 }
 const visit=i=>{ if (remaining[i]) {remaining[i]=0;stack.push(i);} };
 for (let i=0;i<remaining.length;i++) {
  if (!remaining[i]) continue;
  let left=i%width,right=left,top=Math.floor(i/width),bottom=top;
  visit(i);
  while (stack.length) {
   const point=stack.pop(), x=point%width, y=Math.floor(point/width);
   left=Math.min(left,x); right=Math.max(right,x); top=Math.min(top,y); bottom=Math.max(bottom,y);
   if (x>0) visit(point-1);
   if (x+1<width) visit(point+1);
   if (y>0) visit(point-width);
   if (y+1<height) visit(point+width);
  }
  const w=right-left+1, h=bottom-top+1;
  glyphs.push({x:left,y:top,w,h,dx:0,dy:0,advance:w+spacing,page:0});
 }
 if (keys[0]===' ' && keys.length===glyphs.length+1) keys.shift();
 if (!glyphs.length || glyphs.length!==keys.length) throw Error('Found '+glyphs.length+' glyphs for '+keys.length+' characters. Check the mapping and separate touching glyphs.');
 let glyphHeight=0;
 glyphs.forEach((glyph,index)=>{ glyph.code=keys[index].codePointAt(0); glyphHeight=Math.max(glyphHeight,glyph.h); });
 if (!keys.includes(' ')) glyphs.push({code:32,x:0,y:0,w:0,h:0,dx:0,dy:0,advance:Math.max(1,Math.round(glyphHeight/3))+spacing,page:0});
 ctx.putImageData(pixels,0,0);
 return {glyphs,lineHeight:glyphHeight+lineSpacing,page:{id:'font-page-'+uid(),width,height,image:canvas.toDataURL('image/png')}};
}
