/* 아르케온 BGM — 외부 음원 없이 WebAudio 합성으로 작곡해 재생 (모두 오리지널, 외부 요청 0, 이 파일 하나)
 *
 *   ARC_BGM.set('town' | 'raid' | 'dungeon' | null)   곡 바꾸기(같은 곡이면 무시, 바뀔 때 자동 교차 페이드 · null = 정지)
 *   ARC_BGM.volume(0~1) · ARC_BGM.mute(true|false) · ARC_BGM.state() · ARC_BGM.init({mute, volume, seed})
 *
 * 연결 메모(통합 때): forest 의 소리 설정 저장 키 = localStorage 'jmb_forest_snd'('1' 켜짐, 없으면 꺼짐) · 'jmb_forest_vol'(0~1)
 *   (index.html 의 AU 객체 — 읽기만 함). 기본이 '꺼짐'이므로 통합 때 `ARC_BGM.init({mute: !AU.on, volume: AU.vol})` 로 맞출 것.
 *   동작 줄이기(prefers-reduced-motion)는 음악과 무관 — 소리 설정만 따름.
 * 자동재생 정책: 첫 사용자 제스처(pointerdown · keydown · touchend) 전에는 AudioContext 를 만들지 않고, set() 만 기억해 두었다가 제스처 때 시작.
 * 탭이 숨겨지면 컨텍스트를 멈추고(document.hidden) 돌아오면 이어서 재생. 음소거 중에는 소리를 만들지 않음(CPU 0).
 *
 * 곡 설계 (음악 인용 없음 · 작품 이름 없음 — 분위기만):
 *  town    D 장조 펜타토닉 · 86 BPM · 플럭 + 벨 + 느린 아르페지오 + 얇은 패드 — 여백이 있어 시간이 천천히 흐르는 느낌.
 *          8마디 구절마다 선율을 새로 짜고, 구절 안에서도 매 마디 확률 변주(같은 마디 반복 금지), 가끔 한 마디는 거의 쉼.
 *  raid    A 단조(+ 반음 위 Bb · 장 5도 E) · 140 BPM · 낮은 드론 + 킥/스네어/하이햇 합성 + 경고 오스티나토 + 사이렌 핑 — 구절 끝에 스네어 롤.
 *  dungeon E 프리지안 · 68 BPM · 낮은 드론 + 5도/반음 패드 + 물방울(에코) + 멀리서 울리는 북 + 속삭임 — 박자감 약하게, 불안한 반음 모티프(E-F-E).
 * 모두 구절/마디를 확률로 짜므로 길게 틀어도 같은 소리가 반복되지 않음(시드 고정 아님, init({seed}) 로 시험용 고정 가능).
 */
