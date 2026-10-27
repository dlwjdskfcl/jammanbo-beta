/* 잠만보 장소 지도 — 공통 계산 (지도·화면에 의존하지 않음)
 * 브라우저(window.MAPCORE)와 Node 테스트(module.exports)에서 같이 씁니다.
 * 서버(Map.js)도 같은 규칙으로 다시 검증합니다 — 여기 규칙을 바꾸면 Map.js 의 validate 도 같이 바꾸기.
 */
(function (root) {
  'use strict';

  // 분류: 이름 · 이모지 · 색 (지도 점·목록 칩에 같은 색)
  var CATS = [
    { id: '보드게임카페', emoji: '🎲', color: '#3b5bdb' },
    { id: '아지트', emoji: '🏠', color: '#7048e8' },
    { id: '회원집', emoji: '🛋️', color: '#d6336c' },
    { id: '식당', emoji: '🍚', color: '#f76707' },
    { id: '술집', emoji: '🍺', color: '#e8a400' },
    { id: '카페', emoji: '☕', color: '#0ca678' },
    { id: '방탈출', emoji: '🚪', color: '#1098ad' },
    { id: '기타', emoji: '📍', color: '#868e96' }
  ];
  var CAT = {};
  CATS.forEach(function (c) { CAT[c.id] = c; });
  function catOf(id) { return CAT[id] || CAT['기타']; }

  // 회원집은 기본 '회원만' 공개 (공개 사이트에 집 위치가 보이지 않게)
  function defaultVis(cat) { return cat === '회원집' ? '회원' : '전체'; }

  // 서버 응답 열 이름 (Map.js 의 PUB_COLS 와 같게)
  var COLS = ['id', 'name', 'cat', 'addr', 'lat', 'lng', 'cc', 'region', 'kakao', 'alias', 'memo', 'tags', 'vis', 'by', 'at', 'eat'];

  /* ---------- 글자 ---------- */
  function text(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim(); }

  // 이름 비교용: 괄호 안·공백·기호를 빼고 소문자 ("태초마을(인덕원)" → "태초마을", "범계 더 홀릭" → "범계더홀릭")
  function norm(s) {
    return text(s).replace(/\([^)]*\)|\[[^\]]*\]/g, '').toLowerCase().replace(/[^0-9a-z가-힣ㄱ-ㅎ]/g, '');
  }

  function splitList(s, max, len) {
    var seen = {}, out = [];
    (Array.isArray(s) ? s : String(s || '').split(/[,，\n#]/)).forEach(function (x) {
      var v = text(x).slice(0, len || 40), k = v.toLowerCase();
      if (v && !seen[k]) { seen[k] = true; out.push(v); }
    });
    return out.slice(0, max || 10);
  }

  // 초성 검색: 'ㄷㅎㄹ' → '더홀릭'
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function chosung(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i) - 0xac00;
      out += c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : s[i];
    }
    return out;
  }
  function isChoQuery(q) { return /^[ㄱ-ㅎ]+$/.test(q); }

  // 검색어가 장소에 맞는지 (이름·별칭·주소·지역·메모·태그, 초성 가능)
  function matches(p, q) {
    if (!q) return true;
    var hay = norm([p.name, p.alias, p.addr, p.region, p.memo, p.tags, p.cat].join(' '));
    var nq = norm(q);
    if (!nq) return true;
    if (hay.indexOf(nq) >= 0) return true;
    return isChoQuery(nq) && chosung(norm(p.name + ' ' + p.alias)).indexOf(nq) >= 0;
  }

  // 글자 두 개씩 묶어 비교한 닮은 정도 0~1 (별칭 추천용)
  function bigrams(s) { var a = []; for (var i = 0; i < s.length - 1; i++) a.push(s.slice(i, i + 2)); return a; }
  function similarity(a, b) {
    a = norm(a); b = norm(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    var A = bigrams(a), B = bigrams(b).slice(), hit = 0;
    A.forEach(function (g) { var i = B.indexOf(g); if (i >= 0) { hit++; B.splice(i, 1); } });
    return (2 * hit) / (A.length + bigrams(b).length);
  }

  /* ---------- 좌표 ---------- */
  function okLat(v) { return typeof v === 'number' && isFinite(v) && v >= -90 && v <= 90; }
  function okLng(v) { return typeof v === 'number' && isFinite(v) && v >= -180 && v <= 180; }
  function round6(v) { return Math.round(v * 1e6) / 1e6; }
  function wrapLng(lng) { return ((lng + 180) % 360 + 360) % 360 - 180; }

  function distance(lat1, lng1, lat2, lng2) {
    var R = 6371000, d = Math.PI / 180;
    var x = Math.sin((lat2 - lat1) * d / 2), y = Math.sin((lng2 - lng1) * d / 2);
    return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(lat1 * d) * Math.cos(lat2 * d) * y * y));
  }
  function fmtDist(m) { return m < 1000 ? Math.round(m / 10) * 10 + 'm' : (m < 10000 ? (m / 1000).toFixed(1) : Math.round(m / 1000)) + 'km'; }

  // 앱 데이터 → GeoJSON 은 이 함수 하나만 (GeoJSON 은 [경도, 위도])
  function toFeature(p) {
    return { type: 'Feature', id: p.n, geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { id: p.id, name: p.name, cat: catOf(p.cat).id, color: catOf(p.cat).color } };
  }
  function toGeoJSON(list) { return { type: 'FeatureCollection', features: list.map(toFeature) }; }

  /* ---------- 서버 데이터 ---------- */
  // {c:[열], r:[[값]]} → [{…}] (숫자 좌표, 화면용 번호 n)
  function unpack(t) {
    if (!t || !t.c || !t.r) return [];
    return t.r.map(function (row, i) {
      var o = { n: i + 1 };
      t.c.forEach(function (c, j) { o[c] = row[j] == null ? '' : row[j]; });
      o.lat = Number(o.lat); o.lng = Number(o.lng);
      return o;
    }).filter(function (o) { return o.id && okLat(o.lat) && okLng(o.lng); });
  }

  // 카카오 장소 분류("음식점 > 술집 > 호프") → 우리 분류
  function fromKakaoCat(s) {
    s = String(s || '');
    if (/보드/.test(s)) return '보드게임카페';
    if (/방탈출/.test(s)) return '방탈출';
    if (/술집|호프|주점|포차/.test(s)) return '술집';
    if (/카페|디저트|제과/.test(s)) return '카페';
    if (/음식점/.test(s)) return '식당';
    return '기타';
  }

  // 지번주소 "경기 안양시 동안구 호계동 1039" → "경기 안양시"
  function regionOf(addr) { return text(addr).split(' ').slice(0, 2).join(' '); }
  // 목록용 짧은 주소: 앞의 지역(시·도 시·군)을 뺌 "경기 안양시 동안구 평촌대로 36" → "동안구 평촌대로 36"
  function shortAddr(addr, region) {
    var a = text(addr), r = text(region) || regionOf(a);
    return r && a.indexOf(r + ' ') === 0 ? a.slice(r.length + 1) : a;
  }

  /* ---------- 입력 확인 (서버 Map.js 에서 같은 규칙으로 다시 확인) ---------- */
  var BAD = /^(__proto__|constructor|prototype|hasOwnProperty|toString|valueOf)$/;
  function validate(input) {
    var e = [], v = {};
    v.name = text(input.name).slice(0, 61);
    if (!v.name) e.push('장소 이름을 입력해 주세요');
    else if (v.name.length > 60) e.push('장소 이름은 60자까지예요');
    else if (BAD.test(v.name)) e.push('쓸 수 없는 이름이에요');
    v.cat = CAT[input.cat] ? input.cat : '';
    if (!v.cat) e.push('분류를 골라 주세요');
    v.lat = Number(input.lat); v.lng = Number(input.lng);
    if (input.lat === '' || input.lat == null || input.lng === '' || input.lng == null || !okLat(v.lat) || !okLng(v.lng)) e.push('위치를 정해 주세요');
    else { v.lat = round6(v.lat); v.lng = round6(v.lng); }
    v.addr = text(input.addr).slice(0, 200);
    v.cc = text(input.cc).toUpperCase();
    if (v.cc && !/^[A-Z]{2}$/.test(v.cc)) v.cc = '';
    v.region = text(input.region).slice(0, 60);
    v.kakao = /^\d{1,20}$/.test(text(input.kakao)) ? text(input.kakao) : '';
    v.alias = splitList(input.alias, 10, 40).filter(function (a) { return norm(a) !== norm(v.name); }).join(', ');
    v.memo = text(input.memo).slice(0, 300);
    v.tags = splitList(input.tags, 10, 20).join(', ');
    v.vis = input.vis === '회원' || v.cat === '회원집' ? '회원' : '전체';   // 회원집은 늘 회원만 (서버도 같은 규칙)
    return e.length ? { ok: false, errors: e } : { ok: true, value: v };
  }

  // 이미 있는 장소인지: 같은 카카오 장소, 또는 80m 안에서 이름이 비슷
  function findDuplicates(cand, list, exceptId) {
    return list.filter(function (p) {
      if (p.id === exceptId) return false;
      if (cand.kakao && p.kakao && cand.kakao === p.kakao) return true;
      var d = distance(cand.lat, cand.lng, p.lat, p.lng);
      return d <= 80 && (similarity(cand.name, p.name) >= 0.5 || d <= 15);
    });
  }

  /* ---------- 모임 기록 연결 (잠만보 앱이 기기에 저장해 둔 jmb_data_v2 를 읽기만 함) ---------- */
  var NOT_PLACE = /^(온라인|협의|미정|x|없음|무작위총력전|등)$/;

  // 장소 칸 "양은이네\n인쌩맥주\n등" 처럼 여러 곳이 들어 있을 수 있음
  function placeNames(s) {
    return String(s || '').split(/[\n,，/]/).map(function (x) { return text(x).replace(/\s*등$/, ''); })
      .filter(function (x) { return x && !NOT_PLACE.test(norm(x)); });
  }

  // meetings: {c, r} (잠만보 데이터의 meetings). 장소별 모임 횟수·마지막 날짜 + 지도에 없는 장소 묶음
  function meetingStats(meetings, places) {
    var idx = {};
    places.forEach(function (p) {
      [p.name].concat(splitList(p.alias, 10, 40)).forEach(function (n) { var k = norm(n); if (k && !idx[k]) idx[k] = p.id; });
    });
    var byId = {}, miss = {};
    if (!meetings || !meetings.c || !meetings.r) return { byId: byId, unmatched: [] };
    var iP = meetings.c.indexOf('place'), iD = meetings.c.indexOf('date');
    if (iP < 0) return { byId: byId, unmatched: [] };
    meetings.r.forEach(function (row) {
      var date = iD >= 0 ? String(row[iD] || '').slice(0, 10) : '';
      placeNames(row[iP]).forEach(function (name) {
        var k = norm(name);
        if (!k) return;
        var id = idx[k], o;
        if (id) o = byId[id] || (byId[id] = { count: 0, last: '' });
        else {
          o = miss[k] || (miss[k] = { key: k, count: 0, last: '', spell: {} });
          o.spell[name] = (o.spell[name] || 0) + 1;
        }
        o.count++;
        if (date > o.last) o.last = date;
      });
    });
    // 지도에 없는 장소: 비슷한 표기끼리 묶어서(예: 범계 더홀릭 · 범계더홀릭 · 범계 더 홀릭) 많이 간 순
    var groups = [];
    Object.keys(miss).map(function (k) { return miss[k]; }).sort(function (a, b) { return b.count - a.count; }).forEach(function (m) {
      var g = null;
      for (var i = 0; i < groups.length && !g; i++) if (similarity(groups[i].key, m.key) >= 0.75) g = groups[i];
      if (!g) { g = { key: m.key, count: 0, last: '', spell: {} }; groups.push(g); }
      g.count += m.count;
      if (m.last > g.last) g.last = m.last;
      Object.keys(m.spell).forEach(function (s) { g.spell[s] = (g.spell[s] || 0) + m.spell[s]; });
    });
    var unmatched = groups.map(function (g) {
      var names = Object.keys(g.spell).sort(function (a, b) { return g.spell[b] - g.spell[a]; });
      return { name: names[0], variants: names, count: g.count, last: g.last };
    }).sort(function (a, b) { return b.count - a.count; });
    return { byId: byId, unmatched: unmatched };
  }

  // 새 장소 이름과 비슷한 '지도에 없는 모임 장소' 표기들 → 별칭 추천
  function aliasSuggestions(name, unmatched) {
    var out = [];
    unmatched.forEach(function (g) {
      g.variants.forEach(function (v) {
        var s = similarity(name, v), nv = norm(v), nn = norm(name);
        if (s >= 0.5 || (nv.length >= 3 && nn.indexOf(nv) >= 0)) out.push({ text: v, score: s, count: g.count });
      });
    });
    var seen = {};
    return out.sort(function (a, b) { return b.score - a.score; })
      .filter(function (o) { var k = norm(o.text); if (seen[k] || k === norm(name)) return false; seen[k] = true; return true; })
      .slice(0, 8);
  }

  /* ---------- 외부 지도 링크 (공식 문서로 확인된 형식만) ----------
   * 카카오맵: map.kakao.com/link/map/<장소ID> (지도 화면에 그 장소) · /link/map/이름,위도,경도 · /link/to/이름,위도,경도 (카카오맵 URL 공식 안내)
   *          place.map.kakao.com/<장소ID> 는 정보 화면만 떠서 안 씀 · /link/to/<장소ID> 는 엉뚱한 곳이 떠서 안 씀 (2026-10-27 확인)
   * 구글 지도: Maps URLs — /maps/search/?api=1&query= · /maps/dir/?api=1&destination=
   * 네이버지도: 웹 검색 주소 (공식 문서 확인 전 — 검색만)
   * 국내 네이버·구글은 주소로 검색 — 이름은 모임에서 부르는 이름(예: 태초마을)일 수 있어 그 지도에서 못 찾음.
   *   주소가 없을 때만 이름+지역 (지도 위 시설처럼 진짜 가게 이름일 때)
   */
  var LINK_HOSTS = ['place.map.kakao.com', 'map.kakao.com', 'map.naver.com', 'www.google.com'];
  function safeUrl(u) {
    try { var x = new URL(u); return x.protocol === 'https:' && LINK_HOSTS.indexOf(x.hostname) >= 0; } catch (e) { return false; }
  }
  function links(p) {
    var nm = encodeURIComponent(text(p.name).replace(/,/g, ' ')), ll = p.lat + ',' + p.lng, out = [];
    var kr = p.cc === 'KR' || (!p.cc && p.lat > 33 && p.lat < 39 && p.lng > 124 && p.lng < 132);
    if (kr) {
      var q = encodeURIComponent(text(p.addr) || text(p.name + ' ' + (p.region || '')));
      out.push({ id: 'kakao', label: '카카오맵', url: 'https://map.kakao.com/link/map/' + (/^\d+$/.test(p.kakao || '') ? p.kakao : nm + ',' + ll) });
      out.push({ id: 'route', label: '길찾기', url: 'https://map.kakao.com/link/to/' + nm + ',' + ll });
      out.push({ id: 'naver', label: '네이버지도', url: 'https://map.naver.com/p/search/' + q });
      out.push({ id: 'google', label: '구글 지도', url: 'https://www.google.com/maps/search/?api=1&query=' + q });
    } else {
      out.push({ id: 'google', label: '구글 지도', url: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(ll) });
      out.push({ id: 'route', label: '길찾기', url: 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(ll) });
    }
    return out.filter(function (l) { return safeUrl(l.url); });
  }

  function debounce(fn, ms) {
    var t;
    return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); };
  }

  var API = {
    CATS: CATS, COLS: COLS, catOf: catOf, defaultVis: defaultVis,
    text: text, norm: norm, splitList: splitList, chosung: chosung, matches: matches, similarity: similarity,
    okLat: okLat, okLng: okLng, round6: round6, wrapLng: wrapLng, distance: distance, fmtDist: fmtDist,
    toFeature: toFeature, toGeoJSON: toGeoJSON, unpack: unpack, fromKakaoCat: fromKakaoCat, regionOf: regionOf, shortAddr: shortAddr,
    validate: validate, findDuplicates: findDuplicates,
    placeNames: placeNames, meetingStats: meetingStats, aliasSuggestions: aliasSuggestions,
    safeUrl: safeUrl, links: links, debounce: debounce
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.MAPCORE = API;
})(this);
