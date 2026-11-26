(() => {
  'use strict';

  const DB_NAME = 'retalhos-db';
  const DB_VERSION = 2;
  const STORE = 'memories';
  const MUNICIPALITIES_URL = 'https://ogcapi.dgterritorio.gov.pt/collections/municipios/items?f=json&limit=500&crs=http://www.opengis.net/def/crs/OGC/1.3/CRS84';

  let municipalities = [];
  let memories = [];
  let redrawFrame = null;
  let refreshTimer = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readMemories() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng)));
      request.onerror = () => reject(request.error);
    });
  }

  async function loadMunicipalities() {
    const response = await fetch(MUNICIPALITIES_URL, { headers: { Accept: 'application/geo+json' } });
    if (!response.ok) throw new Error(`DGT respondeu com ${response.status}`);
    const data = await response.json();
    municipalities = data.features?.filter(feature => feature.geometry && feature.properties) || [];
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

  function groupByLocation(items) {
    const groups = new Map();
    items.forEach(item => {
      const key = `${item.lat.toFixed(5)},${item.lng.toFixed(5)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    return [...groups.values()];
  }

  function getObjectUrl(item) {
    if (item.blob instanceof Blob) {
      if (!item.__retalhosUrl) item.__retalhosUrl = URL.createObjectURL(item.blob);
      return item.__retalhosUrl;
    }
    return item.image || '';
  }

  function polygonPath(geometry, map) {
    const paths = [];
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : (geometry.coordinates || []);
    polygons.forEach(rings => {
      rings.forEach(ring => {
        const points = ring.map(([lng, lat]) => {
          const point = map.latLngToContainerPoint([lat, lng]);
          return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
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
    pattern.setAttribute('width', '1');
    pattern.setAttribute('height', '1');

    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('href', getObjectUrl(item));
    image.setAttribute('x', '0');
    image.setAttribute('y', '0');
    image.setAttribute('width', '1');
    image.setAttribute('height', '1');
    image.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    pattern.append(image);
    defs.append(pattern);
  }

  function splitMunicipality(municipality, locationGroups) {
    if (!locationGroups.length) return [];
    if (locationGroups.length === 1) {
      return [{ geometry: municipality.geometry, items: locationGroups[0] }];
    }

    const points = locationGroups.map(group => turf.point([group[0].lng, group[0].lat]));
    const cells = turf.voronoi(turf.featureCollection(points), { bbox: turf.bbox(municipality) });
    const result = [];

    if (!cells?.features) return result;
    cells.features.forEach((cell, index) => {
      if (!cell || !locationGroups[index]) return;
      try {
        const clipped = turf.intersect(turf.featureCollection([municipality, cell]));
        if (clipped?.geometry) result.push({ geometry: clipped.geometry, items: locationGroups[index] });
      } catch (_) {}
    });
    return result;
  }

  function addPhotoCloseup(svg, defs, map, item, patternIndex, zoom) {
    const containerPoint = map.latLngToContainerPoint([item.lat, item.lng]);
    if (!map.getBounds().contains([item.lat, item.lng])) return patternIndex;

    const size = zoom >= 12 ? 54 : zoom >= 10 ? 42 : 32;
    const patternId = `retalho-closeup-${patternIndex++}`;
    makePattern(defs, patternId, item);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', containerPoint.x - size / 2);
    rect.setAttribute('y', containerPoint.y - size / 2);
    rect.setAttribute('width', size);
    rect.setAttribute('height', size);
    rect.setAttribute('rx', 7);
    rect.setAttribute('fill', `url(#${patternId})`);
    rect.setAttribute('class', 'retalho-photo-closeup');
    svg.append(rect);
    return patternIndex;
  }

  function draw() {
    const map = window.retalhosMap || window.map;
    const svg = document.querySelector('.retalhos-svg');
    if (!map || !svg || !window.turf) return;

    const size = map.getSize();
    svg.setAttribute('viewBox', `0 0 ${size.x} ${size.y}`);
    svg.setAttribute('width', size.x);
    svg.setAttribute('height', size.y);

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!memories.length) return;

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.append(defs);

    const zoom = map.getZoom();
    const municipalityGroups = new Map();
    let patternIndex = 0;

    memories.forEach(item => {
      const municipality = findMunicipality(item.lat, item.lng);
      if (municipality) {
        if (!municipalityGroups.has(municipality)) municipalityGroups.set(municipality, []);
        municipalityGroups.get(municipality).push(item);
      }
    });

    municipalityGroups.forEach((items, municipality) => {
      const locationGroups = groupByLocation(items);
      const features = zoom < 9
        ? [{ geometry: municipality.geometry, items: locationGroups[0] }]
        : splitMunicipality(municipality, locationGroups);

      features.forEach(feature => {
        if (!feature.items?.length) return;
        const patternId = `retalho-map-${patternIndex++}`;
        makePattern(defs, patternId, feature.items[0]);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', polygonPath(feature.geometry, map));
        path.setAttribute('fill', `url(#${patternId})`);
        path.setAttribute('fill-rule', 'evenodd');
        path.setAttribute('class', 'retalho-shape retalho-progressive');
        path.style.pointerEvents = 'visiblePainted';
        svg.append(path);
      });

      if (zoom >= 12) {
        locationGroups.forEach(group => {
          patternIndex = addPhotoCloseup(svg, defs, map, group[0], patternIndex, zoom);
        });
      }
    });

    if (zoom >= 8) {
      memories.forEach(item => {
        if (!findMunicipality(item.lat, item.lng)) {
          patternIndex = addPhotoCloseup(svg, defs, map, item, patternIndex, zoom);
        }
      });
    }
  }

  function scheduleDraw() {
    if (redrawFrame) cancelAnimationFrame(redrawFrame);
    redrawFrame = requestAnimationFrame(() => {
      redrawFrame = null;
      draw();
    });
  }

  async function setup() {
    const map = window.retalhosMap || window.map;
    if (!map) {
      setTimeout(setup, 100);
      return;
    }

    if (!map.__retalhosProgressive) {
      map.__retalhosProgressive = true;
      map.on('move zoom zoomend moveend resize', scheduleDraw);
    }

    if (!municipalities.length) {
      try { await loadMunicipalities(); } catch (_) {}
    }

    try { memories = await readMemories(); } catch (_) {}
    scheduleDraw();

    if (!refreshTimer) {
      refreshTimer = setInterval(async () => {
        try {
          memories = await readMemories();
          scheduleDraw();
        } catch (_) {}
      }, 2500);
    }
  }

  const originalMapFactory = window.L?.map;
  if (originalMapFactory) {
    window.L.map = function (...args) {
      const instance = originalMapFactory.apply(this, args);
      window.retalhosMap = instance;
      setTimeout(setup, 0);
      return instance;
    };
  }

  setup();
})();
