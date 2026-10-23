/*! 잠만보 티츄 — 화면 v1.2.0
 * 서버: Apps Script (config.js 의 api) · 규칙 판정: engine.js(TE, 서버와 같은 코드)
 * 화면 주소: #/ 로비 · #/rank 랭킹 · #/me 내 전적 · #/rules 규칙 · #/room/<방ID> 방
 */
(function () {
  'use strict';
  var CFG = window.TICHU_CONFIG || {};
  var ENV_SFX = CFG.env && CFG.env !== 'prod' ? '_' + CFG.env : '';
  var LS_TOKEN = 'tichu_token' + ENV_SFX, LS_NOAUTO = 'tichu_noauto' + ENV_SFX, LS_SOUND = 'tichu_sound', LS_SEEN = 'tichu_seen_rules';
  var KAKAO_STORE = 'jmb_kakao_v2' + ENV_SFX, KAKAO_STATE = 'jmb_kakao_state' + ENV_SFX;
  var ROOT = (function () { var seg = location.pathname.split('/')[1] || ''; return /\.github\.io$/.test(location.hostname) && seg ? '/' + seg + '/' : '/'; })();
  var app = document.getElementById('app'), modalEl = document.getElementById('modal'), toastsEl = document.getElementById('toasts');

  var S = {
    token: null, user: null, route: { name: 'boot' }, lobby: null, rank: null, rec: null, notice: '',
    room: null, roomId: null, roomPw: '', sel: [], exch: [null, null, null], exSlot: 0, exRound: 0,
    lastSeq: 0, seqMatch: '', polling: false, pollSeq: 0, optim: null, backAt: 0, guard: false, lastChat: 0, unread: 0, offset: 0, busy: false, pollT: 0, lobbyT: 0,
    modal: null, resultShown: '', recvShown: '', sound: lsGet(LS_SOUND) !== '0', chatOpen: false, flash: {}
  };

  /* ================= 공통 ================= */
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function now() { return Date.now() + S.offset; }
  function toast(msg, err) {
    var d = document.createElement('div');
    d.className = 'toast' + (err ? ' err' : '');
    d.textContent = msg;
    toastsEl.appendChild(d);
    setTimeout(function () { d.remove(); }, err ? 3800 : 2600);
    while (toastsEl.children.length > 3) toastsEl.firstChild.remove();
  }
  function banner(text, cls) {
    var d = document.createElement('div');
    d.className = 'banner ' + (cls || '');
    d.textContent = text;
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 1500);
  }
  function initial(name) { name = String(name || '?').replace(/봇$/, ''); return esc(Array.from(name)[0] || '?'); }

  /* ----- 소리 (WebAudio로 즉석 합성, 파일 없음) ----- */
  var actx = null;
  function ac() {
    if (!S.sound) return null;
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); return actx; } catch (e) { return null; }
  }
  function tone(c, f, t, d, type, vol, f2) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.08, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + 0.05);
  }
  var noiseBuf = null;
  function noise(c, t, d, vol, cutoff) {
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); var ch = noiseBuf.getChannelData(0); for (var i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1; }
    var src = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf; fl.type = 'lowpass'; fl.frequency.value = cutoff || 1200;
    g.gain.setValueAtTime(vol || 0.1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(fl); fl.connect(g); g.connect(c.destination); src.start(t); src.stop(t + d + 0.05);
  }
  function seq(c, t, notes, step, dur, type, vol) { notes.forEach(function (f, i) { tone(c, f, t + i * step, dur, type, vol); }); }
  var N = { G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, D6: 1174.7, E6: 1318.5, G6: 1568 };
  function sfx(name, delay) {
    var c = ac(); if (!c) return;
    var t = c.currentTime + (delay || 0);
    switch (name) {
      case 'tap': tone(c, 1300, t, 0.03, 'square', 0.012); break;
      case 'play': noise(c, t, 0.06, 0.05, 2600); tone(c, 360, t, 0.08, 'triangle', 0.05, 260); break;            // 카드 내려놓는 소리
      case 'pass': tone(c, 230, t, 0.12, 'sine', 0.025, 180); break;
      case 'combo': noise(c, t, 0.05, 0.04, 2600); seq(c, t, [N.C5, N.E5, N.G5, N.C6], 0.055, 0.18, 'triangle', 0.05); break;   // 트리플·스트레이트·연속 페어
      case 'bigcombo': noise(c, t, 0.05, 0.05, 2600); seq(c, t, [N.C5, N.E5, N.G5, N.B5, N.D6, N.E6, N.G6], 0.045, 0.2, 'triangle', 0.05); break;   // 긴 스트레이트·풀하우스
      case 'dragon': tone(c, 110, t, 0.7, 'sawtooth', 0.06, 60); noise(c, t, 0.6, 0.07, 700); seq(c, t + 0.28, [N.G5, N.B5, N.D6, N.G6], 0.07, 0.3, 'triangle', 0.05); break;
      case 'phoenix': seq(c, t, [N.A5, 1108.7, N.E6, 1760], 0.05, 0.35, 'sine', 0.045); tone(c, 2200, t + 0.2, 0.4, 'sine', 0.02, 3300); break;
      case 'dog': tone(c, 520, t, 0.08, 'square', 0.035, 340); tone(c, 560, t + 0.13, 0.1, 'square', 0.035, 330); break;
      case 'bird': tone(c, 2000, t, 0.06, 'sine', 0.04, 2700); tone(c, 2300, t + 0.09, 0.08, 'sine', 0.04, 3000); break;
      case 'bomb': noise(c, t, 0.9, 0.3, 380); tone(c, 95, t, 0.8, 'sawtooth', 0.12, 32); tone(c, 60, t + 0.05, 0.9, 'sine', 0.15, 30); break;
      case 'turn': tone(c, N.E5, t, 0.15, 'sine', 0.08); tone(c, N.A5, t + 0.12, 0.25, 'sine', 0.08); if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} } break;
      case 'trickUs': seq(c, t, [N.E5, N.G5], 0.07, 0.16, 'sine', 0.05); break;
      case 'trickBig': seq(c, t, [N.C5, N.E5, N.G5, N.C6], 0.06, 0.25, 'sine', 0.06); break;
      case 'tichu': seq(c, t, [N.G4, N.C5, N.E5], 0.1, 0.18, 'square', 0.035); tone(c, N.G5, t + 0.3, 0.5, 'square', 0.04); break;
      case 'out': seq(c, t, [N.G5, N.B5, N.D6, N.G6], 0.08, 0.3, 'triangle', 0.06); break;
      case 'round': [N.C5, N.E5, N.G5].forEach(function (f) { tone(c, f, t, 0.7, 'sine', 0.04); }); break;
      case 'onetwo': seq(c, t, [N.C5, N.E5, N.G5, N.C6, N.G5, N.C6, N.E6], 0.09, 0.3, 'square', 0.035); break;
      case 'win': seq(c, t, [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6], 0.12, 0.4, 'triangle', 0.06); [N.C5, N.E5, N.G5].forEach(function (f) { tone(c, f * 2, t + 0.75, 0.9, 'sine', 0.035); }); break;
      case 'lose': seq(c, t, [N.G5, N.E5, N.C5, N.G4], 0.18, 0.4, 'triangle', 0.05); break;
      case 'tick': tone(c, 1500, t, 0.04, 'square', 0.02); break;
      case 'chat': tone(c, 900, t, 0.06, 'sine', 0.035, 1250); break;
    }
  }
  // 낸 조합에 맞는 소리
  function comboSound(c, bomb) {
    if (bomb) return 'bomb';
    if (!c) return 'play';
    if (c.t === 'dog') return 'dog';
    if (c.t === 'single' && c.r === 15) return 'dragon';
    if (c.t === 'single' && c.ph) return 'phoenix';
    if (c.c && c.c.indexOf('MA') >= 0) return 'bird';
    if ((c.t === 'straight' && c.n >= 8) || (c.t === 'pairs' && c.n >= 6) || c.t === 'full') return 'bigcombo';
    if (c.t === 'straight' || c.t === 'pairs' || c.t === 'triple') return 'combo';
    return 'play';
  }

  /* ----- 서버 호출 ----- */
  function api(fn, a, timeoutMs) {
    if (!CFG.api || /^YOUR_/.test(CFG.api)) return Promise.reject(new Error('티츄 서버 주소(tichu/config.js)가 아직 설정되지 않았어요'));
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, (timeoutMs || 0) + 25000) : 0;
    return fetch(CFG.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: fn, t: S.token || '', a: a || {} }), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('서버 응답 오류 (' + r.status + ')'); return r.json(); })
      .then(function (j) {
        clearTimeout(timer);
        if (j && j.now) S.offset = j.now - Date.now();
        if (!j || !j.ok) {
          var e = new Error((j && j.e) || '알 수 없는 오류');
          e.code = j && j.code;
          if (e.code === 'auth' || e.code === 'maint') logout(e.message);
          throw e;
        }
        return j.r;
      }, function (e) {
        clearTimeout(timer);
        if (e && e.code) throw e;
        throw new Error(e && e.name === 'AbortError' ? '응답이 너무 늦어요. 잠시 후 다시 시도해 주세요' : (e && /서버 응답/.test(e.message) ? e.message : '인터넷 연결을 확인해 주세요'));
      });
  }

  /* ================= 카드 그리기 ================= */
  var SUIT_SVG = {
    J: '<path fill-rule="evenodd" d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zM8.7 8.7h6.6v6.6H8.7z"/>',
    S: '<path d="M12 1.5l2.3 3.2v10.1h2.6v2.3h-3.4v5.4h-3v-5.4H7.1v-2.3h2.6V4.7z"/>',
    P: '<path d="M12 1.5l7 4.3H5zM7.2 6.8h9.6v2.6H7.2zM3.5 10.6l8.5-1 8.5 1-1.8 2.2H5.3zM7.8 13.6h8.4v3.2H7.8zM2.5 17.8l9.5-1.1 9.5 1.1-2 3.2h-15z"/>',
    T: '<path d="M12 1.8l3 6.4 7 .8-5.2 4.8 1.4 7-6.2-3.6-6.2 3.6 1.4-7L2 9l7-.8z"/>'
  };
  var SPECIAL = { MA: ['1', '雀'], DO: ['개', '犬'], PH: ['봉', '鳳'], DR: ['용', '龍'] };
  function svg(s, cls) { return '<svg class="' + cls + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + SUIT_SVG[s] + '</svg>'; }
  function cardHTML(id, extra, size) {
    var cls = 'card' + (size ? ' ' + size : '') + (extra ? ' ' + extra : ''), label = TE.cardLabel(id);
    if (SPECIAL[id]) return '<div class="' + cls + ' ' + id + '" data-c="' + id + '" title="' + label + '" aria-label="' + label + '"><span class="r">' + SPECIAL[id][0] + '</span><span class="han">' + SPECIAL[id][1] + '</span></div>';
    var s = id[0], r = TE.rankLabel(TE.rank(id));
    return '<div class="' + cls + ' ' + s + '" data-c="' + id + '" title="' + label + '" aria-label="' + label + '"><span class="r">' + r + '</span>' + svg(s, 'su') + svg(s, 'big') + '</div>';
  }
  function cardsHTML(ids, size) { return '<div class="cards ' + (size || '') + '">' + ids.map(function (c) { return cardHTML(c, '', size); }).join('') + '</div>'; }

  /* ================= 로그인 ================= */
  function kakaoSession() { try { var s = JSON.parse(lsGet(KAKAO_STORE) || 'null'); return s && s.token ? s : null; } catch (e) { return null; } }
  function tokenInfo(t) {
    try { var b = t.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'); var p = JSON.parse(decodeURIComponent(escape(atob(b + '==='.slice((b.length + 3) % 4))))); return p; } catch (e) { return null; }
  }
  function setLogin(r) {
    S.token = r.token; S.user = r.user;
    lsSet(LS_TOKEN, r.token); lsSet(LS_NOAUTO, null);
  }
  function logout(msg) {
    S.token = null; S.user = null; lsSet(LS_TOKEN, null);
    stopPoll();
    if (msg) toast(msg, true);
    if (S.route.name !== 'login') { location.hash = '#/'; renderLogin(); }
  }

  function startKakao() {
    if (!CFG.kakaoRestKey) return toast('카카오 로그인 설정을 찾지 못했어요', true);
    var st; try { st = [].slice.call(crypto.getRandomValues(new Uint32Array(4))).join(''); } catch (e) { st = String(Math.random()).slice(2) + Date.now(); }
    lsSet(KAKAO_STATE, JSON.stringify({ s: st, t: Date.now() }));
    try { sessionStorage.setItem('jmb_after_login', location.pathname + location.hash); } catch (e) {}
    location.href = 'https://kauth.kakao.com/oauth/authorize?client_id=' + encodeURIComponent(CFG.kakaoRestKey) +
      '&redirect_uri=' + encodeURIComponent(location.origin + ROOT) + '&response_type=code&state=' + encodeURIComponent(st);
  }

  function loginKakao(btn) {
    var ks = kakaoSession();
    if (!ks) return startKakao();
    if (btn) { btn.disabled = true; btn.textContent = '확인 중…'; }
    return api('loginKakao', { token: ks.token }).then(function (r) { setLogin(r); toast(r.user.name + '님, 환영해요!'); route(); }, function (e) {
      if (btn) { btn.disabled = false; btn.textContent = '카카오로 계속하기'; }
      if (e.code === 'nolink') { renderLogin('잠만보 사이트에서 카카오 계정에 모임 닉네임을 먼저 연결해 주세요.'); return; }
      if (e.code === 'kakao') { lsSet(KAKAO_STORE, null); renderLogin(e.message); return; }
      renderLogin(e.message);
    });
  }

  function renderLogin(errMsg) {
    S.route = { name: 'login' };
    stopPoll(); clearInterval(S.lobbyT);
    var ks = kakaoSession(), nick = ks && ks.user && ks.user.nickname;
    app.innerHTML =
      '<div class="login">' +
      '<div class="mini-cards">' + ['DR', 'T14', 'PH', 'MA'].map(function (c) { return cardHTML(c); }).join('') + '</div>' +
      '<h1>잠만보 티츄</h1><p class="sub">잠만보 보드게임 모임 회원 전용 · 2 대 2 팀 클라이밍 카드게임</p>' +
      '<div class="box">' +
      (CFG.kakaoRestKey ? (ks ? '<button class="btn kakao block" id="kGo">' + (nick ? esc(nick) + '님으로 계속하기' : '카카오로 계속하기') + '</button>' :
        '<button class="btn kakao block" id="kStart">카카오 로그인</button><div class="small">잠만보 사이트와 같은 카카오 로그인이에요. 모임 닉네임이 연결된 회원만 들어올 수 있어요.</div>') : '') +
      '<div class="or">테스트 계정</div>' +
      '<form id="lf" class="field" autocomplete="on">' +
      '<input class="input" id="lid" placeholder="아이디" autocomplete="username" autocapitalize="off" required>' +
      '<input class="input" id="lpw" type="password" placeholder="비밀번호" autocomplete="current-password" required style="margin-top:8px">' +
      '<div class="err" id="lerr">' + esc(errMsg || '') + '</div>' +
      '<button class="btn primary block" type="submit" id="lbtn">로그인</button></form>' +
      '</div>' +
      '<a class="small" href="' + ROOT + '">← 잠만보로 돌아가기</a>' +
      '</div>';
    var kg = $('#kGo'); if (kg) kg.onclick = function () { loginKakao(kg); };
    var ks2 = $('#kStart'); if (ks2) ks2.onclick = startKakao;
    $('#lf').onsubmit = function (ev) {
      ev.preventDefault();
      var b = $('#lbtn'); b.disabled = true; b.textContent = '확인 중…';
      api('login', { id: $('#lid').value, pw: $('#lpw').value }).then(function (r) { setLogin(r); toast(r.user.name + '님, 환영해요!'); route(); }, function (e) {
        b.disabled = false; b.textContent = '로그인'; $('#lerr').textContent = e.message;
      });
    };
  }

  /* ================= 라우팅 ================= */
  function parseHash() {
    var h = location.hash.replace(/^#\/?/, '').split('/');
    if (h[0] === 'room' && h[1]) return { name: 'room', id: decodeURIComponent(h[1]).replace(/[^0-9A-Z]/g, '') };
    if (h[0] === 'rank' || h[0] === 'me' || h[0] === 'rules') return { name: h[0] };
    return { name: 'lobby' };
  }
  function route() {
    document.body.classList.remove('ingame');
    if (!S.token) return renderLogin();
    var r = parseHash();
    closeModal();
    if (r.name !== 'room') { stopPoll(); S.room = null; S.roomId = null; S.guard = false; S.pollSeq++; S.polling = false; }
    S.route = r;
    clearInterval(S.lobbyT);
    if (r.name === 'room') return enterRoom(r.id);
    renderLobby();
    if (r.name === 'lobby') { loadLobby(); S.lobbyT = setInterval(function () { if (!document.hidden && S.route.name === 'lobby' && !S.modal) loadLobby(); }, 6000); }
    if (r.name === 'rank') loadRank();
    if (r.name === 'me') loadRecords();
  }
  window.addEventListener('hashchange', route);
  // 방 안에서 휴대폰 뒤로가기: 창이 열려 있으면 창만 닫고, 아니면 '한 번 더 누르면 나가요' → 2초 안에 또 누르면 로비로
  function armGuard() {
    if (S.route.name !== 'room' || S.guard) return;
    try { history.pushState({ tichuGuard: 1 }, '', location.href); S.guard = true; } catch (e) {}
  }
  window.addEventListener('popstate', function () {
    if (!S.guard || S.route.name !== 'room') return;
    S.guard = false;
    if (S.modal) { closeModal(); armGuard(); return; }
    if (Date.now() - S.backAt < 2000) { S.backAt = 0; location.hash = '#/'; return; }
    S.backAt = Date.now();
    toast('한 번 더 누르면 로비로 나가요');
    armGuard();
  });
  window.addEventListener('beforeunload', function (e) {
    var r = S.room;
    if (S.route.name === 'room' && r && r.status === 'play' && r.me >= 0) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ================= 로비 ================= */
  function header() {
    return '<div class="hdr"><div class="title"><span class="logo-mark">T</span>잠만보 티츄</div>' +
      '<button class="chip" id="meChip">' + esc(S.user ? S.user.name : '') + ' ▾</button></div>';
  }
  function tabbar(on) {
    var t = [['lobby', '#/', '🃏', '방 목록'], ['rank', '#/rank', '🏆', '랭킹'], ['me', '#/me', '📊', '내 전적'], ['rules', '#/rules', '📖', '규칙']];
    return '<nav class="tabbar"><div class="in">' + t.map(function (x) { return '<button data-go="' + x[1] + '" class="' + (on === x[0] ? 'on' : '') + '"><span class="ic">' + x[2] + '</span>' + x[3] + '</button>'; }).join('') + '</div></nav>';
  }
  function renderLobby() {
    var r = S.route.name, body = '';
    if (r === 'lobby') body = lobbyBody();
    else if (r === 'rank') body = rankBody();
    else if (r === 'me') body = recBody();
    else body = rulesBody();
    app.innerHTML = '<div class="shell">' + header() + '<div class="content">' + body + '</div>' + tabbar(r) + '</div>';
    bindShell();
  }
  function bindShell() {
    $$('[data-go]').forEach(function (b) { b.onclick = function () { location.hash = b.getAttribute('data-go'); }; });
    var mc = $('#meChip'); if (mc) mc.onclick = accountMenu;
    var bc = $('#bCreate'); if (bc) bc.onclick = createRoomSheet;
    var bp = $('#bPractice'); if (bp) bp.onclick = function () { practice(bp); };
    var br = $('#bRefresh'); if (br) br.onclick = function () { loadLobby(true); };
    $$('[data-join]').forEach(function (b) { b.onclick = function () { joinRoom(b.getAttribute('data-join'), b.getAttribute('data-lock') === '1'); }; });
    $$('[data-watch]').forEach(function (b) { b.onclick = function () { location.hash = '#/room/' + b.getAttribute('data-watch'); }; });
  }
  function accountMenu() {
    openModal('<h2>' + esc(S.user.name) + '<button class="x" data-x>✕</button></h2>' +
      '<div class="small">' + esc(S.user.kind) + ' 계정' + (CFG.env !== 'prod' ? ' · ' + esc(CFG.env) + ' 환경' : '') + '</div>' +
      '<div class="menu-list">' +
      '<button class="btn block" id="mSound">소리 ' + (S.sound ? '끄기' : '켜기') + '</button>' +
      '<a class="btn block" href="' + ROOT + '">잠만보 홈으로</a>' +
      '<button class="btn danger block" id="mOut">로그아웃</button></div>');
    $('#mSound').onclick = function () { S.sound = !S.sound; lsSet(LS_SOUND, S.sound ? '1' : '0'); closeModal(); toast('소리를 ' + (S.sound ? '켰어요' : '껐어요')); };
    $('#mOut').onclick = function () { lsSet(LS_NOAUTO, '1'); closeModal(); logout(); toast('로그아웃했어요'); };
  }

  function loadLobby(manual) {
    api('lobby').then(function (r) {
      S.lobby = r.rooms; S.notice = r.notice || ''; if (r.user) S.user = r.user;
      if (S.route.name === 'lobby' && !S.modal) renderLobby();
      if (manual) toast('새로고침했어요');
    }, function (e) { if (S.route.name === 'lobby') toast(e.message, true); });
  }
  function seatLine(seats, i) {
    var s = seats[i];
    return '<span class="' + (i % 2 ? 'tB' : 'tA') + '">' + (s ? (s.b ? '🤖 ' : '') + esc(s.n) : '<i style="opacity:.5">빈자리</i>') + '</span>';
  }
  function lobbyBody() {
    var h = '';
    if (S.notice) h += '<div class="notice">📢 ' + esc(S.notice) + '</div>';
    h += '<div class="cta"><button class="btn primary" id="bPractice">🤖 AI와 연습<small>봇 3명과 바로 시작</small></button>' +
      '<button class="btn" id="bCreate">＋ 방 만들기<small>친구들과 2 대 2</small></button></div>';
    h += '<div class="sec-title"><span>열린 방</span><button class="btn sm ghost" id="bRefresh">↻ 새로고침</button></div>';
    if (!S.lobby) return h + '<div class="empty">불러오는 중…</div>';
    if (!S.lobby.length) return h + '<div class="empty">열린 방이 없어요.<br>방을 만들고 단톡방에 초대 링크를 보내 보세요!</div>';
    h += '<div class="rooms">' + S.lobby.map(function (r) {
      var filled = r.seats.filter(Boolean).length, st = r.st === 'wait' ? '<span class="st wait">대기 ' + filled + '/4</span>' : r.st === 'play' ? '<span class="st play">진행 중 · ' + r.round + '라운드</span>' : '<span class="st end">끝남</span>';
      var btn = r.mine ? '<button class="btn sm primary" data-watch="' + r.id + '">돌아가기</button>' :
        r.st === 'wait' && filled < 4 ? '<button class="btn sm primary" data-join="' + r.id + '" data-lock="' + (r.lock ? 1 : 0) + '">입장</button>' :
        !r.lock ? '<button class="btn sm" data-watch="' + r.id + '">관전</button>' : '';
      return '<div class="room-card' + (r.mine ? ' mine' : '') + '"><div class="top"><span class="name">' + (r.lock ? '🔒 ' : '') + esc(r.name) + '</span>' + st + '</div>' +
        '<div class="seats">' + seatLine(r.seats, 0) + seatLine(r.seats, 1) + seatLine(r.seats, 2) + seatLine(r.seats, 3) + '</div>' +
        '<div class="meta"><span>🎯 ' + r.target + '점</span><span>⏱ ' + (r.timer ? r.timer + '초' : '없음') + '</span>' +
        (r.scores ? '<span><b class="tA">' + r.scores[0] + '</b> : <b class="tB">' + r.scores[1] + '</b></span>' : '') + '<span class="sp"></span>' + btn + '</div></div>';
    }).join('') + '</div>';
    return h;
  }

  function practice(btn) {
    btn.disabled = true;
    api('create', { practice: true, target: 500, timer: 0 }).then(function (r) { applyRoom(r, true); location.hash = '#/room/' + r.id; }, function (e) { btn.disabled = false; toast(e.message, true); });
  }

  function optSeg(name, vals, cur, fmt) {
    return '<div class="seg" data-seg="' + name + '">' + vals.map(function (v) { return '<button type="button" data-v="' + v + '" class="' + (String(v) === String(cur) ? 'on' : '') + '">' + fmt(v) + '</button>'; }).join('') + '</div>';
  }
  function bindSeg(root) {
    $$('[data-seg]', root).forEach(function (sg) { $$('button', sg).forEach(function (b) { b.onclick = function () { $$('button', sg).forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); }; }); });
  }
  // 목표 점수: 직접 입력이 있으면 그 값, 없으면 고른 버튼
  function targetVal(root) {
    var inp = $('#oTarget', root), v = inp && inp.value.trim();
    if (v) return Math.max(100, Math.min(3000, Math.round(+v / 10) * 10)) || 500;
    return +segVal(root, 'target') || 500;
  }
  function bindTarget(root) {
    var inp = $('#oTarget', root); if (!inp) return;
    inp.oninput = function () { if (inp.value) $$('[data-seg="target"] button', root).forEach(function (x) { x.classList.remove('on'); }); };
    $$('[data-seg="target"] button', root).forEach(function (b) { b.addEventListener('click', function () { inp.value = ''; }); });
  }
  function segVal(root, name) { var b = $('[data-seg="' + name + '"] button.on', root); return b ? b.getAttribute('data-v') : null; }

  function roomOptForm(o) {
    o = o || { name: '', target: 500, timer: 45, pw: '' };
    var preset = [200, 400, 500].indexOf(+o.target) >= 0;
    return '<div class="field"><label>방 이름</label><input class="input" id="oName" maxlength="24" placeholder="' + esc(S.user.name) + '님의 방" value="' + esc(o.name) + '"></div>' +
      '<div class="field"><label>목표 점수</label>' + optSeg('target', [200, 400, 500], preset ? o.target : '', function (v) { return v + '점'; }) +
        '<input class="input" id="oTarget" type="number" inputmode="numeric" min="100" max="3000" step="10" placeholder="직접 입력 (100~3000점)" value="' + (preset ? '' : esc(o.target)) + '" style="margin-top:6px"></div>' +
      '<div class="field"><label>턴 시간 (넘기면 자동 진행)</label>' + optSeg('timer', [0, 20, 30, 45, 60, 90], o.timer, function (v) { return v ? v + '초' : '없음'; }) + '</div>' +
      '<div class="field"><label>방 비밀번호 (선택, 숫자·영문)</label><input class="input" id="oPw" maxlength="8" inputmode="text" autocomplete="off" value="' + esc(o.pw || '') + '"></div>';
  }
  function createRoomSheet() {
    openModal('<h2>방 만들기<button class="x" data-x>✕</button></h2>' + roomOptForm() + '<button class="btn primary block" id="oGo">만들기</button>');
    bindSeg(modalEl); bindTarget(modalEl);
    $('#oGo').onclick = function () {
      var b = $('#oGo'); b.disabled = true;
      api('create', { name: $('#oName').value, target: targetVal(modalEl), timer: +segVal(modalEl, 'timer'), pw: $('#oPw').value }).then(function (r) {
        closeModal(); applyRoom(r, true); location.hash = '#/room/' + r.id;
      }, function (e) { b.disabled = false; toast(e.message, true); });
    };
  }

  function joinRoom(id, lock, seat) {
    function go(pw) {
      return api('join', { room: id, pw: pw || '', seat: seat === undefined ? '' : seat }).then(function (r) {
        S.roomPw = pw || ''; closeModal(); applyRoom(r, true); location.hash = '#/room/' + id;
      }, function (e) { if (e.code === 'pw') { toast(e.message, true); ask(); } else toast(e.message, true); });
    }
    function ask() {
      openModal('<h2>비밀번호<button class="x" data-x>✕</button></h2><input class="input" id="jPw" maxlength="8" autocomplete="off"><button class="btn primary block" id="jGo">입장</button>');
      $('#jPw').focus();
      $('#jGo').onclick = function () { go($('#jPw').value); };
    }
    if (lock) ask(); else go('');
  }

  /* ----- 랭킹 · 전적 · 규칙 ----- */
  function loadRank() { api('ranking').then(function (r) { S.rank = r.list; if (S.route.name === 'rank') renderLobby(); }, function (e) { toast(e.message, true); }); }
  function loadRecords() { api('records').then(function (r) { S.rec = r; if (S.route.name === 'me') renderLobby(); }, function (e) { toast(e.message, true); }); }
  function pct(a, b) { return a + b ? Math.round(a / (a + b) * 100) + '%' : '-'; }
  function rankBody() {
    var h = '<div class="sec-title">랭킹 <span class="small">레이팅은 사람 4명이 끝까지 한 게임만 반영</span></div>';
    if (!S.rank) return h + '<div class="empty">불러오는 중…</div>';
    if (!S.rank.length) return h + '<div class="empty">아직 기록이 없어요. 첫 판의 주인공이 되어 보세요!</div>';
    return h + '<div style="overflow-x:auto"><table class="table-list"><thead><tr><th>#</th><th>이름</th><th>레이팅</th><th>승/패</th><th>승률</th><th>티츄</th><th>1등률</th></tr></thead><tbody>' +
      S.rank.map(function (p, i) {
        var med = i < 3 && p.ranked ? '<span class="medal">' + ['🥇', '🥈', '🥉'][i] + '</span>' : String(i + 1);
        return '<tr class="' + (S.user && p.name === S.user.name ? 'me' : '') + '"><td>' + med + '</td><td class="n">' + esc(p.name) + '</td><td>' + (p.ranked ? p.rating : '<span class="small">-</span>') + '</td><td>' + p.win + '/' + p.lose + '</td><td>' + p.rate + '%</td><td>' + pct(p.st[0] + p.gt[0], p.st[1] + p.gt[1]) + '</td><td>' + p.first + '%</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function recBody() {
    var h = '<div class="sec-title">내 전적</div>';
    if (!S.rec) return h + '<div class="empty">불러오는 중…</div>';
    var m = S.rec.me;
    if (!m || !m.games) h += '<div class="empty">아직 끝까지 한 게임이 없어요.</div>';
    else h += '<div class="stat-grid">' +
      '<div class="stat"><b>' + (m.ranked ? m.rating : '-') + '</b><span>레이팅</span></div>' +
      '<div class="stat"><b>' + m.win + '승 ' + m.lose + '패</b><span>승률 ' + Math.round(m.win / m.games * 100) + '%</span></div>' +
      '<div class="stat"><b>' + (m.rounds ? Math.round(m.first / m.rounds * 100) : 0) + '%</b><span>1등으로 나감</span></div>' +
      '<div class="stat"><b>' + pct(m.st[0], m.st[1]) + '</b><span>스몰 티츄 ' + m.st[0] + '/' + (m.st[0] + m.st[1]) + '</span></div>' +
      '<div class="stat"><b>' + pct(m.gt[0], m.gt[1]) + '</b><span>라지 티츄 ' + m.gt[0] + '/' + (m.gt[0] + m.gt[1]) + '</span></div>' +
      '<div class="stat"><b>' + m.onetwo + '</b><span>원투(1·2등)</span></div></div>';
    if (S.rec.games.length) {
      h += '<div class="sec-title">최근 게임</div>' + S.rec.games.map(function (g) {
        return '<div class="game-row"><span class="wl ' + (g.win ? 'w' : 'l') + '">' + (g.win ? '승' : '패') + '</span><div class="mid"><div><span class="tA">' + esc(g.a) + '</span> vs <span class="tB">' + esc(g.b) + '</span></div>' +
          '<div class="small">' + esc(g.end.slice(0, 16)) + ' · ' + g.rounds + '라운드 · 목표 ' + g.target + (g.bot ? ' · 🤖' : '') + '</div></div>' +
          '<div style="text-align:right"><b>' + g.sa + ' : ' + g.sb + '</b>' + (g.ranked && g.delta != null ? '<div class="small" style="color:' + (g.delta >= 0 ? '#86efac' : '#fda4af') + '">' + (g.delta >= 0 ? '+' : '') + g.delta + '</div>' : '') + '</div></div>';
      }).join('');
    }
    return h;
  }
  function ex(cards, label) { return '<div class="ex"><span class="lbl">' + label + '</span>' + cardsHTML(cards, 'sm') + '</div>'; }
  function rulesBody() {
    return '<div class="rules">' +
      '<div class="sec-title">티츄 규칙 한눈에</div>' +
      '<p>마주 앉은 두 사람이 한 팀(2 대 2)입니다. 손패를 먼저 비우고, 점수 카드를 모아 <b>목표 점수(방마다 정함, 기본 500점)</b>에 먼저 도달하는 팀이 이깁니다.</p>' +
      '<h3>1. 라운드 준비</h3><ul><li>처음 8장을 보고 <b>라지 티츄</b>(±200점)를 선언할 수 있어요.</li><li>나머지 6장을 받은 뒤 첫 카드를 내기 전까지 <b>스몰 티츄</b>(±100점)를 선언할 수 있어요.</li>' +
      '<li>왼쪽 상대·파트너·오른쪽 상대에게 한 장씩, 3장을 동시에 교환해요.</li><li><b>참새(1)</b>를 가진 사람이 먼저 시작해요.</li></ul>' +
      '<h3>2. 낼 수 있는 조합</h3>' + ex(['T9'], '싱글') + ex(['J8', 'S8'], '페어') + ex(['J12', 'P12', 'T12'], '트리플') + ex(['J5', 'S5', 'P5', 'T11', 'J11'], '풀하우스') +
      ex(['MA', 'J2', 'S3', 'P4', 'T5'], '스트레이트 (5장 이상, 참새는 1)') + ex(['J6', 'S6', 'P7', 'T7'], '연속 페어 (2쌍 이상)') +
      '<ul><li>앞 사람과 <b>같은 종류 · 같은 장수</b>이면서 더 높아야 낼 수 있어요. 언제든 패스할 수 있어요.</li><li>나머지가 모두 패스하면 마지막으로 낸 사람이 트릭(테이블 카드)을 가져가고 새로 시작해요.</li></ul>' +
      '<h3>3. 폭탄</h3>' + ex(['J9', 'S9', 'P9', 'T9'], '포카드 폭탄') + ex(['P3', 'P4', 'P5', 'P6', 'P7'], '스트레이트 플러시 폭탄 (같은 문양 5장 이상)') +
      '<ul><li>폭탄은 무엇이든 이기고, <b>내 차례가 아니어도</b> 테이블에 조합이 있으면 끼어들 수 있어요. (손패에서 고르면 ‘폭탄!’ 버튼이 켜져요)</li><li>스트레이트 플러시 &gt; 포카드, 같은 종류면 길거나 높은 쪽이 이겨요.</li></ul>' +
      '<h3>4. 특수 카드</h3>' +
      '<div class="ex">' + cardHTML('MA', '', 'sm') + '<span><b>참새(1)</b> 가장 낮은 싱글. 낼 때 숫자 하나를 <b>콜</b>할 수 있어요. 그 숫자를 가진 사람은 낼 수 있으면 반드시 내야 해요(폭탄 포함).</span></div>' +
      '<div class="ex">' + cardHTML('DO', '', 'sm') + '<span><b>개</b> 선일 때만 낼 수 있고, 차례를 파트너에게 넘겨요. 점수 0.</span></div>' +
      '<div class="ex">' + cardHTML('PH', '', 'sm') + '<span><b>봉황</b> 조커처럼 조합을 완성(폭탄 제외)하거나, 싱글로 앞 카드보다 ½ 높게 쓸 수 있어요. 용은 못 이겨요. <b>-25점</b>.</span></div>' +
      '<div class="ex">' + cardHTML('DR', '', 'sm') + '<span><b>용</b> 가장 높은 싱글(폭탄에만 짐). 용으로 딴 트릭은 <b>상대 팀 한 명</b>에게 줘야 해요. <b>25점</b>.</span></div>' +
      '<h3>5. 점수</h3><ul><li>5 = 5점, 10·K = 10점, 용 25점, 봉황 -25점 (한 라운드 총 100점)</li>' +
      '<li>꼴찌의 남은 손패는 상대 팀, 꼴찌가 딴 트릭은 1등에게 가요.</li><li>한 팀이 1·2등으로 나가면(<b>원투</b>) 카드 점수 대신 200점!</li>' +
      '<li>티츄 선언자가 1등으로 나가면 +100(라지 +200), 못 하면 같은 만큼 감점.</li></ul>' +
      '<h3>잠만보 티츄에서는</h3><ul><li>턴 시간을 넘기면 자동으로 진행돼요(낼 의무가 없으면 패스). ‘돌아왔어요’를 누르면 다시 직접 해요.</li>' +
      '<li>게임 중 나가면 봇이 대신하고, 그 판은 전적에 들어가지 않아요.</li><li>레이팅은 사람 4명이 끝까지 한 게임만 반영돼요.</li></ul>' +
      '</div>';
  }

  /* ================= 모달 ================= */
  function openModal(html, onClose) {
    S.modal = { onClose: onClose };
    modalEl.innerHTML = '<div class="sheet" role="dialog">' + html + '</div>';
    modalEl.hidden = false;
    $$('[data-x]', modalEl).forEach(function (b) { b.onclick = closeModal; });
  }
  function closeModal() {
    if (!S.modal) return;
    var cb = S.modal.onClose; S.modal = null;
    modalEl.hidden = true; modalEl.innerHTML = '';
    if (cb) cb();
  }
  modalEl.addEventListener('click', function (e) { if (e.target === modalEl && !(S.modal && S.modal.sticky)) closeModal(); });

  /* ================= 방 ================= */
  function enterRoom(id) {
    if (S.roomId !== id) { S.room = null; S.lastSeq = 0; S.sel = []; S.exch = [null, null, null]; S.resultShown = ''; S.lastChat = 0; S.unread = 0; }
    S.roomId = id;
    setTimeout(armGuard, 0);
    if (S.room && S.room.id === id) render(); else app.innerHTML = '<div class="boot"><div class="logo-mark">T</div><div>방에 들어가는 중…</div></div>';
    startPoll(0);
  }
  function stopPoll() { clearTimeout(S.pollT); S.pollT = 0; }
  function startPoll(delay) { stopPoll(); S.pollT = setTimeout(poll, delay || 0); }
  // 서버가 바뀔 때까지 최대 7초 기다렸다가 답함(롱 폴링) → 답이 오면 바로 다시 요청
  function pollWait() { return document.hidden ? 0 : 7000; }
  function pollDelay() {
    if (document.hidden) return 5000;
    var r = S.room;
    if (!r) return 1000;
    if (r.status === 'end') return 1500;
    return 30;
  }
  function poll() {
    if (S.route.name !== 'room' || !S.roomId) return;
    if (S.busy) return startPoll(150);
    if (S.polling) return;
    var id = S.roomId, mySeq = ++S.pollSeq;
    S.polling = true;
    api('poll', { room: id, v: S.room && S.room.id === id ? S.room.v : 0, pw: S.roomPw, wait: pollWait() }, 12000).then(function (r) {
      S.polling = false;
      if (S.roomId !== id || mySeq !== S.pollSeq) return startPoll(pollDelay());
      if (r.same) { if (S.room && r.on) { var ch = false; r.on.forEach(function (o, i) { if (S.room.seats[i] && S.room.seats[i].on !== o) { S.room.seats[i].on = o; ch = true; } }); if (ch) render(); } }
      else applyRoom(r);
      startPoll(pollDelay());
    }, function (e) {
      S.polling = false;
      if (S.roomId !== id) return;
      if (e.code === 'gone') { toast(e.message, true); location.hash = '#/'; return; }
      if (e.code === 'pw') { joinRoom(id, true); return; }
      if (e.code === 'auth' || e.code === 'maint') return;
      if (!S.room) app.innerHTML = '<div class="boot"><div>' + esc(e.message) + '</div><button class="btn" onclick="location.reload()">다시 시도</button><a class="btn ghost" href="#/">로비로</a></div>';
      startPoll(3000);
    });
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.route.name === 'room') { S.pollSeq++; S.polling = false; startPoll(0); } });

  function act(k, extra, btn) {
    if (S.busy) return Promise.resolve();
    S.busy = true;
    if (btn) btn.disabled = true;
    var a = extra || {}; a.room = S.roomId; a.k = k;
    // 서버 답을 기다리지 않고 내 화면에 먼저 보여 줌 (답이 오면 서버 상태로 바뀜)
    var g = S.room && S.room.g;
    if (g && (k === 'play' || k === 'pass' || k === 'grand' || k === 'exch' || k === 'dragon')) {
      var top = g.trick.plays.length ? g.trick.plays[g.trick.plays.length - 1].c : null;
      S.optim = { k: k, cards: k === 'play' ? a.cards.slice() : k === 'exch' ? a.cards.slice() : [], c: k === 'play' ? TE.bestPlay(a.cards, top) : null };
      if (k === 'play') sfx(comboSound(S.optim.c, TE.isBomb(S.optim.c)));
      else if (k === 'pass') sfx('pass');
      render();
    }
    return api('act', a).then(function (r) { S.busy = false; S.optim = null; applyRoom(r, false, true); }, function (e) { S.busy = false; S.optim = null; if (btn) btn.disabled = false; toast(e.message, true); render(); });
  }
  function roomCall(fn, a, btn) {
    if (btn) btn.disabled = true;
    a = a || {}; a.room = S.roomId;
    return api(fn, a).then(function (r) { if (r && r.id) applyRoom(r); else render(); return r; }, function (e) { if (btn) btn.disabled = false; toast(e.message, true); });
  }

  function team(s) { return s % 2; }
  function pos(s, me) { return (s - (me < 0 ? 0 : me) + 4) % 4; }
  function myView() { return S.room && S.room.me >= 0 ? S.room.me : -1; }
  function seatName(s) { var st = S.room.seats[s]; return st ? st.name : '?'; }

  // 서버 상태가 새로 왔을 때: 효과(배너·소리) → 선택 정리 → 그리기
  function applyRoom(r, fresh, mine) {
    var prev = S.room;
    if (prev && prev.id === r.id && r.v < prev.v && !fresh) return;
    S.room = r; S.roomId = r.id;
    var g = r.g, me = r.me;
    if (g) {
      var key = r.matchId;
      if (S.seqMatch !== key) { S.seqMatch = key; S.lastSeq = fresh || !prev ? g.seq : 0; }
      var evs = g.log.filter(function (e) { return e.n > S.lastSeq; });
      if (S.lastSeq) effects(evs, r, mine);
      S.lastSeq = g.seq;
      // 선택 정리
      var hand = g.hand || [];
      S.sel = S.sel.filter(function (c) { return hand.indexOf(c) >= 0; });
      if (g.phase !== 'exchange' || S.exRound !== g.round) { if (g.phase === 'exchange') S.exRound = g.round; S.exch = [null, null, null]; S.exSlot = 0; }
      S.exch = S.exch.map(function (c) { return c && hand.indexOf(c) >= 0 ? c : null; });
      // 라운드 결과 · 게임 끝
      if ((g.phase === 'roundEnd' || g.phase === 'gameEnd') && S.resultShown !== key + ':' + g.round) { S.resultShown = key + ':' + g.round; setTimeout(function () { showResult(); }, 700); }
      if (g.phase === 'grand' && S.modal && S.modal.result) closeModal();
      // 받은 카드 안내
      if (g.phase === 'play' && g.recv && me >= 0 && !g.played[me] && S.recvShown !== key + ':' + g.round) {
        S.recvShown = key + ':' + g.round;
        var from = {}; g.recv.forEach(function (x) { from[pos(x.f, me)] = x.c; });
        toast('받은 카드 — 왼쪽: ' + TE.cardLabel(from[3]) + ' · 파트너: ' + TE.cardLabel(from[2]) + ' · 오른쪽: ' + TE.cardLabel(from[1]));
      }
    } else {
      if (S.modal && S.modal.result) closeModal();
    }
    // 채팅
    var lastChat = r.chat.length ? r.chat[r.chat.length - 1].i : 0;
    if (S.lastChat && lastChat > S.lastChat) {
      var news = r.chat.filter(function (c) { return c.i > S.lastChat; });
      if (S.chatOpen) paintChat();
      else {
        news.forEach(function (c) { if (c.s !== -2 && c.n !== (S.user && S.user.name)) { S.unread++; toast('💬 ' + c.n + ': ' + c.m); sfx('chat'); } });
      }
    }
    S.lastChat = lastChat;
    render();
  }

  function effects(evs, r, mine) {
    var me = r.me, myTurnBefore = false, order = 0;
    S.flash = {};
    evs.forEach(function (e) {
      var at = order * 0.28;
      if (e.k === 'play') {
        if (!(mine && e.s === me)) S.flash[e.s] = order++;
        if (e.bomb) { banner('💣 폭탄!', 'bomb'); S.shake = true; }
        if (!(mine && e.s === me)) sfx(comboSound(e.c, e.bomb), at);
      } else if (e.k === 'pass') { if (!(mine && e.s === me)) S.flash[e.s] = order++; if (!(mine && e.s === me)) sfx('pass', at); }
      else if (e.k === 'tichu') { banner(seatName(e.s) + (e.kind === 2 ? ' 라지 티츄!' : ' 티츄!')); sfx('tichu', at); }
      else if (e.k === 'trick' && me >= 0 && team(e.to) === team(me) && e.p > 0) sfx(e.p >= 20 ? 'trickBig' : 'trickUs', at + 0.1);
      else if (e.k === 'out' && e.place === 1) sfx('out', at + 0.15);
      else if (e.k === 'round') sfx(e.res && e.res.dbl ? 'onetwo' : 'round', at + 0.3);
      else if (e.k === 'gameEnd') sfx(me < 0 || team(me) === e.winner ? 'win' : 'lose', at + 0.6);
      if (e.k === 'wish') toast('🐦 ' + seatName(e.s) + ': 참새 콜 [' + TE.rankLabel(e.r) + ']');
      else if (e.k === 'wishDone') toast('참새 콜 [' + TE.rankLabel(e.r) + '] 완료 (' + seatName(e.s) + ')');
      else if (e.k === 'out') toast((e.place === 1 ? '🥇 ' : '') + seatName(e.s) + ' ' + e.place + '등으로 나감!');
      else if (e.k === 'dog') toast('🐕 개 → ' + seatName(e.to) + ' 선');
      else if (e.k === 'trick' && e.to !== e.s) toast('🐉 용 트릭 → ' + seatName(e.to) + ' (' + e.p + '점)');
      else if (e.k === 'trick' && e.p) toast(seatName(e.s) + ' 트릭 +' + e.p + '점');
    });
    var g = r.g;
    var mine = g && me >= 0 && ((g.phase === 'play' && g.turn === me) || (g.phase === 'dragon' && g.dragon && g.dragon.seat === me));
    if (mine && evs.length && !evs.every(function (e) { return e.s === me; })) sfx('turn', order * 0.28 + 0.15);
  }

  /* ----- 그리기 ----- */
  function render() {
    if (S.route.name !== 'room' || !S.room) return;
    var r = S.room;
    document.body.classList.toggle('ingame', r.status !== 'wait');
    if (r.status === 'wait') renderWait(); else renderGame();
  }

  function renderWait() {
    var r = S.room, me = r.me, view = me < 0 ? 0 : me;
    var seats = [0, 1, 2, 3].map(function (s) {
      var st = r.seats[s], p = pos(s, view), t = team(s) ? 'B' : 'A';
      var inner;
      if (st) {
        inner = '<div class="av ' + t + (st.on ? '' : ' off') + '" style="width:40px;height:40px;font-size:16px">' + initial(st.name) + (st.bot ? '<span class="bot">🤖</span>' : '') + '</div>' +
          '<div class="nm">' + (st.host ? '👑 ' : '') + esc(st.name) + '</div><div class="tm ' + (t === 'A' ? 'tA' : 'tB') + '">' + t + '팀' + (s === me ? ' · 나' : '') + '</div>';
        if (r.host && s !== me) inner += '<div class="acts"><button class="btn sm ghost" data-kick="' + s + '">' + (st.bot ? '봇 빼기' : '내보내기') + '</button></div>';
      } else {
        inner = '<div class="tm ' + (t === 'A' ? 'tA' : 'tB') + '">' + t + '팀 빈자리</div><div class="acts">' +
          '<button class="btn sm primary" data-sit="' + s + '">' + (me >= 0 ? '여기로 옮기기' : '여기 앉기') + '</button>' +
          (r.host ? '<button class="btn sm" data-bot="' + s + '">🤖 봇 넣기</button>' : '') + '</div>';
      }
      return '<div class="wseat p' + p + (s === me ? ' me' : '') + '">' + inner + '</div>';
    }).join('');
    var full = r.seats.every(Boolean);
    var h = '<div class="shell"><div class="hdr"><button class="iconbtn" id="wBack" aria-label="로비">←</button><div class="title" style="min-width:0"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (r.opt.lock ? '🔒 ' : '') + esc(r.name) + '</span></div>' +
      '<button class="iconbtn" id="wChat" aria-label="채팅">💬' + (S.unread ? '<span class="badge-dot">' + S.unread + '</span>' : '') + '</button></div>' +
      '<div class="content wait-wrap">' +
      '<div class="wait-info"><span class="chip">🎯 목표 ' + r.opt.target + '점</span><span class="chip">⏱ ' + (r.opt.timer ? '턴 ' + r.opt.timer + '초' : '시간 제한 없음') + '</span>' + (r.opt.lock ? '<span class="chip">🔒 비밀방</span>' : '') + '</div>' +
      '<div class="wait-table">' + seats + '<div class="wait-center"><b style="font-size:20px">' + r.seats.filter(Boolean).length + ' / 4</b><br>마주 앉은<br>두 사람이 한 팀</div></div>' +
      (r.host ? '<button class="btn primary block" id="wStart" ' + (full ? '' : 'disabled') + '>' + (full ? '게임 시작' : '네 자리가 차면 시작할 수 있어요') + '</button>' +
        '<div class="row" style="display:flex;gap:8px"><button class="btn block" id="wFill" ' + (full ? 'disabled' : '') + '>빈자리 봇으로 채우기</button><button class="btn block" id="wOpt">방 설정</button></div>'
        : me >= 0 ? '<div class="empty" style="padding:14px">방장(' + esc(r.hostName) + ')이 시작하기를 기다리는 중…</div>' : '<div class="empty" style="padding:14px">관전 중이에요. 빈자리를 눌러 앉을 수 있어요.</div>') +
      '<div style="display:flex;gap:8px"><button class="btn block" id="wInvite">🔗 초대 링크 복사</button>' + (me >= 0 ? '<button class="btn danger block" id="wLeave">나가기</button>' : '') + '</div>' +
      '<div class="sec-title">채팅</div><div class="chatlist" id="wChatList">' + chatItems(r.chat.slice(-8)) + '</div>' +
      '<form class="chatform" id="wChatForm"><input class="input" id="wMsg" maxlength="100" placeholder="메시지" autocomplete="off"><button class="btn" type="submit">보내기</button></form>' +
      '</div></div>';
    var focused = document.activeElement && document.activeElement.id === 'wMsg', val = focused ? $('#wMsg').value : '';
    app.innerHTML = h;
    if (focused) { var mi = $('#wMsg'); mi.value = val; mi.focus(); }
    $('#wBack').onclick = function () { location.hash = '#/'; };
    $('#wChat').onclick = openChat;
    $('#wInvite').onclick = copyInvite;
    var wl = $('#wLeave'); if (wl) wl.onclick = leaveRoom;
    var ws = $('#wStart'); if (ws) ws.onclick = function () { roomCall('start', {}, ws); };
    var wf = $('#wFill'); if (wf) wf.onclick = function () { fillBots(wf); };
    var wo = $('#wOpt'); if (wo) wo.onclick = optSheet;
    $$('[data-sit]').forEach(function (b) { b.onclick = function () { var s = +b.getAttribute('data-sit'); if (r.me >= 0) roomCall('seat', { seat: s }, b); else joinRoom(r.id, r.opt.lock, s); }; });
    $$('[data-bot]').forEach(function (b) { b.onclick = function () { roomCall('addBot', { seat: +b.getAttribute('data-bot') }, b); }; });
    $$('[data-kick]').forEach(function (b) { b.onclick = function () { roomCall('kick', { seat: +b.getAttribute('data-kick') }, b); }; });
    $('#wChatForm').onsubmit = function (e) { e.preventDefault(); sendChat($('#wMsg')); };
    var cl = $('#wChatList'); cl.scrollTop = cl.scrollHeight;
    S.unread = 0;
  }
  function fillBots(btn) {
    btn.disabled = true;
    var empty = [0, 1, 2, 3].filter(function (s) { return !S.room.seats[s]; });
    (function next() { var s = empty.shift(); if (s === undefined) return; roomCall('addBot', { seat: s }).then(next); })();
  }
  function optSheet() {
    var r = S.room;
    openModal('<h2>방 설정<button class="x" data-x>✕</button></h2>' + roomOptForm({ name: r.name, target: r.opt.target, timer: r.opt.timer, pw: '' }) +
      '<div class="small">비밀번호 칸을 비우면 공개방이 돼요.</div><button class="btn primary block" id="oGo">저장</button>');
    bindSeg(modalEl); bindTarget(modalEl);
    $('#oGo').onclick = function () { roomCall('opt', { name: $('#oName').value, target: targetVal(modalEl), timer: +segVal(modalEl, 'timer'), pw: $('#oPw').value }, $('#oGo')).then(closeModal); };
  }
  function copyInvite() {
    // ?reset: 잠만보 앱의 예전 서비스 워커(v2.2)가 남은 기기에서도 티츄 페이지가 바로 열리게 (티츄는 이 값을 쓰지 않고 지움)
    var url = location.origin + location.pathname + '?reset#/room/' + S.room.id;
    var txt = '[잠만보 티츄] ' + S.room.name + ' 방에서 같이 해요! ' + url;
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast('초대 링크를 복사했어요. 단톡방에 붙여 넣어 주세요'); }, function () { prompt('복사해서 보내 주세요', txt); });
  }
  function leaveRoom() {
    var playing = S.room.status === 'play' && S.room.me >= 0;
    if (playing && !confirm('게임 중에 나가면 봇이 대신하고 이번 판은 전적에 남지 않아요. 나갈까요?')) return;
    api('leave', { room: S.roomId }).then(function () { location.hash = '#/'; }, function (e) { toast(e.message, true); });
  }

  /* ----- 채팅 ----- */
  function chatItems(list) {
    return list.map(function (c) {
      if (c.s === -2) return '<div class="m sys">' + esc(c.m) + '</div>';
      var cls = c.s >= 0 ? (team(c.s) ? 'tB' : 'tA') : '';
      return '<div class="m"><b class="' + cls + '">' + esc(c.n) + '</b>' + esc(c.m) + '</div>';
    }).join('') || '<div class="m sys">아직 메시지가 없어요</div>';
  }
  var QUICK = ['좋아요 👍', '나이스! 👏', '미안해요 🙏', 'ㅋㅋㅋ', '티츄 화이팅!', '폭탄 조심 💣', '잠깐만요', '한 판 더?'];
  function openChat() {
    S.chatOpen = true; S.unread = 0;
    openModal('<h2>채팅<button class="x" data-x>✕</button></h2><div class="chatlist" id="cl"></div>' +
      '<div class="quick">' + QUICK.map(function (q) { return '<button data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') + '</div>' +
      '<form class="chatform" id="cf"><input class="input" id="cm" maxlength="100" placeholder="메시지" autocomplete="off"><button class="btn primary" type="submit">보내기</button></form>',
      function () { S.chatOpen = false; render(); });
    paintChat();
    $$('[data-q]', modalEl).forEach(function (b) { b.onclick = function () { sendChat(null, b.getAttribute('data-q')); }; });
    $('#cf').onsubmit = function (e) { e.preventDefault(); sendChat($('#cm')); };
  }
  function paintChat() { var cl = $('#cl'); if (!cl || !S.room) return; cl.innerHTML = chatItems(S.room.chat); cl.scrollTop = cl.scrollHeight; }
  function sendChat(input, text) {
    var m = text || (input && input.value.trim());
    if (!m) return;
    if (input) input.value = '';
    api('chat', { room: S.roomId, m: m }).then(function (r) { applyRoom(r); }, function (e) { toast(e.message, true); });
  }

  /* ----- 게임 화면 ----- */
  function fakeG(g, me) {   // 엔진 함수용: 내 손패만 들어 있는 상태
    var hands = [[], [], [], []]; if (me >= 0) hands[me] = g.hand || [];
    return { hands: hands, trick: g.trick, wish: g.wish };
  }
  function pendingSeats(g) {
    var p = [];
    if (!g) return p;
    if (g.phase === 'grand') { for (var i = 0; i < 4; i++) if (g.grand[i] === null) p.push(i); }
    else if (g.phase === 'exchange') { for (i = 0; i < 4; i++) if (!g.exDone[i]) p.push(i); }
    else if (g.phase === 'play') p.push(g.turn);
    else if (g.phase === 'dragon' && g.dragon) p.push(g.dragon.seat);
    return p;
  }
  // 현재 트릭에서 각 자리의 마지막 행동 (낸 카드 / 패스)
  function trickState(g) {
    var st = {}, start = 0;
    for (var i = g.log.length - 1; i >= 0; i--) { var k = g.log[i].k; if (k === 'trick' || k === 'dog' || k === 'exchDone' || k === 'deal' || k === 'round') { start = i + 1; break; } }
    for (i = start; i < g.log.length; i++) { var e = g.log[i]; if (e.k === 'play') st[e.s] = { play: e.c }; else if (e.k === 'pass') st[e.s] = { pass: 1 }; }
    // 로그가 잘렸을 때 대비: 트릭 기록으로 보충
    g.trick.plays.forEach(function (p) { if (!st[p.s]) st[p.s] = { play: p.c }; });
    return st;
  }

  function renderGame() {
    var r = S.room, g = r.g, me = r.me, view = me < 0 ? 0 : me;
    if (!g) return;
    var pend = pendingSeats(g), myTeam = team(view);
    var top = g.trick.plays.length ? g.trick.plays[g.trick.plays.length - 1] : null;
    var ts = trickState(g), op = S.optim;
    if (op && me >= 0 && op.k === 'play' && op.c) { ts[me] = { play: op.c }; S.flash[me] = 0; top = { s: me, c: op.c }; }
    if (op && me >= 0 && op.k === 'pass') { ts[me] = { pass: 1 }; S.flash[me] = 0; }
    var myTurn = me >= 0 && g.phase === 'play' && g.turn === me;
    var scoreUs = g.scores[myTeam], scoreThem = g.scores[1 - myTeam];
    var nmUs = [view, (view + 2) % 4].map(seatName).join('·'), nmThem = [(view + 1) % 4, (view + 3) % 4].map(seatName).join('·');

    var h = '<div class="game">';
    // 상단: 점수
    h += '<div class="gbar"><button class="iconbtn" id="gMenu" aria-label="메뉴">≡</button>' +
      '<div class="score"><div class="tm ' + (myTeam ? 'tB' : 'tA') + '"><span>' + scoreUs + '</span><small>' + (me >= 0 ? '우리 · ' : '') + esc(nmUs) + '</small></div>' +
      '<div class="vs">' + g.round + 'R<small>/' + g.target + '</small></div>' +
      '<div class="tm ' + (myTeam ? 'tA' : 'tB') + '"><span>' + scoreThem + '</span><small>' + (me >= 0 ? '상대 · ' : '') + esc(nmThem) + '</small></div></div>' +
      '<button class="iconbtn" id="gSheet" aria-label="점수표">📋</button>' +
      '<button class="iconbtn" id="gChat" aria-label="채팅">💬' + (S.unread ? '<span class="badge-dot">' + S.unread + '</span>' : '') + '</button></div>';

    // 테이블
    h += '<div class="felt">';
    for (var s = 0; s < 4; s++) {
      var p = pos(s, view), st = r.seats[s];
      if (p !== 0) h += seatHTML(g, s, p, st, pend);
      h += frontHTML(g, s, p, ts[s], top && top.s === s);
    }
    h += '<div class="center">' + centerHTML(g, me, pend) + '</div>';
    h += panelHTML(g, me);
    h += '</div>';

    // 내 영역
    if (me >= 0) {
      var mst = r.seats[me];
      if (mst && mst.afk) h += '<div class="afkbar">자리 비움 · 자동 진행 중 <button class="btn sm primary" id="gBack">돌아왔어요</button></div>';
      h += myBarHTML(g, me, pend, myTurn, top);
      h += '<div class="selinfo" id="selinfo"></div>';
      h += '<div class="timerbar"><i id="myTimer" style="width:0"></i></div>';
      h += '<div class="handwrap"><div class="hand" id="hand"></div></div>';
    } else {
      h += '<div class="spect">👀 관전 중 · ' + esc(r.name) + (r.status === 'play' ? '' : ' (게임 끝)') + '</div>';
    }
    h += '</div>';
    app.innerHTML = h;
    if (S.shake) { S.shake = false; $('.felt').classList.add('shake'); }
    S.flash = {};
    bindGame();
    layoutHand();
    updateSelInfo();
    tickTimers();
  }

  function seatHTML(g, s, p, st, pend) {
    var t = team(s) ? 'B' : 'A', isPend = pend.indexOf(s) >= 0, place = g.out.indexOf(s);
    var tags = '';
    if (g.phase !== 'roundEnd' && g.phase !== 'gameEnd') tags += place >= 0 ? '<span class="tag place">' + (place + 1) + '등</span>' : '<span class="tag cnt">' + g.counts[s] + '장</span>';
    if (g.tichu[s]) tags += '<span class="tag ' + (g.tichu[s] === 2 ? 'gt">라지' : 'ti">티츄') + '</span>';
    if (g.phase === 'grand' && g.grand[s] === false) tags += '<span class="tag">패스</span>';
    if (st && st.afk) tags += '<span class="tag afk">자동</span>';
    if (st && !st.on) tags += '<span class="tag afk">끊김</span>';
    if (g.pts[s]) tags += '<span class="tag pts">' + g.pts[s] + '점</span>';
    return '<div class="seat p' + p + '" data-seat="' + s + '"><div class="av ' + t + (isPend ? ' turn' : '') + (st && !st.on ? ' off' : '') + '">' + initial(st ? st.name : '?') +
      (isPend ? ringSVG() : '') + (st && st.bot ? '<span class="bot">🤖</span>' : '') + '</div>' +
      '<div class="nm ' + (t === 'A' ? 'tA' : 'tB') + '">' + esc(st ? st.name : '') + '</div><div class="info">' + tags + '</div></div>';
  }
  function ringSVG() { return '<svg class="ring" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" stroke-dasharray="113.1" stroke-dashoffset="0" data-ring="1"/></svg>'; }
  function frontHTML(g, s, p, st, isTop) {
    if (!st || (g.phase !== 'play' && g.phase !== 'dragon')) return '';
    var fl = S.flash[s] !== undefined ? ' flash' : '', delay = fl ? ' style="animation-delay:' + (S.flash[s] * 0.28) + 's"' : '';
    if (st.pass) return '<div class="front pass p' + p + fl + '"' + delay + '><span class="lbl">패스</span></div>';
    var size = p === 0 || p === 2 || st.play.c.length <= 6 ? 'md' : 'sm';   // 옆자리는 긴 조합만 작게
    if (window.innerWidth >= 700) size = 'md';
    return '<div class="front p' + p + (isTop ? ' top' : '') + fl + '"' + delay + '>' + cardsHTML(st.play.c, size) + '<span class="lbl">' + esc(TE.comboName(st.play)) + '</span></div>';
  }
  function centerHTML(g, me, pend) {
    var h = '', msg = '', isMe = false;
    if (g.phase === 'grand') msg = '라지 티츄 결정 중 · ' + g.grand.filter(function (x) { return x !== null; }).length + '/4';
    else if (g.phase === 'exchange') msg = '카드 교환 중 · ' + g.exDone.filter(Boolean).length + '/4';
    else if (g.phase === 'play') {
      isMe = g.turn === me;
      msg = isMe ? (g.trick.plays.length ? '내 차례' : '내 차례 · 선') : seatName(g.turn) + (g.trick.plays.length ? ' 차례' : ' 선');
    } else if (g.phase === 'dragon') { isMe = g.dragon.seat === me; msg = isMe ? '용 트릭을 줄 상대를 고르세요' : seatName(g.dragon.seat) + ': 용 트릭 줄 상대 고르는 중'; }
    else if (g.phase === 'roundEnd') msg = g.round + '라운드 끝';
    else if (g.phase === 'gameEnd') msg = '게임 끝';
    h += '<div class="turnmsg' + (isMe ? ' me' : '') + '">' + esc(msg) + '</div>';
    if (g.wish) {
      var must = me >= 0 && g.phase === 'play' && g.turn === me && !!TE.wishPlays(fakeG(g, me), me);
      h += '<div class="wish' + (must ? ' must' : '') + '">🐦 참새 콜 ' + TE.rankLabel(g.wish) + (must ? ' · 꼭 내야 해요' : '') + '</div>';
    }
    if (g.trick.plays.length) {
      var pts = 0; g.trick.plays.forEach(function (p) { pts += TE.sumPoints(p.c.c); });
      h += '<div class="trickpts">테이블 ' + pts + '점</div>';
    }
    return h;
  }
  function panelHTML(g, me) {
    if (me < 0) return '';
    if (S.optim && (S.optim.k === 'grand' || S.optim.k === 'exch' || S.optim.k === 'dragon')) return '';
    var r = S.room;
    if (g.phase === 'grand' && g.grand[me] === null) {
      return '<div class="panel"><h3>처음 8장 — 라지 티츄?</h3><p>1등으로 나가면 +200, 못 하면 -200점. 나머지 6장은 결정 뒤에 받아요.</p>' +
        '<div class="row"><button class="btn" id="gtPass">패스</button><button class="btn primary" id="gtCall">라지 티츄!</button></div></div>';
    }
    if (g.phase === 'exchange' && !g.myExch) {
      var who = [(me + 3) % 4, (me + 2) % 4, (me + 1) % 4], label = ['왼쪽 상대', '파트너', '오른쪽 상대'];
      return '<div class="panel"><h3>카드 교환</h3><p>칸을 고르고 손패에서 카드를 눌러 넣으세요. 세 칸을 채우면 보내기!</p><div class="slots">' +
        who.map(function (s, i) {
          var c = S.exch[i];
          return '<div class="slot' + (S.exSlot === i ? ' on' : '') + '" data-slot="' + i + '"><div class="who ' + (team(s) ? 'B' : 'A') + '">' + label[i] + '<br>' + esc(seatName(s)) + '</div>' + (c ? cardHTML(c) : '<div class="ph">＋</div>') + '</div>';
        }).join('') + '</div><div class="row"><button class="btn primary block" id="exGo" ' + (S.exch.every(Boolean) ? '' : 'disabled') + '>보내기</button></div></div>';
    }
    if (g.phase === 'dragon' && g.dragon && g.dragon.seat === me) {
      var a = (me + 3) % 4, b = (me + 1) % 4;
      return '<div class="panel"><h3>🐉 용 트릭을 누구에게?</h3><p>용으로 딴 트릭은 상대 팀 한 명에게 줘야 해요.</p><div class="row">' +
        '<button class="btn" data-dragon="' + a + '">← ' + esc(seatName(a)) + ' (' + g.counts[a] + '장)</button>' +
        '<button class="btn" data-dragon="' + b + '">' + esc(seatName(b)) + ' (' + g.counts[b] + '장) →</button></div></div>';
    }
    return '';
  }
  function myBarHTML(g, me, pend, myTurn, top) {
    var r = S.room, st = r.seats[me], t = team(me) ? 'B' : 'A', place = g.out.indexOf(me);
    var tags = '';
    if (g.tichu[me]) tags += '<span class="tag ' + (g.tichu[me] === 2 ? 'gt">라지' : 'ti">티츄') + '</span>';
    if (place >= 0 && g.phase === 'play') tags += '<span class="tag place">' + (place + 1) + '등</span>';
    if (g.pts[me]) tags += '<span class="tag pts">' + g.pts[me] + '점</span>';
    var acts = '';
    if (r.canTichu) acts += '<button class="btn sm" id="bTichu" style="border-color:var(--gold);color:var(--gold2)">티츄</button>';
    if (g.phase === 'play' && g.counts[me] > 0) {
      var must = myTurn && TE.wishPlays(fakeG(g, me), me);
      acts += '<button class="btn" id="bPass" ' + (myTurn && top && !must ? '' : 'disabled') + '>패스</button>';
      acts += '<button class="btn primary" id="bPlay" disabled>내기</button>';
    }
    if (S.optim) acts = '<span class="small">보내는 중…</span>';
    if (g.phase === 'exchange' && g.myExch) acts += '<span class="small">교환 대기 중…</span>';
    if (g.phase === 'grand' && g.grand[me] !== null) acts += '<span class="small">다른 사람 결정 대기…</span>';
    return '<div class="mybar"><div class="me"><div class="av ' + t + (pend.indexOf(me) >= 0 ? ' turn' : '') + '">' + initial(st.name) + (pend.indexOf(me) >= 0 ? ringSVG() : '') + '</div>' +
      '<div class="who"><b>' + esc(st.name) + '</b><div class="info">' + tags + '</div></div></div><div class="acts">' + acts + '</div></div>';
  }

  function bindGame() {
    var r = S.room, g = r.g, me = r.me;
    $('#gMenu').onclick = gameMenu;
    $('#gSheet').onclick = scoreSheet;
    $('#gChat').onclick = openChat;
    var gb = $('#gBack'); if (gb) gb.onclick = function () { act('back', {}, gb); };
    var t1 = $('#gtPass'); if (t1) t1.onclick = function () { act('grand', { call: false }, t1); };
    var t2 = $('#gtCall'); if (t2) t2.onclick = function () { if (confirm('라지 티츄를 선언할까요? (±200점)')) act('grand', { call: true }, t2); };
    var bt = $('#bTichu'); if (bt) bt.onclick = function () { if (confirm('스몰 티츄를 선언할까요?\n1등으로 나가면 +100, 못 하면 -100점')) act('tichu', {}, bt); };
    var bp = $('#bPass'); if (bp) bp.onclick = function () { S.sel = []; act('pass', {}, bp); };
    var bpl = $('#bPlay'); if (bpl) bpl.onclick = function () { playSelected(bpl); };
    $$('[data-slot]').forEach(function (el) {
      el.onclick = function () { var i = +el.getAttribute('data-slot'); if (S.exSlot === i && S.exch[i]) S.exch[i] = null; S.exSlot = i; render(); };
    });
    var eg = $('#exGo'); if (eg) eg.onclick = function () { act('exch', { cards: [S.exch[2], S.exch[1], S.exch[0]] }, eg); };
    $$('[data-dragon]').forEach(function (b) { b.onclick = function () { act('dragon', { to: +b.getAttribute('data-dragon') }, b); }; });
    $$('.seat[data-seat]').forEach(function (el) {
      el.onclick = function () {
        var s = +el.getAttribute('data-seat'), st = r.seats[s];
        if (r.host && st && !st.bot && !st.on && r.status === 'play' && confirm(st.name + '님 연결이 끊겼어요. 봇으로 바꿀까요?')) roomCall('replace', { seat: s });
      };
    });
  }

  function layoutHand() {
    var el = $('#hand'); if (!el || !S.room || !S.room.g) return;
    var g = S.room.g, hand = g.hand || [], me = S.room.me;
    if (S.optim && S.optim.k === 'play') hand = hand.filter(function (c) { return S.optim.cards.indexOf(c) < 0; });
    var recvSet = {};
    if (g.phase === 'play' && g.recv && !g.played[me]) g.recv.forEach(function (x) { recvSet[x.c] = 1; });
    var inEx = {}; S.exch.forEach(function (c) { if (c) inEx[c] = 1; });
    var wrap = el.parentNode, cs = getComputedStyle(wrap), W = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2, n = hand.length;
    var cw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cw')) || 46;
    var step = n > 1 ? Math.min(cw + 4, (W - cw) / (n - 1)) : 0, total = cw + step * Math.max(0, n - 1);
    el.style.width = total + 'px';
    el.innerHTML = hand.map(function (c, i) {
      var cls = (S.sel.indexOf(c) >= 0 ? 'sel' : '') + (recvSet[c] ? ' new' : '') + (inEx[c] ? ' sel dim' : '');
      return cardHTML(c, cls).replace('class="card', 'style="left:' + (i * step).toFixed(1) + 'px" class="card');
    }).join('') || '<div class="small" style="text-align:center;padding-top:28px">' + (g.phase === 'play' && g.out.indexOf(me) >= 0 ? '손패를 다 냈어요! 🎉' : '') + '</div>';
    $$('.card', el).forEach(function (c) { c.onclick = function () { tapCard(c.getAttribute('data-c')); }; });
  }
  window.addEventListener('resize', function () { if (S.route.name === 'room') layoutHand(); });

  function tapCard(c) {
    var g = S.room.g;
    if (g.phase === 'exchange' && !g.myExch) {
      var at = S.exch.indexOf(c);
      if (at >= 0) { S.exch[at] = null; S.exSlot = at; }
      else {
        S.exch[S.exSlot] = c;
        for (var k = 1; k <= 3; k++) { var j = (S.exSlot + k) % 3; if (!S.exch[j]) { S.exSlot = j; break; } }
      }
      render();
      return;
    }
    var i = S.sel.indexOf(c);
    sfx('tap');
    if (i >= 0) S.sel.splice(i, 1); else S.sel.push(c);
    $$('#hand .card').forEach(function (el) { el.classList.toggle('sel', S.sel.indexOf(el.getAttribute('data-c')) >= 0); });
    updateSelInfo();
  }

  function selState() {
    var r = S.room, g = r && r.g, me = r ? r.me : -1;
    if (!g || me < 0 || g.phase !== 'play' || !g.counts[me]) return null;
    var top = g.trick.plays.length ? g.trick.plays[g.trick.plays.length - 1].c : null;
    var myTurn = g.turn === me, must = myTurn ? TE.wishPlays(fakeG(g, me), me) : null;
    var res = { myTurn: myTurn, top: top, must: must, c: null, ok: false, msg: '', cls: '' };
    if (!S.sel.length) {
      if (myTurn) {
        var any = (must || TE.plays(g.hand, top)).length;
        res.msg = must ? '참새 콜 [' + TE.rankLabel(g.wish) + '] 를 포함해서 내야 해요' : !any ? '낼 수 있는 조합이 없어요 → 패스' : top ? '더 높은 같은 조합을 고르거나 패스하세요' : '선이에요! 낼 조합을 골라 주세요';
      } else if (top) {
        var bombs = TE.plays(g.hand, top).filter(TE.isBomb);
        res.msg = bombs.length ? '💣 폭탄을 고르면 차례가 아니어도 낼 수 있어요' : '';
      }
      return res;
    }
    var c = TE.bestPlay(S.sel, top);
    if (!c) { res.msg = !TE.analyze(S.sel).length ? '조합이 아니에요' : TE.isBomb(top) ? '폭탄은 더 높은 폭탄으로만 이겨요' : '앞 조합(' + TE.comboName(top) + ')보다 높은 같은 종류여야 해요'; res.cls = 'no'; return res; }
    res.c = c;
    var bomb = TE.isBomb(c);
    if (!myTurn) {
      if (bomb && top) { res.ok = true; res.msg = '💣 ' + TE.comboName(c) + ' — 지금 끼어들 수 있어요'; res.cls = 'ok'; }
      else { res.msg = TE.comboName(c) + ' (내 차례가 아니에요)'; }
      return res;
    }
    if (must && !TE.hasNatural(S.sel, g.wish)) { res.msg = '참새 콜 [' + TE.rankLabel(g.wish) + '] 를 포함해야 해요'; res.cls = 'no'; return res; }
    if (c.t === 'dog' && top) { res.msg = '개는 선일 때만'; res.cls = 'no'; return res; }
    res.ok = true; res.msg = '✓ ' + TE.comboName(c); res.cls = 'ok';
    return res;
  }
  function updateSelInfo() {
    var el = $('#selinfo'), b = $('#bPlay');
    var st = selState();
    if (el) { el.textContent = st ? st.msg : ''; el.className = 'selinfo ' + (st ? st.cls : ''); }
    if (b && st) {
      b.disabled = !st.ok || S.busy;
      b.textContent = st.ok && !st.myTurn ? '폭탄!' : '내기';
      b.classList.toggle('danger', st.ok && !st.myTurn);
    }
  }
  function playSelected(btn) {
    var st = selState();
    if (!st || !st.ok) return;
    var cards = S.sel.slice();
    function send(w) { S.sel = []; act('play', { cards: cards, wish: w || 0 }, btn); }
    if (cards.indexOf('MA') >= 0) return wishPicker(send);
    send(0);
  }
  function wishPicker(cb) {
    var ranks = []; for (var r = 2; r <= 14; r++) ranks.push(r);
    openModal('<h2>🐦 참새 콜<button class="x" data-x>✕</button></h2><p class="small" style="margin:0">숫자를 고르면, 그 숫자를 가진 사람은 낼 수 있을 때 반드시 내야 해요.</p>' +
      '<div class="wishgrid">' + ranks.map(function (r) { return '<button data-w="' + r + '">' + TE.rankLabel(r) + '</button>'; }).join('') + '<button class="none" data-w="0">콜 안 함</button></div>');
    $$('[data-w]', modalEl).forEach(function (b) { b.onclick = function () { var w = +b.getAttribute('data-w'); closeModal(); cb(w); }; });
  }

  function gameMenu() {
    var r = S.room, offline = [];
    r.seats.forEach(function (st, s) { if (st && !st.bot && !st.on && s !== r.me) offline.push(s); });
    openModal('<h2>메뉴<button class="x" data-x>✕</button></h2><div class="menu-list">' +
      '<button class="btn block" id="mRules">📖 규칙 보기</button>' +
      '<button class="btn block" id="mInvite">🔗 관전 링크 복사</button>' +
      '<button class="btn block" id="mSound">' + (S.sound ? '🔇 소리 끄기' : '🔊 소리 켜기') + '</button>' +
      (r.host && r.status === 'play' ? offline.map(function (s) { return '<button class="btn block" data-rep="' + s + '">🤖 ' + esc(seatName(s)) + ' (끊김) → 봇으로</button>'; }).join('') : '') +
      (r.admin ? '<button class="btn danger block" id="mClose">운영진: 방 닫기</button>' : '') +
      '<button class="btn block" id="mLobby">로비로 (방은 그대로)</button>' +
      (r.me >= 0 ? '<button class="btn danger block" id="mLeave">방에서 나가기</button>' : '') + '</div>');
    $('#mRules').onclick = function () { openModal('<h2>규칙<button class="x" data-x>✕</button></h2>' + rulesBody()); };
    $('#mInvite').onclick = function () { closeModal(); copyInvite(); };
    $('#mSound').onclick = function () { S.sound = !S.sound; lsSet(LS_SOUND, S.sound ? '1' : '0'); closeModal(); };
    $('#mLobby').onclick = function () { closeModal(); location.hash = '#/'; };
    var ml = $('#mLeave'); if (ml) ml.onclick = function () { closeModal(); leaveRoom(); };
    var mc = $('#mClose'); if (mc) mc.onclick = function () { if (confirm('이 방을 닫을까요?')) api('adminClose', { room: S.roomId }).then(function () { closeModal(); location.hash = '#/'; }, function (e) { toast(e.message, true); }); };
    $$('[data-rep]', modalEl).forEach(function (b) { b.onclick = function () { closeModal(); roomCall('replace', { seat: +b.getAttribute('data-rep') }); }; });
  }

  function scoreSheet() {
    var r = S.room, g = r.g, view = r.me < 0 ? 0 : r.me, us = team(view), them = 1 - us;
    var rows = g.history.map(function (h) {
      return '<tr><td>' + h.round + 'R' + (h.dbl ? ' 원투' : '') + '</td><td>' + signed(h.total[us]) + '</td><td>' + signed(h.total[them]) + '</td><td>' + h.scores[us] + '</td><td>' + h.scores[them] + '</td></tr>';
    }).join('');
    openModal('<h2>점수표<button class="x" data-x>✕</button></h2><table class="result-table"><thead><tr><th>라운드</th><th>' + (r.me >= 0 ? '우리' : 'A팀') + '</th><th>' + (r.me >= 0 ? '상대' : 'B팀') + '</th><th>누적</th><th>누적</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="5">아직 끝난 라운드가 없어요</td></tr>') + '</tbody></table><div class="small">목표 ' + g.target + '점 · 먼저 넘고 앞선 팀이 승리</div>');
  }
  function signed(n) { return (n > 0 ? '+' : '') + n; }

  function showResult() {
    var r = S.room, g = r && r.g;
    if (!g || (g.phase !== 'roundEnd' && g.phase !== 'gameEnd')) return;
    var h = g.history[g.history.length - 1]; if (!h) return;
    var view = r.me < 0 ? 0 : r.me, us = team(view), them = 1 - us, ended = g.phase === 'gameEnd';
    var order = h.out.concat(h.last >= 0 ? [h.last] : []);
    var html = '<h2>' + (ended ? '🏁 게임 끝' : h.round + '라운드 결과') + '<button class="x" data-x>✕</button></h2>';
    if (ended) {
      var won = g.winner === us;
      html += '<div class="big-win"><div class="t" style="color:' + (r.me < 0 ? 'var(--gold2)' : won ? '#86efac' : '#fda4af') + '">' + (r.me < 0 ? (g.winner === 0 ? 'A팀 승리' : 'B팀 승리') : won ? '🎉 우리 팀 승리!' : '아쉽게 졌어요') + '</div>' +
        '<div class="s"><span class="' + (us ? 'tB' : 'tA') + '">' + g.scores[us] + '</span> : <span class="' + (us ? 'tA' : 'tB') + '">' + g.scores[them] + '</span></div><div class="small">' + g.round + '라운드 · 목표 ' + g.target + '점</div></div>';
    }
    if (h.dbl) html += '<div class="notice" style="text-align:center">🎊 원투! ' + esc(seatName(h.out[0])) + ' · ' + esc(seatName(h.out[1])) + ' 팀 +200</div>';
    html += '<div class="order">' + order.map(function (s, i) {
      var call = h.calls.filter(function (c) { return c.s === s; })[0];
      return '<div><span class="pl">' + (i < h.out.length ? (i + 1) + '등' : '꼴찌') + '</span><span class="' + (team(s) ? 'tB' : 'tA') + '" style="flex:1;font-weight:800">' + esc(seatName(s)) + '</span>' +
        (call ? '<span class="tag ' + (call.ok ? 'ti' : '') + '">' + (call.kind === 2 ? '라지' : '스몰') + ' ' + (call.ok ? '성공 +' : '실패 -') + (call.kind === 2 ? 200 : 100) + '</span>' : '') + '</div>';
    }).join('') + '</div>';
    html += '<table class="result-table"><thead><tr><th></th><th>' + (r.me >= 0 ? '우리' : 'A팀') + '</th><th>' + (r.me >= 0 ? '상대' : 'B팀') + '</th></tr></thead><tbody>' +
      '<tr><td>카드 점수</td><td>' + h.card[us] + '</td><td>' + h.card[them] + '</td></tr>' +
      '<tr><td>티츄</td><td>' + signed(h.tichu[us]) + '</td><td>' + signed(h.tichu[them]) + '</td></tr>' +
      '<tr><td>이번 라운드</td><td>' + signed(h.total[us]) + '</td><td>' + signed(h.total[them]) + '</td></tr>' +
      '<tr class="tot"><td>누적</td><td>' + h.scores[us] + '</td><td>' + h.scores[them] + '</td></tr></tbody></table>';
    if (!h.dbl && h.last >= 0 && g.hands) html += '<div class="small">꼴찌 ' + esc(seatName(h.last)) + '의 남은 손패 (' + h.lastHand + '점 → 상대 팀)</div>' + cardsHTML(g.hands[h.last] || [], 'xs');
    if (ended) {
      html += r.me >= 0 ? '<div style="display:flex;gap:8px"><button class="btn primary block" id="rAgain">한 판 더</button><button class="btn block" id="rLobby">로비로</button></div>' : '<button class="btn block" id="rLobby">로비로</button>';
    } else if (r.me >= 0) {
      html += '<button class="btn primary block" id="rNext">' + (r.ready && r.ready[r.me] ? '다른 사람 기다리는 중…' : '다음 라운드') + ' <span id="rCount"></span></button>';
    }
    openModal(html);
    S.modal.result = true;
    var rn = $('#rNext'); if (rn) rn.onclick = function () { act('ready', {}, rn).then(function () { rn.textContent = '다른 사람 기다리는 중…'; }); };
    var ra = $('#rAgain'); if (ra) ra.onclick = function () { closeModal(); roomCall('rematch', {}, ra); };
    var rl = $('#rLobby'); if (rl) rl.onclick = function () { closeModal(); location.hash = '#/'; };
  }

  /* ----- 타이머 (0.25초마다 링·막대만 갱신) ----- */
  function tickTimers() {
    var r = S.room;
    if (!r || S.route.name !== 'room' || !r.g) return;
    var dl = r.dl, total = r.opt.timer * 1000, g = r.g;
    if (g.phase === 'exchange') total = Math.max(total * 2, 40000);
    if (g.phase === 'grand') total = Math.max(total, 20000);
    if (g.phase === 'roundEnd') total = 12000;
    var left = dl ? Math.max(0, dl - now()) : 0, frac = dl && total ? Math.min(1, left / total) : 0;
    $$('[data-ring]').forEach(function (c) {
      c.setAttribute('stroke-dashoffset', dl ? (113.1 * (1 - frac)).toFixed(1) : '0');
      c.parentNode.classList.toggle('low', !!dl && left < 6000);
    });
    var mt = $('#myTimer');
    if (mt) {
      var mine = pendingSeats(g).indexOf(r.me) >= 0;
      mt.style.width = mine && dl && g.phase !== 'roundEnd' ? (frac * 100).toFixed(1) + '%' : '0';
      mt.classList.toggle('low', left < 6000);
      var sec = Math.ceil(left / 1000);
      if (mine && dl && g.phase !== 'roundEnd' && left > 0 && sec <= 5 && sec !== S.tickSec) { S.tickSec = sec; sfx('tick'); }
    }
    var rc = $('#rCount'); if (rc) rc.textContent = r.nextAt && g.phase === 'roundEnd' ? '(' + Math.ceil(Math.max(0, r.nextAt - now()) / 1000) + ')' : '';
  }
  setInterval(tickTimers, 250);

  /* ================= 시작 ================= */
  function boot() {
    if (location.search) try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
    if (CFG.env && CFG.env !== 'prod') { var b = document.createElement('div'); b.className = 'env-badge'; b.textContent = 'TEST · ' + CFG.env; document.body.appendChild(b); }
    if (!window.TE) { app.innerHTML = '<div class="boot">엔진 파일(engine.js)을 불러오지 못했어요</div>'; return; }
    var t = lsGet(LS_TOKEN), info = t && tokenInfo(t);
    if (info && info.x > Date.now()) { S.token = t; S.user = { uid: info.u, name: info.n, kind: info.k, admin: info.k === '운영진' }; return route(); }
    lsSet(LS_TOKEN, null);
    var ks = kakaoSession();
    if (ks && ks.user && ks.user.nickname && lsGet(LS_NOAUTO) !== '1') { renderLogin(); var kg = $('#kGo'); return loginKakao(kg); }
    renderLogin();
  }
  window.TICHU_DEBUG = { state: function () { return S; } };   // 개발자 도구에서 상태 확인용 (읽기 전용으로만 쓰세요)
  boot();
})();
