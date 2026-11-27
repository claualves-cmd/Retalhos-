(() => {
  'use strict';
  const DB = 'retalhos-db', STORE = 'memories';
  const URL_MUNICIPALITIES = 'https://ogcapi.dgterritorio.gov.pt/collections/municipios/items?f=json&limit=500&crs=http://www.opengis.net/def/crs/OGC/1.3/CRS84';
  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt').replace(/\s+/g, ' ');
  const get = id => document.getElementById(id);
  let areas = [];
  let cameraPositionPromise = null;
  let cameraStartedAt = 0;
  let recalculationQueued = false;

  function property(props, names) {
    for (const name of names) if (props?.[name] != null && String(props[name]).trim()) return String(props[name]).trim();
    const keys = Object.keys(props || {});
    for (const name of names) {
      const key = keys.find(k => norm(k) === norm(name));
      if (key && String(props[key]).trim()) return String(props[key]).trim();
    }
    return '';
  }
  const townOf = f => property(f?.properties, ['municipio','MUNICIPIO','concelho','CONCELHO','nome_concelho','NOME_CONCELHO','name','NAME','nome','NOME']);
  const districtOf = f => property(f?.properties, ['distrito','DISTRITO','nome_distrito','NOME_DISTRITO','district','District','district_name','ilha','ILHA']);

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function allPhotos() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }
  async function updatePhotos(items) {
    if (!items.length) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      items.forEach(item => tx.objectStore(STORE).put(item));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  function findArea(item) {
    if (Number.isFinite(item.lat) && Number.isFinite(item.lng) && window.turf && areas.length) {
      const point = turf.point([item.lng, item.lat]);
      const found = areas.find(area => { try { return turf.booleanPointInPolygon(point, area); } catch (_) { return false; } });
      if (found) return found;
    }
    const text = norm(item.locationName || item.suggestedLocation);
    if (!text || text === norm('Local indicado no mapa')) return null;
    const parts = String(item.locationName || item.suggestedLocation).split(/[,;·]/).map(norm);
    return areas.find(area => {
      const name = norm(townOf(area));
      return name && (parts.includes(name) || text === name || text.includes(name));
    }) || null;
  }
  async function recalculate() {
    try {
      const photos = await allPhotos();
      const towns = new Set(), districts = new Set(), places = new Set();
      let located = 0;
      for (const photo of photos) {
        const hasCoords = Number.isFinite(photo.lat) && Number.isFinite(photo.lng);
        const explicit = String(photo.locationName || photo.suggestedLocation || '').trim();
        const area = findArea(photo);
        if (hasCoords || (explicit && explicit !== 'Local indicado no mapa')) located++;
        if (area) {
          const town = townOf(area), district = districtOf(area);
          if (town) towns.add(norm(town));
          if (district) districts.add(norm(district));
          const place = explicit && explicit !== 'Local indicado no mapa' ? explicit.split(',')[0] : town;
          if (place) places.add(norm(place));
        } else if (explicit && explicit !== 'Local indicado no mapa') {
          places.add(norm(explicit.split(',')[0]));
        }
      }
      const districtTotal = new Set(areas.map(districtOf).filter(Boolean).map(norm)).size || 18;
      if (get('placeCount')) get('placeCount').textContent = String(places.size);
      if (get('municipalityCount')) get('municipalityCount').textContent = `${towns.size} de ${areas.length || 308}`;
      if (get('districtCount')) get('districtCount').textContent = `${districts.size} de ${districtTotal}`;
      if (get('locatedPhotoCount')) get('locatedPhotoCount').textContent = String(located);
      if (get('unlocatedPhotoCount')) get('unlocatedPhotoCount').textContent = String(Math.max(0, photos.length - located));
    } catch (error) { console.warn('Não foi possível recalcular as estatísticas:', error); }
  }
  function scheduleStats() {
    if (recalculationQueued) return;
    recalculationQueued = true;
    setTimeout(() => { recalculationQueued = false; recalculate(); }, 120);
  }

  // DGT uses different schema names across CAOP releases; recognize concelho as well as municipio.
  fetch(URL_MUNICIPALITIES, { headers: { Accept: 'application/geo+json' } })
    .then(response => { if (!response.ok) throw new Error(`DGT HTTP ${response.status}`); return response.json(); })
    .then(data => { areas = (data.features || []).filter(f => f.geometry); recalculate(); })
    .catch(error => console.warn('Dados geográficos DGT indisponíveis:', error));

  // Recalculate after the main app finishes its IndexedDB refresh, without starting a refresh loop.
  const observeTargets = [get('mapStatus'), get('pendingList')].filter(Boolean);
  if (window.MutationObserver && observeTargets.length) {
    const observer = new MutationObserver(scheduleStats);
    observeTargets.forEach(target => observer.observe(target, { childList: true, subtree: true, characterData: true }));
  }
  window.addEventListener('retalhos-data-changed', scheduleStats);
  document.addEventListener('DOMContentLoaded', scheduleStats, { once: true });
  scheduleStats();

  // Camera photos often arrive without EXIF GPS on mobile. Use device location only for a photo
  // explicitly taken through the in-app Camera button; Gallery imports are never auto-geotagged.
  const cameraButton = get('cameraImport'), cameraInput = get('cameraInput');
  cameraButton?.addEventListener('click', () => {
    cameraStartedAt = Date.now();
    cameraPositionPromise = new Promise(resolve => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
        error => { console.info('Localização da câmara indisponível:', error.message); resolve(null); },
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
      );
    });
  }, true);

  cameraInput?.addEventListener('change', async event => {
    if (!event.target.files?.length || !cameraStartedAt) return;
    const started = cameraStartedAt;
    const locationPromise = cameraPositionPromise || Promise.resolve(null);
    cameraStartedAt = 0;
    const position = await locationPromise;
    if (!position) {
      get('toast') && (get('toast').textContent = 'A foto foi importada sem GPS. Ativa a localização do telemóvel ou atribui o local na gaveta «Fotografias sem localização».');
      get('toast')?.classList.add('show');
      return;
    }
    // Main import runs in parallel; wait briefly for its IndexedDB writes, then geotag just this camera batch.
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 300));
      const photos = await allPhotos();
      const candidates = photos.filter(photo => Number(photo.created) >= started &&
        (!Number.isFinite(photo.lat) || !Number.isFinite(photo.lng)) && photo.locationSource === 'pending');
      if (candidates.length >= event.target.files.length || attempt === 19) {
        if (candidates.length) {
          await updatePhotos(candidates.map(photo => ({ ...photo, lat: position.lat, lng: position.lng, locationSource: 'camera-gps' })));
          scheduleStats();
          window.dispatchEvent(new Event('retalhos-data-changed'));
        }
        break;
      }
    }
  });
})();
