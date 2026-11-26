(() => {
  'use strict';
  // Retalhos are always rendered as circular photo markers by app-controls.js.
  // Keep the previous polygon overlay disabled so old cached/app code cannot paint municipalities.
  const style = document.createElement('style');
  style.textContent = '.leaflet-overlay-pane .retalhos-svg,#map .retalhos-photo-overlay{display:none!important}';
  document.head.appendChild(style);
})();
