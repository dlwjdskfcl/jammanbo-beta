/* 잠만보 오락실 공용 arcade.js v4 —서버 없는 미니게임의 '내 기록 + 모임 랭킹' 을 한 줄로 붙이는 도구 (외부 라이브러리 없음)
 * 미니게임 index.html 에서 ../config.js 다음에 넣음: <script src="../arcade.js?v=1"></script>  (이 파일을 바꾸면 그 숫자도 올리기)
 *
 *   JMB_ARCADE.report(game, mode, score, note, opt)  판이 끝났을 때 — 이 기기 최고 기록을 고치고, 카카오 로그인 회원이면 서버(메인 GAS Arcade.gs)에 보냄
 *        → Promise<{ best(기기 최고 갱신), prev, error · queued(보내기 실패 · 나중에 다시 보냄), server: {best, rank, of, weekBest, allRank} | null }> · 순위 알림은 알아서 띄움 (opt.quiet 면 안 띄움)
 *        (v4) 이미 올라간 '이번 주 내 최고'보다 좋지 않은 기록은 안 보냄 → { skip: true, weekBest, weekRank }. 못 보낸 기록은 게임 · 모드마다 가장 좋은 것 하나만 보관
 *        보낼 기록은 먼저 기기에 적어 두고 한 번에 하나씩(서버 3초 간격) 보냄 — 여러 번 이어 불러도 됨. 화면을 닫거나 실패해도 다음에 열 때 이어서 보냄
 *   JMB_ARCADE.pending()               아직 서버에 못 올라간 내 기록 수
 *   JMB_ARCADE.openBoard(game, mode)   랭킹 창 (이번 주 · 역대, 모드 탭, 내 순위) — 로그인 안 했으면 로그인 안내
 *   JMB_ARCADE.best(game, mode)        이 기기 최고 기록 {s, at, note} | null
 *   JMB_ARCADE.nick() · token() · login()   잠만보 카카오 로그인 세션 (같은 출처 저장소)
 *   JMB_ARCADE.brief()                 오락실 첫 화면용 요약 (게임 · 모드마다 이번 주 1등 + 내 점수), 1분 캐시
 *   JMB_ARCADE.BOARDS                  랭킹이 있는 게임 · 모드 (서버 Arcade.gs 의 ARCADE_CFG_.GAMES 와 같은 id)
 * 그리고 이 파일을 넣은 페이지를 열면 '최근에 한 게임'(jmb_arcade_log)에 남김 → 잠만보 홈 카드 순서 · 오락실에서 씀
 */
