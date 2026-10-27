/*! 잠만보 계정 모듈 v1.1.0 — 로그인(카카오 · 운영진) · 닉네임 연결 · 운영진 연동 관리
 *
 * 앱 화면(Apps Script Index.html)이 열린 뒤 시작 페이지(index.html)가 이 파일을 끼워 넣습니다.
 * 앱 코드를 고치지 않고 다음 전역만 사용합니다:
 *   #btnAdmin(우측 상단 버튼) · render() · openModal()/closeModal() · toast() · api() · load()
 *   ADMIN_PW · UI.me · D.byName · openLogin() · lsSet()
 * 어느 하나라도 없으면 그 기능만 조용히 건너뜁니다(앱은 그대로 동작).
 *
 * window.JMB_AUTH: { user(), nickname(), isAdmin(), token(), login(force), logout(), onChange(fn), open(), manageLinks() }
 * window 이벤트 'jmb:auth' (detail = user | null)
 *
 * v1.1: 운영진 → 내 계정 → "카카오 연동 관리"에서 회원별 연결 해제
 */
(function () {
  'use strict';
  var cfg = window.JMB_CONFIG;
  if (!cfg || !cfg.kakaoApi || window.JMB_AUTH) return;

  var STORE = cfg.storeKey || 'jmb_kakao_v2';
  var MSG = cfg.msgKey || 'jmb_kakao_msg';
  var LS_ME = 'jamanbo_me';           // 앱이 "나"를 기억하는 키
  var session = readSession();        // { token, user, fresh }
  var listeners = [];
  var link = null;                    // 닉네임 연결 창 상태
  var mgr = null;                     // 운영진 연동 관리 창 상태
  var hdrHandler = null;
  var obs = null;

  /* ---------- 저장소 / 통신 ---------- */
  function readSession() { try { var s = JSON.parse(localStorage.getItem(STORE) || 'null'); return s && s.token ? s : null; } catch (e) { return null; } }
  function writeSession() { try { if (session) localStorage.setItem(STORE, JSON.stringify(session)); else localStorage.removeItem(STORE); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function fn(name) { return typeof window[name] === 'function' ? window[name] : null; }

  function call(name, args) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 20000) : 0;
    return fetch(cfg.kakaoApi, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: name, args: args || [] }), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (j) { clearTimeout(timer); if (!j || !j.ok) throw new Error((j && j.e) || '알 수 없는 오류'); return j.r; },
            function (e) { clearTimeout(timer); throw new Error(e && e.name === 'AbortError' ? '응답이 너무 늦어요. 잠시 후 다시 시도해 주세요.' : '인터넷 연결을 확인해 주세요.'); });
  }

  /* ---------- 추가 스타일 (v1.1 연동 관리 목록) ---------- */
  (function css() {
    if ($('jmbCss11')) return;
    var st = document.createElement('style'); st.id = 'jmbCss11';
    st.textContent =
      '.jmb-mg{display:flex;flex-direction:column;gap:6px;max-height:55vh;overflow:auto;margin:8px 0}' +
      '.jmb-mg-row{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--line,#e3e6ee);border-radius:10px}' +
      '.jmb-mg-row .who{flex:1;min-width:0}' +
      '.jmb-mg-row .who b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.jmb-mg-row .who small{display:block;color:var(--muted,#7c8496);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.jmb-mg-row .tag{font-size:11px;padding:1px 6px;border-radius:6px;background:var(--warn-soft,#fdf1e1);color:var(--warn,#b45309);margin-left:4px}' +
      '.jmb-mg-row button{flex:none}';
    document.head.appendChild(st);
  })();

  /* ---------- 앱 도우미 (앱 함수가 없으면 대체) ---------- */
  function say(msg) {
    var t = fn('toast');
    if (t) return t(msg);
    var el = $('jmbToast'); if (!el) { el = document.createElement('div'); el.id = 'jmbToast'; el.className = 'jmb-toast'; document.body.appendChild(el); }
    el.textContent = msg; el.style.display = 'block'; clearTimeout(say._t); say._t = setTimeout(function () { el.style.display = 'none'; }, 2600);
  }

  function showModal(html) {
    var open = fn('openModal');
    if (open) { open(html); return $('modal'); }
    var ov = $('jmbOv');               // 앱 모달이 없을 때의 대체 창
    if (!ov) { ov = document.createElement('div'); ov.id = 'jmbOv'; ov.className = 'jmb-ov'; ov.innerHTML = '<div class="jmb-box" id="jmbBox"></div>'; document.body.appendChild(ov); ov.onclick = function (e) { if (e.target === ov) hideModal(); }; }
    $('jmbBox').innerHTML = html; ov.style.display = 'flex';
    [].forEach.call($('jmbBox').querySelectorAll('[data-close]'), function (b) { b.onclick = hideModal; });
    return $('jmbBox');
  }
  function hideModal() { var c = fn('closeModal'); if (c) c(); var ov = $('jmbOv'); if (ov) ov.style.display = 'none'; }
  function isModalOpen() { var bg = $('modalBg'); return !!(bg && bg.classList.contains('on')) || !!($('jmbOv') && $('jmbOv').style.display !== 'none'); }

  /* ---------- 상태 ---------- */
  function user() { return session ? session.user : null; }
  function isAdmin() { return !!window.ADMIN_PW; }
  function changed() {
    paintHeader();
    listeners.forEach(function (f) { try { f(user()); } catch (e) {} });
    try { window.dispatchEvent(new CustomEvent('jmb:auth', { detail: user() })); } catch (e) {}
  }
  function mergeUser(u) { u.image = u.image || (user() && user().image) || ''; return u; }

  /* ---------- 카카오 계정 운영진 ----------
   * 서버 설정 '운영진계정'에 있는 닉네임으로 로그인하면 user.admin = true → 비밀번호 대신 'kk.' + 토큰을 ADMIN_PW 로 씀
   * (서버가 요청마다 토큰·목록을 다시 확인). '운영진 모드 끄기'를 누르면 이번 접속 동안은 끔 */
  var KK = 'kk.';
  function kkOff() { try { return sessionStorage.getItem('jmb_kk_off') === '1'; } catch (e) { return false; } }
  function setKkOff(v) { try { if (v) sessionStorage.setItem('jmb_kk_off', '1'); else sessionStorage.removeItem('jmb_kk_off'); } catch (e) {} }
  function isKkAdmin() { return typeof window.ADMIN_PW === 'string' && window.ADMIN_PW.indexOf(KK) === 0; }
  function reloadApp(msg) { var ld = fn('load'); (ld ? ld() : Promise.resolve()).then(function () { changed(); if (msg) say(msg); }, function () { changed(); }); }
  function syncAdmin() {
    var u = user(), want = !!(session && u && u.admin && !kkOff());
    if (want && !window.ADMIN_PW) { window.ADMIN_PW = KK + session.token; reloadApp('운영진 계정으로 로그인했어요 · 운영진 모드'); }
    else if (want && isKkAdmin()) window.ADMIN_PW = KK + session.token;   // 토큰이 바뀐 경우
    else if (!want && isKkAdmin()) { window.ADMIN_PW = null; reloadApp(''); }
  }
  function expire(silent) { session = null; writeSession(); changed(); if (!silent) say('로그인이 만료됐어요. 다시 로그인해 주세요.'); }

  /* ---------- 우측 상단 버튼 ---------- */
  function avatar(u) { return u && u.image ? '<img class="jmb-av" src="' + esc(u.image) + '" alt="" referrerpolicy="no-referrer">' : '<span class="jmb-av jmb-av0" aria-hidden="true"></span>'; }

  function paintHeader() {
    var b = $('btnAdmin'); if (!b) return;
    var u = user(), admin = isAdmin(), sig, html;
    if (u && u.nickname) { sig = 'n|' + u.nickname + '|' + (u.image || '') + '|' + admin; html = avatar(u) + '<span class="jmb-nm">' + esc(u.nickname) + '</span>' + (admin ? '<span class="jmb-ck">운영진</span>' : ''); }
    else if (u) { sig = 'l|' + admin; html = avatar(u) + '<span class="jmb-nm">닉네임 연결</span>'; }
    else { sig = 'o|' + admin; html = admin ? '운영진 ✓' : '로그인'; }
    var w = b.firstElementChild;
    if (!(w && w.className === 'jmb-w' && w.getAttribute('data-sig') === sig)) {  // 앱이 글자를 덮어썼거나 상태가 바뀐 경우에만 다시 그림
      b.innerHTML = '<span class="jmb-w" data-sig="' + esc(sig) + '">' + html + '</span>';
    }
    b.classList.toggle('primary', admin);
    b.classList.toggle('jmb-in', !!u);
    b.classList.add('jmb-hbtn');
    b.setAttribute('aria-label', u && u.nickname ? '내 계정 (' + u.nickname + ')' : '로그인');
    if (b.onclick !== hdrHandler) b.onclick = hdrHandler;
  }

  function observeHeader() {
    var b = $('btnAdmin'); if (!b || obs || typeof MutationObserver !== 'function') return;
    obs = new MutationObserver(function () { paintHeader(); });
    obs.observe(b, { childList: true });
  }

  /* ---------- 앱 데이터와 연결 ---------- */
  function syncMe() {                 // 로그인한 닉네임 = 앱의 "나" (내 기록 · 업적 등에 그대로 반영)
    var u = user(); if (!u || !u.nickname) return;
    var D = window.D, UI = window.UI;
    if (!D || !D.byName || !D.byName[u.nickname] || !UI || UI.me === u.nickname) return;
    UI.me = u.nickname;
    var set = fn('lsSet'); if (set) set(LS_ME, u.nickname); else { try { localStorage.setItem(LS_ME, u.nickname); } catch (e) {} }
    var r = fn('render'); if (r) r();
  }
  function afterRender() { paintHeader(); syncMe(); }
  function hookRender() {
    var o = window.render;
    if (typeof o !== 'function' || o.__jmb) return;
    var w = function () { var r = o.apply(this, arguments); try { afterRender(); } catch (e) {} return r; };
    w.__jmb = true; window.render = w;
  }

  /* ---------- 카카오 ---------- */
  function startKakao(force) {
    var st; try { st = [].slice.call(crypto.getRandomValues(new Uint32Array(4))).join(''); } catch (e) { st = String(Math.random()).slice(2) + Date.now(); }
    try { localStorage.setItem(cfg.stateKey || 'jmb_kakao_state', JSON.stringify({ s: st, t: Date.now() })); } catch (e) {}
    location.href = 'https://kauth.kakao.com/oauth/authorize?client_id=' + encodeURIComponent(cfg.kakaoRestKey) +
      '&redirect_uri=' + encodeURIComponent(cfg.redirect) + '&response_type=code&state=' + encodeURIComponent(st) + (force ? '&prompt=login' : '');
  }
  var KAKAO_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3C6.48 3 2 6.58 2 11c0 2.84 1.87 5.33 4.69 6.75l-.95 3.5a.4.4 0 0 0 .6.44l4.1-2.72c.51.07 1.03.1 1.56.1 5.52 0 10-3.58 10-8S17.52 3 12 3Z"/></svg>';

  /* ---------- 화면: 로그인 ---------- */
  function viewLogin() {
    showModal(
      '<h3>로그인<button class="btn sm x" data-close>닫기</button></h3>' +
      '<div class="jmb-login">' +
      '<button class="jmb-kakao" id="jmbKakao">' + KAKAO_SVG + '<span>카카오 로그인</span></button>' +
      '<p class="jmb-hint">로그인하면 내 닉네임으로 게임 기록·방명록 등을 남길 수 있어요. (로그인 없이는 보기만 · 익명 글만 가능)</p>' +
      '<div class="jmb-or"><span>또는</span></div>' +
      '<button class="btn jmb-wide" id="jmbAdminToggle" aria-expanded="false">운영진 로그인</button>' +
      '<form class="jmb-admin" id="jmbAdminBox" hidden>' +
      '<input class="input" type="password" id="jmbPw" placeholder="운영진 비밀번호" autocomplete="current-password" style="width:100%">' +
      '<div class="actions"><button class="btn primary" id="jmbPwGo" type="submit">확인</button></div></form>' +
      '<div class="jmb-more"><button class="jmb-link" id="jmbKakaoAgain" type="button">다른 카카오 계정으로 로그인</button></div>' +
      '</div>' + verLine());
    $('jmbKakao').onclick = function () { startKakao(false); };
    $('jmbKakaoAgain').onclick = function () { startKakao(true); };
    var box = $('jmbAdminBox'), tg = $('jmbAdminToggle');
    tg.onclick = function () { var open = box.hidden; box.hidden = !open; tg.setAttribute('aria-expanded', String(open)); if (open) $('jmbPw').focus(); };
    box.onsubmit = function (e) { e.preventDefault(); adminLogin($('jmbPw').value, $('jmbPwGo')); };
  }

  function adminLogin(pw, btn) {
    if (!pw) return say('비밀번호를 입력해 주세요');
    var api = fn('api'), ld = fn('load');
    if (!api || !ld) { var ol = fn('openLogin'); if (ol) { hideModal(); ol(); } return; }  // 앱 함수가 없으면 기존 운영진 로그인 창으로
    if (btn) btn.disabled = true;
    api('checkAdmin', pw).then(function (ok) {
      if (!ok) { if (btn) btn.disabled = false; return say('비밀번호가 맞지 않아요'); }
      window.ADMIN_PW = pw; hideModal(); paintHeader();
      return ld().then(function () { say('운영진 모드: 등록·수정이 가능해요'); changed(); });
    }).catch(function (e) { if (btn) btn.disabled = false; say(String(e && e.message || e)); });
  }

  /* ---------- 버전 표시 (계정 창 아래) ----------
   * 시작 페이지 = GitHub 파일(config.js 의 version·date), 앱 = Apps Script 배포 버전(데이터의 app.ver·date) */
  function verLine() {
    var cfg = window.JMB_CONFIG || {}, d = window.D, app = d && d.app;
    var env = cfg.env && cfg.env !== 'prod' ? ' · <b style="color:#e11d48">' + esc(String(cfg.env).toUpperCase()) + '</b>' : '';
    return '<div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--line,#e5e8ee);font-size:12px;color:var(--muted,#8b95a1);line-height:1.7;text-align:center">' +
      '앱 ' + (app ? 'v' + esc(app.ver) + (app.date ? ' · ' + esc(app.date) : '') : '확인 중') +
      ' &nbsp;|&nbsp; 시작 페이지 v' + esc(cfg.version || '?') + (cfg.date ? ' · ' + esc(cfg.date) : '') + env + '</div>';
  }

  /* ---------- 화면: 내 계정 ---------- */
  function viewAccount() {
    var u = user(), admin = isAdmin(), h = '<h3>내 계정<button class="btn sm x" data-close>닫기</button></h3>';
    if (u && u.nickname) {
      h += '<div class="jmb-prof">' + avatar(u) + '<div><b>' + esc(u.nickname) + '</b><small>카카오 연동됨' + (u.grade ? ' · ' + esc(u.grade) + '회원' : '') + (u.kakaoNick ? ' · ' + esc(u.kakaoNick) : '') + '</small></div></div>';
    } else {
      h += '<div class="jmb-prof"><span class="jmb-av jmb-av0 big" aria-hidden="true"></span><div><b>운영진</b><small>카카오 계정은 로그인하지 않았어요</small></div></div>';
    }
    h += '<div class="jmb-list">';
    if (admin) h += '<span class="badge b-good">운영진 모드' + (isKkAdmin() ? ' · 카카오 계정' : '') + '</span>';
    h += '</div><div class="jmb-menu">';
    if (u && u.nickname && typeof window.openMine === 'function') h += '<button class="btn primary jmb-wide" id="jmbMine">🙋 나의 잠만보</button>';   // 화면 코드(Index.html)의 내 기록 창
    if (admin) h += '<button class="btn jmb-wide" id="jmbAdminMenu">운영진 메뉴</button><button class="btn jmb-wide" id="jmbLinkMgr">카카오 연동 관리</button><button class="btn jmb-wide" id="jmbAdminOut">' + (isKkAdmin() ? '운영진 모드 끄기 (이번 접속)' : '운영진 로그아웃') + '</button>';
    else if (u && u.admin) h += '<button class="btn jmb-wide" id="jmbKkOn">운영진 모드 켜기</button>';   // 운영진 계정인데 꺼 둔 경우
    else h += '<button class="btn jmb-wide" id="jmbAdminIn">운영진 로그인</button>';
    if (u) h += '<button class="btn jmb-wide" id="jmbOut">카카오 로그아웃</button><button class="jmb-link danger" id="jmbUnlink">닉네임 연결 해제</button>';
    else h += '<button class="jmb-kakao" id="jmbKakao">' + KAKAO_SVG + '<span>카카오 로그인</span></button>';
    h += '</div>' + verLine();
    showModal(h);
    var on = function (id, f) { var el = $(id); if (el) el.onclick = f; };
    on('jmbKakao', function () { startKakao(false); });
    on('jmbMine', function () { hideModal(); window.openMine(); });
    on('jmbAdminIn', function () { viewLogin(); var t = $('jmbAdminToggle'); if (t) t.click(); });
    on('jmbAdminMenu', function () { var ol = fn('openLogin'); hideModal(); if (ol) ol(); });
    on('jmbLinkMgr', viewManage);
    on('jmbAdminOut', function () { if (isKkAdmin()) setKkOff(true); window.ADMIN_PW = null; hideModal(); var ld = fn('load'); (ld ? ld() : Promise.resolve()).then(function () { say('운영진 모드를 껐어요'); changed(); }); });
    on('jmbKkOn', function () { setKkOff(false); hideModal(); syncAdmin(); });
    on('jmbOut', function () { api_logout(); });
    on('jmbUnlink', function () {
      var b = $('jmbUnlink');
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = '정말 해제할까요? 한 번 더 누르세요'; return; }
      b.disabled = true;
      call('kakaoUnlink', [session.token]).then(function (r) { session.user = mergeUser(r.user); writeSession(); hideModal(); changed(); say('닉네임 연결을 해제했어요'); },
        function (e) { b.disabled = false; if (e.message === 'expired') { hideModal(); return expire(); } say(e.message); });
    });
  }

  function api_logout() {
    var kk = isKkAdmin();
    session = null; writeSession(); hideModal();
    if (kk) { window.ADMIN_PW = null; reloadApp('로그아웃했어요'); return; }   // 카카오 계정 운영진이면 운영진 모드도 함께 끔
    changed(); say('로그아웃했어요');
  }

  /* ---------- 화면: 운영진 · 카카오 연동 관리 (v1.1) ---------- */
  function viewManage() {
    if (!isAdmin()) return say('운영진 로그인이 필요해요');
    mgr = { rows: [], q: '', loading: true, err: '', sure: '', busy: '' };
    showModal(
      '<h3>카카오 연동 관리<button class="btn sm x" data-close>닫기</button></h3>' +
      '<p class="jmb-hint">회원 닉네임과 연결된 카카오 계정이에요. 잘못 연결됐거나 본인이 아닌 경우 해제하면, 그 회원이 다시 연결할 수 있어요.</p>' +
      '<input class="input" id="jmbMgQ" placeholder="닉네임·카카오 이름 검색" autocomplete="off" style="width:100%">' +
      '<div class="jmb-mg" id="jmbMg" aria-live="polite"></div>' +
      '<div class="jmb-err" id="jmbMgErr" role="alert"></div>' +
      '<div class="actions"><button class="btn" id="jmbMgBack">내 계정으로</button></div>');
    $('jmbMgQ').oninput = function () { mgr.q = this.value.trim(); paintManage(); };
    $('jmbMgBack').onclick = viewAccount;
    paintManage();
    call('kakaoAdminList', [window.ADMIN_PW]).then(function (rows) { if (!mgr) return; mgr.rows = rows; mgr.loading = false; paintManage(); },
      function (e) { if (!mgr) return; mgr.loading = false; mgr.err = e.message; paintManage(); });
  }

  function paintManage() {
    var box = $('jmbMg'); if (!box || !mgr) return;
    var q = mgr.q.toLowerCase();
    var list = mgr.rows.filter(function (r) { return !q || (r.current + ' ' + r.nickname + ' ' + r.kakaoNick).toLowerCase().indexOf(q) >= 0; });
    box.innerHTML = mgr.loading ? '<span class="jmb-mute">불러오는 중…</span>' :
      !list.length ? '<span class="jmb-mute">' + (mgr.rows.length ? '검색 결과가 없어요' : '연결된 카카오 계정이 없어요') + '</span>' :
      list.map(function (r) {
        var sure = mgr.sure === r.kakaoId, busy = mgr.busy === r.kakaoId;
        return '<div class="jmb-mg-row"><div class="who"><b>' + esc(r.current) +
          (r.current !== r.nickname ? ' <small style="display:inline">(연결 당시 ' + esc(r.nickname) + ')</small>' : '') +
          (r.left ? '<span class="tag">탈퇴</span>' : '') + '</b>' +
          '<small>카카오: ' + esc(r.kakaoNick || '-') + (r.at ? ' · ' + esc(r.at) : '') + '</small></div>' +
          '<button class="btn sm danger" data-un="' + esc(r.kakaoId) + '"' + (busy ? ' disabled' : '') + '>' + (busy ? '해제 중…' : sure ? '정말 해제?' : '연결 해제') + '</button></div>';
      }).join('');
    [].forEach.call(box.querySelectorAll('[data-un]'), function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-un');
        if (mgr.busy) return;
        if (mgr.sure !== id) { mgr.sure = id; return paintManage(); }
        mgr.busy = id; mgr.err = ''; paintManage();
        var row = mgr.rows.filter(function (r) { return r.kakaoId === id; })[0];
        call('kakaoAdminUnlink', [window.ADMIN_PW, id]).then(function (rows) {
          if (!mgr) return;
          mgr.rows = rows; mgr.sure = ''; mgr.busy = ''; paintManage();
          say((row ? row.current + '님 ' : '') + '카카오 연결을 해제했어요');
          if (session && row && session.user && session.user.nickname === row.current) validate();  // 내 연결을 해제했으면 상태 갱신
        }, function (e) { if (!mgr) return; mgr.busy = ''; mgr.sure = ''; mgr.err = e.message; paintManage(); });
      };
    });
    var er = $('jmbMgErr'); if (er) er.textContent = mgr.err || '';
  }

  /* ---------- 화면: 닉네임 연결 ---------- */
  function viewLink() {
    var u = user(); if (!u) return viewLogin();
    link = { names: [], q: '', pick: '', err: '', busy: false, loading: true };
    showModal(
      '<h3>내 닉네임 연결<button class="btn sm x" data-close>나중에</button></h3>' +
      '<p class="jmb-hint">' + (u.kakaoNick ? '<b>' + esc(u.kakaoNick) + '</b> 님, ' : '') + '모임에서 쓰는 닉네임을 골라 주세요. 처음 한 번만 하면 돼요.</p>' +
      '<input class="input" id="jmbQ" placeholder="닉네임 검색" autocomplete="off" style="width:100%">' +
      '<div class="jmb-names" id="jmbNames" role="listbox" aria-label="닉네임 목록"></div>' +
      '<div class="jmb-err" id="jmbErr" role="alert"></div>' +
      '<div class="actions"><button class="btn primary" id="jmbLinkGo" disabled>닉네임을 골라주세요</button></div>' +
      '<p class="jmb-hint sm">목록에 내 닉네임이 없거나 이미 연결됐다고 나오면 운영진에게 알려 주세요. (운영진이 연결을 해제해 줄 수 있어요)</p>');
    paintNames();
    $('jmbQ').oninput = function () { link.q = this.value.trim(); paintNames(); };
    $('jmbLinkGo').onclick = doLink;
    call('kakaoListLinkable', [session.token]).then(function (names) { link.names = names; link.loading = false; paintNames(); },
      function (e) { if (e.message === 'expired') { hideModal(); return expire(); } link.loading = false; link.err = e.message; paintNames(); });
  }

  function paintNames() {
    var box = $('jmbNames'); if (!box || !link) return;
    var list = link.names.filter(function (n) { return !link.q || n.toLowerCase().indexOf(link.q.toLowerCase()) >= 0; });
    box.innerHTML = link.loading ? '<span class="jmb-mute">불러오는 중…</span>' :
      !list.length ? '<span class="jmb-mute">' + (link.names.length ? '검색 결과가 없어요' : '연결할 수 있는 닉네임이 없어요') + '</span>' :
      list.map(function (n) { return '<button type="button" role="option" class="jmb-chip' + (link.pick === n ? ' on' : '') + '" data-n="' + esc(n) + '" aria-selected="' + (link.pick === n) + '">' + esc(n) + '</button>'; }).join('');
    [].forEach.call(box.querySelectorAll('[data-n]'), function (c) { c.onclick = function () { link.pick = c.getAttribute('data-n'); link.err = ''; paintNames(); }; });
    var go = $('jmbLinkGo'); if (go) { go.disabled = !link.pick || link.busy; go.textContent = link.busy ? '연결 중…' : link.pick ? link.pick + '(으)로 연결' : '닉네임을 골라주세요'; }
    var er = $('jmbErr'); if (er) er.textContent = link.err || '';
  }

  function doLink() {
    if (!link || !link.pick || link.busy) return;
    link.busy = true; link.err = ''; paintNames();
    call('kakaoLink', [session.token, link.pick]).then(function (r) {
      session.user = mergeUser(r.user); writeSession(); link = null; hideModal(); changed(); syncMe();
      say(session.user.nickname + '님, 연결됐어요!');
    }, function (e) {
      if (e.message === 'expired') { hideModal(); return expire(); }
      link.busy = false; link.err = e.message; paintNames();
    });
  }

  /* ---------- 진입 ---------- */
  hdrHandler = function () {
    var u = user();
    if (!u && !isAdmin()) return viewLogin();
    if (u && !u.nickname) return viewLink();
    viewAccount();
  };

  function validate() {
    if (!session) return;
    var fresh = session.fresh;
    call('kakaoMe', [session.token]).then(function (r) {
      session.user = mergeUser(r.user);
      if (fresh) delete session.fresh;
      writeSession(); syncAdmin(); changed(); syncMe();
      if (fresh) say(session.user.nickname ? session.user.nickname + '님, 환영해요!' : '카카오 로그인 성공! 닉네임을 연결해 주세요.');
      var shown = false; try { shown = sessionStorage.getItem('jmb_link_prompt') === '1'; } catch (e) {}
      if (!session.user.nickname && (fresh || !shown) && !isModalOpen()) { try { sessionStorage.setItem('jmb_link_prompt', '1'); } catch (e) {} viewLink(); }
    }, function (e) { if (e.message === 'expired') expire(); });
  }

  function init() {
    hookRender(); observeHeader(); paintHeader();
    if (window.D) afterRender();
    var m = null; try { m = localStorage.getItem(MSG); localStorage.removeItem(MSG); } catch (e) {}
    if (m) setTimeout(function () { say(m); }, 300);
    validate();
  }

  window.JMB_AUTH = {
    user: user,
    nickname: function () { return user() && user().nickname || null; },
    isAdmin: isAdmin,
    token: function () { return session ? session.token : null; },
    login: startKakao,
    logout: api_logout,
    onChange: function (f) { listeners.push(f); },
    open: function () { hdrHandler(); },
    manageLinks: viewManage
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
