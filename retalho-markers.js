(() => {
  'use strict';

  const DB_NAME = 'retalhos-db';
  const STORE = 'memories';
  const MUNICIPALITIES_URL = 'https://ogcapi.dgterritorio.gov.pt/collections/municipios/items?f=json&limit=500&crs=http://www.opengis.net/def/crs/OGC/1.3/CRS84';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const imageUrls = new Map();
  let map = null, svg = null, municipalities = [], lastSignature = '', timer = null;
  function imageUrl(item) {
    if (imageUrls.has(item.id)) return imageUrls.get(item.id);
    const url = item.blob instanceof Blob ? URL.createObjectURL(item.blob) : (item.image || '');
    imageUrls.set(item.id, url);
    return url;
  }
  function el(tag) { return document.createElementNS(SVG_NS, tag); }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function inFeature(lat, lng, feature) {
    try { return window.turf.booleanPointInPolygon(window.turf.point([lng, lat]), feature); } catch (_) { return false; }
  }
  function groupByPoint(items) {
    const groups = new Map();
    items.forEach(item => {
      const key = `${item.lat.toFixed(6)},${item.lng.toFixed(6)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    return [...groups.values()];
  }
  function geometryPath(geometry) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    return polygons.flatMap(rings => rings.map(ring => {
      const points = ring.map(([lng, lat]) => {
        const p = map.latLngToContainerPoint([lat, lng]);
        return `${p.x},${p.y}`;
      });
      return points.length ? `M${points.join(' L')} Z` : '';
    })).filter(Boolean).join(' ');
  }
  function addImagePattern(defs, id, item) {
    const pattern = el('pattern');
    pattern.setAttribute('id', id);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    const bounds = map.getBounds();
    const nw = map.latLngToContainerPoint(bounds.getNorthWest());
    const se = map.latLngToContainerPoint(bounds.getSouthEast());
    const x = Math.min(nw.x, se.x), y = Math.min(nw.y, se.y);
    const width = Math.max(1, Math.abs(se.x - nw.x)), height = Math.max(1, Math.abs(se.y - nw.y));
    pattern.setAttribute('x', x); pattern.setAttribute('y', y);
    pattern.setAttribute('width', width); pattern.setAttribute('height', height);
    const image = el('image');
    image.setAttribute('href', imageUrl(item));
    image.setAttribute('x', x); image.setAttribute('y', y);
    image.setAttribute('width', width); image.setAttribute('height', height);
    image.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    pattern.appendChild(image); defs.appendChild(pattern);
  }
  function popupHtml(items) {
    return items.map(item => `<div style="width:180px;margin-bottom:8px"><img src="${imageUrl(item).replace(/"/g, '&quot;')}" alt="${escapeHtml(item.name)}" style="display:block;width:100%;height:120px;object-fit:cover;border-radius:6px;margin-bottom:6px"><strong>${escapeHtml(item.name || 'Fotografia')}</strong>${item.locationName ? `<small style="display:block">${escapeHtml(item.locationName.split(',')[0].trim())}</small>` : ''}</div>`).join('');
  }
  function makeRetalho(defs, feature, items, index) {
    if (!feature?.geometry || !items?.length) return false;
    const pathData = geometryPath(feature.geometry);
    if (!pathData) return false;
    const patternId = `retalho-image-${index}`;
    addImagePattern(defs, patternId, items[0]);
    const path = el('path');
    path.setAttribute('d', pathData);
    path.setAttribute('fill', `url(#${patternId})`);
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('stroke', 'rgba(255,255,255,.9)');
    path.setAttribute('stroke-width', '1');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    path.style.pointerEvents = 'visiblePainted';
    path.addEventListener('click', event => {
      event.stopPropagation();
      const item = items[0];
      window.L.popup({ maxWidth: 230, autoPan: true }).setLatLng([item.lat, item.lng])
        .setContent(`<div class="photo-popup">${popupHtml(items)}</div>`).openOn(map);
    });
    svg.appendChild(path);
    return true;
  }
  function addPointRetalho(defs, group, index) {
    const item = group[0];
    const point = map.latLngToContainerPoint([item.lat, item.lng]);
    const size = Math.max(20, Math.min(42, 30 + Math.log2(group.length) * 4));
    const patternId = `retalho-point-${index}`;
    const pattern = el('pattern');
    pattern.setAttribute('id', patternId); pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('x', point.x - size / 2); pattern.setAttribute('y', point.y - size / 2);
    pattern.setAttribute('width', size); pattern.setAttribute('height', size);
    const image = el('image');
    image.setAttribute('href', imageUrl(item));
    image.setAttribute('x', point.x - size / 2); image.setAttribute('y', point.y - size / 2);
    image.setAttribute('width', size); image.setAttribute('height', size);
    image.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    pattern.appendChild(image); defs.appendChild(pattern);
    const circle = el('circle');
    circle.setAttribute('cx', point.x); circle.setAttribute('cy', point.y); circle.setAttribute('r', size / 2);
    circle.setAttribute('fill', `url(#${patternId})`); circle.setAttribute('stroke', '#fff'); circle.setAttribute('stroke-width', '2');
    circle.style.pointerEvents = 'visiblePainted';
    circle.addEventListener('click', event => {
      event.stopPropagation();
      window.L.popup({ maxWidth: 230, autoPan: true }).setLatLng([item.lat, item.lng])
        .setContent(`<div class="photo-popup">${popupHtml(group)}</div>`).openOn(map);
    });
    svg.appendChild(circle);
  }
  function currentYear() { return document.getElementById('yearFilter')?.value || 'all'; }
  async function readDatabase() {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 2);
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
  }
  function redraw(items) {
    if (!map || !svg) return;
    const size = map.getSize();
    svg.setAttribute('viewBox', `0 0 ${size.x} ${size.y}`);
    svg.setAttribute('width', size.x); svg.setAttribute('height', size.y);
    svg.replaceChildren();
    if (!items.length) return;
    const defs = el('defs'); svg.appendChild(defs);
    const groupsByMunicipality = new Map();
    const noBoundary = [];
    items.forEach(item => {
      const municipality = window.turf && municipalities.find(feature => inFeature(item.lat, item.lng, feature));
      if (!municipality) { noBoundary.push(item); return; }
      if (!groupsByMunicipality.has(municipality)) groupsByMunicipality.set(municipality, []);
      groupsByMunicipality.get(municipality).push(item);
    });
    let index = 0;
    for (const [municipality, photos] of groupsByMunicipality) {
      const groups = groupByPoint(photos);
      if (groups.length === 1) {
        if (!makeRetalho(defs, municipality, groups[0], index++)) addPointRetalho(defs, groups[0], index++);
        continue;
      }
      const rendered = new Set();
      try {
        const points = groups.map(group => window.turf.point([group[0].lng, group[0].lat]));
        const cells = window.turf.voronoi(window.turf.featureCollection(points), { bbox: window.turf.bbox(municipality) });
        (cells?.features || []).forEach((cell, cellIndex) => {
          if (!cell) return;
          try {
            const clipped = window.turf.intersect(window.turf.featureCollection([cell, municipality]));
            if (clipped?.geometry && makeRetalho(defs, clipped, groups[cellIndex], index++)) rendered.add(cellIndex);
          } catch (error) { console.warn('Retalho Voronoi:', error); }
        });
      } catch (error) { console.warn('Divisão Voronoi indisponível:', error); }
      groups.forEach((group, groupIndex) => { if (!rendered.has(groupIndex)) addPointRetalho(defs, group, index++); });
    }
    groupByPoint(noBoundary).forEach(group => addPointRetalho(defs, group, index++));
  }
  async function readMemories(force = false) {
    if (!map || !svg) return;
    const year = currentYear();
    const items = (await readDatabase()).filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng) && item.lat >= -90 && item.lat <= 90 && item.lng >= -180 && item.lng <= 180 &&
      (year === 'all' || (item.takenAt && new Date(item.takenAt).getFullYear() === Number(year))));
    const signature = `${year}|${items.map(item => `${item.id}:${item.lat}:${item.lng}:${item.locationName || ''}`).sort().join('|')}`;
    if (!force && signature === lastSignature) return;
    lastSignature = signature;
    redraw(items);
  }
  function scheduleRedraw() {
    if (timer) cancelAnimationFrame(timer);
    timer = requestAnimationFrame(() => { timer = null; readMemories(); });
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
      svg = el('svg');
      svg.classList.add('retalhos-photo-overlay');
      Object.assign(svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '450', pointerEvents: 'none', overflow: 'hidden' });
      map.getContainer().appendChild(svg);
      map.on('moveend zoomend resize', scheduleRedraw);
      window.retalhosMap = map;
      return map;
    };
  }
  window.addEventListener('retalhos-data-changed', () => readMemories(true));
  window.addEventListener('retalhos-year-changed', () => readMemories(true));
  window.addEventListener('load', () => {
    // app.js still owns a legacy SVG overlay; prevent it from painting a second layer over the retalhos.
    const legacyStyle = document.createElement('style');
    legacyStyle.textContent = '.leaflet-overlay-pane .retalhos-svg{display:none!important}';
    document.head.appendChild(legacyStyle);
    loadMunicipalities().catch(error => console.error('Retalhos municipais:', error));
    readMemories(true).catch(error => console.error('Memórias do mapa:', error));
  });
})();
