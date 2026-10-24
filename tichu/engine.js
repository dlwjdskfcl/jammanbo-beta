/**
 * 잠만보 티츄 — 규칙 엔진 (서버 Apps Script · 브라우저 공용, 같은 파일)
 *  - Apps Script: Engine.gs 로 붙여넣기 / GitHub: tichu/engine.js 로 같은 내용
 *  - 화면(브라우저)은 '이 카드로 낼 수 있나'를 미리 보여 주는 용도로만 쓰고, 최종 판정은 항상 서버가 합니다.
 *
 * 카드 표기
 *   일반 카드: 문양(J 옥 · S 검 · P 탑 · T 별) + 숫자(2~14, 11=J 12=Q 13=K 14=A)  예) 'J10', 'T14'
 *   특수 카드: 'MA' 참새(1) · 'DO' 개 · 'PH' 봉황 · 'DR' 용
 * 자리: 0~3 (0·2 = A팀, 1·3 = B팀). 차례는 0→1→2→3 순서, 화면에서는 다음 사람이 오른쪽.
 */
var TE = (function () {
  'use strict';

  var SUITS = ['J', 'S', 'P', 'T'];
  var SUIT_NAME = { J: '옥', S: '검', P: '탑', T: '별' };
  var TYPE_NAME = { single: '싱글', pair: '페어', triple: '트리플', full: '풀하우스', straight: '스트레이트',
    pairs: '연속 페어', bomb: '포카드 폭탄', sf: '스트레이트 플러시 폭탄', dog: '개' };

  /* ---------------- 카드 ---------------- */
  function rank(id) {
    if (id === 'MA') return 1;
    if (id === 'DO') return 0;
    if (id === 'PH') return -1;
    if (id === 'DR') return 15;
    return +id.slice(1);
  }
  function suit(id) { return id.length >= 2 && SUITS.indexOf(id[0]) >= 0 && id !== 'DO' && id !== 'DR' ? id[0] : ''; }
  function isSpecial(id) { return id === 'MA' || id === 'DO' || id === 'PH' || id === 'DR'; }
  function isCard(id) {
    if (typeof id !== 'string') return false;
    if (isSpecial(id)) return true;
    var m = /^([JSPT])(\d{1,2})$/.exec(id);
    return !!m && +m[2] >= 2 && +m[2] <= 14 && String(+m[2]) === m[2];
  }
  function points(id) {
    if (id === 'DR') return 25;
    if (id === 'PH') return -25;
    if (isSpecial(id)) return 0;
    var r = rank(id);
    return r === 5 ? 5 : (r === 10 || r === 13) ? 10 : 0;
  }
  function sumPoints(ids) { var s = 0; for (var i = 0; i < ids.length; i++) s += points(ids[i]); return s; }
  function sortKey(id) {
    if (id === 'DO') return 0;
    if (id === 'MA') return 10;
    if (id === 'PH') return 145;
    if (id === 'DR') return 150;
    return rank(id) * 10 + SUITS.indexOf(id[0]);
  }
  function sortHand(ids) { return ids.slice().sort(function (a, b) { return sortKey(a) - sortKey(b); }); }
  function deck() {
    var d = [];
    SUITS.forEach(function (s) { for (var r = 2; r <= 14; r++) d.push(s + r); });
    return d.concat(['MA', 'DO', 'PH', 'DR']);
  }
  function shuffle(a, rng) {
    rng = rng || Math.random;
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function rankLabel(r) {
    if (r === 1) return '1';
    if (r === 15) return '용';
    if (r % 1) return '봉황(' + rankLabel(Math.floor(r)) + '½)';
    return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[r] || String(r);
  }
  function cardLabel(id) {
    if (id === 'MA') return '참새'; if (id === 'DO') return '개'; if (id === 'PH') return '봉황'; if (id === 'DR') return '용';
    return SUIT_NAME[id[0]] + ' ' + rankLabel(rank(id));
  }

  /* ---------------- 조합 판정 ---------------- */
  // 봉황 없이 카드 묶음을 해석 (가상 카드 포함 가능). allowBomb=false 면 폭탄으로 보지 않음(봉황이 끼면 폭탄 불가)
  function basic(cs, allowBomb) {
    var n = cs.length, cnt = {}, ranks = [], out = [];
    cs.forEach(function (c) { if (!cnt[c.r]) { cnt[c.r] = 0; ranks.push(c.r); } cnt[c.r]++; });
    ranks.sort(function (a, b) { return a - b; });
    var lo = ranks[0], hi = ranks[ranks.length - 1], has1 = !!cnt[1];
    if (n === 2 && ranks.length === 1 && !has1) out.push({ t: 'pair', n: 2, r: hi });
    if (n === 3 && ranks.length === 1 && !has1) out.push({ t: 'triple', n: 3, r: hi });
    if (n === 4 && ranks.length === 1 && !has1 && allowBomb) out.push({ t: 'bomb', n: 4, r: hi });
    if (n === 5 && ranks.length === 2 && !has1) {
      var a = ranks[0], b = ranks[1];
      if (cnt[a] === 3 && cnt[b] === 2) out.push({ t: 'full', n: 5, r: a });
      else if (cnt[b] === 3 && cnt[a] === 2) out.push({ t: 'full', n: 5, r: b });
    }
    if (n >= 5 && ranks.length === n && hi - lo === n - 1) {
      var flush = allowBomb && !has1 && cs.every(function (c) { return c.s && c.s === cs[0].s; });
      out.push({ t: flush ? 'sf' : 'straight', n: n, r: hi });
    }
    if (n >= 4 && n % 2 === 0 && !has1 && ranks.length === n / 2 && hi - lo === n / 2 - 1 &&
        ranks.every(function (r) { return cnt[r] === 2; })) out.push({ t: 'pairs', n: n, r: hi });
    return out;
  }

  // 카드 묶음이 될 수 있는 모든 조합 해석. 봉황 싱글은 r=-1, ph=1 (값은 놓이는 자리에서 resolve 로 정함)
  function analyze(ids) {
    var n = ids.length;
    if (!n) return [];
    var seen = {};
    for (var i = 0; i < n; i++) { if (!isCard(ids[i]) || seen[ids[i]]) return []; seen[ids[i]] = 1; }
    if (seen.DO) return n === 1 ? [{ t: 'dog', n: 1, r: 0 }] : [];
    if (seen.DR) return n === 1 ? [{ t: 'single', n: 1, r: 15 }] : [];
    var hasPh = !!seen.PH;
    if (n === 1) return hasPh ? [{ t: 'single', n: 1, r: -1, ph: 1 }] : [{ t: 'single', n: 1, r: rank(ids[0]) }];
    var cs = ids.filter(function (x) { return x !== 'PH'; }).map(function (id) { return { r: rank(id), s: suit(id) }; });
    if (!hasPh) return basic(cs, true);
    var out = [], dup = {};
    for (var v = 2; v <= 14; v++) {
      basic(cs.concat([{ r: v, s: '' }]), false).forEach(function (c) {
        var k = c.t + c.n + '_' + c.r;
        if (!dup[k]) { dup[k] = 1; c.ph = 1; out.push(c); }
      });
    }
    return out;
  }

  function isBomb(c) { return !!c && (c.t === 'bomb' || c.t === 'sf'); }
  function bombPow(c) { return c.t === 'sf' ? 100 * c.n + c.r : c.r; }
  function power(c) { return isBomb(c) ? 10000 + bombPow(c) : c.r; }

  // 봉황 싱글의 값: 앞 싱글 + ½, 선으로 내면 1½
  function resolve(c, top) {
    if (c.t === 'single' && c.ph) {
      var o = {}; for (var k in c) o[k] = c[k];
      o.r = top && top.t === 'single' ? top.r + 0.5 : 1.5;
      return o;
    }
    return c;
  }

  function beats(c, top) {
    if (!c) return false;
    if (!top) return true;                       // 선: 무엇이든
    if (c.t === 'dog') return false;             // 개는 선으로만
    var cb = isBomb(c), tb = isBomb(top);
    if (cb) return !tb || bombPow(c) > bombPow(top);
    if (tb) return false;
    if (c.t !== top.t || c.n !== top.n) return false;
    if (c.t === 'single' && c.ph && top.r >= 15) return false;   // 봉황은 용을 못 이김
    return c.r > top.r;
  }

  // 이 카드들로 top 위에 낼 수 있는 가장 높은 해석 (없으면 null)
  function bestPlay(ids, top) {
    var list = analyze(ids).map(function (c) { return resolve(c, top); }).filter(function (c) { return beats(c, top); });
    if (!list.length) return null;
    list.sort(function (a, b) { return power(b) - power(a); });
    var c = list[0];
    c.c = sortHand(ids);
    return c;
  }

  function comboName(c) {
    if (!c) return '';
    if (c.t === 'dog') return '개';
    if (c.t === 'single') return c.r === 15 ? '용' : c.ph ? '봉황 (' + rankLabel(c.r) + ')' : '싱글 ' + rankLabel(c.r);
    if (c.t === 'straight') return c.n + '장 스트레이트 (~' + rankLabel(c.r) + ')';
    if (c.t === 'pairs') return '연속 페어 ' + (c.n / 2) + '쌍 (~' + rankLabel(c.r) + ')';
    if (c.t === 'sf') return '스트레이트 플러시 폭탄 ' + c.n + '장 (~' + rankLabel(c.r) + ')';
    if (c.t === 'bomb') return rankLabel(c.r) + ' 포카드 폭탄';
    if (c.t === 'full') return '풀하우스 (' + rankLabel(c.r) + ')';
    return TYPE_NAME[c.t] + ' ' + rankLabel(c.r);
  }

  /* 손패로 top 위에 낼 수 있는 조합들 (종류·장수·높이별 대표 1개씩, 봉황 사용/미사용 각각) */
  function plays(hand, top) {
    var by = {}, has = {}, out = [];
    hand.forEach(function (id) {
      has[id] = 1;
      var r = rank(id);
      if (id !== 'PH' && r >= 1 && r <= 14) (by[r] = by[r] || []).push(id);
    });
    var ph = !!has.PH;
    function cnt(r) { return by[r] ? by[r].length : 0; }
    function add(t, n, r, cards, usesPh) {
      var c = resolve({ t: t, n: n, r: r, c: cards, ph: usesPh ? 1 : 0 }, top);
      if (beats(c, top)) out.push(c);
    }
    // 싱글
    for (var r = 1; r <= 14; r++) if (cnt(r)) add('single', 1, r, [by[r][0]], false);
    if (has.DR) add('single', 1, 15, ['DR'], false);
    if (ph) add('single', 1, -1, ['PH'], true);
    if (has.DO && !top) out.push({ t: 'dog', n: 1, r: 0, c: ['DO'], ph: 0 });
    // 페어·트리플·포카드
    for (r = 2; r <= 14; r++) {
      var k = cnt(r);
      if (k >= 2) add('pair', 2, r, by[r].slice(0, 2), false); else if (k === 1 && ph) add('pair', 2, r, [by[r][0], 'PH'], true);
      if (k >= 3) add('triple', 3, r, by[r].slice(0, 3), false); else if (k === 2 && ph) add('triple', 3, r, by[r].concat(['PH']), true);
      if (k === 4) add('bomb', 4, r, by[r].slice(), false);
    }
    // 풀하우스
    for (var t = 2; t <= 14; t++) {
      var kt = cnt(t), tri, tp = false;
      if (kt >= 3) tri = by[t].slice(0, 3); else if (kt === 2 && ph) { tri = by[t].concat(['PH']); tp = true; } else continue;
      for (var p = 2; p <= 14; p++) {
        if (p === t) continue;
        var kp = cnt(p), pr, pp = false;
        if (kp >= 2) pr = by[p].slice(0, 2); else if (kp === 1 && ph && !tp) { pr = [by[p][0], 'PH']; pp = true; } else continue;
        add('full', 5, t, tri.concat(pr), tp || pp);
      }
    }
    // 스트레이트 (참새=1 가능, 봉황은 2~A 자리 하나)
    for (var hi = 5; hi <= 14; hi++) {
      for (var len = 5; len <= hi; len++) {
        var lo = hi - len + 1, miss = [];
        for (r = lo; r <= hi; r++) if (!cnt(r)) miss.push(r);
        if (miss.length > 1 || (miss.length === 1 && (!ph || miss[0] === 1))) continue;
        var cards = [];
        for (r = lo; r <= hi; r++) cards.push(cnt(r) ? by[r][0] : 'PH');
        if (!miss.length && lo >= 2) {         // 대표 카드가 우연히 같은 문양이면 폭탄이 되므로 다른 문양으로 바꿔 봄
          var s0 = suit(cards[0]);
          if (cards.every(function (x) { return suit(x) === s0; })) {
            var swapped = false;
            for (var i = 0; i < cards.length && !swapped; i++) {
              var rr = rank(cards[i]);
              for (var j = 0; j < by[rr].length; j++) if (suit(by[rr][j]) !== s0) { cards[i] = by[rr][j]; swapped = true; break; }
            }
            if (!swapped) continue;              // 같은 문양뿐이면 스트레이트 플러시(아래)로만
          }
        }
        add('straight', len, hi, cards, miss.length === 1);
      }
    }
    // 연속 페어 (2쌍 이상)
    for (hi = 3; hi <= 14; hi++) {
      for (var kk = 2; kk <= hi - 1; kk++) {
        var lo2 = hi - kk + 1, use = [], usedPh = false, ok = true;
        for (r = lo2; r <= hi && ok; r++) {
          var kr = cnt(r);
          if (kr >= 2) use.push(by[r][0], by[r][1]);
          else if (kr === 1 && ph && !usedPh) { use.push(by[r][0], 'PH'); usedPh = true; }
          else ok = false;
        }
        if (ok) add('pairs', kk * 2, hi, use, usedPh);
      }
    }
    // 스트레이트 플러시
    SUITS.forEach(function (s) {
      for (var h = 6; h <= 14; h++) {
        for (var L = 5; L <= h - 1; L++) {
          var l = h - L + 1, cs = [], okk = true;
          for (var x = l; x <= h; x++) { if (has[s + x]) cs.push(s + x); else { okk = false; break; } }
          if (okk) add('sf', L, h, cs, false);
        }
      }
    });
    return out;
  }

  function hasNatural(ids, w) { for (var i = 0; i < ids.length; i++) if (!isSpecial(ids[i]) && rank(ids[i]) === w) return true; return false; }

  /* ---------------- 게임 상태 ---------------- */
  function team(s) { return s % 2; }
  function ev(g, e) { e.n = ++g.seq; g.log.push(e); if (g.log.length > 60) g.log.splice(0, g.log.length - 60); }
  function err(m) { var e = new Error(m); e.user = true; throw e; }
  function active(g, s) { return g.hands[s] && g.hands[s].length > 0; }
  function nextActive(g, s) { for (var i = 1; i <= 4; i++) { var x = (s + i) % 4; if (active(g, x)) return x; } return -1; }
  function topCombo(g) { var p = g.trick.plays; return p.length ? p[p.length - 1].c : null; }
  function emptyTrick() { return { plays: [], last: -1, passes: 0 }; }

  function newGame(opt) {
    opt = opt || {};
    return { target: opt.target || 1000, scores: [0, 0], round: 0, phase: 'idle', history: [], log: [], seq: 0 };
  }

  function startRound(g, rng) {
    var d = shuffle(deck(), rng);
    g.round++;
    g.hands = []; g.rest = [];
    for (var i = 0; i < 4; i++) { g.hands.push(sortHand(d.slice(i * 14, i * 14 + 8))); g.rest.push(d.slice(i * 14 + 8, i * 14 + 14)); }
    g.phase = 'grand';
    g.grand = [null, null, null, null];
    g.tichu = [0, 0, 0, 0];
    g.played = [false, false, false, false];
    g.exch = [null, null, null, null];
    g.recv = [null, null, null, null];
    g.turn = -1; g.lead = -1;
    g.trick = emptyTrick();
    g.pts = [0, 0, 0, 0]; g.won = [0, 0, 0, 0];
    g.out = []; g.wish = 0; g.dragon = null; g.winner = -1;
    ev(g, { k: 'deal', round: g.round });
  }

  function actGrand(g, s, call) {
    if (g.phase !== 'grand') err('라지 티츄는 처음 8장을 받았을 때만 할 수 있어요');
    if (g.grand[s] !== null) err('이미 결정했어요');
    g.grand[s] = !!call;
    if (call) { g.tichu[s] = 2; ev(g, { k: 'tichu', s: s, kind: 2 }); }
    if (g.grand.every(function (x) { return x !== null; })) {
      for (var i = 0; i < 4; i++) g.hands[i] = sortHand(g.hands[i].concat(g.rest[i]));
      g.rest = null;
      g.phase = 'exchange';
      ev(g, { k: 'dealRest' });
    }
  }

  function canTichu(g, s) {
    return (g.phase === 'exchange' || g.phase === 'play' || g.phase === 'dragon') && g.tichu[s] === 0 && !g.played[s] && g.hands[s].length === 14;
  }
  function actTichu(g, s) {
    if (!canTichu(g, s)) err(g.tichu[s] ? '이미 티츄를 선언했어요' : '첫 카드를 내기 전에만 스몰 티츄를 선언할 수 있어요');
    g.tichu[s] = 1;
    ev(g, { k: 'tichu', s: s, kind: 1 });
  }

  // cards = [다음 사람(오른쪽)에게, 파트너에게, 이전 사람(왼쪽)에게]
  function actExchange(g, s, cards) {
    if (g.phase !== 'exchange') err('지금은 카드를 교환할 때가 아니에요');
    if (g.exch[s]) err('이미 카드를 보냈어요');
    if (!Array.isArray(cards) || cards.length !== 3) err('세 사람에게 한 장씩 골라 주세요');
    var u = {};
    cards.forEach(function (c) { if (u[c] || g.hands[s].indexOf(c) < 0) err('잘못된 카드예요'); u[c] = 1; });
    g.exch[s] = cards.slice();
    ev(g, { k: 'exch', s: s });
    if (!g.exch.every(function (x) { return !!x; })) return;
    var nh = g.hands.map(function (h, i) { return h.filter(function (c) { return g.exch[i].indexOf(c) < 0; }); });
    g.recv = [[], [], [], []];
    for (var i = 0; i < 4; i++) {
      for (var j = 0; j < 3; j++) {
        var to = (i + 1 + j) % 4;
        nh[to].push(g.exch[i][j]);
        g.recv[to].push({ f: i, c: g.exch[i][j] });
      }
    }
    g.hands = nh.map(sortHand);
    g.phase = 'play';
    for (i = 0; i < 4; i++) if (g.hands[i].indexOf('MA') >= 0) g.turn = i;
    g.lead = g.turn;
    g.trick = emptyTrick();
    ev(g, { k: 'exchDone', turn: g.turn });
  }

  // 지금 차례인 사람이 참새 콜을 반드시 지켜야 하는가 → 지켜야 하면 낼 수 있는 조합 목록, 아니면 null
  function wishPlays(g, s) {
    if (!g.wish || !hasNatural(g.hands[s], g.wish)) return null;
    var list = plays(g.hands[s], topCombo(g)).filter(function (c) { return hasNatural(c.c, g.wish); });
    return list.length ? list : null;
  }

  function actPlay(g, s, ids, wish) {
    if (g.phase !== 'play') err(g.phase === 'dragon' ? '용 트릭을 줄 사람을 먼저 정해야 해요' : '지금은 카드를 낼 수 없어요');
    if (!active(g, s)) err('이미 손패를 다 냈어요');
    if (!Array.isArray(ids) || !ids.length) err('카드를 골라 주세요');
    var u = {};
    ids.forEach(function (c) { if (u[c] || g.hands[s].indexOf(c) < 0) err('손에 없는 카드예요'); u[c] = 1; });
    var top = topCombo(g);
    var c = bestPlay(ids, top);
    if (!c) {
      if (!analyze(ids).length) err('낼 수 없는 조합이에요');
      err(isBomb(top) ? '폭탄은 더 높은 폭탄으로만 이길 수 있어요' : '앞 조합과 같은 종류·같은 장수이면서 더 높아야 해요');
    }
    var bomb = isBomb(c);
    if (g.trick.closing && !bomb) err('모두 패스했어요 · 지금은 폭탄만 낼 수 있어요');
    if (s !== g.turn) {
      if (!bomb) err('내 차례가 아니에요');
      if (!top) err('폭탄은 상대 조합 위에만 끼어들 수 있어요');
    } else if (wishPlays(g, s) && !hasNatural(ids, g.wish)) {
      err('참새 콜 [' + rankLabel(g.wish) + '] 를 낼 수 있으면 반드시 포함해서 내야 해요');
    }
    if (c.t === 'dog' && (top || s !== g.turn)) err('개는 선일 때만 낼 수 있어요');

    g.hands[s] = g.hands[s].filter(function (x) { return !u[x]; });
    g.played[s] = true;
    g.trick.plays.push({ s: s, c: c });
    g.trick.last = s;
    g.trick.passes = 0;
    if (g.trick.closing) delete g.trick.closing;
    ev(g, { k: 'play', s: s, c: c, bomb: bomb ? 1 : 0, oot: s !== g.turn ? 1 : 0 });
    if (g.wish && hasNatural(ids, g.wish)) { ev(g, { k: 'wishDone', r: g.wish, s: s }); g.wish = 0; }
    if (u.MA) {
      var w = +wish;
      if (w >= 2 && w <= 14 && w === Math.floor(w)) { g.wish = w; ev(g, { k: 'wish', s: s, r: w }); }
    }
    if (!g.hands[s].length) { g.out.push(s); ev(g, { k: 'out', s: s, place: g.out.length }); }

    if (c.t === 'dog') {
      g.trick = emptyTrick();
      var p = (s + 2) % 4;
      g.turn = active(g, p) ? p : nextActive(g, p);
      g.lead = g.turn;
      ev(g, { k: 'dog', s: s, to: g.turn });
      checkRoundEnd(g);
      return c;
    }
    if (checkRoundEnd(g)) return c;
    g.turn = nextActive(g, s);
    return c;
  }

  function actPass(g, s) {
    if (g.phase !== 'play') err('지금은 패스할 수 없어요');
    if (s !== g.turn) err('내 차례가 아니에요');
    if (!g.trick.plays.length) err('선은 패스할 수 없어요. 조합을 하나 내 주세요');
    if (wishPlays(g, s)) err('참새 콜 [' + rankLabel(g.wish) + '] 를 낼 수 있어서 패스할 수 없어요');
    g.trick.passes++;
    ev(g, { k: 'pass', s: s });
    var need = 0;
    for (var i = 0; i < 4; i++) if (i !== g.trick.last && active(g, i)) need++;
    if (g.trick.passes >= need) {
      // g.grace(서버가 켬): 바로 가져가지 않고 짧은 틈을 둠 → 그동안 누구나 폭탄 가능. 서버가 시간이 지나면 settle() 호출
      if (g.grace) { g.trick.closing = 1; g.turn = -1; ev(g, { k: 'closing', s: g.trick.last }); return; }
      return winTrick(g);
    }
    g.turn = nextActive(g, s);
  }

  // 모두 패스 뒤의 틈이 끝남 → 트릭 가져감. 틈이 아니면 아무 일 없음(false)
  function settle(g) {
    if (g.phase !== 'play' || !g.trick || !g.trick.closing) return false;
    delete g.trick.closing;
    winTrick(g);
    return true;
  }

  function winTrick(g) {
    var w = g.trick.last, top = topCombo(g);
    if (top.t === 'single' && top.r === 15) {
      g.phase = 'dragon';
      g.dragon = { seat: w, end: false };
      g.turn = w;
      ev(g, { k: 'dragonPick', s: w });
      return;
    }
    collect(g, w, w);
  }

  function collect(g, winner, to) {
    var cards = [];
    g.trick.plays.forEach(function (p) { cards = cards.concat(p.c.c); });
    var pts = sumPoints(cards);
    g.pts[to] += pts; g.won[to]++;
    ev(g, { k: 'trick', s: winner, to: to, p: pts });
    g.trick = emptyTrick();
    g.turn = active(g, winner) ? winner : nextActive(g, winner);
    g.lead = g.turn;
  }

  function actDragon(g, s, to) {
    if (g.phase !== 'dragon' || !g.dragon || g.dragon.seat !== s) err('지금은 용 트릭을 줄 때가 아니에요');
    to = +to;
    if (to !== (s + 1) % 4 && to !== (s + 3) % 4) err('용 트릭은 상대 팀에게 줘야 해요');
    var end = g.dragon.end;
    g.dragon = null;
    g.phase = 'play';
    collect(g, s, to);
    if (end) endRound(g, false);
  }

  function checkRoundEnd(g) {
    if (g.out.length === 2 && team(g.out[0]) === team(g.out[1])) { endRound(g, true); return true; }
    if (g.out.length >= 3) {
      if (g.trick.plays.length) {
        var top = topCombo(g), w = g.trick.last;
        if (top.t === 'single' && top.r === 15) {
          g.phase = 'dragon'; g.dragon = { seat: w, end: true }; g.turn = w;
          ev(g, { k: 'dragonPick', s: w });
          return true;
        }
        collect(g, w, w);
      }
      endRound(g, false);
      return true;
    }
    return false;
  }

  function endRound(g, dbl) {
    var res = { round: g.round, out: g.out.slice(), dbl: dbl, calls: [], card: [0, 0], tichu: [0, 0], total: [0, 0], last: -1, lastHand: 0 };
    if (dbl) {
      res.card[team(g.out[0])] = 200;
    } else {
      var last = -1;
      for (var s = 0; s < 4; s++) if (g.out.indexOf(s) < 0) last = s;
      var p = g.pts.slice();
      res.last = last;
      res.lastHand = sumPoints(g.hands[last]);
      res.card[1 - team(last)] += res.lastHand;      // 꼴찌 손패 → 상대 팀
      p[g.out[0]] += p[last]; p[last] = 0;           // 꼴찌가 딴 카드 → 1등
      for (s = 0; s < 4; s++) res.card[team(s)] += p[s];
    }
    for (s = 0; s < 4; s++) {
      if (!g.tichu[s]) continue;
      var ok = g.out[0] === s, v = (g.tichu[s] === 2 ? 200 : 100) * (ok ? 1 : -1);
      res.tichu[team(s)] += v;
      res.calls.push({ s: s, kind: g.tichu[s], ok: ok });
    }
    res.total = [res.card[0] + res.tichu[0], res.card[1] + res.tichu[1]];
    g.scores[0] += res.total[0]; g.scores[1] += res.total[1];
    res.scores = g.scores.slice();
    g.history.push(res);
    g.trick = emptyTrick();
    g.turn = -1; g.wish = 0;
    ev(g, { k: 'round', res: res });
    if (Math.max(g.scores[0], g.scores[1]) >= g.target && g.scores[0] !== g.scores[1]) {
      g.phase = 'gameEnd';
      g.winner = g.scores[0] > g.scores[1] ? 0 : 1;
      ev(g, { k: 'gameEnd', winner: g.winner });
    } else {
      g.phase = 'roundEnd';
    }
  }

  // 한 자리에서 본 게임 상태 (다른 사람 손패·교환 카드·남은 덱은 숨김). seat=-1 은 관전
  function view(g, seat) {
    if (!g) return null;
    var v = {
      target: g.target, scores: g.scores, round: g.round, phase: g.phase, turn: g.turn, lead: g.lead,
      trick: g.trick, wish: g.wish, out: g.out, tichu: g.tichu, played: g.played, pts: g.pts, won: g.won,
      grand: g.grand ? g.grand.map(function (x) { return x === null ? null : x; }) : null,
      exDone: g.exch ? g.exch.map(function (x) { return !!x; }) : null,
      counts: g.hands ? g.hands.map(function (h) { return h.length; }) : [0, 0, 0, 0],
      dragon: g.dragon, winner: g.winner, history: g.history, log: g.log.slice(-25), seq: g.seq,
      hand: null, myExch: null, recv: null
    };
    if (g.phase === 'grand' && g.hands) v.counts = [14, 14, 14, 14];
    if (seat >= 0 && seat < 4 && g.hands) {
      v.hand = g.hands[seat].slice();
      v.myExch = g.exch ? g.exch[seat] : null;
      v.recv = g.recv ? g.recv[seat] : null;
    }
    if (g.phase === 'roundEnd' || g.phase === 'gameEnd') v.hands = g.hands;   // 라운드가 끝나면 남은 손패 공개
    else {   // 라운드 중에는 각자 따간 점수 비공개 (점수·트릭 이벤트의 점수 숨김)
      v.pts = [0, 0, 0, 0];
      v.log = v.log.map(function (e) { if (e.k !== 'trick') return e; var c = {}; for (var k in e) if (k !== 'p') c[k] = e[k]; return c; });
    }
    return v;
  }

  var api = {
    SUITS: SUITS, SUIT_NAME: SUIT_NAME, TYPE_NAME: TYPE_NAME,
    rank: rank, suit: suit, isSpecial: isSpecial, isCard: isCard, points: points, sumPoints: sumPoints,
    sortHand: sortHand, deck: deck, shuffle: shuffle, rankLabel: rankLabel, cardLabel: cardLabel,
    analyze: analyze, resolve: resolve, beats: beats, bestPlay: bestPlay, isBomb: isBomb, bombPow: bombPow, power: power,
    comboName: comboName, plays: plays, hasNatural: hasNatural,
    team: team, active: active, nextActive: nextActive, topCombo: topCombo,
    newGame: newGame, startRound: startRound, actGrand: actGrand, canTichu: canTichu, actTichu: actTichu,
    actExchange: actExchange, wishPlays: wishPlays, actPlay: actPlay, actPass: actPass, actDragon: actDragon, settle: settle,
    view: view
  };
  return api;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = TE;
