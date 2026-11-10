/*! 잠만보 던전 — 화면 v1.0.0
 * 규칙·데이터는 core.js (ROGUE_CORE). 여기는 그리기 · 누르기 · 소리 · 저장만. 서버 없음 — 모두 이 기기(localStorage)에
 *   jmb_rogue_run  진행 중인 판 (행동할 때마다 저장 → 새로고침 · 다음에 이어하기)
 *   jmb_rogue_meta 최고 기록 · 해금 · 도감 · 승천 · 오늘의 던전 기록
 *   jmb_rogue_set  소리 · 튜토리얼 봤는지
 * 모임 랭킹: 판이 끝나면 ../arcade.js 의 JMB_ARCADE.report('rogue', 'run' | 'daily', 점수, 메모) — 로그인 회원만 서버로, 게스트는 기기 기록만
 */
(function () {
  'use strict';
  var VER = '1.0.1';
  var C = window.ROGUE_CORE, FX = window.JMB_FX || null, ARC = window.JMB_ARCADE || null, CFG = window.JMB_CONFIG || {};
  var ENV_SFX = CFG.env && CFG.env !== 'prod' ? '_' + CFG.env : '';
  var ROOT = (function () { var seg = location.pathname.split('/')[1] || ''; return /\.github\.io$/.test(location.hostname) && seg ? '/' + seg + '/' : '/'; })();
  var LS = { run: 'jmb_rogue_run', meta: 'jmb_rogue_meta', set: 'jmb_rogue_set', auth: 'jmb_kakao_v2' + ENV_SFX };
  var G = null, M = null, SET = null;
  var UI = { scr: 'home', sel: -1, undo: [], busy: false, cls: 'plan', asc: 0, res: null, lastPhase: '', enr: false };

  /* ================= 공통 ================= */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function lsJSON(k) { try { return JSON.parse(lsGet(k) || 'null'); } catch (e) { return null; } }
  function num(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  var toastT = 0;
  // 알림: 전투 중에는 '다음 행동' · 체력을 가리지 않게 주사위 아래 안내 줄(#tip)에, 그 밖에는 화면 아래에 띄움
  function toast(msg, ms) {
    ms = ms || 2200; clearTimeout(toastT);
    if (document.documentElement.classList.contains('in-cmb')) {
      UI.hot = { m: msg, t: Date.now() + ms };
      var tp = $('tip'); if (tp) { tp.textContent = msg; tp.className = 'tip hot'; }
      toastT = setTimeout(function () { UI.hot = null; var e = $('tip'); if (e && G && G.cb) { e.textContent = tipText(); e.className = 'tip'; } }, ms);
      return;
    }
    var t = $('toast'); t.textContent = msg; t.className = 'toast on';
    toastT = setTimeout(function () { t.className = 'toast'; }, ms);
  }
  function hotTip() { return UI.hot && UI.hot.t > Date.now() ? UI.hot.m : ''; }
  function today() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }   // 한국 날짜
  function md(d) { var p = String(d || '').split('-'); return p.length === 3 ? (+p[1]) + '월 ' + (+p[2]) + '일' : d; }
  function nick() { var s = lsJSON(LS.auth); return s && s.user && s.user.nickname ? String(s.user.nickname) : ''; }
  function avatar(px) { var n = nick() || C.CLASS[G ? G.cls : UI.cls].n; return FX ? FX.avatar(n, px) : '<span class="noav">' + C.CLASS[G ? G.cls : UI.cls].e + '</span>'; }
  function haptic(k) { if (FX) FX.haptic(k); }

  /* ================= 저장 ================= */
  function loadMeta() {
    var m = lsJSON(LS.meta) || {};
    M = { v: 1, runs: m.runs | 0, wins: m.wins | 0, best: m.best || null, asc: Math.max(0, Math.min(C.ASC.length, m.asc | 0)),
      unlock: m.unlock || {}, seen: { e: (m.seen && m.seen.e) || [], r: (m.seen && m.seen.r) || [], q: (m.seen && m.seen.q) || [] },
      daily: m.daily || {}, hist: m.hist || [], clsWin: m.clsWin || {} };
    var s = lsJSON(LS.set) || {};
    SET = { snd: s.snd === 0 ? 0 : 1, tut: s.tut ? 1 : 0, cls: s.cls || 'plan', asc: s.asc | 0 };
    UI.cls = unlocked(SET.cls) ? SET.cls : 'plan'; UI.asc = Math.min(SET.asc, M.asc);
  }
  function saveMeta() { lsSet(LS.meta, JSON.stringify(M)); }
  function saveSet() { SET.cls = UI.cls; SET.asc = UI.asc; lsSet(LS.set, JSON.stringify(SET)); }
  function saveRun() { if (G && G.phase !== 'over') { G.ev = []; lsSet(LS.run, JSON.stringify(G)); } else lsSet(LS.run, null); }
  function savedRun() {
    var g = lsJSON(LS.run);
    if (!g || g.v !== C.SAVE_VER || !C.CLASS[g.cls] || !g.eq || !g.map || g.phase === 'over') return null;
    for (var i = 0; i < g.eq.length; i++) if (!C.EQ[g.eq[i].id]) return null;
    if (g.cb && !C.ENEMY[g.cb.e.id]) return null;
    return g;
  }
  function unlocked(cls) { return cls === 'plan' || !!M.unlock[cls]; }

  /* ================= 소리 (Web Audio 합성 — 음원 파일 없음) ================= */
  var AC = null;
  function ac() { if (!SET.snd) return null; if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } } if (AC.state === 'suspended') AC.resume(); return AC; }
  function tone(f, d, type, vol, f2, at) {
    var a = ac(); if (!a) return;
    var t = a.currentTime + (at || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02);
  }
  function noise(d, vol, hp, at) {
    var a = ac(); if (!a) return;
    var n = Math.floor(a.sampleRate * d), b = a.createBuffer(1, n, a.sampleRate), ch = b.getChannelData(0);
    for (var i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
    s.buffer = b; f.type = 'highpass'; f.frequency.value = hp || 800; g.gain.value = vol || 0.12;
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(a.currentTime + (at || 0));
  }
  var SFX = {
    sel: function () { tone(660, 0.05, 'triangle', 0.06); },
    roll: function () { for (var i = 0; i < 5; i++) noise(0.04, 0.1, 1500 + i * 300, i * 0.06 + Math.random() * 0.02); },
    hit: function () { tone(180, 0.14, 'sawtooth', 0.14, 60); noise(0.08, 0.1, 400); },
    blk: function () { tone(880, 0.07, 'square', 0.05, 1320); },
    hurt: function () { tone(120, 0.22, 'square', 0.13, 50); },
    heal: function () { tone(520, 0.12, 'sine', 0.09); tone(780, 0.16, 'sine', 0.09, 0, 0.09); },
    coin: function () { tone(1320, 0.06, 'square', 0.05); tone(1760, 0.12, 'square', 0.05, 0, 0.06); },
    buff: function () { tone(330, 0.16, 'triangle', 0.09, 660); },
    debuff: function () { tone(440, 0.2, 'sawtooth', 0.06, 180); },
    no: function () { tone(200, 0.09, 'square', 0.06); },
    go: function () { tone(392, 0.08, 'triangle', 0.08); tone(523, 0.1, 'triangle', 0.08, 0, 0.07); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.18, 'triangle', 0.1, 0, i * 0.1); }); },
    big: function () { [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) { tone(f, 0.26, 'triangle', 0.1, 0, i * 0.12); tone(f / 2, 0.26, 'sine', 0.07, 0, i * 0.12); }); },
    lose: function () { [392, 330, 262, 196].forEach(function (f, i) { tone(f, 0.3, 'sawtooth', 0.07, 0, i * 0.18); }); }
  };
  function sfx(k) { try { if (SFX[k]) SFX[k](); } catch (e) {} }

  /* ================= 그림 조각 ================= */
  var PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function pips(v) { var h = ''; for (var i = 0; i < 9; i++) h += '<i' + (PIPS[v].indexOf(i) >= 0 ? ' class="p"' : '') + '></i>'; return h; }
  function dieH(v, cls, attr) { return '<span class="die ' + (cls || '') + '"' + (attr || '') + ' aria-label="주사위 ' + v + '">' + pips(v) + '</span>'; }
  function hpBar(hp, max, cls) { return '<span class="hp ' + (cls || '') + '"><i style="width:' + Math.max(0, Math.min(100, hp / max * 100)) + '%"></i><b>' + hp + ' / ' + max + '</b></span>'; }
  function chips(st) {
    var h = '';
    for (var k in C.ST) if (st[k] > 0) h += '<span class="chip s-' + k + '">' + C.ST[k].e + '<b>' + st[k] + '</b></span>';
    return h;
  }
  var RAR = { c: '흔함', u: '드묾', r: '희귀' };
  function fullDesc(q) {
    var V = C.variant(q);
    return V.d + (V.uses > 1 ? ' · 한 턴 ' + V.uses + '번' : '') + (V.cu ? ' · 한 전투 ' + V.cu + '번' : '');
  }
  function eqName(q) { return C.EQ[q.id].n + (q.up ? '<em class="up">+</em>' : ''); }
  // 목록용 한 줄 (보상 · 상점 · 빌드)
  function eqItem(q, attr, tail) {
    var D = C.EQ[q.id], V = C.variant(q);
    return '<button type="button" class="it r-' + D.r + '" ' + (attr || '') + '><span class="it-e">' + D.e + '</span><span class="it-b"><b>' + eqName(q) + ' <i class="rar">' + RAR[D.r] + '</i></b><small><span class="need">' + C.needText(V.need) + '</span> ' + fullDesc(q) + '</small></span>' + (tail || '') + '</button>';
  }
  function relItem(id, attr, tail) {
    var R = C.RELIC[id];
    return '<button type="button" class="it rl r-' + (R.r === 'r' ? 'r' : 'c') + '" ' + (attr || '') + '><span class="it-e">' + R.e + '</span><span class="it-b"><b>' + R.n + (R.r === 'r' ? ' <i class="rar">희귀</i>' : R.r === 'x' ? ' <i class="rar">직업</i>' : '') + '</b><small>' + R.d + '</small></span>' + (tail || '') + '</button>';
  }
  function floorText(g) { return (g.act + 1) + '막 ' + (g.row >= C.ROWS ? '보스' : g.row < 0 ? '출발' : (g.row + 1) + '층'); }
  var NODE = { f: ['⚔️', '전투'], e: ['💀', '정예'], s: ['🛒', '상점'], r: ['🔥', '휴식'], v: ['❓', '사건'], b: ['👑', '보스'] };

  /* ================= 창 ================= */
  function sheet(html, opt) { $('modal').innerHTML = '<div class="mbg' + (opt && opt.lock ? ' lock' : '') + '" data-a="close"><div class="sheet" role="dialog" aria-modal="true">' + html + '</div></div>'; hSync(); }
  function closeSheet() { $('modal').innerHTML = ''; hSync(); }
  /* 브라우저 뒤로가기(안드로이드 뒤로 · 아이폰 스와이프): 창 닫기 → 진행 중이면 처음 화면(판은 저장) → 처음 화면이면 나감.
   * history 깊이 H.d = (처음 화면이 아니면 1) + (창이 떠 있으면 1) 이 되게 맞춤. 랭킹 창(arcade.js)은 그 위에 스스로 한 칸({jarc:1})을 쌓고 치움 */
  var H = { d: 0, skip: 0, q: [], t: 0 };
  function hLevel(st) { return st && st.rg ? st.rg : 0; }
  function hSync() {
    if (H.skip) return;   // 우리가 부른 뒤로가기가 끝난 뒤(popstate)에 다시 맞춤
    var want = (UI.scr !== 'home' ? 1 : 0) + (sheetOpen() ? 1 : 0);
    try {
      if (want < H.d) {
        var n = want - H.d; H.d = want; H.skip = 1; history.go(n);
        clearTimeout(H.t); H.t = setTimeout(function () { if (H.skip) { H.skip = 0; hSync(); } }, 1200);   // popstate 가 안 오는 브라우저 대비
        return;
      }
      while (H.d < want) { H.d++; history.pushState({ rg: H.d }, ''); }
    } catch (e) {}
    var q = H.q; H.q = []; q.forEach(function (f) { f(); });
  }
  function afterHist(f) { if (H.skip) H.q.push(f); else f(); }   // history 정리가 끝난 뒤에 할 일 (랭킹 창 열기)
  window.addEventListener('popstate', function (e) {
    if (H.skip) { H.skip = 0; clearTimeout(H.t); hSync(); return; }
    var L = hLevel(e.state);
    if ((e.state && e.state.jarc) || L >= H.d) return;   // 랭킹 창이 스스로 닫으며 돌아온 것
    H.d = L;
    if (sheetOpen()) $('modal').innerHTML = '';
    else if (UI.scr !== 'home') leaveToHome();
    hSync();
  });
  function boardOpen() { return !!document.querySelector('.jarc-bg'); }
  function openBoard(mode) { if (!ARC) { toast('랭킹을 불러오지 못했어요'); return; } if (sheetOpen()) closeSheet(); afterHist(function () { ARC.openBoard('rogue', mode || 'run'); }); }
  function sheetOpen() { return !!$('modal').firstChild; }
  function confirmSheet(title, body, yes, act, extra) {
    sheet('<h2>' + title + '</h2><p>' + body + '</p><div class="btns"><button type="button" class="btn pri" data-a="' + act + '"' + (extra || '') + '>' + yes + '</button><button type="button" class="btn" data-a="close">취소</button></div>');
  }

  /* ================= 화면: 홈 ================= */
  function vHome() {
    var sv = savedRun(), d = today(), dc = C.dailyClass(d), dr = M.daily[d], cls = C.CLASS[UI.cls], ok = unlocked(UI.cls);
    var h = '<div class="hero"><div class="em"><span class="hd">' + dieH(5, 'big') + dieH(2, 'big tilt') + '</span></div><h1>잠만보 던전</h1><p>주사위를 굴려 장비에 넣고, 3막 끝의 잠만보를 깨우세요</p></div>';
    if (sv) h += '<button type="button" class="mode main" data-a="cont"><span class="ic">▶️</span><span><b>이어하기</b><small>' + (sv.daily ? '오늘의 던전 · ' : '') + C.CLASS[sv.cls].n + ' · ' + floorText(sv) + ' · ❤️ ' + sv.hp + '/' + sv.max + '</small></span><span class="go">›</span></button>';
    h += '<div class="card"><h3>직업 고르기</h3><div class="clss">' + C.CLASS_IDS.map(function (id) {
      var K = C.CLASS[id], u = unlocked(id);
      return '<button type="button" class="cls' + (id === UI.cls ? ' on' : '') + (u ? '' : ' lock') + '" data-a="cls" data-id="' + id + '"><span class="e">' + (u ? K.e : '🔒') + '</span><b>' + K.n + '</b>' + (M.clsWin[id] ? '<i class="cw">🏆' + M.clsWin[id] + '</i>' : '') + '</button>';
    }).join('') + '</div>';
    h += '<div class="cdesc"><p>' + (ok ? cls.d : '🔒 ' + cls.unlock) + '</p><div class="cst"><span>❤️ ' + cls.hp + '</span>' + cls.eq.map(function (id) { return '<span>' + C.EQ[id].e + ' ' + C.EQ[id].n + '</span>'; }).join('') + '<span>' + C.RELIC[cls.relic].e + ' ' + C.RELIC[cls.relic].d + '</span></div></div>';
    if (M.asc > 0) h += '<div class="ascr"><button type="button" class="stp" data-a="asc" data-d="-1" aria-label="승천 낮추기"' + (UI.asc <= 0 ? ' disabled' : '') + '>−</button><div><b>' + (UI.asc ? '승천 ' + UI.asc : '기본 난이도') + '</b><small>' + (UI.asc ? C.ASC[UI.asc - 1] + (UI.asc > 1 ? ' (+ 아래 단계 모두)' : '') : '승천을 올리면 더 어려워져요') + '</small></div><button type="button" class="stp" data-a="asc" data-d="1" aria-label="승천 올리기"' + (UI.asc >= M.asc ? ' disabled' : '') + '>+</button></div>';
    h += '<button type="button" class="btn pri wide" data-a="new"' + (ok ? '' : ' disabled') + '>🎲 새 판 시작</button></div>';
    h += '<button type="button" class="mode" data-a="daily"><span class="ic">📅</span><span><b>오늘의 던전</b><small>' + md(d) + ' · ' + C.CLASS[dc].n + ' · 모두 같은 던전' + (dr ? (dr.live ? '<br>도전 중 — 이어서 할 수 있어요' : '<br>내 기록 ' + num(dr.score) + '점 (' + (dr.win ? '클리어' : dr.floor + '층') + ')') : '') + '</small></span><span class="go">›</span></button>';
    var seen = M.seen.e.length + M.seen.q.length + M.seen.r.length, all = C.ENEMY_IDS.length + C.EQ_IDS.length + Object.keys(C.RELIC).length;
    h += '<div class="two"><button type="button" class="btn" data-a="board" data-m="run">🏆 모임 랭킹</button><button type="button" class="btn" data-a="rec">📊 내 기록</button></div>';
    h += '<div class="two"><button type="button" class="btn ghost" data-a="codex">📖 도감 ' + seen + '/' + all + '</button><button type="button" class="btn ghost" data-a="help">❓ 하는 법</button></div>';
    h += '<p class="hint ctr">' + (M.best ? '최고 ' + num(M.best.score) + '점 · ' : '') + M.runs + '판 ' + M.wins + '승 · v' + VER + '</p>';
    return h;
  }

  /* ================= 화면: 판 머리 (전투 밖) ================= */
  function runHead() {
    return '<div class="rh"><div class="rh1"><span class="av">' + avatar(34) + '</span>' + hpBar(G.hp, G.max) + '<span class="pill">💰 ' + G.gold + '</span><span class="pill">🎲 ' + G.dice + '</span></div>' +
      '<button type="button" class="rh2" data-a="build"><span class="bag">' + G.eq.map(function (q) { return '<i' + (q.up ? ' class="u"' : '') + '>' + C.EQ[q.id].e + '</i>'; }).join('') + '</span><span class="bag rl">' + G.relics.map(function (id) { return '<i>' + C.RELIC[id].e + '</i>'; }).join('') + '</span><span class="go">내 빌드 ›</span></button></div>';
  }
  function buildSheet() {
    var cb = G.cb;
    sheet('<h2>내 빌드</h2><p class="kv2">' + C.CLASS[G.cls].e + ' ' + C.CLASS[G.cls].n + (G.asc ? ' · 승천 ' + G.asc : '') + ' · ❤️ ' + G.hp + '/' + G.max + ' · 💰 ' + G.gold + ' · 🎲 주사위 ' + G.dice + '개' + (cb ? '' : ' · 다시 굴리기 ' + G.rerolls + '+') + '</p>' +
      '<h4>장비 ' + G.eq.length + '/' + C.MAXEQ + '</h4><div class="its">' + G.eq.map(function (q) { return eqItem(q, 'disabled'); }).join('') + '</div>' +
      '<h4>유물 ' + G.relics.length + '</h4><div class="its">' + G.relics.map(function (id) { return relItem(id, 'disabled'); }).join('') + '</div>' +
      '<div class="btns"><button type="button" class="btn pri" data-a="close">닫기</button></div>');
  }

  /* ================= 화면: 지도 ================= */
  function reach(r, c) { return G.row < 0 || (r > G.row && Math.abs(c - G.col) <= r - G.row); }   // 지금 자리에서 갈 수 있는 칸인가
  function vMap() {
    var next = C.nextCols(G), boss = G.row >= C.ROWS - 1, B = C.ENEMY[C.BOSS[G.act]], known = M.seen.e.indexOf(C.BOSS[G.act]) >= 0;
    var h = runHead() + '<div class="actn"><b>' + C.ACT_NAME[G.act] + '</b><small>' + (boss ? '보스가 기다리고 있어요' : G.row < 0 ? '출발할 방을 고르세요' : '선으로 이어진 위쪽 방으로 갈 수 있어요') + '</small></div><div class="map" id="map">';
    h += '<div class="mrow"><button type="button" class="node boss' + (boss ? ' next' : '') + '" data-a="go" data-c="1" data-r="' + C.ROWS + '"' + (boss ? '' : ' disabled') + '><span>' + (known ? B.e : '👑') + '</span><small>보스 · ' + (known ? B.n : '???') + '</small></button></div>';
    for (var r = C.ROWS - 1; r >= 0; r--) {
      h += '<div class="mrow">';
      for (var c = 0; c < 3; c++) {
        var t = G.map[r][c], cur = r === G.row && c === G.col, vis = r <= G.row && G.path[r] === c, nx = !boss && r === G.row + 1 && next.indexOf(c) >= 0;
        h += '<button type="button" class="node t-' + t + (cur ? ' cur' : vis ? ' vis' : nx ? ' next' : r <= G.row || !reach(r, c) ? ' past' : '') + '" data-a="go" data-c="' + c + '" data-r="' + r + '"' + (nx ? '' : ' disabled') + ' aria-label="' + NODE[t][1] + '"><span>' + NODE[t][0] + '</span><small>' + NODE[t][1] + '</small>' + (cur ? '<i class="here">' + avatar(22) + '</i>' : '') + '</button>';
      }
      h += '</div>';
    }
    return h + '</div>';
  }
  // 지도 연결선 (SVG): 칸 가운데끼리 이음. 지나온 길 = 굵은 선, 지금 갈 수 있는 길 = 파란 선, 이제 못 가는 길 = 흐린 선
  function drawMap() {
    var m = $('map'); if (!m || !G || G.phase !== 'map') return;
    var old = $('maplines'); if (old) m.removeChild(old);
    var R = m.getBoundingClientRect(), P = {}, L = { no: '', '': '', nx: '', on: '' };
    [].forEach.call(m.querySelectorAll('.node'), function (n) { var bb = n.getBoundingClientRect(); P[n.getAttribute('data-r') + '_' + n.getAttribute('data-c')] = [bb.left + bb.width / 2 - R.left, bb.top + bb.height / 2 - R.top]; });
    for (var r = 0; r < C.ROWS; r++) for (var c = 0; c < 3; c++) {
      var last = r === C.ROWS - 1, ts = last ? [1] : [c - 1, c, c + 1];
      for (var i = 0; i < ts.length; i++) {
        var c2 = ts[i], p = P[r + '_' + c], q = P[(r + 1) + '_' + c2]; if (!p || !q) continue;
        var cur = r === G.row && c === G.col, src = cur || reach(r, c);
        var k = r < G.row && G.path[r] === c && G.path[r + 1] === c2 ? 'on' : cur ? 'nx' : src && (last || reach(r + 1, c2)) ? '' : 'no';
        L[k] += '<line x1="' + p[0].toFixed(1) + '" y1="' + p[1].toFixed(1) + '" x2="' + q[0].toFixed(1) + '" y2="' + q[1].toFixed(1) + '"/>';
      }
    }
    m.insertAdjacentHTML('afterbegin', '<svg id="maplines" width="' + Math.round(R.width) + '" height="' + Math.round(R.height) + '" aria-hidden="true"><g class="no">' + L.no + '</g><g>' + L[''] + '</g><g class="nx">' + L.nx + '</g><g class="on">' + L.on + '</g></svg>');
  }
  window.addEventListener('resize', drawMap);

  /* ================= 화면: 전투 ================= */
  function needBadge(V, sl) {
    var k = V.need[0], v = V.need[1];
    if (sl && sl.held.length) return '<span class="nb held">' + dieH(sl.held[0], 'mini') + '<i class="q">' + (k === 'pair' ? '=' : '+') + '</i></span>';
    if (k === 'cd') return '<span class="nb cd"><b>' + (sl ? sl.cd : v) + '</b></span>';
    var t = k === 'any' ? '' : k === 'even' ? '짝' : k === 'odd' ? '홀' : k === 'max' ? '≤' + v : k === 'min' ? '≥' + v : k === 'eq' ? String(v) : k === 'pair' ? '쌍' : k === 'two' ? '2개' : '합' + v;
    return '<span class="nb' + (k === 'pair' || k === 'two' || k === 'sum' ? ' dbl' : '') + '"><b>' + t + '</b></span>';
  }
  function intentH(it) {
    var h = '', k;
    if (it.a) h += '<span class="ic atk">⚔️ ' + it.a + (it.h > 1 ? '×' + it.h : '') + '</span>';
    if (it.b) h += '<span class="ic def">🛡️ ' + it.b + '</span>';
    if (it.p) for (k in it.p) h += '<span class="ic deb">' + C.ST[k].e + ' ' + C.ST[k].n + ' ' + it.p[k] + '</span>';
    if (it.s) for (k in it.s) h += '<span class="ic buf">' + C.ST[k].e + ' ' + C.ST[k].n + ' +' + it.s[k] + '</span>';
    return h;
  }
  function vCombat() {
    var cb = G.cb, e = cb.e, E = C.ENEMY[e.id], it = C.intent(G), inc = it.a * it.h, sel = UI.sel, i;
    var h = '<div class="cmb"><section class="foe k-' + cb.kind + '" id="foe" data-a="foe">' +
      '<div class="intent"><small>다음 행동</small>' + intentH(it) + '</div>' +
      '<div class="say" id="say"></div>' +
      '<div class="foe-em" id="foe-em">' + E.e + '</div>' +
      '<div class="foe-nm">' + (cb.kind === 'b' ? '<i class="tag b">보스</i>' : cb.kind === 'e' ? '<i class="tag e">정예</i>' : '') + '<b>' + E.n + '</b></div>' +
      '<div class="foe-hp">' + hpBar(e.hp, e.max, 'vio') + (e.block ? '<span class="shd">🛡️' + e.block + '</span>' : '') + '</div>' +
      '<div class="sts">' + chips(e.st) + '</div></section>';
    h += '<section class="me" id="me" data-a="me"><span class="av">' + avatar(38) + '</span><div class="me-b"><div class="me-1">' + hpBar(G.hp, G.max) + '<span class="shd' + (cb.blk ? ' on' : '') + '" id="blk">🛡️' + cb.blk + '</span></div>' +
      '<div class="me-2"><span class="sts">' + chips(cb.st) + '</span>' + (inc ? (inc > cb.blk ? '<span class="fc bad">받을 피해 ' + (inc - cb.blk) + '</span>' : '<span class="fc ok">모두 막음 ✓</span>') : '<span class="fc">공격 없음</span>') + '</div></div></section>';
    h += '<section class="eqs n' + G.eq.length + '">';
    for (i = 0; i < G.eq.length; i++) {
      var q = G.eq[i], D = C.EQ[q.id], V = C.variant(q), sl = cb.slots[i], open = C.slotOpen(G, i);
      var cls = !open ? ' off' : sel >= 0 ? (C.canPlace(G, sel, i) ? ' ok' : ' no') : '';
      var left = (V.uses > 1 ? '<i class="ul">' + ((V.uses || 1) - sl.u) + '회</i>' : '') + (V.cu ? '<i class="ul c">남은 ' + (V.cu - sl.cu) + '</i>' : '');
      h += '<button type="button" class="eq r-' + D.r + cls + '" id="eq' + i + '" data-a="slot" data-i="' + i + '"><span class="eq-e">' + D.e + '</span><span class="eq-b"><b>' + eqName(q) + left + '</b><small>' + V.d + '</small></span>' + needBadge(V, sl) + '</button>';
    }
    h += '</section><section class="tray" id="tray">';
    if (!cb.dice.length) h += '<span class="tray-x">주사위를 다 썼어요</span>';
    for (i = 0; i < cb.dice.length; i++) h += '<button type="button" class="dbtn' + (i === sel ? ' on' : '') + '" data-a="die" data-i="' + i + '">' + dieH(cb.dice[i]) + '</button>';
    h += '</section><p class="tip' + (hotTip() ? ' hot' : '') + '" id="tip">' + (hotTip() ? esc(hotTip()) : tipText()) + '</p>';
    h += '<section class="acts"><button type="button" class="btn ab undo" data-a="undo"' + (UI.undo.length ? '' : ' disabled') + ' aria-label="되돌리기">↩</button>' +
      '<button type="button" class="btn ab rr" data-a="reroll"' + (cb.rr > 0 && cb.dice.length ? '' : ' disabled') + '>🎲 ' + (sel >= 0 ? '이것만 다시' : '다시 굴리기') + ' <i class="cnt">' + cb.rr + '</i></button>' +
      '<button type="button" class="btn pri ab end" data-a="end">턴 종료</button></section></div>';
    return h;
  }
  function tipText() {
    var cb = G.cb;
    if (!cb.dice.length) return '‘턴 종료’ 를 누르면 적이 행동해요';
    if (!anyUsable()) return '넣을 수 있는 칸이 없어요 — ' + (cb.rr > 0 ? '다시 굴리거나 턴 종료' : '턴 종료를 누르세요');
    if (UI.sel >= 0) { for (var s = 0; s < G.eq.length; s++) if (C.canPlace(G, UI.sel, s)) return '넣을 장비 칸을 누르세요 (파란 테두리)'; return '이 주사위는 넣을 칸이 없어요 — 다른 주사위를 고르세요'; }
    if (cb.st.burn > 0) return '🔥 화상: 주사위를 쓸 때마다 체력 -1';
    return '주사위를 누른 뒤 장비 칸을 누르세요';
  }
  function anyUsable() {
    var cb = G.cb;
    for (var d = 0; d < cb.dice.length; d++) for (var s = 0; s < G.eq.length; s++) if (C.canPlace(G, d, s)) return true;
    return false;
  }
  function foeSheet() {
    var cb = G.cb, e = cb.e, E = C.ENEMY[e.id], it = C.intent(G), k, st = '', p = [];
    for (k in C.ST) if (e.st[k] > 0) st += '<li><b>' + C.ST[k].e + ' ' + C.ST[k].n + ' ' + e.st[k] + '</b> — ' + C.ST[k].d + '</li>';
    if (it.a) p.push(it.a + ' 피해' + (it.h > 1 ? '를 ' + it.h + '번 (합 ' + it.a * it.h + ')' : ''));
    if (it.b) p.push('방어 ' + it.b);
    if (it.p) for (k in it.p) p.push('나에게 ' + C.ST[k].n + ' ' + it.p[k]);
    if (it.s) for (k in it.s) p.push('자기 ' + C.ST[k].n + ' +' + it.s[k]);
    sheet('<h2>' + E.e + ' ' + E.n + '</h2><p><b>다음 행동</b> “' + it.t + '” — ' + p.join(', ') + '</p>' + (st ? '<ul class="stl">' + st + '</ul>' : '') +
      '<p class="hint">적은 정해진 순서로 행동을 되풀이해요. 적의 방어는 적 차례가 올 때 사라져요. ' + C.ENRAGE + '턴째부터는 지루해진 적이 매 턴 힘 +2 를 얻어요 (지금 ' + cb.turn + '턴).</p><div class="btns"><button type="button" class="btn pri" data-a="close">닫기</button></div>');
  }
  function meSheet() {
    var cb = G.cb, k, st = '';
    for (k in C.ST) if (cb.st[k] > 0) st += '<li><b>' + C.ST[k].e + ' ' + C.ST[k].n + ' ' + cb.st[k] + '</b> — ' + C.ST[k].d + '</li>';
    sheet('<h2>내 상태</h2><p>❤️ ' + G.hp + ' / ' + G.max + ' · 🛡️ 방어 ' + cb.blk + ' (내 턴이 시작될 때 사라져요)</p>' + (st ? '<ul class="stl">' + st + '</ul>' : '<p class="hint">걸린 상태가 없어요.</p>') +
      '<h4>유물</h4><div class="its">' + G.relics.map(function (id) { return relItem(id, 'disabled'); }).join('') + '</div><div class="btns"><button type="button" class="btn pri" data-a="close">닫기</button></div>');
  }
  function slotSheet(i) {
    var q = G.eq[i];
    sheet('<h2>' + C.EQ[q.id].e + ' ' + eqName(q) + '</h2><div class="its">' + eqItem(q, 'disabled') + '</div><p class="hint">주사위를 먼저 누른 다음 이 칸을 누르면 발동해요.' + (C.variant(q).need[0] === 'cd' ? ' 카운트다운은 넣은 눈만큼 숫자가 줄고, 0 이 되면 발동해요 (턴이 지나도 유지).' : '') + '</p><div class="btns"><button type="button" class="btn pri" data-a="close">닫기</button></div>');
  }
  function tutorial() {
    sheet('<h2>🎲 첫 전투 — 이렇게 해요</h2><ol class="tut">' +
      '<li><b>주사위를 누르고 → 장비 칸을 누르면</b> 그 장비가 발동해요. (검 = 눈만큼 피해, 방패 = 눈만큼 방어)</li>' +
      '<li>칸마다 <b>받는 눈</b>이 달라요 — 짝 · 홀 · ≤3 · ≥4 · 같은 눈 2개 · 카운트다운.</li>' +
      '<li>적 위의 <b>‘다음 행동’</b> 을 보고 방어를 준비하세요. 방어는 내 턴이 올 때 사라져요.</li>' +
      '<li>마음에 안 들면 <b>다시 굴리기</b>, 잘못 넣었으면 <b>↩ 되돌리기</b>. 다 했으면 <b>턴 종료</b>.</li></ol>' +
      '<div class="btns"><button type="button" class="btn pri" data-a="tutok">알겠어요!</button></div>', { lock: true });
  }
  function helpSheet() {
    sheet('<h2>하는 법</h2><ol class="tut">' +
      '<li>방을 골라 나아가요: ⚔️ 전투 · 💀 정예(강하지만 유물) · ❓ 사건 · 🛒 상점 · 🔥 휴식. 막의 끝에는 👑 보스.</li>' +
      '<li>전투에서는 턴마다 주사위를 굴려 <b>장비 칸에 넣어요</b>. 주사위 → 칸 순서로 눌러요.</li>' +
      '<li>적의 <b>다음 행동</b>이 미리 보여요. 방어는 한 턴만 유지돼요.</li>' +
      '<li>이기면 장비 3개 중 하나를 골라요. 장비는 최대 ' + C.MAXEQ + '칸 — 꽉 차면 바꿔야 해요.</li>' +
      '<li>보스를 이기면 <b>주사위 +1</b>. 3막 보스 잠만보를 이기면 클리어 → 승천(더 어려운 단계)이 열려요.</li>' +
      '<li>상태: ' + Object.keys(C.ST).map(function (k) { return C.ST[k].e + ' ' + C.ST[k].n; }).join(' · ') + ' — 전투 중 적이나 내 칸을 누르면 설명이 나와요.</li></ol>' +
      '<p class="hint">PC 키보드: 1~8 주사위 · Q W E A S D 장비 칸 · R 다시 굴리기 · Z 되돌리기 · Space 턴 종료</p>' +
      '<div class="btns"><button type="button" class="btn pri" data-a="close">닫기</button></div>');
  }

  /* ================= 화면: 보상 고르기 ================= */
  function vPick() {
    var p = G.pend[0], L = G.last, h = runHead() + '<div class="pk">', i;
    if (L && /보상|전리품/.test(p.why || '')) h += '<div class="won"><span class="e">' + C.ENEMY[L.id].e + '</span><div><b>' + C.ENEMY[L.id].n + ' 처치!</b><small>골드 +' + L.gold + (L.dice ? ' · 🎲 주사위 +1 · 체력 회복' : '') + '</small></div></div>';
    if (p.k === 'eq') {
      h += '<h2>' + (p.why || '보상') + ' <small>장비 하나를 고르세요 (' + G.eq.length + '/' + C.MAXEQ + '칸)</small></h2><div class="its">';
      for (i = 0; i < p.items.length; i++) h += eqItem(p.items[i], 'data-a="pk" data-i="' + i + '"');
      h += '</div><button type="button" class="btn wide ghost" data-a="skip">받지 않고 넘어가기</button>';
    } else if (p.k === 'rl') {
      h += '<h2>' + (p.why || '유물') + ' <small>유물 하나를 고르세요</small></h2><div class="its">';
      for (i = 0; i < p.items.length; i++) h += relItem(p.items[i], 'data-a="pk" data-i="' + i + '"');
      h += '</div><button type="button" class="btn wide ghost" data-a="skip">받지 않고 넘어가기</button>';
    } else if (p.k === 'up') {
      h += '<h2>' + (p.why || '강화') + ' <small>강화할 장비를 고르세요</small></h2><div class="its">';
      for (i = 0; i < G.eq.length; i++) if (!G.eq[i].up) h += eqItem(G.eq[i], 'data-a="pk" data-i="' + i + '"', '<span class="arrow">→ ' + C.variant({ id: G.eq[i].id, up: 1 }).d + '</span>');
      h += '</div><button type="button" class="btn wide ghost" data-a="skip">' + (p.back ? '← 돌아가기 (쉴지 다시 고르기)' : '강화하지 않기') + '</button>';
    } else {
      h += '<h2>' + (p.why || '장비 버리기') + ' <small>' + (p.gold ? '골드 +' + p.gold : '최대 체력 +' + p.max) + '</small></h2><div class="its">';
      for (i = 0; i < G.eq.length; i++) h += eqItem(G.eq[i], 'data-a="pk" data-i="' + i + '"');
      h += '</div><button type="button" class="btn wide ghost" data-a="skip">그만두기</button>';
    }
    return h + '</div>';
  }
  function replaceList(act, i) {   // 칸이 꽉 찼을 때: 바꿀 장비 고르기
    return '<h4>칸이 꽉 찼어요 — 바꿀 장비를 누르세요</h4><div class="its">' + G.eq.map(function (q, r) { return eqItem(q, 'data-a="' + act + '" data-i="' + i + '" data-rep="' + r + '"'); }).join('') + '</div>';
  }
  function pickSheet(i) {
    var p = G.pend[0], h;
    if (p.k === 'eq') {
      var it = p.items[i];
      h = '<h2>이 장비를 받을까요?</h2><div class="its">' + eqItem(it, 'disabled') + '</div>' +
        (G.eq.length >= C.MAXEQ ? replaceList('pkgo', i) + '<div class="btns"><button type="button" class="btn" data-a="close">취소</button></div>'
          : '<div class="btns"><button type="button" class="btn pri" data-a="pkgo" data-i="' + i + '">받기</button><button type="button" class="btn" data-a="close">취소</button></div>');
    } else if (p.k === 'rl') h = '<h2>이 유물을 받을까요?</h2><div class="its">' + relItem(p.items[i], 'disabled') + '</div><div class="btns"><button type="button" class="btn pri" data-a="pkgo" data-i="' + i + '">받기</button><button type="button" class="btn" data-a="close">취소</button></div>';
    else if (p.k === 'up') h = '<h2>강화할까요?</h2><div class="its">' + eqItem(G.eq[i], 'disabled') + '<div class="dn">▼</div>' + eqItem({ id: G.eq[i].id, up: 1 }, 'disabled') + '</div><div class="btns"><button type="button" class="btn pri" data-a="pkgo" data-i="' + i + '">강화하기</button><button type="button" class="btn" data-a="close">취소</button></div>';
    else h = '<h2>이 장비를 내놓을까요?</h2><div class="its">' + eqItem(G.eq[i], 'disabled') + '</div><p>되돌릴 수 없어요.</p><div class="btns"><button type="button" class="btn pri" data-a="pkgo" data-i="' + i + '">내놓기</button><button type="button" class="btn" data-a="close">취소</button></div>';
    sheet(h);
  }

  /* ================= 화면: 상점 · 휴식 · 사건 ================= */
  function priceTag(it) { return it.sold ? '<span class="pr sold">품절</span>' : '<span class="pr' + (G.gold < it.price ? ' poor' : '') + '">💰 ' + it.price + '</span>'; }
  function vShop() {
    var s = G.shop, h = runHead() + '<div class="pk"><h2>🛒 상점 <small>누르면 자세히 보고 살 수 있어요</small></h2><h4>장비</h4><div class="its">', i;
    for (i = 0; i < s.eq.length; i++) h += eqItem(s.eq[i], 'data-a="shop" data-w="eq" data-i="' + i + '"' + (s.eq[i].sold ? ' disabled' : ''), priceTag(s.eq[i]));
    h += '</div><h4>유물</h4><div class="its">';
    for (i = 0; i < s.rl.length; i++) h += relItem(s.rl[i].id, 'data-a="shop" data-w="rl" data-i="' + i + '"' + (s.rl[i].sold ? ' disabled' : ''), priceTag(s.rl[i]));
    if (!s.rl.length) h += '<p class="hint">유물을 모두 모았어요.</p>';
    h += '</div><h4>서비스</h4><div class="its">' +
      '<button type="button" class="it" data-a="shop" data-w="heal"' + (s.heal.sold ? ' disabled' : '') + '><span class="it-e">🍙</span><span class="it-b"><b>든든한 간식</b><small>체력 +' + C.shopHeal(G) + '</small></span>' + priceTag(s.heal) + '</button>' +
      '<button type="button" class="it" data-a="shop" data-w="up"' + (s.up.sold ? ' disabled' : '') + '><span class="it-e">🔧</span><span class="it-b"><b>장비 강화</b><small>장비 하나를 + 로</small></span>' + priceTag(s.up) + '</button>' +
      '</div><button type="button" class="btn pri wide" data-a="leave">상점 나가기</button></div>';
    return h;
  }
  function shopSheet(w, i) {
    var s = G.shop, it, h, poor;
    if (w === 'eq') {
      it = s.eq[i]; poor = G.gold < it.price;
      h = '<h2>살까요? <small>💰 ' + it.price + ' (가진 골드 ' + G.gold + ')</small></h2><div class="its">' + eqItem(it, 'disabled') + '</div>';
      if (poor) h += '<p class="bad">골드가 모자라요.</p><div class="btns"><button type="button" class="btn" data-a="close">닫기</button></div>';
      else if (G.eq.length >= C.MAXEQ) h += replaceList('buy" data-w="eq', i) + '<div class="btns"><button type="button" class="btn" data-a="close">취소</button></div>';
      else h += '<div class="btns"><button type="button" class="btn pri" data-a="buy" data-w="eq" data-i="' + i + '">사기</button><button type="button" class="btn" data-a="close">취소</button></div>';
    } else if (w === 'rl') {
      it = s.rl[i]; poor = G.gold < it.price;
      h = '<h2>살까요? <small>💰 ' + it.price + ' (가진 골드 ' + G.gold + ')</small></h2><div class="its">' + relItem(it.id, 'disabled') + '</div>' +
        (poor ? '<p class="bad">골드가 모자라요.</p><div class="btns"><button type="button" class="btn" data-a="close">닫기</button></div>' : '<div class="btns"><button type="button" class="btn pri" data-a="buy" data-w="rl" data-i="' + i + '">사기</button><button type="button" class="btn" data-a="close">취소</button></div>');
    } else if (w === 'heal') {
      it = s.heal; poor = G.gold < it.price;
      h = '<h2>🍙 든든한 간식 <small>💰 ' + it.price + '</small></h2><p>체력 +' + C.shopHeal(G) + ' (지금 ' + G.hp + ' / ' + G.max + ')</p>' +
        (poor ? '<p class="bad">골드가 모자라요.</p>' : G.hp >= G.max ? '<p class="bad">이미 체력이 가득해요.</p>' : '') +
        '<div class="btns">' + (poor || G.hp >= G.max ? '' : '<button type="button" class="btn pri" data-a="buy" data-w="heal">사기</button>') + '<button type="button" class="btn" data-a="close">닫기</button></div>';
    } else {
      it = s.up; poor = G.gold < it.price;
      var u = C.upgradable(G);
      h = '<h2>🔧 장비 강화 <small>💰 ' + it.price + '</small></h2>' + (poor ? '<p class="bad">골드가 모자라요.</p>' : !u.length ? '<p class="bad">강화할 장비가 없어요.</p>' : '<h4>강화할 장비를 누르세요</h4><div class="its">' + u.map(function (x) { return eqItem(G.eq[x], 'data-a="buy" data-w="up" data-i="' + x + '"', '<span class="arrow">→ ' + C.variant({ id: G.eq[x].id, up: 1 }).d + '</span>'); }).join('') + '</div>') +
        '<div class="btns"><button type="button" class="btn" data-a="close">닫기</button></div>';
    }
    sheet(h);
  }
  function vRest() {
    var hl = Math.min(C.restHeal(G), G.max - G.hp), can = C.upgradable(G).length > 0;
    return runHead() + '<div class="intro"><div class="ic">🔥</div><h2>쉬어 가기</h2><p>잠깐 숨을 돌릴 수 있어요. 둘 중 하나만 할 수 있어요.</p></div><div class="modes">' +
      '<button type="button" class="mode" data-a="rest" data-h="heal"><span class="ic">😴</span><span><b>눈 붙이기</b><small>체력 +' + hl + ' (' + G.hp + ' → ' + (G.hp + hl) + ' / ' + G.max + ')</small></span><span class="go">›</span></button>' +
      '<button type="button" class="mode" data-a="rest" data-h="up"' + (can ? '' : ' disabled') + '><span class="ic">🔧</span><span><b>장비 손질</b><small>' + (can ? '장비 하나를 강화해요 (+)' : '강화할 장비가 없어요') + '</small></span><span class="go">›</span></button></div>';
  }
  function vEvent() {
    var E = C.EVENT[G.evt.id], h = runHead() + '<div class="intro evt"><div class="ic">' + E.e + '</div><h2>' + E.t + '</h2><p>' + E.d + '</p></div>';
    if (G.evt.res) return h + '<div class="note res">' + G.evt.res + '</div>' + (G.evt.got && G.evt.got.length ? '<div class="its got">' + G.evt.got.map(function (id) { return relItem(id, 'disabled'); }).join('') + '</div>' : '') + '<button type="button" class="btn pri wide" data-a="evc">계속</button>';
    h += '<div class="modes">';
    for (var i = 0; i < E.opts.length; i++) {
      var o = E.opts[i], ok = !o.can || o.can(G);
      h += '<button type="button" class="mode opt" data-a="evo" data-i="' + i + '"' + (ok ? '' : ' disabled') + '><span><b>' + o.l + '</b><small>' + o.h + (ok ? '' : ' — 지금은 할 수 없어요') + '</small></span><span class="go">›</span></button>';
    }
    return h + '</div>';
  }

  /* ================= 화면: 결과 ================= */
  function resultLine(g) {
    if (g.win) return '3막 클리어!';
    var ov = g.over || {};
    return floorText(g) + (ov.quit ? '에서 그만둠' : ov.by ? '에서 ' + C.ENEMY[ov.by].n + '에게 쓰러짐' : '에서 쓰러짐');
  }
  function shareText() {
    var r = UI.res, g = G;
    return '🎲 잠만보 던전' + (g.daily ? ' — 오늘의 던전 ' + md(g.daily) : '') + '\n' + C.CLASS[g.cls].e + ' ' + C.CLASS[g.cls].n + (g.asc ? ' · 승천 ' + g.asc : '') + ' · ' + resultLine(g) + '\n' +
      '점수 ' + num(r.score) + ' · 처치 ' + g.stats.kills + ' (정예 ' + g.stats.elites + ' · 보스 ' + g.stats.bosses + ')\n' +
      g.eq.map(function (q) { return C.EQ[q.id].e; }).join('') + ' | ' + g.relics.map(function (id) { return C.RELIC[id].e; }).join('') + '\n' + location.origin + location.pathname;
  }
  function vOver() {
    var r = UI.res || { score: C.score(G), news: [] }, s = G.stats;
    var h = '<div class="over" id="shot"><div class="ov-h ' + (G.win ? 'win' : 'lose') + '"><div class="em">' + (G.win ? '🏆' : '💤') + '</div><h2>' + (G.win ? '던전 클리어!' : '여기까지…') + '</h2><p>' + (G.daily ? '오늘의 던전 ' + md(G.daily) + ' · ' : '') + C.CLASS[G.cls].e + ' ' + C.CLASS[G.cls].n + (G.asc ? ' · 승천 ' + G.asc : '') + '<br>' + resultLine(G) + '</p></div>' +
      '<div class="sc"><b>' + num(r.score) + '</b><small>점</small>' + (r.best ? '<i class="nb2">최고 기록!</i>' : '') + '</div>' +
      '<div class="kvs"><span><b>' + s.kills + '</b>처치</span><span><b>' + s.elites + '</b>정예</span><span><b>' + s.bosses + '</b>보스</span><span><b>' + num(s.dmg) + '</b>준 피해</span><span><b>' + s.turns + '</b>턴</span></div>' +
      '<div class="bld"><div class="bag big">' + G.eq.map(function (q) { return '<i' + (q.up ? ' class="u"' : '') + ' title="' + C.EQ[q.id].n + '">' + C.EQ[q.id].e + '</i>'; }).join('') + '</div><div class="bag big rl">' + G.relics.map(function (id) { return '<i title="' + C.RELIC[id].n + '">' + C.RELIC[id].e + '</i>'; }).join('') + '</div></div></div>';
    if (r.news && r.news.length) h += '<div class="note ok">' + r.news.join('<br>') + '</div>';
    h += '<div class="btns"><button type="button" class="btn pri" data-a="again">🎲 한 판 더</button><button type="button" class="btn" data-a="board" data-m="' + (G.daily ? 'daily' : 'run') + '">🏆 모임 랭킹</button></div><div class="btns three"><button type="button" class="btn" data-a="share">결과 공유</button><button type="button" class="btn" data-a="shot">이미지 저장</button><button type="button" class="btn" data-a="home">처음으로</button></div>';
    return h;
  }

  /* ================= 화면: 도감 · 기록 ================= */
  function vCodex() {
    function grid(ids, seen, f, kind) {
      return '<div class="cdx">' + ids.map(function (id) { var ok = seen.indexOf(id) >= 0, o = f(id); return '<button type="button" class="cx' + (ok ? '' : ' un') + '" data-a="cx" data-k="' + kind + '" data-id="' + id + '"' + (ok ? '' : ' disabled') + '><span>' + (ok ? o.e : '❔') + '</span><small>' + (ok ? o.n : '???') + '</small></button>'; }).join('') + '</div>';
    }
    var rids = Object.keys(C.RELIC);
    return '<div class="pk"><h2>📖 도감 <small>만나거나 얻은 것이 채워져요</small></h2>' +
      '<h4>적 ' + M.seen.e.length + '/' + C.ENEMY_IDS.length + '</h4>' + grid(C.ENEMY_IDS, M.seen.e, function (id) { return C.ENEMY[id]; }, 'e') +
      '<h4>장비 ' + M.seen.q.length + '/' + C.EQ_IDS.length + '</h4>' + grid(C.EQ_IDS, M.seen.q, function (id) { return C.EQ[id]; }, 'q') +
      '<h4>유물 ' + M.seen.r.length + '/' + rids.length + '</h4>' + grid(rids, M.seen.r, function (id) { return C.RELIC[id]; }, 'r') +
      '<button type="button" class="btn wide" data-a="home">돌아가기</button></div>';
  }
  function codexSheet(k, id) {
    var h;
    if (k === 'e') {
      var E = C.ENEMY[id];
      h = '<h2>' + E.e + ' ' + E.n + '</h2><p>' + (E.act + 1) + '막 ' + (E.k === 'b' ? '보스' : E.k === 'e' ? '정예' : '적') + ' · 체력 ' + E.hp + '</p><ul class="stl">' + E.mv.concat(E.ph2 ? E.ph2.mv : []).map(function (m) {
        var p = [], x; if (m.a) p.push('피해 ' + m.a + (m.h > 1 ? '×' + m.h : '')); if (m.b) p.push('방어 ' + m.b);
        if (m.p) for (x in m.p) p.push(C.ST[x].n + ' ' + m.p[x]); if (m.s) for (x in m.s) p.push('자기 ' + C.ST[x].n + ' +' + m.s[x]);
        return '<li><b>' + m.t + '</b> — ' + p.join(', ') + '</li>';
      }).join('') + '</ul>';
    } else if (k === 'q') h = '<h2>' + C.EQ[id].e + ' ' + C.EQ[id].n + '</h2><div class="its">' + eqItem({ id: id, up: 0 }, 'disabled') + eqItem({ id: id, up: 1 }, 'disabled') + '</div>';
    else h = '<h2>' + C.RELIC[id].e + ' ' + C.RELIC[id].n + '</h2><div class="its">' + relItem(id, 'disabled') + '</div>';
    sheet(h + '<div class="btns"><button type="button" class="btn pri" data-a="close">닫기</button></div>');
  }
  function vRec() {
    var h = '<div class="pk"><h2>🏆 기록 <small>이 기기에 저장돼요</small></h2><div class="kvs big"><span><b>' + (M.best ? num(M.best.score) : '-') + '</b>최고 점수</span><span><b>' + M.runs + '</b>판</span><span><b>' + M.wins + '</b>클리어</span><span><b>' + M.asc + '</b>승천 단계</span></div>';
    h += '<h4>직업</h4><div class="its">' + C.CLASS_IDS.map(function (id) { var K = C.CLASS[id]; return '<div class="it"><span class="it-e">' + (unlocked(id) ? K.e : '🔒') + '</span><span class="it-b"><b>' + K.n + '</b><small>' + (unlocked(id) ? '클리어 ' + (M.clsWin[id] || 0) + '번' : K.unlock) + '</small></span></div>'; }).join('') + '</div>';
    h += '<h4>최근 판</h4>';
    if (!M.hist.length) h += '<p class="hint">아직 끝낸 판이 없어요.</p>';
    else h += '<div class="its">' + M.hist.map(function (x) { return '<div class="it"><span class="it-e">' + (x.win ? '🏆' : C.CLASS[x.cls] ? C.CLASS[x.cls].e : '🎲') + '</span><span class="it-b"><b>' + num(x.score) + '점 <i class="rar">' + (x.daily ? '오늘의 던전' : x.asc ? '승천 ' + x.asc : '기본') + '</i></b><small>' + md(x.d) + ' · ' + (C.CLASS[x.cls] ? C.CLASS[x.cls].n : '') + ' · ' + (x.win ? '클리어' : x.floor + '층') + '</small></span></div>'; }).join('') + '</div>';
    return h + '<button type="button" class="btn wide" data-a="home">돌아가기</button></div>';
  }

  /* ================= 그리기 ================= */
  function render() {
    var v = $('view'), h, ph = UI.scr === 'run' && G ? G.phase : UI.scr, cmb = ph === 'combat';
    document.documentElement.classList.toggle('in-cmb', cmb);
    document.documentElement.classList.toggle('in-map', ph === 'map');
    if (UI.scr === 'home') h = vHome();
    else if (UI.scr === 'codex') h = vCodex();
    else if (UI.scr === 'rec') h = vRec();
    else h = { map: vMap, combat: vCombat, pick: vPick, shop: vShop, rest: vRest, event: vEvent, over: vOver }[G.phase]();
    v.innerHTML = h;
    $('ttl').textContent = UI.scr === 'run' && G && G.daily ? '오늘의 던전' : '잠만보 던전';
    drawMap(); hSync();
    $('sub').textContent = UI.scr !== 'run' || !G ? '주사위 로그라이크' : G.phase === 'over' ? '결과' : floorText(G) + (cmb ? ' · ' + G.cb.turn + '턴' : '') + (G.asc ? ' · 승천 ' + G.asc : '');
    if (ph !== UI.lastPhase) {   // 화면이 바뀌면 떠 있던 알림은 지움 (전투에서 막 뜬 알림만 새 화면으로 옮김)
      window.scrollTo(0, 0); UI.lastPhase = ph;
      var keep = cmb ? '' : hotTip();
      clearTimeout(toastT); UI.hot = null; $('toast').className = 'toast';
      if (keep) toast(keep, 2600);
    }
  }

  /* ================= 효과 (떠오르는 숫자 · 소리) ================= */
  function floatAt(id, txt, cls, delay) {
    setTimeout(function () {
      var el = $(id); if (!el) return;
      var r = el.getBoundingClientRect(), f = document.createElement('i');
      f.className = 'flt ' + (cls || ''); f.textContent = txt;
      f.style.left = (r.left + r.width / 2 + (Math.random() * 44 - 22)) + 'px'; f.style.top = (r.top + r.height * 0.35) + 'px';
      document.body.appendChild(f);
      setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 950);
    }, delay || 0);
  }
  function bump(id, cls, delay) { setTimeout(function () { var el = $(id); if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }, delay || 0); }
  function play(evs) {
    var t = 0, rolled = false;
    evs.forEach(function (e) {
      switch (e.k) {
        case 'hit':
          if (e.n > 0) { floatAt('foe-em', '-' + e.n, e.dot ? 'dot' : 'dmg', t); bump('foe-em', 'shake', t); setTimeout(function () { sfx('hit'); }, t); }
          else if (e.b > 0) { floatAt('foe-em', '막힘', 'blk', t); setTimeout(function () { sfx('blk'); }, t); }
          t += 130; break;
        case 'phit':
          if (e.n > 0) { floatAt('me', '-' + e.n, 'dmg', t); bump('me', 'shake', t); setTimeout(function () { sfx('hurt'); haptic('warn'); }, t); }
          else if (e.b > 0) { floatAt('me', '방어!', 'blk', t); setTimeout(function () { sfx('blk'); }, t); }
          t += 150; break;
        case 'blk': floatAt('me', '+' + e.n + '🛡️', 'blk', t); setTimeout(function () { sfx('blk'); }, t); t += 80; break;
        case 'heal': floatAt('me', '+' + e.n, 'heal', t); setTimeout(function () { sfx('heal'); }, t); t += 80; break;
        case 'gold': floatAt('me', '+' + e.n + '💰', 'gold', t); setTimeout(function () { sfx('coin'); }, t); t += 80; break;
        case 'st': floatAt(e.who === 'e' ? 'foe-em' : 'me', C.ST[e.s].e + ' ' + C.ST[e.s].n + ' +' + e.n, 'st', t + 60); setTimeout(function () { sfx(e.who === 'e' && (e.s === 'str' || e.s === 'thorns') || e.who === 'p' && e.s !== 'str' && e.s !== 'thorns' ? 'debuff' : 'buff'); }, t); t += 90; break;
        case 'use': bump('eq' + e.si, 'fired', t); break;
        case 'eblk': floatAt('foe-em', '+' + e.n + '🛡️', 'blk', t); t += 80; break;
        case 'roll': if (!rolled) { rolled = true; setTimeout(function () { sfx('roll'); var tr = $('tray'); if (tr) { tr.classList.remove('rolling'); void tr.offsetWidth; tr.classList.add('rolling'); } }, t); } break;
        case 'phase': setTimeout(function () { toast(e.t, 2800); haptic('bomb'); }, t); break;
        case 'enrage': if (!UI.enr) { UI.enr = true; setTimeout(function () { toast('적이 지루해하며 점점 강해져요 (매 턴 힘 +2)', 2800); }, t); } break;
        case 'revive': setTimeout(function () { toast('🃏 에러플 방지 카드! 다시 일어났어요', 2600); sfx('heal'); }, t); break;
      }
    });
  }

  /* ================= 행동 ================= */
  function syncMeta() {   // 도감 · 해금 · 판 끝 기록
    var ch = false, news = [];
    ['e', 'r', 'q'].forEach(function (k) { G.seen[k].forEach(function (id) { if (M.seen[k].indexOf(id) < 0) { M.seen[k].push(id); ch = true; } }); });
    function un(id) { if (!M.unlock[id]) { M.unlock[id] = 1; ch = true; news.push('🔓 새 직업 【' + C.CLASS[id].n + '】 이(가) 열렸어요!'); } }
    if (G.stats.bosses >= 1) un('party');
    if (G.stats.bosses >= 2) un('rule');
    if (G.win) un('troll');
    if (G.phase === 'over' && !G.done) {
      G.done = 1; ch = true;
      var sc = C.score(G), best = !M.best || sc > M.best.score, fl = G.win ? C.ACTS * (C.ROWS + 1) : G.over.floor;
      M.runs++;
      if (G.win) { M.wins++; M.clsWin[G.cls] = (M.clsWin[G.cls] || 0) + 1; if (G.asc >= M.asc && M.asc < C.ASC.length) { M.asc++; news.push('⬆️ 승천 ' + M.asc + ' 단계가 열렸어요 — ' + C.ASC[M.asc - 1]); } }
      if (best) M.best = { score: sc, floor: fl, cls: G.cls, win: G.win ? 1 : 0, d: today() };
      M.hist.unshift({ d: today(), cls: G.cls, asc: G.asc, score: sc, floor: fl, win: G.win ? 1 : 0, daily: G.daily ? 1 : 0 });
      M.hist = M.hist.slice(0, 12);
      if (G.daily) {
        if (G.rec) M.daily[G.daily] = { score: sc, floor: fl, win: G.win ? 1 : 0, cls: G.cls };   // 첫 도전 (시작할 때 '도전 중' 으로 적어 둔 판)
        else if (M.daily[G.daily]) news.push('연습이에요 — 오늘의 던전 기록은 첫 도전(' + num(M.daily[G.daily].score) + '점)만 남아요.');
        var ks = Object.keys(M.daily).sort(); while (ks.length > 14) delete M.daily[ks.shift()];
      }
      UI.res = { score: sc, best: best && M.runs > 1, news: news };
      // 모임 랭킹: 일반 판은 run, 오늘의 던전은 첫 도전만 daily (연습은 안 보냄). 0점은 안 보냄
      var mode = !G.daily ? 'run' : G.rec ? 'daily' : '';
      if (ARC && mode && sc > 0) {
        var note = (C.CLASS[G.cls].n + ' · ' + (G.win ? '3막 클리어' : floorText(G)) + (G.asc ? ' · 승천 ' + G.asc : '')).slice(0, 40);
        try { ARC.report('rogue', mode, Math.max(0, Math.min(9999999, Math.round(sc))), note); } catch (e) {}
      }
    } else if (news.length) toast(news[0], 3200);
    if (ch) saveMeta();
  }
  // 규칙 행동 하나를 하고 화면에 반영. 전투가 끝나는 순간은 잠깐 뜸을 들였다가 다음 화면으로
  function doAct(a, pre) {
    if (UI.busy || !G) return false;
    var p0 = G.phase, snap = (a.t === 'place' || a.t === 'unplace') ? JSON.stringify(G) : null, rc = G.rs.c;
    if (!C.act(G, a)) return false;
    var evs = G.ev; G.ev = [];
    if (snap && G.phase === 'combat' && G.rs.c === rc) UI.undo.push(snap); else UI.undo = [];
    UI.sel = -1;
    syncMeta(); saveRun();
    var ended = p0 === 'combat' && G.phase !== 'combat', wait = pre || 0;
    if (ended) {
      UI.busy = true;
      var won = G.phase !== 'over' || G.win, last = G.last;
      setTimeout(function () {
        play(evs);
        if (won) { var f = $('foe-em'); if (f) f.classList.add('dead'); sfx(G.phase === 'over' ? 'big' : 'win'); haptic('win'); if (FX && last && last.kind !== 'f') FX.confetti({ y: 0.3, count: last.kind === 'b' ? 160 : 70 }); }
        else { var m = $('me'); if (m) m.classList.add('dead'); sfx('lose'); haptic('bomb'); }
      }, wait);
      setTimeout(function () { UI.busy = false; UI.enr = false; render(); if (UI.scr === 'run' && G && G.phase === 'over' && G.win && FX) FX.confetti({ count: 200, duration: 3200 }); }, wait + 750);
    } else if (wait) {
      UI.busy = true;
      setTimeout(function () { UI.busy = false; render(); play(evs); }, wait);
    } else {
      render(); play(evs);
      if (G.phase === 'combat' && p0 !== 'combat') { UI.enr = false; enterFx(); if (!SET.tut) tutorial(); }
    }
    return true;
  }
  // 적 등장: 톡 튀어나옴. 정예 · 보스는 이름 띠가 잠깐 지나감 (조작은 막지 않음)
  function enterFx() {
    var cb = G.cb, E = C.ENEMY[cb.e.id];
    bump('foe-em', 'enter');
    if (cb.kind === 'f') return;
    var old = document.querySelector('.banner'); if (old) old.parentNode.removeChild(old);
    var el = document.createElement('div'); el.className = 'banner k-' + cb.kind; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<small>' + (cb.kind === 'b' ? '👑 보스 등장' : '💀 정예 등장') + '</small><b>' + E.e + ' ' + E.n + '</b>';
    document.body.appendChild(el); haptic(cb.kind === 'b' ? 'bomb' : 'turn'); sfx('debuff');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1500);
  }
  // 오늘의 던전 첫 도전을 끝내지 않고 버릴 때(새 판 시작): 그 시점 점수로 확정하고 이후는 연습
  function settleDaily(old) {
    if (!old || !old.daily || !old.rec) return;
    var sc = C.score(old);
    M.daily[old.daily] = { score: sc, floor: C.floorOf(old), win: 0, cls: old.cls }; saveMeta();
    if (ARC && sc > 0) { try { ARC.report('rogue', 'daily', Math.min(9999999, sc), (C.CLASS[old.cls].n + ' · ' + floorText(old) + ' · 그만둠').slice(0, 40), { quiet: true }); } catch (e) {} }
  }
  function liveDaily() { var sv = savedRun(), d = today(); return sv && sv.daily === d && sv.rec && M.daily[d] && M.daily[d].live ? sv : null; }   // 이어서 할 수 있는 오늘의 첫 도전
  function startRun(cls, asc, daily) {
    var seed = daily ? C.dailySeed(daily) : ((Date.now() ^ (Math.random() * 4294967296)) >>> 0) || 1;
    settleDaily(savedRun());
    G = C.newRun({ seed: seed, cls: cls, asc: asc, daily: daily || '' });
    if (daily && !M.daily[daily]) { G.rec = 1; M.daily[daily] = { score: 0, floor: 1, win: 0, cls: cls, live: 1 }; saveMeta(); }   // 시작하는 순간 '도전 중' — 다시 시작해도 첫 도전은 하나뿐
    UI.scr = 'run'; UI.undo = []; UI.sel = -1; UI.res = null; UI.busy = false;
    saveRun(); closeSheet(); sfx('go'); render();
  }
  function endTurn(force) {
    if (UI.busy || !G || G.phase !== 'combat') return;
    var half = G.cb.slots.some(function (x) { return x.held.length > 0; });
    if (!force && (half || anyUsable())) { confirmSheet('턴을 끝낼까요?', half ? '칸에 하나만 걸쳐 둔 주사위가 있어요 — 턴을 끝내면 그냥 사라져요. (그 칸을 누르면 주사위를 되찾아요)' : '아직 넣을 수 있는 주사위가 있어요.', '턴 종료', 'endok'); return; }
    closeSheet();
    var it = C.intent(G), foe = $('foe'), say = $('say');
    if (foe) foe.classList.add(it.a ? 'lunge' : 'cast');
    if (say) { say.textContent = it.t; say.classList.add('on'); }
    sfx(it.a ? 'no' : 'buff'); haptic('turn');
    doAct({ t: 'end' }, 560);
  }
  function selDie(i) {
    if (UI.busy || !G || G.phase !== 'combat' || !G.cb.dice[i]) return;
    UI.sel = UI.sel === i ? -1 : i; sfx('sel'); haptic('tap'); render();
  }
  function tapSlot(i) {
    if (UI.busy || !G || G.phase !== 'combat' || !G.eq[i]) return;
    var cb = G.cb;
    if (UI.sel < 0) {
      if (cb.slots[i].held.length) { doAct({ t: 'unplace', slot: i }); sfx('sel'); return; }
      if (cb.dice.length === 1 && C.canPlace(G, 0, i)) { doAct({ t: 'place', die: 0, slot: i }); haptic('tap'); return; }   // 주사위가 하나뿐이면 칸만 눌러도 됨
      slotSheet(i); return;
    }
    if (!C.canPlace(G, UI.sel, i)) {
      var V = C.variant(G.eq[i]);
      var why = C.whyNot(G, UI.sel, i);
      toast(why === 'cu' ? '이 장비는 이번 전투에 다 썼어요' : why === 'used' ? '이 장비는 이번 턴에 이미 썼어요' : why === 'full' ? '주사위 자리가 모자라요 (최대 ' + C.MAXDICE + '개) — 다른 주사위를 먼저 쓰세요' : '이 칸은 【' + C.needText(V.need) + '】 만 받아요', 1800);
      sfx('no'); bump('tray', 'nudge'); return;
    }
    haptic('tap');
    doAct({ t: 'place', die: UI.sel, slot: i });
  }
  function undo() {
    if (UI.busy || !UI.undo.length) return;
    G = JSON.parse(UI.undo.pop()); G.ev = []; UI.sel = -1; saveRun(); sfx('sel'); render();
  }
  function reroll() { if (G && G.phase === 'combat') { if (!doAct({ t: 'reroll', die: UI.sel })) sfx('no'); } }
  function leaveToHome() {   // 뒤로가기 · 뒤로 버튼: 판은 저장해 두고 처음 화면으로
    var run = UI.scr === 'run' && G && G.phase !== 'over';
    if (run) saveRun(); else if (G && G.phase === 'over' && !UI.busy) G = null;
    goHome();
    if (run) toast('진행은 저장됐어요 — ‘이어하기’ 로 계속할 수 있어요', 2600);
  }
  function goHome() { UI.scr = 'home'; UI.sel = -1; closeSheet(); $('toast').className = 'toast'; render(); }
  function menuSheet() {
    var run = UI.scr === 'run' && G && G.phase !== 'over';
    sheet('<h2>메뉴</h2><div class="its">' +
      '<button type="button" class="it" data-a="snd"><span class="it-e">' + (SET.snd ? '🔊' : '🔇') + '</span><span class="it-b"><b>소리 ' + (SET.snd ? '켜짐' : '꺼짐') + '</b><small>누르면 바뀌어요</small></span></button>' +
      (FX ? '<button type="button" class="it" data-a="hap"><span class="it-e">📳</span><span class="it-b"><b>진동 ' + (FX.hapticOn() ? '켜짐' : '꺼짐') + '</b><small>누르면 바뀌어요</small></span></button>' : '') +
      '<button type="button" class="it" data-a="help"><span class="it-e">❓</span><span class="it-b"><b>하는 법</b><small>규칙 · 상태 이상 · 키보드</small></span></button>' +
      (run ? '<button type="button" class="it" data-a="build"><span class="it-e">🎒</span><span class="it-b"><b>내 빌드</b><small>장비 · 유물 보기</small></span></button>' +
        '<button type="button" class="it" data-a="tohome"><span class="it-e">🏠</span><span class="it-b"><b>처음 화면으로</b><small>진행은 저장돼요 — 나중에 이어하기</small></span></button>' +
        '<button type="button" class="it" data-a="quit"><span class="it-e">🏳️</span><span class="it-b"><b>이 판 포기하기</b><small>지금까지의 점수로 끝내요</small></span></button>' : '') +
      '</div><p class="hint ctr">잠만보 던전 v' + VER + '</p><div class="btns"><button type="button" class="btn pri" data-a="close">닫기</button></div>');
  }

  /* ================= 누르기 ================= */
  var ACT = {
    close: closeSheet,
    cont: function () { closeSheet(); var g = savedRun(); if (!g) { toast('이어할 판이 없어요'); render(); return; } G = g; UI.scr = 'run'; UI.undo = []; UI.sel = -1; UI.res = null; UI.busy = false; sfx('go');
      try { render(); } catch (e) { if (window.console) console.warn(e); G = null; lsSet(LS.run, null); UI.scr = 'home'; render(); toast('저장된 판을 불러오지 못해 지웠어요'); }   // 예전 형식 · 깨진 저장
    },
    cls: function (d) { UI.cls = d.id; saveSet(); render(); },
    asc: function (d) { UI.asc = Math.max(0, Math.min(M.asc, UI.asc + (+d.d))); saveSet(); render(); },
    'new': function () { if (!unlocked(UI.cls)) return; if (savedRun()) confirmSheet('새 판을 시작할까요?', '진행 중인 판은 사라져요.' + (liveDaily() ? ' 오늘의 던전 도전은 지금 점수로 확정돼요.' : ''), '새로 시작', 'newok'); else startRun(UI.cls, UI.asc, ''); },
    newok: function () { startRun(UI.cls, UI.asc, ''); },
    daily: function () {
      var d = today(), cls = C.dailyClass(d), r = M.daily[d], sv = savedRun(), live = liveDaily();
      sheet('<h2>📅 오늘의 던전 <small>' + md(d) + '</small></h2><p>오늘은 모두가 <b>' + C.CLASS[cls].e + ' ' + C.CLASS[cls].n + '</b> (으)로 같은 던전에 들어가요 — 지도가 같고, 같은 방에서는 같은 적 · 같은 보상 후보 · 같은 주사위가 나와요. 기록은 <b>첫 도전</b>만 남아요 (도중에 새로 시작하면 그때 점수로 확정).</p>' +
        (live ? '<div class="note ok">첫 도전을 하는 중이에요 — ' + floorText(live) + ' · ❤️ ' + live.hp + '/' + live.max + '</div>' : r ? '<div class="note ok">내 기록 ' + num(r.score) + '점 · ' + (r.win ? '클리어' : r.floor + '층') + ' — 다시 하면 연습이에요.</div>' : '') + (sv && !live ? '<p class="bad">진행 중인 판은 사라져요.</p>' : '') +
        '<div class="btns">' + (live ? '<button type="button" class="btn pri" data-a="cont">이어서 도전하기</button>' : '<button type="button" class="btn pri" data-a="dailyok">' + (r ? '연습으로 다시 하기' : '도전하기') + '</button>') + '<button type="button" class="btn" data-a="board" data-m="daily">🏆 모임 랭킹</button><button type="button" class="btn" data-a="close">취소</button></div>');
    },
    dailyok: function () { var d = today(); startRun(C.dailyClass(d), 0, d); },
    board: function (d) { openBoard(d.m); },
    codex: function () { UI.scr = 'codex'; render(); },
    rec: function () { UI.scr = 'rec'; render(); },
    home: function () { if (G && G.phase === 'over') G = null; goHome(); },
    help: helpSheet, build: buildSheet, foe: foeSheet, me: meSheet,
    cx: function (d) { codexSheet(d.k, d.id); },
    go: function (d) { if (doAct({ t: 'go', col: +d.c })) { sfx('go'); haptic('tap'); } },
    die: function (d) { selDie(+d.i); },
    slot: function (d) { tapSlot(+d.i); },
    undo: undo, reroll: reroll,
    end: function () { endTurn(false); }, endok: function () { endTurn(true); },
    tutok: function () { SET.tut = 1; saveSet(); closeSheet(); },
    pk: function (d) { pickSheet(+d.i); },
    pkgo: function (d) { closeSheet(); if (doAct({ t: 'pick', i: +d.i, rep: d.rep == null ? -1 : +d.rep })) sfx('coin'); },
    skip: function () { doAct({ t: 'skip' }); },
    shop: function (d) { shopSheet(d.w, +d.i); },
    buy: function (d) { closeSheet(); if (doAct({ t: 'buy', what: d.w, i: +d.i || 0, rep: d.rep == null ? -1 : +d.rep })) { sfx('coin'); toast('샀어요!', 1200); } else { sfx('no'); toast('살 수 없어요'); } },
    leave: function () { doAct({ t: 'leave' }); },
    rest: function (d) { var b = G.hp; if (doAct({ t: 'rest', how: d.h })) { if (d.h === 'heal') { sfx('heal'); toast('푹 쉬었어요. 체력 +' + (G.hp - b)); } } },
    evo: function (d) { if (doAct({ t: 'opt', i: +d.i })) sfx('sel'); },
    evc: function () { doAct({ t: 'cont' }); },
    again: function () { if (G && G.daily) { G = null; goHome(); } else startRun(G ? G.cls : UI.cls, G ? Math.min(M.asc, UI.asc) : UI.asc, ''); },
    share: function () {
      var txt = shareText();
      if (navigator.share && /Android|iP(hone|ad|od)|Mobi/.test(navigator.userAgent)) navigator.share({ text: txt }).catch(function () {});
      else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { toast('결과를 복사했어요 — 단톡방에 붙여 넣으세요'); }, function () { toast('복사하지 못했어요'); });
      else toast('복사하지 못했어요');
    },
    shot: function () { if (!FX) return; FX.capture($('shot'), '잠만보던전_' + today(), { title: '잠만보 던전' }).then(function (r) { if (r === 'saved') toast('이미지를 저장했어요'); }, function (e) { toast(e && e.message || '이미지를 만들지 못했어요'); }); },
    snd: function () { SET.snd = SET.snd ? 0 : 1; saveSet(); if (SET.snd) sfx('coin'); menuSheet(); },
    hap: function () { FX.setHaptic(!FX.hapticOn()); haptic('tap'); menuSheet(); },
    tohome: function () { closeSheet(); leaveToHome(); },
    quit: function () { confirmSheet('이 판을 포기할까요?', '지금까지의 점수로 기록되고, 이어할 수 없어요.', '포기하기', 'quitok'); },
    quitok: function () {
      closeSheet(); if (!G || G.phase === 'over') return;
      G.over = { by: '', floor: C.floorOf(G), quit: 1 }; G.phase = 'over'; G.win = false; G.cb = null;
      syncMeta(); saveRun(); render();
    }
  };
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-a]') : null;
    if (!t || t.disabled) return;
    if (t.classList.contains('mbg')) { if (e.target !== t || t.classList.contains('lock')) return; }
    var f = ACT[t.getAttribute('data-a')];
    if (f) f(t.dataset, t);
  });
  $('back').onclick = function () {
    if (boardOpen()) return;
    if (sheetOpen()) { if (!$('modal').querySelector('.lock')) closeSheet(); return; }
    if (UI.scr === 'home') { location.href = ROOT; return; }
    leaveToHome();
  };
  $('menu').onclick = menuSheet;
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || boardOpen()) return;   // 랭킹 창이 떠 있으면 게임 키 무시 (ESC 는 랭킹 창이 처리)
    if (e.key === 'Escape') { if (sheetOpen() && !$('modal').querySelector('.lock')) closeSheet(); return; }
    if (sheetOpen() || UI.scr !== 'run' || !G || G.phase !== 'combat') return;
    var k = e.key.toLowerCase(), si = 'qweasd'.indexOf(k);
    if (k >= '1' && k <= '8') selDie(+k - 1);
    else if (k.length === 1 && si >= 0) tapSlot(si);
    else if (k === 'r') reroll();
    else if (k === 'z') undo();
    else if (k === ' ' || k === 'enter') { e.preventDefault(); endTurn(false); }
  });

  /* ================= 시작 ================= */
  if (!C) { $('view').innerHTML = '<p class="hint">게임을 불러오지 못했어요. 새로고침해 주세요.</p>'; return; }
  loadMeta();
  H.d = hLevel(history.state);   // 판 도중 새로고침하면 history 에 쌓인 칸이 남아 있음 → 처음 화면에 맞게 정리
  render();
})();