(function (W) {
  'use strict';
  if (W.JMB_ARCADE) return;
  var D = document, CFG = W.JMB_CONFIG || {};
  // config.js 를 안 읽는 페이지(룰렛 · 타이머 · 사운드보드 — 최근에 한 게임만 남김)에서는 주소로 환경을 고름 (config.js 와 같은 규칙)
  var ENV = CFG.env || (!/github\.io$/.test(location.hostname) ? 'local' : /^\/jammanbo\//.test(location.pathname) ? 'prod' : 'beta'), SFX = ENV !== 'prod' ? '_' + ENV : '';
  var ROOT = (function () { var seg = location.pathname.split('/')[1] || ''; return /\.github\.io$/.test(location.hostname) && seg ? '/' + seg + '/' : '/'; })();
  var LS = { auth: 'jmb_kakao_v2' + SFX, state: 'jmb_kakao_state' + SFX, log: 'jmb_arcade_log', best: 'jmb_arcade_best', q: 'jmb_arcade_q' + SFX, ack: 'jmb_arcade_ack' + SFX };
  // low: 작을수록 좋은 기록. unit: 점수 뒤에 붙는 말
  var BOARDS = {
    jumprope: { name: '단체 줄넘기', emoji: '🪢', modes: [{ id: 'solo', name: '혼자 하기', unit: '번' }, { id: 'coop', name: '다 같이', unit: '번' }] },
    rogue: { name: '잠만보 던전', emoji: '🎲', modes: [{ id: 'run', name: '던전 점수', unit: '점' }, { id: 'daily', name: '오늘의 던전', unit: '점' }] },
    mighty: { name: '마이티', emoji: '♠️', modes: [{ id: 'score', name: '한 판 최고 점수', unit: '점' }, { id: 'streak', name: '연속 승리', unit: '연승' }] },
    bingo: { name: '빙고', emoji: '🎱', modes: [{ id: 'ai', name: '어려움 AI 연승', unit: '연승' }, { id: 'fast', name: '가장 빠른 3줄 (어려움 AI)', unit: '턴', low: true }] }
  };

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function lsJSON(k, d) { try { var v = JSON.parse(lsGet(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function modeDef(game, mode) { var b = BOARDS[game], ms = b ? b.modes : []; for (var i = 0; i < ms.length; i++) if (ms[i].id === mode) return ms[i]; return null; }
  function better(def, a, b) { return def && def.low ? a < b : a > b; }
  function num(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* ---------- 로그인 (잠만보 카카오 로그인 세션을 같이 씀) ---------- */
  function session() { var s = lsJSON(LS.auth, null); return s && s.token ? s : null; }
  function token() { var s = session(); return s ? s.token : ''; }
  function nick() { var s = session(); return s && s.user && s.user.nickname ? s.user.nickname : ''; }
  function login() {
    if (session() && !nick()) { location.href = ROOT; return; }   // 닉네임 연결은 잠만보 계정 창에서
    if (!CFG.kakaoRestKey) return;
    var st; try { st = [].slice.call(crypto.getRandomValues(new Uint32Array(4))).join(''); } catch (e) { st = String(Math.random()).slice(2) + Date.now(); }
    lsSet(LS.state, JSON.stringify({ s: st, t: Date.now() }));
    try { sessionStorage.setItem('jmb_after_login', location.pathname); } catch (e) {}   // 잠만보 시작 페이지가 로그인 뒤 여기로 돌려보냄
    location.href = 'https://kauth.kakao.com/oauth/authorize?client_id=' + encodeURIComponent(CFG.kakaoRestKey) +
      '&redirect_uri=' + encodeURIComponent(location.origin + ROOT) + '&response_type=code&state=' + encodeURIComponent(st);
  }

  /* ---------- 서버 ---------- */
  function api(fn, args, ms) {
    if (!CFG.api) return Promise.reject(new Error('설정 파일(config.js)을 읽지 못했어요'));
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, ms || 20000) : 0;
    return fetch(CFG.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, cache: 'no-store', signal: ctl ? ctl.signal : undefined,
      body: JSON.stringify({ fn: fn, args: args || [], env: ENV !== 'prod' ? 'beta' : undefined }) })
      .then(function (r) { if (!r.ok) throw new Error('서버 응답 오류 (' + r.status + ')'); return r.text(); })
      .then(function (t) {
        clearTimeout(timer);
        var j; try { j = JSON.parse(t); } catch (x) { throw new Error('서버가 바빠요. 잠시 후 다시 시도해 주세요'); }
        if (!j || !j.ok) {
          var msg = (j && j.e) || '알 수 없는 오류', e = new Error(/허용되지 않은 요청/.test(msg) ? '랭킹 서버가 아직 준비되지 않았어요' : msg);
          e.server = true;   // 서버가 답한 거절
          e.retry = !/점수가 이상|랭킹이 없는|오늘은 더|닉네임을 먼저|회원 목록에서|탈퇴/.test(msg);   // 규칙 거절만 포기 — 그 밖(도배 간격 · 혼잡 · 점검 · 로그인 만료 · 모르는 오류)은 보관했다가 다시 보냄
          e.gap = /너무 빨리/.test(msg);
          e.auth = /로그인이 만료/.test(msg);   // 다시 로그인해야 풀림 → 보관만 하고 이 화면에서는 더 안 보냄
          throw e;
        }
        return j.r;
      }, function (e) { clearTimeout(timer); throw new Error(e && e.name === 'AbortError' ? '응답이 너무 늦어요' : e instanceof TypeError ? '인터넷 연결을 확인해 주세요' : (e && e.message) || '오류'); });
  }

  /* ---------- 최근에 한 게임 ---------- */
  (function visit() {
    var m = /\/([a-z0-9_-]+)\/(?:index\.html)?$/i.exec(location.pathname), g = m && m[1];
    if (!g || g === 'arcade') return;
    var log = lsJSON(LS.log, {}), o = log[g] || { n: 0 };
    o.n = (o.n || 0) + 1; o.last = Date.now(); log[g] = o;
    lsSet(LS.log, JSON.stringify(log));
  })();

  /* ---------- 기록 ---------- */
  function best(game, mode) { var b = lsJSON(LS.best, {}); return (b[game] && b[game][mode]) || null; }
  function send(game, mode, score, note) { return api('arcadeSubmit', [token(), game, mode, score, note || '']); }
  /* 보낼 기록은 먼저 기기(jmb_arcade_q)에 적고 → 한 번에 하나씩 보내고 → 서버가 받으면 지움.
   * 보내는 도중 화면을 닫거나 인터넷이 끊겨도 다음에 어느 미니게임이든 열면 이어서 보냄 (같은 기록이 두 번 가도 서버는 그 주 최고만 남기므로 안전) */
  var GAP_MS = 3400, RETRY_MS = [20000, 60000, 180000], KEEP_MS = 6 * 86400000, FAIL_MAX = 8;
  var mem = [], waiters = {}, busy = false, curId = '', lastDone = 0, retryN = 0, retryT = 0;
  /* (v4) 서버가 받아 준 '이번 주 내 최고'(jmb_arcade_ack) — 서버는 그 주 최고만 남기므로 이보다 좋지 않은 기록은 보내지 않음(서버 부담 · 대기 줄이기).
   * 주(월요일, 한국 시각)나 사람이 바뀌면 버리고, 12시간이 지난 값은 믿지 않고 다시 보냄(운영진이 시트에서 그 줄을 지웠을 수도 있으므로) */
  var ACK_MS = 12 * 3600000;
  function weekKey() { var d = new Date(Date.now() + 9 * 3600000); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); }
  function ackGet(k, g, m) { var a = lsJSON(LS.ack, null), o = a && a.k === k && a.w === weekKey() && a.v ? a.v[g + ':' + m] : null; return o && isFinite(o.s) && Date.now() - o.t < ACK_MS ? o : null; }
  function ackSet(k, g, m, r) {
    var a = lsJSON(LS.ack, null), w = weekKey();
    if (!a || a.k !== k || a.w !== w || !a.v) a = { k: k, w: w, v: {} };
    a.v[g + ':' + m] = { s: Number(r.weekBest), t: Date.now(), rank: r.rank || null, of: r.of || null };
    lsSet(LS.ack, JSON.stringify(a));
  }
  function qid(o) { return o.id || (o.t + ':' + o.g + ':' + o.m); }
  function queue() {   // 기기에 적힌 것 + (기기에 못 적었으면) 이 화면이 들고 있는 것
    var q = lsJSON(LS.q, []), ids = {}, i;
    if (!q || !q.length || !q.filter) q = [];
    q = q.filter(function (o) { return o && o.g && o.m; });
    for (i = 0; i < q.length; i++) ids[qid(q[i])] = 1;
    for (i = 0; i < mem.length; i++) if (!ids[qid(mem[i])]) q.push(mem[i]);
    return q;
  }
  function qSave(q) { lsSet(LS.q, q.length ? JSON.stringify(q.slice(-30)) : null); }
  function qDrop(id) { mem = mem.filter(function (o) { return qid(o) !== id; }); qSave(queue().filter(function (o) { return qid(o) !== id; })); }
  function settle(id, res) { var w = waiters[id]; if (w) { delete waiters[id]; w.forEach(function (f) { f(res); }); } return !!w; }   // 한 기록을 여러 report() 가 기다릴 수 있음(합쳐진 기록)
  function rankMsg(r) { return (r.best ? '🏆 이번 주 내 최고! ' : '🏆 ') + '모임 랭킹 이번 주 ' + r.rank + '위' + (r.of > 1 ? ' · ' + r.of + '명 중' : ''); }
  function flush() {
    clearTimeout(retryT);
    var me = nick();
    if (busy || !me) return;
    var q = queue(), keep = q.filter(function (o) { return o.k === me && Date.now() - o.t < KEEP_MS; });   // 오래됐거나 다른 사람 것은 버림
    keep = keep.filter(function (o) {   // (v4) 그 사이 더 좋은 기록이 올라갔으면 보낼 필요 없음
      var a = ackGet(me, o.g, o.m), def = modeDef(o.g, o.m);
      if (!a || !def || better(def, o.s, a.s)) return true;
      settle(qid(o), { skip: a }); return false;
    });
    if (keep.length !== q.length) { mem = mem.filter(function (o) { return keep.some(function (x) { return qid(x) === qid(o); }); }); qSave(keep); }
    var it = keep[0];
    if (!it) return;
    busy = true; curId = qid(it);   // 보내는 중인 기록은 report() 가 고치지 않음
    setTimeout(function () {   // 서버가 한 사람당 3초 간격을 요구 → 앞 전송이 끝난 뒤 간격을 두고
      send(it.g, it.m, it.s, it.n).then(function (r) { done(it, null, r); }, function (e) { done(it, e || new Error('오류'), null); });
    }, Math.max(0, lastDone + GAP_MS - Date.now()));
  }
  function done(it, e, r) {
    busy = false; curId = ''; lastDone = Date.now();
    var id = qid(it);
    if (!e) {
      qDrop(id); retryN = 0;
      if (r && isFinite(r.weekBest)) ackSet(it.k, it.g, it.m, r);
      if (!settle(id, { r: r }) && r && r.rank) pill('🏆 보관해 둔 기록을 올렸어요 · 이번 주 ' + r.rank + '위', it.g, it.m);
      return flush();
    }
    if (e.server && e.retry && !e.gap && !e.auth) {   // 서버가 같은 기록을 계속 거절하면 그만둠 (연결 오류는 세지 않음)
      var q = queue(), n = 0;
      q.forEach(function (o) { if (qid(o) === id) n = o.f = (o.f || 0) + 1; });
      qSave(q);
      if (n >= FAIL_MAX) e.retry = false;
    }
    if (e.server && !e.retry) { qDrop(id); settle(id, { e: e }); return flush(); }   // 규칙 거절 → 포기하고 다음 것
    Object.keys(waiters).forEach(function (k) { settle(k, { e: e, queued: true }); });   // 일시 오류 → 기다리던 쪽에 '보관됨'을 알림
    if (e.auth) return;
    if (e.gap) retryT = setTimeout(flush, GAP_MS + 600);
    else if (retryN < RETRY_MS.length) retryT = setTimeout(flush, RETRY_MS[retryN++]);   // 이 화면이 열려 있는 동안 20초 · 1분 · 3분 뒤 다시, 그 뒤는 다음에 열 때
  }
  function report(game, mode, score, note, opt) {
    opt = opt || {};
    var def = modeDef(game, mode);
    score = Math.round(Number(score));
    if (!def || !isFinite(score)) return Promise.resolve({ best: false, prev: null, server: null });
    var all = lsJSON(LS.best, {}), g = all[game] || (all[game] = {}), prev = g[mode] || null, isBest = !prev || better(def, score, prev.s);
    if (isBest) { g[mode] = { s: score, at: Date.now(), note: note || '' }; lsSet(LS.best, JSON.stringify(all)); }
    var out = { best: isBest, prev: prev ? prev.s : null, server: null };
    var me = nick();
    if (!me) return Promise.resolve(out);
    // (v4) 이미 올라간 이번 주 최고보다 좋지 않으면 보내지 않음 → out.skip · out.weekBest(· weekRank)
    var ack = ackGet(me, game, mode);
    if (ack && !better(def, score, ack.s)) { out.skip = true; out.weekBest = ack.s; out.weekRank = ack.rank; return Promise.resolve(out); }
    // (v4) 같은 게임 · 모드의 아직 못 보낸 기록이 있으면 더 좋은 쪽 하나만 남김 (보내는 중인 것은 그대로 두고 새로 적음)
    var q = queue(), it = null;
    q.forEach(function (o) { if (!it && o.k === me && o.g === game && o.m === mode && qid(o) !== curId) it = o; });
    if (it) {
      if (better(def, score, it.s)) { it.s = score; it.n = note || ''; it.t = Date.now(); delete it.f; }
      mem.forEach(function (o) { if (qid(o) === qid(it)) { o.s = it.s; o.n = it.n; o.t = it.t; } });
      qSave(q);
    } else {
      it = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), g: game, m: mode, s: score, n: note || '', t: Date.now(), k: me };
      mem.push(it); qSave(queue());   // 먼저 적어 두고 보냄
    }
    var id = qid(it);
    return new Promise(function (res) {
      (waiters[id] || (waiters[id] = [])).push(function (o) {
        if (o.r) { out.server = o.r; if (!opt.quiet && o.r.rank) pill(rankMsg(o.r), game, mode); }
        else if (o.skip) { out.skip = true; out.weekBest = o.skip.s; out.weekRank = o.skip.rank; }
        else { out.error = (o.e && o.e.message) || '오류'; if (o.queued) out.queued = true; }
        res(out);
      });
      flush();
    });
  }
  function pending() { var me = nick(); return me ? queue().filter(function (o) { return o.k === me; }).length : 0; }   // 아직 서버에 못 올라간 내 기록 수

  /* ---------- 화면: 알림 · 랭킹 창 ---------- */
  var cssDone = false;
  function css() {
    if (cssDone) return; cssDone = true;
    var st = D.createElement('style');
    st.textContent =
      '.jarc-pill{position:fixed;left:50%;top:calc(66px + env(safe-area-inset-top));transform:translate(-50%,-260%);z-index:9998;max-width:calc(100vw - 24px);background:var(--ink,#191f28);color:var(--bg,#fff);font:700 14px/1.35 var(--sans,"Pretendard Variable",Pretendard,system-ui,sans-serif);padding:10px 16px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.25);cursor:pointer;transition:transform .35s cubic-bezier(.2,1.2,.3,1),opacity .2s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:0;opacity:0;pointer-events:none}' +
      '.jarc-pill.on{transform:translate(-50%,0);opacity:1;pointer-events:auto}' +
      '.jarc-bg{position:fixed;inset:0;z-index:9997;background:rgba(10,14,22,.5);display:flex;align-items:flex-end;justify-content:center;animation:jarcFade .18s both;font-family:var(--sans,"Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif);letter-spacing:-.01em}' +
      '@keyframes jarcFade{from{opacity:0}}@keyframes jarcUp{from{transform:translateY(24px);opacity:0}}' +
      '.jarc-sheet{--a:var(--accent,#3b5bdb);width:100%;max-width:520px;max-height:min(86vh,720px);display:flex;flex-direction:column;background:var(--surface,#fff);color:var(--ink,#191f28);border-radius:22px 22px 0 0;box-shadow:0 -8px 40px rgba(0,0,0,.25);animation:jarcUp .22s cubic-bezier(.2,1,.3,1) both;padding-bottom:env(safe-area-inset-bottom)}' +
      '@media (min-width:600px){.jarc-bg{align-items:center}.jarc-sheet{border-radius:22px}}' +
      '.jarc-hd{display:flex;align-items:center;gap:8px;padding:16px 16px 8px}.jarc-hd b{flex:1;font-size:18px;font-weight:800;letter-spacing:-.03em}' +
      '.jarc-x{width:40px;height:40px;border-radius:12px;border:0;background:var(--surface2,#f2f4f7);color:inherit;font-size:18px;cursor:pointer}' +
      '.jarc-tabs{display:flex;gap:6px;padding:0 16px 8px;overflow-x:auto;scrollbar-width:none}.jarc-tabs::-webkit-scrollbar{display:none}' +
      '.jarc-tab{flex:none;min-height:40px;padding:0 14px;border-radius:999px;border:1px solid var(--line,#e5e8ee);background:transparent;color:var(--ink2,#4e5968);font:700 14px inherit;font-family:inherit;cursor:pointer}' +
      '.jarc-tab.on{background:var(--a);border-color:var(--a);color:var(--accent-ink,#fff)}' +
      '.jarc-seg{display:flex;margin:0 16px 8px;padding:3px;border-radius:12px;background:var(--surface2,#f2f4f7)}' +
      '.jarc-seg button{flex:1;min-height:36px;border:0;border-radius:9px;background:transparent;color:var(--muted,#8b95a1);font:700 13.5px inherit;font-family:inherit;cursor:pointer}' +
      '.jarc-seg button.on{background:var(--surface,#fff);color:var(--ink,#191f28);box-shadow:0 1px 3px rgba(16,24,40,.12)}' +
      '.jarc-hd,.jarc-tabs,.jarc-seg,.jarc-foot{flex:none}' +
      '.jarc-body{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:0 16px 16px;min-height:180px}' +
      '.jarc-row{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:12px;font-size:15px}' +
      '.jarc-row.me{background:var(--accent-soft,#edf1ff);font-weight:700}' +
      '.jarc-row .rk{width:28px;text-align:center;font-weight:800;color:var(--muted,#8b95a1);flex:none}.jarc-row .rk.m{font-size:19px}' +
      '.jarc-row .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:8px}' +
      '.jarc-row .nm small{color:var(--muted,#8b95a1);font-weight:500;font-size:12px;overflow:hidden;text-overflow:ellipsis}' +
      '.jarc-row .sc{font-weight:800;font-variant-numeric:tabular-nums;flex:none}.jarc-row .sc small{font-weight:600;color:var(--muted,#8b95a1);font-size:12px;margin-left:2px}' +
      '.jarc-sep{text-align:center;color:var(--muted,#8b95a1);font-size:12px;padding:2px}' +
      '.jarc-empty{text-align:center;color:var(--muted,#8b95a1);padding:34px 10px;font-size:14.5px;line-height:1.6}.jarc-empty .em{font-size:38px;display:block;margin-bottom:6px}' +
      '.jarc-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:12px;border:0;background:var(--a);color:var(--accent-ink,#fff);font:700 15px inherit;font-family:inherit;cursor:pointer;margin-top:12px}' +
      '.jarc-foot{padding:8px 16px 14px;color:var(--muted,#8b95a1);font-size:12px;text-align:center}' +
      '@media (prefers-reduced-motion: reduce){.jarc-bg,.jarc-sheet{animation:none}.jarc-pill{transition:none}}';
    D.head.appendChild(st);
  }
  var pillT = 0;
  function pill(msg, game, mode) {
    css();
    var p = D.getElementById('jarcPill');
    if (!p) { p = D.createElement('button'); p.id = 'jarcPill'; p.type = 'button'; p.className = 'jarc-pill'; D.body.appendChild(p); }
    p.textContent = msg; p.onclick = function () { p.className = 'jarc-pill'; if (game) openBoard(game, mode); };
    requestAnimationFrame(function () { p.className = 'jarc-pill on'; });
    clearTimeout(pillT); pillT = setTimeout(function () { p.className = 'jarc-pill'; }, 4200);
  }

  var boardCache = {};
  function board(game, fresh) {
    var c = boardCache[game];
    if (c && !fresh && Date.now() - c.t < 30000) return Promise.resolve(c.r);
    return api('arcadeBoard', [token(), game]).then(function (r) { boardCache[game] = { t: Date.now(), r: r }; return r; });
  }
  function brief() {
    var c = null; try { c = JSON.parse(sessionStorage.getItem('jmb_arcade_brief' + SFX) || 'null'); } catch (e) {}
    if (c && Date.now() - c.t < 60000 && c.k === nick()) return Promise.resolve(c.r);
    return api('arcadeBrief', [token()]).then(function (r) { try { sessionStorage.setItem('jmb_arcade_brief' + SFX, JSON.stringify({ t: Date.now(), k: nick(), r: r })); } catch (e) {} return r; });
  }

  var openEl = null, openAt = 0;
  function closeBoard(fromPop) {
    if (!openEl) return;
    openEl.parentNode && openEl.parentNode.removeChild(openEl); openEl = null;
    D.removeEventListener('keydown', onKey, true); W.removeEventListener('popstate', onPop);
    if (!fromPop && history.state && history.state.jarc) history.back();   // 창을 열 때 쌓은 한 칸 되돌리기
  }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closeBoard(); } }
  function onPop() { closeBoard(true); }
  function av(name) { return W.JMB_FX && JMB_FX.avatar ? JMB_FX.avatar(name, 26) : ''; }
  function rowHtml(def, o, rank, me) {
    var medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
    return '<div class="jarc-row' + (o.nick === me ? ' me' : '') + '"><span class="rk' + (medal ? ' m' : '') + '">' + (medal || rank) + '</span>' +
      '<span class="nm">' + av(o.nick) + '<span>' + esc(o.nick) + '</span>' + (o.note ? '<small>' + esc(o.note) + '</small>' : '') + '</span>' +
      '<span class="sc">' + num(o.score) + '<small>' + esc(def.unit || '') + '</small></span></div>';
  }
  function openBoard(game, mode) {
    var B = BOARDS[game];
    if (!B) return;
    css(); closeBoard();
    var st = { mode: modeDef(game, mode) ? mode : B.modes[0].id, span: 'week', data: null, err: '' };
    var bg = D.createElement('div'); bg.className = 'jarc-bg'; openEl = bg; openAt = Date.now();
    bg.innerHTML = '<div class="jarc-sheet" role="dialog" aria-modal="true" aria-label="' + esc(B.name) + ' 랭킹"><div class="jarc-hd"><b>' + B.emoji + ' ' + esc(B.name) + ' 랭킹</b><button type="button" class="jarc-x" aria-label="닫기">✕</button></div>' +
      '<div class="jarc-tabs"></div><div class="jarc-seg"><button type="button" data-span="week">이번 주</button><button type="button" data-span="all">역대 최고</button></div><div class="jarc-body"></div><div class="jarc-foot"></div></div>';
    D.body.appendChild(bg);
    var tabs = bg.querySelector('.jarc-tabs'), body = bg.querySelector('.jarc-body'), foot = bg.querySelector('.jarc-foot'), seg = bg.querySelector('.jarc-seg');
    if (B.modes.length < 2) tabs.style.display = 'none';
    function paint() {
      tabs.innerHTML = B.modes.map(function (m) { return '<button type="button" class="jarc-tab' + (m.id === st.mode ? ' on' : '') + '" data-mode="' + m.id + '">' + esc(m.name) + '</button>'; }).join('');
      [].forEach.call(seg.children, function (b) { b.className = b.getAttribute('data-span') === st.span ? 'on' : ''; });
      var def = modeDef(game, st.mode), mine = best(game, st.mode);
      foot.textContent = mine ? '이 기기 최고 기록 ' + num(mine.s) + (def.unit || '') + (def.low ? ' · 작을수록 좋아요' : '') : (def.low ? '작을수록 좋은 기록이에요' : '');
      if (st.err) { body.innerHTML = '<div class="jarc-empty"><span class="em">😵</span>' + esc(st.err) + '<br><button type="button" class="jarc-btn" data-act="retry">다시 시도</button></div>'; return; }
      if (!st.data) { body.innerHTML = '<div class="jarc-empty"><span class="em">⏳</span>순위를 불러오는 중…</div>'; return; }
      if (!st.data.login) {
        body.innerHTML = '<div class="jarc-empty"><span class="em">🔒</span>' + (session() ? '잠만보에서 모임 닉네임을 연결하면<br>모임 랭킹에 기록돼요' : '카카오로 로그인하면<br>모임 랭킹에 내 기록이 올라가요') +
          '<br><button type="button" class="jarc-btn" data-act="login">' + (session() ? '잠만보로 가기' : '카카오 로그인') + '</button></div>'; return;
      }
      var d = (st.data.modes[st.mode] || {})[st.span] || { top: [], me: null, n: 0 }, me = st.data.me, h = '';
      if (!d.top.length) { body.innerHTML = '<div class="jarc-empty"><span class="em">🌱</span>' + (st.span === 'week' ? '이번 주 기록이 아직 없어요.<br>첫 번째 주인공이 되어 보세요!' : '아직 기록이 없어요.') + '</div>'; return; }
      d.top.forEach(function (o, i) { h += rowHtml(def, o, i + 1, me); });
      if (d.me && d.me.rank > d.top.length) h += '<div class="jarc-sep">⋯</div>' + rowHtml(def, { nick: me, score: d.me.score, note: d.me.note }, d.me.rank, me);
      body.innerHTML = h;
    }
    function load(fresh) {
      st.err = ''; if (fresh) st.data = null;
      if (!nick()) { st.data = { login: false }; return paint(); }   // 로그인 안 했으면 서버에 묻지 않고 안내만
      paint();
      board(game, fresh).then(function (r) { if (openEl !== bg) return; st.data = r; paint(); }, function (e) { if (openEl !== bg) return; st.err = e.message; paint(); });
    }
    bg.addEventListener('click', function (e) {
      var t = e.target;
      if (t === bg) { if (Date.now() - openAt > 350) closeBoard(); return; }   // 열자마자 바깥에 닿는 두 번째 탭은 무시
      if (t.closest('.jarc-x')) return closeBoard();
      var m = t.closest('[data-mode]'), s = t.closest('[data-span]'), a = t.closest('[data-act]');
      if (m) { st.mode = m.getAttribute('data-mode'); paint(); }
      else if (s) { st.span = s.getAttribute('data-span'); paint(); }
      else if (a) { if (a.getAttribute('data-act') === 'login') login(); else load(true); }
    });
    D.addEventListener('keydown', onKey, true);
    try { history.pushState({ jarc: 1 }, ''); W.addEventListener('popstate', onPop); } catch (e) {}   // 뒤로가기 = 창 닫기
    load(false);
  }

  W.JMB_ARCADE = { BOARDS: BOARDS, ROOT: ROOT, report: report, best: best, bests: function () { return lsJSON(LS.best, {}); }, log: function () { return lsJSON(LS.log, {}); },
    board: board, brief: brief, openBoard: openBoard, closeBoard: closeBoard, nick: nick, token: token, session: session, login: login, api: api, pill: pill, pending: pending };
  if (D.readyState === 'complete') setTimeout(flush, 1500); else W.addEventListener('load', function () { setTimeout(flush, 1500); });
  W.addEventListener('online', function () { retryN = 0; flush(); });   // 인터넷이 돌아오면 보관한 기록부터
})(window);
