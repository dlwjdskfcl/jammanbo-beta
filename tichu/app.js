/*! 잠만보 티츄 — 화면 v1.2.0
 * 서버: Apps Script (config.js 의 api) · 규칙 판정: engine.js(TE, 서버와 같은 코드)
 * 화면 주소: #/ 로비 · #/rank 랭킹 · #/me 내 전적 · #/rules 규칙 · #/room/<방ID> 방
 */
(function () {
  'use strict';
  var APP_VER = '1.8.5';   // 화면 버전 — 계정 창(이름 버튼)에 표시. 서버 버전은 응답의 sv
  var CFG = window.TICHU_CONFIG || {};
  var ENV_SFX = CFG.env && CFG.env !== 'prod' ? '_' + CFG.env : '';
  var LS_TOKEN = 'tichu_token' + ENV_SFX, LS_NOAUTO = 'tichu_noauto' + ENV_SFX, LS_SOUND = 'tichu_sound', LS_VOICE = 'tichu_voice', LS_SEEN = 'tichu_seen_rules', LS_BOTD = 'tichu_botdelay';
  var KAKAO_STORE = 'jmb_kakao_v2' + ENV_SFX, KAKAO_STATE = 'jmb_kakao_state' + ENV_SFX;
  var ROOT = (function () { var seg = location.pathname.split('/')[1] || ''; return /\.github\.io$/.test(location.hostname) && seg ? '/' + seg + '/' : '/'; })();
  var app = document.getElementById('app'), modalEl = document.getElementById('modal'), toastsEl = document.getElementById('toasts');

  var S = {
    token: null, user: null, route: { name: 'boot' }, lobby: null, rank: null, rec: null, notice: '',
    room: null, roomId: null, roomPw: '', sel: [], exch: [null, null, null], exSlot: 0, exRound: 0,
    lastSeq: 0, seqMatch: '', polling: false, pollSeq: 0, optim: null, backAt: 0, guard: false, lastChat: 0, unread: 0, offset: 0, busy: false, pollT: 0, lobbyT: 0,
    modal: null, resultShown: '', recvShown: '', sound: lsGet(LS_SOUND) !== '0', voice: lsGet(LS_VOICE) !== '0', sv: '', hintI: -1, chatOpen: false, flash: {}
  };

  /* ================= 공통 ================= */
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function now() { return Date.now() + S.offset; }
  function toast(msg, err) {
    var d = document.createElement('div');
    d.className = 'toast' + (err ? ' err' : '');
    d.textContent = msg;
    toastsEl.appendChild(d);
    setTimeout(function () { d.remove(); }, err ? 3800 : 2600);
    while (toastsEl.children.length > 3) toastsEl.firstChild.remove();
  }
  function banner(text, cls) {
    var d = document.createElement('div');
    d.className = 'banner ' + (cls || '');
    d.textContent = text;
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 1500);
  }
  function initial(name) { name = String(name || '?').replace(/봇$/, ''); return esc(Array.from(name)[0] || '?'); }

  /* ----- 소리 (WebAudio로 즉석 합성, 파일 없음) ----- */
  var actx = null;
  function ac() {
    if (!S.sound) return null;
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); return actx; } catch (e) { return null; }
  }
  function tone(c, f, t, d, type, vol, f2) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.08, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + 0.05);
  }
  var noiseBuf = null;
  function noise(c, t, d, vol, cutoff) {
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); var ch = noiseBuf.getChannelData(0); for (var i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1; }
    var src = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf; fl.type = 'lowpass'; fl.frequency.value = cutoff || 1200;
    g.gain.setValueAtTime(vol || 0.1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(fl); fl.connect(g); g.connect(c.destination); src.start(t); src.stop(t + d + 0.05);
  }
  // 개 짖는 소리 한 번: 목소리(톱니파가 위로 갔다 뚝 떨어짐) + 숨소리(걸러낸 잡음). p: 음 높이 배율 (세 번이 조금씩 다르게)
  function bark(c, t, p) {
    var o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(380 * p, t);
    o.frequency.exponentialRampToValueAtTime(720 * p, t + 0.035);
    o.frequency.exponentialRampToValueAtTime(260 * p, t + 0.15);
    fl.type = 'bandpass'; fl.frequency.value = 1100 * p; fl.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(fl); fl.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.2);
    noise(c, t, 0.07, 0.05, 1800);
  }
  // 참새 '짹' 한 번: 아주 높은 음이 순간적으로 치솟았다 떨어짐. p: 음 높이 배율
  function chirp(c, t, p) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(3200 * p, t);
    o.frequency.exponentialRampToValueAtTime(5200 * p, t + 0.025);
    o.frequency.exponentialRampToValueAtTime(2800 * p, t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.1);
  }
  // 봉황 울음 '끼요오~': 높이 치솟았다가 떨리며(비브라토) 길게 내려옴. 한 옥타브 위 소리를 살짝 겹침
  function cry(c, t) {
    var g = c.createGain(), hi = c.createGain(), lfo = c.createOscillator(), depth = c.createGain(), oscs = [];
    lfo.frequency.value = 7; depth.gain.value = 70; lfo.connect(depth);
    [1, 2].forEach(function (m) {
      var o = c.createOscillator();
      o.type = m === 1 ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(1300 * m, t);
      o.frequency.exponentialRampToValueAtTime(2300 * m, t + 0.12);
      o.frequency.exponentialRampToValueAtTime(1500 * m, t + 0.9);
      depth.connect(o.frequency);
      o.connect(m === 1 ? g : hi);
      oscs.push(o);
    });
    hi.gain.value = 0.3; hi.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.05);
    g.gain.setValueAtTime(0.07, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    g.connect(c.destination);
    oscs.concat([lfo]).forEach(function (o) { o.start(t); o.stop(t + 1.05); });
  }
  // 용 포효 '크아앙': 낮은 톱니파가 부풀었다 가라앉음 + 그르렁(소리 크기를 빠르게 흔듦) + 거친 숨(잡음)
  function roar(c, t) {
    var o = c.createOscillator(), fl = c.createBiquadFilter(), amp = c.createGain(), g = c.createGain(), trem = c.createOscillator(), tg = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.25);
    o.frequency.exponentialRampToValueAtTime(55, t + 1.2);
    fl.type = 'lowpass'; fl.Q.value = 4;
    fl.frequency.setValueAtTime(400, t);
    fl.frequency.exponentialRampToValueAtTime(1400, t + 0.25);
    fl.frequency.exponentialRampToValueAtTime(300, t + 1.2);
    trem.frequency.value = 28; tg.gain.value = 0.5; amp.gain.value = 0.6; trem.connect(tg); tg.connect(amp.gain);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.15);
    g.gain.setValueAtTime(0.25, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
    o.connect(fl); fl.connect(amp); amp.connect(g); g.connect(c.destination);
    [o, trem].forEach(function (x) { x.start(t); x.stop(t + 1.3); });
    noise(c, t + 0.05, 1.1, 0.12, 900);
  }
  function seq(c, t, notes, step, dur, type, vol) { notes.forEach(function (f, i) { tone(c, f, t + i * step, dur, type, vol); }); }
  var N = { G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, D6: 1174.7, E6: 1318.5, G6: 1568 };
  function sfx(name, delay) {
    var c = ac(); if (!c) return;
    var t = c.currentTime + (delay || 0);
    switch (name) {
      case 'tap': tone(c, 1300, t, 0.03, 'square', 0.012); break;
      case 'play': noise(c, t, 0.06, 0.05, 2600); tone(c, 360, t, 0.08, 'triangle', 0.05, 260); break;            // 카드 내려놓는 소리
      case 'pass': tone(c, 230, t, 0.12, 'sine', 0.025, 180); break;
      case 'pair': noise(c, t, 0.05, 0.05, 2600); tone(c, 380, t, 0.08, 'triangle', 0.05, 280); noise(c, t + 0.07, 0.05, 0.05, 2600); tone(c, N.E5, t + 0.07, 0.14, 'triangle', 0.045); break;
      case 'triple': [0, 0.06, 0.12].forEach(function (d, i) { noise(c, t + d, 0.04, 0.05, 2600); tone(c, [N.C5, N.E5, N.G5][i], t + d, 0.16, 'triangle', 0.045); }); break;
      case 'full': noise(c, t, 0.05, 0.05, 2600); seq(c, t, [N.C5, N.E5, N.G5], 0.05, 0.2, 'triangle', 0.045); [N.G5, N.C6].forEach(function (f) { tone(c, f, t + 0.2, 0.35, 'sine', 0.04); }); tone(c, 130.8, t + 0.2, 0.35, 'triangle', 0.05); break;
      case 'straight': noise(c, t, 0.05, 0.04, 2600); seq(c, t, [N.C5, 587.3, N.E5, 698.5, N.G5, N.A5, N.B5].slice(0, 5), 0.045, 0.16, 'triangle', 0.045); break;
      case 'pairs': noise(c, t, 0.05, 0.04, 2600); seq(c, t, [N.C5, N.C5, N.E5, N.E5, N.G5, N.G5], 0.05, 0.12, 'square', 0.025); break;
      case 'sf': noise(c, t, 1.0, 0.3, 500); tone(c, 80, t, 0.9, 'sawtooth', 0.12, 30); seq(c, t + 0.15, [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6], 0.05, 0.25, 'square', 0.035); break;
      case 'combo': noise(c, t, 0.05, 0.04, 2600); seq(c, t, [N.C5, N.E5, N.G5, N.C6], 0.055, 0.18, 'triangle', 0.05); break;   // 트리플·스트레이트·연속 페어
      case 'bigcombo': noise(c, t, 0.05, 0.05, 2600); seq(c, t, [N.C5, N.E5, N.G5, N.B5, N.D6, N.E6, N.G6], 0.045, 0.2, 'triangle', 0.05); break;   // 긴 스트레이트·풀하우스
      case 'dragon': roar(c, t); break;                                                                       // 크아앙
      case 'phoenix': cry(c, t); seq(c, t + 0.5, [2637, 3136, 3951], 0.07, 0.25, 'sine', 0.015); break;         // 끼요오~ + 반짝
      case 'dog': [0, 0.2, 0.42].forEach(function (d, i) { bark(c, t + d, [1, 1.08, 0.94][i]); }); break;   // 왈왈왈
      case 'join': tone(c, N.E5, t, 0.35, 'sine', 0.07); tone(c, N.C5, t + 0.22, 0.5, 'sine', 0.07); break;     // 딩동 — 누가 자리에 앉음
      case 'watch': tone(c, N.G5, t, 0.18, 'sine', 0.035, N.C6); break;                                     // 관전자 들어옴 (작게)
      case 'bird': [0, 0.13, 0.22].forEach(function (d, i) { chirp(c, t + d, [1, 1.06, 0.97][i]); }); break;   // 짹 짹짹
      case 'bomb': noise(c, t, 0.9, 0.3, 380); tone(c, 95, t, 0.8, 'sawtooth', 0.12, 32); tone(c, 60, t + 0.05, 0.9, 'sine', 0.15, 30); break;
      case 'turn': tone(c, N.E5, t, 0.15, 'sine', 0.08); tone(c, N.A5, t + 0.12, 0.25, 'sine', 0.08); if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} } break;
      case 'trickUs': seq(c, t, [N.E5, N.G5], 0.07, 0.16, 'sine', 0.05); break;
      case 'trickBig': seq(c, t, [N.C5, N.E5, N.G5, N.C6], 0.06, 0.25, 'sine', 0.06); break;
      case 'tichu': seq(c, t, [N.G4, N.C5, N.E5], 0.1, 0.18, 'square', 0.035); tone(c, N.G5, t + 0.3, 0.5, 'square', 0.04); break;
      case 'out': seq(c, t, [N.G5, N.B5, N.D6, N.G6], 0.08, 0.3, 'triangle', 0.06); break;
      case 'round': [N.C5, N.E5, N.G5].forEach(function (f) { tone(c, f, t, 0.7, 'sine', 0.04); }); break;
      case 'onetwo': seq(c, t, [N.C5, N.E5, N.G5, N.C6, N.G5, N.C6, N.E6], 0.09, 0.3, 'square', 0.035); break;
      case 'win': seq(c, t, [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6], 0.12, 0.4, 'triangle', 0.06); [N.C5, N.E5, N.G5].forEach(function (f) { tone(c, f * 2, t + 0.75, 0.9, 'sine', 0.035); }); break;
      case 'lose': seq(c, t, [N.G5, N.E5, N.C5, N.G4], 0.18, 0.4, 'triangle', 0.05); break;
      case 'tick': tone(c, 1500, t, 0.04, 'square', 0.02); break;
      case 'chat': tone(c, 900, t, 0.06, 'sine', 0.035, 1250); break;
    }
  }
  // 낸 조합에 맞는 소리 — 조합마다 다른 소리
  function comboSound(c, bomb) {
    if (bomb) return c && c.t === 'sf' ? 'sf' : 'bomb';
    if (!c) return 'play';
    if (c.t === 'dog') return 'dog';
    if (c.t === 'single' && c.r === 15) return 'dragon';
    if (c.t === 'single' && c.ph) return 'phoenix';
    if (c.c && c.c.indexOf('MA') >= 0) return 'bird';
    if (c.t === 'single') return 'play';
    if (c.t === 'straight') return c.n >= 8 ? 'bigcombo' : 'straight';
    if (c.t === 'pairs') return c.n >= 6 ? 'bigcombo' : 'pairs';
    return c.t;   // pair · triple · full
  }

  /* ----- 음성 안내 (휴대폰 내장 TTS: '케이 페어', '패스', '마이 턴') ----- */
  var VOICE_R = { 1: '원', 11: '제이', 12: '큐', 13: '케이', 14: '에이' };
  function vr(r) { return VOICE_R[r] || String(r); }
  function comboVoice(c) {
    if (!c) return '';
    if (c.t === 'dog') return '왈왈왈';
    if (c.t === 'single') return c.r === 15 ? '용' : c.ph ? '봉황' : c.r === 1 ? '참새' : vr(c.r);
    if (c.t === 'pair') return vr(c.r) + ' 페어';
    if (c.t === 'triple') return vr(c.r) + ' 트리플';
    if (c.t === 'full') return vr(c.r) + ' 풀하우스';
    if (c.t === 'straight') return c.n + '장 스트레이트';
    if (c.t === 'pairs') return (c.n / 2) + '연속 페어';
    if (c.t === 'bomb') return vr(c.r) + ' 포카드 폭탄';
    if (c.t === 'sf') return '스트레이트 플러시 폭탄';
    return '';
  }
  var voiceKo = null, sayBusy = 0;
  function pickVoice() {
    try { var vs = speechSynthesis.getVoices(); voiceKo = vs.filter(function (v) { return /^ko/i.test(v.lang) && v.localService; })[0] || vs.filter(function (v) { return /^ko/i.test(v.lang); })[0] || null; } catch (e) {}
  }
  if (window.speechSynthesis) { pickVoice(); try { speechSynthesis.onvoiceschanged = pickVoice; } catch (e) {} }
  var sayTimers = [];
  // 지금 밀려 있는 말·예약된 말을 모두 끊음 (라운드·게임 끝, 방 나가기)
  function hush() {
    sayTimers.forEach(clearTimeout); sayTimers = [];
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    sayBusy = 0;
  }
  function say(text, delay) {
    if (!S.voice || !text || !window.speechSynthesis || document.hidden) return;
    var tm = setTimeout(function () {
      sayTimers = sayTimers.filter(function (x) { return x !== tm; });
      if (S.route.name !== 'room') return;
      try {
        if (sayBusy >= 2) { speechSynthesis.cancel(); sayBusy = 0; }   // 밀리면 지난 말은 끊고 최신 것만
        var u = new SpeechSynthesisUtterance(text);
        u.lang = 'ko-KR'; if (voiceKo) u.voice = voiceKo; u.rate = 1.15; u.volume = 1;
        sayBusy++; u.onend = u.onerror = function () { sayBusy = Math.max(0, sayBusy - 1); };
        speechSynthesis.speak(u);
      } catch (e) {}
    }, Math.round((delay || 0) * 1000));
    sayTimers.push(tm);
  }
  // 아이폰 등은 첫 터치 때 소리를 열어 둬야 해요
  function unlockAudio() {
    document.removeEventListener('pointerdown', unlockAudio, true);
    ac();
    try { if (window.speechSynthesis && S.voice) { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch (e) {}
  }
  document.addEventListener('pointerdown', unlockAudio, true);

  /* ----- 서버 호출 ----- */
  function api(fn, a, timeoutMs) {
    if (!CFG.api || /^YOUR_/.test(CFG.api)) return Promise.reject(new Error('티츄 서버 주소(tichu/config.js)가 아직 설정되지 않았어요'));
    // 응답이 없으면 끊고 다시 시도 (카톡 인앱 브라우저·사파리에서 요청이 멈춰 버리는 경우 대비)
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs || 20000) : 0;
    // env: 테스트·내 PC 에서는 'beta' → 티츄 서버가 카카오 확인도 잠만보 '테스트' 배포로 함 (운영은 안 붙임)
    return fetch(CFG.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: fn, t: S.token || '', a: a || {}, env: CFG.env && CFG.env !== 'prod' ? 'beta' : undefined }), signal: ctl ? ctl.signal : undefined, cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('서버 응답 오류 (' + r.status + ')');
        return r.text().then(function (t) { try { return JSON.parse(t); } catch (x) { throw new Error('서버가 바빠요. 잠시 후 다시 시도해 주세요'); } });
      })
      .then(function (j) {
        clearTimeout(timer);
        if (j && j.now) S.offset = j.now - Date.now();
        if (j) S.sv = j.sv || 'old';   // 옛 서버는 버전을 안 보냄
        if (!j || !j.ok) {
          var e = new Error((j && j.e) || '알 수 없는 오류');
          e.code = j && j.code;
          if (e.code === 'auth' || e.code === 'maint') logout(e.message);
          throw e;
        }
        return j.r;
      }, function (e) {
        clearTimeout(timer);
        if (e && typeof e.code === 'string' && e.code) throw e;          // 서버가 보낸 오류 코드(auth·gone 등). 브라우저 오류(DOMException)의 숫자 code 는 제외
        var ne = new Error(e && (e.name === 'AbortError' || /abort/i.test(e.message || '')) ? '응답이 늦어 다시 연결하는 중이에요'
          : (e && /서버/.test(e.message || '') ? e.message : '연결이 잠깐 끊겼어요. 다시 연결하는 중이에요'));
        ne.net = true;
        throw ne;
      });
  }

  /* ================= 카드 그리기 ================= */
  var SUIT_SVG = {
    J: '<path fill-rule="evenodd" d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zM8.7 8.7h6.6v6.6H8.7z"/>',
    S: '<path d="M12 1.5l2.3 3.2v10.1h2.6v2.3h-3.4v5.4h-3v-5.4H7.1v-2.3h2.6V4.7z"/>',
    P: '<path d="M12 1.5l7 4.3H5zM7.2 6.8h9.6v2.6H7.2zM3.5 10.6l8.5-1 8.5 1-1.8 2.2H5.3zM7.8 13.6h8.4v3.2H7.8zM2.5 17.8l9.5-1.1 9.5 1.1-2 3.2h-15z"/>',
    T: '<path d="M12 1.8l3 6.4 7 .8-5.2 4.8 1.4 7-6.2-3.6-6.2 3.6 1.4-7L2 9l7-.8z"/>'
  };
  var SPECIAL = { MA: ['1', '雀'], DO: ['개', '犬'], PH: ['봉', '鳳'], DR: ['용', '龍'] };
  function svg(s, cls) { return '<svg class="' + cls + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + SUIT_SVG[s] + '</svg>'; }
  function cardHTML(id, extra, size) {
    var cls = 'card' + (size ? ' ' + size : '') + (extra ? ' ' + extra : ''), label = TE.cardLabel(id);
    if (SPECIAL[id]) return '<div class="' + cls + ' ' + id + '" data-c="' + id + '" title="' + label + '" aria-label="' + label + '"><span class="r">' + SPECIAL[id][0] + '</span><span class="han">' + SPECIAL[id][1] + '</span></div>';
    var s = id[0], r = TE.rankLabel(TE.rank(id));
    return '<div class="' + cls + ' ' + s + '" data-c="' + id + '" title="' + label + '" aria-label="' + label + '"><span class="r">' + r + '</span>' + svg(s, 'su') + svg(s, 'big') + '</div>';
  }
  function cardsHTML(ids, size) { return '<div class="cards ' + (size || '') + '">' + ids.map(function (c) { return cardHTML(c, '', size); }).join('') + '</div>'; }

  /* ================= 로그인 ================= */
  function kakaoSession() { try { var s = JSON.parse(lsGet(KAKAO_STORE) || 'null'); return s && s.token ? s : null; } catch (e) { return null; } }
  function tokenInfo(t) {
    try { var b = t.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'); var p = JSON.parse(decodeURIComponent(escape(atob(b + '==='.slice((b.length + 3) % 4))))); return p; } catch (e) { return null; }
  }
  function setLogin(r) {
    S.token = r.token; S.user = r.user;
    lsSet(LS_TOKEN, r.token); lsSet(LS_NOAUTO, null);
  }
  function logout(msg) {
    S.token = null; S.user = null; lsSet(LS_TOKEN, null);
    stopPoll();
    if (msg) toast(msg, true);
    if (S.route.name !== 'login') { location.hash = '#/'; renderLogin(); }
  }

  function startKakao() {
    if (!CFG.kakaoRestKey) return toast('카카오 로그인 설정을 찾지 못했어요', true);
    var st; try { st = [].slice.call(crypto.getRandomValues(new Uint32Array(4))).join(''); } catch (e) { st = String(Math.random()).slice(2) + Date.now(); }
    lsSet(KAKAO_STATE, JSON.stringify({ s: st, t: Date.now() }));
    try { sessionStorage.setItem('jmb_after_login', location.pathname + location.hash); } catch (e) {}
    location.href = 'https://kauth.kakao.com/oauth/authorize?client_id=' + encodeURIComponent(CFG.kakaoRestKey) +
      '&redirect_uri=' + encodeURIComponent(location.origin + ROOT) + '&response_type=code&state=' + encodeURIComponent(st);
  }

  function loginKakao(btn) {
    var ks = kakaoSession();
    if (!ks) return startKakao();
    if (btn) { btn.disabled = true; btn.textContent = '확인 중…'; }
    return api('loginKakao', { token: ks.token }).then(function (r) { setLogin(r); toast(r.user.name + '님, 환영해요!'); route(); }, function (e) {
      if (btn) { btn.disabled = false; btn.textContent = '카카오로 계속하기'; }
      if (e.code === 'nolink') { renderLogin('잠만보 사이트에서 카카오 계정에 모임 닉네임을 먼저 연결해 주세요.'); return; }
      if (e.code === 'kakao') { lsSet(KAKAO_STORE, null); renderLogin(e.message); return; }
      renderLogin(e.message);
    });
  }

  function renderLogin(errMsg) {
    S.route = { name: 'login' };
    stopPoll(); clearInterval(S.lobbyT);
    var ks = kakaoSession(), nick = ks && ks.user && ks.user.nickname;
    app.innerHTML =
      '<div class="login">' +
      '<div class="mini-cards">' + ['DR', 'T14', 'PH', 'MA'].map(function (c) { return cardHTML(c); }).join('') + '</div>' +
      '<h1>잠만보 티츄</h1><p class="sub">잠만보 보드게임 모임 회원 전용 · 2 대 2 팀 클라이밍 카드게임</p>' +
      '<div class="box">' +
      (CFG.kakaoRestKey ? (ks ? '<button class="btn kakao block" id="kGo">' + (nick ? esc(nick) + '님으로 계속하기' : '카카오로 계속하기') + '</button>' :
        '<button class="btn kakao block" id="kStart">카카오 로그인</button><div class="small">잠만보 사이트와 같은 카카오 로그인이에요. 모임 닉네임이 연결된 회원만 들어올 수 있어요.</div>') : '') +
      '<div class="or">테스트 계정</div>' +
      '<form id="lf" class="field" autocomplete="on">' +
      '<input class="input" id="lid" placeholder="아이디" autocomplete="username" autocapitalize="off" required>' +
      '<input class="input" id="lpw" type="password" placeholder="비밀번호" autocomplete="current-password" required style="margin-top:8px">' +
      '<div class="err" id="lerr">' + esc(errMsg || '') + '</div>' +
      '<button class="btn primary block" type="submit" id="lbtn">로그인</button></form>' +
      '</div>' +
      '<a class="small" href="' + ROOT + '">← 잠만보로 돌아가기</a>' +
      '</div>';
    var kg = $('#kGo'); if (kg) kg.onclick = function () { loginKakao(kg); };
    var ks2 = $('#kStart'); if (ks2) ks2.onclick = startKakao;
    $('#lf').onsubmit = function (ev) {
      ev.preventDefault();
      var b = $('#lbtn'); b.disabled = true; b.textContent = '확인 중…';
      api('login', { id: $('#lid').value, pw: $('#lpw').value }).then(function (r) { setLogin(r); toast(r.user.name + '님, 환영해요!'); route(); }, function (e) {
        b.disabled = false; b.textContent = '로그인'; $('#lerr').textContent = e.message;
      });
    };
  }

  /* ================= 라우팅 ================= */
  function parseHash() {
    var h = location.hash.replace(/^#\/?/, '').split('/');
    if (h[0] === 'room' && h[1]) return { name: 'room', id: decodeURIComponent(h[1]).replace(/[^0-9A-Z]/g, '') };
    if (h[0] === 'rank' || h[0] === 'me' || h[0] === 'rules') return { name: h[0] };
    return { name: 'lobby' };
  }
  function route() {
    document.body.classList.remove('ingame');
    if (!S.token) return renderLogin();
    var r = parseHash();
    closeModal();
    if (r.name !== 'room' && S.room) { S.rank = null; S.rec = null; }   // 방에서 나오면 전적 새로 (레벨업 알림)
    if (r.name !== 'room' && S.room && S.room.me < 0) api('leave', { room: S.room.id, watch: 1 }).catch(function () {});   // 관전자 목록에서 바로 빠짐
    if (r.name !== 'room') { if (S.room) hush(); stopPoll(); S.room = null; S.roomId = null; S.guard = false; S.pollSeq++; S.polling = false; }
    S.route = r;
    clearInterval(S.lobbyT);
    if (r.name === 'room') return enterRoom(r.id);
    renderLobby();
    if (r.name === 'lobby') { loadLobby(); S.lobbyT = setInterval(function () { if (!document.hidden && S.route.name === 'lobby' && !S.modal) loadLobby(); }, 6000); }
    if (r.name === 'rank' || !S.rank) loadRank();
    if (r.name === 'me') loadRecords();
  }
  window.addEventListener('hashchange', route);
  // 방 안에서 휴대폰 뒤로가기: 창이 열려 있으면 창만 닫고, 아니면 '한 번 더 누르면 나가요' → 2초 안에 또 누르면 로비로
  function armGuard() {
    if (S.route.name !== 'room' || S.guard) return;
    try { history.pushState({ tichuGuard: 1 }, '', location.href); S.guard = true; } catch (e) {}
  }
  window.addEventListener('popstate', function () {
    if (!S.guard || S.route.name !== 'room') return;
    S.guard = false;
    if (S.modal) { closeModal(); armGuard(); return; }
    if (Date.now() - S.backAt < 2000) { S.backAt = 0; location.hash = '#/'; return; }
    S.backAt = Date.now();
    toast('한 번 더 누르면 로비로 나가요');
    armGuard();
  });
  window.addEventListener('beforeunload', function (e) {
    var r = S.room;
    if (S.route.name === 'room' && r && r.status === 'play' && r.me >= 0) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ================= 로비 ================= */
  function header() {
    return '<div class="hdr"><div class="title"><span class="logo-mark">T</span>잠만보 티츄</div>' +
      '<button class="chip" id="meChip">' + (S.user ? lvTag(rankOf(S.user.name)) + ' ' : '') + esc(S.user ? S.user.name : '') + ' ▾</button></div>';
  }
  function tabbar(on) {
    var t = [['lobby', '#/', '🃏', '방 목록'], ['rank', '#/rank', '🏆', '랭킹'], ['me', '#/me', '📊', '내 전적'], ['rules', '#/rules', '📖', '규칙']];
    return '<nav class="tabbar"><div class="in">' + t.map(function (x) { return '<button data-go="' + x[1] + '" class="' + (on === x[0] ? 'on' : '') + '"><span class="ic">' + x[2] + '</span>' + x[3] + '</button>'; }).join('') + '</div></nav>';
  }
  function renderLobby() {
    var r = S.route.name, body = '';
    if (r === 'lobby') body = lobbyBody();
    else if (r === 'rank') body = rankBody();
    else if (r === 'me') body = recBody();
    else body = rulesBody();
    app.innerHTML = '<div class="shell">' + header() + '<div class="content">' + body + '</div>' + tabbar(r) + '</div>';
    bindShell();
  }
  function bindShell() {
    $$('[data-go]').forEach(function (b) { b.onclick = function () { location.hash = b.getAttribute('data-go'); }; });
    var mc = $('#meChip'); if (mc) mc.onclick = accountMenu;
    var bc = $('#bCreate'); if (bc) bc.onclick = createRoomSheet;
    var bp = $('#bPractice'); if (bp) bp.onclick = function () { practice(bp); };
    var br = $('#bRefresh'); if (br) br.onclick = function () { loadLobby(true); };
    $$('[data-rsort]').forEach(function (b) { b.onclick = function () { S.rankSort = b.getAttribute('data-rsort'); renderLobby(); }; });
    $$('[data-join]').forEach(function (b) { b.onclick = function () { S.roomPw = ''; joinRoom(b.getAttribute('data-join'), b.getAttribute('data-lock') === '1'); }; });
    $$('[data-watch]').forEach(function (b) { b.onclick = function () { S.roomPw = ''; watchRoom(b.getAttribute('data-watch'), b.getAttribute('data-lock') === '1'); }; });
  }
  function accountMenu() {
    openModal('<h2>' + esc(S.user.name) + '<button class="x" data-x>✕</button></h2>' +
      '<div class="small">' + esc(S.user.kind) + ' 계정' + (CFG.env !== 'prod' ? ' · ' + esc(CFG.env) + ' 환경' : '') + '</div>' +
      soundRows() +
      '<div class="menu-list">' +
      '<a class="btn block" href="' + ROOT + '">잠만보 홈으로</a>' +
      '<button class="btn danger block" id="mOut">로그아웃</button></div>' + verLine());
    bindSoundRows();
    $('#mOut').onclick = function () { lsSet(LS_NOAUTO, '1'); closeModal(); logout(); toast('로그아웃했어요'); };
  }

  // 소리 설정 (효과음 · 음성 안내) — 스위치
  function soundRows() {
    return '<div class="setlist">' +
      '<label class="setrow"><span><b>효과음</b><small>카드·조합·차례 알림 소리</small></span><input type="checkbox" class="sw" id="swSound"' + (S.sound ? ' checked' : '') + '></label>' +
      '<label class="setrow"><span><b>음성 안내</b><small>"케이 페어", "패스", "마이 턴"</small></span><input type="checkbox" class="sw" id="swVoice"' + (S.voice ? ' checked' : '') + '></label></div>';
  }
  function bindSoundRows() {
    var a = $('#swSound'), b = $('#swVoice');
    if (a) a.onchange = function () { S.sound = a.checked; lsSet(LS_SOUND, S.sound ? '1' : '0'); if (S.sound) sfx('turn'); };
    if (b) b.onchange = function () { S.voice = b.checked; lsSet(LS_VOICE, S.voice ? '1' : '0'); if (S.voice) say('음성 안내를 켰어요'); else try { speechSynthesis.cancel(); } catch (e) {} };
  }
  function verLine() {
    return '<div class="verline">화면 v' + APP_VER + ' · 서버 ' + (S.sv === 'old' ? '1.4 이전' : S.sv ? 'v' + esc(S.sv) : '확인 중') + (S.sv && S.sv.split('.').slice(0, 2).join('.') !== APP_VER.split('.').slice(0, 2).join('.') ?' <span class="warn">' + (S.sv === 'old' ? '서버 새로 배포 필요' : '버전 다름') + '</span>' : '') + (CFG.env && CFG.env !== 'prod' ? ' · ' + esc(CFG.env) : '') + '</div>';
  }

  function loadLobby(manual) {
    api('lobby').then(function (r) {
      S.lobby = r.rooms; S.notice = r.notice || ''; if (r.user) S.user = r.user;
      if (S.route.name === 'lobby' && !S.modal) renderLobby();
      if (manual) toast('새로고침했어요');
    }, function (e) { if (S.route.name === 'lobby') toast(e.message, true); });
  }
  function seatLine(seats, i) {
    var s = seats[i];
    return '<span class="' + (i % 2 ? 'tB' : 'tA') + '">' + (s ? (s.b ? '🤖 ' : '') + esc(s.n) : '<i style="opacity:.5">빈자리</i>') + '</span>';
  }
  function lobbyBody() {
    var h = '';
    if (S.notice) h += '<div class="notice">📢 ' + esc(S.notice) + '</div>';
    h += '<div class="cta"><button class="btn primary" id="bPractice">🤖 AI와 연습<small>봇 3명과 바로 시작</small></button>' +
      '<button class="btn" id="bCreate">＋ 방 만들기<small>친구들과 2 대 2</small></button></div>';
    h += '<div class="sec-title"><span>열린 방</span><button class="btn sm ghost" id="bRefresh">↻ 새로고침</button></div>';
    if (!S.lobby) return h + '<div class="empty">불러오는 중…</div>';
    if (!S.lobby.length) return h + '<div class="empty">열린 방이 없어요.<br>방을 만들고 단톡방에 초대 링크를 보내 보세요!</div>';
    h += '<div class="rooms">' + S.lobby.map(function (r) {
      var filled = r.seats.filter(Boolean).length, st = r.st === 'wait' ? '<span class="st wait">대기 ' + filled + '/4</span>' : r.st === 'play' ? '<span class="st play">진행 중 · ' + r.round + '라운드</span>' : '<span class="st end">끝남</span>';
      // 관전은 시작 전(대기)에도 · 비밀방도 비밀번호를 알면 가능
      var btn = r.mine ? '<button class="btn sm primary" data-watch="' + r.id + '">돌아가기</button>' :
        (r.st === 'wait' && filled < 4 ? '<button class="btn sm primary" data-join="' + r.id + '" data-lock="' + (r.lock ? 1 : 0) + '">입장</button> ' : '') +
        '<button class="btn sm" data-watch="' + r.id + '" data-lock="' + (r.lock ? 1 : 0) + '">관전</button>';
      return '<div class="room-card' + (r.mine ? ' mine' : '') + '"><div class="top"><span class="name">' + (r.lock ? '🔒 ' : '') + esc(r.name) + '</span>' + st + '</div>' +
        '<div class="seats">' + seatLine(r.seats, 0) + seatLine(r.seats, 1) + seatLine(r.seats, 2) + seatLine(r.seats, 3) + '</div>' +
        '<div class="meta"><span>🎯 ' + r.target + '점</span><span>⏱ ' + (r.timer ? r.timer + '초' : '없음') + '</span>' +
        (r.scores ? '<span><b class="tA">' + r.scores[0] + '</b> : <b class="tB">' + r.scores[1] + '</b></span>' : '') + '<span class="sp"></span>' + btn + '</div></div>';
    }).join('') + '</div>';
    return h;
  }

  function practice(btn) {
    btn.disabled = true;
    api('create', { practice: true, target: 500, timer: 0, botDelay: botDelayPref() }).then(function (r) { applyRoom(r, true); location.hash = '#/room/' + r.id; }, function (e) { btn.disabled = false; toast(e.message, true); });
  }

  function optSeg(name, vals, cur, fmt) {
    return '<div class="seg" data-seg="' + name + '">' + vals.map(function (v) { return '<button type="button" data-v="' + v + '" class="' + (String(v) === String(cur) ? 'on' : '') + '">' + fmt(v) + '</button>'; }).join('') + '</div>';
  }
  function bindSeg(root) {
    $$('[data-seg]', root).forEach(function (sg) { $$('button', sg).forEach(function (b) { b.onclick = function () { $$('button', sg).forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); }; }); });
  }
  // 목표 점수: 직접 입력이 있으면 그 값, 없으면 고른 버튼
  function targetVal(root) {
    var inp = $('#oTarget', root), v = inp && inp.value.trim();
    if (v) return Math.max(100, Math.min(3000, Math.round(+v / 10) * 10)) || 500;
    return +segVal(root, 'target') || 500;
  }
  function bindTarget(root) {
    var inp = $('#oTarget', root); if (!inp) return;
    inp.oninput = function () { if (inp.value) $$('[data-seg="target"] button', root).forEach(function (x) { x.classList.remove('on'); }); };
    $$('[data-seg="target"] button', root).forEach(function (b) { b.addEventListener('click', function () { inp.value = ''; }); });
  }
  function segVal(root, name) { var b = $('[data-seg="' + name + '"] button.on', root); return b ? b.getAttribute('data-v') : null; }

  // AI 한 수 간격(초) — 방 옵션 botDelay. 0 = 바로. 마지막 고른 값을 기억해 다음 방·연습에 씀
  var BOT_DELAYS = [0, 0.5, 1, 1.5, 2, 3];
  function botDelayPref() { var v = parseFloat(lsGet(LS_BOTD)); return isNaN(v) ? 1.5 : Math.max(0, Math.min(5, v)); }
  function botDelayLabel(v) { v = +v || 0; return v ? v + '초' : '바로'; }
  function botDelayOf(o) { return o && o.botDelay != null ? +o.botDelay : 1.5; }
  function botDelaySeg(cur) {
    return '<div class="field"><label>🤖 AI 한 수 간격 <span class="small">(길수록 폭탄 끼어들 틈이 넉넉)</span></label>' + optSeg('botDelay', BOT_DELAYS, cur, botDelayLabel) + '</div>';
  }
  function botDelayVal(root) { var v = segVal(root, 'botDelay'); v = v == null ? botDelayPref() : +v; lsSet(LS_BOTD, String(v)); return v; }
  function roomOptForm(o) {
    o = o || { name: '', target: 500, timer: 45, pw: '', botDelay: botDelayPref() };
    var preset = [200, 400, 500].indexOf(+o.target) >= 0;
    return '<div class="field"><label>방 이름</label><input class="input" id="oName" maxlength="24" placeholder="' + esc(S.user.name) + '님의 방" value="' + esc(o.name) + '"></div>' +
      '<div class="field"><label>목표 점수</label>' + optSeg('target', [200, 400, 500], preset ? o.target : '', function (v) { return v + '점'; }) +
        '<input class="input" id="oTarget" type="number" inputmode="numeric" min="100" max="3000" step="10" placeholder="직접 입력 (100~3000점)" value="' + (preset ? '' : esc(o.target)) + '" style="margin-top:6px"></div>' +
      '<div class="field"><label>턴 시간 (넘기면 자동 진행)</label>' + optSeg('timer', [0, 20, 30, 45, 60, 90], o.timer, function (v) { return v ? v + '초' : '없음'; }) + '</div>' +
      botDelaySeg(botDelayOf(o)) +
      '<div class="field"><label>방 비밀번호 (선택, 숫자·영문)</label><input class="input" id="oPw" maxlength="8" inputmode="text" autocomplete="off" value="' + esc(o.pw || '') + '"></div>';
  }
  function createRoomSheet() {
    openModal('<h2>방 만들기<button class="x" data-x>✕</button></h2>' + roomOptForm() + '<button class="btn primary block" id="oGo">만들기</button>');
    bindSeg(modalEl); bindTarget(modalEl);
    $('#oGo').onclick = function () {
      var b = $('#oGo'); b.disabled = true;
      api('create', { name: $('#oName').value, target: targetVal(modalEl), timer: +segVal(modalEl, 'timer'), botDelay: botDelayVal(modalEl), pw: $('#oPw').value }).then(function (r) {
        closeModal(); applyRoom(r, true); location.hash = '#/room/' + r.id;
      }, function (e) { b.disabled = false; toast(e.message, true); });
    };
  }

  function joinRoom(id, lock, seat) {
    function go(pw) {
      return api('join', { room: id, pw: pw || '', seat: seat === undefined ? '' : seat }).then(function (r) {
        S.roomPw = pw || ''; closeModal(); applyRoom(r, true); location.hash = '#/room/' + id;
      }, function (e) { if (e.code === 'pw') { toast(e.message, true); ask(); } else toast(e.message, true); });
    }
    function ask() {
      openModal('<h2>비밀번호<button class="x" data-x>✕</button></h2><input class="input" id="jPw" maxlength="8" autocomplete="off"><button class="btn primary block" id="jGo">입장</button>');
      $('#jPw').focus();
      $('#jGo').onclick = function () { go($('#jPw').value); };
    }
    if (lock && !S.roomPw) ask(); else go(S.roomPw || '');   // 관전하며 이미 비밀번호를 넣었으면 그대로 씀
  }

  // 관전: 자리에 앉지 않고 보기만. 비밀방이면 비밀번호를 먼저 물어봄 (대기 중이면 관전하다 빈자리를 눌러 앉을 수 있음)
  function watchRoom(id, lock, wrong) {
    if (!lock) return goRoom(id);
    if (S.route.name === 'room' && (!S.room || S.room.id !== id)) app.innerHTML = '<div class="boot"><div>🔒 비밀방이에요</div><a class="btn ghost" href="#/">로비로</a></div>';   // 링크로 들어온 경우 (창을 닫아도 갈 곳)
    openModal('<h2>' + (wrong ? '비밀번호가 맞지 않아요' : '비밀번호') + '<button class="x" data-x>✕</button></h2>' +
      '<div class="small" style="margin-bottom:8px">비밀방이에요. 비밀번호를 알면 관전할 수 있어요.</div>' +
      '<input class="input" id="jPw" maxlength="8" autocomplete="off"><button class="btn primary block" id="jGo" style="margin-top:8px">관전하기</button>');
    $('#jPw').focus();
    $('#jGo').onclick = function () { S.roomPw = $('#jPw').value; closeModal(); goRoom(id); };
  }
  function goRoom(id) {
    if (location.hash === '#/room/' + id) { S.pollSeq++; S.polling = false; startPoll(0); }
    else location.hash = '#/room/' + id;
  }

  /* ----- 레벨 · 칭호 · 배지 (잠만보 트레이너 레벨처럼, 전적 숫자로 계산) ----- */
  // 경험치: 끝까지 한 판 10 · 사람 4명 대전 +20 · 승 10 · 라운드 1 · 1등 3 · 원투 8 · 스몰 성공 10 · 라지 성공 30 · 티츄 도전(실패) 2
  var XP_RULE = [['games', '끝까지 한 판', 10], ['ranked', '사람 4명 대전', 20], ['win', '승리', 10], ['rounds', '라운드', 1], ['fc', '1등으로 나감', 3],
    ['onetwo', '원투', 8], ['sts', '스몰 티츄 성공', 10], ['gts', '라지 티츄 성공', 30], ['tfail', '티츄 도전', 2]];
  // 레벨 L 까지 누적 필요 XP = 25·L·(L−1) (잠만보 트레이너 레벨과 같은 곡선)
  var TITLES = [[1, '🐣', '참새 견습생'], [3, '🐕', '개 조련사'], [5, '🃏', '트릭 수집가'], [8, '💣', '폭탄 장인'], [12, '🔥', '봉황 기사'], [16, '🐉', '용의 주인'], [22, '👑', '티츄 마스터']];
  function stats(p) {   // 랭킹 항목 / 내 전적 둘 다 받아서 같은 모양으로
    if (!p) return null;
    var rounds = p.rounds || 0, fc = p.fc != null ? p.fc : (S.rec && S.rec.me === p ? p.first : Math.round((p.first || 0) * rounds / 100));
    var st = p.st || [0, 0], gt = p.gt || [0, 0];
    return { games: p.games || 0, ranked: +p.ranked || 0, win: p.win || 0, lose: p.lose || 0, rounds: rounds, fc: fc, onetwo: p.onetwo || 0,
      sts: st[0], stf: st[1], gts: gt[0], gtf: gt[1], tfail: st[1] + gt[1], rating: p.rating || 1500 };
  }
  function xpOf(x) { return XP_RULE.reduce(function (a, r) { return a + (x[r[0]] || 0) * r[2]; }, 0); }
  function lvOf(xp) { var L = 1; while (25 * (L + 1) * L <= xp) L++; return L; }
  function titleOf(L) { var t = TITLES[0]; TITLES.forEach(function (x) { if (L >= x[0]) t = x; }); return t; }
  function level(p) {
    var x = stats(p); if (!x) return null;
    var xp = xpOf(x), L = lvOf(xp), lo = 25 * L * (L - 1), hi = 25 * (L + 1) * L;
    return { x: x, xp: xp, lv: L, cur: xp - lo, need: hi - lo, title: titleOf(L) };
  }
  function rankOf(name) {
    if (S.rec && S.rec.me && S.user && name === S.user.name && S.rec.me.games) return S.rec.me;
    return (S.rank || []).filter(function (p) { return p.name === name && p.fc != null; })[0] || null;
  }
  function lvTag(p) { var l = level(p); return l ? '<span class="lv" title="' + esc(l.title[2]) + '">' + l.title[1] + ' Lv.' + l.lv + '</span>' : ''; }
  // 배지: [아이콘, 이름, 설명, 진행도fn(x) → [현재, 목표], 히든]
  var BADGES = [
    ['🎴', '첫 판', '게임을 끝까지 1판', function (x) { return [x.games, 1]; }],
    ['🪑', '단골 손님', '끝까지 20판', function (x) { return [x.games, 20]; }],
    ['🏠', '티츄 하우스', '끝까지 100판', function (x) { return [x.games, 100]; }],
    ['🏅', '첫 승리', '1번 이기기', function (x) { return [x.win, 1]; }],
    ['🎖️', '승부사', '20번 이기기', function (x) { return [x.win, 20]; }],
    ['🏆', '전설의 팀플레이', '50번 이기기', function (x) { return [x.win, 50]; }],
    ['📣', '티츄!', '스몰 티츄 첫 성공', function (x) { return [x.sts, 1]; }],
    ['🎯', '티츄 사냥꾼', '스몰 티츄 10번 성공', function (x) { return [x.sts, 10]; }],
    ['🌋', '라지 한 방', '라지 티츄 첫 성공', function (x) { return [x.gts, 1]; }],
    ['🌠', '라지의 신', '라지 티츄 5번 성공', function (x) { return [x.gts, 5]; }],
    ['✌️', '원투!', '팀이 1·2등 (원투) 1번', function (x) { return [x.onetwo, 1]; }],
    ['⚡', '원투 콤비', '원투 10번', function (x) { return [x.onetwo, 10]; }],
    ['🥇', '빠른 손', '1등으로 나가기 30번', function (x) { return [x.fc, 30]; }],
    ['🤝', '진짜 대전', '사람 4명 대전 10판', function (x) { return [x.ranked, 10]; }],
    ['🧠', '정확한 선언', '티츄 성공률 70% 이상 (10번 이상 선언)', function (x) { var n = x.sts + x.stf + x.gts + x.gtf; return n < 10 ? [n, 10] : [(x.sts + x.gts) / n >= 0.7 ? 1 : 0, 1]; }],
    ['💎', '레이팅 1600', '사람 4명 대전 레이팅 1600 넘기기', function (x) { return x.ranked ? [Math.max(0, x.rating - 1500), 100] : [0, 100]; }],
    ['🙈', '용감한 도전', '티츄 실패 10번 (그래도 또 외쳐요)', function (x) { return [x.tfail, 10]; }, 1],
    ['🌙', '밤샘 티츄', '라운드 300번', function (x) { return [x.rounds, 300]; }, 1]
  ];
  function badgeState(x) {
    return BADGES.map(function (b) { var pr = b[3](x), c = Math.min(pr[0], pr[1]); return { b: b, cur: c, goal: pr[1], got: pr[0] >= pr[1] }; });
  }
  function nextBadge(bs) { var best = null; bs.forEach(function (s) { if (!s.got && !s.b[4] && (!best || s.cur / s.goal > best.cur / best.goal)) best = s; }); return best; }
  // 새 레벨·배지 알림 (기기별 1회). 처음 보는 기기는 조용히 저장만
  function checkAch(p) {
    var l = level(p); if (!l || !S.user) return;
    var k = 'tichu_ach_' + S.user.uid, old = null;
    try { old = JSON.parse(lsGet(k) || 'null'); } catch (e) {}
    var got = badgeState(l.x).filter(function (s) { return s.got; }).map(function (s) { return s.b[1]; });
    lsSet(k, JSON.stringify({ lv: l.lv, b: got }));
    if (!old || S.modal) return;
    var nb = got.filter(function (n) { return old.b.indexOf(n) < 0; }), up = l.lv > old.lv;
    if (!nb.length && !up) return;
    sfx('win', 0);
    openModal('<h2>🎉 축하해요!<button class="x" data-x>✕</button></h2><div class="ach">' +
      (up ? '<div class="ach-lv">' + l.title[1] + '<b>Lv.' + l.lv + '</b><span>' + esc(l.title[2]) + '</span></div><p class="small" style="text-align:center">레벨이 올랐어요!</p>' : '') +
      nb.map(function (n) { var b = BADGES.filter(function (x) { return x[1] === n; })[0]; return '<div class="ach-b"><span class="bi">' + b[0] + '</span><div><b>' + esc(b[1]) + '</b><div class="small">' + esc(b[2]) + '</div></div></div>'; }).join('') +
      '</div><button class="btn primary block" data-x>좋아요</button>');
  }

  /* ----- 랭킹 · 전적 · 규칙 ----- */
  function loadRank() {
    api('ranking').then(function (r) {
      S.rank = r.list;
      if (S.route.name !== 'room' && !S.modal) renderLobby();
      var mine = S.user && r.list.filter(function (p) { return p.name === S.user.name; })[0];
      if (mine && mine.fc != null) checkAch(mine);
    }, function (e) { if (S.route.name === 'rank') toast(e.message, true); });
  }
  function loadRecords() { api('records').then(function (r) { S.rec = r; if (S.route.name === 'me') renderLobby(); if (r.me && r.me.games) checkAch(r.me); }, function (e) { toast(e.message, true); }); }
  function pct(a, b) { return a + b ? Math.round(a / (a + b) * 100) + '%' : '-'; }
  function rankBody() {
    var sort = S.rankSort || 'rating';
    var h = '<div class="sec-title">랭킹 <div class="seg mini">' + [['rating', '레이팅'], ['level', '레벨']].map(function (x) { return '<button data-rsort="' + x[0] + '" class="' + (sort === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="small">' + (sort === 'rating' ? '레이팅은 사람 4명이 끝까지 한 게임만 반영' : '레벨은 봇이 낀 판까지 모든 전적으로 쌓여요 (사람 4명 대전은 경험치 +20)') + '</div>';
    if (!S.rank) return h + '<div class="empty">불러오는 중…</div>';
    if (!S.rank.length) return h + '<div class="empty">아직 기록이 없어요. 첫 판의 주인공이 되어 보세요!</div>';
    var list = S.rank.slice();
    if (sort === 'level') list.sort(function (a, b) { return xpOf(stats(b)) - xpOf(stats(a)) || b.win - a.win; });
    return h + '<div style="overflow-x:auto"><table class="table-list"><thead><tr><th>#</th><th>이름</th>' + (sort === 'level' ? '<th>XP</th>' : '<th>레이팅</th>') + '<th>승/패</th><th>승률</th><th>티츄</th><th>1등률</th></tr></thead><tbody>' +
      list.map(function (p, i) {
        var lead = sort === 'level' || p.ranked, med = i < 3 && lead ? '<span class="medal">' + ['🥇', '🥈', '🥉'][i] + '</span>' : String(i + 1);
        return '<tr class="' + (S.user && p.name === S.user.name ? 'me' : '') + '"><td>' + med + '</td><td class="n">' + lvTag(p) + ' ' + esc(p.name) + '</td><td>' +
          (sort === 'level' ? xpOf(stats(p)).toLocaleString() : p.ranked ? p.rating : '<span class="small">-</span>') + '</td><td>' + p.win + '/' + p.lose + '</td><td>' + p.rate + '%</td><td>' + pct(p.st[0] + p.gt[0], p.st[1] + p.gt[1]) + '</td><td>' + p.first + '%</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function levelCard(m) {
    var l = level(m), bs = badgeState(l.x), nb = nextBadge(bs), got = bs.filter(function (s) { return s.got; }).length;
    var h = '<div class="lvcard"><div class="lvtop"><div class="lvbig">' + l.title[1] + '</div><div style="flex:1;min-width:0"><div><b class="lvnum">Lv.' + l.lv + '</b> <span class="lvtitle">' + esc(l.title[2]) + '</span></div>' +
      '<div class="xpbar"><i style="width:' + Math.round(l.cur / l.need * 100) + '%"></i></div><div class="small">다음 레벨까지 ' + (l.need - l.cur) + ' XP · 누적 ' + l.xp.toLocaleString() + ' XP</div></div></div>';
    var nt = TITLES.filter(function (t) { return t[0] > l.lv; })[0];
    if (nt) h += '<div class="small" style="margin-top:6px">다음 칭호: ' + nt[1] + ' ' + esc(nt[2]) + ' (Lv.' + nt[0] + ')</div>';
    if (nb) h += '<div class="nextb"><span class="bi">' + nb.b[0] + '</span><div style="flex:1;min-width:0"><div><b>다음 배지</b> · ' + esc(nb.b[1]) + ' <span class="small">' + esc(nb.b[2]) + '</span></div><div class="xpbar sm"><i style="width:' + Math.round(nb.cur / nb.goal * 100) + '%"></i></div></div><span class="small">' + Math.floor(nb.cur) + '/' + nb.goal + '</span></div>';
    h += '<details class="xpd"><summary>경험치 내역</summary><table class="table-list">' + XP_RULE.map(function (r) { var n = l.x[r[0]] || 0; return '<tr><td style="text-align:left">' + r[1] + '</td><td>' + n + ' × ' + r[2] + '</td><td><b>' + (n * r[2]) + '</b></td></tr>'; }).join('') + '</table></details></div>';
    h += '<div class="sec-title">배지 <span class="small">' + got + ' / ' + BADGES.length + '</span></div><div class="badges">' + bs.map(function (s) {
      var hid = s.b[4] && !s.got;
      return '<div class="bdg' + (s.got ? ' got' : '') + '" title="' + esc(hid ? '숨겨진 배지' : s.b[2]) + '"><span class="bi">' + (hid ? '❔' : s.b[0]) + '</span><b>' + (hid ? '???' : esc(s.b[1])) + '</b>' +
        (s.got ? '<span class="small">' + esc(s.b[2]) + '</span>' : hid ? '<span class="small">숨겨진 배지</span>' : '<div class="xpbar sm"><i style="width:' + Math.round(s.cur / s.goal * 100) + '%"></i></div><span class="small">' + Math.floor(s.cur) + '/' + s.goal + '</span>') + '</div>';
    }).join('') + '</div>';
    return h;
  }
  function recBody() {
    var h = '<div class="sec-title">내 전적</div>';
    if (!S.rec) return h + '<div class="empty">불러오는 중…</div>';
    var m = S.rec.me;
    if (!m || !m.games) h += '<div class="empty">아직 끝까지 한 게임이 없어요. 한 판 끝내면 레벨과 배지가 열려요!</div>';
    else h += levelCard(m) + '<div class="sec-title">기록</div><div class="stat-grid">' +
      '<div class="stat"><b>' + (m.ranked ? m.rating : '-') + '</b><span>레이팅</span></div>' +
      '<div class="stat"><b>' + m.win + '승 ' + m.lose + '패</b><span>승률 ' + Math.round(m.win / m.games * 100) + '%</span></div>' +
      '<div class="stat"><b>' + (m.rounds ? Math.round(m.first / m.rounds * 100) : 0) + '%</b><span>1등으로 나감</span></div>' +
      '<div class="stat"><b>' + pct(m.st[0], m.st[1]) + '</b><span>스몰 티츄 ' + m.st[0] + '/' + (m.st[0] + m.st[1]) + '</span></div>' +
      '<div class="stat"><b>' + pct(m.gt[0], m.gt[1]) + '</b><span>라지 티츄 ' + m.gt[0] + '/' + (m.gt[0] + m.gt[1]) + '</span></div>' +
      '<div class="stat"><b>' + m.onetwo + '</b><span>원투(1·2등)</span></div></div>';
    if (S.rec.games.length) {
      h += '<div class="sec-title">최근 게임</div>' + S.rec.games.map(function (g) {
        return '<div class="game-row"><span class="wl ' + (g.win ? 'w' : 'l') + '">' + (g.win ? '승' : '패') + '</span><div class="mid"><div><span class="tA">' + esc(g.a) + '</span> vs <span class="tB">' + esc(g.b) + '</span></div>' +
          '<div class="small">' + esc(g.end.slice(0, 16)) + ' · ' + g.rounds + '라운드 · 목표 ' + g.target + (g.bot ? ' · 🤖' : '') + '</div></div>' +
          '<div style="text-align:right"><b>' + g.sa + ' : ' + g.sb + '</b>' + (g.ranked && g.delta != null ? '<div class="small" style="color:' + (g.delta >= 0 ? '#86efac' : '#fda4af') + '">' + (g.delta >= 0 ? '+' : '') + g.delta + '</div>' : '') + '</div></div>';
      }).join('');
    }
    return h;
  }
  function ex(cards, label) { return '<div class="ex"><span class="lbl">' + label + '</span>' + cardsHTML(cards, 'sm') + '</div>'; }
  function rulesBody() {
    return '<div class="rules">' +
      '<div class="sec-title">티츄 규칙 한눈에</div>' +
      '<p>마주 앉은 두 사람이 한 팀(2 대 2)입니다. 손패를 먼저 비우고, 점수 카드를 모아 <b>목표 점수(방마다 정함, 기본 500점)</b>에 먼저 도달하는 팀이 이깁니다.</p>' +
      '<h3>1. 라운드 준비</h3><ul><li>처음 8장을 보고 <b>라지 티츄</b>(±200점)를 선언할 수 있어요.</li><li>나머지 6장을 받은 뒤 첫 카드를 내기 전까지 <b>스몰 티츄</b>(±100점)를 선언할 수 있어요.</li>' +
      '<li>왼쪽 상대·파트너·오른쪽 상대에게 한 장씩, 3장을 동시에 교환해요.</li><li><b>참새(1)</b>를 가진 사람이 먼저 시작해요.</li></ul>' +
      '<h3>2. 낼 수 있는 조합</h3>' + ex(['T9'], '싱글') + ex(['J8', 'S8'], '페어') + ex(['J12', 'P12', 'T12'], '트리플') + ex(['J5', 'S5', 'P5', 'T11', 'J11'], '풀하우스') +
      ex(['MA', 'J2', 'S3', 'P4', 'T5'], '스트레이트 (5장 이상, 참새는 1)') + ex(['J6', 'S6', 'P7', 'T7'], '연속 페어 (2쌍 이상)') +
      '<ul><li>앞 사람과 <b>같은 종류 · 같은 장수</b>이면서 더 높아야 낼 수 있어요. 언제든 패스할 수 있어요.</li><li>나머지가 모두 패스하면 마지막으로 낸 사람이 트릭(테이블 카드)을 가져가고 새로 시작해요.</li></ul>' +
      '<h3>3. 폭탄</h3>' + ex(['J9', 'S9', 'P9', 'T9'], '포카드 폭탄') + ex(['P3', 'P4', 'P5', 'P6', 'P7'], '스트레이트 플러시 폭탄 (같은 문양 5장 이상)') +
      '<ul><li>폭탄은 무엇이든 이기고, <b>내 차례가 아니어도</b> 테이블에 조합이 있으면 끼어들 수 있어요. (손패에서 고르면 ‘폭탄!’ 버튼이 켜져요)</li><li>스트레이트 플러시 &gt; 포카드, 같은 종류면 길거나 높은 쪽이 이겨요.</li></ul>' +
      '<h3>4. 특수 카드</h3>' +
      '<div class="ex">' + cardHTML('MA', '', 'sm') + '<span><b>참새(1)</b> 가장 낮은 싱글. 낼 때 숫자 하나를 <b>콜</b>할 수 있어요. 그 숫자를 가진 사람은 낼 수 있으면 반드시 내야 해요(폭탄 포함).</span></div>' +
      '<div class="ex">' + cardHTML('DO', '', 'sm') + '<span><b>개</b> 선일 때만 낼 수 있고, 차례를 파트너에게 넘겨요. 점수 0.</span></div>' +
      '<div class="ex">' + cardHTML('PH', '', 'sm') + '<span><b>봉황</b> 조커처럼 조합을 완성(폭탄 제외)하거나, 싱글로 앞 카드보다 ½ 높게 쓸 수 있어요. 용은 못 이겨요. <b>-25점</b>.</span></div>' +
      '<div class="ex">' + cardHTML('DR', '', 'sm') + '<span><b>용</b> 가장 높은 싱글(폭탄에만 짐). 용으로 딴 트릭은 <b>상대 팀 한 명</b>에게 줘야 해요. <b>25점</b>.</span></div>' +
      '<h3>5. 점수</h3><ul><li>5 = 5점, 10·K = 10점, 용 25점, 봉황 -25점 (한 라운드 총 100점)</li>' +
      '<li>꼴찌의 남은 손패는 상대 팀, 꼴찌가 딴 트릭은 1등에게 가요.</li><li>한 팀이 1·2등으로 나가면(<b>원투</b>) 카드 점수 대신 200점!</li>' +
      '<li>티츄 선언자가 1등으로 나가면 +100(라지 +200), 못 하면 같은 만큼 감점.</li></ul>' +
      '<h3>잠만보 티츄에서는</h3><ul><li>턴 시간을 넘기면 자동으로 진행돼요(낼 의무가 없으면 패스). ‘돌아왔어요’를 누르면 다시 직접 해요.</li>' +
      '<li>게임 중 나가면 봇이 대신하고, 그 판은 전적에 들어가지 않아요.</li><li>레이팅은 사람 4명이 끝까지 한 게임만 반영돼요.</li><li>라운드 중에는 각자 따간 점수가 보이지 않아요. 라운드가 끝나면 결과에서 확인해요.</li><li>판을 끝낼 때마다 경험치가 쌓여 레벨·칭호가 오르고, 조건을 채우면 배지를 받아요 (내 전적 탭).</li></ul>' +
      '</div>';
  }

  /* ================= 모달 ================= */
  function openModal(html, onClose) {
    S.modal = { onClose: onClose };
    modalEl.innerHTML = '<div class="sheet" role="dialog">' + html + '</div>';
    modalEl.hidden = false;
    $$('[data-x]', modalEl).forEach(function (b) { b.onclick = closeModal; });
  }
  function closeModal() {
    if (!S.modal) return;
    var cb = S.modal.onClose; S.modal = null;
    modalEl.hidden = true; modalEl.innerHTML = '';
    if (cb) cb();
  }
  modalEl.addEventListener('click', function (e) { if (e.target === modalEl && !(S.modal && S.modal.sticky)) closeModal(); });

  /* ================= 방 ================= */
  function enterRoom(id) {
    if (S.roomId !== id) { S.room = null; S.lastSeq = 0; S.sel = []; S.exch = [null, null, null]; S.resultShown = ''; S.lastChat = 0; S.unread = 0; }
    S.roomId = id;
    setTimeout(armGuard, 0);
    if (S.room && S.room.id === id) render(); else app.innerHTML = '<div class="boot"><div class="logo-mark">T</div><div>방에 들어가는 중…</div></div>';
    startPoll(0);
  }
  function stopPoll() { clearTimeout(S.pollT); S.pollT = 0; }
  function startPoll(delay) { stopPoll(); S.pollT = setTimeout(poll, delay || 0); }
  // 서버가 바뀔 때까지 최대 7초 기다렸다가 답함(롱 폴링) → 답이 오면 바로 다시 요청
  function pollWait() { return document.hidden ? 0 : 7000; }
  function pollDelay() {
    if (document.hidden) return 5000;
    var r = S.room;
    if (!r) return 1000;
    if (r.status === 'end') return 1500;
    return 30;
  }
  function poll() {
    if (S.route.name !== 'room' || !S.roomId) return;
    if (S.busy) return startPoll(150);
    if (S.polling) return;
    var id = S.roomId, mySeq = ++S.pollSeq;
    S.polling = true; S.pollStart = Date.now(); S.pollT = 0;
    var wait = pollWait();
    api('poll', { room: id, v: S.room && S.room.id === id ? S.room.v : 0, pw: S.roomPw, wait: wait }, wait + 9000).then(function (r) {
      if (mySeq !== S.pollSeq) return;            // 그 사이 새 poll 이 시작됨 (화면 복귀·재시도) → 이 답은 버림
      S.polling = false;
      netOk();
      if (S.roomId !== id) return startPoll(pollDelay());
      if (r.same) {
        if (S.room && r.on) {
          var ch = false;
          r.on.forEach(function (o, i) { if (S.room.seats[i] && S.room.seats[i].on !== o) { S.room.seats[i].on = o; ch = true; } });
          if (r.w && r.w.join('\n') !== (S.room.watchers || []).join('\n')) { arrivals(S.room, S.room.seats, r.w); S.room.watchers = r.w; ch = true; }   // 관전자는 방 버전과 따로 옴
          if (ch) render();
        }
      }
      else applyRoom(r);
      startPoll(pollDelay());
    }, function (e) {
      if (mySeq !== S.pollSeq) return;
      S.polling = false;
      if (S.roomId !== id) return;
      if (e.code === 'gone' || e.code === 'kicked') { toast(e.message, true); location.hash = '#/'; return; }
      if (e.code === 'pw') { watchRoom(id, true, !!S.roomPw); return; }   // 초대 링크로 비밀방을 열었을 때: 관전 비밀번호 (예전엔 바로 자리에 앉혔음)
      if (e.code === 'auth' || e.code === 'maint') return;
      if (!S.room) app.innerHTML = '<div class="boot"><div>' + esc(e.message) + '</div><button class="btn" onclick="location.reload()">다시 시도</button><a class="btn ghost" href="#/">로비로</a></div>';
      netFail();
      startPoll(Math.min(5000, 800 * S.netFails));   // 끊기면 금방 다시 (0.8초 → 최대 5초)
    });
  }
  // 연결 상태 표시: 연속으로 실패하면 화면 위에 '다시 연결하는 중…' 띠를 띄움
  function netFail() {
    S.netFails = (S.netFails || 0) + 1;
    if (S.netFails >= 2 && !$('#netbar')) { var d = document.createElement('div'); d.id = 'netbar'; d.className = 'netbar'; d.textContent = '서버와 다시 연결하는 중…'; document.body.appendChild(d); }
  }
  function netOk() { S.netFails = 0; var d = $('#netbar'); if (d) d.remove(); }
  // 화면이 멈춘 것 같을 때 대비: 20초 넘게 poll 이 돌지 않으면 강제로 다시 시작
  setInterval(function () {
    if (S.route.name !== 'room' || !S.roomId || document.hidden) return;
    if (!S.pollT && !S.polling && !S.busy) startPoll(0);
    else if (S.polling && Date.now() - (S.pollStart || 0) > 25000) { S.pollSeq++; S.polling = false; startPoll(0); }
  }, 5000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.route.name === 'room') { S.pollSeq++; S.polling = false; startPoll(0); } });

  function act(k, extra, btn) {
    if (S.busy) return Promise.resolve();
    S.busy = true;
    if (btn) btn.disabled = true;
    var a = extra || {}; a.room = S.roomId; a.k = k;
    // 서버 답을 기다리지 않고 내 화면에 먼저 보여 줌 (답이 오면 서버 상태로 바뀜)
    var g = S.room && S.room.g;
    if (g && (k === 'play' || k === 'pass' || k === 'grand' || k === 'exch' || k === 'dragon')) {
      var top = g.trick.plays.length ? g.trick.plays[g.trick.plays.length - 1].c : null;
      S.optim = { k: k, cards: k === 'play' ? a.cards.slice() : k === 'exch' ? a.cards.slice() : [], c: k === 'play' ? TE.bestPlay(a.cards, top) : null };
      if (k === 'play') { sfx(comboSound(S.optim.c, TE.isBomb(S.optim.c))); say(comboVoice(S.optim.c)); }
      else if (k === 'pass') { sfx('pass'); say('패스'); }
      S.hintI = -1;
      render();
    }
    return api('act', a).then(function (r) { S.busy = false; S.optim = null; netOk(); applyRoom(r, false, true); }, function (e) {
      S.busy = false; S.optim = null; if (btn) btn.disabled = false;
      toast(e.net ? '전송이 안 됐어요. 다시 눌러 주세요' : e.message, true);
      render();
      S.pollSeq++; S.polling = false; startPoll(0);   // 실패하면 바로 서버 상태를 다시 받아 화면을 맞춤
    });
  }
  function roomCall(fn, a, btn) {
    if (btn) btn.disabled = true;
    a = a || {}; a.room = S.roomId;
    return api(fn, a).then(function (r) { if (r && r.id) applyRoom(r); else render(); return r; }, function (e) { if (btn) btn.disabled = false; toast(e.message, true); });
  }

  function team(s) { return s % 2; }
  function pos(s, me) { return (s - (me < 0 ? 0 : me) + 4) % 4; }
  function myView() { return S.room && S.room.me >= 0 ? S.room.me : -1; }
  function seatName(s) { var st = S.room.seats[s]; return st ? st.name : '?'; }

  // 서버 상태가 새로 왔을 때: 효과(배너·소리) → 선택 정리 → 그리기
  // 누가 들어오면 소리: 사람이 새로 앉으면 '딩동', 관전자가 새로 오면 작은 소리 (자리만 바뀐 건 소리 없음 · 나 자신 제외)
  function arrivals(prev, seats, watchers) {
    var mine = S.user && S.user.name;
    function names(list) { return (list || []).filter(Boolean).map(function (x) { return typeof x === 'string' ? x : x.bot ? '' : x.name; }).filter(function (n) { return n && n !== mine; }); }
    var hadSeat = names(prev.seats), had = hadSeat.concat(names(prev.watchers));
    var sat = names(seats).filter(function (n) { return hadSeat.indexOf(n) < 0; });   // 관전하다 앉아도 '들어옴'
    var came = names(watchers).filter(function (n) { return had.indexOf(n) < 0; });
    if (sat.length) { sfx('join'); toast('🙋 ' + sat.join(', ') + '님이 들어왔어요'); }
    else if (came.length) { sfx('watch'); toast('👀 ' + came.join(', ') + '님이 관전 중이에요'); }
  }
  function applyRoom(r, fresh, mine) {
    var prev = S.room;
    // 예전 상태(낮은 버전)가 오면 한 번은 무시(요청 순서가 뒤바뀐 경우). 연속으로 오면 서버가 되돌아간 것이므로 서버 상태를 따름
    if (prev && prev.id === r.id && r.v < prev.v && !fresh) {
      S.lowV = (S.lowV || 0) + 1;
      if (S.lowV < 2) return;
      S.lastSeq = 0;
    }
    S.lowV = 0;
    if (prev && prev.id === r.id) arrivals(prev, r.seats, r.watchers);
    S.room = r; S.roomId = r.id;
    var g = r.g, me = r.me;
    if (g) {
      var key = r.matchId;
      if (S.seqMatch !== key) { S.seqMatch = key; S.lastSeq = fresh || !prev ? g.seq : 0; }
      var evs = g.log.filter(function (e) { return e.n > S.lastSeq; });
      if (S.lastSeq) effects(evs, r, mine);
      S.lastSeq = g.seq;
      // 선택 정리
      var hand = g.hand || [];
      S.sel = S.sel.filter(function (c) { return hand.indexOf(c) >= 0; });
      if (g.phase !== 'exchange' || S.exRound !== g.round) { if (g.phase === 'exchange') S.exRound = g.round; S.exch = [null, null, null]; S.exSlot = 0; }
      S.exch = S.exch.map(function (c) { return c && hand.indexOf(c) >= 0 ? c : null; });
      // 라운드 결과 · 게임 끝
      if ((g.phase === 'roundEnd' || g.phase === 'gameEnd') && S.resultShown !== key + ':' + g.round) { S.resultShown = key + ':' + g.round; setTimeout(function () { showResult(); }, 700); }
      if (g.phase === 'grand' && S.modal && S.modal.result) closeModal();
      // 받은 카드 안내
      if (g.phase === 'play' && g.recv && me >= 0 && !g.played[me] && S.recvShown !== key + ':' + g.round) {
        S.recvShown = key + ':' + g.round;
        var from = {}; g.recv.forEach(function (x) { from[pos(x.f, me)] = x.c; });
        toast('받은 카드 — 왼쪽: ' + TE.cardLabel(from[3]) + ' · 파트너: ' + TE.cardLabel(from[2]) + ' · 오른쪽: ' + TE.cardLabel(from[1]));
      }
    } else {
      if (S.modal && S.modal.result) closeModal();
    }
    // 채팅
    var lastChat = r.chat.length ? r.chat[r.chat.length - 1].i : 0;
    if (S.lastChat && lastChat > S.lastChat) {
      var news = r.chat.filter(function (c) { return c.i > S.lastChat; });
      if (S.chatOpen) paintChat();
      else {
        news.forEach(function (c) { if (c.s !== -2 && c.n !== (S.user && S.user.name)) { S.unread++; toast('💬 ' + c.n + ': ' + c.m); sfx('chat'); } });
      }
    }
    S.lastChat = lastChat;
    render();
  }

  function effects(evs, r, mine) {
    var me = r.me, myTurnBefore = false, order = 0;
    S.flash = {};
    // 한 번에 라운드 끝까지 온 경우(내가 나간 뒤 봇끼리 마저 친 판 등): 그 사이 카드 소리·음성은 건너뛰고 결과만
    var endAt = -1;
    evs.forEach(function (e, i) { if (endAt < 0 && (e.k === 'round' || e.k === 'gameEnd')) endAt = i; });
    if (endAt >= 0) hush();
    evs.forEach(function (e, i) {
      var at = order * 0.28, quiet = endAt >= 0 && i < endAt;
      if (quiet) {
        if (e.k === 'out') toast((e.place === 1 ? '🥇 ' : '') + seatName(e.s) + ' ' + e.place + '등으로 나감!');
        return;
      }
      if (e.k === 'play') {
        if (!(mine && e.s === me)) S.flash[e.s] = order++;
        if (e.bomb) { banner('💣 폭탄!', 'bomb'); S.shake = true; }
        if (!(mine && e.s === me)) { sfx(comboSound(e.c, e.bomb), at); say(comboVoice(e.c), at); }
      } else if (e.k === 'pass') { if (!(mine && e.s === me)) { S.flash[e.s] = order++; sfx('pass', at); say('패스', at); } }
      else if (e.k === 'tichu') { banner(seatName(e.s) + (e.kind === 2 ? ' 라지 티츄!' : ' 티츄!')); sfx('tichu', at); say(e.kind === 2 ? '라지 티츄' : '티츄', at); }
      else if (e.k === 'closing') { if (me >= 0 && myBombs().length) { sfx('turn', at); say('폭탄 기회', at); } }
      else if (e.k === 'trick' && me >= 0 && team(e.to) === team(me)) sfx('trickUs', at + 0.1);
      else if (e.k === 'out' && e.place === 1) sfx('out', at + 0.15);
      else if (e.k === 'round') { sfx(e.res && e.res.dbl ? 'onetwo' : 'round', at + 0.3); if (e.res && e.res.dbl) say('원투', at + 0.3); }
      else if (e.k === 'gameEnd') sfx(me < 0 || team(me) === e.winner ? 'win' : 'lose', at + 0.6);
      if (e.k === 'wish') toast('🐦 ' + seatName(e.s) + ': 참새 콜 [' + TE.rankLabel(e.r) + ']');
      else if (e.k === 'wishDone') toast('참새 콜 [' + TE.rankLabel(e.r) + '] 완료 (' + seatName(e.s) + ')');
      else if (e.k === 'out') toast((e.place === 1 ? '🥇 ' : '') + seatName(e.s) + ' ' + e.place + '등으로 나감!');
      else if (e.k === 'dog') toast('🐕 개 → ' + seatName(e.to) + ' 선');
      else if (e.k === 'trick' && e.to !== e.s) toast('🐉 용 트릭 → ' + seatName(e.to));
    });
    var g = r.g;
    var mine = g && me >= 0 && ((g.phase === 'play' && g.turn === me) || (g.phase === 'dragon' && g.dragon && g.dragon.seat === me));
    if (mine && evs.length && !evs.every(function (e) { return e.s === me; })) { sfx('turn', order * 0.28 + 0.15); say(g.phase === 'dragon' ? '용 트릭 줄 사람을 고르세요' : '마이 턴', order * 0.28 + 0.15); S.hintI = -1; }
  }

  /* ----- 그리기 ----- */
  function render() {
    if (S.route.name !== 'room' || !S.room) return;
    var r = S.room;
    document.body.classList.toggle('ingame', r.status !== 'wait');
    if (r.status === 'wait') renderWait(); else renderGame();
  }

  function renderWait() {
    var r = S.room, me = r.me, view = me < 0 ? 0 : me;
    var seats = [0, 1, 2, 3].map(function (s) {
      var st = r.seats[s], p = pos(s, view), t = team(s) ? 'B' : 'A';
      var inner;
      if (st) {
        inner = '<div class="av ' + t + (st.on ? '' : ' off') + '" style="width:40px;height:40px;font-size:16px">' + initial(st.name) + (st.bot ? '<span class="bot">🤖</span>' : '') + '</div>' +
          '<div class="nm">' + (st.host ? '👑 ' : '') + esc(st.name) + '</div>' + (st.bot ? '' : '<div class="small">' + (lvTag(rankOf(st.name)) || '<span class="lv">🐣 Lv.1</span>') + '</div>') + '<div class="tm ' + (t === 'A' ? 'tA' : 'tB') + '">' + t + '팀' + (s === me ? ' · 나' : '') + '</div>';
        if (r.host && s !== me) inner += '<div class="acts"><button class="btn sm ghost" data-kick="' + s + '">' + (st.bot ? '봇 빼기' : '내보내기') + '</button></div>';
      } else {
        inner = '<div class="tm ' + (t === 'A' ? 'tA' : 'tB') + '">' + t + '팀 빈자리</div><div class="acts">' +
          '<button class="btn sm primary" data-sit="' + s + '">' + (me >= 0 ? '여기로 옮기기' : '여기 앉기') + '</button>' +
          (r.host ? '<button class="btn sm" data-bot="' + s + '">🤖 봇 넣기</button>' : '') + '</div>';
      }
      return '<div class="wseat p' + p + (s === me ? ' me' : '') + '">' + inner + '</div>';
    }).join('');
    var full = r.seats.every(Boolean);
    var h = '<div class="shell"><div class="hdr"><button class="iconbtn" id="wBack" aria-label="로비">←</button><div class="title" style="min-width:0"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (r.opt.lock ? '🔒 ' : '') + esc(r.name) + '</span></div>' +
      '<button class="iconbtn" id="wPeople" aria-label="참가자·관전자">👥</button>' +
      '<button class="iconbtn" id="wChat" aria-label="채팅">💬' + (S.unread ? '<span class="badge-dot">' + S.unread + '</span>' : '') + '</button></div>' +
      '<div class="content wait-wrap">' +
      '<div class="wait-info"><span class="chip">🎯 목표 ' + r.opt.target + '점</span><span class="chip">⏱ ' + (r.opt.timer ? '턴 ' + r.opt.timer + '초' : '시간 제한 없음') + '</span><span class="chip">🤖 AI ' + botDelayLabel(botDelayOf(r.opt)) + '</span>' + (r.opt.lock ? '<span class="chip">🔒 비밀방</span>' : '') + '</div>' +
      watchersHTML(r) + '<div class="idle-note" id="wIdle" hidden></div>' +
      '<div class="wait-table">' + seats + '<div class="wait-center"><b style="font-size:20px">' + r.seats.filter(Boolean).length + ' / 4</b><br>마주 앉은<br>두 사람이 한 팀</div></div>' +
      (r.host ? '<button class="btn primary block" id="wStart" ' + (full ? '' : 'disabled') + '>' + (full ? '게임 시작' : '네 자리가 차면 시작할 수 있어요') + '</button>' +
        '<div class="row" style="display:flex;gap:8px"><button class="btn block" id="wFill" ' + (full ? 'disabled' : '') + '>🤖 봇 채우기</button>' +
        '<button class="btn block" id="wShuffle" ' + (r.seats.filter(Boolean).length < 2 ? 'disabled' : '') + '>🎲 랜덤 팀</button><button class="btn block" id="wOpt">방 설정</button></div>'
        : me >= 0 ? '<div class="empty" style="padding:14px">방장(' + esc(r.hostName) + ')이 시작하기를 기다리는 중…</div>' : '<div class="empty" style="padding:14px">관전 중이에요. 빈자리를 눌러 앉을 수 있어요.</div>') +
      '<div style="display:flex;gap:8px"><button class="btn block" id="wInvite">🔗 초대 링크 복사</button>' + (me >= 0 ? '<button class="btn danger block" id="wLeave">나가기</button>' : '') + '</div>' +
      '<div class="sec-title">채팅</div><div class="chatlist" id="wChatList">' + chatItems(r.chat.slice(-8)) + '</div>' +
      '<form class="chatform" id="wChatForm"><input class="input" id="wMsg" maxlength="100" placeholder="메시지" autocomplete="off"><button class="btn" type="submit">보내기</button></form>' +
      '</div></div>';
    var focused = document.activeElement && document.activeElement.id === 'wMsg', val = focused ? $('#wMsg').value : '';
    app.innerHTML = h;
    if (focused) { var mi = $('#wMsg'); mi.value = val; mi.focus(); }
    $('#wBack').onclick = function () { location.hash = '#/'; };
    $('#wChat').onclick = openChat;
    $('#wPeople').onclick = openPeople;
    $('#wInvite').onclick = copyInvite;
    var wl = $('#wLeave'); if (wl) wl.onclick = leaveRoom;
    var ws = $('#wStart'); if (ws) ws.onclick = function () { roomCall('start', {}, ws); };
    var wf = $('#wFill'); if (wf) wf.onclick = function () { fillBots(wf); };
    var wo = $('#wOpt'); if (wo) wo.onclick = optSheet;
    var wsh = $('#wShuffle'); if (wsh) wsh.onclick = function () { roomCall('shuffle', {}, wsh); };
    bindKickWatchers(app);
    $$('[data-sit]').forEach(function (b) { b.onclick = function () { var s = +b.getAttribute('data-sit'); if (r.me >= 0) roomCall('seat', { seat: s }, b); else joinRoom(r.id, r.opt.lock, s); }; });
    $$('[data-bot]').forEach(function (b) { b.onclick = function () { roomCall('addBot', { seat: +b.getAttribute('data-bot') }, b); }; });
    $$('[data-kick]').forEach(function (b) { b.onclick = function () { kickSeat(+b.getAttribute('data-kick'), b); }; });
    $('#wChatForm').onsubmit = function (e) { e.preventDefault(); sendChat($('#wMsg')); };
    var cl = $('#wChatList'); cl.scrollTop = cl.scrollHeight;
    S.unread = 0;
  }
  // 관전자 목록 한 줄 (없으면 빈 문자열 · always: 메뉴처럼 없을 때도 '없음'으로 보여 줄 곳)
  function watchersHTML(r, always) {
    var w = r.watchers || [];
    if (!w.length && !always) return '';
    var list = !w.length ? '<span>없음</span>'
      : r.host ? w.map(function (n) { return '<button class="wkick" data-kickw="' + esc(n) + '" title="내보내기">' + esc(n) + ' ✕</button>'; }).join('')   // 방장: 눌러서 내보내기
      : '<span>' + w.map(esc).join(', ') + '</span>';
    return '<div class="watchers">👀 관전 ' + w.length + '명' + list + '</div>';
  }
  // 게임 중 봇 자리 이어받기 (관전자): 그 자리 손패로 바로 이어서 함. 이 판은 내 전적에 안 남음
  function takeSeat(s, btn) {
    var st = S.room.seats[s];
    if (!st || !confirm(st.name + ' 자리를 이어받아 지금 게임에 참여할까요?\n(이 판은 내 전적에 남지 않아요)')) return;
    if (btn) btn.disabled = true;
    api('takeover', { room: S.roomId, seat: s, pw: S.roomPw || '' }).then(function (r) {
      S.sel = []; applyRoom(r, true); toast('이어서 해요! 내 손패를 확인하세요'); sfx('turn');
    }, function (e) {
      if (btn) btn.disabled = false;
      if (e.code === 'pw') return watchRoom(S.roomId, true, true);
      toast(e.message, true);
    });
  }
  // 👥 참가자 · 관전자 한눈에: 팀별 자리(방장·나·봇·접속 상태) + 관전자(방장은 눌러서 내보내기)
  function openPeople() {
    var r = S.room; if (!r) return;
    var w = r.watchers || [];
    function seatRow(s) {
      var st = r.seats[s];
      if (!st) return '<div class="prow empty">빈자리</div>';
      var state = st.bot ? '🤖 봇' : !st.on ? '⚪ 연결 끊김' : st.afk ? '💤 자리 비움' : '🟢 접속 중';
      return '<div class="prow"><b>' + (st.host ? '👑 ' : '') + esc(st.name) + (s === r.me ? ' (나)' : '') + '</b><span>' + state + '</span></div>';
    }
    openModal('<h2>👥 참가자 · 관전자<button class="x" data-x>✕</button></h2>' +
      '<div class="sec-title">참가자 ' + r.seats.filter(Boolean).length + '/4</div>' +
      '<div class="pteam"><div class="tm tA">A팀</div>' + seatRow(0) + seatRow(2) + '</div>' +
      '<div class="pteam"><div class="tm tB">B팀</div>' + seatRow(1) + seatRow(3) + '</div>' +
      '<div class="sec-title">관전자 ' + w.length + '명' + (r.host && w.length ? ' <small>· 이름을 누르면 내보내기</small>' : '') + '</div>' +
      watchersHTML(r, true).replace(/^<div class="watchers">👀 관전 \d+명/, '<div class="watchers">'));
    bindKickWatchers(modalEl);
  }
  // 내보내기 (방장): 다시 못 들어온다는 걸 확인받고 보냄. 게임 중인 사람은 봇이 이어서 함
  function kickSeat(s, btn) {
    var st = S.room.seats[s];
    if (!st) return;
    if (!st.bot && !confirm(st.name + '님을 내보낼까요?\n이 방에는 다시 들어올 수 없어요.' + (S.room.status === 'play' ? '\n(남은 게임은 봇이 이어서 해요)' : ''))) return;
    roomCall('kick', { seat: s }, btn);
  }
  function bindKickWatchers(root) {
    $$('[data-kickw]', root).forEach(function (b) {
      b.onclick = function () {
        var n = b.getAttribute('data-kickw');
        if (confirm(n + '님을 관전에서 내보낼까요?\n이 방에는 다시 들어올 수 없어요.')) roomCall('kick', { watcher: n }, b);
      };
    });
  }
  function fillBots(btn) {
    btn.disabled = true;
    var empty = [0, 1, 2, 3].filter(function (s) { return !S.room.seats[s]; });
    (function next() { var s = empty.shift(); if (s === undefined) return; roomCall('addBot', { seat: s }).then(next); })();
  }
  function optSheet() {
    var r = S.room;
    openModal('<h2>방 설정<button class="x" data-x>✕</button></h2>' + roomOptForm({ name: r.name, target: r.opt.target, timer: r.opt.timer, botDelay: botDelayOf(r.opt), pw: '' }) +
      '<div class="small">비밀번호 칸을 비우면 공개방이 돼요.</div><button class="btn primary block" id="oGo">저장</button>');
    bindSeg(modalEl); bindTarget(modalEl);
    $('#oGo').onclick = function () { roomCall('opt', { name: $('#oName').value, target: targetVal(modalEl), timer: +segVal(modalEl, 'timer'), botDelay: botDelayVal(modalEl), pw: $('#oPw').value }, $('#oGo')).then(closeModal); };
  }
  function copyInvite() {
    // ?reset: 잠만보 앱의 예전 서비스 워커(v2.2)가 남은 기기에서도 티츄 페이지가 바로 열리게 (티츄는 이 값을 쓰지 않고 지움)
    var url = location.origin + location.pathname + '?reset#/room/' + S.room.id;
    var txt = '[잠만보 티츄] ' + S.room.name + ' 방에서 같이 해요! ' + url;
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast('초대 링크를 복사했어요. 단톡방에 붙여 넣어 주세요'); }, function () { prompt('복사해서 보내 주세요', txt); });
  }
  function leaveRoom() {
    var playing = S.room.status === 'play' && S.room.me >= 0;
    if (playing && !confirm('게임 중에 나가면 봇이 대신하고 이번 판은 전적에 남지 않아요. 나갈까요?')) return;
    api('leave', { room: S.roomId }).then(function () { location.hash = '#/'; }, function (e) { toast(e.message, true); });
  }

  /* ----- 채팅 ----- */
  function chatItems(list) {
    return list.map(function (c) {
      if (c.s === -2) return '<div class="m sys">' + esc(c.m) + '</div>';
      var cls = c.s >= 0 ? (team(c.s) ? 'tB' : 'tA') : '';
      return '<div class="m"><b class="' + cls + '">' + esc(c.n) + '</b>' + esc(c.m) + '</div>';
    }).join('') || '<div class="m sys">아직 메시지가 없어요</div>';
  }
  var QUICK = ['좋아요 👍', '나이스! 👏', '미안해요 🙏', 'ㅋㅋㅋ', '티츄 화이팅!', '폭탄 조심 💣', '잠깐만요', '한 판 더?'];
  function openChat() {
    S.chatOpen = true; S.unread = 0;
    openModal('<h2>채팅<button class="x" data-x>✕</button></h2><div class="chatlist" id="cl"></div>' +
      '<div class="quick">' + QUICK.map(function (q) { return '<button data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') + '</div>' +
      '<form class="chatform" id="cf"><input class="input" id="cm" maxlength="100" placeholder="메시지" autocomplete="off"><button class="btn primary" type="submit">보내기</button></form>',
      function () { S.chatOpen = false; render(); });
    paintChat();
    $$('[data-q]', modalEl).forEach(function (b) { b.onclick = function () { sendChat(null, b.getAttribute('data-q')); }; });
    $('#cf').onsubmit = function (e) { e.preventDefault(); sendChat($('#cm')); };
  }
  function paintChat() { var cl = $('#cl'); if (!cl || !S.room) return; cl.innerHTML = chatItems(S.room.chat); cl.scrollTop = cl.scrollHeight; }
  function sendChat(input, text) {
    var m = text || (input && input.value.trim());
    if (!m) return;
    if (input) input.value = '';
    api('chat', { room: S.roomId, m: m }).then(function (r) { applyRoom(r); }, function (e) { toast(e.message, true); });
  }

  /* ----- 게임 화면 ----- */
  function fakeG(g, me) {   // 엔진 함수용: 내 손패만 들어 있는 상태
    var hands = [[], [], [], []]; if (me >= 0) hands[me] = g.hand || [];
    return { hands: hands, trick: g.trick, wish: g.wish };
  }
  function pendingSeats(g) {
    var p = [];
    if (!g) return p;
    if (g.phase === 'grand') { for (var i = 0; i < 4; i++) if (g.grand[i] === null) p.push(i); }
    else if (g.phase === 'exchange') { for (i = 0; i < 4; i++) if (!g.exDone[i]) p.push(i); }
    else if (g.phase === 'play') p.push(g.turn);
    else if (g.phase === 'dragon' && g.dragon) p.push(g.dragon.seat);
    return p;
  }
  // 현재 트릭에서 각 자리의 마지막 행동 (낸 카드 / 패스)
  function trickState(g) {
    var st = {}, start = 0;
    for (var i = g.log.length - 1; i >= 0; i--) { var k = g.log[i].k; if (k === 'trick' || k === 'dog' || k === 'exchDone' || k === 'deal' || k === 'round') { start = i + 1; break; } }
    var played = {};
    for (i = start; i < g.log.length; i++) {
      var e = g.log[i];
      if (e.k === 'play') { played[e.s] = { play: e.c }; st[e.s] = played[e.s]; for (var k in st) if (st[k].pass) delete st[k]; }   // 새 카드가 나오면 그 전 패스는 지움
      else if (e.k === 'pass') st[e.s] = { pass: 1 };
    }
    // 로그가 잘렸을 때 대비: 트릭 기록으로 보충
    g.trick.plays.forEach(function (p) { if (!st[p.s]) st[p.s] = { play: p.c }; });
    // 패스했던 사람: 앞서 낸 카드가 있으면 그 카드를 계속 보여 줌. 지금 차례인 사람의 패스는 지움
    for (var s2 = 0; s2 < 4; s2++) {
      if (st[s2] && st[s2].pass && (g.phase !== 'play' || g.turn === s2)) delete st[s2];
      if (!st[s2] && played[s2]) st[s2] = played[s2];
    }
    return st;
  }

  function renderGame() {
    var r = S.room, g = r.g, me = r.me, view = me < 0 ? 0 : me;
    if (!g) return;
    var pend = pendingSeats(g), myTeam = team(view);
    var top = g.trick.plays.length ? g.trick.plays[g.trick.plays.length - 1] : null;
    var ts = trickState(g), op = S.optim, closing = isClosing(g);
    if (op && me >= 0 && op.k === 'play' && op.c) { ts[me] = { play: op.c }; S.flash[me] = 0; top = { s: me, c: op.c }; }
    if (op && me >= 0 && op.k === 'pass') { ts[me] = { pass: 1 }; S.flash[me] = 0; }
    var myTurn = me >= 0 && g.phase === 'play' && g.turn === me;
    var scoreUs = g.scores[myTeam], scoreThem = g.scores[1 - myTeam];
    var nmUs = [view, (view + 2) % 4].map(seatName).join('·'), nmThem = [(view + 1) % 4, (view + 3) % 4].map(seatName).join('·');

    var h = '<div class="game">';
    // 상단: 점수
    h += '<div class="gbar"><button class="iconbtn" id="gMenu" aria-label="메뉴">≡</button>' +
      '<div class="score"><div class="tm ' + (myTeam ? 'tB' : 'tA') + '"><span>' + scoreUs + '</span><small>' + (me >= 0 ? '우리 · ' : '') + esc(nmUs) + '</small></div>' +
      '<div class="vs">' + g.round + 'R<small>/' + g.target + '</small></div>' +
      '<div class="tm ' + (myTeam ? 'tA' : 'tB') + '"><span>' + scoreThem + '</span><small>' + (me >= 0 ? '상대 · ' : '') + esc(nmThem) + '</small></div></div>' +
      '<button class="iconbtn" id="gSheet" aria-label="점수표">📋</button>' +
      '<button class="iconbtn" id="gPeople" aria-label="참가자·관전자">👥' + ((r.watchers || []).length ? '<span class="cnt">' + r.watchers.length + '</span>' : '') + '</button>' +
      '<button class="iconbtn" id="gChat" aria-label="채팅">💬' + (S.unread ? '<span class="badge-dot">' + S.unread + '</span>' : '') + '</button></div>';

    // 테이블
    h += '<div class="felt">';
    S.topSeat = top && (g.phase === 'play' || g.phase === 'dragon') ? top.s : -1;
    var fronts = ['', '', '', ''];
    for (var s = 0; s < 4; s++) {
      var p = pos(s, view), st = r.seats[s];
      if (p !== 0) h += seatHTML(g, s, p, st, pend);
      fronts[p] = frontHTML(g, s, p, ts[s], top && top.s === s, pend.indexOf(s) >= 0 && !closing && (g.phase === 'play' || g.phase === 'dragon') && !(op && s === me));
    }
    // 낸 카드 판: 위(맞은편) · 왼쪽 · 오른쪽 · 가운데 안내 · 아래(나) — 네 사람 카드가 서로 겹치지 않게 칸을 나눔
    h += '<div class="board">' + fronts[2] + fronts[3] + fronts[1] + '<div class="center">' + centerHTML(g, me, pend) + '</div>' + fronts[0] + '</div>';
    h += panelHTML(g, me);
    h += '</div>';

    // 내 영역
    if (me >= 0) {
      var mst = r.seats[me];
      if (mst && mst.afk) h += '<div class="afkbar">자리 비움 · 자동 진행 중 <button class="btn sm primary" id="gBack">돌아왔어요</button></div>';
      h += '<div class="timerbar"><i id="myTimer" style="width:0"></i></div>';
      h += myBarHTML(g, me, pend, myTurn, top);
      h += '<div class="handwrap"><div class="hand" id="hand"></div></div>';
    } else {
      // 관전: 아래 자리 사람(이름·남은 장수·티츄)은 테이블 위가 아니라 여기 표시 + 봇 자리 이어받기
      var takes = r.status === 'play' && !r.solo ? r.seats.map(function (st, s) {
        return st && st.bot ? '<button class="btn sm primary" data-take="' + s + '">🙋 ' + esc(st.name) + ' 자리 이어받기 (' + (team(s) ? 'B' : 'A') + '팀)</button>' : '';
      }).join('') : '';
      h += '<div class="spect">' + seatHTML(g, view, 0, r.seats[view], pend) +
        '<div>👀 관전 중 · ' + esc(r.name) + (r.status === 'play' ? '' : ' (게임 끝)') + '</div>' + watchersHTML(r) +
        (takes ? '<div class="takes">' + takes + '</div>' : '') + '</div>';
    }
    h += '</div>';
    app.innerHTML = h;
    if (S.shake) { S.shake = false; $('.felt').classList.add('shake'); }
    S.flash = {};
    bindGame();
    layoutHand();
    fitFronts();
    updateSelInfo();
    tickTimers();
  }

  function seatHTML(g, s, p, st, pend) {
    var t = team(s) ? 'B' : 'A', isPend = pend.indexOf(s) >= 0, place = g.out.indexOf(s);
    var tags = '';
    if (g.phase !== 'roundEnd' && g.phase !== 'gameEnd') tags += place >= 0 ? '<span class="tag place">' + (place + 1) + '등</span>' : '<span class="tag cnt">' + g.counts[s] + '장</span>';
    if (g.tichu[s]) tags += '<span class="tag ' + (g.tichu[s] === 2 ? 'gt">라지' : 'ti">티츄') + '</span>';
    if (g.phase === 'grand' && g.grand[s] === false) tags += '<span class="tag">패스</span>';
    if (st && st.afk) tags += '<span class="tag afk">자동</span>';
    if (st && !st.on) tags += '<span class="tag afk">끊김</span>';
    if (s === S.topSeat) tags = '<span class="tag lead">👑 최고</span>' + tags;
    return '<div class="seat p' + p + (s === S.topSeat ? ' lead' : '') + (isPend && (g.phase === 'play' || g.phase === 'dragon') ? ' turn' : '') + '" data-seat="' + s + '"><div class="av ' + t + (isPend ? ' turn' : '') + (st && !st.on ? ' off' : '') + '">' + initial(st ? st.name : '?') +
      (isPend ? ringSVG() : '') + (st && st.bot ? '<span class="bot">🤖</span>' : '') + '</div>' +
      '<div class="nm ' + (t === 'A' ? 'tA' : 'tB') + '">' + esc(st ? st.name : '') + '</div><div class="info">' + tags + '</div></div>';
  }
  function ringSVG() { return '<svg class="ring" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" stroke-dasharray="113.1" stroke-dashoffset="0" data-ring="1"/></svg>'; }
  // 바닥(낸 카드 칸). isTurn = 지금 이 사람 차례 → 금색 테두리 + '차례' 표시
  function frontHTML(g, s, p, st, isTop, isTurn) {
    var mine = p === 0 && myView() >= 0;   // 관전자에게 아래 자리는 '나'가 아님
    var who = mine ? '나' : esc(seatName(s)), tc = team(s) ? 'B' : 'A', tn = isTurn ? ' turn' : '';
    var turnLbl = isTurn ? '<span class="turnlbl">' + (g.phase === 'dragon' ? '🐉 ' : '⏳ ') + (mine ? '내 차례' : who + ' 차례') + '</span>' : '';
    if (g.phase !== 'play' && g.phase !== 'dragon') return '<div class="front p' + p + ' none"></div>';
    if (!st) return isTurn ? '<div class="front p' + p + ' t' + tc + ' wait' + tn + '">' + turnLbl + '</div>' : '<div class="front p' + p + ' none"></div>';
    var fl = S.flash[s] !== undefined ? ' flash' : '', delay = fl ? ' style="animation-delay:' + (S.flash[s] * 0.28) + 's"' : '';
    if (st.pass) return '<div class="front pass p' + p + fl + tn + '"' + delay + '><span class="lbl">' + who + ' · 패스</span>' + turnLbl + '</div>';
    var size = 'md';   // 크기는 같게, 칸이 좁으면 fitFronts 가 겹침만 늘림
    return '<div class="front p' + p + ' t' + tc + (isTop ? ' top' : ' old') + fl + tn + '"' + delay + '>' + cardsHTML(st.play.c, size) + '<span class="lbl">' + (isTop ? '👑 ' : '') + who + ' · ' + esc(TE.comboName(st.play)) + '</span>' + turnLbl + '</div>';
  }
  function centerHTML(g, me, pend) {
    var h = '', msg = '', isMe = false;
    if (g.phase === 'grand') msg = '라지 티츄 결정 중 · ' + g.grand.filter(function (x) { return x !== null; }).length + '/4';
    else if (g.phase === 'exchange') msg = '카드 교환 중 · ' + g.exDone.filter(Boolean).length + '/4';
    else if (g.phase === 'play' && isClosing(g)) {
      var tw = g.trick.plays[g.trick.plays.length - 1].s;
      msg = '모두 패스 · ' + (tw === me ? '내가' : seatName(tw)) + ' 가져가는 중' + (tw !== me && myBombs().length ? ' · 💣 지금 폭탄 가능!' : '');
    }
    else if (g.phase === 'play') {
      isMe = g.turn === me;
      msg = isMe ? (g.trick.plays.length ? '내 차례' : '내 차례 · 선') : seatName(g.turn) + (g.trick.plays.length ? ' 차례' : ' 선');
    } else if (g.phase === 'dragon') { isMe = g.dragon.seat === me; msg = isMe ? '용 트릭을 줄 상대를 고르세요' : seatName(g.dragon.seat) + ': 용 트릭 줄 상대 고르는 중'; }
    else if (g.phase === 'roundEnd') msg = g.round + '라운드 끝';
    else if (g.phase === 'gameEnd') msg = '게임 끝';
    h += '<div class="turnmsg' + (isMe ? ' me' : '') + '">' + esc(msg) + '</div>';
    if (g.wish) {
      var must = me >= 0 && g.phase === 'play' && g.turn === me && !!TE.wishPlays(fakeG(g, me), me);
      h += '<div class="wish' + (must ? ' must' : '') + '">🐦 참새 콜 ' + TE.rankLabel(g.wish) + (must ? ' · 꼭 내야 해요' : '') + '</div>';
    }
    if (g.trick.plays.length && (g.phase === 'play' || g.phase === 'dragon')) {   // 지금 테이블 최고 카드를 낸 사람
      var tp = g.trick.plays[g.trick.plays.length - 1], tt = team(tp.s) ? 'B' : 'A';
      if (S.optim && S.optim.k === 'play' && S.optim.c && me >= 0) { tp = { s: me, c: S.optim.c }; tt = team(me) ? 'B' : 'A'; }
      h += '<div class="topwho ' + tt + '"><span class="dot"></span>' + (tp.s === me ? '내가 낸 카드' : esc(seatName(tp.s))) + ' · ' + esc(TE.comboName(tp.c)) + '</div>';
    }
    return h;
  }
  function panelHTML(g, me) {
    if (me < 0) return '';
    if (S.optim && (S.optim.k === 'grand' || S.optim.k === 'exch' || S.optim.k === 'dragon')) return '';
    var r = S.room;
    if (g.phase === 'grand' && g.grand[me] === null) {
      return '<div class="panel"><h3>처음 8장 — 라지 티츄?</h3><p>1등으로 나가면 +200, 못 하면 -200점. 나머지 6장은 결정 뒤에 받아요.</p>' +
        '<div class="row"><button class="btn" id="gtPass">패스</button><button class="btn primary" id="gtCall">라지 티츄!</button></div></div>';
    }
    if (g.phase === 'exchange' && !g.myExch) {
      var who = [(me + 3) % 4, (me + 2) % 4, (me + 1) % 4], label = ['왼쪽 상대', '파트너', '오른쪽 상대'];
      return '<div class="panel"><h3>카드 교환</h3><p>칸을 고르고 손패에서 카드를 눌러 넣으세요. 세 칸을 채우면 보내기!</p><div class="slots">' +
        who.map(function (s, i) {
          var c = S.exch[i];
          return '<div class="slot' + (S.exSlot === i ? ' on' : '') + '" data-slot="' + i + '"><div class="who ' + (team(s) ? 'B' : 'A') + '">' + label[i] + '<br>' + esc(seatName(s)) + '</div>' + (c ? cardHTML(c) : '<div class="ph">＋</div>') + '</div>';
        }).join('') + '</div><div class="row"><button class="btn primary block" id="exGo" ' + (S.exch.every(Boolean) ? '' : 'disabled') + '>보내기</button></div></div>';
    }
    if (g.phase === 'dragon' && g.dragon && g.dragon.seat === me) {
      var a = (me + 3) % 4, b = (me + 1) % 4;
      return '<div class="panel"><h3>🐉 용 트릭을 누구에게?</h3><p>용으로 딴 트릭은 상대 팀 한 명에게 줘야 해요.</p><div class="row">' +
        '<button class="btn" data-dragon="' + a + '">← ' + esc(seatName(a)) + ' (' + g.counts[a] + '장)</button>' +
        '<button class="btn" data-dragon="' + b + '">' + esc(seatName(b)) + ' (' + g.counts[b] + '장) →</button></div></div>';
    }
    return '';
  }
  // 아래 조작판: 1줄 = 내 이름·상태 + 안내 글, 2줄 = 큰 버튼 (엄지로 누르기 쉽게)
  function myBarHTML(g, me, pend, myTurn, top) {
    var r = S.room, st = r.seats[me], t = team(me) ? 'B' : 'A', place = g.out.indexOf(me), isPend = pend.indexOf(me) >= 0;
    var tags = '';
    if (S.topSeat === me) tags += '<span class="tag lead">👑 최고</span>';
    if (g.tichu[me]) tags += '<span class="tag ' + (g.tichu[me] === 2 ? 'gt">라지' : 'ti">티츄') + '</span>';
    if (place >= 0 && g.phase === 'play') tags += '<span class="tag place">' + (place + 1) + '등</span>';
    var acts = '', wait = '';
    if (S.optim) wait = '보내는 중…';
    else if (g.phase === 'play' && g.counts[me] > 0) {
      var must = myTurn && TE.wishPlays(fakeG(g, me), me);
      if (myTurn) acts += '<button class="btn hint" id="bHint" aria-label="추천 조합">💡<small>추천</small></button>';
      if (r.canTichu) acts += '<button class="btn tichu" id="bTichu">티츄<small>+100</small></button>';
      acts += '<button class="btn pass" id="bPass" ' + (myTurn && top && !must ? '' : 'disabled') + '>패스</button>';
      acts += '<button class="btn primary play" id="bPlay" disabled>내기</button>';
      if (myBombs().length) acts += '<button class="btn bomb" id="bBomb" title="단축키 B">💣<small>폭탄 B</small></button>';
    } else if (g.phase === 'play' && place >= 0) wait = '손패를 다 냈어요 · ' + (place + 1) + '등';
    else if (g.phase === 'exchange') wait = g.myExch ? '다른 사람 교환 기다리는 중…' : '위 칸을 고르고 카드를 넣어 주세요';
    else if (g.phase === 'grand') wait = g.grand[me] !== null ? '다른 사람 결정 기다리는 중…' : '라지 티츄를 할지 골라 주세요';
    else if (g.phase === 'dragon') wait = isPend ? '용 트릭 줄 상대를 고르세요' : '용 트릭 주는 중…';
    else if (g.phase === 'roundEnd') wait = '라운드 끝 · 곧 다음 라운드';
    else if (g.phase === 'gameEnd') wait = '게임 끝';
    var tbtn = '';
    if (r.canTichu && g.phase !== 'play') { tbtn = '<button class="btn sm tichu" id="bTichu">스몰 티츄 +100</button>'; acts = acts.replace(/<button class="btn tichu" id="bTichu">[^]*?<\/button>/, ''); }
    return '<div class="dock' + (isPend ? ' turn' : '') + '"><div class="dk-top"><span class="av sm ' + t + '">' + initial(st.name) + '</span><b class="dk-name">' + esc(st.name) + '</b>' + tags +
      '<span class="dk-msg" id="selinfo">' + (myTurn ? '<b class="myturn">내 차례</b>' : '') + '</span><span class="dk-sec" id="mySec"></span></div>' +
      (acts ? '<div class="dk-acts">' + acts + '</div>' : '<div class="dk-wait"><span>' + esc(wait) + '</span>' + tbtn + '</div>') + '</div>';
  }
  // 모두 패스했지만 트릭을 아직 안 가져간 짧은 틈 (서버 v1.5+ 의 g.trick.closing). 이때도 폭탄 가능
  function isClosing(g) { return !!(g && g.phase === 'play' && g.trick && g.trick.closing && g.trick.plays.length); }
  // 지금 테이블 위에 낼 수 있는 내 폭탄 (약한 것부터)
  function myBombs() {
    var r = S.room, g = r && r.g, me = r ? r.me : -1;
    if (!g || me < 0 || g.phase !== 'play' || !g.hand || !g.hand.length || !g.trick.plays.length) return [];
    if (S.optim && S.optim.k === 'play') return [];
    var top = g.trick.plays[g.trick.plays.length - 1];
    if (top.s === me) return [];   // 내가 최고면 폭탄 낼 이유 없음
    return TE.plays(g.hand, top.c).filter(TE.isBomb).sort(function (a, b) { return TE.power(a) - TE.power(b); });
  }
  // 💣 버튼 / B 키: 고른 카드가 폭탄이면 그걸, 아니면 가장 약한 폭탄을 바로 냄
  function quickBomb(btn) {
    if (S.busy) return;
    var list = myBombs();
    if (!list.length) { toast('지금 낼 수 있는 폭탄이 없어요'); return; }
    var st = selState(), pick = st && st.ok && st.c && TE.isBomb(st.c) ? S.sel.slice() : list[0].c.slice();
    S.sel = [];
    act('play', { cards: pick, wish: 0 }, btn);
  }
  // 키보드 단축키 (PC): B 폭탄 · Enter 내기 · P 패스 · H 추천
  document.addEventListener('keydown', function (e) {
    if (S.route.name !== 'room' || !S.room || !S.room.g || S.modal || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    var k = (e.key || '').toLowerCase(), b;
    if (k === 'b' || k === 'ㅠ') { e.preventDefault(); quickBomb($('#bBomb')); }
    else if (k === 'enter') { b = $('#bPlay'); if (b && !b.disabled) { e.preventDefault(); playSelected(b); } }
    else if (k === 'p' || k === 'ㅔ') { b = $('#bPass'); if (b && !b.disabled) { e.preventDefault(); S.sel = []; act('pass', {}, b); } }
    else if (k === 'h' || k === 'ㅗ') { b = $('#bHint'); if (b) { e.preventDefault(); useHint(); } }
  });
  // 💡 추천: 낼 수 있는 조합을 낮은 것부터 하나씩 골라 줌 (누를 때마다 다음 것)
  function hintList() {
    var r = S.room, g = r.g, me = r.me, top = g.trick.plays.length ? g.trick.plays[g.trick.plays.length - 1].c : null;
    var list = TE.wishPlays(fakeG(g, me), me) || TE.plays(g.hand || [], top);
    return list.slice().sort(function (a, b) {
      return (TE.isBomb(a) ? 1 : 0) - (TE.isBomb(b) ? 1 : 0) || (a.ph ? 1 : 0) - (b.ph ? 1 : 0) || (top ? 0 : b.n - a.n) || a.r - b.r;
    });
  }
  function useHint() {
    var list = hintList();
    if (!list.length) { toast('낼 수 있는 조합이 없어요 · 패스하세요'); return; }
    S.hintI = (S.hintI + 1) % list.length;
    S.sel = list[S.hintI].c.slice();
    sfx('tap');
    $$('#hand .card').forEach(function (el) { el.classList.toggle('sel', S.sel.indexOf(el.getAttribute('data-c')) >= 0); });
    updateSelInfo();
  }

  function bindGame() {
    var r = S.room, g = r.g, me = r.me;
    $('#gMenu').onclick = gameMenu;
    $('#gSheet').onclick = scoreSheet;
    $('#gPeople').onclick = openPeople;
    $$('[data-take]').forEach(function (b) { b.onclick = function () { takeSeat(+b.getAttribute('data-take'), b); }; });
    $('#gChat').onclick = openChat;
    var gb = $('#gBack'); if (gb) gb.onclick = function () { act('back', {}, gb); };
    var t1 = $('#gtPass'); if (t1) t1.onclick = function () { act('grand', { call: false }, t1); };
    var t2 = $('#gtCall'); if (t2) t2.onclick = function () { if (confirm('라지 티츄를 선언할까요? (±200점)')) act('grand', { call: true }, t2); };
    var bt = $('#bTichu'); if (bt) bt.onclick = function () { if (confirm('스몰 티츄를 선언할까요?\n1등으로 나가면 +100, 못 하면 -100점')) act('tichu', {}, bt); };
    var bp = $('#bPass'); if (bp) bp.onclick = function () { S.sel = []; act('pass', {}, bp); };
    var bh = $('#bHint'); if (bh) bh.onclick = useHint;
    var bb = $('#bBomb'); if (bb) bb.onclick = function () { quickBomb(bb); };
    var bpl = $('#bPlay'); if (bpl) bpl.onclick = function () { playSelected(bpl); };
    $$('[data-slot]').forEach(function (el) {
      el.onclick = function () { var i = +el.getAttribute('data-slot'); if (S.exSlot === i && S.exch[i]) S.exch[i] = null; S.exSlot = i; render(); };
    });
    var eg = $('#exGo'); if (eg) eg.onclick = function () { act('exch', { cards: [S.exch[2], S.exch[1], S.exch[0]] }, eg); };
    $$('[data-dragon]').forEach(function (b) { b.onclick = function () { act('dragon', { to: +b.getAttribute('data-dragon') }, b); }; });
    $$('.seat[data-seat]').forEach(function (el) {
      el.onclick = function () {
        var s = +el.getAttribute('data-seat'), st = r.seats[s];
        if (r.host && st && !st.bot && !st.on && r.status === 'play' && confirm(st.name + '님 연결이 끊겼어요. 봇으로 바꿀까요?')) roomCall('replace', { seat: s });
      };
    });
  }

  function layoutHand() {
    var el = $('#hand'); if (!el || !S.room || !S.room.g) return;
    var g = S.room.g, hand = g.hand || [], me = S.room.me;
    if (S.optim && S.optim.k === 'play') hand = hand.filter(function (c) { return S.optim.cards.indexOf(c) < 0; });
    var recvSet = {};
    if (g.phase === 'play' && g.recv && !g.played[me]) g.recv.forEach(function (x) { recvSet[x.c] = 1; });
    var inEx = {}; S.exch.forEach(function (c) { if (c) inEx[c] = 1; });
    var wrap = el.parentNode, cs = getComputedStyle(wrap), W = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2, n = hand.length;
    var cw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cw')) || 46;
    var step = n > 1 ? Math.min(cw + 4, (W - cw) / (n - 1)) : 0, total = cw + step * Math.max(0, n - 1);
    el.style.width = total + 'px';
    el.innerHTML = hand.map(function (c, i) {
      var cls = (S.sel.indexOf(c) >= 0 ? 'sel' : '') + (recvSet[c] ? ' new' : '') + (inEx[c] ? ' sel dim' : '');
      return cardHTML(c, cls).replace('class="card', 'style="left:' + (i * step).toFixed(1) + 'px" class="card');
    }).join('') || '<div class="small" style="text-align:center;padding-top:28px">' + (g.phase === 'play' && g.out.indexOf(me) >= 0 ? '손패를 다 냈어요! 🎉' : '') + '</div>';
    bindHandDrag(el);
  }
  // 손패: 탭 = 한 장, 손가락으로 쓸면 여러 장 한 번에 고르기/풀기
  function bindHandDrag(el) {
    var drag = null;
    function cardAt(x, y) { var t = document.elementFromPoint(x, y); t = t && t.closest ? t.closest('#hand .card') : null; return t; }
    el.onpointerdown = function (e) {
      var c = cardAt(e.clientX, e.clientY); if (!c) return;
      var id = c.getAttribute('data-c'), g = S.room.g;
      if (g.phase === 'exchange' || g.phase !== 'play') { tapCard(id); return; }
      e.preventDefault();
      drag = { on: S.sel.indexOf(id) < 0, seen: {} };
      drag.seen[id] = 1; setSel(id, drag.on);
    };
    el.onpointermove = function (e) {
      if (!drag) return;
      var c = cardAt(e.clientX, e.clientY); if (!c) return;
      var id = c.getAttribute('data-c'); if (drag.seen[id]) return;
      drag.seen[id] = 1; setSel(id, drag.on);
    };
    el.onpointerup = el.onpointercancel = el.onpointerleave = function () { drag = null; };
  }
  function setSel(id, on) {
    var i = S.sel.indexOf(id);
    if (on && i < 0) S.sel.push(id); else if (!on && i >= 0) S.sel.splice(i, 1); else return;
    sfx('tap'); S.hintI = -1;
    $$('#hand .card').forEach(function (el) { el.classList.toggle('sel', S.sel.indexOf(el.getAttribute('data-c')) >= 0); });
    updateSelInfo();
  }
  // 낸 카드가 칸 너비를 넘지 않게 카드 겹침 간격 조절 (짧으면 넉넉히, 길면 촘촘히)
  function fitFronts() {
    $$('.board .front .cards').forEach(function (el) {
      var cs = el.children, n = cs.length; if (n < 2) return;
      var W = el.parentNode.clientWidth - 2, cw = cs[0].offsetWidth || 38;
      var step = Math.max(9, Math.min(cw * 0.62, (W - cw) / (n - 1)));
      for (var i = 1; i < n; i++) cs[i].style.marginLeft = (step - cw).toFixed(1) + 'px';
    });
  }
  window.addEventListener('resize', function () { if (S.route.name === 'room') { layoutHand(); fitFronts(); } });

  function tapCard(c) {
    var g = S.room.g;
    if (g.phase === 'exchange' && !g.myExch) {
      var at = S.exch.indexOf(c);
      if (at >= 0) { S.exch[at] = null; S.exSlot = at; }
      else {
        S.exch[S.exSlot] = c;
        for (var k = 1; k <= 3; k++) { var j = (S.exSlot + k) % 3; if (!S.exch[j]) { S.exSlot = j; break; } }
      }
      render();
      return;
    }
    var i = S.sel.indexOf(c);
    sfx('tap');
    if (i >= 0) S.sel.splice(i, 1); else S.sel.push(c);
    $$('#hand .card').forEach(function (el) { el.classList.toggle('sel', S.sel.indexOf(el.getAttribute('data-c')) >= 0); });
    updateSelInfo();
  }

  function selState() {
    var r = S.room, g = r && r.g, me = r ? r.me : -1;
    if (!g || me < 0 || g.phase !== 'play' || !g.counts[me]) return null;
    var top = g.trick.plays.length ? g.trick.plays[g.trick.plays.length - 1].c : null;
    var myTurn = g.turn === me, must = myTurn ? TE.wishPlays(fakeG(g, me), me) : null;
    var res = { myTurn: myTurn, top: top, must: must, c: null, ok: false, msg: '', cls: '' };
    if (!S.sel.length) {
      if (myTurn) {
        var any = (must || TE.plays(g.hand, top)).length;
        res.msg = must ? '참새 콜 [' + TE.rankLabel(g.wish) + '] 를 포함해서 내야 해요' : !any ? '낼 수 있는 조합이 없어요 → 패스' : top ? '더 높은 같은 조합을 고르거나 패스하세요' : '선이에요! 낼 조합을 골라 주세요';
      } else if (top) {
        res.msg = myBombs().length ? '💣 폭탄은 차례가 아니어도 낼 수 있어요 (B 키)' : '';
      }
      return res;
    }
    var c = TE.bestPlay(S.sel, top);
    if (!c) { res.msg = !TE.analyze(S.sel).length ? '조합이 아니에요' : TE.isBomb(top) ? '폭탄은 더 높은 폭탄으로만 이겨요' : '앞 조합(' + TE.comboName(top) + ')보다 높은 같은 종류여야 해요'; res.cls = 'no'; return res; }
    res.c = c;
    var bomb = TE.isBomb(c);
    if (!myTurn) {
      if (bomb && top) { res.ok = true; res.msg = '💣 ' + TE.comboName(c) + ' — 지금 끼어들 수 있어요'; res.cls = 'ok'; }
      else { res.msg = TE.comboName(c) + ' (내 차례가 아니에요)'; }
      return res;
    }
    if (must && !TE.hasNatural(S.sel, g.wish)) { res.msg = '참새 콜 [' + TE.rankLabel(g.wish) + '] 를 포함해야 해요'; res.cls = 'no'; return res; }
    if (c.t === 'dog' && top) { res.msg = '개는 선일 때만'; res.cls = 'no'; return res; }
    res.ok = true; res.msg = '✓ ' + TE.comboName(c); res.cls = 'ok';
    return res;
  }
  function updateSelInfo() {
    var el = $('#selinfo'), b = $('#bPlay'), bp = $('#bPass');
    var st = selState();
    if (el) {
      var turn = st && st.myTurn ? '<b class="myturn">내 차례</b>' : '';
      el.innerHTML = turn + (st && st.msg ? '<span class="' + (st.cls || '') + '">' + esc(st.msg.replace(/^✓ /, '')) + '</span>' : '');
    }
    if (b && st) {
      b.disabled = !st.ok || S.busy;
      b.innerHTML = st.ok ? (st.myTurn ? '내기' : '💣 폭탄!') + '<small>' + esc(TE.comboName(st.c)) + '</small>' : '내기';
      b.classList.toggle('danger', st.ok && !st.myTurn);
    }
    // 낼 게 없으면 패스 버튼을 강조
    if (bp && st) bp.classList.toggle('suggest', !!(st.myTurn && st.top && !S.sel.length && !(st.must || TE.plays(S.room.g.hand || [], st.top)).length));
  }
  function playSelected(btn) {
    var st = selState();
    if (!st || !st.ok) return;
    var cards = S.sel.slice();
    function send(w) { S.sel = []; act('play', { cards: cards, wish: w || 0 }, btn); }
    if (cards.indexOf('MA') >= 0) return wishPicker(send);
    send(0);
  }
  function wishPicker(cb) {
    var ranks = []; for (var r = 2; r <= 14; r++) ranks.push(r);
    openModal('<h2>🐦 참새 콜<button class="x" data-x>✕</button></h2><p class="small" style="margin:0">숫자를 고르면, 그 숫자를 가진 사람은 낼 수 있을 때 반드시 내야 해요.</p>' +
      '<div class="wishgrid">' + ranks.map(function (r) { return '<button data-w="' + r + '">' + TE.rankLabel(r) + '</button>'; }).join('') + '<button class="none" data-w="0">콜 안 함</button></div>');
    $$('[data-w]', modalEl).forEach(function (b) { b.onclick = function () { var w = +b.getAttribute('data-w'); closeModal(); cb(w); }; });
  }

  function gameMenu() {
    var r = S.room, offline = [];
    r.seats.forEach(function (st, s) { if (st && !st.bot && !st.on && s !== r.me) offline.push(s); });
    openModal('<h2>메뉴<button class="x" data-x>✕</button></h2><div class="menu-list">' +
      '<button class="btn block" id="mRules">📖 규칙 보기</button>' +
      watchersHTML(r, true) +
      '<button class="btn block" id="mInvite">🔗 관전 링크 복사</button>' +

      (r.host && r.status === 'play' ? offline.map(function (s) { return '<button class="btn block" data-rep="' + s + '">🤖 ' + esc(seatName(s)) + ' (끊김) → 봇으로</button>'; }).join('') : '') +
      (r.host && r.status === 'play' ? r.seats.map(function (st, s) { return st && !st.bot && s !== r.me ? '<button class="btn block" data-mkick="' + s + '">🚪 ' + esc(st.name) + ' 내보내기 (봇이 대신)</button>' : ''; }).join('') : '') +
      (r.host ? botDelaySeg(botDelayOf(r.opt)) : '') +
      (r.admin ? '<button class="btn danger block" id="mClose">운영진: 방 닫기</button>' : '') +
      '<button class="btn block" id="mLobby">로비로 (방은 그대로)</button>' +
      (r.me >= 0 ? '<button class="btn danger block" id="mLeave">방에서 나가기</button>' : '') + '</div>' + soundRows() + verLine());
    bindSoundRows();
    $$('[data-seg="botDelay"] button', modalEl).forEach(function (b) {   // 게임 중에도 방장이 바로 바꿈
      b.onclick = function () {
        var v = +b.getAttribute('data-v');
        $$('button', b.parentNode).forEach(function (x) { x.classList.toggle('on', x === b); });
        lsSet(LS_BOTD, String(v));
        api('botDelay', { room: S.roomId, botDelay: v }).then(function (rr) { if (rr && rr.id) applyRoom(rr); toast('AI 한 수 간격: ' + botDelayLabel(v)); }, function (e) { toast(e.message, true); });
      };
    });
    $('#mRules').onclick = function () { openModal('<h2>규칙<button class="x" data-x>✕</button></h2>' + rulesBody()); };
    $('#mInvite').onclick = function () { closeModal(); copyInvite(); };
    $('#mLobby').onclick = function () { closeModal(); location.hash = '#/'; };
    var ml = $('#mLeave'); if (ml) ml.onclick = function () { closeModal(); leaveRoom(); };
    var mc = $('#mClose'); if (mc) mc.onclick = function () { if (confirm('이 방을 닫을까요?')) api('adminClose', { room: S.roomId }).then(function () { closeModal(); location.hash = '#/'; }, function (e) { toast(e.message, true); }); };
    $$('[data-rep]', modalEl).forEach(function (b) { b.onclick = function () { closeModal(); roomCall('replace', { seat: +b.getAttribute('data-rep') }); }; });
    $$('[data-mkick]', modalEl).forEach(function (b) { b.onclick = function () { closeModal(); kickSeat(+b.getAttribute('data-mkick')); }; });
    bindKickWatchers(modalEl);
  }

  function scoreSheet() {
    var r = S.room, g = r.g, view = r.me < 0 ? 0 : r.me, us = team(view), them = 1 - us;
    var rows = g.history.map(function (h) {
      return '<tr><td>' + h.round + 'R' + (h.dbl ? ' 원투' : '') + '</td><td>' + signed(h.total[us]) + '</td><td>' + signed(h.total[them]) + '</td><td>' + h.scores[us] + '</td><td>' + h.scores[them] + '</td></tr>';
    }).join('');
    openModal('<h2>점수표<button class="x" data-x>✕</button></h2><table class="result-table"><thead><tr><th>라운드</th><th>' + (r.me >= 0 ? '우리' : 'A팀') + '</th><th>' + (r.me >= 0 ? '상대' : 'B팀') + '</th><th>누적</th><th>누적</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="5">아직 끝난 라운드가 없어요</td></tr>') + '</tbody></table><div class="small">목표 ' + g.target + '점 · 먼저 넘고 앞선 팀이 승리</div>');
  }
  function signed(n) { return (n > 0 ? '+' : '') + n; }

  function showResult() {
    var r = S.room, g = r && r.g;
    if (!g || (g.phase !== 'roundEnd' && g.phase !== 'gameEnd')) return;
    var h = g.history[g.history.length - 1]; if (!h) return;
    var view = r.me < 0 ? 0 : r.me, us = team(view), them = 1 - us, ended = g.phase === 'gameEnd';
    var order = h.out.concat(h.last >= 0 ? [h.last] : []);
    var html = '<h2>' + (ended ? '🏁 게임 끝' : h.round + '라운드 결과') + '<button class="x" data-x>✕</button></h2>';
    if (ended) {
      var won = g.winner === us;
      html += '<div class="big-win"><div class="t" style="color:' + (r.me < 0 ? 'var(--gold2)' : won ? '#86efac' : '#fda4af') + '">' + (r.me < 0 ? (g.winner === 0 ? 'A팀 승리' : 'B팀 승리') : won ? '🎉 우리 팀 승리!' : '아쉽게 졌어요') + '</div>' +
        '<div class="s"><span class="' + (us ? 'tB' : 'tA') + '">' + g.scores[us] + '</span> : <span class="' + (us ? 'tA' : 'tB') + '">' + g.scores[them] + '</span></div><div class="small">' + g.round + '라운드 · 목표 ' + g.target + '점</div></div>';
    }
    if (h.dbl) html += '<div class="notice" style="text-align:center">🎊 원투! ' + esc(seatName(h.out[0])) + ' · ' + esc(seatName(h.out[1])) + ' 팀 +200</div>';
    html += '<div class="order">' + order.map(function (s, i) {
      var call = h.calls.filter(function (c) { return c.s === s; })[0];
      return '<div><span class="pl">' + (i < h.out.length ? (i + 1) + '등' : '꼴찌') + '</span><span class="' + (team(s) ? 'tB' : 'tA') + '" style="flex:1;font-weight:800">' + esc(seatName(s)) + '</span>' +
        (call ? '<span class="tag ' + (call.ok ? 'ti' : '') + '">' + (call.kind === 2 ? '라지' : '스몰') + ' ' + (call.ok ? '성공 +' : '실패 -') + (call.kind === 2 ? 200 : 100) + '</span>' : '') + '</div>';
    }).join('') + '</div>';
    html += '<table class="result-table"><thead><tr><th></th><th>' + (r.me >= 0 ? '우리' : 'A팀') + '</th><th>' + (r.me >= 0 ? '상대' : 'B팀') + '</th></tr></thead><tbody>' +
      '<tr><td>카드 점수</td><td>' + h.card[us] + '</td><td>' + h.card[them] + '</td></tr>' +
      '<tr><td>티츄</td><td>' + signed(h.tichu[us]) + '</td><td>' + signed(h.tichu[them]) + '</td></tr>' +
      '<tr><td>이번 라운드</td><td>' + signed(h.total[us]) + '</td><td>' + signed(h.total[them]) + '</td></tr>' +
      '<tr class="tot"><td>누적</td><td>' + h.scores[us] + '</td><td>' + h.scores[them] + '</td></tr></tbody></table>';
    if (!h.dbl && h.last >= 0 && g.hands) html += '<div class="small">꼴찌 ' + esc(seatName(h.last)) + '의 남은 손패 (' + h.lastHand + '점 → 상대 팀)</div>' + cardsHTML(g.hands[h.last] || [], 'xs');
    if (ended) {
      html += r.me >= 0 ? '<div style="display:flex;gap:8px"><button class="btn primary block" id="rAgain">한 판 더</button><button class="btn block" id="rLobby">로비로</button></div>' : '<button class="btn block" id="rLobby">로비로</button>';
    } else if (r.me >= 0) {
      html += '<button class="btn primary block" id="rNext">' + (r.ready && r.ready[r.me] ? '다른 사람 기다리는 중…' : '다음 라운드') + ' <span id="rCount"></span></button>';
    }
    openModal(html);
    S.modal.result = true;
    var rn = $('#rNext'); if (rn) rn.onclick = function () { act('ready', {}, rn).then(function () { rn.textContent = '다른 사람 기다리는 중…'; }); };
    var ra = $('#rAgain'); if (ra) ra.onclick = function () { closeModal(); roomCall('rematch', {}, ra); };
    var rl = $('#rLobby'); if (rl) rl.onclick = function () { closeModal(); location.hash = '#/'; };
  }

  /* ----- 타이머 (0.25초마다 링·막대만 갱신) ----- */
  // 대기실: 아무 변화 없이 5분이 지나면 서버가 방을 닫음 → 마지막 1분은 남은 시간을 보여 줌 (채팅·자리 이동 등을 하면 다시 5분)
  function idleTick(r) {
    var el = $('#wIdle'); if (!el) return;
    var left = r.idleEnd ? r.idleEnd - now() : Infinity;
    if (left > 60000 || left <= 0) { el.hidden = true; return; }
    var sec = Math.ceil(left / 1000);
    el.hidden = false;
    el.textContent = '⏳ 아무 움직임이 없어 ' + Math.floor(sec / 60) + ':' + ('0' + sec % 60).slice(-2) + ' 뒤에 방이 닫혀요 · 채팅을 보내면 연장돼요';
  }
  function tickTimers() {
    var r = S.room;
    if (r && S.route.name === 'room' && r.status === 'wait') idleTick(r);
    if (!r || S.route.name !== 'room' || !r.g) return;
    var dl = r.dl, total = r.opt.timer * 1000, g = r.g;
    if (g.phase === 'exchange') total = Math.max(total * 2, 40000);
    if (g.phase === 'grand') total = Math.max(total, 20000);
    if (g.phase === 'roundEnd') total = 12000;
    var left = dl ? Math.max(0, dl - now()) : 0, frac = dl && total ? Math.min(1, left / total) : 0;
    $$('[data-ring]').forEach(function (c) {
      c.setAttribute('stroke-dashoffset', dl ? (113.1 * (1 - frac)).toFixed(1) : '0');
      c.parentNode.classList.toggle('low', !!dl && left < 6000);
    });
    var mt = $('#myTimer');
    if (mt) {
      var mine = pendingSeats(g).indexOf(r.me) >= 0;
      mt.style.width = mine && dl && g.phase !== 'roundEnd' ? (frac * 100).toFixed(1) + '%' : '0';
      mt.classList.toggle('low', left < 6000);
      var sec = Math.ceil(left / 1000), ms = $('#mySec');
      if (ms) ms.textContent = mine && dl && g.phase !== 'roundEnd' && left > 0 ? sec + '초' : '';
      if (ms) ms.classList.toggle('low', left < 6000);
      if (mine && dl && g.phase !== 'roundEnd' && left > 0 && sec <= 5 && sec !== S.tickSec) { S.tickSec = sec; sfx('tick'); }
    }
    var rc = $('#rCount'); if (rc) rc.textContent = r.nextAt && g.phase === 'roundEnd' ? '(' + Math.ceil(Math.max(0, r.nextAt - now()) / 1000) + ')' : '';
  }
  setInterval(tickTimers, 250);

  /* ================= 시작 ================= */
  // 카카오톡 안의 브라우저는 화면이 꺼지거나 앱을 잠깐 나가면 연결이 자주 끊김 → 기본 브라우저로 열도록 안내 (닫으면 이번 접속 동안 안 띄움)
  function kakaoInAppNotice() {
    if (!/KAKAOTALK/i.test(navigator.userAgent || '')) return;
    try { if (sessionStorage.getItem('tichu_kakao_hide')) return; } catch (e) {}
    var d = document.createElement('div');
    d.className = 'kakaobar';
    d.innerHTML = '<span>카톡 안 브라우저에서는 게임이 멈출 수 있어요</span><a href="kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href) + '">기본 브라우저로 열기</a><button type="button" aria-label="닫기">✕</button>';
    d.querySelector('button').onclick = function () { d.remove(); try { sessionStorage.setItem('tichu_kakao_hide', '1'); } catch (e) {} };
    document.body.appendChild(d);
  }
  function boot() {
    if (location.search) try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
    if (CFG.env && CFG.env !== 'prod') { var b = document.createElement('div'); b.className = 'env-badge'; b.textContent = 'TEST · ' + CFG.env; document.body.appendChild(b); }
    if (!window.TE) { app.innerHTML = '<div class="boot">엔진 파일(engine.js)을 불러오지 못했어요</div>'; return; }
    kakaoInAppNotice();
    var t = lsGet(LS_TOKEN), info = t && tokenInfo(t);
    if (info && info.x > Date.now()) { S.token = t; S.user = { uid: info.u, name: info.n, kind: info.k, admin: info.k === '운영진' }; return route(); }
    lsSet(LS_TOKEN, null);
    var ks = kakaoSession();
    if (ks && ks.user && ks.user.nickname && lsGet(LS_NOAUTO) !== '1') { renderLogin(); var kg = $('#kGo'); return loginKakao(kg); }
    renderLogin();
  }
  window.TICHU_DEBUG = { state: function () { return S; } };   // 개발자 도구에서 상태 확인용 (읽기 전용으로만 쓰세요)
  boot();
})();
