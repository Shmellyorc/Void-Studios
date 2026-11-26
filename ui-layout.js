const emptyUIFrame = viewport => ({ left:0,top:0,right:viewport.width,bottom:viewport.height });
const uiPanelModes = ['free','column','row'];

function uiAnchoredBounds(item, frame) {
 const [x,y] = uiAnchors[item.anchor];
 const availableWidth = frame.right-frame.left, availableHeight = frame.bottom-frame.top;
 const width = item.kind === 'panel' && item.fit ? Math.min(item.w,Math.max(1,availableWidth)) : item.w;
 const height = item.h;
 const left = frame.left+(availableWidth-width)*x+item.x;
 const top = frame.top+(availableHeight-height)*y+item.y;
 return { left,top,right:left+width,bottom:top+height };
}

function uiControlBounds(item, viewport) {
 return uiAnchoredBounds(item,emptyUIFrame(viewport));
}

function uiPanelContent(panel, bounds) {
 const padding = Math.max(0,panel.padding ?? 0);
 const x = Math.min(padding,(bounds.right-bounds.left-1)/2), y = Math.min(padding,(bounds.bottom-bounds.top-1)/2);
 return { left:bounds.left+x,top:bounds.top+y,right:bounds.right-x,bottom:bounds.bottom-y };
}

function arrangeUI(items, viewport) {
 const children = new Map(), ordered = [], byId = new Map();
 for (const item of items) {
  const parent = item.parent || '';
  if (!children.has(parent)) children.set(parent,[]);
  children.get(parent).push(item);
 }
 function visit(parent, frame, depth, hidden, locked) {
  const panel = parent?.item, mode = panel?.layout ?? 'free';
  const column = mode === 'column', stacked = column || mode === 'row';
  const crossSize = column ? frame.right-frame.left : frame.bottom-frame.top;
  let offset = column ? frame.top : frame.left;
  for (const item of children.get(panel?.id ?? '') ?? []) {
   let box = uiAnchoredBounds(item,frame);
   if (stacked) {
    const cross = panel.align === 'stretch' ? crossSize : Math.min(crossSize,column ? item.w : item.h);
    const margin = (crossSize-cross) * (panel.align === 'end' ? 1 : panel.align === 'center' ? .5 : 0);
    const left = column ? frame.left+margin : offset;
    const top = column ? offset : frame.top+margin;
    box = { left,top,right:left+(column ? cross : item.w),bottom:top+(column ? item.h : cross) };
    offset = (column ? box.bottom : box.right) + (panel.gap ?? 0);
   }
   const entry = { item,box,frame,depth,stacked,hidden:hidden || Boolean(item.editorHidden),locked:locked || Boolean(item.editorLocked) };
   ordered.push(entry);
   byId.set(item.id,entry);
   if (item.kind === 'panel') visit(entry,uiPanelContent(item,box),depth+1,entry.hidden,entry.locked);
  }
 }
 visit(null,emptyUIFrame(viewport),0,false,false);
 return { ordered,byId };
}

function positionUIBounds(node, box) {
 const px = value => 'calc(' + value + ' * var(--void-ui-unit))';
 node.style.left = px(box.left);
 node.style.top = px(box.top);
 node.style.width = px(box.right-box.left);
 node.style.height = px(box.bottom-box.top);
}
