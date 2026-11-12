/* 잠만보 꼬들 1.9.0 — 원작 꼬들 규칙: 정답은 자모 6칸짜리 단어, 6번 안에 자모 키보드로 입력.
 * 한 칸 = 자모 하나: ㄲ ㄸ ㅃ ㅆ ㅉ · ㅐ ㅒ ㅔ ㅖ 는 한 칸(키도 하나), ㅘ ㅝ ㅢ 같은 겹모음과 겹받침(ㄳ …)은 기본 자모 둘(ㅗ+ㅏ). 화면은 꼬맨틀과 같은 머리줄 · 탭 · 카드.
 * 이 파일은 모듈: window.JMB_KODLE.mount(요소, 옵션) — 꼬들 자체 페이지(kodle/)와 꼬맨틀 페이지의 '🟩 꼬들' 탭에서 같이 씀.
 * 오늘 문제는 카카오 로그인한 회원이면 서버(Kodle.js)에 기록돼 점수가 꼬맨틀 주간 · 시즌 · 누적 점수에 더해짐 (정답은 서버가 확인). 연습 판 · 로그인 안 한 판은 이 기기에만 저장. */
(function () {
  'use strict';
  var VER = '1.13.0', TRIES = 6, LEN = 6, START = Date.UTC(2026, 10, 12), LOGMAX = 400;
  var CFG = window.JMB_CONFIG || {}, ENV = CFG.env || 'prod', SFX = ENV !== 'prod' ? '_' + ENV : '';
  var KEY = 'jmb_kodle_v1' + SFX, KLOG = 'jmb_kodle_log' + SFX, KST = 'jmb_kodle_st' + SFX, KHELP = 'jmb_kodle_help', KAUTH = 'jmb_kakao_v2' + SFX;
  var CH = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  var JU = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅗㅏ', 'ㅗㅐ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅔ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ'];
  var JO = ['', 'ㄱ', 'ㄲ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  var ROWS = ['ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅ', 'ㅆㅇㅈㅉㅊㅋㅌㅍㅎ', 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅛ', 'ㅜㅠㅡㅣ'];   // 자음(쌍자음 포함) 2줄 · 모음 2줄 — 키가 전부 보임. 쌍자음 · ㅐ ㅒ ㅔ ㅖ 키는 기본 자모 둘로 풀려서 들어감
  var SHIFTED = { 'ㅂ': 'ㅃ', 'ㅈ': 'ㅉ', 'ㄷ': 'ㄸ', 'ㄱ': 'ㄲ', 'ㅅ': 'ㅆ', 'ㅐ': 'ㅒ', 'ㅔ': 'ㅖ' }, shift = false;
  var PHYS = { KeyQ: 'ㅂ', KeyW: 'ㅈ', KeyE: 'ㄷ', KeyR: 'ㄱ', KeyT: 'ㅅ', KeyY: 'ㅛ', KeyU: 'ㅕ', KeyI: 'ㅑ', KeyA: 'ㅁ', KeyS: 'ㄴ', KeyD: 'ㅇ', KeyF: 'ㄹ', KeyG: 'ㅎ', KeyH: 'ㅗ', KeyJ: 'ㅓ', KeyK: 'ㅏ', KeyL: 'ㅣ', KeyZ: 'ㅋ', KeyX: 'ㅌ', KeyC: 'ㅊ', KeyV: 'ㅍ', KeyB: 'ㅠ', KeyN: 'ㅜ', KeyM: 'ㅡ', KeyO: 'ㅐ', KeyP: 'ㅔ' };
  var BASE = (document.currentScript && document.currentScript.src ? document.currentScript.src : location.href).replace(/[?#].*$/, '').replace(/[^\/]*$/, '');
  var host = null, opt = {}, loading = false, kbound = false;
  var $ = function (id) { return host ? host.querySelector('#' + id) : null; };   // 꼬들 칸 안의 요소만 (머리줄 · 탭은 쓰는 페이지 몫)
  var API = CFG.api || '', ROOT = (function () { var seg = location.pathname.split('/')[1] || ''; return /\.github\.io$/.test(location.hostname) && seg ? '/' + seg + '/' : '/'; })();
  var A = [], G = {}, ready = false, view = 'play', modalOpen = false;
  var SV = { today: null, ok: false, nonce: '', starting: null, sending: false, res: null, err: '' };   // 서버 상태: today = kodleToday 응답 · ok = 정답 목록이 서버와 같음 · res = 방금 낸 결과(서버 확정값)
  var GM = { play: null, prac: null };   // 오늘 판 · 연습 판 (탭을 오가도 유지)
  var CUR = { play: '', prac: '' };       // 입력 중인 자모

  /* ── 도우미 ── */
  function jamo(w) {
    var o = '';
    for (var i = 0; i < w.length; i++) {
      var x = w.charCodeAt(i) - 0xAC00; if (x < 0 || x >= 11172) return null;
      o += CH[Math.floor(x / 588)] + JU[Math.floor((x % 588) / 28)] + JO[x % 28];
    }
    return o;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function kst() { return new Date(Date.now() + 9 * 3600e3); }
  function dayOf(off) { return new Date(Date.now() + 9 * 3600e3 + (off || 0) * 864e5).toISOString().slice(0, 10); }
  function dayNo() { var d = kst(); return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - START) / 864e5); }
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function stats() { return load(KST) || { played: 0, wins: 0, streak: 0, best: 0, dist: [0, 0, 0, 0, 0, 0], last: '' }; }
  function session() { var s = load(KAUTH); return s && s.token ? s : null; }
  function token() { var s = session(); return s ? s.token : ''; }
  function nick() { var a = load(KAUTH); return a && a.user && a.user.nickname ? String(a.user.nickname) : ''; }
  function api(fn, args) {
    if (!API) return Promise.reject(new Error('설정 파일(config.js)을 읽지 못했어요'));
    var ctl = typeof AbortController === 'function' ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, 25000) : 0;
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, cache: 'no-store', signal: ctl ? ctl.signal : undefined, body: JSON.stringify({ fn: fn, args: args || [], env: ENV !== 'prod' ? 'beta' : undefined }) })
      .then(function (r) { if (!r.ok) throw new Error('서버 응답 오류 (' + r.status + ')'); return r.json(); })
      .then(function (j) { clearTimeout(timer); if (!j || !j.ok) { var er = new Error((j && j.e) || '알 수 없는 오류'); er.server = true; throw er; } return j.r; }, function (e) { clearTimeout(timer); throw e; });
  }
  function startLogin() {
    if (!CFG.kakaoRestKey) return toast('카카오 로그인 설정을 찾지 못했어요', true);
    var st; try { st = [].slice.call(crypto.getRandomValues(new Uint32Array(4))).join(''); } catch (e) { st = String(Math.random()).slice(2) + Date.now(); }
    try { localStorage.setItem('jmb_kakao_state' + SFX, JSON.stringify({ s: st, t: Date.now() })); sessionStorage.setItem('jmb_after_login', location.pathname); } catch (e) {}
    location.href = 'https://kauth.kakao.com/oauth/authorize?client_id=' + encodeURIComponent(CFG.kakaoRestKey) + '&redirect_uri=' + encodeURIComponent(location.origin + ROOT) + '&response_type=code&state=' + encodeURIComponent(st);
  }
  function listKey() { return A.length + ':' + A.slice(0, 3).join(''); }
  var toastT = 0;
  function toast(t, bad) {
    if (opt.toast) return opt.toast(t, bad);
    var e = document.getElementById('toast'); if (!e) { e = document.createElement('div'); e.id = 'toast'; e.className = 'toast'; document.body.appendChild(e); }
    e.textContent = t; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('on'); }, bad ? 2600 : 1800); }

  /** 초록 = 자리까지 맞음 · 노랑 = 다른 자리에 있음 · 회색 = 없음 (같은 자모가 둘일 때는 정답에 있는 개수만큼만) */
  function score(guess, ans) {
    var g = guess.split(''), a = ans.split(''), r = g.map(function () { return 'n'; }), left = {};
    g.forEach(function (c, i) { if (c === a[i]) r[i] = 'g'; else left[a[i]] = (left[a[i]] || 0) + 1; });
    g.forEach(function (c, i) { if (r[i] !== 'g' && left[c] > 0) { r[i] = 'y'; left[c]--; } });
    return r;
  }
  function grid(m) { return m.guesses.map(function (w) { return score(w, m.ans).map(function (x) { return x === 'g' ? '🟩' : x === 'y' ? '🟨' : '⬛'; }).join(''); }).join('\n'); }
  /** 공유 글: 추측 횟수 · 칸 색 · 점수는 넣지 않음 (단톡방에서 횟수가 드러나 부끄럽지 않게) — 끝냈다는 것만. 실패해도 똑같이 '도전 완료' */
  function shareText(m) { return '🟩 꼬들 ' + (m.prac ? '연습' : '#' + (m.no + 1)) + (m.win && !m.prac ? ' 🎉 정답!' : ' 도전 완료'); }

  /* ── 판 만들기 · 기록 ── */
  function newGame(prac) {
    var w;
    if (prac) { var last = GM.prac && GM.prac.aw; do { w = A[Math.floor(Math.random() * A.length)]; } while (A.length > 1 && w === last); }
    else w = A[((dayNo() % A.length) + A.length) % A.length];
    var m = { ans: jamo(w), aw: w, prac: !!prac, guesses: [], done: false, win: false, no: prac ? 0 : dayNo(), day: prac ? '' : dayOf(), t0: 0 };
    if (!prac) { var sv = load(KEY); if (sv && sv.day === m.day) { m.guesses = (sv.guesses || []).filter(function (x) { return typeof x === 'string' && x.length === LEN; }); m.done = !!sv.done; m.win = !!sv.win; m.t0 = sv.t0 || 0; } }
    return m;
  }
  function persist(m) { if (!m.prac) save(KEY, { day: m.day, guesses: m.guesses, done: m.done, win: m.win, t0: m.t0 }); }
  /** 한 판이 끝날 때마다 기록(로그)을 남김: 날짜 · 오늘/연습 · 결과 · 횟수 · 걸린 시간 · 정답 · 추측 목록 */
  function logPlay(m) {
    var L = load(KLOG) || [];
    L.unshift({ day: dayOf(), no: m.no, prac: m.prac ? 1 : 0, win: m.win ? 1 : 0, n: m.guesses.length, sec: m.t0 ? Math.round((Date.now() - m.t0) / 1000) : 0, aw: m.aw, g: m.guesses, at: Date.now(), who: nick() });
    save(KLOG, L.slice(0, LOGMAX));
  }
  function finish(m, win) {
    m.done = true; m.win = win; logPlay(m);
    if (m.prac) return;
    persist(m); srvSubmit(m);
    var st = stats(); st.played++;
    if (win) { st.wins++; st.dist[m.guesses.length - 1]++; st.streak = st.last === dayOf(-1) ? st.streak + 1 : 1; st.best = Math.max(st.best, st.streak); st.last = m.day; } else st.streak = 0;
    save(KST, st);
  }

  /* ── 서버 연동 (로그인한 회원 · 오늘 문제만) ── */
  function srvOn() { return !!token() && SV.ok !== false; }
  function srvToday() {
    if (!token()) return Promise.resolve();
    return api('kodleToday', [token()]).then(function (r) {
      if (r.loginRequired) { SV.today = null; return; }
      SV.today = r; SV.ok = r.ak === listKey(); SV.err = SV.ok ? '' : 'list';
      if (SV.ok && ready) reconcile(r);
    }).catch(function (e) { SV.err = e.message; });
  }
  /** 서버에 있는 오늘 판과 이 기기의 판을 맞춤: 다른 기기에서 끝냈거나 더 진행했으면 그쪽을 따름, 이 기기에서 끝났는데 서버에 없으면 보냄 */
  function reconcile(r) {
    var m = GM.play, my = r.my || {}, g = my.g ? my.g.split('|').filter(Boolean) : [];
    if (my.state === '완료') {
      if (!m.done || m.guesses.length !== g.length) { m.guesses = g; m.done = true; m.win = my.result === '정답'; persist(m); }
      SV.res = { win: m.win, guesses: my.guesses, points: my.points, streak: my.streak, parts: my.parts, final: true };
    } else if (m.done && my.state === '진행중' && !SV.sending && !SV.res) srvSubmit(m);   // 이 기기에서 끝났는데 서버에는 진행 중으로 남아 있으면 다시 보냄
    else if (m.done && my.state === 'ready' && !SV.res) SV.res = { failed: true, msg: '로그인하기 전에 푼 판이라 점수에는 안 들어가요' };
    else if (my.state === '진행중' && !m.done && g.length > m.guesses.length) { m.guesses = g; persist(m); }
    render();
  }
  function ensureStarted() {
    if (SV.nonce) return Promise.resolve(SV.nonce);
    if (!SV.starting) SV.starting = api('kodleStart', [token()]).then(function (r) { SV.nonce = r.nonce; return r.nonce; }, function (e) { SV.starting = null; throw e; });
    return SV.starting;
  }
  function srvSave(m) { if (m.prac || !srvOn()) return; ensureStarted().then(function (n) { return api('kodleSave', [token(), n, m.guesses.join('|')]); }).catch(function () {}); }
  function srvSubmit(m) {
    if (m.prac || !srvOn()) return;
    SV.sending = true; render();
    ensureStarted().then(function (n) { return api('kodleSubmit', [token(), n, { win: m.win, g: m.guesses }]); }).then(function (r) {
      SV.sending = false; SV.res = { win: r.win, guesses: r.guesses, points: r.points, streak: r.streak, parts: r.parts, final: true }; SV.err = '';
      srvToday().then(function () { render(); }); render();
    }, function (e) { SV.sending = false; SV.res = { failed: true, msg: e.message }; render(); });
  }

  /* ── 화면 ── */
  function keyStates(m) {
    var st = {}, rank = { n: 1, y: 2, g: 3 };
    m.guesses.forEach(function (w) { var s = score(w, m.ans); w.split('').forEach(function (c, i) { if (!st[c] || rank[s[i]] > rank[st[c]]) st[c] = s[i]; }); });
    return st;
  }
  /** 겹글자 키(ㄲ · ㅐ …)는 풀린 자모가 모두 같은 상태일 때만 색을 보여 줌 */
  function keySt(c, st) { return st[c]; }
  var KX = false;   // 엑셀 모드(꼬맨틀 화면 안에서 html.xl 일 때): 칸을 스프레드시트처럼 — 게임 방식은 그대로
  var COLS = 'ABCDEF';
  function boardHTML(m, cur, pop) {
    if (KX) return boardX(m, cur, pop);
    var h = '<div id="board" aria-live="polite">';
    for (var r = 0; r < TRIES; r++) {
      var w = m.guesses[r], typing = !w && r === m.guesses.length && !m.done, sc = w ? score(w, m.ans) : null;
      h += '<div class="krow" id="r' + r + '">';
      for (var c = 0; c < LEN; c++) { var ch = w ? w.charAt(c) : typing ? cur.charAt(c) : ''; h += '<div class="c' + (sc ? ' ' + sc[c] : ch ? ' f' : '') + (pop && w && r === m.guesses.length - 1 ? ' pop' : '') + '">' + ch + '</div>'; }
      h += '</div>';
    }
    return h + '</div>';
  }
  /** 시트 모양 보드: 열 머리글 A~F · 행 번호 1~6 · 격자선 · 입력할 칸에 초록 테두리(활성 셀) · 맞춘 결과는 조건부 서식처럼 칸 채우기 */
  function activeCell(m, cur) { return m.done ? null : { r: m.guesses.length, c: Math.min(cur.length, LEN - 1) }; }
  function boardX(m, cur, pop) {
    var act = activeCell(m, cur);
    var h = '<table id="board" class="kgrid" aria-live="polite"><thead><tr><th class="corner"></th>' + COLS.split('').map(function (L, i) { return '<th class="ch' + (act && act.c === i ? ' hl' : '') + '">' + L + '</th>'; }).join('') + '</tr></thead><tbody>';
    for (var r = 0; r < TRIES; r++) {
      var w = m.guesses[r], typing = !w && r === m.guesses.length && !m.done, sc = w ? score(w, m.ans) : null;
      h += '<tr class="krow" id="r' + r + '"><th class="rh' + (act && act.r === r ? ' hl' : '') + '">' + (r + 1) + '</th>';
      for (var c = 0; c < LEN; c++) { var ch = w ? w.charAt(c) : typing ? cur.charAt(c) : ''; h += '<td class="c' + (sc ? ' ' + sc[c] : ch ? ' f' : '') + (act && act.r === r && act.c === c ? ' sel' : '') + (pop && w && r === m.guesses.length - 1 ? ' pop' : '') + '">' + ch + '</td>'; }
      h += '</tr>';
    }
    return h + '</tbody></table>';
  }
  /** 엑셀 모드: 이름 상자(셀 주소)와 수식 입력줄에 지금 입력 중인 칸 · 글자를 보여 줌 (꼬맨틀 화면이 opt.onCell 로 받음) */
  function cellInfo(m) { if (!KX || !opt.onCell) return; var a = activeCell(m, CUR[view]); opt.onCell(a ? COLS.charAt(a.c) + (a.r + 1) : 'A1', m.done ? m.aw : CUR[view]); }
  function keysHTML(m) {
    var st = keyStates(m), CONS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
    function btn(c) { return '<button type="button" class="' + (CONS.indexOf(c) >= 0 ? 'cn ' : 'vw ') + (keySt(c, st) || '') + '" data-k="' + c + '">' + c + '</button>'; }
    return '<div class="keys">' + ROWS.map(function (row, i) {
      return '<div class="kr">' + (i === 3 ? '<button type="button" class="w pri" data-k="Enter">입력</button>' : '') + row.split('').map(btn).join('') + (i === 3 ? '<button type="button" class="w" data-k="Back" aria-label="지우기">⌫</button>' : '') + '</div>';
    }).join('') + '</div>';
  }
  /** 오늘 판 점수 칸: 서버가 확정한 값 · 확정 전에는 잠정(기본 점수만) · 로그인 안 했으면 안내 */
  function scoreHTML(m) {
    if (!token()) return '<p class="hint">로그인하면 이 결과가 꼬맨틀 순위 점수에 합산돼요. <a href="#" id="resLogin">카카오 로그인</a></p>';
    if (SV.err === 'list') return '<p class="hint">⚠️ 점수 연동 점검 중이라 이번 판은 이 기기에만 기록돼요.</p>';
    var r = SV.res;
    if (r && r.failed) return '<p class="hint">⚠️ 점수 저장에 실패했어요 (' + esc(r.msg) + '). 이 기기에는 기록돼 있어요.</p>';
    if (r && r.final) {
      if (!r.win) return '<p class="hint">0점 — 내일 다시 도전! (기록은 서버에 저장됐어요)</p>';
      var p = r.parts || {};
      return '<div class="pts">+' + r.points + '점</div><div class="parts"><span class="chip">기본 <b>' + (p.base != null ? p.base : r.points) + '</b></span>' + (p.streak ? '<span class="chip">🔥 ' + r.streak + '일 연속 <b>+' + p.streak + '</b></span>' : '') + '</div><p class="hint">꼬맨틀 주간 · 시즌 점수에 합산돼요</p>';
    }
    var base = m.win ? Math.max(40, 100 - 10 * (m.guesses.length - 1)) : 0;
    return m.win ? '<div class="pts">+' + base + '점 <small>(잠정)</small></div><div class="parts"><span class="chip">기록 확인 중…</span></div>' : '<p class="hint">기록 확인 중…</p>';
  }
  function bannerHTML() {
    if (!token()) return '<div class="note">🔑 로그인하면 꼬들 점수가 <b>꼬맨틀 순위</b>에 합산돼요. <button type="button" class="btn sm pri" id="bnLogin">카카오 로그인</button></div>';
    if (SV.err === 'list') return '<div class="note warn">⚠️ 점수 연동을 점검 중이에요. 풀 수는 있지만 이번 판은 기록되지 않아요.</div>';
    if (SV.today && SV.today.semDone === false && !GM.play.done) return '<div class="note">🔤 코스: <b>오늘 꼬맨틀 → 꼬들</b>. 꼬들 점수도 꼬맨틀 점수에 더해져요. <a class="btn sm" href="../semantle/">꼬맨틀 하러 가기</a></div>';
    return '';
  }
  /** 오늘 코스(꼬맨틀 → 꼬들) 안내 + 오늘 마친 사람 수 (누가 · 몇 번 만에는 비공개) */
  function courseHTML(m) {
    var t = SV.today, out = [];
    if (t && t.semDone === false) out.push('🔤 오늘 꼬맨틀은 아직이에요 ' + (opt.embedded ? '<button type="button" class="btn sm pri" data-go="play">꼬맨틀 하러 가기</button>' : '<a class="btn sm pri" href="../semantle/">꼬맨틀 하러 가기</a>'));
    else if (t && t.semDone) out.push('🏆 오늘의 챌린지 완료!' + (t.ch && t.ch.st ? ' 🔥 연속 챌린지 ' + t.ch.st + '일' : '') + (opt.embedded ? ' <button type="button" class="btn sm" data-go="chal">챌린지 보기</button>' : ''));
    if (t && t.kd) out.push('오늘 ' + t.kd + '명이 꼬들을 마쳤어요 · 점수는 🏆 순위에서 (횟수 · 결과는 나만 봐요)');
    return out.length ? '<p class="hint course">' + out.join('<br>') + '</p>' : '';
  }
  function resultHTML(m) {
    if (!m.done) return '';
    var emb = !!opt.embedded;
    var more = m.prac ? '<button type="button" class="btn" id="pracNext">🔁 다른 문제</button>'
      : emb ? '<button type="button" class="btn" data-go="rank">🏆 순위</button><button type="button" class="btn" data-go="prac" data-ks="kodle">🌱 연습</button>'
      : '<button type="button" class="btn" id="goPrac">🌱 연습</button><a class="btn" href="../semantle/">🔤 꼬맨틀</a>';
    return '<div class="kres"><div class="khead"><span class="em">' + (m.win ? '🎉' : '😵') + '</span><b>' + (m.win ? '정답이에요!' : '아쉬워요') + '</b></div>' +
      '<p class="ans">' + (m.win ? '<b>' + esc(m.aw) + '</b> — ' + m.guesses.length + '번 만에 맞혔어요' : '정답은 <b>' + esc(m.aw) + '</b> 였어요') + ' <small>(' + m.ans.split('').join(' ') + ')</small>' + (m.prac ? ' <small>· 연습(기록 없음)</small>' : '') + '</p>' +
      (m.prac ? '' : scoreHTML(m) + courseHTML(m)) + '<div class="btns"><button type="button" class="btn pri" id="share">결과 복사</button>' + more + '</div>' +
      (m.prac ? '' : '<p class="hint" style="text-align:center;margin:4px 0 0">다음 문제는 내일 00:00에 열려요</p>') + '</div>';
  }
  /** (1.12.0) 순서 잠금: 서버가 locked 라고 하면(2026-11-13~, 오늘 꼬맨틀을 아직 안 끝냄) 게임 대신 안내 */
  function lockHTML() {
    return '<div class="card next"><h3>🔒 꼬들은 꼬맨틀을 마친 뒤에 열려요</h3><p>오늘 코스는 <b>꼬맨틀 → 꼬들</b> 순서예요. 꼬맨틀을 끝내면(맞히든 포기하든) 꼬들이 열려요. 연습은 언제든 할 수 있어요.</p><div class="btns">' +
      (opt.embedded ? '<button type="button" class="btn pri" data-go="play">🔤 꼬맨틀 하러 가기</button><button type="button" class="btn" data-go="prac" data-ks="kodle">🌱 꼬들 연습</button>' : '<a class="btn pri" href="../semantle/">🔤 꼬맨틀 하러 가기</a>') + '</div></div>';
  }
  function gameHTML(which) {
    var m = GM[which];
    if (which === 'play' && SV.today && SV.today.locked) return lockHTML();
    return (which === 'play' ? bannerHTML() : '') + '<div class="card kd' + (opt.embedded ? ' kemb' : '') + (KX ? ' kx' : '') + '"><div class="kh"><b>' + (which === 'play' ? '오늘의 꼬들 <span class="tag">#' + (m.no + 1) + '</span>' : '연습 문제 <span class="tag">기록 없음</span>') + '</b><small>' + m.guesses.length + '/' + TRIES + '</small></div>' +
      boardHTML(m, CUR[which], false) + '<div class="kmsg" id="msg"></div>' + (m.done ? resultHTML(m) : keysHTML(m)) + '</div>';
  }
  /** 한 화면에 다 들어오게: 칸 · 키 크기를 화면 남은 높이 · 너비에 맞춰 정함 (스크롤 없이 보드 + 키보드 / 결과) */
  function fit() {
    var c = host && host.querySelector('.kd'); if (!c || !c.isConnected) return;
    var wide = (c.parentNode.clientWidth || window.innerWidth) >= 760; c.classList.toggle('kwide', wide);   // 넓은 화면(PC): 칸은 왼쪽 · 키보드(결과)는 오른쪽에 나란히
    var t0 = 40, k0 = 36; c.style.setProperty('--kt', t0 + 'px'); c.style.setProperty('--kk', k0 + 'px');
    var keys = c.querySelector('.keys'), rowsH = 6 * t0, kbH = keys && !wide ? keys.offsetHeight : 0, total = c.offsetHeight;
    var other = total - rowsH - kbH;                                  // 칸 · 키보드를 뺀 나머지 높이 (머리 · 안내 · 여백 · 결과)
    var top = c.getBoundingClientRect().top + (window.pageYOffset || 0);
    var xl = document.documentElement.classList.contains('xl'), reserve = xl ? 74 : 20;   // 엑셀 모드는 아래 시트 탭 · 상태줄 자리
    var avail = (window.innerHeight || 700) - top - reserve - 10;
    var width = Math.min(c.clientWidth || 360, 520) - 28;
    var unit = keys && !wide ? 6 + 4 * 0.85 : 6;                       // 좁은 화면에서 키보드가 아래에 있으면 칸 6줄 + 키 4줄(칸의 0.9배)
    var t = Math.floor(Math.min((avail - other - (keys && !wide ? 24 : 0)) / unit, wide ? 64 : (width - (KX ? 38 : 25)) / 6, 64)); t = Math.max(t, 20);
    var kk = wide ? Math.max(40, Math.min(54, Math.round(t * 0.95))) : Math.max(26, Math.min(46, Math.round(t * 0.85)));
    c.style.setProperty('--kt', t + 'px'); c.style.setProperty('--kk', kk + 'px');
  }
  /** 지난 판 목록: 서버(오늘 문제 기록) + 이 기기 로그(연습 포함)를 합쳐 최근순 */
  function rowsAll() {
    var L = (load(KLOG) || []).map(function (x) { return { day: x.day, no: x.no, prac: x.prac, win: x.win, n: x.n, sec: x.sec, aw: x.aw, g: x.g, pts: null, at: x.at }; });
    var H = SV.today && SV.today.history ? SV.today.history : null;
    if (!H) return L;
    var have = {}; H.forEach(function (x) { have[x.day] = 1; });
    var out = H.map(function (x) { return { day: x.day, no: x.no, prac: 0, win: x.win, n: x.n, sec: x.sec, aw: x.aw, g: x.g, pts: x.points, at: 0 }; });
    L.forEach(function (x) { if (x.prac || !have[x.day]) out.push(x); });
    return out.sort(function (a, b) { return a.day < b.day ? 1 : a.day > b.day ? -1 : (b.at || 0) - (a.at || 0); });
  }
  function histHTML() {
    var sv = SV.today && SV.today.stats, st = sv ? { played: sv.plays, wins: sv.wins, streak: sv.streak, best: sv.best, dist: sv.dist } : stats(), mx = Math.max.apply(null, st.dist.concat(1)), RA = rowsAll(), h = '';
    if (sv) h += '<div class="card"><h3>🏆 꼬들 점수 <small>꼬맨틀 순위에 합산</small></h3><div class="stats4"><div><b>' + sv.points + '</b><span>누적</span></div><div><b>' + sv.week + '</b><span>이번 주</span></div><div><b>' + sv.season + '</b><span>이번 시즌</span></div><div><b>' + sv.avg + '</b><span>평균 추측</span></div></div></div>';
    else if (!token()) h += '<div class="note">🔑 로그인하면 점수 · 기록이 서버에 저장돼 기기를 바꿔도 이어져요. <button type="button" class="btn sm pri" id="bnLogin">카카오 로그인</button></div>';
    h += '<div class="card"><h3>📊 내 꼬들 기록 <small>' + (sv ? '서버 기준' : '이 기기 기준') + '</small></h3><div class="stats4"><div><b>' + st.played + '</b><span>플레이</span></div><div><b>' + (st.played ? Math.round(st.wins / st.played * 100) : 0) + '%</b><span>정답률</span></div><div><b>' + st.streak + '</b><span>연속</span></div><div><b>' + st.best + '</b><span>최고 연속</span></div></div>' +
      '<div class="dist">' + st.dist.map(function (n, i) { return '<div><span style="width:14px">' + (i + 1) + '</span><i style="width:' + Math.max(8, n / mx * 100) + '%">' + n + '</i></div>'; }).join('') + '</div></div>';
    h += '<div class="card"><h3>📜 지난 판 <small>최근 ' + Math.min(RA.length, 50) + '개</small></h3>' + (RA.length ? RA.slice(0, 50).map(function (x) {
      var pre = (typeof x.g === 'string' ? x.g.split('|').filter(Boolean) : x.g || []).map(function (w) { var a = jamo(x.aw); return a ? score(w, a).map(function (c) { return c === 'g' ? '🟩' : c === 'y' ? '🟨' : '⬛'; }).join('') : ''; }).join('\n');
      return '<details class="hc"><summary><span>' + (x.win ? '🎉' : '😵') + '</span><span>' + esc(x.day.slice(5)) + (x.prac ? ' 연습' : ' #' + (x.no + 1)) + '</span><b>' + esc(x.aw) + '</b><small>' + (x.win ? x.n + '번' : '실패') + (x.win && x.pts != null ? ' · +' + x.pts + '점' : '') + (x.sec ? ' · ' + x.sec + '초' : '') + '</small></summary><pre>' + pre + '</pre></details>';
    }).join('') : '<div class="empty">아직 기록이 없어요. 오늘 문제부터 풀어 보세요!</div>') + '</div>';
    return h;
  }
  function subText() { return view === 'play' ? '오늘 #' + (GM.play ? GM.play.no + 1 : '') : view === 'prac' ? '기록 없는 연습 판' : '지난 판 · 연속'; }
  function render(pop) {
    if (!host) return;
    if (opt.onHead) opt.onHead(nick(), ready ? subText() : '');
    var tabs = opt.embedded ? '' : '<nav class="seg kdtabs" id="kdtabs">' + [['play', '🎯 오늘 꼬들'], ['prac', '🌱 연습'], ['hist', '📜 꼬들 기록']].map(function (t) { return '<button type="button" data-kv="' + t[0] + '"' + (t[0] === view ? ' class="on"' : '') + '>' + t[1] + '</button>'; }).join('') + '</nav>';
    if (!ready) { host.innerHTML = tabs + '<div class="card"><div class="empty">' + (loadErr ? '단어 목록을 불러오지 못했어요. 새로고침해 주세요' : '⏳ 단어를 불러오는 중…') + '</div></div>'; return; }
    KX = !!opt.embedded && document.documentElement.classList.contains('xl');
    host.innerHTML = tabs + (view === 'hist' ? histHTML() : gameHTML(view));
    wire(); if (view !== 'hist') { fit(); cellInfo(GM[view]); }
  }
  function msg(t, bad) { var e = $('msg'); if (e) { e.textContent = t || ''; e.className = 'kmsg' + (bad ? ' bad' : ''); } }
  function shake(m) { var r = $('r' + m.guesses.length); if (r) { r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake'); } }
  function wire() {
    var s = $('share'); if (s) s.onclick = function () { var t = shareText(GM[view]); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('결과를 복사했어요'); }, function () { toast('복사하지 못했어요', true); }); };
    var p = $('pracNext'); if (p) p.onclick = function () { GM.prac = newGame(true); CUR.prac = ''; render(); };
    var g = $('goPrac'); if (g) g.onclick = function () { go('prac'); };
    ['bnLogin', 'resLogin'].forEach(function (id) { var b = $(id); if (b) b.onclick = function (e) { e.preventDefault(); startLogin(); }; });
  }
  function go(v) { view = v; if (opt.standalone) { try { history.replaceState(null, '', '#' + v); } catch (e) {} } render(); }

  /* ── 입력 ── */
  /** 입력 중인 줄의 칸만 갱신 (카드 전체를 다시 그리지 않음 — 키를 누를 때마다 가장 자주 도는 길이라 가볍게) */
  function paintCur(m) {
    var r = $('r' + m.guesses.length); if (!r) return render();
    var cur = CUR[view], cs = r.querySelectorAll('.c');
    for (var i = 0; i < LEN; i++) { var ch = cur.charAt(i); if (cs[i].textContent !== ch) { cs[i].textContent = ch; cs[i].className = 'c' + (ch ? ' f' : ''); } }
    if (KX) {   // 활성 셀 · 머리글 강조를 옮김
      var a = activeCell(m, cur), old = host.querySelector('.c.sel'); if (old) old.classList.remove('sel'); if (a && cs[a.c]) cs[a.c].classList.add('sel');
      [].forEach.call(host.querySelectorAll('.ch'), function (t, k) { t.classList.toggle('hl', !!a && a.c === k); }); cellInfo(m);
    }
    msg('');
  }
  function press(k) {
    if (!ready || modalOpen || (view !== 'play' && view !== 'prac')) return;
    var m = GM[view]; if (m.done) return;
    if (view === 'play' && SV.today && SV.today.locked) return;
    var cur = CUR[view];
    if (k === 'Shift') { shift = !shift; return render(); }
    if (k === 'Back') { CUR[view] = cur.slice(0, -1); return paintCur(m); }
    if (k === 'Enter') {
      if (cur.length < LEN) { msg('자모 6개를 모두 넣어 주세요', true); return shake(m); }
      ensureG();
      if (!G[cur]) { msg('목록에 없는 단어예요', true); return shake(m); }
      if (m.guesses.indexOf(cur) >= 0) { msg('이미 쓴 단어예요', true); return shake(m); }
      if (!m.t0) m.t0 = Date.now();
      m.guesses.push(cur); CUR[view] = '';
      if (!m.prac && srvOn()) ensureStarted().catch(function () {});   // 첫 추측 때 서버 기록을 시작 (시작 시각 = 첫 추측)
      if (cur === m.ans) finish(m, true); else if (m.guesses.length >= TRIES) finish(m, false); else srvSave(m);
      persist(m); return render(true);
    }
    var add = k; shift = false;
    if (cur.length + add.length <= LEN) { if (!m.t0 && !m.guesses.length) m.t0 = Date.now(); CUR[view] = cur + add; paintCur(m); }
  }

  /* ── 창 ── */
  function openModal(html) {
    closeModal();
    var d = document.createElement('div'); d.id = 'kdModal';
    d.innerHTML = '<div class="mbg" id="kdMbg"><div class="sheet" role="dialog" aria-modal="true" tabindex="-1"><button type="button" class="x" data-x aria-label="닫기">✕</button>' + html + '</div></div>';
    document.body.appendChild(d); modalOpen = true;
    d.addEventListener('click', function (e) { if (e.target.id === 'kdMbg' || e.target.closest('[data-x]')) closeModal(); });
  }
  function closeModal() { var d = document.getElementById('kdModal'); if (d && d.parentNode) d.parentNode.removeChild(d); modalOpen = false; }
  function help() {
    openModal('<h2>🟩 꼬들 하는 법</h2><p>정답은 <b>자모 6개</b>로 이루어진 단어예요. <b>6번 안에</b> 맞혀 보세요. 자모 키보드로 6칸을 채우고 <b>입력</b>을 누르면 색깔로 알려 줘요.</p>' +
      '<p>🟩 자모와 자리가 모두 맞음<br>🟨 자모는 있지만 다른 자리<br>⬛ 정답에 없음</p>' +
      '<p>한 칸은 <b>자모 하나</b>예요. ㄲ · ㅐ 같은 글자는 한 칸이고, ㅘ · ㅝ · ㅢ 같은 겹모음과 겹받침(ㄳ …)은 <b>기본 자모 둘</b>로 나눠 넣어요. 예: ‘공룡’ = ㄱㅗㅇㄹㅠㅇ · ‘왕’ = ㅇㅗㅏㅇ.</p>' +
      '<p>매일 하나(자정에 바뀜). 컴퓨터에서는 자판(두벌식)으로도 입력돼요. 연습 탭에서는 기록 없이 마음껏 풀 수 있어요.</p><div class="btns"><button type="button" class="btn pri" data-x>시작</button></div>');
    save(KHELP, 1);
  }

  /* ── 시작 ── */
  var RAW = [], GI = 0, loadErr = false;
  function buildSome(n) { var end = Math.min(RAW.length, GI + n); for (; GI < end; GI++) { var w = RAW[GI], j = w && jamo(w); if (j && j.length === LEN) G[j] = 1; } return GI >= RAW.length; }
  function idleBuild() {
    if (GI >= RAW.length) return;
    var go = function () { buildSome(1500); if (GI < RAW.length) idleBuild(); };
    if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 800 }); else setTimeout(go, 30);
  }
  function ensureG() { if (GI < RAW.length) buildSome(RAW.length); }   // 입력 확인 때 아직이면 그 자리에서 마저
  function onHostClick(e) {
    var k = e.target.closest('[data-k]'); if (k) return press(k.getAttribute('data-k'));
    var v = e.target.closest('[data-kv]'); if (v) go(v.getAttribute('data-kv'));
  }
  function loadWords() {
    if (loading || ready) return; loading = true;
    fetch(BASE + 'words.txt?v=' + VER).then(function (r) { return r.text(); }).then(function (t) {
      var L = t.split('\n'); A = L[0].trim().split(' ').filter(Boolean);
      RAW = L[1].trim().split(' '); GI = 0; idleBuild();   // 입력 가능 단어 집합은 한가할 때 조금씩 만듦 (처음 열 때 멈칫하지 않게)
      GM.play = newGame(false); GM.prac = newGame(true); ready = true; loading = false; render();
      if (!load(KHELP)) help();
      srvToday().then(function () { render(); });
    }).catch(function () { loading = false; loadErr = true; render(); });
  }
  if (!kbound) {
    kbound = true;
    document.addEventListener('keydown', function (e) {
      if (!host || !host.isConnected || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === 'Enter') { e.preventDefault(); press('Enter'); } else if (e.key === 'Backspace') { e.preventDefault(); press('Back'); } else if (PHYS[e.code]) { e.preventDefault(); var ch = PHYS[e.code]; press(e.shiftKey && SHIFTED[ch] ? SHIFTED[ch] : ch); }
    });
  }
  /** 칸(host)에 꼬들을 그림. opt: standalone(자기 페이지) · onHead(닉네임, 부제) · toast(글, 오류?) · view('play' | 'prac' | 'hist') */
  function mount(h, o) {
    host = h; opt = o || {}; modalOpen = false; closeModal();
    if (opt.view) view = opt.view;
    if (opt.embedded && opt.mode) view = opt.mode;
    host.addEventListener('click', onHostClick);
    render(); loadWords();
    if (ready && token()) srvToday().then(function () { render(); });
  }
  window.addEventListener('resize', function () { if (host && host.isConnected && view !== 'hist') fit(); });
  window.JMB_KODLE = { mount: mount, help: help, go: go, version: VER };
  var own = document.getElementById('kodleHost');
  if (own) {   // 꼬들 자기 페이지: 머리줄 버튼을 여기서 연결
    var h0 = (location.hash || '').slice(1);
    mount(own, { standalone: true, view: h0 === 'prac' || h0 === 'hist' ? h0 : 'play', onHead: function (nk, sub) { var a = document.getElementById('acct'), b = document.getElementById('sub'); if (a) { a.textContent = nk || '로그인'; a.classList.toggle('on', !!nk); } if (b && sub) b.textContent = sub; } });
    document.getElementById('helpBtn').onclick = help;
    document.getElementById('back').onclick = function () { location.href = '../'; };
    document.getElementById('acct').onclick = function () { if (!session()) startLogin(); else toast((nick() || '로그인됨') + ' 님'); };
  }
})();
