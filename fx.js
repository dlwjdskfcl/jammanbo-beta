/* 잠만보 효과 모음 fx.js v1 — 직접 만든 가벼운 기능 (외부 라이브러리·외부 접속 없음)
 * 메인 앱(index.html 머리에서) · 티츄 · 순서 룰렛이 같이 씀. (티츄·룰렛은 index.html 의 ../fx.js?v=1 — 이 파일을 바꾸면 그 숫자도 올리기) 이미지 저장만 같은 사이트의 vendor/snapdom.js(MIT)를 필요할 때 읽음
 *
 *   JMB_FX.avatar(name, px)    닉네임 → 미플(보드게임 말) 아바타 SVG 글자. 같은 이름은 늘 같은 색·표정·소품
 *   JMB_FX.haptic(kind)        진동 tap · turn · bomb · win · warn — 안드로이드는 vibrate, 아이폰(iOS 18+)은 스위치 '틱'
 *   JMB_FX.hapticOn() / setHaptic(on)   진동 켜기·끄기 (이 기기에 저장, 기본 켬)
 *   JMB_FX.confetti(opt)       꽃가루 {x, y(0~1), count, duration} — '동작 줄이기' 설정이면 안 함
 *   JMB_FX.ics(ev) / gcal(ev)  캘린더 파일(.ics) 받기 · 구글 캘린더 주소   ev = {title, date:'YYYY-MM-DD', start:'HH:MM', end, place, note, url, uid}
 *   JMB_FX.capture(el, name, opt)  화면 한 부분 → PNG (휴대폰: 공유, PC: 저장). Promise<'shared'|'saved'|'cancel'>
 */
