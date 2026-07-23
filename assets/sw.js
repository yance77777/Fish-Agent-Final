/* ============ Fish-Agent Service Worker ============ */
/* 真实离线缓存：缓存优先，网络回退，不拦截 API 请求 */

const CACHE_NAME = 'fish-agent-v1';
const CACHE_URLS = [
  './',
  './index.html',
  './about.html',
  './404.html',
  './assets/style.css',
  './assets/manifest.json'
];

// 安装：预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('📦 SW 预缓存失败（部分资源可能离线不可用）:', err))
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 拦截请求：缓存优先，网络回退
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // 不拦截 API 请求（HF Spaces 后端不能缓存）
  if (url.includes('hf.space') || url.includes('/predict') || url.includes('/health')) {
    return;
  }
  // 仅处理 GET 请求
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        // 缓存新资源（同源且响应正常）
        if (response.status === 200 && new URL(url).origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // 网络失败且无缓存时，回退到首页（SPA 友好）
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
