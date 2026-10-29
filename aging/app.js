/*! 잠만보 에이징 커브 검사 — 화면 v1.0.0
 * 미니게임(games.js)으로 '게임 피지컬 나이' 를 재고 진단서를 보여 줌. 점수 식은 score.js (서버 AgingScore.gs 와 같은 파일)
 * 검사 · 연습은 언제든 (서버 안 거침). 기록 검사는 카카오 로그인 회원이 한 주에 한 번 — 서버 Aging.gs (agingInfo · agingStart · agingSubmit)
 */
(function () {
  'use strict';
  var VER = '1.0.0';
  var CFG = window.JMB_CONFIG || {};
  var ENV = CFG.env || 'prod';
  var ENV_SFX = ENV !== 'prod' ? '_' + ENV : '';
  var API = window.AGING_API_LOCAL || CFG.api || '';
  var ROOT = (function () { var seg = location.pathname.split('/')[1] || ''; return /\.github\.io$/.test(location.hostname) && seg ? '/' + seg + '/' : '/'; })();
  var LS = { auth: 'jmb_kakao_v2' + ENV_SFX, state: 'jmb_kakao_state' + ENV_SFX, best: 'jmb_aging_best', last: 'jmb_aging_last', pend: 'jmb_aging_pend' + ENV_SFX, rk: 'jmb_aging_rk' };
  var SC = window.AGING_SCORE, GM = window.AG_GAMES;
  var S = { view: 'home', info: null, run: null, stop: null, rk: lsGet(LS.rk) || 'week' };

  /* ================= 공통 ================= */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function lsJSON(k) { try { return JSON.parse(lsGet(k) || 'null'); } catch (e) { return null; } }
  var toastT = 0;
  function toast(msg, err) { var t = $('toast'); t.textContent = msg; t.className = 'toast on' + (err ? ' err' : ''); clearTimeout(toastT); toastT = setTimeout(function () { t.className = 'toast'; }, err ? 3800 : 2400); }
  function md(d) { var p = String(d || '').split('-'); return p.length === 3 ? (+p[1]) + '월 ' + (+p[2]) + '일' : d; }
  function faceOf(age) { return age <= 17 ? '👦' : age <= 25 ? '🧑' : age <= 33 ? '🧔' : age <= 45 ? '👨‍🦳' : age <= 58 ? '🧓' : '👴'; }
  function av(name, px) { return window.JMB_FX && name ? '<span class="av">' + JMB_FX.avatar(name, px) + '</span>' : ''; }
  function rawText(id, raw) {
    if (!raw) return '';
    var v = raw.v;
    switch (id) {
      case 'react': return '평균 ' + v + 'ms' + (raw.x ? ' · 성급 ' + raw.x + '번' : '');
      case 'aim': return v + '개 맞힘' + (raw.x != null ? ' · 정확도 ' + Math.round(raw.x * 100) + '%' : '');
      case 'track': return '원 안 ' + v + '%';
      case 'rhythm': return '평균 오차 ' + v + 'ms';
      case 'smite': return '평균 ' + v + 'ms' + (raw.x != null ? ' · 성공 ' + raw.x + '/5' : '');
      case 'stroop': return v + '점' + (raw.x ? ' · 틀림 ' + raw.x : '');
      case 'memory': return v + '칸 기억';
      case 'cps': return '초당 ' + v + '번';
      case 'dodge': return v + '초 버팀';
      case 'combo': return '키 하나 평균 ' + v + 'ms';
    }
    return String(v);
  }

  /* ================= 로그인 (잠만보 카카오 로그인 세션을 같이 씀) ================= */
  function session() { var s = lsJSON(LS.auth); return s && s.token ? s : null; }
  function token() { var s = session(); return s ? s.token : ''; }
  function myNick() { var s = session(); return s && s.user && s.user.nickname ? s.user.nickname : ''; }
  function startLogin() {
    if (!CFG.kakaoRestKey) return toast('카카오 로그인 설정을 찾지 못했어요', true);
    var st; try { st = [].slice.call(crypto.getRandomValues(new Uint32Array(4))).join(''); } catch (e) { st = String(Math.random()).slice(2) + Date.now(); }
    lsSet(LS.state, JSON.stringify({ s: st, t: Date.now() }));
    try { sessionStorage.setItem('jmb_after_login', location.pathname); } catch (e) {}   // 잠만보 시작 페이지가 로그인 뒤 여기로 돌려보냄
    location.href = 'https://kauth.kakao.com/oauth/authorize?client_id=' + encodeURIComponent(CFG.kakaoRestKey) +
      '&redirect_uri=' + encodeURIComponent(location.origin + ROOT) + '&response_type=code&state=' + encodeURIComponent(st);
  }
  function renderAcct() { var b = $('acct'), nk = myNick(); b.textContent = nk || (session() ? '닉네임 연결' : '로그인'); b.className = 'acct' + (nk ? ' on' : ''); }
  $('acct').onclick = function () {
    if (S.run) return;
    var s = session();
    if (!s) return startLogin();
    if (!myNick()) { if (confirm('잠만보에서 카카오 계정에 모임 닉네임을 먼저 연결해 주세요. 잠만보로 갈까요?')) location.href = ROOT; return; }
    if (confirm(myNick() + ' 님으로 로그인돼 있어요.\n로그아웃할까요? (잠만보 앱도 함께 로그아웃돼요)')) { lsSet(LS.auth, null); S.info = null; renderAcct(); home(); }
  };

  /* ================= 서버 ================= */
  function api(fn, args, ms) {
    if (!API) return Promise.reject(new Error('설정 파일(config.js)을 읽지 못했어요'));
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, ms || 25000) : 0;
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, cache: 'no-store', signal: ctl ? ctl.signal : undefined,
      body: JSON.stringify({ fn: fn, args: args || [], env: ENV !== 'prod' ? 'beta' : undefined }) })
      .then(function (r) { if (!r.ok) throw new Error('서버 응답 오류 (' + r.status + ')'); return r.text().then(function (t) { try { return JSON.parse(t); } catch (x) { throw new Error('서버가 바빠요. 잠시 후 다시 시도해 주세요'); } }); })
      .then(function (j) {
        clearTimeout(timer);
        if (!j || !j.ok) {
          var msg = (j && j.e) || '알 수 없는 오류';
          if (/허용되지 않은 요청/.test(msg)) msg = '서버에 기록 기능이 아직 없어요 (Aging.gs 배포 필요)';
          if (/로그인이 만료/.test(msg)) { lsSet(LS.auth, null); renderAcct(); }
          throw new Error(msg);
        }
        return j.r;
      }, function (e) { clearTimeout(timer); throw new Error(e && e.name === 'AbortError' ? '응답이 너무 늦어요. 잠시 후 다시 시도해 주세요' : e instanceof TypeError ? '인터넷 연결을 확인해 주세요' : (e && e.message) || '오류'); });
  }
  function loadInfo() {
    if (!myNick()) { S.info = null; return Promise.resolve(); }
    return api('agingInfo', [token()]).then(function (r) { S.info = r; if (S.view === 'home') home(); }, function (e) { if (S.view === 'home') toast(e.message, true); });
  }

  /* ================= 창 ================= */
  function openModal(html) {
    $('modal').innerHTML = '<div class="mbg" id="mbg"><div class="sheet" role="dialog" aria-modal="true">' + html + '</div></div>';
    $('mbg').addEventListener('click', function (e) { if (e.target.id === 'mbg' || e.target.closest('[data-x]')) closeModal(); });
    return $('mbg').firstChild;
  }
  function closeModal() { $('modal').innerHTML = ''; }

  /* ================= 첫 화면 ================= */
  function setHead(t, s) { $('ttl').textContent = t; $('sub').textContent = s; }
  function home() {
    stopGame(); S.view = 'home'; S.run = null;
    setHead('에이징 커브 검사', '나의 게임 피지컬 나이는?');
    var nick = myNick(), info = S.info, my = info && info.my, pend = pending(), h = '';
    h += '<div class="hero"><div class="em">🕹️</div><h1>게임 피지컬 나이 검사</h1><p>반응 · 조준 · 타이밍 · 두뇌 · 생존 — 미니게임으로 재는 내 손의 나이</p></div>';
    if (pend) h += '<div class="note warn">📝 등록하지 못한 기록 검사 결과가 있어요. <button type="button" class="btn sm" id="retry">다시 등록</button></div>';
    h += '<div class="card week">' + (!nick ? '<span class="ic">🔒</span><div><b>로그인하면 일주일에 한 번 기록</b><small>검사는 로그인 없이도 언제든 할 수 있어요</small></div><button type="button" class="btn sm" id="login" style="margin-left:auto">로그인</button>'
      : !info ? '<span class="ic">⏳</span><div><b>이번 주 기록 확인 중…</b><small>' + esc(nick) + '</small></div>'
      : my.state === 'ready' ? '<span class="ic">📝</span><div><b>이번 주 기록 검사 가능!</b><small>검사를 시작할 때 ‘기록 검사’ 를 고르세요 · ' + md(info.week) + '(월)~</small></div>'
      : my.state === 'done' ? '<span class="ic">✅</span><div><b>이번 주 기록 완료 · ' + my.age + '살</b><small>다음 기록은 ' + md(info.next) + '(월)부터 · 검사는 언제든</small></div>'
      : my.state === 'started' ? '<span class="ic">⏱️</span><div><b>이번 주 기록 검사 진행 중</b><small>다른 기기에서 시작했거나 중간에 나갔어요 · 다음 기록 ' + md(info.next) + '(월)</small></div>'
      : '<span class="ic">⌛</span><div><b>이번 주 기록 미완료</b><small>1시간 안에 끝내지 못했어요 · 다음 기록 ' + md(info.next) + '(월)</small></div>') + '</div>';
    h += '<div class="modes">' +
      '<button type="button" class="mode main" data-mode="quick"><span class="ic">⚡</span><span><b>빠른 검사 · 6종</b><small>약 3분 · 반응 · 사격 · 막타 · 색깔 · 기억 · 광클</small></span><svg class="go" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>' +
      '<button type="button" class="mode" data-mode="full"><span class="ic">🔬</span><span><b>정밀 검사 · 10종</b><small>약 6분 · 따라붙기 · 박자 · 피하기 · 키 콤보까지</small></span><svg class="go" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>' +
      '<button type="button" class="mode" id="prac"><span class="ic">🎮</span><span><b>연습</b><small>하나씩 골라서 · 기록 안 됨 · 이 기기 최고 점수만</small></span><svg class="go" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>' +
      '</div>';
    var last = lsJSON(LS.last);
    if (last && last.p) h += '<div class="card"><h3>🩺 지난 검사 <small>' + esc(last.at || '') + '</small><span class="sp"></span><button type="button" class="btn sm" id="lastRep">진단서 보기</button></h3><div class="hint" style="margin:0">' + last.p.age + '살 · ' + esc(last.p.typeIcon + ' ' + last.p.typeName) + ' · ' + esc(last.p.diag) + '</div></div>';
    if (nick && info) h += rankCard(info);
    h += '<p class="hint">💡 PC는 마우스 · 키보드, 휴대폰은 세로 화면 그대로 하면 돼요. 손가락이 화면을 가리는 게임(따라붙기 · 피하기)은 PC가 조금 유리해요. 재미로 보는 검사예요!</p>';
    $('view').innerHTML = h;
    window.scrollTo(0, 0);
  }

  /* ---------- 순위 ---------- */
  function rankCard(info) {
    var me = myNick(), tab = S.rk, h = '<div class="card"><h3>🏆 순위 <small>' + (info.people || 0) + '명 기록</small></h3><div class="seg" id="rkSeg">' +
      [['week', '이번 주'], ['best', '역대 최고'], ['mine', '내 에이징 커브']].map(function (x) { return '<button type="button" data-rk="' + x[0] + '" class="' + (tab === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>';
    var row = function (o, i, sub) {
      return '<div class="rk' + (o.nick === me ? ' me' : '') + '"><span class="n">' + (i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1) + '</span>' + av(o.nick, 30) + '<div class="t"><b>' + esc(o.nick) + '</b><small>' + esc(sub) + '</small></div><div class="v">' + o.age + '살<small>' + o.score + '점</small></div></div>';
    };
    if (tab === 'week') h += info.weekly && info.weekly.length ? info.weekly.map(function (o, i) { return row(o, i, (o.type || '') + ' · ' + (o.mode === 'full' ? '정밀' : '빠른')); }).join('') : '<div class="empty">이번 주 기록이 아직 없어요. 첫 번째가 되어 보세요!</div>';
    else if (tab === 'best') h += info.best && info.best.length ? info.best.map(function (o, i) { return row(o, i, (o.type || '') + ' · ' + md(o.week) + ' 주'); }).join('') : '<div class="empty">아직 기록이 없어요</div>';
    else h += curve(info.mine || []);
    return h + '<p class="hint">기록 검사는 한 주(월~일)에 한 번 · 시작하면 그 주 기회를 써요. 나이가 어릴수록 위!</p></div>';
  }
  // 내 주별 나이 꺾은선 (위로 갈수록 나이 많음 = 에이징 커브)
  function curve(list) {
    if (!list.length) return '<div class="empty">아직 기록이 없어요. 매주 한 번씩 기록하면 내 에이징 커브가 그려져요 📈</div>';
    var W = 320, H = 150, P = 26, ages = list.map(function (o) { return o.age; });
    var lo = Math.min.apply(null, ages) - 3, hi = Math.max.apply(null, ages) + 3;
    var x = function (i) { return list.length === 1 ? W / 2 : P + i * (W - P * 2) / (list.length - 1); };
    var y = function (a) { return H - 22 - (a - lo) / Math.max(1, hi - lo) * (H - 44); };
    var pts = list.map(function (o, i) { return x(i).toFixed(1) + ',' + y(o.age).toFixed(1); });
    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="주별 피지컬 나이">' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      list.map(function (o, i) { return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(o.age).toFixed(1) + '" r="4" fill="var(--accent)"/><text x="' + x(i).toFixed(1) + '" y="' + (y(o.age) - 9).toFixed(1) + '" text-anchor="middle">' + o.age + '</text>'; }).join('') +
      list.map(function (o, i) { return list.length <= 8 || i % Math.ceil(list.length / 8) === 0 ? '<text x="' + x(i).toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle">' + esc(o.week.slice(5).replace('-', '/')) + '</text>' : ''; }).join('') + '</svg>';
    var d = list.length >= 2 ? list[list.length - 1].age - list[list.length - 2].age : 0;
    var best = list.reduce(function (b, o) { return !b || o.age < b.age ? o : b; }, null);
    return svg + '<p class="hint">' + (list.length >= 2 ? (d < 0 ? '지난 기록보다 <b>' + (-d) + '살 젊어졌어요</b> 💪' : d > 0 ? '지난 기록보다 ' + d + '살… 손목 스트레칭 🙆' : '지난 기록과 같아요') + ' · ' : '') + '가장 젊었던 날: ' + md(best.week) + ' 주 ' + best.age + '살</p>';
  }

  /* ================= 검사 진행 ================= */
  function askRecord(mode) {
    var info = S.info;
    if (!myNick() || !info || !info.my || info.my.state !== 'ready') return begin(mode, null);
    var sh = openModal('<h2>📝 이번 주 기록 검사로 할까요?</h2>' +
      '<p>기록 검사는 <b>일주일에 한 번</b>이에요. <b>시작하는 순간 이번 주 기회를 써요</b> — 중간에 나가거나 마음에 안 들어도 다시 할 수 없어요. 시작 후 1시간 안에 끝내야 기록돼요.</p>' +
      '<p>그냥 검사는 기록 없이 언제든 몇 번이든 할 수 있어요.</p>' +
      '<div class="btns"><button type="button" class="btn pri" id="mRec">📝 기록 검사 시작</button><button type="button" class="btn" id="mFree">그냥 검사 (기록 안 함)</button><button type="button" class="btn" data-x>취소</button></div>');
    sh.querySelector('#mFree').onclick = function () { closeModal(); begin(mode, null); };
    sh.querySelector('#mRec').onclick = function () {
      var b = this; b.disabled = true; b.textContent = '시작하는 중…';
      api('agingStart', [token(), mode]).then(function (r) { closeModal(); begin(mode, { nonce: r.nonce, week: r.week }); }, function (e) { closeModal(); toast(e.message, true); loadInfo(); });
    };
  }
  function begin(mode, rec) {
    var list = mode === 'practice' ? [S.pickGame] : SC.MODES[mode].games;
    S.run = { mode: mode, list: list, i: 0, raw: {}, scores: {}, rec: rec };
    intro();
  }
  function progHTML() {
    var r = S.run; if (r.list.length < 2) return '';
    return '<div class="prog">' + r.list.map(function (id, i) { return '<i class="' + (i < r.i ? 'done' : i === r.i ? 'now' : '') + '"></i>'; }).join('') + '</div>';
  }
  function intro() {
    stopGame(); S.view = 'play';
    var r = S.run, id = r.list[r.i], g = SC.GAMES[id], m = GM[id], best = (lsJSON(LS.best) || {})[id];
    setHead(g.name, r.mode === 'practice' ? '연습' : (r.rec ? '📝 기록 검사 · ' : '') + SC.MODES[r.mode].name + ' ' + (r.i + 1) + ' / ' + r.list.length);
    $('view').innerHTML = progHTML() + '<div class="card intro"><div class="ic">' + m.icon + '</div><h2>' + esc(g.name) + '</h2><p>' + m.how + '</p>' +
      (best ? '<div class="best">이 기기 최고: ' + best.s + '점 (' + esc(rawText(id, best.raw)) + ')</div>' : '') +
      '<div class="btns"><button type="button" class="btn pri" id="go">시작</button></div></div>';
    $('go').onclick = play;
    $('go').focus();
  }
  function stopGame() { if (S.stop) { try { S.stop(); } catch (e) {} S.stop = null; } }
  function play() {
    var r = S.run, id = r.list[r.i];
    $('view').innerHTML = progHTML() + '<div class="hud" id="hud"></div><div class="stage" id="stage"></div>';
    var stage = $('stage'), hud = $('hud'), fin = false;
    S.stop = GM[id].run(stage, function (t) { hud.textContent = t; }, function (raw) {
      if (fin) return; fin = true;
      stopGame();
      gameDone(id, raw);
    });
  }
  function gameDone(id, raw) {
    var r = S.run, s = SC.gameScore(id, raw);
    r.raw[id] = raw; r.scores[id] = s;
    var bestAll = lsJSON(LS.best) || {}, nb = !bestAll[id] || s > bestAll[id].s;
    if (nb) { bestAll[id] = { s: s, raw: raw }; lsSet(LS.best, JSON.stringify(bestAll)); }
    r.i++;
    var last = r.i >= r.list.length;
    $('view').innerHTML = progHTML() + '<div class="card result1"><div class="sc">' + s + '<small>점</small></div><div class="raw">' + esc(rawText(id, raw)) + '</div>' +
      '<div class="age">이 게임 피지컬 나이 ' + SC.ageOf(s) + '살</div>' + (nb && r.mode === 'practice' ? '<div class="hint">🎉 이 기기 최고 기록!</div>' : '') +
      '<div class="btns">' + (r.mode === 'practice' ? '<button type="button" class="btn" id="again">다시</button><button type="button" class="btn pri" id="toPrac">다른 게임</button>'
        : '<button type="button" class="btn pri" id="next">' + (last ? '🩺 진단서 보기' : '다음 게임 →') + '</button>') + '</div></div>';
    if (window.JMB_FX && s >= 85) try { JMB_FX.confetti({ count: 40 }); } catch (e) {}
    if ($('next')) { $('next').onclick = last ? finish : intro; $('next').focus(); }
    if ($('again')) $('again').onclick = function () { r.i = 0; intro(); };
    if ($('toPrac')) $('toPrac').onclick = practice;
  }
  function finish() {
    var r = S.run, p = SC.profile(r.scores), at = new Date().toLocaleDateString('ko-KR');
    var rep = { p: p, scores: r.scores, raw: r.raw, mode: r.mode, at: at, nick: myNick(), rec: r.rec ? 'sending' : '' };
    lsSet(LS.last, JSON.stringify(rep));
    S.run = null;
    if (r.rec) {
      lsSet(LS.pend, JSON.stringify({ nonce: r.rec.nonce, mode: r.mode, raw: r.raw, t: Date.now() }));
      report(rep);
      submit(rep);
    } else report(rep);
  }
  function pending() { var p = lsJSON(LS.pend); if (p && Date.now() - p.t > 3600 * 1000) { lsSet(LS.pend, null); return null; } return p; }
  function submit(rep) {
    var p = pending(); if (!p) return;
    var note = $('recNote'); if (note) { note.className = 'note warn'; note.textContent = '📝 기록 등록 중…'; }
    api('agingSubmit', [token(), p.nonce, { mode: p.mode, raw: p.raw }]).then(function (r) {
      lsSet(LS.pend, null);
      if (rep) { rep.rec = 'done'; rep.p = r.profile; rep.scores = r.scores; lsSet(LS.last, JSON.stringify(rep)); if (S.view === 'report') report(rep); }
      toast('이번 주 기록 완료! ' + r.profile.age + '살');
      loadInfo();
    }, function (e) {
      var n = $('recNote');
      if (/찾을 수 없|1시간|너무 빨리|이상해서/.test(e.message)) { lsSet(LS.pend, null); if (n) { n.className = 'note bad'; n.textContent = '기록하지 못했어요: ' + e.message; } return; }
      if (n) { n.className = 'note bad'; n.innerHTML = esc('기록 등록 실패: ' + e.message) + ' <button type="button" class="btn sm" id="retry">다시 등록</button>'; }
    });
  }

  /* ================= 진단서 ================= */
  function report(rep) {
    stopGame(); S.view = 'report';
    setHead('진단서', (rep.rec ? '📝 기록 검사 · ' : '') + (SC.MODES[rep.mode] ? SC.MODES[rep.mode].name : ''));
    var p = rep.p, ids = Object.keys(rep.scores);
    var cats = Object.keys(SC.CATS).filter(function (c) { return p.cats[c] != null; });
    var h = (rep.rec === 'sending' ? '<div class="note warn" id="recNote">📝 기록 등록 중…</div>' : rep.rec === 'done' ? '<div class="note ok" id="recNote">✅ 이번 주 기록으로 등록했어요 — 순위에 올라가요</div>' : '') +
      '<div class="report" id="report"><div class="hd"><b>🩺 게임 피지컬 진단서</b><small>잠만보 에이징 커브 검사</small></div>' +
      '<div class="who"><div class="face">' + faceOf(p.age) + av(rep.nick, 28) + '</div><div class="age">' + (rep.nick ? esc(rep.nick) + ' 님의 ' : '나의 ') + '게임 피지컬 나이<b>' + p.age + '<small>살</small></b>종합 ' + p.score + '점</div></div>' +
      '<div class="dg"><small>진단명</small><b>' + esc(p.diag) + '</b><p>' + esc(p.diagNote) + '</p></div>' +
      '<div class="ty"><b>' + esc(p.typeIcon + ' ' + p.typeName) + '</b><p>' + esc(p.typeDesc) + '</p><div class="gen">추천 장르 · ' + esc(p.genre) + '</div></div>' +
      '<div class="cats">' + cats.map(function (c) { return '<div class="cat"><span>' + SC.CATS[c] + '</span><span class="b"><i style="width:' + p.cats[c] + '%;background:var(--c-' + c + ')"></i></span><span>' + p.cats[c] + '</span></div>'; }).join('') + '</div>' +
      '<div class="glist">' + ids.map(function (id) { return '<div class="gl"><span>' + GM[id].icon + '</span><span class="nm">' + esc(SC.GAMES[id].name) + ' <span class="rv">' + esc(rawText(id, rep.raw[id])) + '</span></span><span class="s">' + rep.scores[id] + '점</span></div>'; }).join('') + '</div>' +
      '<div class="ft"><span>' + esc(rep.at) + ' · ' + esc(SC.MODES[rep.mode] ? SC.MODES[rep.mode].name : '') + '</span>' + (rep.rec === 'done' ? '<span class="stamp">기록</span>' : '<span>재미로 보는 검사</span>') + '</div></div>' +
      '<div class="btns"><button type="button" class="btn" id="cap">📷 이미지 저장</button><button type="button" class="btn" id="copy">📋 결과 복사</button></div>' +
      '<div class="btns" style="margin-top:8px"><button type="button" class="btn" id="home2">처음으로</button><button type="button" class="btn pri" id="again2">🔁 다시 검사</button></div>';
    $('view').innerHTML = h;
    window.scrollTo(0, 0);
    if (window.JMB_FX && p.age <= 25) try { JMB_FX.confetti({ count: 80 }); } catch (e) {}
    $('cap').onclick = function () { if (!window.JMB_FX) return; JMB_FX.capture($('report'), '게임피지컬나이_' + p.age).catch(function () { toast('이미지를 만들지 못했어요', true); }); };
    $('copy').onclick = function () {
      var t = '🩺 잠만보 에이징 커브 검사\n' + (rep.nick ? rep.nick + ' 님의 ' : '') + '게임 피지컬 나이: ' + p.age + '살 (' + p.score + '점)\n진단명: ' + p.diag + '\n유형: ' + p.typeIcon + ' ' + p.typeName + '\n' +
        cats.map(function (c) { return SC.CATS[c] + ' ' + p.cats[c]; }).join(' · ') + '\n👉 ' + location.origin + location.pathname;
      (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('복사했어요'); }, function () { toast('복사하지 못했어요', true); });
    };
    $('home2').onclick = function () { home(); };
    $('again2').onclick = function () { askRecord(rep.mode === 'practice' ? 'quick' : rep.mode); };
  }

  /* ================= 연습 ================= */
  function practice() {
    stopGame(); S.view = 'practice'; S.run = null;
    setHead('연습', '하나씩 골라서 · 기록 안 됨');
    var best = lsJSON(LS.best) || {};
    $('view').innerHTML = '<div class="prac">' + Object.keys(SC.GAMES).map(function (id) {
      var b = best[id];
      return '<button type="button" data-g="' + id + '"><span class="ic">' + GM[id].icon + '</span><span><b>' + esc(SC.GAMES[id].name) + '</b><small>' + (b ? '최고 ' + b.s + '점 · ' + SC.ageOf(b.s) + '살' : SC.CATS[SC.GAMES[id].cat]) + '</small></span></button>';
    }).join('') + '</div><p class="hint">연습 점수는 이 기기에만 저장돼요 (순위 기록은 기록 검사로).</p>';
    window.scrollTo(0, 0);
  }

  /* ================= 이벤트 ================= */
  $('back').onclick = function () {
    if (S.view === 'play' && S.run) {
      var msg = S.run.rec ? '기록 검사를 그만둘까요?\n이번 주 기록 기회는 다시 쓸 수 없어요.' : '검사를 그만둘까요?';
      if (!confirm(msg)) return;
      home(); return;
    }
    if (S.view === 'home') { location.href = ROOT; return; }
    home();
  };
  $('view').addEventListener('click', function (e) {
    var m = e.target.closest('[data-mode]'); if (m) return askRecord(m.getAttribute('data-mode'));
    var g = e.target.closest('[data-g]'); if (g) { S.pickGame = g.getAttribute('data-g'); return begin('practice', null); }
    var rk = e.target.closest('[data-rk]'); if (rk) { S.rk = rk.getAttribute('data-rk'); lsSet(LS.rk, S.rk); return home(); }
    if (e.target.closest('#prac')) return practice();
    if (e.target.closest('#login')) return startLogin();
    if (e.target.closest('#lastRep')) { var l = lsJSON(LS.last); if (l) report(l); return; }
    if (e.target.closest('#retry')) { var rep = lsJSON(LS.last); submit(rep && rep.rec ? rep : null); return; }
  });
  window.addEventListener('beforeunload', function (e) { if (S.run && S.run.rec) { e.preventDefault(); e.returnValue = ''; } });

  /* ================= 시작 ================= */
  if (/[?&]reset\b/.test(location.search)) history.replaceState(null, '', location.pathname);
  renderAcct();
  home();
  loadInfo();
  window.JMB_AGING = { VER: VER };
})();
