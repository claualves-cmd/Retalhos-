(() => {
  'use strict';

  const DB_NAME = 'retalhos-db';
  const STORE = 'memories';
  const $ = id => document.getElementById(id);
  let map = null;
  let pinLayer = null;
  let allMemories = [];
  let selectedYear = 'all';
  let mode = 'colcha';
  let renderedSignature = '';
  const imageUrls = new Map();

  if (window.L?.map) {
    const leafletMap = window.L.map;
    window.L.map = function (...args) {
      map = leafletMap.apply(this, args);
      window.retalhosMap = map;
      pinLayer = window.L.layerGroup().addTo(map);
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
  async function putMemories(items) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.clear();
      items.forEach(item => store.put(item));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  function getImageUrl(item) {
    if (imageUrls.has(item.id)) return imageUrls.get(item.id);
    const url = item.blob instanceof Blob ? URL.createObjectURL(item.blob) : (item.image || '');
    imageUrls.set(item.id, url);
    return url;
  }
  function filteredMemories() {
    return allMemories.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng) &&
      (selectedYear === 'all' || (item.takenAt && new Date(item.takenAt).getFullYear() === Number(selectedYear))));
  }
  function renderPins(force = false) {
    if (!map || !pinLayer) return;
    const items = filteredMemories();
    const signature = `${selectedYear}|${items.map(item => `${item.id}:${item.lat}:${item.lng}:${item.locationName || ''}`).sort().join('|')}`;
    if (!force && signature === renderedSignature) return;
    renderedSignature = signature;
    pinLayer.clearLayers();
    items.forEach(item => {
      const url = getImageUrl(item);
      const icon = window.L.divIcon({
        className: 'retalhos-photo-pin',
        html: `<img src="${url.replace(/"/g, '&quot;')}" alt="">`,
        iconSize: [42, 42], iconAnchor: [21, 21]
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
      if (item.locationName) {
        const place = document.createElement('small');
        place.textContent = item.locationName.split(',')[0].trim();
        popup.append(place);
      }
      marker.bindPopup(popup).addTo(pinLayer);
    });
  }
  function updateMapView() {
    const imageOverlay = document.querySelector('#map .retalhos-photo-overlay');
    if (imageOverlay) imageOverlay.style.display = mode === 'colcha' ? '' : 'none';
    if (pinLayer) {
      if (mode === 'alfinetes') pinLayer.addTo(map);
      else map.removeLayer(pinLayer);
    }
    renderPins();
    document.querySelectorAll('[data-map-mode]').forEach(button => {
      const active = (button.dataset.mapMode === 'colcha' && mode === 'colcha') ||
        (button.dataset.mapMode === 'pins' && mode === 'alfinetes');
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  function populateYears() {
    const select = $('yearFilter');
    if (!select) return;
    const years = [...new Set(allMemories.map(item => item.takenAt && new Date(item.takenAt).getFullYear()).filter(Boolean))].sort((a, b) => b - a);
    select.replaceChildren(new Option('Todas as memórias', 'all'));
    years.forEach(year => select.add(new Option(String(year), String(year))));
    if ([...select.options].some(option => option.value === selectedYear)) select.value = selectedYear;
    else { selectedYear = 'all'; select.value = 'all'; }
  }
  async function refresh() {
    try {
      allMemories = await getMemories();
      populateYears();
      updateMapView();
    } catch (error) { console.error('Controlos Retalhos:', error); }
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function exportBackup() {
    if (!window.JSZip) throw new Error('A biblioteca de cópias não foi carregada.');
    const zip = new window.JSZip();
    const records = [];
    for (const item of await getMemories()) {
      const record = { ...item };
      if (item.blob instanceof Blob) {
        const extension = (item.type || item.blob.type || 'image/jpeg').split('/')[1] || 'jpg';
        record.imageFile = `photos/${item.id}.${extension}`;
        zip.file(record.imageFile, item.blob);
        delete record.blob;
      }
      records.push(record);
    }
    zip.file('memories.json', JSON.stringify({ version: 1, memories: records }, null, 2));
    download(await zip.generateAsync({ type: 'blob' }), 'retalhos-copia.zip');
  }
  async function importBackup(file) {
    if (!window.JSZip) throw new Error('A biblioteca de cópias não foi carregada.');
    const zip = await window.JSZip.loadAsync(file);
    const entry = zip.file('memories.json');
    if (!entry) throw new Error('O ficheiro não contém uma cópia Retalhos válida.');
    const data = JSON.parse(await entry.async('text'));
    if (!Array.isArray(data.memories)) throw new Error('A cópia não contém memórias.');
    const restored = [];
    for (const record of data.memories) {
      const item = { ...record };
      if (record.imageFile) {
        const photo = zip.file(record.imageFile);
        if (photo) item.blob = await photo.async('blob');
        delete item.imageFile;
      }
      restored.push(item);
    }
    await putMemories(restored);
    await refresh();
    window.dispatchEvent(new Event('retalhos-data-changed'));
  }
  async function createPoster() {
    if (!window.html2canvas || !map) throw new Error('Não foi possível preparar o poster.');
    const canvas = await window.html2canvas($('map'), { useCORS: true, backgroundColor: '#17252a', scale: 2 });
    canvas.toBlob(blob => { if (blob) download(blob, 'retalhos-mapa.png'); }, 'image/png');
  }
  function bind() {
    if ($('gallery')) $('gallery').hidden = true;
    if ($('welcomePanel')) $('welcomePanel').hidden = true;
    document.querySelectorAll('[data-map-mode]').forEach(button => button.addEventListener('click', () => {
      mode = button.dataset.mapMode === 'pins' ? 'alfinetes' : 'colcha';
      updateMapView();
    }));
    $('yearFilter')?.addEventListener('change', event => {
      selectedYear = event.target.value;
      renderedSignature = '';
      renderPins(true);
      window.dispatchEvent(new Event('retalhos-year-changed'));
    });
    $('createPoster')?.addEventListener('click', () => createPoster().catch(error => alert(error.message)));
    $('exportBackup')?.addEventListener('click', () => exportBackup().catch(error => alert(error.message)));
    $('importBackupButton')?.addEventListener('click', () => $('importBackup')?.click());
    $('importBackup')?.addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try { await importBackup(file); alert('Cópia importada com sucesso.'); }
      catch (error) { console.error(error); alert(`Não foi possível importar a cópia: ${error.message}`); }
      finally { event.target.value = ''; }
    });
    window.addEventListener('retalhos-data-changed', async () => {
      renderedSignature = '';
      await refresh();
    });
    refresh();
  }
  const style = document.createElement('style');
  style.textContent = `
    #gallery,#welcomePanel{display:none!important}
    .retalhos-photo-pin{background:transparent!important;border:0!important;transform:translate3d(0,0,0);backface-visibility:hidden}
    .retalhos-photo-pin img{display:block;width:40px;height:40px;border:2px solid #fff;border-radius:50%;object-fit:cover;box-shadow:0 2px 8px #0008;backface-visibility:hidden}
  `;
  document.head.appendChild(style);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
