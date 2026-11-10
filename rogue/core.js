/*! 잠만보 던전 — 게임 규칙 core.js (화면 없음: 브라우저 window.ROGUE_CORE · node require 둘 다)
 * 주사위를 굴려 장비 칸에 넣는 로그라이크. 판 상태 g 는 순수 JSON (그대로 localStorage 에 저장 → 이어하기)
 * 난수는 씨앗 3줄기 g.rs = {m 지도, r 보상·사건, c 전투}. 세 막의 지도와 방마다 나올 적 · 사건은 newRun 에서 미리 정하고(m),
 * r · c 는 방에 들어갈 때 (씨앗, 막, 줄, 칸) 으로 다시 맞춤 → 같은 씨앗이면 어느 길로 왔든 같은 방에서 같은 적 · 같은 보상 후보 · 같은 주사위 ('오늘의 던전')
 *   newRun({seed, cls, asc, daily}) → g      act(g, {t, …}) → true/false (g 를 바꿈)
 *   g.phase: map · combat · pick(보상 고르기) · shop · rest · event · over
 *   행동: go{col} · place{die, slot} · unplace{slot} · reroll{die|-1} · end · pick{i, rep} · skip · rest{how} · buy{what, i, rep} · leave · opt{i} · cont
 * 밸런스를 바꾸면 node 봇으로 수천 판 돌려 확인 (4_문서\미니게임.md '잠만보 던전')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ROGUE_CORE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var SAVE_VER = 2, MAXEQ = 6, MAXDICE = 8, ROWS = 7, ACTS = 3, ENRAGE = 10;

  /* ================= 난수 ================= */
  function hashStr(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rnd(g, k) {
    var s = g.rs[k] = (g.rs[k] + 0x6D2B79F5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function ri(g, k, n) { return Math.floor(rnd(g, k) * n); }
  function shuffle(g, k, a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = ri(g, k, i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function wpick(g, k, items, wf) {
    var tot = 0, i; for (i = 0; i < items.length; i++) tot += wf(items[i]);
    var x = rnd(g, k) * tot;
    for (i = 0; i < items.length; i++) { x -= wf(items[i]); if (x < 0) return items[i]; }
    return items[items.length - 1];
  }

  /* ================= 상태 이상 ================= */
  var ST = {
    poison: { n: '독', e: '☠️', d: '차례가 시작될 때 수치만큼 피해(방어 무시), 그 뒤 1 줄어요' },
    burn: { n: '화상', e: '🔥', d: '나: 주사위를 쓸 때마다 1 피해, 1 줄어요 · 적: 행동한 뒤 수치만큼 피해, 절반으로 줄어요' },
    weak: { n: '약화', e: '💫', d: '주는 피해 25% 감소 (남은 턴 수)' },
    vuln: { n: '취약', e: '💔', d: '받는 피해 50% 증가 (남은 턴 수)' },
    str: { n: '힘', e: '💪', d: '공격할 때마다 피해 + 수치' },
    thorns: { n: '가시', e: '🌵', d: '공격받을 때마다 상대에게 수치만큼 피해' },
    seal: { n: '봉인', e: '🔒', d: '다음 턴에 굴리는 주사위가 수치만큼 줄어요' }
  };

  /* ================= 전투 도우미 (장비 효과가 부르는 것) ================= */
  function has(g, id) { return g.relics.indexOf(id) >= 0; }
  function ev(g, o) { if (!g.q) g.ev.push(o); }
  function hit(g, n) {   // 내가 적을 공격
    var cb = g.cb, e = cb.e, v = cb.cur;
    if (e.hp <= 0) return;
    n += (cb.st.str || 0);
    if (v && v % 2 === 0 && has(g, 'evenglove')) n += 2;
    if (v && v <= 3 && has(g, 'glasses')) n += 2;
    if (!cb.fh && has(g, 'sharp')) n += 6;
    cb.fh = 1;
    if (cb.st.weak) n = Math.floor(n * 0.75);
    if (e.st.vuln) n = Math.floor(n * 1.5);
    if (n < 0) n = 0;
    var ab = Math.min(e.block, n); e.block -= ab; e.hp -= n - ab; g.stats.dmg += n - ab;
    ev(g, { k: 'hit', n: n - ab, b: ab });
    if (e.st.thorns && e.hp > 0) hurt(g, e.st.thorns);
  }
  function zap(g, n) {   // 유물 등의 고정 피해 (힘·약화 무관, 방어는 뚫지 못함)
    var e = g.cb.e; if (e.hp <= 0) return;
    var ab = Math.min(e.block, n); e.block -= ab; e.hp -= n - ab; g.stats.dmg += n - ab;
    ev(g, { k: 'hit', n: n - ab, b: ab });
  }
  function hurt(g, n) {   // 내가 맞음 (방어가 먼저 깎임)
    var cb = g.cb, ab = Math.min(cb.blk, n); cb.blk -= ab; g.hp -= n - ab; g.stats.taken += n - ab;
    ev(g, { k: 'phit', n: n - ab, b: ab });
  }
  function lose(g, n) { g.hp -= n; g.stats.taken += n; ev(g, { k: 'phit', n: n, b: 0 }); }   // 방어 무시
  function blk(g, n) {
    var cb = g.cb, v = cb.cur;
    if (v && v % 2 === 1 && has(g, 'oddsock')) n += 2;
    cb.blk += n; ev(g, { k: 'blk', n: n });
  }
  function foe(g, s, n) {
    if (s === 'poison') n += (has(g, 'vial') ? 1 : 0) + (has(g, 'c_troll') ? 1 : 0);
    if (s === 'burn') n += (has(g, 'lighter') ? 2 : 0) + (has(g, 'c_troll') ? 1 : 0);
    var e = g.cb.e; e.st[s] = (e.st[s] || 0) + n; ev(g, { k: 'st', who: 'e', s: s, n: n });
  }
  function me(g, s, n) { var st = g.cb.st; st[s] = (st[s] || 0) + n; ev(g, { k: 'st', who: 'p', s: s, n: n }); }
  function heal(g, n) { var b = g.hp; g.hp = Math.min(g.max, g.hp + n); if (g.hp > b) ev(g, { k: 'heal', n: g.hp - b }); return g.hp - b; }
  function give(g, arr) { var cb = g.cb; for (var i = 0; i < arr.length; i++) if (cb.dice.length < MAXDICE) cb.dice.push(Math.max(1, Math.min(6, arr[i]))); ev(g, { k: 'give' }); }
  function d6(g) { var v = 1 + ri(g, 'c', 6); if (v === 1 && has(g, 'heavy')) v = 2; return v; }
  function gold(g, n) { g.gold += n; g.stats.gold += n; ev(g, { k: 'gold', n: n }); }
  function pl(n) { return n ? '+' + n : ''; }
  function nn(n) { return n ? '눈+' + n : '눈만큼'; }   // 설명 글: '눈만큼 피해' · '눈+2 피해'

  /* ================= 장비 =================
   * need: any · even · odd · max(이하) · min(이상) · eq · pair(같은 눈 2개) · two(아무 2개) · sum(합이 딱 v, 2개) · cd(카운트다운 — 넣은 눈만큼 줄고 0 이 되면 발동, 턴이 지나도 유지)
   * uses 한 턴에 쓸 수 있는 횟수(기본 1) · cu 한 전투에 쓸 수 있는 횟수 · r 등급 c 흔함 · u 드묾 · r 희귀 · pw 봇·상점용 대략적인 세기 */
  var EQ = {}, EQ_IDS = [];
  function Q(id, n, e, r, pw, f) { EQ[id] = { id: id, n: n, e: e, r: r, pw: pw, v: [f(0), f(1)] }; EQ_IDS.push(id); }
  Q('sword', '검', '⚔️', 'c', 5, function (u) { var b = u ? 2 : 0; return { need: ['any'], d: nn(b) + ' 피해', fx: function (g, d) { hit(g, d + b); } }; });
  Q('dagger', '단검', '🗡️', 'c', 5, function (u) { return { need: ['max', 3], uses: u ? 3 : 2, d: '눈+2 피해', fx: function (g, d) { hit(g, d + 2); } }; });
  Q('hammer', '망치', '🔨', 'c', 6, function (u) { var b = u ? 3 : 1; return { need: ['min', 4], d: '눈+' + b + ' 피해 · 6이면 취약 2', fx: function (g, d) { hit(g, d + b); if (d === 6) foe(g, 'vuln', 2); } }; });
  Q('axe', '도끼', '🪓', 'c', 6, function (u) { var b = u ? 5 : 3; return { need: ['even'], d: '눈+' + b + ' 피해', fx: function (g, d) { hit(g, d + b); } }; });
  Q('spear', '창', '🔱', 'c', 6, function (u) { var b = u ? 5 : 3; return { need: ['odd'], d: '눈+' + b + ' 피해', fx: function (g, d) { hit(g, d + b); } }; });
  Q('bow', '활', '🏹', 'c', 5, function (u) { var b = u ? 8 : 6; return { need: ['max', 4], d: b + ' 피해', fx: function (g) { hit(g, b); } }; });
  Q('twin', '쌍둥이 검', '👯', 'u', 7, function (u) { var m = u ? 4 : 3; return { need: ['pair'], d: '눈×' + m + '+3 피해', fx: function (g, d) { hit(g, d * m + 3); } }; });
  Q('whip', '채찍', '➰', 'u', 6, function (u) { var b = u ? 2 : 0; return { need: ['any'], d: nn(b) + ' 피해 · 약화 1', fx: function (g, d) { hit(g, d + b); foe(g, 'weak', 1); } }; });
  Q('snake', '뱀눈 폭탄', '💣', 'u', 5, function (u) { var b = u ? 16 : 12; return { need: ['eq', 1], d: b + ' 피해', fx: function (g) { hit(g, b); } }; });
  Q('lucky7', '럭키 세븐', '🎰', 'u', 6, function (u) { var b = u ? 22 : 16; return { need: ['sum', 7], d: b + ' 피해', fx: function (g) { hit(g, b); } }; });
  Q('flurry', '연타', '👊', 'u', 6, function (u) { var b = u ? 4 : 3; return { need: ['any'], d: b + ' 피해 ×2', fx: function (g) { hit(g, b); hit(g, b); } }; });
  Q('bash', '방패 강타', '💥', 'u', 5, function (u) { var b = u ? 4 : 0; return { need: ['max', 3], d: (b ? '내 방어+' + b : '내 방어만큼') + ' 피해', fx: function (g) { hit(g, g.cb.blk + b); } }; });
  Q('wand', '마법 지팡이', '🪄', 'u', 6, function (u) { var b = u ? 20 : 15; return { need: ['cd', 10], d: b + ' 피해', fx: function (g) { hit(g, b); } }; });
  Q('cannon', '대포', '🧨', 'r', 7, function (u) { var b = u ? 36 : 28; return { need: ['cd', 15], d: b + ' 피해', fx: function (g) { hit(g, b); } }; });
  Q('crit', '크리티컬', '🎯', 'r', 7, function (u) { var b = u ? 20 : 15; return { need: ['eq', 6], d: b + ' 피해', fx: function (g) { hit(g, b); } }; });
  Q('fang', '흡혈 송곳니', '🦷', 'r', 7, function (u) { var b = u ? 2 : 0, h = u ? 3 : 2; return { need: ['max', 4], d: nn(b) + ' 피해 · 체력 +' + h, fx: function (g, d) { hit(g, d + b); heal(g, h); } }; });
  Q('exec', '마무리 일격', '⚰️', 'r', 7, function (u) { var b = u ? 3 : 0; return { need: ['min', 4], d: nn(b) + ' 피해 · 적 체력 ⅓ 이하면 ×3', fx: function (g, d) { var e = g.cb.e; hit(g, (d + b) * (e.hp * 3 <= e.max ? 3 : 1)); } }; });
  Q('shield', '방패', '🛡️', 'c', 5, function (u) { var b = u ? 2 : 0; return { need: ['any'], d: nn(b) + ' 방어', fx: function (g, d) { blk(g, d + b); } }; });
  Q('tower', '큰 방패', '🚪', 'c', 6, function (u) { var b = u ? 5 : 3; return { need: ['even'], d: '눈+' + b + ' 방어', fx: function (g, d) { blk(g, d + b); } }; });
  Q('buckler', '손방패', '🥏', 'c', 5, function (u) { return { need: ['max', 3], uses: u ? 3 : 2, d: '눈+2 방어', fx: function (g, d) { blk(g, d + 2); } }; });
  Q('cactus', '가시 갑옷', '🌵', 'u', 6, function (u) { var b = u ? 3 : 0; return { need: ['odd'], d: nn(b) + ' 방어 · 가시 1', fx: function (g, d) { blk(g, d + b); me(g, 'thorns', 1); } }; });
  Q('wall', '철벽', '🧱', 'u', 6, function (u) { var b = u ? 13 : 10; return { need: ['min', 5], d: b + ' 방어', fx: function (g) { blk(g, b); } }; });
  Q('counter', '맞받아치기', '🤺', 'u', 7, function (u) { var b = u ? 5 : 2; return { need: ['pair'], d: '눈×2+' + b + ' 피해와 방어', fx: function (g, d) { blk(g, d * 2 + b); hit(g, d * 2 + b); } }; });
  Q('book', '룰북', '📖', 'u', 6, function (u) { var b = u ? 14 : 10; return { need: ['cd', 8], d: b + ' 방어 · 약화 1', fx: function (g) { blk(g, b); foe(g, 'weak', 1); } }; });
  Q('bandage', '붕대', '🩹', 'u', 6, function (u) { return { need: ['max', 3], cu: u ? 3 : 2, d: '눈+2 체력 회복', fx: function (g, d) { heal(g, d + 2); } }; });
  Q('thermos', '보온병', '🍵', 'r', 6, function (u) { var b = u ? 11 : 8; return { need: ['cd', 12], cu: 2, d: '체력 ' + b + ' 회복', fx: function (g) { heal(g, b); } }; });
  Q('bump', '톡 건드리기', '👆', 'c', 4, function (u) { return { need: ['max', 5], uses: u ? 2 : 1, d: '눈 +1 해서 돌려받음', fx: function (g, d) { give(g, [d + 1]); } }; });
  Q('flip', '뒤집기', '🔄', 'c', 4, function (u) { return { need: ['any'], uses: u ? 2 : 1, d: '뒤집어 돌려받음 (1↔6 2↔5 3↔4)', fx: function (g, d) { give(g, [7 - d]); } }; });
  Q('split', '쪼개기', '✂️', 'u', 5, function (u) { return { need: ['min', 2], uses: u ? 2 : 1, d: '주사위 2개로 나눔', fx: function (g, d) { give(g, [Math.ceil(d / 2), Math.floor(d / 2)]); } }; });
  Q('merge', '합치기', '🧲', 'u', 3, function (u) { return { need: ['two'], uses: u ? 2 : 1, d: '하나로 합침 (6 넘으면 6+나머지)', fx: function (g, d) { give(g, d > 6 ? [6, d - 6] : [d]); } }; });
  Q('copy', '복사기', '🖨️', 'r', 6, function (u) { return { need: ['max', u ? 4 : 3], d: '같은 눈 2개로 돌려받음', fx: function (g, d) { give(g, [d, d]); } }; });
  Q('cup', '주사위 컵', '🥤', 'c', 4, function (u) { return { need: ['any'], uses: u ? 3 : 2, d: '다시 굴려서 돌려받음', fx: function (g) { give(g, [d6(g)]); } }; });
  Q('charm', '행운의 부적', '🧿', 'u', 5, function (u) { var k = u ? 3 : 2; return { need: ['max', 2], d: '새 주사위 ' + k + '개', fx: function (g) { var a = []; for (var i = 0; i < k; i++) a.push(d6(g)); give(g, a); } }; });
  Q('dart', '독침', '💉', 'c', 6, function (u) { var b = u ? 3 : 2; return { need: ['max', 4], d: '독 ' + b, fx: function (g) { foe(g, 'poison', b); } }; });
  Q('torch', '횃불', '🔥', 'c', 6, function (u) { var b = u ? 2 : 0; return { need: ['odd'], d: nn(b) + ' 화상', fx: function (g, d) { foe(g, 'burn', d + b); } }; });
  Q('molotov', '화염병', '🍾', 'u', 6, function (u) { var m = u ? 4 : 3; return { need: ['pair'], d: '눈×' + m + '+2 화상', fx: function (g, d) { foe(g, 'burn', d * m + 2); } }; });
  Q('cloud', '독 구름', '☁️', 'u', 6, function (u) { var b = u ? 9 : 7; return { need: ['cd', 9], d: '독 ' + b, fx: function (g) { foe(g, 'poison', b); } }; });
  Q('shout', '함성', '📣', 'u', 6, function (u) { return { need: ['min', u ? 4 : 5], cu: 3, d: '힘 +1 (전투 끝까지)', fx: function (g) { me(g, 'str', 1); } }; });
  Q('scan', '약점 분석', '🔍', 'u', 5, function (u) { var b = u ? 3 : 2; return { need: ['max', 2], d: '취약 ' + b, fx: function (g) { foe(g, 'vuln', b); } }; });
  Q('wallet', '지갑', '👛', 'u', 3, function (u) { var b = u ? 3 : 0; return { need: ['even'], cu: 3, d: nn(b) + ' 골드', fx: function (g, d) { gold(g, d + b); } }; });

  function GV(id, a, b) { EQ[id].v[0].gv = a; EQ[id].v[1].gv = b == null ? a : b; }   // gv: 발동하면 돌려받는 주사위 수 — 주사위는 MAXDICE 개까지라 넘치면 못 넣음
  GV('bump', 1); GV('flip', 1); GV('split', 2); GV('merge', 2); GV('copy', 2); GV('cup', 1); GV('charm', 2, 3);
  function variant(q) { return EQ[q.id].v[q.up ? 1 : 0]; }
  function needText(need) {
    switch (need[0]) {
      case 'any': return '아무 눈';
      case 'even': return '짝수';
      case 'odd': return '홀수';
      case 'max': return need[1] + ' 이하';
      case 'min': return need[1] + ' 이상';
      case 'eq': return need[1] + '만';
      case 'pair': return '같은 눈 2개';
      case 'two': return '아무거나 2개';
      case 'sum': return '합 ' + need[1] + ' (2개)';
      case 'cd': return '카운트 ' + need[1];
    }
    return '';
  }
  function cdFull(g, q) { return Math.max(3, variant(q).need[1] - (has(g, 'hourglass') ? 2 : 0)); }

  /* ================= 유물 ================= r: c 보통 · r 희귀(보스·정예에서 더 잘 나옴) · x 직업 전용(보상에 안 나옴) */
  var RELIC = {
    clover: { n: '네잎클로버', e: '🍀', r: 'r', d: '턴마다 다시 굴리기 +1' },
    coffee: { n: '진한 커피', e: '☕', r: 'c', d: '전투 첫 턴에 주사위 +2' },
    heavy: { n: '묵직한 주사위', e: '🪨', r: 'c', d: '굴린 주사위의 1 이 2 가 돼요 (1 이 필요한 뱀눈 폭탄 · 뱀눈 부적과는 같이 나오지 않아요)' },
    gmeeple: { n: '황금 미플', e: '🏅', r: 'c', d: '전투에서 얻는 골드 +50%' },
    sleeve: { n: '프리미엄 슬리브', e: '🎴', r: 'c', d: '전투를 방어 8 로 시작' },
    mat: { n: '플레이매트', e: '🟩', r: 'c', d: '최대 체력 +12 (얻을 때 바로)' },
    snack: { n: '간식 바구니', e: '🍪', r: 'c', d: '전투에서 이기면 체력 4 회복' },
    crown: { n: '6면 왕관', e: '👑', r: 'c', d: '6 을 쓸 때마다 적에게 4 피해' },
    snakeeye: { n: '뱀눈 부적', e: '🐍', r: 'c', d: '1 을 쓸 때마다 방어 4' },
    first: { n: '선 플레이어 토큰', e: '🥇', r: 'c', d: '전투 시작 때 적에게 취약 2' },
    tsleeve: { n: '가시 슬리브', e: '🦔', r: 'c', d: '전투를 가시 2 로 시작' },
    dartboard: { n: '독 다트판', e: '🎯', r: 'c', d: '전투 시작 때 적에게 독 4' },
    hourglass: { n: '모래시계', e: '⏳', r: 'c', d: '카운트다운 장비의 숫자 -2' },
    expansion: { n: '확장팩', e: '📦', r: 'c', d: '장비 보상 선택지 +1' },
    coupon: { n: '할인 쿠폰', e: '🎟️', r: 'c', d: '상점 가격 25% 할인' },
    summary: { n: '룰 요약표', e: '📋', r: 'r', d: '턴마다 가장 낮은 주사위 +1' },
    chip: { n: '승점 칩', e: '🪙', r: 'r', d: '전투를 힘 1 로 시작' },
    errata: { n: '에러플 방지 카드', e: '🃏', r: 'r', d: '쓰러질 때 한 번, 체력 40% 로 일어나요' },
    cushion: { n: '푹신한 방석', e: '🛋️', r: 'c', d: '휴식 회복량 +50%' },
    doubles: { n: '쌍둥이 주사위', e: '🎲', r: 'c', d: '턴 시작 굴림에 같은 눈이 있으면 방어 4' },
    tidy: { n: '깔끔한 정리', e: '🧹', r: 'c', d: '주사위를 다 쓰고 턴을 끝내면 방어 4' },
    trophy: { n: '트로피', e: '🏆', r: 'c', d: '적을 쓰러뜨릴 때마다 최대 체력 +2' },
    lighter: { n: '라이터', e: '🧯', r: 'c', d: '화상을 줄 때 +2' },
    vial: { n: '맹독 병', e: '🧪', r: 'c', d: '독을 줄 때 +1' },
    whistle: { n: '벙주의 호루라기', e: '📯', r: 'c', d: '정예·보스전에서 턴마다 다시 굴리기 +1' },
    piggy: { n: '저금통', e: '🐷', r: 'c', d: '방을 지날 때마다 골드 +4' },
    evenglove: { n: '짝수 장갑', e: '🧤', r: 'c', d: '짝수 눈으로 주는 피해 +2' },
    oddsock: { n: '홀수 양말', e: '🧦', r: 'c', d: '홀수 눈으로 얻는 방어 +2' },
    glasses: { n: '돋보기 안경', e: '👓', r: 'c', d: '3 이하 눈으로 주는 피해 +2' },
    thick: { n: '두꺼운 룰북', e: '📚', r: 'r', d: '남은 방어의 절반이 다음 턴까지 유지' },
    buddy: { n: '든든한 동료 미플', e: '🧸', r: 'c', d: '턴이 시작될 때 방어 2' },
    party: { n: '뒤풀이 쿠폰', e: '🍻', r: 'c', d: '정예·보스를 이기면 체력 12 회복' },
    sharp: { n: '뾰족한 연필', e: '✏️', r: 'c', d: '전투의 첫 공격 피해 +6' },
    spare: { n: '여분 주사위', e: '🎁', r: 'r', d: '굴리는 주사위 +1' },
    c_plan: { n: '작전 노트', e: '📝', r: 'x', d: '전투를 방어 6 으로 시작' },
    c_party: { n: '분위기 메이커', e: '🎉', r: 'x', d: '턴마다 다시 굴리기 +1' },
    c_rule: { n: '에라타', e: '📎', r: 'x', d: '카운트다운 장비가 발동하면 새 주사위 1개' },
    c_troll: { n: '고인물의 미소', e: '😏', r: 'x', d: '독·화상을 줄 때 +1' }
  };
  var RELIC_IDS = Object.keys(RELIC).filter(function (k) { return RELIC[k].r !== 'x'; });

  /* ================= 직업 ================= */
  var CLASS = {
    plan: { n: '전략가', e: '♟️', hp: 58, eq: ['sword', 'shield', 'bump'], relic: 'c_plan', d: '검과 방패의 정석. 처음이라면 이 직업으로.', unlock: '' },
    party: { n: '파티 게이머', e: '🎉', hp: 50, eq: ['dagger', 'twin', 'buckler', 'cup'], relic: 'c_party', d: '낮은 눈과 같은 눈을 노려요. 다시 굴리기가 하나 더.', unlock: '1막 보스를 쓰러뜨리면 열려요' },
    rule: { n: '룰 마스터', e: '📖', hp: 48, eq: ['wand', 'book', 'sword'], relic: 'c_rule', d: '카운트다운 장비를 차곡차곡 채워 한 방에.', unlock: '2막 보스를 쓰러뜨리면 열려요' },
    troll: { n: '트롤러', e: '😈', hp: 47, eq: ['dart', 'torch', 'cactus'], relic: 'c_troll', d: '독 · 화상 · 가시로 서서히 말려 죽여요.', unlock: '던전을 한 번 클리어하면 열려요' }
  };
  var CLASS_IDS = ['plan', 'party', 'rule', 'troll'];

  /* ================= 적 =================
   * mv: 순서대로 되풀이하는 행동 {t 말, a 피해, h 횟수, b 방어, p 나에게 거는 상태, s 자기 상태, heal}
   * init: 시작 상태 · grow: 한 바퀴 돌 때마다 얻는 힘 · ph2: 체력이 at 이하가 되면 바뀌는 행동 */
  var ENEMY = {
    /* 1막 */
    rat: { n: '주사위 도둑', e: '🐀', act: 0, k: 'f', hp: 20, mv: [{ t: '슬쩍', a: 5 }, { t: '주사위 슬쩍', a: 3, p: { seal: 1 } }, { t: '도망치며 한 방', a: 6 }] },
    kibitz: { n: '훈수꾼', e: '🗣️', act: 0, k: 'f', hp: 24, mv: [{ t: '“거기 두면 안 되는데”', a: 3, h: 2 }, { t: '끝없는 훈수', b: 5, p: { weak: 1 } }, { t: '“내가 그럴 줄 알았지”', a: 7 }] },
    greasy: { n: '과자 묻은 손', e: '🍟', act: 0, k: 'f', hp: 22, mv: [{ t: '카드에 기름 자국', a: 2, p: { poison: 2 } }, { t: '덥석', a: 5 }, { t: '덥석', a: 5 }] },
    nosleeve: { n: '슬리브 없는 카드', e: '🃏', act: 0, k: 'f', hp: 18, mv: [{ t: '모서리 찍힘', a: 4, b: 4 }, { t: '종이 베임', a: 6 }] },
    ghost: { n: '분실 컴포넌트 유령', e: '👻', act: 0, k: 'f', hp: 25, mv: [{ t: '“내 토큰 못 봤어…?”', a: 4 }, { t: '오싹', a: 3, p: { vuln: 2 } }, { t: '상자 속에서 와락', a: 8 }] },
    asker: { n: '질문 폭격기', e: '🙋', act: 0, k: 'f', hp: 23, mv: [{ t: '“이건 뭐예요?”', p: { weak: 2 }, b: 4 }, { t: '“그럼 이건요?”', a: 6 }, { t: '“아 그럼 이건요?”', a: 6 }] },
    drink: { n: '엎질러진 커피', e: '🥤', act: 0, k: 'f', hp: 27, mv: [{ t: '찰랑', a: 4 }, { t: '뜨거워!', a: 3, p: { burn: 2 } }, { t: '보드판 침수', a: 7 }] },
    norule: { n: '룰북 안 읽고 온 사람', e: '📕', act: 0, k: 'e', hp: 40, mv: [{ t: '“하면서 배울게요”', b: 6, s: { str: 2 } }, { t: '룰 무시 플레이', a: 6 }, { t: '“이거 돼요?” 연타', a: 4, h: 2 }] },
    thinker: { n: '장고 대마왕', e: '🤔', act: 0, k: 'e', hp: 42, grow: 2, mv: [{ t: '장고 중…', b: 7 }, { t: '아직도 장고 중…', b: 7, p: { weak: 1 } }, { t: '드디어 둔 한 수', a: 15 }] },
    late: { n: '지각한 벙주', e: '⏰', act: 0, k: 'b', hp: 76, mv: [{ t: '“미안, 차가 막혀서”', a: 6 }, { t: '허겁지겁 세팅', a: 4, h: 2 }, { t: '“자 빨리 시작하자”', b: 9, s: { str: 1 } }, { t: '속전속결 진행', a: 10 }],
      ph2: { at: 0.5, t: '“시간 없어, 두 판 연속!”', mv: [{ t: '두 판 연속', a: 5, h: 2, p: { seal: 1 } }, { t: '마감 시간 압박', a: 12 }, { t: '숨 고르기', b: 8, s: { str: 1 } }] } },
    /* 2막 */
    kingmaker: { n: '킹메이커', e: '👑', act: 1, k: 'f', hp: 44, mv: [{ t: '“넌 내가 막는다”', a: 5, p: { vuln: 2 } }, { t: '몰아주기', a: 10 }, { t: '견제 또 견제', a: 6, h: 2 }] },
    ap: { n: '분석 마비', e: '🧠', act: 1, k: 'f', hp: 50, mv: [{ t: '경우의 수 계산 중', b: 10 }, { t: '최적의 한 수', a: 14 }, { t: '“잠깐, 무를게요”', a: 6, p: { weak: 2 } }] },
    cat: { n: '테이블 위 고양이', e: '🐈', act: 1, k: 'f', hp: 40, mv: [{ t: '냥냥 펀치', a: 5, h: 2 }, { t: '주사위 떨어뜨리기', a: 6, p: { seal: 1 } }, { t: '우다다', a: 4, h: 3 }] },
    shuffler: { n: '무한 셔플러', e: '🔀', act: 1, k: 'f', hp: 46, mv: [{ t: '리플 셔플', a: 9 }, { t: '끝없이 섞기', b: 8, s: { str: 1 } }, { t: '카드 날리기', a: 7, p: { seal: 1 } }] },
    fairy: { n: '에러플 요정', e: '🧚', act: 1, k: 'f', hp: 42, mv: [{ t: '“그 룰 아닌데…”', p: { poison: 4 } }, { t: '되감기', a: 8 }, { t: '혼란 가루', a: 4, p: { weak: 1, vuln: 2 } }, { t: '처음부터 다시', a: 11 }] },
    alpha: { n: '알파 게이머', e: '🧔', act: 1, k: 'f', hp: 52, mv: [{ t: '“내 말대로 해”', a: 9 }, { t: '“아니 그게 아니라”', a: 8, p: { weak: 1 } }, { t: '혼자 다 하기', b: 6, s: { str: 2 } }] },
    hotpot: { n: '쏟아진 라면 국물', e: '🍜', act: 1, k: 'f', hp: 45, mv: [{ t: '국물 튐', a: 5, p: { burn: 3 } }, { t: '보드판 범람', a: 10 }, { t: '끈적끈적', a: 8, b: 5 }] },
    counter: { n: '카드 카운팅 고수', e: '🧮', act: 1, k: 'e', hp: 78, init: { thorns: 2 }, mv: [{ t: '“그 카드 이미 나왔어”', a: 10 }, { t: '덱 외우기', b: 12, s: { thorns: 1 } }, { t: '확률 계산 완료', a: 7, h: 2 }] },
    dtower: { n: '무너지는 주사위 탑', e: '🗼', act: 1, k: 'e', hp: 84, mv: [{ t: '흔들흔들', b: 10, s: { str: 1 } }, { t: '주사위 우박', a: 5, h: 3 }, { t: '와르르', a: 16 }, { t: '주사위가 사라졌다', a: 4, p: { seal: 2 } }] },
    collector: { n: '확장팩 수집가', e: '🧙', act: 1, k: 'b', hp: 144, mv: [{ t: '“이번에 나온 신작인데”', a: 10 }, { t: '확장팩 추가', b: 14, s: { str: 1 } }, { t: '룰 추가 설명', a: 7, h: 2, p: { vuln: 2 } }, { t: '박스 눈사태', a: 17 }, { t: '프로모 카드 뿌리기', a: 4, p: { poison: 4 } }],
      ph2: { at: 0.4, t: '“킥스타터 올인 에디션이다!”', mv: [{ t: '올인 에디션', b: 10, s: { str: 2 } }, { t: '미니어처 군단', a: 6, h: 3 }, { t: '박스 눈사태', a: 18 }, { t: '끝없는 언박싱', a: 9, p: { seal: 1 } }] } },
    /* 3막 */
    flipper: { n: '판 엎는 사람', e: '🙃', act: 2, k: 'f', hp: 83, mv: [{ t: '부들부들', a: 13 }, { t: '탁자 쾅', a: 10, h: 2 }, { t: '판 엎기', a: 24 }] },
    lawyer: { n: '룰 변호사', e: '⚖️', act: 2, k: 'f', hp: 90, mv: [{ t: '“룰북 12쪽에 따르면”', b: 10, p: { weak: 2 } }, { t: '이의 있음', a: 16 }, { t: '판례 인용', a: 10, p: { vuln: 2 } }, { t: '최종 변론', a: 19 }] },
    marathon: { n: '6시간짜리 게임', e: '🕰️', act: 2, k: 'f', hp: 108, grow: 2, mv: [{ t: '세팅만 40분', b: 12, s: { str: 1 } }, { t: '1라운드', a: 12 }, { t: '아직 2라운드', a: 13 }] },
    troll: { n: '트롤', e: '🧌', act: 2, k: 'f', hp: 95, mv: [{ t: '일부러 그러는 거지?', a: 11, p: { poison: 3 } }, { t: '불 지르기', a: 11, p: { burn: 3 } }, { t: '낄낄', a: 18 }] },
    pro: { n: '연승 중인 고수', e: '😎', act: 2, k: 'f', hp: 88, mv: [{ t: '콤보', a: 7, h: 3 }, { t: '여유로운 방어', a: 11, b: 10 }, { t: '엔진 완성', a: 22 }] },
    cursed: { n: '저주받은 주사위', e: '🎲', act: 2, k: 'f', hp: 83, mv: [{ t: '또 1 이 나온다', a: 12, p: { seal: 1 } }, { t: '데굴데굴', a: 7, h: 2, p: { weak: 1 } }, { t: '모서리로 찍기', a: 17, p: { seal: 1 } }] },
    brick: { n: '벽돌 게임 상자', e: '🗿', act: 2, k: 'f', hp: 105, init: { thorns: 1 }, mv: [{ t: '묵직', b: 14 }, { t: '발등 찍기', a: 14, s: { thorns: 1 } }, { t: '선반에서 추락', a: 20 }] },
    mimic: { n: '미믹 게임 박스', e: '🧰', act: 2, k: 'e', hp: 148, mv: [{ t: '덥석', a: 14, p: { seal: 1 } }, { t: '질겅질겅', a: 10, h: 2 }, { t: '뚜껑 닫기', b: 15, s: { str: 2 } }, { t: '통째로 삼키기', a: 25 }] },
    darkhost: { n: '흑화한 벙주', e: '👿', act: 2, k: 'e', hp: 158, grow: 1, mv: [{ t: '“오늘 노쇼가 몇 명이야”', a: 6, p: { vuln: 2, weak: 1 } }, { t: '회비 독촉', a: 17 }, { t: '강제 조 편성', a: 11, h: 2 }, { t: '모임 폭파 선언', a: 28 }] },
    jammanbo: { n: '잠만보', e: '😴', act: 2, k: 'b', hp: 330, mv: [{ t: '쿨쿨…', b: 16 }, { t: '뒤척임', a: 13 }, { t: '코골이', a: 7, h: 2, p: { weak: 1 } }, { t: '잠꼬대 펀치', a: 18 }],
      ph2: { at: 0.55, t: '잠만보가 눈을 떴다!', mv: [{ t: '기지개', b: 12, s: { str: 3 } }, { t: '배고파!', a: 11, h: 2 }, { t: '몸통 박치기', a: 26 }, { t: '하품', a: 10, p: { seal: 1, vuln: 2 } }, { t: '뒹굴뒹굴', a: 8, h: 3 }] } }
  };
  var ENEMY_IDS = Object.keys(ENEMY);
  function pool(act, k) { return ENEMY_IDS.filter(function (id) { return ENEMY[id].act === act && ENEMY[id].k === k; }); }
  var BOSS = ['late', 'collector', 'jammanbo'];
  var ACT_NAME = ['1막 · 모임 장소 가는 길', '2막 · 보드게임 카페', '3막 · 새벽의 뒤풀이'];

  /* ================= 승천 (클리어할 때마다 한 단계씩 열림, 누적) ================= */
  var ASC = ['적 체력 +10%', '적 피해 +10%', '시작 체력 -6', '정예가 힘 1 로 시작', '상점 가격 +15%', '보스 체력 +15%', '휴식 회복량 감소', '2 · 3막 적 피해 +15% 더', '전투 골드 -25%', '보스가 힘을 갖고 시작 (1막 1 · 2막 2 · 3막 3)'];

  /* ================= 판 만들기 · 지도 ================= */
  function newRun(o) {
    o = o || {};
    var C = CLASS[o.cls] || CLASS.plan, cls = CLASS[o.cls] ? o.cls : 'plan', seed = (o.seed >>> 0) || 1, asc = Math.max(0, Math.min(ASC.length, o.asc | 0));
    var g = {
      v: SAVE_VER, seed: seed, cls: cls, asc: asc, daily: o.daily || '',
      rs: { m: seed ^ 0x9E3779B9, r: (seed * 31 + 7) | 0, c: (seed * 131 + 13) | 0 },
      hp: C.hp, max: C.hp, gold: 30, dice: 3, rerolls: 1,
      eq: C.eq.map(function (id) { return { id: id, up: 0 }; }), relics: [C.relic],
      act: 0, row: -1, col: 1, path: [], map: null, phase: 'map', pend: [], adv: false,
      cb: null, shop: null, evt: null, last: null, win: false, over: null,
      stats: { kills: 0, elites: 0, bosses: 0, dmg: 0, taken: 0, gold: 0, turns: 0, rooms: 0 },
      seen: { e: [], r: [C.relic], q: C.eq.slice() }, ev: []
    };
    if (asc >= 3) { g.max -= 6; g.hp -= 6; }
    // 세 막의 지도와 방마다 나올 적 · 사건을 지금 다 정함 → 어느 길로 가든 같은 씨앗이면 같은 던전
    var decks = {};
    g.maps = []; for (var a = 0; a < ACTS; a++) g.maps.push(genMap(g, a, decks));
    g.map = g.maps[0].rows; g.ids = g.maps[0].ids;
    return g;
  }
  // 한 막 = 7줄 × 3칸 + 보스. 다음 줄은 바로 위 · 대각선 칸으로만. f 전투 · e 정예 · s 상점 · r 휴식 · v 사건
  function genMap(g, act, decks) {
    var rows = [], ids = [], r, c;
    for (r = 0; r < ROWS; r++) {
      var row = [];
      for (c = 0; c < 3; c++) {
        var t;
        if (r === 0) t = 'f';
        else if (r === ROWS - 1) t = 'r';
        else {
          var w = { f: 44, v: 24, e: r >= 2 ? (r >= 3 ? 16 : 8) : 0, s: r >= 1 ? 11 : 0, r: (r >= 2 && r <= 4) ? 9 : 0 };
          if (row.indexOf('s') >= 0) w.s = 0;
          if (row.indexOf('r') >= 0) w.r = 0;
          if (row.indexOf('e') >= 0) w.e = 0;
          if (r > 0 && rows[r - 1][c] === 'r') w.r = 0;
          if (r > 0 && rows[r - 1][c] === 's') w.s = 0;
          t = wpick(g, 'm', ['f', 'v', 'e', 's', 'r'], function (k) { return w[k]; });
        }
        row.push(t);
      }
      rows.push(row);
    }
    function any(t, a, b) { for (var i = a; i <= b; i++) if (rows[i].indexOf(t) >= 0) return true; return false; }
    if (!any('s', 1, 5)) rows[2 + ri(g, 'm', 3)][ri(g, 'm', 3)] = 's';
    if (!any('e', 2, 5)) rows[3 + ri(g, 'm', 2)][ri(g, 'm', 3)] = 'e';
    for (r = 1; r < ROWS - 1; r++) if (rows[r].indexOf('f') < 0 && rows[r].indexOf('v') < 0) rows[r][ri(g, 'm', 3)] = 'f';   // 줄마다 전투·사건이 하나는 있게
    for (r = 0; r < ROWS; r++) {   // 방마다 나올 적 · 사건 (섞은 더미에서 차례로 — 사건 더미는 세 막이 같이 씀)
      ids.push(rows[r].map(function (t) { return t === 'f' ? draw(g, decks, 'f' + act, pool(act, 'f')) : t === 'e' ? draw(g, decks, 'e' + act, pool(act, 'e')) : t === 'v' ? draw(g, decks, 'ev', EVENT_IDS) : ''; }));
    }
    return { rows: rows, ids: ids };
  }
  function floorOf(g) { return g.act * (ROWS + 1) + Math.max(0, g.row) + 1; }
  function nextCols(g) {
    if (g.row >= ROWS - 1) return [1];
    if (g.row < 0) return [0, 1, 2];
    var a = []; for (var c = 0; c < 3; c++) if (Math.abs(c - g.col) <= 1) a.push(c);
    return a;
  }
  function draw(g, decks, key, ids) {   // 섞은 더미에서 한 장 (다 쓰면 다시 섞음)
    var d = decks[key];
    if (!d || !d.length) d = decks[key] = shuffle(g, 'm', ids);
    return d.pop();
  }
  function go(g, col) {
    if (g.phase !== 'map') return false;
    var boss = g.row >= ROWS - 1;
    if (!boss && nextCols(g).indexOf(col) < 0) return false;
    g.row++; g.col = boss ? 1 : col; g.stats.rooms++;
    if (!boss) g.path.push(col);
    if (has(g, 'piggy')) { g.gold += 4; g.stats.gold += 4; }
    var t = boss ? 'b' : g.map[g.row][col], h = hashStr(g.seed + ':' + g.act + ':' + g.row + ':' + g.col);
    g.rs.r = h | 0; g.rs.c = (h ^ 0x5bd1e995) | 0;   // 방마다 난수를 다시 맞춤 — 지나온 길과 상관없이 같은 방은 같게
    if (t === 'f' || t === 'e') startCombat(g, g.ids[g.row][col]);
    else if (t === 'b') startCombat(g, BOSS[g.act]);
    else if (t === 's') { g.shop = genShop(g); g.phase = 'shop'; }
    else if (t === 'r') g.phase = 'rest';
    else { g.evt = { id: g.ids[g.row][col], res: '' }; g.phase = 'event'; }
    return true;
  }

  /* ================= 전투 ================= */
  function startCombat(g, id) {
    var E = ENEMY[id], a = g.asc;
    var hp = E.hp * (1 + 0.03 * Math.max(0, g.row)) * (a >= 1 ? 1.1 : 1) * (E.k === 'b' && a >= 6 ? 1.15 : 1);
    hp = Math.round(hp);
    var st = {}; if (E.init) for (var k in E.init) st[k] = E.init[k];
    if (E.k === 'e' && a >= 4) st.str = (st.str || 0) + 1;
    if (E.k === 'b' && a >= 10) st.str = (st.str || 0) + 1 + E.act;
    g.cb = { kind: E.k, e: { id: id, hp: hp, max: hp, block: 0, st: st, mi: 0, ph: 0 }, turn: 0, dice: [], rr: 0, blk: 0, st: {}, used: 0, rolled: 0, cur: 0, fh: 0,
      slots: g.eq.map(function (q) { return { u: 0, cu: 0, held: [], cd: variant(q).need[0] === 'cd' ? cdFull(g, q) : 0 }; }) };
    g.phase = 'combat'; g.ev = [];
    if (g.seen.e.indexOf(id) < 0) g.seen.e.push(id);
    if (has(g, 'c_plan')) g.cb.blk += 6;
    if (has(g, 'sleeve')) g.cb.blk += 8;
    if (has(g, 'first')) g.cb.e.st.vuln = (g.cb.e.st.vuln || 0) + 2;
    if (has(g, 'tsleeve')) g.cb.st.thorns = 2;
    if (has(g, 'dartboard')) g.cb.e.st.poison = (g.cb.e.st.poison || 0) + 4 + (has(g, 'vial') ? 1 : 0) + (has(g, 'c_troll') ? 1 : 0);   // foe() 와 같은 보너스
    if (has(g, 'chip')) g.cb.st.str = 1;
    startTurn(g, true);
  }
  function startTurn(g, first) {
    var cb = g.cb, i;
    cb.turn++; g.stats.turns++;
    if (!first) cb.blk = has(g, 'thick') ? Math.floor(cb.blk / 2) : 0;
    if (has(g, 'buddy')) cb.blk += 2;
    if (cb.st.poison > 0) { lose(g, cb.st.poison); cb.st.poison--; if (settle(g)) return; }
    for (i = 0; i < cb.slots.length; i++) { cb.slots[i].u = 0; cb.slots[i].held = []; }
    var n = g.dice + (has(g, 'spare') ? 1 : 0) + (first && has(g, 'coffee') ? 2 : 0) - (cb.st.seal || 0);
    cb.st.seal = 0;
    n = Math.max(1, Math.min(MAXDICE, n));
    cb.dice = []; for (i = 0; i < n; i++) cb.dice.push(d6(g));
    if (has(g, 'summary')) { var lo = 0; for (i = 1; i < n; i++) if (cb.dice[i] < cb.dice[lo]) lo = i; if (cb.dice[lo] < 6) cb.dice[lo]++; }
    if (has(g, 'doubles')) { var s = cb.dice.slice().sort(), dbl = false; for (i = 1; i < n; i++) if (s[i] === s[i - 1]) dbl = true; if (dbl) cb.blk += 4; }
    cb.rr = g.rerolls + (has(g, 'clover') ? 1 : 0) + (has(g, 'c_party') ? 1 : 0) + (cb.kind !== 'f' && has(g, 'whistle') ? 1 : 0);
    cb.used = 0; cb.rolled = n;
    ev(g, { k: 'roll' });
  }
  function moves(e) { var E = ENEMY[e.id]; return e.ph ? E.ph2.mv : E.mv; }
  function eDmg(g, base) {
    var cb = g.cb, a = g.asc, n = base * (1 + (a >= 2 ? 0.1 : 0) + (a >= 8 && g.act >= 1 ? 0.15 : 0)) + (cb.e.st.str || 0);
    if (cb.e.st.weak) n *= 0.75;
    if (cb.st.vuln) n *= 1.5;
    return Math.max(0, Math.floor(n));
  }
  // 적의 다음 행동 (예고) — 피해는 지금 상태로 계산한 값
  function intent(g) {
    var cb = g.cb, m = moves(cb.e)[cb.e.mi];
    return { t: m.t, a: m.a ? eDmg(g, m.a) : 0, h: m.a ? (m.h || 1) : 0, b: m.b || 0, p: m.p || null, s: m.s || null };
  }
  // 왜 못 넣는지: '' 넣을 수 있음 · x 잘못된 요청 · used 이번 턴에 다 씀 · cu 이번 전투에 다 씀 · need 눈이 안 맞음 · full 돌려받을 주사위 자리가 없음
  function whyNot(g, di, si) {
    var cb = g.cb; if (g.phase !== 'combat' || !cb) return 'x';
    var q = g.eq[si], v = cb.dice[di]; if (!q || !v) return 'x';
    var V = variant(q), sl = cb.slots[si], nd = V.need, ok = false, two = nd[0] === 'pair' || nd[0] === 'two' || nd[0] === 'sum';
    if (sl.u >= (V.uses || 1)) return 'used';
    if (V.cu && sl.cu >= V.cu) return 'cu';
    switch (nd[0]) {
      case 'any': case 'two': case 'cd': ok = true; break;
      case 'even': ok = v % 2 === 0; break;
      case 'odd': ok = v % 2 === 1; break;
      case 'max': ok = v <= nd[1]; break;
      case 'min': ok = v >= nd[1]; break;
      case 'eq': ok = v === nd[1]; break;
      case 'pair': ok = !sl.held.length || sl.held[0] === v; break;
      case 'sum': ok = sl.held.length ? sl.held[0] + v === nd[1] : (v < nd[1] && nd[1] - v <= 6); break;
    }
    if (!ok) return 'need';
    if (V.gv && (!two || sl.held.length) && cb.dice.length - 1 + V.gv > MAXDICE) return 'full';
    return '';
  }
  function canPlace(g, di, si) { return whyNot(g, di, si) === ''; }
  function slotOpen(g, si) {   // 이번 턴에 아직 쓸 수 있는 칸인가 (화면 표시용)
    var V = variant(g.eq[si]), sl = g.cb.slots[si];
    return sl.u < (V.uses || 1) && !(V.cu && sl.cu >= V.cu);
  }
  function burnCost(g, n) { var st = g.cb.st; for (var i = 0; i < n && st.burn > 0; i++) { lose(g, 1); st.burn--; } }
  function onDie(g, v) {
    g.cb.used++;
    if (v === 6 && has(g, 'crown')) zap(g, 4);
    if (v === 1 && has(g, 'snakeeye')) { g.cb.blk += 4; ev(g, { k: 'blk', n: 4 }); }
  }
  function fire(g, si, d, a, b) {
    var cb = g.cb, q = g.eq[si], V = variant(q), sl = cb.slots[si];
    cb.cur = V.need[0] === 'sum' || V.need[0] === 'two' || V.need[0] === 'cd' ? 0 : d;
    ev(g, { k: 'use', si: si });
    V.fx(g, d, a, b);
    cb.cur = 0; sl.u++; sl.cu++;
  }
  function place(g, di, si) {
    if (!canPlace(g, di, si)) return false;
    var cb = g.cb, q = g.eq[si], sl = cb.slots[si], v = cb.dice[di], k = variant(q).need[0];
    cb.dice.splice(di, 1);
    if (k === 'pair' || k === 'two' || k === 'sum') {
      if (!sl.held.length) { sl.held.push(v); return true; }
      var a = sl.held[0]; sl.held = [];
      burnCost(g, 2); if (settle(g)) return true;
      fire(g, si, k === 'pair' ? v : a + v, a, v);
      if (g.cb) { onDie(g, a); onDie(g, v); }
    } else if (k === 'cd') {
      burnCost(g, 1); if (settle(g)) return true;
      sl.cd -= v;
      if (sl.cd <= 0) { sl.cd = cdFull(g, q); fire(g, si, 0); if (has(g, 'c_rule')) give(g, [d6(g)]); }
      else ev(g, { k: 'cd', si: si });
      onDie(g, v);
    } else {
      burnCost(g, 1); if (settle(g)) return true;
      fire(g, si, v);
      onDie(g, v);
    }
    settle(g);
    return true;
  }
  function unplace(g, si) {
    var cb = g.cb; if (g.phase !== 'combat' || !cb || !cb.slots[si] || !cb.slots[si].held.length) return false;
    cb.dice.push(cb.slots[si].held.pop());
    return true;
  }
  function reroll(g, di) {
    var cb = g.cb; if (g.phase !== 'combat' || !cb || cb.rr <= 0 || !cb.dice.length) return false;
    if (di >= 0) { if (!cb.dice[di]) return false; cb.dice[di] = d6(g); }
    else for (var i = 0; i < cb.dice.length; i++) cb.dice[i] = d6(g);
    cb.rr--; ev(g, { k: 'roll', di: di });
    return true;
  }
  // 쓰러졌는지 확인 — 전투가 끝났으면 true
  function settle(g) {
    var cb = g.cb; if (!cb) return true;
    if (g.hp <= 0) {
      var i = g.relics.indexOf('errata');
      if (i >= 0) { g.relics.splice(i, 1); g.hp = Math.max(1, Math.round(g.max * 0.4)); ev(g, { k: 'revive' }); }
      else { g.hp = 0; die(g); return true; }
    }
    if (cb.e.hp <= 0) { cb.e.hp = 0; winCombat(g); return true; }
    return false;
  }
  function endTurn(g) {
    var cb = g.cb; if (g.phase !== 'combat' || !cb) return false;
    var e = cb.e, st = cb.st, i;
    var held = false;
    for (i = 0; i < cb.slots.length; i++) { if (cb.slots[i].held.length) held = true; cb.slots[i].held = []; }
    if (has(g, 'tidy') && !cb.dice.length && !held) { cb.blk += 4; ev(g, { k: 'blk', n: 4 }); }   // 칸에 걸쳐만 둔 주사위는 쓴 것이 아님
    cb.dice = [];
    if (st.weak > 0) st.weak--;
    if (e.st.vuln > 0) e.st.vuln--;
    /* ---- 적 차례 ---- */
    e.block = 0;
    if (e.st.poison > 0) { e.hp -= e.st.poison; g.stats.dmg += e.st.poison; ev(g, { k: 'hit', n: e.st.poison, b: 0, dot: 'poison' }); e.st.poison--; if (settle(g)) return true; }
    var m = moves(e)[e.mi], v0 = st.vuln || 0, k;
    ev(g, { k: 'emove', t: m.t, atk: !!m.a });
    if (m.a) {
      for (i = 0; i < (m.h || 1); i++) {
        hurt(g, eDmg(g, m.a));
        if (st.thorns > 0) { e.hp -= st.thorns; g.stats.dmg += st.thorns; ev(g, { k: 'hit', n: st.thorns, b: 0, dot: 'thorns' }); }
        if (settle(g)) return true;
      }
    }
    if (m.b) { e.block += m.b; ev(g, { k: 'eblk', n: m.b }); }
    if (m.heal) e.hp = Math.min(e.max, e.hp + m.heal);
    if (m.s) for (k in m.s) { e.st[k] = (e.st[k] || 0) + m.s[k]; ev(g, { k: 'st', who: 'e', s: k, n: m.s[k] }); }
    if (m.p) for (k in m.p) me(g, k, m.p[k]);
    if (e.st.burn > 0) { e.hp -= e.st.burn; g.stats.dmg += e.st.burn; ev(g, { k: 'hit', n: e.st.burn, b: 0, dot: 'burn' }); e.st.burn = Math.floor(e.st.burn / 2); if (settle(g)) return true; }
    if (e.st.weak > 0) e.st.weak--;
    if (v0 > 0 && st.vuln > 0) st.vuln--;
    if (cb.turn >= ENRAGE) { e.st.str = (e.st.str || 0) + 2; ev(g, { k: 'enrage' }); }   // 질질 끌면 적이 점점 세짐
    /* ---- 다음 행동 정하기 ---- */
    var E = ENEMY[e.id];
    if (E.ph2 && !e.ph && e.hp <= e.max * E.ph2.at) { e.ph = 1; e.mi = 0; ev(g, { k: 'phase', t: E.ph2.t }); }
    else { e.mi++; if (e.mi >= moves(e).length) { e.mi = 0; if (E.grow) e.st.str = (e.st.str || 0) + E.grow; } }
    startTurn(g, false);
    return true;
  }
  function die(g) {
    g.phase = 'over'; g.win = false;
    g.over = { by: g.cb ? g.cb.e.id : '', floor: floorOf(g) };
    g.cb = null; ev(g, { k: 'die' });
  }
  function winCombat(g) {
    var cb = g.cb, kind = cb.kind, id = cb.e.id;
    g.stats.kills++; if (kind === 'e') g.stats.elites++; if (kind === 'b') g.stats.bosses++;
    var gd = kind === 'b' ? 50 + g.act * 10 : kind === 'e' ? 26 + ri(g, 'r', 8) + g.act * 5 : 11 + ri(g, 'r', 6) + g.act * 3;
    if (has(g, 'gmeeple')) gd = Math.round(gd * 1.5);
    if (g.asc >= 9) gd = Math.round(gd * 0.75);
    g.gold += gd; g.stats.gold += gd;
    if (has(g, 'trophy')) { g.max += 2; g.hp += 2; }
    if (has(g, 'snack')) heal(g, 4);
    if (kind !== 'f' && has(g, 'party')) heal(g, 12);
    g.last = { id: id, kind: kind, gold: gd };
    g.cb = null; ev(g, { k: 'win', kind: kind });
    if (kind === 'b') {
      if (g.act >= ACTS - 1) { g.phase = 'over'; g.win = true; g.over = { by: '', floor: floorOf(g) }; return; }
      g.dice++; heal(g, Math.round(g.max * 0.3));
      g.last.dice = 1;
      g.pend.push({ k: 'rl', items: rollRelics(g, 3, true), why: '보스 전리품' });
      g.pend.push({ k: 'eq', items: rollEquips(g, 3, 2), why: '보스 전리품' });
      g.adv = true;
    } else if (kind === 'e') {
      g.pend.push({ k: 'rl', items: rollRelics(g, 2, false), why: '정예 전리품' });
      g.pend.push({ k: 'eq', items: rollEquips(g, 3, 1), why: '전투 보상' });
    } else g.pend.push({ k: 'eq', items: rollEquips(g, 3, 0), why: '전투 보상' });
    proceed(g);
  }

  /* ================= 보상 ================= */
  function rollEquips(g, n, lift) {   // lift: 0 보통 · 1 드묾 이상 하나 보장 · 2 희귀가 잘 나옴
    if (has(g, 'expansion')) n++;
    var own = g.eq.map(function (q) { return q.id; }), out = [], ids = EQ_IDS.filter(function (id) { return own.indexOf(id) < 0 && !(id === 'snake' && has(g, 'heavy')); });   // 1 이 안 나오면 뱀눈 폭탄은 못 씀
    var W = [{ c: 60, u: 33, r: 7 }, { c: 44, u: 42, r: 14 }, { c: 30, u: 46, r: 24 }][g.act];
    for (var i = 0; i < n && ids.length; i++) {
      var id = wpick(g, 'r', ids, function (x) { var r = EQ[x].r, w = W[r]; if (lift === 2 && r === 'r') w *= 3; if (lift >= 1 && i === 0 && r === 'c') w = 0; return w; });
      ids.splice(ids.indexOf(id), 1);
      out.push({ id: id, up: rnd(g, 'r') < [0.05, 0.2, 0.35][g.act] + (lift ? 0.1 : 0) ? 1 : 0 });
    }
    return out;
  }
  function rollRelics(g, n, rare) {
    var ones = has(g, 'snakeeye') || g.eq.some(function (q) { return q.id === 'snake'; });
    var ids = RELIC_IDS.filter(function (id) {
      if (id === 'heavy' && ones) return false;   // 묵직한 주사위(1→2)와 1 이 필요한 것은 같이 안 나옴
      if (id === 'snakeeye' && has(g, 'heavy')) return false;
      return g.relics.indexOf(id) < 0 && !(id === 'errata' && g.usedErrata);
    }), out = [];
    for (var i = 0; i < n && ids.length; i++) {
      var only = rare === 2 && ids.some(function (x) { return RELIC[x].r === 'r'; });   // rare: 2 = 희귀만 (다 모았으면 일반)
      var id = wpick(g, 'r', ids, function (x) { return RELIC[x].r === 'r' ? (only ? 1 : rare ? 3 : 0.6) : (only ? 0 : 1); });
      ids.splice(ids.indexOf(id), 1); out.push(id);
    }
    return out;
  }
  function addRelic(g, id) {
    if (g.relics.indexOf(id) >= 0) return;
    g.relics.push(id);
    if (g.seen.r.indexOf(id) < 0) g.seen.r.push(id);
    if (id === 'mat') { g.max += 12; g.hp += 12; }
    if (id === 'errata') g.usedErrata = 1;
    if (g.phase === 'event' && g.evt) (g.evt.got = g.evt.got || []).push(id);   // 사건 결과 화면에 효과를 보여 줌
  }
  function addEquip(g, it, rep) {   // 칸이 꽉 찼으면 rep 번 칸과 바꿈
    var q = { id: it.id, up: it.up ? 1 : 0 };
    if (g.eq.length < MAXEQ) g.eq.push(q);
    else { if (!(rep >= 0 && rep < g.eq.length)) return false; g.eq[rep] = q; }
    if (g.seen.q.indexOf(q.id) < 0) g.seen.q.push(q.id);
    return true;
  }
  function upgradable(g) { var a = []; for (var i = 0; i < g.eq.length; i++) if (!g.eq[i].up) a.push(i); return a; }
  function proceed(g) {
    while (g.pend.length) {   // 고를 것이 없는 보상은 건너뜀
      var p = g.pend[0];
      if ((p.k === 'eq' || p.k === 'rl') && !p.items.length) { g.pend.shift(); continue; }
      if (p.k === 'up' && !upgradable(g).length) { g.pend.shift(); continue; }
      if (p.k === 'rm' && g.eq.length <= 2) { g.pend.shift(); continue; }
      g.phase = 'pick'; return;
    }
    if (g.adv) { g.adv = false; g.act++; g.row = -1; g.col = 1; g.path = []; g.map = g.maps[g.act].rows; g.ids = g.maps[g.act].ids; }
    g.shop = null; g.evt = null;
    g.phase = 'map';
  }
  function pickReward(g, i, rep) {
    if (g.phase !== 'pick') return false;
    var p = g.pend[0];
    if (p.k === 'eq') { if (!p.items[i] || !addEquip(g, p.items[i], rep)) return false; }
    else if (p.k === 'rl') { if (!p.items[i]) return false; addRelic(g, p.items[i]); }
    else if (p.k === 'up') { if (!g.eq[i] || g.eq[i].up) return false; g.eq[i].up = 1; }
    else if (p.k === 'rm') {
      if (!g.eq[i] || g.eq.length <= 2) return false;
      g.eq.splice(i, 1);
      if (p.gold) { g.gold += p.gold; g.stats.gold += p.gold; }
      if (p.max) { g.max += p.max; g.hp += p.max; }
    }
    g.pend.shift(); proceed(g);
    return true;
  }
  function skipReward(g) {
    if (g.phase !== 'pick') return false;
    var p = g.pend.shift();
    if (p.back === 'rest') { g.phase = 'rest'; return true; }   // 휴식의 장비 손질을 그만두면 휴식 선택으로 돌아감
    proceed(g);
    return true;
  }

  /* ================= 휴식 · 상점 ================= */
  function restHeal(g) { return Math.round(g.max * (g.asc >= 7 ? 0.24 : 0.32) * (has(g, 'cushion') ? 1.5 : 1)); }
  function rest(g, how) {
    if (g.phase !== 'rest') return false;
    if (how === 'up') { if (!upgradable(g).length) return false; g.pend.push({ k: 'up', why: '장비 손질', back: 'rest' }); }
    else heal(g, restHeal(g));
    proceed(g);
    return true;
  }
  function price(g, base) { return Math.max(1, Math.round(base * (has(g, 'coupon') ? 0.75 : 1) * (g.asc >= 5 ? 1.15 : 1))); }
  function genShop(g) {
    var P = { c: 34, u: 48, r: 66 };
    return {
      eq: rollEquipsN(g, 3).map(function (it) { return { id: it.id, up: it.up, price: price(g, P[EQ[it.id].r] + (it.up ? 16 : 0) + ri(g, 'r', 7)), sold: 0 }; }),
      rl: rollRelics(g, 2, false).map(function (id) { return { id: id, price: price(g, (RELIC[id].r === 'r' ? 95 : 70) + ri(g, 'r', 11)), sold: 0 }; }),
      heal: { price: price(g, 24), sold: 0 }, up: { price: price(g, 45), sold: 0 }
    };
  }
  function rollEquipsN(g, n) { var x = has(g, 'expansion'); var a = rollEquips(g, n, 1); return x ? a.slice(0, n) : a; }
  function shopHeal(g) { return Math.round(g.max * 0.28); }
  function buy(g, what, i, rep) {
    if (g.phase !== 'shop' || !g.shop) return false;
    var s = g.shop, it;
    if (what === 'eq') { it = s.eq[i]; if (!it || it.sold || g.gold < it.price || !addEquip(g, it, rep)) return false; }
    else if (what === 'rl') { it = s.rl[i]; if (!it || it.sold || g.gold < it.price) return false; addRelic(g, it.id); }
    else if (what === 'heal') { it = s.heal; if (it.sold || g.gold < it.price || g.hp >= g.max) return false; heal(g, shopHeal(g)); }
    else if (what === 'up') { it = s.up; if (it.sold || g.gold < it.price || !g.eq[i] || g.eq[i].up) return false; g.eq[i].up = 1; }
    else return false;
    g.gold -= it.price; it.sold = 1;
    return true;
  }
  function leave(g) { if (g.phase !== 'shop') return false; proceed(g); return true; }

  /* ================= 사건 ================= opts: {l 선택지, h 결과 귀띔, can(g), fx(g) → 결과 글} */
  function upRandom(g) { var a = upgradable(g); if (!a.length) return ''; var i = a[ri(g, 'r', a.length)]; g.eq[i].up = 1; return EQ[g.eq[i].id].n; }
  function hpCost(g, n) { g.hp = Math.max(1, g.hp - n); }   // 사건으로는 쓰러지지 않음
  function gain(g, n) { g.gold += n; g.stats.gold += n; }
  function oneRelic(g, rare) { var a = rollRelics(g, 1, rare); if (!a.length) { gain(g, 30); return ''; } addRelic(g, a[0]); return a[0]; }
  var EVENT = {
    norule: { e: '📕', t: '룰북을 안 읽고 온 사람', d: '“그냥 하면서 배우면 되죠?” 새로 온 사람이 해맑게 자리에 앉는다.', opts: [
      { l: '처음부터 차근차근 설명한다', h: '체력 -6 · 무작위 장비 강화', fx: function (g) { hpCost(g, 6); var n = upRandom(g); return '목이 쉬었지만 설명하다 보니 나도 룰이 정리됐다.' + (n ? ' 【' + n + '】 강화!' : ''); } },
      { l: '룰 영상 링크를 보내 준다', h: '골드 +18', fx: function (g) { gain(g, 18); return '“오, 이해했어요!” 고맙다며 음료값을 내 줬다. 골드 +18'; } }] },
    tower: { e: '🗼', t: '주사위 탑이 무너졌다', d: '와르르! 누군가 쌓던 주사위 탑이 무너져 사방으로 굴러간다.', opts: [
      { l: '굴러간 주사위를 주우러 간다', h: '반반 — 무작위 유물 또는 체력 -7', fx: function (g) { if (rnd(g, 'r') < 0.55) { var id = oneRelic(g, false); return id ? '소파 밑에서 반짝이는 것을 찾았다. 【' + RELIC[id].n + '】 획득!' : '소파 밑에서 동전을 주웠다. 골드 +30'; } hpCost(g, 7); return '탁자 모서리에 머리를 박았다. 체력 -7'; } },
      { l: '탑을 다시 쌓아 준다', h: '최대 체력 +4', fx: function (g) { g.max += 4; g.hp += 4; return '집중해서 한 층씩… 완성! 마음이 단단해졌다. 최대 체력 +4'; } }] },
    late: { e: '⏰', t: '벙주가 지각했다', d: '단톡방에 “10분만요 ㅠㅠ” 가 올라왔다. 문은 잠겨 있다.', opts: [
      { l: '계단에 앉아 쉰다', h: '체력 +12', fx: function (g) { var h = heal(g, 12); return '멍하니 쉬었더니 개운하다. 체력 +' + h; } },
      { l: '근처 편의점에서 내기 한 판', h: '골드 +25', fx: function (g) { gain(g, 25); return '가위바위보로 간식비를 벌었다. 골드 +25'; } }] },
    snack: { e: '🍪', t: '간식 테이블', d: '누군가 과자와 귤을 한가득 가져왔다. 손이 깨끗해야 게임을 할 수 있는데…', opts: [
      { l: '실컷 먹는다', h: '체력 +15', fx: function (g) { var h = heal(g, 15); return '배가 든든하다. 체력 +' + h + ' (손은 씻었다)'; } },
      { l: '하나만 집고 참는다', h: '최대 체력 +3 · 골드 +8', fx: function (g) { g.max += 3; g.hp += 3; gain(g, 8); return '절제의 미덕. 최대 체력 +3, 남은 간식비 골드 +8'; } }] },
    market: { e: '🏷️', t: '중고 장터', d: '한쪽 탁자에서 중고 거래가 한창이다. “박스 상태 A급이에요!”', opts: [
      { l: '안 쓰는 장비를 판다', h: '장비 하나 버리고 골드 +40', can: function (g) { return g.eq.length > 2; }, fx: function (g) { g.pend.push({ k: 'rm', gold: 40, why: '팔 장비 고르기' }); return '어떤 걸 팔까?'; } },
      { l: '랜덤 박스를 산다', h: '골드 -30 · 장비 셋 중 하나 (드묾 이상 하나 보장)', can: function (g) { return g.gold >= 30; }, fx: function (g) { g.gold -= 30; g.pend.push({ k: 'eq', items: rollEquips(g, 3, 1), why: '랜덤 박스' }); return '두근두근, 상자를 열어 보자.'; } },
      { l: '구경만 한다', h: '아무 일 없음', fx: function () { return '구경하는 것만으로도 재미있었다.'; } }] },
    promo: { e: '✨', t: '수상한 프로모 카드', d: '후드를 눌러쓴 사람이 속삭인다. “한정판인데… 대가가 좀 있어.”', opts: [
      { l: '받는다', h: '무작위 유물 하나 · 최대 체력 -6', fx: function (g) { var id = oneRelic(g, true); g.max -= 6; g.hp = Math.max(1, Math.min(g.hp, g.max)); return '손끝이 찌릿하다. ' + (id ? '【' + RELIC[id].n + '】 획득, ' : '골드 +30, ') + '최대 체력 -6'; } },
      { l: '정중히 거절한다', h: '체력 +5', fx: function (g) { var h = heal(g, 5); return '수상한 건 안 받는 게 상책. 마음이 편하다. 체력 +' + h; } }] },
    after: { e: '🍻', t: '뒤풀이 제안', d: '“끝나고 치킨 어때요?” 다들 눈이 반짝인다.', opts: [
      { l: '간다!', h: '골드 -25 · 체력 절반 회복', can: function (g) { return g.gold >= 25; }, fx: function (g) { g.gold -= 25; var h = heal(g, Math.round(g.max * 0.5)); return '치킨은 진리다. 체력 +' + h; } },
      { l: '일찍 들어가 장비를 손질한다', h: '장비 하나 강화', can: function (g) { return upgradable(g).length > 0; }, fx: function (g) { g.pend.push({ k: 'up', why: '장비 손질' }); return '조용한 밤, 장비를 꺼냈다.'; } },
      { l: '그냥 집에 간다', h: '아무 일 없음', fx: function () { return '오늘은 일찍 잤다.'; } }] },
    newbie: { e: '🐣', t: '새 회원이 왔다', d: '쭈뼛쭈뼛 문을 열고 들어온 새 회원. 누가 챙겨 줘야 할 텐데.', opts: [
      { l: '옆에 앉아 같이 한 판 한다', h: '최대 체력 +4 · 골드 +10', fx: function (g) { g.max += 4; g.hp += 4; gain(g, 10); return '“다음에 또 올게요!” 뿌듯하다. 최대 체력 +4, 골드 +10'; } },
      { l: '내 전략을 알려 주며 복기한다', h: '장비 하나 강화', can: function (g) { return upgradable(g).length > 0; }, fx: function (g) { g.pend.push({ k: 'up', why: '복기하며 깨달음' }); return '가르치다 보니 내가 더 배웠다.'; } }] },
    altar: { e: '🎲', t: '주사위 신의 제단', d: '선반 꼭대기에 먼지 쌓인 20면체가 놓여 있다. 무언가를 바치면 답한다고 한다.', opts: [
      { l: '체력을 바친다', h: '체력 -10 · 유물 둘 중 하나', can: function (g) { return g.hp > 10; }, fx: function (g) { hpCost(g, 10); g.pend.push({ k: 'rl', items: rollRelics(g, 2, true), why: '주사위 신의 선물' }); return '20면체가 빙글 돌더니 빛난다.'; } },
      { l: '골드를 바친다', h: '골드 -40 · 강화된 장비 셋 중 하나', can: function (g) { return g.gold >= 40; }, fx: function (g) { g.gold -= 40; g.pend.push({ k: 'eq', items: rollEquips(g, 3, 2).map(function (x) { x.up = 1; return x; }), why: '주사위 신의 선물' }); return '동전이 사라지고 상자가 나타났다.'; } },
      { l: '먼지만 털어 주고 간다', h: '아무 일 없음', fx: function () { return '20면체가 고맙다는 듯 반짝였다. (기분 탓)'; } }] },
    lost: { e: '📦', t: '분실물 상자', d: '카페 구석에 ‘분실물’ 이라고 적힌 상자가 있다.', opts: [
      { l: '뒤져 본다', h: '운에 맡김 — 골드 +32 · 장비 고르기 · 함정(체력 -6)', fx: function (g) { var x = rnd(g, 'r'); if (x < 0.45) { gain(g, 32); return '누가 두고 간 동전 지갑! 골드 +32'; } if (x < 0.8) { g.pend.push({ k: 'eq', items: rollEquips(g, 2, 1), why: '분실물' }); return '쓸 만한 물건이 있다.'; } hpCost(g, 6); return '압정이 들어 있었다. 체력 -6'; } },
      { l: '주인을 찾아 준다', h: '최대 체력 +3', fx: function (g) { g.max += 3; g.hp += 3; return '착한 일을 하니 기운이 난다. 최대 체력 +3'; } }] },
    kick: { e: '🚀', t: '크라우드 펀딩 알림', d: '“목표 금액 300% 달성! 마감 1시간 전!” 알림이 울린다.', opts: [
      { l: '올인 에디션 후원', h: '골드 -55 · 희귀 유물 (다 모았으면 일반 유물)', can: function (g) { return g.gold >= 55; }, fx: function (g) { g.gold -= 55; var id = oneRelic(g, 2); return id ? '놀랍게도 바로 도착했다! 【' + RELIC[id].n + '】 획득' : '배송 대신 환불이 왔다. 골드 +30'; } },
      { l: '얼리버드만 살짝', h: '골드 -20 · 60% 확률로 무작위 장비 강화', can: function (g) { return g.gold >= 20 && upgradable(g).length > 0; }, fx: function (g) { g.gold -= 20; if (rnd(g, 'r') < 0.6) { var n = upRandom(g); return '업그레이드 키트가 왔다. 【' + n + '】 강화!'; } return '배송이 1년 미뤄졌다는 메일이 왔다…'; } },
      { l: '지갑을 닫는다', h: '아무 일 없음', fx: function () { return '현명한 소비자였다.'; } }] },
    clean: { e: '🧹', t: '정리의 시간', d: '모임이 끝나 간다. 다 같이 게임을 정리하는 중.', opts: [
      { l: '안 쓰는 장비를 기부한다', h: '장비 하나 버리고 최대 체력 +7', can: function (g) { return g.eq.length > 2; }, fx: function (g) { g.pend.push({ k: 'rm', max: 7, why: '기부할 장비 고르기' }); return '무엇을 기부할까?'; } },
      { l: '토큰을 종류별로 정리한다', h: '골드 +14', fx: function (g) { gain(g, 14); return '지퍼백 사이에서 동전이 나왔다. 골드 +14'; } }] },
    dispute: { e: '⚖️', t: '룰 분쟁', d: '두 사람이 룰 해석을 두고 다투고 있다. “아니 동시에 발동이라니까!”', opts: [
      { l: '룰북을 찾아 판정해 준다', h: '대체로 골드 +30, 가끔 체력 -5', fx: function (g) { if (rnd(g, 'r') < 0.65) { gain(g, 30); return '정확한 조항을 찾았다. 박수와 함께 골드 +30'; } hpCost(g, 5); return '둘 다 틀렸다고 했다가 양쪽에서 혼났다. 체력 -5'; } },
      { l: '“주사위로 정하죠”', h: '반반 — 무작위 유물 또는 체력 -9', fx: function (g) { if (rnd(g, 'r') < 0.5) { var id = oneRelic(g, false); return id ? '명쾌한 해결! 감사의 선물 【' + RELIC[id].n + '】' : '명쾌한 해결! 골드 +30'; } hpCost(g, 9); return '주사위가 탁자 밑으로 굴러가 한참 찾았다. 체력 -9'; } }] },
    cursed: { e: '👁️', t: '바닥에 떨어진 주사위', d: '의자 밑에 혼자 굴러다니는 주사위가 있다. 어쩐지 이쪽을 보는 것 같다.', opts: [
      { l: '굴려 본다', h: '6: 주사위 +1 영구 · 1: 체력 -12 · 그 외: 골드 +20', fx: function (g) { var v = 1 + ri(g, 'r', 6); if (v === 6) { g.dice++; return '⚅! 주사위가 주머니로 쏙 들어왔다. 굴리는 주사위 +1'; } if (v === 1) { hpCost(g, 12); return '⚀… 불길한 기운이 스친다. 체력 -12'; } gain(g, 20); return '눈 ' + v + '. 주인이 사례금을 줬다. 골드 +20'; } },
      { l: '모른 척한다', h: '아무 일 없음', fx: function () { return '등 뒤에서 데구르르 소리가 났다.'; } }] }
  };
  var EVENT_IDS = Object.keys(EVENT);
  function evOpt(g, i) {
    if (g.phase !== 'event' || !g.evt || g.evt.res) return false;
    var o = EVENT[g.evt.id].opts[i];
    if (!o || (o.can && !o.can(g))) return false;
    g.evt.res = o.fx(g) || '…';
    return true;
  }
  function evCont(g) { if (g.phase !== 'event' || !g.evt || !g.evt.res) return false; proceed(g); return true; }

  /* ================= 점수 · 행동 ================= */
  function score(g) {
    var s = g.stats, fl = (g.win ? ACTS * (ROWS + 1) : Math.max(0, floorOf(g) - 1));
    var n = fl * 25 + s.kills * 10 + s.elites * 50 + s.bosses * 150 + Math.floor(g.gold / 2);
    if (g.win) n += 500 + g.hp * 3 + g.asc * 150;
    return n;
  }
  function act(g, a) {
    if (!g || !a || g.phase === 'over') return false;
    switch (a.t) {
      case 'go': return go(g, a.col | 0);
      case 'place': return place(g, a.die | 0, a.slot | 0);
      case 'unplace': return unplace(g, a.slot | 0);
      case 'reroll': return reroll(g, a.die == null ? -1 : a.die | 0);
      case 'end': return endTurn(g);
      case 'pick': return pickReward(g, a.i | 0, a.rep == null ? -1 : a.rep | 0);
      case 'skip': return skipReward(g);
      case 'rest': return rest(g, a.how);
      case 'buy': return buy(g, a.what, a.i | 0, a.rep == null ? -1 : a.rep | 0);
      case 'leave': return leave(g);
      case 'opt': return evOpt(g, a.i | 0);
      case 'cont': return evCont(g);
    }
    return false;
  }
  function dailySeed(date) { return hashStr('jmb-rogue-' + date) || 1; }
  function dailyClass(date) { return CLASS_IDS[hashStr('cls-' + date) % CLASS_IDS.length]; }

  return {
    SAVE_VER: SAVE_VER, MAXEQ: MAXEQ, MAXDICE: MAXDICE, ROWS: ROWS, ACTS: ACTS, ENRAGE: ENRAGE,
    ST: ST, EQ: EQ, EQ_IDS: EQ_IDS, RELIC: RELIC, RELIC_IDS: RELIC_IDS, CLASS: CLASS, CLASS_IDS: CLASS_IDS, ENEMY: ENEMY, ENEMY_IDS: ENEMY_IDS, EVENT: EVENT, BOSS: BOSS, ACT_NAME: ACT_NAME, ASC: ASC,
    newRun: newRun, act: act, canPlace: canPlace, whyNot: whyNot, slotOpen: slotOpen, intent: intent, variant: variant, needText: needText, cdFull: cdFull,
    nextCols: nextCols, floorOf: floorOf, upgradable: upgradable, restHeal: restHeal, shopHeal: shopHeal, score: score,
    hashStr: hashStr, dailySeed: dailySeed, dailyClass: dailyClass, has: has
  };
});
