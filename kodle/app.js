/* 잠만보 꼬들 1.0.0 — 두 글자 단어를 자모(6칸) 색깔로 맞히기. 서버 없이 이 기기에서만 돌아감 (기록 · 연속은 기기에 저장) */
(function () {
  'use strict';
  var VER = '1.0.0', TRIES = 6, START = Date.UTC(2026, 10, 12), KEY = 'jmb_kodle_v1';
  var CH = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  var JU = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅗㅏ', 'ㅗㅐ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅔ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ'];
  var JO = ['', 'ㄱ', 'ㄲ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  var $ = function (id) { return document.getElementById(id); };
  var A = [], G = {}, S = { ans: '', prac: false, guesses: [], done: false, win: false, no: 0, day: '' };

  function jamo(w) {
    var o = [];
    for (var i = 0; i < w.length; i++) {
      var x = w.charCodeAt(i) - 0xAC00; if (x < 0 || x >= 11172) return null;
      o.push(CH.charAt(Math.floor(x / 588)));
      JU[Math.floor((x % 588) / 28)].split('').forEach(function (c) { o.push(c); });
      JO[x % 28].split('').forEach(function (c) { o.push(c); });
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
    var g = jamo(guess), a = jamo(ans), r = g.map(function () { return 'n'; }), left = {};
    g.forEach(function (c, i) { if (c === a[i]) r[i] = 'g'; else left[a[i]] = (left[a[i]] || 0) + 1; });
    g.forEach(function (c, i) { if (r[i] !== 'g' && left[c] > 0) { r[i] = 'y'; left[c]--; } });
    return r;
  }
  function msg(t, bad) { $('msg').textContent = t || ''; $('msg').style.color = bad ? '#d64545' : ''; }
  function draw(newRow) {
    var h = '';
    for (var r = 0; r < TRIES; r++) {
      var w = S.guesses[r], j = w ? jamo(w) : null, sc = w ? score(w, S.ans) : null;
      h += '<div class="row" id="r' + r + '">';
      for (var c = 0; c < 6; c++) h += '<div class="c' + (sc ? ' ' + sc[c] : '') + (newRow && r === S.guesses.length - 1 ? ' pop' : '') + '">' + (j ? j[c] : '') + '</div>';
      h += '</div>';
    }
    $('board').innerHTML = h;
    var st = {}, rank = { n: 1, y: 2, g: 3 };
    S.guesses.forEach(function (w) { var j = jamo(w), s = score(w, S.ans); j.forEach(function (c, i) { if (!st[c] || rank[s[i]] > rank[st[c]]) st[c] = s[i]; }); });
    $('keys').innerHTML = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㄲㄸㅃㅆㅉㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣㅐㅔ'.split('').map(function (c) { return '<span class="' + (st[c] || '') + '">' + c + '</span>'; }).join('');
    $('mode').textContent = S.prac ? '연습' : '오늘 #' + (S.no + 1);
    $('inp').disabled = $('go').disabled = S.done;
    endView();
  }
  function shareText() {
    var rows = S.guesses.map(function (w) { return score(w, S.ans).map(function (x) { return x === 'g' ? '🟩' : x === 'y' ? '🟨' : '⬛'; }).join(''); }).join('\n');
    return '잠만보 꼬들 ' + (S.prac ? '연습' : '#' + (S.no + 1)) + ' ' + (S.win ? S.guesses.length : 'X') + '/' + TRIES + '\n' + rows;
  }
  function endView() {
    var e = $('end'); if (!S.done) { e.innerHTML = ''; return; }
    e.innerHTML = '<div class="card"><h2>' + (S.win ? '🎉 ' + S.guesses.length + '번 만에 정답!' : '😢 아쉬워요') + '</h2><div>정답: <b>' + S.ans + '</b></div><pre>' + shareText().split('\n').slice(1).join('\n') + '</pre>' +
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
  function submit(e) {
    e.preventDefault(); if (S.done) return;
    var w = $('inp').value.replace(/\s/g, '');
    if (!/^[가-힣]{2}$/.test(w)) return bad('두 글자 한글 단어를 넣어 주세요');
    if (!G[w]) return bad('‘' + w + '’ 은(는) 목록에 없어요 (자모가 딱 6개인 두 글자 단어만 돼요)');
    if (S.guesses.indexOf(w) >= 0) return bad('이미 쓴 단어예요');
    S.guesses.push(w); $('inp').value = ''; msg('');
    if (w === S.ans) finish(true); else if (S.guesses.length >= TRIES) finish(false);
    persist(); draw(true); if (!S.done) $('inp').focus();
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
    modal('<h3>꼬들 하는 법</h3><p>두 글자 단어를 <b>6번 안에</b> 맞혀요. 글자를 <b>자모(ㄱ ㅏ …)</b> 6칸으로 쪼개서 색깔로 알려 줘요. (겹받침 · ㅘ 같은 겹모음은 둘로 나뉘어요)</p>' +
      '<div class="ex"><div class="c g">ㅅ</div><div class="c y">ㅏ</div><div class="c n">ㄱ</div></div><p>🟩 자리까지 맞음 · 🟨 있지만 다른 자리 · ⬛ 정답에 없음</p><p>예: ‘공룡’ = ㄱ ㅗ ㅇ ㄹ ㅠ ㅇ. 받침까지 합쳐 <b>자모가 딱 6개</b>인 두 글자 단어만 나와요.</p><p>매일 하나(자정에 바뀜). 끝나면 연습 판도 할 수 있어요.</p><p style="text-align:center"><button class="btn pri" id="mc">시작</button></p>');
    save(KEY + '_help', 1);
  }
  $('modal').onclick = function (e) { if (e.target === $('modal')) $('modal').classList.remove('on'); };
  function startDaily() {
    var no = dayNo(), d = dayOf(), sv = load(KEY);
    S = { ans: A[((no % A.length) + A.length) % A.length], prac: false, guesses: [], done: false, win: false, no: no, day: d };
    if (sv && sv.day === d) { S.guesses = sv.guesses || []; S.done = !!sv.done; S.win = !!sv.win; }
    draw(false); msg('');
  }
  function startPractice() {
    var w; do { w = A[Math.floor(Math.random() * A.length)]; } while (A.length > 1 && w === S.ans);
    S = { ans: w, prac: true, guesses: [], done: false, win: false, no: 0, day: '' };
    draw(false); msg('연습 판이에요 — 기록에 안 들어가요'); $('inp').focus();
  }
  $('form').addEventListener('submit', submit);
  $('practice').onclick = startPractice; $('help').onclick = help;
  fetch('words.txt?v=' + VER).then(function (r) { return r.text(); }).then(function (t) {
    var L = t.split('\n'); A = L[0].trim().split(' ').filter(Boolean);
    L[1].trim().split(' ').forEach(function (w) { if (w) G[w] = 1; });
    startDaily(); if (!load(KEY + '_help')) help();
  }).catch(function () { msg('단어 목록을 불러오지 못했어요. 새로고침해 주세요', true); });
})();
