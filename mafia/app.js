/*! 잠만보 마피아 나레이터 — 화면 v1.2.0 (세일럼 1692 · 퀘스트 감독판 · 남은 시간 읽기 · 말 속도 3배까지)
 * 마피아 세일럼(Town of Salem 방식) 밤 진행을 음성으로 읽어 주는 도구. 서버 없음 — 브라우저 음성합성(speechSynthesis)만 씀.
 * 진행 방식 2가지: 🌱 초보자용(행동까지 안내, 기다림 길게) · ⚡ 숙련자용(직업 이름 + 눈 떠요/감아요만, 기다림 짧게)
 * 켜 둔 직업은 죽었어도 똑같이 부르고 기다림 (소리만으로 생사를 알 수 없게). 순서: 방해꾼 → 마피아 → 연쇄살인마 → 의사 → 경찰 → 감시자
 * 기기 저장: jmb_mafia_opt (방식 · 직업 · 목소리 · 속도 · 음량 · 기다림 배율)
 */
(function () {
  'use strict';
  var VER = '1.2.0';
  var ROOT = (function () { var seg = location.pathname.split('/')[1] || ''; return /\.github\.io$/.test(location.hostname) && seg ? '/' + seg + '/' : '/'; })();
  var KEY = 'jmb_mafia_opt';
  var HAS_TTS = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

  /* ---------- 작은 도구 ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsJSON(k, d) { try { var v = JSON.parse(lsGet(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  function clamp(v, a, b, d) { v = parseFloat(v); return isFinite(v) ? Math.min(b, Math.max(a, v)) : d; }
  var toastT = 0;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.className = 'toast on'; clearTimeout(toastT); toastT = setTimeout(function () { t.className = 'toast'; }, 2400); }

  /* ---------- 직업 · 대본 ----------
   * w = [숙련자, 초보자] 기다림(초). 마피아는 몇 명이 서로 눈짓으로 정하므로 더 길게 */
  var ROLES = [
    { id: 'escort', name: '방해꾼', act: '막을 사람', w: [5, 8] },
    { id: 'mafia', name: '마피아', act: '죽일 사람', w: [7, 10] },
    { id: 'killer', name: '연쇄살인마', act: '죽일 사람', w: [5, 8] },
    { id: 'doctor', name: '의사', act: '살릴 사람', w: [5, 8] },
    { id: 'police', name: '경찰', act: '조사할 사람', w: [5, 8] },
    { id: 'lookout', name: '감시자', act: '지켜볼 사람', w: [5, 8] }
  ];
  var BY = {}; ROLES.forEach(function (r) { BY[r.id] = r; });
  var MODES = {
    beginner: '행동까지 한 번씩 말해 주고 기다림이 넉넉해요. 처음 하는 사람이 섞여 있을 때.',
    expert: '직업 이름과 “눈 떠요 / 눈 감아요”만 말해요. 규칙을 아는 사람끼리.'
  };

  /* 세일럼 1692 — 장면 3가지 (진행자가 단계마다 골라 누름). cast = 부르는 직업(진행 표시줄) */
  var SALEM = {
    first: '첫 번째 밤 — 마녀가 검정 고양이를 줄 사람을 지목해요.',
    night: '일반 밤 — 마녀가 제거할 사람, 경찰이 보호할 사람을 지목해요.',
    dawn: '아침 — 지목된 사람에게 30초 자백 시간을 줘요.'
  };
  var SAL_POLICE = { id: 'police', name: '경찰' };

  var OPT = Object.assign({ game: 'mafia', cd: 1, sal: 'first', police: 1, mode: 'beginner', roles: { mafia: 1, doctor: 1, police: 1 }, rate: 1, vol: 1, wmul: 1, voice: '' }, lsJSON(KEY, {}));
  if (OPT.game !== 'salem' && OPT.game !== 'quest') OPT.game = 'mafia';
  OPT.cd = [0, 1, 2].indexOf(+OPT.cd) >= 0 ? +OPT.cd : 1;
  if (!SALEM[OPT.sal]) OPT.sal = 'first';
  if (!MODES[OPT.mode]) OPT.mode = 'beginner';
  if (!OPT.roles || typeof OPT.roles !== 'object') OPT.roles = { mafia: 1, doctor: 1, police: 1 };
  OPT.rate = clamp(OPT.rate, 0.7, 3, 1); OPT.vol = clamp(OPT.vol, 0.2, 1, 1); OPT.wmul = clamp(OPT.wmul, 0.7, 1.5, 1);
  function saveOpt() { lsSet(KEY, JSON.stringify(OPT)); }
  function active() { return ROLES.filter(function (r) { return OPT.roles[r.id]; }); }
  var salem = function () { return OPT.game === 'salem'; };
  /** 지금 게임에서 부르는 직업 목록 (진행 표시줄 · 단계의 ri 가 이 목록의 번호) */
  function cast() {
    if (OPT.game === 'quest') return [{ id: 'evil', name: '악의 세력' }, { id: 'cleric', name: '성직자' }];
    if (!salem()) return active();
    return OPT.sal === 'night' ? [{ id: 'witch', name: '마녀' }].concat(OPT.police ? [SAL_POLICE] : []) : OPT.sal === 'first' ? [{ id: 'witch', name: '마녀' }] : [];
  }

  /** 세일럼 1692 대본 — 진행자(중재자)가 읽는 기본 대사. 초보자용 = 대사 그대로, 숙련자용 = 짧게 */
  function buildSalem() {
    var beg = OPT.mode === 'beginner', s = [];
    function add(t, w, ri, kind, fixed) { s.push({ t: t, w: w, ri: ri, kind: kind, fixed: !!fixed }); }
    if (OPT.sal === 'dawn') {
      add('', 3, -1, 'ready', true);
      add(beg ? '아침이 밝았습니다. 지목된 플레이어는 지금부터 30초 동안 자백할 수 있습니다. 시작하세요.' : '자백, 30초. 시작.', 30, -1, 'morning', true);
      s[s.length - 1].cdMin = 2;   // 남은 시간은 '남은 시간 읽기'가 읽어 줌 — 끔이 아니면 20 · 10초도 읽음
      add(beg ? '시간이 끝났습니다. 재판 카드를 공개하지 않았거나 경찰의 보호를 받지 못한 플레이어는 탈락합니다.' : '시간 끝.', 0, -1, 'morning', true);
      return s;
    }
    add('', 3, -1, 'ready', true);
    add(beg ? '밤입니다. 모든 플레이어는 눈을 감아 주세요.' : '밤입니다.', beg ? 3 : 2, -1, 'night');
    if (OPT.sal === 'first') {
      add(beg ? '마녀분들은 모두 눈을 뜨고, 검정 고양이를 줄 플레이어를 지목하십시오. 자신을 지목해도 됩니다.' : '마녀, 눈 떠요. 검정 고양이.', beg ? 10 : 7, 0, 'open');
      add(beg ? '마녀들은 눈을 감아 주세요.' : '마녀, 눈 감아요.', beg ? 2 : 1, 0, 'close');
      add(beg ? '모두 눈을 떠 주십시오. 아침이 밝았습니다.' : '아침입니다.', 0, -1, 'morning');
    } else {
      add(beg ? '마녀분들은 모두 눈을 뜨고, 제거할 플레이어를 지목하십시오.' : '마녀, 눈 떠요.', beg ? 10 : 7, 0, 'open');
      add(beg ? '마녀들은 눈을 감아 주세요.' : '마녀, 눈 감아요.', beg ? 2 : 1, 0, 'close');
      if (OPT.police) {
        add(beg ? '경찰분은 눈을 뜨고, 보호할 플레이어를 지목하십시오.' : '경찰, 눈 떠요.', beg ? 8 : 5, 1, 'open');
        add(beg ? '경찰은 눈을 감아 주세요.' : '경찰, 눈 감아요.', beg ? 2 : 1, 1, 'close');
      }
      add(beg ? '모두 눈을 떠 주십시오. 아침이 밝았습니다.' : '아침입니다.', 0, -1, 'morning');
    }
    return s;
  }

  /** 퀘스트(감독판) 시작 멘트 — 눈먼 사냥꾼을 뺀 악의 세력이 서로 확인 → 성직자가 첫 원정대장의 진영만 확인. ri 0 = 악의 세력 · 1 = 성직자 */
  function buildQuest() {
    var beg = OPT.mode === 'beginner', s = [];
    function add(t, w, ri, kind) { s.push({ t: t, w: w, ri: ri, kind: kind, fixed: false }); }
    s.push({ t: '', w: 3, fixed: true, ri: -1, kind: 'ready' });
    add(beg ? '모두 눈을 감고 주먹을 앞으로 내밀어 주세요.' : '모두 눈 감고 주먹.', beg ? 3 : 2, -1, 'night');
    add(beg ? '눈먼 사냥꾼을 제외한 악의 세력은 눈을 뜨고 서로를 확인해 주세요.' : '악의 세력, 눈 떠요. 눈먼 사냥꾼은 빼고.', beg ? 8 : 6, 0, 'open');
    add(beg ? '악의 세력은 눈을 감아 주세요.' : '악의 세력, 눈 감아요.', beg ? 2 : 1, 0, 'close');
    add(beg ? '성직자는 눈을 떠 주세요.' : '성직자, 눈 떠요.', 1, 1, 'open');
    add(beg ? '첫 번째 원정대장은 선이라면 엄지를 위로, 악이라면 아래로 향하게 해 주세요. 말썽꾼은 악으로 표시해 주세요.' : '원정대장, 선은 엄지 위, 악은 아래. 말썽꾼은 악.', beg ? 5 : 3, 1, 'act');
    add(beg ? '성직자는 원정대장의 진영을 확인해 주세요.' : '성직자, 확인.', beg ? 4 : 3, 1, 'act');
    add(beg ? '원정대장은 주먹을 다시 쥐어 주세요.' : '원정대장, 주먹.', beg ? 2 : 1, 1, 'act');
    add(beg ? '성직자는 눈을 감아 주세요.' : '성직자, 눈 감아요.', beg ? 2 : 1, 1, 'close');
    add(beg ? '모두 눈을 떠 주세요.' : '모두 눈 떠요.', 0, -1, 'morning');
    return s;
  }

  /** 대본 만들기 — 단계 { t: 읽을 말(없으면 기다리기만), w: 기다림(초), fixed: 배율 안 곱함, ri: 몇 번째 직업(-1 = 직업 아님), kind } */
  function build() {
    if (OPT.game === 'quest') return buildQuest();
    if (salem()) return buildSalem();
    var beg = OPT.mode === 'beginner', s = [], list = active();
    s.push({ t: '', w: 3, fixed: true, ri: -1, kind: 'ready' });
    s.push(beg ? { t: '밤입니다. 모두 눈을 감고 고개를 숙이세요.', w: 3, ri: -1, kind: 'night' } : { t: '밤입니다.', w: 2, ri: -1, kind: 'night' });
    list.forEach(function (r, i) {
      var w = r.w[beg ? 1 : 0];
      if (beg) {
        s.push({ t: r.name + ', 눈을 뜨세요.', w: 1, ri: i, kind: 'open' });
        s.push({ t: r.act + '을 손가락으로 가리키세요.', w: w, ri: i, kind: 'act' });
        s.push({ t: r.name + ', 눈을 감으세요.', w: 2, ri: i, kind: 'close' });
      } else {
        s.push({ t: r.name + ', 눈 떠요.', w: w, ri: i, kind: 'open' });
        s.push({ t: r.name + ', 눈 감아요.', w: 1, ri: i, kind: 'close' });
      }
    });
    s.push({ t: beg ? '아침입니다. 모두 눈을 뜨세요.' : '아침입니다.', w: 0, ri: -1, kind: 'morning' });
    return s;
  }
  function waitMs(st) { return st.w <= 0 ? 0 : Math.max(500, st.w * 1000 * (st.fixed ? 1 : OPT.wmul)); }
  function speakMs(st) { return st.t ? st.t.length * 200 / OPT.rate + 400 : 0; }   // 미리보기 시간 추정용(실제는 목소리마다 다름)

  /* ---------- 목소리 ---------- */
  var VOICES = [];
  function loadVoices() {
    try { VOICES = (speechSynthesis.getVoices() || []).filter(function (v) { return /^ko/i.test(v.lang) || /korean|한국/i.test(v.name); }); } catch (e) { VOICES = []; }
    var h = '<option value="">자동</option>' + VOICES.map(function (v) { return '<option value="' + esc(v.voiceURI) + '">' + esc(v.name) + '</option>'; }).join('');
    $('voice').innerHTML = h; $('voice').value = OPT.voice;
    if ($('voice').value !== OPT.voice) { OPT.voice = ''; $('voice').value = ''; }
    var n = $('voiceNote');
    if (!HAS_TTS) { n.textContent = '이 브라우저는 음성 읽기를 지원하지 않아요. 크롬 · 엣지 · 사파리에서 열어 주세요.'; n.hidden = false; }
    else if (!VOICES.length) { n.textContent = '한국어 목소리를 찾지 못했어요. 기기 설정 > 언어 > 음성 출력(텍스트 읽기)에서 한국어를 설치한 뒤 다시 열어 주세요. 그대로도 시도는 해요.'; n.hidden = false; }
    else n.hidden = true;
  }
  function pickVoice() { for (var i = 0; i < VOICES.length; i++) if (VOICES[i].voiceURI === OPT.voice) return VOICES[i]; return VOICES[0] || null; }

  /* ---------- 설정 화면 ---------- */
  function renderSetup() {
    document.querySelectorAll('#segMode button').forEach(function (b) { var on = b.dataset.mode === OPT.mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    $('modeHint').textContent = MODES[OPT.mode];
    var sl = salem();
    document.querySelectorAll('#segGame button').forEach(function (b) { var on = b.dataset.game === OPT.game; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    document.querySelectorAll('#segSalem button').forEach(function (b) { var on = b.dataset.sal === OPT.sal; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    $('salemCard').hidden = !sl; $('salHint').textContent = SALEM[OPT.sal];
    $('roleCard').hidden = OPT.game === 'quest' || (sl && OPT.sal !== 'night');
    var chips = sl ? [{ id: 'police', name: SAL_POLICE.name + '(보안관)', on: !!OPT.police }] : ROLES.map(function (r) { return { id: r.id, name: r.name, on: !!OPT.roles[r.id] }; });
    $('roleChips').innerHTML = chips.map(function (r) { return '<button type="button" class="chip' + (r.on ? ' on' : '') + '" data-role="' + r.id + '" aria-pressed="' + r.on + '">' + (r.on ? '✔ ' : '') + esc(r.name) + '</button>'; }).join('');
    $('rate').value = OPT.rate; $('rateV').textContent = '×' + OPT.rate.toFixed(2).replace(/0$/, '');
    $('vol').value = OPT.vol; $('volV').textContent = Math.round(OPT.vol * 100) + '%';
    $('cd').value = String(OPT.cd);
    $('wmul').value = String(OPT.wmul);
    if ($('wmul').value !== String(OPT.wmul)) { OPT.wmul = 1; $('wmul').value = '1'; }
    var s = build(), total = 0;
    $('preview').innerHTML = s.filter(function (st) { return st.t; }).map(function (st) {
      var w = waitMs(st);
      return '<li><span class="t">' + esc(st.t) + '</span><span class="w">' + (w ? '⏱ ' + (Math.round(w / 100) / 10) + '초' : '') + '</span></li>';
    }).join('');
    s.forEach(function (st) { total += waitMs(st) + speakMs(st); });
    $('est').textContent = '· 한 번에 약 ' + Math.round(total / 1000) + '초';
    $('scriptHint').textContent = OPT.game === 'quest' ? '감독판 시작 멘트(9인 기준). 눈먼 사냥꾼은 악의 세력을 모르고 악의 세력도 눈먼 사냥꾼을 몰라요 · 성직자는 첫 원정대장의 진영만 확인해요 · 말썽꾼은 선이지만 악으로 표시해요.'
      : sl ? (OPT.sal === 'first' ? '아침이 되면 검정 고양이 카드를 지목된 플레이어 앞에 놓으세요.' : OPT.sal === 'night' ? '아침이 되면 [아침 · 자백] 장면으로 이어 가세요.' : '자백 시간 30초는 기다리는 시간 설정과 상관없이 고정이에요.')
      : OPT.mode === 'beginner' ? '경찰의 조사 결과는 진행자가 엄지(마피아 = 올림, 아님 = 내림)로 알려 주세요.' : '';
    $('btnStart').disabled = OPT.game === 'mafia' && !s.some(function (st) { return st.ri >= 0; });
  }

  $('segGame').addEventListener('click', function (e) { var b = e.target.closest('button[data-game]'); if (!b) return; OPT.game = b.dataset.game; saveOpt(); renderSetup(); });
  $('segSalem').addEventListener('click', function (e) { var b = e.target.closest('button[data-sal]'); if (!b) return; OPT.sal = b.dataset.sal; saveOpt(); renderSetup(); });
  $('segMode').addEventListener('click', function (e) { var b = e.target.closest('button[data-mode]'); if (!b) return; OPT.mode = b.dataset.mode; saveOpt(); renderSetup(); });
  $('roleChips').addEventListener('click', function (e) { var b = e.target.closest('button[data-role]'); if (!b) return; var id = b.dataset.role; if (salem()) OPT.police = OPT.police ? 0 : 1; else if (OPT.roles[id]) delete OPT.roles[id]; else OPT.roles[id] = 1; saveOpt(); renderSetup(); });
  $('cd').addEventListener('change', function () { OPT.cd = +this.value; saveOpt(); renderSetup(); });
  $('rate').addEventListener('input', function () { OPT.rate = clamp(this.value, 0.7, 3, 1); saveOpt(); renderSetup(); });
  $('vol').addEventListener('input', function () { OPT.vol = clamp(this.value, 0.2, 1, 1); saveOpt(); renderSetup(); });
  $('wmul').addEventListener('change', function () { OPT.wmul = clamp(this.value, 0.7, 1.5, 1); saveOpt(); renderSetup(); });
  $('voice').addEventListener('change', function () { OPT.voice = this.value; saveOpt(); });
  $('btnTest').addEventListener('click', function () { say(OPT.game === 'quest' ? '성직자, 눈 떠요.' : salem() ? '마녀, 눈 떠요.' : '마피아, 눈 떠요.', function () {}); if (!HAS_TTS) toast('음성을 지원하지 않아요'); });
  $('back').addEventListener('click', function () { stopAll(); location.href = ROOT; });

  /* ---------- 말하기 ----------
   * tok: 일시정지 · 건너뛰기 · 끝내기를 하면 올려서, 취소된 말이 끝났다는 알림(onend/onerror)이 다음 단계를 건드리지 않게 함 */
  var R = { steps: [], i: -1, phase: '', tok: 0, tm: 0, fb: 0, tick: 0, until: 0, total: 0, left: 0, paused: false, run: false, lock: null };

  function say(text, done) {
    var my = ++R.tok, fin = false;
    function end() { if (fin || my !== R.tok) return; fin = true; clearTimeout(R.fb); done(); }
    clearTimeout(R.fb);
    if (!HAS_TTS || !text) { R.fb = setTimeout(end, text ? text.length * 280 / OPT.rate + 500 : 0); return; }
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text), v = pickVoice();
      u.lang = 'ko-KR'; if (v) u.voice = v; u.rate = OPT.rate; u.volume = OPT.vol;
      u.onend = end; u.onerror = end;
      R.u = u;   // 일부 브라우저가 끝나기 전에 객체를 치워 onend 가 안 오는 것을 막음
      speechSynthesis.speak(u);
    } catch (e) {}
    R.fb = setTimeout(end, text.length * 280 / OPT.rate + 3500);   // onend 가 안 와도 진행
  }
  /** 남은 시간 읽기 — 기다림 중 남은 초가 표시한 값이 될 때 숫자를 읽음. 설정 1 = 5 · 4 · 3 · 2 · 1, 2 = 20 · 10 + 5 · 4 · 3 · 2 · 1 (단계에 cdMin 이 있으면 끔이 아닌 한 2 이상) */
  var CD_WORD = ['', '하나', '둘', '셋', '넷', '다섯'];
  function cdClear() { (R.cdT || []).forEach(clearTimeout); R.cdT = []; }
  function cdSchedule(ms, st) {
    cdClear();
    var mode = OPT.cd ? Math.max(OPT.cd, (st && st.cdMin) || 0) : 0;
    if (!mode || !st || st.kind === 'ready' || ms < 6000) return;   // 준비 구간 · 짧은 기다림(5 · 4 · 3 · 2 · 1 이 다 안 들어가는)은 읽지 않음
    var marks = mode === 2 ? [20, 10, 5, 4, 3, 2, 1] : [5, 4, 3, 2, 1];
    marks.forEach(function (m) {
      if (m * 1000 >= ms) return;   // 기다림이 그보다 짧으면 읽지 않음 (시작 직후 겹쳐 읽는 것 방지)
      R.cdT.push(setTimeout(function () { if (R.run && !R.paused && R.phase === 'wait') say(m <= 5 ? CD_WORD[m] : m + '초 남았습니다', function () {}); }, ms - m * 1000));
    });
  }
  function silence() { cdClear(); R.tok++; clearTimeout(R.fb); clearTimeout(R.tm); try { if (HAS_TTS) speechSynthesis.cancel(); } catch (e) {} }

  /* ---------- 진행 ---------- */
  function wake(on) {
    try {
      if (on && navigator.wakeLock && !R.lock) navigator.wakeLock.request('screen').then(function (l) { R.lock = l; l.addEventListener('release', function () { R.lock = null; }); }, function () {});
      else if (!on && R.lock) { R.lock.release(); R.lock = null; }
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && R.run && !R.paused) wake(true); });

  function view(name) { $('setup').hidden = name !== 'setup'; $('run').hidden = name !== 'run'; window.scrollTo(0, 0); }

  function roleBar(cur) {
    var list = cast();
    $('runRoles').innerHTML = list.map(function (r, i) { var c = cur < 0 ? '' : i < cur ? ' done' : i === cur ? ' now' : ''; return '<span class="' + c.trim() + '">' + esc(r.name) + '</span>'; }).join('');
  }
  function show(st) {
    var title = st.kind === 'ready' ? '곧 시작해요' : st.kind === 'night' ? '🌙 밤' : st.kind === 'morning' ? '☀️ 아침' : (cast()[st.ri] || {}).name || '';
    $('runRole').textContent = title;
    $('runText').textContent = st.t || '눈을 감고 고개를 숙여 주세요';
    $('runCount').textContent = ''; $('runFill').style.width = '0';
    roleBar(st.ri);
  }
  function tickStart() {
    clearInterval(R.tick);
    R.tick = setInterval(function () {
      if (R.phase !== 'wait' || R.paused) return;
      var left = Math.max(0, R.until - Date.now());
      $('runCount').textContent = left > 0 ? Math.ceil(left / 1000) + '초' : '';
      $('runFill').style.width = (R.total ? (1 - left / R.total) * 100 : 0) + '%';
    }, 100);
  }

  function step() {
    if (!R.run || R.paused) return;
    var st = R.steps[R.i];
    if (!st) return finish();
    show(st);
    R.phase = 'speak';
    $('runCount').textContent = st.t ? '🔊' : '';
    say(st.t, function () { hold(waitMs(st)); });
  }
  function hold(ms) {
    if (!R.run || R.paused) return;
    if (R.i >= R.steps.length - 1 && ms <= 0) return finish();   // 마지막 말(아침)이 끝나면 바로 끝
    R.phase = 'wait'; R.total = ms; R.until = Date.now() + ms;
    clearTimeout(R.tm); R.tm = setTimeout(advance, ms);
    cdSchedule(ms, R.steps[R.i]);
  }
  function advance() {
    if (!R.run || R.paused) return;
    R.i++;
    if (R.i >= R.steps.length) finish(); else step();
  }
  function finish() {
    silence(); clearInterval(R.tick);
    R.run = false; R.phase = 'done'; wake(false);
    $('runRole').textContent = '☀️ 아침';
    $('runText').textContent = salem() && OPT.sal === 'dawn' ? '자백 시간이 끝났어요' : '밤이 끝났어요';
    $('runCount').textContent = ''; $('runFill').style.width = '100%';
    roleBar(99);
    $('ctlRun').hidden = true; $('ctlDone').hidden = false;
  }
  function begin() {
    if ($('btnStart').disabled) return;
    silence();
    R.steps = build(); R.i = 0; R.paused = false; R.run = true;
    // 아이폰 등은 사용자가 누른 순간에 한 번 말을 시켜 둬야 그 뒤 타이머로 시작하는 말도 나옴
    try { if (HAS_TTS) { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch (e) {}
    $('ctlRun').hidden = false; $('ctlDone').hidden = true;
    $('btnPause').textContent = '⏸ 일시정지';
    view('run'); wake(true); tickStart(); step();
  }
  function stopAll() { silence(); clearInterval(R.tick); R.run = false; R.paused = false; wake(false); }

  $('btnStart').addEventListener('click', begin);
  $('btnAgain').addEventListener('click', begin);
  $('btnSetup').addEventListener('click', function () { stopAll(); view('setup'); });
  $('btnStop').addEventListener('click', function () { stopAll(); view('setup'); });
  $('btnNext').addEventListener('click', function () {
    if (!R.run) return;
    silence(); R.paused = false; $('btnPause').textContent = '⏸ 일시정지';
    advance();
  });
  $('btnPause').addEventListener('click', function () {
    if (!R.run) return;
    if (!R.paused) {
      R.paused = true;
      R.left = R.phase === 'wait' ? Math.max(0, R.until - Date.now()) : -1;   // 말하는 중이면 그 줄을 처음부터 다시
      silence();
      $('btnPause').textContent = '▶ 계속';
      $('runCount').textContent = '⏸';
    } else {
      R.paused = false; $('btnPause').textContent = '⏸ 일시정지';
      if (R.left >= 0) { R.total = Math.max(R.total, R.left); R.phase = 'wait'; R.until = Date.now() + R.left; R.tm = setTimeout(advance, R.left); cdSchedule(R.left, R.steps[R.i]); }
      else step();
    }
  });

  /* ---------- 시작 ---------- */
  (function init() {
    if (/[?&]reset\b/.test(location.search)) history.replaceState(null, '', location.pathname);
    if (HAS_TTS) { try { speechSynthesis.onvoiceschanged = loadVoices; } catch (e) {} }
    $('gver').textContent = '화면 v' + VER;   // 맨 아래 버전 표시 — 새 파일이 적용됐는지 한눈에
    loadVoices(); renderSetup();
    window.JMB_MAFIA = { ver: VER };
  })();
})();
