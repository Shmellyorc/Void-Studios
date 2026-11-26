function findTileRoute(map, solidCells, obstacles, object, x, y) {
 if (!map || !Number.isFinite(x) || !Number.isFinite(y)) return null;
 const start = tileCellAt(map, object.x + object.w / 2, object.y + object.h / 2);
 const goal = tileCellAt(map, x, y);
 if (!tileInBounds(map, ...start) || !tileInBounds(map, ...goal)) return null;
 const index = (column, row) => row * map.columns + column;
 const [first, last] = [index(...start), index(...goal)];
 const isometric = map.orientation === 'isometric';
 const horizontal = isometric ? Math.hypot(map.cellWidth / 2, map.cellHeight / 2) : map.cellWidth;
 const vertical = isometric ? horizontal : map.cellHeight;
 const directions = [[1,0,horizontal],[-1,0,horizontal],[0,1,vertical],[0,-1,vertical]];
 const cost = new Float64Array(map.columns * map.rows).fill(Infinity);
 const parent = new Int32Array(cost.length).fill(-1);
 const clearance = new Int8Array(cost.length);
 const heap = [];

 function open(column, row) {
  const cell = index(column, row);
  if (clearance[cell]) return clearance[cell] > 0;
  const [x, y] = tileCellCenter(map, column, row);
  const left = x - object.w / 2, top = y - object.h / 2;
  const blocked = tileBlocksRectangle(map, solidCells, left, top, object.w, object.h) || obstacles.some(other =>
   other !== object && !other.dead && left < other.x + other.w && left + object.w > other.x &&
   top < other.y + other.h && top + object.h > other.y);
  clearance[cell] = blocked ? -1 : 1;
  return !blocked;
 }

 function enqueue(cell, distance, score) {
  const entry = { cell, distance, score };
  let i = heap.length;
  heap.push(entry);
  while (i > 0) {
   const parent = (i - 1) >> 1;
   if (heap[parent].score <= score) break;
   heap[i] = heap[parent];
   i = parent;
  }
  heap[i] = entry;
 }

 function dequeue() {
  const first = heap[0], last = heap.pop();
  if (!heap.length) return first;
  let i = 0;
  while (2 * i + 1 < heap.length) {
   let child = 2 * i + 1;
   if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
   if (heap[child].score >= last.score) break;
   heap[i] = heap[child];
   i = child;
  }
  heap[i] = last;
  return first;
 }

 if (!open(...goal)) return null;
 cost[first] = 0;
 enqueue(first, 0, 0);
 while (heap.length) {
  const node = dequeue();
  if (node.distance !== cost[node.cell]) continue;
  if (node.cell === last) {
   const route = [];
   for (let cursor = last; cursor !== first; cursor = parent[cursor]) {
    route.push(tileCellCenter(map, cursor % map.columns, Math.floor(cursor / map.columns)));
   }
   return route.length ? route.reverse() : [tileCellCenter(map, ...goal)];
  }
  const column = node.cell % map.columns, row = Math.floor(node.cell / map.columns);
  for (const [dc, dr, weight] of directions) {
   const c = column + dc, r = row + dr;
   if (!tileInBounds(map, c, r) || !open(c, r)) continue;
   const next = index(c, r), distance = node.distance + weight;
   if (distance >= cost[next]) continue;
   cost[next] = distance;
   parent[next] = node.cell;
   const estimate = Math.abs(c - goal[0]) * horizontal + Math.abs(r - goal[1]) * vertical;
   enqueue(next, distance, distance + estimate);
  }
 }
 return null;
}

function followTileRoute(object, speed, seconds, move, frame) {
 const state = object.navigation;
 if (state?.status !== 'moving') return;
 let remaining = Math.min(6000, Math.max(0, speed)) * seconds;
 while (state.index < state.route.length) {
  const [x, y] = state.route[state.index];
  const dx = x - object.x - object.w / 2, dy = y - object.y - object.h / 2;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-4) { state.index++; continue; }
  if (!remaining) return;
  const travel = Math.min(remaining, distance);
  move(object, dx / distance * travel, dy / distance * travel);
  const after = Math.hypot(x - object.x - object.w / 2, y - object.y - object.h / 2);
  if (after >= distance - 1e-4) state.stalled += seconds;
  else state.stalled = 0;
  if (state.stalled >= .25) { state.status = 'failed'; state.eventFrame = frame; return; }
  if (after >= 1e-4) return;
  remaining -= travel;
 }
 state.status = 'arrived';
 state.eventFrame = frame;
}
