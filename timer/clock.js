/* 잠만보 보드게임 타이머 — 시계 계산 v1.0.0 (화면 없음 · node 로도 시험 가능)
 *
 *  체스 클락 (mode 'chess')   각자 가진 시간 main 에서 자기 차례 동안만 줄어듦
 *    inc  'none'      추가 없음 (서든 데스)
 *         'fischer'   턴을 끝낼 때마다 +incSec
 *         'bronstein' 턴을 끝낼 때 이번 턴에 쓴 만큼 돌려받음 (최대 incSec)
 *         'delay'     턴 시작 뒤 incSec 동안은 안 줄어듦 (US 딜레이)
 *         'byoyomi'   가진 시간을 다 쓰면 초읽기 byoSec 를 byoN 번 (그 안에 끝내면 횟수 그대로)
 *    onFlag 'continue' 시간이 다 돼도 표시만 하고 계속 (마이너스로 셈) · 'out' 그 사람 빠짐
 *  턴 타이머 (mode 'turn')    매 턴 limit (0 = 제한 없음, 재기만), 넘으면 각자 예비 시간 bank 를 씀
 *    onOver 'count' 넘긴 시간을 세고 계속 · 'auto' 자동으로 다음 사람
 *
 *  시간은 모두 ms. 실제 시각(now)을 함수에 넘겨서 계산 → 화면이 멈췄다 돌아와도 정확함
 */
