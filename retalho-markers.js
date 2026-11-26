(() => {
  'use strict';
  // Retalhos are rendered as zoom-aware photo stacks by app-enhancements.js.
  // Disable the legacy municipality overlay while keeping compatibility with cached app code.
  const style = document.createElement('style');
  style.textContent = '.leaflet-overlay-pane .retalhos-svg,#map .retalhos-photo-overlay{display:none!important}';
  document.head.appendChild(style);

  const loadEnhancements = () => {
    if (document.querySelector('script[data-retalhos-enhancements]')) return;
    const script = document.createElement('script');
    script.src = './app-enhancements.js?v=1';
    script.dataset.retalhosEnhancements = 'true';
    script.defer = true;
    document.head.appendChild(script);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadEnhancements, { once: true });
  } else {
    loadEnhancements();
  }
})();
