(() => {
  'use strict';

  const DB_NAME = 'retalhos-db';
  const STORE = 'memories';
  const MUNICIPALITIES_URL = 'https://ogcapi.dgterritorio.gov.pt/collections/municipios/items?f=json&limit=500&crs=http://www.opengis.net/def/crs/OGC/1.3/CRS84';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const imageUrls = new Map();
  let map = null;
  let svg = null;
  let municipalities = [];
  let lastSignature = '';
  let timer = null;

  function imageUrl(item) {
    if (imageUrls.has(item.id)) return imageUrls.get(item.id);
    const url = item.blob instanceof Blob ? URL.createObjectURL(item.blob) : (item.image || '');
    imageUrls.set(item.id, url);
    return url;
  }
  function createSvgElement(tag) { return document.createElementNS(SVG_NS, tag); }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function pointInMunicipality(lat, lng, feature) {
    if (!window.turf) return false;
    try { return window.turf.booleanPointInPolygon(window.turf.point([lng, lat]), feature); } catch (_) { return false; }
  }
  function groupByPoint(items) {
    const groups = new Map();
    for (const item of items) {
      const key = `${item.lat.toFixed(6)},${item.lng.toFixed(6)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return [...groups.values()];
  }
  function geometryPath(geometry) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    const paths = [];
    for (const rings of polygons) for (const ring of rings) {
      const points = ring.map(([lng, lat]) => {
        const point = map.latLngToContainerPoint([lat, lng]);
        return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
      });
      if (points.length) paths.push(`M${points.join(' L')} Z`);
    }
    return paths.join(' ');
  }
  function addImagePattern(defs, id, item) {
    const pattern = createSvgElement('pattern');
    pattern.setAttribute('id', id);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    const bounds = map.getBounds();
    const northWest = map.latLngToContainerPoint(bounds.getNorthWest());
    const southEast = map.latLngToContainerPoint(bounds.getSouthEast());
    pattern.setAttribute('x', Math.min(northWest.x, southEast.x));
    pattern.setAttribute('y', Math.min(northWest.y, southEast.y));
    pattern.setAttribute('width', Math.max(1, Math.abs(southEast.x - northWest.x)));
    pattern.setAttribute('height', Math.max(1, Math.abs(southEast.y - northWest.y)));
    const image = createSvgElement('image');
    image.setAttribute('href', imageUrl(item));
    image.setAttribute('x', pattern.getAttribute('x'));
    image.setAttribute('y', pattern.getAttribute('y'));
    image.setAttribute('width', pattern.getAttribute('width'));
    image.setAttribute('height', pattern.getAttribute('height'));
    image.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    pattern.appendChild(image);
    defs.appendChild(pattern);
  }
  function popupHtml(items) {
    return items.map(item => `<div style="width:180px;margin-bottom:8px"><img src="${imageUrl(item).replace(/"/g, '&quot;')}" alt="${escapeHtml(item.name)}" style="display:block;width:100%;height:120px;object-fit:cover;border-radius:6px;margin-bottom:6px"><strong>${escapeHtml(item.name || 'Fotografia')}</strong>${item.locationName ? `<small style="display:block">${escapeHtml(item.locationName.split(',')[0].trim())}</small>` : ''}</div>`).join('');
  }
  function makeRetalho(defs, feature, items, index) {
    if (!feature?.geometry || !items?.length) return;
    const patternId = `retalho-image-${index}`;
    addImagePattern(defs, patternId, items[0]);
    const path = createSvgElement('path');
    path.setAttribute('d', geometryPath(feature.geometry));
    path.setAttribute('fill', `url(#${patternId})`);
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('stroke', 'rgba(255,255,255,.8)');
    path.setAttribute('stroke-width', '1');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    path.style.pointerEvents = 'visiblePainted';
    path.addEventListener('click', event => {
      event.stopPropagation();
      const point = items[0];
      window.L.popup({ maxWidth: 230, autoPan: true }).setLatLng([point.lat, point.lng])
        .setContent(`<div class="photo-popup">${popupHtml(items)}</div>`).openOn(map);
    });
    svg.appendChild(path);
  }
  function redraw(items) {
    if (!map || !svg) return;
    const size = map.getSize();
    svg.setAttribute('viewBox', `0 0 ${size.x} ${size.y}`);
    svg.setAttribute('width', size.x);
    svg.setAttribute('height', size.y);
    svg.replaceChildren();
    if (!window.turf || !municipalities.length || !items.length) return;
    const byMunicipality = new Map();
    for (const item of items) {
      const municipality = municipalities.find(feature => pointInMunicipality(item.lat, item.lng, feature));
      if (municipality) {
        if (!byMunicipality.has(municipality)) byMunicipality.set(municipality, []);
        byMunicipality.get(municipality).push(item);
      }
    }
    const defs = createSvgElement('defs');
    svg.appendChild(defs);
    let index = 0;
    for (const [municipality, photos] of byMunicipality) {
      const groups = groupByPoint(photos);
      if (groups.length === 1) { makeRetalho(defs, municipality, groups[0], index++); continue; }
      try {
        const points = groups.map(group => window.turf.point([group[0].lng, group[0].lat]));
        const cells = window.turf.voronoi(window.turf.featureCollection(points), { bbox: window.turf.bbox(municipality) });
        for (let i = 0; i < (cells?.features?.length || 0); i++) {
          const cell = cells.features[i];
          if (!cell) continue;
          try {
            const clipped = window.turf.intersect(window.turf.featureCollection([cell, municipality]));
            if (clipped?.geometry) makeRetalho(defs, clipped, groups[i], index++);
          } catch (error) { console.warn('Não foi possível recortar o retalho municipal:', error); }
        }
      } catch (error) {
        console.warn('Não foi possível dividir o município em retalhos:', error);
        makeRetalho(defs, municipality, photos, index++);
      }
    }
  }
  function currentYear() { return document.getElementById('yearFilter')?.value || 'all'; }
  function scheduleRedraw() {
    if (timer) cancelAnimationFrame(timer);
    timer = requestAnimationFrame(() => { timer = null; readMemories(); });
  }
  function readDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).then(db => new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
  }
  async function readMemories(force = false) {
    if (!map || !svg) return;
    const all = await readDatabase();
    const year = currentYear();
    const located = all.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng) && item.lat >= -90 && item.lat <= 90 && item.lng >= -180 && item.lng <= 180 &&
      (year === 'all' || (item.takenAt && new Date(item.takenAt).getFullYear() === Number(year))));
    const signature = `${year}|${located.map(item => `${item.id}:${item.lat}:${item.lng}:${item.locationName || ''}`).sort().join('|')}`;
    if (!force && signature === lastSignature) return;
    lastSignature = signature;
    redraw(located);
  }
  async function loadMunicipalities() {
    const response = await fetch(MUNICIPALITIES_URL, { headers: { Accept: 'application/geo+json' } });
    if (!response.ok) throw new Error(`DGT HTTP ${response.status}`);
    const data = await response.json();
    municipalities = (data.features || []).filter(feature => feature.geometry);
    if (!municipalities.length) throw new Error('DGT não devolveu polígonos municipais.');
    await readMemories(true);
  }
  if (window.L) {
    const originalMap = window.L.map;
    window.L.map = function (...args) {
      map = originalMap.apply(this, args);
      svg = createSvgElement('svg');
      svg.classList.add('retalhos-photo-overlay');
      Object.assign(svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '450', pointerEvents: 'none' });
      map.getContainer().appendChild(svg);
      map.on('moveend zoomend resize', scheduleRedraw);
      window.retalhosMap = map;
      return map;
    };
  }
  window.addEventListener('retalhos-data-changed', () => readMemories(true));
  window.addEventListener('load', () => {
    loadMunicipalities().catch(error => console.error('Retalhos municipais:', error));
    readMemories(true).catch(error => console.error('Memórias do mapa:', error));
  });
})();
