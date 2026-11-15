/* 보드게임 확대 퀴즈 app.js — 사진의 한 부분(ROI)만 보고 어떤 게임인지 맞히기 (서버 없음, 문제는 data.js · 그림은 img/)
 * - 한 문제 = 사진 한 장 + 확대 구역(roi). 틀릴 때마다 구역이 넓어지고(1 → 2 → 3 단계) 마지막은 사진 전체
 * - 답은 이름을 쳐서 고름 (초성 · 입력 중인 글자 · 영어 이름 · 띄어쓰기 무시). 이미 틀린 이름은 다시 안 나옴
 * - 점수: 1단계 100 · 2단계 70 · 3단계 40 · 전체 20 · 포기/실패 0. 최고점은 이 기기에 저장(jmb_quiz_best)
 * - 화면: S.view(home · play · result) 를 render() 가 그림 */
(function () {
  'use strict';
  var DATA = window.JMB_QUIZ_DATA;
  if (!DATA) return;
  var VER = '1.0.0';
  var $ = function (id) { return document.getElementById(id); };
  var PTS = [100, 70, 40, 20], SCALE = [1, 2.2, 4.4], LABEL = ['1단계 · 아주 좁게', '2단계 · 조금 넓게', '3단계 · 넓게', '마지막 · 사진 전체'];
  var KEY = { best: 'jmb_quiz_best', opt: 'jmb_quiz_opt' };
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(t) { var el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.remove('on'); }, 1800); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ---------- 한글 검색 (메인 앱 Index.html 의 koMatch 와 같은 방식) ---------- */
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function hParts(c) { var k = c.charCodeAt(0) - 0xAC00; return k < 0 || k > 11171 ? null : { cho: Math.floor(k / 588), jung: Math.floor(k % 588 / 28), jong: k % 28 }; }
  function chMatch(qc, nc, last) {
    if (qc === nc) return true;
    var i = CHO.indexOf(qc); if (i >= 0) { var p = hParts(nc); return !!p && p.cho === i; }
    if (last) { var a = hParts(qc), b = hParts(nc); if (a && b && a.cho === b.cho && a.jung === b.jung && a.jong === 0) return true; }
    return false;
  }
  function match1(name, q) {
    if (name.toLowerCase().indexOf(q.toLowerCase()) >= 0) return true;
    for (var i = 0; i + q.length <= name.length; i++) {
      var ok = true;
      for (var j = 0; j < q.length; j++) if (!chMatch(q[j], name[i + j], j === q.length - 1)) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  }
  function koMatch(name, q) { name = String(name || '').replace(/\s+/g, ''); q = String(q || '').replace(/\s+/g, ''); return !q || match1(name, q); }
  function find(q) {   // 이름 · 별칭에서 찾기 (이름 앞에서 맞을수록 위)
    q = String(q || '').trim();
    if (!q) return [];
    var out = [];
    DATA.names.forEach(function (o) {
      var hit = [o.n].concat(o.a || []).filter(function (s) { return koMatch(s, q); });
      if (!hit.length) return;
      var pos = o.n.replace(/\s+/g, '').toLowerCase().indexOf(q.replace(/\s+/g, '').toLowerCase());
      out.push({ n: o.n, sub: hit[0] !== o.n ? hit[0] : '', pos: pos < 0 ? 50 : pos });
    });
    return out.sort(function (a, b) { return a.pos - b.pos || a.n.localeCompare(b.n, 'ko'); });
  }

  /* ---------- 그림 그리기: roi 중심(cx, cy) · 가로 비율(w) → 단계마다 넓힘, 마지막은 전체 ---------- */
  var IMG = {};
  function loadImg(src) {
    if (IMG[src]) return IMG[src];
    IMG[src] = new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('그림을 못 불러왔어요')); }; im.src = src; });
    return IMG[src];
  }
  function draw(canvas, im, roi, stage) {
    var W = canvas.width, H = canvas.height, ctx = canvas.getContext('2d'), iw = im.naturalWidth, ih = im.naturalHeight;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.imageSmoothingQuality = 'high';
    if (stage >= 3) {   // 사진 전체 (비율 유지)
      var k = Math.min(W / iw, H / ih), dw = iw * k, dh = ih * k;
      ctx.drawImage(im, (W - dw) / 2, (H - dh) / 2, dw, dh); return;
    }
    var rw = Math.min(roi[2] * SCALE[stage], 1) * iw, rh = rw * H / W;   // 화면(4:3)과 같은 비율의 구역
    if (rh > ih) { rh = ih; rw = rh * W / H; }
    if (rw > iw) { rw = iw; rh = rw * H / W; }
    var sx = Math.min(Math.max(roi[0] * iw - rw / 2, 0), iw - rw), sy = Math.min(Math.max(roi[1] * ih - rh / 2, 0), ih - rh);
    ctx.drawImage(im, sx, sy, rw, rh, 0, 0, W, H);
  }

  /* ---------- 게임 상태 ---------- */
  var OPT = Object.assign({ rounds: 5 }, lsGet(KEY.opt, {}) || {});
  var BEST = lsGet(KEY.best, 0) || 0;
  var S = { view: 'home', G: null };
  function maxRounds() { return DATA.items.length; }
  function newGame() {
    var n = Math.min(OPT.rounds, maxRounds());
    S.G = { qs: shuffle(DATA.items).slice(0, n), i: 0, score: 0, log: [], stage: 0, tried: [], done: null, q: '', hot: 0 };
    S.view = 'play'; render();
  }
  function cur() { return S.G.qs[S.G.i]; }
  function norm(s) { return String(s).replace(/\s+/g, '').toLowerCase(); }
  function guess(name) {
    var G = S.G, it = cur();
    if (G.done) return;
    if (norm(name) === norm(it.name)) {
      var p = PTS[G.stage]; G.score += p; G.done = { ok: true, pts: p, stage: G.stage }; G.log.push({ it: it, pts: p, stage: G.stage });
    } else {
      G.tried.push(name); G.q = ''; G.hot = 0;
      if (G.stage >= 3) { G.done = { ok: false, pts: 0, stage: 3 }; G.log.push({ it: it, pts: 0, stage: 4 }); }
      else { G.stage++; toast('아쉬워요! 조금 더 넓게 보여 드릴게요'); }
    }
    render(G.done ? false : true);
  }
  function giveUp() {
    var G = S.G; if (G.done) return;
    G.done = { ok: false, pts: 0, stage: G.stage, gave: true }; G.log.push({ it: cur(), pts: 0, stage: 4 }); render();
  }
  function next() {
    var G = S.G;
    if (G.i + 1 >= G.qs.length) { if (G.score > BEST) { BEST = G.score; lsSet(KEY.best, BEST); G.newBest = true; } S.view = 'result'; render(); return; }
    G.i++; G.stage = 0; G.tried = []; G.done = null; G.q = ''; G.hot = 0; render();
  }

  /* ---------- 화면 ---------- */
  var VIEW = $('view');
  function dots() {
    var G = S.G; return '<div class="dots">' + G.qs.map(function (x, i) { var l = G.log[i]; return '<i class="' + (l ? (l.pts ? 'ok' : 'no') : i === G.i ? 'on' : '') + '"></i>'; }).join('') + '</div>';
  }
  function credit(it) { var c = it.credit; return c ? '<div class="credit">사진: ' + esc(c.by || '') + ' · ' + esc(c.lic || '') + ' · Wikimedia Commons (' + esc(c.file || '') + ')</div>' : ''; }
  var VIEWS = {
    home: function () {
      var opts = [5, 10].filter(function (n) { return n <= maxRounds() || n === 5; });
      return '<div class="card hero"><div class="big">🔍</div><h2>이 사진, 어떤 보드게임일까?</h2><p class="muted">사진의 아주 작은 조각만 보여 드려요.<br>틀리면 조금씩 넓어지고, 빨리 맞힐수록 높은 점수!</p>' +
        '<p class="muted">100 → 70 → 40 → 20점 (전체 사진)</p>' +
        '<div class="opt">' + opts.map(function (n) { return '<button data-rounds="' + n + '" class="' + (OPT.rounds === n ? 'on' : '') + '">' + Math.min(n, maxRounds()) + '문제</button>'; }).join('') + '</div>' +
        '<button class="btn primary block" id="start">시작하기</button>' + (BEST ? '<p class="muted" style="margin-top:12px">내 최고점 <b>' + BEST + '</b>점</p>' : '') + '</div>' +
        '<p class="muted center">문제 ' + maxRounds() + '개 · 시험용 (점수는 이 기기에만 저장돼요)</p>';
    },
    play: function () {
      var G = S.G, it = cur(), h = '<div class="top"><span>' + (G.i + 1) + ' / ' + G.qs.length + '</span>' + dots() + '<span>' + G.score + '점</span></div>';
      h += '<div class="frame"><canvas id="cv" width="800" height="600"></canvas><span class="tag">' + (G.done ? '사진 전체' : LABEL[G.stage]) + '</span></div>';
      if (G.done) {
        return h + '<div class="card reveal" style="margin-top:12px"><div class="' + (G.done.ok ? 'ok' : 'bad') + ' pt">' + (G.done.ok ? '🎉 정답! +' + G.done.pts + '점' : G.done.gave ? '😅 포기 · 0점' : '😢 아쉬워요 · 0점') + '</div><div class="nm">' + esc(it.name) + '</div>' +
          (G.tried.length ? '<div class="tried" style="justify-content:center">' + G.tried.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>' : '') + credit(it) +
          '<button class="btn primary block" id="next" style="margin-top:12px">' + (G.i + 1 >= G.qs.length ? '결과 보기' : '다음 문제') + '</button></div>';
      }
      h += '<div class="stagebar">' + [0, 1, 2, 3].map(function (i) { return '<span class="' + (i === G.stage ? 'on' : '') + '">' + PTS[i] + '점</span>'; }).join('') + '</div>';
      if (G.tried.length) h += '<div class="tried">' + G.tried.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>';
      h += '<div class="ans"><input id="q" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="게임 이름을 쳐 보세요 (초성도 돼요: ㅋㅌ)" value="' + esc(G.q) + '"></div><div id="sug"></div>';
      return h + '<div class="row2"><button class="btn" id="giveup">포기하고 정답 보기</button></div>';
    },
    result: function () {
      var G = S.G, right = G.log.filter(function (l) { return l.pts; }).length;
      return '<div class="card"><div class="center muted">' + (G.newBest ? '🏆 최고점 갱신!' : '결과') + '</div><div class="sc">' + G.score + '점</div><p class="center muted">' + G.qs.length + '문제 중 ' + right + '문제 맞힘 · 최고 ' + BEST + '점</p>' +
        G.log.map(function (l) { return '<div class="rv"><img src="' + esc(l.it.img) + '" alt=""><div><b>' + esc(l.it.name) + '</b><small>' + (l.pts ? (l.stage + 1) + '단계에서 맞힘' : '못 맞힘') + '</small></div><span class="p">' + l.pts + '</span></div>'; }).join('') +
        '</div><button class="btn primary block" id="again">다시 하기</button><div class="credit" style="margin-top:10px">사진 출처는 문제를 풀고 난 뒤 각 문제 화면 아래에 표시돼요.</div>';
    }
  };
  function sugHTML() {
    var G = S.G, q = G.q.trim();
    if (!q) return '<p class="muted center" style="margin-top:8px">이름 일부나 초성을 치면 후보가 나와요</p>';
    var list = find(q).filter(function (o) { return G.tried.indexOf(o.n) < 0; }).slice(0, 6);
    if (!list.length) return '<div class="sug"><div class="none">「' + esc(q) + '」에 맞는 게임이 없어요</div></div>';
    if (G.hot >= list.length) G.hot = 0;
    return '<div class="sug">' + list.map(function (o, i) { return '<button type="button" data-g="' + esc(o.n) + '" class="' + (i === G.hot ? 'hot' : '') + '"><span>' + esc(o.n) + '</span>' + (o.sub ? '<small>' + esc(o.sub) + '</small>' : '') + '</button>'; }).join('') + '</div>';
  }
  function bindPlay() {
    var q = $('q'), sug = $('sug');
    if (q) {
      sug.innerHTML = sugHTML();
      q.oninput = function () { S.G.q = q.value; S.G.hot = 0; sug.innerHTML = sugHTML(); };
      q.onkeydown = function (e) {
        var b = sug.querySelectorAll('button[data-g]');
        if (e.key === 'ArrowDown' && b.length) { e.preventDefault(); S.G.hot = (S.G.hot + 1) % b.length; sug.innerHTML = sugHTML(); }
        else if (e.key === 'ArrowUp' && b.length) { e.preventDefault(); S.G.hot = (S.G.hot + b.length - 1) % b.length; sug.innerHTML = sugHTML(); }
        else if (e.key === 'Enter' && b.length) { e.preventDefault(); guess(b[Math.min(S.G.hot, b.length - 1)].dataset.g); }
      };
      sug.onclick = function (e) { var b = e.target.closest('button[data-g]'); if (b) guess(b.dataset.g); };
    }
    var gu = $('giveup'); if (gu) gu.onclick = giveUp;
    var nx = $('next'); if (nx) nx.onclick = next;
  }
  function paint() {   // 그림 (불러오는 동안은 이전 그림 유지)
    var cv = $('cv'); if (!cv || !S.G) return;
    var it = cur(), st = S.G.done ? 3 : S.G.stage;
    loadImg(it.img).then(function (im) { var c = $('cv'); if (c && cur() === it) draw(c, im, it.roi, st); }, function () { toast('그림을 못 불러왔어요'); });
  }
  function render(keepFocus) {
    VIEW.innerHTML = VIEWS[S.view]();
    if (S.view === 'home') {
      VIEW.querySelectorAll('[data-rounds]').forEach(function (b) { b.onclick = function () { OPT.rounds = +b.dataset.rounds; lsSet(KEY.opt, OPT); render(); }; });
      $('start').onclick = newGame;
    } else if (S.view === 'play') { bindPlay(); paint(); if (keepFocus && $('q') && !/Mobi|Android/i.test(navigator.userAgent)) $('q').focus(); }
    else { $('again').onclick = newGame; }
    window.scrollTo(0, 0);
  }
  $('back').onclick = function () { if (S.view !== 'home' && S.G && !confirm('게임을 그만할까요?')) return; if (S.view !== 'home') { S.view = 'home'; render(); } else if (history.length > 1) history.back(); else location.href = '../'; };
  DATA.items.forEach(function (it) { var im = new Image(); im.src = it.img; });   // 미리 받아 두기
  render();
  window.JMB_QUIZ = { ver: VER, find: find, draw: draw, S: function () { return S; } };   // 시험용
})();
