/* 잠만보 사운드보드 v1.0.0 — 화면 (소리는 synth.js)
 * - 서버·DB 없음. 설정은 localStorage(jmb_snd_opt), 내 파일은 이 기기 IndexedDB(jmb_sound) 에만
 * - 터치: 손을 뗄 때 울림 (목록을 쓸어 넘기다 잘못 울리지 않게) · 마우스·키보드: 누르는 즉시
 */
(function () {
  'use strict';
  var S = window.JMB_SND;
  if (!S) return;
  var $ = function (id) { return document.getElementById(id); };
  var VER = '1.0.0';
  var FX = window.JMB_FX || null;
  var KEYS = '1234567890QWERTYUIOPASDFGHJKLZXCVBNM';

  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var OPT = Object.assign({ tab: 'bgm', master: 90, bgm: 70, sfx: 90, duck: true, hap: true, wake: true, lv: 2, last: '' }, lsGet('jmb_snd_opt', {}));
  function save() { lsSet('jmb_snd_opt', OPT); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var toastT = 0;
  function toast(t) { var el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('on'); }, 2200); }
  function haptic() { if (OPT.hap && FX) FX.haptic('tap'); }

  // 처음 소리를 낼 때 준비 + 저장한 음량
  var ready = false;
  function ensure() {
    if (!S.init()) { toast('이 브라우저는 소리 기능을 지원하지 않아요'); return false; }
    if (!ready) { ready = true; S.duckOn = OPT.duck; S.vol('master', OPT.master / 100); S.vol('bgm', OPT.bgm / 100); S.vol('sfx', OPT.sfx / 100); S.bgm.level(OPT.lv); S.onLoopEnd = function () { paintPads(); updDock(); }; }
    return true;
  }

  /* ---------- 탭 ---------- */
  var TABS = ['bgm', 'contest', 'mystery', 'mine'];
  function setTab(t) {
    if (TABS.indexOf(t) < 0) t = 'bgm';
    OPT.tab = t; save();
    $('tabs').querySelectorAll('button').forEach(function (b) { var on = b.getAttribute('data-t') === t; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
    document.querySelectorAll('.panel').forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-p') === t); });
    if (t === 'mine') loadMine();
    paintKeys();
  }
  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setTab(b.getAttribute('data-t')); });

  /* ---------- 배경음악 ---------- */
  var TRACKS = S.bgm.tracks();
  $('bgmList').innerHTML = [['contest', '🏆 보드게임 대회'], ['mystery', '🕯️ 머더미스터리 · 할로윈']].map(function (g) {
    return '<h2 class="grp">' + g[1] + '</h2><div class="bgms ' + g[0] + '">' + TRACKS.filter(function (t) { return t.group === g[0]; }).map(function (t) {
      return '<button type="button" class="bg" data-id="' + t.id + '"><span class="key"></span><i>' + t.emoji + '</i><b>' + esc(t.name) + '</b><small>' + esc(t.desc) + '</small><span class="eq"><span></span><span></span><span></span></span></button>';
    }).join('') + '</div>';
  }).join('');
  var curFile = null;   // 내 파일을 배경음악으로 틀고 있으면 그 기록
  function playBgm(id) {
    if (!ensure()) return;
    if (S.bgm.cur() === id) { S.bgm.stop(1.2); }
    else { S.bgm.play(id); OPT.last = id; save(); curFile = null; }
    haptic(); paintBgm(); updDock();
  }
  function paintBgm() {
    var cur = S.bgm.cur();
    $('bgmList').querySelectorAll('.bg').forEach(function (b) { var on = b.getAttribute('data-id') === cur; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    $('minePads').querySelectorAll('.pad').forEach(function (p) { if (p.getAttribute('data-loop')) p.classList.toggle('on', cur === '__file' && curFile && curFile.id === p.getAttribute('data-id')); });
  }

  /* ---------- 효과음 버튼 ---------- */
  function padHtml(x, cat) {
    return '<button type="button" class="pad" data-id="' + x[0] + '"' + (x[3] ? ' data-loop="1"' : '') + ' aria-label="' + esc(x[1]) + (x[3] ? ' (켜기/끄기)' : '') + '">' +
      '<span class="key"></span>' + (x[3] ? '<span class="lp" aria-hidden="true">↻</span>' : '') + '<i>' + x[2] + '</i><b>' + esc(x[1]) + '</b><span class="pr"></span></button>';
  }
  ['contest', 'mystery'].forEach(function (cat) {
    document.querySelector('.pads[data-cat="' + cat + '"]').innerHTML = S.SFX[cat].map(function (x) { return padHtml(x, cat); }).join('');
  });
  var timers = new WeakMap();
  function flash(pad, dur) {
    pad.classList.remove('play'); void pad.offsetWidth;
    pad.style.setProperty('--d', Math.max(0.15, dur) + 's'); pad.classList.add('play');
    clearTimeout(timers.get(pad)); timers.set(pad, setTimeout(function () { pad.classList.remove('play'); }, Math.max(150, dur * 1000)));
  }
  function fire(pad) {
    if (!ensure()) return;
    var id = pad.getAttribute('data-id'), cat = pad.parentNode.getAttribute('data-cat');
    haptic();
    if (cat === 'mine') { fireMine(pad, id); return; }
    if (pad.getAttribute('data-loop')) {
      var on = S.toggle(id); pad.classList.toggle('on', on);
      if (on && id === 'roll') toast('🥁 한 번 더 누르면 짠!');
      updDock(); return;
    }
    flash(pad, S.sfx(id));
  }
  function paintPads() {
    var on = S.loopsOn();
    document.querySelectorAll('.pads:not([data-cat="mine"]) .pad[data-loop]').forEach(function (p) { p.classList.toggle('on', on.indexOf(p.getAttribute('data-id')) >= 0); });
  }
  // 누르기: 마우스·펜은 즉시, 터치는 손을 뗄 때 (쓸어 넘기면 취소)
  function bindPress(root, sel, fn) {
    var st = null;
    root.addEventListener('pointerdown', function (e) {
      var el = e.target.closest(sel); if (!el || e.target.closest('.more') || e.button > 0) return;
      if (e.pointerType === 'touch') { st = { el: el, x: e.clientX, y: e.clientY }; el.classList.add('hit'); }
      else { e.preventDefault(); fn(el); }
    });
    root.addEventListener('pointerup', function (e) {
      if (!st) return;
      var el = st.el, ok = e.target.closest(sel) === el && Math.abs(e.clientX - st.x) < 14 && Math.abs(e.clientY - st.y) < 14;
      el.classList.remove('hit'); st = null;
      if (ok) fn(el);
    });
    root.addEventListener('pointercancel', function () { if (st) st.el.classList.remove('hit'); st = null; });
    root.addEventListener('click', function (e) { var el = e.target.closest(sel); if (el && e.detail === 0 && !e.target.closest('.more')) fn(el); });   // 키보드 Enter·Space
  }
  document.querySelectorAll('.pads').forEach(function (g) { bindPress(g, '.pad', fire); });
  bindPress($('bgmList'), '.bg', function (b) { playBgm(b.getAttribute('data-id')); });

  // 글자 키 표시 (지금 탭의 버튼 순서대로)
  function panelItems() { var p = document.querySelector('.panel.on'); return p ? p.querySelectorAll('.pad:not(.add), .bg') : []; }
  function paintKeys() {
    document.querySelectorAll('.pad .key, .bg .key').forEach(function (k) { k.textContent = ''; });
    var items = panelItems();
    for (var i = 0; i < items.length && i < KEYS.length; i++) { var k = items[i].querySelector('.key'); if (k) k.textContent = KEYS[i]; }
  }

  /* ---------- 지금 재생 (아래) ---------- */
  var vizOn = false;
  function updDock() {
    var cur = S.bgm.cur(), loops = S.loopsOn(), dock = $('dock');
    var show = !!cur || loops.length > 0;
    dock.hidden = !show;
    $('np').hidden = !cur;
    if (cur) {
      var tr = TRACKS.filter(function (t) { return t.id === cur; })[0];
      $('npName').textContent = cur === '__file' ? (curFile ? curFile.emoji + ' ' + curFile.name : '내 파일') : tr.emoji + ' ' + tr.name;
      $('npSub').textContent = cur === '__file' ? '내 소리 · 반복' : '긴장도 ' + S.bgm.level() + ' · 배경음악';
      $('lvSeg').hidden = cur === '__file';
      $('lvSeg').querySelectorAll('button').forEach(function (b) { var on = +b.getAttribute('data-v') === S.bgm.level(); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); b.setAttribute('role', 'radio'); });
    }
    var names = {}; ['contest', 'mystery'].forEach(function (c) { S.SFX[c].forEach(function (x) { names[x[0]] = x; }); });
    $('loops').innerHTML = loops.map(function (id) { var x = names[id]; return '<button type="button" data-id="' + id + '" aria-label="' + esc(x[1]) + ' 끄기">' + x[2] + ' ' + esc(x[1]) + ' <span>✕</span></button>'; }).join('');
    $('btnStopAll').classList.toggle('live', show);
    // 켜 둔 소리(↻)가 있는 탭에 빨간 점
    [['contest', '🏆 대회'], ['mystery', '🕯️ 미스터리·할로윈']].forEach(function (c) {
      var has = S.SFX[c[0]].some(function (x) { return loops.indexOf(x[0]) >= 0; });
      $('tabs').querySelector('[data-t="' + c[0] + '"]').innerHTML = c[1] + (has ? '<span class="dot" aria-label="켜진 소리 있음"></span>' : '');
    });
    paintBgm();
    requestAnimationFrame(function () { document.documentElement.style.setProperty('--dock-h', show ? dock.offsetHeight + 'px' : '0px'); });
    setWake(show && OPT.wake);
    if (show && cur && !vizOn) { vizOn = true; viz(); }
  }
  $('loops').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; S.stopLoop(b.getAttribute('data-id')); paintPads(); updDock(); });
  $('lvSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    OPT.lv = S.bgm.level(+b.getAttribute('data-v')); save(); haptic(); updDock();
  });
  $('npStop').onclick = function () { S.bgm.stop(0.8); updDock(); };
  $('npFade').onclick = function () { var c = S.bgm.cur(); if (!c) return; S.bgm.stop(5); toast('5초 동안 천천히 줄여요'); updDock(); };
  $('btnStopAll').onclick = stopAll;
  function stopAll() { if (!ready) return; S.stopAll(); paintPads(); updDock(); document.querySelectorAll('.pad.play').forEach(function (p) { p.classList.remove('play'); }); toast('⏹ 모두 멈췄어요'); }

  // 소리 모양 (배경음악이 있을 때만)
  function viz() {
    var cv = $('viz'), c = cv.getContext('2d'), an = S.analyser(), data = an ? new Uint8Array(an.frequencyBinCount) : null;
    (function frame() {
      if ($('np').hidden || $('dock').hidden || !an) { vizOn = false; return; }
      requestAnimationFrame(frame);
      var w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
      an.getByteFrequencyData(data);
      var n = 48, bw = w / n, g = c.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, 'rgba(255,169,77,.0)'); g.addColorStop(1, 'rgba(255,169,77,.75)');
      c.fillStyle = g;
      for (var i = 0; i < n; i++) {
        var v = data[Math.floor(Math.pow(i / n, 1.6) * data.length * 0.7)] / 255, bh = Math.max(1, v * v * h);
        c.fillRect(i * bw + 1, h - bh, bw - 2, bh);
      }
    })();
  }

  /* ---------- 화면 꺼짐 방지 ---------- */
  var wake = { lock: null, want: false };
  function setWake(on) {
    wake.want = on;
    try {
      if (on && navigator.wakeLock && !wake.lock) navigator.wakeLock.request('screen').then(function (l) { wake.lock = l; l.addEventListener('release', function () { wake.lock = null; }); }, function () {});
      if (!on && wake.lock) { wake.lock.release(); wake.lock = null; }
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { if (wake.want) setWake(true); if (ready) S.init(); }
  });

  /* ---------- 설정 ---------- */
  function openSheet(id) { $(id).hidden = false; }
  function closeSheet(id) { $(id).hidden = true; }
  ['setBg', 'editBg'].forEach(function (id) { $(id).addEventListener('click', function (e) { if (e.target === this) closeSheet(id); }); });
  $('btnSet').onclick = function () {
    [['vMaster', 'master'], ['vBgm', 'bgm'], ['vSfx', 'sfx']].forEach(function (p) { var el = $(p[0]); el.value = OPT[p[1]]; el.nextElementSibling.textContent = OPT[p[1]]; });
    $('tDuck').checked = OPT.duck; $('tHap').checked = OPT.hap; $('tWake').checked = OPT.wake;
    $('tHap').closest('.tog').hidden = !FX;
    openSheet('setBg');
  };
  [['vMaster', 'master'], ['vBgm', 'bgm'], ['vSfx', 'sfx']].forEach(function (p) {
    $(p[0]).addEventListener('input', function () { OPT[p[1]] = +this.value; this.nextElementSibling.textContent = this.value; if (ensure()) S.vol(p[1], OPT[p[1]] / 100); save(); });
    $(p[0]).addEventListener('change', function () { if (p[1] === 'sfx' && ready) S.sfx('pop'); });
  });
  $('tDuck').onchange = function () { OPT.duck = this.checked; S.duckOn = OPT.duck; save(); };
  $('tHap').onchange = function () { OPT.hap = this.checked; save(); };
  $('tWake').onchange = function () { OPT.wake = this.checked; save(); updDock(); };
  $('setOk').onclick = function () { closeSheet('setBg'); };

  /* =====================================================================
   * 내 소리 — 이 기기 IndexedDB 에만 (서버로 보내지 않음)
   * ===================================================================== */
  var DB = (function () {
    var p = null;
    function open() {
      if (p) return p;
      p = new Promise(function (ok, no) {
        if (!window.indexedDB) { no(new Error('no idb')); return; }
        var r = indexedDB.open('jmb_sound', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('files', { keyPath: 'id' }); };
        r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); };
      });
      return p;
    }
    function tx(mode, fn) { return open().then(function (db) { return new Promise(function (ok, no) { var t = db.transaction('files', mode), st = t.objectStore('files'), res = fn(st); t.oncomplete = function () { ok(res && res.result); }; t.onerror = function () { no(t.error); }; }); }); }
    return {
      all: function () { return tx('readonly', function (st) { return st.getAll(); }); },
      put: function (rec) { return tx('readwrite', function (st) { st.put(rec); }); },
      del: function (id) { return tx('readwrite', function (st) { st.delete(id); }); }
    };
  })();
  var MINE = [], BUF = {}, MAXMB = 40;
  var EMO = ['🔊', '🎵', '🎶', '🎤', '📢', '🚨', '🔔', '🎉', '👏', '😱', '👻', '🔓', '🗝️', '💀', '🧩', '🏆', '⏰', '💡'];
  function loadMine() {
    DB.all().then(function (list) { MINE = (list || []).sort(function (a, b) { return a.added - b.added; }); renderMine(); }, function () { $('mineHint').textContent = '이 브라우저(개인정보 보호 모드 등)에서는 파일을 저장할 수 없어요'; });
  }
  function renderMine() {
    $('minePads').innerHTML = MINE.map(function (r) {
      return '<button type="button" class="pad" data-id="' + r.id + '"' + (r.loop ? ' data-loop="1"' : '') + ' aria-label="' + esc(r.name) + '">' +
        '<span class="key"></span><span class="more" role="button" tabindex="0" aria-label="' + esc(r.name) + ' 편집" data-edit="' + r.id + '">⋯</span>' +
        '<i>' + r.emoji + '</i><b>' + esc(r.name) + '</b><span class="pr"></span></button>';
    }).join('');
    var mb = MINE.reduce(function (s, r) { return s + (r.size || 0); }, 0) / 1048576;
    $('mineHint').textContent = MINE.length ? MINE.length + '개 · ' + mb.toFixed(1) + 'MB · 버튼의 ⋯ 로 이름·아이콘·반복 재생을 바꿔요' : '아직 넣은 파일이 없어요';
    paintKeys(); paintBgm();
  }
  $('fileIn').addEventListener('change', function () {
    var files = Array.prototype.slice.call(this.files || []); this.value = '';
    if (!files.length) return;
    var added = 0, skipped = [];
    Promise.all(files.map(function (f) {
      if (f.size > MAXMB * 1048576) { skipped.push(f.name + ' (' + MAXMB + 'MB 넘음)'); return null; }
      if (f.type && !/^audio\//.test(f.type) && !/\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(f.name)) { skipped.push(f.name); return null; }
      var rec = { id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: f.name.replace(/\.[^.]+$/, '').slice(0, 20), emoji: '🔊', loop: f.size > 2.5 * 1048576, type: f.type, size: f.size, blob: f, added: Date.now() };
      return DB.put(rec).then(function () { added++; });
    })).then(function () {
      loadMine();
      toast(added ? added + '개 넣었어요' + (skipped.length ? ' · 못 넣음: ' + skipped.join(', ') : '') : '넣지 못했어요: ' + skipped.join(', '));
    }, function () { toast('저장 공간이 부족하거나 저장할 수 없어요'); });
  });
  function getBuf(rec) {
    if (BUF[rec.id]) return Promise.resolve(BUF[rec.id]);
    return (rec.blob.arrayBuffer ? rec.blob.arrayBuffer() : new Response(rec.blob).arrayBuffer()).then(S.decode).then(function (b) { BUF[rec.id] = b; return b; });
  }
  function fireMine(pad, id) {
    var rec = MINE.filter(function (r) { return r.id === id; })[0]; if (!rec) return;
    if (rec.loop && S.bgm.cur() === '__file' && curFile && curFile.id === id) { S.bgm.stop(1.2); curFile = null; updDock(); return; }
    getBuf(rec).then(function (buf) {
      if (rec.loop) { S.bgm.playBuffer(buf); curFile = rec; updDock(); }
      else flash(pad, S.playBuffer(buf));
    }, function () { toast('이 파일은 재생할 수 없어요 (형식 확인)'); });
  }
  // 편집
  var editing = null;
  function openEdit(id) {
    editing = MINE.filter(function (r) { return r.id === id; })[0]; if (!editing) return;
    $('eName').value = editing.name; $('eLoop').checked = !!editing.loop;
    $('eEmoji').innerHTML = EMO.map(function (e) { return '<button type="button" class="' + (e === editing.emoji ? 'on' : '') + '" data-e="' + e + '">' + e + '</button>'; }).join('');
    $('eInfo').textContent = (editing.size / 1048576).toFixed(1) + 'MB' + (BUF[id] ? ' · ' + BUF[id].duration.toFixed(1) + '초' : '');
    openSheet('editBg');
  }
  $('minePads').addEventListener('click', function (e) { var m = e.target.closest('[data-edit]'); if (m) { e.stopPropagation(); openEdit(m.getAttribute('data-edit')); } });
  $('minePads').addEventListener('keydown', function (e) { var m = e.target.closest('[data-edit]'); if (m && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); openEdit(m.getAttribute('data-edit')); } });
  $('eEmoji').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; $('eEmoji').querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); });
  $('eTest').onclick = function () { if (!editing || !ensure()) return; getBuf(editing).then(function (b) { S.playBuffer(b); $('eInfo').textContent = (editing.size / 1048576).toFixed(1) + 'MB · ' + b.duration.toFixed(1) + '초'; }, function () { toast('이 파일은 재생할 수 없어요'); }); };
  $('eOk').onclick = function () {
    if (!editing) return;
    var on = $('eEmoji').querySelector('.on');
    editing.name = ($('eName').value.trim() || editing.name).slice(0, 20); editing.loop = $('eLoop').checked; if (on) editing.emoji = on.getAttribute('data-e');
    DB.put(editing).then(function () { closeSheet('editBg'); loadMine(); });
  };
  $('eDel').onclick = function () {
    if (!editing || !confirm('"' + editing.name + '" 을(를) 지울까요?')) return;
    if (curFile && curFile.id === editing.id) { S.bgm.stop(0.5); curFile = null; updDock(); }
    delete BUF[editing.id];
    DB.del(editing.id).then(function () { closeSheet('editBg'); loadMine(); toast('지웠어요'); });
  };

  /* ---------- 키보드 ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (!$('setBg').hidden || !$('editBg').hidden) { if (e.key === 'Escape') { closeSheet('setBg'); closeSheet('editBg'); } return; }
    if (e.key === 'Escape') { e.preventDefault(); stopAll(); return; }
    if (e.key === ' ') {
      if (e.target.closest && e.target.closest('button')) return;
      e.preventDefault();
      if (S.bgm.cur()) { S.bgm.stop(1); updDock(); } else if (OPT.last) playBgm(OPT.last);
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { var i = TABS.indexOf(OPT.tab) + (e.key === 'ArrowRight' ? 1 : -1); setTab(TABS[(i + TABS.length) % TABS.length]); e.preventDefault(); return; }
    var k = KEYS.indexOf(e.key.toUpperCase());
    if (k < 0) return;
    var items = panelItems(); if (!items[k]) return;
    e.preventDefault();
    var el = items[k];
    if (el.classList.contains('bg')) playBgm(el.getAttribute('data-id')); else { el.classList.add('hit'); setTimeout(function () { el.classList.remove('hit'); }, 90); fire(el); }
  });

  /* ---------- 시작 ---------- */
  if (/[?&]reset\b/.test(location.search)) history.replaceState(null, '', location.pathname);
  setTab(OPT.tab);
  window.JMB_SOUND = { ver: VER };
})();
