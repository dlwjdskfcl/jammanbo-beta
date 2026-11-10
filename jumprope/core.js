/* 잠만보 단체 줄넘기 — 게임 규칙 core.js (화면 없음, node 로 시험 가능)
 *
 *   var g = JR_CORE.create({ mode: 'solo'|'coop'|'surv', n: 사람 수(여럿), team: 팀 인원(혼자, 3~8), seed })
 *   g.jump(pid, t)   t(초) 에 pid 가 뜀 (혼자 하기는 pid 0 하나가 모두를 조종) → 일어난 일 목록
 *   g.advance(t)     시계를 t 까지 돌림 → 일어난 일 목록  {type:'pass'|'trip'|'join'|'seg'|'restart'|'tie'|'over', …}
 *   g.angle(t)       줄 각도 (0 = 바닥, ±π = 머리 위, + 는 앞쪽으로 올라감)
 *   g.nextPass()     다음에 줄이 바닥을 지나는 때 {T, W, kind}
 *
 * 판정: 줄이 바닥을 지나는 순간(T)에 발 높이가 줄 높이(clear) 이상이면 통과.
 *   뛴 시각 tj, 체공 AIR → 가장 높은 순간은 tj + AIR/2. 오차 err = (T - tj) - AIR/2 (+ 면 일찍 뜀)
 *   |err| ≤ W 통과 (W 는 뒤로 갈수록 좁아짐 = 줄이 높게 지나감), |err| ≤ PERF 퍼펙트
 * 시간은 모두 '게임 시계(초)' — 화면 갱신 속도와 상관없이 입력 시각으로만 판정함.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JR_CORE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TAU = Math.PI * 2;
  var AIR = 0.46;        // 체공 시간(초)
  var BUF = 0.11;        // 착지 직전에 누르면 착지하자마자 다시 뜀
  var PERF = 0.045;      // 퍼펙트 오차(초)
  var DOWN = 1.5;        // 걸린 뒤 다시 돌리기까지
  var RECRUIT = 5;       // 혼자 하기: 퍼펙트 연속 몇 번마다 한 명 들어오나

  function rng(seed) {   // mulberry32
    var a = (seed >>> 0) || 1;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function pw(x, pts) {   // 꺾은선
    if (x <= pts[0][0]) return pts[0][1];
    for (var i = 1; i < pts.length; i++) if (x <= pts[i][0]) { var a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
    return pts[pts.length - 1][1];
  }

  /* 난이도 곡선 — i 번째 넘기 (scale: 여럿이 하기는 더 천천히 어려워짐)
   *   P 한 바퀴 시간 · W 통과 오차 · pat 변칙이 나올 확률 */
  var CURVE = {
    P: [[0, 1.16], [10, 1.12], [30, 0.98], [50, 0.88], [100, 0.74], [160, 0.64], [240, 0.58]],
    W: [[0, 0.180], [10, 0.168], [30, 0.138], [50, 0.114], [100, 0.092], [160, 0.078], [240, 0.068], [400, 0.052]],
    pat: [[0, 0], [9.9, 0], [10, 0.16], [30, 0.22], [50, 0.28], [120, 0.36]]
  };
  function diff(i, scale) {
    var x = i * (scale || 1);
    return { x: x, P: pw(x, CURVE.P), W: pw(x, CURVE.W), pat: pw(x, CURVE.pat) };
  }
  function recruitNeed(count) { return Math.min(12, RECRUIT + Math.floor(count / 40)); }   // 뒤로 갈수록 영입이 더뎌짐
  function clearOf(W) { var k = 2 * W / AIR; return Math.max(0, 1 - k * k); }   // 줄이 지나가는 높이 (뛰는 높이에 대한 비율)
  function height(dt) { if (dt <= 0 || dt >= AIR) return 0; var u = dt / AIR; return 4 * u * (1 - u); }   // 0~1

  var EASE = {
    lin: function (u) { return u; },
    in: function (u) { return Math.pow(u, 1.7); },
    out: function (u) { return 1 - Math.pow(1 - u, 1.7); },
    start: function (u) { return Math.pow(u, 1.9); },
    hang: function (u) { return u + 0.8 / TAU * Math.sin(TAU * u); }   // 머리 위에서 멈칫, 바닥은 휙
  };
  // 변칙: [이름, 나오기 시작하는 x, 비중]
  var PATS = [['slow', 10, 3], ['fast', 10, 3], ['hang', 20, 3], ['double', 24, 3], ['reverse', 30, 3], ['fake', 50, 3]];

  function create(opt) {
    opt = opt || {};
    var mode = opt.mode === 'coop' || opt.mode === 'surv' ? opt.mode : 'solo';
    var n = mode === 'solo' ? 1 : Math.max(2, Math.min(4, opt.n || 2));
    var rnd = rng(opt.seed == null ? (Date.now() ^ (Math.random() * 1e9)) : opt.seed);
    var scale = opt.scale || (mode === 'solo' ? 1 : mode === 'coop' ? 0.5 : 0.8);
    var g = {
      mode: mode, n: n, scale: scale, t: 0, state: 'play', dir: 1, gi: 0, sincePat: 0,
      segs: [], frozen: 0, resumeAt: 0, ending: false, ties: 0,
      count: 0, streak: 0, maxStreak: 0, perfects: 0, goods: 0, score: 0, trips: 0,
      players: [], members: [], pool: [], tripBy: {}, winners: [], lastPattern: ''
    };
    for (var i = 0; i < n; i++) g.players.push({ id: i, tj: -9, buf: false, alive: true, perfect: 0, good: 0, cleared: 0, outAt: -1, rank: 0 });
    if (mode === 'solo') {
      var team = Math.max(3, Math.min(8, opt.team || 6)), st = Math.min(team, opt.start || 3);
      for (i = 0; i < team; i++) (i < st ? g.members : g.pool).push(i);
      g.team = team; g.pstreak = 0;
    }

    /* ---------- 줄 계획 ---------- */
    function push(dur, a1, e, pass, kind, extra) {
      var last = g.segs[g.segs.length - 1], t0 = last ? last.t1 : g.t, a0 = last && !last.pass ? last.a1 : 0;
      var s = { t0: t0, t1: t0 + dur, a0: a0, a1: a1, e: e, pass: !!pass, kind: kind || 'normal', i: g.gi, W: diff(g.gi, scale).W, P: dur, cue: '' };
      if (extra) for (var k in extra) s[k] = extra[k];
      if (pass) g.gi++;
      g.segs.push(s);
      return s;
    }
    function rot(dur, e, kind, cue) { return push(dur, g.dir * TAU, e || 'lin', true, kind, cue ? { cue: cue } : null); }
    function startSeq(rest) {
      var d = diff(g.gi, scale);
      g.segs.length = 0;
      push(rest, 0, 'lin', false, 'rest', { cue: 'ready' });
      var s = rot(Math.max(1.45, d.P * 1.5), 'start', 'start', 'go');
      s.W = Math.max(s.W, 0.15);
      g.sincePat = -1;   // 다시 시작한 직후엔 변칙 없이 몇 번
    }
    function gen() {
      var d = diff(g.gi, scale), P = d.P;
      var gap = d.x >= 100 ? 1 : 2;
      if (g.sincePat >= gap && rnd() < d.pat) {
        var av = PATS.filter(function (p) { return d.x >= p[1] && p[0] !== g.lastPattern; }), tot = 0, r, k, kind = '';
        av.forEach(function (p) { tot += p[2]; });
        r = rnd() * tot;
        for (k = 0; k < av.length; k++) { r -= av[k][2]; if (r <= 0) { kind = av[k][0]; break; } }
        if (!kind && av.length) kind = av[av.length - 1][0];
        g.lastPattern = kind; g.sincePat = 0;
        if (kind === 'fake') {   // 예고 없음: 내려오다 말고 올라갔다가 다시 내려옴
          var stop = TAU - 0.95;
          push(P * stop / TAU, g.dir * stop, 'lin', false, 'fake1');
          push(0.32, g.dir * (TAU - 2.3), 'out', false, 'fake2');
          push(0.5, g.dir * TAU, 'in', true, 'fake');
          return;
        }
        rot(P, 'lin', 'normal', kind);   // 예고하는 한 바퀴
        if (kind === 'slow') { var ns = 2 + (rnd() < 0.5 ? 1 : 0); for (k = 0; k < ns; k++) rot(P * 1.5, 'lin', 'slow', k === ns - 1 ? 'norm' : ''); }
        else if (kind === 'fast') { for (k = 0; k < 3; k++) rot(Math.max(P * 0.72, 0.54), 'lin', 'fast', k === 2 ? 'norm' : ''); }
        else if (kind === 'hang') rot(P * 1.75, 'hang', 'hang');
        else if (kind === 'double') { rot(Math.max(P * 0.62, 0.54), 'lin', 'double'); rot(Math.max(P * 0.62, 0.54), 'lin', 'double'); }
        else if (kind === 'reverse') {
          push(P * 0.72, g.dir * Math.PI * 0.96, 'out', false, 'rev1');
          push(P * 0.72, 0, 'in', true, 'reverse');
          g.dir = -g.dir;
        }
        return;
      }
      g.sincePat++;
      rot(P * (d.x > 60 ? 0.95 + rnd() * 0.1 : 1), 'lin', 'normal');
    }
    function ensure() { while (g.segs.length < 2 || g.segs[g.segs.length - 1].t1 < g.t + 4) gen(); }

    /* ---------- 판정 ---------- */
    function judgeOne(p, s) {
      var dt = s.t1 - p.tj, err = dt - AIR / 2;
      var ok = dt >= 0 && Math.abs(err) <= s.W;
      return { pid: p.id, ok: ok, grade: !ok ? 'miss' : Math.abs(err) <= Math.min(PERF, s.W * 0.6) ? 'perfect' : 'good',
        err: Math.round(err * 1000), why: ok ? '' : dt > AIR + 0.25 ? 'none' : err > 0 ? 'early' : 'late' };
    }
    function pass(s, ev) {
      var res = [], fail = [], i, p, r;
      for (i = 0; i < n; i++) { p = g.players[i]; if (!p.alive) continue; r = judgeOne(p, s); res.push(r); if (!r.ok) fail.push(p); }
      var allPerfect = !fail.length && res.every(function (x) { return x.grade === 'perfect'; });
      res.forEach(function (x) { var q = g.players[x.pid]; if (x.ok) { q.cleared++; if (x.grade === 'perfect') q.perfect++; else q.good++; } q.buf = q.buf && x.ok; });
      var cleared = mode === 'surv' ? fail.length < res.length : !fail.length;
      if (cleared) {
        g.count++;
        if (mode !== 'surv' || !fail.length) {
          g.streak++; if (g.streak > g.maxStreak) g.maxStreak = g.streak;
          if (allPerfect) g.perfects++; else g.goods++;
          var heads = mode === 'solo' ? g.members.length : n;
          g.score += heads * (allPerfect ? 20 : 10) + Math.min(g.streak, 30);
        }
      }
      ev.push({ type: 'pass', T: s.t1, i: s.i, kind: s.kind, res: res, ok: !fail.length, perfect: allPerfect, count: g.count, streak: g.streak });
      if (!fail.length) {
        if (mode === 'solo') {
          g.pstreak = allPerfect ? g.pstreak + 1 : 0;
          if (allPerfect && g.pstreak >= recruitNeed(g.count) && g.pool.length) { g.pstreak = 0; var m = g.pool.shift(); g.members.push(m); ev.push({ type: 'join', who: m, size: g.members.length }); }
        }
        return;
      }
      /* 걸림 */
      g.streak = 0; g.trips++;
      g.state = 'down'; g.frozen = 0; g.resumeAt = s.t1 + DOWN;
      g.players.forEach(function (q) { q.buf = false; });
      if (mode === 'solo') {
        g.pstreak = 0;
        var k = Math.floor(rnd() * g.members.length), who = g.members.splice(k, 1)[0];
        g.pool.push(who); g.tripBy[who] = (g.tripBy[who] || 0) + 1;
        ev.push({ type: 'trip', who: [who], why: res[0].why, left: g.members.length });
        if (!g.members.length) g.ending = true;
      } else if (mode === 'coop') {
        fail.forEach(function (q) { g.tripBy[q.id] = (g.tripBy[q.id] || 0) + 1; });
        ev.push({ type: 'trip', who: fail.map(function (q) { return q.id; }), why: res.filter(function (x) { return !x.ok; })[0].why, left: 0 });
        g.ending = true;
      } else {
        var alive = g.players.filter(function (q) { return q.alive; }).length - fail.length;
        if (alive === 0 && g.ties < 2) {   // 남은 사람이 한꺼번에 걸림 → 그 사람들끼리 다시
          g.ties++;
          ev.push({ type: 'trip', who: fail.map(function (q) { return q.id; }), why: 'tie', left: fail.length, tie: true });
        } else {
          fail.forEach(function (q) { q.alive = false; q.outAt = q.cleared; q.rank = alive + 1; g.tripBy[q.id] = 1; });
          ev.push({ type: 'trip', who: fail.map(function (q) { return q.id; }), why: res.filter(function (x) { return !x.ok; })[0].why, left: alive });
          if (alive <= 1) {
            g.ending = true;
            g.winners = alive === 1 ? g.players.filter(function (q) { return q.alive; }).map(function (q) { q.rank = 1; return q.id; }) : fail.map(function (q) { q.rank = 1; return q.id; });
          }
        }
      }
    }

    /* ---------- 시계 ---------- */
    g.advance = function (t) {
      var ev = [];
      if (!(t > g.t)) return ev;
      for (var guard = 0; guard < 500; guard++) {
        if (g.state === 'over') break;
        var te = Infinity, kind = '', who = null, i, p;
        if (g.state === 'play') { te = g.segs[0].t1; kind = 'seg'; }
        else if (g.state === 'down') { te = g.resumeAt; kind = 'resume'; }
        for (i = 0; i < n; i++) { p = g.players[i]; if (p.buf && p.tj + AIR < te) { te = p.tj + AIR; kind = 'buf'; who = p; } }
        if (te > t) break;
        g.t = Math.max(g.t, te);
        if (kind === 'buf') { who.buf = false; who.tj = te; ev.push({ type: 'jump', pid: who.id, t: te }); }
        else if (kind === 'seg') {
          var s = g.segs.shift();
          if (s.pass) pass(s, ev);
          if (g.state === 'play') { ensure(); ev.push({ type: 'seg', seg: g.segs[0] }); }
        } else {
          if (g.ending) { g.state = 'over'; ev.push({ type: 'over' }); }
          else { g.state = 'play'; g.gi = g.count; startSeq(0.55); ensure(); ev.push({ type: 'restart' }, { type: 'seg', seg: g.segs[0] }); }
        }
      }
      if (t > g.t) g.t = t;
      return ev;
    };
    g.jump = function (pid, t) {
      var ev = g.advance(t), p = g.players[pid];
      if (!p || !p.alive || g.state !== 'play') return ev;
      if (t < p.tj + AIR) { if (p.tj + AIR - t <= BUF) p.buf = true; return ev; }
      p.tj = t; p.buf = false;
      ev.push({ type: 'jump', pid: pid, t: t });
      return ev;
    };
    g.angle = function (t) {
      if (g.state !== 'play') return g.frozen;
      var s = g.segs[0], u = (t - s.t0) / (s.t1 - s.t0);
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      return s.a0 + (s.a1 - s.a0) * EASE[s.e](u);
    };
    g.nextPass = function () {
      if (g.state !== 'play') return null;
      for (var i = 0; i < g.segs.length; i++) if (g.segs[i].pass) return { T: g.segs[i].t1, W: g.segs[i].W, kind: g.segs[i].kind, i: g.segs[i].i };
      return null;
    };
    g.window = function () { var s = g.segs[0]; if (g.state !== 'play' || !s) return diff(g.count, scale).W; for (var i = 0; i < g.segs.length; i++) if (g.segs[i].pass) return g.segs[i].W; return s.W; };
    g.period = function () { return diff(g.count, scale).P; };

    startSeq(opt.rest == null ? 0.9 : opt.rest);
    ensure();
    return g;
  }

  return { VER: '1.0.0', AIR: AIR, BUF: BUF, PERF: PERF, DOWN: DOWN, RECRUIT: RECRUIT, recruitNeed: recruitNeed, TAU: TAU, create: create, diff: diff, clearOf: clearOf, height: height, rng: rng, CURVE: CURVE };
});
