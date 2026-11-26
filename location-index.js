(() => {
  'use strict';

  const DB_NAME = 'retalhos-db';
  const STORE = 'memories';
  const MUNICIPALITIES_URL = 'https://ogcapi.dgterritorio.gov.pt/collections/municipios/items?f=json&limit=500&crs=http://www.opengis.net/def/crs/OGC/1.3/CRS84';
  const root = document.getElementById('locationIndex');
  if (!root) return;

  const imageUrls = new Map();
  let municipalities = [];
  let lastSignature = '';
  let searchTerm = '';

  const style = document.createElement('style');
  style.textContent = `
    .location-index-section{position:relative;overflow:hidden;margin:22px 0 28px;padding:clamp(18px,4vw,30px);border:1px solid rgba(229,185,121,.24);border-radius:20px;background:radial-gradient(ellipse at top left,rgba(229,185,121,.08),transparent 52%),#17252a}
    .location-index-section:before{content:'';position:absolute;inset:0 auto 0 0;width:3px;background:linear-gradient(180deg,#e5b979,#b7d5c8,transparent)}
    .location-index-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:18px}
    .location-index-kicker{display:flex;align-items:center;gap:8px;margin:0 0 8px;color:#e5b979;font-size:9px;font-weight:800;letter-spacing:.2em;text-transform:uppercase}
    .location-index-kicker:before{content:'✳';font-size:13px}
    .location-index-section h3{margin:0;color:#f3f0e8;font:400 clamp(24px,4vw,34px)/1.08 Georgia,serif;letter-spacing:-.025em}
    .location-index-intro{max-width:440px;margin:8px 0 0;color:#a6b3b4;font-size:12px;line-height:1.55}
    .location-index-total{flex:none;padding:8px 11px;border:1px solid rgba(229,185,121,.24);border-radius:999px;color:#f0d7ad;font-size:10px;font-weight:700;letter-spacing:.06em}
    .location-index-tools{display:flex;align-items:center;gap:12px;margin:0 0 13px}
    .location-index-search{width:100%;min-width:0;padding:11px 14px;border:1px solid rgba(255,255,255,.12);border-radius:10px;outline:none;background:rgba(8,17,21,.48);color:#f3f0e8;font:12px system-ui,sans-serif}
    .location-index-search::placeholder{color:#819092}.location-index-search:focus{border-color:#b7d5c8;box-shadow:0 0 0 3px rgba(183,213,200,.1)}
    .location-index{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:11px}
    .location-folder{min-width:0;overflow:hidden;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:linear-gradient(135deg,rgba(255,255,255,.055),rgba(255,255,255,.018));transition:transform .2s,border-color .2s}
    .location-folder:hover{transform:translateY(-2px);border-color:rgba(229,185,121,.35)}
    .location-folder summary{display:flex;align-items:center;gap:12px;min-height:84px;padding:12px;cursor:pointer;list-style:none}.location-folder summary::-webkit-details-marker{display:none}
    .location-folder-preview{display:flex;flex:none;align-items:center;padding-left:7px}.location-folder-preview img{width:45px;height:53px;margin-left:-7px;border:2px solid #1b2b30;border-radius:8px;object-fit:cover;background:#314348;box-shadow:0 3px 8px #0005}
    .location-folder-preview img:nth-child(2){transform:rotate(5deg)}.location-folder-preview img:nth-child(3){transform:rotate(-5deg)}
    .location-folder-copy{display:grid;gap:5px;flex:1;min-width:0}.location-folder-name{overflow:hidden;color:#f3f0e8;font:400 18px/1.15 Georgia,serif;text-overflow:ellipsis;white-space:nowrap}
    .location-folder-meta{color:#99a9a8;font-size:10px;letter-spacing:.08em;text-transform:uppercase}.location-folder-count{display:grid;place-items:center;flex:none;min-width:30px;height:30px;padding:0 7px;border:1px solid rgba(229,185,121,.25);border-radius:50px;color:#ebc98e;font-size:10px}
    .location-folder-chevron{flex:none;color:#b7d5c8;font-size:17px;transition:transform .2s}.location-folder[open] .location-folder-chevron{transform:rotate(180deg)}
    .location-folder-photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:9px;padding:0 12px 13px;animation:locationReveal .24s ease both}
    .location-photo{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#101a20;transition:transform .2s}.location-photo:hover{transform:scale(1.025)}
    .location-photo img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:#26383d}.location-photo span{display:block;overflow:hidden;padding:7px;color:#dfe4df;font-size:10px;text-overflow:ellipsis;white-space:nowrap}
    .location-photo-delete{position:absolute;top:6px;right:6px;display:grid;place-items:center;width:30px;height:30px;padding:0;border:1px solid rgba(255,255,255,.35);border-radius:50%;background:rgba(25,38,42,.92);color:#fff;font-size:17px;line-height:1;cursor:pointer;box-shadow:0 2px 8px #0007}
    .location-photo-delete:hover,.location-photo-delete:focus-visible{border-color:#e7a69a;background:#8c4b42;outline:none}
    .location-index-empty{grid-column:1/-1;margin:0;padding:20px;border:1px dashed rgba(183,213,200,.24);border-radius:12px;color:#a6b3b4;font-size:12px;line-height:1.6;text-align:center}
    @keyframes locationReveal{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
    @media(max-width:560px){.location-index-heading{align-items:flex-start}.location-index-total{font-size:9px}.location-index-section{border-radius:16px}.location-index{grid-template-columns:1fr}}
    @media(prefers-reduced-motion:reduce){.location-folder,.location-photo,.location-folder-chevron{transition:none}.location-folder-photos{animation:none}}
  `;
  document.head.appendChild(style);

  const section = root.closest('.location-index-section');
  if (section) {
    const oldHeading = section.querySelector('h3');
    const oldIntro = section.querySelector(':scope > p');
    const heading = document.createElement('div');
    heading.className = 'location-index-heading';
    const copy = document.createElement('div');
    const kicker = document.createElement('p');
    kicker.className = 'location-index-kicker';
    kicker.textContent = 'O teu arquivo, por lugares';
    if (oldHeading) oldHeading.textContent = 'Índice alfabético de locais';
    if (oldIntro) {
      oldIntro.className = 'location-index-intro';
      oldIntro.textContent = 'As fotografias aparecem no mapa e aqui, organizadas por local.';
    }
    const total = document.createElement('span');
    total.className = 'location-index-total';
    total.textContent = '0 LOCAIS';
    if (oldHeading) copy.append(kicker, oldHeading);
    if (oldIntro) copy.append(oldIntro);
    heading.append(copy, total);
    section.insertBefore(heading, root);
    const tools = document.createElement('div');
    tools.className = 'location-index-tools';
    const search = document.createElement('input');
    search.className = 'location-index-search';
    search.type = 'search';
    search.placeholder = '⌕   Procurar um lugar ou uma fotografia';
    search.setAttribute('aria-label', 'Procurar no índice de locais');
    search.addEventListener('input', () => { searchTerm = search.value.trim().toLocaleLowerCase('pt'); renderIndex(true); });
    tools.append(search);
    section.insertBefore(tools, root);
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
  async function deleteMemory(id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  function municipalityName(lat, lng) {
    if (!window.turf || !municipalities.length) return '';
    const point = window.turf.point([lng, lat]);
    const feature = municipalities.find(item => { try { return window.turf.booleanPointInPolygon(point, item); } catch (_) { return false; } });
    const props = feature?.properties || {};
    return props.municipio || props.MUNICIPIO || props.nome || props.NOME || props.name || '';
  }
  function folderName(memory) {
    const explicit = String(memory.locationName || '').trim();
    if (explicit && explicit !== 'Local indicado no mapa') return explicit.split(',')[0].trim();
    if (Number.isFinite(memory.lat) && Number.isFinite(memory.lng)) return municipalityName(memory.lat, memory.lng) || explicit || 'Outros locais';
    return explicit || 'Outros locais';
  }
  function getImageUrl(memory) {
    if (imageUrls.has(memory.id)) return imageUrls.get(memory.id);
    const url = memory.blob instanceof Blob ? URL.createObjectURL(memory.blob) : (memory.image || '');
    imageUrls.set(memory.id, url);
    return url;
  }
  function photoCard(memory) {
    const card = document.createElement('article');
    card.className = 'location-photo';
    const image = document.createElement('img');
    image.alt = memory.name || 'Fotografia';
    image.loading = 'lazy';
    image.src = getImageUrl(memory);
    const title = document.createElement('span');
    title.textContent = memory.name || 'Fotografia';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'location-photo-delete';
    remove.textContent = '×';
    remove.title = `Apagar ${memory.name || 'fotografia'}`;
    remove.setAttribute('aria-label', `Apagar ${memory.name || 'fotografia'}`);
    remove.addEventListener('click', async event => {
      event.stopPropagation();
      if (!confirm(`Queres apagar a fotografia "${memory.name || 'sem nome'}"?`)) return;
      try {
        await deleteMemory(memory.id);
        const url = imageUrls.get(memory.id);
        if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
        imageUrls.delete(memory.id);
        await renderIndex(true);
        window.dispatchEvent(new Event('retalhos-data-changed'));
      } catch (error) {
        console.error('Não foi possível apagar a fotografia:', error);
        alert('Não foi possível apagar esta fotografia.');
      }
    });

    card.append(image, remove, title);
    return card;
  }
  function makePreview(photos) {
    const preview = document.createElement('span');
    preview.className = 'location-folder-preview';
    photos.slice(0, 3).forEach(photo => {
      const image = document.createElement('img');
      image.alt = '';
      image.loading = 'lazy';
      image.src = getImageUrl(photo);
      preview.appendChild(image);
    });
    return preview;
  }
  async function renderIndex(force = false) {
    try {
      const memories = await getMemories();
      const located = memories.filter(memory => Number.isFinite(memory.lat) && Number.isFinite(memory.lng));
      const signature = located.map(memory => `${memory.id}:${memory.lat}:${memory.lng}:${memory.locationName || ''}`).sort().join('|');
      if (!force && signature === lastSignature) return;
      lastSignature = signature;
      const groups = new Map();
      located.forEach(memory => {
        const name = folderName(memory);
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(memory);
      });
      const total = section?.querySelector('.location-index-total');
      if (total) total.textContent = `${groups.size} ${groups.size === 1 ? 'LOCAL' : 'LOCAIS'}`;
      root.replaceChildren();
      const entries = [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'pt', { sensitivity: 'base' }))
        .filter(([name, photos]) => !searchTerm || name.toLocaleLowerCase('pt').includes(searchTerm) || photos.some(photo => String(photo.name || '').toLocaleLowerCase('pt').includes(searchTerm)));
      if (!entries.length) {
        const empty = document.createElement('p');
        empty.className = 'location-index-empty';
        empty.textContent = searchTerm ? 'Não encontrei esse local ou fotografia. Experimenta outra pesquisa.' : 'Quando localizares as primeiras fotografias, cada lugar ganha aqui a sua própria coleção.';
        root.appendChild(empty);
        return;
      }
      entries.forEach(([name, photos]) => {
        photos.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt', { sensitivity: 'base' }));
        const folder = document.createElement('details');
        folder.className = 'location-folder';
        const summary = document.createElement('summary');
        summary.appendChild(makePreview(photos));
        const copy = document.createElement('span');
        copy.className = 'location-folder-copy';
        const title = document.createElement('span');
        title.className = 'location-folder-name';
        title.textContent = name;
        const meta = document.createElement('span');
        meta.className = 'location-folder-meta';
        meta.textContent = `${photos.length} ${photos.length === 1 ? 'memória' : 'memórias'} · ver coleção`;
        copy.append(title, meta);
        const count = document.createElement('span');
        count.className = 'location-folder-count';
        count.textContent = String(photos.length);
        count.setAttribute('aria-label', `${photos.length} fotografias`);
        const chevron = document.createElement('span');
        chevron.className = 'location-folder-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = '⌄';
        summary.append(copy, count, chevron);
        const contents = document.createElement('div');
        contents.className = 'location-folder-photos';
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
    } catch (error) { console.warn('Não foi possível carregar os nomes dos municípios para o índice.', error); }
    renderIndex(true);
    window.addEventListener('retalhos-data-changed', () => renderIndex(true));
    window.setInterval(() => renderIndex(), 1800);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
