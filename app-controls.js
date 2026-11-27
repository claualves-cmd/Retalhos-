(() => {
  'use strict';

  const DB_NAME = 'retalhos-db';
  const DB_VERSION = 2;
  const STORE = 'memories';
  const DEFAULT_CENTER = [39.6, -8.0];
  const DEFAULT_ZOOM = 6.4;
  const COVER_KEY = 'retalhos-cover-view';
  const $ = id => document.getElementById(id);
  const photoInput = $('photoInput');
  const cameraInput = $('cameraInput');
  const gallery = $('gallery');
  const mapElement = $('map');
  const objectUrls = new Map();
  let map;
  let markerLayer;
  let allMemories = [];
  let municipalities = [];
  let statsLoaded = false;

  function notify(message) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('show'), 4200);
  }
  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB indisponível'));
      request.onblocked = () => reject(new Error('A base de dados está bloqueada por outra janela.'));
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
  async function saveMemory(memory) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(memory);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Não foi possível guardar a fotografia.'));
      transaction.onabort = () => reject(transaction.error || new Error('O armazenamento local recusou a fotografia.'));
    });
  }
  function imageUrl(item) {
    if (objectUrls.has(item.id)) return objectUrls.get(item.id);
    const url = item.blob instanceof Blob ? URL.createObjectURL(item.blob) : (item.image || '');
    objectUrls.set(item.id, url);
    return url;
  }
  function photoName(file) { return file.name.replace(/\.[^.]+$/, '') || 'Fotografia'; }
  async function readMetadata(file) {
    try {
      const exif = await window.exifr?.parse(file, { gps: true, exif: true });
      return {
        lat: Number.isFinite(exif?.latitude) ? exif.latitude : null,
        lng: Number.isFinite(exif?.longitude) ? exif.longitude : null,
        takenAt: exif?.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal.getTime() : null
      };
    } catch (error) {
      console.info('Sem metadados EXIF legíveis:', file.name, error);
      return { lat: null, lng: null, takenAt: null };
    }
  }
  async function makeStorageBlob(file) {
    // Keep small originals untouched; resize huge camera images to avoid exhausting mobile IndexedDB.
    if (file.size < 1_500_000 || !('createImageBitmap' in window)) return file;
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      const maxSide = 2200;
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.84));
      return blob && blob.size < file.size ? blob : file;
    } catch (error) {
      console.warn('A fotografia será guardada sem compressão:', error);
      return file;
    } finally {
      bitmap?.close();
    }
  }
  function explainStorageError(error) {
    console.error('Falha ao importar fotografia:', error);
    const name = error?.name || '';
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      notify('O armazenamento desta aplicação está cheio. Apaga algumas fotografias guardadas e tenta novamente.');
    } else if (name === 'SecurityError' || name === 'InvalidStateError') {
      notify('O navegador bloqueou o armazenamento local. Abre a aplicação pelo endereço HTTPS e tenta novamente.');
    } else {
      notify(`Não foi possível guardar a fotografia (${error?.message || 'erro de armazenamento'}).`);
    }
  }
  function initMap() {
    if (!window.L || !mapElement) {
      notify('O mapa não carregou. Verifica a ligação à internet e atualiza a página.');
      return;
    }
    if (mapElement._leaflet_id) return;
    map = L.map(mapElement, { zoomControl: true, scrollWheelZoom: true, touchZoom: true, doubleClickZoom: true, minZoom: 2, maxZoom: 18, worldCopyJump: true });
    markerLayer = L.layerGroup().addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      minZoom: 2, maxZoom: 18,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics and GIS community'
    }).addTo(map);
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(COVER_KEY) || 'null'); } catch (_) { /* Vista inválida: usar Portugal. */ }
    if (saved?.center?.length === 2 && Number.isFinite(saved.zoom)) map.setView(saved.center, saved.zoom);
    else map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    window.retalhosMap = map;
    $('saveCover')?.addEventListener('click', () => {
      const center = map.getCenter();
      localStorage.setItem(COVER_KEY, JSON.stringify({ center: [center.lat, center.lng], zoom: map.getZoom() }));
      notify('Esta vista ficou guardada como a tua capa neste dispositivo.');
    });
    window.addEventListener('resize', () => map.invalidateSize({ pan: false }));
    setTimeout(() => map.invalidateSize({ pan: false }), 150);
  }
  function markerIcon(item, count) {
    const image = document.createElement('img');
    image.src = imageUrl(item);
    image.alt = item.name || 'Retalho';
    const wrapper = document.createElement('div');
    wrapper.className = 'retalhos-photo-marker';
    wrapper.appendChild(image);
    if (count > 1) wrapper.title = `${count} fotografias neste local`;
    return L.divIcon({ className: 'retalhos-photo-marker', html: wrapper, iconSize: [40, 40], iconAnchor: [20, 20] });
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
      const marker = L.marker([top.lat, top.lng], { icon: markerIcon(top, items.length), title: top.name || 'Retalho' });
      const popup = document.createElement('div');
      popup.className = 'photo-stack-popup';
      items.forEach(item => {
        const card = document.createElement('div');
        const image = document.createElement('img');
        image.src = imageUrl(item);
        image.alt = item.name || 'Fotografia';
        const caption = document.createElement('span');
        caption.textContent = item.locationName ? `${item.name} · ${item.locationName}` : item.name;
        card.append(image, caption);
        popup.appendChild(card);
      });
      marker.bindPopup(popup, { maxWidth: 290 });
      markerLayer.addLayer(marker);
    });
  }
  function renderGallery() {
    const section = $('memorias');
    if (!gallery || !section) return;
    section.hidden = allMemories.length === 0;
    gallery.replaceChildren();
    $('memoryCount').textContent = String(allMemories.length);
    allMemories.forEach(item => {
      const card = document.createElement('article');
      card.className = 'memory-card';
      const image = document.createElement('img');
      image.src = imageUrl(item);
      image.alt = item.name || 'Fotografia';
      image.loading = 'lazy';
      const name = document.createElement('div');
      name.className = 'memory-meta';
      name.textContent = item.locationName || item.suggestedLocation ? `${item.name} · ${item.locationName || item.suggestedLocation}` : item.name;
      card.append(image, name);
      if (Number.isFinite(item.lat) && Number.isFinite(item.lng)) {
        card.tabIndex = 0;
        card.addEventListener('click', () => map?.flyTo([item.lat, item.lng], Math.max(map.getZoom(), 11), { duration: .8 }));
      }
      gallery.appendChild(card);
    });
  }
  async function refresh() {
    try {
      allMemories = await getMemories();
      const located = allMemories.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng));
      const pending = allMemories.filter(item => !Number.isFinite(item.lat) || !Number.isFinite(item.lng));
      $('mapStatus').textContent = located.length ? `${located.length} RETALHOS NO MAPA` : 'PORTUGAL · OS TEUS RETALHOS';
      $('pendingCount').textContent = String(pending.length);
      $('pendingSection').hidden = pending.length === 0;
      $('pendingList').replaceChildren();
      pending.forEach(item => {
        const card = document.createElement('article');
        card.className = 'pending-card';
        const image = document.createElement('img');
        image.src = imageUrl(item);
        image.alt = item.name || 'Fotografia sem localização';
        const label = document.createElement('div');
        label.className = 'pending-name';
        label.textContent = `${item.name} · sem localização GPS`;
        card.append(image, label);
        $('pendingList').appendChild(card);
      });
      renderMarkers();
      renderGallery();
      if (statsLoaded) updateStats();
      window.dispatchEvent(new Event('retalhos-data-changed'));
    } catch (error) {
      console.error('Não foi possível carregar as memórias:', error);
      notify('Não foi possível abrir o arquivo de fotografias neste navegador.');
    }
  }
  function featureName(properties, names) {
    for (const name of names) if (properties?.[name]) return String(properties[name]).trim();
    return '';
  }
  function updateStats() {
    const towns = new Set();
    const districts = new Set();
    if (window.turf && municipalities.length) {
      allMemories.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng)).forEach(item => {
        const point = turf.point([item.lng, item.lat]);
        const feature = municipalities.find(area => {
          try { return turf.booleanPointInPolygon(point, area); } catch (_) { return false; }
        });
        if (!feature) return;
        const props = feature.properties || {};
        const town = featureName(props, ['municipio', 'MUNICIPIO', 'nome', 'NOME', 'name', 'NAME']);
        const district = featureName(props, ['distrito', 'DISTRITO', 'district', 'Distrito']);
        if (town) towns.add(town.toLocaleLowerCase('pt'));
        if (district) districts.add(district.toLocaleLowerCase('pt'));
      });
    }
    $('municipalityCount').textContent = statsLoaded ? String(towns.size) : '—';
    $('districtCount').textContent = statsLoaded ? String(districts.size) : '—';
  }
  async function loadMunicipalities() {
    try {
      const url = 'https://ogcapi.dgterritorio.gov.pt/collections/municipios/items?f=json&limit=500&crs=http://www.opengis.net/def/crs/OGC/1.3/CRS84';
      const response = await fetch(url, { headers: { Accept: 'application/geo+json' } });
      if (!response.ok) throw new Error(`DGT HTTP ${response.status}`);
      const data = await response.json();
      municipalities = (data.features || []).filter(feature => feature.geometry);
      statsLoaded = municipalities.length > 0;
      updateStats();
    } catch (error) {
      console.warn('Estatísticas geográficas indisponíveis:', error);
      $('municipalityCount').textContent = '—';
      $('districtCount').textContent = '—';
    }
  }
  async function importFiles(event) {
    const files = [...(event.target.files || [])].filter(file => file.type.startsWith('image/'));
    if (!files.length) return;
    const input = event.target;
    input.disabled = true;
    let success = 0;
    let failed = 0;
    notify(`A preparar ${files.length} ${files.length === 1 ? 'fotografia' : 'fotografias'}…`);
    for (const file of files) {
      try {
        const meta = await readMetadata(file);
        const blob = await makeStorageBlob(file);
        await saveMemory({
          id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
          name: photoName(file), blob, type: blob.type || file.type,
          lat: meta.lat, lng: meta.lng,
          locationSource: meta.lat !== null ? 'gps' : 'pending', locationName: '',
          takenAt: meta.takenAt, created: Date.now()
        });
        success++;
      } catch (error) {
        failed++;
        explainStorageError(error);
        break;
      }
    }
    input.disabled = false;
    input.value = '';
    await refresh();
    if (success && !failed) notify(`${success} ${success === 1 ? 'fotografia guardada' : 'fotografias guardadas'}.`);
    else if (success && failed) notify(`${success} guardadas; a seguinte falhou. Liberta espaço ou importa menos fotografias de cada vez.`);
  }

  $('galleryImport')?.addEventListener('click', () => photoInput?.click());
  $('cameraImport')?.addEventListener('click', () => cameraInput?.click());
  photoInput?.addEventListener('change', importFiles);
  cameraInput?.addEventListener('change', importFiles);
  initMap();
  refresh();
  loadMunicipalities();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./service-worker.js').catch(error => console.warn('Service worker:', error));
  }
})();
