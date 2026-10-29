/*! 잠만보 방탈출 — 화면 v1.0.0
 * 서버: 잠만보 메인 Apps Script (Escape.gs — escData · escSaveTheme · escHideTheme · escSaveLog · escDeleteLog · escWish)
 * 탭: 🔍 찾기(검색·필터·정렬) · 📔 내 일지(기록·통계) · 👥 모임(같이 갈 사람에게 맞춘 추천·랭킹) · ❤️ 가고 싶어요(같이 가요 모집 글)
 * 주소: #/t/<테마ID> = 그 테마 열기 (카톡에 공유하면 바로 그 테마)
 * 빠르게 여는 방법: 기기에 저장해 둔 목록을 바로 그림 → 서버에는 버전만 물어봄 (같으면 작은 응답)
 */
(function () {
  'use strict';
  var VER = '1.0.0';
  var CFG = window.JMB_CONFIG || {};
  var ENV = CFG.env || 'prod';
  var ENV_SFX = ENV !== 'prod' ? '_' + ENV : '';
  var API = window.ESC_API_LOCAL || CFG.api || '';
  var ROOT = (function () { var seg = location.pathname.split('/')[1] || ''; return /\.github\.io$/.test(location.hostname) && seg ? '/' + seg + '/' : '/'; })();
  var LS = { auth: 'jmb_kakao_v2' + ENV_SFX, state: 'jmb_kakao_state' + ENV_SFX, data: 'jmb_esc_v1' + ENV_SFX, tab: 'jmb_esc_tab', sort: 'jmb_esc_sort', f: 'jmb_esc_f', with: 'jmb_esc_with' };
  // 서버 Escape.gs 의 TPUB · LPUB 와 같게
  var TCOLS = ['id', 'area', 'sub', 'store', 'name', 'rate', 'diff', 'rev', 'ppl', 'min', 'genre', 'act', 'kind', 'price', 'link', 'memo', 'src', 'by'];
  var LCOLS = ['id', 'date', 'tid', 'nick', 'res', 'left', 'hint', 'star', 'feel', 'fear', 'note', 'with', 'by'];
  var AREAS = ['서울', '경기', '인천', '지방권'], PPL = ['2', '3', '4', '5+'];
  var DIFFS = { easy: [1, 4, '쉬움 (1~4)'], mid: [5, 7, '보통 (5~7)'], hard: [8, 10, '어려움 (8~10)'] };
  var PAGE = 40;

  var S = { themes: [], byId: Object.create(null), logs: [], wish: [], members: [], me: '', admin: false, ver: '',
    tab: lsGet(LS.tab) || 'find', sort: lsGet(LS.sort) || 'rate', f: lsJSON(LS.f) || {}, q: '', shown: PAGE, loaded: false,
    stat: Object.create(null), mine: Object.create(null), wishBy: Object.create(null), myWish: Object.create(null),
    pick: lsJSON(LS.with) || null, recArea: '' };

  /* ================= 공통 ================= */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function lsJSON(k) { try { return JSON.parse(lsGet(k) || 'null'); } catch (e) { return null; } }
  var toastT = 0;
  function toast(msg, err) {
    var t = $('toast');
    t.textContent = msg; t.className = 'toast on' + (err ? ' err' : '');
    clearTimeout(toastT); toastT = setTimeout(function () { t.className = 'toast' + (err ? ' err' : ''); }, err ? 3800 : 2400);
  }
  function n(v) { return v === '' || v == null || !isFinite(Number(v)) ? null : Number(v); }
  function comma(x) { return Number(x).toLocaleString('ko-KR'); }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^0-9a-z가-힣ㄱ-ㅎ]/g, ''); }
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function chosung(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i) - 0xac00; out += c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : s[i]; }
    return out;
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function r1(x) { return Math.round(x * 10) / 10; }
  var X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  /* ================= 로그인 (잠만보 카카오 로그인 세션을 같이 씀) ================= */
  function session() { var s = lsJSON(LS.auth); return s && s.token ? s : null; }
  function token() { var s = session(); return s ? s.token : ''; }
  function myNick() { var s = session(); return s && s.user && s.user.nickname ? s.user.nickname : ''; }
  function startLogin() {
    if (!CFG.kakaoRestKey) return toast('카카오 로그인 설정을 찾지 못했어요', true);
    var st; try { st = [].slice.call(crypto.getRandomValues(new Uint32Array(4))).join(''); } catch (e) { st = String(Math.random()).slice(2) + Date.now(); }
    lsSet(LS.state, JSON.stringify({ s: st, t: Date.now() }));
    try { sessionStorage.setItem('jmb_after_login', location.pathname + location.hash); } catch (e) {}   // 잠만보 시작 페이지가 로그인 뒤 여기로 돌려보냄
    location.href = 'https://kauth.kakao.com/oauth/authorize?client_id=' + encodeURIComponent(CFG.kakaoRestKey) +
      '&redirect_uri=' + encodeURIComponent(location.origin + ROOT) + '&response_type=code&state=' + encodeURIComponent(st);
  }
  function renderAcct() {
    var b = $('acct'), s = session(), nk = myNick();
    b.textContent = nk ? nk : s ? '닉네임 연결' : '로그인';
    b.className = 'acct' + (nk ? ' on' : '');
  }
  function onAcct() {
    var s = session();
    if (!s) return startLogin();
    if (!myNick()) { if (confirm('잠만보에서 카카오 계정에 모임 닉네임을 먼저 연결해 주세요. 잠만보로 갈까요?')) location.href = ROOT; return; }
    if (confirm(myNick() + ' 님으로 로그인돼 있어요.\n로그아웃할까요? (잠만보 앱도 함께 로그아웃돼요)')) { lsSet(LS.auth, null); renderAcct(); S.ver = ''; refresh(); }
  }
  function needLogin(what) {
    return '<div class="empty"><b>🔒 로그인이 필요해요</b>' + esc(what) + '은(는) 카카오로 로그인한 회원만 볼 수 있어요.<div class="btns" style="justify-content:center"><button type="button" class="btn pri" data-login>카카오 로그인</button></div></div>';
  }

  /* ================= 서버 ================= */
  function api(fn, args, ms) {
    if (!API) return Promise.reject(new Error('설정 파일(config.js)을 읽지 못했어요'));
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, ms || 25000) : 0;
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, cache: 'no-store', signal: ctl ? ctl.signal : undefined,
      body: JSON.stringify({ fn: fn, args: args || [], env: ENV !== 'prod' ? 'beta' : undefined }) })
      .then(function (r) {
        if (!r.ok) throw new Error('서버 응답 오류 (' + r.status + ')');
        return r.text().then(function (t) { try { return JSON.parse(t); } catch (x) { throw new Error('서버가 바빠요. 잠시 후 다시 시도해 주세요'); } });
      })
      .then(function (j) {
        clearTimeout(timer);
        if (!j || !j.ok) {
          var msg = (j && j.e) || '알 수 없는 오류';
          if (/허용되지 않은 요청/.test(msg)) msg = '서버에 방탈출 기능이 아직 없어요 (Escape.gs 배포 필요)';
          if (/로그인이 만료/.test(msg)) { lsSet(LS.auth, null); renderAcct(); }
          throw new Error(msg);
        }
        return j.r;
      }, function (e) {
        clearTimeout(timer);
        throw new Error(e && e.name === 'AbortError' ? '응답이 너무 늦어요. 잠시 후 다시 시도해 주세요' : e instanceof TypeError ? '인터넷 연결을 확인해 주세요' : (e && e.message) || '오류');
      });
  }

  /* ================= 데이터 ================= */
  function unpack(p, cols) {
    if (!p || !p.c || !p.r) return [];
    var idx = cols.map(function (c) { return p.c.indexOf(c); });
    return p.r.map(function (row) { var o = {}; cols.forEach(function (c, i) { o[c] = idx[i] >= 0 && row[idx[i]] != null ? row[idx[i]] : ''; }); return o; });
  }
  function setData(d) {
    S.themes = unpack(d.themes, TCOLS).map(function (t) {
      t.rate = n(t.rate); t.diff = n(t.diff); t.rev = n(t.rev); t.min = n(t.min);
      t.ppl = String(t.ppl || '').split(',').filter(Boolean);
      t.name = String(t.name); t.store = String(t.store);
      t._k = norm(t.name + ' ' + t.store + ' ' + t.sub + ' ' + t.area + ' ' + t.genre);
      t._c = chosung(norm(t.name + ' ' + t.store));
      return t;
    });
    S.byId = Object.create(null);
    S.themes.forEach(function (t) { S.byId[t.id] = t; });
    S.logs = unpack(d.logs, LCOLS).map(function (l) {
      ['left', 'hint', 'star', 'feel', 'fear'].forEach(function (k) { l[k] = n(l[k]); });
      l.with = String(l.with || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      return l;
    });
    S.wish = d.logs && d.logs.w ? d.logs.w : [];
    S.members = d.members || [];
    S.me = d.me || ''; S.admin = !!d.admin; S.ver = d.v || '';
    S.loaded = true;
    derive();
  }
  // 테마별 모임 기록 · 내 기록 · 가고 싶어요
  function derive() {
    S.stat = Object.create(null); S.mine = Object.create(null); S.wishBy = Object.create(null); S.myWish = Object.create(null);
    S.logs.forEach(function (l) {
      var s = S.stat[l.tid] || (S.stat[l.tid] = { n: 0, who: [], stars: [], ok: 0, known: 0 });
      s.n++; s.who.push(l.nick);
      if (l.star != null) s.stars.push(l.star);
      if (l.res) { s.known++; if (l.res === '성공') s.ok++; }
      if (l.nick === S.me) S.mine[l.tid] = l;
    });
    Object.keys(S.stat).forEach(function (k) { var s = S.stat[k]; s.avg = s.stars.length ? avg(s.stars) : null; });
    S.wish.forEach(function (w) { (S.wishBy[w[1]] || (S.wishBy[w[1]] = [])).push(w[0]); if (w[0] === S.me) S.myWish[w[1]] = true; });
  }
  function save(d) {
    try { localStorage.setItem(LS.data, JSON.stringify(d)); } catch (e) { lsSet(LS.data, null); }   // 저장 공간이 모자라면 다음에 다시 받음
  }
  var cached = lsJSON(LS.data);
  var refreshing = null;
  function refresh() {
    if (refreshing) return refreshing;
    var c = cached && cached.themes && (cached.me || '') === myNick() ? cached : null;
    refreshing = api('escData', [token(), c ? c.v : '']).then(function (r) {
      if (r.same && c) { S.me = r.me || ''; return; }
      var d = { v: r.v, me: r.me || '', admin: !!r.admin, themes: r.themes || (c && c.themes), logs: r.logs || null, members: r.members || [] };
      if (!d.themes) { cached = null; S.ver = ''; refreshing = null; return refresh(); }   // 버전이 엇갈림 — 처음부터
      cached = d; save(d); setData(d); render();
    }).catch(function (e) {
      if (!S.loaded) $('list').innerHTML = '<li class="empty"><b>목록을 불러오지 못했어요</b>' + esc(e.message) + '<div class="btns" style="justify-content:center"><button type="button" class="btn" data-retry>다시 시도</button></div></li>';
      else toast(e.message, true);
    }).then(function () { refreshing = null; });
    return refreshing;
  }

  /* ================= 찾기 ================= */
  function fits(t, people) {   // 그 인원에 추천되는 테마인지 (추천 인원 정보가 없으면 맞다고 봄)
    if (!t.ppl.length || !people) return true;
    return t.ppl.indexOf(people >= 5 ? '5+' : String(people)) >= 0;
  }
  function filtered() {
    var f = S.f, q = norm(S.q), cho = /^[ㄱ-ㅎ]+$/.test(q);
    return S.themes.filter(function (t) {
      if (q && t._k.indexOf(q) < 0 && !(cho && t._c.indexOf(q) >= 0)) return false;
      if (f.area && t.area !== f.area) return false;
      if (f.sub && t.sub !== f.sub) return false;
      if (f.ppl && t.ppl.length && t.ppl.indexOf(f.ppl) < 0) return false;
      if (f.diff && DIFFS[f.diff] && (t.diff == null || t.diff < DIFFS[f.diff][0] || t.diff > DIFFS[f.diff][1])) return false;
      if (f.genre && t.genre !== f.genre) return false;
      if (f.act && t.act !== f.act) return false;
      if (f.kind && t.kind !== f.kind) return false;
      if (f.time === 'short' && !(t.min != null && t.min <= 60)) return false;
      if (f.time === 'long' && !(t.min != null && t.min > 60)) return false;
      if (f.notMine && S.mine[t.id]) return false;
      if (f.club && !S.stat[t.id]) return false;
      return true;
    });
  }
  function sorted(list) {
    var by = S.sort, last = function (v) { return v == null ? -1e9 : v; };
    var cmp = {
      rate: function (a, b) { return last(b.rate) - last(a.rate) || last(b.rev) - last(a.rev); },
      rev: function (a, b) { return last(b.rev) - last(a.rev); },
      easy: function (a, b) { return (a.diff == null ? 99 : a.diff) - (b.diff == null ? 99 : b.diff) || last(b.rate) - last(a.rate); },
      hard: function (a, b) { return last(b.diff) - last(a.diff) || last(b.rate) - last(a.rate); },
      club: function (a, b) { var x = S.stat[a.id], y = S.stat[b.id]; return last(y && y.avg) - last(x && x.avg) || (y ? y.n : 0) - (x ? x.n : 0) || last(b.rate) - last(a.rate); },
      wish: function (a, b) { return (S.wishBy[b.id] || []).length - (S.wishBy[a.id] || []).length || last(b.rate) - last(a.rate); },
      name: function (a, b) { return a.name.localeCompare(b.name, 'ko'); }
    }[by] || function () { return 0; };
    return list.slice().sort(cmp);
  }
  function pplLabel(t) {
    if (!t.ppl.length) return '';
    var a = t.ppl[0], b = t.ppl[t.ppl.length - 1], end = b === '5+' ? '5인 이상' : b + '인';
    return a === b ? end : a + '~' + end;
  }
  function themeTags(t) {
    var s = S.stat[t.id], w = S.wishBy[t.id], mine = S.mine[t.id], h = [];
    if (mine) h.push('<span class="tag ' + (mine.res === '실패' ? 'fail' : 'me') + '">' + (mine.res === '실패' ? '✗ 실패' : mine.res === '성공' ? '✓ 탈출' : '✓ 해 봄') + '</span>');
    if (s) h.push('<span class="tag club">👥 ' + s.n + '명' + (s.avg != null ? ' · ★' + r1(s.avg) : '') + '</span>');
    if (w && w.length) h.push('<span class="tag wish">❤ ' + w.length + '</span>');
    if (t.diff != null) h.push('<span class="tag">난이도 ' + t.diff + '</span>');
    if (t.min) h.push('<span class="tag">' + t.min + '분</span>');
    if (t.ppl.length) h.push('<span class="tag">' + esc(pplLabel(t)) + '</span>');
    if (t.genre) h.push('<span class="tag">' + esc(t.genre) + '</span>');
    if (t.act) h.push('<span class="tag">활동 ' + esc(t.act) + '</span>');
    if (t.kind) h.push('<span class="tag">' + esc(t.kind) + '</span>');
    return h.join('');
  }
  function itemHTML(t, extra) {
    var s = S.stat[t.id];
    var rk = t.rate != null ? '<div class="rk"><b>' + t.rate.toFixed(1) + '</b><small>' + (t.rev ? '리뷰 ' + comma(t.rev) : '별점') + '</small></div>'
      : s && s.avg != null ? '<div class="rk"><b>★' + r1(s.avg) + '</b><small>모임</small></div>' : '<div class="rk none"><b>—</b><small>' + esc(t.src === '회원' ? '회원 추가' : t.src || '') + '</small></div>';
    return '<li><button type="button" class="item" data-t="' + esc(t.id) + '">' + rk + '<div class="bd"><div class="nm">' + esc(t.name) + '</div>' +
      '<div class="st">' + esc(t.store) + ' · ' + esc(t.sub || t.area) + '</div><div class="meta">' + themeTags(t) + '</div>' + (extra || '') + '</div></button></li>';
  }
  function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (String(cur || '') === String(v) ? ' selected' : '') + '>' + esc(label) + '</option>'; }
  function renderFilters() {
    var f = S.f, subs = {}, genres = {};
    S.themes.forEach(function (t) {
      if (!f.area || t.area === f.area) { if (t.sub) subs[t.sub] = (subs[t.sub] || 0) + 1; }
      if (t.genre) genres[t.genre] = (genres[t.genre] || 0) + 1;
    });
    var sel = function (k, first, opts) { return '<select class="sel' + (f[k] ? ' on' : '') + '" data-f="' + k + '" aria-label="' + esc(first) + '">' + opt('', first, f[k]) + opts + '</select>'; };
    var chk = function (k, label) { return '<label class="chk' + (f[k] ? ' on' : '') + '"><input type="checkbox" data-c="' + k + '"' + (f[k] ? ' checked' : '') + '>' + label + '</label>'; };
    var h = sel('area', '지역 전체', AREAS.map(function (a) { return opt(a, a, f.area); }).join('')) +
      sel('sub', '세부 지역', Object.keys(subs).sort(function (a, b) { return subs[b] - subs[a]; }).map(function (s) { return opt(s, s + ' (' + subs[s] + ')', f.sub); }).join('')) +
      sel('ppl', '인원', PPL.map(function (p) { return opt(p, p === '5+' ? '5인 이상 추천' : p + '인 추천', f.ppl); }).join('')) +
      sel('diff', '난이도', Object.keys(DIFFS).map(function (k) { return opt(k, DIFFS[k][2], f.diff); }).join('')) +
      sel('genre', '장르', Object.keys(genres).sort(function (a, b) { return genres[b] - genres[a]; }).map(function (g) { return opt(g, g, f.genre); }).join('')) +
      sel('time', '시간', opt('short', '60분 이하', f.time) + opt('long', '60분 넘게', f.time)) +
      sel('act', '활동성', ['적음', '보통', '많음'].map(function (a) { return opt(a, '활동 ' + a, f.act); }).join('')) +
      sel('kind', '유형', ['자물쇠', '장치', '복합'].map(function (a) { return opt(a, a, f.kind); }).join('')) +
      (S.me ? chk('notMine', '안 해 본 것만') + chk('club', '모임이 해 본 것') : '') +
      (Object.keys(f).some(function (k) { return f[k]; }) ? '<button type="button" class="reset" id="fReset">초기화</button>' : '');
    $('filters').innerHTML = h;
  }
  function renderFind() {
    if (!S.loaded) { $('list').innerHTML = '<li class="skel"></li><li class="skel"></li><li class="skel"></li>'; return; }
    renderFilters();
    $('sort').value = S.sort;
    var list = sorted(filtered());
    $('cnt').textContent = '테마 ' + comma(list.length) + '개';
    $('list').innerHTML = list.length ? list.slice(0, S.shown).map(function (t) { return itemHTML(t); }).join('')
      : '<li class="empty"><b>맞는 테마가 없어요</b>필터를 줄이거나, 없는 테마라면 직접 추가해 주세요' + (S.me ? '<div class="btns" style="justify-content:center"><button type="button" class="btn" data-addtheme>＋ 테마 추가</button></div>' : '') + '</li>';
    $('more').hidden = list.length <= S.shown;
    $('more').textContent = '더 보기 (' + comma(list.length - S.shown) + '개 남음)';
  }

  /* ================= 내 일지 ================= */
  function bars(map, total) {
    var keys = Object.keys(map).sort(function (a, b) { return map[b] - map[a]; }).slice(0, 5);
    var max = keys.length ? map[keys[0]] : 1;
    return '<div class="bars">' + keys.map(function (k) {
      return '<div class="brow"><span>' + esc(k) + '</span><span class="b"><i style="width:' + Math.round(map[k] / max * 100) + '%"></i></span><span>' + map[k] + '</span></div>';
    }).join('') + '</div>';
  }
  function logLine(l, showTheme) {
    var t = S.byId[l.tid] || { name: '(숨겨진 테마)', store: '' };
    var res = l.res === '성공' ? '<span class="tag me">✓ 탈출</span>' : l.res === '실패' ? '<span class="tag fail">✗ 실패</span>' : '';
    var bits = [l.left != null && l.res === '성공' ? l.left + '분 남김' : '', l.hint != null ? '힌트 ' + l.hint : '', l.star != null ? '★' + l.star : '', l.feel != null ? '체감 ' + l.feel : '', l.fear != null ? '공포 ' + l.fear : ''].filter(Boolean);
    return '<div class="row" data-t="' + esc(l.tid) + '"><div class="t"><b>' + (showTheme ? esc(t.name) + ' <small style="display:inline;color:var(--muted)">' + esc(t.store) + '</small>' : esc(l.nick)) + '</b>' +
      '<small>' + esc(l.date) + (bits.length ? ' · ' + esc(bits.join(' · ')) : '') + (l.note ? ' · 💬' : '') + '</small></div><div class="v">' + res + '</div></div>';
  }
  function renderLog() {
    var el = $('logBody');
    if (!S.me) { el.innerHTML = needLogin('내 방탈 일지'); return; }
    var mine = S.logs.filter(function (l) { return l.nick === S.me; }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    if (!mine.length) {
      el.innerHTML = '<div class="empty"><b>📔 아직 기록이 없어요</b>다녀온 방탈출을 기록하면 성공률 · 힌트 · 좋아하는 장르를 모아 보여 드려요.<div class="btns" style="justify-content:center"><button type="button" class="btn pri" data-newlog>＋ 첫 일지 쓰기</button></div></div>';
      return;
    }
    var known = mine.filter(function (l) { return l.res; }), ok = known.filter(function (l) { return l.res === '성공'; });
    var hints = mine.filter(function (l) { return l.hint != null; }).map(function (l) { return l.hint; });
    var lefts = ok.filter(function (l) { return l.left != null; }).map(function (l) { return l.left; });
    var stars = mine.filter(function (l) { return l.star != null; }).map(function (l) { return l.star; });
    var byArea = {}, byGenre = {}, byYear = {};
    mine.forEach(function (l) {
      var t = S.byId[l.tid]; if (!t) return;
      var a = t.sub || t.area; if (a) byArea[a] = (byArea[a] || 0) + 1;
      if (t.genre) byGenre[t.genre] = (byGenre[t.genre] || 0) + 1;
      byYear[l.date.slice(0, 4)] = (byYear[l.date.slice(0, 4)] || 0) + 1;
    });
    var friends = {};
    mine.forEach(function (l) { l.with.forEach(function (w) { friends[w] = (friends[w] || 0) + 1; }); });
    var stat = function (label, val, unit) { return '<div class="stat"><small>' + label + '</small><b>' + val + (unit ? '<i>' + unit + '</i>' : '') + '</b></div>'; };
    el.innerHTML = '<div class="card"><h3>📊 ' + esc(S.me) + ' 님의 방탈출</h3><div class="stats">' +
      stat('다녀온 방', mine.length, '방') +
      stat('탈출 성공률', known.length ? Math.round(ok.length / known.length * 100) : '—', known.length ? '%' : '') +
      stat('평균 힌트', hints.length ? r1(avg(hints)) : '—', hints.length ? '개' : '') +
      stat('평균 남긴 시간', lefts.length ? Math.round(avg(lefts)) : '—', lefts.length ? '분' : '') + '</div>' +
      (stars.length ? '<p class="hint">내가 준 별점 평균 ★' + r1(avg(stars)) + ' · 기록 ' + stars.length + '개</p>' : '') + '</div>' +
      '<div class="card"><h3>📍 많이 간 지역</h3>' + bars(byArea) + (Object.keys(byGenre).length ? '<h3 style="margin-top:14px">🎭 장르</h3>' + bars(byGenre) : '') +
      (Object.keys(friends).length ? '<h3 style="margin-top:14px">🤝 자주 같이 간 회원</h3>' + bars(friends) : '') + '</div>' +
      '<div class="card"><h3>📔 일지 <small>' + mine.length + '개</small><span class="sp"></span><button type="button" class="btn sm" data-newlog>＋ 쓰기</button></h3><div class="rows">' +
      mine.map(function (l) { return logLine(l, true); }).join('') + '</div></div>';
  }

  /* ================= 모임 ================= */
  function pickedPeople() {
    var set = S.pick && S.pick.length ? S.pick : S.me ? [S.me] : [];
    return set.filter(function (p) { return S.members.indexOf(p) >= 0; });
  }
  function recommend(people, area) {
    var who = {}; people.forEach(function (p) { who[p] = true; });
    var cnt = people.length;
    return S.themes.map(function (t) {
      if (area && t.area !== area) return null;
      var s = S.stat[t.id];
      if (s && s.who.some(function (p) { return who[p]; })) return null;   // 고른 사람 중 누가 이미 해 봄
      if (cnt && !fits(t, cnt)) return null;
      var base = t.rate != null ? t.rate : s && s.avg != null ? s.avg * 2 : null;
      if (base == null) return null;
      var wishers = (S.wishBy[t.id] || []).filter(function (p) { return who[p]; });
      var conf = t.rev != null ? Math.min(1, Math.log(t.rev + 1) / Math.log(300)) : 0.7;   // 리뷰가 적으면 별점을 덜 믿음
      var score = base * (0.6 + 0.4 * conf) * (t.ppl.length ? 1 : 0.92) * (1 + 0.12 * wishers.length);
      return { t: t, score: score, wishers: wishers };
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score; }).slice(0, 15);
  }
  function renderClub() {
    var el = $('clubBody');
    if (!S.me) { el.innerHTML = needLogin('모임 추천 · 랭킹'); return; }
    var people = pickedPeople(), rec = recommend(people, S.recArea);
    var memberChips = S.members.slice().sort(function (a, b) { return (people.indexOf(b) >= 0) - (people.indexOf(a) >= 0) || a.localeCompare(b, 'ko'); })
      .map(function (m) { return '<button type="button" class="pchip' + (people.indexOf(m) >= 0 ? ' on' : '') + '" data-p="' + esc(m) + '">' + esc(m) + '</button>'; }).join('');
    var h = '<div class="card"><h3>🎯 같이 갈 사람에게 맞춘 추천</h3>' +
      '<div class="people" id="people">' + memberChips + '</div>' +
      '<div class="ctl"><select class="sel" id="recArea" aria-label="지역">' + opt('', '지역 전체', S.recArea) + AREAS.map(function (a) { return opt(a, a, S.recArea); }).join('') + '</select>' +
      '<span class="hint" style="margin:0">' + people.length + '명 · 아무도 안 해 본 테마 중 ' + (people.length ? (people.length >= 5 ? '5인 이상' : people.length + '인') + ' 추천 테마' : '') + '</span>' +
      (S.pick && S.pick.length ? '<button type="button" class="reset" id="pickReset">나만</button>' : '') + '</div>' +
      '<ul class="list" style="margin-top:10px">' + (rec.length ? rec.map(function (r) {
        return itemHTML(r.t, r.wishers.length ? '<div class="hint" style="margin:4px 0 0">❤ ' + esc(r.wishers.join(', ')) + ' 님이 가고 싶어 해요</div>' : '');
      }).join('') : '<li class="empty">조건에 맞는 테마가 없어요. 지역이나 사람을 바꿔 보세요</li>') + '</ul></div>';

    // 탈출왕
    var per = {};
    S.logs.forEach(function (l) { var p = per[l.nick] || (per[l.nick] = { n: 0, ok: 0, known: 0 }); p.n++; if (l.res) { p.known++; if (l.res === '성공') p.ok++; } });
    var kings = Object.keys(per).sort(function (a, b) { return per[b].n - per[a].n || per[b].ok - per[a].ok; }).slice(0, 10);
    h += '<div class="card"><h3>👑 탈출왕 <small>일지 수</small></h3><div class="rows">' + (kings.length ? kings.map(function (k, i) {
      var p = per[k];
      return '<div class="row" style="cursor:default"><span class="n">' + (i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1) + '</span><div class="t"><b>' + esc(k) + '</b><small>' + (p.known ? '성공률 ' + Math.round(p.ok / p.known * 100) + '%' : '결과 기록 없음') + '</small></div><div class="v">' + p.n + '방</div></div>';
    }).join('') : '<p class="hint">아직 기록이 없어요</p>') + '</div></div>';

    // 모임이 많이 간 테마 · 모임 평점
    var played = Object.keys(S.stat).filter(function (k) { return S.byId[k]; });
    var most = played.slice().sort(function (a, b) { return S.stat[b].n - S.stat[a].n; }).slice(0, 8);
    var best = played.filter(function (k) { return S.stat[k].stars.length >= 2; }).sort(function (a, b) { return S.stat[b].avg - S.stat[a].avg; }).slice(0, 8);
    var trow = function (k, i, v) { var t = S.byId[k]; return '<div class="row" data-t="' + esc(k) + '"><span class="n">' + (i + 1) + '</span><div class="t"><b>' + esc(t.name) + '</b><small>' + esc(t.store) + '</small></div><div class="v">' + v + '</div></div>'; };
    if (most.length) h += '<div class="card"><h3>🔥 모임이 많이 간 테마</h3><div class="rows">' + most.map(function (k, i) { return trow(k, i, S.stat[k].n + '명'); }).join('') + '</div></div>';
    if (best.length) h += '<div class="card"><h3>⭐ 모임 평점 높은 테마 <small>별점 2개 이상</small></h3><div class="rows">' + best.map(function (k, i) { return trow(k, i, '★' + r1(S.stat[k].avg)); }).join('') + '</div></div>';

    // 최근 일지
    var recent = S.logs.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }).slice(0, 12);
    if (recent.length) h += '<div class="card"><h3>🕘 최근 모임 일지</h3><div class="rows">' + recent.map(function (l) {
      var t = S.byId[l.tid] || { name: '(숨겨진 테마)' };
      return '<div class="row" data-t="' + esc(l.tid) + '"><div class="t"><b>' + esc(l.nick) + ' · ' + esc(t.name) + '</b><small>' + esc(l.date) + (l.star != null ? ' · ★' + l.star : '') + (l.note ? ' · 💬 한줄평' : '') + '</small></div><div class="v">' +
        (l.res === '성공' ? '<span class="tag me">✓</span>' : l.res === '실패' ? '<span class="tag fail">✗</span>' : '') + '</div></div>';
    }).join('') + '</div></div>';
    h += '<p class="hint">🚪 탱쫄 유형은 잠만보 앱 → 내 기록 → 방탈출 탱쫄 에서 볼 수 있어요.</p>';
    el.innerHTML = h;
  }

  /* ================= 가고 싶어요 ================= */
  function renderWish() {
    var el = $('wishBody');
    if (!S.me) { el.innerHTML = needLogin('가고 싶어요'); return; }
    var mine = Object.keys(S.myWish).map(function (k) { return S.byId[k]; }).filter(Boolean);
    var pop = Object.keys(S.wishBy).filter(function (k) { return S.byId[k]; }).sort(function (a, b) { return S.wishBy[b].length - S.wishBy[a].length; }).slice(0, 20);
    var h = '<div class="card"><h3>❤️ 내가 가고 싶은 테마 <small>' + mine.length + '개</small></h3>' +
      (mine.length ? '<ul class="list">' + sorted(mine).map(function (t) { return itemHTML(t); }).join('') + '</ul>' : '<p class="hint">테마를 열고 ‘❤ 가고 싶어요’ 를 누르면 여기에 모여요. 같은 테마를 원하는 회원이 보이면 ‘같이 가요’ 로 모집 글을 바로 만들 수 있어요.</p>') + '</div>';
    h += '<div class="card"><h3>👥 모임에서 가고 싶어 하는 테마</h3>' + (pop.length ? '<ul class="list">' + pop.map(function (k) {
      return itemHTML(S.byId[k], '<div class="hint" style="margin:4px 0 0">❤ ' + esc(S.wishBy[k].join(', ')) + '</div>');
    }).join('') + '</ul>' : '<p class="hint">아직 없어요</p>') + '</div>';
    el.innerHTML = h;
  }

  /* ================= 창 ================= */
  var lastFocus = null;
  function openModal(html, onClose) {
    lastFocus = document.activeElement;
    $('modal').innerHTML = '<div class="mbg" id="mbg"><div class="sheet" role="dialog" aria-modal="true">' + html + '</div></div>';
    $('modal')._close = onClose || null;
    var bg = $('mbg');
    bg.addEventListener('click', function (e) { if (e.target === bg || e.target.closest('[data-x]')) closeModal(); });
    var f = bg.querySelector('[autofocus]') || bg.querySelector('.x'); if (f) f.focus();
    return bg.querySelector('.sheet');
  }
  function closeModal() {
    var m = $('modal'); if (!m.innerHTML) return;
    m.innerHTML = '';
    if (/^#\/t\//.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
  }
  function shareUrl(t) { return location.origin + location.pathname + '#/t/' + encodeURIComponent(t.id); }

  function openTheme(id) {
    var t = S.byId[id];
    if (!t) { if (S.loaded) toast('테마를 찾을 수 없어요', true); return; }
    if (location.hash !== '#/t/' + id) history.replaceState(null, '', '#/t/' + encodeURIComponent(id));
    var s = S.stat[id], mine = S.mine[id], wished = !!S.myWish[id], wishers = S.wishBy[id] || [];
    var logs = S.logs.filter(function (l) { return l.tid === id; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var cell = function (label, v) { return v === '' || v == null ? '' : '<div><small>' + label + '</small><b>' + esc(v) + '</b></div>'; };   // 모르는 칸은 안 보임
    var canEdit = S.me && (t.by === S.me || S.admin);
    var h = '<h2><span>' + esc(t.name) + '</span><button type="button" class="x" data-x aria-label="닫기">' + X + '</button></h2>' +
      '<div class="sub">' + esc(t.store) + ' · ' + esc([t.area, t.sub].filter(Boolean).join(' ')) + '</div>' +
      '<div class="info">' +
        cell('별점 (10점)', t.rate != null ? t.rate.toFixed(2) + (t.rev ? ' · ' + comma(t.rev) : '') : '') +
        cell('모임 평점', s && s.avg != null ? '★' + r1(s.avg) + ' · ' + s.stars.length + '명' : '') +
        cell('난이도', t.diff != null ? t.diff + ' / 10' : '') +
        cell('추천 인원', pplLabel(t)) + cell('시간', t.min ? t.min + '분' : '') + cell('장르', t.genre) +
        cell('활동성', t.act) + cell('유형', t.kind) + cell('가격', t.price) +
      '</div>' +
      (t.memo ? '<div class="memo">' + esc(t.memo) + '</div>' : '') +
      '<div class="btns">' +
        (S.me ? '<button type="button" class="btn pri" id="dLog">' + (mine ? '📔 내 일지 고치기' : '📔 일지 쓰기') + '</button>' +
          '<button type="button" class="btn wish' + (wished ? ' on' : '') + '" id="dWish">' + (wished ? '❤ 가고 싶어요' : '♡ 가고 싶어요') + '</button>' : '<button type="button" class="btn pri" data-login>로그인하고 기록하기</button>') +
        '<button type="button" class="btn" id="dTogether">🙋 같이 가요</button>' +
        (t.link ? '<a class="btn" href="' + esc(t.link) + '" target="_blank" rel="noopener">📅 예약</a>' : '') +
        '<a class="btn" href="https://search.naver.com/search.naver?query=' + encodeURIComponent(t.store + ' ' + t.name + ' 방탈출') + '" target="_blank" rel="noopener">🔎 네이버</a>' +
        '<a class="btn" href="https://map.kakao.com/?q=' + encodeURIComponent(t.store) + '" target="_blank" rel="noopener">📍 지도</a>' +
      '</div>';
    if (wishers.length) h += '<div class="sec"><h4>❤ 가고 싶어요 <small>' + wishers.length + '명</small></h4><div class="hint" style="margin:0">' + esc(wishers.join(', ')) + '</div></div>';
    if (S.me) {
      h += '<div class="sec"><h4>👥 모임 기록 <small>' + logs.length + '명' + (s && s.known ? ' · 성공 ' + s.ok + '/' + s.known : '') + '</small></h4>' + (logs.length ? logs.map(function (l) {
        var bits = [l.left != null && l.res === '성공' ? l.left + '분 남김' : '', l.hint != null ? '힌트 ' + l.hint : '', l.feel != null ? '체감 난이도 ' + l.feel : '', l.fear != null ? '공포 ' + l.fear : ''].filter(Boolean);
        return '<div class="lg"><div class="h"><b>' + esc(l.nick) + '</b>' + (l.res === '성공' ? '<span class="tag me">✓ 탈출</span>' : l.res === '실패' ? '<span class="tag fail">✗ 실패</span>' : '') +
          (l.star != null ? '<span class="tag gold">★' + l.star + '</span>' : '') + '<span class="d">' + esc(l.date) + '</span></div>' +
          (bits.length ? '<div class="hint" style="margin:2px 0 0">' + esc(bits.join(' · ')) + '</div>' : '') +
          (l.note ? '<div class="spoil' + (l.nick === S.me ? '' : ' hide') + '" data-spoil title="눌러서 보기 (스포일러 주의)">💬 ' + esc(l.note) + '</div>' : '') + '</div>';
      }).join('') + '<p class="hint">한줄평은 스포일러가 있을 수 있어 흐리게 보여요 — 눌러서 보기</p>' : '<p class="hint" style="margin:0">아직 우리 모임에서 간 사람이 없어요</p>') + '</div>';
    }
    h += '<p class="src" style="margin-top:14px">' + (t.src === '2022-04 엑셀' ? '별점·리뷰 수·난이도: roomescape.co.kr (2022년 4월 기준)' : '출처: ' + esc(t.src || '') + (t.by ? ' · 등록 ' + esc(t.by) : '')) +
      (canEdit ? ' · <a href="#" id="dEdit">고치기</a> · <a href="#" id="dHide">숨기기</a>' : '') + '</p>';
    var sh = openModal(h);
    var g = function (q) { return sh.querySelector(q); };
    if (g('#dLog')) g('#dLog').onclick = function () { openLogForm(t, mine); };
    if (g('#dWish')) g('#dWish').onclick = function () { toggleWish(t, this); };
    g('#dTogether').onclick = function () { together(t); };
    if (g('#dEdit')) g('#dEdit').onclick = function (e) { e.preventDefault(); openThemeForm(t); };
    if (g('#dHide')) g('#dHide').onclick = function (e) {
      e.preventDefault();
      if (!confirm('‘' + t.name + '’ 테마를 숨길까요? (문 닫은 곳 · 잘못 넣은 것)\n일지는 그대로 남아요.')) return;
      api('escHideTheme', [t.id, token()]).then(function () { toast('숨겼어요'); closeModal(); S.ver = ''; cached = null; refresh(); }, function (er) { toast(er.message, true); });
    };
  }

  function toggleWish(t, btn) {
    var on = !S.myWish[t.id];
    btn.disabled = true;
    api('escWish', [t.id, on, token()]).then(function () {
      if (on) S.wish.push([S.me, t.id]); else S.wish = S.wish.filter(function (w) { return !(w[0] === S.me && w[1] === t.id); });
      if (cached && cached.logs) { cached.logs.w = S.wish; cached.v = ''; save(cached); }   // 다음엔 서버에서 새로
      derive(); render(); openTheme(t.id);
      toast(on ? '❤ 가고 싶어요에 담았어요' : '뺐어요');
    }, function (e) { btn.disabled = false; toast(e.message, true); });
  }

  // 같이 가요: 모집 글을 만들어 공유/복사 (카톡 단톡방에 붙여 넣기)
  function together(t) {
    var w = (S.wishBy[t.id] || []).filter(function (p) { return p !== S.me; });
    var played = S.stat[t.id] ? S.stat[t.id].who : [];
    var lines = ['🚪 방탈출 같이 가요!', '[' + t.store + '] ' + t.name + ' (' + [t.area, t.sub].filter(Boolean).join(' ') + ')',
      [t.diff != null ? '난이도 ' + t.diff : '', pplLabel(t) ? '추천 ' + pplLabel(t) : '', t.min ? t.min + '분' : '', t.genre].filter(Boolean).join(' · '),
      w.length ? '❤ 가고 싶어요: ' + w.join(', ') : '', played.length ? '(이미 해 본 사람: ' + played.join(', ') + ')' : '', '👉 ' + shareUrl(t)].filter(Boolean);
    var text = lines.join('\n');
    var sh = openModal('<h2><span>🙋 같이 가요</span><button type="button" class="x" data-x aria-label="닫기">' + X + '</button></h2>' +
      '<p class="hint">단톡방에 붙여 넣을 모집 글이에요. 고쳐서 써도 돼요.</p>' +
      '<div class="fld"><textarea id="tgTx" rows="7">' + esc(text) + '</textarea></div>' +
      '<div class="btns">' + (navigator.share ? '<button type="button" class="btn pri" id="tgShare">공유하기</button>' : '') + '<button type="button" class="btn' + (navigator.share ? '' : ' pri') + '" id="tgCopy">복사</button></div>');
    var tx = function () { return sh.querySelector('#tgTx').value; };
    sh.querySelector('#tgCopy').onclick = function () { copy(tx()); };
    if (sh.querySelector('#tgShare')) sh.querySelector('#tgShare').onclick = function () { navigator.share({ text: tx() }).catch(function () {}); };
  }
  function copy(text) {
    var done = function () { toast('복사했어요 — 단톡방에 붙여 넣어 주세요'); };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(done, fallback);
    fallback();
    function fallback() { var a = document.createElement('textarea'); a.value = text; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('복사하지 못했어요', true); } a.remove(); }
  }

  /* ---------- 일지 쓰기 ---------- */
  function themePicker(cb) {
    var sh = openModal('<h2><span>📔 어떤 테마였나요?</span><button type="button" class="x" data-x aria-label="닫기">' + X + '</button></h2>' +
      '<div class="fld" style="margin-top:12px"><input id="pkQ" type="search" placeholder="테마 · 매장 (초성 가능)" autocomplete="off" autofocus></div><div class="pick" id="pkList"></div>' +
      '<p class="hint">찾는 테마가 없으면 <a href="#" id="pkAdd">＋ 테마 추가</a></p>');
    var draw = function () {
      var q = norm(sh.querySelector('#pkQ').value), cho = /^[ㄱ-ㅎ]+$/.test(q);
      var list = q ? S.themes.filter(function (t) { return t._k.indexOf(q) >= 0 || (cho && t._c.indexOf(q) >= 0); }) : S.themes.filter(function (t) { return S.stat[t.id]; });
      list = sorted(list).slice(0, 40);
      sh.querySelector('#pkList').innerHTML = list.length ? list.map(function (t) {
        return '<button type="button" data-pk="' + esc(t.id) + '"><b>' + esc(t.name) + '</b> <small>' + esc(t.store) + ' · ' + esc(t.sub || t.area) + (S.mine[t.id] ? ' · ✓ 기록함' : '') + '</small></button>';
      }).join('') : '<p class="hint" style="padding:8px 12px;margin:0">' + (q ? '검색 결과가 없어요' : '테마 이름을 입력해 주세요') + '</p>';
    };
    sh.querySelector('#pkQ').oninput = draw; draw();
    sh.querySelector('#pkList').onclick = function (e) { var b = e.target.closest('[data-pk]'); if (b) cb(S.byId[b.getAttribute('data-pk')]); };
    sh.querySelector('#pkAdd').onclick = function (e) { e.preventDefault(); openThemeForm(null, function (t) { cb(t); }); };
  }
  function openLogForm(t, cur) {
    cur = cur || S.mine[t.id] || null;
    var v = cur ? { date: cur.date, res: cur.res, left: cur.left, hint: cur.hint, star: cur.star, feel: cur.feel, fear: cur.fear, note: cur.note, with: cur.with.slice() }
      : { date: today(), res: '', left: null, hint: null, star: null, feel: null, fear: null, note: '', with: [] };
    var num = function (id, label, val, min, max, ph) { return '<label class="fld"><span>' + label + '</span><input id="' + id + '" type="number" inputmode="numeric" min="' + min + '" max="' + max + '" value="' + (val == null ? '' : val) + '" placeholder="' + ph + '"></label>'; };
    var sel = function (id, label, val, from, to, ph) { var o = '<option value="">' + ph + '</option>'; for (var i = from; i <= to; i++) o += '<option' + (val === i ? ' selected' : '') + '>' + i + '</option>'; return '<label class="fld"><span>' + label + '</span><select id="' + id + '">' + o + '</select></label>'; };
    var sh = openModal('<h2><span>📔 ' + esc(t.name) + '</span><button type="button" class="x" data-x aria-label="닫기">' + X + '</button></h2><div class="sub">' + esc(t.store) + '</div>' +
      '<div class="form">' +
        '<div class="two"><label class="fld"><span>날짜</span><input id="lfDate" type="date" max="' + today() + '" value="' + esc(v.date) + '"></label>' +
        '<div class="fld"><span>결과</span><div class="seg" id="lfRes">' + ['성공', '실패', ''].map(function (r) { return '<button type="button" data-v="' + r + '" class="' + (v.res === r ? 'on' : '') + '">' + (r || '모름') + '</button>'; }).join('') + '</div></div></div>' +
        '<div class="two">' + num('lfLeft', '남긴 시간 <small>(분, 성공했을 때)</small>', v.left, 0, 180, '예: 12') + num('lfHint', '힌트 수', v.hint, 0, 30, '예: 2') + '</div>' +
        '<div class="fld"><span>내 별점</span><div class="stars" id="lfStar"></div></div>' +
        '<div class="two">' + sel('lfFeel', '체감 난이도', v.feel, 1, 10, '—') + sel('lfFear', '공포도 <small>(0 = 안 무서움)</small>', v.fear, 0, 5, '—') + '</div>' +
        '<label class="fld"><span>한줄평 <small>(스포일러는 피해 주세요 · 다른 회원에게는 흐리게 보여요)</small></span><textarea id="lfNote" maxlength="300" placeholder="예: 인테리어 최고, 마지막 장치가 압권">' + esc(v.note || '') + '</textarea></label>' +
        (cur ? '' : '<div class="fld"><span>함께한 회원 <small>(고르면 그 회원 일지에도 같은 날 기록이 생겨요 · 별점·한줄평은 각자)</small></span><input id="lfWithQ" type="search" placeholder="닉네임 찾기" autocomplete="off"><div class="people" id="lfWith" style="margin-top:6px"></div></div>') +
        '<div class="err" id="lfErr"></div>' +
        '<div class="btns" style="margin-top:0">' + (cur ? '<button type="button" class="btn bad" id="lfDel">지우기</button>' : '') + '<button type="button" class="btn pri" id="lfSave" style="flex:2">' + (cur ? '고치기' : '저장') + '</button></div>' +
      '</div>');
    var g = function (q) { return sh.querySelector(q); };
    var star = v.star;
    var drawStars = function () {
      var h = '';
      for (var i = 1; i <= 5; i++) h += '<button type="button" data-s="' + i + '" class="' + (star >= i ? 'on' : star >= i - 0.5 ? 'half' : '') + '" aria-label="' + i + '점">★</button>';
      g('#lfStar').innerHTML = h + '<span class="lbl">' + (star ? star + '점' : '누르면 별점 · 한 번 더 누르면 반 개') + '</span>';
    };
    drawStars();
    g('#lfStar').onclick = function (e) {
      var b = e.target.closest('[data-s]'); if (!b) return;
      var i = +b.getAttribute('data-s');
      star = star === i ? i - 0.5 : star === i - 0.5 ? null : i;
      if (star === 0) star = null;
      drawStars();
    };
    var res = v.res;
    g('#lfRes').onclick = function (e) { var b = e.target.closest('[data-v]'); if (!b) return; res = b.getAttribute('data-v'); [].forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); }); };
    var withSel = v.with.slice();
    var drawWith = function () {
      if (!g('#lfWith')) return;
      var q = norm(g('#lfWithQ').value);
      var list = S.members.filter(function (m) { return m !== S.me && (!q || norm(m).indexOf(q) >= 0 || chosung(norm(m)).indexOf(q) >= 0 || withSel.indexOf(m) >= 0); })
        .sort(function (a, b) { return (withSel.indexOf(b) >= 0) - (withSel.indexOf(a) >= 0) || a.localeCompare(b, 'ko'); });
      g('#lfWith').innerHTML = list.map(function (m) {
        var done = S.stat[t.id] && S.stat[t.id].who.indexOf(m) >= 0;
        return '<button type="button" class="pchip' + (withSel.indexOf(m) >= 0 ? ' on' : '') + '" data-p="' + esc(m) + '"' + (done ? ' title="이미 기록이 있어 새로 만들지 않아요"' : '') + '>' + esc(m) + (done ? ' ✓' : '') + '</button>';
      }).join('');
    };
    if (g('#lfWith')) {
      drawWith();
      g('#lfWithQ').oninput = drawWith;
      g('#lfWith').onclick = function (e) {
        var b = e.target.closest('[data-p]'); if (!b) return;
        var m = b.getAttribute('data-p'), i = withSel.indexOf(m);
        if (i >= 0) withSel.splice(i, 1); else if (withSel.length < 10) withSel.push(m); else return toast('함께한 회원은 10명까지예요', true);
        drawWith();
      };
    }
    g('#lfSave').onclick = function () {
      var val = function (id) { var x = g(id).value.trim(); return x === '' ? '' : Number(x); };
      var body = { id: cur ? cur.id : '', tid: t.id, date: g('#lfDate').value, res: res, left: val('#lfLeft'), hint: val('#lfHint'), star: star || '',
        feel: val('#lfFeel'), fear: val('#lfFear'), note: g('#lfNote').value.trim(), with: cur ? cur.with : withSel };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date) || body.date > today()) { g('#lfErr').textContent = '날짜를 확인해 주세요 (오늘까지)'; return; }
      if (body.left !== '' && (body.left < 0 || body.left > 180)) { g('#lfErr').textContent = '남긴 시간은 0~180분이에요'; return; }
      if (body.hint !== '' && (body.hint < 0 || body.hint > 30)) { g('#lfErr').textContent = '힌트 수는 0~30개예요'; return; }
      var b = this; b.disabled = true; b.textContent = '저장 중…'; g('#lfErr').textContent = '';
      api('escSaveLog', [body, token()]).then(function (r) {
        toast(cur ? '고쳤어요' : '기록했어요' + (r && r.added && r.added.length ? ' · ' + r.added.join(', ') + ' 님 일지에도 남겼어요' : ''));
        closeModal(); reloadAfterWrite(t.id);
      }, function (e) { b.disabled = false; b.textContent = cur ? '고치기' : '저장'; g('#lfErr').textContent = e.message; });
    };
    if (g('#lfDel')) g('#lfDel').onclick = function () {
      if (!confirm('이 일지를 지울까요?')) return;
      api('escDeleteLog', [cur.id, token()]).then(function () { toast('지웠어요'); closeModal(); reloadAfterWrite(t.id); }, function (e) { toast(e.message, true); });
    };
  }
  function reloadAfterWrite(openId) {
    if (cached) { cached.v = (cached.v || '').split('.')[0] + '.x'; save(cached); }   // 테마는 그대로, 일지만 새로
    refresh().then(function () { if (openId && S.byId[openId]) openTheme(openId); });
  }

  /* ---------- 테마 추가·수정 ---------- */
  function openThemeForm(t, after) {
    var v = t || { area: S.f.area || '', sub: S.f.sub || '', store: '', name: '', diff: null, ppl: [], min: null, genre: '', act: '', kind: '', price: '', link: '', memo: '' };
    var subs = {}; S.themes.forEach(function (x) { if (x.sub) subs[x.sub] = 1; });
    var genres = {}; S.themes.forEach(function (x) { if (x.genre) genres[x.genre] = 1; });
    var sh = openModal('<h2><span>' + (t ? '테마 고치기' : '＋ 테마 추가') + '</span><button type="button" class="x" data-x aria-label="닫기">' + X + '</button></h2>' +
      (t ? '' : '<p class="hint">목록은 2022년 4월 기준이라 새로 생긴 곳은 없을 수 있어요. 우리가 간 곳을 추가해 주세요.</p>') +
      '<div class="form">' +
        '<div class="two"><label class="fld"><span>매장 *</span><input id="tfStore" maxlength="40" value="' + esc(v.store) + '" placeholder="예: 나비잠 1호점 (범계)" autofocus></label>' +
        '<label class="fld"><span>테마 *</span><input id="tfName" maxlength="60" value="' + esc(v.name) + '"></label></div>' +
        '<div class="two"><label class="fld"><span>지역 *</span><select id="tfArea">' + opt('', '고르기', v.area) + AREAS.map(function (a) { return opt(a, a, v.area); }).join('') + '</select></label>' +
        '<label class="fld"><span>세부 지역</span><input id="tfSub" list="tfSubs" maxlength="20" value="' + esc(v.sub) + '" placeholder="예: 안양"><datalist id="tfSubs">' + Object.keys(subs).map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist></label></div>' +
        '<div class="fld"><span>추천 인원</span><div class="people" id="tfPpl">' + PPL.map(function (p) { return '<button type="button" class="pchip' + (v.ppl.indexOf(p) >= 0 ? ' on' : '') + '" data-p="' + p + '">' + (p === '5+' ? '5인 이상' : p + '인') + '</button>'; }).join('') + '</div></div>' +
        '<div class="three"><label class="fld"><span>난이도 <small>1~10</small></span><input id="tfDiff" type="number" inputmode="numeric" min="1" max="10" value="' + (v.diff == null ? '' : v.diff) + '"></label>' +
        '<label class="fld"><span>시간 <small>분</small></span><input id="tfMin" type="number" inputmode="numeric" min="10" max="300" value="' + (v.min == null ? '' : v.min) + '"></label>' +
        '<label class="fld"><span>장르</span><input id="tfGenre" list="tfGenres" maxlength="10" value="' + esc(v.genre) + '"><datalist id="tfGenres">' + Object.keys(genres).map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist></label></div>' +
        '<div class="three"><label class="fld"><span>활동성</span><select id="tfAct">' + opt('', '—', v.act) + ['적음', '보통', '많음'].map(function (a) { return opt(a, a, v.act); }).join('') + '</select></label>' +
        '<label class="fld"><span>유형</span><select id="tfKind">' + opt('', '—', v.kind) + ['자물쇠', '장치', '복합'].map(function (a) { return opt(a, a, v.kind); }).join('') + '</select></label>' +
        '<label class="fld"><span>가격</span><input id="tfPrice" maxlength="30" value="' + esc(v.price) + '" placeholder="예: 2인 44,000"></label></div>' +
        '<label class="fld"><span>예약 링크 <small>https://</small></span><input id="tfLink" type="url" maxlength="300" value="' + esc(v.link) + '" placeholder="매장 예약 페이지"></label>' +
        '<label class="fld"><span>메모</span><textarea id="tfMemo" maxlength="300" placeholder="주차 · 찾아가는 길 · 주의할 점 (스포일러 없이)">' + esc(v.memo) + '</textarea></label>' +
        '<div class="err" id="tfErr"></div><button type="button" class="btn pri" id="tfSave">' + (t ? '고치기' : '추가') + '</button>' +
      '</div>');
    var g = function (q) { return sh.querySelector(q); };
    var ppl = v.ppl.slice();
    g('#tfPpl').onclick = function (e) { var b = e.target.closest('[data-p]'); if (!b) return; var p = b.getAttribute('data-p'), i = ppl.indexOf(p); if (i >= 0) ppl.splice(i, 1); else ppl.push(p); b.classList.toggle('on', i < 0); };
    g('#tfSave').onclick = function () {
      var num = function (id) { var x = g(id).value.trim(); return x === '' ? '' : Number(x); };
      var body = { id: t ? t.id : '', store: g('#tfStore').value.trim(), name: g('#tfName').value.trim(), area: g('#tfArea').value, sub: g('#tfSub').value.trim(),
        ppl: ppl, diff: num('#tfDiff'), min: num('#tfMin'), genre: g('#tfGenre').value.trim(), act: g('#tfAct').value, kind: g('#tfKind').value,
        price: g('#tfPrice').value.trim(), link: g('#tfLink').value.trim(), memo: g('#tfMemo').value.trim() };
      if (!body.store || !body.name || !body.area) { g('#tfErr').textContent = '매장 · 테마 · 지역은 꼭 넣어 주세요'; return; }
      if (body.link && !/^https:\/\//.test(body.link)) { g('#tfErr').textContent = '예약 링크는 https:// 로 시작해야 해요'; return; }
      if (!t) {
        var same = S.themes.filter(function (x) { return norm(x.store) === norm(body.store) && norm(x.name) === norm(body.name); })[0];
        if (same) { g('#tfErr').textContent = '이미 있는 테마예요 — 목록에서 찾아 주세요'; return; }
      }
      var b = this; b.disabled = true; b.textContent = '저장 중…';
      api('escSaveTheme', [body, token()]).then(function (r) {
        toast(t ? '고쳤어요' : '추가했어요');
        var id = r && r.theme ? r.theme[0] : t && t.id;
        closeModal(); cached = null; S.ver = '';
        refresh().then(function () { var nt = S.byId[id]; if (after && nt) after(nt); else if (nt) openTheme(id); });
      }, function (e) { b.disabled = false; b.textContent = t ? '고치기' : '추가'; g('#tfErr').textContent = e.message; });
    };
  }

  /* ================= 화면 ================= */
  function setTab(t) {
    if (['find', 'log', 'club', 'wish'].indexOf(t) < 0) t = 'find';
    S.tab = t; lsSet(LS.tab, t);
    [].forEach.call(document.querySelectorAll('#tabs [data-t]'), function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-t') === t)); });
    [].forEach.call(document.querySelectorAll('.panel'), function (p) { p.classList.toggle('on', p.getAttribute('data-p') === t); });
    render();
  }
  function render() {
    renderAcct();
    var fab = $('fab');
    fab.hidden = !(S.loaded && S.me);
    $('fabTx').textContent = '일지 쓰기';
    if (S.tab === 'find') renderFind();
    else if (S.tab === 'log') renderLog();
    else if (S.tab === 'club') renderClub();
    else renderWish();
  }
  function openFromHash() {
    var m = /^#\/t\/(.+)$/.exec(location.hash);
    if (m && S.loaded) openTheme(decodeURIComponent(m[1]));
  }

  /* ================= 이벤트 ================= */
  $('acct').onclick = onAcct;
  $('tabs').onclick = function (e) { var b = e.target.closest('[data-t]'); if (b) { setTab(b.getAttribute('data-t')); window.scrollTo(0, 0); } };
  var qT = 0;
  $('q').oninput = function () { var v = this.value; clearTimeout(qT); qT = setTimeout(function () { S.q = v; S.shown = PAGE; renderFind(); }, 120); };
  $('sort').onchange = function () { S.sort = this.value; lsSet(LS.sort, S.sort); S.shown = PAGE; renderFind(); };
  $('filters').onchange = function (e) {
    var s = e.target.closest('[data-f]'), c = e.target.closest('[data-c]');
    if (s) { var k = s.getAttribute('data-f'); S.f[k] = s.value; if (k === 'area') S.f.sub = ''; }
    if (c) S.f[c.getAttribute('data-c')] = c.checked;
    lsSet(LS.f, JSON.stringify(S.f)); S.shown = PAGE; renderFind();
  };
  $('filters').onclick = function (e) { if (e.target.id === 'fReset') { S.f = {}; lsSet(LS.f, null); S.shown = PAGE; renderFind(); } };
  $('more').onclick = function () { S.shown += PAGE; renderFind(); };
  $('fab').onclick = function () { themePicker(function (t) { openLogForm(t); }); };
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-t]');
    if (t && !t.closest('#tabs')) { openTheme(t.getAttribute('data-t')); return; }
    if (e.target.closest('[data-login]')) { startLogin(); return; }
    if (e.target.closest('[data-retry]')) { refresh(); return; }
    if (e.target.closest('[data-newlog]')) { themePicker(function (th) { openLogForm(th); }); return; }
    if (e.target.closest('[data-addtheme]')) { openThemeForm(null); return; }
    var sp = e.target.closest('[data-spoil]'); if (sp) { sp.classList.remove('hide'); return; }
    var p = e.target.closest('#people [data-p]');
    if (p) {
      var cur = pickedPeople(), m = p.getAttribute('data-p'), i = cur.indexOf(m);
      if (i >= 0) cur.splice(i, 1); else cur.push(m);
      S.pick = cur; lsSet(LS.with, JSON.stringify(cur)); renderClub();
      return;
    }
    if (e.target.id === 'pickReset') { S.pick = null; lsSet(LS.with, null); renderClub(); }
  });
  document.addEventListener('change', function (e) { if (e.target.id === 'recArea') { S.recArea = e.target.value; renderClub(); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  window.addEventListener('hashchange', openFromHash);
  window.addEventListener('pageshow', function (e) { if (e.persisted) refresh(); });

  /* ================= 시작 ================= */
  if (/[?&]reset\b/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash);
  if (cached && cached.themes && (cached.me || '') === myNick()) { setData(cached); }
  setTab(S.tab);
  openFromHash();
  refresh().then(openFromHash);
  window.JMB_ESC = { VER: VER };
})();
