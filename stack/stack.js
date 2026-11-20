/* 여러 장 합성 — 계산 부분 (화면 index.html 과 node 시험이 같이 씀)
 * 흐름: 기준 사진 준비(prepareRef) → 사진마다 위치 맞추기(alignFrame) → 큰 판에 뿌려 쌓기(accumulate) → 평균 · 흐림 판(finish) → 밝기 · 선명도 입혀 그리기(render)
 * 위치 맞추기: 줄인 그림으로 전체 이동을 찾고 → 칸(타일)마다 ±몇 픽셀 다시 찾고 → 소수점 아래까지 다듬음(Lucas-Kanade)
 * 쌓기: 사진의 픽셀을 '기준 사진의 어느 자리인지' 소수점까지 계산해 출력 판(1~2배)의 이웃 4칸에 나눠 더함. 손떨림으로 사진마다 반 픽셀씩 어긋난 것이 해상도를 올려 줌 */
(function (root) {
  'use strict';
  function clampi(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function meanLum(rgba, w, h) {
    var s = 0, n = 0, i, len = w * h * 4;
    for (i = 0; i < len; i += 68) { s += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]; n++; }
    return n ? s / n : 0;
  }
  function toGray(rgba, w, h, gain) {
    var n = w * h, g = new Float32Array(n), i, j;
    for (i = 0, j = 0; i < n; i++, j += 4) g[i] = (0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]) * gain;
    return g;
  }
  function half(s) {
    var w = s.w >> 1, h = s.h >> 1, d = new Float32Array(w * h), sw = s.w, sd = s.d, x, y, o = 0, r;
    for (y = 0; y < h; y++) { r = 2 * y * sw; for (x = 0; x < w; x++, r += 2) d[o++] = (sd[r] + sd[r + 1] + sd[r + sw] + sd[r + sw + 1]) * 0.25; }
    return { d: d, w: w, h: h };
  }
  // [0] = 원래 크기, 뒤로 갈수록 절반씩. 짧은 변이 80 이하가 되면 멈춤
  function pyramid(g, w, h) {
    var p = [{ d: g, w: w, h: h }];
    while (p.length < 7 && Math.min(p[p.length - 1].w, p[p.length - 1].h) > 80) p.push(half(p[p.length - 1]));
    return p;
  }
  // 살짝 흐리게(1-2-1) — 소수점 다듬기가 잡음 · 아주 잔 무늬에 덜 속게
  function smooth(P) {
    var w = P.w, h = P.h, s = P.d, t = new Float32Array(w * h), o = new Float32Array(w * h), x, y, k;
    for (y = 0; y < h; y++) { k = y * w; t[k] = s[k]; t[k + w - 1] = s[k + w - 1]; for (x = 1; x < w - 1; x++) t[k + x] = 0.25 * (s[k + x - 1] + s[k + x + 1]) + 0.5 * s[k + x]; }
    for (x = 0; x < w; x++) { o[x] = t[x]; o[(h - 1) * w + x] = t[(h - 1) * w + x]; }
    for (y = 1; y < h - 1; y++) { k = y * w; for (x = 0; x < w; x++) o[k + x] = 0.25 * (t[k + x - w] + t[k + x + w]) + 0.5 * t[k + x]; }
    return o;
  }
  // 잡음 크기 어림 (Immerkaer: 가장자리에 덜 속는 3x3 값)
  function noiseSigma(P) {
    var w = P.w, h = P.h, d = P.d, s = 0, n = 0, x, y, i, v, step = Math.max(1, Math.floor(Math.sqrt(w * h / 60000)));
    for (y = 1; y < h - 1; y += step) for (x = 1; x < w - 1; x += step) {
      i = y * w + x;
      v = d[i - w - 1] - 2 * d[i - w] + d[i - w + 1] - 2 * d[i - 1] + 4 * d[i] - 2 * d[i + 1] + d[i + w - 1] - 2 * d[i + w] + d[i + w + 1];
      s += v < 0 ? -v : v; n++;
    }
    return n ? Math.sqrt(Math.PI / 2) / 6 * s / n : 0;
  }

  function sadShift(R, F, ox, oy, step) {
    var w = R.w, h = R.h, x0 = Math.max(0, -ox), x1 = Math.min(w, w - ox), y0 = Math.max(0, -oy), y1 = Math.min(h, h - oy), s = 0, n = 0, x, y, a, b, rd = R.d, fd = F.d, v;
    for (y = y0; y < y1; y += step) { a = y * w; b = (y + oy) * w + ox; for (x = x0; x < x1; x += step) { v = rd[a + x] - fd[b + x]; s += v < 0 ? -v : v; n++; } }
    return n ? s / n : 1e9;
  }
  // 전체 이동: 가장 작은 그림에서 ±8, 한 단계 커질 때마다 ±1. stopL 단계의 픽셀 단위로 돌려줌
  function globalShift(RP, FP, stopL) {
    var L = RP.length - 1, dx = 0, dy = 0, l, rad, ox, oy, c, best, bx, by, step;
    for (l = L; l >= stopL; l--) {
      if (l < L) { dx *= 2; dy *= 2; }
      rad = l === L ? 8 : 1; step = Math.max(1, Math.floor(Math.sqrt(RP[l].w * RP[l].h / 20000)));
      best = 1e18; bx = dx; by = dy;
      for (oy = dy - rad; oy <= dy + rad; oy++) for (ox = dx - rad; ox <= dx + rad; ox++) {
        c = sadShift(RP[l], FP[l], ox, oy, step);
        if (c < best) { best = c; bx = ox; by = oy; }
      }
      dx = bx; dy = by;
    }
    return [dx, dy];
  }
  function tileSad(R, F, tx, ty, ts, ox, oy, step) {
    var w = R.w, h = R.h, rd = R.d, fd = F.d, s = 0, x, y, yy, xx, a, b, v, x1 = Math.min(w, tx + ts), y1 = Math.min(h, ty + ts);
    for (y = ty; y < y1; y += step) {
      yy = clampi(y + oy, 0, h - 1); a = y * w; b = yy * w;
      for (x = tx; x < x1; x += step) { xx = x + ox; if (xx < 0) xx = 0; else if (xx >= w) xx = w - 1; v = rd[a + x] - fd[b + xx]; s += v < 0 ? -v : v; }
    }
    return s;
  }
  // 칸 번호(i,j) → 이동량의 1차식. 믿을 칸이 6개 미만이거나 한 줄로만 있으면 null
  function fitAffine(DX, DY, IN, nx, ny) {
    var n = nx * ny, c, i, j, m = 0, Sx = 0, Sy = 0, Sxx = 0, Sxy = 0, Syy = 0, Su = 0, Sxu = 0, Syu = 0, Sv = 0, Sxv = 0, Syv = 0;
    for (c = 0; c < n; c++) if (IN[c]) {
      i = c % nx; j = c / nx | 0; m++; Sx += i; Sy += j; Sxx += i * i; Sxy += i * j; Syy += j * j;
      Su += DX[c]; Sxu += i * DX[c]; Syu += j * DX[c]; Sv += DY[c]; Sxv += i * DY[c]; Syv += j * DY[c];
    }
    if (m < 6) return null;
    var det = m * (Sxx * Syy - Sxy * Sxy) - Sx * (Sx * Syy - Sxy * Sy) + Sy * (Sx * Sxy - Sxx * Sy);
    if (Math.abs(det) < 1e-6 * m * m * m) return null;
    function solve(b0, b1, b2) {
      return [(b0 * (Sxx * Syy - Sxy * Sxy) - Sx * (b1 * Syy - Sxy * b2) + Sy * (b1 * Sxy - Sxx * b2)) / det,
        (m * (b1 * Syy - b2 * Sxy) - b0 * (Sx * Syy - Sxy * Sy) + Sy * (Sx * b2 - b1 * Sy)) / det,
        (m * (Sxx * b2 - Sxy * b1) - Sx * (Sx * b2 - b1 * Sy) + b0 * (Sx * Sxy - Sxx * Sy)) / det];
    }
    return solve(Su, Sxu, Syu).concat(solve(Sv, Sxv, Syv));
  }
  function median(a) { if (!a.length) return 0; var b = Array.prototype.slice.call(a).sort(function (x, y) { return x - y; }); return b[b.length >> 1]; }

  /** 기준 사진 준비. rgba = ImageData.data */
  function prepareRef(rgba, w, h) {
    var pyr = pyramid(toGray(rgba, w, h, 1), w, h);
    if (pyr.length < 2) throw new Error('사진이 너무 작아요');
    var T = Math.min(w, h) >= 720 ? 64 : 32, P1 = pyr[1], w1 = P1.w, h1 = P1.h, d = P1.d, grad1 = new Float32Array(w1 * h1), x, y, i;
    for (y = 1; y < h1 - 1; y++) for (x = 1; x < w1 - 1; x++) { i = y * w1 + x; grad1[i] = 0.5 * (Math.abs(d[i + 1] - d[i - 1]) + Math.abs(d[i + w1] - d[i - w1])); }
    return { w: w, h: h, pyr: pyr, T: T, lt: Math.min(2, pyr.length - 1), nx: Math.max(1, Math.floor(w / T)), ny: Math.max(1, Math.floor(h / T)),
      grad1: grad1, mean: meanLum(rgba, w, h), sigma: noiseSigma(pyr[0]), s0: smooth(pyr[0]) };
  }

  /** 사진 하나를 기준에 맞춤 → 칸마다 이동량 dx,dy ('기준의 p 자리 = 이 사진의 p+d 자리') */
  function alignFrame(ref, rgba) {
    var w = ref.w, h = ref.h, T = ref.T, nx = ref.nx, ny = ref.ny, lt = ref.lt, RP = ref.pyr;
    var gain = clampi(ref.mean / Math.max(1, meanLum(rgba, w, h)), 0.5, 2);
    var FP = pyramid(toGray(rgba, w, h, gain), w, h);
    var g = globalShift(RP, FP, 0), n = nx * ny, sh = 1 << lt, g0x = Math.round(g[0] / sh), g0y = Math.round(g[1] / sh);
    var DX = new Float32Array(n), DY = new Float32Array(n), REL = new Uint8Array(n), RES = new Float32Array(n);
    var R0 = ref.s0, F0 = smooth(FP[0]), lminT = 4 + 0.5 * ref.sigma * ref.sigma;   // 흐리게 한 그림에서는 잡음이 1/4 쯤
    var i, j, l, dx, dy, rad, ts, step, ox, oy, c, best, bx, by, tx, ty, it;
    for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
      tx = i * T; ty = j * T; dx = g0x; dy = g0y;
      for (l = lt; l >= 0; l--) {
        if (l < lt) { dx *= 2; dy *= 2; }
        rad = l === lt ? 2 : 1; ts = T >> l; step = l === 0 ? 2 : 1; best = 1e18; bx = dx; by = dy;
        for (oy = dy - rad; oy <= dy + rad; oy++) for (ox = dx - rad; ox <= dx + rad; ox++) {
          // 시작 값에서 멀어질수록 조금 불리하게 — 줄인 그림에서 안 보이는 잔무늬 칸이 잡음을 따라 엉뚱한 데로 가지 않게
          c = tileSad(RP[l], FP[l], tx >> l, ty >> l, ts, ox, oy, step) * (1 + (l === lt ? 0.04 : 0.02) * (Math.abs(ox - dx) + Math.abs(oy - dy)));
          if (c < best) { best = c; bx = ox; by = oy; }
        }
        dx = bx; dy = by;
      }
      // 소수점 다듬기 (4번, 픽셀은 하나 걸러). 무늬가 없는 칸(lmin 작음)은 믿지 않음
      var fdx = dx, fdy = dy, x, y, x0 = Math.max(1, tx), x1 = Math.min(w - 1, tx + T), y0 = Math.max(1, ty), y1 = Math.min(h - 1, ty + T), rel = 0, resid = 0;
      for (it = 0; it < 4; it++) {
        var Gxx = 0, Gxy = 0, Gyy = 0, bX = 0, bY = 0, cnt = 0, se = 0, p, gx, gy, e, sx, sy, ix, iy, ax, ay, q, fv;
        for (y = y0; y < y1; y += 2) {
          sy = y + fdy; if (sy < 0 || sy > h - 1) continue;
          iy = Math.floor(sy); if (iy > h - 2) iy = h - 2; ay = sy - iy;
          for (x = x0; x < x1; x += 2) {
            sx = x + fdx; if (sx < 0 || sx > w - 1) continue;
            ix = Math.floor(sx); if (ix > w - 2) ix = w - 2; ax = sx - ix;
            q = iy * w + ix;
            fv = (F0[q] * (1 - ax) + F0[q + 1] * ax) * (1 - ay) + (F0[q + w] * (1 - ax) + F0[q + w + 1] * ax) * ay;
            p = y * w + x; gx = 0.5 * (R0[p + 1] - R0[p - 1]); gy = 0.5 * (R0[p + w] - R0[p - w]); e = R0[p] - fv;
            Gxx += gx * gx; Gxy += gx * gy; Gyy += gy * gy; bX += gx * e; bY += gy * e; se += e < 0 ? -e : e; cnt++;
          }
        }
        if (cnt < T * T / 16) { rel = 0; break; }
        resid = se / cnt;
        var det = Gxx * Gyy - Gxy * Gxy, tr = Gxx + Gyy, lmin = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - det));
        if (lmin / cnt < lminT || det <= 0 || lmin < 0.08 * (tr - lmin)) { rel = 0; break; }   // 무늬 없음 · 한 방향 줄무늬뿐(어긋남을 못 정함)
        rel = 1;
        fdx += clampi((Gyy * bX - Gxy * bY) / det, -1, 1); fdy += clampi((Gxx * bY - Gxy * bX) / det, -1, 1);
      }
      c = j * nx + i; DX[c] = fdx; DY[c] = fdy; REL[c] = rel; RES[c] = resid;
    }
    // 믿을 만한 칸들로 전체 움직임(이동 + 약한 회전 · 확대)을 맞추고, 거기서 1픽셀 넘게 벗어난 칸(되풀이 무늬에 속은 곳 등)과 못 믿는 칸은 그 값으로 채움
    var rx = [], ry = [], medx, medy, relN = 0, M = null, thr, mx, my, IN = new Uint8Array(n);
    // 시작은 '사진 전체로 찾은 이동'(가장 든든함) 둘레 1.5픽셀 안의 칸들만 — 되풀이 무늬 칸이 여럿이어도 끌려가지 않음
    medx = g[0]; medy = g[1];
    for (c = 0; c < n; c++) IN[c] = REL[c] && Math.abs(DX[c] - medx) <= 1.5 && Math.abs(DY[c] - medy) <= 1.5 ? 1 : 0;
    for (it = 0; it < 4; it++) {
      M = fitAffine(DX, DY, IN, nx, ny); thr = 1;
      if (!M) { rx = []; ry = []; for (c = 0; c < n; c++) if (IN[c]) { rx.push(DX[c]); ry.push(DY[c]); } if (rx.length) { medx = median(rx); medy = median(ry); } }   // 칸이 적으면 이동만(가운데값)
      for (c = 0; c < n; c++) {
        if (M) { mx = M[0] + M[1] * (c % nx) + M[2] * (c / nx | 0); my = M[3] + M[4] * (c % nx) + M[5] * (c / nx | 0); } else { mx = medx; my = medy; }
        IN[c] = REL[c] && Math.abs(DX[c] - mx) <= thr && Math.abs(DY[c] - my) <= thr ? 1 : 0;
      }
    }
    var NX = new Float32Array(n), NY = new Float32Array(n);
    for (c = 0; c < n; c++) {
      if (IN[c]) { NX[c] = DX[c]; NY[c] = DY[c]; relN++; continue; }
      if (M) { NX[c] = M[0] + M[1] * (c % nx) + M[2] * (c / nx | 0); NY[c] = M[3] + M[4] * (c % nx) + M[5] * (c / nx | 0); } else { NX[c] = medx; NY[c] = medy; }
    }
    if (relN) { rx = []; ry = []; for (c = 0; c < n; c++) if (IN[c]) { rx.push(DX[c]); ry.push(DY[c]); } medx = median(rx); medy = median(ry); }
    // 두 사진 차이의 잡음 크기: 칸 잔차의 아래쪽 1/4 값 (무늬 · 움직임이 없는 칸 기준)
    var rs = Array.prototype.slice.call(RES).filter(function (v) { return v > 0; }).sort(function (a, b) { return a - b; });
    var sigma = rs.length ? rs[rs.length >> 2] * 1.25 : ref.sigma * 1.4;
    return { dx: NX, dy: NY, medx: medx, medy: medy, gain: gain, sigma: sigma, f1: FP[1], relFrac: relN / n, resid: rs.length ? rs[rs.length >> 1] : 0 };
  }

  // 칸 이동량을 y 줄에 맞춰 섞어 둠 (가로는 쓰는 쪽에서 섞음)
  function fieldRow(ref, al, yRef, rowDx, rowDy) {
    var T = ref.T, nx = ref.nx, ny = ref.ny, t = clampi((yRef + 0.5) / T - 0.5, 0, ny - 1), j0 = Math.floor(t), f = t - j0, j1 = Math.min(ny - 1, j0 + 1), i;
    for (i = 0; i < nx; i++) { rowDx[i] = al.dx[j0 * nx + i] * (1 - f) + al.dx[j1 * nx + i] * f; rowDy[i] = al.dy[j0 * nx + i] * (1 - f) + al.dy[j1 * nx + i] * f; }
  }
  // 픽셀을 믿을지(0~1): 절반 크기 그림에서 기준과 비교해, 잡음보다 훨씬 다르면(움직인 물체 · 잘못 맞춘 곳) 버림
  function weightMap(ref, al) {
    var R1 = ref.pyr[1], F1 = al.f1, w1 = R1.w, h1 = R1.h, rd = R1.d, fd = F1.d, g1 = ref.grad1, wm = new Float32Array(w1 * h1);
    var T = ref.T, nx = ref.nx, rowDx = new Float32Array(nx), rowDy = new Float32Array(nx), s1 = 0.5 * al.sigma;
    var cx, cy, t, i0, i1, f, ddx, ddy, sx, sy, ix, iy, ax, ay, q, rv, d, t0;
    for (cy = 0; cy < h1; cy++) {
      fieldRow(ref, al, 2 * cy + 0.5 - al.medy, rowDx, rowDy);
      for (cx = 0; cx < w1; cx++) {
        t = clampi((2 * cx + 0.5 - al.medx + 0.5) / T - 0.5, 0, nx - 1); i0 = Math.floor(t); f = t - i0; i1 = i0 + 1 < nx ? i0 + 1 : i0;
        ddx = rowDx[i0] * (1 - f) + rowDx[i1] * f; ddy = rowDy[i0] * (1 - f) + rowDy[i1] * f;
        sx = cx - ddx / 2; sy = cy - ddy / 2;
        if (sx < 0 || sy < 0 || sx > w1 - 1 || sy > h1 - 1) continue;
        ix = Math.floor(sx); if (ix > w1 - 2) ix = w1 - 2; ax = sx - ix; iy = Math.floor(sy); if (iy > h1 - 2) iy = h1 - 2; ay = sy - iy;
        q = iy * w1 + ix;
        rv = (rd[q] * (1 - ax) + rd[q + 1] * ax) * (1 - ay) + (rd[q + w1] * (1 - ax) + rd[q + w1 + 1] * ax) * ay;
        d = fd[cy * w1 + cx] - rv; if (d < 0) d = -d;
        t0 = 3 * s1 + 3 + 0.35 * g1[(ay > 0.5 ? iy + 1 : iy) * w1 + (ax > 0.5 ? ix + 1 : ix)];
        wm[cy * w1 + cx] = d <= t0 ? 1 : d >= 2 * t0 ? 0 : (2 * t0 - d) / t0;
      }
    }
    return wm;
  }

  /** 쌓을 판. scale = 출력 배율 (1 · 1.5 · 2) */
  function createAcc(ref, scale) {
    var W = Math.round(ref.w * scale), H = Math.round(ref.h * scale);
    return { scale: scale, W: W, H: H, acc: new Float32Array(W * H * 3), ws: new Float32Array(W * H), n: 0, blur: null };
  }
  /** 사진 하나를 판에 더함. al = alignFrame 결과 (기준 사진은 null). fw = 사진 전체 가중치(흐린 사진은 작게). 돌려주는 값 = 쓰인 픽셀 비율 */
  function accumulate(A, ref, rgba, al, fw) {
    var w = ref.w, h = ref.h, s = A.scale, W = A.W, H = A.H, acc = A.acc, ws = A.ws, T = ref.T, nx = ref.nx;
    var gain = al ? al.gain : 1, wm = al ? weightMap(ref, al) : null, w1 = ref.pyr[1].w, h1 = ref.pyr[1].h;
    var rowDx = new Float32Array(nx), rowDy = new Float32Array(nx), medx = al ? al.medx : 0, medy = al ? al.medy : 0;
    var x, y, k, t, i0, i1, f, px, py, wt, u, v, iu, iv, fu, fv, r, g, b, o, a, used = 0, cy, cx;
    if (fw == null) fw = 1;
    for (y = 0; y < h; y++) {
      if (al) { fieldRow(ref, al, y - medy, rowDx, rowDy); cy = y >> 1; if (cy >= h1) cy = h1 - 1; }
      k = y * w * 4;
      for (x = 0; x < w; x++, k += 4) {
        if (al) {
          cx = x >> 1; if (cx >= w1) cx = w1 - 1;
          wt = wm[cy * w1 + cx]; if (wt < 0.004) continue;
          used += wt; wt *= fw;
          t = clampi((x - medx + 0.5) / T - 0.5, 0, nx - 1); i0 = Math.floor(t); f = t - i0; i1 = i0 + 1 < nx ? i0 + 1 : i0;
          px = x - (rowDx[i0] * (1 - f) + rowDx[i1] * f); py = y - (rowDy[i0] * (1 - f) + rowDy[i1] * f);
        } else { px = x; py = y; wt = fw; used++; }
        u = (px + 0.5) * s - 0.5; v = (py + 0.5) * s - 0.5;
        iu = Math.floor(u); iv = Math.floor(v);
        if (iu < -1 || iv < -1 || iu >= W || iv >= H) continue;
        fu = u - iu; fv = v - iv;
        r = rgba[k] * gain; g = rgba[k + 1] * gain; b = rgba[k + 2] * gain;
        if (iv >= 0) {
          if (iu >= 0) { a = wt * (1 - fu) * (1 - fv); o = iv * W + iu; ws[o] += a; o *= 3; acc[o] += a * r; acc[o + 1] += a * g; acc[o + 2] += a * b; }
          if (iu + 1 < W) { a = wt * fu * (1 - fv); o = iv * W + iu + 1; ws[o] += a; o *= 3; acc[o] += a * r; acc[o + 1] += a * g; acc[o + 2] += a * b; }
        }
        if (iv + 1 < H) {
          if (iu >= 0) { a = wt * (1 - fu) * fv; o = (iv + 1) * W + iu; ws[o] += a; o *= 3; acc[o] += a * r; acc[o + 1] += a * g; acc[o + 2] += a * b; }
          if (iu + 1 < W) { a = wt * fu * fv; o = (iv + 1) * W + iu + 1; ws[o] += a; o *= 3; acc[o] += a * r; acc[o + 1] += a * g; acc[o + 2] += a * b; }
        }
      }
    }
    A.n++;
    return used / (w * h);
  }
  /** 평균을 내고(acc 가 최종 색, 0~255 실수), 선명하게 할 때 쓸 흐린 밝기 판을 만듦 */
  function finish(A) {
    var W = A.W, H = A.H, acc = A.acc, ws = A.ws, n = W * H, o, a, k, x, y, pass, passes = Math.max(1, Math.round(A.scale * 1.5));
    for (o = 0; o < n; o++) {
      a = ws[o]; k = o * 3;
      if (a > 1e-3) { acc[k] /= a; acc[k + 1] /= a; acc[k + 2] /= a; }
      else if (o > 0) { acc[k] = acc[k - 3]; acc[k + 1] = acc[k - 2]; acc[k + 2] = acc[k - 1]; }
      ws[o] = 0.299 * acc[k] + 0.587 * acc[k + 1] + 0.114 * acc[k + 2];
    }
    var B = ws, tmp = new Float32Array(Math.max(W, H));
    for (pass = 0; pass < passes; pass++) {
      for (y = 0; y < H; y++) {
        k = y * W; for (x = 0; x < W; x++) tmp[x] = B[k + x];
        for (x = 0; x < W; x++) B[k + x] = 0.25 * tmp[x > 0 ? x - 1 : 0] + 0.5 * tmp[x] + 0.25 * tmp[x < W - 1 ? x + 1 : x];
      }
      for (x = 0; x < W; x++) {
        for (y = 0; y < H; y++) tmp[y] = B[y * W + x];
        for (y = 0; y < H; y++) B[y * W + x] = 0.25 * tmp[y > 0 ? y - 1 : 0] + 0.5 * tmp[y] + 0.25 * tmp[y < H - 1 ? y + 1 : y];
      }
    }
    A.blur = B; A.ws = null;
  }
  function toneLut(shadows) {
    var lut = new Uint8ClampedArray(1021), gam = 1 / (1 + (shadows || 0)), i;
    for (i = 0; i <= 1020; i++) lut[i] = Math.round(255 * Math.pow(i / 1020, gam));
    return lut;
  }
  /** 최종 그림을 out(RGBA)에. opt = { ev: 밝기(스톱), sharp: 선명도, shadows: 어두운 곳 밝게 } */
  function render(A, out, opt) {
    var n = A.W * A.H, acc = A.acc, B = A.blur, gain = Math.pow(2, opt.ev || 0) * 4, amt = opt.sharp || 0, lut = toneLut(opt.shadows), o, k, j, r, g, b, d, v;
    for (o = 0, k = 0, j = 0; o < n; o++, k += 3, j += 4) {
      r = acc[k]; g = acc[k + 1]; b = acc[k + 2];
      d = amt * (0.299 * r + 0.587 * g + 0.114 * b - B[o]); if (d > 48) d = 48; else if (d < -48) d = -48;
      v = (r + d) * gain + 0.5 | 0; out[j] = lut[v < 0 ? 0 : v > 1020 ? 1020 : v];
      v = (g + d) * gain + 0.5 | 0; out[j + 1] = lut[v < 0 ? 0 : v > 1020 ? 1020 : v];
      v = (b + d) * gain + 0.5 | 0; out[j + 2] = lut[v < 0 ? 0 : v > 1020 ? 1020 : v];
      out[j + 3] = 255;
    }
  }
  /** 비교용: 보통 사진(RGBA)에 같은 밝기 · 어두운 곳 설정만 입힘 */
  function tone(rgba, opt) {
    var gain = Math.pow(2, opt.ev || 0) * 4, lut = toneLut(opt.shadows), i, c, v, len = rgba.length;
    for (i = 0; i < len; i += 4) for (c = 0; c < 3; c++) { v = rgba[i + c] * gain + 0.5 | 0; rgba[i + c] = lut[v > 1020 ? 1020 : v]; }
  }
  /** 사진이 얼마나 또렷한지 (작게 줄인 그림의 이웃 차이 제곱 평균) — 기준 사진 고르기 · 흐린 사진 덜 쓰기 */
  function sharpness(rgba, w, h) {
    var g = toGray(rgba, w, h, 1), s = 0, n = 0, x, y, i, a, b;
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) { i = y * w + x; a = g[i + 1] - g[i - 1]; b = g[i + w] - g[i - w]; s += a * a + b * b; n++; }
    return n ? s / n : 0;
  }

  var S = { prepareRef: prepareRef, alignFrame: alignFrame, createAcc: createAcc, accumulate: accumulate, finish: finish, render: render, tone: tone, sharpness: sharpness, VER: '0.1.0' };
  if (typeof module !== 'undefined' && module.exports) module.exports = S; else root.Stack = S;
})(this);
