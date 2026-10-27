/* 잠만보 순서 룰렛 v2.5.0 — 화면·카메라·효과·소리 (물리는 engine.js)
 * - 서버·DB 없음. 명단·설정만 이 기기 localStorage 에 저장 (jmb_rl_*)
 * - 그리기 최적화: 코스(움직이지 않는 것)는 한 번만 그려 둔 그림(오프스크린 캔버스)을 잘라 붙임,
 *   구슬은 색깔별 미리 그린 그림(스프라이트), 움직이는 것(풍차·문·반짝임·구슬·효과)만 매 프레임 그림
 * - 물리는 고정 간격(1/240초) 누적 실행 → 기기 성능·주사율이 달라도 결과 흐름이 같음
 */
(function () {
  'use strict';
  var E = window.RouletteEngine;
  if (!E) return;
  var W = E.W, R = E.R;
  var $ = function (id) { return document.getElementById(id); };
  var VER = '2.6.0';

  /* ---------- 저장 ---------- */
  var KEY = { names: 'jmb_rl_names', recent: 'jmb_rl_recent', opt: 'jmb_rl_opt' };
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var OPT = Object.assign({ mode: 'order', course: 'normal', sound: true, speed: 1 }, lsGet(KEY.opt, {}));
  function saveOpt() { lsSet(KEY.opt, OPT); }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 색 ---------- */
  var PAL = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#b197fc', '#ff922b', '#3bc9db', '#f783ac',
             '#a9e34b', '#748ffc', '#ffa8a8', '#20c997', '#e599f7', '#fab005', '#66d9e8', '#ff8787'];
  function colorOf(i) {
    if (i < PAL.length) return PAL[i];
    var h = (i * 137.508) % 360;
    return 'hsl(' + h.toFixed(0) + ',78%,' + (58 + (i % 3) * 6) + '%)';
  }

  /* ---------- 명단 ---------- */
  var MAXB = 100;
  function parse(text) {
    var parts = String(text || '').split(/[,\n，、;\t]+/), map = new Map();
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      var name = p, n = 1, m = p.match(/^(.*?)\s*[*×]\s*(\d{1,3})$/);
      if (m && m[1].trim()) { name = m[1].trim(); n = Math.max(1, Math.min(MAXB, +m[2])); }
      name = name.slice(0, 20);
      if (!name) continue;
      map.set(name, (map.get(name) || 0) + n);
    }
    var out = [], k = 0;
    map.forEach(function (n, name) { out.push({ name: name, n: n, color: colorOf(k++) }); });
    return out;
  }
  function serialize(list) { return list.map(function (e) { return e.n > 1 ? e.name + '*' + e.n : e.name; }).join(', '); }
  function total(list) { return list.reduce(function (s, e) { return s + e.n; }, 0); }

  /* ---------- 소리 (WebAudio, 파일 없음) ---------- */
  var SND = {
    ctx: null, out: null, last: {},
    init: function () {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        var comp = this.ctx.createDynamicsCompressor();
        this.out = this.ctx.createGain(); this.out.gain.value = 0.55;
        this.out.connect(comp); comp.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    },
    ok: function (kind, gap) {
      if (!OPT.sound || !this.ctx) return false;
      var t = this.ctx.currentTime;
      if (gap && this.last[kind] && t - this.last[kind] < gap) return false;
      this.last[kind] = t; return true;
    },
    tone: function (f, dur, type, vol, f2, delay) {
      var c = this.ctx, t = c.currentTime + (delay || 0);
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.02);
    },
    noise: function (dur, vol, freq) {
      var c = this.ctx, n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'lowpass'; f.frequency.value = freq || 400; g.gain.value = vol || 0.2;
      s.buffer = b; s.connect(f); f.connect(g); g.connect(this.out); s.start();
    },
    peg: function (v) { if (this.ok('peg', 0.03)) this.tone(1300 + Math.random() * 900, 0.05, 'sine', Math.min(0.07, 0.02 + v / 9000)); },
    wall: function (v) { if (this.ok('wall', 0.05)) this.tone(320 + Math.random() * 80, 0.05, 'triangle', Math.min(0.06, v / 12000)); },
    click: function () { if (this.ok('click', 0.04)) this.tone(2400, 0.02, 'square', 0.015); },
    spin: function () { if (this.ok('spin', 0.06)) this.tone(700, 0.06, 'square', 0.03, 380); },
    bump: function () { if (this.ok('bump', 0.06)) this.tone(240, 0.16, 'triangle', 0.12, 520); },
    heart: function () { if (this.ok('heart', 0.3)) { this.tone(62, 0.12, 'sine', 0.22, 48); this.tone(58, 0.12, 'sine', 0.16, 44, 0.16); } },
    gate: function () { if (this.ok('gate', 0.3)) { this.tone(180, 0.12, 'square', 0.05, 120); this.tone(660, 0.18, 'triangle', 0.08, 990, 0.05); } },
    shake: function () { if (this.ok('shake')) this.noise(0.45, 0.35, 260); },
    beep: function (hi) { if (this.ok('beep')) this.tone(hi ? 1046 : 660, hi ? 0.35 : 0.14, 'triangle', 0.16); },
    finish: function (rank) {
      if (!this.ok('fin', 0.05)) return;
      var base = rank === 1 ? 784 : 659;
      this.tone(base, 0.18, 'triangle', 0.13); this.tone(base * 1.26, 0.26, 'triangle', 0.11, 0, 0.08);
      if (rank === 1) this.tone(base * 1.5, 0.4, 'triangle', 0.12, 0, 0.16);
    },
    fanfare: function () {
      if (!this.ok('fan')) return;
      [523, 659, 784, 1046].forEach(function (f, i) { SND.tone(f, i === 3 ? 0.6 : 0.16, 'triangle', 0.13, 0, i * 0.11); });
    }
  };
  function sndIcon() {
    $('sndBtn').innerHTML = OPT.sound
      ? '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
  }

  /* ---------- 잠만보 데이터(이 기기에 저장된 것)에서 회원·모임 참가자 찾기 ---------- */
  // 앱이 저장해 둔 jmb_data_v2 를 읽기만 함. 구조를 모르면 버튼을 숨김 (서버 요청 없음)
  var CLUB = { members: [], meet: null };
  function unpackTbl(t) {
    if (t && Array.isArray(t.c) && Array.isArray(t.r)) return t.r.map(function (row) { var o = {}; t.c.forEach(function (k, i) { o[k] = row[i]; }); return o; });
    return Array.isArray(t) && t.length && typeof t[0] === 'object' && !Array.isArray(t[0]) ? t : null;
  }
  function findKey(o, re) { for (var k in o) if (re.test(k)) return k; return null; }
  function scanClub() {
    var raw; try { raw = localStorage.getItem('jmb_data_v2'); } catch (e) { return; }
    if (!raw) return;
    var root; try { root = JSON.parse(raw); } catch (e) { return; }
    var seen = 0, tables = [];
    (function walk(x, depth) {
      if (!x || depth > 5 || ++seen > 4000) return;
      if (typeof x === 'string' && depth < 3 && x.length > 2 && (x[0] === '{' || x[0] === '[')) { try { walk(JSON.parse(x), depth + 1); } catch (e) {} return; }
      if (typeof x !== 'object') return;
      var t = unpackTbl(x);
      if (t) { tables.push(t); return; }
      if (Array.isArray(x)) return;
      for (var k in x) walk(x[k], depth + 1);
    })(root, 0);
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
          if (!best || d > best.d) best = { d: d, p: r[kp], title: r[findKey(r, /제목|title/i)] || '' };
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

  /* 한글 초성 검색 */
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function cho(s) { var o = ''; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i) - 0xAC00; o += c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : s[i]; } return o; }
  function koMatch(name, q) { if (!q) return true; name = name.toLowerCase(); q = q.toLowerCase().replace(/\s+/g, ''); return name.replace(/\s+/g, '').indexOf(q) >= 0 || cho(name).indexOf(q) >= 0; }

  /* ---------- 설정 화면 ---------- */
  var namesEl = $('names');
  function refreshSetup() {
    var list = parse(namesEl.value), n = total(list);
    $('cnt').textContent = list.length + '명' + (n !== list.length ? ' · 구슬 ' + n + '개' : '');
    $('cnt').style.color = n > MAXB ? 'var(--bad)' : '';
    $('chips').innerHTML = list.map(function (e, i) {
      return '<button type="button" class="chip" data-i="' + i + '" title="빼기"><i style="background:' + e.color + '"></i>' + esc(e.name) + (e.n > 1 ? '<em>×' + e.n + '</em>' : '') + '<span class="x" aria-hidden="true">×</span></button>';
    }).join('');
    var okCount = list.length >= 2;
    $('btnStart').disabled = !okCount || n > MAXB;
    $('btnStart').querySelector('span').textContent = n > MAXB ? '구슬은 ' + MAXB + '개까지' : !okCount ? '2명 이상 넣어 주세요' : '구슬 ' + n + '개 굴리기';
    lsSet(KEY.names, namesEl.value);
  }
  $('chips').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    var list = parse(namesEl.value); list.splice(+b.getAttribute('data-i'), 1);
    namesEl.value = serialize(list); refreshSetup();
  });
  namesEl.addEventListener('input', refreshSetup);
  $('btnClear').onclick = function () { namesEl.value = ''; refreshSetup(); namesEl.focus(); };

  function renderRecent() {
    var r = lsGet(KEY.recent, []);
    $('recent').innerHTML = r.map(function (t, i) { return '<button type="button" data-i="' + i + '" title="' + esc(t) + '">↺ ' + esc(t) + '</button>'; }).join('');
  }
  $('recent').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    namesEl.value = lsGet(KEY.recent, [])[+b.getAttribute('data-i')] || ''; refreshSetup();
  });
  function pushRecent(text) {
    var r = lsGet(KEY.recent, []).filter(function (t) { return t !== text; });
    r.unshift(text); lsSet(KEY.recent, r.slice(0, 6));
  }

  function bindSeg(id, key, after) {
    var seg = $(id);
    function paint() { seg.querySelectorAll('button').forEach(function (b) { var on = b.getAttribute('data-v') === OPT[key]; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); b.setAttribute('role', 'radio'); }); if (after) after(); }
    seg.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; OPT[key] = b.getAttribute('data-v'); saveOpt(); paint(); });
    paint();
  }
  var COURSE_INFO = { quick: '약 15초', normal: '약 25초', long: '약 35초', random: '매번 다른 4구간' };
  bindSeg('segMode', 'mode');
  bindSeg('segCourse', 'course', function () { $('courseInfo').textContent = COURSE_INFO[OPT.course] || ''; renderRoute(); });
  // 코스 구성 미리 보기 (구간 이름표)
  function renderRoute() {
    var el = $('route'); if (!el) return;
    var keys = E.PRESET[OPT.course] ? E.PRESET[OPT.course].slice(1) : ['?', '?', '?', '?', 'final'];
    el.innerHTML = keys.map(function (k, i) {
      var m = E.MOD[k];
      return '<span class="rt' + (k === 'final' ? ' fin' : '') + '"' + (m ? ' style="--c:' + m.color + '"' : '') + '>' + (m ? m.name : '랜덤') + '</span>';
    }).join('<i>›</i>');
  }
  $('sndBtn').onclick = function () { OPT.sound = !OPT.sound; saveOpt(); sndIcon(); if (OPT.sound) { SND.init(); SND.beep(true); } };

  // 회원·모임 불러오기
  function addNames(arr) {
    var list = parse(namesEl.value), have = {};
    list.forEach(function (e) { have[e.name] = 1; });
    arr.forEach(function (n) { if (!have[n]) { list.push({ name: n, n: 1 }); have[n] = 1; } });
    namesEl.value = serialize(list); refreshSetup();
  }
  $('btnMeet').onclick = function () {
    if (!CLUB.meet) return;
    namesEl.value = ''; addNames(CLUB.meet.names);
    var d = CLUB.meet.d; toast((d.getMonth() + 1) + '/' + d.getDate() + ' 모임 참가자 ' + CLUB.meet.names.length + '명을 넣었어요');
  };
  var picked = {};
  $('btnPick').onclick = function () {
    picked = {}; parse(namesEl.value).forEach(function (e) { picked[e.name] = 1; });
    $('pickQ').value = ''; renderPick(); openSheet('pickBg');
    setTimeout(function () { if (matchMedia('(pointer:fine)').matches) $('pickQ').focus(); }, 300);
  };
  function renderPick() {
    var q = $('pickQ').value.trim();
    var arr = CLUB.members.filter(function (n) { return koMatch(n, q); });
    $('pickList').innerHTML = arr.length ? arr.map(function (n) { return '<button type="button" class="chip' + (picked[n] ? ' on' : '') + '" data-n="' + esc(n) + '">' + esc(n) + '</button>'; }).join('') : '<p class="hint">찾는 회원이 없어요</p>';
    $('pickOk').textContent = '넣기 (' + Object.keys(picked).length + ')';
  }
  $('pickQ').addEventListener('input', renderPick);
  $('pickList').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    var n = b.getAttribute('data-n'); if (picked[n]) delete picked[n]; else picked[n] = 1;
    b.classList.toggle('on', !!picked[n]); $('pickOk').textContent = '넣기 (' + Object.keys(picked).length + ')';
  });
  $('pickNone').onclick = function () { picked = {}; renderPick(); };
  $('pickOk').onclick = function () {
    var keep = parse(namesEl.value).filter(function (e) { return picked[e.name] || CLUB.members.indexOf(e.name) < 0; });
    namesEl.value = serialize(keep); addNames(Object.keys(picked)); closeSheet('pickBg');
  };

  var toastT = 0;
  function toast(t) { var el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('on'); }, 2200); }

  function openSheet(id) { var el = $(id); el.hidden = false; }
  function closeSheet(id) { $(id).hidden = true; }
  ['sheetBg', 'pickBg'].forEach(function (id) {
    $(id).addEventListener('click', function (e) { if (e.target === this && id === 'pickBg') closeSheet(id); });
  });

  /* ---------- 설정 화면 위 작은 애니메이션 (가벼운 핀볼) ---------- */
  var hero = (function () {
    var cv = $('heroCv'), ctx = cv.getContext('2d'), pegs = [], balls = [], raf = 0, last = 0, w = 0, h = 0;
    function size() {
      var dpr = Math.min(2, window.devicePixelRatio || 1), r = cv.getBoundingClientRect();
      w = r.width; h = r.height; if (!w) return;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pegs = [];
      for (var y = 34, row = 0; y < h - 10; y += 26, row++) for (var x = (row % 2 ? 22 : 8); x < w; x += 30) pegs.push({ x: x, y: y });
    }
    function spawn(b) { b.x = 20 + Math.random() * (w - 40); b.y = -10 - Math.random() * 80; b.vx = (Math.random() - 0.5) * 40; b.vy = 0; return b; }
    for (var i = 0; i < 12; i++) balls.push({ c: PAL[i] });
    function frame(t) {
      raf = requestAnimationFrame(frame);
      var dt = Math.min(0.033, (t - last) / 1000 || 0.016); last = t;
      if (!w) { size(); balls.forEach(spawn); }
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(201,211,255,.45)';
      pegs.forEach(function (p) { ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, 6.283); ctx.fill(); });
      balls.forEach(function (b) {
        if (b.y === undefined) spawn(b);
        b.vy += 420 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
        for (var k = 0; k < pegs.length; k++) {
          var p = pegs[k], dx = b.x - p.x, dy = b.y - p.y, d2 = dx * dx + dy * dy;
          if (d2 < 81) { var d = Math.sqrt(d2) || 1, nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny; b.x = p.x + nx * 9; b.y = p.y + ny * 9; if (vn < 0) { b.vx -= 1.5 * vn * nx; b.vy -= 1.5 * vn * ny; } }
        }
        if (b.x < 6 || b.x > w - 6) b.vx *= -1;
        if (b.y > h + 12) spawn(b);
        ctx.fillStyle = b.c; ctx.beginPath(); ctx.arc(b.x, b.y, 6.5, 0, 6.283); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(b.x - 2, b.y - 2.2, 2, 0, 6.283); ctx.fill();
      });
    }
    return {
      start: function () { if (raf || reduceMotion) { if (reduceMotion && !w) { size(); } return; } last = performance.now(); raf = requestAnimationFrame(frame); },
      stop: function () { cancelAnimationFrame(raf); raf = 0; },
      resize: function () { w = 0; }
    };
  })();

  /* =====================================================================
   * 게임
   * ===================================================================== */
  var cv = $('cv'), ctx = cv.getContext('2d', { alpha: false });
  var G = null;           // 진행 중인 판
  var V = {};             // 화면 크기·배율·미리 그린 그림
  var PX = 10, PY = 90;   // 코스 그림 여백(월드 단위)
  var BG = '#0d1222';

  function sizeView() {
    var r = $('stage').getBoundingClientRect();
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    V.cw = Math.max(200, r.width); V.ch = Math.max(240, r.height); V.dpr = dpr;
    V.mm = V.cw < 480 ? 40 : 56;                   // 오른쪽 미니맵 칸
    V.vw = V.cw - V.mm;
    // 코스 너비가 화면에 꼭 맞는 배율. 넓은 화면(PC)에서는 위아래로 최소 640 단위는 보이게 줄임
    V.s = Math.min(V.vw / (W + 2 * PX), V.ch / 640);
    $('stage').style.setProperty('--mm', V.mm + 'px');
    cv.width = Math.round(V.cw * dpr); cv.height = Math.round(V.ch * dpr);
  }

  /* --- 코스 그림 (한 번만) --- */
  function buildStatic() {
    var c = G.course, H = c.height + PY + 30, Wd = W + 2 * PX;
    var K = V.s * V.dpr * 1.25;                    // 확대(슬로 모션)에도 덜 흐리게 25% 크게
    var maxH = 16000, maxA = 10e6;
    if (H * K > maxH) K = maxH / H;
    if (H * K * Wd * K > maxA) K = Math.sqrt(maxA / (H * Wd));
    var sc = document.createElement('canvas');
    sc.width = Math.ceil(Wd * K); sc.height = Math.ceil(H * K);
    var g = sc.getContext('2d');
    g.setTransform(K, 0, 0, K, PX * K, PY * K);   // 이제 월드 좌표로 그림
    var font = getComputedStyle(document.body).fontFamily;
    function zoneAt(yy) { var z = c.zones[0]; for (var q = 0; q < c.zones.length; q++) if (yy >= c.zones[q].y) z = c.zones[q]; return z; }
    function rgba(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
    function rrect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

    // 1) 바탕: 짙은 남색 + 구역마다 강조색이 위에서 은은하게 번짐 + 가는 격자
    g.fillStyle = '#0a0f1f'; g.fillRect(-PX, -PY, Wd, H);
    c.zones.forEach(function (z) {
      var gr = g.createLinearGradient(0, z.y, 0, z.y + Math.min(z.h, 260));
      gr.addColorStop(0, rgba(z.color, z.key === 'final' ? 0.16 : 0.09)); gr.addColorStop(1, rgba(z.color, 0));
      g.fillStyle = gr; g.fillRect(0, z.y, W, z.h);
      g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, z.y, W, 1);
    });
    g.strokeStyle = 'rgba(255,255,255,.025)'; g.lineWidth = 1;
    g.beginPath();
    for (var gx = 44; gx < W; gx += 44) { g.moveTo(gx, 0); g.lineTo(gx, c.height); }
    for (var gy = 44; gy < c.height; gy += 44) { g.moveTo(0, gy); g.lineTo(W, gy); }
    g.stroke();

    // 2) 구역 이름표 (번호 · 이름)
    c.zones.forEach(function (z, i) {
      if (z.key === 'start') return;
      var label = (i < 10 ? '0' : '') + i + '  ' + z.name;
      g.font = '800 11px ' + font; g.textBaseline = 'middle';
      var w = g.measureText(label).width + 16, x = 10, y = z.y + 10;
      g.fillStyle = rgba(z.color, 0.16); rrect(x, y, w, 20, 10); g.fill();
      g.fillStyle = z.color; g.fillText(label, x + 8, y + 10.5);
    });

    // 3) 출발 칸
    var sp = c.spawn;
    g.fillStyle = 'rgba(124,147,255,.06)'; rrect(6, sp.y0 - 14, W - 12, sp.y1 - sp.y0 + 24, 14); g.fill();
    g.fillStyle = 'rgba(255,255,255,.22)'; g.font = '900 13px ' + font; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText('S T A R T', W / 2, sp.y0 - 2); g.textAlign = 'left';

    // 4) 역전 구간 꾸밈: 대기문 위험 줄무늬 · 막판 구역 표시 · 골인 구멍 빛
    if (c.gateY) {
      g.save(); g.beginPath(); g.rect(W / 2 - 60, c.gateY + 8, 120, 8); g.clip();
      for (var hx = W / 2 - 80; hx < W / 2 + 80; hx += 12) { g.fillStyle = (hx / 12 | 0) % 2 ? 'rgba(255,169,77,.35)' : 'rgba(0,0,0,0)'; g.beginPath(); g.moveTo(hx, c.gateY + 16); g.lineTo(hx + 8, c.gateY + 8); g.lineTo(hx + 14, c.gateY + 8); g.lineTo(hx + 6, c.gateY + 16); g.fill(); }
      g.restore();
    }
    if (c.slowY) {
      g.fillStyle = 'rgba(255,201,77,.05)'; g.fillRect(0, c.slowY, W, c.finishY - c.slowY);
      g.setLineDash([6, 6]); g.strokeStyle = 'rgba(255,201,77,.35)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(0, c.slowY); g.lineTo(W, c.slowY); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(255,201,77,.6)'; g.font = '800 10px ' + font; g.textAlign = 'right'; g.textBaseline = 'bottom';
      g.fillText('LAST CHANCE', W - 10, c.slowY - 4); g.textAlign = 'left';
    }
    // 결승선: 체크무늬 띠 + GOAL
    var fy = c.finishY, cs = 10;
    var gcx = c.goal && c.goal.hx ? c.goal.hx : W / 2;   // GOAL 구멍 위치(가운데에서 조금 치우칠 수 있음)
    var gl = g.createRadialGradient(gcx, fy, 4, gcx, fy, 120);
    gl.addColorStop(0, 'rgba(255,212,59,.35)'); gl.addColorStop(1, 'rgba(255,212,59,0)');
    g.fillStyle = gl; g.fillRect(gcx - 130, fy - 120, 260, 200);
    for (var i = 0; i * cs < W; i++) for (var j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? 'rgba(233,236,239,.9)' : 'rgba(20,24,40,.9)'; g.fillRect(i * cs, fy - cs + j * cs, cs, cs);
    }
    g.fillStyle = '#ffd43b'; g.font = '900 16px ' + font; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText('G O A L', gcx, fy + 18); g.textAlign = 'left';

    // 5) 벽: 구역 강조색으로 빛나는 관 + 흰 심
    g.lineCap = 'round';
    c.segs.forEach(function (s) {
      if (s.kind === 'gate') return;
      if (s.kind === 'side') { g.strokeStyle = '#1d2547'; g.lineWidth = s.t * 2; g.beginPath(); g.moveTo(s.ax, s.ay); g.lineTo(s.bx, s.by); g.stroke(); return; }
      var col = zoneAt((s.ay + s.by) / 2).color;
      g.shadowColor = rgba(col, 0.7); g.shadowBlur = 10 * K;
      g.strokeStyle = rgba(col, 0.95); g.lineWidth = s.t * 2;
      g.beginPath(); g.moveTo(s.ax, s.ay); g.lineTo(s.bx, s.by); g.stroke();
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = Math.max(0.8, s.t * 0.55);
      g.beginPath(); g.moveTo(s.ax, s.ay); g.lineTo(s.bx, s.by); g.stroke();
    });
    // 6) 핀: 강조색 테 + 흰 몸통
    c.pegs.forEach(function (p) {
      var col = zoneAt(p.y).color;
      g.fillStyle = rgba(col, 0.35); g.beginPath(); g.arc(p.x, p.y, p.r + 2.2, 0, 6.283); g.fill();
      g.fillStyle = '#eef1ff'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.283); g.fill();
      g.fillStyle = rgba(col, 0.9); g.beginPath(); g.arc(p.x, p.y, p.r * 0.45, 0, 6.283); g.fill();
    });
    // 7) 범퍼: 산호색 고리
    c.bumpers.forEach(function (b) {
      var gr = g.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.35, b.r * 0.1, b.x, b.y, b.r);
      gr.addColorStop(0, '#ffd6e2'); gr.addColorStop(0.5, '#ff6b93'); gr.addColorStop(1, '#b0204f');
      g.shadowColor = 'rgba(255,107,147,.6)'; g.shadowBlur = 12 * K;
      g.fillStyle = gr; g.beginPath(); g.arc(b.x, b.y, b.r, 0, 6.283); g.fill(); g.shadowBlur = 0;
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.6; g.beginPath(); g.arc(b.x, b.y, b.r * 0.6, 0, 6.283); g.stroke();
    });
    // 8) 대기문 레일 · 안내
    c.shutters.forEach(function (s) {
      g.strokeStyle = 'rgba(255,169,77,.22)'; g.lineWidth = 1; g.setLineDash([4, 4]);
      g.beginPath(); g.moveTo(s.x0 - s.half, s.y); g.lineTo(s.x0 + s.travel + s.half, s.y); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(255,255,255,.4)'; g.font = '700 10px ' + font; g.textBaseline = 'alphabetic';
      g.fillText('모이면 열려요', s.x0 + 76, s.y - 46);
    });
    // 9) 회전 날개 궤도
    c.spinners.forEach(function (s) {
      g.strokeStyle = 'rgba(255,146,43,.16)'; g.lineWidth = 1; g.setLineDash([3, 5]);
      g.beginPath(); g.arc(s.x, s.y, s.len, 0, 6.283); g.stroke(); g.setLineDash([]);
    });
    V.stat = sc; V.K = K;

    // 미니맵 (오른쪽 칸 높이에 맞춤)
    var mh = V.ch - 24, m = Math.min((V.mm - 10) / Wd, mh / H);
    var mc = document.createElement('canvas'), mdpr = V.dpr;
    mc.width = Math.ceil(Wd * m * mdpr); mc.height = Math.ceil(H * m * mdpr);
    mc.getContext('2d').drawImage(sc, 0, 0, mc.width, mc.height);
    V.mini = mc; V.mscale = m; V.mx = V.vw + (V.mm - Wd * m) / 2; V.my = 12;
  }

  /* --- 구슬 그림 (색마다 한 장) --- */
  function buildSprites() {
    var size = Math.ceil(2 * (R + 1.5) * V.s * 1.9 * V.dpr), cache = {};
    G.marbles.forEach(function (m) {
      if (cache[m.color]) { m.spr = cache[m.color]; return; }
      var c = document.createElement('canvas'); c.width = c.height = size;
      var g = c.getContext('2d'), r = size / 2 - 1;
      g.translate(size / 2, size / 2);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(r * 0.08, r * 0.12, r, 0, 6.283); g.fill();
      g.fillStyle = m.color; g.beginPath(); g.arc(0, 0, r * 0.94, 0, 6.283); g.fill();
      var gr = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r);
      gr.addColorStop(0, 'rgba(255,255,255,.85)'); gr.addColorStop(0.28, 'rgba(255,255,255,.18)'); gr.addColorStop(0.7, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.35)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r * 0.94, 0, 6.283); g.fill();
      cache[m.color] = m.spr = c;
    });
  }

  /* --- 카메라 --- */
  var cam = { x: W / 2, y: 0, z: 1, mode: 'auto', follow: -1, shake: 0, ts: 1 };
  function S() { return V.s * cam.z; }
  function sx(wx) { return (wx - cam.x) * S() + V.vw / 2; }
  function sy(wy) { return (wy - cam.y) * S() + V.ch / 2; }
  function clampCam() {
    var c = G.course, s = S(), halfH = V.ch / 2 / s, halfW = V.vw / 2 / s;
    var top = -60 + halfH, bot = c.height + 20 + 70 / s - halfH;   // 아래 버튼에 결승선이 가리지 않게 조금 더 내려갈 수 있음
    cam.y = bot < top ? (top + bot) / 2 : Math.max(top, Math.min(bot, cam.y));
    if (halfW * 2 >= W + 2 * PX) cam.x = W / 2;
    else cam.x = Math.max(halfW - PX, Math.min(W + PX - halfW, cam.x));
  }
  function camButton() {
    var t = cam.mode === 'all' ? '🗺️ 전체 보기' : cam.mode === 'free' ? '↩︎ 따라가기' : cam.mode === 'follow' && G.marbles[cam.follow] ? '🎯 ' + G.marbles[cam.follow].name.slice(0, 6) : '🎥 따라가기';
    $('btnCam').querySelector('span').textContent = t;
    $('btnCam').classList.toggle('on', cam.mode === 'all');
  }

  // 순위가 갈리는 순간인지: 1등 뽑기 = 1등 전, 꼴찌 뽑기 = 세 사람 이하 남았을 때, 순서 = 1등 + 마지막 두 사람
  function decisive() {
    if (G.mode === 'first') return G.ranked.length === 0;
    if (G.mode === 'last') return G.left.size <= 3;   // 꼴찌는 세 사람 남았을 때부터 (탈출 경쟁)
    return G.ranked.length === 0 || G.left.size === 2;
  }
  // 역전 구간 연출: 결정적인 구슬이 대기문을 지나면 슬로(0.6배) → 'LAST CHANCE' 선을 넘으면 무조건 깊은 슬로(0.28배)
  // {a: 맨 앞, b: 바로 뒤 다른 사람(가까우면), deep: 결승 직전}
  function finale() {
    if (G.phase !== 'run' || !decisive()) return null;
    var a = null, b = null, ms = G.marbles, c = G.course, i, m;
    for (i = 0; i < ms.length; i++) { m = ms[i]; if (!m.done && G.left.has(m.name) && (!a || m.y > a.y)) a = m; }
    if (!a || a.y < c.gateY + 20) return null;
    for (i = 0; i < ms.length; i++) { m = ms[i]; if (!m.done && G.left.has(m.name) && m.name !== a.name && (!b || m.y > b.y)) b = m; }
    return { a: a, b: b && a.y - b.y < 170 ? b : null, deep: a.y > c.slowY };
  }

  function updateCam(dt) {
    var c = G.course, ms = G.marbles, target = null, i, m, want = 1;
    var ct = finale();
    G.slow = !!ct; G.deep = !!(ct && ct.deep);
    var tsWant = !ct ? 1 : ct.deep ? 0.28 : 0.6;                    // 카메라 모드와 상관없이 슬로 모션
    G.ts += (tsWant - G.ts) * (1 - Math.exp(-dt * 6));
    G.lb += ((G.deep ? 1 : 0) - G.lb) * (1 - Math.exp(-dt * 5));     // 영화 같은 위아래 띠
    if (G.deep && !G.deepShown) { G.deepShown = true; banner('결승 직전!', 'hot'); }
    if (!G.deep) G.deepShown = false;
    if (cam.mode === 'all') {
      want = Math.min(1, V.ch / ((c.height + 80) * V.s));
      cam.z += (want - cam.z) * (1 - Math.exp(-dt * 6));
      cam.y += (c.height / 2 - 30 - cam.y) * (1 - Math.exp(-dt * 6));
      cam.x = W / 2;
      clampCam(); return;
    }
    if (cam.mode === 'follow') { target = ms[cam.follow]; if (!target || target.done) { cam.mode = 'auto'; camButton(); target = null; } }
    if (!target && cam.mode !== 'free') {
      if (G.phase === 'count') target = { x: W / 2, y: (c.spawn.y0 + c.spawn.y1) / 2 + 40 };
      else if (ct) target = ct.b ? { x: (ct.a.x + ct.b.x) / 2, y: (ct.a.y + ct.b.y) / 2 + 20 } : { x: ct.a.x, y: ct.a.y + 30 };
      else {
        var lastMode = G.mode === 'last' && G.world.finished.length >= G.marbles.length / 2;
        for (i = 0; i < ms.length; i++) {
          m = ms[i]; if (m.done) continue;
          if (!target || (lastMode ? m.y < target.y : m.y > target.y)) target = m;
        }
        if (!target) target = { x: W / 2, y: c.finishY - 80 };   // 모두 들어왔으면 결승선 보기
      }
    }
    if (ct && cam.mode === 'auto' && !reduceMotion) want = ct.deep ? (ct.b ? 1.45 : 1.65) : 1.2;
    cam.z += (want - cam.z) * (1 - Math.exp(-dt * 3.2));
    if (target) {
      var ahead = cam.mode === 'follow' || ct ? 0 : 60;
      var k = 1 - Math.exp(-dt * (ct ? 5 : 3.2));
      cam.y += (target.y + ahead - cam.y) * k;
      cam.x += ((cam.z > 1.05 ? target.x : W / 2) - cam.x) * k;
    }
    clampCam();
  }

  /* --- 알림 띠 (구역 돌입·대기문·결승 직전) --- */
  var bannerT = 0;
  function banner(text, kind) {
    var el = $('banner'); if (!el) return;
    el.className = 'banner ' + (kind || ''); el.textContent = text;
    void el.offsetWidth; el.classList.add('on');
    clearTimeout(bannerT); bannerT = setTimeout(function () { el.classList.remove('on'); }, 1500);
  }

  /* --- 효과(입자) --- */
  var parts = [], confetti = [];
  function burst(x, y, color, n, speed) {
    if (parts.length > 500) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
      parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, life: 0.6 + Math.random() * 0.5, t: 0, c: color, s: 1.5 + Math.random() * 2.2, k: 0 });
    }
  }
  function ring(x, y, r, color) { parts.push({ x: x, y: y, r: r, life: 0.35, t: 0, c: color, k: 1 }); }
  function confettiBurst() {
    if (reduceMotion) return;
    var cols = ['#ffd43b', '#ff6b6b', '#4dabf7', '#69db7c', '#b197fc', '#ff922b', '#f783ac'];
    for (var i = 0; i < 150; i++) {
      confetti.push({ x: V.vw / 2 + (Math.random() - 0.5) * 60, y: V.ch * 0.42, vx: (Math.random() - 0.5) * 700, vy: -250 - Math.random() * 550,
        r: Math.random() * 6.283, vr: (Math.random() - 0.5) * 14, w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, c: cols[i % cols.length], t: 0 });
    }
  }

  /* --- 판 시작 --- */
  function randSeed() {
    try { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; } catch (e) { return (Math.random() * 4294967296) >>> 0; }
  }
  var wakeLock = null;
  function wake(on) {
    try {
      if (on && navigator.wakeLock && !wakeLock) navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }, function () {});
      if (!on && wakeLock) { wakeLock.release(); wakeLock = null; }
    } catch (e) {}
  }

  function startGame(list) {
    SND.init();
    var entries = [];
    list.forEach(function (e) { for (var i = 0; i < e.n; i++) entries.push({ name: e.name, color: e.color, key: e.name }); });
    var seed = randSeed();
    var course = E.buildCourse(OPT.course, seed);
    var world = new E.World(course, entries, seed);
    G = { list: list, course: course, world: world, marbles: world.marbles, mode: OPT.mode, seed: seed,
          phase: 'count', countT: 3.2, shown: -1, acc: 0, ts: 1, openT: 0, endT: 0, ranked: [], stat: {},
          left: new Set(list.map(function (e) { return e.name; })), shakeCD: 0, unique: list.length, lastZone: '',
          slow: false, deep: false, deepShown: false, lb: 0, hb: 0, enteredFinal: false };
    list.forEach(function (e) { G.stat[e.name] = { n: e.n, done: 0 }; });
    G.marbles.forEach(function (m) { m.tx = new Float32Array(6); m.ty = new Float32Array(6); m.ti = 0; m.tn = 0; });
    parts.length = 0; confetti.length = 0;
    cam.mode = 'auto'; cam.follow = -1; cam.z = 1; cam.x = W / 2; cam.y = 0; cam.shake = 0;

    $('setup').classList.remove('on'); $('play').classList.add('on'); hero.stop();
    closeSheet('sheetBg');
    $('ranks').innerHTML = ''; $('pop').innerHTML = ''; $('count').innerHTML = '';
    $('btnSpeed').querySelector('span').textContent = OPT.speed + '×';
    sizeView(); buildStatic(); buildSprites(); camButton();
    updateCam(1);
    wake(true);
    if (!history.state || history.state.rl !== 'play') history.pushState({ rl: 'play' }, '');
    lastT = performance.now();
    if (!loopOn) { loopOn = true; requestAnimationFrame(loop); }
  }

  function quitGame() {
    G = null; loopOn = false; wake(false);
    closeSheet('sheetBg');
    $('play').classList.remove('on'); $('setup').classList.add('on');
    hero.start(); refreshSetup();
  }

  /* --- 매 프레임 --- */
  var loopOn = false, lastT = 0;
  function loop(now) {
    if (!loopOn || !G) return;
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000)); lastT = now;
    var w = G.world;

    // 카운트다운 (그동안 구슬은 문 위에서 자리 잡음)
    if (G.phase === 'count') {
      G.countT -= dt;
      var n = Math.ceil(G.countT - 0.2);
      if (n !== G.shown) {
        G.shown = n;
        if (n >= 1 && n <= 3) { $('count').innerHTML = '<b>' + n + '</b>'; SND.beep(false); }
      }
      if (G.countT <= 0.2) {
        G.phase = 'run'; w.open(); G.openT = w.t;
        $('count').innerHTML = '<b style="font-size:84px">GO!</b>'; SND.beep(true);
        burst(W / 2, G.course.gate.ay, '#ff8787', 30, 260);
        setTimeout(function () { if (G && G.phase !== 'count') $('count').innerHTML = ''; }, 800);
      }
    }

    // 물리 (고정 간격)
    var speed = G.phase === 'count' ? 1 : OPT.speed;
    G.acc += dt * G.ts * speed;
    var steps = 0;
    while (G.acc >= E.DT && steps < 48) { w.step(); G.acc -= E.DT; steps++; }
    if (steps >= 48) G.acc = 0;

    handleEvents();
    if (G.phase === 'run') checkEnd(dt);
    if (G.shakeCD > 0) {
      G.shakeCD -= dt;
      var b = $('btnShake'); b.querySelector('.cd').style.width = Math.max(0, G.shakeCD / 4 * 100) + '%';
      if (G.shakeCD <= 0) b.classList.remove('wait');
    }

    // 꼬리(잔상)용 위치 기록
    for (var i = 0; i < G.marbles.length; i++) {
      var m = G.marbles[i]; if (m.done) continue;
      m.tx[m.ti] = m.x; m.ty[m.ti] = m.y; m.ti = (m.ti + 1) % 6; if (m.tn < 6) m.tn++;
    }

    if (G.phase === 'run' && !G.enteredFinal) {   // 선두가 역전 구간에 들어오면 알림
      for (i = 0; i < G.marbles.length; i++) if (!G.marbles[i].done && G.marbles[i].y > G.course.finalY) { G.enteredFinal = true; banner('역전 구간 돌입!', 'final'); break; }
    }
    if (G.deep && (G.hb -= dt) <= 0) { G.hb = 0.6; SND.heart(); }   // 결승 직전: 심장 박동
    updateCam(dt);
    draw(dt);
    hud();
  }

  function handleEvents() {
    var ev = G.world.events;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      switch (e.type) {
        case 'peg': SND.peg(e.v); if (e.v > 380) burst(e.x, e.y, '#c9d3ff', 2, 90); break;
        case 'wall': SND.wall(e.v); break;
        case 'click': SND.click(); break;
        case 'spin': SND.spin(); break;
        case 'bump': SND.bump(); ring(e.x, e.y, e.o.r, '#ff8fb1'); burst(e.x, e.y, '#ff8fb1', 5, 160); cam.shake = Math.max(cam.shake, 0.12); break;
        case 'nudge': burst(e.x, e.y, '#ffffff', 6, 80); break;
        case 'shake': SND.shake(); cam.shake = 0.5; break;
        case 'gate': SND.gate(); burst(e.x, e.y + 6, '#ffa94d', 12, 160); if (G.phase === 'run') banner('대기문 열림 · ' + e.n + '개 출발', 'gate'); break;
        case 'finish': onFinish(e.m); break;
      }
    }
    ev.length = 0;
  }

  function onFinish(m) {
    burst(m.x, G.course.finishY, m.color, 22, 300);
    if (navigator.vibrate && G.mode !== 'last' && m.rank === 1) try { navigator.vibrate(30); } catch (e) {}
    // 순위가 정해지는 때: 순서·1등 = 그 이름의 첫 구슬, 꼴찌 = 그 이름의 마지막 구슬 (구슬 많을수록 '뽑힐' 확률이 큼)
    if (G.phase === 'end') { SND.finish(9); return; }   // 결과가 정해진 뒤 들어온 구슬은 순위에 넣지 않음
    var st = G.stat[m.name]; st.done++;
    var first = G.mode === 'last' ? st.done === st.n : st.done === 1;
    if (first) { G.ranked.push({ name: m.name, color: m.color, t: m.at - G.openT }); G.left.delete(m.name); }
    var place = G.ranked.length;
    SND.finish(first ? place : 9);
    if (!first) return;
    // 위 왼쪽 순위 목록
    var box = $('ranks'), maxShow = 6;
    if (place <= maxShow) {
      var d = document.createElement('div'); d.className = 'rk';
      d.innerHTML = '<b style="background:' + m.color + '">' + (G.mode === 'last' ? '✓' : place) + '</b><span>' + esc(m.name) + '</span>';
      box.appendChild(d);
    } else {
      var more = box.querySelector('.more');
      if (!more) { more = document.createElement('div'); more.className = 'rk more'; box.appendChild(more); }
      more.textContent = '+ ' + (place - maxShow) + '명';
    }
    // 가운데 알림 (앞쪽 3명 + 정해지는 순간)
    var big = G.unique <= 12 || place <= 3 || G.left.size <= 1;
    if (big) {
      var label = G.mode === 'last' ? '통과!' : G.mode === 'first' ? (place === 1 ? '🎉 1등!' : place + '등') : place + '등';
      var p = document.createElement('div');
      p.innerHTML = '<i style="background:' + m.color + '"></i>' + esc(m.name) + ' <small>' + label + '</small>';
      var pop = $('pop'); pop.appendChild(p);
      while (pop.children.length > 3) pop.removeChild(pop.firstChild);
      setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 1700);
    }
  }

  function checkEnd(dt) {
    var done = false, tail = 0;
    if (G.mode === 'first') done = G.ranked.length >= 1;
    else if (G.mode === 'last') done = G.left.size <= 1;
    else {
      done = G.left.size === 0;
      if (G.left.size === 1) { G.tailT = (G.tailT || 0) + dt; if (G.tailT > 8) done = true; }   // 마지막 한 명이 오래 걸리면 그대로 확정
    }
    if (done && !G.endT) { G.endT = G.world.t; G.phase = 'end'; setTimeout(showResult, G.mode === 'order' ? 900 : 1300); }
  }

  /* --- 그리기 --- */
  function drawStatic() {
    var s = S(), K = V.K, st = V.stat;
    var wx0 = cam.x - V.vw / 2 / s, wy0 = cam.y - V.ch / 2 / s, ww = V.vw / s, wh = V.ch / s;
    var x0 = (wx0 + PX) * K, y0 = (wy0 + PY) * K, x1 = x0 + ww * K, y1 = y0 + wh * K;
    var cx0 = Math.max(0, x0), cy0 = Math.max(0, y0), cx1 = Math.min(st.width, x1), cy1 = Math.min(st.height, y1);
    if (cx1 <= cx0 || cy1 <= cy0) return;
    ctx.drawImage(st, cx0, cy0, cx1 - cx0, cy1 - cy0,
      sx(cx0 / K - PX), sy(cy0 / K - PY), (cx1 - cx0) / K * s, (cy1 - cy0) / K * s);
  }

  function draw(dt) {
    var c = G.course, s = S(), dpr = V.dpr, i, m;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG; ctx.fillRect(0, 0, V.cw, V.ch);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, V.vw, V.ch); ctx.clip();
    if (cam.shake > 0) { cam.shake -= dt; var a = cam.shake * 9; ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a); }
    drawStatic();
    var top = cam.y - V.ch / 2 / s - 30, bot = cam.y + V.ch / 2 / s + 30;

    // 반짝이는 핀·범퍼
    ctx.lineCap = 'round';
    for (i = 0; i < c.pegs.length; i++) {
      var p = c.pegs[i]; if (p.flash <= 0 || p.y < top || p.y > bot) continue;
      ctx.fillStyle = 'rgba(255,255,255,' + (p.flash / 0.18 * 0.9).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), (p.r + 2.5) * s, 0, 6.283); ctx.fill();
    }
    for (i = 0; i < c.bumpers.length; i++) {
      var bp = c.bumpers[i]; if (bp.flash <= 0) continue;
      var f = bp.flash / 0.25;
      ctx.strokeStyle = 'rgba(255,240,246,' + f.toFixed(3) + ')'; ctx.lineWidth = 3 * s;
      ctx.beginPath(); ctx.arc(sx(bp.x), sy(bp.y), (bp.r + 2 + (1 - f) * 6) * s, 0, 6.283); ctx.stroke();
    }
    // 출발 문
    if (c.gate && c.gate.on) {
      ctx.strokeStyle = '#ff8787'; ctx.lineWidth = c.gate.t * 2 * s; ctx.setLineDash([10 * s, 6 * s]);
      ctx.beginPath(); ctx.moveTo(sx(c.gate.ax), sy(c.gate.ay)); ctx.lineTo(sx(c.gate.bx), sy(c.gate.by)); ctx.stroke(); ctx.setLineDash([]);
    }
    // 역전 대기문: 막대 + 모인 구슬 수 표시등
    for (i = 0; i < c.shutters.length; i++) {
      var sh = c.shutters[i]; if (sh.y < top || sh.y > bot) continue;
      ctx.strokeStyle = sh.state ? '#69db7c' : '#ff922b'; ctx.lineWidth = sh.t * 2 * s;
      ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 10 * s;
      ctx.beginPath(); ctx.moveTo(sx(sh.cx - sh.half), sy(sh.y)); ctx.lineTo(sx(sh.cx + sh.half), sy(sh.y)); ctx.stroke(); ctx.shadowBlur = 0;
      var lx = sh.x0 + 82, ly = sh.y - 34;
      for (k = 0; k < sh.need; k++) {
        var lit = k < sh.count;
        ctx.fillStyle = lit ? '#ffd43b' : 'rgba(255,255,255,.14)';
        ctx.beginPath(); ctx.arc(sx(lx + k * 15), sy(ly), 4.2 * s, 0, 6.283); ctx.fill();
      }
      if (sh.state === 0 && sh.count) {   // 기다리는 시간 막대
        ctx.fillStyle = 'rgba(255,146,43,.75)';
        ctx.fillRect(sx(lx - 4), sy(ly + 10), Math.min(1, sh.wait / sh.maxWait) * (sh.need * 15) * s, 2.5 * s);
      }
    }
    // 풍차
    for (i = 0; i < c.spinners.length; i++) {
      var sp = c.spinners[i]; if (sp.y + sp.len < top || sp.y - sp.len > bot) continue;
      // 움직이는 날개는 모든 구간에서 같은 색(흰 몸통 + 주황 빛) → 벽(구간 색)과 한눈에 구분
      ctx.strokeStyle = '#fff4e0'; ctx.lineWidth = sp.t * 2 * s;
      ctx.shadowColor = 'rgba(255,146,43,.85)'; ctx.shadowBlur = 10 * s;
      ctx.beginPath();
      for (var k = 0; k < sp.arms; k++) {
        var an = sp.a + k * Math.PI * 2 / sp.arms;
        ctx.moveTo(sx(sp.x), sy(sp.y)); ctx.lineTo(sx(sp.x + Math.cos(an) * sp.len), sy(sp.y + Math.sin(an) * sp.len));
      }
      ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#ff922b'; ctx.beginPath(); ctx.arc(sx(sp.x), sy(sp.y), 5 * s, 0, 6.283); ctx.fill();
    }
    // 결승선 반짝임
    var fy = sy(c.finishY);
    if (fy > -20 && fy < V.ch + 20) {
      var pulse = 0.25 + 0.2 * Math.sin(performance.now() / 200);
      ctx.fillStyle = 'rgba(255,212,59,' + pulse.toFixed(3) + ')'; ctx.fillRect(sx(0), fy - 1.5 * s, W * s, 3 * s);
    }

    // 구슬: 꼬리 → 몸통 → 이름
    var vis = [], lead = null, ms = G.marbles;
    for (i = 0; i < ms.length; i++) { m = ms[i]; if (!m.done && m.y > top && m.y < bot) vis.push(m); if (!m.done && (!lead || m.y > lead.y)) lead = m; }
    var trails = vis.length <= 50;
    if (trails) {
      for (i = 0; i < vis.length; i++) {
        m = vis[i]; if (m.tn < 3 || m.vx * m.vx + m.vy * m.vy < 90000) continue;
        ctx.strokeStyle = m.color; ctx.lineWidth = R * 1.1 * s; ctx.globalAlpha = 0.22;
        ctx.beginPath();
        for (k = 0; k < m.tn; k++) { var idx = (m.ti - m.tn + k + 6) % 6; if (k) ctx.lineTo(sx(m.tx[idx]), sy(m.ty[idx])); else ctx.moveTo(sx(m.tx[idx]), sy(m.ty[idx])); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    var rr = (R + 1.5) * s;
    for (i = 0; i < vis.length; i++) { m = vis[i]; ctx.drawImage(m.spr, sx(m.x) - rr, sy(m.y) - rr, rr * 2, rr * 2); }
    // 따라가는 구슬 표시
    var fm = cam.mode === 'follow' ? ms[cam.follow] : null;
    if (fm && !fm.done) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(fm.x), sy(fm.y), rr + 4 + Math.sin(performance.now() / 150) * 1.5, 0, 6.283); ctx.stroke(); }
    // 이름표: 적으면 모두, 많으면 선두·따라가는 구슬만
    var fs = Math.max(10, Math.min(13, 11 * cam.z));
    ctx.font = '700 ' + fs + 'px ' + 'Pretendard Variable, Pretendard, -apple-system, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineJoin = 'round';
    var many = vis.length > 24 || cam.z < 0.8;   // 많거나 멀리서 볼 때는 선두·따라가는 구슬만 이름 표시
    for (i = 0; i < vis.length; i++) {
      m = vis[i];
      if (many && m !== lead && m !== fm) continue;
      var nm = m.name.length > 7 ? m.name.slice(0, 6) + '…' : m.name, tx = sx(m.x), ty = sy(m.y) - rr - 2;
      if (m === lead && G.phase === 'run') nm = '👑 ' + nm;
      var hw = ctx.measureText(nm).width / 2 + 3;
      tx = Math.max(hw, Math.min(V.vw - hw, tx));   // 화면 밖으로 잘리지 않게
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,10,20,.85)'; ctx.strokeText(nm, tx, ty);
      ctx.fillStyle = '#fff'; ctx.fillText(nm, tx, ty);
    }
    ctx.textAlign = 'left';

    // 입자
    for (i = parts.length - 1; i >= 0; i--) {
      var q = parts[i]; q.t += dt;
      if (q.t >= q.life) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      var al = 1 - q.t / q.life;
      if (q.k === 1) {
        ctx.strokeStyle = q.c; ctx.globalAlpha = al; ctx.lineWidth = 3 * s;
        ctx.beginPath(); ctx.arc(sx(q.x), sy(q.y), (q.r + 4 + (1 - al) * 18) * s, 0, 6.283); ctx.stroke();
      } else {
        q.vy += 600 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
        ctx.fillStyle = q.c; ctx.globalAlpha = al;
        ctx.fillRect(sx(q.x) - q.s / 2, sy(q.y) - q.s / 2, q.s, q.s);
      }
    }
    ctx.globalAlpha = 1;
    // 슬로 모션 가장자리 어둡게
    if (G.ts < 0.85) {
      var vg = ctx.createRadialGradient(V.vw / 2, V.ch / 2, Math.min(V.vw, V.ch) * 0.3, V.vw / 2, V.ch / 2, Math.max(V.vw, V.ch) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,' + ((0.85 - G.ts) * 0.9).toFixed(3) + ')');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, V.vw, V.ch);
    }
    if (G.lb > 0.01) {   // 결승 직전: 위아래 검은 띠
      var bh = G.lb * V.ch * 0.075;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, V.vw, bh); ctx.fillRect(0, V.ch - bh, V.vw, bh);
    }
    ctx.restore();

    drawMini();

    // 종이 꽃가루 (화면 좌표)
    if (confetti.length) {
      for (i = confetti.length - 1; i >= 0; i--) {
        var cf = confetti[i]; cf.t += dt;
        cf.vy += 700 * dt; cf.vx *= 0.99; cf.x += cf.vx * dt; cf.y += cf.vy * dt; cf.r += cf.vr * dt;
        if (cf.y > V.ch + 20 || cf.t > 4) { confetti[i] = confetti[confetti.length - 1]; confetti.pop(); continue; }
        ctx.save(); ctx.translate(cf.x, cf.y); ctx.rotate(cf.r); ctx.fillStyle = cf.c;
        ctx.fillRect(-cf.w / 2, -cf.h / 2 * Math.abs(Math.cos(cf.t * 6)), cf.w, cf.h * Math.abs(Math.cos(cf.t * 6)) + 0.5);
        ctx.restore();
      }
    }
  }

  function drawMini() {
    var m = V.mscale, ox = V.mx, oy = V.my;
    ctx.fillStyle = '#090d19'; ctx.fillRect(V.vw, 0, V.mm, V.ch);
    ctx.drawImage(V.mini, ox, oy, V.mini.width / V.dpr, V.mini.height / V.dpr);
    // 지금 보는 범위
    var s = S(), vy0 = cam.y - V.ch / 2 / s, vh = V.ch / s;
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + (vy0 + PY) * m, (W + 2 * PX) * m - 1, vh * m);
    var ms = G.marbles;
    for (var i = 0; i < ms.length; i++) {
      var q = ms[i]; if (q.done) continue;
      ctx.fillStyle = q.color; ctx.fillRect(ox + (q.x + PX) * m - 1.5, oy + (q.y + PY) * m - 1.5, 3, 3);
    }
  }

  var hudCache = {};
  function hud() {
    var t = G.phase === 'count' ? 0 : ((G.endT || G.world.t) - G.openT);
    var tt = t.toFixed(1), left = G.mode === 'order' ? '남은 ' + G.left.size + '명' : '남은 ' + G.left.size + '명';
    if (hudCache.t !== tt) { $('hudTime').textContent = tt + '초'; hudCache.t = tt; }
    if (hudCache.l !== left) { $('hudLeft').textContent = left; hudCache.l = left; }
    var z = G.course.zones, name = '';
    for (var i = 0; i < z.length; i++) if (cam.y >= z[i].y) name = z[i].name;
    if (cam.mode === 'all') name = '전체 코스';
    if (G.slow) name = G.deep ? '🎬 결승 직전 · 슬로' : '🎬 역전 구간 · 슬로';
    if (hudCache.z !== name) { $('hudZone').textContent = name; hudCache.z = name; }
  }

  /* --- 결과 --- */
  function finalOrder() {
    var out = G.ranked.slice();
    // 아직 못 들어온 사람: 더 많이 내려온 순서로 뒤에 붙임
    var rest = [], seen = new Set(out.map(function (e) { return e.name; }));
    G.marbles.slice().sort(function (a, b) { return b.y - a.y; }).forEach(function (m) {
      if (!seen.has(m.name)) { seen.add(m.name); rest.push({ name: m.name, color: m.color, t: null }); }
    });
    return out.concat(rest);
  }
  function showResult() {
    if (!G) return;
    var order = finalOrder(), win = null, title = '순서 결과', hl = -1;
    if (G.mode === 'first') { win = order[0]; title = '1등 당첨'; hl = 0; }
    else if (G.mode === 'last') { win = order[order.length - 1]; title = '꼴찌 당첨'; hl = order.length - 1; }
    $('resTitle').textContent = title;
    if (window.JMB_FX) { JMB_FX.confetti({ y: 0.3 }); JMB_FX.haptic('win'); }   // 🎉 결과 (../fx.js)
    $('resWin').innerHTML = win ? '<div class="win"><span class="ball" style="background:' + win.color + '"></span><div><small>' + (G.mode === 'first' ? '가장 먼저 들어온 사람' : '가장 늦게 남은 사람') + '</small><b>' + esc(win.name) + '</b></div></div>' : '';
    $('resList').innerHTML = order.map(function (e, i) {
      var label = G.mode === 'last' && i === order.length - 1 ? '꼴찌' : e.t == null ? '—' : e.t.toFixed(2) + '초';
      return '<li class="' + (i === hl ? 'hl' : '') + '" style="animation-delay:' + Math.min(i * 0.06, 1.2) + 's"><span class="n">' + (i + 1) + '</span><i style="background:' + e.color + '"></i><span>' + esc(e.name) + '</span><small>' + label + '</small></li>';
    }).join('');
    G.order = order;
    openSheet('sheetBg');
    confettiBurst(); SND.fanfare();
    if (navigator.vibrate) try { navigator.vibrate([20, 40, 20]); } catch (e) {}
  }

  $('btnCopy').onclick = function () {
    if (!G || !G.order) return;
    var head = G.mode === 'first' ? '🎯 1등 당첨: ' + G.order[0].name : G.mode === 'last' ? '🎯 꼴찌 당첨: ' + G.order[G.order.length - 1].name : '🎲 순서 룰렛 결과';
    var txt = head + '\n' + G.order.map(function (e, i) { return (i + 1) + '. ' + e.name; }).join('\n');
    var done = function () { toast('결과를 복사했어요'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
    else { fallbackCopy(txt); done(); }
  };
  function fallbackCopy(t) { var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); }
  $('btnAgain').onclick = function () { if (G) startGame(G.list); };
  $('btnEdit').onclick = function () { history.back(); };
  $('btnQuit').onclick = function () { history.back(); };

  /* --- 조작: 흔들기·카메라·배속·화면 끌기 --- */
  $('btnShake').onclick = function () {
    if (!G || G.phase !== 'run' || G.shakeCD > 0) return;
    G.world.shake(); G.shakeCD = 4; this.classList.add('wait');
  };
  $('btnCam').onclick = function () {
    if (!G) return;
    cam.mode = cam.mode === 'auto' ? 'all' : 'auto'; cam.follow = -1; camButton();
  };
  $('btnSpeed').onclick = function () {
    OPT.speed = OPT.speed === 1 ? 2 : 1; saveOpt();
    this.querySelector('span').textContent = OPT.speed + '×';
  };
  (function () {
    var st = $('stage'), down = null;
    st.addEventListener('pointerdown', function (e) {
      if (!G || e.target !== cv) return;
      var r = cv.getBoundingClientRect();
      down = { x: e.clientX, y: e.clientY, cy: cam.y, moved: false, mini: e.clientX - r.left > V.vw, r: r };
      try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      if (down.mini) miniJump(e.clientY - r.top);
    });
    st.addEventListener('pointermove', function (e) {
      if (!down || !G) return;
      if (down.mini) { miniJump(e.clientY - down.r.top); return; }
      var dy = e.clientY - down.y;
      if (!down.moved && Math.abs(dy) + Math.abs(e.clientX - down.x) > 8) { down.moved = true; if (cam.mode !== 'all') { cam.mode = 'free'; camButton(); } }
      if (down.moved && cam.mode === 'free') { cam.y = down.cy - dy / S(); clampCam(); }
    });
    st.addEventListener('pointerup', function (e) {
      if (!down || !G) { down = null; return; }
      if (!down.moved && !down.mini) {   // 톡: 가까운 구슬 따라가기
        var wx = (e.clientX - down.r.left - V.vw / 2) / S() + cam.x, wy = (e.clientY - down.r.top - V.ch / 2) / S() + cam.y;
        var best = -1, bd = Math.pow(34 / S(), 2);
        G.marbles.forEach(function (m, i) { if (m.done) return; var d = (m.x - wx) * (m.x - wx) + (m.y - wy) * (m.y - wy); if (d < bd) { bd = d; best = i; } });
        if (best >= 0) { cam.mode = 'follow'; cam.follow = best; camButton(); toast(G.marbles[best].name + ' 구슬을 따라가요'); }
      }
      down = null;
    });
    st.addEventListener('pointercancel', function () { down = null; });
    st.addEventListener('wheel', function (e) {
      if (!G || cam.mode === 'all') return;
      e.preventDefault(); cam.mode = 'free'; camButton(); cam.y += e.deltaY / S(); clampCam();
    }, { passive: false });
    function miniJump(py) {
      cam.mode = 'free'; camButton();
      cam.y = (py - V.my) / V.mscale - PY; clampCam();
    }
  })();

  /* --- 화면 크기·뒤로가기 --- */
  var rsT = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rsT);
    rsT = setTimeout(function () { if (G) { sizeView(); buildStatic(); buildSprites(); } hero.resize(); }, 150);
  });
  window.addEventListener('popstate', function () {
    if (!$('pickBg').hidden) { closeSheet('pickBg'); return; }
    if (G) quitGame();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('pickBg').hidden) closeSheet('pickBg');
    if (!G || G.phase !== 'run') return;
    if (e.key === ' ') { e.preventDefault(); $('btnShake').click(); }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { wake(false); return; }
    lastT = performance.now();
    if (G) wake(true);
  });

  /* --- 시작 --- */
  $('btnStart').onclick = function () {
    var list = parse(namesEl.value);
    if (list.length < 2 || total(list) > MAXB) return;
    pushRecent(serialize(list)); renderRecent();
    startGame(list);
  };

  // 주소에 ?n=이름1,이름2 를 붙여 열면 명단을 채움 (공유용)
  try {
    var qn = new URLSearchParams(location.search).get('n');
    if (qn) namesEl.value = qn;
    else namesEl.value = lsGet(KEY.names, '');
    if (/[?&]reset\b/.test(location.search)) history.replaceState(null, '', location.pathname);
  } catch (e) {}
  scanClub();
  $('btnMeet').hidden = !CLUB.meet;
  $('btnPick').hidden = !CLUB.members.length;
  if (CLUB.meet) $('btnMeet').title = (CLUB.meet.title || '최근 모임') + ' · ' + CLUB.meet.names.length + '명';
  sndIcon(); renderRecent(); refreshSetup(); hero.start();
  window.JMB_ROULETTE = { ver: VER, get game() { return G; }, cam: cam, parse: parse };
})();
