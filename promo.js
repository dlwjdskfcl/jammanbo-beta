/* 아르케온 '곧 출시예정' 홍보 — 티츄 · 꼬맨틀이 불러 씀 (../promo.js?v=1 · defer)
 *  - games.js 의 아르케온(id 'forest') 항목에 soon 이 있을 때만 보임 → 출시하며 soon 을 지우면 자동으로 사라짐 (games.js 를 바꾸면 config.js version 도 올려 옛 games.js 캐시를 비울 것)
 *  - 모양 두 가지: ① 작은 배너(닫으면 24시간 숨김) ② 처음 한 번만 뜨는 안내 카드
 *  - 서버 요청 없음: 같은 출처의 정적 파일(games.js · forest/terms.json)만 읽음. 외부 요청 0
 *  - API: JMB_PROMO.show(ctx, host, {xl}) 게임이 '지금 홍보가 어울리는 화면'일 때 부름(여러 번 불러도 됨) · JMB_PROMO.hide() 그 밖의 화면
 *    host = 배너를 붙일 요소(화면이 다시 그려져도 show 를 다시 부르면 붙음) · xl = 꼬맨틀 엑셀 모드(위장 화면 — 카드 없이 '메모' 한 줄로만) · inset = 호스트에 좌우 여백이 없을 때 12px 여백(꼬맨틀)
 *  - 저장: localStorage jmb_arc_promo_bn(닫은 시각) · jmb_arc_promo_card(카드를 본 적 있음) — 테스트 사이트는 접미사 _beta (운영과 같은 출처라 칸을 나눔)
 */
