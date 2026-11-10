/* 잠만보 단체 줄넘기 — 화면 · 그림 · 소리 app.js (규칙·판정은 core.js)
 * 서버 없음. 그림은 canvas 에 직접 그린 미플(fx.js 아바타와 같은 색·표정), 소리는 Web Audio 합성.
 * 모임 랭킹: 혼자 하기 · 다 같이 한 줄이 끝나면 넘은 횟수를 JMB_ARCADE.report 로 (서바이벌 · 0번은 안 보냄)
 * 기기 저장: jmb_jumprope_opt(소리 · 명단 · 자리) · jmb_jumprope_best(최고 기록) · jmb_jumprope_log(최근 20판)
 */
(function () {
  'use strict';
  var VER = '1.0.0';
  var C = window.JR_CORE, FX = window.JMB_FX || {}, ARC = window.JMB_ARCADE || null;   // ARC: 모임 랭킹(../arcade.js)
  var TAU = Math.PI * 2, AIR = C.AIR;
  var $ = function (id) { return document.getElementById(id); };
  var REDUCE = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var LS = { opt: 'jmb_jumprope_opt', best: 'jmb_jumprope_best', log: 'jmb_jumprope_log' };
  var DEFAULTS = ['잠만보', '도토리', '치즈', '감자', '호두', '모찌'];
  var HUES = [4, 212, 140, 42];           // 여럿이: 자리 색 (빨강 · 파랑 · 초록 · 노랑)
  var KEYS = ['KeyQ', 'KeyP', 'KeyZ', 'KeyM'], KEYNAME = ['Q', 'P', 'Z', 'M'];
  var MODE_NAME = { solo: '혼자 하기', coop: '다 같이 한 줄', surv: '서바이벌' };

  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'; }
  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 10); }
  // 이름 뒤 조사 (받침 있으면 a, 없으면 b)
  function josa(name, a, b) { var c = String(name).charCodeAt(String(name).length - 1) - 0xAC00; return c >= 0 && c < 11172 ? (c % 28 ? a : b) : a + '(' + b + ')'; }
  function avatar(name, px) { return FX.avatar ? FX.avatar(name, px) : ''; }
  function vib(k) { if (FX.haptic) try { FX.haptic(k); } catch (e) {} }
  var toastT = 0;
  function toast(msg) { var el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('on'); }, 2200); }

  var OPT = load(LS.opt, {});
  if (typeof OPT !== 'object' || !OPT) OPT = {};
  OPT.sound = OPT.sound !== false;
  OPT.names = (Array.isArray(OPT.names) ? OPT.names : DEFAULTS.slice()).map(clean).filter(Boolean).slice(0, 8);
  OPT.seats = (Array.isArray(OPT.seats) ? OPT.seats : []).map(clean).slice(0, 4);
  OPT.n = clamp(+OPT.n || 2, 2, 4);
  OPT.mmode = OPT.mmode === 'surv' ? 'surv' : 'coop';
  function saveOpt() { save(LS.opt, OPT); }
  var BEST = load(LS.best, {}); if (typeof BEST !== 'object' || !BEST) BEST = {};
  var LOG = load(LS.log, []); if (!Array.isArray(LOG)) LOG = [];

  /* =====================================================================
   * 소리 (Web Audio 합성 — 외부 음원 없음)
   * ===================================================================== */
  var AC = null, master = null, noiseBuf = null;
  function audio() {
    if (!OPT.sound) return null;
    try {
      if (!AC) {
        var K = window.AudioContext || window.webkitAudioContext; if (!K) return null;
        AC = new K(); master = AC.createGain(); master.gain.value = 0.55;
        var cp = AC.createDynamicsCompressor(); master.connect(cp); cp.connect(AC.destination);
        noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.6, AC.sampleRate);
        var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (AC.state === 'suspended') AC.resume();
    } catch (e) { return null; }
    return AC;
  }
  function tone(f, dur, o) {
    var ac = audio(); if (!ac) return;
    o = o || {};
    var t = ac.currentTime + (o.at || 0), os = ac.createOscillator(), gn = ac.createGain(), v = o.vol == null ? 0.2 : o.vol;
    os.type = o.type || 'sine'; os.frequency.setValueAtTime(f, t);
    if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(v, t + 0.008); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    os.connect(gn); gn.connect(master); os.start(t); os.stop(t + dur + 0.03);
  }
  function noise(dur, o) {
    var ac = audio(); if (!ac) return;
    o = o || {};
    var t = ac.currentTime + (o.at || 0), src = ac.createBufferSource(), bp = ac.createBiquadFilter(), gn = ac.createGain(), v = o.vol == null ? 0.2 : o.vol;
    src.buffer = noiseBuf; src.loop = true;
    bp.type = o.type || 'bandpass'; bp.Q.value = o.q || 1.2; bp.frequency.setValueAtTime(o.f || 800, t);
    if (o.to) bp.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(v, t + dur * 0.35); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(gn); gn.connect(master); src.start(t); src.stop(t + dur + 0.03);
  }
  var PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  var SND = {
    whoosh: function (fast) { noise(fast ? 0.11 : 0.15, { f: 500, to: fast ? 2600 : 1900, vol: 0.22, q: 0.9 }); },   // 줄이 휙
    jump: function (k) { tone(300 + (k || 0) * 55, 0.11, { to: 600 + (k || 0) * 90, vol: 0.13, type: 'sine' }); },
    perfect: function (streak) { var f = 880 * Math.pow(2, PENTA[Math.min(PENTA.length - 1, Math.floor((streak || 0) / 3))] / 12); tone(f, 0.09, { vol: 0.13, type: 'triangle' }); tone(f * 1.5, 0.14, { vol: 0.11, type: 'triangle', at: 0.05 }); },
    good: function () { tone(660, 0.08, { vol: 0.09, type: 'triangle' }); },
    trip: function () { tone(240, 0.38, { to: 60, vol: 0.26, type: 'sawtooth' }); noise(0.22, { f: 260, to: 90, vol: 0.4, type: 'lowpass', q: 0.7 }); tone(700, 0.07, { vol: 0.12, type: 'square', at: 0.02 }); },
    tick: function () { tone(1050, 0.035, { vol: 0.14, type: 'square' }); },
    go: function () { tone(660, 0.1, { vol: 0.16, type: 'triangle' }); tone(990, 0.18, { vol: 0.16, type: 'triangle', at: 0.1 }); },
    cue: function () { tone(784, 0.07, { vol: 0.14, type: 'square' }); tone(784, 0.07, { vol: 0.14, type: 'square', at: 0.11 }); },
    fake: function () { tone(520, 0.16, { to: 880, vol: 0.12, type: 'sine' }); },
    join: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.12, { vol: 0.13, type: 'triangle', at: i * 0.07 }); }); },
    level: function () { [784, 988, 1175].forEach(function (f, i) { tone(f, 0.11, { vol: 0.12, type: 'triangle', at: i * 0.08 }); }); },
    over: function () { [523, 440, 349, 262].forEach(function (f, i) { tone(f, 0.22, { vol: 0.16, type: 'triangle', at: i * 0.16 }); }); },
    record: function () { [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.16, { vol: 0.15, type: 'triangle', at: i * 0.1 }); }); }
  };
  var SND_ON = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
  var SND_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9.5l4 5M21 9.5l-4 5"/></svg>';
  function renderSnd() {
    $('sndBtn').innerHTML = OPT.sound ? SND_ON : SND_OFF; $('sndBtn').classList.toggle('off', !OPT.sound);
    $('sndBtn').setAttribute('aria-pressed', OPT.sound ? 'true' : 'false');
    $('btnSnd2').textContent = OPT.sound ? '소리 끄기' : '소리 켜기';
  }
  function toggleSound() { OPT.sound = !OPT.sound; saveOpt(); renderSnd(); if (OPT.sound) SND.good(); else if (AC) try { AC.suspend(); } catch (e) {} }

  /* =====================================================================
   * 미플 그리기 — fx.js 아바타와 같은 모양 · 같은 이름이면 같은 색·표정·소품
   * ===================================================================== */
  var MEEPLE_D = 'M20 17.6c-5.6 0-12.4 1.1-12.4 4.7 0 2.3 2.6 2.9 5.6 2.5L9.6 33.9c-.5 1.5.4 2.3 1.7 2.3h5.9L20 30.7l2.8 5.5h5.9c1.3 0 2.2-.8 1.7-2.3l-3.6-9.1c3 .4 5.6-.2 5.6-2.5 0-3.6-6.8-4.7-12.4-4.7z';
  var meeplePath = null;
  function hash(s) { var h = 2166136261; s = String(s || ''); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function lookOf(name, hue) {
    var h = hash(name), v = h >>> 9, hu = hue == null ? h % 360 : hue;
    return { body: 'hsl(' + hu + ',58%,50%)', ink: 'hsl(' + hu + ',60%,24%)', soft: 'hsl(' + hu + ',75%,90%)', face: v % 4, acc: (v >>> 2) % 6, hue: hu };
  }
  var TURNER = { body: '#8491a5', ink: '#2c3442', face: 3, acc: 1 };
  // (x, y) = 두 발 사이 바닥, size = 키(px). o: sx sy(찌그러짐) rot alpha face('x' 걸림 · 'air' 뜀)
  function drawMeeple(g, x, y, size, L, o) {
    o = o || {};
    if (!meeplePath) meeplePath = new Path2D(MEEPLE_D);
    var s = size / 31, a = o.alpha == null ? 1 : o.alpha;
    g.save();
    g.translate(x, y); if (o.rot) g.rotate(o.rot);
    g.scale(s * (o.sx || 1), s * (o.sy || 1)); g.translate(-20, -36.2);
    g.globalAlpha = a; g.fillStyle = L.body; g.fill(meeplePath);
    g.beginPath(); g.arc(20, 11.6, 6.4, 0, TAU); g.fill();
    g.globalAlpha = a * 0.9; g.fillStyle = '#fff'; g.beginPath(); g.arc(20, 11.6, 4.7, 0, TAU); g.fill();
    g.globalAlpha = a; g.fillStyle = L.ink; g.strokeStyle = L.ink; g.lineCap = 'round'; g.lineWidth = 1.1;
    var f = o.face || L.face;
    function dot(cx, cy, r) { g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill(); }
    function ln(p) { g.beginPath(); g.moveTo(p[0], p[1]); for (var i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.stroke(); }
    function arc2(x0, y0, cx, cy, x1, y1) { g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke(); }
    if (f === 'x') { ln([16.7, 10.5, 18.5, 12.3]); ln([18.5, 10.5, 16.7, 12.3]); ln([21.5, 10.5, 23.3, 12.3]); ln([23.3, 10.5, 21.5, 12.3]); g.lineWidth = 1; arc2(18.2, 14.9, 20, 13.6, 21.8, 14.9); }
    else {
      if (f === 'air' || f === 3) { arc2(16.6, 11.8, 17.6, 10.6, 18.6, 11.8); arc2(21.4, 11.8, 22.4, 10.6, 23.4, 11.8); }
      else if (f === 2) { dot(17.6, 11.4, 1.05); ln([21.4, 11.5, 23.6, 11.5]); }
      else { dot(17.6, 11.4, 1.05); dot(22.4, 11.4, 1.05); }
      g.lineWidth = 1;
      if (f === 'air') { g.beginPath(); g.ellipse(20, 14.4, 1.25, 1.05, 0, 0, TAU); g.fill(); }
      else if (f === 1) dot(20, 14.3, 0.9);
      else arc2(18.2, 13.9, 20, 15.4, 21.8, 13.9);
    }
    var acc = L.acc;
    if (acc === 1) { g.beginPath(); g.moveTo(13.6, 7.6); g.lineTo(26.4, 7.6); g.lineTo(24.8, 6.2); g.lineTo(15.2, 6.2); g.closePath(); g.fill(); g.fillRect(15.6, 2.6, 8.8, 4.4); }
    else if (acc === 2) { g.globalAlpha = a * 0.85; g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.lineCap = 'butt'; ln([10.5, 21.5, 29.5, 24.1]); g.globalAlpha = a; }
    else if (acc === 4) { g.fillStyle = '#f6c62a'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(15.2, 6.4); [16.6, 3, 18.6, 5.2, 20, 2.4, 21.4, 5.2, 23.4, 3, 24.8, 6.4].forEach(function (v, i, arr) { if (i % 2 === 0) g.lineTo(v, arr[i + 1]); }); g.closePath(); g.fill(); g.stroke(); }
    else if (acc === 5) { g.lineWidth = 0.9; g.beginPath(); g.arc(17.6, 11.4, 2, 0, TAU); g.stroke(); g.beginPath(); g.arc(22.4, 11.4, 2, 0, TAU); g.stroke(); ln([19.6, 11.4, 20.4, 11.4]); }
    g.restore();
  }
  function rrect(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function fit(g, text, maxW) { if (g.measureText(text).width <= maxW) return text; var s = String(text); while (s.length > 1 && g.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; }

  /* =====================================================================
   * 놀이터 그림 (canvas). 시간 t 는 게임 시계(초)
   * ===================================================================== */
  var COL = {};
  function readColors() { ['ink', 'ink2', 'muted', 'accent', 'ok', 'gold', 'bad', 'surface', 'ground', 'ground-line', 'rope', 'rope2', 'stool', 'turner', 'line'].forEach(function (k) { COL[k] = css('--' + k); }); COL.font = css('--sans'); TURNER.body = COL.turner; }

  function Scene(cv, o) {
    this.cv = cv; this.g = cv.getContext('2d'); this.o = o || {};
    this.actors = []; this.pops = []; this.parts = [];
    this.slots = 3; this.clear = C.clearOf(0.18); this.hud = null; this.hint = ''; this.lastT = 0; this.popT = -9; this.lastCount = 0;
    this.resize();
  }
  Scene.prototype.resize = function () {
    var r = this.cv.getBoundingClientRect(), dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.w = Math.max(60, r.width); this.h = Math.max(60, r.height); this.dpr = dpr;
    var W = Math.round(this.w * dpr), H = Math.round(this.h * dpr);
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
  };
  Scene.prototype.geom = function () {
    var w = this.w, h = this.h, m = Math.max(3, this.slots);
    var U = clamp(Math.min(w / (m * 0.9 + 3.7), h / (this.o.showCount ? 3.95 : 3.1), 84), 16, 84);
    var sw = Math.min(w, U * (m * 1.3 + 5.4)), x0 = (w - sw) / 2;
    var G = Math.min(h - 0.95 * U, Math.max(h * 0.5 + 1.45 * U, h * 0.7));
    var H = 0.78 * U, clearPx = this.clear * H * 0.88 + 0.05 * U;
    var Ut = 1.15 * U, stool = 0.4 * U + 0.8 * clearPx;
    var xl = x0 + 0.25 * U + 0.5 * Ut, xr = x0 + sw - 0.25 * U - 0.5 * Ut;
    var hy = G - stool - 0.46 * Ut;
    return { U: U, G: G, H: H, clearPx: clearPx, Ut: Ut, stool: stool, xl: xl, xr: xr, hxl: xl + 0.38 * Ut, hxr: xr - 0.38 * Ut, hy: hy, Rv: G - clearPx - hy, x0: x0, sw: sw };
  };
  Scene.prototype.add = function (a, enter) {   // a: {key, name, hue, pid}
    a.look = lookOf(a.name, a.hue); a.state = enter ? 'run' : 'in'; a.tj = -9; a.alpha = 1; a.x = null; a.side = enter || 0;
    a.hs = 0.94 + (hash(a.name + '~') % 13) / 100; a.dust = true; a.fallT = 0; a.rot = 0;
    this.actors.push(a); return a;
  };
  Scene.prototype.actor = function (key) { for (var i = 0; i < this.actors.length; i++) if (this.actors[i].key === key && this.actors[i].state !== 'leave') return this.actors[i]; return null; };
  Scene.prototype.pop = function (text, x, y, color, size) { this.pops.push({ text: text, x: x, y: y, t0: this.lastT, color: color, size: size || 1 }); if (this.pops.length > 14) this.pops.shift(); };
  Scene.prototype.burst = function (x, y, n, color, sp, up) {
    if (REDUCE) return;
    for (var i = 0; i < n; i++) { var an = up ? -Math.PI * (0.15 + Math.random() * 0.7) : Math.random() * TAU, v = sp * (0.4 + Math.random() * 0.8); this.parts.push({ x: x, y: y, vx: Math.cos(an) * v, vy: Math.sin(an) * v, t0: this.lastT, life: 0.35 + Math.random() * 0.3, color: color, r: 1.5 + Math.random() * 2.5 }); }
    if (this.parts.length > 160) this.parts.splice(0, this.parts.length - 160);
  };
  Scene.prototype.draw = function (t, ang, omega) {
    var g = this.g, w = this.w, h = this.h, dt = clamp(t - this.lastT, 0, 0.1), self = this;
    this.lastT = t;
    var live = this.actors.filter(function (a) { return a.state !== 'leave'; });
    this.slots += (live.length - this.slots) * (1 - Math.exp(-dt * 6));
    if (Math.abs(live.length - this.slots) < 0.01) this.slots = live.length;
    var q = this.geom(), U = q.U, G = q.G;
    this.q = q;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    /* 바닥 */
    g.fillStyle = COL.ground; g.fillRect(0, G + 0.02 * U, w, h - G);
    g.fillStyle = COL['ground-line']; g.fillRect(0, G + 0.02 * U, w, Math.max(1.5, 0.04 * U));

    /* 횟수 */
    var ropeTop = q.hy - q.Rv - 0.2 * U;
    if (this.o.showCount && this.hud) {
      var hd = this.hud;
      if (hd.count !== this.lastCount) { this.lastCount = hd.count; this.popT = t; }
      var room = Math.max(40, ropeTop - 6), fs = clamp(room * 0.46, 28, 104), k = REDUCE ? 1 : 1 + 0.22 * Math.max(0, 1 - (t - this.popT) / 0.2);
      var cy = Math.max(fs * 0.62 + 4, room * 0.42);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = COL.ink; g.font = '900 ' + Math.round(fs * k) + 'px ' + COL.font;
      g.fillText(String(hd.count), w / 2, cy);
      var sfs = clamp(fs * 0.2, 11, 16);
      g.font = '700 ' + sfs + 'px ' + COL.font; g.fillStyle = COL.ink2;
      if (hd.sub) g.fillText(fit(g, hd.sub, w - 110), w / 2, cy + fs * 0.6 + sfs * 0.2);
      var s2 = this.hint || hd.sub2;
      if (s2) { g.fillStyle = this.hint ? COL.accent : COL.muted; g.font = '600 ' + Math.max(10.5, sfs - 1.5) + 'px ' + COL.font; g.fillText(fit(g, s2, w - 24), w / 2, cy + fs * 0.6 + sfs * 1.55); }
    }

    /* 자리 */
    var n = live.length, xa = q.hxl + 0.55 * U, xb = q.hxr - 0.55 * U, gapx = (xb - xa) / Math.max(1, n);
    live.forEach(function (a, i) {
      a.tx = xa + gapx * (i + 0.5);
      if (a.x == null) a.x = a.side ? (a.side > 0 ? q.x0 + q.sw + U : q.x0 - U) : a.tx;
      a.x += (a.tx - a.x) * (1 - Math.exp(-dt * (a.state === 'run' ? 7 : 10)));
      if (a.state === 'run' && Math.abs(a.tx - a.x) < 0.12 * U) a.state = 'in';
    });
    this.actors = this.actors.filter(function (a) {
      if (a.state !== 'leave') return true;
      a.x += a.side * U * 3.4 * dt; a.alpha -= dt * 1.5;
      return a.alpha > 0.02;
    });

    /* 줄 */
    var sin = Math.sin(ang), cos = Math.cos(ang);
    function rope(a2, alpha, front) {
      var s2 = Math.sin(a2), c2 = Math.cos(a2), sag = q.Rv * c2 + 0.15 * q.Rv * s2;
      var hxL = q.hxl + 0.05 * U * s2, hxR = q.hxr - 0.05 * U * s2, hyy = q.hy + 0.07 * U * c2, L = hxR - hxL;
      g.beginPath(); g.moveTo(hxL, hyy);
      g.bezierCurveTo(hxL + L * 0.1, hyy + sag * 1.3333, hxR - L * 0.1, hyy + sag * 1.3333, hxR, hyy);
      var lw = Math.max(3, U * (front ? 0.085 : 0.062));
      g.globalAlpha = alpha; g.lineCap = 'round'; g.setLineDash([]);
      g.strokeStyle = COL.rope; g.lineWidth = lw; g.stroke();
      if (alpha > 0.5) { g.strokeStyle = COL.rope2; g.lineWidth = lw * 0.42; g.setLineDash([lw * 1.6, lw * 2.2]); g.lineDashOffset = -a2 * U * 0.6; g.globalAlpha = alpha * 0.9; g.stroke(); g.setLineDash([]); }
      g.globalAlpha = 1;
    }
    function ropeAll(front) {
      if (!REDUCE && Math.abs(omega) > 4) { var d = omega > 0 ? 1 : -1; rope(ang - d * 0.2, front ? 0.16 : 0.1, front); rope(ang - d * 0.1, front ? 0.3 : 0.18, front); }
      rope(ang, front ? 1 : 0.5, front);
    }
    var front = sin >= 0;
    if (!front) ropeAll(false);

    /* 돌리는 사람 (상자 위) */
    [[q.xl, 1], [q.xr, -1]].forEach(function (p) {
      var x = p[0], sw2 = q.Ut * 0.84;
      g.fillStyle = COL.stool; rrect(g, x - sw2 / 2, G - q.stool, sw2, q.stool + 0.02 * U, Math.min(6, U * 0.1)); g.fill();
      g.strokeStyle = COL['ground-line']; g.lineWidth = Math.max(1, U * 0.03); g.beginPath(); g.moveTo(x - sw2 / 2 + 3, G - q.stool * 0.5); g.lineTo(x + sw2 / 2 - 3, G - q.stool * 0.5); g.stroke();
      drawMeeple(g, x, G - q.stool + 0.07 * U * (cos - 1) * 0.5 + 0.035 * U, q.Ut, TURNER, { rot: p[1] * 0.07 * sin });
    });

    /* 미플 */
    var H = q.H, fsn = clamp(U * 0.24, 9.5, 14), fallen = [];
    g.textAlign = 'center'; g.textBaseline = 'top';
    this.actors.forEach(function (a) {
      var dtj = t - a.tj, u = dtj / AIR, hgt = a.state === 'fall' ? 0 : C.height(dtj) * H * a.hs;
      var sx = 1, sy = 1, face = null, rot = 0, yoff = 0;
      if (a.state === 'fall') {
        var k = clamp((t - a.fallT) / 0.28, 0, 1), e = 1 - Math.pow(1 - k, 3);
        rot = a.fdir * e * 1.45; face = 'x'; yoff = -Math.sin(k * Math.PI) * 0.18 * U;
      } else if (u > 0 && u < 1) { face = 'air'; if (!REDUCE) { sy = 1 + 0.1 * Math.sin(Math.PI * u); sx = 1 - 0.06 * Math.sin(Math.PI * u); } a.dust = false; }
      else if (u >= 1) {
        if (!a.dust) { a.dust = true; self.burst(a.x, G, 4, COL['ground-line'], U * 1.2, true); }
        if (!REDUCE && dtj - AIR < 0.13) { var z = 1 - (dtj - AIR) / 0.13; sy = 1 - 0.16 * z; sx = 1 + 0.12 * z; }
      }
      if (a.state === 'run' && !REDUCE) yoff -= Math.abs(Math.sin(t * 16)) * 0.1 * U;
      // 그림자
      var sh = 1 - 0.45 * (hgt / (H || 1));
      g.globalAlpha = 0.16 * a.alpha; g.fillStyle = '#000'; g.beginPath(); g.ellipse(a.x, G + 0.04 * U, 0.36 * U * sh, 0.07 * U * sh, 0, 0, TAU); g.fill(); g.globalAlpha = 1;
      a.y = G - hgt + yoff;
      var dr = { a: a, sx: sx, sy: sy, rot: rot, face: face };
      if (a.state === 'fall') fallen.push(dr); else drawMeeple(g, a.x, a.y, U, a.look, { sx: sx, sy: sy, alpha: a.alpha, face: a.state === 'leave' ? 'x' : face });
      // 이름
      if (gapx > 26 || a.pid != null) {
        g.globalAlpha = a.alpha; g.font = (a.pid != null ? '800 ' : '700 ') + fsn + 'px ' + COL.font; g.fillStyle = a.pid != null ? a.look.body : COL.ink2;
        g.fillText(fit(g, a.name, Math.max(22, gapx - 4)), a.x, G + 0.2 * U); g.globalAlpha = 1;
      }
    });
    if (front) ropeAll(true);
    fallen.forEach(function (d) { drawMeeple(g, d.a.x, d.a.y, U, d.a.look, { rot: d.rot, face: 'x', alpha: d.a.alpha }); });

    /* 조각 · 글자 */
    this.parts = this.parts.filter(function (p) {
      var k = (t - p.t0) / p.life; if (k >= 1 || k < 0) return false;
      p.vy += 900 * dt * 0.6; p.x += p.vx * dt; p.y += p.vy * dt;
      g.globalAlpha = 1 - k; g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill(); g.globalAlpha = 1; return true;
    });
    g.textAlign = 'center'; g.textBaseline = 'middle';
    this.pops = this.pops.filter(function (p) {
      var k = (t - p.t0) / 0.75; if (k >= 1 || k < 0) return false;
      var e = 1 - Math.pow(1 - k, 3), fs2 = clamp(U * 0.36 * p.size, 12, 30) * (REDUCE ? 1 : 0.8 + 0.2 * Math.min(1, k * 8));
      g.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      g.font = '900 ' + fs2 + 'px ' + COL.font; g.lineWidth = Math.max(3, fs2 * 0.22); g.strokeStyle = COL.surface; g.lineJoin = 'round';
      var px = clamp(p.x, 34, w - 34), py = p.y - e * 0.25 * U;
      g.strokeText(p.text, px, py); g.fillStyle = p.color; g.fillText(p.text, px, py); g.globalAlpha = 1; return true;
    });
  };

  /* =====================================================================
   * 화면 전환 · 창
   * ===================================================================== */
  function show(id) { ['home', 'play'].forEach(function (s) { $(s).classList.toggle('on', s === id); }); }
  function openSheet(id) { $(id).hidden = false; }
  function closeSheet(id) { $(id).hidden = true; }
  ['multiBg', 'pickBg'].forEach(function (id) { $(id).addEventListener('click', function (e) { if (e.target === this) closeSheet(id); }); });

  var wake = null;
  function setWake(on) {
    try {
      if (on && navigator.wakeLock && !wake) navigator.wakeLock.request('screen').then(function (l) { wake = l; l.addEventListener('release', function () { wake = null; }); }, function () {});
      if (!on && wake) { wake.release(); wake = null; }
    } catch (e) {}
  }

  /* =====================================================================
   * 게임 진행
   * ===================================================================== */
  var RUN = null, DEMO = null;
  function clockAt(ms) { return (ms - RUN.base) / 1000; }
  var bannerT = 0;
  function banner(text, cls, ms) {
    var el = $('banner'); el.textContent = text; el.className = 'banner on' + (cls ? ' ' + cls : '');
    if (RUN && RUN.scene.q) { var q = RUN.scene.q; el.style.top = Math.round(Math.min(RUN.scene.h - 26, q.G + q.U * 1.02)) + 'px'; }   // 바닥 쪽 (횟수 · 줄을 가리지 않게)
    clearTimeout(bannerT); bannerT = setTimeout(function () { el.classList.remove('on'); }, ms || 1100);
  }
  function teamNames() {
    var a = OPT.names.slice(0, 8);
    for (var i = 0; a.length < 3 && i < DEFAULTS.length; i++) if (a.indexOf(DEFAULTS[i]) < 0) a.push(DEFAULTS[i]);
    return a;
  }
  function seatNames(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(clean(OPT.seats[i]) || (i + 1) + 'P');
    return out;
  }

  function buildPads(cfg) {
    var A = $('padsA'), B = $('padsB'); A.innerHTML = ''; B.innerHTML = '';
    var play = $('play');
    play.setAttribute('data-mode', cfg.mode);
    if (cfg.mode === 'solo') { play.removeAttribute('data-multi'); return; }
    play.setAttribute('data-multi', cfg.n);
    var nA = Math.floor(cfg.n / 2);
    for (var i = 0; i < cfg.n; i++) {
      var d = document.createElement('div');
      d.className = 'pad'; d.setAttribute('data-p', i); d.setAttribute('role', 'button'); d.setAttribute('aria-label', cfg.names[i] + ' 점프');
      d.style.setProperty('--h', HUES[i]);
      d.innerHTML = '<div class="in"><span class="nm">' + esc(cfg.names[i]) + '</span><span class="st"></span><span class="key">' + KEYNAME[i] + ' 키</span></div>';
      (i < nA ? A : B).appendChild(d);
    }
  }
  function padOf(pid) { return document.querySelector('.pad[data-p="' + pid + '"]'); }
  function padState(pid, text, cls) { var p = padOf(pid); if (!p) return; var s = p.querySelector('.st'); s.textContent = text; s.className = 'st' + (cls ? ' ' + cls : ''); }

  function startGame(cfg) {
    ['multiBg', 'pickBg', 'resBg'].forEach(closeSheet);
    $('pause').hidden = true; $('cd').hidden = true; $('banner').classList.remove('on');
    show('play'); buildPads(cfg); readColors();
    var g = C.create({ mode: cfg.mode, n: cfg.n, team: cfg.names.length });
    var sc = new Scene($('cv'), { showCount: true });
    var now = performance.now();
    RUN = { cfg: cfg, g: g, scene: sc, base: now, lastNow: now, paused: false, ended: false, cdT: 0, lastAng: 0 };
    if (cfg.mode === 'solo') g.members.forEach(function (m) { sc.add({ key: m, name: cfg.names[m] }); });
    else for (var i = 0; i < cfg.n; i++) sc.add({ key: i, name: cfg.names[i], hue: HUES[i], pid: i });
    sc.slots = sc.actors.length;
    sc.hint = cfg.mode === 'solo' ? (matchMedia('(pointer:fine)').matches ? '화면 클릭 · Space 로 점프' : '화면을 탭하면 점프') : '자기 색 칸을 눌러 점프';
    audio(); setWake(true);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (!history.state || !history.state.jr) try { history.pushState({ jr: 1 }, ''); } catch (e) {}
    handle([{ type: 'seg', seg: g.segs[0] }]);
    hud();
  }
  function hud() {
    if (!RUN) return;
    var g = RUN.g, cfg = RUN.cfg, sub, sub2 = '';
    if (cfg.mode === 'solo') {
      sub = '연속 ' + g.streak + ' · ' + num(g.score) + '점';
      if (g.pool.length) { var left = C.recruitNeed(g.count) - g.pstreak; sub2 = '퍼펙트 ' + left + '번 더 → ' + cfg.names[g.pool[0]] + ' 입장'; }
      else sub2 = '모두 모였어요!';
    } else if (cfg.mode === 'coop') sub = '연속 ' + g.streak + ' · ' + num(g.score) + '점';
    else sub = '남은 사람 ' + g.players.filter(function (p) { return p.alive; }).length + '명';
    RUN.scene.hud = { count: g.count, sub: sub, sub2: sub2 };
  }
  var WHY = { early: '너무 일찍 뛰었어요', late: '늦게 뛰었어요', none: '안 뛰었어요', tie: '같이 걸렸어요' };
  var CUE = { slow: ['다음은 천천히~', 'warn'], fast: ['다음은 빠르게!', 'warn'], hang: ['위에서 멈칫!', 'warn'], double: ['빠르게 두 번!', 'warn'], reverse: ['반대로 돌아요!', 'warn'], norm: ['원래 속도로!', ''] };

  function handle(evs) {
    if (!RUN || !evs.length) return;
    var g = RUN.g, sc = RUN.scene, cfg = RUN.cfg, solo = cfg.mode === 'solo', q = sc.q || sc.geom();
    evs.forEach(function (e) {
      if (e.type === 'jump') {
        if (solo) { sc.actors.forEach(function (a) { if (a.state === 'in' || a.state === 'run') a.tj = e.t; }); SND.jump(0); vib('tap'); }
        else { var a = sc.actor(e.pid); if (a) a.tj = e.t; SND.jump(e.pid + 1); }
        if (sc.hint && g.count > 0) sc.hint = '';
      } else if (e.type === 'pass') {
        SND.whoosh(g.period() < 0.8);
        var topY = q.G - q.U * 1.5;
        if (solo) {
          var r = e.res[0];
          if (r.ok) {
            if (r.grade === 'perfect') { sc.pop('PERFECT', sc.w / 2, q.G - q.U * 1.9, COL.gold, 1.25); SND.perfect(g.streak); sc.actors.forEach(function (a) { if (a.state === 'in') sc.burst(a.x, a.y - q.U * 1.1, 3, COL.gold, q.U * 1.6, true); }); }
            else { sc.pop(r.err > 0 ? 'GOOD · 빨랐어요' : 'GOOD · 늦었어요', sc.w / 2, q.G - q.U * 1.9, COL.ok, 1); SND.good(); }
          }
        } else {
          e.res.forEach(function (r) {
            var a = sc.actor(r.pid); if (!a) return;
            if (r.ok) { sc.pop(r.grade === 'perfect' ? '퍼펙트!' : '굿', a.x, q.G - q.U * (r.pid % 2 ? 1.72 : 2.02), r.grade === 'perfect' ? COL.gold : COL.ok, 0.66); if (r.grade === 'perfect') sc.burst(a.x, a.y - q.U * 1.1, 4, COL.gold, q.U * 1.6, true); }
            padState(r.pid, r.ok ? (r.grade === 'perfect' ? '퍼펙트' : r.err > 0 ? '굿 · 빠름' : '굿 · 늦음') : '', r.grade);
          });
          if (e.ok) { if (e.perfect) SND.perfect(g.streak); else SND.good(); }
        }
        if (e.ok && g.count > 0) {
          if (g.count % 50 === 0) { banner(g.count + '번 돌파!', 'good', 1400); SND.record(); if (FX.confetti) FX.confetti({ y: 0.3, count: 110 }); vib('win'); }
          else if (g.count % 10 === 0) { banner(g.count + '번!', '', 800); SND.level(); }
        }
      } else if (e.type === 'join') {
        var na = sc.add({ key: e.who, name: cfg.names[e.who] }, 1);
        na.tj = -9; SND.join(); banner(cfg.names[e.who] + ' 입장!', 'good', 900);
      } else if (e.type === 'trip') {
        var names = [];
        e.who.forEach(function (k, i) {
          var a = sc.actor(k); if (!a) return;
          a.state = 'fall'; a.fallT = e.tAt || g.t; a.fdir = (i + k) % 2 ? 1 : -1; names.push(a.name);
          sc.burst(a.x, q.G - q.U * 0.6, 9, COL.bad, q.U * 2.4);
          sc.pop(solo ? '앗!' : '걸림!', a.x, q.G - q.U * 1.45, COL.bad, 1.1);
          if (!solo) { padState(k, e.tie ? '다시!' : cfg.mode === 'surv' ? '탈락' : '걸림', 'miss'); if (cfg.mode === 'surv' && !e.tie) { var p = padOf(k); if (p) p.classList.add('out'); } }
        });
        SND.trip(); vib('bomb');
        if (!REDUCE) { var st = $('stage'); st.classList.remove('shake'); void st.offsetWidth; st.classList.add('shake'); }
        var who = names.length > 2 ? names.slice(0, 2).join(' · ') + ' 외 ' + (names.length - 2) + '명' : names.join(' · ');
        banner(e.tie ? '동시에 걸림 — 다시 한 번!' : who + josa(names[names.length - 1] || '', '이', '가') + ' 걸렸어요 · ' + (WHY[e.why] || ''), 'bad', 1500);
      } else if (e.type === 'restart') {
        sc.actors.forEach(function (a) {
          if (a.state !== 'fall') return;
          if (cfg.mode === 'surv' && g.players[a.key].alive) { a.state = 'in'; padState(a.key, '', ''); }
          else { a.state = 'leave'; a.side = a.x < sc.w / 2 ? -1 : 1; }
        });
      } else if (e.type === 'seg') {
        var s = e.seg;
        sc.targetClear = C.clearOf(g.window());
        if (s.cue === 'ready') { SND.tick(); banner(g.count ? '다시 갑니다~' : '준비~', '', 700); }
        else if (s.cue === 'go') { SND.go(); banner(g.count ? '하나, 둘!' : '시작!', '', 800); }
        else if (CUE[s.cue]) { SND.cue(); banner(CUE[s.cue][0], CUE[s.cue][1], 1000); }
        if (s.kind === 'fake2') { SND.fake(); sc.pop('?!', sc.w / 2, q.hy - q.Rv * 0.4, COL.gold, 1.4); }
      } else if (e.type === 'over') finish();
    });
    hud();
  }

  function boardOpen() { return !!document.querySelector('.jarc-bg'); }   // 모임 랭킹 창이 떠 있나
  function input(pid, stamp) {
    if (!RUN || RUN.paused || RUN.ended || boardOpen()) return;
    var nowMs = performance.now(), ms = (stamp && Math.abs(stamp - nowMs) < 250) ? stamp : nowMs;
    var t = Math.max(clockAt(ms), RUN.g.t);
    handle(RUN.g.jump(pid, t));
  }

  /* --- 화면 갱신 (requestAnimationFrame, 시계는 실제 시간) --- */
  function tick(now) {
    requestAnimationFrame(tick);
    if (RUN) {
      var sc = RUN.scene, g = RUN.g;
      if (RUN.paused) { RUN.lastNow = now; return; }
      if (!RUN.ended && boardOpen()) { pauseGame(); return; }   // 순위 알림을 눌러 랭킹 창을 열면 멈춤
      var gap = now - RUN.lastNow; RUN.lastNow = now;
      if (gap > 150) RUN.base += gap - 16;   // 화면이 오래 멈췄으면 그만큼 시계에서 뺌 (못 본 사이에 줄이 지나가지 않게)
      var t = clockAt(now);
      if (!RUN.ended) handle(g.advance(t));
      if (!RUN) return;
      var ang = g.angle(t), om = (ang - RUN.lastAng) / Math.max(0.001, gap / 1000);
      RUN.lastAng = ang;
      if (sc.targetClear != null) sc.clear += (sc.targetClear - sc.clear) * 0.04;
      sc.draw(t, ang, Math.abs(om) > 60 ? 0 : om);
    } else if (DEMO && $('home').classList.contains('on')) demoTick(now);
  }

  function pauseGame() {
    if (!RUN || RUN.paused || RUN.ended) return;
    RUN.paused = true; RUN.pauseAt = performance.now(); clearInterval(RUN.cdT); $('cd').hidden = true;
    $('pause').hidden = false; renderSnd();
  }
  function resumeGame() {
    if (!RUN || !RUN.paused) return;
    $('pause').hidden = true;
    var n = 3, cd = $('cd'); cd.hidden = false; cd.textContent = n; SND.tick();
    clearInterval(RUN.cdT);
    RUN.cdT = setInterval(function () {
      if (!RUN) return;
      n--;
      if (n > 0) { cd.textContent = n; SND.tick(); return; }
      clearInterval(RUN.cdT); cd.hidden = true;
      var now = performance.now();
      RUN.base += now - RUN.pauseAt; RUN.lastNow = now; RUN.paused = false;
    }, 550);
  }
  function quitGame() {   // 결과 없이 처음으로
    if (RUN) clearInterval(RUN.cdT);
    RUN = null; setWake(false); closeSheet('resBg'); show('home'); renderHome(); demoStart();
  }
  function leave() { if (history.state && history.state.jr) history.back(); else quitGame(); }
  // 뒤로가기 = 그만하기. 랭킹 창(arcade.js 가 쌓은 한 칸)을 닫는 뒤로가기는 아직 게임 칸({jr:1})이라 그대로 둠
  window.addEventListener('popstate', function () { if (RUN && !(history.state && history.state.jr)) quitGame(); });
  // 랭킹 창이 떠 있으면 Space · Enter 가 뒤에 있는 버튼(다시 하기 등)을 누르거나 점프하지 않게
  document.addEventListener('keydown', function (e) {
    if (!boardOpen() || (e.target.closest && e.target.closest('.jarc-bg'))) return;
    if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); }
  }, true);
  function openRank(mode) { if (!ARC) return; if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); ARC.openBoard('jumprope', mode); }

  /* --- 입력: 터치는 pointerdown(지연 없음, 칸마다 따로), 키보드 --- */
  $('stage').addEventListener('pointerdown', function (e) {
    if (!RUN || e.target.closest('.hudbtn,.pause')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (RUN.cfg.mode === 'solo') input(0, e.timeStamp);
  });
  function padDown(e) {
    var p = e.target.closest('.pad'); if (!p || !RUN) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    input(+p.getAttribute('data-p'), e.timeStamp);
    p.classList.add('hit'); setTimeout(function () { p.classList.remove('hit'); }, 90);
  }
  $('padsA').addEventListener('pointerdown', padDown);
  $('padsB').addEventListener('pointerdown', padDown);
  $('play').addEventListener('contextmenu', function (e) { e.preventDefault(); });
  $('play').addEventListener('touchmove', function (e) { if (!e.target.closest('.pbox')) e.preventDefault(); }, { passive: false });
  document.addEventListener('keydown', function (e) {
    if (!RUN || boardOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); if (!$('resBg').hidden) return; if (RUN.paused) resumeGame(); else pauseGame(); return; }
    if (RUN.paused || RUN.ended || e.repeat || e.ctrlKey || e.metaKey || e.altKey) { if (e.code === 'Space' && !RUN.ended) e.preventDefault(); return; }
    if (RUN.cfg.mode === 'solo') { if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter' || e.code === 'KeyW') { e.preventDefault(); input(0, e.timeStamp); } return; }
    var k = KEYS.indexOf(e.code);
    if (k >= 0 && k < RUN.cfg.n) { e.preventDefault(); input(k, e.timeStamp); var p = padOf(k); if (p) { p.classList.add('hit'); setTimeout(function () { p.classList.remove('hit'); }, 90); } }
  });
  $('btnPause').onclick = pauseGame;
  $('btnResume').onclick = resumeGame;
  $('btnRestart').onclick = function () { if (RUN) { clearInterval(RUN.cdT); startGame(RUN.cfg); } };
  $('btnQuit').onclick = leave;
  $('btnSnd2').onclick = toggleSound;
  document.addEventListener('visibilitychange', function () { if (document.hidden) pauseGame(); else if (wake === null && RUN && !RUN.ended) setWake(true); });
  window.addEventListener('blur', pauseGame);
  var rsT = 0;
  function onResize() { clearTimeout(rsT); rsT = setTimeout(function () { if (RUN) RUN.scene.resize(); if (DEMO) DEMO.scene.resize(); }, 60); if (RUN) RUN.scene.resize(); }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  if (window.matchMedia) { var mq = matchMedia('(prefers-color-scheme: dark)'), onScheme = function () { readColors(); }; if (mq.addEventListener) mq.addEventListener('change', onScheme); else if (mq.addListener) mq.addListener(onScheme); }

  /* =====================================================================
   * 끝 · 기록 · 결과
   * ===================================================================== */
  var TITLES = [[0, '몸풀기'], [10, '줄넘기 새싹'], [30, '박자 좀 타는 미플'], [50, '줄넘기 고수'], [100, '줄넘기 달인'], [150, '전설의 단체 줄넘기']];
  function titleOf(c) { var t = TITLES[0][1]; TITLES.forEach(function (x) { if (c >= x[0]) t = x[1]; }); return t; }
  var RES = null;
  function finish() {
    var g = RUN.g, cfg = RUN.cfg;
    RUN.ended = true; setWake(false);
    var r = { m: cfg.mode, c: g.count, s: g.score, n: cfg.mode === 'solo' ? cfg.names.length : cfg.n, pf: g.perfects, ms: g.maxStreak, names: cfg.names.slice(), at: Date.now() };
    if (cfg.mode === 'solo') {
      var worst = null; Object.keys(g.tripBy).forEach(function (k) { if (!worst || g.tripBy[k] > g.tripBy[worst]) worst = k; });
      if (worst != null && g.tripBy[worst] >= 2) r.worst = [cfg.names[worst], g.tripBy[worst]];   // 두 번 넘게 걸린 미플이 있을 때만
    } else if (cfg.mode === 'coop') r.trip = Object.keys(g.tripBy).map(function (k) { return cfg.names[k]; });
    else {
      r.w = g.winners.map(function (i) { return cfg.names[i]; });
      r.rank = g.players.slice().sort(function (a, b) { return a.rank - b.rank || b.cleared - a.cleared; }).map(function (p) { return { i: p.id, name: cfg.names[p.id], rank: p.rank, c: p.cleared, pf: p.perfect }; });
      g.winners.forEach(function (i) { var p = padOf(i); if (p) p.classList.add('win'); padState(i, '우승!', 'perfect'); });
    }
    // 최고 기록
    r.isNew = false;
    if (cfg.mode !== 'surv') {
      var old = BEST[cfg.mode];
      r.prev = old ? old.c : 0;
      if (g.count > 0 && (!old || g.count > old.c || (g.count === old.c && g.score > (old.s || 0)))) { BEST[cfg.mode] = { c: g.count, s: g.score, n: r.n, names: r.names, at: r.at }; save(LS.best, BEST); r.isNew = !!old ? g.count > old.c : true; }
    }
    // 모임 랭킹: 넘은 횟수 (로그인 회원이면 서버로, 아니면 기기 기록만). 순위 알림은 arcade.js 가 띄움
    if (ARC && cfg.mode !== 'surv' && g.count > 0) { try { ARC.report('jumprope', cfg.mode, g.count, cfg.mode === 'solo' ? '점수 ' + num(g.score) + ' · 퍼펙트 ' + g.perfects : cfg.n + '명'); } catch (e) {} }
    LOG.unshift({ m: r.m, c: r.c, s: r.s, n: r.n, w: r.w, at: r.at }); LOG = LOG.slice(0, 20); save(LS.log, LOG);
    RES = r;
    setTimeout(function () {
      if (!RUN || !RUN.ended) return;
      renderResult(r); openSheet('resBg');
      if (r.isNew && r.c >= 5) { SND.record(); if (FX.confetti) FX.confetti({ y: 0.35 }); vib('win'); }
      else if (cfg.mode === 'surv') { SND.record(); if (FX.confetti) FX.confetti({ y: 0.35, count: 90 }); }
      else SND.over();
    }, 250);
  }
  function renderResult(r) {
    var h = '<span class="md">' + MODE_NAME[r.m] + (r.m !== 'solo' ? ' · ' + r.n + '명' : '') + '</span>';
    if (r.m === 'surv') {
      h += '<div class="big name">' + esc(r.w.join(' · ')) + '</div><div class="rank">' + (r.w.length > 1 ? '공동 우승!' : '우승!') + ' · 줄 ' + r.c + '번</div>';
      h += '<div class="ranks">' + r.rank.map(function (p) {
        return '<div class="rk' + (p.rank === 1 ? ' first' : '') + '"><span class="n">' + p.rank + '등</span><span class="dot" style="--h:' + HUES[p.i] + '"></span><span class="t">' + esc(p.name) + '</span><span class="v">' + p.c + '번 · 퍼펙트 ' + p.pf + '</span></div>';
      }).join('') + '</div>';
    } else {
      h += '<div class="big">' + r.c + '<i>번</i></div><div class="rank">' + titleOf(r.c) + '</div>';
      if (r.isNew) h += '<div class="new">새 최고 기록!</div>';
      else if (r.prev) h += '<div class="prev">최고 기록 ' + r.prev + '번' + (r.prev > r.c ? ' — ' + (r.prev - r.c + 1) + '번만 더!' : '') + '</div>';
      h += '<div class="stats"><div><small>퍼펙트</small><b>' + r.pf + '</b></div><div><small>최고 연속</small><b>' + r.ms + '</b></div><div><small>점수</small><b>' + num(r.s) + '</b></div></div>';
      if (r.m === 'solo' && r.worst) h += '<div class="note">' + avatar(r.worst[0], 26) + '<span>오늘의 구멍 · ' + esc(r.worst[0]) + ' (' + r.worst[1] + '번 걸림)</span></div>';
      if (r.m === 'coop' && r.trip && r.trip.length) h += '<div class="note"><span>걸린 사람 · ' + esc(r.trip.join(' · ')) + '</span></div>';
      if (r.m === 'coop' && r.c > 0 && ARC && ARC.nick()) h += '<p class="arc">모임 랭킹에는 이 기기에 로그인한 ' + esc(ARC.nick()) + ' 님 이름으로 올라가요</p>';
    }
    $('resBody').innerHTML = h;
    $('resRank').hidden = !ARC || r.m === 'surv';
  }
  function shareText(r) {
    var url = location.origin + location.pathname.replace(/index\.html$/, ''), s;
    if (r.m === 'surv') s = '[잠만보 단체 줄넘기] 서바이벌 ' + r.n + '명 — 우승 ' + r.w.join(' · ') + '! (줄 ' + r.c + '번)\n' + r.rank.map(function (p) { return p.rank + '등 ' + p.name + ' ' + p.c + '번'; }).join(' / ');
    else {
      s = '[잠만보 단체 줄넘기] ' + MODE_NAME[r.m] + (r.m === 'coop' ? ' ' + r.n + '명 (' + r.names.join(' · ') + ')' : '') + ' — ' + r.c + '번 넘었어요! ' + titleOf(r.c) + '\n퍼펙트 ' + r.pf + ' · 최고 연속 ' + r.ms + ' · ' + num(r.s) + '점';
      if (r.worst) s += '\n오늘의 구멍: ' + r.worst[0] + ' (' + r.worst[1] + '번 걸림)';
      if (r.trip && r.trip.length) s += '\n걸린 사람: ' + r.trip.join(' · ');
    }
    return s + '\n' + url;
  }
  function copyText(t) {
    var done = function () { toast('문구를 복사했어요'); };
    var fb = function () { var ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); done(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fb); else fb();
  }
  // 결과 카드 (1080×1080, 밝은 색 고정) — canvas 에 직접 그림
  function resultCard(r) {
    var cv = document.createElement('canvas'), S = 1080; cv.width = S; cv.height = S;
    var g = cv.getContext('2d'), font = css('--sans'), i;
    var bg = g.createLinearGradient(0, 0, S, S); bg.addColorStop(0, '#3b5bdb'); bg.addColorStop(1, '#5f3dc4');
    g.fillStyle = bg; g.fillRect(0, 0, S, S);
    g.fillStyle = '#fff'; rrect(g, 60, 60, S - 120, S - 120, 64); g.fill();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#4e5968'; g.font = '800 40px ' + font; g.fillText('잠만보 단체 줄넘기', S / 2, 150);
    var label = MODE_NAME[r.m] + (r.m !== 'solo' ? ' · ' + r.n + '명' : '');
    g.font = '800 32px ' + font; var lw = g.measureText(label).width + 56;
    g.fillStyle = '#edf1ff'; rrect(g, S / 2 - lw / 2, 196, lw, 60, 30); g.fill(); g.fillStyle = '#3b5bdb'; g.fillText(label, S / 2, 227);
    g.fillStyle = '#191f28';
    if (r.m === 'surv') {
      var wn = r.w.join(' · '), fs = 150; g.font = '900 ' + fs + 'px ' + font;
      while (fs > 60 && g.measureText(wn).width > S - 240) { fs -= 8; g.font = '900 ' + fs + 'px ' + font; }
      g.fillText(wn, S / 2, 400);
      g.fillStyle = '#f59f00'; g.font = '900 60px ' + font; g.fillText((r.w.length > 1 ? '공동 우승!' : '우승!') + '  줄 ' + r.c + '번', S / 2, 530);
      g.fillStyle = '#4e5968'; g.font = '700 36px ' + font;
      g.fillText(fit(g, r.rank.map(function (p) { return p.rank + '등 ' + p.name + ' ' + p.c + '번'; }).join('   '), S - 200), S / 2, 615);
    } else {
      g.font = '900 280px ' + font; var cw = g.measureText(String(r.c)).width;
      g.fillText(String(r.c), S / 2 - 40, 410);
      g.font = '800 84px ' + font; g.fillStyle = '#4e5968'; g.textAlign = 'left'; g.fillText('번', S / 2 - 40 + cw / 2 + 12, 460); g.textAlign = 'center';
      g.fillStyle = '#3b5bdb'; g.font = '900 56px ' + font; g.fillText(titleOf(r.c) + (r.isNew ? '  · 새 최고 기록!' : ''), S / 2, 575);
      g.fillStyle = '#4e5968'; g.font = '700 36px ' + font; g.fillText('퍼펙트 ' + r.pf + '  ·  최고 연속 ' + r.ms + '  ·  ' + num(r.s) + '점', S / 2, 645);
    }
    // 줄 넘는 미플들
    var names = r.names.slice(0, 8), n = names.length, G = 900, U = Math.min(120, 620 / (n + 1.2)), xl = 190, xr = S - 190, hy = G - 150;
    g.fillStyle = '#e3e8f1'; rrect(g, 120, G, S - 240, 14, 7); g.fill();
    g.strokeStyle = '#f76707'; g.lineWidth = 12; g.lineCap = 'round';
    g.beginPath(); g.moveTo(xl + 46, hy); g.bezierCurveTo(xl + 110, G + 36, xr - 110, G + 36, xr - 46, hy); g.stroke();
    [xl, xr].forEach(function (x) { g.fillStyle = '#b7c0cf'; rrect(g, x - 52, G - 50, 104, 52, 10); g.fill(); drawMeeple(g, x, G - 48, 128, { body: '#8491a5', ink: '#2c3442', face: 3, acc: 1 }); });
    for (i = 0; i < n; i++) {
      var x = xl + 120 + (xr - xl - 240) * (n === 1 ? 0.5 : i / (n - 1)), up = 46 + (hash(names[i]) % 30);
      var out = r.m === 'surv' && r.w.indexOf(names[i]) < 0;
      drawMeeple(g, x, G - (out ? 0 : up) - 4, U, lookOf(names[i], r.m === 'solo' ? null : HUES[i]), { face: out ? 'x' : 'air', alpha: out ? 0.45 : 1 });
    }
    var d = new Date(r.at);
    g.fillStyle = '#8b95a1'; g.font = '600 28px ' + font; g.fillText(d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() + '.', S / 2, 968);
    return cv;
  }
  $('resAgain').onclick = function () { if (RUN) startGame(RUN.cfg); };
  $('resHome').onclick = leave;
  $('resRank').onclick = function () { if (RES) openRank(RES.m); };
  $('homeRank').onclick = function () { openRank('solo'); };
  $('resTxt').onclick = function () {
    if (!RES) return;
    var t = shareText(RES);
    if (navigator.share && matchMedia('(pointer:coarse)').matches) navigator.share({ text: t }).catch(function (e) { if (!e || e.name !== 'AbortError') copyText(t); });
    else copyText(t);
  };
  $('resImg').onclick = function () {
    if (!RES) return;
    try {
      resultCard(RES).toBlob(function (blob) {
        if (!blob) { toast('이미지를 만들지 못했어요'); return; }
        var name = '잠만보_단체줄넘기_' + RES.c + '번.png';
        if (FX.shareOrSave) FX.shareOrSave(blob, name, '잠만보 단체 줄넘기').then(function (how) { if (how === 'saved') toast('이미지를 저장했어요'); });
        else { var u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 30000); toast('이미지를 저장했어요'); }
      }, 'image/png');
    } catch (e) { toast('이미지를 만들지 못했어요'); }
  };

  /* =====================================================================
   * 첫 화면: 명단 · 기록 · 미리 보기
   * ===================================================================== */
  function fmtDate(ms) { var d = new Date(ms), p = function (n) { return (n < 10 ? '0' : '') + n; }; return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function renderRoster() {
    $('roster').innerHTML = OPT.names.length ? OPT.names.map(function (n, i) {
      return '<span class="who">' + avatar(n, 26) + '<span>' + esc(n) + '</span><button type="button" data-i="' + i + '" aria-label="' + esc(n) + ' 빼기">✕</button></span>';
    }).join('') : '<p class="empty">명단이 비어 있어요. 이름을 넣으면 그 미플이 줄을 넘어요.</p>';
  }
  function renderHome() {
    renderRoster(); renderSnd();
    var s = BEST.solo, c = BEST.coop;
    $('soloSub').textContent = s ? '미플 단체를 내가 조종 · 최고 ' + s.c + '번' : '미플 단체를 내가 조종';
    $('coopSub').textContent = c ? '한 명이라도 걸리면 끝 · 최고 ' + c.c + '번' : '한 명이라도 걸리면 끝 — 협동 기록 도전';
    $('bests').innerHTML =
      '<div class="best"><small>혼자 하기 최고</small><b>' + (s ? s.c + '<i>번</i>' : '–') + '</b><span>' + (s ? num(s.s) + '점 · ' + fmtDate(s.at) : '아직 기록이 없어요') + '</span></div>' +
      '<div class="best"><small>다 같이 한 줄 최고</small><b>' + (c ? c.c + '<i>번</i>' : '–') + '</b><span>' + (c ? c.n + '명 · ' + esc((c.names || []).join(' · ')) : '2~4명이 함께 도전') + '</span></div>';
    $('recent').innerHTML = LOG.length ? LOG.slice(0, 8).map(function (r) {
      var t = r.m === 'solo' ? r.c + '번 · ' + num(r.s) + '점' : r.m === 'coop' ? r.n + '명 · ' + r.c + '번' : r.n + '명 · 우승 ' + (r.w || []).join(' · ') + ' · ' + r.c + '번';
      return '<div class="rc"><span class="m ' + r.m + '">' + (r.m === 'solo' ? '혼자' : r.m === 'coop' ? '협동' : '서바이벌') + '</span><span class="t">' + esc(t) + '</span><span class="d">' + fmtDate(r.at) + '</span></div>';
    }).join('') : '<p class="empty">아직 기록이 없어요. 첫 줄을 넘어 보세요!</p>';
    $('btnClear').hidden = !LOG.length && !s && !c;
    $('hapChk').checked = FX.hapticOn ? FX.hapticOn() : false;
  }
  $('roster').addEventListener('click', function (e) { var b = e.target.closest('button[data-i]'); if (!b) return; OPT.names.splice(+b.getAttribute('data-i'), 1); saveOpt(); renderRoster(); demoStart(); });
  $('addForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = clean($('addName').value); if (!v) return;
    if (OPT.names.length >= 8) { toast('8명까지 넣을 수 있어요'); return; }
    if (OPT.names.indexOf(v) >= 0) { toast('이미 있는 이름이에요'); return; }
    OPT.names.push(v); $('addName').value = ''; saveOpt(); renderRoster(); demoStart();
  });
  $('btnShuffle').onclick = function () { var a = OPT.names; for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } saveOpt(); renderRoster(); demoStart(); };
  $('btnClear').onclick = function () { if (!window.confirm('이 기기에 저장된 줄넘기 기록(최고 기록 · 최근 기록)을 지울까요?')) return; BEST = {}; LOG = []; save(LS.best, BEST); save(LS.log, LOG); renderHome(); toast('기록을 지웠어요'); };
  $('sndBtn').onclick = toggleSound;
  $('hapChk').onchange = function () { if (FX.setHaptic) FX.setHaptic(this.checked); if (this.checked) vib('tap'); };
  function setNames(names) { OPT.names = names.map(clean).filter(function (n, i, a) { return n && a.indexOf(n) === i; }).slice(0, 8); saveOpt(); renderRoster(); demoStart(); }

  /* --- 잠만보 데이터(이 기기에 저장된 것)에서 회원·최근 모임 참가자 (룰렛·타이머와 같은 방식, 서버 요청 없음) --- */
  var CLUB = { members: [], meet: null };
  function unpackTbl(t) {
    if (t && Array.isArray(t.c) && Array.isArray(t.r)) return t.r.map(function (row) { var o = {}; t.c.forEach(function (k, i) { o[k] = row[i]; }); return o; });
    return Array.isArray(t) && t.length && typeof t[0] === 'object' && t[0] && !Array.isArray(t[0]) ? t : null;
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
      var o = t[0]; if (!o) return;
      var kn = findKey(o, /^(닉네임|name|nick|nickname)$/i), kp = findKey(o, /참가자|participants|people|attendees/i), kd = findKey(o, /^(날짜|date|d)$/i);
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
    picked = OPT.names.filter(function (n) { return CLUB.members.indexOf(n) >= 0; });
    $('pickQ').value = ''; renderPick(); openSheet('pickBg');
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

  /* --- 여럿이 설정 --- */
  var MHINT = { coop: '모두 같은 줄을 넘어요. 한 명이라도 걸리면 끝 — 몇 번까지 가는지 협동 기록에 남아요.', surv: '걸린 사람은 탈락하고 줄은 계속 돌아요. 마지막까지 남는 사람이 우승! (동시에 걸리면 그 사람들끼리 다시)' };
  function renderMulti() {
    Array.prototype.forEach.call($('segMode').children, function (b) { var on = b.getAttribute('data-v') === OPT.mmode; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); b.setAttribute('role', 'radio'); });
    Array.prototype.forEach.call($('segN').children, function (b) { var on = +b.getAttribute('data-v') === OPT.n; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); b.setAttribute('role', 'radio'); });
    $('modeHint').textContent = MHINT[OPT.mmode];
    var h = '';
    for (var i = 0; i < OPT.n; i++) h += '<div class="seat"><span class="dot" style="--h:' + HUES[i] + '">' + (i + 1) + 'P</span><input class="inp" type="text" maxlength="10" data-i="' + i + '" value="' + esc(OPT.seats[i] || '') + '" placeholder="' + (i + 1) + 'P 이름" aria-label="' + (i + 1) + 'P 이름" autocomplete="off">' +
      (OPT.names.length ? '<button type="button" class="sbtn cyc" data-i="' + i + '" aria-label="명단에서 다음 이름">↻</button>' : '') + '</div>';
    $('seats').innerHTML = h;
    $('seatFill').hidden = !OPT.names.length;
  }
  function openMulti(mode) {
    OPT.mmode = mode;
    if (!OPT.seats.some(Boolean)) OPT.seats = OPT.names.slice(0, 4);
    renderMulti(); openSheet('multiBg');
  }
  $('segMode').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; OPT.mmode = b.getAttribute('data-v'); saveOpt(); renderMulti(); });
  $('segN').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; OPT.n = +b.getAttribute('data-v'); saveOpt(); renderMulti(); });
  $('seats').addEventListener('input', function (e) { if (e.target.tagName === 'INPUT') { OPT.seats[+e.target.getAttribute('data-i')] = e.target.value; saveOpt(); } });
  $('seats').addEventListener('click', function (e) {
    var b = e.target.closest('.cyc'); if (!b || !OPT.names.length) return;
    var i = +b.getAttribute('data-i'), used = OPT.seats.slice(0, OPT.n), k = OPT.names.indexOf(clean(OPT.seats[i]));
    for (var s = 1; s <= OPT.names.length; s++) { var nm = OPT.names[(k + s + OPT.names.length) % OPT.names.length]; if (used.indexOf(nm) < 0 || s === OPT.names.length) { OPT.seats[i] = nm; break; } }
    saveOpt(); renderMulti();
  });
  $('seatFill').onclick = function () { for (var i = 0; i < 4; i++) OPT.seats[i] = OPT.names[i] || ''; saveOpt(); renderMulti(); };
  $('seatShuffle').onclick = function () { var a = seatNames(OPT.n).map(function (n, i) { return clean(OPT.seats[i]) ? n : ''; }); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } for (i = 0; i < a.length; i++) OPT.seats[i] = a[i]; saveOpt(); renderMulti(); };
  $('multiGo').onclick = function () {
    var names = seatNames(OPT.n), seen = {};
    names = names.map(function (n) { seen[n] = (seen[n] || 0) + 1; return seen[n] > 1 ? (n + seen[n]).slice(0, 10) : n; });   // 같은 이름은 뒤에 번호
    saveOpt(); startGame({ mode: OPT.mmode, n: OPT.n, names: names });
  };
  $('goSolo').onclick = function () { startGame({ mode: 'solo', n: 1, names: teamNames() }); };
  $('goCoop').onclick = function () { openMulti('coop'); };
  $('goSurv').onclick = function () { openMulti('surv'); };

  /* --- 첫 화면 미리 보기: 봇이 넘는 줄넘기 (소리 없음, '동작 줄이기'면 멈춘 그림) --- */
  function demoStart() {
    var cv = $('demo'); if (!cv) return;
    readColors();
    var names = teamNames().slice(0, 6), g = C.create({ mode: 'solo', team: names.length, start: Math.min(names.length, 4), rest: 0.4, scale: 0.5 });
    var sc = (DEMO && DEMO.scene) || new Scene(cv, { showCount: false });
    sc.actors = []; sc.pops = []; sc.parts = []; sc.lastT = 0;
    g.members.forEach(function (m) { sc.add({ key: m, name: names[m] }); });
    sc.slots = sc.actors.length; sc.resize();
    DEMO = { g: g, scene: sc, names: names, base: performance.now(), lastNow: performance.now(), plan: null, lastAng: 0, still: REDUCE };
    if (REDUCE) { sc.actors.forEach(function (a, i) { a.tj = -AIR * (0.3 + 0.1 * (i % 3)); }); sc.draw(0, -2.2, 0); }
  }
  function demoTick(now) {
    var d = DEMO; if (d.still) return;
    var gap = now - d.lastNow; d.lastNow = now;
    if (gap > 150) d.base += gap - 16;
    var t = (now - d.base) / 1000, g = d.g, sc = d.scene, evs = [];
    var np = g.nextPass();
    if (np && d.planFor !== np.T) { d.planFor = np.T; d.plan = np.T - AIR / 2 + (Math.random() - 0.5) * 0.05; }
    if (d.plan != null && t >= d.plan) { evs = evs.concat(g.jump(0, Math.max(g.t, d.plan))); d.plan = null; }
    evs = evs.concat(g.advance(t));
    evs.forEach(function (e) {
      if (e.type === 'jump') sc.actors.forEach(function (a) { if (a.state !== 'leave') a.tj = e.t; });
      else if (e.type === 'join') sc.add({ key: e.who, name: d.names[e.who] }, 1);
      else if (e.type === 'pass' && e.ok && e.perfect) sc.pop('PERFECT', sc.w / 2, (sc.q ? sc.q.G - sc.q.U * 2.2 : 30), COL.gold, 1);
    });
    if (g.state === 'over' || g.count >= 60) { demoStart(); return; }
    var ang = g.angle(t), om = (ang - d.lastAng) / Math.max(0.001, gap / 1000); d.lastAng = ang;
    sc.draw(t, ang, Math.abs(om) > 60 ? 0 : om);
  }

  /* --- 시작 --- */
  scanClub();
  $('btnMeet').hidden = !CLUB.meet; $('btnPick').hidden = !CLUB.members.length;
  $('homeRank').hidden = !ARC;
  $('ver').textContent = '단체 줄넘기 v' + VER + ' · 기록은 이 기기에만 저장돼요';
  readColors(); renderHome(); demoStart();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (DEMO && DEMO.still) demoStart(); });
  requestAnimationFrame(tick);

  // 자동 시험용 — 주소에 ?test 가 있을 때만 (평소엔 콘솔에서 게임에 손댈 길을 두지 않음)
  if (/[?&]test(=|&|$)/.test(location.search)) window.__JR = { ver: VER, run: function () { return RUN; }, clock: function () { return RUN ? clockAt(performance.now()) : 0; }, input: input, result: function () { return RES; } };
})();
