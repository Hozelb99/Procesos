/* Service worker de Ingeniería de Procesos PRO: permite usar la aplicación sin conexión.
   Estrategia: con red, siempre se sirve la versión más reciente (y se guarda copia); sin red o con red muy lenta
   (> 4 s), se sirve la copia guardada. Los datos del usuario viven en IndexedDB y no pasan por aquí.
   La lista y la versión se regeneran con: node herramientas/generar-precache.mjs */
// >>> GENERADO
const VERSION = '60af7f35c8';
const ARCHIVOS = ["./","index.html"];
// <<< GENERADO
const CACHE = 'procesos-pro-' + VERSION;
const ESPERA_RED_MS = 4000;
const abs = (u) => new URL(u, self.registration.scope).href;

async function precargar() {
  const c = await caches.open(CACHE);
  // «./» e index.html son obligatorios; el resto (iconos, etc.) se guarda si existe: un archivo ausente no impide el modo sin conexión.
  const obligatorios = new Set(['./', 'index.html']); let n = 0;
  await Promise.all(ARCHIVOS.map(async (u) => {
    try {
      const r = await fetch(new Request(abs(u), { cache: 'reload' }));
      if (!r.ok) throw new Error('No se pudo guardar ' + u + ' (' + r.status + ')');
      await c.put(abs(u), r); n++;
    } catch (e) { if (obligatorios.has(u)) throw e; }
  }));
  return n;
}

self.addEventListener('install', (e) => { e.waitUntil(precargar().then(() => self.skipWaiting())); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('procesos-pro-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'actualizar' && e.ports[0]) {
    precargar().then(n => e.ports[0].postMessage({ ok: true, n }), err => e.ports[0].postMessage({ ok: false, error: String(err.message || err) }));
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const red = fetch(req, req.mode === 'navigate' ? undefined : { cache: 'no-cache' });
      const r = await Promise.race([red, new Promise((_, rej) => setTimeout(() => rej(new Error('lenta')), ESPERA_RED_MS))]);
      if (r.ok) { c.put(req, r.clone()).catch(() => {}); return r; }
      return (await c.match(req, { ignoreSearch: true })) || r;
    } catch {
      const m = await c.match(req, { ignoreSearch: true });
      if (m) return m;
      if (req.mode === 'navigate') { const i = (await c.match(abs('index.html'))) || (await c.match(abs('./'))); if (i) return i; }
      return Response.error();
    }
  })());
});
