/* ============ Fish-Agent Service Worker ============ */
/* 混合缓存策略：HTML 网络优先（确保最新版本），静态资源缓存优先 */

const CACHE_NAME = 'fish-agent-v3';
const CACHE_URLS = [
  './',
  './index.html',
  './about.html',
  './404.html',
  './assets/style.css',
  './assets/manifest.json',
  './assets/samples/highly-fresh.png',
  './assets/samples/fresh.png',
  './assets/samples/not-fresh.png'
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

// 激活：清理旧缓存并通知客户端接管
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 拦截请求：HTML 导航网络优先，静态资源缓存优先
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

  // HTML 导航请求：网络优先，确保用户获取到最新版本
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // 按实际请求 URL 缓存，避免 about.html 被错存为 index.html
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(async () => {
          // 离线：优先返回与请求匹配的已缓存页面，其次回退到 index.html（App Shell）
          const cached = await caches.match(event.request);
          return cached || caches.match('./index.html');
        })
    );
    return;
  }

  // 静态资源：缓存优先，网络回退
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        if (response.status === 200 && new URL(url).origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
