/*! 잠만보 꼬맨틀 — 화면 v1.5.2
 * 매일 하나의 비밀 단어를 '뜻이 가까운 정도'(단어 의미 유사도)로 찾아가는 게임.
 * 서버 Semantle.gs (semToday · semStart · semSubmit · semRank): 오늘의 유사도 표를 한 번 받으면 추측마다 서버를 거치지 않음.
 * 로그인(카카오) 회원은 하루 한 번 기록 → 점수 · 순위 · 연속 · 배지. 로그인 안 해도 풀 수 있음(기록 없음).
 * 단어 목록 vocab.txt 는 0_PC설정\도구\꼬맨틀_데이터_만들기.py 가 만든 것과 같아야 함 (서버가 보내는 목록값 vh 로 확인).
 */
(function () {
  'use strict';
  var VER = '1.9.0';
  var CFG = window.JMB_CONFIG || {};
  var ENV = CFG.env || 'prod';
  var ENV_SFX = ENV !== 'prod' ? '_' + ENV : '';
  var API = window.SEM_API_LOCAL || CFG.api || '';
  var ROOT = (function () { var seg = location.pathname.split('/')[1] || ''; return /\.github\.io$/.test(location.hostname) && seg ? '/' + seg + '/' : '/'; })();
  var LS = { auth: 'jmb_kakao_v2' + ENV_SFX, state: 'jmb_kakao_state' + ENV_SFX, play: 'jmb_sem_play' + ENV_SFX, pend: 'jmb_sem_pend' + ENV_SFX, help: 'jmb_sem_help', tab: 'jmb_sem_tab', sort: 'jmb_sem_sort', xl: 'jmb_sem_xl' };
  var HINT_COST = 15, TOPN = 1000, HINT_EVERY = 5;   // HINT_EVERY: 추측 5번마다 힌트가 하나씩 생김, 개수 제한 없음 (서버 SEM_CFG_.HINT_EVERY 와 같게)
  var BADGES = [   // 서버 Semantle.js badgesOf 와 같은 id
    { id: 'first', e: '🥇', n: '선두 주자', d: '그 날 가장 먼저 정답' },
    { id: 'fast', e: '⚡', n: '번개', d: '10번 안에 정답' },
    { id: 'lucky', e: '🍀', n: '행운아', d: '3번 안에 정답' },
    { id: 's3', e: '🔥', n: '불붙었다', d: '3일 연속 정답' },
    { id: 's7', e: '🌋', n: '일주일 개근', d: '7일 연속 정답' },
    { id: 's30', e: '👑', n: '꼬맨틀 왕', d: '30일 연속 정답' },
    { id: 'n10', e: '🏅', n: '꾸준러', d: '정답 10번' },
    { id: 'n50', e: '🎖️', n: '단골', d: '정답 50번' },
    { id: 'sharp', e: '🧠', n: '감 좋은 사람', d: '평균 25번 안 (10번 이상)' }
  ];
  var S = { view: 'play', vocab: null, idx: null, sims: null, ans: -1, rankOf: null, top: null, srv: null, L: null, rank: null, rkTab: lsGet(LS.tab) || 'today',
            nick: '', hist: null, histAt: 0, startP: null, busy: false, fb: null, lastW: '', t0: 0, scale: null,
            // sort: 기본은 유사도 순 (입력 순서를 직접 고른 사람만 입력 순서)
            sort: lsGet(LS.sort) === 'order' ? 'order' : 'sim', scrollNew: false, scrollRes: false, sharing: false, focused: false,
            // (1.7.0) 연습 탭: 오늘 판과 연습 판의 문제 · 추측 상태를 갈아끼움 (ctx = 지금 S 에 들어 있는 쪽, hold = 안 쓰는 쪽 보관)
            ctx: 'td', hold: { td: null, pz: null }, pDone: [], pK: null,
            xl: lsGet(LS.xl) !== '0' };   // (1.8.0) 엑셀 모드 — 기본 켜짐, 헤더 버튼(xlBtn)으로 끔 (기기에 저장)
  var CTX_KEYS = ['srv', 'L', 'sims', 'ans', 'rankOf', 'top', 'scale', 'lastW', 'fb'];
  function snap() { var o = {}; CTX_KEYS.forEach(function (k) { o[k] = S[k]; }); return o; }
  function load(o) { CTX_KEYS.forEach(function (k) { S[k] = o[k]; }); }
  function useCtx(name) {
    if (S.ctx === name || !S.hold[name]) return;
    S.hold[S.ctx] = snap(); load(S.hold[name]); S.ctx = name;
  }
  function today_() { return S.ctx === 'td' ? S : S.hold.td; }   // 연습 중에도 오늘 판 쪽에 접근 (비동기 응답이 늦게 올 때)

  /* ================= 공통 ================= */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function lsJSON(k) { try { return JSON.parse(lsGet(k) || 'null'); } catch (e) { return null; } }
  var toastT = 0;
  function toast(msg, err) { var t = $('toast'); t.textContent = xe(msg); t.className = 'toast on' + (err ? ' err' : ''); clearTimeout(toastT); toastT = setTimeout(function () { t.className = 'toast'; }, err ? 3800 : 2200); }
  function av(name, px) { return window.JMB_FX && name ? '<span class="av">' + JMB_FX.avatar(name, px) + '</span>' : ''; }
  function mmss(s) { s = Math.max(0, Math.round(s)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x; }
  function f2(v) { return (v / 100).toFixed(2); }
  function hap(k) { try { window.JMB_FX && JMB_FX.haptic(k); } catch (e) {} }
  /* ---------- 엑셀 모드 (1.8.0): html.xl 클래스 + 시트 탭 이름 · 탭 제목 · 브라우저 색. 이모지는 엑셀 모드에서 뺌 ---------- */
  function xe(s) { return S.xl ? String(s).replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]+\s*/u, '') : s; }
  function applyXl() {
    document.documentElement.classList.toggle('xl', !!S.xl);
    [].forEach.call($('tabs').children, function (b) {
      if (!b.hasAttribute('data-l')) b.setAttribute('data-l', b.textContent);
      b.textContent = S.xl ? xe(b.getAttribute('data-l')) : b.getAttribute('data-l');
    });
    [].forEach.call(document.querySelectorAll('meta[name="theme-color"]'), function (m) {
      if (!m.hasAttribute('data-o')) m.setAttribute('data-o', m.getAttribute('content'));
      m.setAttribute('content', S.xl ? '#217346' : m.getAttribute('data-o'));
    });
    document.title = S.xl ? '업무현황.xlsx - Excel' : '잠만보 꼬맨틀';
    var xb = $('xlBtn'); if (xb) xb.setAttribute('aria-pressed', S.xl ? 'true' : 'false');
  }
  function xlTitle() { return '업무현황' + (S.view === 'prac' ? '_연습' : S.view === 'rank' ? '_순위' : S.view === 'hist' ? '_이력' : S.srv && S.srv.no ? '_' + S.srv.no : '') + '.xlsx'; }

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
    var s = session();
    if (!s) return startLogin();
    if (!myNick()) { ask('닉네임 연결이 필요해요', '잠만보에서 카카오 계정에 모임 닉네임을 먼저 연결해 주세요.<br>잠만보로 갈까요?', '잠만보로 가기').then(function (ok) { if (ok) location.href = ROOT; }); return; }
    openModal('<div class="me-top">' + av(myNick(), 48) + '<div class="t"><b>' + esc(myNick()) + '</b><small>카카오로 로그인돼 있어요</small></div></div>' +
      '<div class="btns"><button type="button" class="btn pri" id="goHome">🏠 잠만보로 가기</button><button type="button" class="btn" id="logoutBtn">로그아웃 (잠만보 앱도 함께)</button><button type="button" class="btn" data-x>닫기</button></div>');
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
          if (/허용되지 않은 요청/.test(msg)) msg = '서버에 꼬맨틀 기능이 아직 없어요 (Semantle.gs 배포 필요)';
          if (/로그인이 만료/.test(msg)) { lsSet(LS.auth, null); renderAcct(); }
          var er = new Error(msg); er.server = true; throw er;
        }
        return j.r;
      }, function (e) { clearTimeout(timer); var er = new Error(e && e.name === 'AbortError' ? '응답이 너무 늦어요. 잠시 후 다시 시도해 주세요' : e instanceof TypeError ? '인터넷 연결을 확인해 주세요' : (e && e.message) || '오류'); throw er; });
  }

  /* ================= 데이터 (단어 목록 + 오늘 유사도 표) ================= */
  function sha1hex(text) {
    if (!(window.crypto && crypto.subtle && window.TextEncoder)) return Promise.resolve('');
    return crypto.subtle.digest('SHA-1', new TextEncoder().encode(text)).then(function (b) { return [].map.call(new Uint8Array(b), function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); });
  }
  /* (1.9.0) 단어 목록(약 410KB)은 기기(Cache Storage)에 저장해 두고 다음부터는 네트워크 없이 바로 읽음. 서버가 알려 주는 목록값(vh)과 다르면 새로 받음.
   * VOCAB_URL 의 숫자는 목록 내용이 바뀔 때만 올림 (시작 페이지 index.html 의 로그인 중 미리 받기 주소와 같게) — 화면 버전(VER)이 바뀌어도 다시 안 받음 */
  var VOCAB_URL = 'vocab.txt?v=1', VCACHE = 'jmb_sem_vocab' + ENV_SFX;
  function vocabFromCache() {
    if (!window.caches) return Promise.resolve(null);
    return caches.open(VCACHE).then(function (c) { return c.match('vocab'); }).then(function (r) { return r ? r.json() : null; })
      .then(function (o) { return o && o.t && o.h ? { words: o.t.split('\n'), hash: o.h, fromCache: true } : null; }, function () { return null; });
  }
  function loadVocab(force) {
    var net = function () {
      return fetch(VOCAB_URL, force ? { cache: 'reload' } : undefined).then(function (r) { if (!r.ok) throw new Error('단어 목록을 받지 못했어요'); return r.text(); }).then(function (t) {
        return sha1hex(t).then(function (h) {
          h = h.slice(0, 10);
          if (window.caches && h) { try { caches.open(VCACHE).then(function (c) { return c.put('vocab', new Response(JSON.stringify({ h: h, t: t }))); }).catch(function () {}); } catch (e) {} }
          return { words: t.split('\n'), hash: h };
        });
      });
    };
    return force ? net() : vocabFromCache().then(function (hit) { return hit || net(); });
  }
  function decodeTable(b64, n) {
    var bin = atob(b64), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    var a = new Int16Array(u.buffer, 0, u.length >> 1);
    if (a.length !== n) throw new Error('오늘 표가 단어 목록과 달라요 (' + a.length + ' ≠ ' + n + ')');
    return a;
  }
  function prepare(vocab, srv) {
    S.vocab = vocab.words; S.idx = new Map();
    for (var i = 0; i < S.vocab.length; i++) if (!S.idx.has(S.vocab[i])) S.idx.set(S.vocab[i], i);
    prepareTable(srv);
  }
  function prepareTable(srv) {
    S.sims = decodeTable(srv.table, srv.n);
    var best = -1, bv = -32768;
    for (var k = 0; k < S.sims.length; k++) if (S.sims[k] > bv) { bv = S.sims[k]; best = k; }
    S.ans = best;
    // (1.9.0) 4만 개를 전부 정렬하지 않고, 1000위 경계 값을 세어 찾은 뒤 그 이상인 것만 정렬 (결과는 전체 정렬과 같음 — 동점은 번호 순) → 느린 폰에서 시작이 빨라짐
    var cnt = new Uint32Array(65536), sims = S.sims, j, cut, need = TOPN, cand = [];
    for (j = 0; j < sims.length; j++) if (j !== S.ans) cnt[sims[j] + 32768]++;
    for (cut = 65535; cut >= 0; cut--) { need -= cnt[cut]; if (need <= 0) break; }
    for (j = 0; j < sims.length; j++) if (j !== S.ans && sims[j] + 32768 >= cut) cand.push(j);
    cand.sort(function (a, b) { return sims[b] - sims[a]; });
    S.top = cand.slice(0, TOPN);
    S.rankOf = new Map(); S.top.forEach(function (ix, r) { S.rankOf.set(ix, r + 1); });
    S.scale = { r1: S.sims[S.top[0]], r10: S.sims[S.top[9]], rN: S.sims[S.top[TOPN - 1]] };
  }

  /* ================= 오늘 판 (이 기기에 저장) ================= */
  function freshLocal() { return { day: S.srv.day, vh: S.srv.vh, g: [], hints: 0, done: false, win: false, rec: false, nonce: '', startAt: 0, res: null, pend: false }; }
  function saveLocal() { if (S.L && S.L.prac) return; lsSet(LS.play, JSON.stringify(S.L)); }   // 연습 판은 저장하지 않음 (오늘 판을 덮어쓰면 안 됨)
  function guessWords() { return S.L.g.map(function (x) { return x.w; }); }
  function realCount() { return S.L.g.filter(function (x) { return !x.h; }).length; }
  function simOf(w) { return S.sims[S.idx.get(w)]; }
  function rankIn(w) { return S.rankOf.get(S.idx.get(w)) || 0; }
  function tier(w) {   // 0 얼음 · 1 차가움 · 2 미지근 · 3 따뜻 · 4 뜨거움 · 5 코앞 · 6 정답
    var i = S.idx.get(w); if (i === S.ans) return 6;
    var r = S.rankOf.get(i) || 0, s = S.sims[i];
    if (r && r <= 10) return 5; if (r && r <= 100) return 4; if (r) return 3;
    return s >= S.scale.rN - 300 ? 2 : s > 0 ? 1 : 0;
  }
  var TIER = [{ e: '🧊', t: '얼음장 같아요' }, { e: '🥶', t: '차가워요' }, { e: '😐', t: '미지근해요' }, { e: '😮', t: '따뜻해요! 1000위 안이에요' }, { e: '🥵', t: '뜨거워요! 100위 안이에요' }, { e: '🔥', t: '코앞이에요! 10위 안!' }, { e: '🎉', t: '정답!' }];
  var HEAT = ['⬛', '🟦', '🟨', '🟧', '🟥', '🔥', '🎯'];

  /* ---------- 진행 중 추측을 서버에도 저장 (다른 기기 · 캐시를 지운 뒤에도 이어 하기) ---------- */
  var saveT = 0;
  function gString() { return S.L.g.map(function (x) { return (x.h ? '*' : '') + x.w; }).join('|'); }
  function scheduleSave() { if (!recordable()) return; clearTimeout(saveT); saveT = setTimeout(flushSave, 800); }
  function flushSave() {
    clearTimeout(saveT);
    if (!S.L || !recordable() || !S.L.nonce || !S.L.g.length || !API) return Promise.resolve();
    // keepalive: 창을 닫는 순간에도 요청이 끝까지 가게 함. 실패해도 이 기기에는 저장돼 있음
    return fetch(API, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: 'semSave', args: [token(), S.L.nonce, gString()], env: ENV !== 'prod' ? 'beta' : undefined }) }).catch(function () {});
  }
  function parseG(g) {
    return String(g || '').split('|').filter(Boolean).map(function (t) { var h = t.charAt(0) === '*'; return { w: h ? t.slice(1) : t, h: h ? 1 : 0, t: 0 }; }).filter(function (x) { return S.idx.has(x.w); });
  }
  /** 서버에 있는 오늘 판(다른 기기에서 한 것 포함)을 이 기기 판에 합침 */
  function mergeServer(L, my) {
    if (!S.nick || !my || L.done) return;
    var sg = parseG(my.g);
    if (my.state === '완료' && my.res) {   // 다른 기기에서 이미 끝냄 → 끝난 판 그대로 보여 줌
      L.g = sg; L.done = true; L.win = !!my.res.win; L.n = my.res.guesses; L.cnt = sg.length; L.hints = my.res.hints; L.res = my.res; L.rec = false;
      return;
    }
    if (my.state !== '진행중' || !sg.length) return;
    var have = {}; sg.forEach(function (x) { have[x.w] = 1; });
    var merged = sg.concat(L.g.filter(function (x) { return !have[x.w]; }));
    if (merged.length > L.g.length) L.g = merged;
    L.hints = Math.max(L.hints, L.g.filter(function (x) { return x.h; }).length);
    L.rec = true; S.lastW = '';
  }

  function recordable() { return !!(S.L && S.L.rec && !S.L.done); }
  function ensureStart() {
    if (!S.L.rec || S.L.nonce) return Promise.resolve();
    if (S.startP) return S.startP;
    S.startP = api('semStart', [token()]).then(function (r) { S.L.nonce = r.nonce; S.L.startAt = Date.now(); saveLocal(); }, function (e) {
      S.L.rec = false; saveLocal();
      toast(/이미 했어요|더 할 수 없어요/.test(e.message) ? '오늘 기록은 이미 했어요. 연습으로 계속 풀 수 있어요' : e.message, true); render();
    }).then(function () { S.startP = null; });
    return S.startP;
  }

  /* ================= 추측 ================= */
  function normalize(s) { return String(s || '').normalize('NFC').replace(/\s+/g, '').replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ]/g, ''); }
  function guess(raw) {
    var w = normalize(raw), inp = $('gw');
    if (/[A-Za-z0-9]/.test(String(raw || ''))) {   // 영어 · 숫자는 안 됨 (단어 목록이 한글뿐)
      toast('한글로만 입력해 주세요 (영어 · 숫자는 안 돼요)', true); hap('warn');
      if (inp) { inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake'); inp.select(); }
      return;
    }
    if (!w || !S.idx) return;
    var typed = w;
    if (!S.idx.has(w)) {   // (1.6.0) 사전에 없으면 기본형 · 조사를 뺀 말로 한 번 더 찾음 ('먹었다' → '먹다', '학교에서' → '학교')
      var alt = findForm(w, function (x) { return S.idx.has(x); });
      if (!alt) { toast('‘' + w + '’ 은(는) 사전에 없는 단어예요', true); if (inp) { inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake'); inp.select(); } hap('warn'); return; }
      w = alt;
    }
    if (guessWords().indexOf(w) >= 0) { toast(w === typed ? '이미 추측한 단어예요' : '‘' + typed + '’ → ‘' + w + '’ 은(는) 이미 추측했어요'); S.lastW = w; render(); return; }
    addGuess(w, false);
    if (w !== typed) toast('‘' + typed + '’ 은(는) 사전에 없어서 가까운 꼴 ‘' + w + '’ (으)로 찾았어요');
  }
  /* 사전에 없는 말의 '찾아볼 후보': 어미를 떼고 '다' 를 붙인 기본형, 조사를 뗀 말. 긴 어미부터, 앞에 있는 후보가 먼저 */
  var V_END = ['었습니다', '았습니다', '였습니다', '으세요', '습니다', '었어요', '았어요', '였어요', '으면', '어서', '아서', '으니', '지만', '으며', '세요', '어요', '아요', '었다', '았다', '였다', '는다', '는', '은', '을', '고', '게', '지', '면', '니', '기', '음', '어', '아', '네', '죠', '며', '자'];
  var H_END = ['했습니다', '합니다', '했어요', '하세요', '해요', '했다', '한다', '하는', '하고', '하게', '하면', '해서', '하여', '하지', '하기', '함', '할', '한', '해'];
  var N_END = ['으로부터', '에서는', '으로는', '에게서', '이라는', '에서', '에게', '으로', '까지', '부터', '처럼', '보다', '만큼', '이나', '이란', '이라', '한테', '들은', '들이', '들을', '들의', '들', '은', '는', '이', '가', '을', '를', '의', '에', '도', '와', '과', '로', '만', '나', '랑', '요'];
  function jong(ch) { var c = ch.charCodeAt(0) - 0xAC00; return c < 0 || c > 11171 ? -1 : c % 28; }
  function noJong(ch) { var c = ch.charCodeAt(0) - 0xAC00; return String.fromCharCode(0xAC00 + c - c % 28); }
  function lemmas(w) {
    var out = [], add = function (x) { if (x && x !== w && out.indexOf(x) < 0) out.push(x); }, i, e, st;
    // 기본형('웃다' · '사랑하다')이 사전에 없을 때: 사전에는 쓰이는 꼴('웃는' · '사랑한다')로 들어 있는 경우가 많아 그쪽으로 찾음
    if (w.length > 2 && w.slice(-2) === '하다') { st = w.slice(0, -2); add(st); ['한다', '하는', '했다', '하고', '하게', '하기', '한', '할', '함', '해'].forEach(function (x) { add(st + x); }); }   // 어근('공부' · '사랑')이 뜻이 가장 가까워 먼저
    else if (w.length > 1 && w.slice(-1) === '다') {
      st = w.slice(0, -1);
      var lc = st.charAt(st.length - 1), lj = jong(lc);
      if (lj === 0) { var base = lc.charCodeAt(0); add(st.slice(0, -1) + String.fromCharCode(base + 4) + '다'); add(st.slice(0, -1) + String.fromCharCode(base + 4)); }   // 가다 → 간다 · 예쁘다 → 예쁜
      if (lj === 8) { var nj = st.slice(0, -1) + noJong(lc); add(nj + '는'); add(nj + '는다'); add(st.slice(0, -1) + String.fromCharCode(noJong(lc).charCodeAt(0) + 4) + '다'); }   // 팔다 → 파는 · 판다 (ㄹ 탈락)
      ['는다', '는', '고', '었다', '았다', '어', '아', '기', '음', '게', '지'].forEach(function (x) { add(st + x); });
    }
    for (i = 0; i < H_END.length; i++) { e = H_END[i]; if (w.length > e.length && w.slice(-e.length) === e) { st = w.slice(0, -e.length); add(st + '하다'); add(st); } }
    var ends = V_END.map(function (x) { return [x, 1]; }).concat(N_END.map(function (x) { return [x, 0]; })).sort(function (a, b) { return b[0].length - a[0].length || b[1] - a[1]; });
    for (i = 0; i < ends.length; i++) { e = ends[i][0]; if (w.length > e.length && w.slice(-e.length) === e) { st = w.slice(0, -e.length); add(ends[i][1] ? st + '다' : st); } }
    // 받침으로 붙는 어미: 갑니다 → 가다, 예쁜 → 예쁘다, 갈 → 가다, 갔다 → 가다
    var body = w, tail = '';
    if (w.length > 2 && w.slice(-2) === '니다') { body = w.slice(0, -2); tail = 'ㅂ'; } else if (w.length > 1 && w.slice(-1) === '다') { body = w.slice(0, -1); tail = 'ㅆ'; }
    var last = body.charAt(body.length - 1), j = last ? jong(last) : -1;
    if (tail === 'ㅂ' && j === 17) add(body.slice(0, -1) + noJong(last) + '다');
    if (tail === 'ㅆ' && j === 20) add(body.slice(0, -1) + noJong(last) + '다');
    if (!tail && (j === 4 || j === 8 || j === 16)) add(w.slice(0, -1) + noJong(last) + '다');
    add(w + '다'); add(w + '하다');
    return out;
  }
  function findForm(w, has) {   // 사전에 있는 가까운 꼴 — 한 단계로 안 되면 한 번 더 ('웃었다' → '웃다' → '웃는다')
    var l1 = lemmas(w), i, j, l2;
    for (i = 0; i < l1.length; i++) if (has(l1[i])) return l1[i];
    for (i = 0; i < l1.length; i++) { l2 = lemmas(l1[i]); for (j = 0; j < l2.length; j++) if (has(l2[j])) return l2[j]; }
    return '';
  }
  function addGuess(w, isHint) {
    if (recordable() && !S.L.nonce) ensureStart();
    S.L.g.push({ w: w, h: isHint ? 1 : 0, t: Date.now() });
    S.lastW = w; S.scrollNew = true; saveLocal(); scheduleSave();
    var tr = tier(w);
    if (tr === 6 && !S.L.done) return win(w);
    if (S.L.done && tr === 6) { toast('🎉 정답이에요! (연습)'); S.fb = null; render(); return; }
    if (!isHint && !S.L.done && !S.L.prac && realCount() % HINT_EVERY === 0) setTimeout(function () { toast('💡 힌트가 생겼어요! (' + hintsLeft() + '개 사용 가능)'); }, 450);
    S.fb = { tr: tr, w: w, r: rankIn(w) };
    hap(tr >= 4 ? 'turn' : 'tap');
    render();
  }
  /* 힌트는 처음엔 못 씀: 추측 5번마다 하나씩 생김, 개수 제한 없음 (끝난 뒤 연습에서는 바로 씀) */
  function hintsUnlocked() { return Math.floor(realCount() / HINT_EVERY); }
  function hintsLeft() { return hintsUnlocked() - S.L.hints; }
  function hintNext() { return HINT_EVERY - realCount() % HINT_EVERY; }
  function hintBtn() {
    var L = S.L, label, off = false;
    if (L.prac) label = '💡 힌트';   // 연습은 개수 제한 없음 (글자가 두 줄로 꺾이지 않게 짧게)
    else if (L.done) label = '💡 힌트 (연습)';
    else if (hintsLeft() > 0) label = '💡 힌트 (' + hintsLeft() + '개 남음)';   // 점수 비용은 확인창에서 알려 줌 (버튼 글자가 두 줄로 꺾이지 않게 짧게)
    else { off = true; label = '🔒 힌트 (' + hintNext() + '번 더 추측)'; }
    return '<button type="button" class="btn" id="hintBtn"' + (off ? ' disabled' : '') + '>' + xe(label) + '</button>';
  }
  function hint() {
    var gated = !S.L.done && !S.L.prac, rec = recordable();   // 연습 판은 힌트 제한 · 점수 없음
    if (gated && hintsLeft() <= 0) return toast(hintNext() + '번 더 추측하면 힌트가 생겨요', true);
    var best = 0; guessWords().forEach(function (w) { var r = rankIn(w); if (r && (!best || r < best)) best = r; });
    var target = best ? Math.max(2, Math.floor(best / 2)) : 300 + Math.floor(Math.random() * 400);
    var have = {}; guessWords().forEach(function (w) { have[S.idx.get(w)] = 1; });
    var pick = -1;
    for (var d = 0; d < TOPN && pick < 0; d++) {
      var a = target - 1 + d, b = target - 1 - d;
      if (a < TOPN && !have[S.top[a]]) pick = S.top[a]; else if (b >= 1 && !have[S.top[b]]) pick = S.top[b];
    }
    if (pick < 0) return toast('더 줄 힌트가 없어요', true);
    var cost = rec ? ' (−' + HINT_COST + '점)' : '';
    var use = function () {
      if (S.L.done && gated) return;
      if (gated) S.L.hints++;
      addGuess(S.vocab[pick], true);
      toast('💡 힌트: ‘' + S.vocab[pick] + '’ — ' + rankIn(S.vocab[pick]) + '위예요' + cost);
    };
    if (!rec) return use();
    ask('💡 힌트를 볼까요?', '지금까지 찾은 가장 가까운 단어보다 <b>더 가까운 단어</b> 하나를 알려 줘요.<br>' + (S.L.hints + 1) + '번째 힌트 · <b>−' + HINT_COST + '점</b>', '힌트 보기').then(function (ok) { if (ok) use(); });
  }
  function giveUp() {
    if (S.L.done) return;
    if (S.L.prac) return ask('👀 정답을 볼까요?', '연습 문제라 기록은 없어요. 정답과 가까운 단어를 구경하며 감을 익혀 보세요.', '정답 보기').then(function (ok) { if (ok && !S.L.done) { finish(false); S.scrollRes = true; render(); } });
    ask('🏳️ 정말 포기할까요?', S.L.rec ? '정답 기록은 <b>0점</b>이고 연속 기록이 끊겨요.' : '오늘 문제를 포기해요.', '포기하기', true).then(function (ok) {
      if (!ok || S.L.done) return;
      finish(false); S.scrollRes = true;
      if (S.L.rec) submit(false, ''); else render();
    });
  }

  /* ================= 끝 · 기록 ================= */
  function finish(isWin) { S.L.done = true; S.L.win = isWin; S.L.n = realCount(); S.L.cnt = S.L.g.length; saveLocal(); }
  function win(w) {
    finish(true); S.scrollRes = true;
    if (!S.xl) { try { JMB_FX.confetti({ x: .5, y: .35, count: 120, duration: 2400 }); } catch (e) {} }   // 엑셀 모드는 조용히
    hap('win');
    if (S.L.rec) submit(true, w); else render();
  }
  function submit(isWin, word) {
    if (S.busy) return Promise.resolve();   // 두 번 누르거나 겹쳐도 한 번만 보냄
    S.busy = true; render();
    return ensureStart().then(function () {
      if (!S.L.rec || !S.L.nonce) { S.busy = false; render(); return; }
      clearTimeout(saveT);
      var payload = { win: isWin, guesses: Math.max(isWin ? 1 : 0, S.L.n), hints: S.L.hints, answer: word, g: gString().slice(0, 11000) };
      return api('semSubmit', [token(), S.L.nonce, payload]).then(function (r) {
        S.L.res = r; S.L.pend = false; saveLocal(); S.busy = false; lsSet(LS.pend, null);
        S.rank = null; loadMine(); render();
      }, function (e) {
        S.busy = false;
        if (e.server) { S.L.res = { error: e.message }; S.L.rec = false; saveLocal(); toast(e.message, true); }   // 서버가 거절 — 다시 보내도 같음
        else { S.L.pend = { win: isWin, word: word }; saveLocal(); toast('기록을 보내지 못했어요. 연결되면 다시 보낼게요 (' + e.message + ')', true); }
        render();
      });
    });
  }
  function retryPending() {
    if (!S.L || !S.L.pend || !S.L.rec || !S.L.nonce) return;
    submit(S.L.pend.win, S.L.pend.word);
  }
  function loadMine() { return api('semToday', [token()]).then(function (r) { var T = today_(); if (r && r.ready && T && T.srv) { T.srv.stats = r.stats; T.srv.my = r.my; T.srv.solvedToday = r.solvedToday; } render(); }, function () {}); }

  /* ================= 나눔 ================= */
  function shareText() {
    // (1.5.3) 링크 · 추측 횟수 · 이모지 열(개수로 횟수가 보임)은 넣지 않음 — 단톡방 도배 · 횟수 공개 부담을 줄이려고. 힌트 수와 점수만. 정답 단어도 넣지 않음
    var L = S.L, head = '🔤 꼬맨틀 #' + S.srv.no + (L.win ? ' 🎉' : ' 😵');
    if (!L.win) return head + '\n오늘은 포기…';
    var line = '힌트 ' + (L.hints ? L.hints + '개' : '없이');
    if (L.res && L.res.points) line += ' · ⭐' + L.res.points + '점';
    return head + '\n' + line;
  }
  function share() {
    if (S.sharing) return;   // 공유창이 떠 있는 동안 또 누르면 오류가 나서 막음
    S.sharing = true;
    var text = shareText(), done = function () { S.sharing = false; };
    var copy = function () {
      (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { done(); toast('복사했어요. 단톡방에 붙여넣어 주세요'); }, function () { done(); copyBox(text); });
    };
    // (1.6.1) PC 는 공유창에 카카오톡이 안 나와서('일부 방법만 표시') 바로 복사. 휴대폰만 공유창을 쓰고, 공유가 실패하면(취소는 빼고) 복사
    var phone = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent || '') || (/Macintosh/.test(navigator.userAgent || '') && navigator.maxTouchPoints > 1);
    if (phone && navigator.share) { navigator.share({ text: text }).then(done, function (e) { if (e && e.name === 'AbortError') done(); else copy(); }); return; }
    copy();
  }
  function copyBox(text) {   // 복사가 막힌 브라우저(인앱 브라우저 등): 글을 보여 주고 직접 복사하게
    var sh = openModal('<h2>결과 복사</h2><p>아래 글을 길게 눌러 복사한 뒤 단톡방에 붙여넣어 주세요.</p><textarea class="cbox" readonly rows="5"></textarea><div class="btns"><button type="button" class="btn pri" data-x>닫기</button></div>');
    var ta = sh.querySelector('.cbox'); ta.value = text; try { ta.focus(); ta.select(); } catch (e) {}
  }

  /* ================= 창 (뒤로가기 · ✕ · 바깥 탭 · ESC 로 닫힘) ================= */
  var modalOpen = false, askRes = null, modalAt = 0;   // modalAt: 창이 열리거나 닫힌 시각 — 더블탭의 두 번째 탭이 바깥 영역이나 창 아래 버튼에 닿지 않게 0.35초는 탭을 무시
  function openModal(html) {
    var first = !modalOpen;
    $('modal').innerHTML = '<div class="mbg" id="mbg"><div class="sheet" role="dialog" aria-modal="true" tabindex="-1"><button type="button" class="x" data-x aria-label="닫기">✕</button>' + html + '</div></div>';
    modalOpen = true; modalAt = Date.now(); document.documentElement.classList.add('lock');
    if (first) { try { history.pushState({ v: S.view, p: (history.state && history.state.p) || 0, m: 1 }, ''); } catch (e) {} }   // 안드로이드 뒤로가기 · 아이폰 스와이프로 창만 닫힘
    var m = $('mbg');
    m.addEventListener('click', function (e) { if (Date.now() - modalAt < 350) return; if (e.target === m || e.target.closest('[data-x]')) closeModal(); });
    var sh = m.firstChild; try { sh.focus({ preventScroll: true }); } catch (e) {}
    return sh;
  }
  function closeModal(fromPop) {
    if (!modalOpen) return;
    modalOpen = false; modalAt = Date.now(); $('modal').innerHTML = ''; document.documentElement.classList.remove('lock');
    if (askRes) { var r = askRes; askRes = null; r(false); }   // 확인창을 그냥 닫으면 '취소'
    if (!fromPop && history.state && history.state.m) { try { history.back(); } catch (e) {} }
  }
  /** 화면 안 확인창 (기본 confirm 은 카카오톡 등 인앱 브라우저에서 막히는 경우가 있음). Promise<true|false> */
  function ask(title, text, okLabel, danger) {
    return new Promise(function (res) {
      if (askRes) askRes(false);
      askRes = res;
      openModal('<h2>' + esc(title) + '</h2><p>' + text + '</p><div class="btns two"><button type="button" class="btn" data-x>취소</button><button type="button" class="btn ' + (danger ? 'dng' : 'pri') + '" id="askOk">' + esc(okLabel || '확인') + '</button></div>');
    });
  }
  function help() {
    lsSet(LS.help, '1');
    openModal('<h2>🎯 꼬맨틀 하는 법</h2>' +
      '<p>매일 하나의 <b>비밀 단어</b>가 정해져요. 아무 단어나 입력하면 비밀 단어와 <b>뜻이 얼마나 가까운지</b>(유사도)를 알려 줘요. 철자가 아니라 <b>쓰임새·의미</b>가 비슷해야 점수가 높아요.</p>' +
      '<ul><li>유사도는 -100 ~ 100. 높을수록 가까워요.</li><li><b>1000위 안</b>에 들면 순위가 보여요. (1위 = 비밀 단어와 가장 가까운 단어)</li><li>같은 문맥에 같이 나올 법한 단어를 떠올려 보세요. 반대말도 의외로 가까울 수 있어요. ‘사랑’과 ‘증오’는 뜻은 반대지만 같은 문맥에 자주 나와서 비슷해요. ‘밤’처럼 뜻이 여럿인 단어(어두운 밤 · 먹는 밤)는 어느 쪽인지도 생각해 보세요.</li><li>정답을 맞힌 뒤에도 추측을 계속할 수 있어요. 맞힌 뒤에 보이는 <b>가까운 단어 1000개</b>를 살펴보면 유사도를 이해하는 데 도움이 돼요. 정답은 한국 시간 자정에 바뀌고, 어제 정답과 가까운 단어도 볼 수 있어요.</li><li>비밀 단어는 명사 · 동사 · 형용사 등 모든 품사의 <b>기본형</b>이고 <b>두 글자 이상</b>이에요. 예) 행복, 기쁘다, 사랑하다. 추측은 한 글자 단어도 할 수 있어요.</li></ul>' +
      '<h4>🏆 점수와 순위</h4>' +
      '<ul><li><b>정답 점수</b> = 150 − 추측 횟수 − 힌트 × 15 (최소 0점) — 적게 추측하고 힌트를 덜 쓸수록 높아요. 일찍 푼다고 더 받지는 않아요</li><li><b>연속 보너스</b> 이틀째부터 연속 정답 하루마다 +5 (최대 +30)</li><li><b>힌트</b>는 처음엔 못 써요. 추측 <b>5번마다 하나씩</b> 생기고 개수 제한은 없어요. 하나당 −15점. 지금까지 찾은 가장 가까운 단어보다 더 가까운 단어를 알려 줘요</li><li>포기하면 0점 · 연속 기록이 끊겨요</li><li>하루에 한 번만 기록돼요. 정답을 맞힌 뒤에도 계속 연습할 수 있어요.</li><li>순위는 오늘(점수 순) · 이번 주 · 시즌(분기) · 연속 정답 · 레이팅이 있어요. <b>다른 사람에게는 힌트 수와 점수만 보여요</b> (추측 횟수 · 걸린 시간은 나만 봐요).</li><li><b>레이팅</b>은 그 날 푼 사람끼리 추측 횟수를 겨루는 점수예요 (처음 1500점). 적게 맞히면 오르고 많이 맞히면 내려가요. 같으면 무승부, 포기는 꼴찌, 힌트 1개는 추측 5번으로 쳐요. 분기마다 새로 시작하고 3일 이상 참여하면 순위에 올라요.</li><li>순위에서 이름을 누르면 그 사람의 기록과 나와의 비교를 볼 수 있어요.</li></ul>' +
      '<h4>📱 팁</h4><p>한글 단어만 입력할 수 있어요 (영어 · 숫자는 안 돼요). ‘먹었다’ · ‘학교에서’ · ‘웃다’ 처럼 사전에 없는 꼴은 사전에 있는 가까운 꼴(‘먹다’ · ‘학교’ · ‘웃는’)로 바꿔 찾아요. 점수는 컴퓨터가 웹 · 위키백과 글에서 단어가 함께 쓰인 정도를 학습해 계산한 뜻 거리라서, 학습한 글에 따라 편향이 있거나 가끔 이상한 점수가 나올 수 있어요. 웃고 넘겨 주세요 😄</p><p class="hint">단어 벡터 출처: 페이스북(메타) 패스트텍스트, CC BY-SA 3.0 · 게임 방식은 뉴스젤리 꼬맨틀을 참고했어요.</p>' +
      '<div class="btns"><button type="button" class="btn pri" data-x>알겠어요</button></div>');
  }

  /* ================= 화면 ================= */
  function setHead() {
    var st = S.srv && S.srv.stats;
    if (S.xl) { $('ttl').textContent = xlTitle(); $('sub').textContent = '저장됨'; return; }
    if (S.view === 'prac') { $('ttl').textContent = '꼬맨틀 연습'; $('sub').textContent = '기록 없이 마음껏 — 힌트도 무제한'; return; }
    $('ttl').textContent = S.srv && S.srv.no ? '꼬맨틀 #' + S.srv.no : '꼬맨틀';
    $('sub').textContent = st && st.streak ? '🔥 ' + st.streak + '일 연속 정답 중' : '오늘의 비밀 단어를 찾아라';
  }
  function tabsOn() { [].forEach.call($('tabs').children, function (b) { b.classList.toggle('on', b.getAttribute('data-v') === S.view); }); }
  /* ---------- 로그인 안 하면 시작 못 함 (서버도 로그인 없이는 문제를 안 줌) ---------- */
  function renderGate(hasSession) {
    $('tabs').hidden = true; updateTop();
    $('ttl').textContent = S.xl ? '업무현황.xlsx' : '꼬맨틀'; $('sub').textContent = S.xl ? '로그인 필요' : '로그인하고 시작하세요';
    $('view').innerHTML = '<div class="card gate"><div class="em">🔒</div><h2>로그인하고 시작하세요</h2>' +
      '<p>꼬맨틀은 <b>잠만보 회원</b>만 할 수 있어요.<br>카카오로 로그인하면 기록 · 순위 · 레이팅이 남아요.</p>' +
      (hasSession ? '<div class="note warn" style="margin:12px 0 0">카카오 로그인은 됐는데 <b>모임 닉네임이 아직 연결되지 않았어요.</b><br>잠만보 앱 오른쪽 위 계정 버튼에서 닉네임을 먼저 연결해 주세요.</div><div class="btns"><button type="button" class="btn pri" id="goHome">🏠 잠만보로 가서 연결하기</button></div>'
                  : '<div class="btns"><button type="button" class="btn pri" id="login">카카오로 로그인</button></div>') + '</div>';
  }
  function render() {
    if (!S.nick) return renderGate(!!session());
    setHead(); tabsOn();
    if (S.view === 'prac') return renderPrac();
    if (S.view === 'rank') return renderRank();
    if (S.view === 'hist') return renderHist();
    renderPlay();
  }

  function metaCard() {
    var s = S.srv, h = '<div class="card"><div class="head"><div class="no">#' + s.no + '<small> 번째 문제</small></div><div class="meta">' +
      '오늘 <b>' + (s.solvedToday || 0) + '명</b>이 맞혔어요' + (s.yesterday ? '<br>어제 정답: <b>' + esc(s.yesterday) + '</b> <button type="button" class="btn sm" id="ydBtn">가까운 단어</button>' : '') + '</div></div>' +
      '<div class="scale"><div><b>' + f2(S.scale.r1) + '</b><small>1위 유사도</small></div><div><b>' + f2(S.scale.r10) + '</b><small>10위</small></div><div><b>' + f2(S.scale.rN) + '</b><small>1000위</small></div></div>';
    var st = s.stats, chips = '';
    if (S.nick && st) chips += '<span class="chip on">' + ratingLabel(st) + '</span><span class="chip on">🏅 ' + st.solves + '회 정답</span>' + (st.streak ? '<span class="chip hot">🔥 ' + st.streak + '일 연속</span>' : '') + '<span class="chip">⭐ ' + st.points + '점</span>';
    if (chips) h += '<div class="chips">' + chips + '</div>';
    return h + nudge() + '</div>';
  }
  function statusNote() {
    var L = S.L, my = S.srv.my;
    if (!S.nick) return '<div class="note warn">🔒 <b>로그인하고 풀면</b> 정답 기록 · 순위 · 연속 기록이 남아요. 지금은 연습 모드예요.<br><button type="button" class="btn sm" id="login">카카오 로그인</button></div>';
    if (L.rec || !my) return '';
    if (my.state === '완료') return '<div class="note ok">✅ 오늘 기록은 끝났어요' + (my.result === '정답' ? ' (' + my.guesses + '번 · ' + my.points + '점)' : ' (포기)') + '. 아래는 연습이라 점수에 안 들어가요.</div>';
    return '';
  }
  function resultCard() {
    var L = S.L, r = L.res, n = L.n;
    if (L.prac) return '<div class="card res pop"><div class="em">' + (L.win ? '🎉' : '👀') + '</div><h2>' + (L.win ? '정답이에요!' : '정답은 이거였어요') + '</h2>' +
      '<p>' + (L.win ? '<b>' + esc(S.vocab[S.ans]) + '</b> — ' + n + '번 만에 맞혔어요' : '<b>' + esc(S.vocab[S.ans]) + '</b>') + ' <small>(연습 · 기록 없음)</small></p>' +
      '<div class="heat">' + L.g.slice(0, L.cnt).map(function (x) { return HEAT[tier(x.w)]; }).join('') + '</div>' +
      '<div class="btns"><button type="button" class="btn pri" id="pracNext">🔁 다른 문제로 연습</button><button type="button" class="btn" id="topbtn">가까운 단어 1000개 보기</button><button type="button" class="btn" id="pracBack">🎯 오늘 문제로</button></div></div>';
    if (S.busy) return '<div class="card res"><div class="em">⏳</div><h2>기록 중…</h2></div>';
    var h = '<div class="card res pop"><div class="em">' + (L.win ? '🎉' : '😵') + '</div><h2>' + (L.win ? '정답이에요!' : '아쉬워요') + '</h2>' +
      '<p>' + (L.win ? '<b>' + esc(S.vocab[S.ans]) + '</b> — ' + n + '번 만에 맞혔어요' + (L.hints ? ' · 힌트 ' + L.hints : '') : '정답은 <b>' + esc(S.vocab[S.ans]) + '</b> 였어요') + '</p>';
    if (r && !r.error) {
      if (r.win) {
        h += '<div class="pts">+' + r.points + '점</div><div class="parts">' +
          '<span class="chip">기본 <b>' + r.parts.base + '</b></span>' + '<span class="chip">오늘 ' + r.order + '번째 정답</span>' +
          (r.parts.streak ? '<span class="chip hot">🔥 ' + r.streak + '일 연속 <b>+' + r.parts.streak + '</b></span>' : '') + (r.parts.hint ? '<span class="chip">힌트 <b>' + r.parts.hint + '</b></span>' : '') + '<span class="chip">⏱ ' + mmss(r.sec) + '</span></div>';
      } else h += '<p class="hint">0점 · 연속 기록이 끊겼어요. 내일 다시 도전!</p>';
    } else if (r && r.error) h += '<div class="note bad" style="margin-top:10px">기록하지 못했어요: ' + esc(r.error) + '</div>';
    else if (L.pend) h += '<div class="note warn" style="margin-top:10px">기록을 아직 못 보냈어요. <button type="button" class="btn sm" id="retry">다시 보내기</button></div>';
    else if (!L.rec) h += '<p class="hint">연습이라 기록은 없어요.</p>';
    h += '<div class="heat">' + L.g.slice(0, L.cnt).map(function (x) { return HEAT[tier(x.w)]; }).join('') + '</div>' +
      '<div class="btns"><button type="button" class="btn pri" id="share">📤 카톡으로 공유</button><button type="button" class="btn" id="topbtn">가까운 단어 1000개 보기</button>' +
      (S.nick ? '<button type="button" class="btn" id="goRank">🏆 순위 보기</button>' : '') + '</div></div>';
    return h;
  }
  function rows() {
    var L = S.L, list = L.g.map(function (x, i) { return { w: x.w, n: i + 1, s: simOf(x.w), r: rankIn(x.w), h: x.h, t: tier(x.w), win: S.idx.get(x.w) === S.ans }; });
    var last = S.lastW ? list.filter(function (o) { return o.w === S.lastW; })[0] : null, rn = 1;   // 엑셀 모드: 머리글 줄이 1행이라 데이터는 2행부터
    function tr(o, cls) {
      var pct = Math.max(0, Math.min(100, o.s / (S.scale.r1 || 1) * 100));
      var rk = o.win ? '정답!' : o.r ? '<div class="rbar"><em>' + o.r + '</em><i><b style="width:' + Math.max(4, (TOPN - o.r + 1) / TOPN * 100) + '%"></b></i></div>' : '<span class="sub">' + (S.xl ? '-' : '1000위 밖') + '</span>';
      return '<tr' + (cls.indexOf('last') >= 0 ? ' id="lastRow"' : '') + ' class="' + cls + ' t' + o.t + (o.h ? ' hintw' : '') + '">' + (S.xl ? '<td class="rn">' + (++rn) + '</td>' : '') + '<td class="n">' + o.n + '</td><td class="w">' + (S.xl ? '' : '<span class="te">' + TIER[o.t].e + '</span>') + esc(o.w) + '</td><td class="s">' + f2(o.s) + '<div class="bar2" style="width:' + (o.win ? 100 : pct) + '%"></div></td><td class="r">' + rk + '</td></tr>';
    }
    var h = '<div class="seg sm srt" id="sortSeg"><button type="button" data-sort="sim" class="' + (S.sort === 'sim' ? 'on' : '') + '">유사도 순</button><button type="button" data-sort="order" class="' + (S.sort === 'order' ? 'on' : '') + '">입력 순서</button></div>' +
      (S.xl   // 엑셀 모드: 열 머리글(A B C D) + 1행 제목 줄 + 행 번호
        ? '<table class="gt"><thead><tr><th class="rn"></th><th class="n">A</th><th>B</th><th class="s">C</th><th class="r">D</th></tr></thead><tbody><tr class="xlt"><td class="rn">1</td><td class="n">#</td><td class="w">단어</td><td class="s">유사도</td><td class="r">순위</td></tr>'
        : '<table class="gt"><thead><tr><th class="n">#</th><th>추측한 단어</th><th class="s">유사도</th><th class="r">순위</th></tr></thead><tbody>');
    if (S.sort === 'order') {   // 입력한 순서대로 1, 2, 3 … (새로 입력한 줄은 강조되고 화면이 따라감)
      list.forEach(function (o) { h += tr(o, (o.win ? 'win ' : '') + (last && o.w === last.w ? 'last' : '')); });
    } else {   // 유사도 높은 순 (마지막 추측은 맨 위에 따로)
      if (last && !last.win) h += tr(last, 'last') + '<tr class="gap"><td colspan="' + (S.xl ? 5 : 4) + '"></td></tr>';
      list.slice().sort(function (a, b) { return b.s - a.s; }).forEach(function (o) { if (!(last && !last.win && o.w === last.w)) h += tr(o, o.win ? 'win' : ''); });
    }
    return h + '</tbody></table>';
  }
  /** 입력창은 한 번만 만들고 그대로 둠 (다시 만들면 아이폰에서 키보드가 깜빡이거나 내려감). 나머지 영역만 갱신 */
  function ensurePlayFrame() {
    if ($('gf')) return;
    $('view').innerHTML = '<div id="pTop"></div><div class="stk" id="stk"><form class="gform" id="gf" autocomplete="off"><input id="gw" type="text" inputmode="text" enterkeyhint="send" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="20" lang="ko" aria-label="추측할 단어"><button type="submit" class="btn pri">' + (S.xl ? '입력' : '추측') + '</button></form><div class="fb" id="fb" aria-live="polite"></div></div><div class="tools" id="pTools"></div><div id="pList"></div>';
  }
  function renderPlay() {
    var L = S.L;
    if (!S.srv || !S.srv.ready) {
      $('view').innerHTML = '<div class="card empty">📭<br><b>오늘 문제가 아직 준비되지 않았어요</b><br><small>운영진에게 알려 주세요 (시트 ‘꼬맨틀사전’ 에 오늘 날짜가 없어요)</small></div>'; return;
    }
    ensurePlayFrame();
    $('pTop').innerHTML = (L.prac ? pracCard() : metaCard() + statusNote()) + (L.done ? resultCard() : '');
    var inp = $('gw'); inp.placeholder = L.done ? '더 추측해 볼까요? (연습)' : '단어를 입력하세요';
    var fb = S.fb; $('fb').className = 'fb t' + (fb ? fb.tr : 0);
    $('fb').innerHTML = fb ? (S.xl ? '' : TIER[fb.tr].e + ' ') + '‘' + esc(fb.w) + '’ ' + TIER[fb.tr].t + (fb.r ? ' (' + fb.r + '위)' : '') : '';
    $('pTools').innerHTML = hintBtn() + (L.done ? '' : '<button type="button" class="btn" id="giveBtn">' + xe(L.prac ? '👀 정답 보기' : '🏳️ 포기') + '</button>') + (L.prac && !L.done ? '<button type="button" class="btn" id="pracNext">' + xe('🔁 다른 문제') + '</button>' : '');
    $('pList').innerHTML = L.g.length ? '<div class="card" style="padding:8px 10px">' + rows() + '</div>'
      : (!L.done ? '<p class="hint">처음 입력해 볼 단어는 뭐든 괜찮아요. 예: <b>사람</b> · <b>음식</b> · <b>하늘</b> — 점수가 높은 쪽으로 따라가 보세요!</p>' : '');
    if (!S.focused && !L.done && !(navigator.maxTouchPoints > 0)) { S.focused = true; try { inp.focus({ preventScroll: true }); } catch (e) {} }   // 컴퓨터만 자동 포커스 (휴대폰은 키보드가 화면을 가리지 않게)
    var beh = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    if (S.scrollRes && L.done && !S.busy) {   // 정답 · 포기 직후에는 결과 카드로
      var rc = document.querySelector('.res');
      if (rc) { S.scrollRes = false; setTimeout(function () { rc.scrollIntoView({ block: 'start', behavior: beh }); }, 60); }
    } else if (S.scrollNew) {   // 새로 입력한 줄이 보이게
      S.scrollNew = false;
      var lr = $('lastRow');
      if (lr) setTimeout(function () { lr.scrollIntoView({ block: 'center', behavior: beh }); }, 60);
    }
  }

  /* ================= 연습 (1.7.0) — 이미 끝난 지난 문제로 기록 없이 연습: 힌트 무제한 · 길 안내 · 정답 보기 ================= */
  function freshPrac(r) { return { day: r.day, vh: r.vh, g: [], hints: 0, done: false, win: false, rec: false, nonce: '', startAt: 0, res: null, pend: false, prac: true }; }
  function hasPrac() { return S.ctx === 'pz' || !!S.hold.pz; }
  function syncCtx(v) { if (v === 'prac' && S.hold.pz) useCtx('pz'); else useCtx('td'); }
  /** 지금까지의 추측을 보고 다음에 해 볼 일을 한 줄로 안내 */
  function coach() {
    var L = S.L; if (L.done) return '';
    if (!L.g.length) return '첫 단어는 뭐든 괜찮아요. <b>사람 · 음식 · 하늘 · 집 · 동물</b> 처럼 넓은 말로 시작해 보세요.';
    var best = null;
    L.g.forEach(function (x) { var t = tier(x.w), s = simOf(x.w); if (!best || t > best.t || (t === best.t && s > best.s)) best = { w: x.w, t: t, s: s, r: rankIn(x.w) }; });
    var w = '‘' + esc(best.w) + '’', stuck = realCount() >= 3 && best.t <= 2 ? '<br>막히면 <b>💡 힌트</b>를 눌러 보세요. 연습에서는 마음껏 써도 돼요.' : '';
    if (best.t <= 1) return '아직 멀어요. 사람 · 장소 · 음식 · 동물 · 물건 · 행동… <b>분야를 바꿔서</b> 넓게 던져 보세요. 숫자가 높아지는 쪽이 정답 방향이에요.' + stuck;
    if (best.t === 2) return '조금 가까워지고 있어요. 지금까지 가장 높은 단어는 ' + w + ' (' + f2(best.s) + '). 이 단어와 <b>같은 분야의 다른 말</b>을 써 보세요.' + stuck;
    if (best.t === 3) return '좋아요! ' + w + ' 가 <b>1000위 안</b>(' + best.r + '위)이에요. 이 단어와 <b>같은 상황에 함께 나오는 말</b>(장소 · 도구 · 행동)을 떠올려 보세요.';
    if (best.t === 4) return '뜨거워요! ' + w + ' 가 <b>100위 안</b>(' + best.r + '위)이에요. 거의 다 왔어요 — 이 단어의 <b>비슷한 말 · 반대말 · 하위 개념</b>을 시도해 보세요.';
    return '코앞이에요! ' + w + ' 가 <b>10위 안</b>(' + best.r + '위)이에요. 조금만 비틀어 보세요.';
  }
  function pracCard() {
    var s = S.srv, c = coach();
    return '<div class="card"><div class="head"><div class="no">🌱 연습<small> · ' + s.no + '번째 문제 (지난 문제)</small></div><div class="meta">기록 · 점수 · 순위에 안 들어가요<br>힌트는 마음껏 써도 돼요</div></div>' +
      '<div class="scale"><div><b>' + f2(S.scale.r1) + '</b><small>1위 유사도</small></div><div><b>' + f2(S.scale.r10) + '</b><small>10위</small></div><div><b>' + f2(S.scale.rN) + '</b><small>1000위</small></div></div>' +
      (c ? '<div class="note ok coach">' + c + '</div>' : '') + '</div>';
  }
  function renderPrac() {
    if (hasPrac()) { if (S.ctx !== 'pz') useCtx('pz'); return renderPlay(); }
    $('view').innerHTML = '<div class="card gate"><div class="em">🌱</div><h2>연습해 볼까요?</h2>' +
      '<p>지난 문제 중 하나로 <b>기록 없이</b> 연습해요.<br>힌트는 <b>처음부터 마음껏</b> 쓸 수 있고, 막히면 정답도 볼 수 있어요.</p>' +
      '<ul class="how"><li>아무 단어나 입력하면 비밀 단어와 <b>뜻이 얼마나 가까운지</b> 숫자로 알려 줘요</li><li><b>숫자가 높은 쪽</b>으로 따라가세요. 1000위 안에 들면 순위도 보여요</li><li>도우미 글이 다음에 해 볼 일을 알려 줘요</li></ul>' +
      '<div class="btns"><button type="button" class="btn pri" id="pracStart">🌱 연습 시작</button></div></div>';
  }
  function startPrac() {
    if (S.busy || S.startP) return toast('기록 중이에요. 잠시 뒤에 다시 눌러 주세요', true);
    if (S.pBusy) return;
    S.pBusy = true; toast('연습 문제를 불러오는 중…');
    // (1.8.1) 서버가 사전에 실제로 있는 지난 날짜 중에서 k번째를 골라 줌 (예전에는 1~30일 전을 무작위로 물어 대부분 '없음'이라 실패했음)
    if (S.pK == null) S.pK = Math.floor(Math.random() * 1000);
    api('semPractice', [token(), S.pK++]).then(function (r) {
      if (!r || !r.ready) throw new Error('아직 연습할 지난 문제가 없어요. 내일부터 하루에 하나씩 늘어나요');
      var td = S.ctx === 'td' ? snap() : S.hold.td;   // 오늘 판 상태는 그대로 보관
      if (td.srv.vh && r.vh && td.srv.vh !== r.vh) throw new Error('단어 목록이 달라서 연습할 수 없어요');
      if (S.ctx === 'pz') load(td);
      prepareTable(r); S.srv = r; S.L = freshPrac(r); S.lastW = ''; S.fb = null; S.focused = false; S.scrollNew = false; S.scrollRes = false;
      S.hold.td = td; S.hold.pz = snap(); S.ctx = 'pz'; S.pBusy = false; S.view = 'prac';
      render(); updateTop();
      if (r.count === 1) toast('지금은 연습 문제가 1개예요. 하루에 하나씩 늘어나요');
    }).catch(function (e) { S.pBusy = false; toast(e.message || '연습 문제를 불러오지 못했어요', true); });
  }

  /* ---------- 순위 ---------- */
  /* ---------- 레이팅 등급 · 아직 안 푼 사람 · 프로필(이름을 누르면) ---------- */
  function tierOf(r) { return r >= 1700 ? { e: '👑', n: '마스터' } : r >= 1600 ? { e: '💎', n: '다이아' } : r >= 1500 ? { e: '🥇', n: '골드' } : r >= 1400 ? { e: '🥈', n: '실버' } : { e: '🥉', n: '브론즈' }; }
  function ratingLabel(st) { var r = st.rating || 1500, T = tierOf(r); return T.e + ' ' + r + ((st.rGames || 0) < 3 ? ' · 배치 중' : ''); }
  function pendingList(list) { return (list || []).filter(function (p) { return p.nick !== S.nick; }); }
  function pendingChips(list, max) {
    return list.slice(0, max).map(function (p) { return '<span class="pc" data-pnick="' + esc(p.nick) + '">' + esc(p.nick) + (p.streak > 1 ? ' 🔥' + p.streak : '') + '</span>'; }).join('') + (list.length > max ? '<span class="pc more">외 ' + (list.length - max) + '명</span>' : '');
  }
  function nudge() {   // 오늘 문제 머리 카드: 최근 7일 안에 한 사람 중 오늘 아직 안 한 사람
    return '';   // (1.6.4) '아직 안 푼 사람' 이름은 보여 주지 않음
  }
  function pendingCard(R) {
    return ''; var p = pendingList(R.pending);   // (1.6.4) 이름은 보여 주지 않음
    return p.length ? '<div class="card"><h3>⏳ 오늘 아직 안 푼 사람 <small>최근 7일 참여자</small></h3><div class="pcs">' + pendingChips(p, 15) + '</div><div class="hint">이름을 누르면 기록을 볼 수 있어요. 연속 기록이 끊기기 전에 콕 찔러 주세요 😄</div></div>' : '';
  }
  function cmpRow(label, a, b, lowerBetter) {
    var an = Number(a), bn = Number(b), good = isFinite(an) && isFinite(bn) && an !== bn ? (lowerBetter ? an < bn : an > bn) : null;
    return '<div class="cmp"><span class="a' + (good === true ? ' w' : '') + '">' + (a === '' || a == null ? '-' : a) + '</span><span class="l">' + label + '</span><span class="b' + (good === false ? ' w' : '') + '">' + (b === '' || b == null ? '-' : b) + '</span></div>';
  }
  function profile(nick) {
    var R = S.rank, pr = R && R.people && R.people[nick];
    if (!pr) return;
    var st = pr.st || { rating: 1500, rGames: 0, solves: 0, avg: 0, best: 0, streak: 0, bestStreak: 0, points: 0, badges: [] }, t = pr.today, isMe = nick === S.nick, mine = R.mine, T = tierOf(st.rating || 1500);
    var today = t ? (t.result === '정답' ? '오늘 맞혔어요 🎉 · ' + (t.h ? '힌트 ' + t.h + '개' : '힌트 없이') + ' · <b>+' + t.pts + '점</b>' : '오늘은 포기했어요 🏳️') : '오늘은 아직 안 풀었어요 ⏳';
    var h = '<div class="me-top">' + av(nick, 56) + '<div class="t"><b>' + esc(nick) + (isMe ? ' (나)' : '') + '</b><small>' + T.e + ' ' + T.n + ' · ' + (st.rating || 1500) + ((st.rGames || 0) < 3 ? ' (배치 중)' : '') + '</small></div></div>' +
      '<p style="margin:10px 0 4px">' + today + '</p>' +
      '<div class="stats"><div><b>' + (st.streak ? '🔥' + st.streak : 0) + '</b><small>연속</small></div><div><b>' + (st.bestStreak || 0) + '</b><small>최고 연속</small></div><div><b>' + (st.solves || 0) + '</b><small>정답</small></div><div><b>' + (st.points || 0) + '</b><small>누적 점수</small></div></div>';
    if (!isMe && mine) {
      h += '<h4 style="margin:12px 0 2px">⚔️ 나와 비교</h4><div class="cmps"><div class="cmp hd"><span class="a">나</span><span class="l"></span><span class="b">' + esc(nick) + '</span></div>' +
        cmpRow('레이팅', mine.rating || 1500, st.rating || 1500) + cmpRow('연속', mine.streak || 0, st.streak || 0) + cmpRow('최고 연속', mine.bestStreak || 0, st.bestStreak || 0) +
        cmpRow('정답 횟수', mine.solves || 0, st.solves || 0) + cmpRow('이번 주 점수', mine.week || 0, st.week || 0) + cmpRow('누적 점수', mine.points || 0, st.points || 0) + '</div>';
    }
    var bd = (st.badges || []).map(function (b) { return '<span class="chip">' + b.emoji + ' ' + esc(b.name) + '</span>'; }).join('');
    h += '<h4 style="margin:12px 0 4px">배지</h4>' + (bd ? '<div class="chips" style="margin-top:0">' + bd + '</div>' : '<p class="hint">아직 없어요</p>') +
      '<p class="hint">추측한 단어는 비밀이에요 🤫 (스포일러 방지)</p><div class="btns"><button type="button" class="btn pri" data-x>닫기</button></div>';
    openModal(h);
  }

  function loadRank() {
    if (S.rank && Date.now() - S.rank.at < 30000) return Promise.resolve();
    $('view').innerHTML = '<div class="empty">⏳ 순위를 불러오는 중…</div>';
    return api('semRank', [token()]).then(function (r) { S.rank = r; r.at = Date.now(); }, function (e) { S.rank = null; toast(e.message, true); });
  }
  function rkRows(list, kind) {
    if (!list || !list.length) return kind === 'rate' ? '<div class="empty">아직 레이팅 순위에 오른 사람이 없어요.<br>하루에 두 명 이상 풀고, 3일 이상 참여하면 올라와요! 📈</div>' : '<div class="empty">아직 기록이 없어요.<br>첫 번째 주인공이 되어 보세요! 🏁</div>';
    return list.map(function (o) {
      var me = S.nick && o.nick === S.nick, sub, v;
      if (kind === 'today') { sub = o.h ? '힌트 ' + o.h + '개' : '힌트 없이'; v = '+' + o.pts + '점'; }
      else if (kind === 'streak') { sub = '최고 ' + o.best + '일'; v = '🔥 ' + o.v + '일'; }
      else if (kind === 'rate') { var T = tierOf(o.v); sub = o.games + '일 참여 · 최근 ' + (o.delta > 0 ? '+' : '') + o.delta; v = T.e + ' ' + o.v + '<small>' + T.n + '</small>'; }
      else { sub = '정답 ' + o.solves + '회'; v = o.v + '점'; }
      return '<div class="rk tap' + (me ? ' me' : '') + '" data-nick="' + esc(o.nick) + '"><span class="n' + (o.rank <= 3 ? ' m' + o.rank : '') + '">' + (o.rank === 1 ? '🥇' : o.rank === 2 ? '🥈' : o.rank === 3 ? '🥉' : o.rank) + '</span>' + av(o.nick, 32) +
        '<span class="t"><b>' + esc(o.nick) + '</b><small>' + esc(sub) + '</small></span><span class="v">' + v + '</span></div>';
    }).join('');
  }
  function renderRank() {
    var R = S.rank;
    if (!R) { loadRank().then(function () { if (S.view === 'rank') { if (S.rank) renderRank(); else $('view').innerHTML = '<div class="card empty">순위를 불러오지 못했어요.<br><button type="button" class="btn sm" id="rkRetry">다시 시도</button></div>'; } }); return; }
    var me = R.mine, h = '';
    if (me) {
      var have = {}; (me.badges || []).forEach(function (b) { have[b.id] = 1; });
      h += '<div class="card"><div class="me-top">' + av(R.me, 48) + '<div class="t"><b>' + esc(R.me) + '</b><small>' + (me.streak ? '🔥 ' + me.streak + '일 연속 정답 중' : '오늘 맞히면 연속 기록 시작!') + '</small></div></div>' +
        '<div class="stats"><div><b>' + tierOf(me.rating || 1500).e + ' ' + (me.rating || 1500) + '</b><small>' + ((me.rGames || 0) < 3 ? '레이팅(배치 중)' : '레이팅') + '</small></div><div><b>' + me.week + '</b><small>이번 주</small></div><div><b>' + me.season + '</b><small>시즌</small></div><div><b>' + me.solves + '</b><small>정답</small></div></div>' +
        '<div class="hint" style="margin-top:6px">평균 추측 ' + (me.avg || '-') + '번 · 누적 ' + me.points + '점 · 최고 연속 ' + me.bestStreak + '일 · 최소 ' + (me.best || '-') + '번' + (me.firsts ? ' · 선두 ' + me.firsts + '번' : '') + '</div>' +
        '<div class="badges">' + BADGES.map(function (b) { return '<div class="badge' + (have[b.id] ? '' : ' off') + '" title="' + esc(b.d) + '"><div class="e">' + b.e + '</div><b>' + esc(b.n) + '</b><small>' + esc(b.d) + '</small></div>'; }).join('') + '</div></div>';
    } else h += '<div class="note warn">🔒 로그인하면 내 순위와 배지를 볼 수 있어요.<br><button type="button" class="btn sm" id="login">카카오 로그인</button></div>';
    var tabs = [['today', '오늘'], ['week', '이번 주'], ['season', '시즌'], ['streak', '연속'], ['rate', '레이팅']];
    var tab = S.rkTab, list = tab === 'today' ? R.today : tab === 'week' ? R.weekly : tab === 'season' ? R.seasonal : tab === 'rate' ? R.rated : R.streaks;
    var title = tab === 'today' ? '오늘의 정답자 <small>' + R.day + ' · 점수 순</small>' : tab === 'week' ? '이번 주 포인트 <small>' + R.week + '(월)~</small>' : tab === 'season' ? '시즌 포인트 <small>' + R.season + '</small>' : tab === 'rate' ? '레이팅 <small>' + R.season + ' · 3일 이상 참여</small>' : '연속 정답 <small>지금 이어가는 중</small>';
    h += '<div class="seg sm" id="rkTabs">' + tabs.map(function (t) { return '<button type="button" data-t="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div class="card"><h3>' + title + '</h3>' + rkRows(list, tab === 'week' || tab === 'season' ? 'pts' : tab) +
      (tab === 'today' ? '<div class="hint">오늘 ' + R.solvedToday + '명 정답 · 참여 회원 ' + (typeof R.total === 'number' ? R.total : typeof R.people === 'number' ? R.people : Object.keys(R.people || {}).length) + '명</div>' : '') +
      (tab === 'rate' ? '<div class="hint">그 날 푼 사람끼리 추측 횟수를 겨루는 점수 (처음 1500점). 오늘 결과는 잠정이라 사람이 더 풀면 조금 바뀌어요.</div>' : '') + '</div>' + pendingCard(R) +
      '<p class="hint">순위는 1분마다 갱신돼요. 시즌은 분기(1 · 4 · 7 · 10월)마다 새로 시작해요.</p>';
    $('view').innerHTML = h;
  }

  /* ---------- 내 기록 (지난 날 추측 · 정답) ---------- */
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  function dayLabel(d) { var p = String(d).split('-'); return p.length === 3 ? (+p[1]) + '/' + (+p[2]) + '(' + WD[new Date(+p[0], +p[1] - 1, +p[2]).getDay()] + ')' : d; }
  function renderHist() {
    if (!S.nick) { $('view').innerHTML = '<div class="note warn">🔒 로그인하면 지난 기록과 내가 입력한 단어를 다시 볼 수 있어요.<br><button type="button" class="btn sm" id="login">카카오 로그인</button></div>'; return; }
    if (!S.hist) {
      $('view').innerHTML = '<div class="empty">⏳ 내 기록을 불러오는 중…</div>';
      api('semHistory', [token()]).then(function (r) { S.hist = r; S.histAt = Date.now(); if (S.view === 'hist') renderHist(); },
        function (e) { if (S.view === 'hist') $('view').innerHTML = '<div class="card empty">기록을 불러오지 못했어요.<br><small>' + esc(e.message) + '</small><br><button type="button" class="btn sm" id="histRetry" style="margin-top:8px">다시 시도</button></div>'; });
      return;
    }
    var list = S.hist, wins = list.filter(function (o) { return o.result === '정답'; }), sumG = 0, sumP = 0;
    wins.forEach(function (o) { sumG += o.guesses; sumP += o.points; });
    var h = '<div class="card"><h3>📜 내 기록 <small>최근 ' + list.length + '판</small></h3><div class="stats"><div><b>' + list.length + '</b><small>도전</small></div><div><b>' + wins.length + '</b><small>정답</small></div><div><b>' + (wins.length ? Math.round(sumG / wins.length * 10) / 10 : '-') + '</b><small>평균 추측</small></div><div><b>' + sumP + '</b><small>점수</small></div></div></div>';
    if (!list.length) h += '<div class="card empty">아직 기록이 없어요.<br>오늘 문제를 풀면 여기에 쌓여요! 🌱</div>';
    list.forEach(function (o) {
      var ok = o.result === '정답', tag = o.state === '진행중' ? '<span class="chip on">진행 중</span>' : o.state === '만료' ? '<span class="chip">미완료</span>' : ok ? '<span class="chip on">정답</span>' : '<span class="chip">포기</span>';
      var words = String(o.g || '').split('|').filter(Boolean);
      h += '<details class="card hc"><summary><span class="d">' + esc(dayLabel(o.day)) + '</span>' + tag + '<span class="m">' + (o.state === '완료' ? o.guesses + '번' + (ok ? ' · +' + o.points + '점' : '') : '') + '</span></summary>' +
        (o.answer ? '<p class="hint" style="margin-top:8px">정답: <b>' + esc(o.answer) + '</b>' + (o.state === '완료' ? ' · ⏱ ' + mmss(o.sec) + (o.hints ? ' · 힌트 ' + o.hints : '') + (ok && o.order ? ' · 오늘 ' + o.order + '번째' : '') : '') + '</p>' : '') +
        (words.length ? '<div class="gchips">' + words.map(function (t, i) { var hint = t.charAt(0) === '*', w = hint ? t.slice(1) : t; return '<span class="gc' + (o.answer && w === o.answer ? ' ok' : '') + '">' + (i + 1) + '. ' + esc(w) + (hint ? ' 💡' : '') + '</span>'; }).join('') + '</div>' : '<p class="hint">저장된 추측이 없어요.</p>') + '</details>';
    });
    $('view').innerHTML = h + '<p class="hint">추측한 단어는 서버에 저장돼서 기기를 바꿔도 이어서 할 수 있어요.</p>';
  }

  function showTop(title, answer, top, sims, have) {
    var h = '<h2>' + esc(title) + '</h2><p>정답: <b>' + esc(answer) + '</b></p><div class="toplist">';
    top.forEach(function (ix, r) { var w = S.vocab[ix]; h += '<div class="' + (have && have[w] ? 'g' : '') + '"><span class="n">' + (r + 1) + '</span><span class="w">' + esc(w) + '</span><span class="s">' + f2(sims[ix]) + '</span></div>'; });
    openModal(h + '</div><div class="btns"><button type="button" class="btn pri" data-x>닫기</button></div>');
  }
  function topList() {
    var have = {}; guessWords().forEach(function (w) { have[w] = 1; });
    showTop('비밀 단어와 가까운 단어 ' + TOPN + '개', S.vocab[S.ans], S.top, S.sims, have);
  }
  /** 어제 정답과 가까운 단어 1000개 (어제 정답은 이미 공개) */
  function yesterdayList() {
    if (S.yd) return showTop('어제 정답과 가까운 단어 ' + TOPN + '개', S.yd.answer, S.yd.top, S.yd.sims, null);
    toast('불러오는 중…');
    api('semYesterday', [token()]).then(function (r) {
      if (!r || !r.ready) return toast('어제 문제가 없어요', true);
      if (S.srv.vh && r.vh && S.srv.vh !== r.vh) return toast('단어 목록이 달라서 볼 수 없어요', true);
      var sims = decodeTable(r.table, r.n), best = 0;
      for (var i = 1; i < sims.length; i++) if (sims[i] > sims[best]) best = i;
      var order = []; for (var j = 0; j < sims.length; j++) if (j !== best) order.push(j);
      order.sort(function (a, b) { return sims[b] - sims[a]; });
      S.yd = { answer: S.vocab[best] || r.answer, top: order.slice(0, TOPN), sims: sims };
      showTop('어제 정답과 가까운 단어 ' + TOPN + '개', S.yd.answer, S.yd.top, sims, null);
    }, function (e) { toast(e.message, true); });
  }

  /* ================= 이벤트 ================= */
  var lastAct = {};
  function guard(k, ms) { var n = Date.now(); if (lastAct[k] && n - lastAct[k] < (ms || 500)) return false; lastAct[k] = n; return true; }   // 더블 탭 · 연타로 두 번 처리되지 않게
  document.addEventListener('submit', function (e) { if (e.target.id === 'gf') { e.preventDefault(); var inp = $('gw'), v = inp.value; inp.value = ''; guess(v); } });
  document.addEventListener('click', function (e) {
    if (Date.now() - modalAt < 350) return;   // 창이 막 열리거나 닫힌 직후의 겹친 탭(더블탭의 두 번째)은 무시
    var rk = e.target.closest('.rk[data-nick]'); if (rk) { if (guard('rk', 450)) profile(rk.getAttribute('data-nick')); return; }
    var pc = e.target.closest('[data-pnick]'); if (pc) { if (guard('pc', 450)) profile(pc.getAttribute('data-pnick')); return; }
    var t = e.target.closest('button'); if (!t) return;
    var so = t.getAttribute('data-sort'); if (so) { S.sort = so === 'sim' ? 'sim' : 'order'; lsSet(LS.sort, S.sort); S.scrollNew = false; return renderPlay(); }
    if (t.id && !guard('b:' + t.id, 450)) return;
    switch (t.id) {
      case 'login': return startLogin();
      case 'goHome': location.href = ROOT; return;
      case 'ydBtn': return yesterdayList();
      case 'askOk': { var r = askRes; askRes = null; closeModal(); if (r) setTimeout(function () { r(true); }, 80); return; }   // 창이 닫힌 뒤에 다음 동작
      case 'logoutBtn': ask('로그아웃할까요?', '잠만보 앱도 함께 로그아웃돼요.', '로그아웃', true).then(function (ok) { if (ok) { lsSet(LS.auth, null); location.reload(); } }); return;
      case 'hintBtn': return hint();
      case 'giveBtn': return giveUp();
      case 'share': return share();
      case 'topbtn': return topList();
      case 'retry': return retryPending();
      case 'goRank': return go('rank');
      case 'pracStart': case 'pracNext': return startPrac();
      case 'pracBack': return go('play');
      case 'rkRetry': S.rank = null; return renderRank();
      case 'histRetry': S.hist = null; return renderHist();
    }
    if (t.parentNode && t.parentNode.id === 'rkTabs') { S.rkTab = t.getAttribute('data-t'); lsSet(LS.tab, S.rkTab); renderRank(); }
  });
  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) go(b.getAttribute('data-v')); });
  /* 화면 이동과 뒤로가기: 오늘 문제 → 순위 · 내 기록은 한 칸 쌓아서(뒤로가기 = 오늘 문제), 순위 ↔ 내 기록은 갈아끼움. 창(모달)은 한 칸 쌓여서 뒤로가기로 닫힘 */
  function go(v) {
    if (v === S.view) { window.scrollTo(0, 0); return; }
    var st = history.state || {};
    if (v === 'prac' && (S.busy || S.startP)) return toast('기록 중이에요. 잠시 뒤에 눌러 주세요', true);   // 오늘 판 기록이 끝나기 전엔 연습으로 못 감 (상태가 섞이지 않게)
    if (v === 'play' && st.p) { try { history.back(); return; } catch (e) {} }   // popstate 가 화면을 바꿈
    var push = S.view === 'play' && v !== 'play';
    S.view = v;
    if (v === 'rank' && S.rank && Date.now() - S.rank.at > 30000) S.rank = null;
    if (v === 'hist' && Date.now() - S.histAt > 30000) S.hist = null;
    try { history[push ? 'pushState' : 'replaceState']({ v: v, p: push || st.p ? 1 : 0 }, ''); } catch (e) {}
    syncCtx(v); render(); window.scrollTo(0, 0); updateTop();
  }
  window.addEventListener('popstate', function (e) {
    if (modalOpen) { closeModal(true); return; }
    var v = e.state && e.state.v;
    if (v && v !== S.view && S.nick) { S.view = v; syncCtx(v); render(); window.scrollTo(0, 0); updateTop(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modalOpen) closeModal(); });
  $('back').onclick = function () { if (modalOpen) return closeModal(); if (S.view !== 'play') return go('play'); location.href = ROOT; };
  $('helpBtn').onclick = function () { if (guard('help', 300)) help(); };
  $('xlBtn').onclick = function () {   // 엑셀 모드 켜고 끄기 (기기에 저장). 입력창 틀을 다시 만들어 버튼 글자 · 이모지를 맞춤
    if (!guard('xl', 300)) return;
    S.xl = !S.xl; lsSet(LS.xl, S.xl ? '1' : '0'); applyXl();
    S.focused = false; $('view').innerHTML = ''; render(); updateTop();
    toast(S.xl ? '엑셀 모드를 켰어요' : '엑셀 모드를 껐어요');
  };
  $('toast').addEventListener('click', function () { this.className = 'toast'; });   // 알림을 누르면 바로 닫힘
  window.addEventListener('online', retryPending);
  document.addEventListener('visibilitychange', function () { if (document.hidden) flushSave(); });
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', function () { var T = today_(); if (!document.hidden && T && T.srv && T.srv.ready && T.L && T.L.day && T.srv.day !== todayKST()) location.reload(); });   // 연습 중에도 오늘 판 기준으로 날짜 확인
  function todayKST() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
  /* 위쪽 고정 영역 높이 → 입력창이 그 바로 아래에 붙어 따라오게. 키보드가 올라와 화면이 낮으면 탭을 숨겨 공간 확보 */
  function updateTop() {
    var vv = window.visualViewport, h = vv ? vv.height : window.innerHeight, root = document.documentElement;
    root.classList.toggle('compact', h < 540);
    requestAnimationFrame(function () { var t = $('top'); if (t) root.style.setProperty('--top-h', t.offsetHeight + 'px'); });
  }
  window.addEventListener('resize', updateTop); window.addEventListener('orientationchange', updateTop);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', updateTop);

  /* ================= 시작 ================= */
  function boot() {
    if (/[?&]reset\b/.test(location.search)) history.replaceState(null, '', location.pathname);   // 잠만보 메뉴가 붙이는 ?reset (예전 서비스 워커 우회용)
    try { history.replaceState({ v: 'play', p: 0 }, ''); } catch (e) {}   // 뒤로가기 기준점
    applyXl(); renderAcct(); updateTop();
    if (!token()) { S.nick = ''; return renderGate(false); }   // 로그인한 회원만 시작할 수 있음
    $('tabs').hidden = false; updateTop();
    $('view').innerHTML = '<div class="empty">⏳ 오늘 문제를 불러오는 중…<br><small>처음엔 단어 목록(약 450KB)을 받느라 조금 걸려요</small></div>';
    Promise.all([loadVocab(), api('semToday', [token()])]).then(function (res) {
      // 기기에 저장해 둔 목록이 서버의 것과 다르면(목록이 새로 바뀜) 한 번 새로 받아 씀
      if (res[0].fromCache && res[1] && res[1].vh && res[0].hash !== res[1].vh) return loadVocab(true).then(function (v) { return [v, res[1]]; });
      return res;
    }).then(function (res) {
      var vocab = res[0], srv = res[1];
      S.srv = srv; S.nick = srv.me || '';
      if (srv.loginRequired || !S.nick) { renderGate(!!session()); return; }   // 토큰이 만료됐거나 닉네임이 연결되지 않음
      if (!srv.ready) { render(); return; }
      if (vocab.hash && srv.vh && vocab.hash !== srv.vh) throw new Error('단어 목록이 새로 바뀌었어요. 주소 끝에 ?x=' + Date.now() % 1000 + ' 를 붙여 새로고침 해 주세요');
      prepare(vocab, srv);
      var L = lsJSON(LS.play);
      if (!L || L.day !== srv.day || L.vh !== srv.vh) L = freshLocal();
      S.L = L;
      var my = srv.my;
      mergeServer(L, my);
      if (!L.done && L.g.length === 0) L.rec = !!(S.nick && my && my.state !== '완료');
      else if (S.nick && my && my.state === '완료' && L.rec && !L.res) { L.rec = false; }   // 다른 기기에서 이미 기록함
      if (L.rec && my && my.state === '진행중' && !L.nonce) ensureStart();   // 다른 기기/새로고침: 이어 하기 (서버가 확인값을 다시 줌)
      saveLocal();
      if (S.view === 'play' && lsGet(LS.help) !== '1') setTimeout(help, 400);
      render();
      if (L.pend) retryPending();
    }).catch(function (e) {
      if (!token()) return renderGate(false);   // 로그인이 만료돼 지워졌으면 로그인 안내
      $('view').innerHTML = '<div class="card empty">😢<br><b>' + esc(e.message || '불러오지 못했어요') + '</b><br><button type="button" class="btn sm" id="again" style="margin-top:10px">다시 시도</button></div>';
      var b = $('again'); if (b) b.onclick = boot;
    });
  }
  /* 접속 기록: 기기마다 30분에 한 번 잠만보 서버(logVisit)에 남김 → 시트 '접속기록' (페이지 = 꼬맨틀). 실패해도 게임과 상관없음 */
  function logVisit() {
    try {
      if (!API) return;
      var key = 'sem_visit_at' + ENV_SFX;
      if (Date.now() - (+lsGet(key) || 0) < 30 * 60e3) return;
      lsSet(key, String(Date.now()));
      var cid = lsGet('jmb_vid');   // 잠만보 화면과 같은 기기 구분 값 (개인 정보 아님)
      if (!cid) { cid = Date.now().toString(36) + Math.random().toString(36).slice(2, 10); lsSet('jmb_vid', cid); }
      var info = { page: '꼬맨틀', cid: cid, ua: navigator.userAgent, w: screen.width, h: screen.height, touch: navigator.maxTouchPoints || 0,
        app: (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone ? 1 : 0 };
      var send = function () { fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: 'logVisit', args: [info, token()], env: ENV !== 'prod' ? 'beta' : undefined }) }).catch(function () {}); };
      var uad = navigator.userAgentData;
      if (uad && uad.getHighEntropyValues) { info.mobile = !!uad.mobile; uad.getHighEntropyValues(['model']).then(function (h) { info.model = h.model || ''; send(); }, send); }
      else send();
    } catch (e) {}
  }
  setTimeout(logVisit, 3000);   // 화면이 뜬 뒤에
  boot();
})();
