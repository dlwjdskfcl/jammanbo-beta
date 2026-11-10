/* 잠만보 파티 게임 app.js — 모임 자리에서 폰 한 대로 하는 말놀이 · 추리 게임 모음 (서버 없음, 낱말은 data.js)
 * 라이어 게임 · 초성 퀴즈 · 금지어 게임 · 이마 퀴즈 · 밸런스/질문 카드 · 폭탄 돌리기
 * - 명단은 한 번 만들면 모든 게임이 같이 씀 (이 기기에 저장). 잠만보 데이터(jmb_data_v2)의 최근 모임 참가자 · 회원에서 불러올 수 있음 (읽기만)
 * - 한 번 나온 낱말은 '최근에 나온 낱말'로 적어 두고 안 나온 것부터 냄
 * - 화면: S.view 를 VIEWS 가 그림. 누르기는 data-act → ACT. 게임 안 단계(phase)는 history 에 쌓지 않음 */
(function () {
  'use strict';
  var DATA = window.JMB_PARTY_DATA;
  if (!DATA) return;
  var FX = window.JMB_FX || { avatar: function () { return ''; }, haptic: function () {}, confetti: function () {} };
  var VER = '1.0.0';
  var $ = function (id) { return document.getElementById(id); };
  var ROOT = (function () { var seg = location.pathname.split('/')[1] || ''; return /\.github\.io$/.test(location.hostname) && seg ? '/' + seg + '/' : '/'; })();
  var TOPICS = DATA.topics, TOPIC = {};
  TOPICS.forEach(function (t) { TOPIC[t.id] = t; });

  /* ---------- 저장 ---------- */
  var KEY = { opt: 'jmb_party_opt', roster: 'jmb_party_roster', recent: 'jmb_party_recent', liar: 'jmb_party_liar' };
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var DEF = {
    sound: true, seen: {},
    liar: { topic: 'rand', mode: 'normal', liars: 1, spy: false, sec: 0 },
    cho: { topic: 'all', len: 0, sec: 20, count: 10 },
    taboo: { sec: 60, turns: 3, pen: true, t1: '청팀', t2: '홍팀' },
    head: { topic: 'animal', sec: 60, tilt: false },
    bal: { tab: 'bal', cat: 'all' },
    bomb: { len: 'mid', cue: true }
  };
  var OPT = (function () {
    var saved = lsGet(KEY.opt, {}) || {}, o = {};
    Object.keys(DEF).forEach(function (k) {
      o[k] = DEF[k] && typeof DEF[k] === 'object' ? Object.assign({}, DEF[k], saved[k] && typeof saved[k] === 'object' ? saved[k] : {}) : (k in saved ? saved[k] : DEF[k]);
    });
    ['liar', 'head'].forEach(function (g) { if (o[g].topic !== 'rand' && !TOPIC[o[g].topic]) o[g].topic = DEF[g].topic; });
    if (o.cho.topic !== 'all' && !TOPIC[o.cho.topic]) o.cho.topic = 'all';
    return o;
  })();
  function saveOpt() { lsSet(KEY.opt, OPT); }
  var MAXP = 20;
  function normName(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }
  function uniq(a) { var seen = {}; return a.filter(function (x) { var k = normName(x); if (!k || seen[k]) return false; seen[k] = 1; return true; }); }
  var ROSTER = uniq((lsGet(KEY.roster, []) || []).map(function (s) { return String(s).trim().slice(0, 12); })).slice(0, MAXP);
  function saveRoster() { lsSet(KEY.roster, ROSTER); }
  var RECENT = lsGet(KEY.recent, {}) || {}, recT = 0;
  var LSC = lsGet(KEY.liar, null) || { scores: {}, rounds: 0 };   // 라이어 누적 점수
  if (!LSC.scores || typeof LSC.scores !== 'object') LSC = { scores: {}, rounds: 0 };
  var S = { view: 'home', L: null, C: null, T: null, H: null, HS: [], B: null, I: null, M: null };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var toastT = 0;
  function toast(msg, bad) { var t = $('toast'); t.textContent = msg; t.className = 'toast on' + (bad ? ' err' : ''); clearTimeout(toastT); toastT = setTimeout(function () { t.className = 'toast'; }, 2400); }
  function rand(n) { return Math.floor(Math.random() * n); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = rand(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
  function av(name, px) { return FX.avatar(name, px || 28); }

  /* ---------- 최근에 나온 낱말: 안 나온 것 먼저(섞어서), 나온 것은 오래된 것부터 뒤에 ---------- */
  function deck(key, ids) {
    var rec = RECENT[key] || [], has = {};
    ids.forEach(function (x) { has[x] = 1; });
    return shuffle(ids.filter(function (x) { return rec.indexOf(x) < 0; })).concat(rec.filter(function (x) { return has[x]; }));
  }
  function seen(key, id, size) {
    var rec = (RECENT[key] || []).filter(function (x) { return x !== id; }), cap = Math.max(1, Math.floor(size * 0.7));
    rec.push(id);
    while (rec.length > cap) rec.shift();
    RECENT[key] = rec;
    clearTimeout(recT); recT = setTimeout(function () { lsSet(KEY.recent, RECENT); }, 400);
  }
  // 덱에서 다음 장 (다 쓰면 다시 만듦)
  function draw(o, key, ids) {
    if (!o.dk || o.di >= o.dk.length) { o.dk = deck(key, ids); o.di = 0; }
    var id = o.dk[o.di++];
    seen(key, id, ids.length);
    return id;
  }

  /* ---------- 소리 (Web Audio 합성) ---------- */
  var AC = null;
  function ac() { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; }
  function tone(f, dur, type, vol, delay, f2) {
    if (!OPT.sound) return;
    try {
      var a = ac(), t = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.03);
    } catch (e) {}
  }
  function noise(dur, vol) {
    if (!OPT.sound) return;
    try {
      var a = ac(), n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      var src = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = vol || 0.5;
      src.buffer = buf; src.connect(f); f.connect(g); g.connect(a.destination); src.start();
    } catch (e) {}
  }
  var SND = {
    tap: function () { tone(700, 0.07, 'triangle', 0.09); },
    ok: function () { tone(784, 0.1, 'triangle', 0.13); tone(1175, 0.2, 'triangle', 0.13, 0.09); },
    pass: function () { tone(420, 0.12, 'sine', 0.1, 0, 300); },
    foul: function () { tone(150, 0.38, 'sawtooth', 0.14); tone(158, 0.38, 'square', 0.06); },
    tick: function () { tone(1000, 0.05, 'square', 0.05); },
    tock: function (hi) { tone(hi ? 1250 : 880, 0.045, 'square', 0.07); },
    end: function () { [0, 0.22, 0.44].forEach(function (d) { tone(880, 0.16, 'square', 0.09, d); }); },
    go: function () { tone(523, 0.1, 'triangle', 0.12); tone(1046, 0.3, 'triangle', 0.13, 0.1); },
    reveal: function () { [392, 494, 587].forEach(function (f, i) { tone(f, 0.2, 'triangle', 0.12, i * 0.11); }); },
    win: function () { [523, 659, 784, 1046, 784, 1046].forEach(function (f, i) { tone(f, i === 5 ? 0.6 : 0.15, 'triangle', 0.14, i * 0.12); }); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { tone(f, 0.25, 'sine', 0.1, i * 0.16); }); },
    boom: function () { noise(1.1, 0.9); tone(120, 0.9, 'sine', 0.5, 0, 32); }
  };
  function sndIcon() {
    $('sndBtn').innerHTML = OPT.sound
      ? '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
    $('sndBtn').setAttribute('aria-pressed', OPT.sound);
  }
  function celebrate() { FX.haptic('win'); SND.win(); FX.confetti({ count: 150 }); }

  /* ---------- 타이머 (실제 시각으로 계산, 화면은 #tmNum · #tmBar 만 고침) ---------- */
  var TM = { id: 0, left: 0, total: 0, last: 0, on: false, done: null, s: -1 };
  function tmPaint() {
    var n = $('tmNum'), b = $('tmBar'), el = $('tm'), s = Math.ceil(TM.left / 1000);
    if (n) n.textContent = s;
    if (b) b.style.width = (TM.total ? Math.max(0, TM.left / (TM.total * 1000) * 100) : 0) + '%';
    if (el) el.classList.toggle('low', s <= 5);
    if (s !== TM.s) { TM.s = s; if (TM.on && s <= 5 && s > 0) { SND.tick(); if (s <= 3) FX.haptic('tap'); } }
  }
  function tmTick() {
    if (!TM.on) return;
    var now = Date.now(); TM.left -= now - TM.last; TM.last = now;
    if (TM.left <= 0) { TM.left = 0; var d = TM.done; tmStop(); tmPaint(); if (d) d(); } else tmPaint();
  }
  function tmStart(sec, done) { tmStop(); TM.total = sec; TM.left = sec * 1000; TM.last = Date.now(); TM.on = true; TM.done = done; TM.s = -1; TM.id = setInterval(tmTick, 100); tmPaint(); }
  function tmStop() { clearInterval(TM.id); TM.id = 0; TM.on = false; TM.done = null; }
  function tmPause() { if (!TM.on) return; tmTick(); clearInterval(TM.id); TM.id = 0; TM.on = false; }
  function tmResume() { if (TM.on || TM.left <= 0 || !TM.done) return; TM.last = Date.now(); TM.on = true; TM.id = setInterval(tmTick, 100); }
  function tmHtml(sec) {
    var s = TM.done ? Math.ceil(TM.left / 1000) : sec;
    return '<div class="tm' + (s <= 5 ? ' low' : '') + '" id="tm"><b id="tmNum">' + s + '</b><i><s id="tmBar"></s></i></div>';
  }
  var wake = null;
  function keepAwake(on) {
    try {
      if (on && navigator.wakeLock && !wake) navigator.wakeLock.request('screen').then(function (w) { wake = w; w.addEventListener('release', function () { wake = null; }); }, function () {});
      if (!on && wake) { wake.release(); wake = null; }
    } catch (e) {}
  }

  /* ---------- 잠만보 데이터(이 기기에 저장된 것): 회원 · 최근 모임 참가자 — 읽기만, 없으면 버튼을 숨김 ---------- */
  var CLUB = { members: [], meet: null };
  function unpack(t) {
    if (t && Array.isArray(t.c) && Array.isArray(t.r)) return t.r.map(function (row) { var o = {}; t.c.forEach(function (k, i) { o[k] = row[i]; }); return o; });
    return Array.isArray(t) ? t : [];
  }
  function splitNames(p) { return (Array.isArray(p) ? p : String(p || '').split(/[,，、\n]+/)).map(function (s) { return String(s).trim(); }).filter(Boolean); }
  function scanClub() {
    try {
      var root = JSON.parse(localStorage.getItem('jmb_data_v2') || 'null'); if (!root) return;
      var d = root.d || root;
      CLUB.members = uniq(unpack(d.members).map(function (m) { return String(m.name || m['닉네임'] || '').trim(); }));
      var today = new Date(); today.setHours(23, 59, 59, 0);
      unpack(d.meetings).forEach(function (m) {
        var dt = new Date(String(m.date || '').trim().replace(/\.\s*/g, '-').replace(/-$/, '')), names = uniq(splitNames(m.participants));
        if (isNaN(dt) || dt > today || names.length < 2) return;
        if (!CLUB.meet || dt > CLUB.meet.d) CLUB.meet = { d: dt, names: names };
      });
    } catch (e) {}
  }
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function cho(s) { var o = ''; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i) - 0xAC00; o += c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : s[i]; } return o; }
  function koMatch(name, q) { if (!q) return true; name = name.toLowerCase().replace(/\s+/g, ''); q = q.toLowerCase().replace(/\s+/g, ''); return name.indexOf(q) >= 0 || cho(name).indexOf(q) >= 0; }
  function addNames(list) {
    var before = ROSTER.length;
    ROSTER = uniq(ROSTER.concat(list.map(function (s) { return String(s).trim().slice(0, 12); }))).slice(0, MAXP);
    saveRoster();
    return ROSTER.length - before;
  }

  /* ---------- 공통 조각 ---------- */
  function seg(g, key, list) {
    var val = OPT[g][key];
    return '<div class="seg" role="radiogroup">' + list.map(function (x) {
      return '<button type="button" role="radio" aria-checked="' + (x[0] === val) + '" class="' + (x[0] === val ? 'on' : '') + '" data-act="opt" data-g="' + g + '" data-k="' + key + '" data-v="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '</div>';
  }
  function topicGrid(g, list) {
    var cur = OPT[g].topic;
    return '<div class="themes">' + list.map(function (t) {
      return '<button type="button" class="theme' + (t.id === cur ? ' on' : '') + '" aria-pressed="' + (t.id === cur) + '" data-act="opt" data-g="' + g + '" data-k="topic" data-v="' + t.id + '"><span>' + t.icon + '</span><b>' + t.name + '</b></button>';
    }).join('') + '</div>';
  }
  function help(g, lines) {
    return '<details class="help"' + (OPT.seen[g] ? '' : ' open') + '><summary>📖 하는 법 <small>15초면 읽어요</small></summary><ol>' + lines.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ol></details>';
  }
  function markSeen(g) { if (!OPT.seen[g]) { OPT.seen[g] = 1; saveOpt(); } }
  function rosterCard(note) {
    var n = ROSTER.length;
    return '<button type="button" class="rost" data-act="go" data-v="roster"><span class="ic">👥</span><span class="tx"><b>참가자 ' + (n ? n + '명' : '없음') + '</b><small>' +
      (n ? esc(ROSTER.join(' · ')) : '눌러서 명단을 만드세요') + '</small>' + (note ? '<em>' + note + '</em>' : '') + '</span><span class="go">고치기 ›</span></button>';
  }
  function rankHtml(rows, unit) {
    return '<div class="rank">' + rows.map(function (r, i) {
      return '<div class="rk' + (i === 0 && r.s > 0 ? ' top' : '') + '"><i>' + (i + 1) + '</i>' + av(r.name, 30) + '<b>' + esc(r.name) + '</b>' + (r.d ? '<em>' + (r.d > 0 ? '+' : '') + r.d + '</em>' : '') + '<span>' + r.s + (unit || '점') + '</span></div>';
    }).join('') + '</div>';
  }
  function pgrid(names, act, on, badge) {
    return '<div class="pgrid">' + names.map(function (nm, i) {
      var sel = on && on.indexOf(i) >= 0;
      return '<button type="button" class="pb' + (sel ? ' on' : '') + '" aria-pressed="' + !!sel + '" data-act="' + act + '" data-i="' + i + '">' + av(nm, 34) + '<b>' + esc(nm) + '</b>' + (badge ? '<em>' + badge(nm) + '</em>' : '') + '</button>';
    }).join('') + '</div>';
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

  /* ================= 홈 · 명단 ================= */
  var GAMES = [
    { id: 'liar', icon: '🤥', name: '라이어 게임', desc: '한 명만 낱말을 모른다 — 라이어는 누구?', meta: '3~12명' },
    { id: 'cho', icon: 'ㄱㄴ', name: '초성 퀴즈', desc: '초성만 보고 먼저 외치는 사람이 점수', meta: '2명부터' },
    { id: 'taboo', icon: '🚫', name: '금지어 게임', desc: '금지어를 피해서 낱말 설명하기 · 팀 대결', meta: '4명부터 · 2팀' },
    { id: 'head', icon: '🙆', name: '이마 퀴즈', desc: '폰을 이마에! 친구들 설명을 듣고 맞히기', meta: '2명부터' },
    { id: 'bal', icon: '⚖️', name: '밸런스 · 질문 카드', desc: 'A vs B 투표 · 서먹함을 푸는 질문 뽑기', meta: '누구나' },
    { id: 'bomb', icon: '💣', name: '폭탄 돌리기', desc: '언제 터질지 모른다 — 말하고 넘겨!', meta: '3명부터' }
  ];
  var TITLE = { home: ['파티 게임', '폰 한 대로 다 같이'], roster: ['참가자 명단', '모든 게임이 같이 써요'] };
  GAMES.forEach(function (g) { TITLE[g.id] = [g.name, g.meta]; TITLE[g.id + 'Play'] = [g.name, g.meta]; });

  function vHome() {
    return '<div class="hero"><div class="logo"><i class="k1">🤥</i><i class="k0">ㄱㄴ</i><i class="k4">🚫</i><i class="k3">🙆</i><i class="k2">⚖️</i><i class="k5">💣</i></div>' +
      '<p>모임 자리에서 폰 한 대를 돌리거나 가운데 두고 하는 놀이</p></div>' +
      rosterCard() +
      '<div class="games">' + GAMES.map(function (g) {
        return '<button type="button" class="game g-' + g.id + '" data-act="go" data-v="' + g.id + '"><span class="ic">' + g.icon + '</span><span class="tx"><b>' + g.name + '</b><small>' + g.desc + '</small></span><em>' + g.meta + '</em></button>';
      }).join('') + '</div>' +
      '<p class="ver">파티 게임 v' + VER + ' · 낱말 ' + TOPICS.reduce(function (a, t) { return a + t.words.length; }, 0) + '개 · 금지어 카드 ' + DATA.taboo.length + '장 · 질문 ' + (DATA.balance.length + DATA.ice.length) + '개</p>';
  }
  function vRoster() {
    var n = ROSTER.length;
    return '<div class="card"><h3>이름 넣기 <small>' + n + ' / ' + MAXP + '명</small></h3>' +
      '<div class="addrow"><input id="fName" maxlength="12" autocomplete="off" enterkeyhint="done" placeholder="이름 · 별명"><button type="button" class="btn pri" data-act="addName">추가</button></div>' +
      '<div class="row wrap">' + (CLUB.meet ? '<button type="button" class="btn sm" data-act="addMeet">📅 최근 모임 참가자 ' + CLUB.meet.names.length + '명</button>' : '') +
      (CLUB.members.length ? '<button type="button" class="btn sm" data-act="pickMem">👥 회원에서 고르기</button>' : '') +
      '<button type="button" class="btn sm" data-act="addAnon">＋ 이름 없이 한 명</button></div></div>' +
      '<div class="card"><h3>명단 <small>이름을 누르면 빠져요</small></h3>' +
      (n ? '<div class="pchips">' + ROSTER.map(function (nm, i) { return '<button type="button" class="pchip" data-act="delName" data-i="' + i + '" aria-label="' + esc(nm) + ' 빼기">' + av(nm, 30) + '<b>' + esc(nm) + '</b><i>✕</i></button>'; }).join('') + '</div>' +
        '<div class="row wrap"><button type="button" class="btn sm" data-act="shufRoster">🔀 순서 섞기</button><button type="button" class="btn sm" data-act="clearRoster">모두 지우기</button></div>'
        : '<p class="hint">아직 아무도 없어요. 라이어 게임은 3명부터, 다른 게임은 명단 없이도 할 수 있어요.</p>') + '</div>' +
      '<button type="button" class="btn pri xl" data-act="back">다 됐어요</button>';
  }
  function memSheet() {
    var q = ($('memQ') || {}).value || '';
    var list = CLUB.members.filter(function (m) { return koMatch(m, q); });
    return list.length ? '<div class="memlist">' + list.map(function (m) {
      var on = ROSTER.some(function (r) { return normName(r) === normName(m); });
      return '<button type="button" class="chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-act="memToggle" data-n="' + esc(m) + '">' + esc(m) + '</button>';
    }).join('') + '</div>' : '<p class="hint">찾는 이름이 없어요</p>';
  }

  /* ================= 1. 라이어 게임 ================= */
  function liarCfg() {
    var n = ROSTER.length, maxBad = Math.floor((n - 1) / 2), liars = Math.max(1, Math.min(OPT.liar.liars, maxBad));
    return { n: n, liars: liars, spy: !!OPT.liar.spy && liars + 1 <= maxBad };
  }
  function liarScores(deltas) {
    var names = Object.keys(LSC.scores);
    ROSTER.forEach(function (nm) { if (names.indexOf(nm) < 0) names.push(nm); });
    return names.map(function (nm) { return { name: nm, s: LSC.scores[nm] || 0, d: deltas ? deltas[nm] || 0 : 0 }; }).sort(function (a, b) { return b.s - a.s; });
  }
  function vLiar() {
    var c = liarCfg(), o = OPT.liar, okN = c.n >= 3 && c.n <= 12, L = S.L;
    var warn = !okN ? (c.n < 3 ? '3명부터 할 수 있어요' : '12명까지 할 수 있어요')
      : (o.liars > c.liars ? '라이어 2명은 5명부터 — 이번 판은 1명' : '') + (o.spy && !c.spy ? (o.liars > c.liars ? ' · ' : '') + '스파이는 ' + (c.liars === 2 ? '7' : '5') + '명부터 — 이번 판은 없이' : '');
    return help('liar', ['폰을 돌려 가며 각자 <b>꾹 눌러</b> 낱말을 확인해요. 라이어만 낱말을 몰라요.', '정해진 순서대로 낱말을 <b>한 문장씩</b> 설명해요. 너무 뻔하면 라이어가 눈치채요!', '다 같이 라이어를 <b>지목</b>. 걸린 라이어가 낱말을 맞히면 역전승이에요.']) +
      rosterCard(warn) +
      (L && L.phase !== 'result' ? '<button type="button" class="btn act xl" data-act="lResume">▶ 하던 판 이어서 <small>주제 ' + esc(L.tp.name) + '</small></button>' : '') +
      '<div class="card"><h3>주제</h3>' + topicGrid('liar', [{ id: 'rand', icon: '🎲', name: '무작위' }].concat(TOPICS)) + '</div>' +
      '<div class="card"><h3>규칙</h3>' +
      '<div class="lab">라이어가 받는 것</div>' + seg('liar', 'mode', [['normal', '“당신은 라이어”'], ['fool', '비슷한 다른 낱말']]) +
      '<p class="hint">' + (o.mode === 'fool' ? '바보 라이어 — 라이어도 낱말을 받지만 남들과 달라요. 자기가 라이어인 줄 몰라요!' : '라이어는 주제만 알고 낱말은 몰라요.') + '</p>' +
      '<div class="lab">라이어 수</div>' + seg('liar', 'liars', [[1, '1명'], [2, '2명 (5명부터)']]) +
      '<div class="lab">스파이</div>' + seg('liar', 'spy', [[false, '없음'], [true, '있음 (5명부터)']]) +
      (o.spy ? '<p class="hint">스파이는 낱말을 알지만 라이어 편이에요. 라이어가 이기면 같이 이겨요.</p>' : '') +
      '<div class="lab">한 사람 설명 시간</div>' + seg('liar', 'sec', [[0, '없음'], [15, '15초'], [20, '20초'], [30, '30초']]) + '</div>' +
      '<button type="button" class="btn pri xl" data-act="lStart"' + (okN ? '' : ' disabled') + '>낱말 나눠 주기</button>' +
      (LSC.rounds ? '<div class="card sc"><h3>누적 점수 <small>' + LSC.rounds + '판</small></h3>' + rankHtml(liarScores()) + '<button type="button" class="link" data-act="lReset">점수 지우기</button></div>' : '');
  }
  function liarStart() {
    var c = liarCfg();
    if (c.n < 3 || c.n > 12) { toast('라이어 게임은 3~12명이 해요', true); return; }
    var pool = TOPICS.filter(function (t) { return t.id !== 'act'; });
    var tp = OPT.liar.topic === 'rand' ? pool[rand(pool.length)] : TOPIC[OPT.liar.topic];
    var word = draw({}, 'liar:' + tp.id, tp.words), wi = tp.words.indexOf(word);
    // 바보 라이어: 목록에서 가까운 자리(비슷한 낱말끼리 붙여 적어 둠)에서 다른 낱말
    var near = tp.words.filter(function (w, i) { return i !== wi && Math.abs(i - wi) <= 4; });
    var idx = shuffle(range(c.n)), role = {};
    idx.slice(0, c.liars).forEach(function (i) { role[i] = 'liar'; });
    if (c.spy) role[idx[c.liars]] = 'spy';
    S.L = {
      tp: tp, word: word, fool: OPT.liar.mode === 'fool' ? near[rand(near.length)] : '', sec: OPT.liar.sec, nl: c.liars,
      players: ROSTER.map(function (nm, i) { return { name: nm, role: role[i] || 'cit' }; }),
      order: shuffle(range(c.n)), phase: 'deal', di: 0, cover: true, held: false, ei: 0, lap: 1, picks: [], shown: false, out: '', deltas: null
    };
    markSeen('liar');
    go('liarPlay');
  }
  function liarSpeak() {
    render(); window.scrollTo(0, 0);
    var L = S.L;
    if (L.sec) tmStart(L.sec, function () { SND.end(); FX.haptic('warn'); var el = $('tm'); if (el) el.classList.add('over'); var n = $('tmNum'); if (n) n.textContent = '끝'; });
  }
  function liarFinish(out) {   // out: cit(시민 승) · guess(걸렸지만 낱말을 맞힘) · liar(안 걸림)
    var L = S.L, d = {};
    L.players.forEach(function (p) {
      var bad = p.role !== 'cit', v = out === 'cit' ? (bad ? 0 : 1) : out === 'guess' ? (bad ? 1 : 0) : (bad ? 2 : 0);
      if (v) { d[p.name] = v; LSC.scores[p.name] = (LSC.scores[p.name] || 0) + v; } else if (!(p.name in LSC.scores)) LSC.scores[p.name] = 0;
    });
    LSC.rounds++; lsSet(KEY.liar, LSC);
    L.out = out; L.deltas = d; L.phase = 'result';
    tmStop(); render(); window.scrollTo(0, 0);
    if (out === 'cit') celebrate(); else { SND.reveal(); FX.haptic('bomb'); }
  }
  function roleName(r) { return r === 'liar' ? '라이어' : r === 'spy' ? '스파이' : '시민'; }
  function vLiarPlay() {
    var L = S.L;
    if (!L) return vLiar();
    var n = L.players.length, p, h = '';
    var topic = '<div class="topicbar"><span>주제</span><b>' + L.tp.icon + ' ' + esc(L.tp.name) + '</b></div>';
    if (L.phase === 'deal') {
      p = L.players[L.di];
      if (L.cover) {
        return '<div class="pass"><div class="av">' + av(p.name, 96) + '</div><small>' + (L.di + 1) + ' / ' + n + '</small><h2>' + esc(p.name) + ' 님 차례</h2><p>다른 사람이 못 보게 폰을 건네주세요</p></div>' +
          '<button type="button" class="btn pri xl" data-act="lCover">내가 ' + esc(p.name) + '예요</button>';
      }
      var sec = p.role === 'liar' && !L.fool
        ? '<small>주제 · ' + esc(L.tp.name) + '</small><b class="word liar">당신은 라이어!</b><em>낱말을 아는 척하면서 무엇인지 알아내세요</em>'
        : '<small>주제 · ' + esc(L.tp.name) + '</small><b class="word">' + esc(p.role === 'liar' ? L.fool : L.word) + '</b>' +
          (p.role === 'spy' ? '<em class="spy">🕵️ 당신은 스파이 — 낱말은 알지만 라이어 편! 라이어가 안 걸리게 도우세요</em>' : '<em>라이어가 눈치채지 못하게 설명하세요</em>');
      return '<div class="who">' + av(p.name, 40) + '<b>' + esc(p.name) + ' 님의 카드</b><small>' + (L.di + 1) + ' / ' + n + '</small></div>' +
        '<button type="button" class="hold" data-hold aria-label="누르고 있는 동안 낱말 보기"><span class="h-off"><i>👆</i><b>꾹 누르고 있는 동안만 보여요</b><small>손을 떼면 다시 가려져요</small></span><span class="h-on">' + sec + '</span></button>' +
        '<button type="button" class="btn pri xl" id="lNext" data-act="lNext"' + (L.held ? '' : ' disabled') + '>' + (L.di + 1 < n ? '확인했어요 — 다음 사람에게' : '확인했어요 — 모두 끝') + '</button>';
    }
    if (L.phase === 'ready') {
      return '<div class="pass"><div class="em">🎬</div><h2>모두 확인했어요</h2><p>폰을 가운데 두고, 아래 순서대로 낱말을 <b>한 문장씩</b> 설명하세요</p></div>' + topic +
        '<div class="order">' + L.order.map(function (pi, i) { return '<span class="oc">' + '<i>' + (i + 1) + '</i>' + av(L.players[pi].name, 24) + esc(L.players[pi].name) + '</span>'; }).join('') + '</div>' +
        '<button type="button" class="btn pri xl" data-act="lBegin">설명 시작 ▶</button>';
    }
    if (L.phase === 'explain') {
      p = L.players[L.order[L.ei]];
      var last = L.ei === n - 1, nx = L.players[L.order[(L.ei + 1) % n]];
      return topic + '<div class="spk">' + av(p.name, 76) + '<h2>' + esc(p.name) + '</h2><p>' + (L.lap > 1 ? L.lap + '바퀴째 · ' : '') + '낱말을 한 문장으로 설명하세요</p></div>' +
        (L.sec ? tmHtml(L.sec) : '') +
        '<div class="order">' + L.order.map(function (pi, i) { return '<span class="oc' + (i < L.ei ? ' done' : i === L.ei ? ' cur' : '') + '"><i>' + (i + 1) + '</i>' + esc(L.players[pi].name) + '</span>'; }).join('') + '</div>' +
        (last ? '<button type="button" class="btn pri xl" data-act="lVote">설명 끝 — 라이어 지목하기</button><div class="btns"><button type="button" class="btn" data-act="lLap">🔁 한 바퀴 더</button></div>'
          : '<button type="button" class="btn pri xl" data-act="lSpk">다음 · ' + esc(nx.name) + ' ▶</button><button type="button" class="link" data-act="lVote">바로 지목으로 넘어가기</button>');
    }
    if (L.phase === 'vote') {
      return '<div class="card ct"><h2 class="big">라이어는 누구?</h2><p>하나, 둘, 셋에 다 같이 <b>손가락으로 지목!</b><br>가장 많이 지목된 <b>' + L.nl + '명</b>을 누르세요 (동점이면 다시 지목)</p></div>' +
        pgrid(L.players.map(function (q) { return q.name; }), 'lPick', L.picks) +
        '<button type="button" class="btn pri xl" data-act="lReveal"' + (L.picks.length === L.nl ? '' : ' disabled') + '>정체 공개</button>' +
        '<button type="button" class="link" data-act="lBack">설명을 더 들을래요</button>';
    }
    var caught = L.picks.filter(function (i) { return L.players[i].role === 'liar'; });
    if (L.phase === 'reveal') {
      h = L.picks.map(function (i) {
        var q = L.players[i];
        return '<div class="rv ' + q.role + '">' + av(q.name, 56) + '<div><small>' + esc(q.name) + ' 님은…</small><b>' + (q.role === 'liar' ? '라이어였습니다!' : q.role === 'spy' ? '스파이였습니다!' : '시민이었습니다') + '</b></div></div>';
      }).join('');
      if (!caught.length) return h + '<div class="card ct"><p>라이어를 놓쳤어요…</p></div><button type="button" class="btn pri xl" data-act="lEnd" data-o="liar">결과 보기</button>';
      return h + '<div class="card ct chance"><h3>🎯 라이어의 마지막 기회</h3><p><b>' + caught.map(function (i) { return esc(L.players[i].name); }).join(' · ') + '</b> 님, 낱말이 무엇인지 <b>말해 보세요!</b><br>맞히면 라이어의 역전승이에요.</p>' +
        (L.shown ? '<div class="ans"><small>낱말은</small><b>' + esc(L.word) + '</b></div>' : '') + '</div>' +
        (L.shown ? '<div class="row two"><button type="button" class="btn bad" data-act="lEnd" data-o="cit">틀렸어요<small>시민 승리</small></button><button type="button" class="btn okb" data-act="lEnd" data-o="guess">맞혔어요<small>라이어 역전승</small></button></div>'
          : '<button type="button" class="btn pri xl" data-act="lShow">라이어가 말했어요 — 정답 보기</button>');
    }
    // 결과
    var liars = L.players.filter(function (q) { return q.role === 'liar'; }), spy = L.players.filter(function (q) { return q.role === 'spy'; })[0];
    var bn = L.out === 'cit' ? ['🎉', '시민 승리!', '라이어를 잡았고, 라이어는 낱말을 못 맞혔어요 · 시민 +1'] : L.out === 'guess' ? ['😎', '라이어 역전승!', '걸렸지만 낱말을 맞혔어요 · 라이어 편 +1'] : ['🤥', '라이어 승리!', '끝까지 들키지 않았어요 · 라이어 편 +2'];
    return '<div class="card result' + (L.out === 'cit' ? ' win' : ' lie') + '"><div class="em">' + bn[0] + '</div><h2>' + bn[1] + '</h2><p>' + bn[2] + '</p>' +
      '<div class="ans"><small>낱말은</small><b>' + esc(L.word) + '</b>' + (L.fool ? '<small>라이어가 받은 낱말 · <b>' + esc(L.fool) + '</b></small>' : '') + '</div>' +
      '<div class="roles"><span class="liar">라이어 · ' + liars.map(function (q) { return esc(q.name); }).join(', ') + '</span>' + (spy ? '<span class="spy">스파이 · ' + esc(spy.name) + '</span>' : '') + '</div></div>' +
      '<div class="card sc"><h3>누적 점수 <small>' + LSC.rounds + '판</small></h3>' + rankHtml(liarScores(L.deltas)) + '</div>' +
      '<button type="button" class="btn pri xl" data-act="lStart">다음 판 ▶</button>' +
      '<div class="btns"><button type="button" class="btn" data-act="go" data-v="liar">주제 · 규칙 바꾸기</button></div>';
  }

  /* ================= 2. 초성 퀴즈 ================= */
  var HAN = /^[가-힣 ]+$/;
  function bare(w) { return w.replace(/\s+/g, ''); }
  function choPool() {
    var o = OPT.cho, ts = o.topic === 'all' ? TOPICS.filter(function (t) { return t.cho !== false; }) : [TOPIC[o.topic]], out = [];
    function ok(n, len) { return len === 2 ? n === 2 : len === 3 ? n === 3 : len === 4 ? n >= 4 && n <= 7 : n >= 2 && n <= 7; }
    ts.forEach(function (t) { t.words.forEach(function (w) { if (HAN.test(w) && ok(bare(w).length, o.len)) out.push(t.id + '|' + w); }); });
    return out;
  }
  function vCho() {
    var n = choPool().length;
    return help('cho', ['화면에 <b>초성</b>이 뜨면, 주제에 맞는 낱말을 <b>먼저 외친</b> 사람이 점수!', '진행자가 맞힌 사람 이름을 누르면 점수가 올라가요. 초성만 맞으면 다른 낱말도 정답으로 쳐 주세요.', '아무도 모르면 <b>패스</b>. ‘정답 예시 보기’로 답을 확인할 수 있어요.']) +
      rosterCard('명단이 없어도 돼요 — 있으면 점수를 따로 세요') +
      '<div class="card"><h3>주제</h3>' + topicGrid('cho', [{ id: 'all', icon: '🌈', name: '전부 섞어서' }].concat(TOPICS.filter(function (t) { return t.cho !== false; }))) + '</div>' +
      '<div class="card"><h3>규칙 <small>낼 수 있는 문제 ' + n + '개</small></h3>' +
      '<div class="lab">글자 수</div>' + seg('cho', 'len', [[0, '섞어서'], [2, '2글자'], [3, '3글자'], [4, '4글자↑']]) +
      '<div class="lab">문제당 시간</div>' + seg('cho', 'sec', [[0, '없음'], [10, '10초'], [20, '20초'], [30, '30초']]) +
      '<div class="lab">문제 수</div>' + seg('cho', 'count', [[10, '10문제'], [15, '15문제'], [20, '20문제'], [0, '계속']]) + '</div>' +
      '<button type="button" class="btn pri xl" data-act="cStart"' + (n >= 5 ? '' : ' disabled') + '>시작</button>' + (n >= 5 ? '' : '<p class="hint ct bad">이 주제에는 그 글자 수 낱말이 모자라요</p>');
  }
  function choNext() {
    var C = S.C;
    if (C.total && C.n >= C.total) { choEnd(); return; }
    var id = draw(C, 'cho', C.pool), tid = id.split('|')[0], w = id.split('|')[1], c = cho(bare(w));
    var same = TOPIC[tid].words.filter(function (x) { return x !== w && HAN.test(x) && cho(bare(x)) === c; });
    C.q = { tp: TOPIC[tid], w: w, cho: cho(w), same: same };
    C.n++; C.phase = 'q'; C.show = false; C.got = null;
    render(); window.scrollTo(0, 0);
    if (OPT.cho.sec) tmStart(OPT.cho.sec, function () { C.phase = 'a'; C.got = 'time'; SND.end(); FX.haptic('warn'); render(); });
  }
  function choEnd() {
    tmStop(); S.C.phase = 'end'; render(); window.scrollTo(0, 0);
    if (S.C.named ? Object.keys(S.C.scores).length : S.C.cnt) celebrate();
  }
  function vChoPlay() {
    var C = S.C;
    if (!C) return vCho();
    if (!C.q) return '';   // 첫 문제를 뽑기 직전
    if (C.phase === 'end') {
      var rows = ROSTER.map(function (nm) { return { name: nm, s: C.scores[nm] || 0 }; }).sort(function (a, b) { return b.s - a.s; });
      var top = rows.length && rows[0].s > 0 ? rows.filter(function (r) { return r.s === rows[0].s; }).map(function (r) { return esc(r.name); }).join(' · ') : '';
      return '<div class="card result win"><div class="em">🏆</div><h2>' + (C.named ? (top ? top + ' 우승!' : '아무도 못 맞혔어요') : '끝! ' + C.cnt + '문제 맞힘') + '</h2><p>' + C.n + '문제 · 패스 ' + C.pass + '개</p></div>' +
        (C.named ? '<div class="card sc">' + rankHtml(rows) + '</div>' : '') +
        '<button type="button" class="btn pri xl" data-act="cStart">한 판 더 ▶</button><div class="btns"><button type="button" class="btn" data-act="go" data-v="cho">주제 · 규칙 바꾸기</button></div>';
    }
    var q = C.q, len = bare(q.w).length + (q.w.length - bare(q.w).length) * 0.5;
    var head = '<div class="qhead"><span class="no">' + C.n + (C.total ? ' / ' + C.total : '번째') + '</span><span class="tp">' + q.tp.icon + ' ' + esc(q.tp.name) + '</span></div>' +
      '<div class="chobox" style="--n:' + Math.max(2, len) + '"><b>' + esc(q.cho) + '</b><small>' + bare(q.w).length + '글자</small></div>';
    var answers = '<div class="answers"><small>정답 예시</small><b>' + esc(q.w) + '</b>' + q.same.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>';
    if (C.phase === 'q') {
      return head + (OPT.cho.sec ? tmHtml(OPT.cho.sec) : '') + (C.show ? answers : '') +
        (C.named ? '<div class="lab ct">맞힌 사람을 누르세요</div>' + pgrid(ROSTER, 'cGot', null, function (nm) { return C.scores[nm] || 0; })
          : '<button type="button" class="btn okb xl" data-act="cGot" data-i="-1">맞혔어요! <small>지금까지 ' + C.cnt + '개</small></button>') +
        '<div class="row two"><button type="button" class="btn" data-act="cShow">' + (C.show ? '🙈 정답 가리기' : '👀 정답 예시 보기') + '</button><button type="button" class="btn" data-act="cPass">패스 ▶</button></div>' +
        '<button type="button" class="link" data-act="cEnd">여기서 끝내기</button>';
    }
    var msg = C.got === 'time' ? ['time', '⏰ 시간 끝!'] : C.got === 'pass' ? ['pass', '패스'] : ['ok', '✅ ' + (C.named ? esc(C.got) + ' 정답!' : '정답!')];
    return head + '<div class="strip ' + msg[0] + '">' + msg[1] + '</div>' + answers +
      '<button type="button" class="btn pri xl" data-act="cNext">' + (C.total && C.n >= C.total ? '결과 보기' : '다음 문제 ▶') + '</button>' +
      (msg[0] === 'ok' ? '<button type="button" class="link" data-act="cUndo">잘못 눌렀어요 — 되돌리기</button>' : '<button type="button" class="link" data-act="cEnd">여기서 끝내기</button>');
  }

  /* ================= 3. 금지어 게임 ================= */
  var TABOO = {}, TABOO_IDS = DATA.taboo.map(function (l) { var p = l.split('|'); TABOO[p[0]] = p[1].split(','); return p[0]; });
  function vTaboo() {
    var o = OPT.taboo;
    return help('taboo', ['두 팀으로 나눠요. 설명하는 사람이 폰을 들고, <b>상대 팀 한 명</b>이 옆에서 금지어를 감시해요.', '제한 시간 동안 낱말을 설명 — 단, 빨간 <b>금지어</b>와 낱말 자체는 말하면 안 돼요 (몸짓도 금지).', '우리 팀이 맞히면 <b>맞힘</b>, 어려우면 <b>패스</b>, 금지어를 말하면 상대가 <b>금지어!</b>']) +
      '<div class="card"><h3>팀 이름</h3><div class="names"><label class="fld t0"><span>첫 번째 팀</span><input id="fT1" data-opt="t1" maxlength="8" autocomplete="off" value="' + esc(o.t1) + '"></label><label class="fld t1"><span>두 번째 팀</span><input id="fT2" data-opt="t2" maxlength="8" autocomplete="off" value="' + esc(o.t2) + '"></label></div></div>' +
      '<div class="card"><h3>규칙 <small>카드 ' + TABOO_IDS.length + '장</small></h3>' +
      '<div class="lab">한 차례 시간</div>' + seg('taboo', 'sec', [[45, '45초'], [60, '60초'], [90, '90초']]) +
      '<div class="lab">팀마다 차례</div>' + seg('taboo', 'turns', [[2, '2번'], [3, '3번'], [4, '4번'], [5, '5번']]) +
      '<div class="lab">금지어를 말하면</div>' + seg('taboo', 'pen', [[true, '−1점'], [false, '점수 그대로']]) + '</div>' +
      '<button type="button" class="btn pri xl" data-act="tStart">시작</button>';
  }
  function tabooTeam(T, k) { return T.teams[(T.turn + (k || 0)) % 2]; }
  function tabooCard(T) { T.cur = draw(T, 'taboo', TABOO_IDS); }
  function tabooTurnEnd() {
    var T = S.T;
    if (T.cur) T.log.push({ w: T.cur, r: 'time' });
    T.cur = null; T.phase = 'turnEnd'; T.paused = false;
    SND.end(); FX.haptic('warn'); render(); window.scrollTo(0, 0);
    if (T.turn + 1 >= T.total) { var a = T.teams[0].score, b = T.teams[1].score; if (a !== b) setTimeout(celebrate, 300); }
  }
  function tabooGain(T) { return T.log.reduce(function (s, x) { return s + (x.r === 'ok' ? 1 : x.r === 'foul' && T.pen ? -1 : 0); }, 0); }
  function tabooScore(T) {
    return '<div class="tscore">' + T.teams.map(function (t, i) { return '<div class="ts t' + i + (T.phase !== 'final' && i === T.turn % 2 ? ' cur' : '') + '"><small>' + esc(t.name) + '</small><b>' + t.score + '</b></div>'; }).join('<i>:</i>') + '</div>';
  }
  function vTabooPlay() {
    var T = S.T;
    if (!T) return vTaboo();
    var tm = tabooTeam(T), ti = T.turn % 2, other = tabooTeam(T, 1);
    if (T.phase === 'ready') {
      return '<div class="pass t' + ti + '"><small>' + (T.turn + 1) + ' / ' + T.total + '번째 차례</small><h2 class="tname">' + esc(tm.name) + ' 차례</h2>' +
        '<p>설명할 사람이 폰을 드세요.<br><b>' + esc(other.name) + '</b> 한 명은 옆에서 금지어를 감시!</p></div>' + tabooScore(T) +
        '<button type="button" class="btn pri xl" data-act="tGo">준비됐어요 — 시작 ▶</button>';
    }
    if (T.phase === 'play') {
      var f = TABOO[T.cur] || [];
      return '<div class="tbar t' + ti + '"><b>' + esc(tm.name) + '</b><span>이번 차례 ' + (tabooGain(T) > 0 ? '+' : '') + tabooGain(T) + '</span></div>' + tmHtml(T.sec) +
        (T.paused ? '<button type="button" class="tcard paused" data-act="tPause"><b class="tw">⏸ 멈춤</b><small>누르면 이어서 해요</small></button>'
          : '<div class="tcard"><small>이 낱말을 설명하세요</small><b class="tw" style="--n:' + Math.max(3, T.cur.length) + '">' + esc(T.cur) + '</b><div class="forb"><i>🚫 금지어</i>' + f.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div></div>') +
        '<div class="tbtns"><button type="button" class="b-pass" data-act="tAct" data-r="pass"' + (T.paused ? ' disabled' : '') + '>패스</button><button type="button" class="b-foul" data-act="tAct" data-r="foul"' + (T.paused ? ' disabled' : '') + '>금지어!</button>' +
        '<button type="button" class="b-ok" data-act="tAct" data-r="ok"' + (T.paused ? ' disabled' : '') + '>맞힘</button></div>' +
        (T.paused ? '<button type="button" class="link" data-act="tQuit">이 차례 여기서 끝내기</button>' : '<button type="button" class="link" data-act="tPause">⏸ 잠깐 멈추기</button>');
    }
    var MARK = { ok: ['ok', '맞힘 +1'], pass: ['pass', '패스'], foul: ['foul', T.pen ? '금지어 −1' : '금지어'], time: ['time', '시간 끝'] };
    var log = T.log.length ? '<div class="tlog">' + T.log.map(function (x) { return '<div class="tl ' + MARK[x.r][0] + '"><b>' + esc(x.w) + '</b><span>' + MARK[x.r][1] + '</span></div>'; }).join('') + '</div>' : '';
    if (T.phase === 'turnEnd') {
      var g = T.gain, fin = T.turn + 1 >= T.total;
      return '<div class="pass t' + ti + '"><small>⏰ 시간 끝!</small><h2 class="tname">' + esc(tm.name) + ' ' + (g > 0 ? '+' : '') + g + '점</h2></div>' + tabooScore(T) +
        '<div class="card">' + (log || '<p class="hint ct">이번 차례에는 넘긴 카드가 없어요</p>') + '</div>' +
        '<button type="button" class="btn pri xl" data-act="tNext">' + (fin ? '최종 결과 보기' : '다음 · ' + esc(other.name) + ' 차례 ▶') + '</button>';
    }
    var a = T.teams[0], b = T.teams[1], w = a.score === b.score ? null : a.score > b.score ? a : b;
    return '<div class="card result win"><div class="em">' + (w ? '🏆' : '🤝') + '</div><h2>' + (w ? esc(w.name) + ' 승리!' : '무승부!') + '</h2><p>' + T.total / 2 + '번씩 설명했어요</p></div>' + tabooScore(T) +
      '<button type="button" class="btn pri xl" data-act="tStart">한 판 더 ▶</button><div class="btns"><button type="button" class="btn" data-act="go" data-v="taboo">규칙 바꾸기</button></div>';
  }

  /* ================= 4. 이마 퀴즈 ================= */
  var headT = 0, tiltH = null;
  function vHead() {
    var act = OPT.head.topic === 'act';
    return help('head', ['한 사람이 폰을 <b>가로로 눕혀 이마에</b> 대요 (화면이 친구들 쪽). 자기는 낱말을 못 봐요.', '친구들이 낱말을 ' + (act ? '<b>몸짓으로만</b>' : '말로') + ' 설명 — 낱말 자체를 말하면 안 돼요.', '맞히면 화면 <b>오른쪽</b>, 모르면 <b>왼쪽</b>(패스)을 눌러요. 시간 안에 많이 맞히기!']) +
      rosterCard('명단이 없어도 돼요 — 있으면 차례대로 돌아가요') +
      '<div class="card"><h3>주제</h3>' + topicGrid('head', TOPICS) + (act ? '<p class="hint">‘몸으로 말해요’는 말 없이 몸짓으로만 설명하세요.</p>' : '') + '</div>' +
      '<div class="card"><h3>규칙</h3><div class="lab">시간</div>' + seg('head', 'sec', [[60, '60초'], [90, '90초'], [120, '120초']]) +
      '<div class="lab">맞힘 · 패스</div>' + seg('head', 'tilt', [[false, '화면 누르기'], [true, '기울이기도 같이']]) +
      (OPT.head.tilt ? '<p class="hint">고개를 <b>숙이면 맞힘</b>, <b>젖히면 패스</b> (기기에 따라 안 될 수 있어요 · 아이폰은 ‘동작 접근’ 허용 필요). 화면 누르기도 그대로 돼요.</p>' : '') + '</div>' +
      '<button type="button" class="btn pri xl" data-act="hNew">시작</button>' +
      (S.HS.length ? '<div class="card sc"><h3>오늘 기록</h3>' + rankHtml(S.HS.slice().sort(function (a, b) { return b.s - a.s; }), '개') + '<button type="button" class="link" data-act="hReset">기록 지우기</button></div>' : '');
  }
  function headWho(H) { return ROSTER.length ? ROSTER[H.pi % ROSTER.length] : ''; }
  function headStop() { clearTimeout(headT); headT = 0; if (tiltH) { window.removeEventListener('deviceorientation', tiltH); tiltH = null; } }
  function tiltOn() {
    if (tiltH) return;
    var armed = false, R = Math.PI / 180;
    tiltH = function (e) {   // 화면이 향하는 쪽의 위아래 성분: 0 = 세워 둠, -1 = 바닥을 봄(숙임), +1 = 천장을 봄(젖힘)
      var H = S.H;
      if (!H || H.phase !== 'play' || H.lock || e.beta == null || e.gamma == null) return;
      var nz = Math.cos(e.beta * R) * Math.cos(e.gamma * R);
      if (Math.abs(nz) < 0.3) armed = true;
      else if (armed && nz < -0.6) { armed = false; headAns('ok'); }
      else if (armed && nz > 0.6) { armed = false; headAns('pass'); }
    };
    window.addEventListener('deviceorientation', tiltH);
  }
  function headCount() {
    var H = S.H;
    if (!H || S.view !== 'headPlay') return;
    if (H.cnt > 0) { render(); SND.tock(false); FX.haptic('tap'); H.cnt--; headT = setTimeout(headCount, 900); return; }
    H.phase = 'play'; H.cur = draw(H, 'head:' + H.tp.id, H.tp.words); SND.go(); FX.haptic('turn');
    render();
    tmStart(H.sec, headEnd);
  }
  function headAns(r) {
    var H = S.H;
    if (!H || H.phase !== 'play' || H.lock) return;
    H.log.push({ w: H.cur, r: r }); H.lock = true; H.flash = r;
    if (r === 'ok') { SND.ok(); FX.haptic('turn'); } else { SND.pass(); FX.haptic('tap'); }
    render();
    headT = setTimeout(function () {
      if (S.H !== H || H.phase !== 'play') return;
      H.lock = false; H.flash = ''; H.cur = draw(H, 'head:' + H.tp.id, H.tp.words); render();
    }, 420);
  }
  function headEnd() {
    var H = S.H;
    if (!H) return;
    headStop(); tmStop();
    if (!H.lock && H.cur) H.log.push({ w: H.cur, r: 'time' });
    H.phase = 'end'; H.score = H.log.filter(function (x) { return x.r === 'ok'; }).length;
    S.HS.push({ name: headWho(H) || (S.HS.length + 1) + '번째', s: H.score });
    SND.end(); FX.haptic('warn'); render(); window.scrollTo(0, 0);
    if (H.score >= 5) setTimeout(function () { FX.confetti({ count: 80, duration: 1600 }); }, 250);
  }
  function vHeadPlay() {
    var H = S.H;
    if (!H) return vHead();
    var who = headWho(H), act = H.tp.id === 'act';
    if (H.phase === 'end') {
      var nextWho = ROSTER.length ? ROSTER[(H.pi + 1) % ROSTER.length] : '';
      return '<div class="card result win"><div class="em">⏰</div><h2>' + (who ? esc(who) + ' · ' : '') + H.score + '개 맞힘!</h2><p>' + H.tp.icon + ' ' + esc(H.tp.name) + ' · 패스 ' + H.log.filter(function (x) { return x.r === 'pass'; }).length + '개</p></div>' +
        '<div class="card"><div class="tlog">' + H.log.map(function (x) { return '<div class="tl ' + x.r + '"><b>' + esc(x.w) + '</b><span>' + (x.r === 'ok' ? '맞힘' : x.r === 'pass' ? '패스' : '시간 끝') + '</span></div>'; }).join('') + '</div></div>' +
        '<button type="button" class="btn pri xl" data-act="hNew" data-next="1">' + (nextWho ? '다음 · ' + esc(nextWho) + ' ▶' : '다음 사람 ▶') + '</button>' +
        '<div class="btns"><button type="button" class="btn" data-act="go" data-v="head">주제 바꾸기 · 기록 보기</button></div>';
    }
    var inner;
    if (H.phase === 'ready') {
      inner = '<button type="button" class="hx" data-act="back" aria-label="나가기">✕</button><div class="hready">' + (who ? '<div class="hwho">' + av(who, 44) + '<b>' + esc(who) + ' 님 차례</b></div>' : '') +
        '<h2>폰을 가로로 눕혀 이마에 대세요</h2><p>화면이 친구들을 향하게! 친구들은 낱말을 ' + (act ? '<b>몸짓으로만</b>' : '<b>말로</b>') + ' 설명해요.</p>' +
        '<div class="hguide"><span class="l">◀ 왼쪽 누르기<b>패스</b></span><span class="r">오른쪽 누르기 ▶<b>맞힘</b></span></div>' +
        '<button type="button" class="btn pri xl" data-act="hGo">준비 완료 — 3초 뒤 시작</button></div>';
    } else if (H.phase === 'count') {
      inner = '<div class="hcount"><b>' + H.cnt + '</b><small>이마에 대세요!</small></div>';
    } else {
      var okN = H.log.filter(function (x) { return x.r === 'ok'; }).length;
      inner = '<div class="hz"><button type="button" class="hz-l" data-act="hAns" data-r="pass" aria-label="패스"><span>◀ 패스</span></button><button type="button" class="hz-r" data-act="hAns" data-r="ok" aria-label="맞힘"><span>맞힘 ▶</span></button></div>' +
        '<div class="htop"><span class="hsc">✓ ' + okN + '</span>' + tmHtml(H.sec) + '<span class="htp">' + H.tp.icon + ' ' + esc(H.tp.name) + '</span></div>' +
        '<div class="hword" style="--n:' + Math.max(3, H.cur.length) + '"><b>' + esc(H.cur) + '</b></div>' +
        '<button type="button" class="hx" data-act="hQuit" aria-label="그만하기">✕</button>' +
        (H.flash ? '<div class="hflash ' + H.flash + '"><b>' + (H.flash === 'ok' ? '정답!' : '패스') + '</b></div>' : '');
    }
    return '<div class="stage ' + H.phase + '"><div class="stg">' + inner + '</div></div>';
  }

  /* ================= 5. 밸런스 게임 · 질문 카드 ================= */
  function balNew() {
    var B = S.B = S.B || { n: 0 };
    var p = draw(B, 'bal', DATA.balance).split('|');
    B.q = p[0]; B.A = p[1]; B.Bt = p[2]; B.a = 0; B.b = 0; B.hist = []; B.shown = false; B.n++;
  }
  function icePool() { var c = OPT.bal.cat; return DATA.ice.filter(function (l) { return c === 'all' || l.split('|')[0] === c; }); }
  function iceNew() {
    var I = S.I = S.I || { n: 0 };
    if (I.cat !== OPT.bal.cat) { I.cat = OPT.bal.cat; I.dk = null; }
    var p = draw(I, 'ice', icePool()).split('|');
    I.c = p[0]; I.q = p[1]; I.who = ''; I.n++;
  }
  function vBal() {
    var tab = OPT.bal.tab, h = seg('bal', 'tab', [['bal', '⚖️ 밸런스 게임'], ['ice', '💬 질문 카드']]);
    if (tab === 'bal') {
      if (!S.B) balNew();
      var B = S.B, N = ROSTER.length >= 2 ? ROSTER.length : 0, tot = B.a + B.b, pa = tot ? Math.round(B.a / tot * 100) : 0;
      return h + '<div class="qhead"><span class="no">' + B.n + '번째</span><span class="tp">' + (N ? '투표 ' + tot + ' / ' + N + '명' : '투표 ' + tot + '표') + '</span></div>' +
        '<p class="bq">' + esc(B.q) + '</p>' +
        '<div class="vs' + (B.shown ? ' shown' : '') + '">' +
        '<button type="button" class="va" data-act="bVote" data-s="a"><b>' + esc(B.A) + '</b>' + (B.shown ? '<em>' + pa + '%</em><small>' + B.a + '표</small>' : '') + '</button><i>VS</i>' +
        '<button type="button" class="vb" data-act="bVote" data-s="b"><b>' + esc(B.Bt) + '</b>' + (B.shown ? '<em>' + (tot ? 100 - pa : 0) + '%</em><small>' + B.b + '표</small>' : '') + '</button></div>' +
        (B.shown ? '<p class="hint ct">' + (B.a === B.b ? '팽팽해요! 서로 설득해 보세요' : '소수파의 이유를 먼저 들어 볼까요?') + '</p>'
          : '<div class="row two"><button type="button" class="btn" data-act="bUndo"' + (tot ? '' : ' disabled') + '>↩ 한 표 되돌리기</button><button type="button" class="btn" data-act="bShow"' + (tot ? '' : ' disabled') + '>결과 보기</button></div>') +
        '<button type="button" class="btn pri xl" data-act="bNext">다음 질문 ▶</button><div class="gap"></div>' +
        help('bal', ['둘 중 하나를 골라요. <b>하나, 둘, 셋</b>에 손을 들어도 되고,', '폰을 돌리며 한 명씩 <b>고른 쪽을 눌러</b> 표를 모아도 돼요 (결과는 다 누른 뒤에 공개).', '왜 그쪽을 골랐는지 이야기해 보세요!']);
    }
    if (!S.I || S.I.cat !== OPT.bal.cat) iceNew();
    var I = S.I;
    return h + '<div class="lab">질문 갈래</div>' + seg('bal', 'cat', [['all', '전부'], ['보드게임', '보드게임'], ['일상', '일상'], ['만약에', '만약에']]) +
      '<div class="qcard"><span class="cat">' + esc(I.c) + '</span><b>' + esc(I.q) + '</b></div>' +
      (I.who ? '<div class="whobox">' + av(I.who, 44) + '<b>' + esc(I.who) + ' 님이 먼저!</b></div>' : '') +
      (ROSTER.length >= 2 ? '<div class="btns"><button type="button" class="btn" data-act="iWho">🎯 ' + (I.who ? '다른 사람 뽑기' : '답할 사람 뽑기') + '</button></div>' : '') +
      '<button type="button" class="btn pri xl" data-act="iNext">다음 질문 ▶</button>' +
      '<p class="hint ct">돌아가며 답하거나, 뽑힌 사람이 먼저 답해요. 답하기 싫은 질문은 넘겨도 돼요.</p>';
  }

  /* ================= 6. 폭탄 돌리기 ================= */
  var BOMB_LEN = { short: [8, 20], mid: [15, 40], long: [30, 70] }, bombT = 0, bombEnd = 0;
  function vBomb() {
    return help('bomb', ['둥글게 앉아 폰(폭탄)을 들어요. 주제에 맞는 낱말을 <b>하나 말하고</b> 옆 사람에게 넘겨요.', '이미 나온 낱말은 안 돼요. 못 말하면 계속 들고 있어야 해요!', '폭탄은 <b>아무 때나</b> 터져요. 터질 때 들고 있던 사람이 벌칙.']) +
      rosterCard('명단이 없어도 돼요 — 있으면 누가 몇 번 터졌는지 세요') +
      '<div class="card"><h3>규칙</h3><div class="lab">터지는 때</div>' + seg('bomb', 'len', [['short', '금방 (8~20초)'], ['mid', '보통 (15~40초)'], ['long', '길게 (30~70초)']]) +
      '<div class="lab">주제</div>' + seg('bomb', 'cue', [[true, '주제 뽑아 주기'], [false, '우리가 정할게요']]) + '</div>' +
      '<button type="button" class="btn pri xl" data-act="mNew">시작</button>';
  }
  function bombStop() { clearTimeout(bombT); bombT = 0; }
  function bombTick() {
    var M = S.M;
    if (!M || M.phase !== 'run') return;
    var now = Date.now(), p = Math.min(1, (now - M.t0) / (bombEnd - M.t0));
    if (now >= bombEnd) { bombStop(); M.phase = 'boom'; SND.boom(); FX.haptic('bomb'); setTimeout(function () { FX.haptic('bomb'); }, 300); render(); window.scrollTo(0, 0); return; }
    M.beat = !M.beat; SND.tock(M.beat); if (p > 0.6) FX.haptic('tap');
    var el = $('bombIco'); if (el) { el.classList.remove('beat'); void el.offsetWidth; el.classList.add('beat'); }
    bombT = setTimeout(bombTick, Math.min(bombEnd - now, p < 0.45 ? 620 : 620 - (p - 0.45) / 0.55 * 440));
  }
  function vBombPlay() {
    var M = S.M;
    if (!M) return vBomb();
    var cue = OPT.bomb.cue ? '<div class="cue"><small>이번 주제</small><b>' + esc(M.cue) + '</b></div>' : '<div class="cue"><small>이번 주제</small><b>우리가 정한 주제</b></div>';
    if (M.phase === 'ready') {
      return '<div class="qhead"><span class="no">' + M.n + '번째 폭탄</span></div>' + cue +
        (OPT.bomb.cue ? '<div class="btns"><button type="button" class="btn" data-act="mCue">🔄 다른 주제</button></div>' : '') +
        '<p class="hint ct top">낱말을 하나 말하고 옆 사람에게 폰을 넘기세요.<br>터질 때 들고 있으면 벌칙!</p>' +
        '<button type="button" class="btn pri xl" data-act="mGo">💣 불 붙이기</button>' + bombPen(M);
    }
    if (M.phase === 'run') {
      return '<div class="bomb run">' + cue + '<div class="bico" id="bombIco">💣</div><p>말하고 넘겨요!</p></div><button type="button" class="link" data-act="mStop">멈추기</button>';
    }
    return '<div class="bomb boom"><div class="bico">💥</div><h2>펑!</h2><p>' + (M.who ? esc(M.who) + ' 님 벌칙!' : '들고 있던 사람이 벌칙!') + '</p></div>' +
      (ROSTER.length && !M.who ? '<div class="lab ct">누가 들고 있었나요?</div>' + pgrid(ROSTER, 'mWho') : '') +
      '<button type="button" class="btn pri xl" data-act="mNew" data-next="1">다음 폭탄 ▶</button>' + bombPen(M) +
      '<div class="btns"><button type="button" class="btn" data-act="go" data-v="bomb">규칙 바꾸기</button></div>';
  }
  function bombPen(M) {
    var rows = Object.keys(M.pen).map(function (nm) { return { name: nm, s: M.pen[nm] }; }).sort(function (a, b) { return b.s - a.s; });
    return rows.length ? '<div class="card sc"><h3>💥 터진 횟수</h3>' + rankHtml(rows, '번') + '</div>' : '';
  }

  /* ================= 화면 ================= */
  var VIEWS = { home: vHome, roster: vRoster, liar: vLiar, liarPlay: vLiarPlay, cho: vCho, choPlay: vChoPlay, taboo: vTaboo, tabooPlay: vTabooPlay, head: vHead, headPlay: vHeadPlay, bal: vBal, bomb: vBomb, bombPlay: vBombPlay };
  var NEED = { liarPlay: 'L', choPlay: 'C', tabooPlay: 'T', headPlay: 'H', bombPlay: 'M' };   // 판이 없으면(새로고침 등) 설정 화면으로
  function render() {
    if (NEED[S.view] && !S[NEED[S.view]]) S.view = S.view.replace('Play', '');
    var t = TITLE[S.view] || TITLE.home;
    $('ttl').textContent = t[0]; $('sub').textContent = t[1];
    document.title = S.view === 'home' ? '잠만보 파티 게임' : t[0] + ' · 잠만보 파티 게임';
    document.documentElement.setAttribute('data-view', S.view);
    $('view').innerHTML = VIEWS[S.view]();
    keepAwake(/Play$/.test(S.view) || S.view === 'bal');
  }
  // 화면을 떠날 때: 돌던 타이머 · 폭탄 · 기울기 감지를 멈춤 (라이어 판은 남겨 둬서 '이어서' 가능)
  function leave(from, to) {
    if (from === to) return;
    tmStop(); bombStop(); headStop();
    if (from === 'choPlay') S.C = null;
    if (from === 'tabooPlay') S.T = null;
    if (from === 'headPlay') S.H = null;
    if (from === 'bombPlay' && S.M) { S.M.phase = 'ready'; }
    if (from === 'liarPlay' && S.L && S.L.phase === 'result') S.L = null;
  }
  /* 화면 이동과 뒤로가기: 화면을 옮길 때마다 history 에 한 칸 (state.st = 지나온 화면들).
   * 이미 지나온 화면으로 가면 그만큼 되돌아감 → 뒤로가기는 늘 창 닫기 → 이전 화면 → 홈 → (홈에서) 페이지 떠나기 */
  function go(v) {
    var stack = (hstate().st || ['home']).slice(), k = sheetOpen && hstate().m ? 1 : 0, i = stack.lastIndexOf(v), from = S.view;
    closeSheet(true);
    leave(from, v);
    S.view = v;
    try {
      if (i >= 0) { k += stack.length - 1 - i; if (k) history.go(-k); }   // popstate 가 오지만 화면은 이미 같음
      else if (k) history.replaceState({ v: v, st: stack.concat(v) }, '');
      else history.pushState({ v: v, st: stack.concat(v) }, '');
    } catch (e) {}
    render(); window.scrollTo(0, 0);
  }
  window.addEventListener('popstate', function (e) {
    var st = e.state || {};
    if (st.jarc) return;   // 랭킹 창(arcade.js)이 쌓은 칸
    if (sheetOpen && !st.m) closeSheet(true);
    var v = VIEWS[st.v] ? st.v : 'home';
    if (NEED[v] && !S[NEED[v]]) v = v.replace('Play', '');
    if (v === S.view) return;
    if (S.view === 'liarPlay' && S.L && S.L.phase !== 'result') toast('하던 판은 남겨 뒀어요 · ‘이어서’로 계속');
    leave(S.view, v);
    S.view = v; render(); window.scrollTo(0, 0);
  });
  function back() {
    if (sheetOpen) { closeSheet(); return; }
    if (S.view === 'home') { location.href = ROOT; return; }
    var st = hstate().st || [];
    if (st.length > 1) { try { history.back(); return; } catch (e) {} }
    go('home');
  }

  /* ================= 누르기 ================= */
  function val(s) { return s === 'true' ? true : s === 'false' ? false : /^\d+$/.test(s) ? +s : s; }
  var ACT = {
    go: function (el) { SND.tap(); go(el.getAttribute('data-v')); },
    back: function () { back(); },
    closeSheet: function (el, e) { if (e.target === el) closeSheet(); },
    opt: function (el) {
      var g = el.getAttribute('data-g'), k = el.getAttribute('data-k');
      OPT[g][k] = val(el.getAttribute('data-v')); saveOpt(); SND.tap();
      if (g === 'cho' && k === 'topic' && choPool().length < 5) OPT.cho.len = 0;
      if (g === 'bal' && k === 'cat') iceNew();
      render();
    },
    /* 명단 */
    addName: function () {
      var f = $('fName'), nm = String(f.value || '').trim().slice(0, 12);
      if (!nm) { f.focus(); return; }
      if (ROSTER.length >= MAXP) { toast(MAXP + '명까지 넣을 수 있어요', true); return; }
      if (!addNames([nm])) { toast('이미 있는 이름이에요', true); f.select(); return; }
      SND.tap(); render(); $('fName').focus();
    },
    addAnon: function () {
      if (ROSTER.length >= MAXP) { toast(MAXP + '명까지 넣을 수 있어요', true); return; }
      var i = 1; while (!addNames(['참가자' + i]) && i < 99) i++;
      SND.tap(); render();
    },
    delName: function (el) { ROSTER.splice(+el.getAttribute('data-i'), 1); saveRoster(); render(); },
    shufRoster: function () { ROSTER = shuffle(ROSTER); saveRoster(); SND.tap(); render(); },
    clearRoster: function () { sheet('<h2>명단을 모두 지울까요?</h2><p>참가자 ' + ROSTER.length + '명을 지워요. 게임 점수는 그대로 남아요.</p><div class="row"><button type="button" class="btn" data-act="closeSheetBtn">아니요</button><button type="button" class="btn pri" data-act="clearRosterOk">지우기</button></div>'); },
    clearRosterOk: function () { ROSTER = []; saveRoster(); closeSheet(); render(); },
    closeSheetBtn: function () { closeSheet(); },
    addMeet: function () { var n = addNames(CLUB.meet.names); toast(n ? n + '명을 넣었어요' : '이미 다 들어 있어요'); render(); },
    pickMem: function () {
      sheet('<h2>회원에서 고르기</h2><input id="memQ" class="q" autocomplete="off" placeholder="이름 · 초성 검색"><div id="memBox">' + memSheet() + '</div><div class="row"><button type="button" class="btn pri" data-act="closeSheetBtn">다 골랐어요</button></div>');
    },
    memToggle: function (el) {
      var nm = el.getAttribute('data-n'), i = -1;
      ROSTER.forEach(function (r, k) { if (normName(r) === normName(nm)) i = k; });
      if (i >= 0) ROSTER.splice(i, 1);
      else if (ROSTER.length >= MAXP) { toast(MAXP + '명까지 넣을 수 있어요', true); return; }
      else ROSTER.push(nm.slice(0, 12));
      saveRoster(); $('memBox').innerHTML = memSheet(); render();
    },
    /* 라이어 */
    lStart: function () { SND.tap(); liarStart(); },
    lResume: function () { go('liarPlay'); if (S.L.phase === 'explain') liarSpeak(); },
    lReset: function () { LSC = { scores: {}, rounds: 0 }; lsSet(KEY.liar, LSC); toast('점수를 지웠어요'); render(); },
    lCover: function () { S.L.cover = false; S.L.held = false; SND.tap(); render(); },
    lNext: function () {
      var L = S.L; L.di++; L.cover = true; L.held = false; SND.tap();
      if (L.di >= L.players.length) L.phase = 'ready';
      render(); window.scrollTo(0, 0);
    },
    lBegin: function () { S.L.phase = 'explain'; S.L.ei = 0; SND.go(); liarSpeak(); },
    lSpk: function () { S.L.ei++; SND.tap(); FX.haptic('tap'); liarSpeak(); },
    lLap: function () { S.L.ei = 0; S.L.lap++; SND.tap(); liarSpeak(); },
    lVote: function () { tmStop(); S.L.phase = 'vote'; S.L.picks = []; SND.reveal(); render(); window.scrollTo(0, 0); },
    lBack: function () { S.L.phase = 'explain'; S.L.ei = 0; S.L.lap++; liarSpeak(); },
    lPick: function (el) {
      var L = S.L, i = +el.getAttribute('data-i'), k = L.picks.indexOf(i);
      if (k >= 0) L.picks.splice(k, 1); else { if (L.picks.length >= L.nl) L.picks.shift(); L.picks.push(i); }
      SND.tap(); render();
    },
    lReveal: function () {
      var L = S.L; if (L.picks.length !== L.nl) return;
      L.phase = 'reveal'; L.shown = false; render(); window.scrollTo(0, 0);
      if (L.picks.some(function (i) { return L.players[i].role === 'liar'; })) { SND.ok(); FX.haptic('win'); } else { SND.foul(); FX.haptic('warn'); }
    },
    lShow: function () { S.L.shown = true; SND.reveal(); render(); },
    lEnd: function (el) { liarFinish(el.getAttribute('data-o')); },
    /* 초성 */
    cStart: function () {
      var pool = choPool();
      if (pool.length < 5) return;
      markSeen('cho'); SND.go();
      S.C = { pool: pool, dk: null, di: 0, n: 0, total: OPT.cho.count, scores: {}, cnt: 0, pass: 0, named: ROSTER.length >= 2, phase: 'q', show: false, got: null, q: null };
      if (S.view !== 'choPlay') go('choPlay');
      choNext();
    },
    cShow: function () { S.C.show = !S.C.show; render(); },
    cGot: function (el) {
      var C = S.C, i = +el.getAttribute('data-i');
      tmStop(); C.phase = 'a';
      if (i >= 0) { C.got = ROSTER[i]; C.scores[C.got] = (C.scores[C.got] || 0) + 1; } else { C.got = '정답'; C.cnt++; }
      SND.ok(); FX.haptic('turn'); render();
    },
    cUndo: function () {
      var C = S.C;
      if (C.named && C.scores[C.got]) C.scores[C.got]--; else if (!C.named && C.cnt) C.cnt--;
      C.phase = 'q'; C.got = null; C.show = true; render();
    },
    cPass: function () { var C = S.C; tmStop(); C.phase = 'a'; C.got = 'pass'; C.pass++; SND.pass(); render(); },
    cNext: function () { SND.tap(); choNext(); },
    cEnd: function () { if (S.C.phase === 'q') S.C.n--; choEnd(); },
    /* 금지어 */
    tStart: function () {
      var o = OPT.taboo, a = String(o.t1 || '').trim() || '청팀', b = String(o.t2 || '').trim() || '홍팀';
      if (a === b) b = b + ' 2';
      markSeen('taboo'); SND.tap();
      S.T = { teams: [{ name: a, score: 0 }, { name: b, score: 0 }], turn: 0, total: o.turns * 2, sec: o.sec, pen: !!o.pen, dk: null, di: 0, phase: 'ready', log: [], cur: null, paused: false, gain: 0 };
      if (S.view !== 'tabooPlay') go('tabooPlay'); else { render(); window.scrollTo(0, 0); }
    },
    tGo: function () { var T = S.T; T.phase = 'play'; T.log = []; T.paused = false; tabooCard(T); SND.go(); render(); window.scrollTo(0, 0); tmStart(T.sec, tabooFinishTurn); },
    tAct: function (el) {
      var T = S.T, r = el.getAttribute('data-r');
      if (T.phase !== 'play' || T.paused) return;
      T.log.push({ w: T.cur, r: r });
      if (r === 'ok') { SND.ok(); FX.haptic('turn'); } else if (r === 'foul') { SND.foul(); FX.haptic('warn'); } else { SND.pass(); FX.haptic('tap'); }
      tabooCard(T); render();
    },
    tPause: function () { var T = S.T; T.paused = !T.paused; if (T.paused) tmPause(); else tmResume(); render(); },
    tQuit: function () { tmStop(); tabooFinishTurn(); },
    tNext: function () {
      var T = S.T; SND.tap();
      if (T.turn + 1 >= T.total) { T.phase = 'final'; render(); window.scrollTo(0, 0); return; }
      T.turn++; T.phase = 'ready'; T.log = []; render(); window.scrollTo(0, 0);
    },
    /* 이마 퀴즈 */
    hNew: function (el) {
      var prev = S.H, tp = TOPIC[OPT.head.topic] || TOPICS[0];
      markSeen('head'); SND.tap(); headStop(); tmStop();
      S.H = { tp: tp, sec: OPT.head.sec, dk: null, di: 0, log: [], phase: 'ready', cnt: 3, cur: '', lock: false, flash: '', score: 0, pi: prev && el.getAttribute('data-next') ? prev.pi + 1 : S.HS.length };
      if (S.view !== 'headPlay') go('headPlay'); else { render(); window.scrollTo(0, 0); }
    },
    hGo: function () {
      var H = S.H;
      if (OPT.head.tilt) {
        try {
          var DO = window.DeviceOrientationEvent;
          if (DO && typeof DO.requestPermission === 'function') DO.requestPermission().then(function (r) { if (r === 'granted') tiltOn(); else toast('기울이기를 쓸 수 없어요 · 화면을 눌러 주세요'); }, function () {});
          else if (DO) tiltOn();
        } catch (e) {}
      }
      ac && OPT.sound && ac();
      H.phase = 'count'; H.cnt = 3; headCount();
    },
    hAns: function (el) { headAns(el.getAttribute('data-r')); },
    hQuit: function () { var H = S.H; if (H.log.length) headEnd(); else back(); },
    hReset: function () { S.HS = []; render(); },
    /* 밸런스 · 질문 */
    bVote: function (el) {
      var B = S.B, s = el.getAttribute('data-s'), N = ROSTER.length >= 2 ? ROSTER.length : 0;
      if (B.shown) return;
      B[s]++; B.hist.push(s); SND.tap(); FX.haptic('tap');
      if (N && B.a + B.b >= N) { B.shown = true; SND.reveal(); }
      render();
    },
    bUndo: function () { var B = S.B, s = B.hist.pop(); if (s) { B[s]--; render(); } },
    bShow: function () { S.B.shown = true; SND.reveal(); markSeen('bal'); render(); },
    bNext: function () { markSeen('bal'); balNew(); SND.tap(); render(); window.scrollTo(0, 0); },
    iNext: function () { iceNew(); SND.tap(); render(); },
    iWho: function () {
      var I = S.I, pool = ROSTER.filter(function (nm) { return nm !== I.who; });
      I.who = pool[rand(pool.length)]; SND.reveal(); FX.haptic('turn'); render();
    },
    /* 폭탄 */
    mNew: function (el) {
      markSeen('bomb'); SND.tap(); bombStop();
      var M = S.M = S.M || { n: 0, pen: {} };
      if (!el.getAttribute('data-next') && S.view !== 'bombPlay') { M.n = 0; M.pen = {}; }
      M.n++; M.phase = 'ready'; M.who = ''; M.cue = draw(M, 'bomb', DATA.bomb);
      if (S.view !== 'bombPlay') go('bombPlay'); else { render(); window.scrollTo(0, 0); }
    },
    mCue: function () { S.M.cue = draw(S.M, 'bomb', DATA.bomb); SND.tap(); render(); },
    mGo: function () {
      var M = S.M, r = BOMB_LEN[OPT.bomb.len] || BOMB_LEN.mid;
      M.phase = 'run'; M.t0 = Date.now(); bombEnd = M.t0 + (r[0] + Math.random() * (r[1] - r[0])) * 1000; M.beat = false;
      SND.go(); render(); window.scrollTo(0, 0);
      bombT = setTimeout(bombTick, 500);
    },
    mStop: function () { bombStop(); S.M.phase = 'ready'; render(); },
    mWho: function (el) { var M = S.M, nm = ROSTER[+el.getAttribute('data-i')]; M.who = nm; M.pen[nm] = (M.pen[nm] || 0) + 1; SND.tap(); render(); }
  };
  function tabooFinishTurn() {
    var T = S.T;
    T.gain = tabooGain(T); tabooTeam(T).score += T.gain;
    tabooTurnEnd();
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || el.disabled) return;
    var f = ACT[el.getAttribute('data-act')];
    if (f) f(el, e);
  });
  // 꾹 누르고 있는 동안만 보이는 카드 (라이어 낱말)
  var holdEl = null;
  function holdOff() {
    if (!holdEl) return;
    holdEl.classList.remove('show'); holdEl = null;
    if (S.L && S.view === 'liarPlay' && S.L.phase === 'deal') { S.L.held = true; var b = $('lNext'); if (b) b.disabled = false; }
  }
  function holdOn(h) { holdEl = h; h.classList.add('show'); FX.haptic('tap'); }
  document.addEventListener('pointerdown', function (e) { var h = e.target.closest ? e.target.closest('[data-hold]') : null; if (h) holdOn(h); });
  ['pointerup', 'pointercancel'].forEach(function (ev) { document.addEventListener(ev, holdOff); });
  window.addEventListener('blur', holdOff);
  document.addEventListener('contextmenu', function (e) { if (e.target.closest && e.target.closest('[data-hold]')) e.preventDefault(); });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'memQ') $('memBox').innerHTML = memSheet();
    else if (t.getAttribute && t.getAttribute('data-opt')) { OPT.taboo[t.getAttribute('data-opt')] = String(t.value).slice(0, 8); saveOpt(); }
  });
  document.addEventListener('keydown', function (e) {
    var t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    if (e.key === 'Escape' && sheetOpen) { closeSheet(); return; }
    if (typing) { if (e.key === 'Enter' && t.id === 'fName') ACT.addName(); return; }
    if ((e.key === ' ' || e.key === 'Enter') && t && t.hasAttribute && t.hasAttribute('data-hold')) { e.preventDefault(); if (!holdEl) holdOn(t); return; }
    if (sheetOpen) return;
    var r = e.key === 'ArrowRight' ? 'ok' : e.key === 'ArrowLeft' ? 'pass' : e.key === 'ArrowDown' ? 'foul' : '';
    if (!r) return;
    if (S.view === 'headPlay' && S.H && S.H.phase === 'play' && r !== 'foul') { e.preventDefault(); headAns(r); }
    else if (S.view === 'tabooPlay' && S.T && S.T.phase === 'play' && !S.T.paused) { e.preventDefault(); ACT.tAct({ getAttribute: function () { return r; } }); }
  });
  document.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') holdOff(); });
  $('back').onclick = back;
  $('sndBtn').onclick = function () { OPT.sound = !OPT.sound; saveOpt(); sndIcon(); if (OPT.sound) SND.tap(); toast(OPT.sound ? '소리 켬' : '소리 끔'); };
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) holdOff(); else keepAwake(/Play$/.test(S.view) || S.view === 'bal');
  });

  /* ---------- 시작: 늘 홈에서 (하던 판은 기억하지 않음 — 라이어 누적 점수 · 명단 · 설정만 남음) ---------- */
  scanClub(); sndIcon();
  try { history.replaceState({ v: 'home', st: ['home'] }, '', location.pathname); } catch (e) {}
  render();
})();
