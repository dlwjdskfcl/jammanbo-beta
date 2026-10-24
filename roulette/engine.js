/* 잠만보 순서 룰렛 — 물리 엔진 + 코스 (화면과 분리: 브라우저·Node 둘 다 동작)
 * 아이디어 참고: lazygyu/roulette(MIT, '구슬을 떨어뜨려 뽑기'). 코드·맵·그림은 하나도 가져오지 않고 새로 만듦
 *  - 원래 프로젝트는 box2d-wasm 을 쓰지만, 여기서는 구슬(원) 전용의 작은 엔진을 직접 씀 → 라이브러리 0, 파일 작음
 *  - 고정 시간 간격(1/240초) + 정적 도형 격자(broadphase) + 구슬끼리 공간 해시 → 구슬 100개도 폰에서 가벼움
 *
 * 좌표: 가로 W=440 단위, 아래로 갈수록 y 증가. 결승선(finishY)을 넘은 순서가 곧 순위.
 */
(function (root) {
  'use strict';

  var W = 440;          // 코스 너비
  var R = 9;            // 구슬 반지름
  var G = 980;          // 중력
  var VMAX = 1000;      // 속도 상한 (1스텝 이동 ≈ 4.2 < R → 벽 뚫림 없음)
  var DT = 1 / 240;     // 물리 한 스텝
  var CELL = 48;        // 정적 도형 격자 칸

  /* ---------- 난수 (시드) ---------- */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 코스 조각(모듈) v2 — 각자 높이 h, 이름, 강조색, build(c, y0, rnd) ----------
   * c.seg(ax,ay,bx,by,{t,e,kind}) · c.peg(x,y,r) · c.bumper(x,y,r) · c.spinner(x,y,len,w,arms) · c.shutter(...)
   * 원칙: 한 코스에 같은 조각은 한 번만, 조각 안에서도 같은 줄을 되풀이하지 않음. 모든 틈은 구슬 지름(18)보다 넓게(≥ 20)
   * 조각 모양은 Node 시뮬레이션(끼임·이탈·소요 시간·역전율)으로 맞춤 */
  var MOD = {
    start: { h: 240, name: '출발', color: '#7c93ff', build: function (c, y) {
      c.gate = c.seg(0, y + 222, W, y + 222, { t: 4, kind: 'gate' });
      c.spawn = { x0: 26, x1: W - 26, y0: y + 24, y1: y + 210 };
    } },

    // 핀 숲: 촘촘한 위 → 큰 핀 두 개로 갈라짐 → 성긴 아래
    pegs: { h: 440, name: '핀 숲', color: '#74c0fc', build: function (c, y) {
      var i, x, yy;
      for (i = 0; i < 4; i++) {
        yy = y + 36 + i * 44;
        for (x = i % 2 ? 52 : 28; x <= W - (i % 2 ? 52 : 28); x += 48) c.peg(x, yy, 5);
      }
      c.seg(0, y + 70, 18, y + 86, { t: 3 }); c.seg(W, y + 70, W - 18, y + 86, { t: 3 });
      c.peg(140, y + 236, 13); c.peg(W - 140, y + 236, 13);
      c.peg(W / 2, y + 268, 7); c.peg(46, y + 262, 6); c.peg(W - 46, y + 262, 6);
      for (i = 0; i < 2; i++) {
        yy = y + 324 + i * 56;
        for (x = i ? 76 : 40; x <= W - (i ? 76 : 40); x += 72) c.peg(x, yy, 5);
      }
      c.seg(0, y + 300, 22, y + 320, { t: 3 }); c.seg(W, y + 300, W - 22, y + 320, { t: 3 });
    } },

    // 슬라이드: 경사로 3개 — 길이·기울기·장애물이 모두 다름
    slide: { h: 470, name: '슬라이드', color: '#63e6be', build: function (c, y, rnd) {
      var f = rnd() < 0.5;
      function X(x) { return f ? W - x : x; }
      c.seg(X(0), y + 40, X(330), y + 96, { t: 4 }); c.peg(X(190), y + 44, 5);
      c.seg(X(W), y + 160, X(150), y + 236, { t: 4 }); c.seg(X(150), y + 236, X(132), y + 226, { t: 3 });
      c.seg(X(0), y + 300, X(210), y + 372, { t: 4 }); c.bumper(X(330), y + 352, 15);
      c.peg(X(260), y + 430, 6); c.peg(X(120), y + 440, 6);
    } },

    // 풍차: 위 두 개(서로 반대로) → 아래 큰 십자
    windmill: { h: 430, name: '풍차', color: '#ffd43b', build: function (c, y, rnd) {
      var d = rnd() < 0.5 ? 1 : -1;
      c.seg(0, y + 14, 52, y + 46, { t: 3 }); c.seg(W, y + 14, W - 52, y + 46, { t: 3 });
      c.spinner(118, y + 96, 74, 2.7 * d, 2); c.spinner(W - 118, y + 96, 74, -2.7 * d, 2);
      c.peg(W / 2, y + 92, 9); c.peg(38, y + 190, 6); c.peg(W - 38, y + 190, 6);
      c.spinner(W / 2, y + 262, 96, 1.7 * -d, 4);
      c.seg(0, y + 330, 64, y + 378, { t: 3 }); c.seg(W, y + 330, W - 64, y + 378, { t: 3 });
    } },

    // 갈림길: 가운데 벽으로 두 갈래 — 왼쪽은 계단 경사로, 오른쪽은 회전 날개 + 핀 → 다시 합쳐짐
    split: { h: 520, name: '갈림길', color: '#b197fc', build: function (c, y, rnd) {
      var f = rnd() < 0.5;
      function X(x) { return f ? W - x : x; }
      c.seg(W / 2, y + 40, 198, y + 84, { t: 4 }); c.seg(W / 2, y + 40, 242, y + 84, { t: 4 });
      c.seg(198, y + 84, 198, y + 404, { t: 4 }); c.seg(242, y + 84, 242, y + 404, { t: 4 });
      c.seg(198, y + 404, W / 2, y + 440, { t: 4 }); c.seg(242, y + 404, W / 2, y + 440, { t: 4 });
      c.seg(X(0), y + 128, X(118), y + 168, { t: 4 });           // 왼쪽(또는 오른쪽): 계단 경사로 3개
      c.seg(X(194), y + 224, X(80), y + 262, { t: 4 });
      c.seg(X(0), y + 318, X(118), y + 356, { t: 4 });
      c.spinner(X(334), y + 170, 58, f ? -3.0 : 3.0, 2);        // 반대쪽: 회전 날개 + 핀
      c.peg(X(280), y + 290, 6); c.peg(X(392), y + 290, 6); c.peg(X(336), y + 344, 7);
      c.seg(0, y + 452, 64, y + 498, { t: 3 }); c.seg(W, y + 452, W - 64, y + 498, { t: 3 });
    } },

    // 범퍼 존: 크기가 다른 범퍼 6개를 엇갈리게
    bumpers: { h: 420, name: '범퍼 존', color: '#ff8fab', build: function (c, y) {
      c.bumper(108, y + 80, 21); c.bumper(W - 120, y + 96, 17);
      c.bumper(W / 2 + 14, y + 180, 24);
      c.bumper(64, y + 262, 15); c.bumper(W - 78, y + 280, 19);
      c.bumper(W / 2 - 30, y + 352, 13);
      c.peg(W / 2, y + 56, 6); c.peg(160, y + 214, 5); c.peg(W - 150, y + 226, 5);
      c.seg(0, y + 150, 26, y + 176, { t: 3 }); c.seg(W, y + 170, W - 26, y + 196, { t: 3 });
    } },

    // 물레방아: 천천히 도는 큰 바퀴가 구슬을 실어 나름
    wheel: { h: 430, name: '물레방아', color: '#4dabf7', build: function (c, y, rnd) {
      c.seg(0, y + 20, 86, y + 74, { t: 3 }); c.seg(W, y + 20, W - 86, y + 74, { t: 3 });
      c.spinner(W / 2, y + 200, 118, (rnd() < 0.5 ? 1 : -1) * 1.15, 6);
      c.peg(40, y + 230, 6); c.peg(W - 40, y + 230, 6);
      c.seg(0, y + 350, 70, y + 400, { t: 3 }); c.seg(W, y + 350, W - 70, y + 400, { t: 3 });
    } },

    // 계단 판: 줄마다 판 개수·간격·기울기가 다름
    stairs: { h: 360, name: '계단 판', color: '#a9e34b', build: function (c, y) {
      [[[0, 60, 1], [130, 230, -1], [300, 400, 1]],
       [[60, 150, -1], [210, 300, 1], [370, 440, -1]],
       [[0, 110, 1], [180, 260, 1], [330, 440, -1]],
       [[40, 190, -1], [250, 400, 1]]].forEach(function (r, i) {
        var yy = y + 44 + i * 80;
        r.forEach(function (p) { c.seg(p[0], yy - p[2] * 9, p[1], yy + p[2] * 9, { t: 4 }); });
      });
    } },

    /* 역전 구간 — 항상 마지막. 앞선 구슬을 붙잡아 무리를 만든 뒤, 날개 3단으로 섞고, 결승선 바로 위 큰 날개가 막판을 뒤집음
     *  ① 깔때기 → ② 역전 대기문(모이면 열림) → ③ 쌍둥이 날개 → ④ 회전문(좁은 길 + 십자 날개)
     *  → ⑤ 범퍼 → ⑥ 막판 날개(GOAL 구멍을 주기적으로 막는 긴 막대) + 골인 그릇 → 결승선 */
    final: { h: 1180, name: '역전 구간', color: '#ffc94d', build: function (c, y, rnd) {
      var d = rnd() < 0.5 ? 1 : -1;
      c.finalY = y;
      // ① 깔때기 + ② 대기문
      c.seg(0, y + 30, 176, y + 220, { t: 4 }); c.seg(W, y + 30, W - 176, y + 220, { t: 4 });
      c.seg(176, y + 220, 176, y + 250, { t: 4 }); c.seg(W - 176, y + 220, W - 176, y + 250, { t: 4 });
      c.shutter(W / 2, y + 264, 112, 116, y + 140);
      c.gateY = y + 264;
      // ③ 쌍둥이 날개 (서로 반대로 돌며 좌우로 흩뿌림)
      c.spinner(W / 2 - 52, y + 344, 42, 4.2 * d, 2); c.spinner(W / 2 + 52, y + 344, 42, -4.2 * d, 2);
      c.peg(70, y + 410, 6); c.peg(W - 70, y + 410, 6);
      // ④ 회전문: 좁아지는 길 + 십자 날개 — 한 번에 하나씩 통과
      c.seg(0, y + 440, 150, y + 540, { t: 4 }); c.seg(W, y + 440, W - 150, y + 540, { t: 4 });
      c.spinner(W / 2, y + 590, 56, 2.4 * -d, 4);
      c.seg(150, y + 540, 112, y + 600, { t: 3 }); c.seg(W - 150, y + 540, W - 112, y + 600, { t: 3 });
      // ⑤ 범퍼
      c.bumper(100, y + 680, 15); c.bumper(W - 100, y + 680, 15);   // 가운데는 막판 날개가 지나가는 자리
      c.seg(0, y + 640, 24, y + 664, { t: 3 }); c.seg(W, y + 640, W - 24, y + 664, { t: 3 });
      // ⑥ 막판 날개 + 골인 그릇 (골문 앞 회전 날개 4개 — 빠르게(2.2) 돌며 입구를 차례로 쓸고 지나감)
      //  - 날개 4개, 길이 190: 아래로 향할 때 끝이 GOAL 입구에 닿음 → 입구를 주기적으로 가로막음
      //  - 그릇: 바깥쪽(±32°~64°)은 날개 끝과 틈 20(구슬이 밑으로 지나감), 입구 가까이(±32° 안)는 완만한 V 바닥이라
      //    날개 끝이 바닥 구슬을 쓸고 지나감 → 입구 앞에서 튕겨 나가거나, 날개가 지나간 직후 쏙 들어감
      //  - 수평일 때 날개 끝과 옆벽 틈 22(> 지름 18) → 벽에 끼지 않음
      var PW = 2.2, gx = W / 2, gy = y + 850, L = 190, RC = L + 34, TH = 42 * Math.PI / 180;
      c.spinner(gx, gy, L, PW * d, 4);
      c.goal = { x: gx, y: gy, L: L };
      // GOAL 구멍(안쪽 폭 약 44)은 날개 끝이 바닥에서 움직이는 방향(하류, sd) 쪽으로 SH 만큼 치우침
      //  - 상류: 완만한 V 바닥 → 날개 끝이 바닥 구슬을 쓸어 구멍으로 밀어 넣거나 튕겨 냄 (입구 = 날개 끝이 닿는 높이)
      //  - 하류: 원호 바닥이 구멍까지 이어짐(날개 끝과 틈 7, 바닥 구슬은 안 건드림) → 쓸려 넘어간 구슬도 굴러 돌아와 들어감
      //  (V 를 양쪽에 두면 날개가 빠를 때 하류 쪽 구슬이 계속 밀려 올라가 판이 안 끝남 — 시뮬레이션)
      var sd = -d, SH = 40, HW = 26, hc = gx + sd * SH, KL = 22, KW = 10;   // 문지기 날개: 길이 22, 빠르게(10)
      c.goal.hx = hc;
      var upX = hc - sd * HW, dnX = hc + sd * HW;                       // 상류·하류 쪽 입구 가장자리
      var upY = gy + Math.sqrt((L + 5) * (L + 5) - (upX - gx) * (upX - gx)) + 2;   // 상류 입구 = 날개 끝 높이
      var dnA = Math.asin(Math.abs(dnX - gx) / RC) * 180 / Math.PI, dnY = gy + Math.cos(dnA * Math.PI / 180) * RC;
      function arc(a0, a1) {                       // 아래 방향 기준 각도(도) a0 → a1 원호
        var n = Math.max(2, Math.round(Math.abs(a1 - a0) / 7)), px = 0, py = 0;
        for (var k = 0; k <= n; k++) {
          var t = (a0 + (a1 - a0) * k / n) * Math.PI / 180, x = gx + Math.sin(t) * RC, yy = gy + Math.cos(t) * RC;
          if (k) c.seg(px, py, x, yy, { t: 4 });
          px = x; py = yy;
        }
      }
      arc(sd * dnA, sd * 64);                                         // 하류: 구멍 가장자리 ~ 64°
      arc(-sd * 42, -sd * 64);                                        // 상류: 42° ~ 64°
      var vx = gx - sd * Math.sin(TH) * RC, vy = gy + Math.cos(TH) * RC;
      c.seg(vx, vy, upX, upY, { t: 4 });                              // 상류 V 바닥
      // 입구(폭 44) 아래는 넓은 방(폭 100): 방 가운데 '문지기 날개'가 빠르게 돌며 떨어지는 구슬을 결승선으로 보내거나
      // 입구 위로 다시 튕겨 올림(마지막 변수). 날개 옆 틈은 늘 21 이상이라 막히지는 않음
      var mb = Math.max(upY, dnY) + 8, CW = 50;
      c.seg(upX, upY, upX, mb, { t: 4 }); c.seg(dnX, dnY, dnX, mb, { t: 4 });
      c.seg(upX, mb, hc - sd * CW, mb + 26, { t: 4 }); c.seg(dnX, mb, hc + sd * CW, mb + 26, { t: 4 });
      c.seg(hc - CW, mb + 26, hc - CW, mb + 76, { t: 4 }); c.seg(hc + CW, mb + 26, hc + CW, mb + 76, { t: 4 });
      c.keeper = c.spinner(hc, mb + 34, KL, KW * d, 2);
      var lipB = mb + 64;
      var ex = Math.sin(64 * Math.PI / 180) * RC, ey = gy + Math.cos(64 * Math.PI / 180) * RC;
      c.seg(0, ey - 50, gx - ex, ey, { t: 4 }); c.seg(W, ey - 50, gx + ex, ey, { t: 4 });
      var hy = lipB - 20;
      c.slowY = y + 760;                         // 여기부터 '결승 직전' (깊은 슬로 모션)
      c.finishY = lipB;
      c.seg(0, y + 1176, W, y + 1176, { t: 6 });  // 바닥(안전용)
    } }
  };

  var MIDS = ['pegs', 'slide', 'windmill', 'split', 'bumpers', 'wheel', 'stairs'];
  var PRESET = {
    quick:  ['start', 'pegs', 'final'],
    normal: ['start', 'pegs', 'slide', 'windmill', 'bumpers', 'final'],
    long:   ['start', 'pegs', 'slide', 'split', 'windmill', 'wheel', 'bumpers', 'stairs', 'final']
  };

  function plan(kind, rnd) {
    if (PRESET[kind]) return PRESET[kind].slice();
    var mid = MIDS.slice();
    for (var i = mid.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = mid[i]; mid[i] = mid[j]; mid[j] = t; }
    return ['start'].concat(mid.slice(0, 4), ['final']);   // 같은 조각 두 번 안 나옴
  }

  /* ---------- 코스 만들기 ---------- */
  function buildCourse(kind, seed) {
    var rnd = rng(seed ^ 0x5bd1e995);
    var c = { W: W, segs: [], pegs: [], bumpers: [], spinners: [], shutters: [], zones: [], finalY: 0, gateY: 0, slowY: 0, gate: null, spawn: null, finishY: 0, height: 0 };
    c.seg = function (ax, ay, bx, by, o) {
      o = o || {};
      var s = { ax: ax, ay: ay, bx: bx, by: by, t: o.t || 3, e: o.e == null ? 0.42 : o.e, kind: o.kind || 'wall', on: true };
      c.segs.push(s); return s;
    };
    c.peg = function (x, y, r) { var p = { x: x, y: y, r: r, e: 0.5, flash: 0 }; c.pegs.push(p); return p; };
    c.bumper = function (x, y, r) { var b = { x: x, y: y, r: r, e: 0.6, kick: 330, flash: 0 }; c.bumpers.push(b); return b; };
    c.spinner = function (x, y, len, w, arms) { var s = { x: x, y: y, len: len, w: w, arms: arms || 2, a: 0, t: 5 }; c.spinners.push(s); return s; };
    // 역전 대기문: 가로 막대가 틈을 막고 있다가, 구슬이 need 개 모이면(또는 첫 구슬이 maxWait 초 기다리면) 열림
    //  → 앞서 온 구슬이 뒤따르는 구슬을 기다렸다가 함께 '추첨판'으로 떨어짐 = 마지막에 역전 기회
    c.shutter = function (x, y, len, travel, top) {
      var s = { x0: x, y: y, half: len / 2, travel: travel, top: top, t: 4, cx: x, vx: 0, open: 0,
                state: 0, wait: 0, timer: 0, count: 0, need: 3, maxWait: 2.2, openFor: 0.75 };
      c.shutters.push(s); return s;
    };

    var y = 0, list = plan(kind, rnd);
    for (var i = 0; i < list.length; i++) {
      var key = list[i], m = MOD[key];
      m.build(c, y, rnd);
      c.zones.push({ y: y, h: m.h, name: m.name, key: key, color: m.color });
      y += m.h;
    }
    c.height = y;
    // 양쪽 벽 (위로 조금 더 높게)
    c.seg(0, -400, 0, y, { t: 3, e: 0.3, kind: 'side' });
    c.seg(W, -400, W, y, { t: 3, e: 0.3, kind: 'side' });
    for (var k = 0; k < c.spinners.length; k++) c.spinners[k].a = rnd() * Math.PI;
    indexStatics(c);
    return c;
  }

  // 정적 도형(선분·핀·범퍼)을 격자에 넣어 둠 → 구슬 주변 칸만 검사
  function indexStatics(c) {
    var rows = Math.ceil((c.height + 400) / CELL) + 1, cols = Math.ceil(W / CELL) + 1;
    var grid = new Array(rows * cols);
    for (var i = 0; i < grid.length; i++) grid[i] = [];
    function put(obj, x0, y0, x1, y1) {
      var pad = R + 2;
      var c0 = Math.max(0, Math.floor((x0 - pad) / CELL)), c1 = Math.min(cols - 1, Math.floor((x1 + pad) / CELL));
      var r0 = Math.max(0, Math.floor((y0 + 400 - pad) / CELL)), r1 = Math.min(rows - 1, Math.floor((y1 + 400 + pad) / CELL));
      for (var r = r0; r <= r1; r++) for (var q = c0; q <= c1; q++) grid[r * cols + q].push(obj);
    }
    c.segs.forEach(function (s) { s.type = 0; put(s, Math.min(s.ax, s.bx) - s.t, Math.min(s.ay, s.by) - s.t, Math.max(s.ax, s.bx) + s.t, Math.max(s.ay, s.by) + s.t); });
    c.pegs.forEach(function (p) { p.type = 1; put(p, p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r); });
    c.bumpers.forEach(function (b) { b.type = 2; put(b, b.x - b.r, b.y - b.r, b.x + b.r, b.y + b.r); });
    c.grid = grid; c.cols = cols; c.rows = rows;
  }

  /* ---------- 세계 ---------- */
  function World(course, entries, seed) {
    this.c = course;
    this.rnd = rng(seed);
    this.t = 0;
    this.started = false;
    this.marbles = [];
    this.finished = [];
    this.events = [];       // {type, x, y, m, v} — 화면이 소리·효과에 씀
    this.stamp = 0;
    var sp = course.spawn, n = entries.length;
    // 출발 칸에 격자로 배치 (순서는 섞음 — 공정)
    var cols = Math.max(1, Math.floor((sp.x1 - sp.x0) / (2 * R + 3)));
    var slots = [];
    for (var i = 0; i < n; i++) slots.push(i);
    for (i = n - 1; i > 0; i--) { var j = Math.floor(this.rnd() * (i + 1)), t = slots[i]; slots[i] = slots[j]; slots[j] = t; }
    var rowsNeed = Math.ceil(n / cols), gap = 2 * R + 3;
    var usedCols = Math.min(cols, n), x0 = (W - (usedCols - 1) * gap) / 2;
    for (i = 0; i < n; i++) {
      var s = slots[i], col = s % cols, row = Math.floor(s / cols);
      var e = entries[i];
      this.marbles.push({
        id: i, name: e.name, label: e.label || e.name, color: e.color, key: e.key,
        x: x0 + col * gap + (this.rnd() - 0.5) * 2, y: sp.y1 - 6 - R - row * gap,
        vx: 0, vy: 0, done: false, rank: 0, at: 0,
        still: 0, ax: 0, ay: 0, best: 0, hitT: 0
      });
    }
    this._hash = new Map();
  }

  World.prototype.open = function () {
    if (this.c.gate) this.c.gate.on = false;
    this.started = true;
    var self = this;
    this.marbles.forEach(function (m) { m.vx = (self.rnd() - 0.5) * 40; });
  };

  World.prototype.remaining = function () { return this.marbles.length - this.finished.length; };

  World.prototype.shake = function () {
    var self = this;
    this.marbles.forEach(function (m) {
      if (m.done) return;
      m.vx += (self.rnd() - 0.5) * 520;
      m.vy -= 180 + self.rnd() * 260;
    });
    this.events.push({ type: 'shake' });
  };

  World.prototype.step = function () {
    var c = this.c, ms = this.marbles, i, m;
    this.t += DT;
    for (i = 0; i < c.spinners.length; i++) c.spinners[i].a += c.spinners[i].w * DT;
    for (i = 0; i < c.shutters.length; i++) this.shutterStep(c.shutters[i]);
    for (i = 0; i < c.pegs.length; i++) if (c.pegs[i].flash > 0) c.pegs[i].flash -= DT;
    for (i = 0; i < c.bumpers.length; i++) if (c.bumpers[i].flash > 0) c.bumpers[i].flash -= DT;

    // 1) 적분
    for (i = 0; i < ms.length; i++) {
      m = ms[i];
      if (m.done) continue;
      if (!this.started) { m.vy += G * DT; }
      else m.vy += G * DT;
      m.vx *= 0.9996; m.vy *= 0.9996;
      var sp2 = m.vx * m.vx + m.vy * m.vy;
      if (sp2 > VMAX * VMAX) { var k = VMAX / Math.sqrt(sp2); m.vx *= k; m.vy *= k; }
      m.x += m.vx * DT; m.y += m.vy * DT;
    }
    // 2) 충돌 (구슬끼리 2번 반복 → 쌓여도 안정)
    for (i = 0; i < ms.length; i++) if (!ms[i].done) this.collideStatic(ms[i]);
    this.collideMarbles();
    this.collideMarbles();
    for (i = 0; i < ms.length; i++) if (!ms[i].done) this.collideStatic(ms[i]);

    // 3) 결승·멈춤 감지
    for (i = 0; i < ms.length; i++) {
      m = ms[i];
      if (m.done) continue;
      if (m.y > m.best) m.best = m.y;
      if (this.started && m.y - R > c.finishY) {
        m.done = true; m.rank = this.finished.length + 1; m.at = this.t;
        this.finished.push(m);
        this.events.push({ type: 'finish', m: m, x: m.x, y: c.finishY });
        continue;
      }
      if (!this.started) continue;
      // 2.5초 동안 거의 안 움직이면 살짝 튕겨 줌 (끼임 방지)
      var dx = m.x - m.ax, dy = m.y - m.ay;
      if (dx * dx + dy * dy > 36) { m.ax = m.x; m.ay = m.y; m.still = 0; }
      else if ((m.still += DT) > 2.5) {
        m.still = 0;
        m.vx = (this.rnd() < 0.5 ? -1 : 1) * (160 + this.rnd() * 160);
        m.vy = -260 - this.rnd() * 120;
        this.events.push({ type: 'nudge', m: m, x: m.x, y: m.y });
      }
    }
  };

  // 구슬 vs 선분(캡슐)·핀·범퍼·회전 막대
  World.prototype.collideStatic = function (m) {
    var c = this.c;
    var col = Math.floor(m.x / CELL), row = Math.floor((m.y + 400) / CELL);
    if (col < 0) col = 0; if (col >= c.cols) col = c.cols - 1;
    if (row < 0 || row >= c.rows) return;
    var list = c.grid[row * c.cols + col];
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.type === 0) { if (o.on) this.capsule(m, o.ax, o.ay, o.bx, o.by, o.t, o.e, 0, 0, 0, o); }
      else this.circle(m, o);
    }
    for (i = 0; i < c.shutters.length; i++) {
      var sh = c.shutters[i];
      if (Math.abs(m.y - sh.y) > R + sh.t + 2) continue;
      this.capsule(m, sh.cx - sh.half, sh.y, sh.cx + sh.half, sh.y, sh.t, 0.3, 0, 0, 0, sh, sh.vx);
    }
    for (i = 0; i < c.spinners.length; i++) {
      var s = c.spinners[i], ddx = m.x - s.x, ddy = m.y - s.y, rr = s.len + R + s.t;
      if (ddx * ddx + ddy * ddy > rr * rr) continue;
      for (var k = 0; k < s.arms; k++) {
        var a = s.a + k * Math.PI * 2 / s.arms;
        // 막대는 가운데에서 양쪽으로 뻗음(arms=2 → 한 줄, arms=4 → 십자)
        var ex = s.x + Math.cos(a) * s.len, ey = s.y + Math.sin(a) * s.len;
        this.capsule(m, s.x, s.y, ex, ey, s.t, 0.35, s.w, s.x, s.y, s);
      }
    }
  };

  // 역전 대기문 상태: 0 닫힘(모으는 중) → 1 열림 → 다시 0. 막대는 0.16초 동안 부드럽게 미끄러짐
  World.prototype.shutterStep = function (s) {
    var ms = this.marbles, above = 0, cnt = 0, near = 0;
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i]; if (m.done || m.y > s.y) continue;
      above++;
      if (m.y > s.top) cnt++;
      else if (m.y > s.top - 420) near++;      // 깔때기로 들어오는 중인 구슬
    }
    s.count = cnt; s.need = Math.max(1, Math.min(4, above));
    if (s.state === 0) {
      s.wait = cnt ? s.wait + DT : 0;
      // 기본 maxWait(2.2초). 바로 뒤에 들어오는 구슬이 있으면 그 구슬만 조금 더(최대 3.4초) 기다려 줌 → 짧지만 접전은 유지
      var limit = near ? s.maxWait + 1.2 : s.maxWait;
      if (this.started && cnt && (cnt >= s.need || s.wait > limit)) { s.state = 1; s.timer = 0; this.events.push({ type: 'gate', x: s.x0, y: s.y, n: cnt }); }
    } else if ((s.timer += DT) > s.openFor) { s.state = 0; s.wait = 0; }
    var prev = s.cx, k0 = s.open, target = s.state;
    s.open = target ? Math.min(1, k0 + DT / 0.16) : Math.max(0, k0 - DT / 0.16);
    var e = s.open * s.open * (3 - 2 * s.open);
    s.cx = s.x0 + e * s.travel; s.vx = (s.cx - prev) / DT;
  };

  World.prototype.capsule = function (m, ax, ay, bx, by, t, e, w, cx, cy, ref, lvx) {
    var abx = bx - ax, aby = by - ay, l2 = abx * abx + aby * aby;
    var u = l2 > 0 ? ((m.x - ax) * abx + (m.y - ay) * aby) / l2 : 0;
    if (u < 0) u = 0; else if (u > 1) u = 1;
    var px = ax + abx * u, py = ay + aby * u;
    var dx = m.x - px, dy = m.y - py, d2 = dx * dx + dy * dy, rad = R + t;
    if (d2 >= rad * rad) return;
    var d = Math.sqrt(d2) || 0.0001, nx = dx / d, ny = dy / d;
    m.x += nx * (rad - d); m.y += ny * (rad - d);
    // 회전 막대면 닿은 점의 속도
    var svx = 0, svy = 0;
    if (w) { svx = -w * (py - cy); svy = w * (px - cx); }
    else if (lvx) svx = lvx;
    var rvx = m.vx - svx, rvy = m.vy - svy, vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      rvx -= (1 + e) * vn * nx; rvy -= (1 + e) * vn * ny;
      // 마찰: 접선 속도를 조금 줄임 (구르는 느낌)
      var tvx = rvx - (rvx * nx + rvy * ny) * nx, tvy = rvy - (rvx * nx + rvy * ny) * ny;
      rvx -= tvx * 0.0025; rvy -= tvy * 0.0025;
      m.vx = rvx + svx; m.vy = rvy + svy;
      if (vn < -140 && this.t - m.hitT > 0.06) { m.hitT = this.t; this.events.push({ type: w ? 'spin' : 'wall', x: px, y: py, v: -vn, m: m }); }
    }
  };

  World.prototype.circle = function (m, o) {
    var dx = m.x - o.x, dy = m.y - o.y, rad = R + o.r, d2 = dx * dx + dy * dy;
    if (d2 >= rad * rad) return;
    var d = Math.sqrt(d2) || 0.0001, nx = dx / d, ny = dy / d;
    m.x = o.x + nx * rad; m.y = o.y + ny * rad;
    var vn = m.vx * nx + m.vy * ny;
    if (vn < 0) {
      m.vx -= (1 + o.e) * vn * nx; m.vy -= (1 + o.e) * vn * ny;
      if (o.type === 2) {   // 범퍼: 바깥으로 튕김
        m.vx += nx * o.kick; m.vy += ny * o.kick;
        o.flash = 0.25;
        this.events.push({ type: 'bump', x: o.x, y: o.y, v: -vn, m: m, o: o });
      } else if (vn < -90) {
        o.flash = 0.18;
        if (this.t - m.hitT > 0.05) { m.hitT = this.t; this.events.push({ type: 'peg', x: o.x, y: o.y, v: -vn, m: m }); }
      }
    }
  };

  // 구슬끼리: 공간 해시 (칸 = 지름)
  World.prototype.collideMarbles = function () {
    var ms = this.marbles, h = this._hash, S = 2 * R, i, m;
    h.clear();
    for (i = 0; i < ms.length; i++) {
      m = ms[i]; if (m.done) continue;
      var key = (Math.floor(m.x / S) + 64) * 100000 + Math.floor((m.y + 400) / S);
      var b = h.get(key); if (b) b.push(m); else h.set(key, [m]);
    }
    var D = 2 * R, D2 = D * D;
    for (i = 0; i < ms.length; i++) {
      m = ms[i]; if (m.done) continue;
      var cx = Math.floor(m.x / S) + 64, cy = Math.floor((m.y + 400) / S);
      for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) {
        var bucket = h.get((cx + ox) * 100000 + cy + oy);
        if (!bucket) continue;
        for (var k = 0; k < bucket.length; k++) {
          var n = bucket[k];
          if (n.id <= m.id) continue;
          var dx = n.x - m.x, dy = n.y - m.y, d2 = dx * dx + dy * dy;
          if (d2 >= D2 || d2 === 0) continue;
          var d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = (D - d) * 0.5;
          m.x -= nx * pen; m.y -= ny * pen; n.x += nx * pen; n.y += ny * pen;
          var vn = (n.vx - m.vx) * nx + (n.vy - m.vy) * ny;
          if (vn < 0) {
            var j = -(1 + 0.55) * vn * 0.5;
            m.vx -= j * nx; m.vy -= j * ny; n.vx += j * nx; n.vy += j * ny;
            if (vn < -220) this.events.push({ type: 'click', x: (m.x + n.x) / 2, y: (m.y + n.y) / 2, v: -vn });
          }
        }
      }
    }
  };

  var API = { W: W, R: R, DT: DT, rng: rng, buildCourse: buildCourse, World: World, MOD: MOD, PRESET: PRESET, MIDS: MIDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.RouletteEngine = API;
})(typeof window !== 'undefined' ? window : this);
