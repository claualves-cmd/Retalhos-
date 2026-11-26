(() => {
  'use strict';

  const DB_NAME = 'retalhos-db';
  const DB_VERSION = 2;
  const STORE = 'memories';
  const input = document.getElementById('placeSearch');
  const button = document.getElementById('assignPlace');

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function savePlace(items, lat, lng, displayName) {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);

      items.forEach(item => {
        item.lat = lat;
        item.lng = lng;
        item.locationSource = 'manual';
        item.locationName = displayName;
        store.put(item);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  button.addEventListener('click', async () => {
    const lat = Number(input.dataset.lat);
    const lng = Number(input.dataset.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const ids = [...document.querySelectorAll('.pending-check:checked')].map(el => el.value);
    if (!ids.length) {
      window.dispatchEvent(new CustomEvent('retalhos-toast', { detail: 'Seleciona pelo menos uma fotografia.' }));
      return;
    }

    const db = await openDB();
    const items = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result.filter(item => ids.includes(item.id)));
      request.onerror = () => reject(request.error);
    });

    if (!items.length) return;

    button.disabled = true;
    button.textContent = 'A colocar no mapa…';

    try {
      await savePlace(items, lat, lng, input.dataset.displayName || input.dataset.name || input.value);
      location.reload();
    } catch (_) {
      button.disabled = false;
      button.textContent = 'Confirmar local e colocar fotografias';
      alert('Não foi possível guardar o local. Verifica o espaço disponível no dispositivo.');
    }
  });
})();
