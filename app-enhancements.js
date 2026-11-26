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

  const style = document.createElement('style');
  style.textContent = `
    .intro{display:none!important}
    .map-section{margin-top:8px!important}
    .map-heading{padding-bottom:8px}
    .map-bottomline,.map-legend{font-size:11px}
    .map-tool,.mode-switch button,.map-heading-actions button{border-radius:999px!important;box-shadow:none!important}
    .leaflet-tile-pane{filter:grayscale(.52) saturate(.58) brightness(1.09) sepia(.08)}
    .retalhos-stack-marker,.retalhos-stack-marker.leaflet-div-icon{border:0!important;background:transparent!important;overflow:visible!important}
    .retalhos-stack-hit{position:absolute;left:50%;top:50%;display:grid;place-items:center;min-width:44px;min-height:44px;transform:translate(-50%,-50%);cursor:pointer;touch-action:manipulation}
    .retalhos-stack-art{position:relative;width:var(--patch-w,24px);height:var(--patch-h,18px);transition:width .18s ease,height .18s ease;filter:drop-shadow(0 1px 2px #17231e55)}
    .retalhos-stack-art img{position:absolute;inset:0;width:100%;height:100%;box-sizing:border-box;object-fit:cover;border:1px solid #e8dfcb;border-radius:2px;background:#d9d2c1}
    .retalhos-stack-art img:not(:last-child){transform:translate(var(--stack-x,1px),var(--stack-y,1px))}
    .retalhos-stack-marker:hover .retalhos-stack-art,.retalhos-stack-marker:focus-visible .retalhos-stack-art{filter:drop-shadow(0 3px 5px #17231e80)}
    .retalhos-stack-marker:focus-visible{outline:2px solid #315b4b;outline-offset:2px;border-radius:8px}
    .retalhos-stack-popup{display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:7px;max-width:260px;max-height:230px;overflow:auto}
    .retalhos-stack-popup button{display:block;min-width:0;padding:0;border:0;background:#fff;cursor:pointer;text-align:left}
    .retalhos-stack-popup img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:4px}
    .retalhos-stack-popup span{display:block;overflow:hidden;padding:4px 2px;color:#243b31;font:11px system-ui;text-overflow:ellipsis;white-space:nowrap}
    .retalhos-stack-count{position:absolute;right:-5px;bottom:-5px;display:grid;place-items:center;min-width:14px;height:14px;padding:0 2px;border:1px solid #f4ead3;border-radius:9px;background:#315b4b;color:#fff;font:700 8px/1 system-ui}
    .welcome-panel[hidden]{display:none!important}
    .location-index-drawer{margin:18px 0 24px;border:1px solid #d8d3c5;border-radius:14px;background:#fffdf7;overflow:hidden}
    .location-index-drawer>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:58px;padding:12px 16px;cursor:pointer;list-style:none;color:#1e302a}
    .location-index-drawer>summary::-webkit-details-marker{display:none}
    .location-index-drawer>summary:after{content:'＋';color:#315b4b;font-size:20px}
    .location-index-drawer[open]>summary:after{content:'−'}
    .location-index-drawer .location-index-heading{margin:0;align-items:center}
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
    .retalhos-photo-pin img,.retalhos-cluster{border-color:#e8dfcb!important;border-radius:3px!important}
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
  async function updateMemory(memory) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(memory);
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
    // Tiny, map-scale swatches when zoomed out; clear photo patches when close.
    const t = Math.max(0, Math.min(1, (zoom - 2) / 11));
    const width = 3 + 47 * Math.pow(t, 1.32);
    return { width: Math.round(width), height: Math.max(2, Math.round(width * .72)) };
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
  function makePopup(group) {
    const content = document.createElement('div');
    content.className = 'retalhos-stack-popup';
    group.forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      const image = document.createElement('img');
      image.src = imageUrl(item);
      image.alt = item.name || 'Fotografia';
      const caption = document.createElement('span');
      caption.textContent = item.name || 'Fotografia';
      button.append(image, caption);
      button.addEventListener('click', () => {
        if (item.locationName) caption.textContent = item.locationName;
      });
      content.appendChild(button);
    });
    return content;
  }
  function renderStacks() {
    if (!map || !stackLayer) return;
    stackLayer.clearLayers();
    const zoom = map.getZoom();
    const size = getZoomSize(zoom);
    groupByPoint(memories).forEach(group => {
      const first = group[0];
      const displayCount = zoom < 4 ? Math.min(group.length, 3) : Math.min(group.length, 5);
      const images = group.slice(0, displayCount).map((item, index) => {
        const img = document.createElement('img');
        img.src = imageUrl(item);
        img.alt = index === group.length - 1 ? (item.name || 'Retalho') : '';
        img.style.setProperty('--stack-x', `${index ? Math.min(2, index) : 0}px`);
        img.style.setProperty('--stack-y', `${index ? -Math.min(2, index) : 0}px`);
        return img;
      });
      const art = document.createElement('span');
      art.className = 'retalhos-stack-art';
      art.style.setProperty('--patch-w', `${size.width}px`);
      art.style.setProperty('--patch-h', `${size.height}px`);
      images.forEach(image => art.appendChild(image));
      if (group.length > 1) {
        const count = document.createElement('span');
        count.className = 'retalhos-stack-count';
        count.textContent = group.length > 9 ? '9+' : String(group.length);
        art.appendChild(count);
      }
      const hit = document.createElement('span');
      hit.className = 'retalhos-stack-hit';
      hit.setAttribute('role', 'button');
      hit.setAttribute('tabindex', '0');
      hit.setAttribute('aria-label', `${group.length} ${group.length === 1 ? 'fotografia' : 'fotografias'} neste local`);
      hit.appendChild(art);
      const icon = L.divIcon({
        className: 'retalhos-stack-marker',
        html: hit,
        iconSize: [Math.max(44, size.width + 6), Math.max(44, size.height + 6)],
        iconAnchor: [Math.max(22, (size.width + 6) / 2), Math.max(22, (size.height + 6) / 2)]
      });
      const marker = L.marker([first.lat, first.lng], { icon, keyboard: true, title: first.locationName || first.name || 'Retalho' });
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
    removeLegacyPins();
    stackLayer = L.layerGroup().addTo(map);
    map.on('zoomend moveend', scheduleRender);
    map.on('layeradd', event => {
      if (event.layer !== stackLayer) {
        window.setTimeout(removeLegacyPins, 0);
      }
    });
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
      drawerObserver.observe(section, { childList: true, subtree: false });
    }
  }
  async function backfillCaptureDate() {
    try {
      const all = await getMemories();
      const cutoff = Date.now() - 90_000;
      const recentCamera = all.filter(item => !item.takenAt && item.created >= cutoff && item.created <= Date.now() && item.locationSource !== 'pending');
      for (const item of recentCamera) {
        item.takenAt = item.created;
        await updateMemory(item);
      }
    } catch (error) { console.warn('Não foi possível guardar a data da fotografia:', error); }
  }
  function bindCamera() {
    document.addEventListener('click', event => {
      if (event.target.closest('#retalhosQuickActions button:nth-child(2)')) {
        window.retalhosCameraRequestedAt = Date.now();
      }
    }, true);
    window.addEventListener('retalhos-data-changed', () => { backfillCaptureDate(); refresh(); });
    const cameraInput = document.getElementById('retalhosCameraInput');
    cameraInput?.addEventListener('change', () => window.setTimeout(backfillCaptureDate, 500));
  }
  function init() {
    bindCamera();
    watchDrawer();
    const tryMap = () => {
      if (setupMap()) return;
      window.setTimeout(tryMap, 150);
    };
    tryMap();
    window.setInterval(() => { refresh(); watchDrawer(); }, 2400);
    window.addEventListener('resize', scheduleRender);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
