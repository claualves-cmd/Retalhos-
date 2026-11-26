const CACHE_NAME='retalhos-shell-v13';
const APP_SHELL=['./','./index.html','./estilos.css','./recursos.css','./app.js','./app-controls.js','./retalhos-recursos.js','./retalho-markers.js','./location-index.js','./manifest.json','./icon-192.svg','./icon-512.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('retalhos-shell-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;event.respondWith(fetch(request).then(response=>{if(response.ok)caches.open(CACHE_NAME).then(cache=>cache.put(request,response.clone()));return response;}).catch(()=>caches.match(request)));});
