const workspaceZoomLevels = [.25,.5,.75,1,1.5,2,3,4];
const workspaceCanvases = new Map();

function nextWorkspaceZoom(current, direction) {
 if (!direction) return 1;
 if (direction > 0) return workspaceZoomLevels.find(level => level > current) ?? current;
 return workspaceZoomLevels.findLast(level => level < current) ?? current;
}

function canZoomWorkspace(direction) {
 const view = workspaceCanvases.get(tab);
 return Boolean(view && view.surface.clientWidth && nextWorkspaceZoom(view.get(),direction) !== view.get());
}

function zoomWorkspace(action, point) {
 const view = workspaceCanvases.get(tab);
 if (!view || !view.surface.clientWidth) return;
 const direction = action === 'in' ? 1 : action === 'out' ? -1 : 0;
 const next = nextWorkspaceZoom(view.get(),direction);
 if (next === view.get()) return;
 const board = view.board.getBoundingClientRect();
 const x = point?.clientX ?? board.left + board.width / 2;
 const y = point?.clientY ?? board.top + board.height / 2;
 const before = view.surface.getBoundingClientRect();
 const ratioX = (x-before.left) / before.width, ratioY = (y-before.top) / before.height;
 view.set(next);
 const after = view.surface.getBoundingClientRect();
 view.board.scrollLeft += after.left + ratioX*after.width - x;
 view.board.scrollTop += after.top + ratioY*after.height - y;
}

function setupWorkspaceZoom() {
 function register(workspace,surface,board,get,set) {
  workspaceCanvases.set(workspace,{ surface,board,get,set });
  let distance = 0, lastWheel = 0;
  surface.addEventListener('wheel',event => {
   if (tab !== workspace || event.deltaY === 0) return;
   event.preventDefault();
   const delta = event.deltaMode === 0 ? event.deltaY : Math.sign(event.deltaY)*40;
   if (event.timeStamp-lastWheel > 150 || Math.sign(distance) !== Math.sign(delta)) distance = 0;
   distance += delta;
   lastWheel = event.timeStamp;
   if (Math.abs(distance) < 32) return;
   zoomWorkspace(distance < 0 ? 'in' : 'out',event);
   distance = 0;
  },{ passive:false });
 }
 const layout = $('#stage');
 $('#zoom').innerHTML = workspaceZoomLevels.map(level => `<option value="${level}">${level*100}%</option>`).join('');
 $('#zoom').value = String(zoom);
 register('layout',layout,layout.parentElement,() => zoom,value => {
  $('#zoom').value = String(value);
  zoom = value;
  drawEditor();
 });
 register('tiles',$('#tile-canvas'),$('#tile-board'),() => tileWorkspace.zoom,value => {
  tileWorkspace.zoom = value;
  const select = $('#tile-tools [data-field="tile-zoom"]');
  if (select) select.value = String(value);
  drawMapEditor();
 });
 for (const [workspace,selector] of [['animate','#animation-preview'],['ui','#ui-stage']]) {
  const surface = $(selector);
  let zoom = 1;
  register(workspace,surface,surface.parentElement,() => zoom,value => {
   zoom = value;
   surface.style.setProperty('--workspace-zoom',String(value));
  });
 }
}
