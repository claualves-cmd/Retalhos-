(() => {
  'use strict';

  const DB_NAME = 'retalhos-db';
  const DB_VERSION = 2;
  const STORE = 'memories';
  const COVER_KEY = 'retalhos-cover-view';
  const DEFAULT_CENTER = [39.6, -8];
  const DEFAULT_ZOOM = 6.4;
  const TOTAL_MUNICIPALITIES = 308;
  const TOTAL_DISTRICTS = 18;
  const $ = id => document.getElementById(id);
  const photoInput = $('photoInput');
  const cameraInput = $('cameraInput');
  const backupInput = $('backupInput');
  const mapElement = $('map');
  const objectUrls = new Map();
  let map, markerLayer;
  let allMemories = [];
  let municipalities = [];
  let statsLoaded = false;
  let selectedPlace = null;

  const municipalityName = feature => {
    const p = feature?.properties || {};
    return p.municipio || p.MUNICIPIO || p.nome || p.NOME || p.name || p.NAME || '';
  };
  const districtName = feature => {
    const p = feature?.properties || {};
    return p.distrito || p.DISTRITO || p.district || p.District || p.nome_distrito || p.NOME_DISTRITO || p.district_name || '';
  };
  function norm(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim().toLocaleLowerCase('pt').replace(/\s+/g, ' ');
  }
  function notify(message) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('show'), 4200);
  }
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB indisponível'));
      req.onblocked = () => reject(new Error('A base de dados está bloqueada por outra janela.'));
    });
  }
  async function getMemories() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  async function writeMany(items) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      items.forEach(item => tx.objectStore(STORE).put(item));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Falha ao guardar dados'));
      tx.onabort = () => reject(tx.error || new Error('A gravação foi interrompida'));
    });
  }
  function imageUrl(item) {
    if (!objectUrls.has(item.id)) objectUrls.set(item.id, item.blob instanceof Blob ? URL.createObjectURL(item.blob) : (item.image || ''));
    return objectUrls.get(item.id);
  }
  function areaFor(lat, lng) {
    if (!window.turf || !municipalities.length || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const point = turf.point([lng, lat]);
    return municipalities.find(feature => {
      try { return turf.booleanPointInPolygon(point, feature); } catch (_) { return false; }
    }) || null;
  }
  function findAreaByText(text) {
    const wanted = norm(text);
    if (!wanted) return null;
    // Reverse-geocoder names often contain locality, municipality, district and country.
    const tokens = String(text).split(/[;,·]/).map(norm).filter(Boolean);
    return municipalities.find(feature => {
      const name = norm(municipalityName(feature));
      return name && (name === wanted || tokens.includes(name) || tokens.some(token => token === name));
    }) || municipalities.find(feature => {
      const name = norm(municipalityName(feature));
      return name && wanted.includes(name);
    }) || null;
  }
  function resolveArea(memory) {
    const byCoordinates = areaFor(memory.lat, memory.lng);
    return byCoordinates || findAreaByText(memory.locationName) || findAreaByText(memory.suggestedLocation);
  }
  function resolvePlace(memory, area) {
    const explicit = String(memory.locationName || memory.suggestedLocation || '').trim();
    if (explicit && explicit !== 'Local indicado no mapa') return explicit.split(',')[0].trim();
    return municipalityName(area) || 'Local sem nome';
  }
  function updateStats() {
    const towns = new Set();
    const districts = new Set();
    const places = new Set();
    let contributingPhotos = 0;

    allMemories.forEach(memory => {
      const area = resolveArea(memory);
      const hasCoordinates = Number.isFinite(memory.lat) && Number.isFinite(memory.lng);
      const hasExplicitLocation = Boolean(String(memory.locationName || memory.suggestedLocation || '').trim());
      if (!area && !hasCoordinates && !hasExplicitLocation) return;
      contributingPhotos++;
      const town = municipalityName(area);
      const district = districtName(area);
      if (town) towns.add(norm(town));
      if (district) districts.add(norm(district));
      const place = resolvePlace(memory, area);
      if (place && place !== 'Local sem nome') places.add(norm(place));
    });

    $('placeCount').textContent = String(places.size);
    $('municipalityCount').textContent = statsLoaded ? `${towns.size} de ${TOTAL_MUNICIPALITIES}` : '—';
    $('districtCount').textContent = statsLoaded ? `${districts.size} de ${TOTAL_DISTRICTS}` : '—';
    $('locatedPhotoCount').textContent = String(contributingPhotos);
    $('unlocatedPhotoCount').textContent = String(Math.max(0, allMemories.length - contributingPhotos));
    $('onboarding').hidden = allMemories.length >= 3;
  }
  function imageIcon(memory, count) {
    const image = document.createElement('img');
    image.src = imageUrl(memory);
    image.alt = memory.name || 'Retalho';
    const node = document.createElement('div');
    node.className = 'retalhos-photo-marker';
    node.appendChild(image);
    if (count > 1) node.title = `${count} fotografias neste local`;
    return L.divIcon({ className: 'retalhos-photo-marker', html: node, iconSize: [28, 28], iconAnchor: [14, 14] });
  }
  function openArchive(memory) {
    const area = resolveArea(memory);
    window.dispatchEvent(new CustomEvent('retalhos-open-location', {
      detail: { location: resolvePlace(memory, area) }
    }));
  }
  function renderMarkers() {
    if (!map || !markerLayer) return;
    markerLayer.clearLayers();
    const groups = new Map();
    allMemories.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng)).forEach(item => {
      const key = `${item.lat.toFixed(6)},${item.lng.toFixed(6)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    groups.forEach(items => {
      const top = items[items.length - 1];
      const marker = L.marker([top.lat, top.lng], {
        icon: imageIcon(top, items.length), title: `Abrir ${resolvePlace(top, resolveArea(top))}`
      });
      marker.on('click', () => openArchive(top));
      markerLayer.addLayer(marker);
    });
  }
  function initMap() {
    if (!window.L || !mapElement) { notify('O mapa não carregou. Verifica a ligação à internet.'); return; }
    if (mapElement._leaflet_id) return;
    map = L.map(mapElement, { zoomControl: true, scrollWheelZoom: true, touchZoom: true, doubleClickZoom: true, minZoom: 2, maxZoom: 18, worldCopyJump: true });
    markerLayer = L.layerGroup().addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      minZoom: 2, maxZoom: 18,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics and GIS community'
    }).addTo(map);
    let cover = null;
    try { cover = JSON.parse(localStorage.getItem(COVER_KEY) || 'null'); } catch (_) { /* Use default view. */ }
    map.setView(cover?.center && Number.isFinite(cover.zoom) ? cover.center : DEFAULT_CENTER,
      cover?.center && Number.isFinite(cover.zoom) ? cover.zoom : DEFAULT_ZOOM);
    window.retalhosMap = map;
    $('saveCover').onclick = () => {
      const center = map.getCenter();
      localStorage.setItem(COVER_KEY, JSON.stringify({ center: [center.lat, center.lng], zoom: map.getZoom() }));
      notify('Vista guardada neste dispositivo (centro e zoom).');
    };
    $('resetCover').onclick = () => {
      let cover = null;
      try { cover = JSON.parse(localStorage.getItem(COVER_KEY) || 'null'); } catch (_) { /* Use default view. */ }
      map.flyTo(cover?.center || DEFAULT_CENTER, cover?.zoom || DEFAULT_ZOOM, { duration: .7 });
    };
    window.addEventListener('resize', () => map.invalidateSize({ pan: false }));
    setTimeout(() => map.invalidateSize({ pan: false }), 150);
  }
  function renderPending() {
    const pending = allMemories.filter(memory => !Number.isFinite(memory.lat) || !Number.isFinite(memory.lng));
    $('pendingCount').textContent = String(pending.length);
    $('pendingSection').hidden = pending.length === 0;
    const list = $('pendingList');
    list.replaceChildren();
    pending.forEach(memory => {
      const card = document.createElement('article');
      const image = document.createElement('img');
      const label = document.createElement('label');
      const check = document.createElement('input');
      const name = document.createElement('span');
      card.className = 'pending-card'; image.src = imageUrl(memory); image.alt = memory.name || 'Fotografia';
      check.type = 'checkbox'; check.className = 'pending-check'; check.value = memory.id; check.addEventListener('change', updateAssignButton);
      name.textContent = memory.name || 'Fotografia sem nome'; label.append(check, name); card.append(image, label); list.appendChild(card);
    });
    $('selectAllPending').checked = false;
    updateAssignButton();
  }
  function updateAssignButton() {
    const count = document.querySelectorAll('.pending-check:checked').length;
    $('assignPendingPlace').disabled = !selectedPlace || count === 0;
    $('assignPendingPlace').textContent = selectedPlace ? `Atribuir ${selectedPlace.name} (${count})` : 'Atribuir local às selecionadas';
  }
  async function searchPendingPlace() {
    const query = $('pendingPlaceSearch').value.trim();
    const box = $('pendingPlaceResults'); box.replaceChildren(); selectedPlace = null; updateAssignButton();
    if (query.length < 2) { box.textContent = 'Escreve pelo menos duas letras.'; return; }
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=pt&q=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Pesquisa indisponível (${response.status})`);
      const results = await response.json();
      if (!results.length) { box.textContent = 'Não encontrei esse local.'; return; }
      results.forEach(result => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'pending-place-result'; button.textContent = result.display_name;
        button.onclick = () => {
          selectedPlace = { name: result.name || result.display_name.split(',')[0], displayName: result.display_name, lat: Number(result.lat), lng: Number(result.lon) };
          box.querySelectorAll('button').forEach(element => element.removeAttribute('aria-pressed'));
          button.setAttribute('aria-pressed', 'true'); map?.flyTo([selectedPlace.lat, selectedPlace.lng], 13, { duration: .6 }); updateAssignButton();
        };
        box.appendChild(button);
      });
    } catch (error) { console.warn(error); box.textContent = 'Não foi possível procurar agora. Tenta novamente mais tarde.'; }
  }
  async function assignPending() {
    if (!selectedPlace) return;
    const ids = [...document.querySelectorAll('.pending-check:checked')].map(input => input.value);
    const items = allMemories.filter(item => ids.includes(item.id)); if (!items.length) return;
    try {
      await writeMany(items.map(item => ({ ...item, lat: selectedPlace.lat, lng: selectedPlace.lng,
        locationName: selectedPlace.displayName, locationSource: 'manual' })));
      selectedPlace = null; $('pendingPlaceResults').replaceChildren(); $('pendingPlaceSearch').value = '';
      await refresh(); notify(`${items.length} fotografia(s) localizada(s). Os contadores foram atualizados.`);
    } catch (error) { storageError(error); }
  }
  async function refresh() {
    try {
      allMemories = await getMemories();
      const located = allMemories.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng)).length;
      $('mapStatus').textContent = located ? `${located} RETALHOS NO MAPA` : 'PORTUGAL · OS TEUS RETALHOS';
      renderMarkers(); renderPending(); updateStats();
      window.dispatchEvent(new Event('retalhos-data-changed'));
    } catch (error) { console.error(error); notify('Não foi possível abrir o arquivo de fotografias neste navegador.'); }
  }
  function dataUrlToBlob(dataUrl) {
    const [meta, encoded] = dataUrl.split(',');
    const mime = meta.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
    const binary = atob(encoded), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  async function importBackupFile(file) {
    const data = JSON.parse(await file.text());
    if (!data || data.format !== 'retalhos-backup-v1' || !Array.isArray(data.memories)) throw new Error('O ficheiro não é uma cópia Retalhos válida.');
    const memories = [];
    for (const { blobData, ...item } of data.memories) memories.push({ ...item, blob: blobData ? dataUrlToBlob(blobData) : null });
    await writeMany(memories); await refresh(); notify(`${memories.length} memória(s) reposta(s).`);
  }
  async function exportBackup() {
    try {
      const memories = await getMemories(), items = [];
      for (const { blob, ...item } of memories) {
        let blobData = null;
        if (blob instanceof Blob) blobData = await new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
        });
        items.push({ ...item, blobData });
      }
      const content = JSON.stringify({ format: 'retalhos-backup-v1', createdAt: new Date().toISOString(), memories: items });
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `retalhos-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Cópia de segurança exportada. Guarda-a num local seguro.');
    } catch (error) { console.error(error); notify(`Não foi possível exportar a cópia: ${error.message || 'erro'}`); }
  }
  async function readMetadata(file) {
    try { const exif = await window.exifr?.parse(file, { gps: true, exif: true }); return {
      lat: Number.isFinite(exif?.latitude) ? exif.latitude : null, lng: Number.isFinite(exif?.longitude) ? exif.longitude : null,
      takenAt: exif?.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal.getTime() : null
    }; } catch (_) { return { lat: null, lng: null, takenAt: null }; }
  }
  async function storageBlob(file) {
    if (file.size < 1500000 || !('createImageBitmap' in window)) return file;
    let bitmap;
    try {
      bitmap = await createImageBitmap(file); const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .84)); return blob && blob.size < file.size ? blob : file;
    } catch (error) { console.warn('Sem compressão:', error); return file; } finally { bitmap?.close(); }
  }
  async function importFiles(event) {
    const files = [...(event.target.files || [])].filter(file => file.type.startsWith('image/')); if (!files.length) return;
    const input = event.target; input.disabled = true; let saved = 0;
    try {
      for (const file of files) {
        const meta = await readMetadata(file), blob = await storageBlob(file);
        await saveMemory({ id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
          name: file.name.replace(/\.[^.]+$/, '') || 'Fotografia', blob, type: blob.type || file.type,
          lat: meta.lat, lng: meta.lng, locationSource: meta.lat !== null ? 'gps' : 'pending', locationName: '',
          takenAt: meta.takenAt, created: Date.now() }); saved++;
      }
    } catch (error) { storageError(error); }
    input.disabled = false; input.value = ''; await refresh();
    if (saved) notify(`${saved} fotografia(s) guardada(s).`);
  }

  $('galleryImport').onclick = () => photoInput.click();
  $('cameraImport').onclick = () => cameraInput.click();
  photoInput.addEventListener('change', importFiles); cameraInput.addEventListener('change', importFiles);
  $('searchPendingPlace').onclick = searchPendingPlace;
  $('pendingPlaceSearch').addEventListener('keydown', event => { if (event.key === 'Enter') searchPendingPlace(); });
  $('assignPendingPlace').onclick = assignPending;
  $('selectAllPending').addEventListener('change', event => { document.querySelectorAll('.pending-check').forEach(check => { check.checked = event.target.checked; }); updateAssignButton(); });
  $('exportBackup').onclick = exportBackup; $('importBackup').onclick = () => backupInput.click();
  backupInput.addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!confirm('Importar a cópia e juntar as memórias ao arquivo atual?')) { backupInput.value = ''; return; }
    try { await importBackupFile(file); } catch (error) { console.error(error); notify(error.message || 'Não foi possível importar a cópia.'); }
    finally { backupInput.value = ''; }
  });
  window.addEventListener('retalhos-data-changed', refresh);
  initMap(); refresh();
  async function loadMunicipalities() {
    try {
      const url = 'https://ogcapi.dgterritorio.gov.pt/collections/municipios/items?f=json&limit=500&crs=http://www.opengis.net/def/crs/OGC/1.3/CRS84';
      const response = await fetch(url, { headers: { Accept: 'application/geo+json' } }); if (!response.ok) throw new Error(`DGT HTTP ${response.status}`);
      municipalities = ((await response.json()).features || []).filter(feature => feature.geometry); statsLoaded = municipalities.length > 0; render();
    } catch (error) { console.warn('Dados geográficos indisponíveis:', error); }
  }
  loadMunicipalities();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./service-worker.js').catch(error => console.warn('Service worker:', error));
})();
