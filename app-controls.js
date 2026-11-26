(() => {
  'use strict';

  const DB_NAME = 'retalhos-db';
  const STORE = 'memories';
  const $ = id => document.getElementById(id);
  const PORTUGAL_CENTER = [39.6, -8.0];
  const PORTUGAL_ZOOM = 6.4;
  let map = null;
  let pinLayer = null;
  let allMemories = [];
  let renderedSignature = '';
  const imageUrls = new Map();

  // Keep the map object available and reset any previously saved view to Portugal on startup.
  if (window.L?.map) {
    const leafletMap = window.L.map;
    window.L.map = function (...args) {
      map = leafletMap.apply(this, args);
      window.retalhosMap = map;
      pinLayer = window.L.layerGroup().addTo(map);
      requestAnimationFrame(() => {
        map.setView(PORTUGAL_CENTER, PORTUGAL_ZOOM, { animate: false });
        map.invalidateSize({ pan: false });
      });
      return map;
    };
  }

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
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function getImageUrl(item) {
    if (imageUrls.has(item.id)) return imageUrls.get(item.id);
    const url = item.blob instanceof Blob ? URL.createObjectURL(item.blob) : (item.image || '');
    imageUrls.set(item.id, url);
    return url;
  }
  function renderRetalhos(force = false) {
    if (!map || !pinLayer) return;
    const located = allMemories.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng));
    const signature = located.map(item => `${item.id}:${item.lat}:${item.lng}:${item.locationName || ''}`).sort().join('|');
    if (!force && signature === renderedSignature) return;
    renderedSignature = signature;
    pinLayer.clearLayers();

    located.forEach(item => {
      const url = getImageUrl(item);
      const icon = window.L.divIcon({
        className: 'retalhos-photo-pin',
        html: `<img src="${url.replace(/"/g, '&quot;')}" alt="${String(item.name || 'Retalho').replace(/[&<>"']/g, '')}">`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      const marker = window.L.marker([item.lat, item.lng], { icon, keyboard: true });
      const popup = document.createElement('div');
      popup.className = 'photo-popup';
      const image = document.createElement('img');
      image.src = url;
      image.alt = item.name || 'Fotografia';
      const title = document.createElement('strong');
      title.textContent = item.name || 'Fotografia';
      popup.append(image, title);
      if (item.locationName && item.locationName !== 'Local indicado no mapa') {
        const place = document.createElement('small');
        place.textContent = item.locationName.split(',')[0].trim();
        popup.append(place);
      }
      marker.bindPopup(popup).addTo(pinLayer);
    });
  }
  async function refresh() {
    try {
      allMemories = await getMemories();
      const count = allMemories.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng)).length;
      if ($('memoryCount')) $('memoryCount').textContent = String(count);
      if ($('mapStatus')) $('mapStatus').textContent = count ? `${count} RETALHOS NO MAPA` : 'PORTUGAL · OS TEUS RETALHOS';
      renderRetalhos();
    } catch (error) { console.error('Retalhos no mapa:', error); }
  }
  function bind() {
    // These controls described municipal fills or duplicate map modes; the map is now pins only.
    document.querySelector('.workspace-tools')?.remove();
    document.querySelector('.map-legend')?.remove();
    document.querySelector('.map-bottomline')?.remove();
    if ($('welcomePanel')) $('welcomePanel').hidden = true;
    if ($('gallery')) $('gallery').hidden = true;
    const mapElement = $('map');
    if (mapElement) mapElement.setAttribute('aria-label', 'Mapa de Portugal com os teus retalhos circulares. Toca num retalho para ver a fotografia.');

    // Keep imported and deleted photographs reflected on the map without repeatedly rebuilding pins.
    window.addEventListener('retalhos-data-changed', async () => {
      renderedSignature = '';
      await refresh();
    });
    refresh();
    window.setInterval(refresh, 2500);
  }

  const style = document.createElement('style');
  style.textContent = `
    .leaflet-overlay-pane .retalhos-svg,#map .retalhos-photo-overlay{display:none!important}
    .retalhos-photo-pin,.retalhos-photo-pin.leaflet-div-icon{width:28px!important;height:28px!important;margin:0!important;padding:0!important;border:0!important;border-radius:50%;background:transparent!important;box-shadow:none!important}
    .retalhos-photo-pin img{display:block;box-sizing:border-box;width:28px;height:28px;border:2px solid #fff;border-radius:50%;object-fit:cover;box-shadow:0 1px 5px #0007}
  `;
  document.head.appendChild(style);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
