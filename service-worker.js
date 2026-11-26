const CACHE_NAME='retalhos-shell-v12';
const APP_SHELL=['./','./index.html','./estilos.css','./recursos.css','./app.js','./retalhos-recursos.js','./retalho-markers.js','./location-index.js','./manifest.json','./icon-192.svg','./icon-512.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('retalhos-shell-')&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==self.location.origin)return;e.respondWith(fetch(r).then(x=>{if(x.ok)caches.open(CACHE_NAME).then(c=>c.put(r,x.clone()));return x}).catch(async()=>await caches.match(r)||caches.match('./index.html')))});