(function (root) {
  'use strict';
  var C = {};

  C.create = function (cfg, players) {
    return {
      v: 1, cfg: cfg,
      ps: players.map(function (p) {
        return { name: p.name, color: p.color, bank: cfg.mode === 'chess' ? cfg.main : (cfg.bank || 0), per: cfg.byoN || 0,
          used: 0, turns: 0, longest: 0, overN: 0, overMs: 0, flag: false, out: false };
      }),
      cur: -1, dir: 1, round: 0, rs: -1, turnNo: 0,
      acc: 0, seg: 0, run: false, hit: false,   // acc: 이번 턴에 쌓인 시간(멈춘 동안 제외) · seg: 지금 구간 시작 · hit: 이번 턴 시간 초과 알림을 냈는지
      ended: false, t0: 0, tEnd: 0, hist: []
    };
  };

  C.elapsed = function (G, now) { return G.acc + (G.run ? now - G.seg : 0); };
  C.active = function (G) { return G.ps.filter(function (p) { return !p.out; }).length; };

  /* 한 사람의 지금 상태
   *  ms    화면에 보일 시간 (카운트다운: 남은 시간, 'free': 이번 턴에 쓴 시간, 'over': 넘긴 만큼 음수)
   *  phase 'main' 가진 시간 · 'byo' 초읽기 · 'turn' 턴 제한 · 'bank' 예비 시간 · 'over' 시간 초과 · 'free' 제한 없음
   *  frac  진행 막대 0~1 (없으면 null) */
  C.status = function (G, i, now) {
    var p = G.ps[i], c = G.cfg, e = i === G.cur ? C.elapsed(G, now) : 0, r = { e: e, frac: null, per: 0, delay: 0, bank: p.bank };
    if (c.mode === 'chess') {
      if (c.inc === 'byoyomi') {
        var S = c.byoSec * 1000;
        if (p.bank - e > 0) { r.phase = 'main'; r.ms = p.bank - e; r.per = p.per; r.frac = r.ms / c.main; }
        else {
          var over = e - Math.max(0, p.bank), u = Math.floor(over / S);
          if (u >= p.per) { r.phase = 'over'; r.ms = -(over - p.per * S); }
          else { r.phase = 'byo'; r.ms = S - (over - u * S); r.per = p.per - u; r.frac = r.ms / S; }
        }
      } else {
        var charge = e;
        if (c.inc === 'delay') { var d = c.incSec * 1000; r.delay = i === G.cur ? Math.max(0, d - e) : 0; charge = Math.max(0, e - d); }
        r.ms = p.bank - charge;
        r.phase = r.ms > 0 ? 'main' : 'over';
        r.frac = Math.max(0, Math.min(1, r.ms / c.main));
      }
    } else {
      var L = c.limit;
      if (!L) { r.phase = 'free'; r.ms = e; }
      else if (e <= L) { r.phase = 'turn'; r.ms = L - e; r.frac = r.ms / L; }
      else {
        var o = e - L;
        if (o < p.bank) { r.phase = 'bank'; r.ms = p.bank - o; r.bank = p.bank - o; r.frac = c.bank ? r.ms / c.bank : null; }
        else { r.phase = 'over'; r.ms = -(o - p.bank); r.bank = 0; }
      }
    }
    return r;
  };

  // 지금 차례가 시간 초과가 되는 '이번 턴 경과 시간' (없으면 Infinity)
  function deadline(G) {
    var p = G.ps[G.cur], c = G.cfg;
    if (c.mode === 'chess') {
      if (p.flag) return Infinity;
      if (c.inc === 'byoyomi') return Math.max(0, p.bank) + p.per * c.byoSec * 1000;
      if (c.inc === 'delay') return p.bank + c.incSec * 1000;
      return p.bank;
    }
    return c.limit ? c.limit + p.bank : Infinity;
  }

  function nextIdx(G, from) {
    var n = G.ps.length, i = from;
    for (var k = 0; k < n; k++) { i = (i + G.dir + n) % n; if (!G.ps[i].out) return i; }
    return -1;
  }
  C.nextIdx = nextIdx;

  function snap(G, now) {
    G.hist.push(JSON.stringify({ ps: G.ps, cur: G.cur, dir: G.dir, round: G.round, rs: G.rs, turnNo: G.turnNo, acc: C.elapsed(G, now), hit: G.hit }));
    if (G.hist.length > 40) G.hist.shift();
  }

  // 지금 차례의 턴을 끝내고 시간·기록 정리
  function endTurn(G, now) {
    var p = G.ps[G.cur], c = G.cfg, e = C.elapsed(G, now);
    if (c.mode === 'chess') {
      if (c.inc === 'byoyomi') {
        if (e < p.bank) p.bank -= e;
        else { var over = e - Math.max(0, p.bank), S = c.byoSec * 1000; p.bank = 0; p.per = Math.max(0, p.per - Math.floor(over / S)); }
      } else if (c.inc === 'delay') p.bank -= Math.max(0, e - c.incSec * 1000);
      else {
        p.bank -= e;
        if (c.inc === 'fischer') p.bank += c.incSec * 1000;
        else if (c.inc === 'bronstein') p.bank += Math.min(e, c.incSec * 1000);
      }
    } else if (c.limit && e > c.limit) {
      var o = e - c.limit, use = Math.min(o, p.bank);
      p.bank -= use;
      if (o > use) { p.overN++; p.overMs += o - use; }
    }
    p.used += e; p.turns++; if (e > p.longest) p.longest = e;
    G.acc = 0; G.seg = now; G.hit = false;
  }

  /* 다음 사람에게 (to 가 있으면 그 사람에게). 처음 부르면 게임 시작 */
  C.pass = function (G, now, to) {
    if (G.ended) return false;
    var start = G.cur < 0;
    var target = to != null ? to : nextIdx(G, G.cur);
    if (target < 0 || G.ps[target].out || (!start && target === G.cur && to != null)) return false;
    if (start) { G.t0 = now; G.rs = target; G.round = 1; }
    else {
      snap(G, now);
      endTurn(G, now);
      if (target === G.rs) G.round++;
    }
    G.cur = target; G.acc = 0; G.seg = now; G.run = true; G.hit = false; G.turnNo++;
    return true;
  };

  C.pause = function (G, now) { if (G.run) { G.acc = C.elapsed(G, now); G.run = false; } };
  C.resume = function (G, now) { if (!G.run && G.cur >= 0 && !G.ended) { G.seg = now; G.run = true; } };

  C.undo = function (G, now) {
    var s = G.hist.pop(); if (!s) return false;
    s = JSON.parse(s);
    G.ps = s.ps; G.cur = s.cur; G.dir = s.dir; G.round = s.round; G.rs = s.rs; G.turnNo = s.turnNo; G.hit = s.hit;
    G.acc = s.acc; G.seg = now;
    return true;
  };

  C.reverse = function (G) { G.dir = -G.dir; };
  // 가진 시간(체스) · 예비 시간(턴) 더하기·빼기. 시간을 더해 다시 남게 되면 시간 초과 표시를 지움 (다시 다 쓰면 또 알림)
  C.adjust = function (G, i, delta, now) {
    var p = G.ps[i];
    p.bank = Math.max(G.cfg.mode === 'chess' ? -36e6 : 0, p.bank + delta);
    if (G.cfg.mode === 'chess' && p.flag && C.status(G, i, now || 0).ms > 0) p.flag = false;
    if (G.cfg.mode === 'turn' && i === G.cur && C.status(G, i, now || 0).phase !== 'over') G.hit = false;
  };

  // 빠지기 / 돌아오기. 지금 차례가 빠지면 다음 사람으로
  C.setOut = function (G, i, on, now) {
    var p = G.ps[i];
    if (on && !p.out && C.active(G) <= 1) return false;
    if (on && G.cur === i) {
      var n = nextIdx(G, i);
      if (n < 0) return false;
      C.pass(G, now, n);
    }
    p.out = !!on;
    if (on && G.rs === i) G.rs = nextIdx(G, i);
    return true;
  };

  /* 화면이 자주 부름: 시간 초과를 처리하고 일어난 일을 돌려줌
   *  'flag' 체스 시간 초과 · 'out' 시간 초과로 빠짐 · 'timeup' 턴 시간 초과 · 'auto' 자동으로 넘김 · 'end' 한 사람만 남음 */
  C.tick = function (G, now) {
    var ev = [];
    if (!G.run || G.cur < 0 || G.ended) return ev;
    var c = G.cfg, dl = deadline(G), e = C.elapsed(G, now);
    if (e < dl) return ev;
    var at = now - (e - dl);   // 정확히 시간이 다 된 시각
    if (c.mode === 'chess') {
      var p = G.ps[G.cur];
      p.flag = true; ev.push('flag');
      if (c.onFlag === 'out') {
        var who = G.cur;
        if (C.active(G) <= 2) { endTurn(G, at); p.out = true; G.cur = nextIdx(G, who); C.end(G, at); ev.push('out', 'end'); return ev; }
        C.pass(G, at); G.ps[who].out = true; if (G.rs === who) G.rs = nextIdx(G, who);
        G.seg = at; ev.push('out');
      }
    } else if (!G.hit) {
      G.hit = true; ev.push('timeup');
      if (c.onOver === 'auto') { C.pass(G, at); ev.push('auto'); }
    }
    return ev;
  };

  C.end = function (G, now) {
    if (G.ended) return;
    if (G.cur >= 0) {
      var e = C.elapsed(G, now), p = G.ps[G.cur];
      if (e > 0) { p.used += e; p.turns++; if (e > p.longest) p.longest = e; }
    }
    G.run = false; G.acc = 0; G.ended = true; G.tEnd = now;
  };

  // 결과 표: 쓴 시간이 많은 순서가 아니라 자리 순서 그대로
  C.summary = function (G) {
    var tot = G.ps.reduce(function (s, p) { return s + p.used; }, 0);
    return {
      total: tot, wall: (G.tEnd || 0) - (G.t0 || 0), rounds: G.round, turns: G.ps.reduce(function (s, p) { return s + p.turns; }, 0),
      rows: G.ps.map(function (p) {
        return { name: p.name, color: p.color, used: p.used, turns: p.turns, avg: p.turns ? p.used / p.turns : 0, longest: p.longest,
          share: tot ? p.used / tot : 0, overN: p.overN, overMs: p.overMs, flag: p.flag, out: p.out, bank: p.bank, per: p.per };
      })
    };
  };

  if (typeof module === 'object' && module.exports) module.exports = C;
  else root.TimerClock = C;
})(this);
