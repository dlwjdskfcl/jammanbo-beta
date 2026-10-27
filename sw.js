/* 잠만보 서비스 워커 v2.6 — 재방문을 빠르게 (안전하게)
 * - v2.6: 장소 지도(map/) 추가 → SKIP_DIRS
 * - v2.5: 미니게임 순서 룰렛(roulette/) 추가 → SKIP_DIRS
 * - v2.4: v2.3 두 갈래 합침 (범위별 캐시 + 미니게임 폴더 제외). 미니게임 폴더는 아래 SKIP_DIRS 에 한 줄씩 추가
 * - v2.3a: 운영(/jammanbo/)과 테스트(/jammanbo-beta/)가 같은 github.io 출처라 캐시 저장소를 같이 씀
 *          → 캐시 이름에 범위(scope)를 붙이고, 업데이트 때 '자기 범위'의 옛 캐시만 지움 (서로 지우지 않게)
 * - v2.3b: tichu/ 폴더(미니게임 티츄)는 건드리지 않음 (앱 첫 화면으로 바꿔치기하지 않도록)
 * - v2.2: /jammanbo/games 처럼 탭 주소로 열어도 앱 첫 화면(index.html)을 보여 줌 (주소는 그대로 → router.js 가 그 탭을 엶)
 * - 같은 출처의 GET(시작 페이지·config·auth·아이콘): 캐시 먼저 보여주고 뒤에서 새로 받아 둠 (stale-while-revalidate)
 *   → GitHub 에 올린 변경은 "다음 번" 열 때 적용됨
 * - 캐시에 없고 네트워크도 안 되면 브라우저 기본 동작(오류 화면)으로 넘김 — 빈 응답을 돌려주지 않음
 * - Apps Script·카카오(다른 출처)와 로그인 복귀(?code=…)·초기화(?reset)는 건드리지 않음
 */
var SCOPE = new URL(self.registration.scope).pathname;   // '/jammanbo/' 또는 '/jammanbo-beta/'
var CACHE = 'jmb-static-v2.6:' + SCOPE;
// 미니게임 등 따로 동작하는 하위 폴더 (앱 첫 화면으로 바꿔치기하지 않음). 새 게임을 만들면 여기에 '폴더이름/' 추가
var SKIP_DIRS = ['tichu/', 'roulette/', 'map/'];
// 이 범위의 옛 캐시인지: 'jmb-static-…:범위' 형식이거나, 범위 표시가 없던 예전 이름(운영에서만 쓰던 것)
function isMineOld(k) {
  if (k === CACHE || k.indexOf('jmb-static-') !== 0) return false;
  var i = k.indexOf(':');
  return i < 0 ? SCOPE === '/jammanbo/' : k.slice(i + 1) === SCOPE;
}
var PRECACHE = ['./', 'config.js', 'router.js', 'icon-192.png', 'apple-touch-icon.png', 'manifest.webmanifest'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(PRECACHE.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(isMineOld).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                    // Apps Script · 카카오는 그대로 통과
  if (/[?&](code|error|state|reset)=?/.test(url.search)) return;      // 카카오 로그인 복귀 · 초기화는 캐시 안 씀
  var rel = url.pathname.indexOf(SCOPE) === 0 ? url.pathname.slice(SCOPE.length) : '';
  if (SKIP_DIRS.some(function (d) { return rel.indexOf(d) === 0; })) return;   // 미니게임: 따로 동작

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

  e.respondWith(caches.open(CACHE).then(function (c) { return c.match(key, { ignoreSearch: nav }); }).then(function (hit) {
    if (hit) return hit;
    return net;   // 캐시에 없으면 네트워크 결과 그대로 (실패하면 브라우저 기본 오류)
  }).catch(function () { return net; }));
});
