/* 잠만보 미니게임 공통 adaptive.js v1 — <html> 에 기기 · 입력 방식 · 방향 표시를 달아 adaptive.css 가 화면에 맞게 함 (외부 접속 없음) */
(function () {
  var h = document.documentElement, ua = navigator.userAgent || '';
  var ios = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
  var android = /Android/.test(ua);
  h.setAttribute('data-device', ios ? 'ios' : android ? 'android' : 'win');
  var m = /\/([^\/]+)\/(?:index\.html)?$/.exec(location.pathname);
  if (m) h.setAttribute('data-game', m[1]);
  function mq(q) { return !!(window.matchMedia && matchMedia(q).matches); }
  function set() {
    h.setAttribute('data-pointer', mq('(pointer: coarse)') ? 'coarse' : 'fine');
    h.setAttribute('data-orient', window.innerWidth > window.innerHeight ? 'landscape' : 'portrait');
    h.setAttribute('data-standalone', (mq('(display-mode: standalone)') || navigator.standalone) ? '1' : '0');
  }
  set();
  window.addEventListener('resize', set);
  window.addEventListener('orientationchange', set);
})();
