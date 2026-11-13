/* 티츄 카드 로그 보기 — 개발자 전용 (실시간 서버 /dev → D1). 판 목록 → 판 → 라운드 되감기(카드 한 장씩 앞뒤로)
 * 로그 형식(log 토큰): migrations/0001_init.sql 주석. 서버가 개발자 계정(DEV_UIDS)인지 확인하므로 다른 사람은 데이터를 못 받음 */
(function () {
  'use strict';
  var VER = '1.0.0';
  var CFG = window.TICHU_CONFIG || {};
  var SFX = CFG.env && CFG.env !== 'prod' ? '_' + CFG.env : '';
  var app = document.getElementById('app');
  var LV = { 0: '기본', 3: '고수', 1: '마스터', 2: '신' };
  var SUIT = { J: '옥', S: '검', P: '탑', T: '별' }, RKN = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }, SPC = { MA: '참새', DO: '개', PH: '봉황', DR: '용' };
  var S = { f: { name: '', lv: '' }, rows: [], more: false, stats: null, play: 0, timer: 0 };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function token() { try { return localStorage.getItem('tichu_token' + SFX) || ''; } catch (e) { return ''; } }
  function kst(ms) { return ms ? new Date(+ms + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ') : '-'; }
  function dur(a, b) { var s = Math.max(0, Math.round((b - a) / 1000)); return s >= 60 ? Math.floor(s / 60) + '분' + (s % 60 ? ' ' + (s % 60) + '초' : '') : s + '초'; }
  function lab(c) { if (SPC[c]) return SPC[c]; var r = +c.slice(1); return (SUIT[c[0]] || c[0]) + (RKN[r] || r); }
  function rk(c) { return c === 'DR' ? 99 : c === 'PH' ? 98 : c === 'MA' ? 1 : c === 'DO' ? 0 : +c.slice(1); }
  function chip(c, mini) { return '<span class="c ' + (SPC[c] ? 'sp' : 's' + c[0]) + (mini ? ' mini' : '') + '">' + esc(lab(c)) + '</span>'; }
  function chips(list, mini) { return list.slice().sort(function (a, b) { return rk(b) - rk(a); }).map(function (c) { return chip(c, mini); }).join(''); }

  function api(q, a) {
    var t = token();
    if (!t) return Promise.reject(Object.assign(new Error('티츄에 먼저 로그인해 주세요'), { code: 'auth' }));
    if (!CFG.rt) return Promise.reject(new Error('실시간 서버 주소가 없어요'));
    return fetch(CFG.rt + '/dev', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ q: q, t: t }, a || {})) })
      .then(function (r) { if (!r.ok) throw new Error('서버 응답 오류 (' + r.status + ')'); return r.json(); })
      .then(function (j) { if (!j.ok) throw Object.assign(new Error(j.e || '오류'), { code: j.code }); return j.r; });
  }
  function fail(e) {
    var msg = e && e.code === 'dev' ? '개발자 계정만 볼 수 있는 화면이에요.' : e && e.code === 'auth' ? (e.message + ' — <a href="../">티츄로 가기</a>') : esc(e && e.message || '불러오지 못했어요');
    app.innerHTML = '<h1>🃏 티츄 카드 로그</h1><div class="card">' + msg + '</div>';
  }

  /* ---------- 판 목록 ---------- */
  function viewList() {
    stop();
    var st = S.stats;
    app.innerHTML = '<h1>🃏 티츄 카드 로그 <span class="tag">' + (CFG.env === 'prod' ? '운영' : '테스트') + '</span></h1>' +
      '<div class="stats">' + (st ? '<span>판 <b>' + st.games + '</b></span><span>라운드 <b>' + st.rounds + '</b></span><span>첫 기록 <b>' + kst(st.first_at) + '</b></span><span>최근 <b>' + kst(st.last_at) + '</b></span>' +
        '<span>사람 티츄 · 파트너가 먼저 나가 실패 <b>' + st.pf + '</b></span>' : '불러오는 중…') + '</div>' +
      '<div class="bar"><input id="fname" placeholder="이름 검색 (사람 · 봇)" value="' + esc(S.f.name) + '"><select id="flv"><option value="">AI 전체</option>' +
      [0, 3, 1, 2].map(function (v) { return '<option value="' + v + '"' + (String(S.f.lv) === String(v) ? ' selected' : '') + '>' + LV[v] + '</option>'; }).join('') +
      '</select><button class="pri" id="fgo">찾기</button><button id="fpf">⚠ 파트너가 먼저 나간 판</button></div>' +
      '<div id="rows">' + S.rows.map(rowHtml).join('') + '</div>' +
      (S.more ? '<button id="more" class="row" style="text-align:center">더 보기</button>' : (S.rows.length ? '<p class="muted small" style="text-align:center">끝</p>' : '<p class="muted">기록이 없어요</p>'));
    document.getElementById('fgo').onclick = function () { S.f = { name: document.getElementById('fname').value, lv: document.getElementById('flv').value }; loadList(true); };
    document.getElementById('fname').onkeydown = function (e) { if (e.key === 'Enter') document.getElementById('fgo').click(); };
    document.getElementById('fpf').onclick = viewPf;
    var m = document.getElementById('more'); if (m) m.onclick = function () { loadList(false); };
    Array.prototype.forEach.call(app.querySelectorAll('[data-g]'), function (b) { b.onclick = function () { location.hash = '#/g/' + b.getAttribute('data-g'); }; });
  }
  function rowHtml(g) {
    var w = g.winner_team === 0 ? 'A팀 승' : g.winner_team === 1 ? 'B팀 승' : (g.ended_at ? '' : '진행/중단');
    return '<button class="row" data-g="' + esc(g.id) + '"><div class="t"><span>' + kst(g.started_at) + (g.ended_at ? ' · ' + dur(g.started_at, g.ended_at) : '') + ' · ' + esc(g.id) + '</span>' +
      '<span>' + (g.bot_lv != null && g.humans < 4 ? 'AI ' + (LV[g.bot_lv] || g.bot_lv) : '사람끼리') + '</span></div>' +
      '<div class="s">' + esc(g.seats || '') + '</div><div class="t"><span>' + (g.rounds || 0) + '라운드</span><span>' + (g.score_a == null ? '' : '<b>A ' + g.score_a + ' : ' + g.score_b + ' B</b> ' + w) + '</span></div></button>';
  }
  function loadList(reset) {
    if (reset) { S.rows = []; S.more = false; }
    var go = function () { return api('games', { name: S.f.name, lv: S.f.lv, offset: S.rows.length, limit: 20 }).then(function (r) { S.rows = S.rows.concat(r.rows); S.more = r.more; viewList(); }); };
    (S.stats ? Promise.resolve() : api('stats').then(function (r) { S.stats = r; })).then(go).catch(fail);
  }
  function viewPf() {
    api('pf').then(function (rows) {
      app.innerHTML = '<h1>⚠ 파트너가 먼저 나가 실패한 사람 티츄 <a class="small" href="#/">← 목록</a></h1>' +
        (rows.length ? rows.map(function (r) {
          return '<button class="row" data-pf="' + esc(r.game_id) + '/' + r.round_no + '"><div class="t"><span>' + kst(r.ended_at) + ' · ' + esc(r.game_id) + ' R' + r.round_no + '</span><span>방 AI ' + (LV[r.room_bot_lv] || r.room_bot_lv) + '</span></div>' +
            '<div class="s">' + esc(r.caller) + ' <span class="tag">' + (r.kind === 2 ? '라지' : '스몰') + ' 티츄</span> → 파트너 ' + esc(r.partner) + (r.partner_is_bot ? ' <span class="tag warn">AI ' + (LV[r.partner_bot_lv] || '') + '</span>' : '') + ' 가 먼저 나감</div></button>';
        }).join('') : '<p class="muted">아직 없어요</p>');
      Array.prototype.forEach.call(app.querySelectorAll('[data-pf]'), function (b) { b.onclick = function () { location.hash = '#/g/' + b.getAttribute('data-pf'); }; });
    }).catch(fail);
  }

  /* ---------- 판 ---------- */
  function pfFlag(call, out) { var f = +String(out).charAt(0); return call.ok === 0 && f === (call.s + 2) % 4; }
  function viewGame(id) {
    stop();
    api('game', { id: id }).then(function (r) {
      var g = r.game, nm = function (s) { return esc(r.seats[s].name); };
      app.innerHTML = '<h1>판 ' + esc(g.id) + ' <a class="small" href="#/">← 목록</a></h1>' +
        '<div class="card"><div class="stats"><span>' + kst(g.started_at) + (g.ended_at ? ' ~ ' + kst(g.ended_at) + ' (' + dur(g.started_at, g.ended_at) + ')' : ' (끝까지 안 함)') + '</span><span>목표 <b>' + g.target + '</b>' + (g.time_limit ? ' · ⏱' + g.time_limit + '분' : '') + '</span>' +
        '<span>방 AI <b>' + (g.humans < 4 ? (LV[g.bot_lv] || g.bot_lv) : '없음') + '</b></span><span>서버 ' + esc(g.ver) + ' · ' + esc(g.env) + '</span></div>' +
        '<div style="margin-top:6px">' + r.seats.map(function (s) { return '<span class="tag ' + (s.seat % 2 ? 'b' : 'a') + '">' + (s.seat % 2 ? 'B' : 'A') + s.seat + ' ' + esc(s.name) + (s.is_bot ? ' · AI ' + (LV[s.bot_lv] || '') : ' · 사람') + '</span>'; }).join(' ') + '</div></div>' +
        '<h2>라운드</h2>' + r.rounds.map(function (x) {
          var calls = []; try { calls = JSON.parse(x.calls || '[]'); } catch (e) {}
          var tags = calls.map(function (c) { var f = pfFlag(c, x.out_order); return '<span class="tag ' + (c.ok ? 'ok' : 'bad') + '">' + nm(c.s) + ' ' + (c.k === 2 ? '라지' : '스몰') + (c.ok ? '성공' : '실패') + '</span>' + (f ? '<span class="tag warn">파트너가 먼저 나감</span>' : ''); }).join('');
          var order = String(x.out_order).split('').map(function (s) { return nm(+s); }).join(' › ');
          return '<button class="row" data-r="' + x.no + '"><div class="t"><span>R' + x.no + ' · ' + kst(x.ended_at) + (x.onetwo ? ' · 원투' : '') + (x.cut ? ' · ⏱끊김' : '') + '</span><span>A ' + x.total_a + ' : ' + x.total_b + ' B (누적 ' + x.score_a + ' : ' + x.score_b + ')</span></div>' +
            '<div class="s">' + order + tags + '</div></button>';
        }).join('');
      Array.prototype.forEach.call(app.querySelectorAll('[data-r]'), function (b) { b.onclick = function () { location.hash = '#/g/' + id + '/' + b.getAttribute('data-r'); }; });
      S.game = r;
    }).catch(fail);
  }

  /* ---------- 라운드 되감기 ---------- */
  function build(r, seats) {
    var name = function (s) { return seats[s] ? seats[s].name : '자리' + s; };
    var hands = r.deal.split('|').map(function (h) { return h.split(' ').filter(Boolean); });
    var pre = JSON.parse(JSON.stringify(hands)), ex = [];
    (r.exch || '').split(' ').filter(Boolean).forEach(function (t) {
      var m = t.match(/^(\d)>(\d):(.+)$/); if (!m) return;
      var f = +m[1], to = +m[2], c = m[3], i = hands[f].indexOf(c);
      if (i >= 0) hands[f].splice(i, 1); hands[to].push(c); ex.push({ f: f, to: to, c: c });
    });
    var st0 = { hands: hands, tichu: String(r.grand || '0000').split('').map(function (x) { return x === '1' ? 2 : 0; }), out: [], trick: [], clear: false, wish: 0, act: -1, note: '라운드 시작 (교환이 끝난 상태)' };
    var steps = [st0];
    (r.log || '').split(' ').filter(Boolean).forEach(function (tok) {
      var st = JSON.parse(JSON.stringify(steps[steps.length - 1])), k = tok.charAt(0), rest = tok.slice(1), m;
      if (st.clear) { st.trick = []; st.clear = false; }
      st.tok = tok;
      if (k === 'P') {
        m = rest.match(/^(\d):([^!^]*)([!^]*)$/); if (!m) return;
        var s = +m[1], cs = m[2].split(','), fl = m[3];
        cs.forEach(function (c) { var i = st.hands[s].indexOf(c); if (i >= 0) st.hands[s].splice(i, 1); });
        st.trick.push({ s: s, cards: cs, bomb: !!fl }); st.act = s;
        st.note = '<b>' + esc(name(s)) + '</b> ' + cs.map(function (c) { return chip(c, true); }).join('') + (fl ? ' 💣' + (fl.indexOf('^') >= 0 ? ' 끼어들기' : '') : '');
      } else if (k === 'X') {
        st.trick.push({ s: +rest, pass: 1 }); st.act = +rest; st.note = '<b>' + esc(name(+rest)) + '</b> 패스';
      } else if (k === 'T') {
        st.tichu[+rest] = 1; st.act = +rest; st.note = '⭐ <b>' + esc(name(+rest)) + '</b> 스몰 티츄 선언';
      } else if (k === 'K') {
        m = rest.match(/^(\d):(-?\d+)(?:>(\d))?$/); if (!m) return;
        st.act = +m[1]; st.clear = true;
        st.note = '<b>' + esc(name(+m[1])) + '</b> 트릭 가져감 (' + m[2] + '점)' + (m[3] ? ' — 용 트릭을 <b>' + esc(name(+m[3])) + '</b> 에게' : '');
      } else if (k === 'O') {
        st.out.push(+rest); st.act = +rest; st.note = '🏁 <b>' + esc(name(+rest)) + '</b> 나감 (' + st.out.length + '등)';
      } else if (k === 'W') {
        st.wish = +rest; st.note = '참새 콜: ' + (RKN[+rest] || rest);
      } else if (k === 'w') {
        st.wish = 0; st.note = '참새 콜 이행 (' + esc(name(+rest)) + ')';
      } else if (k === 'D') {
        m = rest.match(/^(\d)>(\d)$/); st.clear = true; st.act = m ? +m[2] : -1; st.note = '🐕 개 — 선이 <b>' + esc(m ? name(+m[2]) : '') + '</b> 에게';
      } else { return; }
      steps.push(st);
    });
    return { steps: steps, pre: pre, ex: ex };
  }
  function stop() { if (S.timer) { clearInterval(S.timer); S.timer = 0; } S.play = 0; }
  function viewRound(id, no) {
    stop();
    Promise.all([S.game && S.game.game.id === id ? Promise.resolve(S.game) : api('game', { id: id }), api('round', { id: id, no: no })]).then(function (res) {
      var G = res[0], r = res[1], seats = G.seats; S.game = G;
      var B = build(r, seats), steps = B.steps, i = 0, calls = []; try { calls = JSON.parse(r.calls || '[]'); } catch (e) {}
      var nm = function (s) { return esc(seats[s].name); };
      var head = '<h1>R' + no + ' <a class="small" href="#/g/' + esc(id) + '">← 판 ' + esc(id) + '</a></h1><div class="card"><div class="stats"><span>' + kst(r.started_at) + ' ~ ' + kst(r.ended_at) + '</span>' +
        '<span>나간 순서 <b>' + String(r.out_order).split('').map(function (s) { return nm(+s); }).join(' › ') + '</b>' + (r.last_seat != null ? ' (꼴찌 ' + nm(r.last_seat) + ')' : ' (원투)') + '</span></div>' +
        '<div style="margin-top:6px">' + (calls.length ? calls.map(function (c) { return '<span class="tag ' + (c.ok ? 'ok' : 'bad') + '">' + nm(c.s) + ' ' + (c.k === 2 ? '라지' : '스몰') + (c.ok ? ' 성공' : ' 실패') + '</span>' + (pfFlag(c, r.out_order) ? ' <span class="tag warn">⚠ 파트너(' + nm((c.s + 2) % 4) + ')가 먼저 나감</span>' : ''); }).join('') : '<span class="muted small">티츄 없음</span>') +
        ' <span class="tag">A ' + r.total_a + ' : ' + r.total_b + ' B</span></div></div>' +
        '<details><summary>교환 전 14장 · 교환 내역</summary><div class="card">' + B.pre.map(function (h, s) { return '<div class="small"><b>' + nm(s) + '</b> ' + chips(h, true) + '</div>'; }).join('') +
        '<div class="small" style="margin-top:6px">' + B.ex.map(function (e) { return nm(e.f) + ' → ' + nm(e.to) + ' ' + chip(e.c, true); }).join(' · ') + '</div></div></details>' +
        '<div id="stage"></div><div class="ctrl"><button id="p0">⏮</button><button id="pk" title="이전 트릭">⏪</button><button id="pb">◀</button><button class="pri" id="pp">▶ 재생</button><button id="pn">▶</button><button id="nk" title="다음 트릭">⏩</button><button id="pe">⏭</button>' +
        '<input type="range" id="sl" min="0" max="' + (steps.length - 1) + '" value="0"><span class="small muted" id="cnt"></span></div>' +
        '<div class="bar">' + (no > 1 ? '<button id="rp">← R' + (no - 1) + '</button>' : '') + '<button id="rn">R' + (no + 1) + ' →</button></div>';
      app.innerHTML = head;
      var stage = document.getElementById('stage');
      function draw() {
        var st = steps[i], hist = steps.slice(Math.max(1, i - 7), i + 1).filter(function (x, j) { return x.note; }).map(function (x) { return x.note; });
        stage.innerHTML = seats.map(function (s, k) {
          var out = st.out.indexOf(k);
          return '<div class="seat t' + (k % 2 ? 'b' : 'a') + (st.act === k && i > 0 ? ' act' : '') + (out >= 0 ? ' out' : '') + '"><div class="h"><b>' + esc(s.name) + '</b><span class="tag ' + (k % 2 ? 'b' : 'a') + '">' + (k % 2 ? 'B' : 'A') + k + '</span>' +
            '<span class="tag">' + (s.is_bot ? 'AI ' + (LV[s.bot_lv] || '') : '사람') + '</span>' + (st.tichu[k] ? '<span class="tag warn">' + (st.tichu[k] === 2 ? '라지' : '스몰') + ' 티츄</span>' : '') +
            (out >= 0 ? '<span class="tag ok">' + (out + 1) + '등</span>' : '') + '<span class="muted small">' + st.hands[k].length + '장</span></div>' + chips(st.hands[k]) + '</div>';
        }).join('') +
          '<div class="table">' + (st.trick.length ? st.trick.map(function (t) { return '<span class="pl"><small>' + esc(seats[t.s].name) + '</small>' + (t.pass ? '<span class="pass">패스</span>' : t.cards.map(function (c) { return chip(c, true); }).join('') + (t.bomb ? '💣' : '')) + '</span>'; }).join('') : '<span class="muted small">테이블 비어 있음</span>') +
          (st.wish ? ' <span class="tag warn">참새 콜 ' + (RKN[st.wish] || st.wish) + '</span>' : '') + '</div>' +
          '<div class="note">' + (st.note || '') + '</div><div class="hist">' + hist.map(function (x) { return '<div>' + x + '</div>'; }).join('') + '</div>';
        document.getElementById('sl').value = i; document.getElementById('cnt').textContent = i + ' / ' + (steps.length - 1);
        document.getElementById('pp').textContent = S.play ? '⏸ 멈춤' : '▶ 재생';
      }
      function go(n) { i = Math.max(0, Math.min(steps.length - 1, n)); draw(); }
      function trickJump(dir) { var j = i; for (;;) { j += dir; if (j <= 0) return 0; if (j >= steps.length - 1) return steps.length - 1; if (steps[j - 1].clear) return j; } }
      document.getElementById('p0').onclick = function () { stop(); go(0); };
      document.getElementById('pe').onclick = function () { stop(); go(steps.length - 1); };
      document.getElementById('pb').onclick = function () { stop(); go(i - 1); };
      document.getElementById('pn').onclick = function () { stop(); go(i + 1); };
      document.getElementById('pk').onclick = function () { stop(); go(trickJump(-1)); };
      document.getElementById('nk').onclick = function () { stop(); go(trickJump(1)); };
      document.getElementById('sl').oninput = function (e) { stop(); go(+e.target.value); };
      document.getElementById('pp').onclick = function () {
        if (S.play) { stop(); draw(); return; }
        if (i >= steps.length - 1) i = 0;
        S.play = 1; S.timer = setInterval(function () { if (i >= steps.length - 1) { stop(); draw(); return; } go(i + 1); }, 650); draw();
      };
      var rp = document.getElementById('rp'); if (rp) rp.onclick = function () { location.hash = '#/g/' + id + '/' + (no - 1); };
      document.getElementById('rn').onclick = function () { location.hash = '#/g/' + id + '/' + (no + 1); };
      window.onkeydown = function (e) { if (e.key === 'ArrowRight') { stop(); go(i + 1); } else if (e.key === 'ArrowLeft') { stop(); go(i - 1); } };
      draw();
    }).catch(function (e) { if (e && /없는 라운드/.test(e.message)) { location.hash = '#/g/' + id; } else fail(e); });
  }

  function route() {
    window.onkeydown = null;
    var m = location.hash.match(/^#\/g\/([A-Z0-9]+)(?:\/(\d+))?$/);
    if (m && m[2]) viewRound(m[1], +m[2]); else if (m) viewGame(m[1]); else { if (S.rows.length) viewList(); else loadList(true); }
  }
  window.addEventListener('hashchange', route);
  route();
})();
