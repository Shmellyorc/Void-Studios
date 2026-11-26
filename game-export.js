function gameExportDefaults() {
 const saved = P.buildSettings ?? {};
 return {
  title: typeof saved.title === 'string' ? saved.title.slice(0,100) : String(P.name || 'VOID Game').slice(0,100),
  version: typeof saved.version === 'string' ? saved.version : '1.0.0',
  layout: P.layouts.some(layout => layout.id === saved.layout) ? saved.layout : '',
  icon: validExportIcon(saved.icon) ? saved.icon : '',
 };
}

function validExportIcon(value) {
 return typeof value === 'string' && value.length <= 500000 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function setupGameExport() {
 const dialog = $('#export-game'), form = $('#export-form'), target = $('#export-target'), arch = $('#export-arch');
 const iconField = $('#export-icon'), iconPreview = $('#export-icon-preview'), removeIcon = $('#export-remove-icon');
 const status = $('#export-status'), build = $('#export-build'), close = $('#export-close'), reveal = $('#export-reveal');
 const desktop = window.voidDesktopExport;
 let busy = false, icon = '', host;

 function showStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle('export-error',error);
 }
 function showIcon() {
  if (icon) iconPreview.src = icon;
  else iconPreview.removeAttribute('src');
  iconPreview.hidden = removeIcon.hidden = !icon;
 }
 function showTarget() {
  const web = target.value === 'web';
  $('#export-arch-row').hidden = web;
  $('#export-target-hint').textContent = web
   ? desktop ? 'A self-contained HTML file you can run offline.' : 'Desktop builds are available in the VOID Studio desktop app.'
   : 'A ZIP with a portable app. The first build for a target may download the Electron runtime.';
  build.textContent = web ? 'Download HTML' : 'Build desktop ZIP';
 }
 function setBusy(value) {
  busy = value;
  $('#export-controls').disabled = close.disabled = build.disabled = $('#export-save').disabled = value;
  $('#export-controls').setAttribute('aria-busy',String(value));
 }
 function readSettings() {
  const titleField = $('#export-title'), versionField = $('#export-version');
  const title = titleField.value.trim(), version = versionField.value.trim();
  titleField.setCustomValidity(title && title.length <= 100 ? '' : 'Enter a game title of up to 100 characters.');
  const versionOK = /^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})$/.test(version) &&
   version.split('.').every(part => Number(part) <= 65535);
  versionField.setCustomValidity(versionOK ? '' : 'Enter a version like 1.0.0, with each number at most 65535.');
  if (!form.reportValidity()) return null;
  return { title, version, layout: $('#export-layout').value, icon };
 }
 function store(settings) {
  if (Object.keys(settings).some(key => P.buildSettings?.[key] !== settings[key])) {
   change(() => { P.buildSettings = settings; });
  }
 }

 $('#export-title').oninput = $('#export-version').oninput = event => event.target.setCustomValidity('');
 $('#export-open').onclick = () => {
  const settings = gameExportDefaults();
  $('#export-title').value = settings.title;
  $('#export-version').value = settings.version;
  for (const input of [$('#export-title'),$('#export-version')]) input.setCustomValidity('');
  $('#export-layout').innerHTML = '<option value="">Current layout</option>' + P.layouts.map(layout =>
   `<option value="${esc(layout.id)}">${esc(layout.name)}</option>`).join('');
  $('#export-layout').value = settings.layout;
  icon = settings.icon;
  showIcon();
  showTarget();
  showStatus('');
  reveal.hidden = true;
  dialog.showModal();
 };
 if (desktop) desktop.host().then(info => { host = info; }).catch(error => showStatus(error.message,true));
 else for (const option of target.options) option.disabled = option.value !== 'web';
 target.onchange = () => {
  reveal.hidden = true;
  if (host?.platform === target.value && ['x64','arm64'].includes(host.arch)) arch.value = host.arch;
  showStatus('');
  showTarget();
 };
 iconField.onchange = async () => {
  const file = iconField.files[0];
  iconField.value = '';
  if (!file) return;
  const project = P;
  try {
   const bitmap = await createImageBitmap(file);
   try {
    if (!dialog.open || busy || P !== project) return;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const scale = 256 / Math.max(bitmap.width,bitmap.height);
    const width = bitmap.width*scale, height = bitmap.height*scale;
    canvas.getContext('2d').drawImage(bitmap,(256-width)/2,(256-height)/2,width,height);
    icon = canvas.toDataURL('image/png');
    showIcon();
    showStatus('');
   } finally { bitmap.close(); }
  } catch { showStatus('Could not read that image. Choose a PNG, JPEG, or WebP.',true); }
 };
 removeIcon.onclick = () => { icon = ''; showIcon(); };
 close.onclick = () => dialog.close();
 dialog.addEventListener('cancel',event => { if (busy) event.preventDefault(); });
 $('#export-save').onclick = () => {
  const settings = readSettings();
  if (!settings) return;
  store(settings);
  showStatus('Build settings saved in the project.');
 };
 reveal.onclick = () => { desktop?.reveal().catch(error => showStatus(error.message,true)); };
 form.onsubmit = async event => {
  event.preventDefault();
  if (busy) return;
  const settings = readSettings();
  if (!settings) return;
  store(settings);
  const platform = target.value;
  const { buildSettings: stored, ...scene } = P;
  const game = { ...scene, name: settings.title, activeLayout: settings.layout || L().id };
  reveal.hidden = true;
  setBusy(true);
  showStatus('Preparing standalone game…');
  const unsubscribe = platform !== 'web' ? desktop?.onProgress(showStatus) : null;
  try {
   await new Promise(resolve => setTimeout(resolve,0));
   const html = renderGameHTML(game,settings.icon);
   if (platform === 'web') {
    const name = settings.title.replace(/[^a-z0-9_-]+/gi,'_') || 'game';
    dl(name + '.html',html,'text/html');
    showStatus('HTML sent to browser downloads.');
    return;
   }
   const result = await desktop.build({ ...settings, platform, arch: arch.value },html);
   if (result.error) throw Error(result.error);
   if (result.canceled) showStatus('Desktop export canceled.');
   else {
    showStatus('Built ' + result.path);
    reveal.hidden = false;
   }
  } catch (error) { showStatus(error.message,true); }
  finally {
   unsubscribe?.();
   setBusy(false);
  }
 };
}
