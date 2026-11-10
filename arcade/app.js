/*! 잠만보 오락실 — 화면 v1.0.0
 * 미니게임 전체(../games.js) · 최근에 한 게임 · 이 기기 최고 기록 · 이번 주 모임 랭킹(../arcade.js → 메인 GAS Arcade.gs)을 한 화면에.
 * 서버는 랭킹 요약(arcadeBrief) 하나만 부름 — 로그인 안 했거나 실패해도 게임 목록은 그대로 보임.
 */
(function () {
  'use strict';
  var VER = '1.0.0';
  var A = window.JMB_ARCADE, ROOT = A.ROOT, FX = window.JMB_FX;
  var PROD = /^\/jammanbo\/$/.test(ROOT);
  var S = { brief: null, briefErr: '' };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function isDark() { return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches; }
  var toastT = 0;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.className = 'toast on'; clearTimeout(toastT); toastT = setTimeout(function () { t.className = 'toast'; }, 2400); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function ago(ms) {
    var m = Math.floor((Date.now() - ms) / 60000);
    return m < 1 ? '방금' : m < 60 ? m + '분 전' : m < 1440 ? Math.floor(m / 60) + '시간 전' : m < 43200 ? Math.floor(m / 1440) + '일 전' : '오래전';
  }

  /* 보이는 게임: 잠만보 메뉴(extras.js)와 같은 기준 — 공개 전(dev)은 개발자 계정, 운영진(admin)은 운영진 계정, beta 는 테스트 사이트에서만 */
  function games() {
    var u = (A.session() || {}).user || {};
    return window.JMB_GAME_LIST(ROOT).filter(function (g) { return !g.hub && (!g.dev || u.dev) && (!g.admin || u.admin || u.dev) && (!g.beta || !PROD); });
  }
  function modeDef(game, mode) { var b = A.BOARDS[game], ms = b ? b.modes : []; for (var i = 0; i < ms.length; i++) if (ms[i].id === mode) return ms[i]; return null; }

  /* 게임 카드 아래 한 줄: 이번 주 1등(로그인 회원) 또는 이 기기 최고 기록 */
  function statLine(g) {
    var B = A.BOARDS[g.id];
    if (!B) return '';
    var br = S.brief && S.brief.login && S.brief.games[g.id], bests = A.bests()[g.id] || {}, out = '';
    for (var i = 0; i < B.modes.length && !out; i++) {
      var m = B.modes[i], top = br && br[m.id] && br[m.id].top;
      if (top) out = '<span class="st champ">👑 ' + esc(top.nick) + ' ' + num(top.score) + esc(m.unit) + '</span>';
    }
    for (var j = 0; j < B.modes.length; j++) {
      var d = B.modes[j], b = bests[d.id];
      if (b) { out += '<span class="st">내 최고 ' + num(b.s) + esc(d.unit) + '</span>'; break; }
    }
    return out ? '<span class="stats">' + out + '</span>' : '';
  }
  function card(g) {
    var isNew = g.isNew && g.isNew >= today();
    return '<a class="game" href="' + esc(g.href) + '"' + (g.ext ? ' target="_blank" rel="noopener"' : '') + '>' +
      '<span class="ic" style="background:' + (isDark() ? g.bgDark : g.bg) + '">' + g.emoji + '</span>' +
      '<span class="tx"><b>' + esc(g.name) + (g.ext ? ' <i class="ext">↗</i>' : '') + (isNew ? ' <i class="new">NEW</i>' : '') + (g.dev ? ' <i class="tag">개발자</i>' : '') + '</b><small>' + esc(g.desc) + '</small>' + statLine(g) + '</span>' +
      (A.BOARDS[g.id] ? '<button type="button" class="rank" data-board="' + g.id + '" aria-label="' + esc(g.name) + ' 랭킹">🏆</button>' : '<span class="go" aria-hidden="true">›</span>') + '</a>';
  }

  function hero(list) {
    var nick = A.nick(), log = A.log(), played = list.filter(function (g) { return log[g.id]; }).length, total = list.filter(function (g) { return !g.ext; }).length;
    var h = '<section class="hero">';
    h += '<div class="who">' + (nick && FX ? '<span class="av">' + FX.avatar(nick, 52) + '</span>' : '<span class="av em">🕹️</span>') +
      '<div><h1>' + (nick ? esc(nick) + ' 님의 오락실' : '잠만보 오락실') + '</h1><p>' + (nick ? '기록은 자동으로 모임 랭킹에 올라가요' : '로그인하면 내 기록이 모임 랭킹에 올라가요') + '</p></div></div>';
    // 도장판: 해 본 게임 수
    h += '<div class="stamps" aria-label="해 본 게임 ' + played + '개 / ' + total + '개">' + list.filter(function (g) { return !g.ext; }).map(function (g) {
      return '<span class="stamp' + (log[g.id] ? ' on' : '') + '" title="' + esc(g.name) + '">' + g.emoji + '</span>';
    }).join('') + '<span class="cnt"><b>' + played + '</b>/' + total + ' 해 봤어요' + (played >= total && total ? ' 🎉' : '') + '</span></div>';
    return h + '</section>';
  }

  function recent(list) {
    var log = A.log();
    var r = list.filter(function (g) { return log[g.id] && !g.ext; }).sort(function (a, b) { return log[b.id].last - log[a.id].last; }).slice(0, 4);
    if (!r.length) return '';
    return '<section><h2>이어서 하기</h2><div class="recent">' + r.map(function (g) {
      return '<a class="chipg" href="' + esc(g.href) + '"><span class="ic" style="background:' + (isDark() ? g.bgDark : g.bg) + '">' + g.emoji + '</span><span><b>' + esc(g.name) + '</b><small>' + ago(log[g.id].last) + '</small></span></a>';
    }).join('') + '</div></section>';
  }

  /* 이번 주 모임 랭킹 요약 */
  function champs(list) {
    var ids = list.map(function (g) { return g.id; }).filter(function (id) { return A.BOARDS[id]; });
    if (!ids.length) return '';
    var h = '<section><h2>🏆 이번 주 모임 랭킹 <small>월요일마다 새로 시작</small></h2><div class="card champs">';
    if (!A.nick()) {
      h += '<div class="empty"><span class="em">🔒</span>' + (A.session() ? '잠만보에서 모임 닉네임을 연결하면 랭킹을 볼 수 있어요' : '카카오로 로그인하면 모임 랭킹을 볼 수 있어요') +
        '<br><button type="button" class="btn" id="login2">' + (A.session() ? '잠만보로 가기' : '카카오 로그인') + '</button></div>';
    } else if (S.briefErr) {
      h += '<div class="empty"><span class="em">😵</span>' + esc(S.briefErr) + '<br><button type="button" class="btn" id="retry">다시 시도</button></div>';
    } else if (!S.brief) {
      h += '<div class="empty"><span class="em">⏳</span>랭킹을 불러오는 중…</div>';
    } else {
      ids.forEach(function (id) {
        var B = A.BOARDS[id], gb = S.brief.games[id] || {};
        B.modes.forEach(function (m) {
          var o = gb[m.id] || {}, top = o.top, me = o.me;
          h += '<button type="button" class="row" data-board="' + id + '" data-mode="' + m.id + '"><span class="e">' + B.emoji + '</span>' +
            '<span class="nm"><b>' + esc(B.name) + '</b><small>' + esc(m.name) + '</small></span>' +
            (top ? '<span class="top">' + (FX ? FX.avatar(top.nick, 22) : '') + '<span class="who2">' + esc(top.nick) + '</span><b>' + num(top.score) + '<small>' + esc(m.unit) + '</small></b></span>'
                 : '<span class="top none">아직 없음 · 도전!</span>') +
            (me ? '<span class="mine">나 ' + me.rank + '위</span>' : '') + '</button>';
        });
      });
    }
    return h + '</div></section>';
  }

  function render() {
    var list = games(), cats = window.JMB_GAME_CATS || [], h = hero(list) + recent(list) + champs(list);
    cats.forEach(function (c) {
      var gs = list.filter(function (g) { return g.cat === c.id; });
      if (gs.length) h += '<section><h2>' + c.emoji + ' ' + esc(c.name) + '</h2><div class="games">' + gs.map(card).join('') + '</div></section>';
    });
    var etc = list.filter(function (g) { return !cats.some(function (c) { return c.id === g.cat; }); });
    if (etc.length) h += '<section><h2>그 밖에</h2><div class="games">' + etc.map(card).join('') + '</div></section>';
    h += '<p class="ver">오락실 v' + VER + ' · 기록은 이 기기와 모임 랭킹에 저장돼요</p>';
    $('view').innerHTML = h;
    var nick = A.nick(), b = $('acct');
    b.textContent = nick || (A.session() ? '닉네임 연결' : '로그인'); b.className = 'acct' + (nick ? ' on' : '');
  }

  function loadBrief() {
    if (!A.nick()) return;
    S.briefErr = '';
    A.brief().then(function (r) { S.brief = r; render(); }, function (e) { S.briefErr = e.message; render(); });
  }

  $('view').addEventListener('click', function (e) {
    var b = e.target.closest('[data-board]');
    if (b) { e.preventDefault(); A.openBoard(b.getAttribute('data-board'), b.getAttribute('data-mode') || undefined); return; }
    if (e.target.closest('#login2')) return A.login();
    if (e.target.closest('#retry')) { S.brief = null; render(); loadBrief(); }
  });
  $('back').onclick = function () { location.href = ROOT; };
  $('acct').onclick = function () {
    if (!A.nick()) return A.login();
    toast(A.nick() + ' 님으로 로그인돼 있어요 · 로그아웃은 잠만보 계정 창에서');
  };
  // 게임을 하고 돌아왔을 때(뒤로가기 캐시 포함) 기록 · 최근 목록을 새로
  window.addEventListener('pageshow', function (e) { if (e.persisted) { render(); loadBrief(); } });
  if (/[?&]reset\b/.test(location.search)) { try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {} }

  render();
  loadBrief();
})();
