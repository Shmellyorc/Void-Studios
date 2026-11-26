const projectFileMagic = Uint8Array.of(86,79,73,68,80,82,74); // VOIDPRJ
const projectFileVersion = 2;
const projectFileHeaderSize = 12;
const projectMediaPrefix = /^data:(?:image|audio)\/[a-z0-9.+-]+;base64,/i;
const projectMediaCollections = [['types','image','image'],['tilesets','image','image'],['audioClips','source','audio']];

function projectMediaBase64(bytes) {
 if (bytes.toBase64) return bytes.toBase64();
 const chunks = [];
 // Multiples of three keep padding at the end of the complete file.
 const chunkSize = 0x6000;
 for (let offset = 0; offset < bytes.length; offset += chunkSize) {
  chunks.push(btoa(String.fromCharCode(...bytes.subarray(offset,offset+chunkSize))));
 }
 return chunks.join('');
}

function encodeProjectFile(project) {
 const data = { ...project };
 const assets = [], assetBytes = [], references = {};
 const known = new Map();
 for (const [key,field,kind] of projectMediaCollections) {
  if (!Array.isArray(project[key])) continue;
  const links = [];
  data[key] = project[key].map((item,index) => {
   const source = item?.[field];
   if (typeof source !== 'string') return item;
   let id = known.get(source);
   if (id === undefined) {
    const prefix = source.match(projectMediaPrefix)?.[0];
    if (!prefix || !prefix.toLowerCase().startsWith('data:' + kind + '/')) return item;
    const encoded = source.slice(prefix.length);
    if (encoded.length % 4 || /\s/.test(encoded)) return item;
    let bytes;
    try {
     // Keep noncanonical legacy data URLs intact in the metadata.
     const tail = encoded.slice(-4);
     if (btoa(atob(tail)) !== tail) return item;
     bytes = decodeMediaBase64(encoded);
    } catch { return item; }
    id = assets.length;
    known.set(source,id);
    assets.push({ prefix, length: bytes.byteLength });
    assetBytes.push(bytes);
   }
   links.push([index,id]);
   const { [field]: omitted, ...metadata } = item;
   return metadata;
  });
  references[key] = links;
 }
 const metadata = new TextEncoder().encode(JSON.stringify({ project: data, assets, references }));
 if (metadata.byteLength > 0xffffffff) throw Error('Project metadata is too large to save');
 const header = new Uint8Array(projectFileHeaderSize);
 header.set(projectFileMagic);
 header[7] = projectFileVersion;
 new DataView(header.buffer).setUint32(8,metadata.byteLength,true);
 return new Blob([header,metadata,...assetBytes],{ type: 'application/octet-stream' });
}

function decodeProjectFile(buffer) {
 if (buffer.byteLength < projectFileHeaderSize) throw Error('The VOID project file is incomplete');
 const metadataEnd = projectFileHeaderSize + new DataView(buffer).getUint32(8,true);
 if (metadataEnd > buffer.byteLength) throw Error('The VOID project metadata is incomplete');
 let metadata;
 try {
  const encoded = new Uint8Array(buffer,projectFileHeaderSize,metadataEnd-projectFileHeaderSize);
  metadata = JSON.parse(new TextDecoder('utf-8',{ fatal: true }).decode(encoded));
 } catch { throw Error('The VOID project metadata is invalid'); }
 const { project, references } = metadata ?? {};
 const legacy = new Uint8Array(buffer)[7] === 1;
 const table = legacy ? metadata?.images : metadata?.assets;
 if (!project || typeof project !== 'object' || Array.isArray(project) ||
     !Array.isArray(table) || !references || typeof references !== 'object') {
  throw Error('The VOID project metadata is invalid');
 }

 let offset = metadataEnd;
 const assets = table.map(asset => {
  const { prefix, length } = asset ?? {};
  if (typeof prefix !== 'string' || prefix.match(projectMediaPrefix)?.[0] !== prefix ||
      (legacy && !prefix.toLowerCase().startsWith('data:image/')) || !Number.isSafeInteger(length) || length < 0 || length > buffer.byteLength-offset) {
   throw Error('The VOID project contains an invalid embedded asset');
  }
  const bytes = new Uint8Array(buffer,offset,length);
  offset += length;
  return { prefix, bytes };
 });
 if (offset !== buffer.byteLength) throw Error('The VOID project contains unexpected data');
 for (const [key,field,kind] of projectMediaCollections) {
  if (legacy && kind === 'audio') continue;
  const links = references[key] ?? [];
  if (!Array.isArray(links)) throw Error('The VOID project has invalid asset references');
  for (const link of links) {
   if (!Array.isArray(link) || link.length !== 2) throw Error('The VOID project has an invalid asset reference');
   const [index,id] = link;
   const item = Array.isArray(project[key]) && Number.isSafeInteger(index) && index >= 0 ? project[key][index] : null;
   const asset = Number.isSafeInteger(id) && id >= 0 ? assets[id] : null;
   if (!item || typeof item !== 'object' || Array.isArray(item) || Object.hasOwn(item,field) || !asset ||
       !asset.prefix.toLowerCase().startsWith('data:' + kind + '/')) {
    throw Error('The VOID project has an invalid asset reference');
   }
   asset.url ??= asset.prefix + projectMediaBase64(asset.bytes);
   item[field] = asset.url;
  }
 }
 return project;
}

async function openProjectFile(file) {
 const header = new Uint8Array(await file.slice(0,projectFileMagic.length+1).arrayBuffer());
 if (!projectFileMagic.every((byte,index) => header[index] === byte)) return JSON.parse(await file.text());
 if (header.length < projectFileMagic.length+1) throw Error('The VOID project file is incomplete');
 if (header[7] !== 1 && header[7] !== projectFileVersion) throw Error('Unsupported VOID project file version ' + header[7]);
 return decodeProjectFile(await file.arrayBuffer());
}
