/*! 잠만보 꼬맨틀 — 화면 v1.2.0
 * 매일 하나의 비밀 단어를 '뜻이 가까운 정도'(FastText 유사도)로 찾아가는 게임.
 * 서버 Semantle.gs (semToday · semStart · semSubmit · semRank): 오늘의 유사도 표를 한 번 받으면 추측마다 서버를 거치지 않음.
 * 로그인(카카오) 회원은 하루 한 번 기록 → 점수 · 순위 · 연속 · 배지. 로그인 안 해도 풀 수 있음(기록 없음).
 * 단어 목록 vocab.txt 는 0_PC설정\도구\꼬맨틀_데이터_만들기.py 가 만든 것과 같아야 함 (서버가 보내는 목록값 vh 로 확인).
 */
(function () {
  'use strict';
  var VER = '1.2.0';
  var CFG = window.JMB_CONFIG || {};
  var ENV = CFG.env || 'prod';
  var ENV_SFX = ENV !== 'prod' ? '_' + ENV : '';
  var API = window.SEM_API_LOCAL || CFG.api || '';
  var ROOT = (function () { var seg = location.pathname.split('/')[1] || ''; return /\.github\.io$/.test(location.hostname) && seg ? '/' + seg + '/' : '/'; })();
  var LS = { auth: 'jmb_kakao_v2' + ENV_SFX, state: 'jmb_kakao_state' + ENV_SFX, play: 'jmb_sem_play' + ENV_SFX, pend: 'jmb_sem_pend' + ENV_SFX, help: 'jmb_sem_help', tab: 'jmb_sem_tab' };
  var HINT_MAX = 3, HINT_COST = 15, TOPN = 1000;
  var BADGES = [   // 서버 Semantle.js badgesOf 와 같은 id
    { id: 'first', e: '🥇', n: '선두 주자', d: '그 날 가장 먼저 정답' },
    { id: 'fast', e: '⚡', n: '번개', d: '10번 안에 정답' },
    { id: 'lucky', e: '🍀', n: '행운아', d: '3번 안에 정답' },
    { id: 's3', e: '🔥', n: '불붙었다', d: '3일 연속 정답' },
    { id: 's7', e: '🌋', n: '일주일 개근', d: '7일 연속 정답' },
    { id: 's30', e: '👑', n: '꼬맨틀 왕', d: '30일 연속 정답' },
    { id: 'n10', e: '🏅', n: '꾸준러', d: '정답 10번' },
    { id: 'n50', e: '🎖️', n: '단골', d: '정답 50번' },
    { id: 'sharp', e: '🧠', n: '감 좋은 사람', d: '평균 25번 안 (10번 이상)' }
  ];
  var S = { view: 'play', vocab: null, idx: null, sims: null, ans: -1, rankOf: null, top: null, srv: null, L: null, rank: null, rkTab: lsGet(LS.tab) || 'today',
            nick: '', hist: null, histAt: 0, startP: null, busy: false, fb: null, lastW: '', t0: 0, scale: null };

  /* ================= 공통 ================= */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function lsJSON(k) { try { return JSON.parse(lsGet(k) || 'null'); } catch (e) { return null; } }
  var toastT = 0;
  function toast(msg, err) { var t = $('toast'); t.textContent = msg; t.className = 'toast on' + (err ? ' err' : ''); clearTimeout(toastT); toastT = setTimeout(function () { t.className = 'toast'; }, err ? 3800 : 2200); }
  function av(name, px) { return window.JMB_FX && name ? '<span class="av">' + JMB_FX.avatar(name, px) + '</span>' : ''; }
  function mmss(s) { s = Math.max(0, Math.round(s)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x; }
  function f2(v) { return (v / 100).toFixed(2); }
  function hap(k) { try { window.JMB_FX && JMB_FX.haptic(k); } catch (e) {} }

  /* ================= 로그인 (잠만보 카카오 로그인 세션을 같이 씀) ================= */
  function session() { var s = lsJSON(LS.auth); return s && s.token ? s : null; }
  function token() { var s = session(); return s ? s.token : ''; }
  function myNick() { var s = session(); return s && s.user && s.user.nickname ? s.user.nickname : ''; }
  function startLogin() {
    if (!CFG.kakaoRestKey) return toast('카카오 로그인 설정을 찾지 못했어요', true);
    var st; try { st = [].slice.call(crypto.getRandomValues(new Uint32Array(4))).join(''); } catch (e) { st = String(Math.random()).slice(2) + Date.now(); }
    lsSet(LS.state, JSON.stringify({ s: st, t: Date.now() }));
    try { sessionStorage.setItem('jmb_after_login', location.pathname); } catch (e) {}   // 잠만보 시작 페이지가 로그인 뒤 여기로 돌려보냄
    location.href = 'https://kauth.kakao.com/oauth/authorize?client_id=' + encodeURIComponent(CFG.kakaoRestKey) +
      '&redirect_uri=' + encodeURIComponent(location.origin + ROOT) + '&response_type=code&state=' + encodeURIComponent(st);
  }
  function renderAcct() { var b = $('acct'), nk = myNick(); b.textContent = nk || (session() ? '닉네임 연결' : '로그인'); b.className = 'acct' + (nk ? ' on' : ''); }
  $('acct').onclick = function () {
    var s = session();
    if (!s) return startLogin();
    if (!myNick()) { if (confirm('잠만보에서 카카오 계정에 모임 닉네임을 먼저 연결해 주세요. 잠만보로 갈까요?')) location.href = ROOT; return; }
    if (confirm(myNick() + ' 님으로 로그인돼 있어요.\n로그아웃할까요? (잠만보 앱도 함께 로그아웃돼요)')) { lsSet(LS.auth, null); location.reload(); }
  };

  /* ================= 서버 ================= */
  function api(fn, args, ms) {
    if (!API) return Promise.reject(new Error('설정 파일(config.js)을 읽지 못했어요'));
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, ms || 25000) : 0;
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, cache: 'no-store', signal: ctl ? ctl.signal : undefined,
      body: JSON.stringify({ fn: fn, args: args || [], env: ENV !== 'prod' ? 'beta' : undefined }) })
      .then(function (r) { if (!r.ok) throw new Error('서버 응답 오류 (' + r.status + ')'); return r.text().then(function (t) { try { return JSON.parse(t); } catch (x) { throw new Error('서버가 바빠요. 잠시 후 다시 시도해 주세요'); } }); })
      .then(function (j) {
        clearTimeout(timer);
        if (!j || !j.ok) {
          var msg = (j && j.e) || '알 수 없는 오류';
          if (/허용되지 않은 요청/.test(msg)) msg = '서버에 꼬맨틀 기능이 아직 없어요 (Semantle.gs 배포 필요)';
          if (/로그인이 만료/.test(msg)) { lsSet(LS.auth, null); renderAcct(); }
          var er = new Error(msg); er.server = true; throw er;
        }
        return j.r;
      }, function (e) { clearTimeout(timer); var er = new Error(e && e.name === 'AbortError' ? '응답이 너무 늦어요. 잠시 후 다시 시도해 주세요' : e instanceof TypeError ? '인터넷 연결을 확인해 주세요' : (e && e.message) || '오류'); throw er; });
  }

  /* ================= 데이터 (단어 목록 + 오늘 유사도 표) ================= */
  function sha1hex(text) {
    if (!(window.crypto && crypto.subtle && window.TextEncoder)) return Promise.resolve('');
    return crypto.subtle.digest('SHA-1', new TextEncoder().encode(text)).then(function (b) { return [].map.call(new Uint8Array(b), function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); });
  }
  function loadVocab() {
    return fetch('vocab.txt?v=' + VER).then(function (r) { if (!r.ok) throw new Error('단어 목록을 받지 못했어요'); return r.text(); }).then(function (t) {
      return sha1hex(t).then(function (h) { return { words: t.split('\n'), hash: h.slice(0, 10) }; });
    });
  }
  function decodeTable(b64, n) {
    var bin = atob(b64), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    var a = new Int16Array(u.buffer, 0, u.length >> 1);
    if (a.length !== n) throw new Error('오늘 표가 단어 목록과 달라요 (' + a.length + ' ≠ ' + n + ')');
    return a;
  }
  function prepare(vocab, srv) {
    S.vocab = vocab.words; S.idx = new Map();
    for (var i = 0; i < S.vocab.length; i++) if (!S.idx.has(S.vocab[i])) S.idx.set(S.vocab[i], i);
    S.sims = decodeTable(srv.table, srv.n);
    var best = -1, bv = -32768;
    for (var k = 0; k < S.sims.length; k++) if (S.sims[k] > bv) { bv = S.sims[k]; best = k; }
    S.ans = best;
    var order = []; for (var j = 0; j < S.sims.length; j++) if (j !== S.ans) order.push(j);
    order.sort(function (a, b) { return S.sims[b] - S.sims[a]; });
    S.top = order.slice(0, TOPN);
    S.rankOf = new Map(); S.top.forEach(function (ix, r) { S.rankOf.set(ix, r + 1); });
    S.scale = { r1: S.sims[S.top[0]], r10: S.sims[S.top[9]], rN: S.sims[S.top[TOPN - 1]] };
  }

  /* ================= 오늘 판 (이 기기에 저장) ================= */
  function freshLocal() { return { day: S.srv.day, vh: S.srv.vh, g: [], hints: 0, done: false, win: false, rec: false, nonce: '', startAt: 0, res: null, pend: false }; }
  function saveLocal() { lsSet(LS.play, JSON.stringify(S.L)); }
  function guessWords() { return S.L.g.map(function (x) { return x.w; }); }
  function realCount() { return S.L.g.filter(function (x) { return !x.h; }).length; }
  function simOf(w) { return S.sims[S.idx.get(w)]; }
  function rankIn(w) { return S.rankOf.get(S.idx.get(w)) || 0; }
  function tier(w) {   // 0 얼음 · 1 차가움 · 2 미지근 · 3 따뜻 · 4 뜨거움 · 5 코앞 · 6 정답
    var i = S.idx.get(w); if (i === S.ans) return 6;
    var r = S.rankOf.get(i) || 0, s = S.sims[i];
    if (r && r <= 10) return 5; if (r && r <= 100) return 4; if (r) return 3;
    return s >= S.scale.rN - 300 ? 2 : s > 0 ? 1 : 0;
  }
  var TIER = [{ e: '🧊', t: '얼음장 같아요' }, { e: '🥶', t: '차가워요' }, { e: '😐', t: '미지근해요' }, { e: '😮', t: '따뜻해요! 1000위 안이에요' }, { e: '🌶️', t: '뜨거워요! 100위 안이에요' }, { e: '🔥', t: '코앞이에요! 10위 안!' }, { e: '🎉', t: '정답!' }];
  var HEAT = ['⬛', '🟦', '🟨', '🟧', '🟥', '🔥', '🎯'];

  /* ---------- 진행 중 추측을 서버에도 저장 (다른 기기 · 캐시를 지운 뒤에도 이어 하기) ---------- */
  var saveT = 0;
  function gString() { return S.L.g.map(function (x) { return (x.h ? '*' : '') + x.w; }).join('|'); }
  function scheduleSave() { if (!recordable()) return; clearTimeout(saveT); saveT = setTimeout(flushSave, 2500); }
  function flushSave() {
    clearTimeout(saveT);
    if (!S.L || !recordable() || !S.L.nonce || !S.L.g.length) return Promise.resolve();
    return api('semSave', [token(), S.L.nonce, gString()]).catch(function () {});   // 실패해도 이 기기에는 저장돼 있음
  }
  function parseG(g) {
    return String(g || '').split('|').filter(Boolean).map(function (t) { var h = t.charAt(0) === '*'; return { w: h ? t.slice(1) : t, h: h ? 1 : 0, t: 0 }; }).filter(function (x) { return S.idx.has(x.w); });
  }
  /** 서버에 있는 오늘 판(다른 기기에서 한 것 포함)을 이 기기 판에 합침 */
  function mergeServer(L, my) {
    if (!S.nick || !my || L.done) return;
    var sg = parseG(my.g);
    if (my.state === '완료' && my.res) {   // 다른 기기에서 이미 끝냄 → 끝난 판 그대로 보여 줌
      L.g = sg; L.done = true; L.win = !!my.res.win; L.n = my.res.guesses; L.cnt = sg.length; L.hints = my.res.hints; L.res = my.res; L.rec = false;
      return;
    }
    if (my.state !== '진행중' || !sg.length) return;
    var have = {}; sg.forEach(function (x) { have[x.w] = 1; });
    var merged = sg.concat(L.g.filter(function (x) { return !have[x.w]; }));
    if (merged.length > L.g.length) L.g = merged;
    L.hints = Math.max(L.hints, L.g.filter(function (x) { return x.h; }).length);
    L.rec = true; S.lastW = '';
  }

  function recordable() { return !!(S.L && S.L.rec && !S.L.done); }
  function ensureStart() {
    if (!S.L.rec || S.L.nonce) return Promise.resolve();
    if (S.startP) return S.startP;
    S.startP = api('semStart', [token()]).then(function (r) { S.L.nonce = r.nonce; S.L.startAt = Date.now(); saveLocal(); }, function (e) {
      S.L.rec = false; saveLocal();
      toast(/이미 했어요|더 할 수 없어요/.test(e.message) ? '오늘 기록은 이미 했어요. 연습으로 계속 풀 수 있어요' : e.message, true); render();
    }).then(function () { S.startP = null; });
    return S.startP;
  }

  /* ================= 추측 ================= */
  function normalize(s) { return String(s || '').normalize('NFC').replace(/\s+/g, '').replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ]/g, ''); }
  function guess(raw) {
    var w = normalize(raw), inp = $('gw');
    if (!w || !S.idx) return;
    if (!S.idx.has(w)) { toast('‘' + w + '’ 은(는) 사전에 없는 단어예요', true); if (inp) { inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake'); inp.select(); } hap('warn'); return; }
    if (guessWords().indexOf(w) >= 0) { toast('이미 추측한 단어예요'); S.lastW = w; render(); return; }
    addGuess(w, false);
  }
  function addGuess(w, isHint) {
    if (recordable() && !S.L.nonce) ensureStart();
    S.L.g.push({ w: w, h: isHint ? 1 : 0, t: Date.now() });
    S.lastW = w; saveLocal(); scheduleSave();
    var tr = tier(w);
    if (tr === 6 && !S.L.done) return win(w);
    if (S.L.done && tr === 6) { toast('🎉 정답이에요! (연습)'); S.fb = null; render(); return; }
    S.fb = { tr: tr, w: w, r: rankIn(w) };
    hap(tr >= 4 ? 'turn' : 'tap');
    render();
  }
  function hint() {
    var rec = recordable();
    if (rec && S.L.hints >= HINT_MAX) return toast('힌트는 하루 ' + HINT_MAX + '번까지예요', true);
    var best = 0; guessWords().forEach(function (w) { var r = rankIn(w); if (r && (!best || r < best)) best = r; });
    var target = best ? Math.max(2, Math.floor(best / 2)) : 300 + Math.floor(Math.random() * 400);
    var have = {}; guessWords().forEach(function (w) { have[S.idx.get(w)] = 1; });
    var pick = -1;
    for (var d = 0; d < TOPN && pick < 0; d++) {
      var a = target - 1 + d, b = target - 1 - d;
      if (a < TOPN && !have[S.top[a]]) pick = S.top[a]; else if (b >= 1 && !have[S.top[b]]) pick = S.top[b];
    }
    if (pick < 0) return toast('더 줄 힌트가 없어요', true);
    var cost = rec ? ' (−' + HINT_COST + '점)' : '';
    if (rec && !confirm('힌트를 볼까요?' + cost + '\n지금보다 정답에 가까운 단어 하나를 알려 줘요. (' + (S.L.hints + 1) + '/' + HINT_MAX + ')')) return;
    if (rec) S.L.hints++;
    addGuess(S.vocab[pick], true);
    toast('💡 힌트: ‘' + S.vocab[pick] + '’ — ' + rankIn(S.vocab[pick]) + '위예요' + cost);
  }
  function giveUp() {
    if (S.L.done) return;
    if (!confirm('정말 포기할까요?' + (S.L.rec ? '\n정답 기록은 0점이고 연속 기록이 끊겨요.' : ''))) return;
    finish(false);
    if (S.L.rec) submit(false, ''); else render();
  }

  /* ================= 끝 · 기록 ================= */
  function finish(isWin) { S.L.done = true; S.L.win = isWin; S.L.n = realCount(); S.L.cnt = S.L.g.length; saveLocal(); }
  function win(w) {
    finish(true);
    try { JMB_FX.confetti({ x: .5, y: .35, count: 120, duration: 2400 }); } catch (e) {}
    hap('win');
    if (S.L.rec) submit(true, w); else render();
  }
  function submit(isWin, word) {
    S.busy = true; render();
    return ensureStart().then(function () {
      if (!S.L.rec || !S.L.nonce) { S.busy = false; render(); return; }
      clearTimeout(saveT);
      var payload = { win: isWin, guesses: Math.max(isWin ? 1 : 0, S.L.n), hints: S.L.hints, answer: word, g: gString().slice(0, 11000) };
      return api('semSubmit', [token(), S.L.nonce, payload]).then(function (r) {
        S.L.res = r; S.L.pend = false; saveLocal(); S.busy = false; lsSet(LS.pend, null);
        S.rank = null; loadMine(); render();
      }, function (e) {
        S.busy = false;
        if (e.server) { S.L.res = { error: e.message }; S.L.rec = false; saveLocal(); toast(e.message, true); }   // 서버가 거절 — 다시 보내도 같음
        else { S.L.pend = { win: isWin, word: word }; saveLocal(); toast('기록을 보내지 못했어요. 연결되면 다시 보낼게요 (' + e.message + ')', true); }
        render();
      });
    });
  }
  function retryPending() {
    if (!S.L || !S.L.pend || !S.L.rec || !S.L.nonce) return;
    submit(S.L.pend.win, S.L.pend.word);
  }
  function loadMine() { return api('semToday', [token()]).then(function (r) { if (r && r.ready) { S.srv.stats = r.stats; S.srv.my = r.my; S.srv.solvedToday = r.solvedToday; } render(); }, function () {}); }

  /* ================= 나눔 ================= */
  function shareText() {
    var L = S.L, n = L.n, tiers = L.g.slice(0, L.cnt).map(function (x) { return HEAT[tier(x.w)]; });
    if (tiers.length > 28) tiers = tiers.slice(0, 14).concat(['…'], tiers.slice(-13));
    var head = '🔤 꼬맨틀 #' + S.srv.no + (L.win ? ' 🎉' : ' 😵');
    var line = L.win ? '나는 ' + n + '번 만에!' + (L.hints ? ' (힌트 ' + L.hints + ')' : '') : '오늘은 포기… 너는 맞힐 수 있어?';
    if (L.res && L.res.points) line += ' ⭐' + L.res.points + '점';
    return head + '\n' + line + '\n' + tiers.join('') + '\n👉 같이 해요 ' + location.origin + ROOT + 'semantle/';   // 정답 단어는 넣지 않음 (이모지 열기만)
  }
  function share() {
    var text = shareText();
    if (navigator.share) { navigator.share({ text: text }).catch(function () {}); return; }
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('복사했어요. 단톡방에 붙여넣어 주세요'); }, function () { prompt('복사해서 붙여넣기 하세요', text); });
  }

  /* ================= 창 ================= */
  function openModal(html) {
    $('modal').innerHTML = '<div class="mbg" id="mbg"><div class="sheet" role="dialog" aria-modal="true">' + html + '</div></div>';
    $('mbg').addEventListener('click', function (e) { if (e.target.id === 'mbg' || e.target.closest('[data-x]')) closeModal(); });
    return $('mbg').firstChild;
  }
  function closeModal() { $('modal').innerHTML = ''; }
  function help() {
    lsSet(LS.help, '1');
    openModal('<h2>🎯 꼬맨틀 하는 법</h2>' +
      '<p>매일 하나의 <b>비밀 단어</b>가 정해져요. 아무 단어나 입력하면 비밀 단어와 <b>뜻이 얼마나 가까운지</b>(유사도)를 알려 줘요. 철자가 아니라 <b>쓰임새·의미</b>가 비슷해야 점수가 높아요.</p>' +
      '<ul><li>유사도는 -100 ~ 100. 높을수록 가까워요.</li><li><b>1000위 안</b>에 들면 순위가 보여요. (1위 = 비밀 단어와 가장 가까운 단어)</li><li>같은 문맥에 같이 나올 법한 단어를 떠올려 보세요. 반대말도 의외로 가까울 수 있어요.</li><li>비밀 단어는 일상 단어예요 (명사 · 동사 · 형용사). 단어는 <b>기본형</b>으로 입력해 보세요.</li></ul>' +
      '<h4>🏆 점수와 순위 (로그인해서 풀어야 기록돼요)</h4>' +
      '<ul><li><b>정답 점수</b> = 150 − 추측 횟수 (최소 20점)</li><li><b>선착순 보너스</b> 오늘 1등 +30 · 2등 +20 · 3등 +10</li><li><b>연속 보너스</b> 연속 정답 일수마다 +5 (최대 +30)</li><li><b>힌트</b> 하나당 −15점 (하루 3번까지)</li><li>포기하면 0점 · 연속 기록이 끊겨요</li><li>하루에 한 번만 기록돼요. 정답을 맞힌 뒤에도 계속 연습할 수 있어요.</li><li>순위는 오늘(적은 추측 순) · 이번 주 · 시즌(분기) · 연속 정답 · 레이팅이 있어요.</li><li><b>레이팅</b>은 그 날 푼 사람끼리 추측 횟수를 겨루는 점수예요 (처음 1500점). 적게 맞히면 오르고 많이 맞히면 내려가요. 같으면 무승부, 포기는 꼴찌, 힌트 1개는 추측 5번으로 쳐요. 분기마다 새로 시작하고 3일 이상 참여하면 순위에 올라요.</li><li>순위에서 이름을 누르면 그 사람의 기록과 나와의 비교를 볼 수 있어요.</li></ul>' +
      '<h4>📱 팁</h4><p>이 게임은 비밀 단어를 컴퓨터가 계산한 의미 거리(FastText)로 맞혀요. 가끔 이상한 점수가 나와도 웃고 넘겨 주세요 😄</p>' +
      '<div class="btns"><button type="button" class="btn pri" data-x>알겠어요</button></div>');
  }

  /* ================= 화면 ================= */
  function setHead() {
    var st = S.srv && S.srv.stats;
    $('ttl').textContent = S.srv && S.srv.no ? '꼬맨틀 #' + S.srv.no : '꼬맨틀';
    $('sub').textContent = st && st.streak ? '🔥 ' + st.streak + '일 연속 정답 중' : '오늘의 비밀 단어를 찾아라';
  }
  function tabsOn() { [].forEach.call($('tabs').children, function (b) { b.classList.toggle('on', b.getAttribute('data-v') === S.view); }); }
  function render() {
    setHead(); tabsOn();
    if (S.view === 'rank') return renderRank();
    if (S.view === 'hist') return renderHist();
    renderPlay();
  }

  function metaCard() {
    var s = S.srv, h = '<div class="card"><div class="head"><div class="no">#' + s.no + '<small> 번째 문제</small></div><div class="meta">' +
      '오늘 <b>' + (s.solvedToday || 0) + '명</b>이 맞혔어요' + (s.yesterday ? '<br>어제 정답: <b>' + esc(s.yesterday) + '</b>' : '') + '</div></div>' +
      '<div class="scale"><div><b>' + f2(S.scale.r1) + '</b><small>1위 유사도</small></div><div><b>' + f2(S.scale.r10) + '</b><small>10위</small></div><div><b>' + f2(S.scale.rN) + '</b><small>1000위</small></div></div>';
    var st = s.stats, chips = '';
    if (S.nick && st) chips += '<span class="chip on">' + ratingLabel(st) + '</span><span class="chip on">🏅 ' + st.solves + '회 정답</span>' + (st.streak ? '<span class="chip hot">🔥 ' + st.streak + '일 연속</span>' : '') + '<span class="chip">⭐ ' + st.points + '점</span>';
    if (chips) h += '<div class="chips">' + chips + '</div>';
    return h + nudge() + '</div>';
  }
  function statusNote() {
    var L = S.L, my = S.srv.my;
    if (!S.nick) return '<div class="note warn">🔒 <b>로그인하고 풀면</b> 정답 기록 · 순위 · 연속 기록이 남아요. 지금은 연습 모드예요.<br><button type="button" class="btn sm" id="login">카카오 로그인</button></div>';
    if (L.rec || !my) return '';
    if (my.state === '완료') return '<div class="note ok">✅ 오늘 기록은 끝났어요' + (my.result === '정답' ? ' (' + my.guesses + '번 · ' + my.points + '점)' : ' (포기)') + '. 아래는 연습이라 점수에 안 들어가요.</div>';
    return '';
  }
  function resultCard() {
    var L = S.L, r = L.res, n = L.n;
    if (S.busy) return '<div class="card res"><div class="em">⏳</div><h2>기록 중…</h2></div>';
    var h = '<div class="card res pop"><div class="em">' + (L.win ? '🎉' : '😵') + '</div><h2>' + (L.win ? '정답이에요!' : '아쉬워요') + '</h2>' +
      '<p>' + (L.win ? '<b>' + esc(S.vocab[S.ans]) + '</b> — ' + n + '번 만에 맞혔어요' + (L.hints ? ' · 힌트 ' + L.hints : '') : '정답은 <b>' + esc(S.vocab[S.ans]) + '</b> 였어요') + '</p>';
    if (r && !r.error) {
      if (r.win) {
        h += '<div class="pts">+' + r.points + '점</div><div class="parts">' +
          '<span class="chip">기본 <b>' + r.parts.base + '</b></span>' + (r.parts.first ? '<span class="chip hot">선착순 ' + r.order + '등 <b>+' + r.parts.first + '</b></span>' : '<span class="chip">오늘 ' + r.order + '번째 정답</span>') +
          (r.parts.streak ? '<span class="chip hot">🔥 ' + r.streak + '일 연속 <b>+' + r.parts.streak + '</b></span>' : '') + (r.parts.hint ? '<span class="chip">힌트 <b>' + r.parts.hint + '</b></span>' : '') + '<span class="chip">⏱ ' + mmss(r.sec) + '</span></div>';
      } else h += '<p class="hint">0점 · 연속 기록이 끊겼어요. 내일 다시 도전!</p>';
    } else if (r && r.error) h += '<div class="note bad" style="margin-top:10px">기록하지 못했어요: ' + esc(r.error) + '</div>';
    else if (L.pend) h += '<div class="note warn" style="margin-top:10px">기록을 아직 못 보냈어요. <button type="button" class="btn sm" id="retry">다시 보내기</button></div>';
    else if (!L.rec) h += '<p class="hint">연습이라 기록은 없어요.</p>';
    h += '<div class="heat">' + L.g.slice(0, L.cnt).map(function (x) { return HEAT[tier(x.w)]; }).join('') + '</div>' +
      '<div class="btns"><button type="button" class="btn pri" id="share">📤 카톡으로 공유</button><button type="button" class="btn" id="topbtn">비슷한 단어 TOP 1000</button>' +
      (S.nick ? '<button type="button" class="btn" id="goRank">🏆 순위 보기</button>' : '') + '</div></div>';
    return h;
  }
  function rows() {
    var L = S.L, list = L.g.map(function (x, i) { return { w: x.w, n: i + 1, s: simOf(x.w), r: rankIn(x.w), h: x.h, win: S.idx.get(x.w) === S.ans }; });
    var last = S.lastW ? list.filter(function (o) { return o.w === S.lastW; })[0] : null;
    var sorted = list.slice().sort(function (a, b) { return b.s - a.s; });
    function tr(o, cls) {
      var pct = Math.max(0, Math.min(100, o.s / (S.scale.r1 || 1) * 100));
      var rk = o.win ? '정답!' : o.r ? '<div class="rbar"><em>' + o.r + '</em><i><b style="width:' + Math.max(4, (TOPN - o.r + 1) / TOPN * 100) + '%"></b></i></div>' : '<span class="sub">1000위 밖</span>';
      return '<tr class="' + cls + (o.h ? ' hintw' : '') + '"><td class="n">' + o.n + '</td><td class="w">' + esc(o.w) + '</td><td class="s">' + f2(o.s) + '<div class="bar2" style="width:' + (o.win ? 100 : pct) + '%"></div></td><td class="r">' + rk + '</td></tr>';
    }
    var h = '<table class="gt"><thead><tr><th class="n">#</th><th>추측한 단어</th><th class="s">유사도</th><th class="r">순위</th></tr></thead><tbody>';
    if (last && !last.win) h += tr(last, 'last') + '<tr><td colspan="4" style="padding:2px"></td></tr>';
    sorted.forEach(function (o) { if (!(last && !last.win && o.w === last.w)) h += tr(o, o.win ? 'win' : ''); });
    return h + '</tbody></table>';
  }
  function renderPlay() {
    var L = S.L, h = '';
    if (!S.srv || !S.srv.ready) {
      $('view').innerHTML = '<div class="card empty">📭<br><b>오늘 문제가 아직 준비되지 않았어요</b><br><small>운영진에게 알려 주세요 (시트 ‘꼬맨틀사전’ 에 오늘 날짜가 없어요)</small></div>'; return;
    }
    h += metaCard() + statusNote();
    if (L.done) h += resultCard();
    {
      h += '<form class="gform" id="gf" autocomplete="off"><input id="gw" type="text" inputmode="text" enterkeyhint="send" placeholder="' + (L.done ? '더 추측해 볼까요? (연습)' : '단어를 입력하세요') + '" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="20" aria-label="추측할 단어"><button type="submit" class="btn pri">추측</button></form>';
      var fb = S.fb; h += '<div class="fb t' + (fb ? fb.tr : 0) + '" id="fb">' + (fb ? TIER[fb.tr].e + ' ‘' + esc(fb.w) + '’ ' + TIER[fb.tr].t + (fb.r ? ' (' + fb.r + '위)' : '') : '') + '</div>';
      h += '<div class="tools"><button type="button" class="btn" id="hintBtn">💡 힌트' + (recordable() ? ' (' + (HINT_MAX - L.hints) + '/' + HINT_MAX + ' · −' + HINT_COST + '점)' : '') + '</button>' + (L.done ? '' : '<button type="button" class="btn" id="giveBtn">🏳️ 포기</button>') + '</div>';
    }
    if (L.g.length) h += '<div class="card" style="padding:8px 10px">' + rows() + '</div>';
    else if (!L.done) h += '<p class="hint">처음 입력해 볼 단어는 뭐든 괜찮아요. 예: <b>사람</b> · <b>음식</b> · <b>하늘</b> — 점수가 높은 쪽으로 따라가 보세요!</p>';
    var keep = document.activeElement && document.activeElement.id === 'gw' ? $('gw').value : '';
    $('view').innerHTML = h;
    var inp = $('gw'); if (inp) { if (keep) inp.value = keep; if (!L.done || S.fb) { try { inp.focus({ preventScroll: true }); } catch (e) {} } }
  }

  /* ---------- 순위 ---------- */
  /* ---------- 레이팅 등급 · 아직 안 푼 사람 · 프로필(이름을 누르면) ---------- */
  function tierOf(r) { return r >= 1700 ? { e: '👑', n: '마스터' } : r >= 1600 ? { e: '💎', n: '다이아' } : r >= 1500 ? { e: '🥇', n: '골드' } : r >= 1400 ? { e: '🥈', n: '실버' } : { e: '🥉', n: '브론즈' }; }
  function ratingLabel(st) { var r = st.rating || 1500, T = tierOf(r); return T.e + ' ' + r + ((st.rGames || 0) < 3 ? ' · 배치 중' : ''); }
  function pendingList(list) { return (list || []).filter(function (p) { return p.nick !== S.nick; }); }
  function pendingChips(list, max) {
    return list.slice(0, max).map(function (p) { return '<span class="pc" data-pnick="' + esc(p.nick) + '">' + esc(p.nick) + (p.streak > 1 ? ' 🔥' + p.streak : '') + '</span>'; }).join('') + (list.length > max ? '<span class="pc more">외 ' + (list.length - max) + '명</span>' : '');
  }
  function nudge() {   // 오늘 문제 머리 카드: 최근 7일 안에 한 사람 중 오늘 아직 안 한 사람
    var p = pendingList(S.srv.pending);
    if (!p.length) return '';
    return '<div class="nudge">⏳ <b>아직 안 푼 사람</b><div class="pcs">' + pendingChips(p, 6) + '</div></div>';
  }
  function pendingCard(R) {
    var p = pendingList(R.pending);
    return p.length ? '<div class="card"><h3>⏳ 오늘 아직 안 푼 사람 <small>최근 7일 참여자</small></h3><div class="pcs">' + pendingChips(p, 15) + '</div><div class="hint">이름을 누르면 기록을 볼 수 있어요. 연속 기록이 끊기기 전에 콕 찔러 주세요 😄</div></div>' : '';
  }
  function cmpRow(label, a, b, lowerBetter) {
    var an = Number(a), bn = Number(b), good = isFinite(an) && isFinite(bn) && an !== bn ? (lowerBetter ? an < bn : an > bn) : null;
    return '<div class="cmp"><span class="a' + (good === true ? ' w' : '') + '">' + (a === '' || a == null ? '-' : a) + '</span><span class="l">' + label + '</span><span class="b' + (good === false ? ' w' : '') + '">' + (b === '' || b == null ? '-' : b) + '</span></div>';
  }
  function profile(nick) {
    var R = S.rank, pr = R && R.people && R.people[nick];
    if (!pr) return;
    var st = pr.st || { rating: 1500, rGames: 0, solves: 0, avg: 0, best: 0, streak: 0, bestStreak: 0, points: 0, badges: [] }, t = pr.today, isMe = nick === S.nick, mine = R.mine, T = tierOf(st.rating || 1500);
    var today = t ? (t.result === '정답' ? '오늘 <b>' + t.g + '번</b> 만에 맞혔어요 · ⏱ ' + mmss(t.sec) + (t.h ? ' · 힌트 ' + t.h : '') + ' · +' + t.pts + '점 (오늘 ' + t.order + '번째)' : '오늘은 포기했어요 🏳️') : '오늘은 아직 안 풀었어요 ⏳';
    var h = '<div class="me-top">' + av(nick, 56) + '<div class="t"><b>' + esc(nick) + (isMe ? ' (나)' : '') + '</b><small>' + T.e + ' ' + T.n + ' · ' + (st.rating || 1500) + ((st.rGames || 0) < 3 ? ' (배치 중)' : '') + '</small></div></div>' +
      '<p style="margin:10px 0 4px">' + today + '</p>' +
      '<div class="stats"><div><b>' + (st.streak ? '🔥' + st.streak : 0) + '</b><small>연속</small></div><div><b>' + (st.bestStreak || 0) + '</b><small>최고 연속</small></div><div><b>' + (st.solves || 0) + '</b><small>정답</small></div><div><b>' + (st.avg || '-') + '</b><small>평균 추측</small></div></div>';
    if (!isMe && mine) {
      h += '<h4 style="margin:12px 0 2px">⚔️ 나와 비교</h4><div class="cmps"><div class="cmp hd"><span class="a">나</span><span class="l"></span><span class="b">' + esc(nick) + '</span></div>' +
        cmpRow('레이팅', mine.rating || 1500, st.rating || 1500) + cmpRow('연속', mine.streak || 0, st.streak || 0) + cmpRow('최고 연속', mine.bestStreak || 0, st.bestStreak || 0) +
        cmpRow('정답 횟수', mine.solves || 0, st.solves || 0) + cmpRow('평균 추측', mine.avg || '', st.avg || '', true) + cmpRow('최소 추측', mine.best || '', st.best || '', true) + '</div>';
    }
    var bd = (st.badges || []).map(function (b) { return '<span class="chip">' + b.emoji + ' ' + esc(b.name) + '</span>'; }).join('');
    h += '<h4 style="margin:12px 0 4px">배지</h4>' + (bd ? '<div class="chips" style="margin-top:0">' + bd + '</div>' : '<p class="hint">아직 없어요</p>') +
      '<p class="hint">추측한 단어는 비밀이에요 🤫 (스포일러 방지)</p><div class="btns"><button type="button" class="btn pri" data-x>닫기</button></div>';
    openModal(h);
  }

  function loadRank() {
    if (S.rank && Date.now() - S.rank.at < 30000) return Promise.resolve();
    $('view').innerHTML = '<div class="empty">⏳ 순위를 불러오는 중…</div>';
    return api('semRank', [token()]).then(function (r) { S.rank = r; r.at = Date.now(); }, function (e) { S.rank = null; toast(e.message, true); });
  }
  function rkRows(list, kind) {
    if (!list || !list.length) return kind === 'rate' ? '<div class="empty">아직 레이팅 순위에 오른 사람이 없어요.<br>하루에 두 명 이상 풀고, 3일 이상 참여하면 올라와요! 📈</div>' : '<div class="empty">아직 기록이 없어요.<br>첫 번째 주인공이 되어 보세요! 🏁</div>';
    return list.map(function (o) {
      var me = S.nick && o.nick === S.nick, sub, v;
      if (kind === 'today') { sub = mmss(o.sec) + (o.h ? ' · 힌트 ' + o.h : '') + ' · 오늘 ' + o.order + '번째'; v = o.g + '번<small>+' + o.pts + '점</small>'; }
      else if (kind === 'streak') { sub = '최고 ' + o.best + '일'; v = '🔥 ' + o.v + '일'; }
      else if (kind === 'rate') { var T = tierOf(o.v); sub = o.games + '일 참여 · 최근 ' + (o.delta > 0 ? '+' : '') + o.delta; v = T.e + ' ' + o.v + '<small>' + T.n + '</small>'; }
      else { sub = '정답 ' + o.solves + '회'; v = o.v + '점'; }
      return '<div class="rk tap' + (me ? ' me' : '') + '" data-nick="' + esc(o.nick) + '"><span class="n' + (o.rank <= 3 ? ' m' + o.rank : '') + '">' + (o.rank === 1 ? '🥇' : o.rank === 2 ? '🥈' : o.rank === 3 ? '🥉' : o.rank) + '</span>' + av(o.nick, 32) +
        '<span class="t"><b>' + esc(o.nick) + '</b><small>' + esc(sub) + '</small></span><span class="v">' + v + '</span></div>';
    }).join('');
  }
  function renderRank() {
    var R = S.rank;
    if (!R) { loadRank().then(function () { if (S.view === 'rank') { if (S.rank) renderRank(); else $('view').innerHTML = '<div class="card empty">순위를 불러오지 못했어요.<br><button type="button" class="btn sm" id="rkRetry">다시 시도</button></div>'; } }); return; }
    var me = R.mine, h = '';
    if (me) {
      var have = {}; (me.badges || []).forEach(function (b) { have[b.id] = 1; });
      h += '<div class="card"><div class="me-top">' + av(R.me, 48) + '<div class="t"><b>' + esc(R.me) + '</b><small>' + (me.streak ? '🔥 ' + me.streak + '일 연속 정답 중' : '오늘 맞히면 연속 기록 시작!') + '</small></div></div>' +
        '<div class="stats"><div><b>' + tierOf(me.rating || 1500).e + ' ' + (me.rating || 1500) + '</b><small>' + ((me.rGames || 0) < 3 ? '레이팅(배치 중)' : '레이팅') + '</small></div><div><b>' + me.week + '</b><small>이번 주</small></div><div><b>' + me.season + '</b><small>시즌</small></div><div><b>' + me.solves + '</b><small>정답</small></div></div>' +
        '<div class="hint" style="margin-top:6px">평균 추측 ' + (me.avg || '-') + '번 · 누적 ' + me.points + '점 · 최고 연속 ' + me.bestStreak + '일 · 최소 ' + (me.best || '-') + '번' + (me.firsts ? ' · 선두 ' + me.firsts + '번' : '') + '</div>' +
        '<div class="badges">' + BADGES.map(function (b) { return '<div class="badge' + (have[b.id] ? '' : ' off') + '" title="' + esc(b.d) + '"><div class="e">' + b.e + '</div><b>' + esc(b.n) + '</b><small>' + esc(b.d) + '</small></div>'; }).join('') + '</div></div>';
    } else h += '<div class="note warn">🔒 로그인하면 내 순위와 배지를 볼 수 있어요.<br><button type="button" class="btn sm" id="login">카카오 로그인</button></div>';
    var tabs = [['today', '오늘'], ['week', '이번 주'], ['season', '시즌'], ['streak', '연속'], ['rate', '레이팅']];
    var tab = S.rkTab, list = tab === 'today' ? R.today : tab === 'week' ? R.weekly : tab === 'season' ? R.seasonal : tab === 'rate' ? R.rated : R.streaks;
    var title = tab === 'today' ? '오늘의 정답자 <small>' + R.day + ' · 적은 추측 순</small>' : tab === 'week' ? '이번 주 포인트 <small>' + R.week + '(월)~</small>' : tab === 'season' ? '시즌 포인트 <small>' + R.season + '</small>' : tab === 'rate' ? '레이팅 <small>' + R.season + ' · 3일 이상 참여</small>' : '연속 정답 <small>지금 이어가는 중</small>';
    h += '<div class="seg sm" id="rkTabs">' + tabs.map(function (t) { return '<button type="button" data-t="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div class="card"><h3>' + title + '</h3>' + rkRows(list, tab === 'week' || tab === 'season' ? 'pts' : tab) +
      (tab === 'today' ? '<div class="hint">오늘 ' + R.solvedToday + '명 정답 · 참여 회원 ' + R.people + '명</div>' : '') +
      (tab === 'rate' ? '<div class="hint">그 날 푼 사람끼리 추측 횟수를 겨루는 Elo 점수 (처음 1500). 오늘 결과는 잠정이라 사람이 더 풀면 조금 바뀌어요.</div>' : '') + '</div>' + pendingCard(R) +
      '<p class="hint">순위는 1분마다 갱신돼요. 시즌은 분기(1 · 4 · 7 · 10월)마다 새로 시작해요.</p>';
    $('view').innerHTML = h;
  }

  /* ---------- 내 기록 (지난 날 추측 · 정답) ---------- */
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  function dayLabel(d) { var p = String(d).split('-'); return p.length === 3 ? (+p[1]) + '/' + (+p[2]) + '(' + WD[new Date(+p[0], +p[1] - 1, +p[2]).getDay()] + ')' : d; }
  function renderHist() {
    if (!S.nick) { $('view').innerHTML = '<div class="note warn">🔒 로그인하면 지난 기록과 내가 입력한 단어를 다시 볼 수 있어요.<br><button type="button" class="btn sm" id="login">카카오 로그인</button></div>'; return; }
    if (!S.hist) {
      $('view').innerHTML = '<div class="empty">⏳ 내 기록을 불러오는 중…</div>';
      api('semHistory', [token()]).then(function (r) { S.hist = r; S.histAt = Date.now(); if (S.view === 'hist') renderHist(); },
        function (e) { if (S.view === 'hist') $('view').innerHTML = '<div class="card empty">기록을 불러오지 못했어요.<br><small>' + esc(e.message) + '</small><br><button type="button" class="btn sm" id="histRetry" style="margin-top:8px">다시 시도</button></div>'; });
      return;
    }
    var list = S.hist, wins = list.filter(function (o) { return o.result === '정답'; }), sumG = 0, sumP = 0;
    wins.forEach(function (o) { sumG += o.guesses; sumP += o.points; });
    var h = '<div class="card"><h3>📜 내 기록 <small>최근 ' + list.length + '판</small></h3><div class="stats"><div><b>' + list.length + '</b><small>도전</small></div><div><b>' + wins.length + '</b><small>정답</small></div><div><b>' + (wins.length ? Math.round(sumG / wins.length * 10) / 10 : '-') + '</b><small>평균 추측</small></div><div><b>' + sumP + '</b><small>점수</small></div></div></div>';
    if (!list.length) h += '<div class="card empty">아직 기록이 없어요.<br>오늘 문제를 풀면 여기에 쌓여요! 🌱</div>';
    list.forEach(function (o) {
      var ok = o.result === '정답', tag = o.state === '진행중' ? '<span class="chip on">진행 중</span>' : o.state === '만료' ? '<span class="chip">미완료</span>' : ok ? '<span class="chip on">정답</span>' : '<span class="chip">포기</span>';
      var words = String(o.g || '').split('|').filter(Boolean);
      h += '<details class="card hc"><summary><span class="d">' + esc(dayLabel(o.day)) + '</span>' + tag + '<span class="m">' + (o.state === '완료' ? o.guesses + '번' + (ok ? ' · +' + o.points + '점' : '') : '') + '</span></summary>' +
        (o.answer ? '<p class="hint" style="margin-top:8px">정답: <b>' + esc(o.answer) + '</b>' + (o.state === '완료' ? ' · ⏱ ' + mmss(o.sec) + (o.hints ? ' · 힌트 ' + o.hints : '') + (ok && o.order ? ' · 오늘 ' + o.order + '번째' : '') : '') + '</p>' : '') +
        (words.length ? '<div class="gchips">' + words.map(function (t, i) { var hint = t.charAt(0) === '*', w = hint ? t.slice(1) : t; return '<span class="gc' + (o.answer && w === o.answer ? ' ok' : '') + '">' + (i + 1) + '. ' + esc(w) + (hint ? ' 💡' : '') + '</span>'; }).join('') + '</div>' : '<p class="hint">저장된 추측이 없어요.</p>') + '</details>';
    });
    $('view').innerHTML = h + '<p class="hint">추측한 단어는 서버에 저장돼서 기기를 바꿔도 이어서 할 수 있어요.</p>';
  }

  function topList() {
    var have = {}; guessWords().forEach(function (w) { have[w] = 1; });
    var h = '<h2>비슷한 단어 TOP ' + TOPN + '</h2><p>비밀 단어: <b>' + esc(S.vocab[S.ans]) + '</b></p><div class="toplist">';
    S.top.forEach(function (ix, r) { var w = S.vocab[ix]; h += '<div class="' + (have[w] ? 'g' : '') + '"><span class="n">' + (r + 1) + '</span><span class="w">' + esc(w) + '</span><span class="s">' + f2(S.sims[ix]) + '</span></div>'; });
    openModal(h + '</div><div class="btns"><button type="button" class="btn pri" data-x>닫기</button></div>');
  }

  /* ================= 이벤트 ================= */
  document.addEventListener('submit', function (e) { if (e.target.id === 'gf') { e.preventDefault(); var v = $('gw').value; $('gw').value = ''; guess(v); } });
  document.addEventListener('click', function (e) {
    var rk = e.target.closest('.rk[data-nick]'); if (rk) return profile(rk.getAttribute('data-nick'));
    var pc = e.target.closest('[data-pnick]'); if (pc) return profile(pc.getAttribute('data-pnick'));
    var t = e.target.closest('button'); if (!t) return;
    switch (t.id) {
      case 'login': return startLogin();
      case 'hintBtn': return hint();
      case 'giveBtn': return giveUp();
      case 'share': return share();
      case 'topbtn': return topList();
      case 'retry': return retryPending();
      case 'goRank': return go('rank');
      case 'rkRetry': S.rank = null; return renderRank();
      case 'histRetry': S.hist = null; return renderHist();
    }
    if (t.parentNode && t.parentNode.id === 'rkTabs') { S.rkTab = t.getAttribute('data-t'); lsSet(LS.tab, S.rkTab); renderRank(); }
  });
  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) go(b.getAttribute('data-v')); });
  function go(v) { S.view = v; if (v === 'rank' && S.rank && Date.now() - S.rank.at > 30000) S.rank = null; if (v === 'hist' && Date.now() - S.histAt > 30000) S.hist = null; render(); window.scrollTo(0, 0); }
  $('back').onclick = function () { if (S.view !== 'play') return go('play'); location.href = ROOT; };
  $('helpBtn').onclick = help;
  window.addEventListener('online', retryPending);
  document.addEventListener('visibilitychange', function () { if (document.hidden) flushSave(); });
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.srv && S.srv.ready && S.L && S.L.day && S.srv.day !== todayKST()) location.reload(); });
  function todayKST() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }

  /* ================= 시작 ================= */
  function boot() {
    if (/[?&]reset\b/.test(location.search)) history.replaceState(null, '', location.pathname);   // 잠만보 메뉴가 붙이는 ?reset (예전 서비스 워커 우회용)
    renderAcct();
    $('view').innerHTML = '<div class="empty">⏳ 오늘 문제를 불러오는 중…<br><small>처음엔 단어 목록(약 450KB)을 받느라 조금 걸려요</small></div>';
    Promise.all([loadVocab(), api('semToday', [token()])]).then(function (res) {
      var vocab = res[0], srv = res[1];
      S.srv = srv; S.nick = srv.me || '';
      if (!srv.ready) { render(); return; }
      if (vocab.hash && srv.vh && vocab.hash !== srv.vh) throw new Error('단어 목록이 새로 바뀌었어요. 주소 끝에 ?x=' + Date.now() % 1000 + ' 를 붙여 새로고침 해 주세요');
      prepare(vocab, srv);
      var L = lsJSON(LS.play);
      if (!L || L.day !== srv.day || L.vh !== srv.vh) L = freshLocal();
      S.L = L;
      var my = srv.my;
      mergeServer(L, my);
      if (!L.done && L.g.length === 0) L.rec = !!(S.nick && my && my.state !== '완료');
      else if (S.nick && my && my.state === '완료' && L.rec && !L.res) { L.rec = false; }   // 다른 기기에서 이미 기록함
      if (L.rec && my && my.state === '진행중' && !L.nonce) ensureStart();   // 다른 기기/새로고침: 이어 하기 (서버가 확인값을 다시 줌)
      saveLocal();
      if (S.view === 'play' && lsGet(LS.help) !== '1') setTimeout(help, 400);
      render();
      if (L.pend) retryPending();
    }).catch(function (e) {
      $('view').innerHTML = '<div class="card empty">😢<br><b>' + esc(e.message || '불러오지 못했어요') + '</b><br><button type="button" class="btn sm" id="again" style="margin-top:10px">다시 시도</button></div>';
      var b = $('again'); if (b) b.onclick = boot;
    });
  }
  /* 접속 기록: 기기마다 30분에 한 번 잠만보 서버(logVisit)에 남김 → 시트 '접속기록' (페이지 = 꼬맨틀). 실패해도 게임과 상관없음 */
  function logVisit() {
    try {
      if (!API) return;
      var key = 'sem_visit_at' + ENV_SFX;
      if (Date.now() - (+lsGet(key) || 0) < 30 * 60e3) return;
      lsSet(key, String(Date.now()));
      var cid = lsGet('jmb_vid');   // 잠만보 화면과 같은 기기 구분 값 (개인 정보 아님)
      if (!cid) { cid = Date.now().toString(36) + Math.random().toString(36).slice(2, 10); lsSet('jmb_vid', cid); }
      var info = { page: '꼬맨틀', cid: cid, ua: navigator.userAgent, w: screen.width, h: screen.height, touch: navigator.maxTouchPoints || 0,
        app: (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone ? 1 : 0 };
      var send = function () { fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: 'logVisit', args: [info, token()], env: ENV !== 'prod' ? 'beta' : undefined }) }).catch(function () {}); };
      var uad = navigator.userAgentData;
      if (uad && uad.getHighEntropyValues) { info.mobile = !!uad.mobile; uad.getHighEntropyValues(['model']).then(function (h) { info.model = h.model || ''; send(); }, send); }
      else send();
    } catch (e) {}
  }
  setTimeout(logVisit, 3000);   // 화면이 뜬 뒤에
  boot();
})();
