(() => {
  'use strict';

  const DB_NAME = 'retalhos-db';
  const STORE = 'memories';
  const imageUrls = new Map();
  let map = null;
  let stackLayer = null;
  let memories = [];
  let renderFrame = 0;
  let drawerObserver = null;
  let deleteObserver = null;

  const style = document.createElement('style');
  style.textContent = `
    .intro{display:none!important}
    .map-section{margin-top:8px!important}
    .map-heading{padding-bottom:8px}
    .map-bottomline,.map-legend{font-size:11px}
    .map-tool,.mode-switch button,.map-heading-actions button{border-radius:999px!important;box-shadow:none!important}
    .leaflet-tile-pane{filter:grayscale(.52) saturate(.58) brightness(1.09) sepia(.08)}
    .retalhos-stack-marker,.retalhos-stack-marker.leaflet-div-icon{width:44px!important;height:44px!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;overflow:visible!important}
    .retalhos-stack-hit{position:absolute;inset:0;display:grid;place-items:center;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
    .retalhos-stack-art{display:block;width:var(--patch-w,24px);height:var(--patch-h,18px);overflow:hidden;border:0;border-radius:1px;transition:width .18s ease,height .18s ease}
    .retalhos-stack-art img{display:block;width:100%;height:100%;object-fit:cover;border:0;border-radius:1px;background:transparent;box-shadow:none}
    .retalhos-stack-marker:hover .retalhos-stack-art,.retalhos-stack-marker:focus-visible .retalhos-stack-art{filter:brightness(1.08)}
    .retalhos-stack-marker:focus-visible{outline:2px solid #315b4b;outline-offset:1px;border-radius:50%}
    .retalhos-stack-popup{display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:7px;max-width:260px;max-height:230px;overflow:auto}
    .retalhos-stack-photo{position:relative;min-width:0}
    .retalhos-stack-photo img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:4px}
    .retalhos-stack-photo span{display:block;overflow:hidden;padding:4px 2px;color:#243b31;font:11px system-ui;text-overflow:ellipsis;white-space:nowrap}
    .retalhos-stack-delete,.retalhos-pending-delete{display:grid;place-items:center;width:30px;height:30px;padding:0;border:1px solid #d8d3c5;border-radius:50%;background:#fffdf7;color:#743d32;font:20px/1 system-ui;cursor:pointer}
    .retalhos-stack-delete{position:absolute;top:4px;right:4px;box-shadow:0 1px 5px #17231e55}
    .retalhos-pending-delete{position:absolute;top:6px;right:6px;z-index:2}
    .welcome-panel[hidden]{display:none!important}
    .memory-section{display:none!important}
    #pendingSection:not([hidden]){display:block!important}
    #pendingSection .pending-card{position:relative}
    .retalhos-quick-actions #clearMemories{min-height:36px;padding:7px 10px;border:0;border-radius:999px;background:transparent;color:#6f786f;font:12px system-ui;text-decoration:underline;text-underline-offset:3px}
    .location-index-drawer{margin:18px 0 24px;border:1px solid #d8d3c5;border-radius:14px;background:#fffdf7;overflow:hidden}
    .location-index-drawer>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:58px;padding:12px 16px;cursor:pointer;list-style:none;color:#1e302a}
    .location-index-drawer>summary::-webkit-details-marker{display:none}
    .location-index-drawer>summary:after{content:'＋';color:#315b4b;font-size:20px}
    .location-index-drawer[open]>summary:after{content:'−'}
    .location-index-drawer .location-index-heading{flex:1;margin:0;align-items:center}
    .location-index-drawer .location-index-kicker,.location-index-drawer .location-index-intro{display:none}
    .location-index-drawer .location-index-heading h3{font-size:20px;color:#1e302a}
    .location-index-drawer .location-index-total{border-color:#d8d3c5;color:#315b4b}
    .location-index-drawer-panel{max-height:min(65vh,620px);overflow:auto;padding:0 14px 14px;border-top:1px solid #ece7da}
    .location-index-drawer .location-index-tools{position:sticky;top:0;z-index:2;padding:12px 0 8px;margin:0;background:#fffdf7}
    .location-index-drawer .location-index-search{background:#f8f5ed;color:#243b31;border-color:#d8d3c5}
    .location-index-drawer .location-index{grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr))}
    .location-index-drawer .location-folder{background:#f8f5ed;border-color:#e4dfd3}
    .location-index-drawer .location-folder-name{color:#243b31}
    .location-index-drawer .location-folder-meta{color:#6f786f}
    .location-index-drawer .location-folder-count{background:#e8eee8;color:#315b4b}
    .location-index-drawer .location-folder-preview img{border-color:#f8f5ed}
    .location-index-drawer .location-photo{background:#f4f0e6;border-color:#ded8ca}
    .location-index-drawer .location-photo span{color:#243b31}
    .retalhos-photo-pin,.retalhos-cluster,.retalhos-cluster-wrap{display:none!important}
    @media(prefers-reduced-motion:reduce){.retalhos-stack-art{transition:none}}
  `;
  document.head.appendChild(style);

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function getMemories() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }
  async function deleteMemory(id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  function imageUrl(item) {
    if (imageUrls.has(item.id)) return imageUrls.get(item.id);
    const url = item.blob instanceof Blob ? URL.createObjectURL(item.blob) : (item.image || '');
    imageUrls.set(item.id, url);
    return url;
  }
  function getZoomSize(zoom) {
    const t = Math.max(0, Math.min(1, (zoom - 2) / 11));
    const width = Math.round(3 + 47 * Math.pow(t, 1.32));
    return { width, height: Math.max(2, Math.round(width * .72)) };
  }
  function groupByPoint(items) {
    const groups = new Map();
    items.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng)).forEach(item => {
      const key = `${item.lat.toFixed(6)},${item.lng.toFixed(6)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    return [...groups.values()];
  }
  function notify(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 3200);
  }
  async function removePhoto(item) {
    const name = item.name || 'esta fotografia';
    if (!window.confirm(`Queres apagar "${name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteMemory(item.id);
      const url = imageUrls.get(item.id);
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
      imageUrls.delete(item.id);
      window.dispatchEvent(new Event('retalhos-data-changed'));
      await refresh();
      notify('Fotografia apagada.');
    } catch (error) {
      console.error('Não foi possível apagar a fotografia:', error);
      notify('Não foi possível apagar a fotografia.');
    }
  }
  function makePopup(group) {
    const content = document.createElement('div');
    content.className = 'retalhos-stack-popup';
    group.forEach(item => {
      const card = document.createElement('div');
      card.className = 'retalhos-stack-photo';
      const image = document.createElement('img');
      image.src = imageUrl(item);
      image.alt = item.name || 'Fotografia';
      const caption = document.createElement('span');
      caption.textContent = item.name || 'Fotografia';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'retalhos-stack-delete';
      remove.textContent = '×';
      remove.title = `Apagar ${item.name || 'fotografia'}`;
      remove.setAttribute('aria-label', `Apagar ${item.name || 'fotografia'}`);
      remove.addEventListener('click', event => { event.stopPropagation(); removePhoto(item); });
      card.append(image, caption, remove);
      content.appendChild(card);
    });
    return content;
  }
  function renderStacks() {
    if (!map || !stackLayer) return;
    stackLayer.clearLayers();
    const size = getZoomSize(map.getZoom());
    groupByPoint(memories).forEach(group => {
      // A single, unframed top photograph represents the whole location stack.
      const top = group[group.length - 1];
      const art = document.createElement('span');
      art.className = 'retalhos-stack-art';
      art.style.setProperty('--patch-w', `${size.width}px`);
      art.style.setProperty('--patch-h', `${size.height}px`);
      const image = document.createElement('img');
      image.src = imageUrl(top);
      image.alt = top.name || 'Retalho';
      art.appendChild(image);

      const hit = document.createElement('span');
      hit.className = 'retalhos-stack-hit';
      hit.setAttribute('role', 'button');
      hit.setAttribute('tabindex', '0');
      hit.setAttribute('aria-label', `${group.length} ${group.length === 1 ? 'fotografia' : 'fotografias'} neste local; tocar para abrir a coleção`);
      hit.appendChild(art);

      const icon = L.divIcon({ className: 'retalhos-stack-marker', html: hit, iconSize: [44, 44], iconAnchor: [22, 22] });
      const first = group[0];
      const marker = L.marker([first.lat, first.lng], { icon, keyboard: true, title: top.locationName || top.name || 'Retalho' });
      marker.bindPopup(makePopup(group), { maxWidth: 280, autoPan: true });
      marker.on('click', () => {
        if (map.getZoom() < 5) map.flyTo([first.lat, first.lng], 8, { duration: .45 });
      });
      marker.addTo(stackLayer);
    });
  }
  function scheduleRender() {
    if (renderFrame) cancelAnimationFrame(renderFrame);
    renderFrame = requestAnimationFrame(renderStacks);
  }
  async function refresh() {
    try {
      memories = await getMemories();
      const locatedCount = memories.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng)).length;
      const welcome = document.getElementById('welcomePanel');
      if (welcome) welcome.hidden = memories.length > 0;
      const status = document.getElementById('mapStatus');
      if (status) status.textContent = locatedCount ? `${locatedCount} RETALHOS NO MAPA` : 'PORTUGAL · OS TEUS RETALHOS';
      scheduleRender();
    } catch (error) { console.warn('Não foi possível atualizar as pilhas do mapa:', error); }
  }
  function removeLegacyPins() {
    if (!map) return;
    const legacy = [];
    map.eachLayer(layer => {
      if (layer === stackLayer || typeof layer.getLayers !== 'function') return;
      try {
        if (layer.getLayers().some(child => child instanceof L.Marker)) legacy.push(layer);
      } catch (_) {}
    });
    legacy.forEach(layer => map.removeLayer(layer));
  }
  function setupMap() {
    map = window.retalhosMap;
    if (!map || !window.L) return false;
    if (stackLayer) return true;
    removeLegacyPins();
    stackLayer = L.layerGroup().addTo(map);
    map.on('zoomend moveend', scheduleRender);
    refresh();
    return true;
  }
  function setupDrawer() {
    const section = document.querySelector('.location-index-section');
    if (!section || section.querySelector('.location-index-drawer')) return;
    const heading = section.querySelector('.location-index-heading');
    const tools = section.querySelector('.location-index-tools');
    const root = section.querySelector('#locationIndex');
    if (!heading || !root) return;
    const drawer = document.createElement('details');
    drawer.className = 'location-index-drawer';
    const summary = document.createElement('summary');
    summary.appendChild(heading);
    const panel = document.createElement('div');
    panel.className = 'location-index-drawer-panel';
    if (tools) panel.appendChild(tools);
    panel.appendChild(root);
    drawer.append(summary, panel);
    section.appendChild(drawer);
  }
  function watchDrawer() {
    setupDrawer();
    const section = document.querySelector('.location-index-section');
    if (section && !drawerObserver) {
      drawerObserver = new MutationObserver(setupDrawer);
      drawerObserver.observe(section, { childList: true });
    }
  }
  function addPendingDeleteButtons() {
    document.querySelectorAll('#pendingList .pending-card').forEach(card => {
      if (card.querySelector('.retalhos-pending-delete')) return;
      const itemName = card.querySelector('.pending-name')?.textContent?.trim();
      const item = memories.find(memory => memory.name === itemName && (!Number.isFinite(memory.lat) || !Number.isFinite(memory.lng)));
      if (!item) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'retalhos-pending-delete';
      button.textContent = '×';
      button.title = `Apagar ${item.name || 'fotografia'}`;
      button.setAttribute('aria-label', `Apagar ${item.name || 'fotografia'}`);
      button.addEventListener('click', event => { event.stopPropagation(); removePhoto(item); });
      card.appendChild(button);
    });
  }
  function watchPendingList() {
    const list = document.getElementById('pendingList');
    if (list && !deleteObserver) {
      deleteObserver = new MutationObserver(addPendingDeleteButtons);
      deleteObserver.observe(list, { childList: true, subtree: true });
    }
    addPendingDeleteButtons();
  }
  function moveClearAllControl() {
    const clear = document.getElementById('clearMemories');
    const actions = document.getElementById('retalhosQuickActions');
    if (clear && actions && clear.parentElement !== actions) actions.appendChild(clear);
    if (clear) clear.textContent = 'Apagar tudo';
  }
  function bindCameraTimestamp() {
    const input = document.getElementById('retalhosCameraInput');
    if (!input || input.dataset.timestampBound) return;
    input.dataset.timestampBound = 'true';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const capturedAt = Date.now();
      // app-controls imports asynchronously; wait for its record, without altering older photos.
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise(resolve => window.setTimeout(resolve, 250));
        const all = await getMemories().catch(() => []);
        const match = all.find(item => item.name === file.name.replace(/\.[^.]+$/, '') && item.created >= capturedAt - 1500 && !item.takenAt);
        if (!match) continue;
        match.takenAt = capturedAt;
        const db = await openDatabase();
        await new Promise((resolve, reject) => {
          const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(match);
          request.onsuccess = resolve;
          request.onerror = () => reject(request.error);
        });
        window.dispatchEvent(new Event('retalhos-data-changed'));
        break;
      }
    });
  }
  function init() {
    const tryMap = () => { if (!setupMap()) window.setTimeout(tryMap, 150); };
    tryMap();
    watchDrawer();
    watchPendingList();
    moveClearAllControl();
    bindCameraTimestamp();
    window.addEventListener('retalhos-data-changed', () => { refresh(); addPendingDeleteButtons(); });
    window.setInterval(() => {
      refresh();
      watchDrawer();
      watchPendingList();
      moveClearAllControl();
      bindCameraTimestamp();
    }, 2400);
    window.addEventListener('resize', scheduleRender);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
