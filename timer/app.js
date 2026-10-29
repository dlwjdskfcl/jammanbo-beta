/* 잠만보 보드게임 타이머 v1.0.0 — 화면 · 소리 · 저장 (시계 계산은 clock.js)
 * - 서버·DB 없음. 설정과 진행 중인 게임만 이 기기 localStorage 에 저장 (jmb_tm_*)
 * - 진행 중인 게임은 턴·멈춤마다, 그리고 화면을 떠날 때 저장 → 새로고침·앱 전환 뒤 '이어서' (멈춘 상태로)
 * - 시간은 실제 시각으로 계산 → 화면이 잠깐 멈추거나 다른 앱을 봐도 정확함
 */
(function () {
  'use strict';
  var C = window.TimerClock;
  if (!C) return;
  var $ = function (id) { return document.getElementById(id); };
  var VER = '1.0.1';
  var FX = window.JMB_FX || null;
  var now = function () { return Date.now(); };

  /* ---------- 저장 ---------- */
  var KEY = { opt: 'jmb_tm_opt', game: 'jmb_tm_game' };
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  var DEF = {
    mode: 'chess', sound: true, face: true,
    chess: { main: 600000, inc: 'none', incSec: 5, byoN: 3, byoSec: 30, onFlag: 'continue' },
    turn: { limit: 60000, bank: 0, onOver: 'count' },
    sand: { dur: 60000, num: true },
    players: [{ name: '', color: 0 }, { name: '', color: 1 }]
  };
  var OPT = (function () {
    var o = lsGet(KEY.opt, {}) || {};
    return {
      mode: ['chess', 'turn', 'sand'].indexOf(o.mode) >= 0 ? o.mode : DEF.mode,
      sound: o.sound !== false, face: o.face !== false,
      chess: Object.assign({}, DEF.chess, o.chess), turn: Object.assign({}, DEF.turn, o.turn), sand: Object.assign({}, DEF.sand, o.sand),
      players: Array.isArray(o.players) && o.players.length >= 1 ? o.players.slice(0, 8) : DEF.players.slice()
    };
  })();
  function saveOpt() { lsSet(KEY.opt, OPT); }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 색 (보드게임 말 색 8가지) ---------- */
  var COLORS = [
    { c: '#e5484d', n: '빨강' }, { c: '#3b6fe0', n: '파랑' }, { c: '#f2b705', n: '노랑', ink: '#2b2100' }, { c: '#2f9e57', n: '초록' },
    { c: '#8e4ec6', n: '보라' }, { c: '#f76b15', n: '주황' }, { c: '#0f9f9f', n: '청록' }, { c: '#e0457b', n: '분홍' }
  ];
  function col(i) { return COLORS[((i % 8) + 8) % 8]; }
  function pname(p, i) { return (p.name || '').trim() || '플레이어 ' + (i + 1); }

  /* ---------- 시간 글자 ---------- */
  // 카운트다운: 올림(0:01 다음이 0:00) · 10초 아래는 0.1초까지 · 음수는 '-'
  function clock(ms, opt) {
    opt = opt || {};
    var neg = ms < 0, a = Math.abs(ms);
    if (opt.tenths && !neg && a < 10000) return (Math.ceil(a / 100) / 10).toFixed(1);
    var s = opt.up || neg ? Math.floor(a / 1000) : Math.ceil(a / 1000);
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
    return (neg ? (opt.plus ? '+' : '-') : '') + (h ? h + ':' + pad(m) : m) + ':' + pad(ss);
  }
  // 설정 화면용: 10분 · 1분 30초 · 45초 · 1시간 30분
  function dur(ms) {
    var s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60, o = [];
    if (h) o.push(h + '시간'); if (m) o.push(m + '분'); if (ss || !o.length) o.push(ss + '초');
    return o.join(' ');
  }
  function durShort(ms) { var s = Math.round(ms / 1000); return s >= 60 && s % 60 === 0 ? s / 60 + '분' : s >= 60 ? clock(ms) : s + '초'; }

  /* ---------- 소리 (WebAudio, 파일 없음) ---------- */
  var SND = {
    ctx: null, out: null,
    init: function () {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); this.out = this.ctx.createGain(); this.out.gain.value = 0.6; this.out.connect(this.ctx.destination); } catch (e) { this.ctx = null; }
    },
    on: function () { return OPT.sound && this.ctx; },
    tone: function (f, d, type, vol, f2, delay) {
      var c = this.ctx, t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(this.out); o.start(t); o.stop(t + d + 0.02);
    },
    noise: function (d, vol, f) {
      var c = this.ctx, n = Math.floor(c.sampleRate * d), b = c.createBuffer(1, n, c.sampleRate), x = b.getChannelData(0);
      for (var i = 0; i < n; i++) x[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / n);
      var s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
      fl.type = 'bandpass'; fl.frequency.value = f || 1200; g.gain.value = vol || 0.2;
      s.buffer = b; s.connect(fl); fl.connect(g); g.connect(this.out); s.start();
    },
    // 체스 클락 버튼 '딸깍'
    pass: function () { if (this.on()) { this.tone(1800, 0.025, 'square', 0.05, 900); this.tone(240, 0.07, 'triangle', 0.14, 140, 0.004); } },
    start: function () { if (this.on()) { this.tone(660, 0.1, 'triangle', 0.12); this.tone(990, 0.18, 'triangle', 0.12, 0, 0.09); } },
    tick: function () { if (this.on()) this.tone(1500, 0.03, 'square', 0.025); },
    warn: function (hi) { if (this.on()) this.tone(hi ? 1320 : 880, hi ? 0.16 : 0.09, 'triangle', 0.14); },
    flag: function () { if (this.on()) [0, 0.22, 0.44].forEach(function (d) { SND.tone(880, 0.16, 'square', 0.08, 0, d); SND.tone(660, 0.16, 'square', 0.06, 0, d + 0.09); }); },
    undo: function () { if (this.on()) this.tone(520, 0.12, 'triangle', 0.1, 330); },
    pause: function () { if (this.on()) this.tone(440, 0.1, 'sine', 0.1, 330); },
    flip: function () { if (this.on()) { this.noise(0.5, 0.25, 900); this.tone(300, 0.2, 'sine', 0.06, 600, 0.3); } },
    bell: function () { if (this.on()) [1046, 1318, 1568, 2093].forEach(function (f, i) { SND.tone(f, 0.9, 'sine', 0.12, 0, i * 0.16); SND.tone(f * 2.01, 0.5, 'sine', 0.03, 0, i * 0.16); }); },
    end: function () { if (this.on()) [523, 659, 784, 1046].forEach(function (f, i) { SND.tone(f, i === 3 ? 0.5 : 0.14, 'triangle', 0.12, 0, i * 0.1); }); }
  };
  function haptic(k) { if (FX) FX.haptic(k); }
  var SVG_SND_ON = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
  var SVG_SND_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
  function sndIcons() {
    ['sndBtn', 'sandSnd', 'bSnd'].forEach(function (id) { var b = $(id); if (b) b.innerHTML = OPT.sound ? SVG_SND_ON : SVG_SND_OFF; });
    var m = $('mSound'); if (m) { m.classList.toggle('off', !OPT.sound); m.querySelector('span').textContent = OPT.sound ? '소리 켬' : '소리 끔'; }
    var h = $('mHaptic'); if (h) { var on = FX ? FX.hapticOn() : false; h.classList.toggle('off', !on); h.querySelector('span').textContent = on ? '진동 켬' : '진동 끔'; h.hidden = !FX; }
  }
  function toggleSound() { OPT.sound = !OPT.sound; saveOpt(); sndIcons(); if (OPT.sound) { SND.init(); SND.warn(true); } }

  var toastT = 0;
  function toast(t) { var el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('on'); }, 2200); }

  /* ---------- 화면 꺼짐 방지 ---------- */
  var wake = { lock: null, want: false };
  function setWake(on) {
    wake.want = on;
    try {
      if (on && navigator.wakeLock && !wake.lock) navigator.wakeLock.request('screen').then(function (l) { wake.lock = l; l.addEventListener('release', function () { wake.lock = null; }); }, function () {});
      if (!on && wake.lock) { wake.lock.release(); wake.lock = null; }
    } catch (e) {}
  }

  /* =====================================================================
   * 설정 화면
   * ===================================================================== */
  var STEPS = {
    'chess.main': [60, 120, 180, 300, 420, 600, 900, 1200, 1500, 1800, 2700, 3600, 5400, 7200].map(function (s) { return s * 1000; }),
    'chess.incSec': [1, 2, 3, 5, 10, 15, 20, 30, 45, 60],
    'chess.byoSec': [5, 10, 15, 20, 30, 45, 60],
    'chess.byoN': [1, 2, 3, 4, 5, 7, 10],
    'turn.limit': [0, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 600].map(function (s) { return s * 1000; }),
    'turn.bank': [0, 30, 60, 120, 180, 300, 600, 900].map(function (s) { return s * 1000; }),
    'sand.dur': [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 600].map(function (s) { return s * 1000; })
  };
  var FMT = {
    'chess.main': dur, 'chess.incSec': function (v) { return v + '초'; }, 'chess.byoSec': function (v) { return v + '초'; }, 'chess.byoN': function (v) { return v + '번'; },
    'turn.limit': function (v) { return v ? dur(v) : '제한 없음'; }, 'turn.bank': function (v) { return v ? dur(v) : '없음'; }, 'sand.dur': dur
  };
  function getK(k) { var a = k.split('.'); return OPT[a[0]][a[1]]; }
  function setK(k, v) { var a = k.split('.'); OPT[a[0]][a[1]] = v; }

  var PRESETS = {
    chess: [
      { l: '3분', p: { main: 180000, inc: 'none' } }, { l: '5분', p: { main: 300000, inc: 'none' } }, { l: '5분 +3초', p: { main: 300000, inc: 'fischer', incSec: 3 } },
      { l: '10분', p: { main: 600000, inc: 'none' } }, { l: '15분 +10초', p: { main: 900000, inc: 'fischer', incSec: 10 } }, { l: '20분', p: { main: 1200000, inc: 'none' } },
      { l: '30분', p: { main: 1800000, inc: 'none' } }, { l: '10분 · 초읽기 30초×3', p: { main: 600000, inc: 'byoyomi', byoSec: 30, byoN: 3 } }, { l: '60분', p: { main: 3600000, inc: 'none' } }
    ],
    turn: [
      { l: '15초', p: { limit: 15000, bank: 0 } }, { l: '30초', p: { limit: 30000, bank: 0 } }, { l: '1분', p: { limit: 60000, bank: 0 } }, { l: '2분', p: { limit: 120000, bank: 0 } },
      { l: '30초 + 예비 2분', p: { limit: 30000, bank: 120000 } }, { l: '1분 + 예비 5분', p: { limit: 60000, bank: 300000 } }, { l: '재기만 (제한 없음)', p: { limit: 0, bank: 0 } }
    ],
    sand: [{ l: '30초', p: { dur: 30000 } }, { l: '1분', p: { dur: 60000 } }, { l: '1분 30초', p: { dur: 90000 } }, { l: '2분', p: { dur: 120000 } }, { l: '3분', p: { dur: 180000 } }, { l: '5분', p: { dur: 300000 } }]
  };
  var INC_HINT = {
    none: '가진 시간을 다 쓰면 끝 (서든 데스)',
    fischer: '<b>피셔</b> — 턴을 끝낼 때마다 정해진 시간이 더해져요. 빨리 두면 시간이 쌓여요',
    bronstein: '<b>브론스타인</b> — 턴을 끝낼 때 이번 턴에 쓴 만큼 돌려받아요 (정해진 시간까지). 쌓이지는 않아요',
    delay: '<b>딜레이</b> — 내 차례가 오면 정해진 시간 동안은 시계가 안 줄어요',
    byoyomi: '<b>초읽기</b> — 가진 시간을 다 쓰면 매 턴 정해진 초 안에 끝내야 해요. 넘기면 횟수가 하나씩 줄고, 다 쓰면 시간 초과'
  };

  function renderSteps() {
    document.querySelectorAll('.step').forEach(function (el) {
      var k = el.getAttribute('data-k'), arr = STEPS[k], v = getK(k), i = arr.indexOf(v);
      if (i < 0) { i = 0; for (var j = 0; j < arr.length; j++) if (arr[j] <= v) i = j; setK(k, arr[i]); }
      if (!el.firstChild) el.innerHTML = '<button type="button" data-d="-1" aria-label="줄이기">−</button><output aria-live="polite"></output><button type="button" data-d="1" aria-label="늘리기">＋</button>';
      el.querySelector('output').textContent = FMT[k](arr[i]);
      el.children[0].disabled = i <= 0; el.children[2].disabled = i >= arr.length - 1;
    });
  }
  document.querySelectorAll('.step').forEach(function (el) {
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var k = el.getAttribute('data-k'), arr = STEPS[k], i = arr.indexOf(getK(k)) + +b.getAttribute('data-d');
      if (i < 0 || i >= arr.length) return;
      setK(k, arr[i]); saveOpt(); renderOpts();
    });
  });
  document.querySelectorAll('[data-seg]').forEach(function (seg) {
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      setK(seg.getAttribute('data-seg'), b.getAttribute('data-v')); saveOpt(); renderOpts();
    });
  });
  $('modes').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    OPT.mode = b.getAttribute('data-v'); saveOpt(); renderOpts();
  });
  $('presets').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    Object.assign(OPT[OPT.mode], PRESETS[OPT.mode][+b.getAttribute('data-i')].p); saveOpt(); renderOpts();
  });
  $('sandNum').addEventListener('change', function () { OPT.sand.num = this.checked; saveOpt(); });
  $('face').addEventListener('change', function () { OPT.face = this.checked; saveOpt(); });

  function renderOpts() {
    var m = OPT.mode, c = OPT.chess, t = OPT.turn;
    $('modes').querySelectorAll('button').forEach(function (b) { var on = b.getAttribute('data-v') === m; b.classList.toggle('on', on); b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', on); });
    document.querySelectorAll('.opt').forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-mode') === m); });
    document.querySelectorAll('[data-seg]').forEach(function (seg) {
      var v = getK(seg.getAttribute('data-seg'));
      seg.querySelectorAll('button').forEach(function (b) { var on = b.getAttribute('data-v') === v; b.classList.toggle('on', on); b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', on); });
    });
    $('presets').innerHTML = PRESETS[m].map(function (p, i) {
      var cur = OPT[m], on = Object.keys(p.p).every(function (k) { return cur[k] === p.p[k]; });
      return '<button type="button" data-i="' + i + '"' + (on ? ' class="on"' : '') + '>' + esc(p.l) + '</button>';
    }).join('');
    renderSteps();
    $('incHint').innerHTML = INC_HINT[c.inc];
    document.querySelectorAll('[data-show="inc-sec"]').forEach(function (el) { el.hidden = c.inc === 'none' || c.inc === 'byoyomi'; });
    document.querySelectorAll('[data-show="byo"]').forEach(function (el) { el.hidden = c.inc !== 'byoyomi'; });
    $('incLab').textContent = c.inc === 'delay' ? '딜레이' : c.inc === 'bronstein' ? '돌려받는 최대 시간' : '턴마다 더하는 시간';
    document.querySelectorAll('[data-show="limit"]').forEach(function (el) { el.hidden = !t.limit; });
    $('turnHint').innerHTML = !t.limit ? '시간 제한 없이 각자 쓴 시간만 재요. 끝나면 누가 얼마나 고민했는지 볼 수 있어요'
      : t.bank ? '턴마다 <b>' + dur(t.limit) + '</b>, 넘기면 각자 가진 예비 시간 <b>' + dur(t.bank) + '</b>에서 빠져요' + (t.onOver === 'auto' ? '. 예비 시간도 다 쓰면 자동으로 다음 사람' : '')
      : '턴마다 <b>' + dur(t.limit) + '</b>' + (t.onOver === 'auto' ? ' — 다 되면 자동으로 다음 사람' : ' — 넘기면 알림 후 넘긴 시간을 세요');
    $('sandNum').checked = OPT.sand.num;
    $('playersCard').hidden = m === 'sand';
    $('faceRow').hidden = OPT.players.length !== 2;
    $('face').checked = OPT.face;
    $('btnStart').querySelector('span').textContent = m === 'sand' ? '모래시계 ' + dur(OPT.sand.dur) : m === 'chess' ? '체스 클락 시작' : '턴 타이머 시작';
  }

  /* --- 플레이어 목록 --- */
  function renderPlayers() {
    var ps = OPT.players, n = ps.length;
    $('pCnt').textContent = n + '명';
    $('players').innerHTML = ps.map(function (p, i) {
      var c = col(p.color);
      return '<li><span class="no">' + (i + 1) + '</span>' +
        '<button type="button" class="dot" data-a="color" data-i="' + i + '" style="background:' + c.c + '" aria-label="' + (i + 1) + '번 색 바꾸기 (지금 ' + c.n + ')"></button>' +
        '<input type="text" maxlength="12" data-i="' + i + '" value="' + esc(p.name) + '" placeholder="플레이어 ' + (i + 1) + '" aria-label="' + (i + 1) + '번 이름" enterkeyhint="next" autocomplete="off">' +
        '<button type="button" class="mv" data-a="up" data-i="' + i + '"' + (i ? '' : ' disabled') + ' aria-label="위로">▲</button>' +
        '<button type="button" class="mv" data-a="down" data-i="' + i + '"' + (i < n - 1 ? '' : ' disabled') + ' aria-label="아래로">▼</button>' +
        '<button type="button" class="mv" data-a="del" data-i="' + i + '"' + (n > 1 ? '' : ' disabled') + ' aria-label="빼기">✕</button></li>';
    }).join('');
    $('btnAdd').disabled = n >= 8;
    $('faceRow').hidden = n !== 2 || OPT.mode === 'sand';
  }
  function freeColor() { var used = OPT.players.map(function (p) { return p.color; }); for (var i = 0; i < 8; i++) if (used.indexOf(i) < 0) return i; return OPT.players.length % 8; }
  $('players').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var i = +b.getAttribute('data-i'), a = b.getAttribute('data-a'), ps = OPT.players;
    if (a === 'color') {
      var used = ps.map(function (p) { return p.color; }), c = ps[i].color;
      for (var k = 1; k <= 8; k++) { var nc = (c + k) % 8; if (used.indexOf(nc) < 0 || k === 8) { ps[i].color = nc; break; } }
    } else if (a === 'up' && i > 0) { var t = ps[i]; ps[i] = ps[i - 1]; ps[i - 1] = t; }
    else if (a === 'down' && i < ps.length - 1) { var t2 = ps[i]; ps[i] = ps[i + 1]; ps[i + 1] = t2; }
    else if (a === 'del' && ps.length > 1) ps.splice(i, 1);
    saveOpt(); renderPlayers();
    var again = $('players').querySelector('[data-a="' + a + '"][data-i="' + (a === 'up' ? i - 1 : a === 'down' ? i + 1 : i) + '"]');
    if (again && !again.disabled) again.focus();
  });
  $('players').addEventListener('input', function (e) {
    var el = e.target; if (el.tagName !== 'INPUT') return;
    OPT.players[+el.getAttribute('data-i')].name = el.value; saveOpt();
  });
  $('players').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    var i = +e.target.getAttribute('data-i'), nx = $('players').querySelector('input[data-i="' + (i + 1) + '"]');
    if (nx) nx.focus(); else if (OPT.players.length < 8) { $('btnAdd').click(); } else e.target.blur();
  });
  $('btnAdd').onclick = function () {
    if (OPT.players.length >= 8) return;
    OPT.players.push({ name: '', color: freeColor() }); saveOpt(); renderPlayers();
    var ins = $('players').querySelectorAll('input'); if (ins.length) ins[ins.length - 1].focus();
  };
  $('btnShuffle').onclick = function () {
    var ps = OPT.players;
    for (var i = ps.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = ps[i]; ps[i] = ps[j]; ps[j] = t; }
    saveOpt(); renderPlayers();
    toast('🎲 ' + pname(ps[0], 0) + '부터 시작해요');
  };
  function setNames(names) {
    names = names.slice(0, 8);
    OPT.players = names.map(function (n, i) { var old = OPT.players[i]; return { name: n, color: old ? old.color : i % 8 }; });
    // 색이 겹치면 다시 고름
    var seen = {};
    OPT.players.forEach(function (p) { if (seen[p.color]) { for (var c = 0; c < 8; c++) if (!seen[c]) { p.color = c; break; } } seen[p.color] = 1; });
    saveOpt(); renderPlayers(); renderOpts();
  }

  /* --- 잠만보 데이터(이 기기에 저장된 것)에서 회원·최근 모임 참가자 (순서 룰렛과 같은 방식, 서버 요청 없음) --- */
  var CLUB = { members: [], meet: null };
  function unpackTbl(t) {
    if (t && Array.isArray(t.c) && Array.isArray(t.r)) return t.r.map(function (row) { var o = {}; t.c.forEach(function (k, i) { o[k] = row[i]; }); return o; });
    return Array.isArray(t) && t.length && typeof t[0] === 'object' && !Array.isArray(t[0]) ? t : null;
  }
  function findKey(o, re) { for (var k in o) if (re.test(k)) return k; return null; }
  function scanClub() {
    var raw; try { raw = localStorage.getItem('jmb_data_v2'); } catch (e) { return; }
    if (!raw) return;
    var rootObj; try { rootObj = JSON.parse(raw); } catch (e) { return; }
    var seen = 0, tables = [];
    (function walk(x, depth) {
      if (!x || depth > 5 || ++seen > 4000) return;
      if (typeof x === 'string' && depth < 3 && x.length > 2 && (x[0] === '{' || x[0] === '[')) { try { walk(JSON.parse(x), depth + 1); } catch (e) {} return; }
      if (typeof x !== 'object') return;
      var t = unpackTbl(x);
      if (t) { tables.push(t); return; }
      if (Array.isArray(x)) return;
      for (var k in x) walk(x[k], depth + 1);
    })(rootObj, 0);
    var today = new Date(); today.setHours(23, 59, 59, 0);
    tables.forEach(function (t) {
      var o = t[0], kn = findKey(o, /^(닉네임|name|nick|nickname)$/i), kp = findKey(o, /참가자|participants|people|attendees/i), kd = findKey(o, /^(날짜|date|d)$/i);
      if (kn && !findKey(o, /게임명|game/i) && !kp && !CLUB.members.length) {
        var kq = findKey(o, /탈퇴|left|quit/i);
        CLUB.members = t.filter(function (r) { return r[kn] && !(kq && r[kq]); }).map(function (r) { return String(r[kn]).trim(); });
      }
      if (kp && kd) {
        var best = null;
        t.forEach(function (r) {
          var d = new Date(String(r[kd]).replace(/\./g, '-'));
          if (isNaN(d) || d > today || !r[kp]) return;
          if (!best || d > best.d) best = { d: d, p: r[kp] };
        });
        if (best && (!CLUB.meet || best.d > CLUB.meet.d)) CLUB.meet = best;
      }
    });
    if (CLUB.meet) {
      var p = CLUB.meet.p;
      CLUB.meet.names = (Array.isArray(p) ? p : String(p).split(/[,，、\n]+/)).map(function (s) { return String(s).trim(); }).filter(Boolean);
      if (!CLUB.meet.names.length) CLUB.meet = null;
    }
  }
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function cho(s) { var o = ''; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i) - 0xAC00; o += c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : s[i]; } return o; }
  function koMatch(name, q) { if (!q) return true; name = name.toLowerCase(); q = q.toLowerCase().replace(/\s+/g, ''); return name.replace(/\s+/g, '').indexOf(q) >= 0 || cho(name).indexOf(q) >= 0; }

  $('btnMeet').onclick = function () {
    if (!CLUB.meet) return;
    var n = CLUB.meet.names, d = CLUB.meet.d;
    setNames(n);
    toast((d.getMonth() + 1) + '/' + d.getDate() + ' 모임 참가자 ' + Math.min(8, n.length) + '명' + (n.length > 8 ? ' (8명까지)' : ''));
  };
  var picked = [];
  $('btnPick').onclick = function () {
    picked = OPT.players.map(function (p) { return (p.name || '').trim(); }).filter(function (n) { return CLUB.members.indexOf(n) >= 0; });
    $('pickQ').value = ''; renderPick(); openSheet('pickBg');
    setTimeout(function () { if (matchMedia('(pointer:fine)').matches) $('pickQ').focus(); }, 300);
  };
  function renderPick() {
    var q = $('pickQ').value.trim(), arr = CLUB.members.filter(function (n) { return koMatch(n, q); });
    $('pickList').innerHTML = arr.length ? arr.map(function (n) { var k = picked.indexOf(n); return '<button type="button" class="chip' + (k >= 0 ? ' on' : '') + '" data-n="' + esc(n) + '">' + (k >= 0 ? (k + 1) + '. ' : '') + esc(n) + '</button>'; }).join('') : '<p class="hint">찾는 회원이 없어요</p>';
    $('pickOk').textContent = '넣기 (' + picked.length + ')';
  }
  $('pickQ').addEventListener('input', renderPick);
  $('pickList').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    var n = b.getAttribute('data-n'), k = picked.indexOf(n);
    if (k >= 0) picked.splice(k, 1); else if (picked.length < 8) picked.push(n); else { toast('8명까지 고를 수 있어요'); return; }
    renderPick();
  });
  $('pickNone').onclick = function () { picked = []; renderPick(); };
  $('pickOk').onclick = function () { if (picked.length) setNames(picked); closeSheet('pickBg'); };

  /* --- 시트 --- */
  function openSheet(id) { $(id).hidden = false; }
  function closeSheet(id) { $(id).hidden = true; }
  $('pickBg').addEventListener('click', function (e) { if (e.target === this) closeSheet('pickBg'); });
  $('menuBg').addEventListener('click', function (e) { if (e.target === this) closeMenu(true); });

  function show(id) { ['setup', 'play', 'sand'].forEach(function (s) { $(s).classList.toggle('on', s === id); }); }

  /* =====================================================================
   * 체스 클락 · 턴 타이머 진행
   * ===================================================================== */
  var G = null, raf = 0, lastBeep = null, lastSave = 0;
  var B = {};   // 화면 요소

  function cfgOf() {
    if (OPT.mode === 'chess') return Object.assign({ mode: 'chess' }, OPT.chess);
    var t = OPT.turn; return { mode: 'turn', limit: t.limit, bank: t.limit ? t.bank : 0, onOver: t.onOver };
  }
  function startGame() {
    SND.init();
    var ps = OPT.players.map(function (p, i) { return { name: pname(p, i), color: p.color }; });
    G = C.create(cfgOf(), ps);
    G.face = OPT.face && ps.length === 2;
    lsSet(KEY.game, G);
    enterPlay();
  }
  function enterPlay() {
    show('play'); setWake(true);
    if (!history.state || history.state.tm !== 'play') history.pushState({ tm: 'play' }, '');
    buildBoard(); loop();
  }

  function infoLine() {
    var c = G.cfg;
    if (c.mode === 'chess') {
      return '♞ ' + durShort(c.main) + (c.inc === 'fischer' ? ' +' + c.incSec + '초' : c.inc === 'bronstein' ? ' 브론스타인 ' + c.incSec + '초' : c.inc === 'delay' ? ' 딜레이 ' + c.incSec + '초' : c.inc === 'byoyomi' ? ' · 초읽기 ' + c.byoSec + '초×' + c.byoN : '');
    }
    return '⏱ ' + (c.limit ? '턴 ' + durShort(c.limit) + (c.bank ? ' + 예비 ' + durShort(c.bank) : '') : '재기만');
  }

  var ICON = {
    menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
    play: '<svg viewBox="0 0 24 24" style="fill:currentColor;stroke:none"><path d="M8 5l11 7-11 7z"/></svg>'
  };

  function buildBoard() {
    var bd = $('board'), duel = G.face;
    bd.className = 'board ' + (duel ? 'duel' : G.ps.length > 2 ? 'many' : 'few');
    var ctrl = '<button type="button" class="ibtn glass" id="bMenu" aria-label="메뉴 (일시정지)">' + ICON.menu + '</button>' +
      '<div class="pill glass" id="bInfo"></div>' +
      '<button type="button" class="ibtn glass" id="bUndo" aria-label="되돌리기">' + ICON.undo + '</button>' +
      '<button type="button" class="ibtn glass" id="bPause" aria-label="일시정지">' + ICON.pause + '</button>';
    if (duel) {
      bd.innerHTML = halfHtml(1, 'top') + '<div class="mid">' + ctrl + '</div>' + halfHtml(0, 'bot') + '<div class="pausebar">⏸ 일시정지 · 누르면 계속</div>';
    } else {
      bd.innerHTML = '<div class="ptop">' + ctrl + '</div>' +
        '<button type="button" class="main" id="bMain"><div class="nm" id="mNm"></div><div class="tm" id="mTm"></div><div class="sub" id="mSub"></div><div class="hintx" id="mHint"></div><div class="bar2"><i id="mBar"></i></div></button>' +
        '<div class="plist" id="bList">' + G.ps.map(function (p, i) {
          return '<button type="button" class="pc" data-i="' + i + '" style="--c:' + col(p.color).c + '"><div class="r1"><b>' + esc(p.name) + '</b><span class="k"></span></div><div class="r2"></div><div class="r3"></div></button>';
        }).join('') + '</div>' +
        '<div class="pbot"><button type="button" class="cbtn glass" id="bRev"></button><button type="button" class="cbtn glass" id="bEnd">🏁 끝내기</button></div>' +
        '<div class="pausebar">⏸ 일시정지</div>';
    }
    B = { bd: bd, info: $('bInfo'), undo: $('bUndo'), pause: $('bPause'), main: $('bMain'), list: $('bList') };
    $('bMenu').onclick = function () { openMenu(); };
    B.undo.onclick = doUndo;
    B.pause.onclick = togglePause;
    if (duel) {
      bd.querySelectorAll('.half').forEach(function (h) { h.addEventListener('pointerdown', onHalf); h.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHalf.call(h, e); } }); });
    } else {
      B.main.addEventListener('click', onMain);
      B.list.addEventListener('click', function (e) { var b = e.target.closest('.pc'); if (b) onCard(+b.getAttribute('data-i')); });
      $('bRev').onclick = function () { doReverse(); };
      $('bEnd').onclick = function () {
        if (G.cur >= 0 && !G.ended) { var was = G.run; pause(); if (!confirm('게임을 끝내고 결과를 볼까요?')) { if (was) resume(); return; } }
        finishGame();
      };
    }
    render(true);
  }
  function halfHtml(i, pos) {
    var p = G.ps[i], c = col(p.color);
    return '<div class="half ' + pos + '" role="button" tabindex="0" data-i="' + i + '" style="--c:' + c.c + ';--ci:' + (c.ink || '#fff') + '">' +
      '<div class="nm">' + (FX ? FX.avatar(p.name, 26) : '') + '<span>' + esc(p.name) + '</span></div><div class="tm"></div><div class="sub"></div><div class="hintx"></div><div class="bar2"><i></i></div></div>';
  }

  /* --- 누르기 --- */
  // 마주 보기: 내 쪽을 누르면 내 턴 끝 (체스 클락). 처음엔 먼저 할 사람 쪽을 누름
  var lastTap = 0;
  function onHalf(e) {
    if (e && e.type === 'pointerdown') { if (e.button > 0) return; e.preventDefault(); }
    var t = now(); if (t - lastTap < 250) return; lastTap = t;   // 두 번 눌림 방지
    var i = +this.getAttribute('data-i');
    if (G.ended) return;
    if (G.cur < 0) { begin(i); return; }
    if (!G.run) { resume(); return; }
    if (i === G.cur) doPass();
  }
  function onMain() {
    var t = now(); if (t - lastTap < 250) return; lastTap = t;
    if (G.ended) return;
    if (G.cur < 0) { begin(0); return; }
    if (!G.run) { resume(); return; }
    doPass();
  }
  function onCard(i) {
    if (G.ended) return;
    if (G.cur < 0) { begin(i); return; }
    if (G.ps[i].out) { toast(G.ps[i].name + ' 님은 빠졌어요 — 메뉴에서 돌아오게 할 수 있어요'); return; }
    if (i === G.cur) { if (!G.run) resume(); else doPass(); return; }
    var was = G.run;
    if (C.pass(G, now(), i)) { if (!was) C.pause(G, now()); afterPass(); toast(G.ps[i].name + ' 차례로 바꿨어요'); }
  }

  function begin(i) {
    SND.init();
    if (G.ps[i].out) return;
    C.pass(G, now(), i); SND.start(); haptic('turn');
    announce(G.ps[i].name + ' 님부터 시작');
    persist(); render(true);
  }
  function doPass() {
    if (!G.run || G.cur < 0) return;
    if (C.pass(G, now())) afterPass();
  }
  function afterPass() {
    SND.pass(); haptic('tap'); lastBeep = null;
    announce(G.ps[G.cur].name + ' 차례');
    persist(); render(true);
  }
  function doUndo() {
    if (!G || !G.hist.length) { toast('되돌릴 게 없어요'); return; }
    C.undo(G, now()); SND.undo(); lastBeep = null;
    toast('↶ ' + G.ps[G.cur].name + ' 차례로 되돌렸어요');
    persist(); render(true);
  }
  function doReverse() {
    C.reverse(G); persist(); render(true);
    toast(G.dir > 0 ? '↻ 원래 순서로' : '↺ 반대 순서로');
  }
  function pause() { if (G && G.run) { C.pause(G, now()); SND.pause(); persist(); render(true); } }
  function resume() { if (G && !G.run && G.cur >= 0 && !G.ended) { SND.init(); C.resume(G, now()); SND.start(); persist(); render(true); } }
  function togglePause() { if (!G || G.cur < 0) return; if (G.run) pause(); else resume(); }

  function announce(t) { var el = $('live'); el.textContent = ''; setTimeout(function () { el.textContent = t; }, 30); }

  /* --- 그리기 --- */
  function subText(s, i) {
    var c = G.cfg, cur = i === G.cur, p = G.ps[i];
    if (c.mode === 'chess') {
      if (s.phase === 'over') return '<em>시간 초과</em>';
      if (s.phase === 'byo') return '초읽기 · 남은 횟수 <em>' + s.per + '</em>';
      if (c.inc === 'byoyomi') return '그다음 초읽기 ' + c.byoSec + '초 × ' + s.per;
      if (c.inc === 'delay' && cur && s.delay > 0) return '딜레이 <em>' + (Math.ceil(s.delay / 100) / 10).toFixed(1) + '</em>';
      if (c.inc === 'fischer') return '턴마다 +' + c.incSec + '초';
      if (c.inc === 'bronstein') return '쓴 만큼 돌려받기 (최대 ' + c.incSec + '초)';
      if (c.inc === 'delay') return '딜레이 ' + c.incSec + '초';
      return p.flag ? '<em>시간 초과</em>' : '';
    }
    if (s.phase === 'free') return '총 ' + clock(p.used + s.e, { up: true }) + ' · ' + (p.turns + 1) + '번째 턴';
    if (s.phase === 'bank') return '예비 시간 쓰는 중';
    if (s.phase === 'over') return '<em>' + (c.onOver === 'auto' ? '시간 끝' : '시간 초과') + '</em>';
    return c.bank ? '예비 ' + clock(p.bank) : '총 ' + clock(p.used + s.e, { up: true });
  }
  function timeText(s) {
    var c = G.cfg;
    if (s.phase === 'free') return clock(s.ms, { up: true });
    if (c.mode === 'turn' && s.phase === 'over') return clock(s.ms, { plus: true });
    return clock(s.ms, { tenths: c.mode === 'chess' && s.phase !== 'over' });
  }
  // 다른 사람 카드: 체스는 남은 시간, 턴 타이머는 예비 시간 또는 총 쓴 시간
  function cardText(s, i) {
    var c = G.cfg, p = G.ps[i];
    if (i === G.cur) return timeText(s);
    if (c.mode === 'chess') return c.inc === 'byoyomi' && p.bank <= 0 ? '초읽기 ' + p.per : clock(s.ms);
    return c.bank ? clock(p.bank) : clock(p.used, { up: true });
  }
  function cardSub(i) {
    var c = G.cfg, p = G.ps[i];
    if (p.out) return '빠짐';
    var parts = [p.turns + '턴'];
    if (c.mode === 'chess') { if (p.flag) parts.push('시간 초과'); else if (c.inc === 'byoyomi' && p.bank > 0) parts.push('초읽기 ' + p.per + '번'); }
    else { if (c.bank) parts.push('총 ' + clock(p.used, { up: true })); if (p.overN) parts.push('초과 ' + p.overN); }
    return parts.join(' · ');
  }
  var lastStruct = '';
  function render(force) {
    if (!G) return;
    var t = now(), cur = G.cur, started = cur >= 0;
    var nx = started ? C.nextIdx(G, cur) : -1;
    // 위 정보
    B.info.innerHTML = started ? '<span>' + G.round + '라운드</span> ' + infoLine() + ' <span class="dirc">' + (G.dir > 0 ? '↻' : '↺') + '</span>' : infoLine();
    B.undo.disabled = !G.hist.length;
    B.pause.innerHTML = G.run ? ICON.pause : ICON.play;
    B.pause.disabled = !started; B.pause.setAttribute('aria-label', G.run ? '일시정지' : '계속');
    B.bd.classList.toggle('paused', started && !G.run && !G.ended);

    if (G.face) {
      B.bd.querySelectorAll('.half').forEach(function (h) {
        var i = +h.getAttribute('data-i'), s = C.status(G, i, t), isCur = i === cur;
        var low = isCur && G.run && s.phase !== 'over' && s.phase !== 'free' && s.ms < 10000;
        h.className = 'half ' + (h.classList.contains('top') ? 'top' : 'bot') + (isCur ? ' cur' : '') + (s.phase === 'over' || G.ps[i].flag ? ' flag' : '') + (isCur && s.phase === 'over' ? ' over' : '') + (low ? ' low' : '');
        h.querySelector('.tm').textContent = timeText(s);
        h.querySelector('.sub').innerHTML = subText(s, i);
        h.querySelector('.hintx').textContent = !started ? '먼저 할 사람이 누르세요' : isCur ? (G.run ? '다 했으면 누르세요' : '') : '';
        var bar = h.querySelector('.bar2 i'); bar.style.transform = 'scaleX(' + (s.frac == null ? (isCur ? 1 : 0) : s.frac) + ')';
        h.setAttribute('aria-label', G.ps[i].name + ' ' + timeText(s) + (isCur ? ' — 지금 차례' : ''));
      });
      return;
    }

    // 큰 판
    var m = B.main;
    if (!started) {
      m.className = 'main wait'; m.style.cssText = '';
      $('mNm').innerHTML = '<span class="big-ic">👆</span>';
      $('mTm').textContent = cardText(C.status(G, 0, t), 0);
      $('mSub').textContent = '먼저 할 사람을 누르세요';
      $('mHint').textContent = '아래에서 고르거나, 여기를 누르면 ' + G.ps[0].name + ' 님부터';
      $('mBar').style.transform = 'scaleX(1)';
    } else {
      var p = G.ps[cur], c = col(p.color), s = C.status(G, cur, t);
      var over = s.phase === 'over', low = G.run && !over && s.phase !== 'free' && s.ms < 10000;
      m.className = 'main' + (over ? ' over' : '') + (low ? ' low' : '') + (G.run ? '' : ' paused');
      m.style.cssText = '--c:' + c.c + ';--ci:' + (c.ink || '#fff');
      var key = cur + '|' + p.name;
      if (force || lastStruct !== key) { $('mNm').innerHTML = (FX ? FX.avatar(p.name, 30) : '') + '<span>' + esc(p.name) + '</span>'; lastStruct = key; }
      $('mTm').textContent = timeText(s);
      $('mSub').innerHTML = subText(s, cur);
      $('mHint').textContent = G.ended ? '' : !G.run ? '누르면 계속' : nx >= 0 && nx !== cur ? '다 했으면 누르기 → 다음 ' + G.ps[nx].name : '다 했으면 누르기';
      $('mBar').style.transform = 'scaleX(' + (s.frac == null ? 1 : Math.max(0, s.frac)) + ')';
      m.setAttribute('aria-label', p.name + ' 차례, ' + timeText(s) + '. 누르면 다음 사람');
    }
    // 카드
    var cards = B.list.children;
    for (var i = 0; i < cards.length; i++) {
      var el = cards[i], st = C.status(G, i, t), pi = G.ps[i];
      el.className = 'pc' + (i === cur ? ' cur' : '') + (i === nx && started ? ' nx' : '') + (pi.out ? ' out' : '') + (st.phase === 'over' || pi.flag ? ' flag' : '');
      el.children[0].children[1].textContent = i === cur ? '지금' : i === nx && started ? '다음' : (i + 1) + '';
      el.children[1].textContent = cardText(st, i);
      el.children[2].textContent = cardSub(i);
    }
    if (force) $('bRev').textContent = G.dir > 0 ? '↻ 순서 반대로' : '↺ 원래 순서로';
  }

  /* --- 매 프레임: 시간 초과 처리 · 경고음 · 그리기 --- */
  function loop() {
    cancelAnimationFrame(raf);
    (function frame() {
      if (!G || !$('play').classList.contains('on')) { raf = 0; return; }
      raf = requestAnimationFrame(frame);
      var t = now();
      if (G.run) {
        var ev = C.tick(G, t);
        if (ev.length) onEvents(ev);
        beeps(t);
        if (t - lastSave > 5000) persist();
        render(false);   // 멈춘 동안은 바뀔 때만 (render(true))
      }
    })();
  }
  function onEvents(ev) {
    var c = G.cfg;
    if (ev.indexOf('flag') >= 0) { SND.flag(); haptic('bomb'); }
    if (ev.indexOf('timeup') >= 0) { SND.flag(); haptic('warn'); }
    if (ev.indexOf('end') >= 0) { persist(); setTimeout(finishGame, 600); toast('⏰ 시간 초과 — 게임 끝'); return; }
    if (ev.indexOf('out') >= 0) { toast('⏰ 시간 초과 — 탈락, 다음은 ' + G.ps[G.cur].name); lastBeep = null; announce(G.ps[G.cur].name + ' 차례'); }
    else if (ev.indexOf('auto') >= 0) { toast('⏰ 시간 끝 — ' + G.ps[G.cur].name + ' 차례'); lastBeep = null; announce(G.ps[G.cur].name + ' 차례'); }
    else if (ev.indexOf('flag') >= 0) { announce(G.ps[G.cur].name + ' 시간 초과'); }
    else if (ev.indexOf('timeup') >= 0 && c.mode === 'turn') { announce('시간 초과'); }
    persist(); render(true);
  }
  // 마지막 10초는 1초마다 '똑', 마지막 5초는 '삐' (초읽기·턴 제한·예비 시간 모두)
  function beeps(t) {
    var s = C.status(G, G.cur, t);
    if (s.phase === 'over' || s.phase === 'free' || s.ms > 10000) { lastBeep = null; return; }
    var sec = Math.ceil(s.ms / 1000), key = G.cur + ':' + s.phase + ':' + s.per + ':' + sec;
    if (key === lastBeep) return;
    if (lastBeep !== null) {
      if (sec <= 5) { SND.warn(sec === 1); if (sec <= 3) haptic('tap'); }
      else SND.tick();
    }
    lastBeep = key;
  }

  // saved = 저장한 시각 → '이어서' 때 그때까지만 셈
  function persist() { if (G) { lastSave = G.saved = now(); lsSet(KEY.game, G); } }

  /* --- 메뉴 (일시정지 + 시간 조정) --- */
  var menuWasRunning = false;
  function openMenu() {
    if (!G) return;
    menuWasRunning = G.run;
    if (G.run) pause();
    $('menuTitle').textContent = G.cur < 0 ? '메뉴' : '일시정지';
    $('mResume').innerHTML = '<i>▶</i>' + (G.cur < 0 ? '닫기' : '계속하기');
    $('mReverse').querySelector('span').textContent = G.dir > 0 ? '순서 반대로' : '원래 순서로';
    sndIcons(); renderAdj(); openSheet('menuBg');
  }
  function closeMenu(resumeIt) { closeSheet('menuBg'); if (resumeIt && menuWasRunning) resume(); render(true); }
  function renderAdj() {
    var c = G.cfg, unit = c.mode === 'chess' || c.bank;
    $('adjList').innerHTML = G.ps.map(function (p, i) {
      var s = C.status(G, i, now()), shown = c.mode === 'chess' ? clock(i === G.cur ? s.ms : p.bank) : c.bank ? '예비 ' + clock(p.bank) : '총 ' + clock(p.used, { up: true });
      return '<li class="' + (p.out ? 'out' : '') + '"><i class="d" style="background:' + col(p.color).c + '"></i><span class="n">' + esc(p.name) + '</span><span class="t">' + shown + '</span>' +
        '<div class="b">' + (unit ? '<button type="button" data-i="' + i + '" data-d="-60000">−1분</button><button type="button" data-i="' + i + '" data-d="-10000">−10초</button><button type="button" data-i="' + i + '" data-d="10000">+10초</button><button type="button" data-i="' + i + '" data-d="60000">+1분</button>' : '') +
        '<button type="button" class="o' + (p.out ? ' on' : '') + '" data-i="' + i + '" data-o="1">' + (p.out ? '빠짐 · 돌아오기' : '빠지기') + '</button></div></li>';
    }).join('');
  }
  $('adjList').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var i = +b.getAttribute('data-i');
    if (b.getAttribute('data-o')) {
      if (!C.setOut(G, i, !G.ps[i].out, now())) { toast('남은 사람이 한 명이면 뺄 수 없어요'); return; }
      if (G.cur >= 0 && !menuWasRunning) C.pause(G, now());
    } else {
      C.adjust(G, i, +b.getAttribute('data-d'), now());
    }
    persist(); renderAdj(); render(true);
  });
  $('mResume').onclick = function () { closeMenu(true); };
  $('mReverse').onclick = function () { doReverse(); $('mReverse').querySelector('span').textContent = G.dir > 0 ? '순서 반대로' : '원래 순서로'; };
  $('mSound').onclick = toggleSound;
  $('mHaptic').onclick = function () { if (!FX) return; FX.setHaptic(!FX.hapticOn()); sndIcons(); if (FX.hapticOn()) FX.haptic('tap'); };
  $('mEnd').onclick = function () { closeSheet('menuBg'); finishGame(); };
  $('mQuit').onclick = function () {
    if (G && G.turnNo > 1 && !confirm('기록 없이 나갈까요? 진행 중인 게임이 지워져요')) return;
    closeSheet('menuBg'); G = null; lsDel(KEY.game); leavePlay();
  };

  /* --- 끝 · 결과 --- */
  function finishGame() {
    if (!G) return;
    if (G.cur < 0) { G = null; lsDel(KEY.game); leavePlay(); return; }
    C.end(G, now()); persist(); render(true);
    SND.end(); haptic('win');
    showResult();
  }
  function showResult() {
    var S = C.summary(G), c = G.cfg, mx = Math.max.apply(null, S.rows.map(function (r) { return r.used; }));
    var played = S.rows.filter(function (r) { return r.turns > 0; });
    var slow = played.length > 1 ? played.reduce(function (a, b) { return b.avg > a.avg ? b : a; }) : null;
    var fast = played.length > 1 ? played.reduce(function (a, b) { return b.avg < a.avg ? b : a; }) : null;
    $('resTitle').textContent = (c.mode === 'chess' ? '♞ 체스 클락' : '⏱ 턴 타이머') + ' 결과';
    $('resSum').innerHTML = '<div><small>게임 시간</small><b>' + clock(S.total, { up: true }) + '</b></div><div><small>라운드</small><b>' + S.rounds + '</b></div><div><small>전체 턴</small><b>' + S.turns + '</b></div>';
    $('resList').innerHTML = S.rows.map(function (r, i) {
      var extra = [];
      if (c.mode === 'chess') extra.push('남은 ' + (c.inc === 'byoyomi' && r.bank <= 0 ? '초읽기 ' + r.per + '번' : clock(r.bank)));
      else if (c.bank) extra.push('예비 남음 ' + clock(r.bank));
      if (r.flag) extra.push('<span class="bad">시간 초과</span>');
      if (r.overN) extra.push('<span class="bad">초과 ' + r.overN + '번 (' + clock(r.overMs, { up: true }) + ')</span>');
      if (r.out) extra.push('<span class="bad">빠짐</span>');
      return '<li class="' + (slow && r === slow ? 'top' : fast && r === fast ? 'fast' : '') + '" style="animation-delay:' + (i * 0.05) + 's">' +
        '<div class="h"><i style="background:' + col(r.color).c + '"></i><span>' + esc(r.name) + '</span><b>' + clock(r.used, { up: true }) + '</b></div>' +
        '<div class="meter"><i style="width:' + (mx ? (r.used / mx * 100).toFixed(1) : 0) + '%;background:' + col(r.color).c + '"></i></div>' +
        '<div class="s"><span>' + Math.round(r.share * 100) + '%</span><span>' + r.turns + '턴</span><span>평균 ' + clock(r.avg, { up: true }) + '</span><span>최장 ' + clock(r.longest, { up: true }) + '</span>' + extra.map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div></li>';
    }).join('') + (slow ? '<p class="hint">🐢 평균이 가장 긴 사람 · ⚡ 가장 짧은 사람</p>' : '');
    $('btnImg').hidden = !(FX && FX.capture);
    openSheet('resBg');
    if (FX && !reduceMotion) FX.confetti({ y: 0.3, count: 80 });
  }
  function resultText() {
    var S = C.summary(G), c = G.cfg;
    var lines = ['[잠만보 ' + (c.mode === 'chess' ? '체스 클락' : '턴 타이머') + '] ' + infoLine().replace(/^\S+\s/, ''), '게임 시간 ' + clock(S.total, { up: true }) + ' · ' + S.rounds + '라운드 · ' + S.turns + '턴', ''];
    S.rows.forEach(function (r, i) {
      lines.push((i + 1) + '. ' + r.name + ' — ' + clock(r.used, { up: true }) + ' (' + Math.round(r.share * 100) + '%) · ' + r.turns + '턴 · 평균 ' + clock(r.avg, { up: true }) + (r.flag ? ' · 시간 초과' : '') + (r.overN ? ' · 초과 ' + r.overN + '번' : ''));
    });
    return lines.join('\n');
  }
  $('btnCopy').onclick = function () {
    var txt = resultText(), done = function () { toast('결과를 복사했어요'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
    else { fallbackCopy(txt); done(); }
  };
  function fallbackCopy(t) { var ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); }
  $('btnImg').onclick = function () {
    if (!FX || !FX.capture) return;
    var b = this; b.disabled = true;
    FX.capture($('resCap'), '잠만보_타이머_결과', { pad: 16 }).then(function (r) { if (r === 'saved') toast('이미지를 저장했어요'); }, function () { toast('이미지를 만들지 못했어요'); }).then(function () { b.disabled = false; });
  };
  $('btnAgain').onclick = function () { closeSheet('resBg'); lsDel(KEY.game); G = null; startGame(); };
  $('btnSetup').onclick = function () { closeSheet('resBg'); lsDel(KEY.game); G = null; leavePlay(); };

  function leavePlay() {
    cancelAnimationFrame(raf); raf = 0; setWake(false);
    show('setup'); checkResume(); renderOpts(); renderPlayers();
    if (history.state && history.state.tm) history.back();
  }

  /* =====================================================================
   * 모래시계
   * ===================================================================== */
  var SG = null;   // { dur, top(남은 위 모래 ms, 멈췄을 때), at(흐르기 시작한 시각), run, done }
  function sandTop(t) { return SG.run ? Math.max(0, SG.top - (t - SG.at)) : SG.top; }
  function startSand() {
    SND.init();
    SG = { dur: OPT.sand.dur, top: OPT.sand.dur, at: now(), run: true, done: false, flips: 0, anim: false };
    show('sand'); setWake(true);
    if (!history.state || history.state.tm !== 'sand') history.pushState({ tm: 'sand' }, '');
    $('sand').classList.remove('alarm');
    SND.flip(); sandLoop();
  }
  function sandDraw(t) {
    var top = SG.anim ? SG.animTop : sandTop(t), f = top / SG.dur, g = 1 - f;
    var hT = 118 * Math.sqrt(f);                // 위: 목 쪽이 좁아 높이는 √
    var hB = 118 * (1 - Math.sqrt(1 - g));      // 아래: 바닥이 넓어 처음엔 천천히 쌓임
    var sTop = $('sTop'); sTop.setAttribute('y', (154 - hT).toFixed(2)); sTop.setAttribute('height', hT.toFixed(2));
    var yb = 286 - hB, peak = g > 0.01 && g < 0.995 ? Math.min(9, hB * 0.6) : 0;
    $('sBot').setAttribute('d', g <= 0.001 ? '' : 'M30 290V' + yb.toFixed(2) + 'Q100 ' + (yb - peak * 2).toFixed(2) + ' 170 ' + yb.toFixed(2) + 'V290z');
    var flowing = SG.run && top > 0 && !SG.anim;
    var st = $('sStream'); st.setAttribute('opacity', flowing ? '0.95' : '0'); st.setAttribute('height', Math.max(0, yb - 150 - peak).toFixed(2));
    var tm = $('sandTime');
    tm.className = 'sand-time' + (SG.done ? ' done' : '') + (OPT.sand.num || SG.done ? '' : ' hide');
    tm.textContent = SG.done ? '시간 끝!' : OPT.sand.num ? clock(top) : SG.run ? '모래가 흐르는 중…' : '멈춤';
    $('sandInfo').textContent = '⏳ ' + dur(SG.dur) + (SG.flips ? ' · 뒤집기 ' + SG.flips + '번' : '');
    $('sandPause').textContent = SG.run ? '⏸ 멈춤' : '▶ 계속';
    $('sandPause').disabled = SG.done;
  }
  var lastSandSec = null;
  function sandLoop() {
    cancelAnimationFrame(raf);
    (function frame() {
      if (!SG || !$('sand').classList.contains('on')) { raf = 0; return; }
      raf = requestAnimationFrame(frame);
      var t = now(), top = sandTop(t);
      if (SG.run && top <= 0 && !SG.done) {
        SG.done = true; SG.run = false; SG.top = 0;
        SND.bell(); haptic('warn');
        if (!reduceMotion) { $('sand').classList.remove('alarm'); void $('sand').offsetWidth; $('sand').classList.add('alarm'); }
      }
      if (SG.run && OPT.sand.num) {
        var sec = Math.ceil(top / 1000);
        if (sec <= 5 && sec !== lastSandSec && lastSandSec !== null) SND.tick();
        lastSandSec = sec;
      }
      sandDraw(t);
    })();
  }
  function sandFlip() {
    if (!SG || SG.anim) return;
    SND.init();
    var t = now(), top = sandTop(t);
    SG.animTop = top; SG.anim = true;
    SG.top = SG.dur - top; SG.at = t; SG.run = true; SG.done = false; SG.flips++; lastSandSec = null;
    $('sand').classList.remove('alarm');
    SND.flip(); haptic('tap');
    var hg = $('hg');
    if (reduceMotion) { SG.anim = false; return; }
    hg.classList.add('flip');
    setTimeout(function () {
      hg.style.transition = 'none'; hg.classList.remove('flip'); void hg.offsetWidth; hg.style.transition = '';
      SG.anim = false;
    }, 620);
  }
  $('hgBtn').onclick = sandFlip;
  $('sandFlip').onclick = sandFlip;
  $('sandPause').onclick = function () {
    if (!SG || SG.done) return;
    var t = now();
    if (SG.run) { SG.top = sandTop(t); SG.run = false; SND.pause(); }
    else { SG.at = t; SG.run = true; SND.start(); }
  };
  $('sandReset').onclick = function () { if (!SG) return; SG.top = SG.dur; SG.at = now(); SG.run = true; SG.done = false; SG.flips = 0; lastSandSec = null; $('sand').classList.remove('alarm'); SND.flip(); };
  $('sandQuit').onclick = function () { history.back(); };
  $('sandSnd').onclick = toggleSound;
  function leaveSand() { SG = null; cancelAnimationFrame(raf); raf = 0; setWake(false); show('setup'); }

  /* =====================================================================
   * 공통: 시작 · 이어서 · 뒤로가기 · 키보드 · 화면 전환
   * ===================================================================== */
  $('btnStart').onclick = function () {
    if (OPT.mode === 'sand') { startSand(); return; }
    var g = lsGet(KEY.game, null);
    if (g && !g.ended && g.turnNo > 1 && !confirm('진행 중인 게임이 있어요. 새로 시작할까요?')) return;
    startGame();
  };
  $('sndBtn').onclick = toggleSound;

  function checkResume() {
    var g = lsGet(KEY.game, null);
    var ok = g && g.v === 1 && !g.ended && Array.isArray(g.ps) && g.cur >= 0;
    $('resume').hidden = !ok;
    if (!ok) return;
    var ago = Math.round((now() - (g.saved || 0)) / 60000);
    $('resumeInfo').textContent = (g.cfg.mode === 'chess' ? '체스 클락' : '턴 타이머') + ' · ' + g.ps.length + '명 · ' + g.round + '라운드 · ' + g.ps[g.cur].name + ' 차례' +
      (g.saved ? ' · ' + (ago < 1 ? '방금' : ago < 60 ? ago + '분 전' : Math.round(ago / 60) + '시간 전') : '');
  }
  $('btnResume').onclick = function () {
    var g = lsGet(KEY.game, null); if (!g) return;
    // 저장한 때에서 멈춘 것으로 이어서 — 화면을 떠나 있던 시간은 세지 않음
    if (g.run) { g.acc = (g.acc || 0) + Math.max(0, (g.saved || g.seg) - g.seg); g.run = false; }
    G = g; enterPlay();
    toast('멈춘 상태로 불러왔어요 — 누르면 계속');
  };
  $('btnDrop').onclick = function () { if (!confirm('진행 중인 게임을 버릴까요?')) return; lsDel(KEY.game); checkResume(); };

  // 화면을 떠날 때 저장
  function saveNow() { if (G && !G.ended) persist(); }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) saveNow();
    else if (wake.want) setWake(true);   // 다른 앱에 갔다 오면 화면 꺼짐 방지가 풀려 있음
  });
  window.addEventListener('pagehide', saveNow);

  window.addEventListener('popstate', function () {
    if ($('play').classList.contains('on') && G) {
      // 실수로 뒤로가기 → 멈추고 메뉴 (나가려면 메뉴에서)
      if (!$('resBg').hidden) { closeSheet('resBg'); lsDel(KEY.game); G = null; cancelAnimationFrame(raf); raf = 0; setWake(false); show('setup'); checkResume(); renderOpts(); renderPlayers(); return; }
      history.pushState({ tm: 'play' }, '');
      if ($('menuBg').hidden) openMenu(); else closeMenu(true);
      return;
    }
    if ($('sand').classList.contains('on')) { leaveSand(); return; }
    ['pickBg', 'menuBg', 'resBg'].forEach(closeSheet);
  });

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if ($('sand').classList.contains('on')) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); sandFlip(); }
      else if (e.key === 'p' || e.key === 'P') $('sandPause').click();
      else if (e.key === 'r' || e.key === 'R') $('sandReset').click();
      return;
    }
    if (!$('play').classList.contains('on') || !G) return;
    if (!$('menuBg').hidden || !$('resBg').hidden) { if (e.key === 'Escape' && !$('menuBg').hidden) closeMenu(true); return; }
    if (e.key === ' ' || e.key === 'Enter') {
      if (e.target.closest && e.target.closest('.pc')) return;   // 카드에 초점이 있으면 그 카드 누르기
      e.preventDefault();
      if (G.cur < 0) begin(0); else if (!G.run) resume(); else doPass();
    } else if (e.key === 'p' || e.key === 'P') togglePause();
    else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') { e.preventDefault(); doUndo(); }
    else if (e.key === 'r' || e.key === 'R') doReverse();
    else if (e.key === 'Escape' || e.key === 'm' || e.key === 'M') openMenu();
    else if (/^[1-8]$/.test(e.key) && +e.key <= G.ps.length) onCard(+e.key - 1);
  });

  /* ---------- 시작 ---------- */
  (function init() {
    if (/[?&]reset\b/.test(location.search)) history.replaceState(null, '', location.pathname);
    scanClub();
    $('btnMeet').hidden = !CLUB.meet; $('btnPick').hidden = !CLUB.members.length;
    sndIcons(); renderOpts(); renderPlayers(); checkResume();
    window.JMB_TIMER = { ver: VER };
  })();
})();
