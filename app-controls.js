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
  let initialFrameApplied = false;
  const imageUrls = new Map();
  const style = document.createElement('style');
  style.textContent = `
    :root{--retalho-cream:#f4ead3;--retalho-green:#315b4b;--retalho-paper:#f4f0e6}
    .intro{display:none!important}
    .map-section{margin-top:12px!important}
    .retalhos-photo-pin,.retalhos-photo-pin.leaflet-div-icon{width:34px!important;height:34px!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important}
    .retalhos-photo-pin img{display:block;box-sizing:border-box;width:34px;height:34px;border:2px solid var(--retalho-cream);border-radius:6px;object-fit:cover;box-shadow:0 2px 6px #17231e70;transform:rotate(var(--patch-tilt, -3deg));transition:transform .16s,box-shadow .16s}
    .retalhos-photo-pin:hover img,.retalhos-photo-pin:focus img{transform:rotate(0) scale(1.13);box-shadow:0 4px 12px #17231e80}
    .retalhos-cluster{display:grid;place-items:center;width:38px;height:38px;border:2px solid var(--retalho-cream);border-radius:7px;background:var(--retalho-green);color:#fff;font:700 12px system-ui;box-shadow:0 2px 7px #17231e70;transform:rotate(-2deg)}
    .retalhos-cluster span{transform:rotate(2deg)}
    .retalhos-quick-actions{display:flex;flex-wrap:wrap;align-items:center;gap:9px;margin:10px 0 12px}
    .retalhos-quick-actions button,.retalhos-gallery-tools button,.retalhos-assign-row button,.retalhos-search-results button{min-height:42px;padding:10px 14px;border:1px solid #c9c1ae;border-radius:10px;background:#fffdf7;color:#243b31;font:600 13px/1.2 system-ui;cursor:pointer;transition:background .15s,border-color .15s,transform .15s}
    .retalhos-quick-actions button:hover,.retalhos-gallery-tools button:hover,.retalhos-assign-row button:hover,.retalhos-search-results button:hover{border-color:#315b4b;background:#e8eee8;transform:translateY(-1px)}
    .retalhos-quick-actions .primary{border-color:#315b4b;background:#315b4b;color:#fff}
    .retalhos-quick-actions .primary:hover{background:#244537}
    .retalhos-quick-actions .retalhos-region{min-height:42px;max-width:100%;padding:9px 34px 9px 12px;border:1px solid #c9c1ae;border-radius:10px;background-color:#fffdf7;color:#243b31;font:500 13px system-ui}
    .retalhos-gallery-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 14px}
    .retalhos-gallery-tools button{min-height:38px;padding:8px 12px}
    .retalhos-gallery-tools button[aria-pressed=true]{border-color:#315b4b;background:#315b4b;color:#fff}
    .retalhos-library-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:12px}
    .retalhos-library-card{min-width:0;overflow:hidden;border:1px solid #d8d3c5;border-radius:12px;background:#fffdf7;box-shadow:0 2px 8px #26352b0d}
    .retalhos-library-card>img{display:block;width:100%;aspect-ratio:1/1;object-fit:cover;background:#e9e5d9}
    .retalhos-library-copy{padding:9px 10px 10px}.retalhos-library-copy strong,.retalhos-library-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.retalhos-library-copy strong{color:#243b31;font-size:12px}.retalhos-library-copy small{margin-top:4px;color:#6f786f;font-size:10px}
    .retalhos-assign-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;padding:0 9px 9px}
    .retalhos-assign-row input{min-width:0;width:100%;min-height:38px;padding:8px;border:1px solid #d8d3c5;border-radius:8px;background:#fff;color:#243b31;font:12px system-ui}
    .retalhos-assign-row button{min-height:38px;padding:8px 10px;font-size:11px}
    .retalhos-search-results{display:grid;gap:5px;padding:0 9px 9px}.retalhos-search-results button{min-height:36px;text-align:left;font-size:11px}
    .retalhos-empty{grid-column:1/-1;padding:20px;border:1px dashed #c9c1ae;border-radius:12px;color:#6f786f;text-align:center}
    .brand-mark{display:grid!important;grid-template-columns:repeat(2,7px);grid-template-rows:repeat(2,7px);gap:2px;align-content:center;justify-content:center;width:29px!important;height:29px!important;padding:5px;border:1px solid #bcae91;border-radius:7px;background:#e9dfc8;transform:rotate(-3deg)}
    .brand-mark i{display:block!important;width:7px;height:7px;border-radius:2px;background:#315b4b}.brand-mark i:nth-child(2){background:#b66f55}.brand-mark i:nth-child(3){background:#c39a5c}.brand-mark i:nth-child(4){background:#6f8e78}
    button,input,select{accent-color:#315b4b}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #b7cbbd;outline-offset:2px}
    @media(max-width:600px){.retalhos-quick-actions{display:grid;grid-template-columns:1fr 1fr}.retalhos-quick-actions .retalhos-region{grid-column:1/-1;width:100%}.retalhos-quick-actions button{width:100%;min-height:44px}.retalhos-library-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.map-section{margin-top:6px!important}}
    @media(prefers-reduced-motion:reduce){.retalhos-photo-pin img,.retalhos-quick-actions button{transition:none}}
  `;
  document.head.appendChild(style);

  // Keep the map reference and a cluster layer for close-together photo patches.
  if (window.L?.map) {
    const leafletMap = window.L.map;
    window.L.map = function (...args) {
      map = leafletMap.apply(this, args);
      window.retalhosMap = map;
      pinLayer = window.L.markerClusterGroup
        ? window.L.markerClusterGroup({
            maxClusterRadius: 38,
            showCoverageOnHover: false,
            spiderfyOnMaxZoom: true,
            iconCreateFunction: cluster => window.L.divIcon({
              className: 'retalhos-cluster-wrap',
              html: `<div class="retalhos-cluster"><span>${cluster.getChildCount()}</span></div>`,
              iconSize: [38, 38], iconAnchor: [19, 19]
            })
          }).addTo(map)
        : window.L.layerGroup().addTo(map);
      requestAnimationFrame(() => map?.invalidateSize({ pan: false }));
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
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }
  async function saveMemory(memory) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(memory);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  function getImageUrl(item) {
    if (imageUrls.has(item.id)) return imageUrls.get(item.id);
    const url = item.blob instanceof Blob ? URL.createObjectURL(item.blob) : (item.image || '');
    imageUrls.set(item.id, url);
    return url;
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  }
  function markerIcon(item) {
    const url = getImageUrl(item);
    const alt = escapeHtml(item.name || 'Retalho');
    return window.L.divIcon({
      className: 'retalhos-photo-pin',
      html: `<img src="${url.replace(/"/g, '&quot;')}" alt="${alt}" style="--patch-tilt:${(Number.parseInt(String(item.id).slice(-2), 16) % 7) - 3}deg">`,
      iconSize: [34, 34], iconAnchor: [17, 17]
    });
  }
  function renderPins() {
    if (!map || !pinLayer) return;
    pinLayer.clearLayers();
    allMemories.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng)).forEach(item => {
      const marker = window.L.marker([item.lat, item.lng], { icon: markerIcon(item), keyboard: true, title: item.name || 'Retalho' });
      const popup = document.createElement('div');
      popup.className = 'photo-popup';
      const image = document.createElement('img');
      image.src = getImageUrl(item);
      image.alt = item.name || 'Fotografia';
      const title = document.createElement('strong');
      title.textContent = item.name || 'Fotografia';
      popup.append(image, title);
      const placeText = item.locationName || item.suggestedLocation;
      if (placeText) {
        const place = document.createElement('small');
        place.textContent = `${item.locationName ? '' : 'Sugestão: '}${placeText.split(',')[0].trim()}`;
        popup.append(place);
      }
      marker.bindPopup(popup).addTo(pinLayer);
    });
  }

  function createQuickActions() {
    const mapSection = document.querySelector('.map-section');
    const mapElement = $('map');
    if (!mapSection || !mapElement || $('retalhosQuickActions')) return;
    const bar = document.createElement('div');
    bar.id = 'retalhosQuickActions';
    bar.className = 'retalhos-quick-actions';
    bar.setAttribute('aria-label', 'Adicionar fotografias e escolher região');
    const galleryButton = document.createElement('button');
    galleryButton.type = 'button';
    galleryButton.className = 'primary';
    galleryButton.textContent = '＋ Galeria';
    galleryButton.addEventListener('click', () => $('photoInput')?.click());
    const cameraButton = document.createElement('button');
    cameraButton.type = 'button';
    cameraButton.textContent = '▣ Câmara';
    cameraButton.addEventListener('click', () => $('retalhosCameraInput')?.click());
    const region = $('coverSelect');
    if (region) {
      region.classList.add('retalhos-region');
      region.setAttribute('aria-label', 'Escolher região do mapa');
      bar.append(galleryButton, cameraButton, region);
    } else bar.append(galleryButton, cameraButton);
    mapSection.insertBefore(bar, mapElement);

    const camera = document.createElement('input');
    camera.id = 'retalhosCameraInput';
    camera.type = 'file';
    camera.accept = 'image/*';
    camera.capture = 'environment';
    camera.hidden = true;
    camera.addEventListener('change', importCameraPhoto);
    document.body.appendChild(camera);
  }

  function createGalleryTools() {
    const gallery = $('gallery');
    if (!gallery || $('retalhosGalleryTools')) return;
    const section = gallery.closest('.memory-section') || gallery.parentElement;
    const tools = document.createElement('div');
    tools.id = 'retalhosGalleryTools';
    tools.className = 'retalhos-gallery-tools';
    tools.setAttribute('aria-label', 'Filtros da galeria');
    [['all','Todas'],['missing','Sem localização']].forEach(([value,label], index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.filter = value;
      button.textContent = label;
      button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
      button.addEventListener('click', () => {
        tools.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        tools.dataset.activeFilter = value;
        renderGallery();
      });
      tools.appendChild(button);
    });
    section.insertBefore(tools, gallery);
    gallery.classList.add('retalhos-library-grid');
  }

  function searchPanel(memory, card) {
    const row = document.createElement('div');
    row.className = 'retalhos-assign-row';
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Procurar local…';
    input.setAttribute('aria-label', `Procurar local para ${memory.name || 'fotografia'}`);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Procurar';
    const results = document.createElement('div');
    results.className = 'retalhos-search-results';
    const search = async () => {
      const query = input.value.trim();
      results.replaceChildren();
      if (query.length < 3) { results.textContent = 'Escreve pelo menos três letras.'; return; }
      button.disabled = true;
      button.textContent = 'A procurar…';
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=pt&q=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Pesquisa indisponível');
        const places = await response.json();
        if (!places.length) { results.textContent = 'Não encontrei esse local.'; return; }
        places.forEach(place => {
          const choice = document.createElement('button');
          choice.type = 'button';
          choice.textContent = place.display_name;
          choice.addEventListener('click', async () => {
            memory.lat = Number(place.lat);
            memory.lng = Number(place.lon);
            memory.locationName = place.display_name;
            memory.locationSource = 'manual';
            delete memory.suggestedLocation;
            await saveMemory(memory);
            window.dispatchEvent(new Event('retalhos-data-changed'));
            await refresh();
          });
          results.appendChild(choice);
        });
      } catch (error) {
        console.warn('Pesquisa de locais:', error);
        results.textContent = 'Não foi possível pesquisar agora. Tenta novamente mais tarde.';
      } finally { button.disabled = false; button.textContent = 'Procurar'; }
    };
    button.addEventListener('click', search);
    input.addEventListener('keydown', event => { if (event.key === 'Enter') search(); });
    row.append(input, button);
    card.append(row, results);
  }

  function renderGallery() {
    const gallery = $('gallery');
    if (!gallery) return;
    gallery.classList.add('retalhos-library-grid');
    const filter = $('retalhosGalleryTools')?.dataset.activeFilter || 'all';
    const shown = allMemories.filter(item => filter !== 'missing' || !Number.isFinite(item.lat) || !Number.isFinite(item.lng));
    gallery.replaceChildren();
    if (!shown.length) {
      const empty = document.createElement('div');
      empty.className = 'retalhos-empty';
      empty.textContent = allMemories.length ? 'Todas as fotografias já têm localização.' : 'Ainda não há fotografias. Adiciona retalhos pela galeria ou pela câmara.';
      gallery.appendChild(empty);
      return;
    }
    shown.forEach(memory => {
      const card = document.createElement('article');
      card.className = 'retalhos-library-card';
      const image = document.createElement('img');
      image.src = getImageUrl(memory);
      image.alt = memory.name || 'Fotografia';
      image.loading = 'lazy';
      const copy = document.createElement('div');
      copy.className = 'retalhos-library-copy';
      const name = document.createElement('strong');
      name.textContent = memory.name || 'Fotografia sem nome';
      const detail = document.createElement('small');
      const located = Number.isFinite(memory.lat) && Number.isFinite(memory.lng);
      detail.textContent = located ? (memory.locationName || memory.suggestedLocation || 'Localização guardada') : 'Sem localização · atribui um sítio';
      copy.append(name, detail);
      card.append(image, copy);
      if (!located) searchPanel(memory, card);
      else {
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `Ver ${memory.name || 'fotografia'} no mapa`);
        const focusOnMap = () => {
          map?.flyTo([memory.lat, memory.lng], Math.min(15, Math.max(11, map.getZoom())), { duration: .8 });
          $('map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
        card.addEventListener('click', focusOnMap);
        card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusOnMap(); } });
      }
      gallery.appendChild(card);
    });
  }

  async function reverseLookup(lat, lng) {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`, { headers: { Accept: 'application/json' } });
      if (!response.ok) return '';
      const data = await response.json();
      const address = data.address || {};
      return data.name || address.town || address.city || address.village || address.municipality || address.county || data.display_name?.split(',')[0] || '';
    } catch (_) { return ''; }
  }
  function getDevicePosition() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
      );
    });
  }
  async function importCameraPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    const button = $('retalhosQuickActions')?.querySelector('button:nth-child(2)');
    if (button) { button.disabled = true; button.textContent = 'A guardar…'; }
    try {
      let coords = await getDevicePosition();
      let takenAt = null;
      if (window.exifr?.parse) {
        try {
          const exif = await window.exifr.parse(file, { gps: true, exif: true });
          if (!coords && Number.isFinite(exif?.latitude) && Number.isFinite(exif?.longitude)) coords = { lat: exif.latitude, lng: exif.longitude };
          if (exif?.DateTimeOriginal instanceof Date) takenAt = exif.DateTimeOriginal.getTime();
        } catch (_) { /* A fotografia pode não incluir EXIF. */ }
      }
      const item = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        name: file.name.replace(/\.[^.]+$/, '') || `Fotografia ${new Date().toLocaleDateString('pt-PT')}`,
        blob: file, type: file.type,
        lat: coords?.lat ?? null, lng: coords?.lng ?? null,
        locationSource: coords ? 'gps' : 'pending', locationName: '',
        takenAt, created: Date.now()
      };
      if (coords) item.suggestedLocation = await reverseLookup(coords.lat, coords.lng);
      await saveMemory(item);
      window.dispatchEvent(new Event('retalhos-data-changed'));
      await refresh();
      if (coords) {
        map?.flyTo([coords.lat, coords.lng], Math.max(map.getZoom(), 11), { duration: .8 });
        notify(`Fotografia guardada${item.suggestedLocation ? ` · sugestão: ${item.suggestedLocation}` : ' com GPS'}.`);
      } else notify('Fotografia guardada na galeria geral. Podes atribuir o local manualmente.');
    } catch (error) {
      console.error('Câmara:', error);
      notify('Não foi possível guardar a fotografia. Verifica o espaço disponível.');
    } finally {
      if (button) { button.disabled = false; button.textContent = '▣ Câmara'; }
    }
  }
  function notify(message) {
    const toast = $('toast');
    if (toast) {
      toast.textContent = message;
      toast.classList.add('show');
      window.setTimeout(() => toast.classList.remove('show'), 3500);
    } else console.info(message);
  }
  function updateCounts() {
    const located = allMemories.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng)).length;
    if ($('memoryCount')) $('memoryCount').textContent = String(allMemories.length);
    if ($('mapStatus')) $('mapStatus').textContent = located ? `${located} RETALHOS NO MAPA` : 'PORTUGAL · OS TEUS RETALHOS';
  }
  async function refresh() {
    try {
      allMemories = await getMemories();
      const signature = allMemories.map(item => `${item.id}:${item.lat}:${item.lng}:${item.locationName || ''}:${item.suggestedLocation || ''}`).sort().join('|');
      updateCounts();
      if (signature !== renderedSignature) {
        renderedSignature = signature;
        renderPins();
        renderGallery();
      }
      if (!initialFrameApplied && map) {
        const located = allMemories.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng));
        if (located.length) {
          const bounds = window.L.latLngBounds(located.map(item => [item.lat, item.lng]));
          requestAnimationFrame(() => {
            map.invalidateSize({ pan: false });
            map.fitBounds(bounds, { padding: [42, 42], maxZoom: 11, animate: false });
          });
        }
        initialFrameApplied = true;
      }
    } catch (error) { console.error('Retalhos:', error); }
  }

  function bind() {
    document.querySelector('.workspace-tools')?.remove();
    document.querySelector('.map-legend')?.remove();
    if ($('welcomePanel')) $('welcomePanel').hidden = true;
    if ($('gallery')) $('gallery').hidden = false;
    createQuickActions();
    createGalleryTools();
    const mapElement = $('map');
    if (mapElement) mapElement.setAttribute('aria-label', 'Mapa com retalhos quadrados das tuas fotografias. Toca num retalho para ver a memória.');
    window.addEventListener('retalhos-data-changed', () => { renderedSignature = ''; refresh(); });
    window.addEventListener('resize', () => map?.invalidateSize({ pan: false }));
    refresh();
    window.setInterval(refresh, 2200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
