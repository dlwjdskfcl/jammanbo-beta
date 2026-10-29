/* 잠만보 에이징 커브 검사 — 점수 계산 v1 (화면 aging/score.js = 서버 잠만보/AgingScore.js, 내용이 같아야 함 — 버전_검사.py 가 확인)
 * 게임마다 잰 값(v) → 0~100점 → 피지컬 나이. 서버는 기록할 때 이 식으로 다시 계산함 (화면이 보낸 점수는 안 믿음)
 *   GAMES[id].pts = [잰 값, 점수] 꺾은선 (사이는 직선, 바깥은 끝 값)
 *   GAMES[id].lim = [최소, 최대] — 사람이 낼 수 없는 값이면 기록 안 받음
 *   나이 = 15 + (100 - 점수) × 0.5  → 100점 15살 · 70점 30살 · 50점 40살 · 0점 65살
 */
var AGING_SCORE = (function () {
  var GAMES = {
    react:  { name: '신호 반응', cat: 'speed', unit: 'ms', pts: [[170, 100], [230, 80], [290, 55], [380, 25], [500, 0]], lim: [100, 3000] },
    aim:    { name: '표적 사격', cat: 'aim', unit: '개', pts: [[6, 0], [12, 25], [18, 55], [24, 80], [30, 100]], lim: [0, 45] },
    track:  { name: '따라붙기', cat: 'aim', unit: '%', pts: [[25, 0], [45, 25], [62, 55], [78, 80], [90, 100]], lim: [0, 100] },
    rhythm: { name: '박자 맞추기', cat: 'timing', unit: 'ms', pts: [[25, 100], [50, 80], [75, 55], [105, 25], [140, 0]], lim: [5, 200] },
    smite:  { name: '막타 타이밍', cat: 'timing', unit: 'ms', pts: [[110, 100], [190, 80], [280, 55], [400, 25], [560, 0]], lim: [40, 1000] },
    stroop: { name: '색깔 함정', cat: 'brain', unit: '점', pts: [[4, 0], [9, 25], [14, 55], [19, 80], [24, 100]], lim: [-60, 45] },
    memory: { name: '순서 기억', cat: 'brain', unit: '칸', pts: [[3, 0], [5, 25], [7, 55], [9, 80], [12, 100]], lim: [0, 30] },
    cps:    { name: '광클', cat: 'speed', unit: '회/초', pts: [[3, 0], [5, 25], [7, 55], [9, 80], [11.5, 100]], lim: [0, 20] },
    dodge:  { name: '피하기', cat: 'survive', unit: '초', pts: [[4, 0], [9, 25], [14, 55], [21, 80], [30, 100]], lim: [0, 30.5] },
    combo:  { name: '키 콤보', cat: 'speed', unit: 'ms', pts: [[260, 100], [340, 80], [440, 55], [580, 25], [760, 0]], lim: [120, 5000] }
  };
  var MODES = {
    quick: { name: '빠른 검사', games: ['react', 'aim', 'smite', 'stroop', 'memory', 'cps'], minSec: 70 },
    full:  { name: '정밀 검사', games: ['react', 'aim', 'track', 'rhythm', 'smite', 'stroop', 'memory', 'cps', 'dodge', 'combo'], minSec: 140 }
  };
  var CATS = { speed: '순발력', aim: '조준', timing: '타이밍', brain: '두뇌', survive: '생존' };

  function curve(pts, v) {
    if (v <= pts[0][0]) return pts[0][1];
    for (var i = 1; i < pts.length; i++) {
      if (v <= pts[i][0]) { var a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * (v - a[0]) / (b[0] - a[0]); }
    }
    return pts[pts.length - 1][1];
  }
  // 게임 하나: raw = {v: 잰 값, x: 덧붙인 값} → 0~100 (정수)
  function gameScore(id, raw) {
    var g = GAMES[id]; if (!g || !raw || typeof raw.v !== 'number' || !isFinite(raw.v)) return 0;
    var s = curve(g.pts, raw.v);
    if (id === 'react') s -= 5 * Math.min(5, Math.max(0, raw.x || 0));          // 성급하게 누른 횟수
    if (id === 'aim') s *= 0.6 + 0.4 * Math.min(1, Math.max(0, raw.x == null ? 1 : raw.x));   // 정확도
    return Math.max(0, Math.min(100, Math.round(s)));
  }
  function ageOf(score) { return Math.round(15 + (100 - score) * 0.5); }
  function valid(id, raw) { var g = GAMES[id]; return !!g && raw && typeof raw.v === 'number' && isFinite(raw.v) && raw.v >= g.lim[0] && raw.v <= g.lim[1]; }

  // 유형 · 병명 · 추천 장르 (재미용)
  var TYPES = {
    allround: ['👑', '올라운더형', '뭘 시켜도 잘하는 사기캐. 친구들이 같이 안 하려 함', '배틀로얄 · 대전 액션 · 아무거나'],
    speed:    ['⚡', '반사신경 괴물형', '손이 머리보다 먼저 나감. 일단 누르고 생각함', '격투 게임 · 리듬 액션 · 순발력 파티게임'],
    aim:      ['🎯', 'FPS 저격수형', '마우스 끝에 영혼이 있음. 헤드만 노리는 편', 'FPS · 슈팅 · 다트'],
    timing:   ['🥁', '박자 장인형', '0.1초를 기다릴 줄 아는 사람. 막타는 내 것', '리듬 게임 · MOBA · 타이밍 액션'],
    brain:    ['🧠', '보드게임 전략가형', '손은 몰라도 머리는 쌩쌩. 잠만보 테이블의 브레인', '보드게임 · 퍼즐 · 전략 시뮬레이션'],
    survive:  ['🛡️', '탄막 생존자형', '절대 안 죽음. 끝까지 살아남는 바퀴벌레 체질', '로그라이크 · 탄막 슈팅 · 서바이벌'],
    veteran:  ['🧓', '노련한 베테랑형', '손은 느려졌지만 경험과 꼼수로 이김', '턴제 전략 · 카드 게임 · 보드게임'],
    healing:  ['🍵', '힐링 게이머형', '승패보다 분위기. 이기면 좋고 아님 말고', '힐링 게임 · 파티 게임 · 협력 보드게임']
  };
  var DIAG = [   // [나이 이하, 병명, 한마디]
    [19, '피지컬 과다 분비증', '손가락이 아직 성장 중. 부럽다'],
    [24, '전성기 진행형', '지금이 바로 리즈 시절. 랭크 올릴 때는 지금'],
    [29, '아직 쌩쌩 증후군', '에이징 커브? 그게 뭔데 먹는 건가요'],
    [34, '에이징 커브 입구 의심', '커브가 저 멀리 보이기 시작함. 스트레칭 권장'],
    [39, '손목 관절 노화 초기', '한 판 하고 손목 한 번 돌리기'],
    [49, '반응속도 만성 저하', '신호가 와도 일단 한 번 생각함. 그래도 머리는 좋다'],
    [59, '게임 화석 진행 중', '추억의 게임 얘기가 길어지는 단계'],
    [999, '전설의 고인물 판정', '박물관에 손 모양 본을 떠 둬야 함']
  ];
  function profile(scores) {   // scores = {게임id: 점수}
    var ids = Object.keys(scores).filter(function (k) { return GAMES[k]; });
    var total = ids.length ? Math.round(ids.reduce(function (s, k) { return s + scores[k]; }, 0) / ids.length) : 0;
    var cat = {}, cnt = {};
    ids.forEach(function (k) { var c = GAMES[k].cat; cat[c] = (cat[c] || 0) + scores[k]; cnt[c] = (cnt[c] || 0) + 1; });
    var keys = Object.keys(cat); keys.forEach(function (c) { cat[c] = Math.round(cat[c] / cnt[c]); });
    keys.sort(function (a, b) { return cat[b] - cat[a]; });
    var hi = cat[keys[0]], lo = cat[keys[keys.length - 1]], type;
    if (hi - lo < 12) type = total >= 68 ? 'allround' : total < 40 ? 'healing' : keys[0];
    else if (cat.brain != null && cat.speed != null && cat.brain - cat.speed >= 25) type = 'veteran';
    else type = keys[0];
    var age = ageOf(total), d = DIAG.filter(function (x) { return age <= x[0]; })[0];
    var T = TYPES[type];
    return { score: total, age: age, cats: cat, type: type, typeIcon: T[0], typeName: T[1], typeDesc: T[2], genre: T[3], diag: d[1], diagNote: d[2] };
  }
  return { GAMES: GAMES, MODES: MODES, CATS: CATS, TYPES: TYPES, gameScore: gameScore, ageOf: ageOf, valid: valid, profile: profile };
})();