(function (root) {
  'use strict';
  var VER = '1.0.0';
  var LOOK = 0.9, TICK_MS = 90, PER_TICK = 8, MAXV = 72, XF = 1.3;   // 룩어헤드(초) · 스케줄러 주기 · 한 틱에 새로 만드는 목소리 수(CPU 순간 부하 분산) · 예약된 목소리 상한(앞으로 울릴 음 포함) · 교차 페이드(초)

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function pick(rng, a) { return a[Math.floor(rng() * a.length)]; }

  /* ---------- 엔진 (오디오 그래프 + 목소리) ---------- */
  function Engine(ctx, rng) {
    var E = this;
    E.ctx = ctx; E.rng = rng; E.active = 0; E.peak = 0; E.made = 0; E.ended = 0;
    E.master = ctx.createGain(); E.master.gain.value = 0.8;
    E.comp = ctx.createDynamicsCompressor();
    E.comp.threshold.value = -16; E.comp.knee.value = 12; E.comp.ratio.value = 4; E.comp.attack.value = 0.01; E.comp.release.value = 0.25;
    E.master.connect(E.comp); E.comp.connect(ctx.destination);
    // 울림: 1.4초 짜리 지수 감쇠 잡음(결정적 — 엔진마다 같은 소리)
    var sr = ctx.sampleRate, n = Math.floor(sr * 1.4), ir = ctx.createBuffer(1, n, sr), d = ir.getChannelData(0), r = mulberry(7);
    for (var i = 0; i < n; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / n, 2.6);
    E.rev = ctx.createConvolver(); E.rev.buffer = ir;
    E.revOut = ctx.createGain(); E.revOut.gain.value = 0.55; E.rev.connect(E.revOut); E.revOut.connect(E.master);
    // 에코(던전 물방울): 0.38초 · 되먹임 0.38 · 높은 소리 줄임
    E.echo = ctx.createDelay(1); E.echo.delayTime.value = 0.38;
    var fb = ctx.createGain(); fb.gain.value = 0.38; var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    E.echo.connect(lp); lp.connect(fb); fb.connect(E.echo); var eo = ctx.createGain(); eo.gain.value = 0.5; lp.connect(eo); eo.connect(E.master);
    // 잡음 버퍼(북 · 하이햇 · 속삭임 공용)
    var nn = Math.floor(sr * 1.5), nb = ctx.createBuffer(1, nn, sr), nd = nb.getChannelData(0), r2 = mulberry(11);
    for (i = 0; i < nn; i++) nd[i] = r2() * 2 - 1;
    E.noise = nb;
    E.q = null;
    VOICES.forEach(function (n) { var f = P[n]; E[n] = function () { if (E.q) E.q.push([f, arguments]); else f.apply(E, arguments); }; });
  }
  var VOICES = ['pluck', 'bell', 'pad', 'bass', 'drone', 'kick', 'nz', 'snare', 'hat', 'stab', 'drip', 'boom', 'whisper', 'riser'];
  var P = Engine.prototype;
  P.defer = function (fn) { var E = this; E.q = []; try { fn(); } finally { var r = E.q; E.q = null; } return r; };
  P.can = function () { return this.active < (this.max || MAXV); };
  // 목소리 끝나면 연결 해제 · 카운트 감소
  P.reg = function (last, nodes) {
    var E = this; E.active++; E.made++; if (E.active > E.peak) E.peak = E.active;
    last.onended = function () { E.active--; E.ended++; for (var i = 0; i < nodes.length; i++) { try { nodes[i].disconnect(); } catch (e) {} } };
  };
  P.osc = function (type, f, t, t1) { var o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(t1); return o; };
  P.gain = function () { return this.ctx.createGain(); };
  P.filt = function (type, f, q) { var x = this.ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; if (q) x.Q.value = q; return x; };
  // 값 곡선: 0 → peak(어택) → 지수 감쇠
  P.env = function (g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); };
  P.out = function (g, S, dry, rev, ech) {   // 곡(S) 마다 따로 있는 버스 · 보내기에 연결
    g.connect(S.bus);
    if (rev) { var a = this.gain(); a.gain.value = rev; g.connect(a); a.connect(S.rv); return a; }
    return null;
  };
  P.outE = function (g, S, ech) { var a = this.gain(); a.gain.value = ech; g.connect(a); a.connect(S.ec); return a; };

  // --- 목소리들 ---
  P.pluck = function (S, t, f, v, dur) {
    if (!this.can()) return; dur = dur || 0.9; var E = this, o1 = E.osc('triangle', f, t, t + dur + 0.05), o2 = E.osc('sine', f * 2, t, t + dur + 0.05), g2 = E.gain(), lp = E.filt('lowpass', f * 6), g = E.gain();
    g2.gain.value = 0.28; lp.frequency.setValueAtTime(f * 6, t); lp.frequency.exponentialRampToValueAtTime(f * 1.4, t + dur);
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); E.env(g, t, 0.006, v, dur);
    var nodes = [o1, o2, g2, lp, g], a = E.out(g, S, 0, 0.3); if (a) nodes.push(a); E.reg(o1, nodes);
  };
  P.bell = function (S, t, f, v, dur, ech) {
    if (!this.can()) return; dur = dur || 1.8; var E = this, o1 = E.osc('sine', f, t, t + dur + 0.05), o2 = E.osc('sine', f * 2.76, t, t + dur + 0.05), g2 = E.gain(), g = E.gain();
    g2.gain.setValueAtTime(0.3, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.35);
    o1.connect(g); o2.connect(g2); g2.connect(g); E.env(g, t, 0.004, v, dur);
    var nodes = [o1, o2, g2, g], a = E.out(g, S, 0, 0.6); if (a) nodes.push(a); if (ech) nodes.push(E.outE(g, S, ech)); E.reg(o1, nodes);
  };
  P.pad = function (S, t, f, v, dur) {
    if (!this.can()) return; var E = this, t1 = t + dur + 1.4, o1 = E.osc('sawtooth', f, t, t1), o2 = E.osc('sawtooth', f * 1.0035, t, t1), lp = E.filt('lowpass', 700), g = E.gain();
    o1.connect(lp); o2.connect(lp); lp.connect(g);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.9); g.gain.setValueAtTime(v, t + dur); g.gain.linearRampToValueAtTime(0.0001, t1 - 0.05);
    var nodes = [o1, o2, lp, g], a = E.out(g, S, 0, 0.5); if (a) nodes.push(a); E.reg(o1, nodes);
  };
  P.bass = function (S, t, f, v, dur) {
    if (!this.can()) return; dur = dur || 1.4; var E = this, o1 = E.osc('sine', f, t, t + dur + 0.05), o2 = E.osc('triangle', f, t, t + dur + 0.05), g2 = E.gain(), g = E.gain();
    g2.gain.value = 0.35; o1.connect(g); o2.connect(g2); g2.connect(g); E.env(g, t, 0.012, v, dur);
    var nodes = [o1, o2, g2, g]; E.out(g, S, 0, 0); E.reg(o1, nodes);
  };
  P.drone = function (S, t, f, v, dur, c0, c1) {   // 길게 깔리는 낮은 소리, 필터가 천천히 열림
    if (!this.can()) return; var E = this, t1 = t + dur + 1.6, o1 = E.osc('sawtooth', f, t, t1), o2 = E.osc('sawtooth', f * 0.997, t, t1), o3 = E.osc('sine', f / 2, t, t1), g3 = E.gain(), lp = E.filt('lowpass', c0 || 200), g = E.gain();
    g3.gain.value = 0.7; o3.connect(g3); g3.connect(lp); o1.connect(lp); o2.connect(lp); lp.connect(g);
    lp.frequency.setValueAtTime(c0 || 200, t); lp.frequency.linearRampToValueAtTime(c1 || c0 || 200, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 1.5); g.gain.setValueAtTime(v, t + dur); g.gain.linearRampToValueAtTime(0.0001, t1 - 0.05);
    var nodes = [o1, o2, o3, g3, lp, g], a = E.out(g, S, 0, 0.3); if (a) nodes.push(a); E.reg(o1, nodes);
  };
  P.kick = function (S, t, v) {
    if (!this.can()) return; var E = this, o = E.osc('sine', 130, t, t + 0.34), g = E.gain();
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12); o.connect(g); E.env(g, t, 0.003, v, 0.3); E.out(g, S, 0, 0); E.reg(o, [o, g]);
  };
  P.nz = function (S, t, dur, v, hp, rev, ftype, q) {   // 잡음 한 번: 스네어 몸통 · 하이햇 · 속삭임
    if (!this.can()) return; var E = this, s = E.ctx.createBufferSource(), f = E.filt(ftype || 'highpass', hp, q), g = E.gain();
    s.buffer = E.noise; s.start(t, E.rng() * 0.6, dur + 0.05); s.connect(f); f.connect(g); E.env(g, t, 0.002, v, dur);
    var nodes = [s, f, g], a = E.out(g, S, 0, rev || 0); if (a) nodes.push(a); E.reg(s, nodes);
  };
  P.snare = function (S, t, v) {
    this.nz(S, t, 0.17, v, 1400, 0.12);
    if (!this.can()) return; var E = this, o = E.osc('triangle', 190, t, t + 0.12), g = E.gain(); o.connect(g); E.env(g, t, 0.002, v * 0.5, 0.09); E.out(g, S, 0, 0); E.reg(o, [o, g]);
  };
  P.hat = function (S, t, v, open) { this.nz(S, t, open ? 0.16 : 0.04, v, 7000, 0); };
  P.stab = function (S, t, f, v, dur) {
    if (!this.can()) return; dur = dur || 0.4; var E = this, o1 = E.osc('sawtooth', f, t, t + dur + 0.05), o2 = E.osc('sawtooth', f * 1.006, t, t + dur + 0.05), lp = E.filt('lowpass', 1500), g = E.gain();
    lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(500, t + dur);
    o1.connect(lp); o2.connect(lp); lp.connect(g); E.env(g, t, 0.008, v, dur);
    var nodes = [o1, o2, lp, g], a = E.out(g, S, 0, 0.12); if (a) nodes.push(a); E.reg(o1, nodes);
  };
  P.drip = function (S, t, f, v) {
    if (!this.can()) return; var E = this, o = E.osc('sine', f, t, t + 0.4), g = E.gain();
    o.frequency.exponentialRampToValueAtTime(f * 0.62, t + 0.09); o.connect(g); E.env(g, t, 0.003, v, 0.26);
    var nodes = [o, g], a = E.out(g, S, 0, 0.5); if (a) nodes.push(a); nodes.push(E.outE(g, S, 0.7)); E.reg(o, nodes);
  };
  P.boom = function (S, t, v) {   // 멀리서 울리는 북
    if (!this.can()) return; var E = this, o = E.osc('sine', 72, t, t + 2.6), g = E.gain(), lp = E.filt('lowpass', 220);
    o.frequency.exponentialRampToValueAtTime(36, t + 0.7); o.connect(lp); lp.connect(g); E.env(g, t, 0.01, v, 2.4);
    var nodes = [o, lp, g], a = E.out(g, S, 0, 1.4); if (a) nodes.push(a); E.reg(o, nodes);
    this.nz(S, t, 0.35, v * 0.4, 180, 1.2, 'lowpass');
  };
  P.whisper = function (S, t, dur, v) {
    if (!this.can()) return; var E = this, s = E.ctx.createBufferSource(), f = E.filt('bandpass', 900, 2.5), g = E.gain();
    s.buffer = E.noise; s.start(t, E.rng() * 0.5, Math.min(dur, 1.4)); s.loop = true; s.stop(t + dur);
    f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1800, t + dur); s.connect(f); f.connect(g);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.5); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    var nodes = [s, f, g], a = E.out(g, S, 0, 0.8); if (a) nodes.push(a); E.reg(s, nodes);
  };
  P.riser = function (S, t, dur, v) {   // 침공이 시작될 때 올라가는 소리
    if (!this.can()) return; var E = this, s = E.ctx.createBufferSource(), f = E.filt('bandpass', 300, 1.2), g = E.gain();
    s.buffer = E.noise; s.loop = true; s.start(t); s.stop(t + dur);
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(4200, t + dur); s.connect(f); f.connect(g);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.9); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    E.out(g, S, 0, 0.2); E.reg(s, [s, f, g]);
  };

  /* ---------- 곡 (한 마디씩 짜서 예약) ---------- */
  // 곡 객체: nextT(다음 마디 시작) · bar(마디 길이) · genBar() — 한 마디의 모든 소리를 예약하고 nextT 를 옮김. sigs = 시험용 마디 지문
  function humanize(E, t, ms) { return t + (E.rng() - 0.5) * (ms || 14) / 1000; }
  function vary(E, pat, p, lo, hi) {   // 선율 패턴을 확률로 바꿈(옆으로 한 칸 · 쉼 · 새 음)
    var out = []; for (var i = 0; i < pat.length; i++) {
      var x = pat[i], r = E.rng();
      if (x != null && r < p * 0.5) x = clamp(x + (E.rng() < 0.5 ? -1 : 1), lo, hi);
      else if (x != null && r < p * 0.75) x = null;
      else if (x == null && r < p * 0.3 && i % 2 === 0) x = clamp(((pat[i - 1] != null ? pat[i - 1] : 4) + pick(E.rng, [-1, 1, 2])), lo, hi);
      out.push(x);
    }
    return out;
  }

  function townSong(E, S) {
    var bpm = 86, beat = 60 / bpm, bar = beat * 4, e = beat / 2, rng = E.rng;
    var PENT = [0, 2, 4, 7, 9];
    function stepMidi(i) { var o = Math.floor(i / 5), k = ((i % 5) + 5) % 5; return 62 + PENT[k] + 12 * o; }   // 0 = D4
    var CH = { I: { r: 0, t: [0, 4, 7, 11] }, IV: { r: 5, t: [0, 4, 7, 11] }, vi: { r: 9, t: [0, 3, 7, 10] }, V: { r: 7, t: [0, 4, 7, 9] }, ii: { r: 2, t: [0, 3, 7, 10] } };
    var PROGS = [['I', 'vi', 'IV', 'V'], ['I', 'IV', 'I', 'V'], ['I', 'vi', 'ii', 'V'], ['IV', 'I', 'V', 'vi'], ['I', 'V', 'vi', 'IV']];
    var ARPS = [[0, 1, 2, 3, 2, 1, 2, 1], [0, 2, 1, 3, 2, 1, 0, 1], [0, 1, 2, 1, 3, 2, 1, 2]];
    var motif = null, prev = null, prog1 = null, prog2 = null, shift = 0;
    function newMotif() {
      var pat = [], pos = 2 + Math.floor(rng() * 4);
      for (var s = 0; s < 8; s++) { if (rng() < (s % 4 === 0 ? 0.7 : 0.36)) { pos = clamp(pos + pick(rng, [-2, -1, -1, 0, 1, 1, 2]), 0, 9); pat.push(pos); } else pat.push(null); }
      if (pat.every(function (x) { return x == null; })) pat[0] = pos; return pat;
    }
    function genBar() {
      var bi = S.barIdx % 8, t0 = S.nextT;
      if (bi === 0) { prog1 = pick(rng, PROGS); prog2 = rng() < 0.5 ? prog1 : pick(rng, PROGS); motif = motif && rng() < 0.5 ? vary(E, motif, 0.55, 0, 9) : newMotif(); prev = motif; }
      var prog = bi < 4 ? prog1 : prog2, ch = CH[prog[bi % 4]], rest = (bi === 7 && rng() < 0.35);
      var pat;
      if (bi === 0) pat = motif;
      else if (bi === 1) pat = vary(E, motif, 0.35, 0, 9);
      else if (bi === 2) { var sh = rng() < 0.5 ? -1 : 1; pat = motif.map(function (x) { return x == null ? null : clamp(x + sh, 0, 9); }); }
      else if (bi === 3 || bi === 7) { pat = [null, null, null, null, null, null, null, null]; var tone = 50 + 12 + ch.r + ch.t[pick(rng, [0, 1, 2])]; var best = 0, bd = 99; for (var k = 0; k < 10; k++) { var d = Math.abs(stepMidi(k) - tone); if (d < bd) { bd = d; best = k; } } pat[0] = clamp(best + pick(rng, [0, 0, 1]), 0, 9); if (rng() < 0.6) pat[4] = clamp(pat[0] + pick(rng, [-2, -1, 1]), 0, 9); }
      else pat = vary(E, prev, 0.4, 0, 9);
      if (rest) pat = [null, null, null, null, null, null, null, null];
      prev = pat.some(function (x) { return x != null; }) ? pat : prev;
      var sig = [];
      // 선율 (플럭 · 가끔 벨)
      var last = -1; for (var s = 0; s < 8; s++) if (pat[s] != null) {
        var nx = s + 1; while (nx < 8 && pat[nx] == null) nx++; var dur = Math.min((nx - s) * e * 1.05, 1.6), t = humanize(E, t0 + s * e, 12), m = stepMidi(pat[s]), f = mtof(m);
        if (rng() < 0.32) E.bell(S, t, f * 2, 0.12, 2.0, 0.15); else E.pluck(S, t, f, 0.22, Math.max(0.7, dur * 1.3));
        sig.push(s + ':' + pat[s]); last = s;
      }
      // 아르페지오
      var ap = pick(rng, ARPS), tn = ch.t, mask = '';
      for (s = 0; s < 8; s++) {
        var on = rng() < (s === 0 ? 0.95 : rest ? 0.45 : 0.7); mask += on ? 1 : 0;
        if (!on) continue; var idx = ap[s] % 4, m2 = 50 + ch.r + tn[idx] + (idx >= 2 ? 12 : 0);
        E.pluck(S, humanize(E, t0 + s * e, 10), mtof(m2), 0.1 + rng() * 0.03, 0.8);
      }
      sig.push('a' + mask);
      // 패드 · 베이스 · 가끔 벨
      E.pad(S, t0, mtof(50 + ch.r + tn[1]), 0.05, bar * 0.92); E.pad(S, t0, mtof(50 + ch.r + tn[2]), 0.05, bar * 0.92);
      E.bass(S, t0 + 0.01, mtof(38 + ch.r), 0.2, 1.7);
      if (rng() < 0.5) E.bass(S, t0 + beat * 2, mtof(38 + ch.r + 7), 0.13, 1.2);
      if (bi === 0 && rng() < 0.7) E.bell(S, t0 + beat * 0.5, mtof(74 + ch.r + tn[1]), 0.09, 2.6, 0.2);
      S.sigs && S.sigs.push(sig.join(','));
      S.barIdx++; S.nextT += bar;
    }
    return { name: 'town', bar: bar, genBar: genBar };
  }

  function raidSong(E, S) {
    var bpm = 140, beat = 60 / bpm, bar = beat * 4, q = beat / 4, rng = E.rng;
    var CH = { i: { r: 0, t: [0, 3, 7] }, VI: { r: 8, t: [0, 4, 7] }, VII: { r: 10, t: [0, 4, 7] }, V: { r: 7, t: [0, 4, 7] }, iv: { r: 5, t: [0, 3, 7] }, bII: { r: 1, t: [0, 4, 7] } };
    var PROGS = [['i', 'VI', 'VII', 'V'], ['i', 'iv', 'VII', 'V'], ['i', 'bII', 'i', 'V'], ['i', 'VI', 'iv', 'V']];
    var OST = [0, 2, 3, 6, 8, 10, 11, 14], INT = [0, 0, 12, 0, 3, 0, 7, 12];   // 오스티나토 위치(16분) · 근음 위 음정
    var prog = null, kicks = null;
    function genBar() {
      var bi = S.barIdx % 8, t0 = S.nextT, sig = [];
      if (bi === 0) { prog = pick(rng, PROGS); }
      var ch = CH[prog[bi % 4]], root = 45 + ch.r;
      if (S.barIdx === 0) E.riser(S, t0, bar * 0.95, 0.12);
      // 드론: 2마디마다, 구절이 끝으로 갈수록 필터가 열려 긴장이 오름
      if (bi % 2 === 0) E.drone(S, t0, mtof(root - 12), 0.065, bar * 2, 260 + bi * 40, 480 + bi * 90);
      // 킥 · 스네어 · 하이햇 (16분 16칸)
      var kk = '', roll = bi === 7;
      for (var s = 0; s < 16; s++) {
        var t = humanize(E, t0 + s * q, 6), k = (s === 0 || s === 8 || ((s === 6 || s === 14 || s === 10) && rng() < 0.4));
        if (k) E.kick(S, t, s === 0 ? 0.42 : 0.32);
        kk += k ? 'K' : '.';
        if (s === 4 || s === 12) E.snare(S, t, 0.26);
        else if (roll && s >= 12) E.snare(S, t, 0.12 + (s - 12) * 0.04);
        else if (s === 15 && rng() < 0.2) E.snare(S, t, 0.09);
        if (s % 2 === 0) E.hat(S, t, s % 4 === 0 ? 0.14 : 0.09, s === 14 && rng() < 0.4);
        else if ((bi === 3 || bi === 7 || rng() < 0.12) && rng() < 0.5) E.hat(S, t, 0.04, false);
      }
      sig.push(kk);
      // 경고 오스티나토 (톱니 + 필터), 마디마다 조금씩 빠지고 더해짐
      var ms = '';
      for (var j = 0; j < OST.length; j++) {
        var on = rng() > 0.12; ms += on ? 1 : 0; if (!on) continue;
        var m = root + 12 + INT[j] + (bi >= 4 && j === 7 && rng() < 0.5 ? 12 : 0);
        E.stab(S, humanize(E, t0 + OST[j] * q, 6), mtof(m), 0.13, 0.22);
      }
      sig.push('o' + ms);
      // 코드 스탭: 두 마디에 한 번 첫 박
      if (bi % 2 === 0) for (j = 0; j < ch.t.length; j++) E.stab(S, t0, mtof(root + 12 + ch.t[j]), 0.085, 0.5);
      // 사이렌 핑(증4도): 4마디 뒤쪽에 박자마다
      if (bi % 4 >= 2) for (j = 0; j < 4; j++) if (rng() < 0.7) E.bell(S, t0 + beat * j, mtof(81 + (j % 2 ? 6 : 0)), 0.07, 0.5, 0);
      S.sigs && S.sigs.push(sig.join(','));
      S.barIdx++; S.nextT += bar;
    }
    return { name: 'raid', bar: bar, genBar: genBar };
  }

  function dungeonSong(E, S) {
    var bpm = 68, beat = 60 / bpm, bar = beat * 4, rng = E.rng;
    var SC = [0, 1, 3, 5, 7, 8, 10];   // E 프리지안
    var MOTIFS = [[0, 1, 0, 7], [0, 1, 3, 1], [7, 8, 7, 3], [0, 1, 0, -2]];
    var PADS = [[0, 7, 15], [1, 5, 8], [0, 5, 8], [-2, 1, 5]];   // 상대 반음 (E3 기준): Em · F · … 불안하게 흔들림
    function genBar() {
      var bi = S.barIdx % 8, t0 = S.nextT, sig = [];
      // 드론: 4마디마다, 근음 + 5도, 필터가 천천히 오르내림
      if (bi % 4 === 0) { E.drone(S, t0, mtof(28), 0.085, bar * 4, 260, 520); E.drone(S, t0 + 0.4, mtof(40), 0.05, bar * 4 - 0.4, 300, 460); sig.push('d'); }
      // 패드: 2마디마다 (불안한 코드)
      if (bi % 2 === 0) { var pc = pick(rng, PADS); sig.push('p' + pc.join('/')); for (var i = 0; i < pc.length; i++) E.pad(S, t0 + i * 0.3, mtof(52 + pc[i]), 0.055, bar * 2 - 0.6); }
      // 반음 모티프: 가끔, 느리게 (낮은 벨)
      if (rng() < 0.5) {
        var mo = pick(rng, MOTIFS), st = rng() * beat * 1.5; sig.push('m' + mo.join('/'));
        for (i = 0; i < mo.length; i++) E.bell(S, t0 + st + i * beat * (0.9 + rng() * 0.3), mtof(64 + mo[i] - (rng() < 0.3 ? 12 : 0)), 0.1, 2.8, 0.45);
      }
      // 물방울: 무작위 시각 2~5개
      var nd = 2 + Math.floor(rng() * 4); sig.push('w' + nd);
      for (i = 0; i < nd; i++) E.drip(S, t0 + rng() * bar, mtof(76 + pick(rng, SC)), 0.07 + rng() * 0.06);
      // 멀리서 울리는 북 · 속삭임 · 낮은 쇠 울림
      if (S.barIdx >= 2 && rng() < 0.28) { E.boom(S, t0 + Math.floor(rng() * 4) * beat, 0.34); sig.push('B'); }
      if (rng() < 0.2) { E.whisper(S, t0 + rng() * beat * 2, 2.6 + rng() * 2, 0.07); sig.push('h'); }
      if (rng() < 0.22) { E.bell(S, t0 + rng() * beat * 3, mtof(52 + pick(rng, [0, 1, 7])), 0.1, 3.6, 0.3); sig.push('x'); }
      S.sigs && S.sigs.push(sig.join(','));
      S.barIdx++; S.nextT += bar;
    }
    return { name: 'dungeon', bar: bar, genBar: genBar };
  }
  var SONGS = { town: townSong, raid: raidSong, dungeon: dungeonSong };

  // 곡 인스턴스: 곡마다 버스(페이드) · 울림/에코 보내기 게인을 따로 가짐 → 페이드 아웃하면 꼬리까지 같이 줄어듦
  function makeSong(E, name, t0, keepSigs) {
    var S = { name: name, barIdx: 0, nextT: t0, sigs: keepSigs ? [] : null, dead: false };
    S.bus = E.gain(); S.rv = E.gain(); S.ec = E.gain(); S.bus.connect(E.master); S.rv.connect(E.rev); S.ec.connect(E.echo);
    var impl = SONGS[name](E, S); S.bar = impl.bar; S.genBar = impl.genBar;
    return S;
  }
  function fade(S, from, to, t, dur) {
    [S.bus.gain, S.rv.gain, S.ec.gain].forEach(function (p) { p.cancelScheduledValues(t); p.setValueAtTime(from, t); p.linearRampToValueAtTime(to, t + dur); });
  }

  /* ---------- 재생 관리 (실시간) ---------- */
  var st = { ctx: null, E: null, timer: 0, wanted: null, cur: null, fading: [], vol: 0.7, muted: false, paused: false, gestureHooked: false, gesture: false, pend: [], maxPend: 0, seed: 0, startedAt: 0, ticks: 0, tickMax: 0, minLead: 1e9, late: 0 };
  var AC = root.AudioContext || root.webkitAudioContext;

  function applyVol() { if (st.E) st.E.master.gain.setTargetAtTime(st.muted ? 0 : 0.85 * st.vol * st.vol, st.ctx.currentTime, 0.05); }
  function tick() {
    var ctx = st.ctx; if (!ctx || ctx.state !== 'running') return;
    var t0 = (root.performance || Date).now(), now = ctx.currentTime, i, E = st.E;
    function gen(S) { var items = E.defer(function () { S.genBar(); }); for (var k = 0; k < items.length; k++) st.pend.push(items[k]); }
    if (st.cur) while (st.cur.nextT < now + LOOK) { var lead = st.cur.nextT - now; if (lead < st.minLead) st.minLead = lead; if (lead < -0.02) st.late++; gen(st.cur); }
    for (i = st.fading.length - 1; i >= 0; i--) {
      var f = st.fading[i];
      if (!f.dead && f.nextT < f.stopAt && f.nextT < now + LOOK) gen(f);   // 페이드 도중에는 계속 이어서 짬(끊기지 않게)
      if (now > f.stopAt + 0.05) { f.dead = true; try { f.bus.disconnect(); f.rv.disconnect(); f.ec.disconnect(); } catch (e) {} st.fading.splice(i, 1); }
    }
    if (st.pend.length > st.maxPend) st.maxPend = st.pend.length;
    var made = 0; while (st.pend.length && made < PER_TICK) { var it = st.pend.shift(); if (it[1][0].dead) continue; it[0].apply(E, it[1]); made++; }
    st.ticks++; var dt = (root.performance || Date).now() - t0; if (dt > st.tickMax) st.tickMax = dt;
  }
  function startTimer() { if (!st.timer) st.timer = setInterval(tick, TICK_MS); }
  function stopTimer() { if (st.timer) { clearInterval(st.timer); st.timer = 0; } }
  function ensureCtx() {
    if (st.ctx) return true; if (!AC || st.muted) return false;
    if (!st.gesture && !(root.navigator && root.navigator.userActivation && root.navigator.userActivation.hasBeenActive)) return false;   // 자동재생 정책: 첫 제스처 전에는 만들지 않음
    try { st.ctx = new AC(); } catch (e) { st.ctx = null; return false; }
    var rng = mulberry(st.seed || ((Math.random() * 4294967296) >>> 0) ^ Date.now());
    st.E = new Engine(st.ctx, rng); applyVol();
    st.ctx.onstatechange = function () { if (st.ctx && st.ctx.state === 'running') { startTimer(); } };
    return true;
  }
  function play() {   // wanted → 실제 재생 (제스처 · 음소거 · 숨김 상태를 확인)
    if (st.muted || st.paused) return;
    if (!ensureCtx()) return;
    var ctx = st.ctx;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    if (st.cur && st.cur.name === st.wanted) { startTimer(); return; }
    var now = ctx.currentTime, old = st.cur;
    if (old) { old.stopAt = now + XF; fade(old, 1, 0, now, XF); st.fading.push(old); st.cur = null; }
    if (st.wanted) { st.cur = makeSong(st.E, st.wanted, now + 0.4); fade(st.cur, 0, 1, now, old ? XF : 0.6); }
    startTimer();
  }
  function hookGesture() {
    if (st.gestureHooked || typeof document === 'undefined') return; st.gestureHooked = true;
    var evs = ['pointerdown', 'keydown', 'touchend'];
    function go() { st.gesture = true; if (st.ctx && st.ctx.state === 'running') { evs.forEach(function (e) { document.removeEventListener(e, go, true); }); st.gestureHooked = false; return; } play(); if (st.ctx && st.ctx.state === 'running') { evs.forEach(function (e) { document.removeEventListener(e, go, true); }); st.gestureHooked = false; } }
    evs.forEach(function (e) { document.addEventListener(e, go, true); });
  }
  function onVis() {
    if (!st.ctx) return;
    if (document.hidden) { st.paused = true; stopTimer(); try { st.ctx.suspend(); } catch (e) {} }
    else { st.paused = false; if (!st.muted && st.wanted) { try { st.ctx.resume(); } catch (e) {} startTimer(); } }
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);

  var API = {
    ver: VER,
    init: function (o) { o = o || {}; if (o.volume != null) st.vol = clamp(+o.volume || 0, 0, 1); if (o.mute != null) st.muted = !!o.mute; if (o.seed) st.seed = o.seed >>> 0; applyVol(); return API; },
    set: function (name) {
      if (name && !SONGS[name]) return; if (name === st.wanted) return; st.wanted = name || null;
      if (!st.wanted) { if (st.cur && st.ctx) { var now = st.ctx.currentTime; st.cur.stopAt = now + XF; fade(st.cur, 1, 0, now, XF); st.fading.push(st.cur); st.cur = null; } return; }
      hookGesture(); play();
    },
    volume: function (v) { if (v == null) return st.vol; st.vol = clamp(+v || 0, 0, 1); applyVol(); return st.vol; },
    mute: function (b) {
      if (b == null) return st.muted; b = !!b; if (b === st.muted) return b; st.muted = b;
      if (b) { stopTimer(); if (st.ctx) { applyVol(); try { st.ctx.suspend(); } catch (e) {} } }
      else { hookGesture(); if (st.wanted) { applyVol(); play(); } }
      return st.muted;
    },
    state: function () { return { ver: VER, song: st.cur ? st.cur.name : null, wanted: st.wanted, muted: st.muted, volume: st.vol, paused: st.paused, ctx: st.ctx ? st.ctx.state : 'none', active: st.E ? st.E.active : 0 }; },
    // --- 시험용 ---
    _stats: function () { var E = st.E; return { ticks: st.ticks, tickMaxMs: Math.round(st.tickMax * 10) / 10, minLead: Math.round(st.minLead * 1000) / 1000, maxPend: st.maxPend, pend: st.pend.length, late: st.late, active: E ? E.active : 0, peak: E ? E.peak : 0, made: E ? E.made : 0, ended: E ? E.ended : 0, fading: st.fading.length }; },
    // OfflineAudioContext 로 한 곡을 seconds 초 렌더 → {buffer, sigs, bar}
    _render: function (name, seconds, o) {
      o = o || {}; var OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext, sr = o.sampleRate || 44100;
      var ctx = new OAC(2, Math.floor(sr * seconds), sr), E = new Engine(ctx, mulberry(o.seed || 12345)); E.max = 1e9; E.master.gain.value = 0.85 * (o.volume == null ? 0.7 : o.volume) * (o.volume == null ? 0.7 : o.volume);
      var S = makeSong(E, name, 0.05, true); fade(S, 0, 1, 0, 0.6);
      while (S.nextT < seconds) S.genBar();
      return ctx.startRendering().then(function (buffer) { return { buffer: buffer, sigs: S.sigs, bar: S.bar, peakVoices: E.peak }; });
    }
  };
  root.ARC_BGM = API;
})(typeof window !== 'undefined' ? window : this);
