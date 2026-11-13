/*! 잠만보 꼬맨틀 — 화면 v1.5.2
 * 매일 하나의 비밀 단어를 '뜻이 가까운 정도'(단어 의미 유사도)로 찾아가는 게임.
 * 서버 Semantle.gs (semToday · semStart · semSubmit · semRank): 오늘의 유사도 표를 한 번 받으면 추측마다 서버를 거치지 않음.
 * 로그인(카카오) 회원은 하루 한 번 기록 → 점수 · 순위 · 연속 · 배지. 로그인 안 해도 풀 수 있음(기록 없음).
 * 단어 목록 vocab.txt 는 0_PC설정\도구\꼬맨틀_데이터_만들기.py 가 만든 것과 같아야 함 (서버가 보내는 목록값 vh 로 확인).
 */
(function () {
  'use strict';
  var VER = '1.26.1';
  var CFG = window.JMB_CONFIG || {};
  var ENV = CFG.env || 'prod';
  function kstDay() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
  var KODLE_LOCK_FROM = '2026-11-13';   // 이 날부터 꼬들은 그날 꼬맨틀을 끝낸 사람만 열림 (꼬맨틀 → 꼬들 순서). 서버 Kodle.js KODLE_CFG_.LOCK_FROM 과 같게
  var KODLE_FROM = '2026-11-12';   // 꼬들 공개일(KST) — 운영은 이 날부터 탭이 켜짐 (미리 올려 두면 자정에 자동으로 열림). 테스트 사이트는 늘 켜짐
  var KODLE_ON = /jammanbo-beta/.test(location.pathname) || ENV !== 'prod' || kstDay() >= KODLE_FROM;
  var ENV_SFX = ENV !== 'prod' ? '_' + ENV : '';
  var API = window.SEM_API_LOCAL || CFG.api || '';
  var EDGE = window.SEM_EDGE_LOCAL || CFG.semEdge || '';   // (1.13.0) 엣지(Cloudflare Worker): 표를 Apps Script 없이 0.1초대로 줌. 비어 있거나 실패하면 Apps Script 경로
  var ROOT = (function () { var seg = location.pathname.split('/')[1] || ''; return /\.github\.io$/.test(location.hostname) && seg ? '/' + seg + '/' : '/'; })();
  var LS = { auth: 'jmb_kakao_v2' + ENV_SFX, state: 'jmb_kakao_state' + ENV_SFX, play: 'jmb_sem_play' + ENV_SFX, pend: 'jmb_sem_pend' + ENV_SFX, help: 'jmb_sem_help', tab: 'jmb_sem_tab', sort: 'jmb_sem_sort', xl: 'jmb_sem_xl', rkc: 'jmb_sem_rkc' + ENV_SFX, hsc: 'jmb_sem_hsc' + ENV_SFX };   // rkc · hsc: 순위 · 내 기록을 기기에 저장해 두었다가 먼저 보여 줌 (1.14.0)
  var BASE_PTS = 200, HINT_COST = 40, TOPN = 1000, HINT_EVERY = 5;   // 점수 상수 (서버 SEM_CFG_ BASE · HINT_COST 와 같게 — 1.16.1 에서 150 · 15 → 200 · 40)   // HINT_EVERY: 추측 5번마다 힌트가 하나씩 생김, 개수 제한 없음 (서버 SEM_CFG_.HINT_EVERY 와 같게)
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
            xl: lsGet(LS.xl) !== '0', sel: null, xAddr: '', queue: [], loading: false, optimistic: false };
  S.kSub = { prac: 'sem', hist: 'sem' };   // (1.16.0) 연습 · 내 기록 탭 안에서 보는 게임: 'sem' 꼬맨틀 · 'kodle' 꼬들   // (1.8.0) 엑셀 모드 — 기본 켜짐, 헤더 버튼(xlBtn)으로 끔 (기기에 저장)
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
  function f2(v) { return v.toFixed(2); }   // (1.11.0) 값은 퍼센트(코사인 × 100) 그대로 — 안내문의 '-100 ~ 100' 과 같게 (예전에는 /100 이라 0.19 처럼 보였음)
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
    xlChrome();
  }
  function xlTitle() { return '업무현황' + (S.view === 'chal' ? '_챌린지' : S.view === 'kodle' ? '_꼬들' : S.view === 'prac' ? (S.kSub.prac === 'kodle' && KODLE_ON ? '_꼬들연습' : '_연습') : S.view === 'rank' ? '_순위' : S.view === 'hist' ? '_이력' : S.srv && S.srv.no ? '_' + S.srv.no : '') + '.xlsx'; }

  /* ---------- 엑셀 모드 껍데기 (1.10.0): 로고 · 리본 · 이름 상자 + 수식 입력줄 · 상태 표시줄. 켤 때 만들고 끌 때 지움.
   * 입력창(#gw)과 추측 폼(#gf)은 수식 입력줄 안에 한 번만 있음 (켜진 동안). 리본의 '편집' 그룹 버튼이 힌트 · 포기 · 새 문제 · 정렬을 맡음 ---------- */
  var XCOL = ['A', 'B', 'C', 'D', 'E', 'F'];
  function xlMk(tag, id, cls, html) { var e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; e.innerHTML = html || ''; return e; }
  function xlChrome() {
    ['xlRibbon', 'xlFormula', 'xlStatus', 'xlLogo', 'xlSearch', 'xlWin'].forEach(function (id) { var e = $(id); if (e && e.parentNode) e.parentNode.removeChild(e); });
    if (!S.xl) { updateTop(); return; }
    var top = $('top'), bar = top.querySelector('.bar');
    bar.insertBefore(xlMk('span', 'xlLogo', 'xlogo', '<b>X</b>'), $('ttl').parentNode);
    bar.insertBefore(xlMk('span', 'xlSearch', 'xsearch', '검색 (Alt+Q)'), $('xlBtn'));
    bar.appendChild(xlMk('span', 'xlWin', 'xwin', '–☐✕'));
    top.insertBefore(xlMk('div', 'xlRibbon', 'xrib',
      '<div class="xtabs" aria-hidden="true"><span>파일</span><span class="on">홈</span><span>삽입</span><span>페이지 레이아웃</span><span>수식</span><span>데이터</span><span>검토</span><span>보기</span></div>' +
      '<div class="xbody">' +
        '<div class="xg dec" aria-hidden="true"><div class="xgi"><span class="xbig"><span class="xi">⎘</span>붙여넣기</span><span class="xcol"><i>잘라내기</i><i>복사</i><i>서식 복사</i></span></div><div class="xgl">클립보드</div></div>' +
        '<div class="xg dec" aria-hidden="true"><div class="xgi v"><span class="xrow"><span class="xsel w">맑은 고딕</span><span class="xsel">11</span></span><span class="xrow"><b>가</b><i>가</i><u>가</u><span class="xsep"></span><span>▦</span><span>A</span></span></div><div class="xgl">글꼴</div></div>' +
        '<div class="xg dec" aria-hidden="true"><div class="xgi v"><span class="xrow"><span>≡</span><span>≡</span><span>≡</span></span><span class="xrow"><span>⇤</span><span>⇥</span><span>병합하고 가운데 맞춤</span></span></div><div class="xgl">맞춤</div></div>' +
        '<div class="xg dec" aria-hidden="true"><div class="xgi v"><span class="xsel w">일반</span><span class="xrow"><span>%</span><span>,</span><span>.0</span><span>.00</span></span></div><div class="xgl">표시 형식</div></div>' +
        '<div class="xg xgame"><div class="xgi">' +
          '<button type="button" class="xb" id="rbHint"><span class="xi">Σ</span><span class="xt" id="rbHintT">힌트</span></button>' +
          '<button type="button" class="xb" id="rbGive"><span class="xi">✕</span><span class="xt" id="rbGiveT">포기</span></button>' +
          '<button type="button" class="xb" id="rbNext"><span class="xi">↻</span><span class="xt">새 문제</span></button>' +
          '<button type="button" class="xb" id="rbSort"><span class="xi">⇅</span><span class="xt" id="rbSortT">정렬</span></button>' +
        '</div><div class="xgl">편집</div></div>' +
      '</div>'), $('tabs'));
    top.insertBefore(xlMk('div', 'xlFormula', 'xform',
      '<div class="nb" id="nameBox">A1</div>' +
      '<div class="xfi"><span aria-hidden="true">✕</span><button type="submit" form="gf" class="xok" id="xOk" aria-label="입력">✓</button><span class="fxl" aria-hidden="true">fx</span></div>' +
      '<form class="gform" id="gf" autocomplete="off"><input id="gw" type="text" inputmode="text" enterkeyhint="send" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="20" lang="ko" aria-label="추측할 단어" placeholder="단어 입력"></form>'), $('tabs'));
    document.body.appendChild(xlMk('div', 'xlStatus', 'xstat',
      '<span class="fb" id="fb" aria-live="polite">준비</span><span class="xinfo" id="xinfo"></span><span class="xview" aria-hidden="true">▦▤▥</span><span class="xzoom" aria-hidden="true"><span>−</span><i></i><span>+</span><b>100%</b></span>'));
    xlState();   // 문제가 올 때까지는 입력 · 게임 버튼을 흐리게 (로딩 중에 친 단어가 조용히 사라지지 않게)
    updateTop();
  }
  /** 보는 화면에 맞게 리본 버튼 · 수식 입력줄 · 이름 상자 · 상태 표시줄을 맞춤 (게임 화면이 아니면 입력 · 게임 버튼은 흐리게) */
  function xlState() {
    if (!S.xl || !$('xlRibbon')) return;
    var game = (S.view === 'play' || (S.view === 'prac' && hasPrac())) && S.srv && S.srv.ready && S.L, L = game ? S.L : null;
    if (kodleSub()) { game = false; L = null; }   // 꼬들 화면(탭 · 연습 · 기록 안의 꼬들)에서는 꼬맨틀 입력 · 리본 버튼을 흐리게
    var gw = $('gw'), open = !!L || S.loading; if (gw) { gw.disabled = !open; if (!open) gw.value = ''; }   // 불러오는 중에도 입력 가능 (대기열)
    $('xOk').disabled = !open;
    var hb = $('rbHint'), hi = L ? hintInfo() : { off: true };
    hb.disabled = !L || hi.off; $('rbHintT').textContent = L ? hintShort() : '힌트';
    $('rbGive').disabled = !L || L.done; $('rbGiveT').textContent = L && L.prac ? '정답 보기' : '포기';
    $('rbNext').style.display = L && L.prac ? '' : 'none';
    $('rbSort').disabled = !L; $('rbSortT').textContent = '정렬: ' + (S.sort === 'sim' ? '유사도' : '입력순');
    $('nameBox').textContent = L ? (S.xAddr || 'B2') : 'A1';
    $('xinfo').textContent = L ? (L.prac ? '연습 · ' : '') + '#' + S.srv.no + ' · 1위 ' + f2(S.scale.r1) + ' · 10위 ' + f2(S.scale.r10) + ' · 1000위 ' + f2(S.scale.rN) : '';
    if (!L) { var fb = $('fb'); fb.className = 'fb'; fb.textContent = '준비'; }
  }
  /** 엑셀 모드 격자: 열 머리글(A~F) · 행 번호 · 1행 제목 · 추측은 2행부터 · 빈 셀이 이어짐 · 활성 셀(초록 테두리) */
  function xlGrid(list) {
    var sorted = S.sort === 'order' ? list.slice() : list.slice().sort(function (a, b) { return b.s - a.s; });
    var NR = Math.max(sorted.length + 16, 64), lastO = S.lastW ? list.filter(function (o) { return o.w === S.lastW; })[0] : null, lastRow = 0;
    sorted.forEach(function (o, i) { if (lastO && o.w === lastO.w) lastRow = i + 2; });
    var sel = S.sel && S.sel.r >= 1 && S.sel.r <= NR ? S.sel : { r: lastRow || 2, c: 1 };
    S.xAddr = XCOL[sel.c] + sel.r;
    function td(r, c, cls, v) { return '<td data-rc="' + r + ',' + c + '" class="c' + c + (cls ? ' ' + cls : '') + (sel.r === r && sel.c === c ? ' sel' : '') + '">' + (v == null ? '' : v) + '</td>'; }
    var h = '<table class="gt xlg"><thead><tr><th class="corner"></th>' + XCOL.map(function (c, i) { return '<th class="c' + i + (i === sel.c ? ' hl' : '') + '">' + c + '</th>'; }).join('') + '</tr></thead><tbody>';
    for (var r = 1; r <= NR; r++) {
      var o = r >= 2 ? sorted[r - 2] : null, cls = r === 1 ? 'xlt' : o ? (o.win ? 'win ' : '') + 't' + o.t + (o.h ? ' hintw' : '') : '';
      var v = r === 1 ? ['#', '단어', '유사도', '순위'] : o ? [o.n, esc(o.w), f2(o.s), o.win ? '정답' : o.r ? o.r : o.fr ? '≈' + fmtN(o.fr) : ''] : ['', '', '', ''];
      h += '<tr' + (o && lastO && o.w === lastO.w ? ' id="lastRow"' : '') + (cls ? ' class="' + cls + '"' : '') + '><td class="rn' + (sel.r === r ? ' hl' : '') + '">' + r + '</td>' +
        td(r, 0, 'n', v[0]) + td(r, 1, 'w', v[1]) + td(r, 2, 's', v[2]) + td(r, 3, 'r', v[3]) + td(r, 4, 'xe', '') + td(r, 5, 'xe', '') + '</tr>';
    }
    return h + '</tbody></table>';
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

  /** 엣지(Cloudflare Worker) 호출 — 오늘 · 어제 · 연습 표만. 어떤 이유로든 실패하면 거절(호출한 쪽이 Apps Script 로 폴백) */
  function edgeCall(fn, extra) {
    if (!EDGE) return Promise.reject(new Error('no edge'));
    var ctl = typeof AbortController === 'function' ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, 6000) : 0;
    return fetch(EDGE + '/sem', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, cache: 'no-store', signal: ctl ? ctl.signal : undefined,
      body: JSON.stringify(Object.assign({ fn: fn, token: token(), env: ENV !== 'prod' ? 'beta' : undefined }, extra || {})) })
      .then(function (r) { return r.json(); })
      .then(function (j) { clearTimeout(timer); if (!j || !j.ok || !j.r) throw new Error((j && j.e) || 'edge'); return j.r; }, function (e) { clearTimeout(timer); throw e; });
  }

  /* ================= 데이터 (단어 목록 + 오늘 유사도 표) ================= */
  function sha1hex(text) {
    if (!(window.crypto && crypto.subtle && window.TextEncoder)) return Promise.resolve('');
    return crypto.subtle.digest('SHA-1', new TextEncoder().encode(text)).then(function (b) { return [].map.call(new Uint8Array(b), function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); });
  }
  /* (1.9.0) 단어 목록(약 410KB)은 기기(Cache Storage)에 저장해 두고 다음부터는 네트워크 없이 바로 읽음. 서버가 알려 주는 목록값(vh)과 다르면 새로 받음.
   * VOCAB_URL 의 숫자는 목록 내용이 바뀔 때만 올림 (시작 페이지 index.html 의 로그인 중 미리 받기 주소와 같게) — 화면 버전(VER)이 바뀌어도 다시 안 받음 */
  /* (1.11.0) 단어 목록 두 가지: V1 = 예전(vocab.txt, 4만 개 · 표 형식 1) / V2 = 늘린 것(vocab2.txt · 표 형식 2). 서버가 fmt=2 요청에 형식 2 로 답하면 V2, 아니면 V1 (운영 서버가 새 사전을 아직 안 가졌을 때 호환) */
  var V1 = { id: 1, url: 'vocab.txt?v=1', key: 'vocab' }, V2 = { id: 2, url: 'vocab3.txt?v=1', key: 'vocab3' },   // (1.26.0~) 6.25만 단어(vocab3) — 되돌리기: vocab2.txt · 키 vocab2
    VCACHE = 'jmb_sem_vocab' + ENV_SFX;
  function vocabFromCache(V) {
    if (!window.caches) return Promise.resolve(null);
    return caches.open(VCACHE).then(function (c) { return c.match(V.key); }).then(function (r) { return r ? r.json() : null; })
      .then(function (o) { return o && o.t && o.h ? { words: o.t.split('\n'), hash: o.h, fromCache: true, src: V.id } : null; }, function () { return null; });
  }
  function loadVocab(V, force) {
    var net = function () {
      return fetch(V.url, force ? { cache: 'reload' } : undefined).then(function (r) { if (!r.ok) throw new Error('단어 목록을 받지 못했어요'); return r.text(); }).then(function (t) {
        return sha1hex(t).then(function (h) {
          h = h.slice(0, 10);
          if (window.caches && h) { try { caches.open(VCACHE).then(function (c) { return c.put(V.key, new Response(JSON.stringify({ h: h, t: t }))); }).catch(function () {}); } catch (e) {} }
          return { words: t.split('\n'), hash: h, src: V.id };
        });
      });
    };
    if (force) return net();
    // 같은 목록을 동시에 두 번 부르면(저장된 표 확인 → 전체 시작) 한 번만 받음
    if (!loadVocab.fl) loadVocab.fl = {};
    if (loadVocab.fl[V.id]) return loadVocab.fl[V.id];
    var p = vocabFromCache(V).then(function (hit) { return hit || net(); });
    loadVocab.fl[V.id] = p; p.then(null, function () { delete loadVocab.fl[V.id]; });
    return p;
  }
  /* 표 형식 — 값은 모두 '퍼센트'(코사인 × 100):
   *  1 = int16 (퍼센트 정수, 예전 사전)
   *  2 = 벌크 1바이트(값 = LO + 바이트 × STEP) + 상위 1500 정밀값('상위' 블록: u16 K | K × u16 번호 증분 | K × i16 값×100). 상위 값으로 벌크를 덮어씀 → 1000위 안 순위는 정확 */
  var LO = -32, STEP = 0.25;
  function b64bytes(b64) { var bin = atob(b64), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function decodeSrv(srv) {   // → { sims, exact(정밀값이 있는 단어 번호들 | null) }
    var u = b64bytes(srv.table), n = srv.n, i;
    if (srv.fmt === 2) {
      if (u.length !== n) throw new Error('오늘 표가 단어 목록과 달라요 (' + u.length + ' ≠ ' + n + ')');
      var sims = new Float32Array(n); for (i = 0; i < n; i++) sims[i] = LO + u[i] * STEP;
      var t = b64bytes(srv.top), dv = new DataView(t.buffer), K = t.length >= 2 ? dv.getUint16(0, true) : 0, exact = new Array(K), at = 0;
      if (t.length !== 2 + 4 * K) throw new Error('상위 표가 올바르지 않아요');
      for (var k = 0; k < K; k++) { at += dv.getUint16(2 + 2 * k, true); if (at >= n) throw new Error('상위 표가 올바르지 않아요'); exact[k] = at; sims[at] = dv.getInt16(2 + 2 * K + 2 * k, true) / 100; }
      return { sims: sims, exact: exact };
    }
    var a = new Int16Array(u.buffer, 0, u.length >> 1);
    if (a.length !== n) throw new Error('오늘 표가 단어 목록과 달라요 (' + a.length + ' ≠ ' + n + ')');
    return { sims: a, exact: null };
  }
  function pickTop(sims, exact) {   // → { ans, top } top = 정답을 뺀 상위 TOPN 단어 번호 (유사도 높은 순, 동점은 번호 순)
    var ans = -1, bv = -1e9, j, cand;
    if (exact) {   // 형식 2: 상위 블록만 보면 됨 (4만~5만 개를 훑지 않음)
      for (j = 0; j < exact.length; j++) if (sims[exact[j]] > bv) { bv = sims[exact[j]]; ans = exact[j]; }
      cand = exact.filter(function (x) { return x !== ans; });
      cand.sort(function (a, b) { return sims[b] - sims[a] || a - b; });
      return { ans: ans, top: cand.slice(0, TOPN) };
    }
    for (j = 0; j < sims.length; j++) if (sims[j] > bv) { bv = sims[j]; ans = j; }
    // (1.9.0) 전부 정렬하지 않고 1000위 경계 값을 세어 찾은 뒤 그 이상인 것만 정렬 (결과는 전체 정렬과 같음 — 동점은 번호 순)
    var cnt = new Uint32Array(65536), cut, need = TOPN; cand = [];
    for (j = 0; j < sims.length; j++) if (j !== ans) cnt[sims[j] + 32768]++;
    for (cut = 65535; cut >= 0; cut--) { need -= cnt[cut]; if (need <= 0) break; }
    for (j = 0; j < sims.length; j++) if (j !== ans && sims[j] + 32768 >= cut) cand.push(j);
    cand.sort(function (a, b) { return sims[b] - sims[a]; });
    return { ans: ans, top: cand.slice(0, TOPN) };
  }
  /* 욕설 · 성인 단어 (0_PC설정\도구\꼬맨틀_금지어.txt 와 같게): 추측으로 받지 않고 · 힌트 · 가까운 단어 목록에서 뺌. 번호(표)는 그대로 두고 글자만 거름 */
  var BLOCK = {}; '시발 씨발 씹는 새끼 애꾸새끼라고 존나 졸라 븅신 호로 자지 보지 창녀 변태 개소리 꺼져 미친 미친다 미친듯이 미친다고 찌질이방법단 강간 윤간 성관계 성관계를 성교 그룹섹스 남성성기 여자성기 성기 음경 정액 정액존 질내사정 섹스 섹시 섹시미 섹시한 섹시한중년여성 야동 서양야동 일본야동 한국야동 포르노 음란 음란물 음란한 자위 오르가즘 애무 유두 젖꼭지 큰가슴 큰엉덩이 알몸 나체 누드 팬티 속옷 콘돔 발기 발기부전 매춘 매매춘 매춘부 성매매 성추행 성폭력 성폭행 성폭행한 몰카 유출몰카 도촬 성인용 성인용품 에로 유흥 유흥업소 스트립 불륜 간통 간통죄 고환 야한 사까시 불알 거시기 색녀 성행위 성행위를 성생활 성적쾌감 외설 선정적인 란제리 항문'.split(' ').forEach(function (w) { BLOCK[w] = 1; });
  function prepare(vocab, srv) {
    S.vocab = vocab.words; S.idx = new Map();
    for (var i = 0; i < S.vocab.length; i++) if (!BLOCK[S.vocab[i]] && !S.idx.has(S.vocab[i])) S.idx.set(S.vocab[i], i);
    prepareTable(srv);
  }
  function prepareTable(srv) {
    var d = decodeSrv(srv), p = pickTop(d.sims, d.exact);
    S.sims = d.sims; S.ans = p.ans; S.top = p.top;
    S.rankOf = new Map(); S.top.forEach(function (ix, r) { S.rankOf.set(ix, r + 1); });
    S.scale = { r1: S.sims[S.top[0]], r10: S.sims[S.top[Math.min(9, S.top.length - 1)]], rN: S.sims[S.top[Math.min(TOPN, S.top.length) - 1]] };
  }

  /* ================= 오늘 판 (이 기기에 저장) ================= */
  function freshLocal() { return { day: S.srv.day, vh: S.srv.vh, g: [], hints: 0, done: false, win: false, rec: false, nonce: '', startAt: 0, res: null, pend: false }; }
  function saveLocal() { if (S.L && S.L.prac) return; lsSet(LS.play, JSON.stringify(S.L)); }   // 연습 판은 저장하지 않음 (오늘 판을 덮어쓰면 안 됨)
  function guessWords() { return S.L.g.map(function (x) { return x.w; }); }
  function realCount() { return S.L.g.filter(function (x) { return !x.h; }).length; }
  function simOf(w) { return S.sims[S.idx.get(w)]; }
  /** (1.21.1) 1000위 밖 단어의 대략적인 순위 — 정답과의 유사도가 이 단어보다 높은 단어 수 + 1 (표에 모든 단어 값이 있어 바로 셈. 값이 0.25 단위로 뭉쳐 있어 '약') */
  var farMemo = {};
  function farRank(w) {
    var i = S.idx.get(w), sims = S.sims; if (i == null || !sims) return 0;
    var key = S.ans + ':' + i; if (farMemo[key]) return farMemo[key];
    var sv = sims[i], c = 0; for (var k = 0, n = sims.length; k < n; k++) if (sims[k] > sv) c++;
    return (farMemo[key] = c + 1);
  }
  function fmtN(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function rankIn(w) { return S.rankOf.get(S.idx.get(w)) || 0; }
  function tier(w) {   // 0 얼음 · 1 차가움 · 2 미지근 · 3 따뜻 · 4 뜨거움 · 5 코앞 · 6 정답
    var i = S.idx.get(w); if (i === S.ans) return 6;
    var r = S.rankOf.get(i) || 0, s = S.sims[i];
    if (r && r <= 10) return 5; if (r && r <= 100) return 4; if (r) return 3;
    return s >= S.scale.rN - 3 ? 2 : s > 0 ? 1 : 0;   // 값은 퍼센트: 1000위 값보다 3점 안쪽이면 미지근 · 0 초과 차가움 · 그 밑 얼음 (1.11.0: 예전 -300 은 다른 단위 기준이라 거의 모두 '미지근' 이었음)
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
    if (S.loading || !S.idx) { var qw = normalize(raw); if (qw) { S.queue.push(raw); toast('문제를 불러오는 중이에요. ‘' + qw + '’ 은(는) 곧 계산돼요'); } return; }   // (1.12.0) 불러오는 동안 먼저 입력한 단어는 대기열로
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
    S.lastW = w; S.sel = null; S.scrollNew = true; saveLocal(); scheduleSave();   // sel: 엑셀 모드 활성 셀 — 새 추측이 들어가면 그 줄로 옮겨 감
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
  function hintInfo() {
    var L = S.L, label, off = false;
    if (L.prac) label = '💡 힌트';   // 연습은 개수 제한 없음 (글자가 두 줄로 꺾이지 않게 짧게)
    else if (L.done) label = '💡 힌트 (연습)';
    else if (hintsLeft() > 0) label = '💡 힌트 (' + hintsLeft() + '개 남음)';   // 점수 비용은 확인창에서 알려 줌 (버튼 글자가 두 줄로 꺾이지 않게 짧게)
    else { off = true; label = '🔒 힌트 (' + hintNext() + '번 더 추측)'; }
    return { label: label, off: off };
  }
  function hintShort() { var L = S.L; return L.prac || L.done ? '힌트' : hintsLeft() > 0 ? '힌트 ' + hintsLeft() : '힌트 ' + hintNext() + '번 후'; }
  function hintBtn() {
    var h = hintInfo();
    return '<button type="button" class="btn" id="hintBtn"' + (h.off ? ' disabled' : '') + '>' + xe(h.label) + '</button>';
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
      if (a < TOPN && !have[S.top[a]] && !BLOCK[S.vocab[S.top[a]]]) pick = S.top[a]; else if (b >= 1 && !have[S.top[b]] && !BLOCK[S.vocab[S.top[b]]]) pick = S.top[b];
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
    if (!S.xl) { try { JMB_FX.confetti({ x: .5, y: .35, count: 120, duration: 2400 }); JMB_FX.celebrate({ kind: 'win' }); } catch (e) {} }   // 엑셀 모드는 조용히
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
  /* loadMine: semToday 세 번째 인자 1 = 표 없이 기록 · 통계만 받음 (큰 표를 다시 받지 않음) */
  function loadMine() { return api('semToday', [token(), 0, 1]).then(function (r) { var T = today_(); if (r && r.ready && T && T.srv) { T.srv.stats = r.stats; T.srv.my = r.my; T.srv.solvedToday = r.solvedToday; } render(); }, function () {}); }

  /* ================= 나눔 ================= */
  function shareText() {
    // (1.5.3) 링크 · 추측 횟수 · 이모지 열(개수로 횟수가 보임)은 넣지 않음 — 단톡방 도배 · 횟수 공개 부담을 줄이려고. 힌트 수와 점수만. 정답 단어도 넣지 않음
    var L = S.L, head = '🔤 꼬맨틀 #' + S.srv.no + (L.win ? ' 🎉' : ' 😵');
    if (!L.win) return head + '\n오늘은 포기…';
    var line = '힌트 ' + (L.hints ? L.hints + '개' : '없이');
    if (L.res && L.res.points) line += ' · ⭐' + L.res.points + '점';
    return head + '\n' + line;
  }
  /** (1.23.0) 오늘 결과에서 뽑는 '기록' 태그 — 결과 카드(나만 봄)와 자랑 글에 붙음. 개인 신기록 = 오늘을 뺀 내 최소 추측(서버 stats.pb)보다 적게 */
  function semTags() {
    var L = S.L; if (!L || !L.done || !L.win || L.prac) return [];
    var st = S.srv && S.srv.stats, n = L.n || (L.res && L.res.guesses) || 0, t = [];
    if (st && st.pb && st.solves >= 2) { if (n < st.pb) t.push('🆕 개인 신기록!'); else if (n === st.pb) t.push('🤝 개인 최고 기록 타이'); }
    if (n && n <= 3) t.push('🍀 3번 안에 정답!'); else if (n && n <= 10) t.push('⚡ 10번 안에 정답');
    if (!L.hints && n && n <= 30) t.push('🧠 힌트 없이 30번 안에');
    if (L.res && L.res.order === 1) t.push('🥇 오늘 가장 먼저 맞힘');
    return t;
  }
  function semTagsHTML() { var t = semTags(); return t.length ? '<p class="rtags">' + t.map(function (x) { return '<span>' + xe(x) + '</span>'; }).join('') + '</p>' : ''; }
  /** (1.22.0) 자랑하기: 몇 번 만에 풀었는지까지 넣은 글 — 평소 '공유'(횟수 비공개)와 따로, 자랑하고 싶은 사람이 직접 누를 때만 */
  function bragText() {
    var L = S.L, n = L.n || (L.res && L.res.guesses) || 0, line = '🏅 ' + n + '번 만에 성공 · 힌트 ' + (L.hints ? L.hints + '개' : '없이');
    if (L.res && L.res.points) line += ' · ⭐' + L.res.points + '점';
    var out = '🔤 꼬맨틀 #' + S.srv.no + ' 🎉\n' + line;
    if (L.res && L.res.streak > 1) out += '\n🔥 ' + L.res.streak + '일 연속 정답';
    var tg = semTags(); if (tg.length) out += '\n' + tg.slice(0, 2).join(' · ');
    return out;
  }
  /** 오늘의 챌린지 자랑 글: 꼬맨틀 · 꼬들 몇 번 + 연속 챌린지 */
  function chalBrag() {
    var td = S.ctx === 'td' ? S : S.hold.td, my = td && td.srv && td.srv.my, L = td && td.L, ch = td && td.srv && td.srv.ch, kv = null;
    try { kv = JSON.parse(localStorage.getItem('jmb_kodle_v1' + ENV_SFX) || 'null'); } catch (e) {}
    var sn = my && my.guesses ? my.guesses : L && L.n ? L.n : 0, kn = kv && kv.guesses ? kv.guesses.length : 0, sw = (my && my.result === '정답') || (L && L.win), kw = kv && kv.win;
    var out = '🏁 오늘의 챌린지 완료! 🏆\n🔤 꼬맨틀 ' + (sw ? sn + '번' : '도전') + ' · 🟩 꼬들 ' + (kw ? kn + '번' : '도전');
    if (ch && ch.st > 1) out += '\n🔥 연속 챌린지 ' + ch.st + '일';
    return out;
  }
  function share(custom) {
    if (S.sharing) return;   // 공유창이 떠 있는 동안 또 누르면 오류가 나서 막음
    S.sharing = true;
    var text = typeof custom === 'string' ? custom : shareText(), done = function () { S.sharing = false; };
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
      '<ul><li><b>정답 점수</b> = ' + BASE_PTS + ' − 추측 횟수 − 힌트 × ' + HINT_COST + ' (최소 0점) — 힌트를 안 쓰고 적게 추측할수록 높아요. 힌트 하나가 꽤 아파요. 일찍 푼다고 더 받지는 않아요</li><li><b>연속 보너스</b> 이틀째부터 연속 정답 하루마다 +5 (최대 +30)</li><li><b>힌트</b>는 처음엔 못 써요. 추측 <b>5번마다 하나씩</b> 생기고 개수 제한은 없어요. 하나당 −' + HINT_COST + '점. 지금까지 찾은 가장 가까운 단어보다 더 가까운 단어를 알려 줘요</li><li>포기하면 0점 · 연속 기록이 끊겨요</li><li>하루에 한 번만 기록돼요. 정답을 맞힌 뒤에도 계속 연습할 수 있어요.</li><li>순위는 오늘(점수 순) · 이번 주 · 시즌(분기) · 연속 정답 · 레이팅이 있어요. <b>다른 사람에게는 힌트 수와 점수만 보여요</b> (추측 횟수 · 걸린 시간은 나만 봐요).</li>' + (/jammanbo-beta/.test(location.pathname) ? '<li>🟩 <b>꼬들</b> 점수(정답 100 − 추측당 10 · 연속 보너스)도 주간 · 시즌 · 누적 점수에 더해져요. 정답 횟수 · 평균 · 연속 · 레이팅은 꼬맨틀만 셈</li>' : '') + '<li><b>레이팅</b>은 그 날 푼 사람끼리 추측 횟수를 겨루는 점수예요 (처음 1500점). 적게 맞히면 오르고 많이 맞히면 내려가요. 같으면 무승부, 포기는 꼴찌, 힌트 1개는 추측 5번으로 쳐요. 분기마다 새로 시작하고 3일 이상 참여하면 순위에 올라요.</li><li>순위에서 이름을 누르면 그 사람의 기록과 나와의 비교를 볼 수 있어요.</li></ul>' +
      '<h4>📚 출처</h4><p class="hint">단어의 의미 거리는 Facebook FastText 한국어 벡터(CC-BY-SA 3.0), 단어 목록 일부는 국립국어원 한국어기초사전(CC BY-SA 2.0 KR)을 바탕으로 했어요.</p>' +
      '<h4>📱 팁</h4><p>한글 단어만 입력할 수 있어요 (영어 · 숫자는 안 돼요). ‘먹었다’ · ‘학교에서’ · ‘웃다’ 처럼 사전에 없는 꼴은 사전에 있는 가까운 꼴(‘먹다’ · ‘학교’ · ‘웃는’)로 바꿔 찾아요. 점수는 컴퓨터가 웹 · 위키백과 글에서 단어가 함께 쓰인 정도를 학습해 계산한 뜻 거리라서, 학습한 글에 따라 편향이 있거나 가끔 이상한 점수가 나올 수 있어요. 웃고 넘겨 주세요 😄</p><p class="hint">단어 벡터 출처: 페이스북(메타) 패스트텍스트, CC BY-SA 3.0 · 게임 방식은 뉴스젤리 꼬맨틀을 참고했어요.</p>' +
      '<div class="btns"><button type="button" class="btn pri" data-x>알겠어요</button></div>');
  }

  /* ================= 화면 ================= */
  function setHead() {
    var st = S.srv && S.srv.stats;
    if (S.xl) { $('ttl').textContent = xlTitle(); $('sub').textContent = '저장됨'; return; }
    if (S.view === 'kodle') { $('ttl').textContent = '꼬들'; $('sub').textContent = '자모 6개를 색깔로 맞혀라 · 점수는 꼬맨틀에 합산'; return; }
    if (S.view === 'chal') { var cn = chalState().n; $('ttl').textContent = '오늘의 챌린지'; $('sub').textContent = cn === 2 ? '🏆 오늘 코스 완료!' : cn + '/2 완료 · 꼬맨틀 → 꼬들'; return; }
    if (S.view !== 'kodle' && kodleSub()) { $('ttl').textContent = S.view === 'prac' ? '꼬들 연습' : '꼬들 기록'; $('sub').textContent = S.view === 'prac' ? '기록 없이 마음껏' : '꼬들 점수 · 연속 · 지난 판'; return; }
    if (S.view === 'prac') { $('ttl').textContent = '꼬맨틀 연습'; $('sub').textContent = '기록 없이 마음껏 — 힌트도 무제한'; return; }
    $('ttl').textContent = S.srv && S.srv.no ? '꼬맨틀 #' + S.srv.no : '꼬맨틀';
    $('sub').textContent = st && st.streak ? '🔥 ' + st.streak + '일 연속 정답 중' : '오늘의 비밀 단어를 찾아라';
  }
  function tabsOn() { [].forEach.call($('tabs').children, function (b) { b.classList.toggle('on', b.getAttribute('data-v') === S.view); }); }
  /* ---------- 로그인 안 하면 시작 못 함 (서버도 로그인 없이는 문제를 안 줌) ---------- */
  function renderGate(hasSession) {
    $('tabs').hidden = true; updateTop(); xlState();
    $('ttl').textContent = S.xl ? '업무현황.xlsx' : '꼬맨틀'; $('sub').textContent = S.xl ? '로그인 필요' : '로그인하고 시작하세요';
    $('view').innerHTML = '<div class="card gate"><div class="em">🔒</div><h2>로그인하고 시작하세요</h2>' +
      '<p>꼬맨틀은 <b>잠만보 회원</b>만 할 수 있어요.<br>카카오로 로그인하면 기록 · 순위 · 레이팅이 남아요.</p>' +
      (hasSession ? '<div class="note warn" style="margin:12px 0 0">카카오 로그인은 됐는데 <b>모임 닉네임이 아직 연결되지 않았어요.</b><br>잠만보 앱 오른쪽 위 계정 버튼에서 닉네임을 먼저 연결해 주세요.</div><div class="btns"><button type="button" class="btn pri" id="goHome">🏠 잠만보로 가서 연결하기</button></div>'
                  : '<div class="btns"><button type="button" class="btn pri" id="login">카카오로 로그인</button></div>') + '</div>';
  }
  function render() {
    if (!S.nick) return renderGate(!!session());
    if (KODLE_ON && !S.homeSet) { S.homeSet = true; if (S.view === 'play') S.view = 'chal'; }   // 열면 오늘의 챌린지가 첫 화면
    setHead(); tabsOn(); kodleTab(); chalTab();
    if (S.view === 'prac') renderPrac();
    else if (S.view === 'rank') renderRank();
    else if (S.view === 'hist') renderHist();
    else if (S.view === 'kodle') renderKodle('play');
    else if (S.view === 'chal') renderChal();
    else renderPlay();
    xlState();   // 엑셀 모드: 리본 · 수식 입력줄 · 상태 표시줄을 지금 화면에 맞춤
  }

  /** (1.15.0) 🟩 꼬들 탭: 꼬들 모듈(../kodle/app.js)을 이 화면 안에 그림 — 점수는 꼬맨틀 주간 · 시즌 · 누적에 합산. 처음 열 때만 파일을 받음 */
  var kodleP = null;
  function loadKodle() {
    if (window.JMB_KODLE) return Promise.resolve();
    if (!kodleP) kodleP = new Promise(function (res, rej) { var s = document.createElement('script'); s.src = '../kodle/app.js?v=1.18.0'; s.onload = res; s.onerror = function () { kodleP = null; rej(new Error('꼬들 파일을 못 받았어요')); }; document.head.appendChild(s); });
    return kodleP;
  }
  /** 꼬들이 보이는 화면인가: 🟩 꼬들 탭, 또는 연습 · 내 기록 탭에서 '꼬들' 을 고른 경우 */
  function kodleSub() { return KODLE_ON && (S.view === 'kodle' || ((S.view === 'prac' || S.view === 'hist') && S.kSub[S.view] === 'kodle')); }
  /** 연습 · 내 기록 위의 '꼬맨틀 | 꼬들' 선택 줄 */
  function segHTML(v) {
    var lab = v === 'prac' ? ['🔤 꼬맨틀 연습', '🟩 꼬들 연습'] : ['🔤 꼬맨틀 기록', '🟩 꼬들 기록'], on = S.kSub[v] === 'kodle' ? 1 : 0;
    return '<nav class="seg" id="kSeg"><button type="button" data-ks="sem"' + (on ? '' : ' class="on"') + '>' + lab[0] + '</button><button type="button" data-ks="kodle"' + (on ? ' class="on"' : '') + '>' + lab[1] + '</button></nav>';
  }
  /** v = 'play'(🟩 꼬들 탭) · 'prac' · 'hist' — 꼬들 모듈을 이 화면 안에 그림 */
  function renderKodle(v) {
    v = v || 'play';
    if (v === 'play' && kodleLocked()) { $('view').innerHTML = lockCard(); return; }   // 순서 잠금: 꼬맨틀을 끝내기 전엔 꼬들 오늘 판을 열지 않음
    var old = $('kdHost'); if (old && old.isConnected && old.getAttribute('data-m') === v && window.JMB_KODLE) return;   // 이미 그려져 있으면 다시 그리지 않음 (입력 중이던 칸 보존)
    var host = document.createElement('div'); host.id = 'kdHost'; host.setAttribute('data-m', v); host.style.display = 'contents';   // 엑셀 모드의 '.wrap > .card' 규칙이 그대로 먹도록
    $('view').innerHTML = v === 'play' ? '' : segHTML(v); $('view').appendChild(host);
    host.innerHTML = '<div class="card"><div class="empty">⏳ 꼬들을 불러오는 중…</div></div>';
    loadKodle().then(function () { if (kodleSub() && $('view').lastChild === host) JMB_KODLE.mount(host, { embedded: true, mode: v, toast: toast, onCell: function (addr, txt) { if (!S.xl) return; var nb = $('nameBox'); if (nb) nb.textContent = addr; var gw = $('gw'); if (gw) gw.value = txt || ''; } }); }, function (e) { host.innerHTML = '<div class="card empty">' + esc(e.message) + '</div>'; });
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
  /** 끝나면 다음 게임으로: 꼬들 (두 글자 단어를 자모 색깔로 맞히기) */
  /* ================= 오늘의 챌린지 (1.21.0) — 꼬맨틀 → 꼬들을 하루 코스로 묶음 ================= */
  /** 오늘 코스의 두 단계(꼬맨틀 · 꼬들) 상태: {done, win, started, pct, locked} — 이 기기의 오늘 판 + 서버 요약(ch) */
  function chalState() {
    var td = S.ctx === 'td' ? S : S.hold.td, L = td && td.L, my = td && td.srv && td.srv.my, ch = td && td.srv && td.srv.ch;
    var s = { done: !!((my && my.state === '완료') || (L && L.done)), win: !!((L && L.done && L.win) || (my && my.result === '정답')), started: !!(L && L.g && L.g.length), pct: 0 };
    if (!s.done && s.started) {
      if (S.ctx === 'td' && S.rankOf) { var best = 0; L.g.forEach(function (x) { var r = rankIn(x.w); if (r && (!best || r < best)) best = r; }); s.pct = best ? Math.max(12, Math.round((1 - Math.log(best) / Math.log(1001)) * 100)) : Math.min(35, 6 + L.g.length * 2); }
      else s.pct = Math.min(35, 6 + L.g.length * 2);
    }
    var kv = null; try { kv = JSON.parse(localStorage.getItem('jmb_kodle_v1' + ENV_SFX) || 'null'); } catch (e) {}
    if (kv && kv.day !== kstDay()) kv = null;
    var k = { done: !!((kv && kv.done) || (ch && ch.tdone)), win: !!(kv && kv.win), started: !!(kv && kv.guesses && kv.guesses.length), pct: 0, locked: kstDay() >= KODLE_LOCK_FROM && !s.done };
    if (!k.done && k.started) k.pct = Math.round(kv.guesses.length / 6 * 100);
    return { s: s, k: k, ch: ch || null, n: (s.done ? 1 : 0) + (k.done ? 1 : 0) };
  }
  function chalStep(no, name, desc, st, go) {
    var cls = st.done ? 'done' : st.started ? 'prog' : 'wait', lab = st.done ? '완료' : st.started ? '진행 중' : st.locked ? '🔒 대기 중' : no === 1 ? '시작 전' : '대기 중';
    return '<div class="step ' + cls + '" data-go="' + go + '" role="button" tabindex="0"><div class="sr"><b>STEP 0' + no + '. ' + name + '</b><span class="st">' + lab + '</span></div><p>' + desc + '</p>' +
      (st.done ? '<div class="pbar"><i style="width:100%"></i></div>' : st.started ? '<div class="pbar"><i style="width:' + st.pct + '%"></i></div>' : '') + '</div>';
  }
  function renderChal() {
    var c = chalState(), all = c.n === 2, ch = c.ch, h = '<div class="card chal"><h2>오늘의 챌린지</h2><div class="csub">TODAY\'S WORD CHALLENGE</div><div class="cpill' + (all ? ' ok' : '') + '">2개 게임 중 ' + c.n + '개 완료</div>' +
      chalStep(1, '꼬맨틀', '단어의 의미를 추리해 보세요.', c.s, 'play') + '<div class="carr" aria-hidden="true">↓</div>' + chalStep(2, '꼬들', '글자와 위치를 추리해 정답을 맞혀 보세요.', c.k, 'kodle');
    h += '<div class="cfoot"><div class="trophy' + (all ? ' on' : '') + '">🏆</div><b>' + (all ? '오늘의 챌린지 완료!' : '오늘의 챌린지') + '</b><p>' + (all ? '두 게임을 모두 끝냈어요. 연속 챌린지 기록에 반영됐어요!' : '두 게임을 모두 완료하면 연속 챌린지 기록에 반영돼요') + '</p></div>';
    if (ch) h += '<div class="cstat"><div><b>🔥 ' + ch.st + '일</b><small>연속 챌린지' + (ch.bs > ch.st ? ' · 최고 ' + ch.bs + '일' : '') + '</small></div><div><b>' + ch.cd + '명</b><small>오늘 완료' + (ch.cp ? ' · 참여 ' + ch.cp + '명' : '') + '</small></div></div>' +
      (ch.cp ? '<div class="pbar sm" title="오늘 참여한 사람 중 챌린지를 완료한 비율"><i style="width:' + Math.round(ch.cd / ch.cp * 100) + '%"></i></div>' : '');
    var next = !c.s.done ? ['play', (c.s.started ? '이어서 하기' : '시작하기') + ' · 꼬맨틀'] : !c.k.done ? ['kodle', '다음 게임으로 · 꼬들 →'] : ['rank', '🏆 순위 보기'];
    h += '<div class="btns"><button type="button" class="btn pri" data-go="' + next[0] + '">' + xe(next[1]) + '</button>' + (all ? '<button type="button" class="btn" data-brag="chal" title="몇 번 만에 풀었는지도 함께 공개돼요">' + xe('🏅 챌린지 자랑하기') + '</button>' : '') + '</div></div>';
    $('view').innerHTML = h;
  }
  /** 오늘 꼬들을 이 기기에서 끝냈는지 (꼬들 모듈이 저장해 둔 값) */
  function kodleDoneToday() { try { var v = JSON.parse(localStorage.getItem('jmb_kodle_v1' + ENV_SFX) || 'null'); return !!(v && v.day === kstDay() && v.done); } catch (e) { return false; } }
  /** 꼬맨틀 결과 카드 아래: 다음 코스(꼬들)로 이어가기 — 오늘 마친 사람 수만 보여 줌(결과 · 횟수는 비공개) */
  function kodleLink() {
    if (!KODLE_ON || (S.L && S.L.prac)) return '';
    var c = chalState(), n = c.ch && c.ch.cd;
    if (c.k.done) return '<div class="card next"><h3>🏆 오늘의 챌린지 완료!</h3><p>꼬맨틀 + 꼬들을 모두 끝냈어요.' + (c.ch && c.ch.st ? ' 🔥 연속 ' + c.ch.st + '일' : '') + '</p><div class="btns"><button type="button" class="btn pri" data-go="rank">' + xe('🏆 순위 보기') + '</button><button type="button" class="btn" data-go="chal">' + xe('🏁 챌린지 보기') + '</button></div></div>';
    return '<div class="card next"><h3>🏁 오늘의 챌린지 1/2 — STEP 01 완료!</h3><p>다음은 <b>STEP 02. 꼬들</b> — 글자와 위치를 추리해 정답을 맞히는 짧은 퍼즐이에요. 꼬들까지 끝내면 챌린지 완료!' + (n ? '<br>오늘 <b>' + n + '명</b>이 챌린지를 완료했어요 — 몇 번 만에 풀었는지는 아무도 몰라요 🙂' : '') + '</p><div class="btns"><button type="button" class="btn pri" data-go="kodle">' + xe('다음 게임으로 · 꼬들 →') + '</button><button type="button" class="btn" data-go="chal">' + xe('🏁 챌린지 보기') + '</button></div></div>';
  }  /** 오늘 꼬맨틀을 끝냈는지(맞힘 · 포기 모두) — 연습 중이어도 오늘 판 상태를 봄 */
  function semDoneToday() { var td = S.ctx === 'td' ? S : S.hold.td; if (!td) return false; var my = td.srv && td.srv.my; return !!((my && my.state === '완료') || (td.L && td.L.done)); }
  function kodleLocked() { return KODLE_ON && kstDay() >= KODLE_LOCK_FROM && !semDoneToday(); }
  /** 챌린지 탭 표시: 진행 상황(0/2 · 1/2 · 완료) */
  function chalTab() { if (!KODLE_ON) return; var b = $('tabChal'); if (b) { var n = chalState().n; b.innerHTML = '🏁 챌린지' + (n === 2 ? ' ✅' : ' <small class="cn">' + n + '/2</small>'); } }
  /** 꼬들 탭 표시: 잠겨 있으면 🔒 · 오늘 아직이면 주황 점 */
  function kodleTab() { if (!KODLE_ON) return; var b = $('tabKodle'); if (b) b.innerHTML = kodleLocked() ? '🔒 꼬들' : '🟩 꼬들' + (kodleDoneToday() ? '' : ' <span class="kdot" aria-label="오늘 아직">●</span>'); }
  function lockCard() {
    return '<div class="card next"><h3>🔒 꼬들은 꼬맨틀을 마친 뒤에 열려요</h3><p>오늘 코스는 <b>꼬맨틀 → 꼬들</b> 순서예요. 꼬맨틀을 끝내면(맞히든 포기하든) 꼬들이 열려요. 꼬들 연습은 언제든 할 수 있어요.</p><div class="btns"><button type="button" class="btn pri" data-go="play">' + xe('🔤 꼬맨틀 하러 가기') + '</button><button type="button" class="btn" data-go="prac" data-ks="kodle">' + xe('🌱 꼬들 연습') + '</button></div></div>';
  }
  function resultCard() {
    var L = S.L, r = L.res, n = L.n;
    if (L.prac) return '<div class="card res pop"><div class="em">' + (L.win ? '🎉' : '👀') + '</div><h2>' + (L.win ? '정답이에요!' : '정답은 이거였어요') + '</h2>' +
      '<p>' + (L.win ? '<b>' + esc(S.vocab[S.ans]) + '</b> — ' + n + '번 만에 맞혔어요' : '<b>' + esc(S.vocab[S.ans]) + '</b>') + ' <small>(연습 · 기록 없음)</small></p>' +
      '<div class="heat">' + L.g.slice(0, L.cnt).map(function (x) { return HEAT[tier(x.w)]; }).join('') + '</div>' +
      lvChips() + '<div class="btns"><button type="button" class="btn pri" id="pracNext">' + xe('🔁 다른 문제로 연습') + '</button><button type="button" class="btn" id="topbtn">가까운 단어 1000개 보기</button><button type="button" class="btn" id="pracBack">' + xe('🎯 오늘 문제로') + '</button></div></div>';
    var h = '<div class="card res pop"><div class="em">' + (L.win ? '🎉' : '😵') + '</div><h2>' + (L.win ? '정답이에요!' : '아쉬워요') + '</h2>' +
      '<p>' + (L.win ? '<b>' + esc(S.vocab[S.ans]) + '</b> — ' + n + '번 만에 맞혔어요' + (L.hints ? ' · 힌트 ' + L.hints : '') : '정답은 <b>' + esc(S.vocab[S.ans]) + '</b> 였어요') + '</p>';
    if (S.busy && !r) {   // (1.14.0) 서버 확인을 기다리지 않고 결과부터 보여 줌 — 점수는 '잠정'(기본 점수 − 힌트), 서버가 확정하면 연속 보너스까지 반영해 바뀜
      var base = L.win ? Math.max(0, BASE_PTS - n - HINT_COST * (L.hints || 0)) : 0;
      h += L.win ? '<div class="pts">+' + base + '점 <small>(잠정)</small></div><div class="parts"><span class="chip">기본 <b>' + Math.max(0, BASE_PTS - n) + '</b></span>' + (L.hints ? '<span class="chip">힌트 <b>-' + HINT_COST * L.hints + '</b></span>' : '') + '<span class="chip">기록 확인 중…</span></div>'
        : '<p class="hint">기록 확인 중…</p>';
    } else if (r && !r.error) {
      if (r.win) {
        h += '<div class="pts">+' + r.points + '점</div><div class="parts">' +
          '<span class="chip">기본 <b>' + r.parts.base + '</b></span>' + '<span class="chip">오늘 ' + r.order + '번째 정답</span>' +
          (r.parts.streak ? '<span class="chip hot">🔥 ' + r.streak + '일 연속 <b>+' + r.parts.streak + '</b></span>' : '') + (r.parts.hint ? '<span class="chip">힌트 <b>' + r.parts.hint + '</b></span>' : '') + '<span class="chip">⏱ ' + mmss(r.sec) + '</span></div>';
      } else h += '<p class="hint">0점 · 연속 기록이 끊겼어요. 내일 다시 도전!</p>';
    } else if (r && r.error) h += '<div class="note bad" style="margin-top:10px">기록하지 못했어요: ' + esc(r.error) + '</div>';
    else if (L.pend) h += '<div class="note warn" style="margin-top:10px">기록을 아직 못 보냈어요. <button type="button" class="btn sm" id="retry">다시 보내기</button></div>';
    else if (!L.rec) h += '<p class="hint">연습이라 기록은 없어요.</p>';
    h += '<div class="heat">' + L.g.slice(0, L.cnt).map(function (x) { return HEAT[tier(x.w)]; }).join('') + '</div>' +
      semTagsHTML() + '<div class="btns"><button type="button" class="btn pri" id="share">' + xe('📤 카톡으로 공유') + '</button>' + (L.win ? '<button type="button" class="btn" id="brag" title="몇 번 만에 풀었는지도 함께 공개돼요">' + xe('🏅 자랑하기') + '</button>' : '') + '<button type="button" class="btn" id="topbtn">가까운 단어 1000개 보기</button>' +
      (S.nick ? '<button type="button" class="btn" id="goRank">' + xe('🏆 순위 보기') + '</button>' : '') + '</div></div>';
    return h;
  }
  function rows() {
    var L = S.L, list = L.g.map(function (x, i) { return { w: x.w, n: i + 1, s: simOf(x.w), r: rankIn(x.w), fr: rankIn(x.w) ? 0 : farRank(x.w), h: x.h, t: tier(x.w), win: S.idx.get(x.w) === S.ans }; });
    if (S.xl) return xlGrid(list);   // (1.10.0) 엑셀 모드는 진짜 격자
    var last = S.lastW ? list.filter(function (o) { return o.w === S.lastW; })[0] : null, rn = 1;
    function tr(o, cls) {
      var pct = Math.max(0, Math.min(100, o.s / (S.scale.r1 || 1) * 100));
      var rk = o.win ? '정답!' : o.r ? '<div class="rbar"><em>' + o.r + '</em><i><b style="width:' + Math.max(4, (TOPN - o.r + 1) / TOPN * 100) + '%"></b></i></div>' : '<span class="sub">' + (o.fr ? '약 ' + fmtN(o.fr) + '위' : S.xl ? '-' : '1000위 밖') + '</span>';
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
    if ($('pList')) return;
    if (S.xl) { $('view').innerHTML = '<div id="pTop"></div><div id="pTools"></div><div id="pList"></div>'; return; }   // 엑셀 모드: 입력창은 수식 입력줄(제목줄 아래)에 있음
    $('view').innerHTML = '<div id="pTop"></div><div class="stk" id="stk"><form class="gform" id="gf" autocomplete="off"><input id="gw" type="text" inputmode="text" enterkeyhint="send" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="20" lang="ko" aria-label="추측할 단어"><button type="submit" class="btn pri">' + (S.xl ? '입력' : '추측') + '</button></form><div class="fb" id="fb" aria-live="polite"></div></div><div class="tools" id="pTools"></div><div id="pList"></div>';
  }
  function renderPlay() {
    var L = S.L;
    if (!S.srv || !S.srv.ready) {
      $('view').innerHTML = '<div class="card empty">📭<br><b>오늘 문제가 아직 준비되지 않았어요</b><br><small>운영진에게 알려 주세요 (시트 ‘꼬맨틀사전’ 에 오늘 날짜가 없어요)</small></div>'; return;
    }
    ensurePlayFrame();
    $('pTop').innerHTML = S.xl ? (L.prac ? pracCard() : statusNote()) + (L.done ? resultCard() + kodleLink() : '') : (L.prac ? pracCard() : metaCard() + statusNote()) + (L.done ? resultCard() + kodleLink() : '');
    var inp = $('gw'); inp.placeholder = S.xl ? (L.done ? '더 입력해 볼까요?' : '단어 입력') : L.done ? '더 추측해 볼까요? (연습)' : '단어를 입력하세요';
    var fb = S.fb; $('fb').className = 'fb t' + (fb ? fb.tr : 0);
    $('fb').innerHTML = fb ? (S.xl ? '' : TIER[fb.tr].e + ' ') + '‘' + esc(fb.w) + '’ ' + TIER[fb.tr].t + (fb.r ? ' (' + fb.r + '위)' : '') : (S.xl ? '준비' : '');
    $('pTools').innerHTML = S.xl ? '' : hintBtn() + (L.done ? '' : '<button type="button" class="btn" id="giveBtn">' + xe(L.prac ? '👀 정답 보기' : '🏳️ 포기') + '</button>') + (L.prac && !L.done ? '<button type="button" class="btn" id="pracNext">' + xe('🔁 다른 문제') + '</button>' : '');
    $('pList').innerHTML = S.xl ? rows() : L.g.length ? '<div class="card" style="padding:8px 10px">' + rows() + '</div>'   // 엑셀 모드는 추측이 없어도 빈 격자를 보여 줌
      : (!L.done ? '<p class="hint">처음 입력해 볼 단어는 뭐든 괜찮아요. 예: <b>사람</b> · <b>음식</b> · <b>하늘</b> — 점수가 높은 쪽으로 따라가 보세요!</p>' : '');
    xlState();
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
  /** (1.24.0) 연습 문제 은행 난이도: 쉬움 · 보통 · 어려움 · 무작위 (고른 값 · 푼 문제 id 는 이 기기에 기억) */
  var PLV = ['쉬움', '보통', '어려움', ''], PLV_KEY = 'jmb_sem_plv' + ENV_SFX, PSEEN_KEY = 'jmb_sem_pseen' + ENV_SFX;
  function pLv() { if (S.pLv == null) { try { S.pLv = localStorage.getItem(PLV_KEY) || ''; } catch (e) { S.pLv = ''; } } return S.pLv; }
  function pSeen() { if (!S.pSeen) { try { S.pSeen = JSON.parse(localStorage.getItem(PSEEN_KEY) || '[]'); } catch (e) { S.pSeen = []; } } return S.pSeen; }
  function lvChips() {
    return '<div class="seg sm plv" role="group" aria-label="난이도">' + PLV.map(function (v) { return '<button type="button" data-plv="' + v + '" class="' + (pLv() === v ? 'on' : '') + '">' + (v || '무작위') + '</button>'; }).join('') + '</div>';
  }
  function pracCard() {
    var s = S.srv, c = coach();
    if (S.xl) return c ? '<div class="xnote"><b>메모:</b> ' + c + '</div>' : '';   // 엑셀 모드: 셀 메모(노란 말풍선)로
    return '<div class="card"><div class="head"><div class="no">🌱 연습<small> · ' + (s.bank ? (s.lv || '') + ' 문제' : s.no + '번째 문제 (지난 문제)') + '</small></div><div class="meta">기록 · 점수 · 순위에 안 들어가요<br>힌트는 마음껏 써도 돼요</div></div>' +
      '<div class="scale"><div><b>' + f2(S.scale.r1) + '</b><small>1위 유사도</small></div><div><b>' + f2(S.scale.r10) + '</b><small>10위</small></div><div><b>' + f2(S.scale.rN) + '</b><small>1000위</small></div></div>' +
      (c ? '<div class="note ok coach">' + c + '</div>' : '') + '</div>';
  }
  function renderPrac() {
    if (hasPrac()) { if (S.ctx !== 'pz') useCtx('pz'); return renderPlay(); }
    $('view').innerHTML = '<div class="card gate"><div class="em">🌱</div><h2>연습해 볼까요?</h2>' +
      '<p>난이도별로 골라 둔 문제(또는 지난 문제)로 <b>기록 없이</b> 연습해요. 문제는 <b>무작위</b>로 나와요.<br>힌트는 <b>처음부터 마음껏</b> 쓸 수 있고, 막히면 정답도 볼 수 있어요.</p>' +
      '<ul class="how"><li>아무 단어나 입력하면 비밀 단어와 <b>뜻이 얼마나 가까운지</b> 숫자로 알려 줘요</li><li><b>숫자가 높은 쪽</b>으로 따라가세요. 1000위 안에 들면 순위도 보여요</li><li>도우미 글이 다음에 해 볼 일을 알려 줘요</li></ul>' +
      lvChips() + '<div class="btns"><button type="button" class="btn pri" id="pracStart">🌱 연습 시작</button></div></div>';
  }
  function startPrac() {
    if (S.busy || S.startP) return toast('기록 중이에요. 잠시 뒤에 다시 눌러 주세요', true);
    if (S.pBusy) return;
    S.pBusy = true; toast('연습 문제를 불러오는 중…');
    // (1.8.1) 서버가 사전에 실제로 있는 지난 날짜 중에서 k번째를 골라 줌 (예전에는 1~30일 전을 무작위로 물어 대부분 '없음'이라 실패했음)
    if (S.pK == null) S.pK = Math.floor(Math.random() * 1000);
    var td0 = S.ctx === 'td' ? S.srv : S.hold.td.srv;   // 오늘 판과 같은 표 형식 · 단어 목록으로 (목록이 다르면 연습할 수 없음)
    var kk = S.pK++, f2ok = !!(td0 && td0.fmt === 2);
    // (1.24.0) 은행(난이도별 · 무작위, 최근에 푼 문제 제외) 먼저 — 비었거나 실패하면 예전 방식(지난 문제)
    (f2ok ? api('semPracticeBank', [token(), pLv(), pSeen().slice(-150), 2]).catch(function () { return null; }) : Promise.resolve(null))
      .then(function (br) { return br && br.ready ? br : (EDGE && f2ok ? edgeCall('practice', { k: kk }).catch(function () { return null; }) : Promise.resolve(null)); })
      .then(function (er) { return er && er.ready ? er : api('semPractice', [token(), kk, f2ok ? 2 : 0]); })
      .then(function (r) { return r && r.bank && td0 && td0.vh && r.vh && td0.vh !== r.vh ? api('semPractice', [token(), kk, f2ok ? 2 : 0]) : r; })   // (1.26.1) 은행 문제가 다른 단어 목록 기준이면 오류 대신 지난 문제로
      .then(function (r) {
      if (r.bank && r.id) { var sn = pSeen(); sn.push(r.id); if (sn.length > 300) sn.splice(0, sn.length - 300); try { localStorage.setItem(PSEEN_KEY, JSON.stringify(sn)); } catch (e) {} }
      if (!r || !r.ready) throw new Error('아직 연습할 지난 문제가 없어요. 내일부터 하루에 하나씩 늘어나요');
      var td = S.ctx === 'td' ? snap() : S.hold.td;   // 오늘 판 상태는 그대로 보관
      if (td.srv.vh && r.vh && td.srv.vh !== r.vh) throw new Error('단어 목록이 달라서 연습할 수 없어요');
      if (S.ctx === 'pz') load(td);
      prepareTable(r); S.srv = r; S.L = freshPrac(r); S.lastW = ''; S.fb = null; S.focused = false; S.scrollNew = false; S.scrollRes = false;
      S.hold.td = td; S.hold.pz = snap(); S.ctx = 'pz'; S.pBusy = false; S.view = 'prac';
      render(); updateTop();
      if (!r.bank && r.count === 1) toast('지금은 연습 문제가 1개예요. 하루에 하나씩 늘어나요');
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
    return api('semRank', [token()]).then(function (r) { S.rank = r; r.at = Date.now(); saveRank(r); }, function (e) { S.rank = null; toast(e.message, true); });
  }
  /* (1.14.0) 순위 · 내 기록: 기기에 저장해 둔 마지막 내용을 곧바로 보여 주고(서버 1.5초를 기다리지 않음), 뒤에서 새로 받아 바꿈 */
  var rkBusy = false, hsBusy = false;
  function saveRank(r) { try { lsSet(LS.rkc, JSON.stringify({ nick: S.nick, r: r })); } catch (e) {} }
  function refreshRank() {
    if (rkBusy) return; rkBusy = true;
    api('semRank', [token()]).then(function (r) { r.at = Date.now(); S.rank = r; saveRank(r); rkBusy = false; if (S.view === 'rank') renderRank(); }, function () { rkBusy = false; });
  }
  function saveHist(r) { try { lsSet(LS.hsc, JSON.stringify({ nick: S.nick, r: r })); } catch (e) {} }
  function refreshHist() {
    if (hsBusy) return; hsBusy = true;
    api('semHistory', [token()]).then(function (r) { S.hist = r; S.histAt = Date.now(); saveHist(r); hsBusy = false; if (S.view === 'hist') renderHist(); }, function () { hsBusy = false; });
  }
  function rkRows(list, kind) {
    if (!list || !list.length) return kind === 'rate' ? '<div class="empty">아직 레이팅 순위에 오른 사람이 없어요.<br>하루에 두 명 이상 풀고, 3일 이상 참여하면 올라와요! 📈</div>' : '<div class="empty">아직 기록이 없어요.<br>첫 번째 주인공이 되어 보세요! 🏁</div>';
    return list.map(function (o) {
      var me = S.nick && o.nick === S.nick, sub, v;
      if (kind === 'today') {   // (1.20.0) 꼬맨틀 + 꼬들 오늘 점수 합. 포기 · 실패한 사람도 한 게임이라도 했으면 나옴
        var ps = []; if (o.s) ps.push('🔤 ' + (o.s === '정답' ? (o.h ? '힌트 ' + o.h + '개' : '힌트 없이') : '포기')); if (KODLE_ON && o.k) ps.push('🟩 ' + (o.k === '정답' ? '성공' : '실패'));
        sub = ps.join(' · ') || '참여'; v = '+' + (o.pts || 0) + '점'; }
      else if (kind === 'streak') { sub = '최고 ' + o.best + '일'; v = '🔥 ' + o.v + '일'; }
      else if (kind === 'rate') { var T = tierOf(o.v); sub = o.games + '일 참여 · 최근 ' + (o.delta > 0 ? '+' : '') + o.delta; v = T.e + ' ' + o.v + '<small>' + T.n + '</small>'; }
      else { sub = '정답 ' + o.solves + '회'; v = o.v + '점'; }
      return '<div class="rk tap' + (me ? ' me' : '') + '" data-nick="' + esc(o.nick) + '"><span class="n' + (o.rank <= 3 ? ' m' + o.rank : '') + '">' + (o.rank === 1 ? '🥇' : o.rank === 2 ? '🥈' : o.rank === 3 ? '🥉' : o.rank) + '</span>' + av(o.nick, 32) +
        '<span class="t"><b>' + esc(o.nick) + '</b><small>' + esc(sub) + '</small></span><span class="v">' + v + '</span></div>';
    }).join('');
  }
  /** 현황 표: 오늘 꼬맨틀 · 꼬들 결과 + 오늘을 뺀 성공 횟수 */
  function rkBoard(R) {
    var L = R.board || [], mark = function (r) { return r === '정답' ? '<span class="bk ok">✅</span>' : r ? '<span class="bk no">❌</span>' : '<span class="bk">–</span>'; };
    if (!L.length) return '<div class="empty">아직 기록이 없어요</div>';
    return '<div class="tablewrap"><table class="stt"><thead><tr><th class="l">닉네임</th><th>오늘<br>꼬맨틀</th>' + (KODLE_ON ? '<th>오늘<br>꼬들</th>' : '') + '<th>꼬맨틀<br>성공</th>' + (KODLE_ON ? '<th>꼬들<br>성공</th>' : '') + '</tr></thead><tbody>' +
      L.map(function (o) { return '<tr' + (o.nick === R.me ? ' class="me"' : '') + '><td class="l">' + esc(o.nick) + (o.nick === R.me ? ' <small>(나)</small>' : '') + '</td><td>' + mark(o.ts) + '</td>' + (KODLE_ON ? '<td>' + mark(o.tk) + '</td>' : '') + '<td class="num">' + o.sx + '</td>' + (KODLE_ON ? '<td class="num">' + o.kx + '</td>' : '') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  /** 내 레이팅 · 연속 · 배지 카드 — 순위 탭이 아니라 '내 기록' 탭 맨 위에 (순위 탭은 순수 순위만) */
  function meCard(R) {
    var me = R.mine, h = '';
    if (me) {
      var have = {}; (me.badges || []).forEach(function (b) { have[b.id] = 1; });
      h += '<div class="card"><div class="me-top">' + av(R.me, 48) + '<div class="t"><b>' + esc(R.me) + '</b><small>' + (me.streak ? '🔥 ' + me.streak + '일 연속 정답 중' : '오늘 맞히면 연속 기록 시작!') + '</small></div></div>' +
        '<div class="stats"><div><b>' + tierOf(me.rating || 1500).e + ' ' + (me.rating || 1500) + '</b><small>' + ((me.rGames || 0) < 3 ? '레이팅(배치 중)' : '레이팅') + '</small></div><div><b>' + me.week + '</b><small>이번 주</small></div><div><b>' + me.season + '</b><small>시즌</small></div><div><b>' + me.solves + '</b><small>정답</small></div></div>' +
        '<div class="hint" style="margin-top:6px">평균 추측 ' + (me.avg || '-') + '번 · 누적 ' + me.points + '점 · 최고 연속 ' + me.bestStreak + '일 · 최소 ' + (me.best || '-') + '번' + (me.firsts ? ' · 선두 ' + me.firsts + '번' : '') + '</div>' +
        '<div class="badges">' + BADGES.map(function (b) { return '<div class="badge' + (have[b.id] ? '' : ' off') + '" title="' + esc(b.d) + '"><div class="e">' + b.e + '</div><b>' + esc(b.n) + '</b><small>' + esc(b.d) + '</small></div>'; }).join('') + '</div></div>';
    } else h += '<div class="note warn">🔒 로그인하면 내 순위와 배지를 볼 수 있어요.<br><button type="button" class="btn sm" id="login">카카오 로그인</button></div>';
    return h;
  }
  function renderRank() {
    var R = S.rank;
    if (!R) { var rc = lsJSON(LS.rkc); if (rc && rc.r && rc.nick === S.nick) { S.rank = R = rc.r; R.at = 0; refreshRank(); } }   // 저장해 둔 순위를 먼저 보여 줌
    if (!R) { loadRank().then(function () { if (S.view === 'rank') { if (S.rank) renderRank(); else $('view').innerHTML = '<div class="card empty">순위를 불러오지 못했어요.<br><button type="button" class="btn sm" id="rkRetry">다시 시도</button></div>'; } }); return; }
    var h = '';
    var tabs = [['today', '오늘'], ['board', '현황'], ['week', '이번 주'], ['season', '시즌'], ['streak', '연속'], ['rate', '레이팅']];
    var tab = S.rkTab, list = tab === 'today' ? R.today : tab === 'week' ? R.weekly : tab === 'season' ? R.seasonal : tab === 'rate' ? R.rated : R.streaks;
    if (tab === 'board') {   // (1.18.0) 현황: 사람마다 오늘 꼬맨틀 · 꼬들 성공 여부 + 오늘을 뺀 누적 성공 횟수 (추측 횟수 · 시간은 공개 안 함)
      h += '<div class="seg sm" id="rkTabs">' + tabs.map(function (t) { return '<button type="button" data-t="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' +
        '<div class="card"><h3>📋 오늘 현황 <small>' + R.day + ' · 성공 횟수는 오늘 제외</small></h3>' + rkBoard(R) + '</div>' +
        '<p class="hint">✅ 성공 · ❌ 아쉽게 실패 · – 아직. 몇 번 만에 풀었는지 · 걸린 시간은 나만 볼 수 있어요. 순위는 1분마다 갱신돼요.</p>';
      $('view').innerHTML = h; return;
    }
    var title = tab === 'today' ? '오늘의 참여자 <small>' + R.day + ' · 오늘 점수 순 (꼬맨틀 + 꼬들)</small>' : tab === 'week' ? '이번 주 포인트 <small>' + R.week + '(월)~</small>' : tab === 'season' ? '시즌 포인트 <small>' + R.season + '</small>' : tab === 'rate' ? '레이팅 <small>' + R.season + ' · 3일 이상 참여</small>' : '연속 정답 <small>지금 이어가는 중</small>';
    h += '<div class="seg sm" id="rkTabs">' + tabs.map(function (t) { return '<button type="button" data-t="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div class="card"><h3>' + title + '</h3>' + rkRows(list, tab === 'week' || tab === 'season' ? 'pts' : tab) +
      (tab === 'today' ? '<div class="hint">오늘 꼬맨틀 ' + R.solvedToday + '명 정답 · 오늘 한 사람 ' + (R.today || []).length + '명 · 누적 참여 회원 ' + (typeof R.total === 'number' ? R.total : typeof R.people === 'number' ? R.people : Object.keys(R.people || {}).length) + '명</div>' : '') +
      (tab === 'rate' ? '<div class="hint">그 날 푼 사람끼리 추측 횟수를 겨루는 점수 (처음 1500점). 오늘 결과는 잠정이라 사람이 더 풀면 조금 바뀌어요.</div>' : '') + '</div>' + pendingCard(R) +
      '<p class="hint">순위는 1분마다 갱신돼요. 시즌은 분기(1 · 4 · 7 · 10월)마다 새로 시작해요.</p>';
    $('view').innerHTML = h;
  }

  /* ---------- 내 기록 (지난 날 추측 · 정답) ---------- */
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  function dayLabel(d) { var p = String(d).split('-'); return p.length === 3 ? (+p[1]) + '/' + (+p[2]) + '(' + WD[new Date(+p[0], +p[1] - 1, +p[2]).getDay()] + ')' : d; }
  function renderHist() {
    if (!S.nick) { $('view').innerHTML = '<div class="note warn">🔒 로그인하면 지난 기록과 내가 입력한 단어를 다시 볼 수 있어요.<br><button type="button" class="btn sm" id="login">카카오 로그인</button></div>'; return; }
    if (!S.hist) { var hc = lsJSON(LS.hsc); if (hc && hc.r && hc.nick === S.nick) { S.hist = hc.r; S.histAt = 0; refreshHist(); } }   // 저장해 둔 기록을 먼저 보여 줌
    if (!S.hist) {
      $('view').innerHTML = '<div class="empty">⏳ 내 기록을 불러오는 중…</div>';
      api('semHistory', [token()]).then(function (r) { S.hist = r; S.histAt = Date.now(); saveHist(r); if (S.view === 'hist') renderHist(); },
        function (e) { if (S.view === 'hist') $('view').innerHTML = '<div class="card empty">기록을 불러오지 못했어요.<br><small>' + esc(e.message) + '</small><br><button type="button" class="btn sm" id="histRetry" style="margin-top:8px">다시 시도</button></div>'; });
      return;
    }
    if (!S.rank) {   // 내 카드에 쓸 순위 데이터 (저장해 둔 것 먼저, 없으면 한 번 불러옴)
      var rc2 = lsJSON(LS.rkc); if (rc2 && rc2.r && rc2.nick === S.nick) { S.rank = rc2.r; S.rank.at = 0; }
      else if (!S.rkTried) { S.rkTried = true; loadRank().then(function () { if (S.view === 'hist') renderHist(); }, function () {}); }
    }
    var list = S.hist, wins = list.filter(function (o) { return o.result === '정답'; }), sumG = 0, sumP = 0;
    wins.forEach(function (o) { sumG += o.guesses; sumP += o.points; });
    var h = (S.rank ? meCard(S.rank) : '') + '<div class="card"><h3>📜 내 기록 <small>최근 ' + list.length + '판</small></h3><div class="stats"><div><b>' + list.length + '</b><small>도전</small></div><div><b>' + wins.length + '</b><small>정답</small></div><div><b>' + (wins.length ? Math.round(sumG / wins.length * 10) / 10 : '-') + '</b><small>평균 추측</small></div><div><b>' + sumP + '</b><small>점수</small></div></div></div>';
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
    top.forEach(function (ix, r) { var w = S.vocab[ix]; if (BLOCK[w]) return; h += '<div class="' + (have && have[w] ? 'g' : '') + '"><span class="n">' + (r + 1) + '</span><span class="w">' + esc(w) + '</span><span class="s">' + f2(sims[ix]) + '</span></div>'; });
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
    var yf2 = !!(S.srv && S.srv.fmt === 2);
    (EDGE && yf2 ? edgeCall('yesterday').catch(function () { return null; }) : Promise.resolve(null))
      .then(function (er) { return er && er.ready ? er : api('semYesterday', [token(), yf2 ? 2 : 0]); }).then(function (r) {
      if (!r || !r.ready) return toast('어제 문제가 없어요', true);
      if (S.srv.vh && r.vh && S.srv.vh !== r.vh) return toast('단어 목록이 달라서 볼 수 없어요', true);
      var d = decodeSrv(r), p = pickTop(d.sims, d.exact);
      S.yd = { answer: S.vocab[p.ans] || r.answer, top: p.top, sims: d.sims };
      showTop('어제 정답과 가까운 단어 ' + TOPN + '개', S.yd.answer, S.yd.top, d.sims, null);
    }, function (e) { toast(e.message, true); });
  }

  /* ================= 이벤트 ================= */
  var lastAct = {};
  function guard(k, ms) { var n = Date.now(); if (lastAct[k] && n - lastAct[k] < (ms || 500)) return false; lastAct[k] = n; return true; }   // 더블 탭 · 연타로 두 번 처리되지 않게
  document.addEventListener('submit', function (e) { if (e.target.id === 'gf') { e.preventDefault(); var inp = $('gw'), v = inp.value; inp.value = ''; guess(v); } });
  document.addEventListener('click', function (e) {
    if (Date.now() - modalAt < 350) return;   // 창이 막 열리거나 닫힌 직후의 겹친 탭(더블탭의 두 번째)은 무시
    var xc = S.xl && e.target.closest('td[data-rc]');   // 엑셀 모드: 셀을 누르면 그 칸이 활성 셀 (이름 상자 · 머리글 강조가 따라감)
    if (xc) { var p = xc.getAttribute('data-rc').split(','); S.sel = { r: +p[0], c: +p[1] }; S.scrollNew = false; renderPlay(); return; }
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
      case 'logoutBtn': ask('로그아웃할까요?', '잠만보 앱도 함께 로그아웃돼요.', '로그아웃', true).then(function (ok) { if (ok) { lsSet(LS.auth, null); lsSet(LS.rkc, null); lsSet(LS.hsc, null); dayCacheClear(); location.reload(); } }); return;
      case 'hintBtn': return hint();
      case 'giveBtn': return giveUp();
      case 'share': return share();
      case 'brag': return share(bragText());
      case 'topbtn': return topList();
      case 'retry': return retryPending();
      case 'goRank': return go('rank');
      case 'pracStart': case 'pracNext': case 'rbNext': return startPrac();
      case 'rbHint': return hint();
      case 'rbGive': return giveUp();
      case 'rbSort': S.sort = S.sort === 'sim' ? 'order' : 'sim'; lsSet(LS.sort, S.sort); S.scrollNew = false; renderPlay(); return;   // 엑셀 모드 리본의 정렬 버튼
      case 'pracBack': return go('play');
      case 'rkRetry': S.rank = null; return renderRank();
      case 'histRetry': S.hist = null; return renderHist();
    }
    if (t.parentNode && t.parentNode.id === 'rkTabs') { S.rkTab = t.getAttribute('data-t'); lsSet(LS.tab, S.rkTab); renderRank(); }
  });
  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) go(b.getAttribute('data-v')); });
  $('view').addEventListener('click', function (e) {
    var k = e.target.closest('[data-ks]');   // 연습 · 내 기록의 '꼬맨틀 | 꼬들' 선택, 또는 '꼬들 연습' 으로 가는 버튼
    if (k) { var tv = k.hasAttribute('data-go') ? k.getAttribute('data-go') : S.view; S.kSub[tv] = k.getAttribute('data-ks'); if (tv !== S.view) return go(tv); S.xAddr = ''; render(); return; }
    var pl = e.target.closest('[data-plv]'); if (pl) { S.pLv = pl.getAttribute('data-plv'); try { localStorage.setItem(PLV_KEY, S.pLv); } catch (x) {} var nb = pl.parentNode.querySelectorAll('button'); for (var q = 0; q < nb.length; q++) nb[q].classList.toggle('on', nb[q] === pl); return; }
    var br = e.target.closest('[data-brag]'); if (br) return share(chalBrag());   // 챌린지 자랑하기
    var b = e.target.closest('[data-go]'); if (b) go(b.getAttribute('data-go'));   // 결과 카드의 '꼬들 하러 가기' · '순위' 등
  });
  /* (1.16.0) 꼬들: 위 탭 = 꼬맨틀 · 꼬들 · 연습 · 순위 · 내 기록. 연습 · 내 기록은 안에서 '꼬맨틀 | 꼬들' 을 고름 (꼬들은 한 화면에 다 들어오게) */
  if (KODLE_ON) {
    $('tabKodle').hidden = false; $('tabChal').hidden = false; $('tabs').querySelector('[data-v="play"]').textContent = '🔤 꼬맨틀';
    setTimeout(function () { (window.requestIdleCallback || setTimeout)(function () { loadKodle().catch(function () {}); }); }, 3000);   // 한가할 때 꼬들 코드를 미리 받아 둠 → 탭을 누르면 바로 열림
    var _rp = renderPrac, _rh = renderHist;
    // (1.26.1) 연습 판은 입력할 때마다 일부만 다시 그려서 선택 줄(꼬맨틀 연습 | 꼬들 연습)이 계속 하나씩 늘던 것 — 붙이기 전에 있던 것을 지움
    function kSegSet(v) { var old = $('view').querySelectorAll('#kSeg'); for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]); $('view').insertAdjacentHTML('afterbegin', segHTML(v)); }
    renderPrac = function () { if (S.kSub.prac === 'kodle') renderKodle('prac'); else { _rp(); kSegSet('prac'); } };
    renderHist = function () { if (S.kSub.hist === 'kodle') renderKodle('hist'); else { _rh(); kSegSet('hist'); } };
  }
  /* 화면 이동과 뒤로가기: 오늘 문제 → 순위 · 내 기록은 한 칸 쌓아서(뒤로가기 = 오늘 문제), 순위 ↔ 내 기록은 갈아끼움. 창(모달)은 한 칸 쌓여서 뒤로가기로 닫힘 */
  function go(v) {
    S.homeSet = true;   // 사용자가 직접 고른 화면은 '첫 화면 = 챌린지' 가 덮어쓰지 않음
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
  $('back').onclick = function () { if (modalOpen) return closeModal(); var home = KODLE_ON ? 'chal' : 'play'; if (S.view !== home) return go(home); location.href = ROOT; };
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
  /* (1.12.0) 오늘 표를 기기(Cache Storage)에 저장해 두고, 재방문은 서버를 기다리지 않고 바로 시작 → 서버에는 가벼운 확인(내 기록 · 통계)만 뒤에서 보내고 합침.
   * 저장된 표가 없는 하루 첫 방문은 입력창을 바로 열어 두고, 먼저 친 단어는 대기열(S.queue)에 넣었다가 표가 오면 계산. 표 한 개 = 하루 약 77KB */
  var DCACHE = 'jmb_sem_day' + ENV_SFX;
  function dayCacheGet() {
    if (!window.caches) return Promise.resolve(null);
    return caches.open(DCACHE).then(function (c) { return c.match('today'); }).then(function (r) { return r ? r.json() : null; })
      .then(function (o) { return o && o.table && o.day ? o : null; }, function () { return null; });
  }
  function dayCachePut(srv) {
    if (!window.caches || !srv || !srv.table || !srv.day) return;
    try { caches.open(DCACHE).then(function (c) { return c.put('today', new Response(JSON.stringify({ day: srv.day, no: srv.no, n: srv.n, vh: srv.vh, fmt: srv.fmt || 1, table: srv.table, top: srv.top || '' }))); }).catch(function () {}); } catch (e) {}
  }
  function dayCacheClear() { try { if (window.caches) caches.delete(DCACHE); } catch (e) {} }
  function flushQueue() {   // 불러오는 동안 먼저 입력한 단어를 차례로 계산
    var q = S.queue.splice(0, S.queue.length);
    q.forEach(function (w) { guess(w); });
  }
  /** 저장된 오늘 표로 곧바로 시작 */
  function startFast(vocab, c, nick) {
    S.srv = { ready: true, day: c.day, no: c.no, n: c.n, vh: c.vh, fmt: c.fmt, table: c.table, top: c.top, me: nick, yesterday: '', solvedToday: 0, people: 0, my: null, stats: null };
    S.nick = nick; prepare(vocab, S.srv);
    var L = lsJSON(LS.play);
    if (!L || L.day !== S.srv.day || L.vh !== S.srv.vh) { L = freshLocal(); L.rec = true; }   // 기록 여부는 서버 확인 뒤 바로잡음 (먼저 풀기 시작해도 서버가 '이미 했어요' 면 연습으로 전환)
    S.L = L; saveLocal(); S.optimistic = true; S.loading = false;
    if (lsGet(LS.help) !== '1') setTimeout(help, 400);
    render(); flushQueue();
    return true;
  }
  /** 서버의 가벼운 확인 결과를 지금 판에 합침 */
  function reconcile(r) {
    S.optimistic = false;
    if (!r || r.loginRequired || !r.me) { dayCacheClear(); S.nick = ''; return renderGate(!!session()); }   // 토큰이 만료됐거나 닉네임이 연결되지 않음
    if (!r.ready) { render(); return; }
    if (r.day !== S.srv.day) { dayCacheClear(); return bootFull(); }   // 날짜가 바뀜 → 새 표 (진행 중 추측은 판마다 따로 저장돼 있음)
    var s = S.srv; s.my = r.my; s.kd = r.kd; s.stats = r.stats; s.solvedToday = r.solvedToday; s.yesterday = r.yesterday; s.me = r.me; s.people = r.people; S.nick = r.me;
    var L = S.L, my = r.my;
    mergeServer(L, my);
    if (!L.done && L.g.length === 0) L.rec = !!(S.nick && my && my.state !== '완료');
    else if (S.nick && my && my.state === '완료' && L.rec && !L.res) L.rec = false;   // 다른 기기에서 이미 기록함
    if (L.rec && my && my.state === '진행중' && !L.nonce) ensureStart();
    saveLocal(); render();
    if (L.pend) retryPending();
  }
  function bootFull() {
    S.loading = true; S.optimistic = false;
    // 불러오는 동안에도 입력할 수 있게: 엑셀 모드는 빈 격자 + 안내를 보여 주고 입력창을 열어 둠 (먼저 친 단어는 대기열)
    $('view').innerHTML = S.xl ? '<div class="xnote">오늘 문제를 불러오는 중이에요… 단어는 먼저 입력해 두세요 — 도착하면 바로 계산돼요</div>' + xlGrid([])
      : '<div class="empty">⏳ 오늘 문제를 불러오는 중…<br><small>처음엔 단어 목록(약 450KB)을 받느라 조금 걸려요</small></div>';
    xlState();
    if (!EDGE) return bootGas();
    return edgeStart().then(function (done) { return done ? undefined : bootGas(); });   // 엣지에서 못 받았으면 예전 경로
  }
  /** 엣지에서 오늘 표를 받아 바로 시작 (표 ≈ 0.1초대). 시작했으면 true — 서버 확인(내 기록 · 통계)은 뒤에서 Apps Script 로 */
  function edgeStart() {
    return Promise.all([loadVocab(V2).catch(function () { return null; }), edgeCall('today').catch(function () { return null; })]).then(function (res) {
      var vocab = res[0], e = res[1];
      if (!e || !e.ready || e.fmt !== 2 || !e.table || !e.top) return false;
      var p = vocab && vocab.hash === e.vh ? Promise.resolve(vocab) : loadVocab(V2, true).catch(function () { return null; });   // 목록이 다르면 새로 받음
      return p.then(function (v) {
        var nick = e.me || myNick();
        if (!v || v.hash !== e.vh || !nick) return false;
        dayCachePut(e); startFast(v, e, nick);
        gasLight();
        return true;
      });
    }).catch(function () { return false; });
  }
  /** 서버(Apps Script)의 가벼운 확인 — 내 기록 · 통계 · 어제 정답을 지금 판에 합침 */
  function gasLight() {
    return api('semToday', [token(), 2, 1]).then(reconcile, function (e) {
      S.optimistic = false;
      if (/로그인이 만료/.test(e.message)) { dayCacheClear(); return renderGate(false); }
      toast('서버 확인이 늦어요. 지금은 저장된 문제로 풀 수 있어요', true);   // 인터넷이 불안해도 풀 수는 있음 (기록은 연결되면)
    });
  }
  function bootGas() {
    // 새 단어 목록(V2)과 오늘 표(형식 2 요청)를 동시에 받음. 서버가 옛 형식으로 답하면(새 사전이 아직 없음) 예전 목록(V1)으로 바꿔 받음
    return Promise.all([loadVocab(V2).catch(function () { return null; }), api('semToday', [token(), 2])]).then(function (res) {
      var vocab = res[0], srv = res[1];
      if (!srv || srv.loginRequired || !srv.ready) return [vocab || { words: [], hash: '', src: 0 }, srv];
      var want = srv.fmt === 2 ? V2 : V1;
      if (!vocab || vocab.src !== want.id) return loadVocab(want).then(function (v) { return [v, srv]; });
      // 기기에 저장해 둔 목록이 서버의 것과 다르면(목록이 새로 바뀜) 한 번 새로 받아 씀
      if (vocab.fromCache && srv.vh && vocab.hash !== srv.vh) return loadVocab(want, true).then(function (v) { return [v, srv]; });
      return res;
    }).then(function (res) {
      var vocab = res[0], srv = res[1];
      S.loading = false;
      S.srv = srv; S.nick = srv.me || '';
      if (srv.loginRequired || !S.nick) { S.queue = []; renderGate(!!session()); return; }   // 토큰이 만료됐거나 닉네임이 연결되지 않음
      if (!srv.ready) { render(); return; }
      if (vocab.hash && srv.vh && vocab.hash !== srv.vh) throw new Error('단어 목록이 새로 바뀌었어요. 주소 끝에 ?x=' + Date.now() % 1000 + ' 를 붙여 새로고침 해 주세요');
      prepare(vocab, srv);
      dayCachePut(srv);   // 다음부터는 서버를 기다리지 않고 바로 시작
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
      render(); flushQueue();
      if (L.pend) retryPending();
    }).catch(function (e) {
      S.loading = false; S.queue = [];
      if (!token()) return renderGate(false);   // 로그인이 만료돼 지워졌으면 로그인 안내
      $('view').innerHTML = '<div class="card empty">😢<br><b>' + esc(e.message || '불러오지 못했어요') + '</b><br><button type="button" class="btn sm" id="again" style="margin-top:10px">다시 시도</button></div>';
      var b = $('again'); if (b) b.onclick = boot;
    });
  }
  function boot() {
    if (/[?&]reset\b/.test(location.search)) history.replaceState(null, '', location.pathname);   // 잠만보 메뉴가 붙이는 ?reset (예전 서비스 워커 우회용)
    try { history.replaceState({ v: 'play', p: 0 }, ''); } catch (e) {}   // 뒤로가기 기준점
    applyXl(); renderAcct(); updateTop();
    if (!token()) { S.nick = ''; return renderGate(false); }   // 로그인한 회원만 시작할 수 있음
    $('tabs').hidden = false; updateTop();
    var nick = myNick();
    if (!nick) return bootFull();   // 닉네임을 아직 모르면(처음 연결 등) 서버 확인부터
    // ① 오늘 표와 단어 목록이 기기에 있으면 서버를 기다리지 않고 바로 시작 ② 서버에는 가벼운 확인만 뒤에서
    S.loading = true; xlState();
    Promise.all([dayCacheGet(), loadVocab(V2).catch(function () { return null; })]).then(function (r) {
      var c = r[0], vocab = r[1];
      if (c && c.day === todayKST()) {
        var V = c.fmt === 2 ? V2 : V1, vp = vocab && vocab.src === V.id ? Promise.resolve(vocab) : loadVocab(V).catch(function () { return null; });
        return vp.then(function (v) { return v && (!c.vh || v.hash === c.vh) ? startFast(v, c, nick) : false; });
      }
      return false;
    }).then(function (fast) {
      if (!fast) return bootFull();
      return gasLight();
    }).catch(function () { return bootFull(); });
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
