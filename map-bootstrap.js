(() => {
  'use strict';

  const DB_NAME = 'retalhos-db';
  const DB_VERSION = 2;
  const STORE = 'memories';
  const mapElement = document.getElementById('map');
  const photoInput = document.getElementById('photoInput');
  const gallerySection = document.getElementById('memorias');
  const toast = document.getElementById('toast');

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function saveMemory(memory) {
    return openDatabase().then(db => new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(memory);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    }));
  }

  function notify(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 3500);
  }

  function createMap() {
    if (!mapElement || !window.L) {
      notify('Não foi possível carregar o mapa. Verifica a ligação à internet.');
      return;
    }
    if (mapElement._leaflet_id) return;

    const map = window.L.map(mapElement, {
      zoomControl: true,
      scrollWheelZoom: true,
      touchZoom: true,
      doubleClickZoom: true,
      minZoom: 2,
      maxZoom: 18,
      worldCopyJump: true,
      preferCanvas: true
    }).setView([39.6, -8.0], 6.4);

    window.retalhosMap = map;
    window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      minZoom: 2,
      maxZoom: 18,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics and GIS community'
    }).addTo(map);

    window.addEventListener('resize', () => map.invalidateSize({ pan: false }));
    window.setTimeout(() => map.invalidateSize({ pan: false }), 100);
  }

  async function importPhotos(event) {
    const files = [...(event.target.files || [])].filter(file => file.type.startsWith('image/'));
    if (!files.length) return;
    photoInput.disabled = true;
    let imported = 0;
    try {
      for (const file of files) {
        let exif = null;
        try {
          exif = await window.exifr?.parse(file, { gps: true, exif: true });
        } catch (_) { /* Ficheiros sem EXIF são guardados para localização manual. */ }

        const hasGps = Number.isFinite(exif?.latitude) && Number.isFinite(exif?.longitude);
        await saveMemory({
          id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
          name: file.name.replace(/\.[^.]+$/, '') || 'Fotografia',
          blob: file,
          type: file.type,
          lat: hasGps ? exif.latitude : null,
          lng: hasGps ? exif.longitude : null,
          locationSource: hasGps ? 'gps' : 'pending',
          locationName: '',
          takenAt: exif?.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal.getTime() : null,
          created: Date.now()
        });
        imported++;
      }
      window.dispatchEvent(new Event('retalhos-data-changed'));
      notify(`${imported} ${imported === 1 ? 'fotografia importada' : 'fotografias importadas'}.`);
    } catch (error) {
      console.error('Importação de fotografias:', error);
      notify('Não foi possível importar as fotografias. Verifica o espaço disponível.');
      window.dispatchEvent(new Event('retalhos-data-changed'));
    } finally {
      photoInput.disabled = false;
      photoInput.value = '';
    }
  }

  if (gallerySection) gallerySection.hidden = false;
  if (photoInput) photoInput.addEventListener('change', importPhotos);
  createMap();
})();
