/* 잠만보 꼬들 1.1.0 — 원작 꼬들 규칙: 정답은 기본 자모 24개(자음 14 · 모음 10)로 풀어 쓴 6칸짜리 단어, 6번 안에 자모 키보드로 입력.
 * ㄲ→ㄱㄱ · ㅐ→ㅏㅣ · ㅘ→ㅗㅏ · 겹받침→둘 처럼 기본 자모로 풀어서 셈. 서버 없이 이 기기에서만 돌아감 (기록 · 연속은 기기에 저장) */
(function () {
  'use strict';
  var VER = '1.1.0', TRIES = 6, LEN = 6, START = Date.UTC(2026, 10, 12), KEY = 'jmb_kodle_v1';
  var CH = ['ㄱ', 'ㄱㄱ', 'ㄴ', 'ㄷ', 'ㄷㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅂㅂ', 'ㅅ', 'ㅅㅅ', 'ㅇ', 'ㅈ', 'ㅈㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  var JU = ['ㅏ', 'ㅏㅣ', 'ㅑ', 'ㅑㅣ', 'ㅓ', 'ㅓㅣ', 'ㅕ', 'ㅕㅣ', 'ㅗ', 'ㅗㅏ', 'ㅗㅏㅣ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅓㅣ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ'];
  var JO = ['', 'ㄱ', 'ㄱㄱ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅅㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  var ROWS = ['ㅂㅈㄷㄱㅅㅛㅕㅑ', 'ㅁㄴㅇㄹㅎㅗㅓㅏㅣ', 'ㅋㅌㅊㅍㅠㅜㅡ'];   // 두벌식 배열 모양 (겹자음 · ㅐ ㅔ 는 기본 자모 두 개로 입력)
  var PHYS = { KeyQ: 'ㅂ', KeyW: 'ㅈ', KeyE: 'ㄷ', KeyR: 'ㄱ', KeyT: 'ㅅ', KeyY: 'ㅛ', KeyU: 'ㅕ', KeyI: 'ㅑ', KeyA: 'ㅁ', KeyS: 'ㄴ', KeyD: 'ㅇ', KeyF: 'ㄹ', KeyG: 'ㅎ', KeyH: 'ㅗ', KeyJ: 'ㅓ', KeyK: 'ㅏ', KeyL: 'ㅣ', KeyZ: 'ㅋ', KeyX: 'ㅌ', KeyC: 'ㅊ', KeyV: 'ㅍ', KeyB: 'ㅠ', KeyN: 'ㅜ', KeyM: 'ㅡ' };
  var $ = function (id) { return document.getElementById(id); };
  var A = [], G = {}, S = { ans: '', aw: '', prac: false, guesses: [], done: false, win: false, no: 0, day: '' }, cur = '';

  function jamo(w) {
    var o = '';
    for (var i = 0; i < w.length; i++) {
      var x = w.charCodeAt(i) - 0xAC00; if (x < 0 || x >= 11172) return null;
      o += CH[Math.floor(x / 588)] + JU[Math.floor((x % 588) / 28)] + JO[x % 28];
    }
    return o;
  }
  function kst() { return new Date(Date.now() + 9 * 3600e3); }
  function dayOf() { return kst().toISOString().slice(0, 10); }
  function dayNo() { var d = kst(); return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - START) / 864e5); }
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function stats() { return load(KEY + '_st') || { played: 0, wins: 0, streak: 0, best: 0, dist: [0, 0, 0, 0, 0, 0], last: '' }; }

  /** 초록 = 자리까지 맞음 · 노랑 = 다른 자리에 있음 · 회색 = 없음 (같은 자모가 둘일 때는 정답에 있는 개수만큼만) */
  function score(guess, ans) {
    var g = guess.split(''), a = ans.split(''), r = g.map(function () { return 'n'; }), left = {};
    g.forEach(function (c, i) { if (c === a[i]) r[i] = 'g'; else left[a[i]] = (left[a[i]] || 0) + 1; });
    g.forEach(function (c, i) { if (r[i] !== 'g' && left[c] > 0) { r[i] = 'y'; left[c]--; } });
    return r;
  }
  function msg(t, bad) { $('msg').textContent = t || ''; $('msg').style.color = bad ? '#d64545' : ''; }
  function draw(newRow) {
    var h = '';
    for (var r = 0; r < TRIES; r++) {
      var w = S.guesses[r], typing = !w && r === S.guesses.length && !S.done, sc = w ? score(w, S.ans) : null;
      h += '<div class="row" id="r' + r + '">';
      for (var c = 0; c < LEN; c++) h += '<div class="c' + (sc ? ' ' + sc[c] : '') + (newRow && w && r === S.guesses.length - 1 ? ' pop' : '') + '">' + (w ? w.charAt(c) : typing ? cur.charAt(c) : '') + '</div>';
      h += '</div>';
    }
    $('board').innerHTML = h;
    var st = {}, rank = { n: 1, y: 2, g: 3 };
    S.guesses.forEach(function (w) { var s = score(w, S.ans); w.split('').forEach(function (c, i) { if (!st[c] || rank[s[i]] > rank[st[c]]) st[c] = s[i]; }); });
    $('keys').innerHTML = ROWS.map(function (row, i) {
      return '<div class="kr">' + (i === 2 ? '<button type="button" class="w pri" data-k="Enter">입력</button>' : '') + row.split('').map(function (c) { return '<button type="button" class="' + (st[c] || '') + '" data-k="' + c + '">' + c + '</button>'; }).join('') + (i === 2 ? '<button type="button" class="w" data-k="Back">⌫</button>' : '') + '</div>';
    }).join('');
    $('mode').textContent = S.prac ? '연습' : '오늘 #' + (S.no + 1);
    endView();
  }
  function shareText() {
    var rows = S.guesses.map(function (w) { return score(w, S.ans).map(function (x) { return x === 'g' ? '🟩' : x === 'y' ? '🟨' : '⬛'; }).join(''); }).join('\n');
    return '잠만보 꼬들 ' + (S.prac ? '연습' : '#' + (S.no + 1)) + ' ' + (S.win ? S.guesses.length : 'X') + '/' + TRIES + '\n' + rows;
  }
  function endView() {
    var e = $('end'); if (!S.done) { e.innerHTML = ''; return; }
    e.innerHTML = '<div class="card"><h2>' + (S.win ? '🎉 ' + S.guesses.length + '번 만에 정답!' : '😢 아쉬워요') + '</h2><div>정답: <b>' + S.aw + '</b> <small>(' + S.ans.split('').join(' ') + ')</small></div><pre>' + shareText().split('\n').slice(1).join('\n') + '</pre>' +
      '<button type="button" class="btn pri" id="share">결과 복사</button> <button type="button" class="btn" id="stat">내 기록</button>' + (S.prac ? '' : '<div style="margin-top:8px;font-size:13px;color:var(--muted)">다음 문제는 내일 00:00에 열려요</div>') + '</div>';
    $('share').onclick = function () { var t = shareText(); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { msg('복사했어요'); }, function () { msg('복사하지 못했어요', true); }); };
    $('stat').onclick = showStats;
  }
  function finish(win) {
    S.done = true; S.win = win;
    if (S.prac) return;
    var st = stats(), d = dayOf();
    st.played++;
    if (win) {
      st.wins++; st.dist[S.guesses.length - 1]++;
      var y = new Date(Date.now() + 9 * 3600e3 - 864e5).toISOString().slice(0, 10);
      st.streak = st.last === y ? st.streak + 1 : 1; st.best = Math.max(st.best, st.streak); st.last = d;
    } else st.streak = 0;
    save(KEY + '_st', st);
  }
  function persist() { if (!S.prac) save(KEY, { day: S.day, guesses: S.guesses, done: S.done, win: S.win }); }
  function bad(t) { msg(t, true); var r = $('r' + S.guesses.length); if (r) { r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake'); } }
  function press(k) {
    if (S.done || !A.length) return;
    if (k === 'Back') { cur = cur.slice(0, -1); msg(''); return draw(false); }
    if (k === 'Enter') {
      if (cur.length < LEN) return bad('자모 6개를 모두 넣어 주세요');
      if (!G[cur]) return bad('목록에 없는 단어예요');
      if (S.guesses.indexOf(cur) >= 0) return bad('이미 쓴 단어예요');
      S.guesses.push(cur); cur = ''; msg('');
      if (S.guesses[S.guesses.length - 1] === S.ans) finish(true); else if (S.guesses.length >= TRIES) finish(false);
      persist(); return draw(true);
    }
    if (cur.length < LEN) { cur += k; msg(''); draw(false); }
  }
  function modal(h) {
    $('box').innerHTML = h; $('modal').classList.add('on');
    var c = $('mc'); if (c) c.onclick = function () { $('modal').classList.remove('on'); };
  }
  function showStats() {
    var st = stats(), mx = Math.max.apply(null, st.dist.concat(1));
    modal('<h3>내 기록</h3><div class="stats"><div><b>' + st.played + '</b><span>플레이</span></div><div><b>' + (st.played ? Math.round(st.wins / st.played * 100) : 0) + '%</b><span>정답률</span></div><div><b>' + st.streak + '</b><span>연속</span></div><div><b>' + st.best + '</b><span>최고 연속</span></div></div>' +
      st.dist.map(function (n, i) { return '<div style="display:flex;gap:6px;align-items:center;margin:2px 0"><span style="width:14px">' + (i + 1) + '</span><div style="background:var(--acc);color:#fff;border-radius:4px;padding:0 6px;min-width:18px;width:' + Math.max(8, n / mx * 100) + '%;font-size:12px">' + n + '</div></div>'; }).join('') + '<p style="text-align:center"><button class="btn" id="mc">닫기</button></p>');
  }
  function help() {
    modal('<h3>꼬들 하는 법</h3><p>정답은 <b>자모 6개</b>로 이루어진 단어예요. <b>6번 안에</b> 맞혀 보세요. 자모 키보드로 6칸을 채우고 <b>입력</b>을 누르면 색깔로 알려 줘요.</p>' +
      '<div class="ex"><div class="c g">ㅅ</div><div class="c y">ㅏ</div><div class="c n">ㄱ</div></div><p>🟩 자모와 자리가 모두 맞음 · 🟨 자모는 있지만 다른 자리 · ⬛ 정답에 없음</p><p>쌍자음 · ㅐ · ㅔ · ㅘ 같은 글자와 겹받침은 <b>기본 자모(자음 14 · 모음 10)로 풀어서</b> 세요. 예: ㄲ=ㄱㄱ · ㅐ=ㅏㅣ · ㅘ=ㅗㅏ · ㄳ=ㄱㅅ → ‘공룡’ = ㄱㅗㅇㄹㅠㅇ, ‘강아지’ = ㄱㅏㅇㅇㅏㅈㅣ(7칸이라 안 나와요).</p><p>매일 하나(자정에 바뀜). 끝나면 연습 판도 할 수 있어요. 컴퓨터에서는 자판(두벌식)으로도 입력돼요.</p><p style="text-align:center"><button class="btn pri" id="mc">시작</button></p>');
    save(KEY + '_help', 1);
  }
  $('modal').onclick = function (e) { if (e.target === $('modal')) $('modal').classList.remove('on'); };
  $('keys').addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button'); if (b) press(b.getAttribute('data-k')); });
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || $('modal').classList.contains('on')) return;
    if (e.key === 'Enter') { e.preventDefault(); press('Enter'); } else if (e.key === 'Backspace') { e.preventDefault(); press('Back'); } else if (PHYS[e.code]) { e.preventDefault(); press(PHYS[e.code]); }
  });
  function startDaily() {
    var no = dayNo(), d = dayOf(), sv = load(KEY), w = A[((no % A.length) + A.length) % A.length];
    S = { ans: jamo(w), aw: w, prac: false, guesses: [], done: false, win: false, no: no, day: d }; cur = '';
    if (sv && sv.day === d) { S.guesses = (sv.guesses || []).filter(function (x) { return typeof x === 'string' && x.length === LEN; }); S.done = !!sv.done; S.win = !!sv.win; }
    draw(false); msg('');
  }
  function startPractice() {
    var w; do { w = A[Math.floor(Math.random() * A.length)]; } while (A.length > 1 && w === S.aw);
    S = { ans: jamo(w), aw: w, prac: true, guesses: [], done: false, win: false, no: 0, day: '' }; cur = '';
    draw(false); msg('연습 판이에요 — 기록에 안 들어가요');
  }
  $('practice').onclick = startPractice; $('help').onclick = help;
  fetch('words.txt?v=' + VER).then(function (r) { return r.text(); }).then(function (t) {
    var L = t.split('\n'); A = L[0].trim().split(' ').filter(Boolean);
    L[1].trim().split(' ').forEach(function (w) { var j = w && jamo(w); if (j && j.length === LEN) G[j] = 1; });
    startDaily(); if (!load(KEY + '_help')) help();
  }).catch(function () { msg('단어 목록을 불러오지 못했어요. 새로고침해 주세요', true); });
})();
