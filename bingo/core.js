/* 잠만보 빙고 core.js — 화면 없는 계산 (씨앗 → 판·뽑는 순서, 줄 세기, 검증, AI). node 로도 시험할 수 있음
 *
 * 방 코드 = 숫자 5자리. 첫 자리는 설정(숫자 범위 2가지 × 목표 줄 수 5가지 = 10), 뒤 4자리는 무작위
 *   → 코드만 알면 누구 기기에서나 같은 '뽑는 순서'가 나오고, 코드 + 이름으로 그 사람의 판이 정해짐 (서버 없음)
 * 판: 5×5, 세로줄마다 숫자 구간이 나뉨 (75: 1~15 · 16~30 … / 50: 1~10 · 11~20 …). 75 는 가운데가 무료 칸(0)
 */
(function (root) {
  'use strict';
  var RANGES = [75, 50], GOALS = [1, 2, 3, 5, 12];   // 12 = 전체(가로 5 + 세로 5 + 대각선 2)

  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  // mulberry32 — 씨앗이 같으면 어느 기기에서나 같은 수열
  function rng(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(a, r) { r = r || Math.random; for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function seq(n) { var a = []; for (var i = 1; i <= n; i++) a.push(i); return a; }

  function normName(s) { s = String(s == null ? '' : s); if (s.normalize) s = s.normalize('NFKC'); return s.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').replace(/\s+/g, '').toLowerCase(); }
  function normCode(s) { return String(s == null ? '' : s).replace(/\D/g, '').slice(0, 5); }
  function makeCode(range, goal, r) {
    var ri = Math.max(0, RANGES.indexOf(range)), gi = GOALS.indexOf(goal); if (gi < 0) gi = 2;
    var tail = String(Math.floor((r || Math.random)() * 10000));
    while (tail.length < 4) tail = '0' + tail;
    return String(ri * 5 + gi) + tail;
  }
  function parseCode(code) {
    code = normCode(code);
    if (code.length !== 5) return null;
    var k = +code[0];
    return { code: code, range: RANGES[Math.floor(k / 5)], goal: GOALS[k % 5] };
  }
  function goalName(g) { return g >= 12 ? '전체' : g + '줄'; }

  function drawOrder(code) {
    var p = parseCode(code); if (!p) return [];
    return shuffle(seq(p.range), rng(hash('draw|' + p.code)));
  }
  function board(code, name) {
    var p = parseCode(code); if (!p) return [];
    var r = rng(hash('board|' + p.code + '|' + normName(name))), per = p.range / 5, b = new Array(25);
    for (var c = 0; c < 5; c++) {
      var col = shuffle(seq(per), r);
      for (var row = 0; row < 5; row++) b[row * 5 + c] = c * per + col[row];
    }
    if (p.range === 75) b[12] = 0;
    return b;
  }
  function colOf(num, range) { return Math.min(4, Math.floor((num - 1) / (range / 5))); }

  /* ---------- 줄 ---------- */
  var LS = {};
  function lineSets(n) {
    if (LS[n]) return LS[n];
    var L = [], i, j, a, d1 = [], d2 = [];
    for (i = 0; i < n; i++) { a = []; for (j = 0; j < n; j++) a.push(i * n + j); L.push(a); }
    for (j = 0; j < n; j++) { a = []; for (i = 0; i < n; i++) a.push(i * n + j); L.push(a); }
    for (i = 0; i < n; i++) { d1.push(i * n + i); d2.push(i * n + (n - 1 - i)); }
    L.push(d1); L.push(d2);
    return LS[n] = L;
  }
  // marks: 칸마다 true/false → {count, cells:{칸번호:true}, list:[줄 번호]}
  function lines(marks, n) {
    n = n || 5;
    var L = lineSets(n), out = { count: 0, cells: {}, list: [] };
    for (var k = 0; k < L.length; k++) {
      var ok = true;
      for (var i = 0; i < n; i++) if (!marks[L[k][i]]) { ok = false; break; }
      if (ok) { out.count++; out.list.push(k); for (i = 0; i < n; i++) out.cells[L[k][i]] = true; }
    }
    return out;
  }
  function posMap(order) { var m = {}; for (var i = 0; i < order.length; i++) m[order[i]] = i + 1; return m; }
  // 줄마다 '그 줄이 다 불리는 때'(몇 번째 번호) — 무료 칸은 0
  function lineTimes(b, order) {
    var pos = posMap(order), L = lineSets(5), t = [];
    for (var k = 0; k < L.length; k++) { var mx = 0; for (var i = 0; i < 5; i++) { var v = b[L[k][i]]; if (v) mx = Math.max(mx, pos[v] || 1e9); } t.push(mx); }
    return t;
  }
  // 이 판이 목표 줄 수에 닿는 때 (진행자가 몇 번째 번호를 뽑았을 때인지)
  function reachAt(b, order, goal) {
    var t = lineTimes(b, order).sort(function (x, y) { return x - y; });
    return t[Math.min(goal, t.length) - 1];
  }
  // 앞에서 n개 뽑았을 때의 판 상태
  function progress(b, order, n) {
    var called = {}; for (var i = 0; i < n && i < order.length; i++) called[order[i]] = true;
    var marks = b.map(function (v) { return !v || !!called[v]; });
    var l = lines(marks, 5);
    return { marks: marks, count: l.count, cells: l.cells };
  }
  // 참가자가 표시한 판으로 빙고를 외칠 때: 줄 수와 '검증 번호'(이 빙고가 가능해지는 최소 뽑은 개수). 목표에 못 미치면 need = 0
  function claim(b, marks, order, goal) {
    var full = b.map(function (v, i) { return !v || !!marks[i]; }), l = lines(full, 5);
    if (l.count < goal) return { count: l.count, need: 0, cells: l.cells };
    var t = lineTimes(b, order), mine = l.list.map(function (k) { return t[k]; }).sort(function (x, y) { return x - y; });
    return { count: l.count, need: mine[goal - 1], cells: l.cells };
  }

  /* ---------- 직접 고르는 빙고 (1~25) ---------- */
  function randomBoard(r) { return shuffle(seq(25), r); }
  function marksOf(b, called) { return b.map(function (v) { return !!called[v]; }); }
  var W = [1, 3, 9, 30, 400];
  // AI 가 부를 숫자: 자기 판만 보고 고름 (상대 판은 모름). easy = 아무거나, normal = 가끔 실수, hard = 늘 줄이 가장 잘 이어지는 숫자
  function aiPick(b, called, level, goal, r) {
    r = r || Math.random;
    var cand = []; for (var i = 0; i < 25; i++) if (!called[b[i]]) cand.push(i);
    if (!cand.length) return 0;
    if (level === 'easy' || (level === 'normal' && r() < 0.35)) return b[cand[Math.floor(r() * cand.length)]];
    var m = marksOf(b, called), L = lineSets(5), have = lines(m, 5).count, best = -1, pick = [];
    cand.forEach(function (ci) {
      var s = 0, fin = 0;
      for (var k = 0; k < L.length; k++) {
        if (L[k].indexOf(ci) < 0) continue;
        var c = 0; for (var j = 0; j < 5; j++) if (m[L[k][j]]) c++;
        s += W[c]; if (c === 4) fin++;
      }
      if (have + fin >= goal) s += 1e6;
      if (s > best) { best = s; pick = [ci]; } else if (s === best) pick.push(ci);
    });
    return b[pick[Math.floor(r() * pick.length)]];
  }
  // 방금 부른 뒤 목표에 닿은 사람들. 부른 사람이 들어 있으면 부른 사람만(먼저 외친 것으로 봄)
  function duelWinners(boards, called, goal, caller) {
    var w = [];
    boards.forEach(function (b, i) { if (lines(marksOf(b, called), 5).count >= goal) w.push(i); });
    return w.indexOf(caller) >= 0 ? [caller] : w;
  }

  var API = {
    RANGES: RANGES, GOALS: GOALS, hash: hash, rng: rng, shuffle: shuffle, seq: seq,
    normName: normName, normCode: normCode, makeCode: makeCode, parseCode: parseCode, goalName: goalName,
    drawOrder: drawOrder, board: board, colOf: colOf,
    lineSets: lineSets, lines: lines, reachAt: reachAt, progress: progress, claim: claim,
    randomBoard: randomBoard, marksOf: marksOf, aiPick: aiPick, duelWinners: duelWinners
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.BingoCore = API;
})(typeof window !== 'undefined' ? window : this);
