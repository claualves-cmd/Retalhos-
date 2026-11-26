(() => {
  'use strict';

  const DB_NAME = 'retalhos-db';
  const STORE = 'memories';
  const MUNICIPALITIES_URL = 'https://ogcapi.dgterritorio.gov.pt/collections/municipios/items?f=json&limit=500&crs=http://www.opengis.net/def/crs/OGC/1.3/CRS84';
  const root = document.getElementById('locationIndex');
  if (!root) return;

  let municipalities = [];
  let lastSignature = '';
  let refreshTimer = null;

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

  function municipalityName(lat, lng) {
    if (!window.turf || !municipalities.length) return '';
    const point = window.turf.point([lng, lat]);
    const feature = municipalities.find(item => {
      try { return window.turf.booleanPointInPolygon(point, item); } catch (_) { return false; }
    });
    const props = feature?.properties || {};
    return props.municipio || props.MUNICIPIO || props.nome || props.NOME || props.name || '';
  }

  function folderName(memory) {
    const explicit = String(memory.locationName || '').trim();
    if (explicit && explicit !== 'Local indicado no mapa') return explicit;
    if (Number.isFinite(memory.lat) && Number.isFinite(memory.lng)) {
      return municipalityName(memory.lat, memory.lng) || explicit || 'Outros locais';
    }
    return explicit || 'Outros locais';
  }

  function photoCard(memory) {
    const card = document.createElement('article');
    card.className = 'location-photo';
    const image = document.createElement('img');
    image.alt = memory.name || 'Fotografia';
    image.loading = 'lazy';
    if (memory.blob instanceof Blob) image.src = URL.createObjectURL(memory.blob);
    else image.src = memory.image || '';
    const title = document.createElement('span');
    title.textContent = memory.name || 'Fotografia';
    card.append(image, title);
    return card;
  }

  async function renderIndex() {
    try {
      const memories = await getMemories();
      const located = memories.filter(memory => Number.isFinite(memory.lat) && Number.isFinite(memory.lng));
      const signature = located.map(memory => `${memory.id}:${memory.lat}:${memory.lng}:${memory.locationName || ''}`).sort().join('|');
      if (signature === lastSignature) return;
      lastSignature = signature;

      const groups = new Map();
      located.forEach(memory => {
        const name = folderName(memory);
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(memory);
      });

      root.replaceChildren();
      if (!groups.size) {
        const empty = document.createElement('p');
        empty.className = 'location-index-empty';
        empty.textContent = 'Quando localizares fotografias, os locais aparecem aqui por ordem alfabética.';
        root.appendChild(empty);
        return;
      }

      [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'pt', { sensitivity: 'base' }))
        .forEach(([name, photos]) => {
          const folder = document.createElement('details');
          folder.className = 'location-folder';
          const summary = document.createElement('summary');
          summary.textContent = `${name} (${photos.length})`;
          const contents = document.createElement('div');
          contents.className = 'location-folder-photos';
          photos.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt', { sensitivity: 'base' }));
          photos.forEach(photo => contents.appendChild(photoCard(photo)));
          folder.append(summary, contents);
          root.appendChild(folder);
        });
    } catch (error) {
      console.error('Índice de locais:', error);
      root.textContent = 'Não foi possível carregar o índice de locais.';
    }
  }

  async function init() {
    try {
      const response = await fetch(MUNICIPALITIES_URL, { headers: { Accept: 'application/geo+json' } });
      if (response.ok) {
        const data = await response.json();
        municipalities = (data.features || []).filter(feature => feature.geometry);
      }
    } catch (error) {
      console.warn('Não foi possível carregar os nomes dos municípios para o índice.', error);
    }
    renderIndex();
    refreshTimer = window.setInterval(renderIndex, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
