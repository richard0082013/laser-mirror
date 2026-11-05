// 断网也能玩：页面优先取网络（才能拿到新版本），文件名带哈希的资源优先取缓存。
const CACHE = 'laser-mirror-v1';

/** 从首页和样式表里找出全部资源，第一次打开后马上断网也能玩，标题字体也不会丢。 */
async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(['./', 'manifest.webmanifest']);
  const html = await (await fetch('./')).text();
  const assets = [...html.matchAll(/(?:href|src)="([^"]+\.(?:js|css|png))"/g)].map((match) => new URL(match[1], self.registration.scope).href);
  const fonts = await Promise.all(assets.filter((url) => url.endsWith('.css')).map(async (url) => {
    const css = await (await fetch(url)).text();
    return [...css.matchAll(/url\(["']?([^"')]+\.woff2)["']?\)/g)].map((match) => new URL(match[1], url).href);
  }));
  await cache.addAll([...new Set([...assets, ...fonts.flat()])]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request, { ignoreVary: true }).then((cached) => cached ?? caches.match('./', { ignoreVary: true }))),
    );
    return;
  }

  // 模块脚本的请求带 Origin，缓存时不带；不忽略 Vary 就匹配不上，断网时脚本加载失败
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then((cached) => cached ?? fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});
