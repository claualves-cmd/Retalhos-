(() => {
  'use strict';

  const input = document.getElementById('placeSearch');
  const results = document.getElementById('placeResults');
  const assignButton = document.getElementById('assignPlace');
  const mapHint = document.getElementById('mapHint');
  let timer = null;

  function setInstructions() {
    const pending = document.querySelectorAll('.pending-check').length;
    if (pending) {
      mapHint.textContent = 'Escreve o nome do local. Não precisas tocar no mapa.';
    }
  }

  function setCardButtons() {
    document.querySelectorAll('.pending-card').forEach(card => {
      const checkbox = card.querySelector('.pending-check');
      const button = card.querySelector('button');
      if (!checkbox || !button) return;
      button.textContent = 'Selecionar para localizar';
      button.addEventListener('click', () => {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        document.querySelector('.place-search')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        input.focus({ preventScroll: true });
      });
    });
  }

  async function searchLive() {
    const query = input.value.trim();
    results.innerHTML = '';
    if (query.length < 3) {
      results.textContent = 'Escreve pelo menos três letras para procurar.';
      assignButton.disabled = true;
      return;
    }

    results.textContent = 'A procurar lugares…';
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&addressdetails=1&q=${encodeURIComponent(query)}`, {
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error('Pesquisa indisponível');
      const places = await response.json();
      results.innerHTML = '';
      if (!places.length) {
        results.textContent = 'Não encontramos esse local. Experimenta acrescentar o país ou o concelho.';
        return;
      }

      places.forEach(place => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'place-result location-suggestion';

        const title = document.createElement('strong');
        title.textContent = place.name || place.display_name.split(',')[0];
        const detail = document.createElement('small');
        detail.textContent = place.display_name;
        button.append(title, detail);

        button.addEventListener('click', () => {
          [...results.querySelectorAll('.place-result')].forEach(item => item.classList.remove('selected'));
          button.classList.add('selected');

          input.value = place.display_name;
          input.dataset.lat = place.lat;
          input.dataset.lng = place.lon;
          input.dataset.displayName = place.display_name;
          input.dataset.name = place.name || place.display_name.split(',')[0];

          assignButton.disabled = !document.querySelector('.pending-check:checked');
          assignButton.textContent = 'Confirmar local e colocar fotografias';
          assignButton.classList.add('confirm-location');
          mapHint.textContent = `Local escolhido: ${place.display_name}`;
        });
        results.append(button);
      });
    } catch (_) {
      results.textContent = 'Não foi possível pesquisar agora. Verifica a ligação à internet.';
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    assignButton.disabled = true;
    assignButton.textContent = 'Atribuir local às selecionadas';
    delete input.dataset.lat;
    delete input.dataset.lng;
    delete input.dataset.displayName;
    timer = setTimeout(searchLive, 350);
  });

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      clearTimeout(timer);
      searchLive();
    }
  });

  document.getElementById('searchPlace')?.addEventListener('click', () => {
    clearTimeout(timer);
    searchLive();
  });

  assignButton.addEventListener('click', () => {
    if (!input.dataset.lat || !input.dataset.lng) {
      assignButton.disabled = true;
    }
  });

  const observer = new MutationObserver(() => {
    setCardButtons();
    setInstructions();
  });
  observer.observe(document.getElementById('pendingList'), { childList: true, subtree: true });

  setCardButtons();
  setInstructions();
})();
