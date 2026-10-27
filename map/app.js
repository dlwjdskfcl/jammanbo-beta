/*! 잠만보 장소 지도 — 화면 v2.3.0
 * 서버: 잠만보 메인 Apps Script (Map.gs — mapList · mapSearch · mapSave · mapHide)
 * 지도: MapLibre GL (그리는 엔진) + OpenFreeMap (지도 그림, 키 없음), 안 되면 VersaTiles — 아래 STYLES 만 바꾸면 다른 지도로
 * 해외 검색: Photon (오타·부분 이름에 강함), 안 되면 Nominatim — 둘 다 키 없음. 국내는 카카오(서버)
 * 주소: #/p/<장소ID> = 그 장소 열기 (카톡에 공유하면 바로 그 장소)
 *
 * 빠르게 여는 방법
 *  1) 기기에 저장해 둔 장소 목록을 바로 그림 → 서버에는 버전만 물어봄 (같으면 작은 응답)
 *  2) 지도 라이브러리는 목록을 그린 뒤 받음 (목록은 지도 없이도 씀)
 *  3) 모임 횟수는 잠만보 앱이 기기에 저장해 둔 데이터(jmb_data_v2)로 셈 — 서버 요청 없음
 */
(function () {
  'use strict';
  var VER = '2.3.0';
  var C = window.MAPCORE;
  var CFG = window.JMB_CONFIG || {};
  var ENV = CFG.env || 'prod';
  var ENV_SFX = ENV !== 'prod' ? '_' + ENV : '';
  var API = window.MAP_API_LOCAL || CFG.api || '';
  var ROOT = (function () { var seg = location.pathname.split('/')[1] || ''; return /\.github\.io$/.test(location.hostname) && seg ? '/' + seg + '/' : '/'; })();
  var LS = { auth: 'jmb_kakao_v2' + ENV_SFX, state: 'jmb_kakao_state' + ENV_SFX, places: 'jmb_map_v1' + ENV_SFX, view: 'jmb_map_view', sort: 'jmb_map_sort', data: 'jmb_data_v2' };
  var MAPLIBRE = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js';
  // 받은 파일이 이 값과 다르면(CDN 이 바뀌거나 변조) 브라우저가 실행하지 않음 — 버전을 바꾸면 index.html 의 CSS 값과 같이 새로 계산
  var MAPLIBRE_SRI = 'sha384-SYKAG6cglRMN0RVvhNeBY0r3FYKNOJtznwA0v7B5Vp9tr31xAHsZC0DqkQ/pZDmj';
  // 지도 그림 서버 — 첫째가 응답 없으면 다음 것으로 (둘 다 키 없음 · 무료 · 보장 없음). font = 그 서버에 있는 글꼴 이름
  var STYLES = [
    { name: 'OpenFreeMap', url: function (k) { return 'https://tiles.openfreemap.org/styles/' + k.ofm; }, font: ['Noto Sans Regular', 'Noto Sans Bold'] },
    { name: 'VersaTiles', url: function (k) { return 'https://tiles.versatiles.org/assets/styles/' + k.vt + '/style.json'; }, font: ['noto_sans_regular', 'noto_sans_bold'] }
  ];
  var styleNo = 0, STYLE = STYLES[0];
  // 지도 모양 (🎨 버튼). ofm/vt = 서버별 스타일 이름, sw = 고르는 창의 미리보기 색(땅 · 물 · 길)
  var LOOKS = [
    { id: 'auto', name: '자동', desc: '기기 설정 따라' },
    { id: 'liberty', name: '기본', ofm: 'liberty', vt: 'colorful', sw: ['#f8f4f0', '#a0c8f0', '#e9ac77'] },
    { id: 'bright', name: '선명하게', ofm: 'bright', vt: 'colorful', sw: ['#f8f4f0', '#a0c8f0', '#f7b24c'] },
    { id: 'positron', name: '연한 회색', ofm: 'positron', vt: 'gray', sw: ['#f2f3f0', '#c2c8ca', '#d5d5d5'] },
    { id: 'dark', name: '어둡게', ofm: 'dark', vt: 'colorful-dark', dark: true, sw: ['#0c0c0c', '#1b1b1d', '#3c3c3c'] },
    { id: 'fiord', name: '남색', ofm: 'fiord', vt: 'colorful-dark', dark: true, sw: ['#45516e', '#38435c', '#5f6d8c'] }
  ];
  // 보기 방식 (지도 위 버튼으로 차례로): 평면 = 건물 높이 없음 · 높이 = 위에서 본 건물 높이 · 3D = 기울여 보기(두 손가락/오른쪽 끌기로 회전·기울기)
  var VIEWS = { '2d': { name: '평면', next: 'height' }, height: { name: '높이', next: '3d' }, '3d': { name: '3D', next: '2d' } };
  // 주변 시설(가게·카페 등 OpenStreetMap 아이콘): 가까이서만 = 많이 확대했을 때만 (멀리서는 우리 장소 핀이 잘 보이게)
  var POI = { off: '숨기기', near: '가까이서만', on: '늘 보이기' }, POI_NEAR = 16;
  var FX = { b: [60, 140, '밝기'], s: [0, 200, '색 진하기'], c: [60, 150, '대비'] };   // 효과: 최소 · 최대(%) · 이름, 기본 100
  var look = (function () { var v = lsJSON('jmb_map_look') || {}; return { id: v.id || 'auto', b: +v.b || 100, s: v.s == null ? 100 : +v.s, c: +v.c || 100, view: VIEWS[v.view] ? v.view : 'height', poi: POI[v.poi] ? v.poi : v.poi === true ? 'on' : 'near' }; })();
  function lookOf(id) { return LOOKS.filter(function (k) { return k.id === id; })[0] || LOOKS[0]; }
  function curLook() { var k = lookOf(look.id); return k.id === 'auto' ? lookOf(dark ? 'dark' : 'liberty') : k; }
  var HOME_VIEW = { center: [126.95, 37.39], zoom: 11 };   // 저장된 위치도 장소도 없을 때 (안양 근처)
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  var wide = function () { return window.matchMedia('(min-width:900px)').matches; };

  var S = {
    places: [], byId: Object.create(null), view: [], stats: { byId: {}, unmatched: [] }, ver: '',
    cat: '', q: '', sort: lsGet(LS.sort) || 'visits', sel: '', sheet: 'peek', me: '', loaded: false
  };
  var map = null, mapReady = false, loadTimer = 0;

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
  var bannerT = 0;
  function banner(msg) { var b = $('banner'); b.textContent = msg; b.hidden = false; clearTimeout(bannerT); bannerT = setTimeout(function () { b.hidden = true; }, 4500); }
  function ico(path) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>'; }
  var I = {
    kakao: '<path d="M12 21s-7-6.3-7-11.5A7 7 0 0 1 19 9.5C19 14.7 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    route: '<path d="M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M6 15V9a4 4 0 0 1 4-4h4M18 9v6a4 4 0 0 1-4 4h-4"/>',
    naver: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    google: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.8 2.5 15.2 0 18M12 3c-2.5 2.8-2.5 15.2 0 18"/>',
    share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 3v12M7 8l5-5 5 5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    pin: '<path d="M12 21s-7-6.3-7-11.5A7 7 0 0 1 19 9.5C19 14.7 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    gps: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7.5"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
    note: '<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.4-9-7.4z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>'
  };

  /* ================= 로그인 (잠만보 카카오 로그인 세션을 같이 씀) ================= */
  function session() { var s = lsJSON(LS.auth); return s && s.token ? s : null; }
  function token() { var s = session(); return s ? s.token : ''; }
  function myNick() { var s = session(); return s && s.user && s.user.nickname ? s.user.nickname : ''; }
  function amAdmin() { var s = session(); return !!(s && s.user && s.user.admin); }
  function canEdit(p) { var me = myNick(); return !!me && (p.by === me || amAdmin()); }

  function startLogin() {
    if (CFG.dev) {   // 내 PC 개발 서버: 카카오 대신 닉네임만 (dev/server.mjs 가 dev. 토큰을 받아 줌)
      var n = prompt('개발용 로그인 — 회원 닉네임', myNick() || '테스터');
      if (!n) return;
      lsSet(LS.auth, JSON.stringify({ token: 'dev.' + n.trim(), user: { nickname: n.trim(), admin: /운영/.test(n) } }));
      afterLoginChange();
      return;
    }
    if (!CFG.kakaoRestKey) return toast('카카오 로그인 설정을 찾지 못했어요', true);
    var st; try { st = [].slice.call(crypto.getRandomValues(new Uint32Array(4))).join(''); } catch (e) { st = String(Math.random()).slice(2) + Date.now(); }
    lsSet(LS.state, JSON.stringify({ s: st, t: Date.now() }));
    try { sessionStorage.setItem('jmb_after_login', location.pathname + location.hash); } catch (e) {}   // 잠만보 시작 페이지가 로그인 뒤 여기로 돌려보냄
    location.href = 'https://kauth.kakao.com/oauth/authorize?client_id=' + encodeURIComponent(CFG.kakaoRestKey) +
      '&redirect_uri=' + encodeURIComponent(location.origin + ROOT) + '&response_type=code&state=' + encodeURIComponent(st);
  }
  function renderAcct() {
    var b = $('acct'), s = session(), n = myNick();
    b.textContent = n ? n : s ? '닉네임 연결' : '로그인';
    b.className = 'acct' + (n ? ' on' : '');
    b.setAttribute('aria-label', n ? n + ' (로그인됨)' : '로그인');
  }
  function onAcct() {
    var s = session();
    if (!s) return startLogin();
    if (!myNick()) { if (confirm('잠만보에서 카카오 계정에 모임 닉네임을 먼저 연결해 주세요. 잠만보로 갈까요?')) location.href = ROOT; return; }
    if (confirm(myNick() + ' 님으로 로그인돼 있어요.\n로그아웃할까요? (잠만보 앱도 함께 로그아웃돼요)')) { lsSet(LS.auth, null); afterLoginChange(); }
  }
  function afterLoginChange() { renderAcct(); S.ver = ''; refresh(); renderDetail(); }

  /* ================= 서버 ================= */
  function api(fn, args, ms) {
    if (!API) return Promise.reject(new Error('설정 파일(config.js)을 읽지 못했어요'));
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, ms || 20000) : 0;
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
          if (/허용되지 않은 요청/.test(msg)) msg = '서버에 장소 지도 기능이 아직 없어요 (Map.gs 배포 필요)';
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
  function setPlaces(packed, v) {
    S.places = C.unpack(packed);
    S.byId = Object.create(null);   // 주소의 #/p/__proto__ 같은 이름이 기본 속성에 걸리지 않게
    S.places.forEach(function (p) { S.byId[p.id] = p; });
    S.ver = v || '';
    S.loaded = true;
    computeStats();
    apply();
    openFromHash();
  }

  function computeStats() {
    var d = lsJSON(LS.data);
    S.stats = C.meetingStats(d && d.d && d.d.meetings, S.places);
  }

  // 1) 저장해 둔 목록 바로 그림 2) 서버에 버전 확인
  function loadCached() {
    var c = lsJSON(LS.places);
    if (!c || !c.places || c.m !== !!myNick()) return false;   // 로그인 상태가 바뀌었으면(회원만 장소) 다시 받음
    setPlaces(c.places, c.v);
    return true;
  }
  var refreshing = null;
  function refresh() {
    if (refreshing) return refreshing;
    var known = S.ver, member = !!myNick();
    refreshing = api('mapList', [token(), known]).then(function (r) {
      if (r.same) return;
      setPlaces(r.places, r.v);
      lsSet(LS.places, JSON.stringify({ v: r.v, places: r.places, m: member }));
    }).catch(function (e) {
      if (!S.loaded) { S.loaded = true; apply(); }
      toast(e.message, true);
    }).then(function () { refreshing = null; });
    return refreshing;
  }
  // 등록·수정 직후: 받은 장소 하나를 바로 반영 (목록 전체를 다시 받지 않음) + 다음에 열 때 새로 받게
  function upsertLocal(row) {
    var one = C.unpack({ c: C.COLS, r: [row] })[0];
    if (!one) return null;
    var i = S.places.map(function (p) { return p.id; }).indexOf(one.id);
    if (i >= 0) { one.n = S.places[i].n; S.places[i] = one; } else { one.n = S.places.length + 1; S.places.push(one); }
    S.byId[one.id] = one;
    S.ver = '';
    lsSet(LS.places, null);
    computeStats();
    apply();
    return one;
  }

  /* ================= 목록 ================= */
  function center() {
    if (mapReady) { var c = map.getCenter(); return { lat: c.lat, lng: c.wrap().lng }; }
    var v = lsJSON(LS.view) || HOME_VIEW;
    return { lat: v.center[1], lng: v.center[0] };
  }
  function visits(p) { return S.stats.byId[p.id] || null; }

  function filtered() {
    var q = S.q, cat = S.cat;
    var list = S.places.filter(function (p) { return (!cat || p.cat === cat) && C.matches(p, q); });
    var c = center();
    list.forEach(function (p) { p._d = C.distance(c.lat, c.lng, p.lat, p.lng); p._me = S.me ? C.distance(S.me.lat, S.me.lng, p.lat, p.lng) : null; });
    var by = {
      visits: function (a, b) { var va = visits(a), vb = visits(b); return ((vb ? vb.count : 0) - (va ? va.count : 0)) || (a._d - b._d); },
      near: function (a, b) { return a._d - b._d; },
      recent: function (a, b) { return String(b.at).localeCompare(String(a.at)); },
      name: function (a, b) { return a.name.localeCompare(b.name, 'ko'); }
    }[S.sort] || null;
    if (by) list.sort(by);
    return list;
  }

  function apply() {
    S.view = filtered();
    renderCats();
    renderList();
    renderTodo();
    renderDetail();
    updateMap();
  }

  function renderCats() {
    var counts = {};
    S.places.forEach(function (p) { if (C.matches(p, S.q)) counts[p.cat] = (counts[p.cat] || 0) + 1; });
    var total = Object.keys(counts).reduce(function (s, k) { return s + counts[k]; }, 0);
    var html = '<button type="button" class="chip' + (!S.cat ? ' on' : '') + '" data-cat="">전체 <small>' + total + '</small></button>';
    C.CATS.forEach(function (c) {
      if (!counts[c.id] && S.cat !== c.id) return;   // 없는 분류는 숨김 (칩 줄이 짧게)
      html += '<button type="button" class="chip' + (S.cat === c.id ? ' on' : '') + '" aria-pressed="' + (S.cat === c.id) + '" data-cat="' + esc(c.id) + '" style="--c:' + c.color + '"><span aria-hidden="true">' + c.emoji + '</span>' + esc(c.id) + ' <small>' + (counts[c.id] || 0) + '</small></button>';
    });
    $('cats').innerHTML = html;
  }

  function itemHTML(p) {
    var cat = C.catOf(p.cat), v = visits(p);
    var d = p._me != null ? p._me : S.sort === 'near' ? p._d : null;
    var sub = [d != null ? C.fmtDist(d) : '', C.shortAddr(p.addr, p.region) || p.region].filter(Boolean).join(' · ');
    return '<li class="item' + (p.id === S.sel ? ' on' : '') + '" data-id="' + esc(p.id) + '" tabindex="0">' +
      '<span class="em" style="--c:' + cat.color + '">' + cat.emoji + '</span>' +
      '<span class="it"><b>' + esc(p.name) + ' <em>' + esc(p.cat) + '</em>' + (p.vis === '회원' ? '<span class="lock" title="회원에게만 보여요">회원</span>' : '') + '</b><small>' + esc(sub) + '</small></span>' +
      (v ? '<span class="badge" title="모임 ' + v.count + '번 · 최근 ' + esc(v.last) + '">모임 ' + v.count + '</span>' : '') + '</li>';
  }
  var MAX_LIST = 300;
  function renderList() {
    var list = S.view, el = $('list');
    $('cnt').textContent = S.loaded ? list.length + '곳' + (S.q || S.cat ? ' / ' + S.places.length : '') : '';
    if (!S.loaded) { el.innerHTML = '<li class="empty">불러오는 중…</li>'; return; }
    if (!list.length) {
      el.innerHTML = '<li class="empty">' + (!S.places.length ? '아직 등록된 장소가 없어요.<br>아래 <b>장소 추가</b>로 첫 장소를 올려 주세요!'
        : S.q ? '‘' + esc(S.q) + '’ 은(는) 아직 지도에 없어요<br><button type="button" class="go addq" data-addq>새 장소로 등록하기</button>'
        : '이 분류에는 아직 장소가 없어요') + '</li>';
      return;
    }
    el.innerHTML = list.slice(0, MAX_LIST).map(itemHTML).join('') +
      (list.length > MAX_LIST ? '<li class="empty">' + (list.length - MAX_LIST) + '곳 더 있어요 — 검색이나 분류로 좁혀 보세요</li>' : '');
  }

  function renderTodo() {
    var un = S.stats.unmatched.filter(function (g) { return g.count >= 2; }).slice(0, 10), box = $('todo');
    if (!un.length || S.q || S.cat) { box.hidden = true; return; }
    box.hidden = false;
    $('todoSum').textContent = '📌 지도에 없는 모임 장소 ' + un.length + '곳';
    $('todoList').innerHTML = un.map(function (g, i) {
      return '<div class="row"><span>' + esc(g.name) + ' <small>모임 ' + g.count + '회' + (g.variants.length > 1 ? ' · 표기 ' + g.variants.length + '가지' : '') + '</small></span>' +
        '<button type="button" class="sbtn" data-todo="' + i + '">등록</button></div>';
    }).join('');
    box._list = un;
  }

  /* ================= 상세 ================= */
  function renderDetail() {
    var box = $('detail'), p = S.sel && S.byId[S.sel];
    if (!p && S.poi) { box.innerHTML = poiHTML(S.poi); return; }
    if (!p) { box.innerHTML = ''; return; }
    var cat = C.catOf(p.cat), v = visits(p);
    var ls = C.links(p), route = ls.filter(function (l) { return l.id === 'route'; })[0];
    var acts = (route ? '<a class="pri" href="' + esc(route.url) + '" target="_blank" rel="noopener noreferrer"><i>' + ico(I.route) + '</i>길찾기</a>' : '') +
      ls.filter(function (l) { return l.id !== 'route'; }).map(function (l) {
        return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer"><i>' + ico(I[l.id] || I.google) + '</i>' + esc(l.label) + '</a>';
      }).join('') + '<button type="button" data-act="share"><i>' + ico(I.share) + '</i>공유</button>';
    var tags = C.splitList(p.tags, 10, 20).map(function (t) { return '<span>#' + esc(t) + '</span>'; }).join('');
    var alias = C.splitList(p.alias, 10, 40);
    var info = (p.addr ? '<li>' + ico(I.pin) + '<span>' + esc(p.addr) + ' <button type="button" class="cp" data-act="copy">복사</button></span></li>' : '') +
      (p.memo ? '<li>' + ico(I.note) + '<span class="memo">' + esc(p.memo) + '</span></li>' : '') +
      (tags || alias.length ? '<li>' + ico(I.tag) + '<span>' + (tags ? '<span class="tagline">' + tags + '</span>' : '') + (alias.length ? '<small>다른 이름: ' + esc(alias.join(', ')) + '</small>' : '') + '</span></li>' : '');
    box.innerHTML = '<div class="detail">' +
      '<div class="dtop"><div class="dtt"><h2>' + esc(p.name) + '</h2><span class="dcat" style="--c:' + cat.color + '">' + cat.emoji + ' ' + esc(p.cat) + '</span>' +
        (p.vis === '회원' ? '<span class="lock">회원만</span>' : '') + '</div></div>' +
      '<div class="dsub">' + esc([p._me != null ? '내 위치에서 ' + C.fmtDist(p._me) : '', p.addr ? '' : p.region, p.cc && p.cc !== 'KR' ? p.cc : ''].filter(Boolean).join(' · ')) +
        (v ? '<div class="dvis"><span class="badge">모임 ' + v.count + '번</span> 마지막 ' + esc(v.last || '-') + '</div>' : '') + '</div>' +
      '<div class="acts">' + acts + '</div>' +
      (info ? '<ul class="dinfo">' + info + '</ul>' : '') +
      '<div class="meta"><span>' + esc(p.by || '') + (p.at ? ' 등록 · ' + esc(String(p.at).slice(0, 10)) : '') + (p.eat ? ' (수정 ' + esc(String(p.eat).slice(0, 10)) + ')' : '') + '</span><span class="sp"></span>' +
      (canEdit(p) ? '<button type="button" class="lbtn" data-act="edit">수정</button><button type="button" class="lbtn" data-act="hide">숨기기</button>' : '') +
      '</div></div>';
  }

  // 지도 위 시설(우리 장소 아님): 이름·분류 + 다른 지도에서 자세히 보기 + 모임 장소로 등록
  function poiHTML(q) {
    var ls = C.links({ name: q.name, lat: q.lat, lng: q.lng }).filter(function (l) { return l.id !== 'route'; });
    return '<div class="detail">' +
      '<div class="dtop"><div class="dtt"><h2>' + esc(q.name) + '</h2>' + (q.kind ? '<span class="dcat">' + esc(q.kind) + '</span>' : '') + '</div></div>' +
      '<div class="dsub">지도에 있는 시설이에요 · 메뉴·영업시간은 다른 지도에서</div>' +
      '<div class="acts">' + ls.map(function (l) {
        return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer"><i>' + ico(I[l.id] || I.google) + '</i>' + esc(l.label) + '</a>';
      }).join('') + '<button type="button" class="pri" data-act="poiadd"><i>' + ico('<path d="M12 5v14M5 12h14"/>') + '</i>모임 장소로</button></div>' +
      '<div class="meta"><span>© OpenStreetMap contributors</span></div></div>';
  }

  function select(id, opts) {
    opts = opts || {};
    var p = id && S.byId[id];
    S.sel = p ? id : '';
    S.poi = null;
    renderDetail();
    var items = $('list').querySelectorAll('.item');
    for (var i = 0; i < items.length; i++) items[i].classList.toggle('on', items[i].getAttribute('data-id') === S.sel);
    selFilters();
    document.body.classList.toggle('has-sel', !!p);
    var h = S.sel ? '#/p/' + encodeURIComponent(S.sel) : ' ';
    if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + (S.sel ? h : ''));
    if (!p) return;
    if (!wide() && S.sheet === 'full') setSheet('half');   // 휴대폰: 시트가 장소 카드 높이로 (지도가 보이게)
    $('sbody').scrollTop = 0;
    if (opts.fly && mapReady) flyTo(p, Math.max(map.getZoom(), 15));
  }

  // 시트에 가리지 않는 곳 가운데로. 시트 높이는 움직이는 중일 수 있어 상태로 계산 (화면보다 크게 잡히지 않게)
  function flyTo(p, zoom) {
    var H = map.getContainer().clientHeight, pad;
    if (wide()) pad = { top: 40, bottom: 40, left: 40, right: 40 };
    else {
      var sheetH = S.sel ? $('sheet').offsetHeight : S.sheet === 'peek' ? 148 : S.sheet === 'half' ? H * 0.52 : H - 132;
      pad = { top: Math.min(130, H * 0.2), bottom: Math.max(0, Math.min(sheetH + 20, H - Math.min(130, H * 0.2) - 60)), left: 20, right: 20 };
    }
    map.easeTo({ center: [p.lng, p.lat], zoom: zoom, padding: pad, duration: reduce ? 0 : 600 });
  }

  function openFromHash() {
    var m = /^#\/p\/(.+)$/.exec(location.hash);
    if (!m || !S.loaded) return;
    var id = decodeURIComponent(m[1]);
    if (S.byId[id]) { if (S.sel !== id) select(id, { fly: true }); }
    else if (S.ver) toast('장소를 찾을 수 없어요 (숨겨졌거나 회원만 볼 수 있는 곳)', true);
  }

  function copyText(t, done) {
    var ok = function () { toast(done || '복사했어요'); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(ok, function () { prompt('복사하세요', t); });
    else prompt('복사하세요', t);
  }
  function share(p) {
    var url = location.origin + location.pathname + '#/p/' + encodeURIComponent(p.id);
    if (navigator.share) navigator.share({ title: p.name, text: p.name + (p.addr ? ' · ' + p.addr : ''), url: url }).catch(function () {});
    else copyText(url, '링크를 복사했어요');
  }
  function hidePlace(p) {
    if (!confirm('"' + p.name + '" 을(를) 지도에서 숨길까요?\n(운영진이 시트에서 되살릴 수 있어요)')) return;
    api('mapHide', [p.id, token()]).then(function () {
      S.places = S.places.filter(function (x) { return x.id !== p.id; });
      delete S.byId[p.id];
      S.ver = ''; lsSet(LS.places, null);
      select('');
      computeStats(); apply();
      toast('숨겼어요');
    }, function (e) { toast(e.message, true); });
  }

  /* ================= 아래 시트 (휴대폰) ================= */
  function setSheet(s) {
    S.sheet = s;
    var el = $('sheet');
    el.classList.remove('half', 'full');
    if (s !== 'peek') el.classList.add(s);
    $('grab').setAttribute('aria-expanded', String(s !== 'peek'));
    document.body.setAttribute('data-sheet', s);
  }
  function bindSheet() {
    var el = $('sheet'), startY = 0, startH = 0, moved = false, active = false;
    var fromBody = false;
    function down(e) {
      if (wide() || (e.target.closest && e.target.closest('select,button'))) return;
      fromBody = e.currentTarget.id === 'sbody';
      if (fromBody && (S.sheet !== 'peek' || S.sel || S.poi)) return;   // 펼친 목록은 그냥 스크롤
      active = true; moved = false; startY = e.clientY; startH = el.offsetHeight;
      el.classList.add('drag');
    }
    function move(e) {
      if (!active) return;
      var dy = e.clientY - startY;
      if (!moved && Math.abs(dy) > 6) {
        moved = true;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {}   // 움직일 때만 잡음 (누르기는 목록 항목으로 가게)
      }
      if (moved) el.style.height = Math.max(90, Math.min(window.innerHeight - 110, startH - dy)) + 'px';
    }
    function up(e) {
      if (!active) return;
      active = false;
      el.classList.remove('drag');
      var h = el.offsetHeight, H = window.innerHeight;
      el.style.height = '';
      if (!moved) { if (!fromBody) setSheet(S.sheet === 'peek' ? 'half' : 'peek'); return; }
      var dy = e.clientY - startY;
      setSheet(h > H * 0.7 || (dy < -60 && S.sheet === 'half') ? 'full' : h < H * 0.3 ? 'peek' : 'half');
    }
    ['grab', 'shead', 'sbody'].forEach(function (id) {
      var t = $(id);
      t.addEventListener('pointerdown', down);
      t.addEventListener('pointermove', move);
      t.addEventListener('pointerup', up);
      t.addEventListener('pointercancel', up);
    });
    $('grab').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSheet(S.sheet === 'peek' ? 'half' : 'peek'); } });
  }

  /* ================= 지도 ================= */
  function hasWebGL() { try { var c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } }
  function fallback(msg) { $('mapFallback').hidden = false; $('mapFallbackMsg').textContent = msg + ' 목록·검색·등록(직접 고르기 빼고)은 그대로 쓸 수 있어요.'; }

  function loadMapLib() {
    if (window.maplibregl) return initMap();
    var s = document.createElement('script');
    s.src = MAPLIBRE; s.async = true; s.integrity = MAPLIBRE_SRI; s.crossOrigin = 'anonymous';
    s.onload = initMap;
    s.onerror = function () { fallback('지도 프로그램을 받지 못했어요. 인터넷 연결을 확인해 주세요.'); };
    document.head.appendChild(s);
  }

  function savedView() { var v = lsJSON(LS.view); return v && v.center && isFinite(v.zoom) ? v : null; }

  function initMap() {
    if (map) return;   // 한 번만 만듦
    if (!hasWebGL()) return fallback('이 브라우저는 지도(WebGL)를 지원하지 않아요.');
    $('mapFallback').hidden = true;
    var v = savedView() || HOME_VIEW;
    try {
      map = new maplibregl.Map({
        container: 'map', style: STYLE.url(curLook()), center: v.center, zoom: v.zoom,
        attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
        fadeDuration: reduce ? 0 : 200, maxZoom: 19
      });
    } catch (e) { map = null; return fallback('지도를 만들지 못했어요.'); }
    map.touchZoomRotate.disableRotation();
    // 휴대폰: 확대·축소 버튼 없음(두 손가락) · 현위치는 왼쪽 아래 / PC: 모두 오른쪽 위
    var W = wide();
    var geo = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }, trackUserLocation: false });
    geo.on('geolocate', function (e) { var c = e && e.coords; if (!c) return; S.me = { lat: c.latitude, lng: c.longitude }; S.view = filtered(); renderList(); });
    geo.on('error', function (e) { banner(e && e.code === 1 ? '위치 권한이 꺼져 있어요' : '현재 위치를 확인하지 못했어요'); });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), W ? 'bottom-right' : 'bottom-left');
    if (W) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(btnCtl('lookBtn', ico(I.layers), '지도 모양', openLook), 'top-right');
    map.addControl(geo, W ? 'top-right' : 'bottom-left');
    // 10초 안에 스타일도 못 받으면 다음 서버로 (스타일은 왔는데 그림 조각이 느린 건 기다림 — 느린 휴대폰에서 괜히 바꾸지 않게)
    loadTimer = setTimeout(function () { if (!styleOk) nextStyle(); }, 10000);
    // 지도 그림에 없는 작은 아이콘(ATM·자전거 주차 등)은 빈 그림으로 (콘솔 경고·재시도 방지)
    map.on('styleimagemissing', function (e) { if (!map.hasImage(e.id)) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) }); });
    var styleOk = false;
    map.once('style.load', function () { styleOk = true; });
    map.on('error', function (e) { if (!styleOk) return nextStyle(); if (mapReady) { banner('지도 일부를 불러오지 못했어요'); if (window.console) console.warn('[map]', e && e.error && e.error.message); } });
    map.on('load', onMapLoad);
  }

  function btnCtl(id, html, label, fn) {
    return {
      onAdd: function () {
        var d = document.createElement('div');
        d.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        d.innerHTML = '<button type="button" id="' + id + '"' + (label ? ' title="' + label + '" aria-label="' + label + '"' : '') + '>' + html + '</button>';
        d.firstChild.onclick = fn;
        return d;
      },
      onRemove: function () {}
    };
  }

  function destroyMap() { clearTimeout(loadTimer); if (map) { try { map.remove(); } catch (e) {} } map = null; mapReady = false; }

  // 지도 서버가 응답 없음 → 다음 서버로. 다 안 되면 목록만
  function nextStyle() {
    if (mapReady) return;
    var was = STYLE.name;
    destroyMap();
    if (styleNo + 1 < STYLES.length) { STYLE = STYLES[++styleNo]; if (window.console) console.warn('[map]', was, '→', STYLE.name); return initMap(); }
    fallback('지도 서버(' + STYLES.map(function (s) { return s.name; }).join(' · ') + ') 응답이 없어요.');
  }

  /* ---------- 지도 모양 (🎨) — 스타일 · 밝기 · 색 진하기 · 대비. 이 기기에만 저장 ---------- */
  function saveLook() { lsSet('jmb_map_look', JSON.stringify(look)); }
  // 효과는 지도 그림(canvas)에 CSS filter 로 — 지도를 다시 받지 않아 바로 바뀜 (점 색도 같이 바뀜)
  function applyFx() {
    var f = look.b === 100 && look.s === 100 && look.c === 100 ? 'none' : 'brightness(' + look.b + '%) saturate(' + look.s + '%) contrast(' + look.c + '%)';
    $('map').style.setProperty('--mapfx', f);
  }
  // 건물 높이 층: 스타일에 있으면 그것(기본=liberty), 없으면 같은 지도 자료(openmaptiles)로 직접 만듦. VersaTiles 는 높이 자료가 없어 기울기만
  function buildingLayers() {
    var ids = map.getStyle().layers.filter(function (l) { return l.type === 'fill-extrusion'; }).map(function (l) { return l.id; });
    if (ids.length || !map.getSource('openmaptiles')) return ids;
    var dk = !!curLook().dark;
    map.addLayer({ id: 'jmb-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14, filter: ['!=', ['get', 'hide_3d'], true],
      paint: { 'fill-extrusion-color': dk ? '#2b303b' : '#e3ddd3', 'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 0.85],
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 0], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0] } }, 'clusters');
    return ['jmb-3d'];
  }
  var extOrig = {};   // 건물 층의 원래 높이 식 (평면 → 높이로 돌아올 때)
  function flatBuildings(flat) {
    buildingLayers().forEach(function (id) {
      if (!extOrig[id]) extOrig[id] = { h: map.getPaintProperty(id, 'fill-extrusion-height'), b: map.getPaintProperty(id, 'fill-extrusion-base') };
      map.setPaintProperty(id, 'fill-extrusion-height', flat ? 0 : extOrig[id].h);
      map.setPaintProperty(id, 'fill-extrusion-base', flat ? 0 : extOrig[id].b);
    });
  }
  function applyView(animate) {
    if (!mapReady) return;
    var is3d = look.view === '3d', dur = animate && !reduce ? 600 : 0;
    flatBuildings(look.view === '2d');
    if (is3d) {
      map.dragRotate.enable(); map.touchZoomRotate.enableRotation(); map.touchPitch.enable();
      map.easeTo({ pitch: 60, bearing: -20, zoom: Math.max(map.getZoom(), 15.5), duration: dur });
    } else {
      map.dragRotate.disable(); map.touchZoomRotate.disableRotation(); map.touchPitch.disable();
      map.easeTo({ pitch: 0, bearing: 0, duration: dur });
    }
  }
  // 주변 시설(가게·버스정류장 아이콘): 끄면 우리 장소 핀이 잘 보임. 지하철·기차역·공항은 늘 보임
  var poiOrig = {}, poiIds = [];
  function applyPoi() {
    if (!mapReady) return;
    poiIds = [];
    map.getStyle().layers.forEach(function (l) {
      if (l['source-layer'] !== 'poi' || l.type !== 'symbol' || /^jmb-/.test(l.id)) return;
      poiIds.push(l.id);
      if (!(l.id in poiOrig)) poiOrig[l.id] = { filter: map.getFilter(l.id) || null, min: l.minzoom || 0, max: l.maxzoom || 24 };
      var o = poiOrig[l.id];
      if (/transit/.test(l.id)) {
        var keep = ['!=', ['get', 'class'], 'bus'];
        map.setFilter(l.id, look.poi === 'on' ? o.filter : o.filter ? ['all', o.filter, keep] : keep);
        return;
      }
      map.setLayoutProperty(l.id, 'visibility', look.poi === 'off' ? 'none' : 'visible');
      map.setLayerZoomRange(l.id, look.poi === 'near' ? Math.max(o.min, POI_NEAR) : o.min, o.max);
    });
  }
  // 지도 위 시설 이름 (OSM class → 한국어 분류)
  var POI_CLS = { restaurant: '음식점', fast_food: '패스트푸드', cafe: '카페', bar: '술집', beer: '술집', pub: '술집', bakery: '빵집', ice_cream: '아이스크림',
    shop: '가게', grocery: '식료품', convenience: '편의점', clothing_store: '옷 가게', alcohol_shop: '주류', hairdresser: '미용실', lodging: '숙소',
    cinema: '영화관', theatre: '공연장', music: '음악', entertainment: '놀거리', library: '도서관', school: '학교', college: '학교', hospital: '병원', doctors: '병원', clinic: '병원', dentist: '치과', veterinary: '동물병원', optician: '안경점', beauty: '미용', laundry: '세탁소', car: '자동차', mobile_phone: '휴대폰', books: '서점', stationery: '문구점', supermarket: '마트', mall: '쇼핑몰', department_store: '백화점', karaoke: '노래방', gym: '헬스장', fitness_centre: '헬스장', toilets: '화장실', atm: 'ATM',
    pharmacy: '약국', bank: '은행', post: '우체국', town_hall: '관공서', police: '경찰', fire_station: '소방서', place_of_worship: '종교시설',
    park: '공원', sports: '운동', stadium: '경기장', parking: '주차장', fuel: '주유소', railway: '역', bus: '버스정류장', attraction: '명소', museum: '박물관' };
  function selectPoi(f) {
    var pr = f.properties || {}, g = f.geometry.coordinates;
    select('');
    S.poi = { name: pr['name:ko'] || pr.name || '이름 없는 곳', kind: POI_CLS[pr.subclass] || POI_CLS[pr.class] || pr.subclass || pr.class || '', lat: C.round6(g[1]), lng: C.round6(C.wrapLng(g[0])) };
    renderDetail();
    document.body.classList.add('has-sel');
    if (!wide() && S.sheet === 'full') setSheet('half');
    $('sbody').scrollTop = 0;
  }
  function setPoi(v) { look.poi = v; saveLook(); applyPoi(); refreshLook(); }
  function setView(v) { look.view = v; saveLook(); applyView(true); if ($('mbg')) refreshLook(); }

  function setLook(id) {
    if (id === look.id) return;
    var was = curLook();
    look.id = id; saveLook();
    if (!map || curLook() === was) return;
    var c = map.getCenter();   // 지금 보던 곳 그대로 다시 열기
    lsSet(LS.view, JSON.stringify({ center: [C.round6(c.wrap().lng), C.round6(c.lat)], zoom: Math.round(map.getZoom() * 100) / 100 }));
    destroyMap(); initMap();
  }
  function lookHTML() {
    return '<div class="mh"><h3>지도 모양</h3><button type="button" class="ibtn" data-act="mclose" aria-label="닫기">' + ico(I.close) + '</button></div><div class="mb">' +
      '<div class="lab"><span>스타일</span><small>' + (look.id === 'auto' ? '지금: ' + curLook().name + ' (기기가 ' + (dark ? '어두운' : '밝은') + ' 모드)' : '') + '</small></div>' +
      '<div class="looks" role="radiogroup" aria-label="스타일">' + LOOKS.map(function (k) {
        var sw = k.sw ? '<i style="background:linear-gradient(135deg,' + k.sw[0] + ' 0 45%,' + k.sw[1] + ' 45% 70%,' + k.sw[2] + ' 70%)"></i>'
          : '<i style="background:linear-gradient(135deg,#f8f4f0 0 50%,#1b1b1d 50%)"></i>';
        return '<button type="button" role="radio" aria-checked="' + (look.id === k.id) + '" data-look="' + k.id + '" class="' + (look.id === k.id ? 'on' : '') + '"' + (k.desc ? ' title="' + esc(k.desc) + '"' : '') + '>' + sw + '<b>' + esc(k.name) + '</b></button>';
      }).join('') + '</div>' +
      '<div class="lab"><span>보기</span><small>3D 는 두 손가락으로 기울이고 돌려요</small></div><div class="seg">' +
        Object.keys(VIEWS).map(function (v) { return '<button type="button" data-view="' + v + '" class="' + (look.view === v ? 'on' : '') + '">' + VIEWS[v].name + '</button>'; }).join('') + '</div>' +
      '<div class="lab"><span>주변 시설 아이콘</span><small>가게 · 카페 등, 누르면 정보 (역은 늘 보여요)</small></div><div class="seg">' +
        Object.keys(POI).map(function (v) { return '<button type="button" data-poi="' + v + '" class="' + (look.poi === v ? 'on' : '') + '">' + POI[v] + '</button>'; }).join('') + '</div>' +
      '<details class="more"' + (look.b !== 100 || look.s !== 100 || look.c !== 100 ? ' open' : '') + '><summary>밝기 · 색 · 대비 조절</summary>' +
      Object.keys(FX).map(function (k) {
        return '<label class="fx"><span>' + FX[k][2] + '</span><input type="range" data-fx="' + k + '" min="' + FX[k][0] + '" max="' + FX[k][1] + '" step="5" value="' + look[k] + '"><output>' + look[k] + '%</output></label>';
      }).join('') + '</details>' +
      '<div class="foot"><button type="button" class="sbtn" data-act="lookreset">처음대로</button><button type="button" class="go" data-act="mclose">닫기</button></div><p class="note c">이 기기에만 저장돼요</p></div>';
  }
  function openLook() {
    if (E) return;   // 장소 추가 창이 열려 있으면 그대로
    modal(lookHTML());
    $('mbg').classList.add('see');   // 배경을 어둡게 하지 않음 — 창을 연 채로 지도를 보면서 고름
  }
  function refreshLook() { var m = $('modal').querySelector('.modal'); if (m) m.innerHTML = lookHTML(); }
  function onFxInput(e) {
    var k = e.target.getAttribute && e.target.getAttribute('data-fx');
    if (!k) return;
    look[k] = Number(e.target.value);
    e.target.nextElementSibling.textContent = look[k] + '%';
    applyFx(); saveLook();
  }

  // 지도 글자를 한국어 이름 먼저로 ("Anyang 안양시" → "안양시"). 한국어 이름이 없는 곳(해외)은 원래 이름
  function koreanLabels() {
    var ko = ['coalesce', ['get', 'name:ko'], ['get', 'name']];
    map.getStyle().layers.forEach(function (l) {
      if (l.type !== 'symbol' || !l.layout || !l.layout['text-field']) return;
      if (/"name(:latin|:nonlatin|_en|_int)?"|\{name/.test(JSON.stringify(l.layout['text-field']))) {
        try { map.setLayoutProperty(l.id, 'text-field', ko); } catch (e) {}
      }
    });
  }

  // 장소 핀 — 물방울 모양(분류 색) + 흰 원 안에 분류 그림. 분류마다 한 번 그려 지도에 넣음 (DOM 마커 없이 GPU 로)
  function pinImage(cat) {
    var r = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1))), W = 34, H = 46;
    var cv = document.createElement('canvas'); cv.width = W * r; cv.height = H * r;
    var g = cv.getContext('2d'), deg = Math.PI / 180;
    g.scale(r, r);
    g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(17, 43, 5.5, 2, 0, 0, Math.PI * 2); g.fill();   // 바닥 그림자
    g.beginPath(); g.arc(17, 16, 14, 144.3 * deg, 35.7 * deg); g.lineTo(17, 41); g.closePath();   // 원 + 아래 꼭지 (접선 54.3°)
    g.fillStyle = cat.color; g.fill();
    g.lineWidth = 2.5; g.strokeStyle = '#ffffff'; g.stroke();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(17, 16, 10, 0, Math.PI * 2); g.fill();
    g.font = '13px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(cat.emoji, 17, 17);
    return { img: g.getImageData(0, 0, W * r, H * r), r: r };
  }
  // 고른 장소는 'sel' 층(크게)에만, 나머지는 'pts' 층에
  function selFilters() {
    if (!mapReady) return;
    map.setFilter('pts', ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'id'], S.sel || '']]);
    map.setFilter('sel', ['==', ['get', 'id'], S.sel || '']);
  }

  function onMapLoad() {
    clearTimeout(loadTimer);
    mapReady = true;
    var dark = !!curLook().dark;   // 묶음·이름표 색은 고른 지도 모양을 따라감
    extOrig = {}; poiOrig = {};
    koreanLabels();
    applyPoi();
    // 출처 표시는 처음부터 접힌 ⓘ 로 (휴대폰에서 장소 추가 버튼을 가리지 않게)
    var at = document.querySelector(".maplibregl-ctrl-attrib.maplibregl-compact-show");
    if (at) { at.classList.remove("maplibregl-compact-show"); at.removeAttribute("open"); }
    C.CATS.forEach(function (c) { var p = pinImage(c); if (!map.hasImage('pin-' + c.id)) map.addImage('pin-' + c.id, p.img, { pixelRatio: p.r }); });
    map.addSource('places', { type: 'geojson', data: C.toGeoJSON([]), cluster: true, clusterRadius: 46, clusterMaxZoom: 14 });
    var halo = { 'text-color': dark ? '#eef0f4' : '#191f28', 'text-halo-color': dark ? 'rgba(14,16,20,.9)' : 'rgba(255,255,255,.95)', 'text-halo-width': 1.8 };
    map.addLayer({ id: 'cluster-ring', type: 'circle', source: 'places', filter: ['has', 'point_count'],
      paint: { 'circle-color': dark ? '#7c93ff' : '#3b5bdb', 'circle-opacity': 0.2, 'circle-radius': ['step', ['get', 'point_count'], 23, 10, 27, 50, 32] } });
    map.addLayer({ id: 'clusters', type: 'circle', source: 'places', filter: ['has', 'point_count'],
      paint: { 'circle-color': dark ? '#7c93ff' : '#3b5bdb', 'circle-radius': ['step', ['get', 'point_count'], 16, 10, 19, 50, 23], 'circle-stroke-width': 2.5, 'circle-stroke-color': '#ffffff' } });
    map.addLayer({ id: 'cluster-n', type: 'symbol', source: 'places', filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': [STYLE.font[1]], 'text-size': 13.5, 'text-allow-overlap': true },
      paint: { 'text-color': '#ffffff' } });
    // 핀 + 이름 (이름은 확대했을 때만, 겹치면 이름만 빠짐)
    map.addLayer({ id: 'pts', type: 'symbol', source: 'places', filter: ['!', ['has', 'point_count']],
      layout: { 'icon-image': ['concat', 'pin-', ['get', 'cat']], 'icon-anchor': 'bottom', 'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.7, 13, 0.95], 'icon-allow-overlap': true,
        'text-field': ['step', ['zoom'], '', 12.5, ['get', 'name']], 'text-font': [STYLE.font[1]], 'text-size': 12.5, 'text-anchor': 'top', 'text-offset': [0, 0.2],
        'text-max-width': 8, 'text-optional': true, 'text-padding': 4 },
      paint: halo });
    map.addLayer({ id: 'sel', type: 'symbol', source: 'places', filter: ['==', ['get', 'id'], S.sel || ''],
      layout: { 'icon-image': ['concat', 'pin-', ['get', 'cat']], 'icon-anchor': 'bottom', 'icon-size': 1.35, 'icon-allow-overlap': true, 'icon-ignore-placement': true,
        'text-field': ['get', 'name'], 'text-font': [STYLE.font[1]], 'text-size': 14.5, 'text-anchor': 'top', 'text-offset': [0, 0.25], 'text-max-width': 9, 'text-allow-overlap': true, 'text-ignore-placement': true },
      paint: halo });
    selFilters();

    map.on('click', 'clusters', function (e) {
      var f = e.features[0];
      map.getSource('places').getClusterExpansionZoom(f.properties.cluster_id).then(function (z) {
        map.easeTo({ center: f.geometry.coordinates, zoom: z + 0.3, duration: reduce ? 0 : 450 });
      });
    });
    map.on('click', 'pts', function (e) { if (!picking) select(e.features[0].properties.id); });
    map.on('click', function (e) {
      if (picking || map.queryRenderedFeatures(e.point, { layers: ['pts', 'sel', 'clusters'] }).length) return;
      var box = [[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]];   // 손가락으로 누르기 쉽게 조금 넓게
      var ids = poiIds.filter(function (id) { return map.getLayer(id); });
      var f = ids.length ? map.queryRenderedFeatures(box, { layers: ids }).filter(function (x) { return x.properties && x.properties.name; })[0] : null;
      if (f) selectPoi(f);
      else if (S.sel || S.poi) select('');   // 빈 곳 누르면 선택 해제
    });
    ['clusters', 'pts', 'sel'].forEach(function (id) {
      map.on('mouseenter', id, function () { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, function () { map.getCanvas().style.cursor = ''; });
    });
    poiIds.forEach(function (id) {
      map.on('mouseenter', id, function () { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, function () { map.getCanvas().style.cursor = ''; });
    });
    map.on('moveend', onMoveEnd);
    applyView(false);
    updateMap();
    if (!savedView() && S.places.length) fitAll();
    if (S.sel && S.byId[S.sel]) flyTo(S.byId[S.sel], Math.max(map.getZoom(), 15));
  }

  var onMoveEnd = C.debounce(function () {
    if (!map) return;
    var c = map.getCenter();
    lsSet(LS.view, JSON.stringify({ center: [C.round6(c.wrap().lng), C.round6(c.lat)], zoom: Math.round(map.getZoom() * 100) / 100 }));
    if (S.sort !== 'near' && S.sort !== 'visits') return;
    var was = S.view.map(function (p) { return p.id; }).join('|');
    S.view = filtered();
    // 거리를 보여 주는 '가까운 순' 은 늘, '모임 많은 순' 은 순서가 바뀔 때만 목록을 다시 그림 (지도 데이터는 그대로)
    if (S.sort === 'near' || S.view.map(function (p) { return p.id; }).join('|') !== was) renderList();
  }, 250);

  function fitAll() {
    if (!mapReady || !S.view.length) return;
    var b = new maplibregl.LngLatBounds();
    S.view.forEach(function (p) { b.extend([p.lng, p.lat]); });
    var H = map.getContainer().clientHeight, W = map.getContainer().clientWidth;
    var pad = wide() ? Math.min(60, W / 6, H / 6) : { top: Math.min(140, H * 0.22), bottom: Math.min(170, H * 0.28), left: Math.min(40, W / 8), right: Math.min(40, W / 8) };
    map.fitBounds(b, { padding: pad, maxZoom: 14, duration: 0 });
  }

  var lastGeo = '';
  function updateMap() {
    if (!mapReady) return;
    var key = S.view.map(function (p) { return p.id + p.lat + p.lng + p.cat + p.name; }).join('|');
    if (key === lastGeo) return;   // 같은 목록이면 지도 데이터는 그대로 (정렬만 바뀐 경우 등)
    lastGeo = key;
    map.getSource('places').setData(C.toGeoJSON(S.view));
    selFilters();
  }

  /* ================= 지도에서 직접 고르기 ================= */
  var picking = null;
  function startPick(lat, lng, done) {
    if (!mapReady) { toast('지도를 쓸 수 없어 직접 고를 수 없어요', true); return false; }
    picking = done;
    document.body.classList.add('picking');
    $('pickPin').hidden = false; $('pickBar').hidden = false;
    if (isFinite(lat) && isFinite(lng)) map.jumpTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 16) });
    else if (map.getZoom() < 15) map.easeTo({ zoom: 15, duration: reduce ? 0 : 400 });
    setTimeout(function () { map.resize(); }, 0);
    return true;
  }
  function endPick(ok) {
    var done = picking;
    picking = null;
    document.body.classList.remove('picking');
    $('pickPin').hidden = true; $('pickBar').hidden = true;
    setTimeout(function () { if (map) map.resize(); }, 0);
    if (done) { var c = map.getCenter(); done(ok ? { lat: C.round6(c.lat), lng: C.round6(c.wrap().lng) } : null); }
  }

  /* ================= 해외 검색 (OpenStreetMap 데이터 — Photon 먼저, 안 되면 Nominatim) =================
   * Photon: 오타·부분 이름에 강하고 지도 가운데 가까운 곳 먼저. 한국어 이름은 없음(현지 이름)
   * Nominatim: 한국어 이름·주소. 공개 서버 규칙 1초에 1번 이하 · 자동완성 금지
   * → 둘 다 버튼/Enter 로만, 서버마다 1.1초 간격, 같은 검색은 저장, 한 번 열 때 40번까지 */
  var OSM = { last: {}, cache: {}, calls: 0, MAX: 40 };
  function osmFetch(url) {
    var host = url.split('/')[2], wait = (OSM.last[host] || 0) + 1100 - Date.now();
    if (OSM.calls >= OSM.MAX) return Promise.reject(new Error('해외 검색을 너무 많이 했어요. 지도에서 직접 골라 주세요'));
    return new Promise(function (res) { setTimeout(res, Math.max(0, wait)); }).then(function () {
      OSM.last[host] = Date.now(); OSM.calls++;
      var ctl = typeof AbortController === 'function' ? new AbortController() : null, t = ctl ? setTimeout(function () { ctl.abort(); }, 9000) : 0;
      return fetch(url, { signal: ctl ? ctl.signal : undefined, headers: { Accept: 'application/json' } }).then(function (r) {
        clearTimeout(t);
        if (r.status === 429) throw new Error('해외 검색이 잠시 막혔어요. 조금 뒤에 다시 해 주세요');
        if (!r.ok) throw new Error('해외 검색 실패 (' + r.status + ')');
        return r.json();
      }, function () { clearTimeout(t); throw new Error('해외 검색 서버에 연결하지 못했어요'); });
    });
  }
  function osmCat(r) {
    var t = String(r.type || '');
    return /restaurant|fast_food|food_court/.test(t) ? '식당' : /cafe/.test(t) ? '카페' : /bar|pub|biergarten/.test(t) ? '술집' : '기타';
  }
  function okRes(r) { return C.okLat(r.lat) && C.okLng(r.lng); }
  function photonSearch(q) {
    var c = center();
    return osmFetch('https://photon.komoot.io/api/?limit=8&q=' + encodeURIComponent(q) + (c ? '&lat=' + C.round6(c.lat) + '&lon=' + C.round6(c.lng) : '')).then(function (j) {
      return ((j && j.features) || []).map(function (f) {
        var p = f.properties || {}, xy = (f.geometry && f.geometry.coordinates) || [], lat = Number(xy[1]), lng = Number(xy[0]);
        var city = p.city || p.district || p.county || '';
        return { name: p.name || [p.street, p.housenumber].filter(Boolean).join(' ') || city, cat: osmCat({ type: p.osm_value }), catLabel: p.osm_value || '',
          addr: [[p.street, p.housenumber].filter(Boolean).join(' '), p.locality, city !== p.district ? p.district : '', city, p.state, p.country].filter(Boolean).join(', '),
          region: [p.state, city].filter(Boolean).join(' '),
          cc: String(p.countrycode || '').toUpperCase(), lat: lat, lng: lng, dist: c ? C.distance(c.lat, c.lng, lat, lng) : null, kakao: '' };
      }).filter(okRes);
    });
  }
  function nominatimSearch(q) {
    return osmFetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&accept-language=ko&q=' + encodeURIComponent(q)).then(function (j) {
      var c = center();
      return (Array.isArray(j) ? j : []).map(function (r) {
        var a = r.address || {}, lat = Number(r.lat), lng = Number(r.lon);
        return { name: r.name || String(r.display_name || '').split(',')[0], cat: osmCat(r), catLabel: r.type || '', addr: r.display_name || '',
          region: [a.state || a.province || a.region, a.city || a.town || a.village || a.county].filter(Boolean).join(' '),
          cc: String(a.country_code || '').toUpperCase(), lat: lat, lng: lng, dist: c ? C.distance(c.lat, c.lng, lat, lng) : null, kakao: '' };
      }).filter(okRes);
    });
  }
  // Photon 이 실패하거나 결과가 없으면 Nominatim (한글 검색어는 Nominatim 이 더 잘 찾음)
  function osmSearch(q) {
    var key = C.norm(q);
    if (OSM.cache[key]) return Promise.resolve(OSM.cache[key]);
    return photonSearch(q).catch(function () { return []; }).then(function (r) {
      return r.length ? r : nominatimSearch(q);
    }).then(function (out) { OSM.cache[key] = out; return out; });
  }
  function osmReverse(lat, lng) {
    return osmFetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=ko&lat=' + lat + '&lon=' + lng).then(function (r) {
      var a = (r && r.address) || {};
      return { addr: (r && r.display_name) || '', region: [a.state || a.province, a.city || a.town || a.village].filter(Boolean).join(' '), cc: String(a.country_code || '').toUpperCase() };
    });
  }
  function inKorea(lat, lng) { return lat > 33 && lat < 38.7 && lng > 124.5 && lng < 131.9; }

  // 좌표 → 주소 (국내는 카카오, 해외는 OSM). 실패해도 등록은 계속
  function reverse(pt) {
    var p = inKorea(pt.lat, pt.lng) ? api('mapSearch', ['', token(), { reverse: true, x: pt.lng, y: pt.lat }]).catch(function () { return osmReverse(pt.lat, pt.lng); }) : osmReverse(pt.lat, pt.lng);
    return p.catch(function () { return { addr: '', region: '', cc: inKorea(pt.lat, pt.lng) ? 'KR' : '' }; });
  }

  /* ================= 등록·수정 창 ================= */
  var E = null;   // 지금 열린 창의 상태

  function needLogin(what) {
    var s = session();
    if (myNick()) return false;
    modal('<div class="mh"><h3>로그인이 필요해요</h3><button type="button" class="ibtn" data-act="mclose" aria-label="닫기">' + ico(I.close) + '</button></div>' +
      '<div class="mb"><p style="margin:0 0 14px">' + esc(what) + '은(는) 카카오로 로그인하고 모임 닉네임을 연결한 회원만 할 수 있어요.</p>' +
      (s ? '<a class="go full" href="' + esc(ROOT) + '">잠만보에서 닉네임 연결하기</a>' : '<button type="button" class="go full" data-act="login">카카오로 로그인</button>') + '</div>');
    return true;
  }

  function modal(html) {
    var m = $('modal');
    m.innerHTML = '<div class="modal-bg" id="mbg"><div class="modal" role="dialog" aria-modal="true">' + html + '</div></div>';
    var first = m.querySelector('input,textarea,button.go');
    if (first && wide()) setTimeout(function () { first.focus(); }, 30);
  }
  function closeModal() { $('modal').innerHTML = ''; }

  // from: {place(수정)} 또는 {name, aliases(모임 장소 표기들)} 또는 {}
  function openEditor(from) {
    if (needLogin('장소 등록')) return;
    from = from || {};
    var p = from.place;
    E = {
      mode: p ? 'edit' : 'add', step: p ? 'form' : 'find', tab: 'kakao', query: from.name || S.q || '', res: { kakao: null, osm: null }, err: '', busy: false,
      data: p ? { id: p.id, name: p.name, cat: p.cat, addr: p.addr, lat: p.lat, lng: p.lng, cc: p.cc, region: p.region, kakao: p.kakao, memo: p.memo, tags: p.tags, vis: p.vis }
              : { name: '', cat: '', addr: '', lat: '', lng: '', cc: '', region: '', kakao: '', memo: '', tags: '', vis: '전체' },
      alias: p ? C.splitList(p.alias, 10, 40) : (from.aliases || []).slice(0, 10),
      dup: null, force: false
    };
    renderEditor();
    if (E.step === 'find' && E.query.length >= 2 && from.name) runSearch();
  }

  function resultHTML(list, src) {
    if (list === null) return '';
    if (!list.length) return '<p class="note">' + (src === 'kakao' ? '국내 검색 결과가 없어요. 해외 장소면 위 \'해외\'를 눌러 보세요.' : '검색 결과가 없어요.') + '</p>';
    var known = {};
    S.places.forEach(function (p) { if (p.kakao) known[p.kakao] = p.id; });
    return '<ul class="res">' + list.map(function (r, i) {
      var cat = C.catOf(r.cat), had = r.kakao && known[r.kakao];
      var label = String(r.catLabel || '').split('>').pop().trim();
      return '<li tabindex="0" data-res="' + i + '"><span class="em" style="background:' + cat.color + '22">' + cat.emoji + '</span>' +
        '<span class="it"><b>' + esc(r.name) + (had ? ' <span class="lock">등록됨</span>' : '') + '</b><small>' + esc([label, r.addr].filter(Boolean).join(' · ')) + '</small></span>' +
        (r.dist != null && isFinite(r.dist) ? '<span class="dist">' + C.fmtDist(r.dist) + '</span>' : '') + '</li>';
    }).join('') + '</ul>' + (src === 'osm' ? '<p class="note">해외 검색: © OpenStreetMap contributors (Photon · Nominatim)</p>' : '');
  }

  function renderEditor() {
    if (!E) return;
    var title = E.mode === 'edit' ? '장소 고치기' : '장소 추가';
    var h = '<div class="mh"><h3>' + title + '</h3><button type="button" class="ibtn" data-act="mclose" aria-label="닫기">' + ico(I.close) + '</button></div><div class="mb">';
    if (E.step === 'find') {
      h += '<div class="lab"><span>어디인가요?</span><small>가게 이름 · 주소</small></div>' +
        '<form class="srow" id="findForm"><input class="inp" id="findQ" type="search" enterkeyhint="search" autocomplete="off" placeholder="예) 범계 더홀릭" value="' + esc(E.query) + '">' +
        '<button type="submit" class="go"' + (E.busy ? ' disabled' : '') + '>' + (E.busy ? '찾는 중' : '검색') + '</button></form>' +
        '<div class="alts"><button type="button" class="sbtn" data-act="pick">' + ico(I.pin) + '지도에서 고르기</button><button type="button" class="sbtn" data-act="here">' + ico(I.gps) + '지금 있는 곳</button></div>' +
        (E.err ? '<div class="err">' + esc(E.err) + '</div>' : '') +
        (E.res.kakao !== null || E.res.osm !== null ? '<div class="stabs" role="tablist"><button type="button" data-tab="kakao" class="' + (E.tab === 'kakao' ? 'on' : '') + '">국내 (카카오)</button><button type="button" data-tab="osm" class="' + (E.tab === 'osm' ? 'on' : '') + '">해외 (OpenStreetMap)</button></div>' +
          resultHTML(E.res[E.tab], E.tab) : '<p class="note">검색하면 국내는 카카오, 해외는 OpenStreetMap 에서 찾아요. 없으면 지도에서 직접 골라 주세요.</p>');
    } else {
      var d = E.data, cat = C.catOf(d.cat || '기타');
      var sugg = C.aliasSuggestions(d.name || '', S.stats.unmatched).map(function (s) { return s.text; });
      E.alias.forEach(function (a) { if (sugg.indexOf(a) < 0) sugg.unshift(a); });
      h += '<div class="picked"><span class="em" style="background:' + cat.color + '22">' + ico(I.pin) + '</span><span class="it"><b>' + esc(d.addr || '주소 없음') + '</b><small>' +
          (isFinite(d.lat) && d.lat !== '' ? Number(d.lat).toFixed(5) + ', ' + Number(d.lng).toFixed(5) : '위치 없음') + '</small></span>' +
          '<button type="button" class="sbtn" data-act="relocate">위치 바꾸기</button></div>' +
        '<div class="lab"><span>이름</span></div><input class="inp" id="fName" maxlength="60" value="' + esc(d.name) + '" placeholder="모임에서 부르는 이름">' +
        '<div class="lab"><span>분류</span></div><div class="cats" id="fCats">' + C.CATS.map(function (c) {
          return '<button type="button" class="chip' + (d.cat === c.id ? ' on' : '') + '" data-fcat="' + esc(c.id) + '">' + c.emoji + ' ' + esc(c.id) + '</button>';
        }).join('') + '</div>' +
        '<div class="lab"><span>모임 기록에 쓰는 다른 이름</span><small>모임 횟수를 셀 때 써요</small></div>' +
        (sugg.length ? '<div class="sugg" id="fSugg">' + sugg.map(function (s) {
          return '<button type="button" class="' + (E.alias.indexOf(s) >= 0 ? 'on' : '') + '" data-alias="' + esc(s) + '">' + esc(s) + '</button>';
        }).join('') + '</div>' : '') +
        '<input class="inp" id="fAlias" style="margin-top:8px" placeholder="직접 추가 (쉼표로 구분)" value="">' +
        '<div class="lab"><span>메모</span><small>선택</small></div><textarea class="inp" id="fMemo" maxlength="300" placeholder="예) 2층, 6인 테이블 예약 필수 · 주차 2시간 무료">' + esc(d.memo) + '</textarea>' +
        '<div class="lab"><span>태그</span><small>선택 · 쉼표로</small></div><input class="inp" id="fTags" maxlength="200" value="' + esc(d.tags) + '" placeholder="예) 주차, 단체석, 늦게까지">' +
        '<div class="lab"><span>누구에게 보일까요?</span></div>' +
        (d.cat === '회원집'   // 회원 집은 늘 회원만 (서버도 같은 규칙 — 공개 사이트에 집 위치가 보이지 않게)
          ? '<div class="seg" id="fVis"><button type="button" class="on" disabled>로그인한 회원만</button></div><p class="note">회원 집은 로그인한 회원에게만 보여요. 정확한 위치 대신 근처(동네)로 찍어도 돼요.</p>'
          : '<div class="seg" id="fVis"><button type="button" data-vis="전체" class="' + (d.vis !== '회원' ? 'on' : '') + '">모두</button><button type="button" data-vis="회원" class="' + (d.vis === '회원' ? 'on' : '') + '">로그인한 회원만</button></div>') +
        (E.dup ? '<div class="dup"><b>이미 비슷한 장소가 있어요</b>' + E.dup.map(function (x) { return '· ' + esc(x.name) + (x.addr ? ' <small>(' + esc(x.addr) + ')</small>' : ''); }).join('<br>') +
          '<div class="row" style="display:flex;gap:8px"><button type="button" class="sbtn" data-act="seedup">기존 장소 보기</button><button type="button" class="sbtn" data-act="force">다른 곳이 맞아요</button></div></div>' : '') +
        (E.err ? '<div class="err">' + esc(E.err) + '</div>' : '') +
        '<div class="foot">' + (E.mode === 'add' ? '<button type="button" class="sbtn" data-act="back">다시 찾기</button>' : '') +
        '<button type="button" class="go" data-act="save"' + (E.busy ? ' disabled' : '') + '>' + (E.busy ? '저장 중…' : E.mode === 'edit' ? '고치기' : '등록하기') + '</button></div>';
    }
    h += '</div>';
    var keep = document.activeElement && document.activeElement.id;
    modal(h);
    if (keep && $(keep)) { var el = $(keep); el.focus(); if (el.setSelectionRange && el.value) { try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {} } }
  }

  // 화면 입력값 → E.data (다시 그리기 전에)
  function readForm() {
    if (!E || E.step !== 'form') return;
    var d = E.data;
    if ($('fName')) d.name = $('fName').value;
    if ($('fMemo')) d.memo = $('fMemo').value;
    if ($('fTags')) d.tags = $('fTags').value;
    if ($('fAlias') && $('fAlias').value.trim()) {
      C.splitList($('fAlias').value, 10, 40).forEach(function (a) { if (E.alias.indexOf(a) < 0) E.alias.push(a); });
      $('fAlias').value = '';
    }
  }

  function runSearch() {
    var q = C.text($('findQ') ? $('findQ').value : E.query);
    E.query = q;
    if (q.length < 2) { E.err = '두 글자 이상 입력해 주세요'; renderEditor(); return; }
    E.busy = true; E.err = ''; renderEditor();
    var c = center();
    var job = E.tab === 'osm' ? osmSearch(q).then(function (r) { E.res.osm = r; })
      : api('mapSearch', [q, token(), { x: C.round6(c.lng), y: C.round6(c.lat) }]).then(function (r) {
          E.res.kakao = r.results || [];
          if (!E.res.kakao.length && /[a-z]{3}/i.test(q)) { E.tab = 'osm'; return osmSearch(q).then(function (o) { E.res.osm = o; }); }   // 영문 검색어인데 국내에 없으면 해외로
        }, function (e) {
          // 카카오가 안 되면(키 없음 · 오늘 한도 초과 등) OpenStreetMap 으로 — 로그인 문제는 그대로 알림
          if (/로그인/.test(e.message)) throw e;
          E.res.kakao = []; E.tab = 'osm';
          return osmSearch(q).then(function (o) { E.res.osm = o; E.err = '카카오 검색이 안 돼서 OpenStreetMap 에서 찾았어요 (' + e.message + ')'; });
        });
    job.catch(function (e) { E.err = e.message; }).then(function () { if (E) { E.busy = false; renderEditor(); } });
  }

  function chooseResult(r) {
    if (r.kakao) {
      var had = S.places.filter(function (p) { return p.kakao === r.kakao; })[0];
      if (had) { closeModal(); E = null; select(had.id, { fly: true }); toast('이미 등록된 장소예요'); return; }
    }
    var d = E.data;
    d.lat = r.lat; d.lng = r.lng; d.addr = r.addr; d.region = r.region || C.regionOf(r.addr); d.cc = r.cc || (r.kakao ? 'KR' : '');
    d.kakao = r.kakao || '';
    if (!d.name || E.mode === 'add') d.name = r.name;
    if (!d.cat || E.mode === 'add') d.cat = r.cat;
    d.vis = C.defaultVis(d.cat);
    E.step = 'form'; E.err = ''; E.dup = null; E.force = false;
    renderEditor();
  }

  function pickOnMap(start) {
    var d = E.data, keep = E;
    closeModal();
    if (!wide()) setSheet('peek');
    var ok = startPick(d.lat === '' ? NaN : Number(d.lat), d.lng === '' ? NaN : Number(d.lng), function (pt) {
      E = keep;
      if (!pt) { renderEditor(); return; }
      d.lat = pt.lat; d.lng = pt.lng; d.kakao = '';   // 직접 고른 위치는 카카오 장소와 연결하지 않음
      E.step = 'form'; E.dup = null; E.force = false;
      if (!d.cat) d.cat = '기타';
      d.addr = '주소 확인 중…';
      renderEditor();
      reverse(pt).then(function (a) {
        if (E !== keep) return;
        readForm();
        d.addr = a.addr || ''; d.region = a.region || ''; d.cc = a.cc || '';
        renderEditor();
      });
    });
    if (!ok) { E = keep; renderEditor(); }
    if (ok && start) map.jumpTo({ center: [start.lng, start.lat], zoom: 17 });
  }

  function useHere() {
    if (!navigator.geolocation) { E.err = '이 기기는 위치를 알려 주지 않아요'; renderEditor(); return; }
    E.busy = true; renderEditor();
    navigator.geolocation.getCurrentPosition(function (pos) {
      E.busy = false;
      pickOnMap({ lat: pos.coords.latitude, lng: pos.coords.longitude });   // 지도에서 살짝 맞추고 확정
    }, function (err) {
      E.busy = false;
      E.err = err.code === 1 ? '위치 권한이 꺼져 있어요. 브라우저 설정에서 허용하거나 지도에서 골라 주세요' : '현재 위치를 확인하지 못했어요';
      renderEditor();
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  }

  function save() {
    readForm();
    var d = E.data;
    var input = { id: d.id, name: d.name, cat: d.cat, addr: d.addr === '주소 확인 중…' ? '' : d.addr, lat: d.lat, lng: d.lng, cc: d.cc, region: d.region,
      kakao: d.kakao, alias: E.alias.join(', '), memo: d.memo, tags: d.tags, vis: d.vis };
    var v = C.validate(input);
    if (!v.ok) { E.err = v.errors.join('\n'); renderEditor(); return; }
    if (!E.force) {
      var dup = C.findDuplicates(v.value, S.places, d.id);
      if (dup.length) { E.dup = dup; E.err = ''; renderEditor(); return; }
    }
    E.busy = true; E.err = ''; renderEditor();
    var keep = E;
    api('mapSave', [input, token(), E.force]).then(function (r) {
      if (E !== keep) return;
      if (r.dup) { E.busy = false; E.dup = C.unpack({ c: C.COLS, r: r.dup }); renderEditor(); return; }
      var p = upsertLocal(r.place);
      closeModal(); E = null;
      toast(keep.mode === 'edit' ? '고쳤어요' : '등록했어요! 🎉');
      if (p) select(p.id, { fly: true });
    }, function (e) {
      if (E !== keep) return;
      E.busy = false; E.err = e.message; renderEditor();
    });
  }

  function onModalClick(e) {
    var t = e.target;
    if (t.id === 'mbg') { if (!E || E.step === 'find' || confirm('입력한 내용을 버리고 닫을까요?')) { closeModal(); E = null; } return; }
    var b = t.closest('[data-act],[data-tab],[data-res],[data-fcat],[data-alias],[data-vis],[data-look],[data-view],[data-poi]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'mclose') { closeModal(); E = null; return; }
    if (act === 'login') { startLogin(); return; }
    if (b.hasAttribute('data-poi')) { setPoi(b.getAttribute('data-poi')); return; }
    if (b.hasAttribute('data-view')) { setView(b.getAttribute('data-view')); return; }
    if (b.hasAttribute('data-look')) { setLook(b.getAttribute('data-look')); refreshLook(); return; }
    if (act === 'lookreset') { look.b = look.s = look.c = 100; applyFx(); setLook('auto'); saveLook(); refreshLook(); return; }
    if (!E) return;
    if (b.hasAttribute('data-tab')) {
      E.tab = b.getAttribute('data-tab');
      if (E.res[E.tab] === null && E.query.length >= 2) runSearch(); else renderEditor();
      return;
    }
    if (b.hasAttribute('data-res')) { var r = E.res[E.tab][Number(b.getAttribute('data-res'))]; if (r) chooseResult(r); return; }
    if (b.hasAttribute('data-fcat')) { readForm(); E.data.cat = b.getAttribute('data-fcat'); if (E.mode === 'add' || E.data.cat === '회원집') E.data.vis = C.defaultVis(E.data.cat); renderEditor(); return; }
    if (b.hasAttribute('data-alias')) { readForm(); var a = b.getAttribute('data-alias'), i = E.alias.indexOf(a); if (i >= 0) E.alias.splice(i, 1); else E.alias.push(a); renderEditor(); return; }
    if (b.hasAttribute('data-vis')) { readForm(); E.data.vis = b.getAttribute('data-vis'); renderEditor(); return; }
    if (act === 'pick') { E.query = $('findQ') ? $('findQ').value : E.query; pickOnMap(); return; }
    if (act === 'relocate') { readForm(); if (E.mode === 'add') { E.step = 'find'; renderEditor(); } else pickOnMap(); return; }
    if (act === 'here') { useHere(); return; }
    if (act === 'back') { readForm(); E.step = 'find'; E.dup = null; renderEditor(); return; }
    if (act === 'force') { readForm(); E.force = true; E.dup = null; save(); return; }
    if (act === 'seedup') { var id = E.dup && E.dup[0] && E.dup[0].id; closeModal(); E = null; if (id) select(id, { fly: true }); return; }
    if (act === 'save') save();
  }

  /* ================= 시작 ================= */
  function bind() {
    $('acct').onclick = onAcct;
    var qd = C.debounce(function () { S.q = C.text($('q').value); apply(); if (mapReady && S.q && S.view.length) fitAll(); }, 160);
    $('q').addEventListener('input', function () { $('qClear').hidden = !$('q').value; qd(); });
    $('q').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('q').blur(); if (S.view[0]) select(S.view[0].id, { fly: true }); }
      if (e.key === 'Escape') { $('q').value = ''; $('qClear').hidden = true; S.q = ''; apply(); }
    });
    $('qClear').onclick = function () { $('q').value = ''; $('qClear').hidden = true; S.q = ''; apply(); $('q').focus(); };
    $('cats').onclick = function (e) { var b = e.target.closest('[data-cat]'); if (!b) return; S.cat = b.getAttribute('data-cat'); apply(); if (mapReady && S.view.length) fitAll(); };
    $('sort').value = S.sort;
    $('sort').onchange = function () { S.sort = this.value; lsSet(LS.sort, S.sort); S.view = filtered(); renderList(); };
    $('list').addEventListener('click', function (e) {
      if (e.target.closest('[data-addq]')) { openEditor({ name: S.q }); return; }
      var li = e.target.closest('.item'); if (li) select(li.getAttribute('data-id'), { fly: true });
    });
    $('list').addEventListener('keydown', function (e) { var li = e.target.closest('.item'); if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(li.getAttribute('data-id'), { fly: true }); } });
    $('detail').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'), p = S.byId[S.sel];
      if (b && S.poi && b.getAttribute('data-act') === 'poiadd') { openEditor({ name: S.poi.name }); return; }
      if (!b || !p) return;
      var a = b.getAttribute('data-act');
      if (a === 'close') select('');
      else if (a === 'copy') copyText(p.addr, '주소를 복사했어요');
      else if (a === 'share') share(p);
      else if (a === 'edit') openEditor({ place: p });
      else if (a === 'hide') hidePlace(p);
    });
    $('todoList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-todo]'), g = b && $('todo')._list[Number(b.getAttribute('data-todo'))];
      if (g) openEditor({ name: g.name, aliases: g.variants });
    });
    $('fab').onclick = function () { openEditor({}); };
    $('selBack').onclick = function () { select(''); };
    $('modal').addEventListener('click', onModalClick);
    $('modal').addEventListener('input', onFxInput);
    applyFx();
    $('modal').addEventListener('submit', function (e) { if (e.target.id === 'findForm') { e.preventDefault(); runSearch(); } });
    $('pickOk').onclick = function () { endPick(true); };
    $('pickCancel').onclick = function () { endPick(false); };
    $('mapRetry').onclick = function () { destroyMap(); styleNo = 0; STYLE = STYLES[0]; loadMapLib(); };
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (picking) endPick(false);
      else if ($('modal').innerHTML) { closeModal(); E = null; }
      else if (S.sel) select('');
    });
    window.addEventListener('hashchange', openFromHash);
    window.addEventListener('storage', function (e) {   // 다른 탭에서 로그인·잠만보 데이터가 바뀌면
      if (e.key === LS.auth) { renderAcct(); S.ver = ''; refresh(); }
      if (e.key === LS.data) { computeStats(); apply(); }
    });
    // PC: 목록 패널은 검색 줄·분류 칩 바로 아래부터 (칩이 그려지거나 줄바꿈되면 높이가 바뀜)
    var toph = function () { document.documentElement.style.setProperty('--toph', $('top').offsetHeight + 'px'); };
    if (window.ResizeObserver) new ResizeObserver(toph).observe($('top'));
    else window.addEventListener('resize', C.debounce(toph, 150));
    toph();
    bindSheet();
    setSheet(S.sheet);
  }

  function start() {
    if (/[?&]reset\b/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash);   // 미니게임 메뉴 링크의 ?reset 정리
    if (ENV !== 'prod') { var b = document.createElement('div'); b.className = 'env'; b.textContent = 'TEST · ' + ENV; document.body.appendChild(b); }
    $('homeLink').href = ROOT;
    bind();
    renderAcct();
    if (!loadCached()) apply();
    refresh();
    // 목록을 먼저 그린 뒤 지도 프로그램 받기
    (window.requestIdleCallback || function (f) { setTimeout(f, 30); })(loadMapLib);
  }

  window.JMB_MAP = { ver: VER, get state() { return S; }, get map() { return map; } };   // 콘솔 점검용
  start();
})();
