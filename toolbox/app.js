/*! 잠만보 모임 도구함 — 화면 v1.0.0
 * 서버 없이 이 기기에서만 동작하는 모임용 도구: 📝 점수판(보드게임 점수 기록 · 순위 · 공유) · 🎲 주사위 · 🪙 동전 · 👥 팀 나누기 / 순서 정하기 / 한 명 뽑기
 * 명단은 파티 게임(jmb_party_roster)과 같은 이름 목록을 처음에 가져와 쓰고, 잠만보 데이터(jmb_data_v2)에서 '최근 모임 참가자' · '회원' 을 불러올 수 있음.
 * 기기 저장: jmb_toolbox_roster(명단) · jmb_toolbox_opt(설정 · 선택) · jmb_toolbox_sb(진행 중인 점수판) · jmb_toolbox_hist(끝낸 점수판 최근 10개)
 */
(function () {
  'use strict';
  var VER = '1.0.0';
  var FX = window.JMB_FX || { avatar: function () { return ''; }, haptic: function () {}, confetti: function () {} };
  var ROOT = (function () { var seg = location.pathname.split('/')[1] || ''; return /\.github\.io$/.test(location.hostname) && seg ? '/' + seg + '/' : '/'; })();
  var KEY = { roster: 'jmb_toolbox_roster', opt: 'jmb_toolbox_opt', sb: 'jmb_toolbox_sb', hist: 'jmb_toolbox_hist' };
  var MAXP = 20, MAXSB = 10;

  /* ---------- 작은 도구 ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function lsJSON(k, d) { try { var v = JSON.parse(lsGet(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { lsSet(k, JSON.stringify(v)); }
  function rnd(n) { try { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; } catch (e) { return Math.floor(Math.random() * n); } }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function uniq(a) { var s = {}, o = []; a.forEach(function (x) { if (x && !s[x]) { s[x] = 1; o.push(x); } }); return o; }
  function av(n, px) { return '<span class="av">' + FX.avatar(n, px || 28) + '</span>'; }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? Math.round(n * 100) / 100 : 0; }
  function fmt(n) { return (n > 0 ? '' : '') + String(Math.round(n * 100) / 100); }
  var toastT = 0;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.className = 'toast on'; clearTimeout(toastT); toastT = setTimeout(function () { t.className = 'toast'; }, 2200); }
  function copyText(text, msg) {
    var ok = function () { toast(msg || '복사했어요'); };
    var legacy = function () { try { var a = document.createElement('textarea'); a.value = text; a.style.cssText = 'position:fixed;left:-999px'; document.body.appendChild(a); a.select(); document.execCommand('copy'); document.body.removeChild(a); ok(); } catch (e) { toast('복사하지 못했어요'); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, legacy); else legacy();
  }

  /* ---------- 명단 · 설정 ---------- */
  var ROSTER = (function () { var r = lsJSON(KEY.roster, null); if (!Array.isArray(r)) r = lsJSON('jmb_party_roster', []); return uniq((Array.isArray(r) ? r : []).map(function (s) { return String(s).trim().slice(0, 12); })).slice(0, MAXP); })();
  var OPT = Object.assign({ tab: 'sb', sel: {}, dir: 'high', game: '', target: '', n: 2, s: 6, tmode: 'team', teams: 2, coin: { h: 0, t: 0 } }, lsJSON(KEY.opt, {}));
  if (['sb', 'dice', 'team'].indexOf(OPT.tab) < 0) OPT.tab = 'sb';
  var SB = lsJSON(KEY.sb, null);
  if (SB && (!Array.isArray(SB.players) || !Array.isArray(SB.rows))) SB = null;
  var HIST = lsJSON(KEY.hist, []);
  var UI = { draft: [], dice: null, rolling: false, coin: null, res: null, spin: 0, memQ: '' };
  function saveRoster() { save(KEY.roster, ROSTER); }
  function saveOpt() { save(KEY.opt, OPT); }
  function saveSB() { if (SB) save(KEY.sb, SB); else lsSet(KEY.sb, null); }
  function selNames() { return ROSTER.filter(function (n) { return OPT.sel[n] !== false; }); }
  function addNames(list) {
    var before = ROSTER.length;
    ROSTER = uniq(ROSTER.concat(list.map(function (s) { return String(s).trim().slice(0, 12); }))).slice(0, MAXP);
    saveRoster(); return ROSTER.length - before;
  }

  /* 잠만보 데이터(이 기기에 저장된 것)에서 회원 · 최근 모임 참가자 */
  var CLUB = { members: [], meet: null };
  function unpack(t) {
    if (t && Array.isArray(t.c) && Array.isArray(t.r)) return t.r.map(function (row) { var o = {}; t.c.forEach(function (k, i) { o[k] = row[i]; }); return o; });
    return Array.isArray(t) ? t : [];
  }
  (function scanClub() {
    try {
      var root = JSON.parse(lsGet('jmb_data_v2') || 'null'); if (!root) return;
      var d = root.d || root;
      CLUB.members = uniq(unpack(d.members).map(function (m) { return String(m.name || m['닉네임'] || '').trim(); }));
      var today = new Date(); today.setHours(23, 59, 59, 0);
      unpack(d.meetings).forEach(function (m) {
        var dt = new Date(String(m.date || '').trim().replace(/\.\s*/g, '-').replace(/-$/, '')), names = uniq((Array.isArray(m.participants) ? m.participants : String(m.participants || '').split(/[,，、\n]+/)).map(function (s) { return String(s).trim(); }));
        if (isNaN(dt) || dt > today || names.length < 2) return;
        if (!CLUB.meet || dt > CLUB.meet.d) CLUB.meet = { d: dt, names: names };
      });
    } catch (e) {}
  })();
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function cho(s) { var o = ''; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i) - 0xAC00; o += c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : s[i]; } return o; }
  function koMatch(name, q) { if (!q) return true; name = name.toLowerCase().replace(/\s+/g, ''); q = q.toLowerCase().replace(/\s+/g, ''); return name.indexOf(q) >= 0 || cho(name).indexOf(q) >= 0; }

  /* ---------- 창 ---------- */
  function sheet(html) { $('modal').innerHTML = '<div class="mbg" data-act="close"><div class="sheet" role="dialog" aria-modal="true">' + html + '</div></div>'; }
  function closeSheet() { $('modal').innerHTML = ''; }

  /* ---------- 명단 카드 (점수판 · 팀 탭에서 같이 씀) ---------- */
  function rosterCard(title, min) {
    var on = selNames().length;
    return '<div class="card"><h3>' + esc(title) + ' <small>' + on + '명 선택 / 명단 ' + ROSTER.length + '명</small></h3>' +
      '<div class="addrow"><input class="in" id="nameIn" maxlength="12" autocomplete="off" placeholder="이름 입력 후 추가" enterkeyhint="done"><button type="button" class="btn pri" data-act="addName">추가</button></div>' +
      (ROSTER.length ? '<div class="chips">' + ROSTER.map(function (n) {
        return '<span class="chip' + (OPT.sel[n] === false ? '' : ' on') + '" data-act="tog" data-n="' + esc(n) + '" role="button" tabindex="0">' + av(n, 26) + '<span class="nm">' + esc(n) + '</span><button type="button" class="x" data-act="rm" data-n="' + esc(n) + '" aria-label="' + esc(n) + ' 빼기">✕</button></span>';
      }).join('') + '</div><p class="hint">이름을 누르면 이번에 하는 사람으로 켜고 꺼요 · ✕ 는 명단에서 빼기' + (min ? ' · 최소 ' + min + '명' : '') + '</p>'
        : '<div class="empty">아직 명단이 없어요. 이름을 추가하거나 아래에서 불러오세요.</div>') +
      '<div class="row" style="margin-top:8px">' + (CLUB.meet ? '<button type="button" class="btn sm" data-act="addMeet">📅 최근 모임 참가자 ' + CLUB.meet.names.length + '명</button>' : '') +
      (CLUB.members.length ? '<button type="button" class="btn sm" data-act="pickMem">👥 회원에서 고르기</button>' : '') +
      (ROSTER.length ? '<button type="button" class="btn sm" data-act="selAll">전체 켜기</button>' : '') + '</div></div>';
  }
  function memSheet() {
    var q = UI.memQ, list = CLUB.members.filter(function (m) { return koMatch(m, q); }).slice(0, 80);
    sheet('<h2>회원에서 고르기</h2><input class="in" id="memQ" placeholder="이름 · 초성 검색 (예: ㅎㅈ)" value="' + esc(q) + '" autocomplete="off">' +
      '<div style="margin-top:8px">' + (list.map(function (m) { var has = ROSTER.indexOf(m) >= 0; return '<button type="button" class="mem' + (has ? ' on' : '') + '" data-act="memTog" data-n="' + esc(m) + '">' + av(m, 26) + '<span>' + esc(m) + '</span>' + (has ? '<span class="ck">✓</span>' : '') + '</button>'; }).join('') || '<div class="empty">검색 결과가 없어요</div>') + '</div>' +
      '<div class="btns"><button type="button" class="btn pri" data-act="close">닫기</button></div>');
    var inp = $('memQ'); if (inp) { inp.addEventListener('input', function () { UI.memQ = inp.value; var pos = inp.selectionStart; memSheet(); var n = $('memQ'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } }); }
  }

  /* ================= 📝 점수판 ================= */
  function totals() {
    return SB.players.map(function (n, c) { return SB.rows.reduce(function (s, r) { return s + num(r[c]); }, 0); });
  }
  function ranks(tot) {   // 방식에 따라 높을수록 / 낮을수록 좋음, 같으면 같은 등수
    var idx = tot.map(function (v, i) { return i; }).sort(function (a, b) { return SB.dir === 'low' ? tot[a] - tot[b] : tot[b] - tot[a]; }), rk = [], r = 0;
    idx.forEach(function (i, k) { if (k === 0 || tot[i] !== tot[idx[k - 1]]) r = k + 1; rk[i] = r; });
    return rk;
  }
  function recentHist() {
    if (!HIST.length) return '';
    return '<div class="card"><h3>🗂 최근 점수판 <small>' + HIST.length + '개</small></h3><div class="hist">' + HIST.slice(0, 5).map(function (h) {
      var top = h.res.filter(function (x) { return x.r === 1; }).map(function (x) { return x.n; }).join(' · ');
      return '<div class="h"><b>' + esc(h.game || '보드게임') + '</b><span>🥇 ' + esc(top) + ' ' + fmt(h.res[0].s) + '점</span><small>' + esc(h.d) + ' · ' + h.res.length + '명</small></div>';
    }).join('') + '</div></div>';
  }
  function viewSbSetup() {
    var n = selNames().length;
    return rosterCard('같이 하는 사람', 2) +
      '<div class="card"><h3>점수판 만들기</h3>' +
      '<div class="lab">게임 이름 <span style="font-weight:500;color:var(--muted)">(선택)</span></div><input class="in" id="gameIn" maxlength="24" autocomplete="off" placeholder="예: 카탄, 스플렌더" value="' + esc(OPT.game) + '">' +
      '<div class="lab">이기는 방식</div><div class="seg"><button type="button" data-act="dir" data-v="high" class="' + (OPT.dir === 'low' ? '' : 'on') + '">점수가 높을수록 승리</button><button type="button" data-act="dir" data-v="low" class="' + (OPT.dir === 'low' ? 'on' : '') + '">낮을수록 승리</button></div>' +
      '<div class="lab">목표 점수 <span style="font-weight:500;color:var(--muted)">(선택 — 넘으면 표시해 줘요)</span></div><input class="in" id="tgtIn" inputmode="decimal" maxlength="6" autocomplete="off" placeholder="예: 10, 100" value="' + esc(OPT.target) + '">' +
      '<div class="btns"><button type="button" class="btn pri xl" data-act="sbStart"' + (n >= 2 && n <= MAXSB ? '' : ' disabled') + '>' + (n < 2 ? '두 명 이상 켜 주세요' : n > MAXSB ? '최대 ' + MAXSB + '명까지예요' : '점수판 시작 (' + n + '명)') + '</button></div></div>' + recentHist();
  }
  function entRows() {
    return SB.players.map(function (nm, c) {
      return '<div class="ent"><div class="who">' + av(nm, 30) + '<span>' + esc(nm) + '</span></div>' +
        '<button type="button" class="stp" data-act="stp" data-c="' + c + '" data-d="-1" aria-label="' + esc(nm) + ' 1점 빼기">−</button>' +
        '<input class="sc" id="sc' + c + '" data-c="' + c + '" inputmode="decimal" autocomplete="off" placeholder="0" value="' + esc(UI.draft[c] || '') + '" aria-label="' + esc(nm) + ' 이번 라운드 점수">' +
        '<button type="button" class="stp" data-act="stp" data-c="' + c + '" data-d="1" aria-label="' + esc(nm) + ' 1점 더하기">+</button>' +
        '<button type="button" class="stp" data-act="neg" data-c="' + c + '" aria-label="' + esc(nm) + ' 부호 바꾸기">±</button></div>';
    }).join('');
  }
  function viewSbPlay() {
    var tot = totals(), rk = ranks(tot), has = SB.rows.length > 0, tg = SB.target > 0, order = tot.map(function (v, i) { return i; }).sort(function (a, b) { return rk[a] - rk[b] || a - b; });
    var medal = ['🥇', '🥈', '🥉'];
    var h = '<div class="card"><h3>' + esc(SB.game || '점수판') + ' <small>라운드 ' + (SB.rows.length + 1) + ' 진행 중 · ' + (SB.dir === 'low' ? '낮을수록 승리' : '높을수록 승리') + (tg ? ' · 목표 ' + fmt(SB.target) : '') + '</small></h3>' +
      '<div class="rank">' + order.map(function (i) {
        var lead = has && rk[i] === 1;
        return '<div class="rk' + (lead ? ' lead' : '') + '">' + (has && rk[i] <= 3 ? '<span class="m">' + medal[rk[i] - 1] + '</span>' : '') + av(SB.players[i], 34) + '<div class="nm">' + esc(SB.players[i]) + '</div><div class="tot">' + fmt(tot[i]) + '</div>' + (tg && tot[i] >= SB.target ? '<div class="tg">🎯 목표 도달</div>' : '') + '</div>';
      }).join('') + '</div></div>';
    h += '<div class="card"><h3>라운드 ' + (SB.rows.length + 1) + ' 점수 <small>비워 두면 0점</small></h3>' + entRows() +
      '<div class="btns"><button type="button" class="btn pri xl" data-act="commit">✔ 라운드 저장</button></div></div>';
    if (has) {
      h += '<div class="card"><h3>라운드별 점수 <span class="sp"></span><button type="button" class="btn sm" data-act="undo">↩ 마지막 라운드 지우기</button></h3><div class="tblwrap"><table class="tbl"><thead><tr><th></th>' +
        SB.players.map(function (n) { return '<th>' + esc(n) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        SB.rows.map(function (r, ri) { return '<tr><td class="r">' + (ri + 1) + '</td>' + SB.players.map(function (n, c) { var v = num(r[c]); return '<td class="' + (v < 0 ? 'neg' : '') + '"><button type="button" data-act="edit" data-r="' + ri + '" data-c="' + c + '" aria-label="' + (ri + 1) + '라운드 ' + esc(n) + ' ' + fmt(v) + '점 고치기">' + fmt(v) + '</button></td>'; }).join('') + '</tr>'; }).join('') +
        '</tbody><tfoot><tr><td class="r">합</td>' + tot.map(function (v) { return '<td>' + fmt(v) + '</td>'; }).join('') + '</tr></tfoot></table></div><p class="hint">점수를 누르면 고치거나 그 라운드를 지울 수 있어요</p></div>';
    }
    h += '<div class="btns"><button type="button" class="btn" data-act="finish"' + (has ? '' : ' disabled') + '>🏁 점수판 끝내기</button><button type="button" class="btn bad" data-act="sbReset">새로 시작 (지우기)</button></div>';
    return h;
  }
  function sbStart() {
    keepForm();
    var names = selNames();
    if (names.length < 2 || names.length > MAXSB) return;
    SB = { game: String(OPT.game || '').trim().slice(0, 24), dir: OPT.dir === 'low' ? 'low' : 'high', target: num(OPT.target), players: names, rows: [], t: Date.now() };
    UI.draft = []; saveSB(); render(); toast('점수판을 시작했어요 — 라운드가 끝날 때마다 점수를 적어 주세요');
  }
  function readDraft() { SB.players.forEach(function (n, c) { var el = $('sc' + c); if (el) UI.draft[c] = el.value; }); }
  function commit() {
    readDraft();
    var row = SB.players.map(function (n, c) { return num(UI.draft[c]); });
    SB.rows.push(row); UI.draft = []; saveSB(); FX.haptic('tap');
    SB.players.forEach(function (n, c) { var el = $('sc' + c); if (el) el.value = ''; });   // 입력칸을 비워야 render 가 옛 값을 다시 읽어 오지 않음
    render();
    var tot = totals(); if (SB.target > 0 && tot.some(function (v) { return v >= SB.target; })) { toast('🎯 목표 점수에 도달한 사람이 있어요!'); FX.haptic('win'); }
    window.scrollTo(0, 0);
  }
  function resultText(res) {
    var medal = ['🥇', '🥈', '🥉'];
    return '🎲 ' + (SB.game || '보드게임') + ' 결과\n' + res.map(function (x) { return (x.r <= 3 ? medal[x.r - 1] : x.r + '위') + ' ' + x.n + ' ' + fmt(x.s) + '점'; }).join('\n');
  }
  function finishSheet() {
    var tot = totals(), rk = ranks(tot), res = SB.players.map(function (n, i) { return { n: n, s: tot[i], r: rk[i] }; }).sort(function (a, b) { return a.r - b.r; });
    var medal = ['🥇', '🥈', '🥉'], win = res.filter(function (x) { return x.r === 1; });
    sheet('<h2>🏁 ' + esc(SB.game || '보드게임') + ' 결과</h2>' +
      '<p style="margin:0 0 8px">🎉 <b>' + win.map(function (x) { return esc(x.n); }).join(' · ') + '</b> 님 승리! (' + SB.rows.length + '라운드)</p>' +
      '<div class="hist">' + res.map(function (x) { return '<div class="h">' + av(x.n, 24) + '<b>' + (x.r <= 3 ? medal[x.r - 1] : x.r + '위') + ' ' + esc(x.n) + '</b><small style="font-size:15px;color:var(--ink);font-weight:800">' + fmt(x.s) + '점</small></div>'; }).join('') + '</div>' +
      '<div class="btns"><button type="button" class="btn" data-act="copyRes">📋 결과 복사</button><button type="button" class="btn pri" data-act="saveEnd">저장하고 끝내기</button></div>' +
      '<div class="btns"><button type="button" class="btn" data-act="close">계속 하기</button></div>');
    FX.confetti({ count: 90, duration: 1800 });
  }
  function saveEnd() {
    var tot = totals(), rk = ranks(tot), res = SB.players.map(function (n, i) { return { n: n, s: tot[i], r: rk[i] }; }).sort(function (a, b) { return a.r - b.r; });
    var d = new Date(); HIST.unshift({ d: (d.getMonth() + 1) + '/' + d.getDate(), game: SB.game, dir: SB.dir, res: res }); HIST = HIST.slice(0, 10); save(KEY.hist, HIST);
    SB = null; saveSB(); UI.draft = []; closeSheet(); render(); toast('저장했어요 — 새 점수판을 만들 수 있어요');
  }
  function editSheet(r, c) {
    var v = num(SB.rows[r][c]);
    sheet('<h2>' + av(SB.players[c], 28) + ' ' + esc(SB.players[c]) + ' · ' + (r + 1) + '라운드</h2>' +
      '<div class="ent"><button type="button" class="stp" data-act="eStp" data-d="-1">−</button><input class="sc" id="editIn" style="flex:1;width:auto" inputmode="decimal" autocomplete="off" value="' + esc(v) + '"><button type="button" class="stp" data-act="eStp" data-d="1">+</button><button type="button" class="stp" data-act="eNeg">±</button></div>' +
      '<div class="btns"><button type="button" class="btn pri" data-act="editSave" data-r="' + r + '" data-c="' + c + '">저장</button><button type="button" class="btn bad" data-act="delRound" data-r="' + r + '">이 라운드 지우기</button></div><div class="btns"><button type="button" class="btn" data-act="close">취소</button></div>');
    var el = $('editIn'); if (el) { el.focus(); el.select(); }
  }

  /* ================= 🎲 주사위 · 🪙 동전 ================= */
  var PIPS = [[4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];   // d6 눈: 3×3 칸 중 점이 찍히는 자리
  function dieHtml(v, s, rolling) {
    var pip = s === 6, dots = '';
    if (pip) for (var i = 0; i < 9; i++) dots += '<i' + (PIPS[v - 1].indexOf(i) >= 0 ? ' class="on"' : '') + '></i>';
    return '<div class="die' + (rolling ? ' rolling' : '') + '" aria-label="' + v + '">' + (pip ? '<span class="pipbox">' + dots + '</span>' : v) + '</div>';
  }
  function viewDice() {
    var d = UI.dice, sum = d ? d.reduce(function (a, b) { return a + b; }, 0) : 0, cn = OPT.coin;
    return '<div class="card"><h3>🎲 주사위</h3>' +
      '<div class="lab">개수</div><div class="seg">' + [1, 2, 3, 4, 5, 6].map(function (n) { return '<button type="button" data-act="dn" data-v="' + n + '" class="' + (OPT.n === n ? 'on' : '') + '">' + n + '개</button>'; }).join('') + '</div>' +
      '<div class="lab">종류</div><div class="seg">' + [4, 6, 8, 10, 12, 20].map(function (s) { return '<button type="button" data-act="ds" data-v="' + s + '" class="' + (OPT.s === s ? 'on' : '') + '">d' + s + '</button>'; }).join('') + '</div>' +
      '<div class="dice" id="diceBox">' + (d ? d.map(function (v) { return dieHtml(v, OPT.s, UI.rolling); }).join('') : '<div class="empty">아래 버튼을 눌러 굴려 보세요</div>') + '</div>' +
      (d && OPT.n > 1 && !UI.rolling ? '<div class="sum">합계 <b>' + sum + '</b></div>' : '') +
      '<div class="btns"><button type="button" class="btn pri xl" data-act="roll"' + (UI.rolling ? ' disabled' : '') + '>🎲 굴리기</button></div></div>' +
      '<div class="card"><h3>🪙 동전 던지기 <small>앞 ' + cn.h + ' · 뒤 ' + cn.t + '</small></h3>' +
      '<div class="coin' + (UI.coin && UI.coin.anim ? ' flip' : '') + '" id="coin">' + (UI.coin ? (UI.coin.anim ? '?' : UI.coin.v) : '🪙') + '</div>' +
      '<div class="btns"><button type="button" class="btn pri xl" data-act="flip"' + (UI.coin && UI.coin.anim ? ' disabled' : '') + '>🪙 던지기</button></div>' +
      '<div class="btns"><button type="button" class="btn sm" data-act="coinReset">횟수 지우기</button></div></div>';
  }
  function roll() {
    if (UI.rolling) return;
    UI.rolling = true; var n = OPT.n, s = OPT.s, t0 = Date.now(), timer;
    var randomSet = function () { var a = []; for (var i = 0; i < n; i++) a.push(1 + rnd(s)); return a; };
    UI.dice = randomSet(); render(); FX.haptic('tap');
    timer = setInterval(function () {
      if (Date.now() - t0 > 650) { clearInterval(timer); UI.rolling = false; UI.dice = randomSet(); render(); FX.haptic('turn'); return; }
      UI.dice = randomSet(); var box = $('diceBox'); if (box) box.innerHTML = UI.dice.map(function (v) { return dieHtml(v, s, true); }).join('');
    }, 70);
  }
  function flip() {
    if (UI.coin && UI.coin.anim) return;
    var v = rnd(2) ? '앞' : '뒤';
    UI.coin = { anim: true, v: v }; render(); FX.haptic('tap');
    setTimeout(function () { UI.coin.anim = false; OPT.coin[v === '앞' ? 'h' : 't']++; saveOpt(); render(); FX.haptic('turn'); }, 1000);
  }

  /* ================= 👥 팀 · 순서 · 뽑기 ================= */
  var TC = ['var(--t0)', 'var(--t1)', 'var(--t2)', 'var(--t3)'], TN = ['🔵 파랑팀', '🔴 빨강팀', '🟢 초록팀', '🟡 노랑팀'];
  function viewTeam() {
    var n = selNames().length, m = OPT.tmode, need = m === 'team' ? OPT.teams : 2;
    var h = '<div class="card"><h3>무엇을 할까요?</h3><div class="seg">' + [['team', '👥 팀 나누기'], ['order', '🔢 순서 정하기'], ['pick', '👆 한 명 뽑기']].map(function (x) { return '<button type="button" data-act="tmode" data-v="' + x[0] + '" class="' + (m === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      (m === 'team' ? '<div class="lab">팀 수</div><div class="seg">' + [2, 3, 4].map(function (k) { return '<button type="button" data-act="tn" data-v="' + k + '" class="' + (OPT.teams === k ? 'on' : '') + '">' + k + '팀</button>'; }).join('') + '</div>' : '') +
      '<div class="btns"><button type="button" class="btn pri xl" data-act="go"' + (n >= need && !UI.spin ? '' : ' disabled') + '>' + (n < need ? need + '명 이상 켜 주세요' : m === 'team' ? '팀 나누기' : m === 'order' ? '순서 섞기' : '뽑기!') + '</button></div></div>';
    h += resultHtml();
    return h + rosterCard('참가자', need);
  }
  function resultHtml() {
    var R = UI.res; if (!R) return '';
    if (R.kind === 'team') return '<div class="card"><h3>👥 팀 결과 <span class="sp"></span><button type="button" class="btn sm" data-act="go">🔀 다시 섞기</button></h3><div class="teams">' + R.teams.map(function (t, i) { return '<div class="tm" style="--c:' + TC[i] + '"><h4>' + TN[i] + ' · ' + t.length + '명</h4>' + t.map(function (n) { return '<div class="p">' + av(n, 26) + '<span>' + esc(n) + '</span></div>'; }).join('') + '</div>'; }).join('') + '</div><div class="btns"><button type="button" class="btn" data-act="copyTeam">📋 결과 복사</button></div></div>';
    if (R.kind === 'order') return '<div class="card"><h3>🔢 순서 <span class="sp"></span><button type="button" class="btn sm" data-act="go">🔀 다시 섞기</button></h3><ol class="ord">' + R.list.map(function (n, i) { return '<li><i>' + (i + 1) + '</i>' + av(n, 26) + '<span>' + esc(n) + '</span></li>'; }).join('') + '</ol><div class="btns"><button type="button" class="btn" data-act="copyTeam">📋 결과 복사</button></div></div>';
    return '<div class="card pick' + (R.spin ? ' spin' : '') + '">' + av(R.name, 64) + '<div class="big">' + esc(R.name) + (R.spin ? '' : ' 님!') + '</div>' + (R.spin ? '<p class="hint">누구일까요…</p>' : '<div class="btns"><button type="button" class="btn" data-act="go">다시 뽑기</button></div>') + '</div>';
  }
  function runTeam() {
    var names = selNames(), m = OPT.tmode;
    if (m === 'team') {
      if (names.length < OPT.teams) return;
      var sh = shuffle(names), teams = []; for (var i = 0; i < OPT.teams; i++) teams.push([]);
      sh.forEach(function (n, k) { teams[k % OPT.teams].push(n); });
      UI.res = { kind: 'team', teams: teams }; FX.haptic('turn'); render();
    } else if (m === 'order') {
      if (names.length < 2) return;
      UI.res = { kind: 'order', list: shuffle(names) }; FX.haptic('turn'); render();
    } else {
      if (names.length < 2) return;
      var final = names[rnd(names.length)], step = 0, total = 12 + rnd(5), delay = 60;
      UI.spin = 1; UI.res = { kind: 'pick', name: names[0], spin: 1 }; render();
      (function tick() {
        step++;
        if (step >= total) { UI.res = { kind: 'pick', name: final, spin: 0 }; UI.spin = 0; render(); FX.haptic('win'); FX.confetti({ count: 70, duration: 1600 }); return; }
        UI.res.name = names[rnd(names.length)]; var big = document.querySelector('.pick .big'); if (big) big.textContent = UI.res.name; FX.haptic('tap');
        delay += 12; setTimeout(tick, delay);
      })();
    }
  }
  function teamText() {
    var R = UI.res; if (!R) return '';
    if (R.kind === 'team') return '👥 팀 나누기\n' + R.teams.map(function (t, i) { return TN[i] + ': ' + t.join(', '); }).join('\n');
    if (R.kind === 'order') return '🔢 순서\n' + R.list.map(function (n, i) { return (i + 1) + '. ' + n; }).join('\n');
    return '';
  }

  /* ---------- 화면 ---------- */
  function keepForm() { var g = $('gameIn'), t = $('tgtIn'); if (g) OPT.game = g.value; if (t) OPT.target = t.value; saveOpt(); }
  function render() {
    if (SB && OPT.tab === 'sb') readDraftSafe();
    keepForm();
    [].forEach.call($('tabs').children, function (b) { var on = b.getAttribute('data-tab') === OPT.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    $('view').innerHTML = OPT.tab === 'sb' ? (SB ? viewSbPlay() : viewSbSetup()) : OPT.tab === 'dice' ? viewDice() : viewTeam();
  }
  function readDraftSafe() { try { readDraft(); } catch (e) {} }
  var wl = null;
  function wake() { try { if (navigator.wakeLock && !wl) navigator.wakeLock.request('screen').then(function (l) { wl = l; l.addEventListener('release', function () { wl = null; }); }, function () {}); } catch (e) {} }

  /* ---------- 이벤트 ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-tab],[data-act]');
    if (!t) return;
    var tab = t.getAttribute('data-tab');
    if (tab) { if (SB && OPT.tab === 'sb') readDraftSafe(); keepForm(); OPT.tab = tab; saveOpt(); closeSheet(); $('toast').className = 'toast'; render(); window.scrollTo(0, 0); return; }
    var a = t.getAttribute('data-act'), n = t.getAttribute('data-n'), v = t.getAttribute('data-v'), c = +t.getAttribute('data-c'), r = +t.getAttribute('data-r');
    if (a === 'close') { if (e.target.closest('.sheet') && !t.matches('button')) return; closeSheet(); return; }
    if (a === 'rm') { e.stopPropagation(); ROSTER = ROSTER.filter(function (x) { return x !== n; }); delete OPT.sel[n]; saveRoster(); saveOpt(); render(); return; }
    if (a === 'tog') { OPT.sel[n] = OPT.sel[n] === false ? true : false; saveOpt(); render(); return; }
    if (a === 'addName') { var inp = $('nameIn'), val = inp ? inp.value.trim() : ''; if (!val) return toast('이름을 입력해 주세요'); if (ROSTER.length >= MAXP) return toast('명단은 ' + MAXP + '명까지예요'); if (ROSTER.indexOf(val.slice(0, 12)) >= 0) return toast('이미 있는 이름이에요'); addNames([val]); render(); var ni = $('nameIn'); if (ni) ni.focus(); return; }
    if (a === 'addMeet') { var k = addNames(CLUB.meet.names); render(); toast(k ? k + '명을 추가했어요' : '이미 모두 있어요'); return; }
    if (a === 'pickMem') { UI.memQ = ''; memSheet(); return; }
    if (a === 'memTog') { if (ROSTER.indexOf(n) >= 0) { ROSTER = ROSTER.filter(function (x) { return x !== n; }); saveRoster(); } else if (ROSTER.length < MAXP) addNames([n]); else toast('명단은 ' + MAXP + '명까지예요'); memSheet(); render(); return; }
    if (a === 'selAll') { OPT.sel = {}; saveOpt(); render(); return; }
    if (a === 'dir') { OPT.dir = v; saveOpt(); render(); return; }
    if (a === 'sbStart') return sbStart();
    if (a === 'stp') { var el = $('sc' + c); if (!el) return; el.value = fmt(num(el.value) + (+t.getAttribute('data-d'))); UI.draft[c] = el.value; FX.haptic('tap'); return; }
    if (a === 'neg') { var el2 = $('sc' + c); if (!el2) return; var nv = num(el2.value); el2.value = nv === 0 ? '-' : fmt(-nv); UI.draft[c] = el2.value; el2.focus(); return; }
    if (a === 'commit') return commit();
    if (a === 'undo') { if (!SB.rows.length) return; SB.rows.pop(); saveSB(); render(); toast('마지막 라운드를 지웠어요'); return; }
    if (a === 'edit') return editSheet(r, c);
    if (a === 'eStp') { var ee = $('editIn'); if (ee) ee.value = fmt(num(ee.value) + (+t.getAttribute('data-d'))); return; }
    if (a === 'eNeg') { var e3 = $('editIn'); if (e3) { var q = num(e3.value); e3.value = q === 0 ? '-' : fmt(-q); e3.focus(); } return; }
    if (a === 'editSave') { var e4 = $('editIn'); SB.rows[r][c] = num(e4 ? e4.value : 0); saveSB(); closeSheet(); render(); return; }
    if (a === 'delRound') { SB.rows.splice(r, 1); saveSB(); closeSheet(); render(); toast('그 라운드를 지웠어요'); return; }
    if (a === 'finish') return finishSheet();
    if (a === 'copyRes') { var tot = totals(), rk = ranks(tot); return copyText(resultText(SB.players.map(function (nm, i) { return { n: nm, s: tot[i], r: rk[i] }; }).sort(function (x, y) { return x.r - y.r; })), '결과를 복사했어요 — 단톡방에 붙여넣어 주세요'); }
    if (a === 'saveEnd') return saveEnd();
    if (a === 'sbReset') { if (!confirm('점수를 모두 지우고 처음부터 할까요?')) return; SB = null; saveSB(); UI.draft = []; render(); return; }
    if (a === 'dn') { OPT.n = +v; saveOpt(); UI.dice = null; render(); return; }
    if (a === 'ds') { OPT.s = +v; saveOpt(); UI.dice = null; render(); return; }
    if (a === 'roll') return roll();
    if (a === 'flip') return flip();
    if (a === 'coinReset') { OPT.coin = { h: 0, t: 0 }; saveOpt(); UI.coin = null; render(); return; }
    if (a === 'tmode') { OPT.tmode = v; UI.res = null; saveOpt(); render(); return; }
    if (a === 'tn') { OPT.teams = +v; UI.res = null; saveOpt(); render(); return; }
    if (a === 'go') return runTeam();
    if (a === 'copyTeam') return copyText(teamText(), '복사했어요 — 단톡방에 붙여넣어 주세요');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('modal').firstChild) { closeSheet(); return; }
    if (e.key === 'Enter' && e.target && e.target.id === 'nameIn') { e.preventDefault(); var b = document.querySelector('[data-act="addName"]'); if (b) b.click(); return; }
    if (e.key === 'Enter' && e.target && e.target.classList && e.target.classList.contains('sc') && e.target.id !== 'editIn') {   // 점수칸에서 Enter = 다음 사람으로, 마지막이면 저장
      e.preventDefault(); var c = +e.target.getAttribute('data-c'), nx = $('sc' + (c + 1)); if (nx) nx.focus(); else commit(); return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.classList && e.target.classList.contains('chip')) { e.preventDefault(); e.target.click(); }
  });
  document.addEventListener('input', function (e) { var el = e.target; if (el && el.classList && el.classList.contains('sc') && el.id !== 'editIn') UI.draft[+el.getAttribute('data-c')] = el.value; });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') wake(); });
  $('back').onclick = function () { location.href = ROOT; };
  if (/[?&]reset\b/.test(location.search)) { try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {} }
  wake(); render();
})();
