(() => {
  'use strict';
  const DB_NAME = 'retalhos-db';
  const STORE = 'memories';
  const URL_MUNICIPALITIES = 'https://ogcapi.dgterritorio.gov.pt/collections/municipios/items?f=json&limit=500&crs=http://www.opengis.net/def/crs/OGC/1.3/CRS84';
  const root = document.getElementById('locationIndex');
  if (!root) return;

  const style = document.createElement('style');
  style.textContent = `
    .archive-search{width:100%;margin:12px 0;padding:11px 13px;border:1px solid #d8d3c5;border-radius:9px;background:#f8f5ed;color:#243b31;font:13px system-ui}
    .archive-place{margin:0 0 9px;border:1px solid #e4dfd3;border-radius:12px;background:#f8f5ed;overflow:hidden}
    .archive-place>summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px;cursor:pointer;list-style:none;color:#243b31;font:17px Georgia,serif}
    .archive-place>summary::-webkit-details-marker{display:none}.archive-place>summary:after{content:'＋';color:#315b4b;font:20px system-ui}.archive-place[open]>summary:after{content:'−'}
    .archive-count{color:#6f786f;font:11px system-ui}.archive-photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:9px;padding:0 10px 12px}
    .archive-photo{min-width:0;overflow:hidden;border:1px solid #ded8ca;border-radius:8px;background:#fffdf7}.archive-photo img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}.archive-photo span{display:block;overflow:hidden;padding:6px;color:#243b31;font:11px system-ui;text-overflow:ellipsis;white-space:nowrap}
    .archive-empty{padding:16px;color:#6f786f;font:13px/1.5 system-ui}
  `;
  document.head.appendChild(style);
  let municipalities = [];
  let query = '';
  const imageUrls = new Map();
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
  function areaName(lat, lng) {
    if (!window.turf || !municipalities.length) return '';
    const point = turf.point([lng, lat]);
    const feature = municipalities.find(area => {
      try { return turf.booleanPointInPolygon(point, area); } catch (_) { return false; }
    });
    const p = feature?.properties || {};
    return p.municipio || p.MUNICIPIO || p.nome || p.NOME || p.name || p.NAME || '';
  }
  function placeName(item) {
    const explicit = String(item.locationName || '').trim();
    if (explicit && explicit !== 'Local indicado no mapa') return explicit.split(',')[0].trim();
    return areaName(item.lat, item.lng) || explicit || 'Outros locais';
  }
  function imageUrl(item) {
    if (!imageUrls.has(item.id)) imageUrls.set(item.id, item.blob instanceof Blob ? URL.createObjectURL(item.blob) : (item.image || ''));
    return imageUrls.get(item.id);
  }
  async function render() {
    try {
      const memories = (await getMemories()).filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng));
      const groups = new Map();
      memories.forEach(item => {
        const name = placeName(item);
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(item);
      });
      root.replaceChildren();
      const search = document.createElement('input');
      search.className = 'archive-search';
      search.type = 'search';
      search.placeholder = 'Procurar um lugar ou uma fotografia';
      search.setAttribute('aria-label', 'Procurar no arquivo por lugares');
      search.value = query;
      search.addEventListener('input', () => { query = search.value.trim().toLocaleLowerCase('pt'); render(); });
      root.appendChild(search);
      const entries = [...groups.entries()].sort(([a],[b]) => a.localeCompare(b, 'pt', { sensitivity: 'base' }))
        .filter(([name, photos]) => !query || name.toLocaleLowerCase('pt').includes(query) || photos.some(item => String(item.name || '').toLocaleLowerCase('pt').includes(query)));
      if (!entries.length) {
        const empty = document.createElement('p');
        empty.className = 'archive-empty';
        empty.textContent = memories.length ? 'Não encontrei locais ou fotografias para esta pesquisa.' : 'As fotografias com localização vão aparecer aqui, organizadas por lugar.';
        root.appendChild(empty);
        return;
      }
      entries.forEach(([name, photos]) => {
        photos.sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt', { sensitivity: 'base' }));
        const details = document.createElement('details');
        details.className = 'archive-place';
        const summary = document.createElement('summary');
        const label = document.createElement('span');
        label.textContent = name;
        const count = document.createElement('span');
        count.className = 'archive-count';
        count.textContent = `${photos.length} ${photos.length === 1 ? 'fotografia' : 'fotografias'}`;
        summary.append(label, count);
        const grid = document.createElement('div');
        grid.className = 'archive-photos';
        photos.forEach(item => {
          const card = document.createElement('article');
          card.className = 'archive-photo';
          const image = document.createElement('img');
          image.src = imageUrl(item);
          image.alt = item.name || 'Fotografia';
          image.loading = 'lazy';
          const caption = document.createElement('span');
          caption.textContent = item.name || 'Fotografia';
          card.append(image, caption);
          grid.appendChild(card);
        });
        details.append(summary, grid);
        root.appendChild(details);
      });
    } catch (error) {
      console.error('Arquivo por lugares:', error);
      root.textContent = 'Não foi possível carregar o arquivo por lugares.';
    }
  }
  async function init() {
    try {
      const response = await fetch(URL_MUNICIPALITIES, { headers: { Accept: 'application/geo+json' } });
      if (response.ok) municipalities = (await response.json()).features || [];
    } catch (error) { console.warn('Não foi possível carregar os nomes dos concelhos:', error); }
    render();
    window.addEventListener('retalhos-data-changed', render);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
