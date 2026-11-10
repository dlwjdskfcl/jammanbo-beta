/* 잠만보 빙고 v1.0.0 — 화면 (계산은 core.js)
 * - 서버·DB 없음. 설정·진행 중 게임·전적만 이 기기 localStorage 에 저장 (jmb_bingo_*)
 * - 모임 빙고: 방 코드(씨앗)만 같으면 진행자 기기의 뽑는 순서와 참가자 기기의 판이 서로 맞음 → 통신 없이 검증까지
 * - 직접 고르는 빙고: 1~25 를 직접 놓고 번갈아 부르기 (AI 대결 · 한 기기 돌려 하기)
 * - 주제 빙고: 낱말 판 (보드게임 제목은 기기에 저장된 잠만보 데이터 jmb_data_v2 의 게임 목록에서)
 */
(function () {
  'use strict';
  var C = window.BingoCore;
  if (!C) return;
  var FX = window.JMB_FX || { avatar: function () { return ''; }, haptic: function () {}, confetti: function () {}, capture: function () { return Promise.reject(new Error('이미지 도구를 불러오지 못했어요')); } };
  var VER = '1.0.3';
  var $ = function (id) { return document.getElementById(id); };
  var ROOT = (function () { var seg = location.pathname.split('/')[1] || ''; return /\.github\.io$/.test(location.hostname) && seg ? '/' + seg + '/' : '/'; })();
  var COARSE = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);

  /* ---------- 저장 ---------- */
  var KEY = { opt: 'jmb_bingo_opt', host: 'jmb_bingo_host', play: 'jmb_bingo_play', duel: 'jmb_bingo_duel', topic: 'jmb_bingo_topic', stats: 'jmb_bingo_stats' };
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var OPT = Object.assign({ sound: true, voice: true, name: '', range: 75, goal: 3, dmode: 'ai', ais: 1, level: 'normal', humans: 2, dgoal: 3, pnames: ['', '', '', ''], theme: 'games', tsize: 5, tfree: true, custom: '', ctitle: '' }, lsGet(KEY.opt, {}));
  function saveOpt() { lsSet(KEY.opt, OPT); }
  var S = { view: 'home', form: {}, host: lsGet(KEY.host, null), play: lsGet(KEY.play, null), duel: lsGet(KEY.duel, null), topic: lsGet(KEY.topic, null), pop: -1, hostNew: [], tv: false };
  if (S.host && !C.parseCode(S.host.code)) S.host = null;
  if (S.play && (!C.parseCode(S.play.code) || !Array.isArray(S.play.marks))) S.play = null;
  if (S.duel && !Array.isArray(S.duel.players)) S.duel = null;
  if (S.topic && !Array.isArray(S.topic.cells)) S.topic = null;
  function saveHost() { lsSet(KEY.host, S.host); }
  function savePlay() { lsSet(KEY.play, S.play); }
  function saveDuel() { lsSet(KEY.duel, S.duel); }
  function saveTopic() { lsSet(KEY.topic, S.topic); }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var toastT = 0;
  function toast(msg, bad) { var t = $('toast'); t.textContent = msg; t.className = 'toast on' + (bad ? ' err' : ''); clearTimeout(toastT); toastT = setTimeout(function () { t.className = 'toast'; }, 2400); }

  /* ---------- 소리 (Web Audio 합성) · 번호 읽기 ---------- */
  var AC = null;
  function tone(f, dur, type, vol, delay) {
    if (!OPT.sound) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
      var t = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
      o.type = type || 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur + 0.03);
    } catch (e) {}
  }
  var SND = {
    tap: function () { tone(700, 0.07, 'triangle', 0.09); },
    off: function () { tone(360, 0.07, 'triangle', 0.07); },
    call: function () { tone(880, 0.12, 'sine', 0.12); tone(1175, 0.22, 'sine', 0.12, 0.1); },
    line: function () { [523, 659, 784].forEach(function (f, i) { tone(f, 0.16, 'triangle', 0.12, i * 0.09); }); },
    bingo: function () { [523, 659, 784, 1046, 784, 1046].forEach(function (f, i) { tone(f, i === 5 ? 0.6 : 0.15, 'triangle', 0.14, i * 0.12); }); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { tone(f, 0.25, 'sine', 0.1, i * 0.16); }); }
  };
  function speak(text) {
    if (!OPT.voice || !window.speechSynthesis) return;
    try { speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(text); u.lang = 'ko-KR'; u.rate = 0.95; speechSynthesis.speak(u); } catch (e) {}
  }
  function sndIcon() {
    $('sndBtn').innerHTML = OPT.sound
      ? '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
    $('sndBtn').setAttribute('aria-pressed', OPT.sound);
  }
  function celebrate(big) {
    FX.haptic(big ? 'win' : 'turn');
    if (big) { SND.bingo(); FX.confetti({ count: 160 }); } else { SND.line(); FX.confetti({ count: 50, duration: 1500 }); }
  }

  /* ---------- 잠만보 데이터(이 기기에 저장된 것): 회원 · 최근 모임 참가자 · 게임 목록 — 읽기만, 없으면 버튼을 숨김 ---------- */
  var CLUB = { members: [], meet: null, games: [] };
  function unpack(t) {
    if (t && Array.isArray(t.c) && Array.isArray(t.r)) return t.r.map(function (row) { var o = {}; t.c.forEach(function (k, i) { o[k] = row[i]; }); return o; });
    return Array.isArray(t) ? t : [];
  }
  function splitNames(p) { return (Array.isArray(p) ? p : String(p || '').split(/[,，、\n]+/)).map(function (s) { return String(s).trim(); }).filter(Boolean); }
  function uniq(a) { var seen = {}; return a.filter(function (x) { var k = C.normName(x); if (!k || seen[k]) return false; seen[k] = 1; return true; }); }
  function scanClub() {
    try {
      var root = JSON.parse(localStorage.getItem('jmb_data_v2') || 'null'); if (!root) return;
      var d = root.d || root;
      CLUB.members = uniq(unpack(d.members).map(function (m) { return String(m.name || m['닉네임'] || '').trim(); }));
      CLUB.games = uniq(unpack(d.games).map(function (g) { return String(g.name || g['게임명'] || '').trim(); }));
      var today = new Date(); today.setHours(23, 59, 59, 0);
      unpack(d.meetings).forEach(function (m) {
        var dt = new Date(String(m.date || '').trim().replace(/\.\s*/g, '-').replace(/-$/, '')), names = uniq(splitNames(m.participants));
        if (isNaN(dt) || dt > today || names.length < 2) return;
        if (!CLUB.meet || dt > CLUB.meet.d) CLUB.meet = { d: dt, names: names, title: m.title || '' };
      });
    } catch (e) {}
  }
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function cho(s) { var o = ''; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i) - 0xAC00; o += c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : s[i]; } return o; }
  function koMatch(name, q) { if (!q) return true; name = name.toLowerCase().replace(/\s+/g, ''); q = q.toLowerCase().replace(/\s+/g, ''); return name.indexOf(q) >= 0 || cho(name).indexOf(q) >= 0; }

  /* ---------- 공통 조각 ---------- */
  var LET = 'BINGO';
  // cells: [{t, sub, on, ln, free, last, sel, empty}] — act 가 있으면 누를 수 있는 판
  function boardHtml(cells, o) {
    o = o || {};
    var n = Math.round(Math.sqrt(cells.length)), tag = o.act ? 'button' : 'div';
    return '<div class="board n' + n + (o.cls ? ' ' + o.cls : '') + '">' + cells.map(function (c, i) {
      return '<' + tag + (o.act ? ' type="button" data-act="' + o.act + '" data-i="' + i + '" aria-pressed="' + !!c.on + '"' : '') +
        ' class="cell' + (c.on ? ' on' : '') + (c.ln ? ' ln' : '') + (c.free ? ' free' : '') + (c.last ? ' last' : '') + (c.sel ? ' sel' : '') + (c.empty ? ' empty' : '') + (i === S.pop ? ' pop' : '') + '">' +
        '<span>' + c.t + '</span>' + (c.sub ? '<small>' + c.sub + '</small>' : '') + '</' + tag + '>';
    }).join('') + '</div>';
  }
  function headHtml() { return '<div class="bhead">' + LET.split('').map(function (l, i) { return '<i class="k' + i + '">' + l + '</i>'; }).join('') + '</div>'; }
  function seg(key, list, val) {
    return '<div class="seg" role="radiogroup">' + list.map(function (x) {
      return '<button type="button" role="radio" aria-checked="' + (x[0] === val) + '" class="' + (x[0] === val ? 'on' : '') + '" data-act="opt" data-k="' + key + '" data-v="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '</div>';
  }
  function dots(n, goal) { var s = ''; for (var i = 0; i < Math.min(goal, 12); i++) s += '<i class="' + (i < n ? 'on' : '') + '"></i>'; return '<span class="dots">' + s + '</span>'; }
  function ball(num, range, cls) {
    var k = C.colOf(num, range);
    return '<span class="ball k' + k + (cls ? ' ' + cls : '') + '">' + (range === 75 ? '<small>' + LET[k] + '</small>' : '') + '<b>' + num + '</b></span>';
  }
  // 창은 history 에 한 칸 쌓음 → 안드로이드 뒤로가기 · 아이폰 스와이프로 창만 닫힘
  var sheetOpen = false;
  function hstate() { return history.state || {}; }
  function sheet(html) {
    $('modal').innerHTML = '<div class="mbg" data-act="closeSheet"><div class="sheet" role="dialog" aria-modal="true">' + html + '</div></div>';
    if (!sheetOpen) { sheetOpen = true; try { history.pushState({ v: S.view, st: hstate().st || ['home'], m: 1 }, ''); } catch (e) {} }
  }
  function closeSheet(fromPop) {
    if (!sheetOpen) return;
    sheetOpen = false; $('modal').innerHTML = '';
    if (!fromPop && hstate().m) { try { history.back(); } catch (e) {} }
  }
  function copyText(t, msg) {
    var done = function () { toast(msg || '복사했어요'); };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(done, function () { legacyCopy(t); done(); });
    legacyCopy(t); done();
  }
  function legacyCopy(t) { try { var a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;left:-999px'; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.parentNode.removeChild(a); } catch (e) {} }
  function shareLink(text, url) {
    if (COARSE && navigator.share) { navigator.share({ title: '잠만보 빙고', text: text, url: url }).catch(function () {}); return; }
    copyText(url, '링크를 복사했어요');
  }
  function pageUrl(q) { return location.origin + location.pathname + (q || ''); }

  /* ================= 홈 ================= */
  var LEVELS = [['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']];
  function statsHtml() {
    var st = lsGet(KEY.stats, {}), rows = LEVELS.map(function (l) {
      var x = st[l[0]]; if (!x || !(x.w + x.l)) return '';
      return '<div class="st"><span>' + l[1] + '</span><b>' + x.w + '승 ' + x.l + '패</b><small>' + (x.best ? '최소 ' + x.best + '턴 빙고' : '') + '</small></div>';
    }).join('');
    return rows ? '<section class="card"><h3>🤖 AI 대결 전적</h3>' + rows + '</section>' : '';
  }
  function viewHome() {
    var res = '';
    if (S.host) res += '<button type="button" class="res" data-act="go" data-v="host"><span>📣</span><b>진행 중인 방 ' + S.host.code + '</b><small>뽑은 번호 ' + S.host.n + '개 · 이어서</small></button>';
    if (S.play) res += '<button type="button" class="res" data-act="go" data-v="play"><span>🎟️</span><b>내 빙고판 (방 ' + S.play.code + ')</b><small>' + esc(S.play.name) + ' · 이어서</small></button>';
    if (S.duel && S.duel.phase !== 'end') res += '<button type="button" class="res" data-act="go" data-v="duel"><span>🔢</span><b>직접 고르는 빙고</b><small>' + (S.duel.mode === 'ai' ? 'AI 대결' : S.duel.players.length + '명 돌려 하기') + ' · 이어서</small></button>';
    if (S.topic) res += '<button type="button" class="res" data-act="go" data-v="topic"><span>💬</span><b>' + esc(S.topic.title) + '</b><small>주제 빙고 · 이어서</small></button>';
    return '<div class="hero"><div class="logo">' + LET.split('').map(function (l, i) { return '<i class="ball k' + i + '"><b>' + l + '</b></i>'; }).join('') + '</div>' +
      '<p>같은 자리에 모여 각자 폰으로, 혼자서는 AI 와</p></div>' +
      (res ? '<div class="resume">' + res + '</div>' : '') +
      '<div class="modes">' +
      '<button type="button" class="mode main" data-act="go" data-v="room"><span class="ic">🎱</span><span><b>모임 빙고</b><small>방 코드만 맞추면 각자 폰에 내 판이 · 진행자가 번호 뽑기</small></span></button>' +
      '<button type="button" class="mode" data-act="go" data-v="duelSetup"><span class="ic">🔢</span><span><b>직접 고르는 빙고</b><small>1~25 를 내 마음대로 놓고 번갈아 부르기 · AI 대결</small></span></button>' +
      '<button type="button" class="mode" data-act="go" data-v="topicSetup"><span class="ic">💬</span><span><b>주제 빙고</b><small>보드게임 제목 · 사람 찾기 · 직접 만든 낱말</small></span></button>' +
      '</div>' + statsHtml() +
      (window.JMB_ARCADE ? '<div class="btns"><button type="button" class="btn" id="arcRank">🏆 모임 랭킹 <small style="font-weight:500;opacity:.7">어려움 AI 연승 · 빠른 빙고</small></button></div>' : '') +
      '<p class="hint ct">서버 없이 이 기기에서만 동작해요 · v' + VER + '</p>';
  }

  /* ================= 모임 빙고: 들어가기 · 방 만들기 ================= */
  var GOALS = C.GOALS.map(function (g) { return [g, C.goalName(g)]; });
  function viewRoom() {
    var f = S.form, p = C.parseCode(f.code || '');
    return '<section class="card"><h3>🎟️ 참가하기</h3>' +
      '<label class="fld"><span>방 코드 (숫자 5자리)</span><input id="fCode" data-f="code" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off" placeholder="예) 21234" value="' + esc(f.code || '') + '"></label>' +
      '<p class="hint" id="codeInfo">' + codeInfo(p) + '</p>' +
      '<label class="fld"><span>내 이름 (진행자가 검증할 때 쓰는 이름)</span><input id="fName" data-f="name" maxlength="20" autocomplete="off" list="memList" placeholder="닉네임" value="' + esc(f.name == null ? OPT.name : f.name) + '"></label>' +
      '<datalist id="memList">' + CLUB.members.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>' +
      '<div class="btns"><button type="button" class="btn pri" data-act="join">내 빙고판 받기</button></div>' +
      (S.play ? '<button type="button" class="link" data-act="go" data-v="play">받아 둔 판 이어서 — 방 ' + S.play.code + ' · ' + esc(S.play.name) + '</button>' : '') +
      '</section>' +
      '<section class="card"><h3>📣 진행하기 <small>번호를 뽑아 주는 사람</small></h3>' +
      '<div class="lab">숫자 범위</div>' + seg('range', [[75, '1~75 (정통)'], [50, '1~50 (빠르게)']], OPT.range) +
      '<div class="lab">빙고 목표</div>' + seg('goal', GOALS, OPT.goal) +
      '<div class="btns"><button type="button" class="btn pri" data-act="makeRoom">방 만들기</button></div>' +
      (S.host ? '<button type="button" class="link" data-act="go" data-v="host">진행 중인 방 이어서 — ' + S.host.code + ' · ' + S.host.n + '개 뽑음</button>' : '') +
      '<p class="hint">방 코드가 같으면 진행자의 뽑는 순서와 참가자의 판이 서로 맞아요. 통신이 없으니 참가자는 불린 번호를 직접 눌러 표시합니다. 진행자 기기 하나만 있어도(TV · 큰 화면) 명단을 넣으면 모두의 판을 한 화면에서 볼 수 있어요.</p>' +
      '</section>';
  }
  function codeInfo(p) { return p ? '1~' + p.range + ' · 목표 ' + C.goalName(p.goal) + (p.range === 75 ? ' · 가운데는 무료 칸' : '') : '진행자 화면에 보이는 코드를 넣으세요'; }

  /* ================= 모임 빙고: 진행자 ================= */
  var ORD = {}, RC = {}, autoT = 0, autoSec = 0, wake = null;
  function orderOf(code) { return ORD[code] || (ORD[code] = C.drawOrder(code)); }
  function who(code, name) {   // 그 사람의 판과 빙고가 되는 때
    var k = code + '|' + C.normName(name);
    if (!RC[k]) { var b = C.board(code, name), p = C.parseCode(code); RC[k] = { b: b, reach: C.reachAt(b, orderOf(code), p.goal) }; }
    return RC[k];
  }
  function stopAuto() { clearInterval(autoT); autoT = 0; }
  function setAuto(sec) { stopAuto(); autoSec = sec; if (sec) autoT = setInterval(function () { if (S.view === 'host' && !sheetOpen && !document.querySelector('.jarc-bg')) ACT.draw(); }, sec * 1000); }
  function keepAwake(on) {
    try {
      if (on && navigator.wakeLock && !wake) navigator.wakeLock.request('screen').then(function (w) { wake = w; w.addEventListener('release', function () { wake = null; }); }, function () {});
      if (!on && wake) { wake.release(); wake = null; }
    } catch (e) {}
  }
  function rosterState(H) {
    var p = C.parseCode(H.code), order = orderOf(H.code);
    return H.roster.map(function (name) {
      var w = who(H.code, name), pr = C.progress(w.b, order, H.n);
      return { name: name, b: w.b, reach: w.reach, won: w.reach <= H.n, count: pr.count, marks: pr.marks, cells: pr.cells, goal: p.goal };
    });
  }
  function numBoard(p, H, order) {
    var called = {}; for (var i = 0; i < H.n; i++) called[order[i]] = true;
    var per = p.range / 5, h = '';
    for (var r = 0; r < 5; r++) {
      h += '<div class="nrow k' + r + '">' + (p.range === 75 ? '<em>' + LET[r] + '</em>' : '');
      for (var c = 1; c <= per; c++) { var v = r * per + c; h += '<i class="' + (called[v] ? 'on' : '') + (H.n && order[H.n - 1] === v ? ' last' : '') + '">' + v + '</i>'; }
      h += '</div>';
    }
    return '<div class="nums r' + p.range + '">' + h + '</div>';
  }
  function miniBoard(r) {
    return boardHtml(r.b.map(function (v, i) { return { t: v ? v : '★', on: r.marks[i], ln: r.cells[i], free: !v }; }), { cls: 'mini' });
  }
  function viewHost() {
    var H = S.host, p = C.parseCode(H.code), order = orderOf(H.code), cur = H.n ? order[H.n - 1] : 0, done = H.n >= order.length;
    var rs = rosterState(H), winners = rs.filter(function (r) { return r.won; }).sort(function (a, b) { return a.reach - b.reach; });
    var prev = ''; for (var i = H.n - 2; i >= 0 && i >= H.n - 7; i--) prev += ball(order[i], p.range, 'sm');
    var chips = rs.map(function (r) {
      var rank = r.won ? winners.indexOf(r) + 1 : 0;
      return '<button type="button" class="pchip' + (r.won ? ' won' : '') + '" data-act="verify" data-n="' + esc(r.name) + '">' + FX.avatar(C.normName(r.name), 26) + '<b>' + esc(r.name) + '</b><em>' + (r.won ? '🎉 ' + rank + '등 · ' + r.reach + '번째' : r.count + '줄') + '</em></button>';
    }).join('');
    return '<div class="host"><div class="hl">' +
      '<section class="card codec"><small>방 코드</small><div class="code" aria-label="방 코드 ' + H.code + '">' + H.code.split('').map(function (d) { return '<i>' + d + '</i>'; }).join('') + '</div>' +
      '<div class="meta">1~' + p.range + ' · 목표 ' + C.goalName(p.goal) + (p.range === 75 ? ' · 가운데 무료' : '') + '</div>' +
      '<div class="row"><button type="button" class="btn sm" data-act="shareRoom">🔗 초대 링크</button><button type="button" class="btn sm" data-act="copyCode">코드 복사</button></div></section>' +
      '<section class="card drawc">' +
      (S.hostNew.length ? '<div class="bingoflag pop">🎉 ' + S.hostNew.map(esc).join(' · ') + ' 빙고!</div>' : '') +
      '<div class="now">' + (cur ? ball(cur, p.range, 'big' + (S.pop === -2 ? ' pop' : '')) : '<span class="ball big idle"><b>?</b></span>') + '</div>' +
      '<div class="cnt">뽑은 번호 <b id="drawn">' + H.n + '</b> / ' + p.range + '</div>' +
      '<div class="prev">' + (prev || '<small>‘번호 뽑기’를 누르면 시작해요</small>') + '</div>' +
      '<button type="button" class="btn pri xl" data-act="draw"' + (done ? ' disabled' : '') + '>' + (done ? '모두 뽑았어요' : '번호 뽑기') + '</button>' +
      '<div class="lab">자동으로 뽑기</div>' + seg('auto', [[0, '끔'], [5, '5초'], [8, '8초'], [12, '12초']], autoSec) +
      '<div class="row"><button type="button" class="btn sm' + (OPT.voice ? ' act' : '') + '" data-act="voice" aria-pressed="' + OPT.voice + '">🗣️ 번호 읽기 ' + (OPT.voice ? '켬' : '끔') + '</button>' +
      '<button type="button" class="btn sm" data-act="undo"' + (H.n ? '' : ' disabled') + '>↩︎ 되돌리기</button></div>' +
      '</section></div><div class="hr">' +
      '<section class="card"><h3>번호판 <small>불린 번호</small></h3>' + numBoard(p, H, order) + '</section>' +
      '<section class="card"><h3>참가자 · 검증 <small>' + (rs.length ? rs.length + '명' + (winners.length ? ' · 빙고 ' + winners.length + '명' : '') : '') + '</small></h3>' +
      '<div class="addrow"><input id="fWho" maxlength="20" autocomplete="off" list="memList" placeholder="이름 (넣으면 그 사람 판을 재현)"><button type="button" class="btn sm pri" data-act="addWho">확인</button></div>' +
      '<datalist id="memList">' + CLUB.members.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>' +
      '<div class="row wrap">' + (CLUB.meet ? '<button type="button" class="btn sm" data-act="addMeet">📅 최근 모임 참가자 ' + CLUB.meet.names.length + '명</button>' : '') +
      (CLUB.members.length ? '<button type="button" class="btn sm" data-act="pickMem">👥 회원에서 고르기</button>' : '') +
      (rs.length ? '<button type="button" class="btn sm' + (S.tv ? ' act' : '') + '" data-act="tv" aria-pressed="' + S.tv + '">🖥️ 판 모두 보기</button>' : '') + '</div>' +
      (chips ? '<div class="pchips">' + chips + '</div>' : '<p class="hint">누가 “빙고!”를 외치면 이름을 넣어 보세요. 그 사람의 판과 지금까지 뽑은 번호로 진짜인지 바로 알려 줘요. 명단을 미리 넣어 두면 빙고가 된 순간 알려 주고, 폰 없이 이 화면만으로도 진행할 수 있어요.</p>') +
      '</section></div>' +
      (S.tv && rs.length ? '<section class="card tv"><h3>모두의 판</h3><div class="minis">' + rs.map(function (r) {
        return '<div class="mb' + (r.won ? ' won' : '') + '"><div class="mh">' + FX.avatar(C.normName(r.name), 22) + '<b>' + esc(r.name) + '</b><em>' + (r.won ? '빙고!' : r.count + '줄') + '</em></div>' + miniBoard(r) + '</div>';
      }).join('') + '</div></section>' : '') +
      '<div class="btns foot"><button type="button" class="btn sm" data-act="newRoom">새 방 만들기</button><button type="button" class="btn sm" data-act="closeRoom">방 닫기</button></div></div>';
  }
  function verifySheet(name) {
    var H = S.host, p = C.parseCode(H.code), r = rosterState({ code: H.code, n: H.n, roster: [name] })[0];
    sheet('<h2>' + FX.avatar(C.normName(name), 30) + ' ' + esc(name) + '</h2>' +
      '<div class="note ' + (r.won ? 'ok' : 'warn') + '">' + (r.won
        ? '✅ 빙고 맞아요 — ' + r.reach + '번째 번호에서 ' + C.goalName(p.goal) + ' 완성 (지금 ' + r.count + '줄)'
        : '아직이에요 — 지금 ' + r.count + '줄 / 목표 ' + C.goalName(p.goal) + ' (뽑은 번호 ' + H.n + '개)') + '</div>' +
      (p.range === 75 ? headHtml() : '') + boardHtml(r.b.map(function (v, i) { return { t: v ? v : '★', on: r.marks[i], ln: r.cells[i], free: !v }; }), { cls: 'mid' }) +
      '<p class="hint"><b style="color:var(--gold,#f59f00)">주황</b> = 완성된 줄 · <b style="color:var(--accent,#3b5bdb)">파랑</b> = 불렸지만 줄은 아님 · ★ = 무료 칸</p>' +
      '<p class="hint">이름이 같으면 판도 같아요. 참가자 화면의 판과 다르면 이름(띄어쓰기 · 대소문자는 무시)을 확인하세요. 같은 이름이 둘이면 뒤에 숫자를 붙이세요 (예: 민수2).</p>' +
      '<div class="btns"><button type="button" class="btn pri" data-act="closeSheet">닫기</button><button type="button" class="btn" data-act="delWho" data-n="' + esc(name) + '">명단에서 빼기</button></div>');
  }
  function addRoster(names) {
    var H = S.host, have = {}, add = 0;
    H.roster.forEach(function (n) { have[C.normName(n)] = 1; });
    names.forEach(function (n) { n = String(n).trim().slice(0, 20); var k = C.normName(n); if (k && !have[k] && H.roster.length < 60) { have[k] = 1; H.roster.push(n); add++; } });
    saveHost(); return add;
  }
  function memSheet() {
    var q = S.memQ || '', list = CLUB.members.filter(function (n) { return koMatch(n, q); });
    return '<div class="memlist">' + (list.length ? list.map(function (n) { return '<button type="button" class="chip' + (S.memSel[n] ? ' on' : '') + '" data-act="memTog" data-n="' + esc(n) + '">' + esc(n) + '</button>'; }).join('') : '<p class="hint">찾는 회원이 없어요</p>') + '</div>';
  }

  /* ================= 모임 빙고: 참가자 ================= */
  function playClaim() { var P = S.play, p = C.parseCode(P.code); return C.claim(C.board(P.code, P.name), P.marks, orderOf(P.code), p.goal); }
  function viewPlay() {
    var P = S.play, p = C.parseCode(P.code), b = C.board(P.code, P.name), cl = playClaim(), won = cl.count >= p.goal;
    return '<div class="pinfo">' + FX.avatar(C.normName(P.name), 34) + '<div><b>' + esc(P.name) + '</b><small>방 ' + P.code + ' · 1~' + p.range + ' · 목표 ' + C.goalName(p.goal) + '</small></div>' +
      '<div class="lines"><b>' + cl.count + '</b>줄' + (p.goal < 12 ? dots(cl.count, p.goal) : '') + '</div></div>' +
      (won ? '<div class="bingo pop"><b>빙고!</b><span>검증 번호 <em>' + cl.need + '</em></span><small>진행자에게 이름과 이 화면을 보여 주세요. 진행자가 뽑은 번호가 ' + cl.need + '개 이상이면 진짜 빙고예요.</small></div>' : '') +
      '<div id="cap" class="capbox">' + (p.range === 75 ? headHtml() : '') +
      boardHtml(b.map(function (v, i) { return { t: v ? v : '★', on: !v || P.marks[i], ln: cl.cells[i], free: !v }; }), { act: 'mark' }) + '</div>' +
      '<p class="hint ct">진행자가 부른 번호를 누르세요. 다시 누르면 지워져요.</p>' +
      '<div class="btns"><button type="button" class="btn sm" data-act="catchup">⏩ 따라잡기</button><button type="button" class="btn sm" data-act="clearMarks">표시 지우기</button><button type="button" class="btn sm" data-act="leavePlay">다른 방 · 이름</button></div>';
  }

  /* ================= 직접 고르는 빙고 ================= */
  var BOTS = ['미플봇', '주사위봇', '카드봇'];
  function viewDuelSetup() {
    var ai = OPT.dmode === 'ai', names = '';
    if (!ai) for (var i = 0; i < OPT.humans; i++) names += '<label class="fld"><span>' + (i + 1) + '번</span><input data-f="p' + i + '" maxlength="12" autocomplete="off" placeholder="이름 ' + (i + 1) + '" value="' + esc(S.form['p' + i] == null ? OPT.pnames[i] || '' : S.form['p' + i]) + '"></label>';
    return '<section class="card"><h3>🔢 직접 고르는 빙고</h3>' +
      '<p class="hint top">1~25 를 내 마음대로 놓고, 돌아가며 숫자를 하나씩 불러요. 불린 숫자는 모두의 판에서 지워지고, 먼저 목표 줄 수를 만들면 승리!</p>' +
      '<div class="lab">상대</div>' + seg('dmode', [['ai', '🤖 AI 대결'], ['pass', '👥 한 기기로 돌려 하기']], OPT.dmode) +
      (ai ? '<div class="lab">AI 상대 수</div>' + seg('ais', [[1, '1명'], [2, '2명'], [3, '3명']], OPT.ais) + '<div class="lab">난이도</div>' + seg('level', LEVELS, OPT.level)
        : '<div class="lab">인원</div>' + seg('humans', [[2, '2명'], [3, '3명'], [4, '4명']], OPT.humans) + '<div class="names">' + names + '</div>') +
      '<div class="lab">빙고 목표</div>' + seg('dgoal', [[3, '3줄'], [5, '5줄']], OPT.dgoal) +
      (ai ? '<p class="hint">🏆 모임 랭킹에는 <b>어려움 AI</b> 와 한 판만 올라가요 (연승 · 3줄 목표는 빠른 빙고 기록도).</p>' : '') +
      '<div class="btns"><button type="button" class="btn pri" data-act="duelStart">판 만들러 가기</button></div>' +
      (S.duel && S.duel.phase !== 'end' ? '<button type="button" class="link" data-act="go" data-v="duel">하던 게임 이어서</button>' : '') +
      '</section>' + statsHtml();
  }
  function duelMarks(D, i) { var called = {}; D.called.forEach(function (v) { called[v] = true; }); return C.marksOf(D.players[i].board, called); }
  function calledMap(D) { var m = {}; D.called.forEach(function (v) { m[v] = true; }); return m; }
  function nextNum(b) { for (var v = 1; v <= 25; v++) if (b.indexOf(v) < 0) return v; return 0; }
  function handoff(D, title, body, btn) {
    var pl = D.players[D.turn];
    return '<section class="card pass"><div class="av">' + FX.avatar(pl.name, 72) + '</div><h2>' + esc(pl.name) + '</h2><p>' + title + '</p>' + (body || '') +
      '<div class="btns"><button type="button" class="btn pri xl" data-act="reveal">' + btn + '</button></div><p class="hint ct">다른 사람은 화면을 보지 않기!</p></section>';
  }
  function viewDuel() {
    var D = S.duel, pl = D.players[D.turn], last = D.called.length ? D.called[D.called.length - 1] : 0;
    var lastTxt = last ? '<div class="lastcall">방금 <b>' + esc(D.players[D.lastBy].name) + '</b> 님이 <em>' + last + '</em> 을(를) 불렀어요</div>' : '';
    if (D.phase === 'place') {
      if (!D.shown) return handoff(D, '판을 만들 차례예요', '', '판 만들기');
      var nx = nextNum(pl.board);
      return '<div class="turnbar">' + FX.avatar(pl.name, 30) + '<b>' + esc(pl.name) + '</b><span>' + (nx ? '빈칸을 눌러 <em>' + nx + '</em> 놓기' : '다 놓았어요!') + '</span></div>' +
        boardHtml(pl.board.map(function (v) { return { t: v || '', empty: !v }; }), { act: 'place' }) +
        '<p class="hint ct">놓은 숫자를 다시 누르면 빠져요. 귀찮으면 ‘자동 채우기’.</p>' +
        '<div class="btns"><button type="button" class="btn sm" data-act="autoFill">🎲 ' + (nx > 1 || !nx ? '남은 칸 자동 채우기' : '자동 채우기') + '</button><button type="button" class="btn sm" data-act="clearBoard">모두 지우기</button></div>' +
        '<div class="btns"><button type="button" class="btn pri xl" data-act="placeDone"' + (nx ? ' disabled' : '') + '>' + (nx ? (26 - nx) + '칸 남았어요' : '이 판으로 시작') + '</button></div>';
    }
    if (D.phase === 'end') return viewDuelEnd();
    // 진행
    var me = D.mode === 'ai' ? 0 : D.turn;
    if (D.mode === 'pass' && !D.shown) return handoff(D, '차례예요 — 기기를 넘겨 주세요', lastTxt, '내 판 보기');
    var mine = D.players[me], called = calledMap(D), marks = C.marksOf(mine.board, called), ln = C.lines(marks, 5), myTurn = !pl.ai;
    var opp = D.players.map(function (x, i) {
      var c = C.lines(duelMarks(D, i), 5).count;
      return '<div class="opp' + (i === D.turn ? ' turn' : '') + (i === me ? ' me' : '') + '">' + FX.avatar(x.name, 28) + '<b>' + esc(x.name) + '</b>' + (D.mode === 'ai' || i === me ? '<em>' + c + '줄</em>' : '') + '</div>';
    }).join('');
    var hist = D.called.slice(-12).reverse().map(function (v, i) { return '<i class="' + (i ? '' : 'new') + '">' + v + '</i>'; }).join('');
    return '<div class="opps n' + D.players.length + '">' + opp + '</div>' +
      '<div class="turnbar' + (myTurn ? ' go' : '') + '">' + (myTurn ? '<b>' + (D.mode === 'ai' ? '내 차례' : esc(pl.name) + ' 차례') + '</b><span>부를 숫자를 고르세요</span>' : '<b>' + esc(pl.name) + '</b><span class="think">고르는 중<i>.</i><i>.</i><i>.</i></span>') +
      '<div class="lines"><b>' + ln.count + '</b>줄' + dots(ln.count, D.goal) + '</div></div>' +
      boardHtml(mine.board.map(function (v, i) { return { t: v, on: marks[i], ln: ln.cells[i], last: v === last, sel: v === D.sel }; }), { act: 'pickNum' }) +
      '<div class="btns"><button type="button" class="btn pri xl" data-act="callNum"' + (myTurn && D.sel ? '' : ' disabled') + '>' + (!myTurn ? '상대 차례…' : D.sel ? D.sel + ' 부르기' : '숫자를 고르세요') + '</button></div>' +
      (last ? '<div class="hist"><small>불린 숫자 ' + D.called.length + '개</small>' + hist + '</div>' : '') +
      '<div class="btns foot"><button type="button" class="btn sm" data-act="duelQuit">그만하기</button></div>';
  }
  function viewDuelEnd() {
    var D = S.duel, called = calledMap(D), names = D.winners.map(function (i) { return D.players[i].name; });
    var meWin = D.mode === 'ai' ? D.winners.indexOf(0) >= 0 : true;
    return '<section class="card result ' + (meWin ? 'win' : 'lose') + '"><div class="em">' + (meWin ? '🎉' : '😵') + '</div>' +
      '<h2>' + (D.mode === 'ai' ? (meWin ? (D.winners.length > 1 ? '공동 빙고!' : '빙고! 내가 이겼어요') : esc(names.join(' · ')) + ' 빙고…') : esc(names.join(' · ')) + ' 빙고!') + '</h2>' +
      '<p>' + D.called.length + '번째 숫자 <b>' + D.called[D.called.length - 1] + '</b> 에서 ' + D.goal + '줄 완성</p>' +
      (D.mode === 'ai' ? '<p class="hint ct">' + recordLine(D.level) + '</p>' : '') + '</section>' +
      '<div class="minis end">' + D.players.map(function (x, i) {
        var m = C.marksOf(x.board, called), l = C.lines(m, 5), w = D.winners.indexOf(i) >= 0;
        return '<div class="mb' + (w ? ' won' : '') + '"><div class="mh">' + FX.avatar(x.name, 22) + '<b>' + esc(x.name) + '</b><em>' + l.count + '줄</em></div>' +
          boardHtml(x.board.map(function (v, k) { return { t: v, on: m[k], ln: l.cells[k] }; }), { cls: 'mini' }) + '</div>';
      }).join('') + '</div>' +
      '<div class="btns"><button type="button" class="btn pri" data-act="duelAgain">한 판 더</button><button type="button" class="btn" data-act="go" data-v="duelSetup">설정 바꾸기</button></div>' +
      (window.JMB_ARCADE && D.mode === 'ai' && D.level === 'hard' ? '<button type="button" class="link" id="arcRank">🏆 모임 랭킹 보기</button>' : '');
  }
  function recordLine(level) {
    var x = (lsGet(KEY.stats, {})[level]) || { w: 0, l: 0, best: 0 }, nm = LEVELS.filter(function (l) { return l[0] === level; })[0][1];
    return nm + ' 전적 ' + x.w + '승 ' + x.l + '패' + (x.best ? ' · 최소 ' + x.best + '턴 빙고' : '');
  }
  // 숫자를 부르기 시작한 AI 대결을 그만두면 연승은 끊김 (질 것 같을 때 그만둬서 연승을 지키지 못하게 — 모임 랭킹)
  function dropStreak() {
    var D = S.duel; if (!D || D.mode !== 'ai' || D.phase !== 'play' || !D.called.length) return;
    var st = lsGet(KEY.stats, {}); if (st[D.level] && st[D.level].streak) { st[D.level].streak = 0; lsSet(KEY.stats, st); }
  }
  var aiT = 0;
  function scheduleAI() {
    var D = S.duel;
    clearTimeout(aiT); aiT = 0;
    if (S.view !== 'duel' || !D || D.phase !== 'play' || !D.players[D.turn].ai) return;
    aiT = setTimeout(function () {
      aiT = 0;
      var D2 = S.duel; if (S.view !== 'duel' || D2 !== D || D.phase !== 'play' || !D.players[D.turn].ai) return;
      applyCall(C.aiPick(D.players[D.turn].board, calledMap(D), D.level, D.goal));
    }, 1100);
  }
  function applyCall(num) {
    var D = S.duel, caller = D.turn;
    if (!num || D.called.indexOf(num) >= 0) return;
    D.called.push(num); D.lastBy = caller; D.sel = 0;
    var w = C.duelWinners(D.players.map(function (x) { return x.board; }), calledMap(D), D.goal, caller);
    if (w.length) {
      D.phase = 'end'; D.winners = w;
      if (D.mode === 'ai') {
        var st = lsGet(KEY.stats, {}), x = st[D.level] = st[D.level] || { w: 0, l: 0, best: 0 };
        if (w.indexOf(0) >= 0) { x.w++; x.streak = (x.streak || 0) + 1; if (!x.best || D.called.length < x.best) x.best = D.called.length; } else { x.l++; x.streak = 0; }
        lsSet(KEY.stats, st);
        // 모임 랭킹(오락실): '어려움' AI 를 이긴 판만 — 연승, 그리고 3줄 목표면 몇 턴 만에 끝냈는지
        if (window.JMB_ARCADE && D.level === 'hard' && w.indexOf(0) >= 0) {
          var fast = Number(D.goal) === 3 ? D.called.length : 0, note = 'AI ' + (D.players.length - 1) + '명';
          JMB_ARCADE.report('bingo', 'ai', x.streak, note).then(function () { if (fast) setTimeout(function () { JMB_ARCADE.report('bingo', 'fast', fast, note, { quiet: true }); }, 3500); });
        }
      }
      saveDuel(); render(); window.scrollTo(0, 0);
      if (D.mode !== 'ai' || w.indexOf(0) >= 0) celebrate(true); else { SND.lose(); FX.haptic('warn'); }
      return;
    }
    var before = D.mode === 'ai' ? D.linesMe || 0 : 0;
    D.turn = (D.turn + 1) % D.players.length;
    if (D.mode === 'pass') D.shown = false;
    if (D.mode === 'ai') { D.linesMe = C.lines(duelMarks(D, 0), 5).count; if (D.linesMe > before) { SND.line(); FX.haptic('turn'); } else SND.call(); } else SND.call();
    saveDuel(); render();
  }

  /* ================= 주제 빙고 ================= */
  var W_GAMES = '카탄,스플렌더,티츄,루미큐브,할리갈리,뱅!,다빈치 코드,젠가,우노,클루,부루마불,카르카손,티켓 투 라이드,아줄,킹도미노,세븐 원더스,도미니언,팬데믹,테라포밍 마스,윙스팬,아그리콜라,푸에르토 리코,브라스,스컬,러브레터,코드네임,딕싯,달무티,마피아,한밤의 늑대인간,아발론,바퀴벌레 포커,치킨차차,텔레스트레이션,저스트 원,사보타지,렉시오,쿼리도,블로커스,스트림스,라스베가스,캐스캐디아,버건디의 성,스카이팀,하나비,더 크루,마이티,원카드,모노폴리,글룸헤이븐'.split(',');
  var W_PEOPLE = '오늘 처음 옴,게임 10개 넘게 소장,룰북 읽기 즐김,밤샘 게임 해 봄,게임 설명 잘함,방탈출 좋아함,마피아 잘함,협력 게임파,3시간 게임 해 봄,티츄 원투 해 봄,왼손잡이,반려동물 키움,민초 좋아함,대중교통으로 옴,나와 같은 달 생일,나와 같은 MBTI,아침형 인간,올해 여행 다녀옴,악기 연주 가능,운동 주 3회,커피 안 마심,주사위 운 없음,슬리브 꼭 씌움,펀딩으로 게임 삼,대회 나가 봄,게임하다 삐쳐 봄,모임 5번 넘게 옴,오늘 게임 들고 옴,파티 게임파,1인플 해 봄,점수 계산 담당,셔플 잘함,보드게임 카페 단골,나와 같은 성씨,안경 씀'.split(',');
  var W_EXP = '꼴찌에서 역전승,룰 틀린 채 한 판,컴포 잃어버림,밤샘 게임,설명만 30분,주사위 1만 연속,배신당함,배신함,같은 게임 3연속,새 게임 개봉,룰북 정독,영상으로 룰 공부,사고 안 뜯은 게임,슬리브 씌우기,지고 “한 판 더!”,0점 기록,만점 승리,협력 게임 클리어,마피아로 승리,티츄 성공,라지 티츄 실패,폭탄으로 역전,게임 추천 성공,모임 지각,모임 개설,게임 선물하기,중고 거래,펀딩 참여,확장 구매,트릭테이킹 입문,3시간 넘는 게임,장고로 눈총,킹메이킹 당함,음료 쏟을 뻔,남의 턴에 딴짓'.split(',');
  var THEMES = [
    { id: 'games', ic: '🎲', name: '보드게임 제목', title: '해 본 보드게임 빙고', sub: '해 본 게임에 체크 — 각자 폰에서 같은 주제로 만들고, 누가 먼저 줄을 만드는지 겨뤄요 (판은 섞여서 사람마다 달라요)' },
    { id: 'people', ic: '🙋', name: '사람 찾기', title: '사람 찾기 빙고', sub: '돌아다니며 해당하는 사람을 찾아 이름을 적어요', who: true },
    { id: 'exp', ic: '🏅', name: '보드게이머 경험', title: '보드게이머 경험 빙고', sub: '겪어 본 일에 체크 — 각자 폰에서 만들고 먼저 줄을 만드는 사람이 "빙고!"' },
    { id: 'custom', ic: '✏️', name: '직접 입력', title: '', sub: '낱말을 직접 넣어 판을 만들어요' }
  ];
  function themeOf(id) { return THEMES.filter(function (t) { return t.id === id; })[0] || THEMES[0]; }
  function parseWords(s) { return uniq(String(s || '').split(/[\n,，]+/).map(function (x) { return x.trim().slice(0, 30); })); }
  function wordsOf(id) {
    if (id === 'games') return CLUB.games.length >= 24 ? CLUB.games : uniq(CLUB.games.concat(W_GAMES));
    if (id === 'people') return W_PEOPLE;
    if (id === 'exp') return W_EXP;
    return parseWords(S.form.custom == null ? OPT.custom : S.form.custom);
  }
  function needWords() { return OPT.tsize * OPT.tsize - (OPT.tfree && OPT.tsize % 2 ? 1 : 0); }
  function viewTopicSetup() {
    var th = themeOf(OPT.theme), words = wordsOf(th.id), need = needWords(), custom = th.id === 'custom';
    return '<section class="card"><h3>💬 주제 빙고</h3>' +
      '<div class="themes">' + THEMES.map(function (t) {
        return '<button type="button" class="theme' + (t.id === th.id ? ' on' : '') + '" data-act="opt" data-k="theme" data-v="' + t.id + '" aria-pressed="' + (t.id === th.id) + '"><span>' + t.ic + '</span><b>' + t.name + '</b></button>';
      }).join('') + '</div>' +
      '<p class="hint top">' + th.sub + (th.id === 'games' && CLUB.games.length >= 24 ? ' · 잠만보 게임 목록 ' + CLUB.games.length + '개에서 뽑아요' : '') + '</p>' +
      (custom ? '<label class="fld"><span>제목</span><input data-f="ctitle" maxlength="24" autocomplete="off" placeholder="예) 우리 모임 빙고" value="' + esc(S.form.ctitle == null ? OPT.ctitle : S.form.ctitle) + '"></label>' +
        '<label class="fld"><span>낱말 (줄바꿈이나 쉼표로 나눠 넣기)</span><textarea id="fCustom" data-f="custom" rows="6" placeholder="낱말을 한 줄에 하나씩">' + esc(S.form.custom == null ? OPT.custom : S.form.custom) + '</textarea></label>' : '') +
      '<div class="lab">판 크기</div>' + seg('tsize', [[3, '3×3'], [4, '4×4'], [5, '5×5']], OPT.tsize) +
      (OPT.tsize % 2 ? '<label class="chk"><input type="checkbox" id="fFree"' + (OPT.tfree ? ' checked' : '') + '><span>가운데 무료 칸</span></label>' : '') +
      '<p class="hint" id="wcnt">' + wordCount(words.length, need) + '</p>' +
      '<div class="btns"><button type="button" class="btn pri" data-act="topicMake">판 만들기</button></div>' +
      (S.topic ? '<button type="button" class="link" data-act="go" data-v="topic">만들어 둔 판 이어서 — ' + esc(S.topic.title) + '</button>' : '') +
      '</section>';
  }
  function wordCount(n, need) { return '낱말 ' + n + '개 · 필요한 낱말 ' + need + '개' + (n < need ? ' — <b class="bad">' + (need - n) + '개 더 필요해요</b>' : n > need ? ' (섞어서 ' + need + '개를 뽑아요)' : ''); }
  function makeTopic() {
    var th = themeOf(OPT.theme), words = wordsOf(th.id), n = OPT.tsize, need = needWords();
    if (words.length < need) { toast('낱말이 ' + (need - words.length) + '개 더 필요해요', true); return false; }
    var pick = C.shuffle(words.slice()).slice(0, need), cells = [], k = 0, free = OPT.tfree && n % 2;
    for (var i = 0; i < n * n; i++) cells.push(free && i === (n * n - 1) / 2 ? { t: '★', free: 1, on: 1 } : { t: pick[k++], on: 0, who: '' });
    S.topic = { theme: th.id, title: th.id === 'custom' ? ((S.form.ctitle == null ? OPT.ctitle : S.form.ctitle).trim() || '우리 모임 빙고') : th.title, who: !!th.who, n: n, cells: cells, lines: 0 };
    if (th.id === 'custom') { OPT.custom = words.join('\n'); OPT.ctitle = S.topic.title; saveOpt(); S.topic.words = words; }
    saveTopic(); return true;
  }
  function viewTopic() {
    var T = S.topic, l = C.lines(T.cells.map(function (c) { return !!c.on; }), T.n), total = 2 * T.n + 2;
    var on = T.cells.filter(function (c) { return c.on && !c.free; }).length;
    return '<div id="cap" class="capbox topic"><div class="thead"><b>' + esc(T.title) + '</b><span class="lines"><b>' + l.count + '</b>줄' + (l.count >= total ? ' · 올 빙고!' : '') + '</span></div>' +
      boardHtml(T.cells.map(function (c, i) { return { t: esc(c.t), sub: c.who ? esc(c.who) : '', on: c.on, ln: l.cells[i], free: c.free }; }), { act: 'tmark', cls: 'words' }) +
      '<div class="tfoot"><span>잠만보 빙고</span><span>' + on + ' / ' + (T.cells.length - (T.cells.some(function (c) { return c.free; }) ? 1 : 0)) + ' 칸</span></div></div>' +
      '<p class="hint ct">' + (T.who ? '칸을 누르고 찾은 사람의 이름을 적어요. 한 사람은 한 칸에만!' : '해당하는 칸을 누르세요. 다시 누르면 지워져요.') + '</p>' +
      '<div class="btns"><button type="button" class="btn sm" data-act="topicShot">🖼️ 이미지 저장</button><button type="button" class="btn sm" data-act="topicShuffle">🔀 새로 섞기</button><button type="button" class="btn sm" data-act="topicClear">표시 지우기</button>' +
      (T.words ? '<button type="button" class="btn sm" data-act="topicShare">🔗 낱말 목록 공유</button>' : '') + '</div>';
  }
  function topicAfter(before) {
    var T = S.topic, l = C.lines(T.cells.map(function (c) { return !!c.on; }), T.n).count;
    T.lines = l; saveTopic(); render();
    if (l > before) celebrate(l >= 2 * T.n + 2 || before === 0); else SND.tap();
  }

  /* ================= 화면 바꾸기 ================= */
  var VIEWS = {
    home: [viewHome, '빙고', '모임에서, 혼자서'],
    room: [viewRoom, '모임 빙고', '방 코드로 같이 하기'],
    host: [viewHost, '모임 빙고 · 진행', '번호를 뽑아 주세요'],
    play: [viewPlay, '모임 빙고', '불린 번호를 눌러요'],
    duelSetup: [viewDuelSetup, '직접 고르는 빙고', '놓고, 부르고, 먼저 줄 만들기'],
    duel: [viewDuel, '직접 고르는 빙고', ''],
    topicSetup: [viewTopicSetup, '주제 빙고', '낱말로 하는 빙고'],
    topic: [viewTopic, '주제 빙고', '']
  };
  var BACK = { room: 'home', host: 'room', play: 'room', duelSetup: 'home', duel: 'duelSetup', topicSetup: 'home', topic: 'topicSetup' };
  function render() {
    if (S.view === 'host' && !S.host) S.view = 'room';
    if (S.view === 'play' && !S.play) S.view = 'room';
    if (S.view === 'duel' && !S.duel) S.view = 'duelSetup';
    if (S.view === 'topic' && !S.topic) S.view = 'topicSetup';
    var v = VIEWS[S.view];
    $('view').innerHTML = v[0]();
    $('ttl').textContent = v[1];
    var sub = v[2];
    if (S.view === 'duel') sub = S.duel.mode === 'ai' ? 'AI 대결 · ' + LEVELS.filter(function (l) { return l[0] === S.duel.level; })[0][1] + ' · ' + S.duel.goal + '줄' : S.duel.players.length + '명 · ' + S.duel.goal + '줄';
    if (S.view === 'topic') sub = S.topic.n + '×' + S.topic.n;
    $('sub').textContent = sub;
    $('app').className = S.view === 'host' ? 'wide' : '';
    document.documentElement.setAttribute('data-view', S.view);
    S.pop = -1;
    if (S.view !== 'host') { stopAuto(); autoSec = 0; S.hostNew = []; }
    keepAwake(S.view === 'host' || S.view === 'duel');
    scheduleAI();
  }
  /* 화면 이동과 뒤로가기: 화면을 옮길 때마다 history 에 한 칸 (state.st = 지나온 화면들).
   * 이미 지나온 화면으로 가면 그만큼 되돌아가고(history.go), 화면의 뒤로 버튼으로 '위 화면'에 처음 갈 때는 지금 칸을 갈아끼움
   * → 뒤로가기는 늘 창 닫기 → 이전 화면 → 홈 → (홈에서) 페이지 떠나기 */
  function go(v, up) {
    var stack = (hstate().st || ['home']).slice(), k = sheetOpen && hstate().m ? 1 : 0, i = stack.lastIndexOf(v);
    closeSheet(true);
    S.view = v;
    try {
      if (i >= 0) { k += stack.length - 1 - i; if (k) history.go(-k); }   // popstate 가 오지만 화면은 이미 같음
      else if (k || up) history.replaceState({ v: v, st: (up ? stack.slice(0, -1) : stack).concat(v) }, '');
      else history.pushState({ v: v, st: stack.concat(v) }, '');
    } catch (e) {}
    render(); window.scrollTo(0, 0);
  }
  window.addEventListener('popstate', function (e) {
    var st = e.state || {};
    if (st.jarc) return;   // 랭킹 창(arcade.js)이 쌓은 칸
    if (sheetOpen && !st.m) closeSheet(true);
    var v = VIEWS[st.v] ? st.v : 'home';
    if (v === S.view) return;
    if (S.view === 'duel' && S.duel && S.duel.phase !== 'end') toast('하던 게임은 저장해 뒀어요 · ‘이어서’로 계속');
    S.view = v; render(); window.scrollTo(0, 0);
  });

  /* ================= 누르기 ================= */
  var ACT = {
    go: function (el) { go(el.getAttribute('data-v')); },
    closeSheet: function (el, e) { if (el.classList.contains('mbg') && e.target !== el) return; closeSheet(); },
    opt: function (el) {
      var k = el.getAttribute('data-k'), v = el.getAttribute('data-v');
      if (k === 'auto') { setAuto(+v); render(); return; }
      OPT[k] = /^\d+$/.test(v) ? +v : v; saveOpt(); render();
    },
    /* --- 모임 빙고 --- */
    join: function () {
      var p = C.parseCode($('fCode').value), name = $('fName').value.trim().slice(0, 20);
      if (!p) { toast('방 코드는 숫자 5자리예요', true); $('fCode').focus(); return; }
      if (!name) { toast('이름을 넣어 주세요', true); $('fName').focus(); return; }
      var same = S.play && S.play.code === p.code && C.normName(S.play.name) === C.normName(name);
      if (!same) S.play = { code: p.code, name: name, marks: new Array(25).fill(false), won: false };
      OPT.name = name; saveOpt(); savePlay(); S.form.name = null; go('play');
    },
    makeRoom: function () {
      if (S.host && S.host.n && !confirm('진행 중인 방 ' + S.host.code + ' 을(를) 닫고 새 방을 만들까요?')) return;
      var keep = S.host ? S.host.roster : [];
      S.host = { code: C.makeCode(OPT.range, OPT.goal), n: 0, roster: keep };
      saveHost(); S.tv = false; go('host');
    },
    newRoom: function () { go('room'); },
    closeRoom: function () { if (!confirm('이 방을 닫을까요? 뽑은 번호 기록이 지워져요.')) return; S.host = null; saveHost(); go('room', true); },
    shareRoom: function () { shareLink('빙고 방 코드 ' + S.host.code + ' — 링크로 들어와 이름을 넣으면 내 빙고판이 나와요', pageUrl('?room=' + S.host.code)); },
    copyCode: function () { copyText(S.host.code, '방 코드를 복사했어요'); },
    voice: function () { OPT.voice = !OPT.voice; saveOpt(); if (!OPT.voice && window.speechSynthesis) speechSynthesis.cancel(); render(); },
    tv: function () { S.tv = !S.tv; render(); },
    draw: function () {
      var H = S.host, order = orderOf(H.code);
      if (!H || H.n >= order.length) { stopAuto(); autoSec = 0; return; }
      H.n++; saveHost();
      var v = order[H.n - 1], p = C.parseCode(H.code);
      S.hostNew = H.roster.filter(function (n) { return who(H.code, n).reach === H.n; });
      S.pop = -2;
      if (H.n >= order.length) { stopAuto(); autoSec = 0; }
      render();
      FX.haptic('tap');
      if (S.hostNew.length) { celebrate(true); if (OPT.voice) speak(v + '번. ' + S.hostNew.join(', ') + ' 빙고!'); }
      else { SND.call(); speak((p.range === 75 ? LET[C.colOf(v, 75)] + ' ' : '') + v + '번'); }
    },
    undo: function () { var H = S.host; if (!H.n) return; H.n--; saveHost(); S.hostNew = []; setAuto(0); render(); toast('마지막 번호를 되돌렸어요'); },
    addWho: function () {
      var name = $('fWho').value.trim().slice(0, 20);
      if (!name) { $('fWho').focus(); return; }
      addRoster([name]); render(); verifySheet(name);
    },
    verify: function (el) { verifySheet(el.getAttribute('data-n')); },
    delWho: function (el) { var k = C.normName(el.getAttribute('data-n')); S.host.roster = S.host.roster.filter(function (n) { return C.normName(n) !== k; }); saveHost(); closeSheet(); render(); },
    addMeet: function () { var a = addRoster(CLUB.meet.names); render(); toast((CLUB.meet.d.getMonth() + 1) + '/' + CLUB.meet.d.getDate() + ' 모임 참가자 ' + a + '명을 넣었어요'); },
    pickMem: function () {
      S.memSel = {}; S.memQ = '';
      S.host.roster.forEach(function (n) { if (CLUB.members.indexOf(n) >= 0) S.memSel[n] = 1; });
      sheet('<h2>회원에서 고르기</h2><input id="memQ" class="q" autocomplete="off" placeholder="이름 · 초성 검색"><div id="memBox">' + memSheet() + '</div>' +
        '<div class="btns"><button type="button" class="btn pri" data-act="memOk">넣기</button><button type="button" class="btn" data-act="closeSheet">취소</button></div>');
    },
    memTog: function (el) { var n = el.getAttribute('data-n'); if (S.memSel[n]) delete S.memSel[n]; else S.memSel[n] = 1; el.classList.toggle('on'); },
    memOk: function () {
      var H = S.host;
      H.roster = H.roster.filter(function (n) { return CLUB.members.indexOf(n) < 0 || S.memSel[n]; });
      addRoster(Object.keys(S.memSel)); closeSheet(); render();
    },
    mark: function (el) {
      var P = S.play, i = +el.getAttribute('data-i'), b = C.board(P.code, P.name), p = C.parseCode(P.code);
      if (!b[i]) return;
      var before = playClaim().count;
      P.marks[i] = !P.marks[i];
      var after = playClaim().count, was = P.won;
      P.won = after >= p.goal; savePlay();
      S.pop = P.marks[i] ? i : -1; render();
      if (P.won && !was) celebrate(true);
      else if (after > before) celebrate(false);
      else { FX.haptic('tap'); if (P.marks[i]) SND.tap(); else SND.off(); }
    },
    catchup: function () {
      sheet('<h2>⏩ 따라잡기</h2><p>늦게 왔거나 번호를 놓쳤나요? 진행자 화면의 ‘뽑은 번호’ 개수를 넣으면 그때까지 불린 번호를 내 판에 한 번에 표시해요.</p>' +
        '<label class="fld"><span>진행자가 뽑은 번호 개수</span><input id="fN" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off"></label>' +
        '<div class="btns"><button type="button" class="btn pri" data-act="catchupOk">표시하기</button><button type="button" class="btn" data-act="closeSheet">취소</button></div>');
      $('fN').focus();
    },
    catchupOk: function () {
      var P = S.play, p = C.parseCode(P.code), n = parseInt($('fN').value, 10);
      if (!(n >= 1 && n <= p.range)) { toast('1~' + p.range + ' 사이 숫자를 넣어 주세요', true); return; }
      var pr = C.progress(C.board(P.code, P.name), orderOf(P.code), n), was = P.won;
      P.marks = pr.marks.map(function (m, i) { return m || !!P.marks[i]; });
      P.won = playClaim().count >= p.goal; savePlay(); closeSheet(); render();
      if (P.won && !was) celebrate(true); else toast(n + '번째까지 불린 번호를 표시했어요');
    },
    clearMarks: function () { if (!confirm('표시를 모두 지울까요?')) return; S.play.marks = new Array(25).fill(false); S.play.won = false; savePlay(); render(); },
    leavePlay: function () { S.form.code = S.play.code; S.form.name = S.play.name; go('room'); },
    /* --- 직접 고르는 빙고 --- */
    duelStart: function () {
      if (S.duel && S.duel.phase === 'play' && S.duel.called.length) { if (!confirm('하던 게임을 그만두고 새로 시작할까요?')) return; dropStreak(); }
      var players = [], i;
      if (OPT.dmode === 'ai') {
        players.push({ name: OPT.name || '나', ai: false, board: new Array(25).fill(0) });
        for (i = 0; i < OPT.ais; i++) players.push({ name: BOTS[i], ai: true, board: C.randomBoard() });
      } else {
        for (i = 0; i < OPT.humans; i++) { var nm = (S.form['p' + i] == null ? OPT.pnames[i] || '' : S.form['p' + i]).trim().slice(0, 12); OPT.pnames[i] = nm; players.push({ name: nm || (i + 1) + '번', ai: false, board: new Array(25).fill(0) }); }
        saveOpt();
      }
      S.duel = { mode: OPT.dmode, level: OPT.level, goal: OPT.dgoal, players: players, phase: 'place', turn: 0, shown: OPT.dmode === 'ai', called: [], lastBy: -1, sel: 0, winners: [] };
      saveDuel(); go('duel');
    },
    duelAgain: function () { var D = S.duel; OPT.dmode = D.mode; OPT.level = D.level; OPT.dgoal = D.goal; if (D.mode === 'ai') OPT.ais = D.players.length - 1; else OPT.humans = D.players.length; S.duel = null; ACT.duelStart(); },
    duelQuit: function () { if (!confirm('이 게임을 그만둘까요?')) return; dropStreak(); S.duel = null; saveDuel(); go('duelSetup', true); },
    reveal: function () { S.duel.shown = true; saveDuel(); render(); },
    place: function (el) {
      var D = S.duel, b = D.players[D.turn].board, i = +el.getAttribute('data-i');
      if (b[i]) { b[i] = 0; SND.off(); } else { var nx = nextNum(b); if (!nx) return; b[i] = nx; S.pop = i; SND.tap(); }
      FX.haptic('tap'); saveDuel(); render();
    },
    autoFill: function () {
      var b = S.duel.players[S.duel.turn].board, rest = [], v;
      for (v = 1; v <= 25; v++) if (b.indexOf(v) < 0) rest.push(v);
      if (!rest.length) { rest = C.seq(25); b.fill(0); }   // 다 찬 판에서 누르면 새로 섞기
      C.shuffle(rest);
      for (var i = 0; i < 25; i++) if (!b[i]) b[i] = rest.pop();
      SND.tap(); saveDuel(); render();
    },
    clearBoard: function () { S.duel.players[S.duel.turn].board.fill(0); saveDuel(); render(); },
    placeDone: function () {
      var D = S.duel; if (nextNum(D.players[D.turn].board)) return;
      var nx = -1;
      for (var i = D.turn + 1; i < D.players.length; i++) if (!D.players[i].ai) { nx = i; break; }
      if (nx >= 0) { D.turn = nx; D.shown = false; }
      else { D.phase = 'play'; D.turn = Math.floor(Math.random() * D.players.length); D.shown = D.mode === 'ai'; D.linesMe = 0; }
      saveDuel(); render(); window.scrollTo(0, 0);
    },
    pickNum: function (el) {
      var D = S.duel; if (D.phase !== 'play' || D.players[D.turn].ai) return;
      var me = D.mode === 'ai' ? 0 : D.turn, v = D.players[me].board[+el.getAttribute('data-i')];
      if (D.called.indexOf(v) >= 0) return;
      D.sel = D.sel === v ? 0 : v; FX.haptic('tap'); SND.tap(); render();
    },
    callNum: function () { var D = S.duel; if (D.phase !== 'play' || D.players[D.turn].ai || !D.sel) return; FX.haptic('tap'); applyCall(D.sel); },
    /* --- 주제 빙고 --- */
    tfree: function () { OPT.tfree = $('fFree').checked; saveOpt(); render(); },
    topicMake: function () {
      if (S.topic && S.topic.cells.some(function (c) { return c.on && !c.free; }) && !confirm('만들어 둔 판을 지우고 새로 만들까요?')) return;
      if (makeTopic()) go('topic');
    },
    tmark: function (el) {
      var T = S.topic, i = +el.getAttribute('data-i'), c = T.cells[i];
      if (c.free) return;
      if (T.who) {
        sheet('<h2>' + esc(c.t) + '</h2><label class="fld"><span>찾은 사람 이름</span><input id="fWhoT" maxlength="12" autocomplete="off" list="memList2" value="' + esc(c.who || '') + '"></label>' +
          '<datalist id="memList2">' + CLUB.members.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>' +
          '<div class="btns"><button type="button" class="btn pri" data-act="whoOk" data-i="' + i + '">체크</button>' + (c.on ? '<button type="button" class="btn" data-act="whoOff" data-i="' + i + '">체크 지우기</button>' : '<button type="button" class="btn" data-act="closeSheet">취소</button>') + '</div>');
        if (!COARSE) $('fWhoT').focus();
        return;
      }
      var before = T.lines || 0;
      c.on = c.on ? 0 : 1; S.pop = c.on ? i : -1; FX.haptic('tap');
      topicAfter(before);
    },
    whoOk: function (el) {
      var T = S.topic, i = +el.getAttribute('data-i'), c = T.cells[i], name = $('fWhoT').value.trim().slice(0, 12), k = C.normName(name);
      if (k && T.cells.some(function (x, j) { return j !== i && x.on && C.normName(x.who) === k; })) { toast(name + ' 님은 이미 다른 칸에 적었어요', true); return; }
      var before = T.lines || 0; c.on = 1; c.who = name; S.pop = i; closeSheet(); topicAfter(before);
    },
    whoOff: function (el) { var T = S.topic, c = T.cells[+el.getAttribute('data-i')], before = T.lines || 0; c.on = 0; c.who = ''; closeSheet(); topicAfter(before); },
    topicClear: function () { if (!confirm('표시를 모두 지울까요?')) return; S.topic.cells.forEach(function (c) { if (!c.free) { c.on = 0; c.who = ''; } }); S.topic.lines = 0; saveTopic(); render(); },
    topicShuffle: function () {
      var T = S.topic;
      if (T.cells.some(function (c) { return c.on && !c.free; }) && !confirm('표시가 지워져요. 새로 섞을까요?')) return;
      var th = themeOf(T.theme), pool = T.words || wordsOf(th.id), n = T.n, free = T.cells.some(function (c) { return c.free; }), need = n * n - (free ? 1 : 0);
      if (pool.length < need) pool = T.cells.filter(function (c) { return !c.free; }).map(function (c) { return c.t; });
      var pick = C.shuffle(pool.slice()).slice(0, need), k = 0;
      T.cells = T.cells.map(function (c) { return c.free ? c : { t: pick[k++], on: 0, who: '' }; });
      T.lines = 0; saveTopic(); render(); SND.tap();
    },
    topicShot: function () {
      toast('이미지를 만드는 중…');
      FX.capture($('cap'), '잠만보_빙고_' + S.topic.title, { title: S.topic.title }).then(function (r) { if (r !== 'cancel') toast(r === 'shared' ? '공유했어요' : '이미지로 저장했어요'); }, function (e) { toast((e && e.message) || '이미지를 만들지 못했어요', true); });
    },
    topicShare: function () {
      var T = S.topic, url = pageUrl('?w=' + encodeURIComponent(T.words.join(',')) + '&n=' + T.n + '&t=' + encodeURIComponent(T.title));
      if (url.length > 1900) { toast('낱말이 너무 많아 링크로 못 만들어요', true); return; }
      shareLink('‘' + T.title + '’ 빙고 — 링크를 열면 같은 낱말로 내 판이 만들어져요', url);
    }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || el.disabled || el.tagName === 'INPUT' && el.type !== 'checkbox') return;
    var f = ACT[el.getAttribute('data-act')];
    if (f) f(el, e);
  });
  document.addEventListener('change', function (e) { if (e.target.id === 'fFree') ACT.tfree(); });
  document.addEventListener('input', function (e) {
    var t = e.target, f = t.getAttribute && t.getAttribute('data-f');
    if (t.id === 'memQ') { S.memQ = t.value; $('memBox').innerHTML = memSheet(); return; }
    if (!f) return;
    if (f === 'code') { t.value = C.normCode(t.value); $('codeInfo').textContent = codeInfo(C.parseCode(t.value)); }
    S.form[f] = t.value;
    if (f === 'custom') { OPT.custom = t.value; saveOpt(); $('wcnt').innerHTML = wordCount(parseWords(t.value).length, needWords()); }
    if (f === 'ctitle') { OPT.ctitle = t.value; saveOpt(); }
  });
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase(), typing = tag === 'input' || tag === 'textarea';
    if (e.key === 'Escape' && sheetOpen) { closeSheet(); return; }
    if (e.key === 'Enter' && typing) {
      var id = e.target.id;
      if (id === 'fCode' || id === 'fName') ACT.join(); else if (id === 'fWho') ACT.addWho(); else if (id === 'fN') ACT.catchupOk();
      else if (id === 'fWhoT') { var b = document.querySelector('[data-act="whoOk"]'); if (b) ACT.whoOk(b); }
      return;
    }
    if (typing || sheetOpen || document.querySelector('.jarc-bg')) return;
    if (S.view === 'host' && (e.key === ' ' || e.key === 'Enter') && tag !== 'button') { e.preventDefault(); ACT.draw(); }
  });
  $('back').onclick = function () {
    if (sheetOpen) { closeSheet(); return; }
    if (S.view === 'home') { location.href = ROOT; return; }
    go(BACK[S.view] || 'home', true);
  };
  $('sndBtn').onclick = function () { OPT.sound = !OPT.sound; saveOpt(); sndIcon(); if (OPT.sound) SND.tap(); toast(OPT.sound ? '소리 켬' : '소리 끔'); };
  document.addEventListener('visibilitychange', function () { if (!document.hidden) keepAwake(S.view === 'host' || S.view === 'duel'); });

  /* ---------- 시작: 주소의 ?room= (초대 링크) · ?w= (낱말 목록 공유) ---------- */
  scanClub(); sndIcon();
  (function () {
    var q = new URLSearchParams(location.search), room = C.normCode(q.get('room') || ''), w = q.get('w');
    if (room && C.parseCode(room)) {
      if (S.play && S.play.code === room) S.view = 'play';
      else if (S.host && S.host.code === room) S.view = 'host';
      else { S.form.code = room; S.view = 'room'; }
    } else if (w) {
      var words = parseWords(w), n = +q.get('n');
      if (words.length >= 8) {
        OPT.theme = 'custom'; OPT.custom = words.join('\n'); OPT.ctitle = String(q.get('t') || '').slice(0, 24); if (n >= 3 && n <= 5) OPT.tsize = n;
        saveOpt(); S.view = 'topicSetup';
      }
    }
    // 뒤로가기 기준점. 새로고침이면 보던 화면 그대로, 링크로 바로 들어온 화면은 홈 위에 한 칸
    var st = hstate();
    try {
      if (!room && !w && VIEWS[st.v] && Array.isArray(st.st)) { S.view = st.v; if (st.m) history.back(); }   // 창을 연 채 새로고침: 창은 사라졌으니 창 칸(m)을 뒤로 빼서, 뒤로가기 첫 번이 같은 화면으로 헛돌지 않게
      else {
        history.replaceState({ v: 'home', st: ['home'] }, '', location.pathname);
        if (S.view !== 'home') history.pushState({ v: S.view, st: ['home', S.view] }, '');
      }
    } catch (e) {}
  })();
  render();
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#arcRank') && window.JMB_ARCADE) JMB_ARCADE.openBoard('bingo'); });
})();
