/* 잠만보 미니게임 목록 games.js v1 — 한 곳에서 관리 (extras.js 의 메뉴 · 홈 카드, arcade/ 오락실이 같이 씀)
 * window.JMB_GAME_LIST(ROOT) → 게임 배열. 새 미니게임은 여기에 한 줄 + sw.js SKIP_DIRS + config.js version
 *   cat   : card 카드 · 보드 / party 모임에서 / brain 두뇌 · 퍼즐 / action 손맛 / tool 도구 (오락실 분류)
 *   dev   : 개발자 계정(설정 '개발자계정')일 때만 메뉴에 보임 = 공개 전 (주소로는 열림). 공개할 때 지움
 *   admin : 운영진까지 보임
 *   beta  : 테스트 사이트에서만 보임 (운영 사이트 /jammanbo/ 에서는 숨김) — 운영에 공개할 때 지움
 *   ext   : 외부 사이트 (새 창 ↗)   home:false : 홈 카드에는 안 보임   isNew : 'NEW' 표시 (YYYY-MM-DD 까지)
 *   ?reset: 예전 서비스 워커(미니게임 폴더를 모르는 버전)를 거치지 않고 열기 — 각 게임 화면이 주소에서 지움
 */
window.JMB_GAME_LIST = function (ROOT) {
  var PROD = /^\/jammanbo\/$/.test(ROOT);
  return [
    // 오락실: 모든 미니게임 · 내 기록 · 모임 랭킹을 한 화면에 (hub: 게임이 아니라 모아 보는 곳)
    { id: 'arcade', hub: true, beta: true, href: ROOT + 'arcade/?reset', emoji: '🕹️', name: '오락실', desc: '미니게임 전체 · 내 기록 · 이번 주 모임 랭킹', bg: 'linear-gradient(135deg,#edf1ff,#dbe4ff)', bgDark: 'linear-gradient(135deg,#1f2747,#27325c)' },
    { id: 'tichu', cat: 'card', href: ROOT + 'tichu/?reset', emoji: '🃏', name: '티츄', desc: '2 대 2 카드게임 · AI 연습', bg: 'linear-gradient(135deg,#fff4e6,#ffe8cc)', bgDark: 'linear-gradient(135deg,#3a2a12,#4a3315)' },
    { id: 'mighty', cat: 'card', beta: true, isNew: '2026-12-31', href: ROOT + 'mighty/?reset', emoji: '♠️', name: '마이티', desc: '5인 트릭테이킹 · AI 4명과 연습', bg: 'linear-gradient(135deg,#e7f5ff,#d0ebff)', bgDark: 'linear-gradient(135deg,#12283d,#173450)' },
    { id: 'semantle', cat: 'brain', href: ROOT + 'semantle/?reset', emoji: '🔤', name: '꼬맨틀', desc: '매일 하나, 뜻이 가까운 단어로 찾는 비밀 단어 · 모임 순위', bg: 'linear-gradient(135deg,#fff0f6,#fcc2d7)', bgDark: 'linear-gradient(135deg,#3d1528,#4f1c34)' },
    { id: 'kodle', cat: 'brain', beta: true, isNew: '2026-12-31', href: ROOT + 'kodle/?reset', emoji: '🟩', name: '꼬들', desc: '매일 하나, 두 글자 단어를 자모 색깔로 맞히기 · 6번 기회', bg: 'linear-gradient(135deg,#ebfbee,#b2f2bb)', bgDark: 'linear-gradient(135deg,#12301f,#1b4a2c)' },
    { id: 'rogue', cat: 'brain', beta: true, isNew: '2026-12-31', href: ROOT + 'rogue/?reset', emoji: '🎲', name: '잠만보 던전', desc: '주사위 로그라이크 · 한 판 10분', bg: 'linear-gradient(135deg,#f3f0ff,#e5dbff)', bgDark: 'linear-gradient(135deg,#2a1f47,#36295e)' },
    { id: 'jumprope', cat: 'action', beta: true, isNew: '2026-12-31', href: ROOT + 'jumprope/?reset', emoji: '🪢', name: '단체 줄넘기', desc: '타이밍 점프 · 혼자 또는 한 기기로 여럿이', bg: 'linear-gradient(135deg,#ecfdf3,#d3f9d8)', bgDark: 'linear-gradient(135deg,#12301f,#17402a)' },
    { id: 'bingo', cat: 'party', beta: true, isNew: '2026-12-31', href: ROOT + 'bingo/?reset', emoji: '🎱', name: '빙고', desc: '모임 빙고 · AI 대결 · 주제 빙고', bg: 'linear-gradient(135deg,#fff9db,#ffec99)', bgDark: 'linear-gradient(135deg,#3b3010,#4a3c12)' },
    { id: 'roulette', cat: 'party', href: ROOT + 'roulette/?reset', emoji: '🎯', name: '순서 룰렛', desc: '구슬로 순서 · 당첨자 정하기', bg: 'linear-gradient(135deg,#e7f5ff,#dbe4ff)', bgDark: 'linear-gradient(135deg,#142447,#1d2f5e)' },
    { id: 'toolbox', cat: 'tool', beta: true, isNew: '2026-12-31', href: ROOT + 'toolbox/?reset', emoji: '🧰', name: '모임 도구함', desc: '점수판 · 주사위 · 동전 · 팀 나누기 · 순서', bg: 'linear-gradient(135deg,#e6fcf5,#c3fae8)', bgDark: 'linear-gradient(135deg,#0f2f27,#134235)' },
    { id: 'timer', cat: 'tool', href: ROOT + 'timer/?reset', emoji: '⏱️', name: '타이머', desc: '체스 클락 · 턴 타이머 · 모래시계', bg: 'linear-gradient(135deg,#fff0f6,#ffdeeb)', bgDark: 'linear-gradient(135deg,#3d1528,#4f1c34)' },
    { id: 'sound', cat: 'tool', dev: true, href: ROOT + 'sound/?reset', emoji: '🔊', name: '사운드보드', desc: '대회 · 머더미스터리 · 할로윈 BGM · 효과음', bg: 'linear-gradient(135deg,#fff9db,#ffec99)', bgDark: 'linear-gradient(135deg,#3b3010,#4a3c12)' },
    { id: 'aging', cat: 'action', dev: true, href: ROOT + 'aging/?reset', emoji: '🕹️', name: '에이징 커브 검사', desc: '미니게임으로 재는 게임 피지컬 나이 · 주 1회 기록', bg: 'linear-gradient(135deg,#fff4e6,#ffd8a8)', bgDark: 'linear-gradient(135deg,#3a2a12,#4a3315)' },
    { id: 'map', cat: 'tool', href: ROOT + 'map/?reset', emoji: '📍', name: '장소 지도', desc: '모임 장소 · 맛집 지도', bg: 'linear-gradient(135deg,#e6fcf5,#c3fae8)', bgDark: 'linear-gradient(135deg,#0f2f27,#134235)' },
    // 아르마니여름 디펜스 — 별도 사이트(GitHub Pages 저장소 jammanbo-defense). 카카오 로그인은 같은 출처 저장소(localStorage)를 게임이 읽어 서버에서 전용 입장권으로 바꿔 씀. 운영 사이트가 아니면 ?env=beta 로 게임이 테스트 서버를 씀
    { id: 'defense', cat: 'action', ext: true, dev: true, beta: true, href: 'https://dlwjdskfcl.github.io/jammanbo-defense/' + (PROD ? '' : '?env=beta'), emoji: '🐾', name: '아르마니여름 디펜스', desc: '랜덤 타워디펜스 · 내 기록 · 랭킹', bg: 'linear-gradient(135deg,#ecfdf3,#d3f9d8)', bgDark: 'linear-gradient(135deg,#12301f,#17402a)' },
    // 외부 사이트 — 결과는 앱의 '내 기록 > 방탈출 탱쫄'에서 기록
    { id: 'tangzzol', cat: 'party', ext: true, home: false, href: 'https://bangpot-tangzzol-test.vercel.app/test/tangzzol', emoji: '🚪', name: '방탈출 탱쫄 판별기', desc: '나는 탱일까 쫄일까? 20종 유형 테스트', bg: 'linear-gradient(135deg,#f3f0ff,#e5dbff)', bgDark: 'linear-gradient(135deg,#2a1f47,#36295e)' }
  ];
};
window.JMB_GAME_CATS = [
  { id: 'card', name: '카드 · 보드', emoji: '🃏' },
  { id: 'brain', name: '두뇌 · 퍼즐', emoji: '🧠' },
  { id: 'action', name: '손맛 · 액션', emoji: '⚡' },
  { id: 'party', name: '모임에서', emoji: '🎉' },
  { id: 'tool', name: '도구', emoji: '🧰' }
];
