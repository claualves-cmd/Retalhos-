(() => {
  'use strict';
  const DB_NAME = 'retalhos-db';
  const DB_VERSION = 1;
  const STORE = 'memories';
  const mapEl = document.getElementById('map');
  const selectedPlace = document.getElementById('selectedPlace');
  const selectedCoords = document.getElementById('selectedCoords');
  const mapHint = document.getElementById('mapHint');
  const gallery = document.getElementById('gallery');
  const memoryCount = document.getElementById('memoryCount');
  const photoInput = document.getElementById('photoInput');
  const toastEl = document.getElementById('toast');
  let map, selected = null, portugalLayer = null, deferredInstall = null;
  const markers = new Map();
  let toastTimer;

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function dbAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result.sort((a,b) => b.created - a.created));
      req.onerror = () => reject(req.error);
    });
  }
  async function dbPut(item) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(item);
      req.onsuccess = () => resolve(); req.onerror = () => reject(req.error);
    });
  }
  async function dbDelete(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
      req.onsuccess = () => resolve(); req.onerror = () => reject(req.error);
    });
  }
  async function dbClear() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
      req.onsuccess = () => resolve(); req.onerror = () => reject(req.error);
    });
  }
  function initMap() {
    if (!window.L) { mapHint.textContent = 'Não foi possível carregar o mapa. Verifica a ligação à internet.'; return; }
    map = L.map('map', { zoomControl: true, scrollWheelZoom: true, minZoom: 5, maxZoom: 17 }).setView([39.6, -8.0], 6.4);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics and GIS community'
    }).addTo(map);
    map.on('click', (event) => {
      selected = { lat: event.latlng.lat, lng: event.latlng.lng };
      selectedPlace.textContent = 'Local escolhido';
      selectedCoords.textContent = `${selected.lat.toFixed(5)}, ${selected.lng.toFixed(5)}`;
      mapHint.textContent = 'Local selecionado. Agora adiciona uma ou várias fotografias.';
      if (window._selectionMarker) map.removeLayer(window._selectionMarker);
      window._selectionMarker = L.circleMarker(event.latlng, { radius: 7, color: '#fff4d8', weight: 2, fillColor: '#e5b979', fillOpacity: 1 }).addTo(map);
    });
    // Natural Earth country outline, clipped to the mainland polygon (largest polygon only).
    fetch('https://gisgp-files.s3.eu-west-1.amazonaws.com/downloads/countries/portugal/portugal-boundary.geojson')
      .then(r => { if (!r.ok) throw new Error('boundary'); return r.json(); })
      .then(data => {
        const feature = data.features?.[0] || data;
        let geom = feature.geometry;
        if (geom?.type === 'MultiPolygon') {
          const mainland = geom.coordinates.reduce((best, poly) => {
            const area = Math.abs(poly[0].reduce((sum, p, i, arr) => i ? sum + p[0]*arr[i-1][1]-arr[i-1][0]*p[1] : sum, 0));
            return !best || area > best.area ? { poly, area } : best;
          }, null);
          geom = { type: 'Polygon', coordinates: mainland.poly };
          feature.geometry = geom;
        }
        portugalLayer = L.geoJSON(feature, { style: { color: '#f4dfb7', weight: 2.5, opacity: .95, fillColor: '#d4c09a', fillOpacity: .07, dashArray: '5 4' }, interactive: false }).addTo(map);
        map.fitBounds(portugalLayer.getBounds(), { padding: [18, 18] });
        mapHint.textContent = 'Toca num ponto de Portugal para escolher o local de uma memória.';
      })
      .catch(() => {
        // The satellite map remains usable if the boundary provider is temporarily unavailable.
        mapHint.textContent = 'Imagem de satélite ativa. O contorno geográfico não carregou; tenta novamente com ligação à internet.';
      });
    document.getElementById('resetView').addEventListener('click', () => {
      if (portugalLayer) map.fitBounds(portugalLayer.getBounds(), { padding: [18, 18] });
      else map.setView([39.6, -8.0], 6.4);
    });
  }
  function markerIcon() { return L.divIcon({ className: '', html: '<span class="memory-pin"></span>', iconSize: [18,18], iconAnchor: [9,9] }); }
  async function refreshGallery() {
    const items = await dbAll();
    memoryCount.textContent = items.length;
    markers.forEach(m => map?.removeLayer(m)); markers.clear();
    if (!items.length) {
      gallery.innerHTML = '<div class="empty-state"><span class="empty-icon">▧</span><strong>Ainda não há retalhos.</strong><p>A primeira fotografia dá início à tua colcha.</p></div>';
      return;
    }
    gallery.innerHTML = '';
    items.forEach(item => {
      const card = document.createElement('article'); card.className = 'memory-card';
      const img = document.createElement('img'); img.src = item.image; img.alt = item.name; img.loading = 'lazy';
      const meta = document.createElement('div'); meta.className = 'memory-meta'; meta.textContent = item.name;
      const locate = document.createElement('button'); locate.type = 'button'; locate.title = 'Ver no mapa'; locate.textContent = '⌖';
      locate.addEventListener('click', () => { map.setView([item.lat,item.lng], 13); document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      card.append(img, meta, locate); gallery.append(card);
      if (map && window.L) {
        const marker = L.marker([item.lat,item.lng], { icon: markerIcon() }).addTo(map);
        marker.bindPopup(`<img src="${item.image}" alt=""><strong>${escapeHtml(item.name)}</strong><br><small>${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}</small>`);
        markers.set(item.id, marker);
      }
    });
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  photoInput.addEventListener('change', async (event) => {
    const files = [...event.target.files].filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    if (!selected) { toast('Primeiro toca no mapa para escolher o local.'); photoInput.value = ''; return; }
    try {
      for (const file of files) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
        });
        await dbPut({ id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, name: file.name.replace(/\.[^.]+$/, ''), image: dataUrl, lat: selected.lat, lng: selected.lng, created: Date.now() });
      }
      await refreshGallery(); toast(`${files.length} ${files.length === 1 ? 'memória adicionada' : 'memórias adicionadas'}.`);
    } catch (err) { toast('Não foi possível guardar. O armazenamento do telemóvel pode estar cheio.'); }
    photoInput.value = '';
  });
  document.getElementById('clearMemories').addEventListener('click', async () => {
    const items = await dbAll();
    if (!items.length) { toast('Ainda não tens memórias guardadas.'); return; }
    if (confirm('Queres apagar todas as fotografias guardadas neste dispositivo?')) { await dbClear(); await refreshGallery(); toast('Memórias apagadas deste dispositivo.'); }
  });
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstall = event; const btn = document.getElementById('installBtn'); btn.hidden = false; btn.addEventListener('click', async () => { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; btn.hidden = true; }, { once: true }); });
  window.addEventListener('appinstalled', () => toast('Retalhos instalado neste dispositivo.'));
  initMap();
  refreshGallery().catch(() => toast('Não foi possível abrir o arquivo de memórias.'));
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
})();
