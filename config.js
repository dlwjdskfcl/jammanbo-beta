/* 잠만보 설정 — 운영(jammanbo)·테스트(jammanbo-beta)·내 PC(localhost) 모두 이 파일 하나를 그대로 씁니다.
 * 주소를 보고 어느 환경인지 스스로 고릅니다. (비밀 값은 여기 넣지 마세요: Client Secret · SESSION_SECRET 은 Apps Script 스크립트 속성에만)
 *
 *  환경      열리는 주소                                      쓰는 Apps Script 배포
 *  prod     https://dlwjdskfcl.github.io/jammanbo/           PROD (지금 쓰는 배포)
 *  beta     https://dlwjdskfcl.github.io/jammanbo-beta/      BETA (같은 프로젝트의 '테스트' 배포 — 새 버전을 먼저 올려 확인하는 곳)
 *  local    http://localhost:8080/                           BETA
 */
var JMB_API_PROD = 'https://script.google.com/macros/s/AKfycbwvE4TAy7rTGJe2FPIHh-norBPsZ_7oY5Cb8tQKEd53hDhXaUIVF4MGPL6Tb4pdEFFN/exec';
var JMB_API_BETA = 'https://script.google.com/macros/s/AKfycbwbDyYxw__R89IxnfekTwERd5xKK5y54h_6YcVNBYZLdg6K1U4n98hdoBh7OiIVUBia/exec';   // Apps Script → 배포 관리 → 새 배포(설명: 테스트)의 웹 앱 URL. 비워 두면 PROD 를 씀

var JMB_ENV = !/github\.io$/.test(location.hostname) ? 'local'
            : /^\/jammanbo\//.test(location.pathname) ? 'prod' : 'beta';
var JMB_API = (JMB_ENV === 'prod' || JMB_API_BETA.indexOf('YOUR_') === 0) ? JMB_API_PROD : JMB_API_BETA;

window.JMB_CONFIG = {
  version: '1.5.0',   // 바꾸면 auth.js/auth.css/router.js/extras.js/theme.css 캐시가 새로 받아짐
  env: JMB_ENV,       // prod 가 아니면 화면 왼쪽 아래 'TEST' 표시 + 기기 저장 칸을 따로 씀
  api: JMB_API,
  kakaoApi: JMB_API,
  /* 카카오 REST API 키 (공개되어도 안전한 값: 등록한 Redirect URI 에서만 동작) */
  kakaoRestKey: '3b96a1e29cf354319dfc02ac4ffd77b7'
};
