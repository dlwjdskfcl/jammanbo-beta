/* 잠만보 마이티 — 규칙 엔진 v1.0.0 (DOM 없음 · 브라우저/Node 공용)
 * 한국식 5인 마이티: 53장(조커 포함) · 각 10장 + 바닥 3장 · 공약 13~20 · 주공/프렌드 대 야당 · 10트릭
 *
 * 카드 번호: 0~51 = 무늬×13 + (숫자−2)  (무늬 0♠ 1◆ 2♥ 3♣ · 숫자 2~14, J=11 Q=12 K=13 A=14), 52 = 조커. 기루다 4 = 노기루다
 * 상태(state)는 JSON 으로 그대로 저장할 수 있는 객체 하나. 모든 동작은 act(state, seat, action) 으로만 바뀜 (틀리면 Error).
 *
 *   deal({seed, starter, mult})                  새 판을 나눔 → state (점수 카드가 한 장도 없는 손이 있으면 phase 'misdeal')
 *   act(st, seat, {t:'bid', n, s} | {t:'pass'})  공약 (숫자가 높아야 함, 같은 숫자는 노기루다만 위) · 패스는 그 판 끝까지
 *   act(st, seat, {t:'discard', cards:[3], giruda})  주공이 3장 버림 (+기루다를 바꾸면 공약 +2, 노기루다로 바꾸면 +1)
 *   act(st, seat, {t:'friend', kind:'card'|'first'|'none', card})
 *   act(st, seat, {t:'play', card, callSuit, jokerCall})   조커를 선으로 내면 callSuit(0~3), 조커콜 카드를 선으로 내며 jokerCall
 *   legalPlays(st, seat) · canBid(st, n, s) · trickWinner(st, plays, ...) · result 는 st.result
 */
