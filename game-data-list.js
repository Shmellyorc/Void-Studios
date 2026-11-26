const dataListModes = [['inventory','Inventory'],['choices','Dialogue choices']];
const dataListViews = new WeakMap();

function inventoryCount(collection,row) {
 if (!collection || typeof collection !== 'object' || Array.isArray(collection) || !Object.hasOwn(collection,row)) return 0;
 const quantity = collection[row];
 return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0;
}

function dataListEntries(item,vars,data) {
 const table = data?.tables.get(item.table);
 if (!table || !item.labelColumn) return [];
 const field = (ref,column) => data.fields.get(dataReference(ref,column));
 if (item.mode === 'choices') {
  const node = vars[item.variable];
  if (!node || !item.fromColumn || !item.nextColumn) return [];
  return table.rows.flatMap(row => {
   const ref = dataReference(item.table,row.id);
   if (field(ref,item.fromColumn) !== node) return [];
   const next = field(ref,item.nextColumn), label = field(ref,item.labelColumn);
   if (typeof next !== 'string' || (next && !data.rows.has(next)) || !label) return [];
   return [{ ref,next,label }];
  });
 }
 return table.rows.flatMap(row => {
  const ref = dataReference(item.table,row.id);
  const quantity = inventoryCount(vars[item.variable],ref);
  if (!quantity) return [];
  const art = field(ref,item.iconColumn);
  return [{ ref,quantity,label:field(ref,item.labelColumn) || row.key,icon:data.enumIcons.get(art) ?? art }];
 });
}

function paintUIDataList(node,item,vars,data) {
 const entries = dataListEntries(item,vars,data);
 const signature = JSON.stringify(entries);
 const selected = item.mode === 'inventory' && item.selectionVariable ? vars[item.selectionVariable] : '';
 const previous = dataListViews.get(node);
 if (previous?.signature === signature) {
  if (selected !== previous.selected) {
   for (const button of node.querySelectorAll('[data-ui-list-row]')) {
    button.setAttribute('aria-pressed',String(button.dataset.uiListRow === selected));
   }
   previous.selected = selected;
  }
  return false;
 }
 dataListViews.set(node,{signature,selected});
 const buttons = entries.map(entry => {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.uiListRow = entry.ref;
  button.disabled = Boolean(item.disabled);
  if (item.mode === 'inventory' && item.selectionVariable) button.setAttribute('aria-pressed',String(entry.ref === selected));
  if (entry.icon) {
   const art = studioDataPortrait(data.project,entry.icon);
   if (art) {
    const thumbnail = document.createElement('span');
    thumbnail.className = 'void-ui-list-art';
    thumbnail.append(art);
    button.append(thumbnail);
   }
  }
  const label = document.createElement('span');
  label.className = 'void-ui-list-label';
  label.textContent = entry.label;
  button.append(label);
  if (entry.quantity) {
   const count = document.createElement('span');
   count.className = 'void-ui-list-count';
   count.textContent = '×' + entry.quantity;
   button.append(count);
  }
  return button;
 });
 if (!buttons.length) {
  const empty = document.createElement('span');
  empty.className = 'void-ui-list-empty';
  empty.textContent = item.emptyText;
  buttons.push(empty);
 }
 node.replaceChildren(...buttons);
 node.scrollTop = 0;
 return true;
}
