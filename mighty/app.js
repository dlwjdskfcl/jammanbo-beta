/* 잠만보 마이티 — 화면 (사람 1명 + AI 4명, 서버 없음). 규칙은 engine.js, 봇은 ai.js
 * 기기 저장: jmb_mighty_save(진행 중인 게임) · jmb_mighty_set(설정) · jmb_mighty_stats(전적) */
(function () {
  'use strict';
  var VER = '1.0.1';
  var E = window.MightyEngine, AI = window.MightyAI, FX = window.JMB_FX, ARC = window.JMB_ARCADE;
  var ROOT = (function () { var seg = location.pathname.split('/')[1] || ''; return /\.github\.io$/.test(location.hostname) && seg ? '/' + seg + '/' : '/'; })();
  var LS = { save: 'jmb_mighty_save', set: 'jmb_mighty_set', stats: 'jmb_mighty_stats' };
  var JOKER = E.JOKER, NT = E.NT, ME = 0;
  var NICK = ''; try { NICK = ARC ? ARC.nick() : ''; } catch (e) {}
  var NAMES = [NICK || '나', '도토리', '모카', '솔방울', '호두'];   // 로그인돼 있으면 잠만보 닉네임
  var LEVELS = ['', '쉬움', '보통', '고수'];
  var THINK = [1000, 600, 260], HOLD = [2200, 1400, 750];   // 속도: 느림 · 보통 · 빠름 (AI 한 수 · 트릭 보여 주기)
  var VS = '︎';   // 무늬를 그림 글자(이모지)가 아닌 글자로

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  var SET = lsGet(LS.set, null) || {};
  if (!(SET.speed >= 0 && SET.speed <= 2)) SET.speed = 1;
  if (!(SET.level >= 1 && SET.level <= 3)) SET.level = 2;
  if (SET.sound == null) SET.sound = 1;
  if (SET.oneTap == null) SET.oneTap = 0;
  var STATS = lsGet(LS.stats, null) || { n: 0, win: 0, d: 0, dw: 0, f: 0, fw: 0, o: 0, ow: 0, sum: 0, best: 0 };
  if (!(STATS.streak >= 0)) STATS.streak = 0;   // 랭킹용 연승 (AI 고수 · 힌트 없이 이긴 판)
  var G = null;                      // 진행 중인 게임 {v, st, scores, rounds, roundNo, starter, mult, hold, notice, recorded}
  var UI = { view: 'home', sel: [], pend: null, bn: 13, bs: 0, kg: null, fr: null, hintCard: -1, anim: '', turnKey: '' };
  var T = 0, toastT = 0, selfPop = 0, modalHist = false;

  /* ---------- 소리 (Web Audio 합성) · 진동 ---------- */
  var AC = null;
  function tone(f, d, type, vol, when) {
    if (!SET.sound) return;
    try {
      if (!AC) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return; AC = new C(); }
      if (AC.state === 'suspended') AC.resume();
      var o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + (when || 0);
      o.type = type || 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.08, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d + 0.02);
    } catch (e) {}
  }
  var SND = {
    card: function () { tone(420, 0.07, 'triangle', 0.07); },
    turn: function () { tone(880, 0.09, 'sine', 0.06); },
    take: function () { tone(520, 0.08, 'triangle', 0.06); tone(700, 0.1, 'triangle', 0.06, 0.07); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.16, 'triangle', 0.08, i * 0.11); }); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { tone(f, 0.2, 'sine', 0.07, i * 0.14); }); },
    alert: function () { tone(660, 0.1, 'square', 0.04); tone(660, 0.1, 'square', 0.04, 0.14); }
  };
  var touched = false;   // 브라우저는 화면을 한 번 누른 뒤에만 진동을 허용함
  document.addEventListener('pointerdown', function () { touched = true; }, true);
  function haptic(k) { if (FX && touched) try { FX.haptic(k); } catch (e) {} }

  /* ---------- 작은 도구 ---------- */
  function hideToast() { var el = $('toast'); if (el) el.classList.remove('on'); clearTimeout(toastT); }   // 카드를 내면 지난 알림(힌트 등)을 바로 지움
  function toast(msg, ms) {
    var el = $('toast'); el.textContent = msg; el.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('on'); }, ms || 2600);
  }
  function suitTxt(s) { return s === NT ? '노기루다' : E.SUIT_CH[s] + VS; }
  function suitH(s) { return s === NT ? '<span class="su4">NT</span>' : '<span class="su' + s + '">' + E.SUIT_CH[s] + VS + '</span>'; }
  function bidH(n, s) { return suitH(s) + ' ' + n; }
  function bidTxt(n, s) { return (s === NT ? '노기루다' : E.SUIT_CH[s] + VS) + ' ' + n; }
  function rankTxt(r) { return r === 14 ? 'A' : r === 13 ? 'K' : r === 12 ? 'Q' : r === 11 ? 'J' : String(r); }
  function cardTxt(c) { return c === JOKER ? '조커' : E.SUIT_CH[E.suitOf(c)] + VS + rankTxt(E.rankOf(c)); }
  function cardSpan(c) { return c === JOKER ? '<span class="su5">조커</span>' : '<span class="su' + E.suitOf(c) + '">' + cardTxt(c) + '</span>'; }
  function gir() { var st = G && G.st; return st && st.declarer >= 0 ? st.giruda : null; }
  function av(i, px) { return FX ? '<span class="av">' + FX.avatar(i === ME ? (NICK || '잠만보 나') : NAMES[i], px || 34) + '</span>' : ''; }
  function sign(n) { return (n > 0 ? '+' : '') + n; }
  function cardH(c, o) {
    o = o || {};
    var g = o.g === undefined ? gir() : o.g, cls = 'card', inner, tagName = o.btn ? 'button' : 'span';
    if (c === JOKER) { cls += ' jk'; inner = '<i class="r">★</i><i class="big">JOKER</i>'; }
    else {
      var s = E.suitOf(c), ch = E.SUIT_CH[s] + VS;
      cls += ' s' + s; if (g != null && s === g) cls += ' tr';
      inner = '<i class="r">' + rankTxt(E.rankOf(c)) + '</i><i class="s">' + ch + '</i><i class="big">' + ch + '</i>';
      if (g != null && c === E.mightyOf(g)) { cls += ' mi'; inner += '<em class="tag">마이티</em>'; }
      else if (g != null && c === E.jokerCallOf(g) && !o.sm) inner += '<em class="tag">조커콜</em>';
    }
    if (o.sm) cls += ' sm';
    if (o.cls) cls += ' ' + o.cls;
    return '<' + tagName + (o.btn ? ' type="button" data-a="card" data-c="' + c + '"' : '') + ' class="' + cls + '" aria-label="' + cardTxt(c) + '">' + inner + '</' + tagName + '>';
  }

  /* ---------- 저장 ---------- */
  function save() { if (G) lsSet(LS.save, G); }
  function load() {
    var g = lsGet(LS.save, null);
    if (!g || g.v !== 1 || !g.st || !g.st.hands || g.st.hands.length !== 5 || !g.scores) return null;
    return g;
  }

  /* ---------- 게임 흐름 ---------- */
  function newGame() {
    G = { v: 1, st: null, scores: [0, 0, 0, 0, 0], rounds: [], roundNo: 0, starter: (Math.random() * 5) | 0, mult: 1, hold: null, notice: '', recorded: false, rlv: SET.level, hinted: 0, rank: null };
    nextRound();
  }
  function resetUI() { UI.sel = []; UI.pend = null; UI.kg = null; UI.fr = null; UI.hintCard = -1; UI.bn = 13; }
  function nextRound() {
    G.roundNo++; G.recorded = false; G.hold = null; G.notice = ''; G.rlv = SET.level; G.hinted = 0; G.rank = null;
    G.st = E.deal({ starter: G.starter, mult: G.mult });
    resetUI(); closeModal(); save(); render(); pump();
  }
  function redeal() {
    var st = G.st;
    G.mult = Math.min(4, G.mult * 2);
    if (st.phase === 'allpass') G.starter = (G.starter + 1) % 5;
    G.notice = ''; G.st = E.deal({ starter: G.starter, mult: G.mult });
    resetUI(); save(); render(); pump();
  }
  function pump() {
    clearTimeout(T);
    if (UI.view !== 'game' || !G) return;
    var st = G.st, sp = SET.speed;
    if (G.hold) { T = setTimeout(endHold, HOLD[sp]); return; }
    if (st.phase === 'misdeal' || st.phase === 'allpass') {
      if (!G.notice) {
        G.notice = st.phase === 'misdeal' ? (st.missSeat === ME ? '내' : NAMES[st.missSeat] + ' 님의') + ' 손에 점수 카드가 한 장도 없어요 (딜 미스)' : '모두 패스했어요';
        SND.alert(); render();
      }
      T = setTimeout(redeal, 2600);
      return;
    }
    if (st.phase === 'done') { finishRound(); return; }
    if (st.turn !== ME) { T = setTimeout(aiMove, st.phase === 'play' ? THINK[sp] : THINK[sp] * 0.8); return; }
    var key = G.roundNo + ':' + st.phase + ':' + st.trickNo + ':' + st.bids.length;
    if (UI.turnKey !== key) { UI.turnKey = key; haptic('turn'); SND.turn(); }
    if (st.phase === 'play' && st.hands[ME].length === 1) {   // 마지막 한 장은 알아서
      T = setTimeout(function () { tryPlay(st.hands[ME][0]); }, THINK[sp]);
    }
  }
  function endHold() { G.hold = null; save(); render(); pump(); }
  function aiMove() {
    var st = G.st, seat = st.turn, a;
    if (seat === ME || seat < 0) return;
    try { a = AI.choose(st, seat, SET.level); } catch (e) { a = null; }
    if (!a) a = fallback(st, seat);
    doAct(seat, a);
  }
  function fallback(st, seat) {   // 혹시 AI 가 답을 못 내면 규칙에 맞는 아무 수
    if (st.phase === 'bid') return { t: 'pass' };
    if (st.phase === 'kitty') return { t: 'discard', cards: st.hands[seat].slice(-3) };
    if (st.phase === 'friend') return { t: 'friend', kind: 'none' };
    var c = E.legalPlays(st, seat)[0], a = { t: 'play', card: c };
    if (c === JOKER && !st.trick.length) a.callSuit = E.callSuits(st)[0];
    return a;
  }
  function doAct(seat, a) {
    var st = G.st, hl = st.history.length, fs = st.friendSeat, ph = st.phase, lead = !st.trick.length;
    try { E.act(st, seat, a); } catch (e) { if (seat === ME) toast('그 수는 둘 수 없어요'); else { try { E.act(st, seat, fallback(st, seat)); } catch (e2) { return; } } }
    UI.sel = []; UI.pend = null; UI.hintCard = -1;
    var who = seat === ME ? '나' : NAMES[seat] + ' 님';
    if (ph === 'play') {
      SND.card();
      if (a.jokerCall) { toast('🃏 ' + who + ': 조커콜!'); SND.alert(); haptic('warn'); }
      else if (a.card === JOKER && lead) toast('★ ' + who + ': 조커! ' + suitTxt(a.callSuit) + ' 나와!');
      if (st.friendSeat >= 0 && fs < 0) { toast('🤝 ' + (st.friendSeat === ME ? '내가' : NAMES[st.friendSeat] + ' 님이') + ' 프렌드!', 3000); haptic('turn'); SND.take(); }
      if (st.history.length > hl) { G.hold = st.history[st.history.length - 1]; if (G.hold.pts) SND.take(); }
    } else if (ph === 'bid' && st.phase === 'kitty') {
      toast('👑 ' + (st.declarer === ME ? '내가' : NAMES[st.declarer] + ' 님이') + ' 주공 — 공약 ' + bidTxt(st.bid, st.giruda), 3000);
      UI.kg = st.giruda;
    } else if (ph === 'kitty') {
      if (st.changed) toast('기루다를 ' + suitTxt(st.giruda) + '(으)로 바꿨어요 — 공약 ' + st.bid, 3000);
    } else if (ph === 'friend') {
      toast('프렌드: ' + friendTxt(st), 3000);
    }
    save(); render(); pump();
  }
  function friendTxt(st) {
    var f = st.friend; if (!f) return '';
    if (f.kind === 'none') return '노프렌드';
    if (f.kind === 'first') return '초구 프렌드 (첫 트릭을 딴 사람)';
    return cardTxt(f.card) + (f.card === E.mightyOf(st.giruda) ? ' (마이티)' : '');
  }
  function finishRound() {
    var st = G.st, r = st.result, i;
    if (!G.recorded) {
      for (i = 0; i < 5; i++) G.scores[i] += r.delta[i];
      G.rounds.push({ no: G.roundNo, d: r.declarer, f: r.friendSeat, bid: r.bid, g: r.giruda, made: r.made, win: r.win, delta: r.delta, tags: r.tags });
      if (G.rounds.length > 200) G.rounds.shift();
      G.starter = r.declarer; G.mult = 1; G.recorded = true;
      var role = r.declarer === ME ? 'd' : r.friendSeat === ME ? 'f' : 'o', won = r.delta[ME] > 0;
      STATS.n++; STATS[role]++; if (won) { STATS.win++; STATS[role + 'w']++; }
      STATS.sum += r.delta[ME]; STATS.best = Math.max(STATS.best || 0, r.delta[ME]);
      rankRound(r, role, won);
      lsSet(LS.stats, STATS); save();
      if (won) { SND.win(); haptic('win'); if (FX) try { FX.confetti({ count: r.delta[ME] >= 8 ? 120 : 60 }); } catch (e) {} }
      else SND.lose();
    }
    render(); showResult();
  }

  /* ---------- 모임 랭킹 (오락실 arcade.js): AI 고수 · 힌트 없이 한 판만 ---------- */
  function ranked() { return G.rlv === 3 && SET.level === 3 && !G.hinted; }
  function rankRound(r, role, won) {
    var ok = ranked(), sc = r.delta[ME];
    if (!ok || !won) { STATS.streak = 0; G.rank = { ok: ok, streak: 0 }; return; }
    STATS.streak++;
    G.rank = { ok: true, streak: STATS.streak, score: sc };
    if (!ARC) return;
    var note = ((role === 'd' ? '주공 ' : role === 'f' ? '프렌드 ' : '야당 ') + (r.giruda === NT ? 'NT' : E.SUIT_CH[r.giruda]) + r.bid + (r.tags.length ? ' ' + r.tags.join(' ') : '')).slice(0, 40);
    try {
      ARC.report('mighty', 'streak', STATS.streak, note);
      setTimeout(function () { try { ARC.report('mighty', 'score', sc, note, { quiet: true }); } catch (e) {} }, 3500);   // 서버가 3초 간격을 요구
    } catch (e) {}
  }
  function abandon() {   // 판 도중에 새 게임으로 버리면 연승이 끊김 (유리한 판만 남기지 못하게)
    var g = load();
    if (g && g.st.phase !== 'done' && STATS.streak) { STATS.streak = 0; lsSet(LS.stats, STATS); }
  }

  /* ---------- 뒤로가기 (안드로이드 뒤로 · 아이폰 스와이프): 창 닫기 → 게임 중이면 첫 화면 → 첫 화면이면 나가기 ----------
   * history 에 'game'(게임 화면) · 'modal'(창) 칸을 쌓음. 결과 창은 칸을 안 쌓음(뒤로 = 첫 화면). 랭킹 창은 arcade.js 가 {jarc:1} 을 따로 쌓고 닫음 */
  function hs() { return (history.state && history.state.mg) || ''; }
  function hpush(k) { try { history.pushState({ mg: k }, ''); } catch (e) {} }
  function hback(n) { if (!n) return; selfPop++; try { history.go(-n); } catch (e) { selfPop--; } }
  function fixHist() {   // 화면과 history 칸을 맞춤 (한 번에 한 가지)
    if (history.state && history.state.jarc) return;
    var k = hs(), open = !!$('modal').innerHTML && modalHist;
    if (UI.view === 'game' && !k) hpush('game');
    else if (UI.view === 'home' && k === 'game') hback(1);
    else if (open && k !== 'modal') hpush('modal');
    else if (!open && k === 'modal') hback(1);
  }
  function enterGame() { UI.view = 'game'; if (!hs()) hpush('game'); }
  window.addEventListener('popstate', function () {
    if (selfPop > 0) { selfPop--; fixHist(); return; }   // 내가 부른 뒤로가기
    if (history.state && history.state.jarc) return;
    var k = hs();
    if (k === 'modal') return;                            // 랭킹 창만 닫힌 경우
    if (k === 'game') {
      if (UI.view !== 'game') { G = G || load(); if (G) { UI.view = 'game'; resetUI(); render(); pump(); } else hback(1); return; }   // 앞으로 가기
      if ($('modal').innerHTML && modalHist) { closeModal(true); if (G && G.st.phase === 'done') showResult(); else pump(); }
      return;
    }
    if (UI.view === 'game') goHome(true); else closeModal(true);
  });

  /* ---------- 역할 표시 ---------- */
  function iHoldFriend(st) { var f = st.friend; return !!f && f.kind === 'card' && st.declarer !== ME && st.hands[ME].indexOf(f.card) >= 0; }
  function friendKnown(st) {
    var f = st.friend; if (!f) return false;
    if (st.friendSeat >= 0 || st.phase === 'done' || f.kind === 'none') return true;
    if (f.kind === 'first') return st.trickNo > 0;
    if (st.seen[f.card]) return true;
    return st.declarer === ME && (st.hands[ME].indexOf(f.card) >= 0 || st.discards.indexOf(f.card) >= 0);
  }
  function roleOf(s) {
    var st = G.st;
    if (st.declarer < 0) return null;
    if (s === st.declarer) return ['d', '주공'];
    if (s === st.friendSeat) return ['f', '프렌드'];
    if (!st.friend) return null;
    if (s === ME && iHoldFriend(st)) return ['f', '프렌드(비밀)'];
    if (friendKnown(st) || iHoldFriend(st)) return ['o', '야당'];
    if (s === ME && st.friend.kind === 'card') return ['o', '야당'];
    return ['u', '?'];
  }
  function seatH(s) {
    var st = G.st, r = roleOf(s), turn = st.turn === s && !G.hold && st.phase !== 'done';
    return '<div class="seat' + (turn ? ' turn' : '') + '">' + av(s, s === ME ? 36 : 34) + '<div class="col"><span class="nm">' + esc(NAMES[s]) + '</span><span class="tg">' +
      (r ? '<span class="role ' + r[0] + '">' + r[1] + '</span>' : '') + (st.declarer >= 0 && st.friend ? '<span class="pts">' + st.taken[s].length + '</span>' : '') + '</span></div></div>';
  }

  /* ---------- 그리기 ---------- */
  function render() {
    $('btnScore').hidden = UI.view !== 'game';
    var st0 = G && G.st;
    $('sub').textContent = UI.view !== 'game' || !G ? 'AI 4명과 연습' : (st0.declarer >= 0 ? '마이티 ' + cardTxt(E.mightyOf(st0.giruda)) + ' · 조커콜 ' + cardTxt(E.jokerCallOf(st0.giruda)) : G.roundNo + '번째 판 · AI ' + LEVELS[SET.level] + ' · 내 점수 ' + sign(G.scores[ME]));
    if (UI.view === 'home') return renderHome();
    renderGame();
  }
  function renderHome() {
    var sv = load(), p = function (a, b) { return b ? Math.round(100 * a / b) + '%' : '–'; };
    $('view').innerHTML = '<div class="home">' +
      '<div class="hero"><div class="fan">' + cardH(E.card(0, 14), { g: 2 }) + cardH(JOKER, { g: 2 }) + cardH(E.card(2, 13), { g: 2 }) + cardH(E.card(3, 3), { g: 2 }) + '</div>' +
      '<h1>마이티</h1><p>공약을 걸고, 숨은 프렌드와 함께 점수 카드를 모으는 5인 트릭테이킹</p></div>' +
      '<div class="modes">' +
      (sv ? '<button type="button" class="mode main" data-a="resume"><span class="ic">▶</span><span><b>이어하기</b><small>' + sv.roundNo + '번째 판 · 내 점수 ' + sign(sv.scores[0]) + '</small></span></button>' : '') +
      '<button type="button" class="mode' + (sv ? '' : ' main') + '" data-a="new"><span class="ic">🃏</span><span><b>새 게임</b><small>나 + AI 4명 · 여러 판 누적 점수</small></span></button>' +
      (ARC ? '<button type="button" class="mode" data-a="board"><span class="ic">🏆</span><span><b>모임 랭킹</b><small>한 판 최고 점수 · 연속 승리' + (STATS.streak ? ' (지금 ' + STATS.streak + '연승)' : '') + '</small></span></button>' : '') +
      '<div class="two"><button type="button" class="mode" data-a="tour" data-v="0"><span class="ic">👋</span><span><b>빠른 안내</b><small>30초</small></span></button>' +
      '<button type="button" class="mode" data-a="help"><span class="ic">📖</span><span><b>규칙</b><small>자세히</small></span></button></div></div>' +
      '<div class="box"><h3>AI 실력</h3><div class="seg" id="lvSeg">' + [1, 2, 3].map(function (l) { return '<button type="button" data-a="level" data-v="' + l + '" class="' + (SET.level === l ? 'on' : '') + '">' + LEVELS[l] + '</button>'; }).join('') + '</div>' +
      '<p class="hint">🏆 모임 랭킹은 <b>AI 고수 · 힌트 없이</b> 이긴 판만 올라가요.</p><p class="hint">쉬움 — 가끔 실수하고 공약이 소극적 · 보통 — 기본기 · 고수 — 남은 카드를 따져 여러 경우를 굴려 봄. 게임 중에도 설정에서 바꿀 수 있어요.' + (ARC ? '<br>🏆 모임 랭킹에는 <b>고수</b>로 <b>힌트 없이</b> 이긴 판만 올라가요 (쉬움 · 보통은 안 올라감).' : '') + '</p></div>' +
      '<div class="box"><h3>내 전적<small>이 기기에 저장</small></h3><div class="stats">' +
      '<div><b>' + STATS.n + '</b><small>판</small></div><div><b>' + p(STATS.win, STATS.n) + '</b><small>승률</small></div><div><b>' + sign(STATS.sum) + '</b><small>누적 점수</small></div>' +
      '<div><b>' + p(STATS.dw, STATS.d) + '</b><small>주공 ' + STATS.d + '판</small></div><div><b>' + p(STATS.fw, STATS.f) + '</b><small>프렌드 ' + STATS.f + '판</small></div><div><b>' + p(STATS.ow, STATS.o) + '</b><small>야당 ' + STATS.o + '판</small></div>' +
      '</div></div><p class="hint" style="text-align:center">마이티 v' + VER + '</p></div>';
  }

  function infoH(st) {
    var h = '';
    if (st.declarer < 0) {
      h += '<span class="chip">공약 정하는 중</span>' + (st.high ? '<span class="chip gold">최고 ' + bidH(st.high.n, st.high.s) + ' <small>' + esc(NAMES[st.high.seat]) + '</small></span>' : '<span class="chip"><small>최소</small> 13</span>');
    } else {
      h += '<span class="chip gold"><small>공약</small> ' + bidH(st.bid, st.giruda) + '</span>';
      if (st.friend) {
        var f = st.friend, used = f.kind === 'card' ? st.seen[f.card] : f.kind === 'first' && st.trickNo > 0;
        h += '<span class="chip' + (used ? ' off' : '') + '"><small>프렌드</small> ' + (f.kind === 'none' ? '없음' : f.kind === 'first' ? '초구' : cardSpan(f.card)) + '</span>';
        var rp = st.taken[st.declarer].length + (st.friendSeat >= 0 ? st.taken[st.friendSeat].length : 0) + (st.declarer === ME || st.phase === 'done' ? E.points(st.discards) : 0);
        h += '<span class="chip"><small>트릭</small> ' + Math.min(10, st.trickNo + 1) + '/10</span><span class="chip"><small>여당</small> ' + rp + '/' + st.bid + '</span>';
      }
    }
    if (st.mult > 1) h += '<span class="chip mult">배판 ×' + st.mult + '</span>';
    return h;
  }
  function lastBid(st, s) { for (var i = st.bids.length - 1; i >= 0; i--) if (st.bids[i].seat === s) return st.bids[i]; return null; }
  function bubH(st, s) {
    var b = lastBid(st, s);
    if (!b) return '<span class="bslot"></span>';
    if (b.pass) return '<span class="bslot"><span class="bub pass">패스</span></span>';
    return '<span class="bslot"><span class="bub' + (st.high && st.high.seat === s ? ' top' : '') + '">' + bidH(b.n, b.s) + '</span></span>';
  }
  function tableH(st) {
    var h = '<div class="opps">' + [1, 2, 3, 4].map(seatH).join('') + '</div>', s;
    if (G.notice) return h + '<div class="center"><div><b>' + esc(G.notice) + '</b>다시 나눕니다 — 다음 판은 배판 ×' + Math.min(4, st.mult * 2) + '</div></div>';
    if (st.phase === 'bid') {
      return h + '<div class="trick"><div class="trow">' + [1, 2, 3, 4].map(function (s) { return bubH(st, s); }).join('') + '</div>' +
        '<div class="mrow"><span class="note l">' + (st.high ? '최고 공약<br><b>' + bidH(st.high.n, st.high.s) + '</b>' : '아직 공약 없음') + '</span>' + bubH(st, ME) + '<span class="note">' + (st.passed[ME] ? '패스함' : '') + '</span></div></div>';
    }
    if (st.phase === 'kitty' || st.phase === 'friend') {
      var d = st.declarer, mine = d === ME;
      return h + '<div class="center"><div><b>' + (mine ? '내가' : esc(NAMES[d]) + ' 님이') + ' 주공 · 공약 ' + bidH(st.bid, st.giruda) + '</b>' +
        (st.phase === 'kitty' ? (mine ? '바닥패 3장을 받았어요 (금색 테두리). 버릴 3장을 고르세요.' : '바닥패 3장을 받아 정리하는 중…') : (mine ? '프렌드를 정하세요' : '프렌드를 정하는 중…')) + '</div></div>';
    }
    var hold = G.hold, plays = hold ? hold.plays : st.trick, win = hold ? hold.winner : E.curWinner(st);
    var key = G.roundNo + ':' + st.trickNo + ':' + plays.length + (hold ? 'h' : ''), fresh = key !== UI.anim; UI.anim = key;
    function slot(s) {
      for (var i = 0; i < plays.length; i++) if (plays[i].seat === s)
        return '<span class="slot' + (s === win ? (hold ? ' won' : ' win') : '') + '">' + (i === 0 ? '<span class="ld">선</span>' : '') + cardH(plays[i].card, { cls: fresh && !hold && i === plays.length - 1 ? 'in' : '' }) + '</span>';
      return '<span class="slot empty"></span>';
    }
    var ls = hold ? hold.leadSuit : st.leadSuit, cs = hold ? hold.callSuit : st.callSuit, jc = hold ? hold.jokerCall : st.jokerCall, left = '', right = '', pts = 0;
    for (s = 0; s < plays.length; s++) if (E.isPoint(plays[s].card)) pts++;
    if (plays.length) {
      left = '선 <b>' + esc(NAMES[plays[0].seat]) + '</b><br>' + (jc ? '<span class="big">조커콜!</span>' : cs >= 0 ? '조커 → ' + suitH(cs) + ' 나와!' : '무늬 ' + suitH(ls));
      right = hold ? '<b>' + esc(NAMES[hold.winner]) + '</b> 승<br>' + (pts ? '점수 카드 +' + pts : '점수 없음') : '점수 카드 <b>' + pts + '</b>장';
    } else if (st.phase === 'play') left = '<b>' + esc(NAMES[st.turn]) + '</b> 선';
    return h + '<div class="trick" data-a="skip"><div class="trow">' + [1, 2, 3, 4].map(slot).join('') + '</div><div class="mrow"><span class="note l">' + left + '</span>' + slot(ME) + '<span class="note">' + right + '</span></div></div>';
  }
  function myTurn() { var st = G.st; return st.turn === ME && !G.hold && !G.notice && (st.phase === 'bid' || st.phase === 'kitty' || st.phase === 'friend' || st.phase === 'play'); }
  function statusH(st) {
    if (G.notice) return '';
    if (G.hold) return st.phase === 'done' ? '판이 끝났어요' : '';
    if (st.phase === 'done') return '판이 끝났어요';
    if (st.turn !== ME) return esc(NAMES[st.turn]) + ' 님 차례…';
    if (st.phase === 'bid') return '공약을 부르거나 패스하세요';
    if (st.phase === 'kitty') return '버릴 카드 3장 고르기 (' + UI.sel.length + '/3)';
    if (st.phase === 'friend') return '프렌드를 정하세요';
    if (!st.trick.length) return st.trickNo === 0 && st.giruda !== NT ? '내가 선 — 첫 트릭은 기루다를 낼 수 없어요' : '내가 선 — 낼 카드를 고르세요';
    if (st.jokerCall && st.hands[ME].indexOf(JOKER) >= 0) return '조커콜! 조커를 내야 해요';
    var has = st.hands[ME].some(function (c) { return E.suitOf(c) === st.leadSuit; });
    return has ? suitTxt(st.leadSuit) + ' 무늬를 따라 내세요' : suitTxt(st.leadSuit) + ' 없음 — 아무 카드나 낼 수 있어요';
  }
  function panelH(st) {
    if (!myTurn()) return '';
    var h = '', s, i;
    if (st.phase === 'bid') {
      var mn = E.minBid(st, UI.bs);
      if (mn && UI.bn < mn) UI.bn = mn;
      var can = E.canBid(st, UI.bn, UI.bs);
      h += '<div class="prow">';
      for (s = 0; s <= 4; s++) h += '<button type="button" class="pick' + (UI.bs === s ? ' on' : '') + '" data-a="bs" data-v="' + s + '"' + (E.minBid(st, s) ? '' : ' disabled') + '>' + suitH(s) + (s === NT ? '<small>노기루다</small>' : '') + '</button>';
      h += '</div><div class="prow"><button type="button" class="btn sm" data-a="bn" data-v="-1"' + (UI.bn - 1 >= 13 && E.canBid(st, UI.bn - 1, UI.bs) ? '' : ' disabled') + ' aria-label="공약 내리기">−</button><span class="num">' + UI.bn + '</span>' +
        '<button type="button" class="btn sm" data-a="bn" data-v="1"' + (UI.bn < 20 ? '' : ' disabled') + ' aria-label="공약 올리기">+</button>' +
        '<button type="button" class="btn" data-a="pass">패스</button><button type="button" class="btn pri" data-a="bid"' + (can ? '' : ' disabled') + '>공약 ' + bidH(UI.bn, UI.bs) + '</button></div>';
    } else if (st.phase === 'kitty') {
      var kg = UI.kg == null ? st.giruda : UI.kg, cost = function (g) { return E.changeCost(st, g); };
      h += '<div class="prow"><span class="plabel">기루다</span>';
      for (s = 0; s <= 4; s++) h += '<button type="button" class="pick' + (kg === s ? ' on' : '') + '" data-a="kg" data-v="' + s + '"' + (s === st.giruda || st.bid + cost(s) <= 20 ? '' : ' disabled') + '>' + suitH(s) + '<small>' + (s === st.giruda ? '그대로' : '공약 +' + cost(s)) + '</small></button>';
      h += '</div><div class="prow"><button type="button" class="btn pri" data-a="discard"' + (UI.sel.length === 3 ? '' : ' disabled') + '>3장 버리기 (' + UI.sel.length + '/3)' + (kg !== st.giruda ? ' · ' + suitH(kg) + ' ' + (st.bid + cost(kg)) : '') + '</button></div>';
    } else if (st.phase === 'friend') {
      var g = st.giruda, own = st.hands[ME], q = [[E.mightyOf(g), '마이티'], [JOKER, '조커']], fr = UI.fr;
      if (g !== NT) q.push([E.card(g, 14), '기루다 A'], [E.card(g, 13), '기루다 K']); else q.push([E.card(0, 13), '♠K'], [E.card(2, 14), '♥A']);
      h += '<div class="fgrid">';
      for (i = 0; i < q.length; i++) {
        var mineC = own.indexOf(q[i][0]) >= 0;
        h += '<button type="button" class="pick' + (fr && fr.kind === 'card' && fr.card === q[i][0] ? ' on' : '') + '" data-a="fr" data-k="card" data-c="' + q[i][0] + '"' + (mineC ? ' disabled' : '') + '>' + cardSpan(q[i][0]) + '<small>' + (mineC ? '내 손에 있음' : q[i][1]) + '</small></button>';
      }
      h += '</div><div class="prow"><button type="button" class="pick" data-a="frpick">다른 카드<small>직접 고르기</small></button>' +
        '<button type="button" class="pick' + (fr && fr.kind === 'first' ? ' on' : '') + '" data-a="fr" data-k="first">초구<small>첫 트릭 승자</small></button>' +
        '<button type="button" class="pick' + (fr && fr.kind === 'none' ? ' on' : '') + '" data-a="fr" data-k="none">노프렌드<small>점수 2배 (실패해도)</small></button></div>' +
        '<div class="prow"><button type="button" class="btn pri" data-a="friend"' + (fr ? '' : ' disabled') + '>' + (fr ? (fr.kind === 'card' ? cardSpan(fr.card) + ' 프렌드로 시작' : fr.kind === 'first' ? '초구 프렌드로 시작' : '노프렌드로 시작') : '프렌드를 골라 주세요') + '</button></div>';
    } else if (st.phase === 'play') {
      var p = UI.pend, c = UI.sel[0];
      if (p && p.t === 'call') {
        h += '<div class="prow"><span class="plabel">조커 — 부를 무늬</span>';
        E.callSuits(st).forEach(function (s) { h += '<button type="button" class="pick" data-a="call" data-v="' + s + '">' + suitH(s) + '</button>'; });
        h += '<button type="button" class="btn sm" data-a="cancel">취소</button></div>';
      } else if (p && p.t === 'jc') {
        h += '<div class="prow"><button type="button" class="btn warn" data-a="jc" data-v="1">조커콜!</button><button type="button" class="btn" data-a="jc" data-v="0">그냥 내기</button><button type="button" class="btn sm" data-a="cancel">취소</button></div>';
      } else {
        h += '<div class="prow"><button type="button" class="btn pri" data-a="play"' + (c == null ? ' disabled' : '') + '>' + (c == null ? '카드를 고르세요' : cardSpan(c) + ' 내기') + '</button></div>';
      }
    }
    return h;
  }
  function handRows(n) {
    var W = Math.max(240, $('view').clientWidth - 20), cw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cw')) || 54;
    var two = n > 1 && (W - cw) / (n - 1) < 38, rows = two ? [Math.ceil(n / 2), Math.floor(n / 2)] : [n];
    return rows.map(function (k) { return { k: k, ov: k > 1 ? Math.min(5, Math.floor((W - k * cw) / (k - 1))) : 0 }; });
  }
  function handH(st) {
    var g = gir(), hand = E.sortHand(st.hands[ME], g == null ? NT : g), mt = myTurn(), legal = null, i = 0, h = '';
    if (mt && st.phase === 'play') legal = E.legalPlays(st, ME);
    var newC = st.phase === 'kitty' && st.declarer === ME ? st.kitty : [];
    handRows(hand.length).forEach(function (row) {
      h += '<div class="hrow" style="--ov:' + row.ov + 'px">';
      for (var k = 0; k < row.k; k++, i++) {
        var c = hand[i], cls = [];
        if (UI.sel.indexOf(c) >= 0) cls.push('sel');
        if (legal) cls.push(legal.indexOf(c) >= 0 ? 'ok' : 'dim');
        if (newC.indexOf(c) >= 0) cls.push('new');
        if (UI.hintCard === c) cls.push('hintc');
        h += cardH(c, { btn: 1, cls: cls.join(' ') });
      }
      h += '</div>';
    });
    return h;
  }
  function renderGame() {
    var st = G.st, mt = myTurn();
    $('view').innerHTML = '<div class="game"><div class="table">' + tableH(st) + '</div><div class="side"><div class="info">' + infoH(st) + '</div>' +
      '<div class="me">' + seatH(ME) + '<span class="st' + (mt ? ' my' : '') + '">' + statusH(st) + '</span>' +
      '<button type="button" class="sbtn" data-a="hint"' + (mt ? '' : ' disabled') + '>💡 힌트</button><button type="button" class="sbtn" data-a="tricks"' + (st.history.length ? '' : ' disabled') + '>지난 트릭</button></div>' +
      '<div class="panel">' + panelH(st) + '</div></div><div class="hand">' + handH(st) + '</div></div>';
  }

  /* ---------- 내 동작 ---------- */
  function whyNot(st, c) {
    if (!st.trick.length) return '첫 트릭에는 기루다를 선으로 낼 수 없어요';
    if (st.jokerCall && st.hands[ME].indexOf(JOKER) >= 0) return '조커콜이라 조커(또는 마이티)를 내야 해요';
    return '선 무늬(' + suitTxt(st.leadSuit) + ')를 따라 내야 해요 — 마이티 · 조커는 언제든 가능';
  }
  function tryPlay(c) {
    var st = G.st;
    if (!st.trick.length && c === JOKER) {
      if (st.hands[ME].length === 1) return doAct(ME, { t: 'play', card: c, callSuit: E.callSuits(st)[0] });
      UI.pend = { t: 'call', card: c }; return render();
    }
    if (!st.trick.length && c === E.jokerCallOf(st.giruda) && E.canJokerCall(st, ME)) { UI.pend = { t: 'jc', card: c }; return render(); }
    doAct(ME, { t: 'play', card: c });
  }
  var ACT = {
    resume: function () { G = load(); if (!G) return newGameStart(); enterGame(); resetUI(); render(); pump(); },
    'new': function () { if (load() && !confirm('진행 중인 게임과 점수표를 지우고 새로 시작할까요?')) return; newGameStart(); },
    help: showHelp,
    level: function (el) { SET.level = +el.getAttribute('data-v'); lsSet(LS.set, SET); if (G && UI.view === 'game') { G.rlv = Math.min(G.rlv || 0, SET.level); save(); } if ($('modal').innerHTML) showSettings(); render(); },
    speed: function (el) { SET.speed = +el.getAttribute('data-v'); lsSet(LS.set, SET); showSettings(); },
    tog: function (el) {
      var k = el.getAttribute('data-k'), v = +el.getAttribute('data-v');
      if (k === 'haptic') { if (FX) FX.setHaptic(!!v); } else { SET[k] = v; lsSet(LS.set, SET); }
      showSettings(); if (k === 'sound' && v) SND.turn();
    },
    card: function (el) {
      var st = G.st, c = +el.getAttribute('data-c');
      if (!myTurn()) return;
      if (st.phase === 'kitty') {
        var i = UI.sel.indexOf(c);
        if (i >= 0) UI.sel.splice(i, 1); else if (UI.sel.length < 3) UI.sel.push(c); else return toast('3장만 버릴 수 있어요 — 고른 카드를 다시 누르면 빠져요');
        haptic('tap'); return render();
      }
      if (st.phase !== 'play') return;
      if (E.legalPlays(st, ME).indexOf(c) < 0) { haptic('warn'); return toast(whyNot(st, c)); }
      haptic('tap'); hideToast();
      if (UI.pend) UI.pend = null;
      if (SET.oneTap || UI.sel[0] === c) return tryPlay(c);
      UI.sel = [c]; UI.hintCard = -1; render();
    },
    play: function () { if (UI.sel.length && myTurn()) tryPlay(UI.sel[0]); },
    call: function (el) { if (UI.pend) doAct(ME, { t: 'play', card: UI.pend.card, callSuit: +el.getAttribute('data-v') }); },
    jc: function (el) { if (UI.pend) doAct(ME, { t: 'play', card: UI.pend.card, jokerCall: el.getAttribute('data-v') === '1' }); },
    cancel: function () { UI.pend = null; render(); },
    bs: function (el) { UI.bs = +el.getAttribute('data-v'); var mn = E.minBid(G.st, UI.bs); if (mn) UI.bn = mn; render(); },
    bn: function (el) { var n = UI.bn + (+el.getAttribute('data-v')); if (n >= 13 && n <= 20 && E.canBid(G.st, n, UI.bs)) { UI.bn = n; render(); } },
    bid: function () { if (myTurn() && E.canBid(G.st, UI.bn, UI.bs)) doAct(ME, { t: 'bid', n: UI.bn, s: UI.bs }); },
    pass: function () { if (myTurn() && G.st.phase === 'bid') doAct(ME, { t: 'pass' }); },
    kg: function (el) { UI.kg = +el.getAttribute('data-v'); render(); },
    discard: function () {
      var st = G.st, m = E.mightyOf(UI.kg == null ? st.giruda : UI.kg);
      if (!myTurn() || st.phase !== 'kitty' || UI.sel.length !== 3) return;
      if ((UI.sel.indexOf(m) >= 0 || UI.sel.indexOf(JOKER) >= 0) && !confirm('마이티나 조커를 버리려고 해요. 정말 버릴까요?')) return;
      var a = { t: 'discard', cards: UI.sel.slice() };
      if (UI.kg != null && UI.kg !== st.giruda) a.giruda = UI.kg;
      doAct(ME, a);
    },
    fr: function (el) { var k = el.getAttribute('data-k'); UI.fr = k === 'card' ? { kind: 'card', card: +el.getAttribute('data-c') } : { kind: k }; closeModal(); render(); },
    frpick: showFriendPick,
    friend: function () { var f = UI.fr; if (f && myTurn() && G.st.phase === 'friend') doAct(ME, { t: 'friend', kind: f.kind, card: f.card }); },
    hint: doHint,
    tricks: showTricks,
    skip: function () { if (G.hold && G.st.phase !== 'done') { clearTimeout(T); endHold(); } },
    next: function () { nextRound(); },
    close: closeModal,
    score: showScore,
    home: function () { goHome(); },
    board: function (el) { if (ARC) ARC.openBoard('mighty', el.getAttribute('data-v') || 'score'); },
    tour: function (el) { var v = el.getAttribute('data-v'); if (v === 'end') closeModal(); else showTour(+v); },
    reset: function () { if (!confirm('점수표를 지우고 새 게임을 시작할까요?')) return; closeModal(); newGameStart(); },
    result: function () { closeModal(); showResult(); }
  };
  function newGameStart() { abandon(); enterGame(); newGame(); }
  function goHome(fromPop) { clearTimeout(T); var n = hs() === 'modal' ? 2 : hs() === 'game' ? 1 : 0; closeModal(true); UI.view = 'home'; save(); render(); if (fromPop !== true) hback(n); }
  function doHint() {
    var st = G.st, a;
    if (!myTurn()) return;
    try { a = AI.choose(st, ME, 3); } catch (e) { return; }
    if (!G.hinted) { G.hinted = 1; save(); }   // 힌트를 쓴 판은 랭킹에 안 올림
    var why = a.why ? ' — ' + a.why : '';
    if (a.t === 'pass') toast('💡 추천: 패스' + why, 4200);
    else if (a.t === 'bid') { UI.bs = a.s; UI.bn = a.n; toast('💡 추천: 공약 ' + bidTxt(a.n, a.s) + why, 4200); }
    else if (a.t === 'discard') { UI.sel = a.cards.slice(); UI.kg = a.giruda == null ? st.giruda : a.giruda; toast('💡 추천: ' + a.cards.map(cardTxt).join(' ') + ' 버리기' + why, 4200); }
    else if (a.t === 'friend') { UI.fr = { kind: a.kind, card: a.card }; toast('💡 추천: ' + (a.kind === 'card' ? cardTxt(a.card) + ' 프렌드' : a.kind === 'none' ? '노프렌드' : '초구 프렌드') + why, 4200); }
    else if (a.t === 'play') {
      UI.sel = [a.card]; UI.hintCard = a.card; UI.pend = null;
      toast('💡 추천: ' + cardTxt(a.card) + (a.jokerCall ? ' + 조커콜' : a.callSuit != null ? ' (' + suitTxt(a.callSuit) + ' 부르기)' : '') + why, 4200);
    }
    render();
  }

  /* ---------- 창 ---------- */
  function modal(title, body, foot, lock, noHist) {
    $('modal').innerHTML = '<div class="mback"' + (lock ? '' : ' data-a="close" data-self="1"') + '><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="hd"><b>' + title + '</b>' +
      (lock ? '' : '<button type="button" class="ibtn" data-a="close" aria-label="닫기"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>') + '</div><div class="bd">' + body + '</div>' + (foot ? '<div class="ft">' + foot + '</div>' : '') + '</div></div>';
    modalHist = !noHist;
    if (modalHist && hs() !== 'modal' && !selfPop) hpush('modal');
  }
  function closeModal(fromPop) {
    var open = !!$('modal').innerHTML && modalHist;
    $('modal').innerHTML = ''; modalHist = false;
    if (open && fromPop !== true && hs() === 'modal' && !selfPop) hback(1);
  }
  function showHelp() {
    modal('마이티 규칙', '<div class="help">' +
      '<h4>목표</h4><p>공약을 건 <b>주공</b>과 숨은 <b>프렌드</b>(여당)가 <b>점수 카드</b>(A · K · Q · J · 10, 모두 20장)를 공약한 수만큼 먹으면 여당 승리, 못 먹으면 나머지 <b>야당</b> 승리.</p>' +
      '<h4>순서</h4><ul><li><b>공약</b> — 13~20 과 기루다(으뜸 무늬)를 부르거나 패스. 숫자가 높아야 하고, 같은 숫자면 노기루다(NT)만 위. 한 번 패스하면 그 판은 끝까지 패스.</li>' +
      '<li><b>바닥패</b> — 주공이 바닥 3장을 받고 3장을 버림(버린 점수 카드는 여당 점수). 이때 기루다를 바꾸면 공약이 오름(다른 무늬로 +2, 노기루다로 +1).</li>' +
      '<li><b>프렌드</b> — 카드를 하나 부르면 그 카드를 가진 사람이 프렌드(그 카드가 나올 때 공개). 초구 프렌드(첫 트릭을 딴 사람) · 노프렌드도 가능.</li>' +
      '<li><b>10트릭</b> — 주공이 먼저 내고, 트릭을 딴 사람이 다음 선.</li></ul>' +
      '<h4>카드 내기</h4><ul><li>선이 낸 무늬가 있으면 <b>반드시 그 무늬</b>. 없으면 아무 카드(기루다로 자를 수 있음).</li>' +
      '<li>센 순서: <b>마이티 &gt; 조커 &gt; 기루다 &gt; 선 무늬</b> (같은 무늬는 A 가 가장 높음).</li>' +
      '<li><b>마이티</b> = ♠A (기루다가 ♠ 면 ◆A). 언제든 낼 수 있음.</li>' +
      '<li><b>조커</b> — 언제든 낼 수 있음. <b>첫 트릭 · 마지막 트릭엔 힘이 없음</b>. 선으로 내면 무늬를 부름.</li>' +
      '<li><b>조커콜</b> = ♣3 (기루다가 ♣ 면 ♠3)을 선으로 내며 "조커콜" → 조커를 가진 사람은 조커를 내야 하고 그 조커는 힘이 없음(마이티로 대신 가능). 첫 · 마지막 트릭엔 못 함.</li>' +
      '<li>첫 트릭에는 기루다를 선으로 낼 수 없음 (기루다와 조커뿐이면 가능).</li></ul>' +
      '<h4>점수</h4><ul><li>성공: (먹은 수 − 공약) + (공약 − 13) × 2 · 실패: 공약 − 먹은 수 (예: 15 공약에 19장 = 4 + 4 = 8점)</li>' +
      '<li>× 2 씩: <b>런</b>(여당 20장 전부) · <b>백런</b>(여당 9장 이하) · <b>노기루다</b> · <b>노프렌드</b> · 배판</li>' +
      '<li>주공 ×2 · 프렌드 ×1 · 야당 각자 −1 (프렌드가 없으면 주공 ×4). 실패하면 부호가 반대.</li>' +
      '<li>모두 패스하거나 점수 카드가 한 장도 없는 손이 나오면(딜 미스) 다시 나누고 다음 판은 <b>배판</b> ×2 (최대 ×4).</li></ul>' +
      '<h4>이 게임의 규칙 <small>(모임마다 다른 부분)</small></h4><ul><li>노기루다도 최소 공약은 13 (한 장 낮추지 않음). 노기루다로 바꿀 때는 +1.</li>' +
      '<li>노기루다 · 노프렌드의 ×2 는 <b>실패해도</b> 적용돼요 (노프렌드면 주공 점수는 ×8).</li>' +
      '<li>딜 미스는 선언 없이 자동으로 다시 나눠요. 패스는 그 판 끝까지.</li>' +
      '<li>주공이 자기 손(또는 버린) 카드를 프렌드로 부르면 프렌드 없이 진행하고 ×4 (노프렌드 ×2 는 안 붙어요).</li></ul>' +
      '<h4>화면</h4><ul><li>밝은 테두리 카드만 낼 수 있어요. 카드를 누르면 올라오고, 한 번 더 누르거나 [내기]를 누르면 냅니다.</li>' +
      '<li>아래에 색 띠가 있는 카드가 기루다, 금색 테두리가 마이티. ★ 숫자는 먹은 점수 카드 수.</li>' +
      '<li>💡 힌트 — 고수 AI 가 고른 수와 이유를 알려 줘요.</li></ul></div>');
  }
  /* 처음 온 사람용 30초 안내 (5장면) — 자세한 규칙은 도움말 */
  var TOUR = [
    ['목표', function () { return [14, 13, 12, 11, 10].map(function (r) { return cardH(E.card(2, r), { g: null }); }).join(''); },
      '<b>점수 카드</b>는 A · K · Q · J · 10, 모두 20장.<br>공약을 건 <b>주공 편(여당)</b>이 약속한 수만큼 먹으면 여당 승, 못 먹으면 <b>야당</b> 승이에요.'],
    ['공약', function () { return '<span class="bub top">' + bidH(14, 0) + '</span><span class="bub pass">패스</span><span class="bub">' + bidH(13, 2) + '</span>'; },
      '"<b>♠ 14</b>" = 스페이드를 <b>기루다</b>(으뜸 무늬)로 14장을 먹겠다는 약속.<br>가장 높이 부른 사람이 주공이 되어 바닥 3장을 받고 3장을 버려요.'],
    ['프렌드', function () { return cardH(E.card(0, 14), { g: 2 }) + '<span class="bub">= 숨은 내 편</span>'; },
      '주공이 <b>카드 하나</b>를 부르면 그 카드를 가진 사람이 <b>프렌드</b>.<br>그 카드가 나올 때까지 누구인지 아무도 몰라요. 나머지 셋이 야당!'],
    ['센 카드', function () { return cardH(E.card(0, 14), { g: 2 }) + cardH(JOKER, { g: 2 }) + cardH(E.card(2, 9), { g: 2 }) + cardH(E.card(3, 3), { g: 2 }); },
      '<b>마이티 &gt; 조커 &gt; 기루다 &gt; 선 무늬</b> 순으로 세요. 선이 낸 무늬가 있으면 꼭 그 무늬를 내야 해요.<br>조커는 첫 · 마지막 트릭엔 힘이 없고, <b>조커콜</b>(♣3)에 걸리면 힘없이 끌려 나와요.'],
    ['점수', function () { return '<span class="bub top">주공 ×2</span><span class="bub">프렌드 ×1</span><span class="bub pass">야당 −1</span>'; },
      '공약을 높이, 넉넉히 성공할수록 점수가 커요. 실패하면 거꾸로!<br>막히면 <b>💡 힌트</b>를 눌러 보세요 — 고수 AI 가 고른 수와 이유를 알려 줘요.']
  ];
  function showTour(i) {
    var t = TOUR[i], last = i === TOUR.length - 1;
    if (!SET.tour) { SET.tour = 1; lsSet(LS.set, SET); }
    modal('빠른 안내 ' + (i + 1) + '/' + TOUR.length, '<div class="tour"><div class="pic">' + t[1]() + '</div><h3>' + t[0] + '</h3><p>' + t[2] + '</p>' +
      '<div class="dots">' + TOUR.map(function (x, k) { return '<i class="' + (k === i ? 'on' : '') + '"></i>'; }).join('') + '</div></div>',
      (last ? '' : '<button type="button" class="btn" data-a="tour" data-v="end">건너뛰기</button>') + '<button type="button" class="btn pri" data-a="tour" data-v="' + (last ? 'end' : i + 1) + '">' + (last ? '시작하기' : '다음') + '</button>');
  }
  function segH(act, cur, items, extra) { return '<div class="seg">' + items.map(function (it) { return '<button type="button" data-a="' + act + '" data-v="' + it[0] + '"' + (extra || '') + ' class="' + (cur === it[0] ? 'on' : '') + '">' + it[1] + '</button>'; }).join('') + '</div>'; }
  function showSettings() {
    var hp = FX ? FX.hapticOn() : false;
    modal('설정', '<div class="opt"><div class="l">진행 속도<small>AI 가 내는 속도 · 트릭 보여 주는 시간</small></div>' + segH('speed', SET.speed, [[0, '느림'], [1, '보통'], [2, '빠름']]) + '</div>' +
      '<div class="opt"><div class="l">AI 실력<small>바로 적용 · 랭킹은 고수만</small></div>' + segH('level', SET.level, [[1, '쉬움'], [2, '보통'], [3, '고수']]) + '</div>' +
      '<div class="opt"><div class="l">카드 내기<small>한 번 누르면 바로 / 두 번 눌러 확인</small></div>' + segH('tog', SET.oneTap, [[0, '두 번'], [1, '한 번']], ' data-k="oneTap"') + '</div>' +
      '<div class="opt"><div class="l">소리</div>' + segH('tog', SET.sound, [[1, '켬'], [0, '끔']], ' data-k="sound"') + '</div>' +
      '<div class="opt"><div class="l">진동</div>' + segH('tog', hp ? 1 : 0, [[1, '켬'], [0, '끔']], ' data-k="haptic"') + '</div>',
      UI.view === 'game' ? '<button type="button" class="btn" data-a="home">첫 화면으로</button><button type="button" class="btn" data-a="reset">새 게임</button>' : '');
  }
  function showFriendPick() {
    var st = G.st, own = st.hands[ME], h = '', s, r;
    for (s = 0; s < 4; s++) {
      h += '<div class="rgrid" style="margin-bottom:6px">';
      for (r = 14; r >= 2; r--) {
        var c = E.card(s, r), mine = own.indexOf(c) >= 0;
        h += '<button type="button" class="pick" data-a="fr" data-k="card" data-c="' + c + '"' + (mine ? ' disabled' : '') + '>' + cardSpan(c) + '</button>';
      }
      h += '<span></span></div>';
    }
    h += '<button type="button" class="pick" style="width:100%" data-a="fr" data-k="card" data-c="' + JOKER + '"' + (own.indexOf(JOKER) >= 0 ? ' disabled' : '') + '>' + cardSpan(JOKER) + '</button><p class="hint">흐린 카드는 내 손에 있는 카드예요. 고른 카드를 가진 사람이 프렌드가 됩니다.</p>';
    modal('프렌드 카드 고르기', h);
  }
  function roleTag(r, s) { return s === r.declarer ? '<span class="role d">주공</span>' : s === r.friendSeat ? '<span class="role f">프렌드</span>' : '<span class="role o">야당</span>'; }
  function showResult() {
    var st = G.st, r = st.result; if (!r) return;
    $('toast').classList.remove('on');
    var mineWon = r.delta[ME] > 0, myR = r.declarer === ME || r.friendSeat === ME;
    var calc = r.win ? '(' + r.made + ' − ' + r.bid + ') + (' + r.bid + ' − 13) × 2 = <b>' + r.base + '</b>' : r.bid + ' − ' + r.made + ' = <b>' + r.base + '</b>';
    if (r.mult > 1) calc += ' · ' + r.tags.join(' · ') + ' → × ' + r.mult + ' = <b>' + r.base * r.mult + '</b>';
    var rk = G.rank, rankLine = !rk ? '' : rk.ok && rk.streak ? '🏆 랭킹 기록 — <b>' + rk.streak + '연승</b> · 이 판 <b>' + sign(rk.score) + '점</b>' + (NICK ? '' : '<br>잠만보에 로그인하면 모임 랭킹에 올라가요') :
      rk.ok ? '🏆 졌어요 — 연승이 0 으로 돌아갔어요' : '🏆 모임 랭킹은 <b>AI 고수 · 힌트 없이</b> 한 판만 올라가요';
    var rows = [0, 1, 2, 3, 4].map(function (s) {
      return '<div class="rowp' + (s === ME ? ' me' : '') + '">' + av(s, 28) + '<span class="t">' + esc(NAMES[s]) + ' ' + roleTag(r, s) + '<span class="pts">' + st.taken[s].length + '</span></span><span class="dv ' + (r.delta[s] > 0 ? 'plus' : 'minus') + '">' + sign(r.delta[s]) + '</span><span class="tot">합계 ' + sign(G.scores[s]) + '</span></div>';
    }).join('');
    modal(G.roundNo + '번째 판 결과', '<div class="res"><div class="em">' + (mineWon ? '🎉' : '😵') + '</div><h2>' + (r.win ? '여당 공약 성공' : '여당 공약 실패') + ' — ' + (mineWon ? '내 편 승리!' : '내 편 패배') + '</h2>' +
      '<p>공약 ' + bidH(r.bid, r.giruda) + ' · 여당이 먹은 점수 카드 <b>' + r.made + '</b>장 · 나는 ' + (myR ? '여당' : '야당') + '</p>' +
      '<div class="calc">' + calc + '<br>주공 ' + (r.friendSeat < 0 ? '×4' : '×2 · 프렌드 ×1') + ' · 야당 각 ×1</div></div>' + rows +
      (rankLine ? '<p class="rankln">' + rankLine + '</p>' : '') + '<p class="hint">주공이 버린 카드: <span class="mini" style="display:inline-flex;vertical-align:middle">' + st.discards.map(function (c) { return cardH(c, { sm: 1 }); }).join('') + '</span></p>',
      '<button type="button" class="btn" data-a="tricks">트릭 보기</button>' + (ARC ? '<button type="button" class="btn sm" data-a="board" data-v="' + (rk && rk.streak > 1 ? 'streak' : 'score') + '" aria-label="모임 랭킹">🏆 랭킹</button>' : '') + '<button type="button" class="btn pri" data-a="next">다음 판</button>', true, true);
  }
  function showTricks() {
    var st = G.st, back = st.phase === 'done', h = '<div class="tk"><div class="h"><b>먹은 점수 카드</b></div>';
    for (var s = 0; s < 5; s++) h += '<div class="rowp" style="border:0;padding:3px 0"><span class="t" style="flex:none;width:74px">' + esc(NAMES[s]) + '</span><span class="mini">' + (st.taken[s].length ? E.sortHand(st.taken[s], st.giruda).map(function (c) { return cardH(c, { sm: 1 }); }).join('') : '<small style="color:var(--muted)">없음</small>') + '</span></div>';
    h += '</div>';
    for (var k = st.history.length - 1; k >= 0; k--) {
      var t = st.history[k];
      h += '<div class="tk"><div class="h"><b>' + (k + 1) + '번째 트릭</b> · ' + esc(NAMES[t.winner]) + ' 승' + (t.pts ? ' · 점수 카드 +' + t.pts : '') + (t.jokerCall ? ' · 조커콜' : t.callSuit >= 0 ? ' · 조커 → ' + suitH(t.callSuit) : '') + '</div><div class="cs">' +
        t.plays.map(function (p, i) { return '<div class="c1' + (p.seat === t.winner ? ' w' : '') + '">' + cardH(p.card, { sm: 1 }) + '<span>' + (i === 0 ? '선 ' : '') + esc(NAMES[p.seat]) + '</span></div>'; }).join('') + '</div></div>';
    }
    modal('지난 트릭', h, back ? '<button type="button" class="btn pri" data-a="result">결과로 돌아가기</button>' : '', back);
  }
  function showScore() {
    if (!G) return;
    var h = '<table class="sc"><tr><th>판</th>' + NAMES.map(function (n) { return '<th>' + esc(n) + '</th>'; }).join('') + '</tr><tr class="sum"><td>합계</td>' + G.scores.map(function (v) { return '<td class="' + (v > 0 ? 'plus' : v < 0 ? 'minus' : '') + '">' + sign(v) + '</td>'; }).join('') + '</tr>';
    for (var i = G.rounds.length - 1; i >= 0; i--) {
      var r = G.rounds[i];
      h += '<tr><td>' + r.no + ' <small>' + suitH(r.g) + r.bid + (r.win ? ' ○' : ' ✕') + '</small></td>' + r.delta.map(function (v, s) { return '<td>' + (s === r.d ? '<b>' : '') + sign(v) + (s === r.d ? '</b>' : s === r.f ? '<small>ᶠ</small>' : '') + '</td>'; }).join('') + '</tr>';
    }
    h += '</table>' + (G.rounds.length ? '<p class="hint">굵은 숫자 = 주공 · ᶠ = 프렌드 · ○ 공약 성공 ✕ 실패</p>' : '<p class="hint">아직 끝난 판이 없어요.</p>');
    modal('점수표', h, '<button type="button" class="btn" data-a="reset">새 게임</button>' + (ARC ? '<button type="button" class="btn" data-a="board">🏆 랭킹</button>' : '') + '<button type="button" class="btn pri" data-a="close">닫기</button>');
  }

  /* ---------- 이벤트 ---------- */
  function onClick(e) {
    var el = e.target.closest ? e.target.closest('[data-a]') : null;
    if (!el) return;
    if (el.getAttribute('data-self') && e.target !== el) return;   // 바깥(어두운 곳)을 눌렀을 때만 닫기
    if (el.disabled) return;
    var f = ACT[el.getAttribute('data-a')];
    if (f) f(el);
  }
  $('view').addEventListener('click', onClick);
  $('modal').addEventListener('click', onClick);
  $('back').onclick = function () { if ($('modal').innerHTML && modalHist) return closeModal(); if (UI.view === 'game') return goHome(); location.href = ROOT; };
  $('btnHelp').onclick = showHelp;
  $('btnSet').onclick = showSettings;
  $('btnScore').onclick = showScore;
  var rz = 0;
  window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (UI.view === 'game' && G) renderGame(); }, 120); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('modal').querySelector('[data-self]') && !(history.state && history.state.jarc)) closeModal(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && UI.view === 'game' && G && !$('modal').innerHTML) pump(); });

  /* ---------- 시작 ---------- */
  G = load();
  if (G) { UI.view = 'game'; if (G.st.declarer === ME && G.st.phase === 'kitty') UI.kg = G.st.giruda; }
  fixHist();
  render();
  if (G) pump(); else if (!SET.tour) showTour(0);   // 처음 온 사람에게 30초 안내
})();