(function () {
  'use strict';
  var VER = '1.0.0';
  var CFG = window.JMB_CONFIG || {}, SFX = CFG.env && CFG.env !== 'prod' ? '_' + CFG.env : '';
  var K_BN = 'jmb_arc_promo_bn' + SFX, K_CARD = 'jmb_arc_promo_card' + SFX, DAY = 864e5;
  var BASE = (document.currentScript && document.currentScript.src || '').replace(/promo\.js[^\/]*$/, '') || '../';
  var DEF = { name: '아르케온', soon: '곧 출시예정', tag: '근원 원소, 고대 문명' };   // 파일을 못 읽을 때의 기본값 (용어집 game.name · feature.soon · game.tagline 과 같은 값)
  var ICON = '<svg width="26" height="26" viewBox="0 0 24 24" fill="#4f9a4a" stroke="#1d3a22" stroke-width="2" stroke-linejoin="miter" aria-hidden="true"><path d="M12 2.5l6.5 8.5H15l4.5 6.5H4.5L9 11H5.5zM10.5 17.5h3v4h-3z"/></svg>';
  var S = { ctx: null, host: null, opt: {}, ready: false, on: false, tx: DEF, icon: ICON, timer: 0, card: null, prevFocus: null };

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function link() { return BASE + 'forest/?reset&demo=1'; }
  function snoozed() { var t = +ls(K_BN) || 0; return t && Date.now() - t < DAY; }

  /* ---------- 준비: games.js 의 soon · 아이콘, terms.json 의 이름 (한 번만) ---------- */
  var loading = null;
  function load() {
    if (loading) return loading;
    loading = new Promise(function (res) {
      function pick() {
        try {
          var list = window.JMB_GAME_LIST ? window.JMB_GAME_LIST(BASE) : [];
          var g = list.filter(function (x) { return x.id === 'forest'; })[0];
          S.on = !!(g && g.soon);
          if (g && g.icon) S.icon = g.icon;
          if (g && typeof g.soon === 'string') S.tx = { name: S.tx.name, soon: g.soon, tag: S.tx.tag };
        } catch (e) { S.on = false; }
        if (!S.on) return done();
        try {   // 이름 · 소개는 용어집 파일 (못 읽으면 기본값)
          fetch(BASE + 'forest/terms.json?v=' + VER).then(function (r) { return r.ok ? r.json() : null; }).then(function (t) {
            if (t) S.tx = { name: (t['game.name'] || {}).ko || S.tx.name, soon: (t['feature.soon'] || {}).ko || S.tx.soon, tag: (t['game.tagline'] || {}).ko || S.tx.tag };
            done();
          }, done);
        } catch (e) { done(); }
      }
      function done() { S.ready = true; res(); }
      if (window.JMB_GAME_LIST) return pick();
      var s = document.createElement('script');
      s.src = BASE + 'games.js?v=' + encodeURIComponent(CFG.version || '1');
      s.onload = pick; s.onerror = function () { S.on = false; done(); };
      document.head.appendChild(s);
    });
    return loading;
  }

  /* ---------- 모양 ---------- */
  function css() {
    if (document.getElementById('jmbPromoCss')) return;
    var st = document.createElement('style'); st.id = 'jmbPromoCss';
    st.textContent =
      '.jmb-pbn{box-sizing:border-box;display:flex;align-items:center;gap:10px;margin:14px 0;padding:8px 4px 8px 10px;background:#2b2415;color:#f6edd6;border:2px solid #e9b44c;border-radius:4px;box-shadow:3px 3px 0 rgba(0,0,0,.35);font-size:13px;line-height:1.45;font-family:inherit}' +
      '.jmb-pbn .go{flex:1;min-width:0;display:flex;align-items:center;gap:10px;color:inherit;text-decoration:none}' +
      '.jmb-pbn .go:focus-visible,.jmb-pbn .x:focus-visible,.jmb-pcard a:focus-visible,.jmb-pcard button:focus-visible{outline:2px solid #e9b44c;outline-offset:2px}' +
      '.jmb-pbn .ic{flex:none;display:flex}.jmb-pbn .tx{min-width:0}.jmb-pbn b{font-weight:800}.jmb-pbn small{display:block;color:#cdbf9c;font-size:12px}' +
      '.jmb-pbadge{display:inline-block;margin-left:6px;padding:0 6px;border-radius:3px;background:#e9b44c;color:#2c1d06;font-size:11px;font-weight:800;vertical-align:1px;white-space:nowrap}' +
      '.jmb-pbn .x{flex:none;width:44px;height:44px;margin:-8px 0;padding:0;background:none;border:0;color:#cdbf9c;font-size:20px;font-weight:700;line-height:1;font-family:inherit;cursor:pointer}' +
      '.jmb-pbn .x:hover{color:#f6edd6}' +
      /* 꼬맨틀 엑셀 모드: 위장 화면에 맞춰 셀 메모처럼 */
      '.jmb-pbn.inset{margin:14px 12px}.jmb-pbn.xl{max-width:none;margin:8px 12px;width:auto;padding:6px 4px 6px 12px;background:#ffffe1;color:#333;border:1px solid #c9c98e;border-radius:0;box-shadow:2px 2px 5px rgba(0,0,0,.18);font-size:13px}' +
      '.jmb-pbn.xl .go{display:block}.jmb-pbn.xl a{color:#1a4f9c}.jmb-pbn.xl .x{color:#666}' +
      '@media (prefers-color-scheme:dark){.jmb-pbn.xl{background:#3d3a1c;border-color:#66622d;color:#eee}.jmb-pbn.xl a{color:#9cc3ff}.jmb-pbn.xl .x{color:#bbb}}' +
      '.jmb-pback{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(20,16,8,.62)}' +
      '.jmb-pcard{box-sizing:border-box;width:100%;max-width:340px;padding:16px 16px 14px;background:#2b2415;color:#f6edd6;border:2px solid #e9b44c;border-radius:4px;box-shadow:4px 4px 0 rgba(0,0,0,.4);font-size:14px;line-height:1.6;font-family:inherit}' +
      '.jmb-pcard h2{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:17px;font-weight:800;color:#f6edd6}' +
      '.jmb-pcard p{margin:0 0 14px;color:#e6dcc0}' +
      '.jmb-pcard .row{display:flex;gap:8px;justify-content:flex-end}' +
      '.jmb-pcard a,.jmb-pcard button{min-height:44px;box-sizing:border-box;padding:0 16px;display:inline-flex;align-items:center;border-radius:4px;font-size:14px;font-weight:700;line-height:1;font-family:inherit;cursor:pointer;text-decoration:none}' +
      '.jmb-pcard a{background:#e9b44c;color:#2c1d06;border:2px solid #e9b44c}.jmb-pcard button{background:none;color:#f6edd6;border:2px solid #6b5d38}';
    document.head.appendChild(st);
  }
  function banner() {
    var xl = !!S.opt.xl, el = document.createElement('div');
    el.id = 'jmbPromoBn'; el.className = 'jmb-pbn' + (xl ? ' xl' : '') + (S.opt.inset ? ' inset' : ''); el.setAttribute('role', 'complementary'); el.setAttribute('aria-label', S.tx.name + ' 소개');
    el.innerHTML = xl
      ? '<div class="go"><b>메모:</b> <a href="' + esc(link()) + '">' + esc(S.tx.name) + '</a> — ' + esc(S.tx.soon) + ' · 먼저 둘러보기</div><button type="button" class="x" aria-label="닫기">×</button>'
      : '<a class="go" href="' + esc(link()) + '"><span class="ic">' + S.icon + '</span><span class="tx"><b>' + esc(S.tx.name) + '</b><span class="jmb-pbadge">' + esc(S.tx.soon) + '</span><small>' + esc(S.tx.tag) + ' · 먼저 둘러보기</small></span></a><button type="button" class="x" aria-label="닫기">×</button>';
    el.querySelector('.x').onclick = function () { ls(K_BN, String(Date.now())); if (el.parentNode) el.parentNode.removeChild(el); };
    return el;
  }
  function mount() {
    var old = document.getElementById('jmbPromoBn'); if (old && old.parentNode) old.parentNode.removeChild(old);
    if (!S.ctx || !S.on || !S.host || !S.host.isConnected || snoozed()) return;
    css(); S.host.appendChild(banner());
  }

  /* ---------- 처음 한 번만 뜨는 안내 카드 ---------- */
  function openCard() {
    S.timer = 0;
    if (!S.ctx || !S.on || S.opt.xl || ls(K_CARD) || S.card) return;
    var m = document.getElementById('modal'); if (m && !m.hidden && m.childElementCount) return;   // 다른 창이 열려 있으면 이번엔 건너뜀
    if (document.body.classList.contains('ingame')) return;
    ls(K_CARD, '1'); css();
    S.prevFocus = document.activeElement;
    var back = document.createElement('div'); back.className = 'jmb-pback';
    back.innerHTML = '<div class="jmb-pcard" role="dialog" aria-modal="true" aria-labelledby="jmbPcT"><h2 id="jmbPcT"><span aria-hidden="true">' + S.icon + '</span>' + esc(S.tx.name) + '<span class="jmb-pbadge">' + esc(S.tx.soon) + '</span></h2>' +
      '<p>보드게임 모임 잠만보의 힐링 RPG예요. 마을을 가꾸고 던전을 돌아요. 지금은 둘러보기만 열려 있어요.</p>' +
      '<div class="row"><button type="button" class="no">닫기</button><a href="' + esc(link()) + '" class="go">둘러보기</a></div></div>';
    document.body.appendChild(back); S.card = back;
    function close() { document.removeEventListener('keydown', key, true); if (back.parentNode) back.parentNode.removeChild(back); S.card = null; try { if (S.prevFocus && S.prevFocus.focus) S.prevFocus.focus(); } catch (e) {} }
    function key(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') { var f = back.querySelectorAll('a,button'); if (!f.length) return; var a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
    }
    back.querySelector('.no').onclick = close;
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    document.addEventListener('keydown', key, true);
    S.closeCard = close;
    var go = back.querySelector('.go'); try { go.focus(); } catch (e) {}
  }

  /* ---------- 게임이 부르는 곳 ---------- */
  function show(ctx, host, opt) {
    S.ctx = ctx || null; S.host = host || null; S.opt = opt || {};
    if (!S.ctx) return hide();
    if (S.ready) mountAndCard(); else load().then(function () { if (S.ctx) mountAndCard(); });
  }
  function mountAndCard() {
    mount();
    if (S.on && !S.opt.xl && !ls(K_CARD) && !S.timer && !S.card) S.timer = setTimeout(openCard, 1400);   // 화면이 자리 잡은 뒤. 그 사이 다른 화면으로 가면 hide() 가 취소
  }
  function hide() {
    S.ctx = null; S.host = null;
    if (S.timer) { clearTimeout(S.timer); S.timer = 0; }
    var old = document.getElementById('jmbPromoBn'); if (old && old.parentNode) old.parentNode.removeChild(old);
    if (S.card && S.closeCard) S.closeCard();
  }
  window.JMB_PROMO = { ver: VER, show: show, hide: hide };
})();