(function (root) {
  'use strict';
  var JOKER = 52, NT = 4;
  var SUIT_CH = ['♠', '◆', '♥', '♣'], SUIT_KO = ['스페이드', '다이아', '하트', '클로버'];
  var RANK_CH = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

  function suitOf(c) { return c === JOKER ? -1 : (c / 13) | 0; }
  function rankOf(c) { return c === JOKER ? 0 : (c % 13) + 2; }
  function card(s, r) { return s * 13 + r - 2; }
  function isPoint(c) { return c !== JOKER && (c % 13) >= 8; }
  function mightyOf(g) { return g === 0 ? card(1, 14) : card(0, 14); }
  function jokerCallOf(g) { return g === 3 ? card(0, 3) : card(3, 3); }
  function cardName(c) { return c === JOKER ? '조커' : SUIT_CH[suitOf(c)] + (RANK_CH[rankOf(c)] || rankOf(c)); }
  function points(list) { var n = 0; for (var i = 0; i < list.length; i++) if (isPoint(list[i])) n++; return n; }

  function rng(seed) {   // mulberry32
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(a, rnd) { for (var i = a.length - 1; i > 0; i--) { var j = (rnd() * (i + 1)) | 0, x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function sortHand(h, g) {   // 조커 · 마이티 · 기루다 · 나머지 무늬(♠◆♥♣) 순, 무늬 안에서는 높은 숫자부터
    var m = mightyOf(g == null ? NT : g);
    function key(c) {
      if (c === JOKER) return -3000; if (c === m) return -2000;
      var s = suitOf(c); return (s === g ? -1000 : s * 100) - rankOf(c);
    }
    return h.slice().sort(function (a, b) { return key(a) - key(b); });
  }

  function deal(o) {
    o = o || {};
    var seed = (o.seed == null ? (Math.random() * 4294967296) : o.seed) >>> 0, rnd = rng(seed), d = [], i;
    for (i = 0; i < 53; i++) d.push(i);
    shuffle(d, rnd);
    var st = {
      v: 1, seed: seed, mult: o.mult || 1, phase: 'bid', starter: o.starter || 0, turn: o.starter || 0,
      hands: [], kitty: d.slice(50), bids: [], passed: [0, 0, 0, 0, 0], high: null,
      declarer: -1, bid: 0, giruda: NT, changed: 0, discards: [], friend: null, friendSeat: -1,
      trickNo: 0, lead: -1, trick: [], leadSuit: -1, callSuit: -1, jokerCall: 0,
      taken: [[], [], [], [], []], history: [], seen: [], voids: [], noJoker: [0, 0, 0, 0, 0], result: null
    };
    for (i = 0; i < 5; i++) { st.hands.push(d.slice(i * 10, i * 10 + 10)); st.voids.push([0, 0, 0, 0]); }
    for (i = 0; i < 53; i++) st.seen.push(0);
    for (i = 0; i < 5; i++) if (!points(st.hands[i])) { st.phase = 'misdeal'; st.missSeat = i; break; }   // 딜 미스: 점수 카드 0장
    return st;
  }
  function clone(st) {
    var o = {}, k, i;
    for (k in st) o[k] = st[k];
    o.hands = []; o.taken = []; o.voids = [];
    for (i = 0; i < 5; i++) { o.hands.push(st.hands[i].slice()); o.taken.push(st.taken[i].slice()); o.voids.push(st.voids[i].slice()); }
    o.kitty = st.kitty.slice(); o.bids = st.bids.slice(); o.passed = st.passed.slice(); o.discards = st.discards.slice();
    o.trick = st.trick.slice(); o.history = st.history.slice(); o.seen = st.seen.slice(); o.noJoker = st.noJoker.slice();
    return o;
  }

  /* ---------- 공약 ---------- */
  function canBid(st, n, s) {
    if (st.phase !== 'bid' || !(n >= 13 && n <= 20) || !(s >= 0 && s <= 4) || n !== (n | 0) || s !== (s | 0)) return false;
    var h = st.high;
    return !h || n > h.n || (n === h.n && s === NT && h.s !== NT);
  }
  function minBid(st, s) {   // 이 기루다로 부를 수 있는 가장 낮은 숫자 (없으면 0)
    for (var n = 13; n <= 20; n++) if (canBid(st, n, s)) return n;
    return 0;
  }
  function nextBidder(st) {
    var alive = 0, i;
    for (i = 0; i < 5; i++) if (!st.passed[i]) alive++;
    if (!alive) { st.phase = 'allpass'; return; }
    if (st.high && alive === 1) {   // 낙찰
      var d = st.high.seat;
      st.declarer = d; st.bid = st.high.n; st.giruda = st.high.s; st.phase = 'kitty'; st.turn = d;
      st.hands[d] = st.hands[d].concat(st.kitty);
      return;
    }
    var t = st.turn;
    do { t = (t + 1) % 5; } while (st.passed[t]);
    st.turn = t;
  }

  /* ---------- 트릭 ---------- */
  function jokerPower(st) { return st.trickNo !== 0 && st.trickNo !== 9 && !st.jokerCall; }
  // plays: [{seat, card}] (낸 순서). 지금까지 낸 것 중 이기고 있는 사람의 index
  function winnerIdx(plays, g, leadSuit, jPower) {
    var m = mightyOf(g), best = -1, bv = -1, i, c, v, s;
    for (i = 0; i < plays.length; i++) {
      c = plays[i].card; s = suitOf(c);
      v = c === m ? 1000 : c === JOKER ? (jPower ? 900 : -1) : s === g ? 200 + rankOf(c) : s === leadSuit ? 100 + rankOf(c) : 0;
      if (v > bv) { bv = v; best = i; }
    }
    if (bv <= 0) {   // 힘 없는 조커가 선이고 아무도 그 무늬·기루다를 못 냄 → 처음 나온 보통 카드의 무늬로
      var fs = -1; best = 0; bv = -1;
      for (i = 0; i < plays.length; i++) {
        c = plays[i].card; if (c === JOKER) continue;
        if (fs < 0) fs = suitOf(c);
        if (suitOf(c) === fs && rankOf(c) > bv) { bv = rankOf(c); best = i; }
      }
    }
    return best;
  }
  function curWinner(st) { return st.trick.length ? st.trick[winnerIdx(st.trick, st.giruda, st.leadSuit, jokerPower(st))].seat : -1; }

  function canJokerCall(st, seat) {   // 지금 이 사람이 선으로 조커콜을 할 수 있나
    return st.phase === 'play' && st.turn === seat && !st.trick.length && st.trickNo >= 1 && st.trickNo <= 8 &&
      !st.seen[JOKER] && st.hands[seat].indexOf(jokerCallOf(st.giruda)) >= 0 && st.hands[seat].indexOf(JOKER) < 0;
  }
  function legalPlays(st, seat) {
    var h = st.hands[seat], g = st.giruda, m = mightyOf(g), out = [], i, c;
    if (st.phase !== 'play' || st.turn !== seat) return out;
    if (!st.trick.length) {
      if (st.trickNo === 0 && g !== NT) {   // 첫 트릭: 기루다를 선으로 못 냄 (기루다뿐이면 가능)
        var real = 0;
        for (i = 0; i < h.length; i++) if (suitOf(h[i]) !== g) { out.push(h[i]); if (h[i] !== JOKER) real++; }
        if (real) return out;   // 기루다 아닌 (조커 말고) 카드가 있으면 그것 · 조커 + 기루다뿐이면 기루다도 가능
      }
      return h.slice();
    }
    if (st.jokerCall && h.indexOf(JOKER) >= 0) {   // 조커콜: 조커를 내야 함 (마이티로 대신할 수 있음)
      out.push(JOKER); if (h.indexOf(m) >= 0) out.push(m);
      return out;
    }
    var L = st.leadSuit, has = false;
    for (i = 0; i < h.length; i++) if (suitOf(h[i]) === L) { has = true; break; }
    if (!has) return h.slice();
    for (i = 0; i < h.length; i++) { c = h[i]; if (suitOf(c) === L || c === m || c === JOKER) out.push(c); }
    return out;
  }
  // 조커를 선으로 낼 때 부를 수 있는 무늬
  function callSuits(st) { var a = []; for (var s = 0; s < 4; s++) if (!(st.trickNo === 0 && s === st.giruda)) a.push(s); return a; }

  function friendHolder(st) {   // 진짜 프렌드 자리 (아직 안 드러났어도) — 없으면 −1
    if (st.friendSeat >= 0) return st.friendSeat;
    if (!st.friend || st.friend.kind !== 'card') return -1;
    for (var i = 0; i < 5; i++) if (i !== st.declarer && st.hands[i].indexOf(st.friend.card) >= 0) return i;
    return -1;
  }
  function rulingPoints(st) {
    var n = points(st.discards);
    if (st.declarer >= 0) n += st.taken[st.declarer].length;
    if (st.friendSeat >= 0) n += st.taken[st.friendSeat].length;
    return n;
  }

  function changeCost(st, g) { return g === NT ? 1 : 2; }   // 기루다를 바꿀 때 공약이 오르는 만큼: 노기루다로 +1, 다른 무늬로 +2
  function finish(st) {
    var d = st.declarer, f = st.friendSeat, made = rulingPoints(st), bid = st.bid, win = made >= bid;
    var base = win ? (made - bid) + (bid - 13) * 2 : bid - made;
    var tags = [], mult = 1;
    if (win && made === 20) { mult *= 2; tags.push('런'); }
    if (!win && made <= 9) { mult *= 2; tags.push('백런'); }
    if (st.giruda === NT) { mult *= 2; tags.push('노기루다'); }
    if (st.friend.kind === 'none') { mult *= 2; tags.push('노프렌드'); }
    if (st.mult > 1) { mult *= st.mult; tags.push('배판×' + st.mult); }
    var u = base * mult * (win ? 1 : -1), delta = [0, 0, 0, 0, 0], i;
    for (i = 0; i < 5; i++) delta[i] = i === d ? (f < 0 ? 4 * u : 2 * u) : i === f ? u : -u;
    st.result = { win: win, made: made, bid: bid, giruda: st.giruda, declarer: d, friendSeat: f, base: base, mult: mult, tags: tags, unit: u, delta: delta };
    st.phase = 'done'; st.turn = -1;
  }

  /* ---------- 동작 ---------- */
  function fail(m) { throw new Error('mighty: ' + m); }
  function act(st, seat, a) {
    if (!a || st.turn !== seat) fail('차례가 아님');
    var h = st.hands[seat], i, c;
    if (st.phase === 'bid') {
      if (a.t === 'pass') { st.passed[seat] = 1; st.bids.push({ seat: seat, pass: 1 }); }
      else if (a.t === 'bid') {
        if (!canBid(st, a.n, a.s)) fail('낼 수 없는 공약');
        st.high = { seat: seat, n: a.n, s: a.s }; st.bids.push({ seat: seat, n: a.n, s: a.s });
      } else fail('공약 단계');
      nextBidder(st);
      return st;
    }
    if (st.phase === 'kitty') {
      if (a.t !== 'discard' || !a.cards || a.cards.length !== 3) fail('3장을 버려야 함');
      var nh = h.slice();
      for (i = 0; i < 3; i++) { var k = nh.indexOf(a.cards[i]); if (k < 0) fail('없는 카드'); nh.splice(k, 1); }
      if (a.giruda != null && a.giruda !== st.giruda) {
        if (!(a.giruda >= 0 && a.giruda <= 4) || st.bid + changeCost(st, a.giruda) > 20) fail('기루다를 바꿀 수 없음');
        st.bid += changeCost(st, a.giruda); st.giruda = a.giruda; st.changed = 1;
      }
      st.hands[seat] = nh; st.discards = a.cards.slice(); st.phase = 'friend';
      return st;
    }
    if (st.phase === 'friend') {
      if (a.t !== 'friend') fail('프렌드 단계');
      if (a.kind === 'card') { if (!(a.card >= 0 && a.card <= 52) || a.card !== (a.card | 0)) fail('프렌드 카드'); st.friend = { kind: 'card', card: a.card }; }
      else if (a.kind === 'first' || a.kind === 'none') st.friend = { kind: a.kind };
      else fail('프렌드 종류');
      st.phase = 'play'; st.trickNo = 0; st.lead = seat; st.trick = [];
      return st;
    }
    if (st.phase !== 'play' || a.t !== 'play') fail('플레이 단계가 아님');
    c = a.card;
    if (legalPlays(st, seat).indexOf(c) < 0) fail('낼 수 없는 카드 ' + cardName(c));
    var g = st.giruda, m = mightyOf(g);
    if (!st.trick.length) {
      st.lead = seat; st.jokerCall = 0; st.callSuit = -1;
      if (c === JOKER) {
        if (callSuits(st).indexOf(a.callSuit) < 0) fail('조커 무늬 지정');
        st.callSuit = a.callSuit; st.leadSuit = a.callSuit;
      } else {
        st.leadSuit = suitOf(c);
        if (a.jokerCall) { if (c !== jokerCallOf(g) || !canJokerCall(st, seat)) fail('조커콜 불가'); st.jokerCall = 1; }
      }
    } else if (c !== JOKER && c !== m) {
      if (suitOf(c) !== st.leadSuit) st.voids[seat][st.leadSuit] = 1;
      if (st.jokerCall) st.noJoker[seat] = 1;
    }
    h.splice(h.indexOf(c), 1);
    st.seen[c] = 1;
    st.trick.push({ seat: seat, card: c });
    if (st.friend.kind === 'card' && c === st.friend.card && seat !== st.declarer) st.friendSeat = seat;
    if (st.trick.length < 5) { st.turn = (seat + 1) % 5; return st; }
    var w = st.trick[winnerIdx(st.trick, g, st.leadSuit, jokerPower(st))].seat, pts = [];
    for (i = 0; i < 5; i++) if (isPoint(st.trick[i].card)) { pts.push(st.trick[i].card); st.taken[w].push(st.trick[i].card); }
    st.history.push({ lead: st.lead, plays: st.trick, winner: w, leadSuit: st.leadSuit, callSuit: st.callSuit, jokerCall: st.jokerCall, pts: pts.length });
    if (st.trickNo === 0 && st.friend.kind === 'first' && w !== st.declarer) st.friendSeat = w;
    st.trick = []; st.jokerCall = 0; st.callSuit = -1; st.leadSuit = -1; st.trickNo++;
    if (st.trickNo >= 10) finish(st); else { st.turn = w; st.lead = w; }
    return st;
  }

  var E = {
    JOKER: JOKER, NT: NT, SUIT_CH: SUIT_CH, SUIT_KO: SUIT_KO,
    suitOf: suitOf, rankOf: rankOf, card: card, isPoint: isPoint, points: points, mightyOf: mightyOf, jokerCallOf: jokerCallOf,
    cardName: cardName, rng: rng, shuffle: shuffle, sortHand: sortHand, deal: deal, clone: clone,
    changeCost: changeCost, canBid: canBid, minBid: minBid, legalPlays: legalPlays, callSuits: callSuits, canJokerCall: canJokerCall,
    winnerIdx: winnerIdx, curWinner: curWinner, jokerPower: jokerPower, friendHolder: friendHolder, rulingPoints: rulingPoints, act: act
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = E; else root.MightyEngine = E;
})(typeof self !== 'undefined' ? self : this);
