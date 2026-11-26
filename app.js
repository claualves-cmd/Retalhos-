(() => {
  'use strict';

  const DB_NAME = 'retalhos-db';
  const DB_VERSION = 2;
  const STORE = 'memories';
  const $ = id => document.getElementById(id);
  const mapHint = $('mapHint'), gallery = $('gallery'), memoryCount = $('memoryCount');
  const photoInput = $('photoInput'), toastEl = $('toast'), coverSelect = $('coverSelect');
  const covers = {
    portugal: { center: [39.6, -8.0], zoom: 6.4, label: 'Portugal' },
    world: { center: [24, 0], zoom: 2.2, label: 'Mundo' },
    azores: { center: [38.55, -28.0], zoom: 7.1, label: 'Açores' },
    madeira: { center: [32.75, -17.0], zoom: 9, label: 'Madeira' },
    france: { center: [46.6, 2.4], zoom: 5.8, label: 'França' },
    morocco: { center: [31.8, -6.0], zoom: 5.8, label: 'Marrocos' }
  };

  let map = null, deferredInstall = null, activePendingId = null;
  let memories = [], pending = [], municipalities = [];
  let overlaySvg = null, overlayTimer = null, toastTimer = null;
  let selectedPlace = null, searchResults = [];
  const objectUrls = new Map();
  const CAOP_MUNICIPALITIES_URL =
    'https://ogcapi.dgterritorio.gov.pt/collections/municipios/items?f=json&limit=500&crs=http://www.opengis.net/def/crs/OGC/1.3/CRS84';

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
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.created - a.created));
      req.onerror = () => reject(req.error);
    });
  }
  async function dbPut(item) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
  async function dbDelete(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
  async function dbClear() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function getImageUrl(item) {
    if (objectUrls.has(item.id)) return objectUrls.get(item.id);
    const url = item.blob instanceof Blob ? URL.createObjectURL(item.blob) : (item.image || '');
    objectUrls.set(item.id, url);
    return url;
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  async function loadMunicipalities() {
    if (!window.turf) throw new Error('A biblioteca geográfica não foi carregada.');
    const response = await fetch(CAOP_MUNICIPALITIES_URL, { headers: { Accept: 'application/geo+json' } });
    if (!response.ok) throw new Error(`A DGT respondeu com o código ${response.status}.`);
    const data = await response.json();
    if (!data.features?.length) throw new Error('A DGT não devolveu os limites dos municípios.');
    municipalities = data.features.filter(feature => feature.geometry && feature.properties);
    if (!municipalities.length) throw new Error('Não foram encontrados polígonos municipais.');
    scheduleOverlayDraw();
    return municipalities.length;
  }

  function initMap() {
    if (!window.L) {
      mapHint.textContent = 'Não foi possível carregar o mapa. Verifica a ligação à internet.';
      return;
    }
    map = L.map('map', {
      zoomControl: true, scrollWheelZoom: true, touchZoom: true,
      doubleClickZoom: true, minZoom: 2, maxZoom: 18, worldCopyJump: true,
      preferCanvas: true
    }).setView(covers.portugal.center, covers.portugal.zoom);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      minZoom: 2, maxZoom: 18,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics and GIS community'
    }).addTo(map);

    overlaySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlaySvg.setAttribute('class', 'retalhos-svg');
    overlaySvg.style.position = 'absolute';
    overlaySvg.style.left = '0';
    overlaySvg.style.top = '0';
    overlaySvg.style.width = '100%';
    overlaySvg.style.height = '100%';
    overlaySvg.style.zIndex = '450';
    overlaySvg.style.pointerEvents = 'none';
    map.getPanes().overlayPane.appendChild(overlaySvg);

    map.on('move zoom zoomend moveend resize', scheduleOverlayDraw);
    map.on('click', handleMapClick);

    const savedCover = localStorage.getItem('retalhos-cover') || 'portugal';
    if (savedCover === 'custom') {
      const custom = JSON.parse(localStorage.getItem('retalhos-custom-cover') || 'null');
      if (custom?.center && custom?.zoom) map.setView(custom.center, custom.zoom);
      coverSelect.value = 'custom';
    } else if (covers[savedCover]) {
      map.setView(covers[savedCover].center, covers[savedCover].zoom);
      coverSelect.value = savedCover;
    }

    coverSelect.addEventListener('change', () => {
      const key = coverSelect.value;
      if (key === 'custom') {
        const custom = JSON.parse(localStorage.getItem('retalhos-custom-cover') || 'null');
        if (custom?.center && custom?.zoom) map.setView(custom.center, custom.zoom);
        else {
          toast('Ainda não guardaste uma vista personalizada.');
          coverSelect.value = localStorage.getItem('retalhos-cover') || 'portugal';
        }
      } else if (covers[key]) {
        localStorage.setItem('retalhos-cover', key);
        map.flyTo(covers[key].center, covers[key].zoom, { duration: 1.1 });
      }
    });
    $('saveCover').addEventListener('click', () => {
      const center = map.getCenter();
      localStorage.setItem('retalhos-custom-cover', JSON.stringify({
        center: [center.lat, center.lng], zoom: map.getZoom()
      }));
      localStorage.setItem('retalhos-cover', 'custom');
      coverSelect.value = 'custom';
      toast('Esta vista ficou guardada como a tua capa.');
    });
    $('resetView').addEventListener('click', () => {
      const key = localStorage.getItem('retalhos-cover') || 'portugal';
      if (key === 'custom') {
        const custom = JSON.parse(localStorage.getItem('retalhos-custom-cover') || 'null');
        if (custom) map.flyTo(custom.center, custom.zoom, { duration: .9 });
      } else if (covers[key]) {
        map.flyTo(covers[key].center, covers[key].zoom, { duration: .9 });
      }
    });

    $('welcomeImport').addEventListener('click', () => photoInput.click());
  }

  function handleMapClick(event) {
    if (!activePendingId) {
      mapHint.textContent = 'Para localizar uma fotografia sem GPS, seleciona-a na lista ou procura o nome do lugar.';
      return;
    }
    const item = pending.find(p => p.id === activePendingId);
    if (!item) return;
    assignCoordinates([item], event.latlng.lat, event.latlng.lng, 'Local indicado no mapa');
  }

  async function assignCoordinates(items, lat, lng, locationName) {
    try {
      for (const item of items) {
        item.lat = lat;
        item.lng = lng;
        item.locationSource = 'manual';
        item.locationName = locationName || '';
        await dbPut(item);
      }
      const count = items.length;
      activePendingId = null;
      selectedPlace = null;
      $('placeSearch').value = '';
      $('placeResults').innerHTML = '';
      await refreshAll();
      toast(count === 1 ? 'Local guardado. A fotografia já faz parte da colcha.' : `${count} fotografias colocadas no mesmo local.`);
      mapHint.textContent = 'Memória localizada. Podes continuar a explorar Portugal.';
    } catch (error) {
      console.error(error);
      toast('Não foi possível guardar a localização.');
    }
  }

  function scheduleOverlayDraw() {
    if (overlayTimer) cancelAnimationFrame(overlayTimer);
    overlayTimer = requestAnimationFrame(drawPhotoTerritories);
  }

  function getMunicipalityName(feature) {
    const p = feature.properties || {};
    return p.municipio || p.MUNICIPIO || p.nome || p.NOME || p.name || 'Município';
  }

  function findMunicipality(lat, lng) {
    if (!window.turf || !municipalities.length) return null;
    const point = turf.point([lng, lat]);
    for (const feature of municipalities) {
      try {
        if (turf.booleanPointInPolygon(point, feature)) return feature;
      } catch (_) {}
    }
    return null;
  }

  function groupPhotosByPoint(items) {
    const groups = new Map();
    items.forEach(item => {
      const key = `${item.lat.toFixed(6)},${item.lng.toFixed(6)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    return [...groups.values()];
  }

  function polygonPath(geometry) {
    const paths = [];
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    polygons.forEach(rings => {
      rings.forEach(ring => {
        const points = ring.map(([lng, lat]) => {
          const p = map.latLngToContainerPoint([lat, lng]);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        });
        if (points.length) paths.push(`M${points.join(' L')} Z`);
      });
    });
    return paths.join(' ');
  }

  function makePattern(defs, id, item) {
    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.setAttribute('id', id);
    pattern.setAttribute('patternUnits', 'objectBoundingBox');
    pattern.setAttribute('patternContentUnits', 'objectBoundingBox');
    pattern.setAttribute('width', '1');
    pattern.setAttribute('height', '1');
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('href', getImageUrl(item));
    image.setAttribute('x', '0');
    image.setAttribute('y', '0');
    image.setAttribute('width', '1');
    image.setAttribute('height', '1');
    image.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    pattern.appendChild(image);
    defs.appendChild(pattern);
  }

  function drawPhotoTerritories() {
    if (!map || !overlaySvg) return;
    const size = map.getSize(), w = size.x, h = size.y;
    overlaySvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    overlaySvg.setAttribute('width', w);
    overlaySvg.setAttribute('height', h);
    while (overlaySvg.firstChild) overlaySvg.removeChild(overlaySvg.firstChild);
    if (!memories.length || !municipalities.length || !window.turf) return;

    const located = memories.filter(m => Number.isFinite(m.lat) && Number.isFinite(m.lng));
    const municipalityGroups = new Map();

    located.forEach(item => {
      const municipality = findMunicipality(item.lat, item.lng);
      if (!municipality) return;
      if (!municipalityGroups.has(municipality)) municipalityGroups.set(municipality, []);
      municipalityGroups.get(municipality).push(item);
    });
    if (!municipalityGroups.size) return;

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    overlaySvg.appendChild(defs);
    let patternIndex = 0;

    municipalityGroups.forEach((items, municipality) => {
      const pointGroups = groupPhotosByPoint(items);
      const features = [];
      if (pointGroups.length === 1) {
        features.push({ geometry: municipality.geometry, items: pointGroups[0] });
      } else {
        const points = pointGroups.map(group => turf.point([group[0].lng, group[0].lat]));
        const bbox = turf.bbox(municipality);
        const cells = turf.voronoi(turf.featureCollection(points), { bbox });
        if (cells?.features) {
          cells.features.forEach((cell, index) => {
            if (!cell) return;
            try {
              const clipped = turf.intersect(turf.featureCollection([cell, municipality]));
              if (clipped?.geometry) features.push({ geometry: clipped.geometry, items: pointGroups[index] });
            } catch (error) {
              console.warn('Não foi possível recortar um retalho:', error);
            }
          });
        }
      }

      features.forEach(feature => {
        if (!feature.items?.length) return;
        const patternId = `retalho-pattern-${patternIndex++}`;
        makePattern(defs, patternId, feature.items[0]);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', polygonPath(feature.geometry));
        path.setAttribute('fill', `url(#${patternId})`);
        path.setAttribute('fill-rule', 'evenodd');
        path.setAttribute('class', 'retalho-shape');
        path.style.pointerEvents = 'visiblePainted';
        path.addEventListener('click', event => {
          event.stopPropagation();
          openMemoryPopup(feature.items, feature.items[0].lat, feature.items[0].lng);
        });
        overlaySvg.appendChild(path);
      });
    });
  }

  function openMemoryPopup(items, lat, lng) {
    const first = items[0];
    const stack = items.length > 1
      ? `<div class="stack">${items.map(item => `<img src="${getImageUrl(item)}" alt="${escapeHtml(item.name)}">`).join('')}</div>`
      : '';
    const location = first.locationName ? `<small>${escapeHtml(first.locationName)}</small>` : '';
    const html = `<div class="photo-popup"><img src="${getImageUrl(first)}" alt="${escapeHtml(first.name)}"><strong>${escapeHtml(first.name)}</strong>${location}<small>${lat.toFixed(5)}, ${lng.toFixed(5)}</small>${items.length > 1 ? `<p>${items.length} fotografias neste ponto</p>${stack}` : ''}</div>`;
    L.popup({ closeButton: true, maxWidth: 230, autoPan: true })
      .setLatLng([lat, lng]).setContent(html).openOn(map);
  }

  async function readPhoto(file) {
    let gps = null, takenAt = null;
    try {
      if (window.exifr?.parse) {
        const exif = await window.exifr.parse(file, { gps: true, exif: true });
        if (Number.isFinite(exif?.latitude) && Number.isFinite(exif?.longitude)) {
          gps = { lat: exif.latitude, lng: exif.longitude };
        }
        if (exif?.DateTimeOriginal instanceof Date) takenAt = exif.DateTimeOriginal.getTime();
      }
    } catch (_) { /* Alguns formatos não incluem metadados EXIF. */ }
    return { file, gps, takenAt };
  }

  async function storePhoto(photo, coords, source) {
    const item = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      name: photo.file.name.replace(/\.[^.]+$/, ''),
      blob: photo.file, type: photo.file.type,
      lat: coords.lat, lng: coords.lng,
      locationSource: source, locationName: '',
      takenAt: photo.takenAt || null, created: Date.now()
    };
    await dbPut(item);
    return item;
  }

  function renderPending() {
    const section = $('pendingSection'), list = $('pendingList');
    $('pendingCount').textContent = pending.length;
    section.hidden = !pending.length;
    list.innerHTML = '';
    $('selectAllPending').checked = false;
    $('assignPlace').disabled = !selectedPlace;
    pending.forEach(item => {
      const card = document.createElement('article');
      card.className = `pending-card${item.id === activePendingId ? ' active' : ''}`;
      const img = document.createElement('img');
      img.src = getImageUrl(item);
      img.alt = item.name;

      const checkWrap = document.createElement('label');
      checkWrap.className = 'pending-select';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'pending-check';
      checkbox.value = item.id;
      checkbox.addEventListener('change', updateBulkSelection);
      checkWrap.append(checkbox, document.createTextNode(' Selecionar'));

      const name = document.createElement('div');
      name.className = 'pending-name';
      name.textContent = item.name;

      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.id === activePendingId ? 'Agora toca no mapa' : 'Marcar no mapa';
      button.addEventListener('click', () => {
        activePendingId = item.id;
        renderPending();
        mapHint.textContent = `A localizar: ${item.name}. Toca no mapa no local onde foi tirada.`;
        $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      card.append(img, checkWrap, name, button);
      list.append(card);
    });
  }

  function updateBulkSelection() {
    const selected = document.querySelectorAll('.pending-check:checked').length;
    $('assignPlace').textContent = selectedPlace
      ? `Atribuir "${selectedPlace.name}" (${selected})`
      : 'Atribuir local às selecionadas';
    $('assignPlace').disabled = !selectedPlace || selected === 0;
  }

  async function searchPlace() {
    const query = $('placeSearch').value.trim();
    const resultsEl = $('placeResults');
    resultsEl.innerHTML = '';
    selectedPlace = null;
    updateBulkSelection();
    if (query.length < 3) {
      resultsEl.textContent = 'Escreve pelo menos três letras para procurar.';
      return;
    }
    resultsEl.textContent = 'A procurar…';
    $('searchPlace').disabled = true;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=pt&q=${encodeURIComponent(query)}`;
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Serviço de pesquisa indisponível.');
      searchResults = await response.json();
      resultsEl.innerHTML = '';
      if (!searchResults.length) {
        resultsEl.textContent = 'Não encontrei esse local. Experimenta acrescentar o concelho.';
        return;
      }
      searchResults.forEach((result, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'place-result';
        button.textContent = result.display_name;
        button.addEventListener('click', () => {
          selectedPlace = {
            name: result.name || result.display_name.split(',')[0],
            displayName: result.display_name,
            lat: Number(result.lat),
            lng: Number(result.lon)
          };
          [...resultsEl.querySelectorAll('.place-result')].forEach(el => el.classList.remove('selected'));
          button.classList.add('selected');
          $('assignPlace').textContent = 'Atribuir local às selecionadas';
          updateBulkSelection();
          map.flyTo([selectedPlace.lat, selectedPlace.lng], 13, { duration: .8 });
          mapHint.textContent = `Local escolhido: ${selectedPlace.displayName}`;
        });
        resultsEl.append(button);
      });
    } catch (error) {
      console.error(error);
      resultsEl.textContent = 'Não foi possível pesquisar agora. Podes marcar a localização diretamente no mapa.';
    } finally {
      $('searchPlace').disabled = false;
    }
  }

  async function assignSelectedPlace() {
    if (!selectedPlace) return;
    const ids = [...document.querySelectorAll('.pending-check:checked')].map(input => input.value);
    const items = pending.filter(item => ids.includes(item.id));
    if (!items.length) {
      toast('Seleciona pelo menos uma fotografia.');
      return;
    }
    await assignCoordinates(items, selectedPlace.lat, selectedPlace.lng, selectedPlace.displayName);
  }

  async function refreshAll() {
    const all = await dbAll();
    pending = all.filter(item => !Number.isFinite(item.lat) || !Number.isFinite(item.lng));
    memories = all.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng));
    memoryCount.textContent = memories.length;
    $('welcomePanel').hidden = memories.length > 0 || pending.length > 0;
    $('mapStatus').textContent = memories.length
      ? `${memories.length} MEMÓRIAS NO TEU MAPA`
      : 'PORTUGAL À ESPERA DAS TUAS MEMÓRIAS';

    gallery.innerHTML = '';
    if (!memories.length) {
      gallery.innerHTML = '<div class="empty-state"><span class="empty-icon">▧</span><strong>Ainda não há retalhos.</strong><p>A primeira fotografia dá início à tua colcha.</p></div>';
    } else {
      memories.forEach(item => {
        const card = document.createElement('article');
        card.className = 'memory-card';
        const img = document.createElement('img');
        img.src = getImageUrl(item);
        img.alt = item.name;
        img.loading = 'lazy';
        const meta = document.createElement('div');
        meta.className = 'memory-meta';
        meta.textContent = item.locationName ? `${item.name} · ${item.locationName}` : item.name;
        const locate = document.createElement('button');
        locate.type = 'button';
        locate.title = 'Ver no mapa';
        locate.textContent = '⌖';
        locate.addEventListener('click', event => {
          event.stopPropagation();
          map.flyTo([item.lat, item.lng], Math.min(15, Math.max(11, map.getZoom())), { duration: .9 });
          $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        card.addEventListener('click', () => {
          map.flyTo([item.lat, item.lng], Math.min(15, Math.max(11, map.getZoom())), { duration: .9 });
          $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        card.append(img, meta, locate);
        gallery.append(card);
      });
    }
    renderPending();
    scheduleOverlayDraw();
  }

  photoInput.addEventListener('change', async event => {
    const files = [...event.target.files].filter(file => file.type.startsWith('image/'));
    if (!files.length) return;
    photoInput.disabled = true;
    $('selectedPlace').textContent = `A analisar ${files.length} fotografias…`;
    $('selectedCoords').textContent = 'A procurar coordenadas GPS nos metadados.';
    toast(`A analisar ${files.length} fotografias…`);
    try {
      let imported = 0, noGps = 0;
      for (let i = 0; i < files.length; i++) {
        const photo = await readPhoto(files[i]);
        if (photo.gps) {
          await storePhoto(photo, photo.gps, 'gps');
          imported++;
        } else {
          const item = {
            id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
            name: files[i].name.replace(/\.[^.]+$/, ''),
            blob: files[i], type: files[i].type,
            lat: null, lng: null, locationSource: 'pending',
            takenAt: photo.takenAt || null, created: Date.now()
          };
          await dbPut(item);
          noGps++;
        }
        if ((i + 1) % 10 === 0 || i + 1 === files.length) {
          $('selectedPlace').textContent = `A analisar ${i + 1} de ${files.length}…`;
        }
      }
      await refreshAll();
      $('selectedPlace').textContent = 'Importação concluída';
      $('selectedCoords').textContent = `${imported} com GPS · ${noGps} sem GPS`;
      toast(`${imported} colocadas por GPS${noGps ? ` · ${noGps} precisam de localização` : ''}.`);
      if (noGps) {
        mapHint.textContent = 'Pesquisa o local ou seleciona as fotografias e marca-o diretamente no mapa.';
        $('pendingSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (error) {
      console.error(error);
      toast('Não foi possível importar todas as fotografias. Verifica o espaço disponível no dispositivo.');
      await refreshAll();
    }
    photoInput.disabled = false;
    photoInput.value = '';
  });

  $('searchPlace').addEventListener('click', searchPlace);
  $('placeSearch').addEventListener('keydown', event => {
    if (event.key === 'Enter') searchPlace();
  });
  $('assignPlace').addEventListener('click', assignSelectedPlace);
  $('selectAllPending').addEventListener('change', event => {
    document.querySelectorAll('.pending-check').forEach(input => { input.checked = event.target.checked; });
    updateBulkSelection();
  });

  $('clearMemories').addEventListener('click', async () => {
    const items = await dbAll();
    if (!items.length) {
      toast('Ainda não tens memórias guardadas.');
      return;
    }
    if (confirm('Queres apagar todas as fotografias guardadas neste dispositivo?')) {
      await dbClear();
      objectUrls.forEach(url => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); });
      objectUrls.clear();
      activePendingId = null;
      await refreshAll();
      toast('Memórias apagadas deste dispositivo.');
    }
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstall = event;
    const btn = $('installBtn');
    btn.hidden = false;
    btn.addEventListener('click', async () => {
      deferredInstall.prompt();
      await deferredInstall.userChoice;
      deferredInstall = null;
      btn.hidden = true;
    }, { once: true });
  });
  window.addEventListener('appinstalled', () => toast('Retalhos instalado neste dispositivo.'));

  initMap();
  refreshAll().catch(() => toast('Não foi possível abrir o arquivo de memórias.'));

  loadMunicipalities()
    .then(count => {
      mapHint.textContent = `Limites oficiais dos ${count} municípios carregados. As fotografias ocupam apenas o concelho onde foram tiradas.`;
      scheduleOverlayDraw();
    })
    .catch(error => {
      console.error('CAOP:', error);
      mapHint.textContent = 'Não foi possível carregar os limites oficiais da DGT. O mapa de satélite continua disponível; verifica a ligação.';
      toast('Não foi possível carregar os limites geográficos oficiais.');
    });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
})();