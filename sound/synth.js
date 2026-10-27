/* 잠만보 사운드보드 — 소리 엔진 v1.0.0
 * 모든 소리를 Web Audio 로 실시간 합성 (녹음 파일·외부 음원·샘플 없음 → 저작권 걱정 없음)
 * 멜로디·화음 진행은 이 파일에서 새로 지은 것 (흔한 화음 진행·음계만 씀, 알려진 곡 인용 없음)
 *
 *   JMB_SND.init()                 첫 터치 때 (브라우저가 소리를 허락하는 때)
 *   JMB_SND.sfx(id) → {dur}        효과음 한 번 · loop 효과음은 toggle(id)
 *   JMB_SND.bgm.play(id) / stop(fadeSec) / level(1~3)   배경음악 (바꾸면 겹쳐서 넘어감)
 *   JMB_SND.stopAll()              전부 즉시 멈춤
 *   JMB_SND.vol(kind, 0~1)         'master' · 'bgm' · 'sfx'
 */
(function (W) {
  'use strict';
  var ctx = null, master, bgmOut, duck, bgmConv, sfxIn, sfxOut, sfxWet, sfxConv, analyser, NB = null;
  var S = { duckOn: true };
  var mf = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };

  /* ---------- 준비 ---------- */
  S.init = function () {
    if (ctx) { if (ctx.state !== 'running') ctx.resume(); return ctx; }
    var AC = W.AudioContext || W.webkitAudioContext;
    if (!AC) return null;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}   // 아이폰 무음 스위치를 켜 둬도 들리게 (iOS 17+)
    ctx = new AC({ latencyHint: 'interactive' });
    var comp = ctx.createDynamicsCompressor();   // 여러 소리가 겹쳐도 찢어지지 않게
    comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.25;
    master = G(0.9); master.connect(comp);
    analyser = ctx.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.78;
    comp.connect(analyser); analyser.connect(ctx.destination);
    var n = ctx.sampleRate * 2; NB = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = NB.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    bgmOut = G(0.8); duck = G(1); bgmOut.connect(duck); duck.connect(master);
    bgmConv = ctx.createConvolver(); bgmConv.buffer = impulse(3.2, 2.4); bgmConv.connect(bgmOut);
    sfxOut = G(1); sfxOut.connect(master);
    sfxConv = ctx.createConvolver(); sfxConv.buffer = impulse(2.4, 2.8); sfxConv.connect(sfxOut);
    newSfxIn();
    setInterval(pump, 40);
    return ctx;
  };
  S.ctx = function () { return ctx; };
  S.analyser = function () { return analyser; };
  function G(v) { var g = ctx.createGain(); g.gain.value = v == null ? 1 : v; return g; }
  // 잔향(리버브)용 충격 응답 — 잡음을 지수로 줄인 것 (직접 만듦)
  function impulse(sec, decay) {
    var len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) { var x = b.getChannelData(c); for (var i = 0; i < len; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  // 효과음 입구를 새로 (모두 멈춤 = 예전 입구를 끊음 → 울리던 소리가 바로 사라짐)
  function newSfxIn() {
    if (sfxIn) { try { sfxIn.disconnect(); sfxWet.disconnect(); } catch (e) {} }
    sfxIn = G(1); sfxIn.connect(sfxOut);
    var send = G(0.18); sfxIn.connect(send); send.connect(sfxConv);
    sfxWet = G(1); sfxWet.connect(sfxConv);
  }
  S.vol = function (kind, v) {
    if (!ctx) return;
    var p = kind === 'bgm' ? bgmOut.gain : kind === 'sfx' ? sfxOut.gain : master.gain, t = ctx.currentTime;
    p.cancelScheduledValues(t); p.setTargetAtTime(v * (kind === 'bgm' ? 0.8 : kind === 'master' ? 0.9 : 1), t, 0.03);
  };

  /* ---------- 기본 소리 재료 ---------- */
  // o = { d: 마른 소리 갈 곳, w: 잔향 갈 곳 }
  function to(node, o, wet) { node.connect(o.d); if (wet && o.w) { var s = G(wet); node.connect(s); s.connect(o.w); } }
  function env(p, t, a, peak, d) { p.setValueAtTime(0.0001, t); p.linearRampToValueAtTime(peak, t + a); p.exponentialRampToValueAtTime(0.0001, t + a + Math.max(0.01, d)); }
  function filt(type, f, q) { var x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q == null ? 0.7 : q; return x; }
  /* 발진기 하나: opt = { v 크기, a 올라가는 시간, hold(일정하게 유지), r, f2 끝 음높이, glide, det, lp/lp2 저역 통과, q, vib [속도, 깊이], wet } */
  function osc(type, f, t, dur, o, opt) {
    opt = opt || {};
    var x = ctx.createOscillator(); x.type = type; x.frequency.setValueAtTime(f, t);
    if (opt.f2) x.frequency.exponentialRampToValueAtTime(opt.f2, t + (opt.glide || dur));
    if (opt.det) x.detune.value = opt.det;
    if (opt.vib) { var l = ctx.createOscillator(), lg = G(opt.vib[1]); l.frequency.value = opt.vib[0]; l.connect(lg); lg.connect(x.frequency); l.start(t); l.stop(t + dur + 0.1); }
    var g = G(0), a = opt.a || 0.005, v = opt.v || 0.2;
    if (opt.hold) { var r = opt.r || 0.06; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.setValueAtTime(v, t + Math.max(a, dur - r)); g.gain.linearRampToValueAtTime(0, t + dur); }
    else env(g.gain, t, a, v, dur - a);
    var n = x;
    if (opt.lp) { var fl = filt('lowpass', opt.lp, opt.q); fl.frequency.setValueAtTime(opt.lp, t); if (opt.lp2) fl.frequency.exponentialRampToValueAtTime(opt.lp2, t + (opt.lpt || dur)); x.connect(fl); n = fl; }
    n.connect(g); to(g, o, opt.wet);
    x.start(t); x.stop(t + dur + 0.05);
    return x;
  }
  /* 잡음: opt = { type 필터 종류, f, f2, q, v, a, hold, wet, curve(크기 곡선) } */
  function noise(t, dur, o, opt) {
    opt = opt || {};
    var s = ctx.createBufferSource(); s.buffer = NB; s.loop = true;
    var fl = filt(opt.type || 'bandpass', opt.f || 1000, opt.q);
    if (opt.f2) { fl.frequency.setValueAtTime(opt.f, t); fl.frequency.exponentialRampToValueAtTime(opt.f2, t + (opt.ft || dur)); }
    var g = G(0), v = opt.v || 0.2, a = opt.a || 0.003;
    if (opt.curve) { g.gain.setValueAtTime(0, t); g.gain.setValueCurveAtTime(new Float32Array(opt.curve.map(function (c) { return c * v; })), t + 0.001, dur - 0.002); }
    else if (opt.hold) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.setValueAtTime(v, t + Math.max(a, dur - (opt.r || 0.08))); g.gain.linearRampToValueAtTime(0, t + dur); }
    else env(g.gain, t, a, v, dur - a);
    s.connect(fl); fl.connect(g); to(g, o, opt.wet);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  // 타악기
  function kick(t, o, v, f0, f1) { osc('sine', f0 || 150, t, 0.42, o, { f2: f1 || 42, glide: 0.13, v: v || 0.5 }); noise(t, 0.02, o, { type: 'highpass', f: 2500, v: (v || 0.5) * 0.25 }); }
  function snare(t, o, v) { noise(t, 0.18, o, { f: 1900, q: 0.8, v: v || 0.25 }); osc('triangle', 200, t, 0.09, o, { f2: 150, v: (v || 0.25) * 0.6 }); }
  function hat(t, o, v, open) { noise(t, open ? 0.28 : 0.05, o, { type: 'highpass', f: 7500, v: v || 0.06 }); }
  function clap(t, o, v, f) { for (var k = 0; k < 3; k++) noise(t + k * 0.011, 0.03, o, { f: f || 1300, q: 1.2, v: v || 0.2 }); noise(t + 0.03, 0.16, o, { f: f || 1300, q: 1, v: (v || 0.2) * 0.6 }); }
  function tick(t, o, v, hi) { osc('square', hi ? 2300 : 1650, t, 0.028, o, { v: v || 0.05, lp: 5000 }); }
  // 종: 배음이 정수배가 아닌 사인파 여럿
  function bell(f, t, o, v, dur, wet) {
    [[1, 1], [2, 0.45], [2.76, 0.3], [5.4, 0.16], [8.93, 0.08]].forEach(function (p) { osc('sine', f * p[0], t, (dur || 1.5) / Math.sqrt(p[0]), o, { v: (v || 0.1) * p[1], a: 0.002, wet: wet }); });
  }
  function pluck(f, t, o, v, dur, wet) {
    osc('triangle', f, t, dur || 0.35, o, { v: v || 0.1, lp: 3200, lp2: 400, wet: wet });
    osc('sawtooth', f, t, (dur || 0.35) * 0.6, o, { v: (v || 0.1) * 0.25, lp: 2500, lp2: 300, wet: wet });
  }
  // 전자 피아노 (FM: 사인파가 사인파를 흔듦)
  function ep(f, t, o, v, dur, wet) {
    var c = ctx.createOscillator(), m = ctx.createOscillator(), mg = G(0), g = G(0);
    c.frequency.value = f; m.frequency.value = f;
    mg.gain.setValueAtTime(f * 1.6, t); mg.gain.exponentialRampToValueAtTime(f * 0.08, t + 0.5);
    m.connect(mg); mg.connect(c.frequency);
    env(g.gain, t, 0.004, v || 0.06, dur || 1.2);
    c.connect(g); to(g, o, wet);
    c.start(t); m.start(t); c.stop(t + (dur || 1.2) + 0.1); m.stop(t + (dur || 1.2) + 0.1);
  }
  function pad(fs, t, dur, o, v, lp, wet) {
    fs.forEach(function (f) {
      [-8, 8].forEach(function (dt) { osc('sawtooth', f, t, dur, o, { v: (v || 0.03) / fs.length, a: dur * 0.3, hold: true, r: dur * 0.35, det: dt, lp: lp || 1100, q: 0.4, wet: wet }); });
    });
  }
  function bass(f, t, dur, o, v) { osc('sawtooth', f, t, dur, o, { v: v || 0.1, lp: 700, lp2: 180, q: 2 }); osc('sine', f, t, dur, o, { v: (v || 0.1) * 0.7 }); }
  function brass(f, t, dur, o, v, wet) {
    [-6, 6].forEach(function (dt) { osc('sawtooth', f, t, dur, o, { v: (v || 0.08) / 2, a: 0.04, hold: true, r: Math.min(0.25, dur * 0.4), det: dt, lp: 700, lp2: 2400, lpt: 0.08, q: 1, wet: wet }); });
  }
  function sweepNoise(t, dur, o, f, f2, v, q, wet) { noise(t, dur, o, { f: f, f2: f2, q: q || 1.5, v: v, a: dur * 0.6, wet: wet }); }

  /* =====================================================================
   * 효과음 — 모두 직접 합성. 반환: 길이(초)
   * ===================================================================== */
  var FX = {
    /* 퀴즈 */
    correct: function (t, o) { [84, 88, 91].forEach(function (m, i) { bell(mf(m), t + i * 0.09, o, 0.14, 1.3, 0.4); }); [96, 100, 103].forEach(function (m, i) { bell(mf(m), t + 0.32 + i * 0.05, o, 0.05, 0.8, 0.6); }); return 1.7; },
    wrong: function (t, o) { [98, 104].forEach(function (f) { osc('square', f, t, 0.8, o, { v: 0.09, hold: true, lp: 1500 }); }); osc('sawtooth', 196, t, 0.8, o, { v: 0.03, hold: true, lp: 900 }); return 0.85; },
    ding: function (t, o) { bell(mf(79), t, o, 0.17, 1.6, 0.45); bell(mf(76), t + 0.42, o, 0.17, 2, 0.45); return 2.4; },
    fanfare: function (t, o) {
      [[67, 0, 0.11], [67, 0.13, 0.11], [67, 0.26, 0.11], [72, 0.4, 1.1]].forEach(function (n) { brass(mf(n[0]), t + n[1], n[2], o, 0.13, 0.25); });
      [60, 64, 67].forEach(function (m) { brass(mf(m), t + 0.4, 1.1, o, 0.06, 0.25); });
      snare(t + 0.4, o, 0.12); hat(t + 0.4, o, 0.08, true); return 1.6;
    },
    aww: function (t, o) {
      [[67, 0, 0.42], [66, 0.45, 0.42], [65, 0.9, 0.42]].forEach(function (n) { brass(mf(n[0]), t + n[1], n[2], o, 0.12); });
      [-6, 6].forEach(function (dt) { osc('sawtooth', mf(64), t + 1.35, 1.4, o, { v: 0.06, a: 0.05, hold: true, r: 0.5, det: dt, lp: 1600, vib: [5.5, 7] }); });
      return 2.8;
    },
    applause: function (t, o) {
      var dur = 4.2;
      noise(t, dur, o, { f: 1500, q: 0.5, v: 0.08, curve: [0, 0.6, 1, 1, 0.9, 0.7, 0.4, 0.15, 0] });
      for (var k = 0; k < 170; k++) { var x = Math.pow(Math.random(), 1.3) * dur * 0.92; clap(t + x, o, rnd(0.03, 0.11) * (x < 0.3 ? x / 0.3 : x > 3 ? (dur - x) / 1.2 : 1), rnd(900, 2600)); }
      return dur;
    },
    countdown: function (t, o) { for (var k = 0; k < 3; k++) osc('square', 880, t + k, 0.16, o, { v: 0.09, lp: 3000 }); osc('square', 1760, t + 3, 0.9, o, { v: 0.1, lp: 3500, hold: true, r: 0.3 }); return 3.95; },
    timeup: function (t, o) { [82, 87, 164].forEach(function (f, i) { osc(i < 2 ? 'square' : 'sawtooth', f, t, 1.6, o, { v: i < 2 ? 0.1 : 0.03, hold: true, lp: 1300, r: 0.15 }); }); return 1.65; },

    /* 방탈출 */
    creak: function (t, o) {
      var dur = 1.9, x = ctx.createOscillator(), g = G(0), bp = filt('bandpass', 1100, 5), lp = filt('lowpass', 3000);
      x.type = 'sawtooth';
      var curve = new Float32Array(48); for (var i = 0; i < 48; i++) curve[i] = 95 + 70 * Math.sin(i / 47 * Math.PI) + rnd(-25, 25);
      x.frequency.setValueCurveAtTime(curve, t, dur);
      g.gain.setValueCurveAtTime(new Float32Array([0, 0.26, 0.19, 0.3, 0.17, 0.28, 0.21, 0.12, 0]), t, dur);
      x.connect(bp); bp.connect(lp); lp.connect(g); to(g, o, 0.3); x.start(t); x.stop(t + dur + 0.05);
      return dur;
    },
    slam: function (t, o) { kick(t, o, 0.7, 110, 38); noise(t, 0.45, o, { type: 'lowpass', f: 700, v: 0.45, wet: 0.5 }); noise(t + 0.01, 0.08, o, { f: 2400, q: 1, v: 0.15 }); return 1.3; },
    hint: function (t, o) {
      var scale = [84, 86, 88, 91, 93, 96, 98, 100];
      for (var k = 0; k < 9; k++) bell(mf(scale[Math.floor(Math.random() * scale.length)]), t + k * 0.065, o, 0.05, 0.9, 0.7);
      noise(t, 1.2, o, { type: 'highpass', f: 6500, v: 0.05, a: 0.4, wet: 0.5 }); return 1.7;
    },
    thunder: function (t, o) {
      noise(t, 0.25, o, { type: 'highpass', f: 1200, v: 0.35 });
      var c = []; for (var i = 0; i < 40; i++) c.push(Math.pow(1 - i / 39, 1.6) * rnd(0.5, 1));
      noise(t + 0.05, 3.8, o, { type: 'lowpass', f: 260, f2: 70, q: 0.5, v: 0.55, curve: c, wet: 0.4 });
      kick(t + 0.05, o, 0.4, 70, 30); return 4;
    },
    stinger: function (t, o) {
      [0, 0.34].forEach(function (d) { brass(mf(38), t + d, 0.24, o, 0.14); brass(mf(50), t + d, 0.24, o, 0.08); kick(t + d, o, 0.35, 90, 40); });
      [50, 53, 56, 38].forEach(function (m) { [-7, 7].forEach(function (dt) { osc('sawtooth', mf(m), t + 0.75, 2.4, o, { v: 0.035, a: 0.03, hold: true, r: 1.2, det: dt, lp: 1400, vib: [7, 4], wet: 0.4 }); }); });
      kick(t + 0.75, o, 0.5, 80, 35); return 3.2;
    },
    jumpscare: function (t, o) {
      sweepNoise(t, 0.35, o, 300, 3500, 0.15, 2);
      [77, 78, 79, 80, 89].forEach(function (m) { osc('sawtooth', mf(m), t + 0.35, 1.1, o, { v: 0.05, a: 0.004, lp: 5000, lp2: 1500, vib: [11, 18], wet: 0.4 }); });
      kick(t + 0.35, o, 0.8, 120, 32); noise(t + 0.35, 0.6, o, { type: 'lowpass', f: 1500, v: 0.4, wet: 0.5 }); return 1.6;
    },
    glass: function (t, o) {
      noise(t, 0.45, o, { type: 'highpass', f: 3000, v: 0.3, wet: 0.3 });
      for (var k = 0; k < 14; k++) osc('sine', rnd(2800, 7500), t + rnd(0, 0.7), rnd(0.05, 0.25), o, { v: rnd(0.02, 0.06), wet: 0.4 });
      return 1.1;
    },
    steps: function (t, o) { for (var k = 0; k < 4; k++) { var x = t + k * 0.48 + rnd(-0.03, 0.03); noise(x, 0.09, o, { type: 'lowpass', f: 520, v: 0.4, wet: 0.35 }); osc('sine', 85, x, 0.1, o, { v: 0.25 }); } return 2.1; },

    gong: function (t, o) {
      [[1, 1, 5], [1.48, 0.6, 4], [2.1, 0.45, 3.4], [2.93, 0.3, 2.6], [3.62, 0.2, 2], [4.7, 0.12, 1.4]].forEach(function (p) { osc('sine', 98 * p[0], t, p[2], o, { v: 0.11 * p[1], a: 0.01, f2: 98 * p[0] * 0.985, glide: p[2], wet: 0.4 }); });
      noise(t, 0.08, o, { type: 'lowpass', f: 900, v: 0.2 }); return 5;
    },
    // 자정: 낮은 종 세 번 + 길게 울림
    midnight: function (t, o) { [0, 1.3, 2.6].forEach(function (d) { bell(mf(55), t + d, o, 0.2, 4, 0.7); osc('sine', mf(43), t + d, 2.5, o, { v: 0.08, wet: 0.5 }); }); return 6; },
  };

  /* --- 계속 울리는 효과음 (켜기·끄기) — 각자 시계로 미리 예약 --- */
  var LOOPS = {
    heart: { every: 60 / 66, beat: function (t, o) { kick(t, o, 0.45, 75, 38); kick(t + 0.24, o, 0.3, 70, 36); } },
    clock: { every: 1, n: 0, beat: function (t, o) { tick(t, o, 0.07, (this.n++ % 2) === 0); } },
    wind: { start: function (t, o) {
      var s = ctx.createBufferSource(), bp = filt('bandpass', 500, 1.8), l = ctx.createOscillator(), lg = G(260), g = G(0), l2 = ctx.createOscillator(), l2g = G(0.05);
      s.buffer = NB; s.loop = true; l.frequency.value = 0.13; l2.frequency.value = 0.21;
      l.connect(lg); lg.connect(bp.frequency); l2.connect(l2g); l2g.connect(g.gain);
      s.connect(bp); bp.connect(g); g.gain.linearRampToValueAtTime(0.11, t + 1.2); to(g, o, 0.4);
      s.start(t); l.start(t); l2.start(t);
      return function (at) { g.gain.cancelScheduledValues(at); g.gain.setValueAtTime(g.gain.value, at); g.gain.linearRampToValueAtTime(0, at + 0.6); s.stop(at + 0.7); l.stop(at + 0.7); l2.stop(at + 0.7); };
    } },
    // 두구두구: 켜면 계속 굴리다가 끄면(또는 10초 뒤) '짠!'
    roll: { every: 0.042, max: 10, k: 0, beat: function (t, o) { this.k++; snare(t, o, Math.min(0.2, 0.05 + this.k * 0.0016) * rnd(0.8, 1)); },
      end: function (t, o) {
        noise(t, 1.6, o, { type: 'highpass', f: 5000, v: 0.2, wet: 0.4 }); kick(t, o, 0.5);
        [60, 64, 67, 72, 76].forEach(function (m) { brass(mf(m), t, 1.2, o, 0.05, 0.3); });
        bell(mf(96), t, o, 0.06, 1, 0.5);
      } }
  };

  // 효과음을 낼 때마다 따로 크기 조절용 입구 (모두 멈춤 때 끊김)
  function sfxDest() { return { d: sfxIn, w: sfxWet }; }
  var duckUntil = 0;
  function duckFor(sec) {
    if (!S.duckOn || !ctx) return;
    var t = ctx.currentTime, until = t + sec + 0.15;
    if (until <= duckUntil && duck.gain.value < 0.6) { duckUntil = until; duck.gain.cancelScheduledValues(until); duck.gain.setTargetAtTime(1, until, 0.25); return; }
    duckUntil = Math.max(duckUntil, until);
    duck.gain.cancelScheduledValues(t); duck.gain.setTargetAtTime(0.35, t, 0.03); duck.gain.setTargetAtTime(1, duckUntil, 0.25);
  }
  S.sfx = function (id) {
    if (!S.init() || !FX[id]) return 0;
    var t = ctx.currentTime + 0.012, dur = FX[id](t, sfxDest());
    duckFor(dur);
    return dur;
  };

  // 켜져 있는 loop 효과음
  var on = {};
  S.isOn = function (id) { return !!on[id]; };
  S.toggle = function (id) {
    if (!S.init() || !LOOPS[id]) return false;
    if (on[id]) { stopLoop(id, true); return false; }
    var L = LOOPS[id], t = ctx.currentTime + 0.012, o = sfxDest(), st = { o: o, next: t, t0: t };
    if (L.k != null) L.k = 0;
    if (L.start) st.stop = L.start(t, o);
    on[id] = st;
    if (S.duckOn && id === 'roll') { duck.gain.cancelScheduledValues(ctx.currentTime); duck.gain.setTargetAtTime(0.25, ctx.currentTime, 0.05); }
    return true;
  };
  function stopLoop(id, nice) {
    var st = on[id]; if (!st) return;
    delete on[id];
    var t = ctx.currentTime;
    if (st.stop) st.stop(t);
    if (nice && LOOPS[id].end) { LOOPS[id].end(t + 0.02, st.o); duckFor(1.4); }
    if (S.duckOn && !Object.keys(on).length && t >= duckUntil) duck.gain.setTargetAtTime(1, t, 0.25);
    if (S.onLoopEnd) S.onLoopEnd(id);
  }
  S.stopLoop = function (id) { stopLoop(id, true); };
  S.loopsOn = function () { return Object.keys(on); };

  /* =====================================================================
   * 배경음악 — 16분음표 단위로 미리 예약 (lookahead)
   * ===================================================================== */
  var TR = {};
  var BG = { cur: null, lv: 2, tg: null, next: 0, i: 0, stop: null };
  function lookahead() { return document.hidden ? 1.6 : 0.18; }

  function pump() {
    if (!ctx) return;
    var until = ctx.currentTime + lookahead();
    // 배경음악
    if (BG.cur && TR[BG.cur]) {
      var tr = TR[BG.cur], o = { d: BG.tg, w: null };
      while (BG.next < until) {
        var st = 60 / tr.bpm[BG.lv - 1] / 4, s = BG.i % 16, bar = Math.floor(BG.i / 16);
        var t = BG.next + (tr.swing && s % 4 === 2 ? st * tr.swing : 0);
        tr.step(s, bar, t, o, BG.lv, st);
        BG.i++; BG.next += st;
      }
    }
    // 계속 울리는 효과음
    Object.keys(on).forEach(function (id) {
      var L = LOOPS[id], st = on[id];
      if (L.max && ctx.currentTime - st.t0 > L.max) { stopLoop(id, true); return; }
      if (!L.beat) return;
      while (st.next < until) { L.beat(st.next, st.o); st.next += L.every; }
    });
  }

  S.bgm = {
    tracks: function () { return ORDER.map(function (k) { var x = TR[k]; return { id: k, name: x.name, emoji: x.emoji, desc: x.desc, group: ORDER.indexOf(k) < 3 ? 'contest' : 'mystery' }; }); },
    cur: function () { return BG.cur; },
    level: function (lv) { if (lv) BG.lv = Math.max(1, Math.min(3, lv)); return BG.lv; },
    play: function (id, fade) {
      if (!S.init() || !TR[id]) return;
      fade = fade == null ? 1.5 : fade;
      var t = ctx.currentTime;
      fadeOutCur(fade);
      var tg = G(0), tr = TR[id];
      tg.connect(bgmOut);
      if (tr.wet) { var ws = G(tr.wet); tg.connect(ws); ws.connect(bgmConv); }
      tg.gain.setValueAtTime(0.0001, t); tg.gain.exponentialRampToValueAtTime(tr.gain || 1, t + Math.max(0.05, fade));
      BG.cur = id; BG.tg = tg; BG.i = 0; BG.next = t + 0.05;
      BG.stop = tr.start ? tr.start(t + 0.05, { d: tg, w: null }) : null;
    },
    // 내 파일을 배경음악으로 (반복)
    playBuffer: function (buf, fade) {
      if (!S.init()) return;
      fade = fade == null ? 1.5 : fade;
      var t = ctx.currentTime; fadeOutCur(fade);
      var tg = G(0), s = ctx.createBufferSource();
      tg.connect(bgmOut); s.buffer = buf; s.loop = true; s.connect(tg); s.start(t);
      tg.gain.setValueAtTime(0.0001, t); tg.gain.exponentialRampToValueAtTime(1, t + Math.max(0.05, fade));
      BG.cur = '__file'; BG.tg = tg; BG.stop = function (at) { s.stop(at); };
    },
    stop: function (fade) { if (!ctx) return; fadeOutCur(fade == null ? 1.2 : fade); BG.cur = null; BG.tg = null; }
  };
  function fadeOutCur(fade) {
    if (!BG.tg) return;
    var tg = BG.tg, stop = BG.stop, t = ctx.currentTime, f = Math.max(0.03, fade);
    tg.gain.cancelScheduledValues(t); tg.gain.setValueAtTime(Math.max(0.0001, tg.gain.value), t); tg.gain.exponentialRampToValueAtTime(0.0001, t + f);
    if (stop) stop(t + f);
    setTimeout(function () { try { tg.disconnect(); } catch (e) {} }, (f + 4) * 1000);
    BG.tg = null; BG.stop = null;
  }

  // 계속 울리는 바탕(드론) — 배경음악이 끝나면 멈춤
  function drone(fs, t, o, v, lp, lfoRate, lfoDepth, type) {
    var nodes = [], fl = filt('lowpass', lp || 400, 0.8), g = G(0);
    fs.forEach(function (f, i) { [-6, 6].forEach(function (dt) { var x = ctx.createOscillator(); x.type = type || 'sawtooth'; x.frequency.value = f; x.detune.value = dt + i; x.connect(fl); x.start(t); nodes.push(x); }); });
    if (lfoRate) { var l = ctx.createOscillator(), lg = G(lfoDepth || 150); l.frequency.value = lfoRate; l.connect(lg); lg.connect(fl.frequency); l.start(t); nodes.push(l); }
    fl.connect(g); g.connect(o.d); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 3);
    return function (at) { nodes.forEach(function (n) { try { n.stop(at + 0.05); } catch (e) {} }); };
  }
  function rumble(t, o, v, f) {
    var s = ctx.createBufferSource(), fl = filt('lowpass', f || 110, 0.7), g = G(0);
    s.buffer = NB; s.loop = true; s.connect(fl); fl.connect(g); g.connect(o.d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 3); s.start(t);
    return function (at) { try { s.stop(at + 0.05); } catch (e) {} };
  }
  function both(a, b) { return function (at) { a && a(at); b && b(at); }; }

  /* --- 곡 (모두 새로 지음). step(s 0~15, bar, t, o, lv 1~3, 16분음표 길이) --- */
  TR.suspense = {
    name: '긴장감', emoji: '😰', desc: '추리 · 범인 지목 · 마지막 투표', bpm: [80, 96, 116], wet: 0.25, gain: 1.2,
    start: function (t, o) { return drone([mf(38), mf(45)], t, o, 0.045, 260, 0.07, 140); },
    step: function (s, bar, t, o, lv, st) {
      if (s % 4 === 0) tick(t, o, 0.045, s % 8 === 0);
      if (s % 2 === 0) {
        var base = (Math.floor(bar / 4) % 2 ? 41 : 38) + 12, n = base + ((s / 2) % 2 ? 1 : 0);
        osc('sawtooth', mf(n), t, st * 1.6, o, { v: lv === 1 ? 0.035 : 0.05, lp: 900, lp2: 300 });
      }
      if (lv >= 2) {
        if (s === 0) kick(t, o, 0.32, 80, 40); if (s === 3) kick(t, o, 0.2, 75, 38);
        if (s === 0 && bar % 4 === 0) pad([mf(57), mf(58)], t, st * 64, o, 0.03, 900);
      }
      if (lv === 3) {
        hat(t, o, s % 4 === 2 ? 0.04 : 0.018);
        if (s === 8 && bar % 2 === 1) sweepNoise(t, st * 8, o, 400, 3000, 0.06, 1.5);
        if (s === 0 && bar % 2 === 0) { brass(mf(38), t, st * 3, o, 0.07); brass(mf(44), t, st * 3, o, 0.06); }
      }
    }
  };
  var MYS = [[57, 60, 64, 69], [53, 57, 60, 65], [50, 53, 57, 62], [52, 56, 59, 64]];
  TR.mystery = {
    name: '미스터리', emoji: '🔍', desc: '오르골 · 단서를 찾는 시간', bpm: [64, 72, 82], wet: 0.6, gain: 1.2,
    step: function (s, bar, t, o, lv, st) {
      var ch = MYS[bar % 4], pat = Math.floor(bar / 8) % 2 ? [3, 2, 1, 0, 1, 2, 1, 0] : [0, 1, 2, 3, 2, 1, 2, 3];
      if (s % 2 === 0) bell(mf(ch[pat[s / 2]] + 12), t, o, 0.045, 1.3);
      if (s === 0) { pad([mf(ch[0]), mf(ch[1]), mf(ch[2])], t, st * 16, o, 0.022, 800); if (bar % 2 === 1) bell(mf(ch[3] + 24), t, o, 0.025, 2.4); }
      if (lv >= 2 && (s === 0 || s === 8)) osc('sine', mf(ch[0] - 12), t, st * 6, o, { v: 0.12, a: 0.02 });
      if (lv === 3) { if (s % 4 === 2) hat(t, o, 0.015); if (s === 12 && bar % 2 === 0) sweepNoise(t, st * 6, o, 2400, 700, 0.03, 6); }
    }
  };
  var QZ_R = [48, 45, 41, 43, 48, 45, 43, 48];
  // 8분음표 단위, 한 마디 8칸 × 8마디 (0 = 쉼)
  var QZ_M = [72, 0, 76, 0, 79, 0, 76, 0, 81, 0, 79, 76, 77, 0, 0, 0, 74, 0, 77, 0, 81, 0, 77, 0, 79, 0, 77, 74, 76, 0, 0, 0,
    72, 0, 76, 0, 79, 0, 84, 0, 81, 0, 79, 0, 77, 0, 76, 0, 74, 0, 72, 0, 71, 0, 74, 0, 72, 0, 0, 0, 0, 0, 0, 0];
  TR.quiz = {
    name: '생각 시간', emoji: '🤔', desc: '경기 중 · 퀴즈 · 장고', bpm: [104, 116, 132], wet: 0.18, gain: 1.2,
    step: function (s, bar, t, o, lv, st) {
      var b8 = bar % 8, r = QZ_R[b8];
      if (s % 4 === 0) osc('sine', s % 8 === 0 ? 1250 : 950, t, 0.05, o, { v: 0.08 });   // 우드블록
      if (s % 4 === 0) pluck(mf(r - (s % 8 ? -7 : 0)), t, o, 0.14, 0.28);
      if (lv >= 2 && s % 2 === 0) { var m = QZ_M[b8 * 8 + s / 2]; if (m) osc('square', mf(m), t, st * 1.8, o, { v: 0.035, lp: 2400, lp2: 900 }); }
      if (lv === 3) { if (s % 2 === 1) noise(t, 0.04, o, { type: 'highpass', f: 6000, v: 0.025 }); if (s === 4 || s === 12) clap(t, o, 0.08); }
    }
  };
  TR.horror = {
    name: '공포', emoji: '👻', desc: '할로윈 · 낮은 울림 · 삐걱 · 속삭임', bpm: [60, 60, 60], wet: 0.55, gain: 1.2,
    start: function (t, o) { return both(drone([mf(45), mf(46)], t, o, 0.035, 340, 0.05, 120), rumble(t, o, 0.18, 100)); },
    step: function (s, bar, t, o, lv, st) {
      if (s === 0 && Math.random() < 0.5) bell(mf(rnd(0, 1) < 0.5 ? 50 : 49), t, o, 0.04, 4.5);
      if (Math.random() < 0.035) FX.creak(t, { d: o.d, w: null }) ;
      if (Math.random() < 0.04) sweepNoise(t, 2.2, o, rnd(1600, 2600), rnd(500, 800), 0.03, 7);
      if (lv >= 2 && s % 4 === 0) { kick(t, o, 0.22, 70, 36); kick(t + 0.24, o, 0.14, 65, 34); }
      if (lv === 3 && Math.random() < 0.02) [0, 0.6].forEach(function (d) { osc('sawtooth', rnd(1150, 1350), t + d, 2, o, { v: 0.012, a: 0.6, hold: true, r: 0.8, vib: [6, 20], lp: 3500 }); });
    }
  };
  var LG = [[50, [53, 57, 60, 64]], [43, [47, 52, 53, 57]], [36, [52, 55, 59, 62]], [45, [49, 55, 58, 64]]];
  TR.lounge = {
    name: '대기실', emoji: '☕', desc: '접수 · 쉬는 시간 · 재즈 화음', bpm: [76, 84, 92], swing: 0.33, wet: 0.3, gain: 1.4,
    step: function (s, bar, t, o, lv, st) {
      var c = LG[bar % 4];
      if (s === 0) c[1].forEach(function (m, i) { ep(mf(m), t + i * 0.012, o, 0.045, st * 7); });
      if (s === 6 || (s === 10 && bar % 2)) c[1].forEach(function (m) { ep(mf(m), t, o, 0.025, st * 2); });
      if (lv >= 2) { if (s === 0) osc('triangle', mf(c[0]), t, st * 6, o, { v: 0.16, lp: 600 }); if (s === 8) osc('triangle', mf(c[0] + 7), t, st * 6, o, { v: 0.13, lp: 600 }); }
      if (lv === 3) { if (s === 0 || s === 10) kick(t, o, 0.22, 110, 45); if (s === 4 || s === 12) noise(t, 0.12, o, { f: 1800, q: 0.7, v: 0.07 }); if (s % 2 === 0) hat(t, o, 0.018); }
    }
  };
  var VC = [[48, [60, 64, 67]], [43, [59, 62, 67]], [45, [60, 64, 69]], [41, [60, 65, 69]]];
  TR.victory = {
    name: '시상식', emoji: '🏆', desc: '우승 발표 · 엔딩 · 밝은 장조', bpm: [118, 126, 136], wet: 0.25, gain: 0.6,
    step: function (s, bar, t, o, lv, st) {
      var c = VC[bar % 4], a = [c[1][0], c[1][1], c[1][2], c[1][0] + 12, c[1][2], c[1][1], c[1][0] + 12, c[1][2] + 12];
      if (s % 2 === 0) pluck(mf(a[s / 2] + 12), t, o, 0.06, 0.3);
      if (s === 0) { c[1].forEach(function (m) { brass(mf(m), t, st * 3, o, 0.04); }); }
      if (s % 4 === 0) { kick(t, o, 0.35); bass(mf(c[0]), t, st * 3, o, 0.07); }
      if (lv >= 2 && (s === 4 || s === 12)) clap(t, o, 0.12);
      if (lv >= 2 && s % 4 === 2) hat(t, o, 0.04, true);
      if (lv === 3) { if (s % 2 === 1) hat(t, o, 0.02); if (s === 0 && bar % 2 === 0) bell(mf(c[1][2] + 24), t, o, 0.04, 1.4); }
    }
  };

  /* --- 목록 (화면이 씀) --- */
  // 쓰는 자리: 보드게임 대회 · 머더미스터리 · 할로윈 (꼭 필요한 것만)
  S.SFX = {
    contest: [
      ['gong', '징 (시작·끝)', '🥮'], ['ding', '띵동 (문제)', '🛎️'], ['correct', '정답', '⭕'], ['wrong', '오답', '❌'],
      ['countdown', '3 · 2 · 1 · 땡', '⏳'], ['timeup', '시간 종료', '⏰'], ['roll', '두구두구 → 짠', '🥁', 1], ['fanfare', '팡파레', '🎺'],
      ['applause', '박수', '👏'], ['aww', '아쉬워요', '😢']
    ],
    mystery: [
      ['stinger', '둥둥둥! (반전)', '😱'], ['hint', '단서 발견', '✨'], ['creak', '문 삐걱', '🚪'], ['slam', '문 쾅', '💥'],
      ['steps', '발소리', '👣'], ['glass', '유리 깨짐', '🪟'], ['thunder', '천둥', '⛈️'], ['midnight', '자정 종소리', '🔔'],
      ['jumpscare', '깜짝 (큰 소리)', '👹'], ['heart', '심장 박동', '💓', 1], ['clock', '시계 똑딱', '🕰️', 1], ['wind', '으스스한 바람', '🌬️', 1]
    ]
  };
  var ORDER = ['lounge', 'quiz', 'victory', 'suspense', 'mystery', 'horror'];

  // 모두 멈춤: 배경음악 짧게 줄이고, 켜진 것 끄고, 울리던 효과음 끊음
  S.stopAll = function () {
    if (!ctx) return;
    Object.keys(on).forEach(function (id) { stopLoop(id, false); });
    S.bgm.stop(0.15);
    newSfxIn();
    duck.gain.cancelScheduledValues(ctx.currentTime); duck.gain.setValueAtTime(1, ctx.currentTime); duckUntil = 0;
  };

  // 내 파일 효과음 (한 번)
  S.playBuffer = function (buf) {
    if (!S.init()) return 0;
    var s = ctx.createBufferSource(); s.buffer = buf; s.connect(sfxIn); s.start(ctx.currentTime + 0.01);
    duckFor(buf.duration); return buf.duration;
  };
  S.decode = function (arrayBuf) {
    S.init();
    return new Promise(function (ok, no) { ctx.decodeAudioData(arrayBuf, ok, no); });
  };

  W.JMB_SND = S;
})(window);
