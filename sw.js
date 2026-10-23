/* 잠만보 서비스 워커 v2.2 — 재방문을 빠르게 (안전하게)
 * - v2.2: /jammanbo/games 처럼 탭 주소로 열어도 앱 첫 화면(index.html)을 보여 줌 (주소는 그대로 → router.js 가 그 탭을 엶)
 * - 같은 출처의 GET(시작 페이지·config·auth·아이콘): 캐시 먼저 보여주고 뒤에서 새로 받아 둠 (stale-while-revalidate)
 *   → GitHub 에 올린 변경은 "다음 번" 열 때 적용됨
 * - 캐시에 없고 네트워크도 안 되면 브라우저 기본 동작(오류 화면)으로 넘김 — 빈 응답을 돌려주지 않음
 * - Apps Script·카카오(다른 출처)와 로그인 복귀(?code=…)·초기화(?reset)는 건드리지 않음
 */
var CACHE = 'jmb-static-v2.2';
var PRECACHE = ['./', 'config.js', 'router.js', 'icon-192.png', 'apple-touch-icon.png', 'manifest.webmanifest'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(PRECACHE.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                    // Apps Script · 카카오는 그대로 통과
  if (/[?&](code|error|state|reset)=?/.test(url.search)) return;      // 카카오 로그인 복귀 · 초기화는 캐시 안 씀

  var nav = req.mode === 'navigate';
  // 화면 이동(주소창 입력·새로고침)은 어느 탭 주소든 앱 첫 화면 하나(./)로 처리 — 탭은 router.js 가 주소를 보고 엶
  var key = nav ? new Request(self.registration.scope) : req;

  // 네트워크 요청은 바로 시작하고, 성공하면 캐시에 저장 (리다이렉트·오류 응답은 저장하지 않음)
  var net = fetch(nav ? key : req).then(function (res) {
    if (res && res.ok && res.type === 'basic' && !res.redirected) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { return c.put(key, copy); }).catch(function () {});
    }
    return res;
  });
  e.waitUntil(net.then(function () {}, function () {}));   // 응답 뒤에도 저장이 끝나도록 (동기 호출)

  e.respondWith(caches.match(key, { ignoreSearch: nav }).then(function (hit) {
    if (hit) return hit;
    return net;   // 캐시에 없으면 네트워크 결과 그대로 (실패하면 브라우저 기본 오류)
  }).catch(function () { return net; }));
});
