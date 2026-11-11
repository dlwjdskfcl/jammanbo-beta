/* 잠만보 꼬들 1.3.0 — 원작 꼬들 규칙: 정답은 기본 자모 24개(자음 14 · 모음 10)로 풀어 쓴 6칸짜리 단어, 6번 안에 자모 키보드로 입력.
 * ㄲ→ㄱㄱ · ㅐ→ㅏㅣ · ㅘ→ㅗㅏ · 겹받침→둘 처럼 기본 자모로 풀어서 셈. 화면은 꼬맨틀과 같은 머리줄 · 탭 · 카드.
 * 지금은 서버 없이 이 기기에서만 돌아감 — 기록 · 연속 · 지난 판 로그는 기기에 저장 (꼬맨틀 점수 연동은 별도 협의). */
(function () {
  'use strict';
  var VER = '1.3.0', TRIES = 6, LEN = 6, START = Date.UTC(2026, 10, 11), LOGMAX = 400;
  var CFG = window.JMB_CONFIG || {}, ENV = CFG.env || 'prod', SFX = ENV !== 'prod' ? '_' + ENV : '';
  var KEY = 'jmb_kodle_v1' + SFX, KLOG = 'jmb_kodle_log' + SFX, KST = 'jmb_kodle_st' + SFX, KHELP = 'jmb_kodle_help', KAUTH = 'jmb_kakao_v2' + SFX;
  var CH = ['ㄱ', 'ㄱㄱ', 'ㄴ', 'ㄷ', 'ㄷㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅂㅂ', 'ㅅ', 'ㅅㅅ', 'ㅇ', 'ㅈ', 'ㅈㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  var JU = ['ㅏ', 'ㅏㅣ', 'ㅑ', 'ㅑㅣ', 'ㅓ', 'ㅓㅣ', 'ㅕ', 'ㅕㅣ', 'ㅗ', 'ㅗㅏ', 'ㅗㅏㅣ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅓㅣ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ'];
  var JO = ['', 'ㄱ', 'ㄱㄱ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅅㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  var ROWS = ['ㄲㄸㅃㅆㅉㅒㅖ', 'ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔ', 'ㅁㄴㅇㄹㅎㅗㅓㅏㅣ', 'ㅋㅌㅊㅍㅠㅜㅡ'];   // 두벌식 배열 모양. 쌍자음 · ㅐ ㅒ ㅔ ㅖ 키는 기본 자모 둘로 풀려서 들어감
  var EXP = { 'ㄲ': 'ㄱㄱ', 'ㄸ': 'ㄷㄷ', 'ㅃ': 'ㅂㅂ', 'ㅆ': 'ㅅㅅ', 'ㅉ': 'ㅈㅈ', 'ㅐ': 'ㅏㅣ', 'ㅒ': 'ㅑㅣ', 'ㅔ': 'ㅓㅣ', 'ㅖ': 'ㅕㅣ' };
  var PHYS = { KeyQ: 'ㅂ', KeyW: 'ㅈ', KeyE: 'ㄷ', KeyR: 'ㄱ', KeyT: 'ㅅ', KeyY: 'ㅛ', KeyU: 'ㅕ', KeyI: 'ㅑ', KeyA: 'ㅁ', KeyS: 'ㄴ', KeyD: 'ㅇ', KeyF: 'ㄹ', KeyG: 'ㅎ', KeyH: 'ㅗ', KeyJ: 'ㅓ', KeyK: 'ㅏ', KeyL: 'ㅣ', KeyZ: 'ㅋ', KeyX: 'ㅌ', KeyC: 'ㅊ', KeyV: 'ㅍ', KeyB: 'ㅠ', KeyN: 'ㅜ', KeyM: 'ㅡ' };
  var $ = function (id) { return document.getElementById(id); };
  var A = [], G = {}, ready = false, view = 'play', modalOpen = false;
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
  function nick() { var a = load(KAUTH); return a && a.user && a.user.nickname ? String(a.user.nickname) : ''; }
  var toastT = 0;
  function toast(t, bad) { var e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('on'); }, bad ? 2600 : 1800); }

  /** 초록 = 자리까지 맞음 · 노랑 = 다른 자리에 있음 · 회색 = 없음 (같은 자모가 둘일 때는 정답에 있는 개수만큼만) */
  function score(guess, ans) {
    var g = guess.split(''), a = ans.split(''), r = g.map(function () { return 'n'; }), left = {};
    g.forEach(function (c, i) { if (c === a[i]) r[i] = 'g'; else left[a[i]] = (left[a[i]] || 0) + 1; });
    g.forEach(function (c, i) { if (r[i] !== 'g' && left[c] > 0) { r[i] = 'y'; left[c]--; } });
    return r;
  }
  function grid(m) { return m.guesses.map(function (w) { return score(w, m.ans).map(function (x) { return x === 'g' ? '🟩' : x === 'y' ? '🟨' : '⬛'; }).join(''); }).join('\n'); }
  function shareText(m) { return '잠만보 꼬들 ' + (m.prac ? '연습' : '#' + (m.no + 1)) + ' ' + (m.win ? m.guesses.length : 'X') + '/' + TRIES + '\n' + grid(m); }

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
    var st = stats(); st.played++;
    if (win) { st.wins++; st.dist[m.guesses.length - 1]++; st.streak = st.last === dayOf(-1) ? st.streak + 1 : 1; st.best = Math.max(st.best, st.streak); st.last = m.day; } else st.streak = 0;
    save(KST, st);
  }

  /* ── 화면 ── */
  function keyStates(m) {
    var st = {}, rank = { n: 1, y: 2, g: 3 };
    m.guesses.forEach(function (w) { var s = score(w, m.ans); w.split('').forEach(function (c, i) { if (!st[c] || rank[s[i]] > rank[st[c]]) st[c] = s[i]; }); });
    return st;
  }
  /** 겹글자 키(ㄲ · ㅐ …)는 풀린 자모가 모두 같은 상태일 때만 색을 보여 줌 */
  function keySt(c, st) { var e = EXP[c]; if (!e) return st[c]; var a = st[e.charAt(0)], b = st[e.charAt(1)]; return a && a === b ? a : ''; }
  function boardHTML(m, cur, pop) {
    var h = '<div id="board" aria-live="polite">';
    for (var r = 0; r < TRIES; r++) {
      var w = m.guesses[r], typing = !w && r === m.guesses.length && !m.done, sc = w ? score(w, m.ans) : null;
      h += '<div class="krow" id="r' + r + '">';
      for (var c = 0; c < LEN; c++) { var ch = w ? w.charAt(c) : typing ? cur.charAt(c) : ''; h += '<div class="c' + (sc ? ' ' + sc[c] : ch ? ' f' : '') + (pop && w && r === m.guesses.length - 1 ? ' pop' : '') + '">' + ch + '</div>'; }
      h += '</div>';
    }
    return h + '</div>';
  }
  function keysHTML(m) {
    var st = keyStates(m);
    return '<div class="keys">' + ROWS.map(function (row, i) {
      return '<div class="kr">' + (i === 3 ? '<button type="button" class="w pri" data-k="Enter">입력</button>' : '') + row.split('').map(function (c) { return '<button type="button" class="' + (keySt(c, st) || '') + '" data-k="' + c + '">' + c + '</button>'; }).join('') + (i === 3 ? '<button type="button" class="w" data-k="Back">⌫</button>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function resultHTML(m) {
    if (!m.done) return '';
    return '<div class="card kres"><div class="em">' + (m.win ? '🎉' : '😵') + '</div><h2>' + (m.win ? '정답이에요!' : '아쉬워요') + '</h2>' +
      '<p class="ans">' + (m.win ? '<b>' + esc(m.aw) + '</b> — ' + m.guesses.length + '번 만에 맞혔어요' : '정답은 <b>' + esc(m.aw) + '</b> 였어요') + ' <small>(' + m.ans.split('').join(' ') + ')</small>' + (m.prac ? ' <small>· 연습(기록 없음)</small>' : '') + '</p>' +
      '<pre>' + grid(m) + '</pre><div class="btns"><button type="button" class="btn pri" id="share">결과 복사</button>' +
      (m.prac ? '<button type="button" class="btn" id="pracNext">🔁 다른 문제로 연습</button>' : '<button type="button" class="btn" id="goPrac">🌱 연습 한 판</button><a class="btn" href="../semantle/">🔤 꼬맨틀 하러 가기</a>') + '</div>' +
      (m.prac ? '' : '<p class="hint" style="text-align:center">다음 문제는 내일 00:00에 열려요</p>') + '</div>';
  }
  function gameHTML(which) {
    var m = GM[which];
    return '<div class="card kd"><h3>' + (which === 'play' ? '오늘의 꼬들 <span class="tag">#' + (m.no + 1) + '</span>' : '연습 문제 <span class="tag">기록 없음</span>') + '<span class="sp"></span><small>' + m.guesses.length + '/' + TRIES + '</small></h3>' +
      boardHTML(m, CUR[which], false) + '<div class="kmsg" id="msg"></div>' + keysHTML(m) + '</div>' + resultHTML(m);
  }
  function histHTML() {
    var st = stats(), mx = Math.max.apply(null, st.dist.concat(1)), L = load(KLOG) || [];
    var h = '<div class="card"><h3>📊 내 꼬들 기록 <small>이 기기 기준</small></h3><div class="stats4"><div><b>' + st.played + '</b><span>플레이</span></div><div><b>' + (st.played ? Math.round(st.wins / st.played * 100) : 0) + '%</b><span>정답률</span></div><div><b>' + st.streak + '</b><span>연속</span></div><div><b>' + st.best + '</b><span>최고 연속</span></div></div>' +
      '<div class="dist">' + st.dist.map(function (n, i) { return '<div><span style="width:14px">' + (i + 1) + '</span><i style="width:' + Math.max(8, n / mx * 100) + '%">' + n + '</i></div>'; }).join('') + '</div></div>';
    h += '<div class="card"><h3>📜 지난 판 <small>최근 ' + Math.min(L.length, 50) + '개</small></h3>' + (L.length ? L.slice(0, 50).map(function (x) {
      var pre = (x.g || []).map(function (w) { var a = jamo(x.aw); return a ? score(w, a).map(function (c) { return c === 'g' ? '🟩' : c === 'y' ? '🟨' : '⬛'; }).join('') : ''; }).join('\n');
      return '<details class="hc"><summary><span>' + (x.win ? '🎉' : '😵') + '</span><span>' + esc(x.day.slice(5)) + (x.prac ? ' 연습' : ' #' + (x.no + 1)) + '</span><b>' + esc(x.aw) + '</b><small>' + (x.win ? x.n + '번' : '실패') + (x.sec ? ' · ' + x.sec + '초' : '') + '</small></summary><pre>' + pre + '</pre></details>';
    }).join('') : '<div class="empty">아직 기록이 없어요. 오늘 문제부터 풀어 보세요!</div>') + '</div>';
    return h;
  }
  function render(pop) {
    $('acct').textContent = nick() || '로그인'; $('acct').classList.toggle('on', !!nick());
    [].forEach.call($('tabs').querySelectorAll('button'), function (b) { b.classList.toggle('on', b.getAttribute('data-v') === view); });
    if (!ready) { $('view').innerHTML = '<div class="card"><div class="empty">⏳ 단어를 불러오는 중…</div></div>'; return; }
    $('view').innerHTML = view === 'hist' ? histHTML() : gameHTML(view);
    $('sub').textContent = view === 'play' ? '오늘 #' + (GM.play.no + 1) : view === 'prac' ? '기록 없는 연습 판' : '지난 판 · 연속';
    wire();
  }
  function msg(t, bad) { var e = $('msg'); if (e) { e.textContent = t || ''; e.className = 'kmsg' + (bad ? ' bad' : ''); } }
  function shake(m) { var r = $('r' + m.guesses.length); if (r) { r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake'); } }
  function wire() {
    var s = $('share'); if (s) s.onclick = function () { var t = shareText(GM[view]); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('결과를 복사했어요'); }, function () { toast('복사하지 못했어요', true); }); };
    var p = $('pracNext'); if (p) p.onclick = function () { GM.prac = newGame(true); CUR.prac = ''; render(); };
    var g = $('goPrac'); if (g) g.onclick = function () { go('prac'); };
  }
  function go(v) { view = v; try { history.replaceState(null, '', '#' + v); } catch (e) {} render(); }

  /* ── 입력 ── */
  function press(k) {
    if (!ready || modalOpen || (view !== 'play' && view !== 'prac')) return;
    var m = GM[view]; if (m.done) return;
    var cur = CUR[view];
    if (k === 'Back') { CUR[view] = cur.slice(0, -1); return render(); }
    if (k === 'Enter') {
      if (cur.length < LEN) { msg('자모 6개를 모두 넣어 주세요', true); return shake(m); }
      if (!G[cur]) { msg('목록에 없는 단어예요', true); return shake(m); }
      if (m.guesses.indexOf(cur) >= 0) { msg('이미 쓴 단어예요', true); return shake(m); }
      if (!m.t0) m.t0 = Date.now();
      m.guesses.push(cur); CUR[view] = '';
      if (cur === m.ans) finish(m, true); else if (m.guesses.length >= TRIES) finish(m, false);
      persist(m); return render(true);
    }
    var add = EXP[k] || k;
    if (cur.length + add.length <= LEN) { if (!m.t0 && !m.guesses.length) m.t0 = Date.now(); CUR[view] = cur + add; render(); }
  }

  /* ── 창 ── */
  function openModal(html) {
    $('modal').innerHTML = '<div class="mbg" id="mbg"><div class="sheet" role="dialog" aria-modal="true" tabindex="-1"><button type="button" class="x" data-x aria-label="닫기">✕</button>' + html + '</div></div>';
    modalOpen = true; var m = $('mbg'); m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('[data-x]')) closeModal(); });
  }
  function closeModal() { $('modal').innerHTML = ''; modalOpen = false; }
  function help() {
    openModal('<h2>🟩 꼬들 하는 법</h2><p>정답은 <b>자모 6개</b>로 이루어진 단어예요. <b>6번 안에</b> 맞혀 보세요. 자모 키보드로 6칸을 채우고 <b>입력</b>을 누르면 색깔로 알려 줘요.</p>' +
      '<p>🟩 자모와 자리가 모두 맞음<br>🟨 자모는 있지만 다른 자리<br>⬛ 정답에 없음</p>' +
      '<p>쌍자음 · ㅐ · ㅔ · ㅘ 같은 글자와 겹받침은 <b>기본 자모(자음 14 · 모음 10)로 풀어서</b> 세요. 예: ㄲ=ㄱㄱ · ㅐ=ㅏㅣ · ㅘ=ㅗㅏ · ㄳ=ㄱㅅ (ㄲ · ㅐ 키를 누르면 알아서 두 칸이 채워져요). 그래서 ‘공룡’ = ㄱㅗㅇㄹㅠㅇ 이에요.</p>' +
      '<p>매일 하나(자정에 바뀜). 컴퓨터에서는 자판(두벌식)으로도 입력돼요. 연습 탭에서는 기록 없이 마음껏 풀 수 있어요.</p><div class="btns"><button type="button" class="btn pri" data-x>시작</button></div>');
    save(KHELP, 1);
  }

  /* ── 시작 ── */
  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) go(b.getAttribute('data-v')); });
  $('view').addEventListener('click', function (e) { var b = e.target.closest('[data-k]'); if (b) press(b.getAttribute('data-k')); });
  $('helpBtn').onclick = help;
  $('back').onclick = function () { location.href = '../'; };
  $('acct').onclick = function () { if (!nick()) location.href = '../semantle/'; else toast(nick() + ' 님'); };
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') { e.preventDefault(); press('Enter'); } else if (e.key === 'Backspace') { e.preventDefault(); press('Back'); } else if (PHYS[e.code]) { e.preventDefault(); press(PHYS[e.code]); }
  });
  var h0 = (location.hash || '').slice(1); if (h0 === 'prac' || h0 === 'hist') view = h0;
  render();
  fetch('words.txt?v=' + VER).then(function (r) { return r.text(); }).then(function (t) {
    var L = t.split('\n'); A = L[0].trim().split(' ').filter(Boolean);
    L[1].trim().split(' ').forEach(function (w) { var j = w && jamo(w); if (j && j.length === LEN) G[j] = 1; });
    GM.play = newGame(false); GM.prac = newGame(true); ready = true; render();
    if (!load(KHELP)) help();
  }).catch(function () { $('view').innerHTML = '<div class="card"><div class="empty">단어 목록을 불러오지 못했어요. 새로고침해 주세요</div></div>'; });
})();