(function (W) {
  if (W.JMB_FX) return;
  var D = document, NAV = navigator;
  var BASE = (function () { var s = D.currentScript && D.currentScript.src; return s ? s.replace(/[?#].*$/, '').replace(/[^/]*$/, '') : (W.JMB_ROOT || '/'); })();
  var UA = NAV.userAgent || '';
  var IOS = /iP(hone|ad|od)/.test(UA) || (/Macintosh/.test(UA) && NAV.maxTouchPoints > 1);
  var MOBILE = IOS || /Android|Mobi/.test(UA);
  var REDUCE = !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------- 아바타 (미플) ---------- */
  function hash(s) { var h = 2166136261; s = String(s || ''); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  var MEEPLE = 'M20 17.6c-5.6 0-12.4 1.1-12.4 4.7 0 2.3 2.6 2.9 5.6 2.5L9.6 33.9c-.5 1.5.4 2.3 1.7 2.3h5.9L20 30.7l2.8 5.5h5.9c1.3 0 2.2-.8 1.7-2.3l-3.6-9.1c3 .4 5.6-.2 5.6-2.5 0-3.6-6.8-4.7-12.4-4.7z';
  function avatar(name, px) {
    var h = hash(name), hue = h % 360, v = h >>> 9;
    var bg = 'hsl(' + hue + ',75%,90%)', body = 'hsl(' + hue + ',58%,50%)', ink = 'hsl(' + hue + ',60%,24%)';
    var face = v % 4, acc = (v >>> 2) % 6;
    var eyes = face === 2 ? '<circle cx="17.6" cy="11.4" r="1.05" fill="' + ink + '"/><path d="M21.4 11.5h2.2" stroke="' + ink + '" stroke-width="1.1" stroke-linecap="round"/>'   // 윙크
      : face === 3 ? '<path d="M16.6 11.8q1 -1.2 2 0M21.4 11.8q1 -1.2 2 0" stroke="' + ink + '" stroke-width="1.1" fill="none" stroke-linecap="round"/>'   // 웃는 눈
      : '<circle cx="17.6" cy="11.4" r="1.05" fill="' + ink + '"/><circle cx="22.4" cy="11.4" r="1.05" fill="' + ink + '"/>';
    var mouth = face === 1 ? '<circle cx="20" cy="14.3" r=".9" fill="' + ink + '"/>' : '<path d="M18.2 13.9q1.8 1.5 3.6 0" stroke="' + ink + '" stroke-width="1" fill="none" stroke-linecap="round"/>';
    var extra = acc === 1 ? '<path d="M13.6 7.6h12.8l-1.6-1.4h-9.6z" fill="' + ink + '"/><rect x="15.6" y="2.6" width="8.8" height="4.4" rx="1" fill="' + ink + '"/>'   // 모자
      : acc === 2 ? '<path d="M10.5 21.5l19 2.6" stroke="#fff" stroke-width="1.6" opacity=".85"/>'   // 띠
      : acc === 4 ? '<path d="M15.2 6.4l1.4-3.4 2 2.2 1.4-2.8 1.4 2.8 2-2.2 1.4 3.4z" fill="#f6c62a" stroke="' + ink + '" stroke-width=".5"/>'   // 왕관
      : acc === 5 ? '<g fill="none" stroke="' + ink + '" stroke-width=".9"><circle cx="17.6" cy="11.4" r="2"/><circle cx="22.4" cy="11.4" r="2"/><path d="M19.6 11.4h.8"/></g>' : '';   // 안경
    return '<svg class="jmb-av" width="' + (px || 28) + '" height="' + (px || 28) + '" viewBox="0 0 40 40" role="img" aria-label="' + esc(name) + '">' +
      '<circle cx="20" cy="20" r="20" fill="' + bg + '"/><path d="' + MEEPLE + '" fill="' + body + '"/><circle cx="20" cy="11.6" r="6.4" fill="' + body + '"/>' +
      '<circle cx="20" cy="11.6" r="4.7" fill="#fff" opacity=".9"/>' + eyes + mouth + extra + '</svg>';
  }

  /* ---------- 진동 ---------- */
  var HKEY = 'jmb_haptic';
  var PAT = { tap: [12], turn: [28], bomb: [40, 50, 90], win: [30, 60, 30, 60, 100], warn: [60, 80, 60] };
  function hapticOn() { try { return localStorage.getItem(HKEY) !== '0'; } catch (e) { return true; } }
  function setHaptic(on) { try { localStorage.setItem(HKEY, on ? '1' : '0'); } catch (e) {} }
  var sw = null;
  // 아이폰 사파리는 vibrate 가 없음 → iOS 18 의 스위치(<input switch>)를 켜고 끌 때 나는 '틱'을 씀 (화면 밖에 숨김)
  function iosTick() {
    try {
      if (!sw) {
        sw = D.createElement('label'); sw.setAttribute('aria-hidden', 'true');
        sw.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
        var i = D.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1;
        sw.appendChild(i); D.body.appendChild(sw);
      }
      sw.click();
    } catch (e) {}
  }
  function haptic(kind) {
    if (!hapticOn()) return false;
    var p = PAT[kind] || PAT.tap;
    if (typeof NAV.vibrate === 'function') { try { return NAV.vibrate(p); } catch (e) { return false; } }
    if (IOS) { for (var i = 0; i < p.length; i += 2) setTimeout(iosTick, i * 70); return true; }
    return false;
  }

  /* ---------- 꽃가루 ---------- */
  function confetti(opt) {
    opt = opt || {};
    if (REDUCE || !D.body) return;
    var w = W.innerWidth, h = W.innerHeight, dpr = Math.min(2, W.devicePixelRatio || 1);
    var cv = D.createElement('canvas'); cv.width = w * dpr; cv.height = h * dpr;
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2147483000';
    D.body.appendChild(cv);
    var g = cv.getContext('2d'); g.scale(dpr, dpr);
    var colors = opt.colors || ['#f6c62a', '#ff6b6b', '#4dabf7', '#69db7c', '#b197fc', '#ffa94d', '#f783ac'];
    var n = opt.count || 120, ox = (opt.x == null ? 0.5 : opt.x) * w, oy = (opt.y == null ? 0.38 : opt.y) * h, P = [];
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.1, sp = 6 + Math.random() * 8;
      P.push({ x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, s: 6 + Math.random() * 6, c: colors[i % colors.length], k: i % 3 });
    }
    var t0 = 0, dur = opt.duration || 2400;
    function step(t) {
      if (!t0) t0 = t;
      var k = (t - t0) / dur;
      g.clearRect(0, 0, w, h);
      g.globalAlpha = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
      for (var j = 0; j < P.length; j++) {
        var p = P[j];
        p.vy += 0.24; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
        if (p.k === 0) g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        else if (p.k === 1) { g.beginPath(); g.arc(0, 0, p.s / 3, 0, 6.283); g.fill(); }
        else { g.beginPath(); g.moveTo(0, -p.s / 2); g.lineTo(p.s / 2, p.s / 2); g.lineTo(-p.s / 2, p.s / 2); g.closePath(); g.fill(); }
        g.restore();
      }
      if (k < 1) W.requestAnimationFrame(step); else if (cv.parentNode) cv.parentNode.removeChild(cv);
    }
    W.requestAnimationFrame(step);
  }

  /* ---------- 파일 저장 · 공유 ---------- */
  function download(blob, name) {
    var u = URL.createObjectURL(blob), a = D.createElement('a');
    a.href = u; a.download = name; a.rel = 'noopener'; D.body.appendChild(a); a.click(); a.parentNode.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(u); }, 30000);
  }
  // 휴대폰은 공유 창(카톡·사진 저장), PC 는 내려받기
  function shareOrSave(blob, name, title) {
    var f = typeof File === 'function' ? new File([blob], name, { type: blob.type }) : null;
    if (MOBILE && f && NAV.canShare && NAV.canShare({ files: [f] })) {
      return NAV.share({ files: [f], title: title || '' }).then(function () { return 'shared'; }, function (e) {
        if (e && e.name === 'AbortError') return 'cancel';
        download(blob, name); return 'saved';
      });
    }
    download(blob, name);
    return Promise.resolve('saved');
  }

  /* ---------- 캘린더 (.ics — 아이폰·안드로이드·PC 캘린더 모두) ---------- */
  function icsText(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1'); }
  function fold(line) { var out = ''; while (line.length > 70) { out += line.slice(0, 70) + '\r\n '; line = line.slice(70); } return out + line; }
  // 한국 시각(YYYY-MM-DD, HH:MM) → UTC 'YYYYMMDDTHHMMSSZ'
  function utc(date, hm, plusDays) {
    var d = String(date).split('-'), t = String(hm || '00:00').split(':');
    var x = new Date(Date.UTC(+d[0], +d[1] - 1, +d[2] + (plusDays || 0), +t[0] - 9, +t[1] || 0));
    return x.getUTCFullYear() + pad(x.getUTCMonth() + 1) + pad(x.getUTCDate()) + 'T' + pad(x.getUTCHours()) + pad(x.getUTCMinutes()) + '00Z';
  }
  function span(ev) {   // [시작, 끝] (시작 시각이 없으면 null = 하루 종일). 끝이 시작보다 이르면 다음 날, 없으면 3시간
    if (!/^\d{1,2}:\d{2}$/.test(ev.start || '')) return null;
    var end = /^\d{1,2}:\d{2}$/.test(ev.end || '') ? ev.end : '';
    if (!end) { var t = ev.start.split(':'), hh = +t[0] + 3; return [utc(ev.date, ev.start), utc(ev.date, pad(hh % 24) + ':' + t[1], hh >= 24 ? 1 : 0)]; }
    return [utc(ev.date, ev.start), utc(ev.date, end, end <= ev.start ? 1 : 0)];
  }
  function dayAfter(date) { var d = String(date).split('-'), x = new Date(Date.UTC(+d[0], +d[1] - 1, +d[2] + 1)); return x.getUTCFullYear() + pad(x.getUTCMonth() + 1) + pad(x.getUTCDate()); }
  function icsString(ev) {
    var sp = span(ev), stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//jammanbo//meeting//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + String(ev.uid || ev.date + '-' + hash(ev.title)).replace(/[^\w.-]/g, '') + '@jammanbo', 'DTSTAMP:' + stamp];
    if (sp) L.push('DTSTART:' + sp[0], 'DTEND:' + sp[1]);
    else L.push('DTSTART;VALUE=DATE:' + String(ev.date).replace(/-/g, ''), 'DTEND;VALUE=DATE:' + dayAfter(ev.date));
    L.push('SUMMARY:' + icsText(ev.title));
    if (ev.place) L.push('LOCATION:' + icsText(ev.place));
    var desc = [ev.note, ev.url].filter(Boolean).join('\n');
    if (desc) L.push('DESCRIPTION:' + icsText(desc));
    if (/^https:\/\//.test(ev.url || '')) L.push('URL:' + ev.url);
    if (sp) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(ev.title), 'TRIGGER:-PT2H', 'END:VALARM');   // 2시간 전 알림
    L.push('END:VEVENT', 'END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }
  function ics(ev) {
    var text = icsString(ev), name = String(ev.file || '잠만보_모임').replace(/[\\/:*?"<>|]/g, '') + '.ics';
    // 아이폰 사파리: 이 주소를 열면 바로 '캘린더에 추가' 창이 뜸 (파일 받기 대신)
    if (IOS) { W.location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(text); return; }
    download(new Blob([text], { type: 'text/calendar;charset=utf-8' }), name);
  }
  function gcal(ev) {
    var sp = span(ev), dates = sp ? sp[0] + '/' + sp[1] : String(ev.date).replace(/-/g, '') + '/' + dayAfter(ev.date);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(ev.title || '') + '&dates=' + dates +
      (ev.place ? '&location=' + encodeURIComponent(ev.place) : '') + '&details=' + encodeURIComponent([ev.note, ev.url].filter(Boolean).join('\n')) + '&ctz=Asia/Seoul';
  }

  /* ---------- 화면 → 이미지 (vendor/snapdom.js, 처음 쓸 때만 읽음) ---------- */
  var snapP = null;
  function loadSnap() {
    if (W.snapdom) return Promise.resolve(W.snapdom);
    if (snapP) return snapP;
    snapP = new Promise(function (ok, bad) {
      var s = D.createElement('script');
      s.src = BASE + 'vendor/snapdom.js?v=3.3.3';
      s.onload = function () { if (W.snapdom) ok(W.snapdom); else { snapP = null; bad(new Error('이미지 도구를 불러오지 못했어요')); } };
      s.onerror = function () { snapP = null; bad(new Error('이미지 도구를 불러오지 못했어요')); };
      D.head.appendChild(s);
    });
    return snapP;
  }
  function capture(el, name, opt) {
    opt = opt || {};
    if (!el) return Promise.reject(new Error('저장할 화면을 찾지 못했어요'));
    return loadSnap().then(function (snap) {
      // 스크롤 상자(창)는 잠깐 펼쳐서 전체를 찍음
      var keep = el.scrollHeight > el.clientHeight + 2 ? { mh: el.style.maxHeight, ov: el.style.overflow, h: el.style.height } : null;
      if (keep) { el.style.maxHeight = 'none'; el.style.overflow = 'visible'; el.style.height = 'auto'; }
      var bg = opt.bg || W.getComputedStyle(el).backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') bg = W.getComputedStyle(D.body).backgroundColor || '#ffffff';
      var done = function () { if (keep) { el.style.maxHeight = keep.mh; el.style.overflow = keep.ov; el.style.height = keep.h; } };
      return snap(el, { scale: 2, backgroundColor: bg, exclude: opt.exclude || '[data-nocap]', excludeMode: 'remove' })   // 버튼 등은 빼고
        .then(function (r) { done(); return r.toBlob({ format: 'png' }); }, function (e) { done(); throw e; });
    }).then(function (blob) {
      return shareOrSave(blob, String(name || '잠만보').replace(/[\\/:*?"<>|]/g, '') + '.png', opt.title);
    });
  }

  W.JMB_FX = { avatar: avatar, haptic: haptic, hapticOn: hapticOn, setHaptic: setHaptic, confetti: confetti, ics: ics, icsString: icsString, gcal: gcal, capture: capture, shareOrSave: shareOrSave };
})(window);
