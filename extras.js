/* 잠만보 화면 추가 기능 v3 — 화면 코드(Apps Script Index.html)는 고치지 않고 덧붙입니다.
 *  1) 홈의 '폰 홈 화면에 추가' 안내 카드 숨김
 *  2) 미니게임 들어가는 곳: 상단 바 '미니게임' 버튼 → 메뉴(티츄 · 순서 룰렛) + 홈 화면 카드 2개
 *     (v3) 예전 '티츄' 버튼 자리. 새 미니게임은 아래 GAMES 에 한 줄 추가
 *  3) (v2) 디자인 테마(theme.css)용 손질: 탭·버튼 아이콘을 선 아이콘(SVG)으로, 로고 자리, 글꼴(Pretendard)
 * index.html 의 boot() 가 router.js 다음에 이 파일을 넣습니다. 화면 코드의 render 가 없으면 조용히 끔.
 */
(function (ROOT) {
  // ?reset: 예전 서비스 워커(미니게임 폴더를 모르는 버전)를 거치지 않고 열기 — 각 게임 화면이 주소에서 지움
  var GAMES = [
    { id: 'tichu', href: ROOT + 'tichu/?reset', emoji: '🃏', name: '티츄', desc: '회원끼리 2 대 2 온라인 카드게임 · AI 연습', bg: 'linear-gradient(135deg,#fff4e6,#ffe8cc)', bgDark: 'linear-gradient(135deg,#3a2a12,#4a3315)' },
    { id: 'roulette', href: ROOT + 'roulette/?reset', emoji: '🎯', name: '순서 룰렛', desc: '구슬을 굴려 순서 · 당첨자 정하기', bg: 'linear-gradient(135deg,#e7f5ff,#dbe4ff)', bgDark: 'linear-gradient(135deg,#142447,#1d2f5e)' }
  ];

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
    '.jmb-tichu-card .tx small{display:block;opacity:.7;font-weight:500}' +
    /* 미니게임 메뉴 */
    '.jmb-mini-menu{position:fixed;z-index:60;min-width:250px;max-width:calc(100vw - 24px);background:var(--surface,#fff);color:var(--ink,#191f28);border:1px solid var(--line,#e5e8ee);border-radius:16px;' +
      'box-shadow:0 12px 32px rgba(16,24,40,.18);padding:6px;transform-origin:top right;animation:jmbMenuIn .16s cubic-bezier(.2,1,.3,1) both}' +
    '@keyframes jmbMenuIn{from{opacity:0;transform:scale(.92) translateY(-6px)}}' +
    '.jmb-mini-menu .hd{font-size:12px;font-weight:700;color:var(--muted,#8b95a1);padding:6px 10px 4px}' +
    '.jmb-mini-menu a{display:flex;align-items:center;gap:12px;padding:10px;border-radius:12px;text-decoration:none;color:inherit}' +
    '.jmb-mini-menu a:hover,.jmb-mini-menu a:focus-visible{background:var(--surface2,#f2f4f7);outline:0}' +
    '.jmb-mini-menu .ic{width:40px;height:40px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;font-size:21px;flex:none}' +
    '.jmb-mini-menu b{display:block;font-size:15px;letter-spacing:-.02em}' +
    '.jmb-mini-menu small{display:block;font-size:12.5px;color:var(--muted,#8b95a1);font-weight:500;margin-top:1px}' +
    '.jmb-mini-btn[aria-expanded="true"]{background:var(--surface2,#f2f4f7)!important}' +
    '.jmb-mini-cards{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}' +
    '.jmb-mini-cards .jmb-tichu-card{margin:0;flex-direction:column;align-items:flex-start;gap:10px;position:relative}' +
    '.jmb-mini-cards .jmb-tichu-card .go{position:absolute;right:14px;top:14px}' +
    '@media (max-width:360px){.jmb-mini-cards{grid-template-columns:1fr}.jmb-mini-cards .jmb-tichu-card{flex-direction:row;align-items:center}}' +
    '@media (prefers-color-scheme: dark){.jmb-mini-menu{box-shadow:0 12px 32px rgba(0,0,0,.55)}}' +
    '@media (prefers-reduced-motion: reduce){.jmb-mini-menu{animation:none}}';
  function isDark() { return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches; }
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
    play: '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7 10.5v4M5 12.5h4"/><circle cx="15.5" cy="11.5" r="1" fill="currentColor" stroke="none"/><circle cx="17.5" cy="13.8" r="1" fill="currentColor" stroke="none"/>',
    cards: '<rect x="2.5" y="6" width="11" height="15" rx="2" transform="rotate(-12 8 13.5)"/><rect x="9.5" y="3.5" width="11" height="15" rx="2"/><path d="M15 8.5l1.6 2.2L15 13l-1.6-2.3z"/>'
  };
  function svg(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[name] + '</svg>';
  }

  /* 상단 '미니게임' 버튼 + 메뉴 */
  var menu = null;
  function closeMenu() {
    if (!menu) return;
    menu.parentNode && menu.parentNode.removeChild(menu); menu = null;
    var b = document.getElementById('jmbTichuBtn'); if (b) b.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', closeMenu);
    window.removeEventListener('scroll', closeMenu, true);
  }
  function outside(e) { if (menu && !menu.contains(e.target) && !e.target.closest('#jmbTichuBtn')) closeMenu(); }
  function onKey(e) {
    if (!menu) return;
    if (e.key === 'Escape') { closeMenu(); var b = document.getElementById('jmbTichuBtn'); if (b) b.focus(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      var items = menu.querySelectorAll('a'), i = Array.prototype.indexOf.call(items, document.activeElement);
      i = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[i].focus(); e.preventDefault();
    }
  }
  function openMenu(btn) {
    if (menu) { closeMenu(); return; }
    menu = document.createElement('div');
    menu.className = 'jmb-mini-menu'; menu.setAttribute('role', 'menu'); menu.id = 'jmbMiniMenu';
    var dark = isDark();
    menu.innerHTML = '<div class="hd">미니게임</div>' + GAMES.map(function (g) {
      return '<a role="menuitem" href="' + g.href + '" data-g="' + g.id + '"><span class="ic" style="background:' + (dark ? g.bgDark : g.bg) + '">' + g.emoji + '</span><span><b>' + g.name + '</b><small>' + g.desc + '</small></span></a>';
    }).join('');
    document.body.appendChild(menu);
    var r = btn.getBoundingClientRect(), mw = menu.offsetWidth;
    menu.style.top = Math.round(r.bottom + 6) + 'px';
    menu.style.left = Math.round(Math.max(12, Math.min(window.innerWidth - mw - 12, r.right - mw))) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    var first = menu.querySelector('a'); if (first && btn.matches(':focus-visible')) first.focus();
  }

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
    // id·class 는 예전 티츄 버튼 것을 그대로 씀 (theme.css 의 모양·좁은 화면 규칙 재사용)
    b.id = 'jmbTichuBtn'; b.className = 'btn sm jmb-tichu-btn jmb-mini-btn'; b.type = 'button';
    b.title = '미니게임 (티츄 · 순서 룰렛)'; b.setAttribute('aria-label', '미니게임');
    b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'jmbMiniMenu');
    b.innerHTML = svg('play') + '<span class="lbl">미니게임</span>';
    b.onclick = function (e) { e.stopPropagation(); openMenu(b); };
    ref.parentNode.insertBefore(b, ref);
  }

  function home() {
    var a2 = document.getElementById('openA2hs');
    if (a2) { var c = a2.closest('.card'); if (c) c.style.display = 'none'; }
    if (typeof VIEW !== 'undefined' && VIEW !== 'home') return;
    var view = document.getElementById('view');
    if (!view || document.getElementById('jmbMiniCards')) return;
    var tiles = view.querySelector('.tiles');
    var box = document.createElement('div');
    box.id = 'jmbMiniCards'; box.className = 'jmb-mini-cards';
    var dark = isDark();
    box.innerHTML = GAMES.map(function (g) {
      return '<a class="card jmb-tichu-card" href="' + g.href + '" data-g="' + g.id + '"><span class="ic" style="background:' + (dark ? g.bgDark : g.bg) + '">' + g.emoji + '</span><span class="tx"><b>' + g.name + '</b><small>' + g.desc + '</small></span><span class="go" aria-hidden="true">›</span></a>';
    }).join('');
    if (tiles && tiles.nextSibling) view.insertBefore(box, tiles.nextSibling);
    else if (tiles) view.appendChild(box);
    else view.insertBefore(box, view.firstChild);
  }

  function decorate() {
    try {
      if (menu && !document.body.contains(document.getElementById('jmbTichuBtn'))) closeMenu();   // 화면이 다시 그려져 버튼이 바뀌었으면 메뉴 닫기
      header(); icons(); home();
    } catch (e) {}
  }

  if (typeof window.render === 'function') {
    var orig = window.render;
    window.render = function () { var r = orig.apply(this, arguments); decorate(); return r; };
  }
  decorate();
})(window.JMB_ROOT || '/');
