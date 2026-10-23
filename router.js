/* 잠만보 주소(라우터) v1 — 탭마다 주소를 따로 주고, 뒤로가기로 이전 탭/창으로 돌아가게 함
 *
 *   /jammanbo/          → 홈        /jammanbo/members → 회원     /jammanbo/records → 기록
 *   /jammanbo/games     → 게임      /jammanbo/stats   → 통계     /jammanbo/board   → 소통
 *   /jammanbo/left      → 탈퇴(운영진)
 *   (줄임 주소도 받음: /game, /member, /record, /stat, /home)
 *
 * 화면 코드(Apps Script Index.html)는 고치지 않습니다. 화면 코드의 전역 VIEW · render · openModal · closeModal 을
 * 감싸서 동작하므로, Index.html 에서 이 이름들을 바꾸면 여기도 같이 고쳐야 합니다.
 * index.html 의 boot() 가 이 파일을 읽어 화면 맨 끝(</body> 앞)에 넣습니다.
 */
(function (ROOT) {
  if (typeof window.render !== 'function' || typeof window.VIEW === 'undefined') return;   // 화면 코드 구조가 바뀌었으면 조용히 끔

  var ROUTES = { home: '', members: 'members', records: 'records', games: 'games', stats: 'stats', board: 'board', left: 'left' };
  var ALIAS = { game: 'games', member: 'members', record: 'records', stat: 'stats', home: 'home', index: 'home' };
  var ROUTE_KEY = 'jmb_route';

  function fromPath() {
    var p = location.pathname;
    if (p.indexOf(ROOT) !== 0) return 'home';
    var seg = decodeURIComponent(p.slice(ROOT.length).split('/')[0] || '').replace(/\.html$/, '').toLowerCase();
    if (!seg) return 'home';
    if (Object.prototype.hasOwnProperty.call(ROUTES, seg)) return seg;
    return ALIAS[seg] || 'home';
  }
  function urlOf(v) { return ROOT + (ROUTES[v] || ''); }
  function isOpen() { var m = document.getElementById('modalBg'); return !!(m && m.classList.contains('on')); }
  function remember(u) { try { sessionStorage.setItem(ROUTE_KEY, u); } catch (e) {} }

  var origRender = window.render, origOpen = window.openModal, origClose = window.closeModal;
  var popping = false, first = true, modalEntry = false, skipPop = 0;

  /* 탭이 바뀌면 주소를 바꿔 기록 (render 가 불릴 때마다 확인 — 데이터 새로고침처럼 탭이 그대로면 아무것도 안 함) */
  function sync() {
    var want = urlOf(VIEW);
    remember(want);
    if (location.pathname === want && !first) return;
    var st = { jmb: 1, v: VIEW };
    if (first) history.replaceState(st, '', want + location.hash);   // 처음 열 때: 주소만 정리 (기록 안 쌓음)
    else history.pushState(st, '', want);
    first = false;
  }

  window.render = function () {
    var r = origRender.apply(this, arguments);
    if (!popping && window.D) sync();
    return r;
  };

  /* 팝업(모달): 열면 기록 하나 추가 → 휴대폰 뒤로가기로 팝업만 닫힘 */
  if (typeof origOpen === 'function' && typeof origClose === 'function') {
    window.openModal = function () {
      var r = origOpen.apply(this, arguments);
      if (!modalEntry) { modalEntry = true; history.pushState({ jmb: 1, v: VIEW, modal: 1 }, '', location.pathname + location.search + location.hash); }
      return r;
    };
    window.closeModal = function () {
      var r = origClose.apply(this, arguments);
      // 닫자마자 다른 팝업을 여는 경우가 있어서 한 박자 뒤에 확인
      if (modalEntry) setTimeout(function () {
        if (modalEntry && !isOpen()) { modalEntry = false; skipPop++; history.back(); }
      }, 0);
      return r;
    };
  }

  window.addEventListener('popstate', function () {
    if (skipPop > 0) { skipPop--; return; }                 // 팝업을 버튼으로 닫으면서 우리가 되돌린 것
    if (modalEntry || isOpen()) {                            // 팝업이 열려 있으면 팝업만 닫기
      modalEntry = false;
      if (isOpen()) { origClose(); if (fromPath() === VIEW) return; }
    }
    var v = fromPath();
    if (v === VIEW) return;
    if (v === 'stats' && window.UI) UI.statRange = 'review';  // 탭 버튼으로 들어갈 때와 같게
    VIEW = v;
    popping = true;
    try { window.render(); } finally { popping = false; }
    window.scrollTo(0, 0);
    if (VIEW !== v) history.replaceState({ jmb: 1, v: VIEW }, '', urlOf(VIEW));   // 예: 운영진 아닌데 /left → 홈
    remember(urlOf(VIEW));
  });

  /* 시작: 주소에 맞는 탭으로 (화면 코드가 이미 홈을 한 번 그렸을 수 있음) */
  var v0 = fromPath();
  if (v0 !== VIEW) VIEW = v0;
  if (window.D) window.render();   // 데이터가 아직이면 데이터가 오면서 render 될 때 맞춰짐
})(window.JMB_ROOT || '/');
