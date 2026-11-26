(() => {
  'use strict';

  const DB_NAME = 'retalhos-db';
  const STORE = 'memories';
  const urls = new Map();
  let markerLayer = null;
  let lastSignature = '';

  function imageUrl(item) {
    if (urls.has(item.id)) return urls.get(item.id);
    const url = item.blob instanceof Blob ? URL.createObjectURL(item.blob) : (item.image || '');
    urls.set(item.id, url);
    return url;
  }

  // Captura a instância do mapa criada por app.js.
  if (window.L) {
    const originalMap = window.L.map;
    window.L.map = function (...args) {
      const instance = originalMap.apply(this, args);
      window.retalhosMap = instance;
      markerLayer = window.L.layerGroup().addTo(instance);
      return instance;
    };
  }

  async function readMemories() {
    if (!window.retalhosMap || !window.L) return;

    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const items = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const located = items.filter(item =>
      Number.isFinite(item.lat) && Number.isFinite(item.lng) &&
      item.lat >= -90 && item.lat <= 90 && item.lng >= -180 && item.lng <= 180
    );
    const signature = located.map(item => `${item.id}:${item.lat}:${item.lng}`).join('|');
    if (signature === lastSignature) return;

    lastSignature = signature;
    markerLayer.clearLayers();

    located.forEach(item => {
      const marker = window.L.circleMarker([item.lat, item.lng], {
        radius: 9,
        color: '#f1c982',
        weight: 3,
        fillColor: '#b7d5c8',
        fillOpacity: 0.95
      });

      const name = String(item.name || 'Fotografia').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
      const src = imageUrl(item).replace(/"/g, '&quot;');
      marker.bindPopup(`
        <div style="width:180px">
          <img src="${src}" alt="${name}" style="display:block;width:100%;height:120px;object-fit:cover;border-radius:6px;margin-bottom:7px">
          <strong style="display:block">${name}</strong>
        </div>
      `, { maxWidth: 210 });
      marker.addTo(markerLayer);
    });

    // Apenas ao aumentar/diminuir o conjunto mostramos imediatamente o novo local.
    const latest = located.reduce((best, item) => !best || item.created > best.created ? item : best, null);
    if (latest && located.length) {
      window.retalhosMap.flyTo([latest.lat, latest.lng], Math.max(window.retalhosMap.getZoom(), 12), { duration: 0.8 });
    }
  }

  async function refreshLoop() {
    try { await readMemories(); } catch (_) {}
  }

  window.addEventListener('load', () => {
    refreshLoop();
    window.setInterval(refreshLoop, 700);
  });
})();
