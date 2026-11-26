(() => {
  'use strict';

  const DB_NAME = 'retalhos-db';
  const DB_VERSION = 2;
  const STORE = 'memories';
  const $ = id => document.getElementById(id);
  const objectUrls = new Map();
  const CAOP_URL = 'https://ogcapi.dgterritorio.gov.pt/collections/municipios/items?f=json&limit=500&crs=http://www.opengis.net/def/crs/OGC/1.3/CRS84';
  const covers = {
    portugal: { center: [39.6, -8], zoom: 6.4 }, world: { center: [24, 0], zoom: 2.2 },
    azores: { center: [38.55, -28], zoom: 7.1 }, madeira: { center: [32.75, -17], zoom: 9 },
    france: { center: [46.6, 2.4], zoom: 5.8 }, morocco: { center: [31.8, -6], zoom: 5.8 }
  };

  let map = null, municipalities = [], memories = [], pending = [];
  let activePendingId = null, selectedPlace = null, overlaySvg = null, overlayTimer = null;
  let toastTimer = null, deferredInstall = null;
  const mapHint = $('mapHint'), gallery = $('gallery'), memoryCount = $('memoryCount');
  const photoInput = $('photoInput'), toastEl = $('toast'), coverSelect = $('coverSelect');

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.created - a.created));
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

  function getImageUrl(item) {
    if (objectUrls.has(item.id)) return objectUrls.get(item.id);
    const url = item.blob instanceof Blob ? URL.createObjectURL(item.blob) : (item.image || '');
    objectUrls.set(item.id, url);
    return url;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function loadMunicipalities() {
    if (!window.turf) throw new Error('Turf indisponível');
    const response = await fetch(CAOP_URL, { headers: { Accept: 'application/geo+json' } });
    if (!response.ok) throw new Error(`DGT respondeu com ${response.status}`);
    const data = await response.json();
    municipalities = data.features?.filter(feature => feature.geometry && feature.properties) || [];
    scheduleOverlayDraw();
  }

  function findMunicipality(lat, lng) {
    if (!window.turf || !municipalities.length) return null;
    const point = turf.point([lng, lat]);
    for (const feature of municipalities) {
      try { if (turf.booleanPointInPolygon(point, feature)) return feature; } catch (_) {}
    }
    return null;
  }

  function initMap() {
    if (!window.L) { mapHint.textContent = 'Não foi possível carregar o mapa.'; return; }
    map = L.map('map', { zoomControl: true, scrollWheelZoom: true, touchZoom: true,
      doubleClickZoom: true, minZoom: 2, maxZoom: 18, worldCopyJump: true, preferCanvas: true
    }).setView(covers.portugal.center, covers.portugal.zoom);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      minZoom: 2, maxZoom: 18, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics and GIS community'
    }).addTo(map);

    overlaySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlaySvg.setAttribute('class', 'retalhos-svg');
    Object.assign(overlaySvg.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', zIndex: '450', pointerEvents: 'none' });
    map.getPanes().overlayPane.appendChild(overlaySvg);

    map.on('move zoom zoomend moveend resize', scheduleOverlayDraw);
    map.on('click', handleMapClick);

    const savedCover = localStorage.getItem('retalhos-cover') || 'portugal';
    if (savedCover === 'custom') {
      const custom = JSON.parse(localStorage.getItem('retalhos-custom-cover') || 'null');
      if (custom?.center) map.setView(custom.center, custom.zoom);
      coverSelect.value = 'custom';
    } else if (covers[savedCover]) {
      map.setView(covers[savedCover].center, covers[savedCover].zoom); coverSelect.value = savedCover;
    }

    coverSelect.addEventListener('change', () => {
      const key = coverSelect.value;
      if (key === 'custom') {
        const custom = JSON.parse(localStorage.getItem('retalhos-custom-cover') || 'null');
        if (custom?.center) map.setView(custom.center, custom.zoom);
        else { toast('Ainda não guardaste uma vista personalizada.'); coverSelect.value = 'portugal'; }
      } else if (covers[key]) {
        localStorage.setItem('retalhos-cover', key); map.flyTo(covers[key].center, covers[key].zoom, { duration: 1.1 });
      }
    });

    $('saveCover').addEventListener('click', () => {
      const center = map.getCenter();
      localStorage.setItem('retalhos-custom-cover', JSON.stringify({ center: [center.lat, center.lng], zoom: map.getZoom() }));
      localStorage.setItem('retalhos-cover', 'custom'); coverSelect.value = 'custom'; toast('Vista guardada como capa.');
    });
    $('resetView').addEventListener('click', () => {
      const key = localStorage.getItem('retalhos-cover') || 'portugal';
      if (key === 'custom') {
        const custom = JSON.parse(localStorage.getItem('retalhos-custom-cover') || 'null');
        if (custom) map.flyTo(custom.center, custom.zoom, { duration: .9 });
      } else if (covers[key]) map.flyTo(covers[key].center, covers[key].zoom, { duration: .9 });
    });
    $('welcomeImport').addEventListener('click', () => photoInput.click());
  }

  function handleMapClick(event) {
    if (!activePendingId) { mapHint.textContent = 'Seleciona uma fotografia sem GPS antes de marcar o local no mapa.'; return; }
    const item = pending.find(p => p.id === activePendingId);
    if (item) assignCoordinates([item], event.latlng.lat, event.latlng.lng, 'Local indicado no mapa');
  }

  async function assignCoordinates(items, lat, lng, locationName) {
    for (const item of items) {
      item.lat = lat; item.lng = lng; item.locationSource = 'manual'; item.locationName = locationName || ''; await dbPut(item);
    }
    activePendingId = null; selectedPlace = null; $('placeSearch').value = ''; $('placeResults').innerHTML = '';
    await refreshAll(); toast(items.length === 1 ? 'Local guardado.' : `${items.length} fotografias colocadas no mesmo local.`);
  }

  function scheduleOverlayDraw() {
    if (overlayTimer) cancelAnimationFrame(overlayTimer);
    overlayTimer = requestAnimationFrame(drawPhotoTerritories);
  }

  function groupPhotosByPoint(items) {
    const groups = new Map();
    items.forEach(item => {
      const key = `${item.lat.toFixed(5)},${item.lng.toFixed(5)}`;
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item);
    });
    return [...groups.values()];
  }

  function polygonPath(geometry) {
    const paths = [];
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    polygons.forEach(rings => rings.forEach(ring => {
      const points = ring.map(([lng, lat]) => {
        const p = map.latLngToContainerPoint([lat, lng]); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      });
      if (points.length) paths.push(`M${points.join(' L')} Z`);
    }));
    return paths.join(' ');
  }

  function makePattern(defs, id, item) {
    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.setAttribute('id', id); pattern.setAttribute('patternUnits', 'objectBoundingBox'); pattern.setAttribute('width', '1'); pattern.setAttribute('height', '1');
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('href', getImageUrl(item)); image.setAttribute('x', '0'); image.setAttribute('y', '0'); image.setAttribute('width', '1'); image.setAttribute('height', '1');
    image.setAttribute('preserveAspectRatio', 'xMidYMid slice'); pattern.appendChild(image); defs.appendChild(pattern);
  }

  function drawPhotoTerritories() {
    if (!map || !overlaySvg) return;
    const size = map.getSize(), w = size.x, h = size.y;
    overlaySvg.setAttribute('viewBox', `0 0 ${w} ${h}`); overlaySvg.setAttribute('width', w); overlaySvg.setAttribute('height', h);
    while (overlaySvg.firstChild) overlaySvg.removeChild(overlaySvg.firstChild);
    if (!memories.length) return;

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); overlaySvg.appendChild(defs);
    const zoom = map.getZoom(); let patternIndex = 0;
    const groups = new Map();

    memories.forEach(item => {
      const municipality = findMunicipality(item.lat, item.lng);
      if (!municipality) return;
      if (!groups.has(municipality)) groups.set(municipality, []); groups.get(municipality).push(item);
    });

    groups.forEach((items, municipality) => {
      const pointGroups = groupPhotosByPoint(items);
      let features = [{ geometry: municipality.geometry, items: pointGroups[0] }];

      if (zoom >= 9 && pointGroups.length > 1) {
        const points = pointGroups.map(group => turf.point([group[0].lng, group[0].lat]));
        const cells = turf.voronoi(turf.featureCollection(points), { bbox: turf.bbox(municipality) });
        features = [];
        if (cells?.features) cells.features.forEach((cell, index) => {
          if (!cell || !pointGroups[index]) return;
          try {
            const clipped = turf.intersect(turf.featureCollection([municipality, cell]));
            if (clipped?.geometry) features.push({ geometry: clipped.geometry, items: pointGroups[index] });
          } catch (_) {}
        });
      }

      features.forEach(feature => {
        if (!feature.items?.length) return;
        const id = `retalho-${patternIndex++}`; makePattern(defs, id, feature.items[0]);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', polygonPath(feature.geometry)); path.setAttribute('fill', `url(#${id})`); path.setAttribute('fill-rule', 'evenodd');
        path.setAttribute('class', 'retalho-shape retalho-progressive'); path.style.pointerEvents = 'visiblePainted';
        path.addEventListener('click', event => { event.stopPropagation(); openMemoryPopup(feature.items, feature.items[0].lat, feature.items[0].lng); });
        overlaySvg.appendChild(path);
      });

      if (zoom >= 12) pointGroups.forEach(group => {
        const p = map.latLngToContainerPoint([group[0].lat, group[0].lng]);
        if (!map.getBounds().contains([group[0].lat, group[0].lng])) return;
        const id = `closeup-${patternIndex++}`; makePattern(defs, id, group[0]);
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', p.x - 27); rect.setAttribute('y', p.y - 27); rect.setAttribute('width', '54'); rect.setAttribute('height', '54'); rect.setAttribute('rx', '7');
        rect.setAttribute('fill', `url(#${id})`); rect.setAttribute('class', 'retalho-photo-closeup');
        rect.style.pointerEvents = 'visiblePainted';
        rect.addEventListener('click', event => { event.stopPropagation(); openMemoryPopup(group, group[0].lat, group[0].lng); });
        overlaySvg.appendChild(rect);
      });
    });

    if (zoom >= 8) memories.forEach(item => {
      if (findMunicipality(item.lat, item.lng)) return;
      const p = map.latLngToContainerPoint([item.lat, item.lng]);
      if (!map.getBounds().contains([item.lat, item.lng])) return;
      const id = `world-${patternIndex++}`; makePattern(defs, id, item);
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const size = zoom >= 12 ? 54 : 34;
      rect.setAttribute('x', p.x - size / 2); rect.setAttribute('y', p.y - size / 2); rect.setAttribute('width', size); rect.setAttribute('height', size); rect.setAttribute('rx', '7');
      rect.setAttribute('fill', `url(#${id})`); rect.setAttribute('class', 'retalho-photo-closeup');
      rect.addEventListener('click', event => { event.stopPropagation(); openMemoryPopup([item], item.lat, item.lng); });
      overlaySvg.appendChild(rect);
    });
  }

  function openMemoryPopup(items, lat, lng) {
    const first = items[0];
    const stack = items.length > 1 ? `<div class="stack">${items.slice(0, 8).map(item => `<img src="${getImageUrl(item)}" alt="${escapeHtml(item.name)}">`).join('')}</div>` : '';
    const location = first.locationName ? `<small>${escapeHtml(first.locationName)}</small>` : '';
    const html = `<div class="photo-popup"><img src="${getImageUrl(first)}" alt="${escapeHtml(first.name)}"><strong>${escapeHtml(first.name)}</strong>${location}${stack}</div>`;
    L.popup({ closeButton: true, maxWidth: 230, autoPan: true }).setLatLng([lat, lng]).setContent(html).openOn(map);
  }

  async function readPhoto(file) {
    let gps = null, takenAt = null;
    try {
      if (window.exifr?.parse) {
        const exif = await window.exifr.parse(file, { gps: true, exif: true });
        if (Number.isFinite(exif?.latitude) && Number.isFinite(exif?.longitude)) gps = { lat: exif.latitude, lng: exif.longitude };
        if (exif?.DateTimeOriginal instanceof Date) takenAt = exif.DateTimeOriginal.getTime();
      }
    } catch (_) {}
    return { file, gps, takenAt };
  }

  async function storePhoto(photo, coords, source) {
    const item = { id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, name: photo.file.name.replace(/\.[^.]+$/, ''), blob: photo.file,
      type: photo.file.type, lat: coords.lat, lng: coords.lng, locationSource: source, locationName: '', takenAt: photo.takenAt || null, created: Date.now() };
    await dbPut(item); return item;
  }

  function renderPending() {
    const section = $('pendingSection'), list = $('pendingList');
    $('pendingCount').textContent = pending.length; section.hidden = !pending.length; list.innerHTML = '';
    $('selectAllPending').checked = false;
    pending.forEach(item => {
      const card = document.createElement('article'); card.className = `pending-card${item.id === activePendingId ? ' active' : ''}`;
      const img = document.createElement('img'); img.src = getImageUrl(item); img.alt = item.name;
      const checkWrap = document.createElement('label'); checkWrap.className = 'pending-select';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'pending-check'; checkbox.value = item.id;
      checkbox.addEventListener('change', updateBulkSelection); checkWrap.append(checkbox, document.createTextNode(' Selecionar'));
      const name = document.createElement('div'); name.className = 'pending-name'; name.textContent = item.name;
      const button = document.createElement('button'); button.type = 'button'; button.textContent = item.id === activePendingId ? 'Agora toca no mapa' : 'Marcar no mapa';
      button.addEventListener('click', () => { activePendingId = item.id; renderPending(); mapHint.textContent = `A localizar: ${item.name}.`; map.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); });
      card.append(img, checkWrap, name, button); list.append(card);
    });
  }

  function updateBulkSelection() {
    const selected = document.querySelectorAll('.pending-check:checked').length;
    $('assignPlace').textContent = selectedPlace ? `Atribuir "${selectedPlace.name}" (${selected})` : 'Atribuir local às selecionadas';
    $('assignPlace').disabled = !selectedPlace || selected === 0;
  }

  async function searchPlace() {
    const query = $('placeSearch').value.trim(), resultsEl = $('placeResults');
    resultsEl.innerHTML = ''; selectedPlace = null; updateBulkSelection();
    if (query.length < 3) { resultsEl.textContent = 'Escreve pelo menos três letras.'; return; }
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' } });
      const results = await response.json();
      resultsEl.innerHTML = '';
      if (!results.length) { resultsEl.textContent = 'Não encontrei esse local.'; return; }
      results.forEach(result => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'place-result'; button.textContent = result.display_name;
        button.addEventListener('click', () => {
          selectedPlace = { name: result.name || result.display_name.split(',')[0], displayName: result.display_name, lat: Number(result.lat), lng: Number(result.lon) };
          [...resultsEl.querySelectorAll('.place-result')].forEach(el => el.classList.remove('selected')); button.classList.add('selected'); updateBulkSelection();
          map.flyTo([selectedPlace.lat, selectedPlace.lng], 13, { duration: .8 });
        }); resultsEl.append(button);
      });
    } catch (_) { resultsEl.textContent = 'Não foi possível pesquisar agora.'; }
  }

  async function assignSelectedPlace() {
    const ids = [...document.querySelectorAll('.pending-check:checked')].map(input => input.value);
    const items = pending.filter(item => ids.includes(item.id));
    if (selectedPlace && items.length) await assignCoordinates(items, selectedPlace.lat, selectedPlace.lng, selectedPlace.displayName);
  }

  async function deleteMemory(item) {
    if (!confirm(`Apagar "${item.name}"?`)) return;
    await dbDelete(item.id); const url = objectUrls.get(item.id);
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url); objectUrls.delete(item.id);
    await refreshAll(); toast('Fotografia apagada.');
  }

  async function refreshAll() {
    const all = await dbAll(); pending = all.filter(item => !Number.isFinite(item.lat) || !Number.isFinite(item.lng)); memories = all.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng));
    memoryCount.textContent = memories.length; $('welcomePanel').hidden = memories.length > 0 || pending.length > 0;
    $('mapStatus').textContent = memories.length ? `${memories.length} MEMÓRIAS NO TEU MAPA` : 'PORTUGAL À ESPERA DAS TUAS MEMÓRIAS';
    gallery.innerHTML = '';
    if (!memories.length) gallery.innerHTML = '<div class="empty-state"><strong>Ainda não há retalhos.</strong><p>A primeira fotografia dá início à tua colcha.</p></div>';
    else memories.forEach(item => {
      const card = document.createElement('article'); card.className = 'memory-card';
      const img = document.createElement('img'); img.src = getImageUrl(item); img.alt = item.name; img.loading = 'lazy';
      const meta = document.createElement('div'); meta.className = 'memory-meta'; meta.textContent = item.locationName ? `${item.name} · ${item.locationName}` : item.name;
      const actions = document.createElement('div'); actions.className = 'memory-actions';
      const locate = document.createElement('button'); locate.type = 'button'; locate.title = 'Ver no mapa'; locate.textContent = '⌖';
      locate.addEventListener('click', event => { event.stopPropagation(); map.flyTo([item.lat, item.lng], Math.min(15, Math.max(11, map.getZoom())), { duration: .9 }); });
      const remove = document.createElement('button'); remove.type = 'button'; remove.title = 'Apagar fotografia'; remove.textContent = '×'; remove.addEventListener('click', event => { event.stopPropagation(); deleteMemory(item); });
      actions.append(locate, remove); card.append(img, meta, actions); card.addEventListener('click', () => map.flyTo([item.lat, item.lng], 13, { duration: .9 })); gallery.append(card);
    });
    renderPending(); scheduleOverlayDraw();
  }

  photoInput.addEventListener('change', async event => {
    const files = [...event.target.files].filter(file => file.type.startsWith('image/')); if (!files.length) return;
    photoInput.disabled = true; toast(`A analisar ${files.length} fotografias…`);
    let imported = 0, noGps = 0;
    try {
      for (const file of files) {
        const photo = await readPhoto(file);
        if (photo.gps) { await storePhoto(photo, photo.gps, 'gps'); imported++; }
        else { await dbPut({ id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, name: file.name.replace(/\.[^.]+$/, ''), blob: file, type: file.type, lat: null, lng: null, locationSource: 'pending', takenAt: photo.takenAt || null, created: Date.now() }); noGps++; }
      }
      await refreshAll(); toast(`${imported} com GPS · ${noGps} sem GPS`);
    } catch (_) { toast('Não foi possível importar todas as fotografias.'); await refreshAll(); }
    photoInput.disabled = false; photoInput.value = '';
  });

  $('searchPlace').addEventListener('click', searchPlace);
  $('placeSearch').addEventListener('keydown', event => { if (event.key === 'Enter') searchPlace(); });
  $('assignPlace').addEventListener('click', assignSelectedPlace);
  $('selectAllPending').addEventListener('change', event => { document.querySelectorAll('.pending-check').forEach(input => { input.checked = event.target.checked; }); updateBulkSelection(); });

  $('clearMemories').addEventListener('click', async () => {
    if (!confirm('Apagar todas as fotografias guardadas neste dispositivo?')) return;
    await dbClear(); objectUrls.forEach(url => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); }); objectUrls.clear(); activePendingId = null; await refreshAll(); toast('Memórias apagadas.');
  });

  window.addEventListener('beforeinstallprompt', event => { event.preventEvent?.(); deferredInstall = event; const btn = $('installBtn'); btn.hidden = false; btn.onclick = async () => { deferredInstall?.prompt(); deferredInstall = null; btn.hidden = true; }; });

  initMap(); refreshAll().catch(() => toast('Não foi possível abrir o arquivo.'));
  loadMunicipalities().then(count => { mapHint.textContent = `Limites oficiais dos ${municipalities.length} municípios carregados.`; }).catch(() => { mapHint.textContent = 'Os limites oficiais não estão disponíveis neste momento.'; });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
})();
