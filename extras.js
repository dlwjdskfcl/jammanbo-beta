/* 잠만보 화면 추가 기능 v2 — 화면 코드(Apps Script Index.html)는 고치지 않고 덧붙입니다.
 *  1) 홈의 '폰 홈 화면에 추가' 안내 카드 숨김
 *  2) 미니게임 티츄 들어가는 버튼: 상단 바(모든 탭) + 홈 화면 카드
 *  3) (v2) 디자인 테마(theme.css)용 손질: 탭·버튼 아이콘을 선 아이콘(SVG)으로, 로고 자리, 글꼴(Pretendard)
 * index.html 의 boot() 가 router.js 다음에 이 파일을 넣습니다. 화면 코드의 render 가 없으면 조용히 끔.
 */
(function (ROOT) {
  var TICHU = ROOT + 'tichu/?reset';   // ?reset: 예전 서비스 워커를 거치지 않고 열기

  // 글꼴: 늦게 와도 화면은 먼저 뜸 (시스템 글꼴로 보이다가 바뀜)
  if (!document.getElementById('jmbFont')) {
    var f = document.createElement('link');
    f.id = 'jmbFont'; f.rel = 'stylesheet';
    f.href = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css';
    document.head.appendChild(f);
  }

  var st = document.createElement('style');
  st.textContent =
    '.card:has(#openA2hs){display:none!important}' +
    '.jmb-tichu-btn{white-space:nowrap}' +
    '.jmb-tichu-card{margin-top:12px;display:flex;align-items:center;gap:10px;cursor:pointer;text-decoration:none;color:inherit}' +
    '.jmb-tichu-card .ic{font-size:26px;line-height:1}' +
    '.jmb-tichu-card .tx{flex:1;min-width:0}' +
    '.jmb-tichu-card .tx b{display:block}' +
    '.jmb-tichu-card .tx small{display:block;opacity:.7;font-weight:500}';
  document.head.appendChild(st);

  // 선 아이콘 (24x24, stroke) — 탭 data-v 이름과 같게
  var P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
    members: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.8c2 .7 3.2 2.5 3.5 5.2"/>',
    records: '<rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17"/><path d="M8 2.5v4M16 2.5v4"/><path d="M7.5 13.5h3M7.5 16.5h6"/>',
    games: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none"/>',
    stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    board: '<path d="M20.5 11.5a8 8 0 0 1-11.8 7.1L3.5 20l1.4-4.9A8 8 0 1 1 20.5 11.5Z"/>',
    left: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9 8l-4 4 4 4M5 12h10"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
    cards: '<rect x="2.5" y="6" width="11" height="15" rx="2" transform="rotate(-12 8 13.5)"/><rect x="9.5" y="3.5" width="11" height="15" rx="2"/><path d="M15 8.5l1.6 2.2L15 13l-1.6-2.3z"/>'
  };
  function svg(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[name] + '</svg>';
  }

  function go() { location.href = TICHU; }

  function icons() {
    var tabs = document.querySelectorAll('#tabs .tab[data-v]');
    for (var i = 0; i < tabs.length; i++) {
      var ic = tabs[i].querySelector('.ic'), v = tabs[i].getAttribute('data-v');
      if (ic && P[v] && !ic.querySelector('svg')) ic.innerHTML = svg(v);
    }
    var ref = document.getElementById('btnRefresh');
    if (ref && !ref.querySelector('svg')) { ref.innerHTML = svg('refresh'); ref.setAttribute('aria-label', '새로고침'); }
    var brand = document.getElementById('brand');   // 🎲 글자 대신 로고(theme.css)
    if (brand && brand.firstChild && brand.firstChild.nodeType === 3 && /🎲/.test(brand.firstChild.nodeValue)) {
      brand.firstChild.nodeValue = brand.firstChild.nodeValue.replace(/🎲\s*/, '');
    }
  }

  function header() {
    if (document.getElementById('jmbTichuBtn')) return;
    var ref = document.getElementById('btnRefresh');
    if (!ref || !ref.parentNode) return;
    var b = document.createElement('button');
    b.id = 'jmbTichuBtn'; b.className = 'btn sm jmb-tichu-btn'; b.type = 'button';
    b.title = '미니게임 티츄'; b.setAttribute('aria-label', '미니게임 티츄');
    b.innerHTML = svg('cards') + '<span class="lbl">티츄</span>';
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
    card.innerHTML = '<span class="ic">🃏</span><span class="tx"><b>미니게임 · 티츄</b><small>회원끼리 2 대 2 온라인 티츄 · AI와 연습도 가능</small></span><span class="go" aria-hidden="true">›</span>';
    if (tiles && tiles.nextSibling) view.insertBefore(card, tiles.nextSibling);
    else if (tiles) view.appendChild(card);
    else view.insertBefore(card, view.firstChild);
  }

  function decorate() { try { header(); icons(); home(); } catch (e) {} }

  if (typeof window.render === 'function') {
    var orig = window.render;
    window.render = function () { var r = orig.apply(this, arguments); decorate(); return r; };
  }
  decorate();
})(window.JMB_ROOT || '/');
