(() => {
  'use strict';
  const DB_NAME = 'retalhos-db';
  const DB_VERSION = 2;
  const STORE = 'memories';
  const $ = id => document.getElementById(id);
  const mapHint = $('mapHint'), gallery = $('gallery'), memoryCount = $('memoryCount');
  const photoInput = $('photoInput'), toastEl = $('toast');
  const coverSelect = $('coverSelect');
  const covers = {
    portugal: { center: [39.6, -8.0], zoom: 6.4, label: 'Portugal' },
    world: { center: [24, 0], zoom: 2.2, label: 'Mundo' },
    azores: { center: [38.55, -28.0], zoom: 7.1, label: 'Açores' },
    madeira: { center: [32.75, -17.0], zoom: 9, label: 'Madeira' },
    france: { center: [46.6, 2.4], zoom: 5.8, label: 'França' },
    morocco: { center: [31.8, -6.0], zoom: 5.8, label: 'Marrocos' }
  };
  let map = null, deferredInstall = null, activePendingId = null, memories = [], pending = [];
  let overlaySvg = null, overlayTimer = null, toastTimer = null;
  const objectUrls = new Map();

  function toast(message) {
    toastEl.textContent = message; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
  }
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
  }
  async function dbAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result.sort((a,b) => b.created - a.created)); req.onerror = () => reject(req.error);
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
    let url;
    if (item.blob instanceof Blob) url = URL.createObjectURL(item.blob);
    else url = item.image || '';
    objectUrls.set(item.id, url);
    return url;
  }
  function initMap() {
    if (!window.L) { mapHint.textContent = 'Não foi possível carregar o mapa. Verifica a ligação à internet.'; return; }
    map = L.map('map', { zoomControl: true, scrollWheelZoom: true, touchZoom: true, doubleClickZoom: true, minZoom: 2, maxZoom: 18, worldCopyJump: true, preferCanvas: true }).setView(covers.portugal.center, covers.portugal.zoom);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      minZoom: 2, maxZoom: 18,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics and GIS community'
    }).addTo(map);
    // SVG overlay is deliberately separate from map markers: photographs become geographic territories.
    overlaySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlaySvg.setAttribute('class', 'retalhos-svg');
    overlaySvg.style.position = 'absolute'; overlaySvg.style.left = '0'; overlaySvg.style.top = '0';
    overlaySvg.style.width = '100%'; overlaySvg.style.height = '100%'; overlaySvg.style.zIndex = '450';
    map.getPanes().overlayPane.appendChild(overlaySvg);
    map.on('move zoom zoomend moveend resize', scheduleOverlayDraw);
    map.on('click', handleMapClick);
    const savedCover = localStorage.getItem('retalhos-cover') || 'portugal';
    if (savedCover === 'custom') {
      const custom = JSON.parse(localStorage.getItem('retalhos-custom-cover') || 'null');
      if (custom?.center && custom?.zoom) map.setView(custom.center, custom.zoom);
      coverSelect.value = 'custom';
    } else if (covers[savedCover]) { map.setView(covers[savedCover].center, covers[savedCover].zoom); coverSelect.value = savedCover; }
    coverSelect.addEventListener('change', () => {
      const key = coverSelect.value;
      if (key === 'custom') {
        const custom = JSON.parse(localStorage.getItem('retalhos-custom-cover') || 'null');
        if (custom?.center && custom?.zoom) map.setView(custom.center, custom.zoom);
        else { toast('Ainda não guardaste uma vista personalizada.'); coverSelect.value = localStorage.getItem('retalhos-cover') || 'portugal'; }
      } else if (covers[key]) {
        localStorage.setItem('retalhos-cover', key); map.flyTo(covers[key].center, covers[key].zoom, { duration: 1.1 });
      }
    });
    $('saveCover').addEventListener('click', () => {
      const center = map.getCenter();
      localStorage.setItem('retalhos-custom-cover', JSON.stringify({ center: [center.lat, center.lng], zoom: map.getZoom() }));
      localStorage.setItem('retalhos-cover', 'custom'); coverSelect.value = 'custom';
      toast('Esta vista ficou guardada como a tua capa.');
    });
    $('resetView').addEventListener('click', () => {
      const key = localStorage.getItem('retalhos-cover') || 'portugal';
      if (key === 'custom') {
        const custom = JSON.parse(localStorage.getItem('retalhos-custom-cover') || 'null');
        if (custom) map.flyTo(custom.center, custom.zoom, { duration: .9 });
      } else if (covers[key]) map.flyTo(covers[key].center, covers[key].zoom, { duration: .9 });
    });
  }
  function handleMapClick(event) {
    if (!activePendingId) {
      mapHint.textContent = 'Arrasta para explorar. Para localizar uma fotografia sem GPS, escolhe-a primeiro na lista abaixo do mapa.';
      return;
    }
    const item = pending.find(p => p.id === activePendingId);
    if (!item) return;
    item.lat = event.latlng.lat; item.lng = event.latlng.lng; item.locationSource = 'manual';
    dbPut(item).then(async () => {
      pending = pending.filter(p => p.id !== item.id); activePendingId = null;
      await refreshAll();
      toast('Local guardado. A fotografia já faz parte da colcha.');
      mapHint.textContent = 'Memória localizada. Podes continuar a explorar o mundo.';
    }).catch(() => toast('Não foi possível guardar a localização.'));
  }
  function scheduleOverlayDraw() {
    if (overlayTimer) cancelAnimationFrame(overlayTimer);
    overlayTimer = requestAnimationFrame(drawPhotoTerritories);
  }
  function clipHalfPlane(poly, nx, ny, c) {
    const out = [];
    if (!poly.length) return out;
    const inside = p => nx * p.x + ny * p.y <= c + 1e-7;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ia = inside(a), ib = inside(b);
      if (ia && ib) out.push(b);
      else if (ia && !ib) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = (c - nx * a.x - ny * a.y) / (nx * dx + ny * dy);
        out.push({ x: a.x + t * dx, y: a.y + t * dy });
      } else if (!ia && ib) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = (c - nx * a.x - ny * a.y) / (nx * dx + ny * dy);
        out.push({ x: a.x + t * dx, y: a.y + t * dy }, b);
      }
    }
    return out;
  }
  function drawPhotoTerritories() {
    if (!map || !overlaySvg) return;
    const size = map.getSize(), w = size.x, h = size.y;
    overlaySvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    overlaySvg.setAttribute('width', w); overlaySvg.setAttribute('height', h);
    while (overlaySvg.firstChild) overlaySvg.removeChild(overlaySvg.firstChild);
    const groups = new Map();
    memories.filter(m => Number.isFinite(m.lat) && Number.isFinite(m.lng)).forEach(item => {
      const key = `${item.lat.toFixed(6)},${item.lng.toFixed(6)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    const sites = [...groups.values()].map(items => {
      const p = map.latLngToContainerPoint([items[0].lat, items[0].lng]);
      return { x: p.x, y: p.y, items };
    }).filter(s => s.x > -w * 3 && s.x < w * 4 && s.y > -h * 3 && s.y < h * 4);
    if (!sites.length) return;
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    sites.forEach((site, i) => {
      const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
      pattern.setAttribute('id', `retalho-pattern-${i}`); pattern.setAttribute('patternUnits', 'objectBoundingBox');
      pattern.setAttribute('width', '1'); pattern.setAttribute('height', '1'); pattern.setAttribute('patternContentUnits', 'objectBoundingBox');
      const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      image.setAttribute('href', getImageUrl(site.items[0])); image.setAttribute('x', '0'); image.setAttribute('y', '0');
      image.setAttribute('width', '1'); image.setAttribute('height', '1'); image.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      pattern.appendChild(image); defs.appendChild(pattern);
    });
    overlaySvg.appendChild(defs);
    const baseRect = [{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
    sites.forEach((site, i) => {
      let poly = baseRect.slice();
      for (let j = 0; j < sites.length && poly.length; j++) {
        if (i === j) continue;
        const other = sites[j], nx = other.x - site.x, ny = other.y - site.y;
        if (Math.abs(nx) + Math.abs(ny) < 0.001) continue;
        const c = (other.x * other.x + other.y * other.y - site.x * site.x - site.y * site.y) / 2;
        poly = clipHalfPlane(poly, nx, ny, c);
      }
      if (poly.length < 3) return;
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', poly.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
      polygon.setAttribute('fill', `url(#retalho-pattern-${i})`); polygon.setAttribute('class', 'retalho-shape');
      polygon.addEventListener('click', event => {
        event.stopPropagation(); openMemoryPopup(site.items, site.x, site.y);
      });
      overlaySvg.appendChild(polygon);
    });
  }
  function openMemoryPopup(items, x, y) {
    const first = items[0];
    const url = getImageUrl(first);
    const stack = items.length > 1 ? `<div class="stack">${items.map(item => `<img src="${getImageUrl(item)}" alt="${escapeHtml(item.name)}">`).join('')}</div>` : '';
    const html = `<div class="photo-popup"><img src="${url}" alt="${escapeHtml(first.name)}"><strong>${escapeHtml(first.name)}</strong><small>${first.lat.toFixed(5)}, ${first.lng.toFixed(5)}</small>${items.length > 1 ? `<p>${items.length} fotografias neste mesmo ponto</p>${stack}` : ''}</div>`;
    L.popup({ closeButton: true, maxWidth: 230, autoPan: true }).setLatLng(map.containerPointToLatLng([x,y])).setContent(html).openOn(map);
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function makeObjectUrl(blob) { return URL.createObjectURL(blob); }
  async function readPhoto(file) {
    let gps = null, takenAt = null;
    try {
      if (window.exifr?.parse) {
        const exif = await window.exifr.parse(file, { gps: true, exif: true });
        if (Number.isFinite(exif?.latitude) && Number.isFinite(exif?.longitude)) gps = { lat: exif.latitude, lng: exif.longitude };
        if (exif?.DateTimeOriginal instanceof Date) takenAt = exif.DateTimeOriginal.getTime();
      }
    } catch (_) { /* Alguns formatos não incluem metadados EXIF. */ }
    return { file, gps, takenAt };
  }
  async function storePhoto(photo, coords, source) {
    const item = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      name: photo.file.name.replace(/\.[^.]+$/, ''), blob: photo.file, type: photo.file.type,
      lat: coords.lat, lng: coords.lng, locationSource: source, takenAt: photo.takenAt || null, created: Date.now()
    };
    await dbPut(item);
    return item;
  }
  function renderPending() {
    const section = $('pendingSection'), list = $('pendingList');
    $('pendingCount').textContent = pending.length;
    section.hidden = !pending.length;
    list.innerHTML = '';
    pending.forEach(item => {
      const card = document.createElement('article'); card.className = `pending-card${item.id === activePendingId ? ' active' : ''}`;
      const img = document.createElement('img'); img.src = getImageUrl(item); img.alt = item.name;
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = item.id === activePendingId ? 'Agora toca no mapa' : 'Escolher local';
      button.addEventListener('click', () => {
        activePendingId = item.id; renderPending();
        mapHint.textContent = `A localizar: ${item.name}. Toca no mapa no local onde foi tirada.`;
        $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      card.append(img, button); list.append(card);
    });
  }
  async function refreshAll() {
    memories = await dbAll();
    memoryCount.textContent = memories.length;
    // Existing v0.2/v0.3 records without GPS remain usable; only new unsited records enter the pending queue.
    pending = memories.filter(item => !Number.isFinite(item.lat) || !Number.isFinite(item.lng));
    memories = memories.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng));
    gallery.innerHTML = '';
    if (!memories.length) {
      gallery.innerHTML = '<div class="empty-state"><span class="empty-icon">▧</span><strong>Ainda não há retalhos.</strong><p>A primeira fotografia dá início à tua colcha.</p></div>';
    } else {
      memories.forEach(item => {
        const card = document.createElement('article'); card.className = 'memory-card';
        const img = document.createElement('img'); img.src = getImageUrl(item); img.alt = item.name; img.loading = 'lazy';
        const meta = document.createElement('div'); meta.className = 'memory-meta'; meta.textContent = item.name;
        const locate = document.createElement('button'); locate.type = 'button'; locate.title = 'Ver no mapa'; locate.textContent = '⌖';
        locate.addEventListener('click', () => { map.flyTo([item.lat,item.lng], Math.min(15, Math.max(11, map.getZoom())), { duration: .9 }); $('map').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
        card.addEventListener('click', () => { map.flyTo([item.lat,item.lng], Math.min(15, Math.max(11, map.getZoom())), { duration: .9 }); $('map').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
        card.append(img, meta, locate); gallery.append(card);
      });
    }
    renderPending(); scheduleOverlayDraw();
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
      // Sequential EXIF parsing keeps the phone responsive on large imports.
      for (let i = 0; i < files.length; i++) {
        const photo = await readPhoto(files[i]);
        if (photo.gps) { await storePhoto(photo, photo.gps, 'gps'); imported++; }
        else {
          const pendingItem = { id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, name: files[i].name.replace(/\.[^.]+$/, ''), blob: files[i], type: files[i].type, lat: null, lng: null, locationSource: 'pending', takenAt: photo.takenAt || null, created: Date.now() };
          await dbPut(pendingItem); noGps++;
        }
        if ((i + 1) % 10 === 0 || i + 1 === files.length) $('selectedPlace').textContent = `A analisar ${i + 1} de ${files.length}…`;
      }
      await refreshAll();
      $('selectedPlace').textContent = 'Importação concluída';
      $('selectedCoords').textContent = `${imported} com GPS · ${noGps} sem GPS`;
      toast(`${imported} colocadas por GPS${noGps ? ` · ${noGps} precisam de localização` : ''}.`);
      if (noGps) {
        mapHint.textContent = 'Seleciona uma fotografia sem GPS na lista e toca no mapa para indicar o local.';
        $('pendingSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (error) {
      console.error(error); toast('Não foi possível importar todas as fotografias. Verifica o espaço disponível no telemóvel.');
      await refreshAll();
    }
    photoInput.disabled = false; photoInput.value = '';
  });
  $('clearMemories').addEventListener('click', async () => {
    const items = await dbAll();
    if (!items.length) { toast('Ainda não tens memórias guardadas.'); return; }
    if (confirm('Queres apagar todas as fotografias guardadas neste dispositivo?')) {
      await dbClear(); objectUrls.forEach(url => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); }); objectUrls.clear();
      activePendingId = null; await refreshAll(); toast('Memórias apagadas deste dispositivo.');
    }
  });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); deferredInstall = event; const btn = $('installBtn'); btn.hidden = false;
    btn.addEventListener('click', async () => { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; btn.hidden = true; }, { once: true });
  });
  window.addEventListener('appinstalled', () => toast('Retalhos instalado neste dispositivo.'));
  initMap();
  refreshAll().catch(() => toast('Não foi possível abrir o arquivo de memórias.'));
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
})();
