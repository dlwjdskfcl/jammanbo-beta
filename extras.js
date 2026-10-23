/* 잠만보 화면 추가 기능 v1 — 화면 코드(Apps Script Index.html)는 고치지 않고 덧붙입니다.
 *  1) 홈의 '폰 홈 화면에 추가' 안내 카드 숨김
 *  2) 미니게임 티츄 들어가는 버튼: 상단 바(모든 탭) + 홈 화면 카드
 * index.html 의 boot() 가 router.js 다음에 이 파일을 넣습니다. 화면 코드의 render 가 없으면 조용히 끔.
 */
(function (ROOT) {
  var TICHU = ROOT + 'tichu/?reset';   // ?reset: 예전 서비스 워커를 거치지 않고 열기

  var st = document.createElement('style');
  st.textContent =
    '.card:has(#openA2hs){display:none!important}' +
    '.jmb-tichu-btn{font-weight:800;white-space:nowrap}' +
    '.jmb-tichu-card{margin-top:12px;display:flex;align-items:center;gap:10px;cursor:pointer;text-decoration:none;color:inherit}' +
    '.jmb-tichu-card .ic{font-size:26px;line-height:1}' +
    '.jmb-tichu-card .tx{flex:1;min-width:0}' +
    '.jmb-tichu-card .tx small{display:block;opacity:.7;font-weight:500}';
  document.head.appendChild(st);

  function go() { location.href = TICHU; }

  function header() {
    if (document.getElementById('jmbTichuBtn')) return;
    var ref = document.getElementById('btnRefresh');
    if (!ref || !ref.parentNode) return;
    var b = document.createElement('button');
    b.id = 'jmbTichuBtn'; b.className = 'btn sm jmb-tichu-btn'; b.type = 'button';
    b.title = '미니게임 티츄'; b.textContent = '🃏 티츄';
    b.onclick = go;
    ref.parentNode.insertBefore(b, ref);
  }

  function home() {
    var a2 = document.getElementById('openA2hs');
    if (a2) { var c = a2.closest('.card'); if (c) c.style.display = 'none'; }
    if (typeof VIEW !== 'undefined' && VIEW !== 'home') return;
    var view = document.getElementById('view');
    if (!view || document.getElementById('jmbTichuCard')) return;
    var tiles = view.querySelector('.tiles');
    var card = document.createElement('a');
    card.id = 'jmbTichuCard'; card.className = 'card jmb-tichu-card'; card.href = TICHU;
    card.innerHTML = '<span class="ic">🃏</span><span class="tx"><b>미니게임 · 티츄</b><small>잠만보 회원끼리 2 대 2 온라인 티츄 · AI와 연습도 가능</small></span><span>→</span>';
    if (tiles && tiles.nextSibling) view.insertBefore(card, tiles.nextSibling);
    else if (tiles) view.appendChild(card);
    else view.insertBefore(card, view.firstChild);
  }

  function decorate() { try { header(); home(); } catch (e) {} }

  if (typeof window.render === 'function') {
    var orig = window.render;
    window.render = function () { var r = orig.apply(this, arguments); decorate(); return r; };
  }
  decorate();
})(window.JMB_ROOT || '/');
