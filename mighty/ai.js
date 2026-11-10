/* 잠만보 마이티 — AI v1.0.0 (DOM 없음 · 브라우저/Node 공용)
 *   MightyAI.choose(st, seat, level, rnd) → 그 자리의 다음 동작 {t:..., why:'이유'}   level 1 쉬움 · 2 보통 · 3 고수
 * AI 는 자기 손패와 공개 정보(나온 카드 · 무늬가 떨어진 자리 · 조커콜 반응)만 봄.
 *   쉬움 = 규칙 기반 + 가끔 아무 카드, 공약 소극적   보통 = 규칙 기반(역할 추론 · 기루다 빼기 · 점수 몰아주기)
 *   고수 = 보통 + 남의 패를 공개 정보에 맞게 여러 번 나눠 보고(몬테카를로) 판 끝까지 굴려 가장 좋은 수
 * 공약 기준 PRED 는 자동 대국으로 맞춘 값 (손패 강도 → 여당 예상 득점)
 */
(function (root) {
  'use strict';
  var E = root.MightyEngine || (typeof require === 'function' ? require('./engine.js') : null);
  var JOKER = 52, NT = 4, suitOf = E.suitOf, rankOf = E.rankOf, isPoint = E.isPoint;
  var PRED = { a: 9.8, b: 0.93 };                 // 예상 득점 = a + b × 강도 (자동 대국 회귀)
  var PRED_NT = { a: 10.2, b: 0.9 };               // 노기루다는 강도 식이 달라 따로 맞춤
  var MARGIN = { 1: 1.3, 2: 0.4, 3: 0.2 };        // 공약 = 예상 득점 − 여유
  var WORLDS = 18;                                // 고수: 한 수에 나눠 보는 세계 수

  function has(h, c) { return h.indexOf(c) >= 0; }
  function bySuit(h) { var a = [[], [], [], []]; for (var i = 0; i < h.length; i++) if (h[i] !== JOKER) a[suitOf(h[i])].push(h[i]); return a; }

  /* ---------- 손패 강도 (10장 기준) ---------- */
  function strength(h, g) {
    var m = E.mightyOf(g), S = 0, su = bySuit(h), s, i, c, r;
    if (has(h, m)) S += 2.0;
    if (has(h, JOKER)) S += g === NT ? 1.8 : 1.5;
    for (s = 0; s < 4; s++) {
      var cs = su[s].filter(function (x) { return x !== m; }), n = cs.length, rk = {};
      for (i = 0; i < n; i++) rk[rankOf(cs[i])] = 1;
      var topA = rk[14] || E.card(s, 14) === m && has(h, m);   // 이 무늬의 A 를 쥠 (마이티 포함)
      if (s === g) {
        for (i = 0; i < n; i++) { r = rankOf(cs[i]); S += 0.55 + (r === 14 ? 1.0 : r === 13 ? 0.8 : r === 12 ? 0.6 : r === 11 ? 0.4 : r === 10 ? 0.25 : 0); }
        if (n >= 5) S += 0.5 * (n - 4);
      } else if (g === NT) {
        if (rk[14]) S += 1.1;
        if (rk[13]) S += topA ? 0.8 : 0.25;
        if (rk[12] && topA && rk[13]) S += 0.6;
        if (n >= 5 && topA && rk[13]) S += 0.5 * (n - 4);
      } else {
        if (rk[14]) S += 0.9;
        if (rk[13]) S += topA ? 0.6 : (n >= 2 ? 0.25 : 0);
        if (n === 0 && su[g].length >= 3) S += 0.4;
        if (n === 1 && !rk[14] && su[g].length >= 3) S += 0.15;
      }
    }
    return S;
  }
  function predict(S, g) { return g === NT ? PRED_NT.a + PRED_NT.b * S : PRED.a + PRED.b * S; }

  /* ---------- 공약 ---------- */
  function chooseBid(st, me, level) {
    var h = st.hands[me], best = null, g;
    for (g = 0; g <= 4; g++) {
      var p = predict(strength(h, g), g), mx = Math.min(20, Math.floor(p - MARGIN[level])), need = E.minBid(st, g), q = p + (g === NT ? 0.4 : 0);   // 노기루다는 점수가 2배라 비슷하면 고름
      if (need && need <= mx && (!best || q > best.q)) best = { n: Math.max(need, mx - 1), s: g, p: p, q: q };   // 자신 있으면 한 단계 아래까지 바로 부름 (높은 공약이 점수가 큼)
    }
    if (!best) return { t: 'pass', why: '이 손패로는 지금 공약보다 높이 부르기 어려워요' };
    return { t: 'bid', n: best.n, s: best.s, why: '예상 득점 약 ' + Math.round(best.p) + '점 — ' + (best.s === NT ? '노기루다' : E.SUIT_CH[best.s] + ' 기루다') + '가 가장 좋아요' };
  }

  /* ---------- 바닥패: 버릴 3장 · 기루다 바꾸기 ---------- */
  function planKitty(h, g) {
    var m = E.mightyOf(g), su = bySuit(h), val = {}, i, c;
    for (i = 0; i < h.length; i++) {
      c = h[i];
      var s = suitOf(c), r = rankOf(c), v;
      if (c === m) v = 1000; else if (c === JOKER) v = 900; else if (s === g) v = 500 + r;
      else {
        var cs = su[s], top = 14, hold = function (x) { return has(h, E.card(s, x)); };
        while (top >= 2 && hold(top)) top--;                      // 위에서부터 이어 쥔 카드 (A, AK, AKQ…)는 이기는 카드
        if (r > top) v = 300 + r;
        else if (isPoint(c)) v = r - 9;                           // 지키기 어려운 점수 카드 → 버리면 그대로 내 점수
        else v = 20 + cs.length * 10 + r;                         // 짧은 무늬부터 비움
      }
      val[c] = v;
    }
    var order = h.slice().sort(function (a, b) { return val[a] - val[b]; }), dis = order.slice(0, 3), keep = order.slice(3);
    return { discards: dis, S: strength(keep, g) + 0.55 * E.points(dis) };
  }
  function chooseDiscard(st, me) {
    var h = st.hands[me], cur = planKitty(h, st.giruda), best = cur, bg = st.giruda, g;
    var bv = predict(cur.S, st.giruda);
    if (st.bid + 2 <= 20) for (g = 0; g <= 4; g++) {   // 바꾸면 공약 +2 → 그만큼(+여유) 더 좋아야 바꿈
      if (g === st.giruda) continue;
      var p = planKitty(h, g), v = predict(p.S, g) - 2.8;
      if (v > bv) { bv = v; best = p; bg = g; }
    }
    var a = { t: 'discard', cards: best.discards, why: '지키기 어려운 점수 카드와 짧은 무늬를 버려요' };
    if (bg !== st.giruda) { a.giruda = bg; a.why = '바닥패를 받고 보니 ' + (bg === NT ? '노기루다' : E.SUIT_CH[bg]) + ' 쪽이 훨씬 강해요 (공약 +2)'; }
    return a;
  }

  /* ---------- 프렌드 ---------- */
  function chooseFriend(st, me) {
    var h = st.hands[me], g = st.giruda, own = h.concat(st.discards), list = [E.mightyOf(g), JOKER], s, r;
    if (predict(strength(h, g), g) + 0.55 * E.points(st.discards) >= st.bid + 5.5 && st.bid <= 16) return { t: 'friend', kind: 'none', why: '혼자서도 충분한 손패예요 (성공하면 2배)' };
    if (g !== NT) { list.push(E.card(g, 14), E.card(g, 13)); }
    var su = bySuit(h), ord = [0, 1, 2, 3].filter(function (x) { return x !== g; }).sort(function (a, b) { return su[b].length - su[a].length; });
    for (r = 14; r >= 12; r--) for (s = 0; s < ord.length; s++) list.push(E.card(ord[s], r));
    if (g !== NT) for (r = 12; r >= 2; r--) list.push(E.card(g, r));
    for (s = 0; s < list.length; s++) if (!has(own, list[s])) {
      // 마이티 · 조커 · 기루다 A K 를 다 쥐었으면 부를 만한 카드가 없음 → 초구 프렌드 (첫 트릭을 내주고 딴 사람과 한편)
      if (g !== NT && s >= 4) return { t: 'friend', kind: 'first', why: '센 카드를 다 쥐고 있어 부를 카드가 마땅치 않아요 — 첫 트릭을 딴 사람을 프렌드로' };
      return { t: 'friend', kind: 'card', card: list[s], why: '내게 없는 가장 센 카드를 가진 사람을 프렌드로' };
    }
    return { t: 'friend', kind: 'none', why: '부를 카드가 없어요' };
  }

  /* ---------- 플레이: 상황 정리 ---------- */
  // roles: 굴림(playout) 안에서만 쓰는 '진짜 편' (없으면 공개 정보로 추론)
  function context(st, me, roles) {
    var g = st.giruda, d = st.declarer, h = st.hands[me], f = st.friend, i, c;
    var x = { st: st, me: me, g: g, m: E.mightyOf(g), t: st.trickNo, h: h, d: d, team: [0, 0, 0, 0, 0], unseen: [], su: bySuit(h), trumpsOut: 0 };
    for (c = 0; c < 53; c++) x.unseen.push(!st.seen[c]);
    for (i = 0; i < h.length; i++) x.unseen[h[i]] = false;
    if (me === d) for (i = 0; i < st.discards.length; i++) x.unseen[st.discards[i]] = false;
    if (g !== NT) for (c = g * 13; c < g * 13 + 13; c++) if (x.unseen[c] && c !== x.m) x.trumpsOut++;
    if (roles) x.team = roles;
    else {
      x.team[d] = 1;
      var iAmFriend = st.friendSeat === me || (f.kind === 'card' && me !== d && has(h, f.card));
      var known = iAmFriend || st.friendSeat >= 0 || f.kind !== 'card' || st.seen[f.card] || (me === d && (has(h, f.card) || has(st.discards, f.card)));
      if (st.friendSeat >= 0) x.team[st.friendSeat] = 1;
      if (iAmFriend) x.team[me] = 1;
      if (!known) {   // 프렌드가 누군지 모름 → 지금까지 한 행동으로 의심
        var sus = suspicion(st), bs = -1, bv = 1.5;
        for (i = 0; i < 5; i++) if (i !== d && i !== me && sus[i] > bv) { bv = sus[i]; bs = i; }
        if (bs >= 0) x.team[bs] = 1;
        x.guess = bs;
      }
    }
    x.my = x.team[me];
    return x;
  }
  function suspicion(st) {
    var sus = [0, 0, 0, 0, 0], d = st.declarer, g = st.giruda, k, i;
    for (k = 0; k < st.history.length; k++) {
      var tr = st.history[k], ps = tr.plays, di = -1;
      for (i = 0; i < 5; i++) if (ps[i].seat === d) di = i;
      if (tr.jokerCall) sus[tr.lead] -= 3;
      if (tr.lead !== d && k > 0 && suitOf(ps[0].card) === g) sus[tr.lead] += 1;
      for (i = 0; i < 5; i++) {
        var s = ps[i].seat, c = ps[i].card;
        if (s === d) continue;
        if (tr.winner === d && isPoint(c) && i > di) sus[s] += suitOf(c) !== tr.leadSuit ? 2 : 0.7;
        if (tr.winner === s && i > di && tr.pts >= 2) sus[s] -= 1;
      }
    }
    return sus;
  }
  function isBoss(x, c) {   // 같은 무늬에서 남들에게 더 높은 카드가 없음
    var s = suitOf(c), r = rankOf(c);
    for (var q = r + 1; q <= 14; q++) if (x.unseen[s * 13 + q - 2]) return false;
    return true;
  }
  function canRuff(x, suit, seats) {   // 그 무늬가 떨어진 '상대'가 기루다로 자를 수 있나
    if (x.g === NT || !x.trumpsOut || suit === x.g) return false;
    var st = x.st;
    for (var i = 0; i < seats.length; i++) { var s = seats[i]; if (x.team[s] !== x.my && st.voids[s][suit] && !st.voids[s][x.g]) return true; }
    return false;
  }
  function keepValue(x, c) {
    if (c === x.m) return 100;
    if (c === JOKER) return x.t <= 8 ? 90 : 0;
    var s = suitOf(c), r = rankOf(c);
    if (s === x.g) return 40 + r;
    if (isBoss(x, c)) return 30 + r;
    return (isPoint(c) ? 12 : 0) + r + x.su[s].length * 0.3;
  }
  function lowest(x, L, noPoint) {   // 버려도 가장 덜 아까운 카드
    var best = L[0], bv = 1e9;
    for (var i = 0; i < L.length; i++) { var v = keepValue(x, L[i]) + (noPoint && isPoint(L[i]) ? 30 : 0); if (v < bv) { bv = v; best = L[i]; } }
    return best;
  }
  function pickCall(x, wantG) {   // 조커를 선으로 낼 때 부를 무늬
    var ok = E.callSuits(x.st), best = ok[0], bv = -1, s, c;
    if (wantG && x.g !== NT && x.trumpsOut && ok.indexOf(x.g) >= 0) return x.g;
    for (s = 0; s < ok.length; s++) {
      var su = ok[s], n = 0;
      for (c = su * 13; c < su * 13 + 13; c++) if (x.unseen[c]) n += isPoint(c) ? 2 : 1;
      if (su === x.g && x.my === 0) n += 3;
      if (n > bv) { bv = n; best = su; }
    }
    return best;
  }

  /* ---------- 플레이: 선 ---------- */
  function lead(x) {
    var st = x.st, L = E.legalPlays(st, x.me), g = x.g, t = x.t, h = x.h, others = [0, 1, 2, 3, 4].filter(function (s) { return s !== x.me; });
    var hasJ = has(L, JOKER) && t >= 1 && t <= 8, hasM = has(L, x.m), i, c;
    var tr = g === NT ? [] : L.filter(function (c) { return suitOf(c) === g && c !== x.m; }).sort(function (a, b) { return b - a; });
    var side = L.filter(function (c) { return c !== x.m && c !== JOKER && suitOf(c) !== g && isBoss(x, c) && !canRuff(x, suitOf(c), others); })
      .sort(function (a, b) { return rankOf(b) - rankOf(a); });
    function P(c, why, extra) { var a = { t: 'play', card: c, why: why }; if (c === JOKER) a.callSuit = extra; else if (extra) a.jokerCall = true; return a; }
    function junk(why) {
      var pool = L.filter(function (c) { return c !== x.m && c !== JOKER; });
      if (!pool.length) pool = L;
      if (x.my === 0) {   // 야당: 주공이 못 자르는 긴 무늬의 낮은 카드
        var best = pool[0], bv = 1e9;
        for (i = 0; i < pool.length; i++) {
          c = pool[i];
          var s = suitOf(c), v = keepValue(x, c) + (isPoint(c) ? 30 : 0) + (s === g ? 25 : 0) + (st.voids[x.d][s] ? 15 : 0) - x.su[s].length;
          if (v < bv) { bv = v; best = c; }
        }
        return P(best, why);
      }
      c = lowest(x, pool, true);
      return c === JOKER ? P(c, why, pickCall(x, false)) : P(c, why);
    }
    if (L.length === 1) return L[0] === JOKER ? P(JOKER, '남은 카드', pickCall(x, x.my === 1)) : P(L[0], '낼 수 있는 카드가 하나뿐이에요');

    if (x.my === 1) {
      var isD = x.me === x.d;
      if (isD && t === 0 && st.friend.kind === 'first') return junk('첫 트릭을 내줘서 프렌드를 만들어요');
      if (t >= 1 && x.trumpsOut && tr.length && isBoss(x, tr[0])) return P(tr[0], '가장 높은 기루다로 야당의 기루다를 빼요');
      if (isD && hasJ && x.trumpsOut && tr.length >= 2) return P(JOKER, '조커로 기루다를 불러 야당의 기루다를 빼요', g);
      if (side.length) return P(side[0], '이 무늬에서 가장 높은 카드라 안전하게 먹어요');
      if (hasJ && (t === 8 || !isD)) return P(JOKER, '조커는 마지막 트릭엔 힘이 없어 지금 써요', pickCall(x, isD));
      if (isD) {
        if (t >= 1 && x.trumpsOut && tr.length >= 3 && tr.length * 2 >= x.trumpsOut) return P(tr[tr.length - 1], '기루다가 많으니 낮은 기루다로 야당 기루다를 줄여요');
        var f = st.friend;
        if (f.kind === 'card' && st.friendSeat < 0 && f.card !== JOKER && !st.seen[f.card] && t <= 3) {
          var fs = suitOf(f.card), cs = L.filter(function (c) { return suitOf(c) === fs && fs !== g && c !== x.m && !isPoint(c); });
          if (cs.length) return P(cs[cs.length - 1], '프렌드 카드 무늬를 낮게 내서 프렌드가 이기게 해요');
        }
        if (hasM && t >= 1 && (st.friendSeat >= 0 || t >= 5)) return P(x.m, '마이티로 확실히 한 트릭 — 프렌드가 점수를 실어 줄 수 있어요');
        if (hasJ) return P(JOKER, '조커로 선을 지켜요', pickCall(x, true));
      } else {
        if (t >= 1 && tr.length && !st.voids[x.d][g]) return P(tr[tr.length - 1], '기루다를 내서 주공이 선을 잡게 해요');
        if (hasM && t >= 1) return P(x.m, '마이티로 한 트릭 가져와요');
      }
      return junk('센 카드는 아끼고 낮은 카드로 넘겨요');
    }
    // 야당
    if (E.canJokerCall(st, x.me)) {
      var maybe = false;
      for (i = 0; i < others.length; i++) if (x.team[others[i]] === 1 && !st.noJoker[others[i]]) maybe = true;
      if (x.guess === -1 || maybe) return P(E.jokerCallOf(g), '조커콜! 조커를 힘없이 끌어내요', true);
    }
    if (side.length) return P(side[0], '이 무늬에서 가장 높은 카드라 안전하게 먹어요');
    if (hasJ) return P(JOKER, '조커로 한 트릭 가져와요', pickCall(x, false));
    if (hasM && t >= 6) return P(x.m, '마이티로 한 트릭 가져와요');
    return junk('주공이 자르기 어려운 무늬의 낮은 카드로 넘겨요');
  }

  /* ---------- 플레이: 따라 내기 ---------- */
  function follow(x) {
    var st = x.st, L = E.legalPlays(st, x.me), plays = st.trick, g = x.g, t = x.t, i, c;
    if (L.length === 1) return { t: 'play', card: L[0], why: '낼 수 있는 카드가 하나뿐이에요' };
    var jp = E.jokerPower(st), wi = E.winnerIdx(plays, g, st.leadSuit, jp), ws = plays[wi].seat, wc = plays[wi].card;
    var after = [], s = x.me;
    for (i = plays.length + 1; i < 5; i++) { s = (s + 1) % 5; after.push(s); }
    var enemyAfter = after.some(function (q) { return x.team[q] !== x.my; });
    var trickPts = 0;
    for (i = 0; i < plays.length; i++) if (isPoint(plays[i].card)) trickPts++;
    var winners = L.filter(function (c) { return E.winnerIdx(plays.concat([{ seat: x.me, card: c }]), g, st.leadSuit, jp) === plays.length; });
    function P(c, why) { return { t: 'play', card: c, why: why }; }
    function low(why) { var pool = L.filter(function (c) { return c !== x.m && !(c === JOKER && t < 9); }); return P(lowest(x, pool.length ? pool : L, true), why); }

    if (x.team[ws] === x.my) {
      var secure = wc === x.m || wc === JOKER || !enemyAfter ||
        (suitOf(wc) === g ? isBoss(x, wc) : (isBoss(x, wc) && !canRuff(x, st.leadSuit, after) && !(g !== NT && x.trumpsOut && st.leadSuit !== g && after.length >= 3)));
      if (secure) {
        var pts = L.filter(function (c) { return isPoint(c) && c !== x.m && suitOf(c) !== g && (!isBoss(x, c) || t >= 7); });
        if (pts.length) return P(lowest(x, pts, false), '우리 편이 이기는 트릭이라 점수 카드를 실어 줘요');
        return low('우리 편이 이기고 있어 낮은 카드를 내요');
      }
      // 우리 편이 이기고 있지만 뒤에 상대가 남음 → 확실한 카드가 있으면 덮어서 지킴
      var sure = winners.filter(function (c) { return c !== x.m && c !== JOKER && (suitOf(c) === g ? isBoss(x, c) : isBoss(x, c) && !canRuff(x, st.leadSuit, after)); });
      if (sure.length && trickPts >= 2) return P(lowest(x, sure, false), '뒤에 상대가 남아 있어 확실한 카드로 지켜요');
      return low('우리 편이 이기고 있어 낮은 카드를 내요');
    }
    var cheap = winners.filter(function (c) { return c !== x.m && c !== JOKER; });
    if (cheap.length) {
      if (!enemyAfter) {
        var pw = cheap.filter(isPoint);
        return P(lowest(x, pw.length ? pw : cheap, false), '가장 싼 카드로 이겨요');
      }
      var boss = cheap.filter(function (c) { return isBoss(x, c); });
      if (boss.length) return P(lowest(x, boss, false), '가장 높은 카드로 확실히 이겨요');
      if (suitOf(cheap[0]) === g && st.leadSuit !== g) return P(lowest(x, cheap, true), '무늬가 없으니 기루다로 잘라요');
      if (trickPts >= 1 || x.my === 1) return P(cheap.slice().sort(function (a, b) { return rankOf(b) - rankOf(a); })[0], '높은 카드로 이기러 가요');
    }
    var want = trickPts + after.length * 0.5 >= (x.my === 1 ? 1.5 : 2) || t >= 7;
    if (want) {
      if (has(winners, JOKER)) return P(JOKER, '점수가 걸린 트릭이라 조커로 가져와요');
      if (has(winners, x.m) && (trickPts >= 2 || t >= 7)) return P(x.m, '점수가 걸린 트릭이라 마이티로 가져와요');
    }
    return low(winners.length ? '아직 센 카드를 쓸 때가 아니에요' : '이길 수 없으니 점수 없는 낮은 카드를 버려요');
  }
  function heur(st, me, roles) { var x = context(st, me, roles); return st.trick.length ? follow(x) : lead(x); }

  /* ---------- 고수: 남의 패를 나눠 보고 끝까지 굴림 ---------- */
  function sampleWorld(st, me, rnd) {
    var d = st.declarer, g = st.giruda, m = E.mightyOf(g), pool = [], cap = [0, 0, 0, 0, 0, 0], c, i, s, tries;
    var mine = st.hands[me], f = st.friend;
    for (c = 0; c < 53; c++) if (!st.seen[c] && !has(mine, c) && !(me === d && has(st.discards, c))) pool.push(c);
    for (s = 0; s < 5; s++) if (s !== me) cap[s] = st.hands[s].length;
    if (me !== d) cap[5] = 3;
    var fc = f.kind === 'card' && st.friendSeat < 0 ? f.card : -1;
    function weight(c, s) {
      if (s === 5) return (c === m || c === JOKER || c === fc) ? 0 : suitOf(c) === g ? 0.05 : isPoint(c) ? 1.6 : 1;
      if (c !== JOKER && st.voids[s][suitOf(c)]) return 0;
      if (c === JOKER && st.noJoker[s]) return 0;
      if (c === fc) return s === d ? 0 : 1;
      if (s === d) return suitOf(c) === g ? 2.2 : (c === m || c === JOKER) ? 1.3 : 1;
      return 1;
    }
    for (tries = 0; tries < 24; tries++) {
      var left = cap.slice(), out = [[], [], [], [], [], []], ok = true, order = E.shuffle(pool.slice(), rnd);
      order.sort(function (a, b) {   // 갈 곳이 적은 카드부터
        var na = 0, nb = 0;
        for (var q = 0; q < 6; q++) { if (cap[q] && weight(a, q) > 0) na++; if (cap[q] && weight(b, q) > 0) nb++; }
        return na - nb;
      });
      for (i = 0; i < order.length && ok; i++) {
        c = order[i];
        var w = [], sum = 0;
        for (s = 0; s < 6; s++) { var v = left[s] > 0 ? weight(c, s) * left[s] : 0; w.push(v); sum += v; }
        if (sum <= 0) { ok = false; break; }
        var r = rnd() * sum;
        for (s = 0; s < 6; s++) { r -= w[s]; if (r < 0 && w[s] > 0) break; }
        if (s > 5) for (s = 5; s >= 0 && !(w[s] > 0); s--) {}
        out[s].push(c); left[s]--;
      }
      if (ok) return build(out);
    }
    // 조건을 다 맞추지 못하면 그냥 섞어서 나눔
    var sh = E.shuffle(pool.slice(), rnd), o2 = [[], [], [], [], [], []], k = 0;
    for (s = 0; s < 6; s++) for (i = 0; i < cap[s]; i++) o2[s].push(sh[k++]);
    return build(o2);
    function build(out) {
      var w = E.clone(st);
      for (var s = 0; s < 5; s++) if (s !== me) w.hands[s] = out[s];
      if (me !== d) w.discards = out[5];
      return w;
    }
  }
  function trueRoles(w) { var r = [0, 0, 0, 0, 0], f = E.friendHolder(w); r[w.declarer] = 1; if (f >= 0) r[f] = 1; return r; }
  function rollout(w, me) {
    var guard = 0;
    while (w.phase === 'play' && guard++ < 60) E.act(w, w.turn, heur(w, w.turn, trueRoles(w)));
    var r = w.result, v = (r.made - r.bid) + (r.win ? 4 : -4) + (r.win && r.made === 20 ? 2 : 0) - (!r.win && r.made <= 9 ? 2 : 0);
    return (me === r.declarer || me === r.friendSeat) ? v : -v;
  }
  function candidates(st, me, base) {
    var L = E.legalPlays(st, me), out = [], i, lead = !st.trick.length;
    for (i = 0; i < L.length; i++) {
      var c = L[i];
      if (c === JOKER && lead) { var cs = E.callSuits(st); for (var k = 0; k < cs.length; k++) out.push({ t: 'play', card: c, callSuit: cs[k] }); }
      else {
        out.push({ t: 'play', card: c });
        if (lead && c === E.jokerCallOf(st.giruda) && E.canJokerCall(st, me)) out.push({ t: 'play', card: c, jokerCall: true });
      }
    }
    return out;
  }
  function same(a, b) { return a.card === b.card && (a.callSuit == null ? -1 : a.callSuit) === (b.callSuit == null ? -1 : b.callSuit) && !!a.jokerCall === !!b.jokerCall; }
  function search(st, me, rnd, worlds) {
    var base = heur(st, me), cands = candidates(st, me, base), i, k;
    if (cands.length <= 1 || st.hands[me].length <= 1) return base;
    var sum = cands.map(function () { return 0; });
    for (k = 0; k < worlds; k++) {
      var w0 = sampleWorld(st, me, rnd);
      for (i = 0; i < cands.length; i++) {
        var w = E.clone(w0);
        E.act(w, me, cands[i]);
        sum[i] += rollout(w, me);
      }
    }
    var bi = 0, bv = -1e9;
    for (i = 0; i < cands.length; i++) { var v = sum[i] / worlds + (same(cands[i], base) ? 0.35 : 0); if (v > bv) { bv = v; bi = i; } }
    if (same(cands[bi], base)) return base;
    var a = cands[bi]; a.why = '여러 경우를 끝까지 굴려 보니 이 카드가 가장 좋았어요';
    return a;
  }

  function choosePlay(st, me, level, rnd) {
    rnd = rnd || Math.random;
    if (level >= 3) return search(st, me, rnd, WORLDS);
    var a = heur(st, me);
    if (level <= 1 && st.trick.length && rnd() < 0.22) {   // 쉬움: 가끔 생각 없이
      var L = E.legalPlays(st, me).filter(function (c) { return c !== JOKER && c !== E.mightyOf(st.giruda); });
      if (L.length) return { t: 'play', card: L[(rnd() * L.length) | 0], why: '' };
    }
    return a;
  }
  function choose(st, seat, level, rnd) {
    level = level || 2;
    if (st.phase === 'bid') return chooseBid(st, seat, level);
    if (st.phase === 'kitty') return chooseDiscard(st, seat);
    if (st.phase === 'friend') return chooseFriend(st, seat);
    if (st.phase === 'play') return choosePlay(st, seat, level, rnd);
    return null;
  }

  var A = { choose: choose, strength: strength, predict: predict, PRED: PRED, MARGIN: MARGIN, heur: heur, sampleWorld: sampleWorld, suspicion: suspicion, setWorlds: function (n) { WORLDS = n; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = A; else root.MightyAI = A;
})(typeof self !== 'undefined' ? self : this);
