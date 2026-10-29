/* 잠만보 에이징 커브 검사 — 미니게임 10종 v1 (모두 직접 만든 것, 외부 그림·소리 없음)
 * AG_GAMES[id] = { icon, how, keys, run(stage, hud, done) }
 *   run 은 정리 함수를 돌려줌 (중간에 나가면 부름). done({v: 잰 값, x: 덧붙인 값}) — 점수는 score.js
 *   hud(글자) = 게임 위 상태 줄
 */
var AG_GAMES = (function () {
  'use strict';
  function now() { return performance.now(); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function avg(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : 0; }
  function vib(k) { if (window.JMB_FX && JMB_FX.haptic) try { JMB_FX.haptic(k); } catch (e) {} }

  // 정리할 것 모아 두기: 이벤트 · 타이머 · 화면 갱신
  function Ctx(stage) {
    var offs = [], tms = [], raf = 0, dead = false;
    return {
      on: function (el, ev, fn, opt) { el.addEventListener(ev, fn, opt || false); offs.push(function () { el.removeEventListener(ev, fn, opt || false); }); },
      later: function (fn, ms) { var t = setTimeout(function () { if (!dead) fn(); }, ms); tms.push(t); return t; },
      loop: function (fn) { var step = function (t) { if (dead) return; if (fn(t) !== false) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); },
      dead: function () { return dead; },
      stop: function () { dead = true; offs.forEach(function (f) { f(); }); tms.forEach(clearTimeout); cancelAnimationFrame(raf); }
    };
  }
  function xy(stage, e) { var r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }; }
  // 3 · 2 · 1 뒤에 시작
  function countdown(c, stage, then) {
    var n = 3, el = document.createElement('div');
    el.className = 'cd'; stage.appendChild(el);
    var tick = function () { if (n === 0) { el.remove(); then(); return; } el.textContent = n; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); n--; c.later(tick, 650); };
    tick();
  }
  function canvas(stage) {
    var cv = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1), r = stage.getBoundingClientRect();
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    stage.appendChild(cv);
    var g = cv.getContext('2d'); g.scale(dpr, dpr);
    return { cv: cv, g: g, w: r.width, h: r.height };
  }
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'; }

  var G = {};

  /* 1. 신호 반응 — 초록이 되는 순간 누르기 5번 */
  G.react = { icon: '🚦', how: '화면이 <b>초록</b>으로 바뀌는 순간 누르세요. 5번 재서 평균을 내요. 빨강일 때 누르면 성급함 감점!', keys: 'Space',
    run: function (stage, hud, done) {
      var c = Ctx(stage), times = [], early = 0, state = '', t0 = 0, timer = 0;
      stage.innerHTML = '<div class="sig"><b></b><small></small></div>';
      var box = stage.firstChild, big = box.querySelector('b'), sm = box.querySelector('small');
      var show = function (s, b, t) { stage.setAttribute('data-s', s); big.textContent = b; sm.textContent = t || ''; };
      var next = function () {
        if (times.length >= 5) { stage.removeAttribute('data-s'); return done({ v: Math.round(avg(times)), x: early }); }
        state = 'wait'; hud((times.length + 1) + ' / 5' + (early ? ' · 성급 ' + early : ''));
        show('wait', '기다리세요…', '초록이 되면 바로!');
        timer = c.later(function () { state = 'go'; show('go', '지금!'); t0 = now(); }, rnd(1300, 3800));
      };
      var hit = function (e) {
        if (e) e.preventDefault();
        if (state === 'wait') { clearTimeout(timer); early++; state = 'x'; vib('warn'); show('early', '너무 빨라요!', '다시 한 번'); c.later(next, 1000); }
        else if (state === 'go') { var ms = now() - t0; times.push(ms); state = 'x'; vib('tap'); show('done', Math.round(ms) + 'ms', ms < 200 ? '번개!' : ms < 260 ? '좋아요' : ms < 330 ? '괜찮아요' : '음…'); c.later(next, 900); }
      };
      c.on(stage, 'pointerdown', hit);
      c.on(document, 'keydown', function (e) { if ((e.code === 'Space' || e.key === 'Enter') && !e.repeat) hit(e); });
      next();
      return c.stop;
    } };

  /* 2. 표적 사격 — 20초 동안 움직이며 작아지는 표적 맞히기 */
  G.aim = { icon: '🎯', how: '20초 동안 나타나는 <b>표적</b>을 빨리 누르세요. 표적은 움직이면서 작아지고, 헛손질하면 정확도가 깎여요.',
    run: function (stage, hud, done) {
      var c = Ctx(stage), hits = 0, miss = 0, gone = 0, T = 20000, start = 0, t = null;
      stage.innerHTML = '<div class="tgt"></div>';
      var el = stage.firstChild, R = 0, W = 0, H = 0;
      var spawn = function () {
        var r = stage.getBoundingClientRect(); W = r.width; H = r.height; R = Math.max(22, Math.min(W, H) * 0.075);
        var a = rnd(0, Math.PI * 2), sp = rnd(30, 90);
        t = { x: rnd(R, W - R), y: rnd(R, H - R), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: now(), life: 1700 };
      };
      var draw = function () {
        if (!t) return;
        var k = 1 - (now() - t.born) / t.life, r = R * (0.45 + 0.55 * Math.max(0, k));
        el.style.cssText = 'width:' + r * 2 + 'px;height:' + r * 2 + 'px;transform:translate(' + (t.x - r) + 'px,' + (t.y - r) + 'px)';
        t.r = r;
      };
      countdown(c, stage, function () {
        start = now(); spawn(); var last = now();
        c.loop(function () {
          var tn = now(), dt = (tn - last) / 1000; last = tn;
          var left = T - (tn - start);
          if (left <= 0) { el.remove(); done({ v: hits, x: Math.round(hits / Math.max(1, hits + miss + gone) * 100) / 100 }); return false; }
          t.x += t.vx * dt; t.y += t.vy * dt;
          if (t.x < R || t.x > W - R) t.vx *= -1;
          if (t.y < R || t.y > H - R) t.vy *= -1;
          if (tn - t.born > t.life) { gone++; spawn(); }
          draw();
          hud('남은 ' + (left / 1000).toFixed(1) + '초 · 맞힘 ' + hits + (miss + gone ? ' · 놓침 ' + (miss + gone) : ''));
        });
      });
      c.on(stage, 'pointerdown', function (e) {
        e.preventDefault(); if (!start || !t) return;
        var p = xy(stage, e), d = Math.hypot(p.x - t.x, p.y - t.y);
        if (d <= t.r + 6) { hits++; vib('tap'); pop(stage, t.x, t.y, '+1'); spawn(); } else { miss++; pop(stage, p.x, p.y, '×', 'bad'); }
      });
      return c.stop;
    } };

  function pop(stage, x, y, txt, cls) {
    var p = document.createElement('i'); p.className = 'popfx' + (cls ? ' ' + cls : ''); p.textContent = txt;
    p.style.left = x + 'px'; p.style.top = y + 'px'; stage.appendChild(p);
    setTimeout(function () { p.remove(); }, 600);
  }

  /* 3. 따라붙기 — 12초 동안 움직이는 원 안에 손가락(마우스)을 계속 두기 */
  G.track = { icon: '🐝', how: '12초 동안 움직이는 <b>원</b> 안에 손가락(마우스)을 계속 두세요. 원 안에 있던 시간이 길수록 좋아요. 휴대폰은 화면에 손을 댄 채로!',
    run: function (stage, hud, done) {
      var c = Ctx(stage), T = 12000, start = 0, inside = 0, last = 0, ptr = null;
      stage.innerHTML = '<div class="trk"></div>';
      var el = stage.firstChild;
      var set = function (e) { var p = xy(stage, e); ptr = (e.pointerType === 'mouse' || e.buttons || e.type === 'pointerdown') ? p : null; };
      c.on(stage, 'pointermove', set); c.on(stage, 'pointerdown', function (e) { e.preventDefault(); try { stage.setPointerCapture(e.pointerId); } catch (x) {} set(e); });
      c.on(stage, 'pointerup', function (e) { if (e.pointerType !== 'mouse') ptr = null; });
      c.on(stage, 'pointerleave', function () { ptr = null; });
      var ph = [rnd(0, 6), rnd(0, 6), rnd(0, 6)];
      countdown(c, stage, function () {
        start = now(); last = start;
        c.loop(function () {
          var tn = now(), el2 = tn - start, dt = tn - last; last = tn;
          var r = stage.getBoundingClientRect(), W = r.width, H = r.height, R = Math.max(24, Math.min(W, H) * 0.085);
          var s = el2 / 1000, sp = 1 + s / 12;   // 갈수록 조금 빨라짐
          var x = W / 2 + (W / 2 - R - 4) * Math.sin(s * 0.9 * sp + ph[0]) * Math.cos(s * 0.37 + ph[2]);
          var y = H / 2 + (H / 2 - R - 4) * Math.sin(s * 1.27 * sp + ph[1]);
          var ok = ptr && Math.hypot(ptr.x - x, ptr.y - y) <= R;
          if (ok) inside += dt;
          el.className = 'trk' + (ok ? ' on' : '');
          el.style.cssText = 'width:' + R * 2 + 'px;height:' + R * 2 + 'px;transform:translate(' + (x - R) + 'px,' + (y - R) + 'px)';
          if (el2 >= T) { done({ v: Math.round(inside / T * 1000) / 10 }); return false; }
          hud('남은 ' + ((T - el2) / 1000).toFixed(1) + '초 · 원 안 ' + Math.round(inside / Math.max(1, el2) * 100) + '%');
        });
      });
      return c.stop;
    } };

  /* 4. 박자 맞추기 — 4줄로 떨어지는 음표를 선에 맞춰 누르기 */
  G.rhythm = { icon: '🎵', how: '떨어지는 <b>음표</b>가 아래 선에 닿을 때 그 줄을 누르세요. PC는 <kbd>D</kbd> <kbd>F</kbd> <kbd>J</kbd> <kbd>K</kbd>. 어긋난 시간(ms)이 적을수록 좋아요.', keys: 'D F J K',
    run: function (stage, hud, done) {
      var c = Ctx(stage), cvs = canvas(stage), g = cvs.g, W = cvs.w, H = cvs.h, FALL = 1300, WIN = 160, N = 28;
      var lineY = H - 70, laneW = W / 4, notes = [], t = 1600, errs = [], flash = [0, 0, 0, 0], msg = '', msgT = 0, start = 0;
      for (var i = 0; i < N; i++) { notes.push({ t: t, lane: Math.floor(Math.random() * 4), done: false }); t += pick([380, 430, 480, 560, 640]); }
      var end = t + 600;
      var judge = function (lane) {
        if (!start) return;
        var tn = now() - start; flash[lane] = now();
        var best = null;
        notes.forEach(function (n) { if (!n.done && n.lane === lane && Math.abs(n.t - tn) <= WIN && (!best || Math.abs(n.t - tn) < Math.abs(best.t - tn))) best = n; });
        if (!best) return;
        best.done = true; var e = Math.abs(best.t - tn); errs.push(e); vib('tap');
        msg = e <= 35 ? 'PERFECT' : e <= 80 ? 'GREAT' : 'GOOD'; msgT = now();
      };
      var KEYS = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 };
      c.on(document, 'keydown', function (e) { if (e.repeat) return; var l = KEYS[e.code]; if (l != null) { e.preventDefault(); judge(l); } });
      c.on(stage, 'pointerdown', function (e) { e.preventDefault(); var p = xy(stage, e); judge(Math.min(3, Math.max(0, Math.floor(p.x / laneW)))); });
      var COL = ['#4c6ef5', '#12b886', '#f59f00', '#e64980'], ink = css('--ink'), line = css('--muted');
      countdown(c, stage, function () {
        start = now();
        c.loop(function () {
          var tn = now() - start;
          notes.forEach(function (n) { if (!n.done && tn - n.t > WIN) { n.done = true; errs.push(WIN); msg = 'MISS'; msgT = now(); } });
          g.clearRect(0, 0, W, H);
          for (var l = 0; l < 4; l++) {
            var f = Math.max(0, 1 - (now() - flash[l]) / 180);
            g.fillStyle = 'rgba(128,128,128,' + (0.06 + (l % 2) * 0.04 + f * 0.25) + ')'; g.fillRect(l * laneW, 0, laneW, H);
          }
          g.fillStyle = ink; g.fillRect(0, lineY - 2, W, 4);
          notes.forEach(function (n) {
            if (n.done) return;
            var y = lineY - (n.t - tn) / FALL * lineY;
            if (y < -20 || y > H + 20) return;
            g.fillStyle = COL[n.lane]; roundRect(g, n.lane * laneW + 8, y - 10, laneW - 16, 20, 8); g.fill();
          });
          g.fillStyle = line; g.font = '600 13px sans-serif'; g.textAlign = 'center';
          ['D', 'F', 'J', 'K'].forEach(function (k, l) { g.fillText(k, l * laneW + laneW / 2, H - 22); });
          if (msg && now() - msgT < 450) { g.fillStyle = msg === 'MISS' ? '#e5484d' : msg === 'PERFECT' ? '#f59f00' : ink; g.font = '800 24px sans-serif'; g.fillText(msg, W / 2, H * 0.4); }
          var hit = errs.length;
          hud('음표 ' + Math.min(hit, N) + ' / ' + N + (hit ? ' · 평균 오차 ' + Math.round(avg(errs)) + 'ms' : ''));
          if (tn > end) { done({ v: Math.round(avg(errs)) }); return false; }
        });
      });
      return c.stop;
    } };
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  /* 5. 막타 타이밍 — 보스 체력이 1,000 아래로 떨어진 순간 막타 (늦으면 라이벌이 가져감) */
  G.smite = { icon: '🗡️', how: '보스 체력이 <b>1,000 이하</b>가 되면 바로 <b>막타!</b> 너무 일찍 치면 실패, 늦으면 라이벌이 가로채요. 5번.', keys: 'Space',
    run: function (stage, hud, done) {
      var c = Ctx(stage), trials = [], ok = 0, round = null, MAXHP = 6000, TH = 1000, FAIL = 560;
      stage.innerHTML = '<div class="boss"><div class="bn">👾 보스</div><div class="hp"><i></i><em></em></div><b class="hpn"></b><div class="bmsg"></div><button type="button" class="smb">🗡️ 막타!</button></div>';
      var bar = stage.querySelector('.hp i'), mark = stage.querySelector('.hp em'), num = stage.querySelector('.hpn'), bm = stage.querySelector('.bmsg'), btn = stage.querySelector('.smb');
      mark.style.left = (TH / MAXHP * 100) + '%';
      var next = function () {
        if (trials.length >= 5) return done({ v: Math.round(avg(trials)), x: ok });
        hud((trials.length + 1) + ' / 5 · 성공 ' + ok);
        bm.textContent = ''; btn.disabled = false;
        round = { hp: MAXHP, rate: rnd(1800, 3600), steal: rnd(180, 620), cross: 0, wob: rnd(0, 6), on: true };
        var last = now();
        c.loop(function () {
          if (!round || !round.on) return false;
          var tn = now(), dt = (tn - last) / 1000; last = tn;
          var sp = round.rate * (1 + 0.45 * Math.sin(tn / 260 + round.wob));   // 빨라졌다 느려졌다
          round.hp -= sp * dt;
          if (round.hp <= TH && !round.cross) round.cross = tn;
          if (round.hp <= round.steal) { end(false, '라이벌이 가로챘어요! 😱'); return false; }
          bar.style.width = Math.max(0, round.hp / MAXHP * 100) + '%';
          bar.className = round.hp <= TH ? 'low' : '';
          num.textContent = Math.max(0, Math.round(round.hp)).toLocaleString();
        });
      };
      var end = function (good, text, ms) {
        round.on = false; btn.disabled = true;
        trials.push(good ? ms : FAIL); if (good) ok++;
        bm.textContent = text; bm.className = 'bmsg ' + (good ? 'ok' : 'bad');
        vib(good ? 'win' : 'warn');
        c.later(next, 1100);
      };
      var hit = function (e) {
        if (e) e.preventDefault();
        if (!round || !round.on) return;
        if (round.hp > TH) end(false, '너무 일러요! (' + Math.round(round.hp).toLocaleString() + ')');
        else { var ms = now() - round.cross; end(true, '막타 성공! ' + Math.round(ms) + 'ms', ms); }
      };
      c.on(btn, 'pointerdown', hit);
      c.on(document, 'keydown', function (e) { if ((e.code === 'Space' || e.key === 'Enter') && !e.repeat) hit(e); });
      countdown(c, stage, next);
      return c.stop;
    } };

  /* 6. 색깔 함정 — 글자가 아니라 글자 '색'을 고르기 20초 */
  G.stroop = { icon: '🎨', how: '글자의 <b>뜻이 아니라 색</b>을 고르세요. 20초 동안 맞힌 수 − 틀린 수가 점수예요.',
    run: function (stage, hud, done) {
      var c = Ctx(stage), C = [['빨강', '#e03131'], ['파랑', '#1c7ed6'], ['초록', '#2f9e44'], ['노랑', '#f5b301']], T = 20000, okN = 0, bad = 0, cur = null, start = 0;
      stage.innerHTML = '<div class="stw"><b class="word"></b><div class="stb">' + C.map(function (x, i) { return '<button type="button" data-i="' + i + '">' + x[0] + '</button>'; }).join('') + '</div></div>';
      var word = stage.querySelector('.word');
      var next = function () {
        var w = Math.floor(Math.random() * 4), k = Math.random() < 0.75 ? (w + 1 + Math.floor(Math.random() * 3)) % 4 : w;
        if (cur && cur.w === w && cur.k === k) return next();
        cur = { w: w, k: k }; word.textContent = C[w][0]; word.style.color = C[k][1];
        word.classList.remove('pop'); void word.offsetWidth; word.classList.add('pop');
      };
      c.on(stage.querySelector('.stb'), 'pointerdown', function (e) {
        var b = e.target.closest('[data-i]'); if (!b || !start) return; e.preventDefault();
        if (+b.getAttribute('data-i') === cur.k) { okN++; vib('tap'); } else { bad++; vib('warn'); word.classList.add('shake'); c.later(function () { word.classList.remove('shake'); }, 300); }
        next();
      });
      countdown(c, stage, function () {
        start = now(); next();
        c.loop(function () {
          var left = T - (now() - start);
          if (left <= 0) { done({ v: okN - bad, x: bad }); return false; }
          hud('남은 ' + (left / 1000).toFixed(1) + '초 · 맞힘 ' + okN + (bad ? ' · 틀림 ' + bad : ''));
        });
      });
      return c.stop;
    } };

  /* 7. 순서 기억 — 반짝인 칸을 같은 순서로 (3칸부터 하나씩 늘어남, 한 번 틀리면 끝) */
  G.memory = { icon: '🧩', how: '반짝이는 <b>칸의 순서</b>를 기억했다가 똑같이 누르세요. 3칸부터 하나씩 늘어나고, 한 번 틀리면 끝!',
    run: function (stage, hud, done) {
      var c = Ctx(stage), seq = [], pos = 0, input = false, best = 0;
      stage.innerHTML = '<div class="mem">' + [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (i) { return '<button type="button" data-i="' + i + '"></button>'; }).join('') + '</div>';
      var cells = stage.querySelectorAll('.mem button');
      var lit = function (i, ms, cls) { cells[i].classList.add(cls || 'on'); c.later(function () { cells[i].classList.remove(cls || 'on'); }, ms); };
      var add = function () { var x; do { x = Math.floor(Math.random() * 9); } while (seq.length && x === seq[seq.length - 1]); seq.push(x); };
      var play = function () {
        input = false; pos = 0; hud(seq.length + '칸 · 보세요 👀');
        seq.forEach(function (x, k) { c.later(function () { lit(x, 430); vib('tap'); }, 450 + k * 620); });
        c.later(function () { input = true; hud(seq.length + '칸 · 이제 누르세요 👆'); }, 450 + seq.length * 620);
      };
      c.on(stage.querySelector('.mem'), 'pointerdown', function (e) {
        var b = e.target.closest('[data-i]'); if (!b || !input) return; e.preventDefault();
        var i = +b.getAttribute('data-i');
        if (i !== seq[pos]) { input = false; lit(i, 500, 'bad'); lit(seq[pos], 700, 'ans'); vib('warn'); hud('틀렸어요! ' + best + '칸까지 성공'); c.later(function () { done({ v: best }); }, 1100); return; }
        lit(i, 200); pos++;
        if (pos === seq.length) { input = false; best = seq.length; if (best >= 20) { c.later(function () { done({ v: best }); }, 500); return; } hud('성공! 👍'); add(); c.later(play, 700); }
      });
      countdown(c, stage, function () { add(); add(); add(); play(); });
      return c.stop;
    } };

  /* 8. 광클 — 5초 동안 최대한 많이 누르기 */
  G.cps = { icon: '👆', how: '첫 번째로 누른 순간부터 <b>5초</b> 동안 버튼을 최대한 많이 누르세요. (마우스·손가락 모두 됨)',
    run: function (stage, hud, done) {
      var c = Ctx(stage), n = 0, start = 0, T = 5000;
      stage.innerHTML = '<button type="button" class="tap"><b>누르면 시작!</b><small></small></button>';
      var btn = stage.firstChild, b = btn.querySelector('b'), sm = btn.querySelector('small');
      hud('5초 · 준비되면 누르세요');
      c.on(btn, 'pointerdown', function (e) {
        e.preventDefault();
        if (start && now() - start > T) return;
        if (!start) {
          start = now();
          c.loop(function () {
            var left = T - (now() - start);
            if (left <= 0) { btn.disabled = true; b.textContent = n + '번!'; sm.textContent = (n / 5).toFixed(1) + '회/초'; c.later(function () { done({ v: Math.round(n / 5 * 10) / 10 }); }, 700); return false; }
            hud('남은 ' + (left / 1000).toFixed(1) + '초');
          });
        }
        n++; b.textContent = n; sm.textContent = '';
        btn.classList.remove('hit'); void btn.offsetWidth; btn.classList.add('hit');
      });
      return c.stop;
    } };

  /* 9. 피하기 — 날아오는 공을 피해 오래 버티기 (최대 30초) */
  G.dodge = { icon: '☄️', how: '가운데 <b>내 점</b>을 움직여 날아오는 공을 피하세요. 마우스는 따라오고, 휴대폰은 화면 어디든 대고 끌면 움직여요. 최대 30초!',
    run: function (stage, hud, done) {
      var c = Ctx(stage), cvs = canvas(stage), g = cvs.g, W = cvs.w, H = cvs.h, me = { x: W / 2, y: H / 2, r: 8 }, balls = [], start = 0, lastSpawn = 0, drag = null, over = false;
      var ink = css('--accent'), bad = '#e5484d';
      c.on(stage, 'pointerdown', function (e) { e.preventDefault(); try { stage.setPointerCapture(e.pointerId); } catch (x) {} var p = xy(stage, e); drag = { x: p.x, y: p.y, mx: me.x, my: me.y, m: e.pointerType === 'mouse' }; });
      c.on(stage, 'pointermove', function (e) {
        var p = xy(stage, e);
        if (e.pointerType === 'mouse') { me.x = p.x; me.y = p.y; }
        else if (drag) { me.x = drag.mx + (p.x - drag.x) * 1.15; me.y = drag.my + (p.y - drag.y) * 1.15; }
        me.x = Math.max(me.r, Math.min(W - me.r, me.x)); me.y = Math.max(me.r, Math.min(H - me.r, me.y));
      });
      c.on(stage, 'pointerup', function () { drag = null; });
      var spawn = function (s) {
        var side = Math.floor(Math.random() * 4), x = side === 0 ? -10 : side === 1 ? W + 10 : rnd(0, W), y = side === 2 ? -10 : side === 3 ? H + 10 : rnd(0, H);
        var tx = me.x + rnd(-60, 60), ty = me.y + rnd(-60, 60), a = Math.atan2(ty - y, tx - x), sp = rnd(90, 150) + s * 6;
        balls.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: rnd(6, 11) });
      };
      var draw = function () {
        g.clearRect(0, 0, W, H);
        g.fillStyle = bad; balls.forEach(function (b) { g.beginPath(); g.arc(b.x, b.y, b.r, 0, 7); g.fill(); });
        g.fillStyle = ink; g.beginPath(); g.arc(me.x, me.y, me.r, 0, 7); g.fill();
        g.strokeStyle = ink; g.globalAlpha = .3; g.beginPath(); g.arc(me.x, me.y, me.r + 6, 0, 7); g.stroke(); g.globalAlpha = 1;
      };
      draw();
      countdown(c, stage, function () {
        start = now(); var last = start;
        c.loop(function () {
          var tn = now(), dt = Math.min(0.05, (tn - last) / 1000), s = (tn - start) / 1000; last = tn;
          if (tn - lastSpawn > Math.max(170, 620 - s * 18)) { spawn(s); lastSpawn = tn; }
          balls.forEach(function (b) { b.x += b.vx * dt; b.y += b.vy * dt; });
          balls = balls.filter(function (b) { return b.x > -40 && b.x < W + 40 && b.y > -40 && b.y < H + 40; });
          var hit = balls.some(function (b) { return Math.hypot(b.x - me.x, b.y - me.y) < b.r + me.r - 2; });
          draw();
          if (hit || s >= 30) { over = true; vib(hit ? 'bomb' : 'win'); hud(hit ? '맞았어요! ' + s.toFixed(1) + '초' : '30초 버텼어요! 🏆'); c.later(function () { done({ v: Math.round(Math.min(30, s) * 10) / 10 }); }, 700); return false; }
          hud(s.toFixed(1) + '초 버티는 중');
        });
      });
      return c.stop;
    } };

  /* 10. 키 콤보 — 나오는 키(Q W E R)를 빠르게 누르기 16번 */
  G.combo = { icon: '⌨️', how: '나오는 <b>스킬 키</b>를 순서대로 빠르게 누르세요. PC는 키보드 <kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> <kbd>R</kbd>, 휴대폰은 아래 버튼. 틀리면 0.3초 벌칙!', keys: 'Q W E R',
    run: function (stage, hud, done) {
      var c = Ctx(stage), K = ['Q', 'W', 'E', 'R'], N = 16, list = [], i = 0, t0 = 0, times = [], pen = 0;
      for (var k = 0; k < N; k++) list.push(pick(K));
      stage.innerHTML = '<div class="cmb"><div class="cq"></div><div class="cb">' + K.map(function (x) { return '<button type="button" data-k="' + x + '">' + x + '</button>'; }).join('') + '</div></div>';
      var q = stage.querySelector('.cq');
      var draw = function () { q.innerHTML = list.slice(i, i + 4).map(function (x, j) { return '<span class="k' + (j === 0 ? ' now' : '') + ' k' + x + '">' + x + '</span>'; }).join(''); hud((i + 1) + ' / ' + N + (pen ? ' · 실수 ' + pen : '')); };
      var press = function (key) {
        if (!t0 || i >= N) return;
        if (key !== list[i]) { pen++; vib('warn'); q.classList.add('shake'); c.later(function () { q.classList.remove('shake'); }, 250); return; }
        var tn = now(); times.push(tn - t0); t0 = tn; i++; vib('tap');
        if (i >= N) { hud('끝!'); c.later(function () { done({ v: Math.round((avg(times) * N + pen * 300) / N) }); }, 400); q.innerHTML = ''; return; }
        draw();
      };
      var MAP = { q: 'Q', w: 'W', e: 'E', r: 'R', 'ㅂ': 'Q', 'ㅈ': 'W', 'ㄷ': 'E', 'ㄱ': 'R' };   // 한글 자판 상태여도
      c.on(document, 'keydown', function (e) { if (e.repeat) return; var k = MAP[(e.key || '').toLowerCase()] || ({ KeyQ: 'Q', KeyW: 'W', KeyE: 'E', KeyR: 'R' })[e.code]; if (k) { e.preventDefault(); press(k); } });
      c.on(stage.querySelector('.cb'), 'pointerdown', function (e) { var b = e.target.closest('[data-k]'); if (b) { e.preventDefault(); press(b.getAttribute('data-k')); } });
      countdown(c, stage, function () { draw(); t0 = now(); });
      return c.stop;
    } };

  return G;
})();
